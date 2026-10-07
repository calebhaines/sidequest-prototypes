/* SERVICE is a separate performance screen; GALLEY's arrangement is left intact. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const bars = beats => Math.round(finite(beats) / 4 * 100) / 100;
  const quantizeChoices = [[0, 'Immediately'], [1, 'Next beat'], [2, 'Next ½ bar'], [4, 'Next bar'], [8, 'Next 2 bars'], [16, 'Next 4 bars']];
  const editTarget = element => !!element?.closest?.('input,select,textarea,[contenteditable=true]');

  class LoomServiceUI {
    constructor({ controller }) {
      this.controller = controller;
      this.selectedSceneId = null;
      this.editingMacroId = null;
      this.padRate = .25;
      this.padTracks = new Set();
      this.held = new Map();
      this.signature = null;
      this.unsubscribe = null;
      this.midiTarget = 'control:play';
      this.localMessage = '';
      this.dialog = document.createElement('dialog');
      this.dialog.id = 'loomServiceDialog';
      this.dialog.className = 'loom-service-dialog';
      this.dialog.setAttribute('aria-labelledby', 'loomServiceTitle');
      this.dialog.setAttribute('aria-describedby', 'loomServiceDescription');
      document.body.append(this.dialog);
      this.handlers = {
        click: event => this.click(event),
        change: event => this.change(event),
        input: event => this.input(event),
        pointerdown: event => this.pointerDown(event),
        pointerup: event => this.pointerEnd(event),
        pointercancel: event => this.pointerEnd(event),
        lostpointercapture: event => this.pointerEnd(event),
        keydown: event => this.keydown(event),
        keyup: event => this.keyup(event),
        cancel: event => { event.preventDefault(); this.send('close'); },
        close: () => this.releasePads()
      };
      for (const [name, handler] of Object.entries(this.handlers)) this.dialog.addEventListener(name, handler);
      this.blurHandler = () => this.releasePads();
      this.visibilityHandler = () => { if (document.hidden) this.releasePads(); };
      window.addEventListener('blur', this.blurHandler);
      window.addEventListener('pagehide', this.blurHandler);
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    snapshot() { return this.controller.getSnapshot() || {}; }
    service(snapshot = this.snapshot()) { return snapshot.service || {}; }
    tracks(snapshot = this.snapshot()) { return (snapshot.tracks || []).slice(0, 8); }
    scenes(snapshot = this.snapshot()) { return this.service(snapshot).scenes || []; }
    macros(snapshot = this.snapshot()) { return this.service(snapshot).macros || []; }
    selectedScene(snapshot = this.snapshot()) { return this.scenes(snapshot).find(scene => scene.id === this.selectedSceneId) || this.scenes(snapshot)[0]; }
    macro(snapshot = this.snapshot()) { return this.macros(snapshot).find(macro => macro.id === this.editingMacroId); }
    open() {
      if (this.dialog.open) return;
      this.previousFocus = document.activeElement;
      this.signature = null;
      const snapshot = this.snapshot();
      if (Array.isArray(snapshot.padState?.targetIds)) this.padTracks = new Set(snapshot.padState.targetIds);
      else if (!this.padTracks.size) this.tracks(snapshot).forEach(track => this.padTracks.add(track.id));
      if (!this.selectedSceneId) this.selectedSceneId = snapshot.selectedSceneId || this.service(snapshot).selectedSceneId || this.scenes(snapshot)[0]?.id;
      this.render(snapshot);
      this.dialog.showModal();
      this.unsubscribe = this.controller.subscribe?.(snapshot => this.update(snapshot || this.snapshot()));
      this.dialog.querySelector('[data-service-action="play"]')?.focus({ preventScroll: true });
    }
    close() {
      this.releasePads();
      this.unsubscribe?.(); this.unsubscribe = null;
      if (this.dialog.open) this.dialog.close();
      this.previousFocus?.focus?.({ preventScroll: true });
    }
    destroy() {
      this.close();
      for (const [name, handler] of Object.entries(this.handlers)) this.dialog.removeEventListener(name, handler);
      window.removeEventListener('blur', this.blurHandler);
      window.removeEventListener('pagehide', this.blurHandler);
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.dialog.remove();
    }
    async send(action, payload = {}, refresh = true) {
      this.localMessage = '';
      try {
        await this.controller.perform(action, payload);
        if (action === 'scene-create' || action === 'scene-duplicate') this.selectedSceneId = this.snapshot().selectedSceneId || this.selectedSceneId;
        if (this.dialog.open) {
          if (refresh && !this.held.size) this.render(this.snapshot());
          else this.update(this.snapshot());
        }
      } catch (error) {
        this.localMessage = error?.message || 'That instruction could not be completed.';
        this.tick(this.snapshot());
      }
    }
    structure(snapshot) {
      return JSON.stringify({
        scenes: this.scenes(snapshot),
        tracks: this.tracks(snapshot).map(track => ({ id: track.id, name: track.name, color: track.color, clips: track.clips, targets: track.targets })),
        macros: this.macros(snapshot).map(({ value, ...macro }) => macro),
        midiBindings: this.service(snapshot).midiBindings,
        selectedSceneId: this.selectedSceneId,
        editingMacroId: this.editingMacroId
      });
    }
    update(snapshot = this.snapshot()) {
      if (!this.dialog.open) return;
      const signature = this.structure(snapshot);
      const focused = document.activeElement;
      const editing = this.dialog.contains(focused) && editTarget(focused);
      if (signature !== this.signature && !editing && !this.held.size) this.render(snapshot);
      else this.tick(snapshot);
    }
    render(snapshot = this.snapshot()) {
      const service = this.service(snapshot), scenes = this.scenes(snapshot), tracks = this.tracks(snapshot);
      if (!scenes.some(scene => scene.id === this.selectedSceneId)) this.selectedSceneId = scenes[0]?.id || null;
      const focused = document.activeElement;
      const focusKey = this.dialog.contains(focused) ? this.focusKey(focused) : null;
      const scroll = this.dialog.scrollTop;
      const gridScroll = this.dialog.querySelector('.loom-service-grid-scroll');
      const gridPosition = { x: gridScroll?.scrollLeft || 0, y: gridScroll?.scrollTop || 0 };
      const midiOpen = this.dialog.querySelector('.loom-service-midi')?.open || false;
      this.signature = this.structure(snapshot);
      this.dialog.innerHTML = `<header class="loom-service-head">
        <div class="loom-service-brand"><span class="loom-service-kicker">KITCHEN / THE LIVE PASS</span><h2 id="loomServiceTitle">SERVICE<span>.</span></h2><p id="loomServiceDescription">Launch the courses. Let the equipment misbehave.</p></div>
        <div class="loom-service-ticket"><strong>ORDER / LIVE</strong><span>EIGHT STATIONS · FOUR FINISHES<br>ARRANGEMENT STAYS ON ITS OWN RAIL.</span></div>
        <button type="button" class="loom-service-close" data-service-action="close">← Arrangement</button>
      </header>
      <section class="loom-service-transport" aria-label="SERVICE transport">
        <div class="loom-service-transport-buttons"><button type="button" class="loom-service-play" data-service-action="play"><span data-service-play-label>▶ Play</span></button><button type="button" data-service-action="stop">■ Stop</button><button type="button" class="loom-service-panic" data-service-action="panic" title="Silence performance sources and release all held controls">Panic</button></div>
        <div class="loom-service-clock"><output data-service-clock>01 : 01</output><span data-service-transport-state>READY FOR SERVICE</span></div>
        <div class="loom-service-tempo"><span>BPM</span><strong>${escape(snapshot.tempo || 96)}</strong></div>
        <label>LAUNCH TIMING<select data-service-field="quantize" aria-label="Scene launch timing">${quantizeChoices.map(([value, label]) => `<option value="${value}" ${finite(service.quantize, 4) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <button type="button" class="loom-service-capture-toggle" data-service-action="capture-toggle" aria-pressed="false"><i aria-hidden="true"></i><span data-service-capture-label>Capture off</span></button>
      </section>
      <div class="loom-service-workspace"><div class="loom-service-main">
        <section class="loom-service-panel" aria-labelledby="loomServiceScenesTitle"><div class="loom-service-panel-head"><div><h3 id="loomServiceScenesTitle">The running order</h3><p>One scene launches all eight tracks. Each clip repeats at its own length.</p></div><div class="loom-service-add-menu"><button type="button" data-service-action="scene-create" data-source="loop" ${scenes.length >= 16 ? 'disabled' : ''}>+ From loop</button><button type="button" data-service-action="scene-create" data-source="markers" ${scenes.length >= 16 ? 'disabled' : ''}>From markers</button><button type="button" data-service-action="scene-create" data-source="empty" ${scenes.length >= 16 ? 'disabled' : ''}>Empty scene</button></div></div>
          ${scenes.length ? `<div class="loom-service-grid-scroll" tabindex="0" aria-label="Scene grid; scroll horizontally to see all eight tracks"><table class="loom-service-grid"><thead><tr><th scope="col" class="loom-service-scene-heading"><span class="loom-service-kicker">SCENE / ${scenes.length} OF 16</span></th>${tracks.map((track, index) => `<th scope="col" style="--svc-track:${escape(track.color || '#d9e694')}"><div class="loom-service-track-head"><span>STATION ${String(index + 1).padStart(2, '0')}</span><strong>${escape(track.name)}</strong><div class="loom-service-track-meter" aria-hidden="true"><i data-service-meter="${escape(track.id)}"></i></div></div></th>`).join('')}</tr></thead><tbody>${scenes.map((scene, index) => this.sceneRow(scene, index, tracks)).join('')}</tbody></table></div>` : `<div class="loom-service-empty"><strong>The pass is clear.</strong><p class="loom-service-muted">Load or record some clips in GALLEY, then choose <strong>From loop</strong> to turn the loop range into a playable scene. Section markers can become a full set of scenes.</p><button type="button" data-service-action="scene-create" data-source="loop">Make the first scene from the loop</button></div>`}
          <div class="loom-service-grid-foot"><span>▶ Launch · ⋮ Edit recipe · Hold continues the previous clip · Silence stops a track</span><output data-service-queue>NO ORDER WAITING</output></div>
        </section>
        ${this.sceneEditor(snapshot)}
      </div><aside class="loom-service-side" aria-label="Performance controls">
        <section class="loom-service-panel" aria-labelledby="loomServiceMacrosTitle"><div class="loom-service-panel-head"><div><h3 id="loomServiceMacrosTitle">Four house controls</h3><p>One movement. Several carefully unreasonable instructions.</p></div></div><div class="loom-service-macro-grid">${this.macros(snapshot).map(macro => this.macroControl(macro)).join('')}</div>${this.macroEditor(snapshot)}</section>
        ${this.padPanel(tracks)}
        ${this.capturePanel(snapshot, midiOpen)}
      </aside></div>
      <div class="loom-service-status" role="status"><i aria-hidden="true"></i><output data-service-status>Ready for service.</output><span>SPACE / PLAY · Z X C / HOLD · ESC / ARRANGEMENT</span></div>`;
      this.dialog.scrollTop = scroll;
      const newGrid = this.dialog.querySelector('.loom-service-grid-scroll');
      if (newGrid) { newGrid.scrollLeft = gridPosition.x; newGrid.scrollTop = gridPosition.y; }
      if (focusKey) this.findFocus(focusKey)?.focus({ preventScroll: true });
      this.dialog.querySelectorAll('button,input,select').forEach(element => { element.dataset.serviceBaseDisabled = String(element.disabled); });
      this.tick(snapshot);
    }
    sceneRow(scene, index, tracks) {
      return `<tr data-service-scene-row="${escape(scene.id)}" class="${scene.id === this.selectedSceneId ? 'is-selected' : ''}"><th scope="row"><div class="loom-service-scene-ticket"><button type="button" class="loom-service-scene-launch" data-service-action="scene-launch" data-scene-id="${escape(scene.id)}" aria-label="Launch scene ${escape(scene.name)}"><i aria-hidden="true">▶</i><span><strong>${escape(scene.name || 'Untitled scene')}</strong><small>${String(index + 1).padStart(2, '0')} / ${bars(scene.lengthBeats)} bars</small></span></button><button type="button" class="loom-service-edit-scene" data-service-action="scene-edit" data-scene-id="${escape(scene.id)}" aria-label="Edit scene ${escape(scene.name)}">⋮</button></div></th>${tracks.map((track, trackIndex) => {
        const slot = scene.slots?.[trackIndex] || { mode: 'silence' }, clip = track.clips?.find(clip => clip.id === slot.clipId);
        const label = slot.mode === 'hold' ? 'Hold' : slot.mode === 'silence' ? 'Silence' : clip?.name || 'Missing clip';
        return `<td style="--svc-track:${escape(track.color || '#d9e694')}"><div class="loom-service-cell is-${escape(slot.mode)}" title="${escape(track.name + ': ' + label)}"><i aria-hidden="true"></i><span>${escape(label)}</span></div></td>`;
      }).join('')}</tr>`;
    }
    sceneEditor(snapshot) {
      const scene = this.selectedScene(snapshot), tracks = this.tracks(snapshot);
      if (!scene) return '';
      return `<section class="loom-service-panel" aria-labelledby="loomServiceRecipeTitle"><div class="loom-service-panel-head"><div><h3 id="loomServiceRecipeTitle">Scene recipe</h3><p>Combine any clips on their own tracks. Silence and Hold are deliberate ingredients.</p></div><span class="loom-service-kicker">${escape(scene.name)}</span></div><div class="loom-service-edit-fields"><label>SCENE NAME<input type="text" data-service-field="scene-name" value="${escape(scene.name)}" maxlength="80"></label><label>GUIDE / BARS<input type="number" data-service-field="scene-length" value="${bars(scene.lengthBeats)}" min=".25" max="64" step=".25"></label></div><div class="loom-service-slots">${tracks.map((track, index) => {
        const slot = scene.slots?.[index] || { mode: 'silence' }, selected = slot.mode === 'clip' ? slot.clipId : slot.mode;
        return `<div class="loom-service-slot" style="--svc-track:${escape(track.color || '#d9e694')}"><label><span>${String(index + 1).padStart(2, '0')} / ${escape(track.name)}</span><select data-service-slot="${index}" aria-label="${escape(track.name)} scene source"><option value="silence" ${selected === 'silence' ? 'selected' : ''}>Silence</option><option value="hold" ${selected === 'hold' ? 'selected' : ''}>Hold previous</option>${(track.clips || []).map(clip => `<option value="${escape(clip.id)}" ${selected === clip.id ? 'selected' : ''}>${escape(clip.name || 'Untitled clip')}${clip.type === 'notes' ? ' · notes' : ''}</option>`).join('')}</select></label></div>`;
      }).join('')}</div><div class="loom-service-editor-bottom"><p>Guide length labels the phrase. Launch scenes manually; clips loop independently. Capture continues until Stop.</p><button type="button" data-service-action="scene-duplicate" data-scene-id="${escape(scene.id)}" ${this.scenes(snapshot).length >= 16 ? 'disabled' : ''}>Duplicate</button><button type="button" class="loom-service-delete" data-service-action="scene-remove" data-scene-id="${escape(scene.id)}">Delete scene</button></div></section>`;
    }
    macroControl(macro) {
      const value = clamp(finite(macro.value, .5), 0, 1);
      return `<div class="loom-service-macro"><div class="loom-service-macro-top"><span class="loom-service-macro-name">${escape(macro.name)}</span><button type="button" class="loom-service-macro-edit" data-service-action="macro-edit" data-macro-id="${escape(macro.id)}" aria-label="Edit ${escape(macro.name)} mappings">⋮</button></div><div class="loom-service-macro-dial" data-service-macro-dial="${escape(macro.id)}" style="--svc-turn:${value * 270}deg"><output data-service-macro-output="${escape(macro.id)}">${Math.round(value * 100)}</output></div><label><input type="range" min="0" max="1" step=".001" value="${value}" data-service-macro="${escape(macro.id)}" aria-label="${escape(macro.name)} macro"></label><div class="loom-service-macro-meta"><span>${(macro.mappings || []).length} mapping${macro.mappings?.length === 1 ? '' : 's'}</span><button type="button" data-service-action="macro-reset" data-macro-id="${escape(macro.id)}" title="Return to the unchanged sound at 50">Neutral</button></div></div>`;
    }
    macroEditor(snapshot) {
      const macro = this.macro(snapshot); if (!macro) return '';
      const tracks = this.tracks(snapshot);
      return `<div class="loom-service-macro-map"><div class="loom-service-map-heading"><strong>Recipe / ${escape(macro.name)}</strong><button type="button" data-service-action="macro-edit-close">Done</button></div><label class="loom-service-map-name">CONTROL NAME<input type="text" data-service-field="macro-name" value="${escape(macro.name)}" maxlength="40"></label>${(macro.mappings || []).map((mapping, index) => {
        const track = tracks.find(track => track.id === mapping.trackId) || tracks[0], targets = track?.targets || [], definition = targets.find(target => target.target === mapping.target);
        return `<div class="loom-service-mapping" data-service-mapping="${index}"><label>STATION<select data-service-map-field="trackId" data-map-index="${index}">${tracks.map(track => `<option value="${escape(track.id)}" ${track.id === mapping.trackId ? 'selected' : ''}>${escape(track.name)}</option>`).join('')}</select></label><button type="button" data-service-action="mapping-remove" data-map-index="${index}" class="loom-service-delete">Remove</button><label>PARAMETER<select data-service-map-field="target" data-map-index="${index}">${targets.map(target => `<option value="${escape(target.target)}" ${target.target === mapping.target ? 'selected' : ''}>${escape(target.label)}</option>`).join('')}</select></label><label>LOW VALUE<input type="number" data-service-map-field="min" data-map-index="${index}" value="${finite(mapping.min, definition?.min)}" min="${finite(definition?.min)}" max="${finite(mapping.baseline, definition?.value)}" step="${finite(definition?.step, .001)}"></label><label>HIGH VALUE<input type="number" data-service-map-field="max" data-map-index="${index}" value="${finite(mapping.max, definition?.max)}" min="${finite(mapping.baseline, definition?.value)}" max="${finite(definition?.max, 1)}" step="${finite(definition?.step, .001)}"></label><label>DIRECTION<select data-service-map-field="polarity" data-map-index="${index}"><option value="normal" ${mapping.polarity !== 'inverse' ? 'selected' : ''}>Normal ↗</option><option value="inverse" ${mapping.polarity === 'inverse' ? 'selected' : ''}>Inverse ↘</option></select></label></div>`;
      }).join('')}<div class="loom-service-map-add"><button type="button" data-service-action="mapping-add" ${(macro.mappings || []).length >= 32 ? 'disabled' : ''}>+ Mapping</button><p>50 preserves the source sound. Values below and above it move toward your two endpoints.</p></div></div>`;
    }
    padPanel(tracks) {
      return `<section class="loom-service-panel" aria-labelledby="loomServicePadsTitle"><div class="loom-service-panel-head"><div><h3 id="loomServicePadsTitle">A small interruption</h3><p>Hold to interfere. Release to return.</p></div></div><div class="loom-service-pad-tools"><label for="loomServicePadRate">STUTTER DIVISION</label><select id="loomServicePadRate" data-service-field="pad-rate"><option value=".5" ${this.padRate === .5 ? 'selected' : ''}>⅛ notes</option><option value=".25" ${this.padRate === .25 ? 'selected' : ''}>1/16 notes</option><option value=".125" ${this.padRate === .125 ? 'selected' : ''}>1/32 notes</option></select></div><p class="loom-service-pad-target-label">DROP TARGETS / STATIONS</p><div class="loom-service-pad-tracks" role="group" aria-label="Drop target tracks">${tracks.map((track, index) => `<button type="button" data-service-pad-track="${escape(track.id)}" aria-pressed="${this.padTracks.has(track.id)}" title="${escape(track.name)}" aria-label="Affect ${escape(track.name)} with the Drop pad" style="--svc-track:${escape(track.color || '#d9e694')}">${index + 1}</button>`).join('')}</div><div class="loom-service-pads"><button type="button" class="loom-service-pad" data-service-pad="stutter" aria-pressed="false"><strong>STUTTER</strong><small>Z / hold a tiny loop</small></button><button type="button" class="loom-service-pad" data-service-pad="fill" aria-pressed="false"><strong>FILL</strong><small>X / double-time the scene</small></button><button type="button" class="loom-service-pad" data-service-pad="drop" aria-pressed="false"><strong>DROP</strong><small>C / leave some space</small></button><button type="button" class="loom-service-release" data-service-action="release-pads"><strong>RELEASE ALL</strong><small>Back to the recipe</small></button></div><p class="loom-service-panel-note">Stutter and Fill affect the whole scene. Lit station numbers receive Drop. Release restores the performance; the saved sounds stay unchanged.</p></section>`;
    }
    capturePanel(snapshot, midiOpen) {
      const tracks = this.tracks(snapshot), scenes = this.scenes(snapshot), macros = this.macros(snapshot);
      const learnTargets = [['control:play', 'Play'], ['control:stop', 'Stop'], ...scenes.map(scene => ['scene:' + scene.id, 'Scene / ' + scene.name]), ...macros.map(macro => ['macro:' + macro.id, 'Macro / ' + macro.name]), ['pad:stutter', 'Pad / Stutter'], ['pad:fill', 'Pad / Fill'], ['pad:drop', 'Pad / Drop']];
      if (!learnTargets.some(([target]) => target === this.midiTarget)) this.midiTarget = 'control:play';
      return `<section class="loom-service-panel" aria-labelledby="loomServiceCaptureTitle"><div class="loom-service-panel-head"><div><h3 id="loomServiceCaptureTitle">Keep the take</h3><p>Capture scene changes, macros, and held pads.</p></div></div><div class="loom-service-capture-body"><div class="loom-service-take-readout"><output data-service-take-duration>0 bars</output><span data-service-take-events>0 instructions</span></div><button type="button" class="loom-service-apply" data-service-action="capture-apply" disabled>Create arrangement from take</button><p class="loom-service-muted">This button replaces the arrangement’s clips with the captured performance from bar one in one undoable step. Capture alone leaves the arrangement unchanged. GALLEY holds up to 64 bars. Return to GALLEY and Save to keep your scenes and take in the project.</p><button type="button" class="loom-service-clear-take" data-service-action="capture-clear">Discard captured take</button></div><details class="loom-service-midi" ${midiOpen ? 'open' : ''}><summary>MIDI / hands off the screen</summary><div class="loom-service-midi-body"><p>Connect a controller, enable MIDI, then choose a control and press Learn. Move a knob or play a pad to assign it. MIDI availability depends on your browser.</p><div class="loom-service-midi-actions"><button type="button" data-service-action="midi-enable">Enable MIDI</button></div><label>ASSIGN TO<select data-service-field="midi-target">${learnTargets.map(([target, label]) => `<option value="${escape(target)}" ${target === this.midiTarget ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label><div class="loom-service-midi-actions"><button type="button" data-service-action="midi-learn">Learn selected control</button><button type="button" data-service-action="midi-clear">Clear assignments</button></div><output class="loom-service-midi-state" data-service-midi-state></output><div class="loom-service-midi-bindings">${this.bindings(snapshot).map(binding => `<div class="loom-service-midi-binding"><span>${escape(binding.label || binding.target)} · ${escape(binding.note != null ? 'Note ' + binding.note : binding.cc != null ? 'CC ' + binding.cc : binding.number != null ? (binding.kind || binding.type || 'Control') + ' ' + binding.number : binding.type || 'MIDI')}</span><button type="button" data-service-action="midi-clear" data-midi-target="${escape(binding.target)}" aria-label="Clear MIDI assignment for ${escape(binding.target)}">×</button></div>`).join('')}</div></div></details></section>`;
    }
    bindings(snapshot) {
      const bindings = this.service(snapshot).midiBindings || snapshot.midi?.bindings || [];
      return Array.isArray(bindings) ? bindings : Object.entries(bindings).map(([target, binding]) => ({ ...binding, target }));
    }
    tick(snapshot = this.snapshot()) {
      if (!this.dialog.childElementCount) return;
      this.dialog.querySelectorAll('button,input,select').forEach(element => {
        const permitted = ['stop', 'panic', 'close'].includes(element.dataset.serviceAction);
        element.disabled = (!!snapshot.busy && !permitted) || element.dataset.serviceBaseDisabled === 'true';
      });
      const beat = Math.max(0, finite(snapshot.beat)), active = this.scenes(snapshot).find(scene => scene.id === snapshot.activeSceneId), queued = this.scenes(snapshot).find(scene => scene.id === snapshot.queuedSceneId);
      const text = (selector, value) => { const element = this.dialog.querySelector(selector); if (element && element.textContent !== String(value)) element.textContent = value; };
      text('[data-service-clock]', String(Math.floor(beat / 4) + 1).padStart(2, '0') + ' : ' + String(Math.floor(beat % 4) + 1).padStart(2, '0'));
      text('[data-service-transport-state]', snapshot.busy ? 'PREPARING SOURCES' : snapshot.running ? 'SERVICE RUNNING' : 'READY FOR SERVICE');
      text('[data-service-play-label]', snapshot.running ? '▶ Playing' : '▶ Play');
      text('[data-service-queue]', queued ? 'NEXT / ' + queued.name : active ? 'ON THE PASS / ' + active.name : 'NO ORDER WAITING');
      this.dialog.querySelectorAll('[data-service-scene-row]').forEach(row => {
        row.classList.toggle('is-active', row.dataset.serviceSceneRow === snapshot.activeSceneId);
        row.classList.toggle('is-queued', row.dataset.serviceSceneRow === snapshot.queuedSceneId);
        row.querySelector('[data-service-action="scene-launch"]')?.setAttribute('aria-pressed', String(row.dataset.serviceSceneRow === snapshot.activeSceneId));
      });
      const capture = snapshot.capture || {}, enabled = capture.enabled ?? this.service(snapshot).captureEnabled ?? false;
      this.dialog.querySelector('[data-service-action="capture-toggle"]')?.setAttribute('aria-pressed', String(enabled));
      text('[data-service-capture-label]', enabled ? 'Capture armed' : 'Capture off');
      const count = Array.isArray(capture.events) ? capture.events.length : finite(capture.events);
      text('[data-service-take-duration]', bars(capture.durationBeats) + ' bars');
      text('[data-service-take-events]', count + ' instruction' + (count === 1 ? '' : 's'));
      const apply = this.dialog.querySelector('[data-service-action="capture-apply"]');
      if (apply) apply.disabled = !capture.canApply || snapshot.running || snapshot.busy;
      const clear = this.dialog.querySelector('[data-service-action="capture-clear"]'); if (clear) clear.disabled = !count || snapshot.running;
      this.macros(snapshot).forEach(macro => {
        const value = clamp(finite(macro.value, .5), 0, 1), input = this.dialog.querySelector(`[data-service-macro="${this.cssEscape(macro.id)}"]`);
        if (input && document.activeElement !== input) input.value = value;
        text(`[data-service-macro-output="${this.cssEscape(macro.id)}"]`, Math.round(value * 100));
        this.dialog.querySelector(`[data-service-macro-dial="${this.cssEscape(macro.id)}"]`)?.style.setProperty('--svc-turn', value * 270 + 'deg');
      });
      this.tracks(snapshot).forEach((track, index) => {
        const meter = Array.isArray(snapshot.meters) ? snapshot.meters[index] : snapshot.meters?.[track.id];
        const level = finite(typeof meter === 'object' ? meter?.peak ?? meter?.left : meter);
        const fill = this.dialog.querySelector(`[data-service-meter="${this.cssEscape(track.id)}"]`);
        if (fill) fill.style.width = clamp(level * 100, 0, 100) + '%';
      });
      if (Array.isArray(snapshot.padState?.targetIds)) {
        this.padTracks = new Set(snapshot.padState.targetIds);
        this.dialog.querySelectorAll('[data-service-pad-track]').forEach(element => element.setAttribute('aria-pressed', String(this.padTracks.has(element.dataset.servicePadTrack))));
      }
      for (const kind of ['stutter', 'fill', 'drop']) {
        const held = (kind === 'drop' ? !!snapshot.padState?.drops?.some(Boolean) : !!snapshot.padState?.[kind]) || [...this.held.values()].some(pad => pad.kind === kind);
        const pad = this.dialog.querySelector(`[data-service-pad="${kind}"]`); pad?.classList.toggle('is-held', held); pad?.setAttribute('aria-pressed', String(held));
      }
      const midi = snapshot.midi || {}, inputs = midi.inputs || [], inputCount = Array.isArray(inputs) ? inputs.length : finite(inputs);
      const midiMessage = midi.error || (midi.supported === false ? 'MIDI is not available in this browser. Screen and keyboard controls still work.' : midi.learningTarget ? 'Learning / ' + midi.learningTarget : midi.status ? midi.status : midi.connected || inputCount ? inputCount + ' MIDI input' + (inputCount === 1 ? '' : 's') + ' connected.' : 'MIDI is off. Enable it to connect a controller.');
      text('[data-service-midi-state]', midiMessage);
      const midiEnable = this.dialog.querySelector('[data-service-action="midi-enable"]'); if (midiEnable) midiEnable.disabled = !!snapshot.busy || !!midi.pending || midi.supported === false;
      text('[data-service-status]', this.localMessage || snapshot.message || 'Launch a scene or press Play. Your arrangement remains on its own rail.');
    }
    cssEscape(value) { return window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&'); }
    focusKey(element) {
      const keys = ['serviceField', 'serviceMacro', 'serviceSlot', 'serviceMapField', 'serviceAction'];
      for (const key of keys) if (element.dataset?.[key]) return { key, value: element.dataset[key], mapIndex: element.dataset.mapIndex, sceneId: element.dataset.sceneId, macroId: element.dataset.macroId };
      return null;
    }
    findFocus(key) {
      return [...this.dialog.querySelectorAll('button,input,select')].find(element => element.dataset[key.key] === key.value && (key.mapIndex == null || element.dataset.mapIndex === key.mapIndex) && (key.sceneId == null || element.dataset.sceneId === key.sceneId) && (key.macroId == null || element.dataset.macroId === key.macroId));
    }
    click(event) {
      const pad = event.target.closest('[data-service-pad]');
      if (pad) { event.preventDefault(); return; }
      const track = event.target.closest('[data-service-pad-track]');
      if (track) { const id = track.dataset.servicePadTrack; if (this.padTracks.has(id)) this.padTracks.delete(id); else this.padTracks.add(id); track.setAttribute('aria-pressed', String(this.padTracks.has(id))); this.send('pad-targets', { trackIds: [...this.padTracks] }, false); return; }
      const button = event.target.closest('[data-service-action]'); if (!button || button.disabled) return;
      const action = button.dataset.serviceAction, snapshot = this.snapshot();
      if (action === 'scene-edit') { this.selectedSceneId = button.dataset.sceneId; this.render(snapshot); this.dialog.querySelector('[data-service-field="scene-name"]')?.focus({ preventScroll: true }); return; }
      if (action === 'macro-edit') { this.editingMacroId = button.dataset.macroId; this.render(snapshot); this.dialog.querySelector('[data-service-field="macro-name"]')?.focus({ preventScroll: true }); return; }
      if (action === 'macro-edit-close') { this.editingMacroId = null; this.render(snapshot); return; }
      if (action === 'macro-reset') { this.send('macro-value', { macroId: button.dataset.macroId, value: .5 }, false); return; }
      if (action === 'mapping-add' || action === 'mapping-remove') { this.editMapping(action, finite(button.dataset.mapIndex), snapshot); return; }
      if (action === 'release-pads') { this.releasePads(); this.send('release-pads', {}, false); return; }
      if (action === 'scene-create') { this.send(action, { source: button.dataset.source }); return; }
      if (['scene-launch', 'scene-duplicate', 'scene-remove'].includes(action)) { if (action === 'scene-launch') this.selectedSceneId = button.dataset.sceneId; this.send(action, { sceneId: button.dataset.sceneId }); return; }
      if (action === 'capture-toggle') { this.send(action, { enabled: !(snapshot.capture?.enabled ?? this.service(snapshot).captureEnabled) }); return; }
      if (action === 'capture-apply') { this.releasePads(); this.send(action, {}); return; }
      if (action === 'midi-learn') { this.send(action, { target: this.midiTarget }); return; }
      if (action === 'midi-clear') { this.send(action, button.dataset.midiTarget ? { target: button.dataset.midiTarget } : {}); return; }
      if (['stop', 'panic', 'close'].includes(action)) this.releasePads();
      this.send(action);
    }
    input(event) {
      const id = event.target.dataset.serviceMacro; if (!id) return;
      const value = clamp(finite(event.target.value, .5), 0, 1);
      this.dialog.querySelector(`[data-service-macro-output="${this.cssEscape(id)}"]`).textContent = Math.round(value * 100);
      this.dialog.querySelector(`[data-service-macro-dial="${this.cssEscape(id)}"]`).style.setProperty('--svc-turn', value * 270 + 'deg');
      this.send('macro-value', { macroId: id, value }, false);
    }
    change(event) {
      const element = event.target, field = element.dataset.serviceField, snapshot = this.snapshot(), scene = this.selectedScene(snapshot);
      if (field === 'quantize') { this.send('quantize', { value: finite(element.value, 4) }); return; }
      if (field === 'pad-rate') { this.releasePads(); this.padRate = finite(element.value, .25); return; }
      if (field === 'midi-target') { this.midiTarget = element.value; return; }
      if (field === 'macro-name') { const macro = this.macro(snapshot); if (macro) this.send('macro-update', { macroId: macro.id, patch: { name: element.value } }); return; }
      if (field === 'scene-name' && scene) { this.send('scene-update', { sceneId: scene.id, patch: { name: element.value } }); return; }
      if (field === 'scene-length' && scene) { this.send('scene-update', { sceneId: scene.id, patch: { lengthBeats: clamp(finite(element.value, 1), .25, 64) * 4 } }); return; }
      if (element.dataset.serviceSlot != null && scene) {
        const slots = (scene.slots || []).map(slot => ({ ...slot })), index = finite(element.dataset.serviceSlot), value = element.value;
        while (slots.length < 8) slots.push({ mode: 'silence' });
        slots[index] = value === 'hold' || value === 'silence' ? { mode: value } : { mode: 'clip', clipId: value };
        this.send('scene-update', { sceneId: scene.id, patch: { slots } }); return;
      }
      if (element.dataset.serviceMapField) this.changeMapping(element, snapshot);
    }
    editMapping(action, index, snapshot) {
      const macro = this.macro(snapshot); if (!macro) return;
      const mappings = (macro.mappings || []).map(mapping => ({ ...mapping }));
      if (action === 'mapping-remove') mappings.splice(index, 1);
      else {
        const track = this.tracks(snapshot)[0], target = track?.targets?.[0]; if (!track || !target) return;
        mappings.push({ trackId: track.id, target: target.target, ...(target.effectType ? { effectType: target.effectType } : {}), min: target.min, max: target.max, baseline: target.value ?? target.default ?? .5, polarity: 'normal' });
      }
      this.send('macro-update', { macroId: macro.id, patch: { mappings } });
    }
    changeMapping(element, snapshot) {
      const macro = this.macro(snapshot); if (!macro) return;
      const mappings = (macro.mappings || []).map(mapping => ({ ...mapping })), index = finite(element.dataset.mapIndex), mapping = mappings[index]; if (!mapping) return;
      const field = element.dataset.serviceMapField;
      if (field === 'trackId' || field === 'target') {
        mapping[field] = element.value;
        const track = this.tracks(snapshot).find(track => track.id === mapping.trackId), target = track?.targets?.find(target => target.target === mapping.target) || track?.targets?.[0]; if (!target) return;
        mapping.target = target.target; mapping.min = target.min; mapping.max = target.max; mapping.baseline = target.value ?? target.default ?? .5; mapping.polarity = 'normal';
        if (target.effectType) mapping.effectType = target.effectType; else delete mapping.effectType;
      } else if (field === 'polarity') mapping.polarity = element.value === 'inverse' ? 'inverse' : 'normal';
      else {
        const target = this.tracks(snapshot).find(track => track.id === mapping.trackId)?.targets?.find(target => target.target === mapping.target);
        const baseline = finite(mapping.baseline, target?.value);
        mapping[field] = clamp(finite(element.value), field === 'max' ? baseline : finite(target?.min), field === 'min' ? baseline : finite(target?.max, 1));
      }
      this.send('macro-update', { macroId: macro.id, patch: { mappings } });
    }
    startPad(key, kind, element) {
      if (this.held.has(key)) return;
      const payload = { kind, active: true, rate: this.padRate, trackIds: [...this.padTracks] };
      this.held.set(key, payload);
      element?.classList.add('is-held'); element?.setAttribute('aria-pressed', 'true');
      this.send('pad', payload, false);
    }
    stopPad(key) {
      const pad = this.held.get(key); if (!pad) return;
      this.held.delete(key);
      if (![...this.held.values()].some(held => held.kind === pad.kind)) this.send('pad', { ...pad, active: false }, false);
      this.tick(this.snapshot());
    }
    releasePads() {
      const pads = [...this.held.values()]; this.held.clear();
      const unique = new Map(pads.map(pad => [pad.kind, pad]));
      for (const pad of unique.values()) this.send('pad', { ...pad, active: false }, false);
      this.dialog.querySelectorAll('[data-service-pad]').forEach(element => { element.classList.remove('is-held'); element.setAttribute('aria-pressed', 'false'); });
    }
    pointerDown(event) {
      const element = event.target.closest('[data-service-pad]'); if (!element || (event.button !== 0 && event.pointerType !== 'touch')) return;
      event.preventDefault(); element.focus({ preventScroll: true });
      try { element.setPointerCapture(event.pointerId); } catch (_) { /* Release safety also covers window blur. */ }
      this.startPad('pointer:' + event.pointerId, element.dataset.servicePad, element);
    }
    pointerEnd(event) { this.stopPad('pointer:' + event.pointerId); }
    keydown(event) {
      if (!this.dialog.open || editTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase(), kind = { z: 'stutter', x: 'fill', c: 'drop' }[key];
      if (kind) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) this.startPad('key:' + key, kind, this.dialog.querySelector(`[data-service-pad="${kind}"]`)); return; }
      if ((event.key === ' ' || event.key === 'Enter') && event.target.closest('[data-service-pad]')) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) this.startPad('key:pad:' + event.code, event.target.closest('[data-service-pad]').dataset.servicePad, event.target.closest('[data-service-pad]')); return; }
      if (event.code === 'Space') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) this.send(this.snapshot().running ? 'stop' : 'play'); }
    }
    keyup(event) {
      const keys = ['key:' + event.key.toLowerCase(), 'key:pad:' + event.code];
      for (const key of keys) if (this.held.has(key)) { event.preventDefault(); event.stopPropagation(); this.stopPad(key); }
    }
  }
  window.LoomServiceUI = LoomServiceUI;
})();
