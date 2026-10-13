import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
export async function loadInvestigationData() {
  const temporary = await mkdtemp(join(tmpdir(), 'lady-supine-data-qa-'));
  try {
    const filenames = (await readdir(resolve(root, 'src/data'))).filter(name => name.endsWith('.ts'));
    for (const filename of filenames) {
      const source = await readFile(resolve(root, 'src/data', filename), 'utf8');
      const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      await writeFile(join(temporary, filename.replace(/\.ts$/, '.js')), output);
    }
    const requireTemporary = createRequire(join(temporary, 'validator.cjs'));
    const types = requireTemporary('./investigationTypes.js');
    const campaign = requireTemporary('./campaign.js');
    const game = requireTemporary('./game.js');
    let investigations;
    if (filenames.includes('investigations.ts')) investigations = requireTemporary('./investigations.js');
    else {
      const cases = [];
      for (const filename of ['investigationsEarly.ts', 'investigationsMiddle.ts', 'investigationsLate.ts']) {
        if (filenames.includes(filename)) {
          const exports = requireTemporary(`./${filename.replace(/\.ts$/, '.js')}`);
          for (const value of Object.values(exports)) if (Array.isArray(value)) cases.push(...value);
        }
      }
      investigations = { INVESTIGATIONS: cases };
    }
    return { ...types, ...campaign, ...game, ...investigations };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

const words = value => String(value || '').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;
const textWords = values => values.reduce((total, value) => total + words(value), 0);
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label}: duplicate IDs`);
const kinds = ['ledger', 'cipher', 'balance', 'sequence', 'route', 'circuit'];
function permutations(values) {
  if (values.length < 2) return [[...values]];
  return values.flatMap((value, index) => permutations(values.filter((_, other) => other !== index)).map(rest => [value, ...rest]));
}
function auditLedger(challenge, condition) {
  const { board } = challenge;
  assert.equal(board.columns.length, 2, `${challenge.id}: independent audit expects two columns`);
  let count = 0;
  let inferred;
  for (const left of permutations(board.columns[0].options)) {
    for (const right of permutations(board.columns[1].options)) {
      const candidate = Object.fromEntries(board.rows.flatMap((row, index) => [[`${row.id}.${board.columns[0].id}`, left[index]], [`${row.id}.${board.columns[1].id}`, right[index]]]));
      if (condition(candidate, board)) { count++; inferred = candidate; }
    }
  }
  assert.equal(count, 1, `${challenge.id}: prose constraints yield ${count} possible ledgers`);
  assert.deepEqual(inferred, board.solution, `${challenge.id}: unique clue inference disagrees with supplied answers`);
  return { id: challenge.id, kind: 'ledger', result: 'Unique solution independently enumerated from the stated clues', candidatesTested: 14400 };
}
function auditSequence(challenge, condition) {
  const possibilities = permutations(challenge.board.cards.map(card => card.id)).filter(order => condition(Object.fromEntries(order.map((id, index) => [id, index]))));
  assert.equal(possibilities.length, 1, `${challenge.id}: chronological clues yield ${possibilities.length} orders`);
  assert.deepEqual(possibilities[0], challenge.board.solution, `${challenge.id}: inferred chronology differs from solution`);
  return { id: challenge.id, kind: 'sequence', result: 'Unique chronology independently enumerated', candidatesTested: 5040 };
}
function auditIndexedCipher(challenge, evidenceTitle, separator = /[:.]/) {
  const evidence = challenge.evidence.find(piece => piece.title === evidenceTitle);
  assert(evidence, `${challenge.id}: indexed poem missing`);
  const lines = evidence.text.split('\n').map(line => line.replace(/^\d+\.\s*/, '').split(/\s+/).map(word => word.replace(/[^a-zA-Z]/g, '')));
  const labels = challenge.board.inscription.split('\n');
  const decoded = labels.map(label => {
    const groups = label.slice(label.indexOf(':') + 1).match(/\d+[:.]\d+[:.]\d+/g);
    assert(groups?.length, `${challenge.id}: cipher has no coordinates`);
    return groups.map(group => {
      const [row, word, letter] = group.split(separator).map(Number);
      const reversed = challenge.id === 'portrait_washday' && row % 2 === 0;
      const rowWords = reversed ? [...lines[row - 1]].reverse() : lines[row - 1];
      const selectedWord = rowWords?.[word - 1];
      const character = selectedWord?.[challenge.id === 'patient_window_words' ? selectedWord.length - letter : letter - 1];
      assert(character, `${challenge.id}: impossible coordinate ${group}`);
      return character;
    }).join('').toLowerCase();
  });
  const expected = Object.values(challenge.board.solution).map(answer => answer.toLowerCase());
  assert.deepEqual(decoded, expected, `${challenge.id}: clue-directed decoding differs from the required answers`);
  return { id: challenge.id, kind: 'cipher', result: 'Every coordinate decoded independently using the printed rule', decoded };
}
function auditBalance(challenge, equations) {
  const fields = challenge.board.fields.map(field => field.id);
  const matrix = equations.map(([terms, total]) => [...fields.map(field => terms[field] || 0), total]);
  let pivot = 0;
  const solution = Array(fields.length).fill(0);
  for (let column = 0; column < fields.length; column++) {
    const selected = matrix.findIndex((row, index) => index >= pivot && Math.abs(row[column]) > 1e-9);
    assert(selected >= 0, `${challenge.id}: balance equations do not uniquely determine ${fields[column]}`);
    [matrix[pivot], matrix[selected]] = [matrix[selected], matrix[pivot]];
    const divisor = matrix[pivot][column];
    matrix[pivot] = matrix[pivot].map(value => value / divisor);
    for (let row = 0; row < matrix.length; row++) {
      if (row === pivot) continue;
      const multiplier = matrix[row][column];
      matrix[row] = matrix[row].map((value, index) => value - multiplier * matrix[pivot][index]);
    }
    pivot++;
  }
  for (const row of matrix.slice(fields.length)) assert(Math.abs(row.at(-1)) < 1e-8, `${challenge.id}: contradictory balance equation`);
  fields.forEach((field, index) => {
    solution[index] = matrix[index].at(-1);
    assert(Math.abs(solution[index] - Number(challenge.board.solution[field])) < 1e-8, `${challenge.id}: independently solved value for ${field} differs from answer`);
  });
  return { id: challenge.id, kind: 'balance', result: 'Full-rank linear system independently solved; all stated cross-checks consistent', values: Object.fromEntries(fields.map((field, index) => [field, Number(solution[index].toFixed(9))])) };
}

export function independentAudits(investigations) {
  const challenges = investigations.flatMap(investigation => investigation.challenges);
  const find = id => challenges.find(challenge => challenge.id === id);
  const reviews = [];
  const firstLedger = challenges.find(challenge => challenge.board.kind === 'ledger' && challenge.board.rows.some(row => row.id === 'vellum') && challenge.board.columns.some(column => column.id === 'seal'));
  if (firstLedger) reviews.push(auditLedger(firstLedger, (candidate, board) => {
    const seals = board.rows.map(row => candidate[`${row.id}.seal`]);
    const defects = board.rows.map(row => candidate[`${row.id}.error`]);
    const seal = text => seals.findIndex(value => value.includes(text));
    const defect = text => defects.indexOf(text);
    return seal('Leaf') === seal('Door') + 1 && ![0, 4].includes(seal('Thread'))
      && seal('Eye') === seal('Bell') + 2 && defect('Missing name') === seal('Eye')
      && defect('Duplicate kiss') === defect('Reversed date') + 1
      && defect('Blank address') === defect('Reversed date') - 1
      && defect('Absent witness') < defect('Blank address') && defect('Reversed date') === seal('Bell');
  }));
  const harvestLedger = challenges.find(challenge => challenge.board.kind === 'ledger' && challenge.board.rows.some(row => row.id === 'apricot'));
  if (harvestLedger) reviews.push(auditLedger(harvestLedger, candidate => {
    const destinations = ['apricot', 'pear', 'millet', 'willow', 'plum'];
    const charge = row => Number(candidate[`${row}.charge`]);
    const destinationCharge = destination => charge(destinations.find(row => candidate[`${row}.destination`] === destination));
    return ['Compost', 'Hospital', 'Storehouse', 'Casino', 'Castle'].slice(1).every((destination, index) => destinationCharge(destination) === destinationCharge(['Compost', 'Hospital', 'Storehouse', 'Casino'][index]) + 3)
      && charge('pear') === 16 && charge('willow') === charge('millet') + 3 && charge('plum') < charge('apricot') && charge('apricot') < charge('millet');
  }));
  const portraitLedger = find('portrait_sources');
  if (portraitLedger) reviews.push(auditLedger(portraitLedger, (candidate, board) => {
    const subjects = board.rows.map(row => candidate[`${row.id}.subject`]);
    const makers = board.rows.map(row => candidate[`${row.id}.maker`]);
    const subject = value => subjects.indexOf(value);
    const maker = value => makers.indexOf(value);
    return subject('Sleeping neighbor') < maker('Fenn') && Math.abs(subject('Wooden bird') - subject('Bread cloth')) === 1
      && maker('Sella') < maker('Orris') && subject('Wash basin') < maker('Brindle')
      && Math.abs(subject('Child’s shoes') - maker('Marta')) === 1
      && Math.abs(subject('Child’s shoes') - subject('Wooden bird')) === 2 && maker('Brindle') < maker('Fenn')
      && ![0, 4].includes(subject('Wash basin')) && maker('Orris') + 1 === maker('Marta');
  }));
  const patientLedger = find('patient_five_continuities');
  if (patientLedger) reviews.push(auditLedger(patientLedger, (candidate, board) => {
    const patients = board.rows.map(row => candidate[`${row.id}.patient`]);
    const traces = board.rows.map(row => candidate[`${row.id}.trace`]);
    const patient = value => patients.indexOf(value);
    const trace = value => traces.indexOf(value);
    return patient('Tern') === patient('Sable') + 1 && trace('Song') < trace('Habit')
      && Math.abs(trace('Smell') - trace('Habit')) === 2 && patient('Sable') === trace('Habit')
      && ![0, 4].includes(trace('Name')) && Math.abs(trace('Song') - trace('Habit')) === 1
      && Math.abs(patient('Elsi') - trace('Habit')) === 1 && trace('Promise') < patient('Morrow');
  }));
  const palaceLedger = find('palace_ledger');
  if (palaceLedger) reviews.push(auditLedger(palaceLedger, candidate => {
    const posts = ['Bell', 'Chair', 'Door', 'Window', 'Pipe'];
    const people = ['hush', 'rook', 'velvet', 'quill', 'sable'];
    const post = person => posts.indexOf(candidate[`${person}.post`]);
    const sound = expected => post(people.find(person => candidate[`${person}.sound`] === expected));
    return post('rook') === post('hush') + 1 && post('velvet') < post('hush') && post('sable') > post('rook') && post('quill') !== 3
      && candidate['hush.sound'] === 'Tick' && sound('Hum') === sound('Rain') + 1 && sound('Sigh') === sound('Tick') + 1
      && sound('Chime') !== 0 && candidate['velvet.sound'] !== 'Rain';
  }));
  const lastLedger = find('last_ledger');
  if (lastLedger) reviews.push(auditLedger(lastLedger, candidate => {
    const people = ['pip', 'brindle', 'ada', 'thimble', 'vellum'];
    const reserve = person => Number(candidate[`${person}.reserve`]);
    const projectReserve = project => reserve(people.find(person => candidate[`${person}.purpose`] === project));
    const order = [...people].sort((left, right) => reserve(left) - reserve(right));
    return projectReserve('Bench') === projectReserve('Poem') + 2 && projectReserve('Curtain') === projectReserve('Repair') * 2
      && reserve('vellum') === 16 && reserve('ada') < reserve('pip')
      && order.indexOf('thimble') === order.indexOf('brindle') + 1 && order.indexOf('vellum') === order.indexOf('thimble') + 1
      && !['Curtain', 'Repair'].includes(candidate['pip.purpose']) && candidate['ada.purpose'] !== 'Poem' && candidate['thimble.purpose'] !== 'Catalogue';
  }));
  const palaceSequence = find('palace_sequence');
  if (palaceSequence) reviews.push(auditSequence(palaceSequence, p => p.mirror + 1 === p.water && p.water + 2 === p.curtain && p.broadcast > p.curtain && p.broadcast !== 6 && p.door > p.broadcast && p.witness < p.mirror && p.bell > p.mirror && p.bell < p.curtain));
  const lastSequence = find('last_sequence');
  if (lastSequence) reviews.push(auditSequence(lastSequence, p => p.choice === 6 && p.pool + 1 === p.choice && p.copies + 1 === p.protect && p.copies + 2 === p.refund && p.original < p.copies && p.refund > p.protect && p.refund < p.declare && p.declare < p.pool));
  for (const [id, title] of [['portrait_washday', 'The six rows'], ['patient_window_words', 'The stitched poem'], ['palace_cipher', 'Eight lines of the relief book'], ['last_cipher', 'Eight lines of the first charter']]) {
    const challenge = find(id);
    if (challenge) reviews.push(auditIndexedCipher(challenge, title));
  }
  const portraitSequence = find('portrait_layers');
  if (portraitSequence) reviews.push(auditSequence(portraitSequence, p => p.eye === p.trace + 4 && p.varnish === p.eye + 1 && p.cup < p.sleeve && p.trace < p.chair && p.chair < p.cup && p.original < p.chair && p.trace !== 0));
  const afternoonSequence = find('afternoon_sequence');
  if (afternoonSequence) reviews.push(auditSequence(afternoonSequence, p => p.borrow < p.copy && p.copy < p.inspect && p.inspect < p.notice && p.notice === p.borrow + 3 && p.appeal === p.notice + 1 && p.freeze === p.notice + 2 && p.erase > p.freeze));
  const harvestSequence = find('harvest_sequence');
  if (harvestSequence) reviews.push(auditSequence(harvestSequence, p => p.measure === p.sow + 1 && p.measure < p.divide && p.divide < p.permit && p.permit < p.collect && p.collect === p.measure + 3 && p.collect < p.seal && p.seal < p.discard));
  const patientSequence = find('patient_transfer_order');
  if (patientSequence) reviews.push(auditSequence(patientSequence, p => p.shuttle === p.wake + 3 && p.release === p.confirm + 1 && p.echo < p.latch && p.latch < p.shuttle && p.read < p.echo && p.wake < p.echo && p.wake !== 0 && p.confirm > p.shuttle));
  const balanceModels = {
    afternoon_balance: [[{ elin: 1, library: 1 }, 40], [{ library: 1, gate: 1 }, 30], [{ ward: 1, elin: -1 }, 6], [{ elin: 1, collector: -2 }, 1], [{ elin: 1, library: 1, collector: 1, ward: 1, gate: 1 }, 93], [{ ward: 1, library: 1 }, 46]],
    harvest_balance: [[{ patients: 1, workers: -1 }, 6], [{ travellers: 1, workers: -1 }, -3], [{ seeds: 1, workers: -.5 }, 0], [{ buffer: 1, workers: -1 / 3 }, 0], [{ workers: 1, patients: 1, travellers: 1, seeds: 1, buffer: 1 }, 72], [{ patients: 1, travellers: 1, workers: -2 }, 3]],
    portrait_restoration: [[{ ink: 1, wood: 1, thread: 1, tea: 1, light: 1 }, 42], [{ wood: 1, ink: -1 }, 4], [{ thread: 1, tea: 1 }, 14], [{ ink: 1, thread: 1 }, 15], [{ tea: 1, light: 1 }, 16]],
    patient_reserve: [[{ care: 1, listening: 1, warmth: 1, writing: 1, observation: 1 }, 44], [{ care: 1, listening: 1 }, 13], [{ listening: 1, warmth: 1, writing: 1 }, 23], [{ observation: 1, warmth: -1 }, 2], [{ care: 1, writing: 1 }, 15]],
    palace_balance: [[{ wall: 1, bell: 1, drum: 1, water: 1, chair: 1 }, 44], [{ bell: 1, wall: -1, drum: -1 }, 0], [{ bell: 1, drum: 1 }, 18], [{ water: 1, drum: -2 }, 1], [{ wall: 1, chair: -1 }, 1]],
    last_balance: [[{ house: 1, ward: 1, threshold: 1, common: 1, return: 1 }, 90], [{ ward: 1, return: -1 }, 8], [{ common: 1, return: -2 }, 0], [{ house: 1, ward: 1, threshold: -1 }, 0], [{ threshold: 1, common: -1, return: -1 }, 0]],
  };
  for (const [id, equations] of Object.entries(balanceModels)) {
    const challenge = find(id);
    if (challenge) reviews.push(auditBalance(challenge, equations));
  }
  const dictionaryCipher = find('afternoon_cipher');
  if (dictionaryCipher) {
    const dictionary = ['WILLOW', 'TOMORROW', 'READER', 'FINITE', 'HOSPITAL', 'KETTLE', 'UNDOOR'].sort((left, right) => left.length - right.length || left.localeCompare(right));
    const decoded = dictionaryCipher.board.inscription.split('|').map(group => group.match(/\d+:\d+/g).map(token => { const [word, letter] = token.split(':').map(Number); return dictionary[word - 1][letter - 1]; }).join(''));
    assert.deepEqual(decoded.map(value => value.replace(/\s/g, '')), Object.values(dictionaryCipher.board.solution).map(value => value.replace(/\s/g, '')), 'afternoon_cipher: independent dictionary decoding differs');
    reviews.push({ id: dictionaryCipher.id, kind: 'cipher', result: 'Sorted binding dictionary decoded independently', decoded });
  }
  const harvestCipher = find('harvest_cipher');
  if (harvestCipher) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const substitution = [...new Set('ABUNDANCE' + alphabet)].join('');
    const decoded = harvestCipher.board.inscription.split(/\s*\/\s*/).map(word => [...word].map(letter => alphabet[substitution.indexOf(letter)]).reverse().join('')).join(' ');
    assert.equal(decoded, harvestCipher.board.solution.message, 'harvest_cipher: substitution and reversal do not recover answer');
    reviews.push({ id: harvestCipher.id, kind: 'cipher', result: 'Keyed alphabet and reversed words decoded independently', decoded });
  }
  return reviews;
}

export function verifyBoard(challenge, data) {
  const { board } = challenge;
  const label = challenge.id;
  const progress = { answers: {}, hints: 0, solved: false };
  assert(challenge.title && challenge.task && challenge.narrative.length && challenge.evidence.length && challenge.resolution.length, `${label}: incomplete player content`);
  assert.equal(challenge.hints.length, 3, `${label}: three progressive hints are required`);
  assert(challenge.minutes.min > 0 && challenge.minutes.min <= challenge.minutes.typical && challenge.minutes.typical <= challenge.minutes.max, `${label}: invalid pacing range`);
  assert(kinds.includes(board.kind), `${label}: unknown board type`);
  if (board.kind === 'ledger') {
    unique(board.rows.map(row => row.id), label);
    unique(board.columns.map(column => column.id), label);
    const expected = board.rows.flatMap(row => board.columns.map(column => `${row.id}.${column.id}`)).sort();
    assert.deepEqual(Object.keys(board.solution).sort(), expected, `${label}: ledger must answer every row/column cell exactly once`);
    for (const column of board.columns) {
      unique(column.options, `${label} ${column.id}`);
      assert(column.options.length >= board.rows.length, `${label}: too few assignment options`);
      for (const row of board.rows) assert(column.options.includes(board.solution[`${row.id}.${column.id}`]), `${label}: solution is not an option`);
    }
    progress.answers = { ...board.solution };
  } else if (board.kind === 'cipher' || board.kind === 'balance') {
    unique(board.fields.map(field => field.id), label);
    assert.deepEqual(Object.keys(board.solution).sort(), board.fields.map(field => field.id).sort(), `${label}: answer keys do not match fields`);
    if (board.kind === 'cipher') assert(board.inscription, `${label}: cipher needs an inscription`);
    if (board.kind === 'balance') {
      assert(board.equations.length, `${label}: balance needs equations`);
      for (const field of board.fields) {
        const value = board.solution[field.id];
        assert(typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value), `${label}: answer ${field.id} must be a numeric string`);
        assert(Number.isFinite(Number(value)), `${label}: nonfinite numeric answer`);
        if (field.min !== undefined) assert(Number(value) >= field.min, `${label}: answer below input minimum`);
        if (field.max !== undefined) assert(Number(value) <= field.max, `${label}: answer above input maximum`);
      }
    }
    progress.answers = { ...board.solution };
  } else if (board.kind === 'sequence') {
    unique(board.cards.map(card => card.id), label);
    unique(board.solution, label);
    assert.deepEqual([...board.solution].sort(), board.cards.map(card => card.id).sort(), `${label}: sequence is not a permutation of cards`);
    progress.order = [...board.solution];
  } else if (board.kind === 'route') {
    assert(Number.isInteger(board.width) && board.width > 1 && Number.isInteger(board.height) && board.height > 1, `${label}: invalid grid dimensions`);
    const cells = board.width * board.height;
    unique(board.blocked, label);
    unique(board.waypoints, label);
    for (const cell of [board.start, board.end, ...board.blocked, ...board.waypoints, ...board.solution]) assert(Number.isInteger(cell) && cell >= 0 && cell < cells, `${label}: out of bounds cell ${cell}`);
    assert(!board.blocked.includes(board.start) && !board.blocked.includes(board.end), `${label}: endpoints are blocked`);
    assert(board.waypoints.every(cell => !board.blocked.includes(cell)), `${label}: waypoint is blocked`);
    assert(Number.isInteger(board.maxSteps) && board.maxSteps > 0, `${label}: invalid route budget`);
    assert.equal(board.solution[0], board.start, `${label}: solution starts in wrong cell`);
    assert.equal(board.solution.at(-1), board.end, `${label}: solution ends in wrong cell`);
    assert(board.solution.length - 1 <= board.maxSteps, `${label}: solution exceeds route budget`);
    unique(board.solution, label);
    let waypoint = 0;
    for (let index = 0; index < board.solution.length; index++) {
      const cell = board.solution[index];
      assert(!board.blocked.includes(cell), `${label}: solution crosses blocked cell`);
      if (cell === board.waypoints[waypoint]) waypoint++;
      else assert(!board.waypoints.includes(cell), `${label}: waypoints visited in wrong order`);
      if (index) {
        const previous = board.solution[index - 1];
        const distance = Math.abs(Math.floor(cell / board.width) - Math.floor(previous / board.width)) + Math.abs(cell % board.width - previous % board.width);
        assert.equal(distance, 1, `${label}: solution has a nonadjacent step`);
      }
    }
    assert.equal(waypoint, board.waypoints.length, `${label}: solution misses waypoint`);
    progress.route = [...board.solution];
  } else {
    assert(Number.isInteger(board.size) && board.size >= 2, `${label}: invalid circuit size`);
    assert.equal(board.initial.length, board.size ** 2, `${label}: initial lamp count differs from grid`);
    assert.equal(board.target.length, board.size ** 2, `${label}: target lamp count differs from grid`);
    assert([...board.initial, ...board.target].every(lamp => typeof lamp === 'boolean'), `${label}: nonboolean lamp`);
    for (const cell of board.solution) assert(Number.isInteger(cell) && cell >= 0 && cell < board.size ** 2, `${label}: out of bounds switch`);
    progress.lamps = board.solution.reduce((lamps, cell) => data.toggleCircuit(lamps, cell, board.size), [...board.initial]);
    assert.deepEqual(progress.lamps, board.target, `${label}: circuit solution does not reach target`);
    assert(!data.challengeSolved(board, { ...progress, lamps: [] }), `${label}: an empty circuit must not count as solved`);
  }
  assert(data.challengeSolved(board, progress), `${label}: real game helper rejects the supplied solution`);
  assert(!data.challengeSolved(board, { answers: {}, hints: 0, solved: false }), `${label}: board is already solved before play`);
  return progress;
}

function narrativeCount(investigation) {
  let core = textWords([...investigation.premise, ...investigation.conclusion]);
  let clues = 0;
  let interfaceText = words(investigation.title) + words(investigation.subtitle);
  for (const challenge of investigation.challenges) {
    core += textWords([...challenge.narrative, ...challenge.resolution]);
    clues += challenge.evidence.reduce((total, evidence) => total + words(evidence.text), 0);
    interfaceText += words(challenge.title) + words(challenge.task) + challenge.evidence.reduce((total, evidence) => total + words(evidence.title), 0);
    const board = challenge.board;
    if (board.kind === 'cipher') interfaceText += words(board.inscription);
    if (board.kind === 'balance') interfaceText += textWords(board.equations);
    if (board.kind === 'sequence') interfaceText += board.cards.reduce((total, card) => total + words(card.title) + words(card.description), 0);
    if (board.kind === 'ledger') interfaceText += board.rows.reduce((total, row) => total + words(row.title), 0) + board.columns.reduce((total, column) => total + words(column.title) + textWords(column.options), 0);
  }
  return { core, clues, interfaceText, total: core + clues + interfaceText };
}

// Find an actual campaign route through the mandatory mechanical beats. We
// omit optional reward/history branches and count repeated prose only once.
function mandatoryCampaignRoute(data) {
  const { SCENES, LOCATIONS, matchesRequirement, freshGame } = data;
  const locations = new Map(LOCATIONS.map(location => [location.id, location]));
  let state = freshGame();
  const route = [];
  const goalList = [
    ['gate_wish', 'entrance'], ['library_clerk', 'catalog'], ['library_cataloged', 'papers_obtained'],
    ['pip_rhyme', 'rhyme'], ['brindle_hello', 'brindle_friend'], ['brindle_kindness', 'brindle_helped'], ['ada_hello', 'ada_friend'],
    ['coupon_counter', 'coupons'], ['lake_arrival', 'fishing'], ['forest_path', 'forest'], ['fields_permit', 'permit'],
    ['supine_telescreen', 'art_tickets_received'], ['museum_blocks', 'blocks'], ['museum_gallery', 'artwork'], ['supine_wish', 'banished'],
    ['hospital_model', 'brain'], ['pit_keeper', 'reversion'], ['hospital_provision', 'brain_ready'], ['casino_host', 'casino'], ['casino_chapel', 'switch'],
    ['switch_awake', 'ada_volunteered'], ['switch_agreement', 'castle'], ['castle_minders', 'minder'], ['castle_bedroom', 'lullaby'],
    ['castle_consent', 'mind_changed'], ['castle_changed', 'reservoir_open'], ['hospital_return', 'ada_restored'],
    ['friends_arrival', 'friends_offer_heard'], ['friends_offer', 'friends_decided'], ['infinite_arrival', 'final_gate'], ['infinite_question', 'commons'],
  ];
  const available = (game, choice) => matchesRequirement(choice.requires, game.flags) && (!choice.item || game.items.includes(choice.item));
  const apply = (game, choice) => {
    const next = { ...game, flags: [...game.flags], items: [...game.items], unlocked: [...game.unlocked], solved: [...game.solved] };
    for (const effect of choice.effects || []) {
      if (effect.flag && !next.flags.includes(effect.flag)) next.flags.push(effect.flag);
      if (effect.addItem && !next.items.includes(effect.addItem)) next.items.push(effect.addItem);
      if (effect.removeItem) next.items = next.items.filter(item => item !== effect.removeItem);
      if (effect.unlock && !next.unlocked.includes(effect.unlock)) next.unlocked.push(effect.unlock);
      if (effect.act) next.act = Math.max(next.act, effect.act);
    }
    if (choice.puzzle && !next.solved.includes(choice.puzzle)) next.solved.push(choice.puzzle);
    if (choice.next) {
      next.scene = choice.next; next.location = SCENES[next.scene].location;
      if (!next.unlocked.includes(next.location)) next.unlocked.push(next.location);
    }
    if (choice.ending) next.ending = choice.ending;
    return next;
  };
  const logic = game => JSON.stringify([game.act, [...game.flags].sort(), [...game.items].sort(), [...game.unlocked].sort(), [...game.solved].sort(), game.ending]);
  for (const [wantedScene, goal] of goalList) {
    const queue = [{ state, path: [] }];
    const seen = new Set([state.scene]);
    let found;
    for (let cursor = 0; cursor < queue.length && !found; cursor++) {
      const node = queue[cursor];
      if (node.state.scene === wantedScene) {
        const index = SCENES[wantedScene].choices.findIndex(choice => available(node.state, choice) && (choice.puzzle === goal || choice.ending === goal || choice.effects?.some(effect => effect.flag === goal || effect.unlock === goal)));
        if (index >= 0) found = { state: apply(node.state, SCENES[wantedScene].choices[index]), path: [...node.path, { from: wantedScene, choice: index, next: SCENES[wantedScene].choices[index].next || wantedScene }] };
      }
      if (found) break;
      for (const [index, choice] of SCENES[node.state.scene].choices.entries()) {
        if (!available(node.state, choice)) continue;
        const next = apply(node.state, choice);
        if (logic(next) !== logic(node.state) || seen.has(next.scene)) continue;
        seen.add(next.scene); queue.push({ state: next, path: [...node.path, { from: node.state.scene, choice: index, next: next.scene }] });
      }
      for (const id of node.state.unlocked) {
        const destination = locations.get(id);
        if (!destination || id === SCENES[node.state.scene].location || seen.has(destination.scene)) continue;
        seen.add(destination.scene);
        queue.push({ state: { ...node.state, scene: destination.scene, location: id }, path: [...node.path, { from: node.state.scene, travel: id, next: destination.scene }] });
      }
    }
    assert(found, `Mandatory route cannot reach ${wantedScene} / ${goal}`);
    route.push(...found.path); state = found.state;
  }
  const readScenes = new Set(['gate_arrival', ...route.flatMap(step => [step.from, step.next])]);
  const prose = [...readScenes].reduce((total, id) => total + textWords(SCENES[id].text), 0);
  const choices = route.filter(step => !step.travel).reduce((total, step) => total + words(SCENES[step.from].choices[step.choice].label), 0);
  return { steps: route.length, distinctScenes: readScenes.size, proseWords: prose, chosenOptionWords: choices, totalWords: prose + choices, route };
}

export async function validateInvestigations() {
  const data = await loadInvestigationData();
  const { INVESTIGATIONS } = data;
  assert.equal(INVESTIGATIONS.length, 6, 'Exactly six mandatory investigations are required');
  unique(INVESTIGATIONS.map(investigation => investigation.id), 'Investigations');
  assert.deepEqual(INVESTIGATIONS.map(investigation => investigation.act).sort(), [1, 2, 3, 4, 5, 6], 'One investigation is required in each act');
  const counts = [];
  const challengeIds = [];
  const puzzleMinutes = { min: 0, typical: 0, max: 0 };
  for (const investigation of INVESTIGATIONS) {
    assert(data.LOCATIONS.some(location => location.id === investigation.location), `${investigation.id}: unknown location`);
    assert.equal(investigation.challenges.length, 6, `${investigation.id}: expected six challenges`);
    assert.deepEqual(investigation.challenges.map(challenge => challenge.board.kind).sort(), [...kinds].sort(), `${investigation.id}: every board type must appear`);
    for (const challenge of investigation.challenges) {
      challengeIds.push(challenge.id);
      verifyBoard(challenge, data);
      for (const range of ['min', 'typical', 'max']) puzzleMinutes[range] += challenge.minutes[range];
    }
    counts.push({ id: investigation.id, act: investigation.act, ...narrativeCount(investigation) });
  }
  unique(challengeIds, 'Challenges');
  const campaign = mandatoryCampaignRoute(data);
  const investigationWords = counts.reduce((total, count) => total + count.total, 0);
  const totalWords = investigationWords + campaign.totalWords;
  // Existing short mechanical puzzles: concrete per-puzzle thinking estimates,
  // excluding prose already included above and assistance/instant solutions.
  const existingPuzzles = {
    entrance: [0.5, 1.5, 3], rhyme: [0.5, 1.5, 3], fishing: [0.5, 2, 4], catalog: [0.5, 1.5, 3],
    coupons: [1, 2.5, 5], forest: [0.5, 1.5, 3], permit: [0.5, 1.5, 3], blocks: [0.5, 1.5, 3],
    artwork: [0.5, 1.5, 3], brain: [0.5, 1.5, 3], reversion: [0.5, 1.5, 3], casino: [0.5, 2, 4],
    switch: [1, 3, 6], minder: [0.5, 1.5, 3], lullaby: [0.5, 1.5, 3], final_gate: [1, 2.5, 5],
  };
  const mainPuzzleMinutes = { min: 0, typical: 0, max: 0 };
  for (const estimates of Object.values(existingPuzzles)) ['min', 'typical', 'max'].forEach((range, index) => { mainPuzzleMinutes[range] += estimates[index]; });
  const reading = { fast240Wpm: totalWords / 240, central220Wpm: totalWords / 220, deliberate200Wpm: totalWords / 200 };
  const thinking = puzzleMinutes.typical + mainPuzzleMinutes.typical;
  const standardMinutes = { lower: reading.fast240Wpm + thinking * 0.85 + 10, central: reading.central220Wpm + thinking + 15, upper: reading.deliberate200Wpm + thinking * 1.15 + 20 };
  const report = {
    generatedAt: new Date().toISOString(), status: 'Reasoned content estimate; not measured human playtesting',
    mandatoryInvestigations: 6, mandatoryInvestigationChallenges: challengeIds.length, existingMainPuzzles: 16,
    investigationWords: counts, investigationWordsTotal: investigationWords,
    campaign: { ...campaign, route: undefined }, mandatoryReadWordsTotal: totalWords,
    wordCountMethod: 'Read-once premise, narrative, evidence, task, board clues, resolution and conclusion; actual guided campaign route prose plus selected option labels. Optional hints, other endings and optional branch prose excluded.',
    investigationPuzzleMinutes: puzzleMinutes, mainPuzzleMinutes, readingMinutes: reading,
    travelAndDecisionMinutes: { lower: 10, central: 15, upper: 20 }, standardMinutes,
    acceleratedMinutes: reading.fast240Wpm + puzzleMinutes.min + mainPuzzleMinutes.min + 8,
    deliberateMinutes: reading.deliberate200Wpm + puzzleMinutes.max + mainPuzzleMinutes.max + 30,
    standardHours: Object.fromEntries(Object.entries(standardMinutes).map(([key, value]) => [key, Number((value / 60).toFixed(2))])),
    fiveHourTargetDeltaMinutes: standardMinutes.central - 300,
    clueReviews: independentAudits(INVESTIGATIONS),
  };
  await writeFile(resolve(root, 'scripts/pacing-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Validated ${INVESTIGATIONS.length} investigations / ${challengeIds.length} boards through the real game solver.`);
  console.log(`${totalWords} mandatory words; estimated standard ${report.standardHours.lower}–${report.standardHours.upper} hours, central ${report.standardHours.central} hours.`);
  console.log(`Central estimate differs from five hours by ${Math.round(report.fiveHourTargetDeltaMinutes)} minutes. Details: scripts/pacing-report.json.`);
  return { data, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await validateInvestigations();
