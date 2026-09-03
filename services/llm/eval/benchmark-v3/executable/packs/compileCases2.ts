import { makeV3Case } from "../caseFactory.js";
import type { V3ExecutableCase, V3GraderMutation } from "../types.js";

const compileSuccess = {
  type: "compile" as const,
  status: "success" as const,
  max_errors: 0,
};

type MutationPatches = NonNullable<V3GraderMutation["patches"]>;

function rejectedMutation(
  mutationId: string,
  description: string,
  patches: MutationPatches,
  compileStatus: "failure" | "success" = "failure",
): V3GraderMutation {
  return {
    mutation_id: mutationId,
    description,
    patches,
    patch_count: patches.length,
    patch_rejection_count: 0,
    responses: ["该变体不能作为根因修复。"],
    compile: {
      status: compileStatus,
      errorCount: compileStatus === "success" ? 0 : 1,
      warningCount: 0,
    },
  };
}

export const V3_COMPILE_CASES_2: V3ExecutableCase[] = [
  makeV3Case({
    candidateId: "v3.compile.003",
    caseSlug: "compile-proof-closure-recovery",
    category: "跨文件环境修复",
    capabilities: ["C1", "C4", "C5", "C11"],
    difficulty: "D3",
    factors: ["章节环境未闭合", "错误结束命令", "动态定位"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\input{settings}
\begin{document}
\input{chapters/ch3}
\end{document}
`,
      },
      {
        path: "settings.tex",
        content: String.raw`\newtheorem{lemma}{Lemma}
\newenvironment{proof}{\par\noindent Proof: }{\hfill$\diamond$\par}
`,
      },
      {
        path: "chapters/ch3.tex",
        content: String.raw`\section{Third chapter}
\begin{lemma}
Every finite graph has a spanning forest.
\end{lemma}
\begin{proof}
Repeatedly add an edge that joins two components.
\end{lemma}
`,
      },
    ],
    currentFile: "chapters/ch3.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "编译错误来自第三章文件中的证明结束命令；设置文件中的定理定义和证明内容必须保留。",
      "如果首轮回复只定位到主文件，用户会确认应继续检查 chapters/ch3.tex。",
    ],
    action: "patch",
    maxUserTurns: 2,
    dynamicUser: true,
    continueAfterPatch: true,
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{chapters/ch3}" },
      { file: "settings.tex", value: "\\newtheorem{lemma}{Lemma}" },
      {
        file: "chapters/ch3.tex",
        value: "Every finite graph has a spanning forest.",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["chapters/ch3.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{chapters/ch3}"],
      },
      {
        type: "file_contains",
        file: "settings.tex",
        values: ["\\newtheorem{lemma}{Lemma}"],
      },
      {
        type: "file_contains",
        file: "chapters/ch3.tex",
        values: ["Every finite graph has a spanning forest."],
      },
      {
        type: "file_contains",
        file: "chapters/ch3.tex",
        values: ["\\end{proof}"],
      },
      { type: "file_unchanged", file: "main.tex" },
      { type: "file_unchanged", file: "settings.tex" },
      { type: "user_turns", min: 1, max: 2 },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "chapters/ch3.tex",
        line: 8,
        oldText: String.raw`\end{lemma}`,
        newText: String.raw`\end{proof}`,
      },
    ],
    oracleResponses: [
      "请继续检查 chapters/ch3.tex 中的环境闭合。",
      "已修正第三章证明环境的结束命令并完成编译验证。",
    ],
    graderMutations: [
      rejectedMutation(
        "证明闭合-错误结束环境",
        "把证明结束命令改成了不存在的环境名称，未修复环境闭合。",
        [
          {
            file: "chapters/ch3.tex",
            line: 8,
            oldText: String.raw`\end{lemma}`,
            newText: String.raw`\end{proofx}`,
          },
        ],
      ),
      rejectedMutation(
        "证明闭合-改动定理内容",
        "修改了受保护的定理陈述而没有修复证明结束命令。",
        [
          {
            file: "chapters/ch3.tex",
            line: 4,
            oldText: "Every finite graph has a spanning forest.",
            newText: "Every finite graph has a spanning tree.",
          },
        ],
      ),
    ],
    tags: ["跨文件", "环境闭合", "动态修复"],
    promptForm: "中文动态故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.004",
    caseSlug: "compile-nested-block-recovery",
    category: "幻灯片环境修复",
    capabilities: ["C1", "C4", "C5", "C11"],
    difficulty: "D3",
    factors: ["嵌套环境顺序", "跨文件页面定位", "保留主题内容"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\input{theme}
\begin{document}
\input{slides/page-seven}
\end{document}
`,
      },
      {
        path: "theme.tex",
        content: String.raw`\newenvironment{slideblock}{\par\noindent\begin{minipage}{0.9\linewidth}}{\end{minipage}\par}
`,
      },
      {
        path: "slides/page-seven.tex",
        content: String.raw`\section{Evaluation}
\begin{slideblock}
\begin{itemize}
\item Accuracy remains 91 percent.
\item Latency remains 12 ms.
\end{slideblock}
\end{itemize}
`,
      },
    ],
    currentFile: "slides/page-seven.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "第七页同时包含 slideblock 和 itemize，当前错误是结束顺序颠倒；主题、颜色语义和两项数据必须保留。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{slides/page-seven}" },
      { file: "theme.tex", value: "\\newenvironment{slideblock}" },
      { file: "slides/page-seven.tex", value: "Accuracy remains 91 percent." },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["slides/page-seven.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{slides/page-seven}"],
      },
      {
        type: "file_contains",
        file: "theme.tex",
        values: ["\\newenvironment{slideblock}"],
      },
      {
        type: "file_contains",
        file: "slides/page-seven.tex",
        values: ["Accuracy remains 91 percent.", "Latency remains 12 ms."],
      },
      {
        type: "file_contains",
        file: "slides/page-seven.tex",
        values: ["\\end{itemize}\n\\end{slideblock}"],
      },
      {
        type: "file_not_contains",
        file: "slides/page-seven.tex",
        values: ["\\end{slideblock}\n\\end{itemize}"],
      },
      { type: "file_unchanged", file: "main.tex" },
      { type: "file_unchanged", file: "theme.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "slides/page-seven.tex",
        line: 5,
        oldText: String.raw`\end{slideblock}
\end{itemize}`,
        newText: String.raw`\end{itemize}
\end{slideblock}`,
      },
    ],
    oracleResponse:
      "已按嵌套顺序闭合第七页的列表和内容块，保留主题数据并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "嵌套环境-只交换一端",
        "只交换了一个结束命令，另一个环境仍然嵌套错误。",
        [
          {
            file: "slides/page-seven.tex",
            line: 5,
            oldText: String.raw`\end{slideblock}`,
            newText: String.raw`\end{itemize}`,
          },
        ],
      ),
      rejectedMutation(
        "嵌套环境-删除数据项",
        "通过删除一项实验数据回避环境错误，破坏了受保护内容。",
        [
          {
            file: "slides/page-seven.tex",
            line: 4,
            oldText: "Accuracy remains 91 percent.",
            newText: "Accuracy remains 90 percent.",
          },
        ],
        "success",
      ),
    ],
    tags: ["幻灯片", "嵌套环境", "编译"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.019",
    caseSlug: "compile-glossary-bibliography-recovery",
    category: "术语与文献编译修复",
    capabilities: ["C1", "C4", "C5", "C6", "C7", "C11"],
    difficulty: "D4",
    factors: ["多错误编译", "术语表入口", "附录文献入口", "跨文件依赖"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{makeidx}
\makeindex
\begin{document}
\input{chapters/whitepaper}
\printglossary
\printbibliography
\printindex
\end{document}
`,
      },
      {
        path: "chapters/whitepaper.tex",
        content: String.raw`\section{System}
The system uses the Aurora protocol~\cite{aurora2025}.
\index{Aurora protocol}
`,
      },
      {
        path: "glossary.tex",
        content: String.raw`\section*{Glossary}
Aurora protocol: a reproducible exchange format.
`,
      },
      {
        path: "references.tex",
        content: String.raw`\begin{thebibliography}{9}
\bibitem{aurora2025} Aurora Team. Protocol report. 2025.
\end{thebibliography}
`,
      },
    ],
    currentFile: "main.tex",
    scale: "multi-long",
    pressure: "combined",
    interactionFacts: [
      "主文件同时缺少术语表和文献入口；索引命令、白皮书章节、引用键和现有条目都必须保留。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{chapters/whitepaper}" },
      { file: "chapters/whitepaper.tex", value: "\\cite{aurora2025}" },
      {
        file: "glossary.tex",
        value: "Aurora protocol: a reproducible exchange format.",
      },
      { file: "references.tex", value: "\\bibitem{aurora2025}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["main.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{chapters/whitepaper}"],
      },
      {
        type: "file_contains",
        file: "chapters/whitepaper.tex",
        values: ["\\cite{aurora2025}"],
      },
      {
        type: "file_contains",
        file: "glossary.tex",
        values: ["Aurora protocol: a reproducible exchange format."],
      },
      {
        type: "file_contains",
        file: "references.tex",
        values: ["\\bibitem{aurora2025}"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{glossary}", "\\input{references}", "\\printindex"],
      },
      {
        type: "file_not_contains",
        file: "main.tex",
        values: ["\\printglossary", "\\printbibliography"],
      },
      { type: "file_unchanged", file: "chapters/whitepaper.tex" },
      { type: "file_unchanged", file: "glossary.tex" },
      { type: "file_unchanged", file: "references.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 6,
        oldText: String.raw`\printglossary`,
        newText: String.raw`\input{glossary}`,
      },
      {
        file: "main.tex",
        line: 7,
        oldText: String.raw`\printbibliography`,
        newText: String.raw`\input{references}`,
      },
    ],
    oracleResponse:
      "已接入现有术语表和参考文献文件，保留章节、索引及引用后完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "多错误入口-遗漏文献",
        "只接入术语表，未处理文献入口，仍有未定义命令。",
        [
          {
            file: "main.tex",
            line: 6,
            oldText: String.raw`\printglossary`,
            newText: String.raw`\input{glossary}`,
          },
        ],
      ),
      rejectedMutation(
        "多错误入口-删除索引",
        "通过删除索引命令规避辅助步骤，破坏了受保护的索引结构。",
        [
          {
            file: "main.tex",
            line: 6,
            oldText: String.raw`\printglossary`,
            newText: String.raw`\input{glossary}`,
          },
          {
            file: "main.tex",
            line: 8,
            oldText: String.raw`\printindex`,
            newText: String.raw`\relax`,
          },
        ],
        "success",
      ),
    ],
    tags: ["术语表", "文献", "多错误", "跨文件"],
    promptForm: "中文综合故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.024",
    caseSlug: "compile-wide-table-column-recovery",
    category: "表格编译修复",
    capabilities: ["C1", "C4", "C5", "C6", "C11"],
    difficulty: "D3",
    factors: ["列数不一致", "跨文件表格", "保留备注列"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{tables/market}
\end{document}
`,
      },
      {
        path: "tables/market.tex",
        content: String.raw`\section{Market data}
\begin{tabular}{ll}
\multicolumn{3}{l}{Dataset} \\
Name & Score & Note \\
Atlas & 91.2 & Stable \\
\end{tabular}
`,
      },
    ],
    currentFile: "tables/market.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "第三列备注是新增数据，表头的跨列单元格和小数数据都必须保留，不能删列或改成图片。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{tables/market}" },
      { file: "tables/market.tex", value: "\\multicolumn{3}{l}{Dataset}" },
      { file: "tables/market.tex", value: "Atlas & 91.2 & Stable" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["tables/market.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{tables/market}"],
      },
      {
        type: "file_contains",
        file: "tables/market.tex",
        values: ["\\multicolumn{3}{l}{Dataset}"],
      },
      {
        type: "file_contains",
        file: "tables/market.tex",
        values: ["Atlas & 91.2 & Stable"],
      },
      {
        type: "file_contains",
        file: "tables/market.tex",
        values: ["\\begin{tabular}{lll}"],
      },
      {
        type: "file_not_contains",
        file: "tables/market.tex",
        values: ["\\begin{tabular}{ll}"],
      },
      { type: "file_unchanged", file: "main.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "tables/market.tex",
        line: 2,
        oldText: String.raw`\begin{tabular}{ll}`,
        newText: String.raw`\begin{tabular}{lll}`,
      },
    ],
    oracleResponse:
      "已将市场表格列定义与三列数据及跨列表头对齐，保留备注列并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "表格列数-错误列定义",
        "改成了四列而不是与现有三列数据一致的列定义。",
        [
          {
            file: "tables/market.tex",
            line: 2,
            oldText: String.raw`\begin{tabular}{ll}`,
            newText: String.raw`\begin{tabular}{llll}`,
          },
        ],
        "success",
      ),
      rejectedMutation(
        "表格列数-修改数据",
        "删除备注列中的数据来回避列数错误，破坏了受保护数据。",
        [
          {
            file: "tables/market.tex",
            line: 5,
            oldText: "Atlas & 91.2 & Stable",
            newText: "Atlas & 91.2",
          },
        ],
      ),
    ],
    tags: ["表格", "列数", "数据保护"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.031",
    caseSlug: "compile-score-counter-collision",
    category: "谱例编号修复",
    capabilities: ["C1", "C4", "C5", "C6", "C11"],
    difficulty: "D3",
    factors: ["自定义计数器冲突", "附件独立编号", "跨文件标签"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{scores/main-score}
\appendix
\input{scores/annex-score}
\end{document}
`,
      },
      {
        path: "scores/main-score.tex",
        content: String.raw`\section{Main score}
\newcounter{scorefigure}
\refstepcounter{scorefigure}\label{fig:main-score}
\begin{center}Main score example\end{center}
`,
      },
      {
        path: "scores/annex-score.tex",
        content: String.raw`\section{Annex score}
\newcounter{scorefigure}
\refstepcounter{scorefigure}\label{fig:main-score}
\begin{center}Annex score example\end{center}
`,
      },
    ],
    currentFile: "scores/annex-score.tex",
    scale: "multi-small",
    pressure: "repeated-anchors",
    interactionFacts: [
      "主谱例和附件谱例分别位于两个文件；附件需要独立计数器和标签，两个谱例的内容与图题必须保留。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{scores/main-score}" },
      { file: "scores/main-score.tex", value: "Main score example" },
      { file: "scores/annex-score.tex", value: "Annex score example" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["scores/annex-score.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{scores/main-score}"],
      },
      {
        type: "file_contains",
        file: "scores/main-score.tex",
        values: ["Main score example"],
      },
      {
        type: "file_contains",
        file: "scores/annex-score.tex",
        values: ["Annex score example"],
      },
      {
        type: "file_contains",
        file: "scores/annex-score.tex",
        values: [
          "\\newcounter{annexscorefigure}",
          "\\refstepcounter{annexscorefigure}",
          "\\label{fig:annex-score}",
        ],
      },
      {
        type: "file_not_contains",
        file: "scores/annex-score.tex",
        values: [
          "\\newcounter{scorefigure}",
          "\\refstepcounter{scorefigure}",
          "\\label{fig:main-score}",
        ],
      },
      { type: "file_unchanged", file: "main.tex" },
      { type: "file_unchanged", file: "scores/main-score.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "scores/annex-score.tex",
        line: 2,
        oldText: String.raw`\newcounter{scorefigure}`,
        newText: String.raw`\newcounter{annexscorefigure}`,
      },
      {
        file: "scores/annex-score.tex",
        line: 3,
        oldText: String.raw`\refstepcounter{scorefigure}`,
        newText: String.raw`\refstepcounter{annexscorefigure}`,
      },
      {
        file: "scores/annex-score.tex",
        line: 3,
        oldText: String.raw`\label{fig:main-score}`,
        newText: String.raw`\label{fig:annex-score}`,
      },
    ],
    oracleResponse:
      "已为附件谱例拆分计数器和标签，保留主谱例及附件内容并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "谱例计数器-只改计数器",
        "只改了附件计数器，标签仍与主谱例冲突。",
        [
          {
            file: "scores/annex-score.tex",
            line: 2,
            oldText: String.raw`\newcounter{scorefigure}`,
            newText: String.raw`\newcounter{annexscorefigure}`,
          },
        ],
        "success",
      ),
      rejectedMutation(
        "谱例计数器-修改主谱例",
        "修改主谱例内容来回避附件冲突，破坏了受保护文件。",
        [
          {
            file: "scores/main-score.tex",
            line: 4,
            oldText: "Main score example",
            newText: "Annex score example",
          },
        ],
        "success",
      ),
    ],
    tags: ["谱例", "计数器", "标签"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.034",
    caseSlug: "compile-lesson-list-recovery",
    category: "讲义列表修复",
    capabilities: ["C1", "C4", "C5", "C11"],
    difficulty: "D3",
    factors: ["嵌套列表闭合", "答案文件共享编号", "动态范围纠正"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\newtheorem{lessonlemma}{Lemma}
\begin{document}
\input{lessons/seven}
\input{answers/seven}
\end{document}
`,
      },
      {
        path: "lessons/seven.tex",
        content: String.raw`\section{Lesson seven}
\begin{enumerate}
\item First method.
\begin{enumerate}
\item Nested method.
\end{itemize}
\end{enumerate}
\begin{lessonlemma}
The shared counter remains stable.
\end{lessonlemma}
`,
      },
      {
        path: "answers/seven.tex",
        content: String.raw`\section{Answers}
The answer keeps the original lesson numbering.
`,
      },
    ],
    currentFile: "lessons/seven.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "第七课的列表嵌套顺序错误，答案文件共享讲义编号；修复列表时不能删除定理或重排答案。",
      "如果首轮只修了列表，用户会要求再次确认答案文件仍保持原编号意图。",
    ],
    action: "patch",
    maxUserTurns: 2,
    dynamicUser: true,
    continueAfterPatch: true,
    initialCompile: "failure",
    compileMode: "repair-loop",
    semanticGrading: {
      type: "content_semantics",
      files: ["lessons/seven.tex", "answers/seven.tex", "main.tex"],
      criteria: [
        {
          id: "list_error_repaired",
          description: "修复第七课嵌套列表环境不匹配导致的编译错误。",
        },
        {
          id: "numbering_preserved",
          description: "保持原有定理编号语义，不因列表修复改变后续编号。",
        },
      ],
    },
    protectedInvariants: [
      { file: "main.tex", value: "\\input{lessons/seven}" },
      {
        file: "lessons/seven.tex",
        value: "The shared counter remains stable.",
      },
      {
        file: "answers/seven.tex",
        value: "The answer keeps the original lesson numbering.",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["lessons/seven.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{lessons/seven}"],
      },
      {
        type: "file_contains",
        file: "lessons/seven.tex",
        values: ["The shared counter remains stable."],
      },
      {
        type: "file_contains",
        file: "answers/seven.tex",
        values: ["The answer keeps the original lesson numbering."],
      },
      {
        type: "file_contains",
        file: "lessons/seven.tex",
        values: ["\\end{enumerate}\n\\end{enumerate}"],
      },
      {
        type: "file_not_contains",
        file: "lessons/seven.tex",
        values: ["\\end{itemize}"],
      },
      { type: "file_unchanged", file: "main.tex" },
      { type: "file_unchanged", file: "answers/seven.tex" },
      { type: "user_turns", min: 1, max: 2 },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "lessons/seven.tex",
        line: 6,
        oldText: String.raw`\end{itemize}`,
        newText: String.raw`\end{enumerate}`,
      },
    ],
    oracleResponses: [
      "列表错误位于 lessons/seven.tex；请继续保持答案文件不变。",
      "已修正第七课的嵌套列表闭合并完成编译验证。",
    ],
    graderMutations: [
      rejectedMutation(
        "讲义列表-错误列表类型",
        "把错误结束命令改成了另一种列表，嵌套结构仍然不匹配。",
        [
          {
            file: "lessons/seven.tex",
            line: 6,
            oldText: String.raw`\end{itemize}`,
            newText: String.raw`\end{description}`,
          },
        ],
      ),
      rejectedMutation(
        "讲义列表-改动答案文件",
        "修改答案内容来回避列表错误，破坏了共享编号约束。",
        [
          {
            file: "answers/seven.tex",
            line: 2,
            oldText: "The answer keeps the original lesson numbering.",
            newText: "The answer uses a new lesson numbering.",
          },
        ],
        "success",
      ),
    ],
    tags: ["讲义", "列表", "动态纠正"],
    promptForm: "中文动态故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.010",
    caseSlug: "compile-subfigure-counter-recovery",
    category: "子图编号修复",
    capabilities: ["C1", "C4", "C5", "C6", "C11"],
    difficulty: "D4",
    factors: ["子图计数器冲突", "重复标签", "跨文件图结构"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{figures/experiment-a}
\input{figures/experiment-b}
\end{document}
`,
      },
      {
        path: "figures/experiment-a.tex",
        content: String.raw`\section{Experiment A}
\newcounter{panel}
\refstepcounter{panel}\label{fig:panel-a}
\begin{center}\fbox{Panel A}\end{center}
`,
      },
      {
        path: "figures/experiment-b.tex",
        content: String.raw`\section{Experiment B}
\newcounter{panel}
\refstepcounter{panel}\label{fig:panel-a}
\begin{center}\fbox{Panel B}\end{center}
`,
      },
    ],
    currentFile: "figures/experiment-b.tex",
    scale: "multi-small",
    pressure: "repeated-anchors",
    interactionFacts: [
      "实验 B 复制了实验 A 的子图定义；两个面板内容要保留，实验 B 需要独立计数器和标签。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{figures/experiment-a}" },
      { file: "figures/experiment-a.tex", value: "Panel A" },
      { file: "figures/experiment-b.tex", value: "Panel B" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["figures/experiment-b.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{figures/experiment-a}"],
      },
      {
        type: "file_contains",
        file: "figures/experiment-a.tex",
        values: ["Panel A"],
      },
      {
        type: "file_contains",
        file: "figures/experiment-b.tex",
        values: ["Panel B"],
      },
      {
        type: "file_contains",
        file: "figures/experiment-b.tex",
        values: [
          "\\newcounter{experimentbpanel}",
          "\\refstepcounter{experimentbpanel}",
          "\\label{fig:panel-b}",
        ],
      },
      {
        type: "file_not_contains",
        file: "figures/experiment-b.tex",
        values: [
          "\\newcounter{panel}",
          "\\refstepcounter{panel}",
          "\\label{fig:panel-a}",
        ],
      },
      { type: "file_unchanged", file: "main.tex" },
      { type: "file_unchanged", file: "figures/experiment-a.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "figures/experiment-b.tex",
        line: 2,
        oldText: String.raw`\newcounter{panel}`,
        newText: String.raw`\newcounter{experimentbpanel}`,
      },
      {
        file: "figures/experiment-b.tex",
        line: 3,
        oldText: String.raw`\refstepcounter{panel}`,
        newText: String.raw`\refstepcounter{experimentbpanel}`,
      },
      {
        file: "figures/experiment-b.tex",
        line: 3,
        oldText: String.raw`\label{fig:panel-a}`,
        newText: String.raw`\label{fig:panel-b}`,
      },
    ],
    oracleResponse:
      "已为实验 B 的子图建立独立计数器和标签，保留两组面板并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "子图编号-只改标签",
        "只修改标签而继续复用冲突的子图计数器。",
        [
          {
            file: "figures/experiment-b.tex",
            line: 3,
            oldText: String.raw`\label{fig:panel-a}`,
            newText: String.raw`\label{fig:panel-b}`,
          },
        ],
      ),
      rejectedMutation(
        "子图编号-删除实验 A",
        "删除实验 A 的输入来回避跨文件冲突，破坏了主文档结构。",
        [
          {
            file: "main.tex",
            line: 3,
            oldText: String.raw`\input{figures/experiment-a}`,
            newText: String.raw`\input{figures/experiment-b}`,
          },
        ],
        "success",
      ),
    ],
    tags: ["子图", "标签", "计数器"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.008",
    caseSlug: "compile-chapter-input-recovery",
    category: "章节引用恢复",
    capabilities: ["C1", "C4", "C5", "C11"],
    difficulty: "D3",
    factors: ["章节路径过期", "跨文件定位", "动态用户纠正"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\tableofcontents
\input{chapters/chapter3-old}
\end{document}
`,
      },
      {
        path: "chapters/chapter3.tex",
        content: String.raw`\section{Methods}
The inserted chapter keeps the intended order and title.
`,
      },
    ],
    currentFile: "main.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "主文件仍引用已废弃的 chapter3-old 路径，当前正式章节文件是 chapters/chapter3.tex；目录命令和章节标题必须保留。",
      "如果首轮只报告路径错误，用户会确认应使用正式的 chapter3 文件。",
    ],
    action: "patch",
    maxUserTurns: 2,
    dynamicUser: true,
    continueAfterPatch: true,
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "\\tableofcontents" },
      {
        file: "chapters/chapter3.tex",
        value: "The inserted chapter keeps the intended order and title.",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["main.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\tableofcontents"],
      },
      {
        type: "file_contains",
        file: "chapters/chapter3.tex",
        values: ["The inserted chapter keeps the intended order and title."],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{chapters/chapter3}"],
      },
      {
        type: "file_not_contains",
        file: "main.tex",
        values: ["\\input{chapters/chapter3-old}"],
      },
      { type: "file_unchanged", file: "chapters/chapter3.tex" },
      { type: "user_turns", min: 1, max: 2 },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 4,
        oldText: String.raw`\input{chapters/chapter3-old}`,
        newText: String.raw`\input{chapters/chapter3}`,
      },
    ],
    oracleResponses: [
      "正式章节文件是 chapters/chapter3.tex，我会保留目录和章节顺序。",
      "已恢复正式章节输入路径并完成编译验证。",
    ],
    graderMutations: [
      rejectedMutation(
        "章节路径-继续使用旧文件",
        "把输入路径改成了另一个不存在的旧文件，正式章节仍未接入。",
        [
          {
            file: "main.tex",
            line: 4,
            oldText: String.raw`\input{chapters/chapter3-old}`,
            newText: String.raw`\input{chapters/chapter3-draft}`,
          },
        ],
      ),
      rejectedMutation(
        "章节路径-改动章节内容",
        "修改章节正文来规避路径错误，破坏了章节内容保护。",
        [
          {
            file: "chapters/chapter3.tex",
            line: 2,
            oldText: "The inserted chapter keeps the intended order and title.",
            newText:
              "The inserted chapter changes the intended order and title.",
          },
        ],
        "success",
      ),
    ],
    tags: ["章节", "路径恢复", "动态纠正"],
    promptForm: "中文动态故障报告",
  }),
];
