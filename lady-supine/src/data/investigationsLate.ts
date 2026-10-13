import { toggleCircuit, type Investigation, type InvestigationBoard, type InvestigationChallenge, type Evidence } from './investigationTypes';

const paragraphs = (text: string): string[] => text.trim().split(/\n\s*\n/);
type Writing = { narrative: string; resolution: string };
const WRITING: Record<string, Writing> = {
  "palace_ledger": {
    "narrative": "Ada finds the duty register inside a little cupboard labelled NO PRIVATE READING. The cupboard has no door. Its prohibition has apparently been sufficient until now. Five Aristobats are named, although only two hang over the entrance. The others listen through tubes embedded in the plaster. Their excellent hearing does not tell them what a sound means; the register does. A sigh at the correct station is evidence of satisfactory repose. The same sigh elsewhere is a possible departure from the Lady's approved expression.\n\nBrindle remembers carrying these tubes up the hill. He had thought they were heating pipes. One bends at the place where he used his horn to steady it, leaving a faint dent beneath the gold paint. He rubs the cloth cap on that horn. “I can carry something without agreeing with where it goes,” he says. “But I should have asked.” Pip moves closer, putting a wing beside his hand without trying to finish the thought.\n\nThe relief slips have lost their station labels. Reconstructing them will tell you which harmless sound each minder has been trained to accept. You are preparing a legitimate relief, not a noise loud enough to hurt their ears. The minders deserve a quiet evening too, even if the castle has taught them to call every stranger an interruption.",
    "resolution": "The five assignments settle into a pattern. Behind the wall, somebody stops sharpening a pencil. “Relief acknowledged,” says a voice you had mistaken for a draught. Quill asks whether the relief includes supper. Brindle says he brought enough for everyone, then checks the bag with a worried expression. There is enough. The first opening in the castle is made by an accurate account and a lunch nobody has yet been asked to earn."
  },
  "palace_cipher": {
    "narrative": "Inside the register's cover lies a smaller book, printed before Supine's portrait became the watermark of every official document. Its title is Instructions for a Room Containing a Person. Someone has crossed out Person and written Presence. Under that, someone else has made an unsuccessful attempt to restore the original word. The paper is so thin you can see both efforts at once.\n\nPip reads the numbered lines softly. They sound like a nursery lesson written by an exhausted adult: a camera is not company; a chair is not a duty; a door has something to do with welcome. The official index turns those observations into coordinates. Ada recognises the method from old clock inventories. It preserves a word while letting a censor pretend there is only a collection of numbers.\n\nThe register requires two words before it can recognise an interval when the Lady is free of observation. One describes the interval; the other describes how a visitor may be admitted during it. Neither grants possession of her room. The distinction matters to Ada. “We need to get inside,” she says, “but a person can need something badly and still owe another person care.” You will use the old instructions to establish a lawful pause in watching, before the newer machinery can accuse that pause of being a failure.",
    "resolution": "The old vocabulary opens a narrow entry beneath the current rules. An interval may exist without an image proving that it exists. A door may answer a guest rather than certify an admirer. Pip copies the two words onto clean paper. “They haven't become secret because they're difficult,” the moth says. “They've become secret because somebody stopped allowing them to be ordinary.” Ada keeps the restored entry beside the doctor's continuity plan."
  },
  "palace_balance": {
    "narrative": "The palace's walls are lined with felt, but the felt has been arranged to carry sound inward. Outside, a peasant may whisper without an Aristobat hearing every syllable. Inside, the Lady's smallest movement enters a speaking tube. Brindle places one broad palm against the wall. The plaster is warm with stored attention. He withdraws his hand as if it belonged to somebody sleeping.\n\nA maintenance panel offers five harmless ways to interrupt the carrying: soften a wall, cradle a bell, slacken a drum, lay water under a tube, cushion the runners of the watching chair. The allocations are measured in beats because the devices have to agree on a rhythm. Too little leaves a live channel. Too much makes the building announce an obstruction. Ada has written down all five calibration conditions before the numbers on the panel fade into a flattering image of Supine.\n\nThe chair runners trouble Pip most. They have grooves showing how often someone stood up, sat down, stood up again, and made each movement look deliberate. Nobody has supplied a setting for being tired. You can supply one carefully, using rhythm instead of stolen time. Brindle volunteers the quiet hum he uses when repairing fragile furniture. It will occupy the listening tubes without making any listener less able to hear a person who actually needs help.",
    "resolution": "The hum reaches every tube at the right strength. Rain, ticking, and the small tired sighs of the building cease to be accusations. Through the glass, an Aristobat removes his duty collar and rubs the flattened fur underneath. “I thought quiet meant nobody required me,” he says. “Apparently it can mean I may rest.” Brindle adjusts the felt gently. The relief will last long enough for a visitor, and no longer than the measured room permits."
  },
  "palace_sequence": {
    "narrative": "The control desk contains seven handles and a card explaining that any unauthorized sequence will be broadcast as an attack upon the Divine. A newer card corrects the wording: any sequence not entered in the register will be unauthorized. There is still room to enter one. The castle has not abolished relief; it has buried relief beneath procedures that nobody living has been encouraged to complete.\n\nEach handle answers a different fear. The witness establishes that the room has not been abandoned. The mirror gives the cameras something truthful to look at without displaying the Lady's face. The water steadies that image. The bell releases the minders from their duty. The curtain protects the bed. The broadcast retires a public claim to see her. Finally, the guest bell permits the inner door to speak. Moving any one too soon would make an ordinary act appear sinister to the machine watching it.\n\nAda refuses to register you as the sole witness. “Then it would be your fault if she changed,” she says. Pip signs alongside you, and Brindle presses his careful mark beneath the names. You are accepting responsibility for what you do, not responsibility for every thought Supine might have afterward. Arrange the relief so that the room can stop performing without being described as an empty throne.",
    "resolution": "The seven actions fit the two memoranda. For a moment, Channel 9 shows an empty chair, an accurately labelled chair, doing nothing. The audience counter stays enormous. Then it quietly changes its unit from viewers to connections. Those were never the same thing. Pip asks who wrote the original distinction. No signature remains. You leave the corrected order where the next relief witness can find it without needing to invent the procedure again."
  },
  "palace_route": {
    "narrative": "A plan unfolds from the desk in layers: first the floor, then the listening wires, then the camera angles, finally a path that the plan calls NOT CURRENTLY REQUESTED. The live sightlines are marked in black. They make the corridor look crowded even though no body stands there. Ada traces an open tile with one claw. “All this attention,” she says, “and nobody noticed she needed a place to lie down.”\n\nThe route must pass four witness stations. The felt landing confirms the sound has softened. The water mirror confirms the cameras retain a truthful view of a room. The curtain cleat confirms that view contains no sleeping face. The guest bell confirms that someone, rather than something, is entering. A later confirmation cannot stand in for an earlier one. You must walk the argument in its proper order.\n\nBrindle stays beside the first station to hold the curtain steady. Pip waits at the desk with the relief book, ready to answer a genuine question from a minder. Ada walks with you. Her ears twitch toward the bedchamber, catching the sound of fingernails tapping the arm of a chair. It is neither a proclamation nor an alarm. It is the noise someone makes while trying to remain awake. You have eighteen safe steps to give that noise somewhere to end.",
    "resolution": "At the last station, the guest bell gives a sound smaller than the castle. No trumpets repeat it. The room has been informed without the country being informed. Ada smiles, then remembers to breathe. Behind the inner door, a woman asks whether the broadcast has failed. You can truthfully tell her it has been relieved. The corridor remains safe for the return journey; nobody has been locked into the part they played to let you through."
  },
  "palace_circuit": {
    "narrative": "The final audience is a grid of little lights above the inner door. Each is attached to a different claim: public reassurance, archival continuity, medical supervision, protection of property, protection of the image that certifies the property. They overlap so thoroughly that disabling one wakes its neighbours. The castle has mistaken having many reasons to watch someone for having their permission.\n\nThrough the door, Supine says she has been recorded for as long as she can remember. At first the recordings were to preserve a wonderful day. Later they were to compare every day with that one. Eventually she began to pose before the cameras turned on. “Nobody made me do that,” she says quickly. Then she asks, almost angrily, whether the cameras could distinguish a choice from a habit.\n\nYou cannot answer for her. You can give her an interval in which she need not answer for the country. The relief register has authorised every shutter, but their old circuits remain coupled. Darken the grid without smashing it. The minders will retain their equipment for fires, illnesses, and other occasions when being noticed is a kindness. When the last claim goes dark, the room can admit a visitor whose gaze is not a tax. Brindle's lullaby waits nearby, carrying a tune rather than an instruction to adore.",
    "resolution": "The final lamp goes dark. For the first time, the Lady's next movement has no scheduled audience. She stands, sways, and laughs once at the absurd effort of remaining erect in an empty room. Then she sits on the bed. “You won't say it was beautiful?” she asks. Pip answers that it looks comfortable. Supine seems offended, then curious. You have made room for sleep; the choices waiting beside the pillow still require care."
  },
  "last_ledger": {
    "narrative": "The gate's little account book opens to a page called MINOR REMAINDERS. Ada lays it across her knees, still sitting between Pip and Brindle. Every entry describes something unfinished, then treats that unfinished thing as a justification for taking the owner's last reserve. A poem can be abandoned. A bench can wait. A curtain is not essential. The explanations are immaculate, and nobody was asked whether the work mattered.\n\nThese are protected entries copied from the returned reservoir, not fresh payments. Their amounts do not change the minutes in any pocket or undo the decision you made about your friends' pledge. The gate needs a correctly identified owner before it can stop treating a reserve as available to the next sufficiently impressive claimant. Five owners have sent evidence. Pip's handwriting occupies hardly any space. Brindle's page is folded carefully around a splinter. Ada's diagram explains why an apparently spare spring belongs to a clock.\n\nMrs. Thimble has enclosed a scrap of curtain cloth with a repaired hem. Vellum has listed a catalogue heading that does not yet have a book beneath it. These are small projects. None becomes larger because you defend it. None has to become larger. Reconstruct the five entries so the final ledger must describe what each living person intends, instead of describing how little an official thinks that intention is worth.",
    "resolution": "Five reserves acquire five owners and five ordinary uses. Pip touches the page beside the poem, then takes the wing away so the ink can dry. Brindle says the bench needs one more rung, not because it is unfinished enough to earn a minute, but because somebody could catch a sleeve there. The ledger replaces MINOR REMAINDERS with RESERVED BY THEIR OWNERS. Ada leaves space beneath the heading for people whose projects the gate has never thought to record."
  },
  "last_cipher": {
    "narrative": "Under the polished declaration that you lack enough time, another inscription survives in little hollows the cleaning brushes could not reach. Its lettering is practical and badly centred. Whoever first built the threshold expected hands to touch it. Whoever maintained it afterward expected faces to admire it. The surviving charter has eight lines and two instructions disguised as an index.\n\nLady Supine watches from the jar beside the account book. She says she did not order the old words erased. Ada agrees that this is probably true. A clerk could have improved the surface, a second clerk improved the record, and a third mistaken the improvements for the reason the gate existed. “But you kept benefiting,” Ada adds. The jar remains quiet long enough for the observation to arrive without a ready answer.\n\nPip reads the charter in the voice used for a poem that has not decided whether to rhyme. It does not promise everlasting life. It describes a relationship between a person, a promise, and the day that might follow. The indexed words are operating instructions, not a judgment upon your preferred ending. Decode both before you ask the gate to interpret its final rule. A country that has used the same answer for generations deserves at least to hear the original question in full.",
    "resolution": "The charter yields words that do not describe a single wealthy traveller. Nor do they erase the difference between one life and another. The threshold recognises the old vocabulary and opens its accounting drawers. Supine asks whether the instructions apply to her too. Brindle says a jar takes less room on the bench than the castle did. She objects to the comparison, then asks whether there would be a cushion. There would. Nobody promises a throne."
  },
  "last_balance": {
    "narrative": "Five envelopes emerge from the gate, each fastened with a smiling miniature portrait of Supine. The portraits blow kisses when the seals loosen, but these kisses carry no new time. They are receipts for the ninety minutes the threshold already holds from people it refused. Even its generosity has been printed onto somebody else's account.\n\nAda spreads the envelopes beneath the ledger. They describe separate obligations: an ordinary household, a patient whose future was suspended, the threshold's existing price, a common remainder, and a disputed return. The names have been withheld because publication should not become another way to expose frightened people. The amounts can still be reconciled from the surviving relationships. You do not need your friends to empty their pockets again. You do not need to persuade the Hospital that one patient is more deserving than another.\n\nThe gate calls the calculation an allocation. Ada calls it a description. You have not yet chosen which legal claims should continue or what form a shared account might take. Solving the amounts establishes what is present and what is owed, so the final choice can be made with open eyes. Brindle steadies the envelopes against the wind. Pip asks whether the wind has to be entered as an expense. The gate begins to answer, then stops itself.",
    "resolution": "The ninety minutes reconcile without an extra contribution. Thirty is the old threshold price; its presence in an envelope does not prove the price is fair. The other claims remain visible instead of disappearing inside the total. Ada writes CALCULATION COMPLETE, AUTHORIZATION PENDING across the seals. Supine reads it twice. She is accustomed to a number becoming an order as soon as she likes it. Here, an accurate sum gives you information and waits for a decision."
  },
  "last_sequence": {
    "narrative": "The ledger's closing instructions are scattered across two pages. One page belongs to the account clerk, the other to the appeals clerk who tried to make sure the first clerk could be corrected. Neither page is signed by Supine. Both carry her seal. The difference explains much of the land, although it excuses none of the people who found the arrangement convenient.\n\nThe seven actions protect different things. An original entry establishes a person. Copies must be identified before a doubled claim can make a reserve look excessive. A protected reserve must be sealed before a conditional pledge is released. The public receives an honest total, while the private owners retain their names. A shared account may then be authorised from what can freely be shared. Finally, the decision must remain open until everyone knows what those actions accomplished.\n\nThis order preserves either choice you made at Brindle's bench. An accepted pledge can return to its living owners. An unspent offer can remain evidence of friendship without becoming a charge. Pip says the gate must learn that offering the last of something is not the same as asking to disappear. Brindle nods so slowly that you can see how much the distinction cost him to leave unspoken. Ada waits for your arrangement before entering any permanent instruction.",
    "resolution": "The two clerks' pages form one careful order. It cannot be shortened by calling a refund generosity, or by calling a published total permission to seize its parts. The gate marks the instructions VALID FOR MORE THAN ONE PERSON. That should always have been possible. Pip squeezes Brindle's hand. Ada enters the schedule under your four names, then adds a space for an additional witness. The Lady asks whether her name belongs there. It does."
  },
  "last_route": {
    "narrative": "The floor before the gate rearranges itself into seven rows of tiles. On the black tiles are miniature proclamations of exclusive ownership: this road belongs to its toll, this name belongs to its register, this promise belongs to the person who can collect it. They are claims written onto a place where people are trying to walk. You need not refute each one aloud. You can show a route that does not require any of them.\n\nFour stations stand on the open tiles. A name must be heard before its reserve can be protected. The reserve must be protected before an offer can be recognised as freely made. The offer must be heard before the final choice can remain yours. Entering a later station too soon would repeat the gate's old error: treating consent as a number that can be filled in afterward.\n\nYour companions wait for you to trace the safe route across the model. Nobody will be spent on an incorrect trial. Brindle holds Pip's folded poem out of the wind. Ada holds the jar where Supine can see the board, though the Lady has to ask for the angle she wants. The route ends at a threshold, not at a verdict. There are sixteen steps available; the country beyond them may still be finite.",
    "resolution": "The route carries each witness to the threshold in order. Your names have not merged into a larger purchaser. Your reserves have not become proof that other people should receive less. The gate records a valid approach that includes an offer and leaves a choice. Supine says the path is inelegant. Then she asks whether elegance has ever been one of its conditions. Ada checks the plan. It has not. The Lady studies the route again without correcting it."
  },
  "last_circuit": {
    "narrative": "The gate's last drawer holds a familiar grid. The castle used these lights to assign a watcher to every movement. Here they assign a proprietor to every possible next moment. A lit square does not mean that moment exists; it means somebody has claimed the authority to sell it. Neighbouring claims sustain one another. A collector needs a keeper, a keeper needs a register, a register needs a gate that turns people back.\n\nThis panel is a simulation, separated from the actual reservoirs. Darkening it will demonstrate that the account can continue without a single owner. It will not decide that you must create a common future, cross into the unmeasured country, or go home. Those remain different choices. The Lady notices that difference before anybody explains it. “You are making it possible,” she says, “and then you will decide whether you want it.”\n\nPip says that sounds like making a poem. Brindle says it sounds like building a bench before knowing who will sit there. Ada says most careful things begin that way. Supine looks annoyed by how many answers there are. She looks less annoyed when none of them needs to defeat the others. Clear the coupled claims and leave the mechanisms intact. Whatever future you choose should be able to count its minutes without appointing a divinity to own them.",
    "resolution": "The grid goes dark, but the account remains readable. Nobody's name disappears. No patient's reserve falls to zero. The mechanism can count without a throne above it. Supine asks what a Keeper would do in such a country. Pip suggests keeping somebody company. The Lady gives the suggestion the long, difficult attention she usually reserves for her own work. You close the simulation drawer. The final gate still awaits your decision, and now it has enough information to hear it."
  }
};

const EVIDENCE: Record<string, Evidence[]> = {
  "palace_ledger": [
    {
      "title": "Station plan",
      "text": "From west to east the five posts are Bell, Chair, Door, Window, Pipe. Every minder occupies exactly one post and expects exactly one sound; every post and sound is used once."
    },
    {
      "title": "Relief slips",
      "text": "Rook stands immediately east of Hush. Velvet stands west of Hush. Sable stands east of Rook. Quill does not occupy Window."
    },
    {
      "title": "Sound observations",
      "text": "Hush expects Tick. Hum comes from immediately east of Rain. Sigh comes from immediately east of Tick. Chime does not come from Bell. Velvet does not expect Rain."
    }
  ],
  "palace_cipher": [
    {
      "title": "Eight lines of the relief book",
      "text": "1. Under the cameras every sleeper must pretend that stillness is praise.\n2. No window opens until someone has approved the shape of daylight.\n3. We record each silence because no one should be lonely unseen.\n4. The chair remembers a woman who once preferred a crooked drawing.\n5. Children may finish songs when an adult cannot bear their ending.\n6. Let curtains shelter ordinary faces without announcing whose eyes are closed.\n7. A welcome requires a door and somebody willing to hear footsteps.\n8. The watchers deserve a morning that does not depend on watching."
    },
    {
      "title": "Indexing rule",
      "text": "Each group means line.word.letter, counted from one. Count words separated by spaces; ignore punctuation. Take that letter, then read groups from left to right. MODE and REPLY are separate words. Nothing is reversed or shifted."
    }
  ],
  "palace_balance": [
    {
      "title": "Measured quiet",
      "text": "These are beats of masking rhythm, not stolen minutes. Every station receives a whole, nonnegative number of beats. All five station allocations are separate; do not count a combined observation as a sixth station."
    },
    {
      "title": "Calibration restrictions",
      "text": "The five conditions shown beside the board all hold at once. A larger total can be louder even when its sources are softer. Keep the total at forty-four; the relief bell will reject both overfilling and underfilling."
    }
  ],
  "palace_sequence": [
    {
      "title": "Camera memorandum",
      "text": "Mirror is immediately before Water. Exactly one action occurs between Water and Curtain. Broadcast occurs after Curtain, but Broadcast is not last. Door occurs after Broadcast."
    },
    {
      "title": "Relief memorandum",
      "text": "Witness is earlier than Mirror. Bell occurs after Mirror and before Curtain. Every action happens once; all seven positions must be filled. The memoranda describe one schedule, not two alternative schedules."
    }
  ],
  "palace_route": [
    {
      "title": "Observation tiles",
      "text": "Black tiles carry a live sightline or an acoustic wire; crossing any of them alerts a minder. Other tiles are safe. Move horizontally or vertically, without revisiting a tile. The drawing uses an eight-by-eight floor."
    },
    {
      "title": "Witness stations",
      "text": "Visit the four numbered stations in order: felt landing, water mirror, curtain cleat, guest bell. Then reach the inner door. You have eighteen steps, including each move from the starting tile. A later station cannot be entered early."
    }
  ],
  "palace_circuit": [
    {
      "title": "Coupled shutters",
      "text": "Pressing a shutter flips that square and its orthogonal neighbours. Corners have two neighbours, edges three, interior squares four. Diagonals never change. The lamps must all be dark; a lamp indicates observation, not illumination."
    },
    {
      "title": "Keeper’s correction",
      "text": "A press can be undone by pressing the same square again. Work across the top row, then use the row below to clear any remaining lamps above it. The lowest row determines whether your chosen top-row presses were right."
    }
  ],
  "last_ledger": [
    {
      "title": "Five ordinary projects",
      "text": "Each person has a distinct reserve from 6, 7, 9, 12, 16 minutes, and a distinct project: Poem, Bench, Repair, Curtain, Catalogue. These are documented protected reserves, not new charges on your pocket."
    },
    {
      "title": "Amount cross-references",
      "text": "The Bench reserve exceeds the Poem reserve by two. The Curtain reserve is twice the Repair reserve. Vellum has the greatest reserve. Ada’s reserve is smaller than Pip’s."
    },
    {
      "title": "People cross-references",
      "text": "In ascending order of reserves, Thimble immediately follows Brindle, and Vellum immediately follows Thimble. Pip’s project is neither Curtain nor Repair. Ada’s project is not Poem. Thimble’s project is not Catalogue."
    }
  ],
  "last_cipher": [
    {
      "title": "Eight lines of the first charter",
      "text": "1. A minute belongs to whoever is alive enough to spend it.\n2. A promise belongs to everyone whose name can answer its invitation.\n3. The future is no cupboard for the richest hand to lock.\n4. Even a borrowed watch should return with its owner still present.\n5. We can share a road without making every footstep last forever.\n6. There are endings that open windows instead of settling all accounts.\n7. Keep one chair empty because another traveller may still be coming.\n8. Let each tomorrow begin where somebody asks how you slept tonight."
    },
    {
      "title": "Reading rule",
      "text": "Each group means line.word.letter, counted from one. Words are separated by spaces and punctuation is ignored. Read each indicated letter in order. MODE and REPLY produce two separate words. Do not change, reverse, or substitute any letters."
    }
  ],
  "last_balance": [
    {
      "title": "Existing funds only",
      "text": "The ninety minutes are already in the gate’s escrow. No friend pays into this calculation. These five envelopes are a model of the escrow’s obligations, and they partition it completely. Use whole, nonnegative minutes."
    },
    {
      "title": "What the envelopes do",
      "text": "Return marks a disputed refund, Hospital a suspended patient’s claim, Household an ordinary livelihood, Threshold the existing gate price, Common a remainder no single owner may seize. The equations establish amounts; they do not authorize spending them."
    }
  ],
  "last_sequence": [
    {
      "title": "Account clerk’s marginalia",
      "text": "Choice is last. Pool is immediately before Choice. Copies is immediately before Protect. Refund occurs exactly two positions after Copies. Original is before Copies."
    },
    {
      "title": "Appeals clerk’s correction",
      "text": "Refund is after Protect and before Declare. Declare is before Pool. Each action occurs once. An offered reserve must be protected before its conditional pledge is released; publication is never permission to confiscate."
    }
  ],
  "last_route": [
    {
      "title": "The final floor",
      "text": "Black tiles are one-way ownership claims painted onto a floor that allows only ordinary walking. Avoid them. Move orthogonally, never revisit a tile, and visit numbered stations in order before reaching the open threshold."
    },
    {
      "title": "Four witnesses",
      "text": "The stations record a name, a protected reserve, an uncollected offer, and a choice left open. Their order matters: ownership cannot be renounced before its owner is heard. The seven-by-seven plan permits at most sixteen moves from the starting tile."
    }
  ],
  "last_circuit": [
    {
      "title": "Common routing",
      "text": "A press toggles its own lamp and the lamps immediately above, below, left, and right when those neighbours exist. Every lamp must end dark. Darkness means no private proprietor is assigned; it does not mean the minutes are destroyed."
    },
    {
      "title": "A reversible experiment",
      "text": "These are routing simulations. You may undo a press with another press on the same square. Clear a high row by pressing beneath its lit lamps. If the bottom row remains lit, reconsider the initial top-row choices rather than spending anyone’s time."
    }
  ]
};

function stage(id: string, board: InvestigationBoard): InvestigationChallenge {
  const [title, task] = META[id];
  return { id, title, task, narrative: paragraphs(WRITING[id].narrative), evidence: EVIDENCE[id], board, hints: HINTS[id], resolution: paragraphs(WRITING[id].resolution), minutes: { min: 3, typical: 5, max: 9 } };
}

const META: Record<string, [string, string]> = {
  "palace_ledger": [
    "The ears assigned to the walls",
    "Reconstruct the five minders’ posts and expected sounds."
  ],
  "palace_cipher": [
    "A vocabulary for being unseen",
    "Decode the relief register’s mode and reply words."
  ],
  "palace_balance": [
    "A measured roomful of quiet",
    "Allocate the masking beats so every calibration condition holds."
  ],
  "palace_sequence": [
    "The order of a merciful interruption",
    "Arrange the seven relief actions into the one authorized schedule."
  ],
  "palace_route": [
    "The room between observations",
    "Trace a safe route through the observation floor."
  ],
  "palace_circuit": [
    "The audience switches off",
    "Darken all twenty-five observation lamps."
  ],
  "last_ledger": [
    "The reserves belonging to lives",
    "Match every protected reserve to its owner and unfinished work."
  ],
  "last_cipher": [
    "Words beneath the last polish",
    "Decode the original charter’s two surviving instruction words."
  ],
  "last_balance": [
    "Ninety minutes already here",
    "Reconcile the five envelopes without charging any friend."
  ],
  "last_sequence": [
    "A future before its price",
    "Arrange the seven accounting protections in their lawful order."
  ],
  "last_route": [
    "Four people through one sentence",
    "Bring the four witnesses to the threshold in the required order."
  ],
  "last_circuit": [
    "An account without a Keeper",
    "Remove the final grid of exclusive ownership assignments."
  ]
};

const HINTS: Record<string, [string, string, string]> = {
  "palace_ledger": [
    "Begin with the adjacent pairs: Rook after Hush, and Sigh after Tick. Those two pairs describe the same posts because Hush hears Tick.",
    "Try Hush at Chair, then at Door. The Rain-Hum pair, Chime’s restriction, and Velvet’s restriction eliminate the earlier placement.",
    "Quill: Bell/Rain. Velvet: Chair/Hum. Hush: Door/Tick. Rook: Window/Sigh. Sable: Pipe/Chime."
  ],
  "palace_cipher": [
    "Use the first number to find a numbered line, the second to count its words, the third to count letters within that word.",
    "Punctuation is never a letter. For example, a final period does not add to the length of its word. Decode each label independently.",
    "MODE is UNWATCHED. REPLY is WELCOME."
  ],
  "palace_balance": [
    "Call the wall w and drum d. The bell is w+d, while the bell plus drum equals eighteen.",
    "Use chair=w−1 and water=2d+1. The total becomes 3w+4d=44; compare that with w+2d=18.",
    "Wall felt 8; Bell cradle 13; Drum skin 5; Water tray 11; Chair runners 7."
  ],
  "palace_sequence": [
    "Broadcast must be sixth and Door seventh: Curtain precedes Broadcast, and Door follows it.",
    "Water must be third, with Bell occupying the single gap before Curtain. Witness and Mirror fill the two earlier positions.",
    "Witness → Mirror → Water → Bell → Curtain → Broadcast → Door."
  ],
  "palace_route": [
    "Plan backwards from the fourth station and the inner door. Do not enter the fourth station while still collecting earlier ones.",
    "The third station is reached from above, then the path bends east and north before approaching the fourth from below.",
    "Rows and columns count from 1: (8,1) → (7,1) → (6,1) → (6,2) → (6,3) → (5,3) → (4,3) → (3,3) → (3,4) → (3,5) → (3,6) → (4,6) → (4,7) → (4,8) → (3,8) → (2,8) → (2,7) → (1,7) → (1,8)."
  ],
  "palace_circuit": [
    "The grid is coupled: switch changes, not individual desired lamp states. Try clearing rows from the top.",
    "A complete solution uses ten different switches. If you restart, its first-row presses are columns 1 and 3.",
    "After resetting, press these row/column positions once each, counting from 1: (1,1), (1,3), (2,2), (2,4), (3,1), (3,3), (4,2), (4,4), (5,3), (5,5)."
  ],
  "last_ledger": [
    "Only 6 and 12 can be the doubled Repair and Curtain pair. Only 7 and 9 can be the Poem and Bench pair.",
    "Vellum has 16. The consecutive Brindle–Thimble–Vellum chain must therefore be 9–12–16. Ada is smaller than Pip.",
    "Pip: 7/Poem. Brindle: 9/Bench. Ada: 6/Repair. Thimble: 12/Curtain. Vellum: 16/Catalogue."
  ],
  "last_cipher": [
    "Each coordinate points at an actual letter in the charter. Keep a separate line of decoded letters for each label.",
    "Use one-based counting for all three numbers. Spaces separate words; punctuation contributes nothing.",
    "MODE is TOGETHER. REPLY is TOMORROW."
  ],
  "last_balance": [
    "Let the Return envelope be r. Then Common=2r and Threshold=3r.",
    "Hospital=r+8. Because Household+Hospital=Threshold, Household=2r−8. Sum all five envelopes.",
    "Household 12; Hospital 18; Threshold 30; Common 20; Return 10."
  ],
  "last_sequence": [
    "Pool and Choice occupy positions six and seven. Keep Copies immediately next to Protect.",
    "Refund is one position after Protect. Original must precede that three-card run, and Declare must follow it.",
    "Original → Copies → Protect → Refund → Declare → Pool → Choice."
  ],
  "last_route": [
    "The first station is approached from its west side. Reach the second from below.",
    "After the second station, move east twice and then south to the third. Circle its east side to approach the fourth from below.",
    "Rows and columns count from 1: (7,1) → (6,1) → (5,1) → (5,2) → (5,3) → (4,3) → (3,3) → (3,4) → (3,5) → (4,5) → (4,6) → (4,7) → (3,7) → (2,7) → (2,6) → (1,6) → (1,7)."
  ],
  "last_circuit": [
    "Each press affects a cross. Clear a row by pressing below its lit cells, rather than trying to clear it in place.",
    "A complete solution uses ten different switches. On a fresh board its first-row presses are columns 2 and 5.",
    "After resetting, press these row/column positions once each, counting from 1: (1,2), (1,5), (2,1), (2,5), (3,2), (3,4), (4,1), (4,5), (5,1), (5,4)."
  ]
};

const dark = Array<boolean>(25).fill(false);
const scrambled = (presses: number[]): boolean[] => presses.reduce((lamps, cell) => toggleCircuit(lamps, cell, 5), dark);

export const INVESTIGATIONS_LATE: Investigation[] = [
  { id: "listening_castle", act: 5, title: "The Castle That Watches Itself Sleep", subtitle: "Find a merciful way through perfect attention.", location: "castle", premise: paragraphs("At the servants' entrance of the Great Castle Divine, attention hangs upside down in velvet uniforms. The Aristobats hear the ticking in your pocket and the pauses between your friends' words. Inside, cameras record Lady Supine in a room that has no officially recognised interval for sleep. Nobody seems to know who is allowed to stop first.\n\nAda finds the old relief procedure. It can release the minders, preserve an honest record, and admit a guest while protecting the Lady from an audience. The procedure requires observation, calculation, and a careful walk through the castle's hidden geometry. You will not have to silence a living throat.\n\nPip opens the little relief book. Brindle puts down his bag of lunches. Beyond the screens waits a woman who has become unable to distinguish being seen from being cared for. The sleeping chamber must be reached before the mind exchange can be considered."), challenges: [
    stage("palace_ledger", {
  "kind": "ledger",
  "rows": [
    {
      "id": "hush",
      "title": "Hush"
    },
    {
      "id": "rook",
      "title": "Rook"
    },
    {
      "id": "velvet",
      "title": "Velvet"
    },
    {
      "id": "quill",
      "title": "Quill"
    },
    {
      "id": "sable",
      "title": "Sable"
    }
  ],
  "columns": [
    {
      "id": "post",
      "title": "Listening post",
      "options": [
        "Bell",
        "Chair",
        "Door",
        "Window",
        "Pipe"
      ]
    },
    {
      "id": "sound",
      "title": "Expected sound",
      "options": [
        "Rain",
        "Hum",
        "Tick",
        "Sigh",
        "Chime"
      ]
    }
  ],
  "solution": {
    "hush.post": "Door",
    "hush.sound": "Tick",
    "rook.post": "Window",
    "rook.sound": "Sigh",
    "velvet.post": "Chair",
    "velvet.sound": "Hum",
    "quill.post": "Bell",
    "quill.sound": "Rain",
    "sable.post": "Pipe",
    "sable.sound": "Chime"
  }
}),
    stage("palace_cipher", {
  "kind": "cipher",
  "inscription": "MODE: 1.6.2 / 8.9.5 / 3.1.1 / 4.2.3 / 5.10.1 / 7.2.4 / 5.10.2 / 7.11.7 / 6.11.6\nREPLY: 2.2.1 / 4.7.4 / 1.9.5 / 6.11.1 / 5.4.2 / 1.6.1 / 1.4.3",
  "fields": [
    {
      "id": "mode",
      "label": "Mode word"
    },
    {
      "id": "reply",
      "label": "Reply word"
    }
  ],
  "solution": {
    "mode": "unwatched",
    "reply": "welcome"
  }
}),
    stage("palace_balance", {
  "kind": "balance",
  "fields": [
    {
      "id": "wall",
      "label": "Wall felt",
      "min": 0,
      "max": 44,
      "suffix": "beats"
    },
    {
      "id": "bell",
      "label": "Bell cradle",
      "min": 0,
      "max": 44,
      "suffix": "beats"
    },
    {
      "id": "drum",
      "label": "Drum skin",
      "min": 0,
      "max": 44,
      "suffix": "beats"
    },
    {
      "id": "water",
      "label": "Water tray",
      "min": 0,
      "max": 44,
      "suffix": "beats"
    },
    {
      "id": "chair",
      "label": "Chair runners",
      "min": 0,
      "max": 44,
      "suffix": "beats"
    }
  ],
  "equations": [
    "All five allocations total 44 beats.",
    "The bell cradle receives the wall felt plus the drum skin.",
    "The bell cradle and drum skin together receive 18 beats.",
    "The water tray receives twice the drum skin plus one beat.",
    "The wall felt receives one beat more than the chair runners."
  ],
  "solution": {
    "wall": "8",
    "bell": "13",
    "drum": "5",
    "water": "11",
    "chair": "7"
  }
}),
    stage("palace_sequence", {
  "kind": "sequence",
  "cards": [
    {
      "id": "door",
      "title": "Open the inner door",
      "description": "Only the room’s own guest bell may speak."
    },
    {
      "id": "curtain",
      "title": "Draw the velvet curtain",
      "description": "The mirror must no longer return a live face."
    },
    {
      "id": "witness",
      "title": "Register a relief witness",
      "description": "A named person accepts responsibility for the record."
    },
    {
      "id": "broadcast",
      "title": "Retire the public broadcast",
      "description": "Channel 9 receives an authenticated still image."
    },
    {
      "id": "water",
      "title": "Set the water tray",
      "description": "Its reflection absorbs the witness lamp."
    },
    {
      "id": "bell",
      "title": "Unhitch the duty bell",
      "description": "The relieved minders may leave their stations."
    },
    {
      "id": "mirror",
      "title": "Turn the observation mirror",
      "description": "The glass reflects the room, not its occupant."
    }
  ],
  "solution": [
    "witness",
    "mirror",
    "water",
    "bell",
    "curtain",
    "broadcast",
    "door"
  ]
}),
    stage("palace_route", {
  "kind": "route",
  "width": 8,
  "height": 8,
  "blocked": [
    0,
    1,
    2,
    3,
    8,
    10,
    11,
    12,
    16,
    17,
    22,
    24,
    25,
    27,
    28,
    32,
    33,
    35,
    36,
    38,
    44,
    45,
    46,
    49,
    50,
    52,
    53,
    54,
    57,
    58,
    60,
    61
  ],
  "start": 56,
  "end": 7,
  "waypoints": [
    42,
    19,
    29,
    6
  ],
  "maxSteps": 18,
  "solution": [
    56,
    48,
    40,
    41,
    42,
    34,
    26,
    18,
    19,
    20,
    21,
    29,
    30,
    31,
    23,
    15,
    14,
    6,
    7
  ]
}),
    stage("palace_circuit", { kind: "circuit", size: 5, initial: scrambled([0, 2, 6, 8, 10, 12, 16, 18, 22, 24]), target: [...dark], solution: [0, 2, 6, 8, 10, 12, 16, 18, 22, 24] }),
  ], conclusion: paragraphs("The castle's layers remain standing, but their attention has stopped converging on a single exhausted face. The minders have supper. The corridor has a safe passage. The inner room has a doorbell that a visitor can use without summoning a country.\n\nYou keep the relief procedure available for others. Beyond the door, Supine can hear Brindle's tune as music. Ada checks the doctor's continuity plan once more. A sleeping person is still a person; the work ahead must remember that.") },
  { id: "common_tomorrow", act: 6, title: "The Last Ledger Belongs to Nobody", subtitle: "Count the people before deciding what time is for.", location: "infinite", premise: paragraphs("Your friends have offered the last of their time. Whether you accepted their pledge or asked them to keep it, the offer has been heard. Pip's button, Brindle's string, and Ada's watch spring sit together beside a ledger that has no column for what they mean.\n\nThe final gate holds ninety minutes collected from travellers it refused. It still describes admission as something one sufficiently wealthy person may purchase. Before you choose a future, you must read its surviving accounts: whose reserves were protected, whose names were copied, which claims describe existing funds, and which claims simply presume authority.\n\nSupine listens from her jar. This investigation will not tell you to create a commons, enter the unmeasured country, or return to ordinary days. It will make each choice possible without using your friends as its price. First, the gate must count people carefully enough to leave them present."), challenges: [
    stage("last_ledger", {
  "kind": "ledger",
  "rows": [
    {
      "id": "pip",
      "title": "Pip"
    },
    {
      "id": "brindle",
      "title": "Brindle"
    },
    {
      "id": "ada",
      "title": "Ada"
    },
    {
      "id": "thimble",
      "title": "Thimble"
    },
    {
      "id": "vellum",
      "title": "Vellum"
    }
  ],
  "columns": [
    {
      "id": "reserve",
      "title": "Protected reserve",
      "options": [
        "6",
        "7",
        "9",
        "12",
        "16"
      ]
    },
    {
      "id": "purpose",
      "title": "Unfinished work",
      "options": [
        "Poem",
        "Bench",
        "Repair",
        "Curtain",
        "Catalogue"
      ]
    }
  ],
  "solution": {
    "pip.reserve": "7",
    "pip.purpose": "Poem",
    "brindle.reserve": "9",
    "brindle.purpose": "Bench",
    "ada.reserve": "6",
    "ada.purpose": "Repair",
    "thimble.reserve": "12",
    "thimble.purpose": "Curtain",
    "vellum.reserve": "16",
    "vellum.purpose": "Catalogue"
  }
}),
    stage("last_cipher", {
  "kind": "cipher",
  "inscription": "MODE: 2.10.2 / 8.8.2 / 2.3.6 / 7.4.1 / 3.7.1 / 6.1.2 / 5.8.3 / 8.5.4\nREPLY: 1.11.2 / 4.3.5 / 2.2.4 / 6.6.5 / 4.3.3 / 2.9.6 / 1.5.3 / 4.9.2",
  "fields": [
    {
      "id": "mode",
      "label": "Mode word"
    },
    {
      "id": "reply",
      "label": "Reply word"
    }
  ],
  "solution": {
    "mode": "together",
    "reply": "tomorrow"
  }
}),
    stage("last_balance", {
  "kind": "balance",
  "fields": [
    {
      "id": "house",
      "label": "Household envelope",
      "min": 0,
      "max": 90,
      "suffix": "minutes"
    },
    {
      "id": "ward",
      "label": "Hospital envelope",
      "min": 0,
      "max": 90,
      "suffix": "minutes"
    },
    {
      "id": "threshold",
      "label": "Threshold envelope",
      "min": 0,
      "max": 90,
      "suffix": "minutes"
    },
    {
      "id": "common",
      "label": "Common envelope",
      "min": 0,
      "max": 90,
      "suffix": "minutes"
    },
    {
      "id": "return",
      "label": "Return envelope",
      "min": 0,
      "max": 90,
      "suffix": "minutes"
    }
  ],
  "equations": [
    "The five envelopes together contain the 90 minutes already held in the gate’s escrow.",
    "The Hospital envelope exceeds the Return envelope by 8 minutes.",
    "The Common envelope is twice the Return envelope.",
    "The Household and Hospital envelopes together equal the Threshold envelope.",
    "The Threshold envelope equals the Common and Return envelopes together."
  ],
  "solution": {
    "house": "12",
    "ward": "18",
    "threshold": "30",
    "common": "20",
    "return": "10"
  }
}),
    stage("last_sequence", {
  "kind": "sequence",
  "cards": [
    {
      "id": "choice",
      "title": "Leave the choice open",
      "description": "No future is chosen until every account is readable."
    },
    {
      "id": "refund",
      "title": "Restore conditional pledges",
      "description": "Offered minutes remain attached to living owners."
    },
    {
      "id": "original",
      "title": "Read the original entry",
      "description": "A person’s name survives even if its paper has been copied."
    },
    {
      "id": "pool",
      "title": "Authorize a shared account",
      "description": "Only freely offered surplus can enter it."
    },
    {
      "id": "protect",
      "title": "Seal protected reserves",
      "description": "Being generous never cancels a person’s own tomorrow."
    },
    {
      "id": "declare",
      "title": "Publish the total",
      "description": "Publish the sum without broadcasting private names."
    },
    {
      "id": "copies",
      "title": "Mark the copied entries",
      "description": "Mirrored certificates describe one minute twice."
    }
  ],
  "solution": [
    "original",
    "copies",
    "protect",
    "refund",
    "declare",
    "pool",
    "choice"
  ]
}),
    stage("last_route", {
  "kind": "route",
  "width": 7,
  "height": 7,
  "blocked": [
    0,
    1,
    2,
    7,
    8,
    9,
    10,
    14,
    15,
    19,
    21,
    22,
    24,
    31,
    32,
    33,
    36,
    37,
    38,
    40,
    43,
    44,
    45,
    46
  ],
  "start": 42,
  "end": 6,
  "waypoints": [
    30,
    16,
    25,
    5
  ],
  "maxSteps": 16,
  "solution": [
    42,
    35,
    28,
    29,
    30,
    23,
    16,
    17,
    18,
    25,
    26,
    27,
    20,
    13,
    12,
    5,
    6
  ]
}),
    stage("last_circuit", { kind: "circuit", size: 5, initial: scrambled([1, 4, 5, 9, 11, 13, 15, 19, 20, 23]), target: [...dark], solution: [1, 4, 5, 9, 11, 13, 15, 19, 20, 23] }),
  ], conclusion: paragraphs("The ledger is legible. Protected reserves retain their owners. Conditional offers retain their meaning without requiring anyone to vanish. The ninety minutes in escrow cannot disguise a theft as a gift merely by passing through a smiling seal.\n\nThe gate can now recognise more than one future. You may ask time to become common, cross together into the country without measures, or keep finite days beside the bench. Your friends will hear the choice as people. The Lady waits to hear it too.") },
];
