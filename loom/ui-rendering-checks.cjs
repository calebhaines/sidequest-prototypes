'use strict';
/* Small, non-browser regressions. Frozen Canvas commands were captured from5df579e.
 * These compare preview appearance and gesture lifecycle, not elapsed timings. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const extract = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))).trim();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function recorder(width) {
  const operations = [], ctx = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    scale(...values) { operations.push(['scale', ...values]); }, beginPath() { operations.push(['beginPath']); }, moveTo(...values) { operations.push(['moveTo', ...values]); }, lineTo(...values) { operations.push(['lineTo', ...values]); }, stroke() { operations.push(['stroke', this.strokeStyle, this.lineWidth]); },
    fillRect(...values) { operations.push(['fillRect', ...values, this.globalAlpha, this.fillStyle]); } };
  const canvas = { width: 1, height: 1, getContext: () => ctx }, el = { dataset: { track: '0', clip: 'fixture' }, clientWidth: width, querySelector: () => canvas };
  return { operations, canvas, el };
}
function fixtures() {
  const notes = count => Array.from({ length: count }, (_, i) => ({ pitch: 45 + i % 32, beat: i / count * .24, duration: .004 + (i % 4) * .001, velocity: (i % 9 + 1) / 10 }));
  const base = { id: 'fixture', assetId: 'audio', type: 'audio', start: 0, length: 4, sourceStart: .002, sourceEnd: .08, sourceOffset: .017, rate: .75, reverse: false, loop: true, gain: .8, fadeIn: .2, fadeOut: .3 };
  return [
    { name: 'audio-loop', clip: base, width: 512, dpr: 1 },
    { name: 'audio-reverse-fades', clip: { ...base, reverse: true, gain: 1.4 }, width: 287, dpr: 2 },
    { name: 'audio-one-pass-offset', clip: { ...base, loop: false, length: .25, rate: 1.5 }, width: 1300, dpr: 1.5 },
    { name: 'notes-overlap-offset', clip: { ...base, type: 'notes', pattern: { lengthBeats: .25, notes: notes(24) }, loop: false, length: .25, sourceOffset: .03, rate: .8 }, width: 413, dpr: 2 },
    { name: 'notes-long-loop-alpha-order', clip: { ...base, type: 'notes', pattern: { lengthBeats: .25, notes: notes(32) }, loop: true, length: 100, sourceOffset: .04, rate: 1 }, width: 1024, dpr: 1 }
  ];
}
function environment(clip) {
  const state = { tempo: 123, tracks: [{ color: '#ee7948', clips: [clip] }] }, pcm = { sampleRate: 48000, left: Float32Array.from({ length: 4096 }, (_, i) => ((i * 17) % 127 - 63) / 512), right: Float32Array.from({ length: 4096 }, (_, i) => ((i * 31) % 89 - 44) / 600) };
  return { state, pcm };
}
function previewCase(fixture, chunked = false) {
  const { el, operations } = recorder(fixture.width), { state, pcm } = environment(fixture.clip), context = { state, performance: { now: () => 1 } };
  const name = fixture.clip.type === 'notes' ? 'drawNotePreview' : 'audioPreview';
  const code = name === 'drawNotePreview' ? extract(appSource, '  function drawNotePreview(', '\n  function status(') : extract(appSource, '  function audioPreview(', '\n  function drawWaveforms(');
  const fn = vm.runInNewContext('(' + code + ')', context), job = name === 'drawNotePreview' ? fn(el, fixture.clip, fixture.width, fixture.dpr) : fn(el, fixture.clip, pcm, fixture.width, fixture.dpr);
  let steps = 1; while (!job.step(chunked ? 0 : Infinity)) { assert(++steps < 10000, 'Preview makes progress'); }
  return { hash: hash(operations), commands: operations.length, steps };
}
function checkPreviews() {
  const frozen = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui-rendering-fixtures.json'), 'utf8')); assert.equal(frozen.baseline, '5df579ee99caa7a73222f8d6a52268be4cab3c75');
  for (const fixture of fixtures()) for (const chunked of [false, true]) { const actual = previewCase(fixture, chunked), expected = frozen.previews.find(item => item.name === fixture.name); assert.equal(actual.hash, expected.hash, fixture.name + (chunked ? ' yielded' : '') + ' exact released Canvas commands'); assert.equal(actual.commands, expected.commands); }
  console.log('PASS 10 exact released preview-command comparisons, including overlap alpha, offsets, reverse, fades and yielded continuation');
}
function checkPreviewLifecycle() {
  const callbacks = new Map(), output = []; let serial = 0;
  const context = { timelinePreviewFrame: 0, drag: { pointer: 7 }, marquee: null, requestAnimationFrame: fn => { callbacks.set(++serial, fn); return serial; }, cancelAnimationFrame: id => callbacks.delete(id), previewTimelineDrag: event => output.push({ ...event }), previewMarquee: event => output.push({ ...event }), releaseTimelinePointer() {}, renderLanes() {}, renderClipInspector() {} };
  vm.createContext(context);
  vm.runInContext(extract(appSource, '  function queueTimelinePreview(', "\n  $('clipSelectMode')") + '\n' + extract(appSource, '  function cancelTimelineGesture(', '\n  function timelinePoint('), context);
  for (const x of [10, 20, 30]) context.queueTimelinePreview({ pointerId: 7, clientX: x, clientY: 8 }); assert.equal(callbacks.size, 1);
  context.flushTimelinePreview({ pointerId: 7, clientX: 40, clientY: 9 }); assert.equal(callbacks.size, 0); assert.equal(output.at(-1).clientX, 40, 'Pointerup flushes latest coordinates');
  context.queueTimelinePreview({ pointerId: 7, clientX: 60, clientY: 9 }); context.cancelTimelineGesture({ render: false }); assert.equal(callbacks.size, 0); assert.equal(context.drag, null);
  const size = output.length; context.flushTimelinePreview(); assert.equal(output.length, size, 'Canceled preview cannot mutate committed UI');
  console.log('PASS timeline frame coalescing, pointerup flush and cancel lifecycle');
}
function checkScoreNotify() {
  const scope = { window: {}, document: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'piano-roll.js'), 'utf8'), scope);
  const piano = Object.create(scope.window.LoomPianoRollEditor.prototype); let notified = 0; piano.location = () => { throw Error('A synchronous score notification must not rebuild its DOM'); }; piano.onChange = () => { notified++; piano.render(); };
  piano.notify(); assert.equal(notified, 1); assert.equal(piano.notifying, false);
  piano.onChange = () => { throw Error('test cancellation'); }; assert.throws(() => piano.notify(), /test cancellation/); assert.equal(piano.notifying, false, 'Notification guard releases on errors');
  console.log('PASS score notifications avoid nested rebuilds and release on exceptions');
}
function element() { return { attrs: new Map(), style: {}, textContent: '', classList: { toggle() {} }, getAttribute(name) { return this.attrs.get(name) ?? null; }, setAttribute(name, value) { this.attrs.set(name, String(value)); } }; }
function checkRetainedPoints() {
  const scope = { window: {}, document: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'automation-ui.js'), 'utf8'), scope);
  const points = [{ beat: 0, value: .25 }, { beat: 1, value: .5 }, { beat: 2, value: .75 }], svg = { children: [], querySelector: () => svg.children[0] || null, insertBefore(node, next) { const old = this.children.indexOf(node); if (old >= 0) this.children.splice(old, 1); const at = next ? this.children.indexOf(next) : this.children.length; this.children.splice(at, 0, node); } };
  const nodes = points.map(() => { const node = element(), hit = element(), dot = element(); node.querySelectorAll = () => [hit, dot]; node.querySelector = () => dot; node.remove = () => { svg.children.splice(svg.children.indexOf(node), 1); }; Object.defineProperty(node, 'nextElementSibling', { get: () => svg.children[svg.children.indexOf(node) + 1] || null }); return node; }); svg.children.push(...nodes);
  const editor = Object.create(scope.window.LoomAutomationEditor.prototype), lane = { points: points.slice() }, m = { left: 46, top: 32, bottom: 196, ppb: 100 }, d = { min: 0, max: 1 };
  Object.assign(editor, { point: 0, pointNodes: new Map(points.map((point, index) => [point, nodes[index]])), element: { querySelector: () => svg }, label: (_, value) => value.toFixed(2) });
  assert(editor.paintPointNodes(lane, m, d)); points[1].beat = 3; points[1].value = .9; lane.points = [points[0], points[2], points[1]]; editor.point = 2;
  assert(editor.paintPointNodes(lane, m, d)); assert.deepEqual(svg.children, [nodes[0], nodes[2], nodes[1]], 'Retained points preserve sorted visual/hit order'); assert.equal(nodes[1].getAttribute('data-auto-point'), '2'); assert.equal(nodes[1].querySelector().getAttribute('cx'), '346'); assert.equal(nodes[1].querySelector().getAttribute('cy'), String(196 - .9 * 164));
  lane.points = [points[0], points[1]]; editor.point = 1; editor.paintPointNodes(lane, m, d); assert.equal(editor.pointNodes.has(points[2]), false); assert.deepEqual(svg.children, [nodes[0], nodes[1]], 'Collision removal drops only the old point node');
  console.log('PASS retained automation geometry, sorted hit order and collision removal');
}
function checkRetainedNote() {
  const scope = { window: {}, document: { createElementNS: () => element() } }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'piano-roll.js'), 'utf8'), scope);
  const item = { id: 'note', voice: 'v', pitch: 60, beat: 1, duration: .75, velocity: .8 }, body = element(), velocity = element(), edge = element(), mark = element(), node = element(); let text;
  node.querySelector = selector => ({ '.piano-note-body': body, '.piano-note-velocity': velocity, '[data-piano-edge]': edge, '.piano-note-edge-mark': mark, text })[selector] || null; node.insertBefore = added => { text = added; };
  const svg = { querySelector: () => null }, piano = Object.create(scope.window.LoomPianoRollEditor.prototype);
  Object.assign(piano, { drag: { mode: 'resize', notes: [{ item }] }, element: { querySelector: () => svg }, drawMetrics: { left: 54, top: 27, ppb: 52, rowHeight: 18, rows: 49 }, selected: new Set(['note']), paintedSelected: new Set(), noteElements: new Map([['note', node]]), rowFor: note => 84 - note.pitch, pattern: () => ({ voices: [{ id: 'v', name: 'Voice' }] }) });
  piano.paintGesture(); assert.equal(body.getAttribute('x'), '106'); assert.equal(body.getAttribute('y'), '462'); assert.equal(body.getAttribute('width'), '38'); assert.equal(edge.getAttribute('x'), '134'); assert.equal(text.textContent, 'C4'); assert.equal(node.getAttribute('aria-pressed'), 'true');
  assert.match(node.getAttribute('aria-label'), /duration 0.75 beats/); assert.equal(piano.noteElements.get('note'), node, 'Dragging keeps note DOM identity');
  console.log('PASS retained note position, duration edge, label and selection geometry');
}
function checkFirstAutomationPoint() {
  const scope = { window: {}, document: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'automation-ui.js'), 'utf8'), scope);
  const editor = Object.create(scope.window.LoomAutomationEditor.prototype), clear = { disabled: true }; let rendered = 0, drawn = 0, notified = 0;
  Object.assign(editor, { point: 0, drawFrame: 0, syncOwner: () => false, element: { hasPointerCapture: () => false, querySelector: selector => selector === '[data-auto-action="clear"]' ? clear : { focus() {} }, querySelectorAll: () => [] }, notify: () => notified++, render: () => rendered++, draw: () => drawn++, renderPoint() {}, lane: () => ({ points: [{ beat: 1, value: .5 }] }) });
  editor.drag = { pointer: 7, moved: true, createdLane: true }; editor.pointerEnd({ pointerId: 7 }); assert.equal(rendered, 1, 'A first point refreshes the newly created lane controls'); assert.equal(drawn, 0); assert.equal(notified, 1);
  editor.drag = { pointer: 7, moved: true, createdLane: false }; editor.pointerEnd({ pointerId: 7 }); assert.equal(rendered, 1, 'An existing lane retains its sidebar/score DOM'); assert.equal(drawn, 1); assert.equal(clear.disabled, false, 'An empty existing lane enables Clear after its first point');
  console.log('PASS first automation lane controls refresh while existing-point gestures retain DOM');
}
function run() { checkPreviews(); checkPreviewLifecycle(); checkScoreNotify(); checkRetainedPoints(); checkRetainedNote(); checkFirstAutomationPoint(); }
module.exports = { fixtures, recorder, environment, previewCase, hash };
if (require.main === module) run();
