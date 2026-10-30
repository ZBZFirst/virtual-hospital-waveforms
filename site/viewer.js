async function init() {
  els.window.value=String(DEFAULT_WINDOW_SECONDS);
  mountRoomAxisControls();
  window.RoomAnalysis.mount(sample=>setPosition(sample),()=>windowBounds());
  window.RoomLive.mount({ready:entry=>state.segmentStore.ready(entry.name),data:feedData,replay:replayFeed,advance:advanceFeed,
    ensure:(entry,data,sample)=>ensureAt(entry,data,sample),
    segment:(entry,sample)=>state.segmentStore.segment(entry.name,segmentNumber(entry,sample)),
    sequence:name=>breathSequenceMap?.[name],analyze:analyzeBrowser});
  unitCubes=new UnitCubes($('unitCubeOverlay'),{
    gridRoot:$('gridMonitor'),sessionSeconds,feedElapsed,replayFeed,
    unitNumbers:()=>state.model.unitDefinitions.map(unit=>unit.legacy_number),
    unitEntries:number=>state.units.get(number)||[],allEntries:()=>state.entries,
    loadRoom:async(entry,sample)=>{
      await state.segmentStore.ready(entry.name);
      const data=feedData(entry);
      await ensureAt(entry,data,Math.max(0,Math.min(entry.samples-1,sample)));
      return data;
    },
    ensureRoom:(entry,data,sample)=>ensureAt(entry,data,sample),
    hasRoomSample:(entry,data,sample)=>data.loadedSegments.has(segmentNumber(entry,sample)),
    openSingle:entry=>selectEntry(entry),
    onClose:()=>$('viewOnCube').focus()
  });
  setupEvents();
  setRoomMode(new URLSearchParams(location.search).get('roomView')==='review'?'review':'live');
  try {
    const [manifest,campus]=await Promise.all([
      fetch('manifest.json').then(response=>{if(!response.ok)throw Error(`Manifest HTTP ${response.status}`);return response.json();}),
      fetch('scene3d/campus_manifest_full_catalog.json').then(response=>{if(!response.ok)throw Error(`Campus HTTP ${response.status}`);return response.json();})
    ]);
    state.entries=manifest.entries;
    fullCatalogByRecording=new Map(campus.rooms.filter(room=>room.uc_davis_recording).map(room=>[room.uc_davis_recording,room]));
    if(fullCatalogByRecording.size!==state.entries.length || state.entries.some(entry=>!fullCatalogByRecording.has(entry.name)))
      throw new Error('Full campus registry does not cover every UC Davis recording');
    if(breathSequenceMap)for(const entry of state.entries)
      if(breathSequenceMap[entry.name])entry.breaths=breathSequenceMap[entry.name].length;
    state.model=HospitalSystem.createModel(state.entries,manifest.sampleRate);
    let saved=null;
    try{saved=localStorage.getItem(LAYOUT_KEY)??LEGACY_LAYOUT_KEYS.map(key=>localStorage.getItem(key)).find(value=>value!==null)??null;}
    catch(error){state.layoutIssues=[`Browser storage unavailable: ${error.message}`];}
    const restored=HospitalSystem.loadState(saved,state.model);
    state.organization=restored.state;state.layoutIssues.push(...restored.issues);
    if(saved!==null&&restored.migrated)saveOrganization();
    projectPlacements();
    els.datasetStats.textContent=`${state.entries.length} UC Davis feeds · 24 MGH feeds · 5 hospitals · 180 rooms`;
    state.atlasZoom=defaultAtlasZoom();
    showHospitals(false);requestAnimationFrame(frame);
    function openRoute(){
      if(location.hash.startsWith('#cube=')){
        const unit=Number(new URLSearchParams(location.hash.slice(1)).get('cube'));
        if(Number.isInteger(unit)&&state.units.has(unit)){showUnit(unit);unitCubes.open(unit);}
        return;
      }
      if(location.hash.startsWith('#unit=')){
        const unit=Number(new URLSearchParams(location.hash.slice(1)).get('unit'));
        if(Number.isInteger(unit)&&state.units.has(unit))showUnit(unit);
        return;
      }
      if(!location.hash.startsWith('#hospital='))return;
      const route=new URLSearchParams(location.hash.slice(1));
      const hospitalId=route.get('hospital'),level=Number(route.get('floor')),room=Number(route.get('room'));
      if(state.organization.hospitalDefinitions.some(item=>item.hospital_id===hospitalId)){
        const validLevel=Number.isInteger(level)&&level>=1&&level<=4?level:null;
        const validRoom=Number.isInteger(room)&&room>=1&&room<=8?room:null;
        if(route.get('view')==='feed'&&validLevel&&validRoom)openVirtualRoom(hospitalId,validLevel,validRoom);
        else showHospital(hospitalId,validLevel,validRoom);
      }
    }
    let renderPending=false,latest=null;
    const onProgress=stats=>{
      latest=stats;if(renderPending)return;renderPending=true;
      requestAnimationFrame(()=>{renderPending=false;renderSegmentProgress(latest);});
    };
    state.segmentStore=FeedIndexStore.create(state.entries,RECORDING_BASE,{onProgress,localPreview:LOCAL_ROOM_PREVIEW});
    renderSegmentProgress(state.segmentStore.stats());
    if(state.lastSceneLocation)syncSceneLocation(state.lastSceneLocation);
    if(state.pendingSceneRecording){
      const entry=state.entries.find(item=>item.name===state.pendingSceneRecording);
      state.pendingSceneRecording=null;
      if(entry)selectEntry(entry);
    }
    openRoute();window.addEventListener('hashchange',openRoute);
  } catch(err) {els.datasetStats.textContent=`Could not load manifest: ${err.message}. Open through the local HTTP server.`;}
}
let breathSequencePromise=null;
function loadBreathSequences(){
  breathSequencePromise ??= fetch('breath-sequence.json').then(response=>{
    if(!response.ok)throw Error(`Breath index HTTP ${response.status}`);
    return response.json();
  }).then(map=>{
    breathSequenceMap=map;
    window.RoomAnalysis.setSequenceMap(map);
    for(const entry of state.entries)if(map[entry.name])entry.breaths=map[entry.name].length;
    if(state.selected)renderRoomHeader(state.selected);
    drawAll();
  }).catch(error=>{breathSequencePromise=null;console.warn('Breath sequence index unavailable:',error);});
  return breathSequencePromise;
}
function setupStreamerMode(){
  const panel=$('streamerWindow'),video=$('streamerVideo'),toggle=$('streamerToggle');
  const status=$('streamerStatus'),retry=$('streamerRetry'),mirror=$('streamerMirror');
  const handle=$('streamerDragHandle');
  let stream=null,generation=0,drag=null;
  function stopCamera(){
    generation++;
    if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
    video.srcObject=null;
  }
  function close(){
    stopCamera();panel.hidden=true;retry.hidden=true;
    toggle.textContent='Streamer mode';toggle.setAttribute('aria-pressed','false');
    status.textContent='Camera is off';
  }
  async function open(){
    if(!panel.hidden && stream)return;
    panel.hidden=false;toggle.textContent='Stop streamer mode';toggle.setAttribute('aria-pressed','true');
    status.textContent='Requesting camera…';retry.hidden=true;
    const request=++generation;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires HTTPS or localhost.');
      const acquired=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      if(request!==generation){for(const track of acquired.getTracks())track.stop();return;}
      stream=acquired;video.srcObject=stream;
      await video.play();
      status.textContent='Camera active · drag title to move · resize corner';
    }catch(error){
      if(request!==generation)return;
      stopCamera();
      status.textContent=error.name==='NotAllowedError'?'Camera permission was denied.':
        error.name==='NotFoundError'?'No webcam was found.':error.message||'Could not start camera.';
      retry.hidden=false;
    }
  }
  toggle.addEventListener('click',()=>{
    if(panel.hidden)open();else close();
  });
  $('streamerClose').addEventListener('click',close);
  retry.addEventListener('click',open);
  mirror.addEventListener('click',()=>{
    const unmirrored=video.classList.toggle('unmirrored');
    mirror.textContent=unmirrored?'Mirror off':'Mirror on';
    mirror.setAttribute('aria-pressed',String(!unmirrored));
  });
  handle.addEventListener('pointerdown',event=>{
    if(event.target.closest('button'))return;
    const rect=panel.getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    panel.style.left=`${rect.left}px`;panel.style.top=`${rect.top}px`;panel.style.right='auto';
    handle.setPointerCapture(event.pointerId);panel.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const left=Math.max(0,Math.min(innerWidth-panel.offsetWidth,drag.left+event.clientX-drag.x));
    const top=Math.max(0,Math.min(innerHeight-panel.offsetHeight,drag.top+event.clientY-drag.y));
    panel.style.left=`${left}px`;panel.style.top=`${top}px`;
  });
  function endDrag(event){if(drag?.id===event.pointerId){drag=null;panel.classList.remove('is-dragging');}}
  handle.addEventListener('pointerup',endDrag);
  handle.addEventListener('pointercancel',endDrag);
  addEventListener('pagehide',stopCamera);
}
setupStreamerMode();
init();
