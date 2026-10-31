function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  if(telemetryDetail)paintTelemetryDetail(now);
  const frameDelta = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  if(expansion && !expansion.finished){
    const t=Math.min(1,(now-expansion.start)/expansion.duration);
    const smooth=t*t*(3-2*t),{building,materials}=expansion;
    if(!expansion.materialsPrepared){
      for(const material of materials.keys()){material.transparent=true;material.depthWrite=false;material.needsUpdate=true;}
      expansion.materialsPrepared=true;
    }
    for(const material of materials.keys())material.opacity=Math.max(0,1-smooth*1.12);
    if(t===1){building.visible=false;expansion.finished=true;}
  }
  tickFloorReveals(now);
  if(floorReturnMove){
    const t=Math.min(1,(now-floorReturnMove.start)/floorReturnMove.duration),smooth=t*t*(3-2*t);
    floorReturnMove.group.position.copy(floorReturnMove.from).multiplyScalar(1-smooth);
    if(t===1)floorReturnMove=null;
  }
  if (tourPlaying) {
    const delta = Math.min(150, now - tourClock);
    tourClock = now;
    applyUnitTourTime(unitTourTime + delta);
    if (unitTourTime >= unitTour.duration) stopTour();
  }
  if (cabMove) {
    const t = Math.min(1, (now - cabMove.start) / cabMove.duration);
    cabGroup.position.y = THREE.MathUtils.lerp(cabMove.from, cabMove.to, t * t * (3 - 2 * t));
    if (t === 1) cabMove = null;
  }
  if (!tourPlaying) for (let i = 0; i < 6; i++) {
    const next = THREE.MathUtils.lerp(doorAngles[i], doorTargets[i], Math.min(1, frameDelta * 4));
    if (Math.abs(next - doorAngles[i]) > 0.01) setDoorAngle(i + 1, next);
  }
  updateCubeAuto(now);
  updateControlHelp();
  if(grandCube) {
    const current=grandCube.group.scale.x;
    if(Math.abs(current-grandCube.targetScale)>0.0005)
      grandCube.group.scale.setScalar(THREE.MathUtils.damp(current,grandCube.targetScale,8,frameDelta));
    else if(current!==grandCube.targetScale)grandCube.group.scale.setScalar(grandCube.targetScale);
  }
  const seconds = exportElapsedSeconds ?? (now - playbackStart) / 1000;
  updateBreathing(seconds);
  if (walkMode) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0; right.normalize();
    const step = (movementKeys.has('shift') ? 2.6 : 1.45) * frameDelta;
    if (movementKeys.has('w')) camera.position.addScaledVector(forward, step);
    if (movementKeys.has('s')) camera.position.addScaledVector(forward, -step);
    if (movementKeys.has('d')) camera.position.addScaledVector(right, step);
    if (movementKeys.has('a')) camera.position.addScaledVector(right, -step);
    camera.position.y = 1.68 + (activeFloor - 1) * floorHeight;
    if (floors[activeFloor - 1]) {
      let nearest = Infinity, room = tabletRoom;
      floors[activeFloor - 1].bedRigs.forEach((bed, i) => {
        const distance = camera.position.distanceTo(bed.getWorldPosition(new THREE.Vector3()));
        if (distance < nearest) { nearest = distance; room = i + 1; }
      });
      const nextWalkRoom=nearest<7?room:0;
      if(nextWalkRoom!==walkRoom)muteTabletAudio();
      if(nextWalkRoom!==walkRoom){walkRoom=nextWalkRoom;updateOpenFeedButton();updateToolbarSelection();}
      if (!tabletManualRoom && nearest < 7 && tabletRoom !== room) {
        muteTabletAudio();
        tabletRoom = room;
        document.querySelectorAll('[data-room]').forEach(item => item.classList.toggle('active', Number(item.dataset.room) === tabletRoom));
      }
    }
  }
  if (cameraMove && !tourPlaying) {
    const t = Math.min(1, (performance.now() - cameraMove.start) / cameraMove.duration);
    const smooth = t * t * (3 - 2 * t);
    camera.position.lerpVectors(cameraMove.from, cameraMove.to, smooth);
    controls.target.lerpVectors(cameraMove.fromTarget, cameraMove.toTarget, smooth);
    if (t === 1) cameraMove = null;
  }
  if (!tourPlaying && !walkMode) controls.update();
  if (now - lastFeedPaint >= 33 && floors.length) {
    camera.updateMatrixWorld();
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projection);
    drawTelemetryFrame(now, seconds, frustum);
    drawVentilatorsFrame(seconds, frustum);
    drawTablet(seconds);
    syncTabletAudio(seconds);
    drawCubeFaces(seconds, now, frustum);
    lastFeedPaint = now;
  }
  if (now - lastLODUpdate > 180) { updateLODs(); lastLODUpdate = now; }
  renderer.render(scene, camera);
  if (document.visibilityState === 'visible') {
    performanceFrames++;
    if (now - performanceWindowStart >= 2500) {
      measuredFps = performanceFrames * 1000 / (now - performanceWindowStart);
      const previous = renderScale;
      if (measuredFps < 19) renderScale = Math.max(0.5, renderScale * 0.78);
      else if (measuredFps > 45) renderScale = Math.min(1, renderScale * 1.1);
      if (previous !== renderScale) renderer.setPixelRatio(basePixelRatio * renderScale);
      performanceFrames = 0;
      performanceWindowStart = now;
    }
  } else { performanceFrames = 0; performanceWindowStart = now; }
}
animate();
