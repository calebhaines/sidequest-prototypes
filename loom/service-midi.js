(function (root) {
  'use strict';

  // MIDI is deliberately an opt-in control surface. It has no audio path and
  // cannot touch GALLEY while SERVICE is closed.
  const validTarget = value => typeof value === 'string' && (
    /^scene:[^\s:]{1,128}$/.test(value) ||
    /^macro:macro-(?:[1-9]|[12]\d|3[0-2])$/.test(value) ||
    /^control:(?:play|stop)$/.test(value) ||
    /^pad:(?:stutter|fill|drop)$/.test(value)
  );
  const integer = (value, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum;
  const copyBinding = value => ({ id: value.id, inputId: value.inputId, channel: value.channel, type: value.type, number: value.number, target: value.target });
  const keyFor = (binding, packet) => JSON.stringify([binding.id, packet.inputId, packet.channel, packet.type, packet.number]);
  const overlaps = (a, b) => a.type === b.type && a.number === b.number &&
    (a.inputId === '*' || b.inputId === '*' || a.inputId === b.inputId) &&
    (a.channel === null || b.channel === null || a.channel === b.channel);

  function listen(target, name, callback) {
    if (!target) return () => {};
    if (typeof target.addEventListener === 'function') {
      target.addEventListener(name, callback);
      return () => target.removeEventListener?.(name, callback);
    }
    const property = 'on' + name, previous = target[property];
    const listener = function (event) {
      try { if (typeof previous === 'function') previous.call(this, event); }
      finally { callback(event); }
    };
    target[property] = listener;
    return () => { if (target[property] === listener) target[property] = previous || null; };
  }

  class LoomServiceMidi {
    constructor(options = {}) {
      this._getBindings = typeof options.getBindings === 'function' ? options.getBindings : () => [];
      this._setBindings = typeof options.setBindings === 'function' ? options.setBindings : () => {};
      this._onAction = typeof options.onAction === 'function' ? options.onAction : () => {};
      this._onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
      this._access = null;
      this._inputs = new Map();
      this._levels = new Map();
      this._holds = new Map();
      this._subscribers = new Set();
      this._active = false;
      this._enabled = false;
      this._pending = false;
      this._destroyed = false;
      this._focusSuspended = false;
      this._learningTarget = null;
      this._status = 'MIDI is off.';
      this._request = null;
      this._sequence = 0;
      this._epoch = 0;
      this._removeAccessListener = null;
      this._removeLifecycle = [
        listen(root, 'blur', () => { this._focusSuspended = true; this.cancelLearn(); this.releaseAll('blur'); }),
        listen(root, 'focus', () => { this._focusSuspended = false; this._notify(); }),
        listen(root, 'pagehide', () => { this._focusSuspended = true; this.cancelLearn(); this.releaseAll('pagehide'); }),
        listen(root, 'pageshow', () => { this._focusSuspended = false; this._notify(); }),
        listen(root.document, 'visibilitychange', () => {
          if (root.document?.visibilityState === 'hidden') { this.cancelLearn(); this.releaseAll('hidden'); }
          this._notify();
        })
      ];
    }

    _bindings() {
      let values;
      try { values = this._getBindings(); } catch (_) { return []; }
      if (!Array.isArray(values)) return [];
      const result = [], ids = new Set();
      for (const value of values.slice(0, 256)) {
        if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || value.id.length > 160 || ids.has(value.id) ||
          typeof value.inputId !== 'string' || !value.inputId || value.inputId.length > 512 ||
          !(value.channel === null || integer(value.channel, 0, 15)) || !['note', 'cc'].includes(value.type) ||
          !integer(value.number, 0, 127) || !validTarget(value.target)) continue;
        ids.add(value.id); result.push(copyBinding(value));
      }
      return result;
    }

    _routing() {
      return this._enabled && this._active && !this._destroyed && !this._focusSuspended && root.document?.visibilityState !== 'hidden';
    }

    getSnapshot() {
      return {
        supported: typeof root.navigator?.requestMIDIAccess === 'function',
        enabled: this._enabled, pending: this._pending, active: this._active,
        routingActive: this._routing(), learningTarget: this._learningTarget,
        status: this._status,
        inputs: Array.from(this._inputs.values(), entry => ({
          id: String(entry.port.id), name: entry.port.name || 'MIDI input',
          manufacturer: entry.port.manufacturer || '', state: entry.port.state || 'connected',
          connection: entry.port.connection || 'open'
        })),
        bindings: this._bindings()
      };
    }

    subscribe(callback) {
      if (typeof callback !== 'function' || this._destroyed) return () => {};
      this._subscribers.add(callback);
      try { callback(this.getSnapshot()); } catch (_) {}
      return () => this._subscribers.delete(callback);
    }

    _notify(message) {
      if (typeof message === 'string' && message !== this._status) {
        this._status = message;
        try { this._onStatus(message); } catch (_) {}
      }
      if (!this._subscribers.size) return;
      const snapshot = this.getSnapshot();
      for (const callback of this._subscribers) { try { callback(snapshot); } catch (_) {} }
    }

    enable() {
      if (this._destroyed) return Promise.resolve(false);
      if (this._enabled) return Promise.resolve(true);
      if (this._request) return this._request;
      if (typeof root.navigator?.requestMIDIAccess !== 'function') {
        this._notify('MIDI is unavailable in this browser. Use a desktop browser with Web MIDI support, or the on-screen controls.');
        return Promise.resolve(false);
      }
      if (root.isSecureContext === false) {
        this._notify('MIDI needs HTTPS or localhost. Open the hosted Kitchen page to connect a controller.');
        return Promise.resolve(false);
      }
      const epoch = ++this._epoch;
      this._pending = true;
      this._notify('Waiting for MIDI permission…');
      // Invoke the browser API in the click's call stack. A synchronous browser
      // denial is converted to a promise so it cannot strand the retry latch.
      let permission;
      try { permission = root.navigator.requestMIDIAccess({ sysex: false }); }
      catch (error) { permission = Promise.reject(error); }
      this._request = (async () => {
        try {
          const access = await permission;
          if (this._destroyed || epoch !== this._epoch) return false;
          if (!access || !access.inputs || typeof access.inputs.values !== 'function') throw new Error('Invalid MIDI access');
          this._access = access;
          this._enabled = true;
          this._removeAccessListener = listen(access, 'statechange', () => this._syncInputs());
          this._syncInputs();
          return true;
        } catch (error) {
          if (this._destroyed || epoch !== this._epoch) return false;
          this._enabled = false;
          this._removeAccessListener?.(); this._removeAccessListener = null;
          for (const entry of this._inputs.values()) entry.remove();
          this._inputs.clear(); this._access = null;
          this._notify(error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
            ? 'MIDI permission was not granted. Allow MIDI in this site’s browser permissions, then try again.'
            : 'The MIDI connection could not be opened. Check your controller and try again.');
          return false;
        } finally {
          if (epoch === this._epoch) { this._pending = false; this._request = null; this._notify(); }
        }
      })();
      return this._request;
    }

    _syncInputs() {
      if (!this._enabled || this._destroyed) return;
      const available = new Map();
      for (const port of this._access.inputs.values()) {
        if (port && port.type !== 'output' && port.state !== 'disconnected' && typeof port.id === 'string' && port.id) available.set(port.id, port);
      }
      for (const [id, entry] of this._inputs) {
        if (available.get(id) === entry.port) continue;
        entry.remove(); this._inputs.delete(id); this._releaseInput(id);
      }
      for (const [id, port] of available) {
        if (!this._inputs.has(id)) this._inputs.set(id, { port, remove: listen(port, 'midimessage', event => this._receive(id, event)) });
      }
      const count = this._inputs.size;
      this._notify(this._learningTarget ? 'Learning: move one knob or press one key.' : count ? `${count} MIDI input${count === 1 ? '' : 's'} connected. Choose Learn, then move a knob or press a key.` : 'MIDI enabled. Connect a keyboard, pads, or knobs.');
    }

    learn(target) {
      if (!validTarget(target) || this._destroyed) return false;
      if (!this._enabled) { this._notify('Choose Enable MIDI before learning a control.'); return false; }
      if (!this._routing()) { this._notify('Open SERVICE to learn a MIDI control.'); return false; }
      this._learningTarget = target;
      this._notify('Learning: move one knob or press one key.');
      return true;
    }

    cancelLearn() {
      if (!this._learningTarget) return;
      this._learningTarget = null;
      this._notify('MIDI learn cancelled.');
    }

    setActive(active) {
      if (this._destroyed) return this.getSnapshot();
      this._active = Boolean(active);
      if (!this._active) { this.cancelLearn(); this.releaseAll('deactivate'); }
      this._notify();
      return this.getSnapshot();
    }

    _packet(inputId, event) {
      const data = event?.data;
      if (!data || data.length !== 3 || !integer(data[0], 0x80, 0xef) || !integer(data[1], 0, 127) || !integer(data[2], 0, 127)) return null;
      const kind = data[0] & 0xf0;
      if (kind !== 0x80 && kind !== 0x90 && kind !== 0xb0) return null;
      const type = kind === 0xb0 ? 'cc' : 'note', off = kind === 0x80 || (kind === 0x90 && data[2] === 0);
      return {
        source: 'midi', inputId, channel: data[0] & 0x0f, type, number: data[1],
        value: off ? 0 : data[2] / 127,
        high: type === 'note' ? !off : data[2] >= 64,
        off, timestamp: Number.isFinite(event.receivedTime) ? event.receivedTime : Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now()
      };
    }

    _receive(inputId, event) {
      if (!this._routing() || !this._inputs.has(inputId)) return;
      const packet = this._packet(inputId, event);
      if (!packet) return;
      let bindings = this._bindings();
      this._reconcile(bindings);
      if (this._learningTarget && !(packet.type === 'note' && packet.off)) {
        const target = this._learningTarget;
        const binding = { id: `midi-${Date.now().toString(36)}-${++this._sequence}`, inputId, channel: packet.channel, type: packet.type, number: packet.number, target };
        bindings = bindings.filter(value => value.target !== target && !overlaps(value, binding));
        bindings.push(binding);
        try { this._setBindings(bindings.map(copyBinding)); }
        catch (_) { this._notify('This MIDI assignment could not be saved. Try again.'); return; }
        this._learningTarget = null;
        this._reconcile(bindings);
        // Consuming a held key/high CC during Learn must not launch anything,
        // including on repeated messages until that control is released.
        this._levels.set(keyFor(binding, packet), { high: packet.high, inputId });
        this._notify(`Learned ${packet.type === 'cc' ? 'CC' : 'note'} ${packet.number}, channel ${packet.channel + 1}.`);
        return;
      }
      for (const binding of bindings) {
        if (binding.type !== packet.type || binding.number !== packet.number || (binding.inputId !== '*' && binding.inputId !== inputId) || (binding.channel !== null && binding.channel !== packet.channel)) continue;
        const key = keyFor(binding, packet), previous = this._levels.get(key)?.high || false;
        this._levels.set(key, { high: packet.high, inputId });
        if (binding.target.startsWith('macro:')) {
          if (!packet.off) this._dispatch(binding.target, packet.value, { ...packet, bindingId: binding.id, release: false, reason: 'message' });
        } else if (binding.target.startsWith('pad:')) {
          if (packet.high && !previous) {
            const alreadyHeld = this._heldTarget(binding.target);
            this._holds.set(key, { ...packet, bindingId: binding.id, target: binding.target });
            if (!alreadyHeld) this._dispatch(binding.target, 1, { ...packet, bindingId: binding.id, release: false, reason: 'message' });
          } else if (!packet.high) this._releaseKey(key, 'message');
        } else if (packet.high && !previous) this._dispatch(binding.target, 1, { ...packet, bindingId: binding.id, release: false, reason: 'message' });
      }
    }

    _dispatch(target, value, meta) {
      try { this._onAction(target, value, meta); }
      catch (_) { this._notify('The MIDI control could not be applied.'); }
    }

    _heldTarget(target) {
      for (const hold of this._holds.values()) if (hold.target === target) return true;
      return false;
    }

    _releaseKey(key, reason) {
      const hold = this._holds.get(key);
      if (!hold) return;
      this._holds.delete(key);
      if (!this._heldTarget(hold.target)) this._dispatch(hold.target, 0, { ...hold, release: true, reason });
    }

    _reconcile(bindings) {
      const valid = new Map(bindings.map(binding => [binding.id, binding]));
      for (const [key, hold] of this._holds) {
        const binding = valid.get(hold.bindingId);
        if (!binding || binding.target !== hold.target || binding.type !== hold.type || binding.number !== hold.number ||
          (binding.inputId !== '*' && binding.inputId !== hold.inputId) || (binding.channel !== null && binding.channel !== hold.channel)) this._releaseKey(key, 'assignment');
      }
      for (const key of this._levels.keys()) if (!valid.has(JSON.parse(key)[0])) this._levels.delete(key);
    }

    _releaseInput(inputId) {
      for (const [key, hold] of this._holds) if (hold.inputId === inputId) this._releaseKey(key, 'disconnect');
      for (const [key, level] of this._levels) if (level.inputId === inputId) this._levels.delete(key);
    }

    releaseAll(reason = 'release') {
      for (const key of Array.from(this._holds.keys())) this._releaseKey(key, reason);
      this._levels.clear();
      this._notify();
    }

    clear(idOrTarget) {
      if (this._destroyed) return 0;
      const before = this._bindings();
      const after = idOrTarget === undefined ? [] : before.filter(binding => binding.id !== idOrTarget && binding.target !== idOrTarget);
      try { this._setBindings(after.map(copyBinding)); }
      catch (_) { this._notify('The MIDI assignment could not be cleared.'); return 0; }
      this._reconcile(after);
      if (idOrTarget === undefined || idOrTarget === this._learningTarget) this.cancelLearn();
      this._notify(after.length ? 'MIDI assignment cleared.' : 'MIDI assignments cleared.');
      return before.length - after.length;
    }

    destroy() {
      if (this._destroyed) return;
      this.cancelLearn(); this.releaseAll('close');
      this._destroyed = true; this._active = false; this._enabled = false; this._pending = false;
      this._epoch++; this._request = null;
      this._removeAccessListener?.(); this._removeAccessListener = null;
      for (const entry of this._inputs.values()) entry.remove();
      this._inputs.clear(); this._access = null;
      for (const remove of this._removeLifecycle) remove();
      this._removeLifecycle = [];
      this._notify('MIDI disconnected.'); this._subscribers.clear();
    }
  }

  root.LoomServiceMidi = LoomServiceMidi;
})(window);
