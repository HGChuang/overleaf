import test from 'node:test';
import assert from 'node:assert/strict';
import { expandedCases } from './expanded-cases.mjs';
import { referenceFiles } from './cases.mjs';
import { checkFiles, materialize } from './oracle.mjs';

test('36 frozen cases have feasible exact reference edits and reject partial/no-op outcomes',()=>{
  assert.equal(expandedCases.length,36);
  assert.equal(new Set(expandedCases.map(c=>c.id)).size,36);
  for(const c of expandedCases){
    const reference=referenceFiles(c); assert.deepEqual(checkFiles(c,reference),[]);
    if(c.outcome!=='proposal')continue;
    assert.ok(checkFiles(c,c.files).length);
    assert.deepEqual(materialize(c.files,c.regions.map(r=>({file:r.file,oldText:r.before,newText:r.reference}))),reference);
    if(c.regions.length>1){const partial={...reference,[c.regions[0].file]:c.files[c.regions[0].file]};assert.ok(checkFiles(c,partial).length);}
  }
});
test('Stress mechanisms are explicit; historical policies are not leaked through current files',()=>{
  assert.equal(expandedCases.filter(c=>c.requireHistory).length,6);
  assert.equal(expandedCases.filter(c=>c.requireCompaction).length,6);
  for(const c of expandedCases.filter(c=>c.seed?.policy)){
    assert.ok(!Object.hasOwn(c.files,'prior-decision.tex'));
    assert.ok(c.seed.manualCompact);
    assert.ok(!c.prompt.includes(c.regions[0].reference));
  }
  for(const c of expandedCases.filter(c=>c.effectiveWindow))assert.equal(c.effectiveWindow,65536);
});
