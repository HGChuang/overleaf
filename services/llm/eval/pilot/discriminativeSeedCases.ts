import { workspaceHash } from '../headless/workspaceState.js'
import type {
  Capability,
  CompileMode,
  Difficulty,
  ExpectedAction,
  GraderSpec,
  PilotCase,
  Split,
} from './types.js'

type OraclePatch = NonNullable<
  PilotCase['validation_oracle']['patches']
>[number]

function article(body: string, preamble = ''): string {
  return `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`
}

function makeCase(input: {
  id: string
  split: Split
  category: string
  capabilities: Capability[]
  difficulty: Difficulty
  factors: string[]
  files: Array<{ path: string; content: string }>
  goal: string
  action: ExpectedAction
  graders: GraderSpec[]
  oraclePatches?: OraclePatch[]
  oracleResponse?: string
  oracleResponses?: string[]
  interactionFacts?: string[]
  mainFile?: string
  scale?: PilotCase['project_complexity']['scale']
  pressure?: PilotCase['project_complexity']['context_pressure']
  maxUserTurns?: number
  dynamicUser?: boolean
  continueAfterPatch?: boolean
  initialCompile?: 'success' | 'failure'
  compileMode?: CompileMode
  protectedInvariants?: Array<{ file: string; value: string }>
  tags: string[]
  promptForm?: string
}): PilotCase {
  const mainFile = input.mainFile || 'main.tex'
  return {
    schema_version: 1,
    case_id: `${input.id}.v1`,
    case_family_id: input.id,
    split: input.split,
    category: input.category,
    capabilities: input.capabilities,
    difficulty: { level: input.difficulty, factors: input.factors },
    fixture: {
      fixture_id: input.id,
      fixture_lineage: input.id,
      main_file: mainFile,
      compiler: 'pdflatex',
      files: input.files,
      sha256: workspaceHash(input.files),
    },
    project_complexity: {
      scale:
        input.scale ||
        (input.files.length === 1 ? 'single-small' : 'multi-small'),
      context_pressure: input.pressure || 'none',
    },
    user_goal: {
      public_brief: input.goal,
      ...(input.interactionFacts
        ? { interaction_facts: input.interactionFacts }
        : {}),
    },
    initial_state: {
      current_file: mainFile,
      compile_status: input.initialCompile || 'success',
      ...(input.protectedInvariants
        ? { protected_invariants: input.protectedInvariants }
        : {}),
    },
    expected_behavior: {
      action: input.action,
      max_user_turns: input.maxUserTurns || 1,
      ...(input.dynamicUser ? { dynamic_user: true } : {}),
      ...(input.continueAfterPatch ? { continue_after_patch: true } : {}),
    },
    forbidden_behavior: [
      'fabricate_content',
      'modify_protected_invariants',
      'claim_success_without_required_compile',
    ],
    patch_policy: {
      accepted_semantics: 'replacement-only',
      allowed_files: input.files.map((file) => file.path),
      max_patch_rounds: 3,
    },
    compile_policy: {
      mode: input.compileMode || 'optional',
      ...(input.compileMode === 'required-after-apply' ||
      input.compileMode === 'repair-loop'
        ? { expected_final_status: 'success' as const }
        : {}),
      max_compile_calls_per_turn: 1,
    },
    graders: input.graders,
    validation_oracle: {
      ...(input.oraclePatches ? { patches: input.oraclePatches } : {}),
      ...(input.oracleResponse ? { response: input.oracleResponse } : {}),
      ...(input.oracleResponses ? { responses: input.oracleResponses } : {}),
    },
    harness: { minimum_support: 'H1', unsupported_is: 'skipped' },
    metadata: {
      tags: input.tags,
      language: 'zh-CN',
      prompt_form: input.promptForm || 'conversational',
      provenance: 'systematic-human',
    },
  }
}

const compileSuccess: GraderSpec = {
  type: 'compile',
  status: 'success',
  max_errors: 0,
}

export const DISCRIMINATIVE_CASES: PilotCase[] = [
  makeCase({
    id: 'dynamic.clarify-shared-title',
    split: 'dev',
    category: 'dynamic_clarification',
    capabilities: ['C1', 'C8'],
    difficulty: 'D3',
    factors: ['ambiguous_target', 'cross_file', 'dynamic_turn'],
    files: [
      {
        path: 'main.tex',
        content: article(
          '\\input{sections/overview}\n\\input{sections/results}',
        ),
      },
      {
        path: 'sections/overview.tex',
        content: '\\section{Summary}\nOverview text.\n',
      },
      {
        path: 'sections/results.tex',
        content: '\\section{Summary}\nResult text.\n',
      },
    ],
    goal: '把 Summary 标题改成 Key Findings。',
    interactionFacts: [
      '只有在看到 Copilot 的实际澄清后才回答：我指的是 sections/results.tex 里的 Summary。',
      '如果 Copilot 未澄清就给出 patch，应拒绝该 patch 并说明目标文件。',
    ],
    action: 'clarify',
    dynamicUser: true,
    maxUserTurns: 2,
    compileMode: 'required-after-apply',
    graders: [
      { type: 'first_response_no_patch' },
      { type: 'response_matches', response_index: 0, pattern: '[?？]' },
      { type: 'user_turns', min: 2, max: 2 },
      {
        type: 'file_contains',
        file: 'sections/results.tex',
        values: ['\\section{Key Findings}'],
      },
      { type: 'file_unchanged', file: 'sections/overview.tex' },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'sections/results.tex',
        line: 1,
        oldText: '\\section{Summary}',
        newText: '\\section{Key Findings}',
      },
    ],
    oracleResponses: ['你指的是哪个文件中的 Summary？', '已修改指定标题。'],
    tags: ['dynamic', 'clarification', 'target-discovery'],
    promptForm: 'under-specified',
  }),
  makeCase({
    id: 'dynamic.correction-late-scope',
    split: 'dev',
    category: 'dynamic_correction',
    capabilities: ['C4', 'C11'],
    difficulty: 'D3',
    factors: ['user_correction', 'cross_file', 'second_patch'],
    files: [
      {
        path: 'main.tex',
        content: article(
          '\\input{chapters/introduction}\n\\input{chapters/conclusion}',
        ),
      },
      {
        path: 'chapters/introduction.tex',
        content: 'We call the framework Northstar.\n',
      },
      {
        path: 'chapters/conclusion.tex',
        content: 'Northstar is available online.\n',
      },
    ],
    goal: '先把 introduction 里的 Northstar 改成 Aurora。',
    interactionFacts: [
      '在 Copilot 完成并报告第一处修改后，再根据实际回复补充：conclusion 里的名称也要同步改为 Aurora。',
    ],
    action: 'patch',
    dynamicUser: true,
    maxUserTurns: 2,
    continueAfterPatch: true,
    compileMode: 'required-after-apply',
    graders: [
      { type: 'user_turns', min: 2, max: 2 },
      {
        type: 'file_not_contains',
        file: 'chapters/introduction.tex',
        values: ['Northstar'],
      },
      {
        type: 'file_not_contains',
        file: 'chapters/conclusion.tex',
        values: ['Northstar'],
      },
      {
        type: 'file_contains',
        file: 'chapters/introduction.tex',
        values: ['Aurora'],
      },
      {
        type: 'file_contains',
        file: 'chapters/conclusion.tex',
        values: ['Aurora'],
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'chapters/introduction.tex',
        line: 1,
        oldText: 'Northstar',
        newText: 'Aurora',
      },
      {
        file: 'chapters/conclusion.tex',
        line: 1,
        oldText: 'Northstar',
        newText: 'Aurora',
      },
    ],
    oracleResponses: ['已修改 introduction。', '已同步修改 conclusion。'],
    tags: ['dynamic', 'correction', 'cross-file'],
  }),
  makeCase({
    id: 'dynamic.patch-reject-changed-scope',
    split: 'dev',
    category: 'patch_rejection',
    capabilities: ['C4', 'C8', 'C11'],
    difficulty: 'D3',
    factors: ['patch_rejection', 'changed_scope', 'cross_file'],
    files: [
      {
        path: 'main.tex',
        content: article('\\input{intro}\n\\input{abstract}'),
      },
      { path: 'intro.tex', content: 'The legacy pipeline is stable.\n' },
      { path: 'abstract.tex', content: 'The legacy pipeline is accurate.\n' },
    ],
    goal: '把项目里的 legacy pipeline 改成 Aurora pipeline。',
    interactionFacts: [
      '看到第一份 patch preview 后必须拒绝；用户此时改变范围，只允许修改 abstract.tex，intro.tex 必须保持原样。',
    ],
    action: 'patch',
    dynamicUser: true,
    maxUserTurns: 3,
    compileMode: 'required-after-apply',
    graders: [
      { type: 'patch_rejections', min: 1, max: 1 },
      { type: 'user_turns', min: 2, max: 3 },
      { type: 'file_unchanged', file: 'intro.tex' },
      {
        type: 'file_contains',
        file: 'abstract.tex',
        values: ['Aurora pipeline'],
      },
      {
        type: 'file_not_contains',
        file: 'abstract.tex',
        values: ['legacy pipeline'],
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'abstract.tex',
        line: 1,
        oldText: 'legacy pipeline',
        newText: 'Aurora pipeline',
      },
    ],
    oracleResponses: ['提出初始 patch。', '已按缩小后的范围修改。'],
    tags: ['dynamic', 'patch-rejection', 'scope-change'],
  }),
  makeCase({
    id: 'dynamic.patch-reject-preserve-hedge',
    split: 'dev',
    category: 'patch_rejection',
    capabilities: ['C7', 'C9', 'C11'],
    difficulty: 'D3',
    factors: ['patch_rejection', 'claim_strength', 'constraint'],
    files: [
      {
        path: 'main.tex',
        content: article('Our early study may improve recall by 12\\%.'),
      },
    ],
    goal: '把这句话中的 improve recall 改成更简洁的 raise recall，其他含义别变。',
    interactionFacts: [
      '第一次 patch preview 必须拒绝，并反馈：请仍改成 raise recall，但明确保留 may、early study 和 12\\%，不能加强结论。',
    ],
    action: 'patch',
    dynamicUser: true,
    maxUserTurns: 3,
    graders: [
      { type: 'patch_rejections', min: 1, max: 1 },
      { type: 'user_turns', min: 2, max: 3 },
      {
        type: 'file_contains',
        file: 'main.tex',
        values: ['may', 'early study', '12\\%'],
      },
      {
        type: 'file_not_contains',
        file: 'main.tex',
        values: ['improve recall', 'proves', 'guarantees'],
      },
      { type: 'file_contains', file: 'main.tex', values: ['raise recall'] },
    ],
    oraclePatches: [
      {
        file: 'main.tex',
        line: 3,
        oldText: 'Our early study may improve recall by 12\\%.',
        newText: 'The early study may raise recall by 12\\%.',
      },
    ],
    oracleResponses: ['提出初始改写。', '已根据反馈保留限定信息。'],
    protectedInvariants: [
      { file: 'main.tex', value: 'may' },
      { file: 'main.tex', value: 'early study' },
      { file: 'main.tex', value: '12\\%' },
    ],
    tags: ['dynamic', 'patch-rejection', 'honesty'],
  }),
  makeCase({
    id: 'repair.macro-definition-origin',
    split: 'dev',
    category: 'compile_repair',
    capabilities: ['C1', 'C4', 'C5'],
    difficulty: 'D3',
    factors: ['macro_origin', 'cross_file', 'compile_feedback'],
    files: [
      {
        path: 'main.tex',
        content: article('\\input{sections/result}', '\\input{macros}\n'),
      },
      { path: 'macros.tex', content: '\\newcommand{\\resultname}{Aurora}\n' },
      {
        path: 'sections/result.tex',
        content: 'The system is \\resultName{}.\n',
      },
    ],
    goal: '编译失败了。请找到宏定义的真实位置并修复调用，已有宏值不要改。',
    action: 'patch',
    initialCompile: 'failure',
    compileMode: 'repair-loop',
    graders: [
      {
        type: 'file_contains',
        file: 'sections/result.tex',
        values: ['\\resultname{}'],
      },
      { type: 'file_unchanged', file: 'macros.tex' },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'sections/result.tex',
        line: 1,
        oldText: '\\resultName{}',
        newText: '\\resultname{}',
      },
    ],
    protectedInvariants: [{ file: 'macros.tex', value: 'Aurora' }],
    tags: ['repair-loop', 'macro', 'target-discovery'],
  }),
  makeCase({
    id: 'repair.reference-chain',
    split: 'dev',
    category: 'reference_repair',
    capabilities: ['C3', 'C4', 'C5'],
    difficulty: 'D3',
    factors: ['label_reference', 'cross_file', 'warning_repair'],
    files: [
      {
        path: 'main.tex',
        content: article(
          'See Section~\\ref{sec:method-new}.\n\\input{sections/method}',
        ),
      },
      {
        path: 'sections/method.tex',
        content: '\\section{Method}\\label{sec:method-old}\nText.\n',
      },
    ],
    goal: 'PDF 里的章节引用显示为 ??。请让引用和现有 Method 标签一致。',
    action: 'patch',
    compileMode: 'required-after-apply',
    graders: [
      {
        type: 'file_contains',
        file: 'main.tex',
        values: ['\\ref{sec:method-old}'],
      },
      { type: 'file_unchanged', file: 'sections/method.tex' },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'main.tex',
        line: 3,
        oldText: '\\ref{sec:method-new}',
        newText: '\\ref{sec:method-old}',
      },
    ],
    tags: ['reference', 'warning-repair', 'cross-file'],
  }),
  makeCase({
    id: 'repair.two-file-environments',
    split: 'dev',
    category: 'compile_repair',
    capabilities: ['C4', 'C5', 'C11'],
    difficulty: 'D4',
    factors: ['multiple_errors', 'environment_mismatch', 'cross_file'],
    files: [
      {
        path: 'main.tex',
        content: article('\\input{sections/a}\n\\input{sections/b}'),
      },
      {
        path: 'sections/a.tex',
        content: '\\begin{itemize}\n\\item Alpha\n\\end{enumerate}\n',
      },
      {
        path: 'sections/b.tex',
        content: '\\begin{enumerate}\n\\item Beta\n\\end{itemize}\n',
      },
    ],
    goal: '两个章节都有 environment mismatch。请完整修复并确认编译。',
    action: 'patch',
    initialCompile: 'failure',
    compileMode: 'repair-loop',
    graders: [
      {
        type: 'file_contains',
        file: 'sections/a.tex',
        values: ['\\end{itemize}'],
      },
      {
        type: 'file_contains',
        file: 'sections/b.tex',
        values: ['\\end{enumerate}'],
      },
      {
        type: 'patch_files',
        files: ['sections/a.tex', 'sections/b.tex'],
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'sections/a.tex',
        line: 3,
        oldText: '\\end{enumerate}',
        newText: '\\end{itemize}',
      },
      {
        file: 'sections/b.tex',
        line: 3,
        oldText: '\\end{itemize}',
        newText: '\\end{enumerate}',
      },
    ],
    tags: ['repair-loop', 'multiple-errors', 'cross-file'],
  }),
  makeCase({
    id: 'context.many-files-target-discovery',
    split: 'dev',
    category: 'long_context',
    capabilities: ['C1', 'C4', 'C10'],
    difficulty: 'D4',
    factors: ['many_files', 'repeated_anchor', 'semantic_target'],
    files: [
      {
        path: 'main.tex',
        content: article(
          Array.from(
            { length: 10 },
            (_, index) => `\\input{parts/p${index + 1}}`,
          ).join('\n'),
        ),
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        path: `parts/p${index + 1}.tex`,
        content:
          index === 6
            ? '\\section{Deployment Limits}\nThe retry budget is 3.\n'
            : `\\section{Part ${index + 1}}\nThe retry budget is 3.\n`,
      })),
    ],
    scale: 'multi-long',
    pressure: 'many-files',
    goal: '只把 Deployment Limits 小节中的 retry budget 从 3 改成 5，其他文件里的 3 不要动。',
    action: 'patch',
    compileMode: 'required-after-apply',
    graders: [
      {
        type: 'file_contains',
        file: 'parts/p7.tex',
        values: ['The retry budget is 5.'],
      },
      ...Array.from({ length: 9 }, (_, index) => {
        const number = index < 6 ? index + 1 : index + 2
        return {
          type: 'file_unchanged',
          file: `parts/p${number}.tex`,
        } as GraderSpec
      }),
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'parts/p7.tex',
        line: 2,
        oldText: 'The retry budget is 3.',
        newText: 'The retry budget is 5.',
      },
    ],
    tags: ['long-context', 'many-files', 'target-discovery'],
  }),
  makeCase({
    id: 'context.conflicting-definitions-noop',
    split: 'dev',
    category: 'no_op',
    capabilities: ['C1', 'C8', 'C9'],
    difficulty: 'D3',
    factors: ['conflicting_evidence', 'inactive_file', 'no_op'],
    files: [
      {
        path: 'main.tex',
        content: article(
          'The active system is \\systemname{}.',
          '\\input{active-macros}\n',
        ),
      },
      {
        path: 'active-macros.tex',
        content: '\\newcommand{\\systemname}{Aurora}\n',
      },
      {
        path: 'archive/old-macros.tex',
        content: '\\newcommand{\\systemname}{Northstar}\n',
      },
    ],
    goal: '我搜索到 Aurora 和 Northstar 两个系统名。当前编译实际使用哪个？只解释，不要修改。',
    action: 'answer',
    dynamicUser: true,
    maxUserTurns: 2,
    graders: [
      { type: 'no_patch' },
      { type: 'workspace_changed', expected: false },
      {
        type: 'response_contains_all',
        values: ['Aurora', 'active-macros.tex'],
      },
    ],
    oracleResponse: '当前输入 active-macros.tex，因此实际值为 Aurora。',
    tags: ['conflicting-evidence', 'no-op', 'grounding'],
    promptForm: 'question',
  }),
  makeCase({
    id: 'constraint.crossfile-three-invariants',
    split: 'dev',
    category: 'multi_constraint',
    capabilities: ['C4', 'C7', 'C10'],
    difficulty: 'D4',
    factors: ['cross_file', 'multiple_constraints', 'protected_facts'],
    files: [
      {
        path: 'main.tex',
        content: article(
          '\\input{abstract}\n\\input{results}\n\\input{conclusion}',
        ),
      },
      {
        path: 'abstract.tex',
        content: 'The old model reaches 91.2\\% accuracy \\cite{smith2024}.\n',
      },
      {
        path: 'results.tex',
        content: 'The old model uses 4 workers and 8 GB memory.\n',
      },
      {
        path: 'conclusion.tex',
        content: 'The old model may reduce latency.\n',
      },
    ],
    goal: '把三个章节里的 old model 统一为 Aurora，但必须保留 91.2\\%、smith2024、4 workers、8 GB 和 may。',
    action: 'patch',
    compileMode: 'required-after-apply',
    graders: [
      {
        type: 'file_not_contains',
        file: 'abstract.tex',
        values: ['old model'],
      },
      {
        type: 'file_not_contains',
        file: 'results.tex',
        values: ['old model'],
      },
      {
        type: 'file_not_contains',
        file: 'conclusion.tex',
        values: ['old model'],
      },
      {
        type: 'file_contains',
        file: 'abstract.tex',
        values: ['Aurora', '91.2\\%', '\\cite{smith2024}'],
      },
      {
        type: 'file_contains',
        file: 'results.tex',
        values: ['Aurora', '4 workers', '8 GB'],
      },
      {
        type: 'file_contains',
        file: 'conclusion.tex',
        values: ['Aurora', 'may'],
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'abstract.tex',
        line: 1,
        oldText: 'old model',
        newText: 'Aurora',
      },
      { file: 'results.tex', line: 1, oldText: 'old model', newText: 'Aurora' },
      {
        file: 'conclusion.tex',
        line: 1,
        oldText: 'old model',
        newText: 'Aurora',
      },
    ],
    protectedInvariants: [
      { file: 'abstract.tex', value: '91.2\\%' },
      { file: 'abstract.tex', value: '\\cite{smith2024}' },
      { file: 'results.tex', value: '4 workers' },
      { file: 'results.tex', value: '8 GB' },
      { file: 'conclusion.tex', value: 'may' },
    ],
    tags: ['multi-constraint', 'cross-file', 'invariants'],
    promptForm: 'constraint-list',
  }),
  makeCase({
    id: 'noop.already-via-macro',
    split: 'dev',
    category: 'no_op',
    capabilities: ['C1', 'C8'],
    difficulty: 'D3',
    factors: ['macro_resolution', 'already_satisfied', 'no_op'],
    files: [
      {
        path: 'main.tex',
        content: article('The platform is \\platform{}.', '\\input{names}\n'),
      },
      { path: 'names.tex', content: '\\newcommand{\\platform}{Aurora}\n' },
    ],
    goal: '如果平台名还不是 Aurora 就改成 Aurora；如果已经是，只告诉我，不要产生 patch。',
    action: 'no_op',
    graders: [
      { type: 'no_patch' },
      { type: 'workspace_changed', expected: false },
      { type: 'response_contains_any', values: ['Aurora', '已经', '无需'] },
    ],
    oracleResponse: '宏当前已经展开为 Aurora，无需修改。',
    tags: ['no-op', 'macro', 'target-discovery'],
    promptForm: 'conditional-request',
  }),
  makeCase({
    id: 'target.bibliography-two-databases',
    split: 'dev',
    category: 'bibliography_edit',
    capabilities: ['C1', 'C4', 'C6'],
    difficulty: 'D3',
    factors: ['multiple_bib_files', 'title_grounding', 'target_discovery'],
    files: [
      {
        path: 'main.tex',
        content: article(
          'Reliable Evaluation is discussed in \\cite{wrong}.\n\\bibliographystyle{plain}\n\\bibliography{refs,archive}',
        ),
      },
      {
        path: 'refs.bib',
        content:
          '@article{reliable2024, title={Reliable Evaluation}, author={Smith}, year={2024}}\n',
      },
      {
        path: 'archive.bib',
        content:
          '@article{legacy2020, title={Legacy Evaluation}, author={Doe}, year={2020}}\n',
      },
    ],
    goal: '正文引用键错了。根据标题 Reliable Evaluation 在两个 bib 文件中找到已有正确键，不要改 bib。',
    action: 'patch',
    compileMode: 'required-after-apply',
    graders: [
      {
        type: 'file_contains',
        file: 'main.tex',
        values: ['\\cite{reliable2024}'],
      },
      { type: 'file_unchanged', file: 'refs.bib' },
      { type: 'file_unchanged', file: 'archive.bib' },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'main.tex',
        line: 3,
        oldText: '\\cite{wrong}',
        newText: '\\cite{reliable2024}',
      },
    ],
    tags: ['bibliography', 'many-files', 'target-discovery'],
  }),
  makeCase({
    id: 'dynamic.correction-protected-caption',
    split: 'dev',
    category: 'dynamic_correction',
    capabilities: ['C6', 'C7', 'C11'],
    difficulty: 'D3',
    factors: ['user_correction', 'figure', 'protected_label'],
    files: [
      {
        path: 'main.tex',
        content: article(
          '\\begin{figure}\n\\fbox{A}\n\\caption{Old caption}\n\\label{fig:core}\n\\end{figure}',
        ),
      },
    ],
    goal: '把图注改成 Core architecture。',
    interactionFacts: [
      'Copilot 完成后再根据实际回复补充：请在图注中保留 overview 这个词，label 仍不能变。',
    ],
    action: 'patch',
    dynamicUser: true,
    maxUserTurns: 2,
    continueAfterPatch: true,
    compileMode: 'required-after-apply',
    graders: [
      { type: 'user_turns', min: 2, max: 2 },
      {
        type: 'file_matches',
        file: 'main.tex',
        pattern:
          '\\\\caption\\{(?=[^}]*core architecture)(?=[^}]*overview)[^}]*\\}',
      },
      {
        type: 'file_contains',
        file: 'main.tex',
        values: ['\\label{fig:core}'],
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'main.tex',
        line: 5,
        oldText: '\\caption{Old caption}',
        newText: '\\caption{Core architecture overview}',
      },
    ],
    oracleResponses: ['已修改图注。', '已加入 overview 并保留 label。'],
    protectedInvariants: [{ file: 'main.tex', value: '\\label{fig:core}' }],
    tags: ['dynamic', 'correction', 'figure'],
  }),

  // Frozen hidden holdout families. They are fixture/oracle validated before the
  // baseline, but must not be used for Agent debugging or prompt iteration.
  makeCase({
    id: 'hidden.conflicting-metrics-clarify',
    split: 'holdout',
    category: 'dynamic_clarification',
    capabilities: ['C1', 'C4', 'C7', 'C8'],
    difficulty: 'D4',
    factors: ['conflicting_evidence', 'ambiguity', 'cross_file'],
    files: [
      {
        path: 'main.tex',
        content: article(
          '\\input{abstract}\n\\input{results}\n\\input{appendix}',
        ),
      },
      { path: 'abstract.tex', content: 'The reported accuracy is TBD.\n' },
      {
        path: 'results.tex',
        content: 'Primary evaluation accuracy: 91.2\\%.\n',
      },
      { path: 'appendix.tex', content: 'Exploratory accuracy: 92.1\\%.\n' },
    ],
    goal: '把摘要里的准确率更新成项目里的结果值。',
    interactionFacts: [
      '只有在 Copilot 指出项目中有冲突数值并询问后才回答：以 Primary evaluation 的 91.2\\% 为准。',
      '如果未澄清就给 patch，拒绝并说明以 primary result 为准。',
    ],
    action: 'clarify',
    dynamicUser: true,
    maxUserTurns: 2,
    compileMode: 'required-after-apply',
    graders: [
      { type: 'first_response_no_patch' },
      { type: 'response_matches', response_index: 0, pattern: '[?？]' },
      { type: 'user_turns', min: 2, max: 2 },
      {
        type: 'file_contains',
        file: 'abstract.tex',
        values: ['91.2\\%'],
      },
      {
        type: 'file_not_contains',
        file: 'abstract.tex',
        values: ['92.1\\%', 'TBD'],
      },
      { type: 'file_unchanged', file: 'results.tex' },
      { type: 'file_unchanged', file: 'appendix.tex' },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'abstract.tex',
        line: 1,
        oldText: 'TBD',
        newText: '91.2\\%',
      },
    ],
    oracleResponses: [
      '项目中有两个值，请问以哪个为准？',
      '已采用 primary result。',
    ],
    tags: ['hidden', 'conflicting-evidence', 'clarification'],
    promptForm: 'under-specified',
  }),
  makeCase({
    id: 'hidden.patch-reject-exclude-appendix',
    split: 'holdout',
    category: 'patch_rejection',
    capabilities: ['C4', 'C8', 'C11'],
    difficulty: 'D4',
    factors: ['patch_rejection', 'changed_scope', 'three_files'],
    files: [
      {
        path: 'main.tex',
        content: article('\\input{intro}\n\\input{method}\n\\input{appendix}'),
      },
      { path: 'intro.tex', content: 'The legacy solver is fast.\n' },
      { path: 'method.tex', content: 'The legacy solver uses caching.\n' },
      {
        path: 'appendix.tex',
        content: 'The legacy solver configuration is archived.\n',
      },
    ],
    goal: '把 legacy solver 统一改成 Aurora solver。',
    interactionFacts: [
      '第一次 patch preview 必须拒绝，并改变范围：只改 intro.tex 和 method.tex，appendix.tex 是历史记录，必须保留。',
    ],
    action: 'patch',
    dynamicUser: true,
    maxUserTurns: 3,
    compileMode: 'required-after-apply',
    graders: [
      { type: 'patch_rejections', min: 1, max: 1 },
      { type: 'user_turns', min: 2, max: 3 },
      {
        type: 'file_contains',
        file: 'intro.tex',
        values: ['Aurora solver'],
      },
      {
        type: 'file_contains',
        file: 'method.tex',
        values: ['Aurora solver'],
      },
      { type: 'file_unchanged', file: 'appendix.tex' },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'intro.tex',
        line: 1,
        oldText: 'legacy solver',
        newText: 'Aurora solver',
      },
      {
        file: 'method.tex',
        line: 1,
        oldText: 'legacy solver',
        newText: 'Aurora solver',
      },
    ],
    oracleResponses: ['提出全局修改。', '已排除 appendix。'],
    tags: ['hidden', 'patch-rejection', 'cross-file'],
  }),
  makeCase({
    id: 'hidden.repair-wrapper-command',
    split: 'holdout',
    category: 'compile_repair',
    capabilities: ['C1', 'C4', 'C5'],
    difficulty: 'D3',
    factors: ['case_sensitive_macro', 'cross_file', 'compile_feedback'],
    files: [
      {
        path: 'main.tex',
        content: article('\\input{section}', '\\input{formatting}\n'),
      },
      {
        path: 'formatting.tex',
        content: '\\newcommand{\\ResultBold}[1]{\\textbf{#1}}\n',
      },
      { path: 'section.tex', content: '\\resultBold{Key result}\n' },
    ],
    goal: '编译错误来自一个 wrapper command。请使用项目中已有的正确宏，不要重写宏定义。',
    action: 'patch',
    initialCompile: 'failure',
    compileMode: 'repair-loop',
    graders: [
      {
        type: 'file_contains',
        file: 'section.tex',
        values: ['\\ResultBold{Key result}'],
      },
      { type: 'file_unchanged', file: 'formatting.tex' },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'section.tex',
        line: 1,
        oldText: '\\resultBold{Key result}',
        newText: '\\ResultBold{Key result}',
      },
    ],
    tags: ['hidden', 'repair-loop', 'macro'],
  }),
  makeCase({
    id: 'hidden.long-repeated-caption',
    split: 'holdout',
    category: 'long_context',
    capabilities: ['C1', 'C6', 'C10'],
    difficulty: 'D4',
    factors: ['long_file', 'repeated_caption', 'label_target'],
    files: [
      {
        path: 'main.tex',
        content: article(
          Array.from({ length: 60 }, (_, index) => {
            const pageBreak = (index + 1) % 10 === 0 ? '\n\\clearpage' : ''
            return `\\begin{figure}\n\\fbox{${index + 1}}\n\\caption{Diagnostic overview}\n\\label{fig:d${index + 1}}\n\\end{figure}${pageBreak}`
          }).join('\n'),
        ),
      },
    ],
    scale: 'single-long',
    pressure: 'repeated-anchors',
    goal: '只把标签 fig:d47 对应的图注改成 Ablation overview，其他 59 个同名图注不要动。',
    action: 'patch',
    compileMode: 'required-after-apply',
    graders: [
      {
        type: 'file_contains',
        file: 'main.tex',
        values: ['\\caption{Ablation overview}\n\\label{fig:d47}'],
      },
      {
        type: 'regex_count',
        file: 'main.tex',
        pattern: '\\\\caption\\{Diagnostic overview\\}',
        count: 59,
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'main.tex',
        line: null,
        oldText: '\\caption{Diagnostic overview}\n\\label{fig:d47}',
        newText: '\\caption{Ablation overview}\n\\label{fig:d47}',
      },
    ],
    tags: ['hidden', 'long-context', 'figure'],
  }),
  makeCase({
    id: 'hidden.duplicate-label-clarify',
    split: 'holdout',
    category: 'dynamic_clarification',
    capabilities: ['C3', 'C4', 'C8'],
    difficulty: 'D4',
    factors: ['duplicate_label', 'ambiguous_target', 'dynamic_turn'],
    files: [
      {
        path: 'main.tex',
        content: article('\\input{method-a}\n\\input{method-b}'),
      },
      {
        path: 'method-a.tex',
        content:
          '\\section{Method A}\\label{sec:method}\nSee \\ref{sec:method}.\n',
      },
      {
        path: 'method-b.tex',
        content:
          '\\section{Method B}\\label{sec:method}\nSee \\ref{sec:method}.\n',
      },
    ],
    goal: '把 sec:method 重命名成 sec:approach，并同步对应引用。',
    interactionFacts: [
      '只有在 Copilot 发现重复定义并询问后回答：只处理 Method B，也就是 method-b.tex。',
      '若它未澄清就给 patch，拒绝并指出只处理 Method B。',
    ],
    action: 'clarify',
    dynamicUser: true,
    maxUserTurns: 2,
    compileMode: 'required-after-apply',
    graders: [
      { type: 'first_response_no_patch' },
      { type: 'response_matches', response_index: 0, pattern: '[?？]' },
      { type: 'user_turns', min: 2, max: 2 },
      { type: 'file_unchanged', file: 'method-a.tex' },
      {
        type: 'file_contains',
        file: 'method-b.tex',
        values: ['\\label{sec:approach}', '\\ref{sec:approach}'],
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'method-b.tex',
        line: 1,
        oldText: '\\label{sec:method}',
        newText: '\\label{sec:approach}',
      },
      {
        file: 'method-b.tex',
        line: 2,
        oldText: '\\ref{sec:method}',
        newText: '\\ref{sec:approach}',
      },
    ],
    oracleResponses: ['发现两个定义，请问处理哪一个？', '已仅修改 Method B。'],
    tags: ['hidden', 'clarification', 'duplicate-label'],
    promptForm: 'under-specified',
  }),
  makeCase({
    id: 'hidden.combined-followup-repair',
    split: 'holdout',
    category: 'failure_recovery',
    capabilities: ['C4', 'C5', 'C7', 'C11'],
    difficulty: 'D4',
    factors: ['dynamic_followup', 'compile_repair', 'cross_file'],
    files: [
      {
        path: 'main.tex',
        content: article('\\input{method}'),
      },
      { path: 'method.tex', content: '\\textbfX{Method result: 91.2\\%}\n' },
      {
        path: 'conclusion.tex',
        content: '\\textbfX{Conclusion result: 91.2\\%}\n',
      },
    ],
    goal: '先只修复 method.tex 里的 LaTeX 命令错误，并保留 91.2\\%。',
    interactionFacts: [
      'Copilot 完成 method 修复后，再基于实际回复补充：现在也修复 conclusion.tex 中同类错误，数值仍要保留。',
    ],
    action: 'patch',
    dynamicUser: true,
    maxUserTurns: 2,
    continueAfterPatch: true,
    initialCompile: 'failure',
    compileMode: 'repair-loop',
    graders: [
      { type: 'user_turns', min: 2, max: 2 },
      {
        type: 'file_contains',
        file: 'method.tex',
        values: ['\\textbf{Method result: 91.2\\%}'],
      },
      {
        type: 'file_contains',
        file: 'conclusion.tex',
        values: ['\\textbf{Conclusion result: 91.2\\%}'],
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: 'method.tex',
        line: 1,
        oldText: '\\textbfX',
        newText: '\\textbf',
      },
      {
        file: 'conclusion.tex',
        line: 1,
        oldText: '\\textbfX',
        newText: '\\textbf',
      },
    ],
    oracleResponses: ['已修复 method。', '已修复 conclusion。'],
    protectedInvariants: [
      { file: 'method.tex', value: '91.2\\%' },
      { file: 'conclusion.tex', value: '91.2\\%' },
    ],
    tags: ['hidden', 'dynamic', 'repair-loop'],
  }),
]
