'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class Vector3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(x,y,z){Object.assign(this,{x,y,z});return this;}copy(other){return this.set(other.x,other.y,other.z);}}
class Group{constructor(){this.children=[];this.position=new Vector3();this.visible=true;}add(child){this.children.push(child);child.parent=this;}traverse(fn){fn(this);for(const child of this.children){if(child.traverse)child.traverse(fn);else fn(child);}}}
class Material{constructor(options={}){Object.assign(this,{opacity:1,transparent:false,depthWrite:true,map:null},options);}clone(){return new Material({...this});}dispose(){this.disposed=true;}}
class Geometry{dispose(){this.disposed=true;}}
class Mesh extends Group{constructor(geometry,material){super();this.geometry=geometry;this.material=material;}}
const scene={children:[],add(group){this.children.push(group);},remove(group){this.children=this.children.filter(item=>item!==group);}};
const context=vm.createContext({
  THREE:{Vector3,Group,Mesh,MeshBasicMaterial:Material,BoxGeometry:Geometry,DoubleSide:2},
  scene,floorHeight:3.2,performance:{now:()=>0},
  makeFloorBadge:()=>({visible:false,material:new Material()}),
});
vm.runInContext(fs.readFileSync('scene3d/parts/floor-reveal.js','utf8'),context);
const site=new Vector3(100,0,200);
context.makeFloorPreview(4,site);
assert.equal(scene.children.length,1);
assert.equal(scene.children[0].position.x,62);
assert.equal(scene.children[0].position.z,221);
const original=new Material(),mesh=new Mesh(new Geometry(),original),group=new Group();group.add(mesh);
const floor={group,roof:{visible:true},badge:{visible:false},patients:[],proxies:[]};
context.revealFloor(4,floor,site);
assert.notEqual(mesh.material,original);
assert.equal(mesh.material.opacity,0);
context.tickFloorReveals(325);
assert(mesh.material.opacity>0&&mesh.material.opacity<1);
context.tickFloorReveals(650);
assert.equal(mesh.material,original,'fade restores shared template materials');
assert.equal(scene.children.length,0,'completed detail removes its placeholder');
context.makeFloorPreview(5,site);
const second=new Mesh(new Geometry(),original),secondGroup=new Group();secondGroup.add(second);
context.revealFloor(5,{group:secondGroup,roof:{visible:true},badge:{visible:false},patients:[],proxies:[]},site);
context.tickFloorReveals(100);
context.clearFloorReveals();
assert.equal(second.material,original,'navigation restores materials during an interrupted fade');
assert.equal(scene.children.length,0,'navigation removes pending placeholders');
console.log('Shared floor detail fades over the placeholder and restores materials');
