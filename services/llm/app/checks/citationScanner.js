import { ScannerBase } from './scannerBase.js';
import { createIssue } from './issue.js';

const CITE_REGEX = /\\(?:cite|nocite)(?:\[[^\]]*\])?\{([^}]+)\}/g;
const BIB_REGEX = /@\w+\s*\{\s*([^,\s]+)\s*,/g;

function collectBibKeys(files = []) {
  const keys = new Set();
  for (const file of files) {
    if (!file?.path?.endsWith('.bib') || typeof file.content !== 'string') {
      continue;
    }
    let match;
    while ((match = BIB_REGEX.exec(file.content)) !== null) {
      keys.add(match[1]);
    }
    BIB_REGEX.lastIndex = 0;
  }
  return keys;
}

function lineNumberForOffset(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

export class CitationScanner extends ScannerBase {
  constructor() {
    super('citations');
  }

  scan(projectSnapshot = {}) {
    const files = Array.isArray(projectSnapshot.files) ? projectSnapshot.files : [];
    const bibKeys = collectBibKeys(files);
    const issues = [];

    for (const file of files) {
      if (!file?.path?.endsWith('.tex') || typeof file.content !== 'string') {
        continue;
      }
      let match;
      while ((match = CITE_REGEX.exec(file.content)) !== null) {
        const keys = match[1]
          .split(',')
          .map(key => key.trim())
          .filter(Boolean);
        for (const key of keys) {
          if (bibKeys.has(key)) {
            continue;
          }
          issues.push(
            createIssue({
              type: this.type,
              title: `Undefined citation: ${key}`,
              description: `正文中引用了 ${key}，但 bibliography 中未找到。`,
              location: {
                file: file.path,
                line: lineNumberForOffset(file.content, match.index),
              },
              metadata: {
                citationKey: key,
              },
            })
          );
        }
      }
      CITE_REGEX.lastIndex = 0;
    }

    return issues;
  }
}
