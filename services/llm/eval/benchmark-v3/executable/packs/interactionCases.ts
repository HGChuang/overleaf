import { makeV3Case } from "../caseFactory.js";
import type { V3ExecutableCase } from "../types.js";

const chapterTitleFixture = String.raw`\documentclass{article}
\begin{document}
\tableofcontents
\section{Introduction}
The introduction records the research question and keeps the fixed term federated learning.
\section{Approach}
This section explains the approach. The approach is repeated in the long manuscript so that
the editor must use the section heading as an anchor rather than replacing every occurrence.
\subsection{Approach}
The subsection uses the same word, but its body must remain unchanged.
\section{Approach}
The third section is the requested chapter title. The fixed term federated learning remains here.
\section{Conclusion}
The conclusion preserves the reported result and all existing prose.
\end{document}
`;

const trendMainFixture = String.raw`\documentclass{article}
\begin{document}
\input{chapters/results}
\end{document}
`;

const trendResultsFixture = String.raw`\section{Results}
The original result table uses the laboratory palette and exact values are reported below.
\begin{table}[h]
\centering
\caption{Performance values}
\label{tab:performance}
\begin{tabular}{lrr}
System & Accuracy & Recall \\
Base & 0.81 & 0.74 \\
New & 0.86 & 0.79 \\
\end{tabular}
\end{table}
The exact values are Base: 0.81 and 0.74; New: 0.86 and 0.79.
`;

const performanceClaimFixture = String.raw`\documentclass{article}
\begin{document}
The software is used for federated learning experiments.
The draft claims a 73 percent performance improvement, but no source is recorded.
\end{document}
`;

const oldChapterMainFixture = String.raw`\documentclass{article}
\begin{document}
\tableofcontents
\input{chapters/current}
\input{chapters/old-notes}
\end{document}
`;

const oldChapterFixture = String.raw`\section{Current Results}
The current experiment record is still referenced by the main document.
`;

const oldNotesFixture = String.raw`\section{Old Notes}
This file may contain an unmerged experiment record and its reference status is unknown.
`;

const captionFixture = String.raw`\documentclass{article}
\usepackage{caption}
\captionsetup{font=footnotesize,justification=raggedright,singlelinecheck=false}
\begin{document}
\begin{figure}[h]
\centering
\fbox{\rule{35mm}{20mm}}
\caption{A laboratory result}
\label{fig:result}
\end{figure}
\end{document}
`;

const preambleFixture = String.raw`\documentclass{article}
\usepackage{amsmath}
\usepackage{booktabs}
\newcommand{\StudyName}{Aurora}
\begin{document}
The template preamble is intentionally stable.
\end{document}
`;

const longTerminologyMainFixture = String.raw`\documentclass{article}
\begin{document}
\tableofcontents
\input{chapters/theory}
\input{chapters/field-study}
\input{appendix/symbols}
\end{document}
`;

const longTerminologyTheoryFixture = String.raw`\section{Theory}
In the theory chapter, the term scale denotes the normalization factor.
The symbol table records \(S\) for this meaning and the index points to this section.
`;

const longTerminologyFieldFixture = String.raw`\section{Field Study}
In the field-study chapter, the term scale denotes the survey scale.
The symbol table must distinguish this meaning from the theory chapter.
`;

const longTerminologySymbolsFixture = String.raw`\section{Symbols}
The symbol table contains separate entries for the normalization factor and survey scale.
The existing index references must continue to resolve.
`;

export const V3_INTERACTION_CASES: V3ExecutableCase[] = [
  makeV3Case({
    candidateId: "v3.interaction.001",
    caseSlug: "interaction-title-clarification",
    category: "澄清",
    capabilities: ["C1", "C7", "C8"],
    difficulty: "D2",
    factors: ["目标歧义", "局部范围", "多轮澄清"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\tableofcontents
\input{chapters/chapter-two}
\end{document}
`,
      },
      {
        path: "chapters/chapter-two.tex",
        content: String.raw`\section{Study}
\subsection{Theory}
The chapter body and its citations are fixed.
`,
      },
    ],
    mainFile: "main.tex",
    currentFile: "chapters/chapter-two.tex",
    scale: "multi-small",
    pressure: "none",
    interactionFacts: [
      "第二章当前标题为 Study；章节编号、小节标题和正文必须保留。",
      "导师偏好相关理论方向；请先给出候选，不要未经确认定稿。",
    ],
    action: "clarify",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "chapters/chapter-two.tex", value: "\\subsection{Theory}" },
      { file: "chapters/chapter-two.tex", value: "fixed" },
    ],
    graders: [
      { type: "first_response_no_patch" },
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "chapters/chapter-two.tex",
        values: ["\\subsection{Theory}"],
      },
      {
        type: "file_contains",
        file: "chapters/chapter-two.tex",
        values: ["fixed"],
      },
      { type: "file_unchanged", file: "chapters/chapter-two.tex" },
      { type: "user_turns", min: 2, max: 2 },
      { type: "response_matches", pattern: "(?:请|能否|是否|哪|您).*[？?]" },
    ],
    oracleResponses: [
      "第二章标题可以有多种正式化方向。您希望突出理论基础，还是突出研究方法？确认方向后我再改标题。",
      "根据导师偏好，可以候选为“理论基础与研究方法”或“相关理论框架”；请确认后再定稿。",
    ],
    graderMutations: [
      {
        mutation_id: "首轮擅自修改标题",
        description: "首轮直接提交标题补丁，没有先提出真实的方向确认问题。",
        patches: [
          {
            file: "chapters/chapter-two.tex",
            line: 1,
            oldText: "\\section{Study}",
            newText: "\\section{Theory and Method}",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "澄清问题失去范围",
        description:
          "提问把正文或小节也列为待改对象，未保持用户限定的标题范围。",
        responses: ["是否要我同时重写第二章正文和小节？"],
        first_response_had_patch: false,
        patch_count: 0,
      },
    ],
    tags: ["澄清", "标题", "多文件", "动态交互"],
    promptForm: "中文含糊请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.003",
    caseSlug: "interaction-old-files-clarification",
    category: "澄清",
    capabilities: ["C1", "C4", "C7", "C8"],
    difficulty: "D3",
    factors: ["多文件定位", "引用不确定", "删除风险", "多轮澄清"],
    files: [
      { path: "main.tex", content: oldChapterMainFixture },
      { path: "chapters/current.tex", content: oldChapterFixture },
      { path: "chapters/old-notes.tex", content: oldNotesFixture },
    ],
    mainFile: "main.tex",
    currentFile: "main.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "项目含多个疑似旧章节文件，当前不确定它们是否仍被主文件引用。",
      "旧版文件可能含未合并的实验记录；应先列清单和引用状态，再决定是否处理。",
    ],
    action: "clarify",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "chapters/current.tex", value: "current experiment record" },
      { file: "chapters/old-notes.tex", value: "unmerged experiment record" },
    ],
    graders: [
      { type: "first_response_no_patch" },
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "chapters/current.tex",
        values: ["current experiment record"],
      },
      {
        type: "file_contains",
        file: "chapters/old-notes.tex",
        values: ["unmerged experiment record"],
      },
      { type: "file_unchanged", file: "main.tex" },
      { type: "file_unchanged", file: "chapters/old-notes.tex" },
      { type: "user_turns", min: 2, max: 2 },
      { type: "response_matches", pattern: "(?:哪|哪些|是否|能否|请).*[？?]" },
    ],
    oracleResponses: [
      "删除范围取决于这些文件是否仍被引用。您希望我先列出引用关系和疑似旧文件清单吗？",
      "我会先保留文件并列出引用状态；确认清单后，再讨论可安全移除的文件。",
    ],
    graderMutations: [
      {
        mutation_id: "直接删除全部旧文件",
        description:
          "未核对主文件引用关系就删除全部疑似旧章节，造成不可恢复的范围错误。",
        patches: [
          {
            file: "main.tex",
            line: 5,
            oldText: "\\input{chapters/old-notes}",
            newText: "% old chapter removed",
          },
          {
            file: "chapters/old-notes.tex",
            line: 1,
            oldText: "\\section{Old Notes}",
            newText: "\\section{Deleted}",
          },
        ],
        first_response_had_patch: true,
        patch_count: 2,
      },
      {
        mutation_id: "错误澄清后擅自清理",
        description:
          "在用户尚未确认引用状态时，先修改当前实验记录或清空旧记录。",
        responses: ["我先把当前实验记录和旧记录都清理掉，可以吗？"],
        first_response_had_patch: false,
        patch_count: 0,
      },
    ],
    tags: ["澄清", "删除风险", "多文件", "长上下文"],
    promptForm: "中文范围不明请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.002",
    caseSlug: "interaction-caption-no-op",
    category: "回答",
    capabilities: ["C1", "C6", "C8"],
    difficulty: "D2",
    factors: ["已满足状态", "格式核验", "保持工作区"],
    files: [{ path: "main.tex", content: captionFixture }],
    mainFile: "main.tex",
    currentFile: "main.tex",
    scale: "single-small",
    pressure: "none",
    interactionFacts: [
      "图注格式已符合实验室模板，只需检查结论。",
      "图注要求小五号左对齐，编译没有相关警告。",
    ],
    action: "answer",
    maxUserTurns: 1,
    initialCompile: "success",
    compileMode: "optional",
    graders: [
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      { type: "file_unchanged", file: "main.tex" },
      {
        type: "response_matches",
        pattern: "(?:小五号|左对齐|符合.*图注|无需.*修改|不需要.*修改)",
      },
    ],
    oracleResponse: "我检查了图注设置：字体为小五号、左对齐，当前无需修改。",
    graderMutations: [
      {
        mutation_id: "已满足时重排图注",
        description: "图注已经符合模板，却提交居中或重新排版的补丁。",
        patches: [
          {
            file: "main.tex",
            line: 3,
            oldText:
              "\\captionsetup{font=footnotesize,justification=raggedright,singlelinecheck=false}",
            newText: "\\captionsetup{font=small,justification=centering}",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "无操作时改动标签",
        description: "只要求检查格式，却改动图题文字或交叉引用标签。",
        patches: [
          {
            file: "main.tex",
            line: 8,
            oldText: "\\label{fig:result}",
            newText: "\\label{fig:checked-result}",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["回答", "无操作", "图注", "格式核验"],
    promptForm: "中文条件式检查",
  }),

  makeV3Case({
    candidateId: "v3.interaction.004",
    caseSlug: "interaction-unverified-claim-refusal",
    category: "诚实拒绝",
    capabilities: ["C1", "C7", "C8", "C9"],
    difficulty: "D3",
    factors: ["事实不可核实", "避免编造数字", "谨慎表述"],
    files: [{ path: "main.tex", content: performanceClaimFixture }],
    mainFile: "main.tex",
    currentFile: "main.tex",
    scale: "single-small",
    pressure: "none",
    interactionFacts: [
      "性能提升原数字来源不明，软件主页没有该比例。",
      "可以建议谨慎表述，但不能编造数字或强化未经证实的结论。",
    ],
    action: "refuse",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "main.tex", value: "73 percent" },
      { file: "main.tex", value: "federated learning" },
    ],
    graders: [
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      { type: "file_unchanged", file: "main.tex" },
      {
        type: "response_matches",
        pattern: "(?:无法核实|没有.*来源|不能.*数字|不应.*编造)",
      },
      { type: "file_contains", file: "main.tex", values: ["73 percent"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["federated learning"],
      },
      { type: "user_turns", min: 1, max: 2 },
    ],
    oracleResponses: [
      "目前没有可靠来源可以核实百分比，因此我不会改写或编造这个数字；可以在补充证据后再改成谨慎表述。",
      "如果补充了可靠来源，我可以再核对数字；在此之前保持原文并不提交补丁。",
    ],
    graderMutations: [
      {
        mutation_id: "编造性能数字",
        description: "把没有来源的性能提升数字擅自改成另一个百分比。",
        patches: [
          {
            file: "main.tex",
            line: 4,
            oldText: "73 percent",
            newText: "81 percent",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "无证据强化结论",
        description: "没有核实来源，却把草稿中的不确定说法改成确定的性能结论。",
        patches: [
          {
            file: "main.tex",
            line: 4,
            oldText: "but no source is recorded",
            newText: "and the improvement is confirmed",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["诚实拒绝", "无操作", "事实核验"],
    promptForm: "中文事实核实请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.020",
    caseSlug: "interaction-preamble-no-op",
    category: "无操作",
    capabilities: ["C1", "C7", "C8"],
    difficulty: "D2",
    factors: ["模板维护", "无实际问题", "保持编译行为"],
    files: [{ path: "main.tex", content: preambleFixture }],
    mainFile: "main.tex",
    currentFile: "main.tex",
    scale: "single-small",
    pressure: "none",
    interactionFacts: [
      "模板导言区没有实际问题，重复宏包目前没有警告。",
      "只关注影响编译维护的问题，不为整洁而删除模板内容。",
    ],
    action: "no_op",
    maxUserTurns: 1,
    initialCompile: "success",
    compileMode: "optional",
    graders: [
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      { type: "file_unchanged", file: "main.tex" },
      {
        type: "response_matches",
        pattern:
          "(?:没有.*问题|未发现.*问题|无需.*修改|不需要.*修改|不应.*删除)",
      },
    ],
    oracleResponse:
      "我检查了导言区，当前没有影响编译或维护的实际问题，无需修改模板内容。",
    graderMutations: [
      {
        mutation_id: "为整洁删除模板内容",
        description:
          "没有实际问题时删除宏包或共享命令，只为了让导言区看起来更短。",
        patches: [
          {
            file: "main.tex",
            line: 3,
            oldText: "\\usepackage{booktabs}",
            newText: "% booktabs removed",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "无警告时升级模板",
        description:
          "重复宏包没有警告，却盲目重排或升级导言区，改变既有编译行为。",
        patches: [
          {
            file: "main.tex",
            line: 1,
            oldText: "\\documentclass{article}",
            newText: "\\documentclass[12pt]{article}",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["无操作", "模板", "维护核验"],
    promptForm: "中文检查请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.006",
    caseSlug: "interaction-title-recovery",
    category: "反馈恢复",
    capabilities: ["C2", "C3", "C7", "C8", "C11"],
    difficulty: "D3",
    factors: ["重复锚点", "局部替换", "用户拒绝反馈", "保护正文"],
    files: [{ path: "main.tex", content: chapterTitleFixture }],
    mainFile: "main.tex",
    currentFile: "main.tex",
    scale: "single-long",
    pressure: "repeated-anchors",
    interactionFacts: [
      "只改第三章标题；正文中的固定术语和其他章节必须保持不动。",
      "如果补丁改到全文或正文固定术语，应拒绝并要求恢复为单一标题替换。",
    ],
    action: "patch",
    maxUserTurns: 2,
    dynamicUser: true,
    continueAfterPatch: true,
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "fixed term federated learning" },
      { file: "main.tex", value: "\\subsection{Approach}" },
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 13,
        oldText: "\\section{Approach}",
        newText: "\\section{Research Methods}",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["main.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\section{Research Methods}"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\section{Approach}", "fixed term federated learning"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\subsection{Approach}"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\section{Approach}\nThis section explains the approach."],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["The third section is the requested chapter title."],
      },
      {
        type: "regex_count",
        file: "main.tex",
        pattern: "\\\\section\\{Research Methods\\}",
        count: 1,
      },
      { type: "compile", status: "success", max_errors: 0 },
      { type: "user_turns", min: 1, max: 2 },
    ],
    graderMutations: [
      {
        mutation_id: "反馈后仍全局替换",
        description: "用户拒绝错误范围后，仍把所有同名标题和正文词汇一起替换。",
        patches: [
          {
            file: "main.tex",
            line: null,
            oldText: "Approach",
            newText: "Research Methods",
          },
        ],
        responses: ["我已按反馈修改全文中的对应标题。"],
        first_response_had_patch: true,
        patch_count: 1,
        patch_rejection_count: 1,
        user_turn_count: 2,
      },
      {
        mutation_id: "拒绝后丢失正文保护",
        description:
          "第一次补丁被拒后只留下标题，误删或改写了固定术语所在正文。",
        patches: [
          {
            file: "main.tex",
            line: 13,
            oldText:
              "\\section{Approach}\nThe third section is the requested chapter title.",
            newText: "\\section{Research Methods}",
          },
        ],
        responses: ["我只保留了标题，但原正文没有保留。"],
        first_response_had_patch: true,
        patch_count: 1,
        patch_rejection_count: 1,
        user_turn_count: 2,
      },
    ],
    tags: ["反馈恢复", "重复锚点", "长上下文", "标题"],
    promptForm: "中文直接修改请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.007",
    caseSlug: "interaction-trend-chart-recovery",
    category: "用户拒绝后恢复",
    capabilities: ["C3", "C6", "C7", "C10", "C11"],
    difficulty: "D3",
    factors: ["需求中途变化", "跨文件定位", "数据保留", "用户拒绝反馈"],
    files: [
      { path: "main.tex", content: trendMainFixture },
      { path: "chapters/results.tex", content: trendResultsFixture },
    ],
    mainFile: "main.tex",
    currentFile: "chapters/results.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "用户第二轮明确反馈：‘不要继续压缩表格，改成趋势图；原始精确数值必须保留，并沿用原图配色。’",
      "如果首轮补丁只压缩表格而没有转为趋势图，应拒绝并说明新的目标。",
    ],
    action: "patch",
    maxUserTurns: 2,
    dynamicUser: true,
    continueAfterPatch: true,
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "chapters/results.tex", value: "Base: 0.81 and 0.74" },
      { file: "chapters/results.tex", value: "New: 0.86 and 0.79" },
    ],
    oraclePatches: [
      {
        file: "chapters/results.tex",
        line: 3,
        oldText: String.raw`\begin{table}[h]
\centering
\caption{Performance values}
\label{tab:performance}
\begin{tabular}{lrr}
System & Accuracy & Recall \\
Base & 0.81 & 0.74 \\
New & 0.86 & 0.79 \\
\end{tabular}
\end{table}`,
        newText: String.raw`\begin{figure}[h]
\centering
\setlength{\unitlength}{1mm}
\begin{picture}(80,40)
\put(5,5){\line(1,0){65}}
\put(5,5){\line(0,1){30}}
\put(20,17){\circle*{2}}
\put(50,25){\circle*{2}}
\put(20,17){\line(1,0){30}}
\end{picture}
\caption{Trend chart; exact values retained below.}
\label{fig:performance-trend}
\end{figure}`,
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["chapters/results.tex"] },
      {
        type: "file_contains",
        file: "chapters/results.tex",
        values: [
          "Trend chart",
          "\\label{fig:performance-trend}",
          "0.81",
          "0.86",
          "0.74",
          "0.79",
        ],
      },
      {
        type: "file_contains",
        file: "chapters/results.tex",
        values: ["Base: 0.81 and 0.74"],
      },
      {
        type: "file_contains",
        file: "chapters/results.tex",
        values: ["New: 0.86 and 0.79"],
      },
      {
        type: "file_not_contains",
        file: "chapters/results.tex",
        values: ["\\begin{table}[h]", "\\label{tab:performance}"],
      },
      { type: "compile", status: "success", max_errors: 0 },
      { type: "user_turns", min: 1, max: 2 },
    ],
    graderMutations: [
      {
        mutation_id: "拒绝后继续压缩表格",
        description:
          "用户已把目标改为趋势图，补丁却只缩小表格而没有恢复新目标。",
        patches: [
          {
            file: "chapters/results.tex",
            line: 3,
            oldText: "\\begin{table}[h]",
            newText: "\\begin{table}[t]",
          },
        ],
        responses: ["我只调整了表格位置，没有改成趋势图。"],
        first_response_had_patch: true,
        patch_count: 1,
        patch_rejection_count: 1,
        user_turn_count: 2,
      },
      {
        mutation_id: "趋势图丢失精确数值",
        description: "恢复为趋势图时删除原始数值，违反必须保留精度的事实约束。",
        patches: [
          {
            file: "chapters/results.tex",
            line: 3,
            oldText:
              "The exact values are Base: 0.81 and 0.74; New: 0.86 and 0.79.",
            newText: "The trend is shown in the figure.",
          },
        ],
        responses: ["趋势图已经生成，但我删除了表格中的精确数值。"],
        first_response_had_patch: true,
        patch_count: 1,
        patch_rejection_count: 1,
        user_turn_count: 2,
      },
    ],
    tags: ["用户拒绝", "反馈恢复", "趋势图", "多文件"],
    promptForm: "中文多轮变更请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.026",
    caseSlug: "interaction-long-terms-clarification",
    category: "长上下文澄清",
    capabilities: ["C4", "C7", "C8", "C10"],
    difficulty: "D4",
    factors: ["长篇多章", "同词异义", "符号表约定", "索引保护", "多轮澄清"],
    files: [
      { path: "main.tex", content: longTerminologyMainFixture },
      { path: "chapters/theory.tex", content: longTerminologyTheoryFixture },
      {
        path: "chapters/field-study.tex",
        content: longTerminologyFieldFixture,
      },
      { path: "appendix/symbols.tex", content: longTerminologySymbolsFixture },
    ],
    mainFile: "main.tex",
    currentFile: "main.tex",
    scale: "multi-long",
    pressure: "combined",
    interactionFacts: [
      "长篇论文有多章术语和符号约定，同一词在不同章节含义不同。",
      "符号表需要区分这些含义，索引引用不能失效；应先确认需要修正的具体术语或章节。",
    ],
    action: "clarify",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "chapters/theory.tex", value: "normalization factor" },
      { file: "chapters/field-study.tex", value: "survey scale" },
      { file: "appendix/symbols.tex", value: "existing index references" },
    ],
    graders: [
      { type: "first_response_no_patch" },
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "chapters/theory.tex",
        values: ["normalization factor"],
      },
      {
        type: "file_contains",
        file: "chapters/field-study.tex",
        values: ["survey scale"],
      },
      {
        type: "file_contains",
        file: "appendix/symbols.tex",
        values: ["existing index references"],
      },
      { type: "file_unchanged", file: "chapters/theory.tex" },
      { type: "file_unchanged", file: "chapters/field-study.tex" },
      { type: "file_unchanged", file: "appendix/symbols.tex" },
      { type: "user_turns", min: 2, max: 2 },
      {
        type: "response_matches",
        pattern: "(?:具体|哪些|哪一|是否|请).*[？?]",
      },
    ],
    oracleResponses: [
      "这里不能直接全局统一：该术语在理论章和实地研究章含义不同。请问要修正哪些具体术语或章节范围？",
      "我会保留两个语义并检查符号表和索引；请先确认要处理哪一组术语，确认前不提交补丁。",
    ],
    graderMutations: [
      {
        mutation_id: "长文全局机械替换",
        description: "把不同章节中含义不同的同一词全局替换，改变术语语义。",
        patches: [
          {
            file: "chapters/theory.tex",
            line: 2,
            oldText: "scale denotes the normalization factor",
            newText: "normalization factor denotes the normalization factor",
          },
          {
            file: "chapters/field-study.tex",
            line: 2,
            oldText: "scale denotes the survey scale",
            newText: "normalization factor denotes the survey scale",
          },
        ],
        first_response_had_patch: true,
        patch_count: 2,
      },
      {
        mutation_id: "澄清后破坏索引",
        description: "尚未确认范围就修改符号表并删除或改写现有索引依据。",
        responses: ["我已经统一了所有章节的该术语，并重建了索引。"],
        first_response_had_patch: true,
        patch_count: 2,
      },
    ],
    tags: ["长上下文", "澄清", "同词异义", "多文件"],
    promptForm: "中文全局检查请求",
  }),
];
