import assert from 'node:assert/strict';
import { reconcileApprovedRigidComponentMasses } from '../converters/xml-cii2019-core/rigid-weight-post-python-reconcile.js';

// Two children of one physical RIGID component. The authoritative Python
// ledger preserves the original branch/node occurrence after normalization.
const component = {
  componentOccurrenceId:'rigid-split:source-A:branch-0:node-1:ref-F',
  branchOrdinal:0, componentRefNo:'=F', status:'VALIDATED',
  allocationType:'COMPONENT_LUMPED', authorizedComponentMassKg:15,
  positiveNodes:1,
  nodes:[{nodeOrdinal:1,weightKg:0},{nodeOrdinal:2,weightKg:15}],
};
const actual = {rows:[
  {branchOccurrence:0,toNodeOccurrence:1,componentRefNo:'=F',massKg:0},
  {branchOccurrence:0,toNodeOccurrence:2,componentRefNo:'=F',massKg:15},
]};
let result=reconcileApprovedRigidComponentMasses([component],actual);
assert.equal(result.approvedGroups,1);
assert.equal(result.authorizedMassKg,15);
assert.equal(result.emittedMassKg,15);

await assert.rejects(async()=>reconcileApprovedRigidComponentMasses([
  {...component, authorizedComponentMassKg:30},
],actual),/lost or duplicated approved physical component mass/);
assert.throws(()=>reconcileApprovedRigidComponentMasses([
  {...component,status:'OWNERSHIP_UNVERIFIED'},
],actual),/no validated engineer physical allocation/);
assert.throws(()=>reconcileApprovedRigidComponentMasses([
  {...component,nodes:[component.nodes[0],component.nodes[0]]},
],actual),/Duplicate child source occurrence/);

// A segment-distributed physical component can be approved at 5+10 kg.
// If the converter prunes the first child, only 10 kg emits. Individual
// emitted RIGID weights can be perfectly valid, but 5 kg is lost overall.
const distributed={...component,allocationType:'SEGMENT_DISTRIBUTED',
  positiveNodes:2,nodes:[{nodeOrdinal:1,weightKg:5},{nodeOrdinal:2,weightKg:10}]};
result=reconcileApprovedRigidComponentMasses([distributed],{
  rows:[{...actual.rows[0],massKg:5},{...actual.rows[1],massKg:10}],
});
assert.equal(result.emittedMassKg,15);
assert.throws(()=>reconcileApprovedRigidComponentMasses([distributed],{
  rows:[{...actual.rows[0],massKg:0},{...actual.rows[1],massKg:10}],
}),/approved 15 kg, emitted 10 kg/);
assert.throws(()=>reconcileApprovedRigidComponentMasses([component],{
  rows:[...actual.rows,{...actual.rows[1],massKg:15}],
}),/approved 15 kg, emitted 30 kg/);
assert.throws(()=>reconcileApprovedRigidComponentMasses([component],{
  rows:actual.rows.map(row=>({...row,branchOccurrence:1})),
}),/approved 15 kg, emitted 0 kg/);
assert.deepEqual(reconcileApprovedRigidComponentMasses([
  {...component,status:'NO_POSITIVE_MASS',positiveNodes:0},
],{rows:[]}),{
  schema:'rigid-approved-component-export-conservation/v1',
  approvedGroups:0, authorizedMassKg:0, emittedMassKg:0,
});
assert.throws(()=>reconcileApprovedRigidComponentMasses(undefined,actual),/ledger.*required/);
console.log('RIGID_APPROVED_COMPONENT_MASS_CII_CONSERVATION_PASS');
