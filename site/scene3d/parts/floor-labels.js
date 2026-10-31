// Source coordinates follow floor-plan.js and the shared Floor 02 GLB:
// x = (plan x - 450) / 25, z = (plan y - 320) / 25.
const floorLabelTextures=new Map();
const floorLabelSpaces=Object.freeze([
  {name:'Room 1',x:190,y:125,width:3.2,height:.75},
  {name:'Room 2',x:450,y:125,width:3.2,height:.75},
  {name:'Room 3',x:710,y:125,width:3.2,height:.75},
  {name:'Room 4',x:178,y:295,width:2.6,height:.75},
  {name:'Room 5',x:722,y:295,width:2.6,height:.75},
  {name:'Room 6',x:190,y:510,width:3.2,height:.75},
  {name:'Supply Room',x:450,y:540,width:4,height:.9},
  {name:'Break Room',x:710,y:540,width:4,height:.9},
  {name:'Elevator',x:100,y:430,width:2.8,height:.75},
]);

function floorLabelTexture(lines){
  const key=lines.join('\n');
  if(floorLabelTextures.has(key))return floorLabelTextures.get(key);
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=lines.length>1?192:128;
  const c=canvas.getContext('2d');
  c.fillStyle='#10323c';c.fillRect(0,0,canvas.width,canvas.height);
  c.strokeStyle='#9ee0e6';c.lineWidth=6;c.strokeRect(4,4,canvas.width-8,canvas.height-8);
  c.fillStyle='#f0fcff';c.textAlign='center';c.textBaseline='middle';
  if(lines.length===1){
    c.font=`bold ${key.length>11?54:70}px system-ui`;
    c.fillText(lines[0],256,66,470);
  }else{
    c.font='bold 66px system-ui';c.fillText(lines[0],256,66,470);
    c.font='bold 60px system-ui';c.fillText(lines[1],256,142,470);
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=8;
  floorLabelTextures.set(key,texture);
  return texture;
}

function makeFloorLabelMesh(name,lines,width,height){
  const texture=floorLabelTexture(lines);
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
  mesh.name=`Floor label · ${name}`;
  mesh.rotation.x=-Math.PI/2;
  mesh.userData.floorLabel=name;
  return mesh;
}

function makeFloorLabels(hospitalId,level){
  const group=new THREE.Group();
  group.name=`Hospital ${hospitalId} Floor ${level} floor labels`;
  const top=(level-1)*floorHeight+.12;
  const spaces=[
    {name:`Hospital ${hospitalId} Floor ${level}`,lines:[`Hospital ${hospitalId}`,`Floor ${level}`],
      x:450,y:345,width:4.7,height:1.35},
    ...floorLabelSpaces.map(space=>({...space,lines:[space.name]})),
  ];
  for(const space of spaces){
    const mesh=makeFloorLabelMesh(space.name,space.lines,space.width,space.height);
    mesh.position.set((space.x-450)/25,top,(space.y-320)/25);
    group.add(mesh);
  }
  return group;
}

function labelElevatorCab(cabGroup){
  let platform=null;
  cabGroup.traverse(object=>{
    if(object.isMesh && /Elevator[_ ]cab[_ ]platform/i.test(object.name))platform=object;
  });
  if(!platform)throw Error('Elevator cab platform missing from model');
  const label=makeFloorLabelMesh('Elevator cab',['Elevator'],2.8,.75);
  // The platform mesh spans -0.07 to +0.07 in local Y.
  label.position.set(0,.09,0);
  platform.add(label);
  return label;
}
