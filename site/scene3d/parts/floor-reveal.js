// The six lightweight plans establish the complete layout before the shared GLB arrives.
const floorPreviews=new Map(),floorReveals=new Map();
const floorRevealOrder=[4,5,6,1,2,3];
function expandedFloorPosition(level,site){
  const column=(level-1)%3,row=Math.floor((level-1)/3);
  return new THREE.Vector3(site.x+(column-1)*38,0,site.z+(row-.5)*42);
}
function makeFloorPreview(level,site){
  if(floorPreviews.has(level))return floorPreviews.get(level);
  const group=new THREE.Group(),y=(level-1)*floorHeight;
  const slabMaterial=new THREE.MeshBasicMaterial({color:0x6f8f99,transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide});
  const roomMaterial=new THREE.MeshBasicMaterial({color:0xa8c6cc,transparent:true,opacity:.55,depthWrite:false,wireframe:true});
  const slab=new THREE.Mesh(new THREE.BoxGeometry(34.2,.15,24.2),slabMaterial);
  slab.position.y=y-.08;group.add(slab);
  const roomGeometry=new THREE.BoxGeometry(9,.15,6.6);
  for(const [x,z] of [[-10,-7],[0,-7],[10,-7],[-10,7],[0,7],[10,7]]){
    const room=new THREE.Mesh(roomGeometry,roomMaterial);
    room.position.set(x,y+.08,z);group.add(room);
  }
  const badge=makeFloorBadge(level);badge.visible=true;group.add(badge);
  group.position.copy(expandedFloorPosition(level,site));
  scene.add(group);
  const preview={group,materials:new Map([[slabMaterial,slabMaterial.opacity],[roomMaterial,roomMaterial.opacity],
    [badge.material,badge.material.opacity]])};
  floorPreviews.set(level,preview);
  return preview;
}
function removeFloorPreview(level){
  const preview=floorPreviews.get(level);if(!preview)return;
  scene.remove(preview.group);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  preview.group.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material)continue;materials.add(material);if(material.map)textures.add(material.map);
    }
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
  for(const texture of textures)texture.dispose();
  floorPreviews.delete(level);
}
function finishFloorReveal(level){
  const reveal=floorReveals.get(level);if(!reveal)return;
  for(const binding of reveal.bindings)binding.object.material=binding.original;
  for(const material of reveal.copies)material.dispose();
  floorReveals.delete(level);removeFloorPreview(level);
}
function clearFloorReveals(){
  for(const level of [...floorReveals.keys()])finishFloorReveal(level);
  for(const level of [...floorPreviews.keys()])removeFloorPreview(level);
}
function revealFloor(level,floor,site){
  finishFloorReveal(level);
  const copies=new Map(),bindings=[];
  const copyMaterial=material=>{
    if(!copies.has(material)){
      const clone=material.clone();clone.transparent=true;clone.depthWrite=false;clone.opacity=0;
      clone.needsUpdate=true;copies.set(material,clone);
    }
    return copies.get(material);
  };
  floor.group.traverse(object=>{
    if(!object.material)return;
    const original=object.material;
    object.material=Array.isArray(original)?original.map(copyMaterial):copyMaterial(original);
    bindings.push({object,original});
  });
  floor.group.position.copy(expandedFloorPosition(level,site));
  floor.group.visible=true;floor.roof.visible=false;floor.badge.visible=true;
  floor.patients.forEach((patient,room)=>{if(patient){patient.visible=false;floor.proxies[room].visible=true;}});
  floorReveals.set(level,{start:performance.now(),duration:650,bindings,copies:[...copies.values()],originals:copies});
}
function tickFloorReveals(now){
  for(const [level,reveal] of floorReveals){
    const t=Math.min(1,(now-reveal.start)/reveal.duration),smooth=t*t*(3-2*t);
    for(const [original,copy] of reveal.originals)copy.opacity=original.opacity*smooth;
    const preview=floorPreviews.get(level);
    if(preview)for(const [material,opacity] of preview.materials)material.opacity=opacity*(1-smooth);
    if(t===1)finishFloorReveal(level);
  }
}
