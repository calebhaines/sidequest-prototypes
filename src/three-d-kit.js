import * as THREE from 'three';

// Keep simulation pixels as the common language shared with collision and rooms.
export const WORLD_SCALE = 1 / 24;

function pitchedRoofGeometry() {
  const vertices = [
    // Front/back gables; the ridge runs north to south.
    -.5, 0, -.5, .5, 0, -.5, 0, 1, -.5,
    -.5, 0, .5, 0, 1, .5, .5, 0, .5,
    // West roof slope.
    -.5, 0, -.5, 0, 1, -.5, 0, 1, .5,
    -.5, 0, -.5, 0, 1, .5, -.5, 0, .5,
    // East roof slope.
    .5, 0, -.5, .5, 0, .5, 0, 1, .5,
    .5, 0, -.5, 0, 1, .5, 0, 1, -.5,
    // Underside.
    -.5, 0, -.5, -.5, 0, .5, .5, 0, .5,
    -.5, 0, -.5, .5, 0, .5, .5, 0, -.5,
  ];
  for (let index = 0; index < vertices.length; index += 9) {
    for (let coordinate = 0; coordinate < 3; coordinate++) {
      const value = vertices[index + 3 + coordinate];
      vertices[index + 3 + coordinate] = vertices[index + 6 + coordinate];
      vertices[index + 6 + coordinate] = value;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createKit({ chunkSize = 0 } = {}) {
  const batches = new Map();
  const geometries = new Map();
  const labels = [];
  const dummy = new THREE.Object3D();
  const direction = new THREE.Vector3();
  const vertical = new THREE.Vector3(0, 1, 0);
  let finished = false;

  function geometryFor(kind, segments = 8) {
    const key = `${kind}:${segments}`;
    if (geometries.has(key)) return geometries.get(key);
    let geometry;
    if (kind === 'box' || kind === 'beam') geometry = new THREE.BoxGeometry(1, 1, 1);
    else if (kind === 'cylinder') geometry = new THREE.CylinderGeometry(1, 1, 1, segments, 1);
    else if (kind === 'cone') geometry = new THREE.ConeGeometry(1, 1, segments, 1);
    else if (kind === 'sphere') geometry = new THREE.IcosahedronGeometry(1, 0);
    else geometry = pitchedRoofGeometry();
    if (!['sphere', 'roof', 'beam'].includes(kind)) geometry.translate(0, .5, 0);
    geometries.set(key, geometry);
    return geometry;
  }

  function instance(kind, color, position, size, segments = 8, quaternion = null) {
    if (finished) throw new Error('Cannot add geometry after kit.finish().');
    if (![...position, ...size].every(Number.isFinite)) return;
    if (size.some(value => value <= 0)) return;
    const colorValue = typeof color === 'number' ? color : color || '#b8b1a0';
    // Large ground/water planes remain global; trees and architecture get
    // spatial batches so a huge world does not draw its entire forest at once.
    const chunk = chunkSize && size[0] < chunkSize * 1.25 && size[2] < chunkSize * 1.25
      ? { x: Math.floor(position[0] / chunkSize), y: Math.floor(position[2] / chunkSize) } : null;
    const key = `${kind}:${segments}:${colorValue}:${chunk ? `${chunk.x},${chunk.y}` : 'global'}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { geometry: geometryFor(kind, segments), color: colorValue, matrices: [], chunk };
      batches.set(key, batch);
    }
    dummy.position.set(...position.map(value => value * WORLD_SCALE));
    dummy.scale.set(...size.map(value => value * WORLD_SCALE));
    dummy.quaternion.identity();
    if (quaternion) dummy.quaternion.copy(quaternion);
    dummy.updateMatrix();
    batch.matrices.push(dummy.matrix.clone());
  }

  const kit = {
    box(x, y, width, depth, height, color, elevation = 0) {
      instance('box', color, [x + width / 2, elevation, y + depth / 2], [width, height, depth]);
    },
    cylinder(x, y, radius, height, color, elevation = 0, segments = 8) {
      instance('cylinder', color, [x, elevation, y], [radius, height, radius], segments);
    },
    cone(x, y, radius, height, color, elevation = 0, segments = 8) {
      instance('cone', color, [x, elevation, y], [radius, height, radius], segments);
    },
    sphere(x, y, radius, color, elevation = 0) {
      instance('sphere', color, [x, elevation, y], [radius, radius, radius]);
    },
    roof(x, y, width, depth, height, color, elevation = 0) {
      instance('roof', color, [x + width / 2, elevation, y + depth / 2], [width, height, depth]);
    },
    beam(x1, y1, elevation1, x2, y2, elevation2, thickness, color) {
      const start = new THREE.Vector3(x1, elevation1, y1);
      const end = new THREE.Vector3(x2, elevation2, y2);
      direction.subVectors(end, start);
      const length = direction.length();
      if (length < .01) return;
      const center = start.add(end).multiplyScalar(.5);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(vertical, direction.normalize());
      instance('beam', color, [center.x, center.y, center.z], [thickness, length, thickness], 8, quaternion);
    },
    label(text, x, y, elevation, color = '#fff', background = null, maxWidth = 180) {
      if (typeof document === 'undefined' || !text) return;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;
      const fontSize = 24;
      context.font = `600 ${fontSize}px monospace`;
      const lines = String(text).split('\n').slice(0, 3);
      const widest = Math.max(...lines.map(line => context.measureText(line).width));
      canvas.width = Math.max(64, Math.min(768, Math.ceil(widest + 28)));
      canvas.height = lines.length * 32 + 16;
      context.font = `600 ${fontSize}px monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.fillStyle = color;
      lines.forEach((line, index) => context.fillText(line, canvas.width / 2, 24 + index * 32, canvas.width - 14));
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      const labelWidth = Math.min(maxWidth, canvas.width * .3);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(labelWidth * WORLD_SCALE, labelWidth * canvas.height / canvas.width * WORLD_SCALE), material);
      mesh.position.set(x * WORLD_SCALE, elevation * WORLD_SCALE, y * WORLD_SCALE);
      mesh.userData.isWorldLabel = true;
      labels.push(mesh);
    },
    finish() {
      finished = true;
      const group = new THREE.Group();
      group.name = 'Batched world geometry';
      let instanceCount = 0;
      const materials = new Map();
      for (const batch of batches.values()) {
        let material = materials.get(batch.color);
        if (!material) {
          material = new THREE.MeshLambertMaterial({ color: batch.color, flatShading: true });
          materials.set(batch.color, material);
        }
        const mesh = new THREE.InstancedMesh(batch.geometry, material, batch.matrices.length);
        batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        if (batch.chunk) mesh.userData.spatialChunk = {
          x: (batch.chunk.x + .5) * chunkSize * WORLD_SCALE,
          z: (batch.chunk.y + .5) * chunkSize * WORLD_SCALE,
          radius: chunkSize * .72 * WORLD_SCALE,
        };
        group.add(mesh);
        instanceCount += batch.matrices.length;
      }
      if (labels.length) group.add(...labels);
      group.userData.instances = instanceCount;
      group.userData.batchCount = batches.size;
      return group;
    },
  };
  return kit;
}
