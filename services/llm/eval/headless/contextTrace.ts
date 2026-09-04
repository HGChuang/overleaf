/** Opt-in evaluation-only full evidence. Callers provide body/IO, never credentials/options. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { artifactReference, CanonicalTraceWriter, writeJsonAtomic } from './canonicalTrace.js'
import type { AgentTool } from '../../app/agent/core/types.js'

export class ContextTraceRecorder {
  private ordinal = 0
  private failures = 0
  private pending = new Set<Promise<void>>()
  constructor(readonly enabled: boolean, private runDir: string,
    private trace: CanonicalTraceWriter,
    private context: {getTurnId(): string | null; getParentEventId(): string | null}) {}

  status() { return {enabled:this.enabled, records:this.ordinal, failures:this.failures, complete:this.enabled && this.failures===0} }

  capture(kind: string, value: unknown, toolCallId?: string): Promise<void> {
    if (!this.enabled) return Promise.resolve()
    const promise = this.record(kind,value,toolCallId)
    this.pending.add(promise)
    void promise.finally(()=>this.pending.delete(promise))
    return promise
  }

  async flush() { while (this.pending.size) await Promise.all([...this.pending]) }

  private async record(kind: string, value: unknown, toolCallId?: string) {
    const ordinal = ++this.ordinal
    // Clone before yielding: later context compaction must not rewrite this evidence.
    try {
      const snapshot = JSON.parse(JSON.stringify(value))
      const turnId = this.context.getTurnId()
      const parentId = this.context.getParentEventId()
      const path = `context/${String(ordinal).padStart(4,'0')}-${kind}.json`
      await mkdir(join(this.runDir,'context'),{recursive:true})
      await writeJsonAtomic(join(this.runDir,path), snapshot)
      await this.trace.emit({event_type:'context_evidence_recorded',turn_id:turnId,parent_event_id:parentId,
        ...(toolCallId ? {tool_call_id:toolCallId} : {}),summary:{kind},
        artifacts:[await artifactReference(this.runDir,path)]}).committed
    } catch {
      this.failures++
      // Observability failure never changes the tool/model output. Mark the evidence incomplete.
      try { await this.trace.emit({event_type:'context_evidence_failed',turn_id:this.context.getTurnId(),
        summary:{kind,ordinal},status:'error'}).committed } catch { /* persisted status is the fallback */ }
    }
  }

  wrapTools<T extends AgentTool[]>(tools: T): T {
    if (!this.enabled) return tools
    return tools.map(tool=>({...tool,execute:async (...args: Parameters<AgentTool['execute']>)=>{
      const [id,params] = args
      await this.capture('tool-input',{tool:tool.name,arguments:params},id)
      try {
        const result=await tool.execute(...args)
        await this.capture('tool-output',{tool:tool.name,result},id)
        return result
      } catch (error) {
        await this.capture('tool-error',{tool:tool.name,error:error instanceof Error ? error.message : String(error)},id)
        throw error
      }
    }})) as T
  }
}

/** Actual mounted source identity for diagnostics run from a dirty checkout. */
export async function contextTraceSourceHashes() {
  const {readFile} = await import('node:fs/promises')
  const {createHash} = await import('node:crypto')
  const paths = ['eval/headless/contextTrace.ts','eval/headless/evalContext.ts','eval/headless/serviceFactory.ts',
    'eval/pilot/runPilotCase.ts','app/services/copilot.service.ts','app/llm/openaiCompatStream.ts',
    'app/agent/compact.ts','app/agent/memory.ts','app/agent/tools/projectTools.ts','app/agent/tools/fileMap.ts','app/agent/prompts.ts']
  return Object.fromEntries(await Promise.all(paths.map(async path=>[path,
    createHash('sha256').update(await readFile(new URL('../../'+path,import.meta.url))).digest('hex')])))
}
