import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import express from 'express';
import mongoose from 'mongoose';
import { WebApiClient } from '../../app/llm/webApiClient.js';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function writeJson(filename: string, value: any) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename + '.tmp', JSON.stringify(value, null, 2));
  fs.renameSync(filename + '.tmp', filename);
}
const require = createRequire(import.meta.url);
function controller(name: string, deps: Record<string, any>) {
  const filename = `/overleaf/services/web/app/src/Features/Copilot/${name}.js`;
  const module = { exports: {} as any };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, Buffer, Date, setInterval, clearInterval,
    require: (id: string) => {
      if (Object.hasOwn(deps, id)) return deps[id];
      if (id.startsWith('node:') || id === '@overleaf/copilot-contracts') return require(id);
      throw new Error(`Unconfigured L1 controller dependency: ${id}`);
    },
  }, { filename });
  return module.exports;
}

export async function compileFiles(files: Record<string, string>, signal?: AbortSignal) {
  const job = randomUUID();
  const directory = `/spool/${job}`;
  writeJson(`${directory}/request.json`, { files });
  fs.chmodSync(directory, 0o777); // Isolated spool: compiler runs as host uid.
  const started = Date.now();
  while (!fs.existsSync(`${directory}/result.json`)) {
    signal?.throwIfAborted();
    if (Date.now() - started > 60_000) throw new Error('L1 compiler worker unavailable');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return { job, ...JSON.parse(fs.readFileSync(`${directory}/result.json`, 'utf8')) };
}

export async function startBackend(userId: string, log: (kind: string, data: any) => void) {
  const projects = new Set<string>();
  const heads = new Map<string, string>();
  const builds = new Map<string, any>();
  const deps: any = {
    '../../infrastructure/Mongoose': { getNativeDb: async () => mongoose.connection.db!, mongo: mongoose.mongo },
    '../Authorization/AuthorizationManager': { promises: {
      canUserReadProject: async (user: string, project: string) => user === userId && projects.has(project),
    } },
    '../Authentication/SessionManager': {},
    '../DocumentUpdater/DocumentUpdaterHandler': {},
    '@overleaf/settings': {},
    '@overleaf/logger': { err: (data: any) => log('backend_error', { message: data.err?.message }), warn: (data: any) => log('backend_warning', { message: data.err?.message }) },
    '../Compile/CompileManager': { promises: { compile: async (_project: string, _user: string, { snapshotInput }: any) => {
      const files = Object.fromEntries(snapshotInput.resources.map((r: any) => [r.path, Buffer.from(r.content, 'base64').toString('utf8')]));
      log('compile_dispatch', { snapshotInput, files });
      const compiled = await compileFiles(files);
      builds.set(compiled.job, compiled);
      log('compile_receipt', compiled);
      return { status: compiled.status, buildId: compiled.job };
    } } },
    '../Compile/ClsiManager': { promises: { getOutputFileStream: async (_p: any, _u: any, _limits: any, _server: any, buildId: string) => {
      const compiled = builds.get(buildId);
      if (!compiled?.log) throw new Error('No compiler log');
      return Readable.from([compiled.log]);
    } } },
  };
  const snapshots = controller('CopilotSnapshotStore', deps);
  deps['./CopilotSnapshotStore'] = snapshots;
  deps['./LatexLogParser'] = controller('LatexLogParser', deps);
  const patches = controller('CopilotPatchController', deps);
  const compile = controller('CopilotCompileController', deps);
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  // Controlled authorization only for generated test projects. Actual source
  // capture/updater/current-head polling is outside this single-turn suite.
  app.get('/internal/project/:project_id/copilot/access/:user_id', (req, res) => res.json({ allowed: req.params.user_id === userId && projects.has(req.params.project_id) }));
  app.get('/internal/project/:project_id/copilot/snapshot/:snapshot_id/user/:user_id', async (req, res, next) => {
    try {
      const p = req.params;
      if (p.user_id !== userId || !projects.has(p.project_id)) { res.sendStatus(403); return; }
      if (req.query.current) { res.json({ current: heads.get(p.project_id) === p.snapshot_id }); return; }
      res.json(typeof req.query.path === 'string'
        ? await snapshots.readFile(p.project_id, p.snapshot_id, req.query.path)
        : await snapshots.get(p.project_id, p.snapshot_id));
    } catch (error) { next(error); }
  });
  app.post('/internal/project/:project_id/copilot/patch', patches.propose);
  app.get('/internal/project/:project_id/copilot/patches/user/:user_id', patches.list);
  app.post('/internal/project/:project_id/copilot/compile', compile.compileAndGetErrors);
  app.use((error: any, _req: any, res: any, _next: any) => {
    log('backend_error', { message: error.message });
    res.status(error.status || 400).json({ error: error.message });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as any;
  const web = new WebApiClient({ baseURL: `http://127.0.0.1:${address.port}`, username: '', password: '', timeoutMs: 65_000 });
  return {
    web,
    async seed(projectId: string, files: Record<string, string>) {
      projects.add(projectId);
      const docs = [];
      for (const [name, content] of Object.entries(files)) docs.push({
        path: name, docId: hash(projectId + name).slice(0, 24), version: 1,
        sha256: await snapshots.putArtifact(projectId, Buffer.from(content)),
      });
      const snapshot = await snapshots.publish({ projectId, docs, assets: [], rootDocId: docs.find(d => d.path === 'main.tex')!.docId,
        compiler: 'pdflatex', imageName: 'texlive-full:latest', assetBytesFrozen: true });
      heads.set(projectId, snapshot.id);
      return snapshot;
    },
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
