/* BUTTER · three courses, one familiar face. State stays with the parent editor. */
(function (scope) {
  'use strict';
  const bands=['low','mid','high'],names=['Low','Mid','High'];
  const keys=['bandMode','crossoverLow','crossoverHigh',...bands.flatMap(band=>['Threshold','Ratio','Attack','Release','Gain','Enabled','Solo'].map(key=>band+key))];
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=(element,value)=>{if(element&&element.textContent!==String(value))element.textContent=String(value);};
  const frequency=value=>value>=1000?(value/1000).toFixed(value%1000?1:0)+' kHz':Math.round(value)+' Hz';
  function control(param,params,label) {
    const value=params[param.key]??param.default;
    if(param.type==='select')return `<div class="control compressor-control"><label for="fx-${param.key}">${escape(label||param.label)}</label><select id="fx-${param.key}" data-effect-param="${param.key}">${param.options.map(option=>`<option value="${escape(option.value)}" ${option.value===value?'selected':''}>${escape(option.label)}</option>`).join('')}</select></div>`;
    const logarithmic=param.key.startsWith('crossover')||/(Attack|Release)$/.test(param.key),position=logarithmic?Math.log(value/param.min)/Math.log(param.max/param.min):value;
    return `<div class="control compressor-control"><label for="fx-${param.key}"><span>${escape(label||param.label)}</span><output>${escape(value)}${param.unit?' '+escape(param.unit):''}</output></label><div class="compressor-value-row"><input id="fx-${param.key}" data-effect-param="${param.key}" ${logarithmic?'data-log="true"':''} type="range" min="${logarithmic?0:param.min}" max="${logarithmic?1:param.max}" step="${logarithmic?.001:param.step}" value="${position}"><input id="fx-number-${param.key}" data-compressor-number="${param.key}" type="number" min="${param.min}" max="${param.max}" step="${param.step}" value="${value}" aria-label="${escape(param.label)} exact value${param.unit?' in '+escape(param.unit):''}"></div></div>`;
  }
  function render(def,params) {
    const descriptors=new Map(def.params.map(param=>[param.key,param])), field=(key,label)=>control(descriptors.get(key),params,label);
    return `<section class="butter-multiband" data-butter-multiband><div class="butter-band-mode">${field('bandMode')}<p>Keep the original full-band circuit, or divide the job into three independently controlled bands.</p></div><div class="butter-multiband-body" data-butter-multiband-body ${params.bandMode==='multiband'?'':'hidden'}><div class="butter-crossovers">${field('crossoverLow','Low / mid split')}${field('crossoverHigh','Mid / high split')}</div><div class="butter-bands">${bands.map((band,index)=>`<section class="butter-band" data-butter-band="${band}"><div class="butter-band-heading"><div><h3>${names[index]}</h3><span data-butter-band-range="${band}"></span></div><div class="butter-band-reduction"><span>GAIN REDUCTION</span><output data-butter-band-meter="${band}">—</output><div aria-hidden="true"><i data-butter-band-bar="${band}"></i></div></div></div><div class="butter-band-switches">${field(band+'Enabled','Compression')}${field(band+'Solo','Monitor')}</div><div class="butter-band-controls">${[['Threshold','Threshold'],['Ratio','Ratio'],['Attack','Attack'],['Release','Release'],['Gain','Band trim']].map(([suffix,label])=>field(band+suffix,label)).join('')}</div><div class="butter-band-levels"><span>IN <output data-butter-band-input="${band}">—</output></span><span>OUT <output data-butter-band-output="${band}">—</output></span></div></section>`).join('')}</div><p class="butter-band-help">Model, Input, Makeup, knee and detector character are shared. Each band uses its own manual dynamics settings. Band trim stays active when its compression is off.</p><details class="butter-band-notes"><summary>Crossovers &amp; parallel blend</summary><p>Two 24 dB/octave Linkwitz–Riley splits share phase compensation with the parallel reference, so Blend does not create crossover gaps. Global Makeup is applied once after the three bands. Solo monitors both the compressed and reference paths; selecting several solos combines them. Bypass and zero Blend return to the original dry signal after a short transition.</p></details></div></section>`;
  }
  function update(element,params,reading) {
    const enabled=params.bandMode==='multiband',body=element.querySelector('[data-butter-multiband-body]');if(!body)return;body.hidden=!enabled;
    const mode=element.querySelector('#fx-bandMode');if(mode&&document.activeElement!==mode)mode.value=params.bandMode||'full';
    const classic=element.querySelector('#compressorClassicSettings');if(classic)classic.disabled=enabled;
    const reductionLabel=element.querySelector('.compressor-gr>span');text(reductionLabel,enabled?'Max band reduction':'Gain reduction');
    if(!enabled)return;
    for(const key of ['threshold','ratio','attack','release','timing']){
      const input=element.querySelector('#fx-'+key),exact=element.querySelector('#fx-number-'+key);if(input)input.disabled=true;if(exact)exact.disabled=true;input?.closest('.control')?.classList.add('compressor-control-inactive');
    }
    text(element.querySelector('#compressorTimingHint'),'Three-band mode: use the independent threshold, ratio, attack and release below. Band timing is manual; the selected family keeps its detector and program memory. Model, input trim and makeup are shared.');
    const low=reading?.crossoverLowHz??params.crossoverLow,high=reading?.crossoverHighHz??params.crossoverHigh;
    for(const [index,band]of bands.entries()){
      const data=reading?.bands?.[band],valid=!!data&&!params.bypass;
      text(element.querySelector(`[data-butter-band-range="${band}"]`),index===0?'Below '+frequency(low):index===1?frequency(low)+' – '+frequency(high):'Above '+frequency(high));
      text(element.querySelector(`[data-butter-band-meter="${band}"]`),valid&&Number.isFinite(data.reductionDb)?Math.max(0,data.reductionDb).toFixed(1)+' dB':'—');
      const bar=element.querySelector(`[data-butter-band-bar="${band}"]`);if(bar)bar.style.width=(valid&&Number.isFinite(data.reductionDb)?Math.min(100,Math.max(0,data.reductionDb)/24*100):0)+'%';
      for(const [suffix,key]of [['input','inputDb'],['output','outputDb']])text(element.querySelector(`[data-butter-band-${suffix}="${band}"]`),valid&&Number.isFinite(data[key])?(data[key]<=-90?'−∞':data[key].toFixed(1))+' dB':'—');
      const card=element.querySelector(`[data-butter-band="${band}"]`);if(card){card.classList.toggle('butter-band-compression-off',params[band+'Enabled']==='off');card.classList.toggle('butter-band-soloed',params[band+'Solo']==='on');}
    }
  }
  scope.LoomButterMultibandUI=Object.freeze({keys,render,update});
})(typeof window==='undefined'?globalThis:window);
