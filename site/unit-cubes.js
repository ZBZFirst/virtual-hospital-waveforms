/* Two six-face displays of virtual unit feeds. Face swaps affect this view only. */
(function(root){
  const faces=['front','back','right','left','top','bottom'];
  const faceTurns=[null,[0,1,0,180],[0,1,0,90],[0,1,0,-90],[1,0,0,90],[1,0,0,-90]];
  const radians=degrees=>degrees*Math.PI/180;
  const axisTurn=(x,y,z,degrees)=>{
    const half=radians(degrees)/2,sine=Math.sin(half);
    return {x:x*sine,y:y*sine,z:z*sine,w:Math.cos(half)};
  };
  const faceRotations=faceTurns.map(turn=>turn?axisTurn(...turn):{x:0,y:0,z:0,w:1});
  const multiply=(a,b)=>({
    x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
    y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
    z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
    w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z
  });
  const normalized=q=>{const size=Math.hypot(q.x,q.y,q.z,q.w);return {x:q.x/size,y:q.y/size,z:q.z/size,w:q.w/size};};
  const rotateVector=(q,v)=>{
    const tx=2*(q.y*v.z-q.z*v.y),ty=2*(q.z*v.x-q.x*v.z),tz=2*(q.x*v.y-q.y*v.x);
    return {x:v.x+q.w*tx+q.y*tz-q.z*ty,y:v.y+q.w*ty+q.z*tx-q.x*tz,z:v.z+q.w*tz+q.x*ty-q.y*tx};
  };
  const initialTurn=y=>multiply(axisTurn(1,0,0,-18),axisTurn(0,1,0,y));
  class UnitCubes {
    constructor(overlay,options){
      this.overlay=overlay;this.options=options;this.units=[null,null];this.overrides=[Array(6).fill(null),Array(6).fill(null)];
      this.orientations=[initialTurn(-25),initialTurn(25)];this.canvases=[];this.faceContents=[[],[]];this.cubeSizes=[0,0];this.raf=0;
      this.grid=new GridMonitor(options.gridRoot,{
        sessionSeconds:options.sessionSeconds,feedElapsed:options.feedElapsed,replayFeed:options.replayFeed,loadRoom:options.loadRoom,
        ensureRoom:options.ensureRoom,hasRoomSample:options.hasRoomSample,
        openSingle:entry=>{this.close();options.openSingle(entry);},
        onLimit:()=>this.message('Four room windows are open. Close one to open another.')
      });
    }
    open(unit){
      this.grid.closeAll();
      const numbers=this.options.unitNumbers();
      const index=numbers.indexOf(unit);
      this.units=[unit,numbers[(index+1)%numbers.length]??unit];
      this.overrides=[Array(6).fill(null),Array(6).fill(null)];
      this.render();this.overlay.hidden=false;
      for(let index=0;index<2;index++)this.applyCubeRotation(index);
      this.draw();
      this.overlay.querySelector('.cube-close').focus();
    }
    close(){
      this.grid.closeAll();this.overlay.hidden=true;cancelAnimationFrame(this.raf);
      this.options.onClose?.();
    }
    message(value){const status=this.overlay.querySelector('.cube-hint');if(status)status.textContent=value;}
    applyCubeRotation(index){
      const q=this.orientations[index],distance=Math.hypot(q.x,q.y,q.z);
      const axis=distance>1e-8?[q.x/distance,q.y/distance,q.z/distance]:[1,0,0];
      const degrees=2*Math.atan2(distance,q.w)*180/Math.PI;
      const cube=this.overlay.querySelectorAll('.unit-cube')[index];
      if(!cube)return;
      const halfSize=cube.clientWidth/2;
      this.cubeSizes[index]=halfSize*2;
      cube.style.transform=`rotate3d(${axis.join(',')},${degrees}deg)`;
      for(const [slot,face] of this.faceContents[index].entries()){
        const orientation=multiply(q,faceRotations[slot]);
        const normal=rotateVector(orientation,{x:0,y:0,z:1});
        if(normal.z<.08)continue;
        const right=rotateVector(orientation,{x:1,y:0,z:0});
        const down=rotateVector(orientation,{x:0,y:1,z:0});
        // Perspective changes the projected axes when the face center is off-axis.
        const depth=850-normal.z*halfSize;
        const rightX=right.x+normal.x*halfSize*right.z/depth;
        const rightY=right.y+normal.y*halfSize*right.z/depth;
        const downX=down.x+normal.x*halfSize*down.z/depth;
        const downY=down.y+normal.y*halfSize*down.z/depth;
        if(Math.hypot(rightX,downX)<.02)continue;
        let angle=Math.atan2(downX,rightX);
        if(rightY*Math.sin(angle)-downY*Math.cos(angle)>0)angle+=Math.PI;
        if(face.angle!==null)angle+=Math.round((face.angle-angle)/(2*Math.PI))*2*Math.PI;
        face.angle=angle;
        const fit=.96/(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle)));
        face.content.style.transform=`rotate(${angle}rad) scale(${fit})`;
      }
    }
    turnCube(index,x,y,z){
      const delta=multiply(multiply(axisTurn(1,0,0,x),axisTurn(0,1,0,y)),axisTurn(0,0,1,z));
      this.orientations[index]=normalized(multiply(delta,this.orientations[index]));
      this.applyCubeRotation(index);
    }
    openFace(index,slot,source){
      const entry=this.faceEntry(index,slot);if(!entry){this.message('That bed has no assigned feed. Select a recording first.');return;}
      if(!this.grid.open(entry,source)){
        this.close();this.options.openSingle(entry);
      }
    }
    entries(index){return this.options.unitEntries(this.units[index]);}
    faceEntry(index,slot){
      const name=this.overrides[index][slot];
      return name?this.options.allEntries().find(entry=>entry.name===name):
        this.entries(index).find(entry=>entry.room===slot+1);
    }
    render(){
      this.canvases=[];this.faceContents=[[],[]];this.overlay.replaceChildren();
      const panel=document.createElement('section');panel.className='cube-panel';panel.setAttribute('role','dialog');
      panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','View units on cubes');
      const header=document.createElement('header');header.className='cube-header';
      const title=document.createElement('div');title.innerHTML='<p>WAVEFORM LIBRARY</p><h2>Units on cubes</h2>';
      const close=document.createElement('button');close.type='button';close.className='cube-close';close.textContent='Back to unit dashboard';close.onclick=()=>this.close();
      header.append(title,close);panel.append(header);
      const stage=document.createElement('div');stage.className='cube-stage';
      this.units.forEach((unit,index)=>stage.append(this.makeCube(index)));
      panel.append(stage);
      const hint=document.createElement('p');hint.className='cube-hint';
      hint.textContent='Drag a cube to rotate it, or Shift-drag to turn it around the display axis. Double-click a waveform face to open its room. On a 1920×1080 or larger display, open up to four movable room monitors. Face selectors change this view only.';
      panel.append(hint);this.overlay.append(panel);
      for(let index=0;index<2;index++)this.applyCubeRotation(index);
      this.overlay.onpointerdown=event=>{if(event.target===this.overlay)this.close();};
    }
    makeCube(index){
      const section=document.createElement('section');section.className='cube-unit';
      const label=document.createElement('label');label.textContent=`Cube ${index===0?'A':'B'} · Unit `;
      const select=document.createElement('select');select.setAttribute('aria-label',`Cube ${index===0?'A':'B'} unit`);
      for(const number of this.options.unitNumbers()){
        const choice=new Option(`Unit ${String(number).padStart(2,'0')}`,String(number));select.add(choice);
      }
      select.value=String(this.units[index]);
      select.onchange=()=>{this.units[index]=Number(select.value);this.overrides[index].fill(null);this.render();};
      label.append(select);section.append(label);
      const viewport=document.createElement('div');viewport.className='cube-viewport';
      const cube=document.createElement('div');cube.className='unit-cube';
      faces.forEach((face,slot)=>{
        const side=document.createElement('div');side.className=`cube-face ${face}`;side.dataset.slot=String(slot);
        const content=document.createElement('div');content.className='cube-face-content';
        const heading=document.createElement('div');heading.className='cube-face-heading';heading.textContent=`Bed ${String(slot+1).padStart(2,'0')}`;
        const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`Cube ${index===0?'A':'B'} bed ${slot+1} flow and pressure waveform`);
        content.append(heading,canvas);side.append(content);cube.append(side);
        this.faceContents[index].push({content,angle:null});this.canvases.push({canvas,index,slot});
      });
      cube.addEventListener('dblclick',event=>{
        const side=event.target.closest('.cube-face');
        if(side){event.preventDefault();this.openFace(index,Number(side.dataset.slot),side);}
      });
      viewport.append(cube);section.append(viewport);
      let drag=null;
      viewport.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,moved:false,id:event.pointerId};});
      viewport.addEventListener('pointermove',event=>{
        if(!drag)return;
        if(!drag.moved){
          if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4)return;
          drag.moved=true;viewport.setPointerCapture(drag.id);
        }
        const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
        drag.x=event.clientX;drag.y=event.clientY;
        if(event.shiftKey)this.turnCube(index,0,0,dx*.7);
        else this.turnCube(index,-dy*.5,dx*.5,0);
      });
      viewport.addEventListener('pointerup',()=>{drag=null;});
      viewport.addEventListener('pointercancel',()=>{drag=null;});
      const editor=document.createElement('div');editor.className='cube-face-editor';
      faces.forEach((face,slot)=>{
        const row=document.createElement('label');row.textContent=`${face[0].toUpperCase()+face.slice(1)} · Bed ${slot+1}`;
        const picker=document.createElement('select');picker.setAttribute('aria-label',`Cube ${index===0?'A':'B'} ${face} face recording`);
        const assigned=this.entries(index).find(entry=>entry.room===slot+1);
        picker.add(new Option(assigned?`Unit feed · ${assigned.name}`:'Open bed', ''));
        for(const entry of this.options.allEntries())picker.add(new Option(entry.name,entry.name));
        picker.value=this.overrides[index][slot]??'';
        picker.onchange=()=>{this.overrides[index][slot]=picker.value||null;};
        const controls=document.createElement('span');controls.className='cube-face-controls';
        const open=document.createElement('button');open.type='button';open.textContent='Open';
        open.setAttribute('aria-label',`Open Cube ${index===0?'A':'B'} ${face} face room`);
        open.onclick=()=>this.openFace(index,slot,row);
        controls.append(picker,open);row.append(controls);editor.append(row);
      });
      section.append(editor);return section;
    }
    draw(){
      if(this.overlay.hidden)return;
      this.overlay.querySelectorAll('.unit-cube').forEach((cube,index)=>{
        if(cube.clientWidth!==this.cubeSizes[index])this.applyCubeRotation(index);
      });
      for(const {canvas,index,slot} of this.canvases){
        const entry=this.faceEntry(index,slot),preview=entry?.preview;
        const width=Math.max(1,Math.round(canvas.clientWidth)),height=Math.max(1,Math.round(canvas.clientHeight));
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        const ctx=canvas.getContext('2d');ctx.fillStyle='#071b29';ctx.fillRect(0,0,width,height);
        if(!preview?.flow?.length){ctx.fillStyle='#b5cbd3';ctx.font='13px system-ui';ctx.fillText('Open bed',12,height/2);continue;}
        const elapsed=this.options.feedElapsed(entry);
        if(elapsed>=entry.samples/50){
          ctx.fillStyle='#b5cbd3';ctx.font='12px system-ui';ctx.fillText('Recording complete',8,height/2);
          continue;
        }
        const count=Math.min(preview.flow.length,preview.pressure.length),windowSize=Math.min(count,100);
        const cursor=Math.floor(elapsed*10)%count,start=(cursor-windowSize+count)%count;
        for(const [values,color,top,bottom,min,max] of [[preview.flow,'#5fe2e4',22,height*.49,-60,60],[preview.pressure,'#ffc075',height*.55,height-10,0,50]]){
          ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();let drawing=false;
          for(let i=0;i<windowSize;i++){
            const value=values[(start+i)%count];if(!Number.isFinite(value)){drawing=false;continue;}
            const x=i/(windowSize-1)*width,y=bottom-(Math.max(min,Math.min(max,value))-min)/(max-min)*(bottom-top);
            if(!drawing)ctx.moveTo(x,y);else ctx.lineTo(x,y);drawing=true;
          }ctx.stroke();
        }
        ctx.fillStyle='#d1e7ef';ctx.font='10px system-ui';ctx.fillText(entry.name.slice(0,28),8,height-2);
      }
      this.raf=requestAnimationFrame(()=>this.draw());
    }
  }
  root.UnitCubes=UnitCubes;
})(globalThis);
