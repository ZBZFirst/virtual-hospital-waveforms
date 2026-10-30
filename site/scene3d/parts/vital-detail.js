function openVitalDetail(assignment, source='vital') {
  const panel=document.querySelector('#telemetryDetail');
  telemetryDetail={assignment,source,paused:false,elapsed:null,offset:0};
  movementKeys.clear();
  document.querySelector('#telemetryTitle').textContent=`${assignment.id} · Patient Waveforms`;
  document.querySelector('#vitalPlay').textContent='Pause';
  document.querySelector('#vitalProgress').textContent='Loading full source waveform…';
  panel.classList.add('open');
  document.querySelector('#closeTelemetry').focus();
  selectVitalDetailTab(source);
  paintTelemetryDetail(performance.now());
}

function selectVitalDetailTab(source) {
  if(!telemetryDetail)return;
  const assignment=telemetryDetail.assignment;
  if(source==='vent' && assignment.uc_davis_recording){
    document.querySelector('#telemetryDetail').classList.remove('open');
    telemetryDetail=null;
    parent.postMessage({type:'zebezo-open-recording',recording:assignment.uc_davis_recording,roomId:assignment.id},location.origin);
    return;
  }
  telemetryDetail.source=source;
  const vital=source==='vital';
  for(const [id,selected] of [['vitalTab',vital],['ventTab',!vital]]){
    const button=document.querySelector(`#${id}`);
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  const hasSource=vital?Boolean(assignment.telemetry_record):Boolean(assignment.uc_davis_recording);
  document.querySelector('#vitalCharts').hidden=!vital||!hasSource;
  document.querySelector('#vitalPlaybackControls').hidden=!vital||!hasSource;
  const empty=document.querySelector('#vitalNoSource');
  empty.hidden=hasSource;
  if(!hasSource){
    empty.textContent=`No ${vital?'vital':'ventilator'} waveform recording is assigned to this patient.`;
    document.querySelector('#vitalProgress').textContent='No source for this patient';
  } else document.querySelector('#vitalProgress').textContent='Loading full source waveform…';
}

function vitalDetailRanges(record, elapsed, seconds) {
  const end=recordClock(record,elapsed),start=end-Math.round(seconds*record.fs);
  return channels.map(channel=>{
    const info=record.channels[channel.key.toLowerCase()];
    if(!info)return [channel.min,channel.max];
    let low=Infinity,high=-Infinity;
    for(let clock=start;clock<end;clock++){
      const sample=((clock%record.samples)+record.samples)%record.samples;
      const digital=decodeWindowSample(sample,info.index,record.count,record.parts);
      if(digital===null)continue;
      const value=(digital-info.baseline)/info.gain;
      low=Math.min(low,value);high=Math.max(high,value);
    }
    if(!Number.isFinite(low))return [channel.min,channel.max];
    const pad=Math.max((high-low)*.08,channel.key==='ART'?10:2);
    return [low-pad,high+pad];
  });
}

function drawVitalChart(canvas, record, channel, range, elapsed, seconds) {
  const pixelRatio=Math.min(devicePixelRatio||1,2);
  const width=Math.max(360,Math.round(canvas.clientWidth*pixelRatio));
  const height=Math.round(180*pixelRatio);
  if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;}
  const c=canvas.getContext('2d');
  const w=width/pixelRatio,h=height/pixelRatio;
  c.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  c.fillStyle='#0b1f2a';c.fillRect(0,0,w,h);
  const left=74,right=15,top=20,bottom=26,plotW=w-left-right,plotH=h-top-bottom;
  const key=channel.key.toLowerCase(),info=record.channels[key];
  c.fillStyle='#cce4e7';c.font='bold 14px system-ui';c.fillText(`${channel.label} · ${channel.unit}`,12,15);
  c.strokeStyle='#28505a';c.fillStyle='#91aeb6';c.font='11px system-ui';
  for(let tick=0;tick<=4;tick++){
    const y=top+tick*plotH/4;
    c.beginPath();c.moveTo(left,y);c.lineTo(w-right,y);c.stroke();
    c.fillText((range[1]-(range[1]-range[0])*tick/4).toFixed(0),10,y+4);
  }
  if(!info){c.fillText('No source channel',left+12,top+plotH/2);return;}
  const end=recordClock(record,elapsed),start=end-Math.round(seconds*record.fs);
  let previous=null,plotted=0;
  c.strokeStyle=channel.color;c.lineWidth=1.5;c.beginPath();
  for(let x=0;x<Math.floor(plotW);x++){
    const from=start+Math.floor(x*(end-start)/plotW);
    const to=start+Math.max(1,Math.floor((x+1)*(end-start)/plotW));
    let lo=Infinity,hi=-Infinity;
    for(let clock=from;clock<to;clock++){
      const sample=((clock%record.samples)+record.samples)%record.samples;
      const digital=decodeWindowSample(sample,info.index,record.count,record.parts);
      if(digital===null)continue;
      const value=(digital-info.baseline)/info.gain;
      lo=Math.min(lo,value);hi=Math.max(hi,value);
    }
    if(!Number.isFinite(lo)){previous=null;continue;}
    const scale=value=>top+plotH-THREE.MathUtils.clamp((value-range[0])/(range[1]-range[0]||1),0,1)*plotH;
    const middle=scale((lo+hi)/2);
    if(previous===null)c.moveTo(left+x,middle);else c.lineTo(left+x,middle);
    previous=middle;plotted++;
    if(hi!==lo){c.moveTo(left+x,scale(hi));c.lineTo(left+x,scale(lo));c.moveTo(left+x,middle);}
  }
  c.stroke();
  if(!plotted){c.fillStyle='#91aeb6';c.fillText('Loading source samples…',left+12,top+plotH/2);}
  c.fillStyle='#91aeb6';c.font='11px system-ui';
  for(let tick=0;tick<=4;tick++){
    const x=left+tick*plotW/4;
    c.fillText(`${Math.round(seconds*(tick/4-1))} s`,x-10,h-7);
  }
}

async function paintTelemetryDetail(now) {
  if(!telemetryDetail || telemetryDetail.source!=='vital' || !telemetryDetail.assignment.telemetry_record || now-lastDetailPaint<33)return;
  lastDetailPaint=now;
  const detail=telemetryDetail;
  const sceneElapsed=exportElapsedSeconds??(now-playbackStart)/1000;
  const elapsed=detail.paused?detail.elapsed:sceneElapsed-detail.offset;
  try{
    const record=await getRecord(detail.assignment.telemetry_record);
    if(telemetryDetail!==detail)return;
    const seconds=Number(document.querySelector('#vitalWindow').value);
    await fillRecordCache(record,elapsed,seconds);
    if(telemetryDetail!==detail || !isCached(record,elapsed,0,seconds))return;
    detail.ranges ||= vitalDetailRanges(record,elapsed,seconds);
    const sourceTime=((recordClock(record,elapsed)%record.samples)+record.samples)%record.samples/record.fs;
    document.querySelector('#vitalProgress').textContent=`Full ${record.fs} Hz source · ${Math.floor(sourceTime/60)}:${String(Math.floor(sourceTime%60)).padStart(2,'0')} / ${Math.floor(record.duration/60)}:${String(Math.floor(record.duration%60)).padStart(2,'0')}`;
    channels.forEach((channel,index)=>drawVitalChart(document.querySelector(`#vitalChart${index}`),record,channel,detail.ranges[index],elapsed,seconds));
  }catch(error){if(telemetryDetail===detail)document.querySelector('#vitalProgress').textContent=`Vital waveform unavailable: ${error.message}`;}
}
