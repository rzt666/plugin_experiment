import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const temporary = await mkdtemp(join(tmpdir(), "find-pipeline-"));
const state = globalThis.__indexTest = { calls: 0, saved: null, notices: [] };
const mock = `
const state = globalThis.__indexTest;
export class TFile { constructor(path, content) { this.path=path; this.extension='md'; this.content=content; this.stat={mtime:1}; } }
export class FileSystemAdapter { getBasePath() { return '/vault'; } }
export class Notice { constructor(text) { state.notices.push(text); } setMessage() {} hide() {} }
export class ItemView {}
export class Plugin {
  manifest={id:'plugin_experiment'};
  registerView() {} addRibbonIcon() {}
  registerEvent() {} addCommand(command) { this.command=command; }
  async loadData() { return state.saved; }
  async saveData(value) { state.saved=JSON.parse(JSON.stringify(value)); }
}
`;
try {
  const bundle = join(temporary, "pipeline.cjs");
  await build({ stdin: { contents: 'export {default as Pipeline} from "./main"; export {TFile,FileSystemAdapter} from "obsidian";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile: bundle,
    plugins: [{ name: "mocks", setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({path:"obsidian",namespace:"mock"}));
      build.onResolve({ filter: /\/src\/embeddings$/ }, () => ({path:"embeddings",namespace:"mock"}));
      build.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ loader: "js", contents: args.path === "obsidian" ? mock : `
        export const DIMENSIONS=384, INDEX_MODEL='test-model';
        export function configureEmbeddings() {} export async function disposeEmbeddings() {}
        export async function embed(text) {
          globalThis.__indexTest.calls++;
          if (globalThis.__indexTest.duringEmbed) globalThis.__indexTest.duringEmbed();
          return Array.from({length:384},(_,i)=>i===0?1:text.length/100);
        }` }));
    } }] });
  const { Pipeline, TFile, FileSystemAdapter } = createRequire(import.meta.url)(bundle);
  const files = new Map();
  const handlers = new Map();
  const vault = { adapter: new FileSystemAdapter(), configDir:'.obsidian',
    getMarkdownFiles: () => [...files.values()], getAbstractFileByPath: path => files.get(path),
    read: async file => file.content, on: (name, fn) => handlers.set(name, fn) };
  const start = async () => { const plugin=new Pipeline(); plugin.app={vault,workspace:{onLayoutReady() {},getLeavesOfType:()=>[]}}; await plugin.onload(); await plugin.queue; return plugin; };
  const emit = async (plugin, name, file) => { handlers.get(name)(file); await plugin.queue; };
  const first = new TFile('first.md','first content'); files.set(first.path,first);
  let plugin = await start();
  assert.equal(state.calls,1); assert.equal(plugin.index.size,1);
  plugin.onunload(); await plugin.queue;
  plugin = await start(); assert.equal(state.calls,1,'restart reuses embeddings');
  first.stat.mtime++; await emit(plugin,'modify',first);
  assert.equal(state.calls,1,'timestamp-only edits reuse content hash');
  first.content='changed with same timestamp'; await emit(plugin,'modify',first);
  assert.equal(state.calls,2,'hash detects same-mtime changes');
  const second=new TFile('second.md','second'); files.set(second.path,second);
  await emit(plugin,'create',second); assert.equal(plugin.index.size,2);
  files.delete('second.md'); second.path='renamed.md'; files.set(second.path,second);
  await emit(plugin,'rename',second); assert(!plugin.index.get('second.md')); assert(plugin.index.get('renamed.md'));
  files.delete(second.path); await emit(plugin,'delete',second); assert.equal(plugin.index.size,1);
  for (let i=0;i<7;i++) {
    const note=new TFile(`related-${i}.md`,`related content ${i}`); files.set(note.path,note);
    await emit(plugin,'create',note);
  }
  const cachedCalls=state.calls;
  const related=await plugin.relatedNotes(first);
  assert.equal(related.length,5,'panel receives five other notes');
  assert(related.every(note=>note.path!==first.path),'active note excluded');
  assert.equal(state.calls,cachedCalls,'related notes reuse current cached embedding');
  first.content='new content before modify event';
  await plugin.relatedNotes(first);
  assert.equal(state.calls,cachedCalls+1,'related notes validate content hash');
  for (const [path,note] of files) if (note!==first) { files.delete(path); await emit(plugin,'delete',note); }
  assert.deepEqual(await plugin.relatedNotes(first),[],'single note has no related notes');
  const before=state.calls; plugin.command.callback(); await plugin.queue;
  assert.equal(state.calls,before+1,'rebuild forces embedding');
  state.duringEmbed=()=>{ files.delete(first.path); handlers.get('delete')(first); state.duringEmbed=undefined; };
  first.content='deleted during embedding'; await emit(plugin,'modify',first); await plugin.queue;
  assert.equal(plugin.index.size,0,'in-flight embedding cannot resurrect a deleted note');
  assert.equal(Object.keys(state.saved.index.notes).length,0);
  plugin.onunload(); await plugin.queue;
  console.log('PASS: startup, cache reuse, mtime/hash changes, create/modify/delete/rename, rebuild, deletion race, persistence.');
} finally { delete globalThis.__indexTest; await rm(temporary,{recursive:true,force:true}); }
