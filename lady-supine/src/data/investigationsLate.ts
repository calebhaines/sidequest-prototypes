import { toggleCircuit, type Investigation, type InvestigationBoard, type InvestigationChallenge, type Evidence } from './investigationTypes';

const paragraphs = (text: string): string[] => text.trim().split(/\n\s*\n/);
type Writing = { narrative: string; resolution: string };
const WRITING: Record<string, Writing> = {
  "palace_ledger": {
    "narrative": "Ada finds the duty register in a medicine cupboard labelled NO PRIVATE READING. The door has been taken away to repair a floor. Five Aristobats are named, although only two hang above the entrance. The others listen through rubber tubes buried in walls assembled from caravan panels and packing board. Their hearing is excellent. Their judgment has been replaced by this register. A sigh at the assigned station proves satisfactory repose; the same sigh elsewhere is entered as a possible grievance. The hours beside the names continue beyond the space allowed for a shift.\n\nBrindle carried these tubes uphill years ago. He was told they were heating pipes. One still bears the dent where his horn steadied it, beneath a skin of gold paint. The hospital had been cold that winter. He remembers saying that somebody would be warm at last. He folds the cloth over his horn and cannot look at Ada. Pip puts a wing against his wrist. Neither of them finds a sentence that can make the work harmless now. In the next room somebody coughs and immediately apologises to the tube.\n\nThe relief slips have lost their station labels. Reconstructing them will tell you which harmless sound each minder has been trained to accept. A recognised relief is the only opening the machinery permits. Loudness would punish the ears of people already kept awake for days. Brindle has brought a little food, wrapped in pages from an old permit. The gate of a palace should not depend on whether a tired guard has eaten. Here it might.",
    "resolution": "The five assignments fit. A pencil stops moving behind the wall. “Relief acknowledged,” says a voice so worn you mistook it for the draught. Quill asks whether food is included. Brindle opens the bag: enough, if he does not eat. He gives his portion away before anybody can count it. The first opening in the Great Castle Divine is the width of a cupboard door somebody could no longer afford to keep."
  },
  "palace_cipher": {
    "narrative": "Inside the register is a smaller book printed before Supine's face became the watermark of every official sheet. Instructions for a Room Containing a Person is stamped on its cover. Person has been crossed out and replaced with Presence. Someone tried to restore the first word with a wet pen; the paper tore. Through the tear you can see the numbered lines on the other side. A corner has been burnt, probably beside a heater kept too close to a bed. Even the palace has never had enough sockets.\n\nPip reads quietly. The old instructions insist that a camera is not company, a chair is not a duty, a doorway need not be an altar. Those are things a person should have been able to say without a code. Ada recognises the index from clock inventories: a word survives as coordinates while a censor sees a harmless table. Under the copyist's signature is a second stamp, EMPLOYMENT ENDED. Nobody has written a forwarding address. The moth smooths the page as if the absent hand might still need room to finish.\n\nThe register requires two words before it will recognise an interval without observation. One describes the interval; the other admits a visitor. Neither conveys ownership of the room or the woman inside it. Ada keeps the doctor's continuity plan beneath the book. Beyond the door waits an actual human body, with an enormous head and an opening through which a living brain can be removed. There is nothing figurative about what you intend to do. Decode the old pause in watching before you bring that plan any closer to her flesh.",
    "resolution": "The two words leave a narrow legal interval in which a body need not produce an image. Pip copies them on the back of a ration notice. “Somebody lost their place for writing this,” he says. The register does not contain a reinstatement procedure. Ada puts the words beside the doctor's plan. You have recovered an instruction, not the person who first tried to make it ordinary."
  },
  "palace_balance": {
    "narrative": "The palace walls are lined with felt salvaged from mattress undersides. It has been fitted to carry sound inward. Outside, an Aristobat hears a tenant whisper through a thin wall. Inside, Supine's smallest movement passes into a speaking tube. Brindle rests a palm against one panel. It gives under his weight; a strip of painted paper is the only thing joining it to the next. The Great Castle Divine is a row of old trailers with its gaps declared decorative. Its listening system is better maintained than its plumbing.\n\nThe maintenance panel lists five ways to interrupt the carrying: soften a wall, cradle a bell, slacken a drum, lay water under a tube, cushion the watching chair's runners. Allocations are measured in beats because the devices must share a rhythm. Too little leaves a live channel. Too much announces an obstruction. Ada copies all five calibration conditions before the display replaces them with the Lady's face. A loose wire behind the display ticks against exposed metal. There is a notice forbidding workers to mention that sound on Channel 9.\n\nThe runners have worn through the floor where Supine stands up and sits down to remain visibly available. Nobody has installed a setting for being tired. Brindle offers the low hum he uses while repairing somebody's last chair. It can occupy a listening tube without damaging the listener. He is hungry enough that the first note shakes. Pip holds the water tray level. Allocate the masking beats precisely; a failed calculation will make all their small efforts legible to the wrong people.",
    "resolution": "The hum reaches every tube at its permitted strength. Ticking and sighs stop arriving as offences. Behind the glass, an Aristobat removes his duty collar. The fur beneath it has been rubbed away. He asks how long the relief lasts, then sits before you can answer. Brindle lowers his voice to save his breath. The interval is sufficient for your visit. It will not restore the years these rooms have taken from anyone."
  },
  "palace_sequence": {
    "narrative": "Seven handles have been screwed into an old kitchen counter. The labels call it the Divine Control Desk. Beneath the gilt edging you can see the ring left by a hot pan. A card warns that an unauthorised sequence will be broadcast as an attack on the Lady. A later card corrects the first: any sequence absent from the register is unauthorised. There is still a blank line. Relief has survived as a procedure so burdensome that nobody has the strength or spare hours to request it.\n\nEach handle protects against a different accusation. A witness establishes that the room has not been abandoned. The mirror supplies a truthful camera view without showing Supine's face. Water steadies that image. The bell releases the minders. A curtain covers the bed. A broadcast retires the public claim to watch her. Finally, the guest bell allows the inner door to answer. The mechanism reads actions only in their recorded order. A curtain drawn too early becomes concealment; a door opened too early becomes intrusion. Care has been divided into offences and then sold back as permission.\n\nAda refuses to register you alone. “They will put whatever happens afterward under one name,” she says. Pip signs beside you. Brindle's mark is difficult because his hand has started to cramp. The three signatures will remain here even if you leave. You are accepting responsibility for entering a real woman's room and handling her brain, not consenting to carry the blame for every choice she has made. Arrange the relief while that distinction still has a place on the form.",
    "resolution": "The seven actions satisfy both memoranda. Channel 9 briefly shows an empty chair with a correct label. Its audience counter remains enormous until the unit changes from viewers to connections. A country of unattended screens has been described as devotion. Pip asks who first recorded the distinction. The signature has been cut out. You leave the usable order on the desk, where another exhausted person might find it before their remaining time runs down."
  },
  "palace_route": {
    "narrative": "The plan unfolds in layers: the caravan floors, the listening wires, the camera cones, then a route labelled NOT CURRENTLY REQUESTED. The live sightlines are black. They crowd a corridor empty of bodies. Replacement panels have shortened two rooms and widened a passage that no longer reaches a door. Ada traces the remaining open tiles. The castle has been “updated” by workers paid to cover the last worker's repair. Every change has acquired a plaque. None has made a private place to sleep.\n\nThe route must pass four witness stations in order. The felt landing confirms softened sound. The water mirror confirms a truthful camera view. The curtain cleat confirms that no sleeping face appears in it. The guest bell confirms that a person is entering. A later confirmation cannot replace an earlier one. You must cross this little model according to its rules before the real corridor will cease reporting footsteps as an emergency. Black tiles contain live sightlines or acoustic wires, however harmless the patched surface looks.\n\nBrindle holds the curtain. Pip stays by the desk with the relief book, ready to answer if a minder asks a real question. Ada walks with you. Through the wall comes a fingernail tapping the chair arm: the noise of someone fighting sleep because sleep will be noticed. At the bend a little screen shows Supine's enormous human head from above. A dark aperture opens through its crown. That is where the exchange must happen. You have eighteen safe steps to reach the door. Ada's ears flatten as she sees where her own brain is supposed to go.",
    "resolution": "The guest bell sounds once. There is no announcement. Ada presses her palm against the wall until her breathing steadies. Supine asks from inside whether the broadcast has broken. You can tell her it has been relieved. That small truth is all the room can bear yet. The corridor remains passable on the return journey; nobody will have to remain at a station merely because they helped you reach the last one."
  },
  "palace_circuit": {
    "narrative": "Twenty-five little lights burn above the inner door. Their claims include public reassurance, archival continuity, medical supervision, protection of property, and protection of the image certifying that property. Switching one claim off wakes its neighbours. The circuit has been mended so often that the wires no longer match their colours. It still serves its purpose: there is always another reason to keep a woman under observation. There is never a box for her permission.\n\nSupine says the recordings began with a wonderful day. Later each day was compared with it. Eventually she arranged her face before a camera came on. “Nobody made me,” she says, quickly. You hear the chair shift. Then she asks whether the old recordings could tell a decision from something she no longer remembered choosing. Behind the question is the human ruler who made other people's exhaustion a broadcast spectacle. Her own captivity does not return the minutes she took. It does not make the hospital beds empty.\n\nThe relief register authorises every shutter, but the circuits remain coupled. Darken the grid without breaking the equipment needed for fire or illness. A pause in surveillance will let you approach her enormous open-topped skull. It will not replace Ada's consent, the doctor's safety protocol, or a promise to bring both brains back alive. Brindle's lullaby is waiting outside. He learnt it in a room where five people shared one heater. The tune has never caused a listener to be less hungry.",
    "resolution": "The last lamp goes dark. Supine stands, sways, and sits heavily on the bed. From this close, the opening at the top of her immense head is plainly an opening in a body. “You will say it was beautiful,” she tells you. Pip has no reply ready. Brindle begins the lullaby softly enough that it could be missed. You have ended the scheduled audience. The living brains, the exchange, and Ada's way home remain ahead of you."
  },
  "last_ledger": {
    "narrative": "The last gate opens an account book to MINOR REMAINDERS. Ada lays it across her knees between Pip and Brindle. Her own brain is back inside her own skull; the stitches still hurt when she turns. Supine's mind has been removed from Ada's body and kept living in its jar. Ada says little about the things her mouth said while it belonged to the Lady. She remembers hearing them from the huge human body in the castle and being unable to take her own hands away from their author.\n\nEach entry describes unfinished work, then gives a reason to seize its owner's reserve. A poem may be abandoned. A bench can wait. A repaired curtain is not essential. These are protected entries from the returned reservoir, not new payments. They do not alter the time in anybody's pocket or undo your decision about the friends' pledge. The gate needs the correct owner before it will stop presenting that reserve to the next impressive claimant. Five people have sent evidence: Pip's cramped handwriting, Brindle's page folded around a splinter, Ada's diagram of a spring that cannot be taken without stopping its clock.\n\nMrs. Thimble sends a piece of curtain whose old lining has been patched with flour sacks. Vellum sends a catalogue heading for a missing book. None calls the work grand. These were the things they hoped to finish before their heads hit the pillow. Reconstruct the five entries so a person can own that small remainder of a life without proving it would please the Lady. The gate will not account for the projects already abandoned by people who cannot answer.",
    "resolution": "Five reserves find their living owners. Pip touches the space beside his poem. Brindle says the bench needs one more rung because a sleeve could catch there; he can still imagine someone sitting down. MINOR REMAINDERS is replaced by RESERVED BY THEIR OWNERS. The heading leaves the old confiscations intact above it. Ada does not cross them out. There are people for whom correcting this ledger has come too late."
  },
  "last_cipher": {
    "narrative": "Beneath the polished refusal, another inscription survives where the cleaning brush could not reach. Its lettering is practical, poorly centred, and close enough to the floor for a waiting traveller to touch. The threshold was first built from a service door and two lengths of gatepost. Later it was clad in imitation marble. A third renovation covered the hinges and left the door harder to open. The surviving charter has eight lines and two operating instructions disguised as an index. You can read it only by kneeling beside a drain.\n\nLady Supine watches from the living jar. “I did not order those words removed,” she says. Ada believes her. One clerk improved the surface, another improved the record, and a third decided the improvements were the reason the entrance existed. “You kept what it took,” Ada says. Supine turns toward the gate. In Ada's body she called the hospital patients animals and demanded that Brindle stop touching her coat. Now the same mind needs Brindle to steady its little container against the wind. He does it without calling her kind.\n\nPip reads the charter in a tired voice. It does not promise everlasting life. It describes a person, a promise, and the day that might follow. The indexed words are instructions, not a verdict on whichever ending you prefer. Decode both before asking the gate to interpret its final rule. You are retrieving something a hungry traveller might once have read while waiting here. There is no assurance the traveller was admitted, or had enough time left to stand afterward.",
    "resolution": "The old vocabulary opens the accounting drawers. Supine asks whether it applies to her too. Ada says an owner must be heard even when hearing her is difficult. Brindle folds part of his empty coat beneath the jar so its glass will not scrape the threshold. The Lady asks for a cushion. This is the only one. The recovered charter cannot promise a kinder speaker, only a rule that need not depend on liking its subject."
  },
  "last_balance": {
    "narrative": "Five envelopes slide from the gate. Their seals carry Supine's smiling face. Each face blows a kiss as the glue loosens; the printed mouth dissolves and the paper smells faintly of scorched hair. No new time arrives. These are receipts for ninety minutes already held from travellers the threshold refused. The portraits have survived the people who once watched them dissolve in the hope of staying awake another night. Even the return has been arranged to look like the Lady's generosity.\n\nAda spreads them beneath the ledger. There is an ordinary household, a suspended patient's claim, the gate's existing price, a common remainder, and a disputed refund. Names have been withheld so publication will not expose people already frightened of a knock at their thin door. The surviving relationships are sufficient to reconcile the amounts. Your friends do not pay again. Nobody at the hospital needs to be found less deserving so another person can be counted. The five envelopes partition funds already in escrow; the total is not a measure of all that has been lost.\n\nThe gate calls the calculation an allocation. Ada calls it evidence. You have not chosen which claims should continue or what a shared account might become. Establish what is here and owed before deciding. Brindle shields the envelopes with his body. Pip puts a chipped cup on one corner, the cup he brought in case there was anywhere to make tea. It is empty. Nobody tells him he should have travelled lighter.",
    "resolution": "The ninety minutes reconcile without another payment. Thirty remains the old threshold price; appearing in an envelope cannot make the toll fair. Ada writes CALCULATION COMPLETE, AUTHORIZATION PENDING across the seals. A total has become information instead of an immediate order. It is a small reprieve. The hospital claim is still a patient who has waited, the household still a room with a failing roof, and ninety minutes will pass even when returned honestly."
  },
  "last_sequence": {
    "narrative": "The closing instructions lie on two pages. One belonged to an account clerk; the other belonged to an appeals clerk who tried to keep the first clerk's decisions reversible. Neither bears Supine's signature. Both bear her seal. Staples from later corrections have turned the margin into a perforation. Through it you see the threshold's timber core. This is how the country was enlarged: the same authority, another sheet, a repair that made the previous damage somebody else's responsibility.\n\nSeven actions protect different things. An original establishes a person. Copies must be identified before a doubled claim makes a reserve look excessive. The reserve must be sealed before a conditional pledge is released. The public receives an honest total while private owners keep their names. A shared account may then be authorised from what can freely be shared. The last action keeps the decision open until everyone knows what has happened. A shortcut could convert your friends' generosity into a method of collecting from them.\n\nThe order preserves either decision you made at Brindle's bench. An accepted pledge can return to its living owner. An unspent offer need not become a charge. Pip says that offering the last of something was not asking to disappear. His voice almost fails on the last word. Brindle knew what the offer meant when he made it. Ada has stopped looking at the place where she put her spring. Arrange the pages before their decision is filed as evidence that a person can manage with nothing.",
    "resolution": "The pages form a usable order. A refund is no longer disguised as a gift, nor a total as permission to seize its parts. VALID FOR MORE THAN ONE PERSON appears on the gate. The phrase has been possible all these years. Pip takes Brindle's hand and holds it too tightly. Ada enters four names, then a place for the additional witness. Supine asks for hers. You can hear it without forgetting anybody she refused to hear."
  },
  "last_route": {
    "narrative": "Seven rows unfold from the floor before the gate. The black tiles carry small ownership claims: the road belongs to its toll, the name to its register, the promise to whoever can collect it. Under the printed declarations is ordinary patched linoleum. People have been prevented from walking by sentences affixed to a surface other people laid. The model will accept an approach that avoids those claims. It will not apologise for the years in which it accepted no such route.\n\nFour stations remain on open tiles. A name must be heard before its reserve is protected. Protection comes before recognition of an offer freely made. The offer comes before the final choice is left open. Entering a station early repeats the gate's old practice of recording consent after the money has gone. Move through the model in the prescribed order. The black squares are closed; each safe square may be used only once. A route can look direct and still omit the person it claims to serve.\n\nYour companions wait while you trace it. An incorrect trial will not spend them. Brindle holds Pip's poem against the wind. Ada supports the jar with a hand that Supine recently used to point people out as vermin. Supine asks to see the board more clearly; Ada adjusts it without answering. Sixteen moves are available. The route ends at a threshold, not proof of a country worth entering. Outside the model, the road back to the trailers is still open and still long.",
    "resolution": "Each witness reaches the threshold in order. Four people have not been combined into a larger purchaser. Supine calls the route inelegant, then asks whether elegance was a condition. Ada checks. It was not. The Lady watches the path without correcting it. You have shown that an approach can include a protected life and an uncollected offer. That possibility does not restore the people who wore this floor down waiting for it."
  },
  "last_circuit": {
    "narrative": "The final drawer contains a grid like the castle's. There it assigned watchers to every movement. Here it assigns a proprietor to every possible next moment. A lit square proves no future exists; it records someone claiming the right to sell one. Each neighbouring claim sustains another. The collector requires a keeper, the keeper a register, the register a gate that turns travellers away. Old wires have been joined with household tape. None of the people who repaired them could afford the thing they kept selling.\n\nThe panel is a simulation, disconnected from the real reservoirs. Darkening it will show that an account can remain legible without a single owner. It will not choose a commons, an unmeasured country, or home. Supine understands the difference before anyone explains it. “You could leave it like this,” she says. “And still decide to go back.” She sounds offended that a mechanism might work without commanding its users. In Ada's body she demanded a return to the palace. In the jar, with no hands to enforce that demand, she has to wait.\n\nPip says he would like to finish a poem somewhere he can sleep. Brindle says the bench will need a roof before winter. Ada looks at the little coupled lights instead of offering another analogy. A common future would still need repairs, food, and people willing to do the work without owning everybody afterward. Clear the claims while leaving the counting mechanism intact. Whatever you choose, it must not require another divinity to sell your friends the minutes they have left.",
    "resolution": "The grid goes dark. The account remains readable. No name disappears and no patient loses a reserve. Supine asks what a Keeper would do here. Nobody finds a reassuring answer for her. Pip quietly asks Brindle whether the old kettle can be mended; Brindle says they can try. You close the drawer. The last gate has enough information to hear your choice. There will still be weather, exhausted bodies, and things no corrected account can give back."
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
    },
    {
      "title": "Unpaid relief",
      "text": "The shift sheet has no column for the hours after the scheduled replacement failed to arrive."
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
    },
    {
      "title": "Missing copyist",
      "text": "The book bears EMPLOYMENT ENDED beneath its copyist’s signature. The old instructions survived where their author did not."
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
    },
    {
      "title": "Maintenance priority",
      "text": "Every listening tube has a current inspection stamp. The heater beside the panel is marked REPLACEMENT DEFERRED."
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
    },
    {
      "title": "Accumulated repairs",
      "text": "The Divine Control Desk is an old kitchen counter. Seven handles have been added through the burns left by somebody’s meals."
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
    },
    {
      "title": "Room alterations",
      "text": "A caravan window has been covered by the latest observation panel. Its latch remains on the wrong side."
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
    },
    {
      "title": "Recording archive",
      "text": "The archive marks Supine’s sleepless nights CONTINUOUS AVAILABILITY. No entry uses the word exhaustion."
    }
  ],
  "last_ledger": [
    {
      "title": "Five unfinished claims",
      "text": "Each person has a distinct reserve from 6, 7, 9, 12, 16 minutes, and a distinct project: Poem, Bench, Repair, Curtain, Catalogue. These are documented protected reserves, not new charges on your pocket."
    },
    {
      "title": "Amount cross-references",
      "text": "The Bench reserve exceeds the Poem reserve by two. The Curtain reserve is twice the Repair reserve. Vellum has the greatest reserve. Ada’s reserve is smaller than Pip’s."
    },
    {
      "title": "People cross-references",
      "text": "In ascending order of reserves, Thimble immediately follows Brindle, and Vellum immediately follows Thimble. Pip’s project is neither Curtain nor Repair. Ada’s project is not Poem. Thimble’s project is not Catalogue."
    },
    {
      "title": "Unanswered names",
      "text": "Earlier confiscations remain above the living owners’ claims. The gate has no address for people whose time ran out."
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
    },
    {
      "title": "Replacement cladding",
      "text": "Imitation marble covers the old service door. Only the lettering near the drain escaped the successive improvements."
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
    },
    {
      "title": "Dissolving seal",
      "text": "The Lady’s smiling seal survives every collection. The gate recorded no condition of the traveller when admission was refused."
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
    },
    {
      "title": "Authority renewed",
      "text": "Neither clerk signed in the Lady’s name. Each correction carries her seal, including the corrections to the previous correction."
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
    },
    {
      "title": "Worn approach",
      "text": "The model rests on patched linoleum worn thin by waiting feet. Successful calculation cannot identify everyone who stood here."
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
    },
    {
      "title": "Repaired wiring",
      "text": "Household tape joins the oldest wires. Whoever made this repair could not afford the minutes the mechanism was selling."
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
    "The order permitting an interruption",
    "Arrange the seven relief actions into the one authorized schedule."
  ],
  "palace_route": [
    "The room between observations",
    "Trace a safe route through the observation floor."
  ],
  "palace_circuit": [
    "One interval without an audience",
    "Darken all twenty-five observation lamps."
  ],
  "last_ledger": [
    "The lives entered as remainders",
    "Match every protected reserve to its owner and unfinished work."
  ],
  "last_cipher": [
    "Words under the replacement panels",
    "Decode the original charter’s two surviving instruction words."
  ],
  "last_balance": [
    "Ninety minutes already here",
    "Reconcile the five envelopes without charging any friend."
  ],
  "last_sequence": [
    "A reserve before its collection",
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
  { id: "listening_castle", act: 5, title: "The Castle That Watches Itself Sleep", subtitle: "Request one unwatched interval before the exchange.", location: "castle", premise: paragraphs("At the servants' entrance of the Great Castle Divine, Aristobats hang in velvet uniforms whose lining has been repaired with hospital cloth. The palace is built around trailers with their wheels removed. Plywood turrets hide the old hitch plates. Through each room runs a system for listening, maintained more carefully than the heaters or drains. Cameras record Lady Supine, the actual human ruler, in a chamber with no recognised interval for sleep.\n\nAda finds an old relief procedure. It can release the minders, authenticate a record, and admit a visitor while keeping the Lady's face off the screens. It requires observation, calculation, and a route through a corridor almost filled by live sightlines. Every ordinary request has become so expensive to prepare that the tired people stationed here have stopped making them. You must use what remains rather than leave another failed repair behind.\n\nPip opens the relief book. Brindle puts down the food he brought from the shanties. Behind the screens waits Supine's real human body: enormous head, an opening at its crown, a living brain that can be exchanged with Ada's. A brain in the wrong body will still be the person who owns that brain. Getting through this door is only the first dangerous part of bringing your friend home."), challenges: [
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
      "description": "The camera receives the patched room with no living face in it."
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
  ], conclusion: paragraphs("The castle remains standing: patched caravans, imitation towers, listening pipes. For the moment their attention no longer converges on one exhausted face. The minders eat the portions Brindle will go without. The corridor offers a return passage, and the guest bell can sound without the country hearing it.\n\nYou leave the relief procedure where others can find it. Beyond the door sits a real woman with an immense open-topped head. Ada checks the plan for moving living brains between bodies and returning each mind safely. She has not ceased to be afraid merely because the calculations work. Brindle begins the lullaby he learnt where there was never enough heat.") },
  { id: "common_tomorrow", act: 6, title: "The Last Ledger Belongs to Nobody", subtitle: "Keep the living owners out of the gate’s price.", location: "infinite", premise: paragraphs("Your friends have offered their last time. Whether you accepted the pledge or asked them to keep it, you heard how little each had left. Pip's button, Brindle's string, and Ada's spring lie beside a ledger without a column for what surrendering them meant. Ada's mind is back in her own head. The Lady's living brain waits in a jar. The exchange has left marks on bodies that a returned entry will not remove.\n\nThe final gate holds ninety minutes taken from travellers it refused. Admission is still recorded as something one sufficiently wealthy person can purchase. Before deciding a future, read the surviving accounts: protected reserves, copied names, claims on funds already here, claims that presume authority. Some of the owners can answer. The books make no provision for finding those who ran out while their appeal waited.\n\nSupine listens beside you. She has ruled this country in a human body and spoken through your friend's mouth. She remains the same mind in the jar. This inquiry will not prescribe a commons, the unmeasured country, or a return to the trailers. It can make those choices possible without using your friends as their price. First the gate must learn to count somebody who ought to remain alive afterward."), challenges: [
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
      "description": "The final decision waits until every account is readable."
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
      "description": "Only freely offered surplus can enter; a last reserve cannot be assumed spare."
    },
    {
      "id": "protect",
      "title": "Seal protected reserves",
      "description": "A pledge does not surrender its owner’s protected reserve."
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
  ], conclusion: paragraphs("The ledger is readable. Protected reserves stay attached to living owners. Conditional offers can be released without calling a person's disappearance a completed payment. The ninety minutes cannot disguise a theft as a gift merely by passing through the Lady's dissolving kiss.\n\nThe gate can now hear more than one future. You may attempt a common account, cross together into the country without measures, or return to finite days beside the patched bench. No choice repairs the roof by itself. None recalls the people already taken to the Hospital. Your friends will be here to answer you, with the small remainder of their time still their own. Supine waits too, in a container somebody else has to carry.") },
];
