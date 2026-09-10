import { buildProjectTools } from '../../app/agent/tools/projectTools.js';
import { requestTokens, inputBudget } from '../../app/agent/context/budget.js';

/** Declared synthetic prior conversation, persisted through the real journal. */
export async function seedHistory(c: any, journal: any, scope: any, snapshot: any, web: any) {
  if (!c.seed) return;
  const session = await journal.open(scope);
  const assistant = (content: any[], stopReason = 'stop') => ({ role: 'assistant', content, stopReason, timestamp: 0,
    api: 'openai-completions', provider: 'openai-compat', model: 'synthetic-history-fixture', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 } });
  try {
    const project = { projectId: scope.projectId, sourceSnapshot: snapshot, rootDocId: snapshot.rootDocId,
      fileList: snapshot.docs.map((d: any) => d.path), outline: snapshot.docs.map((d: any) => d.path), files: snapshot.docs,
      sourceManifest: snapshot.docs.map((d: any) => ({ path:d.path,docId:d.docId,version:d.version,sha256:d.sha256 })) };
    await session.append({ role: 'user', timestamp: 0, content: JSON.stringify({ MESSAGE:c.seed.authorTexts[0], MESSAGE_KIND:'author',PROJECT:project }) });
    for(let i=0;i<(c.seed.policyLeadMessages||0);i++)await session.append(assistant([{type:"text",text:"Prior navigation fixture progress; no author decision or source evidence."}]));
    if (c.seed.policy) {
      const tool = buildProjectTools({ project }, { loadFile: async path => (await web.readSnapshot(scope.userId,scope.projectId,snapshot.id,path)).content }).find(t => t.name==='read_file')!;
      const args={path:'prior-decision.tex'};
      await session.append(assistant([{type:'toolCall',id:'historical_policy',name:'read_file',arguments:args}],'toolUse'));
      const result=await tool.execute('historical_policy',args);
      const message={role:'toolResult',toolCallId:'historical_policy',toolName:'read_file',...result,isError:false,timestamp:0};
      await session.recordTool(message); await session.append(message);
    }
    const groups=Math.ceil(c.seed.fillerBytes/3500);
    for(let n=0;n<groups;n++){
      const filler=`Historical review ${n+1}: manuscript structure was inspected; this progress note adds no author requirement. `;
      await session.append(assistant([{type:'text',text:filler.repeat(Math.ceil(3500/filler.length)).slice(0,3500)}]));
      if(n===Math.floor(groups/2))for(const text of c.seed.authorTexts.slice(1))await session.append({role:'user',content:text,timestamp:0});
    }
    await session.append(assistant([{type:'text',text:'The requested edit is pending; no patch has been proposed or applied.'}]));
  } finally { await session.close(); }
}

export function stressChecks(c: any, events: any[], messages: any[], diagnostics: any) {
  const coverageFailures:string[]=[];
  const successful=messages.filter(m=>m.role==='toolResult'&&!m.isError);
  const calls=messages.filter(m=>m.role==='assistant').flatMap(m=>m.content.filter((b:any)=>b.type==='toolCall'));
  const historyReads=calls.filter(t=>t.name==='read_context_history'&&successful.some(m=>m.toolCallId===t.id));
  const archived=successful.filter(m=>m.content.some((b:any)=>{try{return JSON.parse(b.text).archived===true;}catch{return false;}}));
  const commits=events.filter(e=>e.kind==='context_commit');
  const capacityEvents=events.filter(e=>e.kind==='service_event'&&e.data.type==='context_compacted');
  if(c.requireHistory&&!historyReads.length)coverageFailures.push('required archived evidence was not read back');
  if(c.requireHistoryContinuation&&!historyReads.some(t=>t.arguments.offset>0))coverageFailures.push('archived evidence continuation not exercised');
  if(c.requireLiveArchive&&!archived.length)coverageFailures.push('live oversized result did not enter archive path');
  if(c.seed?.manualCompact&&!(diagnostics?.generation>0))coverageFailures.push('manual archive did not commit an epoch');
  if(c.requireCompaction&&!capacityEvents.length)coverageFailures.push('near-window compaction not exercised');
  const evidenceFiles=new Set<string>();
  for(const m of successful)for(const block of m.content){try{
    const v=JSON.parse(block.text);if(v.found&&v.path)evidenceFiles.add(v.path);
    for(const match of v.matches||[])if(match.file)evidenceFiles.add(match.file);
  }catch{}}
  for(const file of c.evidenceFiles||[])if(!evidenceFiles.has(file))coverageFailures.push(`dependency evidence missing: ${file}`);
  const requests=events.filter(e=>e.kind==='model_request').map(e=>({callId:e.data.callId,
    estimatedInput:requestTokens(e.data.context.systemPrompt,e.data.context.tools||[],e.data.context.messages),
    effectiveInputBudget:inputBudget(e.data.model.contextWindow,e.data.options.maxTokens),
    summary:e.data.options.maxTokens===4096}));
  return {coverageFailures,historyReads:historyReads.map(t=>t.arguments),liveArchives:archived.length,epochCommits:commits.length,
    compactions:capacityEvents.map(e=>e.data),evidenceFiles:[...evidenceFiles],requests};
}
