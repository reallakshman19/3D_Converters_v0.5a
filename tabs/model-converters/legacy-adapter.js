import { emit } from '../../core/event-bus.js';
import { missingPersistedXmlCiiMasters, missingPersistedXmlCiiMastersNotice } from './core/imported-master-run-guard.js';
import { selectXmlCiiMasterWorkbookSheet } from './xml-cii-workbook-sheet-selection.js';
import { state } from '../../core/state.js';
import { RuntimeEvents } from '../../contracts/runtime-events.js';
import { notify } from '../../diagnostics/notification-center.js';
import { pickImportAdapter } from '../../interchange/source/adapter-registry.js';
import { ModelConverters_3DModelConv_PreviewRenderer } from '../../converters/view/model-conv-preview-renderer.js?v=20260725-fbx-source-graph-preview-1';
import { buildInputXmlCiiGeometryPreviewProject } from './inputxml-cii-geometry-preview.js?v=20260710-inputxml-cii-geometry-preview-2';
import {
  buildFbxSourceGraphPreviewProject,
  FBX_SOURCE_GRAPH_PREVIEW_POINT_LIMIT,
} from './fbx-source-graph-preview.js';
import {
  buildConverterWorkerRequest,
  validateConverterWorkerResponse,
} from '../../converters/worker-contract.js';
import { parseRmssAttributes, parseRmssStructuralMembers } from '../../converters/rmss-attribute-parser.js';
import { rvmScopeRegex } from '../../converters/rvm-scope-pattern.js';
import { parseStpSupportMembers } from '../../parser/stp-support-parser.js';
import { getAllRules, resolveKindFromAttrs, renderSupportMapperPanel } from '../../rvm-viewer/RvmSupportMapper.js?v=20260518-support-mapper-11';
import { parseXmlCiiEnrichmentConfig } from '../../converters/xml-cii2019-core/config.js';
import { deriveLineKeyFromBranchName } from '../../converters/xml-cii2019-core/regex-line-key.js';
import { buildPipingClassIndex } from '../../converters/xml-cii2019-core/piping-class-resolver.js';
import { resolveBranchProcessData } from '../../converters/xml-cii2019-core/branch-process-resolver.js';
import { buildStagedDtxrIndex, resolveXmlCiiNodeDtxr } from '../../converters/xml-cii2019-core/dtxr-resolver.js';
import { applyXmlCiiStagedGeometryAuthority, buildXmlCiiStagedGeometryIndex, resolveXmlCiiStagedGeometryForNode } from '../../converters/xml-cii2019-core/staged-geometry-authority.js';
import { xmlCiiDtxrPsForNode, xmlCiiDtxrPosForNode, buildStagedDtxrPositionIndex, xmlCiiCalibrateDtxrPositionIndex } from '../../converters/xml-cii2019-core/dtxr-resolver.js';
import {
  collectXmlCiiZeroRigidWeightIssues,
  applyXmlCiiRigidWeightOverrides,
  xmlCiiForwardElementLengths,
  xmlCiiRigidWeightOverrideKey,
  isXmlCiiRigidNode,
  xmlCiiNumberText,
  xmlCiiRigidWeightOverrideForNode,
  xmlCiiAncestorBranchName,
  scoreXmlCiiWeightCandidates,
  buildStagedComponentIndex,
  stagedComponentForXmlNode,
  collectXmlCiiWeightMatchRows,
} from '../../converters/xml-cii2019-core/weight-match-model.js';
import {
  FIELD_RULES as _FIELD_RULES,
  DETECTION_ORDER as _DETECTION_ORDER,
  canon as _canon,
  clean as _clean,
  readRowValue as _readRowValue,
  buildColumnProbe as _buildColumnProbe,
  getAllColumnKeys as _getAllColumnKeys,
  hasAlias as _hasAlias,
  hasAny as _hasAny,
  groupsMatch as _groupsMatch,
  rejectMatch as _rejectMatch,
  isValidFieldMatch as _isValidFieldMatch,
  scoreField as _scoreField,
  shouldKeepExisting as _shouldKeepExisting,
  detectLineListFieldMap as _detectLineListFieldMap,
  computeLineNoKey as _computeLineNoKey,
  normalizeLineListRow as _normalizeLineListRow
} from '../../converters/xml-cii2019-core/linelist-mapping.js';
import { buildStagedSupportIndex, calibrateStagedSupportIndexCoordinates, xmlCiiTypeEntriesFromSupportKind, xmlCiiRestraintEntriesFromSupportMatch, xmlCiiTypeEntryFromExistingRestraint, dedupeXmlCiiRestraintEntries, applyXmlRestraints, enrichHierarchyWithMapperKinds } from '../../converters/xml-cii2019-core/support-mapping.js';
import { renderUnifiedSupportMappingTable, bindUnifiedSupportMappingTable } from './converters/xmltocii2019_helper/support-mapping-table.js?v=20260710-inputxml2019-popup-revamp-1';
import { DEFAULT_ENRICHMENT_CONFIG as _XML_COMPARE_ENRICHMENT_DEFAULTS } from '../../xml-compare/XmlCompareEnrichmentConfig.js';
import { parseInputXmlForBranchPreview, applyElementFieldEdits, FIELD_SPECS } from './converters/inputxml2019_helper/inputxml-branch-preview.js?v=20260712-inputxml2019-branch-editable-1';
import { CONVERTERS, getConverterById } from './converter-registry.js?v=20260617-basic-glb-3';
import { XML_CII_WORKFLOW_PHASES } from './WorkflowShell.js';
import { loadStoredState, saveStoredState, writePreparedStoredState, stageXmlCiiFetchedRatings, clearXmlCiiFetchedRatingsJournal, applyStagedXmlCiiFetchedRatings } from './core/config-store.js';
import { downloadOutput, arrayBufferToBase64, baseNameWithoutExtension, isRvmFileName, isAttOrTxtFileName, encodeTextUtf8, decodeTextUtf8, toFiniteNumber } from './core/output-utils.js';
import { MASTER_INPUTXML_TEMPLATE, MASTER_INPUTXML_FILE_NAME } from './master-inputxml-sample.js';
import { WorkflowModal } from './shared/WorkflowModal.js';
import { FileInputCard } from './shared/FileInputCard.js';
import { FieldMappingTable } from './shared/FieldMappingTable.js';
import { EditablePreviewTable } from './shared/EditablePreviewTable.js';
import { xmlCiiRenderPreviewPhase as xmlCiiRenderPreviewPhaseImported, xmlCiiBuildAndRenderPreview as xmlCiiBuildAndRenderPreviewImported, xmlCiiDryRunPreview } from './converters/xmltocii2019_helper/preview-renderer.js';
import { xmlCiiRenderPreviewPhase as xmlCiiRenderPreviewPhaseV7, xmlCiiBuildAndRenderPreview as xmlCiiBuildAndRenderPreviewV7 } from '../xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js';
import { armFirstXmlCiiPreviewBuild } from './workflow/preview-first-click.js';
import { xmlCiiRenderWeightMatchPhase as xmlCiiRenderWeightMatchPhaseImported, bindXmlCiiWeightMatchPhase as bindXmlCiiWeightMatchPhaseImported } from './converters/xmltocii2019_helper/weight-match-renderer.js';
import { xmlCiiRenderSupportMapperPhase as xmlCiiRenderSupportMapperPhaseImported, bindXmlCiiSupportMapperPhase as bindXmlCiiSupportMapperPhaseImported } from './converters/xmltocii2019_helper/support-types-panel.js';
import { extractXmlCiiBranchSample as _extractXmlCiiBranchSample } from './xml-cii-branch-sample-sync.js';
import { xmlCiiWorkflowParsedStagedSource } from './workflow/services/xml-cii-staged-source-service.js?v=20260625-service-1';
import { xmlCiiSetupPostRunValidation, xmlCiiRegisterPostRunCallback } from './xml-cii-workflow-runner.js?v=20260626-standalone-val-1';
import { runXmlCiiStandalonePostRunValidation } from './xml-cii-post-run-validator-standalone.js?v=20260626-standalone-val-1';


const STORAGE_KEY = 'model-converters.defaults.v1';
const INPUTXML_HEADER_DEFAULTS = Object.freeze({
  headerDateTime: '13:40:45 6 May 2026',
  headerSource: 'AVEVA PSI',
  headerVersion: '3.1.7.0 (psi2cii.exe version 3.1.0.3 (Feb 21 2024))',
  headerUserName: 'MUCE828',
  headerPurpose: 'Preliminary stress run',
  headerProjectName: 'ZAU',
  headerMdbName: '/ZAU1',
});

const INPUTXML2019_SAFE_UNITS = Object.freeze({
  numeric_lines: Object.freeze([
    '        25.4000      4.44822     0.453592     0.112985     0.112985      6.89476',
    '       0.555556     -17.7778      6.89476      6.89476 2.768000E-02 2.768000E-02',
    '   2.768000E-02      1.75127     0.112985      1.75127      1.00000      6.89476',
    '   2.540000E-02      25.4000      25.4000      25.4000',
  ]),
  text_lines: Object.freeze([
    '  SI (mm)        ',
    '  on ',
    '  mm.',
    '  N. ',
    '  Kg.',
    '  N.m.  ',
    '  N.m.. ',
    '  KPa       ',
    '  C',
    '  C',
    '  KPa       ',
    '  KPa       ',
    '  kg.cu.cm. ',
    '  kg.cu.cm. ',
    '  kg.cu.cm. ',
    '  N./cm. ',
    '  N.m./deg  ',
    '  N./cm. ',
    "  g's",
    '  Kpa       ',
    '  m. ',
    '  mm.',
    '  mm.',
    '  mm.',
  ]),
});

// XML_CII_WORKFLOW_PHASES is the canonical source from WorkflowShell.js (imported above).

// Compute absolute URLs for default master files so fetch() resolves correctly
// regardless of the current page URL (avoids issues when the page is not at /viewer/).
const _xmlCiiMasterBaseUrl = new URL('../../docs/Masters/', import.meta.url).href;
const XML_CII_SPECWISE_MASTER_PATH_DEFAULTS = Object.freeze({
  materialMapPath: 'docs/Masters/PCF_MAT_MAP.TXT',
  weightPath: 'docs/Masters/wtValveweights.json',
  pipingClassIndexPath: 'docs/Masters/SpecwisePipingClass/index.json',
  pipingClassShardFolder: 'docs/Masters/SpecwisePipingClass/',
});
const XML_CII_SPECWISE_PIPING_FIELD_MAP = Object.freeze({
  pipingClass: 'pipingClass',
  convertedBore: 'convertedBore',
  componentType: 'componentType',
  rating: 'rating',
  materialName: 'materialName',
  schedule: 'schedule',
  wallThickness: 'wallThickness',
  corrosion: 'corrosion',
  endCondition: 'endCondition',
});
const XML_CII_SPECWISE_PLACEHOLDER_ROW = Object.freeze({
  _smartMasterPlaceholder: true,
  pipingClass: '__ON_DEMAND__',
  convertedBore: '',
  wallThickness: '',
  materialName: '',
  rating: '',
  corrosion: '',
  schedule: '',
});

const XML_CII_MASTER_DEFS = Object.freeze({
  linelist: Object.freeze({
    key: 'linelist',
    title: 'Line List',
    description: 'Import the project line list and map line key, class, rating, material, process, and bore columns.',
    sectionKey: 'linelist',
    rowsKey: 'masterRows',
    fieldMapKey: 'fieldMap',
    defaultUrl: '',
    requiredFields: Object.freeze([]),
    fieldLabels: Object.freeze({
      lineSeqNo: 'Line Seq No.',
      lineKey1: 'Key 1',
      lineKey2: 'Key 2',
      pipingClass: 'Piping Class',
      rating: 'Rating',
      material: 'Material',
      convertedBore: 'Bore',
      p1: 'P1',
      hydroPressure: 'Hydro Test Pressure',
      t1: 'T1',
      t2: 'T2',
      t3: 'T3',
      insThk: 'InsThk',
      densityMixed: 'Density Mixed',
      densityGas: 'Density Gas',
      densityLiquid: 'Density Liquid',
      phase: 'Phase',
    }),
    aliases: Object.freeze({
      lineSeqNo: Object.freeze(['Line number', 'Line No', 'Line Number', 'LINE_NO', 'Seq', 'Sequence']),
      lineKey1: Object.freeze(['ColumnX1', 'LINE KEY', 'LINEKEY', 'Line Key', 'Pipeline Ref', 'PIPELINE_REF']),
      lineKey2: Object.freeze(['ColumnX2', 'Line Key 2', 'LineKey2', 'Suffix', 'Pipeline Ref 2']),
      pipingClass: Object.freeze(['PIPING_CLASS', 'Piping Class', 'Class', 'Spec', 'SPEC']),
      rating: Object.freeze(['RATING', 'Rating', 'Pressure Class']),
      material: Object.freeze(['MATERIAL', 'Material', 'Material_Name']),
      convertedBore: Object.freeze(['convertedBore', 'Converted Bore', 'DN', 'NB', 'Bore', 'Size', 'NPS']),
      p1: Object.freeze(['P1', 'Design Pr', 'Op. Pr', 'Operating Pressure', 'Design Pressure', 'P1 / Design Pressure']),
      hydroPressure: Object.freeze(['hydroPressure', 'Hydro Test Pressure', 'Hydrotest Pressure', 'Hydro Pressure', 'Hydro Pr', 'Hyd Test Pr', 'Hyd. Test Pressure', 'Test Pressure', 'TEST_PRESSURE', 'HYDRO_TEST_PRESSURE', 'Pressure Test', 'Proof Pressure', 'Hydro/Test Pressure']),
      t1: Object.freeze(['T1', 'Design Temp', 'Design Temperature', 'Op. Temp', 'Operating Temp', 'T1 (C)', 'T1 (ºC)']),
      t2: Object.freeze(['T2', 'Temp', 'Temp. C', 'Temp C', 'Temp ºC', 'Temperature', 'Temperature2', 'Temperature 2', 'T2 (C)', 'T2 (ºC)']),
      t3: Object.freeze(['T3', 'Temp Min', 'Temp Min C', 'Temp Min °C', 'Min Temp', 'Minimum Temp', 'Min', 'Temperature3', 'Temperature 3', 'T3 (C)', 'T3 (ºC)']),
      insThk: Object.freeze(['InsThk', 'Insulation', 'Ins Thk', 'Insulation thickness']),
      densityMixed: Object.freeze(['Mixed kg/m3', 'Density Mixed', 'Mixed Density', 'Density (Mixed)']),
      densityGas: Object.freeze(['Gas kg/m3', 'Density Gas', 'Gas Density', 'Density (Gas)']),
      densityLiquid: Object.freeze(['Liquid kg/m3', 'Density Liquid', 'Liquid Density', 'Density (Liquid)']),
      phase: Object.freeze(['Phase', 'Fluid Phase', 'Medium Phase']),
    }),
    autoMapOrder: Object.freeze(['lineSeqNo', 'lineKey1', 'lineKey2', 'pipingClass', 'rating', 'material', 'convertedBore', 'p1', 'hydroPressure', 't3', 't2', 't1', 'insThk', 'densityMixed', 'densityGas', 'densityLiquid', 'phase']),
  }),
  pipingClass: Object.freeze({
    key: 'pipingClass',
    title: 'Piping Class',
    description: 'Import the class master and map class + bore to wall, corrosion, material, and rating fields.',
    sectionKey: 'pipingClass',
    rowsKey: 'masterRows',
    fieldMapKey: 'fieldMap',
    defaultUrl: '',
    requiredFields: Object.freeze(['pipingClass', 'convertedBore']),
    aliases: Object.freeze({
      pipingClass: Object.freeze(['Piping Class', 'PIPING_CLASS', 'Class', 'SPEC', 'Spec']),
      convertedBore: Object.freeze(['convertedBore', 'Converted Bore', 'Size', 'DN', 'NB', 'Bore', 'NPS']),
      componentType: Object.freeze(['Component Type', 'COMPONENT_TYPE', 'Type', 'Item Type']),
      rating: Object.freeze(['Rating', 'RATING', 'Pressure Class']),
      materialName: Object.freeze(['Material_Name', 'Material', 'MATERIAL']),
      schedule: Object.freeze(['Schedule', 'SCHEDULE', 'SCH']),
      wallThickness: Object.freeze(['Wall Thickness', 'WALL_THICKNESS', 'WT']),
      corrosion: Object.freeze(['Corrosion', 'Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CA']),
      endCondition: Object.freeze(['End Condition', 'END_CONDITION', 'End Type']),
    }),
  }),
  material: Object.freeze({
    key: 'material',
    title: 'Material Map',
    description: 'Import material code/name mappings used by exact and fuzzy material resolution.',
    sectionKey: 'material',
    rowsKey: 'mapRows',
    fieldMapKey: 'fieldMap',
    defaultUrl: `${_xmlCiiMasterBaseUrl}PCF_MAT_MAP.TXT`,
    requiredFields: Object.freeze([]),
    aliases: Object.freeze({
      code: Object.freeze(['Code', 'Material Code', 'MATERIAL_CODE', 'CA3']),
      material: Object.freeze(['Material', 'Material_Name', 'Description', 'Name']),
      spec: Object.freeze(['Spec', 'Specification']),
    }),
  }),
  weight: Object.freeze({
    key: 'weight',
    title: 'Weights / Valve CA8',
    description: 'Import valve/flange weights and map bore + rating + length to weight.',
    sectionKey: 'weight',
    rowsKey: 'masterRows',
    fieldMapKey: 'fieldMap',
    defaultUrl: `${_xmlCiiMasterBaseUrl}wtValveweights.json`,
    requiredFields: Object.freeze(['bore', 'rating', 'length', 'weight']),
    aliases: Object.freeze({
      bore: Object.freeze(['convertedBore', 'Converted Bore', 'Size (NPS)', 'Size', 'NPS', 'DN', 'NB', 'Bore']),
      rating: Object.freeze(['Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class']),
      length: Object.freeze(['Length (RF-F/F)', 'RF-F/F', 'Length', 'LEN', 'Face To Face', 'faceToFace']),
      valveType: Object.freeze(['Type Description', 'Valve Type', 'Type', 'Description']),
      weight: Object.freeze(['RF/RTJ KG', 'Valve Weight', 'Weight', 'weight', 'valveWeight']),
    }),
  }),
});

const XML_CII_MASTER_ORDER = Object.freeze(['linelist', 'pipingClass', 'material', 'weight']);
const XML_CII_LAST_PIPING_CLASS_INDEX_PATH_KEY = 'model-converters.xml-cii.last-piping-class-index-path.v1';
const XML_CII_LINELIST_MAPPING_TEMPLATES_KEY = 'model-converters.xml-cii.linelist-column-mapping-templates.v1';

function _defaultInputxml2019LayoutConfigJson() {
  return JSON.stringify({
    elements: {
      row3: ['0.000000', '0.000000', '0.000000', '0.000000', '0.000000', '0.000000'],
      row4: ['10.0000', '30.0000', '0.000000', '0.000000', '0.000000', '0.000000'],
      row5: ['0.000000', '0.000000', '0.000000', '0.000000', '0.000000', '0.000000'],
      row6: ['0.499901E-04', '0.965312E-03', '0.000000', '0.000000', '0.000000', '15.0000'],
      row7: ['0.000000', '0.000000', '0.000000', '0.000000', '0.000000', '0.000000'],
      row8: ['0.000000', '0.000000', '0.000000', '0.000000', '9999.99', '9999.99'],
      row9: ['0.000000', '0.000000', '0.000000', '0.000000', '0.000000'],
      row10: ['0'],
      row12: ['{bend}', '{rigid}', '0', '{restraint}', '0', '0'],
      row13: ['0', '0', '0', '0', '{sif}', '{nodename}'],
      row14: ['{reducer}', '0', '0'],
      line_label: {
        mode: 'auto',
        pointer_start: 0,
        label_index_start: 1,
        label_prefix: 'LINENO',
        label_width: 1,
        default_line: '',
        line_labels: [],
      },
    },
    nodename: {
      mode: 'auto',
      nonam_count: 0,
      from_label: 'PS-XXX',
      to_label: 'PS-XXX',
      from_labels: [],
      to_labels: [],
    },
    control: {
      line1: ['{elements}', '{nozzles}', '{hangers}', '{nonam}', '{reducers}', '{flanges}'],
      line2: ['{bends}', '{rigids}', '{expjts}', '{restraints}', '{displmnt}', '{forcmnt}'],
      line3: ['{uniform}', '{wind}', '{offsets}', '{allowbls}', '{sifs}', '0'],
      line4: ['{equipmnt}'],
    },
    sections: {
      include_nodename: true,
    },
    miscel_1: {
      material_id_default: '0.000',
      material_ids: [],
    },
    units: {
      numeric_lines: [...INPUTXML2019_SAFE_UNITS.numeric_lines],
      text_lines: [...INPUTXML2019_SAFE_UNITS.text_lines],
    },
  }, null, 2);
}
const NATIVE_RVM_ENDPOINT_CANDIDATES = Object.freeze([
  'http://localhost:3000/api/native/rvm-to-rev',
  'http://localhost:3001/api/native/rvm-to-rev',
  'http://localhost:3200/api/native/rvm-to-rev',
  'http://127.0.0.1:3000/api/native/rvm-to-rev',
  'http://127.0.0.1:3001/api/native/rvm-to-rev',
  'http://127.0.0.1:3200/api/native/rvm-to-rev',
]);

const CONVERTER_DEFS = Object.freeze({
  rvm_to_rev: {
    id: 'rvm_to_rev',
    label: 'RVM -> REV',
    primaryAccept: '.rvm,.RVM',
    primaryLabel: 'RVM Input',
    secondaryLabel: 'ATT/TXT Attribute File (optional)',
    secondaryAccept: '.att,.ATT,.txt,.TXT',
    description: 'Convert RVM source to REV text.',
    defaults: {},
    fields: [],
  },
  rvmattr_to_xml: {
    id: 'rvmattr_to_xml',
    label: 'ATT/RVM -> XML+JSON+STP',
    primaryAccept: '.rvm,.RVM',
    primaryLabel: 'RVM Input',
    secondaryLabel: 'ATT/TXT Attribute File (optional)',
    secondaryAccept: '.att,.ATT,.txt,.TXT',
    allowSecondaryOnly: true,
    description: 'Managed native stage to XML; JSON->XML is attempted first, then REV->XML fallback.',
    defaults: {
      coordFactor: 1000,
      nodeStart: 10,
      nodeStep: 10,
      nodeMergeTolerance: 0.5,
      source: 'AVEVA PSI',
      purpose: 'Preliminary stress run',
      titleLine: 'PSI stress Output',
      enablePsiRigidLogic: false,
      preferJsonToXml: true,
      defaultDiameter: 100,
      defaultWallThickness: 0.01,
      defaultInsulationThickness: 0,
      defaultCorrosionAllowance: 0,
    },
    fields: [
      { key: 'coordFactor', label: 'Coord Factor', type: 'number', step: '0.01' },
      { key: 'nodeStart', label: 'Node Start', type: 'number', step: '1' },
      { key: 'nodeStep', label: 'Node Step', type: 'number', step: '1' },
      { key: 'nodeMergeTolerance', label: 'Node Merge Tol.', type: 'number', step: '0.01' },
      { key: 'preferJsonToXml', label: 'Prefer JSON -> XML', type: 'checkbox' },
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'purpose', label: 'Purpose', type: 'text' },
      { key: 'titleLine', label: 'Title Line', type: 'text' },
      { key: 'enablePsiRigidLogic', label: 'Enable PSI Rigid Logic', type: 'checkbox' },
      { key: 'defaultDiameter', label: 'JSON Fallback Diameter', type: 'number', step: '0.001' },
      { key: 'defaultWallThickness', label: 'JSON Fallback Wall Thickness', type: 'number', step: '0.001' },
      { key: 'defaultInsulationThickness', label: 'JSON Fallback Insulation', type: 'number', step: '0.001' },
      { key: 'defaultCorrosionAllowance', label: 'JSON Fallback Corrosion', type: 'number', step: '0.001' },
    ],
  },
  rev_to_pcf: {
    id: 'rev_to_pcf',
    label: 'REV -> PCF',
    primaryAccept: '.rev,.REV,.txt,.TXT',
    primaryLabel: 'REV Input',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert REV text export to PCF.',
    defaults: {
      coordFactor: 1000,
      topologyMergeTolerance: 0.5,
      pipelineReference: '',
      projectIdentifier: '',
      excludeGroupTokens: '-PIPESUPP',
    },
    fields: [
      { key: 'coordFactor', label: 'Coord Factor', type: 'number', step: '0.01' },
      { key: 'topologyMergeTolerance', label: 'Topology Merge Tol.', type: 'number', step: '0.01' },
      { key: 'pipelineReference', label: 'Pipeline Reference', type: 'text' },
      { key: 'projectIdentifier', label: 'Project Identifier', type: 'text' },
      {
        key: 'excludeGroupTokens',
        label: 'Exclude Group Tokens (comma-separated)',
        type: 'text',
      },
    ],
  },
  rev_to_xml: {
    id: 'rev_to_xml',
    label: 'REV -> XML',
    primaryAccept: '.rev,.REV,.txt,.TXT',
    primaryLabel: 'REV Input',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert REV text export to PSI116-style XML.',
    defaults: {
      coordFactor: 1000,
      nodeStart: 10,
      nodeStep: 10,
      nodeMergeTolerance: 0.5,
      source: 'AVEVA PSI',
      purpose: 'Preliminary stress run',
      titleLine: 'PSI stress Output',
      enablePsiRigidLogic: false,
    },
    fields: [
      { key: 'coordFactor', label: 'Coord Factor', type: 'number', step: '0.01' },
      { key: 'nodeStart', label: 'Node Start', type: 'number', step: '1' },
      { key: 'nodeStep', label: 'Node Step', type: 'number', step: '1' },
      { key: 'nodeMergeTolerance', label: 'Node Merge Tol.', type: 'number', step: '0.01' },
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'purpose', label: 'Purpose', type: 'text' },
      { key: 'titleLine', label: 'Title Line', type: 'text' },
      { key: 'enablePsiRigidLogic', label: 'Enable PSI Rigid Logic', type: 'checkbox' },
    ],
  },
  json_to_xml: {
    id: 'json_to_xml',
    label: 'JSON -> XML',
    disabled: true,
    primaryAccept: '.json,.JSON',
    primaryLabel: 'RVM JSON Input',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert rvmparser hierarchy JSON to PSI116-style XML.',
    defaults: {
      coordFactor: 1000,
      nodeStart: 10,
      nodeStep: 10,
      defaultDiameter: 100,
      defaultWallThickness: 0.01,
      defaultInsulationThickness: 0,
      defaultCorrosionAllowance: 0,
      mockTemperature: -100000,
      mockTemperatureOther: -100000,
      mockPressure: 0,
      mockPressureOther: 0,
      mockMaterialNumber: 0,
      mockInsulationDensity: 0,
      mockFluidDensity: 0,
    },
    fields: [
      { key: 'coordFactor', label: 'Coord Factor', type: 'number', step: '0.01' },
      { key: 'nodeStart', label: 'Node Start', type: 'number', step: '1' },
      { key: 'nodeStep', label: 'Node Step', type: 'number', step: '1' },
      { key: 'defaultDiameter', label: 'Default Diameter', type: 'number', step: '0.001' },
      { key: 'defaultWallThickness', label: 'Default Wall Thickness', type: 'number', step: '0.001' },
      { key: 'defaultInsulationThickness', label: 'Default Insulation', type: 'number', step: '0.001' },
      { key: 'defaultCorrosionAllowance', label: 'Default Corrosion', type: 'number', step: '0.001' },
      { key: 'mockTemperature', label: 'Mock Temperature1', type: 'number', step: '0.1' },
      { key: 'mockTemperatureOther', label: 'Mock Temperature2..9', type: 'number', step: '0.1' },
      { key: 'mockPressure', label: 'Mock Pressure1', type: 'number', step: '0.1' },
      { key: 'mockPressureOther', label: 'Mock Pressure2..9', type: 'number', step: '0.1' },
      { key: 'mockMaterialNumber', label: 'Mock Material Number', type: 'number', step: '1' },
      { key: 'mockInsulationDensity', label: 'Mock Insulation Density', type: 'number', step: '0.1' },
      { key: 'mockFluidDensity', label: 'Mock Fluid Density', type: 'number', step: '0.1' },
    ],
  },
  stagedjson_to_inputxml: {
    id: 'stagedjson_to_inputxml',
    label: 'StagedJSON -> InputXML',
    primaryAccept: '.json,.JSON',
    primaryLabel: 'Staged JSON Input',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert staged hierarchy JSON to CAESAR II Input XML using benchmark defaults (B7410250).',
    defaults: {
      nodeStart: 10,
      nodeStep: 10,
      temperature1: 50.0,
      wallThickness: 0.01,
      verticalAxis: 'Y',
      disableSupports: false,
    },
    fields: [
      { key: 'inputxmlBookmark', label: 'Defaults Bookmark JSON (overrides B7410250 benchmark)', type: 'text' },
      { key: 'nodeStart', label: 'Node Start', type: 'number', step: '1' },
      { key: 'nodeStep', label: 'Node Step', type: 'number', step: '1' },
      { key: 'jobName', label: 'Job Name', type: 'text' },
      { key: 'temperature1', label: 'Temperature 1 (C)', type: 'number', step: '0.1' },
      { key: 'wallThickness', label: 'Wall Thickness (mm)', type: 'number', step: '0.001' },
      { key: 'modulus', label: 'Modulus', type: 'number', step: '0.1' },
      { key: 'materialName', label: 'Material Name', type: 'text' },
      { key: 'verticalAxis', label: 'Vertical Axis (PDMS Up ->)', type: 'select', options: ['Y', 'Z'] },
      { key: 'disableSupports', label: 'Disable support -> restraint mapping', type: 'checkbox' },
      { key: 'supportConfigJson', label: 'Support Restraint Config JSON (overrides)', type: 'text' },
      { key: 'datumE', label: 'World Datum E (mm)', type: 'number', step: '0.001' },
      { key: 'datumN', label: 'World Datum N (mm)', type: 'number', step: '0.001' },
      { key: 'datumU', label: 'World Datum U (mm)', type: 'number', step: '0.001' },
    ],
  },
  stagedjson_to_csv: {
    id: 'stagedjson_to_csv',
    label: 'StagedJSON -> CSV',
    primaryAccept: '.json,.JSON',
    primaryLabel: 'Staged JSON Input',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Export staged JSON hierarchy to a CSV table grouped by Site > Pipe/Branch > Reference No.',
    defaults: {
      csvColumns: '',
      supportTypeRules: '',
    },
    fields: [
      { key: 'csvColumns', label: 'Report Columns', type: 'column-picker' },
      { key: 'supportTypeRules', label: 'Support Type Rules', type: 'support-type-rules' },
    ],
  },
  stagedjson_to_xml: {
    id: 'stagedjson_to_xml',
    label: 'StagedJSON -> XML',
    primaryAccept: '.json,.JSON',
    primaryLabel: 'Staged JSON Input',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert staged hierarchy JSON (branch -> children -> attributes) to PSI116-style XML.',
    defaults: {
      nodeStart: 10,
      nodeStep: 10,
      source: 'AVEVA PSI',
      purpose: 'RMSS staged JSON conversion',
      titleLine: 'RMSS StagedJSON Output',
      defaultDiameter: 100,
      defaultWallThickness: 0.01,
      defaultInsulationThickness: 0,
      defaultCorrosionAllowance: 0,
    },
    fields: [
      { key: 'nodeStart', label: 'Node Start', type: 'number', step: '1' },
      { key: 'nodeStep', label: 'Node Step', type: 'number', step: '1' },
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'purpose', label: 'Purpose', type: 'text' },
      { key: 'titleLine', label: 'Title Line', type: 'text' },
      { key: 'defaultDiameter', label: 'Default Diameter', type: 'number', step: '0.001' },
      { key: 'defaultWallThickness', label: 'Default Wall Thickness', type: 'number', step: '0.001' },
      { key: 'defaultInsulationThickness', label: 'Default Insulation', type: 'number', step: '0.001' },
      { key: 'defaultCorrosionAllowance', label: 'Default Corrosion', type: 'number', step: '0.001' },
    ],
  },
  rev_to_stp: {
    id: 'rev_to_stp',
    label: 'REV -> STP',
    primaryAccept: '.rev,.REV,.txt,.TXT',
    primaryLabel: 'REV Input',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert REV support blocks to STEP member polylines.',
    defaults: {
      coordFactor: 1000,
      supportPathContains: 'RRIMS-PIPESUPP',
      includeGenericSupportGroups: false,
      schemaName: 'CIS2',
    },
    fields: [
      { key: 'coordFactor', label: 'Coord Factor', type: 'number', step: '0.01' },
      { key: 'supportPathContains', label: 'Support Path Token', type: 'text' },
      { key: 'schemaName', label: 'STEP Schema Name', type: 'text' },
      { key: 'includeGenericSupportGroups', label: 'Include Generic Support Groups', type: 'checkbox' },
    ],
  },
  xml_to_cii: {
    id: 'xml_to_cii',
    label: 'XML->CII(2019)',
    primaryAccept: '.xml,.XML',
    primaryLabel: 'XML Input',
    secondaryLabel: 'Staged JSON Support Data (optional)',
    secondaryAccept: '.json,.JSON',
    description: 'Convert PSI116-style XML to CII and optionally recover support mapping from staged JSON.',
    defaults: {
      coordsMode: 'first',
      createEnrichedXml: true,
      kgToNewton: true,
      supportConfigJson: JSON.stringify({
        useFrictionSentinelForNonYSupports: true,
        convertDensityKgM3ToKgCm3: true,
        disableCiiSupportTagPopulation: true,
        useJsonTraceStagedSource: false,
        useParsedCustomInputSource: false,
        useParsedCustomInputSourceForPreview: false,
        condenseRigidXsd: false,
        condense_rigid_xsd: false,
        splitCondensedValveFlange: true,
        split_condensed_valve_flange: true,
        duplicateSupportPolicy: 'prefer_datum',
        coordinateTolerance: 1.0,
        xmlAxisToCiiAxis: { Z: 'Y' },
        supportKindToXmlType: { REST: '+Y', GUIDE: 'GUI', LINESTOP: 'LIM', LIMIT: 'LIM', ANCHOR: 'A', SPRING: 'Y' },
        defaultXmlSupportType: 'Y',
        defaultStiffness: '1.751270E+12',
        masterPaths: {
          materialMapPath: 'docs/Masters/PCF_MAT_MAP.TXT',
          weightPath: 'docs/Masters/wtValveweights.json',
          pipingClassIndexPath: 'docs/Masters/SpecwisePipingClass/index.json',
          pipingClassShardFolder: 'docs/Masters/SpecwisePipingClass/',
        },
        linelist: {
          sampleBranchName: '/ASIM-1885-10"-S8810101-91261M7-HC/B1',
          tokenDelimiter: '-',
          lineKeyTokenPositions: '4',
          lineKeyJoiner: '',
          branchNameRegex: '',
          lineNoGroup: 1,
          linelistColumnRegex: '^\\s*(.*?)\\s*$',
          linelistColumnGroup: 1,
        },
        rating: {
          sourceFields: ['RATING', 'PRAT', 'PSPE', 'SPRE', 'LSTU'],
          tokenDelimiter: '-',
          pipingClassTokenIndex: 5,
          pipingClassRegex: '',
          pipingClassGroup: 1,
          ratingSequence: [['200', '20000'], ['150', '15000'], ['100', '10000'], ['25', '2500'], ['15', '1500'], ['5', '5000'], ['1', '150'], ['3', '300'], ['6', '600'], ['9', '900']],
        },
        weight: {
          sourceFields: ['WEIGHT', 'PSIWEIGHT', 'CMPWEIGHTDRY'],
          tokenDelimiter: '-',
          boreTokenIndex: 3,
          boreRegex: '',
          boreGroup: 1,
          inchToMm: 25.4,
          npsToDn: { '0.25': 8, '0.375': 10, '0.5': 15, '0.75': 20, '1': 25, '1.25': 32, '1.5': 40, '2': 50, '2.5': 65, '3': 80, '4': 100, '6': 150, '8': 200, '10': 250, '12': 300, '14': 350, '16': 400, '18': 450, '20': 500, '24': 600 },
          lengthToleranceMm: 4,
          masterLengthUnit: 'auto',
          masterUrl: '../docs/Masters/wtValveweights.json',
          masterRows: [],
        },
        pipingClass: {
          masterUrl: '',
          masterRows: [],
          startsWithConfidence: 0.8,
          fuzzyThreshold: 0.6,
          reviewBelow: 1.0,
        },
        material: {
          masterUrl: '../docs/Masters/PCF_MAT_MAP.TXT',
          mapRows: [],
          containsConfidence: 0.9,
          tokenJaccardThreshold: 0.35,
        },
        overrides: { pipingClass: {}, material: {}, rigidWeight: {} },
      }, null, 2),
    },
    fields: [
      { key: 'coordsMode', label: 'Coords Mode', type: 'select', options: ['first', 'all', 'none'] },
      { key: 'createEnrichedXml', label: 'Create enriched XML before CII', type: 'checkbox' },
      { key: 'kgToNewton', label: 'kg → N weight conversion (×10)', type: 'checkbox' },
      { key: 'supportConfigJson', label: 'Restraint / Linelist / Rating / Weight Config', type: 'json-popup' },
    ],
  },
  cii_syntax_check_2019: {
    id: 'cii_syntax_check_2019',
    label: 'CII Syntax Check (2019)',
    primaryAccept: '.cii,.CII',
    primaryLabel: 'CII Input (2019)',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Validate CAESAR II 2019 CII syntax (format-only) and output a JSON report.',
    defaults: {},
    fields: [],
  },
  inputxml_to_rvm: {
    id: 'inputxml_to_rvm',
    label: 'InputXML -> RVM (+GLB)',
    group: '3D Models',
    primaryAccept: '.xml,.XML',
    primaryLabel: 'Input XML',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert CAESAR II Input XML to a binary AVEVA RVM model (exact parametric primitives) for Navisworks, plus an optional .att attribute dump and an optional GLB companion for the in-browser viewer. The RVM/parsing core is self-contained (vendored, prefixed, no shared modules); the optional GLB reuses the shared three.js exporter.',
    defaults: {
      rvmPrecision: 3,
      includeAtt: true,
      includeGlb: true,
      includeSidecarJson: false,
    },
    fields: [
      { key: 'rvmPrecision', label: 'Coordinate Precision (decimals)', type: 'number', step: '1' },
      { key: 'includeAtt', label: 'Emit .att attribute dump', type: 'checkbox' },
      { key: 'includeGlb', label: 'Emit GLB companion (web viewer)', type: 'checkbox' },
      { key: 'includeSidecarJson', label: 'Emit RVM sidecar JSON', type: 'checkbox' },
    ],
  },
  pcf_continuity_check: {
    id: 'pcf_continuity_check',
    label: 'PCF Continuity Check',
    primaryAccept: '.pcf,.PCF',
    primaryLabel: 'PCF Input',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Check PCF endpoint continuity and optionally auto-balance small gaps using the configured tolerance.',
    defaults: {
      continuityMismatchToleranceMm: 6,
      continuityAutoAdjustEnabled: true,
      continuityMovePriority: 'PIPE, FLANGE, VALVE, BEND, TEE',
      preferUpstreamComponent: true,
    },
    fields: [
      { key: 'continuityMismatchToleranceMm', label: 'Continuity Mismatch Tolerance (mm)', type: 'number', step: '0.001' },
      { key: 'continuityAutoAdjustEnabled', label: 'Auto Adjust Small Gaps', type: 'checkbox' },
      { key: 'continuityMovePriority', label: 'Move Priority (comma-separated)', type: 'text' },
      { key: 'preferUpstreamComponent', label: 'Prefer Upstream Component', type: 'checkbox' },
    ],
  },
  inputxml_to_cii: {
    id: 'inputxml_to_cii',
    label: 'InputXML->CII(v2014)',
    disabled: true,
    primaryAccept: '.xml,.XML',
    primaryLabel: 'Input XML',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert CAESARII Input XML to CII.',
    defaults: {
      inferReducerAngleFromGeometry: false,
      defaultDiameter: 0,
      defaultWallThickness: 0.01,
      defaultInsulationThickness: 0,
      defaultCorrosionAllowance: 0,
      defaultTemperature1: 0,
      defaultTemperature2: 0,
      defaultTemperature3: 0,
      defaultReducerAngle: 0,
      coordReconstructionTolerance: 25,
      layoutConfigJson: _defaultInputxml2019LayoutConfigJson(),
      ...INPUTXML_HEADER_DEFAULTS,
    },
    fields: [
      { key: 'inferReducerAngleFromGeometry', label: 'Infer Reducer Angle From Geometry', type: 'checkbox' },
      { key: 'defaultDiameter', label: 'Default Diameter', type: 'number', step: '0.001' },
      { key: 'defaultWallThickness', label: 'Default Wall Thickness', type: 'number', step: '0.001' },
      { key: 'defaultInsulationThickness', label: 'Default Insulation Thickness', type: 'number', step: '0.001' },
      { key: 'defaultCorrosionAllowance', label: 'Default Corrosion Allowance', type: 'number', step: '0.001' },
      { key: 'defaultTemperature1', label: 'Default Temperature1', type: 'number', step: '0.01' },
      { key: 'defaultTemperature2', label: 'Default Temperature2', type: 'number', step: '0.01' },
      { key: 'defaultTemperature3', label: 'Default Temperature3', type: 'number', step: '0.01' },
      { key: 'defaultReducerAngle', label: 'Default Reducer Angle', type: 'number', step: '0.01' },
      { key: 'coordReconstructionTolerance', label: 'Coord Reconstruction Tolerance (mm)', type: 'number', step: '0.001' },
      { key: 'headerDateTime', label: 'Header DateTime', type: 'text' },
      { key: 'headerSource', label: 'Header Source', type: 'text' },
      { key: 'headerVersion', label: 'Header Version', type: 'text' },
      { key: 'headerUserName', label: 'Header UserName', type: 'text' },
      { key: 'headerPurpose', label: 'Header Purpose', type: 'text' },
      { key: 'headerProjectName', label: 'Header ProjectName', type: 'text' },
      { key: 'headerMdbName', label: 'Header MDBName', type: 'text' },
    ],
  },
  inputxml14_to_cii: {
    id: 'inputxml14_to_cii',
    label: 'InputXML(Ver14) -> CII [TBA]',
    primaryAccept: '.xml,.XML',
    primaryLabel: 'Input XML (Ver14)',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert CAESARII Input XML Ver14 to CII.',
    defaults: {
      inferReducerAngleFromGeometry: false,
      defaultDiameter: 0,
      defaultWallThickness: 0.01,
      defaultInsulationThickness: 0,
      defaultCorrosionAllowance: 0,
      defaultTemperature1: 0,
      defaultTemperature2: 0,
      defaultTemperature3: 0,
      defaultReducerAngle: 0,
      coordReconstructionTolerance: 25,
      ...INPUTXML_HEADER_DEFAULTS,
    },
    fields: [
      { key: 'inferReducerAngleFromGeometry', label: 'Infer Reducer Angle From Geometry', type: 'checkbox' },
      { key: 'defaultDiameter', label: 'Default Diameter', type: 'number', step: '0.001' },
      { key: 'defaultWallThickness', label: 'Default Wall Thickness', type: 'number', step: '0.001' },
      { key: 'defaultInsulationThickness', label: 'Default Insulation Thickness', type: 'number', step: '0.001' },
      { key: 'defaultCorrosionAllowance', label: 'Default Corrosion Allowance', type: 'number', step: '0.001' },
      { key: 'defaultTemperature1', label: 'Default Temperature1', type: 'number', step: '0.01' },
      { key: 'defaultTemperature2', label: 'Default Temperature2', type: 'number', step: '0.01' },
      { key: 'defaultTemperature3', label: 'Default Temperature3', type: 'number', step: '0.01' },
      { key: 'defaultReducerAngle', label: 'Default Reducer Angle', type: 'number', step: '0.01' },
      { key: 'coordReconstructionTolerance', label: 'Coord Reconstruction Tolerance (mm)', type: 'number', step: '0.001' },
      { key: 'headerDateTime', label: 'Header DateTime', type: 'text' },
      { key: 'headerSource', label: 'Header Source', type: 'text' },
      { key: 'headerVersion', label: 'Header Version', type: 'text' },
      { key: 'headerUserName', label: 'Header UserName', type: 'text' },
      { key: 'headerPurpose', label: 'Header Purpose', type: 'text' },
      { key: 'headerProjectName', label: 'Header ProjectName', type: 'text' },
      { key: 'headerMdbName', label: 'Header MDBName', type: 'text' },
    ],
  },
  inputxml_to_cii2019: {
    id: 'inputxml_to_cii2019',
    label: 'InputXML->CII(2019)',
    primaryAccept: '.xml,.XML',
    primaryLabel: 'Input XML (2019)',
    secondaryLabel: '',
    secondaryAccept: '',
    description: 'Convert CAESARII Input XML to CII using 2019 benchmark structure profiles.',
    masterInputXmlSample: {
      fileName: MASTER_INPUTXML_FILE_NAME,
      getText: () => MASTER_INPUTXML_TEMPLATE,
    },
    defaults: {
      inferReducerAngleFromGeometry: false,
      defaultDiameter: 0,
      defaultWallThickness: 0.01,
      defaultInsulationThickness: 0,
      defaultCorrosionAllowance: 0,
      defaultTemperature1: 0,
      defaultTemperature2: 0,
      defaultTemperature3: 0,
      defaultReducerAngle: 0,
      coordReconstructionTolerance: 25,
      layoutConfigJson: _defaultInputxml2019LayoutConfigJson(),
      ...INPUTXML_HEADER_DEFAULTS,
    },
    fields: [
      { key: 'inferReducerAngleFromGeometry', label: 'Infer Reducer Angle From Geometry', type: 'checkbox' },
      { key: 'defaultDiameter', label: 'Default Diameter', type: 'number', step: '0.001' },
      { key: 'defaultWallThickness', label: 'Default Wall Thickness', type: 'number', step: '0.001' },
      { key: 'defaultInsulationThickness', label: 'Default Insulation Thickness', type: 'number', step: '0.001' },
      { key: 'defaultCorrosionAllowance', label: 'Default Corrosion Allowance', type: 'number', step: '0.001' },
      { key: 'defaultTemperature1', label: 'Default Temperature1', type: 'number', step: '0.01' },
      { key: 'defaultTemperature2', label: 'Default Temperature2', type: 'number', step: '0.01' },
      { key: 'defaultTemperature3', label: 'Default Temperature3', type: 'number', step: '0.01' },
      { key: 'defaultReducerAngle', label: 'Default Reducer Angle', type: 'number', step: '0.01' },
      { key: 'coordReconstructionTolerance', label: 'Coord Reconstruction Tolerance (mm)', type: 'number', step: '0.001' },
      { key: 'headerDateTime', label: 'Header DateTime', type: 'text' },
      { key: 'headerSource', label: 'Header Source', type: 'text' },
      { key: 'headerVersion', label: 'Header Version', type: 'text' },
      { key: 'headerUserName', label: 'Header UserName', type: 'text' },
      { key: 'headerPurpose', label: 'Header Purpose', type: 'text' },
      { key: 'headerProjectName', label: 'Header ProjectName', type: 'text' },
      { key: 'headerMdbName', label: 'Header MDBName', type: 'text' },
    ],
  },
  pdf_to_inputxml: {
    id: 'pdf_to_inputxml',
    label: 'PDF -> InputXML',
    primaryAccept: '.pdf,.PDF',
    primaryLabel: 'Input Echo PDF',
    secondaryLabel: 'Misc PDF (optional)',
    secondaryAccept: '.pdf,.PDF',
    description: 'Convert CAESAR Input Echo PDF to Input XML.',
    defaults: {},
    fields: [],
  },
  pdf_to_inputxml_cii14: {
    id: 'pdf_to_inputxml_cii14',
    label: 'PDF -> InputXML (CII14)',
    primaryAccept: '.pdf,.PDF',
    primaryLabel: 'Input Echo PDF',
    secondaryLabel: 'Benchmark Input XML (optional)',
    secondaryAccept: '.xml,.XML',
    description: 'Convert PDF to CII14 InputXML using benchmark structure (falls back to bundled profile when omitted).',
    defaults: {
      outputMode: 'preserve',
    },
    fields: [
      { key: 'outputMode', label: 'Output Mode', type: 'select', options: ['preserve', 'overlay'] },
    ],
  },
});

const CONVERTER_ORDER = Object.freeze([
  'rvm_to_rev',
  'rvmattr_to_xml',
  'rev_to_pcf',
  'rev_to_xml',
  'rev_to_stp',
  'json_to_xml',
  'stagedjson_to_xml',
  'stagedjson_to_inputxml',
  'seljson_to_inputxml',
  'seljson_to_xml',
  'stagedjson_to_csv',
  'pdf_to_inputxml',
  'pdf_to_inputxml_cii14',
  'inputxml_to_xml',
  'xml_to_cii',
  'cii_syntax_check_2019',
  'inputxml_to_cii',
  'inputxml14_to_cii',
  'inputxml_to_cii2019',
  'fbx_to_stagedjson',
  'inputxml_to_rvm',
  'pcf_continuity_check',
]);

const ORDERED_CONVERTER_DEFS = Object.freeze(
  CONVERTER_ORDER
    .map((converterId) => _legacyConverterDef(converterId))
    .filter(Boolean),
);

function _legacyConverterDef(converterId) {
  const local = CONVERTER_DEFS[converterId];
  if (local) return local;
  const live = getConverterById(converterId);
  const primary = (live?.inputs || []).find((input) => input.role === 'primary') || {};
  const secondary = (live?.inputs || []).find((input) => input.role === 'secondary') || {};
  return live ? {
    id: live.id, label: live.label, disabled: live.disabled,
    primaryAccept: primary.accept || '*', primaryLabel: primary.label || 'Primary Input',
    secondaryAccept: secondary.accept || '', secondaryLabel: secondary.label || '',
    description: live.description || '', defaults: live.defaults || {}, fields: live.options || [],
  } : null;
}

const RMSS_BORE_FIELDS = Object.freeze(['HBOR', 'TBOR', 'ABORE', 'LBORE', 'DTXR']);

function _clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function _sameTextArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((entry, index) => String(entry) === String(right[index]));
}

function _toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

async function _loadInputXmlAutoReference(primaryFileName) {
  const normalizedName = _toText(primaryFileName).trim();
  if (!normalizedName) return null;
  for (const profile of INPUTXML_AUTO_REFERENCE_PROFILES) {
    if (!profile.namePattern.test(normalizedName)) continue;
    const profileUrl = new URL(`../converters/scripts/${profile.fileName}`, import.meta.url);
    const response = await fetch(profileUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Bundled InputXML benchmark profile failed to load (${profile.fileName}).`);
    }
    const bytes = await response.arrayBuffer();
    return { name: profile.outputName, bytes };
  }
  return null;
}

function _esc(value) {
  return _toText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function _escAttr(value) {
  return _esc(value).replaceAll("'", '&#39;');
}

function _xmlCiiNormalizeHeader(value) {
  return _toText(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function _xmlCiiWordTokens(value) {
  return _toText(value)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function _xmlCiiHeaderScore(header, aliases) {
  const headerText = _toText(header).trim();
  const normalizedHeader = _xmlCiiNormalizeHeader(headerText);
  if (!normalizedHeader) return 0;
  let bestScore = 0;
  for (let aliasIndex = 0; aliasIndex < (aliases || []).length; aliasIndex += 1) {
    const alias = aliases[aliasIndex];
    const aliasText = _toText(alias).trim();
    const normalizedAlias = _xmlCiiNormalizeHeader(aliasText);
    const exactScore = aliasIndex === 0 ? 120 : 100;
    if (!normalizedAlias) continue;
    if (normalizedHeader === normalizedAlias) bestScore = Math.max(bestScore, exactScore);
    else if (normalizedHeader.startsWith(normalizedAlias) || normalizedAlias.startsWith(normalizedHeader)) bestScore = Math.max(bestScore, 78);
    else if (normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader)) bestScore = Math.max(bestScore, 68);

    const aliasTokens = _xmlCiiWordTokens(aliasText);
    const headerTokens = _xmlCiiWordTokens(headerText);
    const matches = aliasTokens.filter((token) => headerTokens.includes(token)).length;
    if (aliasTokens.length && matches) bestScore = Math.max(bestScore, Math.round((matches / aliasTokens.length) * 62));
  }
  return bestScore;
}

function _xmlCiiParseDelimitedText(text) {
  const sourceLines = _toText(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  if (!sourceLines.length) return [];

  const firstLine = sourceLines[0];
  const delimiters = [',', '\t', ';', '|'];
  let delimiter = ',';
  let bestCount = -1;
  for (const candidate of delimiters) {
    const count = firstLine.split(candidate).length;
    if (count > bestCount) {
      delimiter = candidate;
      bestCount = count;
    }
  }

  const parseLine = (line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const nextChar = line[index + 1];
      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseLine(firstLine);
  return sourceLines.slice(1).map((line, rowIndex) => {
    const row = { _rowIndex: rowIndex + 1 };
    const cells = parseLine(line);
    headers.forEach((header, cellIndex) => {
      row[header || `COL_${cellIndex + 1}`] = cells[cellIndex] ?? '';
    });
    return row;
  });
}

function _xmlCiiParseMaterialMapText(text) {
  return _toText(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^\d{4}$/.test(line))
    .map((line, index) => {
      const match = line.match(/^(\S+)\s+(.+)$/);
      return {
        _rowIndex: index + 1,
        code: match ? match[1].trim() : '',
        material: match ? match[2].trim() : line,
      };
    });
}

function _xmlCiiHeadersFromRows(rows) {
  return Array.from(new Set((Array.isArray(rows) ? rows : []).flatMap((row) => Object.keys(row || {}))));
}

function _xmlCiiBuildColumnPreviewMap(rows, headers) {
  const previewMap = {};
  for (const header of headers) {
    const values = [];
    for (let index = 0; index < rows.length && values.length < 3; index += 1) {
      const value = rows[index]?.[header];
      if (value === undefined || value === null || _toText(value).trim() === '') continue;
      const text = _toText(value).trim();
      if (!values.includes(text)) values.push(text);
    }
    previewMap[header] = values.length ? `${header} | ${values.join(' | ')}` : header;
  }
  return previewMap;
}

// ---------------------------------------------------------------------------
// Label-row header hint: scan first N data rows of __EMPTY_* columns for
// recognisable field-name strings, used as a primary hint before data-value
// heuristics.
// ---------------------------------------------------------------------------
const _XML_CII_LABEL_ROW_KEYWORDS = Object.freeze({
  lineSeqNo:    ['line number', 'line no', 'line no.', 'seq', 'sequence', 'lineno'],
  lineKey1:     ['service', 'line key', 'key 1', 'key1', 'area'],
  lineKey2:     ['line number', 'line no', 'key 2', 'key2'],
  pipingClass:  ['piping class', 'piping_class', 'class', 'spec', 'pipe class'],
  rating:       ['rating', 'pressure class', 'class rating'],
  material:     ['material', 'material_name', 'material name'],
  convertedBore:['bore', 'size', 'dn', 'nps', 'nb', 'nominal pipe', 'nominal bore'],
  p1:           ['p1', 'design pr', 'design pressure', 'operating pressure', 'design cond', 'p1 / design pressure'],
  t1:           ['t1', 'design temp', 'design temperature', 'operating temp', 't1 (c)', 't1 (ºc)'],
  t2:           ['t2', 'temp', 'temperature', 'temp max', 't2 (c)', 't2 (ºc)'],
  t3:           ['t3', 'temp min', 'minimum temp', 'min temp', 'temperature min', 'min', 't3 (c)', 't3 (ºc)'],
  insThk:       ['insulation', 'ins thk', 'insthk', 'insulation thickness'],
  densityMixed: ['mixed', 'density mixed', 'mixed kg', 'mixed density'],
  densityGas:   ['gas kg', 'density gas', 'gas density'],
  densityLiquid:['liquid kg', 'density liquid', 'density liquid'],
  phase:        ['phase', 'fluid phase', 'medium phase'],
  hydroPressure:['hydropressure', 'hydro test pressure', 'hydrotest pressure', 'hydro pressure', 'test pressure', 'hydro/test pressure'],
});

function _xmlCiiLabelRowHint(header, rawRows) {
  // Only applies to __EMPTY_* headers
  if (!_toText(header).startsWith('__EMPTY')) return {};
  const SCAN_ROWS = 3;
  const scores = {};
  for (let ri = 0; ri < Math.min(SCAN_ROWS, rawRows.length); ri++) {
    const cellText = _toText(rawRows[ri]?.[header]).toLowerCase().trim();
    if (!cellText || cellText.length > 60) continue;
    for (const [fieldName, keywords] of Object.entries(_XML_CII_LABEL_ROW_KEYWORDS)) {
      for (const kw of keywords) {
        if (cellText === kw || cellText.includes(kw) || kw.includes(cellText)) {
          // Exact keyword match in first label row scores highest
          const score = ri === 0 ? 110 : (ri === 1 ? 90 : 75);
          if (!scores[fieldName] || score > scores[fieldName]) scores[fieldName] = score;
        }
      }
    }
  }
  return scores;
}

// ---------------------------------------------------------------------------
// Data-value heuristics: identify __EMPTY_* columns by the content of their
// cells. Returns a confidence 0-100 per field.
// ---------------------------------------------------------------------------
function _xmlCiiDataValueScore(header, fieldName, rawRows) {
  if (!_toText(header).startsWith('__EMPTY')) return 0;
  const SAMPLE = 8;
  const values = [];
  for (const row of rawRows) {
    if (values.length >= SAMPLE) break;
    const v = _toText(row?.[header]).trim();
    if (v && v !== header) values.push(v);
  }
  if (!values.length) return 0;
  const n = values.length;
  const numeric = (v) => !Number.isNaN(Number(v)) && v !== '';
  const inRange = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) && x >= lo && x <= hi; };
  const passRate = (fn) => values.filter(fn).length / n;

  switch (fieldName) {
    case 'lineSeqNo': {
      // Pure digit strings 4-10 chars starting with digit
      const p = passRate((v) => /^\d[A-Z0-9]{3,11}$/i.test(v));
      return Math.round(p * 70);
    }
    case 'lineKey1': {
      // Short ALL-CAPS word tokens, letters only, 1-6 chars (service codes)
      const p = passRate((v) => /^[A-Z]{1,6}$/.test(v));
      return Math.round(p * 72);
    }
    case 'lineKey2': {
      // Pure digit strings 5-10 chars (line number part)
      const p = passRate((v) => /^\d{5,10}$/.test(v));
      return Math.round(p * 72);
    }
    case 'pipingClass': {
      // Alphanumeric 1-8 chars optionally with / or -
      const p = passRate((v) => /^[A-Z0-9]{1,4}[/\-]?[A-Z0-9]{0,6}$/i.test(v) && v.length >= 2 && v.length <= 10 && !numeric(v));
      return Math.round(p * 68);
    }
    case 'material': {
      // Starts with letters, may contain digits + L/N suffixes
      const p = passRate((v) => /^[A-Z]{1,4}[A-Z0-9]{0,8}$/i.test(v) && !numeric(v) && v.length >= 2);
      return Math.round(p * 65);
    }
    case 'convertedBore': {
      // Numeric 6-1200 (DN sizes)
      const p = passRate((v) => inRange(v.replace(/"$/, ''), 6, 1200));
      return Math.round(p * 65);
    }
    case 'p1': {
      const p = passRate((v) => inRange(v, 0, 1000));
      return Math.round(p * 62);
    }
    case 't1':
    case 't2':
    case 't3': {
      const p = passRate((v) => inRange(v, -200, 800));
      return Math.round(p * 62);
    }
    case 'insThk': {
      const p = passRate((v) => inRange(v, 0, 500));
      return Math.round(p * 60);
    }
    case 'densityMixed':
    case 'densityGas':
    case 'densityLiquid': {
      const p = passRate((v) => inRange(v, 0.01, 2000));
      return Math.round(p * 60);
    }
    case 'phase': {
      const phases = new Set(['g', 'l', 'm', 'gas', 'liquid', 'mixed', '2p', 'liq', 'vap', 'vapour', 'vapor']);
      const p = passRate((v) => phases.has(v.toLowerCase()));
      return p >= 0.8 ? Math.round(p * 75) : 0;
    }
    case 'rating': {
      const knownRatings = new Set(['150', '300', '600', '900', '1500', '2500']);
      const p = passRate((v) => knownRatings.has(v.replace(/cl|pn|#/gi, '').trim()) || /^(cl|pn)?\s*(\d{2,4})$/i.test(v));
      return Math.round(p * 62);
    }
    default: return 0;
  }
}

function _xmlCiiOrderedAliasEntries(masterDef) {
  const aliases = masterDef?.aliases || {};
  const entries = [];
  const used = new Set();
  for (const fieldName of masterDef?.autoMapOrder || []) {
    if (!Object.prototype.hasOwnProperty.call(aliases, fieldName)) continue;
    entries.push([fieldName, aliases[fieldName]]);
    used.add(fieldName);
  }
  for (const entry of Object.entries(aliases)) {
    if (!used.has(entry[0])) entries.push(entry);
  }
  return entries;
}


function _xmlCiiAutoMapFields(headers, masterDef, rawRows) {
  const safeRows = Array.isArray(rawRows) ? rawRows : [];
  const mapped = {};
  // Track which headers are claimed to avoid double-assigning
  const claimed = new Set();
  const aliasEntries = _xmlCiiOrderedAliasEntries(masterDef);

  // --- Pass 1: standard header-text scoring (existing logic) ---
  for (const [fieldName, aliases] of aliasEntries) {
    let bestHeader = '';
    let bestScore = 0;
    for (const header of headers) {
      const score = _xmlCiiHeaderScore(header, aliases);
      const headerText = _toText(header).trim().toUpperCase();
      if (fieldName === 'pipingClass' && headerText === 'CONSTRUCTION CLASS') continue;
      if (score > bestScore) {
        bestHeader = header;
        bestScore = score;
      }
    }
    if (bestScore >= 60) {
      mapped[fieldName] = bestHeader;
      claimed.add(bestHeader);
    } else {
      mapped[fieldName] = '';
    }
  }

  // --- Pass 2: label-row hint + data-value heuristics for unmapped __EMPTY_* fields ---
  if (safeRows.length) {
    // Build label-row hint scores for every __EMPTY_* header
    const labelHints = {}; // header -> { fieldName -> score }
    for (const header of headers) {
      if (!_toText(header).startsWith('__EMPTY')) continue;
      labelHints[header] = _xmlCiiLabelRowHint(header, safeRows);
    }

    // For each unmapped field, find the best unclaimed __EMPTY_* column
    for (const [fieldName] of aliasEntries) {
      if (mapped[fieldName]) continue; // already mapped by text score
      let bestHeader = '';
      let bestScore = 0;
      for (const header of headers) {
        if (!_toText(header).startsWith('__EMPTY')) continue;
        if (claimed.has(header)) continue;
        const labelScore = (labelHints[header] || {})[fieldName] || 0;
        const dataScore = labelScore >= 90 ? 0 : _xmlCiiDataValueScore(header, fieldName, safeRows);
        const total = Math.max(labelScore, dataScore);
        if (total > bestScore) {
          bestHeader = header;
          bestScore = total;
        }
      }
      if (bestScore >= 60) {
        mapped[fieldName] = bestHeader;
        claimed.add(bestHeader);
      }
    }
  }

  return mapped;
}

function _xmlCiiMapRowsWithFieldMap(rawRows, fieldMap, masterKey) {
  if (masterKey === 'linelist') {
    return (Array.isArray(rawRows) ? rawRows : []).map((row, index) => _normalizeLineListRow(row, fieldMap, index));
  }
  return (Array.isArray(rawRows) ? rawRows : []).map((row, index) => {
    const mapped = { _sourceRowIndex: row?._rowIndex || index + 1, _raw: row };
    for (const [fieldName, sourceHeader] of Object.entries(fieldMap || {})) {
      mapped[fieldName] = sourceHeader ? row?.[sourceHeader] ?? '' : '';
    }
    const key1 = _toText(mapped.lineKey1).trim();
    const key2 = _toText(mapped.lineKey2).trim();
    if (key1 || key2) mapped.lineNo = `${key1}${key2}`;
    else if (_toText(mapped.lineNo).trim() === '' && _toText(mapped.lineSeqNo).trim()) mapped.lineNo = _toText(mapped.lineSeqNo).trim();
    const convertedBore = _xmlCiiConvertLineListBore(mapped.convertedBore);
    if (convertedBore !== '') mapped.convertedBore = convertedBore;
    const phase = _toText(mapped.phase).trim().toUpperCase();
    if (phase.startsWith('M') && _toText(mapped.densityMixed).trim()) mapped.density = mapped.densityMixed;
    else if (phase.startsWith('G') && _toText(mapped.densityGas).trim()) mapped.density = mapped.densityGas;
    else if (phase.startsWith('L') && _toText(mapped.densityLiquid).trim()) mapped.density = mapped.densityLiquid;
    else if (_toText(mapped.densityMixed).trim()) mapped.density = mapped.densityMixed;
    else if (_toText(mapped.densityGas).trim()) mapped.density = mapped.densityGas;
    else if (_toText(mapped.densityLiquid).trim()) mapped.density = mapped.densityLiquid;
    if (row?.ColumnX1 != null && row.ColumnX1 !== '' && mapped.ColumnX1 == null) mapped.ColumnX1 = row.ColumnX1;
    return mapped;
  });
}

function _xmlCiiConvertLineListBore(value) {
  const text = _toText(value).trim();
  if (!text) return '';
  const rangeMatch = text.replace(/[–—]/g, '-').match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  const numberText = rangeMatch
    ? String(Math.max(Number(rangeMatch[1]), Number(rangeMatch[2])))
    : (_toText(text).match(/\d+(?:\.\d+)?/) || [''])[0];
  if (!numberText) return '';
  const numeric = Number(numberText);
  if (!Number.isFinite(numeric)) return '';
  if (numeric > 30) return String(Math.round(numeric));
  const npsToDn = {
    0.25: 8,
    0.375: 10,
    0.5: 15,
    0.75: 20,
    1: 25,
    1.25: 32,
    1.5: 40,
    2: 50,
    2.5: 65,
    3: 80,
    4: 100,
    5: 125,
    6: 150,
    8: 200,
    10: 250,
    12: 300,
    14: 350,
    16: 400,
    18: 450,
    20: 500,
    24: 600,
  };
  return String(npsToDn[numeric] || Math.round(numeric * 25.4));
}

function _xmlCiiRowsToTableHtml(rows, maxRows, fieldMap) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return '<div class="model-converters-workflow-empty">No rows loaded.</div>';
  const headerLabels = {
    _sourceRowIndex: 'Row #',
    lineNo: 'Line No. Key',
    lineSeqNo: 'Line Seq No.',
    lineKey1: 'Key 1',
    lineKey2: 'Key 2',
    pipingClass: 'Piping Class',
    rating: 'Rating',
    material: 'Material',
    convertedBore: 'Bore',
    p1: 'Design Pressure',
    t1: 'Design Temp',
    hydroPressure: 'Hydro Test Pressure',
    t2: 'T2',
    t3: 'T3',
    densityMixed: 'Density Mixed',
    densityGas: 'Density Gas',
    densityLiquid: 'Density Liquid',
    density: 'Density',
    phase: 'Phase',
    insThk: 'Ins. Thickness',
    // Piping Class Master
    componentType: 'Component Type',
    materialName: 'Material Name',
    schedule: 'Schedule',
    wallThickness: 'Wall Thickness',
    corrosion: 'Corrosion',
    endCondition: 'End Condition',
    // Material Map
    code: 'Material Code',
    spec: 'Spec',
    // Weights
    bore: 'Bore',
    length: 'Length',
    valveType: 'Valve Type',
    weight: 'Weight'
  };
  const HIDDEN_KEYS = new Set(['_raw', '_sourceRowIndex', '_rowIndex']);
  let headers = [];
  if (fieldMap && typeof fieldMap === 'object' && Object.keys(fieldMap).length > 0) {
    headers.push('_sourceRowIndex');
    if (safeRows.some(row => 'lineNo' in row)) {
      headers.push('lineNo');
    }
    for (const field of Object.keys(fieldMap)) {
      if (fieldMap[field] && field !== 'lineKey1' && field !== 'lineKey2' && field !== 'lineNo') {
        headers.push(field);
      }
    }
    if (safeRows.some((row) => _toText(row?.density).trim()) && !headers.includes('density')) {
      headers.push('density');
    }
    headers = Array.from(new Set(headers));
  } else {
    headers = _xmlCiiHeadersFromRows(safeRows)
      .filter((header) => !HIDDEN_KEYS.has(header))
      .slice(0, 18);
  }
  return `
    <div class="model-converters-workflow-table-wrap">
      <table class="model-converters-workflow-table">
        <thead><tr>${headers.map((header) => `<th>${_esc(headerLabels[header] || header)}</th>`).join('')}</tr></thead>
        <tbody>
          ${safeRows.slice(0, maxRows).map((row) => `
            <tr>${headers.map((header) => {
              const densityStyle = header === 'density'
                ? ' style="font-family:Georgia, Times New Roman, serif;font-style:italic;color:#2f5597;" title="Derived density from phase-specific line-list fields"'
                : '';
              return `<td${densityStyle}>${_esc(row?.[header] ?? '')}</td>`;
            }).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
      ${safeRows.length > maxRows ? `<div class="model-converters-workflow-note">Showing ${maxRows} of ${safeRows.length} rows.</div>` : ''}
    </div>
  `;
}


function _xmlCiiParseJsonRows(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  if (parsed?.masters && typeof parsed.masters === 'object') return parsed.masters;
  throw new Error('JSON must be an array, { rows }, or { masters }.');
}

async function _xmlCiiGetXlsxModule() {
  if (window.XLSX?.read && window.XLSX?.utils?.sheet_to_json) return window.XLSX;
  try {
    const module = await import('xlsx');
    const xlsx = module?.read ? module : module?.default;
    if (xlsx?.read && xlsx?.utils?.sheet_to_json) return xlsx;
  } catch (error) {
    throw new Error(`Local XLSX parser failed to load from import map: ${error?.message || String(error)}`);
  }
  throw new Error('Local XLSX parser did not expose read/utils. Run npm install and refresh the page.');
}

async function _xmlCiiReadWorkbookFile(file) {
  const XLSX = await _xmlCiiGetXlsxModule();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) throw new Error('Workbook contains no readable sheets.');
  const sheets = {};
  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
    sheets[sheetName] = rows.map((row, index) => ({ _rowIndex: index + 1, ...row }));
  }
  return { sheetNames, selectedSheet: sheetNames[0], sheets, rows: sheets[sheetNames[0]] || [] };
}

async function _xmlCiiReadMasterFile(file) {
  if (/\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(file?.name || '')) return _xmlCiiReadWorkbookFile(file);
  const text = await file.text();
  const rows = /\.json$/i.test(file?.name || '')
    ? _xmlCiiParseJsonRows(text)
    : _xmlCiiParseDelimitedText(text);
  return { sheetNames: [], selectedSheet: '', sheets: {}, rows: Array.isArray(rows) ? rows : [] };
}

function _xmlCiiMasterRowsFromConfig(config, masterDef) {
  const section = config?.[masterDef.sectionKey];
  const rows = section?.[masterDef.rowsKey];
  if (!Array.isArray(rows)) return [];
  if (masterDef.sectionKey !== 'pipingClass') return rows;
  return rows.filter((row) => {
    const key = _toText(row?.pipingClass ?? row?.['Piping Class']).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return row?._smartMasterPlaceholder !== true && key !== 'ONDEMAND';
  });
}

function _xmlCiiMasterFieldMapFromConfig(config, masterDef) {
  const fieldMap = config?.[masterDef.sectionKey]?.[masterDef.fieldMapKey];
  return fieldMap && typeof fieldMap === 'object' && !Array.isArray(fieldMap) ? fieldMap : {};
}

function _xmlCiiSaveMasterToConfig(values, masterDef, rows, fieldMap) {
  const config = _parseXmlCiiEnrichmentConfig(values.supportConfigJson);
  if (!config[masterDef.sectionKey] || typeof config[masterDef.sectionKey] !== 'object') {
    config[masterDef.sectionKey] = {};
  }
  config[masterDef.sectionKey][masterDef.rowsKey] = Array.isArray(rows) ? rows : [];
  config[masterDef.sectionKey][masterDef.fieldMapKey] = fieldMap && typeof fieldMap === 'object' ? fieldMap : {};
  values.supportConfigJson = JSON.stringify(config, null, 2);
  return config;
}

function _createWorkerRuntime() {
  const worker = new Worker(new URL('../converters/py-worker.js?v=20260729-inputxml-live-release-1', import.meta.url), { type: 'module' });
  const pending = new Map();
  let nextJobId = 1;

  const onMessage = (event) => {
    const payload = event.data || {};
    const pendingJob = pending.get(payload.jobId);
    if (!pendingJob) return;
    pending.delete(payload.jobId);
    const validation = validateConverterWorkerResponse(payload);
    if (!validation.ok) {
      pendingJob.reject(new Error(validation.error));
      return;
    }
    if (payload.ok) pendingJob.resolve(payload);
    else pendingJob.reject(new Error(_toText(payload.error || 'Converter worker failed.')));
  };

  const onError = (event) => {
    for (const pendingJob of pending.values()) {
      pendingJob.reject(new Error(_toText(event?.message || 'Converter worker crashed.')));
    }
    pending.clear();
  };

  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);

  function runJob(request) {
    const jobId = nextJobId;
    nextJobId += 1;
    const transfer = [];
    for (const fileSpec of request.inputFiles || []) {
      if (fileSpec?.bytes instanceof ArrayBuffer) transfer.push(fileSpec.bytes);
    }
    const payload = { type: 'run', jobId, ...request };
    return new Promise((resolve, reject) => {
      pending.set(jobId, { resolve, reject });
      worker.postMessage(
        buildConverterWorkerRequest(jobId, payload.converterId, payload.inputFiles, payload.options),
        transfer,
      );
    });
  }

  function dispose() {
    worker.removeEventListener('message', onMessage);
    worker.removeEventListener('error', onError);
    worker.terminate();
    pending.clear();
  }

  return { runJob, dispose };
}

function _loadStoredState() {
  return loadStoredState();
}

function _saveStoredState(selectedConverter, defaultsByConverter) {
  return saveStoredState(selectedConverter, defaultsByConverter);
}

const XML_CII_MASTER_HIDDEN_PREFIX = '⟨hidden — ';

const STORAGE_MASTER_ARRAY_PATHS = Object.freeze([
  Object.freeze(['linelist', 'masterRows']),
  Object.freeze(['pipingClass', 'masterRows']),
  Object.freeze(['material', 'mapRows']),
  Object.freeze(['weight', 'masterRows']),
]);

const XML_CII_STORAGE_MASTER_ARRAY_PATHS = STORAGE_MASTER_ARRAY_PATHS;
if (typeof globalThis !== 'undefined' && !globalThis.XML_CII_STORAGE_MASTER_ARRAY_PATHS) {
  Object.defineProperty(globalThis, 'XML_CII_STORAGE_MASTER_ARRAY_PATHS', {
    value: XML_CII_STORAGE_MASTER_ARRAY_PATHS,
    configurable: true,
  });
}
if (typeof globalThis !== 'undefined' && !globalThis.STORAGE_MASTER_ARRAY_PATHS) {
  Object.defineProperty(globalThis, 'STORAGE_MASTER_ARRAY_PATHS', {
    value: XML_CII_STORAGE_MASTER_ARRAY_PATHS,
    configurable: true,
  });
}

// Build a compact view of the enrichment config for the 7 Config editor: the
// bulky master arrays are replaced by a short placeholder string so the editor
// stays small (KB, not MB) and never freezes the page. The full data is kept in
// memory and re-merged on save.
function _xmlCiiCompactConfigForEditor(fullJsonText) {
  let config;
  try { config = JSON.parse(_toText(fullJsonText) || '{}'); }
  catch { return { text: _toText(fullJsonText), hiddenRows: 0 }; }
  let hiddenRows = 0;
  for (const [section, key] of STORAGE_MASTER_ARRAY_PATHS) {
    const arr = config && config[section] ? config[section][key] : null;
    if (Array.isArray(arr) && arr.length) {
      hiddenRows += arr.length;
      config[section][key] = `${XML_CII_MASTER_HIDDEN_PREFIX}${arr.length} rows. Manage in “2 Import Masters”; Export JSON for the full data.⟩`;
    }
  }
  return { text: JSON.stringify(config, null, 2), hiddenRows };
}

// Merge an edited compact config back over the full config. Placeholder strings
// at master paths keep the original (hidden) rows; a real array replaces them.
// Throws on invalid JSON so the caller can surface the parse error.
function _xmlCiiMergeEditedConfig(editedText, fullJsonText) {
  const edited = JSON.parse(_toText(editedText) || '{}');
  let full = {};
  try { full = JSON.parse(_toText(fullJsonText) || '{}'); } catch { full = {}; }
  for (const [section, key] of STORAGE_MASTER_ARRAY_PATHS) {
    const editedVal = edited && edited[section] ? edited[section][key] : undefined;
    if (typeof editedVal === 'string' && editedVal.startsWith(XML_CII_MASTER_HIDDEN_PREFIX)) {
      if (edited[section] && typeof edited[section] === 'object') {
        edited[section][key] = Array.isArray(full?.[section]?.[key]) ? full[section][key] : [];
      }
    }
  }
  return JSON.stringify(edited, null, 2);
}

function _readOptionValue(field, input) {
  if (field.type === 'checkbox') return !!input.checked;
  if (field.type === 'number') {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : 0;
  }
  return input.value;
}

function _summarizeJsonConfig(text) {
  const source = String(text || '').trim();
  if (!source) return 'Empty config (default script config will apply).';
  try {
    const parsed = JSON.parse(source);
    const keys = Object.keys(parsed || {});
    return `Configured keys: ${keys.join(', ') || '(none)'}`;
  } catch {
    return 'Invalid JSON (converter will fail until fixed).';
  }
}

const INPUTXML2019_POPUP_HEADER_KEYS = Object.freeze([
  'inferReducerAngleFromGeometry',
  'defaultDiameter',
  'defaultWallThickness',
  'defaultInsulationThickness',
  'defaultCorrosionAllowance',
  'defaultTemperature1',
  'defaultTemperature2',
  'defaultTemperature3',
  'defaultReducerAngle',
  'coordReconstructionTolerance',
  'headerDateTime',
  'headerSource',
  'headerVersion',
  'headerUserName',
  'headerPurpose',
  'headerProjectName',
  'headerMdbName',
]);

// True CII header-only subset of the list above, used to split the InputXML->CII(2019)
// popup's fields into a "CII Header" group vs. a "Global Defaults" group. The broader
// INPUTXML2019_POPUP_HEADER_KEYS list (defaults + header combined) is left untouched
// since it's also used by the legacy "Open Popup" advanced-options button.
const INPUTXML2019_CII_HEADER_ONLY_KEYS = Object.freeze([
  'headerDateTime',
  'headerSource',
  'headerVersion',
  'headerUserName',
  'headerPurpose',
  'headerProjectName',
  'headerMdbName',
]);

function _popupFieldValueToTyped(field, input) {
  if (field.type === 'checkbox') return !!input.checked;
  if (field.type === 'number') {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : 0;
  }
  return String(input.value ?? '');
}

function _popupFieldValueAsText(field) {
  if (field.type === 'checkbox') return '';
  if (field.type === 'number') return Number.isFinite(Number(field.value)) ? String(field.value) : '0';
  return String(field.value ?? '');
}

/**
 * Human-readable group/label metadata for the "elements.rowN[i]" config
 * paths written by converters/scripts/inputxml_to_cii2019.py's per-element
 * CII block (rows 3-14 of the 15-line ELEMENTS record; row1/row2 are
 * FROM_NODE/TO_NODE/geometry/diameter/wall/insulation/corrosion/temp1-3 and
 * are never shown here since the engine never reads them from this config
 * at all - they're always the raw PIPINGELEMENT attributes).
 *
 * `editable: false` entries are fields the engine ALWAYS recomputes from
 * the loaded InputXML's PIPINGELEMENT attributes per element, ignoring
 * whatever is configured here - editing them in this popup has no effect
 * on the generated CII. Confirmed directly against _build_cii_text(): row3
 * (TEMP_EXP_C4-9), row4 (PRESSURE_C1-6), row5[0-2] (PRESSURE_C7-9), row6[0-1]
 * (INSUL_DENSITY/FLUID_DENSITY), row6[5] (HYDRO_PRESSURE) are all built
 * directly from the parsed element, never from elements_cfg.
 *
 * The remaining slots (row5[3-5], row6[2-4], row7, row8, row9, row11) have
 * no PIPINGELEMENT attribute at all - they're genuinely config-only. Their
 * exact real-CAESAR-REL-record meaning past what's in the engine's own code
 * comment ("Elastic Modulus cold, Poisson's Ratio, Pipe Density, Mill
 * Tolerances, Seam Weld" for row5/row6's tail; row7-9/row11 undocumented)
 * is NOT independently verified against a real CAESAR export - labeled
 * "(unverified)" rather than stated as fact.
 */
// Default RESTRAINT/TYPE remap template for InputXML sourced from a CAESAR
// EXPORTED XML whose numeric TYPE codes don't match what CII expects (e.g.
// AutoPIPE/PSI-side codes vs CAESAR II's own). Shares the exact template
// already proven out in xml-compare's "Restraint Type Conversion" enrichment
// section, applied here to layoutConfigJson.restraint.explicit_type_map.
const DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS = _XML_COMPARE_ENRICHMENT_DEFAULTS.restraintTypeConvert.rows;

const ELEMENTS_ROW_FIELD_META = Object.freeze({
  'elements.row3[0]': { group: 'Temperature Cases 4-9 (from source XML)', label: 'Temperature Case 4', editable: false, note: 'Always uses PIPINGELEMENT/TEMP_EXP_C4 from the loaded InputXML.' },
  'elements.row3[1]': { group: 'Temperature Cases 4-9 (from source XML)', label: 'Temperature Case 5', editable: false, note: 'Always uses PIPINGELEMENT/TEMP_EXP_C5 from the loaded InputXML.' },
  'elements.row3[2]': { group: 'Temperature Cases 4-9 (from source XML)', label: 'Temperature Case 6', editable: false, note: 'Always uses PIPINGELEMENT/TEMP_EXP_C6 from the loaded InputXML.' },
  'elements.row3[3]': { group: 'Temperature Cases 4-9 (from source XML)', label: 'Temperature Case 7', editable: false, note: 'Always uses PIPINGELEMENT/TEMP_EXP_C7 from the loaded InputXML.' },
  'elements.row3[4]': { group: 'Temperature Cases 4-9 (from source XML)', label: 'Temperature Case 8', editable: false, note: 'Always uses PIPINGELEMENT/TEMP_EXP_C8 from the loaded InputXML.' },
  'elements.row3[5]': { group: 'Temperature Cases 4-9 (from source XML)', label: 'Temperature Case 9', editable: false, note: 'Always uses PIPINGELEMENT/TEMP_EXP_C9 from the loaded InputXML.' },
  'elements.row4[0]': { group: 'Pressure Cases 1-6 (from source XML)', label: 'Pressure Case 1', editable: false, note: 'Always uses PIPINGELEMENT/PRESSURE_C1 from the loaded InputXML.' },
  'elements.row4[1]': { group: 'Pressure Cases 1-6 (from source XML)', label: 'Pressure Case 2', editable: false, note: 'Always uses PIPINGELEMENT/PRESSURE_C2 from the loaded InputXML.' },
  'elements.row4[2]': { group: 'Pressure Cases 1-6 (from source XML)', label: 'Pressure Case 3', editable: false, note: 'Always uses PIPINGELEMENT/PRESSURE_C3 from the loaded InputXML.' },
  'elements.row4[3]': { group: 'Pressure Cases 1-6 (from source XML)', label: 'Pressure Case 4', editable: false, note: 'Always uses PIPINGELEMENT/PRESSURE_C4 from the loaded InputXML.' },
  'elements.row4[4]': { group: 'Pressure Cases 1-6 (from source XML)', label: 'Pressure Case 5', editable: false, note: 'Always uses PIPINGELEMENT/PRESSURE_C5 from the loaded InputXML.' },
  'elements.row4[5]': { group: 'Pressure Cases 1-6 (from source XML)', label: 'Pressure Case 6', editable: false, note: 'Always uses PIPINGELEMENT/PRESSURE_C6 from the loaded InputXML.' },
  'elements.row5[0]': { group: 'Pressure Cases 7-9 (from source XML)', label: 'Pressure Case 7', editable: false, note: 'Always uses PIPINGELEMENT/PRESSURE_C7 from the loaded InputXML.' },
  'elements.row5[1]': { group: 'Pressure Cases 7-9 (from source XML)', label: 'Pressure Case 8', editable: false, note: 'Always uses PIPINGELEMENT/PRESSURE_C8 from the loaded InputXML.' },
  'elements.row5[2]': { group: 'Pressure Cases 7-9 (from source XML)', label: 'Pressure Case 9', editable: false, note: 'Always uses PIPINGELEMENT/PRESSURE_C9 from the loaded InputXML.' },
  'elements.row5[3]': { group: 'Other Element Properties (config-only, unverified)', label: 'Elastic Modulus, Cold (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute - always uses this config value. Exact field identity not independently verified.' },
  'elements.row5[4]': { group: 'Other Element Properties (config-only, unverified)', label: "Poisson's Ratio (unverified)", editable: true, note: 'No PIPINGELEMENT source attribute - always uses this config value. Exact field identity not independently verified.' },
  'elements.row5[5]': { group: 'Other Element Properties (config-only, unverified)', label: 'Pipe Density (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute - always uses this config value. Exact field identity not independently verified.' },
  'elements.row6[0]': { group: 'Densities & Hydro Pressure (from source XML)', label: 'Insulation Density', editable: false, note: 'Always uses PIPINGELEMENT/INSUL_DENSITY from the loaded InputXML.' },
  'elements.row6[1]': { group: 'Densities & Hydro Pressure (from source XML)', label: 'Fluid Density', editable: false, note: 'Always uses PIPINGELEMENT/FLUID_DENSITY from the loaded InputXML.' },
  'elements.row6[2]': { group: 'Other Element Properties (config-only, unverified)', label: 'Mill Tolerance, Plus (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute - always uses this config value. Exact field identity not independently verified.' },
  'elements.row6[3]': { group: 'Other Element Properties (config-only, unverified)', label: 'Mill Tolerance, Minus (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute - always uses this config value. Exact field identity not independently verified.' },
  'elements.row6[4]': { group: 'Other Element Properties (config-only, unverified)', label: 'Seam Weld Factor (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute - always uses this config value. Exact field identity not independently verified.' },
  'elements.row6[5]': { group: 'Densities & Hydro Pressure (from source XML)', label: 'Hydro Test Pressure', editable: false, note: 'Always uses PIPINGELEMENT/HYDRO_PRESSURE from the loaded InputXML.' },
  'elements.row7[0]': { group: 'Other Element Properties, Row 7 (config-only, unverified)', label: 'Row 7, Slot 1 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row7[1]': { group: 'Other Element Properties, Row 7 (config-only, unverified)', label: 'Row 7, Slot 2 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row7[2]': { group: 'Other Element Properties, Row 7 (config-only, unverified)', label: 'Row 7, Slot 3 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row7[3]': { group: 'Other Element Properties, Row 7 (config-only, unverified)', label: 'Row 7, Slot 4 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row7[4]': { group: 'Other Element Properties, Row 7 (config-only, unverified)', label: 'Row 7, Slot 5 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row7[5]': { group: 'Other Element Properties, Row 7 (config-only, unverified)', label: 'Row 7, Slot 6 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row8[0]': { group: 'Other Element Properties, Row 8 (config-only, unverified)', label: 'Row 8, Slot 1 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row8[1]': { group: 'Other Element Properties, Row 8 (config-only, unverified)', label: 'Row 8, Slot 2 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row8[2]': { group: 'Other Element Properties, Row 8 (config-only, unverified)', label: 'Row 8, Slot 3 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row8[3]': { group: 'Other Element Properties, Row 8 (config-only, unverified)', label: 'Row 8, Slot 4 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row8[4]': { group: 'Other Element Properties, Row 8 (config-only, unverified)', label: 'Allowable Limit, Max (unverified, default 9999.99 = "no limit")', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row8[5]': { group: 'Other Element Properties, Row 8 (config-only, unverified)', label: 'Allowable Limit, Min (unverified, default 9999.99 = "no limit")', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row9[0]': { group: 'Other Element Properties, Row 9 (config-only, unverified)', label: 'Row 9, Slot 1 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row9[1]': { group: 'Other Element Properties, Row 9 (config-only, unverified)', label: 'Row 9, Slot 2 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row9[2]': { group: 'Other Element Properties, Row 9 (config-only, unverified)', label: 'Row 9, Slot 3 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row9[3]': { group: 'Other Element Properties, Row 9 (config-only, unverified)', label: 'Row 9, Slot 4 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row9[4]': { group: 'Other Element Properties, Row 9 (config-only, unverified)', label: 'Row 9, Slot 5 (unverified)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row11[0]': { group: 'Control Flags, Row 11 (config-only, unverified)', label: 'Row 11, Flag 1 (unverified, default -1)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
  'elements.row11[1]': { group: 'Control Flags, Row 11 (config-only, unverified)', label: 'Row 11, Flag 2 (unverified, default -1)', editable: true, note: 'No PIPINGELEMENT source attribute; real CAESAR field identity not documented in this codebase.' },
});

function _elementsRowFieldMeta(path) {
  const direct = ELEMENTS_ROW_FIELD_META[path];
  if (direct) return direct;
  if (/^elements\.row10\b/.test(path)) {
    return { group: 'Line Number Placeholder (usually unused)', label: 'Row 10 filler', editable: true, note: 'The real Line Number comes from the source XML LINE/LINE_ID attribute (or elements.line_label below), not this value - it is a positional filler in the CII record.' };
  }
  if (/^elements\.row1[234]\b/.test(path)) {
    return { group: 'Auxiliary Block Index Template (structural)', label: null, editable: true, note: 'Placeholders like {bend}/{rigid}/{restraint}/{sif}/{reducer} are substituted with real per-element index values - only edit the literal "0" slots, and only if you understand the CII 2019 aux-block index layout.' };
  }
  return null;
}

function _flattenConfigRows(value, path, rows) {
  if (Array.isArray(value)) {
    if (!value.length) {
      rows.push({ path, type: 'array', value: '[]' });
      return;
    }
    for (let index = 0; index < value.length; index += 1) {
      _flattenConfigRows(value[index], `${path}[${index}]`, rows);
    }
    return;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) {
      rows.push({ path, type: 'object', value: '{}' });
      return;
    }
    for (const [key, child] of entries) {
      _flattenConfigRows(child, path ? `${path}.${key}` : key, rows);
    }
    return;
  }
  rows.push({
    path,
    type: value === null ? 'null' : typeof value,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  });
}

function _pathParts(pathStr) {
  return String(pathStr || '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
}

function _getValueAtPath(obj, pathStr) {
  let cur = obj;
  for (const part of _pathParts(pathStr)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function _setValueAtPath(obj, pathStr, value) {
  const parts = _pathParts(pathStr);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (cur == null || typeof cur !== 'object') return;
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  if (cur != null && typeof cur === 'object' && parts.length) {
    cur[parts[parts.length - 1]] = value;
  }
}

function _branchElementIsAllNonSource(element) {
  return element.fields.every((field) => field.usedDefault || field.usedCarryForward);
}

function _branchFieldCellHtml(element, field, editedValue) {
  const hasEdit = editedValue !== undefined;
  const displayValue = hasEdit ? editedValue : (Number.isFinite(field.appliedValue) ? field.appliedValue : '');
  let borderColor = '#31455f';
  let title = 'From source file.';
  if (field.usedCarryForward) { borderColor = '#7aa6ff'; title = `Missing/sentinel in source; carried forward from a previous element (${_esc(field.label)}).`; }
  if (field.usedDefault) { borderColor = '#c9a24a'; title = `Missing from source; using the Global Defaults tab value (${_esc(field.label)}).`; }
  if (hasEdit) { borderColor = '#5ad1a0'; title = `Edited in this popup - will be written into the InputXML attribute ${_esc(field.attr)} on Save.`; }
  return `<td style="padding:2px 4px;border-bottom:1px solid #24354a;">
    <input type="text" inputmode="decimal" value="${_esc(displayValue)}" title="${title}"
      data-branch-field-input="${_esc(field.attr)}" data-element-index="${element.index}"
      style="width:82px;background:#182334;color:#e6edf5;border:1px solid ${borderColor};border-radius:4px;padding:3px 5px;font-size:12px;box-sizing:border-box;">
  </td>`;
}

function _branchOtherFieldsCellHtml(element) {
  if (!element.otherFields?.length) return '<td style="padding:4px 6px;border-bottom:1px solid #24354a;color:#5c7291;">&mdash;</td>';
  const text = element.otherFields.map((field) => `${field.attr}=${field.value}`).join(', ');
  return `<td style="padding:4px 6px;border-bottom:1px solid #24354a;color:#9aa8ba;font-size:11px;" title="Present in the source XML but not one of the editable fields above; shown for reference only.">
    <div style="max-height:80px;overflow-y:auto;white-space:normal;word-break:break-all;max-width:300px;">
      ${_esc(text)}
    </div>
  </td>`;
}

function _branchElementRowHtml(element, editsByElement, hasOtherFields) {
  const edits = editsByElement.get(element.index);
  return `
    <tr>
      <td style="padding:4px 6px;border-bottom:1px solid #24354a;color:#d7e6ff;">${_esc(element.fromNode)}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #24354a;color:#d7e6ff;">${_esc(element.toNode)}</td>
      ${element.fields.map((field) => _branchFieldCellHtml(element, field, edits?.get(field.attr))).join('')}
      ${hasOtherFields ? _branchOtherFieldsCellHtml(element) : ''}
    </tr>
  `;
}

function _branchPreviewHtml(branchPreview, editsByElement, expandedBranches) {
  if (!branchPreview || !branchPreview.ok || !branchPreview.branches?.length) {
    return '<div style="color:#9aa8ba;">No PIPINGELEMENT rows were found in the loaded InputXML.</div>';
  }
  const hasOtherFields = branchPreview.otherFieldNames.length > 0;
  const columnCount = 2 + FIELD_SPECS.length + (hasOtherFields ? 1 : 0);
  const headerHtml = `
    <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #31455f;color:#9cc5ff;">From</th>
    <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #31455f;color:#9cc5ff;">To</th>
    ${FIELD_SPECS.map((field) => `<th style="text-align:left;padding:4px 6px;border-bottom:1px solid #31455f;color:#9cc5ff;">${_esc(field.label)}</th>`).join('')}
    ${hasOtherFields ? '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Other line data (read-only)</th>' : ''}
  `;
  const branchesHtml = branchPreview.branches.map((branch) => {
    const isExpanded = expandedBranches.has(branch.branchIndex);
    const visible = [];
    const hidden = [];
    for (const element of branch.elements) {
      if (!isExpanded && _branchElementIsAllNonSource(element)) hidden.push(element);
      else visible.push(element);
    }
    const rowsHtml = visible.map((element) => _branchElementRowHtml(element, editsByElement, hasOtherFields)).join('');
    const hiddenToggleHtml = hidden.length
      ? `<tr><td colspan="${columnCount}" style="padding:5px 6px;">
           <button type="button" data-branch-show-hidden="${branch.branchIndex}" style="background:none;border:1px solid #31455f;color:#9cc5ff;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;">
             Show ${hidden.length} element${hidden.length === 1 ? '' : 's'} with only carried-forward/defaulted values
           </button>
         </td></tr>`
      : '';
    return `
      <details style="margin-bottom:8px;border:1px solid #26384f;border-radius:6px;">
        <summary style="cursor:pointer;padding:6px 8px;color:#9cc5ff;font-size:12px;">
          Branch ${branch.branchIndex + 1}: node ${_esc(branch.fromNode)} &rarr; ${_esc(branch.toNode)}
          (${branch.elements.length} element${branch.elements.length === 1 ? '' : 's'}, ${branch.usedDefaultCount} defaulted, ${branch.usedCarryForwardCount} carried forward)
          ${branch.allSourced ? '<span style="color:#5ad1a0;">&check; all from source</span>' : ''}
        </summary>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${rowsHtml}${hiddenToggleHtml}</tbody>
        </table>
      </details>
    `;
  }).join('');
  return `
    <div style="color:#9aa8ba;font-size:12px;margin-bottom:8px;">
      ${branchPreview.stats.branchCount} branch(es), ${branchPreview.stats.elementCount} element(s), ${branchPreview.stats.restraintCount} restraint(s) found in the loaded InputXML.
      Legend: <span style="color:#d7e6ff;">white border</span> = from source,
      <span style="color:#7aa6ff;">blue border</span> = carried forward from a previous element (source used CAESAR's -1.0101 "inherit previous" sentinel or omitted the attribute),
      <span style="color:#c9a24a;">amber border</span> = missing from source and no prior value to carry forward, using the Global Defaults tab,
      <span style="color:#5ad1a0;">green border</span> = edited here. Fields are editable; edits are written into the InputXML on Save.
      Elements where every field is carried-forward/defaulted are hidden by default within each branch - use "Show" to reveal them.
    </div>
    ${branchesHtml}
  `;
}

function _openJsonPopup({
  title,
  value,
  onSave,
  onCancel,
  headerFields,
  requirementLines,
  supportRules,
  enrichmentTools = false,
  branchPreview = null,
  xmlText = '',
  unifiedSupportMapping = false,
  onSaveConfigOnly,
  defaultFields,
}) {
  const popupDefaultFields = Array.isArray(defaultFields) ? defaultFields : [];
  const popupOwnHeaderFields = Array.isArray(headerFields) ? headerFields : [];
  const popupHeaderFields = [...popupOwnHeaderFields, ...popupDefaultFields];
  const renderPopupFieldGroup = (fields) => fields.map((field) => {
    if (field.type === 'checkbox') {
      return `
        <label style="display:flex;align-items:center;gap:8px;color:#d7e6ff;font-size:13px;">
          <input type="checkbox" data-popup-header-key="${_esc(field.key)}" ${field.value ? 'checked' : ''}>
          <span>${_esc(field.label)}</span>
        </label>
      `;
    }
    const inputType = field.type === 'number' ? 'number' : 'text';
    const stepAttr = field.step ? `step="${_esc(field.step)}"` : '';
    return `
      <label style="display:flex;flex-direction:column;gap:6px;">
        <span style="color:#9cc5ff;font-size:12px;">${_esc(field.label)}</span>
        <input type="${inputType}" ${stepAttr} data-popup-header-key="${_esc(field.key)}"
          value="${_esc(_popupFieldValueAsText(field))}"
          style="background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;">
      </label>
    `;
  }).join('');
  const defaultFieldsHtml = popupDefaultFields.length
    ? `
      <div style="color:#9cc5ff;font-weight:700;font-size:13px;margin:4px 0 8px;">Global Defaults</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:14px;">
        ${renderPopupFieldGroup(popupDefaultFields)}
      </div>
      ${popupOwnHeaderFields.length ? '<div style="color:#9cc5ff;font-weight:700;font-size:13px;margin:4px 0 8px;">CII Header</div>' : ''}
    `
    : '';
  const headerFieldsHtml = defaultFieldsHtml
    ? `${defaultFieldsHtml}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;">${renderPopupFieldGroup(popupOwnHeaderFields)}</div>`
    : renderPopupFieldGroup(popupHeaderFields);
  const requirementText = Array.isArray(requirementLines) && requirementLines.length
    ? requirementLines.map((line) => `<div style="color:#9aa8ba;font-size:12px;">${_esc(line)}</div>`).join('')
    : '';
  const supportRuleList = Array.isArray(supportRules) ? supportRules : [];
  const supportRulesHtml = supportRuleList.length
    ? supportRuleList.map((rule) => `
      <tr>
        <td style="padding:5px;border-bottom:1px solid #26364a;color:#d7e6ff;">${_esc(rule.field || '*')}</td>
        <td style="padding:5px;border-bottom:1px solid #26364a;color:#d7e6ff;">${_esc(rule.match || 'contains')}</td>
        <td style="padding:5px;border-bottom:1px solid #26364a;color:#d7e6ff;">${_esc(rule.pattern || '')}</td>
        <td style="padding:5px;border-bottom:1px solid #26364a;color:#d7e6ff;font-weight:700;">${_esc(rule.kind || '')}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="4" style="padding:8px;color:#9aa8ba;">No support mapper rules configured.</td></tr>';
  const supportMapperTabButton = supportRuleList.length
    ? '<button type="button" data-popup-tab="support" class="model-converters-download-btn">Support Type Mapper</button>'
    : '';
  const branchPreviewTabButton = branchPreview
    ? '<button type="button" data-popup-tab="branches" class="model-converters-download-btn">Branch Data</button>'
    : '';
  const unifiedSupportMappingTabButton = unifiedSupportMapping
    ? '<button type="button" data-popup-tab="unified-support" class="model-converters-download-btn">Support Mapping</button>'
    : '';
  const restraintTabButton = unifiedSupportMapping
    ? '<button type="button" data-popup-tab="restraint" class="model-converters-download-btn">Restraint</button>'
    : '';
  const enrichmentToolsEnabled = !!enrichmentTools || (() => {
    try {
      const p = JSON.parse(String(value || ''));
      return !!(p && (p.material || p.overrides || p.pipingClass || p.rating || p.weight || p.linelist));
    } catch {
      return false;
    }
  })();
  const regexTabButton = enrichmentToolsEnabled
    ? '<button type="button" data-popup-tab="regex" class="model-converters-download-btn">Regex Tester</button>'
    : '';
  const mastersTabButton = enrichmentToolsEnabled
    ? '<button type="button" data-popup-tab="masters" class="model-converters-download-btn">Masters</button>'
    : '';
  const logTabButton = enrichmentToolsEnabled
    ? '<button type="button" data-popup-tab="logs" class="model-converters-download-btn">Diagnostics Log</button>'
    : '';
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.55)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.innerHTML = `
    <div style="width:min(1400px,96vw);height:min(780px,94vh);display:flex;flex-direction:column;background:#0f1724;border:1px solid #2c3a4f;border-radius:10px;overflow:hidden;">
      <div style="padding:10px 12px;border-bottom:1px solid #2c3a4f;color:#9cc5ff;font-weight:700;">${_esc(title)}</div>
      <div style="display:flex;gap:6px;padding:10px 12px 0 12px;">
        <button type="button" data-popup-tab="header" class="model-converters-download-btn">${popupDefaultFields.length ? 'Global Defaults' : 'Header'}</button>
        <button type="button" data-popup-tab="config" class="model-converters-run-btn">Config</button>
        <button type="button" data-popup-tab="json" class="model-converters-download-btn">JSON</button>
        ${regexTabButton}
        ${mastersTabButton}
        ${logTabButton}
        ${supportMapperTabButton}
        ${branchPreviewTabButton}
        ${restraintTabButton}
        ${unifiedSupportMappingTabButton}
      </div>
      <div style="padding:10px 12px;color:#9aa8ba;font-size:12px;">Use Config for all fields, Regex Tester for branch-name extraction, Masters for material/class overrides, Diagnostics Log for run output fields, Support Type Mapper for ATT/RVM rules${branchPreview ? ', Branch Data for a per-branch coverage/defaults preview of the loaded file' : ''}${unifiedSupportMapping ? ', and Support Mapping for restraint type rules and their CAESAR II numeric codes' : ''}.</div>
      <div style="padding:0 12px 10px 12px;">${requirementText}</div>
      <div data-popup-panel="header" style="display:none;flex:1;padding:0 12px 12px 12px;overflow:auto;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;">
          ${headerFieldsHtml || '<div style="color:#9aa8ba;">No header fields configured for this popup.</div>'}
        </div>
      </div>
      <div data-popup-panel="config" style="display:none;flex:1;padding:0 12px 12px 12px;overflow:auto;">
        <div data-popup-config-status style="margin-bottom:8px;color:#9aa8ba;font-size:12px;"></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Path</th>
              <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Type</th>
              <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Value</th>
            </tr>
          </thead>
          <tbody data-popup-config-rows></tbody>
        </table>
      </div>
      <div data-popup-panel="json" style="display:flex;flex:1;padding:0 12px 12px 12px;">
        <textarea data-popup-json-text style="flex:1;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:8px;padding:10px;font-family:Consolas,monospace;font-size:12px;resize:none;">${_esc(String(value || ''))}</textarea>
      </div>
      <div data-popup-panel="regex" style="display:none;flex:1;padding:0 12px 12px 12px;overflow:auto;">
        <div style="color:#9aa8ba;font-size:12px;margin-bottom:8px;">Live branch-name regex tester. Edits write back to the same JSON used by XML-&gt;CII(2019) enrichment.</div>
        <div data-popup-regex></div>
      </div>
      <div data-popup-panel="logs" style="display:none;flex:1;padding:0 12px 12px 12px;overflow:auto;">
        <div style="color:#9aa8ba;font-size:12px;margin-bottom:8px;">After Run, the enrichment log appears below the converter and is also downloaded as <code>_enrichment_diagnostics.json</code>. These are the columns emitted for class/material master review.</div>
        <div data-popup-logs></div>
      </div>
      <div data-popup-panel="support" style="display:none;flex:1;padding:0 12px 12px 12px;overflow:auto;">
        <div style="color:#9aa8ba;font-size:12px;margin-bottom:8px;">Map ATT/RVM fields to support kinds during ATT/RVM conversion, XML enrichment, and 3D support symbol rendering. Fields and keywords accept comma-separated values; use <code>*</code> to scan all attributes.</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr>
            <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Field</th>
            <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Match</th>
            <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Pattern</th>
            <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Kind</th>
          </tr></thead>
          <tbody>${supportRulesHtml}</tbody>
        </table>
      </div>
      <div data-popup-panel="masters" style="display:none;flex:1;padding:0 12px 12px 12px;overflow:auto;">
        <div style="color:#9aa8ba;font-size:12px;margin-bottom:8px;">Point-and-click editors for the Material Map and manual overrides (Material name &rarr; code; Piping class &rarr; class). Saved into the same config JSON; overrides take highest precedence.</div>
        <div data-popup-masters></div>
      </div>
      <div data-popup-panel="branches" style="display:none;flex:1;padding:0 12px 12px 12px;overflow:auto;">
        <div data-popup-branches></div>
      </div>
      <div data-popup-panel="restraint" style="display:none;flex:1;padding:0 12px 12px 12px;overflow:auto;">
        <div data-popup-restraint></div>
      </div>
      <div data-popup-panel="unified-support" style="display:none;flex:1;padding:0 12px 12px 12px;overflow:auto;">
        <div data-popup-unified-support></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:10px 12px;border-top:1px solid #2c3a4f;background:#111c2c;">
        <span data-popup-save-config-status style="font-size:12px;color:#8b9eb7;"></span>
        ${onSaveConfigOnly ? '<button type="button" data-popup-action="save-config" class="model-converters-download-btn">Save config</button>' : ''}
        <button type="button" data-popup-action="cancel" class="model-converters-download-btn">Cancel</button>
        <button type="button" data-popup-action="save" class="model-converters-run-btn">Save</button>
      </div>
    </div>
  `;
  const textarea = overlay.querySelector('[data-popup-json-text]');
  const configRowsEl = overlay.querySelector('[data-popup-config-rows]');
  const configStatusEl = overlay.querySelector('[data-popup-config-status]');
  const tabButtons = Array.from(overlay.querySelectorAll('[data-popup-tab]'));
  const panels = Array.from(overlay.querySelectorAll('[data-popup-panel]'));
  const activateTab = (tabName) => {
    for (const button of tabButtons) {
      const isActive = button.getAttribute('data-popup-tab') === tabName;
      button.className = isActive ? 'model-converters-run-btn' : 'model-converters-download-btn';
    }
    for (const panel of panels) {
      const isActive = panel.getAttribute('data-popup-panel') === tabName;
      panel.style.display = isActive ? 'flex' : 'none';
    }
  };
  const renderConfigTable = () => {
    if (!configRowsEl || !configStatusEl) return;
    const source = String(textarea?.value ?? '').trim();
    if (!source) {
      configStatusEl.textContent = 'Empty JSON.';
      configRowsEl.innerHTML = '<tr><td colspan="3" style="padding:8px;color:#9aa8ba;">No config rows.</td></tr>';
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch (error) {
      configStatusEl.textContent = `Invalid JSON: ${_toText(error?.message || error)}`;
      configRowsEl.innerHTML = '<tr><td colspan="3" style="padding:8px;color:#ffb4b4;">Fix JSON to view table.</td></tr>';
      return;
    }
    const rows = [];
    _flattenConfigRows(parsed, '', rows);
    configStatusEl.textContent = `Rows: ${rows.length}`;
    if (!rows.length) {
      configRowsEl.innerHTML = '<tr><td colspan="3" style="padding:8px;color:#9aa8ba;">No config rows.</td></tr>';
      return;
    }
    const inputStyle = 'background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:3px 6px;font-size:12px;width:100%;box-sizing:border-box;';
    const disabledInputStyle = 'background:#141d2b;color:#6d7d92;border:1px solid #26364a;border-radius:4px;padding:3px 6px;font-size:12px;width:100%;box-sizing:border-box;cursor:not-allowed;';
    let lastSection = null;
    configRowsEl.innerHTML = rows.map((row) => {
      const meta = _elementsRowFieldMeta(row.path);
      const section = meta?.group || (_toText(row.path).split(/[.[]/)[0] || '(root)');
      const sectionHeaderHtml = section !== lastSection
        ? `<tr><td colspan="3" style="padding:8px 6px 4px;border-bottom:1px solid #31455f;color:#9cc5ff;font-weight:700;font-size:12px;">${_esc(section)}</td></tr>`
        : '';
      lastSection = section;
      const isDisabled = meta && meta.editable === false;
      const activeInputStyle = isDisabled ? disabledInputStyle : inputStyle;
      let cellHtml;
      if (row.type === 'boolean') {
        cellHtml = `<input type="checkbox" data-config-path="${_esc(row.path)}" data-config-type="boolean" ${row.value === 'true' ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>`;
      } else if (row.type === 'number') {
        cellHtml = `<input type="number" data-config-path="${_esc(row.path)}" data-config-type="number" value="${_esc(row.value)}" style="${activeInputStyle}" ${isDisabled ? 'disabled' : ''}>`;
      } else if (row.type === 'string') {
        cellHtml = `<input type="text" data-config-path="${_esc(row.path)}" data-config-type="string" value="${_esc(row.value)}" style="${activeInputStyle}" ${isDisabled ? 'disabled' : ''}>`;
      } else {
        cellHtml = `<code style="color:#9aa8ba;">${_esc(row.value)}</code>`;
      }
      const displayLabel = meta?.label
        ? `${_esc(meta.label)} <code style="color:#5c7291;font-size:11px;">(${_esc(row.path)})</code>`
        : `<code>${_esc(row.path || '(root)')}</code>`;
      const noteHtml = meta?.note
        ? `<div style="color:${isDisabled ? '#8b9eb7' : '#c9a24a'};font-size:11px;margin-top:2px;">${isDisabled ? '&#128274; ' : '&#9888; '}${_esc(meta.note)}</div>`
        : '';
      return `
        ${sectionHeaderHtml}
        <tr>
          <td style="padding:6px;border-bottom:1px solid #24354a;vertical-align:middle;color:#e6edf5;">${displayLabel}${noteHtml}</td>
          <td style="padding:6px;border-bottom:1px solid #24354a;vertical-align:middle;color:#9cc5ff;white-space:nowrap;">${_esc(row.type)}</td>
          <td style="padding:6px;border-bottom:1px solid #24354a;vertical-align:middle;color:#d7e6ff;">${cellHtml}</td>
        </tr>
      `;
    }).join('');
    configRowsEl.querySelectorAll('[data-config-path]').forEach((input) => {
      const eventName = input.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const configPath = input.getAttribute('data-config-path');
        const configType = input.getAttribute('data-config-type');
        let val;
        if (configType === 'boolean') val = input.checked;
        else if (configType === 'number') val = Number.isFinite(Number(input.value)) ? Number(input.value) : 0;
        else val = input.value;
        _setValueAtPath(parsed, configPath, val);
        if (textarea) textarea.value = JSON.stringify(parsed, null, 2);
      });
    });
  };

  // Branch Data tab: elementIndex -> Map(attr -> edited text value). Persists
  // across re-renders (e.g. clicking "Show N hidden elements") for the
  // lifetime of this popup. Read by getEditedInputXmlText() on Save.
  const branchFieldEdits = new Map();
  const branchExpandedGroups = new Set();
  const branchesEl = overlay.querySelector('[data-popup-branches]');
  const renderBranchesTab = () => {
    if (!branchesEl) return;
    branchesEl.innerHTML = _branchPreviewHtml(branchPreview, branchFieldEdits, branchExpandedGroups);
    branchesEl.querySelectorAll('[data-branch-field-input]').forEach((input) => {
      input.addEventListener('input', () => {
        const elementIndex = Number(input.getAttribute('data-element-index'));
        const attr = input.getAttribute('data-branch-field-input');
        const edits = branchFieldEdits.get(elementIndex) || new Map();
        edits.set(attr, input.value);
        branchFieldEdits.set(elementIndex, edits);
        // Mark edited without a full re-render (would lose focus/cursor position).
        input.style.borderColor = '#5ad1a0';
        input.title = `Edited in this popup - will be written into the InputXML attribute ${attr} on Save.`;
      });
    });
    branchesEl.querySelectorAll('[data-branch-show-hidden]').forEach((button) => {
      button.addEventListener('click', () => {
        branchExpandedGroups.add(Number(button.getAttribute('data-branch-show-hidden')));
        renderBranchesTab();
      });
    });
  };
  /** Applies tracked Branch Data edits onto the original loaded XML text, if any were made. Returns null when there is nothing to apply, so callers can leave the original file untouched. */
  const getEditedInputXmlText = () => {
    if (!branchFieldEdits.size) return null;
    const edits = [];
    for (const [elementIndex, fields] of branchFieldEdits.entries()) {
      for (const [attr, value] of fields.entries()) edits.push({ elementIndex, attr, value });
    }
    if (!edits.length) return null;
    return applyElementFieldEdits(xmlText, edits);
  };

  const regexEl = overlay.querySelector('[data-popup-regex]');
  const renderRegexTab = () => {
    if (!regexEl) return;
    let parsed;
    try { parsed = JSON.parse(String(textarea?.value ?? '') || '{}'); }
    catch { regexEl.innerHTML = '<div style="color:#ffb4b4;">Fix the JSON tab before editing regex settings.</div>'; return; }
    if (!parsed.linelist || typeof parsed.linelist !== 'object') parsed.linelist = {};
    if (!parsed.rating || typeof parsed.rating !== 'object') parsed.rating = {};
    if (!parsed.weight || typeof parsed.weight !== 'object') parsed.weight = {};
    const sampleBranch = _toText(parsed.regexTester?.sampleBranch || '/LINE-AREA-4-UNIT-150A1/B1');
    const sync = () => { if (textarea) textarea.value = JSON.stringify(parsed, null, 2); };
    const inputStyle = 'background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:6px 8px;font-size:12px;width:100%;box-sizing:border-box;';
    const field = (label, path, type = 'text') => `<label style="display:flex;flex-direction:column;gap:5px;color:#9cc5ff;font-size:12px;"><span>${_esc(label)}</span><input type="${type}" data-regex-path="${_esc(path)}" value="${_esc(_getValueAtPath(parsed, path) ?? '')}" style="${inputStyle}"></label>`;
    const testRegex = (pattern, group) => {
      if (!_toText(pattern).trim()) return '';
      try {
        const m = new RegExp(_toText(pattern), 'i').exec(sampleBranch);
        return _toText(m?.[Number(group) || 0] || '').trim();
      } catch (error) {
        return `Invalid regex: ${_toText(error?.message || error)}`;
      }
    };
    const classByRegex = testRegex(parsed.rating.pipingClassRegex, parsed.rating.pipingClassGroup || 1);
    const boreByRegex = testRegex(parsed.weight.boreRegex, parsed.weight.boreGroup || 1);
    const lineByRegex = testRegex(parsed.linelist.branchNameRegex, parsed.linelist.lineNoGroup || 1);
    const tokenClass = _tokenAtPosition(sampleBranch, parsed.rating.tokenDelimiter || '-', parsed.rating.pipingClassTokenIndex || 5);
    const tokenBore = _tokenAtPosition(sampleBranch, parsed.weight.tokenDelimiter || '-', parsed.weight.boreTokenIndex || 3);
    regexEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:10px;">
        ${field('Sample Branchname', 'regexTester.sampleBranch')}
        ${field('Line Regex', 'linelist.branchNameRegex')}
        ${field('Line Group', 'linelist.lineNoGroup', 'number')}
        ${field('Piping Class Regex', 'rating.pipingClassRegex')}
        ${field('Piping Class Group', 'rating.pipingClassGroup', 'number')}
        ${field('Piping Class Token Index', 'rating.pipingClassTokenIndex', 'number')}
        ${field('Piping Class Token Delimiter', 'rating.tokenDelimiter')}
        ${field('Bore Regex', 'weight.boreRegex')}
        ${field('Bore Group', 'weight.boreGroup', 'number')}
        ${field('Bore Token Index', 'weight.boreTokenIndex', 'number')}
        ${field('Bore Token Delimiter', 'weight.tokenDelimiter')}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Extractor</th><th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Result</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">LineNo / PipelineReference regex</td><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">${_esc(lineByRegex)}</td></tr>
          <tr><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">PipingClass regex (falls back to token)</td><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">${_esc(classByRegex || tokenClass)}</td></tr>
          <tr><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">Bore regex (falls back to token)</td><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">${_esc(boreByRegex || tokenBore)}</td></tr>
        </tbody>
      </table>
    `;
    regexEl.querySelectorAll('[data-regex-path]').forEach((input) => {
      const update = () => {
        const path = input.getAttribute('data-regex-path');
        const value = input.type === 'number' ? (Number.isFinite(Number(input.value)) ? Number(input.value) : 0) : input.value;
        _setValueAtPath(parsed, path, value);
        sync();
      };
      input.addEventListener('input', update);
      input.addEventListener('change', () => { update(); renderRegexTab(); });
    });
  };
  const logsEl = overlay.querySelector('[data-popup-logs]');
  const renderLogsTab = () => {
    if (!logsEl) return;
    const rows = [
      ['class-master-match', 'derivedClass, pipingClass, classMethod, classConfidence, wallThickness, corrosion, materialName, materialCode, materialMethod, needsReview'],
      ['branch-derived', 'branchName, pipingClass, rating, boreMm, processParameters'],
      ['weight-master-match', 'nodeNumber, branchName, boreMm, rating, lengthMm, weight, lengthDelta'],
      ['material-map-source / piping-class-master-source', 'source URL and loaded row count'],
      ['support-match / duplicate-support-removed', 'support mapper decisions and duplicate ATTA cleanup'],
    ];
    logsEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Log row type</th><th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Fields</th></tr></thead>
      <tbody>${rows.map(([type, fields]) => `<tr><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;font-weight:700;">${_esc(type)}</td><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">${_esc(fields)}</td></tr>`).join('')}</tbody>
    </table>`;
  };

  const mastersEl = overlay.querySelector('[data-popup-masters]');
  const renderMastersTab = () => {
    if (!mastersEl) return;
    let parsed;
    try { parsed = JSON.parse(String(textarea?.value ?? '') || '{}'); }
    catch { mastersEl.innerHTML = '<div style="color:#ffb4b4;">Fix the JSON tab before editing masters.</div>'; return; }
    if (!parsed.material || typeof parsed.material !== 'object') parsed.material = {};
    if (!Array.isArray(parsed.material.mapRows)) parsed.material.mapRows = [];
    if (!parsed.overrides || typeof parsed.overrides !== 'object') parsed.overrides = {};
    for (const k of ['material', 'pipingClass']) {
      if (!parsed.overrides[k] || typeof parsed.overrides[k] !== 'object') parsed.overrides[k] = {};
    }
    const sync = () => { if (textarea) textarea.value = JSON.stringify(parsed, null, 2); };
    const inp = 'background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:3px 6px;font-size:12px;width:100%;box-sizing:border-box;';
    const th = 'text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;';
    const td = 'padding:4px;border-bottom:1px solid #24354a;';
    const matRows = parsed.material.mapRows;

    const ovTable = (titleHtml, key, leftLabel, rightLabel) => {
      const entries = Object.entries(parsed.overrides[key]);
      return `
        <div style="font-weight:700;color:#9cc5ff;margin:12px 0 6px;">${titleHtml}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>
          <th style="${th}">${leftLabel}</th><th style="${th}">${rightLabel}</th><th style="${th};width:34px;"></th></tr></thead>
          <tbody>${entries.map(([k, v], i) => `<tr>
            <td style="${td}"><input style="${inp}" data-ov-key="${key}" data-ov-i="${i}" data-ov-part="k" value="${_esc(k)}"></td>
            <td style="${td}"><input style="${inp}" data-ov-key="${key}" data-ov-i="${i}" data-ov-part="v" value="${_esc(v)}"></td>
            <td style="${td};text-align:center;"><button type="button" data-ov-del="${key}:${i}" class="model-converters-download-btn" style="padding:2px 7px;">&times;</button></td>
          </tr>`).join('')}</tbody></table>
        <button type="button" data-ov-add="${key}" class="model-converters-download-btn" style="margin:6px 0;">+ Add override</button>`;
    };

    mastersEl.innerHTML = `
      <div style="font-weight:700;color:#9cc5ff;margin:6px 0;">Material Map (code &harr; material name)</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>
        <th style="${th};width:120px;">Code</th><th style="${th}">Material Name</th><th style="${th};width:34px;"></th></tr></thead>
        <tbody>${matRows.map((r, i) => `<tr>
          <td style="${td}"><input style="${inp}" data-mm-idx="${i}" data-mm-field="code" value="${_esc(r.code || '')}"></td>
          <td style="${td}"><input style="${inp}" data-mm-idx="${i}" data-mm-field="material" value="${_esc(r.material || r.desc || '')}"></td>
          <td style="${td};text-align:center;"><button type="button" data-mm-del="${i}" class="model-converters-download-btn" style="padding:2px 7px;">&times;</button></td>
        </tr>`).join('')}</tbody></table>
      <button type="button" data-mm-add class="model-converters-download-btn" style="margin:6px 0;">+ Add material</button>
      <div style="color:#9aa8ba;font-size:11px;">Leave empty to auto-load from <code>material.masterUrl</code> at run time.</div>
      ${ovTable('Material Overrides (wins over fuzzy match)', 'material', 'Material Name', 'Code')}
      ${ovTable('Piping Class Overrides (wins over derived/approximate)', 'pipingClass', 'Derived Class', 'Mapped Class')}
    `;

    mastersEl.querySelectorAll('[data-mm-idx]').forEach((el) => el.addEventListener('input', () => {
      const i = Number(el.getAttribute('data-mm-idx'));
      matRows[i] = matRows[i] || {};
      matRows[i][el.getAttribute('data-mm-field')] = el.value;
      sync();
    }));
    mastersEl.querySelector('[data-mm-add]')?.addEventListener('click', () => { matRows.push({ code: '', material: '' }); sync(); renderMastersTab(); });
    mastersEl.querySelectorAll('[data-mm-del]').forEach((b) => b.addEventListener('click', () => { matRows.splice(Number(b.getAttribute('data-mm-del')), 1); sync(); renderMastersTab(); }));

    const rebuildOv = (key) => {
      const obj = {};
      mastersEl.querySelectorAll(`[data-ov-key="${key}"][data-ov-part="k"]`).forEach((kEl) => {
        const i = kEl.getAttribute('data-ov-i');
        const vEl = mastersEl.querySelector(`[data-ov-key="${key}"][data-ov-i="${i}"][data-ov-part="v"]`);
        const k = kEl.value.trim();
        if (k) obj[k] = vEl ? vEl.value : '';
      });
      parsed.overrides[key] = obj;
      sync();
    };
    mastersEl.querySelectorAll('[data-ov-key]').forEach((el) => el.addEventListener('input', () => rebuildOv(el.getAttribute('data-ov-key'))));
    mastersEl.querySelectorAll('[data-ov-add]').forEach((b) => b.addEventListener('click', () => {
      const key = b.getAttribute('data-ov-add');
      parsed.overrides[key] = { ...parsed.overrides[key], '': '' };
      sync(); renderMastersTab();
    }));
    mastersEl.querySelectorAll('[data-ov-del]').forEach((b) => b.addEventListener('click', () => {
      const [key, i] = b.getAttribute('data-ov-del').split(':');
      const entries = Object.entries(parsed.overrides[key]);
      entries.splice(Number(i), 1);
      parsed.overrides[key] = Object.fromEntries(entries);
      sync(); renderMastersTab();
    }));
  };
  const unifiedSupportMappingEl = overlay.querySelector('[data-popup-unified-support]');
  const restraintEl = overlay.querySelector('[data-popup-restraint]');
  const distinctRestraintTypes = (() => {
    const counts = new Map();
    for (const restraint of branchPreview?.restraints || []) {
      const type = _toText(restraint.type);
      if (!type) continue;
      counts.set(type, (counts.get(type) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  })();
  const renderRestraintOverridesHtml = (parsed) => {
    if (!distinctRestraintTypes.length) return '';
    const explicitMap = (parsed.restraint && typeof parsed.restraint === 'object' && parsed.restraint.explicit_type_map) || {};
    return `
      <div class="model-converters-workflow-detail-title" style="margin-top:14px;">Restraint type overrides found in this file</div>
      <div class="model-converters-workflow-detail-text" style="margin-bottom:8px;">
        Every distinct RESTRAINT/TYPE number actually present in the loaded InputXML. By default the numeric type is
        passed straight through unchanged (identity); set an override below to remap a source type to a different
        CAESAR II numeric code without editing Python. This writes directly into
        <code>layoutConfigJson.restraint.explicit_type_map</code>.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;max-width:480px;">
        <thead><tr>
          <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Source Type #</th>
          <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Occurrences</th>
          <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Override To</th>
        </tr></thead>
        <tbody>${distinctRestraintTypes.map(([type, count]) => `
          <tr>
            <td style="padding:4px 6px;border-bottom:1px solid #24354a;color:#d7e6ff;">${_esc(type)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #24354a;color:#d7e6ff;">${count}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #24354a;">
              <input data-restraint-override-type="${_esc(type)}" value="${_esc(explicitMap[type] ?? '')}" placeholder="${_esc(type)} (unchanged)"
                style="width:110px;background:#101827;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:4px 6px;">
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  };
  const restraintTypeMutationRows = (parsed) => {
    const cfg = parsed.restraint && typeof parsed.restraint === 'object' ? parsed.restraint : {};
    if (Array.isArray(cfg.type_mutation_rows) && cfg.type_mutation_rows.length) return cfg.type_mutation_rows;
    return DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS.map((row) => ({ ...row }));
  };
  const renderRestraintTypeMutationHtml = (parsed) => {
    const cfg = parsed.restraint && typeof parsed.restraint === 'object' ? parsed.restraint : {};
    const enabled = cfg.mapping_policy === 'explicit_map';
    const rows = restraintTypeMutationRows(parsed);
    const inp = 'background:#101827;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:4px 6px;font-size:12px;width:80px;box-sizing:border-box;';
    const th = 'text-align:left;padding:4px 6px;border-bottom:1px solid #31455f;color:#9cc5ff;';
    const td = 'padding:4px 6px;border-bottom:1px solid #24354a;';
    const rowsHtml = rows.map((row, i) => `
      <tr>
        <td style="${td}"><input style="${inp}" data-rtm-row="${i}" data-rtm-col="label" value="${_esc(row.label || '')}" placeholder="label"></td>
        <td style="${td}"><input style="${inp}" data-rtm-row="${i}" data-rtm-col="from" type="number" step="1" value="${_esc(row.from ?? '')}" placeholder="e.g. 17"></td>
        <td style="${td};text-align:center;color:#9aa8ba;">&rarr;</td>
        <td style="${td}"><input style="${inp}" data-rtm-row="${i}" data-rtm-col="to" type="number" step="1" value="${_esc(row.to ?? '')}" placeholder="e.g. 14"></td>
        <td style="${td}"><button type="button" data-rtm-del="${i}" class="model-converters-download-btn" style="padding:2px 7px;">Delete</button></td>
      </tr>
    `).join('');
    return `
      <div style="margin-top:16px;border:1px solid #31455f;border-radius:8px;padding:12px;background:#101a29;">
        <label style="display:flex;align-items:center;gap:8px;color:#9cc5ff;font-weight:700;font-size:13px;">
          <input type="checkbox" data-rtm-enabled ${enabled ? 'checked' : ''}>
          <span>Restraint Type Mutation</span>
        </label>
        <div style="color:#9aa8ba;font-size:11px;margin:6px 0 10px;">
          Enable InputXML restraint TYPE mutation. Some CAESAR-exported XML carries RESTRAINT/TYPE numeric codes
          that don't match what CII expects; remap them here before conversion. Writes into
          <code>layoutConfigJson.restraint.mapping_policy</code> / <code>explicit_type_map</code>.
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;max-width:440px;">
          <thead><tr>
            <th style="${th}">Label</th><th style="${th}">From TYPE</th><th></th><th style="${th}">To TYPE</th><th></th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <button type="button" data-rtm-add class="model-converters-download-btn" style="margin-top:8px;">Add row</button>
      </div>
    `;
  };
  const bindRestraintTypeMutation = (host, parsed) => {
    const rows = restraintTypeMutationRows(parsed);
    // The "Restraint type overrides found in this file" table below also
    // writes into this same explicit_type_map, keyed per distinct source
    // type actually present in the loaded file. Track which "from" keys
    // this table currently owns so a commit() here only adds/removes those
    // keys - it must not clobber entries the other table set independently.
    let ownedKeys = new Set(rows.map((row) => _toText(row.from).trim()).filter(Boolean));
    const commit = () => {
      parsed.restraint = parsed.restraint && typeof parsed.restraint === 'object' ? parsed.restraint : {};
      parsed.restraint.type_mutation_rows = rows;
      const map = { ...(parsed.restraint.explicit_type_map && typeof parsed.restraint.explicit_type_map === 'object' ? parsed.restraint.explicit_type_map : {}) };
      for (const key of ownedKeys) delete map[key];
      const nextOwnedKeys = new Set();
      for (const row of rows) {
        const from = _toText(row.from).trim();
        const to = _toText(row.to).trim();
        if (from && to) { map[from] = to; nextOwnedKeys.add(from); }
      }
      ownedKeys = nextOwnedKeys;
      parsed.restraint.explicit_type_map = map;
      if (textarea) textarea.value = JSON.stringify(parsed, null, 2);
    };
    host.querySelector('[data-rtm-enabled]')?.addEventListener('change', (event) => {
      parsed.restraint = parsed.restraint && typeof parsed.restraint === 'object' ? parsed.restraint : {};
      parsed.restraint.mapping_policy = event.target.checked ? 'explicit_map' : 'identity';
      if (textarea) textarea.value = JSON.stringify(parsed, null, 2);
    });
    host.querySelectorAll('[data-rtm-row]').forEach((input) => {
      input.addEventListener('input', () => {
        const i = Number(input.getAttribute('data-rtm-row'));
        const col = input.getAttribute('data-rtm-col');
        rows[i] = rows[i] || {};
        rows[i][col] = input.value;
        commit();
      });
    });
    host.querySelectorAll('[data-rtm-del]').forEach((button) => {
      button.addEventListener('click', () => {
        rows.splice(Number(button.getAttribute('data-rtm-del')), 1);
        commit();
        renderRestraintTab();
      });
    });
    host.querySelector('[data-rtm-add]')?.addEventListener('click', () => {
      rows.push({ label: '', from: '', to: '' });
      commit();
      renderRestraintTab();
    });
  };
  // Default restraint stiffness card. Applied by the engine to any restraint
  // whose source RESTRAINT/STIFFNESS is missing; a 0 must never reach CII
  // (CAESAR reads a 0-stiffness restraint as no restraint at all), so the
  // field defaults to the CAESAR rigid stiffness and blocks 0 by reverting.
  const DEFAULT_STIFFNESS_TOKEN = '0.175120E+13';
  const caesarStiffnessToken = (numberLike) => {
    const value = Number(numberLike);
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_STIFFNESS_TOKEN;
    const exp = Math.floor(Math.log10(Math.abs(value))) + 1;
    const mantissa = value / Math.pow(10, exp);
    return `${mantissa.toFixed(6)}E${exp >= 0 ? '+' : '-'}${String(Math.abs(exp)).padStart(2, '0')}`;
  };
  const renderRestraintStiffnessHtml = (parsed) => {
    const cfg = parsed.restraint && typeof parsed.restraint === 'object' ? parsed.restraint : {};
    const token = _toText(cfg.stiffness_default_token).trim() || DEFAULT_STIFFNESS_TOKEN;
    const numeric = Number(token);
    const displayValue = Number.isFinite(numeric) && numeric > 0 ? token : DEFAULT_STIFFNESS_TOKEN;
    const inp = 'background:#101827;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:8px 10px;font-family:Consolas,monospace;font-size:13px;';
    return `
      <div style="margin-top:16px;border:1px solid #31455f;border-radius:8px;padding:12px;background:#101a29;">
        <div style="color:#9cc5ff;font-weight:700;font-size:13px;">Default Restraint Stiffness</div>
        <div style="color:#9aa8ba;font-size:11px;margin:6px 0 12px;max-width:640px;">
          Applied to any restraint whose source <code>RESTRAINT/STIFFNESS</code> is missing or a CAESAR sentinel.
          Writes <code>layoutConfigJson.restraint.stiffness_default_token</code>. A rigid restraint is <em>stiff</em>,
          not free &mdash; a stiffness of <code>0</code> makes CAESAR treat the restraint as absent, so this field
          defaults to the CAESAR rigid stiffness and refuses 0.
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <div style="color:#9cc5ff;font-size:12px;margin-bottom:6px;">Default stiffness (N/mm)</div>
            <input data-restraint-stiffness value="${_esc(displayValue)}" spellcheck="false" style="${inp}width:220px;">
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
              <button type="button" data-stiff-preset="1.75127e12" class="model-converters-download-btn" style="font-family:Consolas,monospace;">Rigid 1.75127E+12</button>
              <button type="button" data-stiff-preset="1e12" class="model-converters-download-btn" style="font-family:Consolas,monospace;">1E+12</button>
              <button type="button" data-stiff-preset="1e11" class="model-converters-download-btn" style="font-family:Consolas,monospace;">1E+11</button>
            </div>
          </div>
          <div>
            <div style="color:#9cc5ff;font-size:12px;margin-bottom:6px;">CII neutral-file token (written)</div>
            <input data-restraint-stiffness-token value="${_esc(caesarStiffnessToken(displayValue))}" readonly style="${inp}width:170px;color:#9cc5ff;">
          </div>
        </div>
        <div data-restraint-stiffness-guard style="display:none;margin-top:11px;padding:9px 11px;border:1px solid #5a2b2b;background:#1e0d0d;border-radius:7px;color:#f3b0b0;font-size:11.5px;max-width:560px;"></div>
      </div>
    `;
  };
  const bindRestraintStiffness = (host, parsed) => {
    const input = host.querySelector('[data-restraint-stiffness]');
    const tokenEl = host.querySelector('[data-restraint-stiffness-token]');
    const guardEl = host.querySelector('[data-restraint-stiffness-guard]');
    if (!input) return;
    const commit = (rawValue) => {
      parsed.restraint = parsed.restraint && typeof parsed.restraint === 'object' ? parsed.restraint : {};
      const value = Number(rawValue);
      const bad = !Number.isFinite(value) || value <= 0;
      if (bad) {
        // Never-zero guard: reject 0/blank/negative and revert to the rigid default.
        if (guardEl) {
          guardEl.style.display = 'block';
          guardEl.innerHTML = `<strong>Rejected.</strong> &ldquo;${_esc(_toText(rawValue) || '(empty)')}&rdquo; is not a usable stiffness &mdash; a rigid restraint needs a large positive value. Reverting to the CAESAR rigid default <code>${DEFAULT_STIFFNESS_TOKEN}</code>.`;
        }
        input.value = DEFAULT_STIFFNESS_TOKEN;
        parsed.restraint.stiffness_default_token = DEFAULT_STIFFNESS_TOKEN;
        if (tokenEl) tokenEl.value = DEFAULT_STIFFNESS_TOKEN;
      } else {
        if (guardEl) guardEl.style.display = 'none';
        const token = caesarStiffnessToken(value);
        parsed.restraint.stiffness_default_token = token;
        if (tokenEl) tokenEl.value = token;
      }
      if (textarea) textarea.value = JSON.stringify(parsed, null, 2);
    };
    input.addEventListener('change', () => commit(input.value));
    input.addEventListener('input', () => {
      // Live token preview without committing a reject-revert mid-typing.
      const value = Number(input.value);
      if (Number.isFinite(value) && value > 0) {
        if (guardEl) guardEl.style.display = 'none';
        if (tokenEl) tokenEl.value = caesarStiffnessToken(value);
      }
    });
    host.querySelectorAll('[data-stiff-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        input.value = button.getAttribute('data-stiff-preset');
        commit(input.value);
      });
    });
  };
  const bindRestraintOverrides = (host, parsed) => {
    host.querySelectorAll('[data-restraint-override-type]').forEach((input) => {
      input.addEventListener('change', () => {
        const sourceType = input.getAttribute('data-restraint-override-type');
        const overrideValue = _toText(input.value);
        parsed.restraint = parsed.restraint && typeof parsed.restraint === 'object' ? parsed.restraint : {};
        parsed.restraint.explicit_type_map = parsed.restraint.explicit_type_map && typeof parsed.restraint.explicit_type_map === 'object' ? parsed.restraint.explicit_type_map : {};
        if (overrideValue) {
          parsed.restraint.explicit_type_map[sourceType] = overrideValue;
          parsed.restraint.mapping_policy = 'explicit_map';
        } else {
          delete parsed.restraint.explicit_type_map[sourceType];
          if (!Object.keys(parsed.restraint.explicit_type_map).length) parsed.restraint.mapping_policy = 'identity';
        }
        if (textarea) textarea.value = JSON.stringify(parsed, null, 2);
      });
    });
  };
  // Dedicated "Restraint" tab: default TYPE mutation, default stiffness, and
  // the per-file distinct-type overrides. Moved here out of Support Mapping so
  // all restraint-type settings live in one place.
  const renderRestraintTab = () => {
    if (!restraintEl || !unifiedSupportMapping) return;
    let parsed;
    try { parsed = JSON.parse(String(textarea?.value ?? '') || '{}'); }
    catch { restraintEl.innerHTML = '<div style="color:#ffb4b4;">Fix the JSON tab before editing restraint settings.</div>'; return; }
    restraintEl.innerHTML = '';
    const mutationHost = document.createElement('div');
    mutationHost.innerHTML = renderRestraintTypeMutationHtml(parsed);
    restraintEl.appendChild(mutationHost);
    bindRestraintTypeMutation(mutationHost, parsed);
    const stiffnessHost = document.createElement('div');
    stiffnessHost.innerHTML = renderRestraintStiffnessHtml(parsed);
    restraintEl.appendChild(stiffnessHost);
    bindRestraintStiffness(stiffnessHost, parsed);
    const overridesHost = document.createElement('div');
    overridesHost.innerHTML = renderRestraintOverridesHtml(parsed);
    restraintEl.appendChild(overridesHost);
    bindRestraintOverrides(overridesHost, parsed);
  };
  const renderUnifiedSupportMappingTab = () => {
    if (!unifiedSupportMappingEl || !unifiedSupportMapping) return;
    let parsed;
    try { parsed = JSON.parse(String(textarea?.value ?? '') || '{}'); }
    catch { unifiedSupportMappingEl.innerHTML = '<div style="color:#ffb4b4;">Fix the JSON tab before editing support mapping.</div>'; return; }
    renderUnifiedSupportMappingTable(unifiedSupportMappingEl, parsed);
    bindUnifiedSupportMappingTable(unifiedSupportMappingEl, parsed, {
      onSaveConfig: (nextConfig) => { if (textarea) textarea.value = JSON.stringify(nextConfig, null, 2); },
    });
    const restraintHint = document.createElement('div');
    restraintHint.style.cssText = 'margin-top:14px;color:#9aa8ba;font-size:12px;';
    restraintHint.innerHTML = 'Restraint TYPE mutation and default stiffness now live in the dedicated <strong style="color:#9cc5ff;">Restraint</strong> tab.';
    unifiedSupportMappingEl.appendChild(restraintHint);
  };
  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-popup-tab') || 'json';
      if (tabName === 'config') renderConfigTable();
      if (tabName === 'regex') renderRegexTab();
      if (tabName === 'masters') renderMastersTab();
      if (tabName === 'logs') renderLogsTab();
      if (tabName === 'unified-support') renderUnifiedSupportMappingTab();
      if (tabName === 'restraint') renderRestraintTab();
      if (tabName === 'branches') renderBranchesTab();
      activateTab(tabName);
    });
  }
  textarea?.addEventListener('input', () => {
    const active = tabButtons.find((button) => button.className === 'model-converters-run-btn');
    if (active?.getAttribute('data-popup-tab') === 'config') renderConfigTable();
    if (active?.getAttribute('data-popup-tab') === 'regex') renderRegexTab();
  });
  activateTab(branchPreview ? 'branches' : 'config');
  renderConfigTable();
  renderBranchesTab();
  const close = () => overlay.remove();
  overlay.querySelector('[data-popup-action="cancel"]')?.addEventListener('click', () => {
    onCancel?.();
    close();
  });
  const collectHeaderValues = () => {
    const headerValues = {};
    for (const field of popupHeaderFields) {
      const input = overlay.querySelector(`[data-popup-header-key="${field.key}"]`);
      if (!input) continue;
      headerValues[field.key] = _popupFieldValueToTyped(field, input);
    }
    return headerValues;
  };
  overlay.querySelector('[data-popup-action="save"]')?.addEventListener('click', () => {
    onSave?.({
      jsonText: textarea?.value ?? '',
      headerValues: collectHeaderValues(),
      editedInputXmlText: getEditedInputXmlText(),
    });
    close();
  });
  overlay.querySelector('[data-popup-action="save-config"]')?.addEventListener('click', () => {
    onSaveConfigOnly?.({ jsonText: textarea?.value ?? '', headerValues: collectHeaderValues() });
    const statusEl = overlay.querySelector('[data-popup-save-config-status]');
    if (statusEl) {
      statusEl.textContent = 'Config saved';
      setTimeout(() => { if (statusEl.textContent === 'Config saved') statusEl.textContent = ''; }, 1600);
    }
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      onCancel?.();
      close();
    }
  });
  document.body.appendChild(overlay);
}

function _openJsonPopupAsync(options) {
  return new Promise((resolve) => {
    _openJsonPopup({
      ...options,
      onSave: (payload) => resolve({ saved: true, payload }),
      onCancel: () => resolve({ saved: false, payload: null }),
    });
  });
}

function _parseInputxml2019Requirements(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(xmlText || ''), 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Input XML parse failed. Cannot derive file-specific config requirements.');
  }

  const elements = Array.from(doc.getElementsByTagName('PIPINGELEMENT'));
  if (!elements.length) {
    throw new Error('Input XML has no PIPINGELEMENT rows. Cannot derive file-specific config requirements.');
  }

  let bendCount = 0;
  let rigidCount = 0;
  let restraintCount = 0;
  let sifCount = 0;
  const nodeIds = new Set();

  for (const element of elements) {
    bendCount += element.getElementsByTagName('BEND').length;
    rigidCount += element.getElementsByTagName('RIGID').length;
    restraintCount += element.getElementsByTagName('RESTRAINT').length;
    sifCount += element.getElementsByTagName('SIF').length;

    const fromNode = Number(element.getAttribute('FROM_NODE'));
    const toNode = Number(element.getAttribute('TO_NODE'));
    if (Number.isFinite(fromNode)) nodeIds.add(fromNode);
    if (Number.isFinite(toNode)) nodeIds.add(toNode);
  }

  return {
    elementCount: elements.length,
    bendCount,
    rigidCount,
    restraintCount,
    sifCount,
    nodeCount: nodeIds.size,
  };
}

function _parseInputxml2019ConfigOrDefault(layoutConfigJsonText) {
  const source = String(layoutConfigJsonText || '').trim();
  if (!source) return { config: JSON.parse(_defaultInputxml2019LayoutConfigJson()), parseIssue: null };
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        config: JSON.parse(_defaultInputxml2019LayoutConfigJson()),
        parseIssue: 'Existing config is not a JSON object. Replaced with default profile.',
      };
    }
    return { config: parsed, parseIssue: null };
  } catch {
    return {
      config: JSON.parse(_defaultInputxml2019LayoutConfigJson()),
      parseIssue: 'Existing config is invalid JSON. Replaced with default profile.',
    };
  }
}

function _numbersFromCiiRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .flatMap((row) => String(row ?? '').trim().split(/\s+/).filter(Boolean))
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));
}

function _applyInputxml2019SafeUnits(config, notes) {
  if (!config.units || typeof config.units !== 'object' || Array.isArray(config.units)) {
    config.units = {};
  }
  const numericValues = _numbersFromCiiRows(config.units.numeric_lines);
  const numericIsUnsafe = numericValues.length === 0
    || numericValues.every((value) => Math.abs(value) < 1e-12);
  const textIsIncomplete = !Array.isArray(config.units.text_lines)
    || config.units.text_lines.length !== INPUTXML2019_SAFE_UNITS.text_lines.length;

  if (numericIsUnsafe) {
    config.units.numeric_lines = [...INPUTXML2019_SAFE_UNITS.numeric_lines];
    notes.push('Replaced unsafe all-zero units.numeric_lines with CAESAR-safe metric conversion constants.');
  }
  if (textIsIncomplete) {
    config.units.text_lines = [...INPUTXML2019_SAFE_UNITS.text_lines];
    notes.push('Set units.text_lines to the CAESAR 2019 metric label block.');
  }
}

function _applyInputxml2019NamePreservation(config, notes) {
  if (!config.sections || typeof config.sections !== 'object' || Array.isArray(config.sections)) {
    config.sections = {};
  }
  if (config.sections.include_nodename !== true) {
    config.sections.include_nodename = true;
    notes.push('Enabled sections.include_nodename so FROM_NAME/TO_NAME from InputXML can reach CII NODENAME.');
  }
  if (!config.nodename || typeof config.nodename !== 'object' || Array.isArray(config.nodename)) {
    config.nodename = {};
  }
  if (!config.nodename.mode || config.nodename.mode === 'disabled') {
    config.nodename.mode = 'auto';
    notes.push('Set nodename.mode to auto so source node names are preserved.');
  }
}

function _prepareInputxml2019ConfigForRequirements(layoutConfigJsonText, requirements) {
  const { config, parseIssue } = _parseInputxml2019ConfigOrDefault(layoutConfigJsonText);
  const notes = [];
  if (parseIssue) notes.push(parseIssue);

  _applyInputxml2019SafeUnits(config, notes);

  if (!config.compatibility || typeof config.compatibility !== 'object' || Array.isArray(config.compatibility)) {
    config.compatibility = {};
  }
  if (!config.compatibility.raw_override_mode) {
    config.compatibility.raw_override_mode = 'schema_validated';
    notes.push('Set compatibility.raw_override_mode to schema_validated for robust file-based generation.');
  }

  if (!config.control || typeof config.control !== 'object' || Array.isArray(config.control)) {
    config.control = {};
  }
  const dynamicControl = {
    line1: ['{elements}', '{nozzles}', '{hangers}', '{nonam}', '{reducers}', '{flanges}'],
    line2: ['{bends}', '{rigids}', '{expjts}', '{restraints}', '{displmnt}', '{forcmnt}'],
    line3: ['{uniform}', '{wind}', '{offsets}', '{allowbls}', '{sifs}', '0'],
    line4: ['{equipmnt}'],
  };
  const legacyControl = {
    line1: ['{elements}', '0', '3', '0', '3', '0'],
    line2: ['{bends}', '{rigids}', '0', '{restraints}', '3', '0'],
    line3: ['0', '0', '0', '1', '{sifs}', '0'],
    line4: ['4'],
  };
  for (const key of Object.keys(dynamicControl)) {
    if (!Array.isArray(config.control[key]) || _sameTextArray(config.control[key], legacyControl[key])) {
      config.control[key] = dynamicControl[key];
      notes.push(`Set control.${key} to emitted-section-derived counters.`);
    }
  }

  if (!config.elements || typeof config.elements !== 'object' || Array.isArray(config.elements)) {
    config.elements = {};
  }
  // Auto-migrate the pre-fix IEL aux-pointer row12/row13/row14 templates
  // (SIF pointer written into 3 wrong slots, no {nodename} token at all) to
  // the current correct field order. A config saved to localStorage before
  // this fix shipped otherwise silently overrides every future code fix
  // forever, since loadStoredState() always prefers saved values over fresh
  // defaults - same class of problem control.lineN/line_labels below
  // already auto-heal for.
  const legacyRow12 = ['{bend}', '{rigid}', '0', '{restraint}', '{sif}', '0'];
  const legacyRow13 = ['0', '0', '0', '{sif}', '0', '0'];
  const legacyRow14 = ['{reducer}', '0', '{sif}'];
  const currentRow12 = ['{bend}', '{rigid}', '0', '{restraint}', '0', '0'];
  const currentRow13 = ['0', '0', '0', '0', '{sif}', '{nodename}'];
  const currentRow14 = ['{reducer}', '0', '0'];
  if (_sameTextArray(config.elements.row12, legacyRow12)) {
    config.elements.row12 = [...currentRow12];
    notes.push('Fixed elements.row12: moved {sif} out of the DISPLMNT pointer slot (it belongs in row13).');
  }
  if (_sameTextArray(config.elements.row13, legacyRow13)) {
    config.elements.row13 = [...currentRow13];
    notes.push('Fixed elements.row13: moved {sif} to the correct Intersection(SIF) slot and added the missing {nodename} pointer.');
  }
  if (_sameTextArray(config.elements.row14, legacyRow14)) {
    config.elements.row14 = [...currentRow14];
    notes.push('Fixed elements.row14: removed the stray {sif} token from the Nozzle/Equipment slot.');
  }
  if (!config.elements.line_label || typeof config.elements.line_label !== 'object' || Array.isArray(config.elements.line_label)) {
    config.elements.line_label = {};
  }
  if (!Array.isArray(config.elements.line_label.line_labels)) {
    config.elements.line_label.line_labels = [];
  }
  if (_sameTextArray(config.elements.line_label.line_labels, ['10 unassigned'])) {
    config.elements.line_label.line_labels = [];
    notes.push('Cleared legacy default line label override; auto mode now emits zero line-number rows unless configured per file.');
  }
  const lineLabelsCount = config.elements.line_label.line_labels.length;

  if (Array.isArray(config.elements.raw_block_overrides) && config.elements.raw_block_overrides.length > 0) {
    if (config.elements.raw_block_overrides.length !== requirements.elementCount) {
      notes.push(
        `Cleared elements.raw_block_overrides (${config.elements.raw_block_overrides.length}) because file has ${requirements.elementCount} elements.`,
      );
      delete config.elements.raw_block_overrides;
    }
  }

  _applyInputxml2019NamePreservation(config, notes);
  if (config.sections.raw_payload_overrides && typeof config.sections.raw_payload_overrides === 'object' && !Array.isArray(config.sections.raw_payload_overrides)) {
    const rawElements = config.sections.raw_payload_overrides.ELEMENTS;
    if (Array.isArray(rawElements)) {
      const expectedElementLines = requirements.elementCount * 15;
      if (rawElements.length !== expectedElementLines) {
        notes.push(
          `Cleared sections.raw_payload_overrides because ELEMENTS payload length (${rawElements.length}) does not match required ${expectedElementLines}.`,
        );
        delete config.sections.raw_payload_overrides;
      }
    }
  }

  if (!config.miscel_1 || typeof config.miscel_1 !== 'object' || Array.isArray(config.miscel_1)) {
    config.miscel_1 = {};
  }
  if (!Array.isArray(config.miscel_1.material_ids)) {
    config.miscel_1.material_ids = [];
  }
  const materialIdsCount = config.miscel_1.material_ids.length;

  const requirementLines = [
    `Detected from selected XML: ${requirements.elementCount} elements, ${requirements.bendCount} bends, ${requirements.rigidCount} rigids, ${requirements.restraintCount} restraints, ${requirements.sifCount} SIF blocks, ${requirements.nodeCount} nodes.`,
    `Element-wise configurable lengths: elements.line_label.line_labels=${requirements.elementCount}, miscel_1.material_ids=${requirements.elementCount}.`,
    `Current config lengths: line_labels=${lineLabelsCount}, material_ids=${materialIdsCount}.`,
  ];
  for (const note of notes) requirementLines.push(note);

  return {
    jsonText: JSON.stringify(config, null, 2),
    requirementLines,
  };
}

async function _openInputxml2019PreRunPopup(def, values, primaryFileName, primaryBytes, persist) {
  const xmlText = _decodeTextUtf8(primaryBytes);
  const requirements = _parseInputxml2019Requirements(xmlText);
  const prepared = _prepareInputxml2019ConfigForRequirements(values.layoutConfigJson, requirements);
  const branchPreview = parseInputXmlForBranchPreview(xmlText, values);

  const popupHeaderFields = (def.fields || def.options || [])
    .filter((entry) => INPUTXML2019_CII_HEADER_ONLY_KEYS.includes(entry.key))
    .map((entry) => ({
      ...entry,
      value: values[entry.key],
    }));
  const popupDefaultFields = (def.fields || def.options || [])
    .filter((entry) => !INPUTXML2019_CII_HEADER_ONLY_KEYS.includes(entry.key) && entry.key !== 'layoutConfigJson')
    .map((entry) => ({
      ...entry,
      value: values[entry.key],
    }));

  const applyPopupPayload = (payload) => {
    values.layoutConfigJson = _prepareInputxml2019ConfigForRequirements(payload.jsonText, requirements).jsonText;
    for (const [headerKey, headerValue] of Object.entries(payload.headerValues || {})) {
      values[headerKey] = headerValue;
    }
    // Branch Data tab edits (see _openJsonPopup's getEditedInputXmlText):
    // an edited copy of the loaded InputXML text, or null if nothing was
    // edited. run() in converters/inputxml-to-cii2019.js reads this same
    // key off the shared values/runValues object to replace the primary
    // file's bytes before invoking the Python worker.
    if (payload.editedInputXmlText) {
      values.__editedInputXmlText = payload.editedInputXmlText;
    }
  };

  const popupResult = await _openJsonPopupAsync({
    title: `${def.label}: File-based Config Review (${_toText(primaryFileName)})`,
    value: prepared.jsonText,
    headerFields: popupHeaderFields,
    defaultFields: popupDefaultFields,
    requirementLines: prepared.requirementLines,
    branchPreview,
    xmlText,
    unifiedSupportMapping: true,
    onSaveConfigOnly: typeof persist === 'function' ? (payload) => { applyPopupPayload(payload); persist(); } : undefined,
  });

  if (!popupResult.saved || !popupResult.payload) return false;
  applyPopupPayload(popupResult.payload);
  return true;
}

function _buildAdvancedFieldsHtml(def, values) {
  return def.fields.map((field) => {
    const key = field.key;
    const value = values[key];
    if (field.type === 'checkbox') {
      return `
        <label class="model-converters-checkbox">
          <input type="checkbox" data-option-key="${key}" ${value ? 'checked' : ''}>
          <span>${_esc(field.label)}</span>
        </label>
      `;
    }
    if (field.type === 'select') {
      return `
        <label class="model-converters-label">
          <span>${_esc(field.label)}</span>
          <select data-option-key="${key}">
            ${(field.options || []).map((option) => `
              <option value="${_esc(option)}" ${String(option) === String(value) ? 'selected' : ''}>${_esc(option)}</option>
            `).join('')}
          </select>
        </label>
      `;
    }
    if (field.type === 'json-popup') {
      const summary = _summarizeJsonConfig(value);
      return `
        <label class="model-converters-label">
          <span>${_esc(field.label)}</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button type="button" class="model-converters-download-btn" data-json-popup-key="${key}">Open Popup</button>
            <small class="model-converters-muted">${_esc(summary)}</small>
          </div>
          <textarea data-option-key="${key}" style="display:none;">${_esc(String(value || ''))}</textarea>
        </label>
      `;
    }
    if (field.type === 'column-picker') {
      const cols = _parseCsvColumnConfig(value);
      return `
        <div class="model-converters-label" style="flex-direction:column;align-items:flex-start;gap:4px;">
          <span style="font-weight:600;">${_esc(field.label)}</span>
          <div class="csv-column-picker" data-option-key="${_esc(key)}"
               style="max-height:260px;overflow-y:auto;border:1px solid #444;border-radius:4px;padding:4px 6px;width:100%;box-sizing:border-box;background:#1e2027;">
            ${cols.map((col) => `
              <div class="csv-col-row" data-col-key="${_esc(col.key)}"
                   style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:default;">
                <input type="checkbox" class="csv-col-visible" ${col.visible !== false ? 'checked' : ''}
                       style="margin:0;cursor:pointer;" title="Show/hide column">
                <span style="flex:1;font-size:12px;">${_esc(col.label)}</span>
                <button type="button" class="csv-col-up model-converters-download-btn"
                        style="padding:0 5px;min-width:22px;font-size:11px;" title="Move up">↑</button>
                <button type="button" class="csv-col-down model-converters-download-btn"
                        style="padding:0 5px;min-width:22px;font-size:11px;" title="Move down">↓</button>
              </div>
            `).join('')}
          </div>
          <small class="model-converters-muted">Check/uncheck to include columns · ↑↓ to reorder</small>
        </div>
      `;
    }
    if (field.type === 'support-type-rules') {
      const rules = _parseSupportTypeRules(value);
      const colOptions = STAGED_CSV_ALL_COLUMNS.map(
        (c) => `<option value="${_esc(c.key)}">${_esc(c.label)}</option>`,
      ).join('');
      const rowStyle = 'display:grid;grid-template-columns:140px 1fr 1fr 1fr 26px;gap:4px;padding:2px 0;align-items:center;';
      const inputStyle = 'font-size:11px;background:#2a2d38;border:1px solid #555;border-radius:3px;color:#eee;padding:2px 4px;width:100%;box-sizing:border-box;';
      const selectStyle = `${inputStyle}padding:1px 2px;`;
      const rulesHtml = rules.map((rule) => `
        <div class="csv-rule-row" style="${rowStyle}">
          <select class="csv-rule-col" style="${selectStyle}">
            ${STAGED_CSV_ALL_COLUMNS.map(
              (c) => `<option value="${_esc(c.key)}"${c.key === (rule.col || 'dtxr') ? ' selected' : ''}>${_esc(c.label)}</option>`,
            ).join('')}
          </select>
          <input type="text" class="csv-rule-contains" value="${_esc(rule.contains || '')}" placeholder="Contains…" style="${inputStyle}">
          <input type="text" class="csv-rule-notcontains" value="${_esc(rule.notContains || '')}" placeholder="Not Contains (opt.)" style="${inputStyle}">
          <input type="text" class="csv-rule-result" value="${_esc(rule.result || '')}" placeholder="Result e.g. G+LS" style="${inputStyle}">
          <button type="button" class="csv-rule-del model-converters-download-btn"
                  style="padding:0;min-width:22px;font-size:13px;color:#e88;line-height:1;" title="Delete rule">×</button>
        </div>
      `).join('');
      return `
        <div class="model-converters-label" style="flex-direction:column;align-items:flex-start;gap:4px;">
          <span style="font-weight:600;">${_esc(field.label)}</span>
          <div style="${rowStyle}font-weight:600;font-size:10px;color:#888;padding-bottom:0;">
            <span>Source Column</span><span>Contains</span><span>Not Contains</span><span>Result</span><span></span>
          </div>
          <div class="csv-support-rules" data-option-key="${_esc(key)}"
               style="width:100%;box-sizing:border-box;">
            ${rulesHtml}
          </div>
          <button type="button" class="csv-rule-add model-converters-download-btn" data-rules-key="${_esc(key)}"
                  style="font-size:11px;padding:2px 10px;align-self:flex-start;">+ Add Rule</button>
          <small class="model-converters-muted">
            Rules evaluated top-to-bottom · Result tokens combined with "+" · duplicates removed (e.g. R+R+G → R+G)
          </small>
        </div>
      `;
    }
    const inputType = field.type === 'number' ? 'number' : 'text';
    const stepAttr = field.step ? `step="${_esc(field.step)}"` : '';
    return `
      <label class="model-converters-label">
        <span>${_esc(field.label)}</span>
        <input type="${inputType}" ${stepAttr} data-option-key="${key}" value="${_esc(value)}">
      </label>
    `;
  }).join('');
}

function _downloadOutput(output) {
  return downloadOutput(output);
}

function _blobFromOutput(output) {
  if (typeof output?.base64 === 'string' && output.base64.length > 0) {
    const binary = atob(output.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: output.mime || 'application/octet-stream' });
  }
  const ext = String(output?.name || '').split('.').pop().toLowerCase();
  const inferredMime = (ext === 'txt' || ext === 'csv')
    ? 'text/plain;charset=utf-8'
    : 'application/octet-stream';
  return new Blob([output?.text || ''], { type: output?.mime || inferredMime });
}

function _openOutputInBasicViewer(output) {
  const pending = state.modelConvertersPendingBasicOpen;
  if (pending?.revokeOnLoad && /^blob:/i.test(_toText(pending.url))) {
    try { URL.revokeObjectURL(pending.url); } catch {}
  }
  const blob = _blobFromOutput(output);
  const url = URL.createObjectURL(blob);
  state.modelConvertersPendingBasicOpen = {
    url,
    name: _toText(output?.name || 'converted.glb'),
    revokeOnLoad: true,
    source: 'model-converters',
    createdAt: Date.now(),
  };
  emit(RuntimeEvents.TAB_CHANGE_REQUESTED, { tabId: 'basic-glb-pcf' });
}

function _arrayBufferToBase64(buffer) {
  return arrayBufferToBase64(buffer);
}

function _baseNameWithoutExtension(name) {
  return baseNameWithoutExtension(name);
}

function _isRvmFileName(name) {
  return isRvmFileName(name);
}

function _isAttOrTxtFileName(name) {
  return isAttOrTxtFileName(name);
}

function _encodeTextUtf8(text) {
  return encodeTextUtf8(text);
}

function _decodeTextUtf8(bytes) {
  return decodeTextUtf8(bytes);
}

function _toFiniteNumber(value, fallback) {
  return toFiniteNumber(value, fallback);
}

function _parseNumericMm(value) {
  const text = _toText(value).replace(/mm/gi, ' ').trim();
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function _migrateXmlCiiSupportConfigJson(rawJson) {
  const text = _toText(rawJson).trim();
  if (!text) return text;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return text;
    parsed.supportKindToXmlType = _normalizeXmlCiiSupportKindToTypeConfig(parsed.supportKindToXmlType);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

function _normalizeXmlCiiSupportKindToTypeConfig(value) {
  const mapping = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  const normalizedGuide = _toText(mapping.GUIDE).trim().toUpperCase();
  const normalizedLimit = _toText(mapping.LIMIT).trim().toUpperCase();
  const normalizedLinestop = _toText(mapping.LINESTOP).trim().toUpperCase();
  if (normalizedGuide === 'X' || normalizedGuide === 'GUIDE') mapping.GUIDE = 'GUI';
  if (normalizedLimit === 'Z' || normalizedLimit === 'LIMIT') mapping.LIMIT = 'LIM';
  if (normalizedLinestop === 'Z' || normalizedLinestop === 'LINESTOP') mapping.LINESTOP = 'LIM';
  return mapping;
}

function _parseXmlCiiEnrichmentConfig(rawJson) {
  return parseXmlCiiEnrichmentConfig(rawJson);
}

function _xmlLocalName(node) {
  return _toText(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function _xmlChildrenByName(parent, localName) {
  return [...(parent?.childNodes || [])].filter((child) => child.nodeType === 1 && _xmlLocalName(child) === localName);
}

function _xmlFirstChild(parent, localName) {
  return _xmlChildrenByName(parent, localName)[0] || null;
}

function _xmlText(parent, localName) {
  return _toText(_xmlFirstChild(parent, localName)?.textContent).trim();
}

function _xmlElementTextMap(parent) {
  const out = {};
  for (const child of [...(parent?.childNodes || [])]) {
    if (child.nodeType === 1) out[_xmlLocalName(child)] = _toText(child.textContent).trim();
  }
  return out;
}

function _xmlSetText(document, parent, localName, value) {
  let element = _xmlFirstChild(parent, localName);
  if (!element) {
    element = parent?.namespaceURI
      ? document.createElementNS(parent.namespaceURI, localName)
      : document.createElement(localName);
    parent.appendChild(element);
  }
  element.textContent = _toText(value);
  return element;
}

function _xmlEnsureChild(document, parent, localName) {
  let element = _xmlFirstChild(parent, localName);
  if (element) return element;
  element = parent?.namespaceURI
    ? document.createElementNS(parent.namespaceURI, localName)
    : document.createElement(localName);
  parent.appendChild(element);
  return element;
}

function _xmlPositionKey(positionText, tolerance) {
  const point = _normalizePoint(positionText);
  if (!point) return '';
  const tol = _toFiniteNumber(tolerance, 1) || 1;
  return [point.x, point.y, point.z].map((value) => Math.round(value / tol)).join('|');
}

function _stagedAttrValue(attrs, names) {
  for (const name of names || []) {
    const normalizedName = _toText(name).toUpperCase();
    for (const [key, value] of Object.entries(attrs || {})) {
      if (_toText(key).toUpperCase() === normalizedName && _toText(value).trim()) return value;
    }
  }
  return '';
}

function _walkStagedComponents(value, branchName = '', out = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => _walkStagedComponents(item, branchName, out));
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const attrs = value.attributes && typeof value.attributes === 'object' ? value.attributes : {};
  const type = _toText(value.type || attrs.TYPE).toUpperCase();
  const currentBranch = (type === 'BRANCH' || Array.isArray(value.children))
    ? _toText(value.name || attrs.NAME || branchName)
    : branchName;
  out.push({ component: value, attrs, branchName: currentBranch });
  if (Array.isArray(value.children)) value.children.forEach((child) => _walkStagedComponents(child, currentBranch, out));
  return out;
}

function _normalizeSupportTag(value) {
  const text = _toText(value).trim().toUpperCase().replace(/^\/+/, '');
  const match = text.match(/PS-\d+(?:\.\d+)?/i);
  if (!match) return '';
  return match[0].toUpperCase();
}

function _supportTagsFromText(value) {
  const text = _toText(value);
  const tags = new Set();
  for (const match of text.matchAll(/\/?PS-\d+(?:\.\d+)?/ig)) {
    const tag = _normalizeSupportTag(match[0]);
    if (tag) tags.add(tag);
  }
  return [...tags];
}

function _supportTagsFromAttrs(attrs, componentName = '') {
  const tags = new Set(_supportTagsFromText(componentName));
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value && typeof value === 'object') continue;
    for (const tag of _supportTagsFromText(`${key} ${value}`)) tags.add(tag);
  }
  return [...tags];
}

function _xmlNodeSupportTags(node) {
  const parts = [_xmlText(node, 'NodeName'), _xmlText(node, 'ComponentRefNo')];
  for (const child of _xmlChildrenByName(node, 'SupportTag')) parts.push(_toText(child.textContent));
  return [...new Set(parts.flatMap(_supportTagsFromText))];
}

function _supportTagBase(value) {
  return _normalizeSupportTag(value).replace(/\.\d+$/, '');
}

function _relaxedSameDtxrPosSupportMatches(xmlSupportTags, coordMatches) {
  if (!Array.isArray(coordMatches) || !coordMatches.length) return [];
  const baseTags = new Set(xmlSupportTags.map(_supportTagBase).filter(Boolean));
  if (!baseTags.size) return [];
  return coordMatches.filter((match) => {
    const stagedBaseTags = Array.isArray(match?.supportBaseTags) ? match.supportBaseTags : [];
    return stagedBaseTags.some((tag) => baseTags.has(tag));
  });
}

function _stagedSupportMatchKey(match) {
  const attrs = match?.attrs || {};
  return [
    attrs.REF,
    attrs.NAME,
    attrs.CMPSUPREFN,
    match?.component?.name,
    match?.primaryKind || match?.kind,
  ].map(_toText).join('|');
}

function _mergeUniqueSupportMatches(...groups) {
  const out = [];
  const seen = new Set();
  for (const group of groups) {
    for (const match of Array.isArray(group) ? group : []) {
      const key = _stagedSupportMatchKey(match);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(match);
    }
  }
  return out;
}

// Resolve a staged-support kind (REST / GUIDE / LINESTOP / ANCHOR) for restraint
// revalidation. The XML restraint type is NOT trusted; the staged support is the
// source of truth. Priority: a kind already resolved upstream, then the rule
// engine, then keyword detection so Shoe / REST / Wear Plate (WP) / Base Plate
// (BP) all classify as a vertical rest (mapped to +Y via supportKindToXmlType).
function _resolveXmlCiiSupportKind(attrs) {
  const direct = _toText(attrs?.SUPPORT_KIND || attrs?.SUPPORT_MAPPER_KIND || attrs?.SUPPORT_TYPE).trim().toUpperCase();
  if (direct) return direct;
  const ruleKind = _toText(resolveKindFromAttrs(attrs)).trim().toUpperCase();
  if (ruleKind) return ruleKind;
  // Keyword fallback for raw AVEVA data without a pre-computed kind. CMPSUPTYPE
  // code prefixes are the most reliable (SH-/PG-/LS-/BP-), then descriptive DTXR.
  const cmp = _toText(attrs?.CMPSUPTYPE).toUpperCase();
  if (/^LS-|LINE\s*STOP|LINESTOP/.test(cmp)) return 'LINESTOP';
  if (/^PG-|GUIDE/.test(cmp)) return 'GUIDE';
  if (/^(SH-|BP-)|REST|SHOE|WEAR\s*PLATE|W\.?\s*PAD|WPAD|BASE\s*PLATE/.test(cmp)) return 'REST';
  const dtxr = _toText(attrs?.DTXR).toUpperCase();
  if (/DIRECTIONAL\s*ANCHOR|LINE\s*STOP|LINESTOP/.test(dtxr)) return 'LINESTOP';
  if (/\bGUIDE\b/.test(dtxr)) return 'GUIDE';
  if (/\bANCHOR\b|\bFIXED\b/.test(dtxr)) return 'ANCHOR';
  if (/SHOE|\bREST\b|WEAR\s*PLATE|W\.?\s*PAD|BASE\s*PLATE/.test(dtxr)) return 'REST';
  return '';
}

function _buildStagedSupportIndex(stagedJsonText, config, diagnostics = []) {
  return buildStagedSupportIndex(stagedJsonText, config, diagnostics);
}

function _buildStagedComponentIndex(stagedJsonText, config) {
  const empty = { byCoord: new Map(), byTag: new Map(), count: 0 };
  if (!_toText(stagedJsonText).trim()) return empty;
  let parsed = null;
  try {
    parsed = JSON.parse(stagedJsonText);
  } catch {
    return empty;
  }
  const byCoord = new Map();
  const byTag = new Map();
  const tolerance = _toFiniteNumber(config.coordinateTolerance, 1);
  let count = 0;
  for (const entry of _walkStagedComponents(parsed)) {
    const attrs = entry.attrs || {};
    let point = null;
    for (const key of ['SUPPORTCOORD', 'POS', 'POSI', 'BPOS', 'APOS', 'LPOS', 'CPOS', 'HPOS', 'TPOS']) {
      point = _normalizePoint(attrs[key]);
      if (point) break;
    }
    const indexed = { ...entry, point };
    if (point) {
      const coordinateKey = _xmlPositionKey(`${point.x} ${point.y} ${point.z}`, tolerance);
      if (coordinateKey) {
        if (!byCoord.has(coordinateKey)) byCoord.set(coordinateKey, []);
        byCoord.get(coordinateKey).push(indexed);
      }
    }
    for (const tag of _supportTagsFromAttrs(attrs, entry.component?.name || '')) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(indexed);
    }
    count += 1;
  }
  return { byCoord, byTag, count };
}

function _stagedComponentForXmlNode(node, stagedIndex, config) {
  if (!stagedIndex || stagedIndex.count <= 0) return { match: null, method: '' };
  for (const tag of _xmlNodeSupportTags(node)) {
    const matches = stagedIndex.byTag.get(tag) || [];
    if (matches.length) return { match: matches[0], method: `PS tag ${tag}` };
  }
  const positionKey = _xmlPositionKey(_xmlText(node, 'Position'), _toFiniteNumber(config.coordinateTolerance, 1));
  const coordMatches = positionKey ? (stagedIndex.byCoord.get(positionKey) || []) : [];
  if (coordMatches.length) return { match: coordMatches[0], method: 'coordinate' };
  return { match: null, method: '' };
}

function _stagedComponentDtxr(indexed) {
  const attrs = indexed?.attrs || {};
  return _toText(attrs.DTXR_POS || attrs.DTXR || attrs.DESC || attrs.DESCRIPTION || attrs.NAME || indexed?.component?.name || '').trim();
}
function _xmlCiiDtxrPsForNode(node, stagedComponentIndex) {
  return xmlCiiDtxrPsForNode(node, stagedComponentIndex);
}

function _buildStagedDtxrPositionIndex(stagedJsonText, config) {
  return buildStagedDtxrPositionIndex(stagedJsonText, config);
}

function _xmlCiiCalibrateDtxrPositionIndex(dtxrPositionIndex, document, config) {
  return xmlCiiCalibrateDtxrPositionIndex(dtxrPositionIndex, document, config);
}

function _xmlCiiDtxrPosForNode(node, dtxrPositionIndex, config) {
  return xmlCiiDtxrPosForNode(node, dtxrPositionIndex, config);
}

function _deriveBranchLineKey(branchName, config) {
  return deriveLineKeyFromBranchName(branchName, config);
}

function _xmlCiiLineKeyRegexValue(value, pattern, groupIndex) {
  const text = _toText(value).trim();
  const patternText = _toText(pattern).trim();
  if (!text || !patternText) return text;
  const regexHit = _regexGroup(text, patternText, groupIndex || 1);
  return regexHit || text;
}

function _xmlCiiNormalizeLineKey(value) {
  return _toText(value).trim().toUpperCase().replace(/\s+/g, '');
}

function _xmlCiiFindLineListRow(branchLineKey, config) {
  const rows = Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows : [];
  if (!rows.length) return null;
  const lookupKey = _xmlCiiNormalizeLineKey(branchLineKey);
  const columnRegex = config.linelist?.linelistColumnRegex || '';
  const columnGroup = config.linelist?.linelistColumnGroup || 1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rawKey = _rowText(row, ['lineNo', 'lineKey', 'LineNo', 'Line No', 'PipelineReference']);
    const cleanKey = _xmlCiiNormalizeLineKey(_xmlCiiLineKeyRegexValue(rawKey, columnRegex, columnGroup));
    if (cleanKey && cleanKey === lookupKey) return _normalizeLineListRow(row, config.linelist?.fieldMap || {}, index);
  }
  return null;
}

// branchLineKey: the branch-regex-derived line key (e.g. 'S8810101') — takes priority
// over the linelist row's own lineNo/lineSeqNo field for override lookup.
function _xmlCiiProcessValue(pdOverride, row, overrideKey, rowKeys) {
  if (pdOverride && Object.prototype.hasOwnProperty.call(pdOverride, overrideKey)) {
    const overrideText = _toText(pdOverride[overrideKey]).trim();
    if (overrideText !== '') return overrideText;
  }
  return _rowText(row, rowKeys);
}

function _xmlCiiApplyLineListProcessData(document, branch, row, config, branchLineKey) {
  if (!row) return 0;
  let count = 0;
  // Use branch-derived key first so override lookup is key-consistent with the Preview
  const rowLineKey = _rowText(row, ['lineNo', 'lineSeqNo', 'lineKey']) || '';
  const lineKey = branchLineKey || rowLineKey;
  const pdOverride = (lineKey && config?.overrides?.processData?.[lineKey]) || {};
  const p1 = _xmlCiiProcessValue(pdOverride, row, 'p1', ['p1', 'P1', 'P1 / Design Pressure']);
  const hydro = _xmlCiiProcessValue(pdOverride, row, 'hydroPressure', ['hydroPressure', 'Hydro Test Pressure', 'Hydrotest Pressure', 'Hydro Pressure', 'Hydro Pr', 'Hyd Test Pr', 'Hyd. Test Pressure', 'Test Pressure', 'TEST_PRESSURE', 'HYDRO_TEST_PRESSURE', 'Pressure Test', 'Proof Pressure', 'Hydro/Test Pressure']);
  const t1 = _xmlCiiProcessValue(pdOverride, row, 't1', ['t1', 'T1', 'T1 (C)', 'T1 (ºC)']);
  const t2 = _xmlCiiProcessValue(pdOverride, row, 't2', ['t2', 'T2', 'Temperature2', 'Temperature 2', 'Temp', 'Temp. C', 'Temp ºC', 'T2 (C)', 'T2 (ºC)']);
  const t3 = _xmlCiiProcessValue(pdOverride, row, 't3', ['t3', 'T3', 'Temperature3', 'Temperature 3', 'Temp Min', 'Temp Min C', 'Temp Min °C', 'Min', 'T3 (C)', 'T3 (ºC)']);
  const insThk = _xmlCiiProcessValue(pdOverride, row, 'insThk', ['insThk', 'InsThk']);
  const density = _xmlCiiProcessValue(pdOverride, row, 'density', ['density', 'Density']);
  
  const pressure = _xmlEnsureChild(document, branch, 'Pressure');
  if (p1) {
    _xmlSetText(document, pressure, 'Pressure1', p1);
    count += 1;
  }
  if (hydro) {
    _xmlSetText(document, pressure, 'HydroPressure', hydro);
    count += 1;
  }
  
  const temperature = _xmlEnsureChild(document, branch, 'Temperature');
  if (t1) {
    _xmlSetText(document, temperature, 'Temperature1', t1);
    count += 1;
  }
  if (t2) {
    _xmlSetText(document, temperature, 'Temperature2', t2);
    count += 1;
  }
  if (t3) {
    _xmlSetText(document, temperature, 'Temperature3', t3);
    count += 1;
  }
  if (insThk) {
    _xmlSetText(document, branch, 'InsulationThickness', insThk);
    _xmlSetText(document, branch, 'InsulationDensity', insThk);
    count += 1;
  }
  if (density) {
    _xmlSetText(document, branch, 'FluidDensity', density);
    count += 1;
  }
  return count;
}

function _regexGroup(text, pattern, groupIndex = 1) {
  const source = _toText(text);
  const patternText = _toText(pattern).trim();
  if (!source || !patternText) return '';
  try {
    const match = new RegExp(patternText, 'i').exec(source);
    const index = Math.max(0, Number(groupIndex || 0));
    return _toText(match?.[index] || '').trim();
  } catch {
    return '';
  }
}

function _branchTokens(branchName, delimiter = '-') {
  const cleaned = _toText(branchName).trim().replace(/^\/+/, '').replace(/\/B\d+$/i, '');
  const delim = _toText(delimiter) || '-';
  return cleaned.split(delim).map((token) => token.trim()).filter(Boolean);
}

function _tokenAtPosition(branchName, delimiter, oneBasedIndex) {
  const index = Number(oneBasedIndex);
  if (!Number.isFinite(index) || index <= 0) return '';
  return _branchTokens(branchName, delimiter)[Math.round(index) - 1] || '';
}

function _xmlCiiTokenPositionList(value) {
  if (Array.isArray(value)) return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry > 0);
  const text = _toText(value).trim();
  if (!text) return [];
  // Reject decorated UI/count text such as "24(rows)"; token positions must be
  // plain 1-based numbers separated by comma or plus.
  if (!/^\s*\d+(?:\s*[,+]\s*\d+)*\s*$/.test(text)) return [];
  return text
    .split(/[,+]/)
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
}

function _xmlCiiLineKeyFromBranchTokens(branchName, config) {
  const linelist = config.linelist || {};
  const positions = _xmlCiiTokenPositionList(linelist.lineKeyTokenPositions);
  const safePositions = positions.length ? positions : [4];
  const delimiter = linelist.tokenDelimiter || '-';
  const joiner = _toText(linelist.lineKeyJoiner);
  const parts = safePositions.map((position) => _tokenAtPosition(branchName, delimiter, position)).filter(Boolean);
  return parts.join(joiner);
}

function _xmlCiiCleanSizeToken(value) {
  const match = _toText(value).match(/\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

function _deriveXmlCiiSizeTokenFromBranchName(branchName, config) {
  const raw = _regexGroup(branchName, config.weight?.boreRegex, config.weight?.boreGroup || 1)
    || _tokenAtPosition(branchName, config.weight?.tokenDelimiter || '-', config.weight?.boreTokenIndex || 3);
  return _xmlCiiCleanSizeToken(raw);
}

function _derivePipingClassFromBranchName(branchName, config) {
  const byRegex = _regexGroup(branchName, config.rating?.pipingClassRegex, config.rating?.pipingClassGroup || 1);
  if (byRegex) return byRegex;
  return _tokenAtPosition(branchName, config.rating?.tokenDelimiter || '-', config.rating?.pipingClassTokenIndex || 5);
}

function _deriveRatingFromPipingClass(pipingClass, config) {
  const text = _toText(pipingClass).trim().toUpperCase();
  if (!text) return '';
  const sequence = Array.isArray(config.rating?.ratingSequence) ? config.rating.ratingSequence : [];
  for (const pair of sequence) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const prefix = _toText(pair[0]).toUpperCase();
    if (prefix && text.startsWith(prefix)) return _toText(pair[1]);
  }
  return '';
}

function _nominalDnFromNps(inches, config) {
  if (!Number.isFinite(inches)) return null;
  const map = config.weight?.npsToDn && typeof config.weight.npsToDn === 'object' ? config.weight.npsToDn : {};
  const key = String(Number(inches));
  const mapped = Number(map[key] ?? map[inches] ?? map[inches.toFixed(3)]);
  if (Number.isFinite(mapped)) return mapped;
  return inches * _toFiniteNumber(config.weight?.inchToMm, 25.4);
}

function _deriveBoreFromBranchName(branchName, config) {
  const raw = _regexGroup(branchName, config.weight?.boreRegex, config.weight?.boreGroup || 1)
    || _tokenAtPosition(branchName, config.weight?.tokenDelimiter || '-', config.weight?.boreTokenIndex || 3);
  const inches = Number(_toText(raw).replace(/[^0-9.+-]/g, ''));
  return _nominalDnFromNps(inches, config);
}

// Real per-component Bore from the JSON Trace (ABORE/LBORE/PBORE/HBORE/TBORE/
// BORE/DN/NB, matched via ComponentRefNo) is authoritative when available —
// unlike a size token parsed out of the branch name string, it reflects the
// component actually there, so it must win over _deriveBoreFromBranchName
// rather than the other way around. Returns null (falling through to the
// branch-name regex) when no staged JSON is loaded or no node in this branch
// has a matching staged component.
function _stagedBranchBoreMm(branch, stagedGeometryIndex) {
  if (!stagedGeometryIndex?.count) return null;
  for (const node of _xmlChildrenByName(branch, 'Node')) {
    const geometry = resolveXmlCiiStagedGeometryForNode(node, stagedGeometryIndex);
    if (geometry?.boreMm) return geometry.boreMm;
  }
  return null;
}

function _pointDistanceMm(a, b) {
  const pa = _normalizePoint(a);
  const pb = _normalizePoint(b);
  if (!pa || !pb) return null;
  return Math.sqrt(((pa.x - pb.x) ** 2) + ((pa.y - pb.y) ** 2) + ((pa.z - pb.z) ** 2));
}

function _rowNumber(row, keys) {
  for (const key of keys) {
    const direct = row?.[key];
    const raw = row?._raw?.[key];
    const numeric = _parseNumericMm(direct ?? raw);
    if (numeric !== null) return numeric;
  }
  return null;
}

function _rowText(row, keys) {
  for (const key of keys) {
    const value = row?.[key] ?? row?._raw?.[key];
    if (_toText(value).trim()) return _toText(value).trim();
  }
  return '';
}

async function _loadXmlCiiWeightMasterRows(config, diagnostics = []) {
  if (Array.isArray(config.weight?.masterRows) && config.weight.masterRows.length) {
    diagnostics.push({ type: 'weight-master-source', source: 'inline-config', rows: config.weight.masterRows.length });
    return;
  }
  if (typeof fetch !== 'function') {
    diagnostics.push({ type: 'weight-master-source', source: 'fetch-unavailable', rows: 0 });
    return;
  }
  const configured = _toText(config.weight?.masterUrl || '').trim();
  const candidates = [...new Set([configured, '../docs/Masters/wtValveweights.json', 'docs/Masters/wtValveweights.json'].filter(Boolean))];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        diagnostics.push({ type: 'weight-master-fetch-skip', url, status: response.status });
        continue;
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        config.weight.masterRows = data;
        diagnostics.push({ type: 'weight-master-source', source: url, rows: data.length });
        return;
      }
      diagnostics.push({ type: 'weight-master-fetch-skip', url, reason: 'not-array' });
    } catch (error) {
      diagnostics.push({ type: 'weight-master-fetch-skip', url, reason: _toText(error?.message || error) });
    }
  }
}

function _xmlCiiRigidWeightOverrideKey(branchName, nodeNumber) {
  return xmlCiiRigidWeightOverrideKey(branchName, nodeNumber);
}

function _isXmlCiiRigidNode(node) {
  return isXmlCiiRigidNode(node);
}

if (typeof globalThis !== 'undefined' && !globalThis.isXmlCiiRigidNode) {
  Object.defineProperty(globalThis, 'isXmlCiiRigidNode', {
    value: _isXmlCiiRigidNode,
    configurable: true,
  });
}

function _xmlCiiNumberText(value) {
  return xmlCiiNumberText(value);
}

function _xmlCiiRigidWeightOverrideForNode(branchName, node, config, nodeIdx) {
  return xmlCiiRigidWeightOverrideForNode(branchName, node, config, nodeIdx);
}

function _xmlCiiForwardElementLengths(nodes) {
  return xmlCiiForwardElementLengths(nodes);
}

function _xmlCiiAncestorBranchName(node) {
  return xmlCiiAncestorBranchName(node);
}

function _collectXmlCiiZeroRigidWeightIssues(xmlText, stagedJsonText, config) {
  return collectXmlCiiZeroRigidWeightIssues(xmlText, stagedJsonText, config);
}

function _applyXmlCiiRigidWeightOverrides(xmlText, weightsByKey) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return { xmlText, appliedCount: 0, appliedRows: [] };
  }
  const document = new DOMParser().parseFromString(_toText(xmlText), 'application/xml');
  if (document.getElementsByTagName('parsererror').length) return { xmlText, appliedCount: 0, appliedRows: [] };
  const appliedRows = [];
  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const branchName = _xmlText(branch, 'Branchname');
    for (const node of _xmlChildrenByName(branch, 'Node')) {
      const nodeNumber = _xmlText(node, 'NodeNumber');
      const key = _xmlCiiRigidWeightOverrideKey(branchName, nodeNumber);
      const numeric = _xmlCiiNumberText(weightsByKey?.[key]);
      if (numeric === null || numeric <= 0) continue;
      _xmlSetText(document, node, 'Weight', String(numeric));
      appliedRows.push({ type: 'rigid-weight-manual-override', branchName, nodeNumber, weight: numeric });
    }
  }
  return {
    xmlText: new XMLSerializer().serializeToString(document),
    appliedCount: appliedRows.length,
    appliedRows,
  };
}


// --- Customization (material / approximate class / overrides / fuzzy) -------
// Mirrors scripts/master_customization.py so the browser and standalone agree.
function _xcNorm(value) {
  return _toText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function _xcTokens(value) {
  return new Set(_xcNorm(value).split(' ').filter(Boolean));
}
function _xcJaccard(a, b) {
  const ta = _xcTokens(a); const tb = _xcTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}
function _xcRatio(a, b) {
  const x = _xcNorm(a); const y = _xcNorm(b);
  if (!x || !y) return 0;
  // simple containment-weighted ratio (cheap, dependency-free)
  if (x === y) return 1;
  const longer = x.length >= y.length ? x : y;
  const shorter = x.length >= y.length ? y : x;
  return longer.includes(shorter) ? shorter.length / longer.length : _xcJaccard(x, y);
}
function _xcOverride(overrides, kind, key) {
  const bucket = overrides?.[kind];
  if (!bucket || typeof bucket !== 'object') return null;
  const nk = _xcNorm(key);
  for (const k of Object.keys(bucket)) if (_xcNorm(k) === nk) return bucket[k];
  return null;
}

async function _loadXmlCiiMasterRows(cfgSection, defaultUrls, label, diagnostics) {
  if (Array.isArray(cfgSection?.masterRows) && cfgSection.masterRows.length) {
    diagnostics.push({ type: `${label}-master-source`, source: 'inline-config', rows: cfgSection.masterRows.length });
    return cfgSection.masterRows;
  }
  if (typeof fetch !== 'function') { diagnostics.push({ type: `${label}-master-source`, source: 'fetch-unavailable', rows: 0 }); return []; }
  const configured = _toText(cfgSection?.masterUrl || '').trim();
  for (const url of [...new Set([configured, ...defaultUrls].filter(Boolean))]) {
    try {
      const response = await fetch(url);
      if (!response.ok) { diagnostics.push({ type: `${label}-master-fetch-skip`, url, status: response.status }); continue; }
      const data = await response.json();
      if (Array.isArray(data)) { cfgSection.masterRows = data; diagnostics.push({ type: `${label}-master-source`, source: url, rows: data.length }); return data; }
      diagnostics.push({ type: `${label}-master-fetch-skip`, url, reason: 'not-array' });
    } catch (error) { diagnostics.push({ type: `${label}-master-fetch-skip`, url, reason: _toText(error?.message || error) }); }
  }
  return [];
}

async function _loadXmlCiiMaterialMap(config, diagnostics = []) {
  const mat = config.material || (config.material = {});
  if (Array.isArray(mat.mapRows) && mat.mapRows.length) {
    diagnostics.push({ type: 'material-map-source', source: 'inline-config', rows: mat.mapRows.length });
    return mat.mapRows;
  }
  if (typeof fetch !== 'function') return [];
  const configured = _toText(mat.masterUrl || '').trim();
  for (const url of [...new Set([configured, '../docs/Masters/PCF_MAT_MAP.TXT', 'docs/Masters/PCF_MAT_MAP.TXT'].filter(Boolean))]) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const text = await response.text();
      let rows;
      try {
        const j = JSON.parse(text);
        rows = Array.isArray(j) ? j.map((r) => ({ code: _toText(r.code), material: _toText(r.material || r.desc || r.name) })) : null;
      } catch { rows = null; }
      if (!rows) {
        rows = [];
        for (const line of text.split(/\r?\n/)) {
          const m = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
          if (m) rows.push({ code: m[1], material: m[2] });
        }
      }
      mat.mapRows = rows;
      diagnostics.push({ type: 'material-map-source', source: url, rows: rows.length });
      return rows;
    } catch (error) { diagnostics.push({ type: 'material-map-fetch-skip', url, reason: _toText(error?.message || error) }); }
  }
  return [];
}

function _xmlCiiKnownClasses(config) {
  const rows = Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows : [];
  return [...new Set(rows.map((r) => _rowText(r, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class'])).filter(Boolean))];
}

function _xmlCiiApproximateClass(derived, config) {
  const ov = _xcOverride(config.overrides, 'pipingClass', derived);
  if (ov != null && _toText(ov) !== '') return { pipingClass: _toText(ov), method: 'override', confidence: 1, needsReview: false };
  const d = _xcNorm(derived);
  const classes = _xmlCiiKnownClasses(config);
  if (!d || !classes.length) return { pipingClass: derived || null, method: 'none', confidence: 0, needsReview: true };
  for (const c of classes) if (_xcNorm(c) === d) return { pipingClass: c, method: 'exact', confidence: 1, needsReview: false };
  const reviewBelow = _toFiniteNumber(config.pipingClass?.reviewBelow, 1);
  const sw = classes.filter((c) => _xcNorm(c).startsWith(d) || d.startsWith(_xcNorm(c)));
  if (sw.length === 1) { const conf = _toFiniteNumber(config.pipingClass?.startsWithConfidence, 0.8); return { pipingClass: sw[0], method: 'startsWith', confidence: conf, needsReview: conf < reviewBelow }; }
  if (sw.length > 1) return { pipingClass: null, method: 'ambiguous', confidence: _toFiniteNumber(config.pipingClass?.startsWithConfidence, 0.8), needsReview: true, candidates: sw };
  let best = null; let bestS = 0;
  for (const c of classes) { const s = _xcRatio(d, c); if (s > bestS) { best = c; bestS = s; } }
  if (best && bestS >= _toFiniteNumber(config.pipingClass?.fuzzyThreshold, 0.6)) return { pipingClass: best, method: 'fuzzy', confidence: bestS, needsReview: bestS < reviewBelow };
  return { pipingClass: null, method: 'none', confidence: bestS, needsReview: true };
}

function _findPipingClassMaster({ pipingClass, boreMm }, config) {
  const rows = Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows : [];
  if (!rows.length || !pipingClass) return null;
  const want = _xcNorm(pipingClass);
  for (const row of rows) {
    if (_xcNorm(_rowText(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class'])) !== want) continue;
    const rBore = _rowNumber(row, ['convertedBore', 'Converted Bore', 'DN', 'NB', 'Size', 'bore', 'Bore']);
    if (boreMm != null && rBore != null && Math.abs(rBore - boreMm) >= 1) continue;
    return {
      wallThickness: _rowText(row, ['Wall thickness', 'Wall Thickness', 'wallThickness', 'WT']),
      corrosion: _rowText(row, ['Corrosion', 'corrosionAllowance', 'Corrosion Allowance', 'CA']),
      materialName: _rowText(row, ['Material_Name', 'Material', 'material']),
      rating: _rowText(row, ['Rating', 'rating']),
    };
  }
  return null;
}

function _xmlCiiResolveMaterialCode(materialName, config) {
  const ov = _xcOverride(config.overrides, 'material', materialName);
  if (ov != null && _toText(ov) !== '') return { code: _toText(ov), method: 'override', confidence: 1, needsReview: false };
  const rows = Array.isArray(config.material?.mapRows) ? config.material.mapRows : [];
  const n = _xcNorm(materialName);
  if (!n || !rows.length) return { code: null, method: 'none', confidence: 0, needsReview: !!materialName };
  for (const r of rows) if (_xcNorm(r.material) === n) return { code: _toText(r.code), method: 'exact', confidence: 1, needsReview: false };
  let best = null;
  const containsConf = _toFiniteNumber(config.material?.containsConfidence, 0.9);
  for (const r of rows) { const c = _xcNorm(r.material); if (c && (c.includes(n) || n.includes(c))) { if (!best || containsConf > best.confidence) best = { code: _toText(r.code), method: 'contains', confidence: containsConf }; } }
  if (best) return { ...best, needsReview: best.confidence < 1 };
  const thr = _toFiniteNumber(config.material?.tokenJaccardThreshold, 0.35);
  for (const r of rows) { const j = _xcJaccard(n, r.material); if (j >= thr && (!best || j > best.confidence)) best = { code: _toText(r.code), method: 'token-jaccard', confidence: j }; }
  return best ? { ...best, needsReview: best.confidence < 1 } : { code: null, method: 'none', confidence: 0, needsReview: true };
}

function _deriveRatingText(attrs, config, derivedPipingClass = '') {
  const direct = _stagedAttrValue(attrs, config.rating?.sourceFields || []);
  const text = _toText(direct);
  const explicit = text.match(/(?:RATING|CLASS|CL)\s*[:=\-/ ]*([0-9]{2,4})/i);
  if (explicit) return explicit[1];
  const hash = text.match(/([0-9]{2,4})\s*#/);
  if (hash) return hash[1];
  const fromClass = _deriveRatingFromPipingClass(derivedPipingClass || text, config);
  return fromClass || text;
}

function _diagnosticRowsForTable(diagnostics) {
  return (Array.isArray(diagnostics) ? diagnostics : []).map((item) => ({
    type: item?.type || '',
    nodeNumber: item?.nodeNumber || item?.keptNode || item?.removedNode || '',
    branchName: item?.branchName || '',
    pipingClass: item?.pipingClass || '',
    rating: item?.rating || '',
    boreMm: item?.boreMm == null ? '' : Number(item.boreMm).toFixed ? Number(item.boreMm).toFixed(3) : item.boreMm,
    lengthMm: item?.lengthMm == null ? '' : Number(item.lengthMm).toFixed ? Number(item.lengthMm).toFixed(3) : item.lengthMm,
    weight: item?.weight ?? '',
    method: item?.method || item?.reason || item?.source || '',
    kind: item?.kind || '',
    componentType: item?.componentType || '',
    matchedBy: item?.matchedBy || '',
    matchedKey: item?.matchedKey || '',
    sourcePath: item?.sourcePath || '',
    jsonNodeNo: item?.jsonNodeNo || '',
    finalValue: item?.finalValue || item?.dtxrPos || item?.dtxrPs || item?.restraintTypes || item?.kind || '',
    oldValue: item?.oldValue || '',
    status: item?.status || '',
    tags: Array.isArray(item?.tags) ? item.tags.join('|') : (item?.tags || ''),
    message: item?.message || item?.stagedName || item?.url || item?.reason || '',
  }));
}

function _deriveWeightText(attrs, config) {
  const raw = _stagedAttrValue(attrs, config.weight?.sourceFields || []);
  const text = _toText(raw).trim();
  if (!text) return '';
  const match = text.match(/-?\d+(?:\.\d+)?(?:\s*kg)?/i);
  return match ? match[0].replace(/\s+/g, '') : text;
}

const XML_CII_NATIVE_RESTRAINT_TYPE_ALIASES = Object.freeze({
  GUI: 'GUI',
  GUIDE: 'GUI',
  LIM: 'LIM',
  LIMIT: 'LIM',
});

function _normalizeExistingXmlCiiRestraintType(typeText, config) {
  const raw = _toText(typeText).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const nativeType = XML_CII_NATIVE_RESTRAINT_TYPE_ALIASES[upper];
  if (nativeType) return nativeType;
  const sign = upper.startsWith('+') || upper.startsWith('-') ? upper[0] : '';
  const unsigned = sign ? upper.slice(1) : upper;
  const mapped = config.xmlAxisToCiiAxis?.[upper] || config.xmlAxisToCiiAxis?.[unsigned];
  if (mapped) return _toText(mapped).trim().toUpperCase();
  return upper;
}

function _xmlCiiTypeEntriesFromSupportKind(kind, config) {
  const value = config.supportKindToXmlType?.[kind];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((entry) => _toText(entry).trim().toUpperCase())
    .filter(Boolean)
    .map((type) => XML_CII_NATIVE_RESTRAINT_TYPE_ALIASES[type] || type);
}

function _xmlCiiTypeEntryFromExistingRestraint(restraint, config) {
  return {
    type: _normalizeExistingXmlCiiRestraintType(_xmlText(restraint, 'Type'), config),
    stiffness: _xmlText(restraint, 'Stiffness'),
    gap: _xmlText(restraint, 'Gap'),
    friction: _xmlText(restraint, 'Friction'),
  };
}

function _applyXmlRestraints(document, nodeElement, entries, config) {
  applyXmlRestraints(document, nodeElement, entries, config);
}

async function _enrichXmlForCii2019(xmlText, stagedJsonText, options = {}) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('XML enrichment requires browser DOMParser/XMLSerializer support.');
  }
  const config = _parseXmlCiiEnrichmentConfig(options.supportConfigJson);
  const parser = new DOMParser();
  const document = parser.parseFromString(_toText(xmlText), 'application/xml');
  const parseErrors = document.getElementsByTagName('parsererror');
  if (parseErrors.length) throw new Error(`Unable to parse XML for enrichment: ${_toText(parseErrors[0].textContent).slice(0, 160)}`);

  const diagnostics = [];
  await _loadXmlCiiWeightMasterRows(config, diagnostics);
  await _loadXmlCiiMasterRows(config.pipingClass, [], 'piping-class', diagnostics);
  await _loadXmlCiiMaterialMap(config, diagnostics);
  let stagedSupportIndex = _buildStagedSupportIndex(stagedJsonText, config, diagnostics);
  const stagedComponentIndex = _buildStagedComponentIndex(stagedJsonText, config);
  let stagedDtxrPositionIndex = _buildStagedDtxrPositionIndex(stagedJsonText, config);
  stagedDtxrPositionIndex = _xmlCiiCalibrateDtxrPositionIndex(stagedDtxrPositionIndex, document, config);
  const stagedDtxrRefIndex = buildStagedDtxrIndex(stagedJsonText, config);
  const stagedGeometryIndex = buildXmlCiiStagedGeometryIndex(stagedJsonText);
  if (stagedDtxrPositionIndex?.inferredOffset) {
    stagedSupportIndex = calibrateStagedSupportIndexCoordinates(stagedSupportIndex, stagedDtxrPositionIndex.inferredOffset, config);
    diagnostics.push({
      type: 'dtxr-position-offset-calibrated',
      samples: stagedDtxrPositionIndex.calibration?.samples || 0,
      uniqueTags: stagedDtxrPositionIndex.calibration?.uniqueTags || 0,
      xOffset: stagedDtxrPositionIndex.inferredOffset.x,
      yOffset: stagedDtxrPositionIndex.inferredOffset.y,
      zOffset: stagedDtxrPositionIndex.inferredOffset.z,
    });
  }
  const tolerance = _toFiniteNumber(config.coordinateTolerance, 1);
  const stats = { removedDuplicateSupports: 0, normalizedRestraints: 0, stagedSupportsMapped: 0, dtxrPsAnnotations: 0, dtxrPosAnnotations: 0, branchLineKeys: 0, lineListMatches: 0, processAnnotations: 0, ratingAnnotations: 0, weightAnnotations: 0 };
  diagnostics.push({ type: 'config', duplicateSupportPolicy: config.duplicateSupportPolicy, coordinateTolerance: tolerance, rating: config.rating, weight: { ...config.weight, masterRows: Array.isArray(config.weight?.masterRows) ? `${config.weight.masterRows.length} row(s)` : 'none' } });

  const pipingClassIndex = buildPipingClassIndex(config.pipingClass?.masterRows || []);
  const materialMap = config.material?.mapRows || [];

  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const branchName = _xmlText(branch, 'Branchname');
    const lineKey = _deriveBranchLineKey(branchName, config);
    const lineListMatch = lineKey ? _xmlCiiFindLineListRow(lineKey, config) : null;
    if (lineKey) {
      _xmlSetText(document, branch, 'PipelineReference', lineKey);
      _xmlSetText(document, branch, 'LineNo', lineKey);
      stats.branchLineKeys += 1;
    }
    if (lineListMatch) {
      stats.lineListMatches += 1;
      stats.processAnnotations += _xmlCiiApplyLineListProcessData(document, branch, lineListMatch, config, lineKey);
      diagnostics.push({ type: 'linelist-match', branchName, lineKey, lineSeqNo: lineListMatch.lineSeqNo || '', p1: lineListMatch.p1 || '', t1: lineListMatch.t1 || '', t2: lineListMatch.t2 || '', t3: lineListMatch.t3 || '', density: lineListMatch.density || '' });
    } else if (lineKey) {
      // No linelist match — still apply any user-typed processData overrides
      const pdOverride = config?.overrides?.processData?.[lineKey];
      if (pdOverride) {
        _xmlCiiApplyLineListProcessData(document, branch, pdOverride, config, lineKey);
        diagnostics.push({ type: 'process-override', branchName, lineKey, p1: pdOverride.p1 || '', t1: pdOverride.t1 || '', t2: pdOverride.t2 || '', t3: pdOverride.t3 || '', density: pdOverride.density || '' });
      }
    }

    const nodes = _xmlChildrenByName(branch, 'Node');
    const groups = new Map();
    for (const node of nodes) {
      if (_xmlText(node, 'ComponentType').toUpperCase() !== 'ATTA') continue;
      const key = _xmlPositionKey(_xmlText(node, 'Position'), tolerance);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    }
    for (const group of groups.values()) {
      if (group.length <= 1 || _toText(config.duplicateSupportPolicy).toLowerCase() !== 'prefer_datum') continue;
      const datumNode = group.find((node) => _xmlText(node, 'NodeName').toUpperCase().includes('DATUM'));
      const restrainedNode = group.find((node) => !!_xmlFirstChild(node, 'Restraint'));
      // If no DATUM name is present (common when upstream XML lost NodeName), still
      // collapse duplicate ATTA nodes at identical coordinates and retain the first
      // already-restrained support, otherwise the first node in branch order.
      const keepNode = datumNode || restrainedNode || group[0];
      for (const node of group) {
        if (node !== keepNode && node.parentNode) {
          node.parentNode.removeChild(node);
          stats.removedDuplicateSupports += 1;
          diagnostics.push({ type: 'duplicate-support-removed', keptNode: _xmlText(keepNode, 'NodeNumber'), removedNode: _xmlText(node, 'NodeNumber'), position: _xmlText(node, 'Position'), reason: datumNode ? 'DATUM' : restrainedNode ? 'restrained-node' : 'first-node' });
        }
      }
    }

    const derivedClassRaw = _derivePipingClassFromBranchName(branchName, config) || _rowText(lineListMatch, ['pipingClass', 'PipingClass']);
    const branchBore = _stagedBranchBoreMm(branch, stagedGeometryIndex)
      ?? (_deriveBoreFromBranchName(branchName, config) || _rowNumber(lineListMatch, ['convertedBore', 'Bore']));

    // Use unified branch-process resolver
    const resolved = resolveBranchProcessData({
      branchName,
      lineKey,
      lineRow: lineListMatch,
      boreMm: branchBore,
      componentType: 'PIPE',
      rating: _deriveRatingFromPipingClass(derivedClassRaw, config) || _rowText(lineListMatch, ['rating', 'Rating']),
      materialMap,
      pipingClassIndex,
      overrides: config.overrides || {},
      xmlNode: null,
      xmlBranch: branch,
      config
    });

    const pipingClass = resolved.pipingClass || derivedClassRaw;
    const pcMaster = resolved.pipingClassMatchedRow;
    const branchRating = resolved.pipingClassMatchedRow?.rating || _deriveRatingFromPipingClass(pipingClass, config) || _rowText(lineListMatch, ['rating', 'Rating']);

    if (pcMaster || resolved.pipingClassMatchMethod !== 'none') {
      diagnostics.push({
        type: 'class-master-match',
        branchName,
        derivedClass: derivedClassRaw,
        pipingClass,
        classMethod: resolved.pipingClassMatchMethod,
        classConfidence: resolved.pipingClassConfidence,
        wallThickness: resolved.wallThicknessMm ? String(resolved.wallThicknessMm) : '',
        corrosion: resolved.corrosionAllowanceMm != null ? String(resolved.corrosionAllowanceMm) : '',
        materialName: resolved.material || '',
        materialCode: resolved.materialCode || '',
        materialMethod: resolved.materialSource === 'override' ? 'override' : (resolved.materialSource === 'line-list-material-map' || resolved.materialSource === 'piping-class-material-map' ? 'exact' : resolved.materialSource),
        needsReview: resolved.pipingClassNeedsReview || (!resolved.materialCode && !!resolved.material)
      });
    }
    diagnostics.push({ type: 'branch-derived', branchName, pipingClass, rating: branchRating, boreMm: branchBore, processParameters: { temperature: _xmlElementTextMap(_xmlFirstChild(branch, 'Temperature')), pressure: _xmlElementTextMap(_xmlFirstChild(branch, 'Pressure')) } });
    const branchNodeList = _xmlChildrenByName(branch, 'Node');
    const forwardLengths = _xmlCiiForwardElementLengths(branchNodeList);
    branchNodeList.forEach((node, nodeIdx) => {
      const positionText = _xmlText(node, 'Position');
      const lengthMm = forwardLengths[nodeIdx];
      if (pipingClass) _xmlSetText(document, node, 'PipingClass', pipingClass);
      if (branchRating) {
        _xmlSetText(document, node, 'Rating', branchRating);
        stats.ratingAnnotations += 1;
      }
      if (branchBore !== null) _xmlSetText(document, node, 'BoreMm', branchBore.toFixed(3));
      if (lengthMm !== null) _xmlSetText(document, node, 'ElementLengthMm', lengthMm.toFixed(3));

      if (resolved.wallThicknessMm) {
        _xmlSetText(document, node, 'WallThickness', Number(resolved.wallThicknessMm.toPrecision(6)).toString());
      }
      if (resolved.corrosionAllowanceMm != null) {
        _xmlSetText(document, node, 'CorrosionAllowance', String(resolved.corrosionAllowanceMm));
      }
      if (resolved.material) {
        _xmlSetText(document, node, 'MaterialName', resolved.material);
      }
      if (resolved.materialCode) {
        _xmlSetText(document, node, 'MaterialCode', resolved.materialCode);
        // Also write to branch-level MaterialNumber (CII native field)
        _xmlSetText(document, branch, 'MaterialNumber', resolved.materialCode);
      }
      if (pcMaster) {
        stats.classMasterAnnotations = (stats.classMasterAnnotations || 0) + 1;
      }

      const manualRigidWeight = _xmlCiiRigidWeightOverrideForNode(branchName, node, config, nodeIdx);
      if (manualRigidWeight !== null) {
        _xmlSetText(document, node, 'Weight', String(manualRigidWeight));
        stats.weightAnnotations += 1;
        diagnostics.push({ type: 'rigid-weight-manual-override', nodeNumber: _xmlText(node, 'NodeNumber'), branchName, boreMm: branchBore, rating: branchRating, lengthMm, weight: manualRigidWeight });
      }
    });
  }

  const _seenPositionKeysForSupportCoverage = new Set();
  for (const node of [...document.getElementsByTagName('Node')]) {
    const componentType = _xmlText(node, 'ComponentType').toUpperCase();
    const positionKey = _xmlPositionKey(_xmlText(node, 'Position'), tolerance);
    if (positionKey) _seenPositionKeysForSupportCoverage.add(positionKey);
    const coordMatches = positionKey ? (stagedSupportIndex.byCoord.get(positionKey) || []) : [];
    const supportTags = _xmlNodeSupportTags(node);
    const tagMatches = supportTags.flatMap((tag) => stagedSupportIndex.byTag.get(tag) || []);
    const relaxedTagMatches = tagMatches.length ? [] : _relaxedSameDtxrPosSupportMatches(supportTags, coordMatches);
    // DTXR_POS/coordinate matches are node-scoped; DTXR_PS tags are a support-tag
    // fallback and must not add extra restraint kinds when POS already matched.
    const stagedMatches = coordMatches.length > 0
      ? coordMatches
      : (tagMatches.length > 0 ? tagMatches : relaxedTagMatches);
    const supportMatchMethod = coordMatches.length > 0
      ? 'dtxr-pos-coordinate'
      : (tagMatches.length > 0 ? 'dtxr-ps-tag-fallback' : (relaxedTagMatches.length > 0 ? 'dtxr-ps-tag-relaxed-fallback' : 'unmatched'));
    const staged = stagedMatches[0] || null;
    const restraints = _xmlChildrenByName(node, 'Restraint');
    const combinedTypes = dedupeXmlCiiRestraintEntries(stagedMatches.flatMap(m => xmlCiiRestraintEntriesFromSupportMatch(m, node, config)));
    const dtxrPs = _xmlCiiDtxrPsForNode(node, stagedComponentIndex);
    if (dtxrPs.text) {
      _xmlSetText(document, node, 'DTXR_PS', dtxrPs.text);
      stats.dtxrPsAnnotations += 1;
      diagnostics.push({ type: 'dtxr-ps', nodeNumber: _xmlText(node, 'NodeNumber'), nodeName: _xmlText(node, 'NodeName'), componentType, tags: dtxrPs.tags.join('|'), count: dtxrPs.values.length, matchedBy: 'DTXR_PS', matchedKey: dtxrPs.tags.join('|'), finalValue: dtxrPs.text, status: 'applied' });
    }
    const dtxrPos = _xmlCiiDtxrPosForNode(node, stagedDtxrPositionIndex, config);
    if (dtxrPos.text) {
      _xmlSetText(document, node, 'DTXR_POS', dtxrPos.text);
      stats.dtxrPosAnnotations += 1;
      diagnostics.push({ type: 'dtxr-pos', nodeNumber: _xmlText(node, 'NodeNumber'), nodeName: _xmlText(node, 'NodeName'), componentType, position: _xmlText(node, 'Position'), count: dtxrPos.values.length, matchedBy: 'DTXR_POS', matchedKey: _xmlText(node, 'Position'), sourcePath: dtxrPos.matchedPath || '', method: 'DTXR_POS exact or within +/-6mm trace tolerance', finalValue: dtxrPos.text, status: 'applied' });
    } else {
      const _existingDtxrPos = _xmlText(node, 'DTXR_POS');
      if (!_existingDtxrPos) {
        const _dtxrRef = resolveXmlCiiNodeDtxr(node, stagedDtxrRefIndex, config);
        if (_dtxrRef?.value && _dtxrRef.matchedBy === 'component-refno') {
          _xmlSetText(document, node, 'DTXR_POS', _dtxrRef.value);
          stats.dtxrPosAnnotations += 1;
          diagnostics.push({ type: 'dtxr-pos', nodeNumber: _xmlText(node, 'NodeNumber'), nodeName: _xmlText(node, 'NodeName'), componentType, matchedBy: 'component-refno', matchedKey: _dtxrRef.matchedKey || '', sourcePath: _dtxrRef.sourcePath || _dtxrRef.matchedKey || '', jsonNodeNo: '', method: `component-refno: ${_dtxrRef.matchedKey || ''}`, finalValue: _dtxrRef.value, status: 'applied' });
        }
      }
    }
    if (staged) {
      const allKinds = Array.from(new Set(stagedMatches.map(m => m.kind).filter(Boolean)));
      // Show the revalidation: the original (possibly erroneous) XML restraint
      // types vs the types derived from the staged support kinds.
      const xmlTypes = restraints.map((r) => _xmlText(r, 'Type')).filter(Boolean).join('+');
      diagnostics.push({ type: 'support-match', nodeNumber: _xmlText(node, 'NodeNumber'), nodeName: _xmlText(node, 'NodeName'), componentType, method: supportMatchMethod, matchedBy: supportMatchMethod, matchedKey: coordMatches.length > 0 ? positionKey : supportTags.join('|'), kind: allKinds.join('+'), xmlRestraintTypes: xmlTypes, restraintTypes: combinedTypes.join('+'), finalValue: combinedTypes.join('+'), stagedName: staged.component?.name || staged.attrs?.NAME || '', tags: supportTags, status: 'applied' });
    }

    let targetEntries = [];
    if (staged) {
      targetEntries = combinedTypes.length > 0 ? combinedTypes : [config.defaultXmlSupportType || 'Y'];
    } else if (restraints.length) {
      targetEntries = restraints
        .map((restraint) => _xmlCiiTypeEntryFromExistingRestraint(restraint, config))
        .filter((entry) => !!entry.type);
    }

    // Support/Restraint revalidation: a coordinate/tag match against the
    // staged support index (`staged`) means the source data says a support
    // genuinely exists at this node, independent of ComponentType. The ATTA
    // gate below intentionally limits *unprompted* restraint creation to
    // attachment nodes, which previously meant a real, DTXR_POS-confirmed
    // support on a non-ATTA node with no restraint yet was silently dropped.
    // Re-populate it here rather than leaving it missing.
    const isRevalidationFill = !!staged && componentType !== 'ATTA' && restraints.length === 0 && targetEntries.length > 0;
    if ((componentType === 'ATTA' || isRevalidationFill) && targetEntries.length > 0) {
      _applyXmlRestraints(document, node, targetEntries, config);
      if (staged) stats.stagedSupportsMapped += 1;
      stats.normalizedRestraints += targetEntries.length;
      if (isRevalidationFill) {
        stats.supportRevalidationFilled = (stats.supportRevalidationFilled || 0) + 1;
        diagnostics.push({
          type: 'support-revalidation-filled',
          nodeNumber: _xmlText(node, 'NodeNumber'),
          nodeName: _xmlText(node, 'NodeName'),
          componentType,
          matchedBy: supportMatchMethod,
          matchedKey: coordMatches.length > 0 ? positionKey : supportTags.join('|'),
          restraintTypes: targetEntries.join('+'),
          message: 'Populated restraint from staged support/DTXR_POS match on a node with no prior Restraint.',
          status: 'applied',
        });
      }
    } else if (restraints.length) {
      _applyXmlRestraints(document, node, targetEntries, config);
      stats.normalizedRestraints += targetEntries.length;
    }
    if (staged) {
      const rating = _deriveRatingText(staged.attrs, config, _xmlText(node, 'PipingClass'));
      const weight = _deriveWeightText(staged.attrs, config);
      const manualRigidWeight = _xmlCiiRigidWeightOverrideForNode(_xmlCiiAncestorBranchName(node), node, config);
      if (rating) {
        _xmlSetText(document, node, 'Rating', rating);
        stats.ratingAnnotations += 1;
      }
      if (weight && manualRigidWeight === null) {
        _xmlSetText(document, node, 'Weight', weight);
        stats.weightAnnotations += 1;
      }
    }
  }

  // Support/Restraint revalidation index: every POS-wise support the source
  // (staged JSON / DTXR) declares, independent of whether any XML <Node> in
  // this document actually landed on that coordinate. Entries with no
  // matching XML node are a genuine coverage gap (e.g. the node was dropped,
  // renumbered, or never emitted) that can't be auto-fixed by mutating a
  // node that doesn't exist, so they're surfaced as a diagnostic instead.
  let posIndex = 0;
  for (const [coordinateKey, matches] of stagedSupportIndex.byCoord.entries()) {
    posIndex += 1;
    const available = _seenPositionKeysForSupportCoverage.has(coordinateKey);
    if (available) continue;
    const tags = [...new Set(matches.flatMap((m) => m.supportTags || []))];
    const point = matches[0]?.point;
    diagnostics.push({
      type: 'support-coverage-gap',
      posId: `POS_${posIndex}`,
      coordinateKey,
      position: point ? `${point.x} ${point.y} ${point.z}` : '',
      tags: tags.join('/'),
      status: 'missing',
      message: `Support declared in source at ${tags.join('/') || coordinateKey} has no matching XML node; cannot auto-populate a restraint on a node that does not exist.`,
    });
  }
  if (stats.supportRevalidationFilled) {
    diagnostics.push({
      type: 'support-revalidation-summary',
      filled: stats.supportRevalidationFilled,
      message: `${stats.supportRevalidationFilled} support(s) re-populated from staged/DTXR_POS data on nodes that previously had no Restraint.`,
    });
  }

  const xmlOut = new XMLSerializer().serializeToString(document);
  const diagnosticText = JSON.stringify({ generatedAt: new Date().toISOString(), stats, diagnostics }, null, 2);
  if (Array.isArray(options._diagOut)) options._diagOut.push(...diagnostics);
  return { xmlText: xmlOut, stats, config, diagnostics, diagnosticRows: _diagnosticRowsForTable(diagnostics), diagnosticText };
}

function _normalizePoint(point) {
  if (point === undefined || point === null || point === '') return null;
  if (Array.isArray(point) && point.length >= 3) {
    const x = Number(point[0]);
    const y = Number(point[1]);
    const z = Number(point[2]);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }
  if (typeof point === 'object') {
    const x = Number(point.x ?? point.X);
    const y = Number(point.y ?? point.Y);
    const z = Number(point.z ?? point.Z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
  }
  const text = _toText(point).trim();
  if (!text) return null;
  const tokens = text.split(/\s+/g);
  const directional = { x: 0, y: 0, z: 0 };
  let parsedDirectional = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const value = _parseNumericMm(tokens[i + 1]);
    if (!Number.isFinite(value)) continue;
    if (axis === 'E') { directional.x = value; parsedDirectional = true; }
    else if (axis === 'W') { directional.x = -value; parsedDirectional = true; }
    else if (axis === 'N') { directional.y = value; parsedDirectional = true; }
    else if (axis === 'S') { directional.y = -value; parsedDirectional = true; }
    else if (axis === 'U') { directional.z = value; parsedDirectional = true; }
    else if (axis === 'D') { directional.z = -value; parsedDirectional = true; }
  }
  if (parsedDirectional) return directional;
  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function _formatDecimal(value, decimals) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  const text = numeric.toFixed(decimals);
  return text.replace(/\.?0+$/, '') || '0';
}

function _formatPosition(point) {
  return `${_formatDecimal(point.x, 2)} ${_formatDecimal(point.y, 2)} ${_formatDecimal(point.z, 2)}`;
}

function _resolveBoreMm(attributes, fallback) {
  for (const field of RMSS_BORE_FIELDS) {
    const parsed = _parseNumericMm(attributes?.[field]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function _buildXmlNodeBlock(lines, node) {
  lines.push('      <Node>');
  lines.push(`        <NodeNumber>${node.nodeNumber}</NodeNumber>`);
  lines.push(`        <NodeName>${_esc(node.nodeName)}</NodeName>`);
  lines.push(`        <Endpoint>${node.endpoint}</Endpoint>`);
  if (node.rigid !== null) {
    lines.push(`        <Rigid>${node.rigid}</Rigid>`);
  }
  lines.push(`        <ComponentType>${_esc(node.componentType)}</ComponentType>`);
  lines.push(`        <Weight>${_formatDecimal(node.weight ?? 0, 3)}</Weight>`);
  lines.push(`        <ComponentRefNo>${_esc(node.componentRefNo)}</ComponentRefNo>`);
  lines.push(`        <ConnectionType>${_esc(node.connectionType)}</ConnectionType>`);
  lines.push(`        <OutsideDiameter>${_formatDecimal(node.outsideDiameter, 3)}</OutsideDiameter>`);
  lines.push(`        <WallThickness>${_formatDecimal(node.wallThickness, 3)}</WallThickness>`);
  lines.push(`        <CorrosionAllowance>${_formatDecimal(node.corrosionAllowance, 3)}</CorrosionAllowance>`);
  lines.push(`        <InsulationThickness>${_formatDecimal(node.insulationThickness, 3)}</InsulationThickness>`);
  lines.push(`        <Position>${_formatPosition(node.position)}</Position>`);
  lines.push(`        <BendRadius>${_formatDecimal(node.bendRadius ?? 0, 3)}</BendRadius>`);
  if (node.bendType !== undefined && node.bendType !== null && node.bendType !== '') {
    lines.push(`        <BendType>${node.bendType}</BendType>`);
  }
  lines.push(`        <SIF>${node.sif}</SIF>`);
  lines.push('      </Node>');
}

function _emptySupportMapperStats() {
  return { scanned: 0, mapped: 0 };
}

function _supportKindForOutput(attrs) {
  return _toText(attrs?.SUPPORT_TYPE || attrs?.SUPPORT_KIND || '').trim().toUpperCase();
}

function _applySupportMapperToAttributes(attrs) {
  if (!attrs || typeof attrs !== 'object') return '';
  const kind = _toText(resolveKindFromAttrs(attrs)).trim().toUpperCase();
  if (!kind) return '';
  attrs.SUPPORT_TYPE = kind;
  attrs.SUPPORT_KIND = kind;
  attrs.SUPPORT_MAPPER_KIND = kind;
  return kind;
}

/**
 * Apply Support Mapper rules during conversion so managed-stage JSON, XML,
 * STP labels, and preview metadata share the same resolved support kind.
 * User rules intentionally override raw CMPSUPTYPE/SUPPORT_TYPE values.
 */
function _enrichHierarchyWithMapperKinds(nodes, stats = _emptySupportMapperStats()) {
  if (!Array.isArray(nodes)) return stats;
  for (const node of nodes) {
    if (!node) continue;
    const typeStr = String(node.type || node.attributes?.TYPE || '').toUpperCase();
    if (typeStr === 'SUPPORT' || typeStr === 'ATTA' || typeStr === 'ANCI') {
      const attrs = node.attributes || (node.attributes = {});
      const before = _supportKindForOutput(attrs);
      const kind = _applySupportMapperToAttributes(attrs);
      stats.scanned += 1;
      if (kind && kind !== before) stats.mapped += 1;
    }
    if (Array.isArray(node.children)) _enrichHierarchyWithMapperKinds(node.children, stats);
    if (Array.isArray(node.items)) _enrichHierarchyWithMapperKinds(node.items, stats);
    if (Array.isArray(node.branches)) _enrichHierarchyWithMapperKinds(node.branches, stats);
  }
  return stats;
}

const RMSS_XML_TYPE_PATTERNS = Object.freeze([
  [/WELDOLET|SOCKOLET|THREDOLET|SWEEPOLET|\bOLET\b/i, 'OLET'],
  [/\bVALV(E)?\b/i, 'VALV'],
  [/\bFLAN(GE)?\b/i, 'FLAN'],
  [/\bGASK(ET)?\b/i, 'GASK'],
  [/\b(ELBO(W)?|BEND)\b/i, 'ELBO'],
  [/\bTEE\b/i, 'TEE'],
  [/\bREDU(CER)?\b/i, 'REDU'],
  [/\b(ATTA|ANCI|SUPP|SUPPORT)\b/i, 'ATTA'],
  [/\b(PIPE|TUBI)\b/i, 'PIPE'],
]);
const RMSS_XML_ENDPOINT_TYPES = new Set(['PIPE', 'VALV', 'FLAN', 'GASK', 'REDU', 'TEE', 'OLET', 'ELBO', 'ATTA']);

function _firstAttr(attrs, keys) {
  for (const key of keys) {
    const value = attrs?.[key];
    if (value !== undefined && value !== null && _toText(value).trim() !== '') return value;
  }
  return '';
}

function _xmlComponentTypeForChild(child) {
  const attrs = child?.attributes || {};
  const source = [child?.type, child?.kind, child?.name, attrs.TYPE, attrs.RAW_TYPE, attrs.STYP, attrs.SPRE, attrs.PTYPE, attrs.GTYPE, attrs.CATL, attrs.DETAIL]
    .map(_toText)
    .join(' ');
  for (const [pattern, type] of RMSS_XML_TYPE_PATTERNS) {
    if (pattern.test(source)) return type;
  }
  const fallback = _toText(child?.type || attrs.TYPE || '').toUpperCase();
  return fallback || 'UNKNOWN';
}

function _pointFromAttrs(child, attrs, keys) {
  for (const key of keys) {
    const point = _normalizePoint(attrs?.[key] ?? child?.[key]);
    if (point) return point;
  }
  return null;
}

function _xmlPointsForChild(child) {
  const attrs = child?.attributes || {};
  return {
    apos: _pointFromAttrs(child, attrs, ['APOS', 'A_POS', 'EP1', 'END1', 'START', 'START_POINT', 'POS_START', 'POSSTART']),
    lpos: _pointFromAttrs(child, attrs, ['LPOS', 'L_POS', 'EP2', 'END2', 'END', 'END_POINT', 'POS_END', 'POSEND']),
    pos: _pointFromAttrs(child, attrs, ['POS', 'POSITION', 'COORDS', 'CO_ORDS', 'CO_ORD', 'POSS']),
    cpos: _pointFromAttrs(child, attrs, ['CPOS', 'CP', 'CENTER', 'CENTRE', 'CENTER_POINT', 'CENTRE_POINT']),
    bpos: _pointFromAttrs(child, attrs, ['BPOS', 'BP', 'BRANCH_POINT', 'BRANCH1_POINT', 'BPOS1', 'TEE_POINT']),
  };
}

function _pointDistance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function _bendRadiusForChild(child, points) {
  const attrs = child?.attributes || {};
  const explicit = _parseNumericMm(_firstAttr(attrs, ['BENDRADIUS', 'BEND_RADIUS', 'BRAD', 'RADI', 'RADIUS']));
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const center = points.cpos || points.pos;
  if (center && points.apos && points.lpos) return Math.min(_pointDistance(center, points.apos), _pointDistance(center, points.lpos));
  return 0;
}

function _xmlNodeBaseForChild(child, type, componentRefNo, defaults) {
  const attrs = child?.attributes || {};
  const nodeName = _toText(_firstAttr(attrs, ['NAME', 'TAG', 'TAGNO', 'ITEMCODE', 'PARTNO']) || child?.name || type).trim() || type;
  return {
    nodeName,
    rigid: null,
    componentType: type,
    componentRefNo: _toText(_firstAttr(attrs, ['REF', 'REFNO', 'COMPONENTREFNO', 'DBREF', 'CA97', 'CA98']) || child?.ref || child?.id || componentRefNo) || componentRefNo,
    connectionType: _toText(_firstAttr(attrs, ['CONNECTIONTYPE', 'CONN', 'CONNECTION', 'CTYP']) || 'BW'),
    outsideDiameter: _resolveBoreMm(attrs, defaults.defaultDiameter),
    wallThickness: Math.max(0, _parseNumericMm(_firstAttr(attrs, ['WTHK', 'WALLTHK', 'WALL_THICKNESS'])) ?? defaults.defaultWallThickness),
    corrosionAllowance: Math.max(0, _parseNumericMm(_firstAttr(attrs, ['CORA', 'CORROSIONALLOWANCE'])) ?? defaults.defaultCorrosionAllowance),
    insulationThickness: Math.max(0, _parseNumericMm(_firstAttr(attrs, ['INSU', 'INSULATIONTHICKNESS'])) ?? defaults.defaultInsulationThickness),
    weight: _toFiniteNumber(attrs.WEIG ?? attrs.WEIGHT, 0),
    bendRadius: 0,
    sif: _toFiniteNumber(attrs.SIF, 0),
  };
}

function _expandRmssChildToPsiXmlNodes(child, componentRefNo, defaults) {
  const attrs = child?.attributes || {};
  const type = _xmlComponentTypeForChild(child);
  if (!RMSS_XML_ENDPOINT_TYPES.has(type)) return [];
  const points = _xmlPointsForChild(child);
  const basePoint = points.pos || points.cpos || points.apos || points.lpos || points.bpos;
  if (!basePoint) return [];
  const base = _xmlNodeBaseForChild(child, type, componentRefNo, defaults);
  const nodes = [];
  const push = (endpoint, position, extra = {}) => {
    if (!position) return;
    nodes.push({ ...base, endpoint, position, ...extra });
  };

  if (type === 'ELBO') {
    const bendRadius = _bendRadiusForChild(child, points);
    push(1, points.apos || basePoint, { bendRadius, bendType: 0 });
    push(0, points.cpos || points.pos || basePoint, { nodeName: '', bendRadius, bendType: 1 });
    push(2, points.lpos || basePoint, { bendRadius, bendType: 0 });
    return nodes;
  }

  if (type === 'TEE') {
    const center = points.pos || points.cpos || basePoint;
    push(1, points.apos || center);
    push(3, points.bpos || center);
    push(0, center, { nodeName: '' });
    push(2, points.lpos || center);
    return nodes;
  }

  if (type === 'OLET') {
    const header = points.pos || points.cpos || points.apos || basePoint;
    push(1, points.apos || header);
    push(3, points.bpos || points.lpos || header);
    push(0, header, { nodeName: '' });
    push(2, points.lpos || header);
    return nodes;
  }

  if (type === 'ATTA') {
    const supportKind = _supportKindForOutput(attrs);
    push(0, basePoint, { rigid: 1, connectionType: supportKind, componentType: 'ATTA' });
    return nodes;
  }

  if (points.apos && points.lpos) {
    push(1, points.apos);
    push(2, points.lpos);
    return nodes;
  }

  push(0, basePoint);
  return nodes;
}

function _buildPsiXmlFromRmssHierarchy(hierarchy, inputName, options) {
  const normalizedHierarchy = Array.isArray(hierarchy) ? hierarchy : [];
  const supportMapperStats = _enrichHierarchyWithMapperKinds(normalizedHierarchy);
  const branches = normalizedHierarchy.filter((entry) => entry && Array.isArray(entry.children) && entry.children.length > 0);
  if (!branches.length) {
    throw new Error('ATT/TXT parser returned no branch topology. Cannot generate XML.');
  }

  const source = _toText(options?.source).trim() || 'AVEVA PSI';
  const purpose = _toText(options?.purpose).trim() || 'RMSS attribute conversion';
  const titleLine = _toText(options?.titleLine).trim() || 'RMSS Attribute Output';
  const nodeStart = Math.max(1, Math.trunc(_toFiniteNumber(options?.nodeStart, 10)));
  const nodeStep = Math.max(1, Math.trunc(_toFiniteNumber(options?.nodeStep, 10)));
  const defaultDiameter = Math.max(0.001, _toFiniteNumber(options?.defaultDiameter, 100));
  const defaultWallThickness = Math.max(0, _toFiniteNumber(options?.defaultWallThickness, 0.01));
  const defaultCorrosionAllowance = Math.max(0, _toFiniteNumber(options?.defaultCorrosionAllowance, 0));
  const defaultInsulationThickness = Math.max(0, _toFiniteNumber(options?.defaultInsulationThickness, 0));

  let nodeNumber = nodeStart;
  let componentRefCounter = 1;
  let nodeCount = 0;
  let skippedComponents = 0;
  const lines = [];

  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">');
  lines.push(`  <DateTime>${_esc(new Date().toISOString())}</DateTime>`);
  lines.push(`  <Source>${_esc(source)}</Source>`);
  lines.push('  <Version>0.0.0.0</Version>');
  lines.push('  <UserName>browser-runtime</UserName>');
  lines.push(`  <Purpose>${_esc(purpose)}</Purpose>`);
  lines.push(`  <ProjectName>${_esc(_baseNameWithoutExtension(inputName || 'RMSS_ATTRIBUTE'))}</ProjectName>`);
  lines.push(`  <MDBName>/${_esc(_baseNameWithoutExtension(inputName || 'RMSS_ATTRIBUTE'))}</MDBName>`);
  lines.push(`  <TitleLine>${_esc(titleLine)}</TitleLine>`);
  lines.push('  <!-- Configuration information -->');
  lines.push('  <RestrainOpenEnds>No</RestrainOpenEnds>');
  lines.push('  <AmbientTemperature>0</AmbientTemperature>');
  lines.push('  <Pipe>');
  lines.push(`    <FullName>/RMSS/${_esc(_baseNameWithoutExtension(inputName || 'ATTRIBUTES'))}</FullName>`);
  lines.push('    <Ref>=ATT/PIPE/1</Ref>');

  for (const branch of branches) {
    const branchName = _toText(branch.name).trim() || 'UNSPECIFIED-BRANCH';
    const branchChildren = Array.isArray(branch.children) ? branch.children : [];

    lines.push('    <Branch>');
    lines.push(`      <Branchname>${_esc(branchName)}</Branchname>`);
    lines.push('      <Temperature>');
    for (let idx = 1; idx <= 9; idx += 1) lines.push(`        <Temperature${idx}>0</Temperature${idx}>`);
    lines.push('      </Temperature>');
    lines.push('      <Pressure>');
    for (let idx = 1; idx <= 9; idx += 1) lines.push(`        <Pressure${idx}>0</Pressure${idx}>`);
    lines.push('      </Pressure>');
    lines.push('      <MaterialNumber>0</MaterialNumber>');
    lines.push('      <InsulationDensity>0</InsulationDensity>');
    lines.push('      <FluidDensity>0</FluidDensity>');

    const xmlDefaults = {
      defaultDiameter,
      defaultWallThickness,
      defaultCorrosionAllowance,
      defaultInsulationThickness,
    };

    for (const child of branchChildren) {
      const componentRefNo = `=ATT/${componentRefCounter}`;
      componentRefCounter += 1;
      const expandedNodes = _expandRmssChildToPsiXmlNodes(child, componentRefNo, xmlDefaults);
      if (!expandedNodes.length) {
        skippedComponents += 1;
        continue;
      }
      for (const expandedNode of expandedNodes) {
        _buildXmlNodeBlock(lines, { ...expandedNode, nodeNumber });
        nodeCount += 1;
        nodeNumber += nodeStep;
      }
    }

    lines.push('    </Branch>');
  }

  lines.push('  </Pipe>');
  lines.push('</PipeStressExport>');

  return {
    xmlText: `${lines.join('\n')}\n`,
    branchCount: branches.length,
    nodeCount,
    skippedComponents,
    supportMapperStats,
  };
}

function _isObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function _looksLikeBranchNode(entry) {
  if (!_isObjectRecord(entry)) return false;
  const typeToken = _toText(entry?.type || entry?.attributes?.TYPE || '').toUpperCase();
  const hasBranchType = typeToken === 'BRANCH' || typeToken === 'BRAN';
  const hasChildren = Array.isArray(entry.children);
  return hasBranchType && hasChildren;
}

function _looksLikeStagedHierarchy(payload) {
  if (!Array.isArray(payload) || payload.length === 0) return false;
  let branchCount = 0;
  for (const entry of payload) {
    if (_looksLikeBranchNode(entry)) branchCount += 1;
  }
  return branchCount > 0;
}

function _collectBboxLeafCount(payload) {
  let count = 0;
  const stack = [payload];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const child of current) stack.push(child);
      continue;
    }
    if (!_isObjectRecord(current)) continue;
    const children = Array.isArray(current.children) ? current.children : null;
    const bbox = Array.isArray(current.bbox) ? current.bbox : null;
    const isLeaf = !children || children.length === 0;
    if (isLeaf && bbox && bbox.length === 6) count += 1;
    if (children) {
      for (const child of children) stack.push(child);
    }
  }
  return count;
}

// ── STP text builder ─────────────────────────────────────────────────────────

const _STP_STUB_HALF_MM = 75; // vertical stub half-length for single-point members

function _stpFmtCoord(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}

function _stpPointDist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Low-level: generate ISO-10303-21 STEP text from an array of
 * {label, start:{x,y,z}, end:{x,y,z}} members.
 * Zero-length members get a ±75 mm vertical stub so they are visible.
 */
function _buildStpTextFromMembers(rawMembers, outputName) {
  if (!Array.isArray(rawMembers) || !rawMembers.length) return null;
  const timestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const escapedName = _toText(outputName).replace(/'/g, "''");
  const header = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ATT support members exported as STEP polylines'),'2;1');",
    `FILE_NAME('${escapedName}','${timestamp}',('browser-runtime'),('browser-runtime'),'browser-runtime','browser-runtime','');`,
    "FILE_SCHEMA(('CIS2'));",
    'ENDSEC;',
    'DATA;',
  ];
  const dataLines = [];
  let entityId = 1;
  const polylineIds = [];

  for (const member of rawMembers) {
    let { start, end } = member;
    if (!start || !end) continue;
    if (_stpPointDist(start, end) < 1) {
      // Zero/near-zero: make a vertical stub centred at start.
      start = { x: start.x, y: start.y, z: start.z - _STP_STUB_HALF_MM };
      end   = { x: end.x,   y: end.y,   z: end.z   + _STP_STUB_HALF_MM };
    }
    const kind = _toText(member.kind || '').trim().toUpperCase();
    const rawLabel = _toText(member.label || '');
    const labelText = kind && !rawLabel.toUpperCase().startsWith(`${kind}:`)
      ? `${kind}:${rawLabel}`
      : rawLabel;
    const label = labelText.replace(/'/g, "''");
    const s = entityId++;
    dataLines.push(`#${s}=CARTESIAN_POINT('',(${_stpFmtCoord(start.x)},${_stpFmtCoord(start.y)},${_stpFmtCoord(start.z)}));`);
    const e = entityId++;
    dataLines.push(`#${e}=CARTESIAN_POINT('',(${_stpFmtCoord(end.x)},${_stpFmtCoord(end.y)},${_stpFmtCoord(end.z)}));`);
    const p = entityId++;
    dataLines.push(`#${p}=POLYLINE('${label}',(#${s},#${e}));`);
    polylineIds.push(p);
  }

  if (!polylineIds.length) return null;
  const refs = polylineIds.map((id) => `#${id}`).join(',');
  dataLines.push(`#${entityId}=PRESENTATION_LAYER_ASSIGNMENT('SUPPORT_MEMBERS','',(${refs}));`);
  return [...header, ...dataLines, 'ENDSEC;', 'END-ISO-10303-21;'].join('\n') + '\n';
}

/**
 * Fallback: extract stub members from a staged hierarchy's SUPPORT nodes.
 * Used when no raw ATT text is available (JSON-only path).
 */
function _buildStpTextFromRmssHierarchy(hierarchy, outputName) {
  const normalized = Array.isArray(hierarchy) ? hierarchy : [];
  const rawMembers = [];
  let idx = 0;
  for (const branch of normalized) {
    if (!_looksLikeBranchNode(branch)) continue;
    for (const child of Array.isArray(branch.children) ? branch.children : []) {
      const type = _toText(child?.type || child?.attributes?.TYPE || '').toUpperCase();
      if (type !== 'SUPPORT') continue;
      const attrs = child?.attributes || {};
      const apos = _normalizePoint(attrs.APOS);
      const lpos = _normalizePoint(attrs.LPOS);
      const bpos = _normalizePoint(attrs.BPOS);
      const hpos = _normalizePoint(attrs.HPOS);
      const tpos = _normalizePoint(attrs.TPOS);
      const pos  = _normalizePoint(attrs.POS);
      // Pick the best non-zero pair, or fall back to a single anchor.
      const pairs = [[apos, lpos], [hpos, bpos], [apos, hpos], [apos, tpos]];
      let start = null, end = null;
      for (const [a, b] of pairs) {
        if (a && b && _stpPointDist(a, b) > 1) { start = a; end = b; break; }
      }
      if (!start) {
        const anchor = pos || apos || lpos || hpos || bpos || tpos;
        if (!anchor) continue;
        start = { x: anchor.x, y: anchor.y, z: anchor.z };
        end   = { x: anchor.x, y: anchor.y, z: anchor.z }; // stub applied in _buildStpTextFromMembers
      }
      rawMembers.push({
        label: _toText(`${_supportKindForOutput(attrs) || 'SUPPORT'}:${attrs.NAME || child?.name || `SUPPORT:${++idx}`}`),
        start,
        end,
      });
    }
  }
  return _buildStpTextFromMembers(rawMembers, outputName);
}

function _buildXmlFromStagedJsonText(stagedJsonText, inputName, options) {
  let parsed;
  try {
    parsed = JSON.parse(_toText(stagedJsonText));
  } catch (error) {
    throw new Error(`Staged JSON parse failed: ${_toText(error?.message || error)}`);
  }
  if (!_looksLikeStagedHierarchy(parsed)) {
    throw new Error('JSON payload is not staged hierarchy format (branch -> children -> attributes).');
  }
  const scope = _filterStagedHierarchyByScope(parsed, options?.rvmScope);
  const scopedHierarchy = scope.hierarchy;
  if (!scopedHierarchy.length) {
    throw new Error(`Scope filter ${JSON.stringify(scope.pattern)} did not match any staged branch/site.`);
  }
  const xmlBuild = _buildPsiXmlFromRmssHierarchy(scopedHierarchy, inputName, options);
  return {
    xmlText: xmlBuild.xmlText,
    stageJsonText: JSON.stringify(scopedHierarchy, null, 2),
    branchCount: xmlBuild.branchCount,
    nodeCount: xmlBuild.nodeCount,
    skippedComponents: xmlBuild.skippedComponents,
    supportMapperStats: xmlBuild.supportMapperStats,
    scopeStats: scope.stats,
    scopePattern: scope.pattern,
    rvmScope: scope.scope,
  };
}

function _normalizeRvmScopePattern(pattern) {
  return _toText(pattern).trim();
}

function _normalizeRvmScope(scope) {
  if (typeof scope === 'string') {
    const wildcard = _normalizeRvmScopePattern(scope);
    return { wildcard, selectedIds: [], enabled: !!wildcard };
  }
  const wildcard = _normalizeRvmScopePattern(scope?.wildcard ?? scope?.pattern ?? '');
  const selectedIds = Array.isArray(scope?.selectedIds)
    ? scope.selectedIds.map((id) => _toText(id)).filter(Boolean)
    : [];
  return { wildcard, selectedIds, enabled: !!wildcard || selectedIds.length > 0 };
}

function _rvmScopeRegex(pattern) {
  const normalized = _normalizeRvmScopePattern(pattern);
  if (!normalized) return null;
  const escaped = normalized
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const source = normalized.includes('*') ? `^${escaped}$` : escaped;
  return new RegExp(source, 'i');
}

function _rvmBranchKey(branch) {
  const attrs = branch?.attributes || {};
  return _toText(branch?.name || attrs.NAME || branch?.id || '').trim();
}

function _rvmScopeText(value) {
  if (!value || typeof value !== 'object') return _toText(value);
  const attrs = value.attributes || {};
  const parts = [
    value.label,
    value.name,
    value.id,
    value.type,
    value.kind,
    attrs.NAME,
    attrs.OWNER,
    attrs.OWNER_SITE,
    attrs.SITE,
    attrs.ZONE,
    attrs.PIPE,
    attrs.BRANCH,
    attrs.HREF,
    attrs.TREF,
    attrs.CREF,
  ];
  return parts.map((part) => _toText(part)).filter(Boolean).join(' ');
}

function _matchesRvmScope(value, pattern) {
  const regex = _rvmScopeRegex(pattern);
  if (!regex) return true;
  return regex.test(_rvmScopeText(value));
}

function _branchScopeIds(branch) {
  const attrs = branch?.attributes || {};
  const ids = new Set();
  const branchKey = _rvmBranchKey(branch);
  if (branchKey) ids.add(`branch:${branchKey}`);
  const site = _toText(attrs.OWNER_SITE || attrs.SITE).trim();
  if (site) ids.add(`site:${site}`);
  const owner = _toText(attrs.OWNER).trim();
  if (owner) {
    ids.add(`owner:${owner}`);
    const parts = owner.split(/[\\/>]+/).map((part) => part.trim()).filter(Boolean);
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      ids.add(`owner:${acc}`);
    }
  }
  return ids;
}

function _filterStagedHierarchyByScope(hierarchy, rawScope) {
  const scope = _normalizeRvmScope(rawScope);
  const source = Array.isArray(hierarchy) ? hierarchy : [];
  if (!scope.enabled) {
    return {
      hierarchy: source,
      scope,
      pattern: '',
      stats: { enabled: false, originalBranchCount: source.length, keptBranchCount: source.length },
    };
  }

  const selectedIds = new Set(scope.selectedIds || []);
  const kept = [];
  for (const entry of source) {
    const ids = _branchScopeIds(entry);
    const selectedMatch = selectedIds.size > 0 && [...ids].some((id) => selectedIds.has(id));
    const wildcardMatch = !!scope.wildcard && _matchesRvmScope(entry, scope.wildcard);
    if (selectedMatch || wildcardMatch) kept.push(entry);
  }
  return {
    hierarchy: kept,
    scope,
    pattern: scope.wildcard,
    stats: {
      enabled: true,
      originalBranchCount: source.length,
      keptBranchCount: kept.length,
      selectedCount: selectedIds.size,
      wildcard: scope.wildcard,
    },
  };
}

function _filterStpMembersByScope(members, rawScope) {
  const scope = _normalizeRvmScope(rawScope);
  const source = Array.isArray(members) ? members : [];
  if (!scope.enabled) return source;
  if (!scope.wildcard) return [];
  const regex = _rvmScopeRegex(scope.wildcard);
  if (!regex) return source;
  return source.filter((member) => regex.test([member?.label, member?.kind].map((part) => _toText(part)).join(' ')));
}

function _rvmScopeLogLine(scopeStats) {
  if (!scopeStats?.enabled) return '';
  const selected = Number(scopeStats.selectedCount || 0) > 0 ? `, selected=${scopeStats.selectedCount}` : '';
  const wildcard = scopeStats.wildcard ? `, wildcard=${scopeStats.wildcard}` : '';
  return `Scope filter applied: ${scopeStats.keptBranchCount}/${scopeStats.originalBranchCount} branch(es) matched${selected}${wildcard}.`;
}

function _buildRvmScopeTreeFromHierarchy(hierarchy) {
  const roots = [];
  const nodeMap = new Map();
  const ensureNode = (id, label, kind, parent = null, searchable = '') => {
    let node = nodeMap.get(id);
    if (!node) {
      node = { id, label, kind, parent, children: [], branchKeys: new Set(), searchable: searchable || label };
      nodeMap.set(id, node);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return node;
  };
  const addBranchKeyToAncestors = (node, branchKey) => {
    let cur = node;
    while (cur) {
      cur.branchKeys.add(branchKey);
      cur = cur.parent;
    }
  };

  for (const branch of Array.isArray(hierarchy) ? hierarchy : []) {
    const branchKey = _rvmBranchKey(branch);
    if (!branchKey) continue;
    const attrs = branch?.attributes || {};
    const siteLabel = _toText(attrs.OWNER_SITE || attrs.SITE || 'Unspecified Site').trim() || 'Unspecified Site';
    const site = ensureNode(`site:${siteLabel}`, siteLabel, 'SITE', null, siteLabel);
    let parent = site;
    const owner = _toText(attrs.OWNER).trim();
    if (owner) {
      const parts = owner.split(/[\\/>]+/).map((part) => part.trim()).filter(Boolean);
      let acc = '';
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        if (part === siteLabel || acc === siteLabel) continue;
        parent = ensureNode(`owner:${acc}`, part, 'OWNER', parent, `${acc} ${owner}`);
      }
    }
    const branchNode = ensureNode(`branch:${branchKey}`, branchKey, 'BRANCH', parent, _rvmScopeText(branch));
    branchNode.branch = branch;
    addBranchKeyToAncestors(branchNode, branchKey);
  }

  const finalize = (node) => {
    node.branchKeys = Array.from(node.branchKeys);
    node.children.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    for (const child of node.children) finalize(child);
    return node;
  };
  roots.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  return roots.map(finalize);
}

async function _openRvmAttributeScopePopup(inputName, hierarchy, initialScope = {}) {
  const tree = _buildRvmScopeTreeFromHierarchy(hierarchy);
  if (typeof document === 'undefined' || !tree.length) {
    return { cancelled: false, ..._normalizeRvmScope(initialScope) };
  }

  return new Promise((resolve) => {
    const selected = new Set(_normalizeRvmScope(initialScope).selectedIds || []);
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:24px;';
    const card = document.createElement('div');
    card.style.cssText = 'width:min(860px,96vw);max-height:88vh;background:#151a22;color:#e8eef7;border:1px solid #3b4658;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden;';
    card.innerHTML = `
      <div style="padding:14px 18px;border-bottom:1px solid #303848;">
        <div style="font-size:17px;font-weight:700;">Select ATT/RVM hierarchy scope</div>
        <div style="font-size:12px;color:#9fb0c4;margin-top:4px;">Choose one or more hierarchy items to convert to staged JSON / XML / STP. Leave all unchecked and wildcard blank to convert the full file.</div>
        <div style="font-size:12px;color:#7f8ea3;margin-top:4px;">Input: ${_esc(inputName || 'RVM Attribute conversion')}</div>
      </div>
      <div style="padding:12px 18px;border-bottom:1px solid #303848;display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;">
        <input data-scope-wildcard type="text" placeholder='Wildcard filter e.g. *ASIM-1835* or *ASIM-1835-6&quot;-S*' style="background:#0d1118;color:#e8eef7;border:1px solid #41506a;border-radius:7px;padding:8px 10px;" />
        <button type="button" data-scope-select-visible class="model-converters-download-btn">Select matches</button>
        <button type="button" data-scope-clear class="model-converters-download-btn">Clear</button>
        <div data-scope-stats style="grid-column:1/-1;color:#9fb0c4;font-size:12px;"></div>
      </div>
      <div data-scope-tree style="padding:10px 18px;overflow:auto;min-height:260px;max-height:52vh;font-size:13px;"></div>
      <div style="padding:12px 18px;border-top:1px solid #303848;display:flex;justify-content:flex-end;gap:8px;">
        <button type="button" data-scope-cancel class="model-converters-download-btn">Cancel</button>
        <button type="button" data-scope-convert class="model-converters-run-btn">Convert selected scope</button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const wildcardInput = card.querySelector('[data-scope-wildcard]');
    const treeEl = card.querySelector('[data-scope-tree]');
    const statsEl = card.querySelector('[data-scope-stats]');
    wildcardInput.value = _normalizeRvmScope(initialScope).wildcard || '';

    const walk = (nodes, fn) => {
      for (const node of nodes || []) {
        fn(node);
        walk(node.children, fn);
      }
    };
    const collectIds = (node, out = []) => {
      out.push(node.id);
      for (const child of node.children || []) collectIds(child, out);
      return out;
    };
    const nodeMatches = (node, regex) => !regex || regex.test([node.label, node.kind, node.searchable].join(' '));
    const hasVisible = (node, regex) => nodeMatches(node, regex) || (node.children || []).some((child) => hasVisible(child, regex));

    const render = () => {
      const wildcard = _normalizeRvmScopePattern(wildcardInput.value);
      const regex = _rvmScopeRegex(wildcard);
      let visibleBranches = 0;
      let selectedBranches = new Set();
      const selectedIds = new Set(selected);
      const renderNode = (node, depth = 0) => {
        if (!hasVisible(node, regex)) return '';
        if (node.kind === 'BRANCH') visibleBranches += 1;
        const childHtml = (node.children || []).map((child) => renderNode(child, depth + 1)).filter(Boolean).join('');
        const nodeIds = collectIds(node);
        const checked = selected.has(node.id);
        const childSelected = nodeIds.some((id) => selected.has(id));
        if (childSelected) for (const key of node.branchKeys || []) selectedBranches.add(key);
        return `
          <li style="list-style:none;margin:2px 0 2px ${depth ? 14 : 0}px;">
            <label style="display:flex;align-items:center;gap:7px;padding:3px 4px;border-radius:5px;${nodeMatches(node, regex) && wildcard ? 'background:rgba(75,137,220,.16);' : ''}">
              <input type="checkbox" data-scope-node="${_escAttr(node.id)}" ${checked ? 'checked' : ''} data-indeterminate="${!checked && childSelected ? 'true' : 'false'}">
              <span style="color:#7fb4ff;font-size:11px;min-width:48px;">${_esc(node.kind)}</span>
              <span>${_esc(node.label)}</span>
              <span style="color:#7f8ea3;font-size:11px;">${(node.branchKeys || []).length ? `(${node.branchKeys.length})` : ''}</span>
            </label>
            ${childHtml ? `<ul style="padding-left:0;margin:0;">${childHtml}</ul>` : ''}
          </li>`;
      };
      treeEl.innerHTML = `<ul style="padding-left:0;margin:0;">${tree.map((node) => renderNode(node)).join('')}</ul>`;
      treeEl.querySelectorAll('input[data-indeterminate="true"]').forEach((input) => { input.indeterminate = true; });
      statsEl.textContent = `${visibleBranches} visible branch(es), ${selectedBranches.size || selected.size} selected item(s). Wildcard and checked items are combined.`;
    };

    treeEl.addEventListener('change', (event) => {
      const input = event.target.closest('input[data-scope-node]');
      if (!input) return;
      const id = input.getAttribute('data-scope-node');
      let targetNode = null;
      walk(tree, (node) => { if (node.id === id) targetNode = node; });
      for (const nodeId of targetNode ? collectIds(targetNode) : [id]) {
        if (input.checked) selected.add(nodeId);
        else selected.delete(nodeId);
      }
      render();
    });
    wildcardInput.addEventListener('input', render);
    card.querySelector('[data-scope-select-visible]').addEventListener('click', () => {
      const regex = _rvmScopeRegex(wildcardInput.value);
      walk(tree, (node) => { if (node.kind === 'BRANCH' && hasVisible(node, regex)) selected.add(node.id); });
      render();
    });
    card.querySelector('[data-scope-clear]').addEventListener('click', () => {
      selected.clear();
      wildcardInput.value = '';
      render();
    });
    const close = (result) => {
      overlay.remove();
      resolve(result);
    };
    card.querySelector('[data-scope-cancel]').addEventListener('click', () => close({ cancelled: true, wildcard: '', selectedIds: [] }));
    card.querySelector('[data-scope-convert]').addEventListener('click', () => close({
      cancelled: false,
      wildcard: _normalizeRvmScopePattern(wildcardInput.value),
      selectedIds: Array.from(selected),
    }));
    render();
  });
}

function _buildRvmAttrResponseFromAttText(attText, inputName, options) {
  const stem = _baseNameWithoutExtension(inputName || 'RMSS_ATTRIBUTE');
  const parsedHierarchy = parseRmssAttributes(attText, state.rvm?.routing);
  const scope = _filterStagedHierarchyByScope(parsedHierarchy, options?.rvmScope);
  const hierarchy = scope.hierarchy;
  if (!hierarchy.length) {
    throw new Error(`Scope filter ${JSON.stringify(scope.pattern)} did not match any ATT/RVM branch/site.`);
  }
  const xmlFromAtt = _buildPsiXmlFromRmssHierarchy(hierarchy, inputName, options);
  let attStpText = null;
  const structMembers = _filterStpMembersByScope(parseRmssStructuralMembers(attText), scope.scope);
  if (structMembers.length > 0) {
    attStpText = _buildStpTextFromMembers(structMembers, `${stem}_supports.stp`);
  } else {
    attStpText = _buildStpTextFromRmssHierarchy(hierarchy, `${stem}_supports.stp`);
  }
  const attOutputs = [
    {
      name: `${stem}_rvmattr_to_xml.xml`,
      text: xmlFromAtt.xmlText,
      mime: 'text/xml;charset=utf-8',
    },
    {
      name: `${stem}_managed_stage.json`,
      text: JSON.stringify(hierarchy, null, 2),
      mime: 'application/json;charset=utf-8',
    },
  ];
  if (attStpText) attOutputs.push({ name: `${stem}_supports.stp`, text: attStpText, mime: 'text/plain;charset=utf-8' });
  return {
    outputs: attOutputs,
    logs: {
      stdout: [
        _rvmScopeLogLine(scope.stats),
        `ATT/TXT parsed into ${xmlFromAtt.branchCount} branch(es).`,
        `Generated ${xmlFromAtt.nodeCount} node(s) into PSI-style XML.`,
        `Support mapper conversion pass: scanned=${xmlFromAtt.supportMapperStats?.scanned || 0}, mapped=${xmlFromAtt.supportMapperStats?.mapped || 0}.`,
        ...(attStpText ? [`Generated STP for ${structMembers.length > 0 ? 'structural' : 'pipeline support'} members.`] : []),
      ].filter(Boolean),
      stderr: xmlFromAtt.skippedComponents > 0
        ? [`Skipped ${xmlFromAtt.skippedComponents} component(s) with incomplete coordinates.`]
        : [],
    },
  };
}

const STAGED_CSV_ALL_COLUMNS = Object.freeze([
  { key: 'site',        label: 'Site' },
  { key: 'pipe',        label: 'Pipe' },
  { key: 'branchSeg',   label: 'Branch' },
  { key: 'branchBore',  label: 'Branch Bore' },
  { key: 'compName',    label: 'Component Name' },
  { key: 'compType',    label: 'Component Type' },
  { key: 'ref',         label: 'Ref No' },
  { key: 'name',        label: 'NAME' },
  { key: 'cmpsuprefn',  label: 'CMPSUPREFN' },
  { key: 'desc',        label: 'DESC' },
  { key: 'type',        label: 'TYPE' },
  { key: 'dtxr',        label: 'DTXR' },
  { key: 'mtxx',        label: 'Material (MTXX)' },
  { key: 'abore',       label: 'Bore A' },
  { key: 'lbore',       label: 'Bore L' },
  { key: 'spre',        label: 'Spec (SPRE)' },
  { key: 'stex',        label: 'STEX' },
  { key: 'mdssupptype', label: 'MDSSUPPTYPE' },
  { key: 'cmpsupgap',   label: 'CMPSUPGAP' },
  { key: 'lstu',        label: 'Catalogue (LSTU)' },
  { key: 'posX',        label: 'Pos X (mm)' },
  { key: 'posY',        label: 'Pos Y (mm)' },
  { key: 'posZ',        label: 'Pos Z (mm)' },
  { key: 'supportType', label: 'Support Type' },
]);

// Default rules for computing the Support Type column from DTXR (or any source column).
// Each rule: { col, contains, notContains, result }
//   col        — key from STAGED_CSV_ALL_COLUMNS to read (default 'dtxr')
//   contains   — substring the cell value must include (case-insensitive)
//   notContains — optional substring the cell value must NOT include
//   result     — code(s) to emit, "+" separates multiple tokens (e.g. "G+LS")
const STAGED_CSV_DEFAULT_SUPPORT_TYPE_RULES = Object.freeze([
  { col: 'dtxr',        contains: 'GUI',      notContains: '',    result: 'G'    },
  { col: 'dtxr',        contains: 'STOP',     notContains: '',    result: 'LS'   },
  { col: 'dtxr',        contains: 'NON GRIP', notContains: '',    result: 'G'    },
  { col: 'dtxr',        contains: 'GRIP',     notContains: 'NON', result: 'G+LS' },
  { col: 'dtxr',        contains: 'REST',     notContains: '',    result: 'R'    },
  { col: 'dtxr',        contains: 'SHOE',     notContains: '',    result: 'R'    },
  { col: 'dtxr',        contains: 'HAN',      notContains: '',    result: 'H'    },
  { col: 'mdssupptype', contains: 'AT',       notContains: '',    result: 'R'    },
  { col: 'mdssupptype', contains: 'G',        notContains: '',    result: 'G'    },
  { col: 'mdssupptype', contains: 'ST5',      notContains: '',    result: 'LS'   },
]);

function _parseSupportTypeRules(raw) {
  if (!raw) return STAGED_CSV_DEFAULT_SUPPORT_TYPE_RULES.map((r) => ({ ...r }));
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }
  return STAGED_CSV_DEFAULT_SUPPORT_TYPE_RULES.map((r) => ({ ...r }));
}

// Evaluate support-type rules against a fully merged row.
// mergedRow[rule.col] may be a "|"-concatenated string of multiple values.
// Emits unique result tokens joined with "+", e.g. "R+G".
function _computeSupportType(mergedRow, rules) {
  const resultSet = new Set();
  for (const rule of rules) {
    const colKey = rule.col || 'dtxr';
    const cellVal = String(mergedRow[colKey] || '').toUpperCase();
    const parts = cellVal.split('|').map((s) => s.trim()).filter(Boolean);
    const contains    = String(rule.contains    || '').toUpperCase().trim();
    const notContains = String(rule.notContains || '').toUpperCase().trim();
    const result      = String(rule.result      || '').trim();
    if (!contains || !result) continue;
    for (const part of parts) {
      if (!part.includes(contains)) continue;
      if (notContains && part.includes(notContains)) continue;
      for (const token of result.split('+').map((t) => t.trim()).filter(Boolean)) {
        resultSet.add(token);
      }
    }
  }
  return [...resultSet].join('+');
}

function _parseCsvColumnConfig(raw) {
  // Returns [{key, label, visible}] — merges stored user config with the master list.
  const master = STAGED_CSV_ALL_COLUMNS.map((c) => ({ ...c, visible: true }));
  if (!raw) return master;
  let stored;
  try { stored = JSON.parse(raw); } catch { return master; }
  if (!Array.isArray(stored)) return master;
  // Re-apply stored order + visibility, appending any new columns not yet in the stored config.
  const storedKeys = stored.map((s) => s.key);
  const result = stored
    .map((s) => {
      const def = master.find((m) => m.key === s.key);
      return def ? { ...def, visible: s.visible !== false } : null;
    })
    .filter(Boolean);
  for (const col of master) {
    if (!storedKeys.includes(col.key)) result.push({ ...col, visible: true });
  }
  return result;
}

function _stagedJsonExtractSiteAndPipe(branchName) {
  // Branch name is like "/ASIM-1844-3"-S8810794-91261M7-01/B1"
  // Pipe name is the first path segment; SITE is everything before the pipe size (digit+")
  const pathParts = _toText(branchName).replace(/^\//, '').split('/');
  const pipeFull = pathParts[0] || '';
  const branchSeg = pathParts[1] || '';
  const m = pipeFull.match(/^(.*?)(\d+".*)/);
  const site = m ? (m[1].replace(/-$/, '') || '(no site)') : '(no site)';
  const pipe = m ? m[2] : pipeFull;
  return { site, pipe, branch: branchSeg, pipeFull };
}

function _stagedJsonCsvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function _buildCsvFromStagedJson(stagedJsonText, _inputName, columnConfigRaw, supportTypeRulesRaw) {
  let branches;
  try {
    branches = JSON.parse(_toText(stagedJsonText));
  } catch (e) {
    throw new Error(`Staged JSON parse failed: ${_toText(e?.message || e)}`);
  }
  if (!Array.isArray(branches)) {
    throw new Error('Staged JSON root must be an array of branch objects.');
  }

  // Resolve active columns from user config (respects visibility and order).
  const colConfig = _parseCsvColumnConfig(columnConfigRaw || '');
  const activeCols = colConfig.filter((c) => c.visible !== false);

  // Sort branches: OWNER_SITE → OWNER (pipe) → branch segment.
  const _branchSortKey = (b) => {
    const attrs = b.attributes || {};
    const site = _toText(attrs.OWNER_SITE || '').replace(/^\//, '');
    const pipe = _toText(attrs.OWNER || '').replace(/^\//, '');
    const seg  = _toText(b.name || '').replace(/^\//, '').split('/').pop() || '';
    return [site || _stagedJsonExtractSiteAndPipe(b.name || '').site,
            pipe || _stagedJsonExtractSiteAndPipe(b.name || '').pipe,
            seg];
  };
  const sortedBranches = [...branches].sort((a, b) => {
    const [as_, ap, ab] = _branchSortKey(a);
    const [bs, bp, bb]  = _branchSortKey(b);
    return as_.localeCompare(bs) || ap.localeCompare(bp) || ab.localeCompare(bb);
  });

  const allRecords = [];
  for (const branch of sortedBranches) {
    const bAttrs = branch.attributes || {};
    // Prefer OWNER / OWNER_SITE set by rmss-attribute-parser; fall back to name-based extraction.
    const ownerPipe = _toText(bAttrs.OWNER || '').replace(/^\//, '');
    const ownerSite = _toText(bAttrs.OWNER_SITE || '').replace(/^\//, '');
    const fallback = _stagedJsonExtractSiteAndPipe(branch.name || '');
    const site      = ownerSite || fallback.site;
    const pipe      = ownerPipe || fallback.pipe;
    const branchSeg = _toText(branch.name || '').replace(/^\//, '').split('/').pop() || fallback.branch;
    const branchBore = _toText(branch.bore || '');

    for (const comp of (branch.children || [])) {
      const attrs = comp.attributes || {};
      const pos = attrs.POS || attrs.APOS || attrs.CPOS || null;
      const posX = pos && typeof pos === 'object' ? _toText(pos.x ?? '') : '';
      const posY = pos && typeof pos === 'object' ? _toText(pos.y ?? '') : '';
      const posZ = pos && typeof pos === 'object' ? _toText(pos.z ?? '') : '';
      allRecords.push({
        site, pipe, branchSeg, branchBore,
        compName:    _toText(comp.name || ''),
        compType:    _toText(comp.type || ''),
        ref:         _toText(attrs.REF || ''),
        name:        _toText(attrs.NAME || ''),
        cmpsuprefn:  _toText(attrs.CMPSUPREFN || ''),
        desc:        _toText(attrs.DESC || ''),
        type:        _toText(attrs.TYPE || comp.type || ''),
        dtxr:        _toText(attrs.DTXR || ''),
        mtxx:        _toText(attrs.MTXX || ''),
        abore:       _toText(attrs.ABORE || ''),
        lbore:       _toText(attrs.LBORE || ''),
        spre:        _toText(attrs.SPRE || ''),
        stex:        _toText(attrs.STEX || ''),
        mdssupptype: _toText(attrs.MDSSUPPTYPE || ''),
        cmpsupgap:   _toText(attrs.CMPSUPGAP || ''),
        lstu:        _toText(attrs.LSTU || ''),
        posX, posY, posZ,
      });
    }
  }

  // Group by REF: same REF → one row; no-REF components → individual rows.
  // Non-unique column values within a group are concatenated with "|".
  // Two-level grouping:
  //   Level 1: Ref No   (same REF across branches → one group per position)
  //   Level 2: Position (Pos X / Pos Y / Pos Z)
  // Rule: same Ref No AND same coordinates → one row, non-unique columns concat'd with "|"
  //       same Ref No but different coordinates → separate rows
  //       no Ref No → each component is its own row
  // supportType is computed post-merge, so exclude it from field-merge pass.
  const _COMPUTED_COL_KEYS = new Set(['supportType']);
  const supportTypeRules = _parseSupportTypeRules(supportTypeRulesRaw || '');
  const MERGE_FIELDS = activeCols.map((c) => c.key).filter(
    (k) => k !== 'ref' && k !== 'posX' && k !== 'posY' && k !== 'posZ' && !_COMPUTED_COL_KEYS.has(k),
  );
  const groups = new Map();
  let noRefIdx = 0;
  for (const rec of allRecords) {
    const posKey = (rec.posX !== '' || rec.posY !== '' || rec.posZ !== '')
      ? `${rec.posX}\x02${rec.posY}\x02${rec.posZ}`
      : 'nopos';
    const key = rec.ref
      ? `${rec.ref}\x01${posKey}`
      : (posKey !== 'nopos' ? `\x00pos_${posKey}` : `\x00noref_${noRefIdx++}`);
    if (!groups.has(key)) groups.set(key, { firstRec: rec, recs: [] });
    groups.get(key).recs.push(rec);
  }

  const outputRows = [];
  for (const { firstRec, recs } of groups.values()) {
    const merged = {
      ref:  firstRec.ref,
      posX: firstRec.posX,
      posY: firstRec.posY,
      posZ: firstRec.posZ,
    };
    for (const f of MERGE_FIELDS) {
      const unique = [...new Set(recs.map((r) => r[f] ?? '').filter((v) => v !== ''))];
      merged[f] = unique.join('|');
    }
    merged.supportType = _computeSupportType(merged, supportTypeRules);
    outputRows.push({ _sort: firstRec, merged });
  }

  outputRows.sort((a, b) =>
    a._sort.site.localeCompare(b._sort.site)
    || a._sort.pipe.localeCompare(b._sort.pipe)
    || a._sort.branchSeg.localeCompare(b._sort.branchSeg)
  );

  const headerRow = activeCols.map((c) => c.label);
  const csvRows = [headerRow];
  for (const { merged: m } of outputRows) {
    csvRows.push(activeCols.map((c) => m[c.key] ?? ''));
  }

  const csvText = csvRows.map((r) => r.map(_stagedJsonCsvCell).join(',')).join('\n');
  return { csvText, rowCount: outputRows.length, branchCount: sortedBranches.length };
}

function _normalizePreviewPoint(value) {
  if (!value && value !== 0) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return _normalizePoint(value);
  if (typeof value !== 'string') return null;
  const src = value.trim();
  if (!src) return null;
  const tokens = src.split(/\s+/g);
  if (tokens.length < 2) return null;
  const point = { x: 0, y: 0, z: 0 };
  let parsedAny = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const num = Number.parseFloat(tokens[i + 1].replace(/mm/gi, ''));
    if (!Number.isFinite(num)) continue;
    if (axis === 'E') { point.x = num; parsedAny = true; }
    else if (axis === 'W') { point.x = -num; parsedAny = true; }
    else if (axis === 'N') { point.y = num; parsedAny = true; }
    else if (axis === 'S') { point.y = -num; parsedAny = true; }
    else if (axis === 'U') { point.z = num; parsedAny = true; }
    else if (axis === 'D') { point.z = -num; parsedAny = true; }
  }
  return parsedAny ? point : null;
}

function _buildPreviewProjectFromStagedHierarchy(payload) {
  if (!_looksLikeStagedHierarchy(payload)) return null;
  const segments = [];
  const nodes = [];
  const supports = [];
  const annotations = [];
  const nodeByKey = new Map();
  let segmentId = 1;
  let nodeId = 1;
  let supportId = 1;

  const asNode = (coord) => {
    const key = `${_formatDecimal(coord.x, 4)}|${_formatDecimal(coord.y, 4)}|${_formatDecimal(coord.z, 4)}`;
    if (nodeByKey.has(key)) return nodeByKey.get(key);
    const created = {
      id: `SJ-N${nodeId}`,
      position: { x: coord.x, y: coord.y, z: coord.z },
      normalized: { position: { x: coord.x, y: coord.y, z: coord.z } },
    };
    nodeId += 1;
    nodes.push(created);
    nodeByKey.set(key, created);
    return created;
  };

  for (const branch of payload) {
    if (!_looksLikeBranchNode(branch)) continue;
    const children = Array.isArray(branch.children) ? branch.children : [];
    for (const child of children) {
      const attrs = child?.attributes || {};
      const type = _toText(child?.type || attrs.TYPE).toUpperCase();
      const apos = _normalizePreviewPoint(attrs.APOS);
      const lpos = _normalizePreviewPoint(attrs.LPOS);
      const pos = _normalizePreviewPoint(attrs.POS);
      if (type === 'SUPPORT' || type === 'ATTA' || type === 'ANCI') {
        const anchor = pos || apos || lpos;
        if (!anchor) continue;
        supports.push({
          id: `SJ-S${supportId}`,
          normalized: {
            supportCoord: { x: anchor.x, y: anchor.y, z: anchor.z },
            supportKind: _supportKindForOutput(attrs),
          },
        });
        supportId += 1;
        continue;
      }
      if (!apos || !lpos) continue;
      const fromNode = asNode(apos);
      const toNode = asNode(lpos);
      segments.push({
        id: `SJ-E${segmentId}`,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        normalized: {
          ep1: { x: apos.x, y: apos.y, z: apos.z },
          ep2: { x: lpos.x, y: lpos.y, z: lpos.z },
        },
        attributes: { TYPE: type },
      });
      segmentId += 1;
    }
  }

  if (!segments.length && !supports.length) return null;
  return {
    id: 'stagedjson-preview',
    name: 'Staged JSON Preview',
    segments,
    nodes,
    supports,
    annotations,
  };
}

function _normalizeCoordsMode(value) {
  const mode = _toText(value).trim().toLowerCase();
  if (mode === 'all' || mode === 'none') return mode;
  return 'first';
}

function _3DModelConv_buildPreviewMetaText(project, outputName, adapterName) {
  const segmentCount = Array.isArray(project?.segments) ? project.segments.length : 0;
  const nodeCount = Array.isArray(project?.nodes) ? project.nodes.length : 0;
  const supportCount = Array.isArray(project?.supports) ? project.supports.length : 0;
  const annotationCount = Array.isArray(project?.annotations) ? project.annotations.length : 0;
  const displayedPointCount = Number(project?.displayedPointCount || project?.points?.length || 0);
  const sourcePointCount = Number(project?.sourcePointCount || displayedPointCount);
  const pointSummary = sourcePointCount === displayedPointCount
    ? `${displayedPointCount}`
    : `${displayedPointCount} of ${sourcePointCount}`;
  return `Preview source: ${outputName} | adapter: ${adapterName} | points: ${pointSummary} | segments: ${segmentCount} | nodes: ${nodeCount} | supports: ${supportCount} | annotations: ${annotationCount}`;
}

async function _3DModelConv_tryBuildProjectFromOutput(output) {
  const name = _toText(output?.name).trim();
  const text = _toText(output?.text);
  if (!name || !text) {
    return { ok: false, reason: 'Output has no text payload for preview.' };
  }

  const lowerName = name.toLowerCase();
  if (lowerName.endsWith('.xml')) {
    try {
      const inputXmlCiiProject = buildInputXmlCiiGeometryPreviewProject(text, name);
      if (inputXmlCiiProject && Array.isArray(inputXmlCiiProject.segments) && inputXmlCiiProject.segments.length > 0) {
        return {
          ok: true,
          project: inputXmlCiiProject,
          adapterName: 'InputXmlCiiGeometryPreview',
          outputName: name,
        };
      }
    } catch {
      // Continue to adapter-based fallback.
    }
  }

  if (lowerName.endsWith('.stp') || lowerName.endsWith('.step')) {
    try {
      const { members } = parseStpSupportMembers(text);
      if (members.length > 0) {
        return {
          ok: true,
          stpMembers: members,
          adapterName: 'StpSupportParser',
          outputName: name,
        };
      }
    } catch (error) {
      return { ok: false, reason: _toText(error?.message || error) };
    }
  }

  if (lowerName.endsWith('.json')) {
    try {
      const parsed = JSON.parse(text);
      const fbxProject = buildFbxSourceGraphPreviewProject(
        parsed,
        name,
        FBX_SOURCE_GRAPH_PREVIEW_POINT_LIMIT,
      );
      if (fbxProject) {
        return {
          ok: true,
          project: fbxProject,
          adapterName: 'FbxSourceGraphPointPreview',
          outputName: name,
        };
      }
      const stagedProject = _buildPreviewProjectFromStagedHierarchy(parsed);
      if (stagedProject) {
        return {
          ok: true,
          project: stagedProject,
          adapterName: 'StagedHierarchyPreview',
          outputName: name,
        };
      }
    } catch {
      // Continue to adapter-based fallback.
    }
  }

  try {
    const match = pickImportAdapter({ name, text, payload: null });
    const adapter = new match.Adapter();
    const imported = await adapter.import({
      id: `3dmodelconv-preview-${Date.now()}`,
      name,
      text,
      payload: null,
    });
    const project = imported?.project || null;
    if (!project) {
      return { ok: false, reason: `Adapter ${adapter.constructor.name} returned no project.` };
    }
    const hasGeometry = Array.isArray(project?.segments) && project.segments.length > 0;
    if (!hasGeometry) {
      return { ok: false, reason: `Adapter ${adapter.constructor.name} produced no segments.` };
    }
    return {
      ok: true,
      project,
      adapterName: adapter.constructor.name,
      outputName: name,
    };
  } catch (error) {
    return { ok: false, reason: _toText(error?.message || error) };
  }
}

async function _3DModelConv_buildPreviewFromOutputs(outputs) {
  const normalized = Array.isArray(outputs) ? outputs.filter((entry) => entry && entry.name) : [];
  if (!normalized.length) {
    return { ok: false, reason: 'No outputs available to preview.' };
  }

  const prioritized = [...normalized].sort((a, b) => {
    const nameA = _toText(a?.name).toLowerCase();
    const nameB = _toText(b?.name).toLowerCase();
    const score = (name) => {
      if (name.endsWith('.xml') && name.includes('inputxml_cii_geometry_preview')) return -1;
      if (name.endsWith('.json') && name.includes('managed_stage')) return 0;
      if (name.endsWith('.json')) return 1;
      if (name.endsWith('.rev')) return 2;
      if (name.endsWith('.stp') || name.endsWith('.step')) return 3;
      if (name.endsWith('.xml')) return 4;
      return 5;
    };
    return score(nameA) - score(nameB);
  });

  let lastReason = 'No previewable output found.';
  for (const output of prioritized) {
    const result = await _3DModelConv_tryBuildProjectFromOutput(output);
    if (result.ok) return result;
    lastReason = result.reason || lastReason;
  }
  return { ok: false, reason: lastReason };
}

function _mergeStageLogs(stages) {
  const stdout = [];
  const stderr = [];
  for (const stage of stages) {
    const title = _toText(stage?.title || '').trim();
    if (title) {
      stdout.push(`[${title}]`);
      stderr.push(`[${title}]`);
    }
    const stageStdout = Array.isArray(stage?.logs?.stdout) ? stage.logs.stdout : [];
    const stageStderr = Array.isArray(stage?.logs?.stderr) ? stage.logs.stderr : [];
    stdout.push(...stageStdout.map((line) => _toText(line)));
    stderr.push(...stageStderr.map((line) => _toText(line)));
  }
  return { stdout, stderr };
}

function _extractSidecarError(payload, response) {
  const detail = _toText(payload?.error || `${response.status} ${response.statusText}`);
  const stderrLines = Array.isArray(payload?.logs?.stderr) ? payload.logs.stderr : [];
  const stderrText = stderrLines.map((line) => _toText(line)).join('\n');
  const combined = `${detail}\n${stderrText}`;
  return combined;
}

function _isRecoverableSidecarParseError(errorText) {
  const text = _toText(errorText).toLowerCase();
  if (!text) return false;
  return text.includes('more end-tags and than new-tags') || text.includes('failed to parse');
}

async function _tryNativeRvmTextMode(primaryFile, primaryBytes, secondaryFile, secondaryBytes, mode, expectedSuffix) {
  const sourceName = _toText(primaryFile?.name).toLowerCase();
  if (!sourceName.endsWith('.rvm')) {
    throw new Error(`Unsupported input "${primaryFile?.name || ''}". Native RVM bridge accepts only .rvm files.`);
  }
  const requestBody = {
    inputName: primaryFile.name,
    inputBase64: _arrayBufferToBase64(primaryBytes),
    mode: mode,
  };
  if (secondaryFile && secondaryBytes) {
    requestBody.attributesName = secondaryFile.name;
    requestBody.attributesBase64 = _arrayBufferToBase64(secondaryBytes);
  }

  let lastDetailedError = '';
  for (const endpoint of NATIVE_RVM_ENDPOINT_CANDIDATES) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch {
      continue;
    }

    if (response.status === 404 || response.status === 405) {
      continue;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail = _extractSidecarError(payload, response);
      lastDetailedError = `Native RVM bridge failed (${endpoint}): ${detail}`;
      if (secondaryFile && secondaryBytes && _isRecoverableSidecarParseError(detail)) {
        const retryBody = {
          inputName: primaryFile.name,
          inputBase64: _arrayBufferToBase64(primaryBytes),
          mode: mode,
        };
        try {
          const retryResponse = await fetch(endpoint, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(retryBody),
          });
          let retryPayload = null;
          try {
            retryPayload = await retryResponse.json();
          } catch {
            retryPayload = null;
          }
          if (retryResponse.ok && retryPayload?.ok && typeof retryPayload.outputText === 'string') {
            const retryStdout = Array.isArray(retryPayload.logs?.stdout) ? retryPayload.logs.stdout : [];
            const retryStderr = Array.isArray(retryPayload.logs?.stderr) ? retryPayload.logs.stderr : [];
            retryStderr.unshift('Recovered from sidecar parse failure by retrying without sidecar file.');
            return {
              outputs: [{
                name: _toText(retryPayload.outputName || `${primaryFile.name.replace(/\.[^.]+$/, '')}${expectedSuffix}`),
                text: retryPayload.outputText,
                mime: mode === 'rvm_to_json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
              }],
              logs: {
                stdout: retryStdout,
                stderr: retryStderr,
                argv: Array.isArray(retryPayload.logs?.argv) ? retryPayload.logs.argv : [],
              },
              nativeBridge: true,
              endpoint: endpoint,
            };
          }
        } catch {
          // Continue normal endpoint probing.
        }
      }
      continue;
    }

    if (!payload?.ok || typeof payload.outputText !== 'string') {
      lastDetailedError = `Native RVM bridge returned invalid payload (${endpoint}).`;
      continue;
    }

    return {
      outputs: [{
        name: _toText(payload.outputName || `${primaryFile.name.replace(/\.[^.]+$/, '')}${expectedSuffix}`),
        text: payload.outputText,
        mime: mode === 'rvm_to_json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
      }],
      logs: {
        stdout: Array.isArray(payload.logs?.stdout) ? payload.logs.stdout : [],
        stderr: Array.isArray(payload.logs?.stderr) ? payload.logs.stderr : [],
        argv: Array.isArray(payload.logs?.argv) ? payload.logs.argv : [],
      },
      nativeBridge: true,
      endpoint: endpoint,
    };
  }

  if (lastDetailedError) {
    throw new Error(lastDetailedError);
  }
  return null;
}

async function _tryNativeRvmToRev(primaryFile, primaryBytes, secondaryFile, secondaryBytes) {
  return _tryNativeRvmTextMode(
    primaryFile,
    primaryBytes,
    secondaryFile,
    secondaryBytes,
    'rvm_to_rev',
    '_rvm_to_rev.rev',
  );
}

async function _tryNativeRvmToJson(primaryFile, primaryBytes, secondaryFile, secondaryBytes) {
  return _tryNativeRvmTextMode(
    primaryFile,
    primaryBytes,
    secondaryFile,
    secondaryBytes,
    'rvm_to_json',
    '_rvm_to_json.json',
  );
}

async function _runManagedRvmAttributeToXml(
  primaryFile,
  primaryBytes,
  secondaryFile,
  secondaryBytes,
  options,
  ensureRuntime,
) {
  const stem = _baseNameWithoutExtension(primaryFile.name);
  const stages = [];
  const scope = _normalizeRvmScope(options?.rvmScope);

  if (scope.enabled && secondaryFile && secondaryBytes) {
    return _buildRvmAttrResponseFromAttText(_decodeTextUtf8(secondaryBytes), secondaryFile.name || primaryFile.name, options);
  }

  const runtime = await ensureRuntime();

  if (options?.preferJsonToXml !== false) {
    try {
      const nativeJson = await _tryNativeRvmToJson(primaryFile, primaryBytes, secondaryFile, secondaryBytes);
      if (nativeJson) {
        const jsonOutput = nativeJson.outputs?.[0];
        if (jsonOutput && typeof jsonOutput.text === 'string') {
          let usedJsonPath = false;
          try {
            const stagedResult = _buildXmlFromStagedJsonText(jsonOutput.text, jsonOutput.name, options);
            stages.push({ title: `Native JSON bridge ${nativeJson.endpoint || ''}`.trim(), logs: nativeJson.logs });
            stages.push({
              title: 'StagedJSON -> XML',
              logs: {
                stdout: [
                  _rvmScopeLogLine(stagedResult.scopeStats),
                  `Staged hierarchy detected: ${stagedResult.branchCount} branch(es), ${stagedResult.nodeCount} node(s).`,
                  `Support mapper conversion pass: scanned=${stagedResult.supportMapperStats?.scanned || 0}, mapped=${stagedResult.supportMapperStats?.mapped || 0}.`,
                ].filter(Boolean),
                stderr: stagedResult.skippedComponents > 0
                  ? [`Skipped ${stagedResult.skippedComponents} component(s) with incomplete coordinates.`]
                  : [],
              },
            });
            const pathAOutputs = [
              {
                name: `${stem}_rvmattr_to_xml.xml`,
                text: stagedResult.xmlText,
                mime: 'text/xml;charset=utf-8',
              },
              {
                name: `${stem}_managed_stage.json`,
                text: stagedResult.stageJsonText,
                mime: 'application/json;charset=utf-8',
              },
            ];
            try {
              let stpText = null;
              if (secondaryFile && secondaryBytes) {
                const attText = _decodeTextUtf8(secondaryBytes);
                const structMembers = _filterStpMembersByScope(parseRmssStructuralMembers(attText), stagedResult.rvmScope || stagedResult.scopePattern);
                if (structMembers.length > 0) {
                  stpText = _buildStpTextFromMembers(structMembers, `${stem}_supports.stp`);
                }
              }
              if (!stpText) {
                const hier = JSON.parse(stagedResult.stageJsonText);
                stpText = _buildStpTextFromRmssHierarchy(hier, `${stem}_supports.stp`);
              }
              if (stpText) pathAOutputs.push({ name: `${stem}_supports.stp`, text: stpText, mime: 'text/plain;charset=utf-8' });
            } catch {}
            return {
              outputs: pathAOutputs,
              logs: _mergeStageLogs(stages),
              endpoint: nativeJson.endpoint,
            };
          } catch {}

          try {
            const parsedPayload = JSON.parse(jsonOutput.text);
            const bboxLeafCount = _collectBboxLeafCount(parsedPayload);
            if (bboxLeafCount > 0) {
              const jsonToXmlResponse = await runtime.runJob({
                converterId: 'json_to_xml',
                inputFiles: [{ role: 'primary', name: jsonOutput.name, bytes: _encodeTextUtf8(jsonOutput.text) }],
                options: {
                  coordFactor: options?.coordFactor,
                  nodeStart: options?.nodeStart,
                  nodeStep: options?.nodeStep,
                  defaultDiameter: options?.defaultDiameter,
                  defaultWallThickness: options?.defaultWallThickness,
                  defaultCorrosionAllowance: options?.defaultCorrosionAllowance,
                  defaultInsulationThickness: options?.defaultInsulationThickness,
                },
              });
              const jsonXmlOutput = jsonToXmlResponse.outputs?.[0];
              if (jsonXmlOutput && typeof jsonXmlOutput.text === 'string') {
                usedJsonPath = true;
                stages.push({ title: `Native JSON bridge ${nativeJson.endpoint || ''}`.trim(), logs: nativeJson.logs });
                stages.push({ title: 'JSON -> XML', logs: jsonToXmlResponse.logs });
                return {
                  outputs: [
                    {
                      name: `${stem}_rvmattr_to_xml.xml`,
                      text: jsonXmlOutput.text,
                      mime: 'text/xml;charset=utf-8',
                    },
                    {
                      name: `${stem}_managed_stage.json`,
                      text: jsonOutput.text,
                      mime: 'application/json;charset=utf-8',
                    },
                  ],
                  logs: _mergeStageLogs(stages),
                  endpoint: nativeJson.endpoint,
                };
              }
            }
          } catch {}

          if (!usedJsonPath) {
            stages.push({
              title: 'JSON -> XML fallback note',
              logs: {
                stdout: [],
                stderr: ['Native JSON payload did not match staged hierarchy or bbox-leaf JSON; falling back to REV -> XML.'],
              },
            });
          }
        }
      }
    } catch (error) {
      stages.push({ title: 'JSON -> XML fallback note', logs: { stdout: [], stderr: [_toText(error?.message || error)] } });
    }
  }

  if (scope.enabled) {
    throw new Error('Scoped ATT/RVM conversion requires an ATT/TXT sidecar or a staged JSON bridge response; aborting instead of producing an unfiltered REV fallback.');
  }

  const nativeRev = await _tryNativeRvmToRev(primaryFile, primaryBytes, secondaryFile, secondaryBytes);
  if (!nativeRev) {
    throw new Error(
      'Native RVM bridge is not reachable. Start local server (node test_server.js) so /api/native/rvm-to-rev can run rvmparser-windows-bin.exe.',
    );
  }
  const revOutput = nativeRev.outputs?.[0];
  if (!revOutput || typeof revOutput.text !== 'string') {
    throw new Error('Native bridge did not return REV text output.');
  }
  const revToXmlResponse = await runtime.runJob({
    converterId: 'rev_to_xml',
    inputFiles: [{ role: 'primary', name: revOutput.name, bytes: _encodeTextUtf8(revOutput.text) }],
    options: {
      coordFactor: options?.coordFactor,
      nodeStart: options?.nodeStart,
      nodeStep: options?.nodeStep,
      nodeMergeTolerance: options?.nodeMergeTolerance,
      source: options?.source,
      purpose: options?.purpose,
      titleLine: options?.titleLine,
      enablePsiRigidLogic: !!options?.enablePsiRigidLogic,
    },
  });
  const xmlOutput = revToXmlResponse.outputs?.[0];
  if (!xmlOutput || typeof xmlOutput.text !== 'string') {
    throw new Error('REV -> XML stage did not return XML text output.');
  }
  stages.push({ title: `Native REV bridge ${nativeRev.endpoint || ''}`.trim(), logs: nativeRev.logs });
  stages.push({ title: 'REV -> XML', logs: revToXmlResponse.logs });

  const finalOutputs = [
    {
      name: `${stem}_rvmattr_to_xml.xml`,
      text: xmlOutput.text,
      mime: 'text/xml;charset=utf-8',
    },
    {
      name: `${stem}_managed_stage.rev`,
      text: revOutput.text,
      mime: 'text/plain;charset=utf-8',
    },
  ];

  try {
    const revToStpResponse = await runtime.runJob({
      converterId: 'rev_to_stp',
      inputFiles: [{ role: 'primary', name: revOutput.name, bytes: _encodeTextUtf8(revOutput.text) }],
      options: {
        coordFactor: _toFiniteNumber(options?.coordFactor, 1000),
        supportPathContains: _toText(options?.supportPathContains) || 'RRIMS-PIPESUPP',
        includeGenericSupportGroups: !!options?.includeGenericSupportGroups,
        schemaName: _toText(options?.schemaName) || 'CIS2',
      },
    });
    const stpOutput = revToStpResponse.outputs?.[0];
    if (stpOutput && typeof stpOutput.text === 'string' && stpOutput.text.trim()) {
      finalOutputs.push({
        name: `${stem}_supports.stp`,
        text: stpOutput.text,
        mime: 'text/plain;charset=utf-8',
      });
      stages.push({ title: 'REV -> STP', logs: revToStpResponse.logs });
    }
  } catch {
    // STP generation is best-effort; main outputs still delivered.
  }

  return {
    outputs: finalOutputs,
    logs: _mergeStageLogs(stages),
    endpoint: nativeRev.endpoint,
  };
}

export function renderModelConvertersTab(container) {
  const { selectedConverter: initialConverter, defaultsByConverter } = _loadStoredState();
  const enabledConverterDefs = ORDERED_CONVERTER_DEFS.filter((def) => def.disabled !== true);
  const enabledConverterIds = new Set(enabledConverterDefs.map((def) => def.id));
  let selectedConverter = enabledConverterIds.has(initialConverter)
    ? initialConverter
    : (enabledConverterDefs[0]?.id || ORDERED_CONVERTER_DEFS[0]?.id || 'rvm_to_rev');
  let primaryFile = null;
  let secondaryFile = null;
  let runtime = null;
  let disposed = false;

  container.innerHTML = `
    <div class="model-converters-root">
      <aside class="model-converters-left">
        <h2>3D Model Converters</h2>
        <p class="model-converters-subtitle">GitHub Pages-safe in-browser conversion runtime (Pyodide worker).</p>

        <label class="model-converters-label">
          <span>Converter</span>
          <select id="model-converters-select">
            ${ORDERED_CONVERTER_DEFS.map((def) => `
              <option value="${def.id}" ${def.id === selectedConverter ? 'selected' : ''} ${def.disabled ? 'disabled' : ''}>${_esc(def.label)}</option>
            `).join('')}
          </select>
        </label>

        <label class="model-converters-file">
          <span id="model-converters-primary-label"></span>
          <button type="button" id="model-converters-master-sample-btn" class="model-converters-info-btn" title="Download Master InputXML template (with work instructions)" style="display:none;margin-left:6px;cursor:pointer;">&#9432;</button>
          <input type="file" id="model-converters-primary-input">
          <small id="model-converters-primary-name">No file selected.</small>
        </label>

        <label class="model-converters-file" id="model-converters-secondary-wrap" style="display:none">
          <span id="model-converters-secondary-label"></span>
          <input type="file" id="model-converters-secondary-input">
          <small id="model-converters-secondary-name">No file selected.</small>
        </label>

        <details class="model-converters-advanced">
          <summary>Advanced options</summary>
          <div id="model-converters-advanced-fields" class="model-converters-advanced-fields"></div>
        </details>

        <div id="model-converters-xml-cii-workflow" class="model-converters-workflow" hidden>
          <button type="button" id="model-converters-xml-cii-rich-btn" class="model-converters-run-btn" style="width:100%;padding:10px;margin-bottom:4px;">
            XML-&gt;CII Rich Workflow
          </button>
          <div id="model-converters-xml-cii-workflow-detail" class="model-converters-workflow-detail"></div>
        </div>

        <details id="model-converters-support-mapper" class="model-converters-advanced">
          <summary>Support type mapper</summary>
          <div id="model-converters-support-mapper-panel" class="model-converters-advanced-fields"></div>
        </details>

        <button id="model-converters-run" class="model-converters-run-btn">Run Conversion</button>
      </aside>

      <section class="model-converters-right">
        <div class="model-converters-card">
          <div class="model-converters-card-title">Status</div>
          <div id="model-converters-status" class="model-converters-status">Idle</div>
        </div>
        <div class="model-converters-card">
          <div class="model-converters-card-title">Output</div>
          <div id="model-converters-output"></div>
        </div>
        <div class="model-converters-card model-converters-preview-card">
          <div class="model-converters-card-title">3DModelConv Geometry Preview</div>
          <div id="model-converters-preview-host" class="model-converters-preview-host"></div>
          <div id="model-converters-preview-meta" class="model-converters-preview-meta">Preview not available yet.</div>
        </div>
        <div id="model-converters-vsplit" class="model-converters-vsplit" role="separator" aria-orientation="horizontal" title="Drag to resize the preview / logs panels"></div>
        <div class="model-converters-card">
          <div class="model-converters-card-title">Logs</div>
          <pre id="model-converters-logs" class="model-converters-logs">(no logs)</pre>
          <div id="model-converters-diagnostics-table" class="model-converters-logs" style="display:none;max-height:280px;overflow:auto;margin-top:8px;white-space:normal;"></div>
          <div id="model-converters-cii-warnings" style="display:none;margin-top:8px;border:1px solid #31455f;border-radius:6px;overflow:hidden;">
            <button type="button" id="model-converters-cii-warnings-toggle" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#182334;color:#9cc5ff;border:none;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer;">
              <span id="model-converters-cii-warnings-title">InputXML→CII(2019) Diagnostics</span>
              <span id="model-converters-cii-warnings-caret">&#9656;</span>
            </button>
            <div id="model-converters-cii-warnings-body" style="display:none;max-height:280px;overflow:auto;padding:8px;background:#101a29;"></div>
          </div>
        </div>
      </section>
    </div>
  `;

  const selectEl = container.querySelector('#model-converters-select');
  const primaryLabelEl = container.querySelector('#model-converters-primary-label');
  const masterSampleBtnEl = container.querySelector('#model-converters-master-sample-btn');
  const primaryInputEl = container.querySelector('#model-converters-primary-input');
  const primaryNameEl = container.querySelector('#model-converters-primary-name');
  const secondaryWrapEl = container.querySelector('#model-converters-secondary-wrap');
  const secondaryLabelEl = container.querySelector('#model-converters-secondary-label');
  const secondaryInputEl = container.querySelector('#model-converters-secondary-input');
  const secondaryNameEl = container.querySelector('#model-converters-secondary-name');
  const advancedFieldsEl = container.querySelector('#model-converters-advanced-fields');
  const xmlCiiWorkflowEl = container.querySelector('#model-converters-xml-cii-workflow');
  const xmlCiiWorkflowDetailEl = container.querySelector('#model-converters-xml-cii-workflow-detail');
  let xmlCiiWorkflowPopupEl = null;
  let xmlCiiWorkflowPopupDetailEl = null;
  let xmlCiiMasterStorageWarningShown = false;
  // Tracks which loaded XML file the regex sampleBranchName was auto-derived from.
  // A newly chosen file refreshes the branch once; manual edits afterward stick
  // because the file key still matches and we skip re-deriving.
  let xmlCiiAutoBranchFileKey = '';
  const supportMapperWrapEl = container.querySelector('#model-converters-support-mapper');
  const supportMapperPanelEl = container.querySelector('#model-converters-support-mapper-panel');
  const runBtnEl = container.querySelector('#model-converters-run');
  const statusEl = container.querySelector('#model-converters-status');
  const outputEl = container.querySelector('#model-converters-output');
  const logsEl = container.querySelector('#model-converters-logs');
  const diagnosticsTableEl = container.querySelector('#model-converters-diagnostics-table');
  const ciiWarningsWrapEl = container.querySelector('#model-converters-cii-warnings');
  const ciiWarningsToggleEl = container.querySelector('#model-converters-cii-warnings-toggle');
  const ciiWarningsTitleEl = container.querySelector('#model-converters-cii-warnings-title');
  const ciiWarningsCaretEl = container.querySelector('#model-converters-cii-warnings-caret');
  const ciiWarningsBodyEl = container.querySelector('#model-converters-cii-warnings-body');
  const previewHostEl = container.querySelector('#model-converters-preview-host');
  const previewMetaEl = container.querySelector('#model-converters-preview-meta');

  let previewRenderer = null;
  const xmlCiiMasterLocalState = new Map();

  if (previewHostEl) {
    try {
      previewRenderer = new ModelConverters_3DModelConv_PreviewRenderer(previewHostEl);
    } catch (error) {
      previewMetaEl.textContent = `Preview renderer init failed: ${_toText(error?.message || error)}`;
    }
  }

  // Draggable divider between the Geometry Preview and Logs panels.
  (function setupPreviewLogsDivider() {
    const splitterEl = container.querySelector('#model-converters-vsplit');
    const rightEl = container.querySelector('.model-converters-right');
    const previewCardEl = container.querySelector('.model-converters-preview-card');
    if (!splitterEl || !rightEl) return;
    const PREVIEW_H_KEY = 'model-converters.preview-h.v1';
    const MIN_H = 140;
    const clampHeight = (px) => {
      const maxH = Math.max(MIN_H, rightEl.clientHeight - 200);
      return Math.min(Math.max(px, MIN_H), maxH);
    };
    try {
      const saved = parseInt(window.localStorage.getItem(PREVIEW_H_KEY) || '', 10);
      if (Number.isFinite(saved) && saved >= MIN_H) rightEl.style.setProperty('--mc-preview-h', `${saved}px`);
    } catch {}
    let dragging = false;
    const onMove = (event) => {
      if (!dragging) return;
      const clientY = event.touches ? event.touches[0].clientY : event.clientY;
      const top = (previewCardEl || rightEl).getBoundingClientRect().top;
      rightEl.style.setProperty('--mc-preview-h', `${Math.round(clampHeight(clientY - top))}px`);
      if (event.cancelable) event.preventDefault();
    };
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      splitterEl.classList.remove('is-dragging');
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', stop);
      try {
        const current = parseInt(rightEl.style.getPropertyValue('--mc-preview-h'), 10);
        if (Number.isFinite(current)) window.localStorage.setItem(PREVIEW_H_KEY, String(current));
      } catch {}
      try { window.dispatchEvent(new Event('resize')); } catch {}
    };
    const start = (event) => {
      dragging = true;
      splitterEl.classList.add('is-dragging');
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', stop);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', stop);
      if (event.cancelable) event.preventDefault();
    };
    splitterEl.addEventListener('mousedown', start);
    splitterEl.addEventListener('touchstart', start, { passive: false });
  })();

  function activeDef() {
    return _legacyConverterDef(selectedConverter);
  }

  function activeValues() {
    if (!defaultsByConverter[selectedConverter]) {
      defaultsByConverter[selectedConverter] = _clone(activeDef().defaults);
    }
    return defaultsByConverter[selectedConverter];
  }

  function persist() {
    return _saveStoredState(selectedConverter, defaultsByConverter);
  }

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.className = `model-converters-status ${tone || ''}`.trim();
  }

  function setLogs(lines) {
    const normalized = Array.isArray(lines) ? lines : [];
    logsEl.textContent = normalized.length ? normalized.join('\n') : '(no logs)';
  }


  // Cache of last run's raw diagnostic rows — read by the 6 Diagnostics workflow phase
  let _xmlCiiLastDiagnosticRows = [];
  let _xmlCiiLastDiagnosticStatus = '';
  let _xmlCiiLastDiagnosticError = '';
  // Cache of the last computed rigid weight-match review rows (4A Weight Match).
  let xmlCiiWeightMatchIssues = [];

  function setDiagnosticRows(rows) {
    const normalized = Array.isArray(rows) ? rows : [];
    _xmlCiiLastDiagnosticRows = normalized; // store for Diagnostics phase
    if (!diagnosticsTableEl) return;
    if (!normalized.length) {

      diagnosticsTableEl.style.display = 'none';
      diagnosticsTableEl.innerHTML = '';
      return;
    }
    diagnosticsTableEl.style.display = 'block';
    const columns = ['type', 'nodeNumber', 'branchName', 'derivedClass', 'pipingClass', 'rating', 'boreMm', 'lengthMm', 'weight', 'classMethod', 'classConfidence', 'wallThickness', 'corrosion', 'materialName', 'materialCode', 'materialMethod', 'needsReview', 'method', 'kind', 'message'];
    diagnosticsTableEl.innerHTML = `
      <div style="font-weight:700;color:#9cc5ff;margin-bottom:6px;">Enrichment diagnostics</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr>${columns.map((col) => `<th style="text-align:left;padding:4px;border-bottom:1px solid #31455f;color:#9cc5ff;">${_esc(col)}</th>`).join('')}</tr></thead>
        <tbody>${normalized.slice(0, 240).map((row) => `<tr>${columns.map((col) => `<td style="padding:4px;border-bottom:1px solid #26364a;color:#d7e6ff;vertical-align:top;">${_esc(row?.[col] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      ${normalized.length > 240 ? `<div style="color:#9aa8ba;padding-top:4px;">Showing first 240 of ${normalized.length} diagnostic rows. Download diagnostics JSON for full details.</div>` : ''}
    `;
  }

  // InputXML->CII(2019)'s _warn()-based diagnostics (severity/code/message
  // plus free-form context fields, e.g. AUX_POINTER_MISSING_FROM_TEMPLATE) -
  // a different shape than the enrichment diagnostics table above, so this
  // gets its own collapsible panel rather than overloading that table's
  // fixed column set. Collapsed by default; expands on click, and
  // auto-opens the first time a run actually produces warnings.
  let _ciiWarningsUserToggled = false;
  function _setCiiWarningsExpanded(expanded) {
    if (!ciiWarningsBodyEl || !ciiWarningsCaretEl) return;
    ciiWarningsBodyEl.style.display = expanded ? 'block' : 'none';
    ciiWarningsCaretEl.innerHTML = expanded ? '&#9662;' : '&#9656;';
  }
  ciiWarningsToggleEl?.addEventListener('click', () => {
    _ciiWarningsUserToggled = true;
    const expanded = ciiWarningsBodyEl?.style.display === 'block';
    _setCiiWarningsExpanded(!expanded);
  });
  function setCiiWarningRows(rows) {
    const normalized = Array.isArray(rows) ? rows : [];
    if (!ciiWarningsWrapEl || !ciiWarningsBodyEl || !ciiWarningsTitleEl) return;
    if (!normalized.length) {
      ciiWarningsWrapEl.style.display = 'none';
      ciiWarningsBodyEl.innerHTML = '';
      return;
    }
    ciiWarningsWrapEl.style.display = 'block';
    ciiWarningsTitleEl.textContent = `InputXML→CII(2019) Diagnostics (${normalized.length})`;
    const knownColumns = ['severity', 'code', 'message'];
    const extraColumns = [...new Set(
      normalized.flatMap((row) => Object.keys(row || {}).filter((key) => !knownColumns.includes(key))),
    )];
    const columns = [...knownColumns, ...extraColumns];
    ciiWarningsBodyEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr>${columns.map((col) => `<th style="text-align:left;padding:4px;border-bottom:1px solid #31455f;color:#9cc5ff;">${_esc(col)}</th>`).join('')}</tr></thead>
        <tbody>${normalized.map((row) => `<tr>${columns.map((col) => `<td style="padding:4px;border-bottom:1px solid #26364a;color:${col === 'severity' && row?.severity === 'warning' ? '#e0b34d' : '#d7e6ff'};vertical-align:top;">${_esc(row?.[col] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    `;
    if (!_ciiWarningsUserToggled) _setCiiWarningsExpanded(true);
  }

  function _3DModelConv_setPreviewMeta(text) {
    previewMetaEl.textContent = _toText(text);
  }

  function _3DModelConv_resetPreview(text) {
    if (previewRenderer) {
      try { previewRenderer._3DModelConv_renderProject(null); } catch {}
    }
    _3DModelConv_setPreviewMeta(text);
  }

  async function _3DModelConv_renderPreviewFromOutputs(outputs) {
    if (!previewRenderer) {
      _3DModelConv_setPreviewMeta('Preview renderer is not initialized.');
      return;
    }
    _3DModelConv_setPreviewMeta('Building 3D topo preview...');
    const previewResult = await _3DModelConv_buildPreviewFromOutputs(outputs);
    if (!previewResult.ok) {
      previewRenderer._3DModelConv_renderProject(null);
      _3DModelConv_setPreviewMeta(`Preview unavailable: ${previewResult.reason}`);
      return;
    }
    if (previewResult.stpMembers) {
      previewRenderer._3DModelConv_renderStpMembers(previewResult.stpMembers);
      _3DModelConv_setPreviewMeta(
        `Preview source: ${previewResult.outputName} | adapter: ${previewResult.adapterName} | members: ${previewResult.stpMembers.length}`,
      );
      return;
    }
    previewRenderer._3DModelConv_renderProject(previewResult.project);
    // Overlay STP members on top of the project if an STP output is present.
    const stpOutput = (Array.isArray(outputs) ? outputs : []).find((o) => {
      const n = _toText(o?.name).toLowerCase();
      return n.endsWith('.stp') || n.endsWith('.step');
    });
    if (stpOutput) {
      try {
        const { members } = parseStpSupportMembers(_toText(stpOutput.text));
        if (members.length > 0) previewRenderer._3DModelConv_overlayStp(members);
      } catch {}
    }
    _3DModelConv_setPreviewMeta(
      _3DModelConv_buildPreviewMetaText(
        previewResult.project,
        previewResult.outputName,
        previewResult.adapterName,
      ),
    );
  }

  function renderOutputs(outputs) {
    const normalized = Array.isArray(outputs) ? outputs.filter((entry) => entry && entry.name) : [];
    if (!normalized.length) {
      outputEl.innerHTML = '<span class="model-converters-muted">No output generated.</span>';
      return;
    }
    outputEl.innerHTML = normalized.map((output, index) => `
      <div class="model-converters-output-row">
        <strong>${_esc(output.name)}</strong>
        <button type="button" class="model-converters-download-btn" data-output-index="${index}">Download</button>
        ${/\.glb$/i.test(_toText(output.name))
          ? `<button type="button" class="model-converters-download-btn" data-output-open-basic="${index}">Open in Basic GLB-PCF</button>`
          : ''}
      </div>
    `).join('');
    for (const button of outputEl.querySelectorAll('[data-output-index]')) {
      const outputIndex = Number(button.getAttribute('data-output-index'));
      const output = normalized[outputIndex];
      if (!output) continue;
      button.addEventListener('click', () => _downloadOutput(output));
    }
    for (const button of outputEl.querySelectorAll('[data-output-open-basic]')) {
      const outputIndex = Number(button.getAttribute('data-output-open-basic'));
      const output = normalized[outputIndex];
      if (!output) continue;
      button.addEventListener('click', () => {
        try {
          _openOutputInBasicViewer(output);
          notify({ level: 'info', title: 'Basic GLB-PCF', message: `Opening ${output.name} in Basic GLB-PCF Viewer.` });
        } catch (error) {
          notify({ level: 'error', title: 'Basic GLB-PCF', message: _toText(error?.message || error) });
        }
      });
    }
  }

  function renderAdvanced() {
    const def = activeDef();
    const values = activeValues();
    advancedFieldsEl.innerHTML = _buildAdvancedFieldsHtml(def, values);
    for (const field of def.fields) {
      if (field.type === 'column-picker') {
        const pickerEl = advancedFieldsEl.querySelector(`.csv-column-picker[data-option-key="${field.key}"]`);
        if (!pickerEl) continue;
        const saveColConfig = () => {
          const rows = [...pickerEl.querySelectorAll('[data-col-key]')];
          const config = rows.map((row) => ({
            key: row.dataset.colKey,
            visible: row.querySelector('.csv-col-visible')?.checked !== false,
          }));
          values[field.key] = JSON.stringify(config);
          persist();
        };
        pickerEl.addEventListener('change', saveColConfig);
        pickerEl.addEventListener('click', (e) => {
          const btn = e.target.closest('.csv-col-up, .csv-col-down');
          if (!btn) return;
          const row = btn.closest('[data-col-key]');
          if (!row) return;
          if (btn.classList.contains('csv-col-up') && row.previousElementSibling) {
            pickerEl.insertBefore(row, row.previousElementSibling);
          } else if (btn.classList.contains('csv-col-down') && row.nextElementSibling) {
            pickerEl.insertBefore(row.nextElementSibling, row);
          }
          saveColConfig();
        });
        continue;
      }
      if (field.type === 'support-type-rules') {
        const rulesEl = advancedFieldsEl.querySelector(`.csv-support-rules[data-option-key="${field.key}"]`);
        const addBtn  = advancedFieldsEl.querySelector(`.csv-rule-add[data-rules-key="${field.key}"]`);
        if (!rulesEl) continue;
        const rowStyle = 'display:grid;grid-template-columns:140px 1fr 1fr 1fr 26px;gap:4px;padding:2px 0;align-items:center;';
        const inputStyle = 'font-size:11px;background:#2a2d38;border:1px solid #555;border-radius:3px;color:#eee;padding:2px 4px;width:100%;box-sizing:border-box;';
        const saveRules = () => {
          const rows = [...rulesEl.querySelectorAll('.csv-rule-row')];
          const rules = rows.map((row) => ({
            col:        row.querySelector('.csv-rule-col')?.value || 'dtxr',
            contains:   row.querySelector('.csv-rule-contains')?.value || '',
            notContains: row.querySelector('.csv-rule-notcontains')?.value || '',
            result:     row.querySelector('.csv-rule-result')?.value || '',
          }));
          values[field.key] = JSON.stringify(rules);
          persist();
        };
        rulesEl.addEventListener('input', saveRules);
        rulesEl.addEventListener('change', saveRules);
        rulesEl.addEventListener('click', (e) => {
          if (e.target.closest('.csv-rule-del')) {
            e.target.closest('.csv-rule-row').remove();
            saveRules();
          }
        });
        if (addBtn) {
          addBtn.addEventListener('click', () => {
            const newRow = document.createElement('div');
            newRow.className = 'csv-rule-row';
            newRow.style.cssText = rowStyle;
            const colOptions = STAGED_CSV_ALL_COLUMNS.map(
              (c) => `<option value="${_esc(c.key)}">${_esc(c.label)}</option>`,
            ).join('');
            newRow.innerHTML = `
              <select class="csv-rule-col" style="${inputStyle}padding:1px 2px;">${colOptions}</select>
              <input type="text" class="csv-rule-contains" placeholder="Contains…" style="${inputStyle}">
              <input type="text" class="csv-rule-notcontains" placeholder="Not Contains (opt.)" style="${inputStyle}">
              <input type="text" class="csv-rule-result" placeholder="Result e.g. G+LS" style="${inputStyle}">
              <button type="button" class="csv-rule-del model-converters-download-btn"
                      style="padding:0;min-width:22px;font-size:13px;color:#e88;line-height:1;" title="Delete rule">×</button>
            `;
            rulesEl.appendChild(newRow);
            saveRules();
          });
        }
        continue;
      }
      const input = advancedFieldsEl.querySelector(`[data-option-key="${field.key}"]`);
      if (!input) continue;
      const updateValue = () => {
        const next = _readOptionValue(field, input);
        // Programmatic config hydration dispatches both input and change.
        // Avoid writing the same multi-MB defaults a second time.
        if (Object.is(values[field.key], next)) return;
        values[field.key] = next;
        persist();
      };
      input.addEventListener('input', updateValue);
      input.addEventListener('change', updateValue);
    }
    for (const field of def.fields) {
      if (field.type !== 'json-popup') continue;
      const button = advancedFieldsEl.querySelector(`[data-json-popup-key="${field.key}"]`);
      const input = advancedFieldsEl.querySelector(`[data-option-key="${field.key}"]`);
      if (!button || !input) continue;
      button.addEventListener('click', () => {
        const popupHeaderFields = (def.id === 'inputxml_to_cii2019' && field.key === 'layoutConfigJson')
          ? def.fields
            .filter((entry) => INPUTXML2019_POPUP_HEADER_KEYS.includes(entry.key))
            .map((entry) => ({
              ...entry,
              value: values[entry.key],
            }))
          : [];
        const isXmlCiiSupportConfig = def.id === 'xml_to_cii' && field.key === 'supportConfigJson';
        _openJsonPopup({
          title: `${def.label}: ${field.label}`,
          value: input.value || '',
          headerFields: popupHeaderFields,
          supportRules: isXmlCiiSupportConfig ? getAllRules() : [],
          enrichmentTools: isXmlCiiSupportConfig,
          suppressWorkflowTabs: isXmlCiiSupportConfig,
          requirementLines: isXmlCiiSupportConfig ? [
            'Rating: derive piping class from Branchname using rating.pipingClassRegex/group or rating.pipingClassTokenIndex (1-based token position), then map prefixes in rating.ratingSequence in order.',
            'Weight: derive bore from Branchname using weight.boreRegex/group or weight.boreTokenIndex (1-based token position), calculate element length from previous/current node coordinates, then match weight.masterRows by bore/rating/length.',
          ] : [],
          onSave: ({ jsonText, headerValues }) => {
            input.value = jsonText;
            values[field.key] = jsonText;
            for (const [headerKey, headerValue] of Object.entries(headerValues || {})) {
              values[headerKey] = headerValue;
            }
            persist();
            renderAdvanced();
          },
        });
      });
    }
  }

  function renderSupportMapperConfig() {
    if (!supportMapperWrapEl || !supportMapperPanelEl) return;
    const isSupportConversion = activeDef().id === 'rvmattr_to_xml';
    supportMapperWrapEl.hidden = !isSupportConversion;
    if (!isSupportConversion || supportMapperPanelEl.dataset.rendered === 'true') return;
    renderSupportMapperPanel(supportMapperPanelEl);
    supportMapperPanelEl.dataset.rendered = 'true';
  }

  function xmlCiiLocalMasterState(masterKey) {
    if (!xmlCiiMasterLocalState.has(masterKey)) {
      xmlCiiMasterLocalState.set(masterKey, {
        rawRows: [],
        fieldMap: {},
        sheetNames: [],
        selectedSheet: '',
        sheets: {},
        sourceName: '',
      });
    }
    return xmlCiiMasterLocalState.get(masterKey);
  }

  function xmlCiiStorageGet(key) {
    try {
      return typeof window !== 'undefined' ? (window.localStorage.getItem(key) || '') : '';
    } catch {
      return '';
    }
  }

  function xmlCiiStorageSet(key, value) {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`[XML->CII] Failed to write localStorage key ${key}:`, error);
      return false;
    }
  }

  function xmlCiiLastPipingClassIndexPath() {
    return _toText(xmlCiiStorageGet(XML_CII_LAST_PIPING_CLASS_INDEX_PATH_KEY)).trim();
  }

  function xmlCiiSaveLastPipingClassIndexPath(path) {
    const normalized = xmlCiiNormalizeMasterPath(path);
    if (normalized) xmlCiiStorageSet(XML_CII_LAST_PIPING_CLASS_INDEX_PATH_KEY, normalized);
    return normalized;
  }

  function xmlCiiReadLineListMappingTemplates() {
    try {
      const parsed = JSON.parse(xmlCiiStorageGet(XML_CII_LINELIST_MAPPING_TEMPLATES_KEY) || '{}');
      const source = Array.isArray(parsed)
        ? Object.fromEntries(parsed.map((entry) => [_toText(entry?.fileName || entry?.sourceName).trim(), entry]).filter(([key]) => key))
        : parsed;
      if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
      return Object.fromEntries(Object.entries(source).filter(([, entry]) => entry?.fieldMap && typeof entry.fieldMap === 'object' && !Array.isArray(entry.fieldMap)));
    } catch {
      return {};
    }
  }

  function xmlCiiWriteLineListMappingTemplates(templates) {
    xmlCiiStorageSet(XML_CII_LINELIST_MAPPING_TEMPLATES_KEY, JSON.stringify(templates || {}, null, 2));
  }

  function xmlCiiLineListTemplateFileName(local) {
    const sourceName = _toText(local?.sourceName).trim();
    return sourceName || 'Unnamed line list';
  }

  function xmlCiiMappingFieldCount(fieldMap) {
    return Object.values(fieldMap || {}).filter((value) => _toText(value).trim()).length;
  }

  function xmlCiiLineListMappingTemplateRows() {
    return Object.values(xmlCiiReadLineListMappingTemplates())
      .sort((left, right) => _toText(right.updatedAt).localeCompare(_toText(left.updatedAt)));
  }

  function xmlCiiSaveLineListMappingTemplate() {
    const local = xmlCiiLocalMasterState('linelist');
    const fieldMap = local.fieldMap && typeof local.fieldMap === 'object' && !Array.isArray(local.fieldMap) ? { ...local.fieldMap } : {};
    const mappedFieldCount = xmlCiiMappingFieldCount(fieldMap);
    if (!mappedFieldCount) return null;
    const fileName = xmlCiiLineListTemplateFileName(local);
    const templates = xmlCiiReadLineListMappingTemplates();
    const existing = templates[fileName] || {};
    templates[fileName] = {
      fileName,
      sourceName: fileName,
      fieldMap,
      headers: _xmlCiiHeadersFromRows(local.rawRows).filter((header) => header !== '_raw' && header !== '_rowIndex'),
      mappedFieldCount,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    xmlCiiWriteLineListMappingTemplates(templates);
    return templates[fileName];
  }

  function xmlCiiApplyLineListMappingTemplate(fileName) {
    const key = _toText(fileName).trim();
    const template = xmlCiiReadLineListMappingTemplates()[key];
    if (!template) throw new Error(`No saved line-list column mapping found for "${key}".`);
    const local = xmlCiiLocalMasterState('linelist');
    local.fieldMap = { ...(template.fieldMap || {}) };
    if (local.rawRows.length) xmlCiiSaveMasterRows('linelist');
    return template;
  }

  function xmlCiiActiveWorkflowTab(rootEl) {
    const configured = rootEl?.dataset.activeMaster || 'linelist';
    if (configured === 'overrides') return configured;
    return XML_CII_MASTER_DEFS[configured] ? configured : 'linelist';
  }

  function xmlCiiActiveMasterKey(rootEl) {
    const configured = xmlCiiActiveWorkflowTab(rootEl);
    return XML_CII_MASTER_DEFS[configured] ? configured : 'linelist';
  }

  function xmlCiiWorkflowDetailForRoot(rootEl) {
    if (rootEl === xmlCiiWorkflowPopupEl) return xmlCiiWorkflowPopupDetailEl;
    return xmlCiiWorkflowDetailEl;
  }

  // Sync the hidden supportConfigJson textarea in the main-tab UI so that
  // writeSupportConfigBranchSample (in branch-sample-sync) never reads stale
  // data for configs that exceed the 250 KB renderAdvanced threshold.
  function _xmlCiiSyncConfigTextarea() {
    try {
      const el = document.querySelector('[data-option-key="supportConfigJson"]');
      if (el && 'value' in el) el.value = activeValues().supportConfigJson || '';
    } catch {}
  }

  let xmlCiiConfigSaveGeneration = 0;
  let xmlCiiPendingFetchSave = null;
  function xmlCiiSaveConfig(config, { compact = false, background = false } = {}) {
    const generation = ++xmlCiiConfigSaveGeneration;
    if (background && typeof Worker === 'function') {
      // Fetch alone uses this branch. The small rating journal is already
      // durable before painting the success notice.
      let worker;
      try {
        worker = new Worker(new URL('./core/config-save-worker.js', import.meta.url), { type: 'module' });
      } catch (error) {
        console.warn('[XML->CII] background config worker unavailable', error);
        return xmlCiiSaveConfig(config, { compact });
      }
      const previous = defaultsByConverter[selectedConverter] || {};
      const snapshot = {
        ...defaultsByConverter,
        [selectedConverter]: { ...previous, supportConfigJson: '' },
      };
      const pendingSave = new Promise((resolve, reject) => {
        const terminate = () => { try { worker.terminate(); } catch {} };
        worker.onmessage = ({ data }) => {
          if (data?.generation !== generation) return;
          terminate();
          if (generation !== xmlCiiConfigSaveGeneration) { resolve('superseded'); return; }
          if (data.error) { reject(new Error(data.error)); return; }
          try {
            writePreparedStoredState(data.payload);
            activeValues().supportConfigJson = data.fullJson;
            clearXmlCiiFetchedRatingsJournal();
            // Do not concatenate serialization, storage and textarea DOM work
            // into one long main-thread Fetch task.
            const updateUi = () => {
              if (generation !== xmlCiiConfigSaveGeneration) return;
              xmlCiiRenderAdvancedWhenConfigFits();
              _xmlCiiSyncConfigTextarea();
            };
            if (typeof requestAnimationFrame === 'function')
              requestAnimationFrame(() => setTimeout(updateUi, 0));
            else setTimeout(updateUi, 0);
            resolve(data.status);
          } catch (error) { reject(error); }
        };
        worker.onerror = (event) => {
          terminate();
          reject(new Error(String(event?.message || 'config save worker failed')));
        };
        try {
          worker.postMessage({ generation, config, compact, selectedConverter,
            defaultsByConverter: snapshot });
        } catch (error) { terminate(); reject(error); }
      });
      xmlCiiPendingFetchSave = pendingSave;
      pendingSave.then(
        () => { if (xmlCiiPendingFetchSave === pendingSave) xmlCiiPendingFetchSave = null; },
        () => { if (xmlCiiPendingFetchSave === pendingSave) xmlCiiPendingFetchSave = null; },
      );
      return pendingSave;
    }
    const perf = typeof performance !== 'undefined' ? performance : null;
    perf?.mark?.('xml-cii:popup:config-save:start');
    try {
      // Fetch Rating persists the identical data in compact JSON: avoid
      // serializing and assigning a multi-megabyte indented textarea twice.
      // Other config edits retain their existing pretty-printed form.
      activeValues().supportConfigJson = JSON.stringify(config, null, compact ? 0 : 2);
      xmlCiiPersistLargeConfigChange('XML->CII config');
      clearXmlCiiFetchedRatingsJournal();
      xmlCiiRenderAdvancedWhenConfigFits();
      _xmlCiiSyncConfigTextarea();
    } finally {
      perf?.mark?.('xml-cii:popup:config-save:end');
      perf?.measure?.('xml-cii:popup:config-save',
        'xml-cii:popup:config-save:start', 'xml-cii:popup:config-save:end');
    }
  }

  function xmlCiiSpecwiseMasterPaths(config) {
    const current = config?.masterPaths && typeof config.masterPaths === 'object' && !Array.isArray(config.masterPaths)
      ? config.masterPaths
      : {};
    const rememberedIndexPath = xmlCiiLastPipingClassIndexPath();
    const defaults = rememberedIndexPath
      ? { ...XML_CII_SPECWISE_MASTER_PATH_DEFAULTS, pipingClassIndexPath: rememberedIndexPath }
      : XML_CII_SPECWISE_MASTER_PATH_DEFAULTS;
    const paths = { ...defaults, ...current };
    if (
      rememberedIndexPath
      && (!current.pipingClassIndexPath || current.pipingClassIndexPath === XML_CII_SPECWISE_MASTER_PATH_DEFAULTS.pipingClassIndexPath)
    ) {
      paths.pipingClassIndexPath = rememberedIndexPath;
    }
    delete paths.legacyPipingMasterPath;
    return paths;
  }

  function xmlCiiNormalizeMasterPath(masterPath) {
    return _toText(masterPath).trim().replace(/^\/+/, '').replace(/^\.\//, '');
  }

  function xmlCiiSpecwiseCandidateUrls(masterPath) {
    const cleanPath = xmlCiiNormalizeMasterPath(masterPath);
    const urls = [];
    try { urls.push(new URL(`../../${cleanPath}`, import.meta.url).href); } catch {}
    try { urls.push(new URL(`../../${cleanPath}`, document.baseURI).href); } catch {}
    try { urls.push(new URL(cleanPath, document.baseURI).href); } catch {}
    return [...new Set(urls.filter(Boolean))];
  }

  async function xmlCiiFetchMasterPathText(masterPath) {
    const errors = [];
    for (const url of xmlCiiSpecwiseCandidateUrls(masterPath)) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          errors.push(`${url}: HTTP ${response.status}`);
          continue;
        }
        const text = await response.text();
        if (!_toText(text).trim()) {
          errors.push(`${url}: empty response`);
          continue;
        }
        return { text, url };
      } catch (error) {
        errors.push(`${url}: ${_toText(error?.message || error)}`);
      }
    }
    throw new Error(`Failed to load ${masterPath}. Tried: ${errors.join(' | ')}`);
  }

  function xmlCiiParseSpecwiseIndex(text) {
    const parsed = JSON.parse(_toText(text).replace(/^export\s+default\s+/i, '').replace(/;\s*$/g, '') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.classes || typeof parsed.classes !== 'object') {
      throw new Error('Invalid specwise piping class index.');
    }
    return parsed;
  }

  function xmlCiiNormalizeSpecwiseToken(value) {
    return _toText(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function xmlCiiNormalizeSpecwisePipingRow(row, index) {
    const raw = row && typeof row === 'object' ? row : {};
    const rawText = (keys) => _rowText(raw, keys);
    const boreText = rawText(['convertedBore', 'Converted Bore', 'DN', 'NB', 'Bore', 'NPS', 'Size']);
    const boreNumber = _parseNumericMm(boreText);
    return {
      ...raw,
      _raw: raw,
      _sourceRowIndex: raw._sourceRowIndex || raw._rowIndex || index + 1,
      pipingClass: rawText(['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class', 'SPEC', 'Spec']),
      convertedBore: boreNumber !== null ? boreNumber : boreText,
      componentType: rawText(['componentType', 'Component Type', 'COMPONENT_TYPE', 'Type', 'Item Type']),
      rating: rawText(['rating', 'Rating', 'RATING', 'Class Rating', 'Pressure Class']),
      materialName: rawText(['materialName', 'Material_Name', 'Material', 'MATERIAL', 'Material Name']),
      schedule: rawText(['schedule', 'Schedule', 'SCHEDULE', 'SCH']),
      wallThickness: rawText(['wallThickness', 'Wall Thickness', 'Wall thickness', 'WALL_THICKNESS', 'WT', 'WallThickness']),
      corrosion: rawText(['corrosion', 'Corrosion', 'Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CA']),
      endCondition: rawText(['endCondition', 'End Condition', 'END_CONDITION', 'End Type']),
    };
  }

  function xmlCiiSpecwiseRowsFromShard(text) {
    const rows = _xmlCiiParseJsonRows(text);
    return (Array.isArray(rows) ? rows : [])
      .map((row, index) => xmlCiiNormalizeSpecwisePipingRow(row, index))
      .filter((row) => _toText(row.pipingClass).trim());
  }

  function xmlCiiExtractBranchNamesFromXml(xmlText) {
    const source = _toText(xmlText);
    const names = [];
    if (typeof DOMParser !== 'undefined') {
      try {
        const doc = new DOMParser().parseFromString(source, 'application/xml');
        if (!doc.getElementsByTagName('parsererror').length) {
          for (const node of Array.from(doc.getElementsByTagName('Branchname'))) {
            const value = _toText(node.textContent).trim();
            if (value) names.push(value);
          }
        }
      } catch {}
    }
    if (!names.length) {
      for (const match of source.matchAll(/<Branchname\b[^>]*>([\s\S]*?)<\/Branchname>/gi)) {
        const value = _toText(match[1]).replace(/<[^>]+>/g, '').trim();
        if (value) names.push(value);
      }
    }
    return [...new Set(names)];
  }

  function xmlCiiSpecwiseBranchClassToken(branchName, config) {
    const delimiter = config?.rating?.tokenDelimiter || config?.linelist?.tokenDelimiter || '-';
    const token = _tokenAtPosition(branchName, delimiter, Number(config?.rating?.pipingClassTokenIndex || 5));
    return xmlCiiNormalizeSpecwiseToken(token);
  }

  function xmlCiiSpecwiseIndexMatches(index, branchNames, config) {
    const entries = Object.entries(index?.classes || {});
    const branchKeys = branchNames.map((branchName) => ({
      branch: xmlCiiNormalizeSpecwiseToken(branchName),
      classToken: xmlCiiSpecwiseBranchClassToken(branchName, config),
    }));
    const matches = [];
    for (const [classKey, meta] of entries) {
      const tokens = [classKey, ...(Array.isArray(meta?.matchTokens) ? meta.matchTokens : [])]
        .map(xmlCiiNormalizeSpecwiseToken)
        .filter(Boolean);
      if (!tokens.length) continue;
      const matched = branchKeys.some(({ branch, classToken }) => tokens.some((token) => (
        (classToken && (classToken.includes(token) || token.includes(classToken)))
        || (branch && branch.includes(token))
      )));
      if (matched) matches.push({ classKey, meta });
    }
    return matches;
  }

  function xmlCiiJoinMasterPath(folder, file) {
    return `${xmlCiiNormalizeMasterPath(folder).replace(/\/+$/, '')}/${_toText(file).trim().replace(/^\/+/, '')}`;
  }

  function xmlCiiSpecwiseStatusText(config) {
    const piping = config?.pipingClass && typeof config.pipingClass === 'object' ? config.pipingClass : {};
    const rows = Array.isArray(piping.masterRows) ? piping.masterRows.length : 0;
    if (piping._smartMode === 'specwise-shard') {
      return `Piping Class: ${piping._loadedShardCount || 0}/${piping._matchedClassCount || 0} shard(s), ${rows} row(s), ${piping._branchNameCount || 0} branchname(s).`;
    }
    if (piping._smartMode === 'specwise-index-no-match') {
      return `Piping Class: 0/${piping._matchedClassCount || 0} shard(s), 0 row(s), ${piping._branchNameCount || 0} branchname(s).`;
    }
    return 'Material Map and Weight Master auto-load from docs/Masters. Select XML and rescan to load specwise piping class rows.';
  }

  function xmlCiiRenderSpecwiseMasterPathsPanel(config, statusText) {
    const paths = xmlCiiSpecwiseMasterPaths(config);
    const pathInput = (label, key, showFetch = false) => `
      <label class="model-converters-workflow-regex-field" style="display:block;">
        <span>${_esc(label)}</span>
        <div style="display:flex;gap:4px;align-items:center;">
          <input type="text" value="${_escAttr(paths[key] || '')}" data-xml-cii-master-path="${_escAttr(key)}" style="flex:1;min-width:0;">
          ${showFetch ? `<button type="button" class="model-converters-download-btn" data-xml-cii-fetch-index style="white-space:nowrap;padding:4px 8px;" title="Fetch index from path and rescan">Fetch</button>` : ''}
        </div>
      </label>`;
    return `
      <div class="model-converters-workflow-master-card" data-xml-cii-specwise-paths-panel style="margin:10px 0;border-color:#25466b;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <div>
            <div class="model-converters-workflow-detail-title">Master Paths / Specwise Piping Class Index</div>
            <div class="model-converters-workflow-detail-text">Default masters load from docs/Masters. Piping class rows load from specwise shards after XML selection.</div>
          </div>
          <button type="button" class="model-converters-run-btn" data-xml-cii-rescan-piping>Rescan XML</button>
        </div>
        <div class="model-converters-workflow-regex-grid" style="margin-top:10px;grid-template-columns:repeat(4,minmax(180px,1fr));">
          ${pathInput('Material Map Path', 'materialMapPath')}
          ${pathInput('Weights / Valve CA8 Path', 'weightPath')}
          ${pathInput('Piping Class Index Path', 'pipingClassIndexPath', true)}
          ${pathInput('Piping Class Shard Folder', 'pipingClassShardFolder')}
        </div>
        <div data-xml-cii-path-status style="margin-top:8px;padding:8px 10px;border:1px solid #2b7656;border-radius:8px;color:#7dffc0;background:#0f1b2c;font-size:12px;">
          ${_esc(statusText || xmlCiiSpecwiseStatusText(config))}
        </div>
      </div>`;
  }

  function xmlCiiRenderPipingClassIndexPathPanel(config) {
    const paths = xmlCiiSpecwiseMasterPaths(config);
    return `
      <div class="model-converters-workflow-master-card" data-xml-cii-specwise-paths-panel data-xml-cii-piping-index-panel style="margin:10px 0;border-color:#25466b;">
        <div class="model-converters-workflow-master-head">
          <div>
            <div class="model-converters-workflow-detail-title">Piping Class Index Path</div>
            <div class="model-converters-workflow-detail-text">Fetch specwise piping-class rows from the selected index path. The last fetched path is remembered locally.</div>
          </div>
          <button type="button" class="model-converters-run-btn" data-xml-cii-rescan-piping>Rescan XML</button>
        </div>
        <div class="model-converters-workflow-regex-grid" style="margin-top:10px;grid-template-columns:2fr 1.4fr auto;">
          <label class="model-converters-workflow-regex-field">
            <span>Piping Class Index Path</span>
            <input type="text" value="${_escAttr(paths.pipingClassIndexPath || '')}" data-xml-cii-master-path="pipingClassIndexPath">
          </label>
          <label class="model-converters-workflow-regex-field">
            <span>Piping Class Shard Folder</span>
            <input type="text" value="${_escAttr(paths.pipingClassShardFolder || '')}" data-xml-cii-master-path="pipingClassShardFolder">
          </label>
          <button type="button" class="model-converters-download-btn" data-xml-cii-fetch-index style="align-self:end;white-space:nowrap;">Fetch</button>
        </div>
        <div data-xml-cii-path-status style="margin-top:8px;padding:8px 10px;border:1px solid #2b7656;border-radius:8px;color:#7dffc0;background:#0f1b2c;font-size:12px;">
          ${_esc(xmlCiiSpecwiseStatusText(config))}
        </div>
      </div>`;
  }

  async function xmlCiiRescanSpecwisePipingClass(options = {}) {
    const force = options.force === true;
    const notifyUser = options.notifyUser === true;
    const xmlFile = xmlCiiCurrentPrimaryFile();
    const activeVal = activeValues();
    const config = _parseXmlCiiEnrichmentConfig(activeVal.supportConfigJson);
    if (!xmlFile) return { changed: false, message: 'Piping Class: select XML, then Rescan XML to load specwise shard rows.' };

    const xmlText = await xmlFile.text();
    const branchNames = xmlCiiExtractBranchNamesFromXml(xmlText);
    if (!branchNames.length) return { changed: false, message: 'Piping Class: no Branchname values found in XML.' };

    const paths = xmlCiiSpecwiseMasterPaths(config);
    const signature = JSON.stringify({
      file: `${xmlFile.name}:${xmlFile.size}:${xmlFile.lastModified}`,
      branches: branchNames.length,
      index: paths.pipingClassIndexPath,
      folder: paths.pipingClassShardFolder,
    });
    if (!force && config.pipingClass?._rescanSignature === signature && Array.isArray(config.pipingClass?.masterRows) && config.pipingClass.masterRows.length) {
      return { changed: false, message: xmlCiiSpecwiseStatusText(config) };
    }

    const indexLoad = await xmlCiiFetchMasterPathText(paths.pipingClassIndexPath);
    const index = xmlCiiParseSpecwiseIndex(indexLoad.text);
    const matches = xmlCiiSpecwiseIndexMatches(index, branchNames, config);
    const rows = [];
    const loadedFiles = [];
    const folder = paths.pipingClassShardFolder || index.shardBase || XML_CII_SPECWISE_MASTER_PATH_DEFAULTS.pipingClassShardFolder;

    for (const match of matches) {
      const shardFile = _toText(match.meta?.file || `${match.classKey}.json`).trim();
      if (!shardFile) continue;
      const shard = await xmlCiiFetchMasterPathText(xmlCiiJoinMasterPath(folder, shardFile));
      const shardRows = xmlCiiSpecwiseRowsFromShard(shard.text);
      if (!shardRows.length) continue;
      rows.push(...shardRows);
      loadedFiles.push(shardFile);
    }

    if (!config.pipingClass || typeof config.pipingClass !== 'object' || Array.isArray(config.pipingClass)) config.pipingClass = {};
    config.pipingClass.masterRows = rows.length ? rows : [{ ...XML_CII_SPECWISE_PLACEHOLDER_ROW }];
    config.pipingClass.fieldMap = { ...XML_CII_SPECWISE_PIPING_FIELD_MAP };
    config.pipingClass.masterUrl = indexLoad.url;
    config.pipingClass.defaultUrl = indexLoad.url;
    config.pipingClass._smartMode = rows.length ? 'specwise-shard' : 'specwise-index-no-match';
    config.pipingClass._autoloadedRows = rows.length;
    config.pipingClass._matchedClassCount = matches.length;
    config.pipingClass._loadedShardCount = loadedFiles.length;
    config.pipingClass._loadedShardFiles = loadedFiles;
    config.pipingClass._branchNameCount = branchNames.length;
    config.pipingClass._rescanSignature = signature;
    config.pipingClass._rescanAt = new Date().toISOString();
    config.masterPaths = { ...paths };
    delete config.masterPaths.legacyPipingMasterPath;
    xmlCiiSaveConfig(config);

    const message = xmlCiiSpecwiseStatusText(config);
    if (notifyUser) {
      notify({ level: rows.length ? 'success' : 'warning', title: 'XML->CII Masters', message });
    }
    return { changed: true, message };
  }

  function xmlCiiBindSpecwiseMasterPathsPanel(rootEl, rerender) {
    const panels = Array.from(rootEl?.querySelectorAll?.('[data-xml-cii-specwise-paths-panel]') || []);
    panels.forEach((panel) => {
    if (!panel || panel.dataset.bound === 'true') return;
    panel.dataset.bound = 'true';
    panel.querySelectorAll('[data-xml-cii-master-path]').forEach((input) => {
      input.addEventListener('change', () => {
        const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
        const key = input.getAttribute('data-xml-cii-master-path') || '';
        const normalized = xmlCiiNormalizeMasterPath(input.value);
        config.masterPaths = xmlCiiSpecwiseMasterPaths(config);
        config.masterPaths[key] = normalized;
        if (key === 'pipingClassIndexPath') xmlCiiSaveLastPipingClassIndexPath(normalized);
        delete config.masterPaths.legacyPipingMasterPath;
        xmlCiiSaveConfig(config);
        rerender?.();
      });
    });
    panel.querySelector('[data-xml-cii-rescan-piping]')?.addEventListener('click', async () => {
      const statusEl = panel.querySelector('[data-xml-cii-path-status]');
      try {
        if (statusEl) statusEl.textContent = 'Scanning XML branch names against specwise piping class index...';
        const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
        const nextPaths = { ...xmlCiiSpecwiseMasterPaths(config) };
        panel.querySelectorAll('[data-xml-cii-master-path]').forEach((input) => {
          const key = input.getAttribute('data-xml-cii-master-path') || '';
          if (key) nextPaths[key] = xmlCiiNormalizeMasterPath(input.value);
        });
        if (nextPaths.pipingClassIndexPath) xmlCiiSaveLastPipingClassIndexPath(nextPaths.pipingClassIndexPath);
        config.masterPaths = nextPaths;
        xmlCiiSaveConfig(config);
        const result = await xmlCiiRescanSpecwisePipingClass({ force: true, notifyUser: true });
        if (statusEl) statusEl.textContent = result.message;
      } catch (error) {
        const message = _toText(error?.message || error);
        if (statusEl) statusEl.textContent = message;
        notify({ level: 'error', title: 'XML->CII Masters', message });
      } finally {
        rerender?.();
      }
    });
    panel.querySelectorAll('[data-xml-cii-fetch-index]').forEach((button) => button.addEventListener('click', async () => {
      const statusEl = panel.querySelector('[data-xml-cii-path-status]');
      const pathInput = panel.querySelector('[data-xml-cii-master-path="pipingClassIndexPath"]');
      const path = (pathInput?.value || '').trim();
      if (!path) { if (statusEl) statusEl.textContent = 'Enter a Piping Class Index Path first.'; return; }
      try {
        if (statusEl) statusEl.textContent = `Fetching ${path}...`;
        const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
        const normalized = xmlCiiSaveLastPipingClassIndexPath(path);
        const nextPaths = { ...xmlCiiSpecwiseMasterPaths(config), pipingClassIndexPath: normalized };
        panel.querySelectorAll('[data-xml-cii-master-path]').forEach((input) => {
          const key = input.getAttribute('data-xml-cii-master-path') || '';
          if (key) nextPaths[key] = xmlCiiNormalizeMasterPath(input.value);
        });
        config.masterPaths = nextPaths;
        if (config.masterPaths.pipingClassIndexPath) xmlCiiSaveLastPipingClassIndexPath(config.masterPaths.pipingClassIndexPath);
        xmlCiiSaveConfig(config);
        const result = await xmlCiiRescanSpecwisePipingClass({ force: true, notifyUser: true });
        if (statusEl) statusEl.textContent = result.message;
      } catch (error) {
        const message = _toText(error?.message || error);
        if (statusEl) statusEl.textContent = message;
        notify({ level: 'error', title: 'XML->CII Masters', message });
      } finally {
        rerender?.();
      }
    }));
    });
  }

  function xmlCiiScheduleSpecwiseRescan(rootEl, rerender) {
    if (!rootEl || rootEl.dataset.xmlCiiSpecwiseRescanScheduled === 'true') return;
    rootEl.dataset.xmlCiiSpecwiseRescanScheduled = 'true';
    const run = async () => {
      try {
        const result = await xmlCiiRescanSpecwisePipingClass({ force: false, notifyUser: false });
        if (result.changed && rootEl.isConnected) rerender?.();
      } catch (error) {
        console.warn('[XML->CII] Specwise piping class scan failed:', error);
      } finally {
        if (rootEl) rootEl.dataset.xmlCiiSpecwiseRescanScheduled = 'false';
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1000 });
    else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else Promise.resolve().then(run);
  }

  function xmlCiiConfigWithLoadedMasterRows(contextLabel) {
    const perf = typeof performance !== 'undefined' ? performance : null;
    perf?.mark?.('xml-cii:popup:master-hydrate:start');
    const values = activeValues();
    const config = applyStagedXmlCiiFetchedRatings(_parseXmlCiiEnrichmentConfig(values.supportConfigJson));
    let hydrated = false;

    for (const masterKey of XML_CII_MASTER_ORDER) {
      const masterDef = XML_CII_MASTER_DEFS[masterKey];
      const savedRows = _xmlCiiMasterRowsFromConfig(config, masterDef);
      if (savedRows.length) continue;

      const local = xmlCiiLocalMasterState(masterKey);
      if (!local.rawRows.length) continue;

      const rows = _xmlCiiMapRowsWithFieldMap(local.rawRows, local.fieldMap, masterKey);
      if (!rows.length) continue;

      if (!config[masterDef.sectionKey] || typeof config[masterDef.sectionKey] !== 'object') {
        config[masterDef.sectionKey] = {};
      }
      config[masterDef.sectionKey][masterDef.rowsKey] = rows;
      config[masterDef.sectionKey][masterDef.fieldMapKey] = local.fieldMap && typeof local.fieldMap === 'object'
        ? local.fieldMap
        : {};
      hydrated = true;
    }

    if (hydrated) {
      values.supportConfigJson = JSON.stringify(config, null, 2);
      _xmlCiiSyncConfigTextarea();
      xmlCiiPersistLargeConfigChange(contextLabel);
    }

    perf?.mark?.('xml-cii:popup:master-hydrate:end');
    perf?.measure?.('xml-cii:popup:master-hydrate',
      'xml-cii:popup:master-hydrate:start', 'xml-cii:popup:master-hydrate:end');
    return config;
  }

  function xmlCiiPersistLargeConfigChange(contextLabel) {
    // persist() never throws; it returns 'trimmed' when imported masters were
    // too large for localStorage and were dropped from the persisted copy.
    const status = persist();
    if (status === 'trimmed' && !xmlCiiMasterStorageWarningShown) {
      xmlCiiMasterStorageWarningShown = true;
      notify({
        level: 'info',
        title: 'XML->CII Masters',
        message: `${contextLabel}: imported master tables are kept for this session only (too large for browser storage). They reload from their source automatically — use Export JSON to keep an offline copy.`,
      });
    }
  }

  function xmlCiiRenderAdvancedWhenConfigFits() {
    const configText = _toText(activeValues().supportConfigJson);
    if (configText.length > 250000) return;
    renderAdvanced();
  }

  function xmlCiiEnsureOverrides(config) {
    if (!config.overrides || typeof config.overrides !== 'object') config.overrides = {};
    for (const key of ['material', 'pipingClass', 'processData', 'rigidWeight']) {
      if (!config.overrides[key] || typeof config.overrides[key] !== 'object' || Array.isArray(config.overrides[key])) {
        config.overrides[key] = {};
      }
    }
    return config.overrides;
  }

  function xmlCiiMasterIssueHtml(rows, fieldMap, masterDef) {
    const issues = [];
    if (!rows.length) issues.push({ tone: 'warn', text: 'No saved rows yet.' });
    for (const requiredField of masterDef.requiredFields) {
      if (!_toText(fieldMap?.[requiredField]).trim()) {
        issues.push({ tone: 'bad', text: `Required field not mapped: ${requiredField}` });
      }
    }
    if (!issues.length) issues.push({ tone: 'ok', text: 'Master mapping looks ready.' });
    return `<div class="model-converters-workflow-issues">${issues.map((issue) => `
      <div class="model-converters-workflow-issue ${_esc(issue.tone)}">${_esc(issue.text)}</div>
    `).join('')}</div>`;
  }

  function xmlCiiMappingHeaderHtml(headers, fieldMap, masterDef) {
    const previewMap = _xmlCiiBuildColumnPreviewMap(xmlCiiLocalMasterState(masterDef.key).rawRows, headers);
    const visibleFields = Object.keys(masterDef.aliases || {}).filter((fieldName) => {
      if (masterDef.key !== 'linelist') return true;
      return !['lineKey1', 'lineKey2'].includes(fieldName);
    });
    return visibleFields.map((fieldName) => {
      const selected = fieldMap?.[fieldName] || '';
      const required = masterDef.requiredFields.includes(fieldName);
      const label = masterDef.fieldLabels?.[fieldName] || fieldName;
      return `
        <label class="model-converters-workflow-map-field">
          <span>${_esc(label)}${required ? ' *' : ''}</span>
          <select data-xml-cii-field-map="${_esc(fieldName)}">
            <option value="">${required ? '-- required --' : '-- not mapped --'}</option>
            ${headers.map((header) => `
              <option value="${_escAttr(header)}" ${selected === header ? 'selected' : ''}>${_esc(previewMap[header] || header)}</option>
            `).join('')}
          </select>
        </label>
      `;
    }).join('');
  }

  function xmlCiiRenderLineKeyMappingHtml(headers, fieldMap, masterDef) {
    const previewMap = _xmlCiiBuildColumnPreviewMap(xmlCiiLocalMasterState(masterDef.key).rawRows, headers);
    const renderSelect = (fieldName) => {
      const selected = fieldMap?.[fieldName] || '';
      const label = masterDef.fieldLabels?.[fieldName] || fieldName;
      return `
        <label class="model-converters-workflow-map-field">
          <span>${_esc(label)}</span>
          <select data-xml-cii-field-map="${_esc(fieldName)}">
            <option value="">-- optional --</option>
            ${headers.map((header) => `
              <option value="${_escAttr(header)}" ${selected === header ? 'selected' : ''}>${_esc(previewMap[header] || header)}</option>
            `).join('')}
          </select>
        </label>
      `;
    };
    const local = xmlCiiLocalMasterState(masterDef.key);
    const sampleRow = local.rawRows[0] || {};
    const key1 = fieldMap?.lineKey1 ? _toText(sampleRow[fieldMap.lineKey1]).trim() : '';
    const key2 = fieldMap?.lineKey2 ? _toText(sampleRow[fieldMap.lineKey2]).trim() : '';
    return `
      <div class="model-converters-workflow-master-card model-converters-workflow-regex-card">
        <div class="model-converters-workflow-detail-title">Line No. Key</div>
        <div class="model-converters-workflow-detail-text">
          Final Line No. Key = Key 1 + Key 2. This is matched against the XML Branchname line key from the Regex tab.
        </div>
        <div class="model-converters-workflow-map-grid">
          ${renderSelect('lineKey1')}
          ${renderSelect('lineKey2')}
        </div>
        <div class="model-converters-workflow-preview-grid">
          <div><span>Preview Key 1</span><strong>${_esc(key1 || '(blank)')}</strong></div>
          <div><span>Preview Key 2</span><strong>${_esc(key2 || '(blank)')}</strong></div>
          <div><span>Final Line No. Key</span><strong>${_esc(`${key1}${key2}` || '(blank)')}</strong></div>
        </div>
      </div>
    `;
  }

  function xmlCiiRegexFieldHtml(label, path, value, inputType) {
    return `
      <label class="model-converters-workflow-regex-field">
        <span>${_esc(label)}</span>
        <input type="${_esc(inputType)}" value="${_esc(value ?? '')}" data-xml-cii-regex-path="${_esc(path)}">
      </label>
    `;
  }

  function xmlCiiRenderRegexPhase() {
    const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
    const sampleBranch = _toText(config.linelist?.sampleBranchName || '/ASIM-1885-10"-S8810101-91261M7-HC/B1');
    const lineKey = _deriveBranchLineKey(sampleBranch, config);
    const pipingClass = _derivePipingClassFromBranchName(sampleBranch, config);
    const sizeToken = _deriveXmlCiiSizeTokenFromBranchName(sampleBranch, config);
    const tokens = _branchTokens(sampleBranch, config.linelist?.tokenDelimiter || '-');
    const posInput = (path, val, type = 'text') =>
      `<input class="mc-regex-pos-input" type="${type}" value="${_esc(val)}" data-xml-cii-regex-path="${_esc(path)}" min="1" step="1">`;
    return `
      <div class="model-converters-workflow-detail-title">1 Regex</div>
      <div class="model-converters-workflow-detail-text">Configure XML Branchname extraction before importing or matching masters.</div>
      <div class="model-converters-workflow-master-card">
        <div class="mc-regex-controls">
          <label class="mc-regex-label">
            <span>Sample Branchname</span>
            <input class="mc-regex-branch-input" type="text" value="${_esc(sampleBranch)}"
              data-xml-cii-regex-path="linelist.sampleBranchName"
              placeholder="/ASIM-1885-10&quot;-S8810101-91261M7-HC/B1">
          </label>
          <label class="mc-regex-label mc-regex-label-sm">
            <span>Common Delimiter</span>
            <input class="mc-regex-pos-input" type="text" value="${_esc(config.linelist?.tokenDelimiter || '-')}"
              data-xml-cii-regex-path="linelist.tokenDelimiter" style="width:60px;">
          </label>
          <label class="mc-regex-label mc-regex-label-sm">
            <span>Line Key Joiner <small>(if multi-position)</small></span>
            <input class="mc-regex-pos-input" type="text" value="${_esc(config.linelist?.lineKeyJoiner || '')}"
              data-xml-cii-regex-path="linelist.lineKeyJoiner" style="width:60px;" placeholder="">
          </label>
        </div>
        <div class="mc-regex-note">
          \u2139 Size inch symbol is auto-stripped (&quot;, '', ") &middot; Prefix <code>/</code> and suffix <code>/BN</code> are removed before tokenising.
        </div>
        <div class="model-converters-workflow-section-title" style="margin-top:14px;">Extraction Table</div>
        <table class="mc-regex-extract-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Position(s) <small style="font-weight:400;color:#9aa8ba;">comma-separated</small></th>
              <th>Preview <small style="font-weight:400;color:#9aa8ba;">(from sample)</small></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Line Key</td>
              <td>${posInput('linelist.lineKeyTokenPositions', config.linelist?.lineKeyTokenPositions || '4')}</td>
              <td class="mc-regex-preview-cell"><strong>${_esc(lineKey || '\u2014')}</strong></td>
            </tr>
            <tr>
              <td>Piping Class</td>
              <td>${posInput('rating.pipingClassTokenIndex', config.rating?.pipingClassTokenIndex || 5, 'number')}</td>
              <td class="mc-regex-preview-cell"><strong>${_esc(pipingClass || '\u2014')}</strong></td>
            </tr>
            <tr>
              <td>Size</td>
              <td>${posInput('weight.boreTokenIndex', config.weight?.boreTokenIndex || 3, 'number')}</td>
              <td class="mc-regex-preview-cell"><strong>${_esc(sizeToken || '\u2014')}</strong></td>
            </tr>
          </tbody>
        </table>
        <div class="model-converters-workflow-section-title" style="margin-top:14px;">Token Positions (from sample)</div>
        <table class="mc-regex-extract-table mc-regex-tokens-table">
          <thead><tr><th>Position</th><th>Token</th></tr></thead>
          <tbody>
            ${tokens.map((tok, i) => `<tr><td>${i + 1}</td><td>${_esc(tok)}</td></tr>`).join('')}
          </tbody>
        </table>
        <details class="model-converters-workflow-advanced-toggle" style="margin-top:14px;">
          <summary>Advanced: Regex overrides for piping class / size / line key cleanup</summary>
          <div class="model-converters-workflow-regex-grid" style="margin-top:10px;">
            ${xmlCiiRegexFieldHtml('Piping Class Regex', 'rating.pipingClassRegex', config.rating?.pipingClassRegex || '', 'text')}
            ${xmlCiiRegexFieldHtml('Piping Class Regex Group', 'rating.pipingClassGroup', config.rating?.pipingClassGroup || 1, 'number')}
            ${xmlCiiRegexFieldHtml('Size Regex', 'weight.boreRegex', config.weight?.boreRegex || '', 'text')}
            ${xmlCiiRegexFieldHtml('Size Regex Group', 'weight.boreGroup', config.weight?.boreGroup || 1, 'number')}
            ${xmlCiiRegexFieldHtml('XML Branch Line Key Regex', 'linelist.branchNameRegex', config.linelist?.branchNameRegex || '', 'text')}
            ${xmlCiiRegexFieldHtml('XML Branch Regex Group', 'linelist.lineNoGroup', config.linelist?.lineNoGroup || 1, 'number')}
          </div>
        </details>
      </div>
    `;
  }
  function xmlCiiRenderLineListRegexPanel(config) {
    return `
      <details class="model-converters-workflow-advanced-toggle">
        <summary>Advanced: Line Key Regex</summary>
        <div class="model-converters-workflow-master-card model-converters-workflow-regex-card">
          <div class="model-converters-workflow-detail-text">
            Use these only when the XML branch token or process line list Column X1 needs cleanup before matching.
          </div>
          <div class="model-converters-workflow-regex-grid">
            ${xmlCiiRegexFieldHtml('XML Branch Line Key Regex', 'linelist.branchNameRegex', config.linelist?.branchNameRegex || '', 'text')}
            ${xmlCiiRegexFieldHtml('XML Branch Regex Group', 'linelist.lineNoGroup', config.linelist?.lineNoGroup || 1, 'number')}
            ${xmlCiiRegexFieldHtml('Line List Column X1 Regex', 'linelist.linelistColumnRegex', config.linelist?.linelistColumnRegex || '^\\s*(.*?)\\s*$', 'text')}
            ${xmlCiiRegexFieldHtml('Column X1 Regex Group', 'linelist.linelistColumnGroup', config.linelist?.linelistColumnGroup || 1, 'number')}
          </div>
        </div>
      </details>
    `;
  }

  function xmlCiiRenderLineListMappingTemplateControls(local) {
    const templates = xmlCiiLineListMappingTemplateRows();
    const currentName = xmlCiiLineListTemplateFileName(local);
    const selectedTemplate = templates.find((template) => template.fileName === currentName) || templates[0] || null;
    return `
      <div style="display:inline-flex;align-items:center;gap:6px;">
        <select data-xml-cii-linelist-template ${templates.length ? '' : 'disabled'} title="Saved line-list column mapping templates">
          ${templates.length ? templates.map((template) => `
            <option value="${_escAttr(template.fileName)}" ${selectedTemplate?.fileName === template.fileName ? 'selected' : ''}>
              ${_esc(template.fileName)}
            </option>
          `).join('') : '<option value="">No mapped rows saved</option>'}
        </select>
        <button type="button" class="model-converters-download-btn" data-xml-cii-use-linelist-template ${templates.length ? '' : 'disabled'}>Use mapped Row</button>
      </div>`;
  }

  function xmlCiiRenderLineListMappingTemplatesPanel() {
    const templates = xmlCiiLineListMappingTemplateRows();
    return `
      <section class="model-converters-workflow-override-section">
        <div class="model-converters-workflow-master-head">
          <div>
            <div class="model-converters-workflow-detail-title">Saving Column Mapping</div>
            <div class="model-converters-workflow-detail-text">Line list column mappings saved by file name after Save Mapped Rows.</div>
          </div>
          <div class="model-converters-workflow-count">${templates.length} template(s)</div>
        </div>
        <div class="model-converters-workflow-table-wrap">
          <table class="model-converters-workflow-table">
            <thead>
              <tr>
                <th>Line list File name</th>
                <th>Mapped Fields</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              ${templates.length ? templates.map((template) => `
                <tr>
                  <td>${_esc(template.fileName)}</td>
                  <td>${_esc(String(template.mappedFieldCount || xmlCiiMappingFieldCount(template.fieldMap)))}</td>
                  <td>${_esc(template.updatedAt || '')}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="3" class="model-converters-workflow-empty">No saved line-list mapping templates.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function xmlCiiRenderMasterRowsPanel(masterKey, config) {
    const masterDef = XML_CII_MASTER_DEFS[masterKey];
    const local = xmlCiiLocalMasterState(masterKey);
    const savedRows = _xmlCiiMasterRowsFromConfig(config, masterDef);
    const savedFieldMap = _xmlCiiMasterFieldMapFromConfig(config, masterDef);
    const fieldMap = Object.keys(local.fieldMap || {}).length ? local.fieldMap : savedFieldMap;
    const rawHeaders = _xmlCiiHeadersFromRows(local.rawRows).filter((header) => header !== '_raw' && header !== '_rowIndex');
    const previewRows = local.rawRows.length ? _xmlCiiMapRowsWithFieldMap(local.rawRows, fieldMap, masterKey) : [];
    const rowsForSavedPanel = savedRows.length ? savedRows : previewRows;

    return `
      <div class="model-converters-workflow-master-card">
        <div class="model-converters-workflow-master-head">
          <div>
            <div class="model-converters-workflow-detail-title">${_esc(masterDef.title)}</div>
            <div class="model-converters-workflow-detail-text">${_esc(masterDef.description)}</div>
          </div>
          <div class="model-converters-workflow-count">${savedRows.length} saved row(s)</div>
        </div>

        ${masterKey === 'pipingClass' ? xmlCiiRenderPipingClassIndexPathPanel(config) : ''}

        <div class="model-converters-workflow-toolbar">
          <label class="model-converters-download-btn">
            Import CSV/XLSX/JSON
            <input hidden type="file" accept=".csv,.tsv,.txt,.json,.xlsx,.xlsm,.xlsb,.xls,.ods,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" data-xml-cii-import-master="${_esc(masterKey)}">
          </label>
          <button type="button" class="model-converters-download-btn" data-xml-cii-load-default="${_esc(masterKey)}" ${masterDef.defaultUrl ? '' : 'disabled'}>Load Default</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-auto-map="${_esc(masterKey)}" ${local.rawRows.length ? '' : 'disabled'}>Auto Map Fields</button>
          ${masterKey === 'linelist' ? `
            <button type="button" class="model-converters-download-btn" data-xml-cii-dynamic-map="${_esc(masterKey)}" ${local.rawRows.length ? '' : 'disabled'}>Dynamic mapped Fields</button>
            ${xmlCiiRenderLineListMappingTemplateControls(local)}
          ` : ''}
          <button type="button" class="model-converters-run-btn" data-xml-cii-save-master="${_esc(masterKey)}" ${local.rawRows.length ? '' : 'disabled'}>Save Mapped Rows</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-clear-master="${_esc(masterKey)}" ${savedRows.length || local.rawRows.length ? '' : 'disabled'}>Clear</button>
        </div>

        ${local.sheetNames.length > 1 ? `
          <label class="model-converters-workflow-sheet">
            <span>Workbook Sheet</span>
            <select data-xml-cii-sheet="${_esc(masterKey)}">
              ${local.sheetNames.map((sheetName) => `
                <option value="${_escAttr(sheetName)}" ${local.selectedSheet === sheetName ? 'selected' : ''}>${_esc(sheetName)}</option>
              `).join('')}
            </select>
          </label>
        ` : ''}

        ${xmlCiiMasterIssueHtml(savedRows, fieldMap, masterDef)}

        ${rawHeaders.length ? `
          <div class="model-converters-workflow-section-title">Column Mapping</div>
          <div class="model-converters-workflow-map-grid">${xmlCiiMappingHeaderHtml(rawHeaders, fieldMap, masterDef)}</div>
          ${masterKey === 'linelist' ? xmlCiiRenderLineKeyMappingHtml(rawHeaders, fieldMap, masterDef) : ''}
        ` : `
          <div class="model-converters-workflow-empty">
            Import a master file here. This is the XML->CII equivalent of the legacy Master Data tab.
          </div>
        `}

        ${masterKey === 'linelist' ? xmlCiiRenderLineListRegexPanel(config) : ''}

        <div class="model-converters-workflow-split">
          <section>
            <div class="model-converters-workflow-section-title">Imported Preview</div>
            ${_xmlCiiRowsToTableHtml(local.rawRows, 80)}
          </section>
          <section>
            <div class="model-converters-workflow-section-title">Saved / Mapped Rows</div>
            ${_xmlCiiRowsToTableHtml(rowsForSavedPanel, 120, fieldMap)}
          </section>
        </div>
      </div>
    `;
  }

  function xmlCiiRenderOverridesPanel(config) {
    const overrides = xmlCiiEnsureOverrides(config);
    const inputClass = 'model-converters-workflow-override-input';
    const renderRows = (key, leftLabel, rightLabel) => {
      const entries = Object.entries(overrides[key] || {});
      return `
        <section class="model-converters-workflow-override-section">
          <div class="model-converters-workflow-master-head">
            <div>
              <div class="model-converters-workflow-detail-title">${_esc(leftLabel)} Overrides</div>
              <div class="model-converters-workflow-detail-text">Manual entries take precedence over regex, master, and approximate matching.</div>
            </div>
            <button type="button" class="model-converters-download-btn" data-xml-cii-override-add="${_esc(key)}">Add Override</button>
          </div>
          <div class="model-converters-workflow-table-wrap">
            <table class="model-converters-workflow-table">
              <thead>
                <tr>
                  <th>${_esc(leftLabel)}</th>
                  <th>${_esc(rightLabel)}</th>
                  <th class="model-converters-workflow-action-col"></th>
                </tr>
              </thead>
              <tbody>
                ${entries.length ? entries.map(([source, target], index) => `
                  <tr data-xml-cii-override-row="${_esc(key)}">
                    <td><input class="${inputClass}" data-xml-cii-override-key="${_esc(key)}" data-xml-cii-override-index="${index}" data-xml-cii-override-part="source" value="${_esc(source)}"></td>
                    <td><input class="${inputClass}" data-xml-cii-override-key="${_esc(key)}" data-xml-cii-override-index="${index}" data-xml-cii-override-part="target" value="${_esc(target)}"></td>
                    <td><button type="button" class="model-converters-download-btn model-converters-workflow-icon-btn" data-xml-cii-override-del="${_esc(key)}:${index}">x</button></td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="3" class="model-converters-workflow-empty">No overrides added.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>
      `;
    };

    return `
      <div class="model-converters-workflow-master-card">
        <div class="model-converters-workflow-master-head">
          <div>
            <div class="model-converters-workflow-detail-title">Manual Override/Mapped default templates</div>
            <div class="model-converters-workflow-detail-text">
              Saved into supportConfigJson.overrides so XML->CII can run standalone with the same highest-precedence corrections.
            </div>
          </div>
          <div class="model-converters-workflow-count">
            ${Object.keys(overrides.pipingClass || {}).length + Object.keys(overrides.material || {}).length} override(s)
          </div>
        </div>
        ${renderRows('pipingClass', 'Derived Class', 'Mapped Class')}
        ${renderRows('material', 'Material Name', 'Code')}
        ${xmlCiiRenderLineListMappingTemplatesPanel()}
      </div>
    `;
  }

  function xmlCiiRenderImportMastersPhase(rootEl) {
    const values = activeValues();
    const config = _parseXmlCiiEnrichmentConfig(values.supportConfigJson);
    const activeTab = xmlCiiActiveWorkflowTab(rootEl);
    const activeMaster = xmlCiiActiveMasterKey(rootEl);
    const overrides = xmlCiiEnsureOverrides(config);
    const overrideCount = Object.keys(overrides.pipingClass || {}).length + Object.keys(overrides.material || {}).length;
    const templateCount = xmlCiiLineListMappingTemplateRows().length;
    const summary = XML_CII_MASTER_ORDER.map((masterKey) => {
      const masterDef = XML_CII_MASTER_DEFS[masterKey];
      const local = xmlCiiLocalMasterState(masterKey);
      const rows = _xmlCiiMasterRowsFromConfig(config, masterDef).length || local.rawRows.length;
      const empty = masterKey === 'pipingClass' ? rows <= 1 : rows === 0;
      return {
        masterKey,
        rows: empty ? 0 : rows,
        empty,
      };
    });

    return `
      <div class="model-converters-workflow-detail-title">1 Import Masters</div>
      <div class="model-converters-workflow-detail-text">
        Load masters here. Rows are saved into the XML->CII config JSON so the converter can become standalone.
      </div>
      ${xmlCiiRenderSpecwiseMasterPathsPanel(config)}
      <div class="model-converters-workflow-master-tabs">
        ${summary.map((entry) => `
          <button type="button" class="model-converters-workflow-master-tab ${entry.masterKey === activeTab ? 'is-active' : ''}${entry.empty ? ' is-empty' : ''}" data-xml-cii-master-tab="${_esc(entry.masterKey)}">
            <span>${_esc(XML_CII_MASTER_DEFS[entry.masterKey].title)}</span>
            <small>${entry.rows === 0 ? '⚠ no data' : `${entry.rows} row(s)`}</small>
          </button>
        `).join('')}
        <button type="button" class="model-converters-workflow-master-tab ${activeTab === 'overrides' ? 'is-active' : ''}" data-xml-cii-master-tab="overrides">
          <span>Manual Override/Mapped default templates</span>
          <small>${overrideCount} override(s), ${templateCount} template(s)</small>
        </button>
      </div>
      ${activeTab === 'overrides' ? xmlCiiRenderOverridesPanel(config) : xmlCiiRenderMasterRowsPanel(activeMaster, config)}
    `;
  }

  // -------------------------------------------------------------------------
  // 3 Run Phase
  // -------------------------------------------------------------------------
  function xmlCiiRenderRunPhase() {
    const config = xmlCiiConfigWithLoadedMasterRows('XML->CII run-phase');
    const missingMasters = missingPersistedXmlCiiMasters(config);
    const blockedNotice = missingPersistedXmlCiiMastersNotice(missingMasters);
    const values = activeValues();
    const linelistRows = Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows.length : 0;
    const pcRows = Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows.length : 0;
    const matRows = Array.isArray(config.material?.mapRows) ? config.material.mapRows.length : 0;
    const weightRows = Array.isArray(config.weight?.masterRows) ? config.weight.masterRows.length : 0;
    const sampleBranch = _toText(config.linelist?.sampleBranchName || '/ASIM-1885-10"-S8810101-91261M7-HC/B1');
    const lineKey = _deriveBranchLineKey(sampleBranch, config);
    const coordsMode = _toText(values.coordsMode || 'first');
    const createEnriched = !!values.createEnrichedXml;
    const kgToNewton = values.kgToNewton !== false;
    const statusIcon = (n, label, isPc = false) => {
      const ok = isPc ? n > 1 : n > 0;
      return `
      <div class="model-converters-workflow-run-status-row">
        <span class="model-converters-workflow-run-status-icon ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '⚠'}</span>
        <span>${_esc(label)}</span>
        <strong>${ok ? `${n} row(s)` : 'not loaded'}</strong>
      </div>`;
    };
    return `
      <div class="model-converters-workflow-detail-title">5 Run</div>
      ${blockedNotice ? `<div role="alert" data-xml-cii-missing-masters style="color:#ffb4b4;padding:12px;border:1px solid #b84c4c;">${_esc(blockedNotice)}</div>` : ''}
      <div class="model-converters-workflow-detail-text">
        Run the conversion — generates enriched XML and final CII output.
      </div>
      <div class="model-converters-workflow-master-card">
        <div class="model-converters-workflow-section-title">Readiness</div>
        ${statusIcon(linelistRows, 'Line List')}
        ${statusIcon(pcRows, 'Piping Class Master', true)}
        ${statusIcon(matRows, 'Material Map')}
        ${statusIcon(weightRows, 'Valve Weights')}
        <div class="model-converters-workflow-run-status-row" style="margin-top:8px;">
          <span class="model-converters-workflow-run-status-icon ${lineKey ? 'ok' : 'warn'}">${lineKey ? '✓' : '⚠'}</span>
          <span>Sample line key from <code>${_esc(sampleBranch)}</code></span>
          <strong>${_esc(lineKey || '(no key derived)')}</strong>
        </div>
      </div>
      <div class="model-converters-workflow-master-card">
        <div class="model-converters-workflow-section-title">Run Options</div>
        <div class="model-converters-workflow-regex-grid">
          <label class="model-converters-workflow-regex-field">
            <span>Coords Mode</span>
            <select data-xml-cii-run-option="coordsMode">
              ${['first','all','none'].map((opt) => `<option value="${opt}" ${coordsMode === opt ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
          </label>
          <label class="model-converters-workflow-map-field" style="flex-direction:row;align-items:center;gap:8px;">
            <input type="checkbox" data-xml-cii-run-option="createEnrichedXml" ${createEnriched ? 'checked' : ''}>
            <span>Create enriched XML before CII</span>
          </label>
          <label class="model-converters-workflow-map-field" style="flex-direction:row;align-items:center;gap:8px;">
            <input type="checkbox" data-xml-cii-run-option="kgToNewton" ${kgToNewton ? 'checked' : ''}>
            <span>kg → N weight conversion (×10)</span>
          </label>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-direction:column;">
        <button type="button" class="model-converters-run-btn" data-xml-cii-run-from-workflow style="width:100%;padding:12px;" ${missingMasters.length ? 'disabled' : ''}>
          ▶ Run — Review Weight Matches
        </button>
        <div class="model-converters-workflow-detail-note">Opens <strong>4A Weight Match</strong> to review approximate weights, then Finalize and Run.</div>
        <button type="button" class="model-converters-download-btn" data-xml-cii-finalize-run style="width:100%;padding:12px;" ${missingMasters.length ? 'disabled' : ''}>
          Finalise and Run
        </button>
      </div>
    `;
  }

  function bindXmlCiiRunPhase(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-xml-cii-run-option]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.getAttribute('data-xml-cii-run-option') || '';
        const values = activeValues();
        if (el.type === 'checkbox') values[key] = el.checked;
        else values[key] = el.value;
        persist();
        renderAdvanced();
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-run-from-workflow]').forEach((btn) => {
      btn.addEventListener('click', () => {
        rootEl.dataset.selectedPhase = 'weight-match';
        xmlCiiRenderWorkflowRoot(rootEl, xmlCiiWorkflowDetailForRoot(rootEl));
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-finalize-run]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const _capturedFile = primaryInputEl?.files?.[0] || primaryFile;
        const _capturedConfig = xmlCiiConfigWithLoadedMasterRows('XML->CII finalise preflight');
        const missing = missingPersistedXmlCiiMasters(_capturedConfig);
        if (missing.length) {
          const message = missingPersistedXmlCiiMastersNotice(missing);
          notify({ level: 'error', title: 'XML->CII Run blocked', message });
          setStatus(message, 'bad');
          return;
        }
        // Close the workflow UI before showing the validator popup
        xmlCiiCloseWorkflowPopup();
        const triggerRun = () => {
          window['__xmlCiiConversionWorkflowAllowDirectRun'] = true;
          setTimeout(() => { window['__xmlCiiConversionWorkflowAllowDirectRun'] = false; }, 0);
          runBtnEl?.click();
        };
        // Run validator (dryRun) — actual conversion fires only from onClose / onNoIssues
        await runXmlCiiStandalonePostRunValidation({
          xmlFile: _capturedFile,
          resolveStagedJsonText: (cfg) => xmlCiiCurrentStagedJsonSource(cfg || _capturedConfig),
          config: _capturedConfig,
          enrichXmlForCii2019: async (xmlText, jsonText, opts) => {
            const vals = activeValues();
            return _enrichXmlForCii2019(xmlText, jsonText, { ...vals, supportConfigJson: JSON.stringify(_capturedConfig), dryRun: true, ...opts });
          },
          onClose: triggerRun,
          onNoIssues: triggerRun,
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // 4A Weight Match Phase — review approximate component weights, then run
  // -------------------------------------------------------------------------
  function xmlCiiRenderWeightMatchPhase() {
    return xmlCiiRenderWeightMatchPhaseImported();
  }

  function bindXmlCiiWeightMatchPhase(detailEl, rootEl) {
    const values = activeValues();
    const config = _parseXmlCiiEnrichmentConfig(values.supportConfigJson);
    bindXmlCiiWeightMatchPhaseImported(detailEl, {
      xmlFile: primaryInputEl?.files?.[0] || primaryFile,
      stagedJsonText: (secondaryFile ? null : (values.stagedAttributesJson || '')),
      resolveStagedJsonText: (nextConfig) => xmlCiiCurrentStagedJsonSource(nextConfig || config),
      config,
      enrichXmlForCii2019: async (xmlText, stagedJsonText, options) => {
        const source = _toText(stagedJsonText).trim() ? { text: stagedJsonText } : await xmlCiiCurrentStagedJsonSource(config);
        const text = source.text || '';
        const vals = activeValues();
        return _enrichXmlForCii2019(xmlText, text, { ...vals, supportConfigJson: JSON.stringify(config), dryRun: true });
      },
      onSaveConfig: (newCfg) => xmlCiiSaveConfig(newCfg),
      ensureOverrides: xmlCiiEnsureOverrides,
      onFinalize: () => {
        xmlCiiCloseWorkflowPopup();
        window['__xmlCiiConversionWorkflowAllowDirectRun'] = true;
        setTimeout(() => { window['__xmlCiiConversionWorkflowAllowDirectRun'] = false; }, 0);
        runBtnEl?.click();
      }
    });
  }

  // -------------------------------------------------------------------------
  // 4 Preview Phase — dry-run enrichment per branch
  // -------------------------------------------------------------------------

  // Module-level preview cache
  let xmlCiiPreviewCache = null; // { xmlFileName, configHash, rows, nodeRows }




  function xmlCiiRenderPreviewPhase(rootEl) {
    const xmlFile = primaryInputEl?.files?.[0] || primaryFile;
    const config = xmlCiiConfigWithLoadedMasterRows('XML->CII preview');
    return xmlCiiRenderPreviewPhaseImported(xmlFile, config);
  }

  function bindXmlCiiPreviewPhase(rootEl) {
    if (!rootEl) return;
    xmlCiiBuildAndRenderPreview(rootEl);
  }

  async function xmlCiiBuildAndRenderPreview(rootEl) {
    const findHost = () => rootEl?.querySelector('#mc-preview-table-host');
    const showHostMessage = (msg) => {
      const h = findHost();
      if (h) h.innerHTML = `<div class="model-converters-workflow-detail-note">${msg}</div>`;
    };
    const xmlFile = primaryInputEl?.files?.[0] || primaryFile;
    if (!xmlFile) {
      showHostMessage('⚠ Load an XML file in the sidebar first, then return here to preview enrichment.');
      return;
    }
    try {
      const xmlText = await xmlFile.text();
      const config = xmlCiiConfigWithLoadedMasterRows('XML->CII preview');
      const stagedSource = await xmlCiiCurrentStagedJsonSource(config);
      await xmlCiiBuildAndRenderPreviewImported(rootEl, xmlText, config, {
        onSaveConfig: (newCfg) => xmlCiiSaveConfig(newCfg),
        openOverridePopup: _xmlCiiOpenPreviewOverridePopup,
        ensureOverrides: xmlCiiEnsureOverrides,
        stagedJsonText: stagedSource.text,
        stagedSourceLabel: stagedSource.label,
        resolveStagedJsonText: (nextConfig) => xmlCiiCurrentStagedJsonSource(nextConfig),
      });
    } catch (err) {
      console.error('[XML->CII preview]', err);
      showHostMessage(`⚠ Preview failed: ${_esc(String(err?.message || err))}`);
    }
  }

  // The unified popup owns a separate connected render root. Route ONLY this
  // path through the optimized adapted v7 wrapper, never the old pv-cache-v5
  // renderer. The retired inline shell retains its current implementation.
  async function xmlCiiInitializePopupPreviewV7(target) {
    const host = target?.querySelector?.('#mc-preview-table-host');
    if (!host) return;
    const xmlFile = xmlCiiCurrentPrimaryFile();
    if (!xmlFile) return;
    try {
      const xmlText = await xmlFile.text();
      if (!target.isConnected || target.querySelector('#mc-preview-table-host') !== host) return;
      const config = xmlCiiConfigWithLoadedMasterRows('XML->CII popup v7 preview');
      await xmlCiiBuildAndRenderPreviewV7(target, xmlText, config, {
        onSaveConfig: (newConfig, source = {}) => xmlCiiSaveConfig(newConfig, {
          compact: true, background: source.fetchRating === true,
        }),
        onStageRatingOverrides: (newConfig) => stageXmlCiiFetchedRatings(newConfig.overrides),
        openOverridePopup: _xmlCiiOpenPreviewOverridePopup,
        ensureOverrides: xmlCiiEnsureOverrides,
        resolveStagedJsonText: (nextConfig) => xmlCiiCurrentStagedJsonSource(nextConfig),
      });
    } catch (error) {
      if (target.isConnected && target.querySelector('#mc-preview-table-host') === host) {
        host.textContent = 'Preview initialization failed: ' + String(error?.message || error);
      }
    }
  }

  function _xmlCiiOpenPreviewOverridePopup({ editType, derivedKey, currentVal, config, onSave }) {
    const title = editType === 'pipingClass' ? 'Piping Class Override' : 'Material Code Override';
    const label = editType === 'pipingClass' ? 'Derived class' : 'Material name';
    // Gather candidates for piping class
    let candidatesHtml = '';
    if (editType === 'pipingClass') {
      const classes = _xmlCiiKnownClasses(config);
      const candidates = classes.slice(0, 8).map((c) => `<option>${_esc(c)}</option>`).join('');
      if (candidates) candidatesHtml = `<label style="display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:12px;color:#9cc5ff;">
        Known classes (select to fill):
        <select style="background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:6px;" id="mc-ov-pick"><option value="">— pick —</option>${candidates}</select>
      </label>`;
    }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)';
    overlay.innerHTML = `
      <div style="width:min(440px,92vw);background:#0f1724;border:1px solid #2c3a4f;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:12px;">
        <div style="color:#9cc5ff;font-weight:700;font-size:15px;">${_esc(title)}</div>
        <div style="font-size:12px;color:#9aa8ba;">${_esc(label)}: <strong style="color:#d7e6ff;">${_esc(derivedKey)}</strong></div>
        ${candidatesHtml}
        <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#9cc5ff;">
          Override value:
          <input id="mc-ov-input" type="text" value="${_esc(currentVal)}"
            style="background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-size:13px;">
        </label>
        <div style="color:#7a9fc2;font-size:11px;">Overrides take priority over regex and fuzzy matching in both preview and real conversion.</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="mc-ov-cancel" type="button" class="model-converters-download-btn">Cancel</button>
          <button id="mc-ov-save" type="button" class="model-converters-run-btn">Save Override →</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#mc-ov-input');
    const picker = overlay.querySelector('#mc-ov-pick');
    if (picker) picker.addEventListener('change', () => { if (picker.value) input.value = picker.value; });
    overlay.querySelector('#mc-ov-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#mc-ov-save').addEventListener('click', () => {
      const val = _toText(input.value).trim();
      overlay.remove();
      if (val) onSave(val);
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    input.focus();
  }

  function _openXmlCiiZeroRigidWeightPopup(issues) {
    const rows = Array.isArray(issues) ? issues : [];
    if (!rows.length) return Promise.resolve({ cancelled: false, skipped: false, weightsByKey: {} });
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'model-converters-workflow-popup-overlay mc-rigid-review-overlay';
      const rowHtml = rows.map((issue, index) => {
        const best = issue.candidates?.[0] || null;
        const candidates = (issue.candidates || []).map((candidate) => {
          const value = candidate.suggestedWeight ?? candidate.weight;
          return `
          <button type="button" class="mc-rigid-review-candidate${candidate.preferred ? ' best' : ''}"
            data-rigid-review-candidate="${index}"
            data-rigid-review-weight="${_escAttr(value)}"
            title="${_escAttr(`${candidate.preferred ? 'Preferred (exact bore+rating, length-scaled) · ' : ''}Bore ${candidate.rowBore} | Rating ${candidate.rowRating || '-'} | Master length ${candidate.rowLength.toFixed(1)} | Score ${Math.round(candidate.score * 100)}%`)}">
            ${candidate.preferred ? '★ ' : ''}${_esc(value)} kg · ${Math.round(candidate.score * 100)}%
          </button>`;
        }).join('');
        return `
          <tr>
            <td class="mc-rigid-review-branch" title="${_escAttr(issue.branchName)}">${_esc(issue.branchName)}</td>
            <td>${_esc(issue.boreMm == null ? '' : `${Number(issue.boreMm).toFixed(0)} mm`)}</td>
            <td>${_esc(issue.rating || '')}</td>
            <td>${_esc(issue.nodeNumber)}</td>
            <td class="mc-rigid-review-dtxr" title="${_escAttr(issue.stagedMatchMethod || '')}">${_esc(issue.dtxr || issue.stagedName || 'Not found')}</td>
            <td>${_esc(issue.lengthMm == null ? '' : `${Number(issue.lengthMm).toFixed(1)} mm`)}</td>
            <td>
              <input type="number" min="0" step="0.001" class="mc-rigid-review-input"
                data-rigid-review-key="${_escAttr(issue.key)}"
                value="${_escAttr(best ? (best.suggestedWeight ?? best.weight) : '')}"
                placeholder="kg">
            </td>
            <td class="mc-rigid-review-candidates">${candidates || '<span class="model-converters-muted">No suggestion</span>'}</td>
          </tr>
        `;
      }).join('');
      overlay.innerHTML = `
        <div class="mc-rigid-review-dialog" role="dialog" aria-modal="true" aria-label="Rigid zero weight review">
          <div class="mc-rigid-review-head">
            <div>
              <div class="mc-rigid-review-title">Rigid Weights Need Review</div>
              <div class="mc-rigid-review-subtitle">${rows.length} rigid node(s) have zero weight and length greater than 1 mm.</div>
            </div>
            <button type="button" class="model-converters-download-btn" data-rigid-review-cancel>Cancel</button>
          </div>
          <div class="mc-rigid-review-body">
            <div class="mc-rigid-review-note">
              Enter missing weights before conversion. Suggestions are ranked from the weight master using bore, rating, and length.
              DTXR is matched from staged JSON by PS tag first, then coordinates.
            </div>
            <div class="mc-rigid-review-table-wrap">
              <table class="mc-rigid-review-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Bore</th>
                    <th>Rating</th>
                    <th>Node</th>
                    <th>DTXR</th>
                    <th>Length</th>
                    <th>Manual Weight</th>
                    <th>Nearest Suggestions</th>
                  </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
              </table>
            </div>
            <div class="mc-rigid-review-status" data-rigid-review-status></div>
          </div>
          <div class="mc-rigid-review-actions">
            <button type="button" class="model-converters-download-btn" data-rigid-review-fill-best>Use All Suggestions</button>
            <button type="button" class="model-converters-download-btn" data-rigid-review-skip>Skip Review</button>
            <button type="button" class="model-converters-run-btn" data-rigid-review-apply>Apply Weights and Continue</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const finish = (result) => {
        overlay.remove();
        resolve(result);
      };
      const status = overlay.querySelector('[data-rigid-review-status]');
      const setStatus = (text, bad) => {
        if (!status) return;
        status.textContent = text;
        status.classList.toggle('bad', !!bad);
      };
      overlay.querySelectorAll('[data-rigid-review-candidate]').forEach((button) => {
        button.addEventListener('click', () => {
          const rowIndex = Number(button.getAttribute('data-rigid-review-candidate'));
          const input = overlay.querySelectorAll('.mc-rigid-review-input')[rowIndex];
          if (input) input.value = button.getAttribute('data-rigid-review-weight') || '';
        });
      });
      overlay.querySelector('[data-rigid-review-fill-best]')?.addEventListener('click', () => {
        rows.forEach((issue, index) => {
          const best = issue.candidates?.[0] || null;
          const input = overlay.querySelectorAll('.mc-rigid-review-input')[index];
          if (input && best) input.value = best.suggestedWeight ?? best.weight;
        });
        setStatus('Filled available best suggestions. Review values before applying.', false);
      });
      overlay.querySelector('[data-rigid-review-cancel]')?.addEventListener('click', () => finish({ cancelled: true, skipped: false, weightsByKey: {} }));
      overlay.querySelector('[data-rigid-review-skip]')?.addEventListener('click', () => finish({ cancelled: false, skipped: true, weightsByKey: {} }));
      overlay.querySelector('[data-rigid-review-apply]')?.addEventListener('click', () => {
        const weightsByKey = {};
        const missing = [];
        overlay.querySelectorAll('.mc-rigid-review-input').forEach((input) => {
          const key = input.getAttribute('data-rigid-review-key') || '';
          const numeric = Number(input.value);
          if (!Number.isFinite(numeric) || numeric <= 0) {
            missing.push(key);
            input.classList.add('bad');
            return;
          }
          input.classList.remove('bad');
          weightsByKey[key] = numeric;
        });
        if (missing.length) {
          setStatus('Enter a positive weight for every listed rigid, or use Skip Review.', true);
          return;
        }
        finish({ cancelled: false, skipped: false, weightsByKey });
      });
    });
  }


  function xmlCiiRenderActiveWorkflow() {

    if (xmlCiiWorkflowPopupEl && xmlCiiWorkflowPopupDetailEl) {
      xmlCiiRenderWorkflowRoot(xmlCiiWorkflowPopupEl, xmlCiiWorkflowPopupDetailEl);
      return;
    }
    renderXmlCiiWorkflowShell();
  }

  async function xmlCiiLoadRowsIntoMaster(masterKey, readResult, sourceName) {
    const masterDef = XML_CII_MASTER_DEFS[masterKey];
    const local = xmlCiiLocalMasterState(masterKey);
    local.rawRows = readResult.rows || [];
    local.sheetNames = readResult.sheetNames || [];
    local.selectedSheet = readResult.selectedSheet || '';
    local.sheets = readResult.sheets || {};
    local.sourceName = sourceName;
    if (masterKey === 'linelist') {
      const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
      local.fieldMap = _detectLineListFieldMap(local.rawRows, local.fieldMap, config);
    } else {
      local.fieldMap = _xmlCiiAutoMapFields(_xmlCiiHeadersFromRows(local.rawRows), masterDef, local.rawRows);
    }
    xmlCiiRenderActiveWorkflow();
  }

  // Shared selection for the legacy shell and the active popup.
  function xmlCiiSelectMasterSheet(masterKey, sheetName) {
    const local = xmlCiiLocalMasterState(masterKey);
    const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
    selectXmlCiiMasterWorkbookSheet({
      masterKey, local, sheetName, config,
      detectLineListFieldMap: _detectLineListFieldMap,
      autoMapFields: _xmlCiiAutoMapFields,
      headersFromRows: _xmlCiiHeadersFromRows,
      masterDef: XML_CII_MASTER_DEFS[masterKey],
    });
    if (local.rawRows.length) xmlCiiSaveMasterRows(masterKey);
    return local;
  }

  function xmlCiiSaveDynamicMappedFields(masterKey) {
    if (masterKey !== 'linelist') return;
    const local = xmlCiiLocalMasterState('linelist');
    const fieldMap = local.fieldMap || {};
    const rawRows = local.rawRows || [];
    if (!rawRows.length) return;
    const activeVal = activeValues();
    const config = _parseXmlCiiEnrichmentConfig(activeVal.supportConfigJson);
    if (!config.customMappingAliases) {
      config.customMappingAliases = {};
    }
    for (const [field, header] of Object.entries(fieldMap)) {
      if (!header) {
        delete config.customMappingAliases[field];
        continue;
      }
      let aliasVal = String(header).trim();
      if (aliasVal.startsWith('__EMPTY')) {
        const firstRowVal = rawRows[0]?.[header];
        if (firstRowVal !== undefined && firstRowVal !== null && String(firstRowVal).trim() !== '') {
          aliasVal = String(firstRowVal).trim();
        }
      }
      config.customMappingAliases[field] = aliasVal;
    }
    activeVal.supportConfigJson = JSON.stringify(config, null, 2);
    xmlCiiSaveConfig(config);
  }

  function xmlCiiSaveMasterRows(masterKey, options) {
    const masterDef = XML_CII_MASTER_DEFS[masterKey];
    const local = xmlCiiLocalMasterState(masterKey);
    const rows = _xmlCiiMapRowsWithFieldMap(local.rawRows, local.fieldMap, masterKey);
    const saveMappingTemplate = options?.saveMappingTemplate === true;

    if (masterKey === 'linelist') {
      const activeVal = activeValues();
      const config = _parseXmlCiiEnrichmentConfig(activeVal.supportConfigJson);
      const overrides = xmlCiiEnsureOverrides(config);
      if (!overrides.processData) overrides.processData = {};
      
      let updated = false;
      for (const row of rows) {
        const key = (row.lineNo || '').trim();
        if (key && row.hydroPressure !== undefined) {
          const val = String(row.hydroPressure).trim();
          if (val) {
            if (!overrides.processData[key]) overrides.processData[key] = {};
            if (overrides.processData[key].hydroPressure !== val) {
              overrides.processData[key].hydroPressure = val;
              updated = true;
            }
          }
        }
      }
      if (updated) {
        activeVal.supportConfigJson = JSON.stringify(config, null, 2);
      }

      // Save last loaded line list to localStorage
      try {
        const dataToSave = {
          rawRows: local.rawRows,
          fieldMap: local.fieldMap,
          sheetNames: local.sheetNames,
          selectedSheet: local.selectedSheet,
          sheets: local.sheets,
          sourceName: local.sourceName,
        };
        window.localStorage.setItem('model-converters.last-linelist.v1', JSON.stringify(dataToSave));
      } catch (err) {
        console.warn('Failed to save last loaded line list to localStorage:', err);
      }

      if (saveMappingTemplate) {
        const template = xmlCiiSaveLineListMappingTemplate();
        if (template) {
          notify({ level: 'success', title: 'Line List Mapping', message: `Saved column mapping template for ${template.fileName}.` });
        }
      }
    }

    _xmlCiiSaveMasterToConfig(activeValues(), masterDef, rows, local.fieldMap);
    _xmlCiiSyncConfigTextarea();
    xmlCiiPersistLargeConfigChange(masterDef.title);
    xmlCiiRenderAdvancedWhenConfigFits();
    xmlCiiRenderActiveWorkflow();
  }

  function xmlCiiClearMasterRows(masterKey) {
    const masterDef = XML_CII_MASTER_DEFS[masterKey];
    const local = xmlCiiLocalMasterState(masterKey);
    local.rawRows = [];
    local.fieldMap = {};
    local.sheetNames = [];
    local.selectedSheet = '';
    local.sheets = {};
    local.sourceName = '';

    if (masterKey === 'linelist') {
      try {
        window.localStorage.removeItem('model-converters.last-linelist.v1');
      } catch (err) {
        console.warn('Failed to remove last loaded line list from localStorage:', err);
      }
    }

    _xmlCiiSaveMasterToConfig(activeValues(), masterDef, [], {});
    _xmlCiiSyncConfigTextarea();
    xmlCiiPersistLargeConfigChange(masterDef.title);
    xmlCiiRenderAdvancedWhenConfigFits();
    xmlCiiRenderActiveWorkflow();
  }

  async function xmlCiiLoadDefaultMaster(masterKey, saveRows) {
    const masterDef = XML_CII_MASTER_DEFS[masterKey];
    if (!masterDef.defaultUrl) return;
    const response = await fetch(masterDef.defaultUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Default master failed to load (${masterDef.defaultUrl}): HTTP ${response.status}`);
    const text = await response.text();
    const rows = masterKey === 'material'
      ? _xmlCiiParseMaterialMapText(text)
      : /\.json($|\?)/i.test(masterDef.defaultUrl)
      ? _xmlCiiParseJsonRows(text)
      : _xmlCiiParseDelimitedText(text);
    await xmlCiiLoadRowsIntoMaster(masterKey, { sheetNames: [], selectedSheet: '', sheets: {}, rows }, masterDef.defaultUrl);
    if (saveRows) xmlCiiSaveMasterRows(masterKey);
  }

  function xmlCiiSaveOverridesFromRoot(rootEl, key) {
    const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
    const overrides = xmlCiiEnsureOverrides(config);
    const nextEntries = {};
    rootEl.querySelectorAll(`[data-xml-cii-override-key="${key}"][data-xml-cii-override-part="source"]`).forEach((sourceInput) => {
      const index = sourceInput.getAttribute('data-xml-cii-override-index') || '';
      const targetInput = rootEl.querySelector(`[data-xml-cii-override-key="${key}"][data-xml-cii-override-index="${index}"][data-xml-cii-override-part="target"]`);
      const source = _toText(sourceInput.value).trim();
      if (source) nextEntries[source] = targetInput ? _toText(targetInput.value).trim() : '';
    });
    overrides[key] = nextEntries;
    xmlCiiSaveConfig(config);
  }

  function bindXmlCiiImportMastersPhase(rootEl) {
    if (!rootEl) return;
    const detailEl = xmlCiiWorkflowDetailForRoot(rootEl);
    const rerender = () => xmlCiiRenderWorkflowRoot(rootEl, detailEl);
    xmlCiiBindSpecwiseMasterPathsPanel(rootEl, rerender);
    xmlCiiScheduleSpecwiseRescan(rootEl, rerender);
    rootEl.querySelectorAll('[data-xml-cii-master-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        rootEl.dataset.activeMaster = button.getAttribute('data-xml-cii-master-tab') || 'linelist';
        rerender();
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-import-master]').forEach((input) => {
      input.addEventListener('change', async () => {
        const masterKey = input.getAttribute('data-xml-cii-import-master') || 'linelist';
        const file = input.files?.[0];
        if (!file) return;
        try {
          const readResult = masterKey === 'material' && /\.(txt|map)$/i.test(file.name || '')
            ? { sheetNames: [], selectedSheet: '', sheets: {}, rows: _xmlCiiParseMaterialMapText(await file.text()) }
            : await _xmlCiiReadMasterFile(file);
          await xmlCiiLoadRowsIntoMaster(masterKey, readResult, file.name);
          xmlCiiSaveMasterRows(masterKey);
          notify({ level: 'success', title: 'XML->CII Masters', message: `Imported ${file.name}.` });
        } catch (error) {
          notify({ level: 'error', title: 'XML->CII Masters', message: _toText(error?.message || error) });
        } finally {
          input.value = '';
        }
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-field-map]').forEach((select) => {
      select.addEventListener('change', () => {
        const masterKey = xmlCiiActiveMasterKey(rootEl);
        const fieldName = select.getAttribute('data-xml-cii-field-map') || '';
        xmlCiiLocalMasterState(masterKey).fieldMap[fieldName] = select.value;
        if (xmlCiiLocalMasterState(masterKey).rawRows.length) xmlCiiSaveMasterRows(masterKey);
        else xmlCiiRenderWorkflowRoot(rootEl, detailEl);
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-auto-map]').forEach((button) => {
      button.addEventListener('click', () => {
        const masterKey = button.getAttribute('data-xml-cii-auto-map') || 'linelist';
        const local = xmlCiiLocalMasterState(masterKey);
        if (masterKey === 'linelist') {
          const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
          local.fieldMap = _detectLineListFieldMap(local.rawRows, local.fieldMap, config);
        } else {
          local.fieldMap = _xmlCiiAutoMapFields(_xmlCiiHeadersFromRows(local.rawRows), XML_CII_MASTER_DEFS[masterKey], local.rawRows);
        }
        if (local.rawRows.length) xmlCiiSaveMasterRows(masterKey);
        else xmlCiiRenderWorkflowRoot(rootEl, detailEl);
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-dynamic-map]').forEach((button) => {
      button.addEventListener('click', () => {
        const masterKey = button.getAttribute('data-xml-cii-dynamic-map') || 'linelist';
        xmlCiiSaveDynamicMappedFields(masterKey);
        notify({ level: 'success', title: 'Dynamic Mapping', message: 'Dynamic mapped fields saved successfully.' });
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-use-linelist-template]').forEach((button) => {
      button.addEventListener('click', () => {
        const select = button.parentElement?.querySelector('[data-xml-cii-linelist-template]');
        try {
          const template = xmlCiiApplyLineListMappingTemplate(select?.value || '');
          notify({ level: 'success', title: 'Line List Mapping', message: `Applied mapped row template for ${template.fileName}.` });
          rerender();
        } catch (error) {
          notify({ level: 'error', title: 'Line List Mapping', message: _toText(error?.message || error) });
        }
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-save-master]').forEach((button) => {
      button.addEventListener('click', () => {
        const masterKey = button.getAttribute('data-xml-cii-save-master') || 'linelist';
        if (masterKey === 'linelist') {
          xmlCiiSaveDynamicMappedFields(masterKey);
        }
        xmlCiiSaveMasterRows(masterKey, { saveMappingTemplate: masterKey === 'linelist' });
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-clear-master]').forEach((button) => {
      button.addEventListener('click', () => xmlCiiClearMasterRows(button.getAttribute('data-xml-cii-clear-master') || 'linelist'));
    });
    rootEl.querySelectorAll('[data-xml-cii-load-default]').forEach((button) => {
      button.addEventListener('click', async () => {
        const masterKey = button.getAttribute('data-xml-cii-load-default') || '';
        try {
          await xmlCiiLoadDefaultMaster(masterKey, true);
          notify({ level: 'success', title: 'XML->CII Masters', message: `Loaded ${XML_CII_MASTER_DEFS[masterKey].title}.` });
        } catch (error) {
          notify({ level: 'error', title: 'XML->CII Masters', message: _toText(error?.message || error) });
        }
      });
    });
    rootEl.querySelectorAll('[data-xml-cii-sheet]').forEach((select) => {
      select.addEventListener('change', () => {
        const masterKey = select.getAttribute('data-xml-cii-sheet') || 'linelist';
        const local = xmlCiiSelectMasterSheet(masterKey, select.value);
        if (!local.rawRows.length) xmlCiiRenderWorkflowRoot(rootEl, detailEl);
      });
    });
    // Override handlers use event delegation (attached once) so they survive DOM
    // re-renders triggered by Add/Delete/tab-switch without needing to rebind.
    if (!rootEl.dataset.xmlCiiOverrideDelegated) {
      rootEl.dataset.xmlCiiOverrideDelegated = 'true';
      rootEl.addEventListener('input', (event) => {
        const inp = event.target.closest('[data-xml-cii-override-key]');
        if (!inp) return;
        xmlCiiSaveOverridesFromRoot(rootEl, inp.getAttribute('data-xml-cii-override-key') || 'material');
      });
      rootEl.addEventListener('click', (event) => {
        const addBtn = event.target.closest('[data-xml-cii-override-add]');
        if (addBtn) {
          const key = addBtn.getAttribute('data-xml-cii-override-add') || 'material';
          const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
          const overrides = xmlCiiEnsureOverrides(config);
          overrides[key] = { ...overrides[key], '': '' };
          xmlCiiSaveConfig(config);
          xmlCiiRenderWorkflowRoot(rootEl, detailEl);
          return;
        }
        const delBtn = event.target.closest('[data-xml-cii-override-del]');
        if (delBtn) {
          const [key, indexText] = (delBtn.getAttribute('data-xml-cii-override-del') || 'material:0').split(':');
          const index = Number(indexText);
          const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
          const overrides = xmlCiiEnsureOverrides(config);
          const entries = Object.entries(overrides[key] || {});
          entries.splice(Number.isFinite(index) ? index : 0, 1);
          overrides[key] = Object.fromEntries(entries);
          xmlCiiSaveConfig(config);
          xmlCiiRenderWorkflowRoot(rootEl, detailEl);
        }
      });
    }
  }

  function bindXmlCiiRegexFields(rootEl) {
    if (!rootEl) return;
    const detailEl = xmlCiiWorkflowDetailForRoot(rootEl);
    if (!detailEl || detailEl.dataset.regexEventsBound === 'true') return;

    const readInputValue = (input) => input.type === 'number'
      ? (Number.isFinite(Number(input.value)) ? Number(input.value) : 0)
      : input.value;

    detailEl.addEventListener('input', (event) => {
      const input = event.target.closest('[data-xml-cii-regex-path]');
      if (!input) return;
      const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
      _setValueAtPath(config, input.getAttribute('data-xml-cii-regex-path') || '', readInputValue(input));
      xmlCiiSaveConfig(config);
    });

    detailEl.addEventListener('change', (event) => {
      const input = event.target.closest('[data-xml-cii-regex-path]');
      if (!input) return;
      const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
      _setValueAtPath(config, input.getAttribute('data-xml-cii-regex-path') || '', readInputValue(input));
      xmlCiiSaveConfig(config);
      xmlCiiRenderWorkflowRoot(rootEl, detailEl);
    });

    detailEl.dataset.regexEventsBound = 'true';
  }

  // Auto-load the regex Sample Branchname from the currently loaded XML file.
  // Derives once per distinct file (tracked via xmlCiiAutoBranchFileKey) so a
  // newly chosen file refreshes the field, while later manual edits are kept.
  // Re-renders the regex phase in-place once the branch is applied.
  function xmlCiiAutoloadBranchFromXml(rootEl, detailEl) {
    const xmlFile = primaryInputEl?.files?.[0] || primaryFile;
    if (!xmlFile) return;
    const fileKey = `${xmlFile.name}|${xmlFile.size}|${xmlFile.lastModified}`;
    if (fileKey === xmlCiiAutoBranchFileKey) return;
    // Mark this file as handled immediately so re-entrant renders don't refetch.
    xmlCiiAutoBranchFileKey = fileKey;
    xmlFile.text().then((xmlText) => {
      const branchName = _extractXmlCiiBranchSample(xmlText);
      if (!branchName) {
        console.warn('[XML->CII] Branch auto-load: no Branchname found in', xmlFile.name);
        return;
      }
      const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
      if (!config.linelist) config.linelist = {};
      if (config.linelist.sampleBranchName === branchName) return;
      config.linelist.sampleBranchName = branchName;
      xmlCiiSaveConfig(config);
      if (rootEl && detailEl && (rootEl.dataset.selectedPhase || 'regex') === 'regex') {
        xmlCiiRenderWorkflowRoot(rootEl, detailEl);
      }
    }).catch((err) => {
      console.warn('[XML->CII] Branch auto-load failed:', err);
      xmlCiiAutoBranchFileKey = '';
    });
  }

  function xmlCiiRenderWorkflowRoot(rootEl, detailEl) {
    if (!rootEl || !detailEl) return;
    const selectedPhaseId = rootEl.dataset.selectedPhase || 'regex';
    const selectedPhase = XML_CII_WORKFLOW_PHASES.find((phase) => phase.id === selectedPhaseId)
      || XML_CII_WORKFLOW_PHASES[0];

    for (const button of rootEl.querySelectorAll('[data-xml-cii-phase]')) {
      const isSelected = button.getAttribute('data-xml-cii-phase') === selectedPhase.id;
      button.classList.toggle('is-active', isSelected);
    }

    if (selectedPhase.id === 'regex') detailEl.innerHTML = xmlCiiRenderRegexPhase();
    else if (selectedPhase.id === 'import-masters' || selectedPhase.id === 'mapping') detailEl.innerHTML = xmlCiiRenderImportMastersPhase(rootEl);
    else if (selectedPhase.id === 'run') detailEl.innerHTML = xmlCiiRenderRunPhase();
    else if (selectedPhase.id === 'weight-match') detailEl.innerHTML = xmlCiiRenderWeightMatchPhase();
    else if (selectedPhase.id === 'preview') detailEl.innerHTML = xmlCiiRenderPreviewPhase(rootEl);
    else if (selectedPhase.id === 'diagnostics') detailEl.innerHTML = xmlCiiRenderDiagnosticsPhase();
    else if (selectedPhase.id === 'support-mapper') detailEl.innerHTML = xmlCiiRenderSupportMapperPhase();
    else if (selectedPhase.id === 'config') detailEl.innerHTML = xmlCiiRenderConfigPhase();
    else detailEl.innerHTML = `<div class="model-converters-workflow-detail-title">${_esc(selectedPhase.label)}</div><div class="model-converters-workflow-detail-text">${_esc(selectedPhase.summary)}</div>`;

    if (selectedPhase.id === 'import-masters' || selectedPhase.id === 'mapping') {
      bindXmlCiiImportMastersPhase(rootEl);
      bindXmlCiiRegexFields(rootEl);
    }
    if (selectedPhase.id === 'regex') {
      bindXmlCiiRegexFields(rootEl);
      xmlCiiAutoloadBranchFromXml(rootEl, detailEl);
    }
    if (selectedPhase.id === 'run') bindXmlCiiRunPhase(rootEl);
    if (selectedPhase.id === 'weight-match') bindXmlCiiWeightMatchPhase(detailEl, rootEl);
    if (selectedPhase.id === 'preview') bindXmlCiiPreviewPhase(rootEl);
    if (selectedPhase.id === 'diagnostics') bindXmlCiiDiagnosticsPhase(detailEl, rootEl);
    if (selectedPhase.id === 'support-mapper') bindXmlCiiSupportMapperPhase(detailEl);
    if (selectedPhase.id === 'config') bindXmlCiiConfigPhase(detailEl);

    if (rootEl.dataset.workflowBound === 'true') return;
    rootEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-xml-cii-phase]');
      if (!button) return;
      rootEl.dataset.selectedPhase = button.getAttribute('data-xml-cii-phase') || 'regex';
      xmlCiiRenderWorkflowRoot(rootEl, detailEl);
    });
    rootEl.dataset.workflowBound = 'true';
  }

  // ---- 5 Regex Test phase ----
  function xmlCiiRenderRegexTestPhase() {
    return `
      <div class="model-converters-workflow-detail-title">5 Regex Test</div>
      <div class="model-converters-workflow-detail-text">Live branch-name regex tester. Changes here save directly to the config.</div>
      <div id="mc-regex-test-host">
        <div class="model-converters-workflow-detail-note" style="text-align:center;padding:18px;">Loading...</div>
      </div>`;
  }

  function bindXmlCiiRegexTestPhase(detailEl) {
    const host = detailEl?.querySelector('#mc-regex-test-host');
    if (!host) return;
    const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
    const parsed = config;
    if (!parsed.linelist || typeof parsed.linelist !== 'object') parsed.linelist = {};
    if (!parsed.rating || typeof parsed.rating !== 'object') parsed.rating = {};
    if (!parsed.weight || typeof parsed.weight !== 'object') parsed.weight = {};
    if (!parsed.regexTester || typeof parsed.regexTester !== 'object') parsed.regexTester = {};
    const inputStyle = 'background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:6px 8px;font-size:12px;width:100%;box-sizing:border-box;';
    const field = (label, key, obj, type = 'text') => `<label style="display:flex;flex-direction:column;gap:5px;color:#9cc5ff;font-size:12px;">
      <span>${_esc(label)}</span>
      <input type="${type}" data-rtest-obj="${_esc(key)}" value="${_esc(_toText(obj[key] ?? ''))}" style="${inputStyle}">
    </label>`;

    const render = () => {
      const sampleBranch = _toText(parsed.regexTester?.sampleBranch || '/LINE-AREA-4-UNIT-150A1/B1');
      const testRegex = (pattern, group) => {
        if (!_toText(pattern).trim()) return '';
        try {
          const m = new RegExp(_toText(pattern), 'i').exec(sampleBranch);
          return _toText(m?.[Number(group) || 0] || '').trim();
        } catch (e) { return `Invalid: ${e.message}`; }
      };
      const classByRegex = testRegex(parsed.rating?.pipingClassRegex, parsed.rating?.pipingClassGroup || 1);
      const boreByRegex = testRegex(parsed.weight?.boreRegex, parsed.weight?.boreGroup || 1);
      const lineByRegex = testRegex(parsed.linelist?.branchNameRegex, parsed.linelist?.lineNoGroup || 1);
      const tokenClass = _tokenAtPosition(sampleBranch, parsed.rating?.tokenDelimiter || '-', parsed.rating?.pipingClassTokenIndex || 5);
      const tokenBore = _tokenAtPosition(sampleBranch, parsed.weight?.tokenDelimiter || '-', parsed.weight?.boreTokenIndex || 3);
      const tokenLine = _xmlCiiLineKeyFromBranchTokens(sampleBranch, parsed);
      const resBadge = (val, fallback) => val
        ? `<span style="color:#5df0a0;font-weight:600;">${_esc(val)}</span>`
        : (fallback ? `<span style="color:#d7e6ff;">${_esc(fallback)}</span> <small style="color:#7a9fc2;">(token fallback)</small>` : `<span style="color:#ff8888;">—</span>`);

      host.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-bottom:14px;">
          <label style="display:flex;flex-direction:column;gap:5px;color:#9cc5ff;font-size:12px;">
            <span>Sample Branchname ✎</span>
            <input id="mc-rt-sample" type="text" value="${_esc(sampleBranch)}" style="${inputStyle}">
          </label>
          ${field('Line No. Regex', 'branchNameRegex', parsed.linelist)}
          ${field('Line No. Group', 'lineNoGroup', parsed.linelist, 'number')}
          ${field('Piping Class Regex', 'pipingClassRegex', parsed.rating)}
          ${field('Piping Class Group', 'pipingClassGroup', parsed.rating, 'number')}
          ${field('Piping Class Token Index', 'pipingClassTokenIndex', parsed.rating, 'number')}
          ${field('Bore Regex', 'boreRegex', parsed.weight)}
          ${field('Bore Group', 'boreGroup', parsed.weight, 'number')}
          ${field('Bore Token Index', 'boreTokenIndex', parsed.weight, 'number')}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr>
            <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Extractor</th>
            <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">From Regex</th>
            <th style="text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;">Token Fallback</th>
          </tr></thead>
          <tbody>
            <tr><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">Line Key</td><td style="padding:6px;border-bottom:1px solid #24354a;">${resBadge(lineByRegex, tokenLine)}</td><td style="padding:6px;border-bottom:1px solid #24354a;color:#9aa8ba;">${_esc(tokenLine)}</td></tr>
            <tr><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">Piping Class</td><td style="padding:6px;border-bottom:1px solid #24354a;">${resBadge(classByRegex, tokenClass)}</td><td style="padding:6px;border-bottom:1px solid #24354a;color:#9aa8ba;">${_esc(tokenClass)}</td></tr>
            <tr><td style="padding:6px;border-bottom:1px solid #24354a;color:#d7e6ff;">Bore</td><td style="padding:6px;border-bottom:1px solid #24354a;">${resBadge(boreByRegex, tokenBore)}</td><td style="padding:6px;border-bottom:1px solid #24354a;color:#9aa8ba;">${_esc(tokenBore)}</td></tr>
          </tbody>
        </table>`;

      // Re-bind after re-render
      host.querySelector('#mc-rt-sample')?.addEventListener('input', (e) => {
        parsed.regexTester = { ...parsed.regexTester, sampleBranch: e.target.value };
        xmlCiiSaveConfig(parsed);
        render();
      });
      host.querySelectorAll('[data-rtest-obj]').forEach((inp) => {
        const [section, key2] = inp.getAttribute('data-rtest-obj').split('.');
        inp.addEventListener('input', (e) => {
          const val = inp.type === 'number' ? Number(e.target.value) : e.target.value;
          if (section === 'rating') parsed.rating[key2 || inp.getAttribute('data-rtest-obj')] = val;
          else if (section === 'weight') parsed.weight[key2 || inp.getAttribute('data-rtest-obj')] = val;
          else if (section === 'linelist') parsed.linelist[key2 || inp.getAttribute('data-rtest-obj')] = val;
          xmlCiiSaveConfig(parsed);
          render();
        });
      });
    };
    // bind input[data-rtest-obj] with section lookup
    // Override field() to embed obj key split correctly
    host.querySelectorAll('[data-rtest-obj]').forEach((inp) => {
      const raw = inp.getAttribute('data-rtest-obj');
      const objMap = { branchNameRegex: parsed.linelist, lineNoGroup: parsed.linelist, pipingClassRegex: parsed.rating, pipingClassGroup: parsed.rating, pipingClassTokenIndex: parsed.rating, boreRegex: parsed.weight, boreGroup: parsed.weight, boreTokenIndex: parsed.weight };
      const target = objMap[raw];
      if (!target) return;
      inp.addEventListener('input', (e) => {
        const val = inp.type === 'number' ? Number(e.target.value) : e.target.value;
        target[raw] = val;
        xmlCiiSaveConfig(parsed);
        render();
      });
    });
    render();
  }

  // ---- 4 Diagnostics phase ----
  // Friendly column order for the single diagnostics table. Columns with no data
  // in the current view are hidden so each category reads cleanly.
  const XML_CII_DIAG_COLUMNS = Object.freeze([
    ['type', 'Category'],
    ['nodeNumber', 'Node'],
    ['branchName', 'Branch'],
    ['pipingClass', 'Piping Class'],
    ['rating', 'Rating'],
    ['boreMm', 'Bore (mm)'],
    ['lengthMm', 'Length (mm)'],
    ['weight', 'Weight'],
    ['method', 'Method / Source'],
    ['kind', 'Kind'],
    ['message', 'Message / Detail'],
  ]);

  function xmlCiiRenderDiagnosticsPhase() {
    const rows = _xmlCiiLastDiagnosticRows || [];
    const hasData = rows.length > 0;
    const byType = {};
    for (const row of rows) (byType[row.type] = byType[row.type] || []).push(row);
    const types = Object.keys(byType).sort();
    const statusClass = _xmlCiiLastDiagnosticError ? 'bad' : (_xmlCiiLastDiagnosticStatus ? 'ok' : '');
    const statusText = _xmlCiiLastDiagnosticError || _xmlCiiLastDiagnosticStatus;
    const filterOptions = ['<option value="">All categories</option>']
      .concat(types.map((t) => `<option value="${_esc(t)}">${_esc(t)} (${byType[t].length})</option>`))
      .join('');
    return `
      <div class="model-converters-workflow-detail-title">4 Diagnostics</div>
      <div class="model-converters-workflow-detail-text">Dry-run enrichment to inspect match quality before committing to a full Run.</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
        <button type="button" class="model-converters-run-btn" id="mc-diag-dry-run-btn">Dry Run</button>
        <span id="mc-diag-run-status" class="mc-diag-run-status ${_esc(statusClass)}">${_esc(statusText)}</span>
      </div>
      ${hasData ? `
        <div class="mc-diag-toolbar" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#9cc5ff;">Category
            <select id="mc-diag-filter" style="background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:4px 8px;font-size:12px;">${filterOptions}</select>
          </label>
          <input type="search" id="mc-diag-search" placeholder="Filter rows\u2026" style="flex:1;min-width:160px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:5px 8px;font-size:12px;">
          <span id="mc-diag-count" style="font-size:12px;color:#9aa8ba;white-space:nowrap;">${rows.length} row(s)</span>
        </div>
        <div id="mc-diag-content" style="overflow:auto;max-height:55vh;"></div>
      ` : `<div class="model-converters-workflow-detail-note">No diagnostic data yet \u2014 click Dry Run above.</div>`}`;
  }

  function bindXmlCiiDiagnosticsPhase(detailEl, rootEl) {
    const statusEl = detailEl?.querySelector('#mc-diag-status, #mc-diag-run-status');
    const setStatus = (msg, ok = true) => {
      if (!ok) {
        _xmlCiiLastDiagnosticError = msg;
        _xmlCiiLastDiagnosticStatus = '';
      } else {
        _xmlCiiLastDiagnosticStatus = msg;
        _xmlCiiLastDiagnosticError = '';
      }
      if (statusEl) {
        statusEl.textContent = msg;
        statusEl.classList.toggle('bad', !ok);
        statusEl.classList.toggle('ok', ok);
      }
    };

    // Wire Dry Run button
    detailEl?.querySelector('#mc-diag-dry-run-btn')?.addEventListener('click', async () => {
      const values = activeValues();
      if (!primaryFile) { setStatus('No XML source loaded. Import an XML file first.', false); return; }
      setStatus('Running...');
      try {
        const primaryBytes = await primaryFile.arrayBuffer();
        const xmlText = _decodeTextUtf8(primaryBytes);
        const config = _parseXmlCiiEnrichmentConfig(values.supportConfigJson);
        const stagedSource = await xmlCiiCurrentStagedJsonSource(config);
        const diagnostics = [];
        const enriched = await _enrichXmlForCii2019(xmlText, stagedSource.text, { ...values, supportConfigJson: JSON.stringify(config), dryRun: true, _diagOut: diagnostics });
        const diagnosticSource = Array.isArray(enriched?.diagnostics) ? enriched.diagnostics : diagnostics;
        setDiagnosticRows(_diagnosticRowsForTable(diagnosticSource));
        setLogs([
          `Dry run completed: ${_xmlCiiLastDiagnosticRows.length} diagnostic row(s).`,
          stagedSource.label ? `Staged source: ${stagedSource.label}.` : 'Staged source: none.',
          `Branches annotated: ${enriched?.stats?.branchLineKeys || 0}; weights annotated: ${enriched?.stats?.weightAnnotations || 0}.`,
        ]);
        setStatus(`Done - ${_xmlCiiLastDiagnosticRows.length} rows`, true);
        if (rootEl) xmlCiiRenderWorkflowRoot(rootEl, detailEl);
      } catch (err) {
        const message = _toText(err?.message || err);
        setDiagnosticRows([]);
        setLogs([`Dry run failed: ${message}`]);
        setStatus(`Error: ${message}`, false);
      }
    });

    // Single adaptive table: one category dropdown + free-text search instead of
    // a wall of per-type buttons. Empty columns are hidden for a clean read.
    const rows = _xmlCiiLastDiagnosticRows || [];
    const contentEl = detailEl?.querySelector('#mc-diag-content');
    const filterEl = detailEl?.querySelector('#mc-diag-filter');
    const searchEl = detailEl?.querySelector('#mc-diag-search');
    const countEl = detailEl?.querySelector('#mc-diag-count');
    if (!contentEl) return;

    const renderDiagTable = () => {
      const category = filterEl?.value || '';
      const term = _toText(searchEl?.value).trim().toLowerCase();
      let filtered = category ? rows.filter((r) => r.type === category) : rows.slice();
      if (term) {
        filtered = filtered.filter((r) => XML_CII_DIAG_COLUMNS.some(([k]) => _toText(r[k]).toLowerCase().includes(term)));
      }
      if (countEl) countEl.textContent = `${filtered.length} of ${rows.length} row(s)`;
      if (!filtered.length) {
        contentEl.innerHTML = '<div class="model-converters-workflow-detail-note">No matching diagnostic rows.</div>';
        return;
      }
      // Keep only columns that carry data; drop the redundant Category column
      // when a single category is selected.
      const columns = XML_CII_DIAG_COLUMNS.filter(([key]) => {
        if (key === 'type' && category) return false;
        return filtered.some((r) => _toText(r[key]) !== '');
      });
      const MAX_ROWS = 500;
      const shown = filtered.slice(0, MAX_ROWS);
      contentEl.innerHTML = `
        <table class="mc-preview-node-table mc-diag-table" style="min-width:100%;">
          <thead><tr>${columns.map(([, label]) => `<th>${_esc(label)}</th>`).join('')}</tr></thead>
          <tbody>${shown.map((r) => `<tr>${columns.map(([key]) => `<td>${_esc(_toText(r[key] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
        ${filtered.length > MAX_ROWS ? `<div style="color:#9aa8ba;padding-top:6px;font-size:12px;">Showing first ${MAX_ROWS} of ${filtered.length} rows. Narrow with the category filter or download the diagnostics JSON for the full set.</div>` : ''}`;
    };

    filterEl?.addEventListener('change', renderDiagTable);
    searchEl?.addEventListener('input', renderDiagTable);
    renderDiagTable();
  }

  // ---- 6 Support Types phase ----
  function xmlCiiRenderSupportMapperPhase() {
    return xmlCiiRenderSupportMapperPhaseImported();
  }

  function bindXmlCiiSupportMapperPhase(detailEl) {
    bindXmlCiiSupportMapperPhaseImported(detailEl);
  }

  // ---- 7 Config phase ----
  function xmlCiiRenderConfigPhase() {
    // Show a COMPACT config: bulky master tables are hidden so the editor loads
    // instantly even on multi-MB configs (the full data is re-merged on save).
    const full = activeValues().supportConfigJson || '';
    const { text: compact, hiddenRows } = _xmlCiiCompactConfigForEditor(full);
    const sizeKb = Math.round((compact.length / 1024) * 10) / 10;
    const fullKb = Math.round((full.length / 1024) * 10) / 10;
    const config = _parseXmlCiiEnrichmentConfig(full);
    if (config.disableCiiSupportTagPopulation == null) {
      config.disableCiiSupportTagPopulation = true;
    }
    if (config.condenseRigidXsd == null && config.condense_rigid_xsd != null) config.condenseRigidXsd = config.condense_rigid_xsd === true;
    if (config.condense_rigid_xsd == null) config.condense_rigid_xsd = config.condenseRigidXsd === true;
    if (config.splitCondensedValveFlange == null && config.split_condensed_valve_flange != null) config.splitCondensedValveFlange = config.split_condensed_valve_flange === true;
    // Default ON: when neither flag is present in the config, the resolved
    // valve/flange split (with -1 node renumbering) must apply by default.
    if (config.splitCondensedValveFlange == null && config.split_condensed_valve_flange == null) config.splitCondensedValveFlange = true;
    if (config.split_condensed_valve_flange == null) config.split_condensed_valve_flange = config.splitCondensedValveFlange === true;
    const useFrictionSentinel = config.useFrictionSentinelForNonYSupports !== false;
    const convertDensity = config.convertDensityKgM3ToKgCm3 !== false;
    const disableCiiSupportTag = config.disableCiiSupportTagPopulation === true;
    const condenseRigidXsd = config.condenseRigidXsd === true || config.condense_rigid_xsd === true;
    const splitResolved = config.splitCondensedValveFlange === true || config.split_condensed_valve_flange === true;
    return `
      <div class="model-converters-workflow-detail-title">7 Config</div>
      <div class="model-converters-workflow-detail-text">Edit the enrichment configuration JSON. Master tables are hidden here for speed — manage them in “2 Import Masters”. Saving keeps them; Export JSON includes everything.</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;background:#131d2c;padding:10px 14px;border-radius:8px;border:1px solid #24354b;">
        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:12px;color:#c9d1d9;">
            <input type="checkbox" id="mc-cfg-friction-sentinel" ${useFrictionSentinel ? 'checked' : ''} style="cursor:pointer;margin:0;">
            Use friction sentinel for non-+Y supports
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:12px;color:#c9d1d9;">
            <input type="checkbox" id="mc-cfg-convert-density" ${convertDensity ? 'checked' : ''} style="cursor:pointer;margin:0;">
            Convert density units from kg/m³ to kg/cm³
          </label>
          <label class="model-converters-workflow-map-field" style="display:flex;flex-direction:row;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:12px;color:#c9d1d9;margin:0;">
            <input type="checkbox" data-xml-cii-config-bool="disableCiiSupportTagPopulation" ${disableCiiSupportTag ? 'checked' : ''} style="cursor:pointer;margin:0;">
            <span>Suppress CII support tag/name labels</span>
          </label>
          <label class="model-converters-workflow-map-field" style="display:flex;flex-direction:row;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:12px;color:#c9d1d9;margin:0;">
            <input type="checkbox" data-xml-cii-config-bool="condenseRigidXsd" ${condenseRigidXsd ? 'checked' : ''} style="cursor:pointer;margin:0;">
            <span>Record source/XSD condensed rigid intent</span>
          </label>
          <label class="model-converters-workflow-map-field" style="display:flex;flex-direction:row;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:12px;color:#c9d1d9;margin:0;">
            <input type="checkbox" data-xml-cii-config-bool="splitCondensedValveFlange" ${splitResolved ? 'checked' : ''} style="cursor:pointer;margin:0;">
            <span>Apply resolved split for condensed valve/flange/rigid nodes</span>
          </label>
        </div>
        <div style="font-size:11px;color:#8b9eb7;margin-top:4px;">
          Suppress ON blanks Support Tag/GUID restraint records and support-kind-only NODENAME rows such as RESR, REST+GUIDE, or GUIDE+REST. Source/XSD records intent only; Resolved applies the final split/renumber step before CII.
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
        <button type="button" class="model-converters-run-btn" id="mc-cfg-save">💾 Save</button>
        <button type="button" class="model-converters-download-btn" id="mc-cfg-export">⬇ Export JSON</button>
        <label class="model-converters-download-btn" style="cursor:pointer;">
          ⬆ Import JSON
          <input type="file" id="mc-cfg-import-file" accept=".json" style="display:none;">
        </label>
        <span style="font-size:11px;color:#7c8aa0;">editor ${sizeKb} KB${hiddenRows ? ` · ${hiddenRows.toLocaleString()} master rows hidden (full ${fullKb} KB)` : ''}</span>
        <span id="mc-cfg-status" style="font-size:12px;color:#9aa8ba;align-self:center;"></span>
      </div>
      <textarea id="mc-cfg-json" placeholder="Loading config…" spellcheck="false" style="flex:1;width:100%;min-height:340px;max-height:50vh;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:8px;padding:10px;font-family:Consolas,monospace;font-size:12px;resize:vertical;box-sizing:border-box;"></textarea>`;
  }

  function bindXmlCiiConfigPhase(detailEl) {
    const textarea = detailEl?.querySelector('#mc-cfg-json');
    const statusEl = detailEl?.querySelector('#mc-cfg-status');
    const setStatus = (msg, ok = true) => { if (statusEl) { statusEl.textContent = msg; statusEl.style.color = ok ? '#5df0a0' : '#ff8888'; } };
    // Populate with the compact config (masters hidden) so even a multi-MB config
    // loads instantly and the page never sticks.
    if (textarea) textarea.value = _xmlCiiCompactConfigForEditor(activeValues().supportConfigJson || '').text;
    
    const saveNow = () => {
      const raw = textarea?.value || '';
      try {
        // Re-merge hidden master tables before saving the full config.
        const merged = _xmlCiiMergeEditedConfig(raw, activeValues().supportConfigJson || '');
        const config = JSON.parse(merged);
        
        // Also force the checkbox values onto the config
        const cbFriction = detailEl?.querySelector('#mc-cfg-friction-sentinel');
        const cbDensity = detailEl?.querySelector('#mc-cfg-convert-density');
        const cbSupportTag = detailEl?.querySelector('[data-xml-cii-config-bool="disableCiiSupportTagPopulation"]');
        const cbCondenseXsd = detailEl?.querySelector('[data-xml-cii-config-bool="condenseRigidXsd"]');
        const cbSplitResolved = detailEl?.querySelector('[data-xml-cii-config-bool="splitCondensedValveFlange"]');
        if (cbFriction) {
          config.useFrictionSentinelForNonYSupports = cbFriction.checked;
        }
        if (cbDensity) {
          config.convertDensityKgM3ToKgCm3 = cbDensity.checked;
        }
        if (cbSupportTag) {
          config.disableCiiSupportTagPopulation = cbSupportTag.checked;
        }
        if (cbCondenseXsd) {
          config.condenseRigidXsd = cbCondenseXsd.checked;
          config.condense_rigid_xsd = cbCondenseXsd.checked;
        }
        if (cbSplitResolved) {
          config.splitCondensedValveFlange = cbSplitResolved.checked;
          config.split_condensed_valve_flange = cbSplitResolved.checked;
        }
        
        xmlCiiSaveConfig(config);
        setStatus('✓ Saved', true);
        
        // Also update textarea with possibly updated/re-formatted JSON
        if (textarea) {
          textarea.value = _xmlCiiCompactConfigForEditor(activeValues().supportConfigJson || '').text;
        }
      } catch (e) {
        setStatus(`JSON error: ${e.message}`, false);
      }
    };
    
    const updateTextareaFromCheckboxes = () => {
      const raw = textarea?.value || '';
      try {
        const config = JSON.parse(raw);
        const cbFriction = detailEl?.querySelector('#mc-cfg-friction-sentinel');
        const cbDensity = detailEl?.querySelector('#mc-cfg-convert-density');
        const cbSupportTag = detailEl?.querySelector('[data-xml-cii-config-bool="disableCiiSupportTagPopulation"]');
        const cbCondenseXsd = detailEl?.querySelector('[data-xml-cii-config-bool="condenseRigidXsd"]');
        const cbSplitResolved = detailEl?.querySelector('[data-xml-cii-config-bool="splitCondensedValveFlange"]');
        if (cbFriction) {
          config.useFrictionSentinelForNonYSupports = cbFriction.checked;
        }
        if (cbDensity) {
          config.convertDensityKgM3ToKgCm3 = cbDensity.checked;
        }
        if (cbSupportTag) {
          config.disableCiiSupportTagPopulation = cbSupportTag.checked;
        }
        if (cbCondenseXsd) {
          config.condenseRigidXsd = cbCondenseXsd.checked;
          config.condense_rigid_xsd = cbCondenseXsd.checked;
        }
        if (cbSplitResolved) {
          config.splitCondensedValveFlange = cbSplitResolved.checked;
          config.split_condensed_valve_flange = cbSplitResolved.checked;
        }
        textarea.value = JSON.stringify(config, null, 2);
        setStatus('Unsaved changes - click Save', false);
      } catch (e) {
        // Ignore JSON errors while typing, the checkboxes will be merged on save anyway
      }
    };
    
    detailEl?.querySelector('#mc-cfg-friction-sentinel')?.addEventListener('change', updateTextareaFromCheckboxes);
    detailEl?.querySelector('#mc-cfg-convert-density')?.addEventListener('change', updateTextareaFromCheckboxes);
    detailEl?.querySelector('[data-xml-cii-config-bool="disableCiiSupportTagPopulation"]')?.addEventListener('change', updateTextareaFromCheckboxes);
    detailEl?.querySelector('[data-xml-cii-config-bool="condenseRigidXsd"]')?.addEventListener('change', updateTextareaFromCheckboxes);
    detailEl?.querySelector('[data-xml-cii-config-bool="splitCondensedValveFlange"]')?.addEventListener('change', updateTextareaFromCheckboxes);

    detailEl?.querySelector('#mc-cfg-save')?.addEventListener('click', saveNow);
    detailEl?.querySelector('#mc-cfg-export')?.addEventListener('click', () => {
      // Export the FULL config (with master tables), not the compact editor view.
      const blob = new Blob([activeValues().supportConfigJson || ''], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'cii-enrichment-config.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    detailEl?.querySelector('#mc-cfg-import-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        xmlCiiSaveConfig(parsed); // validate + save full config
        if (textarea) textarea.value = _xmlCiiCompactConfigForEditor(activeValues().supportConfigJson || '').text;
        
        // Sync checkboxes
        const cbFriction = detailEl?.querySelector('#mc-cfg-friction-sentinel');
        const cbDensity = detailEl?.querySelector('#mc-cfg-convert-density');
        const cbSupportTag = detailEl?.querySelector('[data-xml-cii-config-bool="disableCiiSupportTagPopulation"]');
        const cbCondenseXsd = detailEl?.querySelector('[data-xml-cii-config-bool="condenseRigidXsd"]');
        const cbSplitResolved = detailEl?.querySelector('[data-xml-cii-config-bool="splitCondensedValveFlange"]');
        if (cbFriction) {
          cbFriction.checked = parsed.useFrictionSentinelForNonYSupports !== false;
        }
        if (cbDensity) {
          cbDensity.checked = parsed.convertDensityKgM3ToKgCm3 !== false;
        }
        if (cbSupportTag) {
          cbSupportTag.checked = parsed.disableCiiSupportTagPopulation === true;
        }
        if (cbCondenseXsd) {
          cbCondenseXsd.checked = parsed.condenseRigidXsd === true || parsed.condense_rigid_xsd === true;
        }
        if (cbSplitResolved) {
          cbSplitResolved.checked = parsed.splitCondensedValveFlange === true || parsed.split_condensed_valve_flange === true;
        }
        
        setStatus(`✓ Imported ${file.name}`, true);
      } catch (err) {
        setStatus(`Import failed: ${err.message}`, false);
      }
      e.target.value = '';
    });
    textarea?.addEventListener('input', () => setStatus('Unsaved changes - click Save', false));
  }


  async function xmlCiiEnsureDefaultMastersLoaded(rootEl) {
    if (!rootEl || rootEl.dataset.defaultMastersLoading === 'true') return;


    rootEl.dataset.defaultMastersLoading = 'true';
    const loadedNames = [];
    try {
      const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
      for (const masterKey of XML_CII_MASTER_ORDER) {
        const masterDef = XML_CII_MASTER_DEFS[masterKey];
        if (!masterDef.defaultUrl) continue;
        const savedRows = _xmlCiiMasterRowsFromConfig(config, masterDef);
        const local = xmlCiiLocalMasterState(masterKey);
        if (savedRows.length || local.rawRows.length) continue;
        await xmlCiiLoadDefaultMaster(masterKey, true);
        loadedNames.push(masterDef.title);
      }
      if (loadedNames.length) {
        notify({ level: 'success', title: 'XML->CII Masters', message: `Loaded defaults: ${loadedNames.join(', ')}.` });
      }
    } catch (error) {
      notify({ level: 'error', title: 'XML->CII Masters', message: _toText(error?.message || error) });
    } finally {
      rootEl.dataset.defaultMastersLoading = 'false';
      if (rootEl === xmlCiiWorkflowPopupEl) xmlCiiRenderWorkflowRoot(rootEl, xmlCiiWorkflowPopupDetailEl);
    }
  }

  function xmlCiiCurrentPrimaryFile() {
    return primaryInputEl?.files?.[0] || primaryFile || null;
  }

  function xmlCiiParsedCustomInputStagedSource(config = {}) {
    return xmlCiiWorkflowParsedStagedSource(config);
  }

  async function xmlCiiCurrentStagedJsonSource(config = {}) {
    const parsedSource = xmlCiiParsedCustomInputStagedSource(config);
    if (parsedSource?.text) return parsedSource;
    if (secondaryFile) {
      const bytes = await secondaryFile.arrayBuffer();
      return { text: _decodeTextUtf8(bytes), label: `sidebar staged JSON (${secondaryFile.name || 'file'})` };
    }
    const text = activeValues().stagedAttributesJson || '';
    return { text, label: text ? 'sidebar staged JSON text' : '' };
  }
  async function xmlCiiCurrentStagedJsonText(config = {}) {
    return (await xmlCiiCurrentStagedJsonSource(config)).text;
  }

  function xmlCiiPopupMasterSnapshot(masterKey, config) {
    const masterDef = XML_CII_MASTER_DEFS[masterKey];
    const local = xmlCiiLocalMasterState(masterKey);
    const savedRows = _xmlCiiMasterRowsFromConfig(config, masterDef);
    const savedFieldMap = _xmlCiiMasterFieldMapFromConfig(config, masterDef);
    const fieldMap = Object.keys(local.fieldMap || {}).length ? local.fieldMap : savedFieldMap;
    const sourceRows = local.rawRows.length ? local.rawRows : savedRows;
    const visibleRows = savedRows.length || local.rawRows.length;
    const headers = _xmlCiiHeadersFromRows(sourceRows).filter((header) => header !== '_raw' && header !== '_rowIndex');
    const previewMap = _xmlCiiBuildColumnPreviewMap(sourceRows, headers);
    const fields = Object.keys(masterDef.aliases || {}).map((fieldName) => ({
      name: fieldName,
      label: masterDef.fieldLabels?.[fieldName] || fieldName,
      required: masterDef.requiredFields.includes(fieldName),
      selected: fieldMap?.[fieldName] || '',
      options: headers.map((header) => ({ value: header, label: previewMap[header] || header })),
    }));
    const previewColumns = headers.slice(0, 6).map((header) => ({ key: header, label: header }));
    const previewRows = sourceRows.slice(0, 8).map((row) => {
      const out = {};
      for (const header of headers.slice(0, 6)) out[header] = row?.[header] ?? '';
      return out;
    });

    return {
      key: masterKey,
      title: masterDef.title,
      description: masterDef.description,
      rows: masterKey === 'pipingClass' && visibleRows <= 1 ? 0 : visibleRows,
      rawRows: local.rawRows.length,
      sourceName: local.sourceName || '',
      hasDefault: !!masterDef.defaultUrl,
      mappingTemplates: masterKey === 'linelist' ? xmlCiiLineListMappingTemplateRows() : [],
      fields,
      previewColumns,
      previewRows,
    };
  }

  function xmlCiiPopupOverrideSnapshot(config) {
    const overrides = xmlCiiEnsureOverrides(config);
    const groups = [
      ['pipingClass', 'Piping Class'],
      ['material', 'Material'],
      ['materialCode', 'Material Code'],
      ['processData', 'Process Data'],
      ['rigidWeight', 'Rigid Weight'],
    ].map(([key, label]) => ({
      key,
      label,
      entries: Object.entries(overrides[key] || {}).slice(0, 100).map(([source, target]) => ({
        source,
        target: typeof target === 'object' ? JSON.stringify(target) : _toText(target),
      })),
    }));
    return {
      count: groups.reduce((sum, group) => sum + group.entries.length, 0),
      groups,
      mappingTemplates: xmlCiiLineListMappingTemplateRows(),
    };
  }

  function xmlCiiGetPopupSnapshot(target) {
    const config = xmlCiiConfigWithLoadedMasterRows('XML->CII popup');
    const values = activeValues();
    const sampleBranch = _toText(config.linelist?.sampleBranchName || '/ASIM-1885-10"-S8810101-91261M7-HC/B1');
    const compact = _xmlCiiCompactConfigForEditor(values.supportConfigJson || '{}');
    const fullKb = Math.round(((values.supportConfigJson || '').length / 1024) * 10) / 10;
    const supportMapping = config.supportMapping && typeof config.supportMapping === 'object' ? config.supportMapping : {};
    const supportPreviewRows = Object.entries(config.supportKindToXmlType || {}).slice(0, 20).map(([source, target]) => ({
      source,
      target,
      status: 'Configured',
    }));

    return {
      activeMaster: target?.dataset?.xmlCiiActiveMaster || target?.dataset?.activeMaster || 'linelist',
      files: {
        hasXml: !!xmlCiiCurrentPrimaryFile(),
        xmlName: xmlCiiCurrentPrimaryFile()?.name || '',
        hasStagedJson: !!secondaryFile || !!_toText(values.stagedAttributesJson).trim(),
      },
      regex: {
        sampleBranch,
        tokenDelimiter: config.linelist?.tokenDelimiter || '-',
        lineKeyJoiner: config.linelist?.lineKeyJoiner || '',
        lineKeyPositions: config.linelist?.lineKeyTokenPositions || '4',
        pipingClassPosition: config.rating?.pipingClassTokenIndex || 5,
        sizePosition: config.weight?.boreTokenIndex || 3,
        lineKey: _deriveBranchLineKey(sampleBranch, config),
        pipingClass: _derivePipingClassFromBranchName(sampleBranch, config),
        sizeToken: _deriveXmlCiiSizeTokenFromBranchName(sampleBranch, config),
        tokens: _branchTokens(sampleBranch, config.linelist?.tokenDelimiter || '-'),
        pipingClassRegex: config.rating?.pipingClassRegex || '',
        pipingClassGroup: config.rating?.pipingClassGroup || 1,
        sizeRegex: config.weight?.boreRegex || '',
        sizeGroup: config.weight?.boreGroup || 1,
        branchNameRegex: config.linelist?.branchNameRegex || '',
        lineNoGroup: config.linelist?.lineNoGroup || 1,
      },
      masters: XML_CII_MASTER_ORDER.map((masterKey) => xmlCiiPopupMasterSnapshot(masterKey, config)),
      overrides: xmlCiiPopupOverrideSnapshot(config),
      run: {
        counts: {
          linelist: Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows.length : 0,
          pipingClass: _xmlCiiMasterRowsFromConfig(config, XML_CII_MASTER_DEFS.pipingClass).length,
          material: Array.isArray(config.material?.mapRows) ? config.material.mapRows.length : 0,
          weight: Array.isArray(config.weight?.masterRows) ? config.weight.masterRows.length : 0,
        },
        lineKey: _deriveBranchLineKey(sampleBranch, config),
        sampleBranch,
        options: {
          coordsMode: _toText(values.coordsMode || 'first'),
          createEnrichedXml: !!values.createEnrichedXml,
          kgToNewton: values.kgToNewton !== false,
          condenseRigidXsd: config.condenseRigidXsd === true || config.condense_rigid_xsd === true,
          splitCondensedValveFlange: config.splitCondensedValveFlange === true || config.split_condensed_valve_flange === true,
        },
      },
      diagnostics: {
        rows: _xmlCiiLastDiagnosticRows.slice(0, 500),
        status: _xmlCiiLastDiagnosticError || _xmlCiiLastDiagnosticStatus || '',
      },
      support: {
        ruleCount: Object.keys(supportMapping).length,
        kindCount: Object.keys(config.supportKindToXmlType || {}).length,
        previewRows: supportPreviewRows,
      },
      config: {
        compactText: compact.text,
        hiddenRows: compact.hiddenRows,
        compactKb: Math.round((compact.text.length / 1024) * 10) / 10,
        fullKb,
        useFrictionSentinel: config.useFrictionSentinelForNonYSupports !== false,
        convertDensity: config.convertDensityKgM3ToKgCm3 !== false,
        disableCiiSupportTag: config.disableCiiSupportTagPopulation === true,
        condenseRigidXsd: config.condenseRigidXsd === true || config.condense_rigid_xsd === true,
        splitCondensedValveFlange: config.splitCondensedValveFlange === true || config.split_condensed_valve_flange === true,
      },
    };
  }

  function xmlCiiSetPopupConfigValue(path, value, type) {
    const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
    const nextValue = type === 'number'
      ? (Number.isFinite(Number(value)) ? Number(value) : 0)
      : value;
    _setValueAtPath(config, path, nextValue);
    xmlCiiSaveConfig(config);
  }

  function xmlCiiSetPopupRunOption(key, value, type) {
    const values = activeValues();
    values[key] = type === 'checkbox' ? !!value : value;
    persist();
    renderAdvanced();
  }

  async function xmlCiiImportPopupMasterFile(masterKey, file) {
    if (!file) return;
    const readResult = masterKey === 'material' && /\.(txt|map)$/i.test(file.name || '')
      ? { sheetNames: [], selectedSheet: '', sheets: {}, rows: _xmlCiiParseMaterialMapText(await file.text()) }
      : await _xmlCiiReadMasterFile(file);
    await xmlCiiLoadRowsIntoMaster(masterKey, readResult, file.name);
    xmlCiiSaveMasterRows(masterKey);
  }

  async function xmlCiiLoadPopupDefaultMaster(masterKey) {
    await xmlCiiLoadDefaultMaster(masterKey, true);
  }

  function xmlCiiAutoMapPopupMaster(masterKey) {
    const local = xmlCiiLocalMasterState(masterKey);
    if (masterKey === 'linelist') {
      const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
      local.fieldMap = _detectLineListFieldMap(local.rawRows, local.fieldMap, config);
    } else {
      local.fieldMap = _xmlCiiAutoMapFields(_xmlCiiHeadersFromRows(local.rawRows), XML_CII_MASTER_DEFS[masterKey], local.rawRows);
    }
    if (local.rawRows.length) xmlCiiSaveMasterRows(masterKey);
  }

  function xmlCiiSetPopupMasterField(masterKey, fieldName, value) {
    xmlCiiLocalMasterState(masterKey).fieldMap[fieldName] = value;
    if (xmlCiiLocalMasterState(masterKey).rawRows.length) xmlCiiSaveMasterRows(masterKey);
  }

  function xmlCiiSavePopupMaster(masterKey) {
    if (masterKey === 'linelist') xmlCiiSaveDynamicMappedFields(masterKey);
    xmlCiiSaveMasterRows(masterKey, { saveMappingTemplate: masterKey === 'linelist' });
  }

  async function xmlCiiBuildPopupPreviewRows() {
    const xmlFile = xmlCiiCurrentPrimaryFile();
    if (!xmlFile) throw new Error('Load an XML file first.');
    const config = xmlCiiConfigWithLoadedMasterRows('XML->CII preview');
    const xmlText = await xmlFile.text();
    const stagedSource = await xmlCiiCurrentStagedJsonSource(config);
    const result = xmlCiiDryRunPreview(xmlText, config, stagedSource.text);
    return (result.branchRows || []).slice(0, 500).map((row) => ({
      branchName: row.branchName || '',
      lineKey: row.lineKey || '',
      pipingClass: row.pipingClass || row.pipingClassDerived || '',
      material: row.material || row.materialCode || '',
      rating: row.rating || '',
    }));
  }

  async function xmlCiiRunPopupDiagnostics() {
    const xmlFile = xmlCiiCurrentPrimaryFile();
    if (!xmlFile) throw new Error('No XML source loaded. Import an XML file first.');
    const values = activeValues();
    const xmlText = _decodeTextUtf8(await xmlFile.arrayBuffer());
    const config = xmlCiiConfigWithLoadedMasterRows('XML->CII diagnostics');
    const stagedSource = await xmlCiiCurrentStagedJsonSource(config);
    const diagnostics = [];
    const enriched = await _enrichXmlForCii2019(xmlText, stagedSource.text, {
      ...values,
      supportConfigJson: JSON.stringify(config),
      dryRun: true,
      _diagOut: diagnostics,
    });
    const diagnosticSource = Array.isArray(enriched?.diagnostics) ? enriched.diagnostics : diagnostics;
    const rows = _diagnosticRowsForTable(diagnosticSource);
    setDiagnosticRows(rows);
    setLogs([
      `Dry run completed: ${rows.length} diagnostic row(s).`,
      stagedSource.label ? `Staged source: ${stagedSource.label}.` : 'Staged source: none.',
      `Branches annotated: ${enriched?.stats?.branchLineKeys || 0}; weights annotated: ${enriched?.stats?.weightAnnotations || 0}.`,
    ]);
    _xmlCiiLastDiagnosticStatus = `Done - ${rows.length} rows`;
    _xmlCiiLastDiagnosticError = '';
    return rows;
  }

  async function xmlCiiComputePopupWeightRows() {
    const xmlFile = xmlCiiCurrentPrimaryFile();
    if (!xmlFile) throw new Error('Load an XML file first.');
    const values = activeValues();
    const xmlText = await xmlFile.text();
    const config = xmlCiiConfigWithLoadedMasterRows('XML->CII weight match');
    const stagedSource = await xmlCiiCurrentStagedJsonSource(config);
    const enriched = await _enrichXmlForCii2019(xmlText, stagedSource.text, { ...values, supportConfigJson: JSON.stringify(config), dryRun: true });
    const collectConfig = enriched.config || config;
    const geometryXml = applyXmlCiiStagedGeometryAuthority(enriched.xmlText || xmlText, stagedSource.text, { config: collectConfig }).xmlText;
    return collectXmlCiiWeightMatchRows(geometryXml, stagedSource.text, collectConfig).slice(0, 500).map((row) => {
      const best = row.candidates?.[0] || row.weightMatch || null;
      const weight = row.weight || best?.selectedWeight || best?.suggestedWeight || best?.weight || '';
      return {
        key: row.key || xmlCiiRigidWeightOverrideKey(row.branchName, row.nodeNumber),
        branchName: row.branchName || '',
        nodeNumber: row.nodeNumber || '',
        componentType: row.componentType || '',
        boreMm: row.boreMm == null ? '' : `${Number(row.boreMm).toFixed(0)} mm`,
        rating: row.rating || '',
        weight: weight ? `${weight} kg` : '',
        numericWeight: Number(weight) || 0,
      };
    });
  }

  function xmlCiiApplyPopupPreferredWeights(rows) {
    const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
    const overrides = xmlCiiEnsureOverrides(config);
    overrides.rigidWeight = { ...(overrides.rigidWeight || {}) };
    for (const row of Array.isArray(rows) ? rows : []) {
      const numeric = Number(row?.numericWeight);
      if (!row?.key || !Number.isFinite(numeric) || numeric <= 0) continue;
      overrides.rigidWeight[row.key] = numeric;
    }
    xmlCiiSaveConfig(config);
  }

  function xmlCiiSavePopupConfigText(editedText, bools) {
    const merged = _xmlCiiMergeEditedConfig(editedText, activeValues().supportConfigJson || '{}');
    const config = JSON.parse(merged);
    if (bools && typeof bools === 'object') {
      if ('useFrictionSentinelForNonYSupports' in bools) config.useFrictionSentinelForNonYSupports = !!bools.useFrictionSentinelForNonYSupports;
      if ('convertDensityKgM3ToKgCm3' in bools) config.convertDensityKgM3ToKgCm3 = !!bools.convertDensityKgM3ToKgCm3;
      if ('disableCiiSupportTagPopulation' in bools) config.disableCiiSupportTagPopulation = !!bools.disableCiiSupportTagPopulation;
      if ('condenseRigidXsd' in bools || 'condense_rigid_xsd' in bools) {
        const enabled = !!(bools.condenseRigidXsd || bools.condense_rigid_xsd);
        config.condenseRigidXsd = enabled;
        config.condense_rigid_xsd = enabled;
      }
      if ('splitCondensedValveFlange' in bools || 'split_condensed_valve_flange' in bools) {
        const enabled = !!(bools.splitCondensedValveFlange || bools.split_condensed_valve_flange);
        config.splitCondensedValveFlange = enabled;
        config.split_condensed_valve_flange = enabled;
      }
    }
    xmlCiiSaveConfig(config);
    return _xmlCiiCompactConfigForEditor(activeValues().supportConfigJson || '{}').text;
  }

  function xmlCiiImportPopupConfigText(text) {
    const parsed = JSON.parse(text);
    xmlCiiSaveConfig(parsed);
  }

  function xmlCiiRenderPopupSupportTable(host) {
    if (!host) return;
    const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
    host.innerHTML = xmlCiiRenderSupportMapperPhaseImported();
    bindXmlCiiSupportMapperPhaseImported(host, { config, onSaveConfig: xmlCiiSaveConfig });
  }

  let workflowModalInstance = null;

  function xmlCiiCloseWorkflowPopup() {
    if (workflowModalInstance) {
      workflowModalInstance.close();
      workflowModalInstance = null;
      xmlCiiWorkflowPopupEl = null;
      xmlCiiWorkflowPopupDetailEl = null;
    } else if (xmlCiiWorkflowPopupEl) {
      xmlCiiWorkflowPopupEl.remove();
      xmlCiiWorkflowPopupEl = null;
      xmlCiiWorkflowPopupDetailEl = null;
    }
  }

  function xmlCiiOpenWorkflowPopup() {
    if (workflowModalInstance) {
      xmlCiiRenderWorkflowRoot(xmlCiiWorkflowPopupEl, xmlCiiWorkflowPopupDetailEl);
      return;
    }
    
    const initialPhase = xmlCiiWorkflowEl?.dataset.selectedPhase || 'regex';

    workflowModalInstance = new WorkflowModal({
      title: 'XML->CII(2019) Workflow',
      subtitle: 'Import masters, map fields, and maintain manual overrides in a standalone-ready config.',
      tabs: XML_CII_WORKFLOW_PHASES,
      activeTabId: initialPhase,
      onTabChange: (phaseId) => {
        xmlCiiWorkflowPopupEl.dataset.selectedPhase = phaseId;
        xmlCiiRenderWorkflowRoot(xmlCiiWorkflowPopupEl, xmlCiiWorkflowPopupDetailEl);
      },
      onClose: () => {
        workflowModalInstance = null;
        xmlCiiWorkflowPopupEl = null;
        xmlCiiWorkflowPopupDetailEl = null;
      }
    });

    xmlCiiWorkflowPopupDetailEl = workflowModalInstance.open();
    xmlCiiWorkflowPopupEl = workflowModalInstance.overlayEl;
    xmlCiiWorkflowPopupEl.dataset.selectedPhase = initialPhase;
    xmlCiiWorkflowPopupEl.dataset.activeMaster = xmlCiiWorkflowEl?.dataset.activeMaster || 'linelist';

    xmlCiiRenderWorkflowRoot(xmlCiiWorkflowPopupEl, xmlCiiWorkflowPopupDetailEl);
    void xmlCiiEnsureDefaultMastersLoaded(xmlCiiWorkflowPopupEl);
  }

  function renderXmlCiiWorkflowShell() {
    if (!xmlCiiWorkflowEl || !xmlCiiWorkflowDetailEl) return;
    const defId = activeDef().id;
    const isXmlCiiConverter = defId === 'xml_to_cii';
    xmlCiiWorkflowEl.style.display = isXmlCiiConverter ? 'block' : 'none';
    if (!isXmlCiiConverter) {
      xmlCiiCloseWorkflowPopup();
      return;
    }

    const phaseListEl = xmlCiiWorkflowEl.querySelector('.model-converters-workflow-phase-list');
    if (phaseListEl) phaseListEl.hidden = true;
    xmlCiiWorkflowDetailEl.innerHTML = '';

    if (xmlCiiWorkflowEl.dataset.bound === 'true') return;
    xmlCiiWorkflowEl.querySelector('#model-converters-xml-cii-rich-btn')?.addEventListener('click', () => {
      xmlCiiOpenWorkflowPopup();
    });
    xmlCiiWorkflowEl.dataset.bound = 'true';
  }

  function renderFileControls() {
    const def = activeDef();
    primaryLabelEl.textContent = `${def.primaryLabel} (${def.primaryAccept})`;
    primaryInputEl.setAttribute('accept', def.primaryAccept);
    primaryNameEl.textContent = primaryFile ? primaryFile.name : 'No file selected.';

    if (masterSampleBtnEl) {
      masterSampleBtnEl.style.display = def.masterInputXmlSample ? '' : 'none';
      masterSampleBtnEl.dataset.converterId = def.id;
    }

    const showSecondary = !!def.secondaryLabel;
    secondaryWrapEl.style.display = showSecondary ? '' : 'none';
    if (showSecondary) {
      secondaryLabelEl.textContent = `${def.secondaryLabel} (${def.secondaryAccept})`;
      secondaryInputEl.setAttribute('accept', def.secondaryAccept);
      secondaryNameEl.textContent = secondaryFile ? secondaryFile.name : 'No file selected.';
    }
  }

  function renderDescription() {
    setStatus(activeDef().description, '');
  }

  function resetOutput() {
    outputEl.innerHTML = '<span class="model-converters-muted">No output generated yet.</span>';
    setLogs([]);
    setDiagnosticRows([]);
    setCiiWarningRows([]);
    _3DModelConv_resetPreview('Preview not available yet.');
  }

  function renderAll() {
    renderFileControls();
    renderAdvanced();
    renderXmlCiiWorkflowShell();
    renderSupportMapperConfig();
    renderDescription();
  }

  async function ensureRuntime() {
    if (!runtime) runtime = _createWorkerRuntime();
    return runtime;
  }

  selectEl.addEventListener('change', () => {
    const nextValue = selectEl.value;
    if (!enabledConverterIds.has(nextValue)) {
      selectEl.value = selectedConverter;
      return;
    }
    selectedConverter = nextValue;
    primaryFile = null;
    secondaryFile = null;
    persist();
    resetOutput();
    renderAll();
  });

  masterSampleBtnEl?.addEventListener('click', () => {
    const def = activeDef();
    const sample = def.masterInputXmlSample;
    if (!sample) return;
    downloadOutput({
      name: sample.fileName,
      text: sample.getText(),
      mime: 'application/xml;charset=utf-8',
    });
  });

  primaryInputEl.addEventListener('change', () => {
    primaryFile = primaryInputEl.files?.[0] || null;
    primaryNameEl.textContent = primaryFile ? primaryFile.name : 'No file selected.';
    // A new file may carry a different branch — force the next auto-load to
    // re-derive, then apply immediately if the Rich Workflow popup is open.
    xmlCiiAutoBranchFileKey = '';
    if (activeDef().id === 'xml_to_cii' && primaryFile && xmlCiiWorkflowPopupEl && xmlCiiWorkflowPopupDetailEl) {
      xmlCiiAutoloadBranchFromXml(xmlCiiWorkflowPopupEl, xmlCiiWorkflowPopupDetailEl);
    }
  });

  secondaryInputEl.addEventListener('change', () => {
    secondaryFile = secondaryInputEl.files?.[0] || null;
    secondaryNameEl.textContent = secondaryFile ? secondaryFile.name : 'No file selected.';
  });

  runBtnEl.addEventListener('click', async () => {
    if (selectedConverter === 'xml_to_cii' && xmlCiiPendingFetchSave) {
      // Fetch is visually complete before worker persistence completes.
      // Run must use the updated full config rather than stale activeValues.
      try { await xmlCiiPendingFetchSave; }
      catch (error) {
        notify({ level: 'error', title: 'XML->CII config save', message: String(error?.message || error) });
        return;
      }
    }
    if (selectedConverter === 'xml_to_cii') {
      const runConfig = xmlCiiConfigWithLoadedMasterRows('XML->CII Run preflight');
      const missing = missingPersistedXmlCiiMasters(runConfig);
      if (missing.length) {
        const message = missingPersistedXmlCiiMastersNotice(missing);
        setStatus(message, 'bad');
        setLogs([message]);
        outputEl.innerHTML = '<div role="alert" data-xml-cii-missing-masters>' + _esc(message) + '</div>';
        notify({ level: 'error', title: 'XML->CII Run blocked', message });
        return;
      }
    }
    const converter = getConverterById(selectedConverter);
    if (!converter) {
      notify({ level: 'error', title: 'Converter', message: `Converter "${selectedConverter}" not found in registry.` });
      return;
    }

    const allowSecondaryOnly = converter?.allowSecondaryOnly === true;

    if (!primaryFile && !(allowSecondaryOnly && secondaryFile)) {
      const requiredMessage = allowSecondaryOnly
        ? 'Select an RVM file or an ATT/TXT attribute file first.'
        : 'Select a primary input file first.';
      setStatus(`Failed: ${requiredMessage}`, 'bad');
      outputEl.innerHTML = '<span class="model-converters-muted">No output generated.</span>';
      setLogs([requiredMessage]);
      notify({ level: 'warning', title: 'Converter', message: requiredMessage });
      return;
    }

    if (primaryFile && (selectedConverter === 'rvm_to_rev' || selectedConverter === 'rvmattr_to_xml') && !_isRvmFileName(primaryFile.name)) {
      notify({ level: 'error', title: 'Converter', message: `Selected file "${primaryFile.name}" is not .rvm. Use RVM input for ${converter.label}.` });
      return;
    }

    runBtnEl.disabled = true;
    setStatus(selectedConverter === 'inputxml_to_cii2019' ? 'Running structural preflight...' : 'Running converter...', 'running');
    setLogs([]);
    outputEl.innerHTML = '<span class="model-converters-muted">Working...</span>';
    _3DModelConv_resetPreview('Running conversion...');
    emit(RuntimeEvents.MODEL_CONVERTER_START, {
      converterId: selectedConverter,
      input: primaryFile?.name || secondaryFile?.name || 'input',
    });

    try {
      const primaryBytes = primaryFile ? await primaryFile.arrayBuffer() : null;
      const secondaryBytes = (converter.inputs.some(i => i.role === 'secondary') && secondaryFile) ? await secondaryFile.arrayBuffer() : null;
      const runValues = activeValues();
      let effectiveSecondaryBytes = secondaryBytes;
      let effectiveSecondaryName = secondaryFile?.name || '';
      if (selectedConverter === 'xml_to_cii') {
        const parsedSource = xmlCiiParsedCustomInputStagedSource(_parseXmlCiiEnrichmentConfig(runValues.supportConfigJson));
        if (parsedSource?.text) {
          effectiveSecondaryBytes = _encodeTextUtf8(parsedSource.text);
          effectiveSecondaryName = /JSON Trace/i.test(parsedSource.label || '') ? 'json_trace_staged_source.json' : 'parsed_custom_input_staged_source.json';
          setLogs([`Using ${parsedSource.label} for XML->CII staged-source matching.`]);
        }
      }

      // Hook up UI selection pops directly on legacy-adapter view scope if needed
      if (selectedConverter === 'rvmattr_to_xml') {
        let scopeSelection = { cancelled: false, wildcard: '', selectedIds: [] };
        if (secondaryBytes) {
          const attTextForScope = _decodeTextUtf8(secondaryBytes);
          const hierarchyForScope = parseRmssAttributes(attTextForScope, state.rvm?.routing);
          scopeSelection = await _openRvmAttributeScopePopup(
            primaryFile?.name || secondaryFile?.name || 'RVM Attribute conversion',
            hierarchyForScope,
          );
          if (scopeSelection.cancelled) {
            const message = 'Cancelled: ATT/RVM hierarchy selection was dismissed.';
            setStatus(message, '');
            outputEl.innerHTML = '<span class="model-converters-muted">No output generated.</span>';
            setLogs([message]);
            _3DModelConv_resetPreview('Preview not available yet.');
            return;
          }
        }
        runValues.rvmScope = scopeSelection;
      }

      const stagedJsonPreviewText = selectedConverter === 'stagedjson_to_inputxml' && primaryBytes
        ? _decodeTextUtf8(primaryBytes)
        : null;
      // Decode before converter.run(); worker-backed runs can transfer and detach
      // the ArrayBuffer, which makes post-run TextDecoder construction fail.
      const inputXmlCiiPreviewText = selectedConverter === 'inputxml_to_cii2019' && primaryBytes
        ? _decodeTextUtf8(primaryBytes)
        : null;

      const inputFiles = [];
      if (primaryFile && primaryBytes) {
        inputFiles.push({ role: 'primary', name: primaryFile.name, bytes: primaryBytes });
      }
      if (effectiveSecondaryBytes) {
        inputFiles.push({ role: 'secondary', name: effectiveSecondaryName || 'staged_source.json', bytes: effectiveSecondaryBytes });
      }

      // Inject host view callbacks into option overrides
      runValues.openXmlCiiZeroRigidWeightPopup = async (issues) => {
        return await _openXmlCiiZeroRigidWeightPopup(issues);
      };
      runValues.saveXmlCiiRigidWeightOverrides = (weightsByKey) => {
        const cfg = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
        const overrides = xmlCiiEnsureOverrides(cfg);
        overrides.rigidWeight = { ...(overrides.rigidWeight || {}), ...(weightsByKey || {}) };
        xmlCiiSaveConfig(cfg);
      };
      runValues.openInputxml2019PreRunPopup = async (ctx, values, name, bytes) => {
        return await _openInputxml2019PreRunPopup(converter, values, name, bytes, persist);
      };
      runValues.openJsonPopupAsync = async (args) => {
        return await _openJsonPopupAsync(args);
      };

      if (runValues.layoutConfigJson) {
        try {
          const parsed = JSON.parse(runValues.layoutConfigJson);
          if (parsed?.restraint?.explicit_type_map) {
            for (const [k, v] of Object.entries(parsed.restraint.explicit_type_map)) {
              if (!v) delete parsed.restraint.explicit_type_map[k];
            }
          }
          runValues.layoutConfigJson = JSON.stringify(parsed);
        } catch (e) {
          // ignore parsing error
        }
      }

      const context = {
        converterId: selectedConverter,
        inputFiles,
        options: runValues,
        workerRunner: await ensureRuntime(),
        setStatus: (msg, type) => setStatus(msg, type),
      };

      const response = await converter.run(context);

      const outputs = Array.isArray(response.outputs) ? response.outputs : [];
      const output = outputs[0];
      if (!output) throw new Error('Converter returned no output payload.');

      renderOutputs(outputs);

      let previewOutputs = outputs;
      if (selectedConverter === 'stagedjson_to_inputxml' && primaryFile && stagedJsonPreviewText) {
        previewOutputs = [
          {
            name: `${_baseNameWithoutExtension(primaryFile.name)}_managed_stage_preview.json`,
            text: stagedJsonPreviewText,
            mime: 'application/json;charset=utf-8',
          },
          ...outputs,
        ];
      }
      if (selectedConverter === 'inputxml_to_cii2019' && primaryFile && inputXmlCiiPreviewText) {
        previewOutputs = [
          {
            name: `${_baseNameWithoutExtension(primaryFile.name)}_inputxml_cii_geometry_preview.xml`,
            text: inputXmlCiiPreviewText,
            mime: 'application/xml;charset=utf-8',
          },
          ...previewOutputs,
        ];
      }
      await _3DModelConv_renderPreviewFromOutputs(previewOutputs);

      const logLines = []
        .concat(response.logs?.stdout || [])
        .concat(response.logs?.stderr || []);
      setDiagnosticRows(response.diagnosticsRows || []);
      setCiiWarningRows(response.logs?.warnings || []);
      setLogs(logLines);

      if (response.blocked) {
        setStatus(`BLOCKED: ${output.name}`, 'bad');
      } else if (selectedConverter !== 'pcf_continuity_check') {
        setStatus(`Completed: ${output.name}`, 'ok');
      }
      notify({ level: response.blocked ? 'warning' : 'success', title: 'Converter', message: response.blocked ? `${converter.label} blocked; no CII was emitted.` : `${converter.label} completed.` });
      emit(response.blocked ? RuntimeEvents.MODEL_CONVERTER_ERROR : RuntimeEvents.MODEL_CONVERTER_SUCCESS, { converterId: selectedConverter, output: output.name });

      const stpOut = outputs.find((o) => {
        const n = _toText(o?.name).toLowerCase();
        return n.endsWith('.stp') || n.endsWith('.step');
      });
      if (stpOut) {
        try {
          const { members } = parseStpSupportMembers(_toText(stpOut.text));
          if (members.length > 0) {
            emit(RuntimeEvents.MODEL_CONVERTER_STP_READY, { members, converterId: selectedConverter });
          }
        } catch {}
      }
    } catch (error) {
      const message = _toText(error?.message || error);
      setStatus(`Failed: ${message}`, 'bad');
      outputEl.innerHTML = '<span class="model-converters-muted">No output generated.</span>';
      setLogs([message]);
      _3DModelConv_resetPreview(`Preview unavailable: ${message}`);
      notify({ level: 'error', title: 'Converter', message });
      emit(RuntimeEvents.MODEL_CONVERTER_ERROR, { converterId: selectedConverter, error: message });
    } finally {
      if (!disposed) runBtnEl.disabled = false;
    }
  });

  // Restore last loaded line list if available
  try {
    const savedLineList = window.localStorage.getItem('model-converters.last-linelist.v1');
    if (savedLineList) {
      const parsed = JSON.parse(savedLineList);
      if (parsed && Array.isArray(parsed.rawRows) && parsed.rawRows.length) {
        const local = xmlCiiLocalMasterState('linelist');
        local.rawRows = parsed.rawRows;
        local.fieldMap = parsed.fieldMap || {};
        local.sheetNames = parsed.sheetNames || [];
        local.selectedSheet = parsed.selectedSheet || '';
        local.sheets = parsed.sheets || {};
        local.sourceName = parsed.sourceName || '';

        // Merge back into active supportConfigJson
        const activeVal = activeValues();
        const config = _parseXmlCiiEnrichmentConfig(activeVal.supportConfigJson);
        const masterDef = XML_CII_MASTER_DEFS.linelist;
        const rows = _xmlCiiMapRowsWithFieldMap(local.rawRows, local.fieldMap, 'linelist');
        
        if (!config.linelist || typeof config.linelist !== 'object') {
          config.linelist = {};
        }
        config.linelist.masterRows = rows;
        config.linelist.fieldMap = local.fieldMap;
        activeVal.supportConfigJson = JSON.stringify(config, null, 2);
      }
    }
  } catch (err) {
    console.warn('Failed to restore last loaded line list:', err);
  }

  resetOutput();
  renderAll();

  // Populate popup bridge so the XML→CII workflow popup can render each phase
  // interactively using the same closed-over helpers that the inline workflow uses.
  _xmlCiiPhaseBridge = {
    // Wired by the popup after it opens so phase-switch actions in the Run tab
    // can change the active WorkflowModal tab without touching the main page.
    switchPhase: null,
    // Wired by the popup so "Finalize and Run" can close it before running.
    closePopup: null,

    getPopupSnapshot(target) {
      return xmlCiiGetPopupSnapshot(target);
    },

    setPopupConfigValue(path, value, type) {
      return xmlCiiSetPopupConfigValue(path, value, type);
    },

    setPopupRunOption(key, value, type) {
      return xmlCiiSetPopupRunOption(key, value, type);
    },

    importPopupMasterFile(masterKey, file) {
      return xmlCiiImportPopupMasterFile(masterKey, file);
    },

    loadPopupDefaultMaster(masterKey) {
      return xmlCiiLoadPopupDefaultMaster(masterKey);
    },

    autoMapPopupMaster(masterKey) {
      return xmlCiiAutoMapPopupMaster(masterKey);
    },

    setPopupMasterField(masterKey, fieldName, value) {
      return xmlCiiSetPopupMasterField(masterKey, fieldName, value);
    },

    savePopupMaster(masterKey) {
      return xmlCiiSavePopupMaster(masterKey);
    },

    applyPopupLineListMappingTemplate(fileName) {
      return xmlCiiApplyLineListMappingTemplate(fileName);
    },

    clearPopupMaster(masterKey) {
      return xmlCiiClearMasterRows(masterKey);
    },

    buildPopupPreviewRows() {
      return xmlCiiBuildPopupPreviewRows();
    },

    runPopupDiagnostics() {
      return xmlCiiRunPopupDiagnostics();
    },

    computePopupWeightRows() {
      return xmlCiiComputePopupWeightRows();
    },

    applyPopupPreferredWeights(rows) {
      return xmlCiiApplyPopupPreferredWeights(rows);
    },

    savePopupConfigText(editedText, bools) {
      return xmlCiiSavePopupConfigText(editedText, bools);
    },

    importPopupConfigText(text) {
      return xmlCiiImportPopupConfigText(text);
    },

    exportPopupConfigText() {
      return activeValues().supportConfigJson || '{}';
    },

    renderPopupSupportTable(host) {
      return xmlCiiRenderPopupSupportTable(host);
    },

    ensureDefaultMastersLoaded(target) {
      return xmlCiiEnsureDefaultMastersLoaded(target || container);
    },

    renderPhaseInto(target, phaseId) {
      if (!target) return;
      if (!target.dataset.xmlCiiActiveMaster) target.dataset.xmlCiiActiveMaster = 'linelist';
      // Keep dataset.activeMaster in sync so legacy helpers that read it work.
      target.dataset.activeMaster = target.dataset.xmlCiiActiveMaster;

      const self = this;
      const rerender = () => self.renderPhaseInto(target, phaseId);

      // Proxy root so render helpers that read rootEl.dataset.activeMaster work
      // when given the popup body as rootEl.
      const proxyRoot = {
        dataset: { activeMaster: target.dataset.xmlCiiActiveMaster },
        querySelectorAll: (sel) => target.querySelectorAll(sel),
        querySelector: (sel) => target.querySelector(sel),
      };

      // HTML generation — if this throws, let it propagate so the popup can
      // degrade to the static panel instead of showing a broken empty modal.
      let html = '';
      if (phaseId === 'regex') html = xmlCiiRenderRegexPhase();
      else if (phaseId === 'import-masters') html = xmlCiiRenderImportMastersPhase(proxyRoot);
      else if (phaseId === 'run') html = xmlCiiRenderRunPhase();
      else if (phaseId === 'weight-match') html = xmlCiiRenderWeightMatchPhase();
      else if (phaseId === 'preview') html = xmlCiiRenderPreviewPhaseV7(xmlCiiCurrentPrimaryFile(), xmlCiiConfigWithLoadedMasterRows('XML->CII popup v7 preview'));
      else if (phaseId === 'diagnostics') html = xmlCiiRenderDiagnosticsPhase();
      else if (phaseId === 'support-mapper') html = xmlCiiRenderSupportMapperPhase();
      else if (phaseId === 'config') html = xmlCiiRenderConfigPhase();
      target.innerHTML = html;
      if (phaseId === 'preview') void armFirstXmlCiiPreviewBuild(target,
        () => xmlCiiInitializePopupPreviewV7(target)).catch((error) =>
          console.warn('[XML->CII Preview] First-click initialization failed:', error));

      // Event binding is best-effort: the content is already visible, so a bind
      // failure must never bubble up and freeze the modal. Log and continue.
      try {
        // Regex: bind interactive live-preview (re-renders into popup on change).
        // Guard with isTrusted so synthetic events from branch-sample-sync's
        // applyBranchSample don't trigger save→renderAdvanced→observer loops.
        if (phaseId === 'regex') {
          target.querySelectorAll('[data-xml-cii-regex-path]').forEach((input) => {
            const save = () => {
              const path = input.getAttribute('data-xml-cii-regex-path') || '';
              const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
              const val = input.type === 'number'
                ? (Number.isFinite(Number(input.value)) ? Number(input.value) : 0)
                : input.value;
              _setValueAtPath(config, path, val);
              xmlCiiSaveConfig(config);
            };
            input.addEventListener('input', (event) => { if (event.isTrusted) save(); });
            input.addEventListener('change', (event) => { if (event.isTrusted) { save(); rerender(); } });
          });

          // Auto-populate sampleBranchName from the loaded XML file when it is
          // still the factory default — lets the token table immediately show real data.
          setTimeout(async () => {
            if (!target.isConnected) return;
            const cfg = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
            const current = cfg.linelist?.sampleBranchName || '';
            const isPlaceholder = !current || current === '/ASIM-1885-10"-S8810101-91261M7-HC/B1';
            if (!isPlaceholder) return;
            const xmlFile = primaryInputEl?.files?.[0] || primaryFile;
            if (!xmlFile) return;
            try {
              const xmlText = await xmlFile.text();
              const sample = _extractXmlCiiBranchSample(xmlText);
              if (!sample) return;
              const latestCfg = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
              if (!latestCfg.linelist) latestCfg.linelist = {};
              latestCfg.linelist.sampleBranchName = sample;
              xmlCiiSaveConfig(latestCfg);
              if (target.isConnected) rerender();
            } catch {}
          }, 0);
        }

        // Import Masters: fully popup-aware binding using rerender() for refresh.
        // Does NOT call bindXmlCiiImportMastersPhase which targets the main tab workflow.
        if (phaseId === 'import-masters') {
          xmlCiiBindSpecwiseMasterPathsPanel(target, rerender);
          xmlCiiScheduleSpecwiseRescan(target, rerender);

          // Master sub-tab navigation
          target.querySelectorAll('[data-xml-cii-master-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const key = btn.getAttribute('data-xml-cii-master-tab') || 'linelist';
              target.dataset.xmlCiiActiveMaster = key;
              target.dataset.activeMaster = key;
              rerender();
            });
          });

          // File import
          target.querySelectorAll('[data-xml-cii-import-master]').forEach((input) => {
            input.addEventListener('change', async () => {
              const masterKey = input.getAttribute('data-xml-cii-import-master') || 'linelist';
              const file = input.files?.[0];
              if (!file) return;
              try {
                const readResult = masterKey === 'material' && /\.(txt|map)$/i.test(file.name || '')
                  ? { sheetNames: [], selectedSheet: '', sheets: {}, rows: _xmlCiiParseMaterialMapText(await file.text()) }
                  : await _xmlCiiReadMasterFile(file);
                await xmlCiiLoadRowsIntoMaster(masterKey, readResult, file.name);
                xmlCiiSaveMasterRows(masterKey);
                notify({ level: 'success', title: 'XML->CII Masters', message: `Imported ${file.name}.` });
              } catch (err) {
                notify({ level: 'error', title: 'XML->CII Masters', message: _toText(err?.message || err) });
              } finally {
                input.value = '';
                if (target.isConnected) rerender();
              }
            });
          });

          // Load Default
          target.querySelectorAll('[data-xml-cii-load-default]').forEach((button) => {
            button.addEventListener('click', async () => {
              const masterKey = button.getAttribute('data-xml-cii-load-default') || '';
              const origText = button.textContent;
              try {
                button.disabled = true;
                button.textContent = 'Loading…';
                await xmlCiiLoadDefaultMaster(masterKey, true);
                notify({ level: 'success', title: 'XML->CII Masters', message: `Loaded ${XML_CII_MASTER_DEFS[masterKey]?.title || masterKey}.` });
              } catch (err) {
                notify({ level: 'error', title: 'XML->CII Masters', message: _toText(err?.message || err) });
              } finally {
                if (target.isConnected) rerender();
                else { button.disabled = false; button.textContent = origText; }
              }
            });
          });

          // Workbook Sheet: the same production mapping as the inline shell.
          target.querySelectorAll('[data-xml-cii-sheet]').forEach((select) => {
            select.addEventListener('change', () => {
              const masterKey = select.getAttribute('data-xml-cii-sheet') || 'linelist';
              xmlCiiSelectMasterSheet(masterKey, select.value);
              if (target.isConnected) rerender();
            });
          });

          // Auto Map Fields
          target.querySelectorAll('[data-xml-cii-auto-map]').forEach((button) => {
            button.addEventListener('click', () => {
              const masterKey = button.getAttribute('data-xml-cii-auto-map') || 'linelist';
              const local = xmlCiiLocalMasterState(masterKey);
              if (masterKey === 'linelist') {
                const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
                local.fieldMap = _detectLineListFieldMap(local.rawRows, local.fieldMap, config);
              } else {
                local.fieldMap = _xmlCiiAutoMapFields(_xmlCiiHeadersFromRows(local.rawRows), XML_CII_MASTER_DEFS[masterKey], local.rawRows);
              }
              if (local.rawRows.length) xmlCiiSaveMasterRows(masterKey);
              rerender();
            });
          });

          // Column field-map dropdowns
          target.querySelectorAll('[data-xml-cii-field-map]').forEach((select) => {
            select.addEventListener('change', (event) => {
              if (!event.isTrusted) return;
              const masterKey = target.dataset.xmlCiiActiveMaster || 'linelist';
              const fieldName = select.getAttribute('data-xml-cii-field-map') || '';
              xmlCiiLocalMasterState(masterKey).fieldMap[fieldName] = select.value;
              if (xmlCiiLocalMasterState(masterKey).rawRows.length) xmlCiiSaveMasterRows(masterKey);
              else rerender();
            });
          });

          // Dynamic mapped fields
          target.querySelectorAll('[data-xml-cii-dynamic-map]').forEach((button) => {
            button.addEventListener('click', () => {
              const masterKey = button.getAttribute('data-xml-cii-dynamic-map') || 'linelist';
              xmlCiiSaveDynamicMappedFields(masterKey);
              notify({ level: 'success', title: 'Dynamic Mapping', message: 'Dynamic mapped fields saved.' });
            });
          });

          target.querySelectorAll('[data-xml-cii-use-linelist-template]').forEach((button) => {
            button.addEventListener('click', () => {
              const select = button.parentElement?.querySelector('[data-xml-cii-linelist-template]');
              try {
                const template = xmlCiiApplyLineListMappingTemplate(select?.value || '');
                notify({ level: 'success', title: 'Line List Mapping', message: `Applied mapped row template for ${template.fileName}.` });
                rerender();
              } catch (err) {
                notify({ level: 'error', title: 'Line List Mapping', message: _toText(err?.message || err) });
              }
            });
          });

          // Save Mapped Rows
          target.querySelectorAll('[data-xml-cii-save-master]').forEach((button) => {
            button.addEventListener('click', () => {
              const masterKey = button.getAttribute('data-xml-cii-save-master') || 'linelist';
              if (masterKey === 'linelist') xmlCiiSaveDynamicMappedFields(masterKey);
              xmlCiiSaveMasterRows(masterKey, { saveMappingTemplate: masterKey === 'linelist' });
              rerender();
            });
          });

          // Clear
          target.querySelectorAll('[data-xml-cii-clear-master]').forEach((button) => {
            button.addEventListener('click', () => {
              xmlCiiClearMasterRows(button.getAttribute('data-xml-cii-clear-master') || 'linelist');
              rerender();
            });
          });

          // Auto-load defaults on first open if no rows are saved yet
          setTimeout(async () => {
            if (!target.isConnected) return;
            const config = _parseXmlCiiEnrichmentConfig(activeValues().supportConfigJson);
            let loaded = false;
            for (const masterKey of XML_CII_MASTER_ORDER) {
              const masterDef = XML_CII_MASTER_DEFS[masterKey];
              if (!masterDef.defaultUrl) continue;
              const savedRows = _xmlCiiMasterRowsFromConfig(config, masterDef);
              if (savedRows.length || xmlCiiLocalMasterState(masterKey).rawRows.length) continue;
              try {
                await xmlCiiLoadDefaultMaster(masterKey, true);
                loaded = true;
              } catch (err) {
                console.warn(`XML→CII popup: auto-load default failed for ${masterKey}`, err);
              }
            }
            if (loaded && target.isConnected) rerender();
          }, 0);
        }

        // Run phase: bind options and override "Review Weight Matches" to switch
        // the popup tab instead of re-rendering the main tab workflow.
        if (phaseId === 'run') {
          target.querySelectorAll('[data-xml-cii-run-option]').forEach((el) => {
            el.addEventListener('change', (event) => {
              if (!event.isTrusted) return;
              const key = el.getAttribute('data-xml-cii-run-option') || '';
              const values = activeValues();
              if (el.type === 'checkbox') values[key] = el.checked;
              else values[key] = el.value;
              persist();
              renderAdvanced();
            });
          });
          target.querySelectorAll('[data-xml-cii-run-from-workflow]').forEach((btn) => {
            btn.addEventListener('click', () => {
              if (typeof self.switchPhase === 'function') self.switchPhase('weight-match');
            });
          });
          target.querySelectorAll('[data-xml-cii-finalize-run]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const _capturedFile = primaryInputEl?.files?.[0] || primaryFile;
              const _capturedConfig = xmlCiiConfigWithLoadedMasterRows('XML->CII popup Run preflight');
              const missing = missingPersistedXmlCiiMasters(_capturedConfig);
              if (missing.length) {
                const message = missingPersistedXmlCiiMastersNotice(missing);
                notify({ level: 'error', title: 'XML->CII Run blocked', message });
                setStatus(message, 'bad');
                return;
              }
              if (typeof self.closePopup === 'function') self.closePopup();
              const triggerRun = () => { document.querySelector('#model-converters-run')?.click(); };
              await runXmlCiiStandalonePostRunValidation({
                xmlFile: _capturedFile,
                resolveStagedJsonText: (cfg) => xmlCiiCurrentStagedJsonSource(cfg || _capturedConfig),
                config: _capturedConfig,
                enrichXmlForCii2019: async (xmlText, jsonText, opts) => {
                  const vals = activeValues();
                  return _enrichXmlForCii2019(xmlText, jsonText, { ...vals, supportConfigJson: JSON.stringify(_capturedConfig), dryRun: true, ...opts });
                },
                onClose: triggerRun,
                onNoIssues: triggerRun,
              });
            });
          });
        }

        if (phaseId === 'weight-match') bindXmlCiiWeightMatchPhase(target, target);
        // Step 4 popup Preview is initialized above by the adapted v7 wrapper;
        // never attach the legacy v5 renderer's Build handler here.
        if (phaseId === 'diagnostics') bindXmlCiiDiagnosticsPhase(target, target);
        if (phaseId === 'support-mapper') bindXmlCiiSupportMapperPhase(target);
        if (phaseId === 'config') bindXmlCiiConfigPhase(target);
      } catch (bindErr) {
        console.warn(`XML→CII workflow: binding for phase "${phaseId}" failed (content still shown)`, bindErr);
      }
    },
  };

  return () => {
    disposed = true;
    _xmlCiiPhaseBridge = null;
    try { runtime?.dispose(); } catch {}
    try { previewRenderer?._3DModelConv_destroy?.(); } catch {}
  };
}

export { renderModelConvertersTab as renderLegacyModelConvertersTab };

// Bridge exposed so popup can render the same interactive phase panels inline.
// Populated by renderModelConvertersTab; null until the tab is first mounted.
let _xmlCiiPhaseBridge = null;
export function getXmlCiiPhaseBridge() { return _xmlCiiPhaseBridge; }
