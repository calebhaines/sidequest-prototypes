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
    subtitle: 'Recover five ordinary subjects before you compliment an extraordinary woman.',
    premise: [
      'The Curator brings you to the Museum’s Department of Things Not In the Pictures. It occupies a cupboard behind a very large portrait of a very small cupboard. “Her ladyship paints from life,” he says. “The difficulty is that life keeps resembling other people.” Five early studies were bought from the Shanty Hours, enlarged, and gradually incorporated into THE EXCEPTION, THE GIFT, and THE REST. Their original labels have been separated from their frames. The catalogue calls this an improvement in universality.',
      'Pip introduces your company to the Curator: Brindle, an ox porter who carves small wooden birds, and Ada, a hare who repairs clocks and dislikes the arithmetic printed on their faces. They have come to see what the Lady thinks of ordinary hands. Pip finds a folded notice in a drawer: ORDINARY SUBJECTS MUST NOT DISTRACT FROM EXTRAORDINARY AUTHORSHIP. Brindle recognizes a shaving caught beneath one frame. Ada recognizes the little counters recording how long each visitor looks. An Aristobat hangs outside the cupboard, listening to the critics praise a wall they have not examined. Your company stays close. You can restore these works without pretending their maker has never made anything beautiful. But first you must discover whose days she painted, what she changed, and why a woman who calls everyone else an animal cannot bear an empty room.'
    ],
    challenges: [
      {
        id: 'portrait_sources', title: 'Five frames, five missing people',
        narrative: [
          'The studies are mounted in five numbered frames, left to right. A sleeping figure has become a white chair. A pair of little shoes has become a procession of empty footwear. Water from a washing bowl has been promoted to divine sand. A wooden bird is now a wingless herald. A cloth laid over bread has become the Lady’s spotless pillow. None of the original things survives in the approved captions, although the brushstrokes still remember their shapes.',
          'The Curator has kept the purchase slips. “We bought five studies from five people,” he says, straightening an empty label. “Each study had one subject and one maker. The makers sometimes painted someone else. Please do not confuse whose hand made a thing with whose face appears in it.”',
          'Brindle does not point at the bird. He folds his hands into his lap and waits to see whether you will ask. Pip reads the slips aloud in a voice too small for the doorway. Ada spreads them where you can compare positions. You are no longer looking for a single secret signature proving the Lady a fraud. You are trying to return five acts of attention to the people who offered them.'
        ],
        task: 'Assign one ordinary subject and one original maker to each frame. Use every option exactly once in each column.',
        evidence: [
          { title: 'The registrar’s language', text: '“Left of” means anywhere to the left. “Beside” means immediately adjacent. Each maker and subject appears in exactly one of the five frames.' },
          { title: 'Purchase slips, first bundle', text: 'The sleeping neighbor was left of Fenn’s frame. The wooden bird was beside the bread cloth. Sella’s frame was left of Orris’s. The wash basin was left of Brindle’s frame.' },
          { title: 'Purchase slips, second bundle', text: 'The child’s shoes were beside Marta’s frame. Exactly one frame stood between the child’s shoes and the wooden bird. Brindle was left of Fenn. The wash basin occupied neither end. Orris was immediately left of Marta.' }
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
          'Brindle touches the fourth slip. “That one was mine. She bought it for enough time to mend our roof. I thought somebody would look at it.” The Curator restores his name in pencil. Sella watched a neighbor sleep after a night shift; Orris painted shoes a child had outgrown; Fenn covered bread for someone arriving late. These are portraits of care, even where nobody has a face. Marta’s slip carries a second message, written in the Museum’s old protective cipher.'
        ], minutes: pacing
      },
      {
        id: 'portrait_washday', title: 'What the water was for',
        narrative: [
          'Marta’s study shows two hands on opposite sides of a basin. One is furred, one is not. The official interpretation praises the Lady for providing water to an ungrateful animal. Under raking light, you can see the first version: both furred hands hold the same wet sleeve. Neither is receiving a gift. The cuff has a hole, and somebody has laughed hard enough to shake the water.',
          'The Curator explains that Supine once visited through an early telescreen carried on a wheeled stand. Marta put it beside the wash bowl because that was where everyone sat. Marta talked to the screen while she worked and forgot to address it as Your Divine Uniqueness. Supine asked for the study the next morning.',
          '“Was it theft?” Pip whispers. The Curator considers the question. “Marta was paid. Her explanation was removed. Those are different facts, and both are necessary.” He has found the explanation in a box labeled UNSUITABLE ARTISTIC MOTIVES. Its words were indexed so an inspector could see a harmless verse instead of a conversation. The cipher does not conceal a conspiracy. It preserves the reason someone wanted another person beside the basin. You must recover that reason before calling this picture a gift.'
        ],
        task: 'Decode the two indexed messages. Enter the maker’s name and the single word naming the original purpose.',
        evidence: [
          { title: 'The indexing rule', text: 'Read each triple as row : word : letter. Number the six rows from the top. Count words from the left on odd rows and from the right on even rows. Always count letters from the left within the chosen word. Ignore punctuation; retain every word.' },
          { title: 'The six rows', text: '1. Mended sleeves sheltered an ordinary afternoon\n2. Patient hands borrowed colours from daylight\n3. Beneath official gold somebody kept company\n4. Brindle watched small shavings become birds\n5. Marta carried tea through tired doorways\n6. No crown can remember another person' },
          { title: 'A note from the Curator', text: 'The first message names the maker already identified in the purchase slips. The second names a reason to share an afternoon. It is thirteen letters and does not describe a transaction.' }
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
          'The sleeve belonged to Marta’s sister, who had been sent to the Hospital. Marta washed it while someone kept her company. The visitor was Supine, still learning how to remain when nothing was being performed for her. Later she repainted the ordinary hand into her own magnificent one. “She remembered the water,” says Pip, “and forgot the together.” You preserve the message beside the new label. An honest compliment will have to contain both her longing and what that longing has cost.'
        ], minutes: pacing
      },
      {
        id: 'portrait_restoration', title: 'An ordinary restoration grant',
        narrative: [
          'The backs of the studies carry a second account: a grant of forty-two minutes intended to preserve them. Its receipts were divided between ink, wood, thread, tea, and light. The private receipts tell a more practical story. Ink returned names to a register. Wood supported a tired neighbor’s chair. Thread closed a sleeve. Tea brought a visitor back to the table. Light allowed someone to look after the day’s paid work was done.',
          '“You cannot restore the picture without restoring its circumstances,” says the Curator. “An uncovered face with a covered name would be a rather fashionable failure.” The Museum has kept these minutes in a display counter rather than spending them. Ada can release the counter for its original purposes, provided the allocation matches all the surviving receipts. A mismatch would call the Aristobats and turn the restoration into another debt.',
          'Brindle looks embarrassed by the wood allowance. “The chair needed more than paint,” he says. Pip looks at the tea allowance and says nothing. You remember how often your friends have placed something warm before you without calculating your usefulness. This grant will not buy a new masterpiece. It will support the little arrangements which made the old studies possible. The Lady’s face appears on every coupon, but she is absent from every receipt. For once, the arithmetic may let something exist without making it resemble her.'
        ],
        task: 'Recover the five whole-minute allocations, satisfying all five conditions together.',
        evidence: [
          { title: 'The sealed grant', text: 'The complete grant was 42 minutes. None was lost, carried forward, or allocated to an unlisted purpose.' },
          { title: 'Brindle’s purchase record', text: 'The wood allocation exceeded ink by four minutes. Ink and thread together cost fifteen minutes.' },
          { title: 'The table receipts', text: 'Thread and tea together received fourteen minutes. Tea and light together received sixteen. ' }
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
          'Ada uncouples the display counter. The minutes go to the five original restoration accounts, with the recipients’ names attached. No face blows a kiss; the little counter simply becomes empty. The Curator allows himself a smile. “There. A gift with a bottom.” The papers include dates for the Lady’s alterations. Some precede the watching apparatus; others follow it. Seeing who asked for each alteration will be harder than deciding whether the final paintings are lovely.'
        ], minutes: pacing
      },
      {
        id: 'portrait_layers', title: 'The order of disappearance',
        narrative: [
          'A restorer has made seven cards from the paint layers. They describe the history of Marta’s washday image as it became part of THE GIFT. The earliest surface is lively and uneven. The later surfaces are technically extraordinary: a reflected window you could almost climb through, a hand whose shadow seems warmer than your own. Under that brilliance, the shared sleeve vanishes. Then the second chair. By the final version, nobody in the room is doing anything except receiving.',
          '“She did not suddenly stop seeing us,” says Ada. “She practiced.” The Curator replies that the practice was supervised. The Aristobats ordered the final eye added so the painting would visibly witness its viewers. Supine called the eye her own decision. You cannot make one harmless by pretending the other did not happen.',
          'Pip wants to know whether the first tracing still exists. It would show the scene before the useful, inconvenient things were repainted. The restorer’s notes identify which stage supplied that tracing, but the cards have been filed by the size of their congratulations instead of their dates. Arrange the actual events. You need to know when the original image left the studio and when observation began pretending to be affection. The difference may matter when you eventually stand before the woman who painted it.'
        ],
        task: 'Put the seven alterations in chronological order, earliest first. All clues describe this same single painting.',
        evidence: [
          { title: 'Drying records', text: 'Exactly three events occurred between taking the tracing and adding the official eye. Divine varnish was applied immediately after the eye was added.' },
          { title: 'Layer boundaries', text: 'Replacing the cup happened before covering the torn sleeve. Erasing the second chair happened after the tracing and before replacing the cup.' },
          { title: 'The restorer’s certificate', text: 'The ordinary original was drawn before the second chair was erased. Taking the tracing was not the first event. ' }
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
          'The tracing left the studio before the first erasure. Brindle’s uncle made its frame, and the Museum still keeps it. The eye was added after the room had already been emptied of company. The apparatus did not invent Supine’s loneliness; it rewarded the choices that deepened it. You copy both dates. A frame maker’s ordinary insistence on keeping a clean reference has preserved something the Great Castle Divine could not improve out of existence.'
        ], minutes: pacing
      },
      {
        id: 'portrait_archive_walk', title: 'A corridor the cameras cannot finish',
        narrative: [
          'The preservation tracing is held in the Museum’s lower archive. Its passages form an eight-by-eight grid. Black squares are closed restoration bays. Pale squares are walkable passages. Every crossing is watched, but the watchers only compare a visitor’s route with the previous visitor’s. Repeat a square and the system concludes you have returned to admire the Lady, at which point an attendant escorts you upstairs.',
          'Ada has prepared a sequence of four archive visits which establishes a legitimate purpose for reaching the tracing. First you collect the original negative. Then you sign the frame loan, collect the grant release, and compare the raw caption. The final cabinet will accept the accumulated paperwork only in that order. Each stop changes the next record; fetching a later document early would turn a recovered history into another official fiction.',
          'Brindle offers to carry you over a barrier. The Curator nearly faints. “A shortcut is an architectural criticism,” he whispers. Brindle lowers his hands and grins. Pip stays beside the first junction so you can plan the whole route before taking it. It requires knowing where you are going while the Museum tries to tell you that every destination is the same face. Keep the path short enough to finish before the archive’s automatic tea break.'
        ],
        task: 'Plan a route through all four marked archive stops in order. Move horizontally or vertically, never revisit a square, and use at most 45 steps.',
        evidence: [
          { title: 'Archive coordinates', text: 'Rows run top to bottom; columns run left to right. Begin at row 1, column 1. Finish at the tracing cabinet, row 5, column 8.' },
          { title: 'Document order', text: '1: original negative at row 2, column 7. 2: frame loan at row 8, column 2. 3: grant release at row 6, column 7. 4: raw caption at row 5, column 7.' },
          { title: 'Inspection policy', text: 'Closed bays cannot be entered. A marked stop visited too early invalidates the paperwork. Retracing any square summons the escort. ' }
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
          'The cabinet opens onto the tracing of Supine’s earliest copy. Marta’s hand steadies a sleeve while Supine, appearing on a tiny screen, tries to follow a conversation whose subject is somebody else. The Lady drew herself badly and the wet cuff beautifully. Brindle laughs with tenderness. “She was learning.” On the reverse, another drawing shows a plain bed beneath an open window. The watching eye is absent. To view that drawing properly, you must switch the archive’s inspection lamps back into their original arrangement.'
        ], minutes: pacing
      },
      {
        id: 'portrait_window', title: 'A window instead of an eye',
        narrative: [
          'The lamp panel once lit the tracing from several directions, revealing graphite beneath the gold. It was later connected to the inspection system. Now each attempt to bring light to one part of the picture casts glare across its neighbors. The panel’s design is printed alongside it: a square window of eight lights with a quiet center. Its maker wanted you to see the paper without seeing yourself reflected over it.',
          'Ada tests an unconnected switch and explains the linked mechanism. Each press flips its own lamp and the lamps immediately above, below, left, and right. Diagonal lamps remain alone. “Someone built cooperation into the wiring,” she says. “Then they labeled every consequence a fault.” Brindle holds a shade over the apparatus so the Aristobat in the hall cannot mistake the changing lights for an invitation.',
          'Pip finds a line on the back of the drawing: FOR A ROOM IN WHICH ONE MAY STOP. He does not finish it for the Lady. He lets the sentence remain an ordinary wish. You have found enough to praise her honestly: the wet sleeve, the attempt to listen, the plain sleeping place. None requires agreeing that the other people in the pictures were beneath her. Restore the window. Let the work have a little darkness at its center, somewhere a person might rest without being observed.'
        ],
        task: 'Match the target lamp pattern. Each switch toggles its lamp and its four orthogonal neighbors. Use the target preview as the restored window.',
        evidence: [
          { title: 'Linked switches', text: 'Only orthogonal neighbors change; a diagonal contact never toggles. Lamps beyond an edge do not exist. The order of presses does not affect their final result, and two presses of the same switch cancel.' },
          { title: 'The original lighting design', text: 'The target is the eight lamps surrounding the center lamp in a three-by-three square. The middle and the outer border must remain dark. The target preview shows this complete arrangement.' },
          { title: 'Ada’s method', text: 'Try resolving a row from above: a lamp in the first row can be changed from the second row without touching a row before it. Record your presses so a promising attempt can be repeated or corrected.' }
        ],
        board: { kind: 'circuit', size: 5, initial: circuitFrom([0, 2, 4, 6, 9, 11, 15, 18, 21, 24], museumTarget), target: museumTarget, solution: [0, 2, 4, 6, 9, 11, 15, 18, 21, 24] },
        hints: [
          'Work with differences between the current board and the target. ',
          'Starting from the original board, presses at R1C1, R1C3, and R1C5 are part of one complete solution. The remaining presses occupy seven cells across the lower four rows.',
          'Reset, then press R1C1, R1C3, R1C5, R2C2, R2C5, R3C2, R4C1, R4C4, R5C2, R5C5 once each, in any order.'
        ],
        resolution: [
          'The glare withdraws. The bed is small; the window is open; there is room for a chair belonging to someone else. The Curator lays the restored labels beside the tracing. He has not declared the paintings innocent. He has given them back the people who make them worth discussing. Brindle keeps his old purchase slip. Pip copies the unfinished line. Ada disconnects the visitor counter from this one lamp panel. When you speak to Supine, your compliment can finally mean something particular.'
        ], minutes: pacing
      }
    ],
    conclusion: [
      'You leave the cupboard with five makers’ names and the record of a real afternoon. THE EXCEPTION, THE GIFT, and THE REST still tower over the gallery. Their beauty has not disappeared. It has acquired company, and company asks harder questions than applause. The Curator replaces NO INDEPENDENT INTERPRETATIONS with PLEASE RETURN THE PENCIL.',
      'On Channel 9, the Lady adjusts the angle of her chin. You can tell her about the water in the sleeve and the window she once drew. You can tell her that being moved is different from being obedient. Your friends wait behind you, people whose days already contain work, appetite, smoke, fear, and art. If she offers a wish, you know why you will ask for time.'
    ]
  },
  {
    id: 'continuity_patient', act: 4, location: 'hospital',
    title: 'The patient without a yesterday',
    subtitle: 'A missing date is not an empty mind.',
    premise: [
      'Nurse Reed leads you past the stopped clocks to a bed whose label says PATIENT PENDING PREVIOUS EXISTENCE. An otter lies there with a folded cloth in her hands. The Hospital received her after the allotment office misplaced yesterday. Her body is present, her account is closed, and the form asks the nurse to classify her as an unwritten organ. Reed has crossed out the question so hard the paper is nearly two sheets.',
      'Dr. Anima has heard your proposal to change the Lady’s mind literally. Before he will sign anything, he asks you to help this patient. “A procedure can be beautifully arranged and still begin with a terrible mistake,” he says. “We will not find your spare among people somebody has failed to record.” Ada sits beside the bed; Pip brings a pencil; Brindle brings a chair strong enough to make waiting comfortable. First you must establish who is here, what she wants, and how a person continues when an office decides she never began.'
    ],
    challenges: [
      {
        id: 'patient_window_words', title: 'A memory the chart cannot own',
        narrative: [
          'The patient watches the rain. When Reed asks what she would like, she lifts the cloth toward the window. Her mouth moves without enough allotted time to make a sound. The cloth is washed and carefully mended. You recognize the cuff from Marta’s preserved study. It has arrived here by a longer, less official route than a Museum acquisition.',
          'Pip finds a poem stitched inside the lining. Families use this code when sending memories into the still ward. An inspector is permitted to read a poem but discouraged from unpicking clothing; unpicking constitutes an unauthorized expenditure of thread. The code should name the wearer and one remembered place.',
          '“Do not mistake the message for permission,” says Dr. Anima. “It can help us address her. It cannot tell us what to do to her.” Ada asks whether the patient wants the lining examined. Her eyes move to the stitches, then back to you. Reed waits for the same movement twice before writing assent to reading, and only reading. Brindle turns his chair so your work does not block the rain. The patient deserves to see something beyond the people deciding whether she exists.'
        ],
        task: 'Decode the lining’s two messages: the wearer’s name and the single word naming a remembered place.',
        evidence: [
          { title: 'The family’s rule', text: 'Each triple gives row : word : letter. Number rows from the top and count words from the left. Count letters from the RIGHT edge of the selected word, starting at one. Ignore punctuation. This rule is the same for all six rows.' },
          { title: 'The stitched poem', text: '1. Rain waited outside while kettles hummed\n2. Someone placed flowers beside the warm glass\n3. My mother opened windows before anybody woke\n4. Remember how small birds arrived without appointments\n5. We counted silver drops across the sill\n6. Tomorrow will come when someone keeps company' },
          { title: 'Reed’s reminder', text: 'The place is one continuous word, ten letters long. Recovering an old name offers a way to ask a present question; it does not obligate the wearer to resume an old life.' }
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
          'Reed says “Morrow” gently. The patient’s eyes follow her voice; her fingers tighten around the cuff. Marta’s sister has survived her missing date. She wants the flowers moved onto the windowsill, where the rain can make their shadows dance. The doctor records the request exactly. “A small preference is still a preference,” he says. “We have found someone to ask, not someone to use.”'
        ], minutes: pacing
      },
      {
        id: 'patient_five_continuities', title: 'The ward of misplaced traces',
        narrative: [
          'Morrow’s chart has been mixed with four others after the Hospital installed a machine for putting lives in alphabetical order. It alphabetized by the final word each person said, then removed those words as medically irrelevant. Five beds now have five wrong envelopes. Reed unplugged it and has been carrying the envelopes in her own pockets ever since.',
          'Each envelope contains one patient’s admission name and one continuity trace: a song, smell, habit, promise, or spoken name. A trace is something a patient used to recognize a familiar moment. It is not a test that can prove someone unworthy of care. The nurse has enough positional notes to rebuild the correspondence, if you compare them without assuming bodies determine memories.',
          'Brindle knows a porter who remembers every childhood meal by its smell and forgets every colleague’s name. Pip remembers a melody he cannot sing. Ada remembers a promise she would rather not discuss in a ward. Their examples defeat the machine’s convenient categories. Morrow touches the windowsill and waits. Correct answers will stop a careless filing system from separating her from a request she has already made.'
        ],
        task: 'Assign a patient and one continuity trace to every bed. Beds are numbered left to right; use each patient and trace once.',
        evidence: [
          { title: 'How to read the ward notes', text: '“Beside” means immediately adjacent. “Left of” means somewhere to the left, not necessarily next door.' },
          { title: 'Reed’s first pocket', text: 'Tern was beside Sable. Song was left of Habit. Exactly one bed lay between Smell and Habit. Sable’s trace was Habit. Sable was left of Tern.' },
          { title: 'Reed’s second pocket', text: 'Name occupied neither end bed. Song was beside Habit. Elsi was beside Habit. Promise was left of Morrow. These positions describe the original ward before the envelopes were displaced.' }
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
          'Morrow’s envelope contains a description of the smell after rain touches warm brick. Reed opens the window a little. The patient smiles before anyone asks her to. Hollis’s promise concerns a child’s birthday; Elsi’s song has an unfinished last line. The envelopes return to their beds. Anima crosses INVALID PERSON off the machine’s remaining labels. “Invalid correspondence,” he writes instead. “The distinction is the entire treatment.”'
        ], minutes: pacing
      },
      {
        id: 'patient_reserve', title: 'Forty-four minutes of care',
        narrative: [
          'The still ward has a reserve donated by patients who left it. Their coupons are kept in a biscuit tin rather than a treasury because the treasury would charge storage. Forty-four minutes remain. Morrow can receive a small waking interval from the reserve, but the staff must first provide the care around it: listening, warmth, a written record, observation, and the interval itself. ',
          'The doctor does not ask you to wager which patient deserves to wake. The reserve already belongs to the ward, and each allocation serves everyone here. Reed has promised no one that this repair will end the rationing. She has promised to carry out this one complete act of care without letting its cost vanish into a vague phrase like charitable administration.',
          'Ada notices that the observation allowance is larger than the listening allowance. “Watching costs more than hearing?” Anima turns the receipt over. “It also includes staying after the exciting part.” Brindle understands that. Pip draws five cups in his notebook. Each has a bottom. Recover the allocation before opening the tin, so the waking interval arrives with the support it was meant to have.'
        ],
        task: 'Recover five whole-minute allocations from the reserve. Enter nonnegative integers satisfying the total and all four receipt relations.',
        evidence: [
          { title: 'The biscuit-tin total', text: 'All five allocations together use exactly 44 minutes. The interval itself is the field labeled Care; the other four fields cover its supporting work. No allocation is duplicated in the total.' },
          { title: 'Reed’s receipts', text: 'Care and listening together take thirteen minutes. Listening, warmth, and writing together take twenty-three. Care and writing together take fifteen.' },
          { title: 'The doctor’s last note', text: 'Observation takes exactly two minutes more than warmth. ' }
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
          'The nurse separates the coupons into five envelopes. She does not redeem them yet; Morrow must agree to the interval when it is offered. The doctor leaves a written account beside every bed. “When somebody says care was free, ask who supplied the time,” he says. Ada keeps that sentence. Your later plan must include the quiet work after the Switch, when the spectacle has ended and your friend still needs to come home.'
        ], minutes: pacing
      },
      {
        id: 'patient_transfer_order', title: 'A mind travels with its name',
        narrative: [
          'Morrow agrees to the waking interval. Reed redeems its first coupon, and the face on it blows a kiss which Morrow receives with considerable skepticism. She asks for Marta, then asks why everyone looks as though they have discovered a continent. You explain the missing date. “I missed yesterday,” she says. “Yesterday did not miss me.” The doctor writes that down too.',
          'Anima brings out a wooden practice apparatus. No living organ enters it. Two beads represent two named minds; a third bead represents the unwritten organ you would obtain from the Pit. The doctor demonstrates that a mind exchange physically carries each living brain into the other body. It does not duplicate a thought or wipe a memory. A later return needs a sheltered place for Supine and a temporary living organ for Ada’s body.',
          'Ada asks who will know whether she has arrived. The answer cannot be her new appearance. Anima shows the apparatus’s signature readers, receiving cradle, latches, and return indicators. Seven recorded events have slipped out of order. You must reconstruct the safe rehearsal before the doctor will let anyone call it a plan. Morrow watches from the window. “Make the homeward part as carefully as the outward part,” she says. Her eight minutes are doing something the missing paperwork could never have anticipated.'
        ],
        task: 'Arrange the seven practice-apparatus events in order. The named beads model people; this rehearsal moves no living brain.',
        evidence: [
          { title: 'Timing marks', text: 'Exactly two events occur between waking the empty cradle and shuttling the named mind. Releasing the bed latch immediately follows confirmation of both signatures.' },
          { title: 'Interlocks', text: 'Latching the receiving cradle happens after the reciprocal echo test and before the named mind moves. Reading current signatures and waking the cradle both happen before the echo test.' },
          { title: 'The witness strip', text: 'Waking the cradle is not the first event. Confirming both signatures happens after the named mind moves. All seven events appear once; an event does not stand for several hidden actions.' }
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
          'The beads arrive with their names intact. Ada asks the doctor to add a stopping rule: if either named signal disappears, nobody improvises an ending. Anima adds it in large letters. Morrow declines to lend her memories to any further test, and the apparatus stays empty. She has helped define a procedure without becoming its material. That is the first condition the new form records.'
        ], minutes: pacing
      },
      {
        id: 'patient_return_route', title: 'Prepare a way home',
        narrative: [
          'Reed unrolls a plan of the Hospital’s service passages. Before an unwritten organ can be accepted, its cradle must pass four stations: clean receiving, warmth, voice verification, and a booked return space. The route is a rehearsal with an empty carrier. Its purpose is to ensure that nobody fetches a beginning from the Pit only to discover the Hospital has prepared nowhere for it to remain.',
          'The passages form a seven-by-seven grid. Some bays are closed. The carrier can turn along the corridors but cannot cross a closed bay or return through a square already used: the rehearsal models separate incoming and outgoing lines, and a crossed line would leave the return unprepared. The ward’s porter allows thirty-two moves before his next scheduled delivery. Brindle checks the wheels and agrees to take the actual carrier when the plan has been approved.',
          'Ada traces the map with one claw. “People keep describing the castle as the difficult part.” Reed points to the return station. “Escaping a grand room is often simpler than arranging a small bed.” Pip writes a heading for the paperwork: HOME IS ALSO A DESTINATION. Plan the route while the staff settle her, and leave enough space in the diagram for the ordinary work that will follow your extraordinary idea.'
        ],
        task: 'Route the empty carrier through four preparation stations in order, then to the return bay. Move orthogonally, never repeat a square, and use no more than 32 steps.',
        evidence: [
          { title: 'Service plan', text: 'Start at row 1, column 7. End at row 7, column 1. Closed bays are impassable; each move to a neighbor is one step.' },
          { title: 'Four stations', text: 'Visit clean receiving at row 2, column 6; warmth at row 6, column 1; voice verification at row 4, column 6; return booking at row 7, column 4. This exact order prepares each next station.' },
          { title: 'Return requirement', text: 'Touching a later station early invalidates the plan. Every square can appear only once, including start and finish. Reaching the finish too early is therefore a dead end, even if the carrier could leave it again.' }
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
          'Brindle pins the route above the carrier. A bed, a warm cradle, and a speaking jar are now reserved by purpose rather than prestige. The jar’s label includes Supine’s name, because the plan has consequences for her as well as Ada. “Keeping someone alive is not the same as agreeing with her,” says Reed. The doctor will refuse any spare organ taken from this ward. The Pit must supply something that has never been someone.'
        ], minutes: pacing
      },
      {
        id: 'patient_two_voices', title: 'Neither person disappears',
        narrative: [
          'The last model is a five-by-five board of paired witness lamps. Its target pattern holds a vertical line on each outer edge: one for each named person. Anima has deliberately scrambled the indicators. A successful demonstration must restore both lines, leaving no ambiguity about which mind remains at either end.',
          'Ada asks whether Supine will become kind just because she has a hare’s ears. The doctor says no. A brain is not a bottle of manners which can be poured into another shape. The hope is that the machinery will stop obeying the same thought, and that Supine will encounter a day she has spent years refusing to hear. It remains a frightening plan. Calling it safe cannot make the frightening part disappear.',
          'Pip asks whether the jar can hear a poem. Anima says it can, and must also be able to interrupt. Brindle asks who carries Ada home if she wants to stop. The doctor points to the reserved carrier. Ada asks for the stopping rule to remain visible, and for her future consent to be asked without an audience. Your work has made those questions possible. Now restore both named signals. The rehearsal is complete only when everyone in it has somewhere to remain and a voice with which to object.'
        ],
        task: 'Restore both outer columns of witness lamps, matching the target. Pressing one switch toggles its lamp and the four orthogonal neighbors.',
        evidence: [
          { title: 'Witness board', text: 'The target lights all five cells in the first column and all five in the last. Every cell in the middle three columns stays dark. Both named lines must be complete.' },
          { title: 'The switching rule', text: 'A press changes its own cell and the existing cells directly above, below, left, and right. Diagonals never change. Any cell pressed twice cancels; press order does not matter.' },
          { title: 'Anima’s reminder', text: 'Compare every lamp to its target rather than trying to darken everything. A living procedure would stop if either named signal vanished; a model exists so you can learn before reaching that moment.' }
        ],
        board: { kind: 'circuit', size: 5, initial: circuitFrom([1, 3, 6, 8, 10, 12, 14, 16, 18, 22, 24], hospitalTarget), target: hospitalTarget, solution: [1, 3, 6, 8, 10, 12, 14, 16, 18, 22, 24] },
        hints: [
          'Separate desired light from unwanted light. The two outer columns must remain lit even when nearby switches affect them.',
          'One solution starts by pressing R1C2 and R1C4. It also presses R2C2 and R2C4; the remaining seven presses lie in rows 3–5.',
          'Reset, then press R1C2, R1C4, R2C2, R2C4, R3C1, R3C3, R3C5, R4C2, R4C4, R5C3, R5C5 once each, in any order.'
        ],
        resolution: [
          'Both witness lines become steady. The doctor signs the rehearsal record, then leaves the consent boxes blank. Ada will decide for herself when the actual conditions are known. Morrow settles into the stillness with her name restored and her flowers beside the rain. Anima refuses the old classification in full: a missing yesterday cannot make an unwritten brain. If you bring one from the Pit, he will examine its history before accepting its quiet.'
        ], minutes: pacing
      }
    ],
    conclusion: [
      'Marta is sent word that her sister is here, still herself. Reed keeps the repaired charts beside the beds instead of trusting the alphabetizing machine again. The forty-four-minute reserve has supplied one small interval and all the work around it; tomorrow’s scarcity remains a problem to solve, not a reason to pretend this care was wasted.',
      'You leave with a sharper plan. Ada must choose freely, her own brain must return, Supine must remain a named, speaking person, and the spare organ must never have belonged to anyone. Brindle has a route. Pip has a place for a poem. Anima has a place for everyone to come home.'
    ]
  }
];
