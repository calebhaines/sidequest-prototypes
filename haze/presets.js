/* Eight skies, all made of the same little sine waves. */
(() => {
  'use strict';
  const S=window.HazeSchema;
  function make(id,name,description,settings,paint){const s=Object.assign(S.defaultState(),settings,{name,score:Array.from({length:24},()=>Array(32).fill(0))});paint(s.score);return {id,name,description,state:S.normalize(s)};}
  const line=(a,y,x,v)=>{if(y>=0&&y<24&&x>=0&&x<32)a[y][x]=Math.max(a[y][x],v);};
  const presets=[
    make('sky','The sky has mislaid its notes','A small melody, with its shadow floating a little way behind.',{},a=>{for(let x=0;x<32;x++){const y=[0,2,4,6,4,2,1,3][Math.floor(x/4)];line(a,y,x,x%4===0?.9:.58);if(x%8<6)line(a,8+Math.floor(x/8)%3,x,.22);}}),
    make('stairs','Stairs for a passing cloud','Dry pentatonic droplets, climbing in uncertain shoes.',{tempo:116,root:48,attack:3,release:105,color:.48,blur:0,echo:.38,room:.13},a=>{for(let x=0;x<32;x++){if(x%2===0)line(a,[0,2,4,7,9,7,4,2][x/2%8],x,.88);if(x%8===6)line(a,14,x,.4);}}),
    make('velvet','A velvet weather warning','Long minor chords unroll across the night.',{tempo:62,bars:4,root:36,scale:'minor',attack:650,release:1700,blur:.5,color:.12,drift:.26,cutoff:4800,room:.58,echo:.14},a=>{for(let x=0;x<32;x++){for(const r of [[0,2,4,7],[1,3,5,8],[3,5,7,10],[0,4,6,9]][Math.floor(x/8)])line(a,r,x,.48*(x%8<7?1:.4));}}),
    make('glass','Glass, pretending to be rain','A scattered harmonic shower, hung on a crooked fundamental.',{tempo:103,root:34,scale:'harmonic',stretch:1.13,color:.6,attack:2,release:800,drift:.06,spread:1,room:.48,echo:.32},a=>{let seed=431;for(let x=0;x<32;x++){seed=(seed*1664525+1013904223)>>>0;line(a,2+seed%19,x,.4+seed%40/100);if(x%4===0)line(a,seed%5,x,.55);}}),
    make('mirror','The mirror owes us a song','A quiet palindrome with nowhere particularly sensible to go.',{tempo:78,root:45,scale:'major',direction:'pingpong',attack:85,release:670,color:.3,blur:.22,echo:.24,room:.37},a=>{for(let x=0;x<16;x++){const y=[0,4,2,7,9,5,3,8][Math.floor(x/2)];line(a,y,x,.68);line(a,y,31-x,.68);if(x%4<2){line(a,12,x,.25);line(a,12,31-x,.25);}}}),
    make('moths','A committee of violet moths','Thin overlapping ribbons with a slowly moving centre of gravity.',{tempo:49,bars:4,root:43,scale:'chromatic',stretch:1.025,attack:460,release:2200,drift:.62,blur:.75,color:.15,cutoff:7000,room:.7,echo:.1,volume:.6},a=>{for(let x=0;x<32;x++){for(let k=0;k<3;k++){const y=5+k*6+Math.round(Math.sin(x*.22+k*2)*2);line(a,y,x,.55);line(a,y+1,x,.16);}}}),
    make('clock','The clock has swallowed noon','A pointed little machine that refuses to agree with itself.',{tempo:142,bars:1,root:40,scale:'minor',attack:2,release:70,color:.84,drive:.36,cutoff:12000,drift:.02,blur:0,echo:.22,echoDivision:'1/8',room:.08},a=>{for(let x=0;x<32;x++){if(x%4===0)line(a,0,x,.95);if(x%4===2)line(a,7,x,.7);if(x%3===1)line(a,14+(x%5),x,.55);}}),
    make('blank','An entirely imaginary sky','An empty page. Draw a note and give it somewhere to go.',{tempo:88,color:.22,attack:28,release:380,echo:.22,room:.22},()=>{}),
  ];
  window.HazePresets=Object.freeze(presets.map(p=>Object.freeze(p)));
})();
