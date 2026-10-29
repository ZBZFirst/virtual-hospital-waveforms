/* Vertical waveform ranges expand with observed values and never contract on scroll. */
(function(root){
  function create(){return {min:Infinity,max:-Infinity,seenMin:Infinity,seenMax:-Infinity,visibleMin:Infinity,visibleMax:-Infinity};}
  function padded(min,max){
    const margin=Math.max((max-min)*.08,1);
    return {min:min-margin,max:max+margin};
  }
  function observe(axis,min,max){
    if(!Number.isFinite(min)||!Number.isFinite(max)||min>max)return null;
    axis.visibleMin=min;axis.visibleMax=max;
    if(!Number.isFinite(axis.min)){
      axis.seenMin=min;axis.seenMax=max;
      Object.assign(axis,padded(min,max));
    }else{
      axis.seenMin=Math.min(axis.seenMin,min);
      axis.seenMax=Math.max(axis.seenMax,max);
      const margin=Math.max((axis.seenMax-axis.seenMin)*.08,1);
      if(min<axis.min)axis.min=min-margin;
      if(max>axis.max)axis.max=max+margin;
    }
    return {min:axis.min,max:axis.max};
  }
  function reset(axis){
    if(!Number.isFinite(axis.visibleMin))return false;
    axis.seenMin=axis.visibleMin;axis.seenMax=axis.visibleMax;
    Object.assign(axis,padded(axis.visibleMin,axis.visibleMax));
    return true;
  }
  function zoomIn(axis){
    if(!Number.isFinite(axis.visibleMin))return false;
    const currentSpan=axis.max-axis.min;
    const visibleSpan=axis.visibleMax-axis.visibleMin;
    const span=Math.max(currentSpan*.8,visibleSpan*1.16,2);
    const center=(axis.visibleMin+axis.visibleMax)/2;
    axis.min=center-span/2;axis.max=center+span/2;
    axis.seenMin=axis.visibleMin;axis.seenMax=axis.visibleMax;
    return true;
  }
  function zoomOut(axis){
    if(!Number.isFinite(axis.min))return false;
    const margin=(axis.max-axis.min)*.125;
    axis.min-=margin;axis.max+=margin;
    return true;
  }
  function tickLabels(min,max){
    const step=(max-min)/4;
    const decimals=step>=10?0:step>=1?1:step>=.1?2:3;
    return Array.from({length:5},(_,index)=>{
      const value=max-step*index;
      return String(Number(value.toFixed(decimals)));
    });
  }
  root.WaveformAxis={create,observe,reset,zoomIn,zoomOut,tickLabels};
})(globalThis);
