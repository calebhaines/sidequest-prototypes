// Original, hand-drawn canvas pixel art. All coordinates are world pixels.
export const WORLD_SIZE = { width: 1600, height: 1152 };

const PALETTES = {
  moss: { ground:'#8bb96c', dark:'#76a657', light:'#9cc97a', ink:'#344b40', path:'#ddca9c', edge:'#b5ab80', roof:'#c8674b', roofLight:'#e18558', roofDark:'#954936', wall:'#e9dcab', shade:'#c4b682', tree:['#255f43','#367c4a','#4b9952','#73b55e'], water:'#4ab6bd', waterDark:'#268eaa', accent:'#f4ca66' },
  neon: { ground:'#282b43', dark:'#22253c', light:'#35374f', ink:'#121b30', path:'#1b2135', edge:'#4a4c63', roof:'#484261', roofLight:'#625679', roofDark:'#302e49', wall:'#393950', shade:'#292b43', tree:['#263f52','#315863','#418779','#74bba2'], water:'#295c86', waterDark:'#213c65', accent:'#61e7dd' },
  dust: { ground:'#d5aa6c', dark:'#c49860', light:'#e6bb78', ink:'#72503f', path:'#dcb981', edge:'#b88858', roof:'#a05f4c', roofLight:'#c9815b', roofDark:'#774939', wall:'#dfbd87', shade:'#bb9869', tree:['#446c4e','#58865a','#77a266','#a1b678'], water:'#55a3a0', waterDark:'#397c86', accent:'#f4dc9b' },
  odd: { ground:'#8d9e99', dark:'#7c8f8d', light:'#a2b0a3', ink:'#55556d', path:'#9293a5', edge:'#c1b7cc', roof:'#7e759a', roofLight:'#a092bc', roofDark:'#615d81', wall:'#dfbecf', shade:'#b49fb9', tree:['#866487','#ad7d9f','#d69eb6','#edbbc6'], water:'#a1a6cf', waterDark:'#7c82b7', accent:'#fff0ae' },
  lynch: { ground:'#293b3e', dark:'#223236', light:'#334b49', ink:'#111d28', path:'#333745', edge:'#54515b', roof:'#833c3e', roofLight:'#b76555', roofDark:'#432835', wall:'#d6bca1', shade:'#998b80', tree:['#12272c','#1c3839','#2b514b','#42695a'], water:'#477481', waterDark:'#283f55', accent:'#ffc99a' },
  shinobi: { ground:'#8abd68', dark:'#73a656', light:'#abd67c', ink:'#29464c', path:'#eed6a3', edge:'#bea276', roof:'#d7773e', roofLight:'#ffa15b', roofDark:'#995437', wall:'#fff0c5', shade:'#dbc78f', tree:['#23754c','#35934e','#59b453','#97d575'], water:'#72d8cf', waterDark:'#419da8', accent:'#ffd563' },
};

const DREAM_PALETTE = { ...PALETTES.lynch, ground:'#2f263b', dark:'#241c30', light:'#473246', path:'#342634', edge:'#72505b', roof:'#922e49', roofLight:'#cc5a64', tree:['#161a2b','#28213c','#423144','#664552'], water:'#91658c', waterDark:'#4e355b', accent:'#ffe4b0' };

const NEW_FEATURES = {
  lynch:[
    {x:730,y:704,type:'npc',name:'Dale Mercer',kind:'guide'},
    {x:466,y:697,type:'npc',name:'Alma Vale',kind:'merchant'},
    {x:1058,y:625,type:'npc',name:'Vivian Bell',kind:'ranger'},
    {x:1240,y:790,type:'npc',name:'Owen Pike',kind:'clerk'},
    {x:462,y:365,type:'npc',name:'Elsie Reed',kind:'operator'},
    {x:1260,y:372,type:'npc',name:'The double',kind:'double'},
    {x:1040,y:500,type:'landmark',name:'Red-curtain stage'},
    {x:465,y:320,type:'landmark',name:'Ringing telephone'},
    {x:1330,y:270,type:'landmark',name:'Black pine grove'},
    {x:350,y:725,type:'chest',name:'Lost property'},
    {x:1400,y:855,type:'chest',name:'The unclaimed suitcase'},
  ],
  shinobi:[
    {x:760,y:645,type:'npc',name:'Ren',kind:'guide'},
    {x:1040,y:720,type:'npc',name:'Mako',kind:'merchant'},
    {x:600,y:380,type:'npc',name:'Aya',kind:'ranger'},
    {x:580,y:750,type:'npc',name:'Nori',kind:'quartermaster'},
    {x:1220,y:422,type:'npc',name:'Sora',kind:'elder'},
    {x:978,y:315,type:'npc',name:'Kaito',kind:'rival'},
    {x:780,y:315,type:'landmark',name:'North training grounds'},
    {x:1260,y:420,type:'landmark',name:'Sealed watchtower'},
    {x:370,y:850,type:'landmark',name:'Bamboo crossing'},
    {x:635,y:335,type:'chest',name:'Training supply scroll'},
    {x:445,y:880,type:'chest',name:'Reed-clan cache'},
  ],
};

const HOUSES = [
  {x:520,y:345,w:114,h:106,kind:'shop'}, {x:709,y:253,w:107,h:108,kind:'inn'},
  {x:927,y:354,w:123,h:112,kind:'home'}, {x:529,y:654,w:115,h:108,kind:'home'},
  {x:921,y:681,w:126,h:113,kind:'shop'}, {x:1131,y:456,w:105,h:100,kind:'home'},
  {x:1160,y:206,w:104,h:103,kind:'home'}, {x:224,y:748,w:104,h:104,kind:'inn'},
  {x:1052,y:901,w:107,h:108,kind:'home'}, {x:439,y:110,w:99,h:100,kind:'home'},
];

const FEATURE_NAMES = {
  moss:['Rowan · Wayfinder','Mira · Herbalist','Bram · Ranger','The old stone circle','Sunken watchtower','Moonwell grove','Supply chest','Forgotten coffer'],
  neon:['Juno · Fixer','Vex · Street medic','Patch · Courier','The relay station','Undercity entrance','Ghost signal terminal','Supply cache','Locked data vault'],
  dust:['Ada · Trail guide','Doc · Frontier medic','Wren · Scout','The abandoned mine','Last-light outpost','The broken observatory','Traveling chest','Buried strongbox'],
  odd:['June · Neighbor','Mr. Finch · Librarian','Kit · Paper kid','The midnight antenna','The impossible playground','The falling star','Lost lunchbox','A box from tomorrow'],
};

const caches = new Map();
function rng(seed) { let s=seed>>>0; return () => { s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function rect(c,x,y,w,h,color) { c.fillStyle=color; c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); }
function box(c,x,y,w,h,color,edge) { rect(c,x,y,w,h,edge); rect(c,x+2,y+2,w-4,h-4,color); }
function pix(c,x,y,color,size=2) { rect(c,x,y,size,size,color); }
function shadow(c,x,y,w,h,p) { rect(c,x+5,y+4,w,h,p.ink+'35'); rect(c,x+8,y+7,w-6,h-3,p.ink+'25'); }
function stepped(c,x,y,w,h,color) { rect(c,x+6,y,w-12,h,color); rect(c,x+2,y+4,w-4,h-8,color); rect(c,x,y+9,w,h-18,color); }

const GLYPHS = {
 A:['010','101','111','101','101'], B:['110','101','110','101','110'], C:['011','100','100','100','011'],
 D:['110','101','101','101','110'], E:['111','100','110','100','111'], F:['111','100','110','100','100'],
 G:['011','100','101','101','011'], H:['101','101','111','101','101'], I:['111','010','010','010','111'],
 J:['001','001','001','101','010'], K:['101','101','110','101','101'], L:['100','100','100','100','111'],
 M:['10101','11111','10101','10101','10101'], N:['101','111','111','111','101'], O:['010','101','101','101','010'],
 P:['110','101','110','100','100'], R:['110','101','110','101','101'], S:['011','100','010','001','110'],
 T:['111','010','010','010','010'], U:['101','101','101','101','111'], V:['101','101','101','101','010'],
 W:['10101','10101','10101','11111','01010'], X:['101','101','010','101','101'], Y:['101','101','010','010','010'], Z:['111','001','010','100','111'],
 '0':['111','101','101','101','111'], '7':['111','001','010','010','010'], '+':['000','010','111','010','000'],
};
function wordWidth(text,scale=1) { return [...text].reduce((a,l)=>a+(GLYPHS[l]?.[0].length||3)+1,0)*scale; }
function lettering(c,text,x,y,color,scale=1) {
  let xx=x;
  for(const l of text.toUpperCase()) { const glyph=GLYPHS[l]; if(glyph) glyph.forEach((row,yy)=>[...row].forEach((v,i)=>{if(v==='1')rect(c,xx+i*scale,y+yy*scale,scale,scale,color);})); xx+=((glyph?.[0].length||3)+1)*scale; }
}

function ground(c,theme,p) {
  rect(c,0,0,1600,1152,p.ground);
  const r=rng(5922);
  for(let i=0;i<18000;i++) {
    const x=Math.floor(r()*800)*2,y=Math.floor(r()*576)*2;
    if(theme==='neon') {
      if(i%4===0) { rect(c,x,y,6,2,p.light); rect(c,x,y+2,2,3,p.dark); }
    } else if(theme==='dust') {
      rect(c,x,y,2+r()*4,2,i%3===0?p.light:p.dark);
      if(i%16===0){rect(c,x+2,y-2,2,2,p.light);rect(c,x+6,y,2,2,p.dark);}
    } else {
      rect(c,x,y,2,2,p.light); if(i%3===0){rect(c,x+2,y+2,4,2,p.dark);rect(c,x+4,y,2,2,p.dark);}
    }
  }
  if(theme==='neon') {
    for(let x=0;x<1600;x+=32)rect(c,x,0,1,1152,'#1d243a');
    for(let y=0;y<1152;y+=32)rect(c,0,y,1600,1,'#1d243a');
  }
}

function river(c,p,theme) {
  if(theme==='neon') {
    rect(c,261,0,93,1152,'#161d30'); rect(c,271,0,69,1152,p.waterDark);
    rect(c,273,0,3,1152,'#52869c'); rect(c,336,0,3,1152,'#52869c');
    for(let y=0;y<1152;y+=26) {rect(c,282,y,31,2,'#35708a');rect(c,309,y+11,23,2,'#36758e');}
    return;
  }
  if(theme==='dust') {
    // A small spring and ancient irrigated channel.
    for(let y=0;y<1152;y+=8) {
      const xx=294+Math.round(Math.sin(y/120)*20/4)*4, wide=y>820?46:20;
      rect(c,xx-4,y,wide+8,8,'#b08b58'); rect(c,xx,y,wide,8,p.waterDark); rect(c,xx+4,y,wide-8,8,p.water);
      if(y%24===0)rect(c,xx+8,y+2,wide-20,2,'#8fc3b0');
    }
    return;
  }
  for(let y=0;y<1152;y+=8) {
    const xx=270+Math.round(Math.sin(y/115)*26/4)*4;
    const width=80+Math.round(Math.sin(y/150)*18/4)*4;
    rect(c,xx-8,y,width+16,8,p.edge); rect(c,xx-4,y,width+8,8,theme==='odd'?'#7989a3':'#407e69');
    rect(c,xx,y,width,8,p.waterDark); rect(c,xx+7,y,width-14,8,p.water);
    if(y%24===0){rect(c,xx+14,y+2,18,2,theme==='odd'?'#c7c6e7':'#8edcce');rect(c,xx+width-32,y+6,19,2,theme==='odd'?'#b4b7df':'#78d4ce');}
    if(y%48===0){rect(c,xx-12,y+2,5,4,p.light);rect(c,xx+width+8,y+2,5,4,p.light);}
  }
}

function roads(c,p,theme) {
  const urban=theme==='neon'||theme==='odd';
  // A main east-west road, a north road, and a south trail.
  rect(c,0,546,1600,78,p.edge); rect(c,0,553,1600,63,p.path);
  rect(c,774,0,64,1152,p.edge); rect(c,781,0,50,1152,p.path);
  rect(c,387,861,960,48,p.edge); rect(c,391,866,950,37,p.path);
  rect(c,1192,281,50,294,p.edge); rect(c,1198,283,38,290,p.path);
  if(urban) {
    const line=theme==='neon'?'#5d7690':'#c5bcc7';
    for(let x=30;x<1600;x+=50)rect(c,x,583,24,2,line);
    for(let y=25;y<1152;y+=48)rect(c,805,y,2,22,line);
    for(let x=748;x<768;x+=6)rect(c,x,553,3,64,p.edge);
    for(let x=844;x<864;x+=6)rect(c,x,553,3,64,p.edge);
    for(let y=518;y<538;y+=6)rect(c,781,y,50,3,p.edge);
    for(let y=632;y<652;y+=6)rect(c,781,y,50,3,p.edge);
    rect(c,263,547,94,76,theme==='neon'?'#43475c':'#b6aabd');
    rect(c,263,546,94,4,p.ink);rect(c,263,620,94,4,p.ink);
    for(let x=265;x<355;x+=12)rect(c,x,551,2,67,p.shade);
  } else {
    const r=rng(7388);
    for(let i=0;i<1900;i++) {
      const horizontal=i<1150;
      const x=horizontal?r()*1600:782+r()*48,y=horizontal?554+r()*60:r()*1152;
      rect(c,x,y,4+r()*4,2,i%3===0?p.edge:theme==='dust'?'#e8c78e':'#ecdbaf');
    }
    // Oak plank bridge, low rails, metal nails.
    rect(c,252,548,111,72,p.roofDark);
    for(let x=255;x<362;x+=8) {rect(c,x,552,6,64,'#b58f64');rect(c,x+1,553,1,62,'#d8b982'); pix(c,x+2,558,p.ink,1);pix(c,x+2,608,p.ink,1);}
    rect(c,249,547,116,5,'#e3c397');rect(c,249,617,116,5,'#e3c397');
    for(let x=249;x<365;x+=28) {rect(c,x,539,5,18,p.roofDark);rect(c,x,610,5,19,p.roofDark);rect(c,x+1,539,3,5,'#dfbd85');}
  }
  // Walkways and generous town square.
  for(const h of HOUSES) {rect(c,h.x+h.w/2-12,h.y+h.h,24,Math.max(12,Math.min(95,546-h.y-h.h)),p.edge);rect(c,h.x+h.w/2-9,h.y+h.h,18,Math.max(12,Math.min(95,546-h.y-h.h)),p.path);}
  rect(c,673,432,222,113,p.edge);rect(c,680,438,209,103,theme==='neon'?'#363749':theme==='odd'?'#afa7bf':'#c5bb91');
  for(let y=440;y<540;y+=12)for(let x=682;x<889;x+=18){rect(c,x+(y%24?0:8),y,15,10,theme==='neon'?'#3d3d51':theme==='odd'?'#bab1c6':'#d8cfa7');}
}

function flower(c,x,y,p,theme,variant=0) {
  const color=theme==='neon'?'#dd62bb':theme==='dust'?'#efce90':theme==='odd'?(variant%2?'#eed2d2':'#bcd3d5'):(variant%3===0?'#f7d983':variant%3===1?'#efaca0':'#f1e4c0');
  rect(c,x+2,y+2,2,5,theme==='odd'?'#677d77':p.tree[1]);
  rect(c,x,y,6,2,color);rect(c,x+2,y-2,2,6,color);rect(c,x+2,y,2,2,theme==='neon'?'#ffffb7':'#e9c27a');
}

function tree(c,x,y,p,theme,size=1) {
  const w=Math.round(34*size),h=Math.round(38*size),xx=x-w/2,yy=y-h;
  shadow(c,xx-1,y-6,w+7,12,p);
  if(theme==='dust') {
    const tall=26*size;
    rect(c,x-3,y-tall,7,tall,p.tree[0]);rect(c,x-1,y-tall+2,3,tall-3,p.tree[2]);
    rect(c,x-12,y-tall+10,9,5,p.tree[0]);rect(c,x-12,y-tall+3,5,11,p.tree[1]);rect(c,x+4,y-tall+17,10,5,p.tree[0]);rect(c,x+10,y-tall+8,4,11,p.tree[1]);
    for(let a=5;a<tall;a+=6)pix(c,x+3,y-tall+a,p.tree[3],1);
    if(size>1.1)flower(c,x-1,y-tall-2,p,theme);
    return;
  }
  rect(c,x-3,y-14,7,15,theme==='neon'?'#554858':theme==='odd'?'#766275':'#756549');rect(c,x-1,y-11,2,11,'#a88a62');
  const colors=p.tree;
  stepped(c,xx,yy,w,h-6,colors[0]);
  stepped(c,xx+2,yy+1,w-4,h-12,colors[1]);
  stepped(c,xx+4,yy+2,w-9,h-20,colors[2]);
  stepped(c,xx+6,yy+3,w-16,h-25,colors[3]);
  rect(c,xx+7,yy+9,6,3,colors[3]);rect(c,xx+5,yy+14,4,4,colors[2]);
  rect(c,xx+w-12,yy+13,6,3,colors[0]);rect(c,xx+w-15,yy+22,10,3,colors[1]);
  pix(c,xx+11,yy+6,theme==='odd'?'#f5cad0':colors[3],3);pix(c,xx+w-10,yy+10,colors[2],2);
  if(theme==='odd') {pix(c,xx+5,yy+20,'#f5c4cb',2);pix(c,xx+20,yy+4,'#f5c4cb',2);pix(c,xx+23,yy+18,'#c78aa6',3);}
}

function pine(c,x,y,p) {
  shadow(c,x-15,y-7,33,12,p);rect(c,x-3,y-18,6,19,'#695d46');
  for(let i=0;i<5;i++) {const width=10+i*6;rect(c,x-width/2,y-48+i*7,width,10,p.tree[0]);rect(c,x-width/2+2,y-47+i*7,width-5,6,p.tree[1]);rect(c,x-width/2+2,y-47+i*7,width/2-1,3,p.tree[2]);}
}

function rock(c,x,y,p,theme,size=1) {
  const color=theme==='dust'?'#a17a5b':theme==='odd'?'#8a8da5':theme==='neon'?'#4b4b67':'#929d88';
  shadow(c,x-10*size,y-5,23*size,7,p);
  stepped(c,x-11*size,y-16*size,22*size,17*size,p.ink);stepped(c,x-10*size,y-16*size,20*size,14*size,color);
  rect(c,x-6*size,y-14*size,8*size,3*size,theme==='dust'?'#d1a57b':'#b7c0a8');
}

function fence(c,x,y,w,p,theme) {
  const dark=theme==='neon'?'#1c2439':theme==='odd'?'#80788f':'#968262',light=theme==='neon'?'#777390':theme==='odd'?'#dccbda':'#e8dab1';
  rect(c,x,y+4,w,3,dark);rect(c,x,y+10,w,3,dark);rect(c,x,y+3,w,2,light);rect(c,x,y+9,w,2,light);
  for(let i=0;i<w;i+=14) {rect(c,x+i,y,5,17,dark);rect(c,x+i,y,4,14,light);rect(c,x+i+1,y-2,2,2,light);}
}

function window(c,x,y,w,h,p,theme) {
  box(c,x,y,w,h,theme==='neon'?'#67b7c0':theme==='odd'?'#f2d8a8':'#6aabad',p.ink);
  rect(c,x+2,y+2,w-4,3,theme==='neon'?'#abf6e4':theme==='odd'?'#fff0bf':'#a9d8cd');
  rect(c,x+w/2,y+2,2,h-4,p.shade);rect(c,x+2,y+h/2,w-4,2,p.shade);rect(c,x-2,y+h, w+4,3,p.shade);
}

function cottage(c,h,p,theme,index) {
  const {x,y,w,h:height,kind}=h, wallY=y+46,bottom=y+height;
  shadow(c,x,bottom-11,w+7,20,p);
  rect(c,x+5,wallY,w-10,height-46,p.ink);rect(c,x+7,wallY+2,w-14,height-51,p.wall);
  rect(c,x+w-18,wallY+2,11,height-51,p.shade);rect(c,x+7,bottom-9,w-14,7,p.shade);
  for(let yy=wallY+9;yy<bottom-10;yy+=8){rect(c,x+8,yy,w-27,1,theme==='odd'?'#c4a9bf':'#d2c696');}
  const roofColor=theme==='odd'&&index%2===1?'#9a768f':p.roof, roofLit=theme==='odd'&&index%2===1?'#bc91a8':p.roofLight;
  rect(c,x+10,y-1,w-20,9,p.roofDark);rect(c,x+4,y+6,w-8,13,p.roofDark);rect(c,x,y+17,w,33,p.roofDark);
  rect(c,x+11,y,w-22,8,roofLit);rect(c,x+6,y+8,w-12,10,roofColor);rect(c,x+2,y+18,w-4,26,roofColor);
  for(let yy=y+4;yy<y+44;yy+=7) {
    const inset=yy<y+8?12:yy<y+18?7:3;
    rect(c,x+inset,yy,w-inset*2,2,p.roofDark);
    for(let xx=x+inset+(yy%14?1:6);xx<x+w-inset;xx+=12){rect(c,xx,yy-3,2,3,roofLit);rect(c,xx+4,yy+2,4,1,roofLit);}
  }
  rect(c,x,y+45,w,4,p.roofDark);rect(c,x+2,y+44,w-4,2,roofLit);
  const chimX=x+w-28;
  rect(c,chimX,y-12,12,25,p.ink);rect(c,chimX+2,y-13,9,22,p.shade);rect(c,chimX-1,y-14,14,4,p.wall);rect(c,chimX+5,y-8,3,3,p.roofDark);
  window(c,x+16,wallY+12,21,20,p,theme);window(c,x+w-39,wallY+12,21,20,p,theme);
  const doorX=x+w/2-10;
  box(c,doorX,bottom-35,20,29,theme==='odd'?'#777493':'#7d816b',p.ink);rect(c,doorX+4,bottom-31,12,9,theme==='odd'?'#f2d9a7':'#9fbdab');pix(c,doorX+15,bottom-17,'#f0d47d',2);
  rect(c,doorX-4,bottom-7,28,4,'#ebe0b9');rect(c,doorX-7,bottom-3,34,3,p.edge);
  if(kind==='shop') {
    const sign=theme==='odd'?'MART':'GOODS';box(c,x+w/2-21,wallY+3,42,12,p.wall,p.roofDark);lettering(c,sign,x+w/2-wordWidth(sign)/2,wallY+6,p.roofDark);
    for(let i=0;i<7;i++){rect(c,x+11+i*12,wallY+31,12,9,i%2?p.wall:p.roofLight);rect(c,x+11+i*12,wallY+39,12,4,i%2?p.shade:p.roofDark);}
  } else if(kind==='inn') {box(c,x+w/2-13,wallY+3,26,12,p.wall,p.roofDark);lettering(c,'INN',x+w/2-6,wallY+6,p.roofDark);}
  if(theme==='odd') {rect(c,x+13,y-11,1,14,p.ink);rect(c,x+7,y-9,13,1,p.ink);rect(c,x+10,y-13,7,1,p.ink);}
  for(let i=0;i<3;i++)flower(c,x+10+i*5,bottom-2,p,theme,i);
}

function cyberBuilding(c,h,p,index) {
  const {x,y,w,h:height,kind}=h,bottom=y+height, color=index%2?'#cd69bc':'#5dd9d0';
  shadow(c,x-3,bottom-12,w+12,23,p);
  rect(c,x,y+7,w,height-7,p.ink);rect(c,x+3,y+10,w-6,height-13,p.wall);rect(c,x+w-16,y+10,13,height-13,p.shade);
  box(c,x-2,y-2,w+4,25,'#4e4963','#1b2036');rect(c,x+2,y+2,w-4,2,'#82738b');
  for(let i=0;i<3;i++){box(c,x+8+i*25,y+5,18,12,'#646279','#30334c');for(let yy=0;yy<4;yy++)rect(c,x+11+i*25,y+7+yy*2,12,1,'#343952');}
  rect(c,x+w-18,y-16,3,18,'#838197');rect(c,x+w-22,y-16,11,2,'#c06cc5');rect(c,x+w-17,y-24,1,11,'#5ddecb');
  for(let yy=y+31;yy<bottom-40;yy+=19)for(let xx=x+10;xx<x+w-25;xx+=22) {
    box(c,xx,yy,16,13,'#202c47','#161d33');rect(c,xx+2,yy+2,12,8,(xx+yy)%3?'#7fb7bb':'#cc8ec5');rect(c,xx+7,yy+2,2,8,'#345466');
  }
  const label=kind==='shop'?'NOODLE':kind==='inn'?'HOTEL':'ARCADE';
  box(c,x+8,bottom-42,w-29,18,'#1b2540','#161a30');rect(c,x+10,bottom-41,w-33,2,color);lettering(c,label,x+12,bottom-36,color,1);
  box(c,x+12,bottom-22,w-40,19,'#326b7d','#181e31');rect(c,x+15,bottom-20,w-47,5,'#63bcb4');rect(c,x+15,bottom-10,w-47,2,'#8beadd');
  rect(c,x+w-24,y+26,12,height-37,'#171d31');rect(c,x+w-22,y+30,8,height-45,'#7b548b');lettering(c,'OPEN',x+w-20,y+33,'#f492d9',1);
  rect(c,x+6,bottom-2,w-12,3,'#658185');
  if(index%2===0) {rect(c,x-12,y+37,11,28,'#152439');rect(c,x-10,y+39,7,24,'#d560ad');rect(c,x-9,y+43,5,2,'#ffc2e9');rect(c,x-9,y+51,5,2,'#ffc2e9');}
}

function frontierBuilding(c,h,p,index) {
  const {x,y,w,h:height,kind}=h,bottom=y+height;
  shadow(c,x-1,bottom-11,w+11,19,p);
  rect(c,x+2,y+13,w-4,height-13,p.ink);rect(c,x+4,y+16,w-8,height-17,p.wall);rect(c,x+w-16,y+16,11,height-18,p.shade);
  for(let yy=y+19;yy<bottom-3;yy+=7)rect(c,x+5,yy,w-22,1,'#c5a173');
  rect(c,x-3,y+3,w+6,21,p.roofDark);rect(c,x,y+5,w,15,p.roof);rect(c,x+3,y+6,w-6,3,p.roofLight);
  const middle=kind==='inn';
  if(middle){rect(c,x+25,y-9,w-50,17,p.roofDark);rect(c,x+28,y-7,w-56,15,p.roofLight);}
  const label=kind==='shop'?'GOODS':kind==='inn'?'SALOON':'POST';
  box(c,x+14,y+27,w-28,17,'#e6c798',p.roofDark);lettering(c,label,x+w/2-wordWidth(label,2)/2,y+31,p.roofDark,2);
  window(c,x+15,y+53,22,22,p,'dust');window(c,x+w-38,y+53,22,22,p,'dust');
  box(c,x+w/2-9,bottom-30,18,25,'#78684d',p.ink);rect(c,x+w/2-6,bottom-27,12,9,'#8fb0a5');
  rect(c,x-3,bottom-15,w+6,5,p.roofDark);rect(c,x-3,bottom-16,w+6,2,p.roofLight);
  for(const xx of [x+1,x+w-5]){rect(c,xx,bottom-14,4,18,p.roofDark);rect(c,xx+1,bottom-14,1,18,p.roofLight);}
  rect(c,x-4,bottom+2,w+8,4,p.shade);rect(c,x-4,bottom+6,w+8,3,p.edge);
  if(index%2===0){rect(c,x+w-10,y-14,3,18,p.ink);rect(c,x+w-8,y-14,14,8,'#d18d58');}
}

function lamp(c,x,y,p,theme) {
  shadow(c,x-5,y-3,11,6,p);
  rect(c,x-1,y-32,3,33,p.ink);rect(c,x-4,y-2,9,3,p.ink);
  if(theme==='neon') {rect(c,x-7,y-34,16,4,'#696b88');rect(c,x-6,y-30,13,3,'#93f4df');rect(c,x-8,y-27,18,2,'#62b2b063');rect(c,x-12,y-25,26,2,'#6ee6d629');}
  else {rect(c,x-4,y-36,9,12,p.ink);rect(c,x-2,y-34,5,7,theme==='odd'?'#ffe4b0':'#f3da8d');rect(c,x-5,y-38,11,3,p.ink);}
}

function bench(c,x,y,p,theme) {
  shadow(c,x-1,y+5,29,8,p);
  rect(c,x,y,28,4,p.roofDark);rect(c,x,y+5,28,4,p.roofLight);rect(c,x,y-5,28,3,p.roofLight);
  rect(c,x+3,y-5,3,17,p.ink);rect(c,x+23,y-5,3,17,p.ink);
  if(theme==='neon'){rect(c,x,y,28,2,'#69c9c2');}
}

function smallProp(c,x,y,p,theme,kind) {
  if(kind==='sign') {
    rect(c,x-2,y-17,4,18,p.roofDark);box(c,x-13,y-26,29,16,p.wall,p.ink);lettering(c,'EAST',x-7,y-21,p.ink);
  } else if(kind==='barrel') {
    stepped(c,x-7,y-18,14,18,p.roofDark);rect(c,x-5,y-16,10,14,p.roofLight);rect(c,x-7,y-13,14,2,p.ink);rect(c,x-7,y-5,14,2,p.ink);rect(c,x-1,y-16,1,14,p.roofDark);
  } else if(kind==='crate') {
    box(c,x-9,y-18,18,18,p.shade,p.roofDark);rect(c,x-7,y-15,14,2,p.wall);rect(c,x-7,y-8,14,2,p.wall);rect(c,x-7,y-15,2,12,p.wall);rect(c,x+5,y-15,2,12,p.wall);
  } else if(kind==='mushroom') {
    rect(c,x-1,y-5,3,6,'#e5d6b2');rect(c,x-5,y-9,11,5,'#cf795b');rect(c,x-3,y-11,7,3,'#e0906f');pix(c,x-2,y-9,'#f3d5aa',2);
  } else if(kind==='mailbox') {
    rect(c,x-1,y-9,3,10,p.roofDark);box(c,x-5,y-16,11,8,theme==='odd'?'#d2adbc':p.roofLight,p.ink);rect(c,x+6,y-16,2,8,'#ed8e91');
  }
}

function townCenter(c,p,theme) {
  const x=804,y=492;
  for(const [bx,by,bw] of [[706,438,49],[847,438,35]]) {
    box(c,bx,by,bw,15,theme==='neon'?'#2c5153':theme==='odd'?'#95849e':'#8eaa74',p.ink);
    rect(c,bx+2,by+12,bw-4,2,p.shade);
    for(let i=0;i<Math.floor(bw/7);i++)flower(c,bx+3+i*7,by+5,p,theme,i);
  }
  if(theme==='moss') {
    shadow(c,x-24,y+10,49,18,p);stepped(c,x-24,y-11,49,34,'#8c9684');stepped(c,x-21,y-14,43,32,'#e0dcc0');stepped(c,x-17,y-11,35,22,p.waterDark);stepped(c,x-15,y-9,31,18,p.water);
    rect(c,x-3,y-25,7,34,'#899c91');rect(c,x-2,y-25,5,29,'#eee5c3');rect(c,x-11,y-27,23,7,'#9ca99a');rect(c,x-10,y-29,21,5,'#dedfc8');rect(c,x-7,y-26,15,2,'#8acfc2');
    rect(c,x-1,y-36,3,9,'#b9eddb');rect(c,x-4,y-36,9,2,'#b9eddb');pix(c,x-11,y-21,'#d4f4dd',2);pix(c,x+11,y-18,'#d4f4dd',2);
  } else if(theme==='neon') {
    box(c,x-25,y-10,50,31,'#353950','#171e34');rect(c,x-23,y-8,46,2,'#d776d0');rect(c,x-19,y+14,38,3,'#6be1d0');
    rect(c,x-5,y-46,10,61,'#292c45');rect(c,x-3,y-42,6,53,'#69e0d6');
    for(let i=0;i<3;i++){box(c,x-25+i*7,y-42-i*7,47-i*14,25+i*14,'#2f304c','#80e8dd');}
    lettering(c,'NOVA',x-8,y-33,'#f7c3f0');rect(c,x-11,y-19,22,2,'#db81d0');rect(c,x-8,y-13,16,2,'#db81d0');
  } else if(theme==='dust') {
    shadow(c,x-21,y+12,46,12,p);stepped(c,x-22,y-2,45,27,p.roofDark);stepped(c,x-19,y-5,39,23,p.shade);stepped(c,x-14,y-3,29,14,p.ink);rect(c,x-17,y+13,34,3,p.wall);
    rect(c,x-21,y-35,5,36,p.roofDark);rect(c,x+17,y-35,5,36,p.roofDark);rect(c,x-23,y-38,48,5,p.roofDark);rect(c,x-21,y-38,44,2,p.roofLight);
    rect(c,x-1,y-32,2,20,p.roofDark);box(c,x-6,y-14,12,10,'#c89669',p.roofDark);rect(c,x-24,y-40,50,2,p.wall);
  } else {
    shadow(c,x-21,y+8,43,15,p);stepped(c,x-20,y-9,41,31,'#9993b1');stepped(c,x-16,y-10,33,26,'#c1b7d0');
    // An ordinary civic statue with a distinctly impossible passenger.
    box(c,x-8,y-26,17,20,'#7f7c99','#696881');rect(c,x-5,y-37,11,13,'#b8a9c4');rect(c,x-6,y-32,13,3,'#d4bfd7');
    rect(c,x-19,y-51,39,3,'#ffdbae');rect(c,x-14,y-55,29,5,'#ffe7c6');rect(c,x-8,y-59,17,4,'#eccada');rect(c,x-23,y-48,47,3,'#b3d7d2');
    pix(c,x-12,y-45,'#ffefb3',2);pix(c,x+13,y-43,'#ffefb3',2);
  }
  bench(c,703,484,p,theme);bench(c,851,519,p,theme);
  lamp(c,694,455,p,theme);lamp(c,880,458,p,theme);
}

function landmarkScenery(c,x,y,p,theme,index) {
  // Landmark centers remain open so players can approach from every direction.
  if(theme==='neon') {
    for(const dx of [-30,30]){box(c,x+dx-9,y-40,18,45,'#3f405b','#141e34');rect(c,x+dx-5,y-36,10,20,index===1?'#df70bd':'#75dacc');for(let yy=0;yy<3;yy++)rect(c,x+dx-4,y-31+yy*5,8,1,'#244158');}
    box(c,x-33,y-55,66,15,'#24293e','#6cdccf');lettering(c,index===0?'RELAY':index===1?'SUBWAY':'SIGNAL',x-24,y-50,'#d9b1e1');
  } else if(theme==='dust') {
    for(const dx of [-32,32]){rect(c,x+dx-5,y-53,10,57,p.roofDark);rect(c,x+dx-3,y-50,6,50,p.roofLight);}
    rect(c,x-42,y-57,84,10,p.roofDark);rect(c,x-39,y-56,78,3,p.shade);
    box(c,x-25,y-48,50,13,p.wall,p.roofDark);lettering(c,index===0?'MINE':index===1?'OUTPOST':'SKY',x-16,y-44,p.roofDark);
    for(let i=0;i<4;i++)rock(c,x-48+i*31,y+20+(i%2)*12,p,theme,0.7);
  } else if(theme==='odd') {
    if(index===2) {
      stepped(c,x-21,y-33,43,20,'#728895');stepped(c,x-16,y-35,33,13,'#dcd4ba');rect(c,x-7,y-42,15,10,'#fff0ba');
      for(let i=0;i<9;i++){const xx=x-45+i*12,yy=y-6+(i%3)*9;pix(c,xx,yy,'#eddbbf',2);}
    } else {
      for(const dx of [-28,28]){rect(c,x+dx,y-49,3,52,p.ink);rect(c,x+dx+1,y-48,1,49,'#a6b6bf');}
      rect(c,x-28,y-48,60,3,'#d8c4d9');rect(c,x-9,y-47,1,30,'#cebdcc');rect(c,x+9,y-47,1,30,'#cebdcc');rect(c,x-12,y-17,25,4,'#ad739a');
      if(index===0){rect(c,x-1,y-65,2,31,'#e0ccdf');rect(c,x-16,y-62,32,2,'#f3dbbb');rect(c,x-9,y-69,18,2,'#f3dbbb');}
    }
  } else {
    for(const dx of [-31,31]) {box(c,x+dx-7,y-36,15,41,'#a7ae96','#657a70');rect(c,x+dx-7,y-39,15,5,'#d2d4b1');rect(c,x+dx-9,y+3,19,5,'#b8c3a1');for(let j=0;j<3;j++)rect(c,x+dx-5,y-27+j*8,9,1,'#869780');}
    if(index===0){rect(c,x-38,y-40,77,8,'#aeb99c');rect(c,x-35,y-43,71,4,'#d3d8b4');}
    for(let i=0;i<6;i++)flower(c,x-52+i*19,y+14+(i%2)*8,p,theme,i);
  }
}

// New worlds have their own geography, architecture, and visual vocabulary.
// Every object is drawn on an integer pixel grid, including pools of lamplight.
function pixelOval(c,x,y,w,h,color) {
  for(let yy=0;yy<h;yy+=4) {
    const d=(yy+2-h/2)/(h/2), half=Math.floor(Math.sqrt(Math.max(0,1-d*d))*w/2/2)*2;
    rect(c,x+w/2-half,y+yy,half*2,4,color);
  }
}

function asphalt(c,x,y,w,h,p,vertical=false) {
  rect(c,x,y,w,h,p.ink);rect(c,x+3,y+3,w-6,h-6,p.edge);rect(c,x+8,y+8,w-16,h-16,p.path);
  if(vertical)for(let yy=y+22;yy<y+h-18;yy+=42)rect(c,x+w/2,yy,2,18,'#c4b58b');
  else for(let xx=x+24;xx<x+w-22;xx+=48)rect(c,xx,y+h/2,22,2,'#c4b58b');
}

function nightLamp(c,x,y,p,dream=false) {
  pixelOval(c,x-46,y-14,94,35,dream?'#cf739718':'#efb6741c');
  pixelOval(c,x-29,y-9,60,24,dream?'#eaaaad18':'#ffddac1a');
  rect(c,x-2,y-64,5,63,'#182630');rect(c,x-1,y-63,2,60,'#74808a');
  rect(c,x-5,y-4,11,5,'#17222e');rect(c,x-3,y-65,23,3,'#54646d');rect(c,x+16,y-65,3,9,'#667780');
  box(c,x+10,y-58,17,7,'#e8cda0','#26343f');rect(c,x+12,y-57,13,3,'#ffe6b2');
  rect(c,x+7,y-49,23,3,'#f0be7c45');rect(c,x+4,y-46,29,2,'#f0be7c20');
}

function cedar(c,x,y,p,size=1,dream=false) {
  const h=Math.round(92*size),w=Math.round(53*size);
  pixelOval(c,x-w/2,y-7,w,15,p.ink+'45');rect(c,x-3,y-h*.35,6,h*.35,'#544744');
  for(let i=0;i<9;i++) {
    const ww=Math.round((8+i*5)*size),yy=y-h+Math.round(i*9*size);
    rect(c,x-ww/2,yy,ww,14*size,p.tree[0]);rect(c,x-ww/2+3,yy+2,ww-6,8*size,p.tree[1]);
    rect(c,x-ww/2+4,yy+2,ww*.45,3,p.tree[2]);
    if(i%2===0)rect(c,x+2,yy+7,ww*.25,2,dream?'#6b4e5c':p.tree[2]);
  }
}

function telephone(c,x,y,p,dream=false) {
  shadow(c,x-15,y-5,35,11,p);box(c,x-14,y-52,29,50,dream?'#762f44':'#69424b',p.ink);
  rect(c,x-17,y-57,35,8,dream?'#ad4c62':'#a4615a');rect(c,x-14,y-54,29,3,'#d2a18b');
  box(c,x-10,y-46,21,32,'#263b43','#b99587');rect(c,x-8,y-44,17,8,dream?'#c7adb7':'#77979a');
  rect(c,x-1,y-45,2,31,'#b99587');rect(c,x-9,y-29,19,2,'#b99587');
  rect(c,x-7,y-34,5,12,'#151f28');rect(c,x-6,y-32,2,7,'#ead5b3');rect(c,x+5,y-24,2,3,'#e8c09b');
  lettering(c,'TEL',x-5,y-54,'#f5d9b6');rect(c,x-15,y-4,31,4,'#b29b8d');
}

function diner(c,x,y,p,dream=false) {
  const w=280,h=163;
  shadow(c,x-6,y+h-14,w+15,24,p);rect(c,x,y+48,w,h-48,'#1b2630');
  rect(c,x+4,y+50,w-8,h-55,'#d1b49a');rect(c,x+4,y+h-30,w-8,23,'#9b6355');
  for(let yy=y+51;yy<y+h-31;yy+=8)rect(c,x+5,yy,w-10,1,'#b49986');
  rect(c,x-6,y+30,w+12,26,'#41363d');rect(c,x-4,y+31,w+8,19,'#74818b');
  for(let yy=0;yy<4;yy++)rect(c,x-2,y+32+yy*4,w+4,1,'#9aa6a9');
  rect(c,x-7,y+49,w+14,6,dream?'#cb7185':'#eaa88a');rect(c,x-5,y+49,w+10,2,'#ffd6aa');
  // Continuous window reveals a checkerboard counter, red stools, and coffee.
  for(let i=0;i<4;i++) {
    const xx=x+15+i*51;
    box(c,xx,y+63,47,58,'#694644','#29313b');rect(c,xx+3,y+66,41,36,dream?'#a05b62':'#c4936c');
    rect(c,xx+3,y+67,41,5,'#e9bc87');rect(c,xx+3,y+90,41,3,'#6e5348');
    rect(c,xx+3,y+105,41,8,'#e2c9a4');
    for(let j=0;j<6;j++)rect(c,xx+4+j*7,y+106,4,3,j%2?'#d1b593':'#503e3d');
    for(let j=0;j<2;j++){rect(c,xx+10+j*22,y+96,8,3,'#f9dfad');rect(c,xx+13+j*22,y+95,3,2,'#fff1cf');rect(c,xx+12+j*20,y+115,12,3,'#9b3444');rect(c,xx+16+j*20,y+118,3,8,'#3e333c');}
    rect(c,xx+4,y+68,4,27,'#edcc9950');rect(c,xx+43,y+65,2,56,'#c6a58c');
  }
  box(c,x+224,y+65,39,87,'#453c41','#27323a');box(c,x+228,y+70,31,54,'#a87b67','#b5a08b');
  lettering(c,'OPEN',x+232,y+83,dream?'#f49fa7':'#ffd399');rect(c,x+252,y+134,3,3,'#edcc99');
  for(let i=0;i<8;i++){rect(c,x+10+i*34,y+128,29,7,'#e3c6a2');rect(c,x+12+i*34,y+137,25,2,'#583d40');}
  box(c,x+59,y+1,155,28,'#50313e','#1b2630');rect(c,x+61,y+3,151,2,'#e79d8f');
  lettering(c,'MERCY DINER',x+69,y+10,'#ffd2a4',2);rect(c,x+64,y+23,142,2,'#e99087');
  rect(c,x+130,y-14,4,15,'#3a3a44');rect(c,x+105,y-18,54,8,dream?'#a65d75':'#c66c57');
  rect(c,x+113,y-23,38,5,'#e2a473');rect(c,x+124,y-29,16,6,'#ffd29a');
  rect(c,x-8,y+h-5,w+16,6,'#d1bba3');rect(c,x-11,y+h+1,w+22,5,p.edge);
  pixelOval(c,x+34,y+h+2,215,30,dream?'#ad678426':'#f2b27c25');
}

function curtainRoom(c,x,y,p,dream=false) {
  const w=258,h=239;
  shadow(c,x,y+h-5,w+15,20,p);
  rect(c,x,y,w,h,'#15212c');rect(c,x+8,y+8,w-16,h-15,'#44343d');
  // Thick velvet drapes and an exposed, playable chevron waiting room.
  rect(c,x+12,y+51,w-24,h-65,dream?'#e8d9c4':'#bdb4a8');
  for(let yy=0;yy<h-70;yy+=24)for(let xx=0;xx<w-24;xx+=40) {
    for(let i=0;i<10;i++) {
      const xxx=x+12+xx+i*2,yyy=y+51+yy+i*2;
      if(yyy+5<y+h-14)rect(c,xxx,yyy,2,5,dream?'#322735':'#35373b');
      if(yyy+5<y+h-14)rect(c,xxx+20,y+51+yy+18-i*2,2,5,dream?'#322735':'#35373b');
    }
  }
  rect(c,x+12,y+16,w-24,33,'#4f1d31');
  for(let xx=x+12;xx<x+w-12;xx+=10) {rect(c,xx,y+15,8,39,dream?'#a72c49':'#822a3a');rect(c,xx+2,y+17,3,30,dream?'#d3515a':'#b44747');rect(c,xx+7,y+18,2,31,'#551f31');}
  for(let i=0;i<4;i++) {
    const width=40-i*8;
    for(const xx of [x+8,x+w-8-width]){rect(c,xx,y+51+i*29,width,47,dream?'#922a45':'#792d3a');for(let j=2;j<width;j+=9)rect(c,xx+j,y+52+i*29,3,43,dream?'#c24957':'#a34849');}
  }
  rect(c,x+8,y+8,w-16,7,'#a68c76');rect(c,x+11,y+9,w-22,2,'#debc91');
  for(const xx of [x+8,x+w-16]){rect(c,xx,y+15,8,h-25,'#3f2935');rect(c,xx+2,y+18,2,h-32,'#986b68');}
  box(c,x+70,y-20,118,25,'#382730','#8b5f5e');lettering(c,'THE VELVET',x+79,y-12,'#e4bc94',2);
  // The vacant chair faces the opening. Its twin is slightly displaced.
  for(const xx of [x+67,x+174]) {
    rect(c,xx,y+142,20,31,'#211d2c');rect(c,xx+2,y+140,16,26,dream?'#cb6475':'#944650');
    rect(c,xx+3,y+144,13,3,'#d68c83');rect(c,xx-3,y+157,26,8,'#52273a');
    rect(c,xx,y+163,20,8,'#aa5160');rect(c,xx+2,y+170,3,12,'#272534');rect(c,xx+16,y+170,3,12,'#272534');
  }
  rect(c,x+117,y+130,27,16,'#372938');rect(c,x+120,y+128,21,6,'#b88a77');rect(c,x+129,y+144,3,25,'#372938');
  if(dream){rect(c,x+128,y+95,3,24,'#eee0c4');rect(c,x+126,y+96,7,4,'#f6e8cc');rect(c,x+130,y+90,2,5,'#fff2c4');}
  rect(c,x-3,y+h-7,w+6,5,'#a18a7f');rect(c,x+11,y+h-2,w-22,5,p.path);
}

function motel(c,x,y,p,dream=false) {
  const w=258,h=111;
  shadow(c,x,y+h-8,w+8,16,p);rect(c,x,y+23,w,h-23,'#1a2430');rect(c,x+3,y+25,w-6,h-28,'#ae9b89');
  rect(c,x-5,y+8,w+10,23,'#2a303c');rect(c,x-3,y+9,w+6,15,dream?'#a34659':'#8b534d');
  for(let xx=x;xx<x+w;xx+=16){rect(c,xx,y+10,12,1,'#bf8172');rect(c,xx+5,y+15,8,2,'#67424a');}
  for(let i=0;i<4;i++) {
    const xx=x+9+i*61;
    box(c,xx,y+41,25,32,dream?'#514158':'#52676c','#30313a');rect(c,xx+2,y+43,21,3,'#e3be94');
    for(let yy=0;yy<4;yy++)rect(c,xx+3,y+47+yy*6,19,2,'#bca691');
    box(c,xx+35,y+40,19,62,'#674a48','#292c36');rect(c,xx+37,y+43,15,19,dream?'#cb838d':'#c49877');
    pix(c,xx+49,y+75,'#d9b282',2);lettering(c,'7',xx+41,y+64,'#d4bf9d');
    rect(c,xx+35,y+101,21,3,'#cfb398');
  }
  rect(c,x-4,y+h-6,w+8,5,'#c5b199');rect(c,x-7,y+h-1,w+14,5,p.edge);
  rect(c,x+w+16,y-46,4,h+46,'#24313b');box(c,x+w+3,y-43,33,89,'#45323e','#17222e');
  for(const [i,l] of [...'MOTEL'].entries())lettering(c,l,x+w+14,y-33+i*14,dream?'#ed90b1':'#ffd295',2);
  rect(c,x+w+5,y+35,29,4,'#b95e70');rect(c,x+w+9,y+36,21,1,'#ffc0a3');
}

function car(c,x,y,p,color='#92474c') {
  shadow(c,x-19,y-7,42,14,p);stepped(c,x-20,y-23,41,22,'#1a2530');stepped(c,x-18,y-23,37,19,color);
  rect(c,x-10,y-28,22,11,'#2e3e48');rect(c,x-8,y-27,18,5,'#849197');rect(c,x-8,y-19,18,2,'#b78372');
  rect(c,x-15,y-9,31,2,'#b9aaa0');rect(c,x-18,y-13,6,3,'#ffe0aa');rect(c,x+12,y-13,6,3,'#ffe0aa');
  rect(c,x-18,y-5,8,4,'#1a2530');rect(c,x+11,y-5,8,4,'#1a2530');
}

function bamboo(c,x,y,p,size=1) {
  const h=Math.round(74*size);
  shadow(c,x-10,y-4,22,8,p);
  for(const [dx,dy] of [[-5,12],[1,0],[8,21]]) {
    rect(c,x+dx,y-h+dy,4,h-dy,'#375f4a');rect(c,x+dx+1,y-h+dy,2,h-dy,'#a0b76b');
    for(let yy=y-h+dy+6;yy<y-5;yy+=15){rect(c,x+dx-1,yy,6,2,'#4d7652');rect(c,x+dx+1,yy+2,2,1,'#dbce91');}
    for(let i=0;i<3;i++){const xx=x+dx, yy=y-h+dy+12+i*17;rect(c,xx-13,yy-5,11,3,p.tree[1]);rect(c,xx-9,yy-8,7,3,p.tree[2]);rect(c,xx+3,yy+2,14,3,p.tree[1]);rect(c,xx+5,yy-1,8,3,p.tree[3]);}
  }
}

function stoneWall(c,x,y,w,p,height=22) {
  rect(c,x,y,w,height,p.ink);rect(c,x+1,y+1,w-2,height-2,'#899684');
  for(let yy=y+3;yy<y+height-4;yy+=8)for(let xx=x+3+(yy%16?8:0);xx<x+w-5;xx+=20){rect(c,xx,yy,16,6,'#b1b49a');rect(c,xx+2,yy+1,12,1,'#d2ccb0');}
  rect(c,x-2,y-2,w+4,5,'#d9d2b1');rect(c,x,y+height-1,w,3,'#647465');
}

function pagodaRoof(c,x,y,w,p,tier=0) {
  const height=42+tier*2;
  for(let i=0;i<9;i++) {
    const inset=28-i*3;
    rect(c,x+inset,y+i*4,w-inset*2,6,i%2?p.roof:p.roofDark);
    rect(c,x+inset+1,y+i*4,w-inset*2-2,1,p.roofLight);
    for(let xx=x+inset+3;xx<x+w-inset-3;xx+=11){rect(c,xx,y+i*4+1,2,3,p.roofLight);rect(c,xx+5,y+i*4+3,3,1,p.roofDark);}
  }
  rect(c,x-4,y+height-9,w+8,8,p.roofDark);rect(c,x-8,y+height-12,12,8,p.roof);rect(c,x+w-4,y+height-12,12,8,p.roof);
  rect(c,x-9,y+height-16,6,7,p.roofDark);rect(c,x+w+3,y+height-16,6,7,p.roofDark);
  rect(c,x-5,y+height-10,w+10,2,p.roofLight);rect(c,x+25,y-2,w-50,4,p.roofDark);rect(c,x+28,y-3,w-56,2,p.roofLight);
}

// The Reed village crest joins a curling river to a three-leaf reed.
// It repeats on architecture and metal forehead protectors.
function reedEmblem(c,x,y,color,size=1) {
  const marks=[[0,3,2,6],[2,1,7,2],[2,9,7,2],[9,3,2,6],[4,4,5,2],[4,5,2,3],[6,7,3,2],[8,0,2,3],[10,-2,2,4],[12,-4,2,4],[13,-5,4,2],[11,11,6,2],[15,9,2,3]];
  for(const [xx,yy,w,h] of marks)rect(c,x+xx*size,y+yy*size,w*size,h*size,color);
}

function carvedLeader(c,x,y,p,index) {
  const stone='#cda570',shade='#a87d53',lit='#eed0a0',ink='#865f46';
  // Distinct original portraits: swept hair, a topknot, a hood, and a broad beard.
  pixelOval(c,x-44,y+51,90,34,shade);rect(c,x-22,y+39,45,35,stone);rect(c,x-15,y+45,31,28,lit);
  stepped(c,x-34,y-14,69,76,shade);stepped(c,x-30,y-15,61,73,stone);rect(c,x-26,y-11,45,4,lit);
  rect(c,x-25,y+5,19,5,ink);rect(c,x+8,y+5,18,5,ink);rect(c,x-22,y+12,14,4,shade);rect(c,x+10,y+12,14,4,shade);
  rect(c,x-3,y+10,9,27,shade);rect(c,x-5,y+11,4,24,lit);rect(c,x-11,y+36,23,4,ink);rect(c,x-15,y+50,32,4,shade);
  if(index===0){for(let i=0;i<5;i++)rect(c,x-33+i*13,y-26+i*3,17,17,stone);rect(c,x-31,y-20,60,5,lit);rect(c,x-30,y-4,18,7,shade);}
  else if(index===1){stepped(c,x-28,y-28,57,19,shade);rect(c,x-11,y-45,22,22,shade);rect(c,x-8,y-43,16,5,lit);rect(c,x-31,y-10,64,10,lit);reedEmblem(c,x-9,y-10,ink,1);}
  else if(index===2){rect(c,x-38,y-21,77,14,shade);rect(c,x-42,y-8,16,68,shade);rect(c,x+28,y-8,16,68,shade);rect(c,x-33,y-20,65,4,lit);rect(c,x-12,y+44,27,4,shade);}
  else {rect(c,x-31,y-21,64,17,shade);rect(c,x-28,y-18,58,4,lit);stepped(c,x-31,y+36,64,38,shade);for(let i=0;i<4;i++)rect(c,x-21+i*13,y+43,4,22,stone);rect(c,x-12,y+40,26,4,ink);}
  for(const [xx,yy] of [[-30,23],[26,40],[-13,59],[36,71]])rect(c,x+xx,y+yy,4,3,shade);
}

function leaderRidge(c,p) {
  // A sunny sandstone monument rises behind the training grounds.
  for(let i=0;i<6;i++){
    const inset=i<3?(3-i)*32:(i-3)*10;
    rect(c,477+inset,54+i*23,788-inset*2,34,i%2?'#caa477':'#d8b484');
    rect(c,488+inset,56+i*23,761-inset*2,4,'#eed2a0');
    for(let xx=508+inset;xx<1240-inset;xx+=53)rect(c,xx,73+i*23,23,2,'#b68e63');
  }
  for(const [i,x] of [617,787,958,1120].entries())carvedLeader(c,x,121+(i%2)*5,p,i);
  for(let i=0;i<10;i++){const x=481+i*77;rect(c,x,184,54,18,'#be9768');rect(c,x+3,184,48,3,'#e8cb95');rect(c,x+5,199,42,3,'#a88a62');}
  rect(c,489,204,761,7,'#62864e');rect(c,492,203,755,3,'#a0c476');
}

function leadershipTower(c,h,p) {
  const {x,y,w,h:height}=h,bottom=y+height;
  shadow(c,x+3,bottom-13,w+5,25,p);
  // Cylindrical plaster tiers keep the old mentor hall's walkable footprint.
  stepped(c,x+12,y+13,w-24,height-18,'#8c583e');stepped(c,x+15,y+13,w-30,height-22,'#ffe4aa');
  rect(c,x+w-31,y+27,14,height-38,'#d6b579');rect(c,x+20,y+28,7,height-39,'#fff3cb');
  for(let yy=y+32;yy<bottom-16;yy+=28){rect(c,x+18,yy,w-36,3,'#dbb17b');rect(c,x+20,yy+3,w-40,1,'#f9d497');}
  for(const dx of [31,62,111,142]){
    box(c,x+dx,y+32,19,25,'#5589ab','#8b674e');rect(c,x+dx+2,y+34,15,4,'#b7e0d6');rect(c,x+dx+9,y+34,1,20,'#ebd8ab');
  }
  pixelOval(c,x+3,y+7,w-6,29,'#854a37');pixelOval(c,x+3,y+2,w-6,24,'#ee8d44');pixelOval(c,x+12,y+5,w-24,15,'#ffc168');
  for(let xx=x+14;xx<x+w-15;xx+=11)rect(c,xx,y+14,4,4,'#b85d35');
  // Upper drum and its broad orange roof terrace.
  rect(c,x+40,y-36,w-80,49,'#be6b40');rect(c,x+42,y-34,w-84,44,'#f6c783');rect(c,x+w-55,y-34,10,44,'#daa86c');
  for(let i=0;i<4;i++){box(c,x+50+i*25,y-23,17,19,'#4e86a3','#9b7049');rect(c,x+52+i*25,y-21,13,3,'#acd9d0');}
  pixelOval(c,x+31,y-47,w-62,26,'#965036');pixelOval(c,x+32,y-51,w-64,22,'#ec8340');pixelOval(c,x+39,y-49,w-78,14,'#ffb15a');
  rect(c,x+50,y-53,w-100,4,'#f8c069');rect(c,x+49,y-58,w-98,3,'#e29351');
  // Tanks, pipework, antenna, and a rooftop railing give the village its bustle.
  rect(c,x+63,y-79,22,27,'#647a79');pixelOval(c,x+62,y-83,24,9,'#b3c1a7');rect(c,x+66,y-79,4,22,'#9bb3a5');rect(c,x+63,y-61,22,3,'#415b66');
  rect(c,x+112,y-76,17,25,'#ba9366');pixelOval(c,x+111,y-80,19,8,'#efce90');rect(c,x+113,y-58,15,3,'#8b714f');
  rect(c,x+137,y-68,4,37,'#577579');rect(c,x+128,y-69,13,4,'#9fb3a4');rect(c,x+123,y-69,5,9,'#6c8583');
  rect(c,x+89,y-103,2,48,'#57727a');rect(c,x+80,y-96,20,2,'#b0baa6');rect(c,x+86,y-106,8,2,'#b0baa6');
  for(let xx=x+41;xx<x+w-35;xx+=13){rect(c,xx,y-38,2,10,'#c49156');rect(c,xx,y-38,14,2,'#e6ba75');}
  // The entrance and crest align with Ren below the tower.
  box(c,x+w/2-20,bottom-49,41,42,'#96764e','#725640');rect(c,x+w/2-16,bottom-45,33,33,'#d7b57a');
  rect(c,x+w/2-1,bottom-45,2,33,'#836746');rect(c,x+w/2-14,bottom-31,28,2,'#8a7050');
  box(c,x+w/2-24,y+55,49,25,'#d66e39','#9b5237');reedEmblem(c,x+w/2-11,y+61,'#fff0ba',1.25);
  for(const dx of [9,w-23]){rect(c,x+dx,y+45,14,40,'#315f86');rect(c,x+dx+2,y+48,10,3,'#b7d9c2');rect(c,x+dx+4,y+55,6,19,'#f6e9b9');}
  rect(c,x+6,bottom-6,w-12,7,'#a57d50');rect(c,x+10,bottom-5,w-20,2,'#f1d199');
  rect(c,x+w/2-27,bottom+1,55,4,p.shade);rect(c,x+w/2-31,bottom+5,63,3,p.edge);
}

function villageRamen(c,h,p,index=2) {
  const {x,y,w,h:height}=h,bottom=y+height;
  shadow(c,x-5,bottom-8,w+12,18,p);
  stepped(c,x+2,y+24,w-4,height-27,'#915c42');stepped(c,x+5,y+25,w-10,height-31,'#fff0c0');
  rect(c,x+w-17,y+27,10,height-35,'#d4b787');
  // Low round red roof instead of another pagoda.
  for(let i=0;i<6;i++){const inset=(5-i)*6;rect(c,x+inset,y+i*5,w-inset*2,7,i%2?'#da7042':'#b85d3b');rect(c,x+inset+2,y+i*5,w-inset*2-4,1,'#ffa564');}
  rect(c,x-4,y+30,w+8,6,'#924d35');rect(c,x-2,y+31,w+4,2,'#ffc077');
  box(c,x+11,y+42,w-22,14,'#2c5571','#795840');lettering(c,'RAMEN',x+w/2-wordWidth('RAMEN',2)/2,y+46,'#fff0b6',2);
  // Open counter with orange noren, stools, bowls, and a little steaming kitchen.
  rect(c,x+12,y+61,w-24,height-67,'#6d634f');rect(c,x+15,y+64,w-30,height-74,'#ddbd81');
  rect(c,x+15,bottom-30,w-30,9,'#a87348');rect(c,x+13,bottom-23,w-26,6,'#ebc18a');
  for(let i=0;i<4;i++){
    const xx=x+16+i*(w-30)/4;
    rect(c,xx,y+58,(w-30)/4-2,24,'#ee8c37');rect(c,xx+2,y+60,(w-30)/4-6,3,'#ffb954');
    if(i===1)reedEmblem(c,xx+6,y+65,'#fff3c5',.55);
    else {rect(c,xx+8,y+65,3,10,'#fff2bd');rect(c,xx+5,y+69,9,2,'#fff2bd');}
  }
  for(let i=0;i<3;i++){
    const xx=x+27+i*(w-46)/3;
    pixelOval(c,xx,bottom-32,17,6,'#e9573b');pixelOval(c,xx+2,bottom-34,13,5,'#fff1c4');rect(c,xx+4,bottom-34,8,2,'#e3b77c');
    rect(c,xx+9,bottom-37,2,7,'#a88457');rect(c,xx+13,bottom-38,2,7,'#a88457');
    rect(c,xx+2,bottom-13,16,4,'#335e7a');rect(c,xx+4,bottom-9,3,12,'#765a42');rect(c,xx+13,bottom-9,3,12,'#765a42');
    rect(c,xx+4,bottom-43,3,4,'#fff8d4a0');rect(c,xx+6,bottom-48,3,4,'#fff8d480');
  }
  for(const xx of [x+4,x+w-14]){rect(c,xx,y+62,2,25,'#685842');box(c,xx-3,y+82,10,19,'#ef7735','#a15336');rect(c,xx-1,y+84,6,2,'#ffd28a');rect(c,xx-1,y+96,6,2,'#a75234');}
  rect(c,x-3,bottom-4,w+6,5,'#b88f5b');rect(c,x-3,bottom-3,w+6,2,'#ecd0a2');
  // Kitchen flue and roof-mounted blue tank.
  rect(c,x+w-34,y-23,7,35,'#7d9290');rect(c,x+w-36,y-25,12,4,'#c0cdb0');rect(c,x+w-31,y-22,2,24,'#b0bcaa');
  rect(c,x+22,y-20,25,24,'#4988a4');pixelOval(c,x+21,y-24,27,8,'#88c5c6');rect(c,x+24,y-16,20,2,'#b6dac8');
}

function clanBanner(c,x,y,p,color='#bc6253',mark='REED') {
  rect(c,x-2,y-52,3,55,'#6d5945');rect(c,x-3,y-52,24,3,'#a58965');
  rect(c,x+3,y-48,18,38,color);rect(c,x+5,y-47,2,35,'#f0d5a0');rect(c,x+18,y-47,2,35,'#6b4643');
  reedEmblem(c,x+5,y-37,'#fff1bc',.7);
  rect(c,x+3,y-10,8,3,color);rect(c,x+15,y-10,6,3,color);rect(c,x+11,y-13,4,3,color);
  if(mark==='MOON'){rect(c,x+12,y-40,5,8,color);rect(c,x+13,y-41,5,8,color);}
}

function shinobiHouse(c,h,p,index=0) {
  const {x,y,w,h:height}=h,bottom=y+height,wall=y+44;
  shadow(c,x-5,bottom-10,w+14,22,p);rect(c,x+4,wall,w-8,height-44,p.ink);rect(c,x+7,wall+1,w-14,height-50,p.wall);
  rect(c,x+w-23,wall+3,16,height-52,p.shade);rect(c,x+8,bottom-23,w-16,17,'#9d7c58');
  for(let xx=x+12;xx<x+w-9;xx+=32)rect(c,xx,wall+3,4,height-50,'#7a6250');
  if([1,3,5].includes(index)) {
    // Low curved plaster and tile roofs make the residential district feel lived in.
    for(let i=0;i<8;i++){const inset=Math.max(0,31-i*5);rect(c,x+inset-4,y+i*5,w+8-inset*2,7,i%2?'#d4894c':'#c7793f');rect(c,x+inset-1,y+i*5,w+2-inset*2,1,'#ffc078');}
    rect(c,x-7,y+39,w+14,5,'#965a39');rect(c,x-5,y+40,w+10,2,'#ffce83');
    rect(c,x+w-31,y-23,20,29,'#6b95a1');pixelOval(c,x+w-32,y-28,22,9,'#bdd6bd');rect(c,x+w-28,y-17,14,2,'#b4d4c2');
    rect(c,x+w-8,y-19,4,47,'#92a59a');rect(c,x+w-10,y-20,10,3,'#c5d2b4');
  } else pagodaRoof(c,x-4,y,w+8,p,index%2);
  for(const xx of [x+19,x+w-46]) {
    box(c,xx,wall+12,27,28,'#665f58','#5a4d43');rect(c,xx+2,wall+14,23,23,'#a8c2af');
    for(let i=1;i<4;i++)rect(c,xx+2+i*6,wall+14,1,23,'#e4d5ad');rect(c,xx+2,wall+23,23,2,'#e4d5ad');
    rect(c,xx-2,wall+40,31,4,'#775c48');
  }
  box(c,x+w/2-14,bottom-43,28,36,'#715d4a','#53483f');rect(c,x+w/2-11,bottom-40,22,29,'#bbac81');
  for(let i=0;i<4;i++)rect(c,x+w/2-10+i*6,bottom-40,2,29,'#7c6b4f');rect(c,x+w/2-10,bottom-31,21,2,'#7c6b4f');
  rect(c,x-4,bottom-6,w+8,7,'#6d5945');rect(c,x-4,bottom-5,w+8,2,'#d1b98a');
  rect(c,x+w/2-24,bottom+1,48,4,p.shade);rect(c,x+w/2-28,bottom+5,56,3,p.edge);
  if(index===0){box(c,x+w/2-28,wall+2,56,12,'#2d695d','#664f40');lettering(c,'REED',x+w/2-13,wall+5,'#f0d8a4');}
  if(index===1){box(c,x+w/2-25,wall+1,50,12,'#285b86','#6b583f');lettering(c,'SHINOBI',x+w/2-14,wall+4,'#ffe9ac');reedEmblem(c,x+12,bottom-26,'#f6d37c',.65);rect(c,x+9,bottom-27,30,2,'#297286');}
  if(index===2){for(let i=0;i<7;i++){rect(c,x+9+i*20,wall+40,20,9,i%2?'#dbb76c':'#aa5e4c');rect(c,x+9+i*20,wall+48,20,3,i%2?'#aa8b55':'#773f3c');}}
  clanBanner(c,x+w+10,bottom-4,p,index%2?'#347ba2':'#e57e38',index%2?'MOON':'REED');
}

function torii(c,x,y,p,w=92) {
  for(const dx of [-w*.36,w*.36]){rect(c,x+dx-4,y-76,9,80,'#743f3c');rect(c,x+dx-2,y-74,5,71,'#c56550');rect(c,x+dx-6,y-6,13,10,'#685345');}
  rect(c,x-w/2-5,y-81,w+10,8,'#613d3b');rect(c,x-w/2-9,y-86,w+18,7,'#bd674f');rect(c,x-w/2-12,y-90,12,7,'#773e3d');rect(c,x+w/2,y-90,12,7,'#773e3d');
  rect(c,x-w/2+3,y-65,w-6,7,'#ad5948');rect(c,x-w/2+4,y-66,w-8,2,'#e09165');
  box(c,x-17,y-81,35,29,'#315d84','#854c36');rect(c,x-14,y-78,29,23,'#f0b15c');
  reedEmblem(c,x-10,y-71,'#294e70',1.15);
  if(w>110){rect(c,x-43,y-58,86,18,'#ee9141');for(let xx=x-42;xx<x+43;xx+=17){rect(c,xx,y-57,15,17,'#ffad53');rect(c,xx+2,y-54,11,2,'#ffe4a0');}lettering(c,'HIDDEN REED',x-24,y-49,'#654b39');}
}

function trainingLog(c,x,y,p) {
  shadow(c,x-12,y-5,28,12,p);rect(c,x-8,y-35,16,35,'#634e3e');rect(c,x-6,y-33,12,31,'#9b7b51');
  for(let i=0;i<3;i++)rect(c,x-4+i*4,y-31,1,30,'#bd9a62');
  pixelOval(c,x-9,y-37,18,9,'#d8b47b');pixelOval(c,x-5,y-35,10,5,'#ab8455');rect(c,x-4,y-16,8,2,'#e6d8a5');
  rect(c,x-16,y-23,32,5,'#6d533f');rect(c,x-15,y-23,30,2,'#ae8b55');rect(c,x-4,y-24,8,9,'#8f6c48');
}

function terracedCliff(c,x,y,w,h,p) {
  rect(c,x,y,w,h,'#7a8067');
  for(let yy=0;yy<h;yy+=13){rect(c,x+(yy%26?4:0),y+yy,w-(yy%26?8:0),3,'#a5a887');for(let xx=6;xx<w-12;xx+=33)rect(c,x+xx+(yy%2?12:0),y+yy+6,17,2,'#5f6e5b');}
  rect(c,x-3,y-4,w+6,8,p.tree[1]);rect(c,x-2,y-4,w+4,3,p.tree[3]);rect(c,x+4,y+4,w-8,2,p.tree[0]);
}

function buildMysteryWorld(c,p,dream) {
  ground(c,'lynch',p);
  // Mercy Falls follows a lonely highway, with the mountain forest looming above it.
  asphalt(c,0,665,1600,89,p);asphalt(c,685,690,83,462,p,true);asphalt(c,0,410,709,67,p);
  rect(c,716,308,34,350,p.edge);rect(c,720,308,26,350,p.path);
  rect(c,449,305,30,119,p.edge);rect(c,453,305,22,119,p.path);
  rect(c,1164,348,148,39,p.edge);rect(c,1170,352,138,31,p.path);
  rect(c,1223,264,124,80,p.edge);rect(c,1228,269,114,70,p.ground);
  for(let i=0;i<5;i++){rect(c,989+i*18,634,12,29,'#b4a091');rect(c,989+i*18,637,12,1,'#d9bba2');}
  // A mountain escarpment is made from layered pixel terraces.
  for(let i=0;i<9;i++){rect(c,180+i*13,70+i*8,575-i*28,18,'#192e34');rect(c,192+i*13,73+i*8,541-i*27,3,'#35534d');}
  rect(c,62,185,490,31,'#3c4447');rect(c,65,187,483,3,'#626062');
  for(let i=0;i<19;i++){rect(c,72+i*25,201,3,37,'#2b363d');rect(c,74+i*25,199,3,32,'#5a5755');}
  const objects=[],r=rng(86423),features=NEW_FEATURES.lynch;
  const safe=(x,y)=>Math.abs(y-710)>74&&!(x>278&&x<595&&y>455&&y<704)&&!(x>876&&x<1204&&y>332&&y<655)&&!(x>1164&&x<1504&&y>600&&y<830)&&!(x>400&&x<540&&y>247&&y<423)&&!(x>681&&x<782&&y>304)&&!(y>397&&y<490&&x<724)&&!(x>1156&&x<1385&&y>231&&y<400)&&features.every(f=>Math.hypot(x-f.x,y-f.y)>56);
  for(let i=0;i<355;i++){const x=22+Math.floor(r()*1555),y=74+Math.floor(r()*1050);if(!safe(x,y))continue;const size=.8+r()*.52;objects.push({y,draw:()=>cedar(c,x,y,p,size,dream)});}
  for(const [x,y,s] of [[249,501,1.4],[281,592,1.1],[600,543,1.3],[644,577,1.2],[822,481,1.6],[866,540,1.2],[1169,480,1.4],[1220,228,1.45],[1448,302,1.6],[1343,183,1.4],[562,351,1.3]])objects.push({y,draw:()=>cedar(c,x,y,p,s,dream)});
  objects.push({y:653,draw:()=>diner(c,302,487,p,dream)});
  objects.push({y:622,draw:()=>curtainRoom(c,913,376,p,dream)});
  objects.push({y:778,draw:()=>motel(c,1187,662,p,dream)});
  // The switchboard office is deliberately much too small for its telephone lines.
  objects.push({y:301,draw:()=>{
    cottage(c,{x:411,y:204,w:112,h:104,kind:'home'},p,'lynch',0);
    box(c,416,258,102,15,'#27363b','#141d29');lettering(c,'MERCY EXCHANGE',423,263,'#e7c09b');
    rect(c,530,166,3,157,'#182632');rect(c,510,172,42,3,'#48505a');rect(c,518,165,3,17,'#bd9e8c');rect(c,542,165,3,17,'#bd9e8c');
    for(let i=0;i<32;i++)rect(c,534+i*12,175+Math.round(Math.sin(i/31*Math.PI)*34),12,1,'#182632');
  }});
  objects.push({y:319,draw:()=>telephone(c,464,306,p,dream)});
  // The Black Pine is both a clearing and a threshold. Its center stays walkable.
  for(const [x,y] of [[1274,239],[1300,208],[1371,238],[1386,289],[1275,315]])objects.push({y,draw:()=>cedar(c,x,y,p,1.5,dream)});
  objects.push({y:278,draw:()=>{pixelOval(c,1302,247,58,36,'#162333');rect(c,1321,246,21,4,'#77616c');rect(c,1328,235,7,11,'#ddd4bb');rect(c,1328,237,2,8,'#8a7d84');}});
  for(const [x,y] of [[330,662],[612,677],[883,679],[1163,677],[1480,699],[680,468],[1139,351],[759,855]])objects.push({y,draw:()=>nightLamp(c,x,y,p,dream)});
  for(const [x,y,color] of [[405,803,'#85525a'],[531,798,'#78848a'],[1087,816,'#9e7758'],[1327,806,'#476575']])objects.push({y,draw:()=>car(c,x,y,p,color)});
  for(const [x,y] of [[424,668],[515,669],[1201,786]])objects.push({y,draw:()=>bench(c,x,y,p,'lynch')});
  objects.push({y:703,draw:()=>{rect(c,627,605,4,99,'#303440');box(c,603,610,52,54,'#22313b','#b88a72');lettering(c,'MERCY',610,619,'#eac89d',2);lettering(c,'FALLS',610,636,'#eac89d',2);rect(c,610,653,38,2,'#ac6270');}});
  for(const [x,y,w] of [[898,816,205],[284,852,353],[1153,917,346]])objects.push({y,draw:()=>{fence(c,x,y,w,p,'lynch');for(let xx=x+10;xx<x+w;xx+=37)rect(c,xx,y+19,3,5,'#606761');}});
  objects.push({y:981,draw:()=>{
    rect(c,935,885,149,95,'#24313a');rect(c,931,884,157,10,'#7b4a4e');rect(c,939,895,141,76,'#9c8f81');
    box(c,972,915,50,31,'#3c4853','#4d393b');rect(c,975,918,44,3,'#e0c2a1');lettering(c,'TV',989,926,'#93a9ad',2);
    rect(c,976,941,41,3,dream?'#d897b7':'#dcb69c');rect(c,938,969,143,8,'#685451');
  }});
  objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
  // Small wet patches carry reflections without hiding the pixel art.
  for(const [x,y,w] of [[368,727,77],[580,752,54],[893,721,63],[1015,657,64],[1267,835,80]]){rect(c,x,y,w,3,dream?'#906074':'#596373');rect(c,x+7,y+4,w-20,2,dream?'#6f5169':'#45515c');rect(c,x+12,y+1,w-30,1,'#b89489');}
  if(dream){for(let y=0;y<1152;y+=28)rect(c,0,y,1600,1,'#f0ced807');}
}

function buildShinobiWorld(c,p) {
  ground(c,'shinobi',p);
  // Reedwater cuts the western valley. Both hand-built bridges are traversable.
  for(let y=0;y<1152;y+=8) {
    const xx=322+Math.round(Math.sin(y/145)*15/2)*2;
    rect(c,xx-9,y,99,8,'#778f68');rect(c,xx-3,y,86,8,p.waterDark);rect(c,xx+4,y,73,8,p.water);
    if(y%24===0){rect(c,xx+14,y+2,21,2,'#bce0c5');rect(c,xx+45,y+5,17,2,'#94d7c5');}
  }
  const path=(x,y,w,h)=>{rect(c,x,y,w,h,p.edge);rect(c,x+4,y+4,w-8,h-8,p.path);};
  path(410,584,1190,60);path(734,236,63,916);path(451,699,682,58);path(350,823,419,60);path(782,371,517,48);path(1169,338,105,290);
  path(487,527,32,239);path(1042,638,29,235);
  // A broad, asymmetrical plaza sits below the mentor hall.
  rect(c,639,566,293,166,'#b1a581');rect(c,644,571,283,156,'#d0c49e');
  for(let y=575;y<725;y+=14)for(let x=648;x<925;x+=24){rect(c,x+(y%28?0:10),y,20,11,'#ded5ad');rect(c,x+2,y+2,15,1,'#ede1b9');}
  for(const by of [511,820]){
    rect(c,307,by,116,74,'#725c45');for(let x=308;x<424;x+=8){rect(c,x,by+5,6,61,'#b8986a');rect(c,x+1,by+5,2,61,'#dec08a');}
    rect(c,302,by-2,127,6,'#7b5a42');rect(c,302,by+71,127,5,'#7b5a42');rect(c,302,by-3,127,2,'#e5c88f');
    for(let x=306;x<428;x+=24){rect(c,x,by-12,5,18,'#79573f');rect(c,x,by+64,5,18,'#79573f');rect(c,x+1,by-12,2,16,'#d7af72');}
  }
  // Northern training ground: a ring of cut timber and clay scuffed by footwork.
  pixelOval(c,639,221,361,186,'#bba06f');pixelOval(c,648,228,343,174,'#d7bd86');
  for(let i=0;i<180;i++){const rr=rng(4400+i),xx=654+rr()*325,yy=240+rr()*151;if(Math.hypot((xx-820)*.7,yy-315)<92)rect(c,xx,yy,5,2,i%2?'#c7aa78':'#ecd6a4');}
  for(const [x,y,w,h] of [[521,183,145,55],[884,154,233,63],[1182,173,220,46],[449,422,177,63],[1100,896,331,65]])terracedCliff(c,x,y,w,h,p);
  leaderRidge(c,p);
  // Rice terraces across the water and a little west-bank shrine.
  for(let i=0;i<3;i++){box(c,93,342+i*39,192,34,'#6ca394','#557e65');for(let x=104;x<275;x+=14){rect(c,x,349+i*39,3,19,'#b7c989');rect(c,x-4,355+i*39,4,3,'#93b373');}}
  const objects=[],r=rng(92734),features=NEW_FEATURES.shinobi;
  const houses=[{x:670,y:416,w:193,h:139},{x:453,y:620,w:139,h:112},{x:985,y:570,w:161,h:129},{x:886,y:793,w:157,h:121},{x:1159,y:188,w:136,h:159},{x:121,y:711,w:119,h:109},{x:1087,y:472,w:112,h:100}];
  const safe=(x,y)=>!(x>447&&x<1293&&y<233)&&!(x>290&&x<437)&&!(Math.abs(y-614)<62&&x>430)&&!(x>718&&x<820&&y>215)&&!(y>681&&y<775&&x>425&&x<1180)&&!(y>805&&y<902&&x>295&&x<820)&&!(y>345&&y<443&&x>746&&x<1317)&&!(x>1151&&x<1300&&y>321&&y<660)&&!(x>605&&x<973&&y>541&&y<760)&&!(x>619&&x<1016&&y>204&&y<425)&&!(x>480&&x<540&&y>512&&y<779)&&!houses.some(h=>x>h.x-34&&x<h.x+h.w+42&&y>h.y-30&&y<h.y+h.h+37)&&features.every(f=>Math.hypot(x-f.x,y-f.y)>54);
  for(let i=0;i<415;i++) {
    const x=24+Math.floor(r()*1550),y=60+Math.floor(r()*1055);if(!safe(x,y))continue;
    const size=.8+r()*.5;objects.push({y,draw:()=>i%3===0?bamboo(c,x,y,p,size):tree(c,x,y,p,'shinobi',size)});
  }
  houses.forEach((h,i)=>objects.push({y:h.y+h.h,draw:()=>{
    if(i===0)leadershipTower(c,h,p);
    else if(i===2)villageRamen(c,h,p,i);
    else shinobiHouse(c,h,p,i);
    if(i===4){pagodaRoof(c,h.x+9,h.y-38,h.w-18,p,1);rect(c,h.x+19,h.y-7,h.w-38,20,'#e1d1a4');pagodaRoof(c,h.x+24,h.y-72,h.w-48,p,1);rect(c,h.x+h.w/2-2,h.y-89,4,18,'#897452');rect(c,h.x+h.w/2-7,h.y-89,14,3,'#b8a278');}
  }}));
  objects.push({y:482,draw:()=>torii(c,1223,478,p,97)});
  objects.push({y:806,draw:()=>torii(c,764,806,p,137)});
  objects.push({y:860,draw:()=>torii(c,214,860,p,69)});
  for(const [x,y] of [[700,288],[866,288],[715,365],[915,364]])objects.push({y,draw:()=>trainingLog(c,x,y,p)});
  objects.push({y:250,draw:()=>{stoneWall(c,651,242,94,p,16);stoneWall(c,824,242,150,p,16);clanBanner(c,771,252,p,'#3d7970');}});
  // An ancient inscription and shrine remain open in front of the watchtower.
  objects.push({y:443,draw:()=>{
    for(const dx of [-45,45]){box(c,1260+dx-7,404,15,39,'#9fa58e','#657569');rect(c,1260+dx-8,403,17,4,'#dfd3aa');rect(c,1260+dx-4,411,9,7,'#e8c98b');rect(c,1260+dx-4,432,9,2,'#697a69');}
    rect(c,1249,390,23,7,'#9a9e89');rect(c,1254,377,13,15,'#d8cfad');rect(c,1259,380,3,9,'#896b55');
  }});
  for(const [x,y,w] of [[546,525,97],[877,525,112],[957,753,191],[490,781,173],[1126,671,128]])objects.push({y,draw:()=>stoneWall(c,x,y,w,p)});
  for(const [x,y] of [[433,550],[467,595],[570,568],[895,464],[961,536],[1154,580],[1325,374],[414,814],[498,902],[1167,812],[1433,714]])objects.push({y,draw:()=>bamboo(c,x,y,p,1.1)});
  // Reed clan mission board, water basin, hanging lanterns, and supply scrolls.
  objects.push({y:695,draw:()=>{
    box(c,854,628,50,37,'#a88758','#594e42');rect(c,851,624,57,7,'#6f5441');rect(c,858,634,42,3,'#e9d5a7');
    for(let i=0;i<3;i++){rect(c,859+i*13,640,10,18,'#efdbac');rect(c,861+i*13,644,6,1,'#9c815d');rect(c,861+i*13,648,6,1,'#9c815d');rect(c,859+i*13,640,10,2,'#bd7351');}
    rect(c,858,663,4,31,'#735c44');rect(c,896,663,4,31,'#735c44');
  }});
  objects.push({y:695,draw:()=>{
    pixelOval(c,670,657,42,25,'#7e8b77');pixelOval(c,673,654,36,22,'#d7d1a8');pixelOval(c,678,657,26,15,p.waterDark);rect(c,681,659,16,3,p.water);
    rect(c,692,636,4,28,'#876d4f');rect(c,683,636,13,3,'#c5ab72');rect(c,684,639,2,10,'#bce3d1');
  }});
  for(const [x,y] of [[643,640],[966,640],[1137,722],[448,721],[805,443],[856,819]])objects.push({y,draw:()=>{
    rect(c,x-1,y-41,3,41,'#745d46');rect(c,x-8,y-43,16,3,'#6b5742');box(c,x-7,y-40,14,16,'#dfae69','#855b44');rect(c,x-5,y-37,10,2,'#f9d897');rect(c,x-5,y-30,10,2,'#aa7250');rect(c,x-3,y-23,6,2,'#cc8e5b');
  }});
  objects.push({y:738,draw:()=>{smallProp(c,958,731,p,'shinobi','barrel');smallProp(c,976,733,p,'shinobi','crate');rect(c,951,712,8,14,'#efe1bb');rect(c,950,711,10,3,'#b86350');rect(c,950,726,10,3,'#b86350');}});
  // Modern village utility poles and dangling shop lanterns cross the older roofs.
  objects.push({y:702,draw:()=>{
    for(const [px,py] of [[617,699],[951,705]]){
      rect(c,px-2,py-117,5,117,'#705a45');rect(c,px-18,py-117,36,4,'#956d45');
      for(const dx of [-14,0,14]){rect(c,px+dx-2,py-126,5,10,'#a9c2b1');rect(c,px+dx-3,py-121,7,2,'#587e8a');}
      rect(c,px-3,py-4,7,5,'#617356');
    }
    for(let i=0;i<48;i++){
      const xx=619+i*7,yy=579+Math.round(Math.sin(i/47*Math.PI)*35);
      rect(c,xx,yy,7,1,'#35505a');rect(c,xx,yy+5,7,1,'#72816a');
      if(i%8===4){rect(c,xx+2,yy+1,1,9,'#59644f');box(c,xx-1,yy+9,9,13,'#f19d48','#a76d3f');rect(c,xx+1,yy+10,5,2,'#ffe8a6');rect(c,xx+1,yy+19,5,1,'#b86639');}
    }
    // A small hanging village crest on the quartermaster's frontage.
    box(c,558,674,23,26,'#376d92','#946b46');reedEmblem(c,562,683,'#ffe8a6',.9);
  }});
  objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
  // Reeds shimmer along the riverbanks. Their marks are hand-built, like the roofs.
  for(let i=0;i<112;i++) {const yy=48+i*10;if(yy>485&&yy<591||yy>795&&yy<906)continue;const x=302+(i%3)*4+(i%2?119:0);rect(c,x,yy,2,12,'#6f8758');rect(c,x-4,yy+3,4,2,'#bed393');rect(c,x+2,yy+5,4,2,'#bed393');rect(c,x,yy-4,2,5,'#dec58a');}
  for(let i=0;i<360;i++){const x=28+Math.floor(r()*1540),y=40+Math.floor(r()*1074);if(safe(x,y))flower(c,x,y,p,'shinobi',i);}
}

function buildNewWorld(theme,phase='waking') {
  const dream=theme==='lynch'&&phase==='dream',p=dream?DREAM_PALETTE:PALETTES[theme];
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1600,1152):Object.assign(document.createElement('canvas'),{width:1600,height:1152});
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  if(theme==='lynch')buildMysteryWorld(c,p,dream);else buildShinobiWorld(c,p);
  caches.set(theme==='lynch'?`${theme}:${phase}`:theme,canvas);return canvas;
}

function buildWorld(theme) {
  const p=PALETTES[theme]||PALETTES.moss;
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1600,1152):Object.assign(document.createElement('canvas'),{width:1600,height:1152});
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  ground(c,theme,p);river(c,p,theme);roads(c,p,theme);
  const objects=[],r=rng(4177);
  const safe=(x,y)=>!(Math.abs(y-584)<66||Math.abs(x-805)<58||Math.abs(y-883)<39&&x>355&&x<1360||x>650&&x<911&&y>412&&y<555||x>1176&&x<1255&&y>265&&y<610||HOUSES.some(h=>x>h.x-24&&x<h.x+h.w+24&&y>h.y-32&&y<h.y+h.h+38)||getWorldFeatures(theme).some(f=>Math.hypot(x-f.x,y-f.y)<48));
  // Groves along the outskirts; a few trees frame the village square.
  for(let i=0;i<560;i++) {
    const x=26+Math.floor(r()*1548), y=43+Math.floor(r()*1083);
    if(x>248&&x<389||!safe(x,y))continue;
    if(theme==='neon'&&i%3!==0)continue;
    const size=0.85+r()*0.55;
    objects.push({y,draw:()=>theme==='moss'&&i%7===0?pine(c,x,y,p):tree(c,x,y,p,theme,size)});
  }
  // Deliberate framing gives each preview the feeling of a little diorama.
  for(const [x,y,size] of [[469,365,1.4],[452,420,1.2],[648,331,1.25],[680,363,1.1],[883,325,1.25],[1092,365,1.4],[1099,420,1.2],[454,541,1.1],[1081,537,1.1],[670,662,1.2],[878,671,1.2]])objects.push({y,draw:()=>tree(c,x,y,p,theme,size)});
  for(const [i,h] of HOUSES.entries())objects.push({y:h.y+h.h,draw:()=>theme==='neon'?cyberBuilding(c,h,p,i):theme==='dust'?frontierBuilding(c,h,p,i):cottage(c,h,p,theme,i)});
  for(let i=0;i<150;i++) {
    const x=Math.floor(r()*1530)+30,y=Math.floor(r()*1080)+40;
    if(!safe(x,y)||x>253&&x<383)continue;
    objects.push({y,draw:()=>rock(c,x,y,p,theme,0.4+r()*0.5)});
  }
  // Garden borders and small objects give the streets lived-in detail.
  for(const [x,y,w] of [[487,468,163],[905,478,169],[511,792,154],[1099,338,190],[440,251,126],[187,887,170]])objects.push({y:y+12,draw:()=>fence(c,x,y,w,p,theme)});
  for(const [x,y] of [[538,487],[633,486],[934,492],[1037,492],[745,411],[853,413],[498,634],[1060,631]]) {
    for(let j=0;j<6;j++)flower(c,x+(j%3)*7,y+Math.floor(j/3)*7,p,theme,j);
    if(theme==='neon'){box(c,x-4,y-8,25,26,'#345849','#171f34');for(let j=0;j<3;j++)flower(c,x+j*6,y,p,theme,j);}
  }
  for(const [x,y] of [[665,545],[1069,550],[504,643],[1071,822],[411,544],[1369,549],[769,395],[849,740]])objects.push({y,draw:()=>lamp(c,x,y,p,theme)});
  for(const [x,y,kind] of [[650,447,'barrel'],[664,444,'crate'],[914,473,'mailbox'],[512,453,'mailbox'],[1255,573,'sign'],[471,605,'sign'],[1079,745,'barrel'],[693,397,'mushroom'],[1068,516,'mushroom'],[468,493,'mushroom']])objects.push({y,draw:()=>smallProp(c,x,y,p,theme,kind)});
  objects.push({y:525,draw:()=>townCenter(c,p,theme)});
  for(const [index,x,y] of [[0,1220,340],[1,390,900],[2,1300,880]])objects.push({y:y+15,draw:()=>landmarkScenery(c,x,y,p,theme,index)});
  objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
  // Colorful wildflower meadows, grit, and strange growths off the beaten track.
  for(let i=0;i<700;i++) {
    const x=Math.floor(r()*1560)+20,y=Math.floor(r()*1110)+20;
    if(!safe(x,y)||x>250&&x<390)continue;
    if(theme==='dust'&&i%3===0){rect(c,x,y,2,6,'#ad8b56');rect(c,x-3,y+1,3,2,'#ad8b56');rect(c,x+2,y-2,2,4,'#ad8b56');}
    else if(theme!=='neon'||i%8===0)flower(c,x,y,p,theme,i);
  }
  if(theme==='neon') {
    // Pixel puddles reflecting windows; no smooth gradients.
    for(const [x,y,w] of [[563,528,53],[961,529,38],[861,565,34],[1114,606,65],[643,593,43],[772,658,36]]) {rect(c,x,y,w,4,'#376175');rect(c,x+6,y+4,w-12,3,'#3b4667');rect(c,x+10,y+1,w-23,1,'#77b7b1');}
    // Cables strung between buildings.
    for(let i=0;i<22;i++){rect(c,633+i*14,370+Math.round(Math.sin(i/21*Math.PI)*17),14,1,'#171e31');}
  }
  if(theme==='dust') {
    // Railway approaching the southern outpost.
    for(let x=0;x<650;x+=14){rect(c,x,993,5,30,'#856347');rect(c,x,995,5,2,'#b89765');}
    rect(c,0,999,650,3,'#777775');rect(c,0,1014,650,3,'#777775');rect(c,0,999,650,1,'#c2bca0');rect(c,0,1014,650,1,'#c2bca0');
    for(let i=0;i<5;i++){rect(c,1390+i*8,130+i*7,110-i*16,52,'#b9835a');rect(c,1390+i*8,130+i*7,110-i*16,4,'#e0b87b');}
  }
  caches.set(theme,canvas);return canvas;
}

export function getSpawn(theme='moss') {
  if(theme==='lynch')return {x:742,y:704};
  if(theme==='shinobi')return {x:758,y:696};
  return {x:780,y:586};
}

export function getWorldFeatures(theme='moss') {
  if(NEW_FEATURES[theme])return NEW_FEATURES[theme].map(feature=>({...feature}));
  const names=FEATURE_NAMES[theme]||FEATURE_NAMES.moss;
  return [
    {x:700,y:551,type:'npc',name:names[0],kind:'guide'},
    {x:967,y:558,type:'npc',name:names[1],kind:'merchant'},
    {x:559,y:810,type:'npc',name:names[2],kind:'ranger'},
    {x:1220,y:340,type:'landmark',name:names[3]},
    {x:390,y:900,type:'landmark',name:names[4]},
    {x:1300,y:880,type:'landmark',name:names[5]},
    {x:618,y:499,type:'chest',name:names[6]},
    {x:1358,y:904,type:'chest',name:names[7]},
  ];
}

export function getObstacles(theme='moss') {
  if(theme==='lynch')return [
    {x:306,y:537,width:272,height:109},
    {x:415,y:231,width:105,height:72},
    {x:450,y:250,width:29,height:57},
    {x:917,y:383,width:250,height:48},
    {x:919,y:421,width:22,height:177},
    {x:1143,y:421,width:24,height:177},
    {x:1190,y:688,width:252,height:82},
    {x:937,y:885,width:145,height:91},
  ];
  if(theme==='shinobi') {
    const houses=[{x:670,y:416,w:193,h:139},{x:453,y:620,w:139,h:112},{x:985,y:570,w:161,h:129},{x:886,y:793,w:157,h:121},{x:1159,y:188,w:136,h:159},{x:121,y:711,w:119,h:109},{x:1087,y:472,w:112,h:100}];
    const obstacles=houses.map(h=>({x:h.x+4,y:h.y+30,width:h.w-8,height:h.h-30}));
    for(let y=0;y<1152;y+=8) {
      if(y>=512&&y<592||y>=824&&y<896)continue;
      obstacles.push({x:319+Math.round(Math.sin(y/145)*15/2)*2,y,width:86,height:8});
    }
    for(const [x,y] of [[700,288],[866,288],[715,365],[915,364]])obstacles.push({x:x-10,y:y-9,width:20,height:12});
    return obstacles;
  }
  const obstacles=HOUSES.map(h=>({x:h.x+3,y:h.y+25,width:h.w-6,height:h.h-25}));
  obstacles.push({x:786,y:476,width:37,height:35});
  // The bridge is the only crossing. Its generous span keeps traversal easy.
  for(let y=0;y<1152;y+=16) {
    if(y>=544&&y<624)continue;
    if(theme==='neon')obstacles.push({x:271,y,width:69,height:16});
    else if(theme==='dust')obstacles.push({x:294+Math.round(Math.sin(y/120)*20/4)*4,y,width:y>820?46:20,height:16});
    else obstacles.push({x:270+Math.round(Math.sin(y/115)*26/4)*4,y,width:80+Math.round(Math.sin(y/150)*18/4)*4,height:16});
  }
  return obstacles;
}

function drawEmberCharacter(c,x,y,opts) {
  const npc=opts.npc||opts.type==='npc',key=opts.kind||'',facing=opts.facing||'down',time=opts.time||0;
  const moving=!!(opts.walking||opts.moving),running=moving||!!opts.sprinting;
  const step=moving?Math.floor(time*(opts.sprinting?13:9))%2:0;
  x=Math.round(x);y=Math.round(y);
  const ink='#243d54',skin=key==='elder'?'#d7b494':'#f0c59e',metal='#d1ddd6';
  let coat=npc?'#628967':'#f39337',trim='#2f557d',hair=npc?'#393b4b':'#ffd657';
  if(npc){
    coat={guide:'#648e5c',merchant:'#ece1b5',ranger:'#a87faa',quartermaster:'#758b64',elder:'#ead6a6',rival:'#426298'}[key]||'#6d9871';
    trim={guide:'#374f6b',merchant:'#ca7c42',ranger:'#45627a',quartermaster:'#956f49',elder:'#d88943',rival:'#294d7c'}[key]||'#365678';
    hair={guide:'#dbe2d2',merchant:'#a36549',ranger:'#40364c',quartermaster:'#797559',elder:'#e3d5b2',rival:'#283743'}[key]||'#43514c';
  }
  rect(c,x-8,y-3,17,4,'#29464c50');
  // Open-toe sandals, pale leg wraps, and orange trousers remain legible at 1×.
  const legA=step?2:0,legB=step?-2:0;
  rect(c,x-6,y-14+legA,5,13-legA,ink);rect(c,x+2,y-14+legB,5,13-legB,ink);
  rect(c,x-5,y-13+legA,3,6,coat);rect(c,x+3,y-13+legB,3,6,coat);
  rect(c,x-5,y-7+legA,4,4,'#e9ddba');rect(c,x+3,y-7+legB,4,4,'#e9ddba');
  rect(c,x-5,y-6+legA,4,1,'#b6bbab');rect(c,x+3,y-6+legB,4,1,'#b6bbab');
  rect(c,x-7,y-3+legA,7,3,trim);rect(c,x+2,y-3+legB,7,3,trim);
  rect(c,x-6,y-1+legA,4,1,skin);rect(c,x+4,y-1+legB,4,1,skin);
  // Sleeves move behind the body in the characteristic arms-back sprint.
  if(running&&facing==='right'){
    rect(c,x-14,y-26,9,4,trim);rect(c,x-18,y-23,7,4,coat);rect(c,x-20,y-21,4,3,skin);
    rect(c,x-11,y-20,6,3,trim);rect(c,x-16,y-18,7,3,coat);rect(c,x-19,y-17,4,3,skin);
  }else if(running&&facing==='left'){
    rect(c,x+6,y-26,9,4,trim);rect(c,x+12,y-23,7,4,coat);rect(c,x+17,y-21,4,3,skin);
    rect(c,x+6,y-20,6,3,trim);rect(c,x+10,y-18,7,3,coat);rect(c,x+16,y-17,4,3,skin);
  }else if(running){
    const yy=facing==='up'?-19:-29;
    rect(c,x-12,yy,7,4,trim);rect(c,x-16,yy-3,6,4,coat);rect(c,x-18,yy-5,4,3,skin);
    rect(c,x+7,yy,7,4,trim);rect(c,x+12,yy-3,6,4,coat);rect(c,x+16,yy-5,4,3,skin);
  }else{
    rect(c,x-10,y-24+step,4,12,ink);rect(c,x-9,y-23+step,3,6,trim);rect(c,x-9,y-17+step,3,5,coat);rect(c,x-9,y-12+step,3,3,skin);
    rect(c,x+8,y-24-step,4,12,ink);rect(c,x+8,y-23-step,3,6,trim);rect(c,x+8,y-17-step,3,5,coat);rect(c,x+8,y-12-step,3,3,skin);
  }
  rect(c,x-7,y-26,15,14,ink);rect(c,x-6,y-25,13,12,coat);
  rect(c,x-6,y-26,13,4,trim);rect(c,x-6,y-25,3,7,trim);rect(c,x+4,y-25,3,7,trim);
  if(!npc){
    rect(c,x-4,y-21,3,7,'#ffbb58');rect(c,x-1,y-22,2,10,'#d1dbc8');rect(c,x+1,y-20,4,8,'#f6a442');
    rect(c,x-6,y-14,13,2,'#315981');rect(c,x+4,y-14,3,2,'#ccd6c2');
    if(facing==='up'){rect(c,x-5,y-21,11,8,'#e98734');pixelOval(c,x-3,y-20,7,6,'#fff0bd');rect(c,x-1,y-19,3,3,'#c65d31');}
  }else if(key==='guide'||key==='quartermaster'){
    rect(c,x-5,y-24,5,10,coat);rect(c,x+2,y-24,5,10,coat);rect(c,x,y-25,2,11,'#b1b78d');
    for(const xx of [-4,3]){rect(c,x+xx,y-21,3,3,'#9cb47c');rect(c,x+xx,y-16,3,2,'#4b7152');}
    rect(c,x-6,y-13,13,2,trim);
  }else if(key==='rival'){
    rect(c,x-6,y-28,13,7,'#355581');rect(c,x-5,y-27,11,2,'#7595b5');
    if(facing==='up'){pixelOval(c,x-3,y-20,7,6,'#d5e1dc');rect(c,x-3,y-21,7,3,'#ba6d68');}
  }else if(key==='elder'){
    rect(c,x-7,y-15,16,9,'#ead6a6');rect(c,x-1,y-24,3,16,'#d98945');rect(c,x-5,y-15,3,8,'#f6e6b7');
  }else if(key==='merchant'){rect(c,x-4,y-21,10,10,'#e3b166');rect(c,x-4,y-15,10,2,'#c27b43');}
  rect(c,x-6,y-36,13,12,ink);rect(c,x-5,y-35,11,10,skin);rect(c,x-7,y-32,3,6,skin);rect(c,x+6,y-32,3,6,skin);
  rect(c,x-6,y-38,13,7,hair);rect(c,x-7,y-35,3,6,hair);rect(c,x+6,y-35,3,6,hair);
  // A sharp blond silhouette replaces the earlier generic cap and scarf.
  if(!npc){
    for(const [xx,yy,w,h] of [[-7,-39,4,4],[-5,-43,4,6],[-1,-45,3,7],[2,-43,4,6],[5,-41,4,5],[8,-37,3,4]])rect(c,x+xx,y+yy,w,h,hair);
    rect(c,x-4,y-41,2,5,'#fff29a');rect(c,x+1,y-42,2,5,'#ffe98a');rect(c,x+5,y-38,3,3,'#eab13c');
  }else if(key==='guide'){
    for(const [xx,yy] of [[-7,-39],[-3,-43],[1,-42],[5,-40]])rect(c,x+xx,y+yy,4,7,hair);
    rect(c,x-4,y-40,3,3,'#f5f2d9');
  }else if(key==='rival'){
    for(const [xx,yy] of [[-7,-39],[-4,-42],[0,-44],[4,-41],[7,-38]])rect(c,x+xx,y+yy,4,6,hair);
    rect(c,x-4,y-39,2,3,'#485c65');
  }else if(key==='ranger'){rect(c,x-9,y-34,3,12,hair);rect(c,x+8,y-34,3,12,hair);rect(c,x-10,y-24,4,3,'#a87faa');}
  rect(c,x-7,y-33,15,4,trim);rect(c,x-4,y-33,9,3,metal);rect(c,x-3,y-33,7,1,'#f4f0d6');
  reedEmblem(c,x-2,y-32,'#526f78',.32);
  // Two cloth ties flutter behind the forehead protector.
  const flutter=Math.floor(Math.sin(time*9)*2);
  if(facing==='left'){rect(c,x+8,y-32,7,2,trim);rect(c,x+14,y-32+flutter,6,2,trim);rect(c,x+10,y-29,7,2,trim);}
  else if(facing==='right'){rect(c,x-14,y-32,7,2,trim);rect(c,x-19,y-32+flutter,6,2,trim);rect(c,x-17,y-29,7,2,trim);}
  else{rect(c,x+7,y-32,7,2,trim);rect(c,x+12,y-30+flutter,5,2,trim);rect(c,x+9,y-28,6,2,trim);}
  if(facing==='up'){rect(c,x-5,y-31,11,7,hair);rect(c,x-3,y-34,7,2,npc?hair:'#fff08f');}
  else if(facing==='left'){rect(c,x-6,y-30,2,2,ink);rect(c,x-7,y-28,2,2,skin);}
  else if(facing==='right'){rect(c,x+5,y-30,2,2,ink);rect(c,x+7,y-28,2,2,skin);}
  else {rect(c,x-3,y-30,2,2,ink);rect(c,x+3,y-30,2,2,ink);rect(c,x,y-26,2,1,'#bc8a6b');}
  if(!npc&&facing!=='up'){rect(c,x-5,y-27,2,1,'#b98463');rect(c,x+4,y-27,2,1,'#b98463');}
  if(npc&&key==='guide'&&facing!=='up'){
    rect(c,x-5,y-27,11,5,'#3c586d');rect(c,x-5,y-27,11,1,'#718c98');rect(c,x-4,y-31,3,4,'#809a9e');
  }
  if(npc&&key==='elder'){rect(c,x-10,y-36,21,3,'#d8aa64');rect(c,x-7,y-39,15,4,'#eec785');rect(c,x-2,y-29,5,2,'#f2e4c3');rect(c,x-3,y-24,7,3,'#d9c9a9');}
  if(opts.attacking){const side=facing==='left'?-1:1;rect(c,x+side*16,y-28,2,13,'#cee5de');rect(c,x+side*16-2,y-18,6,2,'#83a8b6');rect(c,x+side*16,y-31,2,3,'#f5efc9');}
}

function drawThematicCharacter(c,x,y,theme,opts) {
  if(theme==='shinobi'){drawEmberCharacter(c,x,y,opts);return;}
  const p=opts.phase==='dream'?DREAM_PALETTE:PALETTES[theme],npc=opts.npc||opts.type==='npc';
  const t=opts.time||0,step=opts.walking||opts.moving?Math.floor(t*9)%2:0,facing=opts.facing||'down';
  const key=opts.kind||'',name=opts.name||'',dream=opts.phase==='dream';
  x=Math.round(x);y=Math.round(y);
  rect(c,x-8,y-3,17,4,p.ink+'60');
  const ink=theme==='lynch'?'#14202c':'#304049',skin=key==='double'?'#a4a0a3':'#e9c3a0';
  let coat=theme==='lynch'?'#b89d7b':'#486c78',hair=theme==='lynch'?'#5b4841':'#343d48';
  if(npc&&theme==='lynch') {
    coat={guide:'#6d7180',merchant:'#dfc9a8',ranger:'#ad4960',clerk:'#546379',operator:'#74a199',double:'#867b83'}[key]||'#947888';
    hair={guide:'#4d4040',merchant:'#80483f',ranger:'#d0b184',clerk:'#79808b',operator:'#5c454b',double:'#45414d'}[key]||hair;
  } else if(npc) {
    coat={guide:'#628679',merchant:'#c58456',ranger:'#758c9a',quartermaster:'#a68c60',elder:'#bca584',rival:'#654b70'}[key]||'#748e78';
    hair={guide:'#abb5a7',merchant:'#5e4541',ranger:'#34494b',quartermaster:'#785741',elder:'#e1d9bc',rival:'#3b394e'}[key]||hair;
  }
  rect(c,x-6,y-12,5,11,ink);rect(c,x+2,y-12,5,11,ink);
  rect(c,x-5,y-10,3,6,theme==='lynch'?'#55525d':'#708389');rect(c,x+3,y-10,3,6,theme==='lynch'?'#55525d':'#708389');
  rect(c,x-7,y-3-step,7,3,ink);rect(c,x+2,y-3+step,7,3,ink);
  // Tall coat and shoulder seam distinguish the investigator from the shinobi.
  rect(c,x-7,y-24,15,15,ink);rect(c,x-6,y-23,13,13,coat);
  if(theme==='lynch') {
    rect(c,x-8,y-14,17,8,ink);rect(c,x-7,y-14,15,6,coat);rect(c,x-6,y-22,4,3,'#d5bd9a');
    rect(c,x-1,y-21,3,14,'#6e6064');rect(c,x-4,y-19,3,3,'#ede0b7');rect(c,x+3,y-19,3,3,'#c8b394');
    if(npc&&key==='merchant'){rect(c,x-4,y-17,10,11,'#f0ddba');rect(c,x-5,y-18,12,2,'#a66d5b');}
    if(!npc||key==='double'){box(c,x-3,y-15,8,6,'#555b62',ink);rect(c,x-1,y-13,4,3,'#bec4b7');}
  } else {
    rect(c,x-5,y-20,11,6,coat);rect(c,x-2,y-22,5,9,'#b7c6ac');
    rect(c,x-6,y-13,13,3,'#394b53');rect(c,x-4,y-12,3,2,'#cbb788');
    rect(c,x-5,y-24,12,4,npc&&key==='rival'?'#c499aa':'#d78360');
    // A red scarf trails in the direction opposite movement.
    const scarf=facing==='left'?1:-1;
    rect(c,x+scarf*7,y-22,7,3,'#bb644e');rect(c,x+scarf*11,y-20+step,6,3,'#dc9672');
    if(npc&&key==='guide'){rect(c,x-6,y-22,5,9,'#7f9a84');rect(c,x+3,y-22,5,9,'#7f9a84');rect(c,x-5,y-17,3,2,'#c8cca3');rect(c,x+4,y-17,3,2,'#c8cca3');}
  }
  rect(c,x-10,y-22+step,4,11,ink);rect(c,x-9,y-21+step,3,8,coat);rect(c,x-9,y-14+step,3,4,skin);
  rect(c,x+8,y-22-step,4,11,ink);rect(c,x+8,y-21-step,3,8,coat);rect(c,x+8,y-14-step,3,4,skin);
  rect(c,x-6,y-34,13,12,ink);rect(c,x-5,y-33,11,10,skin);rect(c,x-7,y-30,3,6,skin);rect(c,x+5,y-30,3,6,skin);
  rect(c,x-6,y-36,13,6,hair);rect(c,x-7,y-33,3,7,hair);rect(c,x+6,y-33,3,7,hair);
  if(theme==='shinobi') {
    rect(c,x-4,y-39,3,4,hair);rect(c,x+2,y-40,3,5,hair);rect(c,x+5,y-37,4,3,hair);
    rect(c,x-7,y-31,15,4,'#354d60');rect(c,x-4,y-31,9,3,'#ccd4c0');rect(c,x,y-31,2,2,'#6f8d80');
    rect(c,x+8,y-29,6,2,'#354d60');rect(c,x+12,y-27,4,2,'#354d60');
  } else if(npc&&key==='guide') {
    rect(c,x-5,y-39,11,6,'#565060');rect(c,x-9,y-34,20,3,'#7e7275');rect(c,x-4,y-35,9,1,'#b4a290');
  } else if(npc&&key==='clerk') {rect(c,x-6,y-35,13,5,'#606c7c');rect(c,x-7,y-31,15,2,'#344356');}
  if(facing==='up') {rect(c,x-5,y-31,11,7,hair);rect(c,x-3,y-33,7,2,theme==='lynch'?'#7c6352':'#536367');}
  else if(facing==='left') {rect(c,x-6,y-28,2,2,ink);rect(c,x-7,y-26,2,2,skin);}
  else if(facing==='right') {rect(c,x+5,y-28,2,2,ink);rect(c,x+7,y-26,2,2,skin);}
  else {rect(c,x-3,y-28,2,2,ink);rect(c,x+3,y-28,2,2,ink);rect(c,x,y-24,2,1,'#b08270');}
  if(key==='double'){rect(c,x-4,y-28,9,2,dream?'#f6d9a2':'#4a4558');rect(c,x-5,y-31,2,2,'#e2d6c2');}
  if(!npc&&theme==='lynch') {
    // The camera and flashlight are carried in plain view, even at rest.
    rect(c,x+9,y-16,9,3,'#d8c495');rect(c,x+15,y-18,5,7,'#efe0b7');rect(c,x+18,y-17,2,5,'#fff4c7');
    if(facing==='right'||opts.attacking)for(let i=0;i<4;i++)rect(c,x+22+i*8,y-18-i,8,8+i*2,'#ffe3a112');
  }
  if(opts.attacking&&theme==='shinobi') {const side=facing==='left'?-1:1;rect(c,x+side*15,y-23,2,14,'#dbe3cf');rect(c,x+side*15-2,y-11,6,2,'#cbaa7b');rect(c,x+side*15,y-27,2,4,'#9bb9b3');}
}

export function drawCharacter(c,x,y,theme='moss',opts={}) {
  if(theme==='lynch'||theme==='shinobi'){drawThematicCharacter(c,x,y,theme,opts);return;}
  const p=PALETTES[theme]||PALETTES.moss, npc=opts.npc||opts.type==='npc';
  const t=opts.time||0,step=(opts.walking||opts.moving)?Math.floor(t*8)%2:0;
  const facing=opts.facing||'down', colors=npc?['#dcbe73','#78a8a7','#c393b7']:['#f1c879','#9be3d0','#f1d194'];
  const skin=npc?'#e3bd90':'#f1cba2';
  const coat=npc?(theme==='neon'?'#b584c9':theme==='dust'?'#986854':theme==='odd'?'#b394bc':'#ba855d'):(theme==='neon'?'#71dfd3':theme==='dust'?'#d38059':theme==='odd'?'#e3b774':'#e27b5c');
  const outline=theme==='neon'?'#172037':'#3e4351';
  x=Math.round(x);y=Math.round(y);
  // Feet define each sprite's world location.
  rect(c,x-6,y-2,13,3,p.ink+'50');
  rect(c,x-5,y-9,4,8,outline);rect(c,x+2,y-9,4,8,outline);
  rect(c,x-4,y-7,3,4,'#5b6175');rect(c,x+2,y-7,3,4,'#5b6175');
  rect(c,x-6,y-3-step,5,3,'#4c4a50');rect(c,x+2,y-3+step,5,3,'#4c4a50');
  rect(c,x-6,y-16,13,9,outline);rect(c,x-5,y-16,11,8,coat);rect(c,x-5,y-15,3,3,npc?'#dfb379':colors[0]);
  rect(c,x-8,y-15+step,3,7,outline);rect(c,x-7,y-14+step,2,5,skin);rect(c,x+7,y-15-step,3,7,outline);rect(c,x+7,y-14-step,2,5,skin);
  if(facing==='up') {rect(c,x-4,y-14,9,7,npc?'#7e776c':'#557f87');rect(c,x-2,y-12,5,4,npc?'#a69a76':'#8fb7a3');}
  else {rect(c,x-1,y-15,3,8,npc?'#8d604d':'#f4d58c');rect(c,x-4,y-9,10,2,npc?'#9e765d':'#6d6c65');}
  // Hair, face, ear, and a bright cap are built from individual rectangles.
  rect(c,x-6,y-25,13,10,outline);rect(c,x-5,y-25,11,9,skin);rect(c,x-6,y-23,13,5,skin);
  rect(c,x-5,y-27,11,4,npc?'#816352':'#594b47');rect(c,x-7,y-24,3,5,npc?'#816352':'#594b47');rect(c,x+5,y-24,3,5,npc?'#816352':'#594b47');
  if(npc) {rect(c,x-7,y-27,15,3,theme==='moss'?'#779668':theme==='neon'?'#c28ed4':theme==='dust'?'#b59064':'#cfabc2');rect(c,x-4,y-30,9,4,theme==='moss'?'#88a673':theme==='neon'?'#ab72c3':theme==='dust'?'#b59064':'#cfabc2');}
  else {rect(c,x-5,y-29,11,4,theme==='neon'?'#df6bb0':theme==='odd'?'#bf7191':'#dd6656');rect(c,x-6,y-26,13,3,theme==='neon'?'#e684c3':theme==='odd'?'#dda0b2':'#f2946a');rect(c,x-5,y-27,5,2,'#ffe2a8');}
  if(facing==='up'){rect(c,x-5,y-24,11,7,npc?'#816352':'#594b47');rect(c,x-3,y-24,7,2,npc?'#a17d5e':'#7e6455');}
  else if(facing==='left'){rect(c,x-6,y-21,2,2,outline);rect(c,x-7,y-19,2,3,skin);}
  else if(facing==='right'){rect(c,x+5,y-21,2,2,outline);rect(c,x+7,y-19,2,3,skin);}
  else {rect(c,x-3,y-21,2,2,outline);rect(c,x+3,y-21,2,2,outline);rect(c,x,y-17,2,1,'#b78368');}
  if(opts.attacking) {const side=facing==='left'?-1:1;rect(c,x+side*12,y-20,2,15,'#d6e5de');rect(c,x+side*12-3,y-9,8,2,'#eed29c');}
}

function drawChest(c,e,p,theme) {
  const x=e.x,y=e.y;
  shadow(c,x-10,y-4,21,6,p);
  box(c,x-10,y-14,21,14,theme==='neon'?'#515979':p.roof,p.ink);
  rect(c,x-8,y-13,17,5,theme==='neon'?'#6e91a1':p.roofLight);rect(c,x-10,y-7,21,2,p.roofDark);
  rect(c,x-6,y-13,2,12,p.accent);rect(c,x+5,y-13,2,12,p.accent);rect(c,x-1,y-8,3,4,p.accent);
  if(e.opened) {rect(c,x-9,y-19,19,5,p.roofDark);rect(c,x-7,y-17,15,2,p.roofLight);rect(c,x-8,y-12,17,4,p.ink);}
}

function drawEnemy(c,e,p,theme,time) {
  const x=Math.round(e.x),y=Math.round(e.y),b=Math.floor(Math.sin(time*4+(e.phase||0))*1.5);
  if(e.defeated)return;
  shadow(c,x-8,y-3,18,5,p);
  if(theme==='lynch') {
    const glitch=Math.floor(time*7+(e.phase||0))%4,ink=e.pacified?'#706b82':'#17202c';
    rect(c,x-5,y-12+b,4,11,ink);rect(c,x+2,y-12+b,4,11,ink);
    rect(c,x-7,y-25+b,15,19,ink);rect(c,x-5,y-35+b,11,12,ink);
    rect(c,x-9,y-23+b,3,12,ink);rect(c,x+8,y-23+b,3,12,ink);
    for(let i=0;i<7;i++){const xx=x-6+((i*7+glitch*3)%11),yy=y-31+i*3+b;rect(c,xx+(i===glitch?3:0),yy,3+(i%3),1,i%2?'#a5a6a0':'#646b76');}
    rect(c,x-3,y-29+b,2,2,e.pacified?'#efd1ae':'#e1d8c0');rect(c,x+3,y-29+b,2,2,e.pacified?'#efd1ae':'#e1d8c0');
    if(glitch===1){rect(c,x-12,y-19+b,24,1,'#baa4a16b');rect(c,x-10,y-7+b,23,1,'#afbdaf60');}
  } else if(theme==='shinobi') {
    const uniform=e.pacified?'#697e78':'#66506b';
    rect(c,x-5,y-11+b,4,10,'#263941');rect(c,x+2,y-11+b,4,10,'#263941');
    rect(c,x-7,y-23+b,15,16,'#283641');rect(c,x-5,y-22+b,11,12,uniform);rect(c,x-5,y-12+b,11,3,'#252e3b');
    rect(c,x-6,y-34+b,13,12,'#25353f');rect(c,x-5,y-30+b,11,5,'#c5b79b');
    rect(c,x-6,y-31+b,13,3,'#829794');rect(c,x-2,y-31+b,6,2,'#d1d6bc');rect(c,x,y-31+b,1,2,'#774b57');
    rect(c,x-3,y-27+b,2,2,'#25353f');rect(c,x+3,y-27+b,2,2,'#25353f');rect(c,x-5,y-24+b,11,3,'#48555f');
    rect(c,x-9,y-22+b,3,11,uniform);rect(c,x+8,y-22+b,3,11,uniform);rect(c,x+10,y-20+b,2,11,'#ced7c2');
    rect(c,x+8,y-31+b,8,2,'#b3746b');rect(c,x+13,y-29+b,7,2,'#bc8b76');
  } else if(theme==='moss') {
    stepped(c,x-10,y-16+b,21,17,'#335957');stepped(c,x-8,y-16+b,17,13,'#67a188');rect(c,x-5,y-15+b,6,3,'#9bcc96');rect(c,x-4,y-9+b,2,3,'#253a46');rect(c,x+3,y-9+b,2,3,'#253a46');
  } else if(theme==='neon') {
    rect(c,x-11,y-15+b,23,9,'#172438');rect(c,x-9,y-14+b,19,6,'#7888a4');rect(c,x-3,y-13+b,7,3,'#ec719f');rect(c,x-14,y-15+b,6,2,'#74d7d1');rect(c,x+9,y-15+b,6,2,'#74d7d1');rect(c,x-1,y-5+b,3,3,'#68e0cc');
  } else if(theme==='dust') {
    rect(c,x-10,y-11+b,21,9,'#755c51');rect(c,x-8,y-11+b,17,6,'#ad8768');rect(c,x-5,y-17+b,5,7,'#755c51');rect(c,x+3,y-17+b,5,7,'#755c51');rect(c,x-2,y-7+b,2,2,'#edc183');rect(c,x+4,y-7+b,2,2,'#edc183');
  } else {
    stepped(c,x-9,y-21+b,19,19,'#e4d4c7');rect(c,x-8,y-4+b,5,4,'#e4d4c7');rect(c,x+4,y-4+b,5,4,'#e4d4c7');rect(c,x-4,y-13+b,3,4,'#665b80');rect(c,x+3,y-13+b,3,4,'#665b80');
  }
  if(e.pacified){rect(c,x-2,y-44,4,3,p.accent);rect(c,x-4,y-46,8,1,p.accent);}
  if(e.health!=null&&e.health<e.maxHealth) {rect(c,x-11,y-26,23,3,p.ink);rect(c,x-10,y-25,21*(e.health/e.maxHealth),1,'#ed9a8e');}
}

export function drawWorld(c,theme='moss',opts={}) {
  const phase=opts.phase||'waking';
  const p=theme==='lynch'&&phase==='dream'?DREAM_PALETTE:PALETTES[theme]||PALETTES.moss,scale=opts.scale||1,x=Math.round(opts.x||0),y=Math.round(opts.y||0);
  const w=opts.width||c.canvas.width,h=opts.height||c.canvas.height,time=opts.time||0;
  const cacheKey=theme==='lynch'?`${theme}:${phase}`:theme;
  const world=caches.get(cacheKey)||((theme==='lynch'||theme==='shinobi')?buildNewWorld(theme,phase):buildWorld(theme));
  c.save();c.imageSmoothingEnabled=false;rect(c,0,0,w,h,p.ground);
  c.drawImage(world,x,y,w/scale,h/scale,0,0,w,h);
  c.scale(scale,scale);c.translate(-Math.round(x),-Math.round(y));
  const actors=[...(opts.entities||[])];
  if(opts.player)actors.push({...opts.player,type:'player'});
  actors.sort((a,b)=>a.y-b.y).forEach(e=> {
    if(e.x<x-45||e.x>x+w/scale+45||e.y<y-65||e.y>y+h/scale+40)return;
    if(e.type==='npc')drawCharacter(c,e.x,e.y,theme,{...e,npc:true,time,phase});
    else if(e.type==='player')drawCharacter(c,e.x,e.y,theme,{...e,time,phase});
    else if(e.type==='chest')drawChest(c,e,p,theme);
    else if(e.type==='enemy')drawEnemy(c,e,p,theme,time);
    else if(e.type==='landmark') {
      if(e.visited||e.discovered){rect(c,e.x-2,e.y-8,4,4,p.accent);rect(c,e.x-1,e.y-10,2,8,p.accent);}
    }
  });
  if(theme==='neon') {
    // Rain drawn as discrete lit pixels; avoids translucent full-screen haze.
    for(let i=0;i<85;i++){const rx=(i*127+43)%Math.floor(w/scale),ry=((i*79+time*55)%Math.floor(h/scale));rect(c,x+rx,y+ry,1,5,'#96b6d24a');}
  }
  if(theme==='odd'||theme==='moss') {
    for(let i=0;i<9;i++){const xx=683+i*26+Math.sin(time+i)*5,yy=390+((i*31)%140)+Math.cos(time+i*2)*3;if(i%3!==Math.floor(time)%3)pix(c,xx,yy,theme==='odd'?'#ffe8b4':'#e7f2af',1);}
  }
  if(theme==='lynch') {
    // Discrete falling rain and the television snow of the other room.
    for(let i=0;i<68;i++){const xx=x+(i*173+31)%Math.floor(w/scale),yy=y+(i*91+time*(phase==='dream'?14:43))%Math.floor(h/scale);rect(c,xx,yy,1,phase==='dream'?1:4,phase==='dream'?'#edc9ce34':'#a0c0cd2c');}
    const pulse=Math.floor(time*2)%4;
    if(pulse===0){rect(c,412,490,54,1,'#fce4b770');rect(c,373,513,102,1,'#ffceb433');}
    if(phase==='dream') {
      for(let i=0;i<16;i++){const xx=915+((i*53+time*7)%253),yy=407+((i*29)%174);rect(c,xx,yy,2,1,'#f5d9cb45');}
      // The same vacant space acquires an impossible moon.
      pixelOval(c,818,301,41,41,'#d5b8c958');pixelOval(c,821,304,35,35,'#ecddbc');pixelOval(c,830,301,29,33,'#433042');
    }
  }
  if(theme==='shinobi') {
    // Reed pollen, leaves, and the ribbons of the clan flags move in the breeze.
    for(let i=0;i<22;i++){const xx=x+(i*157+time*8)%Math.floor(w/scale),yy=y+(i*67+Math.sin(time+i)*4)%Math.floor(h/scale);rect(c,xx,yy,2,i%3===0?2:1,i%3===0?'#ead2a876':'#ecedba85');}
    for(const [bx,by] of [[873,551],[1148,695],[771,252]]){rect(c,bx+5,by-10+Math.floor(Math.sin(time*3+bx)*2),8,2,'#eac594');}
    // Steam curls out of the ramen kitchen in discrete translucent pixels.
    for(let i=0;i<5;i++){
      const rise=(time*12+i*11)%54,xx=1118+Math.round(Math.sin(time*1.6+i)*4);
      pixelOval(c,xx-3,544-rise,7+(i%2)*4,5,'#fff6d853');rect(c,xx+1,540-rise,2,3,'#fffde63c');
    }
    for(let i=0;i<3;i++){
      const xx=1017+i*38+Math.round(Math.sin(time*2+i)*2),rise=(time*10+i*7)%18;
      rect(c,xx,655-rise,2,4,'#fff9dd8a');rect(c,xx+2,651-rise,2,3,'#fff9dd5f');
    }
    // A blue rooftop pennant and tiny circling birds make the sunny ridge feel alive.
    rect(c,760,318,20,7,'#3d799d');rect(c,762,318,15,2,'#a2d6c8');rect(c,773,323+Math.floor(Math.sin(time*3)),10,3,'#3d799d');
    for(let i=0;i<4;i++){const xx=667+i*109+Math.sin(time*.45+i)*9,yy=82+(i%2)*16;rect(c,xx-4,yy,3,1,'#657866');rect(c,xx-1,yy+1,3,1,'#657866');rect(c,xx+2,yy,3,1,'#657866');}
  }
  c.restore();
}

export function drawPreview(canvas,theme='moss') {
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  if(theme==='lynch'||theme==='shinobi') {
    const scale=w/(theme==='shinobi'?1500:865),worldHeight=h/scale;
    const scene=theme==='lynch'?{x:291,y:708-worldHeight,player:{x:739,y:700,facing:'down'}}:{x:50,y:10,player:{x:758,y:696,facing:'down'}};
    const entities=getWorldFeatures(theme);
    if(theme==='lynch')entities.push({x:805,y:631,type:'npc',kind:'double',name:'The double',facing:'left'},{x:647,y:773,type:'enemy'});
    else entities.push({x:687,y:690,type:'npc',kind:'rival',facing:'right'},{x:890,y:698,type:'npc',kind:'ranger',facing:'left'});
    drawWorld(c,theme,{x:scene.x,y:scene.y,width:w,height:h,scale,time:2.35,entities,player:scene.player});
    return;
  }
  const scale=w/640,worldHeight=h/scale;
  const entities=getWorldFeatures(theme);
  entities.push({x:864,y:393,type:'npc',facing:'left',kind:'resident'},{x:737,y:587,type:'npc',facing:'right'});
  drawWorld(c,theme,{x:480,y:495-worldHeight/2,width:w,height:h,scale,time:2.35,entities,player:{x:789,y:585,facing:'down'}});
}
