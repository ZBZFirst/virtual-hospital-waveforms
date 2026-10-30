function openVirtualRoom(hospitalId,level,room){
  const slots=state.organization.floorUnits[hospitalId];
  const unitId=slots?.[level-1];
  const feedId=unitId&&Number.isInteger(room)&&room>=1&&room<=HospitalSystem.BEDS_PER_UNIT?
    state.organization.placements[HospitalSystem.bedId(unitId,room)]:null;
  const entry=feedId&&state.entries.find(item=>item.name===feedId);
  if(entry)selectEntry(entry);
  else showHospital(hospitalId,level,room);
}
async function selectEntry(entry) {
  stopPatientAudio();
  loadPreviewForEntry(entry).catch(()=>{});
  if(state.selected?.name!==entry.name)
    roomAxes={flow:WaveformAxis.create(),pressure:WaveformAxis.create(),volume:WaveformAxis.create()};
  window.RoomLive.pause();
  const environmentSeconds=feedElapsed(entry);
  window.RoomLive.selectFeed(entry,environmentSeconds);
  state.seekGeneration++;
  if(state.seekTimer){clearTimeout(state.seekTimer);state.seekTimer=null;}
  const unitPlayback=state.unitPlayback;
  const unitData=unitPlayback?.data.get(entry.name);
  const handoffSeconds=environmentSeconds;
  const handoffPlaying=!feedEnded(entry);
  stopUnitPlayback();
  els.speed.value='1';
  if(state.pending)state.pending.abort();
  state.active=false;state.lastFrame=0;state.position=handoffSeconds*RATE;state.selected=entry;state.data=null;
  state.selectedNode=state.nodes.find(n=>n.kind==='room'&&n.entry===entry);focusUnit(entry.unit);
  els.database.hidden=true;els.waveform.hidden=false;
  $('patientNoVital').hidden=true;
  $('patientVitalTab').classList.remove('selected');$('patientVitalTab').setAttribute('aria-pressed','false');
  $('patientVentTab').classList.add('selected');$('patientVentTab').setAttribute('aria-pressed','true');
  updateSpeaker();
  renderRoomHeader(entry);
  renderBreadcrumbs(entry.unit,entry.room);
  els.loadStatus.textContent='Loading 30-minute segment…'; setControls(false); listEntries(); drawAtlas();openDetail();drawAll();
  if(state.roomMode==='live'&&!feedEnded(entry))window.RoomLive.start();
  try {
    await state.segmentStore.ready(entry.name);
    if(state.selected!==entry)return;
    const data=unitData||feedData(entry);
    state.data=data;
    state.position=Math.min(entry.samples-1,handoffSeconds*RATE);
    await ensureAt(entry,data,state.position);
    if(state.selected!==entry)return;
    state.active=state.roomMode==='review'&&handoffPlaying&&state.position<data.flow.length-1;
    state.lastFrame=0;
    els.loadStatus.textContent=state.roomMode==='live'?`Real-Time Feed · ${$('room-live-speed').value}×`:
      `${handoffPlaying?'Ready · playing at 1×':'Recording complete · Replay feed to restart'}${data.bad?` · ${data.bad} unparsed line(s)`:''}`;
    setControls(true);drawAll();
    loadBreathSequences();
  } catch(err) {
    if(state.selected===entry)els.loadStatus.textContent=`Segment load failed: ${err.message}`;
  }
}
function renderRoomHeader(entry){
  els.streamLabel.textContent=`STREAM ${String(entry.number).padStart(3,'0')}`;
  const virtualRoom=fullCatalogByRecording.get(entry.name);
  els.streamTitle.textContent=virtualRoom?`Hospital ${virtualRoom.hospital_id} · Floor ${virtualRoom.floor} · Room ${String(virtualRoom.room).padStart(2,'0')}`:
    entry.unit===null?'Unassigned feed':`Unit ${String(entry.unit).padStart(2,'0')} · Room ${String(entry.room).padStart(2,'0')}`;
  els.streamMeta.textContent=`Source recording ID: ${entry.name.split('-')[0]} · illustrative room assignment`;
  $('recordingFilename').textContent=entry.name;
  $('recordingRpi').textContent=String(entry.rpi);
  $('recordingStart').textContent=entry.shiftedStart;
  $('recordingSamples').textContent=entry.samples.toLocaleString();
  $('recordingBreaths').textContent=entry.breaths.toLocaleString();
}
function setRoomMode(mode){
  for(const name of ['review','live']){
    const button=$(`room-feed-${name}`),selected=name===mode;
    button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  }
  if(mode===state.roomMode)return;
  if(mode==='live'){
    state.reviewWasPlaying=state.active;
    state.active=false;state.lastFrame=0;
    state.roomMode='live';els.waveform.dataset.roomMode='live';
    window.RoomAnalysis.setMode('live');
    if(state.selected)window.RoomLive.selectFeed(state.selected,feedElapsed(state.selected));
    window.RoomLive.start();window.RoomLive.draw();
    els.loadStatus.textContent=`Real-Time Feed · ${$('room-live-speed').value}×`;
  }else{
    const joinedSeconds=window.RoomLive.elapsed();
    window.RoomLive.pause();
    state.roomMode='review';els.waveform.dataset.roomMode='review';
    window.RoomAnalysis.setMode('review');
    state.active=state.reviewWasPlaying&&!!state.data;
    state.lastFrame=0;
    els.loadStatus.textContent=`Ready · ${state.active?'playing':'paused'} at ${els.speed.value}×`;
    if(state.data)setPosition(Math.min(state.data.flow.length-1,joinedSeconds*RATE));
    else drawAll();
  }
  const url=new URL(location.href);
  if(mode==='review')url.searchParams.set('roomView','review');else url.searchParams.delete('roomView');
  history.replaceState(null,'',url);
}
function setControls(enabled) { for(const el of [els.start,els.play,els.pause,els.stop,els.scrub])el.disabled=!enabled; }
function setPosition(value,debounce=0) {
  if(!state.data)return;
  const generation=++state.seekGeneration;
  if(state.seekTimer){clearTimeout(state.seekTimer);state.seekTimer=null;}
  const resume=state.active,entry=state.selected,data=state.data;
  state.position=Math.max(0,Math.min(state.data.flow.length-1,value));
  drawAll();
  if(data.loadedSegments.has(segmentNumber(entry,state.position)))return;
  state.active=false;state.lastFrame=0;
  const load=async()=>{
    els.loadStatus.textContent=`Loading segment at ${clock(state.position/RATE)}…`;
    try{
      await ensureAt(entry,data,state.position);
      if(state.selected===entry&&state.data===data&&state.seekGeneration===generation){
        state.active=resume;state.lastFrame=0;
        els.loadStatus.textContent=`Ready · ${state.active?'playing':'paused'} at ${els.speed.value}×${data.bad?` · ${data.bad} unparsed line(s)`:''}`;
        drawAll();
      }
    }catch(error){if(state.selected===entry&&state.seekGeneration===generation)
      els.loadStatus.textContent=`Segment load failed: ${error.message}`;}
  };
  if(debounce)state.seekTimer=setTimeout(load,debounce);else load();
}
function drawAll() {
  if(state.roomMode==='live')return;
  const data=state.data;
  if(data){
    const n=data.flow.length,i=Math.min(n-1,Math.floor(state.position));
    els.scrub.value=String(Math.round(i/(n-1)*1000));
    els.time.textContent=`${clock(i/RATE)} / ${clock(n/RATE)}`;
    const ready=Number.isFinite(data.flow[i])&&Number.isFinite(data.pressure[i]);
    els.flowValue.textContent=ready?data.flow[i].toFixed(2):'segment loading';
    els.pressureValue.textContent=ready?data.pressure[i].toFixed(2):'segment loading';
    els.volumeValue.textContent=Number.isFinite(data.volume[i])?`${data.volume[i].toFixed(1)} mL`:'unavailable';
    let completed=null;
    for(const breath of data.completed){
      if(breath.start>i)break;
      completed=breath;
      if(i<breath.end)break;
    }
    const value=(v,unit)=>v===null?'unavailable':`${v.toFixed(1)} ${unit}`;
    els.flowBreathValue.textContent=ready&&completed?
      `Selected completed source breath · PIFR ${value(completed.pifr,'L/min')} · PEFR ${value(completed.pefr,'L/min')}`:
      'No completed breath at this position';
    els.pressureBreathValue.textContent=ready&&completed?
      `Selected completed source breath · Peak pressure ${value(completed.peakPressure,'cmH₂O')} · PEEP estimate ${value(completed.peep,'cmH₂O')} · MAP (airway) ${value(completed.map,'cmH₂O')}`:
      'No completed breath at this position';
    els.breathValue.textContent=ready&&completed?
      `Selected completed source breath · VTi ${completed.vti.toFixed(1)} mL · VTe ${completed.vte.toFixed(1)} mL · difference ${completed.difference.toFixed(1)} mL`:
      'No completed breath at this position';
  } else { els.scrub.value='0';els.time.textContent='0:00.00 / 0:00.00';els.flowValue.textContent='—';els.pressureValue.textContent='—';els.volumeValue.textContent='—';els.flowBreathValue.textContent='No completed breath at this position';els.pressureBreathValue.textContent='No completed breath at this position';els.breathValue.textContent='No completed breath at this position'; }
  drawOverview();drawSignal(els.flow,0);drawSignal(els.pressure,1);
  if(document.querySelector('.room-optional').open){
    if(els.volumeToggle.checked)drawSignal(els.volume,2);
    drawPath();
  }
  window.RoomAnalysis.update({entry:state.selected,data:state.data,position:state.position,
    bounds:state.data?windowBounds():null},sample=>setPosition(sample));
}
function windowBounds() {
  const n=state.data.flow.length,width=Math.min(n,Number(els.window.value)*RATE);
  let start=Math.floor(state.position-width*.28);start=Math.max(0,Math.min(n-width,start));
  return {start,end:start+width};
}
function drawOverview() {
  const {ctx,w,h,dpr}=fit(els.overview);ctx.clearRect(0,0,w,h);ctx.fillStyle='#0c2230';ctx.fillRect(0,0,w,h);
  if(!state.data)return;
  const {lo,hi,min,max}=state.data.overview,pad=12*dpr,pw=w-2*pad,span=max-min||1;
  ctx.strokeStyle='#275060';ctx.beginPath();ctx.moveTo(pad,h/2);ctx.lineTo(w-pad,h/2);ctx.stroke();
  ctx.strokeStyle='#59d8dc';ctx.lineWidth=Math.max(1,dpr);ctx.beginPath();
  for(let b=0;b<lo.length;b++){if(!Number.isFinite(lo[b]))continue;const x=pad+b/(lo.length-1)*pw;ctx.moveTo(x,pad+(max-hi[b])/span*(h-2*pad));ctx.lineTo(x,pad+(max-lo[b])/span*(h-2*pad));}ctx.stroke();
  const bounds=windowBounds(),n=state.data.flow.length;
  ctx.fillStyle='#a4defb21';ctx.fillRect(pad+bounds.start/n*pw,pad,(bounds.end-bounds.start)/n*pw,h-2*pad);
  const x=pad+state.position/n*pw;ctx.strokeStyle='#ffc874';ctx.lineWidth=2*dpr;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();
}
function drawSignal(canvas,channel) {
  const {ctx,w,h,dpr}=fit(canvas);ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1f2a';ctx.fillRect(0,0,w,h);
  if(!state.data)return;
  const values=channel===2?state.data.volume:channel===1?state.data.pressure:state.data.flow,{start,end}=windowBounds();
  const right=12*dpr,top=13*dpr,bottom=25*dpr,ph=h-top-bottom;
  let min=Infinity,max=-Infinity;for(let i=start;i<end;i++){const v=values[i];if(!Number.isFinite(v))continue;if(v<min)min=v;if(v>max)max=v;}
  if(!Number.isFinite(min)){ctx.fillStyle='#91adba';ctx.font=`${13*dpr}px system-ui`;ctx.fillText(channel===2?'Calculated volume unavailable in this window':'Segment loading or no valid samples',43*dpr,top+ph/2);return;}
  ({min,max}=WaveformAxis.observe(roomAxes[channel===2?'volume':channel===1?'pressure':'flow'],min,max));
  const labels=WaveformAxis.tickLabels(min,max);
  ctx.font=`${11*dpr}px system-ui`;
  const left=Math.max(43*dpr,Math.ceil(Math.max(...labels.map(label=>ctx.measureText(label).width)))+10*dpr),pw=w-left-right;
  ctx.strokeStyle='#294a59';ctx.fillStyle='#91adba';ctx.lineWidth=dpr;ctx.textBaseline='middle';
  for(let k=0;k<=4;k++){
    let y=top+k*ph/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();
    ctx.textAlign='right';ctx.fillText(labels[k],left-6*dpr,y);
  }
  ctx.textBaseline='alphabetic';
  for(let k=0;k<=4;k++){const x=left+k*pw/4;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+ph);ctx.stroke();ctx.textAlign='center';ctx.fillText(clock((start+(end-start)*k/4)/RATE),x,top+ph+17*dpr);}
  const breaths=state.data.breathStarts;ctx.strokeStyle='#43677877';ctx.lineWidth=dpr;
  for(const b of breaths){if(b<start)continue;if(b>=end)break;const x=left+(b-start)/(end-start)*pw;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+ph);ctx.stroke();}
  ctx.strokeStyle=channel===2?'#a7e596':channel===1?'#ffc17a':'#5cdae0';ctx.lineWidth=1.5*dpr;ctx.beginPath();
  const step=Math.max(1,Math.floor((end-start)/(pw/dpr*2)));
  let drawing=false,previous=-1;
  for(let i=start;i<end;i+=step){
    if(!Number.isFinite(values[i])){drawing=false;continue;}
    const x=left+(i-start)/(end-start-1)*pw,y=top+(max-values[i])/(max-min)*ph;
    if(!drawing || (channel===2 && state.data.volumeSegment[i]!==state.data.volumeSegment[previous]) || previous>=0 && i-previous>step){ctx.moveTo(x,y);}else ctx.lineTo(x,y);
    drawing=true;previous=i;
  }ctx.stroke();
  const cx=left+(state.position-start)/(end-start)*pw;ctx.strokeStyle='#fff2d7';ctx.lineWidth=2*dpr;ctx.beginPath();ctx.moveTo(cx,top);ctx.lineTo(cx,top+ph);ctx.stroke();
}
function drawPath() {
  const {ctx,w,h,dpr}=fit(els.path);ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1f2a';ctx.fillRect(0,0,w,h);
  if(!state.data)return;
  const {start,end}=windowBounds(),f=state.data.flow,p=els.pathAxis.value==='volume'?state.data.volume:state.data.pressure;
  let fl=Infinity,fh=-Infinity,pl=Infinity,ph=-Infinity;
  for(let i=start;i<end;i++){fl=Math.min(fl,f[i]);fh=Math.max(fh,f[i]);if(Number.isFinite(p[i])){pl=Math.min(pl,p[i]);ph=Math.max(ph,p[i]);}}
  if(!Number.isFinite(pl)){ctx.fillStyle='#91adba';ctx.fillText('Segment loading or no valid path in this window',20*dpr,30*dpr);return;}
  const coords=(i)=>({x:((i-start)/(end-start-1)-.5)*180,y:((f[i]-fl)/(fh-fl||1)-.5)*155,z:((p[i]-pl)/(ph-pl||1)-.5)*155});
  const proj=(q)=>project(q,state.pathYaw,state.pathPitch,w,h,1.03);
  const origin=proj({x:-90,y:-78,z:-78});
  const zLabel=els.pathAxis.value==='volume'?'VOLUME (mL)':'PRESSURE';
  for(const [axis,to,color,label] of [['time',{x:95,y:-78,z:-78},'#7abce0','TIME'],['flow',{x:-90,y:85,z:-78},'#5ddce2','FLOW'],['z',{x:-90,y:-78,z:85},'#ffc277',zLabel]]){
    const tip=proj(to);ctx.strokeStyle=color;ctx.lineWidth=1.3*dpr;ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();ctx.fillStyle=color;ctx.font=`${11*dpr}px system-ui`;ctx.fillText(label,tip.x+5*dpr,tip.y-4*dpr);
  }
  const step=Math.max(1,Math.ceil((end-start)/1500));ctx.lineWidth=1.5*dpr;
  let prev=null,prevIndex=-1;for(let i=start;i<end;i+=step){if(!Number.isFinite(p[i])){prev=null;continue;}const q=proj(coords(i));if(prev && (els.pathAxis.value!=='volume'||state.data.volumeSegment[i]===state.data.volumeSegment[prevIndex])){ctx.strokeStyle=i<=state.position?'#67dfe3':'#527e98';ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(q.x,q.y);ctx.stroke();}prev=q;prevIndex=i;}
  const marker=proj(coords(Math.max(start,Math.min(end-1,Math.floor(state.position)))));
  if(Number.isFinite(marker.x)&&Number.isFinite(marker.y)){ctx.fillStyle='#ffd17c';ctx.strokeStyle='#fff8e8';ctx.lineWidth=dpr;ctx.beginPath();ctx.arc(marker.x,marker.y,5*dpr,0,Math.PI*2);ctx.fill();ctx.stroke();}
}
