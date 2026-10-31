function previewRanges(entry) {
  if (entry.previewRanges) return entry.previewRanges;
  const bytes = entry.previewBytes;
  const previewVolume = new Float32Array(entry.signalBins);
  let flowMin = Infinity, flowMax = -Infinity, pressureMin = Infinity, pressureMax = -Infinity;
  let volume = 0, volumeMin = 0, volumeMax = 0, previousFlow = 0;
  for (let i = 0; i < entry.signalBins; i++) {
    const flowByte = bytes[i * 2], pressureByte = bytes[i * 2 + 1];
    if (flowByte === 255 || pressureByte === 255) {
      previousFlow = 0; volume = 0; previewVolume[i] = NaN; continue;
    }
    const flow = (flowByte - 127) * 60 / 127, pressure = pressureByte / 5;
    flowMin = Math.min(flowMin, flow); flowMax = Math.max(flowMax, flow);
    pressureMin = Math.min(pressureMin, pressure); pressureMax = Math.max(pressureMax, pressure);
    if (previousFlow <= 1 && flow > 1) volume = 0;
    volume += flow * 5 / 3;
    previewVolume[i] = volume;
    volumeMin = Math.min(volumeMin, volume); volumeMax = Math.max(volumeMax, volume);
    previousFlow = flow;
  }
  const padded = (low, high, pad) => Number.isFinite(low)
    ? [low - Math.max(pad, (high - low) * .08), high + Math.max(pad, (high - low) * .08)] : [0, 1];
  entry.previewVolume = previewVolume;
  return entry.previewRanges = {
    pressure: padded(pressureMin, pressureMax, 2),
    flow: padded(flowMin, flowMax, 5),
    volume: padded(volumeMin, volumeMax, 15),
  };
}

function fullSceneRanges(data) {
  if (data.sceneRanges) return data.sceneRanges;
  const padded = (values, pad) => {
    let low = Infinity, high = -Infinity;
    for (const value of values) if (Number.isFinite(value)) {
      low = Math.min(low, value); high = Math.max(high, value);
    }
    const margin = Math.max(pad, (high - low) * .08);
    return Number.isFinite(low) ? [low - margin, high + margin] : [0, 1];
  };
  return data.sceneRanges = {
    pressure: padded(data.pressure, 2), flow: padded(data.flow, 5), volume: padded(data.volume, 15),
  };
}

function sceneWindow(entry, end) {
  const data = state.cache.get(entry.name);
  const last = Math.max(0, Math.min(entry.samples - 1, Math.floor(end * RATE)));
  if (data?.loadedSegments.has(segmentNumber(entry, last)) && Number.isFinite(data.flow[last])) {
    const flow = [], pressure = [], volume = [];
    for (let offset = 249; offset >= 0; offset--) {
      const index = last - offset;
      for (const [target, source] of [[flow, data.flow], [pressure, data.pressure], [volume, data.volume]]) {
        const value = index >= 0 ? source[index] : NaN;
        target.push(Number.isFinite(value) ? value : null);
      }
    }
    return { sourceRate: 50, flow, pressure, volume, ranges: fullSceneRanges(data) };
  }
  if (!entry.previewBytes) return null;
  const ranges = previewRanges(entry), flow = [], pressure = [], volume = [];
  const duration = entry.samples / RATE;
  for (let index = 0; index < 50; index++) {
    const sampleTime = Math.max(0, end - 5 + index / 10);
    const sample = signalAt(entry, sampleTime);
    flow.push(sample?.flow ?? null); pressure.push(sample?.pressure ?? null);
    const bin = Math.min(entry.signalBins - 1, Math.floor(sampleTime * 10));
    const value = sampleTime < duration ? entry.previewVolume[bin] : NaN;
    volume.push(Number.isFinite(value) ? value : null);
  }
  return { sourceRate: 10, flow, pressure, volume, ranges };
}

const sceneWarmInFlight = new Map();
const scenePreviewRequests = new Map();
async function warmSceneFloor(hospital, floor) {
  const key=`${hospital}:${floor}`;
  if(sceneWarmInFlight.has(key))return sceneWarmInFlight.get(key);
  const entries = state.entries.filter(entry => {
    const room = fullCatalogByRecording.get(entry.name);
    return room?.hospital_id === hospital && room.floor === floor;
  });
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const entry = entries[next++];
      try {
        await state.segmentStore.ready(entry.name);
        await ensureAt(entry, feedData(entry), Math.min(entry.samples - 1, Math.floor(feedClock(entry) * RATE)));
      } catch (error) { console.warn(`Scene waveform unavailable for ${entry.name}:`, error); }
    }
  }
  const promise=Promise.all([worker(), worker()]).finally(()=>sceneWarmInFlight.delete(key));
  sceneWarmInFlight.set(key,promise);
  return promise;
}

function requestSceneFloor(hospital,floor,quality='preview') {
  const key=`${hospital}:${floor}`,now=performance.now();
  const previous=scenePreviewRequests.get(key);
  scenePreviewRequests.set(key,{hospital,floor,now,lastWarm:previous?.lastWarm||0});
  if(!previous)loadPreviewForFloor(hospital,floor).catch(()=>{});
  if(quality==='full' && (!previous?.lastWarm || now-previous.lastWarm>4000)){
    scenePreviewRequests.get(key).lastWarm=now;
    if(state.segmentStore)warmSceneFloor(hospital,floor).catch(()=>{});
  }
}

function frame(now) {
  if(state.entries.length&&!document.hidden&&now-(state.lastSceneSignalTime||0)>33){
    const scene=els.hospitalScene?.contentWindow;
    const ward=scene?.wardViewer;
    if(ward && !ward.hospitalView && !ward.expandedHospital){
      const rooms=[];
      const floors=[{hospital:ward.activeHospital,floor:ward.activeFloor},
        ...[...scenePreviewRequests.values()].filter(item=>item.hospital===ward.activeHospital&&now-item.now<3000)];
      const seen=new Set();
      for(const item of floors){
        const floorKey=`${item.hospital}:${item.floor}`;
        if(seen.has(floorKey))continue;
        seen.add(floorKey);
      for(let room=1;room<=6;room++){
        const assignment=ward.roomAssignment(item.hospital,item.floor,room);
        if(!assignment?.uc_davis_recording)continue;
        const entry=state.entries.find(item=>item.name===assignment.uc_davis_recording);
        if(!entry)continue;
        const duration=entry.samples/RATE;
        const end=Math.min(feedClock(entry),duration);
        const window=sceneWindow(entry,end);
        if(window)rooms.push({id:assignment.id,recording:entry.name,sourceSeconds:end,
          duration,paused:feedPaused(entry),...window});
      }
      }
      if(rooms.length)scene.postMessage({type:'zebezo-ward-windows',rooms},location.origin);
    }
    state.lastSceneSignalTime=now;
  }
  if(now-state.clockLastDraw>500){
    els.sessionClock.textContent=`Session ${clock(sessionSeconds())} · 1×`;
    refreshHospitalStatuses();
    state.clockLastDraw=now;
  }
  if(!document.hidden&&els.detailOverlay.hidden&&els.directoryOverlay.hidden&&
      now-state.atlasLastDraw>(compactAtlas()?140:90)){
    drawAtlas();state.atlasLastDraw=now;
  }
  if(state.active && state.data){
    if(state.lastFrame){const dt=(now-state.lastFrame)/1000;state.position+=dt*RATE*Number(els.speed.value);}
    state.lastFrame=now;
    if(state.position>=state.data.flow.length){
      state.position=state.data.flow.length-1;state.active=false;state.lastFrame=0;
      els.loadStatus.textContent='Recording complete · Replay feed to restart';
      drawAll();
    }
  }
  if(state.active && state.data){
    const entry=state.selected,data=state.data,number=segmentNumber(entry,state.position);
    if(!data.loadedSegments.has(number)){
      state.active=false;state.lastFrame=0;els.loadStatus.textContent=`Loading segment at ${clock(state.position/RATE)}…`;
      const generation=++state.seekGeneration;
      ensureSegment(entry,data,number).then(()=>{
        if(state.selected===entry&&state.data===data&&state.seekGeneration===generation){
          state.active=true;state.lastFrame=0;
          els.loadStatus.textContent=`Ready · playing at ${els.speed.value}×${data.bad?` · ${data.bad} unparsed line(s)`:''}`;
          drawAll();
        }
      }).catch(error=>{if(state.selected===entry&&state.seekGeneration===generation)
        els.loadStatus.textContent=`Segment load failed: ${error.message}`;});
    }else{
      const next=number+1,boundary=state.segmentStore.index.feeds[entry.name].segments[number].coreEnd;
      if(next<state.segmentStore.index.feeds[entry.name].segments.length&&
         boundary-state.position<10*RATE&&!data.loadedSegments.has(next)&&
         !data.loadingSegments.has(next)&&!data.failedSegments.has(next)){
        ensureSegment(entry,data,next).catch(error=>{
          if(state.selected===entry)els.loadStatus.textContent=`Next segment unavailable: ${error.message}`;
        });
      }
      if(!els.waveform.hidden&&!els.detailOverlay.hidden&&now-state.lastDraw>(compactAtlas()?65:30)){drawAll();state.lastDraw=now;}
    }
  }
  const playback=state.unitPlayback;
  if(playback?.active){
    if(playback.lastFrame)playback.elapsed+=(now-playback.lastFrame)/1000;
    playback.lastFrame=now;
    if(now-playback.lastDraw>(compactAtlas()?120:80)){drawUnitPlayback();playback.lastDraw=now;}
    if(playback.members.every(entry=>feedElapsed(entry,playback.elapsed)>=entry.samples/RATE)){
      playback.active=false;playback.lastFrame=0;drawUnitPlayback();
    }
  }
  if(state.voices.size)syncAudio();
  requestAnimationFrame(frame);
}
function pointerX(event,canvas) {const r=canvas.getBoundingClientRect();return event.clientX-r.left;}
function atlasWorldAt(clientX,clientY){
  const box=els.atlas.getBoundingClientRect(),dpr=els.atlas.width/box.width;
  const x=(clientX-box.left)*dpr,y=(clientY-box.top)*dpr;
  const {top,bottom}=atlasInsets(dpr),centerY=top+(els.atlas.height-top-bottom)/2;
  const scale=atlasScale(els.atlas.width,els.atlas.height);
  return {x:state.atlasCenter.x+(x-els.atlas.width/2)/scale,y:state.atlasCenter.y+(y-centerY)/scale};
}
function zoomAtlasAt(clientX,clientY,nextZoom,anchor=atlasWorldAt(clientX,clientY)){
  state.atlasZoom=Math.max(.5,Math.min(8,nextZoom));
  const box=els.atlas.getBoundingClientRect(),dpr=els.atlas.width/box.width;
  const x=(clientX-box.left)*dpr,y=(clientY-box.top)*dpr;
  const {top,bottom}=atlasInsets(dpr),centerY=top+(els.atlas.height-top-bottom)/2;
  const scale=atlasScale(els.atlas.width,els.atlas.height);
  state.atlasCenter.x=anchor.x-(x-els.atlas.width/2)/scale;
  state.atlasCenter.y=anchor.y-(y-centerY)/scale;
  drawAtlas();
}
function atlasHit(event){
  const box=els.atlas.getBoundingClientRect(),x=(event.clientX-box.left)*els.atlas.width/box.width,y=(event.clientY-box.top)*els.atlas.height/box.height;
  const dpr=els.atlas.width/box.width;
  const scale=atlasScale(els.atlas.width,els.atlas.height);
  for(const p of state.projected.filter(item=>item.node.kind==='hospital')){
    const half=state.layout.hospitalHalf*scale;
    const labelWidth=scale>=.5?2*half:Math.max(72*dpr,Math.min(2*half,170*dpr));
    const labelTop=scale>=.5?p.y-half:p.y-half-20*dpr;
    const labelBottom=scale>=.5?p.y-half+(6+state.layout.hospitalHeader)*scale:p.y-half;
    if(Math.abs(x-p.x)<=labelWidth/2&&y>=labelTop&&y<=labelBottom)return p.node;
  }
  let nearest=null,best=Infinity,bestPriority=-1;
  for(const p of state.projected){
    const side=p.node.kind==='unit'||p.node.kind==='open-floor'?state.layout.unitHalf*2*scale:
      p.node.kind==='root'?state.layout.rootHalf*2*scale:atlasNodeSide(p.node,scale,dpr);
    const half=side/2+4*dpr,dx=Math.abs(x-p.x),dy=Math.abs(y-p.y);
    if((p.node.kind==='unit'||p.node.kind==='open-floor')&&dx<=half&&
       y>=p.y-state.layout.unitTop*scale-4*dpr&&
       y<=p.y+state.layout.unitHalf*scale+4*dpr){
      const priority=2,distance=Math.hypot(dx,dy);
      if(priority>bestPriority||priority===bestPriority&&distance<best){
        nearest=p.node;best=distance;bestPriority=priority;
      }
      continue;
    }
    if(dx>half||dy>half)continue;
    const distance=Math.hypot(dx,dy);
    const priority={root:0,hospital:1,unit:2,'open-floor':2,room:3,'open-room':3}[p.node.kind];
    if(priority>bestPriority||priority===bestPriority&&distance<best){nearest=p.node;best=distance;bestPriority=priority;}
  }
  return nearest;
}
