/* The same completed-breath research values are shown on both feed pages. */
(() => {
  'use strict';
  const fields = {
    itime:['ventmap','iTime',2], etime:['ventmap','eTime',2], rate:['ventmap','inst_RR',1],
    vti:['ventmap','tvi',1], vte:['ventmap','tve',1], pip:['ventmap','PIP',1],
    peep:['ventmap','PEEP',1], maw:['ventmap','Maw',1], tau:['mechanics','tau_s',3],
    plateau:['mechanics','plateau_cmH2O',1], compliance:['mechanics','compliance_L_per_cmH2O',4],
    resistance:['mechanics','resistance_cmH2O_s_per_L',2]
  };
  const tile = (label,id,unit) => `<div><span>${label}</span><strong id="r-${id}">—</strong><small>${unit}</small></div>`;
  function createPanel() {
    const panel=document.createElement('section');
    panel.id='research-panel';panel.className='panel research-panel';
    panel.setAttribute('aria-live','polite');
    panel.innerHTML=`
      <p id="research-status" class="research-status">Awaiting a completed breath.</p>
      <div class="research-group"><h4>ventMAP · breath metadata</h4><div class="research-grid">
        ${tile('Inspiration','itime','s')}${tile('Expiration','etime','s')}
        ${tile('Rate','rate','breaths/min')}${tile('VTi','vti','mL')}
        ${tile('VTe','vte','mL')}${tile('PIP','pip','cmH₂O')}
        ${tile('PEEP','peep','cmH₂O')}${tile('Mean airway pressure','maw','cmH₂O')}
      </div></div>
      <div class="research-group"><h4>ventparliament · Al-Rawas calculation</h4><div class="research-grid">
        ${tile('Time constant','tau','s')}${tile('Plateau estimate','plateau','cmH₂O')}
        ${tile('Compliance','compliance','L/cmH₂O')}${tile('Resistance','resistance','cmH₂O·s/L')}
      </div><p id="research-mechanics-note" class="research-foot">Waiting for a completed breath.</p></div>
      <div class="research-group"><h4>ucdpv_pva_ml · heuristic flags</h4>
        <p id="research-flags" class="research-flags">Waiting for a completed breath.</p>
        <p class="research-foot">An unfired rule is not a clinical negative finding.</p></div>`;
    return panel;
  }
  function render(panel,result) {
    const find=id=>panel.querySelector(`#${id}`);
    const valid=result?.status==='ok';
    panel.classList.toggle('research-ready',valid);
    find('research-status').textContent=valid
      ? `Breath ${result.breath} · ${result.marker} · ${result.sample_count} samples · browser research port`
      : result?.reason||'Research analysis unavailable for this breath.';
    for(const [id,[section,key,digits]] of Object.entries(fields)) {
      const value=valid?result[section]?.[key]:null;
      find('r-'+id).textContent=Number.isFinite(value)?value.toFixed(digits):'—';
    }
    find('research-mechanics-note').textContent=valid&&result.mechanics?.status==='ok'
      ? 'JavaScript Al-Rawas port; no mode gate or clinical validation in this prototype.'
      : (result?.mechanics?.reason||'Mechanics unavailable for this breath.');
    const flags=valid&&result.heuristics?.status==='ok'?result.heuristics.flags:null;
    const fired=flags?.filter(flag=>flag.value>0)||[];
    find('research-flags').textContent=flags
      ? fired.length?fired.map(flag=>`${flag.group} (${flag.code})`).join(' · '):'No heuristic rule fired for this breath.'
      : (result?.heuristics?.reason||'Heuristic flags unavailable for this breath.');
  }
  const sourceCards = [
    {title:'ZeBeZo · volume & flow', tab:'Volume', fields:[['VTi','vti','mL'],['VTe','vte','mL'],['Peak flow in','pifr','L/min'],['Peak flow out','pefr','L/min']]},
    {title:'ZeBeZo · airway pressure', tab:'Pressure', fields:[['Peak pressure','peak','cmH₂O'],['PEEP estimate','peep','cmH₂O'],['Mean airway pressure','map','cmH₂O']]},
    {title:'ZeBeZo · source breath', tab:'Breath', fields:[['Breath sequence','number',''],['BS marker','marker',''],['Approx. start','start',''],['Approx. duration','duration','s']]}
  ];
  const sourceIds=['vti','vte','pifr','pefr','peak','peep','map','number','marker','start','duration'];
  function installSourceView(panel) {
    [...panel.querySelectorAll(':scope > .research-group')].forEach((group,index)=>{
      const heading=group.querySelector('h4');
      heading.dataset.researchTitle=heading.textContent;
      const research=document.createElement('div');research.className='hahnicity-card-content';
      while(heading.nextSibling)research.append(heading.nextSibling);
      group.append(research);
      const source=document.createElement('div');source.className='zebezo-card-content research-grid';
      sourceCards[index].fields.forEach(([label,id,unit])=>{
        const cell=document.createElement('div');
        const name=document.createElement('span');name.textContent=label;
        const value=document.createElement('strong');value.id='z-'+id;value.textContent='—';
        const suffix=document.createElement('small');suffix.textContent=unit;
        cell.append(name,value,suffix);source.append(cell);
      });
      group.append(source);
    });
    setPerspective(panel,'zebezo');
  }
  function setPerspective(panel,value) {
    const source=value==='zebezo';
    panel.classList.toggle('source-perspective',source);
    [...panel.querySelectorAll(':scope > .research-group')].forEach((group,index)=>{
      const heading=group.querySelector('h4');
      const title=source?sourceCards[index].title:heading.dataset.researchTitle;
      heading.firstChild.textContent=title;
      const close=heading.querySelector('.overlay-close');
      if(close)close.setAttribute('aria-label',`Hide ${title} card`);
      const tab=panel.querySelector(`[data-mobile-overlay="${group.dataset.overlayCard}"]`);
      if(tab)tab.textContent=source?sourceCards[index].tab:['ventMAP','Mechanics','Flags'][index];
    });
  }
  function renderSource(panel,source) {
    const values={};
    ['vti','vte','pifr','pefr','peak','peep','map'].forEach((id,index)=>{
      const value=source?.metrics?.[index];
      values[id]=Number.isFinite(value)?value.toFixed(1):'—';
    });
    values.number=source?.label|| (Number.isInteger(source?.number)?'#'+String(source.number).padStart(4,'0'):'—');
    values.marker=source?.marker||'—';
    const seconds=source?.startSeconds;
    values.start=Number.isFinite(seconds)
      ? [Math.floor(seconds/3600),Math.floor(seconds%3600/60),Math.floor(seconds%60)].map(n=>String(n).padStart(2,'0')).join(':'):'—';
    values.duration=Number.isFinite(source?.durationSeconds)?source.durationSeconds.toFixed(2):'—';
    sourceIds.forEach(id=>{panel.querySelector('#z-'+id).textContent=values[id];});
  }
  window.BreathAnalysis={createPanel,render,installSourceView,setPerspective,renderSource};
})();
