let sharedPatientAssets = null;
let simulationSignTexture = null;
const sharedFloorMeta=()=>meta.floors[meta.shared_floor_template_level-1];
function makeSimulationRoomSign() {
  if(!simulationSignTexture){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const c=canvas.getContext('2d');
    c.fillStyle='#f4eee1';c.fillRect(0,0,1024,256);
    c.strokeStyle='#173d49';c.lineWidth=16;c.strokeRect(8,8,1008,240);
    c.fillStyle='#173d49';c.font='bold 94px system-ui, sans-serif';
    c.textAlign='center';c.textBaseline='middle';c.fillText('Simulation Room',512,132);
    simulationSignTexture=new THREE.CanvasTexture(canvas);
    simulationSignTexture.colorSpace=THREE.SRGBColorSpace;
  }
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.08,.27),
    new THREE.MeshBasicMaterial({map:simulationSignTexture,side:THREE.DoubleSide}));
  sign.name='Simulation Room door sign';
  sign.position.set(.62,1.12,-.065);
  return sign;
}
function configureRoomEquipment(bedRig, overlay, assignment, room) {
  const hasVentilator = Boolean(assignment.uc_davis_recording);
  const hasTelemetry = Boolean(assignment.telemetry_record);
  const pad = String(room).padStart(2, '0');
  let cart = null;
  bedRig.traverse(object => {
    if (object.name.includes(`Room_${pad}_ventilator_cart`)) cart = object;
    if (!hasVentilator && /(?:flexible_breathing_circuit|circuit_+patient_end_reducer|breathing_circuit_ventilator_anchor)/i.test(object.name))
      object.visible = false;
  });
  if (!cart) throw Error(`${assignment.id}: ventilator cart missing`);
  if (!hasVentilator) cart.position.set(2.45, cart.position.y, -1.85);

  let telemetryRoot = overlay.parent;
  while (telemetryRoot && !telemetryRoot.name.includes('MOVE_MONITOR_ASSET')) telemetryRoot = telemetryRoot.parent;
  if (!telemetryRoot) throw Error(`${assignment.id}: telemetry monitor root missing`);
  if (!hasTelemetry) {
    telemetryRoot.traverse(object => {
      if (/(?:wire|electrode|line_hub|electrical_cable|fluid_tubing|transducer|splitter|ECG_trunk|ECG_connector|_trace)/i.test(object.name))
        object.visible = false;
    });
    const corner = new THREE.Vector3(-2.45, 0, -1.85).applyQuaternion(bedRig.quaternion);
    telemetryRoot.position.copy(bedRig.position).add(corner);
  }
}
function loadFloorTemplate() {
  const path=sharedFloorMeta().file;
  if(!floorTemplates.has(path))floorTemplates.set(path,loadTrackedModel(path).catch(error=>{floorTemplates.delete(path);throw error;}));
  return floorTemplates.get(path);
}
function loadRoofTemplate() {
  const path=sharedFloorMeta().roof.file;
  if(!roofTemplates.has(path))roofTemplates.set(path,loadTrackedModel(path).catch(error=>{roofTemplates.delete(path);throw error;}));
  return roofTemplates.get(path);
}
function floorModelPaths(hospitalId, level) {
  const floor = sharedFloorMeta();
  const paths = [floor.file, floor.roof.file];
  if(campusManifest.rooms.some(room=>room.hospital_id===hospitalId&&room.floor===level&&room.patient_id))
    paths.push('patient_lods/patient_001_lod2.glb','patient_lods/patient_001_lod1.glb');
  return paths;
}
async function ensureFloor(hospitalId, level) {
  const state=hospitalStates.get(hospitalId), key=`${hospitalId}:${level}`;
  if (state.floors[level-1]) return state.floors[level-1];
  if (floorLoads.has(key)) return floorLoads.get(key);
  const promise = (async () => {
    const hasPatient=campusManifest.rooms.some(room=>room.hospital_id===hospitalId&&room.floor===level&&room.patient_id);
    if(hasPatient)sharedPatientAssets ??= Promise.all([
      loadTrackedModel('patient_lods/patient_001_lod2.glb'),
      loadTrackedModel('patient_lods/patient_001_lod1.glb'),
    ]).catch(error=>{sharedPatientAssets=null;throw error;});
    const [floorAsset,roofAsset,patientAssets] = await Promise.all([
      loadFloorTemplate(),
      loadRoofTemplate(),
      hasPatient?sharedPatientAssets:Promise.resolve(null),
    ]);
    const [lowPatientAsset,patientAsset] = patientAssets || [];
    const sourceLevel=meta.shared_floor_template_level;
    const group = new THREE.Group();
    const floorGeometry=floorAsset.scene.clone(true);
    floorGeometry.position.y=(level-sourceLevel)*floorHeight;
    group.add(floorGeometry);
    group.name=`Hospital_${hospitalId}_floor_${level}`;
    group.visible = false;
    scene.add(group);
    // The GLB also contains Blender's static trace meshes. The browser canvas
    // is the sole waveform layer, so these must not sit over its live image.
    group.traverse(o => {
      if (o.isMesh && /(?:_trace|_rolling_(pressure|flow|calculated_volume))$/i.test(o.name)) o.visible = false;
    });
    let hinge = null;
    group.traverse(o => { if (o.name.includes('Elevator_door_hinge')) hinge = o; });
    if (!hinge) throw Error(`Floor ${level}: elevator landing hinge missing`);
    state.doorHinges[level-1] = { object: hinge, base: hinge.quaternion.clone() };
    const roof = roofAsset.scene.clone(true);
    roof.position.y=(level-sourceLevel)*floorHeight;
    roof.traverse(o=>{if(o.isMesh)o.material=new THREE.MeshBasicMaterial({color:0xc8d3d7,side:THREE.DoubleSide})});
    roof.visible = false;
    scene.add(roof);
    const screens = [], monitors = [], patients = [], ventScreens = [], proxies = [], bedRigs = [], roomDoors = [];
    for (let room = 1; room <= 6; room++) {
      const pad = String(room).padStart(2, '0');
      let hinge = null;
      group.traverse(o => { if(o.name.includes(`Room_${pad}_door_hinge_-_OPEN_DEGREES`))hinge=o; });
      if(!hinge)throw Error(`Floor ${level} room ${room}: door hinge missing`);
      const open = hinge.quaternion.clone();
      const closed = open.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2));
      roomDoors.push({hinge,open,closed});
      const assignment=roomAssignment(hospitalId,level,room);
      if(!assignment)throw Error(`Hospital ${hospitalId} floor ${level} room ${room}: missing room assignment slot`);
      if(room===6 && assignment.simulation_room)hinge.add(makeSimulationRoomSign());
      const occupancyName=level===1?`Room_${pad}_OCCUPANCY_display`:`F${String(level).padStart(2,'0')}_|_Room_${pad}_OCCUPANCY_display`;
      const target=group.getObjectByName(occupancyName);
      if(!target)throw Error(`Hospital ${hospitalId} floor ${level} room ${room}: occupancy group missing`);
      if(!assignment.patient_id){
        target.children.forEach(child=>{if(/^Patient_/i.test(child.name)||/breathing_circuit/i.test(child.name))child.visible=false;});
        group.traverse(object=>{if(new RegExp(`^Room_${pad}_(?:circuit|breathing_circuit)`, 'i').test(object.name))object.visible=false;});
        patients.push(null);
      }
      else{
        const source=patientAsset.scene.getObjectByName('Patient_001');
        if(!source)throw Error('Standalone LOD1 patient missing');
        const clone=source.clone(true);
        clone.name=`Hospital_${hospitalId}_Floor_${level}_Room_${pad}_Patient_LOD1`;
        target.add(clone);patients.push(clone);
      }
      let bedRig = null;
      group.traverse(o => { if (o.name.includes(`Room_${pad}_adjustable_bed_-_SELECT_THIS`)) bedRig = o; });
      if (!bedRig) throw Error(`Floor ${level} room ${room}: adjustable bed rig missing`);
      bedRigs.push(bedRig);
      if(assignment.patient_id){
        const proxy=lowPatientAsset.scene.clone(true);
        setPatientAirwayVisible(patients[patients.length-1],Boolean(assignment.uc_davis_recording));
        setPatientAirwayVisible(proxy,Boolean(assignment.uc_davis_recording));
        proxy.visible=false;bedRig.add(proxy);proxies.push(proxy);
      }else proxies.push(null);
      let overlay=null;
      const overlayPattern=new RegExp(`^F${String(sourceLevel).padStart(2,'0')}_R${pad}_.*_full-feed_screen_overlay$`,'i');
      group.traverse(object=>{if(object.isMesh && overlayPattern.test(object.name))overlay=object;});
      if (!overlay?.isMesh) throw Error(`Floor ${level} room ${room}: telemetry overlay missing from GLB`);
      configureRoomEquipment(bedRig,overlay,assignment,room);
      const screen = makeScreen(room);
      if(!assignment.telemetry_record)markUnassigned(screen,assignment.id,assignment.patient_id?'NO TELEMETRY SOURCE':'UNASSIGNED');
      addPlanarUV(overlay);
      overlay.material = screen.material;
      overlay.renderOrder = 10;
      screen.object = overlay;
      screen.worldBox = new THREE.Box3().setFromObject(overlay);
      screen.center = screen.worldBox.getCenter(new THREE.Vector3());
      screens.push(screen);
      monitors.push(overlay);
      let ventMonitor = null;
      group.traverse(o => { if (o.isMesh && o.name.includes(`Room_${pad}_ventilator_monitor_screen`)) ventMonitor = o; });
      if (!ventMonitor) throw Error(`Floor ${level} room ${room}: ventilator screen missing`);
      const ventScreen = makeVentScreen();
      if(!assignment.ventilator_excerpt_room)markUnassigned(ventScreen,assignment.id,assignment.uc_davis_recording?'UC DAVIS FEED LOADING':assignment.patient_id?'NO VENTILATOR SOURCE':'UNASSIGNED');
      addPlanarUV(ventMonitor);
      ventMonitor.material = ventScreen.material;
      ventMonitor.renderOrder = 8;
      ventScreen.object = ventMonitor;
      ventScreen.worldBox = new THREE.Box3().setFromObject(ventMonitor);
      ventScreens.push(ventScreen);
    }
    patients.forEach((patient, i) => {
      if(!patient)return;
      patient.traverse(o => {
        if (o.isMesh && o.morphTargetInfluences?.length && o.name.includes('Patient_LOD1_skin')) breathers.push({ mesh: o, room: i + 1 });
      });
      rigChestCover(patient, i + 1);
    });
    const badge=makeFloorBadge(level);
    group.add(badge);
    state.floors[level-1] = { group, roof, badge, screens, ventScreens, monitors, patients, proxies, bedRigs, roomDoors, sourceLevel };
    return state.floors[level-1];
  })();
  floorLoads.set(key,promise);
  try { return await promise; }
  catch(error) { floorLoads.delete(key); throw error; }
}
