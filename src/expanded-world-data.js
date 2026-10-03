// Artists import only pixel-art.js. Importing their collision arrays here keeps
// story and engine data separate from drawing without a circular dependency.
import { VELVET_OBSTACLES } from './velvet-world.js';
import { EMBER_OBSTACLES } from './ember-world.js';

export const EXPANDED_SIZE={width:4800,height:3456};
export const EXPANDED_OBSTACLES={lynch:VELVET_OBSTACLES,shinobi:EMBER_OBSTACLES};

export const EXPANDED_REGIONS={
  lynch:[
    {id:'mercy-falls',name:'Mercy Falls',x:0,y:0,width:1600,height:1152},
    {id:'paper-mill',name:'The paper mill district',x:1600,y:0,width:1300,height:1152},
    {id:'observatory',name:'Lake Mercy observatory',x:2900,y:0,width:1050,height:1700},
    {id:'broadcast-hills',name:'The broadcast hills',x:3950,y:0,width:850,height:1700},
    {id:'chapel',name:'Saint Agnes crossroads',x:0,y:1152,width:1500,height:1150},
    {id:'orchard',name:'The drowned orchard',x:0,y:2302,width:2100,height:1154},
    {id:'ferry-marsh',name:'The ferry marsh',x:1500,y:1152,width:1750,height:1450},
    {id:'rail-terminal',name:'Mercy County rail terminal',x:2100,y:1700,width:2700,height:1756},
  ],
  shinobi:[
    {id:'hidden-reed',name:'Village Hidden in the Reeds',x:0,y:0,width:1600,height:1152},
    {id:'cedar-forest',name:'Cedar crossing forest',x:1600,y:0,width:850,height:1450},
    {id:'stormwater',name:'Stormwater basin',x:2450,y:0,width:850,height:1450},
    {id:'hermitage',name:'The mountain hermitage',x:3300,y:0,width:1500,height:1250},
    {id:'courier-road',name:'The courier road',x:0,y:1152,width:3300,height:950},
    {id:'ash-archive',name:'Ash-clan archive',x:3300,y:1250,width:1500,height:1250},
    {id:'lantern-market',name:'The lantern market',x:0,y:2102,width:1600,height:1354},
    {id:'reed-marsh',name:'The reed marsh',x:1600,y:2102,width:1700,height:1354},
    {id:'border-outpost',name:'The border outpost',x:2900,y:2102,width:1900,height:1354},
  ],
};

const npc=(name,x,y,kind)=>({name,x,y,kind,type:'npc',phase:'both'});
const landmark=(name,x,y,main=true,phase='both')=>({name,x,y,type:'landmark',main,phase});
const waypoint=(name,x,y)=>({name,x,y,type:'waypoint',phase:'both'});
const chest=(name,x,y)=>({name,x,y,type:'chest',phase:'both'});

export const EXPANDED_FEATURES={
  lynch:[
    npc('Dale Mercer',730,704,'guide'),npc('Alma Vale',466,697,'merchant'),npc('Vivian Bell',1058,625,'ranger'),
    npc('Owen Pike',1240,790,'clerk'),npc('Elsie Reed',462,365,'operator'),npc('The double',1260,372,'double'),
    npc('Hester Wren',2240,750,'archivist'),npc('Deputy Inez',1800,1340,'deputy'),npc('Arthur Latch',3530,1220,'astronomer'),
    npc('Mara Voss',3370,2790,'conductor'),npc('Teddy Fenn',1300,2500,'traveler'),npc('Silas Holt',4230,790,'radio'),
    npc('Dr. Iris Moss',825,1970,'physician'),npc('Nell Ash',2850,2260,'ferryman'),
    landmark('Ringing telephone',465,320,true,'waking'),landmark('Red-curtain stage',1040,500,true,'dream'),
    landmark('Black pine grove',1330,270,true,'dream'),landmark('Abandoned paper mill',2310,620,true,'waking'),
    landmark('Lakeside observatory',3600,1160,true,'dream'),landmark('Platform thirteen',3470,2750,true,'waking'),
    landmark('Dead-air relay',4250,680,false),landmark('Flooded orchard',1600,2700,false,'dream'),
    landmark('Roadside chapel',810,1900,false,'waking'),landmark('Sunken ferry',2830,2170,false),
    waypoint('Mercy Falls bus stop',742,704),waypoint('Mill service stop',2210,820),
    waypoint('Observatory landing',3480,1320),waypoint('Chapel crossroads',840,2040),
    waypoint('Ferry boardwalk',2800,2350),waypoint('Platform thirteen station',3360,2870),
    chest('Lost property',350,725),chest('The unclaimed suitcase',1400,855),
    chest('Mill foreman\'s locker',2440,860),chest('Observatory supply case',3720,1400),
    chest('The chapel donation box',965,2110),chest('Orchard picnic hamper',1810,2820),
    chest('Ferry operator\'s trunk',2950,2365),chest('Station lost luggage',3640,2910),
  ],
  shinobi:[
    npc('Ren',760,645,'guide'),npc('Mako',1040,720,'merchant'),npc('Aya',600,380,'ranger'),
    npc('Nori',580,750,'quartermaster'),npc('Sora',1220,422,'elder'),npc('Kaito',978,315,'rival'),
    npc('Emi',1090,2730,'merchant'),npc('Toma',2170,2770,'tracker'),npc('Kaede',2720,1190,'medic'),
    npc('Captain Raika',3570,2970,'captain'),npc('Jun',3820,1850,'archivist'),npc('Isao',4220,710,'hermit'),
    npc('Hina',1750,1670,'courier'),npc('Riku',2110,1020,'bridgekeeper'),
    landmark('North training grounds',780,315),landmark('Sealed watchtower',1260,420),landmark('Bamboo crossing',370,850),
    landmark('Stormwater falls',2800,1100),landmark('Ash-clan archive',3900,1750),landmark('Border oath gate',3650,2920),
    landmark('Lantern market',1150,2690,false),landmark('Reed marsh shrine',2250,2810,false),
    landmark('Old suspension bridge',2100,950,false),landmark('Mountain hermitage',4300,610,false),
    waypoint('Reed village gate',758,696),waypoint('Cedar bridge landing',2020,1120),
    waypoint('Stormwater basin',2770,1280),waypoint('Ash archive courtyard',3810,1920),
    waypoint('Lantern market stop',1110,2830),waypoint('Border outpost yard',3550,3080),
    chest('Training supply scroll',635,335),chest('Reed-clan cache',445,880),
    chest('Cedar crossing cache',2230,1160),chest('Falls medical supply',2950,1340),
    chest('Ash archive strongbox',4050,1970),chest('Market courier parcel',1270,2890),
    chest('Marsh shrine offering',2280,2980),chest('Border quartermaster chest',3770,3080),
  ],
};
