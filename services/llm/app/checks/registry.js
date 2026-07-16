import { CitationScanner } from './citationScanner.js';

class EmptyScanner {
  constructor(type) {
    this.type = type;
  }

  scan() {
    return [];
  }
}

const registry = new Map([
  ['citations', new CitationScanner()],
  ['references', new EmptyScanner('references')],
  ['figures_tables', new EmptyScanner('figures_tables')],
  ['terminology', new EmptyScanner('terminology')],
]);

export function getScanner(type) {
  return registry.get(type) || null;
}

export function listScanners() {
  return [...registry.keys()];
}
