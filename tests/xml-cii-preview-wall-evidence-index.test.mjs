import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  collectIndexedStagedBranchWallEvidence,
  collectStagedBranchWallEvidence,
  indexStagedBranchWallEvidence,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-wall-evidence.js';

const stage = {
  children: [
    { type: 'BRANCH', name: '/P-100-2"/B1', children: [
      { type: 'PIPE', attributes: { DTXR: 'PIPE NPS 2 SCH 80', REF: '=A', OD: '60.3' } },
      { type: 'FLAN', attributes: { DTXR_POS: 'Wth 40.0 API 6A',
        DTXR: 'SCH 40', NAME: '=B', ABORE: '50' } },
      { type: 'PIPE', attributes: { DTXR: 'PIPE NPS 2 SCH 80', REF: '=A', OD: '60.3' } },
      { type: 'PIPE', attributes: { REF: 'no-evidence' } },
    ] },
    { type: 'BRANCH', name: '/P-200-4"/B2', children: [
      { type: 'OLET', name: 'OLET Sch 40S', attributes: { LBORE: '100' } },
      { type: 'ATTA', attributes: { OWNER: '/P-100-2"/B9',
        DESC: 'owned by P-100', REF: '=C' } },
    ] },
  ],
};
const keys = ['/P-100-2"/B1', '/P-100-2"/B7', '/P-200-4"/B2', '/P-NOMATCH'];

test('single-pass index preserves exact cross-branch order, duplicates, and owner overrides', () => {
  const json = JSON.stringify(stage);
  const index = indexStagedBranchWallEvidence(json);
  for (const branch of keys) {
    assert.deepEqual(
      collectIndexedStagedBranchWallEvidence(index, branch),
      collectStagedBranchWallEvidence(json, branch),
      branch,
    );
  }
  const p100 = collectIndexedStagedBranchWallEvidence(index, keys[0]);
  assert.deepEqual(p100.map((row) => row.componentType), ['PIPE', 'FLAN', 'PIPE', 'ATTA']);
  assert.equal(p100[0].boreMm, 50);
  assert.equal(p100[1].dtxr, 'Wth 40.0 API 6A');
  assert.equal(p100[0].source, 'staged-json');
  assert.deepEqual(p100[0], p100[2]);
  assert.deepEqual(collectIndexedStagedBranchWallEvidence(index, keys[0]), p100);
  assert.deepEqual(collectIndexedStagedBranchWallEvidence(index, keys[3]), []);
});

test('source object and invalid JSON maintain original empty/fallback behavior', () => {
  const index = indexStagedBranchWallEvidence(stage);
  for (const branch of keys) {
    assert.deepEqual(
      collectIndexedStagedBranchWallEvidence(index, branch),
      collectStagedBranchWallEvidence(stage, branch),
    );
  }
  for (const invalid of ['{invalid', '', 'null']) {
    const badIndex = indexStagedBranchWallEvidence(invalid);
    assert.ok(badIndex instanceof Map);
    assert.deepEqual(collectIndexedStagedBranchWallEvidence(badIndex, keys[0]), []);
    assert.deepEqual(collectStagedBranchWallEvidence(invalid, keys[0]), []);
  }
});

test('GLRD external trace has identical branch evidence when explicitly supplied', {
  skip: !process.env.GLRD_STAGE_FILE || !process.env.GLRD_BRANCH_NAMES_FILE,
}, () => {
  const staged = readFileSync(process.env.GLRD_STAGE_FILE, 'utf8');
  const branches = JSON.parse(readFileSync(process.env.GLRD_BRANCH_NAMES_FILE, 'utf8'));
  const index = indexStagedBranchWallEvidence(staged);
  const oldRows = branches.map((branch) => collectStagedBranchWallEvidence(staged, branch));
  const newRows = branches.map((branch) => collectIndexedStagedBranchWallEvidence(index, branch));
  assert.deepEqual(newRows, oldRows);
  const count = newRows.reduce((total, items) => total + items.length, 0);
  const sha = createHash('sha256').update(JSON.stringify(newRows)).digest('hex');
  assert.equal(branches.length, 30);
  assert.equal(count, 1279);
  assert.equal(sha, '3c29d0922fe75f087e8e245c52f76c93f31ce43266f616d92cd33a4dff0b593b');
});

test('Preview wall authority performs one staged indexing pass per invocation', () => {
  const source = readFileSync(new URL(
    '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-bore-wall-authority.js',
    import.meta.url,
  ), 'utf8');
  assert.match(source, /const stagedEvidenceIndex = indexStagedBranchWallEvidence\(stagedJsonText\);/);
  assert.match(source, /collectIndexedStagedBranchWallEvidence\(stagedEvidenceIndex, branchName\)/);
  assert.doesNotMatch(source, /collectStagedBranchWallEvidence\(stagedJsonText, branchName\)/);
});
