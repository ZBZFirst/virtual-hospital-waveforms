/* The selected CSV is revealed at source speed in the visitor's browser. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const clock=value=>{const n=Math.max(0,Math.floor(value));return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(v=>String(v).padStart(2,'0')).join(':');};
  const median=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;const mid=sorted.length>>1;return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
  const metric=(value,unit)=>value==null?'—':`${value.toFixed(1)} ${unit}`;
  let file='',entry=null,data=null,access=null,status='paused',generation=0,cursor=0,elapsed=0,trace=[],breaths=[];
  let windowSeconds=30,binMinutes=5,lastBin=-1,lastRecentSecond=-1,chartScheduled=false;
  let frameId=0,lastFrame=0,fractional=0,nextBreath=0,loading=false;
  const sourceSeconds=index=>data?.timestamped&&Number.isFinite(data.times[0])&&Number.isFinite(data.times[index])
    ?data.times[index]-data.times[0]:index/50;
  function setStatus(next,message){
    status=next;$('room-live-state').textContent=message;
    $('room-live-pause').textContent=next==='running'?'Pause stream':next==='done'?'Stream complete':cursor?'Resume stream':'Start stream';
    $('room-live-pause').disabled=next==='done';
  }
  function reset(startSeconds=0){
    ++generation;cancelAnimationFrame(frameId);frameId=0;
    cursor=entry?Math.min(entry.samples,Math.max(0,Math.floor(startSeconds*50))):0;
    elapsed=entry?Math.min(entry.samples/50,startSeconds):0;trace=[];breaths=[];data=null;
    nextBreath=0;lastFrame=0;fractional=0;loading=false;lastBin=-1;lastRecentSecond=-1;
    $('room-live-time').textContent=clock(elapsed);$('room-live-breaths').textContent='0';
    $('room-live-progress').textContent=entry&&cursor>=entry.samples?'Recording complete · Replay feed to restart':'Waiting for source samples';
    $('room-live-recent').textContent='Awaiting BE markers…';
    $('room-live-window-count').textContent='0 complete breaths in window';
    window.RoomAnalysis.clearLive();
    setStatus(entry&&cursor>=entry.samples?'done':'paused',entry&&cursor>=entry.samples?'SOURCE COMPLETE':'READY');renderBins();draw();
  }
  function selectFeed(value,startSeconds=0){entry=value;file=value?.name||'';reset(startSeconds);}
  function start(){
    if(!file||status==='done'||status==='running'||status==='loading')return;
    const token=++generation;setStatus('loading','LOADING CSV');
    (async()=>{
      await access.ready();if(token!==generation)return;
      data=access.data(entry);
      const recent=Math.max(0,cursor-windowSeconds*50);
      await access.ensure(entry,data,Math.min(entry.samples-1,recent));
      if(token!==generation)return;
      await access.ensure(entry,data,Math.min(entry.samples-1,cursor));
      if(token!==generation)return;
      trace=[];
      for(let i=recent;i<cursor;i++)if(Number.isFinite(data.flow[i])&&Number.isFinite(data.pressure[i]))
        trace.push([data.flow[i],data.pressure[i],sourceSeconds(i)]);
      draw();
      nextBreath=data.completed.findIndex(b=>b.end>cursor);if(nextBreath<0)nextBreath=data.completed.length;
      access.advance(entry,elapsed);
      setStatus('running','PLAYING');lastFrame=performance.now();frameId=requestAnimationFrame(frame);
      $('loadStatus').textContent=`Real-Time Feed · ${$('room-live-speed').value}×`;
    })().catch(error=>{if(token!==generation)return;setStatus('paused','SOURCE ERROR');
      $('room-live-progress').textContent=`CSV range unavailable: ${error.message}`;});
  }
  function pause(){
    ++generation;cancelAnimationFrame(frameId);frameId=0;lastFrame=0;
    if(status==='running'||status==='loading'){
      setStatus('paused','PAUSED');
      if($('waveformPanel').dataset.roomMode==='live')$('loadStatus').textContent='Real-Time Feed · paused';
    }
  }
  function frame(now){
    frameId=0;if(status!=='running'||!data)return;
    fractional+=Math.min(.25,(now-lastFrame)/1000)*50*(Number($('room-live-speed').value)||1);lastFrame=now;
    const count=Math.floor(fractional);fractional-=count;
    if(count){
      const target=Math.min(data.flow.length,cursor+count),segment=access.segment(entry,cursor);
      if(target>segment.coreEnd-100&&target<data.flow.length&&!loading){
        loading=true;access.ensure(entry,data,Math.min(data.flow.length-1,segment.coreEnd))
          .then(()=>{loading=false;}).catch(error=>{loading=false;pause();setStatus('paused','SOURCE ERROR');
            $('room-live-progress').textContent=`Next CSV range unavailable: ${error.message}`;});
      }
      let available=target;
      while(available>cursor&&!Number.isFinite(data.flow[available-1]))available--;
      if(available===cursor&&!loading&&cursor<data.flow.length){
        loading=true;access.ensure(entry,data,cursor).then(()=>{loading=false;})
          .catch(error=>{loading=false;pause();setStatus('paused','SOURCE ERROR');
            $('room-live-progress').textContent=`CSV continuation unavailable: ${error.message}`;});
      }
      if(available>cursor){
        for(let i=cursor;i<available;i++)trace.push([data.flow[i],data.pressure[i],sourceSeconds(i)]);
        cursor=available;elapsed=sourceSeconds(cursor-1);
        access.advance(entry,elapsed);
        while(trace.length&&trace[0][2]<elapsed-60.1)trace.shift();
        while(nextBreath<data.completed.length&&data.completed[nextBreath].end<=cursor){
          const b=data.completed[nextBreath++];if(breaths.some(item=>item.start===b.start))continue;
          const starts=access.sequence(entry.name),ordinal=starts?starts.indexOf(b.start)+1:breaths.length+1;
          const sourceMarker=data.markers.find(marker=>marker.kind==='BS'&&marker.index===b.start)?.sourceMarker;
          const breath={number:breaths.length+1,sequence:ordinal||breaths.length+1,start:b.start,end:b.end,
            start_elapsed:sourceSeconds(b.start),end_elapsed:sourceSeconds(Math.min(b.end,data.flow.length-1)),
            marker:sourceMarker||'BS',metrics:[b.vti,b.vte,b.pifr,b.pefr,b.peakPressure,b.peep,b.map]};
          breaths.push(breath);window.RoomAnalysis.showLiveBreath(breath);
          window.RoomAnalysis.showLiveResearch(access.analyze(data,b,breath));
          $('room-live-breaths').textContent=breaths.length.toLocaleString();renderRecent();renderBins();
        }
        $('room-live-time').textContent=clock(elapsed);
        $('room-live-progress').textContent=`${cursor.toLocaleString()} CSV samples revealed · ${breaths.length.toLocaleString()} complete breaths`;
        const bin=Math.floor(elapsed/(binMinutes*60));if(bin!==lastBin){lastBin=bin;renderBins();}
        const second=Math.floor(elapsed);if(second!==lastRecentSecond){lastRecentSecond=second;renderRecent();}
        scheduleDraw();
      }
    }
    if(cursor>=data.flow.length){elapsed=entry.samples/50;access.advance(entry,elapsed);setStatus('done','SOURCE COMPLETE');renderBins();return;}
    frameId=requestAnimationFrame(frame);
  }
  function renderRecent(){
    const area=$('room-live-recent');area.replaceChildren();
    const current=breaths.filter(breath=>breath.end_elapsed>=elapsed-windowSeconds);
    $('room-live-window-count').textContent=`${current.length} complete breath${current.length===1?'':'s'} in window`;
    if(!current.length){area.textContent='Awaiting BE markers in this window…';return;}
    for(const breath of current.slice(-20).reverse()){
      const chip=document.createElement('span');
      const number=String(breath.sequence||breath.number).padStart(4,'0');
      chip.textContent=`BS${number} @ ${clock(breath.start_elapsed)} · VTi ${metric(breath.metrics?.[0],'mL')}`;
      area.append(chip);
    }
  }
  function renderBins(){
    const size=binMinutes*60,grouped=new Map();
    for(const breath of breaths){const index=Math.floor(breath.start_elapsed/size);if(!grouped.has(index))grouped.set(index,[]);grouped.get(index).push(breath);}
    const current=Math.floor(elapsed/size),currentItems=grouped.get(current)||[];
    $('room-live-bin-breaths').textContent=currentItems.length.toLocaleString();
    $('room-live-vti').textContent=metric(median(currentItems.map(b=>b.metrics?.[0])),'mL');
    const body=$('room-bin-rows');body.replaceChildren();
    const last=Math.max(current,...grouped.keys(),0);
    for(let index=Math.max(0,last-5);index<=last;index++){
      const items=grouped.get(index)||[],done=elapsed>=(index+1)*size;
      const values=[`${clock(index*size)}–${clock((index+1)*size)}`,
        done?'COMPLETE':status==='done'?'FINAL PARTIAL':'FILLING',String(items.length),
        metric(median(items.map(b=>b.metrics?.[0])),'mL'),
        metric(median(items.map(b=>b.metrics?.[1])),'mL'),
        metric(median(items.map(b=>b.metrics?.[4])),'cmH₂O'),
        metric(median(items.map(b=>b.metrics?.[5])),'cmH₂O')];
      const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);
    }
  }
  function drawChannel(id,channel,color){
    const canvas=$(id),width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight),dpr=Math.min(devicePixelRatio||1,2);
    const backingWidth=Math.round(width*dpr),backingHeight=Math.round(height*dpr);
    if(canvas.width!==backingWidth||canvas.height!==backingHeight){canvas.width=backingWidth;canvas.height=backingHeight;}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#0b1f2a';ctx.fillRect(0,0,width,height);
    const values=trace.filter(sample=>sample[2]>=elapsed-windowSeconds);
    if(!values.length){$(channel?'pressureValue':'flowValue').textContent='—';return;}
    const data=values.map(sample=>sample[channel]);
    let min=Infinity,max=-Infinity;
    for(const value of data)if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}
    if(!Number.isFinite(min)){$(channel?'pressureValue':'flowValue').textContent='unavailable';return;}
    ({min,max}=WaveformAxis.observe(window.RoomChartAxes.get(channel?'pressure':'flow'),min,max));
    const labels=WaveformAxis.tickLabels(min,max),top=8,bottom=8,plotHeight=height-top-bottom;
    ctx.font='11px system-ui';
    const left=Math.max(42,Math.ceil(Math.max(...labels.map(label=>ctx.measureText(label).width)))+11);
    const plotWidth=Math.max(1,width-left-8);
    ctx.strokeStyle='#294754';ctx.fillStyle='#9ab9c5';ctx.lineWidth=1;ctx.textAlign='right';ctx.textBaseline='middle';
    for(let i=0;i<=4;i++){
      const y=top+i*plotHeight/4;
      ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-8,y);ctx.stroke();
      ctx.fillText(labels[i],left-6,y);
    }
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();
    let drawing=false;
    for(let i=0;i<values.length;i++){
      if(!Number.isFinite(data[i])){drawing=false;continue;}
      const x=elapsed<windowSeconds
        ?left+values[i][2]/windowSeconds*plotWidth
        :left+plotWidth-(elapsed-values[i][2])/windowSeconds*plotWidth;
      const y=top+(max-data[i])/(max-min)*plotHeight;
      if(drawing)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      drawing=true;
    }
    ctx.stroke();
    const latest=data.at(-1);
    $(channel?'pressureValue':'flowValue').textContent=Number.isFinite(latest)?`${latest.toFixed(1)} ${channel?'cmH₂O':'L/min'}`:'unavailable';
  }
  function draw(){if($('waveformPanel').dataset.roomMode!=='live')return;drawChannel('flowChart',0,'#58d5ce');drawChannel('pressureChart',1,'#ffc274');}
  function scheduleDraw(){if(chartScheduled)return;chartScheduled=true;requestAnimationFrame(()=>{chartScheduled=false;draw();});}
  function mount(api){access=api;
    $('room-live-pause').addEventListener('click',()=>{if(status==='running'||status==='loading')pause();else if(status!=='done')start();});
    $('room-live-restart').addEventListener('click',()=>{access.replay(entry);reset();start();});
    $('room-live-speed').addEventListener('change',()=>{if(status==='running'){pause();start();}});
    $('room-live-window').addEventListener('change',()=>{windowSeconds=Number($('room-live-window').value);draw();renderRecent();});
    document.querySelectorAll('[data-room-bin]').forEach(button=>button.addEventListener('click',()=>{
      binMinutes=Number(button.dataset.roomBin);lastBin=Math.floor(elapsed/(binMinutes*60));
      document.querySelectorAll('[data-room-bin]').forEach(item=>item.classList.toggle('selected',item===button));
      renderBins();
    }));
    window.addEventListener('resize',()=>{if($('waveformPanel').dataset.roomMode==='live')scheduleDraw();});
  }
  window.RoomLive={mount,selectFeed,start,pause,draw,elapsed:()=>elapsed,isRunning:()=>status==='running'};
})();
