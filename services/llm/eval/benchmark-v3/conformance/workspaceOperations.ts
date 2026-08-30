import type { EvalFile } from "../../headless/evalContext.js";

export type WorkspaceOperation =
  | { op: "create"; path: string; content: string }
  | { op: "delete"; path: string }
  | { op: "rename"; from: string; to: string };

export class UnsupportedWorkspaceOperationError extends Error {}

function assertSafePath(path: string, label: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\0") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new UnsupportedWorkspaceOperationError(
      `${label} 不是安全的项目相对路径：${JSON.stringify(path)}`,
    );
  }
}

/**
 * Validate a future H3 operation batch against an in-memory workspace.
 *
 * This is an oracle/conformance helper, not an Agent tool. The current
 * Copilot runtime has no create/delete/rename tool, so callers must not use
 * this helper to turn an H3 case into an executable Agent case.
 */
export function applyWorkspaceOperations(
  files: readonly EvalFile[],
  operations: readonly WorkspaceOperation[],
): EvalFile[] {
  if (operations.length === 0) {
    throw new UnsupportedWorkspaceOperationError("文件操作批次不能为空");
  }
  const next = new Map(files.map((file) => [file.path, file.content]));

  for (const [index, operation] of operations.entries()) {
    if (operation.op === "create") {
      assertSafePath(operation.path, `operation ${index} create.path`);
      if (next.has(operation.path)) {
        throw new UnsupportedWorkspaceOperationError(
          `operation ${index} 不能覆盖已有文件 ${operation.path}`,
        );
      }
      next.set(operation.path, operation.content);
      continue;
    }

    if (operation.op === "delete") {
      assertSafePath(operation.path, `operation ${index} delete.path`);
      if (!next.has(operation.path)) {
        throw new UnsupportedWorkspaceOperationError(
          `operation ${index} 无法删除不存在的文件 ${operation.path}`,
        );
      }
      next.delete(operation.path);
      continue;
    }

    assertSafePath(operation.from, `operation ${index} rename.from`);
    assertSafePath(operation.to, `operation ${index} rename.to`);
    const content = next.get(operation.from);
    if (content === undefined) {
      throw new UnsupportedWorkspaceOperationError(
        `operation ${index} 无法重命名不存在的文件 ${operation.from}`,
      );
    }
    if (next.has(operation.to)) {
      throw new UnsupportedWorkspaceOperationError(
        `operation ${index} 的目标文件已存在 ${operation.to}`,
      );
    }
    next.delete(operation.from);
    next.set(operation.to, content);
  }

  return [...next].map(([path, content]) => ({ path, content }));
}
