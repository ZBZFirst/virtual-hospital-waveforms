function listEntries() {
  els.list.replaceChildren();
  const visible=state.entries.filter(e=>!state.filter||matchesFilter(e));
  els.listCount.textContent=`${visible.length} of ${state.entries.length} feeds`;
  const fragment=document.createDocumentFragment();
  for(const e of visible){
    const button=document.createElement('button');button.className='recording-item'+(e===state.selected?' selected':'');button.type='button';
    const virtualRoom=fullCatalogByRecording.get(e.name);
    const strong=document.createElement('strong');strong.textContent=`${virtualRoom?`Hospital ${virtualRoom.hospital_id} · Floor ${virtualRoom.floor} · Room ${String(virtualRoom.room).padStart(2,'0')}`:
      e.unit===null?'Unassigned':`Unit ${String(e.unit).padStart(2,'0')} · Room ${String(e.room).padStart(2,'0')}`} · ${clock(e.samples/RATE)}`;
    const small=document.createElement('small');small.textContent=`${e.shiftedStart}${e.suffix?' · '+e.suffix:''} · ${e.id.slice(0,12)}…`;
    button.title=e.name;button.append(strong,small);button.onclick=()=>selectEntry(e);fragment.append(button);
  }
  els.list.append(fragment);
}
function bytesLabel(bytes){return `${(bytes/1048576).toFixed(1)} MiB`;}
function renderSegmentProgress(stats){
  els.segmentProgressBar.max=stats.totalBytes||1;
  els.segmentProgressBar.value=stats.verifiedBytes;
  els.segmentProgressBar.hidden=stats.firstBytesReceived===0;
  els.segmentProgressText.textContent=`Full-resolution recordings load on demand · ${stats.ready}/${stats.total} initial ranges cached · ${bytesLabel(stats.firstBytesReceived)} transferred · ${stats.failed} failed`;
  els.segmentFailures.hidden=!stats.failed;els.retrySegments.hidden=!stats.failed;
  els.segmentFailureList.replaceChildren(...stats.failures.map(failure=>{
    const item=document.createElement('li');item.textContent=`${failure.name}: ${failure.error}`;return item;
  }));
}
function segmentNumber(entry,sample){
  const segments=state.segmentStore.index.feeds[entry.name].segments;
  let low=0,high=segments.length-1;
  while(low<high){const mid=(low+high)>>1;if(sample<segments[mid].coreEnd)high=mid;else low=mid+1;}
  return low;
}
function feedData(entry){
  let data=state.cache.get(entry.name);
  if(data){state.cache.delete(entry.name);state.cache.set(entry.name,data);return data;}
  data=SegmentedWaveform.create(state.segmentStore.index.feeds[entry.name]);
  state.cache.set(entry.name,data);
  if(state.cache.size>8)state.cache.delete(state.cache.keys().next().value);
  return data;
}
function analyzeBrowser(data,complete,breath){
  const start=complete.start,end=complete.end;
  if(data.timestamped){
    for(let i=start+1;i<end;i++){
      const dt=data.times[i]-data.times[i-1];
      if(!Number.isFinite(dt)||dt<=0||dt>.1)return {status:'unavailable',breath:breath.number,
        reason:'Invalid source timestamp interval in this breath.'};
    }
  }
  return BrowserResearch.analyze(data.flow.subarray(start,end),data.pressure.subarray(start,end),
    breath.number,breath.marker,1/RATE);
}
function ensureSegment(entry,data,number){
  if(data.loadedSegments.has(number))return Promise.resolve(data);
  if(data.loadingSegments.has(number))return data.loadingSegments.get(number);
  data.failedSegments.delete(number);
  const request=(async()=>{
    const bytes=await state.segmentStore.get(entry.name,number);
    const parsed=SegmentedWaveform.parse(new TextDecoder().decode(bytes));
    SegmentedWaveform.ingest(data,state.segmentStore.segment(entry.name,number),number,
      parsed,CalculatedVolume,BreathMetrics,RATE);
    if(state.selected===entry&&state.data===data){
      els.loadStatus.textContent=`Ready · ${state.active?'playing':'paused'} at ${els.speed.value}×${data.bad?` · ${data.bad} unparsed line(s)`:''}`;
      drawAll();
    }
    return data;
  })().catch(error=>{data.failedSegments.add(number);throw error;})
    .finally(()=>data.loadingSegments.delete(number));
  data.loadingSegments.set(number,request);
  return request;
}
function ensureAt(entry,data,sample){return ensureSegment(entry,data,segmentNumber(entry,sample));}
