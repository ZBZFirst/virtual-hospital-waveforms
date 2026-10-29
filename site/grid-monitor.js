/* Independent, draggable room monitors over the two-cube view. */
(function(root){
  const RATE=50,MAX_WINDOWS=4;
  const pad=number=>String(number).padStart(2,'0');
  const time=seconds=>{
    const value=Math.max(0,seconds);
    return `${Math.floor(value/3600)?`${Math.floor(value/3600)}:`:''}${pad(Math.floor(value%3600/60))}:${pad(Math.floor(value%60))}`;
  };
  class GridMonitor {
    constructor(layer,options){
      this.layer=layer;this.options=options;this.windows=new Map();this.nextZ=1;this.raf=0;
      addEventListener('resize',()=>{
        if(this.windows.size&&!this.supported())this.closeAll();
        else if(this.windows.size)this.tile();
      });
    }
    supported(){return screen.width>=1920&&screen.height>=1080&&innerWidth>=1500&&innerHeight>=750;}
    slots(){
      const margin=22,gap=16,top=70;
      const width=Math.floor((innerWidth-2*margin-gap)/2);
      const height=Math.floor((innerHeight-top-margin-gap)/2);
      return Array.from({length:MAX_WINDOWS},(_,index)=>({
        left:margin+(index%2)*(width+gap),top:top+Math.floor(index/2)*(height+gap),width,height
      }));
    }
    showLayer(){
      this.layer.hidden=false;
      if(!this.layer.querySelector('.grid-toolbar')){
        const toolbar=document.createElement('div');toolbar.className='grid-toolbar';
        const title=document.createElement('strong');title.textContent='GRID Monitor';
        const count=document.createElement('span');count.className='grid-count';
        const arrange=document.createElement('button');arrange.type='button';arrange.textContent='Arrange grid';arrange.onclick=()=>this.tile();
        const close=document.createElement('button');close.type='button';close.textContent='Close all';close.onclick=()=>this.closeAll();
        toolbar.append(title,count,arrange,close);this.layer.prepend(toolbar);
      }
      this.count();
    }
    count(){this.layer.querySelector('.grid-count').textContent=`${this.windows.size} / ${MAX_WINDOWS} rooms`;}
    open(entry,source){
      if(!this.supported())return false;
      if(this.windows.has(entry.name)){
        this.focus(this.windows.get(entry.name));return true;
      }
      if(this.windows.size>=MAX_WINDOWS){this.options.onLimit?.();return true;}
      this.showLayer();
      const slot=this.slots()[this.windows.size],panel=document.createElement('section');
      panel.className='grid-room';panel.setAttribute('role','region');
      panel.setAttribute('aria-label',`Virtual Unit ${pad(entry.unit)} room ${pad(entry.room)} recorded waveform monitor`);
      panel.style.left=`${slot.left}px`;panel.style.top=`${slot.top}px`;
      panel.style.width=`${slot.width}px`;panel.style.height=`${slot.height}px`;
      const header=document.createElement('header');header.className='grid-room-header';
      const heading=document.createElement('div');heading.className='grid-room-heading';
      const title=document.createElement('strong');title.textContent=`Virtual Unit ${pad(entry.unit)} · Room ${pad(entry.room)}`;
      const file=document.createElement('small');file.textContent=entry.name;
      heading.append(title,file);
      const actions=document.createElement('div');actions.className='grid-room-actions';
      const full=document.createElement('button');full.type='button';full.textContent='Full room';
      full.title='Open the detailed individual room view';full.onclick=()=>this.options.openSingle(entry);
      const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',`Close Unit ${pad(entry.unit)} Room ${pad(entry.room)}`);
      close.onclick=()=>this.close(entry.name);actions.append(full,close);header.append(heading,actions);
      const status=document.createElement('div');status.className='grid-room-status';status.textContent='Recorded preview · loading verified 50 Hz segment…';
      const charts=document.createElement('div');charts.className='grid-room-charts';
      const traces={};
      for(const [key,label] of [['flow','Flow'],['pressure','Airway pressure'],['volume','Calculated volume']]){
        const row=document.createElement('div');row.className='grid-trace';
        const top=document.createElement('div');top.className='grid-trace-label';
        const name=document.createElement('strong');name.textContent=label;
        const value=document.createElement('output');value.textContent='—';
        const axis=WaveformAxis.create();
        const controls=document.createElement('div');controls.className='grid-axis-controls';
        for(const [action,symbol,title] of [['zoomOut','Y−','Zoom out'],['zoomIn','Y+','Zoom in'],['reset','Y↺','Reset axis to visible values']]){
          const button=document.createElement('button');button.type='button';button.textContent=symbol;
          button.title=`${title} · ${label} Y axis`;
          button.setAttribute('aria-label',`${title} for ${label} Y axis`);
          button.onclick=()=>{if(WaveformAxis[action](axis))this.drawOne(monitor);};
          controls.append(button);
        }
        top.append(name,value,controls);
        const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`${label} waveform for Unit ${pad(entry.unit)} Room ${pad(entry.room)}`);
        row.append(top,canvas);charts.append(row);traces[key]={canvas,value,axis};
      }
      const controls=document.createElement('div');controls.className='grid-room-controls';
      const play=document.createElement('button');play.type='button';play.textContent='Pause';
      const start=document.createElement('button');start.type='button';start.textContent='Start';
      const scrub=document.createElement('input');scrub.type='range';scrub.min='0';scrub.max='1000';scrub.value='0';
      scrub.setAttribute('aria-label',`Position for Unit ${pad(entry.unit)} Room ${pad(entry.room)}`);
      const clock=document.createElement('output');clock.textContent='0:00';
      controls.append(start,play,scrub,clock);
      panel.append(header,status,charts,controls);this.layer.append(panel);
      const position=this.options.feedElapsed(entry);
      const monitor={entry,panel,header,status,traces,play,scrub,clock,position,
        playing:position<entry.samples/RATE,lastFrame:0,data:null,loading:false,buffering:false,error:null,moved:false};
      if(!monitor.playing){play.textContent='Play';start.textContent='Replay';status.textContent='Recording complete · Replay to restart';}
      this.windows.set(entry.name,monitor);this.count();this.focus(monitor);this.drag(monitor);
      play.onclick=()=>{if(monitor.position>=entry.samples/RATE)return;monitor.playing=!monitor.playing;monitor.lastFrame=0;play.textContent=monitor.playing?'Pause':'Play';};
      start.onclick=()=>{this.options.replayFeed(entry);monitor.position=0;monitor.lastFrame=0;monitor.playing=true;play.textContent='Pause';start.textContent='Start';this.ensure(monitor);this.drawOne(monitor);};
      scrub.oninput=()=>{monitor.position=Number(scrub.value)/1000*(entry.samples/RATE);monitor.lastFrame=0;this.ensure(monitor);this.drawOne(monitor);};
      const rect=source.getBoundingClientRect();
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)
        panel.animate([{transform:`translate(${rect.left-slot.left}px,${rect.top-slot.top}px) scale(${rect.width/slot.width},${rect.height/slot.height})`,opacity:.55},
          {transform:'translate(0,0) scale(1)',opacity:1}],{duration:430,easing:'cubic-bezier(.2,.8,.2,1)'});
      this.load(monitor);if(!this.raf)this.raf=requestAnimationFrame(now=>this.frame(now));
      return true;
    }
    async load(monitor){
      const {entry}=monitor;
      try{
        const data=await this.options.loadRoom(entry,Math.floor(monitor.position*RATE));
        if(this.windows.get(entry.name)!==monitor)return;
        monitor.data=data;monitor.status.textContent=monitor.position>=entry.samples/RATE?'Recording complete · Replay to restart':'Recorded feed · verified 50 Hz · no clinical alarms';
        this.drawOne(monitor);
      }catch(error){
        if(this.windows.get(entry.name)!==monitor)return;
        monitor.status.textContent=`Recorded preview · full feed unavailable: ${error.message}`;
      }
    }
    ensure(monitor){
      if(!monitor.data||monitor.loading)return;
      const sample=Math.max(0,Math.min(monitor.entry.samples-1,Math.floor(monitor.position*RATE)));
      if(this.options.hasRoomSample(monitor.entry,monitor.data,sample))return;
      monitor.loading=true;monitor.buffering=true;monitor.status.textContent=`Loading verified segment at ${time(monitor.position)}…`;
      this.options.ensureRoom(monitor.entry,monitor.data,sample).then(()=>{
        if(this.windows.get(monitor.entry.name)!==monitor)return;
        monitor.status.textContent='Recorded feed · verified 50 Hz · no clinical alarms';monitor.error=null;
      }).catch(error=>{
        if(this.windows.get(monitor.entry.name)!==monitor)return;
        monitor.error=error.message;monitor.status.textContent=`Segment unavailable: ${error.message}`;
      }).finally(()=>{monitor.loading=false;monitor.buffering=false;monitor.lastFrame=0;});
    }
    frame(now){
      this.raf=0;if(!this.windows.size)return;
      for(const monitor of this.windows.values()){
        if(monitor.playing&&!monitor.buffering){
          if(monitor.lastFrame)monitor.position=Math.min(monitor.entry.samples/RATE,monitor.position+(now-monitor.lastFrame)/1000);
          monitor.lastFrame=now;
          if(monitor.position>=monitor.entry.samples/RATE){
            monitor.playing=false;monitor.lastFrame=0;monitor.play.textContent='Play';
            monitor.panel.querySelector('.grid-room-controls button').textContent='Replay';
            monitor.status.textContent='Recording complete · Replay to restart';
          }else this.ensure(monitor);
        }else monitor.lastFrame=0;
        if(monitor.playing&&!monitor.buffering)this.drawOne(monitor);
      }
      this.raf=requestAnimationFrame(next=>this.frame(next));
    }
    drawOne(monitor){
      const {entry,data,traces}=monitor;
      const source=data||entry.preview;
      const rate=data?RATE:10;
      const length=source?.flow?.length||0;
      if(!length)return;
      const samplePosition=data?Math.max(0,Math.min(length-1,monitor.position*rate)):
        monitor.position>=entry.samples/RATE?length-1:(monitor.position*rate)%length;
      const sample=Math.floor(samplePosition);
      const windowSamples=Math.min(length,10*rate);
      const start=Math.max(0,Math.min(length-windowSamples,samplePosition-Math.floor(windowSamples*.28)));
      const first=Math.floor(start),end=Math.min(length,Math.ceil(start+windowSamples));
      for(const key of ['flow','pressure','volume']){
        const values=source[key],trace=traces[key];
        const canvas=trace.canvas,width=Math.max(1,Math.round(canvas.clientWidth*devicePixelRatio)),height=Math.max(1,Math.round(canvas.clientHeight*devicePixelRatio));
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        const ctx=canvas.getContext('2d');ctx.fillStyle='#081d29';ctx.fillRect(0,0,width,height);
        if(!values){trace.value.textContent='loading';continue;}
        let low=Infinity,high=-Infinity;
        for(let i=first;i<end;i++){const value=values[i];if(Number.isFinite(value)){low=Math.min(low,value);high=Math.max(high,value);}}
        if(!Number.isFinite(low)){trace.value.textContent='unavailable';continue;}
        ({min:low,max:high}=WaveformAxis.observe(trace.axis,low,high));
        const dpr=devicePixelRatio||1,labels=WaveformAxis.tickLabels(low,high);
        ctx.font=`${10*dpr}px system-ui`;
        const left=Math.max(39*dpr,Math.ceil(Math.max(...labels.map(label=>ctx.measureText(label).width)))+8*dpr);
        const top=8*dpr,bottom=8*dpr,plotWidth=Math.max(1,width-left-4*dpr),plotHeight=Math.max(1,height-top-bottom);
        ctx.strokeStyle='#294754';ctx.fillStyle='#9ab9c5';ctx.lineWidth=Math.max(1,dpr);
        ctx.textAlign='right';ctx.textBaseline='middle';
        for(let tick=0;tick<=4;tick++){
          const y=top+tick*plotHeight/4;
          ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-4*dpr,y);ctx.stroke();
          ctx.fillText(labels[tick],left-5*dpr,y);
        }
        const color=key==='flow'?'#62e1e5':key==='pressure'?'#ffc178':'#b9acfb';
        ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,devicePixelRatio)*1.3;ctx.beginPath();let drawing=false;
        const step=Math.max(1,Math.floor(windowSamples/(plotWidth*2)));
        for(let i=first;i<end;i+=step){const value=values[i];if(!Number.isFinite(value)){drawing=false;continue;}
          const x=left+(i-start)/Math.max(1,windowSamples-1)*plotWidth,y=top+(high-value)/(high-low)*plotHeight;
          if(!drawing)ctx.moveTo(x,y);else ctx.lineTo(x,y);drawing=true;
        }ctx.stroke();
        const marker=left+(samplePosition-start)/Math.max(1,windowSamples-1)*plotWidth;
        ctx.strokeStyle='#ffedcd';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(marker,top);ctx.lineTo(marker,top+plotHeight);ctx.stroke();
        const current=values[sample];trace.value.textContent=Number.isFinite(current)?`${current.toFixed(1)} ${key==='flow'?'L/min':key==='pressure'?'cmH₂O':'mL'}`:'unavailable';
      }
      monitor.scrub.value=String(Math.round(monitor.position/(entry.samples/RATE)*1000));
      monitor.clock.textContent=`${time(monitor.position)} / ${time(entry.samples/RATE)}`;
    }
    focus(monitor){monitor.panel.style.zIndex=String(++this.nextZ);}
    drag(monitor){
      let start=null;
      monitor.header.addEventListener('pointerdown',event=>{
        if(event.target.closest('button'))return;
        this.focus(monitor);start={x:event.clientX,y:event.clientY,left:monitor.panel.offsetLeft,top:monitor.panel.offsetTop};
        monitor.header.setPointerCapture(event.pointerId);
      });
      monitor.header.addEventListener('pointermove',event=>{
        if(!start)return;
        const left=Math.max(0,Math.min(innerWidth-monitor.panel.offsetWidth,start.left+event.clientX-start.x));
        const top=Math.max(52,Math.min(innerHeight-monitor.panel.offsetHeight,start.top+event.clientY-start.y));
        monitor.panel.style.left=`${left}px`;monitor.panel.style.top=`${top}px`;monitor.moved=true;
      });
      const stop=()=>{start=null;};
      monitor.header.addEventListener('pointerup',stop);monitor.header.addEventListener('pointercancel',stop);
      monitor.panel.addEventListener('pointerdown',()=>this.focus(monitor));
    }
    tile(){
      const slots=this.slots();let index=0;
      for(const monitor of this.windows.values()){
        const slot=slots[index++];monitor.moved=false;
        Object.assign(monitor.panel.style,{left:`${slot.left}px`,top:`${slot.top}px`,width:`${slot.width}px`,height:`${slot.height}px`});
        this.drawOne(monitor);
      }
    }
    close(name){
      const monitor=this.windows.get(name);if(!monitor)return;
      monitor.panel.remove();this.windows.delete(name);
      if(this.windows.size){this.count();this.tile();}
      else{cancelAnimationFrame(this.raf);this.raf=0;this.layer.replaceChildren();this.layer.hidden=true;}
    }
    closeAll(){for(const name of [...this.windows.keys()])this.close(name);}
  }
  root.GridMonitor=GridMonitor;
})(globalThis);
