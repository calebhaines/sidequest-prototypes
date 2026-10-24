import assert from 'node:assert/strict';
import { ENSEMBLE_MODE, ENSEMBLE_LEVELS, generateEnsembleQuestion, gradeEnsemble, ensembleResponseEvents } from '../public/ear-training/ensemble.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const pc = midi => ((midi % 12) + 12) % 12;
const signature = notes => [...new Set(notes.map(pc))].sort((a, b) => a - b);
const chordSignatures = {
  major: [0,4,7], minor: [0,3,7], diminished: [0,3,6],
  sus2: [0,2,7], sus4: [0,5,7], dominant7: [0,4,7,10],
  minor7: [0,3,7,10], major7: [0,4,7,11], 'half-diminished': [0,3,6,10]
};
const expectedNotes = [4,4,8,8,8,12,12,16];
const expectedQualities = [2,2,3,4,6,7,9,9];
const playedPitches = new Set();
const advancedPitches = new Set();
const qualityCoverage = new Set();
const chromaticQuestions = Array(8).fill(0);
let checked = 0;

assert.equal(ENSEMBLE_MODE.id,'ensemble');
assert.equal(ENSEMBLE_LEVELS.length,8);
assert.throws(() => generateEnsembleQuestion('advanced'),RangeError);
assert.throws(() => gradeEnsemble({mode:'intervals'},{}),RangeError);
assert.throws(() => ensembleResponseEvents({mode:'intervals'},{}),RangeError);

for (let level = 1; level <= 8; level++) {
  const rng = seeded(19);
  for (let iteration = 0; iteration < 300; iteration++) {
    const q = generateEnsembleQuestion(`level-${level}`,rng);
    checked++;
    assert.equal(q.mode,'ensemble');
    assert.equal(q.level,`level-${level}`);
    assert.equal(q.inputLength,expectedNotes[level-1]);
    assert.equal(q.notesPerChord*4,q.inputLength);
    assert.equal(q.answer.chords.length,4);
    assert.equal(q.answer.melody.length,q.inputLength);
    assert.deepEqual(q.choices,[],'never offer complete progression answers');
    assert.equal(q.prompt,ENSEMBLE_MODE.prompt);
    assert.match(q.context,/major · four chords with a \d+-note melody · C5–B5 keyboard$/);
    assert.ok(!q.answer.chords.some(value => q.context.includes(value)));
    assert.ok(!q.context.includes(q.answer.melody.join(',')));
    assert.deepEqual(q.keyboard.map(k=>k.midi),[72,73,74,75,76,77,78,79,80,81,82,83]);
    assert.deepEqual(q.keyboard.map(k=>k.label),['C5','C♯5','D5','D♯5','E5','F5','F♯5','G5','G♯5','A5','A♯5','B5']);
    assert.equal(q.chordOptions.length,12*expectedQualities[level-1]);
    assert.equal(new Set(q.chordOptions.map(option=>option.value)).size,q.chordOptions.length);
    for (let root = 0; root < 12; root++) {
      const options = q.chordOptions.filter(option=>option.root===root);
      assert.equal(options.length,expectedQualities[level-1]);
      assert.ok(options.some(option=>option.quality==='major'));
      assert.ok(options.some(option=>option.quality==='minor'));
      for (const option of options) {
        assert.equal(option.value,`${root}:${option.quality}`);
        assert.equal(option.notes[0],36+root);
        assert.ok(option.notes.slice(1).every(midi=>Number.isInteger(midi)&&midi>=48&&midi<=70));
        assert.deepEqual(signature(option.notes),signature(chordSignatures[option.quality].map(n=>root+n)),`${option.value} pitch classes`);
      }
    }
    assert.equal(q.chordEvents.length,4);
    assert.equal(q.melodyEvents.length,q.inputLength);
    assert.equal(q.events.length,4+q.inputLength);
    assert.equal(q.melodyTimes.length,q.inputLength);
    assert.equal(q.melodyDurations.length,q.inputLength);
    assert.equal(q.totalDuration,4*q.chordDuration);
    const keyRoot = pc(q.reference[0].notes[0]);
    const majorScale = new Set([0,2,4,5,7,9,11].map(n=>(keyRoot+n)%12));
    assert.deepEqual(signature(q.reference[0].notes),signature([keyRoot,keyRoot+4,keyRoot+7]));
    q.chordEvents.forEach((event,i)=>{
      const option=q.chordOptions.find(option=>option.value===q.answer.chords[i]);
      assert.ok(option,'each answer must exist among root/quality options');
      assert.deepEqual(event.notes,option.notes);
      assert.equal(event.at,i*q.chordDuration);
      assert.equal(event.duration,q.chordDuration);
      assert.equal(event.voice,'warm');
      assert.equal(event.part,'chords');
      assert.ok(event.velocity>=.45&&event.velocity<=.6);
      assert.equal(q.melodyTimes[i*q.notesPerChord],event.at,'melody and harmony share every chord onset exactly');
      assert.ok(signature(event.notes).includes(pc(q.answer.melody[i*q.notesPerChord])),'onset melody note is a chord tone');
      qualityCoverage.add(option.quality);
    });
    q.melodyEvents.forEach((event,i)=>{
      assert.equal(event.at,q.melodyTimes[i]);
      assert.equal(event.duration,q.melodyDurations[i]);
      assert.equal(event.part,'melody');
      assert.equal(event.voice,undefined,'lead uses the global selected voice');
      assert.equal(event.velocity,.9);
      assert.deepEqual(event.notes,[q.answer.melody[i]]);
      assert.ok(Number.isInteger(event.notes[0])&&event.notes[0]>=72&&event.notes[0]<=83);
      playedPitches.add(event.notes[0]);
      if(level===8)advancedPitches.add(event.notes[0]);
      if(level<=4)assert.ok(signature(q.chordEvents[Math.floor(i/q.notesPerChord)].notes).includes(pc(event.notes[0])),'early levels use chord tones only');
      if(!majorScale.has(pc(event.notes[0]))) {
        assert.ok(i%q.notesPerChord!==0,'chromatic approaches do not replace chord-onset anchors');
        assert.ok(i+1<q.inputLength);
        assert.equal(Math.abs(q.answer.melody[i+1]-event.notes[0]),1,'chromatic note resolves by semitone on the following slot');
        assert.ok(majorScale.has(pc(q.answer.melody[i+1])),'the resolution stays in the key');
      }
    });
    if(q.answer.melody.some(midi=>!majorScale.has(pc(midi))))chromaticQuestions[level-1]++;
    assert.equal(q.events[0].at,0);
    assert.equal(q.events[1].at,0);
    assert.equal(q.events[0].part,'chords');
    assert.equal(q.events[1].part,'melody');
    assert.ok(Math.abs(Math.max(...q.events.map(e=>e.at+e.duration))-q.totalDuration)<1e-9);
    assert.deepEqual(gradeEnsemble(q,q.answer),{correct:true,chordsCorrect:4,melodyCorrect:q.inputLength,chordTotal:4,melodyTotal:q.inputLength});
    assert.deepEqual(gradeEnsemble(q,null),{correct:false,chordsCorrect:0,melodyCorrect:0,chordTotal:4,melodyTotal:q.inputLength});
    const partial={chords:[...q.answer.chords],melody:[...q.answer.melody]};
    partial.chords[1]=null;
    partial.melody[2]=q.answer.melody[2]===83?72:83;
    assert.deepEqual(gradeEnsemble(q,partial),{correct:false,chordsCorrect:3,melodyCorrect:q.inputLength-1,chordTotal:4,melodyTotal:q.inputLength});
    assert.equal(gradeEnsemble(q,{...q.answer,chords:[...q.answer.chords,'0:major']}).correct,false,'extra slots cannot pass');
    assert.equal(gradeEnsemble(q,{...q.answer,melody:[...q.answer.melody,72]}).correct,false);
    assert.deepEqual(ensembleResponseEvents(q,q.answer),q.events,'full reconstruction reproduces original event timings and voices');
    const response={chords:Array(4).fill(null),melody:Array(q.inputLength).fill(null)};
    response.chords[2]=q.chordOptions[0].value;
    response.melody[q.inputLength-2]=83;
    const questionBefore=JSON.stringify(q),responseBefore=JSON.stringify(response);
    const preview=ensembleResponseEvents(q,response);
    assert.equal(preview.length,2);
    assert.equal(preview.find(e=>e.part==='chords').at,2*q.chordDuration,'missing earlier chords do not shift the third chord');
    assert.equal(preview.find(e=>e.part==='melody').at,q.melodyTimes[q.inputLength-2],'missing melody slots retain their silence');
    assert.equal(ensembleResponseEvents(q,response,{part:'chords'}).length,1);
    assert.equal(ensembleResponseEvents(q,response,{part:'melody'}).length,1);
    assert.deepEqual(ensembleResponseEvents(q,{chords:[],melody:[]}),[]);
    assert.equal(JSON.stringify(q),questionBefore);
    assert.equal(JSON.stringify(response),responseBefore);
    assert.notEqual(preview.find(e=>e.part==='chords').notes,q.chordOptions[0].notes);
  }
}
assert.equal(playedPitches.size,12);
assert.equal(advancedPitches.size,12,'advanced melodies actually use the full chromatic keyboard over generated questions');
assert.deepEqual([...qualityCoverage].sort(),Object.keys(chordSignatures).sort());
assert.ok(chromaticQuestions.slice(0,4).every(n=>n===0));
assert.ok(chromaticQuestions.slice(4).every(n=>n>50),'higher levels actually generate chromatic approach notes');
console.log(`PASS: ${checked} harmony+melody questions; all12 melody notes/root choices, independent chord signatures, simultaneous onsets, grading, chromatic resolution, and partial preview timing. Chromatic-question counts: ${chromaticQuestions.join('/')}.`);
