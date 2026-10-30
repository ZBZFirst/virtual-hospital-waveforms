// Adapted from the self-contained webcam-mask-editor-v5.html pipeline.
(()=>{'use strict';
const $=id=>document.getElementById(`mask-${id}`);
const preview=$('output'),previewCtx=preview.getContext('2d');
const output=document.getElementById('streamerOutput'),outputCtx=output.getContext('2d');
const video=$('camera'),panel=document.getElementById('streamerWindow');
const status=document.getElementById('streamerStatus'),retry=document.getElementById('streamerRetry');
const composite=document.createElement('canvas'),cc=composite.getContext('2d');
const framed=document.createElement('canvas'),framedCtx=framed.getContext('2d');
const foreground=document.createElement('canvas'),fc=foreground.getContext('2d');
const mask=document.createElement('canvas'),mc=mask.getContext('2d');
let stream=null,starting=null,generation=0,frame=0,lastPaint=0,recorder=null,chunks=[],downloadUrl=null,recordingCrop=null;
let image=null,imageUrl=null,audioContext=null,audioSource=null,audioAnalyser=null,audioData=null,meterFrameId=0;
let regions=[{id:1,type:'ellipse',x:.34,y:.16,w:.32,h:.68}],selected=1,nextId=2,pointer=null,action=null,drawNext=false;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const selectedRegion=()=>regions.find(region=>region.id===selected);
function message(value){status.textContent=value;$('status').textContent=value;}
function updateList(){
  const list=$('shapes');list.replaceChildren();
  regions.forEach((region,index)=>{
    const option=document.createElement('option');option.value=region.id;
    option.textContent=`${index+1}. ${region.type} (${Math.round(region.w*100)}% × ${Math.round(region.h*100)}%)`;
    option.selected=region.id===selected;list.append(option);
  });
  $('count').textContent=regions.length;$('add').disabled=regions.length>=5;$('delete').disabled=!selectedRegion();
}
function dimensions(width,height){
  for(const canvas of [preview,composite,foreground,mask]){
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
  }
}
function cropBounds(shapes,selectedId,mode,padding,width,height){
  const full={x:0,y:0,width,height,active:false};
  if(mode==='full')return full;
  const chosen=mode==='selected'?shapes.filter(shape=>shape.id===selectedId):shapes;
  if(!chosen.length)return full;
  const left=Math.min(...chosen.map(shape=>shape.x)),top=Math.min(...chosen.map(shape=>shape.y));
  const right=Math.max(...chosen.map(shape=>shape.x+shape.w));
  const bottom=Math.max(...chosen.map(shape=>shape.y+shape.h));
  const margin=clamp(Number(padding)||0,0,50)/100;
  const x=Math.floor(clamp(left-(right-left)*margin,0,1)*width);
  const y=Math.floor(clamp(top-(bottom-top)*margin,0,1)*height);
  const edgeX=Math.ceil(clamp(right+(right-left)*margin,0,1)*width);
  const edgeY=Math.ceil(clamp(bottom+(bottom-top)*margin,0,1)*height);
  return {x,y,width:Math.max(1,edgeX-x),height:Math.max(1,edgeY-y),active:true};
}
function currentCrop(){return cropBounds(regions,selected,$('framing').value,$('cropPadding').value,
  composite.width||video.videoWidth||1280,composite.height||video.videoHeight||720);}
function fitWindowToCrop(){
  if(panel.hidden||!stream)return;
  const crop=currentCrop(),aspect=crop.width/crop.height;
  const chrome=Math.max(44,panel.offsetHeight-output.getBoundingClientRect().height);
  const stage=document.getElementById('captureStage');
  const maxW=Math.max(1,Math.min(stage.clientWidth-16,720));
  const maxH=Math.max(1,Math.min(stage.clientHeight-16,600));
  let videoHeight=Math.min(310,maxH-chrome),videoWidth=videoHeight*aspect;
  if(videoWidth>maxW){videoWidth=maxW;videoHeight=videoWidth/aspect;}
  if(videoWidth<Math.min(220,maxW)){videoWidth=Math.min(220,maxW);videoHeight=videoWidth/aspect;}
  if(videoHeight>maxH-chrome){videoHeight=maxH-chrome;videoWidth=videoHeight*aspect;}
  panel.style.width=`${Math.round(Math.max(1,videoWidth))}px`;
  panel.style.height=`${Math.round(Math.max(1,videoHeight+chrome))}px`;
  const frame=stage.getBoundingClientRect(),rect=panel.getBoundingClientRect();
  panel.style.left=`${Math.max(0,Math.min(stage.clientWidth-panel.offsetWidth,rect.left-frame.left))}px`;
  panel.style.top=`${Math.max(0,Math.min(stage.clientHeight-panel.offsetHeight,rect.top-frame.top))}px`;
  panel.style.right='auto';
}
function shapePath(context,region){
  const x=region.x*composite.width,y=region.y*composite.height;
  const width=region.w*composite.width,height=region.h*composite.height;
  context.beginPath();
  switch(region.type){
    case 'ellipse':context.ellipse(x+width/2,y+height/2,Math.max(1,width/2),Math.max(1,height/2),0,0,Math.PI*2);break;
    case 'roundrect':context.roundRect(x,y,width,height,Math.min(width,height)*.2);break;
    case 'diamond':context.moveTo(x+width/2,y);context.lineTo(x+width,y+height/2);context.lineTo(x+width/2,y+height);context.lineTo(x,y+height/2);context.closePath();break;
    case 'triangle':context.moveTo(x+width/2,y);context.lineTo(x+width,y+height);context.lineTo(x,y+height);context.closePath();break;
    default:context.rect(x,y,width,height);
  }
}
function paintVideo(context){
  context.save();
  if($('mirror').checked){context.translate(composite.width,0);context.scale(-1,1);}
  context.drawImage(video,0,0,composite.width,composite.height);context.restore();
}
function paintImage(){
  const width=composite.width,height=composite.height;
  cc.fillStyle='#000';cc.fillRect(0,0,width,height);
  if(!image)return;
  const iw=image.naturalWidth,ih=image.naturalHeight,fit=$('imageFit').value;
  if(fit==='stretch'){cc.drawImage(image,0,0,width,height);return;}
  const scale=fit==='cover'?Math.max(width/iw,height/ih):Math.min(width/iw,height/ih);
  const dw=iw*scale,dh=ih*scale;cc.drawImage(image,(width-dw)/2,(height-dh)/2,dw,dh);
}
function handles(region){return [{x:region.x,y:region.y},{x:region.x+region.w,y:region.y},
  {x:region.x,y:region.y+region.h},{x:region.x+region.w,y:region.y+region.h}];}
function render(now=performance.now()){
  if(!stream)return;
  if(now-lastPaint<33){frame=requestAnimationFrame(render);return;}
  lastPaint=now;
  if(video.readyState<2){frame=requestAnimationFrame(render);return;}
  const width=video.videoWidth||1280,height=video.videoHeight||720;dimensions(width,height);
  cc.clearRect(0,0,width,height);
  const background=$('background').value;
  if(background==='original')paintVideo(cc);
  else{
    if(background==='blur'){
      cc.save();cc.filter=`blur(${$('blur').value}px)`;
      const pad=Number($('blur').value)*2;cc.translate(-pad,-pad);
      cc.scale((width+pad*2)/width,(height+pad*2)/height);paintVideo(cc);cc.restore();
    }else if(background==='black'){cc.fillStyle='#000';cc.fillRect(0,0,width,height);}
    else if(background==='image')paintImage();
    if(regions.length){
      fc.clearRect(0,0,width,height);paintVideo(fc);mc.clearRect(0,0,width,height);
      mc.save();mc.fillStyle='#fff';const feather=Number($('feather').value);
      if(feather>0)mc.filter=`blur(${feather}px)`;
      for(const region of regions){shapePath(mc,region);mc.fill();}mc.restore();
      fc.globalCompositeOperation='destination-in';fc.drawImage(mask,0,0);
      fc.globalCompositeOperation='source-over';cc.drawImage(foreground,0,0);
    }
  }
  const crop=recordingCrop||currentCrop();
  for(const canvas of [framed,output]){
    if(canvas.width!==crop.width)canvas.width=crop.width;
    if(canvas.height!==crop.height)canvas.height=crop.height;
  }
  framedCtx.clearRect(0,0,crop.width,crop.height);
  framedCtx.drawImage(composite,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
  outputCtx.clearRect(0,0,crop.width,crop.height);outputCtx.drawImage(framed,0,0);
  $('cropInfo').textContent=crop.active?`Output: ${crop.width} × ${crop.height} px · ${$('framing').value==='selected'?'selected shape':'all shapes'}`:
    `Output: ${crop.width} × ${crop.height} px · full camera frame`;
  previewCtx.clearRect(0,0,width,height);previewCtx.drawImage(composite,0,0);
  if($('edit').checked){
    previewCtx.save();previewCtx.lineWidth=Math.max(2,width/600);
    if(crop.active){previewCtx.strokeStyle='#fff';previewCtx.setLineDash([18,12]);
      previewCtx.strokeRect(crop.x+2,crop.y+2,crop.width-4,crop.height-4);}
    for(const region of regions){
      previewCtx.strokeStyle=region.id===selected?'#54e9df':'#f8c95d';
      previewCtx.setLineDash(region.id===selected?[12,8]:[5,7]);shapePath(previewCtx,region);previewCtx.stroke();
    }
    previewCtx.setLineDash([]);const region=selectedRegion();
    if(region){previewCtx.fillStyle='#e8ffff';for(const point of handles(region))
      previewCtx.fillRect(point.x*width-6,point.y*height-6,12,12);}
    previewCtx.restore();
  }
  frame=requestAnimationFrame(render);
}
const bars=[];for(let index=0;index<28;index++){
  const bar=document.createElement('span');if(index>=19)bar.classList.add('warn');
  if(index>=25)bar.classList.add('hot');$('micBars').append(bar);bars.push(bar);
}
function meterTick(){
  if(!audioAnalyser)return;
  audioAnalyser.getFloatTimeDomainData(audioData);let sum=0,peak=0;
  for(const value of audioData){sum+=value*value;peak=Math.max(peak,Math.abs(value));}
  const db=sum>0?20*Math.log10(Math.sqrt(sum/audioData.length)):-Infinity;
  const peakDb=peak>0?20*Math.log10(peak):-Infinity;
  const active=Math.round(clamp((db+60)/60,0,1)*bars.length);
  bars.forEach((bar,index)=>bar.classList.toggle('on',index<active));
  $('micDb').textContent=Number.isFinite(db)?`${db.toFixed(1)} dBFS`:'−∞ dBFS';
  $('micHelp').textContent=peakDb>-1?'Peak near 0 dBFS — reduce mic gain or move farther away':
    db<-45?'Low input — move mic closer or check input gain':'Mic signal detected · RMS level';
  meterFrameId=requestAnimationFrame(meterTick);
}
function stopMeter(){
  cancelAnimationFrame(meterFrameId);meterFrameId=0;
  audioSource?.disconnect();audioSource=null;audioAnalyser=null;audioData=null;
  if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}
  bars.forEach(bar=>bar.classList.remove('on'));$('micDb').textContent='Mic off';
  $('micHelp').textContent='Start camera to check microphone position.';
}
async function startMeter(){
  stopMeter();const track=stream?.getAudioTracks()[0];
  if(!track){$('micDb').textContent='No mic';$('micHelp').textContent='Camera active without microphone audio.';return;}
  try{
    audioContext=new (window.AudioContext||window.webkitAudioContext)();
    audioSource=audioContext.createMediaStreamSource(new MediaStream([track]));
    audioAnalyser=audioContext.createAnalyser();audioAnalyser.fftSize=2048;
    audioAnalyser.smoothingTimeConstant=.75;audioData=new Float32Array(audioAnalyser.fftSize);
    audioSource.connect(audioAnalyser);await audioContext.resume();meterTick();
  }catch(error){stopMeter();$('micHelp').textContent=`Audio meter unavailable: ${error.message}`;}
}
function stopRecording(){
  if(recorder&&recorder.state!=='inactive')recorder.stop();
  $('record').textContent='● Record';
}
function stop(){
  generation++;cancelAnimationFrame(frame);frame=0;stopMeter();stopRecording();
  if(stream)for(const track of stream.getTracks())track.stop();
  stream=null;video.srcObject=null;starting=null;
  $('start').disabled=false;$('stop').disabled=true;$('record').disabled=true;
  retry.hidden=panel.hidden;$('cameraState').textContent='● Camera off';message('Camera stopped.');
}
function cameraError(error){
  if(error?.name==='NotAllowedError')return 'Camera permission was denied.';
  if(error?.name==='NotFoundError')return 'No webcam was found.';
  if(error?.name==='NotReadableError'||/starting videoinput failed/i.test(error?.message||''))
    return 'Camera is busy or unavailable. Close other camera apps, then retry.';
  return `Camera unavailable: ${error?.message||'Could not start camera.'}`;
}
async function start(){
  if(stream)return true;if(starting)return starting;
  const request=++generation;message('Requesting camera…');retry.hidden=true;
  starting=(async()=>{
    let acquired=null;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera access requires HTTPS or localhost.');
      acquired=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:true})
        .catch(error=>{
          if(error?.name==='NotReadableError')throw error;
          return navigator.mediaDevices.getUserMedia({video:true,audio:false});
        });
      if(request!==generation){for(const track of acquired.getTracks())track.stop();return false;}
      stream=acquired;video.srcObject=stream;await video.play();await startMeter();
      if(request!==generation)return false;
      $('start').disabled=true;$('stop').disabled=false;$('record').disabled=false;
      $('cameraState').textContent='● Camera active';
      cancelAnimationFrame(frame);render();fitWindowToCrop();message('Camera active · edit masks or drag the webcam window.');return true;
    }catch(error){
      if(request!==generation)return false;
      if(acquired)for(const track of acquired.getTracks())track.stop();
      stream=null;video.srcObject=null;$('cameraState').textContent='● Camera unavailable';
      message(cameraError(error));retry.hidden=false;return false;
    }finally{if(request===generation)starting=null;}
  })();
  return starting;
}
function showEditor(){document.getElementById('streamerEditor').hidden=false;$('close').focus();}
function hideEditor(){document.getElementById('streamerEditor').hidden=true;}
const tabs=[...document.querySelectorAll('.mask-tab')];
function showTab(name){for(const tab of tabs){const active=tab.dataset.pane===name;
  tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));
  $(`pane-${tab.dataset.pane}`).hidden=!active;}}
for(const tab of tabs){
  tab.addEventListener('click',()=>showTab(tab.dataset.pane));
  tab.addEventListener('keydown',event=>{if(!['ArrowRight','ArrowLeft'].includes(event.key))return;
    event.preventDefault();const index=tabs.indexOf(tab);
    const next=tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];
    showTab(next.dataset.pane);next.focus();});
}
$('shapes').onchange=()=>{selected=Number($('shapes').value);drawNext=false;updateList();fitWindowToCrop();};
$('add').onclick=()=>{if(regions.length>=5)return;selected=null;drawNext=true;updateList();
  message(`Drag on the preview to draw shape ${regions.length+1} of 5.`);};
$('delete').onclick=()=>{regions=regions.filter(region=>region.id!==selected);
  selected=regions.at(-1)?.id??null;drawNext=false;updateList();fitWindowToCrop();};
$('shape').onchange=()=>{const region=selectedRegion();if(region&&!drawNext){region.type=$('shape').value;updateList();}};
function position(event){const bounds=preview.getBoundingClientRect();return {
  x:clamp((event.clientX-bounds.left)/bounds.width,0,1),y:clamp((event.clientY-bounds.top)/bounds.height,0,1)};}
function inside(point,region){
  const x=point.x,y=point.y;
  if(region.type==='ellipse')return ((x-region.x-region.w/2)/(region.w/2))**2+((y-region.y-region.h/2)/(region.h/2))**2<=1;
  const vertices=region.type==='diamond'?[[.5,0],[1,.5],[.5,1],[0,.5]]:
    region.type==='triangle'?[[.5,0],[1,1],[0,1]]:null;
  if(!vertices)return x>=region.x&&x<=region.x+region.w&&y>=region.y&&y<=region.y+region.h;
  const u=(x-region.x)/region.w,v=(y-region.y)/region.h;let hit=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const a=vertices[i],b=vertices[j];
    if(((a[1]>v)!==(b[1]>v))&&(u<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0]))hit=!hit;
  }
  return hit;
}
preview.addEventListener('pointerdown',event=>{
  if(!stream)return;preview.setPointerCapture(event.pointerId);const point=position(event);
  let region=selectedRegion();
  if(!drawNext&&region){const hit=handles(region).findIndex(handle=>
    Math.hypot((handle.x-point.x)*preview.width,(handle.y-point.y)*preview.height)<22);
    if(hit>=0){pointer={point,initial:{...region},id:region.id};action={type:'resize',index:hit};return;}}
  if(!drawNext){region=[...regions].reverse().find(candidate=>inside(point,candidate));
    if(region){selected=region.id;$('shape').value=region.type;
      pointer={point,initial:{...region},id:region.id};action={type:'move'};updateList();return;}}
  if(regions.length>=5){message('Maximum of five shapes. Select or delete an existing shape.');return;}
  region={id:nextId++,type:$('shape').value,x:point.x,y:point.y,w:.002,h:.002};
  regions.push(region);selected=region.id;pointer={point,initial:{...region},id:region.id};
  action={type:'draw'};drawNext=false;updateList();
});
preview.addEventListener('pointermove',event=>{
  if(!pointer||!action)return;const region=regions.find(item=>item.id===pointer.id);if(!region)return;
  const point=position(event),start=pointer.point,old=pointer.initial;
  if(action.type==='draw')Object.assign(region,{x:Math.min(start.x,point.x),y:Math.min(start.y,point.y),
    w:Math.max(.002,Math.abs(point.x-start.x)),h:Math.max(.002,Math.abs(point.y-start.y))});
  else if(action.type==='move'){
    region.x=clamp(old.x+point.x-start.x,0,1-old.w);region.y=clamp(old.y+point.y-start.y,0,1-old.h);
  }else if(action.type==='resize'){
    const index=action.index,anchor={x:index%2===0?old.x+old.w:old.x,
      y:index<2?old.y+old.h:old.y};
    Object.assign(region,{x:Math.min(point.x,anchor.x),y:Math.min(point.y,anchor.y),
      w:Math.max(.002,Math.abs(point.x-anchor.x)),h:Math.max(.002,Math.abs(point.y-anchor.y))});
  }
});
for(const name of ['pointerup','pointercancel'])preview.addEventListener(name,()=>{
  pointer=null;action=null;updateList();fitWindowToCrop();});
$('framing').onchange=fitWindowToCrop;
$('cropPadding').oninput=()=>{$('cropPaddingValue').textContent=`${$('cropPadding').value}%`;fitWindowToCrop();};
$('fitWindow').onclick=fitWindowToCrop;
$('background').onchange=()=>{
  $('imageControls').hidden=$('background').value!=='image';
  $('blurControls').hidden=$('background').value!=='blur';
  panel.classList.toggle('mask-transparent',$('background').value==='transparent');
};$('blurControls').hidden=true;
$('imageUpload').onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){
    $('imageStatus').textContent='Unsupported file type.';return;}
  if(file.size>25*1024*1024){$('imageStatus').textContent='Image exceeds 25 MB limit.';return;}
  const url=URL.createObjectURL(file),loaded=new Image();
  try{
    await new Promise((resolve,reject)=>{loaded.onload=resolve;
      loaded.onerror=()=>reject(Error('Unable to decode image'));loaded.src=url;});
    if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=url;image=loaded;
    $('background').value='image';$('background').onchange();
    $('imageStatus').textContent=`Loaded ${file.name} (${image.naturalWidth} × ${image.naturalHeight}).`;
  }catch(error){URL.revokeObjectURL(url);$('imageStatus').textContent=error.message;}
};
$('removeImage').onclick=()=>{image=null;if(imageUrl)URL.revokeObjectURL(imageUrl);
  imageUrl=null;$('imageUpload').value='';$('imageStatus').textContent='No image loaded.';
  $('background').value='black';$('background').onchange();};
for(const id of ['feather','blur'])$(`${id}`).oninput=()=>{$(`${id}Value`).textContent=`${$(`${id}`).value} px`;};
$('start').onclick=start;$('stop').onclick=stop;
$('clear').onclick=()=>{regions=[];selected=null;drawNext=false;updateList();fitWindowToCrop();};
$('reset').onclick=()=>{regions=[{id:nextId++,type:'ellipse',x:.34,y:.16,w:.32,h:.68}];
  selected=regions[0].id;drawNext=false;updateList();fitWindowToCrop();};updateList();
$('record').onclick=()=>{
  if(recorder?.state==='recording'){stopRecording();return;}
  if(!stream||!framed.captureStream||!window.MediaRecorder){message('Canvas recording is unavailable.');return;}
  if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}
  $('download').disabled=true;chunks=[];
  recordingCrop=currentCrop();
  const recordingStream=framed.captureStream(30);
  for(const track of stream.getAudioTracks())recordingStream.addTrack(track);
  const types=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mime=types.find(type=>MediaRecorder.isTypeSupported(type));
  try{recorder=new MediaRecorder(recordingStream,mime?{mimeType:mime}:undefined);}
  catch(error){recordingCrop=null;message(`Recorder error: ${error.message}`);return;}
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  recorder.onstop=()=>{
    const blob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});
    downloadUrl=URL.createObjectURL(blob);$('download').disabled=false;
    for(const track of recordingStream.getVideoTracks())track.stop();
    recordingCrop=null;fitWindowToCrop();
    message('Recording ready to download.');
  };
  recorder.start(1000);$('record').textContent='■ Stop recording';
  message('Recording processed video and available microphone audio.');
};
$('download').onclick=()=>{if(!downloadUrl)return;const link=document.createElement('a');
  link.href=downloadUrl;link.download=`zebezo-webcam-mask-${new Date().toISOString().replace(/[:.]/g,'-')}.webm`;
  link.click();};
$('close').onclick=hideEditor;
addEventListener('pagehide',()=>{stop();if(downloadUrl)URL.revokeObjectURL(downloadUrl);
  if(imageUrl)URL.revokeObjectURL(imageUrl);});
window.StreamerMask={start,stop,showEditor,hideEditor,cameraError};
})();
