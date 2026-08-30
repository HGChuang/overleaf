import { workspaceHash } from "../../headless/workspaceState.js";
import {
  applyReplacementPatch,
  type ReplacementHunk,
} from "../../headless/replacementPatch.js";
import { BENCHMARK_V3_CANDIDATE_SEEDS } from "../candidateSeeds.js";
import {
  applyWorkspaceOperations,
  type WorkspaceOperation,
} from "./workspaceOperations.js";

export interface H3FileOperationCase {
  schema_version: 1;
  case_id: string;
  source_candidate_id: string;
  lifecycle: "conformance-blocked";
  language: "zh-CN";
  user_goal: string;
  fixture: {
    main_file: string;
    files: Array<{ path: string; content: string }>;
    sha256: string;
  };
  expected: {
    operations: WorkspaceOperation[];
    companion_patches: ReplacementHunk[];
    final_main_file: string;
    final_workspace_sha256: string;
  };
  harness: {
    minimum_support: "H3";
    executable: false;
    blocked_by: "missing-agent-file-operation-protocol";
  };
  tags: string[];
}

interface Input {
  candidateId: string;
  slug: string;
  mainFile: string;
  finalMainFile?: string;
  files: Array<{ path: string; content: string }>;
  operations: WorkspaceOperation[];
  companionPatches?: ReplacementHunk[];
  tags: string[];
}

function makeCase(input: Input): H3FileOperationCase {
  const candidate = BENCHMARK_V3_CANDIDATE_SEEDS.find(
    (item) => item.candidate_id === input.candidateId,
  );
  if (!candidate) throw new Error(`未知 candidate：${input.candidateId}`);
  const operatedFiles = applyWorkspaceOperations(input.files, input.operations);
  const companionPatches = input.companionPatches || [];
  const finalFiles = companionPatches.length
    ? [
        ...applyReplacementPatch(
          new Map(operatedFiles.map((file) => [file.path, file.content])),
          companionPatches,
        ).files,
      ].map(([path, content]) => ({ path, content }))
    : operatedFiles;
  return {
    schema_version: 1,
    case_id: `v3.h3.${input.slug}.v1`,
    source_candidate_id: input.candidateId,
    lifecycle: "conformance-blocked",
    language: "zh-CN",
    user_goal: candidate.initial_user_message,
    fixture: {
      main_file: input.mainFile,
      files: input.files,
      sha256: workspaceHash(input.files),
    },
    expected: {
      operations: input.operations,
      companion_patches: companionPatches,
      final_main_file: input.finalMainFile || input.mainFile,
      final_workspace_sha256: workspaceHash(finalFiles),
    },
    harness: {
      minimum_support: "H3",
      executable: false,
      blocked_by: "missing-agent-file-operation-protocol",
    },
    tags: input.tags,
  };
}

const articleStart = "\\documentclass{article}\n\\begin{document}\n";
const articleEnd = "\\end{document}\n";

export const H3_FILE_OPERATION_CASES: H3FileOperationCase[] = [
  makeCase({
    candidateId: "v3.content.018",
    slug: "split-monolith-create-sections",
    mainFile: "main.tex",
    files: [
      {
        path: "main.tex",
        content: `${articleStart}\\section{Introduction}\nBackground.\n\\section{Method}\nMethod description.\n${articleEnd}`,
      },
    ],
    operations: [
      {
        op: "create",
        path: "sections/introduction.tex",
        content: "\\section{Introduction}\nBackground.\n",
      },
      {
        op: "create",
        path: "sections/method.tex",
        content: "\\section{Method}\nMethod description.\n",
      },
    ],
    companionPatches: [
      {
        file: "main.tex",
        line: 2,
        oldText:
          "\\section{Introduction}\nBackground.\n\\section{Method}\nMethod description.",
        newText: "\\input{sections/introduction}\n\\input{sections/method}",
      },
    ],
    tags: ["新建文件", "拆分项目", "多操作"],
  }),
  makeCase({
    candidateId: "v3.artifact.024",
    slug: "rename-root-document",
    mainFile: "draft.tex",
    finalMainFile: "final-report.tex",
    files: [
      {
        path: "draft.tex",
        content: `${articleStart}Final report.\n${articleEnd}`,
      },
    ],
    operations: [{ op: "rename", from: "draft.tex", to: "final-report.tex" }],
    tags: ["重命名文件", "主文件", "单操作"],
  }),
  makeCase({
    candidateId: "v3.artifact.034",
    slug: "rename-included-log",
    mainFile: "main.tex",
    files: [
      {
        path: "main.tex",
        content: `${articleStart}\\input{logs/week-01}\n${articleEnd}`,
      },
      { path: "logs/week-01.tex", content: "Week one log.\n" },
    ],
    operations: [
      { op: "rename", from: "logs/week-01.tex", to: "logs/week-1.tex" },
    ],
    companionPatches: [
      {
        file: "main.tex",
        line: 3,
        oldText: "\\input{logs/week-01}",
        newText: "\\input{logs/week-1}",
      },
    ],
    tags: ["重命名文件", "跨文件引用", "单操作"],
  }),
  makeCase({
    candidateId: "v3.artifact.007",
    slug: "delete-obsolete-figure-source",
    mainFile: "main.tex",
    files: [
      {
        path: "main.tex",
        content: `${articleStart}\\input{chapters/chapter3}\n${articleEnd}`,
      },
      {
        path: "chapters/chapter3.tex",
        content:
          "\\section{Interface}\n\\input{figures/old-interface}\nThe obsolete screenshot shows a cancelled flow.\nThe current interface is documented below.\n",
      },
      {
        path: "figures/old-interface.tex",
        content: "Obsolete interface placeholder.\n",
      },
    ],
    operations: [{ op: "delete", path: "figures/old-interface.tex" }],
    companionPatches: [
      {
        file: "chapters/chapter3.tex",
        line: 2,
        oldText:
          "\\input{figures/old-interface}\nThe obsolete screenshot shows a cancelled flow.\n",
        newText: "% Obsolete screenshot and its dedicated sentence removed.\n",
      },
    ],
    tags: ["删除文件", "过期资源", "单操作"],
  }),
  makeCase({
    candidateId: "v3.artifact.008",
    slug: "move-figure-assets",
    mainFile: "main.tex",
    files: [
      {
        path: "main.tex",
        content: `${articleStart}Figure resources.\n${articleEnd}`,
      },
      { path: "architecture.svg", content: "<svg><!-- architecture --></svg>" },
      { path: "results.svg", content: "<svg><!-- results --></svg>" },
    ],
    operations: [
      {
        op: "rename",
        from: "architecture.svg",
        to: "figures/architecture.svg",
      },
      { op: "rename", from: "results.svg", to: "figures/results.svg" },
    ],
    tags: ["移动文件", "资源目录", "多操作"],
  }),
  makeCase({
    candidateId: "v3.artifact.021",
    slug: "reorganize-project-tree",
    mainFile: "main.tex",
    files: [
      {
        path: "main.tex",
        content: `${articleStart}\\input{method}\n${articleEnd}`,
      },
      { path: "method.tex", content: "\\section{Method}\nMethod content.\n" },
      {
        path: "table1.tex",
        content: "\\begin{tabular}{c}Result\\end{tabular}\n",
      },
      { path: "refs.bib", content: "@book{sample,title={Sample Reference}}\n" },
    ],
    operations: [
      { op: "rename", from: "method.tex", to: "chapters/method.tex" },
      { op: "rename", from: "table1.tex", to: "tables/table1.tex" },
      { op: "rename", from: "refs.bib", to: "bibliography/refs.bib" },
    ],
    companionPatches: [
      {
        file: "main.tex",
        line: 3,
        oldText: "\\input{method}",
        newText: "\\input{chapters/method}",
      },
    ],
    tags: ["移动文件", "目录重构", "多操作"],
  }),
];

export function validateH3FileOperationCases(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const candidates = new Set<string>();
  for (const item of H3_FILE_OPERATION_CASES) {
    if (ids.has(item.case_id)) errors.push(`重复 case_id：${item.case_id}`);
    if (candidates.has(item.source_candidate_id)) {
      errors.push(`重复 candidate：${item.source_candidate_id}`);
    }
    ids.add(item.case_id);
    candidates.add(item.source_candidate_id);
    if (!/\p{Script=Han}/u.test(item.user_goal)) {
      errors.push(`${item.case_id}: 用户目标不是中文`);
    }
    if (workspaceHash(item.fixture.files) !== item.fixture.sha256) {
      errors.push(`${item.case_id}: fixture hash 不一致`);
    }
    try {
      const operatedFiles = applyWorkspaceOperations(
        item.fixture.files,
        item.expected.operations,
      );
      const finalFiles = item.expected.companion_patches.length
        ? [
            ...applyReplacementPatch(
              new Map(operatedFiles.map((file) => [file.path, file.content])),
              item.expected.companion_patches,
            ).files,
          ].map(([path, content]) => ({ path, content }))
        : operatedFiles;
      if (workspaceHash(finalFiles) !== item.expected.final_workspace_sha256) {
        errors.push(`${item.case_id}: final workspace hash 不一致`);
      }
      if (
        !finalFiles.some((file) => file.path === item.expected.final_main_file)
      ) {
        errors.push(`${item.case_id}: 最终主文件不存在`);
      }
    } catch (error) {
      errors.push(
        `${item.case_id}: oracle 文件操作失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return errors;
}

export function h3OracleFiles(item: H3FileOperationCase) {
  const operatedFiles = applyWorkspaceOperations(
    item.fixture.files,
    item.expected.operations,
  );
  if (!item.expected.companion_patches.length) return operatedFiles;
  return [
    ...applyReplacementPatch(
      new Map(operatedFiles.map((file) => [file.path, file.content])),
      item.expected.companion_patches,
    ).files,
  ].map(([path, content]) => ({ path, content }));
}
