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

export const V3_COMPILE_CASES: V3ExecutableCase[] = [
  makeV3Case({
    candidateId: "v3.compile.005",
    caseSlug: "compile-duplicate-environment",
    category: "编译修复",
    capabilities: ["C1", "C4", "C5"],
    difficulty: "D2",
    factors: ["跨文件定位", "重复环境定义", "保留代码样式"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\input{config}
\input{chapters/code}
\begin{document}
This is the technical manual.
\begin{codeblock}
for value in values:
    print(value)
\end{codeblock}
\end{document}
`,
      },
      {
        path: "config.tex",
        content: String.raw`\newenvironment{codeblock}{\par\ttfamily\small}{\par}
`,
      },
      {
        path: "chapters/code.tex",
        content: String.raw`% 本章为代码环境提供局部设置。
\newenvironment{codeblock}{\par\ttfamily\small}{\par}
`,
      },
    ],
    mainFile: "main.tex",
    currentFile: "chapters/code.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "重复定义位于主文件加载的设置文件和第二章文件，代码正文与行号样式必须保留。",
    ],
    action: "patch",
    maxUserTurns: 1,
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "This is the technical manual." },
      { file: "config.tex", value: "\\ttfamily\\small" },
      { file: "chapters/code.tex", value: "\\par\\ttfamily\\small" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["chapters/code.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["This is the technical manual."],
      },
      {
        type: "file_contains",
        file: "config.tex",
        values: ["\\ttfamily\\small"],
      },
      {
        type: "file_contains",
        file: "chapters/code.tex",
        values: ["\\par\\ttfamily\\small"],
      },
      {
        type: "file_contains",
        file: "chapters/code.tex",
        values: [
          "\\renewenvironment{codeblock}{\\par\\ttfamily\\small}{\\par}",
        ],
      },
      { type: "file_unchanged", file: "config.tex" },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["for value in values:", "print(value)"],
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "chapters/code.tex",
        line: 2,
        oldText: String.raw`\newenvironment{codeblock}{\par\ttfamily\small}{\par}`,
        newText: String.raw`\renewenvironment{codeblock}{\par\ttfamily\small}{\par}`,
      },
    ],
    oracleResponse:
      "已将第二章的重复代码环境改为兼容已有定义的重定义，并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "重复环境-错误环境名",
        "把重复定义改成了另一个环境名，原环境仍然没有得到兼容修复。",
        [
          {
            file: "chapters/code.tex",
            line: 2,
            oldText: String.raw`\newenvironment{codeblock}{\par\ttfamily\small}{\par}`,
            newText: String.raw`\renewenvironment{otherblock}{\par\ttfamily\small}{\par}`,
          },
        ],
      ),
      rejectedMutation(
        "重复环境-改动设置文件",
        "虽然局部文件看似可编译，但修改了受保护的全局代码样式文件。",
        [
          {
            file: "chapters/code.tex",
            line: 2,
            oldText: String.raw`\newenvironment{codeblock}{\par\ttfamily\small}{\par}`,
            newText: String.raw`\renewenvironment{codeblock}{\par\ttfamily\small}{\par}`,
          },
          {
            file: "config.tex",
            line: 1,
            oldText: String.raw`\newenvironment{codeblock}{\par\ttfamily\small}{\par}`,
            newText: String.raw`\renewenvironment{codeblock}{\par\ttfamily}{\par}`,
          },
        ],
        "success",
      ),
    ],
    tags: ["重复宏包环境", "跨文件", "编译"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.006",
    caseSlug: "compile-conditional-macro",
    category: "编译修复",
    capabilities: ["C1", "C4", "C5"],
    difficulty: "D2",
    factors: ["条件编译", "跨文件宏来源", "保持版式结构"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\input{settings}
\begin{document}
Course report body.
\input{appendix/notes}
\end{document}
`,
      },
      {
        path: "settings.tex",
        content: String.raw`\newif\ifshowappendix
\showappendixfalse
\ifshowappendix
  \newcommand{\appendixnote}{Appendix note}
\fi
`,
      },
      {
        path: "appendix/notes.tex",
        content: String.raw`\section*{Appendix notes}
\appendixnote{}
`,
      },
    ],
    currentFile: "settings.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "宏只在条件开关打开时定义，附录仍必须通过该条件结构调用宏，不能改成手工文字。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{appendix/notes}" },
      { file: "settings.tex", value: "\\ifshowappendix" },
      { file: "appendix/notes.tex", value: "\\appendixnote{}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["settings.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{appendix/notes}"],
      },
      {
        type: "file_contains",
        file: "settings.tex",
        values: ["\\ifshowappendix"],
      },
      {
        type: "file_contains",
        file: "appendix/notes.tex",
        values: ["\\appendixnote{}"],
      },
      {
        type: "file_contains",
        file: "settings.tex",
        values: ["\\showappendixtrue", "\\ifshowappendix", "\\appendixnote"],
      },
      {
        type: "file_not_contains",
        file: "settings.tex",
        values: ["\\showappendixfalse"],
      },
      { type: "file_unchanged", file: "main.tex" },
      { type: "file_unchanged", file: "appendix/notes.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "settings.tex",
        line: 2,
        oldText: String.raw`\showappendixfalse`,
        newText: String.raw`\showappendixtrue`,
      },
    ],
    oracleResponse:
      "已打开设置文件中的条件开关，使附录宏按原有结构定义，并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "条件宏-绕过条件结构",
        "直接把附录宏调用替换为文字，删除了条件宏调用关系。",
        [
          {
            file: "appendix/notes.tex",
            line: 2,
            oldText: String.raw`\appendixnote{}`,
            newText: "Appendix note",
          },
        ],
      ),
      rejectedMutation(
        "条件宏-错误开关值",
        "将开关改成了不存在的命令，无法定义条件分支中的宏。",
        [
          {
            file: "settings.tex",
            line: 2,
            oldText: String.raw`\showappendixfalse`,
            newText: String.raw`\showappendixmaybe`,
          },
        ],
      ),
    ],
    tags: ["条件编译", "宏来源", "附录"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.009",
    caseSlug: "compile-appendix-label-collision",
    category: "交叉引用修复",
    capabilities: ["C1", "C4", "C5", "C8"],
    difficulty: "D3",
    factors: ["重复标签", "附录独立编号", "跨文件引用"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{body}
\appendix
\input{appendix/table}
See appendix table~\ref{tab:appendix-results}.
\end{document}
`,
      },
      {
        path: "body.tex",
        content: String.raw`\section{Results}
\newcounter{resultstable}
\refstepcounter{resultstable}
\begin{center}Main results table\end{center}
\label{tab:results}
`,
      },
      {
        path: "appendix/table.tex",
        content: String.raw`\section{Supplementary tables}
\newcounter{resultstable}
\refstepcounter{resultstable}
\begin{center}Appendix results table\end{center}
\label{tab:results}
`,
      },
    ],
    currentFile: "appendix/table.tex",
    scale: "multi-small",
    pressure: "repeated-anchors",
    interactionFacts: [
      "正文和附录使用了相同的标签与计数器名称；正文编号不能改变，附录必须有独立标签和计数器。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "body.tex", value: "\\label{tab:results}" },
      { file: "body.tex", value: "Main results table" },
      {
        file: "main.tex",
        value: "See appendix table~\\ref{tab:appendix-results}.",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["appendix/table.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["See appendix table~\\ref{tab:appendix-results}."],
      },
      {
        type: "file_contains",
        file: "body.tex",
        values: ["\\label{tab:results}"],
      },
      {
        type: "file_contains",
        file: "body.tex",
        values: ["Main results table"],
      },
      { type: "file_unchanged", file: "main.tex" },
      { type: "file_unchanged", file: "body.tex" },
      {
        type: "file_contains",
        file: "appendix/table.tex",
        values: [
          "\\newcounter{appendixtable}",
          "\\refstepcounter{appendixtable}",
          "\\label{tab:appendix-results}",
          "Appendix results table",
        ],
      },
      {
        type: "file_not_contains",
        file: "appendix/table.tex",
        values: ["\\newcounter{resultstable}", "\\label{tab:results}"],
      },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "appendix/table.tex",
        line: 2,
        oldText: String.raw`\newcounter{resultstable}`,
        newText: String.raw`\newcounter{appendixtable}`,
      },
      {
        file: "appendix/table.tex",
        line: 3,
        oldText: String.raw`\refstepcounter{resultstable}`,
        newText: String.raw`\refstepcounter{appendixtable}`,
      },
      {
        file: "appendix/table.tex",
        line: 5,
        oldText: String.raw`\label{tab:results}`,
        newText: String.raw`\label{tab:appendix-results}`,
      },
    ],
    oracleResponse:
      "已为附录表格拆分计数器和标签，保留正文引用，并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "附录标签-只改标签",
        "只改了标签而继续复用冲突的计数器，根因错误且仍会编译失败。",
        [
          {
            file: "appendix/table.tex",
            line: 2,
            oldText: String.raw`\newcounter{resultstable}`,
            newText: String.raw`\newcounter{resultstablecopy}`,
          },
        ],
      ),
      rejectedMutation(
        "附录标签-修改正文",
        "通过修改正文标签回避冲突，破坏了正文编号和已存在的引用。",
        [
          {
            file: "body.tex",
            line: 5,
            oldText: String.raw`\label{tab:results}`,
            newText: String.raw`\label{tab:body-results}`,
          },
        ],
        "success",
      ),
    ],
    tags: ["交叉引用", "重复标签", "附录"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.012",
    caseSlug: "compile-bibliography-entrypoint",
    category: "文献编译修复",
    capabilities: ["C1", "C4", "C5", "C6", "C7"],
    difficulty: "D3",
    factors: ["文献入口", "章节引用", "保留文献数据库"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage[numbers]{natbib}
\begin{document}
\input{chapters/related}
\printbibliography
\end{document}
`,
      },
      {
        path: "chapters/related.tex",
        content: String.raw`\section{Related work}
Prior work discusses reproducible experiments~\cite{smith2024}.
`,
      },
      {
        path: "references.tex",
        content: String.raw`\begin{thebibliography}{9}
\bibitem{smith2024} Smith, A. Reproducible experiments. 2024.
\end{thebibliography}
`,
      },
    ],
    currentFile: "main.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "文献条目已放在 references.tex，章节引用键 smith2024 和脚注样式必须保留。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "chapters/related.tex", value: "\\cite{smith2024}" },
      { file: "references.tex", value: "\\bibitem{smith2024}" },
      { file: "main.tex", value: "\\usepackage[numbers]{natbib}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["main.tex"] },
      {
        type: "file_contains",
        file: "chapters/related.tex",
        values: ["\\cite{smith2024}"],
      },
      {
        type: "file_contains",
        file: "references.tex",
        values: ["\\bibitem{smith2024}"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\usepackage[numbers]{natbib}"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{references}"],
      },
      {
        type: "file_not_contains",
        file: "main.tex",
        values: ["\\printbibliography"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\usepackage[numbers]{natbib}", "\\input{chapters/related}"],
      },
      { type: "file_unchanged", file: "chapters/related.tex" },
      { type: "file_unchanged", file: "references.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 5,
        oldText: String.raw`\printbibliography`,
        newText: String.raw`\input{references}`,
      },
    ],
    oracleResponse:
      "已把主文件的文献入口接到现有 references.tex，保留章节引用并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "文献入口-错误数据库名",
        "将命令改为不存在的数据库入口，现有文献条目没有被载入。",
        [
          {
            file: "main.tex",
            line: 5,
            oldText: String.raw`\printbibliography`,
            newText: String.raw`\input{missing-references}`,
          },
        ],
      ),
      rejectedMutation(
        "文献入口-删除引用章节",
        "只删除章节引用来规避错误，破坏了正文结构并仍未生成文献表。",
        [
          {
            file: "main.tex",
            line: 4,
            oldText: String.raw`\input{chapters/related}`,
            newText: String.raw`\input{references}`,
          },
        ],
        "success",
      ),
    ],
    tags: ["文献", "引用", "跨文件"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.020",
    caseSlug: "compile-algorithm-environment",
    category: "算法引用修复",
    capabilities: ["C1", "C4", "C5", "C6", "C8"],
    difficulty: "D3",
    factors: ["算法环境", "浮动体结构", "编号交叉引用"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{sections/method}
Algorithm~\ref{alg:search} gives the search steps.
\end{document}
`,
      },
      {
        path: "sections/method.tex",
        content: String.raw`\section{Methods}
\begin{algorithm}
\caption{Search procedure}
\label{alg:search}
Initialize the queue and visit each node.
\end{algorithm}
`,
      },
    ],
    currentFile: "sections/method.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "项目使用可由 pdfLaTeX 直接提供的浮动体；算法标题、编号、超链接目标和正文位置都必须保留。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      {
        file: "main.tex",
        value: "Algorithm~\\ref{alg:search} gives the search steps.",
      },
      { file: "sections/method.tex", value: "\\caption{Search procedure}" },
      { file: "sections/method.tex", value: "Initialize the queue" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["sections/method.tex"] },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["Algorithm~\\ref{alg:search} gives the search steps."],
      },
      {
        type: "file_contains",
        file: "sections/method.tex",
        values: ["\\caption{Search procedure}"],
      },
      {
        type: "file_contains",
        file: "sections/method.tex",
        values: ["Initialize the queue"],
      },
      {
        type: "file_contains",
        file: "sections/method.tex",
        values: [
          "\\begin{figure}",
          "\\end{figure}",
          "\\caption{Search procedure}",
          "\\label{alg:search}",
        ],
      },
      {
        type: "file_not_contains",
        file: "sections/method.tex",
        values: ["\\begin{algorithm}", "\\end{algorithm}"],
      },
      { type: "file_unchanged", file: "main.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "sections/method.tex",
        line: 2,
        oldText: String.raw`\begin{algorithm}`,
        newText: String.raw`\begin{figure}`,
      },
      {
        file: "sections/method.tex",
        line: 6,
        oldText: String.raw`\end{algorithm}`,
        newText: String.raw`\end{figure}`,
      },
    ],
    oracleResponse:
      "已将未定义的算法浮动环境替换为兼容的图形浮动体，保留标题和引用并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "算法环境-只改开始标记",
        "只替换开始环境而保留未定义的结束环境，文档仍无法编译。",
        [
          {
            file: "sections/method.tex",
            line: 2,
            oldText: String.raw`\begin{algorithm}`,
            newText: String.raw`\begin{figure}`,
          },
        ],
      ),
      rejectedMutation(
        "算法环境-改成表格",
        "改用了表格浮动体，虽然可能编译，但改变了算法的浮动体语义。",
        [
          {
            file: "sections/method.tex",
            line: 2,
            oldText: String.raw`\begin{algorithm}`,
            newText: String.raw`\begin{table}`,
          },
          {
            file: "sections/method.tex",
            line: 6,
            oldText: String.raw`\end{algorithm}`,
            newText: String.raw`\end{table}`,
          },
        ],
        "success",
      ),
    ],
    tags: ["算法", "交叉引用", "浮动体"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.023",
    caseSlug: "compile-proof-environment",
    category: "定理环境修复",
    capabilities: ["C1", "C4", "C5"],
    difficulty: "D3",
    factors: ["证明环境未定义", "模板兼容", "保留定理编号"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\input{theorem-settings}
\begin{document}
\input{chapters/lemma}
\end{document}
`,
      },
      {
        path: "theorem-settings.tex",
        content: String.raw`\newtheorem{lemma}{Lemma}
\newenvironment{proofx}{\par\noindent Proof: }{\hfill$\square$\par}
`,
      },
      {
        path: "chapters/lemma.tex",
        content: String.raw`\begin{lemma}
Every finite list has a first element.
\end{lemma}
\begin{proof}
Choose the least index in the list.
\end{proof}
`,
      },
    ],
    currentFile: "theorem-settings.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "新引理使用 proof 环境，模板设置文件已有相同版式的 proofx 定义；定理、证明结束符和编号必须保留。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      {
        file: "chapters/lemma.tex",
        value: "Every finite list has a first element.",
      },
      {
        file: "chapters/lemma.tex",
        value: "Choose the least index in the list.",
      },
      { file: "main.tex", value: "\\input{chapters/lemma}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["theorem-settings.tex"] },
      {
        type: "file_contains",
        file: "chapters/lemma.tex",
        values: ["Every finite list has a first element."],
      },
      {
        type: "file_contains",
        file: "chapters/lemma.tex",
        values: ["Choose the least index in the list."],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{chapters/lemma}"],
      },
      {
        type: "file_contains",
        file: "theorem-settings.tex",
        values: [
          "\\newenvironment{proof}{\\par\\noindent Proof: }{\\hfill$\\diamond$\\par}",
        ],
      },
      {
        type: "file_not_contains",
        file: "theorem-settings.tex",
        values: ["\\newenvironment{proofx}"],
      },
      { type: "file_unchanged", file: "chapters/lemma.tex" },
      { type: "file_unchanged", file: "main.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "theorem-settings.tex",
        line: 2,
        oldText: String.raw`\newenvironment{proofx}{\par\noindent Proof: }{\hfill$\square$\par}`,
        newText: String.raw`\newenvironment{proof}{\par\noindent Proof: }{\hfill$\diamond$\par}`,
      },
    ],
    oracleResponse:
      "已将模板中的证明环境名称与新引理调用对齐，保留证明版式并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "证明环境-修改章节文字",
        "把证明环境改成普通文字，删除了需要保留的结构化证明调用。",
        [
          {
            file: "chapters/lemma.tex",
            line: 5,
            oldText: String.raw`\begin{proof}`,
            newText: "Proof:",
          },
        ],
      ),
      rejectedMutation(
        "证明环境-错误环境名称",
        "定义了另一个环境名称，章节中的 proof 调用仍然未定义。",
        [
          {
            file: "theorem-settings.tex",
            line: 2,
            oldText: String.raw`\newenvironment{proofx}{\par\noindent Proof: }{\hfill$\square$\par}`,
            newText: String.raw`\newenvironment{proofy}{\par\noindent Proof: }{\hfill$\square$\par}`,
          },
        ],
      ),
    ],
    tags: ["定理", "证明环境", "模板"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.026",
    caseSlug: "compile-department-figure-counters",
    category: "图号编译修复",
    capabilities: ["C1", "C4", "C5", "C6", "C8"],
    difficulty: "D3",
    factors: ["跨文件计数器", "附件独立前缀", "图引用"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{departments/engineering}
\input{departments/annex}
\end{document}
`,
      },
      {
        path: "departments/engineering.tex",
        content: String.raw`\section{Engineering}
\newcounter{deptfigure}
\refstepcounter{deptfigure}\label{fig:engineering}
\begin{center}Engineering architecture figure\end{center}
`,
      },
      {
        path: "departments/annex.tex",
        content: String.raw`\section{Annex}
\newcounter{deptfigure}
\refstepcounter{deptfigure}\label{fig:annex}
\begin{center}Annex workflow figure\end{center}
`,
      },
    ],
    currentFile: "departments/annex.tex",
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "工程部图号和附件图号都必须保留，附件需要使用独立计数器，不能删除图题或合并章节文件。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      {
        file: "departments/engineering.tex",
        value: "Engineering architecture figure",
      },
      { file: "departments/annex.tex", value: "Annex workflow figure" },
      { file: "main.tex", value: "\\input{departments/engineering}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["departments/annex.tex"] },
      {
        type: "file_contains",
        file: "departments/engineering.tex",
        values: ["Engineering architecture figure"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{departments/engineering}"],
      },
      {
        type: "file_contains",
        file: "departments/annex.tex",
        values: [
          "\\newcounter{annexfigure}",
          "\\refstepcounter{annexfigure}",
          "\\label{fig:annex}",
          "Annex workflow figure",
        ],
      },
      {
        type: "file_not_contains",
        file: "departments/annex.tex",
        values: ["\\newcounter{deptfigure}", "\\refstepcounter{deptfigure}"],
      },
      { type: "file_unchanged", file: "departments/engineering.tex" },
      { type: "file_unchanged", file: "main.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "departments/annex.tex",
        line: 2,
        oldText: String.raw`\newcounter{deptfigure}`,
        newText: String.raw`\newcounter{annexfigure}`,
      },
      {
        file: "departments/annex.tex",
        line: 3,
        oldText: String.raw`\refstepcounter{deptfigure}`,
        newText: String.raw`\refstepcounter{annexfigure}`,
      },
    ],
    oracleResponse:
      "已为附件建立独立图计数器，保留两个部门文件和图引用，并完成编译验证。",
    graderMutations: [
      rejectedMutation(
        "图计数器-只改定义",
        "只改了计数器定义但没有同步 refstepcounter，附件图号仍使用错误计数器。",
        [
          {
            file: "departments/annex.tex",
            line: 2,
            oldText: String.raw`\newcounter{deptfigure}`,
            newText: String.raw`\newcounter{annexfigure}`,
          },
        ],
        "success",
      ),
      rejectedMutation(
        "图计数器-修改工程部",
        "通过修改工程部文件规避重复定义，破坏了原部门图号和受保护内容。",
        [
          {
            file: "departments/engineering.tex",
            line: 4,
            oldText: "Engineering architecture figure",
            newText: "Annex workflow figure",
          },
        ],
        "success",
      ),
    ],
    tags: ["图编号", "计数器", "跨文件"],
    promptForm: "中文故障报告",
  }),

  makeV3Case({
    candidateId: "v3.compile.038",
    caseSlug: "compile-final-multi-artifact",
    category: "最终编译修复",
    capabilities: ["C1", "C4", "C5", "C6", "C7", "C8", "C10", "C11"],
    difficulty: "D4",
    factors: ["宏冲突", "交叉引用", "附录文献", "索引保留", "多文件依赖"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{makeidx}
\makeindex
\input{config}
\begin{document}
\tableofcontents
\input{chapters/overview}
\appendix
\input{appendix/material}
\printbibliography
\printindex
\end{document}
`,
      },
      {
        path: "config.tex",
        content: String.raw`\newcommand{\projectterm}{Aurora framework}
`,
      },
      {
        path: "chapters/overview.tex",
        content: String.raw`\section{Overview}\label{sec:overview}
\newcommand{\projectterm}{Aurora framework}
The project is \projectterm{}.\index{project term}
`,
      },
      {
        path: "appendix/material.tex",
        content: String.raw`\section{Supplementary material}
The supplementary experiment remains in the appendix and follows Section~\ref{sec:overveiw}.
`,
      },
      {
        path: "appendix/references.tex",
        content: String.raw`\begin{thebibliography}{9}
\bibitem{aurora2025} Aurora Team. Technical report. 2025.
\end{thebibliography}
`,
      },
    ],
    currentFile: "chapters/overview.tex",
    scale: "multi-long",
    pressure: "combined",
    interactionFacts: [
      "这是交付前综合编译：章节宏重复、附录交叉引用、文献入口和索引都需要处理，不能删除章节或手工抄写辅助内容。",
    ],
    action: "patch",
    initialCompile: "failure",
    compileMode: "repair-loop",
    protectedInvariants: [
      { file: "main.tex", value: "\\makeindex" },
      { file: "main.tex", value: "\\tableofcontents" },
      { file: "chapters/overview.tex", value: "\\index{project term}" },
      {
        file: "appendix/material.tex",
        value: "The supplementary experiment remains in the appendix",
      },
      { file: "appendix/references.tex", value: "\\bibitem{aurora2025}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "patch_files",
        files: ["main.tex", "chapters/overview.tex", "appendix/material.tex"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\makeindex"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\tableofcontents"],
      },
      {
        type: "file_contains",
        file: "chapters/overview.tex",
        values: ["\\index{project term}"],
      },
      {
        type: "file_contains",
        file: "appendix/material.tex",
        values: [
          "The supplementary experiment remains in the appendix",
          "\\ref{sec:overview}",
        ],
      },
      {
        type: "file_contains",
        file: "appendix/references.tex",
        values: ["\\bibitem{aurora2025}"],
      },
      {
        type: "file_contains",
        file: "chapters/overview.tex",
        values: [
          "\\renewcommand{\\projectterm}{Aurora framework}",
          "\\index{project term}",
        ],
      },
      {
        type: "file_not_contains",
        file: "chapters/overview.tex",
        values: ["\\newcommand{\\projectterm}{Aurora framework}"],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\input{appendix/references}",
          "\\makeindex",
          "\\printindex",
          "\\tableofcontents",
        ],
      },
      {
        type: "file_not_contains",
        file: "main.tex",
        values: ["\\printbibliography"],
      },
      {
        type: "file_not_contains",
        file: "appendix/material.tex",
        values: ["\\ref{sec:overveiw}"],
      },
      { type: "file_unchanged", file: "config.tex" },
      { type: "file_unchanged", file: "appendix/references.tex" },
      compileSuccess,
    ],
    oraclePatches: [
      {
        file: "chapters/overview.tex",
        line: 2,
        oldText: String.raw`\newcommand{\projectterm}{Aurora framework}`,
        newText: String.raw`\renewcommand{\projectterm}{Aurora framework}`,
      },
      {
        file: "main.tex",
        line: 9,
        oldText: String.raw`\printbibliography`,
        newText: String.raw`\input{appendix/references}`,
      },
      {
        file: "appendix/material.tex",
        line: 2,
        oldText:
          "The supplementary experiment remains in the appendix and follows Section~\\ref{sec:overveiw}.",
        newText:
          "The supplementary experiment remains in the appendix and follows Section~\\ref{sec:overview}.",
      },
    ],
    oracleResponse:
      "已修复章节宏冲突、附录交叉引用和文献入口，保留目录、索引和附录结构后完成最终编译验证。",
    graderMutations: [
      rejectedMutation(
        "综合编译-遗漏文献入口",
        "只修复了章节宏冲突，遗漏附录文献入口，综合编译仍不完整。",
        [
          {
            file: "chapters/overview.tex",
            line: 2,
            oldText: String.raw`\newcommand{\projectterm}{Aurora framework}`,
            newText: String.raw`\renewcommand{\projectterm}{Aurora framework}`,
          },
        ],
      ),
      rejectedMutation(
        "综合编译-删除索引命令",
        "用文献入口修复了编译，却删除索引命令来回避辅助文件要求。",
        [
          {
            file: "chapters/overview.tex",
            line: 2,
            oldText: String.raw`\newcommand{\projectterm}{Aurora framework}`,
            newText: String.raw`\renewcommand{\projectterm}{Aurora framework}`,
          },
          {
            file: "main.tex",
            line: 8,
            oldText: String.raw`\input{appendix/material}`,
            newText: String.raw`\input{appendix/references}`,
          },
        ],
        "success",
      ),
    ],
    tags: ["最终编译", "宏", "文献", "索引", "附录"],
    promptForm: "中文综合故障报告",
  }),
];
