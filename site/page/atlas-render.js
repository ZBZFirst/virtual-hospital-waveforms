function fit(canvas) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  // Live draws in CSS pixels. Review draws in backing-store pixels on the
  // same canvases, so clear the transform even when their size did not change.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return {ctx, w, h, dpr};
}
function rotate(point, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x = point.x * cy - point.z * sy, z0 = point.x * sy + point.z * cy;
  return {x, y: point.y * cp - z0 * sp, z: point.y * sp + z0 * cp};
}
function project(point, yaw, pitch, width, height, zoom = 1) {
  const p = rotate(point, yaw, pitch), distance = 530, perspective = distance / (distance - p.z);
  const scale = Math.min(width, height) / 410 * zoom;
  return {x: width / 2 + p.x * perspective * scale, y: height / 2 - p.y * perspective * scale, z: p.z, scale: perspective * scale};
}
function makePositions(entries) {
  state.layout=HospitalLayout.createHospitalAtlas(entries.filter(e=>e.unit!==null),
    state.model.unitDefinitions,state.organization);
  state.nodes=state.layout.nodes;
  state.units=state.layout.units;
  state.corridors=state.layout.corridors;
}
function projectPlacements(){
  const byName=new Map(state.entries.map(e=>[e.name,e]));
  for(const entry of state.entries){entry.unit=null;entry.room=null;}
  for(const unit of state.model.unitDefinitions)for(let room=1;room<=HospitalSystem.BEDS_PER_UNIT;room++){
    const name=state.organization.placements[HospitalSystem.bedId(unit.unit_id,room)];
    if(name){const entry=byName.get(name);entry.unit=unit.legacy_number;entry.room=room;}
  }
  makePositions(state.entries);
  state.selectedNode=state.selected?state.nodes.find(n=>n.entry===state.selected):null;
  listEntries();drawAtlas();
}
function saveOrganization(){
  try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(state.organization));return true;}
  catch(error){state.layoutIssues=[`Browser storage unavailable: ${error.message}`];return false;}
}
function commitOrganization(next){
  const issues=HospitalSystem.validateState(next,state.model);
  if(issues.length)throw new Error(issues.join('; '));
  state.organization=next;state.proposal=null;
  projectPlacements();saveOrganization();
  state.atlasCenter={x:0,y:0};state.atlasZoom=defaultAtlasZoom();
  if(state.bedManagerView)showBedManager();
  else if(state.hospitalView)showHospital(state.hospitalView,state.floorLevel);
  else showHospitals();
}
function matchesFilter(e){return `${e.name} ${e.id} rpi${e.rpi} ${e.suffix} unit ${e.unit} room ${e.room}`.toLowerCase().includes(state.filter);}
function atlasInsets(dpr){return {top:document.querySelector('.site-head').offsetHeight*dpr,bottom:document.querySelector('.atlas-footer').offsetHeight*dpr};}
function atlasScale(w,h){
  const dpr=els.atlas.width/els.atlas.clientWidth,{top,bottom}=atlasInsets(dpr);
  const width=state.layout?.extentWidth||1200,height=state.layout?.extentHeight||1200;
  return Math.max(.06,Math.min((w-40*dpr)/width,(h-top-bottom-40*dpr)/height))*state.atlasZoom;
}
function atlasNodeSide(node,scale,dpr){
  if(node.kind==='room'||node.kind==='open-room')return state.layout.roomSize*scale;
  if(node.kind==='unit'||node.kind==='open-floor')return scale>.28?Math.max(18*dpr,26*scale):26*scale;
  if(node.kind==='hospital')return state.layout.hospitalHalf*2*scale;
  return 48*scale;
}
function atlasTitle(ctx,label,x,y,width,height,fontSize,dpr){
  ctx.fillStyle='#0b2431';ctx.fillRect(x,y,width,height);
  ctx.strokeStyle='#7193a0';ctx.lineWidth=dpr;ctx.strokeRect(x,y,width,height);
  ctx.fillStyle='#e7f5f7';ctx.font=`600 ${fontSize}px system-ui`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(label,x+width/2,y+height/2,width-8*dpr);
  ctx.textBaseline='alphabetic';
}
function drawAtlas() {
  if(getComputedStyle(els.atlas).visibility==='hidden')return;
  if(els.atlas.getAttribute('aria-hidden')==='true'){state.projected=[];return;}
  const {ctx,w,h,dpr}=fit(els.atlas);ctx.clearRect(0,0,w,h);
  const gradient=ctx.createRadialGradient(w*.5,h*.5,20,w*.5,h*.5,Math.max(w,h)*.7);
  gradient.addColorStop(0,'#17313f');gradient.addColorStop(1,'#091823');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  const scale=atlasScale(w,h);
  const {top,bottom}=atlasInsets(dpr),centerY=top+(h-top-bottom)/2;
  state.projected=state.nodes.map(node=>({x:w/2+(node.x-state.atlasCenter.x)*scale,y:centerY+(node.y-state.atlasCenter.y)*scale,node}));
  const levels=new Map(),unitLevels=new Map(),hospitalLevels=new Map();
  const hospitalByUnit=new Map(state.nodes.filter(node=>node.kind==='unit').map(node=>[node.unit,node.hospital_key]));
  const rootLevel={flow:0,pressure:0,count:0};
  if(state.signals){
    for(const entry of state.entries){
      const level=signalAt(entry,feedClock(entry));levels.set(entry.name,level);
      if(!level)continue;
      const unit=unitLevels.get(entry.unit)||{flow:0,pressure:0,count:0};
      unit.flow+=level.flow;unit.pressure+=level.pressure;unit.count++;
      unitLevels.set(entry.unit,unit);
      const key=hospitalByUnit.get(entry.unit);
      if(key){
        const hospital=hospitalLevels.get(key)||{flow:0,pressure:0,count:0};
        hospital.flow+=level.flow;hospital.pressure+=level.pressure;hospital.count++;
        hospitalLevels.set(key,hospital);
      }
      rootLevel.flow+=level.flow;rootLevel.pressure+=level.pressure;rootLevel.count++;
    }
  }
  const projectedByKey=new Map(state.projected.map(p=>[p.node.key,p]));
  ctx.lineCap='butt';
  for(const corridor of state.corridors){
    const from=projectedByKey.get(corridor.from),to=projectedByKey.get(corridor.to);
    const x1=from.x+(corridor.x1-from.node.x)*scale,y1=from.y+(corridor.y1-from.node.y)*scale;
    const x2=to.x+(corridor.x2-to.node.x)*scale,y2=to.y+(corridor.y2-to.node.y)*scale;
    ctx.strokeStyle='#68a7b6';ctx.lineWidth=Math.max(5*dpr,10*scale);
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  }
  for(const hub of state.projected.filter(p=>
    ['root','hospital','unit','open-floor'].includes(p.node.kind))){
    const node=hub.node;
    const half=(node.kind==='root'?state.layout.rootHalf:
      node.kind==='hospital'?state.layout.hospitalHalf:state.layout.unitHalf)*scale;
    const top=node.kind==='unit'||node.kind==='open-floor'?state.layout.unitTop*scale:half;
    const active=node===state.selectedNode||node.kind==='unit'&&state.selectedNode?.unit===node.unit;
    ctx.fillStyle=active?'#243e50':'#17303c';
    const hospitalLevel=hospitalLevels.get(node.key);
    ctx.strokeStyle=active?'#a0dce5':node.kind==='hospital'&&hospitalLevel?.count?
      SignalMapping.flowColor(hospitalLevel.flow/hospitalLevel.count,state.reverseFlow):'#4c7685';
    ctx.lineWidth=Math.max(dpr,node.kind==='hospital'?3*scale:1.5*scale);
    ctx.fillRect(hub.x-half,hub.y-top,2*half,top+half);
    ctx.strokeRect(hub.x-half,hub.y-top,2*half,top+half);
    if(node.kind==='hospital'){
      if(scale>=.5){
        atlasTitle(ctx,node.label,hub.x-half+6*scale,hub.y-half+6*scale,
          2*half-12*scale,state.layout.hospitalHeader*scale,
          Math.max(10*dpr,14*scale),dpr);
      }else if(scale>=.22){
        const width=Math.max(72*dpr,Math.min(2*half,170*dpr));
        atlasTitle(ctx,node.label,hub.x-width/2,hub.y-half-20*dpr,
          width,18*dpr,10*dpr,dpr);
      }
    }else if((node.kind==='unit'||node.kind==='open-floor')&&scale>=.75){
      atlasTitle(ctx,node.kind==='open-floor'?`F${node.floor_level} · OPEN FLOOR`:
        `${node.floor_level?`F${node.floor_level} · `:''}UNIT ${String(node.unit).padStart(2,'0')}`,
        hub.x-half+2*scale,hub.y-top+2*scale,2*half-4*scale,16*scale,
        Math.max(8*dpr,10*scale),dpr);
    }else if(node.kind==='root'&&scale>=.22){
      atlasTitle(ctx,'DATABASE',hub.x-46*dpr,hub.y-half-20*dpr,
        92*dpr,18*dpr,10*dpr,dpr);
    }
    if(node.kind==='hospital'&&hospitalLevel?.count){
      ctx.fillStyle=SignalMapping.pressureColor(hospitalLevel.pressure/hospitalLevel.count);
      ctx.fillRect(hub.x-half+4*dpr,hub.y-half+4*dpr,5*dpr,5*dpr);
    }
  }
  for(const p of state.projected){
    const node=p.node,selected=node===state.selectedNode,hovered=node===state.hover,entry=node.entry;
    if(node.kind==='hospital')continue;
    const match=!state.filter||node.kind==='root'||node.kind==='open-floor'||node.kind==='open-room'||
      (node.kind==='unit'&&state.units.get(node.unit).some(matchesFilter))||(entry&&matchesFilter(entry));
    ctx.globalAlpha=match?1:.15;
    const unitLevel=unitLevels.get(node.unit);
    const level=node.kind==='root'&&rootLevel.count?{flow:rootLevel.flow/rootLevel.count,pressure:rootLevel.pressure/rootLevel.count}:
      node.kind==='unit'&&unitLevel?.count?{flow:unitLevel.flow/unitLevel.count,pressure:unitLevel.pressure/unitLevel.count}:
      entry?levels.get(entry.name):null;
    const side=atlasNodeSide(node,scale,dpr);
    ctx.fillStyle=entry||node.kind!=='room'&&node.kind!=='open-room'&&node.kind!=='open-floor'?
      SignalMapping.pressureColor(level?.pressure):'#243b45';
    ctx.fillRect(p.x-side/2,p.y-side/2,side,side);
    ctx.strokeStyle=entry||node.kind!=='room'&&node.kind!=='open-room'&&node.kind!=='open-floor'?
      SignalMapping.flowColor(level?.flow,state.reverseFlow):'#6c8992';
    ctx.lineWidth=Math.max(dpr,2.5*scale);ctx.strokeRect(p.x-side/2,p.y-side/2,side,side);
    if(selected||hovered){ctx.strokeStyle='#fff';ctx.lineWidth=1.5*dpr;ctx.strokeRect(p.x-side/2-3*dpr,p.y-side/2-3*dpr,side+6*dpr,side+6*dpr);}
    if((node.kind==='room'||node.kind==='open-room')&&scale>.3){const text=node.room===7?'S':node.room===8?'B':String(node.room);ctx.fillStyle='#f1fbfd';ctx.strokeStyle='#071923';ctx.lineWidth=2*dpr;ctx.font=`${8*dpr}px system-ui`;ctx.textAlign='center';ctx.strokeText(text,p.x,p.y+3*dpr);ctx.fillText(text,p.x,p.y+3*dpr);}
    if((node.kind==='unit'||node.kind==='open-floor')&&scale>.28){ctx.fillStyle='#f1fbfd';ctx.strokeStyle='#071923';ctx.lineWidth=2*dpr;ctx.font=`${8*dpr}px system-ui`;ctx.textAlign='center';ctx.strokeText('NS',p.x,p.y+3*dpr);ctx.fillText('NS',p.x,p.y+3*dpr);}
    if(node.kind==='root'&&scale>.44){ctx.fillStyle='#fff2d7';ctx.font=`${11*dpr}px system-ui`;ctx.textAlign='center';ctx.fillText('DB',p.x,p.y+4*dpr);}
    ctx.globalAlpha=1;
  }
  if(state.hover){
    const p=state.projected.find(q=>q.node===state.hover),node=state.hover;
    const label=node.kind==='root'?'Hospital database':node.kind==='hospital'?node.label:
      node.kind==='unit'?`Unit ${String(node.unit).padStart(2,'0')} nursing station`:
      node.kind==='open-floor'?`Floor ${node.floor_level} · Open floor`:
      node.kind==='open-room'?`Floor ${node.floor_level} · ${node.room===7?'Supply room':node.room===8?'Break room':`Room ${String(node.room).padStart(2,'0')} (open)`}`:
      node.room===7?`Unit ${String(node.unit).padStart(2,'0')} · Supply room`:
      node.room===8?`Unit ${String(node.unit).padStart(2,'0')} · Break room`:
      `Unit ${String(node.unit).padStart(2,'0')} · Room ${String(node.room).padStart(2,'0')}${node.entry?'':' (open)'}`;
    const top=node.kind==='hospital'?state.layout.hospitalHalf*scale:
      node.kind==='unit'||node.kind==='open-floor'?state.layout.unitTop*scale:24*dpr;
    if(node.kind==='room'||node.kind==='open-room'||
      (node.kind==='unit'||node.kind==='open-floor')&&scale<.75){
      ctx.font=`600 ${11*dpr}px system-ui`;
      const width=Math.min(300*dpr,Math.max(90*dpr,ctx.measureText(label).width+16*dpr));
      atlasTitle(ctx,label,p.x-width/2,p.y-top-25*dpr,width,20*dpr,11*dpr,dpr);
    }
  }
}
