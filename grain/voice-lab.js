/* Advanced voice controls. All synthesis values stay in their physical units. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const bounded = (value, low, high) => Math.max(low, Math.min(high, value));
  const groups = ['body', 'noise', 'mod'];
  const names = { body: 'Body', noise: 'Noise', mod: 'Motion' };
  const colors = { body: '#ff8d45', noise: '#dcc85e', mod: '#91b7bd' };
  const waves = [['sine', 'Sine'], ['triangle', 'Triangle'], ['sawtooth', 'Sawtooth'], ['square', 'Square']];
  const curves = [['exponential', 'Exponential'], ['linear', 'Linear']];
  const filters = [['lowpass', 'Low-pass'], ['highpass', 'High-pass'], ['bandpass', 'Band-pass'], ['notch', 'Notch']];
  const targets = [['off', 'Off'], ['filter', 'Noise filter'], ['amplitude', 'Noise amplitude'], ['pitch', 'Noise pitch'], ['pan', 'Stereo pan']];
  const divisions = [['1/4', '1/4 · quarter note'], ['1/8', '1/8 · eighth note'], ['1/16', '1/16 · sixteenth note'], ['1/32', '1/32 · thirty-second note']];
  const targetNotes = {
    off: 'Choose a destination to hear the LFO move the sound.',
    filter: 'The LFO moves the noise filter around its base cutoff.',
    amplitude: 'The LFO makes the noise layer swell and recede.',
    pitch: 'The LFO bends the noise layer’s pitch around its base setting.',
    pan: 'The LFO moves the voice across the stereo field.'
  };

  class GrainVoiceLab {
    constructor(options) {
      this.getTrack = options.getTrack;
      this.getBpm = options.getBpm || (() => 120);
      this.remember = options.remember || (() => {});
      this.persist = options.persist || (() => {});
      this.onChange = options.onChange || (() => {});
      this.knobControl = options.knobControl;
      this.audition = options.audition;
      this.schema = window.GrainSynth;
      this.tab = 'body';
      this.tabs = Array.from($('synthesis-tabs').querySelectorAll('[data-synth-tab]'));

      this.tabs.forEach((button) => {
        button.id = 'synth-tab-' + button.dataset.synthTab;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', 'synthesis-layout');
        button.addEventListener('click', () => this.setTab(button.dataset.synthTab));
        button.addEventListener('keydown', (event) => {
          const index = this.tabs.indexOf(button);
          let next;
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % this.tabs.length;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + this.tabs.length - 1) % this.tabs.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = this.tabs.length - 1;
          if (next === undefined) return;
          event.preventDefault();
          this.setTab(this.tabs[next].dataset.synthTab);
          this.tabs[next].focus();
        });
      });
      const reset = $('synthesis-reset');
      if (reset) reset.addEventListener('click', () => this.reset());
    }

    setTab(tab) {
      if (!groups.includes(tab)) return;
      this.tab = tab;
      this.render();
    }

    settings() {
      return this.schema.ensureTrack(this.getTrack());
    }

    changed() {
      this.onChange();
      this.persist();
      this.draw();
    }

    reset() {
      const track = this.getTrack();
      this.remember();
      const synth = this.schema.ensureTrack(track);
      synth[this.tab] = clone(this.schema.defaults(track)[this.tab]);
      this.onChange();
      this.persist();
      this.render();
    }

    selector(key, label, options) {
      const wrapper = document.createElement('label');
      wrapper.className = 'synthesis-selector';
      const caption = document.createElement('span');
      caption.className = 'synthesis-selector-label';
      caption.textContent = label;
      const select = document.createElement('select');
      select.id = 'synth-' + this.tab + '-' + key;
      select.setAttribute('aria-label', names[this.tab] + ' ' + label.toLowerCase());
      options.forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.append(option);
      });
      select.value = this.settings()[this.tab][key];
      const group = this.tab;
      select.addEventListener('change', () => {
        this.remember();
        this.settings()[group][key] = select.value;
        this.changed();
      });
      wrapper.append(caption, select);
      return wrapper;
    }

    syncControl() {
      const wrapper = document.createElement('label');
      wrapper.className = 'synthesis-toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = 'synth-mod-sync';
      input.checked = this.settings().mod.sync;
      input.setAttribute('aria-label', 'Sync modulation to tempo');
      const caption = document.createElement('span');
      caption.textContent = 'TEMPO SYNC';
      input.addEventListener('change', () => {
        this.remember();
        this.settings().mod.sync = input.checked;
        this.changed();
      });
      wrapper.append(input, caption);
      return wrapper;
    }

    render() {
      const synth = this.settings();
      this.tabs.forEach((button) => {
        const active = button.dataset.synthTab === this.tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.removeAttribute('aria-pressed');
        button.tabIndex = active ? 0 : -1;
      });
      $('synthesis-layout').setAttribute('aria-labelledby', 'synth-tab-' + this.tab);
      const reset = $('synthesis-reset');
      if (reset) {
        reset.title = 'Restore ' + names[this.tab].toLowerCase() + ' settings for this voice';
        reset.setAttribute('aria-label', 'Reset ' + names[this.tab].toLowerCase() + ' synthesis settings');
      }
      const selectors = $('synthesis-selectors');
      selectors.replaceChildren();
      if (this.tab === 'body') {
        selectors.append(this.selector('wave', 'WAVEFORM', waves), this.selector('curve', 'ENVELOPE CURVE', curves));
      } else if (this.tab === 'noise') {
        selectors.append(this.selector('filter', 'FILTER TYPE', filters), this.selector('curve', 'ENVELOPE CURVE', curves));
      } else {
        selectors.append(
          this.selector('target', 'DESTINATION', targets),
          this.selector('wave', 'LFO WAVEFORM', [...waves, ['samplehold', 'Sample & hold']]),
          this.selector('division', 'SYNC DIVISION', divisions),
          this.syncControl()
        );
      }
      const knobs = $('synthesis-knobs');
      knobs.replaceChildren();
      knobs.dataset.group = this.tab;
      const group = this.tab;
      this.schema.descriptors[group].forEach((descriptor) => {
        const label = group === 'mod' && descriptor.key === 'rate' ? 'FREE RATE' : descriptor.label;
        const control = this.knobControl(
          'synth-' + group + '-' + descriptor.key,
          label,
          this.schema.toNormalized(synth[group][descriptor.key], descriptor),
          (normalized) => this.schema.format(this.schema.fromNormalized(normalized, descriptor), descriptor),
          (normalized) => {
            this.settings()[group][descriptor.key] = this.schema.fromNormalized(normalized, descriptor);
            this.onChange();
            this.draw();
          }
        );
        const slider = control.querySelector('[role="slider"]');
        if (slider) {
          slider.title = group === 'mod' && descriptor.key === 'rate' ? 'LFO rate when tempo sync is off' : descriptor.title;
          slider.setAttribute('aria-label', names[group] + ' ' + label.toLowerCase());
        }
        knobs.append(control);
      });
      this.draw();
    }

    modulationRate(mod) {
      if (!mod.sync) return mod.rate;
      const denominator = Number(String(mod.division).split('/')[1]) || 16;
      return (Number(this.getBpm()) || 120) / 60 * denominator / 4;
    }

    formatted(group, key, value) {
      const descriptor = this.schema.descriptors[group].find((entry) => entry.key === key);
      return this.schema.format(value, descriptor);
    }

    updateNote() {
      const synth = this.settings();
      const note = $('synthesis-note');
      note.replaceChildren();
      note.dataset.silent = String(this.tab !== 'mod' && synth[this.tab].level === 0);
      const add = (text, quiet) => {
        const paragraph = document.createElement('p');
        paragraph.className = 'synthesis-note-text' + (quiet ? ' muted' : '');
        paragraph.textContent = text;
        note.append(paragraph);
      };
      if (this.tab === 'body') {
        if (synth.body.level === 0) add('Body layer is silent. Raise BODY in Voice Lab to hear it.', true);
        add('Set the settled frequency, then shape the pitch sweep, harmonics, and amplitude envelope.');
      } else if (this.tab === 'noise') {
        if (synth.noise.level === 0) add('Noise layer is silent. Raise NOISE in Voice Lab to hear it.', true);
        add('Filter and envelope the noise independently. Bursts repeat the layer; spacing sets the time between them.');
      } else {
        add(targetNotes[synth.mod.target]);
        if (synth.mod.sync) add('Tempo sync: ' + synth.mod.division + ' at ' + Math.round(Number(this.getBpm()) || 120) + ' BPM. Audible rate: ' + this.formatted('mod', 'rate', this.modulationRate(synth.mod)) + '. FREE RATE keeps your unsynced setting.', true);
        else add('FREE RATE sets the LFO speed in hertz. Turn on tempo sync to follow the sequencer.', true);
        if (synth.mod.target !== 'off' && synth.mod.depth === 0) add('Depth is zero. Raise DEPTH to hear movement.', true);
      }
    }

    timeDisplay(values) {
      const container = $('envelope-times');
      container.replaceChildren();
      values.forEach(([label, value]) => {
        const entry = document.createElement('div');
        entry.className = 'envelope-time';
        const caption = document.createElement('span');
        caption.className = 'envelope-time-label';
        caption.textContent = label;
        const number = document.createElement('span');
        number.className = 'envelope-time-value';
        number.textContent = value;
        entry.append(caption, number);
        container.append(entry);
      });
    }

    draw() {
      const synth = this.settings();
      this.updateNote();
      if (this.tab === 'mod') {
        $('envelope-kicker').textContent = 'LOW-FREQUENCY OSCILLATOR';
        $('envelope-title').textContent = 'A slightly irregular stir.';
        $('envelope-description').textContent = targetNotes[synth.mod.target];
        this.timeDisplay([
          ['RATE', this.formatted('mod', 'rate', this.modulationRate(synth.mod))],
          ['DEPTH', this.formatted('mod', 'depth', synth.mod.depth)],
          ['CLOCK', synth.mod.sync ? synth.mod.division + ' note' : 'Unsynced']
        ]);
        this.drawLfo(synth.mod);
      } else {
        const settings = synth[this.tab];
        $('envelope-kicker').textContent = names[this.tab].toUpperCase() + ' AMPLITUDE';
        $('envelope-title').textContent = 'Attack. Hold. Take off the heat.';
        $('envelope-description').textContent = this.tab === 'body'
          ? 'The oscillator rises, holds, and fades. Envelope time is shown to scale.'
          : 'A separate envelope shapes the filtered noise. Every burst follows this curve.';
        this.timeDisplay(['attack', 'hold', 'decay'].map((key) => [key.toUpperCase(), this.formatted(this.tab, key, settings[key])]));
        this.drawEnvelope(settings);
      }
    }

    canvasFrame() {
      const canvas = $('envelope-canvas');
      const context = canvas.getContext('2d');
      if (!context) return null;
      const width = canvas.width, height = canvas.height;
      context.clearRect(0, 0, width, height);
      const box = { left: 28, right: width - 22, top: 23, bottom: height - 43 };
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(185,199,195,.12)';
      context.setLineDash([3, 7]);
      for (let row = 0; row < 5; row++) {
        const y = box.top + (box.bottom - box.top) * row / 4;
        context.beginPath(); context.moveTo(box.left, y); context.lineTo(box.right, y); context.stroke();
      }
      context.setLineDash([]);
      context.font = '16px "Courier New", monospace';
      context.fillStyle = '#929c99';
      context.textBaseline = 'top';
      return { canvas, context, width, height, box };
    }

    axisTimes(frame, duration) {
      const { context, box } = frame;
      const time = (seconds) => seconds < 1 ? Math.round(seconds * 1000) + ' ms' : Number(seconds.toFixed(2)) + ' s';
      context.textAlign = 'left'; context.fillText('0', box.left, box.bottom + 17);
      context.textAlign = 'center'; context.fillText(time(duration / 2), (box.left + box.right) / 2, box.bottom + 17);
      context.textAlign = 'right'; context.fillText(time(duration), box.right, box.bottom + 17);
      context.textAlign = 'left';
    }

    drawEnvelope(settings) {
      const frame = this.canvasFrame();
      if (!frame) return;
      const { canvas, context, box } = frame;
      const attack = settings.attack, hold = settings.hold, decay = settings.decay;
      const ahdDuration = attack + hold + decay;
      const duration = Math.max(.001, ahdDuration + .004);
      const x = (time) => box.left + (box.right - box.left) * time / duration;
      const y = (level) => box.bottom - (box.bottom - box.top) * level;
      const amplitude = (time) => {
        if (time < attack) return attack ? time / attack : 1;
        if (time < attack + hold) return 1;
        if (time > ahdDuration) {
          const endLevel = settings.curve === 'linear' ? 0 : .0001;
          return endLevel * bounded(1 - (time - ahdDuration) / .004, 0, 1);
        }
        const progress = bounded((time - attack - hold) / Math.max(.0001, decay), 0, 1);
        return settings.curve === 'linear' ? 1 - progress : Math.exp(-9.21034037 * progress);
      };
      const gradient = context.createLinearGradient(0, box.top, 0, box.bottom);
      gradient.addColorStop(0, this.tab === 'body' ? 'rgba(255,141,69,.2)' : 'rgba(220,200,94,.2)');
      gradient.addColorStop(1, 'rgba(220,200,94,0)');
      context.beginPath(); context.moveTo(box.left, box.bottom);
      for (let step = 0; step <= 240; step++) {
        const time = duration * step / 240;
        context.lineTo(x(time), y(amplitude(time)));
      }
      context.lineTo(box.right, box.bottom); context.closePath(); context.fillStyle = gradient; context.fill();
      context.beginPath(); context.moveTo(box.left, y(0));
      context.lineTo(x(attack), y(1)); context.lineTo(x(attack + hold), y(1));
      for (let step = 1; step <= 180; step++) {
        const time = attack + hold + decay * step / 180;
        context.lineTo(x(time), y(amplitude(time)));
      }
      context.lineTo(box.right, box.bottom);
      context.strokeStyle = colors[this.tab]; context.lineWidth = 2.5; context.lineJoin = 'round'; context.stroke();
      [attack, attack + hold].forEach((time) => {
        context.beginPath(); context.arc(x(time), box.top, 3.5, 0, Math.PI * 2); context.fillStyle = colors[this.tab]; context.fill();
      });
      this.axisTimes(frame, duration);
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', names[this.tab] + ' ' + settings.curve + ' envelope: attack ' + this.formatted(this.tab, 'attack', attack) + ', hold ' + this.formatted(this.tab, 'hold', hold) + ', decay ' + this.formatted(this.tab, 'decay', decay) + '.');
    }

    drawLfo(mod) {
      const frame = this.canvasFrame();
      if (!frame) return;
      const { canvas, context, box } = frame;
      const cycles = mod.wave === 'samplehold' ? 4 : 2;
      const duration = cycles / Math.max(.001, this.modulationRate(mod));
      const center = (box.top + box.bottom) / 2;
      const half = (box.bottom - box.top) / 2 * .88;
      const held = [.72, -.38, .12, -.81];
      const wave = (phase) => {
        const fraction = phase - Math.floor(phase);
        if (mod.wave === 'triangle') return 1 - 4 * Math.abs(fraction - .5);
        if (mod.wave === 'sawtooth') return fraction * 2 - 1;
        if (mod.wave === 'square') return fraction < .5 ? 1 : -1;
        if (mod.wave === 'samplehold') return held[Math.min(held.length - 1, Math.floor(phase))];
        return Math.sin(phase * Math.PI * 2);
      };
      context.strokeStyle = 'rgba(145,183,189,.22)'; context.lineWidth = 1;
      context.beginPath(); context.moveTo(box.left, center); context.lineTo(box.right, center); context.stroke();
      context.beginPath();
      for (let step = 0; step <= 480; step++) {
        const fraction = step / 480;
        const x = box.left + (box.right - box.left) * fraction;
        const y = center - wave(fraction * cycles) * mod.depth * half;
        if (step === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.lineWidth = 2.5;
      context.strokeStyle = mod.target === 'off' ? '#717d80' : colors.mod;
      context.lineJoin = 'round'; context.stroke();
      this.axisTimes(frame, duration);
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', mod.wave + ' LFO, ' + this.formatted('mod', 'rate', this.modulationRate(mod)) + ', depth ' + this.formatted('mod', 'depth', mod.depth) + ', destination ' + mod.target + '.');
    }
  }

  window.GrainVoiceLab = GrainVoiceLab;
}());
