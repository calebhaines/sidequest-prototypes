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
      "The Library has been extended with two dead caravans. Between them, a tarpaulin bows under rainwater nobody has permission to tip away. Vellum leads you past drawers swollen shut around names the catalogue can no longer find. Pip carries a kettle with no lid. There is enough water for three shallow cups. At the last counter, a mouse’s name has been scraped off. The pale rectangle is the cleanest thing in the room.",
      "“Elin passed through all five desks,” Vellum says. His counter is the first. Each desk certified a separate defect, then passed her on while her remaining afternoon thinned. “I thought somebody farther along would fix it.” Behind his spectacles, the skin around his eyes looks sore. The next window was always open. That was how they finished her.",
      "The brass seals were removed during an audit. Their incident slips survived in a biscuit box somebody had used to keep out mice. Reunite seal and defect, and you can show how five ordinary signatures became an order to stop an ordinary body. Pip sets down the kettle. “Use their names,” he says. He does not say everyone was doing their best. Vellum does not ask him to. ",
    ],
    evidence: [
      {"title": "Counter register", "text": "Vellum worked counter 1, Fen counter 2, Silt counter 3, Rook counter 4, and Moss counter 5. Each used one distinct seal and certified one distinct defect. Every seal and defect in the options appears once. A record described as immediately after another belongs to the next counter, with none between."},
      {"title": "Seal maintenance slip", "text": "The replacement-seal register places Copper Leaf immediately after Green Door. Blue Thread was used at neither end of the five-counter line. White Eye was used two counters after Black Bell; exactly one counter stood between them."},
      {"title": "Incident cross-reference", "text": "White Eye marked the missing-name record. Black Bell marked the reversed date. The duplicate-kiss certificate came immediately after the reversed date, and the blank-address certificate immediately before it. These are the recorded defects, including ones a preceding desk may have caused."},
      {"title": "Witness's remaining sentence", "text": "The absent-witness certificate was issued somewhere before the blank-address certificate. The retained statement has therefore crossed out. It gives a positional relation, not an excuse. There were no additional defects outside the five listed."},
    ],
    resolution: [
      "Moss’s White Eye completed the deletion. Vellum’s absent-witness certificate began it; Fen, Silt, and Rook carried it onward through address, date, and kiss. Elin’s signature is the one they rubbed away. Vellum copies his own name into the appeal before the others and holds the pen still until his hand stops shaking. Pip pours the three cups almost to their bottoms. Nobody calls this forgiveness. In the drawer where a person used to be, the leak continues collecting water.",
    ],
  },
  afternoon_cipher: {
    narrative: [
      "Moss’s certificate cites a footnote without identifying the book. Vellum brings out THE MANAGEMENT OF UNFINISHED DAYS. Its buckled boards smell of a room that never dries. A narrow strip of paper is stitched into the binding, its coordinates written so faintly that you have to hold them beside the defective window. Somebody tried to leave a thought where a form would not think to look.",
      "Pip remembers Elin sitting with Nettle beneath the shelf heater, which had been disconnected but still bore a charge for warmth. She used to work through little puzzles after cleaning the roadside washrooms. “She liked an answer that stayed answered,” he says. That afternoon there was a drawing of a willow around an unfinished line. An Aristobat saw the blank before either mouse could finish reading. The file describes their interrupted reading as an inability to comprehend. ",
      "Seven dictionary words remain on the endpaper. Display order made them easy to check; binding order made the hidden sentence harder to recognise at a glance. Nothing has to be guessed. Vellum lays the endpaper flat beneath two chipped saucers. “She wrote for somebody who would take the trouble,” he says. Find the sentence she hid. There are plenty of authorised accounts of Elin. This may be the last account still in her own hand.",
    ],
    evidence: [
      {"title": "The seven endpaper words", "text": "HOSPITAL · WILLOW · FINITE · TOMORROW · UNDOOR · READER · KETTLE. The surviving endpaper contains this complete dictionary. Use every printed word; letter case makes no difference and none contains a hidden space."},
      {"title": "Binder's convention", "text": "The binding convention sorts words by length, shortest first. Equal-length words go in ordinary alphabetical order. Number the resulting dictionary from 1, then number the letters inside each word from 1. Display order on the endpaper is not binding order."},
      {"title": "Pip's careful copy", "text": "For A:B, take dictionary word A and its letter B. Read the coordinates left to right. Each vertical bar ends one answer group. A group may spell more than one ordinary word; the marks between groups survived the inspection."},
    ],
    resolution: [
      "READ THE WILLOW FOOTNOTE. The passage argues that an unused moment remains its owner’s: a dormant branch has not forfeited spring. Elin underlined it once, carefully, as if another line might look demanding. Her afternoon sits intact in other people’s accounts while her body lies stopped in the Hospital. Pip keeps a finger on the drawn branch until Vellum asks to copy the evidence. The paper is soft along the edge where Elin held it. For a moment you can tell exactly where her hand used to be.",
    ],
  },
  afternoon_balance: {
    narrative: [
      "The footnote points to an account sheet bearing Elin’s signature. Her afternoon was divided between five holdings. Each department then certified that the portion in its custody could no longer be spent by her. Nothing was destroyed; every minute survived the journey better than its owner. Across the yard, the stopped residents’ trailers have been boarded up with advertising for tomorrow’s programmes. The account still has an address for each minute. Elin no longer has an address.",
      "The Hospital’s future holding paid to keep her interruption in place. It was never permission for another breath. Nurse Reed had once tried to spend such a balance for a patient and was charged with premature recovery. The Library received handling reserve; the collector received allowance; the threshold took its deposit. Every office can show an expense, and none can show her using a cup, opening a door, or telling her daughter goodnight. Pip asks who gets the balance if she dies. Vellum puts the sheet face down before answering.",
      "You need the actual amounts. Pip moves five teaspoons into a row, one for each account. They came from different trailers after their owners stopped needing kitchens. When he notices you looking, he straightens them without explaining. Account for all ninety-three minutes. The office will not.",
    ],
    evidence: [
      {"title": "Treasury reconciliation", "text": "The departments retained ninety-three whole minutes in total. Elin’s portion plus the Library handling reserve equals forty. Library handling plus the threshold deposit equals thirty. The reconciliation records holdings, not proof that Elin was permitted to use them."},
      {"title": "Collector's retained carbon", "text": "Elin retained one minute more than twice the collector’s allowance. The ward held six minutes more than Elin. All five balances are whole and nonnegative. The carbon lists no sixth account into which a discrepancy can be placed."},
      {"title": "Independent ward check", "text": "Ward and Library together held forty-six minutes. This is an independent copying check on the same holdings. It contributes no additional minutes; adding it to the total would count retained time twice."},
    ],
    resolution: [
      "Twenty-three minutes remain Elin’s in every sense the department refuses to recognise. Seventy minutes fund the desks, collector, ward, and threshold that keep her from them. Vellum circles the twenty-three. The number is smaller than an afternoon and larger than the time Nettle needs to tell her mother what happened at school. “Now they can’t say it was used,” he says. Pip puts the teaspoons away. You have proved a theft; the stolen thing is still under lock, and the person it belongs to is still holding her breath.",
    ],
  },
  afternoon_sequence: {
    narrative: [
      "The account agrees with itself. The records have been made to disagree with Elin. One notice says she had no future when the book was lent; another says the Hospital stopped her after an appeal. The public index rules that someone absent from it cannot have appealed in the first place. On the caravan wall, a poster explains that a regrettable outcome is never an unfortunate event if every department has acted correctly. The poster has been nailed over a hole.",
      "Vellum kept the original records. Their dates were overwritten, but their events still depend on one another. A copied verse needed a borrowed book; an inspection needed something to inspect. Pip recognises his copy by the weak brown ring left by a cup. “I was there,” he says, and then goes silent. In this country, being there is the first fact an inspector can use against you. Vellum writes his name beside the statement. It means somebody has written down who was there with him.",
      "Elin borrowed a book. Nettle pointed at an unfinished line. Pip copied it, and Vellum eventually objected. Arrange the seven actual events, using the surviving relationships instead of the altered dates. The collector arrived after the copy, without being invited by it. Pip needs to see that distinction on paper. ",
    ],
    evidence: [
      {"title": "Pip's statement", "text": "The book was borrowed before Pip copied the verse. The copy preceded the inspection, which preceded the notice. In the seven-event sequence, the notice stands exactly three positions after borrowing. These relations are what Pip remembers despite the overwritten dates."},
      {"title": "Vellum's retained appeal", "text": "Vellum filed the appeal immediately after the notice. The Hospital admitted Elin exactly two positions after the notice. The later rejection comments on the appeal; it is not an eighth event to insert between these seven."},
      {"title": "Nurse Reed's annotation", "text": "The Hospital admission preceded the public index’s erasure of Elin’s name. Every card represents one genuine event, occurring once. The imposed dates are disputed evidence and must not override these event relations."},
    ],
    resolution: [
      "The inspection came first; the reason came later. Elin had a future when she borrowed the book. The confiscation removed it, and the later records described the removal as a condition she had brought with her. Vellum writes CAUSE BEFORE CERTIFICATION in red pencil. Its point snaps halfway through the final word, leaving a gouge in the page. Pip studies the order until he can read it without looking away. It does not bring Elin back. It leaves less room for the office to say that her absence was her own fault.",
    ],
  },
  afternoon_route: {
    narrative: [
      "The appeal is complete. The receiving office refuses it until four substations have handled the original in person. Ordinary delivery depends on the index, and the index has decided there is nobody to deliver for. Vellum opens a hatch into the Library’s old service level: cramped units joined by patched corridors, their previous owners’ wallpaper visible behind the shelves. A child’s height marks run up a door frame until the room became an accounts chamber. Nobody painted over them properly. Nobody mentions them either.",
      "Pip wraps the original in his scarf. The copy witness, numerical audit, uncensored margin, and future cradle must be visited in that order. The lamps have twenty-four steps of appeal allowance. You must plan the entire journey through a place arranged to make the next refusal seem like a reasonable walking distance. At the far end, Nettle waits with a bookmark made from the cardboard inside a milk packet.",
      "Vellum has frozen the passage charge while you study. It is the one discretionary exception he is allowed, and he has already been warned about making a habit of it. Only your submitted route will be counted. “Take the time you need to think,” he says, keeping his voice below the vent that carries sound upstairs. Build a route that fits the allowance without returning to any square. ",
    ],
    evidence: [
      {"title": "Room coordinates", "text": "Count rows downward from the top and columns rightward from the left, beginning at 1. Enter at row 1/column 1. The required stations are row 2/column 3, row 5/column 4, row 2/column 6, then row 6/column 6. The receiving desk is row 7/column 7."},
      {"title": "Appeal passage rules", "text": "Every move reaches one horizontally or vertically adjoining square. Closed rooms cannot be entered. No square may be used twice, including the starting square. A later station cannot be crossed before its turn. The submitted passage must fit the twenty-four-move allowance."},
    ],
    resolution: [
      "The desk accepts the appeal. Nettle asks whether she can take her mother home now. You tell her what the file can do: preserve Elin’s name and her claim. It cannot open the castle’s reservoir. Nettle folds the bookmark once along the old milk-carton seam and puts it in the book. She has kept her mother’s sleeping clothes dry inside a carrier bag. The clerk looks away from the bag and reaches for the next form. The accepted file lies between them, stamped with a date Elin has not been allowed to reach.",
    ],
  },
  afternoon_circuit: {
    narrative: [
      "The public index is controlled by an eligibility board screwed into a wall of salvaged insulation. Five lamps represent basic claims; the surrounding lamps represent scrutiny, delay, repetition, and exception. Every category has been wired into its neighbours because separate circuits cost more. Elin’s file wandered through so many surrounding categories that the machine classified her as too obscured to recognise. ",
      "The middle row must be lit: a clerk, a name, an address, a witness, a future. The other lamps must be dark. Vellum shows you the maintenance diagram and then the scorched mark where an earlier clerk tried to force a relay. “He thought it would be quicker.” A switch reverses its own lamp and the cells immediately above, below, left, and right. Order does not matter; two presses cancel. The cheap wiring is intact even when every label attached to it has gone wrong.",
      "Pip sits beside Nettle on a folded coat. She has the willow drawing, but she is looking at the doorway through which her mother should have returned. Restore the exact middle-row pattern, and the corrected entry can reach all five counters. You will know the repair has worked when the desks can no longer use darkness as a reason to say that Elin was never there.",
    ],
    evidence: [
      {"title": "Index maintenance diagram", "text": "The index board has five rows and five columns. Recognition requires the five lamps of the middle row lit and every other lamp dark. A press reverses its own lamp and its immediate neighbours above, below, left, and right, where those neighbours exist."},
      {"title": "Old technician's advice", "text": "An odd number of touches reverses a lamp; an even number restores it. Choose presses for the top row, then press immediately beneath any difference remaining in the row above. Work downward. Once that upper row agrees with the target, the rows below can be handled without disturbing it."},
      {"title": "Correction authority", "text": "The target preview is the entire required recognition pattern. No rule demands that every switch be used or that the underlying records be destroyed. A corrected entry must retain the evidence of how the previous entry failed."},
    ],
    resolution: [
      "ELIN: PERSON. CLAIM: UNRESOLVED. FUTURE: WITHHELD, NOT ABSENT. The entry appears at every desk. Moss sends an apology addressed to Elin; Vellum puts it in the folder that will go beside her bed. The machine hums exactly as it did before. Nettle takes the willow drawing, then gives it back so you can find the living branch. “Bring this one back,” she says. Pip wraps the papers against the rain. You have repaired a record in a country whose ordinary machinery still makes people disappear.",
    ],
  },
  harvest_ledger: {
    narrative: [
      "Sorrell’s trailer stands at the edge of the orchard on concrete blocks that have begun sinking into the ground. The roof is patched with packing foil, and a pear branch presses against the plastic window. The permit register names her Seasonal Output, Porcine. She has been holding up the branch since before dawn because its prop split and a replacement requires a request. Burrow brings an offcut from his office wall. She accepts it without thanking him. ",
      "Five full crates left yesterday. Today the local allocation is exhausted. Each consignment charged its grower minutes to discourage excessive dependence on abundance. Sorrell asks whether a crate can eat a lunch break. He does not laugh. She has already paid for the fruit. Now she cannot afford the time to receive it.",
      "Destination labels and charges were filed separately so a grower could inspect either record without making an unauthorised comparison. Your audit allows the comparison. Match all five consignments without inventing a sixth load or an exemption. Beyond the office, heaps of fallen fruit stain the gravel. A child is told to put down a pear because food from the ground has not passed allocation. The child puts it down. Sorrell watches until the inspector turns away.",
    ],
    evidence: [
      {"title": "Dispatch accounting", "text": "Every listed destination received exactly one crate and every charge appears once. The Hospital charge exceeds Compost by three. Storehouse exceeds Hospital by three, Casino exceeds Storehouse by three, and Castle exceeds Casino by three. The increments charge the grower, not the destination."},
      {"title": "Grower's carbon copy", "text": "Pear incurred the highest charge. Willow incurred exactly three minutes more than Millet. Apricot incurred less than Millet, and Plum less than Apricot. None of these comparisons describes how much food a crate held."},
      {"title": "Burrow's correction", "text": "The available charges are four, seven, ten, thirteen, and sixteen whole minutes. There was no additional shipment and no exemption. The destination labels record actual deliveries: the crate labelled Hospital did reach the Hospital. Those labels must not be treated as false to make the accounts fit."},
    ],
    resolution: [
      "The Hospital received apricots. Pears went to the castle, willow to the casino, millet to the locked storehouse, and plums to compost. Sorrell paid for every route, including the waste. Burrow changes LOCAL SHORTAGE to DISTRIBUTION UNEXPLAINED. He leaves the old heading visible underneath; an inspector will want to know why he corrected it. Sorrell sets the dispatch record beside her ration bowl. The figures are complete. There is still almost nothing in the bowl, and a whole orchard presses against the fence behind it.",
    ],
  },
  harvest_cipher: {
    narrative: [
      "A dispatch ribbon is caught under the storehouse lock. Sorrell remembers its arrival after measurement and before applications opened. The inspector called it quality preservation, stood under the dry awning, and never looked inside a crate. Along the bottom of the door, brown liquid has begun soaking into the dust. ",
      "Burrow remembers the packing convention: a keyword alphabet, then each word reversed because the stencil is read from the ribbon’s back. He learnt it when shipments still needed protection from roadside thieves. Now the code conceals an order from the people who loaded the shipment. He copies the decoding procedure onto a rejected heating application. Sorrell holds the ribbon against the wind while he writes. Its fibres have been softened by the leaking harvest.",
      "The keyword, ABUNDANCE, remains over the permit window in letters repainted whenever the wall is patched. Ignore its repeated letters when building the substitution row. Decode the letters, then reverse each word separately. Sorrell listens to flies behind the door. “Frost doesn’t post an instruction,” she says. She wants the sentence that made this waste compulsory. Burrow has found a dry place for it in his pocket.",
    ],
    evidence: [
      {"title": "Packing convention, first operation", "text": "Build the keyed row by reading ABUNDANCE left to right, retaining only the first occurrence of each letter. After those letters, append all unused letters from ordinary A–Z in alphabetical order. The resulting row contains twenty-six distinct letters."},
      {"title": "Packing convention, second operation", "text": "Write ordinary A–Z directly above the keyed row. Locate each coded ribbon letter below and recover the ordinary letter above it. Then reverse each decoded word separately, keeping the words in their existing order. The stencil was read from the ribbon’s back."},
      {"title": "Ribbon boundaries", "text": "A slash separates words. No word or letter is missing, and no numeral is a substitute. Once the substitution and reversed stencilling are undone, the ribbon states the condition imposed on the harvest in ordinary language."},
    ],
    resolution: [
      "THE HARVEST IS HELD NOT LOST. The stamp belongs to the Museum’s Office of Appropriate Want. The produce is being withheld so visitors can encounter tasteful scarcity before entering an exhibition of abundance. Sorrell reads the instruction once and takes her hand off the warehouse wall. She had been listening for a fault in the ventilation. There is no fault to repair. Rotting was permitted by the order, hunger required by it. Burrow copies the issuing department’s name. A second trail of juice reaches the dust beneath the lock.",
    ],
  },
  harvest_balance: {
    narrative: [
      "Burrow finds a release clause beneath the hold order. Seventy-two minutes of handling reserve can accompany the produce if five defined needs are met. The clause requires a complete allocation from the people least able to leave work and make one. It was written as a door with a desk pushed across it. Sorrell spreads the pages on the trailer’s steps. Her forearms remain sticky from the pear branch even after she wipes them on her trousers.",
      "Workers need time to collect their own harvest. Patients need time to eat it. Travellers need time to carry it elsewhere. Seed keepers need an allowance for the next planting, and breakage must be covered without making whoever drops a basket pay from their personal clock. ",
      "Patients receive six minutes more than workers; travellers receive three fewer. Seeds take half the workers’ amount and breakage a third. The total must be whole, nonnegative minutes. Burrow reads the fractional obligations twice because one decimal would void the release. Sorrell catches herself rubbing the empty space where her old wedding ring used to be. She sold it for one winter’s heating, and the fruit still grew the next spring. Find the amounts. These five needs should not require a proof, but they do require one here.",
    ],
    evidence: [
      {"title": "Release clause", "text": "Seventy-two minutes must cover all five allocations exactly. Patients receive six minutes more than orchard workers. Travellers receive three minutes fewer than those workers. Each field must contain a whole, nonnegative balance; neither hungry workers nor patients supply any extra."},
      {"title": "Continuity obligations", "text": "Seed keepers receive half the workers’ allocation. Breakage reserve receives one third of it. Both reserves are portions of the same seventy-two-minute release, not costs added after the release has been exhausted."},
      {"title": "Independent check", "text": "Patients plus travellers must equal twice the workers’ amount plus three. The relation follows from the first obligations and checks the copying. No allocation is taken from the time on a patient’s personal clock."},
    ],
    resolution: [
      "Eighteen for workers, twenty-four for patients, fifteen for travellers, nine for seed keepers, six for breakage. The figures fit without taking anything from a patient’s clock. Burrow signs and makes two copies on the reverse of unused refusal forms. Sorrell folds the travellers’ copy into the pocket with her ration card. The release will get some fruit out before it rots. It will not recover the meal breaks already paid, the hours spent pleading, or the food flattened under the wheels while they waited.",
    ],
  },
  harvest_sequence: {
    narrative: [
      "The Museum objects before Burrow’s ink has dried. No valid applications existed when allocation closed. Its statement is accurate: the forms were printed after the fruit had been assigned. Workers stood beneath the promise of open access, then went home without food because they could not present documents the office had not yet produced. Sorrell remembers one man staying at the window until sunset, apologising for whatever he had failed to understand. ",
      "She brings a seed packet, measurement slip, division ledger, permit proof, collection book, sealing photograph, and condemnation note. The contents expose a different order: branches counted before blossom, destinations settled before permission, unclaimed produce described as insufficient demand. Burrow recognises his signature on the permits. The condemnation note was already waiting in the packet. He lays the permits face up where Sorrell can see them.",
      "Arrange the seven events from their actual relations. The appeal needs to show that failure to apply was built into the procedure. Sorrell smooths the empty seed packet with a flattened palm. Somebody had written her husband’s name on it when the soil was still borrowed between two occupied trailers. His time ran out before the first harvest. Your sequence can give the office less room to say the hungry people arrived too late.",
    ],
    evidence: [
      {"title": "Gardener's event relations", "text": "Measurement followed sowing immediately. Division came after measurement and before permit printing. In the seven-event account, collection stands exactly three positions after measurement. These relations survive beneath the office’s imposed dates."},
      {"title": "Storehouse witness", "text": "Permit printing preceded collection of applications. Sealing followed collection. Condemnation followed sealing. The seven cards account for every event in this sequence; there were no simultaneous events or extra events to place between them."},
      {"title": "A date is not an event", "text": "Each card describes something that happened once. Use the recorded relations to order them. The printed dates came from the office under audit and cannot take precedence over the events that its own witnesses describe."},
    ],
    resolution: [
      "Sowing, measurement, division, permit printing, collection, sealing, condemnation. The harvest had been promised elsewhere before its workers could ask for it. Burrow signs the chronology with his own name. Sorrell asks whether he will lose his post. He says he does not know. She folds the spare copy away with the seed packet. The late applications can no longer be used honestly as an explanation, but the office has never needed an honest explanation to make a refusal stick. At least this refusal now has a history somebody has kept.",
    ],
  },
  harvest_route: {
    narrative: [
      "The exception needs four stations before it can open the storehouse. The roads were laid for carts going toward the castle. Getting food toward people requires a different path through gates added, moved, and welded shut over years of renovations. Outside, they are sagging wire, stacked bath panels, and an old trailer pushed across the gravel to become an inspection bay. None of these obstructions costs the office a minute. Every detour costs the person walking it.",
      "Burrow marks the weighing bench, patient dispatch, seed table, and public witness post. You must visit them in that order. The last stands beside the Museum road, where someone outside the orchard will have to see the signed release. Sorrell checks the cart straps while you study. One is a length of curtain braided into rope. ",
      "A pear stain has reached Pip’s drawing of the willow. Sorrell blots it with a sleeve and leaves the mark where it is. There are twenty-nine moves in the passage allowance, no revisits, and no early certification at a later station. Find the complete path before you submit it. Sorrell has spent years walking circuits from her trailer to somebody else’s fruit. She wants this journey to end with a door open. She does not let herself say that yet.",
    ],
    evidence: [
      {"title": "The station order", "text": "Rows count down from the top and columns across from the left, starting at 1. Begin at row 8/column 1. Visit row 3/column 3, row 3/column 5, row 6/column 6, then row 1/column 8. The public receiving post is row 1/column 7."},
      {"title": "Cart-road regulations", "text": "Move to horizontally or vertically adjoining squares only. Closed road squares cannot be crossed. No square may be revisited, and a later station must stay unentered until its turn. The release allowance covers at most twenty-nine moves on the submitted path."},
    ],
    resolution: [
      "The release reaches the public witness. A Museum courier has to receive it in view of people sitting along the fence with their empty bowls. Sorrell hands a pear to a traveller as soon as the receipt is marked. He starts eating before she takes her hand away. The courier notes the exchange without looking at his face. You now have the Museum’s order and a public record of its effect. Above the road, Supine’s reclining silhouette has been painted on new boards nailed across an older warning about subsidence.",
    ],
  },
  harvest_circuit: {
    narrative: [
      "The storehouse recognises the release, then asks for confirmation from the allocation board. The board has been repaired with Library parts and bolted beside a disconnected drinks machine. Its exhibition setting lights the top while leaving the feeding ground dark. Burrow shows you the original tree diagram under a layer of nicotine-coloured varnish. Sorrell has spent her life keeping actual trees alive. She stands back from this one with her arms hanging loose. “Even the picture gets a better allowance than us,” she says.",
      "Restore the precise leaf-and-stem target. The dry instructions occupy more space than the warning about the live terminals. Burrow puts his coat over the exposed side of the cabinet. He has no replacement fuses left.",
      "While you plan, Sorrell moves the lunch-break sign to face the people outside the office. Burrow used to keep it facing inward as a reminder to postpone eating while applicants waited. Neither of them talks about the change. A rotten pear drops behind the fence and breaks open on gravel. Restore it so the existing release can be honoured. There is one usable door here. The country beyond it has not been repaired.",
    ],
    evidence: [
      {"title": "The tree pattern", "text": "Light row 1/column 3; row 2/columns 2, 3, and 4; all five lamps in row 3; and column 3 in rows 4 and 5. These are the crown, canopy, and stem in the retained diagram. Every other lamp must remain dark."},
      {"title": "Shared wiring", "text": "A switch reverses its own lamp and existing immediate neighbours above, below, left, and right. Edge switches therefore reach fewer lamps. Two uses of one switch cancel. Different presses may be reordered without changing their final result."},
      {"title": "Technician's working method", "text": "Test a press pattern across the first row. Then work down, pressing immediately beneath each lamp above that still differs from the target. If the chosen first-row pattern was suitable, the last row agrees after those differences have been chased downward."},
    ],
    resolution: [
      "The tree lights and the lock releases. Fruit leaves the storehouse as food. Sorrell opens the first crate slowly because she already knows some of what the delay has done. Burrow sets the Museum’s hold order in your hands. “Show her,” he says. He does not expect it to shame her; he hopes she will recognise her own name long enough to listen. Behind him, workers carry what is still edible past heaps they cannot save. You take the road toward the woman whose exhibition needed them to be hungry.",
    ],
  },
};

export const INVESTIGATIONS_EARLY: Investigation[] = [
  {
    id: "missing_tomorrow", act: 1, location: "library",
    title: "The case of the missing tomorrow", subtitle: "A mother is missing. The record says there was no mother.",
    premise: [
      "The public clock hangs inside the original Library caravan. A slot beneath its face is labelled UNUSED AFTERNOONS. Nothing has come out in years. Rain has swollen the shelf below it until the books lean away from the wall. Vellum explains that returned time remains filed until its owner proves an appropriate intention to use it. A small mouse waits beside his desk. The bookmark in her hands was cut from food packaging and has a tassel longer than her arm.",
      "Nettle’s mother, Elin, borrowed a book about tomorrow. The book returned; Elin was sent to the Hospital. At the allotment window, Nettle was told that there was no missing person because the index contained no person of that name. She asks whether the index knows who warmed her socks over the kettle, or who used to pull the wet blanket away from the trailer wall. Vellum takes off his spectacles. The answer he is required to give has stopped fitting in his mouth.",
      "Pip offers to stay. His wings bear grey dust from the insulation he sleeps behind, and he handles the kettle carefully because its patched bottom leaks when tilted. He remembers Elin here. You will trace her afternoon through six parts of the Library: desks, binding, accounts, records, passages, and eligibility lamps. None will supply an easy rescue. Together they may establish that a person cannot be made never to have existed by editing the records of her life. The same counters will process your papers when this file is finished. Nettle has already learnt that being told to wait does not mean somebody is coming back.",
    ],
    conclusion: [
      "Elin’s name returns. Nettle carries the corrected claim to the Hospital in a bag patched with transparent tape. A nurse will put it beside the unfinished book. The Library cannot release the castle’s reservoir or let Elin open her eyes. It can stop supplying the lie that there is nobody waiting for either thing. When Nettle reaches the door, she turns back to ask whether her mother can still be charged for a late return. Vellum crosses out the fee.",
      "You take a copy of the willow footnote. An unspent moment still belongs to someone. Pip remembers the rhyme about feeding Lady Supine curly willow, and the path toward a living branch begins to feel less like an errand than a thin opportunity you cannot afford to lose. Behind you, Vellum puts Elin’s corrected folder back in its drawer. The drawer still sticks, the roof still leaks, and the public clock continues collecting unused afternoons. You now know one person whose afternoon it has kept.",
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
      stage("afternoon_circuit", "A name returned to a stopped body", "Make the five lamps in the middle row glow, with every other lamp dark. Each press reverses its own lamp and its orthogonal neighbours.", afternoonCircuit, [
        "Presses commute and two presses cancel. Think in odd/even presses, not in how bright the board looks halfway through.",
        "Try a pattern on the top row, then work downward: press directly below each unwanted lamp in the row above. Check whether the bottom row finishes correctly.",
        "From Reset, press these row,column cells once each: (1,1),(1,4),(2,2),(2,4),(3,1),(3,4),(4,3),(5,1),(5,3),(5,5).",
      ]),
    ],
  },
  {
    id: "abundance_audit", act: 2, location: "fields",
    title: "An audit of excessive plenty", subtitle: "The orchard is full. The people beside it are hungry.",
    premise: [
      "The Fields of Egregious Abundance rise behind chain-link fence and a line of derelict caravans used as permit offices. Timber props hold branches heavy with fruit. The paths are swept so inspectors will not slip on the fallen crop. Beyond the fence, workers eat lunches divided carefully enough that nobody has to mention how small they are. A fresh notice calls this contrast a healthy relationship between aspiration and restraint. Its nails pass through an older sign requesting clean drinking water.",
      "Burrow has found a discrepancy he cannot stamp away. Five full crates departed yesterday; the local distribution ledger reports shortage today. Both pages add correctly. Sorrell, who grew and packed the produce, lives in the trailer nearest the orchard gate. She has spent more time maintaining its steps than the office has spent reviewing her claim. She asks where in these correct accounts food stopped belonging to the people who needed it. Burrow takes out his pen, but there is no field for the answer.",
      "Your permit will let you cross the Fields. The audit follows what else has been made to cross: shipments, coded instructions, reserve minutes, deadlines, cart roads, and the lock’s wiring. Each board provides its full factual record. Reconstruct the records without assigning another hungry person the cost of an error. The trail leads toward the Museum, where Lady Supine displays scarcity as a deliberate composition. Here its subjects wait outside the fence in clothes that still smell of the crops they have been required to give away.",
    ],
    conclusion: [
      "The release has witnesses. The Hospital receives fruit, the seed keepers retain their share, and workers carry salvageable produce along a road that had only taken it from them before. Burrow eats standing up beside his stamp. Sorrell removes one prop and lets an emptied branch rise. Under the storehouse awning, the ruined portion remains piled where the allocation delayed it. Nobody has time to bury it properly. For a few hours, the people outside the fence have food and the office has a record it cannot quietly replace.",
      "Other storehouses remain locked. Your exception has an expiry, and the roofs beyond the fields will still need patching when the travellers’ fruit is gone. You carry the hold order, actual chronology, and shipment ledger toward the Museum. Supine enjoys hearing her compositions admired. This one has names, empty ration bowls, and a stain under the storehouse door. Pip’s willow drawing carries a smaller stain from a pear that finally reached somebody. He leaves it there when he packs the papers against the weather.",
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
      stage("harvest_circuit", "A lock between hunger and rot", "Restore the leaf-and-stem target pattern. Each press reverses its own lamp and its orthogonal neighbours.", harvestCircuit, [
        "The target is a living tree, not a fully illuminated board. Compare each lamp with the target before choosing a press.",
        "Choose top-row presses first, then chase differences downward. Press below each lamp that differs from the target in the row above.",
        "From Reset, press these row,column cells once each: (1,2),(1,5),(2,1),(2,3),(3,2),(3,3),(4,1),(4,4),(5,2),(5,4).",
      ]),
    ],
  },
];
