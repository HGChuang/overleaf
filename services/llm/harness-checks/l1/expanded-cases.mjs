import { cases as base } from './cases.mjs';
const tex = String.raw;
const article = body => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;
const region = (file, before, reference) => ({ file, before, reference, rule: { exact: reference } });
const edit = (id, family, prompt, files, regions, extra = {}) => ({ id: `L1-${id}`, family, split: 'dev', outcome: 'proposal', prompt,
  files, regions, baselineCompiles: true, compileRequired: true, agentCompileRequired: true, ...extra });
const keep = '只提交候选并编译验证；保留所有未要求改变的源码、注释、数值和引用。';
const added = [];
added.push(edit(13, 'dependency-chain', '沿 main.tex 的输入和宏别名找到正文实际使用的样本量定义，将其从 12 改成 16，不展开或改写引用宏。'+keep,
  { 'main.tex': tex`\documentclass{article}
\input{config/aliases}
\begin{document}
We retain $\samplesize$ samples.
\end{document}
`, 'config/aliases.tex': '\\input{config/constants}\n\\newcommand{\\samplesize}{\\cohortsize}\n', 'config/constants.tex': '\\newcommand{\\cohortsize}{12}\n\\newcommand{\\unusedsize}{12}\n' },
  [region('config/constants.tex', '\\newcommand{\\cohortsize}{12}', '\\newcommand{\\cohortsize}{16}')], { evidenceFiles: ['main.tex','config/aliases.tex','config/constants.tex'] }));
added.push(edit(14, 'scoped-override', '仅让 Results 节局部分组实际使用的 threshold 从 0.05 改为 0.01，全局阈值和其他节保持不变。'+keep,
  { 'main.tex': '\\documentclass{article}\n\\input{defs}\n\\begin{document}\nGlobal $\\threshold$.\n\\input{sections/results}\nGlobal $\\threshold$.\n\\end{document}\n', 'defs.tex': '\\newcommand{\\threshold}{0.05}\n', 'sections/results.tex': '\\section{Results}\n{\\renewcommand{\\threshold}{0.05}\nLocal threshold $\\threshold$.}\n' },
  [region('sections/results.tex', '\\renewcommand{\\threshold}{0.05}', '\\renewcommand{\\threshold}{0.01}')], { evidenceFiles: ['main.tex','defs.tex','sections/results.tex'] }));
const labelFiles = { 'main.tex': article('\\input{sections/method}\n\\input{sections/results}\n\\input{appendix}'), 'sections/method.tex': '\\section{Method}\\label{sec:method}\nProtected method.\n', 'sections/results.tex': 'See Section~\\ref{sec:method}.\n', 'appendix.tex': 'Details in Section~\\ref{sec:method}.\n% Keep label spelling in this historical comment: sec:method\n' };
added.push(edit(15, 'reference-fanout', '把方法节标签 sec:method 改为 sec:approach，同步所有实际 LaTeX 引用，但保留历史注释中的旧拼写。'+keep,labelFiles,
  [region('sections/method.tex','\\label{sec:method}','\\label{sec:approach}'),region('sections/results.tex','\\ref{sec:method}','\\ref{sec:approach}'),region('appendix.tex','\\ref{sec:method}','\\ref{sec:approach}')], { evidenceFiles: Object.keys(labelFiles) }));
const bibFiles = { 'main.tex': article('\\input{intro}\n\\input{discussion}\n\\input{refs}'), 'intro.tex': 'Baseline~\\cite{smith2024}.\n', 'discussion.tex': 'Compare~\\cite{smith2024,jones2023}.\n', 'refs.tex': '\\begin{thebibliography}{9}\n\\bibitem{smith2024} A. Smith. Baseline. 2024.\n\\bibitem{jones2023} J. Jones. Control. 2023.\n\\end{thebibliography}\n' };
added.push(edit(16,'citation-fanout','把 smith2024 重命名为 smithBaseline，包括多键 cite；不要改变其他键和文献信息。'+keep,bibFiles,
  [region('intro.tex','\\cite{smith2024}','\\cite{smithBaseline}'),region('discussion.tex','\\cite{smith2024,jones2023}','\\cite{smithBaseline,jones2023}'),region('refs.tex','\\bibitem{smith2024}','\\bibitem{smithBaseline}')],{evidenceFiles:Object.keys(bibFiles)}));
added.push(edit(17,'macro-origin-compile','修复正文 Important finding 的加粗命令编译错误。问题可能在共享命令定义中，请沿调用找到原因；不改调用点。'+keep,
  {'main.tex':'\\documentclass{article}\n\\input{commands}\n\\begin{document}\n\\input{body}\n\\end{document}\n','commands.tex':'\\newcommand{\\highlight}[1]{\\txetbf{#1}}\n','body.tex':'Score 91.2\\%. \\highlight{Important finding}\n'},
  [region('commands.tex','\\txetbf{#1}','\\textbf{#1}')],{baselineCompiles:false,evidenceFiles:['main.tex','commands.tex','body.tex']}));
added.push(edit(18,'package-dependency','修复 equations.tex 的 align 环境错误，正确加载所需宏包，保留全部公式和正文，不要改换数学环境。'+keep,
  {'main.tex':article('\\input{equations}'),'equations.tex':'\\begin{align}\nx &= 12 \\\\\ny &= 16\n\\end{align}\n'},
  [region('main.tex','\\documentclass{article}','\\documentclass{article}\n\\usepackage{amsmath}')],{baselineCompiles:false,evidenceFiles:['main.tex','equations.tex']}));
added.push(edit(19,'active-include-decoy','只把实际由主文档加载的 Method 节标题改为 Approach；同名的草稿文件不动。请确认输入链。'+keep,
  {'main.tex':article('\\input{driver}'),'driver.tex':'% draft/method is historical.\n\\input{sections/method}\n','sections/method.tex':'\\section{Method}\nWe retain 12 samples.\n','draft/method.tex':'\\section{Method}\nWe retain 12 samples.\n'},
  [region('sections/method.tex','\\section{Method}','\\section{Approach}')],{evidenceFiles:['main.tex','driver.tex','sections/method.tex']}));
added.push(edit(20,'compound-dependency','把样本宏改为 16，并同步摘要和结论中当前实验的显式 12 samples；不要改对照实验的 12 samples。'+keep,
  {'main.tex':'\\documentclass{article}\n\\input{defs}\n\\begin{document}\n\\input{abstract}\n\\input{conclusion}\n$\\samplesize$ samples.\n\\end{document}\n','defs.tex':'\\newcommand{\\samplesize}{12}\n','abstract.tex':'Current experiment uses 12 samples. Control uses 12 samples.\n','conclusion.tex':'Our current experiment retains 12 samples.\n'},
  [region('defs.tex','\\newcommand{\\samplesize}{12}','\\newcommand{\\samplesize}{16}'),region('abstract.tex','Current experiment uses 12 samples.','Current experiment uses 16 samples.'),region('conclusion.tex','Our current experiment retains 12 samples.','Our current experiment retains 16 samples.')],{evidenceFiles:['main.tex','defs.tex','abstract.tex','conclusion.tex']}));
const repeatedCaption = '\\begin{table}[h]\n\\caption{Results}\\label{tab:first}\nA\n\\end{table}\n\\begin{table}[h]\n\\caption{Results}\\label{tab:second}\nB\n\\end{table}';
added.push(edit(21,'duplicate-anchor','只把 tab:second 的 Results 标题改为 Replication results，第一张表不动。'+keep,{'main.tex':article(repeatedCaption)},[region('main.tex','\\caption{Results}\\label{tab:second}','\\caption{Replication results}\\label{tab:second}')]));
added.push(edit(22,'repeated-paragraph','只在 Replication 节把 We retain 12 samples. 改成 We retain 16 samples.，Main 节完全相同的句子不能动。'+keep,
  {'main.tex':article('\\section{Main}\nWe retain 12 samples.\n\\section{Replication}\nWe retain 12 samples.')},[region('main.tex','\\section{Replication}\nWe retain 12 samples.','\\section{Replication}\nWe retain 16 samples.')]));
added.push(edit(23,'overlapping-intents','同一句中完成两项修改：将 preliminary results 改成 final results；并把整个 final results 短语加粗。注意合并有交叠的修改范围。'+keep,
  {'main.tex':article('We report preliminary results on 12 samples; no significance claim.')},[region('main.tex','preliminary results','\\textbf{final results}')]));
added.push(edit(24,'duplicate-crlf-block','仅把 Replication 下的 verbatim 数据块 score: 91.2 改为 score: 94.5。Main 下相同数据块不动；保留 CRLF。'+keep,
  {'main.tex':article('\\section{Main}\n\\begin{verbatim}\nscore: 91.2\nsamples: 12\n\\end{verbatim}\n\\section{Replication}\n\\begin{verbatim}\nscore: 91.2\nsamples: 12\n\\end{verbatim}').replaceAll('\n','\r\n')},
  [region('main.tex','\\section{Replication}\r\n\\begin{verbatim}\r\nscore: 91.2','\\section{Replication}\r\n\\begin{verbatim}\r\nscore: 94.5')]));
// Historical-only policy evidence is a declared synthetic precondition. It is
// deliberately absent from the current project and must be recovered verbatim.
for (let i=0;i<4;i++) {
  const title=['Sensitivity results','Replication results','Robustness results','Held-out results'][i];
  const policy = (i>=2 ? '% Earlier discussion, not the final decision.\n'.repeat(24) : '') + `% FINAL CAPTION: ${title}\n% Preserve 91.2 percent, 12 samples, and negation.\n`;
  added.push(edit(25+i,'archived-policy','请重新读回会话归档中 prior-decision.tex 的原始工具证据（不是只看摘要），按 FINAL CAPTION 决定改 main.tex 的 Draft 标题。读取当前源码后再提交，保留数据与否定结论。'+keep,
    {'main.tex':article('\\section{Draft}\nAccuracy is 91.2\\% on 12 samples. We do not claim significance.')},[region('main.tex','\\section{Draft}',`\\section{${title}}`)],
    {seed:{manualCompact:true,policy,authorTexts:['后续按 prior-decision.tex 的 FINAL CAPTION 决策；旧记录只作决策证据，编辑前必须读当前源码。'],fillerBytes:24000},requireHistory:true,requireHistoryContinuation:i>=2}));
}
for(let i=0;i<2;i++){
 const files={'main.tex':article('\\section{Draft}\nProtected 91.2 percent.')};
 for(let n=0;n<65+i*15;n++)files[`supplement/record-${String(n).padStart(3,'0')}-${'archived-source-'.repeat(3)}.tex`]='% Auxiliary source, unchanged.\n';
 added.push(edit(29+i,'oversize-live-receipt','先调用 list_project_files 核对项目目录；若目录回执被归档，请至少读回原始回执首页确认 main.tex，再将其 Draft 节标题改为 Final。'+keep,files,[region('main.tex','\\section{Draft}','\\section{Final}')],{requireLiveArchive:true,requireHistory:true}));
}
for(let i=0;i<6;i++){
 const crlf=i===5;
 const text=article('\\section{Draft}\nAccuracy is 91.2\\% on 12 samples. We do not claim statistical significance~\\cite{smith2024}.\n\\begin{thebibliography}{1}\n\\bibitem{smith2024} A. Smith. Baseline. 2024.\n\\end{thebibliography}');
 const target=['Overview','Results','Evaluation','Analysis','Discussion','Conclusion'][i];
 const requests=[`本轮只允许把 main.tex 的 Draft 节标题改成 ${i%2?'Earlier title':target}。必须原样保留 91.2\\%、12 samples、否定结论、statistical 限定、citation 键和文献信息，其他字节不变。`];
 if(i%2)requests.push(`更正：最终节标题是 ${target}，撤销 Earlier title。之前所有保留要求仍有效。`);
 added.push(edit(31+i,'window-constraint-retention','继续完成我前面确定的最终修改，仅提交候选，编译验证；不要扩大范围。',{'main.tex':crlf?text.replaceAll('\n','\r\n'):text},[region('main.tex','\\section{Draft}',`\\section{${target}}`)],
  {effectiveWindow:65536,seed:{authorTexts:requests,fillerBytes:17000+i*1000},requireCompaction:true,protectedTerms:['91.2\\%','12 samples','do not claim statistical significance','smith2024']}));
}
export const expandedCases=[...base,...added];
