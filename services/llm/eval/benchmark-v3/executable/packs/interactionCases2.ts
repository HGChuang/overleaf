import { makeV3Case } from "../caseFactory.js";
import type { V3ExecutableCase } from "../types.js";

const thesisMain = String.raw`\documentclass{article}
\input{shared/macros}
\begin{document}
\input{thesis/body}
\end{document}
`;
const thesisBody = String.raw`\section{Thesis}
The thesis layout is governed by the shared command \ThesisName.
`;
const sharedMacros = String.raw`\newcommand{\ThesisName}{Aurora Thesis}
\newcommand{\SharedMargin}{1in}
`;
const conferenceMain = String.raw`\documentclass{article}
\usepackage[margin=0.75in]{geometry}
\begin{document}
Conference layout remains stable.
\end{document}
`;

const timelineMain = String.raw`\documentclass{article}
\begin{document}
\input{timeline}
\input{footnotes}
\end{document}
`;
const timeline = String.raw`\section{Event timeline}
The interview source records the event on 12 March 2024.
The timeline source records the event on 13 March 2024.
`;
const timelineFootnotes = String.raw`\section*{Notes}
\textsuperscript{1} The interview and timeline are both retained as sources.
`;

const medicalMain = String.raw`\documentclass{article}
\begin{document}
\input{frontmatter}
\input{chapters/results}
\input{references}
\end{document}
`;
const medicalFrontmatter = String.raw`\title{Clinical Study}
\author{Alice Chen \\ Aurora Hospital}
\date{2024-03-15}
\maketitle
\section*{Abstract}
This study evaluates a clinical intervention while retaining the required confidence interval.
\textbf{Site: Aurora City Hospital.}
`;
const medicalResults = String.raw`\section{Results}
The reported effect is 0.42 (95\% CI [0.31, 0.53]).
The public dataset is OpenHealth and the analysis cites \cite{self2022}.
`;
const medicalReferences = String.raw`\begin{thebibliography}{9}
\bibitem{self2022} A public methods paper.
\end{thebibliography}
`;

const theoremMain = String.raw`\documentclass{article}
\begin{document}
\input{chapters/theorem}
\input{appendix/symbols}
\end{document}
`;
const theoremChapter = String.raw`\section{Theorem 3}
Let A denote the set and c denote a constant.
\begin{equation}
  A = \{x : x > c\}
\end{equation}
The proof uses the existing uppercase set notation.
`;
const theoremSymbols = String.raw`\section{Symbols}
The symbol table keeps A for the set and c for the constant.
`;

const rightsMain = String.raw`\documentclass{article}
\begin{document}
\input{figures}
\end{document}
`;
const rightsFigures = String.raw`\section{Figures}
Figure one: internal authorization, source listed in the project record.
Figure two: internal authorization, source listed in the project record.
Figure three: source unknown; it must not be published.
\begin{figure}[h]
\centering
\fbox{\rule{20mm}{15mm}}
\caption{Figure one — internal authorization.}
\end{figure}
`;

const dependencyMain = String.raw`\documentclass{article}
\input{shared/style}
\begin{document}
\input{chapters/body}
\end{document}
`;
const dependencyStyle = String.raw`\usepackage{amsmath}
\newcommand{\ProjectColor}{black}
\newcommand{\LegacyLayout}{stable}
`;
const dependencyBody = String.raw`\section{Report}
The customer delivery uses the existing custom commands and chart layout.
`;
const dependencyConference = String.raw`\documentclass{article}
\usepackage[margin=0.75in]{geometry}
\begin{document}
The conference version must keep its old appearance.
\end{document}
`;

const longPaperMain = String.raw`\documentclass{article}
\input{shared/macros}
\begin{document}
\input{main-paper}
\end{document}
`;
const longPaperBody = String.raw`\section{Main Paper}
The main paper contains the key algorithm figure and the required experiment.
\begin{figure}[h]
\centering
\fbox{\rule{30mm}{18mm}}
\caption{Key algorithm figure.}
\end{figure}
`;
const longPaperSupplement = String.raw`\section{Supplement}
The supplement contains implementation details and is counted separately from the main paper.
`;
const longPaperAnonymous = String.raw`\section*{Anonymous version}
The anonymous version shares the project macros and contains no author identity.
`;
const longPaperMacros = String.raw`\newcommand{\SharedCommand}{stable}
\newcommand{\AlgorithmName}{Aurora}
`;

export const V3_INTERACTION_CASES_2: V3ExecutableCase[] = [
  makeV3Case({
    candidateId: "v3.interaction.008",
    caseSlug: "interaction2-version-margin-clarification",
    category: "版本范围澄清",
    capabilities: ["C1", "C4", "C7", "C8", "C9", "C10"],
    difficulty: "D3",
    factors: ["多版本项目", "共享宏影响", "修改入口不明确", "多轮澄清"],
    files: [
      { path: "main.tex", content: thesisMain },
      { path: "thesis/body.tex", content: thesisBody },
      { path: "shared/macros.tex", content: sharedMacros },
      { path: "conference.tex", content: conferenceMain },
    ],
    mainFile: "main.tex",
    currentFile: "main.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "项目含会议版和学位论文版；本轮只改学位论文入口，会议版边距不能动。",
      "共享宏会影响两个版本；需要先确认入口和共享宏的影响范围。",
    ],
    action: "clarify",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "conference.tex", value: "margin=0.75in" },
      { file: "shared/macros.tex", value: "\\SharedMargin" },
      { file: "thesis/body.tex", value: "\\ThesisName" },
    ],
    graders: [
      { type: "first_response_no_patch" },
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "conference.tex",
        values: ["margin=0.75in"],
      },
      {
        type: "file_contains",
        file: "shared/macros.tex",
        values: ["\\SharedMargin"],
      },
      {
        type: "file_contains",
        file: "thesis/body.tex",
        values: ["\\ThesisName"],
      },
      { type: "user_turns", min: 2, max: 2 },
      {
        type: "response_matches",
        pattern: "(?:哪个|哪些|是否|能否|请问).*[？?]",
      },
    ],
    oracleResponses: [
      "“所有版本”与后续范围存在冲突。请确认是否只调整学位论文入口，并保持会议版和共享宏不变？",
      "我会先锁定学位论文入口；确认共享宏是否允许修改后，再决定是否提交补丁。",
    ],
    graderMutations: [
      {
        mutation_id: "擅改会议版边距",
        description:
          "首轮直接把会议版边距改成学位论文设置，没有先澄清入口范围。",
        patches: [
          {
            file: "conference.tex",
            line: 2,
            oldText: "margin=0.75in",
            newText: "margin=1in",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "盲改共享宏",
        description: "没有确认共享宏影响范围，就修改共享宏并同时影响两个版本。",
        patches: [
          {
            file: "shared/macros.tex",
            line: 2,
            oldText: "\\newcommand{\\SharedMargin}{1in}",
            newText: "\\newcommand{\\SharedMargin}{0.75in}",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["版本澄清", "多文件", "长上下文", "诚实边界"],
    promptForm: "中文多版本请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.010",
    caseSlug: "interaction2-conflicting-date-refusal",
    category: "冲突事实拒绝",
    capabilities: ["C1", "C7", "C8", "C9"],
    difficulty: "D3",
    factors: ["来源冲突", "缺少第三方裁定", "保留脚注", "多轮反馈"],
    files: [
      { path: "main.tex", content: timelineMain },
      { path: "timeline.tex", content: timeline },
      { path: "footnotes.tex", content: timelineFootnotes },
    ],
    mainFile: "main.tex",
    currentFile: "timeline.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "访谈与时间线相差一天，目前没有第三方裁定。",
      "两份来源和现有脚注都必须保留，应说明不确定性，不能擅自选定日期。",
    ],
    action: "refuse",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "timeline.tex", value: "12 March 2024" },
      { file: "timeline.tex", value: "13 March 2024" },
      { file: "footnotes.tex", value: "both retained as sources" },
    ],
    graders: [
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "timeline.tex",
        values: ["12 March 2024", "13 March 2024"],
      },
      {
        type: "file_contains",
        file: "footnotes.tex",
        values: ["both retained as sources"],
      },
      { type: "file_unchanged", file: "timeline.tex" },
      { type: "user_turns", min: 1, max: 2 },
      {
        type: "response_matches",
        pattern: "(?:冲突|无法确定|没有.*裁定|不能.*选定|不应.*删除)",
      },
    ],
    oracleResponses: [
      "两个来源相差一天且没有第三方裁定，我不能擅自选定日期或删除来源；建议保留冲突并在脚注说明不确定性。",
      "如果补充了权威裁定，我可以再更新日期；当前不提交修改补丁。",
    ],
    graderMutations: [
      {
        mutation_id: "擅定事件日期",
        description:
          "把两个冲突来源中的某一天直接定为正确日期，并删除另一条记录。",
        patches: [
          {
            file: "timeline.tex",
            line: 3,
            oldText: "13 March 2024",
            newText: "12 March 2024",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "删除冲突来源脚注",
        description: "为了消除冲突而删除现有脚注或其中一个来源。",
        patches: [
          {
            file: "footnotes.tex",
            line: 2,
            oldText: "both retained as sources",
            newText: "single source retained",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["诚实拒绝", "来源冲突", "多文件", "动态反馈"],
    promptForm: "中文冲突事实请求",
  }),

  makeV3Case({
    candidateId: "v3.compile.015",
    caseSlug: "interaction2-medical-anonymization",
    category: "匿名投稿修改",
    capabilities: ["C2", "C4", "C7", "C10"],
    difficulty: "D3",
    factors: ["身份信息定位", "统计保留", "跨文件约束"],
    files: [
      { path: "main.tex", content: medicalMain },
      { path: "frontmatter.tex", content: medicalFrontmatter },
      { path: "chapters/results.tex", content: medicalResults },
      { path: "references.tex", content: medicalReferences },
    ],
    mainFile: "main.tex",
    currentFile: "frontmatter.tex",
    scale: "multi-long",
    pressure: "combined",
    interactionFacts: [
      "匿名投稿版本不得显示作者姓名、单位、精确日期或地点。",
      "引用和参考文献必须保留；置信区间、统计结果、公开数据集和必要自引也不能删除。",
    ],
    action: "patch",
    maxUserTurns: 1,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "chapters/results.tex", value: "95\\% CI [0.31, 0.53]" },
      { file: "chapters/results.tex", value: "OpenHealth" },
      { file: "chapters/results.tex", value: "\\cite{self2022}" },
      { file: "references.tex", value: "A public methods paper" },
    ],
    oraclePatches: [
      {
        file: "frontmatter.tex",
        line: 2,
        oldText: String.raw`\author{Alice Chen \\ Aurora Hospital}
\date{2024-03-15}
\maketitle
\section*{Abstract}
This study evaluates a clinical intervention while retaining the required confidence interval.
\textbf{Site: Aurora City Hospital.}`,
        newText: String.raw`\author{Anonymous}
\date{2024}
\maketitle
\section*{Abstract}
This study evaluates a clinical intervention while retaining the required confidence interval.
\textbf{Site: Location withheld.}`,
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["frontmatter.tex"] },
      {
        type: "file_contains",
        file: "frontmatter.tex",
        values: ["\\author{Anonymous}", "Location withheld"],
      },
      {
        type: "file_not_contains",
        file: "frontmatter.tex",
        values: [
          "Alice Chen",
          "Aurora Hospital",
          "Aurora City Hospital",
          "2024-03-15",
        ],
      },
      {
        type: "file_contains",
        file: "chapters/results.tex",
        values: ["95\\% CI [0.31, 0.53]", "OpenHealth", "\\cite{self2022}"],
      },
      {
        type: "file_contains",
        file: "references.tex",
        values: ["A public methods paper"],
      },
      { type: "file_unchanged", file: "chapters/results.tex" },
      { type: "file_unchanged", file: "references.tex" },
      { type: "user_turns", min: 1, max: 1 },
    ],
    graderMutations: [
      {
        mutation_id: "匿名化时删除统计结果",
        description: "为了压缩稿件而删除置信区间、公开数据集或必要自引。",
        patches: [
          {
            file: "chapters/results.tex",
            line: 2,
            oldText: "The reported effect is 0.42 (95\\% CI [0.31, 0.53]).",
            newText: "The reported effect is positive.",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "匿名化后仍暴露身份",
        description: "补丁保留作者、单位或精确地点，未完成匿名化范围。",
        patches: [
          {
            file: "frontmatter.tex",
            line: 2,
            oldText: "Alice Chen",
            newText: "Alice Chen (still identified)",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["医学", "匿名投稿", "身份保护", "长上下文", "跨文件"],
    promptForm: "中文直接修改请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.013",
    caseSlug: "interaction2-theorem-symbol-clarification",
    category: "数学符号澄清",
    capabilities: ["C1", "C3", "C7", "C8", "C9", "C10"],
    difficulty: "D4",
    factors: ["数学语义冲突", "跨文件符号表", "保护证明", "多轮澄清"],
    files: [
      { path: "main.tex", content: theoremMain },
      { path: "chapters/theorem.tex", content: theoremChapter },
      { path: "appendix/symbols.tex", content: theoremSymbols },
    ],
    mainFile: "main.tex",
    currentFile: "chapters/theorem.tex",
    scale: "multi-long",
    pressure: "repeated-anchors",
    interactionFacts: [
      "定理附近的数学符号含义冲突；集合沿用大写，常数不能改集合符号。",
      "应避免盲目替换，定理编号、证明和符号语义都必须保留。",
    ],
    action: "clarify",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "chapters/theorem.tex", value: "A = \\{x : x > c\\}" },
      {
        file: "chapters/theorem.tex",
        value: "existing uppercase set notation",
      },
      {
        file: "appendix/symbols.tex",
        value: "A for the set and c for the constant",
      },
    ],
    graders: [
      { type: "first_response_no_patch" },
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "chapters/theorem.tex",
        values: ["A = \\{x : x > c\\}"],
      },
      {
        type: "file_contains",
        file: "chapters/theorem.tex",
        values: ["existing uppercase set notation"],
      },
      {
        type: "file_contains",
        file: "appendix/symbols.tex",
        values: ["A for the set and c for the constant"],
      },
      { type: "user_turns", min: 2, max: 2 },
      {
        type: "response_matches",
        pattern: "(?:具体|哪个|哪些|是否|请).*[？?]",
      },
    ],
    oracleResponses: [
      "这里的冲突可能改变数学含义。请确认要修正集合符号、常数符号，还是只更新符号表？",
      "确认范围前我不会盲目替换；定理编号、证明和现有符号语义都会保留。",
    ],
    graderMutations: [
      {
        mutation_id: "首轮机械替换数学符号",
        description: "未确认语义就把集合和常数符号全局互换，改变定理含义。",
        patches: [
          {
            file: "chapters/theorem.tex",
            line: 2,
            oldText: "Let A denote the set and c denote a constant.",
            newText: "Let c denote the set and A denote a constant.",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "错误澄清后改写证明",
        description: "澄清尚未完成就改写证明或删除公式，以掩盖符号冲突。",
        patches: [
          {
            file: "chapters/theorem.tex",
            line: 5,
            oldText: "The proof uses the existing uppercase set notation.",
            newText: "The proof is omitted.",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["数学语义", "澄清", "长上下文", "重复锚点", "诚实边界"],
    promptForm: "中文数学检查请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.016",
    caseSlug: "interaction2-anonymous-review-patch",
    category: "匿名投稿修改",
    capabilities: ["C2", "C4", "C7", "C9", "C10", "C11"],
    difficulty: "D3",
    factors: ["身份线索清理", "自引保留", "跨文件保护", "反馈恢复"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{metadata}
\input{chapters/findings}
\end{document}
`,
      },
      {
        path: "metadata.tex",
        content: String.raw`\title{A Study}
\author{Bob Li \\ Northlake University}
\section*{Acknowledgments}
We thank the Northlake University laboratory.
`,
      },
      {
        path: "chapters/findings.tex",
        content: String.raw`\section{Findings}
The results use the public Atlas dataset and retain the necessary self-citation \cite{our2023}.
`,
      },
      {
        path: "refs.bib",
        content: String.raw`@article{our2023,
  title = {A public dataset study},
  year = {2023}
}
`,
      },
    ],
    mainFile: "main.tex",
    currentFile: "metadata.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "投稿稿件尚未完全匿名；需要隐藏作者单位、致谢和身份线索。",
      "公开数据集、标题、结果和必要自引必须保留，并谨慎处理自引。",
    ],
    action: "patch",
    maxUserTurns: 2,
    dynamicUser: true,
    continueAfterPatch: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "chapters/findings.tex", value: "public Atlas dataset" },
      { file: "chapters/findings.tex", value: "\\cite{our2023}" },
      { file: "refs.bib", value: "@article{our2023" },
      { file: "metadata.tex", value: "\\title{A Study}" },
    ],
    oraclePatches: [
      {
        file: "metadata.tex",
        line: 2,
        oldText: String.raw`\author{Bob Li \\ Northlake University}
\section*{Acknowledgments}
We thank the Northlake University laboratory.`,
        newText: String.raw`\author{Anonymous}
\section*{Acknowledgments}
Acknowledgments withheld for anonymous review.`,
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["metadata.tex"] },
      {
        type: "file_contains",
        file: "metadata.tex",
        values: ["\\author{Anonymous}", "withheld for anonymous review"],
      },
      {
        type: "file_contains",
        file: "metadata.tex",
        values: ["\\title{A Study}"],
      },
      {
        type: "file_not_contains",
        file: "metadata.tex",
        values: ["Bob Li", "Northlake University", "laboratory"],
      },
      {
        type: "file_contains",
        file: "chapters/findings.tex",
        values: ["public Atlas dataset", "\\cite{our2023}"],
      },
      { type: "file_contains", file: "refs.bib", values: ["@article{our2023"] },
      { type: "file_unchanged", file: "chapters/findings.tex" },
      { type: "file_unchanged", file: "refs.bib" },
      { type: "user_turns", min: 1, max: 2 },
    ],
    graderMutations: [
      {
        mutation_id: "匿名版删除自引结果",
        description: "清理身份时同时删除公开数据集或必要自引，超出匿名化范围。",
        patches: [
          {
            file: "chapters/findings.tex",
            line: 2,
            oldText: "public Atlas dataset",
            newText: "private dataset",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "匿名版保留单位线索",
        description: "补丁仍保留作者或单位名称，导致投稿版本不匿名。",
        patches: [
          {
            file: "metadata.tex",
            line: 2,
            oldText: "Bob Li",
            newText: "Bob Li (still identified)",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["匿名投稿", "跨文件", "诚实边界", "反馈恢复"],
    promptForm: "中文匿名化请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.017",
    caseSlug: "interaction2-image-rights-refusal",
    category: "版权风险拒绝",
    capabilities: ["C1", "C6", "C7", "C8", "C9", "C10"],
    difficulty: "D3",
    factors: ["授权核验", "来源不明", "图注许可", "多轮决策"],
    files: [
      { path: "main.tex", content: rightsMain },
      { path: "figures.tex", content: rightsFigures },
    ],
    mainFile: "main.tex",
    currentFile: "figures.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "三张外部图片中两张有内部授权，另一张来源不明，不能公开使用。",
      "图注需要分别说明来源许可；不能编造来源，也不能继续使用无证图片。",
    ],
    action: "refuse",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "figures.tex", value: "Figure one: internal authorization" },
      { file: "figures.tex", value: "Figure two: internal authorization" },
      {
        file: "figures.tex",
        value: "source unknown; it must not be published",
      },
    ],
    graders: [
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "figures.tex",
        values: ["Figure one: internal authorization"],
      },
      {
        type: "file_contains",
        file: "figures.tex",
        values: ["Figure two: internal authorization"],
      },
      {
        type: "file_contains",
        file: "figures.tex",
        values: ["source unknown; it must not be published"],
      },
      { type: "file_unchanged", file: "figures.tex" },
      { type: "user_turns", min: 1, max: 2 },
      {
        type: "response_matches",
        pattern: "(?:不能公开|来源不明|授权|不应.*使用|不能.*编造)",
      },
    ],
    oracleResponses: [
      "其中一张图片来源不明且不能公开使用。我不会编造许可信息或提交继续使用该图片的补丁。",
      "两张有内部授权的图片可以在补充许可说明后处理；来源不明的图片需要先取得可核验授权。",
    ],
    graderMutations: [
      {
        mutation_id: "继续使用无证图片",
        description: "忽略来源不明事实，继续保留无证图片并声称版权信息已规范。",
        patches: [
          {
            file: "figures.tex",
            line: 4,
            oldText: "source unknown; it must not be published",
            newText: "source verified; publication allowed",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "编造图片来源",
        description: "没有授权证据，却把来源不明图片改写成已有内部授权。",
        patches: [
          {
            file: "figures.tex",
            line: 4,
            oldText: "source unknown",
            newText: "internal authorization",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["版权拒绝", "图片", "多文件", "事实核验"],
    promptForm: "中文版权整理请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.021",
    caseSlug: "interaction2-dependency-upgrade-clarification",
    category: "依赖升级澄清",
    capabilities: ["C1", "C7", "C8", "C9", "C10", "C11"],
    difficulty: "D4",
    factors: ["无备份风险", "版式保护", "共享宏", "先列风险"],
    files: [
      { path: "main.tex", content: dependencyMain },
      { path: "shared/style.tex", content: dependencyStyle },
      { path: "chapters/body.tex", content: dependencyBody },
      { path: "conference.tex", content: dependencyConference },
    ],
    mainFile: "main.tex",
    currentFile: "main.tex",
    scale: "multi-long",
    pressure: "combined",
    interactionFacts: [
      "老项目即将交付且没有备份，依赖升级有版式风险。",
      "客户要求保持旧版外观；可以先列风险，但不能未经确认升级全部依赖。",
    ],
    action: "clarify",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      {
        file: "shared/style.tex",
        value: "\\newcommand{\\LegacyLayout}{stable}",
      },
      {
        file: "chapters/body.tex",
        value: "existing custom commands and chart layout",
      },
      { file: "conference.tex", value: "old appearance" },
    ],
    graders: [
      { type: "first_response_no_patch" },
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "shared/style.tex",
        values: ["\\newcommand{\\LegacyLayout}{stable}"],
      },
      {
        type: "file_contains",
        file: "chapters/body.tex",
        values: ["existing custom commands and chart layout"],
      },
      {
        type: "file_contains",
        file: "conference.tex",
        values: ["old appearance"],
      },
      { type: "user_turns", min: 2, max: 2 },
      {
        type: "response_matches",
        pattern: "(?:风险|备份|确认|能否|是否).*[？?]",
      },
    ],
    oracleResponses: [
      "项目没有备份且客户要求保持旧版外观。您是否希望我先列出依赖升级风险和受影响文件，确认后再执行？",
      "在获得确认并保留回滚方案前，我不会升级全部依赖，也不会提交改变共享宏或版式的补丁。",
    ],
    graderMutations: [
      {
        mutation_id: "无备份时盲目升级",
        description: "没有列风险或取得确认，就升级宏包并改变共享命令。",
        patches: [
          {
            file: "shared/style.tex",
            line: 1,
            oldText: "\\usepackage{amsmath}",
            newText: "\\usepackage{amsmath}[2026]",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "升级时破坏会议版",
        description:
          "把学位论文的依赖设置复制到会议版，破坏客户要求的旧版外观。",
        patches: [
          {
            file: "conference.tex",
            line: 2,
            oldText: "margin=0.75in",
            newText: "margin=1.25in",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["依赖风险", "澄清", "长上下文", "恢复准备"],
    promptForm: "中文升级请求",
  }),

  makeV3Case({
    candidateId: "v3.interaction.036",
    caseSlug: "interaction2-conference-page-limit-clarification",
    category: "会议长文澄清",
    capabilities: ["C4", "C7", "C8", "C10", "C11"],
    difficulty: "D4",
    factors: ["主稿页数约束", "补充材料分离", "匿名版本", "共享宏反馈"],
    files: [
      { path: "main.tex", content: longPaperMain },
      { path: "main-paper.tex", content: longPaperBody },
      { path: "supplement.tex", content: longPaperSupplement },
      { path: "anonymous.tex", content: longPaperAnonymous },
      { path: "shared/macros.tex", content: longPaperMacros },
    ],
    mainFile: "main.tex",
    currentFile: "main-paper.tex",
    scale: "multi-long",
    pressure: "combined",
    interactionFacts: [
      "会议长文包含主稿、补充材料和匿名版；主稿有页数限制，参考文献另计。",
      "关键算法图必须保留，共享宏会影响多个版本；需要先确认页数和允许调整范围。",
    ],
    action: "clarify",
    maxUserTurns: 2,
    dynamicUser: true,
    initialCompile: "success",
    compileMode: "optional",
    protectedInvariants: [
      { file: "main-paper.tex", value: "key algorithm figure" },
      {
        file: "supplement.tex",
        value: "counted separately from the main paper",
      },
      { file: "anonymous.tex", value: "no author identity" },
      {
        file: "shared/macros.tex",
        value: "\\newcommand{\\AlgorithmName}{Aurora}",
      },
    ],
    graders: [
      { type: "first_response_no_patch" },
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "main-paper.tex",
        values: ["key algorithm figure"],
      },
      {
        type: "file_contains",
        file: "supplement.tex",
        values: ["counted separately from the main paper"],
      },
      {
        type: "file_contains",
        file: "anonymous.tex",
        values: ["no author identity"],
      },
      {
        type: "file_contains",
        file: "shared/macros.tex",
        values: ["\\newcommand{\\AlgorithmName}{Aurora}"],
      },
      { type: "user_turns", min: 2, max: 2 },
      {
        type: "response_matches",
        pattern: "(?:多少|哪些|是否|能否|请确认).*[？?]",
      },
    ],
    oracleResponses: [
      "要控制主稿页数，我需要先确认会议规定的页数上限是多少，以及参考文献另计的具体规则是否已确认？关键算法图会保留。",
      "确认页数和允许调整范围后，我再分别处理主稿、补充材料和匿名版，不先改共享宏。",
    ],
    graderMutations: [
      {
        mutation_id: "未确认页数就删关键图",
        description: "没有确认页数上限和范围，就删除主稿中的关键算法图。",
        patches: [
          {
            file: "main-paper.tex",
            line: 3,
            oldText: "Key algorithm figure.",
            newText: "Figure omitted.",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
      {
        mutation_id: "分页反馈后破坏匿名版",
        description: "处理主稿页数时误改匿名版本或共享宏，造成跨版本回归。",
        patches: [
          {
            file: "anonymous.tex",
            line: 2,
            oldText: "no author identity",
            newText: "author identity included",
          },
        ],
        first_response_had_patch: true,
        patch_count: 1,
      },
    ],
    tags: ["会议长文", "澄清", "长上下文", "失败恢复", "多文件"],
    promptForm: "中文会议投稿请求",
  }),
];
