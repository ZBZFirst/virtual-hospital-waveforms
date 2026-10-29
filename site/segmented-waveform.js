/* Full-resolution sparse feed arrays filled from verified CSV byte ranges. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SegmentedWaveform=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const NUMBER=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const STAMP=/^\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.\d+/;
  function parseStamp(value){
    const match=/^(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)\.(\d+)/.exec(value);
    if(!match)return NaN;
    const [,year,month,day,hour,minute,second,fraction]=match;
    return Date.UTC(+year,+month-1,+day,+hour,+minute,+second)/1000+Number('0.'+fraction);
  }
  function parse(text){
    const flow=[],pressure=[],times=[],markers=[],gaps=[];
    let bad=0,gapPending=false,timestamped=false;
    for(const raw of text.split(/\r?\n/)){
      const line=raw.replace(/^\0+/, '').trim();if(!line)continue;
      const parts=line.split(',').map(value=>value.trim());
      if(parts[0]==='BS'||parts[1]==='BS'){
        markers.push({kind:'BS',index:flow.length,sourceMarker:parts.find(value=>/^S:\d+$/.test(value))||'BS'});gapPending=false;continue;
      }
      if(parts[0]==='BE'||parts[1]==='BE'){
        markers.push({kind:'BE',index:flow.length});continue;
      }
      if(parts.length===1&&STAMP.test(parts[0]))continue;
      const stamped=STAMP.test(parts[0]);
      const a=stamped?parts[1]:parts[0],b=stamped?parts[2]:parts[1];
      if(a!==undefined&&b!==undefined&&NUMBER.test(a)&&NUMBER.test(b)&&
         Number.isFinite(Number(a))&&Number.isFinite(Number(b))){
        flow.push(Number(a));pressure.push(Number(b));times.push(stamped?parseStamp(parts[0]):NaN);
        if(stamped)timestamped=true;
        if(gapPending){gaps.push(flow.length-1);gapPending=false;}
      }else{bad++;gapPending=true;markers.push({kind:'GAP',index:flow.length});}
    }
    return {flow:Float32Array.from(flow),pressure:Float32Array.from(pressure),
      times:timestamped?Float64Array.from(times):null,markers,gaps,bad};
  }
  function create(feed){
    const n=feed.samples,flow=new Float32Array(n),pressure=new Float32Array(n);
    flow.fill(NaN);pressure.fill(NaN);
    const volume=new Float64Array(n),volumeSegment=new Int32Array(n);
    volume.fill(NaN);volumeSegment.fill(-1);
    const times=new Float64Array(n);times.fill(NaN);
    return {flow,pressure,times,timestamped:false,volume,volumeSegment,markers:[],gaps:[],breathStarts:[],
      completed:[],bad:0,loadedSegments:new Set(),loadingSegments:new Map(),failedSegments:new Set(),
      overview:{lo:Float32Array.from(feed.overview.lo,value=>value===null?Infinity:value),
        hi:Float32Array.from(feed.overview.hi,value=>value===null?-Infinity:value),
        min:feed.overview.min,max:feed.overview.max}};
  }
  function ingest(data,segment,number,parsed,volumeCalculator,breathCalculator,rate=50){
    const expected=segment.sampleEnd-segment.sampleStart;
    if(parsed.flow.length!==expected||parsed.pressure.length!==expected)
      throw new Error(`Segment sample count mismatch: ${parsed.flow.length} of ${expected}`);
    data.flow.set(parsed.flow,segment.sampleStart);
    data.pressure.set(parsed.pressure,segment.sampleStart);
    if(parsed.times){data.times.set(parsed.times,segment.sampleStart);data.timestamped=true;}
    const known=new Set(data.markers.map(marker=>`${marker.index}:${marker.kind}`));
    for(const marker of parsed.markers){
      const global={kind:marker.kind,index:segment.sampleStart+marker.index,
        ...(marker.sourceMarker?{sourceMarker:marker.sourceMarker}:{})};
      const key=`${global.index}:${global.kind}`;
      if(!known.has(key)){data.markers.push(global);known.add(key);}
    }
    const kindOrder={BE:0,GAP:1,BS:2};
    data.markers.sort((a,b)=>a.index-b.index||kindOrder[a.kind]-kindOrder[b.kind]);
    data.gaps=[...new Set(data.gaps.concat(parsed.gaps.map(index=>segment.sampleStart+index)))].sort((a,b)=>a-b);
    data.breathStarts=data.markers.filter(marker=>marker.kind==='BS').map(marker=>marker.index);
    const derived=volumeCalculator.calculate(data.flow,data.markers,data.timestamped?data.times:null,rate,data.gaps);
    data.volume=derived.volume;data.volumeSegment=derived.segment;
    data.completed=breathCalculator.calculate(data.flow,data.pressure,derived.completed,
      data.timestamped?data.times:null,rate);
    data.bad=data.markers.filter(marker=>marker.kind==='GAP').length;
    data.loadedSegments.add(number);
    return data;
  }
  return {parse,create,ingest};
});
