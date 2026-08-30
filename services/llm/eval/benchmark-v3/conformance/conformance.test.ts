import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEditTools } from "../../../app/agent/tools/editTools.js";
import { toPatchBlock } from "../../../app/agent/patchBlocks.js";
import {
  applyReplacementPatch,
  UnsupportedPatchError,
} from "../../headless/replacementPatch.js";
import {
  buildConformanceReport,
  classifyPatchSemantic,
} from "./conformance.js";
import {
  H3_FILE_OPERATION_CASES,
  validateH3FileOperationCases,
} from "./fileOperationCases.js";
import {
  applyWorkspaceOperations,
  UnsupportedWorkspaceOperationError,
} from "./workspaceOperations.js";
import { V3_EXECUTABLE_CASES } from "../executable/index.js";

test("H2 classifier 区分 replacement、insertion、deletion 与空 hunk", () => {
  assert.equal(
    classifyPatchSemantic({
      file: "main.tex",
      line: 1,
      oldText: "甲",
      newText: "乙",
    }),
    "replacement",
  );
  assert.equal(
    classifyPatchSemantic({
      file: "main.tex",
      line: 1,
      oldText: "",
      newText: "乙",
    }),
    "insertion",
  );
  assert.equal(
    classifyPatchSemantic({
      file: "main.tex",
      line: 1,
      oldText: "甲",
      newText: "",
    }),
    "deletion",
  );
  assert.equal(
    classifyPatchSemantic({
      file: "main.tex",
      line: 1,
      oldText: "",
      newText: "",
    }),
    "empty",
  );
});

test("submit_patch schema 接受 H2 形状，但 H1 applicator 不会假应用", async () => {
  const tool = buildEditTools({
    project: { files: [{ path: "main.tex", content: "甲\n" }] },
    context: { currentFile: "main.tex" },
  })[0];
  const insertion = { file: "main.tex", line: 1, oldText: "", newText: "乙" };
  const deletion = { file: "main.tex", line: 1, oldText: "甲", newText: "" };
  await assert.doesNotReject(() =>
    tool.execute("insert", { hunks: [insertion] }),
  );
  await assert.doesNotReject(() =>
    tool.execute("delete", { hunks: [deletion] }),
  );
  assert.equal(
    toPatchBlock({ hunks: [insertion], summary: "插入" }, 0)?.hunks.length,
    1,
  );
  assert.equal(
    toPatchBlock({ hunks: [deletion], summary: "删除" }, 0)?.hunks.length,
    1,
  );
  assert.throws(
    () => applyReplacementPatch(new Map([["main.tex", "甲\n"]]), [insertion]),
    UnsupportedPatchError,
  );
  assert.throws(
    () => applyReplacementPatch(new Map([["main.tex", "甲\n"]]), [deletion]),
    UnsupportedPatchError,
  );
});

test("H2/H3 conformance gate 诚实阻止当前 runtime 宣称支持", () => {
  const report = buildConformanceReport();
  assert.equal(report.h1.status, "conformant");
  assert.equal(report.h2.status, "blocked");
  assert.equal(report.h2.insertion.status, "blocked");
  assert.equal(report.h2.deletion.status, "blocked");
  assert.equal(report.h3.status, "blocked");
  assert.deepEqual(report.h3.missing_file_operation_tools, [
    "create_file",
    "delete_file",
    "rename_file",
    "move_file",
  ]);
});

test("6 个中文 H3 文件操作 family 已物化但不进入 PASS/FAIL", () => {
  assert.equal(H3_FILE_OPERATION_CASES.length, 6);
  assert.deepEqual(validateH3FileOperationCases(), []);
  assert.ok(H3_FILE_OPERATION_CASES.every((item) => !item.harness.executable));
  assert.ok(
    H3_FILE_OPERATION_CASES.every(
      (item) => item.lifecycle === "conformance-blocked",
    ),
  );
});

test("executable 与 blocked H3 family 不复用 source lineage", () => {
  const sources = [
    ...V3_EXECUTABLE_CASES.map((item) => item.source_candidate_id),
    ...H3_FILE_OPERATION_CASES.map((item) => item.source_candidate_id),
  ];
  assert.equal(sources.length, 79);
  assert.equal(new Set(sources).size, sources.length);
});

test("conformance report 与当前 H3 fixture/oracle hash 及 CLSI 结果一致", () => {
  const report = JSON.parse(
    readFileSync(new URL("conformance-report.json", import.meta.url), "utf8"),
  ) as {
    valid: boolean;
    compile_validation: boolean;
    file_operation_cases: Array<{
      case_id: string;
      fixture_hash: string;
      final_workspace_hash: string;
      initial_compile: { valid: boolean };
      final_compile: { valid: boolean };
    }>;
  };
  assert.equal(report.valid, true);
  assert.equal(report.compile_validation, true);
  assert.equal(report.file_operation_cases.length, 6);
  const byId = new Map(
    report.file_operation_cases.map((item) => [item.case_id, item]),
  );
  for (const item of H3_FILE_OPERATION_CASES) {
    const recorded = byId.get(item.case_id);
    assert.ok(recorded, item.case_id);
    assert.equal(recorded.fixture_hash, item.fixture.sha256);
    assert.equal(
      recorded.final_workspace_hash,
      item.expected.final_workspace_sha256,
    );
    assert.equal(recorded.initial_compile.valid, true);
    assert.equal(recorded.final_compile.valid, true);
  }
});

test("H3 oracle applicator 拒绝路径穿越、覆盖、缺失源且保持输入不变", () => {
  const before = [{ path: "main.tex", content: "甲" }];
  for (const operations of [
    [{ op: "create" as const, path: "../逃逸.tex", content: "乙" }],
    [{ op: "create" as const, path: "main.tex", content: "乙" }],
    [{ op: "delete" as const, path: "missing.tex" }],
    [{ op: "rename" as const, from: "missing.tex", to: "new.tex" }],
  ]) {
    assert.throws(
      () => applyWorkspaceOperations(before, operations),
      UnsupportedWorkspaceOperationError,
    );
    assert.deepEqual(before, [{ path: "main.tex", content: "甲" }]);
  }
});
