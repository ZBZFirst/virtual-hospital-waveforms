function drawMiniPair(canvas,preview,positionSeconds=null){
  const {ctx,w,h,dpr}=fit(canvas);ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1d29';ctx.fillRect(0,0,w,h);
  if(!preview?.flow?.length)return;
  const live=positionSeconds!==null,n=preview.flow.length,width=Math.min(n,DEFAULT_WINDOW_SECONDS*RATE);
  const start=live?Math.max(0,Math.min(n-width,Math.floor(positionSeconds*RATE-width*.28))):0;
  const end=start+width;
  const rows=[{values:preview.flow,color:'#5bd9de',label:'FLOW',top:8*dpr,bottom:h*.49},{values:preview.pressure,color:'#ffc17b',label:'PRESSURE',top:h*.54,bottom:h-7*dpr}];
  for(const row of rows){
    let lo=Infinity,hi=-Infinity;for(let i=start;i<end;i++){const v=row.values[i];if(Number.isFinite(v)){if(v<lo)lo=v;if(v>hi)hi=v;}}
    if(!Number.isFinite(lo))continue;
    const span=hi-lo||1;lo-=span*.08;hi+=span*.08;
    ctx.strokeStyle='#2e4c5b';ctx.lineWidth=dpr;ctx.beginPath();ctx.moveTo(27*dpr,row.bottom);ctx.lineTo(w-5*dpr,row.bottom);ctx.stroke();
    ctx.fillStyle=row.color;ctx.font=`${9*dpr}px system-ui`;ctx.textAlign='left';ctx.fillText(row.label,4*dpr,row.top+9*dpr);
    ctx.strokeStyle=row.color;ctx.lineWidth=1.2*dpr;ctx.beginPath();let drawing=false;
    const step=Math.max(1,Math.floor((end-start)/(w/dpr*2)));
    for(let i=start;i<end;i+=step){const v=row.values[i];if(!Number.isFinite(v)){drawing=false;continue;}const x=27*dpr+(i-start)/Math.max(1,end-start-1)*(w-34*dpr),y=row.top+(hi-v)/(hi-lo)*(row.bottom-row.top);if(!drawing)ctx.moveTo(x,y);else ctx.lineTo(x,y);drawing=true;}ctx.stroke();
  }
  if(live){
    const sample=Math.min(n-1,Math.floor(positionSeconds*RATE));
    if(sample>=start&&sample<end){const x=27*dpr+(sample-start)/Math.max(1,end-start-1)*(w-34*dpr);ctx.strokeStyle='#fff2d7';ctx.lineWidth=1.4*dpr;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  }
}
function unitPreviewCard(unit,room,entry){
  const button=document.createElement('button');button.type='button';button.className='unit-preview-card'+(room>6?' shared':entry?'':' empty')+(entry&&feedEnded(entry)?' ended':'');button.disabled=!entry;
  const strong=document.createElement('strong');strong.textContent=room===7?'Supply room':room===8?'Break room':`Room ${String(room).padStart(2,'0')}`;
  const small=document.createElement('small');small.textContent=room>6?'Shared unit space':entry?feedEnded(entry)?'Recording complete · open to review or replay':`${clock(entry.samples/RATE)} stream · first 10 s shown`:'Open patient bed';
  button.append(strong,small);
  if(entry){const canvas=document.createElement('canvas');canvas.className='mini-pair';canvas._preview=entry.preview;canvas._entry=entry;button.append(canvas);button.onclick=()=>selectEntry(entry);}
  return button;
}
function makeUnitPlayback(unit,members,grid,handoff=null){
  return {unit,members,grid,data:new Map(),controllers:[],failedSegments:new Set(),
    elapsed:handoff?.elapsed??sessionSeconds(),resumeActive:handoff?.active??true,
    resumeFromSession:!handoff,handoffAt:performance.now(),
    maxSeconds:Math.max(1,...members.map(e=>e.samples/RATE)),
    active:false,started:false,lastFrame:0,lastDraw:0};
}
function renderFloorWaveforms(unitId,level,handoff=null){
  const section=document.createElement('section');section.className='floor-waveforms';
  const unit=state.model.unitDefinitions.find(item=>item.unit_id===unitId);
  const title=document.createElement('h3');
  title.textContent=`Floor ${level} · ${unit?.display_name||'Open floor'} waveforms`;
  section.append(title);
  const grid=document.createElement('div');grid.className='unit-preview-grid';
  const members=unit?state.units.get(unit.legacy_number):[];
  for(let room=1;room<=8;room++)grid.append(unitPreviewCard(unit?.legacy_number??null,room,
    members.find(entry=>entry.room===room)));
  if(!unit){
    section.append(message('No unit is assigned to this floor. Six patient beds and two shared rooms remain visible.'),grid);
    return section;
  }
  section.append(message('Each tile starts with a 10-second preview, then shows a live 50 Hz flow and pressure window when its segment is ready. Select a room to open its full waveform view.'));
  if(members.length){
    const playback=makeUnitPlayback(unit.legacy_number,members,grid,handoff);
    state.unitPlayback=playback;
    els.loadStatus.textContent=`Loading 0/${members.length} feeds…`;
    section.append(unitTransport(playback));
    requestAnimationFrame(()=>{
      if(state.unitPlayback!==playback)return;
      drawUnitPlayback();loadUnitPlayback(playback);
    });
  }
  section.append(grid);
  return section;
}
function drawUnitPlayback(){
  const playback=state.unitPlayback;
  if(!playback)return;
  playback.time.textContent=`Session ${clock(playback.elapsed)}`;
  playback.scrub.value=String(Math.round(Math.min(1,playback.elapsed/playback.maxSeconds)*1000));
  if(!playback.grid.isConnected)return;
  for(const canvas of playback.grid.querySelectorAll('.mini-pair')){
    const entry=canvas._entry,data=playback.data.get(entry.name);
    const position=feedElapsed(entry,playback.elapsed);
    const card=canvas.closest('.unit-preview-card');
    card.classList.toggle('ended',position>=entry.samples/RATE);
    if(position>=entry.samples/RATE)card.querySelector('small').textContent='Recording complete · open to review or replay';
    if(data){
      const sample=Math.min(entry.samples-1,Math.floor(position*RATE));
      const number=segmentNumber(entry,sample),key=`${entry.name}:${number}`;
      if(!data.loadedSegments.has(number)&&!data.loadingSegments.has(number)&&!playback.failedSegments.has(key)){
        ensureSegment(entry,data,number).then(()=>{if(state.unitPlayback===playback)drawUnitPlayback();})
          .catch(error=>{playback.failedSegments.add(key);if(state.unitPlayback===playback){
            card.classList.add('failed');
            card.querySelector('small').textContent=`Segment unavailable: ${error.message}`;
          }});
      }
    }
    drawMiniPair(canvas,data||canvas._preview,data?position:null);
  }
}
function unitTransport(playback){
  const row=document.createElement('div');row.className='unit-transport';
  for(const [label,action] of [
    ['Start',()=>{playback.elapsed=0;playback.active=true;playback.lastFrame=0;drawUnitPlayback();}],
    ['Play',()=>{playback.active=true;playback.lastFrame=0;}],
    ['Pause',()=>{playback.active=false;playback.lastFrame=0;drawUnitPlayback();}],
    ['Stop',()=>{playback.active=false;playback.lastFrame=0;playback.elapsed=0;drawUnitPlayback();}]
  ]){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=true;button.onclick=action;row.append(button);}
  const speed=document.createElement('span');speed.className='unit-time';speed.textContent='Synchronized · 1×';row.append(speed);
  playback.scrub=document.createElement('input');playback.scrub.type='range';playback.scrub.min='0';playback.scrub.max='1000';playback.scrub.value='0';playback.scrub.disabled=true;
  playback.scrub.setAttribute('aria-label','Unit playback position');
  playback.scrub.oninput=()=>{
    playback.elapsed=Number(playback.scrub.value)/1000*playback.maxSeconds;
    playback.lastFrame=0;drawUnitPlayback();
  };
  row.append(playback.scrub);
  playback.time=document.createElement('output');playback.time.className='unit-time';playback.time.textContent=`Session ${clock(playback.elapsed)}`;row.append(playback.time);
  playback.buttons=[...row.querySelectorAll('button')];return row;
}
async function loadUnitPlayback(playback){
  let completed=0,failures=0;
  const queue=[...playback.members];
  async function loadNext(){
    while(queue.length&&state.unitPlayback===playback){
    const entry=queue.shift();
    const card=[...playback.grid.children].find(node=>node.querySelector('canvas')?._entry===entry);
    try{
      await state.segmentStore.ready(entry.name);
      const data=feedData(entry);
      const sample=Math.min(entry.samples-1,Math.floor(feedElapsed(entry,playback.elapsed)*RATE));
      await ensureAt(entry,data,sample);
      if(state.unitPlayback!==playback)return;
      playback.data.set(entry.name,data);
      card.querySelector('small').textContent=feedEnded(entry)?'Recording complete · open to review or replay':`${clock(entry.samples/RATE)} stream · live at 1×`;
    }catch(err){
      if(err.name==='AbortError'||state.unitPlayback!==playback)return;
      failures++;card.classList.add('failed');card.querySelector('small').textContent=`Could not load: ${err.message}`;
    }finally{
      if(state.unitPlayback===playback){
        completed++;
        if(playback.data.size&&!playback.started){
          playback.started=true;
          playback.elapsed=playback.resumeFromSession?sessionSeconds():
            playback.elapsed+(playback.resumeActive?(performance.now()-playback.handoffAt)/1000:0);
          playback.active=playback.resumeActive;playback.lastFrame=0;
          playback.buttons.forEach(button=>button.disabled=false);playback.scrub.disabled=false;
        }
        if(playback.grid.isConnected)els.loadStatus.textContent=`${playback.data.size} ready · loading ${completed}/${playback.members.length}${failures?` · ${failures} failed`:''}`;
        drawUnitPlayback();
      }
    }
    }
  }
  await Promise.all(Array.from({length:Math.min(2,playback.members.length)},loadNext));
  if(state.unitPlayback!==playback)return;
  if(playback.grid.isConnected)els.loadStatus.textContent=failures?`${playback.data.size} ready · ${failures} failed`:`${playback.data.size} feeds ready`;
}
function showUnit(unit){
  cancelStream();state.selectedNode=state.nodes.find(n=>n.kind==='unit'&&n.unit===unit);focusUnit(unit);
  const members=state.units.get(unit),samples=members.reduce((sum,e)=>sum+e.samples,0);
  els.waveform.hidden=true;els.database.hidden=false;updateSpeaker();els.streamLabel.textContent=`UNIT ${String(unit).padStart(2,'0')} NURSING STATION`;
  els.streamTitle.textContent=`Unit ${String(unit).padStart(2,'0')} · six patient beds`;
  els.streamMeta.textContent=`${members.length} occupied bed${members.length===1?'':'s'} · ${6-members.length} open bed${6-members.length===1?'':'s'} · supply room · break room · ${samples.toLocaleString()} samples`;
  els.loadStatus.textContent=members.length?`Loading 0/${members.length} feeds…`:'No feeds in this unit';renderBreadcrumbs(unit);
  els.database.replaceChildren();
  const intro=document.createElement('p');intro.className='database-intro';intro.textContent='Occupied rooms follow the page session at 1×. A recording stops at its end and remains available for review or replay. Each tile shows a moving 10-second window of flow and pressure; select a room to inspect it.';
  const grid=document.createElement('div');grid.className='unit-preview-grid';
  for(let room=1;room<=8;room++){
    const entry=members.find(e=>e.room===room);
    grid.append(unitPreviewCard(unit,room,entry));
  }
  const playback=makeUnitPlayback(unit,members,grid);
  state.unitPlayback=playback;
  els.database.append(intro,unitTransport(playback),grid);listEntries();drawAtlas();openDetail();
  requestAnimationFrame(()=>{drawUnitPlayback();loadUnitPlayback(playback);});
}
