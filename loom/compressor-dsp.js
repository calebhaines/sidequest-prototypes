/* GALLEY BUTTER · original clean and reduced-order analog dynamics families. */
(function (scope) {
  'use strict';
  function createLoomCompressorDSP() {
    'use strict';
    // Every dependency lives inside this function: AudioWorklet serializes it.
    const PI = Math.PI, TAU = PI * 2;
    const specifications = {
      threshold: [-48, 0, -18], ratio: [1, 40, 4], attack: [.02, 100, 12], release: [20, 5000, 180], knee: [0, 18, 6], makeup: [-12, 24, 3], sidechain: [20, 500, 30], mix: [0, 1, 1],
      model: ['clean', 'fet-76', 'opto-2a', 'opto-3a', 'vari-670', 'bus-4k', 'vca-160', 'bus-2500', 'diode-609'], input: [-24, 24, 0], colour: [0, 1, .35], timing: ['manual', 'classic'], link: [0, 1, 1], fetMode: ['normal', 'all-buttons'], thrust: ['off', 'medium', 'loud']
    };
    const fullKeys = Object.keys(specifications);
    Object.assign(specifications, { bandMode: ['full', 'multiband'], crossoverLow: [50, 800, 200], crossoverHigh: [1200, 12000, 2500] });
    for (const [index, band] of ['low', 'mid', 'high'].entries()) Object.assign(specifications, {
      [band + 'Threshold']: [-60, 0, -18], [band + 'Ratio']: [1, 40, 4],
      [band + 'Attack']: [.02, 100, [25, 12, 3][index]], [band + 'Release']: [20, 5000, [220, 160, 90][index]],
      [band + 'Gain']: [-12, 12, 0], [band + 'Enabled']: ['on', 'off'], [band + 'Solo']: ['off', 'on']
    });
    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const bound = value => Number.isFinite(value) ? clamp(value, -8, 8) : 0;
    const db = value => Math.pow(10, value / 20);
    const levelDb = value => 20 * Math.log10(Math.max(value, 1e-12));
    const mixSample = (dry, wet, mix) => bound(dry + (wet - dry) * mix);
    function normalize(params) {
      const source = params && typeof params === 'object' ? params : {}, result = {};
      for (const key of Object.keys(specifications)) {
        const rule = specifications[key];
        result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.bypass = source.bypass === true; return result;
    }
    function saturate(x) { if (x >= 3) return 1; if (x <= -3) return -1; const square = x*x; return x*(27+square)/(27+9*square); }
    function lowpassCoefficients(frequency, q, rate) {
      const w = TAU*frequency/rate, c = Math.cos(w), alpha = Math.sin(w)/(2*q), a0 = 1+alpha;
      return new Float64Array([(1-c)*.5/a0, (1-c)/a0, (1-c)*.5/a0, -2*c/a0, (1-alpha)/a0]);
    }
    function filter(x, c, state, offset) {
      const y = bound(c[0]*x+state[offset]);
      state[offset] = bound(c[1]*x-c[3]*y+state[offset+1]); state[offset+1] = bound(c[2]*x-c[4]*y); return y;
    }
    function createFull(sampleRate, params, bandDynamics = false) {
      let p = normalize(params);
      if(bandDynamics)p.threshold=clamp(finite(params?.threshold,-18),-60,0);
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), osr = sr*4;
      const meters = {reductionDb:0, reductionLeftDb:0, reductionRightDb:0, inputDb:-120, outputDb:-120, detectorDb:-120};
      // Clean retains the original arithmetic and coefficients. Independent
      // envelopes only add optional dual-mono linking; the stock shared loop
      // is unchanged, including the original max-rectified stereo detector.
      let envelope = 0, previousL = 0, previousR = 0, hpL = 0, hpR = 0, attack = 0, release = 0, hp = 0, makeup = 1;
      const cleanMono = new Float64Array(2);
      const detector = new Float64Array(2), detectorPrevious = new Float64Array(2), detectorHP = new Float64Array(2), thrustLow = new Float64Array(2), thrustHigh = new Float64Array(2);
      const reduction = new Float64Array(2), slowCell = new Float64Array(2), exposure = new Float64Array(2), hold = new Float64Array(2), applied = new Float64Array(2);
      const colourPrevious = new Float64Array(2), colourDCPrevious = new Float64Array(2), colourDC = new Float64Array(2), core = new Float64Array(2), colourState = new Float64Array(8), colourActive = new Int32Array(2);
      const colourFilters = [lowpassCoefficients(sr*.39, .5411961, osr), lowpassCoefficients(sr*.39, 1.306563, osr)];
      const smoothKeys = ['threshold','ratio','knee','input','makeup','mix','colour','link'], smooth = new Float64Array(8), target = new Float64Array(8), slew = 1-Math.exp(-1/(sr*.004));
      let cachedInputDb = NaN, cachedMakeupDb = NaN, cachedInputGain = 1, cachedMakeupGain = 1;
      const declickFrames = Math.max(1, Math.round(sr*.004)), lastWet = new Float64Array(2), offset = new Float64Array(2), declickLeft = new Int32Array(2), declickPending = new Int32Array(2);
      const thrustLowCoefficient = 1-Math.exp(-TAU*300/sr), thrustHighCoefficient = 1-Math.exp(-TAU*2200/sr), coreCoefficient = 1-Math.exp(-TAU*45/osr), dcCoefficient = Math.exp(-TAU*9/sr);
      let initialized = false, topology = '', cleanInput = 1, cleanInputTarget = 1, cleanLink = 1, cleanLinkTarget = 1, model = 0, baseAttack = .012, baseRelease = .18, detectorAttack = 1, detectorRelease = 1, rmsCoefficient = 1, attackStep = 1, releaseStep = 1, slowAttack = 1, slowRelease = 1, memoryAttack = 1, memoryRelease = 1;
      const profileIndex = {'clean':0,'fet-76':1,'opto-2a':2,'opto-3a':3,'vari-670':4,'bus-4k':5,'vca-160':6,'bus-2500':7,'diode-609':8};
      // Seconds. These are deliberately simplified program laws, not claims of
      // measured component values or exact hardware revisions.
      const classicAttack = [0,.00008,.01,.0018,.0003,.01,.002,.003,.003];
      const classicRelease = [0,.08,.06,.05,.3,.1,.1,.1,.1];
      function update() {
        const priorModel = model;
        attack = Math.exp(-1/(sr*p.attack*.001)); release = Math.exp(-1/(sr*p.release*.001)); hp = Math.exp(-TAU*Math.min(p.sidechain, sr*.4)/sr); makeup = db(p.makeup);
        cleanInputTarget = db(p.input); cleanLinkTarget = p.link; model = profileIndex[p.model];
        if (initialized && model !== priorModel) {
          const wasEnergy = priorModel === 4 || priorModel === 6 || priorModel === 7, usesEnergy = model === 4 || model === 6 || model === 7;
          if (priorModel === 0) {
            detector[0] = cleanMono[0]; detector[1] = cleanMono[1];
            detectorHP[0] = hpL; detectorHP[1] = hpR; detectorPrevious[0] = previousL; detectorPrevious[1] = previousR;
          }
          if (wasEnergy !== usesEnergy) for (let channel=0;channel<2;channel++) detector[channel] = usesEnergy ? detector[channel]*detector[channel] : Math.sqrt(Math.max(0,detector[channel]));
          if (model === 0) {
            envelope = Math.max(detector[0],detector[1]);cleanMono.set(detector);
            hpL = detectorHP[0]; hpR = detectorHP[1]; previousL = detectorPrevious[0]; previousR = detectorPrevious[1];
          }
          reduction.set(applied); slowCell.set(applied); exposure.fill(0); hold.fill(0);
          colourState.fill(0);colourDCPrevious.fill(0);colourDC.fill(0);core.fill(0);colourActive.fill(0);
        }
        baseAttack = p.timing === 'classic' && model ? classicAttack[model] : p.attack*.001;
        baseRelease = p.timing === 'classic' && model ? classicRelease[model] : p.release*.001;
        if (model === 1 && p.fetMode === 'all-buttons' && p.timing === 'classic') { baseAttack = .000035; baseRelease = .045; }
        attackStep = 1-Math.exp(-1/(sr*baseAttack)); releaseStep = 1-Math.exp(-1/(sr*baseRelease));
        // Rectifier/energy integration remains part of the family in manual
        // mode; manual attack/release controls its gain element, not a renamed
        // copy of the original peak follower.
        const detectorAttackSeconds = model === 6 ? .01 : model === 2 ? .0015 : model === 3 ? .00045 : model === 4 ? .0002 : model === 1 ? .000025 : .00015;
        detectorAttack = 1-Math.exp(-1/(sr*detectorAttackSeconds));
        detectorRelease = 1-Math.exp(-1/(sr*(model === 6 ? .01 : model === 2 ? .018 : model === 3 ? .009 : model === 4 ? .025 : .012)));
        rmsCoefficient = 1-Math.exp(-1/(sr*(model === 6 ? .01 : model === 7 ? .0035 : .006)));
        slowAttack = 1-Math.exp(-1/(sr*(model === 1 ? .03 : model === 2 ? .35 : model === 3 ? .12 : model === 4 ? .2 : .16)));
        slowRelease = 1-Math.exp(-1/(sr*(model === 1 ? .3 : model === 2 ? 1 : model === 3 ? .8 : model === 4 ? 1.2 : .8)));
        memoryAttack = 1-Math.exp(-1/(sr*(model === 2 ? .3 : model === 3 ? .18 : .25))); memoryRelease = 1-Math.exp(-1/(sr*(model === 2 ? 2.5 : model === 3 ? 1.2 : 1.5)));
        for (let i=0;i<target.length;i++) target[i] = p[smoothKeys[i]];
        if (!initialized) { smooth.set(target); cleanInput = cleanInputTarget; cleanLink = cleanLinkTarget; initialized = true; }
        const nextTopology = [p.model,model===1?p.fetMode:'normal',model===7?p.thrust:'off'].join('|');
        if (topology && topology !== nextTopology && (lastWet[0] !== 0 || lastWet[1] !== 0)) declickPending.fill(1);
        topology = nextTopology;
      }
      // A knee-controlled feedforward curve. Feedback families below use its
      // calibrated feedback equivalent, so requested 4:1 does not collapse to
      // the ~1.75:1 caused by applying (1-1/R) to an output detector directly.
      function curve(over, ratio, knee) {
        const strength = 1-1/ratio, half = knee*.5;
        if (knee > 0 && over > -half && over < half) return strength*(over+half)*(over+half)/(2*knee);
        return over >= half ? strength*over : 0;
      }
      function peakOrEnergy(value, channel) {
        const magnitude = Math.abs(value);
        if (model === 6 || model === 7 || model === 4) {
          detector[channel] += rmsCoefficient*(value*value-detector[channel]);
          return Math.sqrt(Math.max(0,detector[channel]));
        }
        detector[channel] += (magnitude > detector[channel] ? detectorAttack : detectorRelease)*(magnitude-detector[channel]); return detector[channel];
      }
      function dynamics(level, channel, threshold, ratio, knee) {
        const over = level-threshold;
        let requested = curve(over,ratio,knee), gr = reduction[channel];
        const memoryTarget = clamp(requested/24,0,1);
        exposure[channel] += (memoryTarget > exposure[channel] ? memoryAttack : memoryRelease)*(memoryTarget-exposure[channel]);
        if (ratio === 1) requested = 0;
        if (model === 1) {
          // Implicit one-pole solution of a calibrated feedback gain law. Its
          // equilibrium is the requested ratio; the denominator bounds even
          // sub-sample attack constants and high-ratio all-buttons operation.
          const all = p.fetMode === 'all-buttons';
          const effectiveRatio = all && ratio > 1 ? Math.max(12,ratio*1.35) : ratio;
          requested = curve(over,effectiveRatio,all ? Math.max(.5,knee*.35) : knee);
          const feedbackStrength = Math.max(0,effectiveRatio-1), desiredFeedback = requested*effectiveRatio-feedbackStrength*gr;
          let coefficient = desiredFeedback > gr ? attackStep : releaseStep/(1+exposure[channel]*(all ? 3.8 : .8));
          coefficient /= 1+coefficient*feedbackStrength;
          gr += coefficient*(desiredFeedback-gr);
          if (all) { slowCell[channel] += (requested > slowCell[channel] ? slowAttack : slowRelease)*(requested-slowCell[channel]); gr += .035*(slowCell[channel]-gr)*releaseStep; }
        } else if (model === 2 || model === 3) {
          // Photocell conductance has a fast path and a slow trapped-charge
          // reservoir. Equal final level after a long exposure recovers more
          // slowly than after a short note, even with identical release knobs.
          const weight = model === 2 ? .35 : .15;
          const coefficient = requested > gr ? attackStep*(1+(model===2?.2:.1)*exposure[channel]) : releaseStep;
          gr += Math.min(1,coefficient)*(requested-gr);
          const cellRelease = slowRelease/(1+exposure[channel]*(model===2?4:1.25));
          slowCell[channel] += (requested > slowCell[channel] ? slowAttack : cellRelease)*(requested-slowCell[channel]);
          reduction[channel] = clamp(gr,0,72);
          return clamp(gr*(1-weight)+slowCell[channel]*weight,0,72);
        } else if (model === 4) {
          // Variable-mu gain cells gradually increase their slope with level;
          // their control-voltage history makes sustained material recover
          // more slowly than isolated transients.
          const variableRatio = ratio === 1 ? 1 : 1+(ratio-1)*(.55+.45*clamp(Math.max(0,over)/18,0,1));
          requested = curve(over,variableRatio,Math.max(knee,5));
          const strength = Math.max(0,variableRatio-1), feedbackTarget = requested*variableRatio-strength*gr;
          let coefficient = feedbackTarget > gr ? attackStep : releaseStep/(1+exposure[channel]*9);
          coefficient /= 1+coefficient*strength; gr += coefficient*(feedbackTarget-gr);
        } else if (model === 5) {
          // Feedforward bus peak detector with a program-dependent second
          // release component; transients retain the selected attack timing.
          const coefficient = requested > gr ? attackStep : releaseStep/(1+exposure[channel]*2.5);
          gr += coefficient*(requested-gr);
        } else if (model === 6) {
          // RMS energy detector above plus gain-dependent OverEasy curvature.
          requested = curve(over,ratio,Math.min(18,knee+(ratio>1?2:0)));
          gr += (requested > gr ? attackStep : releaseStep)*(requested-gr);
        } else if (model === 7) {
          // RMS VCA bus law with a modest feedback contribution. Thrust only
          // changes detector frequency weighting, never the audible signal.
          const feedbackStrength = (ratio-1)*.22, feedbackTarget = requested*(1+feedbackStrength)-feedbackStrength*gr;
          let coefficient = feedbackTarget > gr ? attackStep : releaseStep/(1+exposure[channel]*1.2);
          coefficient /= 1+coefficient*feedbackStrength; gr += coefficient*(feedbackTarget-gr);
        } else {
          // Diode-bridge feedback softens near threshold; rectifier storage
          // adds a short hold and a separate recovery reservoir.
          requested = curve(over,ratio,Math.max(knee,3));
          if (requested > gr) hold[channel] = sr*.012;
          else if (hold[channel] > 0) hold[channel]--;
          const strength = Math.max(0,ratio-1)*.65, feedbackTarget = requested*(1+strength)-strength*gr;
          let coefficient = feedbackTarget > gr ? attackStep : hold[channel] > 0 ? 0 : releaseStep/(1+exposure[channel]*3);
          coefficient /= 1+coefficient*strength; gr += coefficient*(feedbackTarget-gr);
          slowCell[channel] += (requested > slowCell[channel] ? slowAttack : slowRelease)*(requested-slowCell[channel]);
          reduction[channel] = clamp(gr,0,72); return clamp(gr*.82+slowCell[channel]*.18,0,72);
        }
        reduction[channel] = clamp(gr,0,72); return reduction[channel];
      }
      function diode(value) {
        // Three bounded Newton steps for a resistor-loaded, polynomial diode
        // pair (a low-order approximation to its exponential I/V relation).
        const x = clamp(value,-12,12); let v = x/(1+.35*Math.abs(x));
        for(let n=0;n<3;n++){const square=v*v, fourth=square*square;v -= (v+.18*v*square+.008*v*fourth-x)/(1+.54*square+.04*fourth);v=clamp(v,-4,4);} return v;
      }
      function coloured(value, channel, amount, gr) {
        if (amount < 1e-8) {
          if (colourActive[channel]) { for(let n=0;n<4;n++)colourState[channel*4+n]=0;colourDCPrevious[channel]=colourDC[channel]=core[channel]=0;colourActive[channel]=0; }
          colourPrevious[channel] = value; return value;
        }
        colourActive[channel]=1;
        const previous = colourPrevious[channel], index = channel*4;
        let delta = 0;
        for(let sub=1;sub<=4;sub++){
          const x=previous+(value-previous)*sub*.25;
          let shaped=x;
          if(model===1){const gain=1.6+(p.fetMode==='all-buttons'?.9:0)+gr*.012;shaped=(saturate(x*gain+.045)-saturate(.045))/gain;}
          else if(model===2){const gain=1.7, bias=.11;shaped=(saturate(x*gain+bias)-saturate(bias))/gain;}
          else if(model===3)shaped=x/Math.sqrt(1+x*x*.65);
          else if(model===4){const gain=1.5,bias=.065+gr*.002;shaped=(saturate(x*gain+bias)-saturate(bias))/gain;}
          else if(model===5)shaped=saturate(x*1.15)/1.15;
          else if(model===6)shaped=x/(1+.09*Math.abs(x));
          else if(model===7){core[channel]+=coreCoefficient*(x-core[channel]);const memory=core[channel]*.3;shaped=(saturate((x+memory)*1.35)-saturate(memory*1.35))/1.35;}
          else shaped=diode(x*1.7)/1.7;
          delta=filter(shaped-x,colourFilters[0],colourState,index);delta=filter(delta,colourFilters[1],colourState,index+2);
        }
        colourPrevious[channel]=value;
        const dc=delta-colourDCPrevious[channel]+dcCoefficient*colourDC[channel];colourDCPrevious[channel]=delta;colourDC[channel]=dc;
        return bound(value+amount*dc);
      }
      function finish(value,channel){
        if(declickPending[channel]){declickPending[channel]=0;offset[channel]=lastWet[channel]-value;declickLeft[channel]=declickFrames;}
        if(declickLeft[channel]>0){value=bound(value+offset[channel]*declickLeft[channel]/declickFrames);declickLeft[channel]--;}
        lastWet[channel]=value;return value;
      }
      function cleanRun(left,right){
        const mix=p.mix,strength=1-1/p.ratio,halfKnee=p.knee*.5;
        let inEnergy=0,outEnergy=0,lastGRL=0,lastGRR=0;
        for(let i=0;i<left.length;i++){
          const dryL=bound(left[i]),dryR=bound(right[i]);
          cleanInput+=slew*(cleanInputTarget-cleanInput);cleanLink+=slew*(cleanLinkTarget-cleanLink);
          const drivenL=bound(dryL*cleanInput),drivenR=bound(dryR*cleanInput);
          hpL=drivenL-previousL+hp*hpL;hpR=drivenR-previousR+hp*hpR;previousL=drivenL;previousR=drivenR;
          const peak=Math.max(Math.abs(hpL),Math.abs(hpR));
          const coefficient=peak>envelope?attack:release;
          envelope=coefficient*envelope+(1-coefficient)*peak;
          const over=20*Math.log10(Math.max(envelope,1e-12))-p.threshold;
          let sharedReduction=0;
          if(p.knee>0&&over>-halfKnee&&over<halfKnee)sharedReduction=strength*(over+halfKnee)*(over+halfKnee)/(2*p.knee);
          else if(over>=halfKnee)sharedReduction=strength*over;
          let grL=sharedReduction,grR=sharedReduction;
          for(let channel=0;channel<2;channel++){
            const magnitude=Math.abs(channel?hpR:hpL),c=magnitude>cleanMono[channel]?attack:release;
            cleanMono[channel]=c*cleanMono[channel]+(1-c)*magnitude;
          }
          if(cleanLink!==1){grL=curve(levelDb(cleanMono[0])-p.threshold,p.ratio,p.knee);grR=curve(levelDb(cleanMono[1])-p.threshold,p.ratio,p.knee);grL+=(sharedReduction-grL)*cleanLink;grR+=(sharedReduction-grR)*cleanLink;}
          // Literal original gain arithmetic on the stock shared path.
          const gain=db(-sharedReduction)*makeup;
          let wetL=cleanLink===1?drivenL*gain:drivenL*db(-grL)*makeup,wetR=cleanLink===1?drivenR*gain:drivenR*db(-grR)*makeup;
          if(declickPending[0]||declickPending[1]||declickLeft[0]||declickLeft[1]){wetL=finish(wetL,0);wetR=finish(wetR,1);}else{lastWet[0]=wetL;lastWet[1]=wetR;}
          left[i]=mixSample(dryL,wetL,mix);right[i]=mixSample(dryR,wetR,mix);
          lastGRL=grL;lastGRR=grR;inEnergy+=dryL*dryL+dryR*dryR;outEnergy+=left[i]*left[i]+right[i]*right[i];
        }
        applied[0]=lastGRL;applied[1]=lastGRR;setMeters(left.length,inEnergy,outEnergy,levelDb(envelope));
      }
      function setMeters(frames,inEnergy,outEnergy,detectorLevel){
        meters.reductionLeftDb=applied[0];meters.reductionRightDb=applied[1];meters.reductionDb=Math.max(applied[0],applied[1]);
        meters.inputDb=10*Math.log10(Math.max(1e-12,inEnergy/Math.max(1,frames*2)));meters.outputDb=10*Math.log10(Math.max(1e-12,outEnergy/Math.max(1,frames*2)));meters.detectorDb=Math.max(-120,detectorLevel);
      }
      // The released full-band Clean path above stays literal. New band
      // controls smooth their curve and makeup as well, so a written or LFO
      // threshold change cannot step a steady waveform's gain in one sample.
      function cleanBandRun(left,right){
        let inEnergy=0,outEnergy=0,lastGRL=0,lastGRR=0;
        for(let i=0;i<left.length;i++){
          for(let key=0;key<smooth.length;key++){smooth[key]+=slew*(target[key]-smooth[key]);if(Math.abs(target[key]-smooth[key])<1e-10)smooth[key]=target[key];}
          if(smooth[4]!==cachedMakeupDb){cachedMakeupDb=smooth[4];cachedMakeupGain=db(smooth[4]);}
          const dryL=bound(left[i]),dryR=bound(right[i]),threshold=smooth[0],ratio=smooth[1],knee=smooth[2],makeupGain=cachedMakeupGain;
          cleanInput+=slew*(cleanInputTarget-cleanInput);cleanLink+=slew*(cleanLinkTarget-cleanLink);
          const drivenL=bound(dryL*cleanInput),drivenR=bound(dryR*cleanInput);
          hpL=drivenL-previousL+hp*hpL;hpR=drivenR-previousR+hp*hpR;previousL=drivenL;previousR=drivenR;
          const peak=Math.max(Math.abs(hpL),Math.abs(hpR)),coefficient=peak>envelope?attack:release;
          envelope=coefficient*envelope+(1-coefficient)*peak;
          const sharedReduction=curve(levelDb(envelope)-threshold,ratio,knee);
          let grL=sharedReduction,grR=sharedReduction;
          for(let channel=0;channel<2;channel++){const magnitude=Math.abs(channel?hpR:hpL),c=magnitude>cleanMono[channel]?attack:release;cleanMono[channel]=c*cleanMono[channel]+(1-c)*magnitude;}
          if(cleanLink!==1){grL=curve(levelDb(cleanMono[0])-threshold,ratio,knee);grR=curve(levelDb(cleanMono[1])-threshold,ratio,knee);grL+=(sharedReduction-grL)*cleanLink;grR+=(sharedReduction-grR)*cleanLink;}
          let wetL=drivenL*db(-grL)*makeupGain,wetR=drivenR*db(-grR)*makeupGain;
          if(declickPending[0]||declickPending[1]||declickLeft[0]||declickLeft[1]){wetL=finish(wetL,0);wetR=finish(wetR,1);}else{lastWet[0]=wetL;lastWet[1]=wetR;}
          left[i]=mixSample(dryL,wetL,p.mix);right[i]=mixSample(dryR,wetR,p.mix);
          lastGRL=grL;lastGRR=grR;inEnergy+=dryL*dryL+dryR*dryR;outEnergy+=left[i]*left[i]+right[i]*right[i];
        }
        applied[0]=lastGRL;applied[1]=lastGRR;setMeters(left.length,inEnergy,outEnergy,levelDb(envelope));
      }
      function analogRun(left,right){
        let inEnergy=0,outEnergy=0,detectorLevel=-120;
        for(let i=0;i<left.length;i++){
          for(let k=0;k<smooth.length;k++){smooth[k]+=slew*(target[k]-smooth[k]);if(Math.abs(target[k]-smooth[k])<1e-10)smooth[k]=target[k];}
          if(smooth[3]!==cachedInputDb){cachedInputDb=smooth[3];cachedInputGain=db(smooth[3]);}
          if(smooth[4]!==cachedMakeupDb){cachedMakeupDb=smooth[4];cachedMakeupGain=db(smooth[4]);}
          const dryL=bound(left[i]),dryR=bound(right[i]),inputGain=cachedInputGain,makeupGain=cachedMakeupGain,threshold=smooth[0],ratio=smooth[1],knee=smooth[2],mix=p.mix===0?0:smooth[5],colour=smooth[6],link=smooth[7];
          const drivenL=bound(dryL*inputGain),drivenR=bound(dryR*inputGain);
          for(let channel=0;channel<2;channel++){
            const x=channel?drivenR:drivenL;
            detectorHP[channel]=x-detectorPrevious[channel]+hp*detectorHP[channel];detectorPrevious[channel]=x;
            let detect=detectorHP[channel];
            if(model===7&&p.thrust!=='off'){
              thrustLow[channel]+=thrustLowCoefficient*(detect-thrustLow[channel]);thrustHigh[channel]+=thrustHighCoefficient*(detect-thrustHigh[channel]);
              detect=p.thrust==='loud'?detect*.6-thrustLow[channel]*.5+(detect-thrustHigh[channel])*1.1:detect*.85-thrustLow[channel]*.35+(detect-thrustHigh[channel])*.4;
            }
            const peak=peakOrEnergy(detect,channel),detected=levelDb(peak);detectorLevel=Math.max(detectorLevel,detected);
            applied[channel]=dynamics(detected,channel,threshold,ratio,knee);
          }
          const shared=Math.max(applied[0],applied[1]);applied[0]+=(shared-applied[0])*link;applied[1]+=(shared-applied[1])*link;
          let wetL=coloured(drivenL*db(-applied[0]),0,colour,applied[0])*makeupGain,wetR=coloured(drivenR*db(-applied[1]),1,colour,applied[1])*makeupGain;
          wetL=finish(wetL,0);wetR=finish(wetR,1);
          left[i]=mix===0?dryL:mixSample(dryL,wetL,mix);right[i]=mix===0?dryR:mixSample(dryR,wetR,mix);
          inEnergy+=dryL*dryL+dryR*dryR;outEnergy+=left[i]*left[i]+right[i]*right[i];
        }
        setMeters(left.length,inEnergy,outEnergy,detectorLevel);
      }
      update();
      return {
        setParams(next){if(!next||typeof next!=='object')return;let changed=false;for(const key of Object.keys(next)){if(key!=='bypass'&&!Object.prototype.hasOwnProperty.call(specifications,key))continue;const rule=bandDynamics&&key==='threshold'?[-60,0,-18]:specifications[key],value=key==='bypass'?next[key]===true:typeof rule[0]==='number'?clamp(finite(next[key],rule[2]),rule[0],rule[1]):rule.includes(next[key])?next[key]:rule[0];if(p[key]!==value){p[key]=value;changed=true;}}if(changed)update();},
        process(left,right){if(!left||!right||left.length!==right.length)throw new Error('BUTTER requires equal stereo blocks.');if(p.bypass){for(let i=0;i<left.length;i++){left[i]=bound(left[i]);right[i]=bound(right[i]);}meters.reductionDb=meters.reductionLeftDb=meters.reductionRightDb=0;return;}if(model===0){if(bandDynamics)cleanBandRun(left,right);else cleanRun(left,right);}else analogRun(left,right);},
        reset(){envelope=previousL=previousR=hpL=hpR=0;for(const state of [cleanMono,detector,detectorPrevious,detectorHP,thrustLow,thrustHigh,reduction,slowCell,exposure,hold,applied,colourPrevious,colourDCPrevious,colourDC,core,colourState,colourActive,lastWet,offset,declickLeft,declickPending])state.fill(0);smooth.set(target);cleanInput=cleanInputTarget;cleanLink=cleanLinkTarget;meters.reductionDb=meters.reductionLeftDb=meters.reductionRightDb=0;meters.inputDb=meters.outputDb=meters.detectorDb=-120;},
        getTailTime(){return model===0?0:.25;},
        _readMeters(){return meters;},
        getMeters(){return Object.assign({},meters);}
      };
    }
    function create(sampleRate, params) {
      const sr = clamp(finite(sampleRate,48000),8000,192000), bands = ['low','mid','high'];
      let p = normalize(params), mb = null;
      const pickFull = () => { const values={bypass:p.bypass}; for(const key of fullKeys)values[key]=p[key];return values; };
      const full = createFull(sr,pickFull()), fadeFrames=Math.max(1,Math.round(sr*.012)), slew=1-Math.exp(-1/(sr*.004));
      let modeMix=p.bandMode==='multiband'?1:0, modeTarget=modeMix, modeStep=0, modeRemaining=0;
      const sharedBandKeys=['model','input','knee','sidechain','colour','link','fetMode','thrust'];
      function bandParams(index) {
        const prefix=bands[index], values={mix:1,makeup:0,bypass:false,timing:'manual'};
        for(const key of sharedBandKeys)values[key]=p[key];
        for(const key of ['threshold','ratio','attack','release'])values[key]=p[prefix+key[0].toUpperCase()+key.slice(1)];
        return values;
      }
      function crossover(frequency) {
        const result={lp:new Float64Array(5),hp:new Float64Array(5),ap:new Float64Array(5),target:new Float64Array(15),step:new Float64Array(15),remaining:0,hz:0};
        tune(result,frequency,true);return result;
      }
      function tune(cross,frequency,immediate=false) {
        const hz=Math.min(frequency,sr*.4);if(hz===cross.hz&&!immediate)return;
        cross.hz=hz;
        const angle=TAU*hz/sr, cosine=Math.cos(angle),alpha=Math.sin(angle)/(2*Math.SQRT1_2),a0=1+alpha,a1=-2*cosine/a0,a2=(1-alpha)/a0;
        cross.target.set([(1-cosine)*.5/a0,(1-cosine)/a0,(1-cosine)*.5/a0,a1,a2,
          (1+cosine)*.5/a0,-(1+cosine)/a0,(1+cosine)*.5/a0,a1,a2,a2,a1,1,a1,a2]);
        const arrays=[cross.lp,cross.hp,cross.ap];
        if(immediate){for(let part=0;part<3;part++)arrays[part].set(cross.target.subarray(part*5,part*5+5));cross.remaining=0;}
        else {cross.remaining=Math.max(1,Math.round(sr*.016));for(let part=0;part<3;part++)for(let key=0;key<5;key++)cross.step[part*5+key]=(cross.target[part*5+key]-arrays[part][key])/cross.remaining;}
      }
      function advance(cross) {
        if(!cross.remaining)return;
        if(--cross.remaining===0){cross.lp.set(cross.target.subarray(0,5));cross.hp.set(cross.target.subarray(5,10));cross.ap.set(cross.target.subarray(10,15));}
        else for(let key=0;key<5;key++){cross.lp[key]+=cross.step[key];cross.hp[key]+=cross.step[key+5];cross.ap[key]+=cross.step[key+10];}
      }
      function ensureMultiband() {
        if(mb)return mb;
        mb={processors:bands.map((_,index)=>createFull(sr,bandParams(index),true)),cross:[crossover(p.crossoverLow),crossover(p.crossoverHigh)],
          state:new Float64Array(36),capacity:0,length:0,raw:null,wet:null,full:null,activity:0,activityTarget:0,activityStep:0,activityRemaining:0,mix:p.mix,input:db(p.input),makeup:db(p.makeup),inputTarget:db(p.input),makeupTarget:db(p.makeup),
          enabled:new Float64Array(3),solo:new Float64Array(3),gain:new Float64Array(3),enabledTarget:new Float64Array(3),soloTarget:new Float64Array(3),gainTarget:new Float64Array(3),inEnergy:new Float64Array(3),outEnergy:new Float64Array(3),sleeping:false,
          meters:{reductionDb:0,reductionLeftDb:0,reductionRightDb:0,inputDb:-120,outputDb:-120,detectorDb:-120},bandReadings:bands.map(()=>({reductionDb:0,reductionLeftDb:0,reductionRightDb:0,inputDb:-120,outputDb:-120,enabled:true,solo:false}))};
        resetMultiband();return mb;
      }
      function resetMultiband() {
        if(!mb)return;
        mb.state.fill(0);mb.inEnergy.fill(0);mb.outEnergy.fill(0);mb.mix=p.mix;mb.input=db(p.input);mb.makeup=db(p.makeup);
        tune(mb.cross[0],p.crossoverLow,true);tune(mb.cross[1],p.crossoverHigh,true);
        updateMultibandTargets();
        for(let index=0;index<3;index++){
          mb.processors[index].setParams(bandParams(index));mb.processors[index].reset();
          mb.enabled[index]=mb.enabledTarget[index];mb.solo[index]=mb.soloTarget[index];mb.gain[index]=mb.gainTarget[index];
          Object.assign(mb.bandReadings[index],{reductionDb:0,reductionLeftDb:0,reductionRightDb:0,inputDb:-120,outputDb:-120,enabled:p[bands[index]+'Enabled']==='on',solo:p[bands[index]+'Solo']==='on'});
        }
        mb.activity=mb.activityTarget=p.bypass||p.mix===0?0:1;mb.activityStep=mb.activityRemaining=0;mb.sleeping=mb.activity===0;
        Object.assign(mb.meters,{reductionDb:0,reductionLeftDb:0,reductionRightDb:0,inputDb:-120,outputDb:-120,detectorDb:-120});
      }
      function updateMultibandTargets() {
        if(!mb)return;
        const anySolo=bands.some(band=>p[band+'Solo']==='on');
        mb.inputTarget=db(p.input);mb.makeupTarget=db(p.makeup);
        for(let index=0;index<3;index++){mb.enabledTarget[index]=p[bands[index]+'Enabled']==='on'?1:0;mb.soloTarget[index]=!anySolo||p[bands[index]+'Solo']==='on'?1:0;mb.gainTarget[index]=db(p[bands[index]+'Gain']);}
      }
      function buffers(frames) {
        if(mb.capacity<frames){let capacity=Math.max(128,mb.capacity);while(capacity<frames)capacity*=2;mb.capacity=capacity;mb.rawData=Array.from({length:3},()=>[new Float32Array(capacity),new Float32Array(capacity)]);mb.wetData=Array.from({length:3},()=>[new Float32Array(capacity),new Float32Array(capacity)]);mb.fullData=[new Float32Array(capacity),new Float32Array(capacity)];mb.length=0;}
        if(mb.length!==frames){mb.length=frames;mb.raw=mb.rawData.map(pair=>pair.map(data=>data.subarray(0,frames)));mb.wet=mb.wetData.map(pair=>pair.map(data=>data.subarray(0,frames)));mb.full=mb.fullData.map(data=>data.subarray(0,frames));}
      }
      function prepareActivity() {
        const goal=p.bypass||p.mix===0?0:1;
        if(goal!==mb.activityTarget){mb.activityTarget=goal;mb.activityRemaining=fadeFrames;mb.activityStep=(goal-mb.activity)/fadeFrames;}
        if(goal&&mb.sleeping){resetMultiband();mb.activity=0;mb.activityTarget=1;mb.activityStep=1/fadeFrames;mb.activityRemaining=fadeFrames;mb.sleeping=false;}
      }
      function multibandRun(left,right) {
        ensureMultiband();prepareActivity();const n=left.length;
        if(!n)return;
        if(mb.activity===0&&mb.activityTarget===0){let energy=0;for(let frame=0;frame<n;frame++){left[frame]=bound(left[frame]);right[frame]=bound(right[frame]);energy+=left[frame]*left[frame]+right[frame]*right[frame];}const level=10*Math.log10(Math.max(1e-12,energy/(n*2)));Object.assign(mb.meters,{reductionDb:0,reductionLeftDb:0,reductionRightDb:0,inputDb:level,outputDb:level,detectorDb:-120});for(let band=0;band<3;band++)Object.assign(mb.bandReadings[band],{reductionDb:0,reductionLeftDb:0,reductionRightDb:0,inputDb:-120,outputDb:-120,enabled:p[bands[band]+'Enabled']==='on',solo:p[bands[band]+'Solo']==='on'});mb.sleeping=true;return;}
        buffers(n);mb.inEnergy.fill(0);mb.outEnergy.fill(0);
        let inputEnergy=0;
        for(let frame=0;frame<n;frame++){
          advance(mb.cross[0]);advance(mb.cross[1]);
          for(let channel=0;channel<2;channel++){
            const x=bound(channel?right[frame]:left[frame]),state=mb.state,at=channel*18,low=mb.cross[0],high=mb.cross[1];inputEnergy+=x*x;
            const lowBand=filter(filter(x,low.lp,state,at),low.lp,state,at+2),upper=filter(filter(x,low.hp,state,at+4),low.hp,state,at+6);
            const lo=filter(lowBand,high.ap,state,at+8),mid=filter(filter(upper,high.lp,state,at+10),high.lp,state,at+12),hi=filter(filter(upper,high.hp,state,at+14),high.hp,state,at+16);
            mb.raw[0][channel][frame]=mb.wet[0][channel][frame]=lo;mb.raw[1][channel][frame]=mb.wet[1][channel][frame]=mid;mb.raw[2][channel][frame]=mb.wet[2][channel][frame]=hi;
            mb.inEnergy[0]+=lo*lo;mb.inEnergy[1]+=mid*mid;mb.inEnergy[2]+=hi*hi;
          }
        }
        for(let index=0;index<3;index++)if(mb.enabledTarget[index]||mb.enabled[index]>1e-10)mb.processors[index].process(mb.wet[index][0],mb.wet[index][1]);
        const anySolo=bands.some(band=>p[band+'Solo']==='on');let outputEnergy=0;
        for(let frame=0;frame<n;frame++){
          mb.mix+=slew*(p.mix-mb.mix);mb.input+=slew*(mb.inputTarget-mb.input);mb.makeup+=slew*(mb.makeupTarget-mb.makeup);
          for(let band=0;band<3;band++){
            const enabled=mb.enabledTarget[band],solo=mb.soloTarget[band];
            mb.enabled[band]+=slew*(enabled-mb.enabled[band]);mb.solo[band]+=slew*(solo-mb.solo[band]);mb.gain[band]+=slew*(mb.gainTarget[band]-mb.gain[band]);
            if(Math.abs(enabled-mb.enabled[band])<1e-10)mb.enabled[band]=enabled;if(Math.abs(solo-mb.solo[band])<1e-10)mb.solo[band]=solo;
          }
          const directL=bound(left[frame]),directR=bound(right[frame]);
          for(let channel=0;channel<2;channel++){
            let reference=0,processed=0;
            for(let band=0;band<3;band++){
              const raw=mb.raw[band][channel][frame],linear=raw*mb.input,wet=(linear+(mb.wet[band][channel][frame]-linear)*mb.enabled[band])*mb.gain[band]*mb.solo[band];
              reference+=raw*mb.solo[band];processed+=wet;mb.outEnergy[band]+=wet*wet;
            }
            const direct=channel?directR:directL,aligned=reference+(bound(processed*mb.makeup)-reference)*mb.mix,value=bound(direct+(aligned-direct)*mb.activity);
            if(channel)right[frame]=value;else left[frame]=value;outputEnergy+=value*value;
          }
          if(mb.activityRemaining&&--mb.activityRemaining===0)mb.activity=mb.activityTarget;else if(mb.activityRemaining)mb.activity+=mb.activityStep;
        }
        let reductionLeft=0,reductionRight=0,detectorLevel=-120;
        for(let band=0;band<3;band++){
          const reading=mb.processors[band]._readMeters(),enabled=p[bands[band]+'Enabled']==='on',selected=!anySolo||p[bands[band]+'Solo']==='on';
          Object.assign(mb.bandReadings[band],{reductionDb:enabled?reading.reductionDb:0,reductionLeftDb:enabled?reading.reductionLeftDb:0,reductionRightDb:enabled?reading.reductionRightDb:0,inputDb:10*Math.log10(Math.max(1e-12,mb.inEnergy[band]/(n*2))),outputDb:10*Math.log10(Math.max(1e-12,mb.outEnergy[band]/(n*2))),enabled,solo:p[bands[band]+'Solo']==='on'});
          if(enabled&&selected){reductionLeft=Math.max(reductionLeft,reading.reductionLeftDb);reductionRight=Math.max(reductionRight,reading.reductionRightDb);detectorLevel=Math.max(detectorLevel,reading.detectorDb);}
        }
        Object.assign(mb.meters,{reductionDb:Math.max(reductionLeft,reductionRight),reductionLeftDb:reductionLeft,reductionRightDb:reductionRight,inputDb:10*Math.log10(Math.max(1e-12,inputEnergy/(n*2))),outputDb:10*Math.log10(Math.max(1e-12,outputEnergy/(n*2))),detectorDb:detectorLevel});
      }
      if(p.bandMode==='multiband')ensureMultiband();
      return {
        setParams(next){
          if(!next||typeof next!=='object')return;
          const beforeMode=p.bandMode,fullNext={},reactivated=[];let changed=false,baseChanged=false;
          for(const key of Object.keys(next)){
            if(key!=='bypass'&&!Object.prototype.hasOwnProperty.call(specifications,key))continue;
            const rule=specifications[key],value=key==='bypass'?next[key]===true:typeof rule[0]==='number'?clamp(finite(next[key],rule[2]),rule[0],rule[1]):rule.includes(next[key])?next[key]:rule[0];
            if(p[key]===value)continue;if(mb&&key.endsWith('Enabled')&&value==='on'){const index=bands.indexOf(key.slice(0,-7));if(index>=0&&mb.enabled[index]===0)reactivated.push(index);}p[key]=value;changed=true;
            if(key==='bypass'||fullKeys.includes(key)){fullNext[key]=value;baseChanged=true;}
          }
          if(!changed)return;if(baseChanged)full.setParams(fullNext);
          if(mb){tune(mb.cross[0],p.crossoverLow);tune(mb.cross[1],p.crossoverHigh);for(let band=0;band<3;band++)mb.processors[band].setParams(bandParams(band));for(const index of reactivated)mb.processors[index].reset();updateMultibandTargets();}
          if(beforeMode!==p.bandMode){
            modeTarget=p.bandMode==='multiband'?1:0;
            if(modeTarget){ensureMultiband();resetMultiband();}
            else if(modeMix>0)full.reset();
            modeRemaining=modeTarget===modeMix?0:fadeFrames;modeStep=modeRemaining?(modeTarget-modeMix)/modeRemaining:0;
          }
        },
        process(left,right){
          if(!left||!right||left.length!==right.length)throw new Error('BUTTER requires equal stereo blocks.');
          if(modeMix===0&&modeTarget===0&&!modeRemaining){full.process(left,right);return;}
          if(modeMix===1&&modeTarget===1&&!modeRemaining){multibandRun(left,right);return;}
          ensureMultiband();buffers(left.length);mb.full[0].set(left);mb.full[1].set(right);full.process(mb.full[0],mb.full[1]);multibandRun(left,right);
          for(let frame=0;frame<left.length;frame++){
            left[frame]=bound(mb.full[0][frame]+(left[frame]-mb.full[0][frame])*modeMix);right[frame]=bound(mb.full[1][frame]+(right[frame]-mb.full[1][frame])*modeMix);
            if(modeRemaining&&--modeRemaining===0)modeMix=modeTarget;else if(modeRemaining)modeMix+=modeStep;
          }
        },
        reset(){full.reset();if(mb)resetMultiband();modeMix=modeTarget=p.bandMode==='multiband'?1:0;modeRemaining=0;modeStep=0;},
        getTailTime(){return modeMix||modeTarget?Math.max(.5,full.getTailTime()):full.getTailTime();},
        getMeters(){if(p.bandMode!=='multiband')return full.getMeters();ensureMultiband();return {...mb.meters,bandMode:'multiband',crossoverLowHz:mb.cross[0].hz,crossoverHighHz:mb.cross[1].hz,bands:Object.fromEntries(bands.map((band,index)=>[band,{...mb.bandReadings[index]}]))};}
      };
    }
    return {specifications,normalize,create};
  }
  scope.createLoomCompressorDSP=createLoomCompressorDSP;
})(typeof window==='undefined'?globalThis:window);
