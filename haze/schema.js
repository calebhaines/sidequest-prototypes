/* HAZE: a bounded, portable score. */
(() => {
  'use strict';
  const VERSION='1.0.0', COLS=32, ROWS=24;
  const SCALES=[{id:'pentatonic',name:'Pentatonic'},{id:'minor',name:'Natural minor'},{id:'major',name:'Major'},{id:'chromatic',name:'Chromatic'},{id:'harmonic',name:'Harmonic series'}];
  const DIRECTIONS=[{id:'forward',name:'Forward'},{id:'reverse',name:'Reverse'},{id:'pingpong',name:'Ping-pong'}];
  const DIVISIONS=['1/16','1/8','3/16','1/4','3/8','1/2'];
  const copy=v=>JSON.parse(JSON.stringify(v));
  const number=(v,lo,hi,d)=>typeof v==='number'&&Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d;
  const integer=(v,lo,hi,d)=>Math.round(number(v,lo,hi,d));
  const choice=(v,list,d)=>list.includes(v)?v:d;
  const text=(v,d)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,100)||d:d;
  function defaultState(){
    const score=Array.from({length:ROWS},()=>Array(COLS).fill(0));
    for(let c=0;c<COLS;c++){score[(Math.floor(c/4)*2+[0,2,4,2][Math.floor(c/8)])%12][c]=c%4===0?.82:.48;if(c%8<6)score[7+Math.floor(c/8)%3][c]=.25;}
    return {version:VERSION,name:'The sky has mislaid its notes',tempo:88,bars:2,direction:'forward',freeze:false,position:0,root:45,scale:'pentatonic',stretch:1,color:.26,drift:.15,blur:.15,attack:35,release:420,cutoff:9500,drive:.12,spread:.82,volume:.66,echo:.25,echoDivision:'3/16',feedback:.38,room:.28,score};
  }
  function normalize(raw){
    const r=raw&&typeof raw==='object'?raw:{},d=defaultState(),s={version:VERSION,name:text(r.name,d.name)};
    for(const [key,lo,hi] of [['tempo',40,180],['stretch',.5,1.8],['color',0,1],['drift',0,1],['blur',0,1],['attack',2,1200],['release',10,5000],['cutoff',200,18000],['drive',0,1],['spread',0,1],['volume',0,1],['echo',0,1],['feedback',0,.82],['room',0,1],['position',0,31.999]])s[key]=number(r[key],lo,hi,d[key]);
    s.bars=choice(r.bars,[1,2,4,8],d.bars);s.root=integer(r.root,24,72,d.root);s.scale=choice(r.scale,SCALES.map(x=>x.id),d.scale);s.direction=choice(r.direction,DIRECTIONS.map(x=>x.id),d.direction);s.echoDivision=choice(r.echoDivision,DIVISIONS,d.echoDivision);s.freeze=r.freeze===true;
    s.score=Array.from({length:ROWS},(_,y)=>Array.from({length:COLS},(_,x)=>number(r.score?.[y]?.[x],0,1,d.score[y][x])));
    return s;
  }
  function parseProject(json){
    if(typeof json!=='string'||json.length>1024*1024)throw Error('Choose a HAZE project smaller than 1 MB.');
    let p;try{p=JSON.parse(json);}catch{throw Error('This file is not valid JSON.');}
    if(!p||p.format!=='haze-project'||p.formatVersion!==1||!p.state||typeof p.state!=='object')throw Error('Choose a HAZE project (.haze.json).');
    const s=p.state;
    if(!Array.isArray(s.score)||s.score.length!==ROWS||s.score.some(row=>!Array.isArray(row)||row.length!==COLS||row.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)))throw Error('The score must contain 24 rows of 32 intensities between 0 and 1.');
    for(const key of ['tempo','stretch','color','drift','blur','attack','release','cutoff','drive','spread','volume','echo','feedback','room','position','root','bars'])if(typeof s[key]!=='number'||!Number.isFinite(s[key]))throw Error('The project contains invalid controls.');
    if(!SCALES.some(v=>v.id===s.scale)||!DIRECTIONS.some(v=>v.id===s.direction)||!DIVISIONS.includes(s.echoDivision)||![1,2,4,8].includes(s.bars)||typeof s.freeze!=='boolean')throw Error('The project contains invalid options.');
    return normalize(s);
  }
  const serializeProject=s=>JSON.stringify({format:'haze-project',formatVersion:1,appVersion:VERSION,state:normalize(s)},null,2);
  const noteName=m=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((Math.round(m)%12)+12)%12]+(Math.floor(m/12)-1);
  window.HazeSchema=Object.freeze({VERSION,COLS,ROWS,SCALES,DIRECTIONS,DIVISIONS,defaultState,normalize,parseProject,serializeProject,copy,noteName});
})();
