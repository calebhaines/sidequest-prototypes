import { toggleCircuit, type Investigation } from './investigationTypes';

const pacing = { min: 3, typical: 5, max: 9 };
const dark = Array<boolean>(25).fill(false);
const circuitFrom = (switches: number[], target = dark) => switches.reduce((lamps, cell) => toggleCircuit(lamps, cell, 5), [...target]);
const museumWindow = [6, 7, 8, 11, 13, 16, 17, 18].map(Number);
const hospitalVoices = [0, 4, 5, 9, 10, 14, 15, 19, 20, 24].map(Number);
const museumTarget = dark.map((_, index) => museumWindow.includes(index));
const hospitalTarget = dark.map((_, index) => hospitalVoices.includes(index));

export const INVESTIGATIONS_MIDDLE: Investigation[] = [
  {
    id: 'portrait_testimony', act: 3, location: 'museum',
    title: 'The people beneath the portrait',
    subtitle: "Five lives were painted over. Their labour remains beneath the gold.",
    premise: [
      "The Museum was once a roadside assembly hall. Successive renovations added false marble, boarded over windows, and built annexes from caravans whose owners had run out of time. The newest portrait hides a cupboard called the Department of Things Not In the Pictures. Inside are purchase slips for five studies from the Shanty Hours. They were enlarged and absorbed into THE EXCEPTION, THE GIFT, and THE REST. Their makers’ labels were removed. The catalogue calls the loss an improvement in universality; the cupboard smells of old paste and damp coats.",
      "Your companions stand close enough to keep their voices from carrying into the hall. Brindle carves wooden birds when his hands have anything left after work. Ada repairs clocks with parts she cannot afford to replace. Pip finishes poems other people have no time to finish. A folded notice says ORDINARY SUBJECTS MUST NOT DISTRACT FROM EXTRAORDINARY AUTHORSHIP. Brindle recognises a shaving beneath one frame. Ada notices counters charging visitors for the length of their attention. An Aristobat hangs outside, listening to prepared praise. The Curator has saved enough scraps to establish whose days were used, what the Lady removed, and what it cost the people who gave her something beautiful. He has not saved enough to make telling you safe. He opens the cupboard anyway.",
    ],
    challenges: [
      {
        id: 'portrait_sources', title: 'Five frames, five missing people',
        narrative: [
          "Five studies hang in numbered frames. A sleeping neighbour became a white chair. A child’s shoes became empty footwear; a wash basin became divine sand; a carved bird became a wingless herald; a bread cloth became the Lady’s spotless pillow. The dark lines beneath the new paint still describe what had been there. ",
          "The Curator saved the purchase slips in a box for replacement bulbs. Five people supplied five studies, each with one subject and one maker. “Please keep those things separate,” he says. The old paint gives a glimpse of rooms like those outside: a table pushed against a leaking wall, washing beneath a single dead bulb, someone sleeping with their coat on. The approved pictures have no need of a roof or a night shift. Each ordinary room has become an occasion for a woman who never had to live in it.",
          "Brindle sits beneath the fourth frame with his hands closed around an empty place in his lap. He used to carve birds during the hours nobody paid him for; you have never seen him carry one. Pip reads the slips softly so the Aristobat outside cannot hear the names. Match maker and subject to the five frames. None of the restoration will give the makers their spent afternoons back. It can at least stop their work from continuing under somebody else’s face without even their names attached.",
        ],
        task: 'Assign one ordinary subject and one original maker to each frame. Use every option exactly once in each column.',
        evidence: [
          {"title": "The registrar’s language", "text": "The register uses left of for any position farther left, and beside for an immediately adjoining frame. All five frames contain one maker and one subject, with every listed maker and subject appearing exactly once. The labels were detached; the purchase relations were not."},
          {"title": "Purchase slips, first bundle", "text": "The sleeping neighbour’s study hung left of Fenn’s frame. Wooden bird and bread cloth occupied adjoining frames. Sella’s frame hung left of Orris’s. Wash basin hung left of Brindle’s frame. These refer to frame positions, not the subjects’ or makers’ relative worth."},
          {"title": "Purchase slips, second bundle", "text": "Child’s shoes adjoined Marta’s frame. Exactly one intervening frame separated child’s shoes from wooden bird. Brindle hung left of Fenn. Wash basin was not at either end. Orris occupied the frame immediately left of Marta. Nothing on the final captions overrides the purchase slips."},
        ],
        board: {
          kind: 'ledger',
          rows: [1, 2, 3, 4, 5].map(n => ({ id: `frame${n}`, title: `Frame ${n}` })),
          columns: [
            { id: 'subject', title: 'Ordinary subject', options: ['Sleeping neighbor', 'Child’s shoes', 'Wash basin', 'Wooden bird', 'Bread cloth'] },
            { id: 'maker', title: 'Original maker', options: ['Sella', 'Orris', 'Marta', 'Brindle', 'Fenn'] }
          ],
          solution: {
            'frame1.subject': 'Sleeping neighbor', 'frame1.maker': 'Sella',
            'frame2.subject': 'Child’s shoes', 'frame2.maker': 'Orris',
            'frame3.subject': 'Wash basin', 'frame3.maker': 'Marta',
            'frame4.subject': 'Wooden bird', 'frame4.maker': 'Brindle',
            'frame5.subject': 'Bread cloth', 'frame5.maker': 'Fenn'
          }
        },
        hints: [
          'Combine “Orris immediately left of Marta” with the wash basin’s position and the two-frame separation between shoes and bird.',
          'The basin belongs in the middle. The bird and bread cloth must occupy the last two frames, with Brindle before Fenn.',
          'Frames 1–5: sleeping neighbor / Sella; child’s shoes / Orris; wash basin / Marta; wooden bird / Brindle; bread cloth / Fenn.'
        ],
        resolution: [
          "“The fourth was mine,” Brindle says. Supine paid enough time to patch his roof through one wet season. He had thought the bird would outlast the patch. Sella drew a neighbour sleeping after work; Orris drew outgrown shoes; Marta watched a basin; Fenn covered bread for someone arriving late. The Curator writes their names in pencil because official ink is locked upstairs. Brindle keeps staring at the shape beneath the gilding. He does not ask for it back. Marta’s slip carries another message, written in the old protective cipher.",
        ], minutes: pacing
      },
      {
        id: 'portrait_washday', title: 'What the water was for',
        narrative: [
          "Marta’s basin study sits beneath glass too clean for the room it depicts. The approved hand is human and impossibly pale; the receiving hand is furred. Its caption thanks the Lady for water. Under angled light, an older pair of furred hands becomes visible, holding the same torn sleeve above a tin bowl. Marta’s caravan had no running supply. Washing meant carrying water past the permit window and warming it on a stove that marked every kettle with soot. Neither hand was giving a gift. Both were working.",
          "Supine visited on an early telescreen mounted to a stand with one crooked wheel. Marta put it beside the basin because there was no other clear surface. She spoke while scrubbing, forgot the formal address, and talked about her sister. Supine requested the study the following morning. It was paid for, then revised until the ordinary conversation resembled gratitude. ",
          "The explanation survived in a box marked UNSUITABLE ARTISTIC MOTIVES. It was indexed into a verse, so a casual inspection would encounter harmless lines instead of a person’s account of an afternoon. Use the written indexing rule; a shift in reading direction can quietly turn a correct word into another mistake. Pip places a saucer beneath the basin’s drip in the drawing, then realises what he is doing and removes it. ",
        ],
        task: 'Decode the two indexed messages. Enter the maker’s name and the single word naming the original purpose.',
        evidence: [
          {"title": "The indexing rule", "text": "For row : word : letter, number all six rows from the top. On odd rows, count words leftward to rightward; on even rows, count them from the right. Within the selected word, always count letters from the left. Ignore punctuation but retain every word. Only word direction reverses."},
          {"title": "The six rows", "text": "1. Mended sleeves sheltered an ordinary afternoon\n2. Patient hands borrowed colours from daylight\n3. Beneath official gold somebody kept company\n4. Brindle watched small shavings become birds\n5. Marta carried tea through tired doorways\n6. No crown can remember another person"},
          {"title": "A note from the Curator", "text": "The first message identifies the maker named on the purchase slips. The second is one thirteen-letter word describing why someone remained beside another person for an afternoon. It names no purchase, debt, or other transaction."},
        ],
        board: {
          kind: 'cipher',
          inscription: 'MAKER: 3:6:3 / 4:4:3 / 6:3:1 / 5:5:1 / 5:1:2\nPURPOSE: 4:5:4 / 3:4:2 / 6:3:5 / 2:6:1 / 5:1:2 / 2:5:3 / 4:6:3 / 3:4:2 / 6:6:1 / 4:4:1 / 2:5:1 / 1:5:4 / 6:1:1',
          fields: [{ id: 'maker', label: 'Maker’s name' }, { id: 'purpose', label: 'Original purpose' }],
          solution: { maker: 'Marta', purpose: 'companionship' }
        },
        hints: [
          'The word direction reverses on rows 2, 4, and 6. The letter direction never reverses.',
          '3:6:3 selects the third letter of “company”: M. The purpose begins C O M P.',
          'The maker is MARTA. The purpose is COMPANIONSHIP.'
        ],
        resolution: [
          "MARTA. COMPANIONSHIP. Her sister had gone to the Hospital. Marta washed the sleeve because it was one of the few things left in her trailer that still carried the sister’s shape. Supine stayed on the little screen while she worked. Later, the Lady’s hand replaced theirs, and the cuff’s hole disappeared. Pip reads the recovered word without attempting a rhyme. You keep the explanation with the study. Whatever tenderness Supine once saw here, she used her revisions to leave its grieving owner outside the picture.",
        ], minutes: pacing
      },
      {
        id: 'portrait_restoration', title: 'An ordinary restoration grant',
        narrative: [
          "On the studies’ backs, a second account records forty-two minutes of preservation grant. Ink, wood, thread, tea, and light were its named purposes. The receipts describe work the grand labels have forgotten: returning names to a register, propping a chair, closing a cuff, keeping a visitor at the table, lighting the room after paid work. The Museum stored the grant in a display counter instead. A smiling Supine coupon rotates behind glass. ",
          "The Curator cannot release the counter without the exact five allocations. A mismatch summons the Aristobats and converts restoration into debt. Ada opens the casing without disturbing the seal, using a strip of metal she carries in her shoe. She waits for you to recover the account before touching its circuit. ",
          "Brindle recognises the chair’s split support in the wood receipt. Pip recognises the tea allowance, though he does not say who supplied it when the grant remained unspent. Behind the counter, the Lady’s face turns past an old stain that nobody has been authorised to clean. These minutes will support small repairs already deferred beyond reason. The arithmetic cannot make the original rooms dry or undo the loss of the people who used them. It can release the value trapped in this display, if every receipt agrees. Ada keeps her hand beside the exposed wire.",
        ],
        task: 'Recover the five whole-minute allocations, satisfying all five conditions together.',
        evidence: [
          {"title": "The sealed grant", "text": "The original grant contained forty-two minutes across these five purposes. None was lost or carried into another period. There is no sixth, unlisted purpose to absorb an excess. The display retained the same total it was supposed to release."},
          {"title": "Brindle’s purchase record", "text": "Wood received four minutes more than ink. Ink and thread together received fifteen. These receipts name actual allocations; the size of the frame is not an additional charge."},
          {"title": "The table receipts", "text": "Thread plus tea equals fourteen minutes. Tea plus light equals sixteen. Both relations refer to the same five-purpose grant and must hold together with the sealed total."},
        ],
        board: {
          kind: 'balance',
          fields: [
            { id: 'ink', label: 'Ink', min: 0, max: 42, suffix: 'minutes' },
            { id: 'wood', label: 'Wood', min: 0, max: 42, suffix: 'minutes' },
            { id: 'thread', label: 'Thread', min: 0, max: 42, suffix: 'minutes' },
            { id: 'tea', label: 'Tea', min: 0, max: 42, suffix: 'minutes' },
            { id: 'light', label: 'Light', min: 0, max: 42, suffix: 'minutes' }
          ],
          equations: ['Ink + wood + thread + tea + light = 42', 'Wood = ink + 4', 'Thread + tea = 14', 'Ink + thread = 15', 'Tea + light = 16'],
          solution: { ink: '7', wood: '11', thread: '8', tea: '6', light: '10' }
        },
        hints: [
          'Express wood and thread in terms of ink. Then use thread + tea to express tea, and tea + light to express light.',
          'If ink is x, the other allocations are x + 4, 15 − x, x − 1, and 17 − x. Substitute all five into the total.',
          'Ink 7; wood 11; thread 8; tea 6; light 10. Their sum is 42.'
        ],
        resolution: [
          "Ink seven, wood eleven, thread eight, tea six, light ten. Ada disconnects the display and routes its minutes to the original accounts. The revolving face stops sideways against the glass. The Curator watches it long enough to realise no announcement is coming. He stamps the receipts and puts them under a board so they will stay flat. Among them are the dates of Supine’s revisions, some before the watchers arrived and some after. ",
        ], minutes: pacing
      },
      {
        id: 'portrait_layers', title: 'The order of disappearance',
        narrative: [
          "Seven cards describe the layers that changed Marta’s washday into THE GIFT. The first lines were drawn on cheap board bent from steam. Beneath those improvements the torn sleeve disappeared. The second chair disappeared too. At the end, one magnificent hand gives and one lesser creature receives. The difficulty of carrying water, the sister’s absence, and the reason to remain beside the bowl have nowhere left to sit.",
          "Ada follows the outline of the erased chair. “It took several attempts,” she says. The Curator explains that the final watching eye was ordered by the Aristobats; Supine signed the revision as her own decision. The earlier erasures also belonged to her. In the hall, visitors repeat the supplied interpretation before they have reached the picture. A microphone checks their words.",
          "Pip asks about the preservation tracing. It should record the painting before the first erasure, if you can establish when it was made. The restorer’s cards have been filed according to the size of each commendation. Their relations remain legible beneath the praise: chair, cup, sleeve, eye, varnish. Arrange all seven stages in actual order. If its departure came early enough, it may be the only witness left to the room as Supine first saw it. ",
        ],
        task: 'Put the seven alterations in chronological order, earliest first. All clues describe this same single painting.',
        evidence: [
          {"title": "Drying records", "text": "Exactly three alterations lie between the tracing and addition of the official eye. Divine varnish followed the eye immediately. No other event can be inserted between eye and varnish to make the chronology appear more gradual."},
          {"title": "Layer boundaries", "text": "The cup was replaced before the torn sleeve was covered. The second chair was erased after the tracing and before the cup replacement. These are layer boundaries observed in this one image, not dates borrowed from another painting."},
          {"title": "The restorer’s certificate", "text": "The ordinary original preceded erasure of the second chair. Taking the preservation tracing was not the first of the seven events. Each card belongs once in the same sequence."},
        ],
        board: {
          kind: 'sequence',
          cards: [
            { id: 'eye', title: 'Add the official eye', description: 'The room begins watching whoever looks into it.' },
            { id: 'original', title: 'Draw the ordinary original', description: 'Two hands, one basin, a shared afternoon.' },
            { id: 'varnish', title: 'Apply divine varnish', description: 'Every imperfection is declared intentional.' },
            { id: 'cup', title: 'Replace the cup with an hourglass', description: 'Tea becomes an allocation of scarce time.' },
            { id: 'trace', title: 'Take the preservation tracing', description: 'A copy leaves the studio for the frame maker.' },
            { id: 'sleeve', title: 'Paint over the torn sleeve', description: 'The thing being mended disappears.' },
            { id: 'chair', title: 'Erase the second chair', description: 'Company becomes a one-sided audience.' }
          ],
          solution: ['original', 'trace', 'chair', 'cup', 'sleeve', 'eye', 'varnish']
        },
        hints: [
          'The eye must have varnish immediately after it. Counting the three intervening events restricts where the tracing can stand.',
          'The tracing cannot be first, so it is second and the eye is sixth. Fit chair, cup, and sleeve into the three spaces between them.',
          'Original → tracing → second chair erased → cup replaced → sleeve covered → official eye added → divine varnish.'
        ],
        resolution: [
          "The tracing left before the chair was erased. Brindle’s uncle made the frame, kept the clean reference, and died without knowing it would become evidence. The eye was added after the shared room had already been emptied. Observation then rewarded what Supine had chosen to remove. You copy the dates while the Curator watches the hall. The archive still holds the tracing. Somewhere under this building’s patched floor is a sheet of paper that reached a workman before the Lady could turn every other person in it into an audience.",
        ], minutes: pacing
      },
      {
        id: 'portrait_archive_walk', title: 'A corridor the cameras cannot finish',
        narrative: [
          "The archive occupies a run of eight-by-eight service bays under the Museum. Closed restoration units form black squares on the plan; the remaining passages are pale. In the actual corridor, hardboard hides disused doors and water creeps beneath each new partition. Cameras compare a visitor’s route with the previous visitor’s. Repeating a square is treated as returning to admire the Lady. An escort takes you upstairs, enters the admiration against your account, and prevents the return. ",
          "Ada has arranged four visits that supply a legitimate route to the tracing: original negative, frame loan, grant release, raw caption. Each provides authority for the next. The final cabinet rejects paperwork collected in another order, even if its contents are identical. The Curator marks the sealed bays where old frames lean against the damp. ",
          "Brindle checks a barrier and finds he could lift it. The Curator touches his sleeve once and then removes his hand. The camera records equipment damage even when it does not record a face. Pip waits at the first junction with the papers inside his coat. There is room for forty-five moves before the archive closes for its automatic break. Keep each square unique and every stop in order. Nobody smiles at the peculiar rules. All of them have lost an afternoon to a rule smaller than this.",
        ],
        task: 'Plan a route through all four marked archive stops in order. Move horizontally or vertically, never revisit a square, and use at most 45 steps.',
        evidence: [
          {"title": "Archive coordinates", "text": "Rows run downward from the top and columns rightward from the left. Start at row 1/column 1. The tracing cabinet is row 5/column 8. Both belong to the mapped archive; no passage outside it may be substituted."},
          {"title": "Document order", "text": "Collect original negative at row 2/column 7, then frame loan at row 8/column 2, grant release at row 6/column 7, and raw caption at row 5/column 7. Each authorises the next, so the visits must occur in this order."},
          {"title": "Inspection policy", "text": "A closed bay cannot be entered. Entering a marked station before its turn invalidates the accumulated papers. Visiting any square twice triggers an escort out of the archive. The valid route must use only orthogonal moves and fit the forty-five-step allowance."},
        ],
        board: {
          kind: 'route', width: 8, height: 8,
          blocked: [17, 18, 19, 22, 25, 26, 29, 30, 49, 50, 52, 53],
          start: 0, end: 39, waypoints: [14, 57, 46, 38], maxSteps: 45,
          solution: [0, 1, 2, 3, 4, 5, 6, 7, 15, 14, 13, 12, 11, 10, 9, 8, 16, 24, 32, 40, 48, 56, 57, 58, 59, 60, 61, 62, 63, 55, 47, 46, 45, 44, 43, 42, 41, 33, 34, 35, 36, 37, 38, 39]
        },
        hints: [
          'Do not descend into the middle before collecting the negative. Keep a separate way back up to the caption.',
          'One safe route uses the top edge, the left edge, and the bottom edge, then folds inward through rows 6 and 5.',
          'From the start: right 7, down 1, left 7, down 6, right 7, up 2, left 6, up 1, right 6. This visits all stops in order in 43 steps.'
        ],
        resolution: [
          "The tracing cabinet opens. Marta holds the sleeve beside a tiny telescreen; Supine has drawn her own screen badly and the wet cuff with painful care. Brindle bends close to the paper and says nothing. On the reverse is a small bed beneath an open window, with a second chair left plain. There is no watching eye. The tracing has stayed here through roof repairs and catalogue revisions, curled at one edge where the damp entered its frame. To see the faint drawing clearly, you still need the original arrangement of archive lamps.",
        ], minutes: pacing
      },
      {
        id: 'portrait_window', title: 'A window instead of an eye',
        narrative: [
          "The lamp panel originally illuminated the tracing from several directions. Later, a cable tied it to the inspection system. Now light thrown onto the picture returns as glare, placing the viewer’s reflection over the faint bed and window. The preserved diagram shows eight lights surrounding a dark centre. Its maker wanted the paper visible without turning the person looking into another obstruction. That maker’s label has been peeled off. Only two staples and a little clean rectangle remain beside the live terminal.",
          "Ada tests a disconnected switch. Each press reverses its own lamp and immediate orthogonal neighbours; diagonal lamps stay unchanged. She tapes a loose contact back into place with a strip from her clock case, then asks you to plan the target before reconnecting it. Brindle holds a cardboard shade over the panel. In the hall, the Aristobat hears a relay click but cannot see which cabinet it belongs to. ",
          "Pip has found a line on the reverse: FOR A ROOM IN WHICH ONE MAY STOP. He leaves it as a statement instead of making it rhyme. Supine once drew an unremarkable bed, a window, and somewhere another person might sit. It gives you one honest detail to mention when a dishonest compliment would be safer. Restore the exact ring of eight lamps, with the centre and border dark. ",
        ],
        task: 'Match the target lamp pattern. Each switch toggles its lamp and its four orthogonal neighbors. Use the target preview as the restored window.',
        evidence: [
          {"title": "Linked switches", "text": "Each press reverses its own cell and immediate orthogonal neighbours. Diagonal lamps never change, and no lamp exists beyond a board edge. Two identical presses cancel; the order of different presses makes no difference to the final lamps."},
          {"title": "The original lighting design", "text": "In the three-by-three square at the board’s centre, light the eight lamps surrounding the centre cell. Leave that centre and the entire outer border dark. The target preview records the complete arrangement needed to remove the inspection glare."},
          {"title": "Ada’s method", "text": "Correct differences in an upper row by pressing immediately below them. The second row can change the first without affecting an earlier row. Note each press; a promising pattern can then be repeated or corrected instead of lost when the glare returns."},
        ],
        board: { kind: 'circuit', size: 5, initial: circuitFrom([0, 2, 4, 6, 9, 11, 15, 18, 21, 24], museumTarget), target: museumTarget, solution: [0, 2, 4, 6, 9, 11, 15, 18, 21, 24] },
        hints: [
          'Work with differences between the current board and the target. ',
          'Starting from the original board, presses at R1C1, R1C3, and R1C5 are part of one complete solution. The remaining presses occupy seven cells across the lower four rows.',
          'Reset, then press R1C1, R1C3, R1C5, R2C2, R2C5, R3C2, R4C1, R4C4, R5C2, R5C5 once each, in any order.'
        ],
        resolution: [
          "The bed and open window appear under the restored light. There is space for somebody beside them, and no promise that anyone will come. The Curator sets the five corrected labels next to the tracing. Brindle folds his purchase slip until it fits his pocket. Pip copies the line exactly. Ada disconnects the counter from this panel, leaving one picture that will not charge anyone for looking. Your compliment now has a subject: an ordinary room the Lady once drew before she removed the people whose lives made it ordinary.",
        ], minutes: pacing
      }
    ],
    conclusion: [
      "Five makers’ names return to the record. The monumental pictures remain where they were, lit above a gallery whose ordinary subjects would struggle to afford admission. The Curator stores the tracing flat and keeps the corrected labels close to it. He does not replace the rule against independent interpretation. He loosens one corner so it can be lifted to reveal the record beneath. It is the amount of defiance he can manage while an Aristobat sleeps outside the door.",
      "On Channel 9, Supine adjusts her chin against a stain-free pillow. You can speak honestly about the wet cuff, the small bed, and the room where another person might have stayed. Your friends wait with you. Their own rooms still need mending, and their clocks still charge the time spent here. If she offers a wish, you will ask for time. Whatever beauty she once recorded, the people who supplied it have not been allowed enough time to live with one another.",
    ]
  },
  {
    id: 'continuity_patient', act: 4, location: 'hospital',
    title: 'The patient without a yesterday',
    subtitle: "The form has misplaced yesterday and offered a living brain as spare tissue.",
    premise: [
      "The Hospital is a row of trailers joined by covered walkways. Some windows are replaced with bags; others are painted white so patients do not have to watch the allotment clock outside. Nurse Reed leads you to an otter’s bed labelled PATIENT PENDING PREVIOUS EXISTENCE. She arrived after the office misplaced yesterday. Her body is here, her account is closed, and the form offers her brain as unwritten stock. Reed has crossed out the classification so hard that the paper has split. The patient holds a folded cloth between fingers that have not finished closing.",
      "Anima has heard your plan to exchange Ada’s brain with the living brain inside Supine’s head. The Lady’s large head opening will admit the shuttle; Ada’s skull will have to be opened by hand. Before he approves any preparation, he makes you attend to this patient. “We do not fill your spare jar with someone the office failed to record.” Ada takes the place beside the bed, Pip brings a pencil, and Brindle stands where he can keep the patched curtain from blowing against the patient’s face. You must establish who is here and what she wants. A date can disappear from a file without removing a life from the organ the doctor has been asked to use.",
    ],
    challenges: [
      {
        id: 'patient_window_words', title: 'A memory the chart cannot own',
        narrative: [
          "The otter watches rain crawl down a plastic pane. Reed asks what she wants, and her mouth moves without enough allotted time to produce a sound. She lifts the folded cloth a fraction toward the sill. The cuff is washed and mended; it has the same shape as the sleeve in Marta’s tracing. The fabric was easier to keep registered than the body holding it.",
          "Pip finds a stitched poem inside the lining. Families use such codes to send memories into the still ward. An inspector may read the poem, but unpicking its stitches spends thread and requires approval. Names can survive where approvals do not reach. The code should identify the wearer and a remembered place. Brindle moves a chair that was blocking the rain, then stands because the floor is too narrow for both.",
          "Anima asks you to wait. A recovered name is no permission to cut open a head. Ada asks the patient whether the seam may be read. Her eyes move from the stitches to you and back. Reed waits for the same movement twice, then records assent to reading only. The bed is already marked as a possible source of unwritten tissue. A missing date has made a person convenient to a procedure. You need to find who is here before an office decides there is nobody to lose.",
        ],
        task: 'Decode the lining’s two messages: the wearer’s name and the single word naming a remembered place.',
        evidence: [
          {"title": "The family’s rule", "text": "Read a triple as row : word : letter. Count rows from the top and words from the left, beginning at 1. In the selected word, count letters from the RIGHT edge, also beginning at 1. Ignore punctuation. Use this same rule on all six rows; a missing date does not alter the code."},
          {"title": "The stitched poem", "text": "1. Rain waited outside while kettles hummed\n2. Someone placed flowers beside the warm glass\n3. My mother opened windows before anybody woke\n4. Remember how small birds arrived without appointments\n5. We counted silver drops across the sill\n6. Tomorrow will come when someone keeps company"},
          {"title": "Reed’s reminder", "text": "The remembered place is one uninterrupted word containing ten letters. The recovered name lets you address the person who is here. Neither message authorises a procedure or requires the wearer to return to a former life."},
        ],
        board: {
          kind: 'cipher',
          inscription: 'WEARER: 4:7:5 / 6:7:6 / 4:1:8 / 3:2:1 / 5:5:3 / 5:1:2\nPLACE: 5:1:2 / 4:7:8 / 3:3:3 / 1:2:1 / 5:5:3 / 5:1:2 / 5:7:4 / 4:7:8 / 4:3:2 / 4:3:1',
          fields: [{ id: 'wearer', label: 'Wearer’s name' }, { id: 'place', label: 'Remembered place' }],
          solution: { wearer: 'Morrow', place: 'windowsill' }
        },
        hints: [
          'Count letters backward inside each selected word, but keep the recovered letters in the message’s printed order.',
          '4:7:5 selects the fifth letter from the right of “appointments”: M. The place begins W I N D.',
          'The wearer is MORROW. The remembered place is WINDOWSILL.'
        ],
        resolution: [
          "MORROW. WINDOWSILL. Reed says the name and the patient’s fingers close around the cuff. Marta’s sister is still here. She wants the flowers beside the plastic pane, close enough to see the rain move behind them. Anima records the request without replacing it with a diagnosis. The ward form has space for organ availability but none for flowers. Reed writes the request over that space. A small, present wish has interrupted the paperwork that was preparing to classify her brain as unused material.",
        ], minutes: pacing
      },
      {
        id: 'patient_five_continuities', title: 'The ward of misplaced traces',
        narrative: [
          "Five charts were mixed when the Hospital installed a sorting machine salvaged from the ration office. It alphabetised patients by the last word they spoke, then discarded those words as medically irrelevant. Five envelopes ended at five wrong beds. Reed unplugged it and kept the envelopes in her uniform. She has worn the same uniform through enough shifts that a pocket has torn around one chart’s folded corner.",
          "Each envelope holds an admission name and a continuity trace: song, smell, habit, promise, or spoken name. None is a test of whether a body deserves a bed. You can reconstruct the correspondence without assuming species, appearance, or a silent mouth determines what somebody remembers. Morrow is watching the newly moved flowers. Their water is in a chipped specimen jar with a previous label still stuck to it.",
          "Brindle once knew a porter who could name every meal of his childhood by its smell and could no longer name the person cooking beside him. Pip remembers songs he does not have breath to sing. Ada reads the promise field and folds that envelope inward, making sure its private contents remain private. Match the five patients and traces to the numbered beds. The charts need to stop wandering before another mistaken envelope becomes authority to treat a living brain as though nothing has ever happened inside it.",
        ],
        task: 'Assign a patient and one continuity trace to every bed. Beds are numbered left to right; use each patient and trace once.',
        evidence: [
          {"title": "How to read the ward notes", "text": "Beside means the immediately adjoining bed. Left of means anywhere farther left, without requiring adjacency. The notes describe the original bed order before the sorter displaced the envelopes."},
          {"title": "Reed’s first pocket", "text": "Tern and Sable occupied adjoining beds, with Sable to Tern’s left. Song lay left of Habit. Exactly one bed separated Smell and Habit. Sable’s trace was Habit. Each relation applies to the same five beds."},
          {"title": "Reed’s second pocket", "text": "Name belonged to neither end bed. Song adjoined Habit, and Elsi adjoined the bed with Habit. Promise lay left of Morrow. Every patient and every continuity trace is used once; none may be discarded because a chart went missing."},
        ],
        board: {
          kind: 'ledger',
          rows: [1, 2, 3, 4, 5].map(n => ({ id: `bed${n}`, title: `Bed ${n}` })),
          columns: [
            { id: 'patient', title: 'Patient', options: ['Tern', 'Elsi', 'Morrow', 'Hollis', 'Sable'] },
            { id: 'trace', title: 'Continuity trace', options: ['Song', 'Smell', 'Habit', 'Promise', 'Name'] }
          ],
          solution: {
            'bed1.patient': 'Hollis', 'bed1.trace': 'Promise',
            'bed2.patient': 'Elsi', 'bed2.trace': 'Song',
            'bed3.patient': 'Sable', 'bed3.trace': 'Habit',
            'bed4.patient': 'Tern', 'bed4.trace': 'Name',
            'bed5.patient': 'Morrow', 'bed5.trace': 'Smell'
          }
        },
        hints: [
          'Sable and Tern must be neighbors in that order. The Name trace and the two-bed separation of Habit and Smell narrow their positions.',
          'Habit belongs in bed 3. Song is in bed 2, Name in bed 4, and Smell in bed 5. Use the remaining patient clues.',
          'Beds 1–5: Hollis / Promise; Elsi / Song; Sable / Habit; Tern / Name; Morrow / Smell.'
        ],
        resolution: [
          "Morrow’s trace is the smell of rain on warm brick. Reed opens the pane a little, though the brick outside has not been warm for days. Hollis’s promise concerns a child’s birthday; Elsi’s song stops before its last line. Each envelope returns to its proper bed. Anima changes INVALID PERSON to INVALID CORRESPONDENCE on the machine’s labels. The charts keep five people’s names beside five bodies whose time the Hospital has been required to hold still.",
        ], minutes: pacing
      },
      {
        id: 'patient_reserve', title: 'Forty-four minutes of care',
        narrative: [
          "Forty-four minutes remain in the still ward’s reserve. They were donated by people who left; some left on their feet and some left with coupons their relatives could no longer redeem. Reed keeps them in a biscuit tin because the treasury charges storage. Rust has reached one corner, and she lines it with a folded discharge form. Morrow could receive eight minutes of waking only if the complete allocation supports it: care, listening, warmth, writing, and observation. ",
          "The reserve serves the ward; no patient’s personal clock will pay for the others. Reed has not promised that waking Morrow will end the shortage. Blank administrative charges have swallowed earlier donations before the person they were intended for could spend them. Anima lays out the supporting totals and relations. His hands look steady over the paper, less steady when he takes them away from it.",
          "Ada asks why observation exceeds listening. The allowance includes the time after the waking ends, when everybody who watched it happen would prefer to go home. Brindle shifts his feet beside the bed. He has stayed through that part before. Pip draws five empty containers, then crosses out the drawing because it looks like another system sorting things. Recover the allocations before opening the tin. Morrow’s consent will still be needed when the interval is offered. ",
        ],
        task: 'Recover five whole-minute allocations from the reserve. Enter nonnegative integers satisfying the total and all four receipt relations.',
        evidence: [
          {"title": "The biscuit-tin total", "text": "The tin contains exactly forty-four minutes for these five allocations. Care names the waking interval itself; the other four allocations pay for the work that supports it. Each purpose appears once in the total. There is no separate supply beyond the tin."},
          {"title": "Reed’s receipts", "text": "Care plus listening equals thirteen minutes. Listening, warmth, and writing together equal twenty-three. Care plus writing equals fifteen. All three receipts refer to the same ward reserve and must agree."},
          {"title": "The doctor’s last note", "text": "Observation receives exactly two minutes more than warmth. The allowance includes remaining after the waking interval, even when the event everyone came to see has ended."},
        ],
        board: {
          kind: 'balance',
          fields: [
            { id: 'care', label: 'Care', min: 0, max: 44, suffix: 'minutes' },
            { id: 'listening', label: 'Listening', min: 0, max: 44, suffix: 'minutes' },
            { id: 'warmth', label: 'Warmth', min: 0, max: 44, suffix: 'minutes' },
            { id: 'writing', label: 'Writing', min: 0, max: 44, suffix: 'minutes' },
            { id: 'observation', label: 'Observation', min: 0, max: 44, suffix: 'minutes' }
          ],
          equations: ['Care + listening + warmth + writing + observation = 44', 'Care + listening = 13', 'Listening + warmth + writing = 23', 'Observation = warmth + 2', 'Care + writing = 15'],
          solution: { care: '8', listening: '5', warmth: '11', writing: '7', observation: '13' }
        },
        hints: [
          'Subtract the three-purpose receipt from the total. The difference contains only care and observation.',
          'Care + observation = 21. Therefore care + warmth = 19. Replace listening with 13 − care and writing with 15 − care in their shared receipt.',
          'Care 8; listening 5; warmth 11; writing 7; observation 13. Their sum is 44.'
        ],
        resolution: [
          "Care eight, listening five, warmth eleven, writing seven, observation thirteen. Reed puts the coupons in five envelopes and leaves them unredeemed until Morrow agrees. The biscuit tin is nearly empty enough to close flat. Anima leaves the account where anyone returning to the ward can read it. Ada studies observation’s thirteen minutes. Your proposed exchange will leave a friend in a body that Supine’s brain has occupied. Getting her back will require care after the grand room and its Switch are behind you. Nobody can afford to leave that work unnamed.",
        ], minutes: pacing
      },
      {
        id: 'patient_transfer_order', title: 'A mind travels with its name',
        narrative: [
          "Morrow agrees. Reed redeems the first care coupon; its printed face blows a kiss and dissolves against the otter’s damp skin. Her breath finishes with a rough little sound. She asks for Marta before she asks about the date. Anima writes both requests down. ",
          "The doctor brings out a practice apparatus built from a drawer runner, jars, and a sterilised clamp. Two named beads stand for Ada’s brain and Supine’s brain; a third stands for the unwritten organ from the Pit. The actual exchange will move wet living brains, with their nerves released and their tissue held in the shuttle. Supine has a large opening in her human head. The named organ will be carried through that opening into the place her brain occupied, while hers enters Ada’s opened skull. ",
          "A later removal needs a speaking jar for Supine and a temporary living organ in Ada’s body while her own brain returns. The signature readers must identify minds rather than their expected faces; clamps must secure the receiver before anything travels. Morrow listens without offering the use of her own head. “Plan getting her out,” she says, looking at Ada. The apparatus contains no living organ now. Reconstruct its safe sequence before the doctor will permit it to become a sequence with blood on the clamp.",
        ],
        task: 'Arrange the seven practice-apparatus events in order. The named beads model people; this rehearsal moves no living brain.',
        evidence: [
          {"title": "Timing marks", "text": "Two events, exactly, stand between waking the empty cradle and shuttling the named mind. The bed latch is released immediately after both signatures have been confirmed. These marks belong to the empty practice apparatus, not a living operation."},
          {"title": "Interlocks", "text": "The receiving cradle is latched after the reciprocal echo test and before the named mind moves. Current signatures are read, and the empty cradle awakened, before that echo test. No arrival may be inferred merely from the bead’s expected destination."},
          {"title": "The witness strip", "text": "Waking the empty cradle is not the first event. Both signatures are confirmed only after the named mind moves. Each of the seven cards records a single event once; none stands for additional concealed steps."},
        ],
        board: {
          kind: 'sequence',
          cards: [
            { id: 'latch', title: 'Latch the receiving cradle', description: 'The destination is physically secure before transport.' },
            { id: 'release', title: 'Release the bed latch', description: 'The model may leave only after both named endpoints are confirmed.' },
            { id: 'echo', title: 'Test the reciprocal echo', description: 'Both ends answer the same call without exchanging identities.' },
            { id: 'read', title: 'Read current signatures', description: 'Begin with the minds who are here now, rather than their expected bodies.' },
            { id: 'confirm', title: 'Confirm both signatures', description: 'Each person remains accounted for at the destination.' },
            { id: 'shuttle', title: 'Shuttle the named mind', description: 'The bead travels in its locked channel with its own name.' },
            { id: 'wake', title: 'Wake the empty cradle', description: 'A receiving space becomes ready without being called a person.' }
          ],
          solution: ['read', 'wake', 'echo', 'latch', 'shuttle', 'confirm', 'release']
        },
        hints: [
          'The two events between waking and transport must include the echo and receiving latch. The two final events form their own fixed pair.',
          'Waking cannot come first. Fit read before wake, then echo and latch between wake and transport. Confirmation and release complete the order.',
          'Read signatures → wake cradle → test echo → latch receiver → shuttle named mind → confirm both signatures → release bed latch.'
        ],
        resolution: [
          "Both named beads arrive correctly. Ada asks for a written stopping rule: if either mind’s signal disappears, no one continues by guessing. Anima writes it large enough to read above the apparatus. Morrow declines further testing, and her refusal ends the question. The rehearsal has produced a sequence, receivers, and a limit. It has not made opening Ada’s skull less terrible or made Supine’s thoughts less dangerous inside it. When living tissue replaces these beads, every name on the practice strip will still need somewhere to remain.",
        ], minutes: pacing
      },
      {
        id: 'patient_return_route', title: 'Prepare a way home',
        narrative: [
          "The Hospital’s service corridors began as paths between parked caravans. Over time, roofs were added across them, tarpaulins replaced with thin board, and washing bays converted into recovery rooms. Reed’s seven-by-seven plan records the current passages, including closed units. An empty carrier must pass clean receiving, warmth, voice verification, and a booked return space in that order. It rehearses the arrival of an unwritten organ from the Pit. Bringing one here before preparing its cradle would leave living tissue waiting beside a locked door.",
          "The plan separates incoming and outgoing lines. Repeating a square crosses them and leaves the return unprepared. The porter has thirty-two moves before his scheduled delivery; thinking through the route does not spend them. Brindle checks the carrier’s wheels, one of which has been taken from a child’s discarded pushchair. He will move the actual jar when the route has been approved. ",
          "Ada has heard the castle described as the difficult part. Reed points to the booked return bed. The castle can be entered by a gap in a patrol; a small bed needs staff, heat, records, and time that nobody has allocated. Pip writes HOME IS ALSO A DESTINATION at the top of the plan, then underlines it once. The procedure cannot finish at the moment somebody leaves Supine’s room. Ada will still have to arrive here.",
        ],
        task: 'Route the empty carrier through four preparation stations in order, then to the return bay. Move orthogonally, never repeat a square, and use no more than 32 steps.',
        evidence: [
          {"title": "Service plan", "text": "Enter at row 1/column 7 and finish at row 7/column 1. A closed bay cannot be used. Each move reaches one horizontally or vertically adjoining square and consumes one step from the thirty-two-step allowance."},
          {"title": "Four stations", "text": "First clean receiving at row 2/column 6; then warmth at row 6/column 1; voice verification at row 4/column 6; and return booking at row 7/column 4. Visiting in this precise order prepares the next station instead of leaving it to somebody arriving later."},
          {"title": "Return requirement", "text": "A future station cannot be touched early. No square may occur twice, including start and finish. Arriving at the finish before the preparations are complete therefore cannot be repaired by leaving and returning."},
        ],
        board: {
          kind: 'route', width: 7, height: 7,
          blocked: [0, 1, 2, 3, 4, 15, 19, 22, 29, 31, 38, 39],
          start: 6, end: 42, waypoints: [12, 35, 26, 45], maxSteps: 32,
          solution: [6, 13, 12, 11, 10, 9, 8, 7, 14, 21, 28, 35, 36, 37, 30, 23, 16, 17, 18, 25, 26, 27, 34, 41, 48, 47, 46, 45, 44, 43, 42]
        },
        hints: [
          'After warmth, keep row 7 free for the final approach. Reach voice verification through the middle passages.',
          'Use row 2 to cross to the left edge. From warmth go right to column 3, up to row 3, then turn across toward voice verification.',
          'From start: down 1, left 6, down 4, right 2, up 3, right 2, down 1, right 2, down 3, left 6. This visits every station in order in 30 steps.'
        ],
        resolution: [
          "Brindle pins the approved route over the carrier. A warmed cradle and a return bed are reserved; the speaking jar bears Supine’s name. Her brain will remain a named person inside it even after it has been lifted from Ada’s skull. Reed checks that the jar’s acoustic tube lets its occupant interrupt. Anima refuses a spare from any patient in this ward. The Pit must supply a living organ that has never belonged to someone. The route is ready. The bodies that will need it are still elsewhere, and the nurses are already tired.",
        ], minutes: pacing
      },
      {
        id: 'patient_two_voices', title: 'Neither person disappears',
        narrative: [
          "The last rehearsal uses a five-by-five witness board. Two complete vertical lines belong to the two named minds. Its indicators have been scrambled deliberately, so neither appearance nor an expectation of where somebody should be can supply the answer. Anima runs a finger over the names beneath them. The board can only certify whether each signal remains accounted for. It cannot tell you that the person arriving has become somebody you hoped she would be.",
          "Ada asks whether Supine will be kinder in a hare’s body. Anima says her brain will remain her own. Her beautiful human body may live without a brain; Ada’s cannot. That is why the later extraction needs a replacement organ ready before Supine’s tissue is removed. Changing who inhabits the Lady’s head may change what the God Switch obeys. It will not undo a single hunger or make Supine’s contempt fade because the new face has ears. Ada listens without pretending this reassures her.",
          "Pip asks if the speaking jar can hear, and Anima checks its tube instead of simply promising. Brindle asks who will lift Ada onto the return carrier if she cannot stand. He puts his name in that field. Restore both witness lines with the complete switching rule. Diagonals do not change; double presses cancel. Its purpose is to keep you from learning those facts by losing someone on the live apparatus.",
        ],
        task: 'Restore both outer columns of witness lamps, matching the target. Pressing one switch toggles its lamp and the four orthogonal neighbors.',
        evidence: [
          {"title": "Witness board", "text": "Both outer columns must be fully lit: all five cells of column 1 and all five of column 5. Every cell in columns 2, 3, and 4 must be dark. One surviving line cannot substitute for the other named mind."},
          {"title": "The switching rule", "text": "Pressing reverses the selected cell and its existing immediate neighbours above, below, left, and right. Diagonals stay unchanged. Repeating a press twice cancels its effect, and changing the order of different presses does not change the result."},
          {"title": "Anima’s reminder", "text": "Compare each lamp with its specified target. Darkening every lamp would erase both required witness lines. The living procedure stops if either named signal disappears; the empty model lets that rule be learnt without losing anyone."},
        ],
        board: { kind: 'circuit', size: 5, initial: circuitFrom([1, 3, 6, 8, 10, 12, 14, 16, 18, 22, 24], hospitalTarget), target: hospitalTarget, solution: [1, 3, 6, 8, 10, 12, 14, 16, 18, 22, 24] },
        hints: [
          'Separate desired light from unwanted light. The two outer columns must remain lit even when nearby switches affect them.',
          'One solution starts by pressing R1C2 and R1C4. It also presses R2C2 and R2C4; the remaining seven presses lie in rows 3–5.',
          'Reset, then press R1C2, R1C4, R2C2, R2C4, R3C1, R3C3, R3C5, R4C2, R4C4, R5C3, R5C5 once each, in any order.'
        ],
        resolution: [
          "Both lines become steady. Anima signs the rehearsal, leaving the consent boxes empty for Ada to answer later. Morrow returns to stillness with the cuff in her hands and the flowers beside the pane. Her chart now has a name, but no new supply of waking time. The doctor rejects the classification that would have made her a spare. A missing yesterday does not make an unwritten brain. If the Pit supplies an organ, he will examine its whole history. Silence is not evidence that nobody has ever lived inside it.",
        ], minutes: pacing
      }
    ],
    conclusion: [
      "Marta is sent word that her sister remains herself. Reed keeps the repaired charts at the beds. The sorter stays unplugged. Forty-four minutes have supplied one eight-minute waking and the work needed around it; the rest of Morrow’s future is still withheld. By the time you leave, the biscuit tin is light, and the flowers cast almost no shadow through the rain-dark plastic. Reed closes the pane before its damp reaches the blanket.",
      "You have a procedure whose outward and return journeys name the people inside it. Ada must decide freely. Her brain must come home. Supine’s removed brain must retain a speaking jar, a name, and the ability to refuse. The spare organ must never have belonged to somebody. Brindle has booked the carrier; Pip has written the stopping rule again in ink that will not wash away. Anima takes the practice beads out of the clamps. The next material the apparatus carries will be alive.",
    ]
  }
];
