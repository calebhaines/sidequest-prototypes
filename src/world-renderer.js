// Original, hand-drawn canvas pixel art. All coordinates are world pixels.
export const WORLD_SIZE = { width: 1600, height: 1152 };

const PALETTES = {
  moss: { ground:'#8bb96c', dark:'#76a657', light:'#9cc97a', ink:'#344b40', path:'#ddca9c', edge:'#b5ab80', roof:'#c8674b', roofLight:'#e18558', roofDark:'#954936', wall:'#e9dcab', shade:'#c4b682', tree:['#255f43','#367c4a','#4b9952','#73b55e'], water:'#4ab6bd', waterDark:'#268eaa', accent:'#f4ca66' },
  neon: { ground:'#282b43', dark:'#22253c', light:'#35374f', ink:'#121b30', path:'#1b2135', edge:'#4a4c63', roof:'#484261', roofLight:'#625679', roofDark:'#302e49', wall:'#393950', shade:'#292b43', tree:['#263f52','#315863','#418779','#74bba2'], water:'#295c86', waterDark:'#213c65', accent:'#61e7dd' },
  dust: { ground:'#d5aa6c', dark:'#c49860', light:'#e6bb78', ink:'#72503f', path:'#dcb981', edge:'#b88858', roof:'#a05f4c', roofLight:'#c9815b', roofDark:'#774939', wall:'#dfbd87', shade:'#bb9869', tree:['#446c4e','#58865a','#77a266','#a1b678'], water:'#55a3a0', waterDark:'#397c86', accent:'#f4dc9b' },
  odd: { ground:'#8d9e99', dark:'#7c8f8d', light:'#a2b0a3', ink:'#55556d', path:'#9293a5', edge:'#c1b7cc', roof:'#7e759a', roofLight:'#a092bc', roofDark:'#615d81', wall:'#dfbecf', shade:'#b49fb9', tree:['#866487','#ad7d9f','#d69eb6','#edbbc6'], water:'#a1a6cf', waterDark:'#7c82b7', accent:'#fff0ae' },
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

export function getSpawn() { return {x:780,y:586}; }

export function getWorldFeatures(theme='moss') {
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

export function drawCharacter(c,x,y,theme='moss',opts={}) {
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
  if(theme==='moss') {
    stepped(c,x-10,y-16+b,21,17,'#335957');stepped(c,x-8,y-16+b,17,13,'#67a188');rect(c,x-5,y-15+b,6,3,'#9bcc96');rect(c,x-4,y-9+b,2,3,'#253a46');rect(c,x+3,y-9+b,2,3,'#253a46');
  } else if(theme==='neon') {
    rect(c,x-11,y-15+b,23,9,'#172438');rect(c,x-9,y-14+b,19,6,'#7888a4');rect(c,x-3,y-13+b,7,3,'#ec719f');rect(c,x-14,y-15+b,6,2,'#74d7d1');rect(c,x+9,y-15+b,6,2,'#74d7d1');rect(c,x-1,y-5+b,3,3,'#68e0cc');
  } else if(theme==='dust') {
    rect(c,x-10,y-11+b,21,9,'#755c51');rect(c,x-8,y-11+b,17,6,'#ad8768');rect(c,x-5,y-17+b,5,7,'#755c51');rect(c,x+3,y-17+b,5,7,'#755c51');rect(c,x-2,y-7+b,2,2,'#edc183');rect(c,x+4,y-7+b,2,2,'#edc183');
  } else {
    stepped(c,x-9,y-21+b,19,19,'#e4d4c7');rect(c,x-8,y-4+b,5,4,'#e4d4c7');rect(c,x+4,y-4+b,5,4,'#e4d4c7');rect(c,x-4,y-13+b,3,4,'#665b80');rect(c,x+3,y-13+b,3,4,'#665b80');
  }
  if(e.health!=null&&e.health<e.maxHealth) {rect(c,x-11,y-26,23,3,p.ink);rect(c,x-10,y-25,21*(e.health/e.maxHealth),1,'#ed9a8e');}
}

export function drawWorld(c,theme='moss',opts={}) {
  const p=PALETTES[theme]||PALETTES.moss,scale=opts.scale||1,x=Math.round(opts.x||0),y=Math.round(opts.y||0);
  const w=opts.width||c.canvas.width,h=opts.height||c.canvas.height,time=opts.time||0;
  const world=caches.get(theme)||buildWorld(theme);
  c.save();c.imageSmoothingEnabled=false;rect(c,0,0,w,h,p.ground);
  c.drawImage(world,x,y,w/scale,h/scale,0,0,w,h);
  c.scale(scale,scale);c.translate(-Math.round(x),-Math.round(y));
  const actors=[...(opts.entities||[])];
  if(opts.player)actors.push({...opts.player,type:'player'});
  actors.sort((a,b)=>a.y-b.y).forEach(e=> {
    if(e.x<x-45||e.x>x+w/scale+45||e.y<y-65||e.y>y+h/scale+40)return;
    if(e.type==='npc')drawCharacter(c,e.x,e.y,theme,{...e,npc:true,time});
    else if(e.type==='player')drawCharacter(c,e.x,e.y,theme,{...e,time});
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
  c.restore();
}

export function drawPreview(canvas,theme='moss') {
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const scale=w/640,worldHeight=h/scale;
  const entities=getWorldFeatures(theme);
  entities.push({x:864,y:393,type:'npc',facing:'left',kind:'resident'},{x:737,y:587,type:'npc',facing:'right'});
  drawWorld(c,theme,{x:480,y:495-worldHeight/2,width:w,height:h,scale,time:2.35,entities,player:{x:789,y:585,facing:'down'}});
}
