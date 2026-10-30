function hospitalMini(unit){
  const grid=document.createElement('div');grid.className='hospital-mini-grid';
  for(let room=1;room<=9;room++){
    const cell=document.createElement('span');
    if(room===5){cell.textContent='NS';cell.className='station';}
    else{
      const slot=room<5?room:room-1;
      const entry=state.organization.placements[HospitalSystem.bedId(unit.unit_id,slot)];
      cell.textContent=slot===7?'S':slot===8?'B':entry?String(slot):'·';cell.className=slot>6?'shared':entry?'occupied':'open';
    }
    grid.append(cell);
  }
  return grid;
}
function refreshHospitalStatuses(){
  if(!state.signals)return;
  for(const el of els.database.querySelectorAll('[data-hospital-status]')){
    const units=state.organization.hospitalUnits[el.dataset.hospitalStatus];
    let flow=0,pressure=0,count=0;
    for(const id of units){
      const unit=state.model.unitDefinitions.find(u=>u.unit_id===id);
      for(const entry of state.units.get(unit.legacy_number)){
        const sample=signalAt(entry,feedClock(entry));if(!sample)continue;
        flow+=sample.flow;pressure+=sample.pressure;count++;
      }
    }
    if(count){
      const flowSwatch=el.children[0],pressureSwatch=el.children[1];
      flowSwatch.style.background=SignalMapping.flowColor(flow/count,state.reverseFlow);
      pressureSwatch.style.background=SignalMapping.pressureColor(pressure/count);
      el.title=`Mean available atlas signals across ${count} assigned feeds; visual mapping, not an alarm`;
    } else el.title='No available atlas signal values';
  }
}
function showHospitals(openPopup=true){
  state.hospitalView=null;state.floorLevel=null;state.bedManagerView=false;
  els.waveform.hidden=true;els.database.hidden=false;updateSpeaker();
  els.streamLabel.textContent='VIRTUAL HOSPITAL OVERVIEW';els.streamTitle.textContent='Hospitals';
  const counts=HospitalSystem.occupancy(state.organization,state.model);
  els.streamMeta.textContent=`${state.organization.hospitalDefinitions.length} hospitals · ${state.model.unitDefinitions.length} units · ${state.entries.length-counts.unassigned} assigned feeds`;
  els.loadStatus.textContent='Layout ready';
  els.breadcrumbs.replaceChildren(breadcrumbButton('Hospitals',showHospitals),' › ',breadcrumbButton('All feeds database',showRoot));
  els.database.replaceChildren();
  els.database.append(message('Virtual organization of recording feeds. Each hospital has four elevator-connected floor slots, with one unit per occupied floor. Locations here are simulated, not real patient locations.'));
  for(const issue of state.layoutIssues)els.database.append(message(`Saved layout issue: ${issue}`,'layout-warning'));
  const cards=document.createElement('div');cards.className='hospital-cards';
  for(const hospital of state.organization.hospitalDefinitions){
    const id=hospital.hospital_id,card=document.createElement('button');card.type='button';card.className='hospital-card';
    const heading=document.createElement('strong');heading.textContent=hospital.display_name;
    const count=document.createElement('small');count.textContent=`${counts.hospitals[id].units}/4 units · ${counts.hospitals[id].feeds} virtual patient feeds`;
    const status=document.createElement('span');status.className='hospital-status';status.dataset.hospitalStatus=id;
    const flowSwatch=document.createElement('i'),pressureSwatch=document.createElement('i');
    status.append(flowSwatch,pressureSwatch,document.createTextNode('Average flow / pressure signal colors'));
    const previews=document.createElement('div');previews.className='hospital-unit-previews';
    state.organization.floorUnits[id].forEach((unitId,level)=>{
      const unit=state.model.unitDefinitions.find(u=>u.unit_id===unitId);
      const preview=document.createElement('div');preview.className='hospital-unit-preview';
      preview.append(message(`Floor ${level+1} · ${unit?.display_name||'Open'}`,'hospital-unit-label'));
      if(unit)preview.append(hospitalMini(unit));previews.append(preview);
    });
    card.append(heading,count,status,previews);card.onclick=()=>showHospital(id);cards.append(card);
  }
  els.database.append(cards);
  listEntries();drawAtlas();refreshHospitalStatuses();if(openPopup)openDetail();
}
function showBedManager(){
  state.managerHospitalId=state.hospitalView||state.managerHospitalId;
  state.hospitalView=null;state.floorLevel=null;state.bedManagerView=true;
  els.waveform.hidden=true;els.database.hidden=false;updateSpeaker();
  const counts=HospitalSystem.occupancy(state.organization,state.model);
  els.streamLabel.textContent='VIRTUAL LAYOUT';els.streamTitle.textContent='Bed Manager';
  els.streamMeta.textContent=`${state.entries.length-counts.unassigned} assigned feeds · ${counts.unassigned} unassigned · ${state.model.unitDefinitions.length*8} beds`;
  els.loadStatus.textContent='Layout ready';
  els.breadcrumbs.replaceChildren(breadcrumbButton('Hospitals',showHospitals),' › ','Bed Manager');
  els.database.replaceChildren(message('Arrange recording feeds in virtual beds and assign units to hospitals. Preview feed moves before applying them.'));
  for(const issue of state.layoutIssues)els.database.append(message(`Saved layout issue: ${issue}`,'layout-warning'));
  renderAssignmentControls();renderHospitalControls();
  listEntries();drawAtlas();openDetail();
  if(state.proposal)requestAnimationFrame(()=>els.database.querySelector('.organization-controls')?.scrollIntoView({block:'start'}));
}
function showHospital(id,requestedLevel=null,selectedRoom=null){
  const hospital=state.organization.hospitalDefinitions.find(h=>h.hospital_id===id);
  if(!hospital){showHospitals();return;}
  const slots=state.organization.floorUnits[id];
  const firstOccupied=slots.findIndex(Boolean)+1;
  const level=Number.isInteger(requestedLevel)&&requestedLevel>=1&&requestedLevel<=4?
    requestedLevel:firstOccupied||1;
  const priorPlayback=state.unitPlayback;
  const handoff=priorPlayback?{
    elapsed:priorPlayback.started?priorPlayback.elapsed:sessionSeconds(),
    active:priorPlayback.active||!priorPlayback.started}:null;
  stopUnitPlayback();
  state.hospitalView=id;state.floorLevel=level;state.bedManagerView=false;
  state.selectedNode=state.nodes.find(node=>node.kind==='hospital'&&node.hospital_id===id);
  els.waveform.hidden=true;els.database.hidden=false;updateSpeaker();
  const counts=HospitalSystem.occupancy(state.organization,state.model).hospitals[id];
  els.streamLabel.textContent='VIRTUAL HOSPITAL';els.streamTitle.textContent=hospital.display_name;
  els.streamMeta.textContent=`${counts.units} of 4 floors occupied · ${counts.feeds} virtual patient feeds in occupied rooms`;
  els.loadStatus.textContent='Layout ready';
  els.breadcrumbs.replaceChildren(breadcrumbButton('Hospitals',showHospitals),' › ',
    breadcrumbButton(hospital.display_name,()=>showHospital(id)),' › ',`Floor ${level}`);
  els.database.replaceChildren(message('Select a building window or floor. Each facade window links to the corresponding room in the floor plan.'));
  els.database.append(renderBuilding(hospital,slots,level));
  const tabs=document.createElement('nav');tabs.className='floor-tabs';tabs.setAttribute('aria-label','Hospital floors');
  for(let next=1;next<=HospitalSystem.MAX_UNITS;next++){
    const unitId=slots[next-1],unit=state.model.unitDefinitions.find(item=>item.unit_id===unitId);
    const button=document.createElement('button');button.type='button';
    button.className='floor-tab'+(next===level?' selected':'');
    button.setAttribute('aria-current',next===level?'page':'false');
    const number=document.createElement('strong');number.textContent=`Floor ${next}`;
    const detail=document.createElement('small');detail.textContent=unit?.display_name||'Open floor';
    button.append(number,detail);button.onclick=()=>showHospital(id,next);tabs.append(button);
  }
  const floorMap=renderFloorMap(id,level,slots[level-1],selectedRoom);
  els.database.append(tabs,floorMap);
  els.database.append(renderFloorWaveforms(slots[level-1],level,handoff));
  drawAtlas();openDetail();
  if(selectedRoom)requestAnimationFrame(()=>floorMap.scrollIntoView({block:'start'}));
}
function showUnassignedUnits(ids){
  state.hospitalView=null;state.floorLevel=null;state.bedManagerView=false;
  state.selectedNode=state.nodes.find(node=>node.kind==='hospital'&&node.hospital_id===null&&
    ids[0]===node.unit_ids[0]);
  els.waveform.hidden=true;els.database.hidden=false;updateSpeaker();
  els.streamLabel.textContent='VIRTUAL HOSPITAL OVERVIEW';els.streamTitle.textContent='Unassigned units';
  els.streamMeta.textContent=`${ids.length} unit${ids.length===1?'':'s'} awaiting a hospital assignment`;
  els.loadStatus.textContent='Layout ready';
  els.breadcrumbs.replaceChildren(breadcrumbButton('Hospitals',showHospitals),' › ','Unassigned units');
  els.database.replaceChildren(message('These units remain available for assignment to a hospital. Their room feeds are unchanged.'));
  const grid=document.createElement('div');grid.className='hospital-cards';
  for(const id of ids){
    const unit=state.model.unitDefinitions.find(item=>item.unit_id===id);
    const button=document.createElement('button');button.type='button';button.className='hospital-card';
    const heading=document.createElement('strong');heading.textContent=unit.display_name;
    const detail=document.createElement('small');detail.textContent=`${state.units.get(unit.legacy_number).length} of 6 beds occupied`;
    button.append(heading,detail,hospitalMini(unit));button.onclick=()=>showUnit(unit.legacy_number);grid.append(button);
  }
  els.database.append(grid);drawAtlas();openDetail();
}
function makeSelect(options,value){
  const select=document.createElement('select');
  for(const [key,label] of options){const option=document.createElement('option');option.value=key;option.textContent=label;select.append(option);}
  select.value=value;return select;
}
function renderAssignmentControls(){
  const section=document.createElement('section');section.className='organization-controls';
  const title=document.createElement('h3');title.textContent='Assign feeds to unit beds';section.append(title);
  const row=document.createElement('div');row.className='organization-row';
  const preset=makeSelect([['original','Original order'],['duration','Recording duration'],['breaths','Breath-start count'],['manual','Current arrangement']],state.proposal?.sorting.preset||state.organization.sorting.preset);
  preset.setAttribute('aria-label','Assignment sorting preset');
  const direction=makeSelect([['asc','Shortest / fewest first'],['desc','Longest / most first']],state.proposal?.sorting.direction||state.organization.sorting.direction);
  direction.setAttribute('aria-label','Assignment direction');
  const preview=document.createElement('button');preview.type='button';preview.textContent='Preview assignment';
  preview.onclick=()=>{
    try{state.proposal=HospitalSystem.propose(state.model,state.organization,preset.value,direction.value);showBedManager();}
    catch(error){els.loadStatus.textContent=error.message;}
  };
  row.append(preset,direction,preview);section.append(row);
  const manualRow=document.createElement('div');manualRow.className='organization-row';
  const feedOptions=state.entries.map(e=>[e.name,e.name]);
  const feedSelect=makeSelect(feedOptions,feedOptions[0]?.[0]);feedSelect.setAttribute('aria-label','Feed to place manually');
  const bedOptions=[['','Unassigned'],...state.model.unitDefinitions.flatMap(u=>u.bed_ids.map((id,index)=>[id,`${u.display_name} · Room ${String(index+1).padStart(2,'0')}`]))];
  const bedSelect=makeSelect(bedOptions,'');bedSelect.setAttribute('aria-label','Destination bed');
  const manualPreview=document.createElement('button');manualPreview.type='button';manualPreview.textContent='Preview manual placement';
  manualPreview.onclick=()=>{
    const placements=structuredClone(state.proposal?.placements||state.organization.placements);
    const feed=feedSelect.value,target=bedSelect.value;
    const old=Object.keys(placements).find(id=>placements[id]===feed);
    if(old)placements[old]=null;
    const displaced=target?placements[target]:null;
    if(target)placements[target]=feed;
    if(displaced&&old&&old!==target)placements[old]=displaced;
    const assigned=new Set(Object.values(placements).filter(Boolean));
    const proposal={placements,unassigned:state.model.originalOrder.filter(id=>!assigned.has(id)),
      missingMetadata:[],sorting:{preset:'manual',direction:'asc'}};
    const issues=HospitalSystem.validateProposal(proposal,state.model);
    if(issues.length){els.loadStatus.textContent=issues.join('; ');return;}
    state.proposal=proposal;showBedManager();
  };
  manualRow.append(feedSelect,bedSelect,manualPreview);section.append(manualRow);
  const counts=HospitalSystem.occupancy(state.organization,state.model);
  section.append(message(`${state.entries.length-counts.unassigned} assigned · ${counts.unassigned} unassigned · ${state.model.unitDefinitions.length*8} beds available`));
  section.append(message('Duration is estimated from source sample counts at 50 Hz. Breath sorting uses CSV BS start markers, which can include an incomplete final breath.'));
  if(state.proposal){
    const events=HospitalSystem.movementEvents(state.organization,{...state.organization,placements:state.proposal.placements},state.model);
    section.append(message(`${events.length} placement changes · ${state.proposal.unassigned.length} unassigned · ${state.proposal.missingMetadata.length} with unavailable sorting metadata`));
    if(state.proposal.missingMetadata.length)section.append(message('Unavailable metadata feeds follow measured feeds, ordered by source filename.','layout-warning'));
    const listing=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Preview placement changes';listing.append(summary);
    for(const event of events.slice(0,30))listing.append(message(`${event.feed_id}: ${event.from?.bed_id??'unassigned'} → ${event.to?.bed_id??'unassigned'}`,'proposal-line'));
    if(events.length>30)listing.append(message(`${events.length-30} more changes`));section.append(listing);
    const apply=document.createElement('button');apply.type='button';apply.textContent='Apply Assignment';
    apply.onclick=()=>{try{commitOrganization(HospitalSystem.applyProposal(state.organization,state.proposal,state.model).state);}catch(error){els.loadStatus.textContent=error.message;}};
    section.append(apply);
  }
  const reset=document.createElement('button');reset.type='button';reset.textContent='Reset to Original Layout';
  reset.onclick=()=>commitOrganization(structuredClone(state.model.baseline));section.append(reset);
  els.database.append(section);
}
function renderHospitalControls(){
  const section=document.createElement('section');section.className='organization-controls';
  const title=document.createElement('h3');title.textContent='Manage hospitals and units';section.append(title);
  const row=document.createElement('div');row.className='organization-row';
  const name=document.createElement('input');name.placeholder='Hospital name';name.setAttribute('aria-label','New hospital name');
  const create=document.createElement('button');create.type='button';create.textContent='Create hospital';
  create.onclick=()=>{try{commitOrganization(HospitalSystem.createHospital(state.organization,name.value));}catch(error){els.loadStatus.textContent=error.message;}};
  row.append(name,create);section.append(row);
  const renameRow=document.createElement('div');renameRow.className='organization-row';
  const hospitals=state.organization.hospitalDefinitions.map(h=>[h.hospital_id,h.display_name]);
  const hospitalSelect=makeSelect(hospitals,state.managerHospitalId||hospitals[0]?.[0]);
  const renameInput=document.createElement('input');renameInput.value=state.organization.hospitalDefinitions.find(h=>h.hospital_id===hospitalSelect.value)?.display_name||'';
  renameInput.setAttribute('aria-label','Hospital display name');
  hospitalSelect.onchange=()=>{renameInput.value=state.organization.hospitalDefinitions.find(h=>h.hospital_id===hospitalSelect.value)?.display_name||'';};
  const rename=document.createElement('button');rename.type='button';rename.textContent='Rename';
  rename.onclick=()=>{try{commitOrganization(HospitalSystem.renameHospital(state.organization,hospitalSelect.value,renameInput.value));}catch(error){els.loadStatus.textContent=error.message;}};
  renameRow.append(hospitalSelect,renameInput,rename);section.append(renameRow);
  const moveRow=document.createElement('div');moveRow.className='organization-row';
  const unitSelect=makeSelect(state.model.unitDefinitions.map(u=>[u.unit_id,u.display_name]),state.model.unitDefinitions[0]?.unit_id);
  unitSelect.setAttribute('aria-label','Unit to assign');
  const target=makeSelect([['','Unassigned'],...hospitals],'');target.setAttribute('aria-label','Destination hospital');
  const floor=makeSelect([['auto','First open floor'],...Array.from({length:HospitalSystem.MAX_UNITS},(_,i)=>
    [String(i+1),`Floor ${i+1}`])],'auto');floor.setAttribute('aria-label','Destination floor');
  const move=document.createElement('button');move.type='button';move.textContent='Apply unit assignment';
  move.onclick=()=>{try{commitOrganization(target.value?
    floor.value==='auto'?HospitalSystem.assignUnit(state.organization,unitSelect.value,target.value,state.model):
      HospitalSystem.assignUnitToFloor(state.organization,unitSelect.value,target.value,Number(floor.value),state.model):
    HospitalSystem.removeUnit(state.organization,unitSelect.value,state.model));}
    catch(error){els.loadStatus.textContent=error.message;}};
  moveRow.append(unitSelect,target,floor,move);section.append(moveRow);
  els.database.append(section);
}
