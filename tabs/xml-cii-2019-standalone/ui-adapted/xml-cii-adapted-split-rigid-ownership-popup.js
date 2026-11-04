const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = esc;

function groupMarkup(group, i) {
  const hasPositives = group.nodes.some((node) => Number(node.weightKg) > 0);
  const candidates = group.nodes.filter((node) =>
    node.weightKg !== null && Number.isFinite(Number(node.weightKg)) && Number(node.weightKg) > 0);
  return `<fieldset data-rigid-ownership-group="${i}" style="border:1px solid #475569;border-radius:7px;margin:12px 0;padding:12px;">
    <legend style="color:#fbbf24;font-weight:700;">Component ${i + 1}: ${esc(group.componentRefNo || 'unknown')}</legend>
    <div style="font-size:12px;color:#cbd5e1;overflow-wrap:anywhere;">
      Branch occurrence ${esc(group.branchOrdinal)} · ${esc(group.branchName)} · ${esc(group.componentOccurrenceId)}
    </div>
    <table style="border-collapse:collapse;font-size:12px;width:100%;margin:8px 0;">
      <thead><tr><th>Node occurrence</th><th>Node number</th><th>Type</th><th>Endpoint</th><th>Position</th><th>Current kg</th></tr></thead>
      <tbody>${group.nodes.map((node) => `<tr>
        <td>${esc(node.nodeOrdinal)}</td><td>${esc(node.nodeNumber)}</td>
        <td>${esc(node.componentType)}</td><td>${esc(node.endpoint)}</td>
        <td>${esc(node.position)}</td>
        <td>${node.weightKg === null ? 'MISSING' : esc(node.weightKg)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:12px 0;">
      <label>Physical allocation type
        <select data-rigid-ownership-type="${i}" style="display:block;padding:6px;background:#101827;color:white;">
          <option value="UNKNOWN">UNKNOWN — do not export</option>
          <option value="COMPONENT_LUMPED" ${candidates.length ? '' : 'disabled'}>COMPONENT_LUMPED — one owner receives full mass</option>
          <option value="SEGMENT_DISTRIBUTED" ${hasPositives ? '' : 'disabled'}>SEGMENT_DISTRIBUTED — current child masses sum to full mass</option>
          <option value="ZERO_NONOWNER">ZERO_NONOWNER — no assigned component mass</option>
        </select>
      </label>
      <label>Verified full physical component mass (kg)
        <input type="number" data-rigid-ownership-mass="${i}" min="0" step="any" placeholder="Enter independently verified kg"
          style="display:block;width:200px;padding:6px;background:#101827;color:white;">
      </label>
      <label>Receiving owner node (for lumped allocation)
        <select data-rigid-ownership-owner="${i}" style="display:block;padding:6px;background:#101827;color:white;">
          ${candidates.map((node) => `<option value="${attr(node.nodeOrdinal)}">
            Node ${esc(node.nodeNumber)} (occurrence ${esc(node.nodeOrdinal)}, ${esc(node.weightKg)} kg)
          </option>`).join('')}
        </select>
      </label>
    </div>
    <label style="display:block;font-size:12px;">
      <input type="checkbox" data-rigid-ownership-confirm="${i}">
      I have verified the physical component's full mass and allocation to the listed node occurrences.
      Empirical A1/A2 values alone do not establish mass ownership.
    </label>
  </fieldset>`;
}

export function rigidSplitOwnershipReviewMarkup(groups, options = {}) {
  return `<div role="dialog" aria-modal="true" aria-label="RIGID split component mass ownership approval"
      style="max-height:90vh;overflow:auto;max-width:1100px;width:96%;background:#0f172a;color:#e2e8f0;border:1px solid #64748b;border-radius:8px;padding:18px;">
    <h2 style="font-size:18px;">Approve physical RIGID component ownership</h2>
    <p style="font-size:12px;">${groups.length} split component occurrence(s) need explicit ownership.
      Source: ${esc(options.sourceName || options.sourceId || '')}. This decision is bound to the
      current source, masters, options and enriched XML SHA-256 snapshot.</p>
    <p style="font-size:11px;overflow-wrap:anywhere;">Snapshot: ${esc(options.snapshotDigest || 'unavailable')}</p>
    <p style="font-size:12px;">Select COMPONENT_LUMPED for one positive owner and explicit zero non-owners,
      SEGMENT_DISTRIBUTED only when each existing child weight is a genuinely allocated
      physical segment mass, or ZERO_NONOWNER only if all weights are explicitly zero.
      UNKNOWN or missing evidence blocks Python export. No weight is changed in this dialog.</p>
    ${groups.map(groupMarkup).join('')}
    <p role="status" data-rigid-ownership-status style="color:#fca5a5;min-height:18px;"></p>
    <div style="display:flex;justify-content:flex-end;gap:12px;">
      <button type="button" data-rigid-ownership-cancel>Cancel export</button>
      <button type="button" data-rigid-ownership-submit>Approve physical allocations</button>
    </div>
  </div>`;
}

export function collectRigidSplitOwnershipDecisions(groups, options, read) {
  const sourceId = String(options.sourceId || '');
  const snapshotDigest = String(options.snapshotDigest || '');
  if (!sourceId || !/^sha256:[a-f0-9]{64}$/.test(snapshotDigest)) {
    throw new Error('Secure source-bound approval snapshot missing.');
  }
  const allocationsById = {};
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const type = read('type', i);
    const massRaw = String(read('mass', i) ?? '').trim();
    const kg = Number(massRaw);
    const confirmed = read('confirm', i) === true;
    if (!confirmed || massRaw === '' || !Number.isFinite(kg) || kg < 0) {
      throw new Error('Confirm and enter the verified full physical mass for component ' + group.componentRefNo);
    }
    let decision;
    if (type === 'COMPONENT_LUMPED') {
      const ownerNodeOrdinal = Number(read('owner', i));
      const owner = group.nodes.find((node) => node.nodeOrdinal === ownerNodeOrdinal);
      if (!owner || kg <= 0 || owner.weightKg !== kg ||
          group.nodes.some((node) => node !== owner && node.weightKg !== 0)) {
        throw new Error('Lumped mass must equal one positive owner and all other sibling masses must be exactly zero.');
      }
      decision = { ownerNodeOrdinal };
    } else if (type === 'SEGMENT_DISTRIBUTED') {
      const children = group.nodes.map((node) => ({
        nodeOrdinal: node.nodeOrdinal, massKg: node.weightKg,
      }));
      if (children.some((child) => child.massKg === null || !Number.isFinite(child.massKg) || child.massKg < 0) ||
          kg <= 0 || Math.abs(children.reduce((total, child) => total + child.massKg, 0) - kg) > 1e-8) {
        throw new Error('Distributed child masses must be nonnegative, explicit and conserve the verified component mass.');
      }
      decision = { childMassesKg: children };
    } else if (type === 'ZERO_NONOWNER') {
      if (kg !== 0 || group.nodes.some((node) => node.weightKg !== 0)) {
        throw new Error('ZERO_NONOWNER requires exactly zero physical mass on every child.');
      }
      decision = {};
    } else {
      throw new Error('UNKNOWN physical ownership cannot authorize RIGID export.');
    }
    if (!group.componentOccurrenceId || allocationsById[group.componentOccurrenceId]) {
      throw new Error('Duplicate or missing component occurrence identity.');
    }
    allocationsById[group.componentOccurrenceId] = {
      sourceId, snapshotDigest, allocationType: type, componentMassKg: kg,
      approvedByEngineer: true,
      approvalKind: 'EXPLICIT_PHYSICAL_COMPONENT_MASS_OWNERSHIP',
      ...decision,
    };
  }
  return { cancelled: false, allocationsById };
}

export function openStandaloneRigidSplitOwnershipPopup(groups, options = {}) {
  if (!Array.isArray(groups) || !groups.length) return Promise.resolve({ cancelled: false, allocationsById: {} });
  if (typeof document === 'undefined') return Promise.resolve({ cancelled: true });
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'model-converters-workflow-popup-overlay mc-rigid-ownership-overlay';
    overlay.innerHTML = rigidSplitOwnershipReviewMarkup(groups, options);
    document.body.appendChild(overlay);
    let closed = false;
    const finish = (decision) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      resolve(decision);
    };
    overlay.querySelector('[data-rigid-ownership-cancel]')?.addEventListener('click', () =>
      finish({ cancelled: true, allocationsById: {} }));
    overlay.querySelector('[data-rigid-ownership-submit]')?.addEventListener('click', () => {
      const read = (part, i) => {
        const el = overlay.querySelector(`[data-rigid-ownership-${part}="${i}"]`);
        return part === 'confirm' ? el?.checked === true : el?.value;
      };
      try {
        finish(collectRigidSplitOwnershipDecisions(groups, options, read));
      } catch (error) {
        const status = overlay.querySelector('[data-rigid-ownership-status]');
        if (status) status.textContent = error?.message || String(error);
      }
    });
  });
}
