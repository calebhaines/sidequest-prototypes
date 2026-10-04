import { VELVET_LAYOUT } from './velvet-world.js';
import { getInteriors } from './interiors.js';

// All dimensions are the simulation's pixels. The renderer turns the palette
// planes into lit, solid geometry and batches the repeating forest shapes.
const P={ground:'#435953',grass:'#51675b',grassLight:'#61786b',soil:'#8b8171',road:'#687375',curb:'#a1a7a0',line:'#d9c8a1',pine:'#2d5350',pineLight:'#496b5d',pineShade:'#294544',trunk:'#806c58',water:'#508c99',waterDeep:'#477b87',waterLight:'#aac8c5',wall:'#d3c6ab',wallShade:'#b1a28e',roof:'#a86157',roofShade:'#8f554f',roofLight:'#c88767',window:'#ffda96',glass:'#789c9e',metal:'#819796',metalDark:'#607675',red:'#c65558',wood:'#aa8b68',woodShade:'#897158',cream:'#e5d6b3',dark:'#435256'};
const {roads,clearings,structures,water,safePoints}=VELVET_LAYOUT;
function hash(x,y,salt=0){let n=Math.imul(x+salt*41,374761393)^Math.imul(y+salt*67,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
const inRect=(x,y,r,pad=0)=>x>r.x-pad&&x<r.x+(r.w??r.width)+pad&&y>r.y-pad&&y<r.y+(r.h??r.height)+pad;

function pine(k,x,y,size=1,variant=0){
  const h=190*size,r=31*size;
  k.cylinder(x,y,5*size,h*.65,P.trunk,0,6);
  k.cone(x,y,r*1.18,h*.53,variant%3===0?P.pineLight:P.pine,30*size,7);
  k.cone(x,y,r*.93,h*.48,P.pine,74*size,7);
  k.cone(x,y,r*.62,h*.40,P.pineLight,119*size,7);
}
function lamp(k,x,y){
  k.cylinder(x,y,2.5,78,P.metalDark,0,6);
  k.beam(x,y,78,x+18,y,78,3,P.metal);
  k.box(x+12,y-5,13,10,9,P.window,68);
  k.roof(x+10,y-7,17,14,5,P.metalDark,77);
}
function bench(k,x,y){
  k.box(x-25,y-9,50,16,5,P.wood,15);
  k.box(x-25,y-10,50,4,18,P.wood,19);
  for(const dx of[-20,17])k.box(x+dx,y-6,4,11,17,P.metalDark);
}
function sign(k,text,x,y,width=150,color=P.roofShade){
  k.box(x-3,y-3,5,6,60,P.woodShade);
  k.box(x+width-2,y-3,5,6,60,P.woodShade);
  k.box(x-7,y-4,width+14,8,28,color,40);
  k.label(text,x+width/2,y+1,54,P.cream,color,width);
}
function window(k,x,y,width=30,height=35,elevation=43){
  k.box(x,y,width,2,height,P.window,elevation);
  k.box(x+width/2-1,y+1,2,1,height,P.wallShade,elevation);
  k.box(x,y+1,width,1,2,P.wallShade,elevation+height*.52);
}
function door(k,x,y,width=22,height=55,color=P.woodShade){
  k.box(x-width/2,y,width,3,height,color);
  k.box(x+width/2-5,y+3,2,2,2,P.window,height*.45);
}
function crate(k,x,y,width=25){
  k.box(x,y,width,width*.8,width*.75,P.wood);
  k.box(x+3,y-.3,width-6,1,3,P.woodShade,6);
  k.box(x+3,y-.3,width-6,1,3,P.cream,width*.75-8);
}
function barrel(k,x,y,color=P.metal){
  k.cylinder(x,y,10,28,color,0,8);
  k.cylinder(x,y,10.6,3,P.metalDark,5,8);
  k.cylinder(x,y,10.6,3,P.metalDark,21,8);
}
function fence(k,x,y,width){
  k.beam(x,y,20,x+width,y,20,3,P.wood);
  k.beam(x,y,8,x+width,y,8,3,P.woodShade);
  for(let dx=0;dx<=width;dx+=26)k.box(x+dx-2,y-2,4,4,32,P.wood);
}
function car(k,x,y,color=P.roof){
  k.box(x-17,y-26,34,55,15,color,10);
  k.box(x-14,y-11,28,27,16,color,25);
  k.box(x-12,y+15,24,2,11,P.glass,28);
  k.box(x-12,y-12,24,2,11,P.glass,28);
  for(const dx of[-18,14])for(const dy of[-17,18])k.box(x+dx,y+dy,5,11,10,P.dark,5);
  k.box(x-14,y+29,28,2,3,P.metal,13);
  for(const dx of[-12,8])k.box(x+dx,y+29,5,2,5,P.cream,19);
}

function body(k,s,height=105,color=P.wall){
  const offset=Math.min(60,Math.round(s.h/3)),b={x:s.x+7,y:s.y+offset,w:s.w-14,h:s.h-offset-8};
  k.box(b.x,b.y,b.w,b.h,height,color);
  k.box(b.x,b.y,b.w,b.h,7,P.wallShade,height-7);
  return {...b,height,front:b.y+b.h};
}
function cottage(k,s){
  const height=s.kind==='shed'?83:s.kind==='signalbox'?132:106,b=body(k,s,height);
  k.roof(b.x-8,b.y-7,b.w+16,b.h+14,45,P.roof,height);
  const windows=s.w>145?2:1,winY=b.front+.6;
  for(let i=0;i<windows;i++)window(k,b.x+15+i*(b.w-63),winY,28,35,height*.45);
  door(k,s.x+s.w/2,b.front+1,23,57);
  k.box(b.x+17,b.y+17,16,17,48,P.wallShade,height+14);
  if(s.kind==='abandoned'){
    for(const elev of[55,73])k.box(b.x+10,winY+2,43,3,5,P.wood,elev);
    k.label('FENN HOUSE',s.x+s.w/2,b.front+3,84,P.cream,null,98);
  }
  if(s.kind==='laundry')k.label('LAUNDRY',s.x+s.w/2,b.front+3,96,P.cream,P.roofShade,120);
  if(s.kind==='deputy')k.label('COUNTY ROAD OFFICE',s.x+s.w/2,b.front+3,94,P.cream,P.metalDark,155);
  if(s.kind==='radio')k.label('TECHNICIAN',s.x+s.w/2,b.front+3,95,P.cream,P.metalDark,98);
  if(s.kind==='ferry')k.label('FERRY OFFICE',s.x+s.w/2,b.front+3,95,P.cream,P.metalDark,110);
}
function diner(k,s){
  const b=body(k,s,110,P.wall);
  k.box(b.x-9,b.y-7,b.w+18,b.h+14,12,P.metal,110);
  k.box(b.x-10,b.front-8,b.w+20,22,5,P.red,103);
  for(const dx of[14,59,167,212])window(k,b.x+dx,b.front+1,34,43,41);
  door(k,456,b.front+2,28,65,P.metalDark);
  k.box(b.x,b.front+2,b.w,2,11,P.red,25);
  k.label('MERCY DINER',s.x+s.w/2,b.front+4,119,P.window,P.roofShade,215);
  // Coffee-cup roof sculpture makes the diner visible from the main road.
  k.cylinder(s.x+51,b.y+24,15,25,P.cream,125,10);
  k.cylinder(s.x+51,b.y+24,12,2,P.woodShade,150,10);
  k.beam(s.x+65,b.y+24,140,s.x+77,b.y+24,140,5,P.cream);
  k.box(s.x+28,b.y+7,46,37,4,P.red,119);
  k.label('COFFEE',s.x+54,b.front+4,82,P.window,null,58);
}
function telephone(k,s){
  const b=body(k,s,92,P.metalDark);
  k.roof(b.x-6,b.y-4,b.w+12,b.h+8,20,P.roof,92);
  k.box(b.x+7,b.front+1,b.w-14,2,58,P.glass,23);
  for(const dx of[5,b.w/2,b.w-9])k.box(b.x+dx,b.front+3,4,3,78,P.metal,4);
  door(k,461,b.front+4,22,64,P.metalDark);
  k.label('TELEPHONE',461,b.front+5,101,P.cream,P.metalDark,102);
}
function theater(k,s){
  // Its original collision is a U-shaped venue. The open courtyard and center
  // approach remain empty even though the stage has a three-dimensional roof.
  const bx=s.x+10,by=s.y+56,w=s.w-20;
  k.box(bx,by,w,37,158,P.wall);
  k.box(bx,by+37,21,135,145,P.wallShade);
  k.box(bx+w-21,by+37,21,135,145,P.wallShade);
  k.roof(bx-4,by-4,w+8,45,35,P.roofShade,158);
  k.box(bx-4,by+34,29,144,9,P.roof,145);
  k.box(bx+w-25,by+34,29,144,9,P.roof,145);
  // Tall drapes are planted on the solid stage wall, with a dark central opening.
  for(let i=0;i<6;i++){
    const cx=bx+21+i*34;
    k.box(cx,by+37.5,19,3,110,i%2?P.roofShade:P.red,17);
  }
  k.box(bx+w/2-22,by+38,44,3,97,P.dark,10);
  k.box(bx+8,s.y+s.h-19,w-16,19,13,P.roofShade,144);
  k.label('VALE THEATER',s.x+s.w/2,s.y+s.h-8,162,P.cream,P.roofShade,208);
  k.box(bx+12,by+39,w-24,30,2,P.wood,1);
  k.label('TONIGHT: THE SAME DREAM',s.x+s.w/2,by+41,132,P.window,null,197);
  for(const dx of[19,w-32])window(k,bx+dx,s.y+s.h-19,13,48,79);
}
function motel(k,s){
  const b=body(k,s,90,P.wall),front=b.front+1;
  k.roof(b.x-7,b.y-6,b.w+14,b.h+12,28,P.roof,90);
  k.box(b.x-12,front-4,b.w+24,32,7,P.metalDark,76);
  for(let i=0;i<6;i++){
    const dx=1204+i*46;
    door(k,dx,front+2,20,58,i===2?P.roofShade:P.woodShade);
    window(k,dx+13,front+2,15,29,36);
    k.label(String(i+1),dx,front+4,66,P.cream,null,16);
  }
  for(const dx of[b.x-7,b.x+b.w+6])k.cylinder(dx,front+20,2,76,P.metal,0,6);
  sign(k,'MERCY MOTEL',1504,650,134,P.roofShade);
  k.label('VACANCY',1571,653,32,P.window,null,83);
}
function mill(k,s){
  const b=body(k,s,157,P.wallShade);
  k.roof(b.x-5,b.y-7,b.w+10,b.h+14,55,P.metalDark,157);
  for(let row=0;row<2;row++)for(let i=0;i<6;i++)window(k,b.x+15+i*59,b.front+1,39,27,39+row*58);
  door(k,2343,b.front+3,43,75,P.dark);
  k.label('MERCY PAPER CO.',2343,b.front+4,139,P.cream,P.metalDark,269);
  for(const dx of[42,112,185]){
    k.cylinder(b.x+dx,b.y+28,14,260,P.wallShade,0,8);
    k.cylinder(b.x+dx,b.y+28,17,9,P.roofShade,251,8);
  }
  k.beam(2117,516,45,2161,516,45,13,P.metalDark);
  k.cylinder(2098,517,36,8,P.wood,10,10);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    k.beam(2098,517,14,2098+Math.cos(a)*35,517+Math.sin(a)*35,14,4,P.cream);
  }
}
function tower(k,s){
  const b=body(k,s,262,P.wallShade);
  k.roof(b.x-5,b.y-5,b.w+10,b.h+10,39,P.metalDark,262);
  for(const elevation of[53,116,179])window(k,b.x+24,b.front+1,28,39,elevation);
  door(k,2635,b.front+2,25,62);
  for(let i=0;i<14;i++)k.box(b.x+b.w-11,b.front+2,16,3,3,P.metal,16+i*16);
  k.beam(b.x+b.w-12,b.front+2,7,b.x+b.w-12,b.front+2,245,2,P.metal);
  k.beam(b.x+b.w+7,b.front+2,7,b.x+b.w+7,b.front+2,245,2,P.metal);
}
function observatory(k,s){
  const b=body(k,s,112,P.wall),cx=s.x+s.w/2,cy=b.y+b.h/2;
  // Keep the lower hemisphere above head height over the narrow front path.
  k.sphere(cx,cy,100,P.metal,170);
  k.cylinder(cx,cy,103,15,P.metalDark,110,16);
  // Raised telescope and shutter seam use volumetric pieces, not a flat image.
  k.box(cx-5,cy-98,10,196,18,P.metalDark,247);
  k.beam(cx+10,cy-20,210,cx+99,cy-40,241,13,P.metalDark);
  k.sphere(cx+101,cy-41,10,P.cream,241);
  for(const dx of[20,166])window(k,b.x+dx,b.front+2,30,30,40);
  door(k,3581,b.front+3,31,64,P.metalDark);
  k.label('THE NIGHT OFFICE',3581,b.front+4,90,P.roofShade,P.cream,185);
}
function relay(k,s){
  cottage(k,s);
  const x=4403,y=525;
  const feet=[[x-30,y-24],[x+30,y-24],[x,y+32]];
  for(const[fx,fy]of feet)k.beam(fx,fy,0,x,y,360,5,P.metal);
  for(let i=0;i<8;i++){
    const z=i*42,r=30*(1-z/360);
    k.beam(x-r,y-r*.8,z,x+r,y-r*.8,z,3,P.metal);
    k.beam(x-r,y-r*.8,z,x,y+r,z,3,P.metal);
    k.beam(x+r,y-r*.8,z,x,y+r,z,3,P.metal);
  }
  k.sphere(x,y,6,P.red,365);
  k.beam(x,y,335,x-51,y-19,335,3,P.metal);
  k.beam(x,y,311,x+50,y+17,311,3,P.metal);
  k.label('MERCY AM 1310',4243,s.y+s.h-6,93,P.cream,P.roofShade,161);
}
function chapel(k,s){
  const b=body(k,s,127,P.wall);
  k.roof(b.x-6,b.y-6,b.w+12,b.h+12,57,P.roof,127);
  const tx=s.x+s.w/2,ty=b.y+29;
  k.box(tx-29,ty-25,58,50,214,P.wall);
  k.roof(tx-34,ty-29,68,58,63,P.roofShade,214);
  k.beam(tx,ty,275,tx,ty,323,4,P.cream);
  k.beam(tx-14,ty,307,tx+14,ty,307,4,P.cream);
  for(const dx of[26,211])window(k,b.x+dx,b.front+1,35,59,42);
  door(k,808,b.front+2,38,72,P.woodShade);
  k.label('COME AS YOU ARE',808,b.front+3,111,P.roofShade,null,191);
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
    const x=431+col*38,y=1740+row*57;
    k.box(x-9,y-5,18,10,32,P.metal);
    k.roof(x-10,y-6,20,12,6,P.metal,32);
    k.box(x-15,y-9,30,18,3,P.soil);
  }
}
function station(k,s){
  const b=body(k,s,151,P.wall);
  k.roof(b.x-7,b.y-7,b.w+14,b.h+14,58,P.metalDark,151);
  const cx=s.x+s.w/2;
  k.box(cx-36,b.y+32,72,62,227,P.wall);
  k.roof(cx-42,b.y+27,84,72,38,P.roof,227);
  k.label('3:17',cx,b.y+95,189,P.roofShade,P.cream,57);
  for(let i=0;i<8;i++)window(k,b.x+17+i*76,b.front+1,39,60,51);
  door(k,3505,b.front+2,59,88,P.woodShade);
  k.box(b.x-21,b.front-7,b.w+42,48,8,P.metalDark,108);
  for(let dx=0;dx<=b.w;dx+=98)k.cylinder(b.x+dx,b.front+28,3,108,P.metalDark,0,6);
  k.label('MERCY COUNTY TERMINAL',cx,b.front+33,132,P.cream,P.roofShade,399);
}

function groundAndRoutes(k){
  k.box(0,0,4800,3456,12,P.ground,-12);
  for(const r of clearings){
    const color=['lot','station','observatory'].includes(r.kind)?'#87938a':r.kind==='marsh'?'#667f71':r.kind==='orchard'?'#72795c':r.kind==='theater'?P.grassLight:P.soil;
    k.box(r.x,r.y,r.w,r.h,1,color,.05);
  }
  for(const r of roads){
    const color=r.kind==='road'?P.road:r.kind==='pavement'?P.curb:r.kind==='pier'?P.wood:P.soil;
    k.box(r.x,r.y,r.w,r.h,1,color,.7);
    if(r.kind==='road'){
      if(r.w>r.h){
        for(const dy of[7,r.h-9])k.box(r.x,r.y+dy,r.w,2,1,P.curb,1.8);
        for(let x=r.x+16;x<r.x+r.w-28;x+=68)k.box(x,r.y+r.h/2-1,28,3,1,P.line,1.9);
      }else{
        for(const dx of[7,r.w-9])k.box(r.x+dx,r.y,2,r.h,1,P.curb,1.8);
        for(let y=r.y+16;y<r.y+r.h-28;y+=68)k.box(r.x+r.w/2-1,y,3,28,1,P.line,1.9);
      }
    }
  }
  for(const w of water){
    k.box(w.x,w.y,w.w,w.h,1,P.water,1.2);
    k.box(w.x+13,w.y+12,Math.max(8,w.w-26),Math.max(8,w.h-24),.3,P.waterDeep,2.3);
    for(let yy=w.y+16;yy<w.y+w.h-12;yy+=32)for(let xx=w.x+11;xx<w.x+w.w-22;xx+=73)
      k.box(xx+hash(xx,yy,4)*13,yy,17,2,.5,P.waterLight,2.7);
  }
  // A broad dry crossing joins the highway to the paper mill.
  k.box(1890,436,214,88,2,P.wood,2.9);
  for(let x=1898;x<2098;x+=18)k.box(x,440,2,80,.5,P.woodShade,5);
  for(const y of[434,526])for(let x=1900;x<2100;x+=40){
    k.box(x,y-2,4,4,30,P.wood);
    if(x<2060)k.beam(x,y,23,x+40,y,23,3,P.woodShade);
  }
  k.box(3635,1380,222,63,2,P.wood,3);
  for(let x=3641;x<3851;x+=17)k.box(x,1384,2,53,.5,P.woodShade,5.3);
  // Ferry boardwalk and low gangway retain their exact accessible approach.
  k.box(2755,2022,139,324,2,P.wood,2.9);
  for(let y=2030;y<2340;y+=18)k.box(2760,y,129,2,.5,P.woodShade,5.2);
  k.box(2720,2097,64,10,2,P.wood,3);
  k.box(2778,2097,6,28,2,P.wood,3);
  for(const[x,y,w]of[[639,681,44],[1370,690,42],[3475,1310,43],[3340,2806,59]])for(let i=0;i<4;i++)k.box(x,y+i*8,w,4,1,P.cream,2.8);
}
function forestAndHills(k,interiors){
  const safe=(x,y)=>!safePoints.some(([px,py])=>Math.abs(px-x)<75&&Math.abs(py-y)<90)
    &&!interiors.some(r=>Math.hypot(r.door.x-x,r.door.y-y)<85)
    &&!roads.some(r=>inRect(x,y,r,39))&&!clearings.some(r=>inRect(x,y,r,36))
    &&!water.some(r=>inRect(x,y,r,44));
  for(let row=1;row<47;row++)for(let col=1;col<66;col++){
    const x=col*72+Math.floor(hash(col,row,10)*33),y=row*72+Math.floor(hash(col,row,11)*31);
    if(hash(col,row,8)<.24||!safe(x,y))continue;
    pine(k,x,y,.84+hash(col,row,9)*.48,col+row);
    if(hash(col,row,4)>.81)k.cone(x+24,y+13,12,22,P.grassLight,0,6);
  }
  for(const[x,y,size]of[[1173,339,1.2],[1400,303,1.4],[1389,433,1.1],[1191,252,1.1]])pine(k,x,y,size,3);
  // Only the distant outside-world skyline rises into impassable mountain forms.
  for(let i=0;i<14;i++){
    const x=130+i*374,y=-310-hash(i,5)*180,r=250+hash(i,4)*180,h=370+hash(i,7)*480;
    k.cone(x,y,r,h,i%2?'#758578':'#66786e',0,5);
    k.cone(x,y,r*.22,h*.28,'#c2c9b9',h*.71,5);
  }
  for(let i=0;i<9;i++)k.cone(-330,210+i*390,330,410+hash(i,6)*390,'#748175',0,5);
}
function railwayAndFerry(k,interiors){
  for(const y of[3009,3106]){
    k.box(3040,y-14,1296,56,1,P.soil,2.3);
    for(let x=3050;x<4330;x+=24)k.box(x,y-12,7,49,1,P.woodShade,3.6);
    for(const dy of[0,25])k.box(3040,y+dy,1296,3,2,P.metal,4.6);
  }
  for(const interior of interiors.filter(r=>r.kind==='railcar')){
    const r=interior.exterior,x=r.x,y=r.y;
    k.box(x+4,y+4,r.width-8,r.height-8,75,P.roofShade,12);
    k.roof(x,y,r.width,r.height,17,P.roofLight,87);
    for(let i=0;i<5;i++)window(k,x+13+i*29,y+r.height-3,18,25,44);
    door(k,interior.door.x,y+r.height-2,20,53,P.woodShade);
    for(const dx of[19,129])for(const dy of[12,48])k.cylinder(x+dx,y+dy,11,10,P.metalDark,0,8);
    k.box(x+6,y+r.height-6,r.width-12,3,4,P.metal,27);
    k.label(interior.id==='railcar-2'?'SLEEPER':interior.id==='railcar-3'?'DINING':'PASSENGER',x+r.width/2,y+r.height+.5,78,P.cream,null,120);
    k.box(x+r.width,y+32,14,8,8,P.metalDark,18);
  }
  // The wreck itself sits in collidable water; the gangway and wheelhouse door
  // lie beside the boardwalk, leaving the player's access route unobstructed.
  k.box(2634,2077,93,111,26,P.roofShade,1);
  k.cone(2680,2077,47,26,P.woodShade,1,6);
  k.box(2643,2096,68,73,59,P.wallShade,27);
  k.roof(2639,2092,76,81,18,P.roofShade,86);
  window(k,2655,2170,34,26,53);
  door(k,2715,2100,12,42,P.woodShade);
  k.beam(2658,2091,17,2658,2091,145,4,P.metal);
  k.beam(2658,2091,128,2705,2091,128,3,P.metal);
  k.label('NELL',2679,2172,91,P.cream,null,47);
}
function districtDetails(k){
  for(const[x,y]of[[302,685],[302,739],[533,714],[1358,812]])car(k,x,y,y===739?P.metal:'#af7769');
  car(k,1694,1366,P.metalDark);
  for(const[x,y]of[[391,670],[559,670],[1187,795],[970,827],[2187,788],[3366,1290],[3610,1287],[3520,1365],[4282,857],[732,1978],[912,1993],[1359,2595],[2973,2290],[3250,2777],[3584,2838],[3760,2818],[1913,1394]])bench(k,x,y);
  for(const[x,y]of[[596,663],[845,649],[1126,643],[1490,818],[449,386],[2110,764],[2491,817],[3440,1272],[3582,1148],[4193,801],[881,1928],[1560,2678],[2770,2060],[2916,2253],[2771,2328],[3202,2753],[3645,2767],[3939,2895],[1860,1387]])lamp(k,x,y);
  for(const[x,y]of[[597,549],[597,572],[597,595],[2113,647],[2137,665],[2366,866],[2393,866],[2421,866],[1633,2910],[3137,2788],[3168,2788],[4023,2843]])crate(k,x,y);
  for(const[x,y]of[[2666,625],[2693,625],[2666,655],[4383,774],[4411,774],[4439,774],[3224,2240],[3251,2240],[3178,2434]])barrel(k,x,y);
  for(const[x,y,w]of[[324,881,237],[928,1013,211],[419,1975,146]])fence(k,x,y,w);
  sign(k,'MERCY FALLS',610,939,147,P.metalDark);
  sign(k,'NO NIGHT SHIFT',2306,889,133,P.roofShade);
  sign(k,'NIGHT OFFICE',3350,1426,133,P.metalDark);
  sign(k,'MERCY AM 1310',4119,930,147,P.roofShade);
  sign(k,'OPEN TO ALL',680,2071,120,P.woodShade);
  sign(k,'FENN ORCHARD',1119,2869,141,P.woodShade);
  sign(k,'FERRY CLOSED',2596,2356,141,P.roofShade);
  sign(k,'PLATFORM 13',3410,2814,145,P.metalDark);
  sign(k,'ROAD 6',1910,1451,79,P.metalDark);
  // Abandoned machinery, cable drums and pale paper rolls around the mill.
  for(const[x,y]of[[2395,686],[2475,684],[2520,644]]){
    k.cylinder(x,y,20,13,P.metal,0,10);
    k.cylinder(x,y,7,17,P.metalDark,0,8);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;
      k.box(x+Math.cos(a)*19-4,y+Math.sin(a)*19-4,8,8,11,P.metal);
    }
  }
  for(let i=0;i<4;i++)k.cylinder(2597,638+i*28,18,30,P.cream,0,10);
  k.beam(2143,309,93,2547,309,93,6,P.metalDark);
  for(const x of[2143,2547])k.box(x-4,305,8,8,93,P.metalDark);
  // The grove's stone seats and orchard's bare branches make the two quiet
  // narrative locations distinct from the pine-covered county.
  for(const[x,y]of[[1310,308],[1355,312],[1348,241]])k.box(x-7,y-8,14,16,22,P.metal);
  for(let row=0;row<4;row++)for(let col=0;col<6;col++){
    const x=1120+col*121+(row%2)*14,y=2430+row*146;
    if(roads.some(r=>inRect(x,y,r,45))||safePoints.some(([px,py])=>Math.hypot(x-px,y-py)<92))continue;
    k.cylinder(x,y,5,117,P.woodShade,0,6);
    for(const[dx,dy,z]of[[-27,-6,70],[31,8,57],[-19,8,103],[24,-11,88]]){
      k.beam(x,y,z-12,x+dx,y+dy,z+12,4,P.woodShade);
      k.beam(x+dx,y+dy,z+12,x+dx,y+dy,z+34,3,P.woodShade);
    }
  }
  for(let i=0;i<28;i++){
    const x=2466+i*29,y=2266+hash(i,5)*42;
    if(x>2720&&x<2910)continue;
    for(const dx of[0,6])k.beam(x+dx,y,0,x+dx+2,y,32+hash(i,3)*16,2,P.grassLight);
    k.cylinder(x,y,2,9,P.woodShade,30,5);
  }
  // A silent signal, bus shelter and precise parking lines are small landmarks
  // that read naturally at a human-height camera angle.
  k.box(795,683,55,8,56,P.metalDark);
  k.box(793,680,59,36,5,P.metal,56);
  k.box(800,684,45,3,35,P.glass,16);
  k.label('COUNTY BUS',823,722,61,P.cream,P.metalDark,75);
  for(let i=0;i<5;i++)k.box(316+i*51,758,32,3,1,P.line,2);
  k.cylinder(4062,2902,3,114,P.metalDark,0,6);
  k.box(4053,2898,19,8,41,P.metalDark,75);
  k.sphere(4062,2907,5,P.red,105);
  k.sphere(4062,2907,5,P.window,87);
}

export function buildVelvet3D(kit){
  const interiors=getInteriors('lynch');
  groundAndRoutes(kit);
  forestAndHills(kit,interiors);
  for(const structure of structures){
    const build={diner,phone:telephone,theater,motel,mill,tower,observatory,relay,chapel,station}[structure.kind]||cottage;
    build(kit,structure);
  }
  railwayAndFerry(kit,interiors);
  districtDetails(kit);
}
