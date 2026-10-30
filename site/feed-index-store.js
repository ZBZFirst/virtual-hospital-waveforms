/* Load only the selected recording's verified CSV range index. */
(() => {
  'use strict';
  function create(entries, sourceBase, options={}){
    const byName=new Map(entries.map(entry=>[entry.name,entry]));
    const stores=new Map(),pending=new Map(),indexFailures=new Map();
    const index={segmentSamples:90000,feeds:{}};
    const report=()=>options.onProgress?.(stats());
    function stats(){
      const result={ready:0,failed:0,total:entries.length,firstBytesReceived:0,
        laterBytesReceived:0,totalBytes:0,verifiedBytes:0,failures:[]};
      for(const store of stores.values()){
        const item=store.stats();
        result.ready+=item.ready;
        result.firstBytesReceived+=item.firstBytesReceived;
        result.laterBytesReceived+=item.laterBytesReceived;
        result.totalBytes+=item.totalBytes;
        result.verifiedBytes+=item.verifiedBytes;
        result.failures.push(...item.failures);
      }
      for(const [name,error] of indexFailures)result.failures.push({name,error});
      result.failed=result.failures.length;
      return result;
    }
    async function ready(name){
      if(stores.has(name))return stores.get(name);
      if(pending.has(name))return pending.get(name);
      const entry=byName.get(name);
      if(!entry)throw Error(`Unknown feed ${name}`);
      indexFailures.delete(name);
      const request=(async()=>{
        const response=await fetch(`feed-index/${encodeURIComponent(name)}.json?v=20261029-fast-load2`);
        if(!response.ok)throw Error(`Feed index HTTP ${response.status}`);
        const shard=await response.json();
        if(!options.localPreview&&!sourceBase.includes(shard.sourceRevision))throw Error('Feed index source revision differs from recording URL');
        const store=SegmentStore.create(shard,[entry],sourceBase,{onProgress:report});
        index.feeds[name]=shard.feeds[name];
        stores.set(name,store);
        report();
        return store;
      })().catch(error=>{indexFailures.set(name,error.message);report();throw error;})
        .finally(()=>pending.delete(name));
      pending.set(name,request);
      return request;
    }
    async function get(name,number){return (await ready(name)).get(name,number);}
    function segment(name,number){return index.feeds[name]?.segments[number];}
    async function warmFirst(names,concurrency=2){
      let next=0;
      async function worker(){
        while(next<names.length){const name=names[next++];try{await (await ready(name)).get(name,0);}catch{/* Reported per feed. */}}
      }
      await Promise.all(Array.from({length:Math.min(concurrency,names.length)},worker));
      return stats().failures;
    }
    return {ready,get,segment,index,stats,warmFirst};
  }
  window.FeedIndexStore={create};
})();
