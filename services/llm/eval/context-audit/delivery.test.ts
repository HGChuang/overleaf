import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {buildChatPayload} from '../headless/evalContext.js'
import {ContextTraceRecorder} from '../headless/contextTrace.js'
import {CanonicalTraceWriter} from '../headless/canonicalTrace.js'
import {V3_EXECUTABLE_CASES} from '../benchmark-v3/executable/index.js'
import {buildProjectTools} from '../../app/agent/tools/projectTools.js'
import {microCompact,capMessagesKeepInstructions,sanitizeToolPairing} from '../../app/agent/compact.js'
import {buildOpenAICompatRequest,createOpenAICompatModel,streamOpenAICompat} from '../../app/llm/openaiCompatStream.js'

const model=createOpenAICompatModel({baseUrl:'https://example.invalid/v1',modelId:'diagnostic'})
const text=(r:any)=>r.content.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('\n')

test('all 73 declared current files reach payload without changing root or project bytes',()=>{
  for(const c of V3_EXECUTABLE_CASES){
    const p=buildChatPayload({id:c.case_id,mainFile:c.fixture.main_file,currentFile:c.initial_state.current_file,files:c.fixture.files},c.fixture.files,'probe','probe')
    assert.equal(p.context.currentFile,c.initial_state.current_file)
    assert.equal(p.project.rootDocId,c.fixture.main_file)
    assert.deepEqual(p.project.files,c.fixture.files)
  }
  assert.equal(buildChatPayload({id:'x',mainFile:'main.tex',files:[]},[],'c','m').context.currentFile,'main.tex')
})
test('20k read cap and 200-line fragment cap are recoverable by another window',async()=>{
  const content=Array.from({length:250},(_,i)=>`${i+1}: `+'x'.repeat(100)+(i===229?'TAIL_MARKER':'')).join('\n')
  const tools=buildProjectTools({project:{files:[{path:'long.tex',content}]}})
  const read=tools.find(t=>t.name==='read_file')!
  const fragment=tools.find(t=>t.name==='read_file_fragment')!
  const first=JSON.parse(text(await read.execute('a',{path:'long.tex'})))
  assert.ok(first.content.includes('[truncated'));assert.ok(!first.content.includes('TAIL_MARKER'))
  const wide=JSON.parse(text(await fragment.execute('b',{path:'long.tex',startLine:1,endLine:250})))
  assert.ok(!wide.content.includes('TAIL_MARKER'))
  const tail=JSON.parse(text(await fragment.execute('c',{path:'long.tex',startLine:225,endLine:235})))
  assert.ok(tail.content.includes('TAIL_MARKER'))
})
test('a search line preview can omit its matched token; exact line remains readable',async()=>{
  const tools=buildProjectTools({project:{files:[{path:'long.tex',content:'x'.repeat(300)+'NEEDLE'}]}})
  const search=tools.find(t=>t.name==='search_project')!
  const r=JSON.parse(text(await search.execute('s',{query:'NEEDLE'})))
  assert.equal(r.matches[0].line,1);assert.ok(!r.matches[0].text.includes('NEEDLE'))
  assert.ok(text(await tools.find(t=>t.name==='read_file_fragment')!.execute('r',{path:'long.tex',startLine:1,endLine:1})).includes('NEEDLE'))
})
test('tool text survives provider conversion past the 500-char SSE preview; auth is excluded',()=>{
  const marker='x'.repeat(900)+'SOURCE_TAIL'
  const body=buildOpenAICompatRequest(model,{messages:[{role:'toolResult',toolCallId:'id',toolName:'read_file',content:[{type:'text',text:marker}],isError:false,timestamp:1}]},{apiKey:'SECRET_TEST_VALUE'})
  assert.equal((body.messages as any[])[0].content,marker)
  assert.ok(!JSON.stringify(body).includes('SECRET_TEST_VALUE'))
})
test('SDK dispatch uses the same request projection',async()=>{
  const prior=globalThis.fetch;let sent:any
  globalThis.fetch=async (_input,init)=>{
    sent=JSON.parse(String(init?.body))
    return new Response('data: {"id":"probe","choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})
  }
  try {
    const ctx:any={systemPrompt:'system',messages:[{role:'user',content:'WIRE_MARKER',timestamp:1}]}
    const opts={apiKey:'test-only',temperature:0.7,maxRetries:0}
    const stream=streamOpenAICompat(model,ctx,opts);await stream.result()
    assert.deepEqual(sent,buildOpenAICompatRequest(model,ctx,opts))
  } finally {globalThis.fetch=prior}
})
test('read pinning survives micro compaction but not the final message count cap',()=>{
  const messages:any[]=[{role:'user',content:'TASK_MARKER',timestamp:1}]
  for(let i=0;i<13;i++){
    messages.push({role:'assistant',content:[{type:'toolCall',id:`t${i}`,name:'read_file',arguments:{path:'a'}}],timestamp:2+i})
    messages.push({role:'toolResult',toolCallId:`t${i}`,toolName:'read_file',content:[{type:'text',text:`READ_MARKER_${i} `+'x'.repeat(200)}],timestamp:2+i})
  }
  assert.ok(JSON.stringify(microCompact(messages)).includes('READ_MARKER_0 '))
  const capped=sanitizeToolPairing(capMessagesKeepInstructions(microCompact(messages),20))
  assert.ok(JSON.stringify(capped).includes('TASK_MARKER'));assert.ok(!JSON.stringify(capped).includes('READ_MARKER_0 '));assert.ok(JSON.stringify(capped).includes('READ_MARKER_12 '))
})
test('recorder defaults off, preserves tool outputs/errors, snapshots values and flags recording failure',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'context-audit-'))
  try {
    const trace=new CanonicalTraceWriter('probe',join(dir,'events.jsonl'))
    const access={getTurnId:()=> 'turn-1',getParentEventId:()=>null}
    const off=new ContextTraceRecorder(false,dir,trace,access)
    const tools=buildProjectTools({project:{files:[{path:'a',content:'original'}]}})
    assert.equal(off.wrapTools(tools),tools);await off.capture('payload',{anything:1});assert.deepEqual(await readdir(dir),[])
    const on=new ContextTraceRecorder(true,dir,trace,access)
    const source={value:'before'};const p=on.capture('payload',source);source.value='after';await p
    const wrapped=on.wrapTools(tools)
    assert.deepEqual(await wrapped[1].execute('call',{path:'a'}),await tools[1].execute('call',{path:'a'}))
    const error=new Error('test tool error');const bad={...tools[1],execute:async (_id:string,_params:unknown)=>{throw error}}
    await assert.rejects(on.wrapTools([bad])[0].execute('bad',{path:'a'}),e=>e===error)
    await on.flush();await trace.flush()
    assert.equal(JSON.parse(await readFile(join(dir,'context/0001-payload.json'),'utf8')).value,'before')
    assert.equal(on.status().failures,0)
    const broken=join(dir,'not-a-dir');await writeFile(broken,'file')
    const fail=new ContextTraceRecorder(true,broken,trace,access);await fail.capture('payload',{v:1})
    assert.equal(fail.status().complete,false);assert.equal(fail.status().failures,1)
  } finally {await rm(dir,{recursive:true,force:true})}
})
