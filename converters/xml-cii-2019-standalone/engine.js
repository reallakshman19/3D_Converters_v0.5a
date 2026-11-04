import { loadPyodide } from '../../vendor/pyodide/pyodide.mjs';
import { buildStandaloneCiiInvocation, outputStem } from './invocation-builder.js';
import { applyStandaloneSifFacts } from '../../tabs/xml-cii-2019-standalone/xml-cii-standalone-sif-apply.js';
import { runPsi116TopologyStage, topologyRequested } from './topology-integration.js';

const PYODIDE_INDEX_URL = new URL('../../vendor/pyodide/', import.meta.url).href;
const SCRIPT_FILE_NAMES = Object.freeze([
  'xml_to_cii2019.py',
  'xml_to_cii2019_patched.py',
  'xml_to_cii2019_direction.py',
  'xml_to_cii2019_bend_radius_policy.py',
  'xml_to_cii2019_runtime_custody.py',
  'xml_to_cii2019_rigid_ledger.py',
  'xml_to_cii2019_master_addon.py',
  'master_customization.py',
  'cii2019_section_rules.py',
  'cii_syntax_check_2019.py',
  'inputxml_to_cii2019.py',
  'inputxml_to_cii2019_config.json',
  'cii2019_hanger_miscel_control.py',
]);

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
    exit_code = 0 if code is None else (code if isinstance(code, int) else 1)
    if code is not None and not isinstance(code, int):
        print(code, file=sys.stderr)
except Exception:
    traceback.print_exc()
    exit_code = 1
exit_code
`;

const ENRICH_XML_SNIPPET = `
from pathlib import Path
import xml_to_cii2019_patched as patched
from xml_to_cii2019_bend_radius_policy import apply_bend_radius_policy
support_config = patched._load_support_config(job_support_config_json)
if job_split_condensed is not None:
    support_config["splitCondensedValveFlange"] = bool(job_split_condensed)
staged = Path(job_staged_json_path) if job_staged_json_path else None
final_xml = patched._maybe_enrich_from_staged_json(Path(job_input_path), staged, support_config)
final_xml = patched._apply_process_data_to_xml(final_xml, support_config)
policy_xml, bend_policy = apply_bend_radius_policy(final_xml, support_config, Path(job_output_path))
print("BEND_RADIUS_POLICY enabled=%s published=%s removed=%s" % (bend_policy.get("enabled"), bend_policy.get("published"), bend_policy.get("removed")))
`;

let pyodidePromise = null;
let scriptsLoaded = false;

function text(value) { return value === undefined || value === null ? '' : String(value); }
function safeName(name) { return (text(name).trim() || 'input.xml').replace(/[\/:*?"|]/g, '_'); }
function logs(values) { return values.map((line) => text(line).trimEnd()).filter(Boolean); }
function outputKindFor(sourceKind) { return sourceKind === 'inputxml' ? 'enrichedInputXML' : 'enrichedXML'; }
function enrichedNameFor(job) { const stem = outputStem(job.sourceName); return job.sourceKind === 'inputxml' ? `${stem}_enriched.input.xml` : `${stem}_enriched.xml`; }
function splitValue(job) { const v = job?.options?.splitCondensedValveFlange; return v === true || v === false ? v : null; }
function diagnostics(job, extra = {}) { return { schema: 'xml-cii-2019-workflow-diagnostics/v1', engine: 'standalone-compatibility-engine', sourceKind: job.sourceKind === 'inputxml' ? 'inputxml' : 'xml', outputMode: job.options?.outputMode || 'enriched-only', warnings: [], ...extra }; }

function emptyTopologyResult() {
  return {
    topologyFindingsText: '', topologyFindingsName: '', topologyFixPlanText: '', topologyFixPlanName: '',
    topoFixXmlText: '', topoFixXmlName: '', topoFixTransactionText: '', topoFixTransactionName: '',
    topoFixValidationText: '', topoFixValidationName: '', topoFixCommitted: false,
    ciiInputSource: 'original', topologySummary: null,
  };
}

function errorResult(job, error, logLines = [], partial = {}) {
  const sourceKind = job?.sourceKind === 'inputxml' ? 'inputxml' : 'xml';
  return {
    ok: false,
    sourceKind,
    outputKind: outputKindFor(sourceKind),
    enrichedText: text(partial.enrichedText),
    enrichedName: text(partial.enrichedName),
    ciiText: null,
    ciiName: null,
    ...emptyTopologyResult(),
    ...partial,
    diagnostics: null,
    logs: logLines,
    error: text(error?.message || error || 'Standalone engine failed.'),
  };
}

async function getPyodide() {
  if (!pyodidePromise) pyodidePromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  return pyodidePromise;
}

async function ensureScripts(pyodide) {
  if (scriptsLoaded) return;
  pyodide.FS.mkdirTree('/scripts');
  pyodide.FS.mkdirTree('/work');
  for (const fileName of SCRIPT_FILE_NAMES) {
    const url = new URL(`../scripts/${fileName}`, import.meta.url);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load standalone script ${fileName}: HTTP ${response.status}`);
    const fileText = await response.text();
    if (!fileText.trim()) throw new Error(`Standalone script ${fileName} loaded as empty text.`);
    pyodide.FS.writeFile(`/scripts/${fileName}`, fileText, { encoding: 'utf8' });
  }
  pyodide.runPython('import sys\nif "/scripts" not in sys.path:\n    sys.path.insert(0, "/scripts")');
  scriptsLoaded = true;
}

function writeTextFile(pyodide, dir, name, body) {
  const path = `${dir}/${safeName(name)}`;
  pyodide.FS.writeFile(path, text(body), { encoding: 'utf8' });
  return path;
}

async function runPythonScript(pyodide, scriptPath, argv, stdout, stderr) {
  pyodide.globals.set('job_script_path', scriptPath);
  pyodide.globals.set('job_argv', argv);
  const exitCode = await pyodide.runPythonAsync(RUN_SNIPPET);
  if (Number(exitCode) !== 0) throw new Error(`Converter exited with code ${exitCode}. ${logs(stderr).slice(-6).join(' | ')}`);
}

async function runEnrichedXml(pyodide, job, paths, jobDir, stdout) {
  const outputName = enrichedNameFor(job);
  const outputPath = `${jobDir}/${outputName}`;
  pyodide.globals.set('job_input_path', paths.inputPath);
  pyodide.globals.set('job_staged_json_path', paths.stagedJsonPath || '');
  pyodide.globals.set('job_output_path', outputPath);
  pyodide.globals.set('job_support_config_json', text(job.supportConfigJson || '{}'));
  pyodide.globals.set('job_split_condensed', splitValue(job));
  await pyodide.runPythonAsync(ENRICH_XML_SNIPPET);
  stdout.push(`Wrote ${outputName} through standalone PSI116 XML enrichment branch.`);
  return { enrichedText: pyodide.FS.readFile(outputPath, { encoding: 'utf8' }), enrichedName: outputName };
}

async function runCii(pyodide, job, paths, jobDir, stdout, stderr) {
  const invocation = buildStandaloneCiiInvocation(job, paths, jobDir);
  await runPythonScript(pyodide, invocation.scriptPath, invocation.argv, stdout, stderr);
  const ciiText = pyodide.FS.readFile(invocation.outputPath, { encoding: 'utf8' });
  const manifestPath = invocation.outputPath.replace(/\\.[^.]+$/, '.rigid_ledger.json');
  const rigidLedgerText = job.sourceKind === 'inputxml' ? '' :
    pyodide.FS.readFile(manifestPath, { encoding: 'utf8' });
  const rigidLedger = rigidLedgerText ? JSON.parse(rigidLedgerText) : null;
  if (job.sourceKind !== 'inputxml' && rigidLedger?.authority !== 'ACTUAL_PYTHON_MODEL_AND_EMITTED_CII') {
    throw new Error('Python RIGID export ledger is missing or unverified.');
  }
  return { ciiText, ciiName: invocation.outputName, argv: invocation.argv.slice(1),
    rigidLedger, rigidLedgerText,
    rigidLedgerName: rigidLedger ? invocation.outputName.replace(/\\.[^.]+$/, '.rigid_ledger.json') : '' };
}

export async function runXmlCii2019StandaloneEngine(job) {
  const sourceKind = job.sourceKind === 'inputxml' ? 'inputxml' : 'xml';
  const outputMode = ['cii-only', 'both'].includes(job.options?.outputMode) ? job.options.outputMode : 'enriched-only';
  const normalizedJob = { ...job, sourceKind, options: { ...(job.options || {}), outputMode } };
  const stdout = [];
  const stderr = [];
  const partial = { enrichedText: '', enrichedName: '', ...emptyTopologyResult() };
  try {
    const pyodide = await getPyodide();
    await ensureScripts(pyodide);
    pyodide.setStdout({ batched: (line) => stdout.push(line) });
    pyodide.setStderr({ batched: (line) => stderr.push(line) });
    const jobDir = `/work/xml_cii_standalone_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    pyodide.FS.mkdirTree(jobDir);
    const inputPath = writeTextFile(pyodide, jobDir, normalizedJob.sourceName || (sourceKind === 'inputxml' ? 'input.input.xml' : 'input.xml'), normalizedJob.sourceText);
    const stagedJsonPath = normalizedJob.stagedJsonText ? writeTextFile(pyodide, jobDir, `${outputStem(normalizedJob.sourceName)}_staged.json`, normalizedJob.stagedJsonText) : null;
    const paths = { inputPath, stagedJsonPath };
    let enrichedText = '';
    let enrichedName = '';
    let ciiText = null;
    let ciiName = null;
    let rigidLedger = null;
    let rigidLedgerText = '';
    let rigidLedgerName = '';
    const postprocess = [];

    let topology = emptyTopologyResult();
    if (topologyRequested(normalizedJob)) {
      topology = await runPsi116TopologyStage(pyodide, normalizedJob, inputPath, jobDir, stdout);
      Object.assign(partial, topology);
      postprocess.push({ branch: 'psi116-topology-sidecars', ...topology.topologySummary, findingsName: topology.topologyFindingsName, planName: topology.topologyFixPlanName });
    }

    if (outputMode !== 'cii-only') {
      if (sourceKind === 'xml') {
        const enriched = await runEnrichedXml(pyodide, normalizedJob, paths, jobDir, stdout);
        const sif = applyStandaloneSifFacts(enriched.enrichedText, 'xml', normalizedJob.sifFacts);
        enrichedText = sif.text;
        enrichedName = enriched.enrichedName;
        partial.enrichedText = enrichedText;
        partial.enrichedName = enrichedName;
        postprocess.push({ branch: 'psi116-enriched-xml', outputName: enrichedName, sifDiagnostics: sif.diagnostics });
      } else {
        enrichedText = normalizedJob.sourceText;
        enrichedName = enrichedNameFor(normalizedJob);
        partial.enrichedText = enrichedText;
        partial.enrichedName = enrichedName;
        stdout.push(`Wrote ${enrichedName} from the enriched InputXML source.`);
        postprocess.push({ branch: 'inputxml-enriched-passthrough', outputName: enrichedName });
      }
    }
    if (outputMode === 'cii-only' || outputMode === 'both') {
      const ciiPaths = { ...paths, inputPath: topology.ciiInputPath || paths.inputPath };
      const cii = await runCii(pyodide, normalizedJob, ciiPaths, jobDir, stdout, stderr);
      ciiText = cii.ciiText;
      ciiName = cii.ciiName;
      rigidLedger = cii.rigidLedger;
      rigidLedgerText = cii.rigidLedgerText;
      rigidLedgerName = cii.rigidLedgerName;
      postprocess.push({ branch: `${sourceKind}-cii`, outputName: ciiName, argv: cii.argv, inputSource: topology.ciiInputSource || 'original' });
    }
    const warnings = [];
    return {
      ok: true,
      sourceKind,
      outputKind: outputKindFor(sourceKind),
      enrichedText,
      enrichedName,
      ciiText,
      ciiName,
      rigidLedger,
      rigidLedgerText,
      rigidLedgerName,
      ...topology,
      diagnostics: diagnostics(normalizedJob, { postprocess, warnings, topology: topology.topologySummary,
        rigidLedger: rigidLedger ? { schema: rigidLedger.schema, summary: rigidLedger.summary, ciiSha256: rigidLedger.ciiSha256 } : null }),
      logs: [...logs(stdout), ...logs(stderr).map((line) => `stderr: ${line}`)],
      error: null,
    };
  } catch (error) {
    return errorResult(normalizedJob, error, [...logs(stdout), ...logs(stderr)], partial);
  }
}
