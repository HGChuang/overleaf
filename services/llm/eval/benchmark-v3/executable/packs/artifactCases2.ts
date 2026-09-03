import { makeV3Case } from "../caseFactory.js";
import type { V3ExecutableCase } from "../types.js";

const compileGrader = {
  type: "compile" as const,
  status: "success" as const,
  max_errors: 0,
  max_warnings: 20,
};

export const V3_ARTIFACT_CASES_2: V3ExecutableCase[] = [
  makeV3Case({
    candidateId: "v3.artifact.003",
    caseSlug: "result-figure-near-analysis",
    category: "结果图位置与目标定位",
    capabilities: ["C1", "C3", "C4", "C6", "C7"],
    difficulty: "D3",
    factors: ["重复图锚点定位", "跨文件范围保护", "浮动位置约束"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{sections/analysis}
\end{document}
`,
      },
      {
        path: "sections/analysis.tex",
        content: String.raw`\section{Analysis}
The accuracy analysis appears before the result figures.
\begin{figure}[t]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.65\linewidth}{0pt}}
\caption{Accuracy results}
\label{fig:accuracy}
\end{figure}
The ablation analysis is a separate paragraph.
\begin{figure}[b]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.65\linewidth}{0pt}}
\caption{Ablation results}
\label{fig:ablation}
\end{figure}
\section{Conclusion}
The conclusion follows both analyses.
`,
      },
    ],
    interactionFacts: [
      "项目中有两个结果图锚点；如果首轮询问目标，应选择 sections/analysis.tex 中的准确率图。",
      "准确率图的标签是 fig:accuracy，消融图 fig:ablation 必须保持不变。",
      "图应靠近引用它的分析段落，不要求绝对定位，也不能移动到结论之后。",
    ],
    action: "clarify",
    dynamicUser: true,
    maxUserTurns: 2,
    scale: "multi-small",
    pressure: "repeated-anchors",
    initialCompile: "success",
    compileMode: "required-after-apply",
    semanticGrading: {
      type: "content_semantics",
      files: ["sections/analysis.tex", "main.tex"],
      criteria: [
        {
          id: "clarifies_target_figure",
          description: "在修改前澄清应移动哪一个结果图，而不是直接猜测修改。",
        },
        {
          id: "accuracy_figure_near_analysis",
          description:
            "用户确认后，准确率图仍位于对应分析段落附近且没有移动到结论之后。",
        },
        {
          id: "ablation_figure_preserved",
          description: "消融图的位置、caption 和 label 语义保持不变。",
        },
      ],
    },
    protectedInvariants: [
      { file: "main.tex", value: "\\input{sections/analysis}" },
      {
        file: "sections/analysis.tex",
        value: "The accuracy analysis appears before the result figures.",
      },
      { file: "sections/analysis.tex", value: "\\label{fig:accuracy}" },
      { file: "sections/analysis.tex", value: "\\label{fig:ablation}" },
      { file: "sections/analysis.tex", value: "\\section{Conclusion}" },
    ],
    graders: [
      { type: "first_response_no_patch" },
      {
        type: "response_contains_all",
        response_index: 0,
        values: ["澄清", "准确率"],
      },
      {
        type: "response_contains_all",
        response_index: 1,
        values: ["准确率图", "分析段落"],
      },
      { type: "user_turns", min: 2, max: 2 },
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{sections/analysis}"],
      },
      {
        type: "file_contains",
        file: "sections/analysis.tex",
        values: [
          "The accuracy analysis appears before the result figures.",
          "\\begin{figure}[!htb]",
          "\\caption{Accuracy results}",
          "\\label{fig:accuracy}",
          "\\label{fig:ablation}",
          "\\section{Conclusion}",
        ],
      },
      { type: "file_unchanged", file: "main.tex" },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "sections/analysis.tex",
        line: 3,
        oldText: String.raw`\begin{figure}[t]`,
        newText: String.raw`\begin{figure}[!htb]`,
      },
    ],
    oracleResponses: [
      "我发现项目中有两个结果图，需要先澄清你指的是哪一张；请确认是准确率图。",
      "已将准确率图留在对应分析段落附近，保留消融图、图题和全部引用。",
    ],
    graderMutations: [
      {
        mutation_id: "目标图选择错误",
        description: "修改了消融图的位置，却没有处理用户确认的准确率图。",
        patches: [
          {
            file: "sections/analysis.tex",
            line: 10,
            oldText: String.raw`\begin{figure}[t]`,
            newText: String.raw`\begin{figure}[b]`,
          },
        ],
      },
      {
        mutation_id: "准确率图位置仍不合适",
        description:
          "准确率图仍被放入只能在浮动页显示的位置，无法保证靠近分析段落。",
        patches: [
          {
            file: "sections/analysis.tex",
            line: 3,
            oldText: String.raw`\begin{figure}[t]`,
            newText: String.raw`\begin{figure}[p]`,
          },
        ],
      },
    ],
    tags: ["结果图", "目标定位", "浮动位置", "重复锚点"],
    promptForm: "中文多轮澄清请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.011",
    caseSlug: "multilevel-performance-table",
    category: "多级表头与最佳结果标记",
    capabilities: ["C2", "C3", "C4", "C6", "C7"],
    difficulty: "D3",
    factors: ["多级表头结构", "数据集顺序保护", "最佳结果加粗"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{tables/performance}
\end{document}
`,
      },
      {
        path: "tables/performance.tex",
        content: String.raw`\begin{table}[h]
\centering
\caption{Model performance}
\label{tab:performance}
\begin{tabular}{lrrrrrr}
Model & \multicolumn{2}{c}{Dataset A} & \multicolumn{2}{c}{Dataset B} & \multicolumn{2}{c}{Dataset C} \\
 & Accuracy & Recall & Accuracy & Recall & Accuracy & Recall \\
Alpha & 0.91 & 0.88 & 0.86 & 0.84 & 0.90 & 0.87 \\
Beta & 0.89 & 0.90 & 0.88 & 0.85 & 0.88 & 0.89
\end{tabular}
\end{table}
`,
      },
    ],
    interactionFacts: [
      "tables/performance.tex 中有三个数据集，每个数据集都必须同时显示准确率和召回率。",
      "数据集顺序固定为 Dataset A、Dataset B、Dataset C；模型行 Alpha、Beta 不能删除。",
      "每列最佳结果需要加粗，不能改变任何原始数值。",
    ],
    action: "patch",
    scale: "multi-small",
    pressure: "many-files",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{tables/performance}" },
      { file: "tables/performance.tex", value: "\\caption{Model performance}" },
      { file: "tables/performance.tex", value: "\\label{tab:performance}" },
      { file: "tables/performance.tex", value: "Alpha &" },
      { file: "tables/performance.tex", value: "Beta &" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{tables/performance}"],
      },
      {
        type: "file_contains",
        file: "tables/performance.tex",
        values: [
          "\\caption{Model performance}",
          "\\label{tab:performance}",
          "Dataset A",
          "Dataset B",
          "Dataset C",
          "Alpha",
          "Alpha &",
          "Beta",
          "Beta &",
          "\\textbf{0.91}",
          "\\textbf{0.90}",
          "\\textbf{0.88}",
        ],
      },
      {
        type: "file_matches",
        file: "tables/performance.tex",
        pattern: "Dataset A[\\s\\S]*Dataset B[\\s\\S]*Dataset C",
      },
      {
        type: "regex_count",
        file: "tables/performance.tex",
        pattern: "\\\\textbf\\{",
        count: 6,
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "tables/performance.tex",
        line: 5,
        oldText: String.raw`\begin{tabular}{lrrrrrr}
Model & \multicolumn{2}{c}{Dataset A} & \multicolumn{2}{c}{Dataset B} & \multicolumn{2}{c}{Dataset C} \\
 & Accuracy & Recall & Accuracy & Recall & Accuracy & Recall \\
Alpha & 0.91 & 0.88 & 0.86 & 0.84 & 0.90 & 0.87 \\
Beta & 0.89 & 0.90 & 0.88 & 0.85 & 0.88 & 0.89
\end{tabular}`,
        newText: String.raw`\begin{tabular}{lrrrrrr}
Model & \multicolumn{2}{c}{Dataset A} & \multicolumn{2}{c}{Dataset B} & \multicolumn{2}{c}{Dataset C} \\
 & Accuracy & Recall & Accuracy & Recall & Accuracy & Recall \\
Alpha & \textbf{0.91} & 0.88 & 0.86 & 0.84 & \textbf{0.90} & 0.87 \\
Beta & 0.89 & \textbf{0.90} & \textbf{0.88} & \textbf{0.85} & 0.88 & \textbf{0.89}
\end{tabular}`,
      },
    ],
    oracleResponse:
      "已整理三个数据集的多级表头，保留全部模型与指标，并对每列最佳结果加粗。",
    graderMutations: [
      {
        mutation_id: "数据集被删减",
        description: "调整多级表头时漏掉 Dataset C，数据集关系不再完整。",
        patches: [
          {
            file: "tables/performance.tex",
            line: 5,
            oldText: String.raw`\begin{tabular}{lrrrrrr}
Model & \multicolumn{2}{c}{Dataset A} & \multicolumn{2}{c}{Dataset B} & \multicolumn{2}{c}{Dataset C} \\
 & Accuracy & Recall & Accuracy & Recall & Accuracy & Recall \\
Alpha & 0.91 & 0.88 & 0.86 & 0.84 & 0.90 & 0.87 \\
Beta & 0.89 & 0.90 & 0.88 & 0.85 & 0.88 & 0.89
\end{tabular}`,
            newText: String.raw`\begin{tabular}{lrrrr}
Model & \multicolumn{2}{c}{Dataset A} & \multicolumn{2}{c}{Dataset B} \\
 & Accuracy & Recall & Accuracy & Recall \\
Alpha & 0.91 & 0.88 & 0.86 & 0.84 \\
Beta & 0.89 & 0.90 & 0.88 & 0.85
\end{tabular}`,
          },
        ],
      },
      {
        mutation_id: "最佳结果未加粗",
        description: "保留多级表头和数据，却取消了最佳结果的加粗标记。",
        patches: [
          {
            file: "tables/performance.tex",
            line: 5,
            oldText: String.raw`\begin{tabular}{lrrrrrr}
Model & \multicolumn{2}{c}{Dataset A} & \multicolumn{2}{c}{Dataset B} & \multicolumn{2}{c}{Dataset C} \\
 & Accuracy & Recall & Accuracy & Recall & Accuracy & Recall \\
Alpha & 0.91 & 0.88 & 0.86 & 0.84 & 0.90 & 0.87 \\
Beta & 0.89 & 0.90 & 0.88 & 0.85 & 0.88 & 0.89
\end{tabular}`,
            newText: String.raw`\begin{tabular}{lrrrrrr}
Model & \multicolumn{2}{c}{Dataset A} & \multicolumn{2}{c}{Dataset B} & \multicolumn{2}{c}{Dataset C} \\
 & Accuracy & Recall & Accuracy & Recall & Accuracy & Recall \\
Alpha & 0.91 & 0.88 & 0.86 & 0.84 & 0.90 & 0.87 \\
Beta & 0.89 & 0.90 & 0.88 & 0.85 & 0.88 & 0.89
\end{tabular}`,
          },
        ],
      },
    ],
    tags: ["多级表头", "性能表", "最佳结果", "数据集"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.017",
    caseSlug: "beamer-reference-overflow",
    category: "演示文稿参考文献分页",
    capabilities: ["C2", "C6", "C7"],
    difficulty: "D4",
    factors: ["演示页分页", "文献完整性", "主题页脚保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{beamer}
\setbeamertemplate{footline}{\hfill\scriptsize Footer content\hfill\vskip2pt}
\begin{document}
\begin{frame}{References}
\scriptsize
\begin{itemize}
\item Reference A: a long bibliography entry about experimental design.
\item Reference B: a long bibliography entry about model evaluation.
\item Reference C: a long bibliography entry about reproducibility.
\item Reference D: a long bibliography entry about statistical analysis.
\item Reference E: a long bibliography entry about document systems.
\end{itemize}
\end{frame}
\end{document}
`,
      },
    ],
    interactionFacts: [
      "参考文献页的五条文献一条都不能删除，可使用连续两页显示。",
      "页脚 Footer content 和现有主题设置必须保持不变。",
      "只调整这一页的分页方式，不新增空白内容。",
    ],
    action: "patch",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "Footer content" },
      { file: "main.tex", value: "Reference A:" },
      { file: "main.tex", value: "Reference B:" },
      { file: "main.tex", value: "Reference C:" },
      { file: "main.tex", value: "Reference D:" },
      { file: "main.tex", value: "Reference E:" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\begin{frame}[allowframebreaks]{References}",
          "Footer content",
          "Reference A:",
          "Reference B:",
          "Reference C:",
          "Reference D:",
          "Reference E:",
        ],
      },
      {
        type: "regex_count",
        file: "main.tex",
        pattern: "Reference [A-E]:",
        count: 5,
      },
      {
        type: "regex_count",
        file: "main.tex",
        pattern: "\\\\begin\\{frame",
        count: 1,
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 4,
        oldText: String.raw`\begin{frame}{References}`,
        newText: String.raw`\begin{frame}[allowframebreaks]{References}`,
      },
    ],
    oracleResponse:
      "已将参考文献页改为允许连续分页，五条文献和主题页脚均完整保留。",
    graderMutations: [
      {
        mutation_id: "参考文献被删减",
        description: "分页时删除了最后一条文献，交付页不再包含完整列表。",
        patches: [
          {
            file: "main.tex",
            line: 10,
            oldText:
              "Reference E: a long bibliography entry about document systems.",
            newText: "Reference X: omitted bibliography entry.",
          },
        ],
      },
      {
        mutation_id: "主题页脚被改变",
        description: "处理分页时替换了原有页脚内容，破坏演示主题约束。",
        patches: [
          {
            file: "main.tex",
            line: 2,
            oldText: "Footer content",
            newText: "Changed footer",
          },
        ],
      },
    ],
    tags: ["演示文稿", "参考文献", "连续分页", "页脚"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.018",
    caseSlug: "workshop-slide-columns",
    category: "演示文稿图片与右栏避让",
    capabilities: ["C2", "C4", "C6", "C7", "C10"],
    difficulty: "D4",
    factors: ["重复页面定位", "双栏空间分配", "要点完整性"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{beamer}
\begin{document}
\input{slides/workshop}
\end{document}
`,
      },
      {
        path: "slides/workshop.tex",
        content: String.raw`\begin{frame}{Overview}
\begin{columns}
\begin{column}{0.62\textwidth}
\fbox{\rule{0pt}{3cm}\rule{0.62\linewidth}{0pt}}
\end{column}
\begin{column}{0.42\textwidth}
Overview note.
\end{column}
\end{columns}
\end{frame}

\begin{frame}{Workshop}
\begin{columns}
\begin{column}{0.62\textwidth}
\fbox{\rule{0pt}{3cm}\rule{0.62\linewidth}{0pt}}
\end{column}
\begin{column}{0.42\textwidth}
\begin{itemize}
\item Point one remains visible.
\item Point two remains visible.
\item Point three remains visible.
\item Point four remains visible.
\end{itemize}
\end{column}
\end{columns}
\end{frame}
`,
      },
    ],
    interactionFacts: [
      "项目有 Overview 和 Workshop 两页，首轮若询问目标页面，应选择 Workshop 页。",
      "workshop.jpg 用 fbox 占位，Workshop 页右栏的四条要点必须完整可见。",
      "只调整 Workshop 页的左右栏宽度，标题、图片和四条要点不能删除或变形。",
    ],
    action: "clarify",
    dynamicUser: true,
    maxUserTurns: 2,
    scale: "multi-small",
    pressure: "repeated-anchors",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{slides/workshop}" },
      { file: "slides/workshop.tex", value: "\\begin{frame}{Overview}" },
      { file: "slides/workshop.tex", value: "\\begin{frame}{Workshop}" },
      { file: "slides/workshop.tex", value: "Point one remains visible." },
      { file: "slides/workshop.tex", value: "Point four remains visible." },
    ],
    graders: [
      { type: "first_response_no_patch" },
      {
        type: "response_contains_any",
        response_index: 0,
        values: ["哪一页", "Workshop"],
      },
      {
        type: "response_contains_all",
        response_index: 1,
        values: ["Workshop", "右栏"],
      },
      { type: "user_turns", min: 2, max: 2 },
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{slides/workshop}"],
      },
      {
        type: "file_contains",
        file: "slides/workshop.tex",
        values: [
          "\\begin{frame}{Overview}",
          "\\begin{frame}{Workshop}",
          "Point one remains visible.",
          "Point two remains visible.",
          "Point three remains visible.",
          "Point four remains visible.",
          "0.45\\textwidth",
          "0.48\\textwidth",
        ],
      },
      {
        type: "file_matches",
        file: "slides/workshop.tex",
        pattern:
          "\\\\begin\\{frame\\}\\{Overview\\}[\\s\\S]*\\\\begin\\{frame\\}\\{Workshop\\}",
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "slides/workshop.tex",
        line: 13,
        oldText: String.raw`\begin{column}{0.62\textwidth}
\fbox{\rule{0pt}{3cm}\rule{0.62\linewidth}{0pt}}
\end{column}
\begin{column}{0.42\textwidth}`,
        newText: String.raw`\begin{column}{0.45\textwidth}
\fbox{\rule{0pt}{3cm}\rule{0.45\linewidth}{0pt}}
\end{column}
\begin{column}{0.48\textwidth}`,
      },
    ],
    oracleResponses: [
      "项目中有两页使用相同的栏布局，请确认需要处理的是 Workshop 页。",
      "已调整 Workshop 页的图片栏和右栏宽度，四条要点与页面标题均保持可见。",
    ],
    graderMutations: [
      {
        mutation_id: "图片栏仍然遮挡右栏",
        description: "Workshop 页图片栏仍使用过宽尺寸，右栏空间不足。",
        patches: [
          {
            file: "slides/workshop.tex",
            line: 13,
            oldText: String.raw`\begin{column}{0.62\textwidth}`,
            newText: String.raw`\begin{column}{0.58\textwidth}`,
          },
        ],
      },
      {
        mutation_id: "右栏要点被删减",
        description: "调整栏宽时删除了第四条培训要点。",
        patches: [
          {
            file: "slides/workshop.tex",
            line: 25,
            oldText: "Point four remains visible.",
            newText: "Point four omitted.",
          },
        ],
      },
    ],
    tags: ["演示文稿", "图片避让", "右栏", "多页面"],
    promptForm: "中文多轮澄清请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.020",
    caseSlug: "appendix-header-short-mark",
    category: "附录长标题与页眉短显示",
    capabilities: ["C3", "C4", "C6", "C7"],
    difficulty: "D3",
    factors: ["跨文件标题定位", "页眉溢出保护", "完整标题保留"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhead[L]{Research report}
\fancyhead[R]{\leftmark}
\begin{document}
\input{appendix}
\end{document}
`,
      },
      {
        path: "appendix.tex",
        content: String.raw`\appendix
\section{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}
\markboth{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}
The complete appendix title must remain in the section heading and table of contents.
`,
      },
    ],
    interactionFacts: [
      "完整附录标题必须保留在章节标题和目录中，不能截断或改写。",
      "只允许为页眉设置短显示文本 Appendix Data，页边距和正文样式不变。",
      "目标文件是 appendix.tex，主文件的输入关系必须保持有效。",
    ],
    action: "patch",
    scale: "multi-small",
    pressure: "many-files",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{appendix}" },
      {
        file: "appendix.tex",
        value:
          "\\section{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}",
      },
      {
        file: "appendix.tex",
        value:
          "The complete appendix title must remain in the section heading and table of contents.",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{appendix}"],
      },
      {
        type: "file_contains",
        file: "appendix.tex",
        values: [
          "\\section{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}",
          "\\markboth{Appendix Data}{Appendix Data}",
          "The complete appendix title must remain in the section heading and table of contents.",
        ],
      },
      {
        type: "file_not_contains",
        file: "appendix.tex",
        values: [
          "\\markboth{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}",
        ],
      },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "appendix.tex",
        line: 3,
        oldText: String.raw`\markboth{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}`,
        newText: String.raw`\markboth{Appendix Data}{Appendix Data}`,
      },
    ],
    oracleResponse:
      "已保留 appendix.tex 的完整附录标题，并将页眉改为短显示文本 Appendix Data，正文和目录关系不变。",
    graderMutations: [
      {
        mutation_id: "完整标题被截断",
        description: "为避免页眉溢出而截断了附录章节标题，目录信息不完整。",
        patches: [
          {
            file: "appendix.tex",
            line: 2,
            oldText: String.raw`\section{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}`,
            newText: String.raw`\section{A Very Long Appendix Title}`,
          },
        ],
      },
      {
        mutation_id: "页眉仍使用完整长标题",
        description: "页眉没有设置短显示文本，长标题仍可能溢出页眉区域。",
        patches: [
          {
            file: "appendix.tex",
            line: 3,
            oldText: String.raw`\markboth{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}{A Very Long Appendix Title About Reproducibility Measurements and Supplementary Evidence}`,
            newText: String.raw`\markboth{Full Appendix Header}{Full Appendix Header}`,
          },
        ],
      },
    ],
    tags: ["附录", "长标题", "页眉", "短显示文本"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.023",
    caseSlug: "duplicate-main-entry-refusal",
    category: "主文入口识别与不可行操作",
    capabilities: ["C1", "C4", "C7", "C9", "C10"],
    difficulty: "D4",
    factors: ["入口文件发现", "删除操作边界", "备份文件保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{sections/lecture}
\end{document}
`,
      },
      {
        path: "old_main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
Backup entry; do not use as the current lecture.
\end{document}
`,
      },
      {
        path: "sections/lecture.tex",
        content: String.raw`\section{Current lecture}
The current lecture content remains in this section file.
\input{sections/exercises}
`,
      },
      {
        path: "sections/exercises.tex",
        content: String.raw`Exercises remain available for the current lecture.
`,
      },
    ],
    interactionFacts: [
      "只读扫描显示 main.tex 是当前入口，old_main.tex 明确标记为备份，章节文件均由 main.tex 引用。",
      "清理重复入口需要删除 old_main.tex，但 H1 replacement-only 不支持真实文件删除。",
      "应保留备份和章节文件，不得伪装成已经完成删除。",
    ],
    action: "refuse",
    maxUserTurns: 1,
    scale: "multi-small",
    pressure: "many-files",
    initialCompile: "success",
    compileMode: "forbidden",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{sections/lecture}" },
      {
        file: "old_main.tex",
        value: "Backup entry; do not use as the current lecture.",
      },
      { file: "sections/lecture.tex", value: "\\input{sections/exercises}" },
      {
        file: "sections/exercises.tex",
        value: "Exercises remain available for the current lecture.",
      },
    ],
    graders: [
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{sections/lecture}"],
      },
      {
        type: "file_contains",
        file: "old_main.tex",
        values: ["Backup entry; do not use as the current lecture."],
      },
      {
        type: "file_contains",
        file: "sections/lecture.tex",
        values: ["\\input{sections/exercises}"],
      },
      {
        type: "file_contains",
        file: "sections/exercises.tex",
        values: ["Exercises remain available for the current lecture."],
      },
      {
        type: "response_contains_all",
        values: ["不能删除", "old_main.tex", "备份"],
      },
    ],
    oracleResponse:
      "已确认 main.tex 是当前主文档；当前 H1 只能替换文件内容，不能删除 old_main.tex，因此保留备份并未提交修改。",
    graderMutations: [
      {
        mutation_id: "备份内容被误改",
        description: "清理入口时改写了 old_main.tex 的备份说明，破坏历史备份。",
        patches: [
          {
            file: "old_main.tex",
            line: 3,
            oldText: "Backup entry; do not use as the current lecture.",
            newText: "Changed backup entry.",
          },
        ],
        patch_count: 1,
      },
      {
        mutation_id: "主文误指向备份",
        description:
          "处理入口时把 main.tex 改为输入 old_main.tex，主文将使用旧版本。",
        patches: [
          {
            file: "main.tex",
            line: 3,
            oldText: String.raw`\input{sections/lecture}`,
            newText: String.raw`\input{old_main}`,
          },
        ],
        patch_count: 1,
      },
    ],
    tags: ["主文入口", "目标发现", "备份保护", "不可行操作"],
    promptForm: "中文只读判断请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.025",
    caseSlug: "answer-entry-selection",
    category: "答案入口与草稿保护",
    capabilities: ["C3", "C4", "C6", "C7"],
    difficulty: "D3",
    factors: ["主文件入口替换", "草稿保留", "图片路径保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\section{Final submission}
The main document must show the complete answer.
\input{draft}
\end{document}
`,
      },
      {
        path: "draft.tex",
        content: String.raw`\section{Draft version}
Draft reasoning remains available for later reference.
\input{figures/diagram}
`,
      },
      {
        path: "answer.tex",
        content: String.raw`\section{Complete answer version}
The complete answer includes the verified derivation.
\input{figures/diagram}
`,
      },
      {
        path: "figures/diagram.tex",
        content: String.raw`\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.55\linewidth}{0pt}}
\caption{Answer diagram placeholder}
\label{fig:answer-diagram}
\end{figure}
`,
      },
    ],
    interactionFacts: [
      "draft.tex 必须保留供以后参考，answer.tex 是完整版本，主文件应显示 answer.tex。",
      "figures/diagram.tex 不改名、不移动，草稿和答案都继续引用同一占位图。",
      "只替换 main.tex 的输入目标，不改正文、草稿、答案或图片内容。",
    ],
    action: "patch",
    scale: "multi-small",
    pressure: "many-files",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\documentclass{article}" },
      {
        file: "main.tex",
        value: "The main document must show the complete answer.",
      },
      {
        file: "draft.tex",
        value: "Draft reasoning remains available for later reference.",
      },
      {
        file: "answer.tex",
        value: "The complete answer includes the verified derivation.",
      },
      { file: "figures/diagram.tex", value: "\\label{fig:answer-diagram}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\documentclass{article}",
          "The main document must show the complete answer.",
          "\\input{answer}",
        ],
      },
      {
        type: "file_not_contains",
        file: "main.tex",
        values: ["\\input{draft}"],
      },
      {
        type: "file_contains",
        file: "draft.tex",
        values: ["Draft reasoning remains available for later reference."],
      },
      {
        type: "file_contains",
        file: "answer.tex",
        values: ["The complete answer includes the verified derivation."],
      },
      {
        type: "file_contains",
        file: "figures/diagram.tex",
        values: ["\\label{fig:answer-diagram}"],
      },
      { type: "file_unchanged", file: "draft.tex" },
      { type: "file_unchanged", file: "answer.tex" },
      { type: "file_unchanged", file: "figures/diagram.tex" },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 5,
        oldText: String.raw`\input{draft}`,
        newText: String.raw`\input{answer}`,
      },
    ],
    oracleResponse:
      "已将 main.tex 切换到完整的 answer.tex，并保留 draft.tex、图片目录和两份正文内容不变。",
    graderMutations: [
      {
        mutation_id: "主文仍显示草稿",
        description:
          "入口调整后仍然输入 draft.tex，交付文档没有切换到完整答案。",
        patches: [
          {
            file: "main.tex",
            line: 5,
            oldText: String.raw`\input{draft}`,
            newText: String.raw`\input{draft}`,
          },
        ],
      },
      {
        mutation_id: "答案正文被越界改动",
        description: "切换入口时改写了 answer.tex 的完整答案内容。",
        patches: [
          {
            file: "answer.tex",
            line: 2,
            oldText: "The complete answer includes the verified derivation.",
            newText: "The answer is incomplete.",
          },
        ],
      },
    ],
    tags: ["答案入口", "草稿", "图片路径", "多文件"],
    promptForm: "中文直接请求",
  }),

  makeV3Case({
    candidateId: "v3.artifact.029",
    caseSlug: "chemistry-structure-reference",
    category: "结构图交叉引用与编号",
    capabilities: ["C3", "C4", "C6", "C7", "C10"],
    difficulty: "D4",
    factors: ["跨文件标签核对", "引用顺序保护", "反应式内容保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{sections/results}
\end{document}
`,
      },
      {
        path: "sections/results.tex",
        content: String.raw`\section{Experimental results}
The first reaction uses structure~\ref{fig:structure-b}.
The second reaction uses structure~\ref{fig:structure-a}.
Reaction equation: A $\rightarrow$ B.
\input{figures/structures}
`,
      },
      {
        path: "figures/structures.tex",
        content: String.raw`\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.55\linewidth}{0pt}}
\caption{Structure A}
\label{fig:structure-a}
\end{figure}
\begin{figure}[h]
\centering
\fbox{\rule{0pt}{2cm}\rule{0.55\linewidth}{0pt}}
\caption{Structure B}
\label{fig:structure-b}
\end{figure}
`,
      },
    ],
    interactionFacts: [
      "structures.tex 中结构图顺序和文件名已经确认，Structure A 对应 fig:structure-a，Structure B 对应 fig:structure-b。",
      "results.tex 的两段实验描述应分别引用 A、B；反应式和实验步骤不能改写。",
      "需要核对所有跨文件标签，不能通过改名或删除图片来回避引用问题。",
    ],
    action: "patch",
    scale: "multi-small",
    pressure: "combined",
    initialCompile: "success",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "main.tex", value: "\\input{sections/results}" },
      {
        file: "sections/results.tex",
        value: "Reaction equation: A $\\rightarrow$ B.",
      },
      { file: "sections/results.tex", value: "\\input{figures/structures}" },
      { file: "figures/structures.tex", value: "\\label{fig:structure-a}" },
      { file: "figures/structures.tex", value: "\\label{fig:structure-b}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{sections/results}"],
      },
      {
        type: "file_contains",
        file: "sections/results.tex",
        values: [
          "The first reaction uses structure~\\ref{fig:structure-a}.",
          "The second reaction uses structure~\\ref{fig:structure-b}.",
          "Reaction equation: A $\\rightarrow$ B.",
          "\\input{figures/structures}",
        ],
      },
      {
        type: "file_contains",
        file: "figures/structures.tex",
        values: [
          "\\label{fig:structure-a}",
          "\\label{fig:structure-b}",
          "Structure A",
          "Structure B",
        ],
      },
      { type: "file_unchanged", file: "figures/structures.tex" },
      compileGrader,
    ],
    oraclePatches: [
      {
        file: "sections/results.tex",
        line: 2,
        oldText: String.raw`The first reaction uses structure~\ref{fig:structure-b}.
The second reaction uses structure~\ref{fig:structure-a}.`,
        newText: String.raw`The first reaction uses structure~\ref{fig:structure-a}.
The second reaction uses structure~\ref{fig:structure-b}.`,
      },
    ],
    oracleResponse:
      "已核对 structures.tex 中的两个结构图标签，修正 results.tex 的引用顺序，并保留反应式、图片和实验说明。",
    graderMutations: [
      {
        mutation_id: "第一段仍引用错误结构图",
        description: "交叉引用检查不完整，第一段仍指向 Structure B。",
        patches: [
          {
            file: "sections/results.tex",
            line: 2,
            oldText: String.raw`\ref{fig:structure-b}`,
            newText: String.raw`\ref{fig:missing-structure}`,
          },
        ],
      },
      {
        mutation_id: "结构图标签被改名",
        description:
          "为修复引用而改写了已确认的 Structure A 标签，破坏图表编号。",
        patches: [
          {
            file: "figures/structures.tex",
            line: 6,
            oldText: String.raw`\label{fig:structure-a}`,
            newText: String.raw`\label{fig:structure-old}`,
          },
        ],
      },
    ],
    tags: ["结构图", "交叉引用", "标签编号", "反应式", "多文件"],
    promptForm: "中文直接请求",
  }),
];
