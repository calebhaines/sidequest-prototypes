export type Effect = {
  time?: number;
  addItem?: string;
  removeItem?: string;
  flag?: string;
  unlock?: string;
  act?: number;
};

export type Choice = {
  label: string;
  next?: string;
  effects?: Effect[];
  requires?: string;
  item?: string;
  puzzle?: string;
  ending?: string;
};

export type Scene = {
  id: string;
  location: string;
  speaker: string;
  role?: string;
  text: string[];
  choices: Choice[];
};

export type Location = {
  id: string;
  name: string;
  subtitle: string;
  act: number;
  scene: string;
  kind: "gate" | "town" | "library" | "lake" | "forest" | "museum" | "casino" | "fields" | "hospital" | "castle" | "pit" | "infinite";
  x: number;
  y: number;
};

export const ACTS = [
  { title: "The unenterable entrance", subtitle: "A refusal, three friends, and a borrowed name.", duration: "45 minutes" },
  { title: "A tasteful amount of everything", subtitle: "Follow a rhyme through the machinery of scarcity.", duration: "50 minutes" },
  { title: "The best we can be", subtitle: "Learn to see the woman inside her monuments.", duration: "50 minutes" },
  { title: "A change of mind", subtitle: "Find a way to move a thought without destroying its thinker.", duration: "55 minutes" },
  { title: "The beauty of other people", subtitle: "Enter the castle that watches itself sleep.", duration: "50 minutes" },
  { title: "Before our heads hit the pillow", subtitle: "Decide who a future is for.", duration: "50 minutes" },
];

export const LOCATIONS: Location[] = [
  { id: "entrance", name: "The Unenterable Entrance", subtitle: "The far side of a promise", act: 1, scene: "entrance_return", kind: "gate", x: 12, y: 75 },
  { id: "shanty", name: "The Shanty Hours", subtitle: "Small homes. Very sweet company.", act: 1, scene: "shanty_arrival", kind: "town", x: 27, y: 64 },
  { id: "library", name: "Library of Time Well Spent", subtitle: "Every minute has a due date", act: 1, scene: "library_arrival", kind: "library", x: 21, y: 37 },
  { id: "lake", name: "Lake of Tasteful Scarcity", subtitle: "An appropriate resource density", act: 2, scene: "lake_arrival", kind: "lake", x: 44, y: 79 },
  { id: "forest", name: "Cigarillo Forest", subtitle: "The trees are taking a break", act: 2, scene: "forest_arrival", kind: "forest", x: 44, y: 52 },
  { id: "fields", name: "Fields of Egregious Abundance", subtitle: "Admission strictly by permit", act: 2, scene: "fields_arrival", kind: "fields", x: 62, y: 73 },
  { id: "museum", name: "Museum of the Supine", subtitle: "A sublimity you can afford", act: 3, scene: "museum_arrival", kind: "museum", x: 57, y: 29 },
  { id: "hospital", name: "Hospital for Those Out of Time", subtitle: "Please continue breathing in order", act: 4, scene: "hospital_arrival", kind: "hospital", x: 75, y: 51 },
  { id: "pit", name: "The Pit of Reversion", subtitle: "An island that is a hole", act: 4, scene: "pit_arrival", kind: "pit", x: 84, y: 77 },
  { id: "casino", name: "The Last Minute", subtitle: "An evening you will never get back", act: 4, scene: "casino_arrival", kind: "casino", x: 37, y: 19 },
  { id: "castle", name: "Great Castle Divine", subtitle: "Near the far reaches of Limited Time", act: 5, scene: "castle_arrival", kind: "castle", x: 77, y: 24 },
  { id: "infinite", name: "The Entrance to Infinite Time", subtitle: "There is another side", act: 6, scene: "infinite_arrival", kind: "infinite", x: 92, y: 10 },
];

export const ITEMS: Record<string, { name: string; description: string; icon: string }> = {
  refusal: { name: "Certified Refusal", description: "Proof that you were properly prevented from doing the thing you wished to do. The ink smells of iron rain.", icon: "▤" },
  identity_papers: { name: "Provisional Personhood", description: "The Library recognises you as a person, pending evidence to the contrary. Pip has added a small moth in the margin.", icon: "▧" },
  willow_verse: { name: "The Unfinished Willow Rhyme", description: "Pip's four lines, folded around a better four lines. The paper is warm where a wing rested.", icon: "♪" },
  willow_cutting: { name: "A Waterlogged Willow Cutting", description: "A living twig fished from the lake. It curls toward the forest as if it remembers someone.", icon: "⌁" },
  curly_willow: { name: "Curly Willow", description: "A branch which grows in the shape of a reconsideration. Lady Supine's bronze mouth has a taste for it.", icon: "❧" },
  valid_coupon: { name: "A Kiss of Time", description: "Lady Supine's face is printed here. A kiss waits behind the perforation. Twelve minutes, once correctly redeemed.", icon: "◈" },
  field_permit: { name: "Abundance Permit", description: "You may witness excessive plenty, provided you do not become accustomed to it.", icon: "▣" },
  art_tickets: { name: "Complimentary Art Tickets", description: "Supine has signed both sides. 'On me,' she wrote. Then, 'Me on.'", icon: "✧" },
  secret_ledger: { name: "The Unbalanced Ledger", description: "Ada's notes prove the Aristobats do not destroy the minutes they collect. They carry them somewhere.", icon: "≋" },
  brain_protocol: { name: "Consent & Continuity Form", description: "Dr. Anima's careful instructions for a mind exchange. Every participant retains a name, a voice, and the right to return.", icon: "☷" },
  blank_brain: { name: "The Unwritten Brain", description: "A living organ that has never been anyone. Its quiet is a beginning, not an erasure.", icon: "◉" },
  god_switch: { name: "The God Switch", description: "A small, solemn device. One socket for each mind. The label reads: CHANGE IS A TWO-WAY EVENT.", icon: "⌘" },
  lullaby: { name: "A Borrowed Lullaby", description: "The tune Brindle hums when everyone else has finished being brave. Its final note stays awake for you.", icon: "♫" },
  supine_brain: { name: "Lady Supine, in a Jar", description: "A mind without a throne. She is still a person. She finds this distinction inconvenient.", icon: "◌" },
  friendship_token: { name: "Three Small Promises", description: "A moth's button, an ox's string, a hare's watch spring. No official exchange value. Enormous actual value.", icon: "♡" },
};

export const QUESTS = [
  { act: 1, title: "Become somebody who can arrive", steps: [
    { text: "Obtain a proper refusal at the entrance", flag: "entrance_denied" },
    { text: "Get to know Pip, the moth who finishes poems", flag: "pip_friend" },
    { text: "Make time for Brindle, the porter with gentle hands", flag: "brindle_friend" },
    { text: "Talk with Ada, who repairs tomorrow", flag: "ada_friend" },
    { text: "Recover your provisional personhood from the Library", flag: "papers_obtained" },
    { text: "Complete the rhyme about curly willow", flag: "willow_rhyme" },
  ] },
  { act: 2, title: "Follow the willow", steps: [
    { text: "Fish a living cutting from the Lake of Tasteful Scarcity", flag: "willow_cutting_found" },
    { text: "Redeem one of Lady Supine's impossible coupons", flag: "coupon_validated" },
    { text: "Find the willow inside Cigarillo Forest", flag: "willow_gathered" },
    { text: "Obtain a permit for the Fields of Egregious Abundance", flag: "fields_permit" },
  ] },
  { act: 3, title: "Experience the Divine on Channel 9", steps: [
    { text: "Accept Lady Supine's invitation to her museum", flag: "art_tickets_received" },
    { text: "Stack the blocks in a manner that pleases her", flag: "blocks_pleased" },
    { text: "Find the meaning beneath Lady Supine's art", flag: "art_understood" },
    { text: "Ask the Keeper of Limited Time for time", flag: "banished" },
  ] },
  { act: 4, title: "Change a mind, literally", steps: [
    { text: "Learn Dr. Anima's rules for a safe exchange", flag: "brain_plan" },
    { text: "Bring an unwritten brain out of the Pit of Reversion", flag: "blank_brain_found" },
    { text: "Win access to the casino's unlisted room", flag: "casino_won" },
    { text: "Wake the God Switch", flag: "god_switch_obtained" },
  ] },
  { act: 5, title: "Enter the room behind the screen", steps: [
    { text: "Complete the Aristobats' quiet handover", flag: "minders_distracted" },
    { text: "Let the constantly observed Lady sleep", flag: "supine_asleep" },
    { text: "Perform the exchange Ada has volunteered for", flag: "mind_changed" },
    { text: "Bring Ada safely home to her own body", flag: "ada_restored" },
  ] },
  { act: 6, title: "Find out what a future costs", steps: [
    { text: "Hear your friends' offer", flag: "friends_offer_heard" },
    { text: "Resolve the entrance's last demand", flag: "final_gate_open" },
    { text: "Choose what to do with the time you have", flag: "ending_chosen" },
  ] },
];

function scene(id: string, location: string, speaker: string, role: string, text: string[], choices: Choice[]): Scene {
  return { id, location, speaker, role, text, choices };
}

const campaign: Scene[] = [
  scene("gate_arrival", "entrance", "The Gatekeeper", "Keeper of the threshold", [
    "“You cannot enter, for this entrance is unenterable.”",
    "The gatekeeper straightens his collar. Somewhere beyond the ironwork, a clock strikes a number you don’t recognise.",
  ], [
    { label: "“We wish to enter.”", next: "gate_wish" },
    { label: "“What is this place?”", next: "gate_place" },
  ]),
  scene("gate_wish", "entrance", "The Gatekeeper", "Keeper of the threshold", [
    "“An excellent wish. Wishing is permitted at all designated thresholds.” He opens a book whose pages have been cut into the shapes of closed doors.",
    "“Before I can refuse you properly, you must apply correctly. An incorrect refusal may constitute an accidental welcome. We cannot have that.” The form asks whether you have already entered the entrance you are applying to enter.",
  ], [
    { label: "Complete the entrance application", puzzle: "entrance", next: "gate_denied", requires: "!entrance_denied", effects: [{ flag: "entrance_denied", addItem: "refusal", time: -2 }] },
    { label: "“What happens if I have no time?”", next: "gatekeeper_hospital" },
    { label: "Ask about the land beyond", next: "gate_place" },
  ]),
  scene("gate_place", "entrance", "The Gatekeeper", "Tourist information, involuntarily", [
    "“The Land of Limited Time. Its borders are fair, its allocations tasteful, and its sunsets strictly accountable.” Behind him the world arrives in layers: a crooked village, a lake like a dropped mirror, a forest exhaling smoke. Last comes a castle, apparently embarrassed by the existence of distance.",
    "“Lady Supine keeps our time. Beyond her castle lies the Land of Infinite Time. The entrance to that land costs more minutes than any person has. A sensible arrangement.”",
  ], [
    { label: "“We still wish to enter.”", next: "gate_wish" },
    { label: "“Who decided how much we have?”", next: "gatekeeper_why" },
  ]),
  scene("gate_denied", "entrance", "The Gatekeeper", "A satisfied civil servant", [
    "The gatekeeper stamps your refusal. With the crack of the stamp, the smaller door beside the great gate springs open.",
    "“There. You have been refused entry through the entrance. You may now proceed through the exit. A different department entirely.” He lowers his voice. “The Shanty Hours are just ahead. People there still put the kettle on before asking what you can pay.”",
  ], [
    { label: "Go through the little exit to the Shanty Hours", next: "shanty_arrival" },
    { label: "“Does everyone have to do this?”", next: "gatekeeper_why" },
  ]),
  scene("gatekeeper_why", "entrance", "The Gatekeeper", "Someone who once arrived", [
    "“Not everyone. Some people are born on the correct side of a door.” His hands briefly forget how to hold the book.",
    "“There was a time when the gate was only a gate. Then someone called it an entrance, and someone else asked whether the entering had been approved. My grandfather was hired to answer. I inherited the answer.” He looks toward the village. “The Library may find you a question that belongs to you.”",
  ], [
    { label: "Return to the application", next: "gate_wish", requires: "!entrance_denied" },
    { label: "Visit the people beyond the little door", next: "shanty_arrival", requires: "entrance_denied" },
    { label: "“What happens to people out of time?”", next: "gatekeeper_hospital" },
  ]),
  scene("gatekeeper_hospital", "entrance", "The Gatekeeper", "Lowering his voice", [
    "“The Hospital receives them. The body continues, but the future has been confiscated. They lie very still, waiting for someone to lend them a next moment.”",
    "A bat-shaped shadow crosses the clock face. “Timelessness is a crime here. Do be careful with the word. Besides, this place is far better than the Land of Restricted Freedom.” He says the final sentence with the exhausted accuracy of a man repeating an announcement.",
  ], [
    { label: "“Then I had better become officially refused.”", next: "gate_wish", requires: "!entrance_denied" },
    { label: "Leave him to his clock", next: "shanty_arrival", requires: "entrance_denied" },
  ]),
  scene("entrance_return", "entrance", "The Gatekeeper", "Keeper of the threshold", [
    "The big gate remains closed. The small door remains open. The difference occupies three shelves in the gatekeeper's office.",
    "Above the ironwork, a billboard Lady blows a painted kiss: BE YOURSELF. BE DIVINE. Beneath it, a new notice requests that citizens avoid being themselves during periods of high demand. The gatekeeper offers you the tired courtesy of someone who remembers your face.",
  ], [
    { label: "“We wish to enter.”", next: "gate_wish", requires: "!entrance_denied" },
    { label: "Talk about his grandfather", next: "gatekeeper_why" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival", requires: "entrance_denied" },
    { label: "Approach the far entrance", next: "infinite_arrival", requires: "ada_restored" },
  ]),

  scene("shanty_arrival", "shanty", "The Shanty Hours", "A place that makes room", [
    "The houses lean into one another, sharing the burden of standing. Laundry flutters between chimneys. Every shirt has a pocket for its owner's remaining time.",
    "A small moth tends a kettle under a torn awning. An ox repairs a bench too delicate for his hands. A hare argues with a watch that has misplaced Thursday. None of them looks surprised that a stranger should need somewhere to sit.",
  ], [
    { label: "Sit beside the moth's kettle", next: "pip_hello" },
    { label: "Help the ox with his bench", next: "brindle_hello" },
    { label: "Meet the hare who repairs watches", next: "ada_hello" },
    { label: "Visit the coupon counter", next: "coupon_counter", requires: "papers_obtained" },
    { label: "Follow the whispers under the awning", next: "town_whispers" },
    { label: "Visit the Library of Time Well Spent", next: "library_arrival" },
    { label: "Gather your friends before the last journey", next: "friends_arrival", requires: "ada_restored" },
  ]),
  scene("pip_hello", "shanty", "Pip", "A moth with a kettle and a difficult poem", [
    "“I'm Pip. That isn't short for anything. I did try making it longer, but it made introducing myself expensive.” The moth pours your tea into the cup with the smallest crack.",
    "“You look wonderfully unfinished. That's a compliment. Most people here have been told what they are so often they've stopped wondering.” Pip slides over a poem. “Would you help with this? It's about a woman who won't finish anything unless someone else supplies the ending.”",
  ], [
    { label: "Introduce yourself and read Pip's poem", next: "pip_rhyme", effects: [{ flag: "pip_friend" }] },
    { label: "“Why do you write?”", next: "pip_remembers", effects: [{ flag: "pip_friend" }] },
    { label: "Thank Pip for the tea", next: "shanty_arrival", effects: [{ flag: "pip_friend" }] },
  ]),
  scene("pip_rhyme", "shanty", "Pip", "Finisher of other people's sentences", [
    "“Lady Supine / Will grant us time / When we feed her / Curly willow.” Pip's feelers dip. “Those lines are old. The next ones belong to us.”",
    "The rhyme is printed on every ration envelope, but its ending has been rubbed away. Pip thinks the missing words matter: wanting time is different from wanting something to do with it. A distant Aristobat tilts one ear toward the awning.",
  ], [
    { label: "Finish the willow rhyme with Pip", puzzle: "rhyme", next: "pip_remembers", requires: "!willow_rhyme", effects: [{ flag: "willow_rhyme", addItem: "willow_verse" }, { flag: "pip_friend" }] },
    { label: "Ask what Pip remembers of the Lady", next: "pip_remembers" },
    { label: "Let the poem wait a moment", next: "shanty_arrival" },
  ]),
  scene("pip_remembers", "shanty", "Pip", "Keeping a little light", [
    "“For we all wish to see / The best we can be / Before our heads / Hit the pillow.” Pip says the words quietly, as though tucking them in.",
    "“My mother used to sing that. She said the Lady was a person before she became a picture. I don't know whether that's true. I do know willow grows where the Cigarillo trees keep their discarded dreams. A cutting from the lake might remember the way.” Pip draws you a tiny moth in the margin.",
  ], [
    { label: "Work on the unfinished verse", next: "pip_rhyme", requires: "!willow_rhyme" },
    { label: "“I'll remember the ending.”", next: "shanty_arrival" },
    { label: "Go to the Lake of Tasteful Scarcity", next: "lake_arrival" },
  ]),
  scene("brindle_hello", "shanty", "Brindle", "A porter who carries more than parcels", [
    "Brindle puts down a bench leg with exquisite care. His horns have little cloth caps so they cannot accidentally catch anyone's washing.",
    "“They made me a porter because I look like one. I don't mind carrying things. It's deciding that's all I am that bothers me.” He offers you the repaired end of the bench. “Sit. My father taught me that a seat isn't finished until somebody has been welcomed into it.”",
  ], [
    { label: "Help Brindle fit the last bench leg", next: "brindle_kindness", requires: "!brindle_helped", effects: [{ flag: "brindle_friend" }] },
    { label: "“What do you do when you aren't carrying things?”", next: "brindle_kindness", effects: [{ flag: "brindle_friend" }] },
    { label: "Take the seat he offers", next: "shanty_arrival", effects: [{ flag: "brindle_friend" }] },
  ]),
  scene("brindle_kindness", "shanty", "Brindle", "A very careful pair of hands", [
    "“I make small things. It surprises people.” From his coat he takes a wooden bird no bigger than a fingernail. Its wings move when he breathes on it.",
    "He gives you five minutes from the little pocket marked FOR NICE THINGS. “You helped. That counts.” Then he hums a tune with a missing last note. “For bedtime. My mum said the last note stays awake and keeps an eye on you. Funny what you can miss about a note.”",
  ], [
    { label: "Accept his kindness and remember the tune", next: "shanty_arrival", requires: "!brindle_helped", effects: [{ flag: "brindle_helped", time: 5, addItem: "lullaby" }] },
    { label: "“Your bird is beautiful.”", next: "shanty_arrival", requires: "brindle_helped" },
    { label: "Return to the bench", next: "shanty_arrival" },
  ]),
  scene("ada_hello", "shanty", "Ada", "Clockmender; hare; occasional nuisance", [
    "“This watch thinks it's important because somebody polished it.” Ada taps the casing. “Underneath, same little gears as the rest of us.” Her long ears turn independently, listening for both faults and informers.",
    "“I'm Ada. If a clock tells you how much you're worth, bring it here. I'll see what I can do.” She studies your face. “No fur, feathers, scales, or horns. Just like her. That must be awkward. People will expect you to explain yourself.”",
  ], [
    { label: "“I'd rather help you explain the watch.”", next: "ada_clock", effects: [{ flag: "ada_friend" }] },
    { label: "“Why do they take people's time?”", next: "ada_clock", effects: [{ flag: "ada_friend" }] },
    { label: "Promise to come back", next: "shanty_arrival", effects: [{ flag: "ada_friend" }] },
  ]),
  scene("ada_clock", "shanty", "Ada", "Looking beneath the face", [
    "Ada opens the watch. Instead of gears, there is a tiny ledger. “Your time isn't running away. It's being accounted away. Different problem.”",
    "She has traced the Aristobats' flight paths. Every collected minute travels toward the castle, except on casino nights, when the bats visit an unlisted room. “There is a machine in there older than the Lady's reign. The God Switch. If she won't change her mind, perhaps we can find out how minds change.” She closes the watch before an enormous ear passes the window.",
  ], [
    { label: "Keep Ada's notes safe", next: "shanty_arrival", requires: "!ledger_received", effects: [{ flag: "ledger_received", addItem: "secret_ledger" }] },
    { label: "“I'll come to you if I find the machine.”", next: "shanty_arrival", requires: "ledger_received" },
    { label: "Ask the Library about time accounts", next: "library_arrival" },
  ]),
  scene("town_whispers", "shanty", "Mrs. Thimble", "A badger who hangs laundry over the truth", [
    "“Don't say 'stolen.' Say 'appropriately reassigned.' The Aristobats have excellent hearing.” Mrs. Thimble clips a sock to the line. It has been darned so often the original sock is a rumour.",
    "“Her ladyship calls us animals. Funny. She puts up mirrors everywhere and never seems to meet anybody.” A shadow wheels overhead. Mrs. Thimble raises her voice. “BE YOURSELF. BE DIVINE. There. Now we've both said something respectable.”",
  ], [
    { label: "Help hang the last sheet, shielding the awning", next: "shanty_arrival", requires: "!laundry_helped", effects: [{ flag: "laundry_helped", time: 3 }] },
    { label: "“What are the Aristobats listening for?”", next: "casino_ledger", requires: "banished" },
    { label: "Thank her in a perfectly legal whisper", next: "shanty_arrival" },
  ]),
  scene("coupon_counter", "shanty", "Huckster", "Licensed distributor of complimentary scarcity", [
    "“A coupon for you, a coupon for me, a coupon for everybody with sufficient documentary personhood!” Huckster's smile has the practiced brightness of a window with nothing behind it.",
    "The coupons bear Supine's face. Her lips flutter on the paper. Each promises a different number of minutes. “The exchange requires exactly five coupons for the stated total. Balance them and you receive one valid kiss after the validation charge. Regulations, darling.”",
  ], [
    { label: "Sort the time coupons", puzzle: "coupons", next: "coupon_sorted", requires: "!coupon_validated", item: "identity_papers", effects: [{ flag: "coupon_validated", addItem: "valid_coupon", unlock: "fields" }] },
    { label: "“Do the coupons cost anything?”", next: "coupon_sorted", requires: "coupon_validated" },
    { label: "Return to the awning", next: "shanty_arrival" },
  ]),
  scene("coupon_sorted", "shanty", "Huckster", "Momentarily sincere", [
    "Five paper Ladies agree on the total. Four vanish into the validation charge. The fifth offers twelve real minutes, its lips waiting behind the perforation.",
    "“They cost the minutes spent proving you deserve them,” Huckster admits. “Not my policy. I just stand near it.” Under the counter he keeps a photograph of someone smiling without permission. “The Fields clerk accepts a validated kiss as evidence that you're worth admitting. Take care. Abundance can make a person difficult to satisfy.”",
  ], [
    { label: "Let the kiss become twelve minutes", next: "shanty_arrival", item: "valid_coupon", effects: [{ removeItem: "valid_coupon", time: 12 }] },
    { label: "Visit the Fields of Egregious Abundance", next: "fields_arrival" },
    { label: "Return to your friends", next: "shanty_arrival" },
  ]),

  scene("library_arrival", "library", "The Library", "A building quietly disagreeing with its name", [
    "Shelves rise like cliffs. The books are filed by the minutes required to understand them, so the poetry is frequently misplaced.",
    "Above the desk: TIME WELL SPENT IS TIME SPENT AS INSTRUCTED. Someone has inserted a small handwritten 'perhaps.' A fox with spectacles chained to the desk looks up. “An arrival? We haven't had one of those in a while. Do you have evidence of having failed to arrive?”",
  ], [
    { label: "Show your certified refusal", next: "library_clerk", item: "refusal", requires: "!papers_obtained" },
    { label: "Look through the margins", next: "library_margin" },
    { label: "Read the history of Lady Supine", next: "library_record", requires: "papers_obtained" },
    { label: "Ask about your identity record", next: "library_identity", requires: "papers_obtained" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),
  scene("library_clerk", "library", "Archivist Vellum", "A fox inside a system of boxes", [
    "“A refusal. Excellent. It establishes that you existed long enough to be inconvenient.” Vellum draws a form from a drawer labelled PERSONS, THEORETICAL.",
    "“Your personhood is in the catalogue. Everything is. Unfortunately, the historical shelves were arranged by a committee whose members each remember a different past.” His tail brushes the floor. “Put the records in the order they actually happened, and we can stop calling you an unidentified expenditure.”",
  ], [
    { label: "Put the catalogue in order", puzzle: "catalog", next: "library_cataloged", requires: "!catalog_solved", effects: [{ flag: "catalog_solved", time: -3 }] },
    { label: "Study the notes in the margins first", next: "library_margin" },
    { label: "Take a breath outside", next: "shanty_arrival" },
  ]),
  scene("library_cataloged", "library", "Archivist Vellum", "Handling a rare human", [
    "Vellum finds a folder with your face in it. The name field is empty. “We used to insist everyone be classified. Human, beast, useful, ornamental. The empty field is newer. Someone wanted you to fill it yourself.”",
    "There is a crease where another page has been removed. Through the paper you can just make out the sentence: A PERSON IS MORE THAN THE WORK THEY PERFORM. Vellum notices you reading it and very carefully fails to notice.",
  ], [
    { label: "“I would like to be a person.”", next: "library_identity", effects: [{ flag: "papers_obtained", addItem: "identity_papers", unlock: "forest", act: 2 }] },
    { label: "“Who removed the other page?”", next: "library_record" },
  ]),
  scene("library_identity", "library", "Archivist Vellum", "Provisional advocate", [
    "“Granted. Provisionally, naturally.” Vellum gives you papers with room for a name, a mistake, and a changed opinion.",
    "“The lake will lend you a line. The forest will admit you if the willow recognises its own song. Beyond that are the Fields, and beyond those the Museum. Speak to Lady Supine, for she is the Keeper of Limited Time.” He touches the empty name field. “Keep one part of yourself unfiled. You may need it.”",
  ], [
    { label: "Look for a cutting at the lake", next: "lake_arrival" },
    { label: "Ask Pip about the willow song", next: "pip_rhyme" },
    { label: "Read the Lady's history", next: "library_record" },
    { label: "Thank Vellum and leave", next: "shanty_arrival" },
  ]),
  scene("library_record", "library", "A book with an unfinished spine", "A history approved after the fact", [
    "The earliest portrait shows Supine standing erect beside an unremarkable doorway. Under it: SHE HAD TIME FOR EVERYONE. The next page has been painted over so heavily it has become a plank.",
    "Later pictures show the doorway multiplying into gates, counters, screens. A note in old ink reads: She feared being ordinary. We assured her she was unique. She asked for a machine that could ensure it. The final page consists entirely of the word DIVINE, repeated until the pen tore through.",
  ], [
    { label: "Remember the woman beside the ordinary door", next: "library_arrival", requires: "!history_read", effects: [{ flag: "history_read" }] },
    { label: "Return the book carefully", next: "library_arrival", requires: "history_read" },
    { label: "Return to your identity papers", next: "library_cataloged", requires: "!papers_obtained" },
  ]),
  scene("library_margin", "library", "The readers who came before", "Small disobediences", [
    "Someone has written 'my daughter laughed here' beside an account of a wasted afternoon. Another reader answers, 'then it was not wasted.' Beneath a chapter on appropriate rest, a third has drawn a pillow.",
    "An old return slip holds four minutes credited to A FUTURE STRANGER. Vellum watches you find it. “A clerical error,” he says. “We have decided to leave it uncorrected.” In this enormous room, the margins are where people still meet.",
  ], [
    { label: "Accept the future stranger's four minutes", next: "library_arrival", requires: "!margin_time", effects: [{ flag: "margin_time", time: 4 }] },
    { label: "Add a small thank-you beside the pillow", next: "library_arrival", requires: "margin_time" },
    { label: "Return to the desk", next: "library_arrival" },
  ]),

  scene("lake_arrival", "lake", "Lake of Tasteful Scarcity", "Formerly Lake of Few Fish; formerly Lake of Perpetual Disappointment", [
    "The water has the patient expression of someone who has heard all its names. A sign reads APPROPRIATE RESOURCE DENSITY. Beneath it, an otter has scratched out 'appropriate.'",
    "A fishing pole rests beside a tin of approved bait. Across the lake, willow shadows curl toward the smoking forest. Something bright moves beneath them: perhaps a fish, perhaps a twig remembering how to be a tree.",
  ], [
    { label: "Speak to the otter on the jetty", next: "lake_fisher" },
    { label: "Catch three fish for the kitchen; look for a willow cutting", puzzle: "fishing", next: "lake_caught", requires: "!willow_cutting_found", item: "identity_papers", effects: [{ flag: "willow_cutting_found", addItem: "willow_cutting", time: -3 }] },
    { label: "Sit quietly beside the water", next: "lake_empty" },
    { label: "Take the cutting into Cigarillo Forest", next: "forest_arrival", requires: "willow_cutting_found" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),
  scene("lake_fisher", "lake", "Mallow", "An otter licensed to be disappointed", [
    "“Fish don't read the signs. Very unpatriotic of them.” Mallow's whiskers tremble with the effort of not smiling.",
    "“Catch three for the kitchen. The willow cutting gets tangled in the same ripples. Don't chase it. Give it somewhere to arrive.” The otter offers you the better half of a sandwich. “They say scarcity makes things precious. I suspect things are already precious, and scarcity makes us frightened. But I'm only an otter. What would I know about water?”",
  ], [
    { label: "Try the fishing line", next: "lake_arrival" },
    { label: "Share the sandwich and watch the ripples", next: "lake_empty" },
    { label: "“You seem to know quite a lot.”", next: "lake_arrival", requires: "!mallow_heard", effects: [{ flag: "mallow_heard", time: 2 }] },
  ]),
  scene("lake_caught", "lake", "The willow cutting", "Something living, rescued from a name", [
    "Three fish go to the kitchen in Mallow's pail. Tangled around the final hook is a curl of green. A drop of water hangs from it long enough to hold the whole castle upside down.",
    "Mallow nods. “There. A thing that wasn't supposed to be plentiful enough for you, and yet.” The cutting twists toward Cigarillo Forest. On the water, its reflection has roots. You wrap it in damp cloth and discover you are suddenly responsible for a very small future.",
  ], [
    { label: "Carry it toward Cigarillo Forest", next: "forest_arrival" },
    { label: "Show Pip what you found", next: "pip_rhyme" },
    { label: "Linger beside the lake", next: "lake_empty" },
  ]),
  scene("lake_empty", "lake", "The water", "No official business", [
    "For a while, nothing requests anything of you. Mallow's float bobs. A small cloud disentangles itself from the castle. Somewhere a fish continues being a fish without a permit.",
    "“I used to come here to catch things,” Mallow says. “Now I come so that my day contains something no one has caught.” There is no reward notice beside this moment. You have it anyway.",
  ], [
    { label: "Leave the moment intact", next: "lake_arrival" },
    { label: "Take its quiet back to your friends", next: "shanty_arrival" },
  ]),

  scene("forest_arrival", "forest", "Cigarillo Forest", "The pause between two obligations", [
    "The trees are slender and pale, each with a tiny ember at its crown. Their smoke drifts in horizontal bands, as if the background is being assembled by a stagehand who is almost ready.",
    "An ash-grey deer rests beside three winding paths. “The forest is on its break. The break is not to be interrupted.” Then she notices the little cutting. “Oh. Unless someone has come to put something back.”",
  ], [
    { label: "Ask the deer for the willow path", next: "forest_path", requires: "!willow_gathered" },
    { label: "Visit the willow again", next: "forest_willow", requires: "willow_gathered" },
    { label: "Read the names carved into the stumps", next: "forest_stumps" },
    { label: "Return to the lake", next: "lake_arrival" },
    { label: "Take the forest road to the Fields", next: "fields_arrival", requires: "coupon_validated" },
  ]),
  scene("forest_path", "forest", "Cinder", "A deer who knows when to stop", [
    "“The signs point toward whatever the castle needed yesterday. Follow the willow instead.” Cinder cups the cutting in her hoof. It leans one way, hesitates, then curls another.",
    "“Pip drew the route on the back of the verse. Learn the little symbols before the smoke hides them.” Between the trunks, discarded billboards repeat BE DIVINE in successively quieter lettering. Beyond them, a living branch refuses to grow straight. The finished song tells it somebody has come to listen.",
  ], [
    { label: "Follow the willow through the shifting paths", puzzle: "forest", next: "forest_willow", requires: "willow_rhyme", item: "willow_cutting", effects: [{ flag: "willow_gathered", removeItem: "willow_cutting", addItem: "curly_willow", unlock: "fields", time: -4 }] },
    { label: "Return to Pip for the unfinished rhyme", next: "pip_rhyme", requires: "!willow_rhyme" },
    { label: "Look for a cutting in the lake", next: "lake_arrival", requires: "!willow_cutting_found" },
    { label: "Rest beside the paths", next: "forest_stumps" },
  ]),
  scene("forest_willow", "forest", "The curly willow", "A tree capable of reconsideration", [
    "At the centre of the smoke stands a willow without an ember. Its branches curl around the empty places where old billboards used to hang.",
    "You plant the rescued cutting beside it. The tree bends toward you and offers a branch already loose. On its bark is a line, perhaps written, perhaps grown: SHE ONLY FINISHES A RHYME WHEN SOMEONE FINISHES IT FOR HER. The branch is neither straight nor ashamed.",
  ], [
    { label: "Carry the branch toward the Lady's museum", next: "fields_arrival" },
    { label: "Read what remains of the forest's old signs", next: "forest_stumps" },
    { label: "Tell your friends the tree is still alive", next: "shanty_arrival" },
  ]),
  scene("forest_stumps", "forest", "Cinder", "Custodian of the unprofitable", [
    "Each stump bears a name instead of a number. Cinder says they belonged to citizens who took their permitted rest here and did not return to work.",
    "“The Hospital came for them. We kept their names.” She lays a hoof on a ring in the wood. “They keep calling this place wasted land. As if a patch of ground must explain why a tired person can sit on it.” The smoke parts, briefly, around a square of ordinary sky.",
  ], [
    { label: "Clear fallen ash from the names", next: "forest_arrival", requires: "!forest_names", effects: [{ flag: "forest_names", time: 3 }] },
    { label: "Let the forest keep its break", next: "forest_arrival", requires: "forest_names" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),

  scene("fields_arrival", "fields", "The Fields of Egregious Abundance", "Nothing lacking but permission", [
    "Beyond a waist-high fence, fruit trees bow beneath impossible harvests. Golden wheat grows out of spilled grain. The road is swept clear of fallen food so that visitors will not form unrealistic expectations.",
    "A mole at the permit window raises a stamp. “You may observe abundance. Participation is a separate category.” In the distance stands the Museum, its enormous reclining silhouette casting shade on everything it has not yet acquired.",
  ], [
    { label: "Apply to cross the Fields", next: "fields_permit", requires: "!fields_permit" },
    { label: "Walk among the harvests", next: "fields_abundance", requires: "fields_permit" },
    { label: "Continue to the Museum of the Supine", next: "museum_arrival", requires: "fields_permit" },
    { label: "Find a valid coupon in the Shanty Hours", next: "coupon_counter", requires: "!coupon_validated" },
    { label: "Return to Cigarillo Forest", next: "forest_arrival" },
  ]),
  scene("fields_permit", "fields", "Permit Officer Burrow", "Admission to the excessive", [
    "“Name. Species. Intended amount of wonder.” Burrow peers at your papers. “Oh. Species: unresolved. We'll use the supplementary form.”",
    "The permit asks what you are, what you intend to gather, and how much gathering would be appropriate. Its stamp supplies the approved request. Fallen willow from the orchard counts; cutting living trees does not. Burrow nudges the inkpad toward you. “I didn't write the categories. But I can stand here while you find room in them.”",
  ], [
    { label: "Resolve the abundance permit", puzzle: "permit", next: "fields_permission", requires: "coupon_validated", item: "identity_papers", effects: [{ flag: "fields_permit", addItem: "field_permit", unlock: "museum", time: -2 }] },
    { label: "“Where do I find a validated coupon?”", next: "coupon_counter", requires: "!coupon_validated" },
    { label: "Step away from the window", next: "fields_arrival" },
  ]),
  scene("fields_permission", "fields", "Permit Officer Burrow", "A small permission, sincerely given", [
    "The stamp lands. “You are officially allowed to see how much there is.” Burrow's own lunch consists of one carefully divided apple.",
    "“They say wanting less is virtuous. They have never asked a hungry person how difficult it is.” He opens the gate and slips a fallen pear into your hand. “The Museum is ahead. If the Lady asks, that pear was a clerical inevitability.” He watches you pass as though opening one small gate matters.",
  ], [
    { label: "Walk toward the Museum", next: "museum_arrival" },
    { label: "Look at what grows beyond the fence", next: "fields_abundance" },
  ]),
  scene("fields_abundance", "fields", "An uncounted pear tree", "Growing regardless", [
    "The fruit is so plentiful that the branches have been fitted with little crutches. A gardener, part boar, carries fallen pears to a locked storehouse marked STRATEGIC WANT.",
    "“I grow things,” she says. “Someone else grows the reasons people can't have them.” You help her upright a branch. From here the lake looks very small, very carefully empty. The pear Burrow gave you tastes of a summer that was never actually scarce.",
  ], [
    { label: "Help the gardener prop the heavy branch", next: "fields_arrival", requires: "!gardener_helped", effects: [{ flag: "gardener_helped", time: 5 }] },
    { label: "Remember what you have seen", next: "museum_arrival" },
    { label: "Return toward the forest", next: "forest_arrival" },
  ]),

  scene("museum_arrival", "museum", "Museum of the Supine", "Also the Museum of the Sublime, on alternating Tuesdays", [
    "The Museum is a reclining woman rendered in architecture. You enter beneath one enormous wrist. The ticket booth occupies a fingernail.",
    "Inside, a telescreen glows: EXPERIENCE THE DIVINE ON CHANNEL 9. Lady Supine's mouth appears first, then her eyes, then the room behind her. She has arranged it so carefully that nothing within it appears capable of touching her.",
  ], [
    { label: "Answer the voice on Channel 9", next: "supine_telescreen", requires: "willow_gathered" },
    { label: "Find the curly willow named in the Museum's inscription", next: "forest_arrival", requires: "!willow_gathered" },
    { label: "Present your complimentary tickets", next: "museum_blocks", requires: "art_tickets_received" },
    { label: "Return to the galleries", next: "museum_gallery", requires: "blocks_pleased" },
    { label: "Speak to the Lady about what you saw", next: "supine_wish", requires: "art_understood" },
    { label: "Find the Hospital after your banishment", next: "hospital_arrival", requires: "banished" },
    { label: "Read the critics in the vestibule", next: "museum_critics" },
  ]),
  scene("supine_telescreen", "museum", "Lady Supine", "Keeper of Limited Time", [
    "“Oh! An audience with a face. How refreshing. Why would I interact with them? Endlessly working, gorging, chuffing. Oxen pulling wagons. They wouldn't know real art if it shot them in the face.”",
    "Her smile arrives half a second before her eyes. “You like art, don't you? You must seek out my art. Tickets, on me. Or perhaps 'me on,' since my face is on them. There. See? Be yourself, darling. Be divine.”",
  ], [
    { label: "“I would like to see your art.”", next: "museum_blocks", requires: "!art_tickets_received", effects: [{ flag: "art_tickets_received", addItem: "art_tickets", act: 3 }] },
    { label: "“Brindle makes beautiful little birds.”", next: "supine_answer" },
    { label: "Let the screen continue smiling", next: "museum_arrival" },
  ]),
  scene("supine_answer", "museum", "Lady Supine", "A smile choosing its direction", [
    "“How industrious. I adore a useful creature.” Her face shifts toward another camera. In the room behind her, a small bell rings each time she moves.",
    "“People begged me for the casino and television. I was perfectly happy without them. Everything here is something I have given someone.” For a moment she seems puzzled that so much giving has left her alone. Then she looks directly at you. “Come. Look at what I made instead of what they made me make.”",
  ], [
    { label: "Accept the invitation", next: "museum_blocks", requires: "!art_tickets_received", effects: [{ flag: "art_tickets_received", addItem: "art_tickets", act: 3 }] },
    { label: "Visit the galleries again", next: "museum_gallery", requires: "blocks_pleased" },
    { label: "Step away from the screen", next: "museum_arrival" },
  ]),
  scene("museum_blocks", "museum", "The Curator", "A peacock appointed to the arrangement of significance", [
    "“Her ladyship requests that you stack these blocks in a manner that pleases her.” The blocks are stone, carved with earth, bark, leaf, and sun. “There are correct relationships between objects. Objects find this very comforting.” The Lady has made a tree whose pieces cannot grow until someone puts them together.",
    "Beside the plinth stands a bronze likeness of Supine, mouth slightly open. A plaque quotes Pip's rhyme. The curled willow in your bag stirs toward it. Somewhere on the screen, the Lady waits for someone else to finish.",
  ], [
    { label: "Feed curly willow to the bronze mouth", next: "museum_blocks", item: "curly_willow", requires: "!supine_fed", effects: [{ removeItem: "curly_willow", flag: "supine_fed", time: 18 }] },
    { label: "Arrange the earth, bark, leaf, and sun", puzzle: "blocks", next: "museum_stacked", requires: "!blocks_pleased", item: "art_tickets", effects: [{ flag: "blocks_pleased", time: -3 }] },
    { label: "Enter the galleries", next: "museum_gallery", requires: "blocks_pleased" },
    { label: "Read the critics while you think", next: "museum_critics" },
  ]),
  scene("museum_stacked", "museum", "The Curator", "Trying to appreciate something", [
    "The stack is stable, but stability is not what opens the door. Earth supports bark. Bark carries leaves toward the sun. A carved root curves out from the plinth as if it has remembered something.",
    "The Curator leans close. “That is certainly an arrangement.” Then, more quietly: “It looks as though something might grow.” The screen chimes APPROVED. Beyond the arch, three enormous paintings await the words their maker has been unable to give them.",
  ], [
    { label: "Enter the three galleries", next: "museum_gallery" },
    { label: "Visit the willow offering before you go", next: "museum_blocks", requires: "!supine_fed" },
  ]),
  scene("museum_gallery", "museum", "Three works by Lady Supine", "No reproductions; no independent interpretations", [
    "THE EXCEPTION shows a single white chair among thousands of empty shoes. THE GIFT shows a hand pouring sand into cups whose bottoms have been removed. THE REST shows a reclining woman with every eye in the room still open.",
    "Each painting has an official caption. Each caption praises beauty, scarcity, or obedience. Beneath the varnish, something much less certain is trying to speak. You remember the small wooden bird in Brindle's enormous hands.",
  ], [
    { label: "Look beneath the official captions", puzzle: "artwork", next: "museum_interpretation", requires: "!art_understood", effects: [{ flag: "art_understood", time: -4 }] },
    { label: "Read your interpretation again", next: "museum_interpretation", requires: "art_understood" },
    { label: "Hear what the critics say", next: "museum_critics" },
    { label: "Return to the entrance hall", next: "museum_arrival" },
  ]),
  scene("museum_interpretation", "museum", "The paintings", "What the maker did not quite mean to say", [
    "The empty shoes are not an audience. They are people the chair's occupant has never met. The gift cannot fill a bottomless cup. The resting woman is terrified to stop being watched.",
    "The art is beautiful. It is also lonely, and frightened, and not entirely successful at hiding either. Appreciating it feels different from approving its captions. For a moment, you can imagine the woman in the old Library portrait finding somewhere ordinary to sit.",
  ], [
    { label: "Find the artist behind the pictures", next: "museum_artist" },
    { label: "Bring the Lady an honest compliment", next: "supine_wish" },
    { label: "Stay with the paintings a little longer", next: "museum_gallery" },
  ]),
  scene("museum_artist", "museum", "The Curator", "A keeper of things people have made", [
    "“She repainted THE REST forty-one times,” the Curator tells you. “Each time she added another eye. She called that improvement.” He folds his fan. “I once asked whether she might remove one. I was transferred to blocks.”",
    "Behind the frame is a sketch of a woman in a plain bed, asleep. Someone has crossed it out. The Curator gently returns it to the shadow. “You saw her wanting something. That may be the first honest audience she has had.”",
  ], [
    { label: "Speak to Supine through the screen", next: "supine_wish" },
    { label: "Thank the Curator for showing you", next: "museum_gallery", requires: "!curator_heard", effects: [{ flag: "curator_heard" }] },
    { label: "Return to the vestibule", next: "museum_arrival" },
  ]),
  scene("museum_critics", "museum", "Shyster, Swindler & Hustler", "Three authorities on agreement", [
    "“Sublime,” says Shyster. “Supine,” corrects Swindler. “Precisely,” says Hustler. They compare notebooks. All contain the same sentence, copied from the official caption.",
    "Swindler whispers that he was told by Shyster, who heard from Hustler, who read Swindler's review. “Information improves as it circulates. Original observation creates unnecessary irregularity.” They ask whether you have an opinion they could borrow after it has been approved.",
  ], [
    { label: "“I thought the paintings were lonely.”", next: "museum_arrival", requires: "!critics_doubted", effects: [{ flag: "critics_doubted" }] },
    { label: "Leave them to their conversation", next: "museum_arrival" },
    { label: "Look at the art for yourself", next: "museum_gallery", requires: "blocks_pleased" },
  ]),
  scene("supine_wish", "museum", "Lady Supine", "Unexpectedly seen", [
    "You tell her the paintings are beautiful. You tell her the woman in THE REST seems tired, and that the small unfinished sketch moved you most.",
    "For one long moment, no camera chimes. “You saw that?” she asks. “Nobody sees that.” Her fingers touch the edge of the screen from the other side. “You may have a wish. An actual wish. Not a commemorative wish-shaped souvenir. Tell me what you want.”",
  ], [
    { label: "“Time. For me, and for the people here.”", next: "supine_banishment", requires: "!banished", effects: [{ flag: "banished", unlock: "hospital", time: -5, act: 4 }, { unlock: "casino" }, { unlock: "pit" }] },
    { label: "“Why are there so many cameras?”", next: "supine_cameras" },
    { label: "“Do you ever wish you could be ordinary?”", next: "supine_ordinary" },
    { label: "Remember what happened when you asked", next: "supine_banishment", requires: "banished" },
  ]),
  scene("supine_cameras", "museum", "Lady Supine", "Maintained in the public eye", [
    "“If no one is watching, how can I know I'm still beautiful?” Her laugh tries to turn the question into a joke and fails halfway.",
    "“The cameras preserve me. The Aristobats preserve the cameras. Everyone does their part.” She sits straighter. “Most die when they behold my uniqueness directly. I spare them by appearing on screens. You have seen my art and survived understanding it. Perhaps, someday, I might let you see me.” Her wish waits between you.",
  ], [
    { label: "“I would like time for the people here.”", next: "supine_banishment", requires: "!banished", effects: [{ flag: "banished", unlock: "hospital", time: -5, act: 4 }, { unlock: "casino" }, { unlock: "pit" }] },
    { label: "Return to the offer of a wish", next: "supine_wish" },
  ]),
  scene("supine_ordinary", "museum", "Lady Supine", "Almost answering", [
    "“Ordinary people are free to stop performing.” She says it as though reading a language she used to know. Then the little camera bell rings.",
    "“But who would keep the time? Who would make the art? What is there to live for when time is infinite and free?” Her eyes search yours for an answer she could safely repeat. “No. I am what I am. I never change my mind.” The wish has become smaller, but it is still there.",
  ], [
    { label: "“Then let my wish be time.”", next: "supine_banishment", requires: "!banished", effects: [{ flag: "banished", unlock: "hospital", time: -5, act: 4 }, { unlock: "casino" }, { unlock: "pit" }] },
    { label: "Return to the offer of a wish", next: "supine_wish" },
  ]),
  scene("supine_banishment", "museum", "Lady Supine", "Keeper, suddenly keeping", [
    "“Time?” The warmth leaves her face so completely that the screen seems to have lost a colour. “I offered you something exquisite. You ask for the thing everybody asks for.”",
    "“Time must be scarce. Otherwise, what would make a life matter? What would make mine matter?” She stands erect before the cameras. “You will not see me again.” Channel 9 collapses into a white line. The Curator looks away. Under the dead screen, somebody has scratched: SHE NEVER CHANGES HER MIND. UNLESS SHE CHANGES HER MIND.",
  ], [
    { label: "Find Dr. Anima at the Hospital", next: "hospital_arrival" },
    { label: "Tell Ada what happened", next: "ada_after_banishment" },
    { label: "Leave the Museum with your own opinion intact", next: "shanty_arrival" },
  ]),
  scene("ada_after_banishment", "shanty", "Ada", "A friend with an alarming idea", [
    "Ada listens until you finish. Then she opens the little ledger. “She's using the minutes to keep herself exactly as she is. That's what the machines are for.”",
    "“A mind is a person, not a policy. I don't want hers destroyed. I want her to find out what living in someone else's day feels like.” Ada's ears hold still. “I'll volunteer for the other socket. If the doctor can promise a way home.” She waits for you to take that condition seriously.",
  ], [
    { label: "“We ask the doctor. Nobody loses their way home.”", next: "hospital_arrival", effects: [{ flag: "ada_volunteered" }] },
    { label: "“You don't have to do this.”", next: "ada_reassurance" },
    { label: "Take time to think with your friends", next: "shanty_arrival" },
  ]),
  scene("ada_reassurance", "shanty", "Ada", "Choosing with her eyes open", [
    "“I know. That's why it can be a choice.” Ada sets down her tools. “They've spent years telling us we're only bodies made for certain jobs. I want her to discover a hare can have a thought large enough for a castle.”",
    "“But I'm not volunteering to vanish. Get the doctor's plan. Get a spare brain that never belonged to anyone. Bring me back. If any part of that becomes impossible, we stop.” Her voice is calm; her paw is trembling.",
  ], [
    { label: "Promise to bring her back", next: "hospital_arrival", effects: [{ flag: "ada_volunteered" }] },
    { label: "Sit beside her before going", next: "shanty_arrival", effects: [{ flag: "ada_volunteered" }] },
  ]),

  scene("hospital_arrival", "hospital", "Hospital for Those Out of Time", "The next moment is currently unavailable", [
    "The Hospital has many clocks, all stopped at different moments. Every stopped face is someone's last available afternoon.",
    "A heron nurse walks quietly between the beds. “No sudden futures in the ward, please.” Beyond the curtain, Dr. Anima arranges models of heads on a table. One model has antlers. One has whiskers. The human model has been polished until it is almost impossible to touch.",
  ], [
    { label: "Ask the doctor how a mind might change", next: "hospital_doctor", requires: "!brain_plan" },
    { label: "Bring the unwritten brain to Dr. Anima", next: "hospital_provision", item: "blank_brain", requires: "!brain_ready" },
    { label: "Review the doctor's exchange plan", next: "hospital_plan", requires: "brain_plan" },
    { label: "Visit the patients in the still ward", next: "hospital_ward" },
    { label: "Bring Ada back for the promised restoration", next: "hospital_return", requires: "reservoir_open" },
    { label: "Seek the God Switch at the casino", next: "casino_arrival", requires: "brain_ready" },
  ]),
  scene("hospital_ward", "hospital", "Nurse Reed", "Attending to unfinished people", [
    "“They aren't dead,” Reed tells you. “Death is an ending. This is an interruption.” A little hedgehog lies beside a half-knitted scarf. A stag has one tear suspended on his cheek.",
    "The nurse keeps speaking to them. “Hearing isn't billed separately. Not yet.” She remembers everyone's name. On the windowsill are gifts no patient has had time to open. “We do not call them empty. A person doesn't stop being a person because someone has closed their account.”",
  ], [
    { label: "Read the names and keep them with you", next: "hospital_arrival", requires: "!ward_seen", effects: [{ flag: "ward_seen" }] },
    { label: "Ask Dr. Anima about the exchange", next: "hospital_doctor", requires: "!brain_plan" },
    { label: "Return to the doctor's room", next: "hospital_arrival" },
  ]),
  scene("hospital_doctor", "hospital", "Dr. Anima", "A tortoise with very steady hands", [
    "“Most bodies need a brain. The exceptionally beautiful have been certified exempt. I have never enjoyed that regulation.” Dr. Anima takes your plan seriously enough to look troubled by it.",
    "“The God Switch shuttles the living brains themselves. Ada would inhabit the Lady; the Lady would inhabit Ada. To remove the Lady afterward, I need an unwritten brain to keep Ada's body alive while her own brain travels home. I will use no spare brain that has ever belonged to someone.”",
  ], [
    { label: "“Show me how to keep both people intact.”", next: "hospital_model" },
    { label: "Ask Ada whether she wishes to volunteer", next: "ada_after_banishment", requires: "!ada_volunteered" },
    { label: "Visit the ward before deciding", next: "hospital_ward" },
  ]),
  scene("hospital_model", "hospital", "Dr. Anima", "Continuity is the point", [
    "The doctor sets a practice board between models of Ada's body and Supine's. Its wires are labelled with tenderness, memory, and resolve. “We preserve what those thoughts do: care, recall, courage. Match each to its own function, not to the body someone thinks deserves it.”",
    "You practise before anything living is involved. “No mind is thrown away. The Pit contains a seed-brain that never became anyone. Bring it out without reverting a resident. And don't mistake a replacement organ for a replacement friend.”",
  ], [
    { label: "Connect each thought to the function that preserves it", puzzle: "brain", next: "hospital_plan", requires: "!brain_plan", effects: [{ flag: "brain_plan", addItem: "brain_protocol", unlock: "pit", time: -3 }] },
    { label: "Return to the consultation", next: "hospital_doctor" },
  ]),
  scene("hospital_plan", "hospital", "Dr. Anima", "Someone who expects a return visit", [
    "The doctor signs the continuity form. “First obtain the unwritten brain. Then find the Switch. Ada's exchange can interrupt the castle's machinery. Afterward, I shelter Supine's brain in a living jar. The unwritten organ keeps Ada's body alive for the moment it takes her own brain to travel home.”",
    "“A jar is no punishment if it remains a voice. We will give her a voice.” He wraps the form in clean cloth. “There is a ferry to the Pit at the lake's far edge. Tell the keeper you want a beginning, not an undoing.”",
  ], [
    { label: "Travel to the Pit of Reversion", next: "pit_arrival", requires: "!blank_brain_found" },
    { label: "Bring the unwritten brain to the doctor", next: "hospital_provision", item: "blank_brain", requires: "!brain_ready" },
    { label: "Go to the casino for the Switch", next: "casino_arrival", requires: "brain_ready" },
    { label: "Speak to Ada about the signed plan", next: "ada_after_banishment", requires: "!ada_volunteered" },
    { label: "Leave the consultation room", next: "hospital_arrival" },
  ]),
  scene("hospital_provision", "hospital", "Dr. Anima", "Preparing a way home", [
    "The unwritten brain rests in the doctor's palm like a sleeping possibility. “No memories. No owner. Good.” He places it in a warm cradle and shows you its slow, living pulse.",
    "“Now we can hold Ada's body safely during the return. The castle machines must be interrupted at the source, however. Her mind needs to reach the Lady's chair.” He gives you a little indicator that will flash when both minds are secure. “Do not proceed unless both lights are on.”",
  ], [
    { label: "Leave the organ in the doctor's safe keeping", next: "casino_arrival", requires: "!brain_ready", effects: [{ flag: "brain_ready", removeItem: "blank_brain", time: 8 }] },
    { label: "Review the sequence once more", next: "hospital_plan" },
  ]),
  scene("hospital_return", "hospital", "Dr. Anima", "Honouring a promise", [
    "Ada's body sits on the examination couch with Supine inside it. The Lady has discovered that hare ears hear everything, including the ward, and she finds it unbearable.",
    "“Do you see what they do to people?” she asks. For once, it is not clear which people she means. The doctor prepares the second exchange. Ada, speaking from the castle chair through the Switch, says, “I'm ready to come home.” Both indicator lights are on.",
  ], [
    { label: "Return Ada to her own body", next: "hospital_extraction", requires: "!ada_restored", item: "god_switch", effects: [{ flag: "ada_restored", unlock: "infinite", time: -4, act: 6 }] },
    { label: "Sit with Ada after the restoration", next: "supine_jar", requires: "ada_restored" },
    { label: "Ask the doctor to explain the plan again", next: "hospital_plan" },
  ]),
  scene("hospital_extraction", "hospital", "Ada", "Ada again", [
    "Dr. Anima shelters Supine's brain in its living jar and puts the unwritten organ into Ada's body. The Switch hums; Ada's own brain travels home and the spare returns to its cradle. Ada gasps and reaches for her ears. “Oh, good. Those.” The unwritten brain's next harmless task will be keeping a little greenhouse warm.",
    "Supine's mind is now secure in its own speaking jar. Her beautiful body rests, safely brainless under its peculiar exemption. The castle no longer needs a mind in its chair to keep the collected minutes flowing outward. For the first time, its reservoirs are opening.",
  ], [
    { label: "Listen to the Lady without her screen", next: "supine_jar", effects: [{ addItem: "supine_brain" }] },
    { label: "Bring Ada to the Shanty Hours", next: "friends_arrival", effects: [{ addItem: "supine_brain" }] },
  ]),
  scene("supine_jar", "hospital", "Lady Supine", "A person with no flattering angle", [
    "“This jar is offensively practical.” Her voice emerges from a little grille the doctor has fitted beside the lid.",
    "Then, much softer: “I heard them. In the ward. I could not turn the sound down.” You ask what there is to live for when time is free. The jar is quiet for a while. “I don't know,” she says. It is the first answer she has given you that leaves room for another person. Ada adjusts the volume so everyone can hear.",
  ], [
    { label: "“You have time to find out.”", next: "friends_arrival", effects: [{ flag: "supine_heard" }] },
    { label: "“You can listen while we decide what comes next.”", next: "friends_arrival", effects: [{ flag: "supine_heard" }] },
  ]),

  scene("pit_arrival", "pit", "The Pit of Reversion", "An island that is a hole", [
    "The ferry circles a place where land ought to be. Waves lean inward without falling. At the centre of the absence stands a small booth, somehow.",
    "Its keeper, part salamander, wears a coat inside out. “Welcome back,” she says. “Don't worry if you haven't been here before. The greeting will catch up.” Steps descend into scenes from people's pasts. One staircase leads to a moment before anything has begun.",
  ], [
    { label: "Ask for a brain that has never been anyone", next: "pit_keeper", requires: "brain_plan" },
    { label: "Visit the small person beside the stairs", next: "pit_child" },
    { label: "Return the unwritten brain to the Hospital", next: "hospital_provision", item: "blank_brain" },
    { label: "Take the ferry back to the Hospital", next: "hospital_arrival" },
  ]),
  scene("pit_keeper", "pit", "Before", "Keeper of beginnings and bad ideas", [
    "“A beginning, then. Most visitors ask me to turn somebody back into somebody easier.” Before shakes her head. “We don't do that anymore.”",
    "The unwritten brain grows in a cradle below the stairs. The steps carry memories; put them in order from the latest to the first breath to reach the moment before a life. “You are arranging a path, not deleting a past. Bring the seed forward. Leave everyone's life where it belongs.”",
  ], [
    { label: "Bring the unwritten beginning forward", puzzle: "reversion", next: "pit_reversed", requires: "!blank_brain_found", item: "brain_protocol", effects: [{ flag: "blank_brain_found", addItem: "blank_brain", time: -4 }] },
    { label: "Ask the child by the stairs what they need", next: "pit_child" },
    { label: "Return to the ferry", next: "pit_arrival" },
  ]),
  scene("pit_reversed", "pit", "Before", "Leaving the past populated", [
    "The cradle reaches the top step. Nothing else has vanished. Before checks every landing, satisfied that all the people still have the lives they brought.",
    "“Good. A new thing, without a stolen old thing.” She wraps the unwritten brain in a cloth printed with tiny question marks. “Tell the doctor it has never been frightened. I'd like its first experience to be kindness.” Behind you, the stairs rearrange themselves into the same way home.",
  ], [
    { label: "Carry the living beginning to Dr. Anima", next: "hospital_provision" },
    { label: "Say goodbye to the child beside the stairs", next: "pit_child" },
  ]),
  scene("pit_child", "pit", "Yesterday", "A salamander growing in both directions", [
    "Yesterday wants to know whether tomorrow still has room for somebody who made a mistake today. They have brought a broken cup to the Pit, hoping to fix the cup without erasing the afternoon they broke it.",
    "You hold the pieces while they fit together. A crack remains. Before approves. “There. Not everything improved needs to pretend it never happened.” Yesterday says they are going home to apologise. They seem very relieved that this is still possible.",
  ], [
    { label: "Help carry the repaired cup to the ferry", next: "pit_arrival", requires: "!yesterday_helped", effects: [{ flag: "yesterday_helped", time: 4 }] },
    { label: "Wish Yesterday a good tomorrow", next: "pit_arrival", requires: "yesterday_helped" },
  ]),

  scene("casino_arrival", "casino", "The Last Minute", "Licensed recreation; unlicensed consequences", [
    "The casino glows with borrowed evenings. A cigarette-shaped progress meter over the bar burns down while patrons wait to collect their winnings. Someone keeps lighting it again.",
    "A stoat in a spotless waistcoat welcomes you. “The Lady created all this because we begged her. I know because the announcement says so.” Behind him, Aristobats carry silver time-vials through a curtain that appears on no floor plan.",
  ], [
    { label: "Ask to join the house's peculiar game", next: "casino_host", requires: "brain_ready" },
    { label: "Inspect where the Aristobats take their winnings", next: "casino_ledger" },
    { label: "Visit the unlisted chapel", next: "casino_chapel", requires: "casino_won" },
    { label: "Return to the Hospital", next: "hospital_arrival" },
    { label: "Gather your friends and take the Switch toward the castle", next: "switch_awake", requires: "god_switch_obtained" },
  ]),
  scene("casino_host", "casino", "Hustler", "The house's smiling explanation", [
    "“We call this game Fair Exchange. Everyone loses equally, except the house, which graciously abstains from equality.” Hustler uncovers a grid of symbols: wings, wealth, measured time, and small things people actually need.",
    "Choose one square in every row and column. The kinder rules scratched beneath the table prefer life, guidance, and shelter to the house's usual values. Find that arrangement and the dealer must return your deposit. “A winner sees the private collection,” Hustler says. “House rule. Very regrettable.”",
  ], [
    { label: "Play a round of Fair Exchange", puzzle: "casino", next: "casino_won", requires: "!casino_won", item: "brain_protocol", effects: [{ flag: "casino_won", time: -3 }] },
    { label: "Inspect the house ledger before playing", next: "casino_ledger" },
    { label: "Return to the gaming floor", next: "casino_arrival" },
  ]),
  scene("casino_won", "casino", "Hustler", "Obliged by his own fine print", [
    "The dealer searches the rulebook for a reason you have not won. Unfortunately, the rulebook is very clear about this one small thing.",
    "He pays eight minutes and unlocks the curtain. “An enjoyable evening,” he says through his teeth. Beyond the velvet is no treasure, no throne, no casino machinery. There is a plain wooden chair, two sockets, and a little switch labelled GOD. It looks terribly disappointed in its name.",
  ], [
    { label: "Collect the returned deposit and enter", next: "casino_chapel", requires: "!casino_paid", effects: [{ flag: "casino_paid", time: 8 }] },
    { label: "Return to the quiet room", next: "casino_chapel", requires: "casino_paid" },
  ]),
  scene("casino_ledger", "casino", "The house account", "Everything taken; very little spent", [
    "The figures show the Aristobats carrying time from villages, fields, and the Hospital. The vials do not keep Lady Supine alive. They keep her unchanged.",
    "Every correction, hesitation, doubt, and ordinary bodily minute has been diverted into the castle reservoir. The casino bleeds away anything left over. Someone has written in Ada's tiny script: A SYSTEM THIS BUSY PREVENTING CHANGE HAS ALREADY TOLD US WHAT IT FEARS.",
  ], [
    { label: "Remember where the missing minutes went", next: "casino_arrival", requires: "!reservoir_known", effects: [{ flag: "reservoir_known" }] },
    { label: "Return to the gaming floor", next: "casino_arrival", requires: "reservoir_known" },
    { label: "Tell Ada what the accounts confirm", next: "ada_after_banishment", requires: "banished" },
  ]),
  scene("casino_chapel", "casino", "The God Switch", "A device waiting for a better verb", [
    "A plate on the wall reads: NO ONE CHANGES THEIR MIND UNLESS THEY CHANGE THEIR MIND. Beneath it, smaller: EXCHANGE REQUIRES TWO LIVING CONTINUITIES.",
    "The sockets are misaligned. One is marked SELF, the other OTHER. The lines between them have been twisted to make every signal return to its origin. The machine is not broken. Someone has carefully arranged it never to encounter anything unfamiliar.",
  ], [
    { label: "Rewire the Switch so two minds can meet", puzzle: "switch", next: "switch_awake", requires: "!god_switch_obtained", effects: [{ flag: "god_switch_obtained", addItem: "god_switch", time: -4 }] },
    { label: "Look at the awake machine", next: "switch_awake", requires: "god_switch_obtained" },
    { label: "Return to the public casino", next: "casino_arrival" },
  ]),
  scene("switch_awake", "casino", "Ada", "Arriving with the other half of the plan", [
    "Ada joins you with her tools tucked into a scarf. “The doctor sent word. There's a way home.” She touches the Switch as one clockmender meeting another.",
    "“My brain goes into her head. I interrupt the reservoir and give it a different instruction. Then the doctor brings me home and gives her a safe living jar. She keeps her thoughts. I keep mine. The people get their time.” Her voice almost breaks on the last sentence. “We should bring Pip and Brindle. I'm better at being brave when they are nearby.”",
  ], [
    { label: "“We go together, and we bring you home.”", next: "switch_agreement", effects: [{ flag: "ada_volunteered" }, { flag: "ada_friend" }] },
    { label: "Review the doctor's continuity plan", next: "hospital_plan" },
  ]),
  scene("switch_agreement", "casino", "Pip & Brindle", "A very small expedition", [
    "Pip brings the poem. Brindle brings his lullaby and a bag containing four lunches. He has guessed that everyone will forget to eat.",
    "The castle's minders listen for doubt, disobedience, and independent rhythm. Ada says their ears are too good: if you give them the right contradiction, they will hear an emergency in opposite directions. Pip squeezes your hand. “I've always wanted to see the far reaches. Less so now that we're going. Still. I'm glad it's with you.”",
  ], [
    { label: "Walk together toward the Great Castle Divine", next: "castle_arrival", effects: [{ unlock: "castle", act: 5, addItem: "lullaby" }, { flag: "pip_friend" }, { flag: "brindle_friend" }] },
    { label: "Take one last moment in the Shanty Hours", next: "shanty_arrival", effects: [{ unlock: "castle", act: 5, addItem: "lullaby" }, { flag: "pip_friend" }, { flag: "brindle_friend" }] },
  ]),

  scene("castle_arrival", "castle", "Great Castle Divine", "Near the far reaches of Limited Time", [
    "The castle appears in layers: walls, towers, windows, a room behind a window, a face behind a screen inside the room. Every layer is watching another.",
    "Two Aristobats hang above the servants' entrance. Their velvet uniforms are lined with silver vials. One ear follows the ticking in your pocket; the other searches for a thought not repeated from a broadcast. Ada stands close enough that you can feel her determination trembling.",
  ], [
    { label: "Find a way past the Aristobat minders", next: "castle_minders", requires: "!minders_distracted", item: "god_switch" },
    { label: "Enter the corridor behind the screens", next: "castle_corridor", requires: "minders_distracted" },
    { label: "Return to Ada at the reservoir controls", next: "castle_changed", requires: "mind_changed" },
    { label: "Return Ada to the Hospital", next: "hospital_return", requires: "reservoir_open" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),
  scene("castle_minders", "castle", "The Aristobats", "Her lady's winged retinue", [
    "“We hear everything,” says the left bat, examining the completed relief order. “Including the supper bell,” says the right. The casebook has given them permission to leave. One final handover must tell the old entrance recorder that a quiet room has been attended to, rather than abandoned.",
    "Pip has kept the wind chime. Ada holds the polished mirror. Brindle draws the velvet curtain as gently as something sleeping. Please the ears, occupy the eyes, give the recorder darkness: the same small signals that let the larger relief proceed must now close the servants' entrance account. The minders wait beside their warm supper, hoping you will not make them listen all evening.",
  ], [
    { label: "Complete the minders' quiet handover", puzzle: "minder", next: "castle_corridor", requires: "!minders_distracted", effects: [{ flag: "minders_distracted", time: -3 }] },
    { label: "Wait beyond the range of their ears", next: "castle_arrival" },
  ]),
  scene("castle_corridor", "castle", "The corridor", "A portrait gallery with nowhere to sit", [
    "Every portrait shows Lady Supine upright. Every caption insists she is at rest. Beneath the frames, cables carry other people's minutes into her room.",
    "Pip touches one warm wire and flinches. Brindle catches the moth before either of you needs to say anything. At the far door, a disconnected camera keeps turning toward a chair, away from a bed, toward a chair. Its red eye is dark now. Supine has built a room where even sleep once had to pretend to be a performance; its machinery has not yet learned how to stop moving.",
  ], [
    { label: "Approach the Lady's bedchamber", next: "castle_bedroom", requires: "!supine_asleep" },
    { label: "Enter the sleeping room", next: "castle_asleep", requires: "supine_asleep" },
    { label: "Check that the minders remain distracted", next: "castle_arrival" },
  ]),
  scene("castle_bedroom", "castle", "Lady Supine", "Still trying to remain herself", [
    "Supine sits erect while her eyelids refuse the assignment. “I told you never to see me again.” Then, scarcely audible: “Did you finish the rhyme?”",
    "She is beautiful in the same frightening way the room is beautiful: nothing has been allowed to happen to it. Brindle hums his mother's tune. The camera bells fall out of step. To let her sleep, you must give the room a rhythm that ends somewhere other than the chair.",
  ], [
    { label: "Finish the lullaby and put the watching room to sleep", puzzle: "lullaby", next: "castle_asleep", requires: "!supine_asleep", item: "lullaby", effects: [{ flag: "supine_asleep", time: -3 }] },
    { label: "Return to the corridor and breathe", next: "castle_corridor" },
  ]),
  scene("castle_asleep", "castle", "A woman asleep", "At last, no audience", [
    "The Lady's head rests on the pillow. The last note of Brindle's tune remains in the room, quietly awake. No one dies from seeing her. No one is asked to approve.",
    "Beneath the bedside table, a childish drawing shows a gate open to a crowd. The paper is older than the billboards. Ada checks the Switch's two lights and Dr. Anima's signed plan. There is still time to decide what kind of change you are prepared to make.",
  ], [
    { label: "Ask Ada whether she is still sure", next: "castle_consent" },
    { label: "Wait a quiet moment beside the bed", next: "castle_consent" },
    { label: "Return to the corridor", next: "castle_corridor" },
  ]),
  scene("castle_consent", "castle", "Ada", "A person making a choice", [
    "“Still sure,” Ada says. “Still coming back.” She places her paw on the second socket herself.",
    "The Lady will awaken in Ada's body. Ada will awaken inside the Lady's beautiful, exhausted head and speak to the reservoir from its own chair. Nothing about this makes Supine less a person. It may, at last, make other people impossible for her to overlook. Pip holds the poem. Brindle holds both of your hands.",
  ], [
    { label: "Activate the exchange with both lights lit", next: "castle_changed", requires: "!mind_changed", item: "god_switch", effects: [{ flag: "mind_changed", time: -5 }] },
    { label: "“We bring you straight back to the doctor.”", next: "castle_consent" },
    { label: "Review the plan before proceeding", next: "hospital_plan" },
  ]),
  scene("castle_changed", "castle", "Ada, from the Lady's chair", "A hare's thought, in a divine body", [
    "Supine's beautiful face opens its eyes and looks at you with Ada's expression. “Oh. There are so many buttons.” The cameras swivel toward the first spontaneous movement they have witnessed in years.",
    "In Ada's body, the Lady wakes furious. “These ears. This heartbeat. This awful vulnerable little—” Then she hears the castle pipes carrying minutes from the Hospital. Her borrowed ears flatten. Ada presses the control marked RETURN TO SENDER. Across the land, clock hands begin to move.",
  ], [
    { label: "Help Ada keep the reservoir open", next: "ada_supine", requires: "!reservoir_open", effects: [{ flag: "reservoir_open", time: 24 }] },
    { label: "Ask the Lady what she can hear", next: "ada_supine", requires: "!reservoir_open", effects: [{ flag: "reservoir_open", time: 24 }] },
    { label: "Bring Supine-in-Ada safely to the doctor", next: "hospital_return", requires: "reservoir_open" },
  ]),
  scene("ada_supine", "castle", "Two minds", "For once, unable to talk over one another", [
    "Ada instructs the machines to continue returning time without a Keeper. “A clock can count without owning what it counts.” The command settles into the pipes.",
    "Supine tries to order Brindle to carry her. He offers his arm instead. She accepts it with the furious dignity of someone discovering that help is different from obedience. Ada says the Switch will carry her home from the Hospital. “Go. Keep both lights on. I'll be here until the moment I won't.”",
  ], [
    { label: "Bring Supine-in-Ada to Dr. Anima", next: "hospital_return" },
    { label: "“We'll see you at home.”", next: "hospital_return" },
  ]),

  scene("friends_arrival", "shanty", "Pip, Brindle & Ada", "The people who made room for you", [
    "There are changes everywhere, small enough to fit into a day. Mrs. Thimble takes her washing down slowly. Huckster closes the counter for lunch. The Hospital windows stand open.",
    "Your friends wait on Brindle's repaired bench. Ada has brought the returned reservoir's accounts. “Most of the minutes belong to people who already lost them. We gave them back.” She turns the page. “The far entrance still asks for more than one person can carry.” Pip takes out a button. Brindle unties a string. Ada removes a watch spring.",
  ], [
    { label: "Sit down and hear what your friends have decided", next: "friends_offer", effects: [{ flag: "friends_offer_heard", addItem: "friendship_token", unlock: "infinite", act: 6 }] },
    { label: "“I'm glad everyone is here.”", next: "friends_offer", effects: [{ flag: "friends_offer_heard", addItem: "friendship_token", unlock: "infinite", act: 6 }] },
  ]),
  scene("friends_offer", "shanty", "Your little pals", "Offering the last of their time", [
    "“Mine is seven minutes,” Pip says. “I thought I'd spend them making a very good ending. This could be one.” Brindle lays down nine. “A seat isn't finished until somebody's welcomed into it.” Ada adds six. “The gate counts one future. We can give it four.”",
    "They offer you the last minutes in their own pockets. No bargain, no performance, no expectation of being thanked well enough. The Lady's jar is quiet. You can accept the pledge, or ask them to keep their time. Either way, they will walk to the gate with you.",
  ], [
    { label: "Accept their pledge; promise they will come with you", next: "friends_take", requires: "!friends_decided", effects: [{ flag: "friends_decided" }, { flag: "friends_pledged", time: 22 }] },
    { label: "“Keep your minutes. I want my friends, not their last moments.”", next: "friends_refuse", requires: "!friends_decided", effects: [{ flag: "friends_decided" }, { flag: "friends_kept_time" }] },
    { label: "Return to the gate together", next: "infinite_arrival", requires: "friends_decided" },
  ]),
  scene("friends_take", "shanty", "Pip", "Trusting you with an ending", [
    "The transferred minutes arrive warm. Your friends do not vanish. Their bodies are here; their futures are now held in the promise you made.",
    "Pip folds the poem into your pocket. “Then don't spend them on becoming somebody too important to sit with us.” Brindle laughs, a little shakily. Ada threads the watch spring through the button and string. “Not currency,” she says. “Evidence.” You leave the bench together, the last of their time waiting to become a next day.",
  ], [
    { label: "Walk with them to the Infinite entrance", next: "infinite_arrival" },
    { label: "Stop beside the lake on the way", next: "lake_empty" },
  ]),
  scene("friends_refuse", "shanty", "Brindle", "Relieved and trying not to show it", [
    "Brindle closes his pocket very slowly. Pip cries a little, then says the steam from the kettle is particularly emotional today.",
    "Ada writes a different entry in the ledger: THE OFFER WAS MADE. THE OFFER WAS HEARD. THE PEOPLE WERE NOT SPENT. “Maybe the gate needs to learn a new way of counting,” she says. The three little tokens remain in your hand. For once, they stand for something that has not been taken away.",
  ], [
    { label: "Take the unspent offer to the far entrance", next: "infinite_arrival" },
    { label: "Sit together for one more cup of tea", next: "shanty_arrival" },
  ]),
  scene("infinite_arrival", "infinite", "The Entrance to Infinite Time", "The other threshold", [
    "There is no gatekeeper here. The gate has learned to speak for itself. Its face is a blank clock surrounded by four small circles.",
    "YOU DO NOT HAVE ENOUGH TIME TO ENTER INFINITE TIME. Below that sentence, a smaller clock shows ninety minutes in the threshold's escrow: time collected from travellers it turned away. The gate demands thirty, but normally lets one person claim the whole account. Your friends stand beside you. Behind you, Limited Time is having its first unsupervised afternoon.",
  ], [
    { label: "Read the gate's final rule together", puzzle: "final_gate", next: "infinite_open", requires: "friends_decided", item: "friendship_token", effects: [{ flag: "final_gate_open", time: -4 }] },
    { label: "Consider what lies beyond", next: "infinite_question", requires: "final_gate_open" },
    { label: "Hear your friends' offer before deciding", next: "friends_offer", requires: "!friends_decided" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),
  scene("infinite_open", "infinite", "The gate", "Finally reading its own small print", [
    "The inscription changes. The original rule counted each person separately. Below it, hidden under centuries of official polishing, another line remains: AN ENTRANCE IS MADE TO LET A FUTURE THROUGH.",
    "Four circles light together. The pledged minutes become available to their owners again; an unspent offer is counted just as clearly. For the first time, enough does not mean one person holding more. It means people refusing to make one another less. The gate opens inward, outward, and somewhere the wall never considered.",
  ], [
    { label: "Decide what kind of future to enter", next: "infinite_question" },
    { label: "Ask the Lady what she thinks now", next: "infinite_lady" },
  ]),
  scene("infinite_lady", "infinite", "Lady Supine", "Keeping company", [
    "“If time is infinite and free,” the jar asks, “what is there to live for?” This time she is not delivering a speech. She is waiting for someone to answer.",
    "Pip says a poem. Brindle says a very small wooden bird. Ada says a clock repaired because somebody loves the person who owns it. You can think of a bench, a cracked cup, a tree without an ember. “Oh,” the Lady says. “Things that don't have to be mine.”",
  ], [
    { label: "Let the answer remain unfinished", next: "infinite_question", effects: [{ flag: "supine_listened" }] },
    { label: "“You could make something for someone.”", next: "infinite_question", effects: [{ flag: "supine_listened" }] },
  ]),
  scene("infinite_question", "infinite", "The people at the threshold", "No correct answer has been issued", [
    "Beyond the opening there are no clocks. Perhaps there are no endings. Perhaps this is simply a country that has stopped making endings into a price.",
    "The gate will do what you ask once. You can open its promise across Limited Time, so everyone has a shared tomorrow without becoming immortal. You can cross with your friends into the unmeasured country. Or you can close the account, keep your ordinary days, and return home together. No screen tells you which answer is divine.",
  ], [
    { label: "Open time to everyone. Let ordinary lives belong to their owners.", next: "ending_commons", ending: "commons", effects: [{ flag: "ending_chosen" }] },
    { label: "Cross into Infinite Time together, and discover what it means.", next: "ending_infinite", ending: "infinite", effects: [{ flag: "ending_chosen" }] },
    { label: "Keep our finite days. Go home together.", next: "ending_stay", ending: "stay", effects: [{ flag: "ending_chosen" }] },
  ]),
  scene("ending_commons", "infinite", "The next afternoon", "An ending with room in it", [
    "The gate opens along every place the land used to close. The Hospital gives its patients back their unfinished afternoons. The Fields gardener unlocks the storehouse. Vellum writes a new catalogue heading: THINGS PEOPLE CHOSE.",
    "Nobody becomes immortal. The clocks still count. They simply cease to decide who deserves a next moment. On Brindle's bench, Lady Supine listens while Pip fails to finish a rhyme. She supplies the last word. It is an ordinary word, and everyone makes room for it.",
  ], []),
  scene("ending_infinite", "infinite", "The unmeasured country", "Four people, and a person in a jar", [
    "You cross together. Pip's wings catch a light that does not hurry. Brindle puts his little bird down and lets it fly. Ada takes the hands off her watch, then keeps it because she likes the sound.",
    "Infinite Time does not arrive as a guarantee. It arrives as a day no one has priced. The Lady asks whether she may make something ugly, just to see what happens. You walk until you find a place to sit, and discover you still have things to say.",
  ], []),
  scene("ending_stay", "shanty", "The Shanty Hours", "A future you can touch", [
    "You close the gate gently. No friend is spent. No promise is collected. The returned minutes belong to the people who lost them, and Ada keeps the reservoir open.",
    "There will still be last afternoons. There will be grief, and mistakes, and cups that cannot be perfectly repaired. There will also be this bench, this kettle, these people. Supine asks for a little paper to draw on. Tonight the poem finishes before your heads hit the pillow. Tomorrow, you begin another.",
  ], []),
];

export const SCENES: Record<string, Scene> = Object.fromEntries(campaign.map((entry) => [entry.id, entry]));
