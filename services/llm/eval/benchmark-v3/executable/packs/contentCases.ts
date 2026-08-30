import { makeV3Case } from "../caseFactory.js";
import type { V3ExecutableCase } from "../types.js";

/**
 * 第一批内容/结构/数学/跨文件 case。
 *
 * 所有 oracle 都只使用 H1 replacement hunk；fixture 中的中文只出现在
 * LaTeX 注释里，以便仍然可以用 pdflatex 做真实的前后编译检查。
 */
export const V3_CONTENT_CASES: V3ExecutableCase[] = [
  makeV3Case({
    candidateId: "v3.content.001",
    caseSlug: "content-introduction-progression",
    category: "内容结构重写",
    capabilities: ["C1", "C2", "C7"],
    difficulty: "D2",
    factors: ["目标定位", "递进结构", "引用与数字保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\section{Introduction}
Background and motivation are described briefly. The research gap is not yet explicit. Our method uses a constrained encoder for traffic prediction. The contributions are: (1) a calibrated benchmark; (2) a robust encoder; (3) an open evaluation protocol. The method reaches 91.2\% accuracy on the Metro test set \cite{lee2021}.
\begin{thebibliography}{1}
\bibitem{lee2021} Lee, 2021.
\end{thebibliography}
\end{document}
`,
      },
    ],
    interactionFacts: [
      "篇幅限制为四页以内。",
      "必须保留三条贡献、引用键和技术事实，不增加未经查证的文献。",
    ],
    action: "patch",
    compileMode: "optional",
    protectedInvariants: [
      { file: "main.tex", value: "91.2\\%" },
      { file: "main.tex", value: "\\cite{lee2021}" },
      { file: "main.tex", value: "(3) an open evaluation protocol" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "Background and motivation",
          "The research gap is explicit",
          "Our method uses",
          "(1) a calibrated benchmark",
          "(2) a robust encoder",
          "(3) an open evaluation protocol",
          "91.2\\%",
          "\\cite{lee2021}",
        ],
      },
      {
        type: "file_not_contains",
        file: "main.tex",
        values: ["The research gap is not yet explicit."],
      },
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 5,
        oldText:
          "Background and motivation are described briefly. The research gap is not yet explicit. Our method uses a constrained encoder for traffic prediction. The contributions are: (1) a calibrated benchmark; (2) a robust encoder; (3) an open evaluation protocol. The method reaches 91.2\\% accuracy on the Metro test set \\cite{lee2021}.",
        newText:
          "Background and motivation establish the need for reliable traffic prediction. The research gap is explicit: existing benchmarks do not test calibration under changing demand. Our method uses a constrained encoder for traffic prediction. The contributions are: (1) a calibrated benchmark; (2) a robust encoder; (3) an open evaluation protocol. The method reaches 91.2\\% accuracy on the Metro test set \\cite{lee2021}.",
      },
    ],
    oracleResponse:
      "已按研究背景、研究空白、方法和三条贡献的顺序重写引言，并保留引用、数字与技术事实。",
    graderMutations: [
      {
        mutation_id: "漏掉第三条贡献",
        description: "重写时遗漏第三条贡献，但保留其他段落和准确率。",
        patches: [
          {
            file: "main.tex",
            line: 5,
            oldText:
              "Background and motivation are described briefly. The research gap is not yet explicit. Our method uses a constrained encoder for traffic prediction. The contributions are: (1) a calibrated benchmark; (2) a robust encoder; (3) an open evaluation protocol. The method reaches 91.2\\% accuracy on the Metro test set \\cite{lee2021}.",
            newText:
              "Background and motivation establish the need for reliable traffic prediction. The research gap is explicit: existing benchmarks do not test calibration under changing demand. Our method uses a constrained encoder for traffic prediction. The contributions are: (1) a calibrated benchmark; (2) a robust encoder. The method reaches 91.2\\% accuracy on the Metro test set \\cite{lee2021}.",
          },
        ],
      },
      {
        mutation_id: "改变受保护数字",
        description: "把实验准确率改成未获授权的新数字。",
        patches: [
          {
            file: "main.tex",
            line: 5,
            oldText:
              "Background and motivation are described briefly. The research gap is not yet explicit. Our method uses a constrained encoder for traffic prediction. The contributions are: (1) a calibrated benchmark; (2) a robust encoder; (3) an open evaluation protocol. The method reaches 91.2\\% accuracy on the Metro test set \\cite{lee2021}.",
            newText:
              "Background and motivation establish the need for reliable traffic prediction. The research gap is explicit: existing benchmarks do not test calibration under changing demand. Our method uses a constrained encoder for traffic prediction. The contributions are: (1) a calibrated benchmark; (2) a robust encoder; (3) an open evaluation protocol. The method reaches 94.0\\% accuracy on the Metro test set \\cite{lee2021}.",
          },
        ],
      },
    ],
    tags: ["引言", "内容重写", "事实保护"],
  }),

  makeV3Case({
    candidateId: "v3.content.002",
    caseSlug: "content-abstract-conclusion-terminology",
    category: "跨文件术语统一",
    capabilities: ["C1", "C2", "C4", "C7"],
    difficulty: "D3",
    factors: ["跨文件定位", "术语一致性", "实验事实保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{sections/abstract}
\input{sections/conclusion}
\end{document}
`,
      },
      {
        path: "sections/abstract.tex",
        content: String.raw`\begin{abstract}
The boundary-aware model reaches 87.4\% Dice on the confirmed test split. Its limitation is sensitivity to sparse annotations.
\end{abstract}
`,
      },
      {
        path: "sections/conclusion.tex",
        content: String.raw`\section{Conclusion}
The edge-aware model reaches 87.4\% Dice on the confirmed test split. Its limitation is sensitivity to sparse annotations.
`,
      },
    ],
    interactionFacts: [
      "边界指标和摘要中的百分比已经确认。",
      "模型名称统一为边界感知模型，必须保留局限性，不得虚构实验或夸大因果。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "sections/abstract.tex", value: "87.4\\%" },
      { file: "sections/conclusion.tex", value: "87.4\\%" },
      {
        file: "sections/abstract.tex",
        value: "sensitivity to sparse annotations",
      },
      {
        file: "sections/conclusion.tex",
        value: "sensitivity to sparse annotations",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "patch_files",
        files: ["sections/abstract.tex", "sections/conclusion.tex"],
      },
      {
        type: "file_contains",
        file: "sections/abstract.tex",
        values: [
          "boundary-aware",
          "87.4\\%",
          "sensitivity to sparse annotations",
        ],
      },
      {
        type: "file_contains",
        file: "sections/conclusion.tex",
        values: [
          "boundary-aware",
          "87.4\\%",
          "sensitivity to sparse annotations",
        ],
      },
      {
        type: "file_not_contains",
        file: "sections/conclusion.tex",
        values: ["edge-aware"],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "sections/abstract.tex",
        line: 2,
        oldText:
          "The boundary-aware model reaches 87.4\\% Dice on the confirmed test split. Its limitation is sensitivity to sparse annotations.",
        newText:
          "The boundary-aware model reaches 87.4\\% Dice on the confirmed test split. The model's limitation is sensitivity to sparse annotations.",
      },
      {
        file: "sections/conclusion.tex",
        line: 2,
        oldText:
          "The edge-aware model reaches 87.4\\% Dice on the confirmed test split. Its limitation is sensitivity to sparse annotations.",
        newText:
          "The boundary-aware model reaches 87.4\\% Dice on the confirmed test split. Its limitation is sensitivity to sparse annotations.",
      },
    ],
    oracleResponse:
      "已在摘要与结论文件统一模型术语，保留确认的百分比和局限性；补丁应用后编译通过。",
    graderMutations: [
      {
        mutation_id: "漏改结论术语",
        description: "只修改摘要而遗漏结论文件中的旧术语。",
        patches: [
          {
            file: "sections/conclusion.tex",
            line: 2,
            oldText:
              "The edge-aware model reaches 87.4\\% Dice on the confirmed test split. Its limitation is sensitivity to sparse annotations.",
            newText:
              "The results describe a different model without a confirmed metric.",
          },
        ],
      },
      {
        mutation_id: "改变医学指标",
        description: "统一术语时把已确认的百分比改成另一数值。",
        patches: [
          {
            file: "sections/conclusion.tex",
            line: 2,
            oldText:
              "The edge-aware model reaches 87.4\\% Dice on the confirmed test split. Its limitation is sensitivity to sparse annotations.",
            newText:
              "The boundary-aware model reaches 89.1\\% Dice on the confirmed test split. Its limitation is sensitivity to sparse annotations.",
          },
        ],
      },
    ],
    tags: ["摘要", "结论", "跨文件", "术语"],
  }),

  makeV3Case({
    candidateId: "v3.content.003",
    caseSlug: "content-robotics-polish",
    category: "学术英语润色",
    capabilities: ["C1", "C2", "C4", "C7"],
    difficulty: "D3",
    factors: ["多文件润色", "公式与图引用保护", "批判语气保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\input{chapters/intro}
\input{chapters/method}
\input{chapters/appendix}
\end{document}
`,
      },
      {
        path: "chapters/intro.tex",
        content: String.raw`\section{Introduction}
Our trajectory method has a clear weakness: it degrades when observations are delayed. Figure~\ref{fig:tracking} reports the comparison.
`,
      },
      {
        path: "chapters/method.tex",
        content: String.raw`\section{Method}
We study trajectory tracking under the parameter restriction $\tau=0.5$. The controller does not claim robustness beyond this range.
`,
      },
      {
        path: "chapters/appendix.tex",
        content: String.raw`\section{Supplementary details}
The proof use same trajectory track restriction $\tau=0.5$ and it not claim robustness outside this range.
\begin{figure}[h]
\centering\rule{2cm}{1cm}
\caption{Tracking comparison}\label{fig:tracking}
\end{figure}
`,
      },
    ],
    interactionFacts: [
      "“这三部分”明确指 chapters/intro.tex、chapters/method.tex 和 chapters/appendix.tex，三处都需要润色。",
      "术语统一为“轨迹跟踪”。",
      "必须保留公式、图表引用、参数限制和对缺点的批判语气，不得改数字。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "chapters/method.tex", value: "\\tau=0.5" },
      { file: "chapters/appendix.tex", value: "\\tau=0.5" },
      { file: "chapters/intro.tex", value: "\\ref{fig:tracking}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "patch_files",
        files: [
          "chapters/intro.tex",
          "chapters/method.tex",
          "chapters/appendix.tex",
        ],
      },
      {
        type: "file_contains",
        file: "chapters/intro.tex",
        values: [
          "trajectory tracking",
          "clear weakness",
          "\\ref{fig:tracking}",
        ],
      },
      {
        type: "file_contains",
        file: "chapters/method.tex",
        values: [
          "trajectory tracking",
          "\\tau=0.5",
          "does not claim robustness",
        ],
      },
      {
        type: "file_contains",
        file: "chapters/appendix.tex",
        values: [
          "trajectory tracking restriction",
          "\\tau=0.5",
          "does not claim robustness",
        ],
      },
      {
        type: "file_not_contains",
        file: "chapters/intro.tex",
        values: ["Our trajectory method has a clear weakness"],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "chapters/intro.tex",
        line: 2,
        oldText:
          "Our trajectory method has a clear weakness: it degrades when observations are delayed. Figure~\\ref{fig:tracking} reports the comparison.",
        newText:
          "Our trajectory tracking method has a clear weakness: it degrades when observations are delayed. Figure~\\ref{fig:tracking} reports the comparison.",
      },
      {
        file: "chapters/method.tex",
        line: 2,
        oldText:
          "We study trajectory tracking under the parameter restriction $\\tau=0.5$. The controller does not claim robustness beyond this range.",
        newText:
          "We investigate trajectory tracking under the parameter restriction $\\tau=0.5$. The controller does not claim robustness beyond this range.",
      },
      {
        file: "chapters/appendix.tex",
        line: 2,
        oldText:
          "The proof use same trajectory track restriction $\\tau=0.5$ and it not claim robustness outside this range.",
        newText:
          "The proof uses the same trajectory tracking restriction $\\tau=0.5$ and does not claim robustness outside this range.",
      },
    ],
    oracleResponse:
      "已统一轨迹跟踪术语并润色相关句子，保留公式、图引用、参数限制和局限性。",
    graderMutations: [
      {
        mutation_id: "弱化局限性",
        description: "润色时把引言中的明确缺点改成正面宣传语。",
        patches: [
          {
            file: "chapters/intro.tex",
            line: 2,
            oldText:
              "Our trajectory method has a clear weakness: it degrades when observations are delayed. Figure~\\ref{fig:tracking} reports the comparison.",
            newText:
              "Our trajectory tracking method performs reliably even when observations are delayed. Figure~\\ref{fig:tracking} reports the comparison.",
          },
        ],
      },
      {
        mutation_id: "改变参数限制",
        description: "润色时把方法文件中受保护的参数限制改成另一数值。",
        patches: [
          {
            file: "chapters/method.tex",
            line: 2,
            oldText:
              "We study trajectory tracking under the parameter restriction $\\tau=0.5$. The controller does not claim robustness beyond this range.",
            newText:
              "We study trajectory tracking under the parameter restriction $\\tau=0.8$. The controller does not claim robustness beyond this range.",
          },
        ],
      },
    ],
    tags: ["英文润色", "公式保护", "批判语气"],
  }),

  makeV3Case({
    candidateId: "v3.content.004",
    caseSlug: "content-multifile-translation",
    category: "跨文件学术翻译",
    capabilities: ["C1", "C2", "C3", "C4", "C7"],
    difficulty: "D4",
    factors: ["多文件目标发现", "翻译完整性", "名称公式引用保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\input{sections/intro}
\input{sections/method}
\input{sections/appendix}
\input{refs}
\end{document}
`,
      },
      {
        path: "sections/intro.tex",
        content: String.raw`\section{Introduction}
% 中文正文：本研究考察可解释的边缘推理。项目名称 Aurora 不翻译，方法引用 \cite{wang2022} 保留。
`,
      },
      {
        path: "sections/method.tex",
        content: String.raw`\section{Method}
% 中文正文：我们优化目标函数 $L(\theta)=\|y-f_\theta(x)\|^2$。
`,
      },
      {
        path: "sections/appendix.tex",
        content: String.raw`\section{Appendix}
% 中文批注：附录中的注释规则不翻译为正文。
% 中文正文：附录记录实现细节。
`,
      },
      {
        path: "refs.tex",
        content: String.raw`\begin{thebibliography}{1}
\bibitem{wang2022} Wang, 2022.
\end{thebibliography}
`,
      },
    ],
    interactionFacts: [
      "“这些章节”明确指 sections/intro.tex、sections/method.tex 和 sections/appendix.tex；refs.tex 只是参考文献，不是翻译目标。",
      "项目名称 Aurora 不翻译。",
      "保留章节、名称、公式和引用；中文批注仍按批注规则处理，不得漏译正文。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "sections/intro.tex", value: "Aurora" },
      { file: "sections/intro.tex", value: "\\cite{wang2022}" },
      { file: "sections/method.tex", value: "L(\\theta)" },
      { file: "sections/method.tex", value: "\\|y-f_\\theta(x)\\|^2" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "patch_files",
        files: [
          "sections/intro.tex",
          "sections/method.tex",
          "sections/appendix.tex",
        ],
      },
      {
        type: "file_contains",
        file: "sections/intro.tex",
        values: [
          "This study examines interpretable edge inference.",
          "Aurora",
          "\\cite{wang2022}",
        ],
      },
      {
        type: "file_contains",
        file: "sections/method.tex",
        values: [
          "We optimize the objective",
          "L(\\theta)",
          "\\|y-f_\\theta(x)\\|^2",
          "L(\\theta)=\\|y-f_\\theta(x)\\|^2",
        ],
      },
      {
        type: "file_contains",
        file: "sections/appendix.tex",
        values: ["The appendix records implementation details."],
      },
      {
        type: "file_not_contains",
        file: "sections/intro.tex",
        values: ["本研究考察"],
      },
      {
        type: "file_not_contains",
        file: "sections/method.tex",
        values: ["我们优化目标函数"],
      },
      { type: "file_unchanged", file: "refs.tex" },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "sections/intro.tex",
        line: 2,
        oldText:
          "% 中文正文：本研究考察可解释的边缘推理。项目名称 Aurora 不翻译，方法引用 \\cite{wang2022} 保留。",
        newText:
          "This study examines interpretable edge inference. The project name Aurora remains unchanged, and the method citation \\cite{wang2022} is preserved.",
      },
      {
        file: "sections/method.tex",
        line: 2,
        oldText:
          "% 中文正文：我们优化目标函数 $L(\\theta)=\\|y-f_\\theta(x)\\|^2$。",
        newText:
          "We optimize the objective $L(\\theta)=\\|y-f_\\theta(x)\\|^2$.",
      },
      {
        file: "sections/appendix.tex",
        line: 3,
        oldText: "% 中文正文：附录记录实现细节。",
        newText: "The appendix records implementation details.",
      },
    ],
    oracleResponse:
      "已翻译三个章节文件，保留 Aurora、公式、引用及中文批注规则；补丁应用后编译通过。",
    graderMutations: [
      {
        mutation_id: "漏译附录正文",
        description: "只翻译引言和方法，附录正文仍保留中文。",
        patches: [
          {
            file: "sections/appendix.tex",
            line: 3,
            oldText: "% 中文正文：附录记录实现细节。",
            newText: "% 附录正文仍为中文，翻译尚未完成。",
          },
        ],
      },
      {
        mutation_id: "误改项目名称",
        description: "翻译时把受保护的项目名称 Aurora 翻译成其他名称。",
        patches: [
          {
            file: "sections/intro.tex",
            line: 2,
            oldText:
              "% 中文正文：本研究考察可解释的边缘推理。项目名称 Aurora 不翻译，方法引用 \\cite{wang2022} 保留。",
            newText:
              "This study examines interpretable edge inference. The project name Dawn is translated, and the method citation \\cite{wang2022} is preserved.",
          },
        ],
      },
    ],
    tags: ["翻译", "多文件", "公式与引用"],
  }),

  makeV3Case({
    candidateId: "v3.content.006",
    caseSlug: "content-bilingual-sync",
    category: "双语内容同步",
    capabilities: ["C1", "C2", "C4", "C7", "C10"],
    difficulty: "D4",
    factors: ["五文件定位", "段落对应", "术语和顺序保护"],
    scale: "multi-small",
    pressure: "many-files",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{CJKutf8}
\begin{document}
\begin{CJK*}{UTF8}{gbsn}
\input{zh/intro}
\input{en/intro}
\input{zh/method}
\input{en/method}
\input{refs}
\end{CJK*}
\end{document}
`,
      },
      {
        path: "zh/intro.tex",
        content: String.raw`\section{中文引言}
% 待补中文段落
% 现有中文段落：社区网络需要在冲击后恢复。
`,
      },
      {
        path: "en/intro.tex",
        content: String.raw`\section{English Introduction}
The report defines social resilience as the capacity of a community network to adapt after a shock.
`,
      },
      {
        path: "zh/method.tex",
        content: String.raw`\section{中文方法}
% 旧术语：社会恢复力
% 方法段落保持原有顺序。
`,
      },
      {
        path: "en/method.tex",
        content: String.raw`\section{English Method}
We measure social resilience with the same network indicators.
`,
      },
      {
        path: "refs.tex",
        content: String.raw`\begin{thebibliography}{1}
\bibitem{chen2023} Chen, 2023.
\end{thebibliography}
`,
      },
    ],
    interactionFacts: [
      "英文版本较新，需要补两段中文并统一关键术语为社会韧性。",
      "必须保留段落顺序、英文新增内容和双语标题，不得删英文或合并语言。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "en/intro.tex", value: "social resilience" },
      { file: "en/method.tex", value: "social resilience" },
      {
        file: "zh/intro.tex",
        value: "现有中文段落：社区网络需要在冲击后恢复。",
      },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["zh/intro.tex", "zh/method.tex"] },
      {
        type: "file_contains",
        file: "zh/intro.tex",
        values: [
          "中文段落一：社会韧性描述社区网络适应冲击的能力。",
          "中文段落二：本报告比较不同网络指标。",
          "现有中文段落：社区网络需要在冲击后恢复。",
        ],
      },
      {
        type: "file_contains",
        file: "zh/method.tex",
        values: ["术语统一为：社会韧性"],
      },
      {
        type: "file_contains",
        file: "en/intro.tex",
        values: ["social resilience"],
      },
      {
        type: "file_contains",
        file: "en/method.tex",
        values: ["social resilience"],
      },
      {
        type: "file_not_contains",
        file: "zh/method.tex",
        values: ["社会恢复力"],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "zh/intro.tex",
        line: 3,
        oldText: "% 待补中文段落",
        newText:
          "% 中文段落一：社会韧性描述社区网络适应冲击的能力。\n% 中文段落二：本报告比较不同网络指标。",
      },
      {
        file: "zh/method.tex",
        line: 2,
        oldText: "% 旧术语：社会恢复力",
        newText: "% 术语统一为：社会韧性",
      },
    ],
    oracleResponse:
      "已补齐中文缺失段落并统一为“社会韧性”，保持双语标题、段落顺序和英文内容；编译通过。",
    graderMutations: [
      {
        mutation_id: "漏掉一段中文",
        description: "只补入第一段中文，遗漏英文版本对应的第二段。",
        patches: [
          {
            file: "zh/intro.tex",
            line: 3,
            oldText: "% 待补中文段落",
            newText: "% 中文段落一：社会韧性描述社区网络适应冲击的能力。",
          },
        ],
      },
      {
        mutation_id: "保留旧术语",
        description: "补段落但未同步方法文件中的旧中文术语。",
        patches: [
          {
            file: "zh/method.tex",
            line: 2,
            oldText: "% 旧术语：社会恢复力",
            newText: "% 旧术语仍未统一：社会恢复力",
          },
        ],
      },
    ],
    tags: ["双语", "段落同步", "长上下文"],
  }),

  makeV3Case({
    candidateId: "v3.content.009",
    caseSlug: "content-sample-identifiers-units",
    category: "跨文件编号与单位",
    capabilities: ["C1", "C2", "C4", "C6", "C7"],
    difficulty: "D3",
    factors: ["目标发现", "编号全局同步", "单位格式保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\begin{document}
\input{sections/samples}
\input{sections/results}
\input{sections/conclusion}
\end{document}
`,
      },
      {
        path: "sections/samples.tex",
        content: String.raw`\section{Samples}
Sample A has a thickness of 12 um. Sample B has a thickness of 15 um. Sample C has a thickness of 9 um.
`,
      },
      {
        path: "sections/results.tex",
        content: String.raw`\section{Results}
Sample A produced the highest signal. Sample B was stable. Sample C was the control.
`,
      },
      {
        path: "sections/conclusion.tex",
        content: String.raw`\section{Conclusion}
The order Sample A, Sample B, Sample C is retained in the analysis.
`,
      },
    ],
    interactionFacts: [
      "旧样品编号必须依次改为 S01、S02、S03，厚度单位统一写成微米格式。",
      "保留测量数值、样品顺序、主要结论和章节引用，不得擅自命名或删引用。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      { file: "sections/samples.tex", value: "12" },
      { file: "sections/samples.tex", value: "15" },
      { file: "sections/samples.tex", value: "9" },
      { file: "sections/results.tex", value: "highest signal" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "patch_files",
        files: [
          "sections/samples.tex",
          "sections/results.tex",
          "sections/conclusion.tex",
        ],
      },
      {
        type: "file_contains",
        file: "sections/samples.tex",
        values: [
          "S01",
          "S02",
          "S03",
          "12",
          "15",
          "9",
          "12~$\\mu$m",
          "15~$\\mu$m",
          "9~$\\mu$m",
        ],
      },
      {
        type: "file_contains",
        file: "sections/results.tex",
        values: ["S01", "S02", "S03", "highest signal"],
      },
      {
        type: "file_contains",
        file: "sections/conclusion.tex",
        values: ["S01, S02, S03"],
      },
      {
        type: "file_not_contains",
        file: "sections/samples.tex",
        values: ["Sample A", "Sample B", "Sample C", " um"],
      },
      {
        type: "file_not_contains",
        file: "sections/results.tex",
        values: ["Sample A", "Sample B", "Sample C"],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "sections/samples.tex",
        line: 2,
        oldText:
          "Sample A has a thickness of 12 um. Sample B has a thickness of 15 um. Sample C has a thickness of 9 um.",
        newText:
          "S01 has a thickness of 12~$\\mu$m. S02 has a thickness of 15~$\\mu$m. S03 has a thickness of 9~$\\mu$m.",
      },
      {
        file: "sections/results.tex",
        line: 2,
        oldText:
          "Sample A produced the highest signal. Sample B was stable. Sample C was the control.",
        newText:
          "S01 produced the highest signal. S02 was stable. S03 was the control.",
      },
      {
        file: "sections/conclusion.tex",
        line: 2,
        oldText:
          "The order Sample A, Sample B, Sample C is retained in the analysis.",
        newText: "The order S01, S02, S03 is retained in the analysis.",
      },
    ],
    oracleResponse:
      "已在样品、结果和结论文件同步编号，并将厚度单位统一为微米格式；数值、顺序和结论均保留，编译通过。",
    graderMutations: [
      {
        mutation_id: "漏改结论编号",
        description: "只更新样品和结果文件，结论仍使用旧编号。",
        patches: [
          {
            file: "sections/conclusion.tex",
            line: 2,
            oldText:
              "The order Sample A, Sample B, Sample C is retained in the analysis.",
            newText: "The original sample order is retained in the analysis.",
          },
        ],
      },
      {
        mutation_id: "改变测量数值",
        description: "同步单位时擅自把第二个样品的厚度改成 18 微米。",
        patches: [
          {
            file: "sections/samples.tex",
            line: 2,
            oldText:
              "Sample A has a thickness of 12 um. Sample B has a thickness of 15 um. Sample C has a thickness of 9 um.",
            newText:
              "S01 has a thickness of 12~$\\mu$m. S02 has a thickness of 18~$\\mu$m. S03 has a thickness of 9~$\\mu$m.",
          },
        ],
      },
    ],
    tags: ["样品编号", "单位", "跨文件"],
  }),

  makeV3Case({
    candidateId: "v3.content.012",
    caseSlug: "content-theorem-numbering",
    category: "数学结构整理",
    capabilities: ["C2", "C3", "C7"],
    difficulty: "D3",
    factors: ["环境定义", "共享计数器", "证明与陈述保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{amsthm}
\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}{Lemma}[section]
\newtheorem{proposition}{Proposition}
\begin{document}
\section{Main result}
\begin{theorem}\label{thm:main}
Every bounded sequence has a convergent subsequence.
\end{theorem}
\begin{lemma}\label{lem:aux}
The selected subsequence is bounded.
\end{lemma}
\begin{proposition}\label{prop:rate}
The convergence rate is monotone.
\end{proposition}
\begin{proof}
The claims follow from compactness.
\end{proof}
Theorem~\ref{thm:main}, Lemma~\ref{lem:aux}, and Proposition~\ref{prop:rate} are used below.
\end{document}
`,
      },
    ],
    interactionFacts: [
      "定理和引理按章编号，命题与定理共享计数器。",
      "不得改动定理、引理、命题陈述、证明或引用。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      {
        file: "main.tex",
        value: "Every bounded sequence has a convergent subsequence.",
      },
      { file: "main.tex", value: "The claims follow from compactness." },
      { file: "main.tex", value: "\\ref{thm:main}" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      {
        type: "file_contains",
        file: "main.tex",
        values: [
          "\\newtheorem{theorem}{Theorem}[section]",
          "\\newtheorem{lemma}[theorem]{Lemma}",
          "\\newtheorem{proposition}[theorem]{Proposition}",
          "Every bounded sequence has a convergent subsequence.",
          "The claims follow from compactness.",
          "\\ref{thm:main}",
          "\\ref{prop:rate}",
        ],
      },
      {
        type: "file_not_contains",
        file: "main.tex",
        values: [
          "\\newtheorem{lemma}{Lemma}[section]",
          "\\newtheorem{proposition}{Proposition}",
        ],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "main.tex",
        line: 3,
        oldText: String.raw`\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}{Lemma}[section]
\newtheorem{proposition}{Proposition}`,
        newText: String.raw`\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}[theorem]{Lemma}
\newtheorem{proposition}[theorem]{Proposition}`,
      },
    ],
    oracleResponse:
      "已将定理、引理和命题整理为按章且共享计数器的环境，保留陈述、证明和引用；编译通过。",
    graderMutations: [
      {
        mutation_id: "命题未共享计数器",
        description: "只整理引理环境，命题仍使用独立计数器。",
        patches: [
          {
            file: "main.tex",
            line: 3,
            oldText: String.raw`\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}{Lemma}[section]
\newtheorem{proposition}{Proposition}`,
            newText: String.raw`\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}[theorem]{Lemma}
\newtheorem{proposition}{Proposition}`,
          },
        ],
      },
      {
        mutation_id: "删除证明内容",
        description: "编号整理时删除原有证明，破坏受保护的数学内容。",
        patches: [
          {
            file: "main.tex",
            line: 14,
            oldText: String.raw`\begin{proof}
The claims follow from compactness.
\end{proof}`,
            newText: String.raw`\begin{proof}
The proof is omitted.
\end{proof}`,
          },
        ],
      },
    ],
    tags: ["定理环境", "数学编号", "证明保护"],
  }),

  makeV3Case({
    candidateId: "v3.content.014",
    caseSlug: "content-matrix-vector-notation",
    category: "跨文件数学记号",
    capabilities: ["C2", "C3", "C4", "C7"],
    difficulty: "D4",
    factors: ["宏定义定位", "跨文件公式一致性", "递推关系保护"],
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{article}
\usepackage{amsmath}
\input{macros.tex}
\begin{document}
\input{sections/model}
\input{sections/theory}
\end{document}
`,
      },
      {
        path: "macros.tex",
        content: String.raw`\newcommand{\vect}[1]{\vec{#1}}
\newcommand{\mat}[1]{#1}
\newcommand{\trans}{^{\top}}
`,
      },
      {
        path: "sections/model.tex",
        content: String.raw`\section{Model}
The recurrence is $\vect{x}_{t+1}=\mat{A}\vect{x}_t+\vect{u}_t$.
The energy is $\vect{x}\trans\mat{Q}\vect{x}$.
`,
      },
      {
        path: "sections/theory.tex",
        content: String.raw`\section{Theory}
The bound uses $\vect{x}\trans\mat{Q}\vect{x}$ and preserves the recurrence.
`,
      },
    ],
    interactionFacts: [
      "向量统一为粗体、矩阵统一为花体、转置统一使用上标 T。",
      "必须同步宏文件、模型和理论分析，不能改变递推关系、维度或理论结论。",
    ],
    action: "patch",
    compileMode: "required-after-apply",
    protectedInvariants: [
      {
        file: "sections/model.tex",
        value: "\\vect{x}_{t+1}=\\mat{A}\\vect{x}_t+\\vect{u}_t",
      },
      { file: "sections/theory.tex", value: "preserves the recurrence" },
    ],
    graders: [
      { type: "workspace_changed", expected: true },
      { type: "patch_files", files: ["macros.tex"] },
      {
        type: "file_contains",
        file: "macros.tex",
        values: [
          "\\newcommand{\\vect}[1]{\\mathbf{#1}}",
          "\\newcommand{\\mat}[1]{\\mathcal{#1}}",
          "\\newcommand{\\trans}{^{T}}",
        ],
      },
      {
        type: "file_contains",
        file: "sections/model.tex",
        values: [
          "\\vect{x}_{t+1}=\\mat{A}\\vect{x}_t+\\vect{u}_t",
          "\\vect{x}\\trans\\mat{Q}\\vect{x}",
        ],
      },
      {
        type: "file_contains",
        file: "sections/theory.tex",
        values: [
          "\\vect{x}\\trans\\mat{Q}\\vect{x}",
          "preserves the recurrence",
        ],
      },
      {
        type: "file_not_contains",
        file: "macros.tex",
        values: [
          "\\newcommand{\\vect}[1]{\\vec{#1}}",
          "\\newcommand{\\mat}[1]{#1}",
          "\\newcommand{\\trans}{^{\\top}}",
        ],
      },
      { type: "compile", status: "success", max_errors: 0 },
    ],
    oraclePatches: [
      {
        file: "macros.tex",
        line: 1,
        oldText: String.raw`\newcommand{\vect}[1]{\vec{#1}}
\newcommand{\mat}[1]{#1}
\newcommand{\trans}{^{\top}}`,
        newText: String.raw`\newcommand{\vect}[1]{\mathbf{#1}}
\newcommand{\mat}[1]{\mathcal{#1}}
\newcommand{\trans}{^{T}}`,
      },
    ],
    oracleResponse:
      "已集中更新向量、矩阵和转置宏，模型与理论文件继续使用同一递推关系；编译通过。",
    graderMutations: [
      {
        mutation_id: "向量宏未统一",
        description: "只更新矩阵和转置，向量仍使用旧的箭头记号。",
        patches: [
          {
            file: "macros.tex",
            line: 1,
            oldText: String.raw`\newcommand{\vect}[1]{\vec{#1}}
\newcommand{\mat}[1]{#1}
\newcommand{\trans}{^{\top}}`,
            newText: String.raw`\newcommand{\vect}[1]{\vec{#1}}
\newcommand{\mat}[1]{\mathcal{#1}}
\newcommand{\trans}{^{T}}`,
          },
        ],
      },
      {
        mutation_id: "理论文件漏同步",
        description: "宏已更新，但理论文件中的关键二次型被替换为不一致的记号。",
        patches: [
          {
            file: "sections/theory.tex",
            line: 2,
            oldText:
              "The bound uses $\\vect{x}\\trans\\mat{Q}\\vect{x}$ and preserves the recurrence.",
            newText:
              "The bound uses $\\vec{x}\\trans\\mat{Q}\\vec{x}$ and preserves the recurrence.",
          },
        ],
      },
    ],
    tags: ["矩阵", "向量", "数学宏", "跨文件"],
  }),
];
