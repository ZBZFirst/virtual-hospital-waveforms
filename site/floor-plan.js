/* Deterministic virtual unit floor with real door gaps and connected hallways. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FloorPlan=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const width=900,height=640,doorHalf=17;
  const rooms=[
    {room:1,x:80,y:40,w:220,h:110,side:'bottom',facade:'north',door:{x:190,y:150}},
    {room:2,x:340,y:40,w:220,h:110,side:'bottom',facade:'north',door:{x:450,y:150}},
    {room:3,x:600,y:40,w:220,h:110,side:'bottom',facade:'north',door:{x:710,y:150}},
    {room:4,x:45,y:240,w:170,h:110,side:'right',facade:'west',door:{x:215,y:295}},
    {room:5,x:685,y:240,w:170,h:110,side:'left',facade:'east',door:{x:685,y:295}},
    {room:6,x:80,y:485,w:220,h:110,side:'top',facade:'south',door:{x:190,y:485}},
    {room:7,label:'Supply room',kind:'supply',x:340,y:485,w:220,h:110,side:'top',facade:'south',door:{x:450,y:485}},
    {room:8,label:'Break room',kind:'break',x:600,y:485,w:220,h:110,side:'top',facade:'south',door:{x:710,y:485}}
  ];
  const station={id:'station',x:380,y:275,w:140,h:105,side:'top',door:{x:450,y:275},
    doors:[{side:'top',x:450,y:275},{side:'left',x:380,y:327},
      {side:'right',x:520,y:327},{side:'bottom',x:450,y:380}]};
  const elevator={id:'elevator',x:45,y:380,w:110,h:100,side:'right',door:{x:155,y:430}};
  const points={
    elevator:elevator.door,station:{x:450,y:327},
    station_top:station.doors[0],station_left:station.doors[1],
    station_right:station.doors[2],station_bottom:station.doors[3],
    room_1:rooms[0].door,room_2:rooms[1].door,room_3:rooms[2].door,
    room_4:rooms[3].door,room_5:rooms[4].door,room_6:rooms[5].door,
    room_7:rooms[6].door,room_8:rooms[7].door,
    top_far_left:{x:190,y:190},top_left:{x:250,y:190},top_mid:{x:450,y:190},
    top_right:{x:650,y:190},top_far_right:{x:710,y:190},
    left_mid:{x:250,y:295},left_station:{x:250,y:327},
    right_mid:{x:650,y:295},right_station:{x:650,y:327},
    bottom_far_left:{x:190,y:430},bottom_left:{x:250,y:430},
    bottom_mid:{x:450,y:430},bottom_right:{x:650,y:430},
    bottom_far_right:{x:710,y:430}
  };
  const edges=[
    ['top_far_left','top_left'],['top_left','top_mid'],['top_mid','top_right'],
    ['top_right','top_far_right'],['top_left','left_mid'],['left_mid','left_station'],
    ['left_station','bottom_left'],['top_right','right_mid'],
    ['right_mid','right_station'],['right_station','bottom_right'],
    ['bottom_far_left','bottom_left'],['bottom_left','bottom_mid'],
    ['bottom_mid','bottom_right'],['bottom_right','bottom_far_right'],
    ['room_1','top_far_left'],['room_2','top_mid'],['room_3','top_far_right'],
    ['room_4','left_mid'],['room_5','right_mid'],
    ['room_6','bottom_far_left'],['room_7','bottom_mid'],['room_8','bottom_far_right'],
    ['top_mid','station_top'],['left_station','station_left'],
    ['right_station','station_right'],['bottom_mid','station_bottom'],
    ['station','station_top'],['station','station_left'],
    ['station','station_right'],['station','station_bottom'],
    ['elevator','bottom_left']
  ];
  function wallsFor(rect){
    const x2=rect.x+rect.w,y2=rect.y+rect.h;
    const full={top:[rect.x,rect.y,x2,rect.y],bottom:[rect.x,y2,x2,y2],
      left:[rect.x,rect.y,rect.x,y2],right:[x2,rect.y,x2,y2]};
    return Object.keys(full).flatMap(side=>{
      const door=(rect.doors||[Object.assign({side:rect.side},rect.door)]).find(item=>item.side===side);
      if(!door)return [full[side]];
      const coordinate=side==='top'||side==='bottom'?door.x:door.y;
      const fixed=side==='top'?rect.y:side==='bottom'?y2:side==='left'?rect.x:x2;
      const start=side==='top'||side==='bottom'?rect.x:rect.y;
      const end=side==='top'||side==='bottom'?x2:y2;
      return side==='top'||side==='bottom'?
        [[start,fixed,coordinate-doorHalf,fixed],[coordinate+doorHalf,fixed,end,fixed]]:
        [[fixed,start,fixed,coordinate-doorHalf],[fixed,coordinate+doorHalf,fixed,end]];
    });
  }
  function neighbors(id){
    return edges.flatMap(([a,b])=>a===id?[b]:b===id?[a]:[]);
  }
  function route(from,to){
    if(!points[from]||!points[to])return null;
    const queue=[from],previous=new Map([[from,null]]);
    for(let index=0;index<queue.length;index++){
      const node=queue[index];if(node===to)break;
      for(const next of neighbors(node))if(!previous.has(next)){
        previous.set(next,node);queue.push(next);
      }
    }
    if(!previous.has(to))return null;
    const path=[];for(let node=to;node!==null;node=previous.get(node))path.unshift(node);
    return path;
  }
  function buildingRoute(fromLevel,fromNode,toLevel,toNode,maxFloors=4){
    if(!Number.isInteger(fromLevel)||!Number.isInteger(toLevel)||
       fromLevel<1||toLevel<1||fromLevel>maxFloors||toLevel>maxFloors)return null;
    const direct=route(fromNode,toNode);
    if(fromLevel===toLevel)return direct?.map(node=>({level:fromLevel,node}))??null;
    const start=route(fromNode,'elevator'),end=route('elevator',toNode);
    if(!start||!end)return null;
    const step=toLevel>fromLevel?1:-1;
    const path=start.map(node=>({level:fromLevel,node}));
    for(let level=fromLevel+step;level!==toLevel+step;level+=step)
      path.push({level,node:'elevator'});
    path.push(...end.slice(1).map(node=>({level:toLevel,node})));
    return path;
  }
  function facadeWindows(){
    return rooms.map(room=>{
      const horizontal=room.facade==='north'||room.facade==='south';
      const axis=horizontal?room.x+room.w/2:room.y+room.h/2;
      const fraction=horizontal?(axis-25)/850:(axis-20)/600;
      return {room:room.room,facade:room.facade,
        position:room.facade==='north'||room.facade==='west'?1-fraction:fraction};
    });
  }
  function overlaps(a,b){return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;}
  function validate(){
    const issues=[],spaces=[...rooms,station,elevator];
    if(rooms.length!==8||new Set(rooms.map(room=>room.room)).size!==8)issues.push('Expected eight unique rooms');
    for(let i=0;i<spaces.length;i++){
      const space=spaces[i];
      for(const {x,y,side} of space.doors||[Object.assign({side:space.side},space.door)]){
        const onSide=side==='top'&&y===space.y&&x-doorHalf>space.x&&x+doorHalf<space.x+space.w||
          side==='bottom'&&y===space.y+space.h&&x-doorHalf>space.x&&x+doorHalf<space.x+space.w||
          side==='left'&&x===space.x&&y-doorHalf>space.y&&y+doorHalf<space.y+space.h||
          side==='right'&&x===space.x+space.w&&y-doorHalf>space.y&&y+doorHalf<space.y+space.h;
        if(!onSide)issues.push(`Door outside ${space.id??space.room}`);
      }
      for(let j=i+1;j<spaces.length;j++)if(overlaps(space,spaces[j]))
        issues.push(`Rooms overlap: ${space.id??space.room}, ${spaces[j].id??spaces[j].room}`);
    }
    for(const [a,b] of edges){
      if(!points[a]||!points[b])issues.push(`Missing hallway endpoint ${a} or ${b}`);
      else if(points[a].x!==points[b].x&&points[a].y!==points[b].y)
        issues.push(`Nonorthogonal hallway ${a} to ${b}`);
      else for(const space of spaces){
        const p=points[a],q=points[b];
        const inside=p.x===q.x?p.x>space.x&&p.x<space.x+space.w&&
          Math.max(p.y,q.y)>space.y&&Math.min(p.y,q.y)<space.y+space.h:
          p.y>space.y&&p.y<space.y+space.h&&
          Math.max(p.x,q.x)>space.x&&Math.min(p.x,q.x)<space.x+space.w;
        if(inside&&!(space===station&&[a,b].some(id=>id==='station')))
          issues.push(`Hallway crosses ${space.id??space.room}`);
      }
    }
    for(const id of [...rooms.map(room=>`room_${room.room}`),'station'])
      if(!route('elevator',id))issues.push(`No elevator route to ${id}`);
    return issues;
  }
  return {width,height,doorHalf,rooms,station,elevator,points,edges,
    wallsFor,route,buildingRoute,facadeWindows,validate};
});
