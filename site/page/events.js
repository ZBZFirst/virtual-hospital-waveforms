function setupEvents() {
  const mobileMenuMedia=matchMedia('(max-width:700px)');
  let mobileMenuOpen=false,sceneTimeout=null;
  function setMobileMenu(open,restoreFocus=false){
    mobileMenuOpen=mobileMenuMedia.matches&&open;
    els.mobileMenu.classList.toggle('open',mobileMenuOpen);
    els.mobileMenu.inert=mobileMenuMedia.matches&&!mobileMenuOpen;
    els.mobileMenu.setAttribute('aria-hidden',String(mobileMenuMedia.matches&&!mobileMenuOpen));
    els.mobileMenuBackdrop.hidden=!mobileMenuOpen;
    els.mobileMenuToggle.setAttribute('aria-expanded',String(mobileMenuOpen));
    if(mobileMenuOpen)els.mobileMenuClose.focus();
    else if(restoreFocus)els.mobileMenuToggle.focus();
  }
  setMobileMenu(false);
  els.mobileMenuToggle.onclick=()=>setMobileMenu(true);
  els.mobileMenuClose.onclick=()=>setMobileMenu(false,true);
  els.mobileMenuBackdrop.onclick=()=>setMobileMenu(false,true);
  els.mobileMenu.addEventListener('click',event=>{if(event.target.closest('.atlas-buttons button'))setMobileMenu(false);});
  mobileMenuMedia.addEventListener('change',()=>setMobileMenu(false));
  function sceneLoading(status,detail=''){
    clearTimeout(sceneTimeout);
    if(status==='ready'){els.sceneLoading.hidden=true;return;}
    els.sceneLoading.hidden=false;
    els.sceneLoadingTitle.textContent=status==='error'?'Could not load 3D hospitals':status==='slow'?'Still loading 3D hospitals…':'Loading 3D hospitals…';
    els.sceneLoadingMessage.textContent=detail||'Preparing the hospital scene. Recording transfer progress appears below.';
    els.retryScene.hidden=status==='loading';
    if(status==='loading')sceneTimeout=setTimeout(()=>sceneLoading('slow','The scene is taking longer than expected. You can reload it while recording transfers continue.'),20000);
  }
  sceneLoading('loading');
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==els.hospitalScene.contentWindow)return;
    if(event.data?.type==='zebezo-scene-status')sceneLoading(event.data.status,event.data.message);
    if(event.data?.type==='zebezo-scene-location')syncSceneLocation(event.data);
    if(event.data?.type==='zebezo-open-recording'){
      const entry=state.entries.find(item=>item.name===event.data.recording);
      if(entry)selectEntry(entry);
      else state.pendingSceneRecording=event.data.recording;
    }
  });
  els.hospitalScene.addEventListener('load',()=>els.hospitalScene.contentWindow?.postMessage({type:'zebezo-scene-action',action:'status'},location.origin));
  els.hospitalScene.addEventListener('error',()=>sceneLoading('error','The embedded 3D scene did not load.'));
  els.retryScene.onclick=()=>{
    sceneLoading('loading');
    const url=new URL(els.hospitalScene.src);url.searchParams.set('retry',String(Date.now()));els.hospitalScene.src=url.href;
  };
  els.flowDirection.onchange=()=>{state.reverseFlow=els.flowDirection.value==='reverse';drawAtlas();};
  els.muteAll.onclick=muteAll;
  $('muteAllDetail').onclick=muteAll;
  els.speaker.onclick=async()=>{
    const entry=state.selected;if(!entry)return;
    if(state.voices.has(entry.name))disableVoice(entry.name);
    else try{await enableVoice(entry);}catch(error){els.loadStatus.textContent=`Audio unavailable: ${error.message}`;}
  };
  window.addEventListener('pagehide',()=>{stopPatientAudio();state.audio?.context.close();state.audio=null;});
  $('openDirectory').onclick=openDirectory;
  $('openHospitals').onclick=()=>showHospitals();
  $('openBedManager').onclick=showBedManager;
  $('viewOnCube').onclick=()=>{if(state.unitPlayback)unitCubes.open(state.unitPlayback.unit);};
  els.retrySegments.onclick=()=>{
    const names=state.segmentStore?.stats().failures.map(item=>item.name)||[];
    if(names.length){els.retrySegments.disabled=true;state.segmentStore.warmFirst(names)
      .finally(()=>{els.retrySegments.disabled=false;});}
  };
  $('closeDirectory').onclick=closeDirectory;
  $('closeDetail').onclick=closeDetails;
  els.directoryOverlay.addEventListener('pointerdown',e=>{if(e.target===els.directoryOverlay)closeDirectory();});
  els.detailOverlay.addEventListener('pointerdown',e=>{if(e.target===els.detailOverlay)closeDetails();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(unitCubes.grid.windows.size)unitCubes.grid.closeAll();else if(!$('unitCubeOverlay').hidden)unitCubes.close();else if(!els.detailOverlay.hidden)closeDetails();else if(!els.directoryOverlay.hidden)closeDirectory();else if(mobileMenuOpen)setMobileMenu(false,true);}});
  window.addEventListener('resize',()=>{if(state.unitPlayback)drawUnitPlayback();else document.querySelectorAll('.mini-pair').forEach(canvas=>drawMiniPair(canvas,canvas._preview));});
  els.search.addEventListener('input',()=>{state.filter=els.search.value.trim().toLowerCase();listEntries();drawAtlas();});
  const sceneAction=action=>document.getElementById('hospitalScene')?.contentWindow?.postMessage({type:'zebezo-scene-action',action},location.origin);
  $('resetAtlas').onclick=()=>{state.atlasCenter={x:0,y:0};state.atlasZoom=defaultAtlasZoom();drawAtlas();sceneAction('reset');};
  const zoomButton=(factor)=>{
    const box=els.atlas.getBoundingClientRect();
    zoomAtlasAt(box.left+box.width/2,box.top+box.height/2,state.atlasZoom*factor);
  };
  $('zoomIn').onclick=()=>{zoomButton(1.35);sceneAction('zoom-in');};
  $('zoomOut').onclick=()=>{zoomButton(1/1.35);sceneAction('zoom-out');};
  els.atlas.addEventListener('pointerdown',e=>{
    els.atlas.setPointerCapture(e.pointerId);
    state.atlasPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(state.atlasPointers.size===1){
      state.atlasDrag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};
    }else if(state.atlasPointers.size===2){
      const [a,b]=[...state.atlasPointers.values()],midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
      state.atlasPinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:state.atlasZoom,
        anchor:atlasWorldAt(midX,midY)};
      state.atlasDrag=null;
    }
  });
  els.atlas.addEventListener('pointermove',e=>{
    if(state.atlasPointers.has(e.pointerId)){
      state.atlasPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    }
    if(state.atlasPinch&&state.atlasPointers.size>=2){
      const [a,b]=[...state.atlasPointers.values()],midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
      const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      zoomAtlasAt(midX,midY,state.atlasPinch.zoom*distance/state.atlasPinch.distance,state.atlasPinch.anchor);
      return;
    }
    if(state.atlasDrag?.id===e.pointerId){
      const drag=state.atlasDrag,dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>7)drag.moved=true;
      const scale=atlasScale(els.atlas.width,els.atlas.height),dpr=els.atlas.width/els.atlas.clientWidth;
      state.atlasCenter.x-=dx*dpr/scale;state.atlasCenter.y-=dy*dpr/scale;
      drag.x=e.clientX;drag.y=e.clientY;drawAtlas();return;
    }
    if(e.pointerType!=='mouse')return;
    const hit=atlasHit(e);
    if(hit!==state.hover){state.hover=hit;els.atlasStatus.textContent=hit?.kind==='room'?`Unit ${hit.unit} · Room ${hit.room}`:
      hit?.kind==='unit'?`Unit ${hit.unit} nursing station`:
      hit?.kind==='open-floor'||hit?.kind==='open-room'?`Floor ${hit.floor_level} · Open`:
      hit?.kind==='hospital'?hit.label:hit?'Hospital database':'';drawAtlas();}
  });
  els.atlas.addEventListener('pointerup',e=>{
    const tapped=state.atlasPointers.size===1&&state.atlasDrag?.id===e.pointerId&&!state.atlasDrag.moved;
    state.atlasPointers.delete(e.pointerId);
    if(state.atlasPointers.size===1){
      const [id,point]=[...state.atlasPointers.entries()][0];
      state.atlasDrag={id,x:point.x,y:point.y,startX:point.x,startY:point.y,moved:true};
    }else state.atlasDrag=null;
    state.atlasPinch=null;
    if(tapped){
      const hit=atlasHit(e);
      if(hit){
        e.preventDefault();
        setTimeout(()=>{
          if(hit.kind==='root')showHospitals();
          else if(hit.kind==='hospital')hit.hospital_id?showHospital(hit.hospital_id):showUnassignedUnits(hit.unit_ids);
          else if(hit.kind==='unit')showUnit(hit.unit);
          else if(hit.kind==='open-floor'||hit.kind==='open-room')showHospital(hit.hospital_id,hit.floor_level);
          else if(hit.entry)selectEntry(hit.entry);
          else if(hit.kind==='room')showUnit(hit.unit);
        },0);
      }
    }
  });
  els.atlas.addEventListener('pointercancel',e=>{
    state.atlasPointers.delete(e.pointerId);state.atlasPinch=null;state.atlasDrag=null;
  });
  els.atlas.addEventListener('pointerleave',()=>{if(!state.atlasDrag){state.hover=null;els.atlasStatus.textContent='';drawAtlas();}});
  els.atlas.addEventListener('wheel',e=>{e.preventDefault();zoomAtlasAt(e.clientX,e.clientY,state.atlasZoom*(e.deltaY<0?1.15:.87));},{passive:false});
  els.start.onclick=()=>{setPosition(0);state.active=true;state.lastFrame=0;};
  els.play.onclick=()=>{if(state.data&&state.position<state.data.flow.length-1){state.active=true;state.lastFrame=0;}};
  els.pause.onclick=()=>{state.seekGeneration++;state.active=false;state.lastFrame=0;drawAll();};
  els.stop.onclick=()=>{state.seekGeneration++;state.active=false;state.lastFrame=0;setPosition(0);};
  $('room-replay-feed').onclick=()=>{
    if(!state.selected)return;
    replayFeed(state.selected);
    window.RoomLive.selectFeed(state.selected,0);
    setRoomMode('live');
    window.RoomLive.start();
  };
  els.scrub.addEventListener('input',()=>{if(state.data){state.lastFrame=0;setPosition(Number(els.scrub.value)/1000*(state.data.flow.length-1),150);}});
  els.window.addEventListener('change',drawAll);
  $('room-feed-review').addEventListener('click',()=>setRoomMode('review'));
  $('room-feed-live').addEventListener('click',()=>setRoomMode('live'));
  document.querySelector('.room-optional').addEventListener('toggle',drawAll);
  els.volumeToggle.addEventListener('change',()=>{els.volumeCard.hidden=!els.volumeToggle.checked;drawAll();});
  els.pathAxis.addEventListener('change',()=>{els.pathLabel.textContent=els.pathAxis.value==='volume'?'time · flow · calculated volume':'time · flow · pressure';drawPath();});
  els.overview.addEventListener('pointerdown',e=>{if(!state.data)return;els.overview.setPointerCapture(e.pointerId);const ratio=Math.max(0,Math.min(1,pointerX(e,els.overview)/els.overview.clientWidth));setPosition(ratio*(state.data.flow.length-1),150);});
  els.overview.addEventListener('pointermove',e=>{if(e.buttons!==1||!state.data)return;const ratio=Math.max(0,Math.min(1,pointerX(e,els.overview)/els.overview.clientWidth));setPosition(ratio*(state.data.flow.length-1),150);});
  els.path.addEventListener('pointerdown',e=>{els.path.setPointerCapture(e.pointerId);state.pathDrag={x:e.clientX,y:e.clientY};});
  els.path.addEventListener('pointermove',e=>{if(!state.pathDrag)return;state.pathYaw+=(e.clientX-state.pathDrag.x)*.008;state.pathPitch=Math.max(-1.4,Math.min(1.4,state.pathPitch+(e.clientY-state.pathDrag.y)*.008));state.pathDrag={x:e.clientX,y:e.clientY};drawPath();});
  els.path.addEventListener('pointerup',()=>{state.pathDrag=null;});
  new ResizeObserver(()=>{drawAtlas();drawAll();}).observe(document.querySelector('main'));
}
let floorWarmTimer=null;
function syncSceneLocation(locationData){
  state.lastSceneLocation=locationData;
  clearTimeout(floorWarmTimer);
  if(locationData.view!=='floor'||!state.entries.length)return;
  const {hospital,floor}=locationData;
  loadPreviewForFloor(hospital,floor).catch(()=>{});
  floorWarmTimer=setTimeout(()=>{
    if(!state.segmentStore)return;
    const names=state.entries.filter(entry=>{
      const room=fullCatalogByRecording.get(entry.name);
      return room?.hospital_id===hospital&&room.floor===floor;
    }).map(entry=>entry.name);
    state.segmentStore.warmFirst(names,2).catch(()=>{});
  },900);
}
