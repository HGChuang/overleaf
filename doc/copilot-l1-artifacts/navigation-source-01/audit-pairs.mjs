import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=new URL('.',import.meta.url).pathname;
const read=p=>JSON.parse(fs.readFileSync(out+p,'utf8'));
const rows=read('results.json');
const partial=process.argv.includes('--partial');
if(!partial)assert.equal(rows.length,12);
function wires(id){return fs.readdirSync(out+id).filter(f=>/^wire-\d+-request.json$/.test(f)).sort((a,b)=>Number(a.split('-')[1])-Number(b.split('-')[1]));}
function metrics(r){
 let input=0,output=0,missing=0;
 for(const f of wires(r.id)){
  const path=out+r.id+'/'+f.replace('-request.json','-response.txt');let usage;
  if(fs.existsSync(path))for(const line of fs.readFileSync(path,'utf8').split('\n'))if(line.startsWith('data: '))try{const x=JSON.parse(line.slice(6));if(x.usage)usage=x.usage;}catch{}
  if(usage){input+=usage.prompt_tokens;output+=usage.completion_tokens;}else missing++;
 }
 return {corePassed:r.checksPassed,evidencePassed:r.navigation.evidencePassed,calls:r.calls,
  namedAttempts:r.navigation.reads.filter(x=>x.path!==undefined).length,offTarget:r.navigation.offTargetAttempts,duplicate:r.navigation.duplicateTargetAttempts,
  targetPages:r.navigation.targetSuccessfulPages,historyAttempts:r.navigation.historyAttempts,input,output,missing,elapsedMs:r.elapsedMs};
}
const pairs=[];
for(const pairId of new Set(rows.map(r=>r.pairId))){
 const a=rows.find(r=>r.pairId===pairId&&r.arm==='A'),b=rows.find(r=>r.pairId===pairId&&r.arm==='D');
 if(!a||!b){assert.ok(partial);continue;}
 assert.deepEqual(read(a.id+'/seed-history.json').messages,read(b.id+'/seed-history.json').messages,'paired seed differs');
 const firstA=read(a.id+'/'+wires(a.id)[0]).body,firstB=read(b.id+'/'+wires(b.id)[0]).body;
 const tA=firstA.tools.find(t=>t.function?.name==='read_context_history').function;
 const tB=firstB.tools.find(t=>t.function?.name==='read_context_history').function;
 assert.ok(tB.description.startsWith(tA.description));assert.ok(tB.parameters.properties.path);assert.ok(tB.parameters.properties.snapshotId);assert.notDeepEqual(tA.parameters,tB.parameters);tB.parameters=tA.parameters;
 tB.description=tA.description;assert.deepEqual(firstA,firstB,`${pairId}: first wire differs outside history interface`);
 pairs.push({pairId,A:metrics(a),D:metrics(b),firstWireOnlyHistoryInterface:true,seedIdentical:true});
}
const totals={};
for(const arm of ['A','D'])totals[arm]=Object.fromEntries(['corePassed','evidencePassed','calls','offTarget','duplicate','targetPages','historyAttempts','namedAttempts','input','output','missing','elapsedMs'].map(k=>[k,pairs.reduce((n,p)=>n+Number(p[arm][k]),0)]));
const result={complete:rows.length===12,pairs:pairs.length,totals,details:pairs};
fs.writeFileSync(out+(partial?'paired-audit-partial.json':'paired-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({complete:result.complete,pairs:result.pairs,totals},null,2));
