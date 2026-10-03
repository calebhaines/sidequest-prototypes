// Authored, outline-free pixel landscapes for the expanded Hidden Ember prototype.
// Everything is drawn in global world coordinates; the router caches visible chunks.
const SIZE = {width:4800,height:3456};
const P = {grass:'#8cbf70',grassShade:'#7caf64',grassLight:'#a3cc7f',forest:'#6e9f63',soil:'#d6bd89',road:'#ecd4a1',roadShade:'#d8bc87',leaf:'#4b9658',leafLight:'#73b76b',cedar:'#3a8056',cedarLight:'#60a068',bamboo:'#7fac56',trunk:'#a18558',wood:'#b79462',wall:'#ede3b7',wallShade:'#cabc94',roof:'#de8046',roofLight:'#f7a764',roofShade:'#b76840',water:'#70cbcb',waterLight:'#acddd2',waterShade:'#4daab7',rock:'#acb29a',rockShade:'#899880',rockLight:'#cbd0b0',navy:'#365f85',blue:'#618ba7',orange:'#f59a45',cream:'#fff0bb'};
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function hit(b,o,p=0){return o.x+o.width>=b.x-p&&o.x<=b.x+b.width+p&&o.y+o.height>=b.y-p&&o.y<=b.y+b.height+p;}
function oval(c,x,y,w,h,color){const rows=8,step=Math.max(1,Math.round(h/rows));for(let i=0;i<rows;i++){const q=(i+.5)/rows*2-1,inset=Math.round((1-Math.sqrt(Math.max(0,1-q*q)))*w/2);rect(c,x+inset,y+i*step,w-inset*2,i===rows-1?h-step*i:step,color);}}
function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const GLYPHS={A:['010','101','111','101','101'],B:['110','101','110','101','110'],C:['011','100','100','100','011'],D:['110','101','101','101','110'],E:['111','100','110','100','111'],F:['111','100','110','100','100'],G:['011','100','101','101','111'],H:['101','101','111','101','101'],I:['111','010','010','010','111'],J:['001','001','001','101','010'],K:['101','101','110','101','101'],L:['100','100','100','100','111'],M:['10101','11111','10101','10101','10101'],N:['101','111','111','111','101'],O:['010','101','101','101','010'],P:['110','101','110','100','100'],Q:['010','101','101','111','011'],R:['110','101','110','101','101'],S:['011','100','010','001','110'],T:['111','010','010','010','010'],U:['101','101','101','101','111'],V:['101','101','101','101','010'],W:['10101','10101','10101','11111','01010'],X:['101','101','010','101','101'],Y:['101','101','010','010','010'],Z:['111','001','010','100','111'],'0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],'3':['110','001','010','001','110'],'4':['101','101','111','001','001'],'5':['111','100','110','001','110'],'6':['011','100','110','101','010'],'7':['111','001','010','010','010'],'8':['010','101','010','101','010'],'9':['010','101','011','001','110']};
function text(c,s,x,y,color,scale=1){let xx=x;for(const ch of s.toUpperCase()){const g=GLYPHS[ch];if(g)for(let yy=0;yy<g.length;yy++)for(let j=0;j<g[yy].length;j++)if(g[yy][j]==='1')rect(c,xx+j*scale,y+yy*scale,scale,scale,color);xx+=((g?.[0].length||3)+1)*scale;}}
function shadow(c,x,y,w=40,h=10){oval(c,x,y,w,h,'#699e60');}
function emblem(c,x,y,col,scale=1){rect(c,x+3*scale,y,2*scale,10*scale,col);rect(c,x,y+3*scale,3*scale,2*scale,col);rect(c,x+5*scale,y+5*scale,3*scale,2*scale,col);rect(c,x+1*scale,y+8*scale,6*scale,2*scale,col);}

// Reserved approach space for every main landmark, villager, and travel shrine.
const POINTS=[[758,696],[760,645],[1040,720],[600,380],[580,750],[1220,422],[978,315],[780,315],[1260,420],[370,850],[635,335],[445,880],[2800,1100],[3900,1750],[3650,2920],[1150,2690],[2250,2810],[2100,950],[4300,610],[1090,2730],[2170,2770],[2720,1190],[3570,2970],[3820,1850],[4220,710],[1750,1670],[2110,1020],[2020,1120],[2770,1280],[3810,1920],[1110,2830],[3550,3080],[2230,1160],[2950,1340],[4050,1970],[1270,2890],[2280,2980],[3770,3080]];
const ROADS=[
{x:400,y:585,width:3750,height:64},{x:733,y:242,width:64,height:2665},
{x:448,y:699,width:722,height:58},{x:309,y:820,width:486,height:67},{x:768,y:371,width:536,height:50},
{x:1168,y:335,width:72,height:282},{x:754,y:2762,width:3130,height:66},
{x:1666,y:609,width:66,height:2186},{x:1680,y:1628,width:2556,height:66},
{x:2017,y:583,width:62,height:572},{x:2040,y:922,width:790,height:56},
{x:2738,y:926,width:64,height:1884},{x:2748,y:1231,width:1110,height:58},
{x:3852,y:599,width:62,height:2418},{x:3515,y:2929,width:74,height:181},
{x:2200,y:2900,width:1692,height:58},{x:4230,y:576,width:65,height:1165},
{x:3870,y:626,width:470,height:50},{x:3805,y:1802,width:85,height:143},
{x:1066,y:2646,width:69,height:222},{x:1070,y:2663,width:156,height:48},
{x:2150,y:2748,width:152,height:61},{x:2209,y:2735,width:61,height:207},
{x:2050,y:1000,width:94,height:151},{x:2741,y:1069,width:151,height:66},
{x:4220,y:670,width:116,height:62},{x:3620,y:2790,width:62,height:151},
];
const CLEARINGS=[{x:430,y:245,width:920,height:689},{x:1890,y:810,width:420,height:420},{x:2600,y:920,width:444,height:464},{x:4140,y:445,width:410,height:423},{x:1570,y:1485,width:415,height:352},{x:3650,y:1490,width:648,height:565},{x:856,y:2460,width:600,height:480},{x:2010,y:2610,width:439,height:448},{x:3340,y:2680,width:640,height:549}];
const STRUCTURES=[
{x:667,y:421,width:196,height:135,kind:'tower',name:'REED'},
{x:450,y:605,width:137,height:107,kind:'house',name:'SUPPLY'},
{x:989,y:555,width:159,height:126,kind:'ramen',name:'RAMEN'},
{x:890,y:795,width:157,height:120,kind:'house',name:'HOME'},
{x:1170,y:199,width:139,height:148,kind:'watchtower',name:'WATCH'},
{x:118,y:709,width:125,height:113,kind:'house',name:'REEDS'},
{x:1088,y:470,width:112,height:97,kind:'house',name:'POST'},
{x:1809,y:810,width:140,height:134,kind:'house',name:'BRIDGE'},
{x:2940,y:1050,width:156,height:126,kind:'house',name:'MEDIC'},
{x:4110,y:460,width:145,height:132,kind:'hermit',name:'HERMIT'},
{x:4380,y:660,width:112,height:95,kind:'hermit',name:'TEA'},
{x:1563,y:1500,width:168,height:119,kind:'post',name:'COURIER'},
{x:1811,y:1693,width:141,height:110,kind:'house',name:'REST'},
{x:3730,y:1505,width:267,height:175,kind:'archive',name:'ASH ARCHIVE'},
{x:4035,y:1535,width:136,height:123,kind:'house',name:'ASH'},
{x:4070,y:1809,width:168,height:120,kind:'house',name:'SCROLLS'},
{x:3610,y:1715,width:137,height:127,kind:'house',name:'ASH'},
{x:900,y:2475,width:154,height:128,kind:'ramen',name:'NOODLES'},
{x:1220,y:2485,width:138,height:116,kind:'house',name:'INN'},
{x:892,y:2795,width:137,height:126,kind:'house',name:'HOME'},
{x:1308,y:2840,width:120,height:105,kind:'house',name:'SILK'},
{x:2230,y:2624,width:136,height:118,kind:'shrine',name:'REEDS'},
{x:3373,y:2728,width:155,height:135,kind:'post',name:'BORDER'},
{x:3728,y:2734,width:180,height:149,kind:'tower',name:'OATH'},
{x:3810,y:3050,width:133,height:124,kind:'post',name:'MESS'},
];
const ROCKS=[{x:40,y:50,width:290,height:147},{x:431,y:74,width:895,height:137},{x:1390,y:75,width:620,height:172},{x:2180,y:125,width:446,height:208},{x:2895,y:157,width:380,height:290},{x:3270,y:214,width:605,height:243},{x:4030,y:88,width:612,height:320},{x:4130,y:360,width:244,height:69},{x:2750,y:590,width:437,height:189},{x:3110,y:846,width:249,height:102},{x:4155,y:980,width:516,height:335},{x:2180,y:1885,width:210,height:300},{x:4020,y:2290,width:562,height:270},{x:151,y:2860,width:300,height:271},{x:4280,y:3000,width:374,height:313}];
const MEANDER=[];for(let y=1450;y<2200;y+=22){if(y+22>1815&&y<1881)continue;MEANDER.push({x:327+Math.round(Math.sin(y/145)*75),y,width:72,height:22});}
const WATER=[{x:321,y:0,width:85,height:510},{x:321,y:589,width:85,height:225},{x:321,y:896,width:85,height:557},
{x:1970,y:716,width:104,height:198},{x:1970,y:990,width:104,height:89},
{x:2817,y:780,width:111,height:276},{x:2909,y:1224,width:350,height:63},{x:3180,y:1287,width:86,height:341},
{x:2500,y:2400,width:326,height:206},{x:2390,y:3050,width:364,height:167},{x:2010,y:3050,width:230,height:231},...MEANDER];
export const EMBER_OBSTACLES=[...STRUCTURES.map(o=>({x:o.x+6,y:o.y+36,width:o.width-12,height:o.height-39})),...ROCKS.map(o=>({x:o.x+9,y:o.y+18,width:o.width-18,height:o.height-24})),...WATER.map(o=>({...o})),{x:2881,y:1096,width:31,height:64},{x:3136,y:1095,width:85,height:136},{x:2914,y:1198,width:302,height:33}];

function road(c,r){rect(c,r.x,r.y,r.width,r.height,P.road);const horizontal=r.width>r.height;if(horizontal){rect(c,r.x,r.y+r.height-6,r.width,6,P.roadShade);for(let x=r.x+14;x<r.x+r.width-8;x+=49){rect(c,x,r.y+11,12,2,'#f6dfaf');rect(c,x+18,r.y+r.height-16,7,2,'#c8ad7c');}}else{rect(c,r.x+r.width-6,r.y,6,r.height,P.roadShade);for(let y=r.y+15;y<r.y+r.height-8;y+=47){rect(c,r.x+11,y,12,2,'#f6dfaf');rect(c,r.x+r.width-22,y+17,6,2,'#c8ad7c');}}}
function roof(c,x,y,w,h=47,col=P.roof){for(let i=0;i<8;i++){const inset=Math.max(0,28-i*5),row=Math.round(i*h/8);rect(c,x+inset,y+row,w-inset*2,Math.ceil(h/8)+1,i%3===0?P.roofLight:col);for(let xx=x+inset+6;xx<x+w-inset-3;xx+=12)rect(c,xx,y+row+1,2,Math.ceil(h/8)-1,i%3===0?'#ffd087':'#eca165');}rect(c,x-5,y+h-3,w+10,6,P.roofShade);rect(c,x-7,y+h-7,14,4,P.roofLight);rect(c,x+w-7,y+h-7,14,4,P.roofLight);}
function window(c,x,y,w=24,h=27){rect(c,x,y,w,h,'#84aba4');rect(c,x+2,y+3,w-4,6,'#bed2b3');for(let xx=x+7;xx<x+w;xx+=8)rect(c,xx,y,2,h,'#e9dbad');rect(c,x,y+h/2,w,2,'#e9dbad');}
function banner(c,x,y,col=P.orange,word='REED'){rect(c,x,y-73,4,76,'#b09968');rect(c,x-1,y-78,6,7,'#d9c398');rect(c,x+4,y-70,29,43,col);rect(c,x+4,y-70,29,3,'#ffe1a0');emblem(c,x+13,y-59,P.cream,1.5);rect(c,x+4,y-26,12,7,col);rect(c,x+22,y-26,11,7,col);if(word)text(c,word,x+8,y-38,P.cream);}
function reedLeadershipTower(c,o){
  const {x,y,width:w,height:h}=o,bottom=y+h;
  shadow(c,x+5,bottom-6,w,16);
  // Three cylindrical plaster tiers and broad sunlit roof terraces preserve the
  // village's familiar leadership silhouette without a perimeter contour.
  rect(c,x+13,y+24,w-26,h-30,P.wall);
  rect(c,x+21,y+28,14,h-39,'#fff0c5');rect(c,x+w-34,y+27,21,h-35,P.wallShade);
  oval(c,x+13,bottom-20,w-26,16,'#d5c394');
  for(let yy=y+41;yy<bottom-22;yy+=29){rect(c,x+17,yy,w-34,3,'#dac395');rect(c,x+20,yy+3,w-40,1,'#f6dfac');}
  for(const dx of [27,57,112,143])window(c,x+dx,y+35,19,24);
  oval(c,x+2,y+9,w-4,32,'#bf7849');
  oval(c,x+2,y+3,w-4,24,'#eda05a');
  oval(c,x+13,y+5,w-26,16,'#ffc77e');
  for(let xx=x+15;xx<x+w-14;xx+=12)rect(c,xx,y+23,4,3,'#d68a4f');
  // Middle drum, with wraparound blue windows and a second orange terrace.
  rect(c,x+43,y-36,w-86,51,'#efd3a0');rect(c,x+w-60,y-34,15,43,'#d3b68a');
  rect(c,x+47,y-33,8,43,'#ffebbd');
  for(let i=0;i<4;i++)window(c,x+52+i*25,y-23,16,21);
  oval(c,x+30,y-45,w-60,24,'#ca7d47');
  oval(c,x+31,y-51,w-62,24,'#f3a05a');
  oval(c,x+40,y-49,w-80,16,'#ffcf87');
  // The smaller rooftop office is topped by tanks, pipes, and a narrow antenna.
  rect(c,x+65,y-76,w-130,28,'#e6d4a8');rect(c,x+w-78,y-74,11,23,'#cbb98e');
  window(c,x+77,y-70,18,15);window(c,x+105,y-70,16,15);
  oval(c,x+55,y-90,w-110,24,'#f09b54');
  oval(c,x+62,y-88,w-124,16,'#ffd28b');
  rect(c,x+77,y-107,17,19,'#8aaba4');oval(c,x+74,y-111,23,8,'#d0d9b9');
  rect(c,x+79,y-104,4,14,'#b9d1bb');rect(c,x+110,y-102,12,14,'#ba9d72');
  oval(c,x+108,y-106,16,8,'#e8ce98');rect(c,x+134,y-84,4,37,'#a5b6a2');
  rect(c,x+124,y-86,14,4,'#d2d7b5');rect(c,x+94,y-113,2,25,'#8b9f91');
  // Crest, navy clan pennants, entrance, and pale stone approach steps.
  rect(c,x+w/2-21,y+62,42,25,'#e9924b');emblem(c,x+w/2-6,y+67,'#fff0bd',1.6);
  for(const dx of [7,w-21]){rect(c,x+dx,y+46,14,40,'#628eaa');rect(c,x+dx+2,y+49,10,3,'#cbdcbd');emblem(c,x+dx+4,y+58,'#f3e3b4',.65);}
  rect(c,x+w/2-17,bottom-38,35,33,'#ccb887');rect(c,x+w/2-15,bottom-35,31,26,'#e1cd9e');
  rect(c,x+w/2,bottom-35,2,26,'#b79f74');rect(c,x+w/2-14,bottom-22,28,2,'#c4ac7e');
  rect(c,x+w/2-24,bottom-3,49,7,'#e9d7ad');rect(c,x+w/2-30,bottom+4,61,4,'#c9b389');
}
function house(c,o){const {x,y,width:w,height:h,kind}=o;if(kind==='tower'&&o.name==='REED'){reedLeadershipTower(c,o);return;}shadow(c,x+5,y+h-5,w,16);const wall=y+41;rect(c,x+5,wall,w-10,h-41,P.wall);rect(c,x+w-27,wall+3,22,h-44,P.wallShade);rect(c,x+5,y+h-19,w-10,18,'#b69c75');for(let xx=x+10;xx<x+w-12;xx+=41)rect(c,xx,wall+2,4,h-27-wall+y,'#c6af81');roof(c,x-4,y,w+8,47,kind==='archive'?'#6f9296':P.roof);
  if(kind==='watchtower'){rect(c,x+17,y-32,w-34,36,P.wall);roof(c,x+11,y-53,w-22,31);rect(c,x+35,y-65,w-70,21,P.wallShade);roof(c,x+24,y-79,w-48,23);}
  if(kind==='tower'){oval(c,x+4,y+38,w-8,h-42,P.wall);rect(c,x+w-37,y+45,30,h-55,P.wallShade);roof(c,x-6,y,w+12,48);rect(c,x+w/2-22,y-41,45,45,'#aac0ab');oval(c,x+w/2-26,y-48,53,13,'#cddbba');rect(c,x+w/2-17,y-31,35,2,'#dae2c5');rect(c,x+w/2-3,y-38,6,33,'#88a498');rect(c,x+w-12,y-35,4,91,'#b3b99b');rect(c,x+w-18,y-39,16,5,'#d2d1ac');}
  if(kind==='hermit'||kind==='shrine'){rect(c,x+15,y+50,w-30,h-67,'#c6b394');for(let xx=x+20;xx<x+w-15;xx+=18)rect(c,xx,y+50,3,h-67,'#e4d2aa');}
  for(const xx of [x+20,x+w-43])window(c,xx,wall+13,23,25);
  rect(c,x+w/2-13,y+h-43,28,39,'#a5976f');rect(c,x+w/2-11,y+h-41,24,34,'#d0bc8b');for(let xx=x+w/2-8;xx<x+w/2+12;xx+=7)rect(c,xx,y+h-41,2,34,'#a99568');
  rect(c,x+w/2-23,y+h-4,47,7,'#dfcea5');rect(c,x+w/2-29,y+h+3,59,4,'#c7b28a');
  if(o.name){const signW=Math.min(w-17,o.name.length*5+16);rect(c,x+w/2-signW/2,wall+2,signW,13,kind==='archive'?P.navy:'#467c76');text(c,o.name,x+w/2-o.name.length*2,wall+6,'#fff2c4');}
  if(kind==='ramen'){rect(c,x+8,wall+42,w-16,15,'#f0bd68');for(let i=0;i<Math.floor((w-16)/17);i++){rect(c,x+8+i*17,wall+42,15,18,i%2?'#eb9051':'#f2c075');rect(c,x+11+i*17,wall+45,9,2,P.cream);}rect(c,x+13,wall+65,w-26,12,'#ae8457');for(let xx=x+21;xx<x+w-17;xx+=24){rect(c,xx,wall+71,10,18,'#bd8b57');oval(c,xx-3,wall+67,17,6,'#e7b074');}rect(c,x+w-39,y-19,15,32,'#95ae9d');rect(c,x+w-43,y-24,23,6,'#cad1ad');}
  if(kind==='archive'){rect(c,x+58,wall+38,w-116,22,'#536f83');for(let xx=x+66;xx<x+w-61;xx+=14){rect(c,xx,wall+43,8,13,'#f1d4a6');rect(c,xx+1,wall+45,6,2,'#c58660');}banner(c,x+w+18,y+h-2,'#6d7d9d','ASH');}
  else banner(c,x+w+10,y+h-1,kind==='post'?'#487da0':P.orange,kind==='watchtower'?'':'REED');
}
function cliff(c,o){rect(c,o.x,o.y,o.width,o.height,P.rockShade);for(let row=0;row<o.height;row+=17){const inset=row<20?6:0;rect(c,o.x+inset,o.y+row,o.width-inset*2,11,row%34?P.rock:P.rockLight);for(let x=o.x+12;x<o.x+o.width-16;x+=43)rect(c,x+(row%34?13:0),o.y+row+11,22,4,'#98a58b');}rect(c,o.x-3,o.y-4,o.width+6,9,'#83ab71');rect(c,o.x+5,o.y-4,o.width-10,3,'#b0cf8c');}
function tree(c,x,y,s=1,cedar=false){const z=n=>Math.round(n*s);shadow(c,x-z(22),y-z(3),z(50),z(12));rect(c,x-z(5),y-z(36),z(10),z(36),P.trunk);rect(c,x-z(4),y-z(28),z(3),z(26),'#bfa16a');if(cedar){const col=P.cedar;for(const [yy,w,h] of [[-79,20,15],[-68,36,18],[-53,50,20],[-36,62,21]]){rect(c,x-z(w/2),y+z(yy),z(w),z(h),col);rect(c,x-z(w/2)+z(4),y+z(yy),z(w*.56),z(4),P.cedarLight);rect(c,x+z(w*.1),y+z(yy+h-6),z(w*.24),z(5),'#448b5c');}rect(c,x-z(3),y-z(89),z(7),z(12),P.cedarLight);}else{rect(c,x-z(23),y-z(60),z(47),z(40),P.leaf);rect(c,x-z(31),y-z(50),z(65),z(26),P.leaf);rect(c,x-z(17),y-z(71),z(36),z(18),P.leafLight);rect(c,x-z(28),y-z(54),z(23),z(15),'#67ad64');rect(c,x-z(9),y-z(63),z(30),z(9),'#81c072');rect(c,x+z(16),y-z(43),z(13),z(15),'#4d9c5b');rect(c,x-z(15),y-z(30),z(28),z(7),'#599f5d');}}
function bamboo(c,x,y,s=1){const z=n=>Math.round(n*s);for(const [dx,h] of [[-11,55],[0,75],[12,62]]){rect(c,x+z(dx),y-z(h),z(4),z(h),P.bamboo);rect(c,x+z(dx),y-z(h),z(2),z(h),'#b4cf79');for(let yy=y-z(h)+z(12);yy<y-4;yy+=z(14)){rect(c,x+z(dx)-z(1),yy,z(6),z(2),'#7b9e57');rect(c,x+z(dx)-z(8),yy-z(5),z(8),z(3),'#74ab63');rect(c,x+z(dx)+z(4),yy-z(1),z(10),z(3),'#91bb6a');}}}
function torii(c,x,y,w=110,col='#d57755'){for(const dx of [-w*.34,w*.34]){rect(c,x+dx-4,y-80,9,83,col);rect(c,x+dx-2,y-80,3,79,'#eba27a');rect(c,x+dx-7,y-5,15,9,'#b8a98a');}rect(c,x-w/2-6,y-89,w+12,9,col);rect(c,x-w/2-8,y-91,16,5,'#f4b78a');rect(c,x+w/2-8,y-91,16,5,'#f4b78a');rect(c,x-w/2+4,y-68,w-8,7,col);rect(c,x-w/2+5,y-68,w-10,2,'#e8a279');rect(c,x-13,y-86,27,20,P.navy);emblem(c,x-3,y-82,P.cream,1.2);}
function log(c,x,y){shadow(c,x-15,y-3,31,9);rect(c,x-7,y-39,15,39,'#ae8b59');rect(c,x-7,y-38,5,36,'#c7a772');rect(c,x+3,y-34,3,33,'#957e54');oval(c,x-9,y-42,19,10,'#ddc293');oval(c,x-5,y-40,10,6,'#c0a06a');rect(c,x-16,y-27,33,5,'#b39363');rect(c,x-14,y-26,29,2,'#d4b383');rect(c,x-5,y-20,10,4,'#e0d5af');}
function lantern(c,x,y){rect(c,x-1,y-52,3,52,'#b09466');rect(c,x-9,y-54,20,3,'#c4aa78');rect(c,x-6,y-49,14,20,'#f5b461');rect(c,x-4,y-48,4,17,'#ffe1a0');rect(c,x+4,y-47,3,16,'#d89558');rect(c,x-6,y-42,14,2,'#e4a263');rect(c,x-6,y-35,14,2,'#e4a263');rect(c,x-3,y-27,8,3,'#cc9d69');}
function utilityPole(c,x,y){rect(c,x-3,y-112,6,112,'#b09369');rect(c,x-3,y-111,2,108,'#d3b98a');rect(c,x-18,y-111,38,5,'#bc976a');for(const dx of [-14,0,14]){rect(c,x+dx-2,y-122,5,11,'#a8c3b5');rect(c,x+dx-3,y-120,7,3,'#d3ddd0');}}
function wire(c,x1,y1,x2,y2,col='#758d7b',lanterns=false){const steps=Math.ceil(Math.abs(x2-x1)/8);for(let i=0;i<steps;i++){const f=i/steps,x=x1+(x2-x1)*f,y=y1+(y2-y1)*f+Math.sin(f*Math.PI)*24;rect(c,x,y,Math.ceil((x2-x1)/steps)+1,1,col);if(lanterns&&i%9===4){rect(c,x+3,y,1,10,'#a8976f');rect(c,x-2,y+10,12,17,'#f3ad5b');rect(c,x,y+11,4,13,'#ffe4a3');rect(c,x-2,y+21,12,2,'#df9853');}}}
function crate(c,x,y){rect(c,x-11,y-23,23,24,'#caa16c');rect(c,x+6,y-22,6,23,'#ae8a5e');rect(c,x-9,y-21,18,3,'#e4c18d');rect(c,x-8,y-14,2,12,'#e2bb83');rect(c,x+4,y-14,2,12,'#e2bb83');rect(c,x-11,y-7,23,3,'#dfbb88');}
function scroll(c,x,y,col='#e9dcc0'){rect(c,x-4,y-15,10,16,col);rect(c,x-6,y-17,14,4,'#b77757');rect(c,x-6,y,14,3,'#b77757');rect(c,x-3,y-10,7,1,'#a68c67');rect(c,x-3,y-7,6,1,'#a68c67');rect(c,x-3,y-4,7,1,'#a68c67');}
function camp(c,x,y,col=P.navy){shadow(c,x-44,y-4,92,16);for(let i=0;i<8;i++){const w=22+i*9;rect(c,x-w/2,y-52+i*6,w,7,i<3?'#a3b9a3':col);}rect(c,x-5,y-28,18,27,'#728c7e');rect(c,x+6,y-20,15,19,'#8ca699');rect(c,x-38,y,76,3,'#ccb893');crate(c,x+49,y);scroll(c,x+29,y-3);}
function board(c,x,y,title='MISSIONS'){rect(c,x-28,y-62,58,44,'#c6a575');rect(c,x-24,y-58,50,36,'#e6d3a6');rect(c,x-33,y-66,68,7,'#dbab76');rect(c,x-24,y-18,5,20,'#b19365');rect(c,x+20,y-18,5,20,'#b19365');text(c,title,x-22,y-53,'#867458');for(let i=0;i<3;i++){rect(c,x-22+i*15,y-41,12,14,'#fff0c4');rect(c,x-20+i*15,y-37,8,1,'#bfa27a');rect(c,x-20+i*15,y-33,7,1,'#bfa27a');}}
function bench(c,x,y){rect(c,x-26,y-10,54,8,'#c4a275');rect(c,x-26,y-12,54,3,'#e1bf8c');rect(c,x-22,y-5,4,8,'#b4956a');rect(c,x+19,y-5,4,8,'#b4956a');}
function markerStone(c,x,y){rect(c,x-12,y-28,25,29,'#b4bba1');rect(c,x-10,y-31,21,7,'#d5d3b2');rect(c,x+6,y-25,6,25,'#97a58c');emblem(c,x-3,y-20,'#7b947e',1.2);}
function flower(c,x,y,n){rect(c,x,y,2,6,'#669453');rect(c,x-2,y-1,6,3,n%3?'#e6d29a':'#efad98');rect(c,x,y-3,2,7,n%3?'#f6e6b7':'#ffc7ae');}
function bridge(c,x,y,w,h=66,suspension=false){rect(c,x,y,w,h,'#cfab75');for(let xx=x;xx<x+w;xx+=9){rect(c,xx,y+3,6,h-6,'#e2c394');rect(c,xx+1,y+5,2,h-11,'#edce9c');}rect(c,x,y+2,w,3,'#bd9566');rect(c,x,y+h-6,w,4,'#bd9566');for(let xx=x;xx<x+w;xx+=29){rect(c,xx,y-12,4,18,'#c7a575');rect(c,xx,y+h-8,4,18,'#c7a575');}if(suspension){for(const xx of [x+3,x+w-8]){rect(c,xx,y-66,7,65,'#bd9669');rect(c,xx,y+h-30,7,61,'#bd9669');}wire(c,x+5,y-62,x+w-5,y-62,'#afad87');wire(c,x+5,y+h-26,x+w-5,y+h-26,'#afad87');for(let xx=x+12;xx<x+w;xx+=16){const sag=Math.sin((xx-x)/w*Math.PI)*24;rect(c,xx,y-62+sag,1,62-sag,'#c6bb94');rect(c,xx,y+h-26+sag,1,28-sag,'#c6bb94');}}}

function river(c,r){rect(c,r.x-5,r.y,r.width+10,r.height,'#91b181');rect(c,r.x,r.y,r.width,r.height,P.waterShade);rect(c,r.x+7,r.y,r.width-16,r.height,P.water);for(let y=r.y+12;y<r.y+r.height;y+=27){rect(c,r.x+15+(Math.floor(y/27)%3)*8,y,23,2,P.waterLight);rect(c,r.x+r.width-31,y+7,16,2,'#9bdbcd');}}
function basin(c){oval(c,2760,1065,498,222,'#91b497');oval(c,2770,1067,482,208,P.waterShade);oval(c,2784,1074,458,190,P.water);for(let y=1091;y<1250;y+=21){rect(c,2940+(y%42?12:0),y,64,3,P.waterLight);rect(c,3100,y+6,48,2,'#97dcce');} // Shore path stays clear around the main landmark and medic.
  rect(c,2740,1068,123,67,P.road);rect(c,2721,1125,156,114,P.road);
  for(let i=0;i<10;i++){rect(c,2821+i*11,781,9,311,i%3?'#b4e9da':'#e4f4dc');rect(c,2822+i*11,804+(i%4)*8,3,240,'#f1f7db');}
  for(const [x,y,w,h] of [[2818,1074,120,13],[2830,1088,141,9],[2850,1101,121,8]])rect(c,x,y,w,h,'#e1f1d8');
  bridge(c,2796,1160,118,48);bridge(c,2802,1231,464,58);
  // The clinic occupies an old stone training island, reached by a timber bridge.
  rect(c,2912,1032,225,166,'#b5b99c');rect(c,2918,1032,212,156,'#d0c9a6');for(let yy=1041;yy<1185;yy+=18)for(let xx=2922;xx<3125;xx+=29)rect(c,xx,yy,23,12,'#ded5b0');
}
function faceRidge(c){for(let i=0;i<5;i++){const x=515+i*145,y=110+(i%2)*8;rect(c,x+18,y,81,18,'#c9c9a9');rect(c,x+8,y+18,101,20,'#bbc2a4');rect(c,x+3,y+38,111,52,'#bdc2a4');rect(c,x+16,y+88,83,24,'#acb69a');rect(c,x+36,y+112,45,15,'#a3af94');rect(c,x+82,y+29,22,57,'#9dab92');rect(c,x+20,y+43,23,9,'#9eab90');rect(c,x+64,y+43,23,9,'#9eab90');rect(c,x+25,y+48,15,4,'#889a82');rect(c,x+66,y+48,15,4,'#889a82');rect(c,x+49,y+48,17,32,'#d1cfac');rect(c,x+48,y+78,22,4,'#9ca98e');rect(c,x+33,y+91,46,3,'#869980');if(i===0){rect(c,x+15,y+12,88,8,'#a8b39a');rect(c,x+51,y+14,16,4,'#d3d1ad');}if(i===1){rect(c,x-1,y+23,11,55,'#a7b397');rect(c,x+108,y+22,10,52,'#a7b397');}if(i===3){for(let j=0;j<5;j++)rect(c,x+11+j*19,y+3+(j%2)*4,16,23,'#a5b097');}}}

const PROPS=[
// The village has a busy modern shinobi street, northern training field, and west-bank reeds.
{kind:'torii',x:765,y:806,w:136},{kind:'torii',x:1223,y:493,w:103},{kind:'torii',x:215,y:864,w:77},
{kind:'log',x:696,y:285},{kind:'log',x:867,y:284},{kind:'log',x:715,y:373},{kind:'log',x:911,y:368},
{kind:'board',x:878,y:690,label:'MISSIONS'},{kind:'pole',x:618,y:700},{kind:'pole',x:948,y:704},
{kind:'bench',x:462,y:780},{kind:'bench',x:1030,y:745},{kind:'crate',x:980,y:738},
{kind:'stone',x:1287,y:376},{kind:'lantern',x:644,y:633},{kind:'lantern',x:967,y:640},{kind:'lantern',x:1134,y:729},
// Forest bridge encampment.
{kind:'camp',x:2188,y:874},{kind:'log',x:2165,y:1114},{kind:'log',x:2253,y:1118},{kind:'board',x:1920,y:1010,label:'TRAILS'},
{kind:'banner',x:2138,y:931,col:'#55849a'},{kind:'crate',x:2190,y:1144},{kind:'stone',x:2148,y:994},
// Waterfall training retreat.
{kind:'camp',x:2673,y:1040},{kind:'bench',x:2661,y:1236},{kind:'log',x:2928,y:1355},{kind:'log',x:2865,y:1362},
{kind:'lantern',x:2717,y:1255},{kind:'stone',x:2695,y:1120},{kind:'banner',x:2858,y:983,col:'#e39456'},
// Mountain hermitage.
{kind:'torii',x:4328,y:656,w:109},{kind:'stone',x:4383,y:590},{kind:'bench',x:4194,y:752},{kind:'lantern',x:4178,y:670},
{kind:'scroll',x:4440,y:774},{kind:'banner',x:4422,y:595,col:'#838fa4'},
// Courier roadside station.
{kind:'board',x:1788,y:1628,label:'POST'},{kind:'camp',x:1860,y:1537},{kind:'crate',x:1591,y:1658},{kind:'crate',x:1631,y:1653},
{kind:'bench',x:1634,y:1740},{kind:'lantern',x:1782,y:1737},{kind:'banner',x:1798,y:1548,col:'#4f8c9d'},
// Ash archive settlement.
{kind:'torii',x:3900,y:1792,w:136},{kind:'stone',x:3927,y:1710},{kind:'stone',x:3980,y:1790},{kind:'board',x:3769,y:1877,label:'ORDERS'},
{kind:'crate',x:3967,y:1912},{kind:'scroll',x:3951,y:1870},{kind:'banner',x:3874,y:1690,col:'#7b8aa3'},
{kind:'lantern',x:3769,y:1741},{kind:'lantern',x:4006,y:1770},{kind:'pole',x:4038,y:1794},{kind:'pole',x:3788,y:1805},
// Lantern market, tea stools and festival street.
{kind:'pole',x:1003,y:2664},{kind:'pole',x:1310,y:2664},{kind:'lantern',x:1038,y:2740},{kind:'lantern',x:1222,y:2737},
{kind:'bench',x:982,y:2729},{kind:'bench',x:1226,y:2770},{kind:'board',x:1158,y:2613,label:'MARKET'},
{kind:'crate',x:1374,y:2766},{kind:'banner',x:964,y:2617,col:'#e39b61'},
// Marsh shrine.
{kind:'torii',x:2263,y:2862,w:115},{kind:'stone',x:2307,y:2800},{kind:'stone',x:2110,y:2806},{kind:'lantern',x:2136,y:2722},
{kind:'bench',x:2160,y:2842},{kind:'banner',x:2367,y:2757,col:'#7fa18a'},
// Border patrol outpost.
{kind:'torii',x:3650,y:2978,w:143},{kind:'board',x:3437,y:2942,label:'BORDER'},{kind:'log',x:3696,y:3148},
{kind:'camp',x:3434,y:3130},{kind:'banner',x:3516,y:2881,col:'#d68b59'},{kind:'banner',x:3711,y:2893,col:'#5a80a0'},
{kind:'pole',x:3460,y:2834},{kind:'pole',x:3700,y:2834},{kind:'lantern',x:3510,y:3053},{kind:'crate',x:3815,y:3015},
// Trails contain shrines and small destinations between districts.
{kind:'camp',x:1330,y:1280},{kind:'camp',x:2410,y:1710},{kind:'camp',x:3260,y:2490},
{kind:'stone',x:808,y:1440},{kind:'stone',x:1740,y:2220},{kind:'stone',x:2850,y:2060},{kind:'stone',x:3970,y:2400},
{kind:'banner',x:1550,y:581,col:'#71929b'},{kind:'banner',x:3270,y:632,col:'#71929b'},
];
function props(c,o){if(o.kind==='torii')torii(c,o.x,o.y,o.w);else if(o.kind==='log')log(c,o.x,o.y);else if(o.kind==='lantern')lantern(c,o.x,o.y);else if(o.kind==='pole')utilityPole(c,o.x,o.y);else if(o.kind==='camp')camp(c,o.x,o.y);else if(o.kind==='crate')crate(c,o.x,o.y);else if(o.kind==='scroll')scroll(c,o.x,o.y);else if(o.kind==='board')board(c,o.x,o.y,o.label);else if(o.kind==='stone')markerStone(c,o.x,o.y);else if(o.kind==='banner')banner(c,o.x,o.y,o.col);else if(o.kind==='bench')bench(c,o.x,o.y);}
function safeVegetation(x,y){return !POINTS.some(p=>Math.abs(p[0]-x)<65&&Math.abs(p[1]-y)<80)&&!ROADS.some(o=>x>o.x-35&&x<o.x+o.width+35&&y>o.y-20&&y<o.y+o.height+75)&&!CLEARINGS.some(o=>x>o.x&&x<o.x+o.width&&y>o.y&&y<o.y+o.height)&&!STRUCTURES.some(o=>x>o.x-39&&x<o.x+o.width+56&&y>o.y-30&&y<o.y+o.height+65)&&!WATER.some(o=>x>o.x-15&&x<o.x+o.width+20&&y>o.y&&y<o.y+o.height+30)&&!ROCKS.some(o=>x>o.x-20&&x<o.x+o.width+15&&y>o.y-40&&y<o.y+o.height+28);}
const VEGETATION=[];const r=random(421571);for(let i=0;i<5000;i++){const x=35+Math.floor(r()*4718),y=90+Math.floor(r()*3310);if(!safeVegetation(x,y))continue;const inForest=x>1350&&x<2550&&y<1420||y>1970&&x>360&&x<2100;VEGETATION.push({x,y,s:.85+r()*.5,kind:i%5===0?'bamboo':inForest||i%3===0?'cedar':'tree'});}
const SORTED=[...STRUCTURES.map(o=>({...o,bottom:o.y+o.height,draw:'house'})),...PROPS.map(o=>({...o,bottom:o.y,draw:'prop'})),...VEGETATION.map(o=>({...o,bottom:o.y,draw:'tree'}))].sort((a,b)=>a.bottom-b.bottom);
function paddies(c,b){for(const [x,y,w,h] of [[74,335,201,134],[810,1115,347,177],[920,1745,436,241],[1940,2260,350,171],[2910,2920,284,153]]){if(!hit(b,{x,y,width:w,height:h}))continue;rect(c,x,y,w,h,'#83af83');for(let yy=y+4;yy<y+h;yy+=29){rect(c,x+3,yy,w-6,5,'#b9bf8e');for(let xx=x+12;xx<x+w-8;xx+=18){rect(c,xx,yy+11,2,12,'#b3cc8a');rect(c,xx-3,yy+15,8,2,'#d0dba7');}}}}
function market(c,b){if(!hit(b,{x:860,y:2520,width:600,height:460}))return;for(const [x,y,col] of [[990,2615,'#bc7892'],[1210,2614,'#719d9c'],[988,2802,'#eca86b'],[1202,2820,'#668eb0']]){rect(c,x-34,y-8,72,16,'#c6a575');rect(c,x-34,y-14,72,7,'#ebc992');rect(c,x-28,y-5,4,28,'#b79a6b');rect(c,x+28,y-5,4,28,'#b79a6b');rect(c,x-37,y-62,78,12,col);rect(c,x-33,y-50,70,5,col);rect(c,x-31,y-54,4,44,'#c9a977');rect(c,x+32,y-54,4,44,'#c9a977');for(let i=0;i<5;i++){rect(c,x-26+i*12,y-22,9,6,i%2?'#e4b983':'#e29a79');rect(c,x-24+i*12,y-24,5,2,P.cream);} }wire(c,1005,2555,1310,2555,'#8f9c81',true);wire(c,985,2770,1317,2770,'#8f9c81',true);}

export function drawEmberTerrain(c,bounds,phase='waking'){
  rect(c,bounds.x,bounds.y,bounds.width,bounds.height,P.grass);
  // Region-scale color planes distinguish cedar woods, dry uplands and damp marsh.
  for(const [x,y,w,h,col] of [[1430,330,1220,1160,'#80b271'],[3640,1490,680,580,'#a4bc80'],[1870,2330,1040,1040,'#89b493'],[3910,330,805,590,'#aabd88'],[2980,2230,1260,1100,'#91b674']])if(hit(bounds,{x,y,width:w,height:h}))rect(c,x,y,w,h,col);
  // Texture is generated only for cells touching this terrain chunk.
  const x0=Math.max(0,Math.floor((bounds.x-20)/56)),y0=Math.max(0,Math.floor((bounds.y-20)/48)),x1=Math.min(86,Math.ceil((bounds.x+bounds.width+20)/56)),y1=Math.min(73,Math.ceil((bounds.y+bounds.height+20)/48));
  for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){const z=(Math.imul(cx+1,92821)^Math.imul(cy+1,68917))>>>0,x=cx*56+(z%27),y=cy*48+((z>>>8)%26);rect(c,x,y,11+(z%7),2,z%3?P.grassShade:P.grassLight);if(z%4===0){rect(c,x+6,y-3,2,4,P.grassLight);rect(c,x+9,y-4,2,4,P.grassLight);}if(z%11===0&&safeVegetation(x,y))flower(c,x,y,z);}
  for(const o of CLEARINGS)if(hit(bounds,o))oval(c,o.x,o.y,o.width,o.height,o.x>3200?'#b7c18f':'#a8c985');
  paddies(c,bounds);
  for(const o of ROCKS)if(hit(bounds,o,10))cliff(c,o);
  if(hit(bounds,{x:490,y:75,width:810,height:150}))faceRidge(c);
  for(const o of WATER)if(hit(bounds,o,8))river(c,o);
  // Reedwater continues gently into a flood meadow south of the old village.
  if(hit(bounds,{x:220,y:1450,width:550,height:770}))bridge(c,313,1815,137,66);
  for(const o of ROADS)if(hit(bounds,o))road(c,o);
  if(hit(bounds,{x:625,y:220,width:390,height:205})){oval(c,638,223,369,181,'#d9bd88');oval(c,651,233,344,159,'#e6ca96');for(let i=0;i<42;i++)rect(c,666+(i*43)%300,251+(i*31)%117,9,2,'#cdb17f');}
  if(hit(bounds,{x:630,y:566,width:305,height:171})){rect(c,637,566,293,166,'#d5ccab');for(let y=573;y<730;y+=17)for(let x=645;x<925;x+=25){rect(c,x+(y%34?0:7),y,20,13,'#e8ddb8');rect(c,x+2,y+1,14,1,'#f3e9c9');}}
  if(hit(bounds,{x:307,y:503,width:122,height:393})){bridge(c,307,510,116,79);bridge(c,307,820,116,76);}
  if(hit(bounds,{x:1930,y:896,width:250,height:153}))bridge(c,1937,923,188,68,true);
  if(hit(bounds,{x:2700,y:769,width:590,height:632}))basin(c);
  if(hit(bounds,{x:3155,y:1610,width:138,height:101}))bridge(c,3155,1628,138,66);
  // Small authored stepping-stone trails circle the wetland without blocking the shrine.
  if(hit(bounds,{x:2020,y:2570,width:590,height:510})){for(let i=0;i<14;i++){const x=2010+i*25,y=2919-Math.round(Math.sin(i/13*Math.PI)*80);oval(c,x,y,22,11,'#c7c7a5');rect(c,x+4,y+2,12,2,'#e0dcba');}for(let i=0;i<70;i++){const x=2026+(i*41)%413,y=2605+(i*29)%420;if(Math.abs(x-2250)<80&&Math.abs(y-2810)<95)continue;rect(c,x,y,2,17,'#6a9f74');rect(c,x-4,y+6,4,2,'#b4cda2');rect(c,x+2,y+8,5,2,'#a3c395');rect(c,x,y-4,2,5,'#d1c294');}}
  market(c,bounds);
  // Roads are marked by concrete details: kilometer posts, courier knots and supply rests.
  for(const [x,y,label] of [[1480,647,'FOREST'],[2370,963,'FALLS'],[3330,1693,'ASH'],[1752,2120,'MARKET'],[2830,2380,'MARSH'],[3889,2410,'BORDER'],[4200,648,'HERMIT']])if(hit(bounds,{x:x-35,y:y-46,width:90,height:61})){rect(c,x,y-39,4,42,'#b29669');rect(c,x-26,y-40,60,14,'#d4b683');text(c,label,x-19,y-35,'#7e8164');}
  for(const o of SORTED){const box=o.draw==='house'?{x:o.x-30,y:o.y-115,width:o.width+85,height:o.height+150}:{x:o.x-65,y:o.y-135,width:160,height:157};if(!hit(bounds,box,5))continue;if(o.draw==='house')house(c,o);else if(o.draw==='prop')props(c,o);else if(o.kind==='bamboo')bamboo(c,o.x,o.y,o.s);else tree(c,o.x,o.y,o.s,o.kind==='cedar');}
  if(hit(bounds,{x:585,y:568,width:398,height:170}))wire(c,619,585,949,589,'#73887a',true);
  if(hit(bounds,{x:3755,y:1660,width:310,height:160}))wire(c,3790,1693,4040,1682,'#798c80',true);
  if(hit(bounds,{x:3430,y:2690,width:306,height:180}))wire(c,3460,2722,3700,2722,'#83917a');
}

const NPC_COLORS={guide:['#759c69','#456582','#e2e8d5'],merchant:['#edddae','#d59858','#995e46'],ranger:['#b993ad','#6f829a','#4c4059'],quartermaster:['#7f9a71','#ac9367','#858571'],elder:['#e9d0a0','#da9558','#e0dfc0'],rival:['#5b7ca2','#365b81','#3b4957'],tracker:['#91a16d','#6d856d','#6b634d'],medic:['#e2e6ce','#9bb4a8','#c48582'],captain:['#ad7d64','#638097','#5b565f'],archivist:['#909dad','#61778a','#64707c'],hermit:['#d0c092','#a7a582','#e3dec2'],courier:['#e0a258','#70969a','#745b49'],bridgekeeper:['#b89c6e','#668381','#8a7963']};
function character(c,e,opts){const x=Math.round(e.x),y=Math.round(e.y),npc=e.type==='npc'||opts.npc,enemy=e.type==='enemy',role=e.kind||'resident',facing=e.facing||opts.facing||'down',time=opts.time||0,moving=e.moving||e.walking||opts.moving||opts.walking,run=moving&&!npc,step=moving?Math.floor(time*9)%2:0;
  const colors=enemy?[e.pacified?'#8eab9a':'#9b839c','#657b8a','#546673']:npc?(NPC_COLORS[role]||['#9caf86','#648588','#7c6a58']):[P.orange,P.navy,'#ffdb60'];const coat=colors[0],trim=colors[1],hair=colors[2],skin=role==='elder'||role==='hermit'?'#deb991':'#f2caa2';
  shadow(c,x-11,y-2,25,7);
  const legA=step?2:0,legB=step?-2:0;
  rect(c,x-6,y-14+legA,5,10,coat);rect(c,x+2,y-14+legB,5,10,coat);rect(c,x-5,y-6+legA,4,4,'#e8dfbd');rect(c,x+2,y-6+legB,4,4,'#e8dfbd');rect(c,x-7,y-2+legA,7,3,trim);rect(c,x+2,y-2+legB,7,3,trim);rect(c,x-6,y+legA,4,1,skin);rect(c,x+3,y+legB,4,1,skin);
  if(run&&(facing==='left'||facing==='right')){const d=facing==='left'?1:-1;rect(c,x+d*7-(d<0?8:0),y-25,8,4,trim);rect(c,x+d*14-(d<0?6:0),y-22,6,4,coat);rect(c,x+d*18-(d<0?3:0),y-19,4,3,skin);rect(c,x+d*7-(d<0?7:0),y-18,7,3,coat);rect(c,x+d*13-(d<0?5:0),y-16,5,3,skin);}else if(run){const yy=facing==='up'?y-16:y-28;rect(c,x-13,yy,6,4,coat);rect(c,x-17,yy-3,5,4,trim);rect(c,x-19,yy-5,4,3,skin);rect(c,x+8,yy,6,4,coat);rect(c,x+13,yy-3,5,4,trim);rect(c,x+17,yy-5,4,3,skin);}else{rect(c,x-10,y-25+step,4,12,coat);rect(c,x+7,y-25-step,4,12,coat);rect(c,x-10,y-24+step,4,5,trim);rect(c,x+7,y-24-step,4,5,trim);rect(c,x-10,y-13+step,4,3,skin);rect(c,x+7,y-13-step,4,3,skin);}
  rect(c,x-7,y-27,15,15,coat);rect(c,x+4,y-25,4,11,npc?'#859378':'#dd873b');rect(c,x-6,y-27,13,4,trim);rect(c,x-6,y-25,3,7,trim);rect(c,x+4,y-25,3,7,trim);
  if(!npc&&!enemy){rect(c,x-4,y-20,4,7,'#ffb757');rect(c,x,y-23,2,11,'#e8e1c6');rect(c,x-6,y-13,13,2,trim);if(facing==='up'){rect(c,x-5,y-22,11,8,'#ee8c3d');oval(c,x-3,y-21,7,6,'#ffe3a1');rect(c,x,y-20,2,3,'#d1753d');}}
  else if(role==='guide'||role==='quartermaster'||role==='captain'){rect(c,x-5,y-25,5,10,coat);rect(c,x+2,y-25,5,10,coat);rect(c,x,y-26,2,13,'#c2c498');for(const xx of [-4,3]){rect(c,x+xx,y-21,3,3,'#b3c28e');rect(c,x+xx,y-16,3,2,'#769565');}}
  else if(role==='rival'){rect(c,x-6,y-28,13,7,'#57769c');if(facing==='up'){oval(c,x-3,y-21,7,6,'#e1e5d5');rect(c,x-3,y-22,7,3,'#cb8a83');}}
  else if(role==='elder'||role==='hermit'){rect(c,x-7,y-14,16,8,coat);rect(c,x,y-25,3,16,trim);rect(c,x-5,y-14,3,7,'#f0dfb4');}
  else if(role==='merchant'){rect(c,x-4,y-21,10,10,'#e1b774');rect(c,x-4,y-14,10,2,'#d79b61');}
  else if(role==='medic'){rect(c,x-3,y-22,8,8,'#f4edcf');rect(c,x,y-22,2,8,'#c48e86');rect(c,x-3,y-19,8,2,'#c48e86');}
  else if(role==='courier'){rect(c,x+6,y-25,4,13,'#bd9b65');rect(c,x+5,y-26,6,3,'#ebd0a0');}
  rect(c,x-5,y-36,11,12,skin);rect(c,x-7,y-32,3,6,skin);rect(c,x+6,y-32,3,6,skin);rect(c,x+4,y-34,2,8,'#dbac85');rect(c,x-6,y-38,13,7,hair);rect(c,x-7,y-35,3,6,hair);rect(c,x+6,y-35,3,6,hair);
  if(!npc&&!enemy){for(const [xx,yy,w,h]of[[-7,-39,4,4],[-5,-43,4,6],[-1,-45,3,7],[2,-43,4,6],[5,-41,4,5],[8,-38,3,5]])rect(c,x+xx,y+yy,w,h,hair);rect(c,x-4,y-41,2,5,'#fff19b');rect(c,x+1,y-42,2,4,'#fff19b');rect(c,x+5,y-39,3,3,'#ecc044');}
  else if(role==='guide'||role==='rival'){for(const[xx,yy]of[[-7,-39],[-3,-43],[1,-43],[5,-40]])rect(c,x+xx,y+yy,4,7,hair);rect(c,x-4,y-40,3,3,role==='guide'?'#f7f1d9':'#5a6c78');}
  else if(role==='ranger'||role==='medic'){rect(c,x-9,y-34,3,13,hair);rect(c,x+8,y-34,3,13,hair);rect(c,x+8,y-22,4,3,trim);}
  rect(c,x-7,y-33,15,4,trim);rect(c,x-4,y-33,9,3,'#cddad5');rect(c,x-3,y-33,7,1,'#f4f1d9');rect(c,x,y-32,2,1,'#91aaa9');
  const flutter=Math.floor(Math.sin(time*8)*2);const side=facing==='left'?1:-1;rect(c,x+side*8-(side<0?6:0),y-32,6,2,trim);rect(c,x+side*13-(side<0?5:0),y-30+flutter,5,2,trim);
  if(facing==='up'){rect(c,x-5,y-30,11,6,hair);rect(c,x-3,y-34,7,2,npc?hair:'#fff095');}else if(facing==='left'){rect(c,x-5,y-30,2,2,'#6c6b66');rect(c,x-7,y-27,2,2,skin);}else if(facing==='right'){rect(c,x+4,y-30,2,2,'#6c6b66');rect(c,x+7,y-27,2,2,skin);}else{rect(c,x-3,y-30,2,2,'#6c6b66');rect(c,x+3,y-30,2,2,'#6c6b66');rect(c,x,y-25,2,1,'#bd9278');}
  if(role==='guide'&&facing!=='up'){rect(c,x-5,y-27,11,5,'#5b7890');rect(c,x-5,y-27,11,1,'#87a0a7');rect(c,x-5,y-32,4,4,'#93aaa8');}
  if(enemy&&facing!=='up'){rect(c,x-5,y-26,11,4,'#6e8290');rect(c,x-2,y-32,7,1,'#c09991');}
  if(role==='elder'||role==='hermit'){rect(c,x-10,y-36,21,3,'#d6b981');rect(c,x-7,y-40,15,5,'#eed3a0');if(facing!=='up'){rect(c,x-2,y-27,5,2,'#eee1c0');rect(c,x-3,y-24,7,3,'#e0d5b3');}}
  if(e.attacking||opts.attacking){const d=facing==='left'?-1:1;rect(c,x+d*16,y-28,2,13,'#cce5df');rect(c,x+d*16-2,y-17,6,2,'#91adb8');rect(c,x+d*16,y-31,2,4,'#f7f0d0');}
  if(enemy&&e.health!=null&&e.health<e.maxHealth){rect(c,x-11,y-49,23,3,'#b4bea1');rect(c,x-11,y-49,Math.round(23*e.health/e.maxHealth),3,'#e6a38e');}
  if(e.pacified){rect(c,x-2,y-48,4,3,'#ffe6a2');rect(c,x-4,y-46,8,1,'#ffe6a2');}
}
export function drawEmberActor(c,e,opts={}){if(e.type==='player'||e.type==='npc'||e.type==='enemy'){character(c,e,opts);return;}const x=Math.round(e.x),y=Math.round(e.y);if(e.type==='chest'){shadow(c,x-16,y-4,33,9);if(e.opened){rect(c,x-13,y-19,26,8,'#c69f6b');rect(c,x-12,y-8,25,9,'#b99566');rect(c,x-10,y-8,20,3,'#e6c28d');}else{rect(c,x-13,y-18,27,19,'#cbab77');rect(c,x+7,y-18,7,19,'#b99967');rect(c,x-13,y-19,27,5,'#e8c892');rect(c,x-13,y-8,27,3,'#ddba82');rect(c,x-2,y-10,5,6,'#eae0ac');scroll(c,x-2,y-20);}return;}if(e.type==='waypoint'){markerStone(c,x,y);rect(c,x-3,y-30,7,4,e.unlocked?'#ffe5a1':'#d7d5b6');return;}if(e.type==='landmark'&&(e.discovered||e.visited)){rect(c,x-2,y-11,5,5,'#ffe9a9');rect(c,x-1,y-15,3,4,'#fff1c6');rect(c,x-4,y-9,9,2,'#fff1c6');}}
export function drawEmberAmbient(c,b,opts={}){const t=opts.time||0;for(let i=0;i<22;i++){const x=b.x+(i*157+t*8)%Math.max(1,b.width),y=b.y+(i*67+Math.sin(t+i)*5)%Math.max(1,b.height);rect(c,x,y,i%3?2:3,1,i%3?'#e5e5af':'#bfd88f');}for(const [x,y]of[[1116,549],[1036,2549],[4428,637]])if(hit(b,{x:x-15,y:y-60,width:40,height:80})){for(let i=0;i<4;i++){const rise=(t*12+i*12)%53;rect(c,x+Math.round(Math.sin(t+i)*4),y-rise,4+i%2*3,4,'#f9efcc');rect(c,x+3+Math.round(Math.sin(t+i)*4),y-rise-3,3,3,'#e0e5c6');}}if(hit(b,{x:2800,y:1000,width:210,height:150}))for(let i=0;i<15;i++){const x=2826+i*11,y=1057+(t*28+i*13)%64;rect(c,x,y,3,3,'#f0f7dc');} }
