import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { applyHunks, compileOutcome } from '@overleaf/copilot-contracts';
import { candidateText } from '../app/agent/context/source-evidence.js';
import { buildEditTools } from '../app/agent/tools/editTools.js';
import { buildCompileTools } from '../app/agent/tools/compileTools.js';
import { fixture, hash, patchArgs, projectId, userId } from './helpers.js';

const require = createRequire(import.meta.url);
// Execute complete production CommonJS controllers. Only external services
// are substituted; do not copy their patch/verification algorithms into tests.
function loadController(name: string, deps: Record<string, any>) {
  const filename = `/overleaf/services/web/app/src/Features/Copilot/${name}.js`;
  const module = { exports: {} as any };
  const localRequire = (id: string) => {
    if (Object.hasOwn(deps, id)) return deps[id];
    if (id.startsWith('node:') || id === '@overleaf/copilot-contracts') return require(id);
    throw new Error(`Unmocked controller dependency: ${id}`);
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: localRequire, Buffer, Date }, { filename });
  return module.exports;
}
function backend(source = 'Hello world.\n', options: any = {}) {
  const tables = new Map<string, Map<string, any>>();
  const db = { collection(name: string) {
    if (!tables.has(name)) tables.set(name, new Map());
    const rows = tables.get(name)!;
    return {
      createIndex: async () => {},
      findOne: async (filter: any) => {
        const r = rows.get(filter._id);
        return r && Object.entries(filter).every(([k, v]) => r[k] === v) ? structuredClone(r) : null;
      },
      updateOne: async (filter: any, update: any, opts: any = {}) => {
        const existing = rows.get(filter._id);
        if (existing && !Object.entries(filter).every(([k, v]) => existing[k] === v)) return { modifiedCount: 0, upsertedCount: 0 };
        if (!existing && !opts.upsert) return { modifiedCount: 0, upsertedCount: 0 };
        rows.set(filter._id, { ...(existing || { _id: filter._id, ...update.$setOnInsert }), ...update.$set });
        return { modifiedCount: existing ? 1 : 0, upsertedCount: existing ? 0 : 1 };
      },
    };
  } };
  const snapshotId = 'c'.repeat(64);
  const patchId = 'patch_' + 'e'.repeat(24);
  const doc = { path: 'main.tex', docId: 'd'.repeat(24), sha256: hash(source), version: 1 };
  const compiled: any[] = [];
  const deps: any = {
    '../../infrastructure/Mongoose': { getNativeDb: async () => db },
    '../Authorization/AuthorizationManager': { promises: { canUserReadProject: async () => true } },
    '../Authentication/SessionManager': {}, '../DocumentUpdater/DocumentUpdaterHandler': {},
    './CopilotSnapshotStore': {
      get: async () => ({ docs: [doc] }), readFile: async () => ({ ...doc, content: source }),
      compileInput: async () => ({ resources: [{ path: 'main.tex', content: Buffer.from(source).toString('base64') }], buildProjectId: 'build-project' }),
    },
    '@overleaf/settings': {}, '@overleaf/logger': { err() {}, warn() {} },
    '../Compile/CompileManager': { promises: { compile: async (_p: any, _u: any, { snapshotInput }: any) => {
      compiled.push(snapshotInput); return { status: options.status || 'success', buildId: options.noBuild ? null : 'build-1' };
    } } },
    '../Compile/ClsiManager': { promises: { getOutputFileStream: async () => {
      if (options.noLog) throw new Error('no log');
      return Readable.from([options.log ?? 'Output written on main.pdf']);
    } } },
    './LatexLogParser': { LatexParser: class { parse() { return { errors: options.errors || [], warnings: [] }; } } },
  };
  const patch = loadController('CopilotPatchController', deps);
  const compile = loadController('CopilotCompileController', deps);
  const invoke = async (handler: any, body: any) => {
    let data: any;
    const res: any = { headersSent: false, json: (value: any) => { data = JSON.parse(JSON.stringify(value)); }, sendStatus: (status: number) => { throw new Error(`HTTP ${status}`); }, status: () => res };
    await handler({ params: { project_id: projectId }, body }, res, (error: any) => { throw error; });
    return data;
  };
  return { tables, compiled, propose: (hunks: any[]) => invoke(patch.propose, { userId, snapshotId, patchId, hunks, conversationId: 'conv-l0' }),
    compile: (idempotencyKey = 'compile-1', withPatch = true) => invoke(compile.compileAndGetErrors, { userId, snapshotId, patchId: withPatch ? patchId : undefined, idempotencyKey }) };
}

const valid: Array<[string, string, any[], string]> = [
  ['replace', 'abc', [{ oldText: 'b', newText: 'B' }], 'aBc'],
  ['EOF without newline', 'abc', [{ oldText: '', newText: 'X', line: 2 }], 'abcX'],
  ['empty file insertion', '', [{ oldText: '', newText: 'X', line: 1 }], 'X'],
  ['CRLF and Unicode', '甲\r\n乙😀\r\n', [{ oldText: '乙😀', newText: '丙' }], '甲\r\n丙\r\n'],
  ['multiple immutable anchors', 'abc def ghi', [{ oldText: 'abc', newText: 'long' }, { oldText: 'ghi', newText: 'z' }], 'long def z'],
];
for (const [name, source, hunks, expected] of valid) test(`C08: ${name} has identical count/proposal/candidate bytes`, async () => {
  // Explicit expected strings are independent of the shared implementation.
  assert.equal(applyHunks(source, hunks), expected);
  assert.equal(candidateText(source, hunks), expected);
  const b = backend(source);
  await b.propose(hunks.map(h => ({ ...h, file: 'main.tex' })));
  const result = await b.compile();
  assert.equal(result.errorCount, 0);
  assert.equal(Buffer.from(b.compiled[0].resources[0].content, 'base64').toString(), expected);
});
for (const [name, hunks] of [
  ['ambiguous', [{ oldText: 'a', newText: 'x' }]],
  ['missing', [{ oldText: 'missing', newText: 'x' }]],
  ['overlap', [{ oldText: 'abc', newText: 'x' }, { oldText: 'bc a', newText: 'z' }]],
  ['invalid insertion', [{ oldText: '', newText: 'x', line: 0 }]],
] as Array<[string, any[]]>) test(`C08: ${name} is rejected before proposal persistence`, async () => {
  assert.throws(() => candidateText('abc abc', hunks));
  const b = backend('abc abc');
  await assert.rejects(b.propose(hunks.map(h => ({ ...h, file: 'main.tex' }))));
  assert.equal(b.tables.get('copilot_patch_records')?.size || 0, 0);
});
test('C08: submit_patch without persistence backend never claims submission', async () => {
  const tool = buildEditTools({ project: { files: [] } })[0];
  await assert.rejects(tool.execute('p1', patchArgs), /snapshot.*backend/i);
});
test('C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence', async () => {
  const f = fixture([]); f.context.project.files = [{ path: 'main.tex', content: 'Hello Hello' }];
  const tool = buildEditTools(f.context, { webClient: f.web, userId })[0];
  await assert.rejects(tool.execute('p1', patchArgs), /ambiguous/);
  await assert.rejects(tool.execute('p2', patchArgs), /ambiguous/);
  const stopped = await tool.execute('p3', patchArgs);
  assert.equal(stopped.terminate, true);
  assert.equal(f.records.length, 0);
});
test('C08: case-insensitive path fallback must not choose between two real files', async () => {
  const f = fixture([]); f.context.project.files = [{ path: 'Main.tex', content: 'Hello' }, { path: 'MAIN.tex', content: 'Hello' }];
  const tool = buildEditTools(f.context, { webClient: f.web, userId })[0];
  await assert.rejects(tool.execute('p1', patchArgs), /ambiguous|unknown/i);
  assert.equal(f.records.length, 0);
});
for (const [name, options, expected] of [
  ['successful complete log', {}, 'passed'],
  ['compiler failure with zero parsed errors', { status: 'failure' }, 'failed'],
  ['unavailable build', { noBuild: true }, 'unavailable'],
  ['missing log', { noLog: true }, 'unavailable'],
  ['empty log', { log: '' }, 'unavailable'],
  ['truncated log', { log: 'x'.repeat(1000001) }, 'unavailable'],
  ['parsed errors', { errors: [{ message: 'Undefined control sequence' }] }, 'failed'],
] as Array<[string, any, string]>) test(`C11: ${name} has honest persisted verification`, async () => {
  const b = backend(undefined, options); await b.propose(patchArgs.hunks);
  const result = await b.compile();
  assert.equal(compileOutcome(result), expected);
  const patch = [...b.tables.get('copilot_patch_records')!.values()][0];
  assert.equal(patch.candidateVerification.status, expected);
});
test('C11: identical backend idempotency key returns prior compile result', async () => {
  const b = backend(); await b.propose(patchArgs.hunks);
  const first = await b.compile(); const second = await b.compile();
  assert.deepEqual(second, first); assert.equal(b.compiled.length, 1);
});
test('C11: tool deduplicates same target across different model tool call IDs', async () => {
  const f = fixture([]); let calls = 0;
  f.web.compileProject = async (_p: any, _u: any, snapshotId: string, _key: any, patchId: string) => { calls++; return { status: 'success', errorCount: 0, logComplete: true, buildId: 'b1', snapshotId, patchId }; };
  const tool = buildCompileTools(f.context, { webClient: f.web, userId })[0];
  await tool.execute('c1', {}); await tool.execute('c2', {});
  assert.equal(calls, 1);
  await tool.execute('c3', { patchId: 'patch_' + 'e'.repeat(24) });
  assert.equal(calls, 2);
});
test('C11: tool rejects verification belonging to another snapshot', async () => {
  const f = fixture([]);
  f.web.compileProject = async () => ({ status: 'success', snapshotId: 'wrong', errorCount: 0 });
  const tool = buildCompileTools(f.context, { webClient: f.web, userId })[0];
  await assert.rejects(tool.execute('c1', {}), /does not match/);
});
test('C11: actual LatexParser recognizes a conventional fatal error and a clean log', () => {
  const { LatexParser } = loadController('LatexLogParser', {});
  const clean = new LatexParser('This is pdfTeX\n(./main.tex\n)\nOutput written on main.pdf (1 page).\n').parse();
  assert.equal(clean.errors.length, 0);
  const failed = new LatexParser('This is pdfTeX\n(./main.tex\n! Undefined control sequence.\nl.4 \\badcommand\n\n! Emergency stop.\n<*> main.tex\n\n').parse();
  assert.ok(failed.errors.length > 0);
  assert.ok(failed.errors.some((e: any) => /Undefined control sequence/.test(e.message)));
});
