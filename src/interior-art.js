import { rect } from './pixel-art.js';

// Interior footprints are also collision footprints: nothing painted by a
// furniture renderer extends beyond the authored rectangle.
const DECORATIVE = new Set(['rug','painting','curtain','shoji','lantern','mat','scroll','banner','clock','map-board']);
const ALIASES = { shelves:'shelf',cot:'medical-bed',rack:'scroll-rack',trunk:'crate',couch:'sofa',bookcase:'bookshelf' };
const numeric = (v, name) => { if (!Number.isFinite(v)) throw new Error(`Interior ${name} must be finite`); return Math.round(v); };
function point(value, name) { if (!value) throw new Error(`Interior missing ${name}`); return {...value,x:numeric(value.x,`${name}.x`),y:numeric(value.y,`${name}.y`)}; }
function box(value,name) {
  const normalized={...value,...point(value,name),width:numeric(value.width,`${name}.width`),height:numeric(value.height,`${name}.height`)};
  if(normalized.width<=0||normalized.height<=0)throw new Error(`Interior ${name} needs a positive rectangle`);
  return normalized;
}

export function createInterior(spec) {
  if (!spec?.id || !spec.name || !['lynch','shinobi'].includes(spec.theme)) throw new Error('Interior needs id, name, and finalist theme');
  if (!spec.size) throw new Error(`Interior ${spec.id} missing size`);
  const size={width:numeric(spec.size.width,'size.width'),height:numeric(spec.size.height,'size.height')};
  if(size.width<192||size.height<192||size.width>1280||size.height>960)throw new Error(`Interior ${spec.id} dimensions are outside room limits`);
  const entry=point(spec.entry,'entry'),exit=point(spec.exit,'exit'),door=point(spec.door,'door');
  for(const [name,p] of [['entry',entry],['exit',exit]])if(p.x<40||p.x>size.width-40||p.y<64||p.y>size.height-8)throw new Error(`Interior ${spec.id} ${name} is outside the walkable room`);
  const furniture=(spec.furniture||[]).map((value,index)=>{
    const kind=ALIASES[value.kind]||value.kind||'cabinet';
    return {...box(value,`furniture[${index}]`),kind,solid:value.solid??!DECORATIVE.has(kind)};
  });
  const walls=(spec.walls||[]).map((v,i)=>box(v,`walls[${i}]`));
  const leftEnd=Math.max(32,exit.x-40),rightStart=Math.min(size.width-32,exit.x+40);
  const perimeter=[{x:0,y:0,width:32,height:size.height},{x:size.width-32,y:0,width:32,height:size.height},{x:32,y:0,width:size.width-64,height:56}];
  if(leftEnd>32)perimeter.push({x:32,y:size.height-32,width:leftEnd-32,height:32});
  if(rightStart<size.width-32)perimeter.push({x:rightStart,y:size.height-32,width:size.width-32-rightStart,height:32});
  return {...spec,size,door,doorArt:spec.doorArt?point(spec.doorArt,'doorArt'):undefined,entry,exit,
    rooms:(spec.rooms||[{name:spec.name,x:32,y:56,width:size.width-64,height:size.height-88,floor:spec.theme==='shinobi'?'wood':'tile'}]).map((v,i)=>box(v,`rooms[${i}]`)),
    walls,furniture,props:(spec.props||[]).map((v,i)=>({...point(v,`props[${i}]`),id:v.id||`${spec.id}-prop-${i}`,name:v.name||'Look closer',text:v.text||'The room has been carefully kept.'})),
    placements:(spec.placements||[]).map((v,i)=>point(v,`placements[${i}]`)),
    obstacles:[...perimeter,...walls,...furniture.filter(v=>v.solid).map(({x,y,width,height})=>({x,y,width,height}))]};
}

const PALETTES={
  lynch:{wall:'#ead2ae',wallLight:'#f5e4c8',wallShade:'#c49b81',wallFoot:'#bc9181',wood:'#bc8156',woodLight:'#d9a979',woodShade:'#9e694e',tile:'#a6bfb0',tileLight:'#c9d3b3',tileShade:'#93ad9d',stone:'#b7afb1',stoneLight:'#d0c8c0',stoneShade:'#a29d9f',fabric:'#ba655c',fabricLight:'#da8a75',fabricShade:'#97576a',metal:'#92aaa8',metalLight:'#c4d1c5',metalShade:'#768c90',paper:'#f5e7bf',ink:'#635870',glass:'#8bc7be',glassLight:'#d5ebc9',plant:'#789b67',plantLight:'#b4c786',pot:'#c58062',glow:'#f3d09b',accent:'#c78952'},
  dream:{wall:'#bda0b2',wallLight:'#d5bccb',wallShade:'#987c9f',wallFoot:'#92718b',wood:'#986e87',woodLight:'#c08d9b',woodShade:'#805b79',tile:'#9c99b0',tileLight:'#c2b2c2',tileShade:'#837f9e',stone:'#a6a2bb',stoneLight:'#c5bdd0',stoneShade:'#8e88a6',fabric:'#b74765',fabricLight:'#dd7286',fabricShade:'#97475f',metal:'#99a5bd',metalLight:'#c4cadd',metalShade:'#81889f',paper:'#ead8cf',ink:'#665576',glass:'#77b6c6',glassLight:'#b7dadc',plant:'#7b8e8d',plantLight:'#a8b6a5',pot:'#b97784',glow:'#edb9bd',accent:'#d69379'},
  shinobi:{wall:'#f4e6c2',wallLight:'#fff2d2',wallShade:'#d4b888',wallFoot:'#c7a579',wood:'#c39460',woodLight:'#e0b77b',woodShade:'#aa7d54',tile:'#b6c8b2',tileLight:'#d3dbc0',tileShade:'#9caf9b',stone:'#b9b7b0',stoneLight:'#d5d0ba',stoneShade:'#9caba4',fabric:'#748d9e',fabricLight:'#99b3b7',fabricShade:'#65768c',metal:'#9eafa9',metalLight:'#d1d7c4',metalShade:'#7e9395',paper:'#faf0ce',ink:'#72758a',glass:'#9bcaca',glassLight:'#d9edd8',plant:'#769d65',plantLight:'#b2c781',pot:'#c9855f',glow:'#ffdc9c',accent:'#e29357'},
};
const FLOOR_KIND={planks:'wood',wooden:'wood',linoleum:'tile',checker:'tile',checkered:'tile',cement:'concrete',brick:'stone',reed:'tatami',sand:'dirt'};
function floor(ctx,room,p) {
  const kind=FLOOR_KIND[room.floor]||room.floor||'wood';
  const x=room.x,y=room.y,w=room.width,h=room.height;
  const base=kind==='wood'?p.wood:kind==='carpet'?p.fabric:kind==='dirt'?p.woodShade:kind==='tile'||kind==='tatami'?p.tile:p.stone;
  rect(ctx,x,y,w,h,base);
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  if(kind==='wood') {
    for(let yy=y;yy<y+h;yy+=24) {
      rect(ctx,x,yy,w,3,p.woodLight);rect(ctx,x,yy+22,w,2,p.woodShade);
      for(let xx=x+(((yy-y)/24)%2)*48;xx<x+w;xx+=96){rect(ctx,xx,yy+3,2,19,p.woodShade);rect(ctx,xx+18,yy+10,26,2,p.woodLight);}
    }
  } else if(kind==='tile') {
    for(let yy=y;yy<y+h;yy+=32)for(let xx=x;xx<x+w;xx+=32){const parity=((xx-x)/32+(yy-y)/32)%2;rect(ctx,xx,yy,32,32,parity?p.tile:p.tileLight);rect(ctx,xx+3,yy+3,9,2,parity?p.tileLight:p.paper);rect(ctx,xx,yy+30,32,2,p.tileShade);}
  } else if(kind==='tatami') {
    rect(ctx,x,y,w,h,p.tileLight);
    for(let yy=y;yy<y+h;yy+=64)for(let xx=x;xx<x+w;xx+=128){rect(ctx,xx,yy+60,128,4,p.plant);rect(ctx,xx+124,yy,4,60,p.plant);for(let line=8;line<60;line+=8)rect(ctx,xx+8,yy+line,108,2,p.tile);}
  } else if(kind==='carpet') {
    for(let yy=y+8;yy<y+h;yy+=16)for(let xx=x+8;xx<x+w;xx+=16)rect(ctx,xx,yy,2,2,((xx+yy)%32)?p.fabricLight:p.fabricShade);
  } else {
    const block=kind==='stone'?48:32;
    for(let yy=y;yy<y+h;yy+=block)for(let xx=x;xx<x+w;xx+=block){const n=((xx*17+yy*31)>>>0)%7;if(n<3)rect(ctx,xx+4,yy+5,block-8,3,kind==='dirt'?p.wood:p.stoneLight);if(n>3)rect(ctx,xx+10,yy+block-9,6,3,kind==='dirt'?p.woodLight:p.stoneShade);}
  }
  ctx.restore();
}

// Every detail uses integer rectangles. Local normalized coordinates make a
// bookshelf readable at 48x48 and a workbench readable at 144x64 alike.
function furniture(ctx,f,p,theme,time) {
  const {x,y,width:w,height:h}=f;
  let kind=f.kind;
  if(kind==='machine'&&['washer','dryer'].includes(f.variant))kind='washer';
  if(kind==='console'&&f.variant==='helm')kind='helm';
  const color=f.color||p.fabric;
  const q=(u,v,a,b,c)=>{
    const xx=Math.max(0,Math.min(w-1,Math.round(u*w))),yy=Math.max(0,Math.min(h-1,Math.round(v*h)));
    const right=Math.max(xx+1,Math.min(w,Math.round((u+a)*w))),bottom=Math.max(yy+1,Math.min(h,Math.round((v+b)*h)));
    rect(ctx,x+xx,y+yy,right-xx,bottom-yy,c);
  };
  const horizontal=()=>{q(.07,.06,.86,.73,p.woodLight);q(.07,.73,.86,.16,p.wood);q(.12,.88,.12,.12,p.woodShade);q(.77,.88,.11,.12,p.woodShade);};
  const dish=(xx,yy,ww=.2,hh=.22)=>{q(xx+.03,yy,ww-.06,hh,p.paper);q(xx,yy+.05,ww,hh-.1,p.paper);q(xx+.06,yy+.07,ww-.12,hh-.14,p.tile);};
  const bookRow=(yy,xx=.09,ww=.82)=>{const colors=[p.fabricLight,p.glass,p.paper,p.accent,p.fabric,p.plantLight];for(let i=0;i<7;i++){q(xx+i*ww/7,yy,ww/7-.025,.17,colors[(i+(f.variant==='archive'?2:0))%colors.length]);q(xx+i*ww/7+.013,yy+.025,.025,.12,p.paper);} };
  const drawer=(yy)=>{q(.08,yy,.84,.18,p.woodLight);q(.43,yy+.07,.14,.025,p.metalShade);};
  switch(kind) {
    case 'table':
      horizontal();dish(.19,.22);dish(.61,.32);q(.46,.1,.07,.18,p.glass);q(.45,.07,.09,.04,p.glassLight);q(.14,.58,.18,.025,p.metal);break;
    case 'chair':
      q(.18,0,.64,.23,color);q(.22,.21,.11,.47,p.wood);q(.67,.21,.11,.47,p.wood);q(.12,.43,.76,.39,p.fabricLight);q(.12,.75,.76,.1,color);q(.19,.83,.12,.17,p.woodShade);q(.7,.83,.12,.17,p.woodShade);break;
    case 'booth':
      q(.03,.02,.94,.3,color);q(.08,.07,.84,.13,p.fabricLight);q(.03,.36,.94,.48,p.fabricLight);q(.03,.82,.94,.14,color);q(.08,.96,.12,.04,p.woodShade);q(.8,.96,.12,.04,p.woodShade);for(let i=1;i<4;i++)q(i/4,.08,.015,.71,color);break;
    case 'sofa':
      q(.02,.04,.96,.31,color);q(.09,.1,.82,.13,p.fabricLight);q(.08,.39,.84,.42,p.fabricLight);q(.02,.28,.1,.57,color);q(.88,.28,.1,.57,color);q(.12,.8,.76,.12,color);q(.15,.93,.09,.07,p.woodShade);q(.75,.93,.09,.07,p.woodShade);q(.48,.43,.02,.3,color);q(.12,.4,.18,.2,p.paper);break;
    case 'bed': case 'medical-bed':
      if(f.variant==='futon') {
        q(.03,.04,.94,.93,p.paper);q(.12,.07,.7,.2,p.fabricLight);q(.18,.1,.58,.11,p.paper);q(.08,.35,.84,.59,color);q(.08,.35,.84,.06,p.fabricLight);q(.15,.48,.71,.35,color);q(.15,.77,.71,.04,p.fabricLight);q(.08,.91,.84,.03,p.fabricShade);break;
      }
      q(.09,.03,.82,.11,p.wood);q(.07,.12,.86,.74,kind==='medical-bed'?p.paper:p.fabricLight);q(.14,.15,.32,.16,p.paper);q(.55,.15,.3,.16,p.paper);q(.1,.37,.8,.42,kind==='medical-bed'?p.glass:color);q(.1,.73,.8,.07,kind==='medical-bed'?p.glassLight:p.fabricLight);q(.12,.89,.1,.11,p.woodShade);q(.78,.89,.1,.11,p.woodShade);if(kind==='medical-bed'){q(.87,.1,.05,.64,p.metal);q(.82,.03,.15,.09,p.glassLight);q(.86,.18,.07,.1,p.paper);}break;
    case 'counter':
      q(0,.03,1,.66,p.paper);q(0,.66,1,.28,p.wood);q(.04,.67,.92,.05,p.woodLight);q(.07,.93,.86,.07,p.woodShade);dish(.1,.14,.15,.2);q(.71,.11,.19,.38,p.metal);q(.74,.14,.13,.1,p.glass);q(.75,.31,.05,.09,p.paper);q(.35,.23,.23,.18,p.accent);q(.39,.2,.14,.05,p.paper);break;
    case 'stove':
      q(.05,.02,.9,.64,p.metalLight);for(const xx of [.2,.59])for(const yy of [.1,.35]){q(xx,yy,.19,.17,p.metalShade);q(xx+.04,yy+.03,.11,.11,p.metal);q(xx+.07,yy+.06,.05,.05,p.accent);}q(.05,.64,.9,.3,p.metal);q(.15,.71,.7,.14,p.metalShade);q(.33,.74,.33,.025,p.metalLight);q(.08,.94,.12,.06,p.metalShade);q(.8,.94,.12,.06,p.metalShade);break;
    case 'sink': case 'basin':
      q(.03,.08,.94,.6,p.paper);q(.15,.16,.7,.43,p.metal);q(.22,.2,.56,.29,p.glass);q(.29,.23,.37,.08,p.glassLight);q(.42,.02,.15,.11,p.metalShade);q(.42,.11,.06,.13,p.metalLight);q(.03,.68,.94,.26,p.wood);q(.47,.74,.05,.11,p.metalLight);break;
    case 'fridge':
      q(.07,.03,.86,.9,p.paper);q(.08,.05,.84,.18,p.metalLight);q(.08,.26,.84,.6,p.glassLight);q(.1,.86,.8,.07,p.metal);q(.72,.1,.04,.1,p.metalShade);q(.72,.35,.04,.27,p.metalShade);q(.2,.34,.14,.15,p.fabricLight);q(.24,.37,.06,.08,p.paper);q(.38,.65,.13,.13,p.accent);q(.16,.94,.12,.06,p.metalShade);q(.73,.94,.12,.06,p.metalShade);break;
    case 'shelf': case 'bookshelf': case 'scroll-rack':
      if(f.variant==='tools'||f.variant==='fishing') {
        q(.06,.02,.08,.94,p.wood);q(.86,.02,.08,.94,p.wood);q(.05,.11,.9,.07,p.woodLight);q(.05,.73,.9,.08,p.woodLight);
        for(let i=0;i<4;i++){const xx=.23+i*.17;q(xx,.21,.03,.46,p.woodLight);if(f.variant==='fishing'){q(xx,.12,.02,.53,p.metalShade);q(xx+.015,.63,.07,.025,p.metal);q(xx+.07,.64,.025,.07,p.metal);}else{q(xx-.05,.2,.13,.08,p.metal);q(xx,.46,.035,.14,p.accent);}}
        q(.21,.82,.58,.11,p.paper);break;
      }
      if(['reeds','ropes','fabric'].includes(f.variant)) {
        q(.07,.02,.09,.95,p.wood);q(.84,.02,.09,.95,p.wood);q(.06,.04,.88,.05,p.woodLight);q(.07,.88,.86,.06,p.woodLight);
        for(let row=0;row<3;row++){const yy=.16+row*.25;if(f.variant==='reeds'){for(let i=0;i<6;i++){q(.22+i*.1,yy,.025,.17,p.plantLight);q(.21+i*.1,yy+.16,.05,.035,p.woodLight);}q(.2,yy+.09,.62,.025,p.accent);}else if(f.variant==='fabric'){for(let col=0;col<3;col++){q(.19+col*.22,yy,.19,.15,col%2?color:p.paper);q(.2+col*.22,yy+.015,.17,.025,p.fabricLight);q(.21+col*.22,yy+.11,.15,.02,p.fabricShade);}}else{for(let col=0;col<2;col++){const xx=.19+col*.35;q(xx+.04,yy,.2,.03,p.woodLight);q(xx,yy+.04,.28,.08,p.woodLight);q(xx+.04,yy+.12,.2,.03,p.woodLight);q(xx+.07,yy+.055,.14,.05,p.wood);}}q(.09,yy+.2,.82,.035,p.woodLight);}break;
      }
      q(.02,.02,.96,.93,p.wood);q(.08,.05,.84,.85,p.woodShade);for(const yy of [.1,.37,.64]){if(kind==='scroll-rack'){for(let i=0;i<5;i++){q(.1+i*.16,yy,.12,.16,p.paper);q(.1+i*.16,yy+.015,.12,.025,i%2?p.fabric:p.accent);q(.1+i*.16,yy+.12,.12,.025,p.woodLight);}}else if(kind==='bookshelf')bookRow(yy);else{q(.13,yy,.2,.15,p.paper);q(.39,yy+.035,.23,.115,p.fabricLight);q(.7,yy,.14,.15,p.glass);}q(.05,yy+.2,.9,.05,p.woodLight);}q(.09,.94,.13,.06,p.woodShade);q(.78,.94,.13,.06,p.woodShade);break;
    case 'desk':
      horizontal();q(.1,.67,.24,.27,p.wood);q(.13,.73,.18,.11,p.woodLight);q(.18,.77,.06,.02,p.metalShade);q(.17,.14,.37,.36,p.paper);q(.22,.2,.25,.025,p.ink);q(.22,.27,.21,.025,p.ink);q(.22,.34,.17,.025,p.ink);q(.7,.15,.11,.2,p.glass);q(.62,.4,.13,.09,p.accent);q(.65,.3,.03,.15,p.ink);break;
    case 'cabinet': case 'locker': case 'file-cabinet': case 'wardrobe':
      q(.04,.03,.92,.9,kind==='locker'||kind==='file-cabinet'?p.metal:p.wood);q(.08,.04,.84,.07,kind==='locker'?p.metalLight:p.woodLight);
      if(kind==='file-cabinet'){for(const yy of [.14,.39,.64]){q(.09,yy,.82,.21,p.metalLight);q(.35,yy+.04,.3,.06,p.paper);q(.41,yy+.13,.18,.025,p.metalShade);}}else if(kind==='locker'){for(const xx of [.11,.52]){q(xx,.15,.36,.67,p.metalLight);for(let i=0;i<3;i++)q(xx+.07,.22+i*.065,.23,.02,p.metal);q(xx+.26,.52,.035,.08,p.metalShade);}}else if(kind==='wardrobe'){q(.1,.14,.36,.66,p.woodLight);q(.54,.14,.36,.66,p.woodLight);q(.41,.45,.03,.1,p.accent);q(.55,.45,.03,.1,p.accent);}else{drawer(.18);drawer(.43);drawer(.68);}q(.12,.94,.12,.06,p.woodShade);q(.76,.94,.12,.06,p.woodShade);break;
    case 'crate':
      q(.05,.03,.9,.75,p.woodLight);q(.05,.78,.9,.19,p.wood);for(const xx of [.16,.44,.72])q(xx,.09,.04,.64,p.wood);q(.09,.25,.82,.05,p.wood);q(.09,.56,.82,.05,p.wood);q(.25,.33,.5,.19,p.paper);q(.33,.39,.33,.03,p.accent);break;
    case 'barrel':
      q(.2,0,.6,.08,p.woodLight);q(.1,.08,.8,.74,p.wood);q(.17,.82,.66,.17,p.woodShade);q(.13,.08,.74,.13,p.woodLight);q(.12,.28,.76,.07,p.metal);q(.12,.67,.76,.07,p.metal);q(.39,.17,.05,.55,p.woodLight);q(.7,.2,.03,.44,p.woodShade);break;
    case 'workbench':
      horizontal();q(.1,.15,.24,.21,p.metal);q(.14,.18,.15,.1,p.metalLight);q(.38,.21,.05,.32,p.metalShade);q(.34,.18,.2,.055,p.metalLight);q(.62,.12,.22,.3,p.wood);q(.65,.17,.17,.18,p.paper);q(.63,.49,.17,.035,p.metalShade);q(.25,.53,.23,.04,p.accent);break;
    case 'machine':
      if(f.variant==='loom') {
        q(.05,.02,.08,.9,p.wood);q(.87,.02,.08,.9,p.wood);q(.04,.06,.92,.09,p.woodLight);q(.11,.75,.78,.08,p.wood);for(let i=0;i<12;i++)q(.19+i*.055,.18,.015,.53,p.paper);for(let i=0;i<8;i++)q(.18,.42+i*.035,.64,.019,i%2?color:p.fabricLight);q(.3,.3,.35,.06,p.woodLight);q(.41,.31,.13,.035,p.accent);q(.14,.87,.19,.11,p.woodShade);q(.66,.87,.19,.11,p.woodShade);break;
      }
      if(f.variant==='paper-reel') {
        q(.1,.07,.14,.8,p.metal);q(.78,.07,.14,.8,p.metal);q(.2,.2,.6,.08,p.metalShade);q(.26,.04,.42,.47,p.paper);q(.17,.11,.6,.32,p.paper);q(.39,.17,.18,.15,p.woodLight);q(.43,.2,.1,.08,p.woodShade);q(.36,.52,.32,.27,p.paper);q(.3,.87,.4,.07,p.metalLight);q(.05,.94,.9,.06,p.metalShade);break;
      }
      if(f.variant==='pulp-vat') {
        q(.05,.12,.9,.63,p.metalLight);q(.12,.2,.76,.38,p.tile);q(.17,.24,.64,.16,p.paper);q(.29,.43,.2,.025,p.glassLight);q(.61,.4,.15,.025,p.glassLight);q(.05,.76,.9,.17,p.metal);q(.2,.07,.6,.06,p.metal);q(.69,.12,.035,.38,p.wood);q(.63,.37,.15,.06,p.woodLight);q(.14,.94,.1,.06,p.metalShade);q(.76,.94,.1,.06,p.metalShade);break;
      }
      if(f.variant==='press') {
        q(.09,.05,.13,.79,p.metal);q(.78,.05,.13,.79,p.metal);q(.08,.03,.84,.17,p.metalLight);q(.44,.2,.12,.25,p.metal);q(.27,.44,.46,.11,p.metalLight);q(.21,.66,.58,.1,p.paper);q(.07,.79,.86,.15,p.metal);q(.3,.3,.4,.04,p.accent);q(.1,.94,.14,.06,p.metalShade);q(.76,.94,.14,.06,p.metalShade);break;
      }
      if(f.variant==='pump') {
        q(.1,.45,.8,.34,p.metal);q(.18,.3,.29,.48,p.metalLight);q(.56,.54,.28,.12,p.metalLight);q(.43,.35,.31,.08,p.metal);q(.63,.16,.08,.27,p.metal);q(.59,.08,.16,.13,p.accent);q(.26,.34,.13,.16,p.glass);q(.29,.37,.035,.1,p.paper);q(.07,.84,.86,.1,p.metalShade);break;
      }
      q(.07,.06,.86,.79,p.metal);q(.14,.04,.72,.36,p.metalLight);q(.18,.09,.26,.22,p.metalShade);q(.23,.14,.15,.1,p.glass);q(.51,.09,.2,.19,p.metal);q(.58,.14,.06,.07,p.accent);q(.16,.44,.29,.29,p.metalShade);q(.21,.49,.19,.18,p.metalLight);q(.52,.47,.31,.18,p.wood);q(.55,.52,.24,.035,p.paper);q(.12,.85,.76,.15,p.metalShade);q(.02,.23,.06,.35,p.accent);q(.92,.23,.06,.35,p.accent);break;
    case 'console':
      if(f.variant==='signal-levers') {
        q(.03,.1,.94,.66,p.wood);q(.1,.14,.8,.5,p.metal);for(let i=0;i<4;i++){q(.17+i*.19,.22,.075,.32,p.metalShade);q(.195+i*.19,.08+(i%2)*.19,.028,.31,p.wood);q(.16+i*.19,.065+(i%2)*.19,.1,.07,i%2?p.fabricLight:p.accent);}q(.07,.8,.86,.14,p.woodShade);q(.17,.67,.15,.035,p.paper);q(.63,.67,.15,.035,p.paper);break;
      }
      q(.03,.02,.94,.88,p.metal);q(.1,.08,.8,.5,p.metalShade);q(.17,.13,.66,.35,p.glass);for(let i=0;i<4;i++)q(.23,.18+i*.06,.12+i*.09,.025,p.glassLight);for(let i=0;i<5;i++)q(.13+i*.15,.67,.07,.07,i%2?p.fabricLight:p.glow);q(.08,.91,.13,.09,p.metalShade);q(.78,.91,.13,.09,p.metalShade);break;
    case 'telescope':
      q(.39,.49,.19,.25,p.wood);q(.17,.78,.22,.1,p.woodLight);q(.64,.78,.22,.1,p.woodLight);q(.05,.14,.49,.27,p.metal);q(.27,.04,.57,.27,p.metalLight);q(.76,.03,.15,.32,p.metal);q(.84,.07,.15,.21,p.glass);q(.07,.23,.1,.25,p.metalShade);q(.44,.36,.12,.2,p.accent);q(.29,.7,.1,.22,p.wood);q(.61,.7,.1,.22,p.wood);break;
    case 'piano':
      q(.05,0,.9,.45,p.woodShade);q(.08,.05,.84,.12,p.wood);q(.02,.42,.96,.23,p.wood);q(.07,.47,.86,.15,p.paper);for(let i=0;i<12;i++)q(.1+i*.068,.47,.032,.095,p.ink);q(.04,.67,.92,.21,p.woodShade);q(.11,.88,.1,.12,p.wood);q(.79,.88,.1,.12,p.wood);q(.38,.16,.25,.16,p.paper);break;
    case 'curtain':
      q(0,.03,1,.055,p.woodLight);for(let i=0;i<6;i++){q(i/6,.1,1/6,.82,i%2?color:p.fabricLight);q(i/6+.04,.14,.026,.71,p.fabricShade);}q(.06,.93,.88,.04,p.fabricLight);break;
    case 'altar':
      q(.13,.68,.74,.21,p.wood);q(.05,.87,.9,.12,p.stoneLight);q(.05,.35,.9,.3,p.woodLight);q(.19,.04,.08,.26,p.paper);q(.75,.04,.08,.26,p.paper);q(.18,.025,.1,.04,p.glow);q(.74,.025,.1,.04,p.glow);q(.44,.06,.13,.29,p.accent);q(.39,.16,.23,.07,p.accent);q(.39,.44,.23,.13,p.metal);q(.48,.33,.03,.17,p.ink);break;
    case 'pew': case 'bench':
      q(.04,.04,.92,.22,p.wood);q(.08,.31,.84,.35,p.woodLight);q(.08,.65,.84,.12,p.wood);q(.11,.8,.1,.2,p.woodShade);q(.79,.8,.1,.2,p.woodShade);q(.12,.36,.76,.035,p.paper);break;
    case 'weapon-rack':
      q(.08,.03,.08,.9,p.wood);q(.84,.03,.08,.9,p.wood);q(.06,.31,.88,.055,p.woodLight);q(.06,.69,.88,.055,p.woodLight);for(let i=0;i<4;i++){const xx=.24+i*.16;q(xx,.08,.04,.64,p.metalLight);q(xx-.045,.7,.13,.04,p.accent);q(xx,.75,.04,.17,p.woodShade);}break;
    case 'plant':
      q(.24,.71,.52,.22,p.pot);q(.31,.94,.38,.06,p.woodShade);q(.19,.66,.62,.08,p.accent);q(.47,.15,.07,.54,p.plant);q(.24,.32,.26,.14,p.plantLight);q(.16,.28,.16,.1,p.plant);q(.52,.17,.25,.14,p.plantLight);q(.68,.13,.15,.1,p.plant);q(.53,.46,.23,.12,p.plant);q(.29,.06,.22,.12,p.plantLight);break;
    case 'rug': case 'mat':
      q(0,.04,1,.92,color);q(.06,.1,.88,.8,p.fabricLight);q(.1,.14,.8,.72,color);q(.23,.26,.54,.46,p.accent);q(.31,.33,.38,.32,p.paper);q(.41,.4,.18,.18,color);for(let i=0;i<8;i++){q(i/8+.035,0,.04,.04,p.paper);q(i/8+.035,.96,.04,.04,p.paper);}break;
    case 'painting':
      q(.02,.04,.96,.92,p.woodLight);q(.09,.11,.82,.78,p.paper);
      if(['map','chart','village','bridge'].includes(f.variant)) {
        q(.18,.19,.24,.2,p.tileLight);q(.54,.6,.23,.18,p.plantLight);for(let i=0;i<5;i++)q(.16+i*.12,.51+(i%2)*.04,.14,.035,p.glass);q(.56,.24,.025,.42,p.wood);q(.23,.64,.075,.06,p.fabric);q(.7,.27,.075,.06,p.accent);q(.38,.38,.11,.04,p.ink);q(.21,.75,.22,.018,p.ink);
      } else if(f.variant==='calligraphy'||f.variant==='oath') {
        for(let col=0;col<3;col++)for(let row=0;row<4;row++){const xx=.29+col*.18,yy=.22+row*.13;q(xx,yy,.085,.02,p.ink);q(xx+.025,yy+.02,.025,.07,p.ink);q(xx-.015,yy+.052,.085,.02,p.ink);}q(.71,.72,.1,.09,p.fabric);
      } else if(f.variant==='clan') {
        q(.34,.23,.32,.18,p.fabricLight);q(.27,.36,.46,.13,p.fabricLight);q(.42,.49,.16,.12,p.paper);q(.47,.6,.06,.2,p.wood);q(.23,.74,.18,.03,p.ink);q(.62,.74,.13,.03,p.ink);
      } else {q(.14,.17,.72,.33,p.glass);q(.14,.5,.72,.31,p.plant);q(.59,.24,.11,.13,p.glow);q(.22,.56,.13,.14,p.fabric);q(.3,.49,.06,.18,p.paper);}break;
    case 'shoji': case 'screen':
      q(.02,.03,.96,.92,p.paper);for(let i=1;i<4;i++)q(i/4,.06,.026,.85,p.woodLight);for(let i=1;i<5;i++)q(.04,i/5,.92,.035,p.woodLight);q(.02,.93,.96,.07,p.wood);break;
    case 'bath':
      q(.1,.04,.8,.05,p.woodLight);q(.04,.09,.92,.72,p.woodLight);q(.12,.15,.76,.54,p.glass);q(.2,.2,.58,.055,p.glassLight);q(.3,.4,.38,.04,p.glassLight);q(.04,.81,.92,.16,p.wood);q(.4,.02,.2,.07,p.metal);q(.47,.08,.06,.14,p.metalLight);break;
    case 'lantern':
      q(.45,0,.1,.12,p.wood);q(.24,.11,.52,.08,p.woodLight);q(.17,.22,.66,.53,p.glow);q(.23,.19,.54,.63,p.paper);q(.27,.31,.46,.43,p.glow);q(.23,.84,.54,.06,p.woodLight);q(.43,.9,.14,.1,p.accent);q(.46,.28,.07,.49,p.fabricLight);break;
    case 'training-dummy':
      q(.36,.02,.28,.18,p.woodLight);q(.31,.21,.38,.43,p.wood);q(.08,.31,.84,.1,p.woodLight);q(.46,.64,.08,.24,p.woodShade);q(.19,.88,.62,.08,p.stone);q(.39,.29,.22,.15,p.fabricLight);q(.47,.35,.06,.04,p.paper);break;
    case 'coat-rack':
      q(.46,.02,.08,.83,p.wood);q(.12,.18,.76,.07,p.woodLight);q(.22,.23,.28,.4,color);q(.31,.57,.24,.21,color);q(.57,.28,.25,.33,p.paper);q(.15,.87,.7,.07,p.woodShade);q(.32,.8,.07,.15,p.wood);q(.66,.8,.07,.15,p.wood);break;
    case 'radio':
      if(f.variant==='reel-recorder') {
        q(.02,.09,.96,.82,p.metal);for(const xx of [.14,.57]){q(xx,.14,.27,.3,p.paper);q(xx-.035,.2,.34,.17,p.paper);q(xx+.08,.23,.11,.11,p.metalShade);}q(.31,.49,.38,.025,p.ink);q(.14,.56,.72,.17,p.metalLight);for(let i=0;i<4;i++)q(.2+i*.17,.6,.09,.055,i%2?p.accent:p.fabricLight);q(.12,.78,.76,.035,p.glass);q(.12,.93,.12,.07,p.metalShade);q(.76,.93,.12,.07,p.metalShade);break;
      }
      q(.02,.18,.96,.74,p.wood);q(.07,.22,.86,.54,p.woodLight);q(.13,.28,.42,.41,p.fabricShade);for(let i=0;i<4;i++)q(.18,.32+i*.09,.31,.025,p.fabricLight);q(.63,.29,.21,.1,p.glass);q(.68,.46,.1,.1,p.metalLight);q(.81,.47,.06,.08,p.metal);q(.76,0,.025,.18,p.metalShade);q(.12,.93,.11,.07,p.woodShade);q(.78,.93,.11,.07,p.woodShade);break;
    case 'jukebox':
      q(.18,.03,.64,.08,p.accent);q(.1,.11,.8,.11,p.accent);q(.04,.22,.92,.72,p.wood);q(.13,.24,.74,.35,p.glow);q(.24,.11,.52,.11,p.glow);q(.28,.26,.44,.25,p.glass);for(let i=0;i<3;i++){q(.36,.3+i*.065,.25,.025,p.paper);}q(.14,.66,.72,.2,p.fabricShade);for(let i=0;i<5;i++)q(.2,.7+i*.035,.6,.012,p.fabricLight);q(.05,.32,.08,.54,p.glow);q(.87,.32,.08,.54,p.glow);q(.36,.58,.28,.05,p.paper);q(.14,.94,.72,.06,p.woodShade);break;
    case 'phone':
      q(.12,.32,.76,.53,p.woodLight);q(.18,.65,.64,.21,p.wood);q(.2,.08,.6,.13,p.ink);q(.09,.16,.22,.18,p.ink);q(.69,.16,.22,.18,p.ink);q(.25,.24,.07,.14,p.wood);q(.68,.24,.07,.14,p.wood);q(.38,.39,.26,.26,p.paper);q(.45,.43,.12,.17,p.metalShade);q(.02,.37,.035,.46,p.ink);for(let i=0;i<4;i++)q(.03,.38+i*.09,.07,.025,p.ink);break;
    case 'phone-switchboard':
      q(.04,.03,.92,.85,p.wood);q(.1,.08,.8,.46,p.metal);for(let row=0;row<3;row++)for(let col=0;col<6;col++){q(.15+col*.12,.14+row*.115,.055,.055,(row+col)%3===0?p.glow:p.metalShade);q(.14+col*.12,.2+row*.115,.075,.02,p.paper);}q(.1,.58,.8,.23,p.woodLight);for(let i=0;i<5;i++){q(.18+i*.13,.62,.025,.12,p.fabricShade);q(.18+i*.13,.71,.08,.025,p.fabricShade);}q(.13,.89,.1,.11,p.woodShade);q(.77,.89,.1,.11,p.woodShade);break;
    case 'washer':
      q(.06,.02,.88,.88,p.paper);q(.06,.03,.88,.16,p.metalLight);q(.13,.07,.11,.07,p.metalShade);q(.67,.06,.18,.09,p.glass);q(.19,.3,.62,.38,p.metalLight);q(.28,.24,.44,.5,p.metalLight);q(.28,.35,.44,.27,p.glass);q(.35,.28,.3,.41,p.glass);q(.38,.38,.27,.14,p.glassLight);q(.31,.51,.18,.1,p.fabricLight);q(.52,.58,.11,.04,p.paper);q(.13,.91,.1,.09,p.metalShade);q(.77,.91,.1,.09,p.metalShade);break;
    case 'helm':
      q(.04,.48,.92,.27,p.woodLight);q(.13,.75,.74,.16,p.wood);q(.18,.93,.11,.07,p.woodShade);q(.72,.93,.11,.07,p.woodShade);q(.22,.09,.56,.09,p.wood);q(.14,.18,.09,.31,p.wood);q(.77,.18,.09,.31,p.wood);q(.22,.47,.56,.08,p.wood);q(.27,.18,.46,.055,p.woodLight);q(.21,.23,.06,.22,p.woodLight);q(.73,.23,.06,.22,p.woodLight);q(.27,.43,.46,.045,p.woodLight);q(.46,.03,.08,.57,p.wood);q(.07,.3,.86,.055,p.wood);q(.42,.26,.16,.13,p.accent);q(.43,.68,.13,.025,p.paper);break;
    case 'clock':
      q(.2,.05,.6,.13,p.wood);q(.09,.18,.82,.59,p.wood);q(.2,.77,.6,.13,p.wood);q(.21,.2,.58,.55,p.paper);q(.46,.26,.04,.27,p.ink);q(.47,.5,.19,.035,p.ink);for(const [xx,yy]of[[.48,.22],[.7,.47],[.48,.68],[.26,.47]])q(xx,yy,.035,.035,p.accent);break;
    case 'map-board':
      q(.02,.03,.96,.94,p.woodLight);q(.07,.08,.86,.84,p.paper);q(.18,.19,.25,.24,p.plantLight);q(.57,.18,.26,.25,p.tile);q(.4,.58,.28,.23,p.plant);for(let i=0;i<5;i++)q(.23+i*.12,.49+(i%2)*.03,.13,.035,p.glass);q(.44,.33,.08,.08,p.fabric);q(.15,.76,.16,.02,p.ink);break;
    case 'scroll':
      q(.16,.08,.68,.84,p.paper);q(.08,.05,.84,.1,p.woodLight);q(.08,.87,.84,.1,p.woodLight);for(let i=0;i<5;i++)q(.29,.24+i*.11,.16+(i%3)*.12,.025,p.ink);q(.55,.7,.16,.11,p.fabricLight);break;
    case 'cushion':
      q(.06,.15,.88,.68,color);q(.12,.1,.76,.08,p.fabricLight);q(.16,.23,.68,.43,p.fabricLight);q(.22,.29,.56,.34,color);q(.46,.43,.09,.09,p.fabricShade);q(.15,.85,.7,.06,p.fabricShade);break;
    case 'banner':
      q(0,.02,1,.06,p.woodLight);q(.13,.08,.74,.79,color);q(.2,.88,.6,.07,color);q(.28,.26,.43,.28,p.paper);q(.37,.32,.26,.15,color);q(.43,.4,.07,.23,p.paper);q(.43,.94,.13,.06,p.accent);break;
    default:
      // Unknown authored props still have a readable storage-object fallback.
      q(.04,.04,.92,.82,p.wood);q(.1,.1,.8,.62,p.woodLight);q(.38,.31,.24,.08,p.metal);q(.1,.87,.14,.13,p.woodShade);q(.76,.87,.14,.13,p.woodShade);
  }
}

function wall(ctx,b,p) {
  rect(ctx,b.x,b.y,b.width,b.height,p.wallShade);
  rect(ctx,b.x,b.y,b.width,Math.max(4,b.height-8),p.wall);
  rect(ctx,b.x,b.y,b.width,Math.min(5,b.height),p.wallLight);
  if(b.height>12)rect(ctx,b.x,b.y+b.height-8,b.width,4,p.wallFoot);
}

export function drawInteriorFurniture(ctx,item,room,phase='waking',time=0) {
  const p=room.theme==='lynch'&&phase==='dream'?PALETTES.dream:PALETTES[room.theme];
  furniture(ctx,item,p,room.theme,time);
}

export function drawInteriorTerrain(ctx,room,phase='waking',time=0,options={}) {
  const p=room.theme==='lynch'&&phase==='dream'?PALETTES.dream:PALETTES[room.theme];
  const {width,height}=room.size;
  rect(ctx,0,0,width,height,p.wood);
  for(const r of room.rooms)floor(ctx,r,p);
  // Perimeter walls are warm plaster planes with wood skirting, not contours.
  wall(ctx,{x:0,y:0,width,height:56},p);
  wall(ctx,{x:0,y:56,width:32,height:height-56},p);
  wall(ctx,{x:width-32,y:56,width:32,height:height-56},p);
  const exitLeft=Math.max(32,room.exit.x-40),exitRight=Math.min(width-32,room.exit.x+40);
  wall(ctx,{x:32,y:height-32,width:exitLeft-32,height:32},p);
  wall(ctx,{x:exitRight,y:height-32,width:width-32-exitRight,height:32},p);
  // A lit doorway and step continue to the south edge, leaving the exact exit
  // collision passage clear. The engine places the E hint over this threshold.
  rect(ctx,exitLeft,height-36,exitRight-exitLeft,36,p.woodLight);
  rect(ctx,exitLeft+6,height-12,exitRight-exitLeft-12,4,p.paper);
  rect(ctx,exitLeft+6,height-32,exitRight-exitLeft-12,3,p.glow);
  for(const b of room.walls)wall(ctx,b,p);
  // Three-pane high windows and ceiling light bars make the wall band a useful
  // part of the room. Artists can cover them with authored shelves or drapes.
  for(let xx=72;xx<width-128;xx+=224) {
    rect(ctx,xx,13,82,29,p.woodLight);rect(ctx,xx+5,17,72,20,p.glass);
    rect(ctx,xx+8,18,20,7,p.glassLight);rect(ctx,xx+29,17,3,20,p.paper);rect(ctx,xx+52,17,3,20,p.paper);
    if(room.theme==='lynch'&&phase==='dream'){rect(ctx,xx+58,23,8,6,p.fabricLight);rect(ctx,xx+63,29,3,5,p.fabric);}
  }
  // Floor decoration first so furniture remains visibly raised above it.
  if(options.furniture!==false) {
    const low=room.furniture.filter(f=>['rug','mat'].includes(f.kind));
    const rest=room.furniture.filter(f=>!['rug','mat'].includes(f.kind)).sort((a,b)=>(a.y+a.height)-(b.y+b.height));
    for(const f of [...low,...rest])furniture(ctx,f,p,room.theme,time);
  }
}
