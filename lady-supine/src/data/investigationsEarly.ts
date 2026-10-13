import { toggleCircuit } from "./investigationTypes";
import type { Investigation, InvestigationBoard, InvestigationChallenge } from "./investigationTypes";

const clerkLedger: InvestigationBoard = {
  kind: "ledger",
  rows: [
    { id: "vellum", title: "Vellum · counter 1" }, { id: "fen", title: "Fen · counter 2" },
    { id: "silt", title: "Silt · counter 3" }, { id: "rook", title: "Rook · counter 4" },
    { id: "moss", title: "Moss · counter 5" },
  ],
  columns: [
    { id: "seal", title: "Seal", options: ["Blue Thread", "Copper Leaf", "White Eye", "Green Door", "Black Bell"] },
    { id: "error", title: "Recorded defect", options: ["Missing name", "Reversed date", "Duplicate kiss", "Blank address", "Absent witness"] },
  ],
  solution: {
    "vellum.seal": "Green Door", "vellum.error": "Absent witness",
    "fen.seal": "Copper Leaf", "fen.error": "Blank address",
    "silt.seal": "Black Bell", "silt.error": "Reversed date",
    "rook.seal": "Blue Thread", "rook.error": "Duplicate kiss",
    "moss.seal": "White Eye", "moss.error": "Missing name",
  },
};

const marginCipher: InvestigationBoard = {
  kind: "cipher",
  inscription: "3:1 3:2 3:3 4:3  |  1:5 6:1 2:2 5:1 1:2 6:8 5:4 4:4 5:1  |  1:1 6:2 7:7 7:1 1:3 4:5 6:6 2:2",
  fields: [{ id: "action", label: "Instruction" }, { id: "subject", label: "Subject" }, { id: "detail", label: "Where to look" }],
  solution: { action: "READ", subject: "THE WILLOW", detail: "FOOTNOTE" },
};

const afternoonBalance: InvestigationBoard = {
  kind: "balance",
  fields: [
    { id: "elin", label: "Elin's unspent afternoon", min: 0, max: 93, suffix: "minutes" },
    { id: "library", label: "Library handling reserve", min: 0, max: 93, suffix: "minutes" },
    { id: "collector", label: "Collector's allowance", min: 0, max: 93, suffix: "minutes" },
    { id: "ward", label: "Ward's future holding", min: 0, max: 93, suffix: "minutes" },
    { id: "gate", label: "Threshold deposit", min: 0, max: 93, suffix: "minutes" },
  ],
  equations: [
    "Elin + Library = 40", "Library + Threshold = 30",
    "Ward = Elin + 6", "Elin = 2 × Collector + 1",
    "All five accounts total 93", "Ward + Library = 46 (cross-check)",
  ],
  solution: { elin: "23", library: "17", collector: "11", ward: "29", gate: "13" },
};

const afternoonSequence: InvestigationBoard = {
  kind: "sequence",
  cards: [
    { id: "notice", title: "The correction notice", description: "Elin is told an afternoon already elapsed." },
    { id: "erase", title: "The name is removed", description: "The public index stops admitting Elin existed." },
    { id: "copy", title: "Pip copies the verse", description: "The moth copies words Elin pointed out." },
    { id: "appeal", title: "Vellum files an appeal", description: "A fox puts his own name beneath an objection." },
    { id: "borrow", title: "The book is borrowed", description: "Elin signs for a book about tomorrow." },
    { id: "freeze", title: "The Hospital receives Elin", description: "Nurse Reed records an interrupted breath." },
    { id: "inspect", title: "The collector's inspection", description: "An Aristobat finds an unapproved blank line." },
  ],
  solution: ["borrow", "copy", "inspect", "notice", "appeal", "freeze", "erase"],
};

const afternoonRoute: InvestigationBoard = {
  kind: "route", width: 7, height: 7,
  blocked: [5, 6, 23, 34, 36, 37, 38, 39, 44, 45, 46, 47],
  start: 0, end: 48, waypoints: [9, 31, 12, 40], maxSteps: 24,
  solution: [0, 1, 2, 9, 16, 15, 14, 21, 28, 29, 30, 31, 24, 17, 18, 19, 12, 13, 20, 27, 26, 33, 40, 41, 48],
};

function circuit(lit: number[], switches: number[]): InvestigationBoard {
  const target = Array.from({ length: 25 }, (_, cell) => lit.includes(cell));
  const initial = switches.reduce((lamps, cell) => toggleCircuit(lamps, cell, 5), target);
  return { kind: "circuit", size: 5, initial, target, solution: switches };
}

const afternoonCircuit = circuit([10, 11, 12, 13, 14], [0, 3, 6, 8, 10, 13, 17, 20, 22, 24]);

const harvestLedger: InvestigationBoard = {
  kind: "ledger",
  rows: [
    { id: "apricot", title: "Apricot crate" }, { id: "pear", title: "Pear crate" },
    { id: "millet", title: "Millet crate" }, { id: "willow", title: "Willow crate" },
    { id: "plum", title: "Plum crate" },
  ],
  columns: [
    { id: "destination", title: "Destination", options: ["Hospital", "Castle", "Casino", "Storehouse", "Compost"] },
    { id: "charge", title: "Time charged to the grower", options: ["4", "7", "10", "13", "16"] },
  ],
  solution: {
    "apricot.destination": "Hospital", "apricot.charge": "7",
    "pear.destination": "Castle", "pear.charge": "16",
    "millet.destination": "Storehouse", "millet.charge": "10",
    "willow.destination": "Casino", "willow.charge": "13",
    "plum.destination": "Compost", "plum.charge": "4",
  },
};

const harvestCipher: InvestigationBoard = {
  kind: "cipher", inscription: "DFS / SRDVQAF / RG / NJDF / SML / SRMJ",
  fields: [{ id: "message", label: "The dispatch instruction, in ordinary words" }],
  solution: { message: "THE HARVEST IS HELD NOT LOST" },
};

const harvestBalance: InvestigationBoard = {
  kind: "balance",
  fields: [
    { id: "workers", label: "Orchard workers", min: 0, max: 72, suffix: "minutes" },
    { id: "patients", label: "Hospital patients", min: 0, max: 72, suffix: "minutes" },
    { id: "travellers", label: "Travellers", min: 0, max: 72, suffix: "minutes" },
    { id: "seeds", label: "Seed keepers", min: 0, max: 72, suffix: "minutes" },
    { id: "buffer", label: "Breakage reserve", min: 0, max: 72, suffix: "minutes" },
  ],
  equations: [
    "Patients = Workers + 6", "Travellers = Workers − 3",
    "Seeds = Workers ÷ 2", "Breakage = Workers ÷ 3",
    "The five allocations total 72",
    "Patients + Travellers = 2 × Workers + 3 (cross-check)",
  ],
  solution: { workers: "18", patients: "24", travellers: "15", seeds: "9", buffer: "6" },
};

const harvestSequence: InvestigationBoard = {
  kind: "sequence",
  cards: [
    { id: "seal", title: "The storehouse is sealed", description: "An Aristobat witnesses the final lock." },
    { id: "divide", title: "The harvest is divided", description: "Fruit is assigned to names not yet submitted." },
    { id: "discard", title: "The surplus is condemned", description: "Unclaimed plenty becomes official waste." },
    { id: "sow", title: "The seed is planted", description: "The gardener places a seed in borrowed soil." },
    { id: "collect", title: "Applications are collected", description: "Workers are finally allowed to ask for their fruit." },
    { id: "measure", title: "The crop is measured", description: "A clerk counts branches before there are blossoms." },
    { id: "permit", title: "Permits are printed", description: "The forms are dated after the allocation closes." },
  ],
  solution: ["sow", "measure", "divide", "permit", "collect", "seal", "discard"],
};

const harvestRoute: InvestigationBoard = {
  kind: "route", width: 8, height: 8,
  blocked: [5, 11, 13, 14, 22, 33, 36, 38, 39, 41, 47, 49, 50, 51, 52, 53, 54, 55, 57, 58, 59, 60, 61, 62, 63],
  start: 56, end: 6, waypoints: [18, 20, 45, 7], maxSteps: 29,
  solution: [56, 48, 40, 32, 24, 16, 17, 18, 10, 2, 3, 4, 12, 20, 28, 27, 26, 34, 42, 43, 44, 45, 37, 29, 30, 31, 23, 15, 7, 6],
};

const harvestCircuit = circuit([2, 6, 7, 8, 10, 11, 12, 13, 14, 17, 22], [1, 4, 5, 7, 11, 12, 15, 18, 21, 23]);

function stage(id: string, title: string, task: string, board: InvestigationBoard, hints: [string, string, string]): InvestigationChallenge {
  return {
    id, title, task, board, hints, ...EARLY_CONTENT[id],
    minutes: { min: board.kind === "circuit" ? 4 : 3, typical: board.kind === "circuit" ? 7 : 5, max: 9 },
  };
}

const EARLY_CONTENT: Record<string, Pick<InvestigationChallenge, "narrative" | "evidence" | "resolution">> = {
  afternoon_ledger: {
    narrative: [
      "Vellum leads you behind the public catalogue, where the drawers have names for things a person can fail to provide. A witness. An address. A future. Pip follows with the kettle wrapped in a scarf; the moth has noticed that difficult conversations become easier when somebody has already decided everyone deserves tea. At the last counter, a mouse's name has been replaced by a neat white rectangle.",
      "“Elin passed through all five desks,” Vellum says. “Each certified a different defect. No desk was permitted to see the whole file.” “I was at the first. I thought somebody farther along would put matters right.” You ask whether five incomplete accounts can add up to one complete injustice. The fox looks at the rectangle instead of answering.",
      "The clerks' seals were detached during an audit of individuality. Their incident notes survived because notes are cheaper to replace than brass. Reunite them and Vellum can establish which record ended Elin's claim to tomorrow. A correct reconstruction will identify responsibility without pretending one frightened clerk invented the entire machine. Pip opens the scarf around the kettle. “We should still use their names,” the moth says.",
    ],
    evidence: [
      { title: "Counter register", text: "The counter order was Vellum, Fen, Silt, Rook, Moss. Each seal and each defect occurred exactly once. 'Immediately after' means the next numbered counter, with none between." },
      { title: "Seal maintenance slip", text: "Copper Leaf was used immediately after Green Door. Blue Thread was used at neither end of the counter line. White Eye was used two counters after Black Bell." },
      { title: "Incident cross-reference", text: "The missing-name record bears White Eye. Black Bell certified the reversed date. The duplicate kiss followed the reversed date immediately; the blank address preceded that date immediately." },
      { title: "Witness's remaining sentence", text: "The absent-witness defect was recorded somewhere before the blank address. The witness crossed out the word 'therefore.' No clerk was entitled to invent an extra defect." },
    ],
    resolution: [
      "The White Eye belongs to Moss, whose missing-name certificate completed the deletion. Vellum's absent witness began it. Between them, a blank address became a reversed date, then a duplicate kiss. No clerk checked whether the next defect was the consequence of the last. Vellum writes every name into the appeal, including his own. Pip pours him tea without making forgiveness a condition of receiving it. You now have a chain someone can answer for.",
    ],
  },
  afternoon_cipher: {
    narrative: [
      "Moss's certificate quotes a footnote without naming its book. Vellum retrieves the volume Elin borrowed: THE MANAGEMENT OF UNFINISHED DAYS. Its author is listed as Anonymous, Provisionally. A strip of paper protrudes from the binding. Somebody has written coordinates rather than words, then stitched the strip into a place the official index cannot describe.",
      "“She liked puzzles,” Pip says. “Not to feel clever. To feel that there was an answer somewhere, even when she hadn't found it.” Pip remembers Elin reading beside Nettle. There had been a drawing of a tree growing around a blank line. The collector saw the blank before either of them could finish reading. In the present file, that interruption is described as failure to comprehend.",
      "Seven dictionary words survive on the endpaper. They were printed in display order, but the code uses binding order, a different arrangement intended to keep a hurried inspector from mistaking recognition for reading. Every letter you need is here. Vellum will not decode it for you. “She left this to a reader,” he says. “For once, I would like an instruction to reach the person it was meant for.”",
    ],
    evidence: [
      { title: "The seven endpaper words", text: "HOSPITAL · WILLOW · FINITE · TOMORROW · UNDOOR · READER · KETTLE. These are the complete dictionary. Capitals and lowercase count as the same letters; none of the words has hidden spaces." },
      { title: "Binder's convention", text: "Binding order puts shorter words before longer words. Words of equal length are put in ordinary alphabetical order. Number that ordered list from one. Inside each word, number letters from one." },
      { title: "Pip's careful copy", text: "In a coordinate A:B, A identifies the dictionary word and B identifies its letter. Decode from left to right. Vertical bars separate the three answer groups; a group can contain more than one ordinary word." },
    ],
    resolution: [
      "READ THE WILLOW FOOTNOTE. Behind the ordinary text, Elin found an account of time that still belonged to its owner when it had not been used. A willow was its example: a branch can wait through a winter without being accused of wasting spring. Pip touches the illustration. “That is why she wanted the book.” Vellum marks the footnote as evidence. The file has acquired something its author actually intended to say.",
    ],
  },
  afternoon_balance: {
    narrative: [
      "The footnote leads to an account sheet sealed under Elin's signature. Her afternoon was not consumed. It was divided among five holdings, then each department certified that the portion in its own care no longer belonged to her. The total remained unchanged. The person became poorer. Vellum reads it twice, hoping for a different verb.",
      "Pip asks why the Hospital has a future-holding account. “So an interruption can be funded without being ended,” the fox says. The answer makes the room seem colder. A stopped patient can possess a reserve while still being forbidden to spend it. Every department has proof of prudence; none is responsible for the next breath. The blank rectangle on Elin's drawer is becoming easier to understand and harder to look at.",
      "Recover the balances and you can establish exactly what was taken. Guessing a generous amount would let the appeal be dismissed as sentiment. Guessing too little would repeat the theft with kinder handwriting. Vellum lays out the surviving totals and relations. Pip places a teaspoon beside each account, a small domestic measure against a large official abstraction. “We need all of them,” the moth says. “Otherwise she'll disappear between the sums.”",
    ],
    evidence: [
      { title: "Treasury reconciliation", text: "All five holdings together contain ninety-three whole minutes. Elin's unspent portion and the Library's handling reserve total forty. The Library reserve and threshold deposit total thirty." },
      { title: "Collector's retained carbon", text: "Elin's portion was one minute greater than twice the collector's allowance. The ward held six minutes more than Elin's portion. There are no negative balances, fractional minutes, or unlisted sixth account." },
      { title: "Independent ward check", text: "The ward and Library holdings total forty-six. This repeats information contained in the other records; it is a check against copying a number into the wrong column, not an additional supply of time." },
    ],
    resolution: [
      "Twenty-three minutes were still Elin's, in everything but permission. The other seventy support the machinery that prevents her using them. Vellum circles the twenty-three without changing any total. “We can prove the afternoon exists,” he says. “Now we must prove she existed when it was taken.” Pip turns the five teaspoons back into a tidy row. The distinction between losing time and having it withheld will travel with you much farther than this room.",
    ],
  },
  afternoon_sequence: {
    narrative: [
      "The numbers agree. The stories do not. The notice claims Elin was already without a future when she borrowed the book. The Hospital register says her interruption followed an appeal. The index says a person removed from its pages cannot have submitted an appeal at all. Every document cites another document as proof of something that happened earlier.",
      "Vellum has kept the original records. Their dates were overwritten, so you must use the events they describe: which action required another to have occurred, which witness saw both, which numbered interval cannot fit anywhere else. Pip recognises the copy of the verse by a tea stain shaped like a moon. “I was there,” the moth says, then looks frightened by how much a sentence can ask of its speaker.",
      "You reassure Pip that remembering does not make the wrongdoing theirs. The collector arrived after the copying, not because of it. A child had pointed out an unfinished line; an adult had borrowed a book; a clerk had objected. Those were ordinary acts before the paperwork taught them to look criminal. Arrange the seven genuine events. The aim is to recover their order, not the state's preferred explanation of it.",
    ],
    evidence: [
      { title: "Pip's statement", text: "Borrowing happened before copying, and copying before the inspection. The inspection occurred before the notice. The notice occupies the position exactly three places after borrowing in this seven-event list." },
      { title: "Vellum's retained appeal", text: "The appeal was the event immediately after the notice. Elin's Hospital admission occupies the position two places after the notice. The appeal's rejection was administrative commentary, not a separate eighth event." },
      { title: "Nurse Reed's annotation", text: "Elin was admitted before the public index erased her name. All seven cards describe genuine events, each occurring once. Ignore the overwritten dates: they are what this reconstruction is testing." },
    ],
    resolution: [
      "The confiscation preceded the official reason for confiscating. The Library did not lend a book to someone already out of time. The inspection created the loss, and the later records made it look inevitable. Pip breathes out. Vellum writes CAUSE BEFORE CERTIFICATION across the appeal in red ink. It is a modest sentence with a dangerous implication: a person can be wronged even when every box has been properly filled afterward.",
    ],
  },
  afternoon_route: {
    narrative: [
      "The appeal is complete. Unfortunately, the receiving office accepts only documents that have passed through four substations in person. An office that has stopped recognising Elin cannot send her file by the ordinary route; the route relies on the index it is meant to correct. Vellum takes you into the Library's lower floor, where rooms are shelved beside other rooms.",
      "Pip carries the original, in the scarf. You will visit the copy witness, the numerical audit, the uncensored margin, and the future cradle in that order. Each station adds a different kind of recognition. A later station cannot repair an earlier omission. The passage lamps are paid for from a small appeal allowance: twenty-four steps, enough if you preserve the return corridors instead of chasing the next room's apparent closeness.",
      "No person will be charged for a mistaken plan. Vellum has frozen the allowance while you study the map; only the submitted route is counted. “I am allowed one discretionary kindness per case,” he says. “I have decided that not punishing thought qualifies.” At the receiving desk, Nettle is waiting with a bookmark she made for her mother.",
    ],
    evidence: [
      { title: "Room coordinates", text: "Count rows from the top and columns from the left, starting at one. Begin at row one, column one. Visit row two/column three; row five/column four; row two/column six; row six/column six, in that order. Finish at row seven/column seven." },
      { title: "Appeal passage rules", text: "Move one square horizontally or vertically at a time. Closed squares cannot be entered. Do not visit any square twice, including the start. Do not cross a later station before its turn. The route may use no more than twenty-four moves." },
    ],
    resolution: [
      "The receiving desk accepts the file without inventing a new category. Nettle asks whether this means her mother can come home. You do not give her a promise the file cannot keep. It means Elin's name and claim can no longer be quietly deleted. The minutes still lie behind the castle's rules. Nettle slides the bookmark into the book anyway. “Then she'll know where to start when she can read again.”",
    ],
  },
  afternoon_circuit: {
    narrative: [
      "One last mechanism controls the public index. Five eligibility lamps represent five basic claims. Around them are lamps for scrutiny, delay, repetition, and exception. Elin's file has been routed through so many of those neighbouring categories that the machine treats the extra illumination as evidence she cannot be seen clearly enough to recognise.",
      "“The middle five should be lit,” Vellum says. “A clerk, a name, an address, a witness, a future. Everything around them should be dark. Not because those things must be hidden, but because an inquiry is not an identity.” Pressing a switch affects its own cell and its immediate neighbours. The repair board was built cheaply, so the categories share wiring. A moral distinction shares inconvenient wiring.",
      "Pip sits with Nettle and lets the child hold the drawing of the willow. You work the lamps while their conversation continues without asking whether either of them is sufficiently eligible to speak. There is no countdown. Two identical presses cancel; the order of different presses does not matter. Restore the exact pattern, and Vellum can make the corrected entry visible to every desk that once passed responsibility along.",
    ],
    evidence: [
      { title: "Index maintenance diagram", text: "The board is five by five. The target has only the five middle-row lamps lit. Every press reverses its own lamp plus the cells immediately above, below, left, and right where those cells exist." },
      { title: "Old technician's advice", text: "A lamp touched an odd number of times changes; a lamp touched an even number returns to its former state. Choose a top-row pattern, then repair each row by pressing directly below its remaining differences. That method leaves earlier rows settled." },
      { title: "Correction authority", text: "The target pattern is the whole instruction. It is not necessary to illuminate every switch or erase the evidence. You are correcting an index, not removing the history of its error." },
    ],
    resolution: [
      "ELIN: PERSON. CLAIM: UNRESOLVED. FUTURE: WITHHELD, NOT ABSENT. The words appear at every counter. Moss receives them first and sends back a brief apology addressed to Elin, rather than to the department. Vellum places your provisional papers beside the corrected file. “A name should not require this much machinery,” he says. Pip takes the willow drawing for your journey. It seems appropriate that a tree capable of curling should lead you out of a place so committed to straight lines.",
    ],
  },
  harvest_ledger: {
    narrative: [
      "The gardener's name is Sorrell. The permit register calls her Seasonal Output, Porcine. She has spent the morning holding up a pear branch so loaded it has forgotten which way the sky is. Burrow brings a prop instead of a form, and for a moment the orchard works according to the needs of the tree rather than the needs of the office.",
      "Five crates left Sorrell's plot yesterday. Today she is told the local allocation has been exhausted. The crates were full; the road was open; the storehouse has room. Each consignment also charged minutes to its grower, supposedly to prevent excessive reliance on abundance. Sorrell asks why giving something away makes her owe the person who receives it. Burrow admits he has never been authorised to answer that question.",
      "The destination labels and charges were filed separately, a measure intended to discourage improvised comparisons. You have permission to compare them now, provided you do not call the comparison an opinion. Reconstruct all five shipments. The charges climb in a regular pattern, but the fruit does not follow alphabetical order. Pip's small drawing of a tree lies beside the paperwork. Its branches grow wherever there is space.",
    ],
    evidence: [
      { title: "Dispatch accounting", text: "Each destination and each charge is used exactly once. The Hospital charge is three above Compost; Storehouse is three above Hospital; Casino is three above Storehouse; Castle is three above Casino." },
      { title: "Grower's carbon copy", text: "Pear carried the highest charge. Willow was charged exactly three minutes more than Millet. Apricot was charged less than Millet. Plum was charged less than Apricot. These statements compare charges, not crate sizes." },
      { title: "Burrow's correction", text: "The five possible charges are four, seven, ten, thirteen, and sixteen whole minutes. There was no sixth load and no tax exemption. A consignment labelled Hospital actually reached the Hospital; the fraud lies elsewhere." },
    ],
    resolution: [
      "Only one crate reached patients. One reached the castle, one the casino, one the locked storehouse, and one was composted. Sorrell paid for every route, even the destruction of what she grew. Burrow changes the heading from LOCAL SHORTAGE to DISTRIBUTION UNEXPLAINED. It is not yet a release order, but it is the first time an official description has admitted the orchard can be full while the people beside it are hungry.",
    ],
  },
  harvest_cipher: {
    narrative: [
      "A dispatch ribbon remains caught beneath the storehouse lock. Its letters are recognisable, but none of its words are. Sorrell says the ribbon arrived after the harvest had been counted and before anyone was allowed to request a portion. The inspector called it an instruction for preserving quality. He did not open a crate.",
      "Burrow remembers the old packing convention. Orchard orders use a keyword alphabet, then reverse each word because the stencil is read from the back of the ribbon. “It was meant to keep casual thieves from learning the cart's route,” he says. “Apparently the people who filled the cart are now casual thieves.” He copies the convention onto clean paper. You will not need to know a secret language or guess a missing key.",
      "The keyword is printed on the permit office: ABUNDANCE. It contains repeated letters, which must be omitted when building the substitution row. Decode the individual letters first, then turn each resulting word around. Sorrell studies the lock while you work. Her anger is measured rather than loud. “I can bear losing a crop to frost,” she says. “I would like to know whether this frost has a signature.”",
    ],
    evidence: [
      { title: "Packing convention, first operation", text: "Write the keyword ABUNDANCE from left to right, keeping each letter only the first time it appears. Append every unused letter of the ordinary A–Z alphabet in alphabetical order. This creates a complete twenty-six-letter keyed row." },
      { title: "Packing convention, second operation", text: "Place ordinary A–Z above the keyed row. To decode a ribbon letter, find it in the keyed row and take the ordinary letter directly above. The stencil reverses every word separately; reverse decoded words, preserving their order." },
      { title: "Ribbon boundaries", text: "Slashes mark word boundaries. There are no missing words, omitted letters, or numerical substitutions. The message is an ordinary sentence about the harvest's condition." },
    ],
    resolution: [
      "THE HARVEST IS HELD NOT LOST. Burrow unlocks the outer office so Sorrell can see the dispatch stamp. Its issuer is the Museum's Office of Appropriate Want. Fruit is being stored until an exhibition requires visitors to experience tasteful scarcity. The painting will be abundant; the people looking at it must not be. Sorrell lays a hand against the warehouse wall. “Then something living is dying in there to improve somebody's idea.”",
    ],
  },
  harvest_balance: {
    narrative: [
      "The hold order contains a release clause. Burrow can invoke it if five legitimate needs can be satisfied without inventing a shortage in one account to repair another. The clause was intended to be inconvenient: it asks for a complete allocation rather than a simple request. Sorrell reads it as if it might, despite its purpose, contain a door.",
      "Seventy-two minutes of handling reserve can be returned with the produce. Orchard workers need time to receive what they grew; patients need time to eat; travellers need time to carry provisions farther than this fence. Seed keepers must prepare another crop, and a small breakage reserve prevents a dropped basket from becoming someone's personal debt. Nobody in the plan is required to prove their need by looking more hungry than somebody else.",
      "The quantities are related. The Hospital gets six minutes more than workers; travellers get three fewer. Seeds receive half the workers' amount and breakage receives a third. Burrow worries that the fractions will force the reserve into forbidden fractional minutes. Sorrell points to the actual harvest: branches have been dividing their weight all morning without requiring a department. Find the whole-number allocation. A correct answer can become an official exception someone else may cite.",
    ],
    evidence: [
      { title: "Release clause", text: "Exactly seventy-two minutes are available across the five fields. Patient handling receives six more than orchard workers. Travellers receive three fewer than orchard workers. All amounts must be whole, nonnegative minutes." },
      { title: "Continuity obligations", text: "The seed keepers receive exactly half the workers' allocation. Breakage receives exactly one third of the workers' allocation. Those two reserves are included in the seventy-two-minute total, not added afterward." },
      { title: "Independent check", text: "Patients and travellers together receive twice the workers' amount plus three. This follows from the first two obligations and can catch an arithmetic slip. No balance is transferred from a patient's personal clock." },
    ],
    resolution: [
      "The reserve divides cleanly. Eighteen for workers, twenty-four for patients, fifteen for travellers, nine for seed keepers, six against breakage. Burrow signs the exception and makes two copies, so destroying one will not make it disappear. Sorrell takes the travellers' copy. “People should be able to carry food away from a place that grows it,” she says. For now, five actual needs have become harder to hide behind one abstract shortage.",
    ],
  },
  harvest_sequence: {
    narrative: [
      "The Museum challenges Burrow's exception before the ink dries. It argues that no valid applications existed when allocations closed. This is true. The application forms were printed after the fruit had already been assigned. The orchard was described as open to everyone at a moment when nobody possessed the document required to approach it.",
      "Sorrell has a seed packet, a measurement slip, a division ledger, a permit proof, a collection book, a sealing photograph, and a condemnation note. Their printed dates are immaculate. Their contents are less cooperative. The measurement slip predicts branches before blossoms; the permit proof refers to destinations already fixed; the condemnation note calls unclaimed fruit a sign of insufficient demand. A loop of explanations has been mistaken for a season.",
      "Put the seven events in the order they actually happened. Burrow will attach the sequence to the exception, showing that late applications were a designed outcome. You are not deciding whether all bureaucracy should vanish. You are giving this office the evidence it needs to stop using a deadline nobody could meet. Sorrell saves the empty seed packet. She has always liked how a beginning can fit into such a little piece of paper.",
    ],
    evidence: [
      { title: "Gardener's event relations", text: "Measurement happened immediately after sowing. Division occurred after measurement and before permit printing. Collection occupied the position exactly three places after measurement in this seven-event record." },
      { title: "Storehouse witness", text: "Permit printing happened before applications were collected. The storehouse was sealed after collection. Condemnation occurred after sealing. There are no simultaneous events or unlisted events between the cards." },
      { title: "A date is not an event", text: "The cards describe what occurred, once each. Arrange by the relations in the witness records. Printed dates were assigned by the same office that is being audited, so they do not override those relations." },
    ],
    resolution: [
      "The fruit was assigned before anyone could apply. The only late thing was permission. Burrow stamps the sequence with his own name instead of the office number. Sorrell says this must be frightening. “It is,” he admits. “I would prefer to be frightened while doing something I can explain.” The exception now carries an account of why it was necessary. It is becoming more than a kindness an inspector can dismiss as improper softness.",
    ],
  },
  harvest_route: {
    narrative: [
      "The exception must reach four stations before it can open the storehouse. The route was designed for inspection carts travelling toward the castle, not provisions travelling toward people. Several intersections have been closed since the last harvest. The nearest-looking road to the next station can consume a passage you will need later, leaving the final signature visible but unreachable.",
      "Sorrell will carry the produce when the route is authorised. You carry only the release order while planning; food will not spoil because you took time to think. Burrow marks the weighing bench, the patient's dispatch, the seed table, and the public witness post. That last post stands beside the Museum road. The order becomes enforceable when someone outside the orchard sees the completed chain.",
      "Pip's tiny tree drawing has collected a pear stain. Sorrell notices and smiles for the first time. “That seems right. A tree ought to leave a mark on a picture of itself.” Then her eyes return to the map. She has spent years walking permitted loops that return her to work. This route ends somewhere new. Make it fit the twenty-nine-step allowance without revisiting a square or asking a station to certify something that has not yet happened.",
    ],
    evidence: [
      { title: "The station order", text: "Rows are counted from top to bottom and columns from left to right, beginning at one. Start at row eight/column one. Visit row three/column three, row three/column five, row six/column six, then row one/column eight. Finish at row one/column seven." },
      { title: "Cart-road regulations", text: "Only horizontal and vertical moves are legal. Closed squares cannot be crossed, squares cannot be revisited, and a future station cannot be entered ahead of its turn. The submitted path may contain at most twenty-nine moves." },
    ],
    resolution: [
      "The route reaches the public witness. A Museum courier has to accept the signed order in view of people eating fruit beneath the fence. Sorrell hands a pear to a traveller before anyone can rename the exchange. The courier takes notes. You now know where the withheld harvest was meant to go, and how carefully the road concealed that fact. Beyond the witness post, the Museum's reclining silhouette waits for an audience.",
    ],
  },
  harvest_circuit: {
    narrative: [
      "The storehouse lock recognises the release order, then requests confirmation from the orchard's allocation board. The board has been wired to preserve the exhibition's scarcity pattern: light at the top, darkness where the roots feed. Burrow says the original design represented a tree. Sorrell says nobody who had looked carefully at a tree would wire it to keep its own ground empty.",
      "Restore the leaf and stem in the target diagram. The target is specific, not a demand for everything to shine. Some categories need rest; some light belongs below the canopy. The switches have the same cheap neighbour-sharing arrangement used in the Library. Pressing a cell reverses its own lamp and the lamps touching it horizontally or vertically.",
      "While you work, Burrow moves the lunch break notice to the outside of his window. It used to face him, a reminder that he could not close while applicants waited. “They should know when I need to eat,” he says. Sorrell sets down a pear beside the stamp. Small changes continue around a larger mechanism. You do not have to solve the entire country to let this one door open for the people standing in front of it.",
    ],
    evidence: [
      { title: "The tree pattern", text: "The target has a crown at row one/column three; leaves at row two/columns two through four; a full five-lamp canopy in row three; and stem lamps at row four/column three and row five/column three. All other lamps should be dark." },
      { title: "Shared wiring", text: "Each switch reverses its own lamp and immediate orthogonal neighbours. Edge switches affect fewer lamps. Two identical presses cancel. Different presses commute, so you can plan without maintaining a particular rhythm." },
      { title: "Technician's working method", text: "Try a top-row press pattern, then chase differences downward by pressing directly beneath any lamp that disagrees with the target above. A successful first-row choice leaves the bottom row correct after the chase." },
    ],
    resolution: [
      "The tree lights from canopy to stem. The lock opens. Sorrell's harvest does not solve every hunger in Limited Time, but it becomes food instead of an illustration of need. Burrow gives you a copy of the Museum's hold order. “Show her something she made happen,” he says. “She likes to hear about her art.” You take the road toward a woman who has confused arranging a world with caring for the people inside it.",
    ],
  },
};

export const INVESTIGATIONS_EARLY: Investigation[] = [
  {
    id: "missing_tomorrow", act: 1, location: "library",
    title: "The case of the missing tomorrow", subtitle: "A person cannot be filed under never.",
    premise: [
      "The Library's public clock has a slot beneath its face. It is labelled UNUSED AFTERNOONS. Nothing comes out. Vellum explains that time returned unread must be filed until its owner supplies evidence of intending to use it appropriately. Then a small mouse appears beside the desk, holding a bookmark with a tassel longer than her arm.",
      "Her mother, Elin, borrowed a book about tomorrow. The book came back. Elin did not. Nettle was told there could be no missing person because the public index contained no person by that name. She asks Vellum whether an index can be mistaken about somebody who once warmed her socks beside the kettle. The fox removes his spectacles.",
      "A little moth beside the poetry shelf offers to stay with you. His name is Pip. He finishes other people's poems, and he remembers Elin reading here. He fetches a kettle without asking what you can pay. Together you will trace the afternoon through six parts of the Library's machinery: desks, binding, accounts, event records, passages, and eligibility lamps. This is not a search for a secret way to become important. It is an attempt to establish that an ordinary person cannot be made nonexistent by properly rearranging the evidence of her existence. The same rules will decide how your own arrival is recognised.",
    ],
    conclusion: [
      "Elin's name returns to the index. Her daughter carries the corrected claim to the Hospital, where a nurse will place it beside the unfinished book. The Library cannot release the castle's reservoir, but it can stop helping the reservoir pretend there is nobody to release time to.",
      "Vellum makes you a copy of the willow footnote. “An unspent moment still belongs to someone,” he says. Pip remembers the old rhyme about feeding the Lady curly willow. The path toward a living branch now has a purpose beyond earning a reward: you have seen what the Lady's idea of limited time does to a person who simply hoped to read tomorrow. Nettle's bookmark remains on the desk until someone has time to finish the book.",
    ],
    challenges: [
      stage("afternoon_ledger", "Five desks, one absent person", "Match each clerk to one seal and one defect. Every seal and every defect occurs once.", clerkLedger, [
        "Treat the numbered counters as positions. The address, reversed-date, and duplicate-kiss records occupy three consecutive counters.",
        "The reversed date must be at counter 3: it needs an earlier witness/address pair and room for the White Eye two counters later.",
        "Vellum: Green Door / Absent witness. Fen: Copper Leaf / Blank address. Silt: Black Bell / Reversed date. Rook: Blue Thread / Duplicate kiss. Moss: White Eye / Missing name.",
      ]),
      stage("afternoon_cipher", "Words behind the spine", "Build the binding-order dictionary, decode each word:letter coordinate, and enter the three groups.", marginCipher, [
        "Order the seven dictionary words by length, shortest first, then alphabetically among equal lengths. Number words and letters from 1.",
        "The dictionary is FINITE, KETTLE, READER, UNDOOR, WILLOW, HOSPITAL, TOMORROW. A coordinate such as 4:3 means the third letter of UNDOOR.",
        "Instruction: READ. Subject: THE WILLOW. Where to look: FOOTNOTE.",
      ]),
      stage("afternoon_balance", "The afternoon that balances", "Recover all five integer account balances. None of these minutes was destroyed.", afternoonBalance, [
        "Use Elin + Library and Library + Threshold to express Library and Threshold in terms of Elin.",
        "Library = 40 − Elin, Threshold = Elin − 10, Ward = Elin + 6, Collector = (Elin − 1) ÷ 2. Substitute into the total.",
        "Elin 23; Library 17; Collector 11; Ward 29; Threshold 13.",
      ]),
      stage("afternoon_sequence", "The crime before the offence", "Arrange seven genuine records into the order the events occurred. The sources disagree about what that order means.", afternoonSequence, [
        "The copy and inspection lie between borrowing and the notice. The appeal and freezing follow the notice.",
        "The notice is three positions after borrowing. With the appeal next, freezing two positions after the notice, and erasure afterward, borrowing must be first.",
        "Borrowing → Pip's copy → Inspection → Notice → Appeal → Hospital freezing → Name erasure.",
      ]),
      stage("afternoon_route", "A route for an unclaimed moment", "Visit the four stations in their marked order, reach the receiving desk, and use at most 24 steps without revisiting a cell.", afternoonRoute, [
        "Reserve the upper-right passage for the third station. Visiting it early cuts off your later return.",
        "After station 1, go down and left to the lower-left sweep. Reach station 2 from its left, then turn upward toward station 3.",
        "Using row,column from 1: (1,1),(1,2),(1,3),(2,3),(3,3),(3,2),(3,1),(4,1),(5,1),(5,2),(5,3),(5,4),(4,4),(3,4),(3,5),(3,6),(2,6),(2,7),(3,7),(4,7),(4,6),(5,6),(6,6),(6,7),(7,7).",
      ]),
      stage("afternoon_circuit", "Provisional, but illuminated", "Make the five lamps in the middle row glow, with every other lamp dark. Each press reverses its own lamp and its orthogonal neighbours.", afternoonCircuit, [
        "Presses commute and two presses cancel. Think in odd/even presses, not in how bright the board looks halfway through.",
        "Try a pattern on the top row, then work downward: press directly below each unwanted lamp in the row above. Check whether the bottom row finishes correctly.",
        "From Reset, press these row,column cells once each: (1,1),(1,4),(2,2),(2,4),(3,1),(3,4),(4,3),(5,1),(5,3),(5,5).",
      ]),
    ],
  },
  {
    id: "abundance_audit", act: 2, location: "fields",
    title: "An audit of excessive plenty", subtitle: "The fruit is real. The shortage has an author.",
    premise: [
      "The Fields of Egregious Abundance are so full that branches require scaffolds and the paths must be swept of fallen fruit. Beyond the fence, workers eat carefully divided lunches. The notice describes this contrast as evidence of a healthy relationship between aspiration and restraint.",
      "Burrow, the permit officer, has found a discrepancy he cannot stamp away. The grower's ledger records five full crates departing yesterday. The distribution office records a local shortage today. Neither page contains an arithmetic error. Sorrell, the gardener whose hands filled the crates, asks whether an audit can find the moment when plenty stopped belonging to anybody who might need it.",
      "A permit will get you across the Fields. This investigation determines what crossing means. Reconstruct shipments, decode the hold order, allocate a release reserve, recover the order of events, plan a public route, and restore the storehouse circuit. Every board has all the information needed to finish it. What you uncover will lead toward the Museum, where Lady Supine presents scarcity as one of her finest compositions.",
    ],
    conclusion: [
      "The workers carry their produce through a route that now has public witnesses. The Hospital receives food without a supplementary proof of deserving it. Seed keepers save enough for another planting. Burrow eats the pear beside his stamp, and Sorrell lets a branch rise after its weight has finally been shared.",
      "The exception remains limited; other storehouses are still locked. But you carry the hold order, the true sequence, and an account the Museum cannot reconcile with its story of natural scarcity. Lady Supine loves people who appreciate her art. You are about to become an audience capable of seeing both the composition and the lives arranged behind it. Pip's drawing of the willow has acquired one honest stain, and no official caption.",
    ],
    challenges: [
      stage("harvest_ledger", "The destinations of five full crates", "Match each crate to its destination and the minutes charged to its grower. Each destination and each charge is used once.", harvestLedger, [
        "First use the three-minute chain to attach destinations to charges. Then order the crates using their inequalities.",
        "Pear has 16. Plum < Apricot < Millet, while Willow is exactly 3 above Millet. Only Millet 10 leaves room for all those constraints.",
        "Apricot: Hospital / 7. Pear: Castle / 16. Millet: Storehouse / 10. Willow: Casino / 13. Plum: Compost / 4.",
      ]),
      stage("harvest_cipher", "A harvest written backwards", "Reconstruct the keyed alphabet, undo the substitutions, and reverse each decoded word.", harvestCipher, [
        "Write ABUNDANCE without repeated letters, then append the unused ordinary alphabet. Put that keyed row beneath A–Z.",
        "The keyed row is ABUNDCEFGHIJKLMOPQRSTVWXYZ. Find a coded letter in that row and take the ordinary letter above it, then reverse each word.",
        "THE HARVEST IS HELD NOT LOST.",
      ]),
      stage("harvest_balance", "Enough for five kinds of need", "Allocate the released 72 minutes according to all five obligations, keeping every amount a whole number.", harvestBalance, [
        "Express all four other allocations in terms of the workers' amount. The two fractional reserves matter.",
        "If workers receive w, the total is w + (w+6) + (w−3) + w/2 + w/3 = 72. Multiply through by 6.",
        "Workers 18; Patients 24; Travellers 15; Seed keepers 9; Breakage reserve 6.",
      ]),
      stage("harvest_sequence", "An application submitted too late to exist", "Put the seven harvest events in their actual order. Preserve the inconvenient distinction between a date and an event.", harvestSequence, [
        "Measuring follows sowing immediately. Division and permit printing must fit before collection.",
        "Collection is three positions after measuring. Sowing therefore starts the sequence; sealing and condemnation occupy the two positions after collection.",
        "Sowing → Measuring → Dividing → Printing permits → Collecting applications → Sealing → Condemning surplus.",
      ]),
      stage("harvest_route", "The orchard's other roads", "Carry the release order through four stations in sequence and reach the Museum road in at most 29 steps, without repeating a cell.", harvestRoute, [
        "The first two stations are close, but taking their short shared corridor wastes the northern passage you need to keep available.",
        "Go north from the start. After station 1, loop above it to station 2. Descend to station 3, then climb the eastern edge toward station 4.",
        "Using row,column from 1: (8,1),(7,1),(6,1),(5,1),(4,1),(3,1),(3,2),(3,3),(2,3),(1,3),(1,4),(1,5),(2,5),(3,5),(4,5),(4,4),(4,3),(5,3),(6,3),(6,4),(6,5),(6,6),(5,6),(4,6),(4,7),(4,8),(3,8),(2,8),(1,8),(1,7).",
      ]),
      stage("harvest_circuit", "Let the tree complete its sentence", "Restore the leaf-and-stem target pattern. Each press reverses its own lamp and its orthogonal neighbours.", harvestCircuit, [
        "The target is a living tree, not a fully illuminated board. Compare each lamp with the target before choosing a press.",
        "Choose top-row presses first, then chase differences downward. Press below each lamp that differs from the target in the row above.",
        "From Reset, press these row,column cells once each: (1,2),(1,5),(2,1),(2,3),(3,2),(3,3),(4,1),(4,4),(5,2),(5,4).",
      ]),
    ],
  },
];
