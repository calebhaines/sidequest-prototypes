'use strict';
/* Browser file objects and directory APIs are mocked; no sample bytes are read.
 * These checks exercise complete trees, drop lifetime and atomic failure. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const scope = {};
Function('window', fs.readFileSync(path.join(__dirname, 'folder-import.js'), 'utf8'))(scope);
const F = scope.BatterFolderImport;
let passed = 0, audioReads = 0;
function file(name, relative = '', type = '') {
  return Object.freeze({ name, webkitRelativePath: relative, type, size: 64,
    arrayBuffer() { audioReads++; throw Error('The folder collector must not decode audio.'); } });
}
function leaf(value, name = value.name) {
  return { name, isFile: true, isDirectory: false, file(resolve) { resolve(value); } };
}
function directory(name, batches) {
  const calls = { readers: 0, reads: 0 };
  return { name, isFile: false, isDirectory: true, calls,
    createReader() { calls.readers++; let at = 0; return { readEntries(resolve) { calls.reads++; resolve(batches[at++] || []); } }; } };
}
const dropEntry = entry => ({ kind: 'file', webkitGetAsEntry: () => entry });
const fileHandle = value => ({ name: value.name, kind: 'file', getFile: async () => value });
function handleDirectory(name, children, pairs = false) {
  const iterable = async function* () { for (const child of children) yield pairs ? [child.name, child] : child; };
  return { name, kind: 'directory', [pairs ? 'entries' : 'values']: iterable };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => timer = setTimeout(() => reject(Error('A canceled folder read did not settle.')), 2000))]); }
  finally { clearTimeout(timer); }
}
async function check(name, run) { await run(); passed++; console.log('PASS ' + name); }

(async () => {
  await check('Folder picker filters metadata while retaining original files, nested paths and duplicate basenames', async () => {
    const hit10 = file('hit10.WAV', 'Kit/kicks/hit10.WAV'), hit2 = file('hit2.wav', 'Kit/kicks/hit2.wav');
    const first = file('hit1.wav', 'Kit/kicks/hit1.wav'), other = file('hit1.wav', 'Kit/snares/hit1.wav');
    const unknownName = file('recorded-source', 'Kit/recorded-source', 'audio/flac');
    const input = Object.freeze([hit10, file('README.txt', 'Kit/README.txt'), hit2, first, other, unknownName,
      file('._hit1.wav', 'Kit/._hit1.wav'), file('junk.wav', 'Kit/__MACOSX/junk.wav'), file('ghost.wav', 'Kit/.hidden/ghost.wav')]);
    const result = await F.fromFiles(input);
    assert.deepEqual(result.paths, ['Kit/kicks/hit1.wav', 'Kit/kicks/hit2.wav', 'Kit/kicks/hit10.WAV', 'Kit/recorded-source', 'Kit/snares/hit1.wav']);
    assert.deepEqual(result.files, [first, hit2, hit10, unknownName, other]);
    assert.equal(result.skipped, 4); assert.equal(result.totalFiles, 9);
    assert.deepEqual(Object.keys(hit2), ['name', 'webkitRelativePath', 'type', 'size', 'arrayBuffer']);
    assert.equal(audioReads, 0);
  });

  await check('Numeric path order is deterministic and exact path ties retain their input order', async () => {
    const files = ['z10.wav', 'z2.wav', 'z1.wav', 'A.wav', 'a.wav'].map(name => file(name));
    const expected = ['A.wav', 'a.wav', 'z1.wav', 'z2.wav', 'z10.wav'];
    for (const permutation of [files, [...files].reverse(), [...files.slice(2), ...files.slice(0, 2)]]) {
      assert.deepEqual((await F.fromFiles(permutation)).paths, expected);
    }
    const a = file('same.wav'), b = file('same.wav');
    const tied = await F.fromFiles([b, a]); assert.strictEqual(tied.files[0], b); assert.strictEqual(tied.files[1], a);
  });

  await check('Legacy directory drops exhaust every reader batch and recurse into all subfolders', async () => {
    const kick = file('hit.wav'), snare = file('hit.wav'), hat = file('hat.wav');
    const nested = directory('snares', [[leaf(snare)], [leaf(hat)], []]);
    const root = directory('Drums', [[leaf(kick)], [nested], [leaf(file('notes.txt'))], []]);
    const result = await F.collectDrop({ items: [dropEntry(root)], files: [] });
    assert.deepEqual(result.paths, ['Drums/hit.wav', 'Drums/snares/hat.wav', 'Drums/snares/hit.wav']);
    assert.deepEqual(result.files, [kick, hat, snare]); assert.equal(result.totalFiles, 4); assert.equal(result.skipped, 1);
    assert.equal(root.calls.readers, 1); assert.equal(root.calls.reads, 4);
    assert.equal(nested.calls.readers, 1); assert.equal(nested.calls.reads, 3);
  });

  await check('Hidden directories and resource forks are skipped without opening their unreadable contents', async () => {
    const drum = file('snare.wav');
    const hidden = { name: '.git', isDirectory: true, createReader() { throw Error('Hidden folders must not be opened.'); } };
    const resource = { name: '._snare.wav', isFile: true, file() { throw Error('Resource forks must not be opened.'); } };
    const mac = { ...hidden, name: '__MACOSX' };
    const result = await F.collectDrop({ items: [dropEntry(directory('Kit', [[hidden, resource, mac, leaf(drum)], []]))] });
    assert.deepEqual(result.files, [drum]); assert.equal(result.skipped, 1); assert.equal(result.totalFiles, 2);
    const handle = { name: '.private', kind: 'directory', values() { throw Error('Hidden handles must not be opened.'); } };
    const handles = await F.collectDrop({ items: [{ kind: 'file', getAsFileSystemHandle: async () => handleDirectory('Kit', [handle, fileHandle(drum)]) }] });
    assert.deepEqual(handles.files, [drum]); assert.equal(handles.totalFiles, 1);
  });

  await check('Handle promises and drop entries are captured synchronously before the drop event expires', async () => {
    let permitted = true; const captures = [], pending = deferred(), a = file('a.wav'), b = file('b.wav');
    const items = [
      { kind: 'file', webkitGetAsEntry() { assert(permitted); captures.push('entry'); return leaf(a); } },
      { kind: 'file', webkitGetAsEntry() { assert(permitted); captures.push('fallback'); return null; },
        getAsFileSystemHandle() { assert(permitted); captures.push('handle'); return pending.promise; } }
    ];
    const result = F.collectDrop({ items, files: [] }); permitted = false;
    assert.deepEqual(captures, ['entry', 'fallback', 'handle']);
    pending.resolve(handleDirectory('Folder', [handleDirectory('Nested', [fileHandle(b)], true)]));
    const actual = await result;
    assert.deepEqual(actual.paths, ['a.wav', 'Folder/Nested/b.wav']); assert.deepEqual(actual.files, [a, b]);
  });

  await check('Ordinary file drops work without directory APIs and ignore non-file drag items', async () => {
    const a = file('a.wav'), b = file('b.wav');
    const plain = await F.collectDrop({ files: Object.freeze([b, a]) });
    assert.deepEqual(plain.files, [a, b]);
    const items = [{ kind: 'string', type: 'text/plain' }, { kind: 'file', getAsFile: () => b }];
    assert.deepEqual((await F.collectDrop({ items, files: [b] })).files, [b]);
    await assert.rejects(F.collectDrop({ items: [{ kind: 'file', getAsFile: () => null }], files: [a] }), /cannot read the dropped folder/);
    const empty = await F.fromFiles([]); assert.deepEqual(empty, { files: [], paths: [], skipped: 0, totalFiles: 0 });
  });

  await check('Unreadable folders and samples reject the whole collection without exposing a partial batch', async () => {
    const before = file('first.wav');
    const bad = { name: 'unreadable', isDirectory: true, createReader() { return { readEntries(resolve, reject) { reject(Error('Permission denied')); } }; } };
    const root = directory('Kit', [[leaf(before), bad], []]);
    await assert.rejects(F.collectDrop({ items: [dropEntry(root)] }), error => /Could not read folder.*Kit\/unreadable/.test(error.message) && error.cause?.message === 'Permission denied');
    const badFile = { name: 'missing.wav', isFile: true, file(resolve, reject) { reject(Error('Gone')); } };
    await assert.rejects(F.collectDrop({ items: [dropEntry(directory('Kit', [[leaf(before), badFile]]))] }), /Could not read sample.*Kit\/missing.wav/);
    const delayed = deferred(), rejected = Promise.reject(Error('Handle denied'));
    const pending = F.collectDrop({ items: [
      { kind: 'file', getAsFileSystemHandle: () => delayed.promise },
      { kind: 'file', getAsFileSystemHandle: () => rejected }
    ] });
    await new Promise(resolve => setImmediate(resolve)); delayed.resolve(fileHandle(before));
    await assert.rejects(pending, /Could not read dropped folder/);
    assert.equal(audioReads, 0);
  });

  await check('Supported-audio limits reject oversized picker and recursive batches without truncating them', async () => {
    const limit = Array.from({ length: 128 }, (_, i) => file('hit' + i + '.wav', 'Kit/hit' + i + '.wav'));
    assert.equal((await F.fromFiles(limit)).files.length, 128);
    await assert.rejects(F.fromFiles([...limit, file('extra.wav')]), /128 audio files/);
    const root = directory('Kit', [[leaf(file('a.wav')), leaf(file('b.wav'))], [leaf(file('c.wav'))], []]);
    await assert.rejects(F.collectDrop({ items: [dropEntry(root)] }, { maxFiles: 2 }), /2 audio files/);
    for (const maxFiles of [0, -1, 129, Infinity, 1.5]) await assert.rejects(F.fromFiles([], { maxFiles }), /limit from 1 to 128/);
    assert.equal(audioReads, 0);
  });

  await check('Cancellation settles pending directory, file, handle and iterator reads without partial results', async () => {
    {
      const controller = new AbortController(); controller.abort();
      await assert.rejects(F.fromFiles([file('a.wav')], { signal: controller.signal }), { name: 'AbortError' });
    }
    for (const kind of ['directory', 'file', 'handle', 'iterator']) {
      const controller = new AbortController(); let cleanup = 0, transfer;
      if (kind === 'directory') transfer = { items: [dropEntry({ name: 'pending', isDirectory: true, createReader() { return { readEntries() {} }; } })] };
      if (kind === 'file') transfer = { items: [dropEntry({ name: 'pending.wav', isFile: true, file() {} })] };
      if (kind === 'handle') transfer = { items: [{ kind: 'file', getAsFileSystemHandle: () => new Promise(() => {}) }] };
      if (kind === 'iterator') transfer = { items: [{ kind: 'file', getAsFileSystemHandle: async () => ({ name: 'pending', kind: 'directory', values() {
        return { [Symbol.asyncIterator]() { return this; }, next: () => new Promise(() => {}), return() { cleanup++; return Promise.resolve({ done: true }); } };
      } }) }] };
      const pending = F.collectDrop(transfer, { signal: controller.signal });
      await new Promise(resolve => setImmediate(resolve)); controller.abort();
      await assert.rejects(bounded(pending), { name: 'AbortError' });
      if (kind === 'iterator') assert.equal(cleanup, 1);
    }
  });

  await check('Traversal depth, entry count and relative-path bounds prevent unbounded or malformed folder reads', async () => {
    let nested = leaf(file('deep.wav'));
    for (let i = 0; i < 66; i++) nested = directory('level' + i, [[nested], []]);
    await assert.rejects(F.collectDrop({ items: [dropEntry(nested)] }), /too deeply nested/);
    const tooMany = Array.from({ length: 20001 }, () => file('ignored.txt'));
    await assert.rejects(F.fromFiles(tooMany), /too many entries/);
    let reads = 0;
    const endless = { name: 'endless', isDirectory: true, createReader() { return { readEntries(resolve) { reads++; resolve([leaf(file('ignored.txt'))]); } }; } };
    await assert.rejects(F.collectDrop({ items: [dropEntry(endless)] }), /too many entries/); assert(reads <= 20001);
    await assert.rejects(F.fromFiles([file('a.wav', 'Kit/../a.wav')]), /invalid relative path/);
    await assert.rejects(F.fromFiles([file('a.wav', 'C:\\private\\a.wav')]), /invalid relative path/);
    assert.equal(audioReads, 0);
  });
  console.log(passed + ' BATTER folder-collection groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
