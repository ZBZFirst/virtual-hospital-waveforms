// One channel catalog and one sampler serve every in-scene waveform display.
// Layouts decide which channels a display exposes; assignments decide sources.
const monitorChannels = {
  ecg: {source:'vital', key:'ecg lead ii', label:'ECG II', unit:'mV', color:'#40db91', fallback:[-2,2]},
  art: {source:'vital', key:'art', label:'ART', unit:'mmHg', color:'#eeac59', fallback:[0,200]},
  cvp: {source:'vital', key:'cvp', label:'CVP', unit:'mmHg', color:'#5ed7ed', fallback:[-10,30]},
  pap: {source:'vital', key:'pap', label:'PAP', unit:'mmHg', color:'#e2b4f2', fallback:[0,80]},
  pressure: {source:'vent', key:'pressure_cm_h2o', label:'P', unit:'cmH₂O', color:'#f0a256', fallback:[0,50]},
  flow: {source:'vent', key:'flow_l_min', label:'Flow', unit:'L/min', color:'#79e1a0', fallback:[-60,60]},
  volume: {source:'vent', key:'volume_ml', label:'V calc', unit:'mL', color:'#65d3e1', fallback:[0,800]},
};
const monitorLayouts = Object.freeze({
  ventilator: Object.freeze(['pressure','flow','volume']),
  telemetry: Object.freeze(['ecg','art','cvp','pap']),
  unit: Object.freeze(['ecg','art','cvp','pap','pressure','flow','volume']),
});

function makeMonitorSurface(layout,width,height,materialOptions={}) {
  if(!monitorLayouts[layout])throw Error(`Unknown monitor layout: ${layout}`);
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,
    toneMapped:false,depthTest:true,depthWrite:true,...materialOptions});
  return {layout,canvas,texture,material};
}

function monitorIntersects(screen,frustum) {
  if(screen.object && screen.worldBox?.setFromObject){
    screen.worldBox.setFromObject(screen.object);
    if(screen.center)screen.worldBox.getCenter(screen.center);
  }
  return frustum.intersectsBox(screen.worldBox);
}

function monitorChannelState(channelId, sources, elapsed) {
  const channel=monitorChannels[channelId];
  if(!channel)throw Error(`Unknown monitor channel: ${channelId}`);
  const record=sources[channel.source], assignment=sources.assignment;
  const assigned=channel.source==='vital'?assignment?.telemetry_record:assignment?.uc_davis_recording;
  if(!record)return {channel,range:channel.fallback,status:assigned?'LOADING':assignment?.patient_id?'NO SOURCE':'UNASSIGNED',sample:()=>null};
  if(channel.source==='vital'){
    const info=record.channels[channel.key];
    const range=record.chartRanges?.[channel.key] || channel.fallback;
    if(!info)return {channel,range,status:'NO CHANNEL',sample:()=>null};
    if(!isCached(record,elapsed))return {channel,range,status:'BUFFERING',sample:()=>null};
    const end=recordClock(record,elapsed),start=end-record.windows.length;
    return {channel,range,status:null,count:record.windows.length,sample:index=>{
      const clock=start+index,offset=((clock%record.samples)+record.samples)%record.samples;
      const digital=decodeWindowSample(offset,info.index,record.count,record.parts);
      return digital===null?null:(digital-info.baseline)/info.gain;
    }};
  }
  const values=record[channel.key];
  const range=({pressure:record.pressureRange,flow:record.flowRange,volume:record.volumeRange})[channelId] || channel.fallback;
  if(!Array.isArray(values))return {channel,range,status:'NO SOURCE',sample:()=>null};
  const start=record.external?0:Math.min(499,Math.floor((elapsed%10)*50));
  return {channel,range,status:null,count:250,sample:index=>values[start+index]};
}

function drawMonitorChannel(c, state, box, options={}) {
  const {x,y,width,height}=box,compact=Boolean(options.compact),plotX=x+(compact?91:140),plotW=width-(compact?101:154);
  const {channel,range}=state;
  c.fillStyle=options.index%2?'#10252c':'#0b1f26';c.fillRect(x,y,width,height-2);
  c.fillStyle=channel.color;c.font=`bold ${compact?16:18}px system-ui`;
  c.fillText(`${channel.label}${compact?'':` ${channel.unit}`}`,x+9,y+(compact?20:28));
  if(!compact){c.fillStyle='#89a9af';c.font='12px system-ui';c.fillText(`${range[0].toFixed(0)} to ${range[1].toFixed(0)}`,x+9,y+47);}
  c.strokeStyle='#24464e';c.lineWidth=1;
  for(let tick=0;tick<5;tick++){
    const gx=plotX+tick*plotW/4;c.beginPath();c.moveTo(gx,y+3);c.lineTo(gx,y+height-5);c.stroke();
  }
  if(state.status){c.fillStyle='#829da4';c.font='14px system-ui';c.fillText(state.status,plotX+8,y+height/2);return;}
  const count=state.count,columns=Math.max(1,Math.floor(plotW)),scale=value=>
    y+height-8-Math.max(0,Math.min(1,(value-range[0])/(range[1]-range[0]||1)))*(height-16);
  c.strokeStyle=channel.color;c.lineWidth=compact?1.65:2;c.beginPath();
  let previous=false,plotted=0;
  for(let pixel=0;pixel<columns;pixel++){
    const from=Math.floor(pixel*count/columns),to=Math.max(from+1,Math.floor((pixel+1)*count/columns));
    let low=Infinity,high=-Infinity;
    for(let index=from;index<to;index++){
      const value=state.sample(index);
      if(Number.isFinite(value)){low=Math.min(low,value);high=Math.max(high,value);}
    }
    if(!Number.isFinite(low)){previous=false;continue;}
    const px=plotX+pixel,mid=scale((low+high)/2);
    if(previous)c.lineTo(px,mid);else c.moveTo(px,mid);
    previous=true;plotted++;
    if(high>low){c.moveTo(px,scale(low));c.lineTo(px,scale(high));c.moveTo(px,mid);}
  }
  if(plotted)c.stroke();
  else {c.fillStyle='#829da4';c.font='14px system-ui';c.fillText('NO SAMPLES',plotX+8,y+height/2);}
}

function drawMonitorLayout(c, layout, sources, elapsed, area, options={}) {
  const ids=monitorLayouts[layout];
  if(!ids)throw Error(`Unknown monitor layout: ${layout}`);
  const rowHeight=area.height/ids.length;
  ids.forEach((id,index)=>drawMonitorChannel(c,monitorChannelState(id,sources,elapsed),
    {x:area.x,y:area.y+index*rowHeight,width:area.width,height:rowHeight},
    {...options,index}));
}
