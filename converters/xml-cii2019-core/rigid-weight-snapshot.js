/**
 * Cryptographic custody of RIGID ownership decisions. The digest covers the
 * exact source, staged JSON, selected branches, master/config bytes, options,
 * and prepared enriched XML. Approval/allocation records are excluded from
 * the digest to avoid circular self-hashing; policy changes remain included.
 */
function text(value) { return value == null ? '' : String(value); }
function sanitizedConfig(raw) {
  let config;
  try { config = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw; }
  catch { throw new Error('Invalid support config: ownership snapshot cannot be approved.'); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Support config must be a JSON object for ownership snapshot.');
  }
  const clean = { ...config };
  if (clean.rigidOwnership && typeof clean.rigidOwnership === 'object') {
    clean.rigidOwnership = { ...clean.rigidOwnership };
    delete clean.rigidOwnership.allocations;
    delete clean.rigidOwnership.approvedSnapshotDigest;
    // Saving a first-time allocation creates rigidOwnership in config.
    // The empty approval-only container is not a policy change and must not
    // invalidate its own persisted snapshot on the next identical run.
    if (!Object.keys(clean.rigidOwnership).length) delete clean.rigidOwnership;
  }
  return clean;
}
export async function digestRigidOwnershipSnapshot({
  sourceId = '', sourceName = '', sourceText = '', stagedJsonText = '',
  supportConfigJson = '{}', branchSelection = null, options = {},
  preparedXmlText = '',
} = {}) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder === 'undefined') {
    throw new Error('Secure SHA-256 unavailable: RIGID ownership approval must fail closed.');
  }
  const safeOptions = { ...(options || {}) };
  delete safeOptions.verifiedWeightSnapshotDigest;
  const snapshot = JSON.stringify({
    schema: 'rigid-ownership-approval-snapshot/v1',
    sourceId: text(sourceId),
    sourceName: text(sourceName),
    sourceText: text(sourceText),
    stagedJsonText: text(stagedJsonText),
    supportConfig: sanitizedConfig(supportConfigJson),
    branchSelection,
    options: safeOptions,
    preparedXmlText: text(preparedXmlText),
  });
  const raw = await subtle.digest('SHA-256', new TextEncoder().encode(snapshot));
  return 'sha256:' + [...new Uint8Array(raw)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
