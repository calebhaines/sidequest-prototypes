import { EXPANDED_SIZE, EXPANDED_FEATURES } from './expanded-world-data.js';
import { drawVelvetTerrain, drawVelvetActor, drawVelvetAmbient } from './velvet-world.js';
import { drawEmberTerrain, drawEmberActor, drawEmberAmbient } from './ember-world.js';

const CHUNK_SIZE=512,MAX_CHUNKS=32,OVERVIEW_WIDTH=960;
const chunks=new Map(),overviews=new Map();
const ARTISTS={
  lynch:{terrain:drawVelvetTerrain,actor:drawVelvetActor,ambient:drawVelvetAmbient,ground:'#344541',mark:'#e8b39a'},
  shinobi:{terrain:drawEmberTerrain,actor:drawEmberActor,ambient:drawEmberAmbient,ground:'#8abb69',mark:'#f4b356'},
};

function makeCanvas(width,height) {
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
  canvas.getContext('2d').imageSmoothingEnabled=false;
  return canvas;
}

function phaseFor(theme,phase) {return theme==='lynch'&&phase==='dream'?'dream':'waking';}

function getChunk(theme,phase,column,row) {
  const key=`${theme}:${phase}:${column}:${row}`;
  if(chunks.has(key)) {
    const cached=chunks.get(key);chunks.delete(key);chunks.set(key,cached);return cached;
  }
  const x=column*CHUNK_SIZE,y=row*CHUNK_SIZE;
  const width=Math.min(CHUNK_SIZE,EXPANDED_SIZE.width-x),height=Math.min(CHUNK_SIZE,EXPANDED_SIZE.height-y);
  if(chunks.size>=MAX_CHUNKS) {
    const oldestKey=chunks.keys().next().value,oldest=chunks.get(oldestKey);
    chunks.delete(oldestKey);oldest.canvas.width=1;oldest.canvas.height=1;
  }
  const canvas=makeCanvas(width,height),ctx=canvas.getContext('2d');
  ctx.translate(-x,-y);
  ARTISTS[theme].terrain(ctx,{x,y,width,height},phase);
  const chunk={canvas,x,y,width,height};chunks.set(key,chunk);
  return chunk;
}

function getOverview(theme,phase) {
  const key=`${theme}:${phase}`;
  if(overviews.has(key))return overviews.get(key);
  const scale=OVERVIEW_WIDTH/EXPANDED_SIZE.width;
  const canvas=makeCanvas(OVERVIEW_WIDTH,Math.ceil(EXPANDED_SIZE.height*scale)),ctx=canvas.getContext('2d');
  ctx.scale(scale,scale);
  ARTISTS[theme].terrain(ctx,{x:0,y:0,...EXPANDED_SIZE},phase);
  const overview={canvas,sourceHeight:EXPANDED_SIZE.height*scale};overviews.set(key,overview);
  return overview;
}

function visibleEntity(entity,bounds,phase,theme) {
  if(entity.defeated)return false;
  if(theme==='lynch'&&typeof entity.phase==='string'&&entity.phase!=='both'&&entity.phase!==phase)return false;
  const pad=entity.type==='landmark'?90:65;
  return entity.x>=bounds.x-pad&&entity.x<=bounds.x+bounds.width+pad&&entity.y>=bounds.y-pad&&entity.y<=bounds.y+bounds.height+pad;
}

function progressPixels(ctx,entity,artist) {
  const x=Math.round(entity.x),y=Math.round(entity.y);
  if(entity.type==='waypoint'&&(entity.unlocked||entity.discovered||entity.visited)) {
    ctx.fillStyle=artist.mark;ctx.fillRect(x-2,y-11,4,2);ctx.fillRect(x-1,y-9,2,5);
  }else if(entity.type==='landmark'&&(entity.visited||entity.discovered||entity.completed)) {
    ctx.fillStyle=artist.mark;ctx.fillRect(x-3,y-9,2,2);ctx.fillRect(x+1,y-7,3,2);
  }
}

export function drawExpandedCharacter(ctx,x,y,theme,opts={}) {
  const artist=ARTISTS[theme];if(!artist)return;
  const npc=opts.npc||opts.type==='npc';
  artist.actor(ctx,{...opts,x,y,type:npc?'npc':opts.type||'player'},{...opts,npc,phase:phaseFor(theme,opts.phase)});
}

export function drawExpandedWorld(ctx,theme,opts={}) {
  const artist=ARTISTS[theme];if(!artist)return;
  const scale=opts.scale||1,x=Math.round(opts.x||0),y=Math.round(opts.y||0);
  const width=opts.width||ctx.canvas.width,height=opts.height||ctx.canvas.height;
  const phase=phaseFor(theme,opts.phase),time=opts.time||0;
  const bounds={x,y,width:width/scale,height:height/scale};
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.fillStyle=artist.ground;ctx.fillRect(0,0,width,height);
  ctx.scale(scale,scale);ctx.translate(-x,-y);
  if(scale<=.28) {
    const overview=getOverview(theme,phase);
    ctx.drawImage(overview.canvas,0,0,overview.canvas.width,overview.sourceHeight,0,0,EXPANDED_SIZE.width,EXPANDED_SIZE.height);
  }else{
    const left=Math.max(0,Math.floor(x/CHUNK_SIZE)),top=Math.max(0,Math.floor(y/CHUNK_SIZE));
    const right=Math.min(Math.ceil(EXPANDED_SIZE.width/CHUNK_SIZE)-1,Math.floor((x+bounds.width)/CHUNK_SIZE));
    const bottom=Math.min(Math.ceil(EXPANDED_SIZE.height/CHUNK_SIZE)-1,Math.floor((y+bounds.height)/CHUNK_SIZE));
    for(let row=top;row<=bottom;row++)for(let column=left;column<=right;column++){
      const chunk=getChunk(theme,phase,column,row);ctx.drawImage(chunk.canvas,chunk.x,chunk.y);
    }
  }
  const entities=[...(opts.entities||[])];
  if(opts.player)entities.push({...opts.player,type:'player'});
  entities.filter(entity=>visibleEntity(entity,bounds,phase,theme)).sort((a,b)=>a.y-b.y).forEach(entity=>{
    artist.actor(ctx,entity,{...opts,time,phase,npc:entity.type==='npc'});
    progressPixels(ctx,entity,artist);
  });
  if(scale>.28)artist.ambient(ctx,bounds,{...opts,time,phase});
  ctx.restore();
}

export function drawExpandedPreview(canvas,theme) {
  const ctx=canvas.getContext('2d'),scale=canvas.width/(theme==='shinobi'?1500:865);
  const worldHeight=canvas.height/scale;
  const scene=theme==='lynch'?{x:291,y:708-worldHeight,player:{x:739,y:700,facing:'down'}}:{x:50,y:10,player:{x:758,y:696,facing:'down'}};
  const entities=EXPANDED_FEATURES[theme].map(entity=>({...entity}));
  drawExpandedWorld(ctx,theme,{...scene,width:canvas.width,height:canvas.height,scale,time:2.35,phase:'waking',entities});
}

// Small diagnostics make the memory bound directly reviewable in browser QA.
export function getExpandedRenderStats() {
  const chunkBytes=[...chunks.values()].reduce((sum,chunk)=>sum+chunk.width*chunk.height*4,0);
  const overviewBytes=[...overviews.values()].reduce((sum,overview)=>sum+overview.canvas.width*overview.canvas.height*4,0);
  return {chunkSize:CHUNK_SIZE,maxChunks:MAX_CHUNKS,chunkCount:chunks.size,chunkBytes,overviewCount:overviews.size,overviewBytes};
}

export function clearExpandedWorldCaches() {
  for(const chunk of chunks.values()){chunk.canvas.width=1;chunk.canvas.height=1;}
  for(const overview of overviews.values()){overview.canvas.width=1;overview.canvas.height=1;}
  chunks.clear();overviews.clear();
}
