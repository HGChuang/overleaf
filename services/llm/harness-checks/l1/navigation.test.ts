import { sourceNavigationCases } from './navigation-source-experiment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationCases, navigationChecks, navigationConciseCases } from './navigation-experiment.mjs';
test('navigation pairs hold tasks and seeded evidence constant with counterbalanced order',()=>{
 assert.equal(navigationCases.length,18);
 for(const pairId of new Set(navigationCases.map(c=>c.pairId))){
  const pair=navigationCases.filter(c=>c.pairId===pairId);
  assert.equal(pair.length,2);
  const strip=({id,arm,...rest}:any)=>rest;
  assert.deepEqual(strip(pair[0]),strip(pair[1]));
  assert.equal(pair[0].targetMessage,2+pair[0].seed.policyLeadMessages);
  assert.equal(pair[0].seed.manualCompact,false);
 }
});
test('navigation oracle rejects wrong-message and missing-page evidence and counts detours',()=>{
 const c=navigationCases[0];
 const call=(message:number,offset=0)=>({role:'assistant',content:[{type:'toolCall',name:'read_context_history',arguments:{message,offset}}]});
 const result=(message:number,offset:number,content:string)=>({role:'toolResult',toolName:'read_context_history',content:[{text:JSON.stringify({message,offset,content})}]});
 assert.equal(navigationChecks(c,[call(0),result(0,0,'FINAL CAPTION: Sensitivity results')]).evidencePassed,false);
 assert.equal(navigationChecks(c,[result(c.targetMessage,800,'FINAL CAPTION: Sensitivity results')]).evidencePassed,false);
 const good=navigationChecks(c,[call(0),call(c.targetMessage),call(c.targetMessage),result(c.targetMessage,0,'FINAL CAPTION: Sensitivity results')]);
 assert.equal(good.evidencePassed,true);assert.equal(good.offTargetAttempts,1);assert.equal(good.duplicateTargetAttempts,1);
});

test('concise follow-up freezes one pair per layout without retrying B',()=>{
 assert.equal(navigationConciseCases.length,6);
 for(const variant of ['short','long','late-long'])assert.deepEqual(navigationConciseCases.filter(c=>c.variant===variant).map(c=>c.arm).sort(),['A','C']);
});

test('named-source pairs retain unchanged evidence and tasks across six pairs',()=>{
 assert.equal(sourceNavigationCases.length,12);
 for(const id of new Set(sourceNavigationCases.map(c=>c.pairId))){
  const [a,b]=sourceNavigationCases.filter(c=>c.pairId===id);
  const strip=({id,arm,...rest}:any)=>rest;assert.deepEqual(strip(a),strip(b));
 }
});
