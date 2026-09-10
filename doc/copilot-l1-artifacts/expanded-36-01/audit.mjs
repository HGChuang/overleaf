import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const out=new URL('.',import.meta.url).pathname;
const read=f=>JSON.parse(fs.readFileSync(out+f,'utf8'));
const rows=read('results.json'), dataset=read('dataset.json');
assert.equal(rows.length,36,'Retain incomplete cases; do not report a partial suite as complete');
const sha=v=>createHash('sha256').update(v).digest('hex');
assert.ok(Object.entries(read('config.json').sourceManifest).every(([p,h])=>sha(fs.readFileSync(p))===h),'Frozen source changed');
const audits=[];
for(const r of rows){
 const c=dataset.find(c=>c.id===r.id),events=fs.readFileSync(out+r.id+'/events.jsonl','utf8').trim().split('\n').map(JSON.parse);
 const history=read(r.id+'/history.json')?.messages||[];
 const receipts=events.filter(e=>e.kind==='tool_receipt').map(e=>e.data);
 let archives=0,rehydrations=0,sourcePages=0,canonicalHunks=0;
 const errors=[];
 for(let i=0;i<history.length;i++){
  const m=history[i];if(m.role!=='toolResult')continue;
  if(m.isError)errors.push({index:i,name:m.toolName,text:m.content});
  let v;try{v=JSON.parse(m.content[0].text)}catch{continue;}
  if(v.archived){assert.equal(v.resultMessage,i,`${r.id}: wrong archive index`);assert.ok(receipts.some(x=>x.toolCallId===m.toolCallId));archives++;}
  if(m.toolName==='read_context_history'&&!m.isError){
   const target=history[v.message];assert.ok(target);
   const original=target.role==='toolResult'?(receipts.find(x=>x.toolCallId===target.toolCallId)||target):target;
   assert.equal(v.content,JSON.stringify(original).slice(v.offset,v.offset+800),`${r.id}: rehydration bytes`);rehydrations++;
  }
  if(!m.isError&&v.found&&typeof v.lineNumberedContent==='string'&&c.files[v.path]!==undefined){
   // Seeded historical policy is absent from current files; only current source is checked here.
   const decoded=v.lineNumberedContent.split('\n').map((s,n)=>{const prefix=`${v.startLine+n}: `;assert.ok(s.startsWith(prefix));return s.slice(prefix.length);}).join('\n');
   const bytes=Buffer.from(c.files[v.path]);assert.equal(decoded,bytes.subarray(v.startByte,v.endByte).toString());assert.equal(v.sourceHash,sha(bytes));sourcePages++;
  }
 }
 for(const p of read(r.id+'/backend-records.json').proposals)for(const h of p.hunks){
  if(h.oldText){const source=c.files[h.file];const start=source.indexOf(h.oldText);assert.ok(start>=0&&source.indexOf(h.oldText,start+1)<0);assert.equal(h.line,source.slice(0,start).split('\n').length);}
  canonicalHunks++;
 }
 const taskRequests=events.filter(e=>e.kind==='model_request'&&e.data.options.maxTokens!==4096);
 let authorConstraintsPreserved=null;
 if(c.seed&&taskRequests.length){
  for(const e of taskRequests){
   const authors=e.data.context.messages.filter(m=>m.role==='user').flatMap(m=>{
    if(typeof m.content!=='string')return [];
    try{const v=JSON.parse(m.content);return v.PAPER_CHECKPOINT?v.PAPER_CHECKPOINT.authorRequests.map(a=>a.text):[v.MESSAGE||m.content];}catch{return [m.content];}
   });
   for(const text of c.seed.authorTexts)assert.ok(authors.includes(text),`${r.id}: author requirement absent from actual task model view`);
  }
  authorConstraintsPreserved=true;
 }
 let wireTotal=0,missingWireUsage=0;
 for(const f of fs.readdirSync(out+r.id).filter(f=>/^wire-\d+-request.json$/.test(f))){
  const response=out+r.id+'/'+f.replace('-request.json','-response.txt');let usage;
  if(fs.existsSync(response))for(const line of fs.readFileSync(response,'utf8').split('\n'))if(line.startsWith('data: ')&&line!=='data: [DONE]'){
   try{const x=JSON.parse(line.slice(6));if(x.usage)usage=x.usage;}catch{}
  }
  if(usage)wireTotal+=usage.total_tokens;else missingWireUsage++;
 }
 if(!missingWireUsage&&r.usageComplete)assert.equal(wireTotal,r.reportedTotalTokens,`${r.id}: usage mismatch`);
 audits.push({id:r.id,corePassed:r.checksPassed,mechanismCovered:r.mechanismCovered,failures:r.failures,coverageFailures:r.coverageFailures,
  authorConstraintsPreserved,calls:r.calls,tokens:r.reportedTotalTokens,wireTotal,missingWireUsage,archives,rehydrations,sourcePages,canonicalHunks,errors,
  compactions:read(r.id+'/coverage.json').compactions,answer:r.answer});
}
const summary={cases:36,corePassed:audits.filter(a=>a.corePassed).length,mechanismCovered:audits.filter(a=>a.mechanismCovered).length,
 calls:audits.reduce((n,a)=>n+a.calls,0),reportedTokens:audits.reduce((n,a)=>n+a.tokens,0),unknownUsageRequests:audits.reduce((n,a)=>n+a.missingWireUsage,0),
 archives:audits.reduce((n,a)=>n+a.archives,0),rehydrations:audits.reduce((n,a)=>n+a.rehydrations,0),sourcePages:audits.reduce((n,a)=>n+a.sourcePages,0),canonicalHunks:audits.reduce((n,a)=>n+a.canonicalHunks,0),sourceUnchanged:true};
fs.writeFileSync(out+'audit.json',JSON.stringify({summary,cases:audits},null,2));console.log(JSON.stringify(summary,null,2));
