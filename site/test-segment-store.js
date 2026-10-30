const assert=require('node:assert/strict');
const {create,validateIndex}=require('./segment-store.js');
const full=require('./segment-index.json');
const manifest=require('./manifest.json');
validateIndex(full,manifest.entries);
assert.equal(Object.keys(full.feeds).length,145);
assert.equal(full.feeds[manifest.entries[0].name].segments[0].coreEnd,3000);
assert.ok(manifest.entries.every(entry=>full.feeds[entry.name].segments[0].coreEnd<=3000));
const {createHash}=require('node:crypto');
const source=new TextEncoder().encode('BS\n1,2\n2,3\nBE\n');
const hash=createHash('sha256').update(source).digest('hex');
const name='synthetic.csv',entries=[{name,samples:2,bytes:source.length}];
const index={version:1,sampleRate:50,segmentSamples:90000,feeds:{[name]:{
  samples:2,bytes:source.length,segments:[{coreStart:0,coreEnd:2,sampleStart:0,sampleEnd:2,
    byteStart:0,byteEnd:source.length,sha256:hash}]}}};
let calls=0,range=null,progress=null;
const fetcher=async(url,options)=>{calls++;range=options.headers.Range;return new Response(source,{status:206});};
const digest=async bytes=>createHash('sha256').update(bytes).digest('hex');
(async()=>{
  const store=create(index,entries,'https://example.test/',{fetcher,digest,onProgress:stats=>progress=stats});
  const [a,b]=await Promise.all([store.get(name,0),store.get(name,0)]);
  assert.deepEqual(a,source);assert.equal(a,b);assert.equal(calls,1);
  assert.equal(range,`bytes=0-${source.length-1}`);
  assert.equal(progress.ready,1);assert.equal(progress.verifiedBytes,source.length);
  await store.warmFirst();assert.equal(calls,1);
  const wrongStatus=create(index,entries,'',{fetcher:async()=>new Response(source,{status:200}),digest});
  await assert.rejects(wrongStatus.get(name,0),/HTTP 206/);
  assert.equal(wrongStatus.stats().failed,1);
  const wrongBytes=create(index,entries,'',{fetcher:async()=>new Response(new TextEncoder().encode('same length??'),{status:206}),digest});
  await assert.rejects(wrongBytes.get(name,0),/range|checksum/i);
  const laterIndex=structuredClone(index);
  const laterSource=new TextEncoder().encode('BS\n3,4\n4,5\nBE\n');
  laterIndex.feeds[name].samples=4;
  laterIndex.feeds[name].bytes=source.length+laterSource.length;
  laterIndex.feeds[name].segments[0].coreEnd=2;
  laterIndex.feeds[name].segments.push({coreStart:2,coreEnd:4,sampleStart:2,sampleEnd:4,
    byteStart:source.length,byteEnd:source.length+laterSource.length,
    sha256:createHash('sha256').update(laterSource).digest('hex')});
  const requested=[];
  const laterStore=create(laterIndex,[{name,samples:4,bytes:source.length+laterSource.length}],
    '',{fetcher:async(_url,options)=>{
      requested.push(options.headers.Range);
      return new Response(requested.length===1?source:laterSource,{status:206});
    },digest});
  await laterStore.warmFirst();
  assert.deepEqual(requested,[`bytes=0-${source.length-1}`]);
  await laterStore.get(name,1);
  assert.deepEqual(requested,[`bytes=0-${source.length-1}`,
    `bytes=${source.length}-${source.length+laterSource.length-1}`]);
  assert.equal(laterStore.stats().laterBytesReceived,laterSource.length);
  const invalid=structuredClone(index);invalid.feeds[name].segments[0].coreEnd=1;
  assert.throws(()=>validateIndex(invalid,entries),/Unindexed samples/);
  console.log('segment store tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
