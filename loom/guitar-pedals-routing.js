/* BOARD positions carry their settings and modulation when moved. */
(function (scope) {
  'use strict';
  function reorder(state, ownerId, slotIndex, from, to) {
    const S = scope.LoomSchema, owner = S.automationOwner(state, ownerId), effect = owner?.effects?.[slotIndex];
    if (effect?.type !== 'board' || !Number.isInteger(slotIndex)) throw Error('Choose an installed BOARD insert.');
    if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < 4)) throw Error('Choose one of the four pedal positions.');
    if (owner.freeze) throw Error('Unfreeze this track before moving its pedals.');
    if (from === to) return { state, changed: false, remapTarget: target => target };
    const order = [1, 2, 3, 4], moved = order.splice(from, 1)[0]; order.splice(to, 0, moved);
    const destinations = Object.fromEntries(order.map((previous, index) => [previous, index + 1]));
    const prefix = 'fx:' + slotIndex + ':';
    function remapTarget(target) {
      if (typeof target !== 'string' || !target.startsWith(prefix)) return target;
      const match = /^pedal([1-4])([A-Z].*)$/.exec(target.slice(prefix.length));
      return match ? prefix + 'pedal' + destinations[match[1]] + match[2] : target;
    }
    const params = { ...effect.params };
    for (const [key, value] of Object.entries(effect.params)) {
      const match = /^pedal([1-4])([A-Z].*)$/.exec(key);
      if (match) params['pedal' + destinations[match[1]] + match[2]] = value;
    }
    const nextOwner = { ...owner,
      effects: owner.effects.map((item, index) => index === slotIndex ? S.effect({ type: 'board', params }, true) : item),
      automation: (owner.automation || []).map(lane => {
        const target = remapTarget(lane.target); return target === lane.target ? lane : { ...lane, target };
      })
    };
    const next = { ...state,
      tracks: state.tracks.map(track => track.id === ownerId ? nextOwner : track),
      returns: state.returns.map(bus => bus.id === ownerId ? nextOwner : bus),
      master: state.master.id === ownerId ? nextOwner : state.master,
      lfos: (state.lfos || []).map(lfo => ({ ...lfo, routes: lfo.routes.map(route => {
        if (route.ownerId !== ownerId) return route;
        const target = remapTarget(route.target); return target === route.target ? route : { ...route, target };
      }) }))
    };
    // SERVICE macro mappings and recorded overrides use trackId. Preserve the
    // untouched branches and audio assets; moving a pedal never copies PCM.
    function remapService(value) {
      if (!value || typeof value !== 'object') return value;
      if (Array.isArray(value)) {
        const mapped = value.map(remapService); return mapped.some((item, index) => item !== value[index]) ? mapped : value;
      }
      let result = value;
      for (const [key, item] of Object.entries(value)) {
        const mapped = key === 'target' && value.trackId === ownerId ? remapTarget(item) : remapService(item);
        if (mapped !== item) { if (result === value) result = { ...value }; result[key] = mapped; }
      }
      return result;
    }
    if (state.service) next.service = remapService(state.service);
    for (const track of next.tracks) if (track.freeze && !S.freezeValid(next, track.id)) throw Error('Unfreeze ' + track.name + ' before remapping its shared performance targets.');
    return { state: next, changed: true, remapTarget, order };
  }
  scope.LoomGuitarPedalsRouting = Object.freeze({ reorder });
})(typeof window === 'undefined' ? globalThis : window);
