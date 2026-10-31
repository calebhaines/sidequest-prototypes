(function () {
  'use strict';
  const S = window.LoomSchema, $ = id => document.getElementById(id), clone = value => S.copy(value);
  const effects = window.LoomEffectsCatalog, effectById = id => effects.find(f => f.id === id);
  const effectParams=def=>def.params;
  const icons = {play:'<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M2 1 11 7 2 13Z" fill="currentColor"/></svg>',pause:'<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M2 1h3v12H2zm5 0h3v12H7z" fill="currentColor"/></svg>'};
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  // Presentation-only updates: leave the audio graph and scheduling untouched.
  // Avoid replacing text nodes and restyling controls when their value is unchanged.
  function updateText(element, value) { const text = String(value); if (element.textContent !== text) element.textContent = text; }
  function updateAttribute(element, name, value) { const text = String(value); if (element.getAttribute(name) !== text) element.setAttribute(name, text); }
  function updateProperty(element, name, value) { const next = name === 'value' ? String(value) : value; if (element[name] !== next) element[name] = next; }
  function updateStyle(element, name, value) { if (element.style[name] !== value) element.style[name] = value; }
  function updateClass(element, name, active) { const enabled = !!active; if (element.classList.contains(name) !== enabled) element.classList.toggle(name, enabled); }
  let recordFinishOperation = 0;
  let state, selectedClip = null, selectedSlot = null, history = [], future = [], lifecycle = 0, transportOperation = 0, recordPending = false, recordFinishing = false, transportPending = false, importOperation = 0, projectOperation = 0, loadOperations = new Map(), exportAbort = null, autosaveTimer, recovery = true;
  let recoveryWarned=false,recoveryUnavailable=false;
  let assetMap = {}, waveformFrame = 0, fitInitial = true, drag = null, frameTrack = null, browserTrack = null, discoveryDone = false, customManifest = [], meterTime = 0;
  let seekDrag = null, followUntil = 0, markerEditing = null, transferOperation = 0, transferAbort = null, transferSpec = null, microphoneOperation = 0;
  let automationEditor, pianoRoll, noteWorkflow, serviceController, cpuInspector;
  let audioSettingsBusy = false, audioDeviceBusy = false, ampPracticeBusy = false, audioDeviceOperation = 0, audioSettingsOperation = 0, audioDiagnosticsTime = 0, audioDevices = null;
  let vocalEditorView = 'basic';
  let rackTarget = 'track';
  const vocalHelpOpen = new Set();
  const broilerDetailsOpen = new Set();
  let compressorAdvancedOpen = false;
  const preampDetailsOpen = new Set();
  const tapeDetailsOpen = new Set();
  let tapeDrag = null, tapeKeyboard = null;
  let trackEqDrag = null, trackEqKeyboard = null;
  const trackEqBands = [
    { key: 'low', label: 'LOW', frequency: '100 Hz', shape: 'low shelf' },
    { key: 'lowMid', label: 'LO MID', frequency: '400 Hz', shape: 'bell' },
    { key: 'highMid', label: 'HI MID', frequency: '2.5 kHz', shape: 'bell' },
    { key: 'high', label: 'HIGH', frequency: '10 kHz', shape: 'high shelf' }
  ];
  const trackEqSweeps = [
    { key: 'lowMidFreq', band: 'lowMid', label: 'LO MID SWEEP', min: 80, max: 2000, default: 400, step: 1, sweep: true },
    { key: 'highMidFreq', band: 'highMid', label: 'HI MID SWEEP', min: 400, max: 10000, default: 2500, step: 1, sweep: true }
  ];
  const trackEqControls = [...trackEqBands.map(band => ({ ...band, min: -12, max: 12, default: 0, step: .1 })), ...trackEqSweeps];
  const trackEqDefinition = key => trackEqControls.find(control => control.key === key);
  const instrumentHistory=new WeakSet();
  const frames = new Map(), armedBeforeRecord = new Map(), openedApps = new Map();
  try { recovery = localStorage.getItem('loom-recovery-enabled') !== '0'; const saved = recovery && localStorage.getItem('loom-session-v1'); state = saved ? S.parseProject(saved) : S.demoState(); } catch (_) { state = S.demoState(); recoveryUnavailable=true; }
  state = S.normalize(state);
  const engine = new window.LoomAudio(state);
  const host = new window.LoomInstrumentHost({ context: () => engine.context, transport: () => engine.getTransport(), getTrackInput: id => engine.getTrackInput(id), onStatus: (id, message, kind) => { if (id === frameTrack) $('instrumentHostStatus').textContent = message; if (kind === 'error') status(message); }, onStateChange: id => { scheduleSnapshot(id); } });
  const notePlayback = new window.LoomNotePlayback({ audio: engine, host, getState: () => state, ensureInstrument: t => ensureInstrument(t), onStatus: message => status(message) });
  const noteRenderer = new window.LoomNoteRenderer({ host, context: () => engine.context });
  const nativeRenderWav = engine.renderWav.bind(engine);
  async function renderSnapshot(source, signal, options = {}) {
    const captured = clone(source), generation = lifecycle;
    for (const t of captured.tracks) if (t.instrument && (!options.trackId || t.id === options.trackId) && t.clips.some(c => c.type === 'notes' && c.start < (options.endBeat ?? source.lengthBars * 4) && c.start + c.length > (options.startBeat ?? 0))) {
      if (signal?.aborted) throw canceledError();
      const actual = state.tracks.find(track => track.id === t.id && track.instrument?.id === t.instrument.id);
      if (actual) { await ensureInstrument(actual); const snapshot = await host.snapshot(t.id); if (snapshot) { t.instrument.snapshot = snapshot; noteWorkflow?.captureSnapshot(t.id, snapshot); } }
    }
    if (generation !== lifecycle || signal?.aborted) throw canceledError();
    return captured;
  }
  engine.renderWav = async (renderState = state, renderAssets = assetMap, options = {}) => {
    if (!renderState.tracks.some(t => t.clips.some(c => c.type === 'notes'))) return nativeRenderWav(renderState, renderAssets, options);
    const captured = options.snapshotReady ? clone(renderState) : await renderSnapshot(renderState, options.signal, options);
    const prepared = await noteRenderer.prepareNotes(captured, renderAssets, { ...options, onProgress: p => options.onProgress?.(p * .35) });
    return nativeRenderWav(prepared.state, prepared.assets, { ...options, onProgress: p => options.onProgress?.(.35 + p * .65) });
  };
  function commitNotes(next, { selected, trackIndex, instruments = false } = {}) {
    const previous = state, normalized = S.normalize(next); remember({ instruments }); state = normalized;
    if (selected !== undefined) selectedClip = selected; if (trackIndex !== undefined) { rackTarget = 'track'; state.selectedTrack = trackIndex; }
    for (let i = 0; i < 8; i++) if (frames.has(state.tracks[i].id) && previous.tracks[i].instrument?.id !== state.tracks[i].instrument?.id) {
      const id = state.tracks[i].id; host.unload(id); frames.get(id).remove(); frames.delete(id); openedApps.delete(id); engine.clearAudition(id);
    }
    decodeAssets(); changed({ arrangement: true, mixer: true, rack: true, inspector: true });
    if (instruments) return Promise.all(state.tracks.filter(t => frames.has(t.id) && t.instrument?.snapshot).map(t => host.restore(t.id, t.instrument.snapshot)));
  }
  async function auditionNote(event) {
    const editable = noteWorkflow?.getEditableClip(), t = state.tracks[editable?.trackIndex ?? state.selectedTrack]; if (!t?.instrument) return;
    const generation = lifecycle, operation = transportOperation, instrumentId = t.instrument.id, revision = engine.getTransport().revision;
    await ensureInstrument(t); const adapter = host.getPatternAdapter(t.id); await adapter?.prepare?.();
    if (adapter?.preparePattern) {
      const tempo = state.tempo, duration = Math.min(256, Math.max(.001, (event.durationSeconds || .3) * tempo / 60)), voice = event.voice || adapter.notes?.voices?.[0]?.id;
      await adapter.preparePattern({ tempo, voiceMap: { [voice]: voice }, pattern: { format: 'musiclab-pattern', version: 1, name: 'Note audition', sourceApp: t.instrument.id.toUpperCase(), kind: 'notes', tempo, lengthBeats: Math.max(.25, duration), voices: [{ id: voice, name: voice }], notes: [{ id: 'audition', pitch: event.pitch, velocity: event.velocity ?? .8, beat: 0, duration, voice, ...(event.lyric !== undefined ? { lyric: event.lyric } : {}) }] } });
    }
    if (generation !== lifecycle || operation !== transportOperation || revision !== engine.getTransport().revision || host.getPatternAdapter(t.id) !== adapter || state.tracks.find(item => item.id === t.id)?.instrument?.id !== instrumentId) return;
    engine.resumeAudition(t.id);
    const target = event.voice;
    host.scheduleNote(t.id, { ...event, voice: target, id: S.uid('audition'), when: engine.context.currentTime + .015, source: 'loom-audition' });
    setTimeout(() => { if (!engine.getMeters().playing && frameTrack !== t.id) engine.clearAudition(t.id); }, Math.min(10000, ((event.durationSeconds || .3) + 3) * 1000));
  }
  function drawNotePreview(el, clip) {
    const canvas = el.querySelector('canvas'), width = Math.max(1, Math.min(2400, el.clientWidth)), scale = Math.min(2, devicePixelRatio || 1); canvas.width = width * scale; canvas.height = 32 * scale;
    const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.fillStyle = state.tracks[Number(el.dataset.track)].color;
    const pitches = clip.pattern.notes.map(n => n.pitch), low = Math.min(48, ...pitches), high = Math.max(72, ...pitches), span = Math.max(12, high - low);
    const patternLength = clip.pattern.lengthBeats, start = clip.sourceOffset || 0, end = start + clip.length * clip.rate;
    const first = clip.loop ? Math.floor(start / patternLength) : 0, last = clip.loop ? Math.min(first + 256, Math.ceil(end / patternLength)) : 1;
    for (let cycle = first; cycle < last; cycle++) for (const n of clip.pattern.notes) {
      const beat = (n.beat + cycle * patternLength - start) / clip.rate, finish = beat + n.duration / clip.rate;
      if (finish <= 0 || beat >= clip.length) continue; const x = Math.max(0, beat / clip.length * width), right = Math.min(width, finish / clip.length * width);
      ctx.globalAlpha = .35 + n.velocity * .65; ctx.fillRect(x, 27 - (n.pitch - low) / span * 24, Math.max(2, right - x), 2.5);
    }
  }
  function status(message) { $('status').textContent = message; }
  function track() { return state.tracks[state.selectedTrack]; }
  function effectOwner() { return rackTarget === 'master' ? state.master : rackTarget === 'track' ? track() : state.returns.find(owner => owner.id === rackTarget) || track(); }
  function effectOwnerLabel() { const owner = effectOwner(); return owner.id === 'master' ? 'MASTER' : owner.id.startsWith('return-') ? owner.name.toUpperCase() : 'TRACK ' + String(state.tracks.indexOf(owner) + 1).padStart(2, '0'); }
  function effectReading(meters) { return rackTarget === 'master' ? meters.masterEffects?.[selectedSlot] : rackTarget === 'track' ? meters.effects?.[state.selectedTrack]?.[selectedSlot] : meters.returnEffects?.[state.returns.findIndex(owner => owner.id === rackTarget)]?.[selectedSlot]; }
  function clipLocation() { if (!selectedClip) return null; for (const t of state.tracks) { const c = t.clips.find(c => c.id === selectedClip); if (c) return {track:t, clip:c}; } return null; }
  function filename(suffix) { return (state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'loom-session') + suffix; }
  function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  function remember({instruments=false}={}) { const entry=clone(state); if(instruments)instrumentHistory.add(entry); history.push(entry); if (history.length > 40) history.shift(); future = []; renderHistory(); }
  function renderHistory() { $('undoButton').disabled = !history.length; $('redoButton').disabled = !future.length; }
  function decodeAssets() { const next = {}; for (const asset of state.assets) { next[asset.id] = assetMap[asset.id] || S.decodeAsset(asset); } assetMap = next; engine.setAssets(assetMap); }
  function changed(options = {}) { engine.setState(state); notePlayback.setState(state); renderHistory(); if (options.arrangement) renderArrangement(); if (options.mixer) renderMixer(); if (options.rack) renderRack(); if (options.inspector) renderClipInspector(); if(options.automation) automationEditor?.render(); if(options.notes) pianoRoll?.render(); noteWorkflow?.render(); scheduleAutosave(); }
  function recoveryInfo(message){$('recoveryStatus').hidden=!message;$('recoveryStatus').textContent=message||'';if(message&&!recoveryWarned){recoveryWarned=true;status(message);}}
  function scheduleAutosave(){clearTimeout(autosaveTimer);if(!recovery){recoveryInfo('Browser recovery is off. Save a project to keep this session.');return;}autosaveTimer=setTimeout(()=>{try{const serialized=S.serializeProject(state);if(serialized.length<8*1024*1024){localStorage.setItem('loom-session-v1',serialized);recoveryUnavailable=false;recoveryInfo('');}else{localStorage.removeItem('loom-session-v1');recoveryInfo('This session is too large for browser recovery. Save a project to keep your work.');}}catch(_){recoveryUnavailable=true;recoveryInfo('Browser recovery is unavailable or full. Save a project to keep this session.');}},1600);}
  const snapshotTimers = new Map();
  function scheduleSnapshot(id) { clearTimeout(snapshotTimers.get(id)); const generation = lifecycle; snapshotTimers.set(id, setTimeout(async () => { try { const snapshot = await host.snapshot(id); if (generation !== lifecycle) return; const t = state.tracks.find(t => t.id === id); if (t && t.instrument && snapshot) { t.instrument.snapshot = snapshot; noteWorkflow?.captureSnapshot(id, snapshot); scheduleAutosave(); } } catch (_) {} }, 900)); }
  async function snapshotAll() { for (const t of state.tracks) if (t.instrument && frames.has(t.id)) { try { const snapshot = await host.snapshot(t.id); if (snapshot) { t.instrument.snapshot = snapshot; noteWorkflow?.captureSnapshot(t.id, snapshot); } } catch (e) { status('The audio project is safe; one instrument could not provide its current settings. ' + e.message); } } }
  function snap(value) { const step = state.view.snap; return step ? Math.round(value / step) * step : Math.round(value * 1000) / 1000; }
  function selectedTrack(index, options = {}) { rackTarget = 'track'; state.selectedTrack = index; if (!options.keepClip) selectedClip = null; if (selectedSlot !== null && !effectOwner().effects[selectedSlot]) selectedSlot = null; renderTrackHeaders(); renderLanes(); renderMixer(); renderRack(); renderClipInspector(); renderEffectEditor(); renderTransport(); automationEditor?.render(); noteWorkflow?.render(); scheduleAutosave(); }
  function panLabel(value) { return Math.abs(value) < .01 ? 'C' : Math.round(Math.abs(value) * 100) + (value < 0 ? ' L' : ' R'); }
  function levelLabel(value) { return value <= .0001 ? '−∞ dB' : (20 * Math.log10(value)).toFixed(1) + ' dB'; }
  function effectArt(def, compact = false) {
    const c = def.color, a = def.accent;
    const drawings = {
      prism: `<path d="m33 93 36-74h99l-36 74Z"/><path d="m49 85 25-55h75l-25 55Z" stroke="${a}"/><path d="m62 71 76-6M66 60l77-6M71 48l77-6"/><path d="m168 19 38 13-30 73-44-12M178 51l14 5"/><path d="M22 109h210" opacity=".3"/>`,
      preserve: `<path d="M24 16h202v94H24zM31 23h188v68H31zM41 99h46m76 0h45M99 93h52v12H99z"/><circle cx="78" cy="55" r="25"/><circle cx="172" cy="55" r="25"/><circle cx="78" cy="55" r="7"/><circle cx="172" cy="55" r="7"/><path d="M78 37v8m15 19-7-4m-23 4 7-4m102-23v8m15 19-7-4m-23 4 7-4M59 72l18 13h96l18-13" stroke="${a}"/><path d="M42 119h167m-108-19h47M40 32h10m151 0h10" stroke="${a}"/>`,
      saute: `<ellipse cx="93" cy="68" rx="62" ry="17"/><path d="M31 68v10c0 26 124 26 124 0V68m-4 5 70-27 4 9-71 28M52 62q10-17 21-3t22-3 22 4 18-3M60 45q-8-10 1-20m32 17q-8-10 1-20m33 22q-8-10 1-20M24 109h161"/><path d="m52 84 8 2m10 2 9 1m27 0 11-1m10-2 9-2" stroke="${a}"/>`,
      velvet: `<path d="M34 92V44l47-19 121 13v48l-45 20Z"/><path d="m34 44 123 15 45-21M157 59v47M34 92l123 14" stroke="${a}"/><path d="M71 16v7m20-10v7m72-1v8M54 53v28m9-28v29" opacity=".4"/><path d="m17 108 15-5 12 5 15-6 13 6 16-5 14 5 15-5 15 5 15-5 15 5 15-5 15 5 15-5 15 5 16-5" stroke="${a}"/>`,
      cinder: `<path d="M33 17h184v93H33zM43 25h164v76H43z"/><path d="M54 25v76m22-76v76m22-76v76m22-76v76m22-76v76m22-76v76m22-76v76"/><path d="M43 44h164M43 78h164"/><path d="m66 64 9-22 10 13 5-15 10 24m31-3 10-15 5 12 12-27 10 32m-68 41 9-12 5 11 5-7 7 10m33-1 7-15 10 13" stroke="${a}"/>`,
      undertow: `<path d="M22 25h94m18 0h94M61 25v33c-23 0-27 40 0 40s23-40 0-40m114-33v33c-23 0-27 40 0 40s23-40 0-40"/><path d="m42 70 10-11m114 12 12-12M93 49l11-11 12 11m25 38 12 11 12-11" stroke="${a}"/><path d="M9 113h234" stroke="${a}" stroke-dasharray="2 5"/>`,
      parallax: `<path d="M20 25h161l-9 26H29zM41 58h161l-9 26H50zM62 91h161l-7 20H69z"/><path d="M35 35h60m-55 5h43m17 28h64m-57 7h48m-48 22h64m-57 7h48" stroke="${a}"/><path d="M207 19v17m-8-8h16"/><path d="m187 45 15 9m-61 33 13 4" stroke-dasharray="2 3"/>`,
      vestige: `<path d="M81 12h88v25H81zM81 37 27 72h196l-54-35M27 72v13h196V72M53 85v11m144-11v11"/><path d="M59 65h132M75 58h100M89 51h72" stroke="${a}"/><path d="M63 117q-9-9 0-17m33 17q9-9 0-17m32 17q-9-9 0-17m32 17q9-9 0-17m32 17q-9-9 0-17" stroke="${a}"/>`,
      halo: `<path d="M22 95h208v15H22zM32 95V29h188v66M45 36h162M53 95c0-17 23-30 42-25s25 10 28 25m4 0c-2-27 13-38 37-37s31 15 30 37"/><path d="m68 80 10-8m8 17 12-12m43 0 13-11m10 19 12-14M125 46V8m-10 12 10-12 10 12" stroke="${a}"/><path d="M14 118h223" opacity=".3"/>`,
      tremor: `<path d="m31 21 63 42m-55-54 63 43M31 21l8-12m55 54c15 54 93 52 117 15s-11-47-45-32l-64 6M94 63c26 28 71 42 96 31m-88-42c27 5 58 21 88 42m-24-48c-10 17-34 40-49 42M72 40l8-11"/><path d="M22 112h15v-8h16v8h15v-8h16v8h15v-8h16v8h15v-8h16v8h15v-8h16v8h15v-8h16v8h15" stroke="${a}"/>`,
      broiler: `<path d="M50 8h150v33H50zM57 15h136v19H57zM85 8V4h80v4M57 41v5m136-5v5M44 47h162v70H44zM51 54h148v56H51z"/><path d="M96 18h52v12H96zM102 22h40M63 19v11m116-11v11m6-11v11M58 70h134m-134 24h134M68 54v56m38-56v56m38-56v56m38-56v56" opacity=".4"/><circle cx="80" cy="24" r="4"/><circle cx="161" cy="24" r="4"/><circle cx="86" cy="82" r="20"/><circle cx="86" cy="82" r="12"/><circle cx="164" cy="82" r="20"/><circle cx="164" cy="82" r="12"/><path d="M25 101V74q0-10 8-10h11m-19 37H15v10h13M210 105l14-11m-14 11v12m-9-5 9-7 6 10M50 121h152" stroke="${a}"/><path d="m112 21 4 8 4-8 4 8 4-8 4 8 4-8" stroke="${a}"/>`,
      strainer: `<path d="M33 36h131c-3 65-124 65-131 0ZM28 31h141v8H28zM164 32l62-17 3 9-62 19M49 55h99M61 70h74M71 39v43m20-43v49m20-49v48m20-48v40"/><path d="m56 17 5 7 5-7m20-9 5 16 5-16m20 9 5 7 5-7M72 105l-3 10m25-12v15m25-13 4 10" stroke="${a}"/><path d="M19 120h209" opacity=".35"/>`,
      swirl: `<path d="M33 48c0-20 33-34 78-34s78 14 78 34v24c0 22-34 38-78 38S33 94 33 72V48Zm0 0c0 22 34 38 78 38s78-16 78-38M189 50l37-12 3 9-40 15M22 111h178"/><path d="M67 49c0-14 88-14 88 2 0 18-65 19-65 5 0-9 42-10 42 0 0 6-19 8-22 1M171 45l8 9-12 4" stroke="${a}"/><path d="m51 103-4 12m128-13 5 13M61 26l-4-10m109 7 4-12" opacity=".45"/>`,
      crumble: `<path d="M39 18h112v21H39zM45 39v19l37 30v19h29V88l34-30V39M34 13h122v5H34zM81 107h32v11H81zM151 23h27v16h-27m27-8h20v44h-20M67 48l8 7 10-9 12 12 11-9 13 7"/><path d="m64 9 6-5 9 5m18 0 7-5 8 5M51 91h14v-9h13v13h13m41-3h14v10h14V86h14M49 120h117" stroke="${a}"/><path d="M196 76v32m-8-16h16m-16 9h16" opacity=".5"/>`,
      scales: `<path d="M25 77h200v34H25zM35 83h180v22H35zM54 77V61m142 16V61M49 48h152v13H49zM67 48l9-17h98l10 17M125 31V8m-9 0h18M78 118h94"/><path d="M125 78V44m-5-1h10M66 95h35m-35 5h35M164 92h35m-35 7h35" stroke="${a}"/><circle cx="125" cy="93" r="12"/><path d="m118 97 7-12 7 12M62 25l8-10m118 10-8-10M99 21h52" stroke="${a}"/>`,
      glaze: `<path d="M25 13h202v92H25zM33 21h186v76H33zM37 105v10m178-10v10M20 117h211"/><path d="M48 31h37v56H48zM103 31h49v25h-49zM170 31h31v56h-31zM103 68h49v19h-49z" opacity=".5"/><path d="M61 38h11m-11 7h11m-11 7h11m-11 7h11M66 65v9m-9-7q0 14 9 14t9-14m-9 14v6M110 38h35m-35 7h35M110 76h35m-35 6h35" stroke="${a}"/><circle cx="185" cy="43" r="6"/><circle cx="185" cy="61" r="6"/><circle cx="185" cy="79" r="6"/><path d="M85 51h12m55 0h12M91 46l6 5-6 5M158 46l6 5-6 5M6 65h9l4-11 5 26 5-31 5 24 4-8M225 65h5l3-8 4 16 4-22 4 14h7" stroke="${a}"/><path d="M40 14q6-12 12 0m22 0q6-12 12 0m22 0q6-12 12 0m22 0q6-12 12 0m22 0q6-12 12 0" opacity=".4"/>`
    };
    return `<svg viewBox="0 0 250 125" aria-hidden="true"><g fill="none" stroke="${c}" stroke-width="${compact ? 4 : 1.7}" stroke-linecap="round" stroke-linejoin="round">${drawings[def.id] || ''}</g></svg>`;
  }
  function instrumentArt(id, color) {
    const pots = {
      grain: `<path d="M19 47h133c-5 34-122 34-133 0Zm131 3 64-22 5 10-60 23M31 45q-8-15 4-22m23 22q13-16 2-27m30 26q-10-12 1-26m31 26q11-13 1-23"/><circle cx="51" cy="54" r="3"/><circle cx="89" cy="55" r="4"/><circle cx="121" cy="53" r="2"/>`,
      form: `<path d="M13 12h204v64H13zM18 68h194M26 73h5m166 0h5"/><circle cx="51" cy="39" r="20"/><circle cx="115" cy="39" r="20"/><circle cx="179" cy="39" r="20"/><circle cx="51" cy="39" r="11"/><circle cx="115" cy="39" r="11"/><circle cx="179" cy="39" r="11"/>`,
      tine: `<path d="M20 30h53v10c0 34-53 34-53 0V30zm83-9h62v11c0 36-62 36-62 0V21M7 34h13m53 0h19m-2-9h13m62 0h18M20 72h58m21-5h76"/><path d="m190 14 16 49m-5-53 15 49m-8-54 14 49m-21-32 17-6M196 77l16-14"/>`,
      mire: `<path d="M55 28h121v32c0 20-121 20-121 0V28M47 24h138M70 18h90l-8-6H78ZM55 39H24V12h25m127 30h29v25h-21M76 50q16-22 37-2t45-1M92 77h48"/><path d="m34 49-10 6-10-6m184-29 7-8 7 8"/>`,
      spool: `<path d="M9 14v61m212-61v61M9 43h212M9 70h212M16 11h25m148 0h25"/><path d="M48 40c-18-27 27-29 40-6s28 21 17 34M112 40c-16-26 28-32 42-4s28 21 17 32M18 21h10v14H18zM18 51h10v14H18zM195 21h10v14h-10zM195 51h10v14h-10z"/>`,
      haze: `<path d="M30 59h158v8H30zm13 8 5 10h123l5-10M42 52q-16-11 0-21t0-24m36 45q16-11 0-21t0-24m36 45q-16-11 0-21t0-24m36 45q16-11 0-21t0-24m36 45q-16-11 0-21t0-24"/>`,
      bower: Array.from({length:4},(_,i)=>`<path d="M10 ${15+i*17}h211M28 ${10+i*17}l20 5-10 7zm35 0 20 5-10 7zm35 0 20 5-10 7zm35 0 20 5-10 7zm35 0 20 5-10 7z"/>`).join(''),
      ravel: `<path d="M12 15h139v61H12zM22 25h119v41H22zM35 25v41m23-41v41m23-41v41m23-41v41m23-41v41M22 45h119M171 8v39h29V8m-30 6h29M174 47v28h23V47m-40 30h62"/>`,
      roux: `<ellipse cx="97" cy="37" rx="49" ry="15"/><path d="M48 37v15c0 26 98 26 98 0V37M145 45l66-12 3 8-68 16M59 64h73M111 38l22-28m-20 4 17 12M19 74h191"/><path d="m65 37 7-5 8 9 8-12 8 15 8-11 8 6m-63 41 6-10 6 10m12 0 6-10 6 10m12 0 6-10 6 10"/>`,
      batter: `<ellipse cx="81" cy="25" rx="44" ry="15"/><path d="M37 25v23c0 21 88 21 88 0V25M37 42c0 21 88 21 88 0M50 37v17m22-12v18m22-19v18m21-25v18M49 62v10m63-10v10M81 70v7M136 23l36-14 4 9-40 15M140 66l57-30 5 8-57 30M19 76h184"/><path d="M155 16l6 8M179 55l7 9M11 31h17m-9-8v16M203 16h15m-7-7v15"/>`,
      proof: `<path d="M28 9h174v66H28zM39 21h111v43H39zM44 39h100M44 57h100M57 33q13-18 26 0m14 0q13-18 26 0M57 51q13-18 26 0m14 0q13-18 26 0M161 20h29v12h-29zM28 68h174M40 75v5m147-5v5"/><circle cx="175" cy="48" r="8"/><path d="M169 62h12m-6-19v5M9 80h213"/>`,
      marinade: `<path d="M24 18h56v51H24zM32 8h40v10H32zM150 18h56v51h-56zM158 8h40v10h-40zM24 36h56m70 0h56M87 45h55m-38-12 12 12-12 12M17 75h199"/><path d="m33 54 7-5 7 11 7-17 7 14 10-4m87 3 7-11 7 15 7-20 7 14 10-5"/><circle cx="115" cy="45" r="22"/>`,
      fable: `<path d="M19 25h45v46H19zm6-11h33v11H25zm3 24h27v18H28zM86 25h45v46H86zm6-11h33v11H92zm3 24h27v18H95zM153 25h45v46h-45zm6-11h33v11h-33zm3 24h27v18h-27zM8 76h211"/><path d="M35 43h13m-10 7h7m54-7h13m-10 7h7m54-7h13m-10 7h7"/>`
    };
    return `<svg viewBox="0 0 230 82" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${pots[id] || pots.fable}</g></svg>`;
  }
  function renderTrackHeaders() { $('trackHeaders').innerHTML = state.tracks.map((t,i)=>`<div class="track-header ${i===state.selectedTrack?'selected':''}" data-track="${i}" style="--track:${escape(t.color)}"><div class="track-name-row"><span class="track-number">${String(i+1).padStart(2,'0')}</span><span class="track-name">${escape(t.name)}</span><button class="track-arm" data-arm="${i}" aria-pressed="${t.armed}" aria-label="Arm track ${i+1} for recording"><i></i></button></div><div class="track-lower-row"><button class="instrument-chip" data-instrument="${i}" title="Choose or open this track's instrument">${escape(t.instrument ? S.instrumentName(t.instrument) : '+ Load')}</button><button class="track-ms ${t.mute?'active':''}" data-mute="${i}" aria-pressed="${t.mute}" aria-label="Mute track ${i+1}">M</button><button class="track-ms ${t.solo?'active':''}" data-solo="${i}" aria-pressed="${t.solo}" aria-label="Solo track ${i+1}">S</button><span class="track-fx-dots">${t.effects.map(f=>`<i style="${f?'background:'+effectById(f.type).color:''}"></i>`).join('')}</span></div></div>`).join(''); }
  function timelineWidth() { return Math.max($('timelineScroll').clientWidth, state.lengthBars * 4 * state.view.zoom); }
  function renderArrangement() { renderTrackHeaders(); $('zoom').value = state.view.zoom; $('snap').value = state.view.snap; $('lengthBars').value = state.lengthBars; $('loopStart').value = state.loopStart / 4 + 1; $('loopEnd').value = state.loopEnd / 4 + 1; const width = timelineWidth(); $('timeline').style.width = width + 'px'; $('timeline').style.setProperty('--bar-width', state.view.zoom*4 + 'px'); $('timeline').style.setProperty('--beat-width', state.view.zoom + 'px'); $('ruler').innerHTML = Array.from({length:state.lengthBars},(_,i)=>`<span class="ruler-label" style="left:${i*4*state.view.zoom}px">${String(i+1).padStart(2,'0')}</span>`).join(''); renderMarkers(); $('loopStrip').innerHTML = state.loopEnabled ? `<div class="loop-region" style="left:${state.loopStart*state.view.zoom}px;width:${(state.loopEnd-state.loopStart)*state.view.zoom}px"></div>` : ''; if(state.recording.punchEnabled)$('loopStrip').insertAdjacentHTML('beforeend',`<div class="punch-region" style="left:${state.recording.punchStart*state.view.zoom}px;width:${(state.recording.punchEnd-state.recording.punchStart)*state.view.zoom}px"></div>`); renderLanes(); renderPlayhead(); automationEditor?.render(); }
  function renderLanes() { $('trackLanes').innerHTML = state.tracks.map((t,i)=>`<div class="track-lane ${i===state.selectedTrack?'selected':''}" data-lane="${i}" style="--track:${escape(t.color)}">${!t.clips.length?'<span class="lane-empty">IMPORT AUDIO OR RECORD A TAKE</span>':''}${t.clips.map(c=>`<div class="clip ${c.id===selectedClip?'selected':''} ${c.type==='notes'?'clip-notes':c.origin?'clip-printed':''}" data-clip="${escape(c.id)}" data-track="${i}" role="button" tabindex="0" aria-label="${escape(c.name)} on track ${i+1}, starts at beat ${c.start+1}, length ${c.length} beats. Arrow keys move; Shift arrows trim." style="left:${c.start*state.view.zoom}px;width:${Math.max(5,c.length*state.view.zoom)}px"><span class="clip-label">${c.type==='notes'?'♪ ':c.origin?'↪ ':''}${escape(c.name)}${c.reverse?' ↶':''}${c.loop?' ⟳':''}</span><canvas aria-hidden="true"></canvas><i class="clip-edge left" data-edge="left"></i><i class="clip-edge right" data-edge="right"></i></div>`).join('')}</div>`).join(''); queueWaveforms(); }
  function queueWaveforms() { if (waveformFrame) return; waveformFrame = requestAnimationFrame(() => { waveformFrame = 0; drawWaveforms(); }); }
  function drawWaveforms() { for (const el of $('trackLanes').querySelectorAll('.clip')) { const found = state.tracks[Number(el.dataset.track)].clips.find(c=>c.id===el.dataset.clip), pcm = found && assetMap[found.assetId]; if (found?.type === 'notes') { drawNotePreview(el, found); continue; } if (!found || !pcm) continue; const canvas = el.querySelector('canvas'), width = Math.max(1,Math.min(2400,Math.floor(el.clientWidth))), height = 32, dpr = Math.min(2,devicePixelRatio || 1); canvas.width = Math.min(8192,width*dpr); canvas.height = height*dpr; const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr); ctx.strokeStyle = state.tracks[Number(el.dataset.track)].color; ctx.lineWidth = 1; const duration = pcm.left.length / pcm.sampleRate, sourceSpan = Math.max(.0001,found.sourceEnd-found.sourceStart), secondsPerBeat = 60/state.tempo; ctx.beginPath(); const step = Math.max(1,Math.ceil(width/1200)); for (let x=0;x<width;x+=step) { let seconds = x/width * found.length * secondsPerBeat * found.rate; seconds += found.sourceOffset || 0; if (!found.loop && seconds >= sourceSpan) continue; seconds = found.loop ? seconds % sourceSpan : seconds; const position = found.reverse ? found.sourceEnd-seconds : found.sourceStart+seconds; const index = Math.max(0,Math.min(pcm.left.length-1,Math.floor(position*pcm.sampleRate))); const samples = Math.max(1,Math.ceil(pcm.sampleRate*found.length*secondsPerBeat*found.rate/width)); let peak = 0; for (let k=0;k<Math.min(96,samples);k++) { const n = Math.min(pcm.left.length-1,index+Math.floor(k*samples/Math.min(96,samples))); peak = Math.max(peak,Math.abs(pcm.left[n]),Math.abs(pcm.right[n])); } const fade = Math.min(1,(x/width*found.length)/Math.max(.0001,found.fadeIn),((1-x/width)*found.length)/Math.max(.0001,found.fadeOut)), amp = Math.min(1,peak*found.gain)*13*fade; ctx.moveTo(x,16-amp); ctx.lineTo(x,16+amp); } ctx.stroke(); } }
  const trackEqGain = value => Math.round(num(value, -12, 12) * 10) / 10 || 0;
  const trackEqLabel = value => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toFixed(1);
  const trackEqFrequency = value => value >= 1000 ? Number((value / 1000).toFixed(2)) + ' kHz' : Math.round(value) + ' Hz';
  function trackEqValue(key, value) {
    const control = trackEqDefinition(key); if (!control) return 0;
    value = Number.isFinite(value) ? value : control.default;
    return control.sweep ? Math.round(num(value, control.min, control.max)) : trackEqGain(value);
  }
  function trackEqRead(owner, key, beat = engine.getMeters().beat || 0) {
    const lane = owner.automation?.find(lane => lane.target === 'eq:' + key && lane.enabled !== false && lane.points?.length), manual = trackEqValue(key, owner.eq?.[key]);
    return { value: lane ? trackEqValue(key, S.automationValue(lane, beat, manual)) : manual, automated: !!lane };
  }
  function trackEqKnob(control, owner, index) {
    const value = trackEqValue(control.key, owner.eq?.[control.key]), id = `eq-${index}-${control.key}`, sweep = control.sweep;
    const center = sweep ? null : trackEqSweeps.find(definition => definition.band === control.key), frequency = center ? trackEqFrequency(trackEqValue(center.key, owner.eq?.[center.key])) : control.frequency;
    const label = sweep ? control.band === 'lowMid' ? 'low mid sweep frequency' : 'high mid sweep frequency' : control.label.toLowerCase() + ' EQ';
    const displayed = sweep ? trackEqFrequency(value) : trackEqLabel(value), units = sweep ? '' : ' dB';
    const hint = sweep ? `${control.min}–${control.max} Hz · logarithmic sweep. Drag up/down; Shift for fine adjustment. Arrows: 1 Hz; Shift or Page: 10 Hz. Home/End: limits. Double-click, Enter or Space: ${control.default} Hz.` : `${frequency} ${control.shape} · drag up/down; Shift for fine control. Arrows: 0.1 dB; Shift + arrows or Page: 1 dB. Home/End: −12/+12 dB. Double-click, Enter or Space: 0 dB.`;
    return `<div class="track-eq-control ${sweep ? 'track-eq-sweep' : ''}"><span id="${id}-label" class="track-eq-band">${sweep ? 'SWEEP' : control.label}</span><button type="button" id="${id}" class="track-eq-knob" role="slider" tabindex="0" data-eq-band="${control.key}" data-track="${index}" aria-label="Track ${index + 1} ${label}${sweep ? '' : ', ' + frequency + ' ' + control.shape}" aria-valuemin="${control.min}" aria-valuemax="${control.max}" aria-valuenow="${value}" aria-valuetext="${displayed}${units}${sweep ? '' : ', ' + frequency + ' ' + control.shape}" aria-orientation="vertical" title="${hint}"><svg class="track-eq-dial" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="track-eq-ring" d="M14.32 49.68A25 25 0 1 1 49.68 49.68"/><path class="track-eq-arc" data-eq-arc d="M32 7"/><path class="track-eq-centre-mark" d="M32 2v3"/><circle class="track-eq-cap-shadow" cx="32" cy="34" r="19"/><circle class="track-eq-cap" cx="32" cy="32" r="18"/><circle class="track-eq-cap-inner" cx="32" cy="32" r="14.5"/><path class="track-eq-pointer" data-eq-pointer d="M32 30V18"/></svg></button>${sweep ? `<label class="track-eq-exact"><input type="number" data-eq-number="${control.key}" data-track="${index}" aria-label="Track ${index + 1} exact ${label} in Hz" min="${control.min}" max="${control.max}" step="1" value="${value}"><span>Hz</span></label>` : `<output class="track-eq-value" data-eq-value="${control.key}" data-track="${index}" for="${id}">${displayed}</output><span class="track-eq-frequency" data-eq-center>${frequency}</span>`}</div>`;
  }
  function trackEqKnobs(owner, index) {
    const control = key => trackEqDefinition(key);
    return `<section class="track-eq" data-track-eq="${index}" aria-label="Track ${index + 1} four-band equalizer with sweepable mids"><div class="track-eq-heading"><span>EQ</span><button type="button" data-eq-flat="${index}" aria-label="Reset all four EQ gains on track ${index + 1}" title="Reset the four manual EQ gains to 0 dB; keep the sweep frequencies. Enabled automation continues to control the sound.">Flat</button></div><div class="track-eq-knobs">${trackEqKnob(control('low'), owner, index)}${trackEqKnob(control('high'), owner, index)}${['lowMid', 'highMid'].map(key => `<div class="track-eq-mid-pair">${trackEqKnob(control(key), owner, index)}${trackEqKnob(control(key + 'Freq'), owner, index)}</div>`).join('')}</div></section>`;
  }
  function paintTrackEqKnob(button, value, automated = false, centerFrequency) {
    if (!button) return;
    const control = trackEqDefinition(button.dataset.eqBand); if (!control) return;
    value = trackEqValue(control.key, value);
    const angle = control.sweep ? -135 + 270 * Math.log(value / control.min) / Math.log(control.max / control.min) : value * 11.25, radians = angle * Math.PI / 180;
    const sweep = trackEqSweeps.find(definition => definition.band === control.key), owner = state.tracks[Number(button.dataset.track)];
    const frequency = centerFrequency !== undefined ? trackEqFrequency(centerFrequency) : sweep && owner ? trackEqFrequency(trackEqRead(owner, sweep.key).value) : control.frequency;
    updateAttribute(button, 'aria-valuenow', value);
    updateAttribute(button, 'aria-valuetext', (control.sweep ? trackEqFrequency(value) : trackEqLabel(value) + ' dB, ' + frequency + ' ' + control.shape) + (automated ? ', automation read' : ''));
    updateAttribute(button.querySelector('[data-eq-pointer]'), 'transform', `rotate(${angle} 32 32)`);
    const arc = control.sweep ? `M14.322,49.678A25 25 0 ${angle + 135 > 180 ? 1 : 0} 1 ${(32 + 25 * Math.sin(radians)).toFixed(3)} ${(32 - 25 * Math.cos(radians)).toFixed(3)}` : value === 0 ? 'M32 7' : `M32 7A25 25 0 0 ${value > 0 ? 1 : 0} ${(32 + 25 * Math.sin(radians)).toFixed(3)} ${(32 - 25 * Math.cos(radians)).toFixed(3)}`;
    updateAttribute(button.querySelector('[data-eq-arc]'), 'd', arc);
    if (control.sweep) { const number = button.parentElement.querySelector('[data-eq-number]'); if (number && document.activeElement !== number) updateProperty(number, 'value', value); }
    else { updateText(button.parentElement.querySelector('[data-eq-value]'), trackEqLabel(value)); if (frequency) updateText(button.parentElement.querySelector('[data-eq-center]'), frequency); }
    updateClass(button, 'is-flat', value === control.default); updateClass(button, 'is-cut', !control.sweep && value < 0); updateClass(button, 'is-automated', automated);
  }
  function renderTrackEqState(meters = engine.getMeters()) {
    for (const button of $('mixer').querySelectorAll('[data-eq-band]')) {
      const owner = state.tracks[Number(button.dataset.track)], key = button.dataset.eqBand;
      if (!owner || trackEqDrag?.element === button || trackEqKeyboard?.element === button) continue;
      const reading = trackEqRead(owner, key, meters.beat || 0), sweep = trackEqSweeps.find(control => control.band === key);
      paintTrackEqKnob(button, reading.value, reading.automated, sweep ? trackEqRead(owner, sweep.key, meters.beat || 0).value : undefined);
    }
  }
  function finishTrackEqDrag(event) {
    const gesture = trackEqDrag; if (!gesture || event && event.pointerId !== gesture.pointer) return;
    trackEqDrag = null; gesture.element.classList.remove('is-adjusting');
    if (gesture.element.hasPointerCapture?.(gesture.pointer)) gesture.element.releasePointerCapture(gesture.pointer);
    renderTrackEqState();
  }
  function endTrackEqKeyboard() {
    const gesture = trackEqKeyboard; if (!gesture) return;
    trackEqKeyboard = null; gesture.element.classList.remove('is-adjusting'); renderTrackEqState();
  }
  function setTrackEqGain(owner, key, next, gesture, element, forceWrite = false) {
    if (!owner || !trackEqControls.some(control => control.key === key) || !state.tracks.includes(owner)) return false;
    next = trackEqValue(key, next);
    const writing = forceWrite && automationEditor?.write && automationEditor.trackId === owner.id && rackTarget === 'track' && track().id === owner.id && engine.getMeters().playing;
    if (trackEqValue(key, owner.eq?.[key]) === next && !writing) return false;
    if (!gesture.remembered) { remember(); gesture.remembered = true; }
    owner.eq ||= S.defaultTrackEq(); owner.eq[key] = next;
    automationEditor?.capture('eq:' + key, next, { remembered: true, ownerId: owner.id });
    changed(); paintTrackEqKnob(element, next); return true;
  }
  function renderMixer() { finishTrackEqDrag(); endTrackEqKeyboard(); $('mixer').innerHTML = state.tracks.map((t,i)=>`<div class="mixer-channel ${i===state.selectedTrack?'selected':''}" data-channel="${i}" style="--track:${escape(t.color)}"><span class="channel-number">${String(i+1).padStart(2,'0')}</span><div class="channel-name">${escape(t.name)}</div>${trackEqKnobs(t,i)}<div class="channel-pan"><label for="pan-${i}">PAN</label><input id="pan-${i}" data-mix="pan" data-track="${i}" type="range" min="-1" max="1" step="0.01" value="${t.pan}"><output>${panLabel(t.pan)}</output></div><div class="fader-wrap"><input class="channel-fader" id="level-${i}" data-mix="level" data-track="${i}" type="range" min="0" max="1.5" step="0.01" value="${t.level}" aria-label="Track ${i+1} level"><div class="channel-meter"><i id="meter-${i}"></i></div></div><output class="channel-db">${levelLabel(t.level)}</output><div class="channel-ms"><button data-mute="${i}" class="${t.mute?'active':''}" aria-pressed="${t.mute}" aria-label="Mute track ${i+1}">M</button><button data-solo="${i}" class="${t.solo?'active':''}" aria-pressed="${t.solo}" aria-label="Solo track ${i+1}">S</button><button data-arm="${i}" class="${t.armed?'active':''}" aria-pressed="${t.armed}" aria-label="Arm track ${i+1}">R</button></div><div class="channel-sends">${[0,1].map(send=>`<label><span>${send===0?'A':'B'}</span><input data-track-send="${send}" data-track="${i}" type="range" min="0" max="1" step="0.01" value="${t.sends[send]}" aria-label="Track ${i+1} send ${send===0?'A':'B'}"><output data-send-value="${send}" data-track="${i}">${Math.round(t.sends[send]*100)}%</output></label>`).join('')}</div><div class="channel-slots">${t.effects.map((f,s)=>`<button data-effect-track="${i}" data-effect-slot="${s}" title="Track ${i+1}, effect slot ${s+1}${f?': '+effectById(f.type).name:''}" style="${f?'--effect-color:'+effectById(f.type).color:''}">${f?effectById(f.type).name.slice(0,3):'+'}</button>`).join('')}</div></div>`).join(''); renderBuses(); renderSendState(); renderTrackEqState(); }
  function renderRack() { const t=track(); $('trackName').value=t.name;$('trackColor').value=t.color; $('rackTrack').textContent='TRACK '+String(state.selectedTrack+1).padStart(2,'0'); $('rack').innerHTML=t.effects.map((f,i)=>{const def=f&&effectById(f.type);return `<button class="rack-slot ${f?'':'empty'} ${rackTarget==='track'&&selectedSlot===i?'selected':''}" data-slot="${i}" style="${def?'--effect-color:'+def.color:''}"><span class="slot-index">${i+1}</span>${def?`<span class="slot-tiny-art">${effectArt(def,true)}</span><span class="slot-name"><strong>${def.name}</strong><small>${escape(def.description)}</small></span>${f.params.bypass?'<span class="slot-bypass">BYPASSED</span>':'<span class="slot-arrow">↗</span>'}`:'<span class="slot-name">Add an effect</span><span class="slot-arrow">+</span>'}</button>`;}).join(''); $('trackInstrumentName').textContent=t.instrument ? S.instrumentName(t.instrument) : 'No instrument loaded'; $('openInstrumentButton').hidden=!t.instrument; const browseLabel=t.instrument?'Replace instrument':'Choose instrument';if($('browseInstrumentButton').textContent!==browseLabel)$('browseInstrumentButton').textContent=browseLabel; $('instrumentLive').checked=t.instrumentLive; $('instrumentLive').disabled=!t.instrument; renderSendControls(); renderBuses(); }
  function renderBuses() {
    if (!$('busChannels')) return;
    $('busChannels').innerHTML = [...state.returns, state.master].map((owner, index) => {
      const master = owner.id === 'master', label = master ? 'Master' : 'Return ' + (index === 0 ? 'A' : 'B');
      const effectsMarkup = owner.effects.map((effect, slot) => {
        const def = effect && effectById(effect.type);
        return `<button class="bus-effect-slot ${rackTarget === owner.id && selectedSlot === slot ? 'selected' : ''} ${effect ? '' : 'empty'}" data-bus-effect-owner="${owner.id}" data-bus-effect-slot="${slot}" style="${def ? '--effect-color:' + def.color : ''}" aria-label="${escape(owner.name)}, insert ${slot + 1}${def ? ': ' + def.name : ': add an effect'}"><span>${slot + 1}</span><strong>${def ? def.name : 'Add effect'}</strong><small>${effect?.params.bypass ? 'Bypassed' : def ? def.subtitle : 'Empty insert'}</small><i aria-hidden="true">${def ? '&gt;' : '+'}</i></button>`;
      }).join('');
      return `<section class="bus-channel ${master ? 'master-bus' : 'return-bus'} ${rackTarget === owner.id ? 'bus-selected' : ''}" data-bus-owner="${owner.id}" aria-label="${label}"><div class="bus-channel-heading"><div><span class="eyebrow">${master ? 'FINAL STEREO CHAIN' : 'SHARED FX / ' + (index === 0 ? 'A' : 'B')}</span><button type="button" data-bus-focus="${owner.id}" class="bus-focus">${label}</button></div><div class="bus-switches"><button type="button" data-bus-toggle="mute" data-owner="${owner.id}" aria-pressed="${owner.mute}" aria-label="Mute ${label}">M</button>${master ? '' : `<button type="button" data-bus-toggle="solo" data-owner="${owner.id}" aria-pressed="${owner.solo}" aria-label="Solo ${label} wet signal">S</button>`}</div></div>${master ? '<p class="bus-route-note">Dry tracks + returns → four inserts → master level</p>' : `<label class="bus-name-label"><span>NAME</span><input data-bus-name="${owner.id}" value="${escape(owner.name)}" type="text" maxlength="80" aria-label="${label} name"></label>`}<div class="bus-live-meter"><div aria-hidden="true"><i data-bus-meter-bar="${owner.id}"></i></div><output data-bus-meter="${owner.id}">−∞ dB</output></div><div class="bus-controls"><label class="bus-level-control"><span>Level <output ${master ? 'id="masterLevelValue"' : ''} data-bus-value="level" data-owner="${owner.id}">${master ? Math.round(owner.level * 100) + '%' : levelLabel(owner.level)}</output></span><div><input ${master ? 'id="masterLevel"' : ''} data-bus-param="level" data-owner="${owner.id}" type="range" min="0" max="1.5" step="0.01" value="${owner.level}" aria-label="${label} level"><input data-bus-number="level" data-owner="${owner.id}" type="number" min="0" max="1.5" step="0.01" value="${owner.level}" aria-label="${label} exact level gain"></div></label>${master ? '' : `<label class="bus-pan-control"><span>Pan <output data-bus-value="pan" data-owner="${owner.id}">${panLabel(owner.pan)}</output></span><div><input data-bus-param="pan" data-owner="${owner.id}" type="range" min="-1" max="1" step="0.01" value="${owner.pan}" aria-label="${label} pan"><input data-bus-number="pan" data-owner="${owner.id}" type="number" min="-1" max="1" step="0.01" value="${owner.pan}" aria-label="${label} exact pan"></div></label>`}</div><div class="bus-effect-rack" aria-label="${label} four insert slots">${effectsMarkup}</div><p class="bus-route-note">${master ? 'Master inserts shape the full mix. Stems skip this chain.' : owner.effects.every(effect => !effect) ? 'This empty return passes its send signal through. Add an effect for a wet return.' : 'Send from any track. Effects share the summed signal; Solo auditions the wet return.'}</p></section>`;
    }).join('');
    renderBusMeters();
  }
  function renderSendControls() {
    const t = track(), index = state.selectedTrack;
    if (!$('trackSendsContent')) return;
    $('trackSendsContent').innerHTML = [0, 1].map(send => `<div class="track-send-control"><label for="send-detail-${send}"><span>Send ${send === 0 ? 'A' : 'B'} · ${escape(state.returns[send].name)}</span><output data-send-value="${send}" data-track="${index}">${Math.round(t.sends[send] * 100)}%</output></label><div class="track-send-values"><input id="send-detail-${send}" data-track-send="${send}" data-track="${index}" type="range" min="0" max="1" step="0.01" value="${t.sends[send]}" aria-label="Selected track send ${send === 0 ? 'A' : 'B'}"><label><input data-send-number="${send}" data-track="${index}" type="number" min="0" max="100" step="0.1" value="${Number((t.sends[send] * 100).toFixed(3))}" aria-label="Send ${send === 0 ? 'A' : 'B'} exact percentage"><span>%</span></label></div><label class="send-tap-label"><span>Take signal</span><select data-send-pre="${send}" data-track="${index}" aria-label="Send ${send === 0 ? 'A' : 'B'} signal tap"><option value="post" ${!t.sendPre[send] ? 'selected' : ''}>After track level</option><option value="pre" ${t.sendPre[send] ? 'selected' : ''}>Before track level</option></select></label></div>`).join('') + '<p class="fineprint">Both taps follow pan, mute and solo. Before level keeps the send independent of the track fader.</p>';
  }
  function renderSendState() {
    for (const input of document.querySelectorAll('[data-track-send],[data-send-number],[data-send-value]')) {
      const send = Number(input.dataset.trackSend ?? input.dataset.sendNumber ?? input.dataset.sendValue), value = state.tracks[Number(input.dataset.track)]?.sends[send];
      if (!Number.isFinite(value)) continue;
      if (input.hasAttribute('data-send-value')) updateText(input, Math.round(value * 100) + '%');
      else if (document.activeElement !== input) updateProperty(input, 'value', input.hasAttribute('data-send-number') ? Number((value * 100).toFixed(3)) : value);
    }
  }
  function renderBusControlState() {
    for (const input of $('busChannels').querySelectorAll('[data-bus-param],[data-bus-number],[data-bus-value]')) {
      const owner = S.automationOwner(state, input.dataset.owner), key = input.dataset.busParam || input.dataset.busNumber || input.dataset.busValue;
      if (!owner) continue;
      if (input.hasAttribute('data-bus-value')) updateText(input, key === 'pan' ? panLabel(owner.pan) : owner.id === 'master' ? Math.round(owner.level * 100) + '%' : levelLabel(owner.level));
      else if (document.activeElement !== input) updateProperty(input, 'value', owner[key]);
    }
  }
  function renderBusMeters(meters = engine.getMeters()) {
    if (!$('busChannels')) return;
    for (const output of $('busChannels').querySelectorAll('[data-bus-meter]')) {
      const id = output.dataset.busMeter, index = state.returns.findIndex(owner => owner.id === id), reading = id === 'master' ? meters.master : meters.returns?.[index];
      const value = Math.max(reading?.rmsL || reading?.rmsLeft || 0, reading?.rmsR || reading?.rmsRight || 0, reading?.rms || 0);
      updateText(output, value > .00001 ? (20 * Math.log10(value)).toFixed(1) + ' dB' : '−∞ dB');
      const bar = $('busChannels').querySelector('[data-bus-meter-bar="' + id + '"]'); if (bar) updateStyle(bar, 'width', Math.min(100, Math.sqrt(value) * 135) + '%');
    }
  }
  function controlMarkup(key,label,value,options={}) { const attrs = options.min !== undefined ? `min="${options.min}" max="${options.max}" step="${options.step||.001}"` : ''; if (options.type==='checkbox') return `<div class="control check-control"><label><input data-clip-param="${key}" type="checkbox" ${value?'checked':''}>${label}</label></div>`; return `<div class="control"><label for="clip-${key}">${label}</label><input id="clip-${key}" data-clip-param="${key}" type="${options.type||'number'}" ${attrs} value="${escape(value)}" ${options.maxlength?'maxlength="'+options.maxlength+'"':''}></div>`; }
  function renderClipInspector() {
    const location = clipLocation(); renderClipActions(); $('clipInspector').hidden = !location;
    if (!location) { $('selectionSummary').textContent = 'Choose a clip to edit it, or load an instrument into a track.'; noteWorkflow?.render(); return; }
    const c = location.clip, notes = c.type === 'notes', asset = assetMap[c.assetId], duration = asset ? asset.left.length / asset.sampleRate : 120;
    $('selectionSummary').textContent = c.name + ' · ' + location.track.name + ' · ' + c.length.toFixed(2) + ' beats' + (notes ? ' · editable notes' : c.origin ? ' · source retained' : '');
    $('clipControls').innerHTML = controlMarkup('name','CLIP NAME',c.name,{type:'text',maxlength:80}) + controlMarkup('start','START (BEAT)',c.start+1,{min:1,max:state.lengthBars*4,step:.001}) + controlMarkup('length','LENGTH (BEATS)',c.length,{min:.015625,max:state.lengthBars*4,step:.001}) +
      (notes ? controlMarkup('sourceOffset','PATTERN OFFSET (BEATS)',c.sourceOffset,{min:0,max:c.pattern.lengthBeats,step:.0625}) + controlMarkup('transpose','TRANSPOSE (SEMITONES)',c.transpose,{min:-48,max:48,step:1}) : controlMarkup('sourceStart','SOURCE IN (SEC)',c.sourceStart,{min:0,max:duration,step:.001}) + controlMarkup('sourceEnd','SOURCE OUT (SEC)',c.sourceEnd,{min:0,max:duration,step:.001})) +
      controlMarkup('rate',notes?'TIME RATE':'SPEED / PITCH',c.rate,{min:.125,max:8,step:.01}) + (notes ? '' : controlMarkup('gain','CLIP LEVEL',c.gain,{min:0,max:2,step:.01}) + controlMarkup('fadeIn','FADE IN (BEATS)',c.fadeIn,{min:0,max:c.length/2,step:.01}) + controlMarkup('fadeOut','FADE OUT (BEATS)',c.fadeOut,{min:0,max:c.length/2,step:.01}) + controlMarkup('reverse','Reverse',c.reverse,{type:'checkbox'})) + controlMarkup('loop',notes?'Loop pattern':'Loop source',c.loop,{type:'checkbox'});
    $('clipInspector').querySelector('.fineprint').textContent = notes ? 'Time rate changes note timing; Transpose changes pitch. Use note velocities and the track mixer for dynamics. Print audio for clip level and fades.' : 'Drag a clip to move it. Pull either edge to trim. Rate changes audio speed and pitch. Overlapping clips are mixed together.';
    noteWorkflow?.render();
  }
  function effectControl(p, params) {
    if(p.type==='select')return `<div class="control"><label for="fx-${p.key}">${escape(p.label)}</label><select id="fx-${p.key}" data-effect-param="${p.key}">${p.options.map(o=>`<option value="${escape(o.value)}" ${o.value===params[p.key]?'selected':''}>${escape(o.label)}</option>`).join('')}</select></div>`;
    return `<div class="control"><label for="fx-${p.key}">${escape(p.label)}<output>${formatParam(p,params[p.key])}</output></label>${effectRange(p,params[p.key])}</div>`;
  }
  function compressorControl(param, params) {
    if (!param) return '';
    const value = params[param.key] ?? param.default;
    if (param.type === 'select') return `<div class="control compressor-control"><label for="fx-${param.key}">${escape(param.label)}</label><select id="fx-${param.key}" data-effect-param="${param.key}">${param.options.map(option => `<option value="${escape(option.value)}" ${option.value === value ? 'selected' : ''}>${escape(option.label)}</option>`).join('')}</select></div>`;
    const logarithmic = param.min > 0 && ['attack', 'release'].includes(param.key);
    const range = logarithmic ? `<input id="fx-${param.key}" data-effect-param="${param.key}" data-log="true" type="range" min="0" max="1" step="0.001" value="${Math.log(value / param.min) / Math.log(param.max / param.min)}">` : effectRange(param, value);
    return `<div class="control compressor-control"><label for="fx-${param.key}"><span>${escape(param.label)}</span><output>${formatParam(param, value)}</output></label><div class="compressor-value-row">${range}<input id="fx-number-${param.key}" data-compressor-number="${param.key}" type="number" min="${param.min}" max="${param.max}" step="${param.step}" value="${Number(value.toFixed(4))}" aria-label="${escape(param.label)} exact value${param.unit ? ' in ' + escape(param.unit) : ''}"></div></div>`;
  }
  function compressorControls(def, params) {
    const descriptors = new Map(effectParams(def).map(param => [param.key, param]));
    const controls = keys => keys.map(key => compressorControl(descriptors.get(key), params)).join('');
    const core = ['model', 'input', 'threshold', 'ratio', 'attack', 'release', 'makeup', 'mix'];
    const multibandKeys = window.LoomButterMultibandUI?.keys || [];
    const advanced = effectParams(def).filter(param => !core.includes(param.key) && !multibandKeys.includes(param.key)).map(param => param.key);
    return `<div class="compressor-console"><div class="compressor-recipe-bar"><label for="compressorPreset"><span class="eyebrow">COMPRESSOR RECIPE</span><select id="compressorPreset"><option value="">Custom settings</option>${(def.presets || []).map(preset => `<option value="${escape(preset.id)}">${escape(preset.name)}</option>`).join('')}</select></label><p id="compressorPresetDescription">A recipe replaces every compressor setting. Changing the model keeps your adjustments.</p></div>
      <section class="compressor-face" aria-labelledby="compressorFaceTitle"><div class="compressor-face-heading"><div><span id="compressorFaceTitle" class="compressor-face-brand">Butter</span><span class="compressor-face-edition">STEREO DYNAMICS</span></div><span class="compressor-signal-light"><i aria-hidden="true"></i><span id="compressorSignalStatus">Signal ready</span></span></div>
      <div class="compressor-model-row">${controls(['model'])}<div class="compressor-model-note"><strong id="compressorModelInspiration"></strong><p id="compressorModelDescription"></p></div></div>
      <div class="compressor-classic-row"><button id="compressorClassicSettings" type="button">Use classic settings</button><p>Set this model’s suggested ratio, timing and character. Keep your threshold and gain staging.</p></div>
      <div class="compressor-readings" aria-label="Live compressor readings">${[['inputDb', 'Input'], ['reductionDb', 'Gain reduction'], ['outputDb', 'Output']].map(([key, label]) => `<div class="compressor-meter ${key === 'reductionDb' ? 'compressor-gr' : ''}"><span>${label}</span><output data-compressor-meter="${key}">—</output><div class="compressor-meter-track" aria-hidden="true"><i data-compressor-meter-bar="${key}"></i></div>${key === 'reductionDb' ? '<small>0 <span>12</span> 24 dB</small>' : '<small>−60 <span>−30</span> 0 dB</small>'}</div>`).join('')}</div>
      <div class="compressor-core-controls">${controls(core.filter(key => key !== 'model'))}</div><p id="compressorTimingHint" class="compressor-timing-hint"></p></section>
      ${window.LoomButterMultibandUI?.render(def, params) || ''}<details id="compressorAdvanced" class="compressor-advanced" ${compressorAdvancedOpen ? 'open' : ''}><summary><span><strong>Advanced</strong><small>Detector, timing, colour & stereo behaviour</small></span><span aria-hidden="true">＋</span></summary><div class="compressor-advanced-content"><div class="compressor-advanced-controls">${controls(advanced)}</div><p id="compressorSpecialHint"></p><p class="compressor-model-disclosure">Musical models inspired by classic circuit families. These are reduced-order interpretations, not measured replicas of individual units.</p></div></details></div>`;
  }
  function renderCompressorState() {
    const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type);
    if (def?.id !== 'velvet' || !$('compressorFaceTitle')) return;
    const params = slot.params, model = def.models?.find(model => model.id === params.model), clean = params.model === 'clean', classic = !clean && params.timing === 'classic';
    const recipe = def.presets?.find(preset => effectParams(def).every(param => params[param.key] === preset.params[param.key]) && params.bypass === preset.params.bypass);
    updateProperty($('compressorPreset'), 'value', recipe?.id || '');
    updateText($('compressorPresetDescription'), recipe?.description || 'A recipe replaces every compressor setting. Changing the model keeps your adjustments.');
    updateText($('compressorModelInspiration'), model?.inspiration || (clean ? 'The original BUTTER compressor' : model?.name || 'Stereo compressor'));
    updateText($('compressorModelDescription'), model?.description || 'Smooth peaks with a stereo-linked detector and a soft knee.');
    const timing = clean ? 'Original manual timing. Attack and release stay active; analogue colour and special modes are inactive.' : classic ? 'Classic timing. ' + (model?.timingDescription || 'This model follows its own programme-dependent time constants.') + ' Manual attack and release are kept for when you switch back.' : 'Manual timing. Attack and release set the base response; this model keeps its own detector and envelope character.';
    updateText($('compressorTimingHint'), timing);
    updateText($('compressorSpecialHint'), clean ? 'Clean preserves the original BUTTER sound. Stereo link and input trim remain available.' : params.model === 'fet-76' ? 'All-buttons adds the FET family’s more aggressive gain behaviour. Thrust applies only to Bus 2500.' : params.model === 'bus-2500' ? 'Thrust changes the Bus 2500 detector weighting. All-buttons applies only to Seventy-six.' : 'All-buttons applies to Seventy-six. Thrust applies to Bus 2500. Their settings stay here while you use another model.');
    updateAttribute($('compressorClassicSettings'), 'title', 'Use ' + (model?.name || 'this model') + ' recommended ratio, timing and character settings');
    updateText($('compressorSignalStatus'), params.bypass ? 'Bypassed' : 'Stereo active');
    updateClass($('compressorFaceTitle').closest('.compressor-face'), 'compressor-is-bypassed', params.bypass);
    for (const param of effectParams(def)) {
      const input = $('fx-' + param.key), value = params[param.key] ?? param.default;
      if (!input) continue;
      const control = input.closest('.control'), exact = control?.querySelector('[data-compressor-number]');
      if (document.activeElement !== input) updateProperty(input, 'value', input.dataset.log === 'true' ? Math.log(value / param.min) / Math.log(param.max / param.min) : value);
      if (param.type === 'range') {
        updateText(control.querySelector('output'), formatParam(param, value));
        if (exact && document.activeElement !== exact) updateProperty(exact, 'value', Number(value.toFixed(4)));
      }
      const disabled = classic && ['attack', 'release'].includes(param.key) || clean && ['colour', 'timing'].includes(param.key) || param.key === 'fetMode' && params.model !== 'fet-76' || param.key === 'thrust' && params.model !== 'bus-2500';
      input.disabled = disabled; if (exact) exact.disabled = disabled;
      if (control) updateClass(control, 'compressor-control-inactive', disabled);
      if (['attack', 'release', 'timing'].includes(param.key)) updateAttribute(input, 'aria-describedby', 'compressorTimingHint');
      if (['colour', 'fetMode', 'thrust'].includes(param.key)) updateAttribute(input, 'aria-describedby', 'compressorSpecialHint');
    }
    renderCompressorMeters();
  }
  function renderCompressorMeters(meters = engine.getMeters()) {
    const slot = effectOwner().effects[selectedSlot]; if (slot?.type !== 'velvet' || $('effectEditor').hidden || !$('compressorFaceTitle')) return;
    const reading = effectReading(meters), valid = reading?.type === 'velvet' && !reading.bypass;
    for (const output of $('effectEditor').querySelectorAll('[data-compressor-meter]')) {
      const key = output.dataset.compressorMeter, value = reading?.[key], available = valid && Number.isFinite(value), reduction = key === 'reductionDb';
      updateText(output, available ? !reduction && value <= -90 ? '−∞ dB' : (reduction ? Math.max(0, value) : value).toFixed(1) + ' dB' : '—');
      const fraction = !available ? 0 : reduction ? Math.min(1, Math.max(0, value) / 24) : Math.min(1, Math.max(0, (value + 60) / 60));
      const bar = $('effectEditor').querySelector('[data-compressor-meter-bar="' + key + '"]'); if (bar) updateStyle(bar, 'width', (fraction * 100).toFixed(2) + '%');
    }
    window.LoomButterMultibandUI?.update($('effectEditor'), slot.params, valid ? reading : null);
  }
  function preampValue(param, value) {
    if (param.key === 'lowCut' && value === 0 || param.key === 'highCut' && value === 22000) return 'Off';
    if (['colour', 'transformer', 'feedback', 'slew', 'mix'].includes(param.key)) return Math.round(value * 100) + '%';
    if (param.key === 'impedance') return Math.round(value).toLocaleString('en-US') + ' Ω';
    return formatParam(param, value);
  }
  function preampControl(param, params) {
    if (!param) return '';
    const value = params[param.key] ?? param.default;
    if (param.type === 'select') return `<div class="control preamp-control"><label for="fx-${param.key}">${escape(param.label)}</label><select id="fx-${param.key}" data-effect-param="${param.key}">${param.options.map(option => `<option value="${escape(option.value)}" ${option.value === value ? 'selected' : ''}>${escape(option.label)}</option>`).join('')}</select></div>`;
    const range = param.key === 'impedance' ? `<input id="fx-${param.key}" data-effect-param="${param.key}" data-log="true" type="range" min="0" max="1" step="0.001" value="${Math.log(value / param.min) / Math.log(param.max / param.min)}">` : effectRange(param, value);
    return `<div class="control preamp-control"><label for="fx-${param.key}"><span>${escape(param.label)}</span><output>${preampValue(param, value)}</output></label><div class="preamp-value-row">${range}<input id="fx-number-${param.key}" data-preamp-number="${param.key}" type="number" min="${param.min}" max="${param.max}" step="${param.step}" value="${Number(value.toFixed(4))}" aria-label="${escape(param.label)} exact value${param.unit ? ' in ' + escape(param.unit) : ''}"></div></div>`;
  }
  function preampControls(def, params) {
    const descriptors = new Map(effectParams(def).map(param => [param.key, param]));
    const controls = keys => keys.map(key => preampControl(descriptors.get(key), params)).join('');
    const groups = [
      { id: 'input', domId: 'preampInputDetails', title: 'Input & polarity', subtitle: 'Pad, polarity & virtual microphone loading', keys: ['pad', 'polarity', 'impedance'], help: 'Pad attenuates the digital signal before Input gain. Polarity reverses the wet signal; a partial Dry / wet blend can cancel. Virtual impedance adjusts the modeled loading response; it does not change your interface or microphone hardware.' },
      { id: 'circuit', domId: 'preampAdvanced', title: 'Circuit workshop', subtitle: 'Iron, headroom, harmonics & transient response', keys: ['transformer', 'headroom', 'bias', 'feedback', 'slew'], help: 'Explore the model’s circuit character. Transformer adjusts core memory; Headroom moves the saturation threshold; Bias changes harmonic asymmetry. Feedback favors linearity, and Slew sets transient restraint.' },
      { id: 'tone', domId: 'preampToneDetails', title: 'Tone', subtitle: 'Cleanup filters & broad shelving EQ', keys: ['lowCut', 'highCut', 'lowFreq', 'lowGain', 'highFreq', 'highGain'], help: 'Low cut at 0 Hz and High cut at 22 kHz are off. The shelves are additional tone controls, independent of the selected preamp’s inherent response.' }
    ];
    return `<div class="preamp-console"><div class="preamp-recipe-bar"><label for="preampPreset"><span class="eyebrow">COMPLETE PREAMP RECIPE</span><select id="preampPreset"><option value="">Custom settings</option>${(def.presets || []).map(preset => `<option value="${escape(preset.id)}">${escape(preset.name)}</option>`).join('')}</select></label><p id="preampPresetDescription">A recipe replaces every setting. Choosing a model keeps your adjustments.</p></div>
      <section class="preamp-face" aria-labelledby="preampFaceTitle"><div class="preamp-face-heading"><div><span id="preampFaceTitle" class="preamp-face-brand">Sauté</span><span class="preamp-face-edition">MICROPHONE PREAMPLIFIER</span></div><span class="preamp-signal-light"><i aria-hidden="true"></i><span id="preampSignalStatus">Stereo active</span></span></div>
      <div class="preamp-model-row">${controls(['model'])}<div class="preamp-model-note"><strong id="preampModelInspiration"></strong><p id="preampModelDescription"></p></div></div>
      <div class="preamp-circuit-row"><button id="preampCircuitSettings" type="button">Use circuit starting point</button><p>Load this model’s suggested circuit settings. Keep your gain staging, tone and blend.</p></div>
      <div class="preamp-readings" aria-label="Live preamp levels">${[['inputDb', 'Input'], ['stageDb', 'Stage in'], ['outputDb', 'Output']].map(([key, label]) => `<div class="preamp-meter ${key === 'stageDb' ? 'preamp-stage-meter' : ''}" ${key === 'stageDb' ? 'title="Level into the modeled circuit, including pad, input and drive; before headroom normalization. Above 0 dB indicates virtual drive, not interface clipping."' : ''}><span>${label}</span><output data-preamp-meter="${key}">—</output><div class="preamp-meter-track" aria-hidden="true"><i data-preamp-meter-bar="${key}"></i></div><small>−60 <span>${key === 'stageDb' ? '−18' : '−30'}</span> ${key === 'stageDb' ? '+24' : '0'} dB</small></div>`).join('')}</div>
      <div class="preamp-core-controls">${controls(['input', 'drive', 'output', 'colour', 'mix', 'compensate'])}</div><p id="preampGainHint" class="preamp-gain-hint"></p></section>
      <div class="preamp-details-list">${groups.map(group => `<details id="${group.domId}" class="preamp-details" data-preamp-details="${group.id}" ${preampDetailsOpen.has(group.id) ? 'open' : ''}><summary><span><strong>${group.title}</strong><small>${group.subtitle}</small></span><span aria-hidden="true">+</span></summary><div class="preamp-details-content"><p id="preamp-${group.id}-hint">${group.help}</p><div class="preamp-detail-controls">${controls(group.keys)}</div>${group.id === 'circuit' ? '<p id="preampCircuitHint" class="preamp-circuit-hint"></p>' : ''}</div></details>`).join('')}</div>
      <p class="preamp-disclosure">Circuit interpretations inspired by familiar preamps. These are reduced-order models, not measured replicas of individual units. Microphone recordings stay dry; the insert processes monitoring and playback.</p></div>`;
  }
  function renderPreampState() {
    const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type);
    if (def?.id !== 'saute' || !$('preampFaceTitle')) return;
    const params = slot.params, clean = params.model === 'clean', model = def.models?.find(model => model.id === params.model);
    const recipe = def.presets?.find(preset => effectParams(def).every(param => params[param.key] === preset.params[param.key]) && params.bypass === preset.params.bypass);
    updateProperty($('preampPreset'), 'value', recipe?.id || '');
    updateText($('preampPresetDescription'), recipe?.description || 'A recipe replaces every setting. Choosing a model keeps your adjustments.');
    updateText($('preampModelInspiration'), model?.inspiration || model?.name || 'Stereo microphone preamp');
    updateText($('preampModelDescription'), model?.description || 'Shape your source with modeled gain stages, iron and harmonic colour.');
    updateText($('preampGainHint'), params.compensate === 'on' ? 'Drive compensation is on: extra Drive gain is removed after the circuit. Input, Pad and Output keep their level changes. This is nominal gain compensation, not loudness matching.' : 'Drive compensation is off: Drive adds gain as well as character. Use Output to set the level leaving the preamp.');
    const inactiveCircuitHint = model?.inactiveControls?.includes('transformer') ? ' This model is transformerless; Transformer core is inactive. Its saved value is kept for other models.' : '';
    updateText($('preampCircuitHint'), clean ? 'Clean skips the modeled colour, loading and circuit controls. Gain, pad, polarity, tone and blend still work; your circuit settings are kept for another model.' : 'Colour blends this circuit with the gain-staged clean signal. At 0%, circuit and virtual loading changes are inaudible; tone and gain controls still apply.' + inactiveCircuitHint);
    updateProperty($('preampCircuitSettings'), 'disabled', clean);
    updateAttribute($('preampCircuitSettings'), 'title', clean ? 'Clean has no modeled circuit to adjust' : 'Load ' + (model?.name || 'this model') + ' circuit settings; keep gain, tone and blend');
    updateText($('preampSignalStatus'), params.bypass ? 'Bypassed' : 'Stereo active');
    updateClass($('preampFaceTitle').closest('.preamp-face'), 'preamp-is-bypassed', params.bypass);
    for (const param of effectParams(def)) {
      const input = $('fx-' + param.key), value = params[param.key] ?? param.default;
      if (!input) continue;
      const control = input.closest('.control'), exact = control?.querySelector('[data-preamp-number]');
      if (document.activeElement !== input) updateProperty(input, 'value', input.dataset.log === 'true' ? Math.log(value / param.min) / Math.log(param.max / param.min) : value);
      if (param.type === 'range') {
        updateText(control.querySelector('output'), preampValue(param, value));
        if (exact && document.activeElement !== exact) updateProperty(exact, 'value', Number(value.toFixed(4)));
      }
      const disabled = clean && ['colour', 'impedance', 'transformer', 'headroom', 'bias', 'feedback', 'slew'].includes(param.key) || model?.inactiveControls?.includes(param.key) === true;
      input.disabled = disabled; if (exact) exact.disabled = disabled;
      updateClass(control, 'preamp-control-inactive', disabled);
      if (['input', 'drive', 'output', 'compensate'].includes(param.key)) updateAttribute(input, 'aria-describedby', 'preampGainHint');
      if (['impedance', 'pad', 'polarity'].includes(param.key)) updateAttribute(input, 'aria-describedby', 'preamp-input-hint');
      if (['colour', 'transformer', 'headroom', 'bias', 'feedback', 'slew'].includes(param.key)) { updateAttribute(input, 'aria-describedby', 'preampCircuitHint'); if (exact) updateAttribute(exact, 'aria-describedby', 'preampCircuitHint'); }
    }
    renderPreampMeters();
  }
  function renderPreampMeters(meters = engine.getMeters()) {
    const slot = effectOwner().effects[selectedSlot]; if (slot?.type !== 'saute' || $('effectEditor').hidden || !$('preampFaceTitle')) return;
    const reading = effectReading(meters), valid = reading?.type === 'saute' && !reading.bypass;
    for (const output of $('effectEditor').querySelectorAll('[data-preamp-meter]')) {
      const key = output.dataset.preampMeter, value = reading?.[key], available = valid && Number.isFinite(value), ceiling = key === 'stageDb' ? 24 : 0;
      updateText(output, available ? value <= -90 ? '−∞ dB' : (value > 0 ? '+' : '') + value.toFixed(1) + ' dB' : '—');
      const fraction = available ? Math.min(1, Math.max(0, (value + 60) / (60 + ceiling))) : 0;
      const bar = $('effectEditor').querySelector('[data-preamp-meter-bar="' + key + '"]'); if (bar) updateStyle(bar, 'width', (fraction * 100).toFixed(2) + '%');
    }
  }
  const tapePercentKeys = new Set(['warmth', 'wear', 'headBump', 'noise', 'dropouts', 'stereoLink', 'mix', 'bias', 'azimuth', 'crosstalk']);
  function tapeValue(param, value) {
    if (['wow', 'flutter'].includes(param.key)) return Number(value.toFixed(param.key === 'flutter' ? 3 : 2)) + '%';
    if (tapePercentKeys.has(param.key)) return (value > 0 && ['bias', 'azimuth'].includes(param.key) ? '+' : '') + Number((value * 100).toFixed(param.key === 'crosstalk' ? 1 : 0)) + '%';
    return formatParam(param, value);
  }
  function tapeNumberScale(param) { return tapePercentKeys.has(param.key) ? 100 : 1; }
  function tapeControl(param, params, rotary = false) {
    if (!param) return '';
    const value = params[param.key] ?? param.default;
    if (param.type === 'select') return `<div class="control tape-control"><label for="fx-${param.key}">${escape(param.label)}</label><select id="fx-${param.key}" data-effect-param="${param.key}">${param.options.map(option => `<option value="${escape(option.value)}" ${option.value === value ? 'selected' : ''}>${escape(option.label)}</option>`).join('')}</select></div>`;
    const scale = tapeNumberScale(param), unit = scale === 100 || ['wow', 'flutter'].includes(param.key) ? '%' : param.unit || '';
    const exact = `<input id="fx-number-${param.key}" data-tape-number="${param.key}" data-tape-scale="${scale}" type="number" min="${Number((param.min * scale).toFixed(6))}" max="${Number((param.max * scale).toFixed(6))}" step="${Number((param.step * scale).toFixed(6))}" value="${Number((value * scale).toFixed(4))}" aria-label="${escape(param.label)} exact value${unit ? ' in ' + escape(unit) : ''}">`;
    if (!rotary) return `<div class="control tape-control"><label for="fx-${param.key}"><span>${escape(param.label)}</span><output>${tapeValue(param, value)}</output></label><div class="tape-value-row">${effectRange(param, value)}${exact}</div></div>`;
    const angle = -135 + 270 * (value - param.min) / (param.max - param.min);
    return `<div class="control tape-control tape-knob-control"><label for="fx-${param.key}">${escape(param.label)}</label><button type="button" id="fx-${param.key}" class="tape-knob" role="slider" data-tape-knob="${param.key}" aria-label="${escape(param.label)}" aria-valuemin="${param.min}" aria-valuemax="${param.max}" aria-valuenow="${value}" aria-valuetext="${escape(tapeValue(param, value))}" aria-orientation="vertical" title="Drag up or down; hold Shift for fine control. Arrow keys adjust, Page keys make larger changes. Home/End select the minimum/maximum. Double-click, Enter or Space restores the starting value."><svg viewBox="0 0 76 76" aria-hidden="true" focusable="false"><path class="tape-knob-track" d="M14.67 61.33A33 33 0 1 1 61.33 61.33"/><path class="tape-knob-zero" d="M38 1v3"/><circle class="tape-knob-shadow" cx="38" cy="40" r="26"/><circle class="tape-knob-cap" cx="38" cy="38" r="25"/><circle class="tape-knob-inner" cx="38" cy="38" r="20"/><path class="tape-knob-pointer" data-tape-pointer d="M38 34V20" transform="rotate(${angle} 38 38)"/></svg></button><output class="sr-only">${tapeValue(param, value)}</output><div class="tape-knob-number">${exact}<span aria-hidden="true">${escape(unit)}</span></div></div>`;
  }
  function tapeReels() {
    const reel = (x, size) => `<g transform="translate(${x} 43)"><circle class="tape-reel-rim" r="35"/><circle class="tape-reel-tape" r="${size}"/><circle class="tape-reel-face" r="25"/><path class="tape-reel-spokes" d="M0-10v-8M8.66 5l6.93 4M-8.66 5l-6.93 4"/><circle class="tape-reel-hub" r="7"/></g>`;
    return `<div class="tape-reels" aria-hidden="true"><svg viewBox="0 0 226 105" focusable="false"><path class="tape-path" d="M31 60 55 89h116l24-29"/>${reel(57, 29)}${reel(169, 32)}<path class="tape-path" d="M58 87 77 94h72l20-7"/><circle class="tape-guide" cx="77" cy="91" r="4"/><circle class="tape-guide" cx="149" cy="91" r="4"/><rect class="tape-guide" x="105" y="88" width="16" height="9" rx="2"/></svg><div class="tape-reel-caption"><span>SUPPLY / 01</span><span>TAKE-UP / 02</span></div></div>`;
  }
  function tapeControls(def, params) {
    const descriptors = new Map(effectParams(def).map(param => [param.key, param]));
    const selectors = ['model', 'speed', 'formula'].filter(key => descriptors.has(key)), core = ['drive', 'warmth', 'wear', 'output', 'mix'].filter(key => descriptors.has(key));
    const used = new Set([...selectors, ...core]), groups = [];
    for (const group of def.groups || []) {
      if (group.section === 'main') continue;
      const keys = group.keys.filter(key => descriptors.has(key) && !used.has(key));
      if (!keys.length) continue;
      for (const key of keys) used.add(key);
      groups.push({ ...group, keys });
    }
    const remaining = effectParams(def).map(param => param.key).filter(key => !used.has(key));
    if (remaining.length) groups.push({ id: 'additional', label: 'Additional controls', help: 'Fine-tune the tape path.', keys: remaining });
    const mainHelp = def.groups?.find(group => group.section === 'main')?.help || 'Choose a machine, then add Drive, Warmth and Wear to taste.';
    const readings = [{ key: 'inputDb', label: 'Input' }, { key: 'tapeDb', label: 'Record in' }, { key: 'outputDb', label: 'Output' }];
    return `<div class="tape-console"><div class="tape-recipe-bar"><label for="tapePreset"><span class="eyebrow">HOUSE RECIPES / COMPLETE TAPE SETUP</span><select id="tapePreset"><option value="">Custom settings</option>${(def.presets || []).map(preset => `<option value="${escape(preset.id)}">${escape(preset.name)}</option>`).join('')}</select></label><p id="tapePresetDescription">A house recipe replaces the complete tape setup. Machine, speed and stock choices keep your knob settings.</p></div>
      <section class="tape-face" aria-labelledby="tapeFaceTitle"><div class="tape-face-heading"><div><span id="tapeFaceTitle" class="tape-face-brand">Preserve</span><span class="tape-face-edition">STEREO TAPE MACHINE</span></div><span class="tape-signal-light"><i aria-hidden="true"></i><span id="tapeSignalStatus">Ready</span></span></div>
      <div class="tape-selectors">${selectors.map(key => tapeControl(descriptors.get(key), params)).join('')}</div>
      <div class="tape-deck-display">${tapeReels()}<div class="tape-readings" aria-label="Measured tape levels">${readings.map(meter => `<div class="tape-meter ${meter.key === 'tapeDb' ? 'tape-meter-drive' : ''}" ${meter.key === 'tapeDb' ? 'title="Driven recording-stage level before magnetic softening; this is virtual tape drive, not interface clipping."' : ''}><span>${meter.label}</span><output data-tape-meter="${meter.key}">—</output><div class="tape-meter-track" aria-hidden="true"><i data-tape-meter-bar="${meter.key}"></i></div><small>−60 <span>−18</span> ${meter.key === 'tapeDb' ? '+24' : '0'} dB</small></div>`).join('')}</div></div>
      <div class="tape-model-note"><strong id="tapeModelName"></strong><p id="tapeModelDescription"></p></div>
      <div class="tape-core-controls">${core.map(key => tapeControl(descriptors.get(key), params, true)).join('')}</div><p id="tapeGainHint" class="tape-gain-hint"></p><p id="tapeMotionHint" class="tape-gain-hint" hidden>Wow/flutter move the whole blend; zero motion keeps timing unchanged.</p>
      <div class="tape-status-strip" aria-label="Measured tape behavior"><span>Softening <output data-tape-meter="compressionDb">—</output></span><span>Transport <output data-tape-meter="transportMs">—</output></span></div></section>
      <div class="tape-details-list">${groups.map(group => `<details id="tape-${escape(group.id)}-details" class="tape-details" data-tape-details="${escape(group.id)}" ${tapeDetailsOpen.has(group.id) ? 'open' : ''}><summary><span><strong>${escape(group.label)}</strong><small>${group.id === 'calibration' ? 'Gain staging, bias & playback tone' : group.id === 'transport' ? 'Slow wander, fast flutter & oxide loss' : group.id === 'stereo' ? 'Hiss, head alignment & channel character' : 'Fine adjustments'}</small></span><span aria-hidden="true">+</span></summary><div class="tape-details-content"><p id="tape-${escape(group.id)}-hint">${escape(group.help || '')}</p><div class="tape-detail-controls">${group.keys.map(key => tapeControl(descriptors.get(key), params)).join('')}</div></div></details>`).join('')}</div>
      <p class="tape-disclosure">${escape(mainHelp)} New tape starts with a steady transport and no added hiss or dropouts. The machine characters are musical interpretations of tape behavior.</p></div>`;
  }
  function paintTapeKnob(element, param, value) {
    if (!element || !Number.isFinite(value)) return;
    updateAttribute(element, 'aria-valuenow', value); updateAttribute(element, 'aria-valuetext', tapeValue(param, value));
    updateAttribute(element.querySelector('[data-tape-pointer]'), 'transform', `rotate(${-135 + 270 * (value - param.min) / (param.max - param.min)} 38 38)`);
  }
  function renderTapeState() {
    const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type);
    if (def?.id !== 'preserve' || !$('tapeFaceTitle')) return;
    const params = slot.params, model = def.models?.find(model => model.id === params.model);
    const recipe = def.presets?.find(preset => effectParams(def).every(param => params[param.key] === (preset.params[param.key] ?? def.defaults[param.key])) && params.bypass === (preset.params.bypass ?? false));
    updateProperty($('tapePreset'), 'value', recipe?.id || '');
    updateText($('tapePresetDescription'), recipe?.description || 'Custom tape setup. Machine, speed and stock choices keep your knob settings; a house recipe replaces every setting.');
    updateText($('tapeModelName'), model?.name || 'Stereo tape machine');
    updateText($('tapeModelDescription'), model?.description || 'Shape the recording level, magnetic softening and oxide age.');
    updateText($('tapeGainHint'), params.autoGain === 'on' ? 'Drive gain is compensated; tape softening can still change loudness. Match the listening level with Output.' : 'Drive adds recording gain and colour. Use Output to set the level leaving the tape path.');
    updateProperty($('tapeMotionHint'), 'hidden', !(params.wow > 0 || params.flutter > 0));
    updateClass($('tapeFaceTitle').closest('.tape-face'), 'tape-is-bypassed', params.bypass);
    for (const param of effectParams(def)) {
      const input = $('fx-' + param.key), value = params[param.key] ?? param.default;
      if (!input) continue;
      const control = input.closest('.control'), exact = control?.querySelector('[data-tape-number]');
      if (input.hasAttribute('data-tape-knob')) paintTapeKnob(input, param, value);
      else if (document.activeElement !== input) updateProperty(input, 'value', input.dataset.log === 'true' ? Math.log(value / param.min) / Math.log(param.max / param.min) : value);
      if (param.type === 'range') {
        updateText(control.querySelector('output'), tapeValue(param, value));
        if (exact && document.activeElement !== exact) updateProperty(exact, 'value', Number((value * tapeNumberScale(param)).toFixed(4)));
      }
      if (['drive', 'output', 'autoGain'].includes(param.key)) updateAttribute(input, 'aria-describedby', 'tapeGainHint');
      const group = def.groups?.find(group => group.section !== 'main' && group.keys.includes(param.key));
      if (group) { updateAttribute(input, 'aria-describedby', 'tape-' + group.id + '-hint'); if (exact) updateAttribute(exact, 'aria-describedby', 'tape-' + group.id + '-hint'); }
    }
    renderTapeMeters();
  }
  function renderTapeMeters(meters = engine.getMeters()) {
    const slot = effectOwner().effects[selectedSlot]; if (slot?.type !== 'preserve' || $('effectEditor').hidden || !$('tapeFaceTitle')) return;
    const reading = effectReading(meters), valid = reading?.type === 'preserve' && !reading.bypass && !slot.params.bypass;
    const signal = valid && Number.isFinite(reading.inputDb) && reading.inputDb > -85;
    updateText($('tapeSignalStatus'), slot.params.bypass ? 'Bypassed' : signal ? 'Signal present' : 'Ready');
    updateClass($('tapeFaceTitle').closest('.tape-face'), 'tape-has-signal', signal);
    for (const output of $('effectEditor').querySelectorAll('[data-tape-meter]')) {
      const key = output.dataset.tapeMeter, value = reading?.[key], available = valid && Number.isFinite(value), compression = key === 'compressionDb', transport = key === 'transportMs';
      updateText(output, !available ? '—' : transport ? Math.max(0, value).toFixed(2) + ' ms' : compression ? Math.max(0, value).toFixed(1) + ' dB' : value <= -90 ? '−∞ dB' : (value > 0 ? '+' : '') + value.toFixed(1) + ' dB');
      const bar = $('effectEditor').querySelector('[data-tape-meter-bar="' + key + '"]');
      if (bar) { const ceiling = key === 'tapeDb' ? 24 : 0; updateStyle(bar, 'width', (available ? Math.min(1, Math.max(0, (value + 60) / (60 + ceiling))) * 100 : 0).toFixed(2) + '%'); }
    }
  }
  function finishTapeDrag(event) {
    const gesture = tapeDrag; if (!gesture || event && event.pointerId !== gesture.pointer) return;
    tapeDrag = null; gesture.element.classList.remove('is-adjusting');
    if (gesture.element.hasPointerCapture?.(gesture.pointer)) gesture.element.releasePointerCapture(gesture.pointer);
  }
  function finishTapeKeyboard() { if (tapeKeyboard) tapeKeyboard.element.classList.remove('is-adjusting'); tapeKeyboard = null; }
  function tapeGesture(element) {
    const owner = effectOwner(), slot = owner.effects[selectedSlot], param = slot?.type === 'preserve' && effectParams(effectById(slot.type)).find(param => param.key === element.dataset.tapeKnob);
    return param ? { element, owner, slot, index: selectedSlot, param, remembered: false, lifecycle } : null;
  }
  function setTapeKnob(gesture, value) {
    if (!gesture || gesture.lifecycle !== lifecycle || S.automationOwner(state, gesture.owner.id) !== gesture.owner || gesture.owner.effects[gesture.index] !== gesture.slot || gesture.slot.type !== 'preserve') return false;
    const param = gesture.param, next = Math.max(param.min, Math.min(param.max, Number((Math.round(value / param.step) * param.step).toFixed(6))));
    if (!Number.isFinite(next) || gesture.slot.params[param.key] === next) return false;
    if (!gesture.remembered) { remember(); gesture.remembered = true; }
    gesture.slot.params[param.key] = next;
    automationEditor?.capture('fx:' + gesture.index + ':' + param.key, next, { remembered: true, ownerId: gesture.owner.id });
    changed(); renderTapeState(); return true;
  }
  function broilerParam(def, key) { return effectParams(def).find(param => param.key === key); }
  function broilerValue(param, value) {
    if (/^pedal[1-4](Drive|Tone|Mix)$/.test(param.key)) return Math.round(value * 100) + '%';
    return formatParam(param, value);
  }
  function broilerControl(param, params, label = param?.label) {
    if (!param) return '';
    const value = params[param.key] ?? param.default;
    if (param.type === 'select') return `<div class="control broiler-control"><label for="fx-${param.key}"><span class="broiler-param-name">${escape(label)}</span></label><select id="fx-${param.key}" data-effect-param="${param.key}">${param.options.map(option => `<option value="${escape(option.value)}" ${option.value === value ? 'selected' : ''}>${escape(option.label)}</option>`).join('')}</select></div>`;
    return `<div class="control broiler-control"><label for="fx-${param.key}"><span class="broiler-param-name">${escape(label)}</span><output>${broilerValue(param, value)}</output></label><div class="broiler-value-row">${effectRange(param, value)}<input id="fx-number-${param.key}" data-broiler-number="${param.key}" type="number" min="${param.min}" max="${param.max}" step="${param.step}" value="${escape(Number(value.toFixed(4)))}" aria-label="${escape(label)} exact value"></div></div>`;
  }
  function broilerControls(def, params) {
    const controls = keys => keys.map(key => broilerControl(broilerParam(def, key), params)).join('');
    const essentials = ['model', 'ampEnable', 'drive', 'bass', 'mid', 'treble', 'presence', 'master', 'input', 'output', 'cabinet', 'mix'];
    const covered = new Set(essentials), workshop = [];
    for (const group of def.groups || []) {
      const keys = group.keys.filter(key => !covered.has(key) && !/^pedal[1-4]/.test(key));
      keys.forEach(key => covered.add(key));
      if (keys.length) workshop.push({ ...group, keys });
    }
    const remaining = effectParams(def).filter(param => !covered.has(param.key) && !/^pedal[1-4]/.test(param.key)).map(param => param.key);
    if (remaining.length) workshop.push({ label: 'More amplifier controls', keys: remaining });
    const pedals = Array.from({ length: 4 }, (_, offset) => {
      const number = offset + 1, prefix = 'pedal' + number, type = broilerParam(def, prefix + 'Type');
      if (!type) return '';
      return `<article class="broiler-pedal" data-broiler-pedal="${number}"><div class="broiler-pedal-top"><span class="broiler-pedal-number">${String(number).padStart(2, '0')}</span><button type="button" id="fx-${prefix}Enabled" data-effect-param="${prefix}Enabled" data-broiler-pedal-toggle="${number}" class="broiler-footswitch" aria-pressed="${params[prefix + 'Enabled'] === 'on'}"><i aria-hidden="true"></i><span>Bypass</span></button></div>${broilerControl(type, params, 'Pedal ' + number)}<p id="broilerPedalState${number}" class="broiler-pedal-state"></p>${broilerControl(broilerParam(def, prefix + 'Route'), params, 'Position')}<div class="broiler-pedal-actions"><button type="button" data-broiler-pedal-action="left" data-pedal-slot="${number}" ${number === 1 ? 'disabled' : ''} aria-label="Move pedal ${number} earlier">←</button><button type="button" data-broiler-pedal-action="right" data-pedal-slot="${number}" ${number === 4 ? 'disabled' : ''} aria-label="Move pedal ${number} later">→</button><button type="button" data-broiler-pedal-action="clear" data-pedal-slot="${number}" aria-label="Remove pedal ${number}">Clear</button></div><details data-broiler-details="pedal${number}" ${broilerDetailsOpen.has('pedal' + number) ? 'open' : ''}><summary>Adjust sound <span aria-hidden="true">＋</span></summary><div class="broiler-pedal-detail"><p id="broilerPedalDescription${number}"></p><div class="broiler-pedal-controls">${['Drive', 'Tone', 'Level', 'Mix'].map(suffix => broilerControl(broilerParam(def, prefix + suffix), params)).join('')}</div></div></details></article>`;
    }).join('');
    const enable = broilerParam(def, 'ampEnable');
    return `<div class="broiler-rig"><div class="broiler-recipe-bar"><label for="broilerPreset"><span class="eyebrow">COMPLETE RIG RECIPE</span><select id="broilerPreset"><option value="">Custom rig</option>${def.presets.map(preset => `<option value="${escape(preset.id)}">${escape(preset.name)}</option>`).join('')}</select></label><p id="broilerPresetDescription">A recipe replaces the amplifier, cabinet and all four pedals.</p></div>
      <section class="broiler-head" aria-labelledby="broilerHeadTitle"><div class="broiler-face-heading"><div><span class="broiler-face-brand" id="broilerHeadTitle">Broiler</span><span class="broiler-face-edition">AMPLIFIER / NO. 01</span></div>${enable ? `<button type="button" id="fx-ampEnable" data-effect-param="ampEnable" data-broiler-amp-toggle class="broiler-power" aria-pressed="${params.ampEnable !== 'off'}"><i aria-hidden="true"></i><span>Head on</span></button>` : ''}</div><div class="broiler-model-row">${controls(['model'])}<div class="broiler-model-note"><strong id="broilerAmpInspiration"></strong><p id="broilerAmpDescription"></p></div></div><div class="broiler-face-controls">${controls(['drive', 'bass', 'mid', 'treble', 'presence', 'master', 'input', 'output'])}</div><div class="broiler-cab-row">${controls(['cabinet'])}<button id="broilerMatchedCab" type="button">Match cabinet to amp</button>${controls(['mix'])}</div><p id="broilerCabinetStatus" class="broiler-cabinet-status"></p><div class="broiler-readings" aria-label="Live amplifier readings"><span>LIVE SIGNAL</span>${[['inputDb', 'Input'], ['outputDb', 'Output'], ['reductionDb', 'Power sag']].map(([key, label]) => `<div><span>${label}</span><output data-broiler-meter="${key}">—</output></div>`).join('')}</div></section>
      <section class="broiler-board" aria-labelledby="broilerPedalboardTitle"><div class="broiler-section-heading"><div><span class="eyebrow">FOUR PLACES / ONE SIGNAL PATH</span><h3 id="broilerPedalboardTitle">The pedalboard.</h3></div><span>Before amp → amplifier → cabinet → after cabinet</span></div><div class="broiler-pedalboard">${pedals}</div><p class="broiler-board-hint">Pedals play in slot order within each position. Move a pedal to change that order. Bypass keeps its settings.</p></section>
      <details id="broilerWorkshop" class="broiler-workshop" data-broiler-details="workshop" ${broilerDetailsOpen.has('workshop') ? 'open' : ''}><summary><span><strong>Workshop</strong><small>Valves, tone circuits, power supply & microphone</small></span><span aria-hidden="true">＋</span></summary><div class="broiler-workshop-content">${workshop.map(group => `<fieldset class="broiler-workshop-group" data-broiler-group="${escape(group.id || group.label)}"><legend>${escape(group.label)}</legend>${group.help ? `<p>${escape(group.help)}</p>` : ''}<div class="broiler-workshop-controls">${controls(group.keys)}</div></fieldset>`).join('')}<div class="broiler-rig-files"><div><strong>Keep this rig.</strong><p>Save the head, cabinet and pedalboard for another session.</p></div><div><button id="broilerSaveRig" type="button">Save rig</button><button id="broilerLoadRig" type="button">Load rig</button><input id="broilerRigFile" type="file" accept=".json,application/json" hidden></div></div><p class="broiler-workshop-note">Modelled circuit behaviour and familiar inspirations. These are musical approximations, not measured replicas of specific amplifiers or pedals.</p></div></details></div>`;
  }
  function broilerPedalAction(number, action) {
    const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type);
    if (def?.id !== 'broiler') return;
    const next = number + (action === 'left' ? -1 : 1);
    if (action !== 'clear' && (next < 1 || next > 4)) return;
    const prefix = 'pedal' + number, keys = effectParams(def).filter(param => param.key.startsWith(prefix)).map(param => param.key), targetPrefix = 'fx:' + selectedSlot + ':';
    if (!keys.length) return;
    remember();
    if (action === 'clear') {
      for (const key of keys) slot.params[key] = def.defaults[key];
      effectOwner().automation = effectOwner().automation.filter(lane => !lane.target.startsWith(targetPrefix + prefix));
    } else {
      const other = 'pedal' + next;
      for (const key of keys) { const otherKey = other + key.slice(prefix.length); [slot.params[key], slot.params[otherKey]] = [slot.params[otherKey], slot.params[key]]; }
      const remap = target => target.replace(new RegExp('^(fx:' + selectedSlot + ':)pedal(' + number + '|' + next + ')([A-Z])'), (_, base, index, suffix) => base + 'pedal' + (Number(index) === number ? next : number) + suffix);
      for (const lane of effectOwner().automation) lane.target = remap(lane.target);
      if (automationEditor) automationEditor.target = remap(automationEditor.target);
    }
    changed({ automation: true }); renderEffectEditor();
    const focusedNumber = action === 'clear' ? number : next;
    const actionButton = $('effectEditor').querySelector('[data-broiler-pedal="' + focusedNumber + '"] [data-broiler-pedal-action="' + action + '"]');
    (actionButton && !actionButton.disabled ? actionButton : $('fx-pedal' + focusedNumber + 'Type'))?.focus({ preventScroll: true });
    status(action === 'clear' ? 'Pedal ' + number + ' removed. Undo restores its sound and automation.' : 'Pedal moved to slot ' + next + '. Settings and automation travel with it.');
  }
  function saveBroilerRig() {
    const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type); if (def?.id !== 'broiler') return;
    const model = def.ampModels?.find(model => model.id === slot.params.model), name = (model?.name || 'My Broiler') + ' rig';
    const rig = { format: 'broiler-rig', version: 1, name, params: clone(slot.params) };
    const filename = 'broiler-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.json';
    download(new Blob([JSON.stringify(rig, null, 2)], { type: 'application/json' }), filename);
    status(name + ' saved. Load it into any BROILER insert.');
  }
  async function loadBroilerRig(file, input) {
    if (!file) return;
    const target = effectOwner().effects[selectedSlot], def = target && effectById(target.type), trackId = effectOwner().id, slotIndex = selectedSlot, generation = lifecycle;
    if (def?.id !== 'broiler') return;
    try {
      if (file.size > 128 * 1024) throw Error('Choose a BROILER rig file smaller than 128 KB.');
      const rig = JSON.parse(await file.text());
      if (!rig || typeof rig !== 'object' || Array.isArray(rig) || rig.format !== 'broiler-rig' || rig.version !== 1 || typeof rig.name !== 'string' || !rig.name.trim() || rig.name.length > 80 || /[\u0000-\u001f\u007f]/.test(rig.name) || Object.keys(rig).some(key => !['format', 'version', 'name', 'params'].includes(key))) throw Error('Choose a valid BROILER rig file.');
      const keys = new Set([...effectParams(def).map(param => param.key), 'bypass']);
      if (!rig.params || typeof rig.params !== 'object' || Array.isArray(rig.params) || Object.keys(rig.params).length !== keys.size || Object.keys(rig.params).some(key => !keys.has(key))) throw Error('The rig must contain the complete BROILER settings.');
      const validated = S.effect({ type: 'broiler', params: rig.params }, true);
      for (const param of effectParams(def)) if (param.type === 'range' && (rig.params[param.key] < param.min || rig.params[param.key] > param.max)) throw Error(param.label + ' is outside this rig’s supported range.');
      if (generation !== lifecycle || effectOwner().id !== trackId || selectedSlot !== slotIndex || effectOwner().effects[slotIndex] !== target) { status('The selected insert changed. Choose BROILER and load the rig again.'); return; }
      remember(); target.params = validated.params; changed({ rack: true, mixer: true }); renderEffectEditor(); $('broilerLoadRig')?.focus({ preventScroll: true });
      status(rig.name + ' loaded into this insert. Undo restores your previous rig.');
    } catch (error) { status(error instanceof SyntaxError ? 'That file is not valid BROILER rig JSON.' : error.message); }
    finally { input.value = ''; }
  }
  function vocalStageHelp(g) {
    if (!g.help) return '';
    return `<details class="vocal-stage-help" data-vocal-help="${escape(g.id)}" ${vocalHelpOpen.has(g.id) ? 'open' : ''}><summary aria-label="How it works: ${escape(g.shortLabel)}"><span>How it works</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m4 2 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></summary><div class="vocal-help-content"><p><strong>Use it for</strong> ${escape(g.help.use)}</p><dl>${g.help.controls.map(([name, description]) => `<dt>${escape(name)}</dt><dd>${escape(description)}</dd>`).join('')}</dl></div></details>`;
  }
  function vocalControlGroups(def, params) {
    const advanced = vocalEditorView === 'advanced';
    return def.groups.map(g => {
      const enabled = !g.enableKey || params[g.enableKey] !== 'off', compact = !advanced && g.optional && !enabled;
      let keys = advanced ? g.keys : (g.basicKeys || []);
      if (compact) keys = [];
      else if (!advanced && g.id === 'pitch') keys = params.pitch === 'correct' ? ['key','scale','speed','pitchWindow'] : ['semitones','pitchWindow','pitchMix'];
      else if (!advanced && g.id === 'harmony' && params.pitch === 'off') keys = ['harmonyA','harmonyB','harmonyMix','pitchWindow'];
      else if (!advanced && g.id === 'robot') keys = params.robot === 'ring' ? ['robotFreq','robotMix'] : ['carrierNote','carrierChord','robotMix'];
      else if (!advanced && g.id === 'delay') keys = ['delayClock',params.delayClock === 'free' ? 'delayTime' : 'delayDivision','delayFeedback','delayMix'];
      const mode = g.enableKey && effectParams(def).find(p => p.key === g.enableKey);
      const descriptionId = 'vocal-stage-description-' + g.id;
      return `<fieldset class="vocal-control-group ${compact ? 'vocal-compact' : ''}" data-vocal-group="${escape(g.id)}"><legend><span>${escape(g.label)}</span>${mode ? `<select id="fx-${mode.key}" data-effect-param="${mode.key}" class="vocal-stage-mode ${mode.options.length > 2 ? 'vocal-mode-wide' : ''}" aria-label="${escape(g.label)} mode" aria-describedby="${escape(descriptionId)}">${mode.options.map(o => `<option value="${escape(o.value)}" ${o.value === params[mode.key] ? 'selected' : ''}>${escape(o.label)}</option>`).join('')}</select>` : ''}</legend><p id="${escape(descriptionId)}" class="vocal-group-note">${escape(g.description || '')}</p>${vocalStageHelp(g)}${compact ? '<span class="vocal-compact-note">Switch on to show its controls.</span>' : `<div class="effect-controls">${keys.map(key => effectParams(def).find(p => p.key === key)).filter(Boolean).map(p => effectControl(p, params).replace(' data-effect-param=', ' aria-describedby="' + escape(descriptionId) + '" data-effect-param=')).join('')}</div>`}</fieldset>`;
    }).join('');
  }
  function vocalControls(def, params) {
    const meterLabels = [['inputDb','Input'],['outputDb','Output'],['reductionDb','Compression'],['deessDb','De-essing'],['limiterReductionDb','Peak guard'],['gateReductionDb','Gate reduction'],['pitchLatencyMs','Pitch wet window'],['detectedHz','Detected note']];
    return `<div class="vocal-recipe-bar"><label for="vocalPreset"><span class="eyebrow">HOUSE RECIPES / ONE VOICE, SEVERAL ALIBIS</span><select id="vocalPreset"><option value="">Custom settings</option>${def.presets.map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('')}</select></label><p id="vocalPresetDescription">Start with a recipe. Keep the useful; season the peculiar.</p></div><div class="vocal-meter-grid" aria-label="Live vocal processing"><span class="vocal-meter-caption">LIVE READINGS / SELECTED INSERT</span>${meterLabels.map(([key,label])=>`<div><span>${label}</span><output data-vocal-meter="${key}">—</output></div>`).join('')}</div><div class="vocal-view-bar"><div class="vocal-view-buttons" role="group" aria-label="Vocal control detail"><button data-vocal-view="basic" aria-pressed="${vocalEditorView === 'basic'}">Essentials</button><button data-vocal-view="advanced" aria-pressed="${vocalEditorView === 'advanced'}">Full pantry</button></div><span>${vocalEditorView === 'basic' ? 'Start with the essentials. Switch on a station to open its controls.' : 'Every threshold, envelope, harmony, and seasoning.'}</span></div><div class="vocal-control-groups">${vocalControlGroups(def, params)}</div>`;
  }
  function utilityNoteName(note) {
    const notes = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    return notes[((Math.round(note) % 12) + 12) % 12] + (Math.floor(Math.round(note) / 12) - 1);
  }
  function utilityControls(def, params) {
    const ticks = Array.from({ length: 21 }, (_, i) => {
      const angle = (i - 10) * 6.5 * Math.PI / 180, major = i % 5 === 0, outer = 130, inner = major ? 111 : 119;
      const x = radius => 160 + Math.sin(angle) * radius, y = radius => 158 - Math.cos(angle) * radius;
      return `<line x1="${x(inner)}" y1="${y(inner)}" x2="${x(outer)}" y2="${y(outer)}" class="${major ? 'major' : ''}"/>${major ? `<text x="${x(96)}" y="${y(96) + 4}" text-anchor="middle">${i === 10 ? '0' : (i > 10 ? '+' : '−') + Math.abs(i - 10) * 5}</text>` : ''}`;
    }).join('');
    const stereo = ['Left', 'Right'].map(side => `<div class="utility-channel"><div class="utility-channel-heading"><span>${side.toUpperCase()} OUTPUT</span><output data-utility-meter="peak${side}Db">—</output><output class="utility-clip" data-utility-meter="clip${side}" aria-label="${side} clipping">CLEAR</output></div><div class="utility-level-bar" role="meter" aria-label="${side} output peak" aria-valuemin="-60" aria-valuemax="6" aria-valuenow="-60" data-utility-level="${side}"><i></i><b></b></div><div class="utility-channel-detail"><span>RMS <output data-utility-meter="rms${side}Db">—</output></span><span>HOLD <output data-utility-meter="hold${side}Db">—</output></span></div></div>`).join('');
    const readings = [['inputDb', 'Input sample peak'], ['outputDb', 'Output sample peak'], ['crestDb', 'Output crest'], ['dcLeft', 'Left DC offset'], ['dcRight', 'Right DC offset']];
    return `<div class="utility-recipe-bar"><label for="utilityPreset"><span class="eyebrow">HOUSE RECIPES / MEASURE TWICE</span><select id="utilityPreset"><option value="">Custom settings</option>${def.presets.map(recipe => `<option value="${escape(recipe.id)}">${escape(recipe.name)}</option>`).join('')}</select></label><p id="utilityPresetDescription"></p></div>
      <section id="utilityTuner" class="utility-tuner" aria-labelledby="utilityTunerTitle"><div class="utility-station-heading"><div><span class="eyebrow">CALIBRATION / BEFORE THE RECIPE</span><h3 id="utilityTunerTitle">A little more precise.</h3></div><button id="utilityInputShortcut" ${rackTarget!=='track'?'hidden':''}>Input → SCALES</button></div><div class="utility-tuner-body"><div class="utility-dial"><svg viewBox="0 0 320 180" aria-hidden="true"><path class="utility-dial-face" d="M23 162a137 137 0 0 1 274 0Z"/><path class="utility-in-tune-arc" d="M153.2 28.2a130 130 0 0 1 13.6 0"/><g class="utility-dial-ticks">${ticks}</g><text x="38" y="167" class="utility-dial-direction">FLAT</text><text x="254" y="167" class="utility-dial-direction">SHARP</text><g id="utilityNeedle" transform="rotate(0 160 158)"><path d="m157 153 3-106 3 106Z"/><circle cx="160" cy="158" r="8"/></g></svg><div class="utility-note"><output id="utilityNote">—</output><output id="utilityOctave"></output><span>NOTE / OCTAVE</span></div></div><div class="utility-tuner-readings"><div class="utility-cents"><output id="utilityCents">—</output><span>CENTS FROM TARGET</span></div><div class="utility-frequency-pair"><div><span>MEASURED</span><output id="utilityHz">— Hz</output></div><div><span>TARGET</span><output id="utilityTargetHz">— Hz</output></div></div><div class="utility-confidence"><span>CONFIDENCE <output id="utilityConfidence">—</output></span><div><i id="utilityConfidenceBar"></i></div></div><p id="utilityTunerStatus" role="status">Play one clear note.</p></div></div><div id="utilityGuideButtons" class="utility-guide-buttons" role="group" aria-label="Tuner target notes"></div><p class="utility-tuner-hint">The tuner listens before this insert’s processing. Put SCALES before distortion for a clearer reading. Pluck one string and mute the others; this is a monophonic tuner.</p></section>
      <section class="utility-meter-station" aria-labelledby="utilityMeterTitle"><div class="utility-station-heading"><div><span class="eyebrow">ON THE BENCH / dBFS</span><h3 id="utilityMeterTitle">The portions, presently.</h3></div><button id="utilityResetMeters">Reset peak holds & clips</button></div><div class="utility-stereo-meters">${stereo}</div><div class="utility-meter-scale" aria-hidden="true"><span>−60</span><span>−36</span><span>−18</span><span>−6</span><span>0</span><span>+6</span></div><div class="utility-correlation"><div><span>STEREO CORRELATION</span><output data-utility-meter="correlation">—</output></div><div class="utility-correlation-bar"><i id="utilityCorrelationMarker"></i></div><div class="utility-correlation-labels"><span>−1 / opposing</span><span>0 / unrelated</span><span>+1 / aligned</span></div></div><div class="utility-reading-grid">${readings.map(([key, label]) => `<div><span>${label}</span><output data-utility-meter="${key}">—</output></div>`).join('')}</div><p class="utility-meter-hint">Output sample peaks and RMS are measured after Dry / wet, guard, and mute. Peak holds and clip flags stay until reset. Negative correlation can signal cancellation when summed to mono; crest is peak above RMS.</p></section>
      <div class="utility-control-groups">${def.groups.map(g => `<fieldset class="utility-control-group" data-utility-group="${g.id}"><legend>${escape(g.label)}</legend><p id="utility-description-${g.id}">${escape(g.description)}</p><div class="effect-controls">${g.keys.map(key => effectParams(def).find(p => p.key === key)).filter(Boolean).map(p => effectControl(p, params).replace(' data-effect-param=', ' aria-describedby="utility-description-' + g.id + '" data-effect-param=')).join('')}</div></fieldset>`).join('')}</div>`;
  }
  const isCreativeEffect = def => !!def && (def.panel === 'creative' || ['strainer', 'swirl', 'crumble'].includes(def.id));
  function creativeMeterDescriptors(def) {
    if (Array.isArray(def.meters)) return def.meters;
    return def.id === 'strainer' ? [{ key: 'cutoffLHz', label: 'Left cutoff', unit: 'Hz' }, { key: 'cutoffRHz', label: 'Right cutoff', unit: 'Hz' }, { key: 'envelopeDb', label: 'Follower', unit: 'dB' }, { key: 'outputDb', label: 'Output', unit: 'dB' }] : [{ key: 'inputDb', label: 'Input', unit: 'dB' }, { key: 'outputDb', label: 'Output', unit: 'dB' }];
  }
  function creativeControls(def, params) {
    const groups = def.groups || [{ label: 'Sound controls', keys: effectParams(def).map(p => p.key) }];
    const grouped = new Set(groups.flatMap(group => group.keys));
    const remaining = effectParams(def).filter(p => !grouped.has(p.key));
    const complete = remaining.length ? [...groups, { label: 'Output & blend', keys: remaining.map(p => p.key) }] : groups;
    return `<div class="creative-recipe-bar"><label for="creativePreset"><span class="eyebrow">HOUSE RECIPES / ${escape(def.name)}</span><select id="creativePreset" aria-label="${escape(def.name)} recipe"><option value="">Custom settings</option>${(def.presets || []).map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('')}</select></label><p id="creativePresetDescription"></p></div>
      <section class="creative-readings" aria-label="Live ${escape(def.name)} readings"><div class="creative-reading-heading"><span class="eyebrow">ON THE PASS / LIVE READINGS</span><span id="creativeMeterStatus">Play or monitor audio to see movement.</span></div><div class="creative-meter-grid">${creativeMeterDescriptors(def).map(meter => `<div><span>${escape(meter.label)}</span><output data-effect-meter="${escape(meter.key)}">—</output></div>`).join('')}</div></section>
      <p id="creativeModelHint" class="creative-model-hint"></p>
      <div class="creative-control-groups">${complete.map((group, index) => `<fieldset class="creative-control-group" data-creative-group="${index}"><legend>${escape(group.label)}</legend>${group.help || group.description ? `<p id="creative-group-help-${index}">${escape(group.help || group.description)}</p>` : ''}<div class="effect-controls">${group.keys.map(key => effectParams(def).find(p => p.key === key)).filter(Boolean).map(p => effectControl(p, params).replace(' data-effect-param=', (group.help || group.description ? ' aria-describedby="creative-group-help-' + index + '"' : '') + ' data-effect-param=')).join('')}</div></fieldset>`).join('')}</div>`;
  }
  function renderCreativeState() {
    const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type);
    if (!isCreativeEffect(def) || !$('creativePreset')) return;
    const p = slot.params;
    const preset = (def.presets || []).find(recipe => Object.keys(recipe.params).every(key => recipe.params[key] === p[key]));
    $('creativePreset').value = preset?.id || '';
    $('creativePresetDescription').textContent = preset?.description || (def.id === 'crumble' ? 'Custom settings. Change the clock and bit depth, then recover the useful attacks.' : 'Custom settings. Follow the input, move with the beat, or hold a sound still.');
    $('effectEditor').querySelector('.effect-toolbar>span').textContent = p.bypass ? 'BYPASSED / ORIGINAL AUDIO' : def.id === 'strainer' ? 'FILTER / FOLLOWER / MOTION' : def.id === 'swirl' ? 'PHASE / FOLLOWER / MOTION' : 'CLOCK / GRAINS / COLOUR';
    const clock = p.clock ?? p.lfoClock;
    for (const key of ['rate', 'lfoRate']) if ($('fx-' + key)) $('fx-' + key).disabled = clock === 'sync';
    for (const key of ['division', 'lfoDivision']) if ($('fx-' + key)) $('fx-' + key).disabled = clock === 'free';
    const comb = def.id === 'strainer' && p.model === 'comb';
    const hint = def.id === 'strainer' ? comb ? 'Comb resonance adds tuned, damped reflections. Cutoff tunes the reflections and the selected filter; mode and slope stay active.' : 'Cutoff is the starting point. The envelope follows this track’s input; positive depth opens the filter, negative depth closes it.' : def.id === 'swirl' ? 'Phasing mixes the original with moving all-pass stages. Feedback sharpens the notches; the follower adds motion from the input.' : 'Lower clock rates deliberately introduce aliasing. Bits set quantization; tone rounds the edges after reduction.';
    $('creativeModelHint').textContent = hint;
    renderCreativeMeters();
  }
  function renderCreativeMeters(meters = engine.getMeters()) {
    const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type);
    if (!isCreativeEffect(def) || $('effectEditor').hidden || !$('creativeMeterStatus')) return;
    const reading = effectReading(meters);
    const valid = reading?.type === def.id && !reading.bypass && !slot.params.bypass;
    updateText($('creativeMeterStatus'), slot.params.bypass ? 'Bypassed · original audio passes through.' : valid ? 'Measured in the audio engine.' : 'Play or monitor audio to see movement.');
    for (const descriptor of creativeMeterDescriptors(def)) {
      const output = $('effectEditor').querySelector('[data-effect-meter="' + descriptor.key + '"]');
      if (!output) continue;
      const value = reading?.[descriptor.key]; let text = '—';
      if (valid && Number.isFinite(value)) {
        if (descriptor.unit === 'Hz' || /Hz$/.test(descriptor.key)) text = value >= 1000 ? (value / 1000).toFixed(2) + ' kHz' : value.toFixed(1) + ' Hz';
        else if (descriptor.unit === 'dB' || /Db$/.test(descriptor.key)) text = value <= -100 ? '−∞ dB' : value.toFixed(1) + ' dB';
        else if (descriptor.unit === '%') text = Math.round(value * 100) + '%';
        else text = Number(value.toFixed(2)) + (descriptor.unit ? ' ' + descriptor.unit : '');
      }
      updateText(output, text);
    }
  }
  function revealEffectEditor() {
    const editor = $('effectEditor'), reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (editor.classList.contains('creative-editor')) {
      const transport = document.querySelector('.transport'), style = transport && getComputedStyle(transport);
      const sticky = style && ['sticky', 'fixed'].includes(style.position);
      const clearance = sticky ? transport.getBoundingClientRect().height + Math.max(0, parseFloat(style.top) || 0) + 16 : 16;
      editor.style.setProperty('--creative-scroll-offset', clearance + 'px');
      editor.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    } else editor.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest' });
  }
  function renderEffectEditor() {
    finishTapeDrag(); finishTapeKeyboard();
    const slot=selectedSlot!==null&&effectOwner().effects[selectedSlot], editor=$('effectEditor');editor.hidden=!slot;if(!slot)return;
    const def=effectById(slot.type),amp=def.id==='broiler',compressor=def.id==='velvet',preamp=def.id==='saute',tape=def.id==='preserve',vocal=def.id==='glaze',utility=def.id==='scales',creative=isCreativeEffect(def);editor.classList.toggle('amp-editor',amp);editor.classList.toggle('compressor-editor',compressor);editor.classList.toggle('preamp-editor',preamp);editor.classList.toggle('tape-editor',tape);editor.classList.toggle('vocal-editor',vocal);editor.classList.toggle('utility-editor',utility);editor.classList.toggle('creative-editor',creative);editor.dataset.effect=def.id;editor.style.setProperty('--effect-color',def.color);
    const controls=amp?broilerControls(def,slot.params):compressor?compressorControls(def,slot.params):preamp?preampControls(def,slot.params):tape?tapeControls(def,slot.params):vocal?vocalControls(def,slot.params):utility?utilityControls(def,slot.params):creative?creativeControls(def,slot.params):`<div class="effect-controls">${effectParams(def).map(p=>effectControl(p,slot.params)).join('')}${def.id==='cinder'?'<p id="charCircuitHint" class="fineprint char-circuit-note"></p>':''}</div>`;
    const route=amp?'<div class="amp-signal-route">PEDALS BEFORE AMP<br>↓<br>PREAMP → TONE → POWER<br>↳ CLEAN LOWS → CABINET → MIC<br>↓<br>PEDALS AFTER CABINET → OUT</div>':preamp?'<div class="preamp-signal-route">PAD → INPUT → DRIVE<br>↓<br>MODELED CIRCUIT → COLOUR<br>↓<br>TONE → OUTPUT → BLEND</div>':tape?'<div class="tape-signal-route">INPUT → RECORD STAGE<br>↓<br>TAPE → PLAYBACK HEAD<br>↓<br>OUTPUT → BLEND</div>':vocal?'<div class="vocal-signal-route"><span>01 / CLEAN & CONTROL</span><i>↓</i><span>02 / TONE & IDENTITY</span><i>↓</i><span>03 / MOVEMENT & SPACE</span></div><div id="vocalStageOverview" class="vocal-stage-overview" aria-label="Vocal stages"></div>':utility?'<div class="utility-signal-route">INPUT ↠ TUNER / INPUT METER<br>↓<br>TRIM → CHANNELS → WIDTH<br>↓<br>CLEANUP → BALANCE → BLEND<br>↓<br>GUARD → MUTE → OUTPUT METERS</div>':creative?`<div class="creative-signal-route"><span>INPUT → ${def.id==='strainer'?'DRIVE → RESONANCE':def.id==='swirl'?'ALL-PASS STAGES':'REDUCE → TONE'}</span><i>↓</i><span>${def.id==='crumble'?'TRANSIENTS → BLEND → OUTPUT':'FOLLOWER + MOTION → BLEND'}</span></div>`:'';
    editor.innerHTML=`<div class="effect-editor-layout"><div class="effect-hero"><span class="eyebrow">INSERT ${selectedSlot+1} / ${escape(effectOwnerLabel())}</span><h2>${def.name}</h2><p>${escape(def.subtitle)}</p><div class="effect-art">${effectArt(def)}</div>${route}<div class="effect-info">${escape(def.description)}${amp?'<p id="ampCabinetHint">Cabinet controls shape the speaker and microphone.</p>':vocal?'<p id="vocalLatencyHint" class="vocal-latency-note"></p><p class="vocal-dry-note">Live monitoring follows this rack. Microphone recordings stay dry, so you can change the recipe afterwards.</p>':utility?'<p class="utility-transparent-note">No audio delay is added by the tuner or meters. Defaults preserve the original sound.</p>':''}</div></div><div class="effect-right"><div class="effect-toolbar"><span>${slot.params.bypass?'BYPASSED':amp?'AMP / CABINET / STEREO':preamp?'PREAMP / CIRCUIT / STEREO':tape?'RECORD / TAPE / PLAYBACK':vocal?'VOICE / STRIP / STEREO':utility?'TUNE / MEASURE / HOUSEKEEPING':'PROCESSING IN STEREO'}</span><div><button id="effectBypass" class="${slot.params.bypass?'bypassed':''}" aria-pressed="${slot.params.bypass}">Bypass</button><button id="effectReset">Reset</button><button id="effectUp" ${selectedSlot===0?'disabled':''}>Move ↑</button><button id="effectDown" ${selectedSlot===effectOwner().effects.length-1?'disabled':''}>Move ↓</button><button id="effectReplace">Replace</button><button id="effectRemove">Remove</button></div></div>${controls}</div></div>`;
    renderAmpState();renderCompressorState();renderPreampState();renderTapeState();renderVocalState();renderUtilityState();renderCreativeState();renderCharState();
  }
  function renderCharState() {
    const slot = effectOwner().effects[selectedSlot], note = $('charCircuitHint');
    if (slot?.type !== 'cinder' || !note) return;
    const model = effectById('cinder').models?.find(model => model.id === slot.params.shape);
    updateText(note, model?.description || 'Choose a distortion circuit, then set Drive, Bias, Tone and Output.');
  }
  function renderVocalState() {
    const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type);if(def?.id!=='glaze')return;
    const editor=$('effectEditor'),p=slot.params,active=key=>p[key]!== 'off';
    editor.querySelector('.effect-toolbar>span').textContent=p.bypass?'BYPASSED':'VOICE / STRIP / STEREO';
    const preset=def.presets.find(recipe=>Object.keys(recipe.params).every(key=>recipe.params[key]===p[key]));
    $('vocalPreset').value=preset?.id||'';$('vocalPresetDescription').textContent=preset?.description||'Custom settings. The house accepts amendments.';
    $('vocalStageOverview').innerHTML=def.groups.filter(g=>g.enableKey).map(g=>`<span class="${active(g.enableKey)?'active':''}"><i></i>${escape(g.shortLabel||g.label.replace(/^\d+\s*[·/]\s*/,''))}</span>`).join('');
    for(const g of def.groups){const field=editor.querySelector('[data-vocal-group="'+g.id+'"]');if(!field)continue;const enabled=!g.enableKey||active(g.enableKey);field.classList.toggle('stage-off',!enabled);for(const input of field.querySelectorAll('.effect-controls input,.effect-controls select'))input.disabled=!enabled&&!g.alwaysKeys?.includes(input.dataset.effectParam);}
    const pitchActive=(active('pitch')&&p.pitchMix>0)||(active('harmony')&&p.harmonyMix>0);
    for(const key of ['key','scale','speed'])if($('fx-'+key))$('fx-'+key).disabled=p.pitch!=='correct';
    for(const key of ['carrier','carrierNote','carrierChord'])if($('fx-'+key))$('fx-'+key).disabled=p.robot!=='vocoder';
    if($('fx-robotFreq'))$('fx-robotFreq').disabled=p.robot!=='ring';
    if($('fx-delayTime'))$('fx-delayTime').disabled=p.delay==='off'||p.delayClock!=='free';
    if($('fx-delayDivision'))$('fx-delayDivision').disabled=p.delay==='off'||p.delayClock!=='sync';
    if($('fx-pitchWindow')&&p.harmony==='on'&&p.harmonyMix>0)$('fx-pitchWindow').disabled=false;
    $('vocalLatencyHint').textContent=p.bypass?'Strip bypassed. No vocal processing is applied.':pitchActive?'Pitch / harmony wet path: ~'+(p.pitchWindow/2+4).toFixed(0)+' ms average window delay (4–'+(p.pitchWindow+4).toFixed(0)+' ms). '+(p.pitch==='correct'?'Correction also needs about 60–80 ms to track a new note. ':'')+'Shorter windows respond faster; longer windows sound smoother.':'Pitch and harmony are off. Cleanup, dynamics, and tone do not use a pitch window.';
    $('vocalLatencyHint').classList.toggle('pitch-active',pitchActive&&!p.bypass);renderVocalMeters();
  }
  function renderVocalMeters(meters=engine.getMeters()) {
    const slot=effectOwner().effects[selectedSlot];if(slot?.type!=='glaze'||$('effectEditor').hidden)return;
    const m=effectReading(meters),valid=m?.type==='glaze'&&!m.bypass,finite=value=>typeof value==='number'&&Number.isFinite(value);
    for(const output of $('effectEditor').querySelectorAll('[data-vocal-meter]')){const key=output.dataset.vocalMeter,value=m?.[key];let text='—';if(valid&&finite(value)){if(key==='detectedHz'){if(value>0&&(m.confidence||0)>.35){const midi=69+12*Math.log2(value/440),rounded=Math.round(midi),notes=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];text=notes[((rounded%12)+12)%12]+(Math.floor(rounded/12)-1)+' / '+Math.round(value)+' Hz';}else text='Unvoiced';}else if(key==='pitchLatencyMs')text=value.toFixed(1)+' ms';else if(key==='inputDb'||key==='outputDb')text=value<=-90?'−∞ dB':value.toFixed(1)+' dB';else text=Math.abs(value).toFixed(1)+' dB';}updateText(output,text);}
  }
  function renderUtilityState() {
    const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type);
    if (def?.id !== 'scales') return;
    const p = slot.params, editor = $('effectEditor');
    editor.querySelector('.effect-toolbar>span').textContent = p.bypass ? 'BYPASSED / ORIGINAL AUDIO' : p.mute === 'on' ? 'OUTPUT MUTED / TUNER LISTENING' : 'TUNE / MEASURE / HOUSEKEEPING';
    const preset = def.presets.find(recipe => Object.keys(recipe.params).every(key => recipe.params[key] === p[key]));
    $('utilityPreset').value = preset?.id || '';
    $('utilityPresetDescription').textContent = preset?.description || 'Custom settings. Every portion accounted for.';
    const enabled = { targetNote: p.target === 'manual', bassFreq: p.monoBass === 'on', lowcut: p.highpass === 'on', highcut: p.lowpass === 'on', ceiling: p.guard === 'on' };
    for (const [key, active] of Object.entries(enabled)) if ($('fx-' + key)) $('fx-' + key).disabled = !active;
    for (const key of ['tunerChannel', 'reference', 'tuning', 'target', 'sensitivity', 'tolerance']) $('fx-' + key).disabled = p.tuner !== 'on';
    $('fx-targetNote').disabled = p.tuner !== 'on' || p.target !== 'manual';
    const guide = $('utilityGuideButtons'), notes = def.tunings[p.tuning] || [];
    if (guide.dataset.tuning !== p.tuning) {
      guide.dataset.tuning = p.tuning;
      guide.innerHTML = `<button data-utility-auto aria-pressed="${p.target === 'auto'}">Auto</button>${notes.map(note => `<button data-utility-target="${note}" aria-label="Tune to ${utilityNoteName(note)}" aria-pressed="false">${utilityNoteName(note)}</button>`).join('')}<span>${notes.length ? 'Select a string to hold its target.' : 'Chromatic / the nearest semitone.'}</span>`;
    }
    for (const button of guide.querySelectorAll('button')) {
      const automatic = button.hasAttribute('data-utility-auto'), note = Number(button.dataset.utilityTarget);
      button.setAttribute('aria-pressed', String(automatic ? p.target === 'auto' : p.target === 'manual' && note === p.targetNote));
      button.disabled = p.tuner !== 'on';
      if (!automatic) button.title = utilityNoteName(note) + ' / ' + (p.reference * Math.pow(2, (note - 69) / 12)).toFixed(2) + ' Hz';
    }
    renderUtilityMeters();
  }
  function renderUtilityMeters(meters = engine.getMeters()) {
    const slot = effectOwner().effects[selectedSlot];
    if (slot?.type !== 'scales' || $('effectEditor').hidden) return;
    const p = slot.params, m = effectReading(meters), valid = m?.type === 'scales' && !m.bypass && !p.bypass;
    const finite = value => typeof value === 'number' && Number.isFinite(value), db = value => value <= -100 ? '−∞ dBFS' : value.toFixed(1) + ' dBFS';
    for (const output of $('effectEditor').querySelectorAll('[data-utility-meter]')) {
      const key = output.dataset.utilityMeter, value = m?.[key];
      if (key.startsWith('clip')) {
        const clipped = valid && !!value;
        updateText(output,!valid ? '—' : clipped ? 'CLIP' : 'CLEAR');
        updateClass(output,'clipped', clipped);
      } else if (!valid || !finite(value)) updateText(output,'—');
      else if (key === 'correlation') updateText(output,m.outputDb <= -90 ? '— / no output' : (value >= 0 ? '+' : '') + value.toFixed(2));
      else if (key.startsWith('dc')) updateText(output,(value > 0 ? '+' : '') + (value * 100).toFixed(2) + '%');
      else if (key === 'crestDb') updateText(output,value.toFixed(1) + ' dB');
      else updateText(output,db(value));
    }
    for (const side of ['Left', 'Right']) {
      const bar = $('effectEditor').querySelector('[data-utility-level="' + side + '"]'), peak = valid && finite(m['peak' + side + 'Db']) ? m['peak' + side + 'Db'] : -120, hold = valid && finite(m['hold' + side + 'Db']) ? m['hold' + side + 'Db'] : -120;
      const level = num((peak + 60) / 66 * 100, 0, 100) + '%', marker = bar.querySelector('b');
      if (bar.style.getPropertyValue('--utility-level') !== level) bar.style.setProperty('--utility-level', level);
      updateStyle(marker, 'left', num((hold + 60) / 66 * 100, 0, 100) + '%');
      updateProperty(marker, 'hidden', hold <= -100);
      updateAttribute(bar,'aria-valuenow', String(num(peak, -60, 6)));
      updateAttribute(bar,'aria-valuetext', valid ? db(peak) : 'No reading');
    }
    updateStyle($('utilityCorrelationMarker'),'left',(valid && finite(m.correlation) ? (num(m.correlation, -1, 1) + 1) * 50 : 50) + '%');
    // Calibration values can be automated. The audio thread reports their
    // current normalized values; before audio starts, show the saved settings.
    const reference = valid && finite(m.reference) ? num(m.reference, 430, 450) : p.reference;
    const targetNote = valid && finite(m.targetNote) ? Math.round(num(m.targetNote, 21, 95)) : p.targetNote;
    const tolerance = valid && finite(m.tolerance) ? num(m.tolerance, 1, 10) : p.tolerance;
    const hz = valid && p.tuner === 'on' && finite(m.detectedHz) && m.detectedHz > 0 && m.confidence >= .6 ? m.detectedHz : 0;
    const midi = hz ? 69 + 12 * Math.log2(hz / reference) : null, note = midi === null ? null : Math.round(midi), strings = effectById('scales').tunings[p.tuning] || [];
    const target = p.target === 'manual' ? targetNote : midi === null ? null : strings.length ? strings.reduce((nearest, string) => Math.abs(string - midi) < Math.abs(nearest - midi) ? string : nearest, strings[0]) : note;
    const targetHz = target === null ? 0 : reference * Math.pow(2, (target - 69) / 12), cents = hz && targetHz ? 1200 * Math.log2(hz / targetHz) : null;
    for (const button of $('utilityGuideButtons').querySelectorAll('[data-utility-target]')) updateAttribute(button, 'aria-pressed', String(p.target === 'manual' && Number(button.dataset.utilityTarget) === targetNote));
    updateText($('utilityNote'),note === null ? '—' : utilityNoteName(note).replace(/-?\d+$/, ''));
    updateText($('utilityOctave'),note === null ? '' : String(Math.floor(note / 12) - 1));
    updateText($('utilityCents'),cents === null ? '—' : (cents > .05 ? '+' : cents < -.05 ? '−' : '') + Math.abs(cents).toFixed(1));
    updateText($('utilityHz'),hz ? hz.toFixed(2) + ' Hz' : '— Hz');
    updateText($('utilityTargetHz'),targetHz ? utilityNoteName(target) + ' / ' + targetHz.toFixed(2) + ' Hz' : '— Hz');
    const confidence = hz ? num(m.confidence, 0, 1) : 0;
    updateText($('utilityConfidence'),hz ? Math.round(confidence * 100) + '%' : '—');
    updateStyle($('utilityConfidenceBar'),'width',confidence * 100 + '%');
    const tuner = $('utilityTuner'), inTune = cents !== null && Math.abs(cents) <= tolerance;
    updateClass(tuner,'in-tune', inTune);
    updateClass(tuner,'has-note', !!hz);
    updateAttribute($('utilityNeedle'),'transform', 'rotate(' + (cents === null ? 0 : num(cents / 50 * 65, -65, 65)) + ' 160 158)');
    const statusText = p.bypass ? 'Bypassed. Original audio passes through; analysis is off.' : p.tuner !== 'on' ? 'Tuner is off. Meters and utility processing remain active.' : !valid ? 'Play or monitor input to start analysis.' : !hz ? 'No clear note. Play one string and let it settle.' : inTune ? 'In tune · within ±' + Number(tolerance.toFixed(1)) + ' cents.' : cents < 0 ? 'Flat · raise the pitch' + (Math.abs(cents) > 50 ? ' towards ' + utilityNoteName(target) : '') + '.' : 'Sharp · lower the pitch' + (Math.abs(cents) > 50 ? ' towards ' + utilityNoteName(target) : '') + '.';
    const status = $('utilityTunerStatus');
    updateText(status,statusText);
    updateProperty(tuner.dataset, 'state', p.bypass ? 'bypassed' : p.tuner !== 'on' ? 'off' : !valid ? 'waiting' : !hz ? 'no-signal' : inTune ? 'in-tune' : cents < 0 ? 'flat' : 'sharp');
  }
  function renderAmpState() {
    const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type);if(def?.id!=='broiler')return;
    const editor = $('effectEditor'), params = slot.params, descriptors = new Map(effectParams(def).map(param => [param.key, param]));
    editor.querySelector('.effect-toolbar>span').textContent=params.bypass?'BYPASSED / ORIGINAL AUDIO':'AMP / FOUR PEDALS / '+(params.stereo==='mono'?'MONO':'STEREO');
    const preset = def.presets.find(recipe => Object.keys(recipe.params).every(key => recipe.params[key] === params[key]));
    if ($('broilerPreset')) {
      if (document.activeElement !== $('broilerPreset')) updateProperty($('broilerPreset'), 'value', preset?.id || '');
      updateText($('broilerPresetDescription'), preset ? preset.description + ' Complete rig recipe.' : 'Custom rig. A recipe replaces the amplifier, cabinet and all four pedals.');
    }
    const model = def.ampModels?.find(model => model.id === params.model);
    updateText($('broilerAmpInspiration'), model?.inspiration || descriptors.get('model').options.find(option => option.value === params.model)?.label || 'Your amplifier');
    updateText($('broilerAmpDescription'), model?.description || 'Choose the head for its feel. Your cabinet and pedalboard stay as you set them.');
    const ampOn = params.ampEnable !== 'off', power = $('fx-ampEnable');
    if (power) { updateAttribute(power, 'aria-pressed', ampOn); updateAttribute(power, 'aria-label', ampOn ? 'Bypass amplifier head only' : 'Enable amplifier head'); updateText(power.querySelector('span'), ampOn ? 'Head on' : 'Head off'); }
    editor.querySelector('.broiler-head')?.classList.toggle('amp-off', !ampOn);
    const direct = params.cabinet === 'di', cabinetKeys = new Set(['speakerDrive', 'mic', 'distance', 'air', 'micType', 'cabLowCut', 'cabHighCut', 'cabResonance']);
    const ampKeys = new Set(effectParams(def).map(param => param.key).filter(key => !/^pedal[1-4]/.test(key) && !['model', 'ampEnable', 'input', 'output', 'mix', 'cabinet', 'stereo'].includes(key) && !cabinetKeys.has(key)));
    const pedalColours = { 'green-808': '#80956b', 'gold-klone': '#d0ae67', rodent: '#a7a396', 'orange-one': '#d8945f', 'wool-fuzz': '#a798b8', muffin: '#aa7e74', 'treble-boost': '#d4bd8a', 'studio-comp': '#a5bac0', wah: '#8eaa9d', chorus: '#a1b8c5', phaser: '#c69b70', echo: '#8ca59b', spring: '#adbaa6', none: '#6e8177' };
    for (let number = 1; number <= 4; number++) {
      const prefix = 'pedal' + number, card = editor.querySelector('[data-broiler-pedal="' + number + '"]'); if (!card) continue;
      const type = params[prefix + 'Type'], empty = type === 'none', enabled = params[prefix + 'Enabled'] === 'on';
      const pedal = def.pedalModels?.find(pedal => pedal.id === type), toggle = $('fx-' + prefix + 'Enabled');
      updateProperty(card.dataset, 'type', type); updateClass(card, 'pedal-on', enabled && !empty); updateClass(card, 'pedal-empty', empty); card.style.setProperty('--broiler-pedal-color', pedalColours[type] || '#a3b39b');
      toggle.disabled = empty; updateAttribute(toggle, 'aria-pressed', enabled && !empty); updateAttribute(toggle, 'aria-label', (enabled ? 'Bypass' : 'Enable') + ' pedal ' + number); updateText(toggle.querySelector('span'), empty ? 'Empty' : enabled ? 'On' : 'Bypassed');
      updateText($('broilerPedalState' + number), empty ? 'Choose an effect to get started.' : enabled ? 'On · ' + (params[prefix + 'Route'] === 'post' ? 'after cabinet' : 'before amp') : 'Bypassed · settings kept');
      updateText($('broilerPedalDescription' + number), empty ? 'An open place on the board. Choose a pedal above, then switch it on.' : [pedal?.inspiration, pedal?.description].filter(Boolean).join(' · ') || 'Adjust this pedal to taste. Its settings stay here when bypassed.');
      for (const suffix of ['Drive', 'Tone']) {
        const key = prefix + suffix, input = $('fx-' + key), label = suffix === 'Drive' ? pedal?.driveLabel : pedal?.toneLabel;
        if (input) { const name = label || suffix; updateText(input.closest('.control').querySelector('.broiler-param-name'), name); updateAttribute($('fx-number-' + key), 'aria-label', 'Pedal ' + number + ' ' + name + ' exact value'); }
      }
      for (const suffix of ['Drive', 'Tone', 'Level', 'Mix']) for (const input of editor.querySelectorAll('[data-effect-param="' + prefix + suffix + '"],[data-broiler-number="' + prefix + suffix + '"]')) input.disabled = empty;
      for (const option of $('fx-' + prefix + 'Route').options) updateText(option, option.value === 'pre' ? 'Before amp' : 'After cabinet');
      card.querySelector('[data-broiler-pedal-action="clear"]').disabled = empty && !effectParams(def).some(param => param.key.startsWith(prefix) && params[param.key] !== def.defaults[param.key]) && !effectOwner().automation.some(lane => lane.target.startsWith('fx:' + selectedSlot + ':' + prefix));
    }
    for (const input of editor.querySelectorAll('[data-effect-param]')) {
      const param = descriptors.get(input.dataset.effectParam); if (!param) continue;
      const value = params[param.key] ?? param.default;
      if (input.matches('input,select') && document.activeElement !== input) {
        const displayed = input.dataset.log === 'true' ? Math.log(value / param.min) / Math.log(param.max / param.min) : input.type === 'number' ? Number(value.toFixed(4)) : value;
        updateProperty(input, 'value', displayed);
      }
      const control = input.closest('.control');
      if (control && param.type === 'range') {
        updateText(control.querySelector('output'), broilerValue(param, value));
        const exact = control.querySelector('[data-broiler-number]'); if (exact && document.activeElement !== exact) updateProperty(exact, 'value', Number(value.toFixed(4)));
      }
      if (cabinetKeys.has(param.key)) { input.disabled = direct; const exact = control?.querySelector('[data-broiler-number]'); if (exact) exact.disabled = direct; if (control) updateClass(control, 'broiler-control-inactive', direct); }
      if (ampKeys.has(param.key)) { input.disabled = !ampOn; const exact = control?.querySelector('[data-broiler-number]'); if (exact) exact.disabled = !ampOn; if (control) updateClass(control, 'broiler-control-inactive', !ampOn); }
    }
    if ($('broilerMatchedCab')) { $('broilerMatchedCab').disabled = !model?.matchedCab; updateAttribute($('broilerMatchedCab'), 'title', model?.matchedCab ? 'Use ' + (descriptors.get('cabinet').options.find(option => option.value === model.matchedCab)?.label || model.matchedCab) : 'Choose an amplifier with a matching cabinet'); }
    updateText($('broilerCabinetStatus'), direct ? ampOn ? 'Cabinet off. After-cabinet pedals still follow the head.' : 'Head and cabinet off. Hear the pedalboard on its own.' : ampOn ? 'Your cabinet stays in place when changing heads. Match cabinet changes only the speaker choice.' : 'Head bypassed. The cabinet, microphone and pedalboard remain active.');
    $('ampCabinetHint').textContent=direct?'Direct head output. Its cabinet and microphone controls are inactive; their settings stay yours.':'Explore valves, tone circuits and microphone placement in the Workshop.';
    renderBroilerMeters();
  }
  function renderBroilerMeters(meters = engine.getMeters()) {
    const slot = effectOwner().effects[selectedSlot]; if (slot?.type !== 'broiler' || $('effectEditor').hidden) return;
    const reading = effectReading(meters), valid = reading?.type === 'broiler' && !reading.bypass;
    for (const output of $('effectEditor').querySelectorAll('[data-broiler-meter]')) {
      const value = reading?.[output.dataset.broilerMeter];
      updateText(output, valid && Number.isFinite(value) ? value <= -90 ? '−∞ dB' : value.toFixed(1) + ' dB' : '—');
    }
  }
  function effectRange(p,value){const log=p.unit==='Hz'&&p.min>0&&p.max/p.min>8;return `<input id="fx-${p.key}" data-effect-param="${p.key}" ${log?'data-log="true"':''} type="range" min="${log?0:p.min}" max="${log?1:p.max}" step="${log?.001:p.step}" value="${log?Math.log(value/p.min)/Math.log(p.max/p.min):value}">`;}
  function formatParam(p,value) { if(p.key==='balance')return panLabel(value);if(p.key==='targetNote')return utilityNoteName(value)+' / '+Math.round(value);if(p.key==='carrierNote'){const notes=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'],note=Math.round(value);return notes[note%12]+(Math.floor(note/12)-1)+' / '+note;} if(p.unit==='dB')return (value>0?'+':'')+Number(value).toFixed(1)+' dB'; if (p.key==='mix'||(!p.unit&&['depth','spread','width','size','diffusion','pan','duty','cleanLow','presence','master','sag','speakerDrive','mic','distance','air'].includes(p.key))) return Math.round(value*100)+'%'; if(p.unit==='%')return Math.round(value*100)+'%'; if(p.unit==='Hz'&&value>=1000)return (value/1000).toFixed(value>=10000?1:2)+' kHz'; if(p.unit===':1')return Number(value).toFixed(1)+':1'; const decimals=p.step>=1?0:p.step>=.1?1:2; return Number(value).toFixed(decimals)+(p.unit?' '+p.unit:''); }
  function transportLocked() { return audioSettingsBusy || recordPending || recordFinishing || engine.isRecording || !!engine.recordingBusy; }
  function renderTransport() {
    const m=engine.getMeters(), recording=!!m.recording, locked=transportLocked();
    $('playButton').disabled=transportPending||locked||!!m.playing;
    $('playButton').setAttribute('aria-pressed',String(!!m.playing));
    $('pauseButton').disabled=audioSettingsBusy||recordFinishing||(!m.playing&&!recordPending&&!transportPending);
    $('stopButton').disabled=audioSettingsBusy||recordFinishing;
    $('recordButton').classList.toggle('recording',recording);
    const recordMode=recording?(m.recordStage||'recording'):recordPending?'preparing':'ready';
    if($('recordButton').dataset.mode!==recordMode){$('recordButton').dataset.mode=recordMode;$('recordButton').innerHTML='<i></i><span>'+(recording?(m.recordStage==='count-in'?'Cancel count-in':m.recordStage==='waiting'?'Cancel punch':'Finish take'):recordPending?'Preparing…':'Record')+'</span>';}
    $('recordButton').disabled=audioSettingsBusy||recordPending||recordFinishing;
    if(document.activeElement!==$('tempo'))$('tempo').value=state.tempo;
    $('tempo').disabled=locked;
    $('loopButton').setAttribute('aria-pressed',state.loopEnabled);
    $('metronomeButton').setAttribute('aria-pressed',state.master.metronome);
    $('followButton').setAttribute('aria-pressed',String(state.view.follow));
    for(const id of ['returnStartButton','previousBarButton','nextBarButton','goEndButton','loopStartButton','loopEndButton','restartButton','openPositionButton','positionApply','loopButton','loopStart','loopEnd','lengthBars'])$(id).disabled=locked;
    $('loopSelectionButton').disabled=locked||!clipLocation();
    $('ruler').setAttribute('aria-disabled',String(locked));
    $('playhead').setAttribute('aria-disabled',String(locked));
    renderRecordingSetup();renderMicrophone();renderMarkers();renderClipActions();
    renderPlayhead();
  }
  function renderPlayhead() {
    const beat=engine.getMeters().beat||0;
    updateStyle($('playhead'),'left',beat*state.view.zoom+'px');
    updateAttribute($('playhead'),'aria-valuenow',String(beat));
    updateAttribute($('playhead'),'aria-valuemax',String(state.lengthBars*4));
    updateAttribute($('playhead'),'aria-valuetext',positionLabel(beat));
  }
  function positionParts(beat) {
    const ticks=Math.round(num(beat,0,state.lengthBars*4)*1000);
    return {bar:Math.floor(ticks/4000)+1,beat:Math.floor(ticks%4000/1000)+1,tick:ticks%1000};
  }
  function positionLabel(beat) { const p=positionParts(beat);return String(p.bar).padStart(2,'0')+' : '+String(p.beat).padStart(2,'0')+' : '+String(p.tick).padStart(3,'0'); }
  function revealPlayhead() {
    const viewport=$('timelineScroll'),x=(engine.getMeters().beat||0)*state.view.zoom,padding=Math.min(50,viewport.clientWidth*.15);
    if(x<viewport.scrollLeft+padding||x>viewport.scrollLeft+viewport.clientWidth-padding)viewport.scrollLeft=Math.max(0,x-viewport.clientWidth*.3);
  }
  function seekTo(beat,{reveal=true}={}) {
    if(transportLocked()){status('Finish the take before moving the playhead.');return false;}
    if(transportPending){++transportOperation;transportPending=false; notePlayback.stop(); notePlayback.setRecordingTracks([]); engine.stop();for(const t of state.tracks)if(t.instrument&&frames.has(t.id))fireCommand(t.id,'stop');}
    try{engine.seek(num(beat,0,state.lengthBars*4));renderPlayhead();if(reveal)revealPlayhead();renderTransport();return true;}catch(e){status(e.message);return false;}
  }
  function stepBar(direction) { seekTo((engine.getMeters().beat||0)+direction*4); }
  function toggleLoop() { if(transportLocked())return;remember();state.loopEnabled=!state.loopEnabled;changed({arrangement:true});renderTransport(); }
  function loopSelection() {
    const selected=clipLocation();if(!selected||transportLocked())return;
    remember();state.loopStart=selected.clip.start;state.loopEnd=selected.clip.start+selected.clip.length;state.loopEnabled=true;changed({arrangement:true});renderTransport();seekTo(state.loopStart);status('Looping the selected clip’s time range.');
  }
  function toggleFollow() { state.view.follow=!state.view.follow;followUntil=0;if(state.view.follow)revealPlayhead();renderTransport();scheduleAutosave(); }
  function openPosition() {
    if(transportLocked())return;const p=positionParts(engine.getMeters().beat||0);
    $('positionBar').max=state.lengthBars+1;$('positionBar').value=p.bar;$('positionBeat').value=p.beat;$('positionTick').value=p.tick;
    updatePositionTime();$('positionDialog').showModal();$('positionBar').focus();$('positionBar').select();
  }
  function requestedPosition() { return num((Math.round(num($('positionBar').value,1,state.lengthBars+1))-1)*4+Math.round(num($('positionBeat').value,1,4))-1+Math.round(num($('positionTick').value,0,999))/1000,0,state.lengthBars*4); }
  function updatePositionTime() { $('positionTime').textContent=(requestedPosition()*60/state.tempo).toFixed(3)+' seconds'; }
  function applyPosition() { if(seekTo(requestedPosition()))$('positionDialog').close(); }
  function beginSeek(e) {
    if(transportLocked()||(e.pointerType==='mouse'&&e.button!==0))return;
    if(e.target.closest('[data-marker]'))return;
    e.preventDefault();seekDrag={pointer:e.pointerId,element:e.currentTarget};e.currentTarget.setPointerCapture(e.pointerId);
    seekTo(snap((e.clientX-$('timeline').getBoundingClientRect().left)/state.view.zoom),{reveal:false});
  }
  function moveSeek(e) {
    if(!seekDrag||seekDrag.pointer!==e.pointerId)return;
    const viewport=$('timelineScroll'),bounds=viewport.getBoundingClientRect();
    if(e.clientX<bounds.left+24)viewport.scrollLeft-=12;else if(e.clientX>bounds.right-24)viewport.scrollLeft+=12;
    seekTo(snap((e.clientX-$('timeline').getBoundingClientRect().left)/state.view.zoom),{reveal:false});
  }
  function endSeek(e) { if(seekDrag?.pointer===e.pointerId){seekDrag=null;renderPlayhead();} }
  function renderAll() { $('projectName').value=state.name; $('autosaveEnabled').checked=recovery; renderArrangement(); renderMixer(); renderRack(); renderClipInspector(); renderEffectEditor(); renderTransport(); renderHistory(); automationEditor?.render(); noteWorkflow?.render(); }
  function makeFrame(id) { let frame=frames.get(id); if(!frame){frame=document.createElement('iframe');frame.dataset.hostTrack=id;frame.title='Instrument editor for '+state.tracks.find(t=>t.id===id).name;frame.setAttribute('allow','autoplay');frame.hidden=true;$('instrumentFrames').append(frame);frames.set(id,frame);}return frame; }
  function showFrame(id) { if(frameTrack&&frameTrack!==id)engine.clearAudition(frameTrack);frameTrack=id;for(const [key,frame]of frames)frame.hidden=key!==id;$('instrumentBrowser').hidden=true;$('instrumentEditorBar').hidden=false;$('instrumentFrames').hidden=false;const t=state.tracks.find(t=>t.id===id);$('instrumentEditorName').textContent=S.instrumentName(t.instrument);$('instrumentDialogTitle').textContent=t.name+' / instrument editor';engine.resumeAudition(id); }
  function closeInstrument() { if(frameTrack)engine.clearAudition(frameTrack);frameTrack=null;$('instrumentDialog').close(); }
  function instrumentOptions() { return [...(window.LoomInstrumentManifest||host.manifest||[]),...customManifest]; }
  function renderInstrumentBrowser() { const i=browserTrack===null?state.selectedTrack:browserTrack;$('instrumentDialogTitle').textContent='Choose a voice for track '+String(i+1).padStart(2,'0')+'.';$('instrumentGrid').innerHTML=instrumentOptions().map((app,index)=>`<button class="instrument-card" data-app="${index}" style="--app-color:${app.color||'#dce89b'}"><span class="eyebrow">${host.manifest.some(item=>item.id===app.id)?'KITCHEN / BUNDLED':'KITCHEN / DISCOVERED'}</span><h3>${escape(app.name||app.id.toUpperCase())}</h3><div class="instrument-art">${instrumentArt(app.id,app.color||'#dce89b')}</div><p>${escape(app.description||'A browser instrument from the Kitchen.')}</p><span class="instrument-open">LOAD INTO TRACK ${String(i+1).padStart(2,'0')} ↗</span></button>`).join(''); }
  async function discoverInstruments() { if(discoveryDone||location.protocol==='file:')return;discoveryDone=true;try{const hub=new URL('../index.html',location.href),response=await fetch(hub,{credentials:'same-origin'});if(!response.ok)return;const doc=new DOMParser().parseFromString(await response.text(),'text/html');const known=new Set(instrumentOptions().map(a=>a.id));for(const a of doc.querySelectorAll('.instrument .open-app')){const url=new URL(a.getAttribute('href'),hub);if(url.origin!==location.origin)continue;const match=url.pathname.match(/\/music\/([a-z0-9-]+)\/(?:index\.html)?$/i);if(!match||match[1]==='loom'||known.has(match[1]))continue;const id=match[1];known.add(id);const card=a.closest('.instrument');customManifest.push({id,name:card.querySelector('h2,h3')?.textContent?.trim()||id.toUpperCase(),url:url.href,color:'#b9ced7',description:'New equipment from Kitchen. Editor-controlled transport until its host API is registered.'});}renderInstrumentBrowser();}catch(_){} }
  function openInstrumentBrowser(index=state.selectedTrack) { browserTrack=index;if(frameTrack)engine.clearAudition(frameTrack);frameTrack=null;$('instrumentBrowser').hidden=false;$('instrumentEditorBar').hidden=true;$('instrumentFrames').hidden=true;renderInstrumentBrowser();if(!$('instrumentDialog').open)$('instrumentDialog').showModal();discoverInstruments(); }
  async function ensureInstrument(t,{open=false,replace=false,descriptor=null}={}) { const id=t.id,operation=(loadOperations.get(id)||0)+1;loadOperations.set(id,operation);const generation=lifecycle;if(descriptor){if(replace){remember({instruments:true});if(frames.has(id)){host.unload(id);frames.get(id).remove();frames.delete(id);openedApps.delete(id);}t.instrument=clone(descriptor);changed({arrangement:true,rack:true});}else t.instrument=clone(descriptor);}if(!t.instrument)throw Error('Choose an instrument for '+t.name+' first.');await engine.init();if(generation!==lifecycle||operation!==loadOperations.get(id))return false;const frame=makeFrame(id),identity=t.instrument.html||t.instrument.url||t.instrument.id;if(open){showFrame(id);if(!$('instrumentDialog').open)$('instrumentDialog').showModal();$('instrumentHostStatus').textContent='Preparing the instrument and audio bridge…';}if(openedApps.get(id)!==identity){const result=await host.load(id,{id:t.instrument.id,name:t.instrument.name,url:t.instrument.url,html:t.instrument.html,state:t.instrument.snapshot},frame);if(generation!==lifecycle||operation!==loadOperations.get(id))return false;openedApps.set(id,identity);const capabilities=result&&result.capabilities;const transport=capabilities&&typeof capabilities==='object'?capabilities.transport:undefined;if(open)$('instrumentHostStatus').textContent=transport===false?'Editor-controlled transport · play the app, then Record its track.':'Instrument ready · output is routed through this track.';}else if(open)$('instrumentHostStatus').textContent=host.capabilities(id).transport?'Instrument ready · your previous settings are intact.':'Editor-controlled transport · play the app, then Record its track.';return true; }
  async function openExisting(index=state.selectedTrack) { selectedTrack(index);const t=track();if(!t.instrument){openInstrumentBrowser(index);return;}browserTrack=index;try{await ensureInstrument(t,{open:true});}catch(e){status(e.message);$('instrumentHostStatus').textContent=e.message;} }
  function clearAllFrames() { for(const id of frames.keys()){host.unload(id);frames.get(id).remove();engine.clearAudition(id);}frames.clear();openedApps.clear();loadOperations.clear();frameTrack=null; }
  function fireCommand(id,command,payload){const generation=lifecycle;return host.command(id,command,payload).catch(e=>{if(generation===lifecycle)status('Instrument '+command+': '+e.message);return false;});}
  async function transportStart() { if(transportPending||transportLocked()||engine.getMeters().playing)return;if((engine.getMeters().beat||0)>=state.lengthBars*4)seekTo(0);const operation=++transportOperation,generation=lifecycle;transportPending=true;renderTransport();try{await engine.init();const live=state.tracks.filter(t=>t.instrument&&t.instrumentLive);await Promise.all(live.map(async t=>{const ready=await ensureInstrument(t);if(ready)await host.command(t.id,'prepare');}));if(operation!==transportOperation||generation!==lifecycle)return;await host.setTempo(state.tempo); await notePlayback.prepare(); if(operation!==transportOperation||generation!==lifecycle)return;const started=await engine.play();if(!started||operation!==transportOperation||generation!==lifecycle)return; notePlayback.start(); for(const t of live)fireCommand(t.id,'start');status('Service has started. The specials are behaving, for now.');}catch(e){if(operation===transportOperation)status(e.message);}finally{if(operation===transportOperation){transportPending=false;renderTransport();}} }
  async function halt({rewind=false,keepMicrophone=false}={}) {
    if(recordFinishing)return;
    const operation=++transportOperation,generation=lifecycle,recording=engine.isRecording;
    transportPending=false; notePlayback.stop(); notePlayback.setRecordingTracks([]); engine.stop({preserveMicrophoneMonitoring:keepMicrophone});
    if(recordPending&&!recording)engine.cancelRecording();
    recordPending=false;
    for(const t of state.tracks)if(t.instrument&&frames.has(t.id))fireCommand(t.id,'stop');
    if(recording)await finishRecording();
    if(operation!==transportOperation||generation!==lifecycle)return;
    if(rewind){try{engine.seek(0);}catch(e){status(e.message);return;}revealPlayhead();status(recording?'Take printed. Stopped at the beginning.':'Stopped at the beginning. Ready for the next order.');}
    else if(!recording)status('Paused at '+positionLabel(engine.getMeters().beat||0)+'.');
    renderTransport();
  }
  function pause() { return halt(); }
  function stop() { return halt({rewind:true}); }
  function togglePlayback() { return engine.getMeters().playing||transportPending||recordPending?pause():transportStart(); }
  async function restart() { if(transportLocked())return;const generation=lifecycle;await pause();if(generation!==lifecycle||transportLocked())return;if(seekTo(0))await transportStart(); }
  function panic(message='Silence. Pending recordings have been discarded.') { ++microphoneOperation;++lifecycle;++transferOperation;transferAbort?.abort();automationEditor?.disarm?.();++recordFinishOperation;++importOperation;++projectOperation;++transportOperation;for(const [id,op]of loadOperations)loadOperations.set(id,op+1);recordPending=false;transportPending=false;recordFinishing=false; noteWorkflow?.cancel(); notePlayback.panic(); notePlayback.setRecordingTracks([]); engine.panic();for(const t of state.tracks)if(t.instrument&&frames.has(t.id))fireCommand(t.id,'panic');for(const id of armedBeforeRecord.keys())engine.clearAudition(id);armedBeforeRecord.clear();renderTransport();status(message); }
  async function startRecording() { if(audioSettingsBusy||recordPending||recordFinishing||transportPending)return;if(engine.getMeters().recording){await halt({keepMicrophone:true});return;}const source=$('recordSource').value,target=track(),operation=++transportOperation,generation=lifecycle;recordPending=true;renderTransport();try{await engine.init();if(operation!==transportOperation||generation!==lifecycle)return;const used=state.assets.reduce((total,a)=>total+a.frames*a.channels*2,0),budgetBytes=Math.max(0,64*1024*1024-used);if(budgetBytes<48000*4)throw Error('This project has reached its audio memory limit. Start a new session or remove unused audio.');if(source==='microphone'){const mic=engine.getMicrophoneStatus();if(mic.enabled&&mic.trackId!==target.id)throw Error('Monitoring is on another track. Select that track, or use Move monitoring here before recording.');if(target.clips.length>=128)throw Error('This track has reached its 128-clip limit. Remove a clip before recording.');notePlayback.setRecordingTracks([]);await notePlayback.prepare();if(operation!==transportOperation||generation!==lifecycle)return;const started=await engine.startMicrophoneRecording(target.id,{maxSeconds:Math.min(120,(256-(engine.getMeters().beat||0))*60/state.tempo),budgetBytes,startTransport:true});if(started&&operation===transportOperation&&generation===lifecycle)status('Recording microphone into '+target.name+'. '+(engine.getMicrophoneStatus().enabled?'Live effects are monitored; the take stays dry. ':'The microphone is not monitored. ')+'Finish take keeps its alignment; Panic discards it.');return;}let armed=state.tracks.filter(t=>t.armed&&t.instrument);if(!armed.length&&track().instrument){remember();track().armed=true;armed=[track()];renderTrackHeaders();renderMixer();}if(!armed.length)throw Error('Choose an instrument, then arm its track before recording.');if(armed.some(t=>t.clips.length>=128))throw Error('An armed track has reached its 128-clip limit. Remove a clip or disarm it before recording.');await Promise.all(armed.map(async t=>{if(await ensureInstrument(t))await host.command(t.id,'prepare');}));if(operation!==transportOperation||generation!==lifecycle)return;await host.setTempo(state.tempo);if(operation!==transportOperation||generation!==lifecycle)return;notePlayback.setRecordingTracks(armed.map(t=>t.id)); await notePlayback.prepare(); for(const t of armed){armedBeforeRecord.set(t.id,t.instrumentLive);engine.resumeAudition(t.id);}const started=await engine.startRecording(armed.map(t=>t.id),{maxSeconds:Math.min(120,(256-(engine.getMeters().beat||0))*60/state.tempo),budgetBytes,startTransport:true});if(!started||operation!==transportOperation||generation!==lifecycle)return;status('Recording '+armed.map(t=>t.name).join(', ')+'. Stop turns the performance into editable clips.');}catch(e){if(operation===transportOperation){notePlayback.setRecordingTracks([]);engine.cancelRecording();for(const id of armedBeforeRecord.keys())engine.clearAudition(id);armedBeforeRecord.clear();status(e.message);}}finally{if(operation===transportOperation){recordPending=false;renderTransport();}} }
  async function finishRecording(limited=false){
    if(recordFinishing)return;recordFinishing=true;recordPending=false;const generation=lifecycle,operation=++recordFinishOperation;renderTransport();
    try{
      const takes=await engine.stopRecording();if(generation!==lifecycle||operation!==recordFinishOperation)return;
      if(!takes||!takes.length){status('Recording canceled before any audio was captured.');return;}
      const snapshots=await Promise.all(takes.map(async take=>{const t=state.tracks.find(t=>t.id===take.trackId);if(!t?.instrument||!frames.has(t.id))return null;try{return await host.snapshot(t.id);}catch(_){return null;}}));
      if(generation!==lifecycle||operation!==recordFinishOperation)return;
      remember();for(let i=0;i<takes.length;i++){
        const take=takes[i];if(!take.frames||take.frames<128)continue;const t=state.tracks.find(t=>t.id===take.trackId);if(!t)continue;
        if(t.clips.length>=128){status(t.name+' has reached its clip limit. Remove a clip before recording again.');continue;}
        const asset=S.encodeAsset({left:take.left,right:take.right,sampleRate:take.sampleRate,name:t.name+' — take '+(t.clips.length+1)});state.assets.push(asset);
        const length=take.frames/take.sampleRate*state.tempo/60,start=Math.max(0,take.startBeat||0);state.lengthBars=Math.max(state.lengthBars,Math.min(64,Math.ceil((start+length)/4)));
        const c={id:S.uid('clip'),name:asset.name,assetId:asset.id,start,length:Math.max(.015625,Math.min(length,state.lengthBars*4-start)),sourceStart:0,sourceEnd:take.frames/take.sampleRate,sourceOffset:0,rate:1,reverse:false,loop:false,gain:1,fadeIn:.01,fadeOut:.03};
        t.clips.push(c);selectedClip=c.id;rackTarget='track';state.selectedTrack=state.tracks.indexOf(t);if(t.instrument&&snapshots[i])t.instrument.snapshot=snapshots[i];
      }
      state=S.normalize(state);decodeAssets();changed({arrangement:true,mixer:true,rack:true,inspector:true});status(limited==='punch'?'Punch take printed between the chosen boundaries.':limited?'The recording limit was reached. Your complete take is in the arrangement.':'Take printed. Move, trim, split, or add effects to the new clip.');
    }catch(e){if(generation===lifecycle)status(e.message);}
    finally{if(operation===recordFinishOperation){notePlayback.setRecordingTracks([]);for(const id of armedBeforeRecord.keys())if(id!==frameTrack)engine.clearAudition(id);armedBeforeRecord.clear();recordFinishing=false;renderTransport();}}
  }
  engine.onRecordingTransportStart=()=>{notePlayback.start();for(const t of state.tracks)if(t.instrument&&frames.has(t.id)&&(armedBeforeRecord.has(t.id)||t.instrumentLive))fireCommand(t.id,'start');};
  engine.onRecordingLimit=info=>{notePlayback.stop();engine.stop();for(const t of state.tracks)if(t.instrument&&frames.has(t.id))fireCommand(t.id,'stop');finishRecording(info?.reason==='punch'?'punch':true);};
  engine.onTransportEnd=()=>{notePlayback.stop();for(const t of state.tracks)if(t.instrument&&frames.has(t.id))fireCommand(t.id,'stop');renderTransport();status('The session has reached its end. Play starts again from the beginning.');};
  async function replaceState(next,{message='Project opened.',undo=false}={}) { const old=state;++lifecycle;++projectOperation;++importOperation;++transportOperation;exportAbort?.abort();panic('');if(!undo)remember();clearAllFrames();if($('instrumentDialog').open)closeInstrument();state=S.normalize(next);host.setTempo(state.tempo);selectedClip=null;selectedSlot=null;rackTarget='track';assetMap={};decodeAssets();engine.setState(state);notePlayback.setState(state);engine.seek(0);renderAll();scheduleAutosave();status(message); }
  function historyState(next,message,{restoreInstruments=false}={}){
    const previous=state,normalized=S.normalize(next),playing=engine.getMeters().playing;const identity=t=>t.instrument&&(t.instrument.html||t.instrument.url||t.instrument.id);
    ++lifecycle;++importOperation;++projectOperation;++transportOperation;exportAbort?.abort();transportPending=false;if(recordPending){engine.cancelRecording();recordPending=false;}
    for(let i=0;i<8;i++){
      const old=previous.tracks[i],t=normalized.tracks[i];
      if(identity(old)===identity(t)&&t.instrument){if(restoreInstruments&&t.instrument.snapshot&&frames.has(t.id)){clearTimeout(snapshotTimers.get(t.id));host.restore(t.id,t.instrument.snapshot).then(()=>{if(state.tracks[i].instrument?.id===t.instrument.id)scheduleSnapshot(t.id);}).catch(e=>status('Instrument restore: '+e.message));}else if(old.instrument.snapshot)t.instrument.snapshot=clone(old.instrument.snapshot);}
      else if(frames.has(old.id)){host.unload(old.id);frames.get(old.id).remove();frames.delete(old.id);openedApps.delete(old.id);engine.clearAudition(old.id);loadOperations.set(old.id,(loadOperations.get(old.id)||0)+1);if(frameTrack===old.id){frameTrack=null;$('instrumentDialog').close();}}
      if(playing&&frames.has(t.id)&&old.instrumentLive&&!t.instrumentLive)fireCommand(t.id,'stop');
    }
    state=normalized;host.setTempo(state.tempo);decodeAssets();engine.setState(state);notePlayback.setState(state);if(!clipLocation())selectedClip=null;if(selectedSlot!==null&&!effectOwner().effects[selectedSlot])selectedSlot=null;renderAll();scheduleAutosave();status(message);
    if(playing){const generation=lifecycle;for(let i=0;i<8;i++){const t=state.tracks[i];if(t.instrument&&t.instrumentLive&&!previous.tracks[i].instrumentLive){ensureInstrument(t).then(async ready=>{if(ready&&generation===lifecycle){await host.command(t.id,'prepare');if(generation===lifecycle&&engine.getMeters().playing)fireCommand(t.id,'start');}}).catch(e=>status(e.message));}}}
  }
  function undo(){if(recordFinishing){status('Finishing this take. Undo will be available in a moment.');return;}if(!history.length)return;const next=history.pop(),restoreInstruments=instrumentHistory.has(next),current=clone(state);if(restoreInstruments)instrumentHistory.add(current);future.push(current);historyState(next,'The previous order has returned.',{restoreInstruments});}
  function redo(){if(recordFinishing){status('Finishing this take. Redo will be available in a moment.');return;}if(!future.length)return;const next=future.pop(),restoreInstruments=instrumentHistory.has(next),current=clone(state);if(restoreInstruments)instrumentHistory.add(current);history.push(current);historyState(next,'The next order has returned.',{restoreInstruments});}
  function removeClip() { const location=clipLocation();if(!location)return;remember();location.track.clips=location.track.clips.filter(c=>c.id!==selectedClip);selectedClip=null;state=S.pruneAssets(state);decodeAssets();changed({arrangement:true,inspector:true});status('Clip removed. Undo will bring it back.'); }
  function duplicateClip() { const location=clipLocation();if(!location)return;if(location.track.clips.length>=128){status('This track has reached its 128-clip limit.');return;}const c=location.clip,start=snap(c.start+c.length);if(start>=state.lengthBars*4){status('Increase the session length to make room for a duplicate.');return;}remember();const copy={...clone(c),id:S.uid('clip'),start,length:Math.min(c.length,state.lengthBars*4-start),name:c.name+' copy'};location.track.clips.push(copy);selectedClip=copy.id;changed({arrangement:true,inspector:true});status('A second piece, just beside the first.'); }
  function splitClip() { const location=clipLocation();if(!location)return;const c=location.clip,point=snap(engine.getMeters().beat||0);if(point<=c.start+.015625||point>=c.start+c.length-.015625){status('Move the playhead inside the selected clip, then split.');return;}if(location.track.clips.length>=128){status('This track has reached its 128-clip limit.');return;}remember();const leftLength=point-c.start,rawOffset=(c.sourceOffset||0)+leftLength*(c.type==='notes'?1:60/state.tempo)*c.rate,offset=c.loop?rawOffset%Math.max(.000001,c.type==='notes'?c.pattern.lengthBeats:c.sourceEnd-c.sourceStart):(c.type==='notes'?Math.min(rawOffset,c.pattern.lengthBeats):rawOffset),right={...clone(c),id:S.uid('clip'),start:point,length:c.length-leftLength,sourceOffset:offset,fadeIn:0,name:c.name+' / II'};c.length=leftLength;c.fadeOut=0;location.track.clips.push(right);selectedClip=right.id;changed({arrangement:true,inspector:true});status('One sound, now in two agreeable pieces.'); }
  async function importAudio(file) { if(!file)return;if(file.size>64*1024*1024){status('Choose an audio file smaller than 64 MB. A clip can hold up to two minutes.');return;}const generation=lifecycle,operation=++importOperation,target=track().id;status('Decoding audio locally…');try{const context=await engine.init(),bytes=await file.arrayBuffer();if(generation!==lifecycle||operation!==importOperation)return;const audio=await context.decodeAudioData(bytes);if(generation!==lifecycle||operation!==importOperation)return;const framesCount=Math.min(audio.length,Math.floor(audio.sampleRate*120)),left=new Float32Array(audio.getChannelData(0).subarray(0,framesCount)),right=new Float32Array(audio.getChannelData(Math.min(1,audio.numberOfChannels-1)).subarray(0,framesCount));const asset=S.encodeAsset({left,right,sampleRate:audio.sampleRate,name:file.name.replace(/\.[^.]+$/,'')||'Imported audio'}),t=state.tracks.find(t=>t.id===target);if(t.clips.length>=128)throw Error('This track has reached its 128-clip limit.');const used=state.assets.reduce((sum,a)=>sum+a.frames*a.channels*2,0);if(used+asset.frames*asset.channels*2>64*1024*1024)throw Error('This audio would exceed the project’s 64 MB audio budget.');const start=Math.min(state.lengthBars*4-.015625,Math.max(0,snap(engine.getMeters().beat||0))),duration=framesCount/audio.sampleRate;remember();state.lengthBars=Math.max(state.lengthBars,Math.min(64,Math.ceil((start+duration*state.tempo/60)/4)));state.assets.push(asset);const c={id:S.uid('clip'),name:asset.name,assetId:asset.id,start,length:Math.min(duration*state.tempo/60,state.lengthBars*4-start),sourceStart:0,sourceEnd:duration,sourceOffset:0,rate:1,reverse:false,loop:false,gain:1,fadeIn:.01,fadeOut:.03};t.clips.push(c);rackTarget='track';state.selectedTrack=state.tracks.indexOf(t);selectedClip=c.id;decodeAssets();changed({arrangement:true,mixer:true,rack:true,inspector:true});status(file.name+' is in the arrangement'+(audio.length>framesCount?' (first two minutes retained).':'.')+(duration*state.tempo/60>c.length+.001?' The full source is retained; the visible clip ends at the 64-bar session limit.':''));}catch(e){if(generation===lifecycle&&operation===importOperation)status('Audio import: '+e.message);} }
  async function saveProject() { const generation=lifecycle,operation=++projectOperation;status('Gathering the instruments’ settings…');$('saveButton').disabled=true;try{if(engine.getMeters().recording)await stop();await snapshotAll();if(generation!==lifecycle||operation!==projectOperation)return;download(new Blob([S.serializeProject(state)],{type:'application/json'}),filename('.loom.json'));status('Project saved, including audio and instrument settings.');}catch(e){if(generation===lifecycle)status(e.message);}finally{$('saveButton').disabled=false;} }
  async function openProject(file) { if(!file)return;if(file.size>256*1024*1024){status('Choose a GALLEY project smaller than 256 MB.');return;}const generation=lifecycle,operation=++projectOperation;status('Reading the project…');try{const next=S.parseProject(await file.text());if(generation!==lifecycle||operation!==projectOperation)return;await replaceState(next,{message:'Project opened. All eight stations are ready.'});}catch(e){if(generation===lifecycle&&operation===projectOperation)status(e.message);} }
  function openEffects(slot, index = null) {
    if (index !== null) selectedTrack(index, { keepClip: true });
    selectedSlot = slot;
    $('effectGrid').innerHTML = effects.map(def => `<button class="effect-choice" data-add-effect="${def.id}" style="--effect-color:${def.color}"><div class="effect-art">${effectArt(def)}</div><h3>${def.name}</h3><p>${escape(def.description)}</p><span class="effect-type">INSERT ${slot + 1} / ${escape(effectOwnerLabel())}</span></button>`).join('');
    automationEditor?.render(); $('effectDialog').showModal();
  }
  function selectEffect(slot, index = state.selectedTrack) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= (state.tracks[index]?.effects.length || 0)) return false;
    selectedTrack(index, { keepClip: true }); selectedSlot = slot;
    if (!effectOwner().effects[slot]) { openEffects(slot); return; }
    renderRack(); renderEffectEditor(); revealEffectEditor();
  }
  function selectBusEffect(slot, id) {
    if (!['master', 'return-1', 'return-2'].includes(id) || !Number.isInteger(slot) || slot < 0 || slot > 3) return false;
    rackTarget = id; selectedSlot = slot; renderRack(); automationEditor?.render();
    if (!effectOwner().effects[slot]) { renderEffectEditor(); openEffects(slot); }
    else { renderEffectEditor(); revealEffectEditor(); }
    return true;
  }
  function focusBus(id) {
    if (!['master', 'return-1', 'return-2'].includes(id)) return false;
    rackTarget = id; selectedSlot = effectOwner().effects.findIndex(effect => effect); if (selectedSlot < 0) selectedSlot = null;
    renderRack(); renderEffectEditor(); automationEditor?.render();
    return true;
  }
  function changeEffect(action) { const t=effectOwner(),slot=t.effects[selectedSlot];if(!slot)return;remember();if(action==='bypass')slot.params.bypass=!slot.params.bypass;if(action==='reset'){slot.params=clone(effectById(slot.type).defaults);if(rackTarget.startsWith('return-'))slot.params.mix=1;}if(action==='remove'){clearEffectAutomation(t,selectedSlot);t.effects[selectedSlot]=null;selectedSlot=null;}if(action==='up'&&selectedSlot>0){swapEffectAutomation(t,selectedSlot,selectedSlot-1);[t.effects[selectedSlot-1],t.effects[selectedSlot]]=[slot,t.effects[selectedSlot-1]];selectedSlot--;}if(action==='down'&&selectedSlot<t.effects.length-1){swapEffectAutomation(t,selectedSlot,selectedSlot+1);[t.effects[selectedSlot+1],t.effects[selectedSlot]]=[slot,t.effects[selectedSlot+1]];selectedSlot++;}changed({arrangement:true,mixer:true,rack:true,automation:true});renderEffectEditor(); }
  const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));return c>>>0;});
  function canceledError(){const error=new Error('Render canceled.');error.name='AbortError';return error;}
  async function crc32(bytes,signal){let c=0xffffffff;for(let start=0;start<bytes.length;start+=262144){if(signal?.aborted)throw canceledError();const end=Math.min(bytes.length,start+262144);for(let i=start;i<end;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);await new Promise(resolve=>setTimeout(resolve,0));}return(c^0xffffffff)>>>0;}
  async function zipStored(files,signal,onProgress){const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;for(let i=0;i<files.length;i++){if(signal?.aborted)throw canceledError();const file=files[i],data=new Uint8Array(await file.blob.arrayBuffer()),name=encoder.encode(file.name),crc=await crc32(data,signal),local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x5c21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);parts.push(local,data);const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,0x5c21,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);directory.push(central);offset+=local.length+data.length;onProgress?.((i+1)/files.length);}if(signal?.aborted)throw canceledError();const centralSize=directory.reduce((n,a)=>n+a.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);return new Blob([...parts,...directory,end],{type:'application/zip'});}
  async function renderExport() {
    if (exportAbort) return;
    const generation = lifecycle, controller = new AbortController(); exportAbort = controller;
    $('renderButton').disabled = true; $('cancelExport').hidden = false; $('closeExport').disabled = true; $('exportProgress').hidden = false; $('exportProgress').value = 0;
    const mode = $('exportMode').value, range = $('exportRange').value, tail = Number($('exportTail').value), initialExportState = clone(state);
    const startBeat = range === 'loop' ? state.loopStart : 0, endBeat = range === 'loop' ? state.loopEnd : state.lengthBars * 4;
    const dryJob = t => ({ options: { trackId: t.id }, suffix: '-' + String(initialExportState.tracks.indexOf(t) + 1).padStart(2, '0') + '-' + (t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track') + '-dry.wav' });
    const wetJob = id => ({ options: { returnId: id }, suffix: id === 'return-1' ? '-09-return-a-wet.wav' : '-10-return-b-wet.wav' });
    const jobs = mode === 'all' ? [...initialExportState.tracks.map(dryJob), ...initialExportState.returns.map(owner => wetJob(owner.id))] : [mode === 'stem' ? dryJob(initialExportState.tracks[state.selectedTrack]) : mode.startsWith('return-') ? wetJob(mode) : { options: {}, suffix: '-mix.wav' }];
    $('exportSummary').textContent = mode === 'all' ? 'Rendering eight dry track stems and two wet returns…' : 'Rendering stereo audio…';
    try {
      const exportState = await renderSnapshot(initialExportState, controller.signal, { startBeat, endBeat, ...(mode === 'stem' ? jobs[0].options : {}) }), exportAssets = { ...assetMap }, files = [];
      for (let i = 0; i < jobs.length; i++) {
        const blob = await engine.renderWav(exportState, exportAssets, { snapshotReady: true, startBeat, endBeat, tailSeconds: tail, ...jobs[i].options, signal: controller.signal, onProgress: progress => { $('exportProgress').value = (i + progress) / jobs.length * (mode === 'all' ? .9 : 1); } });
        if (generation !== lifecycle || controller.signal.aborted) return;
        files.push({ blob, name: filename(jobs[i].suffix) });
      }
      if (mode === 'all') {
        $('exportSummary').textContent = 'Packing ten stems into one ZIP…';
        const zip = await zipStored(files, controller.signal, progress => { $('exportProgress').value = .9 + progress * .1; });
        if (generation !== lifecycle || controller.signal.aborted) return;
        download(zip, filename('-ten-stems.zip'));
      } else download(files[0].blob, files[0].name);
      $('exportSummary').textContent = mode === 'all' ? 'Ten stereo stems downloaded: eight tracks and two wet returns.' : 'Stereo WAV downloaded.';
      status(mode === 'all' ? 'Eight dry tracks and two wet returns are packed in one ZIP.' : 'The stereo WAV is ready.');
    } catch (error) { $('exportSummary').textContent = error.name === 'AbortError' ? 'Render canceled.' : error.message; status(error.name === 'AbortError' ? 'WAV render canceled.' : error.message); }
    finally { if (exportAbort === controller) exportAbort = null; $('renderButton').disabled = false; $('cancelExport').hidden = true; $('closeExport').disabled = false; }
  }

  function selectClipElement(el) { const i=Number(el.dataset.track);rackTarget='track';state.selectedTrack=i;selectedClip=el.dataset.clip;for(const c of $('trackLanes').querySelectorAll('.clip'))c.classList.toggle('selected',c===el);for(const lane of $('trackLanes').querySelectorAll('.track-lane'))lane.classList.toggle('selected',Number(lane.dataset.lane)===i);renderTrackHeaders();renderMixer();renderRack();renderClipInspector();renderEffectEditor();renderTransport();automationEditor?.render(); }
  $('trackLanes').addEventListener('pointerdown',e=>{const el=e.target.closest('.clip');if(!el){const lane=e.target.closest('[data-lane]');if(lane){selectedTrack(Number(lane.dataset.lane));seekTo(snap((e.clientX-$('timeline').getBoundingClientRect().left)/state.view.zoom));}return;}if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();selectClipElement(el);const c=clipLocation().clip;drag={pointer:e.pointerId,element:el,original:clone(c),trackIndex:state.selectedTrack,startX:e.clientX,startY:e.clientY,mode:e.target.dataset.edge||'move',remembered:false};el.setPointerCapture(e.pointerId);});
  $('trackLanes').addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;const dx=e.clientX-drag.startX;if(!drag.remembered&&Math.abs(dx)<3&&Math.abs(e.clientY-drag.startY)<7)return;if(!drag.remembered){remember();drag.remembered=true;}const c=clipLocation().clip,o=drag.original,delta=snap(dx/state.view.zoom),min=1/64,secondsPerBeat=c.type==='notes'?1:60/state.tempo;if(drag.mode==='move'){c.start=num(snap(o.start+delta),0,state.lengthBars*4-o.length);const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-lane]');if(target){drag.targetIndex=Number(target.dataset.lane);if(drag.element.parentElement!==target)target.append(drag.element);}}else if(drag.mode==='right'){c.length=num(snap(o.length+delta),min,state.lengthBars*4-o.start);c.fadeIn=Math.min(o.fadeIn,c.length/2);c.fadeOut=Math.min(o.fadeOut,c.length/2);}else{const first=o.loop?0:o.start-Math.min(o.start,(o.sourceOffset||0)/secondsPerBeat/o.rate),next=num(snap(o.start+delta),first,o.start+o.length-min);c.start=next;c.length=o.start+o.length-next;c.sourceOffset=(o.sourceOffset||0)+(next-o.start)*secondsPerBeat*o.rate;if(c.loop){const span=Math.max(.000001,c.type==='notes'?c.pattern.lengthBeats:c.sourceEnd-c.sourceStart);c.sourceOffset=((c.sourceOffset%span)+span)%span;}else c.sourceOffset=Math.max(0,c.type==='notes'?Math.min(c.sourceOffset,c.pattern.lengthBeats):c.sourceOffset);c.fadeIn=Math.min(o.fadeIn,c.length/2);c.fadeOut=Math.min(o.fadeOut,c.length/2);}drag.element.style.left=c.start*state.view.zoom+'px';drag.element.style.width=Math.max(5,c.length*state.view.zoom)+'px';engine.setState(state);notePlayback.setState(state);renderClipInspector();});
  function finishDrag(e) { if(!drag||e.pointerId!==drag.pointer)return;const completed=drag;drag=null;if(completed.remembered&&completed.mode==='move'&&completed.targetIndex!==undefined&&completed.targetIndex!==completed.trackIndex){const source=state.tracks[completed.trackIndex],target=state.tracks[completed.targetIndex],c=source.clips.find(c=>c.id===selectedClip);if(target.clips.length>=128){Object.assign(c,completed.original);status('That track has reached its clip limit.');}else{source.clips=source.clips.filter(c=>c.id!==selectedClip);target.clips.push(c);rackTarget='track';state.selectedTrack=completed.targetIndex;}}changed({arrangement:true,mixer:true,rack:true,inspector:true}); }
  $('trackLanes').addEventListener('pointerup',finishDrag);$('trackLanes').addEventListener('pointercancel',e=>{if(drag&&e.pointerId===drag.pointer){const c=clipLocation()?.clip;if(c)Object.assign(c,drag.original);drag=null;changed({arrangement:true,inspector:true});}});
  $('trackLanes').addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;const el=e.target.closest('.clip');if(!el)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();selectClipElement(el);if(e.key==='Enter'||e.key===' ')return;remember();const c=clipLocation().clip,step=state.view.snap||.0625;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const sign=e.key==='ArrowLeft'?-1:1;if(e.shiftKey)c.length=num(c.length+sign*step,1/64,state.lengthBars*4-c.start);else c.start=num(c.start+sign*step,0,state.lengthBars*4-c.length);}else{const target=state.selectedTrack+(e.key==='ArrowUp'?-1:1);if(target>=0&&target<8&&state.tracks[target].clips.length<128){const t=track();t.clips=t.clips.filter(a=>a.id!==c.id);state.tracks[target].clips.push(c);state.selectedTrack=target;}}changed({arrangement:true,mixer:true,rack:true,inspector:true});requestAnimationFrame(()=>{for(const item of $('trackLanes').querySelectorAll('[data-clip]'))if(item.dataset.clip===selectedClip)item.focus();});}});
  const activeRanges=new WeakSet();
  $('mixer').addEventListener('pointerdown', e => {
    const element = e.target.closest('[data-eq-band]'); if (!element || e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault(); e.stopPropagation(); if (trackEqDrag) return;
    endTrackEqKeyboard();
    const owner = state.tracks[Number(element.dataset.track)], key = element.dataset.eqBand;
    element.focus({ preventScroll: true });
    trackEqDrag = { pointer: e.pointerId, element, owner, key, lastY: e.clientY, value: trackEqValue(key, Number(element.getAttribute('aria-valuenow'))), remembered: false, lifecycle };
    element.classList.add('is-adjusting');
    try { element.setPointerCapture(e.pointerId); } catch (_) { /* Synthetic pointer events have no active capture. */ }
  });
  $('mixer').addEventListener('pointermove', e => {
    const gesture = trackEqDrag; if (!gesture || gesture.pointer !== e.pointerId) return;
    if (!gesture.element.isConnected || gesture.lifecycle !== lifecycle || state.tracks[Number(gesture.element.dataset.track)] !== gesture.owner) { finishTrackEqDrag(); return; }
    e.preventDefault(); e.stopPropagation();
    const movement = gesture.lastY - e.clientY; if (movement === 0) return;
    const control = trackEqDefinition(gesture.key);
    gesture.value = control.sweep ? num(gesture.value * Math.exp(movement * (e.shiftKey ? .0015 : .009) * Math.log(control.max / control.min)), control.min, control.max) : num(gesture.value + movement * (e.shiftKey ? .025 : .15), -12, 12); gesture.lastY = e.clientY;
    setTrackEqGain(gesture.owner, gesture.key, gesture.value, gesture, gesture.element);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('mixer').addEventListener(name, e => { if (trackEqDrag?.pointer === e.pointerId) { e.stopPropagation(); finishTrackEqDrag(e); } });
  $('mixer').addEventListener('dblclick', e => {
    const element = e.target.closest('[data-eq-band]'); if (!element) return;
    e.preventDefault(); e.stopPropagation(); finishTrackEqDrag(); endTrackEqKeyboard();
    setTrackEqGain(state.tracks[Number(element.dataset.track)], element.dataset.eqBand, trackEqDefinition(element.dataset.eqBand).default, { remembered: false }, element, true); renderTrackEqState();
  });
  $('mixer').addEventListener('click', e => {
    const element = e.target.closest('[data-eq-band]'), reset = e.target.closest('[data-eq-flat]'); if (!element && !reset) return;
    e.stopPropagation(); if (!reset) return;
    finishTrackEqDrag(); endTrackEqKeyboard();
    const index = Number(reset.dataset.eqFlat), owner = state.tracks[index], gesture = { remembered: false };
    for (const band of trackEqBands) setTrackEqGain(owner, band.key, 0, gesture, $('eq-' + index + '-' + band.key), true);
    renderTrackEqState();
    const reading = owner.automation?.some(lane => lane.target.startsWith('eq:') && lane.enabled !== false && lane.points?.length);
    status('Track ' + (index + 1) + (reading ? ' manual EQ gains are flat. Automation remains active.' : ' EQ is flat.'));
  });
  $('mixer').addEventListener('keydown', e => {
    const element = e.target.closest('[data-eq-band]'); if (!element || e.ctrlKey || e.metaKey) return;
    if (e.altKey) { e.stopPropagation(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishTrackEqDrag(); endTrackEqKeyboard(); return; }
    if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End', 'Enter', ' '].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation(); finishTrackEqDrag();
    const owner = state.tracks[Number(element.dataset.track)], key = element.dataset.eqBand;
    if (trackEqKeyboard?.element !== element || trackEqKeyboard.owner !== owner) { endTrackEqKeyboard(); trackEqKeyboard = { element, owner, remembered: false }; }
    element.classList.add('is-adjusting');
    const control = trackEqDefinition(key), current = trackEqValue(key, Number(element.getAttribute('aria-valuenow'))), amount = control.step * (e.shiftKey || e.key.startsWith('Page') ? 10 : 1);
    const next = e.key === 'Home' ? control.min : e.key === 'End' ? control.max : ['Enter', ' '].includes(e.key) ? control.default : current + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(e.key) ? amount : -amount);
    setTrackEqGain(owner, key, next, trackEqKeyboard, element, ['Enter', ' '].includes(e.key));
  });
  $('mixer').addEventListener('change', e => {
    const key = e.target.dataset.eqNumber; if (!key) return;
    const owner = state.tracks[Number(e.target.dataset.track)], value = e.target.valueAsNumber;
    if (owner && Number.isFinite(value)) setTrackEqGain(owner, key, value, { remembered: false }, $('eq-' + Number(e.target.dataset.track) + '-' + key));
    if (owner) e.target.value = trackEqValue(key, owner.eq?.[key]);
    renderTrackEqState();
  });
  $('mixer').addEventListener('keyup', e => { if (e.target.closest('[data-eq-band]')) endTrackEqKeyboard(); });
  $('mixer').addEventListener('focusout', e => { if (trackEqDrag?.element === e.target) finishTrackEqDrag(); if (trackEqKeyboard?.element === e.target) endTrackEqKeyboard(); });
  window.addEventListener('blur', () => { finishTrackEqDrag(); endTrackEqKeyboard(); });
  $('effectEditor').addEventListener('pointerdown', e => {
    const element = e.target.closest('[data-tape-knob]'); if (!element || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); finishTapeDrag(); finishTapeKeyboard();
    const gesture = tapeGesture(element); if (!gesture) return;
    element.focus({ preventScroll: true });
    tapeDrag = { ...gesture, pointer: e.pointerId, lastY: e.clientY, value: gesture.slot.params[gesture.param.key] };
    element.classList.add('is-adjusting'); element.setPointerCapture(e.pointerId);
  });
  $('effectEditor').addEventListener('pointermove', e => {
    const gesture = tapeDrag; if (!gesture || gesture.pointer !== e.pointerId) return;
    e.preventDefault(); e.stopPropagation();
    const delta = gesture.lastY - e.clientY; gesture.lastY = e.clientY;
    gesture.value = Math.max(gesture.param.min, Math.min(gesture.param.max, gesture.value + delta * (gesture.param.max - gesture.param.min) / (e.shiftKey ? 1600 : 220)));
    setTapeKnob(gesture, gesture.value);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('effectEditor').addEventListener(name, e => {
    if (tapeDrag?.pointer === e.pointerId) { e.stopPropagation(); finishTapeDrag(e); }
  });
  $('effectEditor').addEventListener('keydown', e => {
    const element = e.target.closest('[data-tape-knob]'); if (!element || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishTapeDrag(); finishTapeKeyboard(); return; }
    if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End', 'Enter', ' '].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation(); finishTapeDrag();
    const current = tapeGesture(element); if (!current) return;
    if (tapeKeyboard?.element !== element || tapeKeyboard.slot !== current.slot || tapeKeyboard.owner !== current.owner) { finishTapeKeyboard(); tapeKeyboard = current; }
    element.classList.add('is-adjusting');
    const param = tapeKeyboard.param, amount = param.step * (e.key.startsWith('Page') ? 10 : 1), value = tapeKeyboard.slot.params[param.key];
    const next = e.key === 'Home' ? param.min : e.key === 'End' ? param.max : ['Enter', ' '].includes(e.key) ? param.default : value + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(e.key) ? amount : -amount);
    setTapeKnob(tapeKeyboard, next);
  });
  $('effectEditor').addEventListener('keyup', e => { if (e.target.closest('[data-tape-knob]')) finishTapeKeyboard(); });
  $('effectEditor').addEventListener('focusout', e => { if (tapeDrag?.element === e.target) finishTapeDrag(); if (tapeKeyboard?.element === e.target) finishTapeKeyboard(); });
  $('effectEditor').addEventListener('dblclick', e => {
    const element = e.target.closest('[data-tape-knob]'); if (!element) return;
    e.preventDefault(); e.stopPropagation(); finishTapeDrag(); finishTapeKeyboard();
    const gesture = tapeGesture(element); if (gesture) setTapeKnob(gesture, gesture.param.default);
  });
  window.addEventListener('blur', () => { finishTapeDrag(); finishTapeKeyboard(); });
  document.addEventListener('change', e => {
    if (e.target.id === 'tapePreset') {
      const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type), preset = def?.presets?.find(preset => preset.id === e.target.value);
      if (def?.id !== 'preserve' || !preset) return;
      finishTapeDrag(); finishTapeKeyboard(); remember(); slot.params = { ...clone(def.defaults), ...clone(preset.params) };
      changed({ rack: true, mixer: true, automation: true }); renderTapeState();
      status(preset.name + ' loaded. ' + preset.description); return;
    }
    const input = e.target, key = input.dataset.tapeNumber; if (!key) return;
    const slot = effectOwner().effects[selectedSlot], def = slot && effectById(slot.type), param = def?.id === 'preserve' && effectParams(def).find(param => param.key === key);
    if (!param || input.disabled) return;
    const scale = tapeNumberScale(param), value = input.valueAsNumber / scale;
    if (!Number.isFinite(value) || value < param.min || value > param.max) {
      input.value = Number((slot.params[key] * scale).toFixed(4));
      status(param.label + ': use a value from ' + Number((param.min * scale).toFixed(4)) + ' to ' + Number((param.max * scale).toFixed(4)) + '.'); return;
    }
    finishTapeDrag(); finishTapeKeyboard();
    if (slot.params[key] !== value) { remember(); slot.params[key] = value; automationEditor?.capture('fx:' + selectedSlot + ':' + key, value, { remembered: true, ownerId: effectOwner().id }); changed(); }
    renderTapeState();
  });
  document.addEventListener('toggle', e => { const detail = e.target; if (!detail.matches?.('[data-tape-details]')) return; if (detail.open) tapeDetailsOpen.add(detail.dataset.tapeDetails); else tapeDetailsOpen.delete(detail.dataset.tapeDetails); }, true);
  document.addEventListener('pointerdown',e=>{if(e.target.matches('input[type=range]')&&e.target.id!=='zoom'){remember();activeRanges.add(e.target);}});
  document.addEventListener('keydown',e=>{if(e.target.matches('input[type=range]')&&e.target.id!=='zoom'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)&&!activeRanges.has(e.target)){remember();activeRanges.add(e.target);}});
  document.addEventListener('change',e=>{if(e.target.matches('input[type=range]'))activeRanges.delete(e.target);});
  document.addEventListener('keyup',e=>{if(e.target.matches('input[type=range]'))activeRanges.delete(e.target);});
  document.addEventListener('click',e=>{
    const busSlot=e.target.closest('[data-bus-effect-owner]');if(busSlot){selectBusEffect(Number(busSlot.dataset.busEffectSlot),busSlot.dataset.busEffectOwner);return;}
    const busFocus=e.target.closest('[data-bus-focus]');if(busFocus){focusBus(busFocus.dataset.busFocus);return;}
    const busJump=e.target.closest('[data-bus-jump]');if(busJump){focusBus(busJump.dataset.busJump);$('busPanel').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return;}
    const busToggle=e.target.closest('[data-bus-toggle]');if(busToggle){const owner=S.automationOwner(state,busToggle.dataset.owner),key=busToggle.dataset.busToggle;if(!owner||!['mute','solo'].includes(key)||key==='solo'&&owner.id==='master')return;remember();owner[key]=!owner[key];changed();updateAttribute(busToggle,'aria-pressed',owner[key]);return;}
    const arm=e.target.closest('[data-arm]'),mute=e.target.closest('[data-mute]'),solo=e.target.closest('[data-solo]');
    if(arm||mute||solo){const el=arm||mute||solo,key=arm?'armed':mute?'mute':'solo',i=Number(el.dataset[arm?'arm':mute?'mute':'solo']);remember();state.tracks[i][key]=!state.tracks[i][key];changed({arrangement:true,mixer:true});return;}
    const instrument=e.target.closest('[data-instrument]');if(instrument){openExisting(Number(instrument.dataset.instrument));return;}
    const fx=e.target.closest('[data-effect-track]');if(fx){selectEffect(Number(fx.dataset.effectSlot),Number(fx.dataset.effectTrack));return;}
    const header=e.target.closest('.track-header');if(header){selectedTrack(Number(header.dataset.track));return;}
    const channel=e.target.closest('[data-channel]');if(channel&&!e.target.closest('input,button')){selectedTrack(Number(channel.dataset.channel));return;}
    const slot=e.target.closest('[data-slot]');if(slot){selectEffect(Number(slot.dataset.slot));return;}
    const add=e.target.closest('[data-add-effect]');if(add){remember();clearEffectAutomation(effectOwner(),selectedSlot);const params=clone(effectById(add.dataset.addEffect).defaults);if(rackTarget.startsWith('return-'))params.mix=1;effectOwner().effects[selectedSlot]={type:add.dataset.addEffect,params};$('effectDialog').close();changed({arrangement:true,mixer:true,rack:true});renderEffectEditor();automationEditor?.render();revealEffectEditor();return;}
    const app=e.target.closest('[data-app]');if(app){const descriptor=instrumentOptions()[Number(app.dataset.app)],index=browserTrack??state.selectedTrack;selectedTrack(index);ensureInstrument(track(),{open:true,replace:true,descriptor:{id:descriptor.id,name:descriptor.name,url:descriptor.url}}).catch(e=>status(e.message));return;}
    const presetButton=e.target.closest('[data-amp-preset]');if(presetButton){const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),preset=def?.presets?.find(p=>p.id===presetButton.dataset.ampPreset);if(preset){remember();slot.params=clone(preset.params);changed({rack:true,mixer:true,automation:true});renderEffectEditor();status(preset.name+' loaded. '+preset.description);}return;}
    const pedalAction=e.target.closest('[data-broiler-pedal-action]');if(pedalAction){broilerPedalAction(Number(pedalAction.dataset.pedalSlot),pedalAction.dataset.broilerPedalAction);return;}
    const pedalToggle=e.target.closest('[data-broiler-pedal-toggle]'),ampToggle=e.target.closest('[data-broiler-amp-toggle]');
    if(pedalToggle||ampToggle){const slot=effectOwner().effects[selectedSlot];if(slot?.type!=='broiler')return;const key=ampToggle?'ampEnable':'pedal'+pedalToggle.dataset.broilerPedalToggle+'Enabled';remember();slot.params[key]=slot.params[key]==='on'?'off':'on';changed();renderAmpState();return;}
    if(e.target.closest('#broilerMatchedCab')){const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),model=def?.ampModels?.find(model=>model.id===slot.params.model);if(def?.id!=='broiler'||!model?.matchedCab)return;if(slot.params.cabinet!==model.matchedCab){remember();slot.params.cabinet=model.matchedCab;changed();renderAmpState();}status('Matched cabinet selected. Your amplifier controls and pedalboard stay as set.');return;}
    if(e.target.closest('#compressorClassicSettings')){
      const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),model=def?.models?.find(model=>model.id===slot.params.model);if(def?.id!=='velvet'||!model?.defaults)return;
      const keys=['ratio','attack','release','knee','colour','timing','fetMode','thrust'];
      if(keys.some(key=>model.defaults[key]!==undefined&&slot.params[key]!==model.defaults[key])){remember();for(const key of keys)if(model.defaults[key]!==undefined)slot.params[key]=model.defaults[key];changed();renderCompressorState();}
      status(model.name+' settings loaded. Your threshold, input, makeup gain, detector filter, stereo link and blend stay as set.');return;
    }
    if(e.target.closest('#preampCircuitSettings')){
      const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),model=def?.models?.find(model=>model.id===slot.params.model);if(def?.id!=='saute'||slot.params.model==='clean'||!model?.defaults)return;
      const keys=['impedance','transformer','headroom','bias','feedback','slew','colour'];
      if(keys.some(key=>model.defaults[key]!==undefined&&slot.params[key]!==model.defaults[key])){remember();for(const key of keys)if(model.defaults[key]!==undefined)slot.params[key]=model.defaults[key];changed();renderPreampState();}
      status(model.name+' circuit starting point loaded. Your input, drive, output, pad, polarity, tone and blend stay as set.');return;
    }
    if(e.target.closest('#broilerSaveRig')){saveBroilerRig();return;}
    if(e.target.closest('#broilerLoadRig')){$('broilerRigFile')?.click();return;}
    const vocalView=e.target.closest('[data-vocal-view]');if(vocalView){vocalEditorView=vocalView.dataset.vocalView;renderEffectEditor();$('effectEditor').querySelector('[data-vocal-view="'+vocalEditorView+'"]').focus({preventScroll:true});return;}
    const utilityTarget=e.target.closest('[data-utility-target],[data-utility-auto]');if(utilityTarget){const slot=effectOwner().effects[selectedSlot];if(slot?.type!=='scales')return;const automatic=utilityTarget.hasAttribute('data-utility-auto'),note=Number(utilityTarget.dataset.utilityTarget);if(slot.params.target!==(automatic?'auto':'manual')||(!automatic&&slot.params.targetNote!==note)){remember();slot.params.target=automatic?'auto':'manual';if(!automatic)slot.params.targetNote=note;changed();$('fx-target').value=slot.params.target;const descriptor=effectParams(effectById('scales')).find(p=>p.key==='targetNote');$('fx-targetNote').value=slot.params.targetNote;$('fx-targetNote').closest('.control').querySelector('output').textContent=formatParam(descriptor,slot.params.targetNote);renderUtilityState();}return;}
    if(e.target.id==='utilityResetMeters'){if(engine.resetEffectMeters(effectOwner().id,selectedSlot)){renderUtilityMeters();status('SCALES peak holds and clip flags reset. Your sound settings are unchanged.');}return;}
    if(e.target.id==='utilityInputShortcut'){if(rackTarget!=='track'){status('Choose an instrument track to connect microphone input.');return;}openAudioSettings({practice:'utility'});return;}
    const effectActions={effectBypass:'bypass',effectReset:'reset',effectUp:'up',effectDown:'down',effectRemove:'remove'};if(effectActions[e.target.id]){changeEffect(effectActions[e.target.id]);return;}if(e.target.id==='effectReplace')openEffects(selectedSlot);
  });
  document.addEventListener('input',e=>{
    const input=e.target;
    if(input.hasAttribute('data-track-send')){
      const owner=state.tracks[Number(input.dataset.track)],send=Number(input.dataset.trackSend),value=Number(input.value);if(!owner||![0,1].includes(send)||!Number.isFinite(value))return;
      if(!activeRanges.has(input)){remember();activeRanges.add(input);}owner.sends[send]=num(value,0,1);automationEditor?.capture('send:'+send,owner.sends[send],{remembered:true,ownerId:owner.id});changed();renderSendState();return;
    }
    if(input.hasAttribute('data-bus-param')){
      const owner=S.automationOwner(state,input.dataset.owner),key=input.dataset.busParam,value=Number(input.value);if(!owner||!['level','pan'].includes(key)||!Number.isFinite(value))return;
      if(!activeRanges.has(input)){remember();activeRanges.add(input);}owner[key]=num(value,key==='pan'?-1:0,key==='pan'?1:1.5);automationEditor?.capture(key,owner[key],{remembered:true,ownerId:owner.id});changed();renderBusControlState();return;
    }
  });
  document.addEventListener('change',e=>{
    const input=e.target;
    if(input.hasAttribute('data-send-pre')){
      const owner=state.tracks[Number(input.dataset.track)],send=Number(input.dataset.sendPre),value=input.value==='pre';if(!owner||![0,1].includes(send)||owner.sendPre[send]===value)return;remember();owner.sendPre[send]=value;changed();return;
    }
    if(input.hasAttribute('data-send-number')){
      const owner=state.tracks[Number(input.dataset.track)],send=Number(input.dataset.sendNumber),value=input.valueAsNumber;if(!owner||![0,1].includes(send))return;
      if(!Number.isFinite(value)||value<0||value>100){input.value=Number((owner.sends[send]*100).toFixed(3));status('Use a send percentage from 0 to 100.');return;}
      if(owner.sends[send]!==value/100){remember();owner.sends[send]=value/100;automationEditor?.capture('send:'+send,value/100,{remembered:true,ownerId:owner.id});changed();}renderSendState();return;
    }
    if(input.hasAttribute('data-bus-number')){
      const owner=S.automationOwner(state,input.dataset.owner),key=input.dataset.busNumber,value=input.valueAsNumber;if(!owner||!['level','pan'].includes(key))return;
      const min=key==='pan'?-1:0,max=key==='pan'?1:1.5;if(!Number.isFinite(value)||value<min||value>max){input.value=owner[key];status('Use a value from '+min+' to '+max+'.');return;}
      if(owner[key]!==value){remember();owner[key]=value;automationEditor?.capture(key,value,{remembered:true,ownerId:owner.id});changed();}renderBusControlState();return;
    }
    if(input.hasAttribute('data-bus-name')){
      const owner=S.automationOwner(state,input.dataset.busName);if(!owner||owner.id==='master')return;const name=input.value.trim().slice(0,80)||'Return '+(owner.id==='return-1'?'A':'B');input.value=name;
      if(owner.name!==name){remember();owner.name=name;changed();renderSendControls();automationEditor?.render();if(rackTarget===owner.id&&selectedSlot!==null)renderEffectEditor();}return;
    }
  });
  document.addEventListener('input',e=>{const input=e.target;if(input.dataset.mix){if(!activeRanges.has(input)){remember();activeRanges.add(input);}const t=state.tracks[Number(input.dataset.track)],key=input.dataset.mix;t[key]=Number(input.value);automationEditor?.capture(key,t[key],{remembered:true,ownerId:t.id});if(key==='pan')input.nextElementSibling.textContent=panLabel(t.pan);else input.closest('.mixer-channel').querySelector('.channel-db').textContent=levelLabel(t.level);changed();}if(input.dataset.effectParam&&input.type==='range'){if(!activeRanges.has(input)&&input.type==='range'){remember();activeRanges.add(input);}const slot=effectOwner().effects[selectedSlot],p=effectParams(effectById(slot.type)).find(p=>p.key===input.dataset.effectParam);slot.params[p.key]=p.type==='select'?input.value:Number(input.value);if(input.dataset.log==='true')slot.params[p.key]=p.min*Math.pow(p.max/p.min,Number(input.value));automationEditor?.capture('fx:'+selectedSlot+':'+p.key,slot.params[p.key],{remembered:true});if(p.type==='range')input.closest('.control').querySelector('output').textContent=formatParam(p,slot.params[p.key]);changed();const graphic=$('effectEditor').querySelector('.effect-art');if(graphic)graphic.style.filter=`drop-shadow(0 0 ${2+slot.params.mix*7}px ${effectById(slot.type).color}22)`;renderAmpState();renderCompressorState();renderPreampState();renderTapeState();renderVocalState();renderUtilityState();renderCreativeState();renderCharState();} });
  document.addEventListener('change',e=>{
    const input=e.target;if(!input.dataset.effectParam||input.tagName!=='SELECT')return;
    const key=input.dataset.effectParam,slot=effectOwner().effects[selectedSlot],def=effectById(slot.type),previous=slot.params[key];
    if(previous===input.value)return;
    remember();slot.params[key]=input.value;
    const pedalType=def.id==='broiler'&&/^pedal([1-4])Type$/.exec(key);
    if(pedalType){
      const prefix='pedal'+pedalType[1],model=def.pedalModels?.find(model=>model.id===input.value);
      for(const suffix of ['Drive','Tone','Level','Mix']){const field=prefix+suffix;slot.params[field]=model?.defaults?.[suffix.toLowerCase()]??def.defaults[field];}
      slot.params[prefix+'Enabled']=input.value==='none'?'off':'on';
      effectOwner().automation=effectOwner().automation.filter(lane=>!lane.target.startsWith('fx:'+selectedSlot+':'+prefix));
    }
    changed(pedalType?{automation:true}:{});
    if(def.id==='glaze'&&vocalEditorView==='basic'&&(key==='delayClock'||def.groups.some(g=>g.enableKey===key))){renderEffectEditor();$('fx-'+key)?.focus({preventScroll:true});}
    else{renderAmpState();renderCompressorState();renderPreampState();renderTapeState();renderVocalState();renderUtilityState();renderCreativeState();renderCharState();}
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='broilerRigFile'){loadBroilerRig(e.target.files?.[0],e.target);return;}
    if(e.target.id==='broilerPreset'){
      const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),recipe=def?.presets?.find(recipe=>recipe.id===e.target.value);if(def?.id!=='broiler'||!recipe)return;
      remember();slot.params={...clone(def.defaults),...clone(recipe.params)};changed({rack:true,mixer:true,automation:true});renderEffectEditor();$('broilerPreset').focus({preventScroll:true});status(recipe.name+' loaded. Complete amplifier, cabinet and pedalboard recipe.');return;
    }
    const input=e.target,key=input.dataset.broilerNumber;if(!key)return;
    const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),param=def&&broilerParam(def,key);if(def?.id!=='broiler'||!param)return;
    const value=input.valueAsNumber;
    if(!Number.isFinite(value)||value<param.min||value>param.max){input.value=slot.params[key];status(param.label+': use a value from '+param.min+' to '+param.max+'.');return;}
    if(value!==slot.params[key]){remember();slot.params[key]=value;automationEditor?.capture('fx:'+selectedSlot+':'+key,value,{remembered:true});changed();}
    renderAmpState();
  });
  document.addEventListener('change',e=>{if(e.target.id!=='vocalPreset')return;const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),preset=def?.presets?.find(p=>p.id===e.target.value);if(!preset)return;remember();slot.params=clone(preset.params);changed({rack:true,mixer:true,automation:true});renderEffectEditor();$('vocalPreset').focus({preventScroll:true});status(preset.name+' loaded. '+preset.description);});
  document.addEventListener('change',e=>{
    if(e.target.id==='compressorPreset'){
      const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),recipe=def?.presets?.find(preset=>preset.id===e.target.value);if(def?.id!=='velvet'||!recipe)return;
      remember();slot.params={...clone(def.defaults),...clone(recipe.params)};changed({rack:true,mixer:true,automation:true});renderCompressorState();status(recipe.name+' loaded. '+recipe.description);return;
    }
    const input=e.target,key=input.dataset.compressorNumber;if(!key)return;
    const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),param=def&&effectParams(def).find(param=>param.key===key);if(def?.id!=='velvet'||!param||input.disabled)return;
    const value=input.valueAsNumber;
    if(!Number.isFinite(value)||value<param.min||value>param.max){input.value=slot.params[key];status(param.label+': use a value from '+param.min+' to '+param.max+'.');return;}
    if(value!==slot.params[key]){remember();slot.params[key]=value;automationEditor?.capture('fx:'+selectedSlot+':'+key,value,{remembered:true});changed();}
    renderCompressorState();
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='preampPreset'){
      const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),recipe=def?.presets?.find(preset=>preset.id===e.target.value);if(def?.id!=='saute'||!recipe)return;
      remember();slot.params={...clone(def.defaults),...clone(recipe.params)};changed({rack:true,mixer:true,automation:true});renderPreampState();status(recipe.name+' loaded. '+recipe.description);return;
    }
    const input=e.target,key=input.dataset.preampNumber;if(!key)return;
    const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),param=def&&effectParams(def).find(param=>param.key===key);if(def?.id!=='saute'||!param||input.disabled)return;
    const value=input.valueAsNumber;
    if(!Number.isFinite(value)||value<param.min||value>param.max){input.value=slot.params[key];status(param.label+': use a value from '+param.min+' to '+param.max+'.');return;}
    if(value!==slot.params[key]){remember();slot.params[key]=value;automationEditor?.capture('fx:'+selectedSlot+':'+key,value,{remembered:true,ownerId:effectOwner().id});changed();}
    renderPreampState();
  });
  document.addEventListener('change',e=>{if(e.target.id!=='utilityPreset')return;const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),preset=def?.presets?.find(p=>p.id===e.target.value);if(def?.id!=='scales'||!preset)return;remember();slot.params=clone(preset.params);changed({rack:true,mixer:true,automation:true});renderEffectEditor();$('utilityPreset').focus({preventScroll:true});status(preset.name+' loaded. '+preset.description);});
  document.addEventListener('change',e=>{if(e.target.id!=='creativePreset')return;const slot=effectOwner().effects[selectedSlot],def=slot&&effectById(slot.type),preset=def?.presets?.find(p=>p.id===e.target.value);if(!isCreativeEffect(def)||!preset)return;remember();slot.params=clone(preset.params);changed({rack:true,mixer:true,automation:true});renderEffectEditor();$('creativePreset').focus({preventScroll:true});status(preset.name+' loaded. '+preset.description);});
  document.addEventListener('toggle',e=>{const help=e.target;if(!help.matches?.('.vocal-stage-help'))return;if(help.open)vocalHelpOpen.add(help.dataset.vocalHelp);else vocalHelpOpen.delete(help.dataset.vocalHelp);},true);
  document.addEventListener('toggle',e=>{const detail=e.target;if(!detail.matches?.('[data-broiler-details]'))return;if(detail.open)broilerDetailsOpen.add(detail.dataset.broilerDetails);else broilerDetailsOpen.delete(detail.dataset.broilerDetails);},true);
  document.addEventListener('toggle',e=>{const detail=e.target;if(!detail.matches?.('[data-preamp-details]'))return;if(detail.open)preampDetailsOpen.add(detail.dataset.preampDetails);else preampDetailsOpen.delete(detail.dataset.preampDetails);},true);
  document.addEventListener('toggle',e=>{if(e.target.id==='compressorAdvanced')compressorAdvancedOpen=e.target.open;},true);
  $('clipControls').addEventListener('change',e=>{const key=e.target.dataset.clipParam,location=clipLocation();if(!key||!location)return;remember();const c=location.clip,asset=assetMap[c.assetId],duration=asset?asset.left.length/asset.sampleRate:120,value=e.target.type==='checkbox'?e.target.checked:e.target.type==='text'?e.target.value:Number(e.target.value);if(key==='name')c.name=value.trim().slice(0,80)||'Untitled clip';else if(key==='start')c.start=num(value-1,0,state.lengthBars*4-c.length);else if(key==='length'){c.length=num(value,1/64,state.lengthBars*4-c.start);c.fadeIn=Math.min(c.fadeIn,c.length/2);c.fadeOut=Math.min(c.fadeOut,c.length/2);}else if(key==='sourceStart'){c.sourceStart=num(value,0,c.sourceEnd-1/asset.sampleRate);c.sourceOffset=0;}else if(key==='sourceEnd'){c.sourceEnd=num(value,c.sourceStart+1/asset.sampleRate,duration);c.sourceOffset=0;}else if(key==='rate')c.rate=num(value,.125,8);else if(key==='transpose')c.transpose=Math.round(num(value,-48,48));else if(key==='sourceOffset')c.sourceOffset=num(value,0,c.type==='notes'?c.pattern.lengthBeats:Math.max(0,c.sourceEnd-c.sourceStart));else if(key==='gain')c.gain=num(value,0,2);else if(key==='fadeIn'||key==='fadeOut')c[key]=num(value,0,c.length/2);else c[key]=value;changed({arrangement:true,inspector:true});});
  for(const id of ['ruler','playhead']){const element=$(id);element.addEventListener('pointerdown',beginSeek);element.addEventListener('pointermove',moveSeek);element.addEventListener('pointerup',endSeek);element.addEventListener('pointercancel',endSeek);element.addEventListener('lostpointercapture',endSeek);}
  $('playButton').addEventListener('click',transportStart);$('pauseButton').addEventListener('click',pause);$('stopButton').addEventListener('click',stop);$('panicButton').addEventListener('click',()=>panic());$('recordButton').addEventListener('click',startRecording);
  $('tempo').addEventListener('change',()=>{remember();state.tempo=num($('tempo').value,40,240);$('tempo').value=state.tempo;host.setTempo(state.tempo);changed({arrangement:true});renderTransport();});
  $('loopButton').addEventListener('click',toggleLoop);
  $('returnStartButton').addEventListener('click',()=>seekTo(0));$('previousBarButton').addEventListener('click',()=>stepBar(-1));$('nextBarButton').addEventListener('click',()=>stepBar(1));$('goEndButton').addEventListener('click',()=>seekTo(state.lengthBars*4));
  $('loopStartButton').addEventListener('click',()=>seekTo(state.loopStart));$('loopEndButton').addEventListener('click',()=>seekTo(state.loopEnd));$('restartButton').addEventListener('click',restart);
  $('loopSelectionButton').addEventListener('click',loopSelection);$('followButton').addEventListener('click',toggleFollow);
  $('openPositionButton').addEventListener('click',openPosition);$('closePosition').addEventListener('click',()=>$('positionDialog').close());$('positionApply').addEventListener('click',applyPosition);
  $('positionDialog').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyPosition();}});for(const id of ['positionBar','positionBeat','positionTick'])$(id).addEventListener('input',updatePositionTime);
  $('timelineScroll').addEventListener('wheel',()=>{followUntil=performance.now()+3000;},{passive:true});$('timelineScroll').addEventListener('touchstart',()=>{followUntil=performance.now()+3000;},{passive:true});
  $('metronomeButton').addEventListener('click',()=>{remember();state.master.metronome=!state.master.metronome;changed();renderTransport();});
  $('projectName').addEventListener('change',()=>{remember();state.name=$('projectName').value.trim().slice(0,80)||'Untitled service';changed();});
  $('undoButton').addEventListener('click',undo);$('redoButton').addEventListener('click',redo);$('saveButton').addEventListener('click',saveProject);
  $('openButton').addEventListener('click',()=>{$('projectFile').value='';$('projectFile').click();});$('projectFile').addEventListener('change',()=>openProject($('projectFile').files[0]));
  $('newButton').addEventListener('click',()=>replaceState(S.defaultState(),{message:'Eight empty tracks. Prep starts here.'}));
  $('starterButton').addEventListener('click',()=>replaceState(S.demoState(),{message:'The first service is prepared. Press Play.'}));
  $('importButton').addEventListener('click',()=>{$('audioFile').value='';$('audioFile').click();});$('audioFile').addEventListener('change',()=>importAudio($('audioFile').files[0]));
  $('splitButton').addEventListener('click',splitClip);$('duplicateButton').addEventListener('click',duplicateClip);$('deleteClipButton').addEventListener('click',removeClip);
  $('zoom').addEventListener('input',()=>{fitInitial=false;state.view.zoom=Number($('zoom').value);renderArrangement();scheduleAutosave();});
  function fitTimeline() { state.view.zoom=Math.max(5,Math.min(100,$('timelineScroll').clientWidth/(state.lengthBars*4)));renderArrangement();scheduleAutosave(); }
  $('fitButton').addEventListener('click',()=>{fitInitial=true;fitTimeline();});$('snap').addEventListener('change',()=>{state.view.snap=Number($('snap').value);scheduleAutosave();});
  $('lengthBars').addEventListener('change',()=>{remember();state.lengthBars=Math.round(num($('lengthBars').value,1,64));state=S.normalize(state);changed({arrangement:true,inspector:true});if(!transportLocked()&&(engine.getMeters().beat||0)>state.lengthBars*4)seekTo(state.lengthBars*4);renderTransport();if(fitInitial)fitTimeline();});
  $('loopStart').addEventListener('change',()=>{remember();state.loopStart=num((Number($('loopStart').value)-1)*4,0,state.loopEnd-.25);changed({arrangement:true});});$('loopEnd').addEventListener('change',()=>{remember();state.loopEnd=num((Number($('loopEnd').value)-1)*4,state.loopStart+.25,state.lengthBars*4);changed({arrangement:true});});

  $('browseInstrumentButton').addEventListener('click',()=>openInstrumentBrowser());$('openInstrumentButton').addEventListener('click',()=>openExisting());$('closeInstrument').addEventListener('click',closeInstrument);$('instrumentDialog').addEventListener('cancel',()=>{if(frameTrack)engine.clearAudition(frameTrack);frameTrack=null;});
  $('instrumentBackButton').addEventListener('click',()=>openInstrumentBrowser(browserTrack??state.selectedTrack));
  $('unloadInstrumentButton').addEventListener('click',()=>{const id=frameTrack,t=state.tracks.find(t=>t.id===id);if(!t)return;remember();host.unload(id);engine.clearAudition(id);frames.get(id)?.remove();frames.delete(id);openedApps.delete(id);loadOperations.set(id,(loadOperations.get(id)||0)+1);t.instrument=null;t.instrumentLive=false;frameTrack=null;changed({arrangement:true,rack:true});openInstrumentBrowser(state.tracks.indexOf(t));status('Instrument unloaded. Its recorded clips remain in the arrangement.');});
  $('trackName').addEventListener('change',()=>{remember();track().name=$('trackName').value.trim().slice(0,80)||'Track '+(state.selectedTrack+1);changed({arrangement:true,mixer:true,rack:true});});$('trackColor').addEventListener('change',()=>{remember();track().color=$('trackColor').value;changed({arrangement:true,mixer:true,rack:true});});
  $('instrumentLive').addEventListener('change',()=>{remember();track().instrumentLive=$('instrumentLive').checked;changed();if(engine.getMeters().playing&&track().instrument){if(track().instrumentLive){const t=track(),generation=lifecycle;ensureInstrument(t).then(async ready=>{if(ready&&generation===lifecycle&&t.instrumentLive&&engine.getMeters().playing){await host.command(t.id,'prepare');if(generation===lifecycle&&t.instrumentLive&&engine.getMeters().playing)fireCommand(t.id,'start');}}).catch(e=>status(e.message));}else fireCommand(track().id,'stop');}});
  $('uploadAppButton').addEventListener('click',()=>{$('appFile').value='';$('appFile').click();});$('appFile').addEventListener('change',async()=>{const file=$('appFile').files[0];if(!file)return;if(file.size>S.LIMITS.appHtmlBytes){status('Choose a self-contained instrument HTML smaller than 36 MiB.');return;}const generation=lifecycle;try{const html=await file.text();if(generation!==lifecycle)return;const id='custom-'+S.uid('app').slice(-24).replace(/[^a-z0-9_-]/gi,'');selectedTrack(browserTrack??state.selectedTrack);await ensureInstrument(track(),{open:true,replace:true,descriptor:{id,name:file.name.replace(/\.html?$/i,''),html}});}catch(e){status(e.message);}});
  $('loadAppUrlButton').addEventListener('click',()=>{try{const url=new URL($('customAppUrl').value,location.href);if(location.protocol==='file:'||url.origin!==location.origin||!['http:','https:'].includes(url.protocol))throw Error('Choose an instrument URL on this same site. For offline apps, upload its HTML.');selectedTrack(browserTrack??state.selectedTrack);const id='custom-'+S.uid('app').slice(-24).replace(/[^a-z0-9_-]/gi,'');ensureInstrument(track(),{open:true,replace:true,descriptor:{id,name:url.pathname.split('/').filter(Boolean).pop()||'New instrument',url:url.href}}).catch(e=>status(e.message));}catch(e){status(e.message);}});
  $('closeEffect').addEventListener('click',()=>$('effectDialog').close());$('exportButton').addEventListener('click',()=>{$('exportSummary').textContent='Stereo PCM WAV · 48 kHz · 16 bit';$('exportDialog').showModal();});$('closeExport').addEventListener('click',()=>$('exportDialog').close());$('renderButton').addEventListener('click',renderExport);$('cancelExport').addEventListener('click',()=>exportAbort?.abort());$('exportDialog').addEventListener('cancel',e=>{if(exportAbort){e.preventDefault();exportAbort.abort();}});
  const showHelp=()=>$('helpDialog').showModal();$('helpButton').addEventListener('click',showHelp);$('footerHelp').addEventListener('click',showHelp);$('closeHelp').addEventListener('click',()=>$('helpDialog').close());
  $('autosaveEnabled').addEventListener('change',()=>{recovery=$('autosaveEnabled').checked;try{localStorage.setItem('loom-recovery-enabled',recovery?'1':'0');if(!recovery)localStorage.removeItem('loom-session-v1');}catch(_){}scheduleAutosave();status(recovery?'Browser recovery enabled when storage is available. Save a project to keep large sessions.':'Browser recovery disabled. Save projects to keep your work.');});
  document.addEventListener('keydown',e=>{
    if(e.defaultPrevented)return;
    const dialog=document.querySelector('dialog[open]'),editing=e.target.closest('input,select,textarea,[contenteditable=true]'),nativeButton=e.target.closest('button,a,summary');
    if(dialog||editing)return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
    if(e.ctrlKey||e.metaKey)return;
    if(e.key==='Escape'){e.preventDefault();panic();return;}
    if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();stepBar(e.key==='ArrowLeft'?-1:1);return;}
    if(e.altKey)return;
    if(['Home','End'].includes(e.key)){e.preventDefault();seekTo(e.key==='Home'?0:state.lengthBars*4);return;}
    if(nativeButton)return;
    if(e.code==='Space'&&!e.repeat&&!e.target.closest('.clip')){e.preventDefault();e.shiftKey?restart():togglePlayback();return;}
    if(e.key==='Enter'&&!e.repeat){e.preventDefault();stop();return;}
    if(!e.repeat){
      const key=e.key.toLowerCase();
      if(key==='m'){e.preventDefault();openMarker();return;}
      if(key==='g'){e.preventDefault();openPosition();return;}
      if(key==='f'){e.preventDefault();toggleFollow();return;}
      if(key==='l'){e.preventDefault();e.shiftKey?loopSelection():toggleLoop();return;}
      if(e.key==='['||e.key===']'){e.preventDefault();seekTo(e.key==='['?state.loopStart:state.loopEnd);return;}
    }
    if((e.key==='Delete'||e.key==='Backspace')&&selectedClip){e.preventDefault();removeClip();}
    if(selectedClip){if(e.key.toLowerCase()==='d'){e.preventDefault();duplicateClip();}if(e.key.toLowerCase()==='s'){e.preventDefault();splitClip();}}
  });
  $('playhead').addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();seekTo((engine.getMeters().beat||0)+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?4:state.view.snap||.25));}
  });
  function animate(now) {
    cpuInspector?.setVisible(!serviceController?.isOpen && !document.hidden && (!cpuInspector.element.open || !document.querySelector('dialog[open]')));
    if(serviceController?.isOpen){requestAnimationFrame(animate);return;}
    if(now-meterTime>45){
      meterTime=now;const m=engine.getMeters(),beat=m.beat||0;
      updateText($('clock'),positionLabel(beat));
      updateText($('clockMode'),m.recordStage==='count-in'?'COUNT-IN / '+Math.ceil(m.countInBeatsRemaining||0)+' BEATS':m.recordStage==='waiting'?'PRE-ROLL / WAITING FOR PUNCH IN':m.recording?'RECORDING / '+(m.recordSeconds||0).toFixed(1)+' SECONDS':recordFinishing?'FINISHING TAKE':recordPending?'PREPARING RECORDING':transportPending?'PREPARING PLAYBACK':m.playing?'PLAYING / '+(m.mode||'WEB AUDIO').toUpperCase():m.ended?'SESSION END / READY TO RESTART':'PAUSED / READY FOR SERVICE');
      renderPlayhead();renderTrackEqState(m);renderMicrophone(m.microphone);renderVocalMeters(m);renderBroilerMeters(m);renderCompressorMeters(m);renderPreampMeters(m);renderTapeMeters(m);renderBusMeters(m);renderUtilityMeters(m);renderCreativeMeters(m);automationEditor?.tick();pianoRoll?.tick();
      if($('audioSettingsDialog').open&&now-audioDiagnosticsTime>250){audioDiagnosticsTime=now;renderAudioDiagnostics();}
      const master=m.master||{},level=Math.max(master.rmsLeft||0,master.rmsRight||0,master.rms||0);
      updateStyle($('masterLeft'),'width',Math.min(100,Math.sqrt(master.rmsLeft||master.rms||0)*140)+'%');updateStyle($('masterRight'),'width',Math.min(100,Math.sqrt(master.rmsRight||master.rms||0)*140)+'%');updateText($('masterDb'),level>1e-5?(20*Math.log10(level)).toFixed(0)+' dB':'−∞');
      for(let i=0;i<8;i++){const el=$('meter-'+i);if(el)updateStyle(el,'height',Math.min(100,Math.sqrt(m.tracks?.[i]?.rms||0)*135)+'%');}
      const mode=String(m.playing)+'/'+String(m.recording)+'/'+String(m.ended)+'/'+String(m.recordStage);
      if($('playButton').dataset.transportMode!==mode){$('playButton').dataset.transportMode=mode;renderTransport();}
      if(state.view.follow&&m.playing&&!seekDrag&&!drag&&now>=followUntil){
        const viewport=$('timelineScroll'),x=beat*state.view.zoom;
        if(x<viewport.scrollLeft||x>viewport.scrollLeft+viewport.clientWidth*.85)viewport.scrollLeft=Math.max(0,x-viewport.clientWidth*.2);
      }
    }
    requestAnimationFrame(animate);
  }

  function clearEffectAutomation(t,index){
    const prefix='fx:'+index+':';
    t.automation=t.automation.filter(lane=>!lane.target.startsWith(prefix));
    for(const lfo of state.lfos||[])lfo.routes=lfo.routes.filter(route=>route.ownerId!==t.id||!route.target.startsWith(prefix));
  }
  function swapEffectAutomation(t,a,b){if(automationEditor&&t===effectOwner()){const parts=automationEditor.target.split(':');if(parts[0]==='fx'&&[a,b].includes(Number(parts[1]))){parts[1]=String(Number(parts[1])===a?b:a);automationEditor.target=parts.join(':');}}for(const lane of t.automation){const parts=lane.target.split(':');if(parts[0]!=='fx')continue;const slot=Number(parts[1]);if(slot===a||slot===b){parts[1]=String(slot===a?b:a);lane.target=parts.join(':');}}
    for(const lfo of state.lfos||[])for(const route of lfo.routes){if(route.ownerId!==t.id)continue;const parts=route.target.split(':');if(parts[0]!=='fx')continue;const slot=Number(parts[1]);if(slot===a||slot===b){parts[1]=String(slot===a?b:a);route.target=parts.join(':');}}
  }
  function renderRecordingSetup(){
    const r=state.recording,locked=transportLocked();
    $('countInBars').value=String(r.countInBars);$('punchButton').setAttribute('aria-pressed',String(r.punchEnabled));
    for(const [id,value]of [['punchStart',r.punchStart],['punchEnd',r.punchEnd]]){const el=$(id);if(document.activeElement!==el)el.value=value/4+1;el.max=state.lengthBars+1;el.disabled=locked||!r.punchEnabled;}
    for(const id of ['countInBars','punchButton','punchFromLoop'])$(id).disabled=locked;
    $('recordingSetupSummary').textContent=r.punchEnabled?'One pass · record bars '+(r.punchStart/4+1).toFixed(2).replace(/\.00$/,'')+'–'+(r.punchEnd/4+1).toFixed(2).replace(/\.00$/,''):r.countInBars?r.countInBars+' bar'+(r.countInBars===1?'':'s')+' of clicks before a new take.':'A little warning before service begins.';
  }
  function renderMicrophone(current) {
    const mic=current||engine.getMicrophoneStatus(),r=state.recording,locked=transportLocked(),monitored=state.tracks.find(t=>t.id===mic.trackId),target=(mic.enabled||mic.pending||mic.recording)&&monitored?monitored:track();
    const live=mic.enabled,pending=mic.pending;
    updateText($('microphoneState'),pending?'CONNECTING':mic.recording?'RECORDING':live?'MONITOR ON':mic.active?'INPUT ON':'OFF');
    updateClass($('microphoneState'),'active',live||mic.recording);
    updateText($('microphoneMonitorButton'),pending&&!recordPending?'Cancel connection':live?'Monitoring off':'Monitor microphone');
    updateAttribute($('microphoneMonitorButton'),'aria-pressed',String(live));
    updateProperty($('microphoneMonitorButton'),'disabled',(recordPending||recordFinishing)&&!live);
    updateText($('microphoneRouteLabel'),'TRACK '+String(state.tracks.indexOf(target)+1).padStart(2,'0')+' · '+target.name);
    updateProperty($('microphoneRouteButton'),'hidden',!live||mic.trackId===track().id);
    updateText($('microphoneRouteButton'),'Move monitoring to track '+String(state.selectedTrack+1).padStart(2,'0'));
    updateProperty($('microphoneRouteButton'),'disabled',locked||pending);
    for(const [id,value]of [['microphoneInputGain',r.micInputGainDb],['microphoneCompensation',r.micCompensation],['microphoneOffset',r.micOffsetMs]]){const input=$(id);if(document.activeElement!==input)updateProperty(input,'value',value);updateProperty(input,'disabled',locked||(id==='microphoneOffset'&&r.micCompensation==='off'));}
    updateProperty($('microphoneLaterButton'),'disabled',locked||r.micCompensation==='off'||r.micOffsetMs<=-500);
    updateProperty($('microphoneEarlierButton'),'disabled',locked||r.micCompensation==='off'||r.micOffsetMs>=500);
    updateProperty($('recordSource'),'disabled',locked);
    updateText($('microphoneCorrectionLabel'),mic.recording?'CORRECTION APPLIED TO THIS TAKE':'CORRECTION FOR NEW TAKES');
    updateText($('microphoneGainValue'),(r.micInputGainDb>0?'+':'')+r.micInputGainDb.toFixed(1)+' dB');
    updateText($('microphoneOffsetLabel'),r.micCompensation==='manual'?'OFFSET (MS)':'EXTRA TRIM (MS)');
    const latency=mic.latency||engine.getMicrophoneLatency(),compensation=Number(latency.compensationMs)||0;
    updateText($('microphoneTimingSummary'),latency.mode==='off'?'Off · timing unchanged':!engine.context&&latency.mode==='auto'?'Auto · estimate after audio starts':(latency.mode==='auto'?(latency.estimateComplete?'Estimated · ':'Partial estimate · '):'Manual · ')+(Math.abs(compensation)<.05?'no shift':Math.abs(compensation).toFixed(1)+' ms '+(compensation>0?'earlier':'later')));
    updateText($('microphoneLatencyDetails'),!engine.context?'Device timing appears after audio starts.':(latency.reportedInput?(latency.inputMs||0).toFixed(1)+' ms input':'Input delay unreported')+' · '+(latency.reportedOutput?(latency.outputMs||0).toFixed(1)+' ms '+(latency.outputComplete===false?'partial output':'output'):'Output delay unreported')+' · '+(latency.processingMs||0).toFixed(1)+' ms engine block (not added)');
    const peak=Math.max(0,Number(mic.inputPeak)||0),db=peak>1e-5?Math.max(-90,20*Math.log10(peak)):-90,meter=$('microphoneMeterFill').closest('.mic-input-meter');
    updateStyle($('microphoneMeterFill'),'width',Math.min(100,Math.max(0,(db+60)/60*100))+'%');
    updateText($('microphoneMeterValue'),db<=-90?'−∞ dB':db.toFixed(1)+' dB');updateAttribute(meter,'aria-valuenow',String(Math.min(0,db)));updateClass(meter,'clipping',peak>=.98);
    const prefs=engine.getAudioSettings(),device=audioDevices?.inputs.find(input=>input.deviceId===prefs.inputDeviceId);
    updateText($('microphoneInterfaceSummary'),(mic.interface?.inputLabel||device?.label||(prefs.inputDeviceId==='default'?'System input':'Selected interface'))+' · '+(prefs.inputChannel==='stereo'?'stereo':'input '+prefs.inputChannel+' / mono')+' · '+({live:'Live',balanced:'Balanced',stable:'Stable'}[prefs.latencyProfile])+' latency');
    updateProperty($('microphonePracticeButton'),'disabled',locked||audioDeviceBusy);updateProperty($('microphoneVocalPracticeButton'),'disabled',locked||audioDeviceBusy);
  }

  const audioFields=['audioInputDevice','audioInputChannel','audioOutputDevice','audioSampleRate','audioLatencyProfile'];
  function readAudioSettingsForm(){return {inputDeviceId:$('audioInputDevice').value||'default',outputDeviceId:$('audioOutputDevice').value||'default',inputChannel:$('audioInputChannel').value,sampleRate:$('audioSampleRate').value==='auto'?'auto':Number($('audioSampleRate').value),latencyProfile:$('audioLatencyProfile').value};}
  function audioSettingsDirty(){const current=engine.getAudioSettings(),draft=readAudioSettingsForm();return Object.keys(current).some(key=>current[key]!==draft[key]);}
  function audioOperationBlocked(){
    if(recordPending||recordFinishing||engine.recordingBusy||engine.isRecording)return 'Finish or cancel the current take before changing the interface.';
    if(transportPending)return 'Wait for playback to finish preparing before changing the interface.';
    if(exportAbort||transferAbort||noteWorkflow?.controller||engine.getAudioDiagnostics().exportBusy)return 'Finish or cancel the audio render or transfer before changing the interface.';
    if(audioDeviceBusy)return 'Wait for the device list or browser permission request.';
    return '';
  }
  function interfaceMessage(message,error=false){$('audioInterfaceStatus').textContent=message;$('audioInterfaceStatus').classList.toggle('error',error);}
  function deviceOptions(id,devices,selected,label){
    const select=$(id),seen=new Set(['default']);let html='<option value="default">System default '+label+'</option>';
    for(const [index,device] of (devices||[]).entries()){if(seen.has(device.deviceId))continue;seen.add(device.deviceId);html+='<option value="'+escape(device.deviceId)+'">'+escape(device.label||('Audio '+label+' '+(index+1)+' / allow access to name it'))+'</option>';}
    if(selected!=='default'&&!seen.has(selected))html+='<option value="'+escape(selected)+'">Previously selected '+label+' / not in device list</option>';
    select.innerHTML=html;select.value=selected||'default';
  }
  function renderAudioDeviceChoices({restore=false}={}){
    const prefs=restore?engine.getAudioSettings():readAudioSettingsForm(),supported=audioDevices?.outputSelectionSupported??engine.getAudioDiagnostics().outputSelectionSupported;
    deviceOptions('audioInputDevice',audioDevices?.inputs,prefs.inputDeviceId,'input');deviceOptions('audioOutputDevice',audioDevices?.outputs,supported?prefs.outputDeviceId:'default','output');
    $('audioInputChannel').value=prefs.inputChannel;$('audioSampleRate').value=String(prefs.sampleRate);$('audioLatencyProfile').value=prefs.latencyProfile;
    $('audioOutputDevice').disabled=!supported||audioSettingsBusy;
    $('audioOutputHint').textContent=supported?'Select the interface you use for headphones. System default follows your system output.':'Output selection is unavailable in this browser. Choose your interface in system sound settings.';
    $('audioDeviceHint').textContent=audioDevices?.permission==='granted'?'Device names are available. Refresh again after connecting or unplugging an interface.':audioDevices?.permission==='unavailable'?'Device access is unavailable. Use a browser with microphone access on HTTPS or the standalone HTML.':'Refresh asks for microphone access to reveal device names. Temporary access is released after the list is read.';
    renderAudioProfileHint();renderAudioDiagnostics();renderMicrophone();
  }
  function renderAudioProfileHint(){
    $('audioProfileHint').textContent={live:'Live requests the browser’s lowest latency (1 ms target). Your interface and browser choose the actual timing.',balanced:'Balanced requests the browser’s interactive latency. A little more room for a busy session.',stable:'Stable requests balanced latency for heavier sessions. Expect more delay while playing through effects.'}[$('audioLatencyProfile').value];
  }
  async function refreshAudioDevices({requestPermission=false}={}){
    if(audioDeviceBusy||audioSettingsBusy)return;const operation=++audioDeviceOperation;audioDeviceBusy=true;renderAudioDiagnostics();
    if(requestPermission)interfaceMessage('Reading the device list. Allow microphone access if your browser asks.');
    try{const next=await engine.enumerateAudioDevices({requestPermission});if(operation!==audioDeviceOperation)return;audioDevices=next;renderAudioDeviceChoices();if(requestPermission)interfaceMessage(next.permission==='unavailable'?'Microphone device access is unavailable in this browser.':'Devices refreshed. Choose a connection and Apply settings.');}
    catch(e){if(operation===audioDeviceOperation)interfaceMessage(e.name==='NotAllowedError'?'Microphone access was denied. Allow it in the browser’s site settings, then refresh again.':e.message,true);}
    finally{if(operation===audioDeviceOperation){audioDeviceBusy=false;renderAudioDiagnostics();}}
  }
  function openAudioSettings({practice=false}={}){
    if(audioSettingsBusy)return;renderAudioDeviceChoices({restore:true});interfaceMessage(audioOperationBlocked()||'Apply stops playback and monitoring. Instrument settings, clips, and effect racks stay in your session.');
    if(!$('audioSettingsDialog').open)$('audioSettingsDialog').showModal();refreshAudioDevices();
    requestAnimationFrame(()=>{if(practice){$(practice==='utility'?'utilityPracticeSection':practice==='vocal'?'vocalPracticeSection':'ampPracticeSection').scrollIntoView({block:'nearest'});$(practice==='utility'?'utilityPracticeButton':practice==='vocal'?'vocalPracticeButton':'guitarPracticeButton').focus({preventScroll:true});}else $('audioInputDevice').focus({preventScroll:true});});
  }
  function renderAudioDiagnostics(){
    const d=engine.getAudioDiagnostics(),has=value=>typeof value==='number'&&Number.isFinite(value),ms=value=>has(value)?value.toFixed(1)+' ms':'Unreported',blocked=audioOperationBlocked();
    $('audioEngineBadge').textContent=!d.active?'AUDIO NOT STARTED':d.mode==='worklet'?'AUDIOWORKLET / 128 FRAMES':d.mode==='fallback'?'FALLBACK AUDIO ENGINE':String(d.mode||'Web Audio').toUpperCase();
    $('audioEngineBadge').classList.toggle('fallback',d.mode==='fallback');
    $('audioRoundTripValue').textContent=d.roundTripComplete&&has(d.estimatedRoundTripMs)?'~ '+d.estimatedRoundTripMs.toFixed(1)+' ms':d.active?'Unknown':'—';
    $('audioRoundTripHint').textContent=!d.active?'Start monitoring to read the available device timings.':d.roundTripComplete?'Estimate from reported capture, browser buffer, and output timings.':has(d.estimatedRoundTripMs)?'Known components: '+d.estimatedRoundTripMs.toFixed(1)+' ms. Missing device timings prevent a complete estimate.':'Your browser does not expose enough timing information.';
    $('audioActualSampleRate').textContent=has(d.sampleRate)?(d.sampleRate/1000).toFixed(d.sampleRate%1000?1:0)+' kHz':'—';
    $('audioRateHint').textContent=d.sampleRateFallback?'Requested rate unavailable; the browser chose this rate.':d.captureSampleRate&&d.captureSampleRate!==d.sampleRate?'Capture runs at '+(d.captureSampleRate/1000).toFixed(1)+' kHz; the browser converts it.':'Negotiated by the browser.';
    $('audioCaptureLatency').textContent=ms(d.captureLatencyMs);$('audioBaseLatency').textContent=ms(d.baseLatencyMs);$('audioOutputLatency').textContent=ms(d.outputLatencyMs);
    $('audioProcessingLatency').textContent=has(d.processingMs)?d.processingMs.toFixed(1)+' ms / '+d.processingFrames+' frames':'—';
    $('audioProcessingHint').textContent=d.mode==='fallback'?'ScriptProcessor fallback. AudioWorklet usually offers better live response.':'Block granularity, not an extra measured delay. AudioWorklet uses 128 frames.';
    const notes=['Reported timings are estimates, not a measured cable loopback. Recording alignment moves a completed take; it does not reduce live delay.'];
    if(d.sinkFallback)notes.push('The saved output is unavailable; this session is using system default output.');
    if(d.actualInputChannel==='1'&&d.settings.inputChannel==='stereo'&&d.inputChannels===1)notes.push('This input is mono; Input 1 is feeding both sides.');
    if(d.echoCancellation||d.noiseSuppression||d.autoGainControl)notes.push('The input reports browser voice processing. Your device may be ignoring the unprocessed-audio request.');
    $('audioDiagnosticNotes').textContent=notes.join(' ');
    const t=track(),slot=t.effects.findIndex(f=>f?.type==='broiler'),vocalSlot=t.effects.findIndex(f=>f?.type==='glaze');$('vocalPracticeTrack').textContent='TRACK '+String(state.selectedTrack+1).padStart(2,'0')+' · '+t.name+' · '+(vocalSlot>=0?'existing GLAZE / insert '+(vocalSlot+1):t.effects.some(f=>!f)?'empty insert ready':'five inserts occupied');$('ampPracticeTrack').textContent='TRACK '+String(state.selectedTrack+1).padStart(2,'0')+' · '+t.name+' · '+(slot>=0?'existing BROILER / insert '+(slot+1):t.effects.some(f=>!f)?'empty insert ready':'five inserts occupied');
    const utilitySlot=t.effects.findIndex(f=>f?.type==='scales');$('utilityPracticeTrack').textContent='TRACK '+String(state.selectedTrack+1).padStart(2,'0')+' · '+t.name+' · '+(utilitySlot>=0?'existing SCALES / insert '+(utilitySlot+1):t.effects.some(f=>!f)?'empty insert ready':'five inserts occupied');
    for(const id of ['applyAudioSettings','guitarPracticeButton','bassPracticeButton','vocalPracticeButton','utilityPracticeButton'])$(id).disabled=audioSettingsBusy||audioDeviceBusy||ampPracticeBusy||!!blocked;
    $('applyAudioSettings').textContent=audioSettingsBusy?'Applying…':'Apply settings';
    $('refreshAudioDevices').disabled=audioSettingsBusy||audioDeviceBusy||ampPracticeBusy||recordPending||recordFinishing||engine.recordingBusy;
    $('refreshAudioDevices').textContent=audioDeviceBusy?'Reading devices…':'Refresh devices';
    $('closeAudioSettings').disabled=audioSettingsBusy;
    $('audioSettingsDialog').setAttribute('aria-busy',String(audioSettingsBusy));
    for(const id of audioFields)$(id).disabled=audioSettingsBusy||(id==='audioOutputDevice'&&!d.outputSelectionSupported);
  }
  async function applyInterfaceSettings(){
    const blocked=audioOperationBlocked();if(audioSettingsBusy||blocked){if(blocked)interfaceMessage(blocked,true);return;}
    let prefs;try{prefs=engine.validateAudioSettings(readAudioSettingsForm());}catch(e){interfaceMessage(e.message,true);return;}
    const generation=lifecycle,operation=++audioSettingsOperation;audioSettingsBusy=true;renderAudioDiagnostics();renderTransport();interfaceMessage('Stopping playback and reconnecting the audio interface…');
    try{
      await halt();if(generation!==lifecycle||operation!==audioSettingsOperation)throw new DOMException('Interface change cancelled.','AbortError');
      const result=await engine.applyAudioSettings(prefs,{beforeRestart:async()=>{
        const loaded=state.tracks.filter(t=>t.instrument&&frames.has(t.id));
        const captured=await Promise.all(loaded.map(async t=>{
          let timer;try{const snapshot=await Promise.race([host.snapshot(t.id),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Could not preserve '+t.name+' in time. Finish its current operation before changing the interface.')),8000);})]);if(!snapshot)throw Error('Could not preserve '+t.name+'. Reopen its instrument before changing the interface.');return {id:t.id,snapshot};}finally{clearTimeout(timer);}
        }));
        if(generation!==lifecycle||operation!==audioSettingsOperation)throw new DOMException('Interface change cancelled.','AbortError');
        for(const {id,snapshot}of captured){const target=state.tracks.find(t=>t.id===id);if(target?.instrument){target.instrument.snapshot=snapshot;noteWorkflow?.captureSnapshot(id,snapshot);}}
        for(const timer of snapshotTimers.values())clearTimeout(timer);snapshotTimers.clear();clearAllFrames();notePlayback.panic();
      }});
      if(generation!==lifecycle||operation!==audioSettingsOperation)return;
      host.setTempo(state.tempo);scheduleAutosave();renderAudioDeviceChoices({restore:true});renderAll();
      const message=(result.restarted?'Audio engine restarted. ':'Audio settings applied. ')+'Your session is preserved. Monitoring is off; use Monitor microphone, BROILER, GLAZE, or SCALES to reconnect.';
      interfaceMessage(message);status(message);
    }catch(e){if(operation===audioSettingsOperation){interfaceMessage(e.message,true);status(e.message);}}
    finally{if(operation===audioSettingsOperation){audioSettingsBusy=false;renderAudioDiagnostics();renderTransport();}}
  }
  async function startAmpPractice(kind){
    const blocked=audioOperationBlocked();if(audioSettingsBusy||ampPracticeBusy||blocked){if(blocked)interfaceMessage(blocked,true);return;}
    if(audioSettingsDirty()){interfaceMessage('Apply your interface changes first, then choose Guitar or Bass.',true);return;}
    const t=track(),generation=lifecycle,existing=t.effects.findIndex(f=>f?.type==='broiler'),slot=existing>=0?existing:t.effects.findIndex(f=>!f);
    if(slot<0){interfaceMessage('This track has five effects already. Choose another track or free an insert before adding BROILER.',true);return;}
    if(existing<0){const def=effectById('broiler'),preset=def.presets.find(p=>p.id===(kind==='bass'?'house-bass':'glassware'));remember();t.effects[slot]={type:'broiler',params:{...clone(preset.params),stereo:'mono'}};changed({arrangement:true,mixer:true,rack:true,automation:true});}
    rackTarget='track';selectedSlot=slot;renderRack();renderEffectEditor();automationEditor?.render();$('recordSource').value='microphone';$('micInputPanel').open=true;
    const operation=++microphoneOperation;ampPracticeBusy=true;renderAudioDiagnostics();interfaceMessage('Connecting the selected interface to '+t.name+' and BROILER…');
    try{const connected=await engine.setMicrophoneMonitoring(t.id,{enabled:true,gainDb:state.recording.micInputGainDb});if(generation!==lifecycle||operation!==microphoneOperation)return;
      if(!connected||!engine.getMicrophoneStatus().enabled){interfaceMessage('Input connection cancelled. Your amp is still in the rack.',true);return;}
      $('audioSettingsDialog').close();$('effectEditor').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
      status(t.mute?'BROILER is ready, but this track is muted. Unmute '+t.name+' to hear your input.':state.tracks.some(other=>other.solo)&&!t.solo?'BROILER is ready, but another track is soloed. Solo '+t.name+' or clear the other solo to hear your input.':'BROILER is ready on '+t.name+'. Play here or along with the arrangement; Record captures a dry take. Use headphones.');
    }catch(e){if(operation===microphoneOperation&&generation===lifecycle){const message=e.name==='NotAllowedError'?'Microphone access was denied. Allow it in your browser to play through BROILER.':e.message;interfaceMessage(message,true);status(message);}}finally{ampPracticeBusy=false;renderAudioDiagnostics();renderMicrophone();}
  }
  async function startVocalPractice(){
    const blocked=audioOperationBlocked();if(audioSettingsBusy||ampPracticeBusy||blocked){if(blocked)interfaceMessage(blocked,true);return;}
    if(audioSettingsDirty()){interfaceMessage('Apply your interface changes first, then choose Voice → GLAZE.',true);return;}
    const t=track(),generation=lifecycle,existing=t.effects.findIndex(f=>f?.type==='glaze'),slot=existing>=0?existing:t.effects.findIndex(f=>!f);
    if(slot<0){interfaceMessage('This track has five effects already. Choose another track or free an insert before adding GLAZE.',true);return;}
    if(existing<0){const def=effectById('glaze'),preset=def.presets.find(p=>p.id==='first-service');remember();t.effects[slot]={type:'glaze',params:clone(preset.params)};changed({arrangement:true,mixer:true,rack:true,automation:true});}
    rackTarget='track';selectedSlot=slot;renderRack();renderEffectEditor();automationEditor?.render();$('recordSource').value='microphone';$('micInputPanel').open=true;
    const operation=++microphoneOperation;ampPracticeBusy=true;renderAudioDiagnostics();interfaceMessage('Connecting the selected microphone to '+t.name+' and GLAZE…');
    try{const connected=await engine.setMicrophoneMonitoring(t.id,{enabled:true,gainDb:state.recording.micInputGainDb});if(generation!==lifecycle||operation!==microphoneOperation)return;
      if(!connected||!engine.getMicrophoneStatus().enabled){interfaceMessage('Input connection cancelled. Your vocal strip is still in the rack.',true);return;}
      $('audioSettingsDialog').close();$('effectEditor').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
      status(t.mute?'GLAZE is ready, but this track is muted. Unmute '+t.name+' to hear your voice.':state.tracks.some(other=>other.solo)&&!t.solo?'GLAZE is ready, but another track is soloed. Solo '+t.name+' or clear the other solo to hear your voice.':'GLAZE is ready on '+t.name+'. Sing here or along with the arrangement; Record captures a dry take. Use headphones.');
    }catch(e){if(operation===microphoneOperation&&generation===lifecycle){const message=e.name==='NotAllowedError'?'Microphone access was denied. Allow it in your browser to sing through GLAZE.':e.message;interfaceMessage(message,true);status(message);}}finally{ampPracticeBusy=false;renderAudioDiagnostics();renderMicrophone();}
  }
  async function startUtilityPractice(){
    const blocked=audioOperationBlocked();if(audioSettingsBusy||ampPracticeBusy||blocked){if(blocked)interfaceMessage(blocked,true);return;}
    if(audioSettingsDirty()){interfaceMessage('Apply your interface changes first, then choose Input → SCALES.',true);return;}
    const t=track(),generation=lifecycle,existing=t.effects.findIndex(f=>f?.type==='scales'),slot=existing>=0?existing:t.effects.findIndex(f=>!f);
    if(slot<0){interfaceMessage('This track has five effects already. Choose another track or free an insert before adding SCALES.',true);return;}
    if(existing<0){remember();t.effects[slot]={type:'scales',params:clone(effectById('scales').defaults)};changed({arrangement:true,mixer:true,rack:true,automation:true});}
    rackTarget='track';selectedSlot=slot;renderRack();renderEffectEditor();automationEditor?.render();$('recordSource').value='microphone';$('micInputPanel').open=true;
    const operation=++microphoneOperation;ampPracticeBusy=true;renderAudioDiagnostics();interfaceMessage('Connecting the selected interface to '+t.name+' and SCALES…');
    try{const connected=await engine.setMicrophoneMonitoring(t.id,{enabled:true,gainDb:state.recording.micInputGainDb});if(generation!==lifecycle||operation!==microphoneOperation)return;
      if(!connected||!engine.getMicrophoneStatus().enabled){interfaceMessage('Input connection cancelled. SCALES is still in the rack.',true);return;}
      $('audioSettingsDialog').close();$('effectEditor').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
      const p=t.effects[slot].params;
      status(p.bypass?'SCALES is bypassed. Disable Bypass to tune the monitored input.':p.tuner==='off'?'SCALES is ready. Switch Tuner on to read the monitored input.':p.mute==='on'?'SCALES is listening; its output is muted for quiet tuning.':t.mute?'SCALES is listening, but this track is muted. Unmute '+t.name+' to hear your input.':state.tracks.some(other=>other.solo)&&!t.solo?'SCALES is listening, but another track is soloed. Solo '+t.name+' or clear the other solo to hear your input.':'SCALES is ready on '+t.name+'. Pluck one clear note. Record captures a dry take; use headphones.');
    }catch(e){if(operation===microphoneOperation&&generation===lifecycle){const message=e.name==='NotAllowedError'?'Microphone access was denied. Allow it in your browser to tune through SCALES.':e.message;interfaceMessage(message,true);status(message);}}finally{ampPracticeBusy=false;renderAudioDiagnostics();renderMicrophone();}
  }
  async function setMicrophoneMonitor({move=false}={}) {
    const current=engine.getMicrophoneStatus(),enabled=move||!(current.enabled||current.pending),target=enabled?(current.recording?current.trackId:track().id):current.trackId||track().id;
    const operation=++microphoneOperation,generation=lifecycle;
    try {
      const connected=await engine.setMicrophoneMonitoring(target,{enabled,gainDb:state.recording.micInputGainDb});
      if(operation!==microphoneOperation||generation!==lifecycle)return;
      renderMicrophone();if(!connected)return;
      const t=state.tracks.find(t=>t.id===target);
      status(enabled?'Microphone monitoring → '+t.name+' → five effects → mixer. Use headphones.':'Microphone monitoring is off.'+(engine.getMicrophoneStatus().recording?' The dry take continues recording.':''));
    }catch(e){if(operation===microphoneOperation&&generation===lifecycle){renderMicrophone();status(e.name==='NotAllowedError'?'Microphone access was denied. Allow access in your browser to monitor or record.':e.message);}}
  }
  engine.onStatus=event=>{if(event.type==='microphone-status')renderMicrophone(event);else if(event.type==='audio-settings-changed'){renderMicrophone();if($('audioSettingsDialog').open)renderAudioDiagnostics();}else if(event.type==='audio-device-change'){if($('audioSettingsDialog').open)refreshAudioDevices();renderMicrophone();}else if(event.type==='error'||event.type==='microphone-disconnected'){status(event.message);if($('audioSettingsDialog').open)interfaceMessage(event.message,true);}};
  function renderClipActions(){const selected=clipLocation();for(const id of ['clipEditQuick','clipSplitQuick','clipDuplicateQuick','clipDeleteQuick','transferClipButton'])$(id).disabled=!selected||recordFinishing;$('clipActionSummary').textContent=selected?selected.clip.name+' · '+selected.track.name:'Select an audio or note clip to edit it.'; $('transferClipButton').hidden=selected?.clip.type==='notes'; noteWorkflow?.render();}
  function editSelectedClip(){if(!clipLocation())return;$('clipInspector').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});$('clip-name')?.focus({preventScroll:true});}
  function renderMarkers(){
    $('markerStrip').innerHTML=state.markers.map(m=>`<button class="timeline-marker" data-marker="${escape(m.id)}" style="left:${m.beat*state.view.zoom}px;--marker:${m.color}" title="${escape(m.name)} · ${positionLabel(m.beat)}"><i></i><span>${escape(m.name)}</span></button>`).join('');
    $('markerList').innerHTML=state.markers.length?state.markers.map(m=>`<div class="marker-chip" style="--marker:${m.color}"><button data-marker="${escape(m.id)}" title="Jump to this section"><i></i>${escape(m.name)}<span>${positionParts(m.beat).bar}</span></button><button data-edit-marker="${escape(m.id)}" class="marker-edit" aria-label="Edit ${escape(m.name)}">✎</button></div>`).join(''):'<span class="fineprint">Mark the courses. The second starter is apparently intentional.</span>';
    $('previousMarkerButton').disabled=!state.markers.length||transportLocked();$('nextMarkerButton').disabled=!state.markers.length||transportLocked();$('addMarkerButton').disabled=state.markers.length>=S.LIMITS.markers||transportLocked();
  }
  function openMarker(id=null){if(transportLocked())return;const m=state.markers.find(m=>m.id===id);markerEditing=m?.id||null;const beat=m?.beat??snap(engine.getMeters().beat||0),parts=positionParts(beat);$('markerName').value=m?.name||'';$('markerBar').value=parts.bar;$('markerBar').max=state.lengthBars+1;$('markerBeat').value=parts.beat+parts.tick/1000;$('markerColor').value=m?.color||track().color;$('deleteMarker').hidden=!m;$('markerDialog').showModal();$('markerName').focus();}
  function saveMarker(){if(transportLocked())return;const beat=num((num($('markerBar').value,1,state.lengthBars+1)-1)*4+num($('markerBeat').value,1,4.999)-1,0,state.lengthBars*4),name=$('markerName').value.trim().slice(0,60)||'Section '+(state.markers.length+1);remember();let m=state.markers.find(m=>m.id===markerEditing);if(m)Object.assign(m,{name,beat,color:$('markerColor').value});else if(state.markers.length<S.LIMITS.markers)state.markers.push({id:S.uid('marker'),name,beat,color:$('markerColor').value});state.markers.sort((a,b)=>a.beat-b.beat);$('markerDialog').close();changed({arrangement:true});status('A signpost has been planted. Click its name to visit.');}
  function jumpMarker(direction){if(transportLocked())return;const beat=engine.getMeters().beat||0,list=state.markers;if(!list.length)return;const m=direction<0?[...list].reverse().find(m=>m.beat<beat-.001)||list[0]:list.find(m=>m.beat>beat+.001)||list.at(-1);seekTo(m.beat);}

  const sampleReceivers=[
    {id:'fable',name:'STOCK · playable sample zones',maxSeconds:120,channels:2,description:'Create a playable sample zone; up to 64 zones share keyboard and velocity ranges.',targets:[{id:'new',name:'New sample zone',occupied:false}]},
    {id:'spool',name:'ROTISSERIE · tape loops',maxSeconds:30,channels:2,targets:Array.from({length:4},(_,id)=>({id,name:'Deck '+String.fromCharCode(65+id)}))},
    {id:'ravel',name:'DICER · sample slices',maxSeconds:20,channels:2,targets:[{id:0,name:'Sample'}]},
    {id:'batter',name:'BATTER · acoustic drum lanes',maxSeconds:120,channels:2,description:'Add audio to sample layer A or B in a drum lane; use its waveform editor to trim and shape it.',targets:[['kick','Kick'],['snare','Snare'],['rim','Rim / sidestick'],['closedHat','Closed hat'],['openHat','Open hat'],['ride','Ride'],['crash','Crash'],['tomLow','Low tom'],['tomMid','Mid tom'],['tomHigh','High tom'],['clap','Clap'],['percussion','Percussion']].flatMap(([id,name])=>[{id,name:name+' · A'},{id:id+':b',name:name+' · B'}])},
    {id:'mire',name:'REDUCE · source exciters',maxSeconds:10,channels:1,targets:Array.from({length:4},(_,id)=>({id,name:'Source '+(id+1)}))},
    {id:'form',name:'HOTPLATE · granular layers',maxSeconds:2,channels:1,targets:Array.from({length:24},(_,i)=>({id:Math.floor(i/3)+':'+['a','b','c'][i%3],name:'Voice '+(Math.floor(i/3)+1)+' / Layer '+['A','B','C'][i%3]}))},
    {id:'haze',name:'STEAM · audio to spectral score',maxSeconds:20,channels:1,mode:'analysis',description:'Analyze audio into an editable spectral score.',targets:[{id:'score',name:'Spectral score'}]}
  ];
  function receivers(){const list=sampleReceivers.map(value=>({...value}));for(const t of state.tracks){if(!t.instrument||list.some(value=>value.id===t.instrument.id))continue;const caps=host.capabilities(t.id);if(caps.importAudio)list.push({...caps.audioImport,id:t.instrument.id,name:t.instrument.name||t.instrument.id,url:t.instrument.url,html:t.instrument.html});}return list;}
  function receiver(){return receivers().find(value=>value.id===$('transferApp').value);}
  function transferTargets(){return state.tracks.map((t,index)=>({t,index})).filter(({t})=>!t.instrument||t.instrument.id===$('transferApp').value);}
  function fillTransferSources(spec,{reset=false}={}){const previous=$('transferDeck').value,targets=Array.isArray(spec?.targets)&&spec.targets.length?spec.targets:[{id:0,name:'Sample'}];$('transferDeck').innerHTML=targets.map(target=>`<option value="${escape(target.id)}">${escape(target.name||'Sample')}${target.occupied?' · '+escape(target.assetName||'loaded'):''}</option>`).join('');if(!reset&&targets.some(target=>String(target.id)===previous))$('transferDeck').value=previous;$('transferDeckLabel').hidden=targets.length===1;transferSpec={...spec,targets};}
  function transferSelection(){const selected=clipLocation(),duration=selected?selected.clip.length*60/state.tempo:0,start=Number($('transferStart').value),end=Number($('transferEnd').value);return {duration,start,end,length:end-start,valid:Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end<=duration+1/48000&&end>start&&(end-start)<=(transferSpec?.maxSeconds||120)+1e-8};}
  function renderTransferSelection(){const range=transferSelection(),max=transferSpec?.maxSeconds||120;for(const id of ['transferStart','transferEnd'])$(id).max=range.duration;$('transferSelectionSummary').textContent=range.length.toFixed(3)+' seconds selected · receiver limit '+max+' s'+(range.valid?'':' · adjust the selection');$('transferSelectionSummary').classList.toggle('invalid',!range.valid);$('sendTransfer').disabled=!range.valid||!$('transferTrack').value||$('transferTrack').dataset.checking==='true'||!!transferAbort;}
  async function updateTransferTargets(reset=false){
    const previous=$('transferTrack').value,targets=transferTargets();$('transferTrack').innerHTML=targets.map(({t,index})=>`<option value="${index}">${String(index+1).padStart(2,'0')} · ${escape(t.name)} · ${t.instrument?S.instrumentName(t.instrument):'empty track'}</option>`).join('');
    if(targets.some(({index})=>String(index)===previous)&&!reset)$('transferTrack').value=previous;else if(targets.some(({index})=>index===state.selectedTrack))$('transferTrack').value=String(state.selectedTrack);
    fillTransferSources(receiver(),{reset});$('transferReplace').checked=false;await updateTransferRecipient();
  }
  async function updateTransferRecipient(){
    const operation=++transferOperation,generation=lifecycle,choice=$('transferTrack').value,t=choice===''?null:state.tracks[Number(choice)];$('transferTrack').dataset.checking='false';$('transferReplace').checked=false;$('transferReplaceLabel').hidden=true;
    if(!t){$('transferTargetInfo').textContent='No matching instrument or empty track. Unload a track’s instrument to make room, then try again.';renderTransferSelection();return;}
    if(!t.instrument){$('transferTargetInfo').textContent='This loads '+$('transferApp').value.toUpperCase()+' into '+t.name+($('transferDeck').value==='new'?' and adds a new sample zone. ':' and replaces the chosen starter destination with this audio. ')+(transferSpec?.description||'')+(transferSpec?.channels===1?' The destination processes mono audio.':'');renderTransferSelection();return;}
    $('transferTrack').dataset.checking='true';$('sendTransfer').disabled=true;$('transferTargetInfo').textContent='Checking the receiving instrument…';
    try{const ready=await ensureInstrument(t);if(!ready||operation!==transferOperation||generation!==lifecycle||!$('transferDialog').open)return;const caps=host.capabilities(t.id);if(!caps.importAudio)throw Error('This instrument cannot receive audio directly.');fillTransferSources(caps.audioImport);updateTransferDestination();}catch(e){if(operation===transferOperation){$('transferTargetInfo').textContent=e.message;$('transferTrack').dataset.checking='true';}}finally{if(operation===transferOperation&&$('transferTargetInfo').textContent!=='Checking the receiving instrument…'){if(transferSpec&&host.capabilities(t.id).importAudio)$('transferTrack').dataset.checking='false';renderTransferSelection();}}
  }
  function updateTransferDestination(){const target=transferSpec?.targets?.find(value=>String(value.id)===$('transferDeck').value);$('transferReplace').checked=false;$('transferReplaceLabel').hidden=!target?.occupied;const name=target?.name||'Sample';$('transferTargetInfo').textContent=(transferSpec?.description?transferSpec.description+' ':'')+(target?.occupied?name+' contains '+(target.assetName||'audio or a synthesis layer')+'. Check the box to replace it.':name+' is ready for this audio.')+(transferSpec?.channels===1?' This destination processes mono audio.':'');renderTransferSelection();}
  function openTransfer(){const selected=clipLocation();if(!selected||transportLocked())return;const apps=receivers(),previous=$('transferApp').value;$('transferApp').innerHTML=apps.map(app=>`<option value="${escape(app.id)}">${escape(app.name)}</option>`).join('');if(apps.some(app=>app.id===previous))$('transferApp').value=previous;const duration=selected.clip.length*60/state.tempo;$('transferStart').value=0;$('transferEnd').value=duration.toFixed(6);$('transferDescription').textContent=selected.clip.name+' · '+duration.toFixed(2)+' seconds. Choose a compatible destination and an audio region.';$('transferStatus').textContent='Clip edits are included; track effects stay in GALLEY.';$('transferDialog').showModal();updateTransferTargets(true);}
  async function sendTransfer(){
    const selected=clipLocation(),choice=$('transferTrack').value,range=transferSelection();if(!selected||choice===''||transferAbort||!range.valid)return;const t=state.tracks[Number(choice)],app=$('transferApp').value,target=transferSpec?.targets?.find(value=>String(value.id)===$('transferDeck').value)?.id;if(target===undefined){$('transferStatus').textContent='Choose a sample destination.';return;}if(t.instrument&&t.instrument.id!==app){$('transferStatus').textContent='Choose a matching instrument or an empty track.';return;}
    const generation=lifecycle,operation=++transferOperation,controller=new AbortController();transferAbort=controller;const clip=clone(selected.clip),asset=assetMap[clip.assetId],previousInstrument=clone(t.instrument);let remembered=false,imported=false;
    $('sendTransfer').disabled=true;$('closeTransfer').disabled=true;for(const id of ['transferApp','transferTrack','transferDeck','transferReplace','transferStart','transferEnd','transferFit'])$(id).disabled=true;$('transferStatus').textContent='Preparing the edited audio…';
    try{
      const audio=await window.LoomClipTransfer.render(clip,asset,state.tempo,{signal:controller.signal,maxSeconds:transferSpec?.maxSeconds||120,startSeconds:range.start,endSeconds:range.end});audio.tempo=state.tempo;if(generation!==lifecycle||operation!==transferOperation)return;
      if(t.instrument&&frames.has(t.id)){const before=await host.snapshot(t.id);if(before)t.instrument.snapshot=before;}
      if(generation!==lifecycle||operation!==transferOperation)return;remember({instruments:true});remembered=true;
      const descriptor=instrumentOptions().find(value=>value.id===app)||receiver(),ready=await ensureInstrument(t,{descriptor:t.instrument?null:{id:app,name:descriptor.name||app.toUpperCase(),url:descriptor.url,html:descriptor.html}});if(!ready||generation!==lifecycle||operation!==transferOperation)return;
      await host.importAudio(t.id,audio,{target,deck:target,replace:!previousInstrument||$('transferReplace').checked,signal:controller.signal});imported=true;if(generation!==lifecycle||operation!==transferOperation)return;
      const snapshot=await host.snapshot(t.id);if(snapshot)t.instrument.snapshot=snapshot;selectedTrack(state.tracks.indexOf(t),{keepClip:true});changed({arrangement:true,mixer:true,rack:true});$('transferDialog').close();await ensureInstrument(t,{open:true});status(clip.name+' sent to '+app.toUpperCase()+'. The source clip remains available.');
    }catch(e){if(generation===lifecycle&&operation===transferOperation){if(!imported&&remembered){t.instrument=previousInstrument;if(!previousInstrument){host.unload(t.id);frames.get(t.id)?.remove();frames.delete(t.id);openedApps.delete(t.id);}history.pop();renderHistory();changed({rack:true,arrangement:true});}$('transferStatus').textContent=e.name==='AbortError'?'Transfer canceled.':e.message;status(e.message);}}
    finally{if(transferAbort===controller)transferAbort=null;$('closeTransfer').disabled=false;for(const id of ['transferApp','transferTrack','transferDeck','transferReplace','transferStart','transferEnd','transferFit'])$(id).disabled=false;if(generation===lifecycle)renderTransferSelection();}
  }
  function receiveLibraryAudio({pcm,sampleRate,name='Shared audio',options={},signal}={}){
    if(signal?.aborted||options.signal?.aborted)throw new DOMException('Import canceled.','AbortError');
    if(transportLocked())throw Error('Finish the take before importing a sample.');if(Object.prototype.toString.call(pcm)!=='[object Float32Array]'||pcm.length%2||!pcm.length||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('Provide complete stereo audio.');for(const sample of pcm)if(!Number.isFinite(sample))throw Error('Audio contains invalid samples.');if(pcm.length/2/sampleRate>120)throw Error('Choose up to 120 seconds.');
    const id=options.target??options.deck??track().id,t=state.tracks.find(value=>value.id===String(id))||state.tracks[Number(id)];if(!t)throw Error('Choose one of the eight tracks.');if(t.clips.length>=S.LIMITS.clipsPerTrack)throw Error('This track has reached its clip limit.');
    const left=new Float32Array(pcm.length/2),right=new Float32Array(left.length);for(let i=0;i<left.length;i++){left[i]=pcm[i*2];right[i]=pcm[i*2+1];}const asset=S.encodeAsset({left,right,sampleRate,name}),used=state.assets.reduce((sum,a)=>sum+a.frames*a.channels*2,0);if(used+asset.frames*asset.channels*2>S.LIMITS.pcmBytes)throw Error('This audio would exceed GALLEY’s audio budget.');
    remember();const start=Math.min(state.lengthBars*4-.015625,Math.max(0,snap(engine.getMeters().beat||0))),fullLength=asset.duration*state.tempo/60;state.lengthBars=Math.max(state.lengthBars,Math.min(64,Math.ceil((start+fullLength)/4)));state.assets.push(asset);const clip={id:S.uid('clip'),name:asset.name,assetId:asset.id,start,length:Math.min(fullLength,state.lengthBars*4-start),sourceStart:0,sourceEnd:asset.duration,sourceOffset:0,rate:1,reverse:false,loop:false,gain:1,fadeIn:.01,fadeOut:.03};t.clips.push(clip);rackTarget='track';state.selectedTrack=state.tracks.indexOf(t);selectedClip=clip.id;decodeAssets();changed({arrangement:true,mixer:true,rack:true,inspector:true});status('Shared sample added to '+t.name+'.'+(clip.length<fullLength?' The complete source is retained; the visible clip ends at the session limit.':''));return {trackId:t.id,clipId:clip.id,duration:asset.duration};
  }
  async function exportLibraryAudio({scope='clip',bars=1,tailSeconds=0,signal}={}){
    if(signal?.aborted)throw new DOMException('Render canceled.','AbortError');const generation=lifecycle;
    if(scope==='clip'){const selected=clipLocation();if(!selected)throw Error('Select a clip first.');let source=clone(selected.clip),audio=assetMap[source.assetId];if(source.type==='notes'){const captured=await renderSnapshot(state,signal,{trackId:selected.track.id,startBeat:source.start,endBeat:source.start+source.length}),printed=await noteRenderer.print(captured,selected.track.id,source.id,{signal});source=printed.clip;audio=printed.audio;}const result=await window.LoomClipTransfer.render(source,audio,state.tempo,{signal,maxSeconds:120});if(generation!==lifecycle)throw new DOMException('Session changed.','AbortError');return {...result,name:selected.clip.name,tempo:state.tempo,sourceApp:'loom'};}
    if(scope==='instrument'){const t=track();if(!t.instrument)throw Error('Load an instrument first.');await ensureInstrument(t);const caps=host.capabilities(t.id),nativeScope=caps.audioExport?.scopes?.[0]?.id||'pattern';return host.exportAudio(t.id,{scope:nativeScope,bars,tailSeconds,signal});}
    if(scope!=='mix')throw Error('Choose a clip, track instrument, or arrangement mix.');const renderState=clone(state),startBeat=state.loopEnabled?state.loopStart:0,endBeat=Math.min(state.lengthBars*4,startBeat+num(bars,1,16)*4),blob=await engine.renderWav(renderState,assetMap,{startBeat,endBeat,tailSeconds,signal});if(generation!==lifecycle)throw new DOMException('Session changed.','AbortError');return {blob,name:state.name+' · arrangement',tempo:renderState.tempo,sourceApp:'loom',bars:(endBeat-startBeat)/4};
  }
  cpuInspector=typeof window.LoomCPUInspector==='function'?new window.LoomCPUInspector({element:$('cpuInspector'),engine,getState:()=>state,host,status,selectEffect:(ownerId,slot)=>{if(/^track-[1-8]$/.test(ownerId))selectEffect(slot,Number(ownerId.slice(6))-1);else selectBusEffect(slot,ownerId);}}):null;
  automationEditor=new window.LoomAutomationEditor({element:$('automationEditor'),getState:()=>state,getOwner:effectOwner,getBeat:()=>engine.getMeters().beat||0,getPlaying:()=>!!engine.getMeters().playing,getMeters:()=>engine.getMeters(),remember,onChange:()=>changed(),status});
  $('audioSettingsButton').addEventListener('click',()=>openAudioSettings());$('microphoneSettingsButton').addEventListener('click',()=>openAudioSettings());$('microphonePracticeButton').addEventListener('click',()=>openAudioSettings({practice:true}));$('microphoneVocalPracticeButton').addEventListener('click',()=>openAudioSettings({practice:'vocal'}));
  $('closeAudioSettings').addEventListener('click',()=>{if(!audioSettingsBusy)$('audioSettingsDialog').close();});
  $('audioSettingsDialog').addEventListener('cancel',e=>{if(audioSettingsBusy)e.preventDefault();});
  $('audioSettingsDialog').addEventListener('close',()=>{if(ampPracticeBusy&&engine.getMicrophoneStatus().pending){++microphoneOperation;engine.setMicrophoneMonitoring(track().id,{enabled:false}).catch(e=>status(e.message));}});
  $('refreshAudioDevices').addEventListener('click',()=>refreshAudioDevices({requestPermission:true}));$('applyAudioSettings').addEventListener('click',applyInterfaceSettings);
  $('audioLatencyProfile').addEventListener('change',renderAudioProfileHint);$('guitarPracticeButton').addEventListener('click',()=>startAmpPractice('guitar'));$('bassPracticeButton').addEventListener('click',()=>startAmpPractice('bass'));$('vocalPracticeButton').addEventListener('click',startVocalPractice);$('utilityPracticeButton').addEventListener('click',startUtilityPractice);
  $('countInBars').addEventListener('change',()=>{if(transportLocked())return;remember();state.recording.countInBars=Number($('countInBars').value);changed();renderRecordingSetup();});
  $('microphoneMonitorButton').addEventListener('click',()=>setMicrophoneMonitor());
  $('microphoneRouteButton').addEventListener('click',()=>setMicrophoneMonitor({move:true}));
  $('microphoneInputGain').addEventListener('input',()=>{if(transportLocked())return;if(!activeRanges.has($('microphoneInputGain'))){remember();activeRanges.add($('microphoneInputGain'));}state.recording.micInputGainDb=num($('microphoneInputGain').value,-24,24);changed();renderMicrophone();});
  function nudgeMicrophoneAlignment(direction, event) {
    if(transportLocked()||state.recording.micCompensation==='off')return;
    const previous=state.recording.micOffsetMs,next=Math.round(num(previous+direction*(event.shiftKey?1:5),-500,500)*10)/10;
    if(next===previous)return;
    remember();state.recording.micOffsetMs=next;$('microphoneOffset').value=next;changed();renderMicrophone();
    const amount=Math.abs(next-previous).toFixed(1).replace(/\.0$/,'');
    status('New microphone takes: '+amount+' ms '+(direction<0?'later':'earlier')+'. '+(state.recording.micCompensation==='manual'?'Offset':'Extra trim')+': '+(next>0?'+':'')+next.toFixed(1)+' ms.');
  }
  $('microphoneLaterButton').addEventListener('click',event=>nudgeMicrophoneAlignment(-1,event));
  $('microphoneEarlierButton').addEventListener('click',event=>nudgeMicrophoneAlignment(1,event));
  $('microphoneCompensation').addEventListener('change',()=>{if(transportLocked())return;remember();state.recording.micCompensation=$('microphoneCompensation').value;changed();renderMicrophone();});
  $('microphoneOffset').addEventListener('change',()=>{if(transportLocked())return;const value=Number($('microphoneOffset').value);if(!Number.isFinite(value)){renderMicrophone();return;}remember();state.recording.micOffsetMs=num(value,-500,500);$('microphoneOffset').value=state.recording.micOffsetMs;changed();renderMicrophone();});
  $('recordSource').addEventListener('change',()=>{if($('recordSource').value==='microphone'){$('micInputPanel').open=true;renderMicrophone();}else if(!transportLocked()){++microphoneOperation;engine.setMicrophoneMonitoring(track().id,{enabled:false}).then(()=>renderMicrophone()).catch(e=>status(e.message));}});
  $('punchButton').addEventListener('click',()=>{if(transportLocked())return;remember();state.recording.punchEnabled=!state.recording.punchEnabled;changed({arrangement:true});renderRecordingSetup();});
  $('punchFromLoop').addEventListener('click',()=>{if(transportLocked())return;remember();Object.assign(state.recording,{punchEnabled:true,punchStart:state.loopStart,punchEnd:state.loopEnd});changed({arrangement:true});renderRecordingSetup();});
  for(const id of ['punchStart','punchEnd'])$(id).addEventListener('change',()=>{if(transportLocked())return;remember();const r=state.recording;if(id==='punchStart')r.punchStart=num((Number($(id).value)-1)*4,0,r.punchEnd-.25);else r.punchEnd=num((Number($(id).value)-1)*4,r.punchStart+.25,state.lengthBars*4);changed({arrangement:true});renderRecordingSetup();});
  $('addMarkerButton').addEventListener('click',()=>openMarker());$('previousMarkerButton').addEventListener('click',()=>jumpMarker(-1));$('nextMarkerButton').addEventListener('click',()=>jumpMarker(1));$('saveMarker').addEventListener('click',saveMarker);$('closeMarker').addEventListener('click',()=>$('markerDialog').close());
  $('deleteMarker').addEventListener('click',()=>{if(!markerEditing||transportLocked())return;remember();state.markers=state.markers.filter(m=>m.id!==markerEditing);$('markerDialog').close();changed({arrangement:true});status('Marker removed. Undo will bring it back.');});
  $('markerDialog').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveMarker();}});
  document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit-marker]'),marker=e.target.closest('[data-marker]');if(edit){openMarker(edit.dataset.editMarker);return;}if(marker){const m=state.markers.find(m=>m.id===marker.dataset.marker);if(m)seekTo(m.beat);}});
  $('clipEditQuick').addEventListener('click',editSelectedClip);$('clipSplitQuick').addEventListener('click',splitClip);$('clipDuplicateQuick').addEventListener('click',duplicateClip);$('clipDeleteQuick').addEventListener('click',removeClip);$('transferClipButton').addEventListener('click',openTransfer);
  $('trackLanes').addEventListener('contextmenu',e=>{const el=e.target.closest('.clip');if(!el)return;e.preventDefault();selectClipElement(el);$('clipActionsTitle').textContent=clipLocation()?.clip.name||'Clip actions.';$('clipActionsDialog').showModal();});
  $('closeClipActions').addEventListener('click',()=>$('clipActionsDialog').close());$('clipActionsDialog').addEventListener('click',e=>{const action=e.target.closest('[data-clip-action]')?.dataset.clipAction;if(!action)return;$('clipActionsDialog').close();Promise.resolve(({edit:editSelectedClip,notes:()=>noteWorkflow.editNotes(),print:()=>noteWorkflow.print(),source:()=>noteWorkflow.editSource(),update:()=>noteWorkflow.update(),loop:loopSelection,split:splitClip,duplicate:duplicateClip,transfer:openTransfer,delete:removeClip})[action]?.()).catch(e=>status(e.message));});
  $('closeTransfer').addEventListener('click',()=>{++transferOperation;transferAbort?.abort();$('transferDialog').close();});$('transferDialog').addEventListener('cancel',e=>{if(transferAbort){e.preventDefault();return;}++transferOperation;});$('transferApp').addEventListener('change',()=>updateTransferTargets(true));$('transferTrack').addEventListener('change',updateTransferRecipient);$('transferDeck').addEventListener('change',updateTransferDestination);$('sendTransfer').addEventListener('click',sendTransfer);for(const id of ['transferStart','transferEnd'])$(id).addEventListener('input',renderTransferSelection);$('transferFit').addEventListener('click',()=>{const range=transferSelection();$('transferEnd').value=Math.min(range.duration,range.start+(transferSpec?.maxSeconds||120)).toFixed(6);renderTransferSelection();});

  noteWorkflow = new window.LoomNoteWorkflow({ getState:()=>state, getLocation:clipLocation, getGeneration:()=>lifecycle, commit:commitNotes, changed, remember, status, snap, engine, host, renderer:noteRenderer, ensureInstrument, pause });
  pianoRoll = new window.LoomPianoRollEditor({ element:$('pianoRollEditor'), getState:()=>state, getClip:()=>noteWorkflow.getEditableClip(), remember, onChange:()=>noteWorkflow.pianoChanged(), status, onAudition:event=>auditionNote(event).catch(e=>status(e.message)), getBeat:()=>engine.getTransport().beat, getVoices:index=>noteWorkflow.voices(state.tracks[index].id) });
  noteWorkflow.piano = pianoRoll;
  window.MusicLabPatternInstrument = { get patternImport(){return noteWorkflow.patternImport;}, patternExport:{scopes:[{id:'clip',label:'Selected note or source pattern'},{id:'instrument',label:'Selected track instrument pattern'}],defaultScope:'clip'}, prepareTarget:request=>noteWorkflow.prepareTarget(request), importPattern:request=>noteWorkflow.importPattern(request), exportPattern:request=>noteWorkflow.exportPattern(request) };
  host.setTempo(state.tempo);decodeAssets();renderAll();if(recoveryUnavailable)recoveryInfo('Browser recovery is unavailable. Save a project to keep this session.');requestAnimationFrame(()=>{fitTimeline();requestAnimationFrame(animate);});let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(fitInitial)fitTimeline();else renderArrangement();},100);});
  const releaseInputOnExit=()=>{++microphoneOperation;engine.panic();};window.addEventListener('beforeunload',releaseInputOnExit);
  if(location.protocol==='file:'){const home='https://calebhaines.github.io/sidequest-prototypes/music/';$('musicHome').href=home;$('downloadHtml').href=home+'loom/index.html';$('downloadSource').href=home+'loom/LOOM-source.zip';$('downloadApi').href='https://github.com/calebhaines/sidequest-prototypes/blob/main/loom/HOSTING.md';}
  window.addEventListener('pagehide',()=>{++microphoneOperation;notePlayback.dispose();noteWorkflow.dispose();pianoRoll.dispose();engine.panic();host.dispose();});
  let serviceReturnStatus='';
  const serviceNoteRenderer=new window.LoomServiceNoteRenderer({host,context:()=>engine.context});
  serviceController=new window.LoomServiceController({
    engine,getState:()=>state,getAssets:()=>assetMap,
    canOpen:()=>!transportLocked()&&!transportPending&&!exportAbort,
    persist:(service,{remember:recordHistory=true}={})=>{if(recordHistory)remember();state.service=service;scheduleAutosave();},
    prepareSources:async({signal})=>serviceNoteRenderer.prepareNotes(state,assetMap,{signal}),
    suspendArrangement:async()=>{serviceReturnStatus=$('status').textContent;await halt({keepMicrophone:true});notePlayback.stop();engine.clearAudition();await Promise.allSettled(state.tracks.filter(t=>t.instrument&&frames.has(t.id)).map(t=>host.command(t.id,'stop')));},
    restoreArrangement:beat=>{engine.seek(beat);renderTransport();status(serviceReturnStatus);},
    applyArrangement:next=>replaceState(next,{message:'SERVICE take placed in the arrangement. One Undo restores the previous session.'}),status
  });
  const serviceOpenButton=document.createElement('button');serviceOpenButton.type='button';serviceOpenButton.dataset.serviceOpen='';serviceOpenButton.textContent='Open SERVICE · performance desk';serviceOpenButton.title='Separate performance view (Alt + P)';
  serviceOpenButton.style.cssText='width:100%;white-space:normal;margin:0 0 18px;padding:12px';
  $('helpDialog').querySelector('.dialog-top').insertAdjacentElement('afterend',serviceOpenButton);
  serviceOpenButton.addEventListener('click',()=>{$('helpDialog').close();serviceController.open();});
  document.addEventListener('keydown',event=>{if(event.altKey&&!event.ctrlKey&&!event.metaKey&&event.code==='KeyP'&&!event.repeat&&!event.target.closest('input,select,textarea,[contenteditable=true]')){event.preventDefault();serviceController.isOpen?serviceController.close():!document.querySelector('dialog[open]')&&serviceController.open();}},true);
  window.addEventListener('pagehide',()=>{serviceController.destroy();serviceNoteRenderer.dispose();});
  const openServiceHash=()=>{if(location.hash==='#service'&&!document.querySelector('dialog[open]'))serviceController.open();};window.addEventListener('hashchange',openServiceHash);if(location.hash==='#service')requestAnimationFrame(openServiceHash);
  window.LoomApp=Object.freeze({get selectedEffectOwner(){return effectOwner().id;},get selectedEffectSlot(){return selectedSlot;},selectBus:focusBus,selectEffect:(slot,id=track().id)=>{if(!Number.isInteger(slot)||slot<0||slot>=S.effectSlotCount(S.automationOwner(state,id)))return false;const index=state.tracks.findIndex(t=>t.id===id);if(index>=0){selectEffect(slot,index);return true;}return selectBusEffect(slot,id);},get service(){return serviceController;},get cpuInspector(){return cpuInspector;},get notePlayback(){return notePlayback;},get noteRenderer(){return noteRenderer;},get noteWorkflow(){return noteWorkflow;},selectClip:id=>{for(const t of state.tracks)if(t.clips.some(c=>c.id===id)){rackTarget='track';state.selectedTrack=state.tracks.indexOf(t);selectedClip=id;renderAll();return true;}return false;},importPattern:request=>noteWorkflow.importPattern(request),exportPattern:request=>noteWorkflow.exportPattern(request),getState:()=>clone(state),loadState:next=>{serviceController.reset();return replaceState(next,{message:'Session loaded.'});},get engine(){return engine;},get host(){return host;},get assets(){return assetMap;},selectTrack:index=>selectedTrack(num(index,0,7)),get selectedClip(){return selectedClip;},importAudio:receiveLibraryAudio,exportAudio:exportLibraryAudio,get audioImport(){return {maxSeconds:120,channels:2,targets:state.tracks.map(t=>({id:t.id,name:t.name+' · append clip',occupied:false}))};},get audioExport(){return {defaultBars:1,maxBars:16,scopes:[...(clipLocation()?[{id:'clip',label:'Selected clip / edited audio',usesBars:false}]:[]),{id:'mix',label:'Arrangement mix'},{id:'instrument',label:'Selected track instrument'}]};}});
})();
