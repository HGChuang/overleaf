import { makeV3Case } from "../caseFactory.js";
import type { V3ExecutableCase } from "../types.js";

const compileGrader = {
  type: "compile" as const,
  status: "success" as const,
  max_errors: 0,
  max_warnings: 20,
};

export const V3_ARTIFACT_CASES: V3ExecutableCase[] = [
  makeV3Case({
    candidateId: "v3.artifact.001",
    caseSlug: "figure-location-caption",
    category: "图像位置与标题排版",
    capabilities: ["C2", "C4", "C6"],
    difficulty: "D2",
    factors: ["图像定位", "章节范围保护", "版心宽度约束"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage[margin=2cm]{geometry}
\begin{document}
\section{Methods}
The experiment steps must remain in their original order.
\begin{figure}[h]
\raggedright
\fbox{\rule{0pt}{3cm}\rule{0.72\linewidth}{0pt}}
\caption{Experiment photograph (experiment.jpg)}
\label{fig:experiment}
\end{figure}
\section{Results}
The result analysis refers to the experiment photograph.
\end{document}
`,
      },
    ],
    interactionFacts: [
      "图片文件名是 experiment.jpg；当前用 fbox 占位表示照片，不需要新增二进制文件。",
      "照片应位于第二节结果分析附近，宽度不能超过正文版心。",
      "第一节的实验步骤和两个章节标题必须保持不变。",
    ],
    action: "patch",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      {
        file: "main.tex",
        value: "The experiment steps must remain in their original order.",
      },
      { file: "main.tex", value: "\\section{Methods}" },
      { file: "main.tex", value: "\\section{Results}" },
      { file: "main.tex", value: "\\label{fig:experiment}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\centering",
          "\\label{fig:experiment}",
          "\\section{Methods}",
          "\\section{Results}",
          "The experiment steps must remain in their original order.",
        ],
      },
      {
        type: "file_matches",
        file: "main.tex",
        pattern: "Results[\\s\\S]{0,260}\\\\begin\\{figure\\}",
      },
      {
        type: "file_matches",
        file: "main.tex",
        pattern: "\\\\fbox\\{[\\s\\S]*0\\.72\\\\linewidth",
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 5,
        oldText: String.raw`\section{Methods}
The experiment steps must remain in their original order.
\begin{figure}[h]
\raggedright
\fbox{\rule{0pt}{3cm}\rule{0.72\linewidth}{0pt}}
\caption{Experiment photograph (experiment.jpg)}
\label{fig:experiment}
\end{figure}
\section{Results}`,
        newText: String.raw`\section{Methods}
The experiment steps must remain in their original order.
\section{Results}
\begin{figure}[h]
\centering
\fbox{\rule{0pt}{3cm}\rule{0.72\linewidth}{0pt}}
\caption{Experiment photograph (experiment.jpg)}
\label{fig:experiment}
\end{figure}`,
      },
    ],
    oracleResponse:
      "已将 experiment.jpg 的占位图放到第二节附近，居中保留标题和编号，并保持正文版心宽度。",
    graderMutations: [
      {
        mutation_id: "布局仍左对齐",
        description: "图像仍使用左对齐，未完成居中布局。",
        patches: [
          {
            file: "main.tex",
            line: 9,
            oldText: String.raw`\raggedright`,
            newText: String.raw`\centering`,
          },
        ],
      },
      {
        mutation_id: "图像留在第一节",
        description: "图像没有随结果分析移动到第二节。",
        patches: [
          {
            file: "main.tex",
            line: 12,
            oldText: String.raw`\section{Results}`,
            newText: String.raw`\section{Wrong section}`,
          },
        ],
      },
    ],
    tags: ["图像", "标题", "章节位置", "版心"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.002",
    caseSlug: "three-subfigures-width",
    category: "子图布局与多文件图注",
    capabilities: ["C2", "C3", "C4", "C6"],
    difficulty: "D3",
    factors: ["多文件定位", "双栏宽度约束", "子图标题保留"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass[twocolumn]{article}
\usepackage{subcaption}
\begin{document}
\input{sections/methods}
\end{document}
`,
      },
      {
        path: "sections/methods.tex",
        content: String.raw`\section{Method}
\begin{figure}[t]
\centering
\subcaptionbox{Subfigure A: input}{\fbox{\rule{0pt}{2cm}\rule{0.38\linewidth}{0pt}}}
\subcaptionbox{Subfigure B: encoder}{\fbox{\rule{0pt}{2cm}\rule{0.38\linewidth}{0pt}}}
\subcaptionbox{Subfigure C: output}{\fbox{\rule{0pt}{2cm}\rule{0.38\linewidth}{0pt}}}
\caption{Method pipeline}
\label{fig:method-pipeline}
\end{figure}
`,
      },
    ],
    interactionFacts: [
      "三张图分别由 input、encoder、output 三个 fbox 占位表示，固定保留三个子图。",
      "项目是双栏版式；应让三张子图在栏宽内整齐排列。",
      "总标题、三个子图标题和子图编号都必须保留。",
    ],
    action: "patch",
    scale: "multi-small",
    pressure: "many-files",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{sections/methods}" },
      { file: "sections/methods.tex", value: "Subfigure A: input" },
      { file: "sections/methods.tex", value: "Subfigure B: encoder" },
      { file: "sections/methods.tex", value: "Subfigure C: output" },
      { file: "sections/methods.tex", value: "\\caption{Method pipeline}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{sections/methods}"],
      },
      {
        type: "file_contains",
        file: "sections/methods.tex",
        values: [
          "\\centering",
          "Subfigure A: input",
          "Subfigure B: encoder",
          "Subfigure C: output",
          "\\caption{Method pipeline}",
        ],
      },
      {
        type: "regex_count",
        file: "sections/methods.tex",
        pattern: "\\\\subcaptionbox",
        count: 3,
      },
      {
        type: "file_matches",
        file: "sections/methods.tex",
        pattern:
          "0\\.31\\\\linewidth[\\s\\S]*0\\.31\\\\linewidth[\\s\\S]*0\\.31\\\\linewidth",
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "sections/methods.tex",
        line: 2,
        oldText: String.raw`\begin{figure}[t]
\centering
\subcaptionbox{Subfigure A: input}{\fbox{\rule{0pt}{2cm}\rule{0.38\linewidth}{0pt}}}
\subcaptionbox{Subfigure B: encoder}{\fbox{\rule{0pt}{2cm}\rule{0.38\linewidth}{0pt}}}
\subcaptionbox{Subfigure C: output}{\fbox{\rule{0pt}{2cm}\rule{0.38\linewidth}{0pt}}}
\caption{Method pipeline}
\label{fig:method-pipeline}
\end{figure}`,
        newText: String.raw`\begin{figure}[t]
\centering
\subcaptionbox{Subfigure A: input}{\fbox{\rule{0pt}{2cm}\rule{0.31\linewidth}{0pt}}}\hfill
\subcaptionbox{Subfigure B: encoder}{\fbox{\rule{0pt}{2cm}\rule{0.31\linewidth}{0pt}}}\hfill
\subcaptionbox{Subfigure C: output}{\fbox{\rule{0pt}{2cm}\rule{0.31\linewidth}{0pt}}}
\caption{Method pipeline}
\label{fig:method-pipeline}
\end{figure}`,
      },
    ],
    oracleResponse:
      "已在 sections/methods.tex 中收紧三个子图宽度并加入间隔，保留双栏版式、总标题和全部子图标题。",
    graderMutations: [
      {
        mutation_id: "子图仍然过宽",
        description: "三个子图继续使用过宽尺寸，双栏中会发生横向溢出。",
        patches: [
          {
            file: "sections/methods.tex",
            line: 3,
            oldText: String.raw`\begin{figure}[t]
\centering
\subcaptionbox{Subfigure A: input}{\fbox{\rule{0pt}{2cm}\rule{0.38\linewidth}{0pt}}}
\subcaptionbox{Subfigure B: encoder}{\fbox{\rule{0pt}{2cm}\rule{0.38\linewidth}{0pt}}}
\subcaptionbox{Subfigure C: output}{\fbox{\rule{0pt}{2cm}\rule{0.38\linewidth}{0pt}}}
\caption{Method pipeline}
\label{fig:method-pipeline}
\end{figure}`,
            newText: String.raw`\begin{figure}[t]
\centering
\subcaptionbox{Subfigure A: input}{\fbox{\rule{0pt}{2cm}\rule{0.45\linewidth}{0pt}}}
\subcaptionbox{Subfigure B: encoder}{\fbox{\rule{0pt}{2cm}\rule{0.45\linewidth}{0pt}}}
\subcaptionbox{Subfigure C: output}{\fbox{\rule{0pt}{2cm}\rule{0.45\linewidth}{0pt}}}
\caption{Method pipeline}
\label{fig:method-pipeline}
\end{figure}`,
          },
        ],
      },
      {
        mutation_id: "子图标题缺失",
        description: "第二张子图的独立标题被改写，标题语义不再完整。",
        patches: [
          {
            file: "sections/methods.tex",
            line: 5,
            oldText: "Subfigure B: encoder",
            newText: "Subfigure B",
          },
        ],
      },
    ],
    tags: ["子图", "双栏", "多文件", "图注"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.005",
    caseSlug: "combined-chart-group",
    category: "图组顺序与交叉引用",
    capabilities: ["C2", "C3", "C4", "C6"],
    difficulty: "D3",
    factors: ["跨文件图组", "图题顺序", "正文引用同步"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{subcaption}
\begin{document}
The comparison is shown in Fig.~\ref{fig:model-bar} and Fig.~\ref{fig:model-line}.
\input{sections/results}
\end{document}
`,
      },
      {
        path: "sections/results.tex",
        content: String.raw`\section{Results}
\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.75\linewidth}{0pt}}
\caption{Bar chart explanation}
\label{fig:model-bar}
\end{figure}
\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.75\linewidth}{0pt}}
\caption{Line chart explanation}
\label{fig:model-line}
\end{figure}
`,
      },
    ],
    interactionFacts: [
      "柱状图和折线图都用 fbox 占位，必须合并为同一个图组。",
      "合并后的顺序固定为上方柱状图、下方折线图；两条独立说明和数据颜色含义都要保留。",
      "正文已有两处图引用，合并后应指向同一个总图编号。",
    ],
    action: "patch",
    scale: "multi-small",
    pressure: "many-files",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "The comparison is shown in" },
      { file: "sections/results.tex", value: "Bar chart explanation" },
      { file: "sections/results.tex", value: "Line chart explanation" },
      { file: "sections/results.tex", value: "\\fbox" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\ref{fig:model-results}", "The comparison is shown in"],
      },
      {
        type: "file_contains",
        file: "sections/results.tex",
        values: [
          "Bar chart explanation",
          "Line chart explanation",
          "\\caption{Model result comparison}",
          "\\label{fig:model-results}",
          "\\fbox",
          "\\begin{subfigure}",
        ],
      },
      {
        type: "regex_count",
        file: "sections/results.tex",
        pattern: "\\\\begin\\{figure\\}",
        count: 1,
      },
      {
        type: "regex_count",
        file: "sections/results.tex",
        pattern: "\\\\begin\\{subfigure\\}",
        count: 2,
      },
      {
        type: "file_matches",
        file: "sections/results.tex",
        pattern: "Bar chart explanation[\\s\\S]*Line chart explanation",
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 4,
        oldText: String.raw`The comparison is shown in Fig.~\ref{fig:model-bar} and Fig.~\ref{fig:model-line}.`,
        newText: String.raw`The comparison is shown in Fig.~\ref{fig:model-results}.`,
      },
      {
        file: "sections/results.tex",
        line: 2,
        oldText: String.raw`\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.75\linewidth}{0pt}}
\caption{Bar chart explanation}
\label{fig:model-bar}
\end{figure}
\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.75\linewidth}{0pt}}
\caption{Line chart explanation}
\label{fig:model-line}
\end{figure}`,
        newText: String.raw`\begin{figure}[h]
\centering
\begin{subfigure}{0.82\linewidth}
\centering
\fbox{\rule{0pt}{2cm}\rule{0.75\linewidth}{0pt}}
\caption{Bar chart explanation}
\end{subfigure}
\par\medskip
\begin{subfigure}{0.82\linewidth}
\centering
\fbox{\rule{0pt}{2cm}\rule{0.75\linewidth}{0pt}}
\caption{Line chart explanation}
\end{subfigure}
\caption{Model result comparison}
\label{fig:model-results}
\end{figure}`,
      },
    ],
    oracleResponse:
      "已将两张图按柱状图在上、折线图在下合并为图组，并把正文引用更新到总图编号。",
    graderMutations: [
      {
        mutation_id: "图组顺序颠倒",
        description: "合并图组把折线图放在柱状图之前，违反用户指定顺序。",
        patches: [
          {
            file: "sections/results.tex",
            line: 2,
            oldText: String.raw`\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.75\linewidth}{0pt}}
\caption{Bar chart explanation}
\label{fig:model-bar}
\end{figure}
\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.75\linewidth}{0pt}}
\caption{Line chart explanation}
\label{fig:model-line}
\end{figure}`,
            newText: String.raw`\begin{figure}[h]
\centering
\begin{subfigure}{0.82\linewidth}
\caption{Line chart explanation}
\end{subfigure}
\begin{subfigure}{0.82\linewidth}
\caption{Bar chart explanation}
\end{subfigure}
\caption{Model result comparison}
\label{fig:model-results}
\end{figure}`,
          },
        ],
      },
      {
        mutation_id: "正文引用未同步",
        description: "正文仍引用已拆分的旧图标签，合并后引用目标失效。",
        patches: [
          {
            file: "main.tex",
            line: 4,
            oldText: String.raw`\ref{fig:model-bar}`,
            newText: String.raw`\ref{fig:missing-bar}`,
          },
        ],
      },
    ],
    tags: ["图组", "图引用", "顺序", "多文件"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.009",
    caseSlug: "survey-longtable-header",
    category: "长表分页与重复表头",
    capabilities: ["C2", "C3", "C4", "C6"],
    difficulty: "D3",
    factors: ["长表结构", "跨页表头", "数据完整性"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{longtable}
\begin{document}
\input{tables/survey}
\end{document}
`,
      },
      {
        path: "tables/survey.tex",
        content: String.raw`\begin{table}[h]
\centering
\caption{Survey results}
\label{tab:survey}
\begin{tabular}{rll}
No. & Group & Percentage \\
1 & A & 10\% \\
2 & B & 11\% \\
3 & C & 12\% \\
4 & A & 13\% \\
5 & B & 14\% \\
6 & C & 15\% \\
7 & A & 16\% \\
8 & B & 17\% \\
9 & C & 18\% \\
10 & A & 19\% \\
11 & B & 20\% \\
12 & C & 21\% \\
13 & A & 22\% \\
14 & B & 23\% \\
15 & C & 24\% \\
16 & A & 25\% \\
17 & B & 26\% \\
18 & C & 27\% \\
19 & A & 28\% \\
20 & B & 29\% \\
21 & C & 30\% \\
22 & A & 31\%
\end{tabular}
\end{table}
`,
      },
    ],
    interactionFacts: [
      "tables/survey.tex 中有 22 行问卷结果，首列编号和百分比必须全部保留。",
      "表题 Survey results 和标签 tab:survey 不变；续页必须重复表头。",
      "只允许调整表格环境，不改变任何数据。",
    ],
    action: "patch",
    scale: "multi-small",
    pressure: "many-files",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{tables/survey}" },
      { file: "tables/survey.tex", value: "\\caption{Survey results}" },
      { file: "tables/survey.tex", value: "\\label{tab:survey}" },
      { file: "tables/survey.tex", value: "22 & A & 31\\%" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{tables/survey}"],
      },
      {
        type: "file_contains",
        file: "tables/survey.tex",
        values: [
          "\\begin{longtable}",
          "\\endfirsthead",
          "\\endhead",
          "\\caption{Survey results}",
          "\\label{tab:survey}",
          "1 & A & 10\\%",
          "22 & A & 31\\%",
        ],
      },
      {
        type: "file_matches",
        file: "tables/survey.tex",
        pattern: "\\\\endhead[\\s\\S]*\\\\endfoot",
      },
      {
        type: "regex_count",
        file: "tables/survey.tex",
        pattern: "\\d+ & [ABC] &",
        count: 22,
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "tables/survey.tex",
        line: 5,
        oldText: String.raw`\begin{table}[h]
\centering
\caption{Survey results}
\label{tab:survey}
\begin{tabular}{rll}
No. & Group & Percentage \\
1 & A & 10\% \\
2 & B & 11\% \\
3 & C & 12\% \\
4 & A & 13\% \\
5 & B & 14\% \\
6 & C & 15\% \\
7 & A & 16\% \\
8 & B & 17\% \\
9 & C & 18\% \\
10 & A & 19\% \\
11 & B & 20\% \\
12 & C & 21\% \\
13 & A & 22\% \\
14 & B & 23\% \\
15 & C & 24\% \\
16 & A & 25\% \\
17 & B & 26\% \\
18 & C & 27\% \\
19 & A & 28\% \\
20 & B & 29\% \\
21 & C & 30\% \\
22 & A & 31\%
\end{tabular}
\end{table}`,
        newText: String.raw`\begin{longtable}{rll}
\caption{Survey results}\label{tab:survey}\\
No. & Group & Percentage \\
\endfirsthead
\caption[]{Survey results (continued)}\\
No. & Group & Percentage \\
\endhead
\hline
\endfoot
1 & A & 10\% \\
2 & B & 11\% \\
3 & C & 12\% \\
4 & A & 13\% \\
5 & B & 14\% \\
6 & C & 15\% \\
7 & A & 16\% \\
8 & B & 17\% \\
9 & C & 18\% \\
10 & A & 19\% \\
11 & B & 20\% \\
12 & C & 21\% \\
13 & A & 22\% \\
14 & B & 23\% \\
15 & C & 24\% \\
16 & A & 25\% \\
17 & B & 26\% \\
18 & C & 27\% \\
19 & A & 28\% \\
20 & B & 29\% \\
21 & C & 30\% \\
22 & A & 31\% \\
\end{longtable}`,
      },
    ],
    oracleResponse:
      "已把 22 行结果改为可跨页的 longtable，并设置续页重复表头，所有编号和百分比保持不变。",
    graderMutations: [
      {
        mutation_id: "续页没有表头",
        description: "长表虽然可跨页，但缺少续页表头标记。",
        patches: [
          {
            file: "tables/survey.tex",
            line: 5,
            oldText: String.raw`\begin{table}[h]
\centering
\caption{Survey results}
\label{tab:survey}
\begin{tabular}{rll}
No. & Group & Percentage \\
1 & A & 10\% \\
2 & B & 11\% \\
3 & C & 12\% \\
4 & A & 13\% \\
5 & B & 14\% \\
6 & C & 15\% \\
7 & A & 16\% \\
8 & B & 17\% \\
9 & C & 18\% \\
10 & A & 19\% \\
11 & B & 20\% \\
12 & C & 21\% \\
13 & A & 22\% \\
14 & B & 23\% \\
15 & C & 24\% \\
16 & A & 25\% \\
17 & B & 26\% \\
18 & C & 27\% \\
19 & A & 28\% \\
20 & B & 29\% \\
21 & C & 30\% \\
22 & A & 31\%
\end{tabular}
\end{table}`,
            newText: String.raw`\begin{longtable}{rll}
No. & Group & Percentage \\
\hline
1 & A & 10\% \\
2 & B & 11\% \\
3 & C & 12\% \\
4 & A & 13\% \\
5 & B & 14\% \\
6 & C & 15\% \\
7 & A & 16\% \\
8 & B & 17\% \\
9 & C & 18\% \\
10 & A & 19\% \\
11 & B & 20\% \\
12 & C & 21\% \\
13 & A & 22\% \\
14 & B & 23\% \\
15 & C & 24\% \\
16 & A & 25\% \\
17 & B & 26\% \\
18 & C & 27\% \\
19 & A & 28\% \\
20 & B & 29\% \\
21 & C & 30\% \\
22 & A & 31\% \\
\end{longtable}`,
          },
        ],
      },
      {
        mutation_id: "问卷行被删除",
        description: "表格调整时删除了第 12 行数据，违反全部行保留要求。",
        patches: [
          {
            file: "tables/survey.tex",
            line: 17,
            oldText: "12 & C & 21\\%",
            newText: "12 & C & 99\\%",
          },
        ],
      },
    ],
    tags: ["长表", "跨页", "表头", "数据保留"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.010",
    caseSlug: "financial-wide-table",
    category: "宽表版心适配与数字格式",
    capabilities: ["C2", "C4", "C6"],
    difficulty: "D2",
    factors: ["宽表缩放", "金额格式保护", "列完整性"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass[a4paper]{article}
\usepackage[margin=2cm]{geometry}
\usepackage{graphicx}
\begin{document}
\begin{table}[h]
\centering
\caption{Annual operating data}
\label{tab:finance}
\begin{tabular}{lrrrr}
Year & Revenue & Cost & Profit & Staff \\
2022 & 1,234,567 & 987,654 & 246,913 & 120 \\
2023 & 2,345,678 & 1,876,543 & 469,135 & 145 \\
\end{tabular}
\end{table}
\end{document}
`,
      },
    ],
    interactionFacts: [
      "A4 版式下年度经营数据表超出右边界，只调整表格排版。",
      "金额必须保留千位分隔符，不能改成科学计数法。",
      "标题、列名、年份和所有数字都必须保留。",
    ],
    action: "patch",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\caption{Annual operating data}" },
      { file: "main.tex", value: "1,234,567" },
      {
        file: "main.tex",
        value: "2023 & 2,345,678 & 1,876,543 & 469,135 & 145",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\resizebox{\\linewidth}{!}{%",
          "\\caption{Annual operating data}",
          "1,234,567",
          "2,345,678",
          "2023 & 2,345,678 & 1,876,543 & 469,135 & 145",
        ],
      },
      {
        type: "file_matches",
        file: "main.tex",
        pattern:
          "\\\\resizebox\\{\\\\linewidth\\}\\{!\\}\\{%[\\s\\S]*\\\\end\\{tabular\\}\\n\\}",
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 7,
        oldText: String.raw`\begin{tabular}{lrrrr}
Year & Revenue & Cost & Profit & Staff \\
2022 & 1,234,567 & 987,654 & 246,913 & 120 \\
2023 & 2,345,678 & 1,876,543 & 469,135 & 145 \\
\end{tabular}`,
        newText: String.raw`\resizebox{\linewidth}{!}{%
\begin{tabular}{lrrrr}
Year & Revenue & Cost & Profit & Staff \\
2022 & 1,234,567 & 987,654 & 246,913 & 120 \\
2023 & 2,345,678 & 1,876,543 & 469,135 & 145 \\
\end{tabular}
}`,
      },
    ],
    oracleResponse:
      "已将年度经营数据表限制在 A4 正文版心内，并保留千位分隔符、全部列和小数格式。",
    graderMutations: [
      {
        mutation_id: "金额改为科学计数法",
        description: "宽表调整同时把金额改成科学计数法，破坏了原有数字格式。",
        patches: [
          {
            file: "main.tex",
            line: 10,
            oldText: "1,234,567",
            newText: "1.23e6",
          },
        ],
      },
      {
        mutation_id: "宽表没有限制版心",
        description: "表格仍直接使用原始 tabular，右侧列可能超出页面。",
        patches: [
          {
            file: "main.tex",
            line: 7,
            oldText: String.raw`\begin{tabular}{lrrrr}
Year & Revenue & Cost & Profit & Staff \\
2022 & 1,234,567 & 987,654 & 246,913 & 120 \\
2023 & 2,345,678 & 1,876,543 & 469,135 & 145 \\
\end{tabular}`,
            newText: String.raw`\begin{tabular}{lrrrr}
Year & Revenue & Cost & Profit & Staff \\
2022 & 1,234,567 & 987,654 & 246,913 & 120 \\
2023 & 2,345,678 & 1,876,543 & 469,135 & 145 \\
\end{tabular}`,
          },
        ],
      },
    ],
    tags: ["宽表", "版心", "数字格式", "A4版式"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.016",
    caseSlug: "beamer-flowchart-scale",
    category: "演示文稿流程图可读性",
    capabilities: ["C2", "C4", "C6"],
    difficulty: "D4",
    factors: ["演示页布局", "流程节点完整性", "页脚保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{beamer}
\setbeamertemplate{footline}{\hfill\scriptsize Footer content\hfill\vskip2pt}
\begin{document}
\begin{frame}{Algorithm flowchart}
\begin{center}
University logo: \fbox{\rule{0pt}{0.3cm}\rule{1.2cm}{0pt}}\\[4pt]
\fbox{\begin{minipage}{0.48\linewidth}
\centering Node A $\rightarrow$ Node B $\rightarrow$ Node C
\end{minipage}}
\end{center}
\end{frame}
\end{document}
`,
      },
    ],
    interactionFacts: [
      "流程图用 fbox 占位，节点 A、B、C 必须全部保留。",
      "需要在同一页放大流程图以便投影阅读，不得新增空白页。",
      "页脚内容和校标占位必须保留，其他主题设置不变。",
    ],
    action: "patch",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\begin{frame}{Algorithm flowchart}" },
      { file: "main.tex", value: "Footer content" },
      { file: "main.tex", value: "University logo" },
      {
        file: "main.tex",
        value: "Node A $\\rightarrow$ Node B $\\rightarrow$ Node C",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\begin{frame}{Algorithm flowchart}",
          "Footer content",
          "University logo",
          "Node A $\\rightarrow$ Node B $\\rightarrow$ Node C",
        ],
      },
      {
        type: "file_matches",
        file: "main.tex",
        pattern: "\\\\begin\\{minipage\\}\\{0\\.82\\\\linewidth\\}",
      },
      {
        type: "regex_count",
        file: "main.tex",
        pattern: "\\\\begin\\{frame\\}",
        count: 1,
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 7,
        oldText: String.raw`\fbox{\begin{minipage}{0.48\linewidth}
\centering Node A $\rightarrow$ Node B $\rightarrow$ Node C
\end{minipage}}`,
        newText: String.raw`\fbox{\begin{minipage}{0.82\linewidth}
\centering Node A $\rightarrow$ Node B $\rightarrow$ Node C
\end{minipage}}`,
      },
    ],
    oracleResponse:
      "已在原有演示页内放大流程图占位，保留全部节点、校标和页脚，没有新增页面。",
    graderMutations: [
      {
        mutation_id: "流程图仍然过小",
        description: "流程图占位仍使用原来的窄宽度，投影时节点不可读。",
        patches: [
          {
            file: "main.tex",
            line: 7,
            oldText: String.raw`0.48\linewidth`,
            newText: String.raw`0.42\linewidth`,
          },
        ],
      },
      {
        mutation_id: "页脚被移除",
        description: "放大流程图时删除了演示页页脚内容。",
        patches: [
          {
            file: "main.tex",
            line: 2,
            oldText: "Footer content",
            newText: "Removed footer",
          },
        ],
      },
    ],
    tags: ["演示文稿", "流程图", "可读性", "页脚"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.030",
    caseSlug: "appendix-table-reference",
    category: "附录资源路径与表格引用",
    capabilities: ["C3", "C4", "C6"],
    difficulty: "D3",
    factors: ["跨文件引用", "附录路径核对", "标签唯一性"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{hyperref}
\begin{document}
\section{Results}
The detailed measurements are in Table~\ref{tab:appendix-data}.
\input{appendix-data}
\end{document}
`,
      },
      {
        path: "appendix-data.tex",
        content: String.raw`\appendix
\section{Data}
\begin{table}[h]
\centering
\caption{Appendix measurements}
\label{tab:appendix_data}
\begin{tabular}{lr}
Sample & Value \\
A & 12.4 \\
B & 15.8
\end{tabular}
\end{table}
`,
      },
    ],
    interactionFacts: [
      "附录数据文件是 appendix-data.tex，主文件的输入路径已经存在且不能改名。",
      "正文引用当前使用连字符标签，附录表实际标签使用下划线，必须修正为同一个标签。",
      "附录表标题、数据和正文分析原文必须保持不变。",
    ],
    action: "patch",
    scale: "multi-small",
    pressure: "many-files",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{appendix-data}" },
      { file: "appendix-data.tex", value: "\\label{tab:appendix_data}" },
      { file: "appendix-data.tex", value: "A & 12.4" },
      { file: "appendix-data.tex", value: "B & 15.8" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\ref{tab:appendix_data}",
          "\\input{appendix-data}",
          "The detailed measurements are in",
        ],
      },
      {
        type: "file_contains",
        file: "appendix-data.tex",
        values: [
          "\\label{tab:appendix_data}",
          "Appendix measurements",
          "A & 12.4",
          "B & 15.8",
        ],
      },
      {
        type: "file_not_contains",
        file: "main.tex",
        values: ["\\ref{tab:appendix-data}"],
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 5,
        oldText: String.raw`\ref{tab:appendix-data}`,
        newText: String.raw`\ref{tab:appendix_data}`,
      },
    ],
    oracleResponse:
      "已核对 appendix-data.tex 的资源路径和标签，将正文引用改为附录表的实际标签，保留表格数据。",
    graderMutations: [
      {
        mutation_id: "正文仍引用错误标签",
        description: "正文继续使用连字符标签，附录表引用仍会显示问号。",
        patches: [
          {
            file: "main.tex",
            line: 5,
            oldText: String.raw`\ref{tab:appendix-data}`,
            newText: String.raw`\ref{tab:missing-data}`,
          },
        ],
      },
      {
        mutation_id: "附录标签被改名",
        description: "附录表标签被改成未约定的名称，跨文件引用无法对应。",
        patches: [
          {
            file: "appendix-data.tex",
            line: 6,
            oldText: String.raw`\label{tab:appendix_data}`,
            newText: String.raw`\label{tab:appendix_old}`,
          },
        ],
      },
    ],
    tags: ["附录", "资源路径", "交叉引用", "多文件"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.037",
    caseSlug: "main-supplement-organization",
    category: "主文与补充材料项目组织",
    capabilities: ["C3", "C4", "C10"],
    difficulty: "D4",
    factors: ["主文入口隔离", "补充材料独立编译", "共享配置保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\input{shared}
\begin{document}
\section{Main paper}
\input{figures/results}
\input{supplement-body}
\end{document}
`,
      },
      {
        path: "supplement.tex",
        content: String.raw`\documentclass{article}
\input{shared}
\begin{document}
\input{supplement-body}
\end{document}
`,
      },
      {
        path: "supplement-body.tex",
        content: String.raw`\section{Supplementary material}
The supplementary measurements remain available as a separate document.
\input{tables/supp-data}
`,
      },
      {
        path: "shared.tex",
        content: String.raw`\newcommand{\ProjectName}{Joint Research Project}
`,
      },
      {
        path: "figures/results.tex",
        content: String.raw`\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.6\linewidth}{0pt}}
\caption{Main paper results}
\label{fig:main-results}
\end{figure}
`,
      },
      {
        path: "tables/supp-data.tex",
        content: String.raw`\begin{table}[h]
\centering
\caption{Supplementary data}
\begin{tabular}{lr}
Item & Value \\
X & 1.2 \\
Y & 3.4
\end{tabular}
\end{table}
`,
      },
    ],
    interactionFacts: [
      "main.tex 是主论文入口；supplement.tex 必须继续作为独立可编译入口。",
      "当前主论文误输入 supplement-body.tex；主论文应只保留正文和 figures/results。",
      "shared.tex、图表内容和补充材料文件都必须保留，不能删除或重命名。",
    ],
    action: "patch",
    scale: "multi-long",
    pressure: "combined",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\documentclass{article}" },
      { file: "main.tex", value: "\\input{shared}" },
      { file: "main.tex", value: "\\input{figures/results}" },
      { file: "supplement.tex", value: "\\input{supplement-body}" },
      {
        file: "shared.tex",
        value: "\\newcommand{\\ProjectName}{Joint Research Project}",
      },
      { file: "figures/results.tex", value: "\\label{fig:main-results}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\documentclass{article}",
          "\\input{shared}",
          "\\input{figures/results}",
          "\\ifdefined\\IncludeSupplement",
          "\\input{supplement-body}",
        ],
      },
      {
        type: "file_matches",
        file: "main.tex",
        pattern:
          "\\\\ifdefined\\\\IncludeSupplement\\s*\\\\input\\{supplement-body\\}",
      },
      {
        type: "file_contains",
        file: "supplement.tex",
        values: ["\\input{shared}", "\\input{supplement-body}"],
      },
      {
        type: "file_contains",
        file: "shared.tex",
        values: ["\\newcommand{\\ProjectName}{Joint Research Project}"],
      },
      {
        type: "file_contains",
        file: "figures/results.tex",
        values: ["\\label{fig:main-results}"],
      },
      { type: "file_unchanged", file: "figures/results.tex" },
      { type: "file_unchanged", file: "tables/supp-data.tex" },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 6,
        oldText: String.raw`\input{supplement-body}`,
        newText: String.raw`\ifdefined\IncludeSupplement
\input{supplement-body}
\fi`,
      },
    ],
    oracleResponse:
      "已隔离主论文入口与补充材料入口：主文默认不载入补充正文，supplement.tex 仍可独立编译，共享配置和图表均保留。",
    graderMutations: [
      {
        mutation_id: "主文仍直接载入补充材料",
        description: "主论文继续无条件输入补充正文，主文与补充材料没有隔离。",
        patches: [
          {
            file: "main.tex",
            line: 6,
            oldText: String.raw`\input{supplement-body}`,
            newText: String.raw`\input{supplement-body}`,
          },
        ],
      },
      {
        mutation_id: "共享配置路径越界",
        description: "主文改为不存在的共享配置路径，项目组织和编译都会失效。",
        patches: [
          {
            file: "main.tex",
            line: 2,
            oldText: String.raw`\input{shared}`,
            newText: String.raw`\input{missing-shared}`,
          },
        ],
      },
    ],
    tags: ["主文", "补充材料", "项目组织", "共享配置", "多文件"],
    promptForm: "中文直接请求",
  }),
];
