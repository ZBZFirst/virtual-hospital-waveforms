/* Browser implementations of selected completed-breath research calculations.
 * Sources: ventMAP/ventmap/{SAM,breath_meta}.py,
 * ventparliament/parliament/other_calcs.py, ucdpv_pva_ml/analytics/collate.py.
 * This is a JavaScript port, not execution of the Python packages. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BrowserResearch=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const round=(value,digits)=>Number(value.toFixed(digits));
  const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  const median=values=>{const sorted=[...values].sort((a,b)=>a-b),m=sorted.length>>1;return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;};
  const regression=(x,y)=>{
    const mx=average(x),my=average(y);
    let xx=0,xy=0,yy=0;
    for(let i=0;i<x.length;i++){const a=x[i]-mx,b=y[i]-my;xx+=a*a;xy+=a*b;yy+=b*b;}
    return {slope:xy/xx,r:xy/Math.sqrt(xx*yy)};
  };
  function simpson(values,dt){
    const n=values.length;if(n<2)return 0;
    function odd(end){let sum=values[0]+values[end-1];for(let i=1;i<end-1;i++)sum+=(i%2?4:2)*values[i];return sum*dt/3;}
    if(n%2)return odd(n);
    if(n===2)return (values[0]+values[1])*dt/2;
    // Same even-sample convention as scipy.integrate.simpson (Cartwright tail).
    return odd(n-1)+dt*(5*values[n-1]+8*values[n-2]-values[n-3])/12;
  }
  function parliamentVolumes(flow,dt){
    const n=flow.length,vols=new Array(n).fill(0);
    if(n>=2)vols[1]=(flow[0]+flow[1])*dt/2;
    if(n>=3)vols[2]=dt*(flow[0]+4*flow[1]+flow[2])/3;
    let evens=0;
    if(n>=4){
      evens=dt*(flow[1]+4*flow[2]+flow[3])/3;
      vols[3]=(vols[2]+(flow[2]+flow[3])*dt/2+evens+vols[1])/2;
    }
    for(let i=4;i<n;i+=2)vols[i]=vols[i-2]+(flow[i-2]+4*flow[i-1]+flow[i])*dt/3;
    for(let i=5;i<n;i+=2){
      evens+=(flow[i-2]+4*flow[i-1]+flow[i])*dt/3;
      vols[i]=(evens+vols[1]+vols[i-1]+(flow[i-1]+flow[i])*dt/2)/2;
    }
    return vols;
  }
  function x0(flow,dt){
    let first=flow.length-1,last=-Infinity,best=flow.length-1;
    for(let i=0;i<flow.length-1;i++){
      if(flow[i]>=0&&flow[i+1]<0&&(
        (flow[i+1]<=-5&&flow[i+2]<0)||(flow[i+4]<=-5)||
        (flow[i+2]<=-5)||
        [1,2,3,4,5].every(j=>flow[i+j]<0))){first=i+1;break;}
    }
    for(let i=0;i<flow.length-1;i++){
      if(flow[i]<=0||flow[i+1]>0)continue;
      let begin=i;while(begin>0&&flow[begin-1]>0)begin--;
      const area=simpson(flow.slice(begin,i+1),dt);
      if(area>last){last=area;best=i+1;}
    }
    return Math.max(first,best);
  }
  function flags(meta){
    const out=[];const add=(group,code,value)=>out.push({group,code,value});
    const {iTime,eTime,tvi,tve,maxF,ipAUC,maxP}=meta;
    const ratio=tvi?Math.abs(tve)/tvi:NaN;
    add('Suction','su',iTime+eTime<.5&&tvi<250?1:0);
    for(const code of ['su.2','mt.su','sumt'])add('Suction',code,eTime<=.3?1:0);
    const cough=tve>0&&ipAUC<5&&maxF>20;
    add('Cough','co.orig',cough&&iTime<.5&&tvi<150?1:0);
    add('Cough','co.2thresh',cough&&iTime<=.2&&tvi<150?1:0);
    add('Cough','co.notvi',cough&&iTime<=.2?1:0);
    add('Cough','co.sudo',tve>0&&ipAUC<.25*maxP*.8&&maxF>20?1:0);
    const level=ratio>=.66&&ratio<.9?1:ratio>=.33&&ratio<.66?2:ratio>=0&&ratio<.33?3:0;
    add('Breath stacking','bs.1',eTime>.3?level:0);
    add('Breath stacking','bs.2',eTime<=.3&&tve>100&&ratio>=.25?level:0);
    add('Double trigger','dbl.2',ratio<.25&&eTime<=.3?1:0);
    add('Double trigger','dbl.3',ratio>=.25&&ratio<.5&&eTime<=.3&&tve<=100?1:0);
    return out;
  }
  function mechanics(flow,pressure,split,dt,meta){
    const unavailable=reason=>({status:'unavailable',reason});
    if(split<=0||split>=flow.length||meta.tvi<=0||meta.PIP<=meta.PEEP)return unavailable('Breath does not meet calculation inputs.');
    const begin=Math.trunc(.1/dt),end=Math.trunc(.5/dt);
    if(flow.length-split<=end)return unavailable('Expiration is too short for the Al-Rawas calculation.');
    const ex=flow.slice(split,split+end).map(value=>value/60);
    const vols=parliamentVolumes(ex,dt).map(Math.abs);
    const xs=ex.slice(begin).map(Math.abs),ys=vols.slice(begin);
    if(xs.some(value=>value<=0))return unavailable('Expiratory flow reaches zero in the fit interval.');
    const fit=regression(xs,ys);
    if(!Number.isFinite(fit.r)||Math.abs(fit.r)<.95)return unavailable('Expiratory fit did not meet the 0.95 correlation gate.');
    const tau=regression(xs.map((_,i)=>i),ys.map((v,i)=>v/xs[i])).slope;
    const compliance=median(flow.slice(0,split).map(f=>(meta.tvi/1000+tau*f/60)/(meta.PIP-meta.PEEP)));
    if(!Number.isFinite(tau)||tau<=0||!Number.isFinite(compliance)||compliance<=0)return unavailable('Mechanics result is not positive and finite.');
    return {status:'ok',method:'al_rawas_calcs_browser_port',tau_s:round(tau,4),
      plateau_cmH2O:round(meta.tvi/1000/compliance+meta.PEEP,2),
      compliance_L_per_cmH2O:round(compliance,4),resistance_cmH2O_s_per_L:round(tau/compliance,2)};
  }
  function analyze(flowInput,pressureInput,number,marker='BS',dt=.02){
    const flow=Array.from(flowInput),pressure=Array.from(pressureInput),n=flow.length;
    if(n<3||pressure.length!==n||!flow.every(Number.isFinite)||!pressure.every(Number.isFinite))
      return {status:'unavailable',breath:number,reason:'Incomplete or invalid breath samples.'};
    if(!Number.isFinite(dt)||dt<=0)return {status:'unavailable',breath:number,reason:'Unknown sample interval.'};
    const split=x0(flow,dt),iFlow=flow.slice(0,split),eFlow=flow.slice(split);
    const iPressure=pressure.slice(0,split),ePressure=pressure.slice(split);
    const iTime=round(split*dt,2),eTime=round(n*dt-iTime,2);
    const meta={iTime,eTime,inst_RR:60/(n*dt),
      tvi:simpson(iFlow,dt)*1000/60,tve:Math.abs(simpson(eFlow,dt)*1000/60),
      PIP:iPressure.length?Math.max(...iPressure):null,
      PEEP:ePressure.length?average(ePressure.slice(-5)):0,
      Maw:iPressure.length?average(iPressure):null,x0_index:split,
      maxF:Math.max(...flow),minF:Math.min(...flow),
      ipAUC:simpson(iPressure,dt),maxP:Math.max(...pressure)};
    const result={status:'ok',breath:number,marker,sample_count:n,ventmap:meta,
      mechanics:mechanics(flow,pressure,split,dt,meta),heuristics:{status:'ok',flags:flags(meta)}};
    return result;
  }
  return {analyze,simpson,x0};
});
