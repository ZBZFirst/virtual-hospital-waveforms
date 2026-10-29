const assert=require('node:assert/strict');
const HospitalLayout=require('./hospital-layout.js');
const HospitalSystem=require('./hospital-system.js');
const manifest=require('./manifest.json');
const model=HospitalSystem.createModel(manifest.entries,manifest.sampleRate);

function inspect(state,entries){
  const layout=HospitalLayout.createHospitalAtlas(entries,model.unitDefinitions,state);
  const hospitals=layout.nodes.filter(node=>node.kind==='hospital');
  const units=layout.nodes.filter(node=>node.kind==='unit');
  const rooms=layout.nodes.filter(node=>node.kind==='room');
  const openFloors=layout.nodes.filter(node=>node.kind==='open-floor');
  const openRooms=layout.nodes.filter(node=>node.kind==='open-room');
  assert.equal(units.length,model.unitDefinitions.length);
  assert.equal(rooms.length,model.unitDefinitions.length*8);
  assert.equal(rooms.filter(node=>node.entry).length,entries.length);
  assert.equal(openFloors.length,state.hospitalDefinitions.length*4-
    Object.values(state.hospitalUnits).flat().length);
  assert.equal(openRooms.length,openFloors.length*8);
  for(const hospital of hospitals.filter(node=>node.hospital_id)){
    const floors=layout.nodes.filter(node=>node.hospital_key===hospital.key&&
      (node.kind==='unit'||node.kind==='open-floor'));
    assert.deepEqual(floors.map(node=>node.floor_level),[1,2,3,4]);
  }
  assert.equal(new Set(units.map(node=>node.unit)).size,units.length);
  assert.equal(layout.corridors.length,hospitals.length);
  for(const unit of units){
    const hospital=hospitals.find(node=>node.key===unit.hospital_key);
    assert.ok(hospital);
    assert.ok(Math.abs(unit.x-hospital.x)+layout.unitHalf<layout.hospitalHalf);
    assert.ok(Math.abs(unit.y-hospital.y)+layout.unitHalf<layout.hospitalHalf);
    assert.ok(unit.y-layout.unitTop>hospital.y-layout.hospitalHalf+layout.hospitalHeader,
      'hospital title has a separate header band');
  }
  for(const floor of openFloors){
    const hospital=hospitals.find(node=>node.key===floor.hospital_key);
    assert.ok(hospital);
    assert.ok(Math.abs(floor.x-hospital.x)+layout.unitHalf<layout.hospitalHalf);
    assert.ok(Math.abs(floor.y-hospital.y)+layout.unitHalf<layout.hospitalHalf);
  }
  for(const room of rooms){
    const unit=units.find(node=>node.unit===room.unit);
    assert.ok(Math.abs(room.x-unit.x)+layout.roomSize/2<layout.unitHalf);
    assert.ok(Math.abs(room.y-unit.y)+layout.roomSize/2<layout.unitHalf);
  }
  assert.ok(layout.unitTop-layout.roomOffset-layout.roomSize/2>18,
    'unit title has space above its first room row');
  const floorCards=[...units,...openFloors];
  for(let i=0;i<floorCards.length;i++)for(let j=i+1;j<floorCards.length;j++){
    const a=floorCards[i],b=floorCards[j];
    if(a.hospital_key!==b.hospital_key)continue;
    assert.ok(Math.abs(a.x-b.x)+.01>=2*layout.unitHalf+8||
      a.y+layout.unitHalf+8<=b.y-layout.unitTop+.01||
      b.y+layout.unitHalf+8<=a.y-layout.unitTop+.01,
    'unit cards and their title bands do not overlap');
  }
  for(let i=0;i<hospitals.length;i++)for(let j=i+1;j<hospitals.length;j++){
    const a=hospitals[i],b=hospitals[j];
    assert.ok(Math.abs(a.x-b.x)>=layout.hospitalHalf*2+10||
      Math.abs(a.y-b.y)>=layout.hospitalHalf*2+10,'hospital cards do not overlap');
  }
  for(const edge of layout.corridors){
    const target=hospitals.find(node=>node.key===edge.to);
    assert.ok(target);
    assert.ok(Math.hypot(edge.x1,edge.y1)>0);
    assert.ok(Math.hypot(edge.x2-target.x,edge.y2-target.y)>0);
    for(const other of hospitals.filter(node=>node!==target)){
      for(let step=1;step<100;step++){
        const x=edge.x1+(edge.x2-edge.x1)*step/100;
        const y=edge.y1+(edge.y2-edge.y1)*step/100;
        assert.ok(Math.abs(x-other.x)>=layout.hospitalHalf||
          Math.abs(y-other.y)>=layout.hospitalHalf,'corridor does not cross another hospital');
      }
    }
  }
  return layout;
}

const base=inspect(model.baseline,manifest.entries);
assert.equal(base.nodes.filter(node=>node.kind==='hospital').length,7);
assert.deepEqual(base.nodes.filter(node=>node.kind==='hospital').map(node=>node.unit_ids.length),[4,4,4,4,4,4,1]);
assert.equal(base.nodes.filter(node=>node.kind==='open-floor').length,3);
const original=base.nodes.find(node=>node.kind==='unit'&&node.unit===1);
assert.equal(original.floor_level,1);
assert.equal(base.nodes.find(node=>node.kind==='unit'&&node.unit===4).floor_level,4);
const movedState=HospitalSystem.assignUnit(model.baseline,'unit_01','hospital_007',model);
const moved=inspect(movedState,manifest.entries);
assert.equal(moved.nodes.find(node=>node.kind==='unit'&&node.unit===1).hospital_id,'hospital_007');
assert.equal(moved.nodes.find(node=>node.kind==='unit'&&node.unit===1).floor_level,2);
assert.notEqual(moved.nodes.find(node=>node.kind==='unit'&&node.unit===1).x,original.x);
let expanded=model.baseline;
for(let index=0;index<15;index++)expanded=HospitalSystem.createHospital(expanded,`Extra ${index+1}`);
inspect(expanded,manifest.entries);
let unassigned=model.baseline;
for(const unit of model.unitDefinitions)unassigned=HospitalSystem.removeUnit(unassigned,unit.unit_id,model);
const unassignedLayout=inspect(unassigned,manifest.entries);
assert.equal(unassignedLayout.nodes.filter(node=>node.kind==='hospital'&&node.hospital_id===null).length,7);
console.log('hospital atlas geometry tests passed');
