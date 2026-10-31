'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('styles.css','utf8');
assert(html.indexOf('id="captureStage"')<html.indexOf('id="hospitalScene"'));
assert(html.indexOf('id="gridMonitor"')<html.lastIndexOf('</div>\n  <script'));
assert(html.indexOf('id="streamerTheme"')>html.indexOf('id="streamerHorizontal"'));
assert(!html.includes('<span>OBS Browser Source'));
assert(css.includes('aspect-ratio: 16 / 9'));
assert(css.includes('aspect-ratio: 9 / 16'));
assert(html.includes('id="streamerClean"'));
assert(html.includes('id="streamerRestore"'));
assert(css.includes('streamer-clean .site-head'));

const handlers=new Map(),elements=new Map(),storage=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{
    hidden:id==='streamerWindow'||id==='streamerLayout'||id==='streamerEditor',style:{},dataset:{},offsetWidth:300,offsetHeight:220,
    clientWidth:1920,clientHeight:1080,textContent:'',srcObject:null,
    listeners:new Map(),addEventListener(type,callback){this.listeners.set(type,callback);},
    setAttribute(key,value){this[key]=value;},
    getBoundingClientRect(){return {left:id==='captureStage'?0:1600,top:id==='captureStage'?0:172};},
    play:async()=>{},classList:{toggle:()=>false,add:()=>{},remove:()=>{}},
  });
  return elements.get(id);
}
const bodyClasses=new Set();
element('hospitalScene').contentWindow={postMessage(){}};
const body={dataset:{},classList:{add:value=>bodyClasses.add(value),remove:value=>bodyClasses.delete(value),
  contains:value=>bodyClasses.has(value),toggle:(value,enabled)=>enabled?bodyClasses.add(value):bodyClasses.delete(value)}};
let stopped=false;
let themeValue='original';
const context=vm.createContext({
  $:element,document:{body,documentElement:{dataset:{}}},location:{origin:'https://example.test'},
  window:{StreamerMask:{start:async()=>true,stop:()=>{stopped=true;},hideEditor:()=>{},showEditor:()=>{},fitWindowToCrop:()=>{}},
    ZeBeZoTheme:{getTheme:()=>themeValue,setTheme:value=>{themeValue=value;}}},
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
  requestAnimationFrame:callback=>callback(),
  addEventListener:(name,callback)=>handlers.set(name,callback),
  Math,Number,String,Error,
});
const source=fs.readFileSync('viewer.js','utf8');
const start=source.indexOf('function setupStreamerMode(');
const end=source.indexOf('\n}\nsetupStreamerMode();',start);
assert(start>=0&&end>start);
vm.runInContext(source.slice(start,end+2),context);
context.setupStreamerMode();
function click(id){element(id).listeners.get('click')();}
(async()=>{
  click('streamerToggle');
  assert(bodyClasses.has('streamer-mode'));
  assert.equal(element('streamerLayout').hidden,false);
  click('streamerPortrait');
  assert.equal(body.dataset.streamOrientation,'portrait');
  assert.equal(element('streamerPortrait')['aria-pressed'],'true');
  click('streamerHorizontal');
  assert.equal(body.dataset.streamOrientation,'horizontal');
  assert.equal(element('streamerHorizontal')['aria-pressed'],'true');
  element('streamerTheme').value='dark';element('streamerTheme').listeners.get('change')();
  assert.equal(themeValue,'dark','the grouped Theme control uses the site theme API');
  click('streamerClean');
  assert(bodyClasses.has('streamer-clean'));
  assert.equal(element('streamerRestore').hidden,false);
  assert.equal(element('streamerClean')['aria-pressed'],'true');
  click('streamerRestore');
  assert(!bodyClasses.has('streamer-clean'));
  assert.equal(element('streamerRestore').hidden,true);
  click('streamerClean');
  handlers.get('keydown')({key:'Escape'});
  assert(!bodyClasses.has('streamer-clean'));
  assert(bodyClasses.has('streamer-mode'),'first Escape restores hidden controls');
  handlers.get('keydown')({key:'Escape'});
  assert(!bodyClasses.has('streamer-mode'));
  assert.equal(element('streamerLayout').hidden,true);
  assert(stopped,'closing streamer mode stops the camera');
  click('streamerToggle');
  assert(bodyClasses.has('streamer-mode'));
  handlers.get('message')({origin:'https://example.test',source:element('hospitalScene').contentWindow,
    data:{type:'zebezo-scene-escape'}});
  assert(!bodyClasses.has('streamer-mode'),'Escape from the scene iframe exits streamer mode');
  console.log('Streamer mode switches OBS aspect layouts and closes the camera');
})().catch(error=>{console.error(error);process.exitCode=1;});
