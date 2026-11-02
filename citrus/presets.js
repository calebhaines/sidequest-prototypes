/* Original CITRUS sound recipes; phrase and chain remain the player's. */
(function(g){'use strict';const make=(id,name,description,synth)=>Object.freeze({id,name,description,synth:Object.freeze(g.createCitrusDSP().normalize(synth))});g.CitrusPresets=Object.freeze([
make('fresh-squeeze','Fresh squeeze','A resonant saw with a crisp contour and room for accents.',{}),
make('lemon-rind','Lemon rind','A dry bright saw with a short acidic bite.',{cutoff:1100,resonance:.74,envMod:.4,decay:.24,accent:.72}),
make('pith','Pith','Hollow square bass with a restrained filter.',{wave:'square',cutoff:380,resonance:.36,envMod:.35,decay:.7,accent:.5}),
make('night-market','Night market','A low simmer, rising sharply on accented steps.',{cutoff:210,resonance:.82,envMod:.75,decay:.42,accent:.9}),
make('candied-peel','Candied peel','A sweet square with a broad envelope sweep.',{wave:'square',cutoff:680,resonance:.62,envMod:.85,decay:.95,accent:.7}),
make('tart','Tart','Maximum resonance with a small, focused contour.',{cutoff:1500,resonance:.98,envMod:.2,decay:.28,accent:.65,volume:.52}),
make('marmalade','Marmalade','A rounded saw with long decay and gentle accent.',{cutoff:440,resonance:.45,envMod:.63,decay:1.5,accent:.35}),
make('citron','Citron','Bright open saw for hearing the oscillator and slide.',{cutoff:4800,resonance:.12,envMod:.1,decay:.6,accent:.4}),
make('bitter-orange','Bitter orange','Strong filter drive and a tightly wound resonant edge.',{cutoff:650,resonance:.9,envMod:.58,decay:.34,filterDrive:1.4,volume:.5}),
make('lime-leaf','Lime leaf','A soft square with a darker opening contour.',{wave:'square',cutoff:180,resonance:.52,envMod:.68,decay:.65,accent:.62}),
make('long-zest','Long zest','A long decay traces each accented movement.',{cutoff:330,resonance:.77,envMod:.75,decay:2,accent:.8}),
make('sherbet','Sherbet','A nasal square and quick resonant pluck.',{wave:'square',cutoff:1600,resonance:.8,envMod:.35,decay:.22,accent:.58}),
make('copper-pan','Copper pan','A firm saw with subtle component variation.',{cutoff:860,resonance:.58,envMod:.58,decay:.5,drift:.15}),
make('low-pulp','Low pulp','A deep square that leaves room in a dense arrangement.',{wave:'square',cutoff:120,resonance:.25,envMod:.28,decay:.8,accent:.5}),
make('rolling-peel','Rolling peel','Classic slide time with a pronounced accent sweep.',{cutoff:540,resonance:.85,envMod:.72,decay:.38,accent:1,slideTime:.022,volume:.55}),
make('slow-steep','Slow steep','An explicitly extended slide, a modern adjustment.',{wave:'square',cutoff:900,resonance:.67,envMod:.48,decay:1.2,slideTime:.07,accent:.6})]);})(typeof window==='undefined'?globalThis:window);
