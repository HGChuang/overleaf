export interface ReplacementHunk {
  file: string | null
  line: number | null
  oldText: string
  newText: string
}

export interface AppliedReplacement {
  file: string
  start: number
  oldText: string
  newText: string
}

export class UnsupportedPatchError extends Error {}

function lineAt(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length
}

function occurrences(content: string, needle: string): number[] {
  const offsets: number[] = []
  let from = 0
  while (from <= content.length) {
    const offset = content.indexOf(needle, from)
    if (offset === -1) break
    offsets.push(offset)
    from = offset + Math.max(needle.length, 1)
  }
  return offsets
}

/**
 * Apply the subset of submit_patch that the first headless case supports.
 *
 * This mirrors the browser's replacement anchor: choose the oldText
 * occurrence nearest the 1-based line hint, or the first occurrence when the
 * hint is absent. Insertions, deletions and file-less hunks are deliberately
 * rejected instead of being guessed.
 */
export function applyReplacementPatch(
  files: ReadonlyMap<string, string>,
  hunks: readonly ReplacementHunk[]
): { files: Map<string, string>; applied: AppliedReplacement[] } {
  if (hunks.length === 0) {
    throw new UnsupportedPatchError('patch has no hunks')
  }

  const next = new Map(files)
  const applied: AppliedReplacement[] = []

  for (const [index, hunk] of hunks.entries()) {
    if (!hunk.file) {
      throw new UnsupportedPatchError(`hunk ${index} has no file`)
    }
    if (!hunk.oldText || !hunk.newText) {
      throw new UnsupportedPatchError(
        `hunk ${index} is not a non-empty replacement`
      )
    }
    const content = next.get(hunk.file)
    if (content === undefined) {
      throw new UnsupportedPatchError(
        `hunk ${index} references unknown file ${hunk.file}`
      )
    }
    const matches = occurrences(content, hunk.oldText)
    if (matches.length === 0) {
      throw new UnsupportedPatchError(
        `hunk ${index} oldText was not found in ${hunk.file}`
      )
    }

    let start = matches[0]
    if (Number.isInteger(hunk.line) && (hunk.line as number) > 0) {
      start = matches.reduce((best, candidate) => {
        const bestDistance = Math.abs(lineAt(content, best) - (hunk.line as number))
        const candidateDistance = Math.abs(
          lineAt(content, candidate) - (hunk.line as number)
        )
        return candidateDistance < bestDistance ? candidate : best
      }, start)
    }

    next.set(
      hunk.file,
      content.slice(0, start) + hunk.newText + content.slice(start + hunk.oldText.length)
    )
    applied.push({
      file: hunk.file,
      start,
      oldText: hunk.oldText,
      newText: hunk.newText,
    })
  }

  return { files: next, applied }
}
