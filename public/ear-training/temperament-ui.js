const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PITCHES = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const nameOf = (tunings,id) => tunings.find(t => t.id === id)?.name || id;
export const tuningOptions = tunings => tunings.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join('');

export function temperamentReferenceScore() {
  return [
    {at:0,duration:.3,notes:[69],velocity:.7},
    {at:.6,duration:1.2,notes:[60,64,67],velocity:.8},
    {at:2,duration:1.2,notes:[66,70,73],velocity:.8},
    ...Array.from({length:12},(_,i) => ({at:3.5+i*.18,duration:.14,notes:[60+i],velocity:.8}))
  ];
}

export function renderTemperamentGuide(tunings) {
  return `<section id="temperament-guide" class="reference-lab temperament-guide"><p class="eyebrow">THE TUNING DESK</p><h2>One phrase. Eight ways to tune it.</h2><p class="muted">Compare the same A4 reference, two major chords, and a chromatic octave. Each preset has twelve notes per octave and A4 = 440 Hz. Its pitch layout stays fixed when the musical key changes.</p><div class="temperament-reference-controls"><label for="temperament-reference-tuning">TUNING <select id="temperament-reference-tuning">${tuningOptions(tunings)}</select></label><button id="temperament-reference-play" class="primary">▶ Hear this tuning</button></div><p class="small muted">Listen to the beating inside chords and the color of thirds and fifths. Interval exercises elsewhere in Overtone continue to use equal temperament.</p><details class="tuning-definitions"><summary>Explore the tuning definitions and pitch offsets</summary><div class="tuning-catalog">${tunings.map(t => `<article class="tuning-card"><h3>${escape(t.name)}</h3><p>${escape(t.description)}</p><div class="tuning-offsets" aria-label="Offsets from twelve-tone equal temperament in cents">${t.anchoredDeviations.map((cents,i) => `<span><small>${PITCHES[i]}</small><strong>${cents > .005 ? '+' : ''}${Math.abs(cents) < .005 ? '0.00' : cents.toFixed(2)}</strong></span>`).join('')}</div><p class="small muted">Offsets in cents from equal temperament, with A4 held at 440 Hz.</p></article>`).join('')}</div></details><p class="small muted">The just-intonation example is a fixed C-major 5-limit layout (Ellis Duodene). Kirnberger III uses the specified Kellner interpretation. Meantone and Pythagorean layouts have a wolf at G♯–E♭; different keys can therefore sound very different.</p><p class="small">Definitions: <a href="https://leware.net/temper/temper.htm" target="_blank" rel="noopener noreferrer">Pierre Lewis, Understanding Temperaments ↗</a> · <a href="https://www.huygens-fokker.org/docs/scales.zip" target="_blank" rel="noopener noreferrer">Scala tuning archive ↗</a></p></section>`;
}

export function renderTemperamentResult(record, summary, tunings) {
  const chancePercent = (summary.pValue*100).toPrecision(3);
  return `<div class="temperament-result"><p class="eyebrow">20-TRIAL ABX / COMPLETE</p><div class="summary-score">${summary.correct} / ${summary.trials}<span>${Math.round(summary.accuracy)}% CORRECT / 50% CHANCE BASELINE</span></div><h3>${summary.aboveChance ? 'Evidence above chance in this run.' : 'This run is inconclusive against chance.'}</h3><p>Under random 50% guessing, a score this high or higher occurs in about ${chancePercent}% of 20-trial runs (p = ${summary.pValue.toPrecision(3)}).</p><div class="temperament-result-pair"><p><strong>A</strong> ${escape(nameOf(tunings,record.tuningA))}</p><p><strong>B</strong> ${escape(nameOf(tunings,record.tuningB))}</p></div><p class="test-note">This comparison describes this pair, level, voice, and listening setup. Repeated tries can produce a high score by chance. Keep conditions consistent when comparing runs.</p><div class="input-actions"><button id="retake-temperament-test" class="primary">Test this pair again →</button><button id="temperament-return-practice" class="secondary">Return to practice</button><button class="quiet" data-page="progress">View test history</button></div></div>`;
}

export function renderTemperamentHistory(records, tunings, summarize, levelTitle) {
  if (!records.length) return '<section class="progress-panel"><p class="eyebrow">TEMPERAMENT ABX TESTS</p><h2>Can you hear the difference?</h2><p class="muted">Completed 20-trial comparisons are saved here, separately from practice.</p><button class="text-button" data-mode="temperaments">Open the temperament lab →</button></section>';
  const rows = records.slice().reverse().map(record => {
    const result = summarize(record);
    return `<tr><td>${escape(new Date(record.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'}))}<small>${escape(record.timbre)}</small></td><td class="temperament-pair-cell"><span>A: ${escape(nameOf(tunings,record.tuningA))}</span><span>B: ${escape(nameOf(tunings,record.tuningB))}</span><small>${escape(levelTitle(record.level))}</small></td><td>${result.correct} / ${result.trials}<small>${Math.round(result.accuracy)}%</small></td><td>${result.aboveChance ? 'Above chance' : 'Inconclusive'}<small>p = ${result.pValue.toPrecision(3)}</small></td></tr>`;
  }).join('');
  return `<section class="progress-panel"><h2>Temperament ABX tests</h2><p class="muted small">Separate completed 20-trial runs. Practice filters above do not combine or alter these results. The chance comparison is for each individual run.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Completed temperament ABX tests"><table class="log-table"><thead><tr><th>When / voice</th><th>Pair / level</th><th>Score</th><th>Chance comparison</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
