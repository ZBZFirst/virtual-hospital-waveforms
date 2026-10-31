/* Selected-room computations share one chart, with positions per feed view. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ids=['ventmap','mechanics','heuristics'];
  const clock=s=>{const n=Math.floor(s);return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
  const panel=window.BreathAnalysis.createPanel();
  panel.classList.add('room-research-overlay');
  let perspective='zebezo', visible=true, activeMobile='ventmap';
  let mode='review', sequenceMap={},liveBreath=null,liveResearch=null;
  let entry=null, data=null, position=0, bounds=null, selected=null;
  let sourceKey='',navKey='',researchKey='',researchTimer=null;
  const researchCache=new Map();
  const positionsByMode={review:{},live:{}};
  function restorePositions(){
    if(window.matchMedia('(max-width: 900px)').matches){
      for(const id of ids){
        const card=panel.querySelector(`[data-overlay-card="${id}"]`);
        card.style.left='';card.style.top='';card.style.right='';card.style.bottom='';
      }
      return;
    }
    const area=$('room-chart-stage').getBoundingClientRect();
    for(const id of ids){
      const card=panel.querySelector(`[data-overlay-card="${id}"]`),point=positionsByMode[mode][id];
      if(!point){card.style.left='';card.style.top='';card.style.right='';card.style.bottom='';continue;}
      card.style.left=`${Math.round(Math.max(0,Math.min(area.width-card.offsetWidth,point[0])))}px`;
      card.style.top=`${Math.round(Math.max(0,Math.min(area.height-card.offsetHeight,point[1])))}px`;
      card.style.right='auto';card.style.bottom='auto';
    }
  }
  function updateCards(){
    const shown=visible&&ids.some(id=>!panel.querySelector(`[data-overlay-card="${id}"]`).hidden);
    panel.classList.toggle('cards-hidden',!shown);
    $('room-analysis-toggle').textContent=shown?'Hide analysis cards':'Show analysis cards';
    $('room-analysis-toggle').setAttribute('aria-pressed',String(shown));
    if(!panel.querySelector(`[data-overlay-card="${activeMobile}"]`)?.hidden){
      // Keep the chosen compact card active.
    }else activeMobile=ids.find(id=>!panel.querySelector(`[data-overlay-card="${id}"]`).hidden)||'ventmap';
    for(const id of ids){
      panel.querySelector(`[data-overlay-card="${id}"]`).classList.toggle('mobile-active',id===activeMobile);
      panel.querySelector(`[data-mobile-overlay="${id}"]`).setAttribute('aria-pressed',String(id===activeMobile&&shown));
    }
    if(shown)requestAnimationFrame(restorePositions);
  }
  function setPerspective(value){
    perspective=value;
    window.BreathAnalysis.setPerspective(panel,value);
    document.body.classList.toggle('room-hahnicity',value==='hahnicity');
    for(const name of ['zebezo','hahnicity']){
      const button=$('room-view-'+name),selected=name===value;
      button.classList.toggle('selected',selected);
      button.classList.toggle('hahnicity',selected&&name==='hahnicity');
      button.setAttribute('aria-pressed',String(selected));
    }
    $('room-analysis-source').textContent=value==='hahnicity'?'EXPERIMENTAL':'SOURCE DERIVED';
    $('room-analysis-source').classList.toggle('research',value==='hahnicity');
    if(value==='hahnicity'&&mode==='review')requestResearch();
    updateLabel();
  }
  function updateLabel(){
    if(mode==='live'){
      if(!liveBreath){$('room-analysis-breath').textContent='AWAITING BE';return;}
      const number=liveBreath.sequence||liveBreath.number;
      const state=perspective==='hahnicity'
        ? liveResearch?.breath===liveBreath.number
          ? liveResearch.status==='ok'?'RESEARCH READY':'RESEARCH UNAVAILABLE'
          : 'ANALYZING'
        : 'COMPLETE';
      $('room-analysis-breath').textContent=`BS${String(number).padStart(4,'0')} @ ${clock(liveBreath.start_elapsed)} · ${state}`;
      return;
    }
    const number=selected?sequenceFor(selected.start):null;
    const label=number?`BS${String(number).padStart(4,'0')}`:'BS';
    $('room-analysis-breath').textContent=selected
      ? perspective==='hahnicity'?`${label} @ ${selected.start} · RESEARCH`:`${label} @ ${selected.start} · COMPLETE`
      : 'Awaiting completed breath';
  }
  function sequenceFor(start){
    const starts=sequenceMap[entry?.name];if(!starts)return null;
    let low=0,high=starts.length-1;
    while(low<=high){const mid=(low+high)>>1;if(starts[mid]===start)return mid+1;
      if(starts[mid]<start)low=mid+1;else high=mid-1;}
    return null;
  }
  function cancelResearch(){
    clearTimeout(researchTimer);researchTimer=null;
  }
  function requestResearch(){
    if(perspective!=='hahnicity'||!entry||!selected)return;
    const key=`${entry.name}:${selected.start}`;
    if(key===researchKey)return;
    cancelResearch();researchKey=key;
    if(researchCache.has(key)){window.BreathAnalysis.render(panel,researchCache.get(key));return;}
    window.BreathAnalysis.render(panel,{status:'unavailable',reason:'Analyzing this completed breath…'});
    researchTimer=setTimeout(()=>{
      try{
        const starts=sequenceMap[entry.name],ordinal=starts?.indexOf(selected.start)+1||1;
        const sourceMarker=data.markers.find(marker=>marker.kind==='BS'&&marker.index===selected.start)?.sourceMarker||'BS';
        const result=window.BrowserResearch.analyze(
          data.flow.subarray(selected.start,selected.end),
          data.pressure.subarray(selected.start,selected.end),ordinal,sourceMarker,1/50);
        if(researchKey!==key)return;
        researchCache.set(key,result);
        if(researchCache.size>80)researchCache.delete(researchCache.keys().next().value);
        window.BreathAnalysis.render(panel,result);
      }catch(error){
        if(researchKey===key)
          window.BreathAnalysis.render(panel,{status:'unavailable',reason:`Browser analysis unavailable: ${error.message}`});
      }
    },0);
  }
  function drawNavigator(selectSample){
    if(!entry||!data||!bounds)return;
    const key=`${entry.name}:${Math.floor(bounds.start/50)}:${Math.floor(bounds.end/50)}:${selected?.start??-1}`;
    if(key===navKey)return;navKey=key;
    const breaths=data.completed.filter(b=>b.start<bounds.end&&b.end>bounds.start);
    $('room-breath-count').textContent=`${breaths.length} complete breath${breaths.length===1?'':'s'} in view`;
    const list=$('room-breath-list');list.replaceChildren();
    for(const breath of breaths){
      const button=document.createElement('button');button.type='button';
      const number=sequenceFor(breath.start);
      button.textContent=`${number?`BS${String(number).padStart(4,'0')}`:'BS'} @ ${clock(breath.start/50)}`;
      button.title=`Go to breath at ${clock(breath.start/50)}`;
      button.classList.toggle('selected',breath===selected);
      button.addEventListener('click',()=>selectSample(breath.start));list.append(button);
    }
    $('room-window-range').textContent=`${clock(bounds.start/50)}–${clock(bounds.end/50)}`;
  }
  function update(state,selectSample){
    entry=state.entry;data=state.data;position=state.position;bounds=state.bounds;
    if(mode==='live')return;
    if(!data){selected=null;sourceKey='';navKey='';researchKey='';cancelResearch();
      window.BreathAnalysis.renderSource(panel,null);
      window.BreathAnalysis.render(panel,{status:'unavailable',reason:'Select a room and load its source segment.'});
      $('room-breath-list').replaceChildren();$('room-breath-count').textContent='No complete breaths in view';updateLabel();return;
    }
    let complete=null;
    // This room is a recorded-source review. A selected BS opens its completed
    // source breath, while positions between breaths retain the preceding one.
    for(const breath of data.completed){
      if(breath.start>position)break;
      complete=breath;
      if(position<breath.end)break;
    }
    selected=complete;
    const key=`${entry.name}:${complete?.start??-1}`;
    if(key!==sourceKey){
      sourceKey=key;researchKey='';cancelResearch();
      window.BreathAnalysis.renderSource(panel,complete?{
        metrics:[complete.vti,complete.vte,complete.pifr,complete.pefr,complete.peakPressure,complete.peep,complete.map],
        label:sequenceFor(complete.start)?`BS${String(sequenceFor(complete.start)).padStart(4,'0')}`:'—',marker:'BS',startSeconds:complete.start/50,
        durationSeconds:(complete.end-complete.start)/50
      }:null);
      window.BreathAnalysis.render(panel,{status:'unavailable',reason:complete?'Select Hahnicity to analyze this breath.':'Awaiting a completed breath.'});
      updateLabel();requestResearch();
    }
    drawNavigator(selectSample);
  }
  function mount(selectSample,getBounds){
    const area=$('room-chart-stage');area.append(panel);
    window.BreathAnalysis.installSourceView(panel);
    const tabs=document.createElement('div');tabs.className='mobile-overlay-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Analysis card');
    for(const [id,label] of [['ventmap','Volume'],['mechanics','Pressure'],['heuristics','Breath']]){
      const button=document.createElement('button');button.type='button';button.dataset.mobileOverlay=id;button.textContent=label;
      button.addEventListener('click',()=>{activeMobile=id;visible=true;panel.querySelector(`[data-overlay-card="${id}"]`).hidden=false;updateCards();});tabs.append(button);
    }
    panel.prepend(tabs);
    [...panel.querySelectorAll(':scope > .research-group')].forEach((card,index)=>{
      const id=ids[index];card.dataset.overlayCard=id;
      const heading=card.querySelector('h4');
      const close=document.createElement('button');close.type='button';close.className='overlay-close';close.textContent='×';close.setAttribute('aria-label',`Hide ${heading.textContent} card`);
      close.addEventListener('click',event=>{event.stopPropagation();card.hidden=true;updateCards();});heading.append(close);
      heading.addEventListener('pointerdown',event=>{
        if(window.matchMedia('(max-width: 900px)').matches||event.button!==0||event.target.closest('button'))return;
        const box=area.getBoundingClientRect(),rect=card.getBoundingClientRect();
        const x=rect.left-box.left,y=rect.top-box.top,atX=event.clientX,atY=event.clientY,dragMode=mode;
        card.style.left=`${x}px`;card.style.top=`${y}px`;card.style.right='auto';card.style.bottom='auto';
        heading.setPointerCapture(event.pointerId);card.classList.add('dragging');
        const move=e=>{
          card.style.left=`${Math.max(0,Math.min(box.width-card.offsetWidth,x+e.clientX-atX))}px`;
          card.style.top=`${Math.max(0,Math.min(box.height-card.offsetHeight,y+e.clientY-atY))}px`;
        };
        const end=()=>{heading.removeEventListener('pointermove',move);heading.removeEventListener('pointerup',end);heading.removeEventListener('pointercancel',end);card.classList.remove('dragging');positionsByMode[dragMode][id]=[parseFloat(card.style.left),parseFloat(card.style.top)];};
        heading.addEventListener('pointermove',move);heading.addEventListener('pointerup',end);heading.addEventListener('pointercancel',end);
      });
    });
    $('room-analysis-toggle').addEventListener('click',()=>{
      const open=ids.some(id=>!panel.querySelector(`[data-overlay-card="${id}"]`).hidden);
      if(visible&&open)visible=false;
      else{
        visible=true;
        if(!open)for(const id of ids)panel.querySelector(`[data-overlay-card="${id}"]`).hidden=false;
      }
      updateCards();
    });
    $('room-analysis-reset').addEventListener('click',()=>{visible=true;for(const id of ids){delete positionsByMode[mode][id];panel.querySelector(`[data-overlay-card="${id}"]`).hidden=false;}updateCards();});
    $('room-analysis-about').addEventListener('click',()=>$('room-about').showModal());
    $('room-view-zebezo').addEventListener('click',()=>setPerspective('zebezo'));
    $('room-view-hahnicity').addEventListener('click',()=>setPerspective('hahnicity'));
    for(const [button,direction] of [['room-prev-window',-1],['room-next-window',1]])
      $(button).addEventListener('click',()=>{if(!data)return;const b=getBounds(),width=b.end-b.start;selectSample(Math.max(0,Math.min(data.flow.length-1,b.start+direction*width)));});
    window.addEventListener('resize',()=>requestAnimationFrame(restorePositions));
    setPerspective('zebezo');updateCards();
  }
  function setMode(value){
    mode=value;cancelResearch();researchKey='';sourceKey='';navKey='';
    requestAnimationFrame(restorePositions);
    if(value==='live'){
      renderLiveCards();
    }
  }
  function renderLiveCards(){
    const breath=liveBreath;
    const number=breath?.sequence||breath?.number;
    window.BreathAnalysis.renderSource(panel,breath?{
      metrics:breath.metrics,label:`BS${String(number).padStart(4,'0')}`,marker:breath.marker,
      startSeconds:breath.start_elapsed,durationSeconds:breath.end_elapsed-breath.start_elapsed
    }:null);
    window.BreathAnalysis.render(panel,liveResearch||{
      status:'unavailable',reason:breath?'Analyzing this completed breath…':'Awaiting the first completed breath.'
    });
    updateLabel();
  }
  function showLiveBreath(breath){
    liveBreath=breath;liveResearch=null;renderLiveCards();
  }
  function showLiveResearch(result){
    if(!liveBreath||result.breath!==liveBreath.number)return;
    liveResearch=result;window.BreathAnalysis.render(panel,result);updateLabel();
  }
  function clearLive(){liveBreath=null;liveResearch=null;if(mode==='live')renderLiveCards();}
  function setSequenceMap(value){sequenceMap=value||{};sourceKey='';navKey='';}
  window.RoomAnalysis={mount,update,setMode,showLiveBreath,showLiveResearch,clearLive,setSequenceMap};
})();
