// The editor keeps empty positions in place: editing never shifts the rhythm.
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ROOTS = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const QUALITY_NAMES = {major:'Major',minor:'Minor',diminished:'Diminished',augmented:'Augmented',sus2:'Suspended 2nd',sus4:'Suspended 4th',dominant7:'Dominant 7th',major7:'Major 7th',minor7:'Minor 7th','half-diminished':'Half-diminished 7th'};
export const ENSEMBLE_SHORTCUTS = 'awsedftgyhuj';

export function createEnsembleEditor(question) {
  return {roots:Array(4).fill(null),qualities:Array(4).fill(null),melody:Array(question.inputLength).fill(null),activeNote:0,noteHistory:[]};
}

export function ensembleResponse(question, editor) {
  return {chords:editor.roots.map((root,i) => question.chordOptions.find(c => c.root === root && c.quality === editor.qualities[i])?.value || null),melody:[...editor.melody]};
}

export function setEnsembleNote(editor, midi) {
  const slot = editor.activeNote;
  editor.noteHistory.push({slot,previous:editor.melody[slot]});
  editor.melody[slot] = midi;
  editor.activeNote = Math.min(slot+1,editor.melody.length-1);
}

export function undoEnsembleNote(editor) {
  const change = editor.noteHistory.pop();
  if (change) { editor.melody[change.slot] = change.previous; editor.activeNote = change.slot; }
}

export function renderEnsembleEditor(q, editor, {disabled=false,answered=false,revealed=false,busy=false} = {}) {
  const response = ensembleResponse(q,editor);
  const qualities = [...new Set(q.chordOptions.map(c => c.quality))];
  const noteLabel = midi => q.keyboard.find(k => k.midi === midi)?.label || '·';
  const chordLabel = value => q.chordOptions.find(c => c.value === value)?.label || '—';
  const full = response.chords.every(Boolean) && response.melody.every(Number.isFinite);
  const anyChords = response.chords.some(Boolean), anyMelody = response.melody.some(Number.isFinite);
  return `<div id="ensemble-editor" class="ensemble-editor">
    <div class="ensemble-heading"><p class="eyebrow">FOUR BARS / TWO PARTS</p><span class="small muted">${q.notesPerChord} melody note${q.notesPerChord === 1 ? '' : 's'} per chord</span></div>
    <p class="ensemble-instructions small muted">Build each chord with its root and type. Select a melody slot, then play a key below. Note timing is given; match the pitches in order.</p>
    <div class="ensemble-bars">${Array.from({length:4},(_,bar) => {
      const start = bar*q.notesPerChord;
      const chordClass = answered && !revealed ? response.chords[bar] === q.answer.chords[bar] ? 'correct' : 'incorrect' : '';
      return `<section class="ensemble-bar ${chordClass}" data-bar="${bar}" aria-label="Bar ${bar+1}"><div class="ensemble-bar-title"><span>BAR ${String(bar+1).padStart(2,'0')}</span><span aria-hidden="true">${answered && !revealed ? chordClass === 'correct' ? '✓' : '↳' : '⌁'}</span></div>
        <label for="ensemble-root-${bar}">CHORD ROOT</label><select id="ensemble-root-${bar}" data-ensemble-root="${bar}" aria-label="Chord ${bar+1} root" ${disabled ? 'disabled' : ''}><option value="">Choose root</option>${ROOTS.map((name,root) => `<option value="${root}" ${editor.roots[bar] === root ? 'selected' : ''}>${name}</option>`).join('')}</select>
        <label for="ensemble-quality-${bar}">CHORD TYPE</label><select id="ensemble-quality-${bar}" data-ensemble-quality="${bar}" aria-label="Chord ${bar+1} type" ${disabled ? 'disabled' : ''}><option value="">Choose type</option>${qualities.map(quality => `<option value="${quality}" ${editor.qualities[bar] === quality ? 'selected' : ''}>${escape(QUALITY_NAMES[quality] || quality)}</option>`).join('')}</select>
        <span class="eyebrow ensemble-melody-label">MELODY</span><div class="ensemble-note-slots">${Array.from({length:q.notesPerChord},(_,offset) => {
          const slot = start+offset, filled = Number.isFinite(editor.melody[slot]);
          const outcome = answered && !revealed ? editor.melody[slot] === q.answer.melody[slot] ? 'correct' : 'incorrect' : '';
          return `<button class="note-slot ${filled ? 'is-filled' : ''} ${editor.activeNote === slot ? 'is-active' : ''} ${outcome}" data-ensemble-slot="${slot}" ${filled ? `data-note="${editor.melody[slot]}"` : ''} aria-pressed="${editor.activeNote === slot}" aria-label="Melody note ${slot+1}: ${filled ? escape(noteLabel(editor.melody[slot])) : 'empty'}. Select to edit" ${disabled ? 'disabled' : ''}><small>${String(slot+1).padStart(2,'0')}</small><span>${filled ? escape(noteLabel(editor.melody[slot])) : '·'}</span></button>`;
        }).join('')}</div>
        ${answered ? `<div class="ensemble-solution"><small>CORRECT CHORD</small><strong>${escape(chordLabel(q.answer.chords[bar]))}</strong><small>CORRECT MELODY</small><span>${q.answer.melody.slice(start,start+q.notesPerChord).map(noteLabel).map(escape).join(' → ')}</span></div>` : ''}</section>`;
    }).join('')}</div>
    <div class="ensemble-keyboard-heading"><span class="eyebrow">ALL 12 NOTES / C5–B5</span><span class="small muted">${answered ? 'Answer recorded' : `Entering note ${editor.activeNote+1} of ${q.inputLength}`}</span></div>
    <div class="ensemble-keyboard" aria-label="Chromatic melody keyboard">${q.keyboard.map((k,i) => `<button class="ensemble-pitch-key ${[1,3,6,8,10].includes(k.midi%12) ? 'black' : 'white'}" data-ensemble-midi="${k.midi}" aria-label="Enter ${escape(k.label)} at melody note ${editor.activeNote+1}" ${disabled ? 'disabled' : ''}><span>${escape(k.label)}</span><kbd>${ENSEMBLE_SHORTCUTS[i].toUpperCase()}</kbd></button>`).join('')}</div>
    <div class="input-actions ensemble-edit-actions"><button id="ensemble-undo-note" class="secondary" ${disabled || !editor.noteHistory.length ? 'disabled' : ''}>Undo note</button><button id="ensemble-clear-notes" class="quiet" ${disabled || !anyMelody ? 'disabled' : ''}>Clear melody</button><button id="ensemble-clear-chords" class="quiet" ${disabled || !editor.roots.some(r => r !== null) && !editor.qualities.some(Boolean) ? 'disabled' : ''}>Clear chords</button></div>
    <div class="ensemble-preview"><span class="eyebrow">AUDITION YOUR RECONSTRUCTION</span><div class="input-actions"><button id="ensemble-play-mix" class="secondary" ${busy || !anyChords && !anyMelody || disabled && !answered ? 'disabled' : ''}>▶ My arrangement</button><button id="ensemble-play-chords" class="secondary" ${busy || !anyChords || disabled && !answered ? 'disabled' : ''}>▶ My chords</button><button id="ensemble-play-melody" class="secondary" ${busy || !anyMelody || disabled && !answered ? 'disabled' : ''}>▶ My melody</button><button id="ensemble-stop-preview" class="quiet" ${busy ? '' : 'disabled'}>Stop playback</button></div><p class="small muted">Empty slots stay silent in their original positions. Both parts must be complete before checking.</p></div>
    <div class="ensemble-submit"><span class="small muted">${response.chords.filter(Boolean).length} / 4 chords · ${response.melody.filter(Number.isFinite).length} / ${q.inputLength} melody notes</span><button id="ensemble-check" class="primary" ${disabled || !full ? 'disabled' : ''}>Check both parts →</button></div>
  </div>`;
}

export function renderEnsembleFeedback(q, result, {revealed=false} = {}) {
  return `<div id="ensemble-feedback" class="ensemble-feedback">${revealed ? '<p>Both original parts are shown in the bar editor. Audition them separately, then replay the mix.</p>' : `<div class="ensemble-part-scores"><div class="part-score ${result.chordsCorrect === 4 ? 'correct' : ''}"><span class="eyebrow">CHORDS</span><strong>${result.chordsCorrect} / 4</strong><small>roots and types matched</small></div><div class="part-score ${result.melodyCorrect === q.inputLength ? 'correct' : ''}"><span class="eyebrow">MELODY</span><strong>${result.melodyCorrect} / ${q.inputLength}</strong><small>notes in the right position</small></div></div><p class="small muted">A correct question requires both parts to match completely.</p>`}<div class="input-actions"><button id="ensemble-original-chords" class="secondary">▶ Original chords</button><button id="ensemble-original-melody" class="secondary">▶ Original melody</button></div></div>`;
}
