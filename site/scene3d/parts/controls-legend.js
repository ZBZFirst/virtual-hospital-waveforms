const controlsHelpButton=document.querySelector('#controlsHelp');
const controlsLegend=document.querySelector('#controlsLegend');
let lastControlMode='';
function updateControlHelp(){
  const mode=grandCube?.focused?'cube':walkMode?'walk':tourPlaying?'tour':activeRoom?'patient':'scene';
  if(mode===lastControlMode)return;
  lastControlMode=mode;
  const labels={scene:'Scene',cube:'Nursing cube',walk:'Walk mode',tour:'Unit walk tour',patient:'Patient room'};
  const summaries={
    scene:'Scene · drag to orbit · wheel to zoom · right drag to pan',
    cube:'Nursing cube · drag to rotate · select a floor · Visit Floor to travel',
    walk:'Walk mode · W/A/S/D move · E elevator · Esc releases mouse',
    tour:'Unit walk tour · Play or pause · drag timeline to seek',
    patient:'Patient room · use Patient for recordings and room controls',
  };
  document.querySelector('#helpSummary').textContent=summaries[mode];
  document.querySelector('#controlMode').textContent=labels[mode];
  for(const section of controlsLegend.querySelectorAll('[data-control-mode]')){
    if(section.dataset.controlMode===mode)section.setAttribute('aria-current','true');
    else section.removeAttribute('aria-current');
  }
}
controlsHelpButton.addEventListener('click',()=>{
  controlsLegend.hidden=!controlsLegend.hidden;
  controlsHelpButton.setAttribute('aria-expanded',String(!controlsLegend.hidden));
  updateControlHelp();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && !controlsLegend.hidden){
    controlsLegend.hidden=true;
    controlsHelpButton.setAttribute('aria-expanded','false');
    controlsHelpButton.focus();
    event.preventDefault();
  }
});
updateControlHelp();
