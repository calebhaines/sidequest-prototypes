// Mercy Falls, drawn in discrete colour planes. No stroked contours, silhouette
// underpainting, gradients, filters, or antialiased paths. Global world pixels.
const WAKE={ground:'#344c4b',grass:'#3d5650',grassLight:'#547064',soil:'#706758',path:'#565d65',pavement:'#7d8285',curb:'#92918a',line:'#c9b68a',pine:'#355752',pineShade:'#29474b',pineLight:'#56766b',trunk:'#7c6b59',water:'#507d89',waterShade:'#416471',waterLight:'#8cb4bb',wall:'#c8bca5',wallShade:'#a79787',roof:'#9e5652',roofShade:'#7d4e53',roofLight:'#c88067',window:'#ffdba4',windowShade:'#ba9276',amber:'#f0bf83',metal:'#819da0',metalShade:'#5e737d',red:'#c97672',wood:'#a58768',woodShade:'#826e63',cream:'#e7d6b4',carpet:'#7e5258'};
const DREAM={ground:'#3c304a',grass:'#46334f',grassLight:'#68516c',soil:'#7c5967',path:'#604752',pavement:'#8d6b74',curb:'#bc9497',line:'#e2bca6',pine:'#5a3d61',pineShade:'#43314f',pineLight:'#906d87',trunk:'#977785',water:'#936b96',waterShade:'#75567e',waterLight:'#d1a7c0',wall:'#ddc4b7',wallShade:'#b394a4',roof:'#af4763',roofShade:'#913d62',roofLight:'#db788c',window:'#ffe2ae',windowShade:'#d79aa2',amber:'#f3cda2',metal:'#a998b4',metalShade:'#837890',red:'#e3a0a9',wood:'#b4949c',woodShade:'#90738d',cream:'#f1ddbc',carpet:'#a44161'};
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function visible(b,o,pad=0){return o.x+(o.width??o.w??0)+pad>=b.x&&o.y+(o.height??o.h??0)+pad>=b.y&&o.x-pad<=b.x+b.width&&o.y-pad<=b.y+b.height;}
function oval(c,x,y,w,h,color){for(let yy=0;yy<h;yy+=2){const span=Math.sqrt(Math.max(0,1-((yy+1-h/2)/(h/2))**2))*w,ww=Math.max(2,Math.round(span/2)*2);rect(c,x+Math.round((w-ww)/2),y+yy,ww,Math.min(2,h-yy),color);}}
function hash(x,y,salt=0){let n=Math.imul(x+salt*41,374761393)^Math.imul(y+salt*67,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
const FONT={A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['111','010','010','010','010','010','111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','11001','10101','10011','10011','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],'0':['01110','10011','10101','10101','11001','10001','01110'],'1':['010','110','010','010','010','010','111'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['10010','10010','10010','11111','00010','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],'-':['00000','00000','00000','11111','00000','00000','00000'],'.':['0','0','0','0','0','1','1']};
function text(c,value,x,y,color,scale=1){let xx=x;for(const char of value.toUpperCase()){if(char===' '){xx+=4*scale;continue;}const glyph=FONT[char]||FONT['-'];for(let row=0;row<glyph.length;row++)for(let col=0;col<glyph[row].length;col++)if(glyph[row][col]==='1')rect(c,xx+col*scale,y+row*scale,scale,scale,color);xx+=(glyph[0].length+1)*scale;}}

// One connected, generously walkable highway / forest path network.
const ROADS=[
{x:282,y:658,w:1760,h:103,kind:'road'},{x:693,y:256,w:100,h:1305,kind:'road'},
{x:693,y:1530,w:400,h:90,kind:'road'},{x:993,y:1545,w:100,h:480,kind:'road'},
{x:419,y:329,w:90,h:393,kind:'path'},{x:699,y:565,w:741,h:82,kind:'road'},
{x:1205,y:269,w:91,h:421,kind:'path'},{x:1226,y:235,w:147,h:80,kind:'path'},
{x:1820,y:665,w:2550,h:115,kind:'road'},{x:2157,y:629,w:106,h:1736,kind:'road'},
{x:2159,y:767,w:380,h:84,kind:'path'},{x:2283,y:596,w:85,h:209,kind:'path'},
{x:3420,y:710,w:112,h:2170,kind:'road'},{x:3461,y:1115,w:208,h:77,kind:'path'},
{x:4178,y:606,w:105,h:256,kind:'path'},{x:726,y:1875,w:157,h:235,kind:'path'},
{x:801,y:1993,w:1462,h:90,kind:'path'},{x:1237,y:2029,w:100,h:735,kind:'path'},
{x:1277,y:2661,w:369,h:87,kind:'path'},{x:1285,y:2460,w:970,h:92,kind:'path'},
{x:2175,y:2310,w:1270,h:98,kind:'road'},{x:2749,y:2120,w:120,h:306,kind:'pier'},
{x:3310,y:2706,w:419,h:202,kind:'pavement'},{x:3295,y:2830,w:1167,h:103,kind:'road'},
{x:449,y:703,w:84,h:321,kind:'path'},{x:1800,y:752,w:83,h:613,kind:'path'},
];
const CLEARINGS=[
{x:274,y:454,w:362,h:386,kind:'lot'},{x:380,y:180,w:204,h:243,kind:'gravel'},
{x:858,y:332,w:356,h:359,kind:'theater'},{x:1166,y:622,w:345,h:303,kind:'lot'},
{x:1138,y:206,w:318,h:260,kind:'grove'},{x:2112,y:326,w:655,h:598,kind:'mill'},
{x:3296,y:902,w:487,h:542,kind:'observatory'},{x:3990,y:337,w:540,h:610,kind:'broadcast'},
{x:560,y:1630,w:435,h:514,kind:'chapel'},{x:1070,y:2358,w:773,h:635,kind:'orchard'},
{x:2444,y:1950,w:937,h:512,kind:'marsh'},{x:3075,y:2450,w:1070,h:660,kind:'station'},
{x:1685,y:1224,w:340,h:238,kind:'deputy'},
];
const STRUCTURES=[
{id:'diner',x:319,y:474,w:270,h:177,kind:'diner'},{id:'telephone',x:409,y:193,w:112,h:98,kind:'phone'},
{id:'theater',x:903,y:335,w:274,h:248,kind:'theater'},{id:'motel',x:1178,y:626,w:303,h:128,kind:'motel'},
{id:'laundry',x:925,y:847,w:161,h:138,kind:'laundry'},{id:'cabin-west',x:299,y:932,w:120,h:109,kind:'cabin'},
{id:'cabin-east',x:1380,y:968,w:129,h:110,kind:'cabin'},{id:'mill',x:2152,y:374,w:389,h:210,kind:'mill'},
{id:'mill-tower',x:2580,y:387,w:110,h:222,kind:'tower'},{id:'mill-shed',x:2532,y:744,w:143,h:118,kind:'shed'},
{id:'observatory',x:3466,y:929,w:239,h:182,kind:'observatory'},{id:'observatory-cabin',x:3297,y:1072,w:104,h:135,kind:'cabin'},
{id:'relay',x:4144,y:416,w:197,h:198,kind:'relay'},{id:'radio-shack',x:4004,y:792,w:141,h:116,kind:'radio'},
{id:'chapel',x:663,y:1662,w:290,h:209,kind:'chapel'},{id:'chapel-shed',x:557,y:1891,w:101,h:99,kind:'shed'},
{id:'orchard-house',x:1110,y:2576,w:169,h:145,kind:'abandoned'},{id:'orchard-shed',x:1655,y:2396,w:106,h:108,kind:'shed'},
{id:'ferry-office',x:3034,y:2294,w:142,h:122,kind:'ferry'},{id:'station',x:3212,y:2463,w:654,h:244,kind:'station'},
{id:'signalbox',x:3910,y:2657,w:128,h:154,kind:'signalbox'},{id:'deputy-cabin',x:1711,y:1184,w:187,h:123,kind:'deputy'},
];
const WATER=[
{x:1946,y:212,w:104,h:220},{x:1946,y:528,w:104,h:102},
{x:3710,y:1042,w:590,h:85},{x:3670,y:1127,w:712,h:212},{x:3780,y:1339,w:563,h:145},{x:3832,y:1484,w:378,h:56},
{x:2560,y:2068,w:174,h:160},{x:2908,y:2068,w:324,h:160},{x:2468,y:2132,w:92,h:80},{x:3128,y:1994,w:148,h:74},
{x:1430,y:2508,w:140,h:88},{x:1608,y:2558,w:144,h:93},{x:1372,y:2794,w:187,h:67},{x:1662,y:2736,w:106,h:107},
];
const BUILDING_COLLISIONS=STRUCTURES.flatMap(s=>s.kind==='theater'?[{x:s.x+10,y:s.y+56,width:s.w-20,height:37},{x:s.x+10,y:s.y+93,width:21,height:135},{x:s.x+s.w-31,y:s.y+93,width:21,height:135}]:[{x:s.x+7,y:s.y+Math.min(60,Math.round(s.h/3)),width:s.w-14,height:s.h-Math.min(60,Math.round(s.h/3))-8}]);
export const VELVET_OBSTACLES=[...BUILDING_COLLISIONS,...WATER.map(w=>({x:w.x+3,y:w.y+3,width:w.w-6,height:w.h-6}))];
const SAFE_POINTS=[
[742,704],[730,704],[466,697],[1058,625],[1240,790],[462,365],[1260,372],[1040,500],[465,320],[1330,270],[350,725],[1400,855],
[2310,620],[3600,1160],[3470,2750],[4250,680],[1600,2700],[810,1900],[2830,2170],[2240,750],[1800,1340],[3530,1220],[3370,2790],[1300,2500],[4230,790],[825,1970],[2850,2260],
[2210,820],[3480,1320],[840,2040],[2800,2350],[3360,2870],[2440,860],[3720,1400],[965,2110],[1810,2820],[2950,2365],[3640,2910],
];
function plantSafe(x,y){if(SAFE_POINTS.some(([px,py])=>Math.abs(px-x)<70&&Math.abs(py-y)<82))return false;if(ROADS.some(r=>x>r.x-22&&x<r.x+r.w+22&&y>r.y-6&&y<r.y+r.h+69))return false;if(CLEARINGS.some(r=>x>r.x-10&&x<r.x+r.w+10&&y>r.y-5&&y<r.y+r.h+40))return false;if(WATER.some(r=>x>r.x-28&&x<r.x+r.w+28&&y>r.y-3&&y<r.y+r.h+72))return false;return true;}

function pine(c,x,y,p,size=1,variant=0){
  x=Math.round(x);y=Math.round(y);const s=size,h=Math.round(70*s),w=Math.round(48*s);
  rect(c,x-3*s,y-17*s,6*s,17*s,p.trunk);rect(c,x-2*s,y-12*s,2*s,12*s,p.wood);
  // Contiguous branches are large palette masses, rather than contour rings.
  for(let i=0;i<5;i++){const yy=y-h+i*10*s,ww=(12+i*8)*s;rect(c,x-ww/2,yy,ww,14*s,i<2?p.pineLight:p.pine);rect(c,x+ww/2-ww*.36,yy+5*s,ww*.36,12*s,p.pineShade);rect(c,x-ww/2,yy+12*s,ww+6*s,5*s,p.pine);}
  rect(c,x-3*s,y-h-4*s,6*s,7*s,p.pineLight);
  if(variant%3===0){rect(c,x-w*.25,y-h+22*s,w*.2,3*s,p.pineLight);rect(c,x-w*.3,y-h+42*s,w*.25,3*s,p.pineLight);}
}
function bareTree(c,x,y,p,fruit=false){rect(c,x-4,y-60,8,61,p.woodShade);rect(c,x-4,y-55,3,54,p.wood);for(const[xx,yy,w,h]of[[-22,-50,20,5],[-27,-63,5,16],[2,-39,23,5],[20,-54,5,19],[-15,-78,5,28],[-15,-81,18,5],[9,-73,5,29]])rect(c,x+xx,y+yy,w,h,p.woodShade);if(fruit)for(const[xx,yy]of[[-23,-49],[18,-41],[9,-70],[-12,-77]]){rect(c,x+xx,y+yy,6,6,p.red);rect(c,x+xx,y+yy,2,2,p.roofLight);}}
function bush(c,x,y,p,dream=false){rect(c,x-11,y-8,21,8,p.grassLight);rect(c,x-7,y-13,12,7,p.pineLight);rect(c,x+4,y-7,8,7,p.pine);if(dream){rect(c,x-5,y-10,2,2,p.red);rect(c,x+6,y-5,2,2,p.red);}}
function lamp(c,x,y,p,lit=true){rect(c,x-1,y-40,3,40,p.metalShade);rect(c,x-1,y-41,12,3,p.metal);rect(c,x+7,y-40,7,6,lit?p.amber:p.metal);if(lit){rect(c,x+8,y-39,4,3,p.cream);rect(c,x-12,y+2,35,3,p.soil);}}
function bench(c,x,y,p){rect(c,x-21,y-18,44,5,p.wood);rect(c,x-21,y-10,44,6,p.woodShade);rect(c,x-18,y-5,4,8,p.metalShade);rect(c,x+15,y-5,4,8,p.metalShade);rect(c,x-20,y-10,41,2,p.wood);}
function fence(c,x,y,w,p){rect(c,x,y-18,w,3,p.wood);rect(c,x,y-8,w,3,p.woodShade);for(let xx=x;xx<x+w;xx+=22)rect(c,xx,y-25,4,28,p.wood);}
function car(c,x,y,p,color='#9a6559'){rect(c,x-13,y-19,5,23,p.metalShade);rect(c,x+9,y-19,5,23,p.metalShade);rect(c,x-14,y-21,29,22,color);rect(c,x-10,y-27,21,10,color);rect(c,x-9,y-25,19,7,p.waterShade);rect(c,x-10,y-3,21,3,p.metal);rect(c,x-12,y-18,3,4,p.cream);rect(c,x+9,y-18,3,4,p.cream);rect(c,x-4,y-16,9,12,color);rect(c,x-3,y-16,3,10,p.roofLight);}
function sign(c,label,x,y,p,w=100,color=p.roof){rect(c,x+6,y+19,3,20,p.woodShade);rect(c,x+w-10,y+19,3,20,p.woodShade);rect(c,x,y,w,24,color);text(c,label,x+7,y+8,p.cream,1);}
function crate(c,x,y,p,w=24,h=20){rect(c,x,y-h,w,h,p.wood);rect(c,x+w-6,y-h,6,h,p.woodShade);rect(c,x+4,y-h+4,w-10,3,p.cream);rect(c,x+4,y-7,w-10,2,p.woodShade);}
function barrel(c,x,y,p){rect(c,x-8,y-24,17,24,p.metalShade);rect(c,x-7,y-23,11,21,p.metal);rect(c,x-8,y-18,17,2,p.windowShade);rect(c,x-8,y-7,17,2,p.windowShade);}
function gear(c,x,y,p,size=34){oval(c,x-size/2,y-size/2,size,size,p.metal);rect(c,x-5,y-5,10,10,p.metalShade);for(const[dx,dy]of[[-3,-size/2-4],[-3,size/2-1],[-size/2-4,-3],[size/2-1,-3]])rect(c,x+dx,y+dy,7,7,p.metal);rect(c,x-2,y-2,4,4,p.cream);}
function window(c,x,y,w,h,p,cold=false){rect(c,x,y,w,h,cold?p.water:p.window);rect(c,x,y,w,3,cold?p.waterLight:p.cream);rect(c,x+Math.floor(w/2),y,2,h,p.windowShade);rect(c,x,y+Math.floor(h/2),w,2,p.windowShade);rect(c,x+3,y+4,3,Math.max(4,h-8),cold?p.waterLight:p.amber);}
function pitchedRoof(c,x,y,w,h,p,color=p.roof){for(let yy=0;yy<h;yy+=4){const inset=Math.max(0,Math.round((h-yy)*.68/2)*2);rect(c,x+inset,y+yy,w-inset*2,4,color);}rect(c,x+Math.round(h*.68),y,w-Math.round(h*1.36),4,p.roofLight);for(let yy=10;yy<h;yy+=14)rect(c,x+Math.round((h-yy)*.68),y+yy,w-Math.round((h-yy)*1.36),2,p.roofShade);rect(c,x,y+h,w,6,p.roofShade);}
function house(c,s,p,dream){
  const{x,y,w,h}=s,roofH=Math.min(62,Math.round(h*.35)),bodyY=y+roofH;
  rect(c,x+7,bodyY,w-14,h-roofH,p.wall);rect(c,x+w-34,bodyY,27,h-roofH,p.wallShade);rect(c,x+13,y+h-9,w-26,9,p.woodShade);pitchedRoof(c,x,y,w,roofH,p);
  const winY=bodyY+19;window(c,x+23,winY,25,25,p,s.kind==='abandoned');if(w>145)window(c,x+w-64,winY,29,25,p,s.kind==='abandoned');
  const dx=x+Math.round(w/2)-10;rect(c,dx,y+h-44,21,35,p.woodShade);rect(c,dx+2,y+h-41,15,29,p.wood);rect(c,dx+15,y+h-27,2,3,p.amber);rect(c,dx-4,y+h-9,30,5,p.pavement);
  if(s.kind==='abandoned'){rect(c,x+21,winY+10,31,5,p.wood);rect(c,x+23,winY+18,25,4,p.woodShade);rect(c,x+w-67,winY+5,33,5,p.woodShade);rect(c,dx,y+h-36,20,5,p.woodShade);for(let i=0;i<5;i++)rect(c,x+18+i*25,y+h+3,12,3,p.grassLight);}
  if(s.kind==='laundry'){rect(c,x+18,bodyY+4,w-54,17,p.cream);text(c,'LAUNDRY',x+33,bodyY+9,p.roofShade);for(let i=0;i<3;i++){oval(c,x+26+i*34,bodyY+35,23,23,p.metal);oval(c,x+30+i*34,bodyY+39,15,15,p.waterShade);}}
  if(s.kind==='radio'){text(c,'ON AIR',x+34,bodyY+7,p.cream);rect(c,x+w-23,y-24,3,36,p.metal);rect(c,x+w-41,y-21,38,2,p.metal);rect(c,x+w-23,y-28,4,4,p.red);}
  if(s.kind==='ferry')text(c,'TICKETS',x+37,bodyY+7,p.roofShade);if(s.kind==='deputy')text(c,'COUNTY',x+30,bodyY+8,p.roofShade);if(dream&&s.kind==='abandoned')window(c,dx+3,y+h-35,15,20,p);
}
function diner(c,s,p,dream){
  const{x,y,w,h}=s;rect(c,x+8,y+53,w-16,h-53,p.wall);rect(c,x+8,y+h-25,w-16,25,p.roofShade);rect(c,x,y+32,w,36,p.metal);rect(c,x+6,y+32,w-12,8,p.cream);rect(c,x+14,y+25,w-28,8,p.metalShade);rect(c,x+42,y-8,w-84,32,p.roof);text(c,'MERCY DINER',x+56,y+2,p.cream,2);
  for(let xx=x+15;xx<x+w-22;xx+=34){window(c,xx,y+81,26,42,p);rect(c,xx+2,y+110,22,5,p.roofLight);rect(c,xx+3,y+115,4,5,p.woodShade);}
  rect(c,x+124,y+77,25,69,p.metalShade);rect(c,x+127,y+82,19,47,p.window);rect(c,x+129,y+106,16,3,p.cream);rect(c,x+127,y+133,19,14,p.metal);
  rect(c,x-2,y+61,w+4,17,p.cream);for(let xx=x-2;xx<x+w;xx+=24)rect(c,xx,y+61,12,17,p.roofLight);
  rect(c,x+27,y+h+8,53,9,p.wood);rect(c,x+160,y+h+8,57,9,p.wood);text(c,'OPEN',x+27,y+91,p.roofShade);
  if(dream){rect(c,x+220,y+98,14,23,p.roofShade);rect(c,x+224,y+92,7,9,p.windowShade);}
}
function theater(c,s,p,dream){
  const{x,y,w,h}=s;rect(c,x+16,y+62,w-32,h-62,p.carpet);rect(c,x+31,y+145,w-62,65,dream?p.cream:p.pavement);
  if(dream)for(let row=0;row<6;row++)for(let col=0;col<9;col++){const xx=x+32+col*23,yy=y+146+row*10;rect(c,xx,yy,12,4,p.roofShade);rect(c,xx+10,yy+4,12,4,p.roofShade);}
  rect(c,x+22,y+85,w-44,52,p.roofShade);for(let xx=x+22;xx<x+w-22;xx+=18){rect(c,xx,y+79,12,67,p.roof);rect(c,xx+3,y+80,4,64,p.roofLight);}
  rect(c,x+64,y+91,w-128,50,dream?'#663346':p.woodShade);rect(c,x+66,y+139,w-132,9,p.roofLight);
  rect(c,x+3,y+69,22,h-80,p.wallShade);rect(c,x+w-25,y+69,22,h-80,p.wallShade);rect(c,x+3,y+73,6,h-88,p.wall);rect(c,x+w-25,y+73,6,h-88,p.wall);
  pitchedRoof(c,x,y,w,61,p);rect(c,x+45,y+55,w-90,26,p.wall);text(c,dream?'THE ROOM':'VALE THEATER',x+(dream?85:57),y+62,p.roofShade,2);rect(c,x+7,y+h-17,18,12,p.metal);rect(c,x+w-25,y+h-17,18,12,p.metal);rect(c,x+40,y+h-6,w-80,7,p.wood);
  for(const[xx,yy]of[[x+48,y+192],[x+w-66,y+192]]){rect(c,xx,yy,18,15,p.roofLight);rect(c,xx+3,yy+13,12,12,p.roofShade);}
}
function motel(c,s,p,dream){
  const{x,y,w,h}=s;rect(c,x+6,y+47,w-12,h-47,p.wall);rect(c,x+6,y+h-18,w-12,18,p.pavement);pitchedRoof(c,x,y,w,44,p);
  for(let i=0;i<6;i++){const xx=x+17+i*46;rect(c,xx,y+73,18,46,p.woodShade);rect(c,xx+2,y+76,14,18,p.water);rect(c,xx+2,y+109,14,9,p.wood);text(c,String(i+1),xx+6,y+61,p.roofShade);if(i<5)window(c,xx+23,y+80,15,24,p);}
  rect(c,x+15,y+122,w-30,8,p.wood);const sx=x+w+24,sy=y+12;rect(c,sx+11,sy+28,4,97,p.metalShade);rect(c,sx,sy,28,68,p.roof);text(c,'M',sx+8,sy+5,p.cream,2);text(c,'O',sx+8,sy+23,p.cream,2);text(c,'T',sx+8,sy+41,p.cream,2);text(c,dream?'NO VACANCY':'VACANCY',x+85,y+h+24,p.amber);
}
function phone(c,s,p){const{x,y,w,h}=s;rect(c,x+6,y+27,w-12,h-27,p.wallShade);rect(c,x+7,y+27,20,h-27,p.wall);pitchedRoof(c,x,y,w,28,p);window(c,x+30,y+44,49,33,p,true);rect(c,x+42,y+42,20,48,p.metalShade);rect(c,x+45,y+48,14,23,p.metal);rect(c,x+47,y+54,10,2,p.cream);rect(c,x+46,y+64,13,8,p.woodShade);rect(c,x+34,y+59,6,18,p.roofShade);rect(c,x+36,y+58,11,3,p.roofShade);rect(c,x+20,y+95,73,7,p.wood);text(c,'TELEPHONE',x+17,y+32,p.cream);}
function mill(c,s,p,dream){
  const{x,y,w,h}=s;rect(c,x+8,y+56,w-16,h-56,p.wallShade);rect(c,x+8,y+56,w-73,h-56,p.wall);
  for(let yy=y+65;yy<y+h-13;yy+=12)for(let xx=x+12+(Math.floor(yy/12)%2)*15;xx<x+w-18;xx+=33)rect(c,xx,yy,26,2,p.windowShade);
  pitchedRoof(c,x,y,w,54,p,p.metalShade);for(let i=0;i<7;i++)window(c,x+26+i*48,y+82,25,43,p,true);
  rect(c,x+145,y+h-70,92,62,p.woodShade);rect(c,x+151,y+h-63,38,49,p.wood);rect(c,x+194,y+h-63,38,49,p.wood);rect(c,x+192,y+h-68,3,60,p.metal);rect(c,x+80,y+47,226,22,p.metal);text(c,'MERCY PAPER CO.',x+106,y+54,p.cream,2);
  rect(c,x+48,y-61,38,76,p.wallShade);rect(c,x+48,y-61,11,73,p.wall);rect(c,x+44,y-64,46,7,p.metalShade);rect(c,x+w-68,y-34,27,46,p.wallShade);rect(c,x+w-68,y-34,7,43,p.wall);
  if(dream){window(c,x+159,y+h-60,64,43,p);text(c,'SHIFT 3',x+161,y+h-54,p.roofShade);}
}
function tower(c,s,p){const{x,y,w,h}=s;rect(c,x+11,y+53,w-22,h-53,p.wallShade);rect(c,x+11,y+53,23,h-53,p.wall);pitchedRoof(c,x,y,w,51,p,p.metalShade);for(let yy=y+71;yy<y+h-25;yy+=40)window(c,x+34,yy,34,21,p,true);rect(c,x+w-19,y+51,3,h-41,p.metal);for(let yy=y+62;yy<y+h;yy+=14)rect(c,x+w-25,yy,14,2,p.metal);}
function observatory(c,s,p,dream){
  const{x,y,w,h}=s;rect(c,x+9,y+87,w-18,h-87,p.wall);rect(c,x+w-45,y+87,35,h-87,p.wallShade);oval(c,x+8,y+11,w-16,139,p.metalShade);oval(c,x+8,y+11,w-38,139,p.metal);rect(c,x+16,y+83,w-32,40,p.metal);
  for(let yy=25;yy<111;yy+=12)rect(c,x+103,y+yy,12,11,p.metalShade);rect(c,x+102,y+41,17,62,dream?p.window:p.waterShade);rect(c,x+101,y+39,21,4,p.cream);rect(c,x+120,y+40,67,9,p.metalShade);rect(c,x+181,y+39,10,12,p.cream);
  window(c,x+31,y+132,33,25,p);window(c,x+w-71,y+132,32,25,p);rect(c,x+97,y+133,36,40,p.woodShade);rect(c,x+100,y+136,30,30,p.metal);rect(c,x+87,y+h-8,59,8,p.pavement);text(c,'THE NIGHT OFFICE',x+24,y+116,p.roofShade);
  if(dream){oval(c,x+142,y-67,46,46,p.cream);oval(c,x+160,y-73,34,40,p.ground);rect(c,x+69,y+94,4,4,p.window);rect(c,x+153,y+103,3,3,p.window);}
}
function relay(c,s,p){
  const{x,y,w}=s;house(c,{...s,kind:'cabin'},p,false);text(c,'MERCY AM',x+43,y+67,p.cream,2);const tx=x+w+62,ty=y+22;rect(c,tx-4,ty-117,8,274,p.metalShade);rect(c,tx-4,ty-117,3,274,p.metal);
  for(let i=0;i<7;i++){const yy=ty-105+i*32;rect(c,tx-40+i*3,yy,80-i*6,4,p.metal);rect(c,tx-35+i*3,yy+4,4,27,p.metalShade);rect(c,tx+31-i*3,yy+4,4,27,p.metalShade);}
  rect(c,tx-4,ty-122,8,8,p.red);oval(c,x+15,y-32,52,44,p.metal);rect(c,x+28,y-8,42,8,p.metalShade);rect(c,x+48,y-7,6,27,p.metal);rect(c,x+50,y-33,4,24,p.cream);
}
function chapel(c,s,p,dream){
  const{x,y,w,h}=s;house(c,{...s,kind:'cabin'},p,dream);const tx=x+112;rect(c,tx,y-49,61,104,p.wall);rect(c,tx+45,y-49,16,104,p.wallShade);pitchedRoof(c,tx-9,y-89,80,40,p);rect(c,tx+28,y-116,5,40,p.wood);rect(c,tx+16,y-105,28,4,p.wood);window(c,tx+16,y-29,28,36,p);rect(c,tx+21,y-19,18,22,p.roofLight);rect(c,tx+25,y-17,4,18,p.cream);rect(c,tx+19,y-10,17,4,p.cream);text(c,'COME AS YOU ARE',x+65,y+94,p.roofShade);if(dream)for(let i=0;i<7;i++)rect(c,x+30+i*32,y+h+7,4,10,p.amber);
}
function station(c,s,p,dream){
  const{x,y,w,h}=s;rect(c,x+13,y+81,w-26,h-81,p.wall);rect(c,x+w-64,y+81,51,h-81,p.wallShade);pitchedRoof(c,x,y,w,79,p,p.metalShade);rect(c,x+w/2-39,y+2,78,113,p.wall);pitchedRoof(c,x+w/2-44,y-22,88,34,p,p.roof);oval(c,x+w/2-25,y+26,50,50,p.cream);oval(c,x+w/2-20,y+31,40,40,p.windowShade);rect(c,x+w/2-1,y+39,3,16,p.cream);rect(c,x+w/2-1,y+52,13,3,p.cream);
  for(let i=0;i<8;i++)window(c,x+33+i*74,y+118,39,54,p,i%3===0);rect(c,x+232,y+h-73,121,65,p.woodShade);window(c,x+239,y+h-65,50,55,p);window(c,x+297,y+h-65,49,55,p);rect(c,x-29,y+h-15,w+58,19,p.metal);rect(c,x-30,y+h-4,w+60,6,p.pavement);rect(c,x+178,y+99,289,19,p.cream);text(c,'MERCY FALLS TERMINAL',x+191,y+104,p.roofShade,2);for(let xx=x-16;xx<x+w+25;xx+=88)rect(c,xx,y+h-12,6,34,p.metalShade);if(dream)text(c,'ARRIVING YESTERDAY',x+438,y+h+38,p.amber);
}
function signalbox(c,s,p){house(c,s,p,false);for(let i=0;i<3;i++)window(c,s.x+18+i*31,s.y+73,23,29,p);rect(c,s.x-30,s.y+s.h-60,29,6,p.wood);for(let i=0;i<5;i++)rect(c,s.x-29+i*5,s.y+s.h-47+i*8,8,5,p.wood);}
function drawStructure(c,s,p,dream){if(s.kind==='diner')diner(c,s,p,dream);else if(s.kind==='theater')theater(c,s,p,dream);else if(s.kind==='motel')motel(c,s,p,dream);else if(s.kind==='phone')phone(c,s,p);else if(s.kind==='mill')mill(c,s,p,dream);else if(s.kind==='tower')tower(c,s,p);else if(s.kind==='observatory')observatory(c,s,p,dream);else if(s.kind==='relay')relay(c,s,p);else if(s.kind==='chapel')chapel(c,s,p,dream);else if(s.kind==='station')station(c,s,p,dream);else if(s.kind==='signalbox')signalbox(c,s,p);else house(c,s,p,dream);}

function ground(c,b,p,dream){
  rect(c,b.x,b.y,b.width,b.height,p.ground);
  for(const r of CLEARINGS)if(visible(b,r,24)){let color=p.grass;if(['lot','station','observatory'].includes(r.kind))color=p.pavement;else if(['mill','gravel','chapel','deputy','broadcast'].includes(r.kind))color=p.soil;else if(r.kind==='theater')color=p.grassLight;else if(r.kind==='orchard')color=dream?'#705068':'#68674e';else if(r.kind==='marsh')color=dream?'#67556e':'#586a62';rect(c,r.x,r.y,r.w,r.h,color);rect(c,r.x+24,r.y-12,r.w-48,12,color);rect(c,r.x-14,r.y+27,14,r.h-54,color);}
  const step=40,xx=Math.floor(b.x/step)*step,yy=Math.floor(b.y/step)*step;
  for(let y=yy;y<b.y+b.height+step;y+=step)for(let x=xx;x<b.x+b.width+step;x+=step){const n=hash(x,y);if(n>.66){const tx=x+Math.floor(hash(x,y,1)*20),ty=y+Math.floor(hash(x,y,2)*22);if(ROADS.some(r=>tx>=r.x&&tx<r.x+r.w&&ty>=r.y&&ty<r.y+r.h))continue;rect(c,tx,ty,7,2,p.grass);rect(c,tx+2,ty-3,2,4,p.grassLight);if(n>.86)rect(c,tx+11,ty+7,4,2,p.grassLight);}}
}
function roads(c,b,p){
  for(const r of ROADS)if(visible(b,r)){rect(c,r.x,r.y,r.w,r.h,r.kind==='road'?p.path:r.kind==='pavement'?p.pavement:r.kind==='pier'?p.wood:p.soil);if(r.kind==='road'){if(r.w>r.h){rect(c,r.x,r.y+7,r.w,3,p.pavement);for(let x=r.x+19;x<r.x+r.w-16;x+=65)if(x>=b.x-40&&x<b.x+b.width+40)rect(c,x,r.y+Math.round(r.h/2),29,3,p.line);}else{rect(c,r.x+7,r.y,3,r.h,p.pavement);for(let y=r.y+15;y<r.y+r.h-20;y+=65)if(y>=b.y-40&&y<b.y+b.height+40)rect(c,r.x+Math.round(r.w/2),y,3,29,p.line);}}else if(r.kind==='pier')for(let y=r.y+5;y<r.y+r.h;y+=14)rect(c,r.x+5,y,r.w-10,3,p.woodShade);}
  for(const[x,y,w]of[[639,681,44],[1370,690,42],[3475,1310,43],[3340,2806,59]])if(visible(b,{x,y,w,h:31}))for(let i=0;i<4;i++)rect(c,x,y+i*8,w,4,p.cream);
}
function waters(c,b,p,dream){
  for(const w of WATER)if(visible(b,w)){rect(c,w.x,w.y,w.w,w.h,p.water);rect(c,w.x+17,w.y+18,w.w-39,Math.max(10,w.h-42),p.waterShade);const minX=Math.max(w.x+6,b.x-25),minY=Math.max(w.y+10,b.y-10);for(let y=Math.floor(minY/25)*25;y<Math.min(w.y+w.h-6,b.y+b.height+10);y+=25)for(let x=Math.floor(minX/73)*73;x<Math.min(w.x+w.w-10,b.x+b.width+30);x+=73){const xx=x+Math.floor(hash(x,y,5)*22);if(xx>w.x+5)rect(c,xx,y,13+Math.floor(hash(x,y,3)*16),2,p.waterLight);}}
  if(visible(b,{x:1884,y:432,w:215,h:96})){rect(c,1890,436,214,88,p.wood);for(let x=1894;x<2104;x+=14)rect(c,x,442,3,76,p.woodShade);rect(c,1891,432,212,5,p.woodShade);rect(c,1891,523,212,5,p.woodShade);for(let x=1894;x<2104;x+=37){rect(c,x,424,5,18,p.wood);rect(c,x,514,5,18,p.wood);}}
  if(visible(b,{x:3640,y:1190,w:490,h:354})){rect(c,3635,1380,222,63,p.wood);for(let x=3641;x<3851;x+=17)rect(c,x,1384,3,52,p.woodShade);oval(c,3851,1397,76,26,p.wood);rect(c,3864,1403,53,11,p.woodShade);rect(c,3867,1396,4,25,p.cream);rect(c,3899,1396,4,25,p.cream);for(let i=0;i<19;i++){const x=3721+i*29,y=1478+Math.floor(hash(i,3)*25);rect(c,x,y-15,3,19,p.grassLight);rect(c,x+5,y-9,3,12,p.grass);}}
  if(dream&&visible(b,{x:3900,y:1150,w:210,h:170})){rect(c,3991,1170,8,82,p.cream);rect(c,3962,1200,66,7,p.cream);rect(c,3991,1263,8,11,p.waterLight);rect(c,3981,1284,28,3,p.waterLight);}
}

function districtDetails(c,b,p,dream){
  if(visible(b,{x:260,y:452,w:1310,h:650})){
    for(const[x,y]of[[302,685],[302,739],[533,714],[1358,812]])car(c,x,y,p,y===739?p.metal:'#9c6a5d');for(let i=0;i<5;i++)rect(c,316+i*51,758,32,3,p.line);
    for(const[x,y]of[[391,670],[559,670],[1187,795],[970,827]])bench(c,x,y,p);for(const[x,y]of[[596,663],[845,649],[1126,643],[1490,818],[449,386]])lamp(c,x,y,p);
    sign(c,'MERCY FALLS',610,939,p,147,p.metalShade);for(let i=0;i<3;i++)crate(c,597,572+i*23,p,23,18);for(const[x,y,w]of[[362,769,76],[890,774,118],[1333,899,67]])rect(c,x,y,w,4,p.waterShade);fence(c,324,881,237,p);fence(c,928,1013,211,p);
    rect(c,974,787,14,25,p.wallShade);rect(c,976,790,9,16,p.window);text(c,dream?'3.17':'11.43',950,774,p.amber);
  }
  if(visible(b,{x:1188,y:208,w:235,h:254})){
    for(const[x,y,s]of[[1173,339,1.35],[1400,303,1.5],[1389,433,1.2],[1191,252,1.1]])pine(c,x,y,p,s,3);for(const[x,y]of[[1310,308],[1355,312],[1348,241]]){rect(c,x,y,12,15,p.metal);rect(c,x+2,y-3,8,4,p.metal);rect(c,x+3,y+4,7,2,p.cream);}if(dream){rect(c,1302,252,67,3,p.red);rect(c,1342,254,3,53,p.red);rect(c,1301,269,6,6,p.amber);}
  }
  if(visible(b,{x:2044,y:327,w:787,h:606})){
    for(const[x,y]of[[2395,686],[2475,684],[2520,644]]){gear(c,x,y,p,38);rect(c,x-23,y+23,48,7,p.metalShade);}
    for(let i=0;i<4;i++){oval(c,2597,621+i*26,43,22,p.cream);rect(c,2601,628+i*26,35,15,p.windowShade);rect(c,2603,628+i*26,29,3,p.cream);}
    rect(c,2143,309,404,7,p.metal);rect(c,2143,309,8,93,p.metalShade);rect(c,2539,309,8,94,p.metalShade);rect(c,2455,309,4,68,p.metalShade);rect(c,2447,369,18,9,p.metal);
    for(const[x,y]of[[2113,647],[2137,665],[2366,866],[2393,866],[2421,866]])crate(c,x,y,p,26,23);for(const[x,y]of[[2666,625],[2693,625],[2666,655]])barrel(c,x,y,p);rect(c,2090,521,64,14,p.metal);rect(c,2088,517,8,21,p.metalShade);
    sign(c,'NO NIGHT SHIFT',2306,889,p,133,p.roofShade);lamp(c,2110,764,p);lamp(c,2491,817,p);bench(c,2187,788,p);oval(c,2062,525,75,75,p.wood);rect(c,2101,533,13,56,p.woodShade);rect(c,2066,557,64,6,p.cream);rect(c,2095,532,6,62,p.cream);rect(c,2092,555,12,12,p.metalShade);
  }
  if(visible(b,{x:3260,y:904,w:614,h:583})){
    for(const[x,y]of[[3366,1290],[3610,1287],[3520,1365]])bench(c,x,y,p);lamp(c,3440,1272,p);lamp(c,3582,1148,p);sign(c,'NIGHT OFFICE',3350,1426,p,133,p.metalShade);rect(c,3594,1112,8,28,p.metal);rect(c,3581,1108,48,8,p.metalShade);rect(c,3582,1107,37,5,p.metal);rect(c,3625,1105,6,13,p.cream);rect(c,3585,1135,4,15,p.metalShade);rect(c,3608,1135,4,15,p.metalShade);for(const[x,y]of[[3372,973],[3748,979],[3676,1255]])bush(c,x,y,p,dream);rect(c,3567,1436,53,5,p.woodShade);text(c,'LOW TIDE',3570,1451,p.cream);
  }
  if(visible(b,{x:3970,y:331,w:613,h:678})){
    for(let i=0;i<5;i++){const x=4007+i*75;rect(c,x,332,5,69,p.metalShade);rect(c,x-20,339,45,4,p.metal);rect(c,x-10,326,4,28,p.metal);rect(c,x+10,326,4,28,p.metal);}for(const[x,y]of[[4383,774],[4411,774],[4439,774]])barrel(c,x,y,p);rect(c,4370,819,106,31,p.metalShade);rect(c,4380,826,18,14,p.windowShade);for(let i=0;i<7;i++)rect(c,4408+i*8,830,4,10,p.metal);sign(c,'MERCY AM 1310',4119,930,p,147,p.roofShade);lamp(c,4193,801,p);bench(c,4282,857,p);rect(c,4475,672,27,29,p.wallShade);rect(c,4480,679,18,5,p.red);text(c,dream?'WAIT':'LIVE',4213,647,p.amber);
  }
  if(visible(b,{x:419,y:1570,w:666,h:632})){
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){const x=422+col*38,y=1750+row*57;oval(c,x,y-10,19,15,p.metal);rect(c,x,y,19,23,p.metal);rect(c,x+4,y+6,11,2,p.cream);rect(c,x-4,y+26,27,4,p.soil);}fence(c,419,1975,146,p);bench(c,732,1978,p);bench(c,912,1993,p);lamp(c,881,1928,p);sign(c,'OPEN TO ALL',680,2071,p,120,p.woodShade);rect(c,974,1762,14,23,p.metalShade);rect(c,976,1765,10,16,p.windowShade);for(let i=0;i<5;i++){const x=594+i*19;rect(c,x,2088,4,12,p.grassLight);rect(c,x-2,2082,8,6,p.cream);}
  }
  if(visible(b,{x:1060,y:2340,w:830,h:685})){
    for(let row=0;row<4;row++)for(let col=0;col<6;col++){const x=1120+col*121+(row%2)*14,y=2430+row*146;if(SAFE_POINTS.some(([px,py])=>Math.hypot(x-px,y-py)<91)||ROADS.some(r=>x>r.x-30&&x<r.x+r.w+30&&y>r.y-5&&y<r.y+r.h+95))continue;bareTree(c,x,y,p,dream);rect(c,x-17,y+9,41,3,p.waterShade);}
    rect(c,1441,2909,93,12,p.wood);rect(c,1448,2921,5,16,p.woodShade);rect(c,1514,2921,5,16,p.woodShade);for(let i=0;i<3;i++)crate(c,1453+i*24,2908,p,18,13);sign(c,'FENN ORCHARD',1119,2869,p,141,p.woodShade);bench(c,1359,2595,p);lamp(c,1560,2678,p,dream);crate(c,1633,2910,p,29,22);rect(c,1569,2650,5,53,p.wood);rect(c,1631,2650,5,53,p.wood);rect(c,1569,2648,67,6,p.wood);rect(c,1571,2656,63,3,p.roofLight);
  }
  if(visible(b,{x:2425,y:1930,w:978,h:577})){
    // Sunken hull beside a broad dry jetty: the interaction remains accessible.
    rect(c,2755,2022,139,324,p.wood);for(let y=2030;y<2341;y+=14)rect(c,2761,y,127,3,p.woodShade);for(let y=2040;y<2330;y+=49){rect(c,2752,y,6,22,p.woodShade);rect(c,2893,y,6,22,p.woodShade);}oval(c,2630,2077,105,116,p.woodShade);rect(c,2643,2096,68,73,p.roofShade);rect(c,2652,2108,59,39,p.wallShade);window(c,2662,2115,31,19,p,true);rect(c,2640,2180,98,7,p.metal);rect(c,2720,2097,44,5,p.woodShade);rect(c,2657,2089,9,91,p.metal);rect(c,2658,2091,4,87,p.metalShade);
    for(const[x,y]of[[2770,2060],[2916,2253],[2771,2328]])lamp(c,x,y,p);bench(c,2973,2290,p);sign(c,'FERRY CLOSED',2596,2356,p,141,p.roofShade);for(let i=0;i<21;i++){const x=2466+i*35,y=2266+Math.floor(hash(i,5)*26);if(x>2720&&x<2910)continue;rect(c,x,y-23,3,30,p.grassLight);rect(c,x+5,y-19,3,26,p.grass);rect(c,x-2,y-26,6,7,p.wood);}for(const[x,y]of[[3224,2240],[3251,2240],[3178,2434]])barrel(c,x,y,p);if(dream)text(c,'NEXT BOAT 3.17',2781,2104,p.cream);
  }
  if(visible(b,{x:3060,y:2430,w:1334,h:778})){
    for(const y of[3009,3106]){rect(c,3040,y-14,1296,56,p.soil);for(let x=3050;x<4330;x+=19)rect(c,x,y-12,6,49,p.woodShade);rect(c,3040,y,1296,4,p.metal);rect(c,3040,y+25,1296,4,p.metal);}
    for(let i=0;i<3;i++){const x=3693+i*188,y=2981;rect(c,x+8,y+53,18,17,p.metalShade);rect(c,x+132,y+53,18,17,p.metalShade);rect(c,x,y,174,62,p.roofShade);rect(c,x+6,y+4,163,12,p.roofLight);rect(c,x+7,y+22,160,22,p.wallShade);for(let col=0;col<5;col++)window(c,x+14+col*29,y+25,19,15,p,true);rect(c,x+6,y+51,162,6,p.metal);rect(c,x+174,y+40,14,5,p.metalShade);}
    for(const[x,y]of[[3250,2777],[3584,2838],[3760,2818]])bench(c,x,y,p);for(const[x,y]of[[3202,2753],[3645,2767],[3939,2895]])lamp(c,x,y,p);sign(c,'PLATFORM 13',3410,2814,p,145,p.metalShade);text(c,'13',3455,2719,p.roofShade,3);for(const[x,y]of[[3137,2788],[3168,2788],[4023,2843]])crate(c,x,y,p,26,23);rect(c,4062,2902,4,91,p.metalShade);rect(c,4052,2904,25,40,p.metal);rect(c,4057,2910,14,10,p.red);rect(c,4057,2927,14,10,p.windowShade);if(dream){rect(c,3533,2802,15,27,p.roof);rect(c,3537,2790,8,13,p.wallShade);}
  }
  if(visible(b,{x:1620,y:1160,w:423,h:366})){car(c,1694,1366,p,p.metalShade);text(c,'COUNTY 04',1674,1370,p.cream);lamp(c,1860,1387,p);bench(c,1913,1394,p);sign(c,'ROAD 6',1910,1451,p,79,p.metalShade);for(const[x,y]of[[1667,1264],[1692,1283],[1978,1287]])bush(c,x,y,p,dream);}
}

export function drawVelvetTerrain(c,bounds,phase='waking'){
  const dream=phase==='dream',p=dream?DREAM:WAKE,b=bounds;ground(c,b,p,dream);roads(c,b,p);waters(c,b,p,dream);const objects=[];
  const gx=Math.floor((b.x-84)/72),gy=Math.floor((b.y-10)/72);
  for(let row=gy;row<=Math.ceil((b.y+b.height+105)/72);row++)for(let col=gx;col<=Math.ceil((b.x+b.width+84)/72);col++){
    const h=hash(col,row,8),x=col*72+Math.floor(hash(col,row,10)*33),y=row*72+Math.floor(hash(col,row,11)*31);if(x<48||y<90||x>4750||y>3414||h<.15||!plantSafe(x,y))continue;const size=.8+hash(col,row,9)*.54;objects.push({y,draw:()=>pine(c,x,y,p,size,col+row)});if(h>.73)objects.push({y:y+17,draw:()=>bush(c,x+25,y+17,p,dream)});
  }
  for(const s of STRUCTURES)if(visible(b,{x:s.x-80,y:s.y-145,w:s.w+200,h:s.h+200}))objects.push({y:s.y+s.h,draw:()=>drawStructure(c,s,p,dream)});
  objects.sort((a,d)=>a.y-d.y).forEach(o=>o.draw());districtDetails(c,b,p,dream);
}

const PEOPLE={
guide:{coat:'#b89f7c',shade:'#947b65',hair:'#81736a',skin:'#dbb99b',shirt:'#ded2b6'},merchant:{coat:'#cf997c',shade:'#b7786b',hair:'#79594e',skin:'#e7c19e',shirt:'#f1dfbe'},ranger:{coat:'#b77888',shade:'#915e7e',hair:'#6a5668',skin:'#dfb99f',shirt:'#dacbaf'},clerk:{coat:'#8d9ea1',shade:'#6e838c',hair:'#847261',skin:'#e6c4a1',shirt:'#e0d4b6'},operator:{coat:'#b1b495',shade:'#929b80',hair:'#d5cab4',skin:'#dbb69e',shirt:'#ede0c5'},double:{coat:'#b2a6bb',shade:'#94839c',hair:'#d5c7cc',skin:'#ccbfca',shirt:'#eee2ce'},archivist:{coat:'#a69580',shade:'#897665',hair:'#cbbda2',skin:'#dfbd9b',shirt:'#ecdbb9'},deputy:{coat:'#83988d',shade:'#667f7b',hair:'#65574d',skin:'#cba087',shirt:'#dfd0ab'},astronomer:{coat:'#7795a7',shade:'#5f7e98',hair:'#d9d3c1',skin:'#d0b49e',shirt:'#e0d8c9'},conductor:{coat:'#85908f',shade:'#647b80',hair:'#885f58',skin:'#ddb49a',shirt:'#ecdabb'},traveler:{coat:'#b98c71',shade:'#957b6a',hair:'#98856a',skin:'#d2ad90',shirt:'#dacaab'},radio:{coat:'#ad858d',shade:'#896b82',hair:'#706177',skin:'#deb79f',shirt:'#e9d3ba'},physician:{coat:'#d7d5bb',shade:'#b7bdab',hair:'#a38778',skin:'#e2bba4',shirt:'#a6b9b5'},ferryman:{coat:'#779892',shade:'#60817f',hair:'#b9bba7',skin:'#c8a990',shirt:'#e0ccad'},
};
function person(c,e,opts,p){
  const x=Math.round(e.x),y=Math.round(e.y),npc=e.type==='npc'||opts.npc,moving=e.moving||e.walking||opts.moving||opts.walking,t=opts.time||e.time||0,step=moving?Math.floor(t*(e.sprinting?12:8))%2:0,face=e.facing||opts.facing||'down';
  const a=npc?(PEOPLE[e.kind]||PEOPLE.guide):{coat:'#c4ac86',shade:'#a18b72',hair:'#806855',skin:'#edc6a3',shirt:'#e4dac3'};
  // Fabric colours meet directly; the shade planes occupy one side, not a rim.
  rect(c,x-8,y-2,18,3,p.soil);rect(c,x-6,y-11+step,5,10,a.shade);rect(c,x+2,y-11-step,5,10,a.shade);rect(c,x-6,y-3+step,6,3,p.woodShade);rect(c,x+2,y-3-step,6,3,p.woodShade);
  rect(c,x-7,y-26,15,18,a.coat);rect(c,x+4,y-24,4,16,a.shade);rect(c,x-6,y-26,3,14,a.shirt);rect(c,x-5,y-25,4,2,p.cream);rect(c,x-10,y-23+step,4,13,a.coat);rect(c,x+8,y-23-step,4,13,a.shade);rect(c,x-10,y-12+step,4,4,a.skin);rect(c,x+8,y-12-step,4,4,a.skin);
  rect(c,x-5,y-36,11,12,a.skin);rect(c,x-7,y-33,2,5,a.skin);rect(c,x+6,y-33,2,5,a.skin);rect(c,x-6,y-39,12,6,a.hair);rect(c,x-7,y-36,3,4,a.hair);rect(c,x+4,y-36,3,6,a.hair);rect(c,x-3,y-40,6,2,a.hair);rect(c,x-5,y-38,6,2,npc&&e.kind==='double'?p.cream:p.wood);
  if(face==='up'){rect(c,x-5,y-36,11,9,a.hair);rect(c,x-4,y-25,11,14,a.coat);rect(c,x-1,y-23,6,8,a.shade);}else if(face==='left'){rect(c,x-5,y-32,2,2,p.woodShade);rect(c,x-8,y-29,3,3,a.skin);}else if(face==='right'){rect(c,x+4,y-32,2,2,p.woodShade);rect(c,x+7,y-29,3,3,a.skin);}else{rect(c,x-3,y-32,2,2,p.woodShade);rect(c,x+3,y-32,2,2,p.woodShade);rect(c,x,y-27,3,1,p.roofLight);}
  if(e.kind==='double'){rect(c,x-4,y-33,9,2,p.cream);rect(c,x+4,y-15,5,2,p.window);}if(e.kind==='merchant'||e.kind==='physician'){rect(c,x-4,y-22,9,13,a.shirt);rect(c,x-4,y-13,9,2,a.shade);}if(e.kind==='operator'||e.kind==='archivist'){rect(c,x-4,y-33,4,3,p.metalShade);rect(c,x+2,y-33,4,3,p.metalShade);rect(c,x,y-32,2,1,p.metal);}
  if(e.kind==='deputy'){rect(c,x-3,y-22,4,4,p.amber);rect(c,x-8,y-40,16,3,a.coat);rect(c,x-4,y-44,9,5,a.coat);}if(e.kind==='conductor'){rect(c,x-8,y-40,16,3,a.shade);rect(c,x-5,y-44,11,5,a.coat);rect(c,x-3,y-42,5,2,p.amber);}if(e.kind==='radio'){rect(c,x-9,y-37,3,9,p.metal);rect(c,x+7,y-37,3,9,p.metal);rect(c,x-6,y-42,13,2,p.metal);}if(e.kind==='ferryman'){rect(c,x-6,y-40,13,4,p.windowShade);rect(c,x-4,y-35,8,2,p.wood);}
  if(!npc){rect(c,x-5,y-24,3,16,p.woodShade);rect(c,x-6,y-17,10,7,p.metalShade);rect(c,x-5,y-16,8,5,p.metal);rect(c,x-2,y-16,4,4,p.waterShade);rect(c,x+8,y-19,7,4,a.skin);rect(c,x+14,y-21,8,7,p.amber);rect(c,x+20,y-20,3,5,p.cream);if(e.attacking||opts.attacking)for(let i=0;i<4;i++)rect(c,x+25+i*6,y-22-i*3,6,8+i*5,p.cream);}
}
function apparition(c,e,p,t){
  if(e.defeated)return;const x=Math.round(e.x),y=Math.round(e.y),q=Math.floor(t*6+(e.phase||0))%4,body=e.pacified?p.pineLight:p.metalShade;
  rect(c,x-5,y-13,4,13,body);rect(c,x+2,y-13,4,13,body);rect(c,x-7,y-29,15,19,body);rect(c,x+4,y-26,4,16,p.metal);rect(c,x-9,y-25,3,13,body);rect(c,x+9,y-25,3,13,p.metal);rect(c,x-5,y-40,11,13,p.metal);rect(c,x-3,y-41,7,3,p.pineLight);rect(c,x-3,y-35,2,2,p.cream);rect(c,x+3,y-35,2,2,p.cream);
  for(let i=0;i<5;i++)rect(c,x-6+(i%2)*2+(q===i?4:0),y-31+i*5,11-(i%2)*4,1,p.cream);if(q===1){rect(c,x-14,y-23,28,1,p.windowShade);rect(c,x-11,y-8,22,1,p.red);}if(e.pacified)rect(c,x-2,y-47,4,4,p.amber);if(e.health!=null&&e.maxHealth&&e.health<e.maxHealth){rect(c,x-11,y-47,22,3,p.metalShade);rect(c,x-11,y-47,Math.round(22*e.health/e.maxHealth),3,p.roofLight);}
}
function suitcase(c,e,p){const x=Math.round(e.x),y=Math.round(e.y);rect(c,x-11,y-17,23,16,p.wood);rect(c,x+6,y-17,6,16,p.woodShade);rect(c,x-7,y-17,2,16,p.windowShade);rect(c,x+5,y-17,2,16,p.windowShade);rect(c,x-4,y-22,9,3,p.woodShade);rect(c,x-4,y-19,2,3,p.woodShade);rect(c,x+3,y-19,2,3,p.woodShade);rect(c,x-2,y-10,4,4,p.amber);if(e.opened){rect(c,x-10,y-23,21,6,p.wood);rect(c,x-7,y-15,16,4,p.cream);}}
export function drawVelvetActor(c,e,opts={}){
  const p=opts.phase==='dream'?DREAM:WAKE;
  if(e.type==='player'||e.type==='npc'||opts.npc)person(c,e,opts,p);else if(e.type==='enemy')apparition(c,e,p,opts.time||0);else if(e.type==='chest')suitcase(c,e,p);else if(e.type==='waypoint'||e.type==='travel'){const x=Math.round(e.x),y=Math.round(e.y);lamp(c,x-53,y-2,p,e.unlocked!==false);bench(c,x+58,y+20,p);if(e.unlocked||e.discovered){rect(c,x-55,y-48,5,3,p.cream);rect(c,x-53,y-51,2,9,p.amber);}}else if(e.type==='landmark'&&(e.visited||e.discovered)){rect(c,e.x-2,e.y-8,4,4,p.amber);rect(c,e.x-1,e.y-11,2,9,p.cream);}
}
export function drawVelvetAmbient(c,b,opts={}){
  const dream=opts.phase==='dream',p=dream?DREAM:WAKE,t=opts.time||0,count=Math.min(90,Math.max(1,Math.floor(b.width*b.height/8000)));
  for(let i=0;i<count;i++){const x=b.x+((i*173+31)%Math.max(1,b.width)),y=b.y+((i*91+t*(dream?12:39))%Math.max(1,b.height));if(dream)rect(c,x,y,2,1,i%4===0?p.red:'#bca5bc60');else rect(c,x,y,1,4,'#b9c8ce48');}
  if(visible(b,{x:355,y:442,w:160,h:75}))for(let i=0;i<4;i++){const rise=(t*9+i*15)%50;rect(c,410+Math.round(Math.sin(t+i)*3),451-rise,5,3,'#e5d9bf58');rect(c,413,448-rise,3,3,'#e5d9bf40');}
  if(visible(b,{x:3940,y:330,w:580,h:520})&&Math.floor(t*2)%3!==0){rect(c,4401,316,8,8,p.red);rect(c,4403,318,4,4,p.cream);}
  if(dream)for(const[x,y]of[[1036,449],[1604,2614],[2807,2084],[3568,942]])if(visible(b,{x:x-9,y:y-9,w:18,h:18})){const k=Math.floor(t*3)%4;rect(c,x-6+k*2,y,3,2,p.amber);rect(c,x+2,y-3+k,2,2,p.window);}
}
