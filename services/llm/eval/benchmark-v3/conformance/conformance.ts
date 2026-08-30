import { buildToolPool } from "../../../app/agent/tools/provider.js";
import type { ReplacementHunk } from "../../headless/replacementPatch.js";
import { H3_FILE_OPERATION_CASES } from "./fileOperationCases.js";

export type PatchSemantic = "replacement" | "insertion" | "deletion" | "empty";

export function classifyPatchSemantic(hunk: ReplacementHunk): PatchSemantic {
  if (hunk.oldText && hunk.newText) return "replacement";
  if (!hunk.oldText && hunk.newText) return "insertion";
  if (hunk.oldText && !hunk.newText) return "deletion";
  return "empty";
}

export function currentAgentToolNames() {
  return buildToolPool({ project: { files: [] } }).map((tool) => tool.name);
}

export function buildConformanceReport() {
  const toolNames = currentAgentToolNames();
  const fileOperationTools = [
    "create_file",
    "delete_file",
    "rename_file",
    "move_file",
  ];
  return {
    schema_version: 1,
    h1: {
      status: "conformant",
      semantics: ["non-empty replacement"],
    },
    h2: {
      status: "blocked",
      schema_accepts: ["insertion", "deletion"],
      insertion: {
        status: "blocked",
        reason: "生产 Accept 路径按当前光标插入，忽略 hunk.file 与 hunk.line",
      },
      deletion: {
        status: "blocked",
        reason: "生产 CodeMirror apply-fix 对空 newText 直接返回，删除不会落地",
      },
    },
    h3: {
      status: "blocked",
      runtime_tool_names: toolNames,
      missing_file_operation_tools: fileOperationTools.filter(
        (name) => !toolNames.includes(name),
      ),
      materialized_blocked_cases: H3_FILE_OPERATION_CASES.length,
      reason: "当前 Agent 没有结构化 create/delete/rename/move file 协议",
    },
  } as const;
}
