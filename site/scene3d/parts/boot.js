async function boot() {
  let catalogConfig;
  [meta, campusManifest, catalogConfig] = await Promise.all([
    fetch('./scene_meta.json').then(r => r.json()),
    fetch('./campus_manifest_full_catalog.json?v=20261030-mask-pipeline1').then(r=>r.json()),
    fetch('./catalog_config.json?v=20261030-mask-pipeline1').then(r=>r.json()),
  ]);
  telemetryBase = new URL(catalogConfig.mgh_base,location.href).href;
  modelBase = new URL(catalogConfig.model_base || './',location.href).href;
  if(campusManifest.hospitals.length!==5 || campusManifest.rooms.length!==180 || new Set(campusManifest.rooms.map(r=>r.id)).size!==180)
    throw Error('Full catalog must define five hospitals and 180 unique room IDs');
  roomById=prepareSimulationRooms(campusManifest);
  const loader = new GLTFLoader();
  modelLoader = loader;
  const bootLoad = beginModelLoad('boot','Loading 3D campus',['elevator_cab.glb',meta.hospital_shell.file]);
  const [elevatorAsset, shellAsset] = await Promise.all([
    loadTrackedModel('elevator_cab.glb'),
    loadTrackedModel(meta.hospital_shell.file),
  ]);
  hospitalShell=new THREE.Group();
  hospitalShell.name='Five hospital campus';
  for(const hospital of campusManifest.hospitals){
    const building=shellAsset.scene.clone(true);
    building.name=hospital.name;
    building.userData.hospitalId=hospital.id;
    styleHospitalShell(building,hospital.name);
    building.position.set(hospital.position_x_m,0,hospital.position_z_m);
    hospitalShell.add(building);
    hospitalStates.set(hospital.id,{floors:Array(meta.floors.length).fill(null),doorHinges:[],doorAngles:Array(6).fill(0),doorTargets:Array(6).fill(0),telemetryReady:Array(6).fill(false),floorRecords:Array(6).fill(null)});
  }
  hospitalShell.visible=false;
  scene.add(hospitalShell);
  activateHospital('A');
  cabGroup = elevatorAsset.scene;
  scene.add(cabGroup);
  document.querySelector('#cubeAuto').classList.add('active');
  camera.position.set(22, 35, 31);
  controls.target.set(0, 0, 0);
  controls.update();
  tablet = makeTablet();
  finishModelLoad(bootLoad);
  if(new URLSearchParams(location.search).get('view')==='hospital')showHospitalView();
  else await setFloor(1);
  setInterval(()=>{if(floors[activeFloor-1] && !hospitalView)ensureTelemetryCaches();}, 1000);
  performanceFrames = 0;
  performanceWindowStart = performance.now();

  window.wardViewer = { scene, camera, renderer, controls, setFloor, setRoom, selectHospital, overview, showHospitalView, hospitalShell, applyTourFrame, applyUnitTourTime, buildUnitWalkTour, renderUnitTourFrame, meta, campusManifest, cabGroup, breathers, ventRecords, tablet, selectTabletRoom, cycleTabletRoom,
    get manifest(){return manifest;},
    get tour(){return tour;},
    roomAssignment,
    get ucVentCount(){return ucVentByRoom.size;},
    get grandCube(){return grandCube;},
    get cubesByHospital(){return cubesByHospital;},
    get floors(){return floors;},
    get activeHospital(){return activeHospital;},
    get activeFloor(){return activeFloor;},
    get doorHinges(){return doorHinges;},
    get doorAngles(){return doorAngles;},
    get hospitalView() { return hospitalView; },
    get expandedHospital(){return expandedHospital;},
    get expansionFinished(){return Boolean(expansion?.finished);},
    get unitTour() { return unitTour; },
    get unitTourTime() { return unitTourTime; },
    get tabletSelection() { return {floor:activeFloor,room:tabletRoom,manual:tabletManualRoom}; },
    get performance() { return { fps: measuredFps, renderScale }; } };
  reportSceneStatus('ready');
  reportSceneLocation(hospitalView?'campus':expandedHospital?'expanded':'floor');
  setTimeout(()=>loadFloorTemplate(1).catch(error=>console.warn('First floor model prefetch unavailable:',error)),250);
  loadCameraTour()
    .catch(error=>console.warn('Camera tour unavailable:',error));
}

window.addEventListener('message',event=>{
  if(!embedded || event.origin!==location.origin || event.source!==parent)return;
  if(event.data?.type==='zebezo-ward-windows'){updateUcVentWindow(event.data);return;}
  if(event.data?.type!=='zebezo-scene-action')return;
  const action=event.data.action;
  if(action==='status'){
    reportSceneStatus(window.wardViewer?'ready':'loading');
    if(window.wardViewer)reportSceneLocation(hospitalView?'campus':expandedHospital?'expanded':'floor');
  }
  else if(action==='reset')showHospitalView();
  else if(action==='zoom-in' || action==='zoom-out'){
    cameraMove=null;
    const direction=camera.position.clone().sub(controls.target).multiplyScalar(action==='zoom-in'?0.75:1.35);
    camera.position.copy(controls.target).add(direction);
    controls.update();
  }
  else if(action==='open-vital-room'){
    openVitalRoomFromPage(event.data.roomId).catch(error=>showError(`Vital room handoff failed: ${error}`));
  }
});
boot().catch(err=>{showError(String(err?.stack || err));reportSceneStatus('error',String(err?.message || err));});
