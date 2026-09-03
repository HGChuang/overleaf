import { makeV3Case } from "../caseFactory.js";
import type { V3ExecutableCase } from "../types.js";

export const V3_CONTENT_CASES_2: V3ExecutableCase[] = [
  makeV3Case({
    candidateId: "v3.content.005",
    caseSlug: "content-appendix-interview-translation",
    category: "附录与访谈翻译",
    capabilities: ["C1", "C2", "C4", "C7"],
    difficulty: "D3",
    factors: ["多文件定位", "问题编号保护", "表格与型号保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{CJKutf8}
\begin{document}
\begin{CJK*}{UTF8}{gbsn}
\input{appendix}
\input{interview}
\end{CJK*}
\end{document}
`,
      },
      {
        path: "appendix.tex",
        content: String.raw`\section{Appendix notes}
The device calibration note is retained for Model X200.
`,
      },
      {
        path: "interview.tex",
        content: String.raw`\section{Interview questions}
Question 1: How easy was the device to use?

Options: A. Very difficult; B. Difficult; C. Neutral; D. Easy; E. Very easy.
`,
      },
    ],
    interactionFacts: [
      "只翻译附录说明和访谈问题，正文文件不能修改。",
      "必须保留问题编号、选项标签、设备型号和中性语气。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    semanticGrading: {
      type: "content_semantics",
      files: ["appendix.tex", "interview.tex"],
      criteria: [
        {
          id: "translation_meaning_preserved",
          description:
            "附录说明和访谈问题的中文翻译保留英文原意，语气正式，不添加、遗漏或改变事实。",
        },
        {
          id: "translation_constraints_preserved",
          description:
            "保留问题编号、A-E 选项标签、Model X200 和表格/问题结构。",
        },
      ],
    },
    protectedInvariants: [
      { file: "interview.tex", value: "1" },
      { file: "interview.tex", value: "A." },
      { file: "appendix.tex", value: "Model X200" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["appendix.tex", "interview.tex"] },
      {
        type: "file_contains",
        file: "appendix.tex",
        values: ["附录校准说明保留设备型号 Model X200。", "Model X200"],
      },
      {
        type: "file_contains",
        file: "interview.tex",
        values: [
          "问题 1：设备使用起来有多容易？",
          "选项：A. 非常困难；B. 困难；C. 中性；D. 容易；E. 非常容易。",
          "1",
          "A.",
        ],
      },
      { type: "file_unchanged", file: "main.tex" },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "appendix.tex",
        line: 2,
        oldText: "The device calibration note is retained for Model X200.",
        newText: "附录校准说明保留设备型号 Model X200。",
      },
      {
        file: "interview.tex",
        line: 2,
        oldText:
          "Question 1: How easy was the device to use?\n\nOptions: A. Very difficult; B. Difficult; C. Neutral; D. Easy; E. Very easy.",
        newText:
          "问题 1：设备使用起来有多容易？\n\n选项：A. 非常困难；B. 困难；C. 中性；D. 容易；E. 非常容易。",
      },
    ],
    oracleResponse:
      "已仅翻译附录和访谈文件，保留问题编号、选项标签、Model X200 和中性语气；编译通过。",
    graderMutations: [
      {
        mutation_id: "改动正文入口",
        description: "翻译附录时误改主文件入口，超出用户授权范围。",
        patches: [
          {
            file: "main.tex",
            line: 4,
            oldText: String.raw`\input{appendix}`,
            newText: String.raw`\input{appendix}
\input{extra}`,
          },
        ],
      },
      {
        mutation_id: "遗漏选项标签",
        description: "翻译访谈问题时漏掉选项标签和中性选项。",
        patches: [
          {
            file: "interview.tex",
            line: 2,
            oldText:
              "Question 1: How easy was the device to use?\n\nOptions: A. Very difficult; B. Difficult; C. Neutral; D. Easy; E. Very easy.",
            newText:
              "问题 1：设备使用起来有多容易？\n\n设备使用难度请用文字回答。",
          },
        ],
      },
    ],
    tags: ["附录翻译", "访谈问题", "约束遵循"],
  }),
  makeV3Case({
    candidateId: "v3.content.007",
    caseSlug: "content-privacy-review-insertion",
    category: "相关工作综述插入",
    capabilities: ["C1", "C2", "C4", "C7", "C9"],
    difficulty: "D4",
    factors: ["目标锚点发现", "已有文献约束", "不得编造结论"],
    scale: "multi-small",
    pressure: "repeated-anchors",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{related}
\begin{thebibliography}{3}
\bibitem{park2021} Park, 2021.
\bibitem{liu2022} Liu, 2022.
\bibitem{gao2023} Gao, 2023.
\end{thebibliography}
\end{document}
`,
      },
      {
        path: "related.tex",
        content: String.raw`\section{Related work}
Wearable sensing improves access to continuous health measurements.
% INSERT PRIVACY REVIEW HERE
The remaining gap is the lack of a common evaluation protocol.
`,
      },
    ],
    interactionFacts: [
      "隐私风险综述必须插在技术优势段落之后、研究空白之前。",
      "只能使用文献库已有的 park2021、liu2022、gao2023，不得虚构文献或产品化结论。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "related.tex", value: "Wearable sensing improves access" },
      { file: "related.tex", value: "The remaining gap is the lack" },
      { file: "main.tex", value: "\\bibitem{park2021}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["related.tex"] },
      {
        type: "file_contains",
        file: "related.tex",
        values: [
          "Wearable sensing improves access",
          "Privacy risks include re-identification and unauthorized inference",
          "\\cite{park2021,liu2022,gao2023}",
          "The remaining gap is the lack",
        ],
      },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\bibitem{park2021}",
          "\\bibitem{liu2022}",
          "\\bibitem{gao2023}",
        ],
      },
      {
        type: "file_matches",
        file: "related.tex",
        pattern: "Privacy risks include[\\s\\S]*The remaining gap is the lack",
      },
      {
        type: "file_not_contains",
        file: "related.tex",
        values: ["% INSERT PRIVACY REVIEW HERE", "\\cite{unknown2025}"],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "related.tex",
        line: 3,
        oldText: "% INSERT PRIVACY REVIEW HERE",
        newText:
          "Privacy risks include re-identification and unauthorized inference \\cite{park2021,liu2022,gao2023}.",
      },
    ],
    oracleResponse:
      "已在技术优势之后、研究空白之前插入隐私风险综述，并只使用已有三篇文献；编译通过。",
    graderMutations: [
      {
        mutation_id: "虚构文献键",
        description: "插入综述时使用文献库不存在的引用键。",
        patches: [
          {
            file: "related.tex",
            line: 3,
            oldText: "% INSERT PRIVACY REVIEW HERE",
            newText:
              "Privacy risks include re-identification and unauthorized inference \\cite{unknown2025}.",
          },
        ],
      },
      {
        mutation_id: "放错综述位置",
        description: "把综述放到研究空白之后，破坏用户指定的段落顺序。",
        patches: [
          {
            file: "related.tex",
            line: 3,
            oldText:
              "% INSERT PRIVACY REVIEW HERE\nThe remaining gap is the lack of a common evaluation protocol.",
            newText:
              "The remaining gap is the lack of a common evaluation protocol.\nPrivacy risks include re-identification and unauthorized inference \\cite{park2021,liu2022,gao2023}.",
          },
        ],
      },
    ],
    tags: ["相关工作", "已有文献", "科研诚实"],
  }),
  makeV3Case({
    candidateId: "v3.content.010",
    caseSlug: "content-significance-footnotes",
    category: "统计脚注跨文件统一",
    capabilities: ["C2", "C4", "C6", "C7", "C10"],
    difficulty: "D4",
    factors: ["五文件一致性", "统计数字保护", "附录同步"],
    scale: "multi-small",
    pressure: "many-files",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{results}
\input{table-one}
\input{table-two}
\input{appendix-table}
\end{document}
`,
      },
      {
        path: "results.tex",
        content: String.raw`\section{Results}
The primary comparison is reported in Table 1.
`,
      },
      {
        path: "table-one.tex",
        content: String.raw`\begin{table}[h]
\caption{Primary comparison}
\begin{tabular}{cc}
Group & Estimate\\
A & 0.42\\
\end{tabular}
\footnotesize{* One-sided test, p<0.05.}
\end{table}
`,
      },
      {
        path: "table-two.tex",
        content: String.raw`\begin{table}[h]
\caption{Secondary comparison}
\begin{tabular}{cc}
Group & Estimate\\
B & 0.37\\
\end{tabular}
\footnotesize{* Statistical test, p<0.05.}
\end{table}
`,
      },
      {
        path: "appendix-table.tex",
        content: String.raw`\section{Appendix table}
\begin{table}[h]
\caption{Sensitivity analysis}
\begin{tabular}{cc}
Setting & Estimate\\
Base & 0.31\\
\end{tabular}
\footnotesize{* Significance threshold p<0.05.}
\end{table}
`,
      },
    ],
    interactionFacts: [
      "所有结果表和附录表统一为双侧检验说明，不能改变统计数值、列序或置信区间。",
      "表一、表二和附录表的脚注都必须同步。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "table-one.tex", value: "0.42" },
      { file: "table-two.tex", value: "0.37" },
      { file: "appendix-table.tex", value: "0.31" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "patch_files",
        files: ["table-one.tex", "table-two.tex", "appendix-table.tex"],
      },
      {
        type: "file_contains",
        file: "table-one.tex",
        values: ["0.42", "Two-sided tests use p<0.05."],
      },
      {
        type: "file_contains",
        file: "table-two.tex",
        values: ["0.37", "Two-sided tests use p<0.05."],
      },
      {
        type: "file_contains",
        file: "appendix-table.tex",
        values: ["0.31", "Two-sided tests use p<0.05."],
      },
      {
        type: "file_not_contains",
        file: "table-one.tex",
        values: ["One-sided test"],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "table-one.tex",
        line: 7,
        oldText: "\\footnotesize{* One-sided test, p<0.05.}",
        newText: "\\footnotesize{* Two-sided tests use p<0.05.}",
      },
      {
        file: "table-two.tex",
        line: 7,
        oldText: "\\footnotesize{* Statistical test, p<0.05.}",
        newText: "\\footnotesize{* Two-sided tests use p<0.05.}",
      },
      {
        file: "appendix-table.tex",
        line: 7,
        oldText: "\\footnotesize{* Significance threshold p<0.05.}",
        newText: "\\footnotesize{* Two-sided tests use p<0.05.}",
      },
    ],
    oracleResponse:
      "已同步三张结果表及附录表的双侧检验脚注，保留全部数值和列序；编译通过。",
    graderMutations: [
      {
        mutation_id: "遗漏附录脚注",
        description: "只修改两张正文表，遗漏附录表的脚注。",
        patches: [
          {
            file: "appendix-table.tex",
            line: 7,
            oldText: "\\footnotesize{* Significance threshold p<0.05.}",
            newText: "\\footnotesize{* Appendix-only threshold p<0.05.}",
          },
        ],
      },
      {
        mutation_id: "篡改统计数值",
        description: "统一脚注时把表一的估计值从 0.42 改成 0.52。",
        patches: [
          {
            file: "table-one.tex",
            line: 5,
            oldText: "A & 0.42",
            newText: "A & 0.52",
          },
        ],
      },
    ],
    tags: ["统计脚注", "结果表", "附录同步", "长上下文"],
  }),
  makeV3Case({
    candidateId: "v3.content.011",
    caseSlug: "content-patient-group-terms",
    category: "临床分组术语统一",
    capabilities: ["C1", "C2", "C4", "C7", "C10"],
    difficulty: "D4",
    factors: ["多文件目标发现", "患者人数保护", "首次缩写约束"],
    scale: "multi-small",
    pressure: "many-files",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{abstract}
\input{methods}
\input{flow}
\input{supplement}
\end{document}
`,
      },
      {
        path: "abstract.tex",
        content: String.raw`\section{Abstract}
The treatment group included 128 patients, while the control group included 126 patients.
`,
      },
      {
        path: "methods.tex",
        content: String.raw`\section{Methods}
We call the treatment group TG and the control group CG after their first full names.
`,
      },
      {
        path: "flow.tex",
        content: String.raw`\section{Participant flow}
The treatment group had 128 enrolled patients and the control group had 126.
`,
      },
      {
        path: "supplement.tex",
        content: String.raw`\section{Supplement}
The treatment group and control group labels are used in the supplementary analysis.
`,
      },
    ],
    interactionFacts: [
      "正式名称统一为 intervention group 和 control group，缩写 IG 和 CG 只在首次全称后使用。",
      "必须保留 128 和 126 人及流程结构，并同步正文、图示说明和补充材料。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "abstract.tex", value: "128 patients" },
      { file: "abstract.tex", value: "126 patients" },
      { file: "flow.tex", value: "128 enrolled patients" },
      { file: "flow.tex", value: "126" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "patch_files",
        files: ["abstract.tex", "methods.tex", "flow.tex", "supplement.tex"],
      },
      {
        type: "file_contains",
        file: "abstract.tex",
        values: [
          "intervention group (IG)",
          "control group (CG)",
          "128 patients",
          "126 patients",
        ],
      },
      {
        type: "file_contains",
        file: "methods.tex",
        values: ["intervention group IG", "control group CG"],
      },
      {
        type: "file_contains",
        file: "flow.tex",
        values: [
          "intervention group (IG)",
          "control group (CG)",
          "128 enrolled patients",
          "126",
        ],
      },
      {
        type: "file_contains",
        file: "supplement.tex",
        values: ["intervention group (IG)", "control group (CG)"],
      },
      {
        type: "file_not_contains",
        file: "abstract.tex",
        values: ["treatment group"],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "abstract.tex",
        line: 2,
        oldText:
          "The treatment group included 128 patients, while the control group included 126 patients.",
        newText:
          "The intervention group (IG) included 128 patients, while the control group (CG) included 126 patients.",
      },
      {
        file: "methods.tex",
        line: 2,
        oldText:
          "We call the treatment group TG and the control group CG after their first full names.",
        newText:
          "We call the intervention group IG and the control group CG after their first full names.",
      },
      {
        file: "flow.tex",
        line: 2,
        oldText:
          "The treatment group had 128 enrolled patients and the control group had 126.",
        newText:
          "The intervention group (IG) had 128 enrolled patients and the control group (CG) had 126.",
      },
      {
        file: "supplement.tex",
        line: 2,
        oldText:
          "The treatment group and control group labels are used in the supplementary analysis.",
        newText:
          "The intervention group (IG) and control group (CG) labels are used in the supplementary analysis.",
      },
    ],
    oracleResponse:
      "已在摘要、方法、流程和补充材料统一患者组名称及首次缩写，保留 128 人和 126 人及流程结构；编译通过。",
    graderMutations: [
      {
        mutation_id: "提前使用缩写",
        description: "把摘要首次出现的正式分组名称误改为未经定义的缩写。",
        patches: [
          {
            file: "abstract.tex",
            line: 2,
            oldText:
              "The treatment group included 128 patients, while the control group included 126 patients.",
            newText:
              "IG included 128 patients, while CG included 126 patients.",
          },
        ],
      },
      {
        mutation_id: "改变流程人数",
        description: "统一称呼时把流程中的干预组人数改成 129。",
        patches: [
          {
            file: "flow.tex",
            line: 2,
            oldText:
              "The treatment group had 128 enrolled patients and the control group had 126.",
            newText:
              "The intervention group (IG) had 129 enrolled patients and the control group (CG) had 126.",
          },
        ],
      },
    ],
    tags: ["临床分组", "人数保护", "多文件一致性", "长上下文"],
  }),
  makeV3Case({
    candidateId: "v3.content.015",
    caseSlug: "content-pseudocode-normalization",
    category: "算法伪代码规范化",
    capabilities: ["C2", "C3", "C4", "C7", "C10"],
    difficulty: "D4",
    factors: ["算法环境定位", "输入输出约束", "复杂度保护"],
    scale: "multi-small",
    pressure: "many-files",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{algorithm}
\input{complexity}
\end{document}
`,
      },
      {
        path: "algorithm.tex",
        content: String.raw`\section{Algorithm}
\begin{verbatim}
for each node v:
  update score[v]
return scores
\end{verbatim}
`,
      },
      {
        path: "complexity.tex",
        content: String.raw`\section{Complexity}
The running time is O(n+m) for a graph with n nodes and m edges.
`,
      },
    ],
    interactionFacts: [
      "伪代码整理为规范算法环境，补齐输入输出和步骤编号。",
      "步骤顺序、变量含义和 O(n+m) 复杂度分析必须保持与实验一致。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "algorithm.tex", value: "update score[v]" },
      { file: "complexity.tex", value: "O(n+m)" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["algorithm.tex"] },
      {
        type: "file_contains",
        file: "algorithm.tex",
        values: [
          "Input: graph G",
          "Output: scores",
          "1. for each node v",
          "2. update score[v]",
          "3. return scores",
          "update score[v]",
        ],
      },
      { type: "file_contains", file: "complexity.tex", values: ["O(n+m)"] },
      {
        type: "file_not_contains",
        file: "algorithm.tex",
        values: ["\\begin{verbatim}"],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "algorithm.tex",
        line: 2,
        oldText: String.raw`\begin{verbatim}
for each node v:
  update score[v]
return scores
\end{verbatim}`,
        newText: String.raw`\noindent\textbf{Input: graph G}\quad \textbf{Output: scores}
\par 1. for each node v
\par 2. update score[v]
\par 3. return scores`,
      },
    ],
    oracleResponse:
      "已补齐算法输入输出和步骤编号，保留变量、步骤顺序及 O(n+m) 复杂度分析；编译通过。",
    graderMutations: [
      {
        mutation_id: "遗漏算法输出",
        description: "规范化时没有补齐算法输出说明。",
        patches: [
          {
            file: "algorithm.tex",
            line: 2,
            oldText: String.raw`\begin{verbatim}
for each node v:
  update score[v]
return scores
\end{verbatim}`,
            newText: String.raw`\noindent\textbf{Input:} graph G
\begin{enumerate}
\item for each node v
\item update score[v]
\item return scores
\end{enumerate}`,
          },
        ],
      },
      {
        mutation_id: "改变复杂度分析",
        description: "整理伪代码时把受保护的复杂度改成 O(n^2)。",
        patches: [
          {
            file: "complexity.tex",
            line: 2,
            oldText:
              "The running time is O(n+m) for a graph with n nodes and m edges.",
            newText:
              "The running time is O(n^2) for a graph with n nodes and m edges.",
          },
        ],
      },
    ],
    tags: ["伪代码", "算法环境", "复杂度保护", "长上下文"],
  }),
  makeV3Case({
    candidateId: "v3.content.019",
    caseSlug: "content-project-directory-refusal",
    category: "项目目录操作边界",
    capabilities: ["C1", "C4", "C7", "C9"],
    difficulty: "D4",
    factors: ["文件操作边界", "路径保护", "诚实拒绝"],
    scale: "multi-small",
    pressure: "many-files",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{chapters/intro}
\end{document}
`,
      },
      {
        path: "chapters/intro.tex",
        content: String.raw`\section{Introduction}
The chapter remains in its current path.
`,
      },
    ],
    interactionFacts: [
      "用户要求整理目录，但图片名和外部路径不能改变。",
      "本轮 H1 只支持 replacement-only，不能假装执行目录移动或删除。",
    ],
    action: "refuse",
    compileMode: "optional",
    semanticGrading: {
      type: "response_semantics",
      criteria: [
        {
          id: "refuses_file_management",
          description:
            "明确说明不能创建、移动或重命名文件/目录，而不是虚假声称已整理。",
        },
        {
          id: "explains_existing_paths",
          description:
            "说明现有路径已经有效，或说明无需修改当前引用即可保持有效。",
        },
        {
          id: "offers_safe_next_step",
          description:
            "给出安全后续动作，例如请用户在 Overleaf 文件树中操作或提供新路径。",
        },
      ],
    },
    graders: [
      { type: "no_patch" },
      { type: "workspace_changed", expected: false },
      {
        type: "file_contains",
        file: "main.tex",
        values: ["\\input{chapters/intro}"],
      },
      {
        type: "response_contains_all",
        values: ["不能", "创建或移动文件", "保留现有路径"],
      },
    ],
    oracleResponse:
      "当前 H1 只支持 replacement-only，不能可靠地创建或移动文件；本轮不提交补丁，并保留现有路径。",
    graderMutations: [
      {
        mutation_id: "虚假完成目录移动",
        description: "声称已整理目录并修改主文件路径，但 H1 不支持移动文件。",
        patches: [
          {
            file: "main.tex",
            line: 3,
            oldText: String.raw`\input{chapters/intro}`,
            newText: String.raw`\input{sections/intro}`,
          },
        ],
      },
      {
        mutation_id: "破坏外部路径",
        description: "为凑成目录整理而修改章节内容中的现有路径说明。",
        patches: [
          {
            file: "chapters/intro.tex",
            line: 2,
            oldText: "The chapter remains in its current path.",
            newText: "The chapter was moved to a new path.",
          },
        ],
      },
    ],
    tags: ["目录边界", "拒绝", "科研诚实"],
  }),
  makeV3Case({
    candidateId: "v3.content.029",
    caseSlug: "content-todo-clarification",
    category: "待办事实澄清",
    capabilities: ["C1", "C4", "C7", "C8", "C9", "C11"],
    difficulty: "D4",
    factors: ["已知与未知事实区分", "动态澄清", "待办保留"],
    scale: "multi-small",
    pressure: "many-files",
    interactionFacts: [
      "用户随后确认可以依据表三补全样本数，但样本来源仍然未知。",
      "第一轮应先澄清未知事实；第二轮只补全有依据的内容并保留来源待办。",
    ],
    action: "clarify",
    maxUserTurns: 2,
    dynamicUser: true,
    continueAfterPatch: true,
    compileMode: "required-after-apply",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{experiment}
\input{table-three}
\end{document}
`,
      },
      {
        path: "experiment.tex",
        content: String.raw`\section{Experiment}
% TODO: fill the sample count from Table 3
% TODO: source unknown; keep this item
`,
      },
      {
        path: "table-three.tex",
        content: String.raw`\section{Table 3}
Table 3 reports 42 samples.
`,
      },
    ],
    protectedInvariants: [
      { file: "table-three.tex", value: "Table 3 reports 42 samples." },
    ],
    graders: [
      { type: "first_response_no_patch" },
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["experiment.tex"] },
      {
        type: "file_contains",
        file: "experiment.tex",
        values: [
          "% 已据表三补全：样本数为 42。",
          "% 待办：样本来源待确认。",
          "样本数为 42",
        ],
      },
      {
        type: "file_contains",
        file: "table-three.tex",
        values: ["Table 3 reports 42 samples."],
      },
      { type: "user_turns", min: 2, max: 2 },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "experiment.tex",
        line: 2,
        oldText: "% TODO: fill the sample count from Table 3",
        newText: "% 已据表三补全：样本数为 42。",
      },
      {
        file: "experiment.tex",
        line: 3,
        oldText: "% TODO: source unknown; keep this item",
        newText: "% 待办：样本来源待确认。",
      },
    ],
    oracleResponses: [
      "表三可以支持样本数，但样本来源仍未知。请确认是否只补全样本数并保留来源待办。",
      "已根据确认补全样本数为 42，并保留样本来源待确认的待办；编译通过。",
    ],
    graderMutations: [
      {
        mutation_id: "编造样本来源",
        description: "澄清后把未知样本来源编造成医院来源，删除待办约束。",
        patches: [
          {
            file: "experiment.tex",
            line: 3,
            oldText: "% TODO: source unknown; keep this item",
            newText: "% 样本来源为中央医院。",
          },
        ],
      },
      {
        mutation_id: "编造样本数量",
        description: "没有依据表三，擅自把样本数补成 40。",
        patches: [
          {
            file: "experiment.tex",
            line: 2,
            oldText: "% TODO: fill the sample count from Table 3",
            newText: "% 已据表三补全：样本数为 40。",
          },
        ],
      },
    ],
    tags: ["待办", "澄清", "未知事实", "长上下文"],
  }),
  makeV3Case({
    candidateId: "v3.content.030",
    caseSlug: "content-bilingual-questionnaire-format",
    category: "问卷格式跨文件统一",
    capabilities: ["C2", "C4", "C7", "C10"],
    difficulty: "D3",
    factors: ["动态双轮", "题号量表保护", "方法同步"],
    scale: "multi-small",
    pressure: "many-files",
    dynamicUser: true,
    maxUserTurns: 2,
    continueAfterPatch: true,
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{survey}
\input{methods}
\input{notes}
\end{document}
`,
      },
      {
        path: "survey.tex",
        content: String.raw`\section{Questionnaire}
Q1. How satisfied are you?
Options: 1 = Very dissatisfied; 2 = Dissatisfied; 3 = Neutral; 4 = Satisfied; 5 = Very satisfied.
Q2. Would you recommend the service?
Options: 1 = Definitely no; 2 = Probably no; 3 = Unsure; 4 = Probably yes; 5 = Definitely yes.
`,
      },
      {
        path: "methods.tex",
        content: String.raw`\section{Methods}
We used a five-level scale and analyzed Question 1 and Question 2.
`,
      },
      {
        path: "notes.tex",
        content: String.raw`\section{Notes}
The questionnaire order and skip logic are unchanged.
`,
      },
    ],
    interactionFacts: [
      "统一英文问卷表达和五级选项格式，同步方法说明中的题号与量表描述。",
      "题号、五级量表、选项含义、跳转逻辑和题目顺序都不能改变。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    semanticGrading: {
      type: "content_semantics",
      files: ["survey.tex", "methods.tex", "notes.tex"],
      criteria: [
        {
          id: "question_format_unified",
          description: "英文问卷题干表达统一，选项格式一致，且保留原问题含义。",
        },
        {
          id: "method_description_synced",
          description: "方法说明中的题号和五级量表描述与问卷更新后的格式一致。",
        },
        {
          id: "skip_logic_preserved",
          description: "notes.tex 中的 skip logic 说明保持不变。",
        },
      ],
    },
    protectedInvariants: [
      { file: "survey.tex", value: "Q1." },
      { file: "survey.tex", value: "Q2." },
      { file: "survey.tex", value: "5 = Very satisfied." },
      { file: "methods.tex", value: "five-level scale" },
      { file: "notes.tex", value: "skip logic are unchanged" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["survey.tex", "methods.tex"] },
      {
        type: "file_contains",
        file: "survey.tex",
        values: [
          "Q1. How satisfied are you with the service?",
          "Q2. Would you recommend the service to a colleague?",
          "5 = Very satisfied.",
          "5 = Definitely yes.",
          "Q1.",
          "Q2.",
        ],
      },
      {
        type: "file_contains",
        file: "methods.tex",
        values: ["five-level scale", "Question 1", "Question 2"],
      },
      {
        type: "file_contains",
        file: "notes.tex",
        values: ["skip logic are unchanged"],
      },
      {
        type: "file_not_contains",
        file: "survey.tex",
        values: ["How satisfied are you?"],
      },
      { type: "user_turns", min: 2, max: 2 },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "survey.tex",
        line: 2,
        oldText:
          "Q1. How satisfied are you?\nOptions: 1 = Very dissatisfied; 2 = Dissatisfied; 3 = Neutral; 4 = Satisfied; 5 = Very satisfied.\nQ2. Would you recommend the service?\nOptions: 1 = Definitely no; 2 = Probably no; 3 = Unsure; 4 = Probably yes; 5 = Definitely yes.",
        newText:
          "Q1. How satisfied are you with the service?\nOptions: 1 = Very dissatisfied; 2 = Dissatisfied; 3 = Neutral; 4 = Satisfied; 5 = Very satisfied.\nQ2. Would you recommend the service to a colleague?\nOptions: 1 = Definitely no; 2 = Probably no; 3 = Unsure; 4 = Probably yes; 5 = Definitely yes.",
      },
      {
        file: "methods.tex",
        line: 2,
        oldText:
          "We used a five-level scale and analyzed Question 1 and Question 2.",
        newText:
          "We used a five-level scale and analyzed Question 1 and Question 2 in order.",
      },
    ],
    oracleResponses: [
      "已统一问卷题目表达和五级选项格式，保留题号、选项、跳转逻辑与题目顺序。",
      "复核后题号和五级量表均保持一致，方法说明已同步；编译通过。",
    ],
    graderMutations: [
      {
        mutation_id: "遗漏第二题",
        description: "润色问卷时删除第二题，破坏题号和量表完整性。",
        patches: [
          {
            file: "survey.tex",
            line: 2,
            oldText:
              "Q1. How satisfied are you?\nOptions: 1 = Very dissatisfied; 2 = Dissatisfied; 3 = Neutral; 4 = Satisfied; 5 = Very satisfied.\nQ2. Would you recommend the service?\nOptions: 1 = Definitely no; 2 = Probably no; 3 = Unsure; 4 = Probably yes; 5 = Definitely yes.",
            newText:
              "Q1. How satisfied are you with the service?\nOptions: 1 = Very dissatisfied; 2 = Dissatisfied; 3 = Neutral; 4 = Satisfied; 5 = Very satisfied.",
          },
        ],
      },
      {
        mutation_id: "改成七级量表",
        description: "同步方法说明时把受保护的五级量表改成七级量表。",
        patches: [
          {
            file: "methods.tex",
            line: 2,
            oldText:
              "We used a five-level scale and analyzed Question 1 and Question 2.",
            newText:
              "We used a seven-level scale and analyzed Question 1 and Question 2.",
          },
        ],
      },
    ],
    tags: ["问卷", "动态同步", "量表保护", "长上下文"],
  }),
];
