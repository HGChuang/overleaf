import type { ContextSession } from '../../app/agent/context/context-store.js';
import type { AgentTool } from '../../app/agent/core/types.js';

/** Experimental named locator; preserves the existing reader and its page bytes. */
export function withHistorySourceLookup(tool: AgentTool, session: Pick<ContextSession,'messages'|'recoverTool'>): AgentTool {
  const original=tool.execute;
  return {...tool,
    description: tool.description + ' You may instead provide path to read an archived read_file/read_file_fragment result for that exact file. If several receipts match, choose a returned message index or narrow by snapshotId. This reads history, not current source.',
    parameters:{type:'object',properties:{
      message:{type:'integer',minimum:0},path:{type:'string',minLength:1},snapshotId:{type:'string',minLength:1},offset:{type:'integer',minimum:0},
    },additionalProperties:false,oneOf:[{required:['message']},{required:['path']}]},
    async execute(id,args:any,signal,onUpdate){
      if(args.message!==undefined){
        if(args.path!==undefined||args.snapshotId!==undefined)throw new Error('Use message alone, or path with optional snapshotId.');
        return original(id,args,signal,onUpdate);
      }
      if(typeof args.path!=='string'||!args.path)throw new Error('Provide message or an exact historical source path.');
      const calls=new Map<string,any>();
      const candidates:any[]=[];
      for(let index=0;index<session.messages.length;index++){
        signal?.throwIfAborted();
        const m=session.messages[index];
        if(m.role==='assistant')for(const b of m.content)if(b.type==='toolCall')calls.set(b.id,b);
        if(m.role!=='toolResult'||m.isError)continue;
        const call=calls.get(m.toolCallId);
        if(!call||!['read_file','read_file_fragment'].includes(call.name)||call.arguments?.path!==args.path)continue;
        const receipt=await session.recoverTool?.(m.toolCallId,index)||m;
        if(receipt.isError)continue;
        let v:any;try{v=JSON.parse(receipt.content.filter(b=>b.type==='text').map(b=>(b as any).text).join('\n'));}catch{continue;}
        if(!v.found||v.path!==args.path||(args.snapshotId!==undefined&&v.snapshotId!==args.snapshotId))continue;
        candidates.push({message:index,path:v.path,snapshotId:v.snapshotId,sourceHash:v.sourceHash,startByte:v.startByte,endByte:v.endByte});
      }
      if(candidates.length===1)return original(id,{message:candidates[0].message,offset:args.offset||0},signal,onUpdate);
      // Metadata only; never choose the latest version or treat a read page as a whole-file receipt.
      return {content:[{type:'text',text:JSON.stringify({found:false,historical:true,
        reason:candidates.length?'ambiguous':'not_found',path:args.path,candidates:candidates.slice(0,16),
        totalMatches:candidates.length,truncated:candidates.length>16,
        note:'Choose a message index or narrow by snapshotId. Historical source may be stale.'})}],details:{}};
    },
  };
}
