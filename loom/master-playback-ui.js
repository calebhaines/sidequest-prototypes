/* GALLEY · master speed and pitch. Preparation is owned by the transport. */
(function (scope) {
  'use strict';
  const controls = [
    {key:'speed',label:'Speed',min:.25,max:2,step:.001,scale:100,unit:'%',value:1},
    {key:'pitch',label:'Pitch',min:-24,max:24,step:.01,scale:1,unit:'st',value:0}
  ];
  const byKey = new Map(controls.map(control => [control.key,control]));
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const fixed = value => Number(value.toFixed(3));
  function create(options) {
    const {element,getState,getStatus=()=>({phase:'idle'}),onChange=()=>{},onCancel=()=>{},onStatus=()=>{},getGeneration=()=>0}=options;
    if (!element) throw Error('Master playback needs a panel.');
    let disposed=false,pointer=null,keyboard=null,generation=getGeneration();
    const $=id=>element.querySelector('#'+id);
    const algorithms=scope.LoomMasterTransform?.ALGORITHMS||[{id:'signalsmith',name:'Original · Signalsmith',description:'Balanced stretching for complete mixes.'}];
    const settings=()=>getState().master?.playback||{speed:1,pitch:0,preservePitch:true,algorithm:'signalsmith'};
    const setText=(node,value)=>{const text=String(value);if(node.textContent!==text)node.textContent=text;};
    const signed=value=>(value>0?'+':'')+Number(value.toFixed(2))+' st';
    element.innerHTML='<section class="master-playback" aria-labelledby="masterPlaybackTitle"><div class="mp-heading"><div><span class="eyebrow">MASTER / ANOTHER PACE</span><h3 id="masterPlaybackTitle">Speed &amp; pitch</h3></div><button type="button" id="masterPlaybackReset">Reset</button></div><div class="mp-body"><div class="mp-knobs">'+controls.map(d=>'<div class="mp-control"><label id="mp-label-'+d.key+'">'+d.label+'</label><button type="button" class="mp-knob" role="slider" data-mp-knob="'+d.key+'" aria-labelledby="mp-label-'+d.key+'" aria-valuemin="'+d.min+'" aria-valuemax="'+d.max+'" aria-valuenow="'+d.value+'"><svg viewBox="0 0 84 84" aria-hidden="true"><path class="mp-ring" d="M17 65a32 32 0 1 1 50 0"/><circle class="mp-shadow" cx="42" cy="45" r="26"/><circle class="mp-cap" cx="42" cy="42" r="26"/><circle class="mp-inner" cx="42" cy="42" r="21"/><path class="mp-pointer" d="M42 42V23"/></svg></button><div class="mp-exact"><input type="number" data-mp-number="'+d.key+'" aria-label="'+d.label+' exact value" min="'+d.min*d.scale+'" max="'+d.max*d.scale+'" step="'+d.step*d.scale+'"><span>'+d.unit+'</span></div></div>').join('')+'</div><div class="mp-options"><label class="mp-preserve"><input type="checkbox" id="masterPlaybackPreserve"> Preserve pitch when changing speed</label><div class="mp-algorithm"><label for="masterPlaybackAlgorithm">Stretch algorithm</label><select id="masterPlaybackAlgorithm" aria-describedby="masterPlaybackAlgorithmHelp"></select><p id="masterPlaybackAlgorithmHelp"></p></div><p id="masterPlaybackMode"></p><div class="mp-readings"><div><span>Effective tempo</span><output id="masterPlaybackBpm">—</output></div><div><span>Net pitch change</span><output id="masterPlaybackNetPitch">—</output></div></div><div class="mp-status" role="status" aria-live="polite"><span id="masterPlaybackPhase">Original playback</span><p id="masterPlaybackMessage"></p></div><div class="mp-preparation" id="masterPlaybackPreparation" hidden><progress id="masterPlaybackProgress" max="1" aria-label="Preparing master playback"></progress><button type="button" id="masterPlaybackCancel">Cancel preparation</button></div></div></div><p class="mp-note">Altered playback prepares a stereo master. Preview follows the arrangement loop when enabled. Edits pause or refresh it; reset before recording, live input or SERVICE. Stereo mix exports include these settings. Individual stems keep their original speed and pitch.</p></section>';
    for(const algorithm of algorithms){const option=document.createElement('option');option.value=algorithm.id;option.textContent=algorithm.name;$('masterPlaybackAlgorithm').append(option);}
    function valid(active){return active&&active.generation===getGeneration();}
    function end(active){if(valid(active)&&active.remembered)onChange({},{key:active.key,first:false,phase:'end'});}
    function cancelGesture(){if(pointer){pointer.element.classList.remove('is-adjusting');if(pointer.element.hasPointerCapture?.(pointer.id))pointer.element.releasePointerCapture(pointer.id);}pointer=keyboard=null;}
    function emit(patch,meta){if(disposed)return;try{onChange(patch,meta);}catch(error){onStatus(error.message);}render();}
    function change(key,value,active){
      const d=byKey.get(key);if(!d||!Number.isFinite(value))return;
      const next=fixed(Math.round(clamp(value,d.min,d.max)/d.step)*d.step);
      if(Math.abs(next-settings()[key])<d.step*.001)return;
      const first=!active?.remembered;if(active)active.remembered=true;
      emit({[key]:next},{key,first,phase:active?'input':'single'});
    }
    function render(){
      if(disposed)return;const force=generation!==getGeneration();if(force){cancelGesture();generation=getGeneration();}
      const p=settings(),speed=clamp(Number(p.speed)||1,.25,2),pitch=clamp(Number(p.pitch)||0,-24,24);
      for(const d of controls){const value=d.key==='speed'?speed:pitch,knob=element.querySelector('[data-mp-knob="'+d.key+'"]'),number=element.querySelector('[data-mp-number="'+d.key+'"]');
        knob.setAttribute('aria-valuenow',value);knob.setAttribute('aria-valuetext',d.key==='speed'?fixed(value*100)+' percent':signed(value));
        knob.querySelector('.mp-pointer').style.transform='rotate('+(-135+(value-d.min)/(d.max-d.min)*270)+'deg)';
        if(force||document.activeElement!==number)number.value=fixed(value*d.scale);
      }
      $('masterPlaybackPreserve').checked=p.preservePitch!==false;
      const algorithm=algorithms.find(value=>value.id===(p.algorithm||'signalsmith'))||algorithms[0],selector=$('masterPlaybackAlgorithm');
      if(selector.value!==algorithm.id)selector.value=algorithm.id;
      setText($('masterPlaybackAlgorithmHelp'),p.preservePitch===false&&pitch===0&&speed!==1&&algorithm.id!=='signalsmith'?'This mode uses tape-speed playback here. Turn on Preserve pitch or adjust Pitch to hear its stretching.':algorithm.description);
      setText($('masterPlaybackMode'),p.preservePitch!==false?'Speed changes duration while Pitch sets the transposition.':'Tape behavior: speed also changes pitch; the Pitch knob adds its own shift.');
      setText($('masterPlaybackBpm'),fixed((Number(getState().tempo)||120)*speed)+' BPM');
      setText($('masterPlaybackNetPitch'),signed(pitch+(p.preservePitch===false?12*Math.log2(speed):0)));
      $('masterPlaybackReset').disabled=speed===1&&pitch===0&&p.preservePitch!==false&&algorithm.id==='signalsmith';
      paint();
    }
    function paint(status=getStatus()){
      if(disposed)return;const phase=status?.phase||'idle',preparing=phase==='rendering'||phase==='stretching',p=settings(),altered=p.speed!==1||p.pitch!==0;
      const labels={idle:altered?'Ready to prepare':'Original playback',rendering:'Rendering the master',stretching:'Preparing speed & pitch',ready:'Prepared master ready',playing:altered?'Playing the prepared master':'Playing the original master',stale:'Master needs refreshing',error:'Playback preparation stopped'};
      setText($('masterPlaybackPhase'),labels[phase]||'Master playback');
      setText($('masterPlaybackMessage'),status?.message||(preparing?'Preparing locally. You can cancel this pass.':phase==='stale'?'Press Play to prepare the updated arrangement.':phase==='idle'&&altered?'Press Play to prepare this setting.':''));
      $('masterPlaybackPreparation').hidden=!preparing;$('masterPlaybackCancel').disabled=!preparing;
      const progress=$('masterPlaybackProgress');if(Number.isFinite(status?.progress))progress.value=clamp(status.progress,0,1);else progress.removeAttribute('value');
      element.classList.toggle('mp-is-preparing',preparing);element.classList.toggle('mp-has-error',phase==='error');
    }
    function pointerDown(event){
      const knob=event.target.closest('[data-mp-knob]');if(!knob||event.button!==0&&event.pointerType==='mouse')return;event.preventDefault();if(pointer)return;end(keyboard);keyboard=null;
      pointer={key:knob.dataset.mpKnob,id:event.pointerId,y:event.clientY,value:settings()[knob.dataset.mpKnob],element:knob,remembered:false,generation:getGeneration()};knob.focus({preventScroll:true});knob.setPointerCapture?.(event.pointerId);knob.classList.add('is-adjusting');
    }
    function pointerMove(event){if(!pointer||event.pointerId!==pointer.id)return;if(!valid(pointer)){cancelGesture();return;}const d=byKey.get(pointer.key);change(d.key,pointer.value+(pointer.y-event.clientY)*(d.max-d.min)/(event.shiftKey?1600:220),pointer);}
    function pointerEnd(event){if(!pointer||event.pointerId!==pointer.id)return;const active=pointer;pointer=null;active.element.classList.remove('is-adjusting');if(active.element.hasPointerCapture?.(active.id))active.element.releasePointerCapture(active.id);end(active);}
    function keyDown(event){
      const knob=event.target.closest('[data-mp-knob]');if(!knob||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End'].includes(event.key))return;event.preventDefault();
      const key=knob.dataset.mpKnob,d=byKey.get(key);if(!valid(keyboard)||keyboard.key!==key){end(keyboard);keyboard={key,remembered:false,generation:getGeneration()};}
      const step=d.step*(event.shiftKey?10:1)*(event.key.startsWith('Page')?10:1);
      change(key,event.key==='Home'?d.min:event.key==='End'?d.max:settings()[key]+(['ArrowUp','ArrowRight','PageUp'].includes(event.key)?step:-step),keyboard);
    }
    const handlers={
      pointerdown:event=>{pointerDown(event);event.stopPropagation();},pointermove:pointerMove,pointerup:pointerEnd,pointercancel:pointerEnd,
      keydown:event=>{keyDown(event);event.stopPropagation();},keyup:event=>{end(keyboard);keyboard=null;event.stopPropagation();},
      focusout:()=>{end(keyboard);keyboard=null;render();},
      change:event=>{const number=event.target.closest('[data-mp-number]');if(number){const d=byKey.get(number.dataset.mpNumber);if(number.value!=='')change(d.key,Number(number.value)/d.scale);number.value=fixed(settings()[d.key]*d.scale);}if(event.target.id==='masterPlaybackPreserve')emit({preservePitch:event.target.checked},{key:'preservePitch',first:true,phase:'single'});if(event.target.id==='masterPlaybackAlgorithm'&&algorithms.some(algorithm=>algorithm.id===event.target.value)&&event.target.value!==(settings().algorithm||'signalsmith'))emit({algorithm:event.target.value},{key:'algorithm',first:true,phase:'single'});event.stopPropagation();},
      click:event=>{if(event.target.closest('#masterPlaybackReset'))emit({speed:1,pitch:0,preservePitch:true,algorithm:'signalsmith'},{key:null,first:true,phase:'single'});if(event.target.closest('#masterPlaybackCancel')){try{onCancel();}catch(error){onStatus(error.message);}paint();}event.stopPropagation();}
    };
    for(const [event,handler]of Object.entries(handlers))element.addEventListener(event,handler);render();
    return{render,paint,dispose(){if(disposed)return;disposed=true;cancelGesture();for(const[event,handler]of Object.entries(handlers))element.removeEventListener(event,handler);element.innerHTML='';}};
  }
  scope.LoomMasterPlaybackUI=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
