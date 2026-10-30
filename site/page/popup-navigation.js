function focusUnit(unit){
  const node=state.nodes.find(n=>n.kind==='unit'&&n.unit===unit);
  if(node){state.atlasCenter={x:node.x,y:node.y};state.atlasZoom=2.8;}
}
function stopUnitPlayback(){
  const playback=state.unitPlayback;
  if(!playback)return;
  playback.active=false;
  for(const controller of playback.controllers)controller.abort();
  state.unitPlayback=null;
}
function cancelStream(){
  stopPatientAudio();
  window.RoomLive.pause();
  state.seekGeneration++;
  if(state.seekTimer){clearTimeout(state.seekTimer);state.seekTimer=null;}
  stopUnitPlayback();
  if(state.pending)state.pending.abort();
  state.active=false;state.lastFrame=0;state.position=0;state.selected=null;state.data=null;
  setControls(false);
}
let detailMotionId=0,detailCloseTimer=null;
function resetDetailMotion(){
  detailMotionId++;
  if(detailCloseTimer){clearTimeout(detailCloseTimer);detailCloseTimer=null;}
  els.detailOverlay.classList.remove('detail-enter','detail-exit');
}
function openDetail(){
  resetDetailMotion();
  $('viewOnCube').hidden=!(state.unitPlayback&&els.streamTitle.textContent.endsWith('six patient beds'));
  const roomOpen=!els.waveform.hidden;
  els.streamTitle.classList.toggle('room-title',roomOpen);
  els.streamMeta.classList.toggle('patient-id',roomOpen);
  $('recordingInfo').hidden=!roomOpen;
  $('notesSummary').textContent=roomOpen?'Recording details & data notes':'About this dataset';
  $('recordingNotes').open=false;
  els.directoryOverlay.hidden=true;els.detailOverlay.hidden=false;els.detailOverlay.inert=false;
  const popup=els.detailOverlay.querySelector('.popup');
  popup.scrollTop=0;
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    void popup.offsetWidth;
    els.detailOverlay.classList.add('detail-enter');
  }
  requestAnimationFrame(()=>{if(state.data)drawAll();});
}
function closeDetails(){
  stopPatientAudio();
  window.RoomLive.pause();
  state.active=false;state.lastFrame=0;stopUnitPlayback();
  if(els.detailOverlay.hidden||els.detailOverlay.classList.contains('detail-exit'))return;
  resetDetailMotion();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){els.detailOverlay.hidden=true;return;}
  const motionId=detailMotionId;
  els.detailOverlay.inert=true;
  void els.detailOverlay.querySelector('.popup').offsetWidth;
  els.detailOverlay.classList.add('detail-exit');
  detailCloseTimer=setTimeout(()=>{
    if(detailMotionId!==motionId)return;
    els.detailOverlay.hidden=true;els.detailOverlay.classList.remove('detail-exit');detailCloseTimer=null;
  },320);
}
function openDirectory(){
  stopPatientAudio();
  window.RoomLive.pause();
  state.active=false;state.lastFrame=0;stopUnitPlayback();resetDetailMotion();
  els.detailOverlay.hidden=true;els.detailOverlay.inert=true;els.directoryOverlay.hidden=false;
  $('search').focus();
}
function closeDirectory(){els.directoryOverlay.hidden=true;}
function breadcrumbButton(label,action){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=action;return button;
}
function renderBreadcrumbs(unit,room){
  els.breadcrumbs.replaceChildren();
  const virtualRoom=state.selected&&fullCatalogByRecording.get(state.selected.name);
  if(virtualRoom){
    els.breadcrumbs.append(breadcrumbButton('Virtual campus',()=>{
      closeDetails();els.hospitalScene.contentWindow?.postMessage({type:'zebezo-scene-action',action:'reset'},location.origin);
    }),' › ',`Hospital ${virtualRoom.hospital_id}`,' › ',`Floor ${virtualRoom.floor}`,' › ',`Room ${String(virtualRoom.room).padStart(2,'0')}`);
    return;
  }
  els.breadcrumbs.append(breadcrumbButton('Hospitals',showHospitals),' › ',breadcrumbButton('All feeds database',showRoot));
  const unitId=unit?HospitalSystem.unitId(unit):null;
  const floor=unitId?HospitalSystem.floorForUnit(state.organization,unitId):null;
  const hospital=floor&&state.organization.hospitalDefinitions.find(h=>h.hospital_id===floor.hospital_id);
  if(hospital)els.breadcrumbs.append(' › ',breadcrumbButton(hospital.display_name,()=>showHospital(hospital.hospital_id)));
  if(floor)els.breadcrumbs.append(' › ',breadcrumbButton(`Floor ${floor.level}`,()=>showHospital(floor.hospital_id,floor.level)));
  if(unit){els.breadcrumbs.append(' › ',breadcrumbButton(`Unit ${String(unit).padStart(2,'0')} nursing station`,()=>showUnit(unit)));}
  if(room){els.breadcrumbs.append(' › ',`Room ${String(room).padStart(2,'0')}`);}
}
function databaseCard(title,description,action,empty=false){
  const button=document.createElement('button');button.type='button';button.className='database-card'+(empty?' empty':'');button.disabled=empty;
  const strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=title;small.textContent=description;
  button.append(strong,small);if(action)button.onclick=action;return button;
}
function showRoot(openPopup=true){
  cancelStream();state.hospitalView=null;state.floorLevel=null;state.bedManagerView=false;state.selectedNode=state.nodes[0];state.atlasCenter={x:0,y:0};state.atlasZoom=defaultAtlasZoom();
  els.waveform.hidden=true;els.database.hidden=false;updateSpeaker();els.streamLabel.textContent='ALL-FEEDS DATABASE';
  els.streamTitle.textContent='Virtual hospital catalog';
  els.streamMeta.textContent=`${state.entries.length-HospitalSystem.occupancy(state.organization,state.model).unassigned} occupied virtual rooms · ${state.units.size} six-bed units · ${state.entries.reduce((sum,e)=>sum+e.samples,0).toLocaleString()} samples`;
  els.loadStatus.textContent='Catalog ready';renderBreadcrumbs();
  els.database.replaceChildren();
  const intro=document.createElement('p');intro.className='database-intro';intro.textContent='Each unit has six patient beds, a supply room, and a break room around its nursing station. Select a station to inspect its rooms. One recording occupies each assigned room; the CSVs do not identify patients or real hospital rooms.';
  const grid=document.createElement('div');grid.className='database-grid';
  for(const [unit,members] of state.units){
    const samples=members.reduce((sum,e)=>sum+e.samples,0);
    grid.append(databaseCard(`Unit ${String(unit).padStart(2,'0')} nursing station`,`${members.length} of 6 beds occupied · ${samples.toLocaleString()} samples`,()=>showUnit(unit)));
  }
  els.database.append(intro,grid);listEntries();drawAtlas();if(openPopup)openDetail();
}
