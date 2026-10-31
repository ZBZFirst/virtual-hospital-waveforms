'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const plan=require('./floor-plan.js');

class Group{constructor(){this.children=[];}add(child){this.children.push(child);}}
class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material;
  this.position={set:(x,y,z)=>{Object.assign(this.position,{x,y,z});}};this.rotation={};this.userData={};}}
class Material{constructor(options){Object.assign(this,options);}}
class Texture{constructor(canvas){this.image=canvas;}}
const written=[];
const context=vm.createContext({
  document:{createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText:text=>written.push(text)})})},
  THREE:{Group,Mesh,MeshBasicMaterial:Material,CanvasTexture:Texture,
    PlaneGeometry:class{constructor(width,height){this.width=width;this.height=height;}},
    DoubleSide:2,SRGBColorSpace:'srgb'},
  floorHeight:3.2,
});
vm.runInContext(fs.readFileSync('scene3d/parts/floor-labels.js','utf8'),context);
const a1=context.makeFloorLabels('A',1),b6=context.makeFloorLabels('B',6);
assert.equal(a1.children.length,10);
assert.equal(b6.children.length,10);
assert.deepEqual(a1.children.map(mesh=>mesh.userData.floorLabel),[
  'Hospital A Floor 1','Room 1','Room 2','Room 3','Room 4','Room 5','Room 6',
  'Supply Room','Break Room','Elevator']);
assert(written.includes('Hospital A')&&written.includes('Floor 1'));
assert(written.includes('Supply Room')&&written.includes('Break Room'));
const boxes=[plan.station,...plan.rooms,plan.elevator];
for(let index=0;index<a1.children.length;index++){
  const mesh=a1.children[index],box=boxes[index];
  const x=mesh.position.x*25+450,y=mesh.position.z*25+320;
  assert(x>box.x&&x<box.x+box.w&&y>box.y&&y<box.y+box.h,
    `${mesh.name} must lie inside its floor space`);
  assert.equal(mesh.position.y,.12);
  assert.equal(mesh.rotation.x,-Math.PI/2);
}
assert(Math.abs(b6.children[0].position.y-(5*3.2+.12))<1e-9);
assert.equal(a1.children[1].material.map,b6.children[1].material.map,
  'generic room art is reused across floors');
assert.notEqual(a1.children[0].material.map,b6.children[0].material.map,
  'hospital and floor art is specific to each unit');
console.log('All ten floor labels align with the shared unit spaces');
