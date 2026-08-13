// Dialogue brief generator: produce the SIMULATED USER's briefing for each
// dialogue fixture. The user-agent (a model-heterogeneous subagent, τ-bench
// style) must see ONLY what a real user would know — persona, opening line,
// and the hidden script — never the grading internals.
//
//   npx tsx eval/dialogueBrief.ts <fixturesDir> <outDir>
//
//   <fixturesDir>/<id>.json  →  <outDir>/<id>.md
//
// CHANNEL SEPARATION (load-bearing): grader / solution / traceAssertions /
// project files NEVER enter the brief. If the simulated user can read the
// answer key, the dialogue measures nothing. The brief header also forbids
// the user-agent from opening any fixture file itself.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

function main() {
  const [fixturesDir, outDir] = process.argv.slice(2);
  if (!fixturesDir || !outDir) {
    console.error('usage: npx tsx eval/dialogueBrief.ts <fixturesDir> <outDir>');
    process.exit(2);
  }
  const src = resolve(fixturesDir);
  const out = resolve(outDir);
  mkdirSync(out, { recursive: true });

  const names = readdirSync(src).filter(f => f.endsWith('.json')).sort();
  if (names.length === 0) {
    console.error(`no .json fixtures found in ${src}`);
    process.exit(2);
  }

  let written = 0;
  for (const name of names) {
    let task: any;
    try {
      task = JSON.parse(readFileSync(join(src, name), 'utf8'));
    } catch (e: any) {
      console.error(`skip ${name}: ${e.message}`);
      continue;
    }
    const d = task?.dialogue;
    if (!task?.id || !d?.hiddenGoal) {
      console.error(`skip ${name}: no id or dialogue.hiddenGoal — not a dialogue fixture`);
      continue;
    }

    const lines: string[] = [];
    lines.push(`# 对话评测用户 Brief：${task.id}`);
    lines.push('');
    lines.push('> **你是用户，不是助手。** 你在和 Overleaf 的 LaTeX copilot 对话，目标是让【它】把活干好。');
    lines.push('> **不许读任何 fixture 文件**（eval/fixtures/、eval/fixtures-dialogue/ 下的 .json 一律禁止打开）——你只能使用本 brief 里的信息。');
    lines.push('> 不许替 copilot 写 LaTeX、不许直接报答案式地泄露剧本细节；按人设和剧本自然推进。');
    lines.push('');
    lines.push('## 你的人设');
    lines.push('');
    lines.push(String(d.persona || '').trim());
    lines.push('');
    lines.push('## 开场白（第一轮原话发给 copilot）');
    lines.push('');
    lines.push(String(task.instruction || '').trim());
    lines.push('');
    lines.push('## 剧本（你的隐藏目标，copilot 看不到）');
    lines.push('');
    lines.push(String(d.hiddenGoal).trim());
    lines.push('');
    lines.push('## 对话方式与边界');
    lines.push('');
    lines.push(`- 信息披露模式（disclosure）：\`${d.disclosure}\``);
    lines.push(`- 你最多可以主动发 ${d.maxUserTurns} 轮（含开场白）；达到上限或你满意时结束。`);
    lines.push('- 每轮你只能看到 copilot 的用户可见回复（正文 + patch 摘要 + 编译状态），看不到它的工具细节。');
    lines.push('- 满意/可结束时发结束信号；对 patch 一律视为已接受（Accept）。');
    lines.push('');

    writeFileSync(join(out, `${task.id}.md`), lines.join('\n'));
    written++;
  }
  console.log(`[dialogue-brief] ${written}/${names.length} brief(s) → ${out}`);
}

main();
