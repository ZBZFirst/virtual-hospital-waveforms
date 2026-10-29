/* Fetch verified byte ranges from the immutable public recording revision. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SegmentStore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function validateIndex(index,entries){
    if(!index||index.version!==1||index.sampleRate!==50||index.segmentSamples!==90000||!index.feeds)
      throw new Error('Unsupported segment index');
    for(const entry of entries){
      const feed=index.feeds[entry.name];
      if(!feed||feed.samples!==entry.samples||feed.bytes!==entry.bytes||!Array.isArray(feed.segments)||!feed.segments.length)
        throw new Error(`Segment index does not match ${entry.name}`);
      let next=0;
      for(const segment of feed.segments){
        if(segment.coreStart!==next||segment.coreEnd<=next||segment.coreEnd>feed.samples||
           segment.sampleStart>segment.coreStart||segment.sampleEnd<segment.coreEnd||
           segment.byteStart<0||segment.byteEnd>feed.bytes||segment.byteEnd<=segment.byteStart||
           !/^[a-f0-9]{64}$/.test(segment.sha256))throw new Error(`Invalid segment range for ${entry.name}`);
        next=segment.coreEnd;
      }
      if(next!==feed.samples)throw new Error(`Unindexed samples in ${entry.name}`);
    }
  }
  function create(index,entries,base,options={}){
    validateIndex(index,entries);
    const fetcher=options.fetcher||fetch;
    const digest=options.digest||(async bytes=>{
      const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      return [...hash].map(value=>value.toString(16).padStart(2,'0')).join('');
    });
    const cache=new Map(),pending=new Map(),ready=new Set(),failed=new Map();
    const MAX_LATER_CACHE=64*1024*1024;
    let laterCacheBytes=0;
    const totalBytes=entries.reduce((sum,entry)=>{
      const segment=index.feeds[entry.name].segments[0];
      return sum+segment.byteEnd-segment.byteStart;
    },0);
    let firstBytesReceived=0,laterBytesReceived=0;
    const report=()=>options.onProgress?.({ready:ready.size,failed:failed.size,total:entries.length,
      firstBytesReceived,laterBytesReceived,totalBytes,
      verifiedBytes:[...ready].reduce((sum,name)=>{
        const segment=index.feeds[name].segments[0];return sum+segment.byteEnd-segment.byteStart;
      },0),failures:[...failed.entries()].map(([name,error])=>({name,error}))});
    function get(name,number){
      const segment=index.feeds[name]?.segments[number];
      if(!segment)return Promise.reject(new Error(`Unknown segment ${number} for ${name}`));
      const key=`${name}\n${number}`;
      if(cache.has(key)){
        const bytes=cache.get(key);
        if(number!==0){cache.delete(key);cache.set(key,bytes);}
        return Promise.resolve(bytes);
      }
      if(pending.has(key))return pending.get(key);
      if(number===0)failed.delete(name);
      const request=(async()=>{
        const response=await fetcher(base+encodeURIComponent(name),{
          headers:{Range:`bytes=${segment.byteStart}-${segment.byteEnd-1}`}});
        if(response.status!==206){await response.body?.cancel();throw new Error(`Expected HTTP 206, got ${response.status}`);}
        const expected=segment.byteEnd-segment.byteStart;
        const chunks=[];let received=0;
        if(response.body?.getReader){
          const reader=response.body.getReader();
          while(true){
            const {done,value}=await reader.read();if(done)break;
            chunks.push(value);received+=value.byteLength;
            if(number===0)firstBytesReceived+=value.byteLength;else laterBytesReceived+=value.byteLength;
            report();
            if(received>expected){await reader.cancel();throw new Error('Range response exceeds indexed byte count');}
          }
        }else{
          const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);received=bytes.length;
          if(number===0)firstBytesReceived+=received;else laterBytesReceived+=received;
          report();
        }
        if(received!==expected)throw new Error(`Incomplete range: ${received} of ${expected} bytes`);
        const bytes=new Uint8Array(received);let offset=0;
        for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        if(await digest(bytes)!==segment.sha256)throw new Error('Range checksum does not match source recording');
        cache.set(key,bytes);
        if(number!==0){
          laterCacheBytes+=bytes.length;
          for(const [oldKey,oldBytes] of cache){
            if(laterCacheBytes<=MAX_LATER_CACHE)break;
            if(oldKey.endsWith('\n0')||oldKey===key)continue;
            cache.delete(oldKey);laterCacheBytes-=oldBytes.length;
          }
        }
        if(number===0){ready.add(name);failed.delete(name);}
        report();
        return bytes;
      })().catch(error=>{
        if(number===0)failed.set(name,error.message);
        report();throw error;
      }).finally(()=>pending.delete(key));
      pending.set(key,request);report();return request;
    }
    async function warmFirst(names=entries.map(entry=>entry.name),concurrency=5){
      let next=0;
      async function worker(){
        while(next<names.length){const name=names[next++];try{await get(name,0);}catch{ /* Reported per feed. */ }}
      }
      await Promise.all(Array.from({length:Math.min(concurrency,names.length)},worker));
      return [...failed.entries()];
    }
    return {index,get,warmFirst,stats:()=>({ready:ready.size,failed:failed.size,total:entries.length,
      firstBytesReceived,laterBytesReceived,totalBytes,
      verifiedBytes:[...ready].reduce((sum,name)=>{
        const segment=index.feeds[name].segments[0];return sum+segment.byteEnd-segment.byteStart;
      },0),failures:[...failed.entries()].map(([name,error])=>({name,error}))}),
      has:(name,number)=>cache.has(`${name}\n${number}`),segment:(name,number)=>index.feeds[name]?.segments[number]};
  }
  return {validateIndex,create};
});
