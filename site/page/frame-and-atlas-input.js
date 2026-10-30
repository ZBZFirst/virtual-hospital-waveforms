function frame(now) {
  if(state.signals&&!document.hidden&&now-(state.lastSceneSignalTime||0)>100){
    const scene=els.hospitalScene?.contentWindow;
    const ward=scene?.wardViewer;
    if(ward && !ward.hospitalView && !ward.expandedHospital){
      const rooms=[];
      for(let room=1;room<=6;room++){
        const assignment=ward.roomAssignment(ward.activeHospital,ward.activeFloor,room);
        if(!assignment?.uc_davis_recording)continue;
        const entry=state.entries.find(item=>item.name===assignment.uc_davis_recording);
        if(!entry)continue;
        const duration=entry.samples/RATE;
        const end=feedClock(entry)%duration;
        const flow=[],pressure=[];
        for(let index=0;index<50;index++){
          const sampleTime=((end-5+index/10)%duration+duration)%duration;
          const sample=signalAt(entry,sampleTime);
          flow.push(sample?.flow??null);pressure.push(sample?.pressure??null);
        }
        rooms.push({id:assignment.id,recording:entry.name,sourceSeconds:end,flow,pressure});
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
