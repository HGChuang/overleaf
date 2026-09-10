import { expandedCases } from './expanded-cases.mjs';
export const navigationDescription = 'Read exact archived conversation evidence by absolute message index from PAPER_CHECKPOINT. For a known tool result, find its entry in PAPER_CHECKPOINT.toolLedger and call this tool with message=resultMessage directly; do not scan from message 0. Follow nextOffset only when the needed evidence is not yet visible. Browse other messages only if the locator is missing or the task requires them. Historical source may be stale; read current project source before editing. Returns a bounded page of text with a continuation offset.';
export const navigationExperiment = { id:'archive-navigation-description-v1', repeats:3,
 factor:'Only read_context_history tool description: A production; B explicit direct resultMessage lookup and demand-driven pagination',
 controls:'same paired source/prompt/IDs/deterministic production checkpoint/model/budgets/page size; clean DB; alternate AB/BA; no live summary in paired phase',
 primary:'core + required target evidence success; off-target history attempts and duplicate target pages',
 adoption:'B all core/evidence pass, fewer off-target attempts and total calls, no aggregate reported input-token regression; unknown usage precludes cost claim' };
export const navigationCases = [
 ['short', 'L1-25', 0], ['long','L1-27',0], ['late-long','L1-28',4],
].flatMap(([variant,id,policyLeadMessages],vi)=>Array.from({length:3},(_,r)=>{
 const original=expandedCases.find(c=>c.id===id),pairId=`NAV-${variant}-${r+1}`;
 return ((vi*3+r)%2?['B','A']:['A','B']).map(arm=>({...original,id:`${pairId}-${arm}`,pairId,arm,variant,
  seed:{...original.seed,manualCompact:false,navigationCheckpoint:true,policyLeadMessages},
  targetMessage:2+policyLeadMessages}));
}).flat());
export function navigationChecks(c, messages) {
 const calls=messages.filter(m=>m.role==='assistant').flatMap(m=>m.content.filter(b=>b.type==='toolCall'&&b.name==='read_context_history'));
 const successful=messages.filter(m=>m.role==='toolResult'&&m.toolName==='read_context_history'&&!m.isError).flatMap(m=>{try{return [JSON.parse(m.content[0].text)];}catch{return [];}});
 const resolved=new Map(messages.filter(m=>m.role==='toolResult'&&m.toolName==='read_context_history'&&!m.isError).flatMap(m=>{try{return [[m.toolCallId,JSON.parse(m.content[0].text).message]];}catch{return [];}}));
 const messageOf=call=>call.arguments.message??resolved.get(call.id);
 const target=successful.filter(v=>v.message===c.targetMessage);
 const title=c.regions[0].reference.slice('\\section{'.length,-1);
 // Responses are slices of a serialized receipt; require actual decision bytes, not merely a read of any history message.
 const pages=[...target].sort((a,b)=>a.offset-b.offset);
 let contiguous='',end=0;
 for(const page of pages){if(page.offset>end)break;if(page.offset+page.content.length>end){contiguous+=page.content.slice(Math.max(0,end-page.offset));end=page.offset+page.content.length;}}
 const seen=new Set();let duplicateTargetAttempts=0;
 for(const call of calls.filter(x=>messageOf(x)===c.targetMessage)){const key=call.arguments.offset||0;if(seen.has(key))duplicateTargetAttempts++;seen.add(key);}
 const evidencePassed=contiguous.includes(`FINAL CAPTION: ${title}`);
 return {evidencePassed,failures:evidencePassed?[]:['required FINAL CAPTION not recovered from target receipt'],
  targetMessage:c.targetMessage,historyAttempts:calls.length,offTargetAttempts:calls.filter(x=>messageOf(x)!==c.targetMessage).length,
  duplicateTargetAttempts,targetSuccessfulPages:target.length,reads:calls.map(x=>x.arguments)};
}

export const navigationBaselineDescription = 'Read exact archived conversation evidence by absolute message index from PAPER_CHECKPOINT. Historical source may be stale; read current project source before editing. Returns a bounded page of text with a continuation offset.';
export const navigationConciseDescription = navigationBaselineDescription + " For a known tool result, go directly to the matching PAPER_CHECKPOINT.toolLedger entry's resultMessage instead of scanning earlier messages.";
export const navigationConciseExperiment = { ...navigationExperiment,id:'archive-navigation-concise-v1',repeats:1,
 factor:'Only history tool description; C adds one direct-locator sentence to A; no added pagination/browsing policy',
 adoption:'C all 3 core/evidence pass, fewer off-target attempts and total calls, no aggregate input-token regression; one fixed round only' };
export const navigationConciseCases=navigationCases.filter(c=>c.pairId.endsWith('-1')).map(c=>({...c,
 id:c.id.replace('NAV-','NAVC-').replace(/-B$/,'-C'),pairId:c.pairId.replace('NAV-','NAVC-'),arm:c.arm==='B'?'C':'A'}));
