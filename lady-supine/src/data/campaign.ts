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
  { title: "The unenterable entrance", subtitle: "Obtain a refusal before your existence can be recorded.", duration: "45 minutes" },
  { title: "A tasteful amount of everything", subtitle: "Follow a dead woman's song through an administered shortage.", duration: "50 minutes" },
  { title: "The best we can be", subtitle: "Look at what was built with other people's last hours.", duration: "50 minutes" },
  { title: "A change of mind", subtitle: "Prepare a return before you put your friend into someone else's head.", duration: "55 minutes" },
  { title: "The beauty of other people", subtitle: "Carry two living brains through a room that will not stop watching.", duration: "50 minutes" },
  { title: "Before our heads hit the pillow", subtitle: "Reach the last gate with the people you promised to bring home.", duration: "50 minutes" },
];

export const LOCATIONS: Location[] = [
  { id: "entrance", name: "The Unenterable Entrance", subtitle: "A closed gate built higher each year", act: 1, scene: "entrance_return", kind: "gate", x: 12, y: 75 },
  { id: "shanty", name: "The Shanty Hours", subtitle: "Temporary homes, long after the wheels sank", act: 1, scene: "shanty_arrival", kind: "town", x: 27, y: 64 },
  { id: "library", name: "Library of Time Well Spent", subtitle: "Cancelled names above the flood line", act: 1, scene: "library_arrival", kind: "library", x: 21, y: 37 },
  { id: "lake", name: "Lake of Tasteful Scarcity", subtitle: "The kitchen waits for three fish", act: 2, scene: "lake_arrival", kind: "lake", x: 44, y: 79 },
  { id: "forest", name: "Cigarillo Forest", subtitle: "The stumps keep the names", act: 2, scene: "forest_arrival", kind: "forest", x: 44, y: 52 },
  { id: "fields", name: "Fields of Egregious Abundance", subtitle: "The harvest rots behind a locked fence", act: 2, scene: "fields_arrival", kind: "fields", x: 62, y: 73 },
  { id: "museum", name: "Museum of the Supine", subtitle: "New plaster while the settlement's ceilings fall", act: 3, scene: "museum_arrival", kind: "museum", x: 57, y: 29 },
  { id: "hospital", name: "Hospital for Those Out of Time", subtitle: "Bodies charged for the storage of their next moment", act: 4, scene: "hospital_arrival", kind: "hospital", x: 75, y: 51 },
  { id: "pit", name: "The Pit of Reversion", subtitle: "An island that is a hole", act: 4, scene: "pit_arrival", kind: "pit", x: 84, y: 77 },
  { id: "casino", name: "The Last Minute", subtitle: "The deposit waiting behind the curtain", act: 4, scene: "casino_arrival", kind: "casino", x: 37, y: 19 },
  { id: "castle", name: "Great Castle Divine", subtitle: "Near the far reaches of Limited Time", act: 5, scene: "castle_arrival", kind: "castle", x: 77, y: 24 },
  { id: "infinite", name: "The Entrance to Infinite Time", subtitle: "An escrow filled by people turned away", act: 6, scene: "infinite_arrival", kind: "infinite", x: 92, y: 10 },
];

export const ITEMS: Record<string, { name: string; description: string; icon: string }> = {
  refusal: { name: "Certified Refusal", description: "The gate's stamp proves you existed long enough to be refused. Its mark has bled through the paper.", icon: "▤" },
  identity_papers: { name: "Provisional Personhood", description: "Vellum's signature holds your place in a catalogue of cancelled names. Keep the paper dry. Water damage is not recognised.", icon: "▧" },
  willow_verse: { name: "The Unfinished Willow Rhyme", description: "A song Pip's mother sang before he understood what her remaining minutes meant. Written on the back of a ration refusal.", icon: "♪" },
  willow_cutting: { name: "A Waterlogged Willow Cutting", description: "The lake kept these leaves alive beneath the smoke. The cloth around the root end must remain damp.", icon: "⌁" },
  curly_willow: { name: "Curly Willow", description: "A living branch from beyond the drainage ditch. The Museum's bronze mouth will trade it for eighteen minutes.", icon: "❧" },
  valid_coupon: { name: "A Kiss of Time", description: "Four paper Ladies were shredded to validate this fifth. Twelve minutes, after the time spent proving entitlement.", icon: "◈" },
  field_permit: { name: "Abundance Permit", description: "Permission to see food growing behind the fence. The terms do not permit you to become less hungry.", icon: "▣" },
  art_tickets: { name: "Complimentary Art Tickets", description: "Supine's face on both sides. Admission to the room repaired with hours taken from the houses outside.", icon: "✧" },
  secret_ledger: { name: "The Unbalanced Ledger", description: "Ada copied the charges beneath her coat lining. The hours deducted for illness and grief have all reached the castle.", icon: "≋" },
  brain_protocol: { name: "Consent & Continuity Form", description: "Anima's signed return sequence for two living brains. Both lights must stay on. Ada's agreement cannot substitute for a way home.", icon: "☷" },
  blank_brain: { name: "The Unwritten Brain", description: "A living organ with no previous owner. It must be kept warm until it can hold Ada's body alive during her return.", icon: "◉" },
  god_switch: { name: "The God Switch", description: "Two sockets and lined channels for moving living brains. Ada's organ goes through the hole in Supine's head. Supine's occupies Ada in return.", icon: "⌘" },
  lullaby: { name: "A Borrowed Lullaby", description: "The tune Brindle's mother left unfinished while he fell asleep. He sings it now when the pain keeps him awake.", icon: "♫" },
  supine_brain: { name: "Lady Supine, in a Jar", description: "Her actual living brain, removed from Ada and kept conscious by Anima's pump. Contained, still speaking, still responsible.", icon: "◌" },
  friendship_token: { name: "Three Small Promises", description: "Pip's button, Brindle's string, Ada's watch spring. The gate must recognise the people attached to them.", icon: "♡" },
};

export const QUESTS = [
  { act: 1, title: "Get your existence entered in the record", steps: [
    { text: "Obtain a proper refusal at the entrance", flag: "entrance_denied" },
    { text: "Sit with Pip beneath the leaking awning", flag: "pip_friend" },
    { text: "Help Brindle repair what remains of his father's bench", flag: "brindle_friend" },
    { text: "Meet Ada at the clockmender's trailer", flag: "ada_friend" },
    { text: "Recover your provisional personhood from the Library", flag: "papers_obtained" },
    { text: "Finish the willow song Pip's mother left behind", flag: "willow_rhyme" },
  ] },
  { act: 2, title: "Carry something living beyond the drainage ditch", steps: [
    { text: "Fish a living cutting from the Lake of Tasteful Scarcity", flag: "willow_cutting_found" },
    { text: "Validate the coupon without losing its twelve minutes", flag: "coupon_validated" },
    { text: "Find the willow inside Cigarillo Forest", flag: "willow_gathered" },
    { text: "Obtain permission to pass the fenced harvest", flag: "fields_permit" },
  ] },
  { act: 3, title: "Experience the Divine on Channel 9", steps: [
    { text: "Accept Lady Supine's invitation to her museum", flag: "art_tickets_received" },
    { text: "Stack the blocks in a manner that pleases her", flag: "blocks_pleased" },
    { text: "Read what the official captions do not describe", flag: "art_understood" },
    { text: "Ask the Keeper of Limited Time for time", flag: "banished" },
  ] },
  { act: 4, title: "Plan the return before moving either brain", steps: [
    { text: "Obtain Anima's signed sequence for both living continuities", flag: "brain_plan" },
    { text: "Bring an unwritten brain out of the Pit of Reversion", flag: "blank_brain_found" },
    { text: "Win access to the casino's unlisted room", flag: "casino_won" },
    { text: "Restore the God Switch's organ-transfer channels", flag: "god_switch_obtained" },
  ] },
  { act: 5, title: "Enter the room behind the screen", steps: [
    { text: "Complete the Aristobats' quiet handover", flag: "minders_distracted" },
    { text: "Bring the watching room to its final lullaby beat", flag: "supine_asleep" },
    { text: "Place Ada's brain through the opening in Supine's head", flag: "mind_changed" },
    { text: "Remove Supine from Ada's body and return your friend", flag: "ada_restored" },
  ] },
  { act: 6, title: "Find out what a future costs", steps: [
    { text: "Hear what your friends have left to offer", flag: "friends_offer_heard" },
    { text: "Resolve the entrance's last demand", flag: "final_gate_open" },
    { text: "Give the threshold its final instruction", flag: "ending_chosen" },
  ] },
];

function scene(id: string, location: string, speaker: string, role: string, text: string[], choices: Choice[]): Scene {
  return { id, location, speaker, role, text, choices };
}

const campaign: Scene[] = [
  scene("gate_arrival", "entrance", "The Gatekeeper", "Paid to remain at a closed gate", [
    "“You cannot enter, for this entrance is unenterable.” The gatekeeper says it without looking at you. His collar is held shut with a safety pin. Behind him, a second uniform hangs from a nail, its sleeves stiff with old rain.",
    "The iron gate has been extended with bed frames and wire. Beyond it, the low roofs appear a little at a time through the mist. A clock strikes an unfamiliar number. The keeper waits for the sound to finish, then writes down how long you spent listening. Already something has been deducted.",
  ], [
    { label: "“We wish to enter.”", next: "gate_wish" },
    { label: "“What is this place?”", next: "gate_place" },
  ]),
  scene("gate_wish", "entrance", "The Gatekeeper", "Still responsible for the same refusal", [
    "“Wishing is permitted at designated thresholds.” He opens a ledger swollen by damp. Pages have been cut into closed-door shapes; the loose pieces lie under his chair. “Before I can refuse you properly, you must apply correctly. An incorrect refusal may constitute an accidental welcome.” He has said this for so many years that his mouth barely moves.",
    "The form asks whether you have entered the entrance you are applying to enter. It also asks who will be liable for your remaining time. The keeper offers a pencil worn almost to its eraser. People have pressed hard enough to tear the paper. Most of their answers are still readable.",
  ], [
    { label: "Complete the entrance application", puzzle: "entrance", next: "gate_denied", requires: "!entrance_denied", effects: [{ flag: "entrance_denied", addItem: "refusal", time: -2 }] },
    { label: "“What happens if I have no time?”", next: "gatekeeper_hospital" },
    { label: "Ask about the land beyond", next: "gate_place" },
  ]),
  scene("gate_place", "entrance", "The Gatekeeper", "Information supplied under obligation", [
    "“Welcome to the Land of Limited Time.” Behind him the world arrives in layers: a row of sagging trailers, a lake holding the reflection of a broken mast, trees under a flat stain of smoke. Last comes the castle, tall enough to see over the roofs. Every addition to it has been made while the roofs below went without repair.",
    "“Lady Supine keeps our time. Beyond her castle lies the Land of Infinite Time. The entrance costs more minutes than any person has.” He wipes condensation from the counter. “That is the arrangement.” A loudspeaker repeats the welcome in a woman's voice. The keeper's lips follow it without making a sound.",
  ], [
    { label: "“We still wish to enter.”", next: "gate_wish" },
    { label: "“Who decided how much we have?”", next: "gatekeeper_why" },
  ]),
  scene("gate_denied", "entrance", "The Gatekeeper", "A refusal entered in the book", [
    "The stamp lands hard enough to make you flinch. Its mark bleeds through the refusal and onto the keeper's hand. The smaller door beside the great gate opens on a passage made from leftover roofing. Somebody has put a bucket under the largest leak.",
    "“You have been refused entry through the entrance. You may proceed through the exit. A different department.” He looks toward the nearest listening pole before lowering his voice. “The Shanty Hours are ahead. There are people there who will let you sit down.” He does not promise food or shelter. Those are things he has no right to promise anybody.",
  ], [
    { label: "Go through the little exit to the Shanty Hours", next: "shanty_arrival" },
    { label: "“Does everyone have to do this?”", next: "gatekeeper_why" },
  ]),
  scene("gatekeeper_why", "entrance", "The Gatekeeper", "The job his father could not leave", [
    "“Some people are born on the correct side of a door.” His hands stop turning the pages. From the pocket of the unused uniform, a brittle envelope protrudes. It has the same surname as the name plate on his desk.",
    "“There was a time when this was only a gate. Then someone asked whether entering had been approved. My grandfather was hired to answer. I inherited the answer.” He has never seen the country beyond the far entrance. He points toward the Library. “They may still have your record. A person without a record can be removed without anything going missing on paper.”",
  ], [
    { label: "Return to the application", next: "gate_wish", requires: "!entrance_denied" },
    { label: "Visit the people beyond the little door", next: "shanty_arrival", requires: "entrance_denied" },
    { label: "“What happens to people out of time?”", next: "gatekeeper_hospital" },
  ]),
  scene("gatekeeper_hospital", "entrance", "The Gatekeeper", "Speaking beneath the announcement", [
    "“The Hospital receives them. Their bodies continue, but their next moment has been confiscated. They lie there until someone can lend it back.” He studies the clock instead of your face. The Hospital's white delivery cart comes through his gate every morning. He knows the wheel that squeaks before he sees it.",
    "A bat-shaped shadow passes over the booth. “Timelessness is a crime in the Land of Limited Time. Be careful with the word.” He pulls the ledger closer. “Besides, this place is FAR better than the Land of Restricted Freedom.” The final sentence has been printed above his chair. The paper underneath it is a different colour from the wall.",
  ], [
    { label: "“Then I had better become officially refused.”", next: "gate_wish", requires: "!entrance_denied" },
    { label: "Leave him to his clock", next: "shanty_arrival", requires: "entrance_denied" },
  ]),
  scene("entrance_return", "entrance", "The Gatekeeper", "Nothing here has been repaired", [
    "The big gate is closed. The little door is open. Water runs down both. Inside the booth, the keeper has moved his chair to avoid a fresh stain on the ceiling; the old stain is still outlined in pencil beneath it. A row of refusal forms dries against the heater.",
    "Above the ironwork, the billboard Lady blows a painted kiss: BE YOURSELF. BE DIVINE. Her paper face has split along its fold, exposing the advertisement that came before her. The new notice asks citizens to suspend personal expression during periods of high demand. The keeper remembers you. He offers no greeting loud enough to enter the record.",
  ], [
    { label: "“We wish to enter.”", next: "gate_wish", requires: "!entrance_denied" },
    { label: "Talk about his grandfather", next: "gatekeeper_why" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival", requires: "entrance_denied" },
    { label: "Approach the far entrance", next: "infinite_arrival", requires: "ada_restored" },
  ]),

  scene("shanty_arrival", "shanty", "The Shanty Hours", "The trailers that were meant to be temporary", [
    "The homes stand on wheels that have sunk into the earth. Extra rooms are made from packing boards, doors removed from other homes, and signs turned inward. Power comes along a cable spliced so many times that it hangs in knots. Every rain moves the buckets. Every winter someone loses a room they could not keep warm.",
    "Under a torn awning, a moth tends a blackened kettle. An ox braces a bench with two pieces of unmatched timber. A hare repairs a watch beneath a bulb that keeps dimming. They each look at your pocket before your face, ashamed to be doing it. Then the ox clears a place for you to sit.",
  ], [
    { label: "Sit beside the moth's kettle", next: "pip_hello" },
    { label: "Help the ox with his bench", next: "brindle_hello" },
    { label: "Meet the hare who repairs watches", next: "ada_hello" },
    { label: "Visit the coupon counter", next: "coupon_counter", requires: "papers_obtained" },
    { label: "Follow the whispers under the awning", next: "town_whispers" },
    { label: "Visit the Library of Time Well Spent", next: "library_arrival" },
    { label: "Gather your friends before the last journey", next: "friends_arrival", requires: "ada_restored" },
  ]),
  scene("pip_hello", "shanty", "Pip", "A moth keeping his mother's kettle going", [
    "“I'm Pip. The kettle was my mother's. Everything in here that works belonged to somebody who stopped needing it.” His wings are smoke-stained along the edges. He chooses the cup with the smaller crack and turns the chipped side away from your mouth. There is barely enough water for two.",
    "He has written a poem on the back of a ration refusal. “She used to sing this while the roof leaked. I know most of it. I can't remember the part that made her stop sounding afraid.” He places the page between you. Outside, the listening wire clicks against the awning. Pip keeps one hand over the name on the refusal.",
  ], [
    { label: "Introduce yourself and read Pip's poem", next: "pip_rhyme", effects: [{ flag: "pip_friend" }] },
    { label: "“Why do you write?”", next: "pip_remembers", effects: [{ flag: "pip_friend" }] },
    { label: "Thank Pip for the tea", next: "shanty_arrival", effects: [{ flag: "pip_friend" }] },
  ]),
  scene("pip_rhyme", "shanty", "Pip", "Trying to remember a voice accurately", [
    "“Lady Supine / Will grant us time / When we feed her / Curly willow.” Pip reads without singing. Those lines are printed on ration envelopes now. They have been copied so often that the paper seems to remember them better than he does.",
    "“The next part was hers. My mother's, I mean. The Lady never finishes a rhyme unless somebody finishes it for her.” He smooths the page with a damaged wing. There is a pause where his mother used to breathe. A distant Aristobat turns one ear toward the awning. Pip lowers his voice again, and the missing words become harder to hear.",
  ], [
    { label: "Finish the willow rhyme with Pip", puzzle: "rhyme", next: "pip_remembers", requires: "!willow_rhyme", effects: [{ flag: "willow_rhyme", addItem: "willow_verse" }, { flag: "pip_friend" }] },
    { label: "Ask what Pip remembers of the Lady", next: "pip_remembers" },
    { label: "Let the poem wait a moment", next: "shanty_arrival" },
  ]),
  scene("pip_remembers", "shanty", "Pip", "Keeping the words after the singer is gone", [
    "“For we all wish to see / The best we can be / Before our heads / Hit the pillow.” Pip says each line as carefully as a name. “She sang that when she had less time than she let us know. I thought it meant we'd wake up better. I didn't understand how small a thing she was asking for.”",
    "He draws a moth in the margin, then rubs away one wing. “Willow grows beyond the smoke, where they stopped clearing the drainage ditch. A cutting from the lake might get us there.” He folds the poem. You cannot tell whether he believes in the promise or simply cannot bear to leave his mother's song unfinished.",
  ], [
    { label: "Work on the unfinished verse", next: "pip_rhyme", requires: "!willow_rhyme" },
    { label: "“I'll remember the ending.”", next: "shanty_arrival" },
    { label: "Go to the Lake of Tasteful Scarcity", next: "lake_arrival" },
  ]),
  scene("brindle_hello", "shanty", "Brindle", "A porter wearing out slowly", [
    "Brindle's work harness has rubbed two bald stripes through his coat. His horns are capped with cloth so they will not catch the washing. He lowers the bench leg carefully, although his hands shake when he lets go. An invoice tucked into his sleeve lists the minutes lost to yesterday's lifting injury.",
    "“They made me a porter because I look like one. They charge me when I can't carry enough.” He looks at the bench instead of you. “My father made this seat. The wood he chose is gone now. I keep replacing pieces.” He moves his tools aside. For a moment, sitting down feels like accepting something he could scarcely afford to give.",
  ], [
    { label: "Help Brindle fit the last bench leg", next: "brindle_kindness", requires: "!brindle_helped", effects: [{ flag: "brindle_friend" }] },
    { label: "“What do you do when you aren't carrying things?”", next: "brindle_kindness", effects: [{ flag: "brindle_friend" }] },
    { label: "Take the seat he offers", next: "shanty_arrival", effects: [{ flag: "brindle_friend" }] },
  ]),
  scene("brindle_kindness", "shanty", "Brindle", "Hands that hurt even when they are empty", [
    "“I make small things when my hands still work.” He takes a wooden bird from his coat. Its wings move unevenly when he breathes over it. He has carved it from the only smooth piece of the broken bench. The rest became kindling last winter.",
    "There are five minutes in a pocket marked FOR NICE THINGS. He offers them to you before you can tell him what you did was small. “It wasn't small to me.” Then he hums a tune with the last note missing. His mother used to leave it there while he fell asleep. Now he sings it when the pain keeps him awake and the house has nobody else in it.",
  ], [
    { label: "Accept his kindness and remember the tune", next: "shanty_arrival", requires: "!brindle_helped", effects: [{ flag: "brindle_helped", time: 5, addItem: "lullaby" }] },
    { label: "“Your bird is beautiful.”", next: "shanty_arrival", requires: "brindle_helped" },
    { label: "Return to the bench", next: "shanty_arrival" },
  ]),
  scene("ada_hello", "shanty", "Ada", "Clockmender on a failing supply", [
    "Ada works beneath a bulb fed by wire pushed through the trailer wall. Two buckets stand beneath it. The watch on her bench has a polished casing and a cracked glass; she has wrapped the damaged spring in a strip of gauze. Her long ears turn toward every sound that might belong to an inspector.",
    "“I'm Ada. If your clock is wrong, I can sometimes make it wrong in your favour.” She studies your face, then looks away. “No fur, feathers, scales, or horns. Just like her. They'll notice.” She says it as a warning. You are already conspicuous in a place where survival often means passing without being counted twice.",
  ], [
    { label: "“I'd rather help you explain the watch.”", next: "ada_clock", effects: [{ flag: "ada_friend" }] },
    { label: "“Why do they take people's time?”", next: "ada_clock", effects: [{ flag: "ada_friend" }] },
    { label: "Promise to come back", next: "shanty_arrival", effects: [{ flag: "ada_friend" }] },
  ]),
  scene("ada_clock", "shanty", "Ada", "Working on what the dial conceals", [
    "Ada pries the watch open. Where the gears should be is a narrow roll of figures. The entries include meals, injury, rest, and the time its owner spent grieving. “It isn't running away,” she says. “They're removing it. Every charge has an address.” She has made copies under the lining of her coat.",
    "She traces the Aristobats' routes across a map of patched roads. The minutes go to the castle, except on casino nights, when they pass through an unlisted room. “There's a machine in there. The God Switch. It changes a mind by moving the brain.” She closes the watch as a large shadow reaches the window. Neither of you breathes until it passes.",
  ], [
    { label: "Keep Ada's notes safe", next: "shanty_arrival", requires: "!ledger_received", effects: [{ flag: "ledger_received", addItem: "secret_ledger" }] },
    { label: "“I'll come to you if I find the machine.”", next: "shanty_arrival", requires: "ledger_received" },
    { label: "Ask the Library about time accounts", next: "library_arrival" },
  ]),
  scene("town_whispers", "shanty", "Mrs. Thimble", "Laundry raised against the listening poles", [
    "“Don't say stolen. Say appropriately reassigned. The Aristobats have excellent hearing.” Mrs. Thimble pins up a sheet with old repair marks over newer ones. Behind it, a family is trying to eat without showing the portions. She has been hanging this shield for them every afternoon.",
    "“Her ladyship calls us animals.” She pulls the fabric tight. “My daughter used to hate that. She would answer back. She's in the Hospital now.” An ear-shaped shadow crosses the cloth. Mrs. Thimble raises her voice. “BE YOURSELF. BE DIVINE.” Then she bends to retrieve a fallen peg and stays bent until the shadow leaves. There are some words she has learned to survive saying.",
  ], [
    { label: "Help hang the last sheet, shielding the awning", next: "shanty_arrival", requires: "!laundry_helped", effects: [{ flag: "laundry_helped", time: 3 }] },
    { label: "“What are the Aristobats listening for?”", next: "casino_ledger", requires: "banished" },
    { label: "Thank her in a perfectly legal whisper", next: "shanty_arrival" },
  ]),
  scene("coupon_counter", "shanty", "Huckster", "Required to sell the same shortage", [
    "Huckster operates from a hatch cut into a trailer whose original door no longer opens. The counter has been polished where people grip it. “Documentary personhood, please.” His smile appears when the listening light comes on. It falls away while he searches the drawer for paper Ladies.",
    "Their printed lips move above figures too small to read without leaning close. Five coupons must be balanced before one can be redeemed. Four disappear as validation costs. “You receive the stated twelve minutes,” he says. “Once the process is complete.” The people in line behind you have already spent much of that amount waiting. Nobody leaves. Leaving would make what they have spent entirely lost.",
  ], [
    { label: "Sort the time coupons", puzzle: "coupons", next: "coupon_sorted", requires: "!coupon_validated", item: "identity_papers", effects: [{ flag: "coupon_validated", addItem: "valid_coupon", unlock: "fields" }] },
    { label: "“Do the coupons cost anything?”", next: "coupon_sorted", requires: "coupon_validated" },
    { label: "Return to the awning", next: "shanty_arrival" },
  ]),
  scene("coupon_sorted", "shanty", "Huckster", "Briefly speaking without the light", [
    "Five paper faces agree to the account. Four are taken into the counter mechanism and shredded. The fifth remains in your hand, its mouth still making a kiss. It promises twelve minutes. Someone has stamped VALID over one eye hard enough to emboss the paper beneath it.",
    "“They cost the time you spend proving you deserve them,” Huckster says when the listening light goes dark. Under the counter is a photograph of a person you have not seen in the settlement. He covers it when you notice. “The Fields accepts the validated slip. Keep it dry. They won't recognise water damage.” The roof above his own stock has begun to leak.",
  ], [
    { label: "Let the kiss become twelve minutes", next: "shanty_arrival", item: "valid_coupon", effects: [{ removeItem: "valid_coupon", time: 12 }] },
    { label: "Visit the Fields of Egregious Abundance", next: "fields_arrival" },
    { label: "Return to your friends", next: "shanty_arrival" },
  ]),

  scene("library_arrival", "library", "The Library", "Books kept above the last flood line", [
    "The Library occupies several trailers joined by corridors of corrugated sheet. Every section has settled to a different height. The shelves rest on bricks above the water marks, and the lowest books have gone soft enough to sag between their boards. Reading time is printed on the spine. The longest volumes are covered in undisturbed dust.",
    "Above the desk: TIME WELL SPENT IS TIME SPENT AS INSTRUCTED. Somebody once added perhaps. The word has been scraped away, leaving the paper thin. A fox with spectacles chained to the counter looks up. “An arrival. Do you have evidence that the entrance refused you?” He glances at the chain before asking anything else.",
  ], [
    { label: "Show your certified refusal", next: "library_clerk", item: "refusal", requires: "!papers_obtained" },
    { label: "Look through the margins", next: "library_margin" },
    { label: "Read the history of Lady Supine", next: "library_record", requires: "papers_obtained" },
    { label: "Ask about your identity record", next: "library_identity", requires: "papers_obtained" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),
  scene("library_clerk", "library", "Archivist Vellum", "A fox held responsible for missing papers", [
    "“A refusal establishes that you existed long enough to be inconvenient.” Vellum removes a form from PERSONS, THEORETICAL. His tail is caught beneath one leg of the stool. He does not lift it until the overhead camera has turned. The forms underneath yours carry names marked by the same diagonal cancellation.",
    "“Your personhood is in the catalogue. The history has been rearranged again. Different committees require different causes.” He sets out the records. Some pages were cut from older books with a kitchen knife. “Put them in the order they happened. If we can establish a sequence, I can enter you as a person. Until then you're an unidentified expenditure.”",
  ], [
    { label: "Put the catalogue in order", puzzle: "catalog", next: "library_cataloged", requires: "!catalog_solved", effects: [{ flag: "catalog_solved", time: -3 }] },
    { label: "Study the notes in the margins first", next: "library_margin" },
    { label: "Take a breath outside", next: "shanty_arrival" },
  ]),
  scene("library_cataloged", "library", "Archivist Vellum", "Finding the page that has not yet been cancelled", [
    "The folder contains your face. The name field is empty, but the classification boxes have already been ticked. Human. Unallocated. Liable. Vellum removes the classification sheet while pretending to straighten the file. “They won't let me erase the boxes. Sometimes I can lose a page.” He places it beneath his blotter.",
    "A torn edge catches against the remaining paper. Through it you can make out an older statement: A PERSON IS MORE THAN THE WORK THEY PERFORM. Someone has tried to blacken it, but the ink did not take. Vellum sees you reading. His paw rests over the camera's view of the folder until you finish.",
  ], [
    { label: "“I would like to be a person.”", next: "library_identity", effects: [{ flag: "papers_obtained", addItem: "identity_papers", unlock: "forest", act: 2 }] },
    { label: "“Who removed the other page?”", next: "library_record" },
  ]),
  scene("library_identity", "library", "Archivist Vellum", "A signature offered under the camera", [
    "“Granted. Provisionally.” Vellum signs with a pen he keeps inside his sleeve. The papers leave room for your name, but none for an address that could accurately describe where people live here. He folds the corners inward before handing them to you. It keeps them from catching on the places the laminate has peeled.",
    "“The lake can lend you a line. The willow path is beyond the smoke. After the Fields comes the Museum. Speak to Lady Supine, for she is the Keeper of Limited Time.” He pauses at the signature. “If they take these from you, remember which name you wrote. They may ask you to agree it never belonged to anybody.”",
  ], [
    { label: "Look for a cutting at the lake", next: "lake_arrival" },
    { label: "Ask Pip about the willow song", next: "pip_rhyme" },
    { label: "Read the Lady's history", next: "library_record" },
    { label: "Thank Vellum and leave", next: "shanty_arrival" },
  ]),
  scene("library_record", "library", "A book with an unfinished spine", "A past revised until it will support the present", [
    "The earliest portrait shows a human woman with an unusually large head standing beside an ordinary doorway. Its caption reads SHE HAD TIME FOR EVERYONE. The top of her head has been concealed by a pasted strip. Under the strip, a pencilled circle marks an opening. The next page is painted so heavily that it barely bends.",
    "Later pictures show gates, counters, screens, and the woman held upright among them. A note in old ink reads: She feared being ordinary. We assured her she was unique. She asked for a machine that could ensure it. The final page repeats DIVINE until the nib pierced the paper. On the back, somebody kept an account of the first confiscated hours.",
  ], [
    { label: "Remember the woman beside the ordinary door", next: "library_arrival", requires: "!history_read", effects: [{ flag: "history_read" }] },
    { label: "Return the book carefully", next: "library_arrival", requires: "history_read" },
    { label: "Return to your identity papers", next: "library_cataloged", requires: "!papers_obtained" },
  ]),
  scene("library_margin", "library", "The readers who came before", "The surviving record of unapproved days", [
    "In a book about wasted time, somebody has written my daughter laughed here. The answering hand reads then it was not wasted. Both writers' records have been struck out in the catalogue. Beneath the chapter on rest is the outline of a pillow, faint from years of fingers tracing it while the Library camera faced another aisle.",
    "A return slip holds four minutes assigned to A FUTURE STRANGER. Vellum watches you find it. “The account hasn't been claimed,” he says. “It would normally be reassigned.” He turns the ledger face down. The credit is small. Its owner left it after returning the last book they had time to read. No date tells you how long they expected it to wait.",
  ], [
    { label: "Accept the future stranger's four minutes", next: "library_arrival", requires: "!margin_time", effects: [{ flag: "margin_time", time: 4 }] },
    { label: "Add a small thank-you beside the pillow", next: "library_arrival", requires: "margin_time" },
    { label: "Return to the desk", next: "library_arrival" },
  ]),

  scene("lake_arrival", "lake", "Lake of Tasteful Scarcity", "The water has had six official names", [
    "The lake lies below the trailers' drainage channels. Brown foam collects under the jetty; farther out, the water is still clear enough to hold the tree line. APPROPRIATE RESOURCE DENSITY has been painted across a sign once used for swimming warnings. An otter has scratched through appropriate until the timber split.",
    "A pole rests beside a tin with six approved bait pieces. Across the water, willow shadows curl toward the smoking forest. Something pale catches in the ripples near them. You cannot tell whether it is a fish or another discarded label until it moves against the current. The jetty bends beneath you. Two boards have already been replaced with cupboard doors.",
  ], [
    { label: "Speak to the otter on the jetty", next: "lake_fisher" },
    { label: "Catch three fish for the kitchen; look for a willow cutting", puzzle: "fishing", next: "lake_caught", requires: "!willow_cutting_found", item: "identity_papers", effects: [{ flag: "willow_cutting_found", addItem: "willow_cutting", time: -3 }] },
    { label: "Sit quietly beside the water", next: "lake_empty" },
    { label: "Take the cutting into Cigarillo Forest", next: "forest_arrival", requires: "willow_cutting_found" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),
  scene("lake_fisher", "lake", "Mallow", "An otter feeding a kitchen from a shrinking catch", [
    "Mallow sits with the fishing line wrapped around a finger stiff from cold. “Three for the kitchen. That's what we've promised.” Behind her is a pail with an old flour label. It contains enough water to keep a catch alive, but nothing has gone into it today.",
    "“The willow cutting catches in the same ripples. Don't pull until you know what the hook has.” She offers half a sandwich, looking at it only after she has broken it. “They say scarcity makes things precious. I think it makes us do things we're ashamed to remember.” She puts her own half back in the paper. You do not see her eat it.",
  ], [
    { label: "Try the fishing line", next: "lake_arrival" },
    { label: "Share the sandwich and watch the ripples", next: "lake_empty" },
    { label: "“You seem to know quite a lot.”", next: "lake_arrival", requires: "!mallow_heard", effects: [{ flag: "mallow_heard", time: 2 }] },
  ]),
  scene("lake_caught", "lake", "The willow cutting", "A living branch among what the water carries", [
    "Three fish go into Mallow's pail. She counts them twice, then covers the pail so the people crossing the jetty will not count for her. Around the last hook is a willow cutting. The leaves are green where the water has kept them from the smoke. One has been bitten almost through.",
    "Mallow finds a damp cloth under her coat. “Keep the root end wet. Everything dries out before it gets where it's needed.” The cutting bends toward Cigarillo Forest. The castle's reflection breaks around it. You wrap it carefully, and Mallow returns to the empty line. Three fish will make the kitchen's soup thinner than anybody will say aloud.",
  ], [
    { label: "Carry it toward Cigarillo Forest", next: "forest_arrival" },
    { label: "Show Pip what you found", next: "pip_rhyme" },
    { label: "Linger beside the lake", next: "lake_empty" },
  ]),
  scene("lake_empty", "lake", "The water", "A pause nobody has authorised", [
    "For a while, nothing asks you to act. The float holds still. In the distance, an Aristobat circles a house whose listening pole has gone quiet. You can hear someone moving a bucket inside the nearest trailer, then the slow spill as they empty it. Even here the silence has other people's labour in it.",
    "“I used to come to catch things,” Mallow says. “Now sometimes I come because I can't look at the empty pail indoors.” She leaves her line in the water. The far bank is almost beautiful through the mist. You remain together without finding a useful thing to say, and neither of you asks the other to leave.",
  ], [
    { label: "Leave the moment intact", next: "lake_arrival" },
    { label: "Take its quiet back to your friends", next: "shanty_arrival" },
  ]),

  scene("forest_arrival", "forest", "Cigarillo Forest", "Smoke held between tired trees", [
    "The trees are slender and pale. Small embers glow where branches should spread, and ash falls over the path even when there is no wind. Drainage pipes emerge between the roots and end in blackened pools. Beyond them, the forest is still a forest: trunks bent away from shade, new leaves struggling through old damage.",
    "An ash-grey deer waits beside three paths. The hem of her coat is wet. “The forest is on its break. The break is not to be interrupted.” She says it toward the listening post, then notices your cutting. Her eyes remain on its leaves. “You found something alive. Keep it covered until we're away from the road.”",
  ], [
    { label: "Ask the deer for the willow path", next: "forest_path", requires: "!willow_gathered" },
    { label: "Visit the willow again", next: "forest_willow", requires: "willow_gathered" },
    { label: "Read the names carved into the stumps", next: "forest_stumps" },
    { label: "Return to the lake", next: "lake_arrival" },
    { label: "Take the forest road to the Fields", next: "fields_arrival", requires: "coupon_validated" },
  ]),
  scene("forest_path", "forest", "Cinder", "A deer who has stayed after everyone else", [
    "“The signs point toward whatever the castle needed yesterday.” Cinder shows you where one has been nailed over another. The lower sign still names a workers' shelter. Nothing is left of it except bricks and a stove without a door. “Follow the willow. Its roots knew this ground before the routes were approved.”",
    "Pip's verse carries a path made of small symbols. Smoke keeps obscuring them. Cinder holds the cutting as it curls toward a gap between the trunks. Around the gap, discarded billboards repeat BE DIVINE in letters the rain has thinned. “Finish the song,” she says. “They used to sing it when they planted. It may remember where the singing came from.”",
  ], [
    { label: "Follow the willow through the shifting paths", puzzle: "forest", next: "forest_willow", requires: "willow_rhyme", item: "willow_cutting", effects: [{ flag: "willow_gathered", removeItem: "willow_cutting", addItem: "curly_willow", unlock: "fields", time: -4 }] },
    { label: "Return to Pip for the unfinished rhyme", next: "pip_rhyme", requires: "!willow_rhyme" },
    { label: "Look for a cutting in the lake", next: "lake_arrival", requires: "!willow_cutting_found" },
    { label: "Rest beside the paths", next: "forest_stumps" },
  ]),
  scene("forest_willow", "forest", "The curly willow", "The tree beyond the drainage ditch", [
    "The willow stands where the smoke sinks below its branches. It has no ember. Rusted hooks remain in the bark where a billboard was fixed, and the branch has grown around each one. Water collects at its roots, dark from the road. Young leaves hang above it untouched. You have seen little here that has not been made to justify growing.",
    "You plant the rescued cutting in a patch of softer ground. The tree bends and lets a loose branch fall into your hands. On the bark, scratched beneath an old mounting plate: SHE ONLY FINISHES A RHYME WHEN SOMEONE FINISHES IT FOR HER. Somebody carried that sentence farther than the notices were meant to reach.",
  ], [
    { label: "Carry the branch toward the Lady's museum", next: "fields_arrival" },
    { label: "Read what remains of the forest's old signs", next: "forest_stumps" },
    { label: "Tell your friends the tree is still alive", next: "shanty_arrival" },
  ]),
  scene("forest_stumps", "forest", "Cinder", "Keeping the names the payroll lost", [
    "The stumps bear names instead of numbers. Some have been cut again through the lettering. Cinder kneels to clear ash from one. “They took their permitted rest here. When they couldn't get back up, the Hospital cart came.” The transport charges were deducted from the time their families raised to bring them home.",
    "“We kept their names. That's all we managed.” She traces a ring beneath the oldest carving. They call this wasted land now. An application to clear it hangs beside the road with no space for objections. Between the trunks is a narrow strip of ordinary sky. Cinder watches it until another band of smoke closes over.",
  ], [
    { label: "Clear fallen ash from the names", next: "forest_arrival", requires: "!forest_names", effects: [{ flag: "forest_names", time: 3 }] },
    { label: "Let the forest keep its break", next: "forest_arrival", requires: "forest_names" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),

  scene("fields_arrival", "fields", "The Fields of Egregious Abundance", "The fence between hunger and harvest", [
    "Fruit trees sag beyond the wire. Grain grows where harvest carts spilled it, then rots because nobody is permitted to gather from the road. A worker sweeps fallen food into a sealed bin. Each pear makes a soft sound when it lands. From the trailers behind you, breakfast smoke rises without the smell of anything cooking.",
    "At a permit window, a mole raises a stamp. “You may observe abundance. Participation is a separate category.” His booth is a caravan on blocks; its windows have been replaced with perspex. Beyond it stands the Museum, a heavy reclining shape built over the only stone shelter that used to belong to the field workers.",
  ], [
    { label: "Apply to cross the Fields", next: "fields_permit", requires: "!fields_permit" },
    { label: "Walk among the harvests", next: "fields_abundance", requires: "fields_permit" },
    { label: "Continue to the Museum of the Supine", next: "museum_arrival", requires: "fields_permit" },
    { label: "Find a valid coupon in the Shanty Hours", next: "coupon_counter", requires: "!coupon_validated" },
    { label: "Return to Cigarillo Forest", next: "forest_arrival" },
  ]),
  scene("fields_permit", "fields", "Permit Officer Burrow", "Required to record the appropriate hunger", [
    "“Name. Species. Intended amount of wonder.” Burrow checks your papers beside a mug half full of cold water. There is no food in the booth. “Species unresolved. Supplementary form.” He apologises for the extra sheet while making certain the microphone cannot hear the apology.",
    "The permit asks what you are, what you will gather, and what amount would be appropriate. Fallen willow is allowed; living wood is not. The stamp supplies the request before you answer. Burrow slides the inkpad nearer. “I can wait while you find the right category.” Behind him, handwritten corrections cover older corrections. Each one cost somebody the time required to come back.",
  ], [
    { label: "Resolve the abundance permit", puzzle: "permit", next: "fields_permission", requires: "coupon_validated", item: "identity_papers", effects: [{ flag: "fields_permit", addItem: "field_permit", unlock: "museum", time: -2 }] },
    { label: "“Where do I find a validated coupon?”", next: "coupon_counter", requires: "!coupon_validated" },
    { label: "Step away from the window", next: "fields_arrival" },
  ]),
  scene("fields_permission", "fields", "Permit Officer Burrow", "A gate opened within somebody else's rules", [
    "The stamp lands. Burrow waits for its mark to dry so you cannot be sent back for a smudge. “You are officially allowed to see how much there is.” His lunch is a bruised apple cut into thin wedges. Two wedges have been wrapped separately and labelled with names.",
    "“They call wanting less a virtue,” he says, watching the listening light. “That's easy enough to say from the other side of a fence.” He presses a fallen pear into your hand. “It was damaged in transit. No usable value.” There is no damage on the fruit. He opens the gate, then makes the required note that no supplies passed through it.",
  ], [
    { label: "Walk toward the Museum", next: "museum_arrival" },
    { label: "Look at what grows beyond the fence", next: "fields_abundance" },
  ]),
  scene("fields_abundance", "fields", "An uncounted pear tree", "Food grown for the locked storehouse", [
    "The fruit is so heavy that workers prop up the branches with lengths of discarded pipe. A boar gardener carries fallen pears to a storehouse marked STRATEGIC WANT. Through the cracked door, you see last season's crates underneath this season's. The lower ones have begun to collapse. The smell is sweeter than anything people can buy outside the fence.",
    "“I grow it. Someone else decides what they're frightened of us having.” She does not raise her eyes as she speaks. You steady the branch while she wedges another support beneath it. The pear Burrow gave you has juice enough to run down your wrist. You wipe it away before the gardener sees how much was wasted.",
  ], [
    { label: "Help the gardener prop the heavy branch", next: "fields_arrival", requires: "!gardener_helped", effects: [{ flag: "gardener_helped", time: 5 }] },
    { label: "Remember what you have seen", next: "museum_arrival" },
    { label: "Return toward the forest", next: "forest_arrival" },
  ]),

  scene("museum_arrival", "museum", "Museum of the Supine", "Divinity over the old workers' shelter", [
    "The Museum resembles a reclining woman from the road. Up close, its body is scaffolding covered in patched plaster, with rainwater trapped beneath the paint. You enter under a wrist so large it blocks the workers' shelter's original doorway. The ticket booth is built from that doorway's glass.",
    "Inside, Channel 9 blooms on a telescreen with rounded corners. EXPERIENCE THE DIVINE. Lady Supine's real human face appears beneath a head much larger than the shoulders supporting it. The top is cut off by the camera frame. Her room has been dressed in velvet to hide the wires. One strip has fallen, and a servant's hand keeps trying to pin it back unseen.",
  ], [
    { label: "Answer the voice on Channel 9", next: "supine_telescreen", requires: "willow_gathered" },
    { label: "Find the curly willow named in the Museum's inscription", next: "forest_arrival", requires: "!willow_gathered" },
    { label: "Present your complimentary tickets", next: "museum_blocks", requires: "art_tickets_received" },
    { label: "Return to the galleries", next: "museum_gallery", requires: "blocks_pleased" },
    { label: "Speak to the Lady about what you saw", next: "supine_wish", requires: "art_understood" },
    { label: "Find the Hospital after your banishment", next: "hospital_arrival", requires: "banished" },
    { label: "Read the critics in the vestibule", next: "museum_critics" },
  ]),
  scene("supine_telescreen", "museum", "Lady Supine", "The woman whose signature takes the minutes", [
    "“Oh. An audience with a face.” Her voice is softer than the broadcasts, but no less certain of being obeyed. “Why would I want to interact with THEM? They're all the same—endlessly boring me with their working, gorging, and chuffing. No humanity in them at all. Animals, to put it simply. Just oxen pulling wagons. They wouldn't know real art if it shot them in the face.”",
    "The camera pulls back to show the weight of her enormous head. A cable disappears behind it. “You like art, don't you? You must seek out my art. Tickets. On me. Or perhaps me on, since my face is on them.” A servant inserts the paper from below the frame. Supine does not look at the hand.",
  ], [
    { label: "“I would like to see your art.”", next: "museum_blocks", requires: "!art_tickets_received", effects: [{ flag: "art_tickets_received", addItem: "art_tickets", act: 3 }] },
    { label: "“Brindle makes beautiful little birds.”", next: "supine_answer" },
    { label: "Let the screen continue smiling", next: "museum_arrival" },
  ]),
  scene("supine_answer", "museum", "Lady Supine", "A generous account of what she has taken", [
    "“How industrious. I adore a useful creature.” She turns toward a second camera, dragging the great weight of her head slowly across the pillow behind her chair. Every movement makes a small bell ring. A man outside the frame takes note of the bells.",
    "“They begged me for the casino and television. I was perfectly happy without them. Everything here is something I have given someone.” Through the screen you can see a tally of requests beside her. Every request is stamped RECEIVED, not GRANTED. “Come and look at what I made.” The picture brightens before she smiles, washing out the marks beneath her eyes. “Be Yourself. Be Divine.”",
  ], [
    { label: "Accept the invitation", next: "museum_blocks", requires: "!art_tickets_received", effects: [{ flag: "art_tickets_received", addItem: "art_tickets", act: 3 }] },
    { label: "Visit the galleries again", next: "museum_gallery", requires: "blocks_pleased" },
    { label: "Step away from the screen", next: "museum_arrival" },
  ]),
  scene("museum_blocks", "museum", "The Curator", "An arrangement supervised until it complies", [
    "“Stack these blocks in a manner that pleases me.” The Curator repeats her recorded instruction beside the plinth. His peacock feathers have been trimmed to fit the regulation coat. The blocks bear earth, bark, leaf, and sun. Their paint has been rubbed off where previous visitors tried to make something the door would recognise.",
    "A bronze Supine stands beside them with an oversized head and an opening at its crown, copied from the living woman. Her mouth is held apart for willow. Beneath it, the rhyme is scratched into a plaque. A line runs from the statue to a cupboard of time valves. This is an offering machine, and the machine has kept every offering it was given.",
  ], [
    { label: "Feed curly willow to the bronze mouth", next: "museum_blocks", item: "curly_willow", requires: "!supine_fed", effects: [{ removeItem: "curly_willow", flag: "supine_fed", time: 18 }] },
    { label: "Arrange the earth, bark, leaf, and sun", puzzle: "blocks", next: "museum_stacked", requires: "!blocks_pleased", item: "art_tickets", effects: [{ flag: "blocks_pleased", time: -3 }] },
    { label: "Enter the galleries", next: "museum_gallery", requires: "blocks_pleased" },
    { label: "Read the critics while you think", next: "museum_critics" },
  ]),
  scene("museum_stacked", "museum", "The Curator", "The door records an approved result", [
    "Earth supports bark. Bark carries leaves toward the sun. When the last piece settles, a root carved into the plinth seems to continue the line. The door's catch releases with a worn metallic sound. It is a small arrangement, but you understand why somebody might once have wanted to make it.",
    "The Curator bends close. “It looks as though something could grow.” He says it before noticing the screen. APPROVED appears in white letters. He straightens and repeats the approved description. Beyond the arch hang three paintings on walls whose plaster has been saved while plaster fell from the houses outside. You carry your own first impression through before the caption can replace it.",
  ], [
    { label: "Enter the three galleries", next: "museum_gallery" },
    { label: "Visit the willow offering before you go", next: "museum_blocks", requires: "!supine_fed" },
  ]),
  scene("museum_gallery", "museum", "Three works by Lady Supine", "Nothing displayed here may be owned by its viewer", [
    "THE EXCEPTION shows a white chair among thousands of empty shoes. THE GIFT shows a swollen hand pouring sand into cups with no bottoms. THE REST shows a woman lying beneath dozens of open eyes. Her head is larger than the pillow and dark at its open crown. The varnish catches the room's single bulb, making every painted eye seem wet.",
    "The captions praise uniqueness, generosity, and a ruler's burden. Each has been repainted where words were changed. Under the varnish, older lines survive. You remember Brindle's wooden bird, made from a piece of wood too small to burn usefully. There is nowhere in the catalogue for an object that asks so little from its audience.",
  ], [
    { label: "Look beneath the official captions", puzzle: "artwork", next: "museum_interpretation", requires: "!art_understood", effects: [{ flag: "art_understood", time: -4 }] },
    { label: "Read your interpretation again", next: "museum_interpretation", requires: "art_understood" },
    { label: "Hear what the critics say", next: "museum_critics" },
    { label: "Return to the entrance hall", next: "museum_arrival" },
  ]),
  scene("museum_interpretation", "museum", "The paintings", "The parts no caption has made obedient", [
    "The shoes are people whose absence has been arranged around the chair. The cups will never fill, however much is poured. The woman in THE REST cannot close her eyes because she believes the others must remain open. Under the painted opening in her large head is a pale curl of exposed brain. Nothing in the official description names it.",
    "There is something worth seeing in these pictures, and it has not excused their maker. Fear is visible alongside the money and labour she spent concealing it. You think of the old doorway portrait. It is difficult to recognise an ordinary person in the woman who ordered so many ordinary lives made smaller for her room.",
  ], [
    { label: "Find the artist behind the pictures", next: "museum_artist" },
    { label: "Bring the Lady an honest compliment", next: "supine_wish" },
    { label: "Stay with the paintings a little longer", next: "museum_gallery" },
  ]),
  scene("museum_artist", "museum", "The Curator", "Preserving the evidence of a frightened hand", [
    "“She repainted THE REST forty-one times.” The Curator speaks beside the door so the hanging curtains will blunt his voice. “Each time she added an eye. I asked if she might remove one. They put me in charge of the blocks.” His clipped feathers cannot spread. He folds what is left of them tighter against his coat.",
    "Behind the frame is a sketch: the heavy human head on a plain pillow, its opening uncovered, a hand resting near it. Someone has crossed it out. “She made that when the lamps failed. She thought nobody was recording.” He returns it to the dark. Keeping it has been his only unapproved act for more years than he will count.",
  ], [
    { label: "Speak to Supine through the screen", next: "supine_wish" },
    { label: "Thank the Curator for showing you", next: "museum_gallery", requires: "!curator_heard", effects: [{ flag: "curator_heard" }] },
    { label: "Return to the vestibule", next: "museum_arrival" },
  ]),
  scene("museum_critics", "museum", "Shyster, Swindler & Hustler", "Paid in renewed approval", [
    "“Sublime,” says Shyster. “Supine,” says Swindler. Hustler watches the door before agreeing with both. Their coats are shiny at the elbows. They compare notebooks containing the same caption, and each waits to see whether one of the others has been given a newer version.",
    "Swindler says Shyster heard it from Hustler, who copied it from Swindler's review. Nobody admits to looking at the paintings. “Original observation creates irregularity,” he says. Beneath the printed words, one notebook has a grocery list that cannot have been bought on their current allowance. They ask for your opinion after it has been approved. The question sounds like a request for something they can eat.",
  ], [
    { label: "“I thought the paintings were lonely.”", next: "museum_arrival", requires: "!critics_doubted", effects: [{ flag: "critics_doubted" }] },
    { label: "Leave them to their conversation", next: "museum_arrival" },
    { label: "Look at the art for yourself", next: "museum_gallery", requires: "blocks_pleased" },
  ]),
  scene("supine_wish", "museum", "Lady Supine", "A compliment reaching the actual woman", [
    "You tell her what you saw in the paintings. Not the printed descriptions. The woman in THE REST looked afraid, and the plain-bed sketch was harder to leave than the finished work. Supine keeps looking at the screen after you stop. The lamp beside her head throws a shadow into its open crown.",
    "“You saw that?” Her fingers press against the glass at her end. A camera moves closer; she turns its lens away with her own hand. “You may have a wish. Tell me what you want.” For a moment the offer seems to belong to a person capable of hearing the answer. The account of minutes taken from the settlement continues behind her chair.",
  ], [
    { label: "“Time. For me, and for the people here.”", next: "supine_banishment", requires: "!banished", effects: [{ flag: "banished", unlock: "hospital", time: -5, act: 4 }, { unlock: "casino" }, { unlock: "pit" }] },
    { label: "“Why are there so many cameras?”", next: "supine_cameras" },
    { label: "“Do you ever wish you could be ordinary?”", next: "supine_ordinary" },
    { label: "Remember what happened when you asked", next: "supine_banishment", requires: "banished" },
  ]),
  scene("supine_cameras", "museum", "Lady Supine", "Observed without relief", [
    "“If no one is watching, how can I know I'm still beautiful?” She touches the edge of the opening at the top of her great head, then stops when the camera pans upward. The frame closes on her face again. There is no crown over the hole. The room is warm because somebody must keep what is exposed from drying.",
    "“The cameras preserve me. The Aristobats preserve the cameras. Most die when they behold my uniqueness. I spare them by using screens.” She waits for your gratitude. “You saw my art and understood it. Perhaps I could let you in.” Behind her, a servant changes a stained cloth without once looking at her face.",
  ], [
    { label: "“I would like time for the people here.”", next: "supine_banishment", requires: "!banished", effects: [{ flag: "banished", unlock: "hospital", time: -5, act: 4 }, { unlock: "casino" }, { unlock: "pit" }] },
    { label: "Return to the offer of a wish", next: "supine_wish" },
  ]),
  scene("supine_ordinary", "museum", "Lady Supine", "The cost she will not name", [
    "“Ordinary people can stop performing.” The sentence sounds borrowed from someone she used to know. She lowers her head toward its support, then the little bell rings. Her neck straightens. The support is worn dark where the same weight has rested for years.",
    "“Who would keep the time? Who would make the art? What is there to live for when time is infinite and free?” She can see you considering an answer. She does not allow it. “I am what I am. I never change my mind.” She says it toward the cameras as well as toward you. The wish remains available, but every possible answer has acquired a boundary.",
  ], [
    { label: "“Then let my wish be time.”", next: "supine_banishment", requires: "!banished", effects: [{ flag: "banished", unlock: "hospital", time: -5, act: 4 }, { unlock: "casino" }, { unlock: "pit" }] },
    { label: "Return to the offer of a wish", next: "supine_wish" },
  ]),
  scene("supine_banishment", "museum", "Lady Supine", "The ruler behind the offered wish", [
    "“Time?” Her face stills. “I offered you something exquisite. You ask for what they all ask for.” The servant removes the spare chair from the edge of the picture. Its legs scrape the floor loudly enough that Supine waits before continuing.",
    "“Time must be scarce. What would make a life matter otherwise? What would make mine matter?” She stands erect beneath her enormous open head. “You will not see me again.” The screen closes to a white line. The Curator moves away from you so the camera will not record him as part of the conversation. Under the screen, scratched into a patch of new plaster: SHE NEVER CHANGES HER MIND. UNLESS SHE CHANGES HER MIND.",
  ], [
    { label: "Find Dr. Anima at the Hospital", next: "hospital_arrival" },
    { label: "Tell Ada what happened", next: "ada_after_banishment" },
    { label: "Leave the Museum with your own opinion intact", next: "shanty_arrival" },
  ]),
  scene("ada_after_banishment", "shanty", "Ada", "Considering a thing that cannot be made harmless", [
    "Ada listens beside the dark bulb. Then she takes out the ledger. “The machines are keeping her exactly as she is. Every hour they take makes another hour when she doesn't have to become somebody else.” She turns a page covered in names that have never appeared on Channel 9.",
    "“The Switch moves the brain itself. Mine would go into her head. Hers into mine.” Her paw lies flat on the paper. “I could open the reservoir from her chair. I know what she might do in my body.” She swallows. “I'll volunteer if the doctor can get me home.” You are frightened by how deliberately she has already thought about that condition.",
  ], [
    { label: "“We ask the doctor. Nobody loses their way home.”", next: "hospital_arrival", effects: [{ flag: "ada_volunteered" }] },
    { label: "“You don't have to do this.”", next: "ada_reassurance" },
    { label: "Take time to think with your friends", next: "shanty_arrival" },
  ]),
  scene("ada_reassurance", "shanty", "Ada", "No promise can remove the fear", [
    "“I know I don't have to.” Ada puts down her tools. Her ears flatten at the sound of a bat crossing the street. “But everyone keeps waiting for someone with enough time to risk doing it. There isn't anyone.” She holds up the doctor's empty space in her plan. “This part has to be real. Not a reassurance. A way back.”",
    "“Get an organ that has never belonged to a person. Get the signed sequence. If either light goes out, we stop. If the doctor can't return me, we stop.” Her paw trembles while she says it. She waits until you repeat the conditions. You cannot make this safe by calling her brave.",
  ], [
    { label: "Promise to bring her back", next: "hospital_arrival", effects: [{ flag: "ada_volunteered" }] },
    { label: "Sit beside her before going", next: "shanty_arrival", effects: [{ flag: "ada_volunteered" }] },
  ]),

  scene("hospital_arrival", "hospital", "Hospital for Those Out of Time", "A building kept alive by extension leads", [
    "The Hospital is an older trailer row enclosed by later walls. Corridors narrow where rooms were added without moving the first rooms. Clocks have been fixed above the beds, each stopped at the last moment its patient could afford. A fan circulates air from the ward into the doctor's room and back again.",
    "A heron nurse carries a basin between the curtains. “No sudden futures in the ward.” Dr. Anima's head models sit on a table levelled with folded paper. One has antlers, one whiskers. The human model has an enormous head with an opening in its crown. It is the only model the regulations permit to be empty.",
  ], [
    { label: "Ask the doctor how a mind might change", next: "hospital_doctor", requires: "!brain_plan" },
    { label: "Bring the unwritten brain to Dr. Anima", next: "hospital_provision", item: "blank_brain", requires: "!brain_ready" },
    { label: "Review the doctor's exchange plan", next: "hospital_plan", requires: "brain_plan" },
    { label: "Visit the patients in the still ward", next: "hospital_ward" },
    { label: "Bring Ada back for the promised restoration", next: "hospital_return", requires: "reservoir_open" },
    { label: "Seek the God Switch at the casino", next: "casino_arrival", requires: "brain_ready" },
  ]),
  scene("hospital_ward", "hospital", "Nurse Reed", "Names kept beside the stopped clocks", [
    "“They aren't dead,” Reed tells you. “They are interrupted.” A hedgehog lies beside a scarf with two rows unfinished. A stag's tear has stopped on his cheek. His partner visits every evening and has learned to wipe around it. Reed adjusts the sheet over a mouse whose family ran out of time raising a deposit.",
    "She continues speaking to each patient while she works. There is no evidence they can hear her, and no regulation that yet forbids it. Unopened gifts sit above beds in a cupboard removed from a kitchen. “We don't call them empty.” She touches a name card. Beneath the name is a column calculating storage charges against the account already closed.",
  ], [
    { label: "Read the names and keep them with you", next: "hospital_arrival", requires: "!ward_seen", effects: [{ flag: "ward_seen" }] },
    { label: "Ask Dr. Anima about the exchange", next: "hospital_doctor", requires: "!brain_plan" },
    { label: "Return to the doctor's room", next: "hospital_arrival" },
  ]),
  scene("hospital_doctor", "hospital", "Dr. Anima", "A tortoise with hands older than this equipment", [
    "“Most bodies need a brain. The exceptionally beautiful are certified exempt.” Anima looks at the human model without smiling. “A regulation made for one woman.” He taps its open crown. “Her skull permits the transfer. The Switch shuttles the living organs. It does not persuade her or send a message. Ada's brain goes into Supine; Supine's goes into Ada.”",
    "He has done enough emergency work not to make the consequences sound smaller. “To remove Supine afterward, I need an unwritten brain to keep Ada's body alive while her own organ travels home. No replacement taken from a person. No participant discarded. We do this only if every return step exists.”",
  ], [
    { label: "“Show me how to keep both people intact.”", next: "hospital_model" },
    { label: "Ask Ada whether she wishes to volunteer", next: "ada_after_banishment", requires: "!ada_volunteered" },
    { label: "Visit the ward before deciding", next: "hospital_ward" },
  ]),
  scene("hospital_model", "hospital", "Dr. Anima", "Practising on a board instead of a person", [
    "The doctor sets the practice board between the hare model and Supine's open-headed model. Its wires are labelled tenderness, memory, and resolve. “Preserve what they do. Care, recall, courage. Don't connect a thought to whichever body the regulations say deserves it.” The insulation is repaired with tape. He tests every wire before allowing your hands near it.",
    "You practise without living organs. “The Pit has a seed-brain that has never become anybody. Bring it forward without reverting a resident. Once we begin, nothing about Ada can be treated as spare.” He waits for each connection to hold. The patient clock outside his door remains stopped. Practice has not made the real procedure feel less serious.",
  ], [
    { label: "Connect each thought to the function that preserves it", puzzle: "brain", next: "hospital_plan", requires: "!brain_plan", effects: [{ flag: "brain_plan", addItem: "brain_protocol", unlock: "pit", time: -3 }] },
    { label: "Return to the consultation", next: "hospital_doctor" },
  ]),
  scene("hospital_plan", "hospital", "Dr. Anima", "A return planned before the first removal", [
    "Anima signs the form. “The unwritten brain stays here in a warm cradle. Obtain the Switch. Ada's brain enters the Lady's open skull; the Lady's enters Ada's. Ada uses the chair to release the minutes. Then bring Ada's body back with Supine inside it. I shelter Supine's organ in a living jar, use the spare to hold Ada's body, and return Ada's own brain.”",
    "He reads the sequence again. “The jar keeps Supine conscious and gives her a voice. Containment is necessary. It doesn't make her disposable.” He wraps the form in clean cloth saved from the ward's last delivery. “At the Pit, ask for a beginning. They know the difference between that and taking someone's life away.”",
  ], [
    { label: "Travel to the Pit of Reversion", next: "pit_arrival", requires: "!blank_brain_found" },
    { label: "Bring the unwritten brain to the doctor", next: "hospital_provision", item: "blank_brain", requires: "!brain_ready" },
    { label: "Go to the casino for the Switch", next: "casino_arrival", requires: "brain_ready" },
    { label: "Speak to Ada about the signed plan", next: "ada_after_banishment", requires: "!ada_volunteered" },
    { label: "Leave the consultation room", next: "hospital_arrival" },
  ]),
  scene("hospital_provision", "hospital", "Dr. Anima", "The organ kept warm until it is needed", [
    "The brain rests in Anima's palm beneath a damp membrane. It has a slow pulse but no memories to answer for. He examines every fold, then lowers it into a cradle made from an old incubator. The heater is wired to the Hospital's best remaining supply. Its indicator stays on.",
    "“This lets me hold Ada's body alive during the return. It doesn't give us another Ada if we lose her.” He hands you an instrument with two lights. “Each one marks a living continuity. Both before the exchange. Both after it. If either fails, you stop and call me.” He makes you watch him test the alarms. One sounds very quietly; he replaces its battery before you leave.",
  ], [
    { label: "Leave the organ in the doctor's safe keeping", next: "casino_arrival", requires: "!brain_ready", effects: [{ flag: "brain_ready", removeItem: "blank_brain", time: 8 }] },
    { label: "Review the sequence once more", next: "hospital_plan" },
  ]),
  scene("hospital_return", "hospital", "Dr. Anima", "Bringing back the body you promised to return", [
    "Ada's body sits on the examination couch with Supine's brain inside it. The Lady grips Ada's paws and orders Reed to kneel. When the nurse keeps working, she calls her an animal. The words come out in your friend's voice. Ada, speaking through the Switch from the castle chair, falls silent long enough for you to wonder what she has heard.",
    "Supine's borrowed ears catch every sound from the ward. She demands that the curtain be closed, then that the patients be moved. Anima refuses without raising his voice. “I'm ready to come home,” Ada says at last. Both continuity lights remain lit. He places the cradle beside the couch and begins the return you owe her.",
  ], [
    { label: "Return Ada to her own body", next: "hospital_extraction", requires: "!ada_restored", item: "god_switch", effects: [{ flag: "ada_restored", unlock: "infinite", time: -4, act: 6 }] },
    { label: "Sit with Ada after the restoration", next: "supine_jar", requires: "ada_restored" },
    { label: "Ask the doctor to explain the plan again", next: "hospital_plan" },
  ]),
  scene("hospital_extraction", "hospital", "Ada", "The second transfer, with no room for error", [
    "Anima removes Supine's living brain from Ada's body and lowers it into the prepared jar. The unwritten organ takes its place while the Switch carries Ada's own brain out through the hole in Supine's immense head and home. The spare returns to the cradle. For several breaths, nobody speaks. Ada touches one ear, then the other. She does not joke about having them back.",
    "The jar's pump keeps Supine's organ alive. Her abandoned human body remains breathing under the exemption that was written for it, its huge skull open and empty. The reservoir no longer needs a mind in the chair. Beyond the ward, the pipes begin returning minutes. Reed watches the stopped clocks before allowing herself to put down the basin.",
  ], [
    { label: "Listen to the Lady without her screen", next: "supine_jar", effects: [{ addItem: "supine_brain" }] },
    { label: "Bring Ada to the Shanty Hours", next: "friends_arrival", effects: [{ addItem: "supine_brain" }] },
  ]),
  scene("supine_jar", "hospital", "Lady Supine", "Still the same person, with less power to conceal it", [
    "“This is not an acceptable container.” Her voice comes from a salvaged grille beside the jar's lid. “Bring the doctor. Bring my clothes. Don't stand there.” The pump runs between her demands. Ada keeps her own paws in her lap, watching the jar as if it might speak from her mouth again.",
    "Then Supine hears the ward through the grille's microphone. Nobody can turn it down far enough to make the suffering disappear. “I heard them in her body,” she says. You ask what there is to live for when time is free. She has no answer ready. The pause is not an apology. It is the first time she has had to sit with a question she cannot banish.",
  ], [
    { label: "“You have time to find out.”", next: "friends_arrival", effects: [{ flag: "supine_heard" }] },
    { label: "“You can listen while we decide what comes next.”", next: "friends_arrival", effects: [{ flag: "supine_heard" }] },
  ]),

  scene("pit_arrival", "pit", "The Pit of Reversion", "The place where the land fails to continue", [
    "The ferry circles an absence where an island should stand. Water leans toward the hole without falling. A booth rests at its edge on timber so old the nails show through. The keeper's coat is turned inside out, and each patch covers a patch underneath it.",
    "“Welcome back,” she says. “The greeting will catch up.” Below the booth, stairs descend into moments people thought they had left behind. You can hear a room being emptied, a final argument, rain on a roof that no longer exists. One passage goes farther, toward a time before anyone has begun. The ferry waits with its engine running. Its keeper does not want to remain after dark.",
  ], [
    { label: "Ask for a brain that has never been anyone", next: "pit_keeper", requires: "brain_plan" },
    { label: "Visit the small person beside the stairs", next: "pit_child" },
    { label: "Return the unwritten brain to the Hospital", next: "hospital_provision", item: "blank_brain" },
    { label: "Take the ferry back to the Hospital", next: "hospital_arrival" },
  ]),
  scene("pit_keeper", "pit", "Before", "Knowing what cannot be undone fairly", [
    "“A beginning.” Before studies the doctor's form. “Most people arrive asking me to make somebody easier to live with. Younger. Quieter. Before they knew what was done to them.” She holds the paper where the booth's single bulb can reach it. “We don't make people smaller that way anymore.”",
    "The unwritten brain grows in a cradle beneath the stairs. The steps carry memories; order them from the latest moment back to the first breath. “You're laying a path. Leave every resident's past attached to them.” Through the opening, someone repeats the same farewell without reaching its final word. Before shuts the inner door so you can concentrate on the sequence instead of the voice.",
  ], [
    { label: "Bring the unwritten beginning forward", puzzle: "reversion", next: "pit_reversed", requires: "!blank_brain_found", item: "brain_protocol", effects: [{ flag: "blank_brain_found", addItem: "blank_brain", time: -4 }] },
    { label: "Ask the child by the stairs what they need", next: "pit_child" },
    { label: "Return to the ferry", next: "pit_arrival" },
  ]),
  scene("pit_reversed", "pit", "Before", "A beginning carried out without an erasure", [
    "The cradle reaches the landing. Before checks every lower step. The voices continue. Nobody has become absent from their own life. You had hoped, perhaps, that some of those lives would sound less painful after the work. Nothing here was allowed to grant that wish.",
    "“A new organ. No owner.” She wraps it in cloth that has been washed until the printed pattern is almost gone. “It hasn't been frightened yet. Keep the doctor's heater on.” Behind her, the stairs return to the routes people brought into the Pit. A child waits beside the booth holding a cracked cup with both hands. The ferry's engine cuts out, then catches after another attempt.",
  ], [
    { label: "Carry the living beginning to Dr. Anima", next: "hospital_provision" },
    { label: "Say goodbye to the child beside the stairs", next: "pit_child" },
  ]),
  scene("pit_child", "pit", "Yesterday", "A child afraid of what tomorrow will require", [
    "Yesterday has brought a broken cup to the Pit. They want it repaired without losing the afternoon they broke it. Their fingers are bandaged from picking up the pieces. “It was the last one that matched,” they say. They watch your face for a punishment that has not arrived yet.",
    "You hold the pieces while they fit them together. Before supplies wire to bind the largest crack. The cup will not hold boiling water. Yesterday looks at it a long time. They are going home to apologise, and they are frightened of going home. You walk with them as far as the ferry because repair has not made what comes next easy.",
  ], [
    { label: "Help carry the repaired cup to the ferry", next: "pit_arrival", requires: "!yesterday_helped", effects: [{ flag: "yesterday_helped", time: 4 }] },
    { label: "Wish Yesterday a good tomorrow", next: "pit_arrival", requires: "yesterday_helped" },
  ]),

  scene("casino_arrival", "casino", "The Last Minute", "An old recreation hall fed with confiscated evenings", [
    "The casino's light spills through the windows of a trailer extended with sheet metal. Cigarette smoke sits beneath the low ceiling. Over the bar, a cigarette-shaped meter burns down while patrons wait for their winnings. It is relit before most reach the counter. The wall beneath it is dark from years of watching.",
    "A stoat in a clean waistcoat repeats the welcome. “The Lady created this because we begged her.” He says it as someone quoting a statement he was never asked to witness. Behind him, Aristobats carry time-vials through an unmarked curtain. At the nearest table, a woman keeps one hand over the pocket where her bus fare should be.",
  ], [
    { label: "Ask to join the house's peculiar game", next: "casino_host", requires: "brain_ready" },
    { label: "Inspect where the Aristobats take their winnings", next: "casino_ledger" },
    { label: "Visit the unlisted chapel", next: "casino_chapel", requires: "casino_won" },
    { label: "Return to the Hospital", next: "hospital_arrival" },
    { label: "Gather your friends and take the Switch toward the castle", next: "switch_awake", requires: "god_switch_obtained" },
  ]),
  scene("casino_host", "casino", "Hustler", "Reading the terms while the deposit is taken", [
    "“Fair Exchange.” Hustler uncovers a grid. “One square per row and column.” He points to wings, wealth, measured time, and the small needs the house normally ignores. The felt is thin enough to show the table's water damage. Coins and minute counters occupy the dry patches.",
    "Underneath, somebody scratched another set of rules: prefer life, guidance, shelter. The old condition still binds the dealer to return a correct player's deposit. “A winner sees the private collection.” Hustler checks the book before saying it. The sentence is one the house has tried to remove. A court stamp keeps it attached to the page. He folds the book shut before you can read what else was contested.",
  ], [
    { label: "Play a round of Fair Exchange", puzzle: "casino", next: "casino_won", requires: "!casino_won", item: "brain_protocol", effects: [{ flag: "casino_won", time: -3 }] },
    { label: "Inspect the house ledger before playing", next: "casino_ledger" },
    { label: "Return to the gaming floor", next: "casino_arrival" },
  ]),
  scene("casino_won", "casino", "Hustler", "Paid only what the written condition requires", [
    "The dealer follows your arrangement with a fingertip, then reads the condition again. Nothing in the surrounding pages allows him to withhold this deposit. He counts eight minutes slowly. The people at the other tables watch without cheering. Some have been here long enough to know what an exception costs afterward.",
    "He unlocks the curtain. Beyond it, the private room has a plain wooden chair, two sockets, and a switch labelled GOD. Extension wires run along the baseboard into a wall softened by damp. A former owner's name has been scratched from the chair. The machine looks less like a promise than equipment left behind after a procedure nobody wished to record.",
  ], [
    { label: "Collect the returned deposit and enter", next: "casino_chapel", requires: "!casino_paid", effects: [{ flag: "casino_paid", time: 8 }] },
    { label: "Return to the quiet room", next: "casino_chapel", requires: "casino_paid" },
  ]),
  scene("casino_ledger", "casino", "The house account", "Where the stolen future is entered correctly", [
    "The columns show time coming from the trailers, the Fields, and the Hospital. These accounts are balanced. Nothing has been lost by mistake. Ada's missing minutes paid for stillness in the castle chair; a patient's final deposit paid for a correction to Supine's portrait lighting. The descriptions are precise enough to leave no doubt about what happened.",
    "The vials keep Supine unchanged. Ordinary bodily minutes, hesitation, doubt, and any chance that she might have to live differently go into the reservoir. The casino takes what remains. Ada has written a line between the totals: A SYSTEM THIS BUSY PREVENTING CHANGE HAS ALREADY TOLD US WHAT IT FEARS. The next sheet lists the costs of enforcing that prevention.",
  ], [
    { label: "Remember where the missing minutes went", next: "casino_arrival", requires: "!reservoir_known", effects: [{ flag: "reservoir_known" }] },
    { label: "Return to the gaming floor", next: "casino_arrival", requires: "reservoir_known" },
    { label: "Tell Ada what the accounts confirm", next: "ada_after_banishment", requires: "banished" },
  ]),
  scene("casino_chapel", "casino", "The God Switch", "The apparatus kept from completing its purpose", [
    "NO ONE CHANGES THEIR MIND UNLESS THEY CHANGE THEIR MIND. Below the plate: EXCHANGE REQUIRES TWO LIVING CONTINUITIES. The machine has padded channels for the organs themselves. One side is marked SELF, the other OTHER. There is dried cleaning solution in the joints, and a replaced section of tube newer than anything else in the room.",
    "The sockets are misaligned. Every line has been turned back toward its origin. The arrangement keeps a person exactly where they began, even while reporting successful operation. Someone did this carefully. You compare the machine with Anima's plan. It could carry a brain into another living body. It has spent years being paid to prove that nothing changed.",
  ], [
    { label: "Rewire the Switch so two minds can meet", puzzle: "switch", next: "switch_awake", requires: "!god_switch_obtained", effects: [{ flag: "god_switch_obtained", addItem: "god_switch", time: -4 }] },
    { label: "Look at the awake machine", next: "switch_awake", requires: "god_switch_obtained" },
    { label: "Return to the public casino", next: "casino_arrival" },
  ]),
  scene("switch_awake", "casino", "Ada", "Understanding what her own body will carry", [
    "Ada arrives with the doctor's reply folded inside her scarf. “He has a way home.” She examines the channels before touching the switch. “My brain leaves my body and goes through the opening in her head. Hers comes back into mine.” She looks down at her paws as if seeing where another person's orders will take shape.",
    "“I open the reservoir. You bring my body to Anima, even if she uses my voice to tell you not to.” She makes you repeat that. “I don't know what being her will feel like. I don't want to find out alone.” She asks for Pip and Brindle. The request sounds more like fear than the courage the plan will require.",
  ], [
    { label: "“We go together, and we bring you home.”", next: "switch_agreement", effects: [{ flag: "ada_volunteered" }, { flag: "ada_friend" }] },
    { label: "Review the doctor's continuity plan", next: "hospital_plan" },
  ]),
  scene("switch_agreement", "casino", "Pip & Brindle", "Four people carrying what they can", [
    "Pip brings the poem wrapped in plastic cut from an old window covering. Brindle brings the lullaby and four small parcels of food. Each parcel is tied with string already shortened by previous uses. He watches to make sure everyone takes one. Nobody says how long it took him to gather the portions.",
    "The Aristobats listen for doubt and independent rhythm. Ada says the relief signals can draw their attention without asking anybody to fight them. Her plan is written over an eviction notice. Pip holds your hand. “I wanted to see farther than the lake,” he says. “I didn't think it would be this.” He keeps holding on after the sentence ends.",
  ], [
    { label: "Walk together toward the Great Castle Divine", next: "castle_arrival", effects: [{ unlock: "castle", act: 5, addItem: "lullaby" }, { flag: "pip_friend" }, { flag: "brindle_friend" }] },
    { label: "Take one last moment in the Shanty Hours", next: "shanty_arrival", effects: [{ unlock: "castle", act: 5, addItem: "lullaby" }, { flag: "pip_friend" }, { flag: "brindle_friend" }] },
  ]),

  scene("castle_arrival", "castle", "Great Castle Divine", "The additions built above the settlement", [
    "The castle rises in layers of brick, plaster, temporary stairs, and rooms added around older rooms. It has been made larger each year without becoming less afraid. Windows face other windows. Screens watch doors whose handles are polished from hands that were never allowed to remain indoors.",
    "Two Aristobats hang above the servants' entrance. Their velvet uniforms have patched linings full of silver time-vials. One ear follows the ticking in your pocket. The other turns toward Pip's breath. Ada stands close, with the instrument's two lights hidden under her coat. From here you can see the trailers at the far end of the road. Their windows are going dark one by one.",
  ], [
    { label: "Find a way past the Aristobat minders", next: "castle_minders", requires: "!minders_distracted", item: "god_switch" },
    { label: "Enter the corridor behind the screens", next: "castle_corridor", requires: "minders_distracted" },
    { label: "Return to Ada at the reservoir controls", next: "castle_changed", requires: "mind_changed" },
    { label: "Return Ada to the Hospital", next: "hospital_return", requires: "reservoir_open" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),
  scene("castle_minders", "castle", "The Aristobats", "Leaving only when the account permits it", [
    "“We hear everything.” The left bat examines the completed relief order. The right listens to the supper signal, then back to the recorder. The casebook has permitted them to leave, but the old entrance machine must recognise a quiet room as attended rather than abandoned. Neither bat can afford an absence charge.",
    "Pip steadies the wind chime. Ada holds the mirror. Brindle draws the curtain without making its damaged runner squeal. Give the recorder its small signals: sound for the ears, movement for the lens, darkness at the final beat. The minders wait beside plates already cooling. Their authority has made them dangerous, but it has not given them permission to go home when they are tired.",
  ], [
    { label: "Complete the minders' quiet handover", puzzle: "minder", next: "castle_corridor", requires: "!minders_distracted", effects: [{ flag: "minders_distracted", time: -3 }] },
    { label: "Wait beyond the range of their ears", next: "castle_arrival" },
  ]),
  scene("castle_corridor", "castle", "The corridor", "The wires that arrive from other people's pockets", [
    "Every portrait shows Supine upright. Every caption calls it rest. Beneath the frames, bundled cables carry the settlement's minutes toward her room. Labels name each district. The Hospital line is thicker than the others, insulated with material that has been requested for the ward and refused.",
    "Pip touches a wire and recoils. Brindle steadies him without making a sound. At the far door, a disconnected camera keeps turning from the chair to the bed. Its red eye is dark, but its motor continues. The corridor smells of hot dust and wet plaster. There is no chair for the people waiting to be admitted, though the floor has been worn down where they stand.",
  ], [
    { label: "Approach the Lady's bedchamber", next: "castle_bedroom", requires: "!supine_asleep" },
    { label: "Enter the sleeping room", next: "castle_asleep", requires: "supine_asleep" },
    { label: "Check that the minders remain distracted", next: "castle_arrival" },
  ]),
  scene("castle_bedroom", "castle", "Lady Supine", "The living woman behind Channel 9", [
    "Supine sits erect. Her enormous human head leans against a brace fixed to the chair. At its top is a round, uncovered hole. You can see the pale folded brain below the rim, wet in the lamplight. A tray of cloths waits beside it. This is a body that has required care while claiming nobody else's work mattered.",
    "“I told you never to see me again.” Her eyes keep closing against the order. “Did you finish the rhyme?” Brindle begins his mother's tune. The camera bells fall out of step. To let her sleep, you must carry the room's rhythm away from the chair. Supine grips its arms while the great weight of her head pulls toward the pillow.",
  ], [
    { label: "Finish the lullaby and put the watching room to sleep", puzzle: "lullaby", next: "castle_asleep", requires: "!supine_asleep", item: "lullaby", effects: [{ flag: "supine_asleep", time: -3 }] },
    { label: "Return to the corridor and breathe", next: "castle_corridor" },
  ]),
  scene("castle_asleep", "castle", "A woman asleep", "An open skull on an ordinary pillow", [
    "Her head lies across the pillow, much larger than any head has a right to be. The hole at its crown remains exposed. The brain moves faintly with the body's pulse. No one dies from seeing her. The servants who kept her damp cloths ready must have stood this near every day, though the broadcasts never counted them among the witnesses.",
    "Beneath the bedside table is a child's drawing of an open gate. Its paper is older than the billboards. Ada checks both lights and the doctor's signature. The Switch's lined channel will meet the opening at the top of Supine's head. There is nothing figurative about the organ it is going to move.",
  ], [
    { label: "Ask Ada whether she is still sure", next: "castle_consent" },
    { label: "Wait a quiet moment beside the bed", next: "castle_consent" },
    { label: "Return to the corridor", next: "castle_corridor" },
  ]),
  scene("castle_consent", "castle", "Ada", "Agreeing beside the body that will be hers", [
    "“Still sure. Still coming back.” Ada places her paw on the second socket herself. She looks once at the bed, once at her own hands. Anima's signed sequence lies open between them. Pip holds the poem without reading it. Brindle keeps his grip loose enough that Ada can withdraw if she needs to.",
    "The Switch will draw her brain from her living body and place it through the hole in Supine's huge skull. Supine's brain will occupy Ada in return. You have a plan for both continuities, but no promise that the experience will leave either person unchanged. Ada looks at you until you understand that bringing her back includes whatever she has been made to witness.",
  ], [
    { label: "Activate the exchange with both lights lit", next: "castle_changed", requires: "!mind_changed", item: "god_switch", effects: [{ flag: "mind_changed", time: -5 }] },
    { label: "“We bring you straight back to the doctor.”", next: "castle_consent" },
    { label: "Review the plan before proceeding", next: "hospital_plan" },
  ]),
  scene("castle_changed", "castle", "Ada, from the Lady's chair", "Your friend's voice coming from the wrong mouth", [
    "The padded channels carry the two living organs. Ada's brain settles through the opening in Supine's head; Supine's takes its place inside Ada's body. Both lights hold. The enormous human face wakes with your friend's expression. She has to lift its weight before she can see the reservoir controls.",
    "In Ada's body, Supine wakes and strikes Pip's hand away. “Keep that filthy wing off me.” She orders Brindle to carry her, then threatens to have his remaining time seized when he hesitates. Your friend's mouth has become cruel without any change to its shape. From the chair, Ada presses RETURN TO SENDER. The Hospital pipe trembles. She keeps her new hands on the controls despite hearing her own old voice.",
  ], [
    { label: "Help Ada keep the reservoir open", next: "ada_supine", requires: "!reservoir_open", effects: [{ flag: "reservoir_open", time: 24 }] },
    { label: "Ask the Lady what she can hear", next: "ada_supine", requires: "!reservoir_open", effects: [{ flag: "reservoir_open", time: 24 }] },
    { label: "Bring Supine-in-Ada safely to the doctor", next: "hospital_return", requires: "reservoir_open" },
  ]),
  scene("ada_supine", "castle", "Two minds", "Keeping the promise while the body speaks against it", [
    "Ada instructs the reservoir to continue returning time without a Keeper. Her voice is low inside Supine's vast head. “Take my body to the doctor. Don't do what she tells you.” The opening above her holds the brain that belongs to the friend you know. You watch both lights while the command settles into the lines.",
    "Supine spits an order from Ada's mouth. Brindle offers his arm and keeps it there after she insults him. He cannot leave your friend's body to walk alone. Ada tells you the Switch can return her from the Hospital. “Go. Keep the channel alive.” She remains in the chair, surrounded by cameras that have already begun recording her as if she were the Lady.",
  ], [
    { label: "Bring Supine-in-Ada to Dr. Anima", next: "hospital_return" },
    { label: "“We'll see you at home.”", next: "hospital_return" },
  ]),

  scene("friends_arrival", "shanty", "Pip, Brindle & Ada", "Coming back to the same damaged homes", [
    "The washing still hangs over the awning. The leaks remain. Someone has taken a patient home from the Hospital, and someone else's bed is empty for reasons the returned minutes cannot repair. Huckster closes his counter for lunch. Nobody knows whether he will be allowed to keep it closed tomorrow.",
    "Your friends wait on the repaired bench. Ada has brought the reservoir accounts. She has read them until the paper softened. “Most of it belonged to people who already lost it. We've given back what can still be given.” The far entrance still requires more than one person can carry. Pip takes out a button. Brindle unties a string. Ada removes a watch spring without opening the watch.",
  ], [
    { label: "Sit down and hear what your friends have decided", next: "friends_offer", effects: [{ flag: "friends_offer_heard", addItem: "friendship_token", unlock: "infinite", act: 6 }] },
    { label: "“I'm glad everyone is here.”", next: "friends_offer", effects: [{ flag: "friends_offer_heard", addItem: "friendship_token", unlock: "infinite", act: 6 }] },
  ]),
  scene("friends_offer", "shanty", "Your little pals", "Offering what little remained after all the deductions", [
    "“Seven minutes,” Pip says. He has written the number on the back of the poem. Brindle opens his pocket. Nine. Ada lays down six. Their hands stay near the slips for a moment before they move away. These are not savings kept for a distant occasion. This is what remained after food, shelter, illness, and the years they were charged for enduring them.",
    "They offer it without asking for anything in return. Pip cannot finish the sentence about what he meant to do with his last seven. Brindle watches the bench. Ada says they will walk with you whether you accept or refuse. The Lady's jar is quiet. None of this makes the choice easier to deserve.",
  ], [
    { label: "Accept their pledge; promise they will come with you", next: "friends_take", requires: "!friends_decided", effects: [{ flag: "friends_decided" }, { flag: "friends_pledged", time: 22 }] },
    { label: "“Keep your minutes. I want my friends, not their last moments.”", next: "friends_refuse", requires: "!friends_decided", effects: [{ flag: "friends_decided" }, { flag: "friends_kept_time" }] },
    { label: "Return to the gate together", next: "infinite_arrival", requires: "friends_decided" },
  ]),
  scene("friends_take", "shanty", "Pip", "Holding their next moments in your pocket", [
    "The transfer warms your palm. Your friends remain beside you, but their clocks have nothing left to promise. Whatever happens next must come through the minutes you have taken and the return you have agreed to make possible. Brindle steadies Pip while he folds the poem.",
    "“Don't spend them on being too important to come back,” Pip says. He tries to make it sound less frightened than it is. Ada threads the watch spring through the button and string. “Evidence. Keep it where the gate can see.” You leave together. They trust you with something no reassurance can replace, and you can feel each borrowed minute against the ordinary beat of your own body.",
  ], [
    { label: "Walk with them to the Infinite entrance", next: "infinite_arrival" },
    { label: "Stop beside the lake on the way", next: "lake_empty" },
  ]),
  scene("friends_refuse", "shanty", "Brindle", "The relief they had tried not to ask for", [
    "Brindle closes his pocket slowly. Pip begins to cry and has no excuse prepared for it. Ada looks away long enough to let him wipe his face. The minutes remain with the people who were prepared to lose them. They are still painfully few. Nothing about refusing the offer has made their accounts whole.",
    "Ada enters another line: THE OFFER WAS MADE. THE OFFER WAS HEARD. THE PEOPLE WERE NOT SPENT. Her handwriting wavers on the last word. You hold their three tokens. The gate may recognise them, or it may remain what every other gate has been. Your friends take their places beside you anyway, with the small relief of still owning the walk that follows.",
  ], [
    { label: "Take the unspent offer to the far entrance", next: "infinite_arrival" },
    { label: "Sit together for one more cup of tea", next: "shanty_arrival" },
  ]),
  scene("infinite_arrival", "infinite", "The Entrance to Infinite Time", "An account with no keeper willing to answer for it", [
    "The gate speaks without a person behind it. Its blank clock is surrounded by four small circles. Rust has swollen the lower joints, and travellers have left initials where their hands waited. YOU DO NOT HAVE ENOUGH TIME TO ENTER INFINITE TIME. The sentence appears before you have offered anything.",
    "A smaller dial shows ninety minutes held in escrow from people turned away. The entrance demands thirty and normally permits one traveller to claim the remainder. Your friends stand close enough to read it with you. Behind you, Limited Time has had one afternoon outside its ruler's grip. The gate is older than that ruler, and its account has survived many afternoons people hoped would become something else.",
  ], [
    { label: "Read the gate's final rule together", puzzle: "final_gate", next: "infinite_open", requires: "friends_decided", item: "friendship_token", effects: [{ flag: "final_gate_open", time: -4 }] },
    { label: "Consider what lies beyond", next: "infinite_question", requires: "final_gate_open" },
    { label: "Hear your friends' offer before deciding", next: "friends_offer", requires: "!friends_decided" },
    { label: "Return to the Shanty Hours", next: "shanty_arrival" },
  ]),
  scene("infinite_open", "infinite", "The gate", "The minutes belonging to people who were refused", [
    "Under layers of polish lies the older condition: AN ENTRANCE IS MADE TO LET A FUTURE THROUGH. You read it with the names and pledges still attached to the people who made them. Four circles light. The gate's account must recognise four living claimants instead of awarding one person the balance it took from strangers.",
    "Pledged minutes return to their owners. An unspent offer is entered without requiring a body to go still first. The latch moves with a sound like something tearing loose after years of rain. It has opened. The people whose payments filled its escrow are not waiting on the other side. Some were carried to the Hospital. Some will never know what their refusal made possible.",
  ], [
    { label: "Decide what kind of future to enter", next: "infinite_question" },
    { label: "Ask the Lady what she thinks now", next: "infinite_lady" },
  ]),
  scene("infinite_lady", "infinite", "Lady Supine", "A question from the jar, without a broadcast to carry it", [
    "“What is there to live for when time is infinite and free?” Supine's voice is thin through the grille. There is no camera ready to turn it into an address. She waits while the pump continues its work. You cannot tell whether she has begun listening or has only lost the power to interrupt.",
    "Pip mentions the poem his mother did not hear him finish. Brindle remembers making the bird before his hands worsened. Ada says a watch can be repaired for the person wearing it, without calculating what that person produces. Supine is silent. None of their answers restores what she took. They have chosen to say them where she can hear anyway.",
  ], [
    { label: "Let the answer remain unfinished", next: "infinite_question", effects: [{ flag: "supine_listened" }] },
    { label: "“You could make something for someone.”", next: "infinite_question", effects: [{ flag: "supine_listened" }] },
  ]),
  scene("infinite_question", "infinite", "The people at the threshold", "The threshold does not tell you what will follow", [
    "Beyond the gate there are no visible clocks. Fog hides whatever road continues. It may be a country without priced endings. It may be something nobody who returned could explain. The only certainty is the open latch and the people still beside you. For once, uncertainty has not been filed as a crime.",
    "The mechanism will accept one final instruction. Open its promise across Limited Time, giving ordinary people an unbilled tomorrow. Cross together into what has no measure. Or close the account and go back with your finite days restored to their owners. Each choice leaves losses behind that cannot be paid away. No screen arrives to make one of them seem clean.",
  ], [
    { label: "Open time to everyone. Let ordinary lives belong to their owners.", next: "ending_commons", ending: "commons", effects: [{ flag: "ending_chosen" }] },
    { label: "Cross into Infinite Time together, and discover what it means.", next: "ending_infinite", ending: "infinite", effects: [{ flag: "ending_chosen" }] },
    { label: "Keep our finite days. Go home together.", next: "ending_stay", ending: "stay", effects: [{ flag: "ending_chosen" }] },
  ]),
  scene("ending_commons", "infinite", "The next afternoon", "The first unbilled afternoon, after so many paid for it", [
    "The gate's instruction passes through the land. Some Hospital clocks resume. Other beds remain empty. The gardener unlocks the storehouse and has to clear the rotten lower crates before anybody can eat. Vellum writes THINGS PEOPLE CHOSE above a catalogue still full of cancelled names. The ink does not cover them.",
    "Nobody becomes immortal. Tomorrow is no longer something a ruler can deduct for being tired. It will take longer than tomorrow to make the roofs sound, the food plentiful, or the frightened people willing to speak. On Brindle's bench, Pip leaves a rhyme unfinished. Supine supplies a word from the jar. He considers it without thanking her. The others sit close while the rain begins again.",
  ], []),
  scene("ending_infinite", "infinite", "The unmeasured country", "A country no one here knows how to trust", [
    "You cross together. Pip keeps looking back until the opening is hidden. Brindle carries the little bird because setting it down anywhere feels like leaving another part of home behind. Ada's watch still ticks. She cannot bring herself to stop it, even where no one has said its sound is necessary.",
    "The unmeasured country does not announce safety. It offers a stretch of road nobody has yet charged you to walk. Supine asks for paper and is made to wait until the others have rested. You find a low place out of the wind and sit down. The old fear comes with you. So do the people who know when your silence means you need someone to stay.",
  ], []),
  scene("ending_stay", "shanty", "The Shanty Hours", "Returning without pretending the home has healed", [
    "You close the account and return. No friend has been spent. The reservoir stays open under Ada's instruction, and the returned minutes belong to the people who lost them. The trailers wait in the same mud. The roof over Pip's kettle has started to leak at a new seam. Brindle fetches another bucket.",
    "There will be last afternoons. Some will come too soon. The Hospital still contains people for whom no return was possible, and the names on the forest stumps have not changed. Tonight you share what food there is. Supine asks for paper. Pip finishes the poem quietly enough that only the bench can hear. Before your heads hit the pillow, you check that everyone is still there.",
  ], []),
];

export const SCENES: Record<string, Scene> = Object.fromEntries(campaign.map((entry) => [entry.id, entry]));
