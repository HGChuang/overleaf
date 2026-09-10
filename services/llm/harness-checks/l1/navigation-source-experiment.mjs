import { navigationCases } from './navigation-experiment.mjs';
export const sourceNavigationExperiment={id:'archive-source-selector-v1',repeats:2,
 factor:'Only add an exact source-path selector to read_context_history; server resolves durable read receipts, original message reader and 800-unit pages unchanged',
 controls:'same paired seed, production deterministic checkpoint, user/task/files/model/step limit; AB/BA order; clean DB per arm; no random summary',
 adoption:'D task success at least A, all D target evidence recovered, fewer off-target history attempts and model calls, lower aggregate reported input tokens; no hidden retries; production regression required',
 limitation:'synthetic development tasks with one target receipt; ambiguous/missing/stale receipt resolution checked separately by deterministic tests'};
export const sourceNavigationCases=navigationCases.filter(c=>!c.pairId.endsWith('-3')).map(c=>({...c,
 id:c.id.replace('NAV-','NAVS-').replace(/-B$/,'-D'),pairId:c.pairId.replace('NAV-','NAVS-'),arm:c.arm==='B'?'D':'A'}));
