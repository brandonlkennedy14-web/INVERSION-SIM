// Add to your viewer.ts inside the drawTrajectory function

function drawLearningDelta(actualPath: THREE.Vector3[], startPos: THREE.Vector3, direction: THREE.Vector3) {
    // 1. Draw Intended Path (Straight Line - The "Naive" Bot)
    const intendedPoints = [
        startPos,
        startPos.clone().add(direction.multiplyScalar(actualPath.length))
    ];
    const intendedGeo = new THREE.BufferGeometry().setFromPoints(intendedPoints);
    const intendedMat = new THREE.LineDashedMaterial({ 
        color: 0xff0000, 
        dashSize: 0.2, 
        gapSize: 0.1 
    });
    const intendedLine = new THREE.Line(intendedGeo, intendedMat);
    intendedLine.computeLineDistances(); // Required for dashed lines
    scene.add(intendedLine);

    // 2. Draw Deviation Arrows (The "Learning" moments)
    actualPath.forEach((point, i) => {
        if (i % 50 === 0) { // Don't clutter the screen
            const intendedAtStep = startPos.clone().add(direction.clone().multiplyScalar(i));
            
            // Arrow pointing from where it SHOULD be to where it IS
            const dir = new THREE.Vector3().subVectors(point, intendedAtStep).normalize();
            const distance = point.distanceTo(intendedAtStep);
            
            const arrow = new THREE.ArrowHelper(dir, intendedAtStep, distance, 0xffff00);
            scene.add(arrow);
        }
    });
}
function updateBotUnit(botPositions: THREE.Vector3[]) {
    // 1. Update individual bot spheres
    bots.forEach((mesh, i) => {
        mesh.position.copy(botPositions[i]);
    });

    // 2. Draw a Bounding Box around the "Fleet"
    const box = new THREE.Box3().setFromPoints(botPositions);
    const helper = new THREE.Box3Helper(box, 0x00ff00);
    scene.add(helper);

    // 3. Center the camera on the fleet's average position (The Centroid)
    const centroid = new THREE.Vector3();
    box.getCenter(centroid);
    camera.lookAt(centroid);
}