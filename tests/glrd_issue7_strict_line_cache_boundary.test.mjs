/**
 * Issue #7 strict-line boundary contract probes.
 * Executes the actual quarantined wrapper and per-build cache; only the
 * buildCorePreview/branch-fragment adapter is injected to force fallback.
 * Passing expected hazard tests does not certify cache safety.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStrictLineAuthorityCorePreview } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js';
import { createPreviewPerBuildCache } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-per-build-cache.js';
import { buildPipingClassIndex } from '../converters/xml-cii2019-core/piping-class-resolver.js';

const F='BRANCH_FUZZY';
const X='BRANCH_EXACT';
function cfg(){
  return {
    linelist:{masterRows:[{'Service':'P','Line Number':'10001'}],fieldMap:{}},
    pipingClass:{masterRows:[{'Piping Class':'91261',DN:50,Rating:900}]},
    weight:{masterRows:[{bore:50,rating:900,length:100,weight:10}]},
    overrides:{},
  };
}
function result(lineKeyMethod,branchName){
  return {branchRows:[{branchName,lineKey:'P10001',lineKeyMethod,lineMiss:lineKeyMethod!=='exact',p1:'111'}],
    nodeRows:[{branchName,key:branchName+'-node',rating:'900'}]};
}
test('strict fallback: source wrapper executes two core calls, invalidates fuzzy source node, preserves exact branch',()=>{
  const config=cfg(),cache=createPreviewPerBuildCache(), calls=[];
  const sourceRows=config.linelist.masterRows, classRows=config.pipingClass.masterRows, weightRows=config.weight.masterRows;
  const output=buildStrictLineAuthorityCorePreview('<Root/>',config,'', {
    previewCache:cache,
    buildCorePreview(xml,c,staged,providedCache){
      calls.push({xml,c,providedCache});
      if(calls.length===1) return {branchRows:[
        result('exact',X).branchRows[0],
        result('similar-linekey',F).branchRows[0],
      ],nodeRows:[
        result('exact',X).nodeRows[0],
        result('similar-linekey',F).nodeRows[0],
      ]};
      assert.equal(xml,'<Root><Branch id="fuzzy"/></Root>');
      assert.notStrictEqual(c,config,'strict fallback must be separate top-level config');
      assert.notStrictEqual(c.linelist,config.linelist,'strict fallback must clone line-list config');
      assert.equal(c.linelist.masterRows.length,0,'strict fallback must block line-list master authority');
      assert.strictEqual(c.pipingClass.masterRows,classRows,'nested piping class rows shared');
      assert.strictEqual(c.weight.masterRows,weightRows,'nested weight master rows shared');
      assert.strictEqual(c.weight,config.weight,'weight config object shared');
      assert.strictEqual(providedCache,cache,'same cache instance is threaded into strict replay');
      return {branchRows:[{...result('none',F).branchRows[0],p1:''}],nodeRows:[{branchName:F,key:'strict-node'}]};
    },
    branchFragments(){return [{xmlText:'<Root><Branch id="exact"/></Root>'},{xmlText:'<Root><Branch id="fuzzy"/></Root>'}];},
  });
  assert.equal(calls.length,2);
  assert.strictEqual(config.linelist.masterRows,sourceRows);
  assert.deepStrictEqual(output.nodeRows.map(r=>r.key).sort(),[X+'-node','strict-node'].sort());
  assert.equal(output.strictLineAuthority.automaticMatchesRemoved,1);
  assert.equal(output.branchRows[1].lineKeyMethod,'none');
  assert.equal(output.branchRows[1].lineMiss,true);
  assert.equal(output.branchRows[1].automaticLineMatchRemoved,true);
  assert.equal(output.branchRows[0].lineKeyMethod,'exact');
  console.log('STRICT_LINE_AUDIT '+JSON.stringify({id:'SL-01',coreCalls:calls.length,automaticRemoved:1,
    sharedCache:true,sharedClassRows:true,sharedWeightRows:true}));
});

test('strict fallback: same master-row identity creates a stale shared index after injected mid-replay edit',()=>{
  const config=cfg(),cache=createPreviewPerBuildCache(),observed=[];
  const output=buildStrictLineAuthorityCorePreview('<Root/>',config,'',{
    previewCache:cache,
    buildCorePreview(xml,c,staged,providedCache){
      const idx=providedCache.getPipingClassIndex(c.pipingClass.masterRows);
      observed.push({known:[...idx.knownClasses],fresh:[...buildPipingClassIndex(c.pipingClass.masterRows).knownClasses]});
      return result(observed.length===1?'similar-lineseq':'none',F);
    },
    branchFragments(){
      config.pipingClass.masterRows.push({'Piping Class':'91262',DN:50,Rating:900});
      return [{xmlText:'<Root><Branch id="fuzzy"/></Root>'}];
    },
  });
  assert.equal(observed.length,2);
  assert.deepStrictEqual(observed[0].known,['91261']);
  assert.deepStrictEqual(observed[1].known,['91261']);
  assert.deepStrictEqual(observed[1].fresh,['91261','91262']);
  assert.equal(cache.stats.classHits,1);
  assert.equal(output.strictLineAuthority.automaticMatchesRemoved,1);
  console.log('STRICT_LINE_AUDIT '+JSON.stringify({id:'SL-02',finding:'SHARED_ROW_IDENTITY_STALE_AFTER_INJECTED_MUTATION',
    sourceConfigClassRows:config.pipingClass.masterRows.length,
    cachedClasses:observed[1].known,freshClasses:observed[1].fresh}));
});

test('strict fallback: no automatic match must not reenter core or fragments',()=>{
  const config=cfg(),cache=createPreviewPerBuildCache(),calls=[];
  const out=buildStrictLineAuthorityCorePreview('<Root/>',config,'',{
    previewCache:cache,buildCorePreview(...args){calls.push(args);return result('exact',X);},
    branchFragments(){throw Error('Should not request fragments on exact line match');},
  });
  assert.equal(calls.length,1);
  assert.equal(out.strictLineAuthority,undefined);
  assert.equal(out.branchRows[0].lineKeyMethod,'exact');
  console.log('STRICT_LINE_AUDIT '+JSON.stringify({id:'SL-03',coreCalls:1,strictFallback:false}));
});
