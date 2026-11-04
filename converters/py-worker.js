/**
 * Functionality: execute browser Python converters and governed InputXML preflight/release jobs.
 * Parameters: one validated worker request with exact input bytes and explicit converter options.
 * Outputs: converted artifacts, structural evidence, and decoded execution logs.
 * Fallback: none for governed InputXML routes; blocked preflight returns evidence without XML/CII.
 */
import { loadPyodide } from '../vendor/pyodide/pyodide.mjs';
import {
  buildConverterWorkerResponse,
  validateConverterWorkerRequest,
} from './worker-contract.js';
import { decodeLogBatches } from './log-decoder.js';
import { buildInvocation } from './invocation-builder.js';
import { normalizeInputXmlAttributeNames, converterUsesInputXmlDialect } from './inputxml-field-adapter.js';
import { getConverterPackageWheelUrls } from './pyodide-local-packages.js';
import { buildXmlCiiSidecarExportSpec, readXmlCiiSidecarArtifacts } from './xml-cii-inputxml-sidecar-worker.js';
import { loadVerifiedInputXmlRuntime } from './inputxml-release-runtime-loader.js';
import { createRetryableAsyncCache } from './inputxml-runtime-cache.js';
import { runInputXmlPreflightJob, runInputXmlReleaseJob } from './inputxml-release-worker.js';

const PYODIDE_INDEX_URL = new URL('../vendor/pyodide/', import.meta.url).href;
const INPUTXML_RUNTIME_MANIFEST_URL = new URL('./inputxml-runtime-manifest.json', import.meta.url).href;
const INPUTXML_PREFLIGHT_CONVERTER_ID = 'inputxml_compatibility_preflight';
const INPUTXML_LEGACY_CONSUMERS = Object.freeze(new Set(['inputxml_to_cii', 'inputxml14_to_cii']));

const SCRIPT_FILE_NAMES = Object.freeze([
  'rvm_to_rev.py',
  'rev_to_pcf.py',
  'rev_to_xml.py',
  'json_to_xml.py',
  'stagedjson_to_xml.py',
  'stagedjson_to_inputxml.py',
  'stagedjson_inputxml_diagnostics.py',
  'support_restraint.py',
  'psi116_upstream_common.py',
  'psi116_contract_check.py',
  'inputxml_bookmark.py',
  'rev_to_stp.py',
  'xml_to_cii2019.py',
  'xml_to_cii2019_patched.py',
  'xml_to_cii2019_direction.py',
  'xml_to_cii2019_contracted_direction.py',
  'xml_to_cii2019_rigid_ledger.py',
  'xml_to_inputxml_debug.py',
  'xml_to_cii_inputxml_sidecar_diagnostics.py',
  'xml_to_cii2019_master_addon.py',
  'master_customization.py',
  'cii2019_section_rules.py',
  'cii_syntax_check_2019.py',
  'inputxml_to_cii2014.py',
  'inputxml_to_cii2019.py',
  'inputxml_to_cii2019_config.json',
  'cii2019_hanger_miscel_control.py',
  'cii2019_miscel_hardener.py',
  'cii2019_displmnt_sync.py',
  'cii2019_flanges_sync.py',
  'inputxml_profile_sys30_b7410250_benchmark.cii',
  'inputxml_profile_bm_cii_2019.cii',
  'pdf_to_inputxml.py',
  'pdf_to_inputxml_cii14.py',
  'pdf_to_inputxml_profiles.json',
  'pdf_inputxml_profile_bm_cii.xml',
  'rvm_attribute_to_xml.py',
  'rvm_attribute_to_xml_to_cii.py',
]);

const XML_CONTRACT_GATED_CONVERTERS = Object.freeze(new Set([
  'stagedjson_to_xml',
  'rvmattr_to_xml',
]));

const RUN_SNIPPET = `
import runpy
import sys
import traceback

exit_code = 0
sys.argv = list(job_argv)
try:
    runpy.run_path(job_script_path, run_name="__main__")
except SystemExit as exc:
    code = exc.code
    if code is None:
        exit_code = 0
    elif isinstance(code, int):
        exit_code = code
    else:
        print(code, file=sys.stderr)
        exit_code = 1
except Exception:
    traceback.print_exc()
    exit_code = 1

exit_code
`;

let _pyodidePromise = null;
const _inputXmlRuntimeCache = createRetryableAsyncCache(
  (pyodide) => loadVerifiedInputXmlRuntime(pyodide, INPUTXML_RUNTIME_MANIFEST_URL),
);
let _scriptsLoaded = false;
let _activeJobId = null;

function _toString(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function _errorToString(error) {
  return [
    _toString(error?.name),
    _toString(error?.message || error),
    _toString(error?.stack),
  ].filter(Boolean).join(' | ');
}

function _postFailure(jobId, message, logs = null) {
  try {
    self.postMessage(buildConverterWorkerResponse(
      jobId,
      false,
      null,
      logs,
      _toString(message || 'Converter worker failed.')
    ));
  } catch {}
}

function _sanitizeFileName(name) {
  const normalized = _toString(name).trim();
  if (!normalized) return 'input.dat';
  return normalized.replace(/[\/:*?"<>|]/g, '_');
}

function _extractFailureDetail(stderrLines) {
  if (!stderrLines.length) return '';
  const priorityPatterns = [/^usage:/i, /^error:/i, /^RuntimeError:/i, /^ValueError:/i, /^Exception:/i, /contract check failed/i];
  for (let i = 0; i < stderrLines.length; i += 1) {
    const line = String(stderrLines[i] || '').trim();
    if (!/^ValueError:/i.test(line)) continue;
    const detailLines = [line];
    for (let j = i + 1; j < stderrLines.length && detailLines.length < 6; j += 1) {
      const nextLine = String(stderrLines[j] || '').trim();
      if (!nextLine || /^Traceback\b/i.test(nextLine) || /^\s*File\b/i.test(nextLine)) continue;
      detailLines.push(nextLine);
    }
    return detailLines.join(' | ');
  }
  for (let i = stderrLines.length - 1; i >= 0; i -= 1) {
    const line = String(stderrLines[i] || '').trim();
    if (!line) continue;
    for (const pattern of priorityPatterns) if (pattern.test(line)) return line;
  }
  return String(stderrLines[stderrLines.length - 1] || '').trim();
}

function _inferTextMime(fileName) {
  const normalized = _toString(fileName).toLowerCase();
  if (normalized.endsWith('.json')) return 'application/json;charset=utf-8';
  if (normalized.endsWith('.xml')) return 'application/xml;charset=utf-8';
  return 'text/plain;charset=utf-8';
}

function _patchConverterScriptText(fileName, text) {
  let patched = String(text || '');

  if (fileName !== 'xml_to_cii2019_patched.py') return patched;
  const lineKeyFn = `def _line_key_from_row(row: dict[str, Any], config: dict[str, Any]) -> str:
    field_map = config.get("linelist", {}).get("fieldMap", {}) if isinstance(config.get("linelist"), dict) else {}

    def pick(key: object) -> str:
        return _row_value(row, _safe_text(key))

    def normalize(value: str) -> str:
        return re.sub(r"\s+", "", _safe_text(value).upper())

    # Robust line-list keys can be stored either directly or as a composite
    # Key1 + Key2 pair. Example: Service=D and Line number=8810274 -> D8810274.
    key1 = pick(field_map.get("lineKey1"))
    key2 = pick(field_map.get("lineKey2"))
    composite = normalize(f"{key1}{key2}")
    if composite and composite not in {"SERVICE", "LINENUMBER", "SERVICELINENUMBER", "SERVICELINENO"}: 
        return composite

    for key in [
        field_map.get("lineNoKey"), field_map.get("lineNo"), field_map.get("lineSeqNo"),
        "lineNoKey", "Line No. Key", "Line No Key", "lineNo", "lineKey", "lineSeqNo",
        "Line No", "Line Number", "PipelineReference", "ColumnX1",
    ]:
        value = pick(key)
        if value:
            return normalize(value)
    return ""

`;
  patched = patched.replace(
    /def _line_key_from_row\(row: dict\[str, Any\], config: dict\[str, Any\]\) -> str:\n[\s\S]*?\n\n(?=def _matching_linelist_rows)/,
    lineKeyFn,
  );
  const mappedFn = `def _mapped_process_value(line_key: str, config: dict[str, Any], field: str, fallbacks: list[str]) -> str:
    overrides = config.get("overrides", {}) if isinstance(config.get("overrides"), dict) else {}
    process_overrides = overrides.get("processData", {}) if isinstance(overrides.get("processData"), dict) else {}
    override_row = process_overrides.get(line_key) or process_overrides.get(_safe_text(line_key).upper())
    if isinstance(override_row, dict) and _safe_text(override_row.get(field)):
        return _safe_text(override_row.get(field))

    field_map = config.get("linelist", {}).get("fieldMap", {}) if isinstance(config.get("linelist"), dict) else {}
    keys = [_safe_text(field_map.get(field)) if isinstance(field_map, dict) else "", field, field.upper(), *fallbacks]
    values: list[str] = []
    for row in _matching_linelist_rows(line_key, config):
        for key in keys:
            value = _row_value(row, key)
            if value and value.strip() not in {"-", "--"}:
                values.append(value)
                break
    numeric_values = [_numeric_token(value) for value in values if _numeric_token(value)]
    if numeric_values:
        return numeric_values[-1] if field in {"t3", "densityMixed", "hydroPressure"} else numeric_values[0]
    return values[0] if values else ""

`;
  patched = patched.replace(
    /def _mapped_process_value\(line_key: str, config: dict\[str, Any\], field: str, fallbacks: list\[str\]\) -> str:\n[\s\S]*?\n\n(?=def _branch_nodes)/,
    mappedFn,
  );
  return patched;
}

async function _getPyodide() {
  if (!_pyodidePromise) _pyodidePromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  return _pyodidePromise;
}

async function _ensureInputXmlRuntime(pyodide) {
  return await _inputXmlRuntimeCache.get(pyodide);
}

async function _installLocalPythonPackages(pyodide) {
  await pyodide.loadPackage(getConverterPackageWheelUrls(PYODIDE_INDEX_URL));
}

async function _ensureScripts(pyodide) {
  if (_scriptsLoaded) return;
  // Install local Python wheels needed by converter scripts. No CDN or PyPI fallback is used.
  await _installLocalPythonPackages(pyodide);
  pyodide.FS.mkdirTree('/scripts');
  pyodide.FS.mkdirTree('/work');
  for (const fileName of SCRIPT_FILE_NAMES) {
    const url = new URL(`./scripts/${fileName}`, import.meta.url);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load converter script ${fileName}: HTTP ${response.status} ${response.statusText || ''}`);
    const rawText = await response.text();
    const text = _patchConverterScriptText(fileName, rawText);
    if (!text.trim()) throw new Error(`Converter script ${fileName} loaded as empty text.`);
    pyodide.FS.writeFile(`/scripts/${fileName}`, text, { encoding: 'utf8' });
  }
  pyodide.runPython(`
import sys
if "/scripts" not in sys.path:
    sys.path.insert(0, "/scripts")
`);
  _scriptsLoaded = true;
}

function _writeInputFile(pyodide, jobDir, fileSpec, { normalizeInputXmlDialect = false, adapterLog = null } = {}) {
  const fileName = _sanitizeFileName(fileSpec?.name);
  const path = `${jobDir}/${fileName}`;
  let bytes = new Uint8Array(fileSpec?.bytes || new ArrayBuffer(0));
  if (normalizeInputXmlDialect && bytes.length) {
    const text = new TextDecoder('utf-8').decode(bytes);
    const { xmlText, renamed } = normalizeInputXmlAttributeNames(text);
    if (renamed.length) {
      bytes = new TextEncoder().encode(xmlText);
      if (adapterLog) {
        adapterLog.push(`[inputxml-adapter] Normalized ${renamed.length} attribute name(s): ${renamed.join(', ')}`);
      }
    }
  }
  pyodide.FS.writeFile(path, bytes);
  return path;
}

async function _runPythonScript(pyodide, scriptPath, argv, stdout, stderr) {
  const exitCode = await _runPythonScriptExitCode(pyodide, scriptPath, argv);
  if (exitCode === 0) return;
  const stdoutLines = decodeLogBatches(stdout);
  const stderrLines = decodeLogBatches(stderr);
  const detail = _extractFailureDetail(stderrLines);
  throw new Error(detail ? `Converter exited with code ${exitCode}: ${detail}` : `Converter exited with code ${exitCode}. Logs: ${stdoutLines.slice(-5).join(' | ')}`);
}

async function _runPythonScriptExitCode(pyodide, scriptPath, argv) {
  pyodide.globals.set('job_script_path', scriptPath);
  pyodide.globals.set('job_argv', argv);
  const exitCode = await pyodide.runPythonAsync(RUN_SNIPPET);
  return Number(exitCode);
}

function _contractSourceKind(converterId) {
  if (converterId === 'stagedjson_to_xml') return 'stagedjson';
  if (converterId === 'rvmattr_to_xml') return 'attribute';
  return 'auto';
}

async function _runInputXml2019CiiHardener(pyodide, converterId, sourcePath, outputPath, stdout, stderr) {
  if (converterId !== 'inputxml_to_cii2019') return null;

  const argv = [
    '/scripts/cii2019_miscel_hardener.py',
    '--input',
    outputPath,
    '--output',
    outputPath,
    '--input-xml',
    sourcePath,
    '--strict',
  ];

  await _runPythonScript(
    pyodide,
    '/scripts/cii2019_miscel_hardener.py',
    argv,
    stdout,
    stderr,
  );

  return {
    script: 'cii2019_miscel_hardener.py',
    outputPath,
  };
}

async function _runInputXml2019DisplmntSync(pyodide, converterId, sourcePath, outputPath, stdout, stderr) {
  if (converterId !== 'inputxml_to_cii2019') return null;

  const argv = [
    '/scripts/cii2019_displmnt_sync.py',
    '--input',
    outputPath,
    '--output',
    outputPath,
    '--input-xml',
    sourcePath,
    '--strict',
  ];

  await _runPythonScript(
    pyodide,
    '/scripts/cii2019_displmnt_sync.py',
    argv,
    stdout,
    stderr,
  );

  return {
    script: 'cii2019_displmnt_sync.py',
    outputPath,
  };
}

async function _runInputXml2019FlangesSync(pyodide, converterId, sourcePath, outputPath, stdout, stderr) {
  if (converterId !== 'inputxml_to_cii2019') return null;

  const argv = [
    '/scripts/cii2019_flanges_sync.py',
    '--input',
    outputPath,
    '--output',
    outputPath,
    '--input-xml',
    sourcePath,
    '--strict',
  ];

  await _runPythonScript(
    pyodide,
    '/scripts/cii2019_flanges_sync.py',
    argv,
    stdout,
    stderr,
  );

  return {
    script: 'cii2019_flanges_sync.py',
    outputPath,
  };
}

async function _runContractGate(pyodide, converterId, sourcePath, outputPath, jobDir, stdout, stderr) {
  if (!XML_CONTRACT_GATED_CONVERTERS.has(converterId)) return null;
  const reportPath = `${jobDir}/${_sanitizeFileName(converterId)}_psi116_contract_report.json`;
  const argv = [
    '/scripts/psi116_contract_check.py',
    '--xml', outputPath,
    '--source-input', sourcePath,
    '--source-kind', _contractSourceKind(converterId),
    '--report', reportPath,
    '--strict',
  ];
  await _runPythonScript(pyodide, '/scripts/psi116_contract_check.py', argv, stdout, stderr);
  try {
    return pyodide.FS.readFile(reportPath, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

async function _runInputXml2019SyntaxCheck(pyodide, converterId, outputPath, jobDir, stdout, stderr) {
  if (converterId !== 'inputxml_to_cii2019') return null;

  const reportPath = `${jobDir}/inputxml_to_cii2019_syntax_report.json`;
  const argv = [
    '/scripts/cii_syntax_check_2019.py',
    '--input',
    outputPath,
    '--output',
    reportPath,
  ];

  await _runPythonScript(pyodide, '/scripts/cii_syntax_check_2019.py', argv, stdout, stderr);

  return {
    script: 'cii_syntax_check_2019.py',
    reportPath,
  };
}

async function _runXmlCiiEnrichedInputXmlExport(pyodide, input, stdout, stderr) {
  const spec = buildXmlCiiSidecarExportSpec(input);
  if (!spec) return null;
  await _runPythonScript(
    pyodide,
    '/scripts/xml_to_inputxml_debug.py',
    spec.argv,
    stdout,
    stderr,
  );
  return { script: 'xml_to_inputxml_debug.py', ...spec };
}

async function _runJob(message) {
  const converterId = _toString(message?.converterId);
  if (!converterId) throw new Error('Missing converterId.');

  const primary = (message?.inputFiles || []).find((f) => f?.role === 'primary');
  if (!primary) throw new Error('Primary input file is required.');

  const secondary = (message?.inputFiles || []).find((f) => f?.role === 'secondary');
  const options = message?.options || {};
  const pyodide = await _getPyodide();
  const requiresInputXmlRuntime = converterId === 'inputxml_to_cii2019'
    || converterId === INPUTXML_PREFLIGHT_CONVERTER_ID
    || INPUTXML_LEGACY_CONSUMERS.has(converterId);
  const inputXmlRuntime = requiresInputXmlRuntime
    ? await _ensureInputXmlRuntime(pyodide)
    : null;
  if (!inputXmlRuntime || INPUTXML_LEGACY_CONSUMERS.has(converterId)) await _ensureScripts(pyodide);

  const stdout = [];
  const stderr = [];
  pyodide.setStdout({ batched: (text) => stdout.push(text) });
  pyodide.setStderr({ batched: (text) => stderr.push(text) });

  const jobDir = `/work/job_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  pyodide.FS.mkdirTree(jobDir);

  const primaryPath = _writeInputFile(pyodide, jobDir, primary, {
    normalizeInputXmlDialect: converterUsesInputXmlDialect(converterId)
      && converterId !== 'inputxml_to_cii2019'
      && !INPUTXML_LEGACY_CONSUMERS.has(converterId),
    adapterLog: stdout,
  });
  const secondaryPath = secondary ? _writeInputFile(pyodide, jobDir, secondary) : null;
  if (converterId === INPUTXML_PREFLIGHT_CONVERTER_ID) {
    const request = options.inputXmlCompatibilityRequest;
    const result = await runInputXmlPreflightJob({
      pyodide,
      sourcePath: primaryPath,
      options: {
        inputXmlCompatibilityMode: request?.mode,
        approvedSemanticSplitId: request?.approvedSemanticSplitId || '',
      },
      converterId: request?.converterId,
      compatibilityRequest: request,
      jobDir,
      runScript: async (scriptPath, argv) => await _runPythonScriptExitCode(pyodide, scriptPath, argv),
    });
    return {
      output: result.outputs,
      logs: {
        stdout: decodeLogBatches(stdout),
        stderr: decodeLogBatches(stderr),
        argv: result.argv.slice(1),
        preflight: result.preflight,
        released: false,
      },
    };
  }
  if (converterId === 'inputxml_to_cii2019') {
    const result = await runInputXmlReleaseJob({
      pyodide,
      sourcePath: primaryPath,
      options,
      converterId,
      compatibilityRequest: options.inputXmlCompatibilityRequest,
      jobDir,
      runScript: async (scriptPath, argv) => await _runPythonScriptExitCode(pyodide, scriptPath, argv),
    });
    return {
      output: result.outputs,
      logs: {
        stdout: decodeLogBatches(stdout),
        stderr: decodeLogBatches(stderr),
        argv: result.argv.slice(1),
        preflight: result.preflight,
        released: result.released,
        runtime: {
          schema: inputXmlRuntime.manifest.schema,
          sourceRevision: inputXmlRuntime.manifest.sourceRevision,
          manifestHashSha256: inputXmlRuntime.manifest.manifestHashSha256,
          assetCount: inputXmlRuntime.assetCount,
          packageCount: inputXmlRuntime.packageCount,
        },
      },
    };
  }
  let compatibilityPreflight = null;
  let effectivePrimaryPath = primaryPath;
  if (INPUTXML_LEGACY_CONSUMERS.has(converterId)) {
    compatibilityPreflight = await runInputXmlPreflightJob({
      pyodide,
      sourcePath: primaryPath,
      options,
      converterId,
      compatibilityRequest: options.inputXmlCompatibilityRequest,
      jobDir,
      runScript: async (scriptPath, argv) => await _runPythonScriptExitCode(pyodide, scriptPath, argv),
    });
    if (!compatibilityPreflight.preflight.releaseEligible) {
      return {
        output: compatibilityPreflight.outputs,
        logs: {
          stdout: decodeLogBatches(stdout),
          stderr: decodeLogBatches(stderr),
          argv: compatibilityPreflight.argv.slice(1),
          preflight: compatibilityPreflight.preflight,
          released: false,
        },
      };
    }
    effectivePrimaryPath = `${compatibilityPreflight.preflightDir}/canonical.input.xml`;
  }
  const invocation = buildInvocation(converterId, effectivePrimaryPath, primary.name, secondaryPath, options, jobDir);

  let stagedConversionError = null;
  try {
    await _runPythonScript(pyodide, invocation.scriptPath, invocation.argv, stdout, stderr);
  } catch (error) {
    if (converterId !== 'stagedjson_to_inputxml') throw error;
    stagedConversionError = error;
  }

  if (stagedConversionError) {
    const diagnosticsName = invocation.outputName.replace(/\.xml$/i, '_stagedjson_to_inputxml_diagnostics.json');
    const diagnosticsPath = invocation.outputPath.replace(/\.xml$/i, '_stagedjson_to_inputxml_diagnostics.json');
    try {
      const diagnosticsText = pyodide.FS.readFile(diagnosticsPath, { encoding: 'utf8' });
      const diagnostics = JSON.parse(diagnosticsText);
      return {
        output: [{ name: diagnosticsName, text: diagnosticsText, mime: 'application/json;charset=utf-8' }],
        logs: {
          stdout: decodeLogBatches(stdout),
          stderr: decodeLogBatches(stderr),
          argv: invocation.argv.slice(1),
          diagnostics,
          failed: true,
          failureMessage: _errorToString(stagedConversionError),
        },
      };
    } catch {
      throw stagedConversionError;
    }
  }

  const sourcePathForHardener =
    invocation.argv[invocation.argv.indexOf('--input') + 1] || primaryPath;

  const hardenerResult = await _runInputXml2019CiiHardener(
    pyodide,
    converterId,
    sourcePathForHardener,
    invocation.outputPath,
    stdout,
    stderr,
  );

  const displmntSyncResult = await _runInputXml2019DisplmntSync(
    pyodide,
    converterId,
    sourcePathForHardener,
    invocation.outputPath,
    stdout,
    stderr,
  );

  const flangesSyncResult = await _runInputXml2019FlangesSync(
    pyodide,
    converterId,
    sourcePathForHardener,
    invocation.outputPath,
    stdout,
    stderr,
  );

  const contractReportText = await _runContractGate(
    pyodide,
    converterId,
    invocation.argv[invocation.argv.indexOf('--input') + 1] || primaryPath,
    invocation.outputPath,
    jobDir,
    stdout,
    stderr,
  );

  const syntaxCheckResult = await _runInputXml2019SyntaxCheck(
    pyodide,
    converterId,
    invocation.outputPath,
    jobDir,
    stdout,
    stderr,
  );

  const enrichedInputXmlResult = await _runXmlCiiEnrichedInputXmlExport(
    pyodide,
    {
      converterId,
      primaryPath,
      primaryName: primary.name,
      secondaryPath,
      options,
      jobDir,
      ciiOutputPath: invocation.outputPath,
    },
    stdout,
    stderr,
  );

  const stdoutLines = decodeLogBatches(stdout);
  const stderrLines = decodeLogBatches(stderr);
  const outputText = pyodide.FS.readFile(invocation.outputPath, { encoding: 'utf8' });
  const outputs = [
    { name: invocation.outputName, text: outputText, mime: _inferTextMime(invocation.outputName) },
    ...(compatibilityPreflight?.outputs || []),
  ];
  if (converterId === 'xml_to_cii') {
    // The contracted Python path writes the ledger against its actual emitted
    // CII model. Missing or corrupt sidecars must not release CII output.
    const ledgerPath = invocation.outputPath.replace(/\.cii$/i, '.rigid_ledger.json');
    const ledgerName = invocation.outputName.replace(/\.cii$/i, '.rigid_ledger.json');
    let ledgerText = '';
    try {
      ledgerText = pyodide.FS.readFile(ledgerPath, { encoding: 'utf8' });
    } catch (error) {
      throw new Error('Model Converters RIGID export blocked: Python ownership ledger missing: ' + _errorToString(error));
    }
    const ledger = JSON.parse(ledgerText);
    if (ledger.schema !== 'xml-cii-rigid-python-emission-ledger/v1'
        || ledger.authority !== 'ACTUAL_PYTHON_MODEL_AND_EMITTED_CII'
        || !Array.isArray(ledger.rows)) {
      throw new Error('Model Converters RIGID export blocked: invalid Python ownership ledger.');
    }
    outputs.push({ name: ledgerName, text: ledgerText, mime: 'application/json;charset=utf-8' });
  }
  let stagedInputXmlDiagnostics = null;
  if (converterId === 'stagedjson_to_inputxml') {
    const diagnosticsName = invocation.outputName.replace(/\.xml$/i, '_stagedjson_to_inputxml_diagnostics.json');
    const diagnosticsPath = invocation.outputPath.replace(/\.xml$/i, '_stagedjson_to_inputxml_diagnostics.json');
    try {
      const diagnosticsText = pyodide.FS.readFile(diagnosticsPath, { encoding: 'utf8' });
      stagedInputXmlDiagnostics = JSON.parse(diagnosticsText);
      outputs.push({ name: diagnosticsName, text: diagnosticsText, mime: 'application/json;charset=utf-8' });
    } catch (error) {
      stderrLines.push(`StagedJSON InputXML diagnostics sidecar unavailable: ${_errorToString(error)}`);
    }
  }
  if (contractReportText) {
    outputs.push({
      name: invocation.outputName.replace(/\.[^.]+$/, '_psi116_contract_report.json'),
      text: contractReportText,
      mime: 'application/json;charset=utf-8',
    });
  }
  let sidecarDiagnostics = null;
  if (enrichedInputXmlResult) {
    try {
      const artifacts = readXmlCiiSidecarArtifacts(pyodide, enrichedInputXmlResult);
      outputs.push(artifacts.inputXml, artifacts.diagnostics);
      sidecarDiagnostics = artifacts.diagnostics.document;
    } catch (error) {
      stderrLines.push(`XML→CII InputXML sidecar artifacts unavailable: ${_errorToString(error)}`);
    }
  }
  // inputxml_to_cii2019.py writes a "<output>.warnings.json" sidecar onto
  // the Pyodide virtual FS whenever it emits non-fatal diagnostics (via
  // _warn()), but nothing previously read it back - it was invisible to
  // the browser UI regardless of what the Python side computed. Surface it
  // both as a downloadable output (matching the contract-report pattern)
  // and as structured data the UI can render as a table.
  let ciiWarnings = [];
  const warningsPath = `${invocation.outputPath}.warnings.json`;
  try {
    const warningsText = pyodide.FS.readFile(warningsPath, { encoding: 'utf8' });
    outputs.push({
      name: `${invocation.outputName}.warnings.json`,
      text: warningsText,
      mime: 'application/json;charset=utf-8',
    });
    const parsedWarnings = JSON.parse(warningsText);
    if (Array.isArray(parsedWarnings?.warnings)) ciiWarnings = parsedWarnings.warnings;
  } catch {
    // No warnings sidecar for this run (nothing to flag) - not an error.
  }
  return {
    output: outputs,
    logs: {
      stdout: stdoutLines,
      stderr: stderrLines,
      argv: invocation.argv.slice(1),
      postprocess: [hardenerResult, displmntSyncResult, flangesSyncResult, syntaxCheckResult, enrichedInputXmlResult].filter(Boolean),
      warnings: ciiWarnings,
      diagnostics: stagedInputXmlDiagnostics,
      sidecarDiagnostics,
      preflight: compatibilityPreflight?.preflight || null,
    },
  };
}

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  if (message.type !== 'run') return;

  const jobId = message.jobId;
  _activeJobId = jobId;

  const validation = validateConverterWorkerRequest(message);
  if (!validation.ok) {
    _postFailure(jobId, validation.error);
    _activeJobId = null;
    return;
  }

  try {
    const result = await _runJob(message);
    self.postMessage(buildConverterWorkerResponse(jobId, true, result.output, result.logs, null));
  } catch (error) {
    _postFailure(jobId, _errorToString(error));
  } finally {
    _activeJobId = null;
  }
});

self.addEventListener('error', (event) => {
  const message = [
    event?.message || 'Unhandled worker error.',
    event?.filename ? `file=${event.filename}` : '',
    event?.lineno ? `line=${event.lineno}` : '',
    event?.colno ? `col=${event.colno}` : '',
    event?.error ? _errorToString(event.error) : '',
  ].filter(Boolean).join(' | ');

  if (_activeJobId !== null && _activeJobId !== undefined) _postFailure(_activeJobId, message);
});

self.addEventListener('unhandledrejection', (event) => {
  const message = `Unhandled worker promise rejection: ${_errorToString(event?.reason)}`;
  if (_activeJobId !== null && _activeJobId !== undefined) _postFailure(_activeJobId, message);
});
