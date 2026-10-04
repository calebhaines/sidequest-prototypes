import * as THREE from 'three';
import { createKit, WORLD_SCALE } from './three-d-kit.js';
import { buildVelvet3D } from './velvet-3d.js';
import { buildEmber3D } from './ember-3d.js';
import { buildInterior3D, createActor3D, updateActor3D } from './three-d-models.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const palettes = {
  lynch: { sky: 0x748d94, fog: 0x8c9fa0, ambient: 0xdde8de, sun: 0xffdfb0, accent: 0xe9c786 },
  shinobi: { sky: 0xa6d7dc, fog: 0xbcd8c7, ambient: 0xe1f1db, sun: 0xffe4b4, accent: 0xffbc60 },
};

function disposeGroup(group, disposed = { geometries: new Set(), materials: new Set(), textures: new Set() }) {
  if (!group) return;
  group.traverse(node => {
    if (node.geometry && !disposed.geometries.has(node.geometry)) {
      disposed.geometries.add(node.geometry);
      node.geometry.dispose();
    }
    for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
      if (disposed.materials.has(material)) continue;
      disposed.materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture && !disposed.textures.has(value)) {
          disposed.textures.add(value);
          value.dispose();
        }
      }
      material.dispose();
    }
    if (node.isInstancedMesh) node.dispose();
  });
  return disposed;
}

export function create3DRenderer(canvas, theme) {
  if (!palettes[theme]) throw new Error('The 3D prototypes are Velvet Static and Hidden Ember.');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    throw new Error('3D needs WebGL. Enable browser graphics acceleration or open the 2D version of this world.');
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.setClearAlpha(1);

  const palette = palettes[theme];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.fog, 37, 115);
  const camera = new THREE.PerspectiveCamera(47, 1.5, .15, 165);
  const ambient = new THREE.HemisphereLight(palette.ambient, theme === 'lynch' ? 0x596d59 : 0x758f69, 2.0);
  const sun = new THREE.DirectionalLight(palette.sun, 2.4);
  sun.position.set(-28, 42, 24);
  const rim = new THREE.DirectionalLight(theme === 'lynch' ? 0xadcfd7 : 0x9edbdd, .5);
  rim.position.set(22, 14, -18);
  scene.add(ambient, sun, rim);
  const kit = createKit({ chunkSize: 768 });
  if (theme === 'lynch') buildVelvet3D(kit);
  else buildEmber3D(kit);
  const exterior = kit.finish();
  const exteriorChunks = exterior.children.filter(node => node.userData.spatialChunk);
  scene.add(exterior);

  const actors = new THREE.Group();
  const markers = new THREE.Group();
  const transient = new THREE.Group();
  scene.add(actors, markers, transient);
  const actorNodes = new Map();
  const featureNodes = new Map();
  const effectNodes = new Map();
  const projectileNodes = new Map();
  const ownedResources = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const resourceGeometries = new Map();
  const resourceMaterials = new Map();

  function geometry(kind) {
    if (resourceGeometries.has(kind)) return resourceGeometries.get(kind);
    let value;
    if (kind === 'sphere') value = new THREE.IcosahedronGeometry(1, 1);
    else if (kind === 'box') value = new THREE.BoxGeometry(1, 1, 1);
    else if (kind === 'cone') value = new THREE.ConeGeometry(1, 1, 6);
    else if (kind === 'cylinder') value = new THREE.CylinderGeometry(1, 1, 1, 8);
    else if (kind === 'ring') { value = new THREE.RingGeometry(.8, 1, 24); value.rotateX(-Math.PI / 2); }
    else if (kind === 'disc') { value = new THREE.CircleGeometry(1, 20); value.rotateX(-Math.PI / 2); }
    else if (kind === 'torus') value = new THREE.TorusGeometry(1, .035, 4, 24);
    else value = new THREE.OctahedronGeometry(1, 0);
    resourceGeometries.set(kind, value);
    return value;
  }

  function material(color, opacity = 1, glowing = false) {
    const key = `${color}:${opacity}:${glowing}`;
    if (resourceMaterials.has(key)) return resourceMaterials.get(key);
    const value = glowing
      ? new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity > .8, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: opacity < 1, opacity, depthWrite: opacity > .8 });
    resourceMaterials.set(key, value);
    return value;
  }

  function primitive(kind, color, scale, position = [0, 0, 0], opacity = 1, glowing = false) {
    const mesh = new THREE.Mesh(geometry(kind), material(color, opacity, glowing));
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    return mesh;
  }

  function ring(color, radius = .58, opacity = .78) {
    const mesh = primitive('ring', color, [radius, 1, radius], [0, .028, 0], opacity, true);
    mesh.userData.floorMarker = true;
    return mesh;
  }

  const playerRing = ring(theme === 'shinobi' ? 0xffc76a : 0xecdca1, .44, .55);
  scene.add(playerRing);
  const destination = new THREE.Group();
  destination.add(ring(0xffd78b, .73, .65));
  const destinationGem = primitive('diamond', 0xffd594, [.13, .25, .13], [0, 1.15, 0], .95, true);
  destination.add(destinationGem);
  destination.add(primitive('cylinder', 0xffdba6, [.035, .6, .035], [0, .38, 0], .2, true));
  scene.add(destination);

  // Actual 3D rain streaks follow the camera; there is no overlay image or shader wallpaper.
  const rainPositions = new Float32Array(320 * 6);
  const rainSeeds = Array.from({ length: 320 }, (_, index) => ({
    x: ((index * 73.17) % 39) - 19.5, z: ((index * 41.39) % 39) - 19.5, y: (index * 7.91) % 18,
  }));
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xc6e1e4, transparent: true, opacity: .28, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  rain.visible = theme === 'lynch';
  scene.add(rain);

  let activeInterior = null;
  let sceneId = undefined;
  let phase = null;
  let yaw = 0;
  let zoom = 1;
  let width = 960;
  let height = 600;
  let destroyed = false;
  let contextLost = false;
  let lastTime = null;
  let pointer = null;
  const follow = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  let initializedCamera = false;
  let currentFrame = null;
  const listeners = [];
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const bounds = new THREE.Sphere();

  function listen(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    listeners.push(() => target.removeEventListener(type, fn, options));
  }

  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0 || destroyed || contextLost) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
  });
  listen(canvas, 'pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x;
    yaw -= dx * .006;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  const releasePointer = event => {
    if (pointer && event.pointerId === pointer.id) {
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      pointer = null;
    }
  };
  listen(canvas, 'pointerup', releasePointer);
  listen(canvas, 'pointercancel', releasePointer);
  listen(canvas, 'wheel', event => {
    event.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * .0007, .58, 1.65);
  }, { passive: false });
  listen(canvas, 'webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    canvas.dataset.graphicsError = '3D graphics paused. Close and reopen this prototype, or select its 2D version.';
    canvas.dispatchEvent(new CustomEvent('game-graphics-error', { detail: canvas.dataset.graphicsError, bubbles: true }));
  });
  listen(canvas, 'webglcontextrestored', () => {
    contextLost = false;
    delete canvas.dataset.graphicsError;
    initializedCamera = false;
  });
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  canvas.dataset.renderer = '3d';

  function featureNode(feature) {
    const node = new THREE.Group();
    const color = feature.type === 'exit' ? 0x8be2c7 : feature.type === 'door' ? 0xf0c781 : feature.type === 'prop' ? 0xaccfe0 : 0xffd488;
    if (feature.type === 'chest') {
      node.add(primitive('box', 0x815933, [.66, .34, .45], [0, .2, 0]));
      const lid = primitive('box', 0xba8749, [.7, .13, .49], [0, .43, 0]);
      node.add(lid);
      node.userData.lid = lid;
      for (const x of [-.23, .23]) node.add(primitive('box', 0xd1ae60, [.05, .44, .5], [x, .27, 0]));
      node.add(primitive('box', 0xeed28c, [.12, .13, .05], [0, .26, .26]));
    } else if (feature.type === 'travel' || feature.type === 'waypoint') {
      node.add(primitive('cylinder', theme === 'shinobi' ? 0x574a35 : 0x66615a, [.055, 1.9, .055], [0, .95, 0]));
      node.add(primitive('box', theme === 'shinobi' ? 0xcd7250 : 0x567b7b, [.63, .37, .045], [.28, 1.65, 0]));
      node.add(ring(0x99d3ba, .48, .38));
    } else if (feature.type === 'door' || feature.type === 'exit') {
      node.add(ring(color, .51, .64));
      const dot = primitive('diamond', color, [.095, .16, .095], [0, .65, 0], .85, true);
      node.add(dot);
      node.userData.dot = dot;
      // Three short steps of light make a door's precise usable ground position legible.
      for (let index = 0; index < 3; index++) {
        const step = primitive('box', color, [.36 - index * .045, .013, .035], [0, .024, .07 + index * .12], .52, true);
        step.userData.floorMarker = true;
        node.add(step);
      }
    } else {
      node.add(ring(color, feature.type === 'prop' ? .24 : .4, feature.type === 'prop' ? .32 : .42));
      const dot = primitive('diamond', color, [.07, .1, .07], [0, feature.type === 'prop' ? .5 : .86, 0], .72, true);
      node.add(dot);
      node.userData.dot = dot;
    }
    const highlight = ring(0xfff0c6, feature.type === 'prop' ? .4 : .68, .9);
    highlight.visible = false;
    node.add(highlight);
    node.userData.highlight = highlight;
    node.userData.featureType = feature.type;
    return node;
  }

  function syncActors(frame) {
    const present = new Set();
    const entities = [{ ...frame.player, id: '__player', type: 'player', phase: frame.phase },
      ...frame.entities.filter(entity => entity.type === 'npc'),
      ...(frame.enemies || []).filter(entity => !entity.defeated),
      ...(frame.clones || []).map((entity, index) => ({ ...entity, id: `__clone-${index}`, type: 'clone', kind: 'clone', name: 'Shadow clone' }))];
    for (const entity of entities) {
      const key = entity.id;
      present.add(key);
      let node = actorNodes.get(key);
      if (!node) {
        node = createActor3D(theme, entity);
        if (!node?.isObject3D) continue;
        const shadow = primitive('disc', 0x27382e, [.3, 1, .3], [0, .022, 0], .25, true);
        node.add(shadow);
        node.userData.contactShadow = shadow;
        const interactRing = ring(0xffe0a3, .5, .8);
        interactRing.visible = false;
        node.add(interactRing);
        node.userData.interactRing = interactRing;
        if (entity.type === 'enemy') {
          const health = new THREE.Group();
          health.add(primitive('box', 0x634c46, [.52, .055, .055]));
          const fill = primitive('box', 0xe79c77, [.48, .04, .065], [0, .005, .005], 1, true);
          health.add(fill);
          health.position.y = 1.95;
          node.add(health);
          node.userData.healthBar = health;
          node.userData.healthFill = fill;
        }
        actors.add(node);
        actorNodes.set(key, node);
      }
      const distance = Math.hypot(entity.x - frame.player.x, entity.y - frame.player.y);
      node.visible = distance < 1150;
      if (!node.visible) continue;
      let animationEntity = entity;
      if (entity.type === 'enemy' && node.userData.lastGroundPosition) {
        const dx = entity.x - node.userData.lastGroundPosition.x;
        const dy = entity.y - node.userData.lastGroundPosition.y;
        const moving = Math.hypot(dx, dy) > .03;
        const facing = moving ? Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'
          : entity.facing || node.userData.lastFacing || 'down';
        animationEntity = { ...entity, moving, facing };
        node.userData.lastFacing = facing;
      }
      node.userData.lastGroundPosition = { x: entity.x, y: entity.y };
      node.position.set(entity.x * WORLD_SCALE, 0, entity.y * WORLD_SCALE);
      updateActor3D(node, animationEntity, frame.time);
      node.userData.interactRing.visible = frame.nearestFeature?.id === key && entity.type === 'npc';
      node.userData.interactRing.position.y = frame.interior ? .035 : .28;
      node.userData.contactShadow.position.y = frame.interior ? .025 : .26;
      if (node.userData.healthFill) {
        const fraction = Math.max(.01, entity.health / entity.maxHealth);
        node.userData.healthFill.scale.x = .48 * fraction;
        node.userData.healthFill.position.x = -.24 + fraction * .24;
        node.userData.healthBar.rotation.y = yaw - node.rotation.y;
        node.userData.healthBar.visible = !entity.pacified;
      }
      if (entity.type === 'player' && frame.invulnerable > 0) node.visible = Math.floor(frame.time * 12) % 2 === 0;
    }
    for (const [key, node] of actorNodes) {
      if (present.has(key)) continue;
      // Reuse all authored residents across doors; pooled clone slots also stop
      // repeated jutsu casts from allocating an unbounded collection of models.
      node.visible = false;
    }
  }

  function syncFeatures(frame) {
    const present = new Set();
    for (const feature of frame.entities) {
      if (['npc', 'enemy'].includes(feature.type)) continue;
      const key = feature.id;
      present.add(key);
      let node = featureNodes.get(key);
      if (!node) {
        node = featureNode(feature);
        markers.add(node);
        featureNodes.set(key, node);
      }
      node.position.set(feature.x * WORLD_SCALE, 0, feature.y * WORLD_SCALE);
      const near = frame.nearestFeature?.id === feature.id;
      node.visible = Math.hypot(feature.x - frame.player.x, feature.y - frame.player.y) < 1200;
      node.userData.highlight.visible = near;
      node.userData.highlight.scale.setScalar(1 + Math.sin(frame.time * 4) * .05);
      for (const child of node.children) if (child.userData.floorMarker) child.position.y = frame.interior ? .035 : .28;
      if (node.userData.dot) {
        node.userData.dot.position.y = (feature.type === 'prop' ? .5 : feature.type === 'door' || feature.type === 'exit' ? .65 : .86) + Math.sin(frame.time * 2.2 + feature.x) * .06;
        node.userData.dot.rotation.y = frame.time * .65;
        node.userData.dot.visible = !feature.opened && !(feature.type === 'prop' && feature.inspected);
      }
      if (node.userData.lid) {
        node.userData.lid.rotation.x = feature.opened ? -.85 : 0;
        node.userData.lid.position.y = feature.opened ? .53 : .43;
      }
    }
    for (const [key, node] of featureNodes) {
      if (present.has(key)) continue;
      markers.remove(node);
      featureNodes.delete(key);
    }
  }

  function projectileNode(projectile) {
    const node = new THREE.Group();
    if (projectile.kind === 'ember') {
      node.add(primitive('sphere', 0xffc655, [.24, .24, .24], [0, 0, 0], 1, true));
      node.add(primitive('sphere', 0xf47a35, [.35, .35, .35], [0, 0, 0], .45, true));
      for (let index = 1; index < 4; index++) node.add(primitive('sphere', index % 2 ? 0xffb43f : 0xe65726, [.24 / index, .24 / index, .35 / index], [0, 0, -.2 * index], .65, true));
    } else {
      node.add(primitive('cone', 0xe1e1cf, [.08, .32, .08], [0, 0, .07]));
      node.children[0].rotation.x = Math.PI / 2;
      node.add(primitive('cylinder', 0x4a4e46, [.022, .23, .022], [0, 0, -.2]));
      node.children[1].rotation.x = Math.PI / 2;
    }
    return node;
  }

  function syncProjectiles(frame) {
    const present = new Set(frame.projectiles);
    for (const projectile of frame.projectiles) {
      let node = projectileNodes.get(projectile);
      if (!node) { node = projectileNode(projectile); projectileNodes.set(projectile, node); transient.add(node); }
      node.position.set(projectile.x * WORLD_SCALE, .88, projectile.y * WORLD_SCALE);
      node.rotation.y = Math.atan2(projectile.dx, projectile.dy);
      if (projectile.kind === 'ember') node.rotation.z = frame.time * 3;
    }
    for (const [key, node] of projectileNodes) {
      if (present.has(key)) continue;
      transient.remove(node);
      projectileNodes.delete(key);
    }
  }

  function effectNode(effect) {
    const node = new THREE.Group();
    const kind = effect.kind;
    const fire = ['emberblast', 'embercast'].includes(kind);
    const smoke = ['smoke', 'static', 'afterimage'].includes(kind);
    if (kind === 'substitution') {
      const log = primitive('cylinder', 0x9a6b3e, [.22, .8, .22], [0, .32, 0]);
      log.rotation.z = Math.PI / 2;
      node.add(log);
      node.add(primitive('cylinder', 0xd9b584, [.225, .02, .225], [.41, .32, 0]));
      node.children[1].rotation.z = Math.PI / 2;
    } else if (smoke || fire) {
      const colors = fire ? [0xffde83, 0xff9e3c, 0xe64c27] : [0xd0e5dd, 0xa9b9b4, 0xdde8e0];
      for (let index = 0; index < 7; index++) {
        const angle = index * 2.4;
        const puff = primitive('sphere', colors[index % colors.length], [.28, .35, .28], [Math.sin(angle) * .28, .3 + index * .12, Math.cos(angle) * .28], smoke ? .45 : .7, true);
        node.add(puff);
      }
    } else if (kind === 'dash') {
      const dx = ((effect.endX ?? effect.x) - effect.x) * WORLD_SCALE;
      const dz = ((effect.endY ?? effect.y) - effect.y) * WORLD_SCALE;
      const beam = primitive('cylinder', 0xb5efff, [.06, Math.hypot(dx, dz), .06], [dx / 2, .64, dz / 2], .55, true);
      beam.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dx, 0, dz).normalize());
      node.add(beam);
    } else {
      const color = fire ? 0xff9c48 : ['dreamshift', 'static'].includes(kind) ? 0xe3a5ca : kind === 'hurt' ? 0xed7f69 : kind === 'flash' ? 0xfff7d2 : 0xabe6df;
      node.add(ring(color, .65, .75));
      const hoop = primitive('torus', color, [.42, .42, .42], [0, .6, 0], .7, true);
      hoop.rotation.x = Math.PI / 2;
      node.add(hoop);
      if (kind === 'flash') node.add(primitive('sphere', 0xfff3cf, [.36, .36, .36], [0, 1.1, 0], .7, true));
      if (kind === 'level') {
        for (let index = 0; index < 6; index++) node.add(primitive('diamond', 0xffe087, [.07, .17, .07], [Math.sin(index) * .5, 1 + index * .15, Math.cos(index) * .5], .8, true));
      }
    }
    return node;
  }

  function syncEffects(frame) {
    const present = new Set(frame.effects);
    for (const effect of frame.effects) {
      let node = effectNodes.get(effect);
      if (!node) { node = effectNode(effect); effectNodes.set(effect, node); transient.add(node); }
      const progress = 1 - Math.max(0, effect.t / (effect.maxT || 1));
      node.position.set(effect.x * WORLD_SCALE, 0, effect.y * WORLD_SCALE);
      const expansion = effect.kind === 'substitution' ? 1 : .6 + progress * (effect.kind === 'emberblast' ? 3 : 1.8);
      node.scale.setScalar(expansion);
      node.visible = effect.t > .035;
      node.rotation.y = frame.time * .8;
      if (['smoke', 'static'].includes(effect.kind)) node.position.y = progress * .45;
    }
    for (const [key, node] of effectNodes) {
      if (present.has(key)) continue;
      transient.remove(node);
      effectNodes.delete(key);
    }
  }

  function setScene(frame) {
    if (sceneId === frame.sceneId) return;
    sceneId = frame.sceneId;
    initializedCamera = false;
    if (activeInterior) {
      scene.remove(activeInterior);
      disposeGroup(activeInterior);
      activeInterior = null;
    }
    exterior.visible = !frame.interior;
    if (frame.interior) {
      const roomKit = createKit();
      buildInterior3D(roomKit, theme, frame.interior);
      activeInterior = roomKit.finish();
      scene.add(activeInterior);
    }
    // Cutaway indoor rooms stay warm and legible, including the far corners.
    scene.fog.near = frame.interior ? 60 : 37;
    scene.fog.far = frame.interior ? 130 : 115;
    phase = null;
  }

  function setPhase(frame) {
    if (phase === `${frame.phase}:${!!frame.interior}`) return;
    phase = `${frame.phase}:${!!frame.interior}`;
    const dream = theme === 'lynch' && frame.phase === 'dream';
    const indoors = !!frame.interior;
    scene.background.set(dream ? 0x332634 : indoors ? theme === 'lynch' ? 0x495356 : 0x79755d : palette.sky);
    scene.fog.color.set(dream ? 0x634451 : indoors ? theme === 'lynch' ? 0x657176 : 0x999276 : palette.fog);
    ambient.color.set(dream ? 0xe0accc : palette.ambient);
    ambient.groundColor.set(dream ? 0x76617c : theme === 'lynch' ? 0x596d59 : 0x758f69);
    ambient.intensity = dream ? 1.65 : indoors ? 2.3 : 2.0;
    sun.color.set(dream ? 0xffaca8 : palette.sun);
    sun.intensity = dream ? 1.7 : indoors ? 1.8 : 2.4;
    rim.color.set(dream ? 0xa495de : theme === 'lynch' ? 0xadcfd7 : 0x9edbdd);
    rain.visible = theme === 'lynch' && !indoors;
    rainMaterial.color.set(dream ? 0xe3adc7 : 0xc6e1e4);
  }

  function updateCamera(frame) {
    const time = frame.time || 0;
    const dt = lastTime === null ? .016 : Math.min(.08, Math.max(.001, time - lastTime));
    lastTime = time;
    const px = frame.player.x * WORLD_SCALE;
    const pz = frame.player.y * WORLD_SCALE;
    const target = new THREE.Vector3(px, .9, pz);
    if (!initializedCamera) follow.copy(target);
    else follow.lerp(target, 1 - Math.exp(-dt * 12));
    const distance = (frame.interior ? 15 : 19) * zoom;
    const altitude = (frame.interior ? 18 : 21) * zoom;
    desiredCamera.set(follow.x + Math.sin(yaw) * distance, altitude, follow.z + Math.cos(yaw) * distance);
    if (!initializedCamera) camera.position.copy(desiredCamera);
    else camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 14));
    camera.lookAt(follow);
    initializedCamera = true;
    playerRing.position.set(px, frame.interior ? .035 : .28, pz);
    destination.visible = !!frame.destination;
    if (frame.destination) {
      destination.position.set(frame.destination.x * WORLD_SCALE, 0, frame.destination.y * WORLD_SCALE);
      destination.children[0].position.y = frame.interior ? .04 : .285;
      destinationGem.position.y = 1.15 + Math.sin(time * 2.8) * .1;
      destinationGem.rotation.y = time * .8;
    }
    if (rain.visible) {
      for (let index = 0; index < rainSeeds.length; index++) {
        const seed = rainSeeds[index];
        const fallingY = (seed.y - time * 10) % 18;
        const y = fallingY < 0 ? fallingY + 18 : fallingY;
        const offset = index * 6;
        rainPositions[offset] = px + seed.x;
        rainPositions[offset + 1] = y;
        rainPositions[offset + 2] = pz + seed.z;
        rainPositions[offset + 3] = px + seed.x - .1;
        rainPositions[offset + 4] = y + .4;
        rainPositions[offset + 5] = pz + seed.z + .045;
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
    if (!frame.interior) {
      camera.updateMatrixWorld();
      exterior.updateMatrixWorld();
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      for (const mesh of exteriorChunks) {
        // Instance bounds include roof overhangs, unusually wide stations, and
        // high crowns; the chunk's nominal footprint alone would pop those.
        bounds.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
        mesh.visible = Math.hypot(bounds.center.x - px, bounds.center.z - pz) < 54 + bounds.radius
          && frustum.intersectsSphere(bounds);
      }
    }
  }

  return {
    resize(nextWidth, nextHeight, pixelRatio = 1) {
      width = Math.max(240, nextWidth);
      height = Math.max(240, nextHeight);
      renderer.setPixelRatio(Math.min(1.5, pixelRatio));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    draw(frame) {
      if (destroyed || contextLost) return;
      currentFrame = frame;
      setScene(frame);
      setPhase(frame);
      syncActors(frame);
      syncFeatures(frame);
      syncProjectiles(frame);
      syncEffects(frame);
      updateCamera(frame);
      renderer.render(scene, camera);
    },
    movementVector(dx, dy) {
      return { x: dx * Math.cos(yaw) + dy * Math.sin(yaw), y: -dx * Math.sin(yaw) + dy * Math.cos(yaw) };
    },
    rotateCamera(delta) { yaw = (yaw + Number(delta || 0)) % TAU; },
    zoomCamera(delta) { zoom = THREE.MathUtils.clamp(zoom + Number(delta || 0) * .1, .58, 1.65); },
    resetCamera() { yaw = 0; zoom = 1; initializedCamera = false; },
    getDiagnostics() {
      return {
        mode: '3d', drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        sceneId: sceneId ?? null, actorCount: [...actorNodes.values()].filter(node => node.visible).length,
        staticBatches: activeInterior?.userData.batchCount ?? exterior.userData.batchCount,
        staticInstances: activeInterior?.userData.instances ?? exterior.userData.instances,
        cameraYaw: yaw, cameraZoom: zoom, width, height, contextLost,
        phase: currentFrame?.phase || 'waking',
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.forEach(remove => remove());
      pointer = null;
      disposeGroup(scene, ownedResources);
      for (const value of resourceGeometries.values()) if (!ownedResources.geometries.has(value)) value.dispose();
      for (const value of resourceMaterials.values()) if (!ownedResources.materials.has(value)) value.dispose();
      rainGeometry.dispose();
      rainMaterial.dispose();
      actorNodes.clear(); featureNodes.clear(); effectNodes.clear(); projectileNodes.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.style.cursor = '';
      delete canvas.dataset.renderer;
      delete canvas.dataset.graphicsError;
    },
  };
}
