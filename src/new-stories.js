// Original stories for the two new browser prototypes. Feature names match
// new-worlds.js; the engine owns progression, dialogue actions, and effects.
export const NEW_STORIES = {
  lynch: {
    title: 'A room with your name',
    weapon: 'flash',
    currency: 'tokens',
    enemy: 'Uninvited shape',
    objective: 'Answer the telephone awake. Enter the stage and the pine grove dreaming. Bring the three clues to Dale.',
    intro: 'Mercy Falls has saved a room for you. The reservation is in your handwriting, dated tomorrow. Your sister June disappeared here thirteen years ago; this morning her voice called your number. Find the message at the ringing telephone, the name behind the red curtain, and the person in the black pines. Some things can only be found while dreaming.',
    lore: 'Mercy Falls is a paper mill town built beside a road that washed away. Its diner stays open for the night shift, although the mill closed years ago. Everyone remembers June. Nobody agrees on whether she ever lived here. At the motel, room 6 is always ready and never rented.',
    advice: 'E speaks to people and investigates places. Q changes between waking and dreaming; the town will remember you differently. Space flashes your camera to repel uninvited shapes. You can finish this story without harming one. Follow the diamond or explore with M.',
    examine: 'The ordinary object has been waiting for you. It becomes less ordinary when you look away.',
    rumor: 'At 2:17 every morning, the diner receives one order for a cup of coffee and two empty chairs. Alma always brings the coffee.',
    resolution: 'Dale lays three things on the counter: June’s message, a playbill with your name, and the key from the pines. The town has been rehearsing an explanation for thirteen years. There is enough evidence to end the rehearsal. There is not enough evidence to make it painless. What will you let Mercy Falls remember?',
    reward: 'Let the town remember June',
    rewardItem: 'June’s brass room key',
    bounty: 65,
    rank: 'A familiar stranger',
    killsNeeded: 0,
    phaseNames: { waking: 'Waking · Mercy Falls', dream: 'Dreaming · The other Mercy Falls' },
    clueNames: {
      'june-message': 'June’s message: “I left. You did not make me leave.”',
      'missing-playbill': 'A playbill credits you with a part you never performed.',
      'room-six-key': 'Room 6’s key was buried beneath the black pines.',
      'double-account': 'Your double remembers staying when you remember running.',
    },
    npcs: [
      {
        name: 'Dale Mercer', role: 'guide',
        intro: '“You’re early,” says Dale, checking a stopped wristwatch. He used to inspect lost mail. Now he inspects the town’s explanations. “June sent you something. Three places have been trying to deliver it. Take your time. Hurry is how we lose the important parts.”',
        waking: 'Dale warms his hands around a cup that gives off no steam. “A person can be missing without being yours to find. Keep that possibility in your pocket.”',
        dream: 'Dale’s reflection watches you from the coffee. “In here, an answer is sometimes a room. Please leave the door open when you go.”',
        completed: 'Dale finally winds his watch. For the first time, it makes a sound. “Whatever comes next, it will be next.”',
        endingText: {
          remember: 'Dale folds June’s statement into the town ledger. “A fact does not make a feeling disappear. It gives the feeling somewhere to stand.” The shapes have quieted.',
          stay: 'Dale sets a second cup beside yours. “I will watch the waking side. You watch this one.” The dream no longer pushes you away.',
          silence: 'Dale accepts the blank tape without touching it. “We have done this before,” he says. “I had hoped this time we would remember doing it.”',
        },
        topics: [
          { label: 'How do I find the three clues?', text: '“The public telephone is north of the diner. Answer it awake. The theatre stage is northeast; its curtain opens in dreams. Follow that dream farther northeast into the black pines. Bring what you learn here. I can restore your health whenever you need a rest.”', dream: '“You are already on the right side for the curtain and the pines. The telephone needs a waking ear. Q will take you across; E will let you listen.”' },
          { label: 'What happened to June?', text: '“The road washed out the night she left. People find that easier to remember than the argument before it. I will not tell you which part belongs to you.”', dream: '“The road did not wash out. It forgot where it was going. I understand the distinction. I cannot help you with it.”' },
          { label: 'Why are you still here?', text: '“A letter came back marked RETURN TO SENDER. I have been trying to find the sender. It was addressed to me.”', completed: '“There are still letters to deliver. A few of them might reach someone now.”' },
        ],
      },
      {
        name: 'Alma Vale', role: 'merchant',
        intro: 'Alma has lined up six slices of cherry pie. Five have been paid for. “If you are asking about June, you can sit. If you are asking about the sixth slice, I will need a minute.”',
        waking: '“June worked the morning shift. She wore a yellow coat. I know because I mended the cuff.” Alma’s own cuff is yellow beneath her apron.',
        dream: 'Alma serves an empty plate. “Your usual. You have been eating around this for years.”',
        completed: 'Alma changes the board from YESTERDAY’S SPECIAL to TODAY’S. She keeps the sixth slice.',
        endingText: { remember: 'Alma pins a photograph of June beside the menu. “She was a person. We can begin there.”', stay: 'Alma places a warm slice in front of the empty chair. “At last. Someone remembered the order.”', silence: 'Alma clears all six plates. “Only five customers,” she says, too quickly.' },
        topics: [
          { label: 'Tell me about the night June left', text: '“She asked me which road went east. Then she asked which one nobody watched. I drew two different lines on the same napkin.”', dream: '“You asked me to keep her here. I said a diner is not a cage. Then I locked the back door. I think that was a different Alma.”' },
          { label: 'Who orders the extra coffee?', text: '“Someone who tips in motel keys. It is poor currency, but it is an excellent conversation starter.”', dream: '“The chair orders it. The chair has better manners than most customers.”' },
          { label: 'What keeps a town alive?', text: '“Somebody opens the door in the morning. Somebody else comes through it. You would be surprised how much rests on those two decisions.”', completed: '“The mill workers came in today. First time in years. None of them said a word. I put fresh coffee on.”' },
        ],
      },
      {
        name: 'Vivian Bell', role: 'ranger',
        intro: 'Vivian sews a hem at the theatre entrance. There is no fabric in her hands. “We start when everybody is seated. We have been one person short for a very long time.”',
        waking: '“There is no performance tonight,” Vivian says. The ticket reads EVERY NIGHT.',
        dream: 'Vivian’s needle passes through the dark. “There you are. Your understudy has become difficult.”',
        completed: 'Vivian rolls up the unused tickets. “The silence after a show belongs to the audience. You may take yours home.”',
        endingText: { remember: 'Vivian opens the curtains onto an empty stage. “We can perform something else now.”', stay: 'Vivian leaves a seat in the front row. Your name is stitched into it.', silence: 'Vivian begins repairing the same invisible hem. “The next performance will explain everything.”' },
        topics: [
          { label: 'What is behind the curtain?', text: '“A room pretending to be a stage. Come back dreaming. The room is less shy then.”', dream: '“Your part is the person who came back. Nobody has written your next line. I consider that promising.”' },
          { label: 'Did June perform here?', text: '“She played the sister. She objected that she was already a sister. We never settled whether that qualified her.”', dream: '“She walked offstage before the ending. Some people called it a mistake. Some called it the only honest line.”' },
          { label: 'Why is my name on the playbill?', text: '“The printer says you ordered it. The printer died in spring. Those facts do not cooperate.”', completed: '“I took your name down. You can put it back if you want a new part.”' },
        ],
      },
      {
        name: 'Owen Pike', role: 'clerk',
        intro: 'Owen presses the motel bell with one finger. It rings from upstairs. “Welcome back. Please do not correct me. It makes the booking system nervous.”',
        waking: '“Room 6 is reserved. I cannot say for whom. The name changes when I read it aloud.”',
        dream: 'Owen holds a key with no teeth. “The room is outside tonight. Try the pines.”',
        completed: 'Owen’s register has finally dried. He turns to a clean page and asks how long you plan to stay.',
        endingText: { remember: 'Owen writes JUNE CHECKED OUT in the old register. He underlines OUT only once.', stay: 'Owen gives you room 6. The key is warm. “Two occupants,” he says. “No extra charge.”', silence: 'Owen turns the register backward to the first page. Your reservation is there again.' },
        topics: [
          { label: 'Show me the old guest register', text: 'June signed in thirteen years ago. Your name appears below hers in fresh ink. Owen blots it. More ink rises. “This is why we stopped offering pens.”', dream: 'The dates count down toward the night of the washout. The last entry says CHECK OUT WHEN READY. “I did not write that,” Owen says.' },
          { label: 'Did someone leave a suitcase?', text: '“Out back. Whoever owned it packed one shoe, a birthday card, and a weather report. They were prepared for a particular kind of journey.”' },
          { label: 'What is in room 6?', text: '“I clean it every morning. The bed is made every evening. I do not know who is doing my job before I arrive.”', dream: '“A person waiting for an apology. I suggest asking what you are apologising for before you promise one.”' },
        ],
      },
      {
        name: 'Elsie Reed', role: 'operator',
        intro: 'Elsie has disconnected the switchboard. Calls keep arriving. “Please hold,” she tells the silence. To you: “I meant that literally. Some voices need a hand.”',
        waking: '“June called the morning after the washout. I logged the call. I also logged that she never called. Both entries are mine.”',
        dream: 'Elsie wears the headset backward. “The future keeps asking to speak to the past. Neither will accept the charges.”',
        completed: 'For the first time, the switchboard has one steady light. Elsie listens without making a note.',
        endingText: { remember: 'Elsie connects June’s recording to every speaker in town. Nobody interrupts it.', stay: 'Elsie opens a line between the diner and the dream. “Visiting hours,” she says, “are whatever you need.”', silence: 'Elsie cuts the wire. The telephone keeps ringing. She cannot meet your eyes.' },
        topics: [
          { label: 'Who is calling the public telephone?', text: '“June. Or someone borrowing the part of her that wanted to leave. Answer while you are awake. In a dream, it only repeats what you already think.”', dream: '“Wake up to answer. You cannot hear another person while you are doing all of their talking.”' },
          { label: 'Can you prove she survived?', text: '“I can prove a call arrived. I can prove I heard her voice. I cannot prove why I hid the log. That is the piece I keep avoiding.”' },
          { label: 'What did she say to you?', text: '“Do not tell them where I went. Tell them I went.” Elsie moves an unplugged cable from one socket to another. “I did neither. I told myself those were the same.”', completed: '“I have stopped translating people into whatever the town can tolerate. It is harder work than I expected.”' },
        ],
      },
      {
        name: 'The double', role: 'double', clue: 'double-account',
        intro: 'Someone with your face stands very still. Their coat is dry despite the rain. “I took care of it,” they say. They appear disappointed that this does not reassure you.',
        waking: 'Your double speaks with your voice a little too slowly. “You remember leaving. I remember being left. One of us is using a convenient word.”',
        dream: 'Your double’s shadow points toward you. “June left because she wanted a life. You turned that into a disappearance because it gave you a job to do.”',
        completed: 'Your double looks less like you. For a moment, they look like somebody you could forgive.',
        endingText: { remember: 'The double puts down their camera. “I can be a memory now.” Their edges soften, and they stop following you.', stay: 'The double steps aside. There is room for both of you on the path.', silence: 'The double smiles exactly when you do. From somewhere behind them comes a camera flash.' },
        topics: [
          { label: 'Did I cause June to disappear?', text: '“You argued. She left. The road washed out. Your mind made one sentence out of three events. It has been an expensive sentence.”', dream: '“You gave her a reason to leave. You did not take away her reasons to live. She deserves those back.”' },
          { label: 'What did you take care of?', text: '“I kept the room ready. Somebody had to. You kept driving past the turnoff.”', dream: '“The part of you that could not wait became me. Do not mistake a useful arrangement for a true account.”' },
          { label: 'Can you come with me?', text: '“I already do. I would prefer to be invited.”', completed: '“Ask me again tomorrow. We have not had a tomorrow before.”' },
        ],
      },
    ],
    landmarks: [
      {
        name: 'Ringing telephone', phase: 'waking', clue: 'june-message', item: 'June’s recorded message',
        text: 'The receiver is warm. June’s voice arrives through a storm: “I left. You did not make me leave. I wanted to be someone you had not already decided I was.” A pause. “I miss the diner. I do not miss the room.” The recording ends with a bus door opening. You keep the message.',
        wrongPhaseText: 'The telephone rings inside your chest. When you lift the receiver, your own voice says the things you expected June to say. This is not her message. Wake with Q, then answer again.',
        completed: 'The telephone is quiet. For once, nobody owes it an answer.',
      },
      {
        name: 'Red-curtain stage', phase: 'dream', clue: 'missing-playbill', item: 'An unfinished playbill',
        text: 'The curtain parts. Two chairs face one another in a motel room. A playbill names you as THE PERSON WHO CAME BACK and June as THE PERSON WHO LEFT. Below them is a blank line: ENDING BY ______. On the second chair, a yellow coat has been carefully folded. There is no body inside it.',
        wrongPhaseText: 'The stage is bare, and the curtain will not move. A ticket seller’s sign reads: CLOSED UNTIL YOU CLOSE YOUR EYES. Enter the dream with Q and investigate again.',
        completed: 'The chairs have turned toward the audience. The blank line is still there. It belongs to you now.',
      },
      {
        name: 'Black pine grove', phase: 'dream', clue: 'room-six-key', item: 'Room 6’s brass key',
        text: 'Between the black pines stands a door without a wall. Beneath it lies room 6’s key. Someone inside asks, “Are you looking for your sister, or for the person you were before she left?” You take the key. The door stays shut. For the first time, you understand that opening it and finding June may be different things.',
        wrongPhaseText: 'The pines are ordinary trees. There is a rectangle of dry ground where no sunlight reaches. Whatever was here is on the other side of sleep. Press Q to enter the dream.',
        completed: 'A path has appeared where the door stood. You cannot see its end, which feels like an improvement.',
      },
    ],
    endings: [
      {
        id: 'remember', label: 'Broadcast June’s message. Let her leave.', reward: 65, item: 'June’s brass room key',
        text: 'Elsie plays the message over the old mill speakers. Alma listens with her apron in both hands. Vivian opens the stage curtains. Nobody claims to understand everything. June’s place in the town becomes a life she chose, rather than an ending you invented. Somewhere far away, a bus reaches its stop.',
        worldConsequence: 'Mercy Falls wakes. The uninvited shapes become peaceful, and the townspeople begin remembering June as a person who left.',
        enemyDisposition: 'peaceful', phase: 'waking',
      },
      {
        id: 'stay', label: 'Keep the dream’s door open. Give the waiting a home.', reward: 65, item: 'The key to both Mercy Falls',
        text: 'You ask Dale to keep the waking diner open. In the dream, you place the second cup on the table and wait without deciding who must arrive. The double sits beside you. For once, the town does not ask anybody to play June. It makes space for what is still unknown.',
        worldConsequence: 'The town remains dreaming. The shapes stop attacking, and its people can visit their other selves without pretending the dream proves what happened.',
        enemyDisposition: 'peaceful', phase: 'dream',
      },
      {
        id: 'silence', label: 'Erase the recording. Give Mercy Falls its old story.', reward: 85, item: 'A blank cassette',
        text: 'You record silence over June’s voice. Dale signs the old report. The mill whistles although its machines are gone. Everyone thanks you for bringing them certainty. At the motel, Owen prepares room 6. The reservation is in your handwriting, dated tomorrow.',
        worldConsequence: 'The town returns to waking, but its uninvited shapes remain hostile. The missing-person story begins again, and the extra payment buys no explanation.',
        enemyDisposition: 'hostile', phase: 'waking',
      },
    ],
  },
  shinobi: {
    title: 'The ember beneath the seal',
    weapon: 'kunai',
    currency: 'ryō',
    enemy: 'Rogue shinobi',
    objective: 'Train at the northern grounds, recover the scroll at Bamboo crossing, and open the watchtower seal. Defeat two rogues or learn Sora’s peaceful passphrase.',
    intro: 'You are a new genin of the Village Hidden in the Reeds. A mission scroll vanished before the morning briefing. Your rival Kaito believes it names the shinobi who betrayed his clan. Mentor Ren has ordered you to recover it before the border patrol does. Learn to shape your chakra, search the bamboo crossing, then open the old watchtower seal. What you return matters as much as whether you return.',
    lore: 'The Hidden Reeds shelters three clans around a spring that never freezes. The Ash clan shapes fire; the Reed clan carries messages through water; the Bell clan makes wind carry a blade. The village calls their pact the Threefold Oath. Its elders teach loyalty first. Its grave markers tell you to ask loyalty to whom.',
    advice: 'Space throws a kunai. 1 casts Ember Release; 2 makes a Shadow Clone that draws attacks; 3 uses Substitution to escape danger. All three jutsus are available now, and chakra returns over time. E speaks, investigates, and completes the three trials. Ask Sora about the watchtower passphrase for a route that needs no rogue defeats. Your jutsus and your decisions both matter.',
    examine: 'You place two fingers against the mark. Chakra answers from somewhere beyond the stone. An old oath remembers its witnesses.',
    rumor: 'The bamboo bends toward the west even when the wind blows east. Aya says it listens to runners. Nori says it listens to people worth following.',
    resolution: 'The scroll contains no enemy roster. It is a mission ledger: village leaders sent Kaito’s clan beyond the border to preserve a treaty, then called their deaths desertion. Ren knew part of it. Sora kept the seal. Kaito waits for you to say whether loyalty can survive the truth. The scroll is yours to place.',
    reward: 'Read the ledger before the whole village',
    rewardItem: 'Threefold Oath headband',
    bounty: 75,
    rank: 'Genin · ember recruit',
    killsNeeded: 2,
    peacefulRouteClue: 'watchtower-password',
    clueNames: {
      'watchtower-password': 'Sora’s passphrase: “A village is everyone who must come home.” The watchtower guards stand down; rogue defeats are optional.',
      'aya-tracks': 'Aya’s tracks lead to Bamboo crossing. The scroll carrier avoided the watchtower patrol.',
      'kaito-oath': 'Kaito’s brother carried a return token from the village when he died.',
      'chakra-form': 'Elemental trial: steady your breath, shape your chakra, and release it without anger.',
      'mission-scroll': 'The recovered mission scroll contains an erased mission ledger.',
      'broken-seal': 'The watchtower seal confirms the ledger was altered by village authority.',
    },
    npcs: [
      {
        name: 'Ren', role: 'guide',
        intro: 'Ren adjusts your forehead protector until its knot sits level. “A genin can finish a mission by obeying. A shinobi must also understand what they have done. Bring the scroll home. Do not let Kaito face this alone.”',
        completed: 'Ren bows to you before giving his next instruction. “You made a decision I would have been afraid to make at your rank.”',
        endingText: { truth: 'Ren removes his council insignia. “I will testify. A teacher who asks for courage must bring some of his own.”', exile: 'Ren places two travel packs at the gate. “You are leaving my command. You are not leaving my care.”', order: 'Ren files the scroll behind a new seal. “The village is safe,” he says. He does not say whether that is enough.' },
        topics: [
          { label: 'Give me a mission briefing', text: '“Train north of here. The scroll was last seen at the bamboo crossing to the southwest. The sealed watchtower is northeast. You can clear two rogues, or ask Sora for the old passphrase and go through without a fight. Press M to read the map.”' },
          { label: 'Teach me chakra control', text: '“1 releases fire. 2 shapes a shadow clone that draws attacks. 3 uses substitution to slip away from danger. All three are yours already. Chakra recovers when you give it a moment. Running out is an instruction to think, not an instruction to be braver.”' },
          { label: 'What do you know about Kaito’s clan?', text: '“Their last order did not come through me. I told myself that meant it was not my responsibility. I have been teaching you better than I lived.”', completed: '“The names are in our memorial now. Whatever the council says, I will teach them to the next class.”' },
          { label: 'What makes someone a shinobi?', text: '“Not a bloodline. Not a technique. Someone has to carry a promise through danger. The difficult part is knowing which promises deserve the journey.”' },
        ],
      },
      {
        name: 'Mako', role: 'merchant',
        intro: 'Mako stacks paper charms beside rice balls. “One keeps evil away. One keeps hunger away. Only one comes with a guarantee.”',
        completed: 'Mako has added a second bench outside the shop. “People have things to say now. They should be able to sit while saying them.”',
        endingText: { truth: 'Mako offers food to the families waiting for the council hearing. “The village finally has an appetite for something useful.”', exile: 'Mako tucks extra rice balls into your pack. “A border is a poor reason to go hungry.”', order: 'Mako closes the shop early. Behind the counter, one unsigned memorial charm remains.' },
        topics: [
          { label: 'Which clan are you from?', text: '“None that will admit it. My mother made wind charms. My father fixed water pumps. The council could not decide which box to put me in, so I opened a shop.”' },
          { label: 'What does the village think of Kaito?', text: '“People like a survivor while he is grateful. They become uncomfortable when he wants an answer. I give him breakfast either way.”' },
          { label: 'Any advice for a new genin?', text: '“Your supplies are replaceable. Your teammates are not. If somebody tells you a person is an acceptable loss, ask what they are accepting for themselves.”', completed: '“You brought more back than a scroll. I wish the academy gave credit for that.”' },
        ],
      },
      {
        name: 'Aya', role: 'ranger', clue: 'aya-tracks',
        intro: 'Aya balances on the fence, reading the grass below. “Three sets of footprints. One person running. One person following. One person trying to look like two. We have an interesting morning.”',
        completed: 'Aya has taken the patrol notices down. She still watches the road, but she leaves the gate open.',
        endingText: { truth: 'Aya volunteers to find the families named in the ledger. “There is a difference between tracking a person and bringing them home.”', exile: 'Aya points out an unwatched road. “The report will say I did not see you. That is almost true.”', order: 'Aya folds the patrol order in half. “I know how to obey. I am still learning when.”' },
        topics: [
          { label: 'Where did the scroll carrier go?', text: '“Southwest, into the bamboo crossing. Look for the loose bridge rope. Whoever hid the scroll knew we would search the watchtower first.”' },
          { label: 'Can I avoid a fight?', text: '“The rogues are former village shinobi guarding an old promise. Ask Elder Sora for the watchtower passphrase. Say it properly, and there is no need to prove yourself by hurting them.”' },
          { label: 'Teach me about the Reed clan', text: '“We send messages through running water. The current repeats a lie just as faithfully as the truth. A useful technique requires an honest messenger.”', completed: '“I sent the news downstream. The villages will hear what happened. This time, so will the families.”' },
        ],
      },
      {
        name: 'Nori', role: 'quartermaster',
        intro: 'Nori checks the seal on a crate of practice kunai. “Count them before you leave. Count your teammates when you return. We have been doing those in the wrong order.”',
        completed: 'Nori replaces the casualty column in the mission book with PEOPLE TO BRING HOME.',
        endingText: { truth: 'Nori writes the erased names into the supply ledger. “Dead shinobi leave belongings. Someone should know who to give them to.”', exile: 'Nori marks your packs TRAINING SUPPLIES. “I can lose two crates. I cannot lose another team.”', order: 'Nori signs the new inventory. He leaves the casualty column blank.' },
        topics: [
          { label: 'What is hidden in the training supplies?', text: '“A chakra-binding cord and an old field manual. Take what you need. Equipment that sits in a crate is very good at protecting a crate.”' },
          { label: 'Who supplied the last border mission?', text: '“I did. Seven return tokens. Seven people expected to come back. The record now says the tokens were never issued. I have excellent handwriting; I recognise my own numbers.”' },
          { label: 'Why do you never go on missions?', text: '“I lost one hand making sure a bridge stayed up. The people who crossed it call that retirement. I call this the rest of the same mission.”', completed: '“A quartermaster can mend more than equipment. Sometimes a record needs its missing pieces.”' },
        ],
      },
      {
        name: 'Sora', role: 'elder',
        intro: 'Sora sits beneath the watchtower’s old oath plaque. “You came looking for permission. I hope you will also look for a reason.”',
        completed: 'Sora rises from the plaque for the first time in years. The stone behind her is lighter than the rest.',
        endingText: { truth: 'Sora hands over the council’s seal. “I called silence protection. You have given it its proper name.”', exile: 'Sora removes your names from the gate register. “A village may fail the people it is meant to shelter. Take care of each other until ours remembers.”', order: 'Sora presses a new seal onto the ledger. Her hand shakes. “Another generation,” she says, “might be ready.”' },
        topics: [
          { label: 'Teach me the watchtower passphrase', text: '“A village is everyone who must come home.” Sora speaks each word as if it hurts. “The guards recognise the Threefold Oath. Carry it to the tower, and they will stand down. You can complete your mission without defeating the rogues.”', clue: 'watchtower-password' },
          { label: 'Why is the watchtower sealed?', text: '“A seal keeps something safe from the outside. It also prevents the outside from learning what it is keeping. I used that distinction for too long.”' },
          { label: 'What happened to the Ash clan?', text: '“We purchased peace with a mission we did not expect them to survive. Then we purchased our own comfort by calling them deserters. Their children were left to pay for both.”', completed: '“Your generation has inherited the result. It does not have to inherit our excuses.”' },
        ],
      },
      {
        name: 'Kaito', role: 'rival', clue: 'kaito-oath',
        intro: 'Kaito’s practice blade has split its wooden target. “Ren says we are rivals so we will improve. I would settle for knowing which direction I am meant to improve in.”',
        completed: 'Kaito puts his blade down when he sees you. This is the first conversation where he has done that.',
        endingText: { truth: 'Kaito ties his brother’s return token beneath his headband. “They will say his name. Then I will decide what to do with mine.”', exile: 'Kaito waits at the gate with one pack. “I meant to go alone. I am glad you are bad at following orders.”', order: 'Kaito hears the council’s account without answering. “You completed the mission,” he says. “I hope that is what you wanted.”' },
        topics: [
          { label: 'Do you want revenge?', text: '“I want someone to say my brother did not run away. Every time they refuse, revenge begins to sound like an answer. I know it is not the same thing.”' },
          { label: 'Tell me about your brother', text: '“He made fire birds to amuse the academy kids. His last message had a village return token tied to it. Deserters do not carry a promise to come home.”' },
          { label: 'Will you trust me with the scroll?', text: '“I do not trust the council. That is different from not trusting you. Bring me the truth before you bring anybody my obedience.”', completed: '“We were taught to compete. I think we might be better at standing beside one another.”' },
          { label: 'Teach me an Ash clan technique', text: '“Breathe before you release fire. Anger will make it louder, but it will not make it yours. Pressing 1 is the beginning of a technique. Choosing where to aim is the rest.”' },
        ],
      },
    ],
    landmarks: [
      {
        name: 'North training grounds', phase: 'both', clue: 'chakra-form', item: 'Ash-release training cord',
        text: 'You kneel inside the elemental circle. Water steadies your pulse; wind finds the gaps between your fingers; a small ember becomes a clean flame. The lesson is control rather than force. You complete the chakra-form trial. Practise the jutsus you already carry: 1 Ember Release, 2 Shadow Clone, and 3 Substitution.',
        completed: 'The practice circle bears your footprints beside Ren’s and Kaito’s. Its fire has gone out; the warmth remains.',
      },
      {
        name: 'Bamboo crossing', phase: 'both', clue: 'mission-scroll', item: 'Recovered mission scroll',
        text: 'Under the loose bridge rope, you find a scroll sealed with the Hidden Reeds crest. Its first page is a supply order. Beneath the ink, older names shine through: Kaito’s clan, a forbidden route, and an order to leave the gate closed. Someone hid it here to keep it from the council patrol. You recover the lost mission scroll.',
        completed: 'The bridge rope is secure again. Below it, the river carries a torn scrap of the old patrol order away.',
      },
      {
        name: 'Sealed watchtower', phase: 'both', clue: 'broken-seal', item: 'The erased mission ledger',
        text: 'The Threefold Oath forms three interlocking marks around the door. Your chakra steadies the broken third mark. Inside, the original ledger confirms the scroll: the border team obeyed a village order. They never deserted. A second signature shows who changed their record. You take a copy of the evidence, leaving the original where it can no longer be hidden.',
        completed: 'The watchtower is open. There is room on its memorial wall for the names that were missing.',
      },
    ],
    endings: [
      {
        id: 'truth', label: 'Read the ledger publicly. Rebuild the village’s oath.', reward: 75, item: 'Threefold Oath headband', rank: 'Chūnin · keeper of the oath',
        text: 'You read every name in the square. Ren testifies; Sora surrenders the seal. Kaito stands beside the families instead of drawing his blade. The village has a difficult season ahead. Its new oath begins with a promise to bring people home and ends with a way to hold its leaders to it.',
        worldConsequence: 'The former rogues rejoin the village and stop attacking. You become a chūnin, and the missing clan is restored to the memorial.',
        enemyDisposition: 'peaceful',
      },
      {
        id: 'exile', label: 'Give Kaito the evidence. Leave together to find the survivors.', reward: 75, item: 'Ash clan travel token', rank: 'Wandering shinobi · sworn companion',
        text: 'You give Kaito the ledger and a second travel pack. His revenge becomes a search: some names on the mission have no grave. Ren opens the gate without asking where you are going. You leave as companions, carrying proof the council can neither command nor erase.',
        worldConsequence: 'The rogues recognise Kaito’s return token and become peaceful. Your new rank is wandering shinobi; the village loses your obedience and keeps your friendship.',
        enemyDisposition: 'peaceful',
      },
      {
        id: 'order', label: 'Return the sealed ledger to the council. Preserve the treaty.', reward: 95, item: 'Council mission insignia', rank: 'Chūnin · council operative',
        text: 'The council thanks you for completing a sensitive mission. The border treaty holds. Your promotion arrives before sunset. Kaito waits for an explanation that you cannot make convincing. In the bamboo, the shinobi who remember the original oath continue to guard it.',
        worldConsequence: 'You become a council chūnin and receive extra ryō. The rogues remain hostile, and Kaito’s trust becomes the price of the village’s silence.',
        enemyDisposition: 'hostile',
      },
    ],
  },
};

// The finalist expansion keeps the original ending IDs and progression clues.
// Replies are authored player stances; their flags unlock remembered follow-ups.
const turn = (label, text, replies = [], conditions = {}) => ({ label, text, ...conditions, ...(replies.length ? { replies } : {}) });
const reply = (label, text, flag, next) => ({ label, text, ...(flag ? { flag } : {}), ...(next ? { next } : {}) });
function writeNpc(story, name, role, intro, topics, details = {}) {
  const old = story.npcs.find(npc => npc.name === name);
  const record = { ...old, name, role, intro, waking: intro, topics, ...details };
  if (old) story.npcs[story.npcs.indexOf(old)] = record;
  else story.npcs.push(record);
}

const velvet = NEW_STORIES.lynch;
const ember = NEW_STORIES.shinobi;
velvet.objective = 'Gather six accounts: telephone awake, stage and pines dreaming, paper mill awake, observatory dreaming, and Platform thirteen awake. Bring them to Dale.';
velvet.advice = 'Move with WASD or arrows; Shift sprints; E interacts; Space flashes your camera. Q switches waking and dreaming. Main clues require the phase shown in the journal. M opens the world map; discovered travel stops shorten the journey. Ask people questions, choose replies, and accept optional stories from Silas, Teddy, or Nell.';
velvet.intro = 'June called this morning. She disappeared thirteen years ago, and the town has spent all thirteen explaining why. You have a motel reservation in your own handwriting, dated tomorrow. Dale wants six accounts before anyone writes another ending: three in old Mercy Falls, then the mill, the observatory, and the southern station. Some witnesses only speak honestly in a dream.';
velvet.resolution = 'Dale spreads the evidence over the diner counter. June collected her wages after the washout. A departure receipt names a town nobody searched. The dreaming observatory holds the words she could not make Mercy Falls hear. She wanted a life beyond this place. You can give the town that truth, keep a door open for what you still cannot know, or restore the story that made her easier to explain.';
Object.assign(velvet.clueNames, {
  'june-pay-record': 'Mill wages: June collected her final pay after the supposed disappearance.',
  'june-unsent-letter': 'An unsent letter asks for a visit without a search, and a life without a role.',
  'departure-receipt': 'Platform thirteen: June bought a one-way ticket and asked that her destination remain private.',
  'broadcast-splice': 'The relay repeats a splice Elsie made, replacing June’s departure with dead air.',
  'orchard-recipe': 'A birthday card contains June’s recipe and no request to come home.',
  'ferry-manifest': 'The last ferry carried people away from the flood; some were later listed as missing.',
  'chapel-bell': 'The chapel’s memorial list was copied from a damaged evacuation register.',
});

writeNpc(velvet, 'Dale Mercer', 'guide', 'Dale has covered the diner counter with envelopes, keeping his coffee on the floor. “June called you, not me. That matters. I can help collect accounts, but I’m done telling people what their families meant. I did enough of that at the post office.”', [
  turn('Why did you keep June’s mail?', '“Her mother asked me to hold it until she came home. Then her mother died. I kept renewing the hold because cancelling it felt like making a decision. There are thirteen Christmases in that box. Most of them are yours.”', [
    reply('You should have told me.', '“Yes. I kept rehearsing how, which is a comfortable substitute for doing it. Hester has the forwarding request at the paper mill. Ask her what date it carries. I won’t ask you to forgive the delay.”', 'dale-accountability'),
    reply('I would have kept the box too.', 'Dale rubs an envelope flat with his palm. “That helps for about a second. Then I remember someone could have been reading them. I appreciate it, though. I have had a long practice at feeling entirely alone with this.”', 'dale-understood'),
  ]),
  turn('Where should I ask after the old town?', '“The mill kept her wages. Hester is still there most days. Arthur has June’s letters at the lakeside observatory; he gets confused about which side of sleep he’s on. Mara worked the southern station. She is the one witness who actually watched June leave.”'),
  turn('Why did you believe she died?', '“Inez brought an evacuation list with June’s name on it. I saw the name and stopped reading. I had delivered her school reports, her first pay cheque, your birthday cards. I ought to have been the first person to question it.”', [
    reply('We all wanted an explanation.', '“We did. It made the town useful: casseroles, searches, a collection for the family. Saying she might have chosen to leave would have made all that kindness feel intrusive. I preferred being useful to being careful.”', 'dale-useful'),
    reply('Did anybody question the list?', '“Iris did. She worked the flood clinic. I told her a doctor couldn’t know every face in the dark. It was an ugly thing to say. If you see her by the roadside chapel, tell her I remember saying it.”', 'dale-iris'),
  ]),
  turn('What do you want me to decide?', '“Nothing before you have listened. You do not owe the town a reunion. You do not owe me a clean account. I would like June to stop being the explanation for everything we failed to say to each other.”'),
  turn('The mill paid her after the flood.', 'Dale reads the date twice. “Then those Christmas cards weren’t waiting for a dead woman. They were waiting for permission to move. I could have given them that much, even without knowing where she was.”', [], { requiresClue: 'june-pay-record' }),
], { dream: 'Dale is sorting letters by the sound they make when shaken. One says your name in June’s voice. He puts it down very gently. “I used to think unopened meant undamaged. I would like to stop being that sort of careful.”', completed: 'The envelopes are packed for forwarding. Dale has written only June’s name on the box, leaving the address blank. “I’ll ask first,” he says. “It is a small improvement, but at least I can actually do it.”', followUp: { flag: 'dale-accountability', text: '“I phoned Hester after you left. Told her I was the one who sat on the forwarding request. She was furious. I stayed on the line. You should not have had to do that part for me.”' } });

writeNpc(velvet, 'Alma Vale', 'merchant', 'Alma notices you looking at the untouched slice of pie. “I’ve been throwing it away at closing for thirteen years. Do not make that face; I also throw away the soup. Sit down. You look exactly like somebody who forgot breakfast.”', [
  turn('Did you lock the back door that night?', '“June was nineteen and wanted a bus fare. I said she could have my spare room instead. She said she didn’t need another spare room. I locked up because I was angry. She went out the front. I keep skipping that last part.”', [
    reply('You made it harder for her.', '“I know. I thought if she stayed till morning, I could make the decision sound childish. I was twice her age and doing something considerably more childish. You can have that account without me asking you to make it nicer.”', 'alma-door-admitted'),
    reply('You were trying to protect her.', '“That was my intention. It is also what I called it when I wanted her to take my advice. A person can need a meal without needing you to own the rest of their evening.”', 'alma-protection'),
  ]),
  turn('What was she like at work?', '“Terrible at carrying four cups, good with a miserable customer. She remembered who took sugar after one visit. She wanted to open a bakery somewhere people would order what they wanted instead of their usual. I told her that sounded inefficient.”'),
  turn('Who is the sixth slice for?', '“It was for June. Then it was for whoever brought good news. Lately I think it is mostly for the moment before I have to sweep the floor. I can stand here and pretend another customer is about to come in.”', [
    reply('Could I have it?', 'Alma cuts the point off to make sure the filling is warm. “Yes. It is pie, for heaven’s sake. Eat it while I find a fork. I have made this terribly complicated for something that came out of a tin.”', 'alma-pie-shared'),
    reply('Keep it tonight. I understand.', '“All right. But tomorrow I’ll put it in the window with a price on it. June hated wasted food. I managed to make missing her into something she would have scolded me for.”', 'alma-ready-tomorrow'),
  ]),
  turn('Teddy says there was a birthday card.', '“He drove June to the orchard the spring before she left. The card had a cake recipe on it. If he finds it, bring it here. I remember the icing, but I always get the amount of salt wrong.”'),
  turn('You said she could have left by the front.', '“Yes. That does not cancel what I did at the back. It just means I did not stop her. I would like you to remember the part where she was stronger than my bad mood.”', [], { requiresFlag: 'alma-door-admitted' }),
], { dream: 'Alma is serving breakfast to six coats hanging from chairs. One sleeve knocks over a cup. She wipes the table and mutters, “Same manners as ever.” Then she sees you and takes the yellow coat’s plate away. “That one is not yours to finish.”', completed: 'There is cake on the counter now, with a handwritten recipe pinned beside it. Alma has crossed out USUAL on the menu. “People can tell me what they fancy. If it slows the queue, the queue can survive.”', followUp: { flag: 'alma-pie-shared', text: 'Alma slides a plate toward you without asking. “Apple today. Do tell me if you want something else. I am trying to learn how to ask a question before deciding I know the answer.”' } });

writeNpc(velvet, 'Vivian Bell', 'ranger', 'Vivian is taking programmes out of a damp cardboard box. “I need somebody to tell me which of these smell of mildew. Apparently I am accustomed to it. If you came for a show, you have arrived both much too late and right on time.”', [
  turn('Did June want to act?', '“For a summer. She liked painting scenery better. I kept casting her as the girl who came home because audiences liked her in it. She asked to play the woman who left. I told her she was too young to understand the part.”', [
    reply('You could let her have the part now.', '“I could stop assigning it to her. That might be a better gift. She sent a letter about a bakery; I answered with a photograph of the stage. I was listening for a request she had not made.”', 'vivian-no-recast'),
    reply('You must have wanted her to stay.', '“Desperately. A theatre needs willing young people, and I was frightened of an empty room. I made that fright sound like a compliment. She was good enough to spot the difference.”', 'vivian-empty-room'),
  ]),
  turn('Why is my name on the playbill?', '“You paid for the last programme run. Remember? June said you finally believed she had a future, and you said you were only being practical. The printer copied your name into the cast by mistake. I found the mistake strangely convenient.”'),
  turn('What changes when I dream?', '“The stage stops following its floor plan. Usually it becomes the motel room. Sometimes the audience is in the room and the actors are outside. I never tell them where to sit. I have become quite bad at giving instructions here.”', [
    reply('Does the dream tell us what happened?', '“No. It tells me what I keep making happen. That is useful, provided I do not call it evidence. Take the playbill, then ask somebody who sells tickets for real departures.”', 'vivian-dream-not-proof'),
    reply('I would like to sit without performing.', 'Vivian folds down a chair. “Excellent. That is what this room was built for before I got ambitious. You can remain entirely yourself for the duration. I shall endeavour to find that interesting.”', 'vivian-seat-offered'),
  ]),
  turn('What will you put on after this?', '“Something with more than one woman in it. Something where a departure is not a punishment. The roof needs mending first, but I would enjoy having a problem I can show a carpenter.”'),
  turn('I found the departure receipt.', '“Then she managed a proper exit. No bow, no curtain call, no permission from me. I am pleased. I am also a little hurt. I can carry both without inviting her back to settle them.”', [], { requiresClue: 'departure-receipt' }),
], { dream: 'Vivian has laid a bedspread over the orchestra pit. Somebody underneath turns over, and she waits until they are settled before speaking. “I think it is the town sleeping. It snores when I say the word goodbye. Keep your voice ordinary.”', completed: 'Vivian has opened the side doors to air the theatre. The programmes are going in the recycling. She keeps one for herself. “It was a good summer. That is a smaller claim, and I find I can actually defend it.”' });

writeNpc(velvet, 'Owen Pike', 'clerk', 'Owen is trying to remove a ring left by a coffee cup from the guest register. The paper has nearly worn through. “You’ll want room six. Everybody does eventually. I can offer eight, but the television in eight only gets weather from last Thursday.”', [
  turn('Did June actually rent room six?', '“One night. Paid cash, asked for a wake-up call. I wrote WEEKLY because I assumed she would change her mind. When she left, I kept renewing the booking. An occupied room looks better in the books than an empty one.”', [
    reply('That helped turn her into a missing person.', '“Yes. The deputy asked how long she had stayed. I showed the register. I could have said the register was wrong. Instead I explained my handwriting. It was a very cowardly conversation.”', 'owen-register-admitted'),
    reply('Were you afraid for your job?', '“There was no owner left to fire me. I was afraid of admitting the motel was doing badly. June was the only paying guest that week. I made her into evidence that my life still worked.”', 'owen-job-fear'),
  ]),
  turn('Why is tomorrow’s reservation in my name?', '“I don’t know. I tried crossing it out and it appeared in the margin. I would blame damp, but damp usually has less accurate handwriting. It may help if you tell me what you are reserving it for.”', [
    reply('A night’s sleep. Nothing more.', 'Owen draws a firm line after the departure date. “There. One night. I can manage one night without making a story out of it. You may have to remind me tomorrow, but I would like the chance.”', 'owen-one-night'),
    reply('I am not staying here.', '“Understood.” He erases the room number instead of your name. “That was almost normal, wasn’t it? If the booking comes back, I’ll tell it you declined. We can both be stubborn.”', 'owen-declined'),
  ]),
  turn('Who left the suitcase out back?', '“June donated it. Said the zip jammed and she was tired of hauling things that belonged to her childhood. I told the searches it was abandoned luggage. Those sound close until you consider what each lets you think.”'),
  turn('Did she give a destination?', '“She asked whether the southern train connected with a bus. I told her Mara would know. I did not ask where she was going. At the time I thought that was polite. It is the one thing I might have got right.”'),
  turn('I want you to correct the register.', 'Owen writes ONE NIGHT beside June’s name. It takes him several attempts to make the letters fit. “I’ll give Inez a copy. If I only correct the page you can see, it is another kind of performance.”', [], { requiresFlag: 'owen-register-admitted' }),
], { dream: 'Owen has set thirteen alarm clocks on the reception desk. All are ringing very quietly. “They are for the call she asked for. I keep setting it later.” He switches one off when you enter and looks startled by the silence.', completed: 'Owen has bought a new register. He records your arrival as a visit, then stops himself from adding a room. “Would you like tea?” he asks. “You may answer no. I am practising letting that be the end of it.”', followUp: { flag: 'owen-one-night', text: '“Your booking ends tomorrow morning. I checked twice, and I did not add a week. I know how small that sounds. You have no idea how much easier it makes looking at the desk.”' } });

writeNpc(velvet, 'Elsie Reed', 'operator', 'Elsie turns the switchboard volume down before greeting you. “The calls were tolerable when I could say I was at work. Now they ring while I make soup. I am seventy-three. I would like my soup to be a private matter.”', [
  turn('Did you alter June’s recording?', '“I cut out the town name. She asked me not to tell anyone where she went. Then I cut out the bit where she said she was all right. I told myself privacy required both cuts. It did not.”', [
    reply('You hid the part that would have helped us.', '“Yes. I was angry she trusted me with leaving and not with knowing everything. I punished your family for that. Silas found the splice in the relay. I have avoided his house ever since.”', 'elsie-splice-admitted'),
    reply('You did keep her destination safe.', '“That part was proper. I wish I had separated it from my wounded feelings. You can keep a confidence and still tell a family their daughter is alive. I was old enough to know that.”', 'elsie-privacy'),
  ]),
  turn('What did June ask you to say?', '“Tell them I went. Those were the words. Not that she was taken, not that she was lost. I heard them very clearly. The public telephone has the copy I did not manage to cut. Answer it while you are awake.”'),
  turn('Why does the switchboard still work?', '“It doesn’t. Listen.” She pulls out the power lead; the bell continues. “I have had two electricians and a priest. The priest said to let it ring. I was insulted by how useful that advice turned out to be.”', [
    reply('May I sit while it rings?', 'Elsie brings you a hard kitchen chair. “Please. Everyone offers to fix it. Nobody offers to share the racket. I can put the soup on again if you are willing to eat something that has been reheated too many times.”', 'elsie-company'),
    reply('Maybe it needs an answer.', '“Perhaps. I have answered for everybody else all my life. I may try saying hello and waiting this time. If someone wants you, I promise I will not make your excuses before asking.”', 'elsie-listening'),
  ]),
  turn('What is Silas doing at the relay?', '“Keeping a clear frequency for the evacuation service. The service has not existed for years. He says that is exactly why somebody should check it. Ask him. He makes terrible tea but usually has a sensible point.”'),
  turn('Silas found the splice.', 'Elsie closes her eyes. “Then I can stop waiting for somebody to notice. I’ll give him the original connector. Tell him the missing seconds were my work. He will be relieved that the equipment is not haunted. Mostly relieved.”', [], { requiresClue: 'broadcast-splice' }),
], { dream: 'Elsie is answering calls with a soup ladle. Each voice asks what is for dinner. She tells them all the same thing, then turns to you. “I know how foolish this looks. In here, at least they ask me something I can answer.”', completed: 'Elsie has put the headphones in a drawer. The telephone remains on the table. “I am available,” she says. “That is different from being on duty. I shall try being available for a while.”', followUp: { flag: 'elsie-splice-admitted', text: '“I took the connector to Silas myself. It was a dreadful walk. He said thank you, then asked if I wanted tea. I thought he might throw me out. I had not prepared for tea.”' } });

writeNpc(velvet, 'The double', 'double', 'The person with your face is carrying a shopping bag from a store that closed when you were ten. They check the receipt before looking up. “Milk, batteries, bus fare. I got the first two. We have been disagreeing about the third.”', [
  turn('Are you the part of me that stayed?', '“I’m the part that says you could have stopped her if you had said the right thing. I have tried every thing you might have said. In some versions she stays. She does not look happier in those.”', [
    reply('I still wish I had said something kinder.', '“So do I. That is an ordinary wish. We made it into a rescue operation because ordinary wishes leave you nowhere to go. You can regret the argument without spending the rest of her life undoing it.”', 'double-regret-shared'),
    reply('You do not get to decide what I remember.', 'The double moves the bag behind their back. “All right. I have been arranging the scene when you weren’t looking. Tell me which bits you remember yourself. I can be quiet long enough for that.”', 'double-boundary'),
  ]),
  turn('Did I make her disappear?', '“You shouted. She left. Later, the road flooded. I put those events in a row and removed the gaps. It made a story where being very sorry might bring her back. I think that is why you kept me around.”'),
  turn('What is behind the door in the pines?', '“All the evenings you expected to share with her. Television, birthdays, borrowing the car. Nothing terrible. We stacked them until they became difficult to get around. The key will fit, but that does not mean June is inside.”', [
    reply('Can we leave those evenings here?', '“Yes. We could keep one or two without pretending she owes them to us. I would like the birthday where she put salt in the icing. It is embarrassing, which makes it feel more reliable.”', 'double-keeps-birthday'),
    reply('I want to open it anyway.', '“I understand. I will not tell you it is dangerous. I will ask you to notice who you expect to find. If it is somebody ready to apologise for having a life, perhaps let them remain imaginary.”', 'double-door-challenged'),
  ]),
  turn('What will happen to you after I choose?', '“I expect I’ll become less busy. There will still be bad evenings. You can ask me to sit through one without letting me rewrite the whole town. I might turn out to be decent company if you give me less authority.”'),
  turn('I want you to stop arranging my memories.', '“I have put the receipt in the bag. You can look whenever you want. There is no bus fare on it, after all. We were adding that line together.” The double waits for you to speak first.', [], { requiresFlag: 'double-boundary' }),
], { dream: 'The double has unpacked the groceries onto a tree stump. The milk is fresh; the batteries are corroded. “I can keep one thing going,” they say. “I can’t keep everything. It would be helpful if you picked before I choose for us.”', completed: 'The double has bought a different coat. The fit is poor, and they seem pleased with it. “You can recognise me without mistaking me for yourself now. I thought that might make it easier to visit.”', followUp: { flag: 'double-regret-shared', text: '“I remembered something new. You lent June your good scarf before the argument. She did not give it back. We have been leaving that out because it does not help the scene where you were entirely cruel.”' } });

writeNpc(velvet, 'Hester Wren', 'archivist', 'Hester is filing timecards beneath a roof that leaks onto the executive salaries. She has moved the hourly workers to the dry shelf. “The mill is closed, but people still ask me to prove they worked here. I imagine you want to prove somebody left.”', [
  turn('Show me June’s last timecard.', '“She came for her wages two days after the flood. Her sleeve was torn and she was annoyed about the deduction for a uniform she had returned. I corrected it. The manager said I should be pleased she was alive, not bothering with pennies.”', [
    reply('Why did nobody hear this?', '“I told Dale. He had a death list from the deputy and thought I had the date wrong. I let him think it. He was grieving, and I did not fancy making a scene. A scene would have cost us an afternoon. This cost thirteen years.”', 'hester-dale-told'),
    reply('Thank you for paying her properly.', '“She earned it. People get terribly generous with condolences and terribly strict about wages. I gave her the money she was owed. I regret that it is the kindest useful thing I managed that week.”', 'hester-wages-respected'),
  ]),
  turn('What is in the forwarding file?', '“A request for mail to be held until June could send an address. No request to report her missing. Dale wrote KEEP HERE in red. I put it away because the form was complete. I am very good at completing forms.”'),
  turn('Were you close to June?', '“No. We disagreed about the radio. She wanted music, I wanted weather. Once she played both at once to show me what compromise sounded like. It sounded awful, and we laughed until the manager came over.”', [
    reply('That sounds like her.', 'Hester smiles, then reaches for another folder. “Good. I have worried that my ordinary little memories would seem inadequate. Not every witness gets a revelation. Some of us just remember someone being funny on a wet Tuesday.”', 'hester-small-memory'),
    reply('I did not know that side of her.', '“You could not know every side. She was different at work than at the diner, and I expect different again with you. That need not mean any of you failed to see the real one.”', 'hester-many-sides'),
  ]),
  turn('What will happen to all these files?', '“A buyer wants the building cleared. I am copying pension records before he turns it into holiday rooms. He offered to preserve the management portraits. I said a photograph cannot establish somebody’s pension. He has not called back.”'),
  turn('Dale admits he held the mail.', '“Then perhaps I can tell him how angry I was without worrying it will break him. I have treated an old friend like a fragile box for years. Neither of us enjoyed being stored.”', [], { requiresFlag: 'dale-accountability' }),
], { dream: 'Hester clocks out blank cards and puts them in envelopes. Each envelope gives a little cough. “These are the hours nobody got paid for. I tried returning them to the company, but they keep finding their way back.”', completed: 'Hester has boxed the pension records for the county office. June’s card is in a plain envelope for you. “This is a copy. The original stays available to anybody who wants to challenge the date.”', followUp: { flag: 'hester-small-memory', text: '“I found the radio. It still tunes between stations the way June left it. I kept it on for a whole shift yesterday. The weather and music remain a dreadful combination. I had a pleasant afternoon.”' } });

writeNpc(velvet, 'Deputy Inez', 'deputy', 'Inez is sanding the mildew off a rescue sign. Her uniform is old enough to have faded differently beneath the badge. “If you want a statement, I have paper. If you want an arrest, you are thirteen years late and probably looking at the wrong person.”', [
  turn('Why was June on the missing list?', '“We had names from the motel, the clinic, and the ferry. I copied them onto one sheet. The heading was UNACCOUNTED FOR. The mayor asked for a list to read at the memorial. I gave him the same sheet.”', [
    reply('Unaccounted for is not dead.', '“Correct. I knew it then. I let the ceremony settle a question the search had not settled. The town slept better, and the office stopped ringing. I mistook a quieter desk for a finished job.”', 'inez-list-challenged'),
    reply('You were overwhelmed after the flood.', '“We were. That explains the first list. It does not explain me leaving it alone when Hester and Iris brought dates that disagreed. Exhaustion wore off. Embarrassment did not.”', 'inez-no-excuse'),
  ]),
  turn('What did Iris tell you?', '“That June had visited the clinic with a split lip after the supposed disappearance. I asked why she had not detained her. Iris asked what crime leaving town was. We did not talk much after that.”'),
  turn('Were people made to return?', '“Some were. Parents asked; employers asked. We called it a welfare check. It could be one. It could also be a lift back to whatever somebody had just escaped. I should have asked the passenger first.”', [
    reply('Would you ask first now?', '“Yes. I have changed the form, but the form is not the important part. The important part is waiting through an answer I dislike. I wish that skill were included with the badge.”', 'inez-new-procedure'),
    reply('I do not trust that promise yet.', '“Fair. Iris keeps copies of every correction I make. She has permission to distribute them. You need not trust me when you can check whether I actually did the work.”', 'inez-checkable'),
  ]),
  turn('Why keep wearing the uniform?', '“The county offered me a retirement dinner. I asked for another year to fix the flood records. They thought I was sentimental. I let them think that. It is easier than listing which mistakes are mine.”'),
  turn('Owen corrected June’s stay to one night.', '“Then I will correct our copy too. I will put his statement beside my signature, rather than replacing the old page. Anyone looking should be able to see what we changed and who waited to change it.”', [], { requiresFlag: 'owen-register-admitted' }),
], { dream: 'Inez’s rescue sign points in both directions. Every time she repaints an arrow, water runs out of the tin. “I kept telling people the road was safe. In here it apparently gets a vote. Give it a moment.”', completed: 'Inez has taken the badge off while she types the correction. “It makes a knocking noise against the desk. I kept finding reasons to stop. This is a job I ought to finish in one sitting.”', followUp: { flag: 'inez-list-challenged', text: '“I changed the memorial record this morning. The mayor called it insensitive. I told him we had mistaken a list of questions for a list of answers. He can be cross with me for a while.”' } });

writeNpc(velvet, 'Arthur Latch', 'astronomer', 'Arthur has labelled three flasks COFFEE, NOT COFFEE, and UNSURE. “Please use the first. The third is for an experiment I no longer understand. June used to make labels that left less room for regret. You are related, aren’t you?”', [
  turn('How did June know the observatory?', '“She cleaned here on Thursdays. Mostly she wanted the library. We had maps of other countries and a bus timetable somebody mistook for an astronomical table. She spent longer with the timetable. I thought it showed a lack of scientific ambition.”', [
    reply('It showed a different ambition.', '“Yes. She said so, with considerably less patience. I liked telling a clever young person what they ought to become. It made me feel useful without requiring me to learn what she actually wanted.”', 'arthur-ambition-challenged'),
    reply('Did you help her choose a route?', '“I lent her the timetable and money for the connection. She paid me back by post. I lost the envelope while looking for an interesting stamp. That is among the less charming things I have misplaced.”', 'arthur-bus-money'),
  ]),
  turn('Why do her letters appear only in dreams?', '“I put the first in an atlas and forgot which country. Awake, I have tried them all. Dreaming, the countries move aside and the letter is there. I realise that is a poor filing system. Hester has told me so at length.”'),
  turn('What did the letter actually say?', '“She wanted to be visited once she had somewhere worth showing. She did not want a search party. I kept the invitation because I was proud to be included, then never wrote to ask whether it was still good.”', [
    reply('You could have let the family know she was safe.', '“I could. I was fond of having a confidence nobody else had. I called that discretion. It is less flattering when you say the practical thing I failed to do.”', 'arthur-letter-accountable'),
    reply('Would she have welcomed you?', '“At first, yes. Later, I do not know. I cannot turn an old invitation into a standing obligation. If I ever find an address, I will ask instead of arriving.”', 'arthur-ask-first'),
  ]),
  turn('Do the lights over the lake mean anything?', '“Some are boats. Some are aircraft. The two that move backward have defeated my instruments. I prefer not to give them the job of explaining June. She is a person; the lights are already doing plenty.”'),
  turn('I found her unsent letter.', 'Arthur holds it by the edges. “This is a draft. The ink stops where she tried to tell us we were frightening her. I suppose the dream has been keeping the sentence she could not bear to send.”', [], { requiresClue: 'june-unsent-letter' }),
], { dream: 'Arthur is measuring the distance between two stars reflected in a saucepan. One slips under the handle. “The sky is much closer tonight. I have asked it to leave the timetable alone. We have enough difficulty with the terrestrial connections.”', completed: 'Arthur has addressed an envelope ASK FIRST and put it on top of every atlas. “It is not a postal address. It is an instruction for the part of me that will get excited and forget.”', followUp: { flag: 'arthur-ambition-challenged', text: '“I told Hester I had lent June the fare. She asked why I always describe her leaving as a failure of my teaching. I disliked the question enough to suspect you would approve of it.”' } });

writeNpc(velvet, 'Mara Voss', 'conductor', 'Mara is sweeping a platform no passenger service reaches anymore. Her old timetable is weighted down with a brick. “If you ask when the next train comes, I’ll give you an honest answer. It will be depressing. I can offer tea afterwards.”', [
  turn('Did you see June leave?', '“Yes. She missed the first connection, argued with the ticket machine, then bought a one-way fare at my window. I remember her because she apologised to the machine. People usually apologise to me for being rude to it.”', [
    reply('Was she frightened?', '“Some. Also excited. Also irritated about the fare. I cannot reduce her to the feeling that makes the story work. She asked me to wake her if she slept through the stop, so she expected there would be one.”', 'mara-whole-person'),
    reply('Where was she going?', '“She asked me not to tell anyone who might come after her. I can prove she bought the ticket without giving you her destination. That may not be what you came for. It is what I can honestly offer.”', 'mara-destination-boundary'),
  ]),
  turn('Why did you never give a statement?', '“I did. Inez filed it under POSSIBLE SIGHTING because the date disagreed with the list. I stopped chasing it after three calls. I had a son in the flood clinic and a mortgage. Those things were real. So was my impatience.”'),
  turn('Why keep the station tidy?', '“Because I live upstairs, and I dislike looking out at rubbish. People expect a grand reason for staying in a closed place. I swept when trains came and I sweep now. You may admire it less once you know.”', [
    reply('I prefer that answer.', '“Good. Then I can stop inventing speeches about the railway. There are biscuits in the office. They are fresh enough, and there is nothing symbolic about them unless you decide to make an issue of the tin.”', 'mara-ordinary'),
    reply('Do you ever want to leave?', '“Frequently. I visit my son twice a year. Then I come back because I like the upstairs light in the morning. June might have found something like that elsewhere. I hope she did.”', 'mara-travel-not-loss'),
  ]),
  turn('What is on Platform thirteen?', '“A departure receipt, folded inside the old signal box. I saved it when the office flooded. The platform is down the line from here. The number is ridiculous; there were never twelve others. Nobody wanted to renumber the paperwork.”'),
  turn('I will leave her destination private.', 'Mara unlocks the ticket drawer. “Thank you. It is easier to show you the receipt when I know you are not going to turn it into instructions. There is a copy of her request beside it.”', [], { requiresFlag: 'mara-destination-boundary' }),
], { dream: 'Mara’s broom clears water off the platform without making anything dry. A train can be heard under the boards. “I do not sell tickets for that one. The people who take it always think they recognise the conductor.”', completed: 'Mara has placed June’s receipt in a waterproof sleeve. “There. Proof of leaving, with the destination covered. If somebody says those cannot be separate, send them to me. I have a working kettle and plenty of time.”', followUp: { flag: 'mara-whole-person', text: '“I remembered something else. She bought a lemon sweet for the journey and made a face when she tried it. You can have that detail for free. It does not establish a blessed thing, except that she was there.”' } });

writeNpc(velvet, 'Teddy Fenn', 'traveler', 'Teddy is trying to mend a picnic stool with a shoelace. The knot holds until he sits. “It’s a travelling stool. Apparently I am meant to keep travelling. June used to come out here for birthdays. I thought I ought to make the place usable.”', [
  turn('What happened to the birthday card?', '“I put it in a tin under the orchard bench. June asked me to save it because Alma kept borrowing the recipe. Then the river moved. In a dream the bench is still above water. I can see the tin but cannot reach it.”', [
    reply('I can try to recover it.', '“Thank you. I would like to make the cake once without ringing Alma in tears about the measurements. She is kind, but she has started keeping the flour on the counter before she answers.”', 'teddy-help-offered'),
    reply('Are you looking for a message from her?', '“I was. Then I remembered she wrote a recipe and a rude drawing of me. I would like those actual things, rather than a message I have spent years persuading the paper to contain.”', 'teddy-card-not-oracle'),
  ]),
  turn('Why did June like this orchard?', '“Nobody worked here after six. She could talk without a customer needing coffee or a relative knowing better. Once she said she might move away. I replied that I could drive her to the bus. She seemed surprised I had heard her.”'),
  turn('Did you drive her when she left?', '“No. I was out of town. I have made myself feel awfully important about that. She found another lift. It turns out I was helpful in a way that did not make me necessary.”', [
    reply('That sounds like a good kind of help.', 'Teddy reties the shoelace and leaves the stool empty. “I am attempting to appreciate it. I wanted to be the person who brought her back. Being the person who once offered a lift is less impressive, but it happened.”', 'teddy-help-not-needed'),
    reply('You can still miss the chance.', '“I do. I wish we’d had the hour in the car. I am trying not to make that wish sound like she owed me the journey. You are surprisingly good company for such an awkward picnic.”', 'teddy-missed-hour'),
  ]),
  turn('What will you do with the recipe?', '“Bake a cake, take it to Alma, complain about the salt. If we tell a June story while eating it, it can be the one about her putting candles in a sandwich because she forgot the cake. That is the appropriate level of ceremony.”'),
], { dream: 'Teddy’s picnic stool is standing perfectly on the flooded ground. It collapses whenever he compliments it. “Please don’t say it looks sturdy. I have finally found a chair that responds honestly to encouragement, and it is extremely inconvenient.”', completed: 'Teddy has bought a chair. He keeps the old stool folded beside it. “The cake worked. Alma said it was too salty. I checked June’s card: she wrote add more next time. I think we were warned.”', followUp: { flag: 'teddy-card-not-oracle', text: '“I remembered the drawing. She gave me six elbows because I could never set up the picnic table. I would have preferred a profound farewell, but six elbows is an excellent likeness.”' } });

writeNpc(velvet, 'Silas Holt', 'radio', 'Silas is listening to the relay through a mug pressed against its cabinet. “The headphones packed in. This has better bass. If you came about the signal, I need an impartial ear. If you came about the tea, I cannot offer impartial reassurance.”', [
  turn('What is on the dead-air frequency?', '“Eight seconds of hiss where a voice should be. Then an emergency tone. It loops every night. People hear the tone and remember the flood, but the cut is not flood damage. Somebody spliced it neatly. Elsie used to make those splices.”', [
    reply('You think Elsie did it deliberately.', '“Yes. I also think there may be a reason I have not heard. I have spent years accusing her to a radio cabinet. That is a lousy way to have an argument. A second ear might get me past it.”', 'silas-confront-with-care'),
    reply('Could the equipment have failed?', '“Of course. I tested it until I wanted it to fail. A fault would spare me a walk to her house. The join is clean and the missing words start mid-sentence. I can show you what I checked.”', 'silas-test-demanded'),
  ]),
  turn('Why preserve the emergency channel?', '“We used it to guide boats out during the flood. When the county closed it, they sent a memo, not a new plan. I keep one working frequency. It has mostly transmitted weather and my complaints about the county.”'),
  turn('What do you need from me?', '“Listen at the relay. Keep the splice rather than adjusting it away. Then ask Elsie about the connector. I need her account beside the mechanical evidence before I decide whether to repair the loop or leave it available for people to hear.”', [
    reply('I will bring both accounts.', '“Good. I have been tempted to make the machine a witness that agrees with me. It cannot explain why a person did something. I need somebody willing to walk farther than my temper has taken me.”', 'silas-two-accounts'),
    reply('Do you want an apology?', '“Yes. I also want the right signal. I would like not to confuse the two when she answers. An apology will not mend a connector, and a mended connector will not tell me whether we can have tea.”', 'silas-apology-named'),
  ]),
  turn('Why is the tea so bad?', '“I keep the pot warm with the transmitter exhaust. It is efficient and terrible. Elsie brought a kettle once. I returned it because I thought she was being patronising. If you want a concise account of our friendship, there it is.”'),
], { dream: 'Silas’s mug transmits your breath a second before you take it. He turns the dial away. “No preview channels in my workshop. I make enough bad decisions in the proper order. Would you mind breathing somewhere less connected?”', completed: 'Silas has a kettle on a separate plug. The relay plays ordinary rain reports. “We left the old splice in the archive. You can hear what happened without having to hear it every night. Elsie came over. The tea was drinkable.”', followUp: { flag: 'silas-two-accounts', text: '“I put your name on the repair note, then took it off. You helped, but I did the work and Elsie brought the connector. I am trying to stop using somebody respectable as a shield for an awkward conversation.”' } });

writeNpc(velvet, 'Dr. Iris Moss', 'physician', 'Iris is airing blankets outside the roadside chapel. “If you are here to tell me the memorial list is wrong, I know. If you are here to let me correct it, bring a chair. It may take longer than the people on it were given.”', [
  turn('Did you treat June after the flood?', '“Two days after. Split lip, no concussion, thoroughly cross about everyone asking whom she belonged to. I cleaned the cut and asked whether she wanted someone called. She said no. I wrote that down, and I respected it.”', [
    reply('Why not tell the family she was alive?', '“I should have told the deputy the missing list was wrong without giving a location. I did say it was wrong. When they dismissed me, I retreated into confidentiality. A good principle became somewhere to hide my anger.”', 'iris-confidentiality-challenged'),
    reply('Thank you for asking her first.', '“She deserved that much. It is not the whole account of how I behaved. You can appreciate the question and still ask why I did not follow the records farther. I am accustomed to people needing both.”', 'iris-consent-respected'),
  ]),
  turn('What is the chapel memorial based on?', '“A wet evacuation register. Inez copied names; the mayor supplied the word lost. Some people did die. Some crossed on Nell’s ferry. I will not remove the dead to correct the missing. I want a list that admits it contains two different questions.”'),
  turn('Nell wants to correct a ferry name.', '“Her husband was on the boat, not in the river. He left after the flood and she kept it private. The memorial put him among the dead. Let her tell you the rest herself; she has had enough people improving her story for her.”', [
    reply('I will let her choose what gets recorded.', '“Thank you. A public record can establish he survived without announcing whom he moved in with. Privacy is possible if we stop treating it as an excuse to leave a falsehood standing.”', 'iris-nell-privacy'),
    reply('The whole truth should be public.', '“Then ask whose truth it is and who pays when you publish it. A list can stop lying without becoming a noticeboard for everybody’s marriage. I am happy to argue that point over a second chair.”', 'iris-public-challenged'),
  ]),
  turn('Do you still work as a doctor?', '“Three afternoons a week. Knees, blood pressure, babies with fevers. People think the flood made me a keeper of secrets. Mostly it made my back ache. I would appreciate a future in which we speak more about knees.”'),
], { dream: 'Iris is washing a blanket that stays dry in the basin. Names appear in the foam, then separate into letters. “They keep turning into patients I could have saved. If you see one that is yours, you may take it, but do not call it a diagnosis.”', completed: 'Iris has made two lists: confirmed deaths and departures still needing consent to name. “It is untidy. It should have been untidy thirteen years ago. The forms fit less neatly in a drawer, but the people fit better.”', followUp: { flag: 'iris-nell-privacy', text: '“Nell let me write the correction in her own words. She crossed out my first sentence. I was about to explain why it was more professional, then remembered what we discussed. Her version was clearer.”' } });

writeNpc(velvet, 'Nell Ash', 'ferryman', 'Nell is replacing a rope on the ferry landing. She stops before greeting you so she can finish the knot. “I have been starting this one when anybody asks about my husband. It is an excellent knot. It has taken twelve years.”', [
  turn('What happened on the last ferry?', '“We took twenty-three people across after the road went. My husband was one. He survived. He also left me when we reached the far bank. I told the searchers he was gone. They supplied the sort of gone that earned a plaque.”', [
    reply('Did you mean them to think he died?', '“The first time, no. The next time, I did not correct it. I was ashamed he had left and grateful people were kind. Then accepting kindness required another little silence. I have grown tired of the upkeep.”', 'nell-silence-admitted'),
    reply('You did not owe them your marriage.', '“No. But I could have said he survived without giving them an account of our breakfast arguments. Iris says that too. I wish I had separated my privacy from the memorial before it became everybody’s business.”', 'nell-privacy-supported'),
  ]),
  turn('Why retrieve the ferry manifest now?', '“It has his signature. The sunken ferry keeps it dry, which is as strange as everything else here. Bring it to the chapel, then ask Iris to help with the wording. I want him off the dead list without inviting questions I will not answer.”'),
  turn('Do you ever hear from him?', '“A birthday card every year. This year he asked if I wanted to meet for coffee. I said I would think about it. Being officially widowed makes that difficult to explain to the woman who runs the café.”', [
    reply('You could meet somewhere else.', 'Nell laughs hard enough to loosen the knot. “A practical solution. I have been collecting elaborate moral solutions and forgetting there are other cafés. Thank you. I may still say no, but I can say it for a better reason.”', 'nell-other-cafe'),
    reply('You do not have to forgive him.', '“I know. I would like not forgiving him to be an ordinary decision I make, rather than a secret held up by a disaster. He can be alive and disappointing. It is a perfectly common condition.”', 'nell-no-forgiveness-required'),
  ]),
  turn('Will the ferry ever run again?', '“No. The hull is gone, and the current changed. I keep the landing safe for walkers. You do not have to bring back a ferry to cross somewhere new. There is a footbridge upstream that people refuse to find romantic.”'),
], { dream: 'Nell’s rope rises from the landing into the dark sky. Something on the other end knocks politely three times. “I keep expecting it to ask for a return fare. If it does, tell it I stopped issuing returns.”', completed: 'Nell has removed the mourning ribbon from the landing. The fresh rope is tied properly. “Iris’s wording fits on one line. He survived; details private. I cannot believe a sentence that short has taken me this long.”', followUp: { flag: 'nell-other-cafe', text: '“I picked a café two towns over. I have not agreed to meet him. I just chose somewhere with decent parking. It felt good to make one small decision without consulting the entire flood.”' } });

velvet.landmarks.forEach(place => { place.main = true; });
velvet.landmarks.push(
  { name: 'Abandoned paper mill', main: true, phase: 'waking', clue: 'june-pay-record', item: 'June’s final-pay receipt', text: 'June’s timecard ends two days after the washout. A receipt beside it records wages paid in cash, with the uniform deduction crossed out by Hester. June signed carefully and added a new date when the clerk used the old one. The town’s account requires her to have vanished before she did this. She was here, insisting on what she was owed.', wrongPhaseText: 'Every timecard bears today’s date. The workers have signed in, but no shift ends. The record you need is a waking one; these cards only know what the mill kept taking.', completed: 'The copied receipt is in your journal. Hester has left the original visible, held down by a clean piece of glass.' },
  { name: 'Lakeside observatory', main: true, phase: 'dream', clue: 'june-unsent-letter', item: 'June’s unsent letter', text: 'The telescope points into an atlas. Between two countries, June’s draft letter reads: “I would like you to visit when I have a place. I do not want you to come looking. Please ask what I am doing before you tell me what I should be.” The ink stops where she began explaining the difference. This is a dream’s account, not a postal address.', wrongPhaseText: 'The telescope shows ordinary water. An atlas lists every country except the one Arthur remembers. June’s unsent words remain on the dreaming side; an instrument cannot pull them into proof.', completed: 'The atlas is open to an unmarked page. The lake lights keep their own movements. They owe the town no explanation.' },
  { name: 'Platform thirteen', main: true, phase: 'waking', clue: 'departure-receipt', item: 'A one-way departure receipt', text: 'Inside the signal box is a paid one-way receipt, dated after June’s final wages. Mara has covered the destination with paper. June’s note beside it says, “If anyone asks, say I chose the train. Please leave the rest for me to tell.” The receipt proves a departure. The note asks you to resist turning proof into pursuit.', wrongPhaseText: 'A train waits without opening its doors. The tickets name feelings instead of stations. This departure must be checked awake, where a fare was paid and a witness can be questioned.', completed: 'The signal is down. You have the receipt and June’s request, with the destination still covered.' },
  { name: 'Dead-air relay', main: false, phase: 'both', clue: 'broadcast-splice', item: 'The cut relay segment', text: 'You play the loop slowly. June begins to say she is all right, then the emergency tone interrupts. The join is clean: two parts deliberately connected, eight seconds removed. You keep a copy of the splice for Silas and Elsie. A machine can show what was cut; only the person who cut it can explain why.' },
  { name: 'Flooded orchard', main: false, phase: 'dream', clue: 'orchard-recipe', item: 'June’s birthday recipe', text: 'The picnic bench sits just above the black water. In a biscuit tin, June’s card contains a cake recipe and a drawing of Teddy with six elbows. “More salt next time,” she has written beneath the icing. There is no hidden farewell. Teddy asked for something she actually made; this is it.', wrongPhaseText: 'Only the top of the picnic bench is visible beneath the flood. The biscuit tin can be reached in the dream, where the orchard still remembers dry evenings.' },
  { name: 'Roadside chapel', main: false, phase: 'waking', clue: 'chapel-bell', item: 'A copy of the memorial list', text: 'The memorial lists confirmed deaths beside names copied from an evacuation register. Nell’s husband is among them. The engraving makes no distinction between drowned, departed, and not yet found. You copy his entry without changing the stone. Iris can help make a correction that proves he lived without publishing the private reasons he left.', wrongPhaseText: 'The chapel is ringing every bell at once. None of the letters on the memorial remain still. Check the list awake; a correction needs the words people actually read.' },
  { name: 'Sunken ferry', main: false, phase: 'both', clue: 'ferry-manifest', item: 'The last ferry manifest', text: 'The manifest lies in an air pocket beneath the broken cabin. Twenty-three passengers signed it on reaching the far bank. Nell’s husband wrote his name beside a request to have no family contacted. The signature establishes survival. His request establishes a boundary. You take a copy for Nell rather than guessing which matters more.' },
);
velvet.sideQuests = [
  { id: 'last-good-frequency', title: 'The last good frequency', giver: 'Silas Holt', offer: 'Help Silas repair the night broadcast.', intro: 'Silas needs the cut segment from Dead-air relay and Elsie’s account of the splice. He wants a working emergency frequency without using the repair to settle an argument he has never had honestly.', steps: [{ type: 'investigate', feature: 'Dead-air relay', text: 'Keep the relay splice.' }, { type: 'talk', feature: 'Elsie Reed', text: 'Hear Elsie’s account.' }], returnText: '“You brought the splice and spoke to Elsie. Let me put the two accounts together before I touch the wire.”', completeText: 'Silas preserves a copy of the cut, then repairs the live signal with Elsie’s connector. He writes her part in the fault log and leaves a space for his own delay. The night loop becomes an ordinary weather report. “We may manage tea next,” he says.', reward: 35, item: 'A clear emergency frequency' },
  { id: 'orchard-birthday', title: 'A cake, not a message', giver: 'Teddy Fenn', offer: 'Recover June’s birthday recipe for Teddy.', intro: 'Teddy wants the card from Flooded orchard, reachable in a dream, and Alma’s help making the cake. He is trying to celebrate something June did without asking it to explain everything she did later.', steps: [{ type: 'investigate', feature: 'Flooded orchard', text: 'Recover the card from the picnic tin.' }, { type: 'talk', feature: 'Alma Vale', text: 'Ask Alma about the recipe.' }], returnText: '“You found the drawing? Good. Alma will say there is too much salt. Tell me whether the card really says to add more.”', completeText: 'Teddy copies the recipe before taking the original to Alma. They make a cake and argue about icing instead of departures. You get the first slice. The card keeps its jokes and its ordinary purpose; nobody has to call it June’s last message.', reward: 30, item: 'A slice of June’s birthday cake' },
  { id: 'river-return', title: 'Not lost at the crossing', giver: 'Nell Ash', offer: 'Help Nell correct the flood memorial.', intro: 'Nell’s husband survived the ferry and later left her. Recover his signature from Sunken ferry, check Roadside chapel awake, and ask Dr. Iris Moss how to correct a public error while leaving a private marriage private.', steps: [{ type: 'investigate', feature: 'Sunken ferry', text: 'Copy the survivor’s signature.' }, { type: 'investigate', feature: 'Roadside chapel', text: 'Check the public memorial entry.' }, { type: 'talk', feature: 'Dr. Iris Moss', text: 'Ask Iris to help with the correction.' }], returnText: '“The signature is his. The chapel has the wrong account. I would like Iris’s sentence, not the one people find more comforting.”', completeText: 'Nell signs a correction: survived the crossing; further details private. Iris sends it to the county, and Nell removes the ribbon from the landing. She is free to decide whether to answer this year’s card without holding up a false memorial to keep the question secret.', reward: 40, item: 'Nell’s brass ferry token' },
];

ember.objective = 'Complete six field trials: training grounds, bamboo scroll, watchtower, Stormwater falls, Ash-clan archive, and Border oath gate. Clear two rogues or learn Sora’s peaceful passphrase.';
ember.intro = 'Your first field assignment was meant to be a scroll recovery. Kaito believes the missing ledger can clear his clan’s name; Ren is worried enough to send you rather than a council patrol. Begin with the village trials, then follow the evidence through Stormwater falls, the Ash archive, and the southern border. Return with an account the elders cannot seal away.';
ember.advice = 'Move with WASD or arrows; Shift sprints; E interacts; Space throws kunai. 1 casts Fire Release, 2 makes a Shadow Clone decoy, and 3 uses Substitution to evade. Chakra regenerates; all three jutsus are available immediately. M opens the world map, including discovered travel stops. Ask Sora for the watchtower passphrase to waive required rogue defeats. Emi, Riku, and Toma offer optional missions.';
ember.resolution = 'The evidence agrees across six sites. The Ash team obeyed a village order; council clerks later called them deserters. Kaede’s triage record and the border roster show survivors whom nobody tried to bring home. Ren is ready to testify. Kaito wants their names restored before he decides what justice looks like. You can publish the ledger, take it with him to find the survivors, or return it to the council and preserve a treaty built on silence.';
Object.assign(ember.clueNames, {
  'falls-triage': 'Stormwater triage: Ash shinobi rescued civilians under an order issued before the border closure.',
  'archive-counterseal': 'The Ash archive holds the original mission and the council’s altered copy.',
  'border-survivors': 'Border returns: several Ash shinobi survived, but the gate was ordered to refuse them entry.',
  'market-ledger': 'Market accounts: a levy meant for clan leaders was charged to Hina’s medical delivery.',
  'bridge-anchor': 'The old bridge anchor failed at an unrepaired council inspection mark.',
  'marsh-addresses': 'Water-message rolls preserve the names of surviving Ash families, without their current addresses.',
  'hermit-countermark': 'Isao’s countermark identifies the message as a request for help, not a desertion notice.',
});

writeNpc(ember, 'Ren', 'guide', 'Ren is mending the same tear in his sleeve for the third time. “I have taught you six knots, and apparently none of them holds cotton. Your mission is the missing scroll. My mission is making sure a student does not inherit my worst habits.”', [
  turn('What are you afraid I will find?', '“An order bearing a name I trusted. When Kaito’s clan failed to return, I accepted the report because questioning it would have meant questioning my own promotion. I was very good at noticing everybody else’s ambition.”', [
    reply('You should have told Kaito sooner.', '“Yes. I kept waiting until I could give him the whole account, as if a useful fact had to arrive with a complete explanation. When you bring the evidence back, I will tell him what I knew before I discuss what I did not.”', 'ren-accountability'),
    reply('Then help me prove what happened.', '“I will testify to the orders I saw. Kaede at Stormwater falls kept records nobody asked her to keep. Jun guards the Ash archive. Captain Raika controls the border gate. Ask them separately; we have become far too good at agreeing in a room.”', 'ren-witness-plan'),
  ]),
  turn('What matters more: the mission or the team?', '“The team. I would like you to remember I said that when an officer begins explaining exceptional circumstances. Missions can be revised. A name on a memorial tends to remain where you put it.”', [
    reply('Will you say that to the council?', '“In precisely those words. I should have done it when I was younger and more difficult to replace. They will call it an emotional position. I intend to agree rather than pretending it is merely a tactical one.”', 'ren-team-first'),
    reply('What if saving the team loses the scroll?', '“Then we solve a missing-scroll problem with a living team. I can give that instruction easily here. It will cost more in the field, which is why I am putting my name to it before you leave.”', 'ren-explicit-order'),
  ]),
  turn('Can I handle the rogues without fighting?', '“They were village shinobi before the council renamed them. Sora knows the old watchtower passphrase. They still respect the oath it invokes. You can use that respect without pretending everybody on the road has become your friend.”'),
  turn('Why pair me with Kaito?', '“You listen when he stops talking. Most students start planning their answer. Also, he needs a rival who will tell him when his stance is terrible. His stance is occasionally terrible. You may quote me if it improves his footwork.”'),
  turn('Kaede recorded survivors at the falls.', 'Ren closes the sewing kit. “Then the report was not merely a lie about why they died. It was an excuse not to look for people who lived. I will need to change the first sentence of my testimony.”', [], { requiresClue: 'falls-triage' }),
], { completed: 'Ren has removed the council patch from his sleeve, leaving your repair knot visible. “I gave the academy a copy of my statement. A student should be able to ask what their teacher did before accepting a lesson about duty.”', followUp: { flag: 'ren-team-first', text: '“I put our instruction in the mission book: bring the team home; recover the scroll when possible. Nori asked why I had never written it that way before. I did not have a flattering answer.”' } });

writeNpc(ember, 'Mako', 'merchant', 'Mako is teaching a small child how to wrap a rice ball without wrapping their fingers. “The academy teaches flame control before lunch preparation. I consider that a hazardous order of priorities. You can buy a charm, but eat something first.”', [
  turn('Why do you feed Kaito for free?', '“Because I saw him count coins instead of ordering. If I called it charity, he would stop coming. I told him I needed a reliable critic. He is incredibly reliable; apparently everything needs more pepper.”', [
    reply('He might resent being looked after.', '“He might. I ask whether he wants food and let him say no. You can offer care without making somebody demonstrate gratitude. I did not learn that quickly. My first attempts involved rather too much fuss.”', 'mako-care-consent'),
    reply('Can I pay for his next meal?', '“You may pay for another rice ball and let me offer it. I will not tell him he has acquired a generous rival. He has enough difficulty accepting lunch without it becoming another contest.”', 'mako-next-meal'),
  ]),
  turn('What did the clan inquiry do to the market?', '“People stopped buying Ash goods. Then they complained the trade was gone. I sold their lamps from my stall with the makers’ names intact. The council inspector said it was bad timing. I invited him to explain good timing to someone’s rent.”'),
  turn('Did you know Kaito’s brother?', '“He used to practise tiny fire birds over my stove. Burnt the awning twice and repaired it badly both times. People describe him now as an emblem. I remember a boy who could not sew but refused to leave a hole.”', [
    reply('Kaito should hear that story.', '“He has. He likes it until I mention the sewing. Then he says his brother was good at everything. I let him argue. Missing somebody need not turn every story into a ceremony.”', 'mako-brother-ordinary'),
    reply('Does Kaito make the fire birds too?', '“Not here. He makes practice flames hot enough to crack a bowl. I keep a spare awning in case he eventually wants to try the silly version. I would be delighted to need it.”', 'mako-fire-bird-hope'),
  ]),
  turn('Who is struggling at the lantern market?', '“Emi. The levy collector charged Hina for a medicine route because her seal was Ash-made. Ask Emi to show you the account before believing the council explanation. She will talk quickly, but the numbers are careful.”'),
], { completed: 'Mako hangs a repaired Ash lantern over the stall. The child asks who made it. He gives the maker’s name instead of the clan first. “That is how we used to sell things,” he tells you. “It was not especially difficult.”', followUp: { flag: 'mako-brother-ordinary', text: '“Kaito tried the small fire birds. He burnt one corner of the spare awning. Then he asked for thread. I believe that is progress, though I have not invented a rank for it.”' } });

writeNpc(ember, 'Aya', 'ranger', 'Aya is pulling burrs from her trousers and sorting them by size. “A patrol report should contain useful detail. These tell me somebody ran through the west hedge. They also tell me I should stop using the west hedge as a shortcut.”', [
  turn('Who hid the scroll at the crossing?', '“A village courier, not a raider. The tracks approach from the watchtower, double back, and stop beneath the bridge rope. Whoever hid it wanted a genin to find it before a council patrol did. I did not put that conclusion in the first report.”', [
    reply('Why did you leave it out?', '“The captain had already called it an enemy theft. I supplied the footprints and let his heading do the interpretation. It is a tidy way to avoid signing a lie yourself. I am not proud of how useful I found it.”', 'aya-heading-challenged'),
    reply('Are you protecting the courier?', '“Yes. Also myself. Both can be true. I can tell you the route without naming somebody who risked it. If you find them, ask whether they want to be part of a public account.”', 'aya-courier-privacy'),
  ]),
  turn('Why did the rogues stay near the tower?', '“They are guarding the old oath record. Some lost people on that border mission. They do not trust a council seal anymore, but they recognise the original passphrase. Sora knows it. Speaking to her is less exhausting than fighting everybody who remembers.”'),
  turn('What does the Reed clan teach its scouts?', '“Read what is there before deciding what it means. Then do it again. My aunt could follow somebody across wet stone. She still asked them where they had been; she did not think a footprint could explain a person.”', [
    reply('Would you teach me that patience?', '“Walk one stretch without chasing the first thing you notice. Let the route develop. You will be wrong less theatrically. Kaito hates this lesson, which usually means it is one he could use.”', 'aya-patience'),
    reply('What if waiting loses the trail?', '“Then you choose with incomplete evidence and state that it is incomplete. The mistake is calling a hurried choice certainty so nobody asks how you made it. I have written several reports I would now phrase differently.”', 'aya-uncertainty'),
  ]),
  turn('Who can read the water messages?', '“Toma keeps the marsh rolls. He knows which knots are addresses and which are pleas for help. They look alike until you have a reason to care about the difference. He has a cousin whose message never reached home.”'),
  turn('Will you correct the theft report?', '“Yes. I will put my first report beside the correction rather than destroying it. If somebody asks why I changed my mind, the footprints are still there. So is the heading I should have challenged.”', [], { requiresFlag: 'aya-heading-challenged' }),
], { completed: 'Aya has written a longer report than usual. The last paragraph lists what she cannot establish. “Raika asked whether that makes me look unsure. I said yes. It would be alarming if I looked sure about those bits.”', followUp: { flag: 'aya-courier-privacy', text: '“The courier agreed to testify about the route, not their family. I made the distinction explicit. It took another paragraph. The captain can survive a paragraph; that is why we promote people.”' } });

writeNpc(ember, 'Nori', 'quartermaster', 'Nori measures a practice vest against your shoulder before saying hello. “Growth spurt? Terrible timing. I ordered this for the person you were last month. Stand still. I can alter cloth more easily than I can alter an expense report.”', [
  turn('Can you prove the border team expected to return?', '“Seven return tokens, signed out to seven shinobi. I cut the cord for each one. The council report says no return equipment was issued. That would require me to have miscounted seven separate times and forged my own inventory.”', [
    reply('Will you sign a statement?', '“Already signed one. It was returned for using the wrong form. I kept the envelope. Bring the ledger back and I will attach the statement to it with so much thread they cannot pretend it fell out.”', 'nori-testimony'),
    reply('Why did you keep issuing their names?', '“Families still needed supplies. If I marked them deserters, the allowance stopped. I made an administrative error every month. It is the only way I have ever enjoyed being poor at my job.”', 'nori-family-allowance'),
  ]),
  turn('What happened to your hand?', '“Bridge charges went early. I kept the rope brake shut until the last child crossed. People like the heroic version. The ordinary version includes me being frightened and somebody else carrying me home. You may remember that version as well.”'),
  turn('What should I take on a long route?', '“Food you will actually eat, a cord you know how to tie, and space in the pack. You will find things worth bringing back. New recruits fill every pocket, then discover evidence is less portable than spare enthusiasm.”', [
    reply('I thought a shinobi should travel light.', '“Light is relative to what you need. Isao once took six books and forgot water. His pack was lighter at the end, but I would not call the experience a lesson in efficiency.”', 'nori-travel-joke'),
    reply('I will leave room for someone else’s things.', '“Good. People who have been forced to move often need another pair of hands more than they need another sword. Try to ask which belongings matter before choosing the ones that look expensive.”', 'nori-room-in-pack'),
  ]),
  turn('Who checks the old suspension bridge?', '“Riku. He sends excellent repair requests to an office that keeps returning them for lacking a patrol priority. Speak to him if you go east. A bridge does not become safe because nobody has been ordered to cross it.”'),
  turn('The border roster shows survivors.', 'Nori stops measuring the vest. “Then we need travel packs, not memorial sashes. I can turn the order around before the supply clerk notices. For once, I would like the paperwork to be late for a useful reason.”', [], { requiresClue: 'border-survivors' }),
], { completed: 'Nori has packed supplies under the restored names. Each label includes a family contact and a blank space for the shinobi’s own instructions. “A return token ought to mean we are prepared to receive somebody, not just prepared to count them.”', followUp: { flag: 'nori-room-in-pack', text: '“I put a spare carry strap with your things. No charge. Someone who leaves space for another person’s belongings may eventually need help with the weight. You can call it equipment if accepting a favour makes you fidget.”' } });

writeNpc(ember, 'Sora', 'elder', 'Sora has moved her chair off the oath plaque so you can read it. “People started asking permission to stand here. That should have told me something about how I was using the place. I will answer what I can. You need not bow first.”', [
  turn('Teach me the watchtower passphrase', '“A village is everyone who must come home. The guards know those words. Say them as an oath, not a threat. They will let you pass without a fight. I helped write the phrase before I helped find ways around it.”', [
    reply('Do you still believe the oath?', '“Yes. Believing it while excusing what I did has become unpleasant. I deserve the unpleasantness. You may use the words even if you no longer trust the person giving them to you.”', 'sora-oath-challenged'),
    reply('Then I will bring people home.', '“Good. Ask whether they want to come. We once used this oath to make returning compulsory and then used it again to shut a gate. I would like your version to contain fewer convenient exceptions.”', 'sora-consent'),
  ], { clue: 'watchtower-password' }),
  turn('Who ordered the Ash mission?', '“The council, with my seal. We were told the border would open after the team drew the rival patrol away. When the border stayed closed, I signed the revised report instead of admitting the promise had failed. My signature appears on both.”', [
    reply('You called loyal people deserters.', '“Yes. Not accidentally, and not because a clerk chose the wrong word. It made the treaty easier to defend. It also made their families easier to ignore. I will not put a passive sentence between myself and that decision.”', 'sora-deserters-confronted'),
    reply('Would refusing have broken the treaty?', '“Possibly. That was the risk we kept describing. We did not describe the risk to the people already beyond the gate. A calculation can look balanced if you omit everybody whose answer might trouble you.”', 'sora-treaty-tradeoff'),
  ]),
  turn('Why speak now?', '“Kaito asked me his brother’s name at the last ceremony. I gave him the clan title. He repeated the question until I said the name. I discovered I had made official language into a way to avoid speaking to a child.”'),
  turn('What can the village do after the truth?', '“Pay the families what was withheld. Record who gave each order. Let witnesses decline a public role. Change who can close a border. None of that is as quick as asking everyone to forgive us. I think we have had enough quick ceremonies.”'),
  turn('The archive has both signed versions.', '“Then take both. I will not ask to correct the second before anyone sees it. A restored name should not cost you the record of who removed it. Jun is right to keep the old seal intact.”', [], { requiresClue: 'archive-counterseal' }),
], { completed: 'Sora has left the chair by the plaque, with no reserved marker on it. “I asked the families what they wanted next. Several wanted me to listen without offering a speech. That was harder than drafting another oath.”', followUp: { flag: 'sora-deserters-confronted', text: '“I put the word deserters in my statement, then wrote who I used it about and why. I was tempted to say that mistakes were made. You asked a direct question. The record deserves a direct answer.”' } });

writeNpc(ember, 'Kaito', 'rival', 'Kaito has put three new targets in front of the one he split yesterday. “Ren said I was repeating myself. I told him repetition was training. He said I could practise listening. You are welcome to try; I will probably be difficult about it.”', [
  turn('What do you want from the scroll?', '“My brother’s name without deserter beside it. After that, I don’t know. I have spent years imagining the moment I prove them wrong. It usually stops before I have to decide what I do the next morning.”', [
    reply('I will stand beside you when it is read.', 'Kaito sets the blade against the fence. “Thank you. I was going to tell you I could do it alone. I can. I think it will hurt less if I do not have to. You may remind me I said that.”', 'kaito-public-ally'),
    reply('Would a public reading put survivors at risk?', '“Maybe. I hate that you have made me think about a practical problem when I had such a satisfying scene prepared. We can read what was done without giving away where anybody lives. Jun will know how.”', 'kaito-survivor-privacy'),
  ]),
  turn('Do you still want revenge?', '“Sometimes. Mostly when someone tells me to be calm. I would like to be angry without having to prove I am about to become dangerous. My brother was angry plenty. He still mended roofs and made terrible jokes.”', [
    reply('You can be angry with me here.', '“All right. I am furious that my academy fee came out of a bereavement fund while they called my family traitors. There. That is one actual thing. It is easier to say than all the things I want to set on fire.”', 'kaito-safe-anger'),
    reply('I will stop you if you hurt somebody.', 'Kaito nods after a long pause. “Good. Say it before you have to. I would rather be furious with you for a day than discover everybody watched me do the thing they had already decided I would do.”', 'kaito-boundary'),
  ]),
  turn('Tell me something embarrassing about your brother.', '“He tried to make a fire bird carry a love note. Burned it before the recipient could read it. He spent an evening teaching the bird not to be entirely fire. The note would have survived if he had just walked across the street.”'),
  turn('What if some of your clan survived?', '“Then we go carefully. I want to rush there and ask why nobody came for me. They may have asked the same question about the village. I will need to hear an answer before deciding I was the only one abandoned.”'),
  turn('The border roster names survivors.', 'Kaito reads the names without moving his lips. “That is my aunt. I remember her whistle. If she is alive, she is older than I last saw her. I have kept everybody exactly the age they were when I lost them.”', [], { requiresClue: 'border-survivors' }),
], { completed: 'Kaito has stopped aiming at the split target. A return token hangs from the fence beside his pack. “I do not feel finished. I think I expected proof to feel like being finished. You can still come with me if that disappoints you.”', followUp: { flag: 'kaito-public-ally', text: '“I wrote down the names so I will not forget one when people are watching. I made a second copy for you. Not because I expect you to take over. I would just like to know somebody can help if I stop.”' } });

writeNpc(ember, 'Emi', 'merchant', 'Emi is pricing lanterns while arguing with a levy notice pinned above them. “Three taxes on one wick. I would light the notice, but then somebody will tax the smoke. Are you here to buy, deliver, or tell me this is all terribly necessary?”', [
  turn('Why was Hina charged for a medicine delivery?', '“Her courier seal was carved by an Ash maker. The inspector treated it as clan trade and charged a levy at every stop. Medicine for my mother became a luxury import by the time it reached the market. I advanced the fare.”', [
    reply('Show me the account. I will challenge it.', '“Gladly. I want the numbers challenged, not the inspector threatened. He has a desk full of rules that make charging us easy. I would enjoy giving him one rule that makes refunding us compulsory.”', 'emi-ledger-challenge'),
    reply('Could you pay it and move on?', '“I could this once. Hina could not. The next courier would still be charged. I am tired of people calling a problem affordable when they mean affordable to whichever person was unlucky enough to be asked.”', 'emi-pay-and-question'),
  ]),
  turn('What do you need for the appeal?', '“Hina’s account of the route and the market ledger entry. The ledger is by the lantern racks, where the collector left it after deciding I would not understand it. Ask Hina what she carried before you let him call it private trade.”'),
  turn('Why sell Ash-made lanterns?', '“They are good lanterns. My mother remembers the makers; I remember paying their apprentices. The council says an emblem can inflame feeling. So can a dark street. I have customers who need to get home safely.”', [
    reply('You could cover the clan emblem.', '“Then the maker disappears and I get to pretend trade survived without them. I will cover an address if it protects somebody. A maker’s name on work they chose to sell is not the same kind of secret.”', 'emi-emblem-kept'),
    reply('Leave the names visible.', '“I do. Some customers object, then ask for the strongest lamp. I show them the Ash one. It is surprising how readily convictions become negotiable when the road outside is wet.”', 'emi-maker-credit'),
  ]),
  turn('How is your mother?', '“Improving, and annoyed I keep describing her as improving. She wants to run the stall next week. I told her she can price things while sitting down. She told me I could offer sensible advice from somebody else’s stall.”'),
  turn('What will make the appeal stick?', '“Attach the route, the cargo, and the charge to the same page. Bureaucracy likes separating each reason from the next. If the collector has to explain all three together, he will have trouble calling it an ordinary levy.”', [], { requiresFlag: 'emi-ledger-challenge' }),
], { completed: 'Emi has taken down the levy notice and left the receipt in its place. “Refunded. Not donated, not kindly waived. Refunded. Mother asked why I was so pleased about a word. I made her tea before explaining.”', followUp: { flag: 'emi-maker-credit', text: '“I added the apprentices’ names to the price cards. They make the small lanterns, and they are tired of being represented by their masters. It is more writing, but I sell paper as well. I can bear the cost.”' } });

writeNpc(ember, 'Toma', 'tracker', 'Toma is untying a message cord a fraction at a time. He gives you a dry place to stand before speaking. “If I hurry, this becomes a shopping list. If I am patient, it might tell me whether my cousin made it past the gate.”', [
  turn('Who is your cousin?', '“A Reed runner attached to the Ash team. Her name is Mina. The council recorded her as an accomplice to desertion. I remember her as somebody who spent a whole patrol carrying an injured dog because it followed her once.”', [
    reply('You think she is alive.', '“I have a message in her knot pattern. That proves she tied it, not when she tied it. I would like you to help read the evidence without awarding me the answer I want because I look miserable.”', 'toma-evidence-first'),
    reply('What if the message is old?', '“Then I will know what it actually says. I have been waiting for news so hard that I stopped reading what had already arrived. It is possible to be faithful to somebody and still do a poor job of listening.”', 'toma-old-message'),
  ]),
  turn('Where does the message begin?', '“At the Reed marsh shrine. The rolls hold an address prefix, but the ending is a countermark Isao invented. His hermitage has the matching pattern. Bring both accounts; I refuse to mistake another request for help for a notice of departure.”'),
  turn('Why did the old messages go unanswered?', '“The border seal rejected Ash patterns. Our runners were told that interference meant enemy work. Mina changed the pattern, and the council called that proof it was forged. A closed gate can manufacture an alarming amount of evidence.”', [
    reply('Did the Reed clan object?', '“Some of us did. Some of us were relieved the trouble belonged to another clan. I complained privately to a cousin who was still inside the gate. You may notice that I picked somebody who already agreed.”', 'toma-clan-accountability'),
    reply('Can the shrine keep the messages private?', '“Yes. We can establish there are living senders without publishing their addresses. I will ask them before giving a council clerk directions. Survival should not automatically make someone available for questioning.”', 'toma-address-privacy'),
  ]),
  turn('What will you write if you find Mina?', '“That the dog still sleeps on the academy step. That her mother learnt the soup she liked. That nobody will be cross if she does not reply immediately. I used to start with questions. I may begin with things worth receiving.”'),
], { completed: 'Toma has tied a fresh outgoing cord and left the return end loose. “It is an invitation, not an instruction. Isao checked the countermark twice. I think Mina will recognise my knot; I was never very elegant at it.”', followUp: { flag: 'toma-address-privacy', text: '“I made a public list of names and a private list of routes. The captain asked for both. I gave her the first and asked what permission she had for the second. She went away to find an answer.”' } });

writeNpc(ember, 'Kaede', 'medic', 'Kaede is boiling bandages while eating something from a paper packet. She moves the packet out of the steam. “Before you ask: those are clean, that is lunch, and neither should be used for the other. I have had an exhausting morning.”', [
  turn('Did you treat the Ash team at the falls?', '“Four of them, with civilians. The rescue order was still valid. They had burns from keeping the sluice open while people crossed. Then a border message told me to stop treating them. I put the message under the kettle.”', [
    reply('You broke a direct order.', '“I had four people breathing badly and a signature that did not make their lungs work. I continued treatment. It was frightening. I would rather you remember the fright than decide disobedience comes easily to the people you approve of.”', 'kaede-order-cost'),
    reply('Did you tell anybody they survived?', '“I sent the triage sheet to the gate and kept a copy. The return came stamped INCONSISTENT WITH OFFICIAL ACCOUNT. I should have carried it there myself. I was needed here, and that became a very convenient reason never to leave.”', 'kaede-report-challenged'),
  ]),
  turn('Where did the survivors go?', '“Toward the border, with my dressings and a guide. I did not record their later route. At the time I thought not having addresses protected them. Now it also makes finding them harder. I do not get to call that a perfect decision.”'),
  turn('Can you help Riku repair the bridge?', '“He needs the load spread across more than one anchor. The old brace is sound enough to copy, not sound enough to trust. Tell him I can check the injury risk and supply rope padding. I cannot bless rotten wood into being structural.”', [
    reply('He says the council certified the anchor.', '“Then bring the mark and we can decide what it certifies. A date on a form is not the same as a person examining a bolt. I know that trick; medical supply inspections have an impressively similar paperwork disease.”', 'kaede-inspection-challenged'),
    reply('Would chakra make it hold?', '“For a moment. Then whoever supplied it has to stop sleeping. A public bridge should not depend on a medic missing dinner. Repairs can be boring and reliable. I would like more missions to aim for those qualities.”', 'kaede-boring-safe'),
  ]),
  turn('Do you know Kaito?', '“I treated his scraped knees before he started calling them training wounds. I would like to see him again without needing a basin. If you bring him here, tell him I still remember the name he gave a very small cut.”'),
  turn('Your triage dates contradict the report.', '“Good. Copy them exactly, including the patient count and the order number. Do not turn four survivors into everyone survived. I want the missing searched for and the dead recognised, without one correction swallowing another.”', [], { requiresClue: 'falls-triage' }),
], { completed: 'Kaede has sent a second triage copy with Ren carrying it. “A person can be more awkward to ignore than a form. I made him repeat the numbers back before he left. Teachers dislike that remarkably sensible practice.”', followUp: { flag: 'kaede-order-cost', text: '“I found the order under a newer kettle. The burn mark obscures one corner, not the signature. Jun said that is acceptable evidence. I was almost disappointed. I thought I might have made the paperwork properly unusable.”' } });

writeNpc(ember, 'Captain Raika', 'captain', 'Raika is checking the gate roster against the boots of the guards in front of her. “If you changed shifts, tell the book. The book cannot see your boots. You may laugh after it contains the people who are actually standing here.”', [
  turn('Were Ash survivors refused at this gate?', '“Yes. The closure order named their return tokens invalid. I matched the tokens and kept the gate shut. I was a lieutenant. That is a rank, not an explanation. The roster has my initials beside each refusal.”', [
    reply('Why did you obey a cruel order?', '“I believed a breach could start another war. I considered the people outside an acceptable risk without asking them. I was praised for discipline. It took years to hear what that praise had excluded.”', 'raika-refusal-confronted'),
    reply('Could you have opened it alone?', '“Not safely. I could have requested a challenge, called a medic, and refused to certify them deserters. I list those options because I once made obeying sound like the only action available.”', 'raika-alternatives'),
  ]),
  turn('What became of the people turned away?', '“A guide took them east. Some messages reached us later. The council ordered them held for authentication, and authentication never finished. You can find the names at the oath gate. I will not supply current routes without the senders’ permission.”'),
  turn('Will you testify against the council?', '“I will testify to what the gate did and what I signed. Jun wants me to name the officer who delivered the revision. I can do that. I cannot offer motives I did not hear. Testimony should be specific enough to be challenged.”', [
    reply('Start with your own signature.', '“I will. It is tempting to begin with the superior officer and work down until I disappear into the margin. Put my roster beside the order. Let the order explain what I was told, not erase what I did.”', 'raika-own-signature'),
    reply('You may lose command.', '“I may. I am preparing the handover so that admitting this does not also make the border unsafe. Accountability need not be another disaster for the people who did not choose our mistake.”', 'raika-handover'),
  ]),
  turn('Can the treaty survive a public ledger?', '“Possibly, with honest negotiations and reparations. The council presents certainty because uncertainty makes leadership look difficult. It is difficult. I prefer saying so to leaving another team outside a gate to preserve a confident announcement.”'),
  turn('Show me the refusals beside your initials.', 'Raika opens the roster to the marked page. “There are six. The seventh return token came by messenger. I wrote presumed hostile beside it. You can copy the page. Do not improve my language when you do.”', [], { requiresFlag: 'raika-own-signature' }),
], { completed: 'Raika has posted a new border procedure: any disputed return receives shelter while its record is checked. “It costs us space and guards. Those are costs the village can carry. I should have been comparing them with people, not with neat paperwork.”', followUp: { flag: 'raika-handover', text: '“My deputy has the gate keys and the supply book. If the council removes me, the next captain will know what they are receiving. I do not want losing my rank to become another excuse for a closed gate.”' } });

writeNpc(ember, 'Jun', 'archivist', 'Jun holds the archive door while keeping a finger in a book. “You may enter. You may not set a drink on anything that looks like paper. If you are the genin Ren sent, I have arranged the books so the council cannot borrow the important one accidentally.”', [
  turn('What did you keep when the clan hall burned?', '“A mission copy, three apprenticeship books, and a box of badly written poems. I grabbed what was close. People thank me for choosing history. I chose my uncle’s handwriting. The important evidence happened to be under it.”', [
    reply('The poems matter too.', '“They do. He was a dreadful poet and a meticulous smith. The clan did not exist to provide evidence for the village. I would like us to win the inquiry and still have room to admit the poems are dreadful.”', 'jun-poems-matter'),
    reply('You saved what we need.', '“I am glad. I am also tired of being praised only when my family’s belongings become useful to someone else’s case. After this, I would like to catalogue the apprenticeship books without anybody calling it a political act.”', 'jun-useful-history'),
  ]),
  turn('How do we prove the ledger was changed?', '“Compare the original seal with the counterseal pressed into the revised copy. Same mission number, different instruction. The council did not lose a record; it made a new one and asked everybody to stop keeping the old one.”'),
  turn('Can the ledger be read without exposing survivors?', '“Yes. Names of officials, orders, and mission dates can be public. The later routes belong to the people who took them. I can make a copy with those parts covered and write precisely what was covered and why.”', [
    reply('Make the redacted copy.', '“I will. Redacted does not have to mean trustworthy on my say-so. I can number each omitted line and let the families inspect the original privately. It is more work than waving a seal, which is one reason I prefer it.”', 'jun-redacted-copy'),
    reply('People may say we are hiding something.', '“We will be: locations we have no right to advertise. We can say that plainly. The council hid an order and called it security. I refuse to let their misuse of the word force us to expose everybody.”', 'jun-privacy-defended'),
  ]),
  turn('What does Kaito need from you?', '“His brother’s apprenticeship entry. It lists failed techniques as well as good ones. He wanted to invent a fire bird that could carry paper. Kaito knows the ending of his brother’s life; I can give him some of the unfinished work.”'),
  turn('How will the redacted copy be checked?', '“Each covered route gets a numbered slip. The family can inspect it and confirm whether it is accurate. We can establish survival publicly without making being alive another obligation to report to the village.”', [], { requiresFlag: 'jun-redacted-copy' }),
], { completed: 'Jun has placed the mission evidence beside the apprenticeship books. “The order belongs to the inquiry. These belong to the people who learnt here. I have labelled the shelves differently so the next visitor remembers to ask more than one kind of question.”', followUp: { flag: 'jun-poems-matter', text: '“I found a poem addressed to the roof because it leaked. I copied it for Kaito. He laughed, which startled both of us. We have become accustomed to giving him things that require a serious face.”' } });

writeNpc(ember, 'Isao', 'hermit', 'Isao has hung his kettle from three carefully engineered cords; it still drips onto his shoe. “I designed village message seals. Apparently boiling water presents the greater challenge. Do not call me master until I have managed tea without injuring the furniture.”', [
  turn('Why did you leave the village?', '“I wrote the countermark used when a messenger needed help. The council changed the receiver to treat it as suspicious traffic. I objected, then left when they ignored me. Leaving protected my self-respect and left the receiver exactly as it was.”', [
    reply('You could have stayed and resisted.', '“Perhaps. I could also have been removed. What I cannot do is pretend withdrawing was a complete answer. Toma has carried the messages I stopped trying to deliver. His work makes my explanation sound rather thin.”', 'isao-withdrawal-challenged'),
    reply('Sometimes leaving keeps you able to help.', '“True. Then the question is whether I used the ability. I repaired walking sticks and told visitors the council was foolish. I did less with the old message rolls than somebody able to help ought to have done.”', 'isao-capacity'),
  ]),
  turn('Can you read Toma’s countermark?', '“Yes. The shrine roll needs to be checked against the pattern here at the hermitage. It says shelter requested, send no patrol. It does not say deserter. Those are inconveniently different instructions for the office that received it.”'),
  turn('Why not make the seals impossible to misuse?', '“Because people change receivers, orders, and definitions. I thought a clever mark would settle intention. Then I watched an officer declare a valid mark invalid. You can make forgery harder. You cannot make responsibility unnecessary.”', [
    reply('Then teach people how to check them.', '“I have begun a plain guide. No secret gestures, no inherited rank required. If someone says the guide is dangerous, ask whom it endangers. So far it mostly endangers the pleasure of being consulted.”', 'isao-open-guide'),
    reply('Could the guide help the council intercept messages?', '“It could help anyone read what a seal claims. Addresses stay separately encoded. There is a tradeoff, and I will record it rather than promising a perfect instrument. Perfect instruments were how I got smug the first time.”', 'isao-guide-tradeoff'),
  ]),
  turn('Will you come back for the inquiry?', '“If invited. I have an old uniform that will require considerable negotiation around the waist. I would rather attend in this coat and let the seal work be judged without embroidered authority. The kettle can survive a day without me.”'),
], { completed: 'Isao has left a readable countermark guide by the path. The kettle is now on a plain stand. “Riku fixed it in five minutes. I had assumed my problem was too interesting for an ordinary solution. He enjoyed hearing that.”', followUp: { flag: 'isao-open-guide', text: '“Hina tried the guide and found three unclear passages. I rewrote them. Teaching a technique turns out to include being corrected by the people using it. That is much more irritating than building a secret.”' } });

writeNpc(ember, 'Hina', 'courier', 'Hina is counting stamps on her route card, crossing out a number, and counting again. “If this is another customs stop, I would like to be inspected by someone who has carried the bag. It weighs less at every checkpoint and somehow costs more.”', [
  turn('What did you carry to Emi?', '“Medicine for her mother. No sale goods, no clan correspondence. The seal maker was Ash, so the inspector charged a clan-trade levy. I showed the clinic order. He said I could appeal when the delivery was complete. The fees nearly stopped the delivery.”', [
    reply('I will attach your route to the appeal.', '“Thank you. Use the copy; I need the original to get paid. Every office wants the original, and somehow none will agree to be the last office. I started carrying blank sheets so I could ask them to sign for what they take.”', 'hina-route-testimony'),
    reply('Why did you not use a different seal?', '“Because it was issued by the village and still worked. Changing it would cost more than my route pay. Also, I like the maker. I should not need to pretend a person is unrelated to their own work to deliver a bottle.”', 'hina-seal-defended'),
  ]),
  turn('Were you the courier who hid the scroll?', 'Hina looks toward the road before answering. “I carried a sealed packet to the watchtower. I did not open it. I saw the patrol ordered to burn returned messages. I put the packet where someone younger and less inspected could find it.”', [
    reply('I will keep your family out of it.', '“Then I will testify to the delivery. I will not give them my mother’s address. It is frustrating how every account begins by demanding where my relatives sleep, as if that were proof I carried a bag.”', 'hina-family-private'),
    reply('The inquiry needs your name.', '“It can have my name if the question is what I did. Ask me first before adding the rest. I am frightened, not unwilling. Those are different problems, and only one can be solved by ordering me to speak.”', 'hina-consent-testimony'),
  ]),
  turn('Why be a courier rather than a fighter?', '“I am fast, I like routes, and I dislike stabbing practice. The academy treated the last part as a character flaw. Mako said a village that needs medicine should probably retain at least one child who prefers carrying it.”'),
  turn('What route would you take if nobody paid?', '“Down to the marsh with letters people keep putting off. Then a stop at the lantern market for dumplings. I would still want travel expenses. Doing something worthwhile does not stop your sandals wearing out.”'),
  turn('What should your testimony leave out?', '“My mother’s address, my younger brother’s academy route, and any speculation that I opened the packet. I will sign what I know. If someone wants a more exciting courier story, they can pay for fiction.”', [], { requiresFlag: 'hina-family-private' }),
], { completed: 'Hina has a delivery receipt that lists the medicine and the refunded fees on the same page. “I made three copies before handing it over. I will not call that paranoia if you do not call it a personality.”', followUp: { flag: 'hina-route-testimony', text: '“Emi asked before copying the route, then gave the original back while I was watching. It sounds foolish to be pleased. The inspector made me feel irresponsible for wanting to keep the thing that proved I worked.”' } });

writeNpc(ember, 'Riku', 'bridgekeeper', 'Riku is turning an inspection plaque over to use the blank side for measurements. “This side is more useful. The other says certified safe in very expensive lettering. Try to step on the boards, not the lettering. It has poor load-bearing properties.”', [
  turn('What is wrong with the old bridge?', '“One anchor has split under the inspection mark. The council rated it safe from a sketch, then filed my repair request as routine. Families use it when the patrol road closes. Routine is not the same as optional.”', [
    reply('We should keep proof of the failed inspection.', '“Agreed. Copy the mark before the brace goes on. If I repair it first, they will say the emergency was exaggerated. I want it safe, and I want the next bridge fixed before somebody needs a photograph of a broken part.”', 'riku-council-liability'),
    reply('Forget the blame. Make it safe first.', '“Safety comes first. Evidence can be collected while I prepare the brace. I have learnt that forgetting blame often means the repair comes out of my pay. I need enough money left to mend the following bridge.”', 'riku-repair-first'),
  ]),
  turn('How can Kaede help?', '“She knows how the injured were carried across during the flood. I need the load points and padding for the rope braces. Ask her after you inspect the bridge. She prefers specific questions to being invited to perform medical optimism.”'),
  turn('Were you a shinobi?', '“Briefly. Earth techniques, mostly foundations. Then I discovered I liked buildings more than patrol reports. I still train so I can help in an emergency, but an emergency technique is a dreadful basis for daily public transport.”', [
    reply('The work sounds less exciting.', '“It is. Children cross without thinking about me, and I buy supper without thinking about an enemy. I am willing to accept fewer songs. Ren says that is not a heroic attitude. Ren still sends his bridge requests to me.”', 'riku-ordinary-work'),
    reply('You are keeping people alive.', '“Yes, but do not make that so grand that the council calls it volunteer heroism. It is paid work that needs materials. I would prefer a bridge budget to a medal; medals are difficult to bolt into wood.”', 'riku-pay-for-work'),
  ]),
  turn('Who crosses when the gate closes?', '“Farmers, couriers, people who do not want a patrol asking their children’s names. The Ash team came through before the border mission. I checked their packs because the bridge was narrow. They carried return supplies. Nobody was preparing to vanish.”'),
  turn('Where will the inspection copy go?', '“Beside the repair invoice, not in a speech. Emi knows how to make a number difficult to ignore. I want the record to show exactly which work was delayed and who ended up paying to make it urgent.”', [], { requiresFlag: 'riku-council-liability' }),
], { completed: 'Riku tests the new brace with weights before reopening the path. The inspection copy is pinned to the invoice. “It is safe now. I will keep the complaint open. A completed repair should not magically complete the people who delayed it.”', followUp: { flag: 'riku-pay-for-work', text: '“I submitted labour as well as materials. The clerk suggested a community contribution. I asked whether his desk was a contribution. We settled on a number. Kaede will be pleased I did not shout.”' } });

ember.landmarks.forEach(place => { place.main = true; });
ember.landmarks.push(
  { name: 'Stormwater falls', main: true, phase: 'both', clue: 'falls-triage', item: 'Kaede’s triage copy', text: 'Kaede’s triage sheet records four Ash shinobi rescuing civilians beneath an active mission order. The treatment dates follow the alleged desertion. A later instruction says to refuse care; Kaede continued and kept the order number. Four named patients left alive. The record establishes survivors, not the survival of the whole team, and gives the inquiry something precise to follow.' },
  { name: 'Ash-clan archive', main: true, phase: 'both', clue: 'archive-counterseal', item: 'Original and revised mission copies', text: 'Jun has preserved two copies with the same mission number. The original promises an open return gate. The revised version calls the team deserters and removes that promise. Sora’s seal appears on both. An appendix records withheld family allowances. You copy the orders and officials’ signatures, leaving later private routes covered rather than turning proof into a map to survivors.' },
  { name: 'Border oath gate', main: true, phase: 'both', clue: 'border-survivors', item: 'The refused-return roster', text: 'The gate roster names six returning shinobi denied entry under the revised order; a seventh sent a token by messenger. Raika initialled the refusals. The dates agree with Kaede’s triage sheet. Later message receipts establish living senders but keep their routes encoded. Kaito’s aunt appears among the names. The village did not simply lose the team: it decided not to receive them.' },
  { name: 'Lantern market', main: false, phase: 'both', clue: 'market-ledger', item: 'The medical-delivery levy entry', text: 'The levy ledger charges Hina’s medicine route as clan trade, although the clinic seal identifies the cargo as treatment. The same entry records Emi’s advance and a penalty for delayed arrival. You copy all three lines together. The delay was caused by the charge; keeping the entries together prevents the account from blaming the courier for it.' },
  { name: 'Reed marsh shrine', main: false, phase: 'both', clue: 'marsh-addresses', item: 'The preserved water-message roll', text: 'A water-message roll bears Mina’s knot pattern and several Ash names. Its countermark does not match the council’s desertion code. Toma has left the address strings encoded. You copy the names and the disputed mark for Isao to check. The roll can establish that people sent for help without deciding they must now be found by strangers.' },
  { name: 'Old suspension bridge', main: false, phase: 'both', clue: 'bridge-anchor', item: 'A copy of the failed inspection mark', text: 'The anchor is split directly beneath the council’s safety mark. A repair request number is scratched beside it, dated before the damage worsened. You record the fault and the load points for Riku and Kaede, keeping the inspection mark visible. The crossing needs a brace and padding, not another promise that a shinobi can catch whoever falls.' },
  { name: 'Mountain hermitage', main: false, phase: 'both', clue: 'hermit-countermark', item: 'Isao’s countermark reference', text: 'The plain countermark guide distinguishes shelter requested from departure declared. Toma’s shrine roll uses the former. Isao’s old receiver diagram shows the council changed valid help requests into suspicious traffic. You copy the reference, leaving encoded addresses untouched. The message was asking for a response the village made itself unable to give.' },
);
ember.sideQuests = [
  { id: 'market-debt', title: 'The price of a delivery', giver: 'Emi', offer: 'Help Emi challenge Hina’s medicine levy.', intro: 'Emi advanced a levy that almost stopped medicine reaching her mother. Speak to Hina about the route, then inspect the ledger at Lantern market. Emi wants the charge refunded as an error, rather than waived as a favour she must be grateful for.', steps: [{ type: 'talk', feature: 'Hina', text: 'Hear what Hina carried and where she was charged.' }, { type: 'investigate', feature: 'Lantern market', text: 'Copy the route, cargo, and levy together.' }], returnText: '“The clinic seal and the charge are on the same account now? Good. Let the collector explain why one stopped him reading the other.”', completeText: 'Emi submits the cargo, route, and levy as one record. The collector refunds the charge and deletes the delay penalty. Hina keeps her original delivery receipt. Emi pays for your next meal, insisting that help and reimbursement are different things she can both acknowledge.', reward: 35, item: 'Emi’s lantern-market meal token' },
  { id: 'unbroken-crossing', title: 'A bridge that stays up', giver: 'Riku', offer: 'Help Riku repair and document the crossing.', intro: 'Riku needs the damage recorded at Old suspension bridge and Kaede’s account of the load points. He will make the crossing safe; he also wants an invoice that prevents the failed inspection from becoming an unofficial donation of his work.', steps: [{ type: 'investigate', feature: 'Old suspension bridge', text: 'Record the failed anchor and inspection mark.' }, { type: 'talk', feature: 'Kaede', text: 'Get Kaede’s advice on bracing and padding.' }], returnText: '“That gives me the load points. Keep the copy where the invoice can find it. I would like the council to pay for wood before anybody pays for a fall.”', completeText: 'Riku spreads the load across a new brace, pads the ropes with Kaede’s material, and tests the crossing with weights. He attaches the failed inspection to the invoice. The bridge reopens as ordinary infrastructure, which is exactly the kind of success he wanted.', reward: 40, item: 'Riku’s reinforced field cord' },
  { id: 'names-in-water', title: 'A message worth receiving', giver: 'Toma', offer: 'Help Toma read the unanswered water message.', intro: 'Toma believes his cousin Mina sent for help after the border closed. Investigate Reed marsh shrine, compare the mark at Mountain hermitage, and speak to Isao. Keep private routes private while establishing what the village refused to hear.', steps: [{ type: 'investigate', feature: 'Reed marsh shrine', text: 'Copy the preserved names and countermark.' }, { type: 'investigate', feature: 'Mountain hermitage', text: 'Check the countermark reference.' }, { type: 'talk', feature: 'Isao', text: 'Hear Isao’s account of the altered receiver.' }], returnText: '“Shelter requested. Those are the words? Then I can answer the message she sent instead of the story the office made out of it.”', completeText: 'Toma preserves the evidence of the altered receiver, then ties a reply without demanding Mina return. He sends news of home and asks whether she wants contact. The public record gains living names. Their owners keep the choice of when, where, and whether to answer.', reward: 35, item: 'A Reed-clan reply cord' },
];

// Immediate links make selected conversations branch rather than merely close.
const linkReply = (story, name, question, answer, next) => {
  const topic = story.npcs.find(n => n.name === name)?.topics.find(t => t.label === question);
  const stance = topic?.replies.find(r => r.label === answer);
  if (stance) stance.next = next;
};
linkReply(velvet, 'Alma Vale', 'Did you lock the back door that night?', 'You made it harder for her.', 'You said she could have left by the front.');
linkReply(velvet, 'Owen Pike', 'Did June actually rent room six?', 'That helped turn her into a missing person.', 'I want you to correct the register.');
linkReply(velvet, 'The double', 'Are you the part of me that stayed?', 'You do not get to decide what I remember.', 'I want you to stop arranging my memories.');
linkReply(ember, 'Aya', 'Who hid the scroll at the crossing?', 'Why did you leave it out?', 'Will you correct the theft report?');
linkReply(ember, 'Jun', 'Can the ledger be read without exposing survivors?', 'Make the redacted copy.', 'How will the redacted copy be checked?');
linkReply(ember, 'Captain Raika', 'Will you testify against the council?', 'Start with your own signature.', 'Show me the refusals beside your initials.');

// Remote witnesses respond to the chosen outcome, including compromised ones.
const velvetEndings = {
  'Hester Wren': {
    remember: '“The county accepted the pay receipt. They did not ask me to explain why June left; for once, a date was enough.” Hester files the copy where visitors can reach it. “I am keeping the originals out of the holiday-room sale.”',
    stay: '“Dale says you are keeping the diner open on both sides. I can bring the radio, but I will not bring a timecard.” Hester puts the forwarding request in an envelope. “If June comes, she need not clock in.”',
    silence: 'Hester keeps the receipt beneath a clean sheet of glass. “The office asked me to file it away. I have filed enough things away for somebody else’s comfort. You need not change your mind today. The date will still be here.”',
  },
  'Deputy Inez': {
    remember: 'Inez has a new statement for the county. “I signed the false record. I signed the correction too. The mayor wants the first page removed, but anybody checking should be able to see exactly how long I left it standing.”',
    stay: '“I cannot patrol a dream,” Inez says. “I can stop treating every unfamiliar visitor as someone to return to a familiar address.” She has left the rescue sign pointing toward both safe paths instead of repainting it again.',
    silence: '“The county likes the old account better. That does not make it correct.” Inez leaves a correction form on the bench. “I can wait for your signature, but I am sending my own. I will not make another silence a joint instruction.”',
  },
  'Arthur Latch': {
    remember: 'Arthur has put the letters beside the timetable. “You let her leave without making her stop being somebody you love. I should have understood that before offering bus fare.” The telescope points at the lake; he asks whether you would simply like to look.',
    stay: 'Arthur labels one flask DREAM and another COFFEE. “I expect those are important distinctions.” He has left a place at the atlas table. “You may visit without asking it to predict anything. I think we have overworked the paper.”',
    silence: 'Arthur opens the atlas to the old draft. “The letter has not agreed to vanish. I should have been less agreeable when the town asked the same of me.” He offers you a chair, leaving the page uncovered between you.',
  },
  'Mara Voss': {
    remember: '“People keep asking for a route map. I tell them a departure receipt is not an invitation.” Mara makes tea while the signal changes. “You can know she chose the train without knowing which door she sleeps behind. Thank you for leaving that possible.”',
    stay: 'Mara has swept the dreaming platform as well. “It is still closed to ticket sales. A waiting place need not advertise a departure.” She folds down the office seat. “You can have tea here on either side; just tell me when you want to leave.”',
    silence: 'Mara puts the receipt in a waterproof sleeve. “I will not tell a searcher where she went. I will tell them she went.” She keeps the tea ready, but no longer asks whether you want the version that is easier to hear.',
  },
  'Teddy Fenn': {
    remember: '“I phoned Alma and said we could have a birthday without a vigil.” Teddy has packed plates for the orchard. “She asked whether I had brought chairs. That is the sort of question I would like to be answering for a while.”',
    stay: 'Teddy finds his picnic stool standing in the dream. “I brought enough cake for anybody who wants it, which is different from setting a place they have to fill.” He offers you an ordinary paper plate, relieved that it stays ordinary.',
    silence: 'Teddy folds the birthday card into its tin. “You can do what you think you need to do. I am keeping the recipe. I would like one thing she made to remain something she actually made, instead of another clue we hid.”',
  },
  'Silas Holt': {
    remember: '“The emergency channel is clear. We kept the cut in the archive and let the live wire move on.” Silas offers tea from a kettle. “Elsie asked whether she could visit without fixing anything. I said that was the point of tea.”',
    stay: 'Silas has opened a harmless line to the dream diner. “No evacuation tone, no instructions. Just a way to ask whether someone wants company.” He listens for a moment. “I should have tried that before learning how to repair everything else.”',
    silence: 'The emergency loop has returned. Silas does not reach for the dial. “I can repair a wire, but I will not call erasing the record a repair. If you want a clear channel again, bring the part we are still avoiding.”',
  },
  'Dr. Iris Moss': {
    remember: 'Iris has separated the chapel records into deaths, departures, and unresolved accounts. “There is a small argument about the extra cabinet. I prefer that argument to another family grieving a decision nobody checked. June has her own line now, with no address.”',
    stay: '“The dream is open, then. I will not send patients there as a treatment.” Iris carries a chair toward the diner. “I can come as a visitor. That is a better use of a place that lets people say what they keep rehearsing.”',
    silence: 'Iris keeps the clinic date beside the memorial list. “I can respect that you are frightened without agreeing the old record is kind. You may leave the conversation whenever you like. I am not going to leave the paperwork this time.”',
  },
  'Nell Ash': {
    remember: 'Nell checks the fresh rope with both hands. “June left; my husband left; some people died. It was easier when everybody was called lost, and worse for everyone in it.” She finishes the knot. “I think this landing can finally be only a landing.”',
    stay: 'Nell ties the rope between the waking post and its dream reflection. “Visitors can cross if they want. I am not selling returns.” She laughs at the old wording, then tightens the knot. “Perhaps I can learn to mean it without being cross.”',
    silence: '“I will still correct my husband’s name,” Nell says. “I cannot make your choice for you. I can stop letting mine depend on everybody being too kind to ask.” She finishes the knot instead of starting it over when you answer.',
  },
};
const emberEndings = {
  Emi: {
    truth: 'Emi has pinned the refund receipt beside the council hearing notice. “I will bring the accounts. If they want to discuss restoring a clan, they can start with the money they took.” She packs food for the witnesses without making it another favour owed.',
    exile: '“Travel costs, not a reward for running away.” Emi gives you a market token and a wrapped meal. “If you find someone who wants to return, write first. I can find them work without asking them to explain their whole life at the stall.”',
    order: 'Emi turns the hearing notice face down. “Then the treaty holds and the levy still needs refunding. I can work on the smaller thing without calling the larger thing settled.” She leaves the makers’ names on the lamps, despite another inspector’s suggestion.',
  },
  Toma: {
    truth: 'Toma has made a public name roll and kept the encoded routes separate. “The council asked for both. The hearing authorised the first. I am learning to ask what permission an official has instead of assuming a uniform contains it.”',
    exile: 'Toma gives Kaito a sealed introduction. “Mina can open this without telling you where she lives. If she wants to meet, she will answer.” He checks the knot twice. “You are going to find people, not retrieve property. Let the message say that.”',
    order: 'Toma keeps the water rolls outside the new council seal. “Your mission is complete. Mine is not. I will still answer the request for help. I think the oath can survive a clerk refusing to recognise it; we have already tested that plenty.”',
  },
  Kaede: {
    truth: 'Kaede packs a medical copy for the hearing. “Four survivors, exact dates, original order number. Ren repeated them correctly.” She finishes her lunch before leaving. “I will testify. I will also eat. Being useful should not require ignoring advice I give every patient.”',
    exile: 'Kaede checks both your packs. “Dressings, clean water, and a route back if one of you is hurt. You do not owe the council obedience, but you still have bodies.” She gives Kaito an extra bandage without commenting on why he keeps looking away.',
    order: 'Kaede leaves her triage copy on the table. “The seal does not change the patient count. I will keep the evidence available. If the treaty is as strong as they claim, perhaps one day it will withstand a doctor describing whom she treated.”',
  },
  'Captain Raika': {
    truth: 'Raika gives her statement before discussing a new border plan. “My initials are first. The order follows.” The gate now offers shelter to disputed returns. “It costs guards and supplies. I put both in the budget. I want the promise to have equipment behind it.”',
    exile: 'Raika opens the gate without listing you as deserters. “Departure by choice. That is the entry.” She hands back your travel record. “If someone wants to return, write ahead. I will not promise the whole council, but I can promise what this gate does.”',
    order: 'Raika receives the renewed closure instruction and asks for it in writing. “I have obeyed enough neat summaries. This one will name who decides, what risk they claim, and what we do for the people outside.” The questioning has begun, even without the hearing.',
  },
  Jun: {
    truth: 'Jun brings the redacted ledger to the square and keeps the originals for private inspection. “The orders can be public. The survivors decide what follows their names.” After the reading, he reopens the apprenticeship book and gives Kaito his brother’s unfinished fire-bird notes.',
    exile: 'Jun packs copies rather than surrendering the originals. “You can find the survivors without carrying the only evidence across a border.” He adds the fire-bird notes. “The inquiry may wait. Kaito should not have to wait for every ordinary thing his brother left.”',
    order: 'Jun locks the archive when the council courier arrives. “They received your copy. They do not receive my uncle’s original because they prefer fewer versions.” The apprenticeship books remain open to visitors. He will not let the clan become only a sealed dispute.',
  },
  Isao: {
    truth: 'Isao returns for the hearing in his plain coat. “I brought the receiver diagrams. I will explain where my clever device became a convenient refusal.” The public guide stays at the hermitage. He has asked Hina to keep correcting its unclear passages.',
    exile: 'Isao gives you a countermark reference and keeps the addresses encoded. “It will tell a receiver you are asking, not commanding. You must still behave as if that distinction matters.” He is coming down to help Toma answer the older requests.',
    order: 'Isao leaves the guide by the path. “The council can seal a ledger, not everybody’s understanding of a message. I am not going back to private complaints and walking-stick repairs.” He has fixed the kettle, which gives him one less convenient reason to stay home.',
  },
  Hina: {
    truth: 'Hina signs her delivery statement and checks that her family’s address is not attached. “They asked before making the copy. I intend to keep finding that normal.” Her next route carries invitations to the hearing, with space for people to decline.',
    exile: 'Hina shows you a safe courier route without offering anyone else’s address. “Take the road, then send a message. People on the other side have had enough surprise visitors.” She makes you sign for the map, pleased that a practical habit can help friends too.',
    order: 'Hina keeps copies of every returned message. “I did not hide the scroll so somebody could burn it more formally. I understand you had reasons. So did the office.” She takes a medicine route instead of waiting around to see whether you answer.',
  },
  Riku: {
    truth: 'Riku submits the bridge invoice to the new inquiry. “Restoring an oath should include paying for the roads people use to come home.” He leaves the crossing open during the hearing, because not everybody with an urgent journey wants to hear a speech.',
    exile: 'Riku checks the bridge before you cross. “It will carry two people and their packs. It does not care what rank you are travelling under.” He gives you a spare cord, adding, “Come back if you want. That is not an order disguised as kindness.”',
    order: 'Riku puts the renewed treaty notice beside his unpaid repair request. “Fine. Peace is useful. So is a bridge that stays up.” He will keep submitting the invoice. A completed mission has not made the council’s delayed work or the families using the crossing disappear.',
  },
};
for (const npc of velvet.npcs) if (velvetEndings[npc.name]) npc.endingText = velvetEndings[npc.name];
for (const npc of ember.npcs) if (emberEndings[npc.name]) npc.endingText = emberEndings[npc.name];
// Story prose describes the trial; control instructions belong in advice.
ember.landmarks.find(place => place.name === 'North training grounds').text = 'You kneel inside the elemental circle. Water steadies your pulse; wind slips between your fingers; an ember becomes a clean flame. You repeat the form until the flame holds without growing angry. Ren’s old training cord has three knots, one for each clan. You complete the first field trial with all three still tied.';
