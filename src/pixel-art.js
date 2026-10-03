// Shared flat pixel primitives. World artists can also use their own helpers.
export function rect(ctx,x,y,width,height,color) {
  if(color)ctx.fillStyle=color;
  ctx.fillRect(Math.round(x),Math.round(y),Math.round(width),Math.round(height));
}

export function oval(ctx,x,y,width,height,color) {
  const stride=height<18?2:4;
  for(let yy=0;yy<height;yy+=stride) {
    const dy=(yy+stride/2-height/2)/(height/2);
    const half=Math.round(Math.sqrt(Math.max(0,1-dy*dy))*width/2);
    rect(ctx,x+width/2-half,y+yy,half*2,Math.min(stride,height-yy),color);
  }
}

export function intersects(bounds,obj,pad=0) {
  const width=obj.width??obj.w??0,height=obj.height??obj.h??0;
  return obj.x+width+pad>=bounds.x&&obj.x-pad<=bounds.x+bounds.width&&obj.y+height+pad>=bounds.y&&obj.y-pad<=bounds.y+bounds.height;
}

const GLYPHS={
  A:['010','101','111','101','101'],B:['110','101','110','101','110'],C:['011','100','100','100','011'],D:['110','101','101','101','110'],
  E:['111','100','110','100','111'],F:['111','100','110','100','100'],G:['011','100','101','101','011'],H:['101','101','111','101','101'],
  I:['111','010','010','010','111'],J:['001','001','001','101','010'],K:['101','101','110','101','101'],L:['100','100','100','100','111'],
  M:['10101','11111','10101','10101','10101'],N:['101','111','111','111','101'],O:['010','101','101','101','010'],P:['110','101','110','100','100'],
  Q:['010','101','101','111','011'],R:['110','101','110','101','101'],S:['011','100','010','001','110'],T:['111','010','010','010','010'],
  U:['101','101','101','101','111'],V:['101','101','101','101','010'],W:['10101','10101','10101','11111','01010'],X:['101','101','010','101','101'],
  Y:['101','101','010','010','010'],Z:['111','001','010','100','111'],
  '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],'3':['110','001','010','001','110'],
  '4':['101','101','111','001','001'],'5':['111','100','110','001','110'],'6':['011','100','110','101','010'],'7':['111','001','010','010','010'],
  '8':['010','101','010','101','010'],'9':['010','101','011','001','110'],'.':['000','000','000','000','010'],
  '-':['000','000','111','000','000'],':':['000','010','000','010','000'],'+':['000','010','111','010','000'],
};

export function text(ctx,string,x,y,color,scale=1) {
  let xx=x;
  for(const letter of String(string).toUpperCase()) {
    const glyph=GLYPHS[letter];
    if(glyph)glyph.forEach((row,yy)=>[...row].forEach((v,i)=>{if(v==='1')rect(ctx,xx+i*scale,y+yy*scale,scale,scale,color);}));
    xx+=((glyph?.[0].length||3)+1)*scale;
  }
  return xx-x;
}
