import { hashValue } from './canonicalTrace.js'

export interface WorkspaceFile {
  path: string
  content: string
}

export function workspaceHash(files: WorkspaceFile[]): string {
  const normalized = files
    .map((file) => ({
      path: file.path.replace(/^\/+/, ''),
      content: file.content,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  return hashValue(normalized)
}
