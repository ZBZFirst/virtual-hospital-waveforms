function message(textValue,css='database-intro'){
  const el=document.createElement('p');el.className=css;el.textContent=textValue;return el;
}
function svgElement(name,attributes={}){
  const element=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
}
function renderBuilding(hospital,slots,selectedLevel){
  const section=document.createElement('section');section.className='building-section';
  const heading=document.createElement('div');heading.className='building-heading';
  const title=document.createElement('h3');title.textContent=`${hospital.display_name} · building view`;
  const controls=document.createElement('div');controls.className='building-controls';
  for(const [orientation,label] of [['south-east','South + East'],['north-west','North + West']]){
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.className=state.buildingFaces===orientation?'selected':'';
    button.setAttribute('aria-pressed',state.buildingFaces===orientation?'true':'false');
    button.onclick=()=>{state.buildingFaces=orientation;section.replaceWith(renderBuilding(hospital,slots,selectedLevel));};
    controls.append(button);
  }
  heading.append(title,controls);section.append(heading);
  const frontFace=state.buildingFaces==='south-east'?'south':'north';
  const sideFace=state.buildingFaces==='south-east'?'east':'west';
  const svg=svgElement('svg',{viewBox:'0 0 900 550',role:'group',
    'aria-label':`${hospital.display_name} virtual four-floor building, ${frontFace} and ${sideFace} facades`});
  svg.classList.add('building-svg');
  const front=(u,v)=>({x:205+455*u,y:125+v});
  const side=(u,v)=>({x:660+150*u,y:125-60*u+v});
  const polygon=(points,className)=>svgElement('polygon',{
    points:points.map(point=>`${point.x},${point.y}`).join(' '),class:className});
  const frontPoly=(top,bottom)=>polygon([front(0,top),front(1,top),front(1,bottom),front(0,bottom)],'building-front');
  const sidePoly=(top,bottom)=>polygon([side(0,top),side(1,top),side(1,bottom),side(0,bottom)],'building-side');
  svg.append(svgElement('ellipse',{cx:515,cy:513,rx:335,ry:22,class:'building-shadow'}));
  svg.append(sidePoly(0,360),frontPoly(0,360));
  if(selectedLevel){
    const top=(4-selectedLevel)*90;
    svg.append(polygon([front(0,top),front(1,top),front(1,top+90),front(0,top+90)],'building-selected-floor'));
    svg.append(polygon([side(0,top),side(1,top),side(1,top+90),side(0,top+90)],'building-selected-floor'));
  }
  for(let floor=1;floor<4;floor++){
    const v=floor*90,a=front(0,v),b=front(1,v),c=side(1,v);
    svg.append(svgElement('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'building-floor-line'}));
    svg.append(svgElement('line',{x1:b.x,y1:b.y,x2:c.x,y2:c.y,class:'building-floor-line'}));
  }
  svg.append(polygon([{x:205,y:125},{x:660,y:125},{x:810,y:65},{x:355,y:65}],'building-roof'));
  svg.append(svgElement('rect',{x:260,y:90,width:72,height:32,rx:3,class:'building-elevator-top'}));
  const roofLabel=svgElement('text',{x:505,y:108,class:'building-roof-label','text-anchor':'middle'});
  roofLabel.textContent='VIRTUAL HOSPITAL';svg.append(roofLabel);
  for(let level=4;level>=1;level--){
    const unitId=slots[level-1];
    const levelLabel=svgElement('text',{x:174,y:125+(4-level)*90+52,
      class:'building-level-label','text-anchor':'middle'});
    levelLabel.textContent=`F${level}`;svg.append(levelLabel);
    for(const window of FloorPlan.facadeWindows().filter(item=>
      item.facade===frontFace||item.facade===sideFace)){
      const onFront=window.facade===frontFace,point=onFront?front:side;
      const half=onFront?.077:.17,top=(4-level)*90+29,bottom=top+43;
      const u=window.position;
      const pane=polygon([point(u-half,top),point(u+half,top),
        point(u+half,bottom),point(u-half,bottom)],'building-window-pane');
      const name=unitId&&state.organization.placements[HospitalSystem.bedId(unitId,window.room)];
      const group=svgElement('g',{class:`building-window${name?' occupied':''}${unitId?'':' vacant-floor'}`,
        role:'button',tabindex:0,
        'aria-label':`Floor ${level}, ${window.room===7?'supply room':window.room===8?'break room':`room ${window.room}`}, ${name?'assigned feed':window.room>6?'shared space':unitId?'open bed':'open floor'}. Open floor plan.`});
      group.append(pane);
      const left=point(u-half,top),right=point(u+half,top);
      const mid=point(u,top),midBottom=point(u,bottom);
      group.append(svgElement('line',{x1:mid.x,y1:mid.y,x2:midBottom.x,y2:midBottom.y,class:'building-mullion'}));
      group.append(svgElement('line',{x1:left.x-2,y1:left.y+45,x2:right.x+2,y2:right.y+45,class:'building-sill'}));
      const center=point(u,top+25),text=svgElement('text',{
        x:center.x,y:center.y,class:'building-window-label','text-anchor':'middle'});
      text.textContent=window.room===7?'S':window.room===8?'B':String(window.room).padStart(2,'0');group.append(text);
      const activate=()=>showHospital(hospital.hospital_id,level,window.room);
      group.addEventListener('click',activate);
      group.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}
      });
      svg.append(group);
    }
  }
  section.append(svg,message('Each window maps to a patient or shared room on its floor. Switch views to see all eight windows. Select a window to open its floor plan.','building-hint'));
  return section;
}
function renderFloorMap(hospitalId,level,unitId,selectedRoom=null){
  const plan=FloorPlan,unit=state.model.unitDefinitions.find(item=>item.unit_id===unitId);
  const section=document.createElement('section');section.className='floor-map';
  const heading=document.createElement('div');heading.className='floor-map-heading';
  const title=document.createElement('h3');title.textContent=`Floor ${level} · ${unit?.display_name||'Open floor'}`;
  const hint=message('Generated virtual plan · select a room for its elevator route and waveform, or NS for unit playback.','floor-map-hint');
  heading.append(title,hint);section.append(heading);
  const svg=svgElement('svg',{viewBox:`0 0 ${plan.width} ${plan.height}`,
    role:'group','aria-label':`Virtual floor ${level} map with six beds, walls, hallways, nursing station and elevator`});
  svg.classList.add('floor-svg');
  svg.append(svgElement('rect',{x:25,y:20,width:850,height:600,class:'floor-shell'}));
  for(const [from,to] of plan.edges){
    const a=plan.points[from],b=plan.points[to];
    svg.append(svgElement('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'floor-hallway'}));
  }
  const routeLayer=svgElement('g',{class:'floor-route'});svg.append(routeLayer);
  svg.append(svgElement('rect',{x:25,y:20,width:850,height:600,class:'floor-outer-wall'}));
  const info=document.createElement('div');info.className='floor-map-info';
  const setInfo=(kind,room=null,entry=null)=>{
    routeLayer.replaceChildren();
    const destination=['room','supply','break'].includes(kind)?`room_${room}`:kind==='station'?'station':null;
    if(destination){
      const path=plan.route('elevator',destination);
      for(let i=1;i<path.length;i++){
        const a=plan.points[path[i-1]],b=plan.points[path[i]];
        routeLayer.append(svgElement('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y}));
      }
    }
    info.replaceChildren();
    const label=document.createElement('strong');
    label.textContent=kind==='elevator'?`Elevator · Floor ${level}`:
      kind==='station'?`${unit?.display_name||'Open floor'} nursing station`:
      kind==='supply'?'Supply room':kind==='break'?'Break room':
      `Room ${String(room).padStart(2,'0')} · ${entry?'occupied feed':'open bed'}`;
    info.append(label);
    if(kind==='elevator'){
      info.append(message('Choose another floor. The elevator connects the same lobby position on all four floors.'));
      const buttons=document.createElement('div');buttons.className='floor-elevator-buttons';
      for(let next=1;next<=HospitalSystem.MAX_UNITS;next++){
        const button=document.createElement('button');button.type='button';
        button.textContent=`Floor ${next}`;button.disabled=next===level;
        button.onclick=()=>showHospital(hospitalId,next);buttons.append(button);
      }
      info.append(buttons);
    }else{
      info.append(message(destination?
        `Connected to the elevator by ${plan.route('elevator',destination).length-1} hallway links.`:
        'This floor has no assigned unit.'));
      if(kind==='room'&&entry){
        const button=document.createElement('button');button.type='button';
        button.textContent='Open waveform';button.onclick=()=>selectEntry(entry);info.append(button);
      }else if(kind==='station'&&unit){
        const button=document.createElement('button');button.type='button';
        button.textContent='Open unit playback';button.onclick=()=>showUnit(unit.legacy_number);info.append(button);
      }
    }
  };
  const addSpace=(space,label,kind,room=null,entry=null)=>{
    const group=svgElement('g',{class:`floor-space ${kind}${entry?' occupied':''}`,
      role:'button',tabindex:0,'aria-label':label});
    group.append(svgElement('rect',{x:space.x,y:space.y,width:space.w,height:space.h,class:'floor-room-fill'}));
    for(const [x1,y1,x2,y2] of plan.wallsFor(space))
      group.append(svgElement('line',{x1,y1,x2,y2,class:'floor-wall'}));
    for(const door of space.doors||[space.door])
      group.append(svgElement('circle',{cx:door.x,cy:door.y,r:5,class:'floor-door'}));
    const text=svgElement('text',{x:space.x+space.w/2,y:space.y+space.h/2,
      'text-anchor':'middle','dominant-baseline':'middle'});
    text.textContent=label;group.append(text);
    const activate=()=>setInfo(kind,room,entry);
    group.addEventListener('click',activate);
    group.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}
    });
    svg.append(group);
  };
  for(const room of plan.rooms){
    const name=unitId&&state.organization.placements[HospitalSystem.bedId(unitId,room.room)];
    const entry=name?state.entries.find(item=>item.name===name):null;
    addSpace(room,room.label||`Room ${String(room.room).padStart(2,'0')}`,room.kind||'room',room.room,entry);
  }
  addSpace(plan.station,'NS','station');
  addSpace(plan.elevator,'Elevator','elevator');
  section.append(svg,info);
  if(Number.isInteger(selectedRoom)&&selectedRoom>=1&&selectedRoom<=8){
    const name=unitId&&state.organization.placements[HospitalSystem.bedId(unitId,selectedRoom)];
    setInfo(selectedRoom===7?'supply':selectedRoom===8?'break':'room',selectedRoom,name?state.entries.find(item=>item.name===name):null);
  }else setInfo('elevator');
  return section;
}
