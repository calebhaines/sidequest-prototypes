import { createInterior } from './interior-art.js';

// Authored indoor spaces for every enclosed Mercy County exterior.
const BUILDINGS = {
  "diner": {
    "id": "diner",
    "name": "Mercy Diner",
    "door": {
      "x": 456,
      "y": 675
    },
    "doorArt": {
      "x": 456,
      "y": 642
    },
    "exterior": {
      "x": 319,
      "y": 474,
      "width": 270,
      "height": 177
    },
    "kind": "diner",
    "district": "Mercy Falls"
  },
  "telephone": {
    "id": "telephone",
    "name": "Mercy Telephone Shelter",
    "door": {
      "x": 461,
      "y": 315
    },
    "doorArt": {
      "x": 461,
      "y": 282
    },
    "exterior": {
      "x": 409,
      "y": 193,
      "width": 112,
      "height": 98
    },
    "kind": "phone",
    "district": "Mercy Falls"
  },
  "theater": {
    "id": "theater",
    "name": "Vale Theater",
    "door": {
      "x": 1040,
      "y": 607
    },
    "doorArt": {
      "x": 1040,
      "y": 574
    },
    "exterior": {
      "x": 903,
      "y": 335,
      "width": 274,
      "height": 248
    },
    "kind": "theater",
    "district": "Mercy Falls"
  },
  "motel-room-1": {
    "id": "motel-room-1",
    "name": "Mercy Motel Room 1",
    "door": {
      "x": 1204,
      "y": 778
    },
    "doorArt": {
      "x": 1204,
      "y": 745
    },
    "exterior": {
      "x": 1178,
      "y": 626,
      "width": 303,
      "height": 128
    },
    "kind": "motel",
    "district": "Mercy Falls"
  },
  "motel-room-2": {
    "id": "motel-room-2",
    "name": "Mercy Motel Room 2",
    "door": {
      "x": 1250,
      "y": 778
    },
    "doorArt": {
      "x": 1250,
      "y": 745
    },
    "exterior": {
      "x": 1178,
      "y": 626,
      "width": 303,
      "height": 128
    },
    "kind": "motel",
    "district": "Mercy Falls"
  },
  "motel-room-3": {
    "id": "motel-room-3",
    "name": "Mercy Motel Room 3",
    "door": {
      "x": 1296,
      "y": 778
    },
    "doorArt": {
      "x": 1296,
      "y": 745
    },
    "exterior": {
      "x": 1178,
      "y": 626,
      "width": 303,
      "height": 128
    },
    "kind": "motel",
    "district": "Mercy Falls"
  },
  "motel-room-4": {
    "id": "motel-room-4",
    "name": "Mercy Motel Room 4",
    "door": {
      "x": 1342,
      "y": 778
    },
    "doorArt": {
      "x": 1342,
      "y": 745
    },
    "exterior": {
      "x": 1178,
      "y": 626,
      "width": 303,
      "height": 128
    },
    "kind": "motel",
    "district": "Mercy Falls"
  },
  "motel-room-5": {
    "id": "motel-room-5",
    "name": "Mercy Motel Room 5",
    "door": {
      "x": 1388,
      "y": 778
    },
    "doorArt": {
      "x": 1388,
      "y": 745
    },
    "exterior": {
      "x": 1178,
      "y": 626,
      "width": 303,
      "height": 128
    },
    "kind": "motel",
    "district": "Mercy Falls"
  },
  "motel-room-6": {
    "id": "motel-room-6",
    "name": "Mercy Motel Room 6",
    "door": {
      "x": 1434,
      "y": 778
    },
    "doorArt": {
      "x": 1434,
      "y": 745
    },
    "exterior": {
      "x": 1178,
      "y": 626,
      "width": 303,
      "height": 128
    },
    "kind": "motel",
    "district": "Mercy Falls"
  },
  "laundry": {
    "id": "laundry",
    "name": "Mercy Laundromat",
    "door": {
      "x": 1006,
      "y": 1009
    },
    "doorArt": {
      "x": 1006,
      "y": 976
    },
    "exterior": {
      "x": 925,
      "y": 847,
      "width": 161,
      "height": 138
    },
    "kind": "laundry",
    "district": "Mercy Falls"
  },
  "cabin-west": {
    "id": "cabin-west",
    "name": "West Road Cabin",
    "door": {
      "x": 359,
      "y": 1065
    },
    "doorArt": {
      "x": 359,
      "y": 1032
    },
    "exterior": {
      "x": 299,
      "y": 932,
      "width": 120,
      "height": 109
    },
    "kind": "cabin",
    "district": "Mercy Falls"
  },
  "cabin-east": {
    "id": "cabin-east",
    "name": "East Road Cabin",
    "door": {
      "x": 1445,
      "y": 1102
    },
    "doorArt": {
      "x": 1445,
      "y": 1069
    },
    "exterior": {
      "x": 1380,
      "y": 968,
      "width": 129,
      "height": 110
    },
    "kind": "cabin",
    "district": "Mercy Falls"
  },
  "mill": {
    "id": "mill",
    "name": "Mercy Paper Mill",
    "door": {
      "x": 2343,
      "y": 608
    },
    "doorArt": {
      "x": 2343,
      "y": 575
    },
    "exterior": {
      "x": 2152,
      "y": 374,
      "width": 389,
      "height": 210
    },
    "kind": "mill",
    "district": "The paper mill district"
  },
  "mill-tower": {
    "id": "mill-tower",
    "name": "Mill Pump Tower",
    "door": {
      "x": 2635,
      "y": 633
    },
    "doorArt": {
      "x": 2635,
      "y": 600
    },
    "exterior": {
      "x": 2580,
      "y": 387,
      "width": 110,
      "height": 222
    },
    "kind": "tower",
    "district": "The paper mill district"
  },
  "mill-shed": {
    "id": "mill-shed",
    "name": "Mill Tool Shed",
    "door": {
      "x": 2604,
      "y": 886
    },
    "doorArt": {
      "x": 2604,
      "y": 853
    },
    "exterior": {
      "x": 2532,
      "y": 744,
      "width": 143,
      "height": 118
    },
    "kind": "shed",
    "district": "The paper mill district"
  },
  "observatory": {
    "id": "observatory",
    "name": "Lake Mercy Observatory",
    "door": {
      "x": 3581,
      "y": 1135
    },
    "doorArt": {
      "x": 3581,
      "y": 1102
    },
    "exterior": {
      "x": 3466,
      "y": 929,
      "width": 239,
      "height": 182
    },
    "kind": "observatory",
    "district": "Lake Mercy observatory"
  },
  "observatory-cabin": {
    "id": "observatory-cabin",
    "name": "Observatory Keeper Cabin",
    "door": {
      "x": 3349,
      "y": 1231
    },
    "doorArt": {
      "x": 3349,
      "y": 1198
    },
    "exterior": {
      "x": 3297,
      "y": 1072,
      "width": 104,
      "height": 135
    },
    "kind": "cabin",
    "district": "Lake Mercy observatory"
  },
  "relay": {
    "id": "relay",
    "name": "Mercy AM Relay",
    "door": {
      "x": 4243,
      "y": 638
    },
    "doorArt": {
      "x": 4243,
      "y": 605
    },
    "exterior": {
      "x": 4144,
      "y": 416,
      "width": 197,
      "height": 198
    },
    "kind": "relay",
    "district": "The broadcast hills"
  },
  "radio-shack": {
    "id": "radio-shack",
    "name": "Radio Technician Shack",
    "door": {
      "x": 4075,
      "y": 932
    },
    "doorArt": {
      "x": 4075,
      "y": 899
    },
    "exterior": {
      "x": 4004,
      "y": 792,
      "width": 141,
      "height": 116
    },
    "kind": "radio",
    "district": "The broadcast hills"
  },
  "chapel": {
    "id": "chapel",
    "name": "Saint Agnes Chapel",
    "door": {
      "x": 808,
      "y": 1895
    },
    "doorArt": {
      "x": 808,
      "y": 1862
    },
    "exterior": {
      "x": 663,
      "y": 1662,
      "width": 290,
      "height": 209
    },
    "kind": "chapel",
    "district": "Saint Agnes crossroads"
  },
  "chapel-shed": {
    "id": "chapel-shed",
    "name": "Chapel Garden Shed",
    "door": {
      "x": 608,
      "y": 2014
    },
    "doorArt": {
      "x": 608,
      "y": 1981
    },
    "exterior": {
      "x": 557,
      "y": 1891,
      "width": 101,
      "height": 99
    },
    "kind": "shed",
    "district": "Saint Agnes crossroads"
  },
  "orchard-house": {
    "id": "orchard-house",
    "name": "Fenn Orchard House",
    "door": {
      "x": 1195,
      "y": 2745
    },
    "doorArt": {
      "x": 1195,
      "y": 2712
    },
    "exterior": {
      "x": 1110,
      "y": 2576,
      "width": 169,
      "height": 145
    },
    "kind": "abandoned",
    "district": "The drowned orchard"
  },
  "orchard-shed": {
    "id": "orchard-shed",
    "name": "Orchard Packing Shed",
    "door": {
      "x": 1708,
      "y": 2528
    },
    "doorArt": {
      "x": 1708,
      "y": 2495
    },
    "exterior": {
      "x": 1655,
      "y": 2396,
      "width": 106,
      "height": 108
    },
    "kind": "shed",
    "district": "The drowned orchard"
  },
  "ferry-office": {
    "id": "ferry-office",
    "name": "Mercy Ferry Ticket Office",
    "door": {
      "x": 3105,
      "y": 2440
    },
    "doorArt": {
      "x": 3105,
      "y": 2407
    },
    "exterior": {
      "x": 3034,
      "y": 2294,
      "width": 142,
      "height": 122
    },
    "kind": "ferry",
    "district": "The ferry marsh"
  },
  "station": {
    "id": "station",
    "name": "Mercy County Terminal",
    "door": {
      "x": 3505,
      "y": 2731
    },
    "doorArt": {
      "x": 3505,
      "y": 2698
    },
    "exterior": {
      "x": 3212,
      "y": 2463,
      "width": 654,
      "height": 244
    },
    "kind": "station",
    "district": "Mercy County rail terminal"
  },
  "signalbox": {
    "id": "signalbox",
    "name": "Platform Signal Box",
    "door": {
      "x": 3974,
      "y": 2835
    },
    "doorArt": {
      "x": 3974,
      "y": 2802
    },
    "exterior": {
      "x": 3910,
      "y": 2657,
      "width": 128,
      "height": 154
    },
    "kind": "signalbox",
    "district": "Mercy County rail terminal"
  },
  "deputy-cabin": {
    "id": "deputy-cabin",
    "name": "County Road Office",
    "door": {
      "x": 1805,
      "y": 1331
    },
    "doorArt": {
      "x": 1805,
      "y": 1298
    },
    "exterior": {
      "x": 1711,
      "y": 1184,
      "width": 187,
      "height": 123
    },
    "kind": "deputy",
    "district": "The ferry marsh"
  },
  "railcar-1": {
    "id": "railcar-1",
    "name": "Platform Thirteen Passenger Coach",
    "door": {
      "x": 3780,
      "y": 3076
    },
    "doorArt": {
      "x": 3780,
      "y": 3039
    },
    "exterior": {
      "x": 3693,
      "y": 2981,
      "width": 174,
      "height": 70
    },
    "kind": "railcar",
    "district": "Mercy County rail terminal"
  },
  "railcar-2": {
    "id": "railcar-2",
    "name": "Platform Thirteen Sleeper Coach",
    "door": {
      "x": 3968,
      "y": 3076
    },
    "doorArt": {
      "x": 3968,
      "y": 3039
    },
    "exterior": {
      "x": 3881,
      "y": 2981,
      "width": 174,
      "height": 70
    },
    "kind": "railcar",
    "district": "Mercy County rail terminal"
  },
  "railcar-3": {
    "id": "railcar-3",
    "name": "Platform Thirteen Dining Coach",
    "door": {
      "x": 4156,
      "y": 3076
    },
    "doorArt": {
      "x": 4156,
      "y": 3039
    },
    "exterior": {
      "x": 4069,
      "y": 2981,
      "width": 174,
      "height": 70
    },
    "kind": "railcar",
    "district": "Mercy County rail terminal"
  },
  "ferry-wheelhouse": {
    "id": "ferry-wheelhouse",
    "name": "Sunken Ferry Wheelhouse",
    "door": {
      "x": 2780,
      "y": 2130
    },
    "doorArt": {
      "x": 2720,
      "y": 2099
    },
    "exterior": {
      "x": 2643,
      "y": 2096,
      "width": 68,
      "height": 73
    },
    "kind": "ferry-cabin",
    "district": "The ferry marsh"
  }
};

const furniture = (kind,x,y,width,height,extra={}) => ({kind,x,y,width,height,...extra});
const prop = (id,name,x,y,text,dreamText) => ({id,name,x,y,text,dreamText});
const room = (name,x,y,width,height,floor='wood') => ({name,x,y,width,height,floor});
const place = (feature,x,y) => ({feature,x,y});
const wall = (x,y,width,height) => ({x,y,width,height});
function interior(id,width,height,spec) {
  return createInterior({ ...BUILDINGS[id], theme:'lynch', size:{width,height}, entry:{x:width/2,y:height-108}, exit:{x:width/2,y:height-28}, ...spec });
}

export const VELVET_INTERIORS = [
  interior('diner',960,704,{
    rooms:[room('Alma’s kitchen',32,56,432,200,'tile'),room('Staff pantry',464,56,464,200),room('Booths and coffee counter',32,288,896,384,'tile')],
    walls:[wall(32,256,336,16),wall(464,256,176,16),wall(736,256,192,16)],
    furniture:[furniture('stove',64,88,96,64),furniture('sink',192,88,96,64),furniture('fridge',320,80,72,112),furniture('workbench',96,184,160,48),furniture('shelf',528,88,160,48),furniture('cabinet',768,80,112,96),furniture('table',528,176,112,48),furniture('radio',816,200,48,32),furniture('booth',64,336,128,64),furniture('table',232,344,72,48),furniture('booth',64,464,128,64),furniture('table',232,472,72,48),furniture('booth',64,592,128,48),furniture('counter',656,336,224,64),furniture('stove',784,432,96,48),furniture('jukebox',816,520,64,104),furniture('plant',864,624,32,32),furniture('rug',368,320,208,272,{solid:false})],
    placements:[place('Alma Vale',600,416),place('Lost property',752,560)],
    props:[prop('pie-book','Alma’s pie book',288,216,'A spiral notebook lists apple pies by weight, not by feeling. June has drawn a six-elbowed Teddy beside the salt measurement. Alma circled the correction rather than erasing the joke.','The recipe rearranges itself into a timetable. The salt still says more, and Alma has circled it again.'),prop('coffee-tabs','Unpaid coffee tabs',600,304,'The counter tabs include a deputy, an astronomer, and someone who signed simply BUS. Three have been crossed out as paid. Alma has put the oldest unpaid one underneath the till, where a regular customer will never be made into a spectacle.','Every tab carries your handwriting. Only the one marked BUS is paid.'),prop('staff-rota','Last staff rota',720,192,'The pantry rota has June’s requested day off in blue ink. Someone wrote coverage needed underneath. The day was found; there is no crossed-out refusal. An ordinary concession survives beside the stories about everything the town failed to do.','The names work shifts while their owners sleep. Your name is pencilled in for tomorrow, beside wash your own cup.'),prop('booth-repair','Mended booth cushion',208,432,'The vinyl has been stitched with green thread instead of matching red. A receipt for the thread is tucked below the seat. Alma repaired this booth the week the county inspector called the whole place beyond saving.','The repaired seam lets out a little warm rain. The receipt remains perfectly dry.')],
  }),
  interior('telephone',640,480,{
    rooms:[room('Operator switchboard',32,56,352,192,'tile'),room('County directory alcove',384,56,224,192),room('Waiting room',32,248,576,200,'tile')],
    furniture:[furniture('phone-switchboard',64,88,224,64),furniture('desk',416,88,144,64),furniture('shelf',416,184,144,40),furniture('bench',64,296,144,48),furniture('coat-rack',560,320,32,64),furniture('phone',64,184,64,64),furniture('painting',304,64,64,16,{solid:false})],
    placements:[place('Elsie Reed',320,208),place('Ringing telephone',192,208)],
    props:[prop('operator-labels','Handwritten cable labels',208,176,'Elsie has labelled the cables with destinations and dates. The emergency connector carries two labels: installed by Elsie Reed; tested by Silas Holt. Neither name has been scratched out, although the testing date is years older than the pencil beside it.','The labels read every place you have almost called home. The emergency line remains labelled with two actual names.'),prop('county-directory','County phone directory',480,248,'A clothbound directory has visitors’ numbers on separate cards so residents can remove them when a visit ends. June’s card is absent. The glue mark shows that absence was deliberate, rather than a page torn out during the flood.','The empty card slot rings quietly. No number appears when you listen.'),prop('waiting-bench','Numbered waiting bench',224,320,'Small brass numbers mark three places on a bench built for four. The fourth was removed to make room for a wheelchair. Elsie kept the number in the drawer rather than pretending the bench had always been this way.','The fourth place is occupied by a warm indentation. The missing number turns up in your palm, then becomes a coin-sized patch of light.')],
  }),
  interior('theater',1152,832,{
    rooms:[room('Red-curtain stage',32,56,1088,224,'carpet'),room('Dressing room and prop store',32,296,256,504),room('Auditorium',320,296,800,400,'carpet'),room('Lobby and coat check',320,696,800,104,'tile')],
    walls:[wall(32,280,320,16),wall(480,280,160,16),wall(768,280,352,16),wall(296,296,16,112),wall(296,496,16,304)],
    furniture:[furniture('curtain',64,64,1024,40,{solid:false}),furniture('piano',832,112,160,80),furniture('table',96,112,160,56),furniture('wardrobe',64,320,80,112),furniture('sofa',64,496,128,64),furniture('shelf',64,624,192,48),furniture('painting',176,320,80,24,{solid:false}),...[[384,368],[512,368],[704,368],[832,368],[960,368],[384,464],[512,464],[704,464],[832,464],[960,464],[384,560],[512,560],[704,560],[832,560],[960,560]].map(([x,y])=>furniture('chair',x,y,48,48,{color:'#b96774'})),furniture('counter',880,720,176,48),furniture('coat-rack',672,720,48,64),furniture('rug',544,304,96,400,{solid:false})],
    placements:[place('Vivian Bell',800,648),place('Red-curtain stage',576,184)],
    props:[prop('marked-blocking','June’s blocking tape',416,200,'Yellow tape marks a performer’s place. A second strip has been moved half a step left and annotated so she can see the audience. The tape remembers a practical adjustment, not a person frozen in the correct position forever.','The second strip walks a half step ahead of you. It stops when you stop looking for the first.'),prop('prop-inventory','Prop-room inventory',224,600,'A clipboard lists one false door, three real cups, and a telephone that must never be plugged in. Vivian has added a fifth column: belonged to. The most ordinary objects are the ones with the most careful names beside them.','The false door is listed as real. The three cups ask politely to remain props.'),prop('mirror-note','Dressing mirror note',224,368,'A note taped to the mirror says wash the paint off before you ask them what they thought. Beneath it, June wrote even if they liked it. The handwriting is impatient and unmistakably hers.','Your reflection has washed its face and is waiting for you to finish.'),prop('piano-service','Piano service card',1008,216,'The piano is short of two working keys. A tuner’s card says service postponed, invoice still due. Vivian kept the invoice; postponement never meant the tuner had not done the rest of the work.','The two silent keys play only when nobody presses them. Their notes sound like chairs being moved upstairs.'),prop('coat-check','Uncollected coat tickets',832,752,'The coat-check book has a page of uncollected tickets, all marked contact before disposing. One yellow coat was returned without a signature because its owner was late for a bus. The clerk wrote returned, not lost.','All the coats have left their tickets. A yellow square of warmth remains on the shelf.')],
  }),
  interior('motel-room-1',640,512,{
    name:'Mercy Motel — Reception / Room 1',rooms:[room('Reception and key desk',32,56,576,216,'tile'),room('Night clerk lounge',32,272,576,208,'carpet')],
    furniture:[furniture('counter',64,96,224,64),furniture('shelf',352,80,128,40),furniture('cabinet',528,88,48,80),furniture('sofa',64,304,144,64),furniture('table',248,288,96,48),furniture('radio',528,304,48,48),furniture('coat-rack',400,88,32,56),furniture('rug',256,352,160,112,{solid:false})],
    placements:[place('Owen Pike',352,208)],
    props:[prop('guest-register','Guest register',176,200,'The register separates check-out time from forwarding address. June signed the former and left the latter empty. Owen used a ruler to keep the blank neat. A blank is possible here without somebody filling it on her behalf.','Your check-in is dated a day you have not lived. The forwarding-address line remains empty.'),prop('spare-key-rack','Six spare-key hooks',448,160,'Six hooks hold five brass keys and a paper tag. Room 6’s hook says issued, not missing. Owen has preserved the difference through three audits and a replacement set of hooks.','Every hook carries a shadow key. The paper tag does not cast one.'),prop('night-urn','Night clerk’s coffee urn',368,312,'A timer beside the urn is taped over at midnight. Owen has written fresh water first. The old photocopied instructions tell him to leave it warming all night; he has stopped following that particular instruction.','The urn boils without a plug. It smells faintly of the last place you slept well.'),prop('motel-safety','Inspection folder',496,256,'The folder has six checked smoke detectors and one unsigned ownership field. Owen has renewed the safety checks every year without claiming the building belongs to him. Stewardship has generated a large, very dull paper trail.','The detectors detect dreams. Their test buttons say wake gently.')],
  }),
  interior('motel-room-2',640,512,{
    rooms:[room('Travel writer’s room',32,56,400,424,'carpet'),room('Washroom',448,56,160,280,'tile')],walls:[wall(432,56,16,176),wall(432,320,16,96)],
    furniture:[furniture('bed',64,96,144,160),furniture('desk',272,88,128,64),furniture('radio',352,208,48,32),furniture('cabinet',64,304,80,80),furniture('bath',480,80,96,112),furniture('sink',480,240,64,48),furniture('rug',240,272,160,96,{solid:false}),furniture('coat-rack',560,368,32,64)],
    props:[prop('unsigned-postcard','Unsent postcard',288,184,'A postcard describes Mercy Falls as a place where the waitress remembered my order. The sender crossed out unusually and left remembered. A different town’s address is written clearly; the stamp has simply never been bought.','The postcard describes this room from the other side of its window. The address is unchanged.'),prop('radio-dial','Travel radio',368,264,'Tape over the dial marks a station three counties away. The volume knob has a pencilled arrow pointing down. Whoever stayed here wanted news from home without making the room listen to all of it.','The radio reports a clear forecast for an unnamed yesterday.'),prop('shoe-brush','Mud and shoe brush',176,336,'The brush is full of pale mill dust. Beside it, two clean circles show where shoes once waited to dry. The cleaner left the circles untouched while scrubbing the surrounding carpet.','The dust falls upward into the bristles, leaving the circles where they were.')],
  }),
  interior('motel-room-3',640,512,{
    rooms:[room('Long-stay kitchenette',32,56,272,176,'tile'),room('Living and sleeping room',32,232,576,248,'carpet'),room('Washroom',448,56,160,176,'tile')],
    furniture:[furniture('stove',64,88,80,64),furniture('fridge',176,80,64,96),furniture('sink',272,88,96,64),furniture('bed',64,272,144,160),furniture('table',288,272,96,64),furniture('shelf',336,88,64,48),furniture('bath',480,80,96,112),furniture('sofa',464,288,112,64),furniture('rug',256,352,160,112,{solid:false})],
    props:[prop('monthly-rent','Rent envelopes',400,240,'A shoebox holds twelve envelopes labelled by month. One says paid half; ask on Friday. Friday’s note says paid rest. The two notes are kept together rather than allowing a late payment to become a permanent character description.','There are thirteen months. The extra one is labelled stay only if you want to.'),prop('pantry-jars','Labelled pantry jars',288,184,'The jars hold rice, buttons, and two kinds of tea. The rice has been crossed out and relabelled twice as the contents changed. The buttons retain the label useful.','The useful jar contains tiny doors. None opens until you stop shaking it.'),prop('borrowed-record','Borrowed record sleeve',416,312,'The sleeve belongs to Alma and has a note promising its return after the needle is replaced. The needle’s receipt is here too. The record is still absent, but the promise has become more specific.','The sleeve contains the sound of Alma closing the diner, followed by a long ordinary silence.')],
  }),
  interior('motel-room-4',640,512,{
    rooms:[room('Family room',32,56,400,424,'carpet'),room('Bathroom and dining nook',448,56,160,424,'tile')],walls:[wall(432,56,16,208),wall(432,352,16,64)],
    furniture:[furniture('bed',64,96,112,144),furniture('bed',240,96,112,144,{color:'#b4b6a0'}),furniture('shelf',64,288,128,48),furniture('table',464,336,112,64),furniture('bath',480,80,96,112),furniture('sink',480,240,64,48),furniture('rug',240,304,160,112,{solid:false})],
    placements:[place('The unclaimed suitcase',352,288)],
    props:[prop('toy-train','Wooden toy train',160,368,'A toy train has paper destinations tucked under its wheels. They include HOME, GRANDMA, and SOMEWHERE WE CAN STAY TWO NIGHTS. A parent has drawn extra windows instead of correcting the timetable.','The train reaches its destinations without leaving the shelf. The extra windows have warm lights.'),prop('height-marks','Pencilled height marks',400,120,'Three height marks run up the wall beside the beds. A later hand wrote measured in shoes beside the tallest. The cleaner kept the pencil marks and painted around them, leaving an inconvenient but honest patch of old wall.','The middle mark is your height as a child. It does not move when you stand straighter.'),prop('family-cups','Four mismatched cups',576,304,'There are four cups and three chairs. The fourth person preferred breakfast in bed, according to a cheerful complaint taped beneath the table. The note gives everybody a first name and nobody a reason for being here.','The fourth cup is full of sunlight. The others are clean and dry.')],
  }),
  interior('motel-room-5',640,512,{
    rooms:[room('Closed room',32,56,400,424,'carpet'),room('Washroom',448,56,160,280,'tile')],walls:[wall(432,56,16,176),wall(432,320,16,96)],
    furniture:[furniture('bed',256,96,144,160,{color:'#c8c5b5'}),furniture('sofa',64,280,144,64,{color:'#c8c5b5'}),furniture('wardrobe',64,96,80,112),furniture('cabinet',336,288,64,64),furniture('bath',480,80,96,112),furniture('sink',480,240,64,48),furniture('rug',256,352,160,112,{solid:false}),furniture('painting',176,64,64,24,{solid:false})],
    props:[prop('closed-room','Room closure tag',176,144,'The tag reads leak in west wall; use other rooms. Someone added not haunted after three visitors refused the cleaner’s explanation. A plumber’s appointment is pencilled below, twice postponed and still needed.','The leak runs sideways. The plumber’s appointment remains next Thursday.'),prop('covered-sofa','Dust-sheet crease',224,304,'A sheet covers the sofa except for one arm, where somebody sat while waiting for the paint to dry. The crease has not been smoothed out. Even an empty room has had work done in it.','The crease becomes a handprint when you blink, then quietly returns to a crease.'),prop('replacement-wallpaper','Wallpaper sample book',416,304,'Five samples are clipped to the cabinet. Owen has crossed out the one that disguises damp stains most effectively. Choosing a pattern has turned into choosing what he can continue noticing.','All five samples show rain. The crossed-out one is entirely dry.')],
  }),
  interior('motel-room-6',640,512,{
    rooms:[room('June’s room',32,56,400,424,'carpet'),room('Bath and quiet alcove',448,56,160,424,'tile')],walls:[wall(432,56,16,160),wall(432,304,16,112)],
    furniture:[furniture('curtain',64,64,336,32,{solid:false}),furniture('bed',64,104,144,160),furniture('chair',256,112,48,64,{color:'#a86573'}),furniture('chair',352,112,48,64,{color:'#a86573'}),furniture('console',256,240,144,48),furniture('coat-rack',64,320,48,80,{color:'#e5ba6c'}),furniture('desk',480,336,96,64),furniture('bath',480,80,96,112),furniture('sink',480,240,64,48),furniture('rug',208,320,208,112,{solid:false})],
    props:[prop('yellow-coat','June’s yellow coat',128,344,'A yellow coat hangs here, carefully brushed. The pocket holds a bus-transfer stub and a grocery list, not a farewell. Owen’s storage tag asks the owner to collect it when convenient; the tag claims neither a return date nor a death.','The coat is warm. In its pocket, June’s list now says bread, apples, a place with a window. The coat does not become a person because you stand close to it.'),prop('two-chairs','Two waiting chairs',320,208,'Two chairs face a television with no aerial. One seat has been repaired with a square of denim. A note under the other reads please don’t move them; the cleaner added please pay me if I have to clean around them.','One chair is occupied by the outline of a conversation you almost had. The denim square is more solid than the rest.'),prop('quiet-television','Unplugged television',320,312,'The television’s plug is tied to its handle. Nobody has mistaken it for broken equipment; it was deliberately disconnected. The screen reflects the doorway and your own small, moving figure.','The screen shows a woman in a yellow coat walking out of a room. She walks at an ordinary speed. You cannot see where she goes.'),prop('bathroom-note','Note to the next guest',576,416,'On the desk, June wrote the hot tap takes a minute; be patient, it works. The advice is practical and generous. Below it, a guest has written thank you in an entirely different hand.','The hot tap runs tomorrow’s water. The second handwriting says thank you again.')],
  }),
  interior('laundry',768,576,{
    rooms:[room('Wash and dry',32,56,704,248,'tile'),room('Folding room',32,304,416,240,'tile'),room('Utility bay',448,304,288,240,'concrete')],
    walls:[wall(448,320,16,96),wall(448,496,16,48)],
    furniture:[...[[64,96],[192,96],[320,96],[448,96],[576,96]].map(([x,y])=>furniture('machine',x,y,80,80,{variant:'washer'})),furniture('machine',576,224,96,80,{variant:'dryer'}),furniture('counter',64,336,240,64),furniture('bench',64,464,144,40),furniture('cabinet',544,368,64,112),furniture('workbench',496,320,176,40),furniture('radio',320,224,48,40),furniture('rug',320,336,96,176,{solid:false})],
    props:[prop('laundry-ledger','Repair and refund ledger',416,224,'The ledger records every failed cycle and every refunded coin. A red line marks the day the owner stopped describing refunds as goodwill. A machine taking payment without washing is a fault, and the book has learned to call it one.','Each refunded coin has been folded into a tiny clean shirt.'),prop('linen-tags','Linen ownership tags',240,416,'The folded towels have motel numbers stitched into them. A basket of chapel blankets carries first names instead. Dr. Iris has written return clean if possible, return anyway if not. The cleaner underlined anyway.','The names lift from the blankets as warm breath, then settle back into the stitching.'),prop('dryer-note','Dryer warning',704,336,'The dryer has a note telling users to check pockets themselves. Below it is a small jar of rescued buttons, tickets, and coins, with a second note: check this too. Responsibility has not been used to excuse keeping somebody’s change.','The jar holds weather from five different pockets. One ticket is still damp with an ordinary Thursday.')],
  }),
  interior('cabin-west',768,576,{
    rooms:[room('Fishing kitchen',32,56,320,240,'tile'),room('Bedroom',384,56,352,240),room('Family sitting room',32,320,704,224)],
    walls:[wall(352,56,16,144),wall(352,272,16,24)],
    furniture:[furniture('stove',64,88,80,64),furniture('sink',192,88,96,64),furniture('table',96,208,160,64),furniture('bed',512,96,160,160),furniture('wardrobe',400,88,64,128),furniture('sofa',64,368,176,64),furniture('shelf',96,472,160,40),furniture('weapon-rack',576,336,112,64,{variant:'fishing'}),furniture('rug',304,320,208,160,{solid:false})],
    props:[prop('fishing-weather','Fishing weather calendar',288,184,'A calendar tracks water level, wind, and days the fish were left alone. The quietest week has no explanation attached. Someone living here understood that a record of not doing something need not become an accusation.','Every forecast is for low tide in a river that has none.'),prop('family-photo','Cabin family photograph',448,240,'The family photograph includes a dog staring away from the camera. Its name is written as carefully as the people’s names. A pencilled arrow explains that the youngest person took the photograph and is therefore not missing from the family.','The dog turns to look at you. Nobody else has been required to pose again.'),prop('mended-net','Patched fishing net',560,416,'A net on the rack has three repairs, each in a different colour. A small note records who helped tie each knot. Borrowed time and borrowed skill have both been counted as things worth remembering.','The net holds stars too small to name. The repaired knots hold more securely than the original cord.')],
  }),
  interior('cabin-east',768,576,{
    rooms:[room('Surveyor’s writing room',32,56,416,240),room('Sleeping alcove',480,56,256,240,'carpet'),room('Kitchen and listening nook',32,320,704,224,'tile')],
    walls:[wall(448,56,16,128),wall(448,272,16,24)],
    furniture:[furniture('desk',64,88,176,64),furniture('file-cabinet',304,88,80,112),furniture('bookshelf',64,208,240,48),furniture('bed',528,96,144,160),furniture('stove',64,352,80,64),furniture('sink',192,352,96,64),furniture('table',528,352,128,64),furniture('radio',576,464,48,40),furniture('rug',320,320,144,160,{solid:false})],
    props:[prop('survey-boundary','Corrected survey map',256,184,'The survey map shows an older path beneath the county road. One owner’s name was entered in the wrong parcel; the correction leaves the error readable. The map establishes where the path ran without pretending the mapmaker never got lost.','The older path leads to the desk you are already beside. Its error remains readable.'),prop('unfinished-page','Unfinished account',336,264,'A page begins the place would have been peaceful if. The rest is blank. A note in the margin says finish the sentence or admit you don’t know. The writer has put the page beside a shopping list and gone out.','The sentence finishes itself differently every time you look. The shopping list is stable.'),prop('listening-log','Listening log',656,480,'A radio log names weather stations and ordinary songs. After a week of emergency broadcasts, the keeper wrote heard somebody laughing. The line has no frequency or time, as though a little relief deserved an entry without proving where it came from.','The log says heard somebody listening. A faint laugh comes from the kitchen sink.')],
  }),
  interior('mill',1152,832,{
    rooms:[room('Pulp and press hall',32,56,704,456,'concrete'),room('Payroll and records office',768,56,352,280,'tile'),room('Foreman’s break room',768,368,352,320),room('Locker corridor',32,544,704,256,'concrete')],
    walls:[wall(736,56,16,144),wall(736,280,16,176),wall(736,544,16,144),wall(768,336,128,16),wall(976,336,144,16),wall(32,512,192,16),wall(352,512,192,16),wall(672,512,64,16)],
    furniture:[furniture('machine',64,96,160,144,{variant:'pulp-vat'}),furniture('machine',288,96,160,144,{variant:'pulp-vat'}),furniture('machine',512,96,160,144,{variant:'press'}),furniture('machine',128,336,160,96,{variant:'press'}),furniture('workbench',416,344,240,64),furniture('desk',800,88,192,64),furniture('file-cabinet',1040,88,48,144),furniture('bookshelf',816,240,224,48),furniture('table',816,400,160,64),furniture('stove',1008,432,80,48),furniture('sofa',800,568,160,56),furniture('locker',64,576,112,96),furniture('locker',240,576,112,96),furniture('locker',64,720,112,48),furniture('barrel',656,688,48,64),furniture('rug',800,496,240,48,{solid:false})],
    placements:[place('Hester Wren',880,184),place('Abandoned paper mill',992,208),place("Mill foreman's locker",192,704)],
    props:[prop('press-shutdown','Press shutdown chart',640,280,'The press chart records shutdown times to the minute. Flood warnings appear before the final stop, with a supervisor’s request to keep the line running attached. The operator’s note says stopped anyway. The saved machinery was not the only thing at stake.','The final minute lasts as long as you listen. The operator’s note still says stopped anyway.'),prop('payroll-deduction','Uniform deduction ledger',944,304,'The office ledger includes crossed-out uniform deductions and Hester’s initials. A margin note says cloth can be returned; hours cannot. The sums have been corrected using arithmetic rather than asking workers to accept an apology as wages.','The sums add up to days instead of money. Hester’s initials keep bringing them back.'),prop('breakroom-cups','Workers’ named cups',1008,520,'The cups carry names, shift colours, and repairs. One has no handle and is used for pencils. The notice above them asks new staff to choose their own colour instead of being given the departed worker’s cup.','The cups are full of the sounds their owners made when arriving tired. The pencil cup stays silent.'),prop('blank-shift','Unfinished production reel',320,384,'The last paper reel contains a broad unprinted strip. A quality note says start again from here. After the shutdown, nobody tore the blank section away to make the surviving reel appear finished.','The blank strip carries a tiny, moving forest. It ends where the unprinted paper ends.'),prop('locker-pins','Locker assignment board',416,624,'Locker numbers and staff names are held with removable pins. June’s name is pinned to an envelope marked property returned. The board records an end to employment, without claiming an end to the employee.','The pins hum like insects. June’s envelope is still closed and marked returned.')],
  }),
  interior('mill-tower',640,640,{
    rooms:[room('Pump chamber',32,56,576,264,'concrete'),room('Maintenance landing',32,320,576,288,'stone')],
    furniture:[furniture('machine',64,96,160,144,{variant:'pump'}),furniture('machine',384,96,144,144,{variant:'pump'}),furniture('console',256,80,80,64),furniture('workbench',64,384,192,64),furniture('shelf',416,368,144,48),furniture('barrel',480,464,48,64),furniture('bench',64,528,128,40),furniture('rug',288,160,48,336,{solid:false})],
    props:[prop('tower-levels','Water-level gauges',320,192,'A gauge has two red marks: machinery limit and evacuate people. The second sits much lower. Somebody has scratched a warning beside the machinery mark: if you wait for this one, you have already waited too long.','A third mark appears, labelled enough remembering for tonight. It is lower than either of the others.'),prop('pump-log','Pump handover log',256,472,'The handover book names the person taking each shift. During the flood, three shifts were covered by the same pair of initials. The entry after them says sent home to sleep, replacement trained. Exhaustion has not been preserved as an admirable operating procedure.','The book asks you to sign off, not sign on. The pen is warm from another hand.'),prop('tower-valve','Replaced valve wheel',416,512,'A removed valve wheel rests beside its newer replacement’s crate. The old one was repaired twice before replacement. The maintenance note distinguishes kept working from safe; the first was never enough to promise the second.','The old wheel turns without moving anything. The new crate is full of dry air.')],
  }),
  interior('mill-shed',640,480,{
    rooms:[room('Tools and paper reels',32,56,576,392,'concrete')],
    furniture:[furniture('workbench',64,96,192,64),furniture('weapon-rack',352,88,192,64,{variant:'tools'}),furniture('crate',64,240,96,80),furniture('barrel',192,256,64,80),furniture('machine',448,224,96,96,{variant:'paper-reel'}),furniture('shelf',448,352,96,40),furniture('rug',288,176,96,224,{solid:false})],
    props:[prop('tool-loans','Tool loan board',304,192,'The loan board lists two borrowed spanners and a returned saw. The borrower of the larger spanner has moved away; Hester has written write once, then replace it. A small tool will not become a lifetime reason to keep calling.','Both spanners hang from the board as painted shadows. The saw has returned a second time.'),prop('paper-offcuts','Paper offcut crate',176,288,'The crate is labelled take for school; no receipt needed. The top sheets show a child’s arithmetic on one side and a failed company letterhead on the other. Neither use requires the paper to forget the first one.','The arithmetic is correct. The letterhead names a company that manufactures afternoons.'),prop('maintenance-shed','Shed repair list',416,376,'The repair list begins with fix roof above spare paper. Fix roof above worker follows in another hand and has been moved to the first line. Both repairs are ticked, on different dates.','Rain falls only over the ticked boxes, then stops politely at the edge of the clipboard.')],
  }),
  interior('observatory',960,704,{
    rooms:[room('Telescope platform',32,56,576,328,'stone'),room('Calculation room',640,56,288,328,'tile'),room('Atlas library and kettle',32,416,896,256)],
    walls:[wall(608,56,16,176),wall(608,320,16,64),wall(32,384,256,16),wall(384,384,128,16),wall(608,384,320,16)],
    furniture:[furniture('telescope',192,112,256,144),furniture('console',64,280,144,64),furniture('desk',672,96,176,64),furniture('cabinet',800,240,96,80),furniture('bookshelf',64,448,208,48),furniture('bookshelf',64,568,208,48),furniture('table',640,448,144,64),furniture('stove',832,448,64,64),furniture('desk',320,448,224,64),furniture('plant',864,592,32,48),furniture('rug',304,544,288,64,{solid:false})],
    placements:[place('Arthur Latch',560,280),place('Lakeside observatory',416,552)],
    props:[prop('instrument-notebook','Instrument notebook',256,304,'Arthur’s notebook separates observation from explanation with two columns. Boats and aircraft have measurements. The lights moving backward are listed as unresolved, beside an irritated underlined sentence: unresolved is a result.','The two columns move farther apart. Unresolved remains a result in both.'),prop('telescope-service','Telescope calibration card',480,192,'The calibration card records a fault in the tracking motor. Arthur drew stars beside the fault for three nights before admitting the motor needed a new bearing. The replacement part’s number is less exciting and more useful.','The faulty stars are in the card now, revolving around the part number.'),prop('atlas-bookmarks','Borrowed atlas bookmarks',288,480,'Bookmarks name borrowers rather than places. One says June — return when finished. Arthur has added ask before visiting, in larger letters than any country name. The page chosen for her draft letter stays unnumbered.','The atlas contains one small room with a window. There is no street map to it.'),prop('kettle-timetable','Kettle and bus timetable',800,552,'The timetable under the kettle is stained at the connection Arthur helped June make. The fare is pencilled in and marked repaid. Somebody made a practical route possible without becoming the owner of the destination.','The connections arrive in reverse order. The fare remains repaid.')],
  }),
  interior('observatory-cabin',640,512,{
    rooms:[room('Keeper’s sleeping room',32,56,272,232,'carpet'),room('Charts and kitchenette',304,56,304,232),room('Supply room',32,288,576,192,'tile')],
    furniture:[furniture('bed',64,88,144,160),furniture('bookshelf',352,88,160,48),furniture('stove',352,184,64,64),furniture('sink',480,184,80,64),furniture('shelf',64,336,128,48),furniture('desk',464,336,112,64),furniture('rug',224,288,192,144,{solid:false})],
    placements:[place('Observatory supply case',160,424)],
    props:[prop('keeper-shifts','Night keeper’s rota',288,152,'The rota gives observing time and sleeping time equal-sized boxes. Arthur has written do not ring before noon unless water is inside. The keeper’s initials appear beside every properly observed night off.','Tonight’s observing box is filled with sleeping stars. The night-off initials remain human.'),prop('cabin-soup','Soup instructions',432,280,'The kitchenette instructions say heat gently, stir, eat while hot. Beneath them, an older note from a former keeper says these are instructions for soup, Arthur. He kept the note instead of replacing it with something more flattering.','The soup asks for patience in a voice like a saucepan. The older note is still perfectly applicable.'),prop('chart-rolls','Rolled lake charts',400,160,'The charts mark ordinary moorings alongside the places people report lights. A small legend distinguishes seen, reported, and guessed. None of the guessed marks has been allowed to borrow a witness’s name.','The guessed marks swim away. The moorings stay where boats can actually tie up.')],
  }),
  interior('relay',896,640,{
    rooms:[room('Transmission hall',32,56,512,312,'concrete'),room('Tape archive',576,56,288,312),room('Cable maintenance bay',32,400,832,208,'concrete')],
    walls:[wall(544,56,16,128),wall(544,272,16,96),wall(32,368,256,16),wall(384,368,480,16)],
    furniture:[furniture('console',64,96,176,80),furniture('console',320,96,160,80),furniture('machine',64,240,112,80,{variant:'reel-recorder'}),furniture('radio',336,248,112,64),furniture('bookshelf',608,88,192,48),furniture('cabinet',736,208,80,112),furniture('workbench',96,432,224,64),furniture('crate',640,464,112,80),furniture('shelf',416,432,160,48),furniture('rug',320,512,224,64,{solid:false})],
    placements:[place('Dead-air relay',256,232)],
    props:[prop('relay-test','Relay fault-test cards',256,192,'Silas’s test cards repeat the same result under three different loads. He tried to make the missing speech into a mechanical fault and preserved the tests that refused to agree. The work is careful even where the wish behind it was convenient.','The cards diagnose a missing future. The actual fault results remain written underneath.'),prop('archive-copy','Archived emergency reel',656,184,'A reel marked flood channel original sits beside a blank duplicate box. The instructions say copy before editing. Elsie has initialled that line; Silas has initialled the line asking who authorised the edit. Both lines survive.','The original reel contains rain moving through a corridor. The duplicate box contains the same rain, heard from outside.'),prop('splice-bench','Connector sorting tray',336,456,'Connectors are sorted by size in an old cake tin. One compartment has a paper label: Elsie’s, ask first. Silas has replaced the possessive with fitted by Elsie without hiding the earlier words.','The tin smells of icing. Each connector carries a tiny ring like a telephone that nobody has yet answered.'),prop('channel-signoff','Closing transmission sheet',592,536,'The closing sheet records weather, river height, and a human sign-off at the end. The handwritten instruction says silence after this line is intentional. Silence no longer has to be reported as a fault every time it happens.','The sign-off appears before the voice says it. The following silence waits for you respectfully.')],
  }),
  interior('radio-shack',768,576,{
    rooms:[room('Radio repair workshop',32,56,400,296,'concrete'),room('Microphone booth',464,56,272,232,'carpet'),room('Technician’s cot and tea',32,384,704,160)],
    walls:[wall(432,56,16,128),wall(432,272,16,80)],
    furniture:[furniture('workbench',64,96,224,64),furniture('shelf',64,240,144,48),furniture('radio',304,112,80,64),furniture('console',496,88,176,64),furniture('chair',544,192,48,64),furniture('bed',64,400,144,112),furniture('stove',560,400,64,64),furniture('table',464,488,160,40),furniture('cabinet',288,240,96,80),furniture('rug',304,384,112,128,{solid:false})],
    placements:[place('Silas Holt',320,208)],
    props:[prop('valve-labels','Spare valve labels',224,272,'Every glass valve has a date tested and a note of which set it fits. The shelf’s oldest label says works when warmed; underneath, Silas wrote unreliable, keep as sample. Hope has been removed from the spare-parts specification.','The valves glow with the colours of voices. The unreliable sample remains a sample.'),prop('booth-microphone','Muted microphone',640,208,'The microphone switch is firmly off. A card asks visitors whether they consent to being recorded before showing them how to turn it on. Silas taped the question directly over the exciting-looking red button.','The microphone records the question you decided not to ask. The consent card tells it to erase the take.'),prop('separate-kettle','A kettle on its own plug',656,432,'A newer kettle has a dedicated outlet, safely away from the transmitter exhaust. The receipt names Elsie as purchaser and Silas as owing one decent pot of tea. He has circled decent, an unusually achievable engineering target.','The kettle boils only when somebody intends to share the tea. It has no objection to awkward company.')],
  }),
  interior('chapel',960,768,{
    rooms:[room('Chapel nave',32,56,576,648,'stone'),room('Vestry and flood clinic',640,56,288,648,'tile')],
    walls:[wall(608,56,16,208),wall(608,352,16,144),wall(608,584,16,120)],
    furniture:[furniture('altar',224,96,192,96),furniture('piano',64,96,112,96),furniture('pew',64,272,176,48),furniture('pew',368,272,176,48),furniture('pew',64,368,176,48),furniture('pew',368,368,176,48),furniture('pew',64,464,176,48),furniture('pew',368,464,176,48),furniture('cabinet',672,88,80,112),furniture('medical-bed',784,88,112,176),furniture('desk',672,368,128,64),furniture('shelf',784,480,112,48),furniture('basin',672,576,64,48),furniture('bench',64,624,176,40),furniture('rug',272,224,64,416,{solid:false})],
    entry:{x:480,y:660},exit:{x:480,y:740},
    placements:[place('Dr. Iris Moss',720,280),place('Roadside chapel',304,224),place('The chapel donation box',560,624)],
    props:[prop('two-lists','Iris’s two memorial lists',832,440,'Two lists share a clipboard: confirmed deaths and departures requiring consent to name. Iris has left room beneath each heading. The forms are less compact than the engraved memorial and can still be corrected by a living person.','The letters briefly turn into people walking out of separate doors. Neither list follows them.'),prop('clinic-sewing','Blanket repair basket',736,552,'The repair basket includes bright thread and a note asking not to make every mend invisible. A patient requested a blanket they could recognise later. Iris stitched a small blue square into the corner.','The blue square contains a clear patch of sky. It remains small enough to fold.'),prop('organ-stops','Chapel organ repair note',192,192,'The organ’s repair note lists stuck keys, a leaking bellows, and one stop the parish cannot afford to restore yet. Services continue with the working notes. The organ is no more whole for anybody pretending not to hear the missing one.','A missing note sounds from the pew behind you. It does not ask to be included in the service.'),prop('donation-use','Donation spending book',560,688,'The spending book names soap, blankets, and medicine before flowers. A visitor’s complaint about the bare altar is clipped beside the receipt for antibiotics. Iris has answered politely, with actual prices.','The flowers in the complaint bloom on the paper. The medicine receipt remains legible.')],
  }),
  interior('chapel-shed',576,448,{
    rooms:[room('Potting and garden tools',32,56,512,360,'dirt')],
    furniture:[furniture('workbench',64,88,192,64),furniture('weapon-rack',352,88,160,64,{variant:'tools'}),furniture('crate',64,240,96,64),furniture('shelf',400,240,96,80),furniture('plant',176,248,48,64),furniture('barrel',64,336,48,48),furniture('rug',256,176,64,208,{solid:false})],
    props:[prop('seed-box','Seeds for the next spring',256,240,'The seed box is labelled with planting months and who will water during clinic hours. Someone wrote do not plant in memory of anybody without asking. The flowers have been allowed the modest job of growing well.','The seeds make a faint ticking sound. Their months stay in the proper order.'),prop('garden-spade','Short-handled garden spade',352,184,'One spade has a shortened handle and a painted blue grip. A note says made for Ada’s wrist, do not lend without asking Ada. Accessibility has a name and an owner here, rather than being everybody’s spare tool.','The blue grip feels like a cool window ledge. The note remains addressed to Ada.'),prop('flower-buckets','Labelled flower buckets',400,352,'The buckets list the beds the flowers came from, so a replacement can be planted in the same soil. One empty bucket says left on the plant; looked happier there. The gardener has not hidden the decision among the harvest figures.','The empty bucket contains the smell of the plant left alone.')],
  }),
  interior('orchard-house',896,640,{
    rooms:[room('Fenn family kitchen',32,56,416,248,'tile'),room('Bedroom and albums',480,56,384,248,'carpet'),room('Birthday dining room',32,336,832,272)],
    walls:[wall(448,56,16,144),wall(448,280,16,24),wall(32,304,224,16),wall(384,304,480,16)],
    furniture:[furniture('stove',64,88,80,64),furniture('sink',192,88,96,64),furniture('fridge',352,80,64,112),furniture('counter',64,224,240,48),furniture('bed',624,96,160,160),furniture('bookshelf',512,88,64,80),furniture('shelf',512,240,64,48),furniture('table',128,384,192,96),furniture('chair',64,400,48,64),furniture('chair',352,400,48,64),furniture('sofa',640,432,160,64),furniture('painting',64,64,160,16,{solid:false}),furniture('rug',416,368,176,208,{solid:false})],
    props:[prop('birthday-streamers','Saved birthday streamers',320,352,'Paper streamers are folded rather than left hanging. A label says use again; Teddy hates waste but likes birthdays. June’s drawing of six elbows is pinned beneath the label, a joke saved in the place where it was enjoyed.','The streamers unfold into a long, quiet afternoon. The six elbows wave from the drawing.'),prop('flood-marks','Measured flood line',560,328,'A blue pencil line marks the highest water beside an older child’s height mark. The dates identify which is which. Teddy has resisted painting over either, without claiming the two measurements mean the same thing.','The water line lowers when you stop counting it. The height mark stays fixed.'),prop('family-album','Ordinary family album',592,208,'The album contains meals, badly framed trees, and a photo of June asleep during a speech. The caption says bored, not peaceful. Somebody cared enough about the real moment to leave its less flattering description intact.','The speech continues faintly from the photograph. June is still bored.'),prop('pantry-birthday','Cake pantry list',320,256,'The pantry list has ingredients for three cakes and one sandwich. The sandwich is labelled emergency cake, and the icing sugar is crossed out. It records a birthday that went wrong in a way people could still enjoy.','The emergency cake has six candles and no hidden message. It smells of ordinary bread.')],
  }),
  interior('orchard-shed',640,480,{
    rooms:[room('Fruit packing and irrigation',32,56,576,392,'concrete')],
    furniture:[furniture('workbench',64,96,224,64),furniture('crate',64,224,112,80),furniture('crate',64,336,112,64),furniture('shelf',416,88,144,48),furniture('console',448,240,96,64),furniture('weapon-rack',224,256,64,80,{variant:'ladder'}),furniture('barrel',480,352,48,64),furniture('rug',320,176,80,240,{solid:false})],
    props:[prop('sorting-sizes','Fruit sorting gauge',304,192,'A wooden gauge separates apples by size. The small-fruit bin is labelled cooks just as well. Teddy has left the grading rules visible while refusing to let the less valuable grade become the useless one.','The gauge measures memories by weight. The smallest ones still cook just as well.'),prop('jar-dates','Preserve jar dates',400,152,'The jars carry harvest dates and opening instructions. One old label says birthday batch, taste before promising. The lid beneath it is still sealed; the date is readable enough to make caution a practical decision.','The birthday batch is warm from a summer that has not happened. The opening instructions advise waiting anyway.'),prop('irrigation-note','Irrigation shutoff notice',560,272,'The shutoff notice records that the system was closed before the flood arrived. It did not stop the river. Somebody wrote neither negligence nor magic beneath the inspection number, then left the system diagram attached.','The diagram grows blue branches. The shutoff valve remains closed.')],
  }),
  interior('ferry-office',768,576,{
    rooms:[room('Ticket window and charts',32,56,400,280),room('Operator’s rope and tea room',464,56,272,280,'tile'),room('Passenger waiting room',32,368,704,176)],
    walls:[wall(432,56,16,144),wall(432,288,16,48)],
    furniture:[furniture('counter',64,96,240,64),furniture('desk',64,240,208,64),furniture('cabinet',496,88,80,112),furniture('workbench',496,240,192,48),furniture('stove',640,88,64,64),furniture('bench',64,416,192,48),furniture('bench',512,416,176,48),furniture('shelf',304,96,96,48),furniture('rug',288,368,160,144,{solid:false})],
    placements:[place('Nell Ash',352,232),place("Ferry operator's trunk",592,512)],
    props:[prop('return-fares','Retired return-ticket stamp',320,176,'The ticket stamp has been wrapped with a note: no longer issued. Nell kept it as equipment from a service that ended, not as a promise to get every passenger back. The final fare sheet balances in full.','The stamp prints only one word: ask. It no longer decides whether a return is wanted.'),prop('rope-practice','Rope practice board',608,336,'Five knots are pinned to a board with working names and load limits. One is labelled took twelve years because Nell practised it while avoiding questions. She has added finished beneath it, a smaller and more recent claim.','The finished knot ties itself once, then rests. The other four remain honest examples.'),prop('ferry-chart','Changed-current chart',288,280,'The chart marks the current’s new channel and the old ferry route. A large note says safe footbridge upstream. Nell has provided directions without asking the new crossing to be romantic enough to replace the old one.','The footbridge line shines gently. The old route remains ink.'),prop('birthday-card','Private birthday envelope',480,176,'A birthday envelope lies face down under a paperweight. Nell has not asked anybody to read it, and the office provides no public reason to do so. The neighbouring timetable is open, complete, and useful.','The envelope is still face down. The room has no intention of turning it over for you.')],
  }),
  interior('station',1152,832,{
    rooms:[room('Ticket hall',32,56,704,280,'tile'),room('Dispatcher’s office',768,56,352,280),room('Waiting lounge',32,368,704,280,'tile'),room('Luggage room',768,368,352,280,'concrete'),room('Platform café',32,680,1088,120)],
    walls:[wall(736,56,16,152),wall(736,288,16,48),wall(32,336,224,16),wall(352,336,192,16),wall(640,336,96,16),wall(768,336,128,16),wall(976,336,144,16),wall(736,368,16,128),wall(736,584,16,64)],
    furniture:[furniture('counter',64,96,272,64),furniture('console',416,96,112,80),furniture('shelf',608,88,96,48),furniture('desk',800,88,192,64),furniture('file-cabinet',1040,88,48,128),furniture('radio',816,240,64,48),furniture('bench',64,400,192,48),furniture('bench',64,512,192,48),furniture('bench',400,400,224,48),furniture('bench',400,512,224,48),furniture('crate',800,400,112,96),furniture('crate',976,400,112,80),furniture('shelf',832,560,208,48),furniture('counter',800,712,256,48),furniture('table',64,712,128,48),furniture('table',256,712,128,48),furniture('plant',672,736,32,48),furniture('rug',272,368,80,280,{solid:false})],
    placements:[place('Mara Voss',432,248),place('Station lost luggage',976,536)],
    props:[prop('terminal-board','Terminal departure board',576,184,'The board lists the last regular services and the bus connections that replaced them. Mara has erased CLOSED FOREVER and written no trains currently. The difference is not optimism; it prevents a fact about today from pretending to govern every later day.','The board lists places where you have slept through an arrival. The bus connections are still useful.'),prop('ticket-window','Mara’s ticket-window notes',256,200,'The notes list fares, concessions, and an instruction to let a person finish asking before guessing the destination. Beneath it, Mara has written ask them what they need, not why they deserve it. The till drawer contains no visitor’s secret route.','The window looks into another ticket hall. The clerk there waits for you to finish asking.'),prop('dispatcher-record','Dispatcher’s water-damage log',992,248,'The log records which papers Mara dried and where each was later stored. Departure receipts went to the signal box because its cupboard stayed above water. June’s destination is covered on the copy as well as the original.','The water-damaged pages are dry. The cupboard’s shadow contains a small, audible train.'),prop('fresh-biscuits','Café biscuit tin',720,752,'The tin contains fresh biscuits with the shop receipt folded beneath them. Mara wrote nothing symbolic on a sticky label. She has refilled the tin several times, preserving the joke while replacing the biscuits.','The biscuits remain fresh. The label says please just eat one.'),prop('luggage-labels','Unclaimed luggage procedure',912,640,'The luggage-room procedure says contact owner, wait, contact again, ask before donation. Nobody is to be treated as missing because they failed to want an old suitcase. The first paragraph distinguishes possessions from passengers.','The labels have destinations but no owners. The first paragraph keeps the same distinction.')],
  }),
  interior('signalbox',768,576,{
    rooms:[room('Platform thirteen signal controls',32,56,704,264,'concrete'),room('Receipt cupboard and stove',32,352,704,192)],
    furniture:[furniture('console',64,96,256,80,{variant:'signal-levers'}),furniture('desk',464,88,208,64),furniture('file-cabinet',576,224,96,80),furniture('radio',368,96,64,48),furniture('cabinet',64,400,112,96),furniture('stove',576,400,80,64),furniture('bench',208,432,96,48),furniture('rug',320,352,144,160,{solid:false})],
    placements:[place('Platform thirteen',224,368)],
    props:[prop('signal-diagram','Signal-route diagram',352,224,'The diagram shows three tracks and a platform numbered thirteen because the county had already printed the forms. An amendment request was refused as unnecessary expense. The diagram records what the railway actually built, despite the form’s imaginary twelve predecessors.','Thirteen tracks appear, but only the three drawn in ordinary ink can carry anything.'),prop('receipt-sleeves','Waterproof receipt sleeves',192,432,'The cupboard holds receipts in new sleeves labelled by date. Mara added destination withheld by request to one index entry. The index can direct you to proof of a journey without turning the traveller’s request into an obstacle to remove.','The sleeve holds the sound of paper bought with earned money. Its covered destination stays covered.'),prop('lever-safety','Signal lever lock',336,144,'A lock bar stops the retired levers moving. The attached note says disconnected from live track, keep locked anyway. The physical habit is being preserved for visitors who may one day work on equipment that still matters.','The levers move their reflections. The lock keeps their actual handles still.'),prop('stove-hours','Stove attendance card',688,432,'A card above the stove lists the hours somebody is present and the hours it must be out. Mara has signed every inspection after the terminal closed. A building becoming quiet has not made its fire everybody else’s problem.','The signed hours glow softly. The empty hours are dark.')],
  }),
  interior('deputy-cabin',896,640,{
    rooms:[room('County records desk',32,56,512,280,'tile'),room('Interview room',576,56,288,280),room('Patrol and evidence room',32,368,832,240,'concrete')],
    walls:[wall(544,56,16,128),wall(544,272,16,64),wall(32,336,224,16),wall(352,336,512,16)],
    furniture:[furniture('desk',64,96,240,64),furniture('file-cabinet',400,80,80,128),furniture('radio',336,96,48,48),furniture('table',608,96,160,64),furniture('chair',608,208,48,64),furniture('chair',720,208,48,64),furniture('shelf',64,416,192,48),furniture('cabinet',656,416,96,112),furniture('workbench',480,400,112,64),furniture('rug',320,384,96,208,{solid:false})],
    placements:[place('Deputy Inez',304,240)],
    props:[prop('report-categories','Corrected report categories',320,184,'Inez has put three new headings on a folder: confirmed, reported, unresolved. The older LOST heading is still visible underneath. The first correction was made thirteen years late and includes the date it should have been made.','The headings cast different shadows. Unresolved is not trying to look like confirmed.'),prop('interview-chair','Two interview chairs',768,304,'The chairs are the same height, with neither backed against the wall. A notice offers an open door and a companion if requested. Inez has handwritten no reason required over the printed space for an explanation.','Both chairs are occupied by the same empty room. The door remains available.'),prop('evidence-signatures','Evidence shelf signatures',288,448,'Every shelf entry identifies who supplied it and whether it may be copied. A line on one envelope reads witness account, not witness address. Inez has begun separating evidence from directions to a person who did not consent to be found.','The signatures lift slightly from the paper when you breathe, then settle without changing names.'),prop('patrol-map','Flood patrol map',608,512,'The patrol map has Mara’s first statement stapled beside the ferry landing. Its original filing category, possible sighting, is struck through and preserved. The correction changes the record without awarding anybody the comfort of having been right all along.','The ferry landing on the map smells of wet rope. The filing correction remains dry and readable.')],
  }),
  interior('railcar-1',896,576,{
    rooms:[room('Passenger coach',32,56,832,488,'carpet')],
    furniture:[...[[64,96],[256,96],[544,96],[736,96],[64,256],[256,256],[544,256],[736,256]].map(([x,y])=>furniture('booth',x,y,112,80,{color:'#879c98'})),furniture('shelf',64,416,240,40),furniture('cabinet',688,400,128,80),furniture('rug',416,64,64,416,{solid:false})],
    props:[prop('coach-reservations','Passenger reservation cards',384,176,'Seat cards show names, ticket dates, and requests for help at the far end. The conductor checked the help requests separately from fare payment. A wheelchair space is not listed as unsold seating.','The cards reserve seats for possible versions of the same afternoon. The help requests are still checked.'),prop('coach-luggage','Overhead luggage labels',224,464,'A luggage shelf has a weight limit and a reminder to ask before moving anybody else’s bag. One suitcase outline is marked in chalk where a passenger could reach it without standing. The practical mark outlasted the trip.','The chalk outline contains a little patch of daylight from the destination.'),prop('coach-glass','Mended window latch',704,192,'The window latch has a replacement screw and a maintenance date. A passenger’s complaint is folded into the service card. The latch was repaired without the complaint being renamed fuss.','The window shows the station from one minute earlier. The replacement screw remains here, now.')],
  }),
  interior('railcar-2',896,640,{
    rooms:[room('Sleeper compartment A',32,56,320,264,'carpet'),room('Sleeper compartment B',544,56,320,264,'carpet'),room('Central passage',352,56,192,552),room('Washroom and linen alcove',32,352,832,256,'tile')],
    walls:[wall(352,56,16,128),wall(352,272,16,48),wall(528,56,16,128),wall(528,272,16,48)],
    furniture:[furniture('bed',64,88,192,160),furniture('bed',608,88,192,160),furniture('cabinet',64,400,128,80),furniture('bath',672,400,128,112),furniture('sink',544,432,80,64),furniture('shelf',224,80,80,48),furniture('shelf',544,80,48,48),furniture('bench',224,480,96,48),furniture('rug',392,88,112,432,{solid:false})],
    props:[prop('sleeper-wake','Wake-up request slips',288,208,'The slips give station names and whether the passenger wants a knock or a light switched on. One reads please let me sleep if we are late. The conductor added confirm before next stop. Care is recorded as a question, not a standing right to interrupt.','The slips name hours instead of stations. The one asking for sleep is entirely blank on the reverse.'),prop('sleeper-linen','Clean blanket labels',208,440,'Linen labels mark cleaned and inspected on separate dates. One blanket has a visible repair and the words warm, keep in service. The repair is checked along with the fabric rather than used to disguise its condition.','The repaired square holds the colour of dawn. Its inspection date stays visible.'),prop('sleeper-wash','Washroom basin notice',640,480,'The notice says water for washing, drinking water at the dining coach. Somebody added take a cup for whoever cannot walk there. The useful part of the rule has grown without losing the original distinction.','The basin contains the station’s reflection. A cup beside it contains ordinary drinking water.')],
  }),
  interior('railcar-3',960,640,{
    rooms:[room('Dining coach tables',32,56,544,552,'tile'),room('Galley kitchen',608,56,320,312,'tile'),room('Tea service alcove',608,400,320,208)],
    walls:[wall(576,56,16,152),wall(576,288,16,80),wall(576,456,16,88)],
    furniture:[furniture('table',80,96,160,80),furniture('table',352,96,160,80),furniture('table',80,288,160,80),furniture('table',352,288,160,80),furniture('chair',96,208,48,48),furniture('chair',368,208,48,48),furniture('chair',96,400,48,48),furniture('chair',368,400,48,48),furniture('stove',640,88,96,64),furniture('sink',784,88,96,64),furniture('fridge',640,224,80,96),furniture('counter',640,432,240,64),furniture('cabinet',800,240,80,96),furniture('rug',272,80,64,464,{solid:false})],
    props:[prop('dining-menu','Dining coach menu',288,192,'The menu offers soup, bread, tea, and a priced half portion. A note says smaller meal, same welcome. The cheaper option is printed in the same type size as the rest, so nobody needs to ask secretly for it.','The soup is tomorrow’s. The half portion still costs exactly half.'),prop('galley-invoice','Galley supply invoice',752,280,'The invoice lists local milk, stored flour, and the wages of the person who washed the cups. The wages are printed among necessities, above the charge for napkins. Somebody has checked the sums twice.','Every necessity briefly becomes a small window with a person working behind it.'),prop('tea-request','Tea service reminder',896,528,'A reminder beside the urn says ask before topping up. The longer line below says someone may be finished even when their cup is empty. The staff member who wrote it has signed only a first name.','The empty cups are finished. They do not refill themselves to keep you here.'),prop('coach-tablecloth','Repaired tablecloth',256,352,'A square of plain cloth has replaced a damaged patterned corner. The laundry tag names both fabrics for washing. Keeping the cloth useful required knowing what had changed, rather than declaring it as good as new.','The replacement square shows the meal before the spill. The rest shows the meal afterwards.')],
  }),
  interior('ferry-wheelhouse',768,576,{
    rooms:[room('Wheelhouse and chart desk',32,56,704,264,'stone'),room('Passenger shelter',32,352,704,192)],
    furniture:[furniture('console',64,96,192,80,{variant:'helm'}),furniture('desk',416,96,240,64),furniture('radio',288,96,80,64),furniture('bench',64,400,192,48),furniture('bench',496,400,192,48),furniture('cabinet',64,240,96,64),furniture('crate',608,240,80,64),furniture('lantern',336,240,32,48,{solid:false}),furniture('rug',304,352,160,160,{solid:false})],
    props:[prop('helm-order','Last helm order',288,208,'The helm order names the far-bank landing and the count expected there. A handwritten amendment says passengers first, return trip only if safe. Nell signed the amendment before leaving. The wheelhouse preserves a decision made by somebody who still had to carry it out.','The helm order is read aloud by the water beyond the wall. Nell’s signature remains ink.'),prop('cabin-waterline','Interior waterline',400,304,'A waterline stops below the chart desk, although the hull outside has sunk. The dry space has no explanation attached. Its old emergency lamp, cups, and handholds remain arranged for use by people rather than visitors admiring the impossible.','The waterline climbs the wall and becomes a horizon. The lamp stays at hand height.'),prop('passenger-marks','Twenty-three tally marks',288,448,'Twenty-three marks are cut into the bench support. The marks count people who reached the far bank; they do not say what any of them did afterwards. A small arrow directs readers to the manifest at the landing for names and signatures.','The marks sound briefly like twenty-three breaths. Every one ends without being declared a farewell.'),prop('ferry-radio','Ferry emergency radio',352,192,'The radio is tuned to the same emergency channel as the hill relay. The written call asks for a clear bank, not for anybody to come find a particular passenger. Nell’s route needed help without making every traveller publicly available.','The radio carries ordinary rain reports from a repaired relay. The cabin’s impossible air stays quiet.')],
  }),
];
