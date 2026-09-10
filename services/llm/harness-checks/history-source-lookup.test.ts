import test from 'node:test';
import assert from 'node:assert/strict';
import { withHistorySourceLookup } from '../app/agent/context/history-source-lookup.js';
import { defineTool } from '../app/agent/tools/baseTool.js';
import { validateToolArguments } from '../app/agent/core/validation.js';
const pair=(snapshotId:string,callId='read')=>[
 {role:'assistant',content:[{type:'toolCall',id:callId,name:'read_file',arguments:{path:'defs.tex'}}]},
 {role:'toolResult',toolCallId:callId,toolName:'read_file',isError:false,content:[{type:'text',text:JSON.stringify({found:true,path:'defs.tex',snapshotId,sourceHash:snapshotId,startByte:0,endByte:4,lineNumberedContent:'1: text'})}]},
] as any[];
function setup(messages:any[],recoverTool?:any){
 const calls:any[]=[];
 const base=defineTool({name:'read_context_history',description:'Baseline history reader.',parameters:{type:'object'},handler:args=>{calls.push(args);return JSON.stringify(args);}});
 const tool=withHistorySourceLookup(base,{messages,recoverTool} as any);
 const invoke=async(args:any)=>{validateToolArguments(tool,{type:'toolCall',id:'invoke',name:tool.name,arguments:args});const block=(await tool.execute('invoke',args)).content[0];assert.equal(block.type,'text');if(block.type!=='text')throw new Error('expected text');return JSON.parse(block.text);};
 return {tool,invoke,calls};
}
test('named historical lookup resolves absolute position and preserves offset without reading current source',async()=>{
 const f=setup([{role:'user',content:'author'},...pair('old')]);
 assert.deepEqual(await f.invoke({path:'defs.tex',offset:800}),{message:2,offset:800});
 assert.deepEqual(await f.invoke({message:0,offset:0}),{message:0,offset:0});
});
test('repeated snapshots/pages are ambiguous; snapshot filter and message selection are explicit',async()=>{
 const f=setup([...pair('old'),...pair('new')]);
 const result=await f.invoke({path:'defs.tex'});assert.equal(result.reason,'ambiguous');assert.deepEqual(result.candidates.map((c:any)=>c.message),[1,3]);assert.equal(f.calls.length,0);
 assert.deepEqual(await f.invoke({path:'defs.tex',snapshotId:'old'}),{message:1,offset:0});
 const same=setup([...pair('same'),...pair('same')]);assert.equal((await same.invoke({path:'defs.tex',snapshotId:'same'})).reason,'ambiguous');
});
test('archived receipt uses original bytes; errors and unrelated paths cannot match',async()=>{
 const original=pair('old')[1],messages=pair('old');messages[1]={...original,content:[{type:'text',text:'{"archived":true}'}]};
 let recovered:any;
 const f=setup(messages,async(id:any,index:any)=>{recovered={id,index};return original;});
 assert.deepEqual(await f.invoke({path:'defs.tex'}),{message:1,offset:0});assert.deepEqual(recovered,{id:'read',index:1});
 assert.equal((await f.invoke({path:'else.tex'})).reason,'not_found');
 const failed=pair('old');failed[1].isError=true;assert.equal((await setup(failed).invoke({path:'defs.tex'})).reason,'not_found');
 await assert.rejects(f.invoke({message:1,path:'defs.tex'}));await assert.rejects(f.invoke({}));
});
