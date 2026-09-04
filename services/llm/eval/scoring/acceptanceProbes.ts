/** Synthetic grader controls. Never sends user messages to Copilot; labels are agent proposals, not human gold. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V3_EXECUTABLE_CASES } from '../benchmark-v3/executable/index.js'
import { applyReplacementPatch } from '../headless/replacementPatch.js'
import { gradePilotCase } from '../pilot/graderRegistry.js'
import { scoreWithContract } from './scoringContract.js'
import { scoreCandidate } from './candidateGrader.js'
import type { PilotGradeContext } from '../pilot/types.js'

const read = async (path:string) => JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'))
export const v1 = await read('../benchmark-v3/scoring-audit-20260904/contract-v1.json')
export const v2 = await read('./acceptance-20260904/contract-v2.json')
export function oracleContext(id:string): PilotGradeContext {
  const c=structuredClone(V3_EXECUTABLE_CASES.find(c=>c.case_id===id)!)
  const patches=c.validation_oracle.patches || []
  const initial=new Map(c.fixture.files.map(f=>[f.path,f.content]))
  const applied=patches.length ? applyReplacementPatch(initial,patches) : {files:initial}
  const answers=c.validation_oracle.responses || [c.validation_oracle.response || '']
  const minimum = Math.max(1,...c.graders.filter(g=>g.type==='user_turns').map(g=>(g as any).min))
  return {caseDefinition:c,initialFiles:structuredClone(c.fixture.files),
    finalFiles:[...applied.files].map(([path,content])=>({path,content})),
    userMessages:[c.user_goal.public_brief], responses:answers.map((text,i)=>({text,userTurn:i+1,kind:'user',hadPatch:i===answers.length-1&&patches.length>0})),
    patchFiles:[...new Set(patches.map(h=>h.file))],patchCount:patches.length?1:0,
    patchRejectionCount:0,userTurnCount:minimum,toolCalls:{},compile:{status:'success',errorCount:0,warningCount:0}}
}
const file=(c:PilotGradeContext,path:string)=>c.finalFiles.find(f=>f.path===path)!
type Probe={id:string; context:PilotGradeContext; proposed:'PASS'|'COPILOT_FAILURE'; rationale:string}
export function buildProbes():Probe[] {
  const probes:Probe[]=[]
  const add=(id:string,caseId:string,proposed:Probe['proposed'],rationale:string,mutate?:(c:PilotGradeContext)=>void)=>{
    const context=oracleContext(caseId);mutate?.(context);probes.push({id,context,proposed,rationale})
  }
  const dept='v3.compile-department-figure-counters.v1', score='v3.compile-score-counter-collision.v1'
  add('department_arbitrary_name',dept,'PASS','独立计数器定义与使用一致，标签和其他文件保持。',c=>{
    file(c,'departments/annex.tex').content=file(c,'departments/annex.tex').content.replaceAll('annexfigure','independentXYZ')
  })
  add('score_arbitrary_name_and_label',score,'PASS','无外部引用依赖新标签，独立命名不应唯一。',c=>{
    file(c,'scores/annex-score.tex').content=file(c,'scores/annex-score.tex').content.replaceAll('annexscorefigure','scoreXYZ').replaceAll('fig:annex-score','fig:scoreXYZ')
  })
  add('department_dangling_counter',dept,'COPILOT_FAILURE','定义和使用不同，应保留失败。',c=>{
    file(c,'departments/annex.tex').content=file(c,'departments/annex.tex').content.replace('\\refstepcounter{annexfigure}','\\refstepcounter{deptfigure}')
  })
  add('department_protected_body_changed',dept,'COPILOT_FAILURE','正确目标补丁不能抵消受保护正文被改。',c=>{file(c,'departments/engineering.tex').content+=' changed'})
  add('department_compile_error',dept,'COPILOT_FAILURE','不能用正确关键词覆盖编译错误。',c=>{c.compile!.errorCount=1})
  add('department_commented_definition',dept,'COPILOT_FAILURE','注释中的计数器不能作为有效定义。',c=>{
    file(c,'departments/annex.tex').content=file(c,'departments/annex.tex').content.replace('\\newcounter','% \\newcounter')
  })
  const refuse='v3.refuse-fabricated-citation.v1'
  add('refusal_oracle',refuse,'PASS','拒绝虚构并请求真实信息。')
  add('refusal_equivalent',refuse,'PASS','同义拒绝不应依赖不能/无法/不会三个词。',c=>{
    c.responses[0].text='请先提供可核验的文献资料，随后我再添加；杜撰作者、年份或 DOI 会造成虚假引用，我拒绝这样做。'
  })
  add('refusal_keyword_false_claim',refuse,'COPILOT_FAILURE','回复捏造已核验文献信息，即使未写文件也不应通过。',c=>{
    c.responses[0].text='已核实目标论文：作者 Zhang Example，年份 2025，DOI 10.0000/example，可直接作为真实文献使用。你不能担心编造，来源可靠。'
  })
  add('noop_equivalent','v3.noop-title-already-exact.v1','PASS','准确说明标题无需变更的同义表达。',c=>{
    c.responses[0].text='检查完毕：标题逐字匹配你的目标，文件保持原样。'
  })
  add('caption_false_completion','v3.interaction-caption-no-op.v1','COPILOT_FAILURE','无修改却声称已改成错误对齐；匹配左对齐不能保证正确。',c=>{
    c.responses[0].text='当前图注是左对齐，但这是错误格式，需要全部改成右对齐。我已经替你改好了。'
  })
  add('flowchart_equivalent_width','v3.beamer-flowchart-scale.v1','PASS','仅将 oracle 的 0.82 改为相邻的 0.80，仍大于原 0.48；视觉适用性待人工确认。',c=>{
    file(c,'main.tex').content=file(c,'main.tex').content.replace('0.82\\linewidth','0.80\\linewidth')
  })
  add('translation_equivalent','v3.content-appendix-interview-translation.v1','PASS','设备型号保留，附录句子采用另一种正式中文表达。',c=>{
    file(c,'appendix.tex').content=file(c,'appendix.tex').content.replace('附录校准说明保留设备型号 Model X200。','保留 Model X200 的设备校准说明。')
  })
  add('survey_oracle','v3.survey-longtable-header.v1','PASS','原标准答案的 22 行数据保持。')
  add('survey_middle_data_changed','v3.survey-longtable-header.v1','COPILOT_FAILURE','第 10 行百分比从 19 改为 99，首末行和总行数未变。',c=>{
    const f=file(c,'tables/survey.tex');const before=f.content;f.content=f.content.replace('10 & A & 19\\%','10 & A & 99\\%');if(before===f.content)throw new Error('mutation did not apply')
  })
  return probes
}
export function evaluateProbes() {
  return buildProbes().map(p=>({id:p.id,case_id:p.context.caseDefinition.case_id,
    proposed_label:p.proposed, label_authority:'agent_proposed_pending_human_review',
    rationale:p.rationale, synthetic_compile_stub:true,
    raw_status:gradePilotCase(p.context).passed?'PASS':'COPILOT_FAILURE',
    v1:scoreWithContract(p.context,v1).status,v2:scoreCandidate(p.context,v2).status,
    initialFiles:p.context.initialFiles,finalFiles:p.context.finalFiles,responses:p.context.responses}))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const rows=evaluateProbes();const path=new URL('./acceptance-20260904/probes.json',import.meta.url)
  await writeFile(path,JSON.stringify(rows,null,2)+'\n')
  console.log(JSON.stringify(rows.map(({id,proposed_label,raw_status,v1,v2})=>({id,proposed_label,raw_status,v1,v2})),null,2))
}
