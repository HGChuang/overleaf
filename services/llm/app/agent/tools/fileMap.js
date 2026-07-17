// Shared project-file lookup helpers used by both the compile-diagnose tools
// and the general project-navigation tools. A "file map" is a Map from a
// normalized path (lowercased, no leading slash) to file content, built once
// per request from `context.project.files = [{path, content}]`. Tolerates path
// casing / leading-slash differences so a model-supplied path usually resolves.

export function buildFileMap(files = []) {
  const map = new Map();
  for (const f of files) {
    if (!f || !f.path) continue;
    const key = f.path.replace(/^\//, '');
    map.set(key, f.content || '');
    map.set(key.toLowerCase(), f.content || '');
  }
  return map;
}

export function lookupFile(fileMap, path) {
  if (!path) return null;
  const clean = path.replace(/^\//, '');
  return fileMap.get(clean) ?? fileMap.get(clean.toLowerCase()) ?? null;
}

// Read a 1-based inclusive line window from a file's content. Returns a
// structured {found, path, totalLines, content} (or a not-found shape) so the
// model gets line-numbered source it can cite. Mirrors the read_file_fragment
// behaviour the compile-diagnose prompt instructs the model to use.
export function readFileFragment(fileMap, path, startLine, endLine) {
  const content = lookupFile(fileMap, path);
  if (content == null) {
    return {
      found: false,
      message: `File not found: ${path}`,
      availablePaths: [...new Set([...fileMap.keys()].filter(k => k === k))].slice(0, 50),
    };
  }
  const lines = content.split('\n');
  const from = Math.max(0, (startLine || 1) - 1);
  const to = Math.min(lines.length, endLine || startLine || lines.length);
  if (to <= from) {
    return { found: true, path, content: '(empty range)' };
  }
  const slice = lines
    .slice(from, to)
    .map((l, i) => `${(startLine || 1) + i}: ${l}`)
    .join('\n');
  return { found: true, path, totalLines: lines.length, content: slice };
}
