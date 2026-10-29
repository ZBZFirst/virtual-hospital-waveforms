const assert=require('node:assert/strict');
const plan=require('./floor-plan.js');
assert.deepEqual(plan.validate(),[]);
assert.equal(plan.rooms.length,8);
const windows=plan.facadeWindows();
assert.deepEqual(windows.map(window=>window.room),[1,2,3,4,5,6,7,8]);
assert.deepEqual(Object.fromEntries(['north','east','south','west'].map(side=>
  [side,windows.filter(window=>window.facade===side).length])),
  {north:3,east:1,south:3,west:1});
assert.ok(windows.every(window=>window.position>0&&window.position<1));
for(const faces of [['south','east'],['north','west']])
  assert.equal(windows.filter(window=>faces.includes(window.facade)).length,4);
for(const space of [...plan.rooms,plan.station,plan.elevator]){
  const walls=plan.wallsFor(space);
  assert.equal(walls.length,space===plan.station?8:5);
  for(const {x,y} of space.doors||[space.door])
    assert.ok(!walls.some(([x1,y1,x2,y2])=>
      x1===x2&&x1===x&&Math.min(y1,y2)<=y&&y<=Math.max(y1,y2)||
      y1===y2&&y1===y&&Math.min(x1,x2)<=x&&x<=Math.max(x1,x2)),
    `Doorway is open for ${space.id??space.room}`);
}
for(const side of ['top','left','right','bottom']){
  const door=`station_${side}`;
  assert.ok(plan.edges.some(([a,b])=>a===door||b===door),`${side} station door joins graph`);
  assert.ok(plan.route('elevator',door));
  assert.ok(plan.route(door,'station'));
}
for(let room=1;room<=8;room++){
  const route=plan.route('elevator',`room_${room}`);
  assert.equal(route[0],'elevator');
  assert.equal(route.at(-1),`room_${room}`);
  for(let i=1;i<route.length;i++){
    const a=plan.points[route[i-1]],b=plan.points[route[i]];
    assert.ok(a.x===b.x||a.y===b.y,'hallway segments are orthogonal');
  }
}
const multi=plan.buildingRoute(1,'room_1',4,'room_8');
assert.ok(multi.some((stop,i)=>i&&stop.level!==multi[i-1].level&&
  stop.node==='elevator'&&multi[i-1].node==='elevator'));
assert.equal(multi[0].level,1);assert.equal(multi.at(-1).level,4);
assert.deepEqual(plan.buildingRoute(2,'room_1',2,'room_2'),
  plan.route('room_1','room_2').map(node=>({level:2,node})));
assert.equal(plan.buildingRoute(0,'room_1',4,'room_8'),null);
console.log('floor plan connectivity and doorway tests passed');
