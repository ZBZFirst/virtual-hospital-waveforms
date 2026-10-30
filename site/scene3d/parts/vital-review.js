const vitalOverviewLoads=new Map();

function formatVitalTime(seconds) {
  const whole=Math.max(0,Math.floor(seconds));
  const hours=Math.floor(whole/3600),minutes=Math.floor(whole%3600/60),rest=String(whole%60).padStart(2,'0');
  return hours?`${hours}:${String(minutes).padStart(2,'0')}:${rest}`:`${minutes}:${rest}`;
}

function loadVitalOverview(record) {
  if(!vitalOverviewLoads.has(record.id))vitalOverviewLoads.set(record.id,
    fetch(`./mgh-overviews/${record.id}.json?v=20261030-vital-review1`).then(response=>{
      if(!response.ok)throw Error(`Overview HTTP ${response.status}`);
      return response.json();
    }).then(value=>{
      if(value.id!==record.id || value.rate!==record.fs || value.samples!==record.samples)
        throw Error('Overview does not match the source recording');
      return value;
    }).catch(error=>{vitalOverviewLoads.delete(record.id);throw error;}));
  return vitalOverviewLoads.get(record.id);
}

async function selectVitalMode(mode) {
  const detail=telemetryDetail;
  if(!detail || detail.source!=='vital' || !detail.assignment.telemetry_record)return;
  detail.mode=mode;
  detail.ranges=null;
  detail.reviewPlaying=false;
  detail.lastReviewFrame=0;
  for(const [id,selected] of [['vitalLiveTab',mode==='live'],['vitalReviewTab',mode==='review']]){
    const button=document.querySelector(`#${id}`);
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  document.querySelector('#vitalReviewControls').hidden=mode!=='review';
  document.querySelector('#vitalLivePlay').hidden=mode!=='live';
  document.querySelector('#vitalReviewPlay').hidden=mode!=='review';
  if(mode!=='review'){lastDetailPaint=0;return;}
  document.querySelector('#vitalProgress').textContent='Loading full recording timeline…';
  try{
    const record=await getRecord(detail.assignment.telemetry_record);
    if(telemetryDetail!==detail || detail.mode!=='review')return;
    detail.record=record;
    const liveElapsed=detail.paused?detail.elapsed:
      (exportElapsedSeconds??(performance.now()-playbackStart)/1000)-detail.offset;
    const sourceClock=recordClock(record,liveElapsed);
    detail.reviewSeconds=((sourceClock%record.samples)+record.samples)%record.samples/record.fs;
    setVitalReviewPosition(detail.reviewSeconds);
    loadVitalOverview(record).then(overview=>{
      if(telemetryDetail!==detail)return;
      detail.overview=overview;
      detail.overviewBase=null;
      drawVitalOverview(detail,record);
    }).catch(error=>{
      if(telemetryDetail===detail)document.querySelector('#vitalProgress').textContent=`Overview unavailable: ${error.message}`;
    });
    lastDetailPaint=0;
    paintTelemetryDetail(performance.now());
  }catch(error){
    if(telemetryDetail===detail)document.querySelector('#vitalProgress').textContent=`Vital review unavailable: ${error.message}`;
  }
}

function setVitalReviewPosition(seconds) {
  const detail=telemetryDetail;
  if(!detail?.record || detail.mode!=='review')return;
  detail.reviewSeconds=THREE.MathUtils.clamp(seconds,0,detail.record.duration);
  detail.ranges=null;
  detail.lastReviewFrame=performance.now();
  document.querySelector('#vitalScrub').value=String(Math.round(detail.reviewSeconds/detail.record.duration*1000));
  document.querySelector('#vitalPosition').textContent=
    `${formatVitalTime(detail.reviewSeconds)} / ${formatVitalTime(detail.record.duration)}`;
  lastDetailPaint=0;
  if(detail.overview)drawVitalOverview(detail,detail.record);
}

function advanceVitalReview(detail,record,now) {
  if(detail.reviewPlaying){
    if(detail.lastReviewFrame)detail.reviewSeconds=Math.min(record.duration,
      detail.reviewSeconds+Math.min(.25,(now-detail.lastReviewFrame)/1000)*Number(document.querySelector('#vitalReviewSpeed').value));
    if(detail.reviewSeconds>=record.duration){detail.reviewPlaying=false;document.querySelector('#vitalReviewPlay').textContent='Play';}
  }
  detail.lastReviewFrame=now;
  document.querySelector('#vitalScrub').value=String(Math.round(detail.reviewSeconds/record.duration*1000));
  document.querySelector('#vitalPosition').textContent=
    `${formatVitalTime(detail.reviewSeconds)} / ${formatVitalTime(record.duration)}`;
}

function drawVitalOverview(detail,record) {
  const canvas=document.querySelector('#vitalOverview');
  if(canvas.closest('[hidden]'))return;
  const ratio=Math.min(devicePixelRatio||1,2),width=Math.max(360,Math.round(canvas.clientWidth*ratio));
  const height=Math.round(240*ratio),w=width/ratio,h=height/ratio;
  if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;detail.overviewBase=null;}
  const c=canvas.getContext('2d');
  c.setTransform(ratio,0,0,ratio,0,0);
  if(!detail.overview){c.fillStyle='#0b1f2a';c.fillRect(0,0,w,h);c.fillStyle='#a7cbd2';c.fillText('Loading complete-recording overview…',16,28);return;}
  if(!detail.overviewBase){
    const base=document.createElement('canvas');base.width=width;base.height=height;
    const b=base.getContext('2d');b.setTransform(ratio,0,0,ratio,0,0);
    b.fillStyle='#0b1f2a';b.fillRect(0,0,w,h);
    const left=78,right=12,plotW=w-left-right;
    channels.forEach((channel,row)=>{
      const top=8+row*58,plotH=43,bins=detail.overview.channels[channel.key.toLowerCase()];
      b.fillStyle='#a7cbd2';b.font='12px system-ui';b.fillText(channel.label,8,top+17);
      b.strokeStyle='#274550';b.beginPath();b.moveTo(left,top+plotH/2);b.lineTo(w-right,top+plotH/2);b.stroke();
      if(!bins)return;
      let low=Infinity,high=-Infinity;
      for(const pair of bins)if(pair){low=Math.min(low,pair[0]);high=Math.max(high,pair[1]);}
      if(!Number.isFinite(low))return;
      const span=high-low||1;
      b.strokeStyle=channel.color;b.lineWidth=1;b.beginPath();
      for(let x=0;x<Math.floor(plotW);x++){
        const first=Math.floor(x*bins.length/plotW),last=Math.max(first+1,Math.ceil((x+1)*bins.length/plotW));
        let lo=Infinity,hi=-Infinity;
        for(let bin=first;bin<last;bin++)if(bins[bin]){lo=Math.min(lo,bins[bin][0]);hi=Math.max(hi,bins[bin][1]);}
        if(!Number.isFinite(lo))continue;
        const y1=top+plotH-(hi-low)/span*plotH,y2=top+plotH-(lo-low)/span*plotH;
        b.moveTo(left+x,y1);b.lineTo(left+x,y2);
      }
      b.stroke();
    });
    detail.overviewBase=base;
  }
  c.drawImage(detail.overviewBase,0,0,w,h);
  const marker=78+detail.reviewSeconds/record.duration*(w-90);
  c.strokeStyle='#fff0c7';c.lineWidth=2;c.beginPath();c.moveTo(marker,0);c.lineTo(marker,h);c.stroke();
}
