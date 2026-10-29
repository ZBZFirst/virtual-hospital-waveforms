/* Virtual organization only. Waveform sources and monitoring remain independent. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HospitalSystem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = 3, MAX_UNITS = 4, BEDS_PER_UNIT = 6;
  const unitId = number => `unit_${String(number).padStart(2,'0')}`;
  const bedId = (unit,room) => `${unit}_bed_${String(room).padStart(2,'0')}`;
  const hospitalId = number => `hospital_${String(number).padStart(3,'0')}`;
  const floorId = (hospital,level) => `${hospital}_floor_${String(level).padStart(2,'0')}`;
  const copy = value => JSON.parse(JSON.stringify(value));

  function createModel(entries, sampleRate) {
    if (!Array.isArray(entries)) throw new Error('Feed manifest is missing');
    const feedRegistry = new Map(), feedMetadata = new Map(), originalOrder = [];
    for (const entry of entries) {
      if (typeof entry.name !== 'string' || !entry.name.endsWith('.csv') || feedRegistry.has(entry.name))
        throw new Error(`Duplicate or invalid source filename: ${entry.name}`);
      const id = entry.name; // The shorter opaque manifest ID occurs in multiple files.
      feedRegistry.set(id,{feed_id:id,source_file:entry.name,source_id:entry.id ?? null});
      const samples = Number.isSafeInteger(entry.samples) && entry.samples >= 0 ? entry.samples : null;
      const starts = Number.isSafeInteger(entry.breaths) && entry.breaths >= 0 ? entry.breaths : null;
      const rate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null;
      feedMetadata.set(id,{
        feed_id:id,sample_count:samples,duration_seconds:samples !== null && rate ? samples/rate : null,
        duration_basis:samples !== null && rate ? `sample count / verified ${rate} Hz` : null,
        total_breaths:starts,breath_count_basis:starts !== null ? 'CSV BS breath-start markers' : null,
        metadata_status:samples !== null && rate && starts !== null ? 'complete' : 'incomplete'
      });
      originalOrder.push(id);
    }
    const originalNumbers=[...new Set(entries.map(e=>e.unit))].sort((a,b)=>a-b);
    const overflow=entries.filter(entry=>entry.room>6);
    const numbers=[...originalNumbers];
    for(let i=0;i<Math.ceil(overflow.length/BEDS_PER_UNIT);i++)numbers.push(Math.max(0,...originalNumbers)+i+1);
    if(numbers.some(n=>!Number.isSafeInteger(n)||n<1))throw new Error('Invalid original unit number');
    const unitDefinitions=numbers.map(number=>({unit_id:unitId(number),legacy_number:number,
      display_name:`Unit ${String(number).padStart(2,'0')}`,capacity:BEDS_PER_UNIT,
      bed_ids:Array.from({length:BEDS_PER_UNIT},(_,i)=>bedId(unitId(number),i+1))}));
    const placements=Object.fromEntries(unitDefinitions.flatMap(u=>u.bed_ids.map(id=>[id,null])));
    for(const entry of entries){
      if(!Number.isSafeInteger(entry.room)||entry.room<1||entry.room>8)
        throw new Error(`Invalid original room: ${entry.name}`);
      const overflowIndex=overflow.indexOf(entry);
      const bed=overflowIndex<0?bedId(unitId(entry.unit),entry.room):
        bedId(unitId(Math.max(0,...originalNumbers)+1+Math.floor(overflowIndex/BEDS_PER_UNIT)),overflowIndex%BEDS_PER_UNIT+1);
      if(placements[bed]!==null)throw new Error(`Duplicate original bed: ${bed}`);
      placements[bed]=entry.name;
    }
    const hospitalDefinitions=[], hospitalUnits={}, floorUnits={};
    for(let i=0;i<unitDefinitions.length;i+=MAX_UNITS){
      const id=hospitalId(hospitalDefinitions.length+1);
      const display_name=`Hospital ${String.fromCharCode(65+hospitalDefinitions.length)}`;
      hospitalDefinitions.push({hospital_id:id,display_name,max_units:MAX_UNITS});
      hospitalUnits[id]=unitDefinitions.slice(i,i+MAX_UNITS).map(u=>u.unit_id);
      floorUnits[id]=Array.from({length:MAX_UNITS},(_,level)=>hospitalUnits[id][level]??null);
    }
    const baseline={version:VERSION,hospitalDefinitions,hospitalUnits,floorUnits,placements,
      sorting:{preset:'original',direction:'asc'}};
    return {feedRegistry,feedMetadata,originalOrder,unitDefinitions,baseline};
  }

  function validateState(state,model) {
    const errors=[];
    if(!state||state.version!==VERSION)return ['Unsupported saved layout version'];
    const knownUnits=new Set(model.unitDefinitions.map(u=>u.unit_id));
    const knownBeds=new Set(model.unitDefinitions.flatMap(u=>u.bed_ids));
    if(!Array.isArray(state.hospitalDefinitions)||!state.hospitalUnits||
       typeof state.hospitalUnits!=='object'||!state.floorUnits||
       typeof state.floorUnits!=='object'||!state.placements||typeof state.placements!=='object')
      return ['Saved layout has missing definitions or assignments'];
    const hospitalIds=new Set(), assignedUnits=new Set(), placedFeeds=new Set();
    for(const h of state.hospitalDefinitions){
      if(!h||typeof h.hospital_id!=='string'||!/^hospital_\d{3,}$/.test(h.hospital_id)||
         hospitalIds.has(h.hospital_id)||typeof h.display_name!=='string'||!h.display_name.trim()||h.max_units!==MAX_UNITS){
        errors.push('Invalid or duplicate hospital definition');continue;
      }
      hospitalIds.add(h.hospital_id);
      const units=state.hospitalUnits[h.hospital_id];
      if(!Array.isArray(units)){errors.push(`Missing unit list for ${h.hospital_id}`);continue;}
      if(units.length>MAX_UNITS)errors.push(`${h.hospital_id} exceeds four units`);
      const floors=state.floorUnits[h.hospital_id];
      if(!Array.isArray(floors)||floors.length!==MAX_UNITS){
        errors.push(`Invalid floor slots for ${h.hospital_id}`);
      }else{
        if(JSON.stringify(floors.filter(Boolean))!==JSON.stringify(units))
          errors.push(`Floor slots differ from unit assignments in ${h.hospital_id}`);
        for(const unit of floors)if(unit!==null&&!knownUnits.has(unit))
          errors.push(`Unknown unit ${unit} in floor slots`);
      }
      for(const unit of units){
        if(!knownUnits.has(unit))errors.push(`Unknown unit ${unit}`);
        if(assignedUnits.has(unit))errors.push(`Unit ${unit} belongs to multiple hospitals`);
        assignedUnits.add(unit);
      }
    }
    for(const id of Object.keys(state.hospitalUnits))if(!hospitalIds.has(id))errors.push(`Unknown hospital ${id}`);
    for(const id of Object.keys(state.floorUnits))if(!hospitalIds.has(id))errors.push(`Unknown floor hospital ${id}`);
    for(const id of knownBeds){
      if(!Object.hasOwn(state.placements,id)){errors.push(`Missing bed ${id}`);continue;}
      const feed=state.placements[id];
      if(feed===null)continue;
      if(!model.feedRegistry.has(feed))errors.push(`Missing feed ${feed}`);
      if(placedFeeds.has(feed))errors.push(`Feed ${feed} occupies multiple beds`);
      placedFeeds.add(feed);
    }
    for(const id of Object.keys(state.placements))if(!knownBeds.has(id))errors.push(`Unknown bed ${id}`);
    if(!state.sorting||!['original','duration','breaths','manual'].includes(state.sorting.preset)||
       !['asc','desc'].includes(state.sorting.direction))errors.push('Invalid sorting configuration');
    return errors;
  }

  function loadState(raw,model) {
    if(raw===null)return {state:copy(model.baseline),issues:[],migrated:true};
    try {
      const saved=JSON.parse(raw);
      let migrated=false;
      if(saved?.version===1&&saved.hospitalUnits&&typeof saved.hospitalUnits==='object'){
        saved.floorUnits=Object.fromEntries(Object.entries(saved.hospitalUnits).map(([id,units])=>
          [id,Array.from({length:MAX_UNITS},(_,level)=>Array.isArray(units)?units[level]??null:null)]));
        saved.version=2;migrated=true;
      }
      if(saved?.version===2&&saved.placements&&saved.hospitalUnits&&saved.floorUnits){
        const next=copy(saved), extra=model.unitDefinitions.filter(u=>!Object.keys(saved.placements).includes(u.bed_ids[0]));
        const oldOverflow=Object.entries(saved.placements).filter(([bed,feed])=>/_bed_0[78]$/.test(bed)&&feed).map(([,feed])=>feed);
        next.placements=Object.fromEntries(model.unitDefinitions.flatMap(u=>u.bed_ids.map(id=>[id,saved.placements[id]??null])));
        const available=extra.flatMap(u=>u.bed_ids).concat(model.unitDefinitions.flatMap(u=>u.bed_ids).filter(id=>next.placements[id]===null));
        for(const feed of oldOverflow){const bed=available.shift();if(!bed)throw new Error('No patient bed available for saved feed');next.placements[bed]=feed;}
        for(const unit of extra){
          let hospital=next.hospitalDefinitions.find(h=>{
            const floors=next.floorUnits[h.hospital_id];
            return Array.isArray(floors)&&floors.findLastIndex(unit=>unit!==null)<MAX_UNITS-1;
          });
          if(!hospital){
            const number=Math.max(0,...next.hospitalDefinitions.map(h=>Number(h.hospital_id.slice(9))||0))+1;
            const id=hospitalId(number);
            hospital={hospital_id:id,display_name:`Hospital ${String.fromCharCode(65+next.hospitalDefinitions.length)}`,max_units:MAX_UNITS};
            next.hospitalDefinitions.push(hospital);next.hospitalUnits[id]=[];next.floorUnits[id]=Array(MAX_UNITS).fill(null);
          }
          const id=hospital.hospital_id,slot=next.floorUnits[id].findLastIndex(value=>value!==null)+1;
          next.floorUnits[id][slot]=unit.unit_id;next.hospitalUnits[id].push(unit.unit_id);
        }
        next.version=VERSION;Object.assign(saved,next);migrated=true;
      }
      const issues=validateState(saved,model);
      return issues.length?{state:copy(model.baseline),issues,migrated:false}:
        {state:saved,issues:[],migrated};
    } catch(error) {return {state:copy(model.baseline),issues:[`Saved layout could not be read: ${error.message}`],migrated:false};}
  }

  function sortFeeds(model,state,preset,direction='asc') {
    if(!['original','duration','breaths','manual'].includes(preset)||!['asc','desc'].includes(direction))
      throw new Error('Invalid sorting preset');
    if(preset==='manual') {
      const placed=Object.values(state.placements).filter(Boolean);
      const remaining=model.originalOrder.filter(id=>!placed.includes(id));
      return {ordered:placed,missing:[],unplaced:remaining};
    }
    if(preset==='original')return {ordered:[...model.originalOrder],missing:[],unplaced:[]};
    const key=preset==='duration'?'duration_seconds':'total_breaths';
    const available=[],missing=[];
    for(const id of model.originalOrder){
      const value=model.feedMetadata.get(id)?.[key];
      (Number.isFinite(value)?available:missing).push(id);
    }
    available.sort((a,b)=>{
      const d=model.feedMetadata.get(a)[key]-model.feedMetadata.get(b)[key];
      return (direction==='asc'?d:-d)||a.localeCompare(b);
    });
    missing.sort();
    return {ordered:available.concat(missing),missing,unplaced:[]};
  }

  function propose(model,state,preset,direction='asc') {
    const sorted=sortFeeds(model,state,preset,direction);
    const beds=model.unitDefinitions.flatMap(u=>u.bed_ids);
    const placements=Object.fromEntries(beds.map(id=>[id,null]));
    if(preset==='manual')Object.assign(placements,state.placements);
    else sorted.ordered.forEach((feed,i)=>{if(i<beds.length)placements[beds[i]]=feed;});
    const assigned=new Set(Object.values(placements).filter(Boolean));
    const unassigned=model.originalOrder.filter(id=>!assigned.has(id));
    const proposal={placements,unassigned,missingMetadata:sorted.missing,
      sorting:{preset,direction}};
    const errors=validateProposal(proposal,model);
    if(errors.length)throw new Error(errors.join('; '));
    return proposal;
  }

  function validateProposal(proposal,model) {
    const errors=[],seen=new Set(),beds=new Set(model.unitDefinitions.flatMap(u=>u.bed_ids));
    for(const bed of beds){
      const feed=proposal.placements?.[bed];
      if(feed===undefined){errors.push(`Missing bed ${bed}`);continue;}
      if(feed===null)continue;
      if(!model.feedRegistry.has(feed))errors.push(`Unknown feed ${feed}`);
      if(seen.has(feed))errors.push(`Duplicate feed ${feed}`);
      seen.add(feed);
    }
    for(const bed of Object.keys(proposal.placements||{}))if(!beds.has(bed))errors.push(`Unknown bed ${bed}`);
    const expected=model.originalOrder.filter(id=>!seen.has(id));
    if(JSON.stringify(expected)!==JSON.stringify(proposal.unassigned))errors.push('Unassigned feed list is incomplete');
    return errors;
  }

  function feedLocations(state,model) {
    const floorByUnit=new Map();
    for(const [hospital,units] of Object.entries(state.floorUnits))units.forEach((unit,level)=>{
      if(unit)floorByUnit.set(unit,{hospital_id:hospital,floor_id:floorId(hospital,level+1)});
    });
    const locations=new Map();
    for(const unit of model.unitDefinitions)for(const bed of unit.bed_ids){
      const feed=state.placements[bed];
      if(feed)locations.set(feed,{hospital_id:floorByUnit.get(unit.unit_id)?.hospital_id??null,
        floor_id:floorByUnit.get(unit.unit_id)?.floor_id??null,
        unit_id:unit.unit_id,bed_id:bed});
    }
    return locations;
  }
  function movementEvents(before,after,model) {
    const old=feedLocations(before,model),now=feedLocations(after,model),events=[];
    for(const id of model.originalOrder){
      const from=old.get(id)??null,to=now.get(id)??null;
      if(JSON.stringify(from)!==JSON.stringify(to))events.push({event_type:'feed_reassigned',feed_id:id,from,to});
    }
    return events;
  }
  function applyProposal(state,proposal,model) {
    const errors=validateProposal(proposal,model);
    if(errors.length)throw new Error(errors.join('; '));
    const next={...copy(state),placements:copy(proposal.placements),sorting:copy(proposal.sorting)};
    return {state:next,events:movementEvents(state,next,model)};
  }
  function createHospital(state,name) {
    if(typeof name!=='string'||!name.trim())throw new Error('Hospital name is required');
    const next=copy(state),used=new Set(next.hospitalDefinitions.map(h=>h.hospital_id));
    let number=1;while(used.has(hospitalId(number)))number++;
    const id=hospitalId(number);
    next.hospitalDefinitions.push({hospital_id:id,display_name:name.trim(),max_units:MAX_UNITS});
    next.hospitalUnits[id]=[];next.floorUnits[id]=Array(MAX_UNITS).fill(null);
    return next;
  }
  function renameHospital(state,id,name) {
    if(typeof name!=='string'||!name.trim())throw new Error('Hospital name is required');
    const next=copy(state),hospital=next.hospitalDefinitions.find(h=>h.hospital_id===id);
    if(!hospital)throw new Error(`Unknown hospital ${id}`);
    hospital.display_name=name.trim();return next;
  }
  function assignUnitToFloor(state,unitId,hospitalId,level,model) {
    if(!model.unitDefinitions.some(u=>u.unit_id===unitId))throw new Error(`Unknown unit ${unitId}`);
    if(!state.hospitalDefinitions.some(h=>h.hospital_id===hospitalId))throw new Error(`Unknown hospital ${hospitalId}`);
    if(!Number.isInteger(level)||level<1||level>MAX_UNITS)throw new Error(`Invalid floor ${level}`);
    const next=copy(state),floors=next.floorUnits[hospitalId];
    if(floors[level-1]&&floors[level-1]!==unitId)
      throw new Error(`${hospitalId} floor ${level} is occupied`);
    for(const slots of Object.values(next.floorUnits))for(let i=0;i<slots.length;i++)
      if(slots[i]===unitId)slots[i]=null;
    floors[level-1]=unitId;
    for(const [id,slots] of Object.entries(next.floorUnits))next.hospitalUnits[id]=slots.filter(Boolean);
    return next;
  }
  function assignUnit(state,unitId,hospitalId,model) {
    if(!state.floorUnits[hospitalId])throw new Error(`Unknown hospital ${hospitalId}`);
    if(state.floorUnits[hospitalId]?.includes(unitId))return copy(state);
    const level=state.floorUnits[hospitalId]?.indexOf(null)??-1;
    if(level<0)throw new Error(`${hospitalId} already has four units`);
    return assignUnitToFloor(state,unitId,hospitalId,level+1,model);
  }
  function removeUnit(state,unitId,model) {
    if(!model.unitDefinitions.some(u=>u.unit_id===unitId))throw new Error(`Unknown unit ${unitId}`);
    const next=copy(state);
    for(const slots of Object.values(next.floorUnits))for(let i=0;i<slots.length;i++)
      if(slots[i]===unitId)slots[i]=null;
    for(const [id,slots] of Object.entries(next.floorUnits))next.hospitalUnits[id]=slots.filter(Boolean);
    return next;
  }
  function floorForUnit(state,unitId){
    for(const [hospital,slots] of Object.entries(state.floorUnits)){
      const index=slots.indexOf(unitId);
      if(index>=0)return {hospital_id:hospital,floor_id:floorId(hospital,index+1),level:index+1};
    }
    return null;
  }
  function occupancy(state,model) {
    const units=Object.fromEntries(model.unitDefinitions.map(u=>[u.unit_id,
      u.bed_ids.filter(id=>state.placements[id]!==null).length]));
    const hospitals=Object.fromEntries(state.hospitalDefinitions.map(h=>[h.hospital_id,{
      units:state.hospitalUnits[h.hospital_id].length,
      feeds:state.hospitalUnits[h.hospital_id].reduce((sum,id)=>sum+units[id],0)
    }]));
    return {units,hospitals,unassigned:model.originalOrder.length-Object.values(units).reduce((a,b)=>a+b,0)};
  }
  return {VERSION,MAX_UNITS,BEDS_PER_UNIT,unitId,bedId,floorId,floorForUnit,createModel,validateState,loadState,
    sortFeeds,propose,validateProposal,applyProposal,movementEvents,createHospital,
    renameHospital,assignUnit,assignUnitToFloor,removeUnit,occupancy};
});
