/* Deterministic virtual hospital geometry; one selectable room per recording. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HospitalLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PITCH = 250;
  const UNIT_HALF = 98;
  const ROOM_OFFSET = 53;
  const ROOM_SIZE = 39;
  const ROOM_CELLS = [
    [-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]
  ];

  function create(entries, unitNumbers) {
    const numbers = unitNumbers || [...new Set(entries.map(e => e.unit))].sort((a,b) => a-b);
    const count = numbers.length;
    const cells = [];
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        if (row || col) cells.push({row, col});
      }
    }
    cells.sort((a,b) => (a.row*a.row+a.col*a.col)-(b.row*b.row+b.col*b.col) ||
      a.row-b.row || a.col-b.col);
    if (count > cells.length) throw new Error('The hospital grid supports up to 24 units');
    const nodes = [{kind:'root',key:'root',row:0,col:0,x:0,y:0}];
    const units = new Map();
    for (let index = 0; index < count; index++) {
      const unit = numbers[index];
      const {row,col} = cells[index], x = col*PITCH, y = row*PITCH;
      const members = entries.filter(e => e.unit === unit).sort((a,b) => a.room-b.room);
      units.set(unit, members);
      nodes.push({kind:'unit',key:`unit-${unit}`,unit,row,col,x,y});
      for (let room = 1; room <= 8; room++) {
        const [dx,dy] = ROOM_CELLS[room-1];
        nodes.push({kind:'room',key:`room-${unit}-${room}`,unit,room,
          entry:members.find(e => e.room === room),
          x:x+dx*ROOM_OFFSET,y:y+dy*ROOM_OFFSET});
      }
    }
    const byCell = new Map(nodes.filter(n => n.kind !== 'room')
      .map(n => [`${n.row},${n.col}`,n]));
    const corridors = [];
    for (const node of byCell.values()) {
      for (const [dr,dc] of [[0,1],[1,0]]) {
        const next = byCell.get(`${node.row+dr},${node.col+dc}`);
        if (!next) continue;
        const horizontal = dc !== 0;
        corridors.push({from:node.key,to:next.key,
          x1:node.x+(horizontal?UNIT_HALF:0),
          y1:node.y+(horizontal?0:UNIT_HALF),
          x2:next.x-(horizontal?UNIT_HALF:0),
          y2:next.y-(horizontal?0:UNIT_HALF)});
      }
    }
    return {nodes,units,corridors,pitch:PITCH,unitHalf:UNIT_HALF,
      roomOffset:ROOM_OFFSET,roomSize:ROOM_SIZE};
  }
  function createHospitalAtlas(entries, unitDefinitions, organization) {
    const hospitalHalf=177, hospitalHeader=32, unitHalf=56, unitTop=70;
    const rootHalf=64, roomOffset=36, roomSize=28;
    const units=new Map(unitDefinitions.map(unit=>[unit.legacy_number,
      entries.filter(entry=>entry.unit===unit.legacy_number).sort((a,b)=>a.room-b.room)]));
    const assigned=new Set(Object.values(organization.hospitalUnits).flat());
    const unassigned=unitDefinitions.filter(unit=>!assigned.has(unit.unit_id));
    const groups=organization.hospitalDefinitions.map(hospital=>({
      key:`hospital-${hospital.hospital_id}`,hospital_id:hospital.hospital_id,
      label:hospital.display_name,
      units:organization.floorUnits[hospital.hospital_id]
    }));
    for(let index=0;index<unassigned.length;index+=4){
      groups.push({key:`unassigned-${index/4+1}`,hospital_id:null,
        label:'Unassigned units',units:unassigned.slice(index,index+4).map(unit=>unit.unit_id)});
    }
    const radius=Math.max(440,groups.length*530/(2*Math.PI));
    const nodes=[{kind:'root',key:'root',x:0,y:0}],corridors=[];
    const slots={
      1:[[0,12]],2:[[-67,12],[67,12]],
      3:[[-67,-55],[67,-55],[0,79]],
      4:[[-67,-55],[67,-55],[-67,79],[67,79]]
    };
    for(let index=0;index<groups.length;index++){
      const group=groups[index],angle=-Math.PI/2+index*2*Math.PI/groups.length;
      const x=radius*Math.cos(angle),y=radius*Math.sin(angle);
      const hospital={kind:'hospital',key:group.key,hospital_id:group.hospital_id,
        label:group.label,unit_ids:group.units.filter(Boolean),x,y};
      nodes.push(hospital);
      const boundaryScale=1/Math.max(Math.abs(Math.cos(angle)),Math.abs(Math.sin(angle)));
      const dx=Math.cos(angle)*boundaryScale,dy=Math.sin(angle)*boundaryScale;
      corridors.push({from:'root',to:group.key,
        x1:dx*rootHalf,y1:dy*rootHalf,
        x2:x-dx*hospitalHalf,y2:y-dy*hospitalHalf});
      const positions=group.hospital_id?slots[4]:slots[group.units.length]||[];
      group.units.forEach((id,slot)=>{
        const definition=id?unitDefinitions.find(unit=>unit.unit_id===id):null;
        if(id&&!definition)throw new Error(`Unknown unit in hospital atlas: ${id}`);
        const unit=definition?.legacy_number??null,[ux,uy]=positions[slot];
        const floorLevel=group.hospital_id?slot+1:null;
        const centerX=x+ux,centerY=y+uy,members=unit===null?[]:units.get(unit);
        if(!id){
          const key=`open-floor-${group.hospital_id}-${floorLevel}`;
          nodes.push({kind:'open-floor',key,hospital_id:group.hospital_id,
            hospital_key:group.key,floor_level:floorLevel,x:centerX,y:centerY});
          for(let room=1;room<=8;room++){
            const [rx,ry]=ROOM_CELLS[room-1];
            nodes.push({kind:'open-room',key:`${key}-room-${room}`,
              hospital_id:group.hospital_id,hospital_key:group.key,
              floor_level:floorLevel,room,x:centerX+rx*roomOffset,y:centerY+ry*roomOffset});
          }
          return;
        }
        nodes.push({kind:'unit',key:`unit-${unit}`,hospital_id:group.hospital_id,
          hospital_key:group.key,floor_level:floorLevel,unit,x:centerX,y:centerY});
        for(let room=1;room<=8;room++){
          const [rx,ry]=ROOM_CELLS[room-1];
          nodes.push({kind:'room',key:`room-${unit}-${room}`,hospital_id:group.hospital_id,
            hospital_key:group.key,floor_level:floorLevel,unit,room,entry:members.find(entry=>entry.room===room),
            x:centerX+rx*roomOffset,y:centerY+ry*roomOffset});
        }
      });
    }
    const extentX=Math.max(rootHalf,...nodes.filter(node=>node.kind==='hospital').map(node=>Math.abs(node.x)+hospitalHalf));
    const extentY=Math.max(rootHalf,...nodes.filter(node=>node.kind==='hospital').map(node=>Math.abs(node.y)+hospitalHalf));
    return {nodes,units,corridors,groups,hospitalHalf,hospitalHeader,unitHalf,unitTop,
      rootHalf,roomOffset,roomSize,
      extentWidth:2*extentX+40,extentHeight:2*extentY+40};
  }
  return {create,createHospitalAtlas};
});
