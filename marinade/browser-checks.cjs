'use strict';
// Run: node marinade/browser-checks.cjs [standalone-URL]. Default builds only a /tmp source preview.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can select an installed browser; no app dependency is added.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const installedPlaywright = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const playwright = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installedPlaywright) ? installedPlaywright : 'playwright'));
const appRoot = __dirname, parentRoot = path.resolve(appRoot, '..');
const hasSiblingApps = ['fable', 'loom'].every(app => fs.existsSync(path.join(parentRoot, app, 'index.html')));
const repoRoot = hasSiblingApps ? parentRoot : appRoot, artifacts = process.env.MARINADE_QA_ARTIFACTS || '/tmp/marinade-browser-qa';
fs.mkdirSync(artifacts, { recursive: true });
const results = [], failures = [], skipped = [], browserErrors = [], externalRequests = [];
let server, browser;
async function check(name, run) {
  if (process.env.MARINADE_QA_FILTER && !new RegExp(process.env.MARINADE_QA_FILTER).test(name)) return;
  const began = Date.now();
  try { const evidence = await run(); results.push({ name, milliseconds: Date.now() - began, evidence }); console.log('PASS ' + name + (evidence ? ' ' + JSON.stringify(evidence) : '')); }
  catch (error) { failures.push({ name, message: error.stack || String(error) }); console.error('FAIL ' + name + '\n' + (error.stack || error)); }
}
async function previewHTML() {
  // Explicit /tmp output uses the real standalone function and shared fonts without publishing.
  const file = path.join(artifacts, 'source-preview.html');
  await promisify(execFile)('python3', [path.join(appRoot, 'build.py'), '--output', file], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  return fs.readFileSync(file, 'utf8');
}
async function servePreview() {
  const html = await previewHTML();
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if(url === '/qa-offline-shell') {res.writeHead(200, {'content-type':'text/html'});res.end('<!doctype html><title>Offline test shell</title>');return;}
    if (/^\/marinade(?:\/index\.html)?\/?$/.test(url)) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
    const base = url.startsWith('/marinade/') ? appRoot : repoRoot;
    let file = path.resolve(base, '.' + (url.startsWith('/marinade/') ? url.slice('/marinade'.length) : url));
    if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (_) {}
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('Missing ' + url); return; }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port + '/marinade/';
}
async function newPage(context, url, width = 1440, { fallback = false, midi = false } = {}) {
  const page = await context.newPage(); await page.setViewportSize({ width, height: 1000 });
  if (fallback) await page.addInitScript(() => { Object.defineProperty(AudioContext.prototype, 'audioWorklet', { get: () => undefined, configurable: true }); });
  if (midi) await page.addInitScript(() => {
    window.__qaMidiInput = { id: 'qa-midi', state: 'connected', onmidimessage: null };
    window.__qaMidiAccess = { inputs: new Map([['qa-midi', __qaMidiInput]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => __qaMidiAccess, configurable: true });
  });
  page.on('pageerror', error => browserErrors.push({ url: page.url(), error: error.message }));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push({ url: page.url(), error: message.text() }); });
  await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => !!window.MarinadeApp, null, { timeout: 10000 });
  return page;
}
async function fresh(page) { await page.evaluate(() => MarinadeApp.loadState(MarinadeSchema.defaultState())); }
async function state(page) { return page.evaluate(() => MarinadeApp.getState()); }
async function download(page, selector, file) {
  const pending = page.waitForEvent('download', { timeout: 90000 }); await page.locator(selector).click();
  const item = await pending; const failure = await item.failure(); assert.equal(failure, null); await item.saveAs(path.join(artifacts, file));
  return { name: item.suggestedFilename(), bytes: fs.readFileSync(path.join(artifacts, file)) };
}
function pcm16Stats(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt16LE(22), 2); assert.equal(bytes.readUInt32LE(24), 48000); assert.equal(bytes.readUInt16LE(34), 16);
  let peak = 0, energy = 0; for (let at = 44; at + 1 < bytes.length; at += 2) { const n = bytes.readInt16LE(at) / 32768; peak = Math.max(peak, Math.abs(n)); energy += n * n; }
  return { bytes: bytes.length, peak, rms: Math.sqrt(energy / ((bytes.length - 44) / 2)) };
}
function midiNotes(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'MThd'); assert.equal(bytes.readUInt32BE(4), 6); assert.equal(bytes.readUInt16BE(8), 0);
  assert.equal(bytes.toString('ascii', 14, 18), 'MTrk'); const ppq = bytes.readUInt16BE(12), notes = [];
  let at = 22, tick = 0, previous;
  const variable = () => { let n = 0, b; do { b = bytes[at++]; n = n * 128 + (b & 127); } while (b & 128); return n; };
  while (at < bytes.length) {
    tick += variable(); let status = bytes[at++]; if (status < 128) { at--; status = previous; } else previous = status;
    if (status === 255) { at++; const length = variable(); at += length; continue; }
    if (status === 240 || status === 247) { const length = variable(); at += length; continue; }
    const type = status & 240, pitch = bytes[at++], velocity = type === 192 || type === 208 ? undefined : bytes[at++];
    if (type === 144 && velocity > 0) notes.push({ pitch, beat: tick / ppq, velocity });
  }
  return notes;
}
function wavFixture(hz = 261.625565, seconds = .25, sampleRate = 44100) {
  const frames = Math.round(seconds * sampleRate), bytes = Buffer.alloc(44 + frames * 4);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 4, 28);
  bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {const value = Math.round(Math.sin(2 * Math.PI * hz * i / sampleRate) * 16000); bytes.writeInt16LE(value, 44 + i * 4); bytes.writeInt16LE(value, 46 + i * 4);}
  return bytes;
}
const soundPaths = ['synth.morph', 'synth.pitchBlend', 'synth.texture', 'synth.textureBlend', 'synth.transient', 'synth.transientBlend', 'synth.scanRate', 'synth.scanMode',
  'synth.formantShift', 'synth.formantLock', 'synth.inharmonic', 'synth.smear', 'synth.spread',
  ...['attack','decay','sustain','release'].map(k=>'synth.amp.'+k),
  ...['type','cutoff','resonance','envAmount','keytrack'].map(k=>'synth.filter.'+k),
  ...['attack','decay','sustain','release'].map(k=>'synth.filterEnv.'+k),
  ...['shape','rate','sync','depth','target','retrigger'].map(k=>'synth.lfo.'+k),
  ...['drive','chorus','delay','delayDivision','feedback','space','width','volume'].map(k=>'fx.'+k)];

(async () => {
  const url = process.argv[2] || process.env.MARINADE_QA_URL || await servePreview(), origin = new URL(url).origin;
  const allowedOrigins = new Set([origin, ...(process.env.MARINADE_HOST_URL ? [new URL(process.env.MARINADE_HOST_URL).origin] : [])]);
  browser = await playwright.chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox','--disable-gpu','--autoplay-policy=user-gesture-required']});
  const context = await browser.newContext({acceptDownloads: true});
  await context.route('**/*', route => {
    const request = route.request().url();
    if (/^(data:|blob:|about:)/.test(request) || [...allowedOrigins].some(allowed => request.startsWith(allowed + '/'))) return route.continue();
    externalRequests.push(request); return route.abort();
  });
  for (const width of [320,390,768,1440]) await check('Visible sound controls and usable document fit at ' + width + 'px', async () => {
    const page = await newPage(context, url, width); await fresh(page);
    const widths = await page.evaluate(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
    assert(widths.document <= width + 1 && widths.body <= width + 1, JSON.stringify(widths)); assert.match(await page.title(), /MARINADE/);
    for (const key of soundPaths) {
      const el = page.locator('[data-path="'+key+'"]'); assert.equal(await el.count(), 1, key + ' one control'); assert(await el.isVisible(), key + ' visible');
      assert.equal(await el.evaluate(e => !!e.closest('details:not([open])')), false, key + ' open');
      await el.scrollIntoViewIfNeeded(); const box = await el.boundingBox(); assert(box.width > 0 && box.x >= -1 && box.x + box.width <= width + 1, key + ' reachable');
    }
    const editable = page.locator('[data-path]'), count = await editable.count();
    for(let i=0;i<count;i++){const el=editable.nth(i),key=await el.getAttribute('data-path');assert(await el.isVisible(),key+' visible source/path/step control');await el.scrollIntoViewIfNeeded();const box=await el.boundingBox();assert(box.width>0&&box.x>=-1&&box.x+box.width<=width+1,key+' source/path/step control reachable');}
    const small = await page.locator('button').evaluateAll(elements => elements.filter(el => {
      const r = el.getBoundingClientRect(); return !!(r.width && r.height) && !el.closest('[hidden]') && !el.closest('#keyboard') && (r.width < 35.5 || r.height < 35.5);
    }).map(el => ({text: el.textContent.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height})));
    assert.deepEqual(small, [], '36px minimum action targets');
    await page.evaluate(() => scrollTo(0,0)); await page.screenshot({path:path.join(artifacts,'marinade-'+width+'.png'),fullPage:true});
    const evidence = {...widths, visibleSoundControls: soundPaths.length, allVisibleEditableControls:count, buttons:await page.locator('button:visible').count()}; await page.close(); return evidence;
  });
  const page = await newPage(context,url); await fresh(page);
  await check('Gesture-started real audio, restart and Panic work without automatic startup', async () => {
    assert.equal(await page.evaluate(() => MarinadeApp.engine.context?.state || 'uninitialized'), 'uninitialized');
    await page.locator('#playButton').click(); await page.waitForFunction(() => MarinadeApp.engine.getMeters().peak > .001, null,{timeout:20000});
    const evidence = await page.evaluate(() => ({mode:MarinadeApp.engine.mode, state:MarinadeApp.engine.context.state, meters:MarinadeApp.engine.getMeters(), playing:MarinadeApp.isPlaying()}));
    assert.equal(evidence.state,'running'); assert(evidence.playing); assert(evidence.meters.voices > 0); assert(evidence.meters.peak <= 1.001);
    await page.locator('#restartButton').click(); await page.waitForFunction(() => MarinadeApp.isPlaying());
    await page.locator('#panicButton').click(); await page.waitForFunction(() => !MarinadeApp.isPlaying() && MarinadeApp.engine.getMeters().voices === 0);
    return {mode:evidence.mode, rms:evidence.meters.rms, peak:evidence.meters.peak, voices:evidence.meters.voices};
  });
  await check('Every recipe produces finite audible output captured from the real Web Audio node', async () => {
    await fresh(page); await page.locator('#playButton').click();
    const evidence = await page.evaluate(async () => {
      const engine=MarinadeApp.engine, context=engine.context, tap=context.createScriptProcessor(1024,2,2), sink=context.createGain(); sink.gain.value=0;
      engine.node.connect(tap);tap.connect(sink);sink.connect(context.destination);let measurement;
      tap.onaudioprocess=e=>{if(!measurement)return;for(let c=0;c<e.inputBuffer.numberOfChannels;c++)for(const value of e.inputBuffer.getChannelData(c)){measurement.samples++;measurement.energy+=value*value;measurement.peak=Math.max(measurement.peak,Math.abs(value));if(!Number.isFinite(value))measurement.nonfinite++;}};
      const out=[];for(const recipe of MarinadePresets.list){const select=document.querySelector('#presetSelect');select.value=recipe.id;select.dispatchEvent(new Event('change',{bubbles:true}));const began=performance.now();while(document.querySelector('#presetDescription').textContent!==recipe.description){if(performance.now()-began>5000)throw new Error('Recipe selection did not complete: '+recipe.name);await new Promise(r=>setTimeout(r,10));}await MarinadeApp.play();await new Promise(r=>setTimeout(r,70));measurement={samples:0,energy:0,peak:0,nonfinite:0};await new Promise(r=>setTimeout(r,300));out.push({name:recipe.name,samples:measurement.samples,rms:Math.sqrt(measurement.energy/Math.max(1,measurement.samples)),peak:measurement.peak,nonfinite:measurement.nonfinite});}
      measurement=null;engine.node.disconnect(tap);tap.disconnect();sink.disconnect();MarinadeApp.panic();return out;
    });
    assert(evidence.length>=20);for(const info of evidence){assert(info.samples>=4096,info.name+' captured');assert.equal(info.nonfinite,0,info.name);assert(info.rms>.00008,info.name+' audible');assert(info.peak<=1.001,info.name+' bounded');}return evidence;
  });
  await check('Typed edits and clear pattern preserve musical state through Undo and Redo', async () => {
    await fresh(page);const before=await state(page);await page.locator('#tempo').fill('117');await page.locator('#tempo').press('Tab');
    assert.equal((await state(page)).tempo,117);await page.locator('#undoButton').click();assert.equal((await state(page)).tempo,before.tempo);
    await page.locator('#redoButton').click();assert.equal((await state(page)).tempo,117);const music=await state(page);
    await page.locator('#clearPatternButton').click();assert((await state(page)).sequence.steps.every(s=>!s.on));await page.locator('#undoButton').click();assert.deepEqual((await state(page)).sequence,music.sequence);
  });
  await check('A path drawing is one undoable gesture, including actual touch input',async()=>{
    await fresh(page);const before=await state(page),canvas=page.locator('#pathCanvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
    await page.mouse.move(box.x+12,box.y+box.height*.8);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.2,{steps:12});await page.mouse.up();const drawn=await state(page);assert.notDeepEqual(drawn.morphPath.points,before.morphPath.points);await page.locator('#undoButton').click();assert.deepEqual((await state(page)).morphPath,before.morphPath);await page.locator('#redoButton').click();assert.deepEqual((await state(page)).morphPath,drawn.morphPath);
    const phone=await newPage(context,url,390);await fresh(phone);const original=await state(phone),surface=phone.locator('#pathCanvas');await surface.scrollIntoViewIfNeeded();const rect=await surface.boundingBox(),cdp=await context.newCDPSession(phone);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+15,y:rect.y+rect.height*.75}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+15+(rect.width-30)*i/8,y:rect.y+rect.height*(.75-.5*i/8)}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notDeepEqual((await state(phone)).morphPath.points,original.morphPath.points);await phone.locator('#undoButton').click();assert.deepEqual((await state(phone)).morphPath,original.morphPath);await phone.close();return{pointer:true,touch:true,oneUndoPerGesture:true};
  });
  await check('Step selection is harmless and protected notes survive seasoning',async()=>{
    await fresh(page);const before=await state(page);await page.locator('#steps [data-step="0"]').click();assert.deepEqual((await state(page)).sequence,before.sequence);await page.locator('#stepProtect').check();const protectedStep=(await state(page)).sequence.steps[0];await page.locator('#mutateButton').click();assert.deepEqual((await state(page)).sequence.steps[0],protectedStep);await page.locator('#undoButton').click();assert.deepEqual((await state(page)).sequence.steps[0],protectedStep);
  });
  await check('Swap exchanges source edits and complements every blend; two swaps restore the recipe',async()=>{
    await fresh(page);await page.evaluate(async()=>{const s=MarinadeApp.getState();Object.assign(s.synth,{morph:.23,pitchBlend:.31,textureBlend:.17,transientBlend:.79});s.samples[0].position=.12;s.samples[1].position=.63;await MarinadeApp.loadState(s);});const before=await state(page);await page.locator('#swapButton').click();const swapped=await state(page);assert.deepEqual(swapped.samples,[before.samples[1],before.samples[0]]);for(const key of['morph','pitchBlend','textureBlend','transientBlend'])assert(Math.abs(swapped.synth[key]-(1-before.synth[key]))<1e-12);assert.deepEqual(swapped.morphPath.points,before.morphPath.points.map(x=>1-x));await page.locator('#swapButton').click();const restored=await state(page);for(const key of['morph','pitchBlend','textureBlend','transientBlend'])assert(Math.abs(restored.synth[key]-before.synth[key])<1e-12);assert.deepEqual(restored.samples,before.samples);assert.deepEqual(restored.sequence,before.sequence);
  });
  await check('Actual source file import, source edits and Undo retain custom audio', async () => {
    await fresh(page); const before=await state(page);
    await page.locator('#sourceFileA').setInputFiles({name:'QA kitchen sine.wav',mimeType:'audio/wav',buffer:wavFixture()});
    await page.waitForFunction(()=>MarinadeApp.getState().samples[0].ref.kind==='pcm',null,{timeout:15000});
    const imported=await state(page);assert.equal(imported.samples[0].ref.sampleRate,22050);assert.equal(imported.samples[0].ref.frames,5513);
    const gain=page.locator('[data-path="samples.0.gain"]');await gain.evaluate(el=>{el.value='.6';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal((await state(page)).samples[0].gain,.6);await page.locator('#undoButton').click();assert.deepEqual((await state(page)).samples[0],imported.samples[0]);
    await page.locator('#undoButton').click();assert.deepEqual((await state(page)).samples,before.samples);await page.locator('#redoButton').click();assert.deepEqual((await state(page)).samples[0],imported.samples[0]);
    const saved=await state(page);await page.evaluate(async()=>{try{await MarinadeApp.importAudio({pcm:[new Float32Array()],sampleRate:48000,name:'Bad',options:{target:'b',replace:true}});throw new Error('invalid accepted');}catch(e){if(e.message==='invalid accepted')throw e;}});assert.deepEqual(await state(page),saved);
    return {portableFrames:imported.samples[0].ref.frames,bytes:imported.samples[0].ref.data.length};
  });
  await check('Portable project file roundtrip includes both custom sources and rejects invalid JSON atomically', async () => {
    await page.evaluate(async()=>{const pcm=Float32Array.from({length:4800},(_,i)=>Math.sin(2*Math.PI*523.25113*i/48000)*.4);await MarinadeApp.importAudio({pcm:[pcm],sampleRate:48000,name:'QA second ingredient',options:{target:'b',replace:true}});});
    const saved=await state(page);assert(saved.samples.every(s=>s.ref.kind==='pcm'));
    const item=await download(page,'#saveButton','project.json'),project=JSON.parse(item.bytes.toString('utf8'));assert.equal(project.format,'marinade-project');assert.deepEqual(project.state,saved);
    await fresh(page);await page.locator('#projectFile').setInputFiles({name:'restored.marinade.json',mimeType:'application/json',buffer:item.bytes});
    await page.waitForFunction(()=>MarinadeApp.getState().samples.every(s=>s.ref.kind==='pcm'));assert.deepEqual(await state(page),saved);
    await page.locator('#projectFile').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
    await page.waitForFunction(()=>/json|invalid|could|project|error/i.test(document.querySelector('#status').textContent));assert.deepEqual(await state(page),saved);
    return {bytes:item.bytes.length,filename:item.name};
  });
  await check('Superseded and cancelled source imports cannot overwrite newer user choices',async()=>{
    await fresh(page);const evidence=await page.evaluate(async()=>{
      const make=(frames,hz,name)=>({pcm:[Float32Array.from({length:frames},(_,i)=>Math.sin(2*Math.PI*hz*i/48000)*.5)],sampleRate:48000,name,options:{target:'a',replace:true}});
      const first=MarinadeApp.importAudio(make(48000,220,'Older ingredient'));const second=MarinadeApp.importAudio(make(4800,440,'Latest ingredient'));const outcome=await Promise.allSettled([first,second]);const s=MarinadeApp.getState();if(s.samples[0].ref.name!=='Latest ingredient')throw new Error('stale import overwrote latest choice');
      const saved=JSON.stringify(s),abort=new AbortController();abort.abort();try{await MarinadeApp.importAudio({...make(4800,660,'Cancelled'),signal:abort.signal});throw new Error('cancel accepted');}catch(error){if(error.message==='cancel accepted')throw error;}if(JSON.stringify(MarinadeApp.getState())!==saved)throw new Error('cancelled import mutated state');
      return{outcome:outcome.map(r=>r.status),latest:s.samples[0].ref.name,cancelledStateUnchanged:true};});return evidence;
  });
  await check('Parallel source imports preserve both bays and sound edits made during analysis',async()=>{
    await fresh(page);const evidence=await page.evaluate(async()=>{
      const make=(hz,name,target)=>({pcm:[Float32Array.from({length:43200},(_,i)=>Math.sin(2*Math.PI*hz*i/48000)*.5)],sampleRate:48000,name,options:{target,replace:true}});
      const a=MarinadeApp.importAudio(make(523.25113,'Parallel source A','a')),b=MarinadeApp.importAudio(make(783.99087,'Parallel source B','b'));
      const knob=document.querySelector('[data-path="fx.volume"]');knob.value='.43';knob.dispatchEvent(new Event('input',{bubbles:true}));knob.dispatchEvent(new Event('change',{bubbles:true}));await Promise.all([a,b]);
      const s=MarinadeApp.getState();if(s.samples[0].ref.name!=='Parallel source A'||s.samples[1].ref.name!=='Parallel source B')throw new Error('one parallel source was lost');if(s.fx.volume!==.43)throw new Error('pending analysis overwrote a newer knob edit');
      if(JSON.stringify(MarinadeApp.engine.state)!==JSON.stringify(s))throw new Error('engine state and editor differ after parallel source loads');return{sourceA:s.samples[0].ref.name,sourceB:s.samples[1].ref.name,volume:s.fx.volume};});return evidence;
  });
  await check('Keyboard audition and MIDI reconnect release notes on keyup, blur and disconnect', async () => {
    await fresh(page);await page.locator('#keyboard').scrollIntoViewIfNeeded();await page.locator('body').click({position:{x:20,y:20}});await page.keyboard.down('a');
    await page.waitForFunction(()=>MarinadeApp.engine.getMeters().voices>0);await page.locator('[data-path="synth.morph"]').evaluate(el=>{el.value='.8';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(await page.evaluate(()=>MarinadeApp.engine.getMeters().voices),1,'live edit retains held note');await page.keyboard.up('a');await page.waitForFunction(()=>MarinadeApp.engine.getMeters().voices===0,null,{timeout:12000});
    await page.keyboard.down('s');await page.waitForFunction(()=>MarinadeApp.engine.getMeters().voices>0);await page.evaluate(()=>dispatchEvent(new Event('blur')));await page.keyboard.up('s');await page.waitForFunction(()=>MarinadeApp.engine.getMeters().voices===0,null,{timeout:12000});
    const key=page.locator('#keyboard [data-note]').first();await key.scrollIntoViewIfNeeded();const box=await key.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height*.8);await page.mouse.down();await page.waitForFunction(()=>MarinadeApp.engine.getMeters().peak>.001);await page.mouse.up();await page.locator('#panicButton').click();
    const midi=await newPage(context,url,390,{midi:true});await fresh(midi);await midi.locator('#midiButton').click();
    await midi.evaluate(()=>__qaMidiInput.onmidimessage({data:new Uint8Array([144,72,110])}));await midi.waitForFunction(()=>MarinadeApp.engine.getMeters().voices>0);
    await midi.evaluate(()=>{__qaMidiInput.state='disconnected';__qaMidiAccess.onstatechange();});await midi.waitForFunction(()=>MarinadeApp.engine.getMeters().voices===0,null,{timeout:12000});assert.equal(await midi.evaluate(()=>__qaMidiInput.onmidimessage),null);
    await midi.evaluate(()=>{__qaMidiInput.state='connected';__qaMidiAccess.onstatechange();});assert(await midi.evaluate(()=>typeof __qaMidiInput.onmidimessage==='function'));await midi.close();return {simulatedMidi:true,releaseAndDisconnect:true};
  });
  await check('WAV download contains audible 48k stereo PCM', async () => {
    await fresh(page);await page.locator('#exportBars').fill('1');await page.locator('#exportScope').selectOption('note');const wave=await download(page,'#wavButton','single-note.wav'),info=pcm16Stats(wave.bytes);assert(info.rms>.0001&&info.peak>.001&&info.peak<=1);return info;
  });
  await check('Shared pattern library and exact incoming notes preserve portable recipe and native Undo', async () => {
    await fresh(page);const native=await page.evaluate(async()=>MusicLabPatternSchema.normalize(await MusicLabPatternInstrument.exportPattern()));assert.equal(native.sourceApp,'marinade');assert.equal(native.swing,0);assert(native.notes.length>0&&native.notes.every(n=>n.probability===1));
    const packet={format:'musiclab-pattern',version:1,kind:'notes',name:'Off-grid borrowed phrase',sourceApp:'proof',tempo:117,swing:.2,lengthBeats:4,meter:[4,4],seed:991,
      voices:[{id:'donor',name:'Borrowed notes'}],notes:[{id:'n1',voice:'donor',pitch:60,beat:.17,duration:.31,velocity:.7,probability:1},{id:'n2',voice:'donor',pitch:67,beat:.25,duration:.42,velocity:.8,probability:.6},{id:'n3',voice:'donor',pitch:72,beat:1.71,duration:.89,velocity:.5,probability:1}],tags:[]};
    const normalized=await page.evaluate(async packet=>{const p=MusicLabPatternSchema.normalize(packet),item=await MusicLabPatterns.save(p),fetched=await MusicLabPatterns.get(item.id);if(MusicLabPatternSchema.serialize(p)!==MusicLabPatternSchema.serialize(fetched))throw new Error('library changed');await MusicLabPatternInstrument.importPattern({pattern:p,options:{replace:true,voiceMap:{donor:'synth'}}});return p;},packet);
    const imported=await state(page);assert.deepEqual(imported.musicLabPattern.pattern,normalized);assert(await page.locator('#importedNotice').isVisible());
    const realized=await page.evaluate(()=>MarinadeSequence.events(MarinadeApp.getState(),{startBeat:0,lengthBeats:4}));assert(realized.some(n=>n.startBeat===.17)&&realized.some(n=>n.startBeat===1.71));
    await page.locator('#nativePatternButton').click();assert.equal((await state(page)).musicLabPattern,undefined);await page.locator('#undoButton').click();assert.deepEqual((await state(page)).musicLabPattern,imported.musicLabPattern);return {receivedNotes:normalized.notes.length,fractionalTiming:true};
  });
  let sharedSample;
  await check('Samples panel sends real MARINADE audio and receives it into an explicit source bay', async () => {
    await fresh(page);await page.locator('[data-musiclab-exchange="marinade"]').click();const dialog=page.locator('.ml-ex-dialog');await dialog.locator('[data-tab="send"]').click();await dialog.locator('[name="scope"]').selectOption('note');await dialog.locator('[name="tail"]').fill('.2');await dialog.locator('[data-action="render"]').click();
    await dialog.locator('.ml-ex-rendered').waitFor({state:'visible',timeout:90000});await dialog.locator('[data-action="save"]').click();
    sharedSample=await page.evaluate(async()=>{const began=performance.now();for(;;){const entries=await MusicLabExchange.list(),match=entries.find(s=>String(s.sourceApp).toLowerCase()==='marinade');if(match)return match.id;if(performance.now()-began>10000)throw new Error('Rendered sample was not saved');await new Promise(r=>setTimeout(r,30));}});await dialog.locator('[data-action="close"]').click();
    const before=await state(page);await page.locator('[data-musiclab-exchange="marinade"]').click();await dialog.locator('[data-sample="'+sharedSample+'"]').click();await dialog.locator('[name="target"]').selectOption('b');
    const replace=dialog.locator('[name="replace"]');if(await replace.count())await replace.check();await dialog.locator('[data-action="receive"]').click();
    await page.waitForFunction(()=>MarinadeApp.getState().samples[1].ref.kind==='pcm',null,{timeout:20000});const received=await state(page);assert.deepEqual(received.samples[0],before.samples[0]);assert.equal(received.samples[1].ref.sampleRate,22050);assert(received.samples[1].ref.frames>0);await dialog.locator('[data-action="close"]').click();return {libraryId:sharedSample,explicitDestination:'b',sourceAUnchanged:true};
  });
  if(!hasSiblingApps&&!process.env.MARINADE_SKIP_TRANSFERS){skipped.push('Sibling STOCK/GALLEY transfers are unavailable in an extracted source archive.');console.log('SKIP '+skipped.at(-1));}
  if(hasSiblingApps&&!process.env.MARINADE_SKIP_TRANSFERS)await check('Shared audio is received into STOCK and GALLEY without losing native frames',async()=>{
    const source=await page.evaluate(async id=>{const a=await MusicLabExchange.get(id);return {frames:a.frames,sampleRate:a.sampleRate};},sharedSample);assert(sharedSample);
    for(const [app,facade]of[['fable','FableApp'],['loom','LoomApp']]){
      const destination=await context.newPage();destination.on('pageerror',e=>browserErrors.push({url:destination.url(),error:e.message}));await destination.goto(origin+'/'+app+'/index.html');await destination.waitForFunction(name=>!!window[name],facade);
      const before=await destination.evaluate(name=>window[name].getState(),facade);await destination.locator('[data-musiclab-exchange="'+app+'"]').click();const incoming=destination.locator('.ml-ex-dialog');await incoming.locator('[data-sample="'+sharedSample+'"]').click();await incoming.locator('[name="target"]').selectOption(app==='fable'?'new':before.tracks[0].id);await incoming.locator('[data-action="receive"]').click();
      await destination.waitForFunction(({facade,count})=>window[facade].getState().assets.length===count+1,{facade,count:before.assets.length});
      const evidence=await destination.evaluate(async({id,facade,app})=>{const incoming=await MusicLabExchange.get(id),asset=window[facade].getState().assets.at(-1),decoded=(app==='fable'?FableSchema:LoomSchema).decodeAsset(asset);const left=decoded.left||decoded.channels?.[0],right=decoded.right||decoded.channels?.[1]||left;if(!left||!right)throw new Error('missing imported PCM');let maximum=0;for(let i=0;i<left.length;i++)maximum=Math.max(maximum,Math.abs(left[i]-incoming.pcm[0][i]),Math.abs(right[i]-(incoming.pcm[1]||incoming.pcm[0])[i]));return{frames:left.length,sampleRate:decoded.sampleRate,maximum};},{id:sharedSample,facade,app});
      assert.equal(evidence.frames,source.frames);assert.equal(evidence.sampleRate,source.sampleRate);assert(evidence.maximum<=1/16384,app+' source PCM retained');await destination.close();
    }return source;
  });
  await check('Fallback processor plays a complete self-contained document with all network blocked',async()=>{
    const offline=await context.newPage();offline.on('pageerror',e=>browserErrors.push({url:'offline',error:e.message}));await offline.addInitScript(()=>Object.defineProperty(AudioContext.prototype,'audioWorklet',{get:()=>undefined,configurable:true}));
    await offline.goto(origin+'/qa-offline-shell');await offline.route('**/*',route=>route.abort());await offline.setContent(await previewHTML(),{waitUntil:'load'});await offline.waitForFunction(()=>!!window.MarinadeApp);await fresh(offline);await offline.locator('#playButton').click();await offline.waitForFunction(()=>MarinadeApp.engine.getMeters().peak>.001,null,{timeout:20000});
    const evidence=await offline.evaluate(()=>({mode:MarinadeApp.engine.mode,peak:MarinadeApp.engine.getMeters().peak,voices:MarinadeApp.engine.getMeters().voices}));assert.match(evidence.mode,/script|fallback/i);assert(evidence.voices>0);await offline.close();return evidence;
  });
  // Host checks opt in because source archives intentionally contain only this instrument.
  if(process.env.MARINADE_HOST_URL||process.env.MARINADE_HOST_CHECK)await check('Actual GALLEY prints exact native 48k PCM at 44.1k, preserves custom sources, edits and restores notes',async()=>{
    const host=await context.newPage();host.on('pageerror',e=>browserErrors.push({url:host.url(),error:e.message}));await host.goto(process.env.MARINADE_HOST_URL||origin+'/loom/index.html');await host.waitForFunction(()=>!!window.LoomApp);
    await host.evaluate(async()=>{await LoomApp.loadState(LoomSchema.defaultState());await LoomApp.engine.applyAudioSettings({sampleRate:'44100'});});await host.locator('#playButton').click();await host.locator('#panicButton').click();assert.equal(await host.evaluate(()=>LoomApp.engine.context.sampleRate),44100);
    const patch=await page.evaluate(()=>{const s=MarinadeSchema.defaultState();s.name='QA portable spectral recipe';s.synth.formantShift=7;s.synth.morph=.37;s.samples[0].ref=MarinadeSources.encodeAudio({pcm:[Float32Array.from({length:12000},(_,i)=>Math.sin(2*Math.PI*261.625565*i/48000)*.5)],sampleRate:48000,name:'QA original ingredient'});return JSON.parse(MarinadeSchema.serialize(s));});
    const setup=await host.evaluate(async patch=>{
      const s=LoomSchema.defaultState();s.tempo=120;s.loopEnabled=false;
      const pattern=MusicLabPatternSchema.normalize({format:'musiclab-pattern',version:1,name:'Exact two-second MARINADE print',sourceApp:'marinade',tempo:120,swing:0,lengthBeats:4,meter:[4,4],seed:44100,
        voices:[{id:'synth',name:'MARINADE'}],notes:[{id:'first',voice:'synth',pitch:60,beat:0,duration:.5,velocity:.8,probability:1},{id:'middle',voice:'synth',pitch:67,beat:1.25,duration:.75,velocity:.72,probability:1},{id:'last',voice:'synth',pitch:69,beat:2.8,duration:1.2,velocity:.9,probability:1}]});
      s.tracks[0].instrument={id:'marinade',name:'MARINADE',snapshot:{format:'loom-instrument-state',version:1,app:'marinade',state:patch,storage:{}}};
      s.tracks[0].clips=[{id:'qa-two-second-print',name:pattern.name,type:'notes',pattern,voiceMap:{synth:'synth'},start:0,length:4,sourceOffset:0,rate:1,loop:false,gain:1,fadeIn:0,fadeOut:0,transpose:0}];
      await LoomApp.loadState(s);LoomApp.selectClip('qa-two-second-print');return{pattern,original:LoomApp.getState().tracks[0].clips[0]};
    },patch);
    await host.locator('#playButton').click();await host.waitForFunction(()=>LoomApp.engine.getMeters().master.peak>.0001,null,{timeout:20000});await host.locator('#stopButton').click();
    await host.locator('#printNoteClipButton').click();await host.waitForFunction(()=>LoomApp.getState().tracks[0].clips[0].type==='audio'||/shorter|invalid|failed|error/i.test(document.querySelector('#status').textContent),null,{timeout:90000});
    const printed=await host.evaluate(()=>{const s=LoomApp.getState(),clip=s.tracks[0].clips[0],asset=s.assets.find(a=>a.id===clip.assetId);if(clip.type!=='audio')throw new Error(document.querySelector('#status').textContent);const decoded=LoomSchema.decodeAsset(asset);let peak=0,nonfinite=0;for(const c of[decoded.left,decoded.right])for(const x of c){if(!Number.isFinite(x))nonfinite++;peak=Math.max(peak,Math.abs(x));}const portable=LoomSchema.parseProject(LoomSchema.serializeProject(s));return{clip,frames:asset.frames,sampleRate:asset.sampleRate,peak,nonfinite,portableOrigin:portable.tracks[0].clips[0].origin};});
    assert.equal(printed.frames,96000);assert.equal(printed.sampleRate,48000);assert(printed.peak>.001);assert.equal(printed.nonfinite,0);assert.deepEqual(printed.clip.origin.pattern,setup.pattern);assert.deepEqual(printed.portableOrigin,printed.clip.origin);
    assert.equal(printed.clip.origin.instrument.snapshot.state.state.samples[0].ref.data,patch.state.samples[0].ref.data);assert.equal(printed.clip.origin.instrument.snapshot.state.state.synth.formantShift,7);
    await host.locator('#editSourceButton').click();await host.waitForFunction(()=>!!LoomApp.noteWorkflow.sourceEdit,null,{timeout:20000});const source=await host.evaluate(()=>{const r=LoomApp.host.records.get('track-1');return{pattern:LoomApp.host.getPatternAdapter('track-1').importedPattern,state:r.iframe.contentWindow.MarinadeApp.getState(),parentRate:LoomApp.engine.context.sampleRate};});
    assert.deepEqual(source.pattern,setup.pattern);assert.equal(source.state.samples[0].ref.data,patch.state.samples[0].ref.data);assert.equal(source.state.synth.formantShift,7);assert.equal(source.parentRate,44100);
    await host.locator('#closeInstrument').click();await host.locator('#restoreNotesButton').click();await host.waitForFunction(()=>LoomApp.getState().tracks[0].clips[0].type==='notes');const restored=await host.evaluate(()=>{LoomApp.host.unload('track-1');return{clip:LoomApp.getState().tracks[0].clips[0],context:LoomApp.engine.context.state,trackCount:LoomApp.getState().tracks.length,slots:LoomApp.getState().tracks.map(t=>t.effects.length),catalog:LoomInstrumentManifest.length};});assert.deepEqual(restored.clip,setup.original);assert.notEqual(restored.context,'closed');assert.equal(restored.trackCount,8);assert.deepEqual(restored.slots,Array(8).fill(4));assert.equal(restored.catalog,13);await host.close();
    return{parentSampleRate:44100,sourceSampleRate:printed.sampleRate,frames:printed.frames,peak:printed.peak,originalCustomSourceRestored:true};
  });
  await check('No browser errors or external network dependencies',()=>{assert.deepEqual(browserErrors,[]);assert.deepEqual(externalRequests,[]);return{browserErrors:0,externalRequests:0};});
  await page.close();await context.close();const report={checkedAt:new Date().toISOString(),url,passed:results.length,failed:failures.length,skipped,results,failures,browserErrors,externalRequests};fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('\nMARINADE browser: '+results.length+' passed, '+failures.length+' failed. Artifacts: '+artifacts);if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
