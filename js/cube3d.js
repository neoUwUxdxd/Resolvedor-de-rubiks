// Visor 3D del cubo con Three.js.
//
// El visor solo dibuja: recibe el estado (colores de las 54 pegatinas) y anima
// los giros. Tras cada animación las piezas vuelven a su sitio y se repintan con
// el estado nuevo, así el modelo lógico y el dibujo nunca se desincronizan.

import {
  AmbientLight, CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, Group, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NeutralToneMapping,
  Object3D, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, Raycaster, Scene,
  Shape, Spherical, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
  OrbitControls, RoomEnvironment, RoundedBoxGeometry,
} from '../vendor/three.min.js';
import { COLORS, STICKERS, UNKNOWN } from './cube-model.js';

const UNKNOWN_HEX = '#3a4052';
const HOME_CAMERA = new Vector3(4.4, 3.6, 6.2).normalize();
const CUBE_RADIUS = 2.6; // radio de la esfera que envuelve el cubo (con margen)
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

function roundedSquare(size, radius) {
  const h = size / 2;
  const s = new Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return s;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Cube3D {
  constructor(container, { onStickerClick } = {}) {
    this.container = container;
    this.onStickerClick = onStickerClick;
    this.paintMode = true;
    this.queue = [];
    this.current = null;
    this.hovered = null;
    this.state = null;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.45;
    scene.add(new AmbientLight(0xffffff, 0.2));
    const key = new DirectionalLight(0xffffff, 1.15);
    key.position.set(5, 8, 6);
    scene.add(key);
    const rim = new DirectionalLight(0x8fa8ff, 0.6);
    rim.position.set(-6, 2, -5);
    scene.add(rim);
    this.scene = scene;

    const camera = new PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.copy(HOME_CAMERA).multiplyScalar(10);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.9;
    controls.autoRotateSpeed = 1.6;
    controls.target.set(0, -0.2, 0); // sube un poco el cubo en el encuadre
    this.controls = controls;

    const shadow = new Mesh(
      new PlaneGeometry(5.5, 5.5),
      new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -2.35;
    scene.add(shadow);
    this.shadow = shadow;

    this.root = new Group();
    scene.add(this.root);
    this.pivot = new Object3D();
    this.root.add(this.pivot);
    this._buildCube();

    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
    this._bindPointer();

    this.resizeObserver = new ResizeObserver(() => this._resize());
    this.resizeObserver.observe(container);
    this._resize();

    // No se dibuja mientras el visor está fuera de la pantalla.
    this.visible = true;
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
    }).observe(container);

    this.clock0 = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildCube() {
    const bodyGeo = new RoundedBoxGeometry(0.98, 0.98, 0.98, 4, 0.12);
    const bodyMat = new MeshStandardMaterial({ color: 0x101218, roughness: 0.5, metalness: 0.15 });
    const stickerGeo = new ExtrudeGeometry(roundedSquare(0.84, 0.13), {
      depth: 0.012, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 6,
    });
    this.cubies = [];
    this.stickerMeshes = [];

    const z = new Vector3(0, 0, 1);
    const byPos = new Map();
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let zz = -1; zz <= 1; zz++) {
          if (x === 0 && y === 0 && zz === 0) continue;
          const cubie = new Group();
          cubie.userData.home = new Vector3(x, y, zz);
          cubie.position.set(x, y, zz);
          cubie.add(new Mesh(bodyGeo, bodyMat));
          this.root.add(cubie);
          this.cubies.push(cubie);
          byPos.set(`${x},${y},${zz}`, cubie);
        }
      }
    }

    for (const s of STICKERS) {
      const mat = new MeshPhysicalMaterial({
        color: UNKNOWN_HEX, roughness: 0.28, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18,
        emissive: new Color(0xffffff), emissiveIntensity: 0,
      });
      const mesh = new Mesh(stickerGeo, mat);
      const n = new Vector3(...s.normal);
      mesh.quaternion.copy(new Quaternion().setFromUnitVectors(z, n));
      mesh.position.copy(n.multiplyScalar(0.487));
      mesh.userData.index = s.index;
      byPos.get(s.pos.join(',')).add(mesh);
      this.stickerMeshes[s.index] = mesh;
    }
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    const toPointer = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const pick = () => {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.stickerMeshes, false)[0];
      return hit ? hit.object : null;
    };
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      this.controls.autoRotate = false;
    });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6 || !this.paintMode || this.isAnimating()) return;
      toPointer(e);
      const mesh = pick();
      if (mesh && this.onStickerClick) this.onStickerClick(mesh.userData.index);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.paintMode || e.pointerType === 'touch' || down) return this._setHover(null);
      toPointer(e);
      this._setHover(this.isAnimating() ? null : pick());
    });
    el.addEventListener('pointerleave', () => this._setHover(null));
    this.controls.addEventListener('start', () => {
      this.userInteracting = true;
    });
    this.controls.addEventListener('end', () => {
      this.userInteracting = false;
      if (this.autoRotateWanted) setTimeout(() => {
        if (!this.userInteracting && this.autoRotateWanted) this.controls.autoRotate = true;
      }, 1500);
    });
  }

  _setHover(mesh) {
    if (this.hovered === mesh) return;
    if (this.hovered) this.hovered.material.emissiveIntensity = 0;
    this.hovered = mesh;
    if (mesh) mesh.material.emissiveIntensity = 0.18;
    this.renderer.domElement.style.cursor = mesh ? 'pointer' : '';
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Distancia a la que el cubo cabe entero, tanto a lo alto como a lo ancho.
    this.fitDistance = this._fitDistance();
    this.controls.minDistance = this.fitDistance * 0.7;
    this.controls.maxDistance = this.fitDistance * 1.8;
    this.camera.position.setLength(this.fitDistance);
  }

  _fitDistance() {
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    return CUBE_RADIUS / Math.sin(Math.min(vFov, hFov) / 2);
  }

  _paint(state) {
    for (let i = 0; i < 54; i++) {
      const c = state[i];
      this.stickerMeshes[i].material.color.set(c === UNKNOWN ? UNKNOWN_HEX : COLORS[c].hex);
    }
  }

  /** Pinta un estado al instante, cancelando las animaciones pendientes. */
  setState(state) {
    this._cancelAnimations();
    this.state = state.slice();
    this._paint(this.state);
  }

  /** Anima un giro; al terminar, el cubo muestra `nextState`. */
  animateMove(move, nextState, duration = 350) {
    return new Promise((resolve) => {
      this.queue.push({ move, nextState: nextState.slice(), duration, resolve });
    });
  }

  isAnimating() {
    return this.current !== null || this.queue.length > 0;
  }

  _startNext(now) {
    const job = this.queue.shift();
    if (!job) return;
    const { move } = job;
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld();
    for (const cubie of this.cubies) {
      if (move.layers.includes(cubie.userData.home.getComponent(move.axis))) this.pivot.attach(cubie);
    }
    const angle = move.dir * (move.turns === 3 ? -1 : move.turns) * (Math.PI / 2);
    this.current = { ...job, start: now, angle, axis: AXES[move.axis] };
  }

  _finishCurrent() {
    const job = this.current;
    for (const cubie of [...this.pivot.children]) {
      this.root.attach(cubie);
      cubie.position.copy(cubie.userData.home);
      cubie.quaternion.identity();
    }
    this.pivot.rotation.set(0, 0, 0);
    this.state = job.nextState;
    this._paint(this.state);
    this.current = null;
    job.resolve();
  }

  _cancelAnimations() {
    if (this.current) {
      const job = this.current;
      job.nextState = this.state ?? job.nextState;
      this._finishCurrent();
    }
    const pending = this.queue.splice(0);
    pending.forEach((job) => job.resolve());
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    if (!this.current && this.queue.length) this._startNext(now);
    if (this.current) {
      const job = this.current;
      const t = Math.min(1, (now - job.start) / job.duration);
      this.pivot.quaternion.setFromAxisAngle(job.axis, job.angle * easeInOut(t));
      if (t >= 1) this._finishCurrent();
    }
    if (!this.visible && !this.current) return;
    // Flotación suave del cubo.
    const bob = Math.sin((now - this.clock0) / 1100) * 0.06;
    this.root.position.y = bob;
    this.shadow.material.opacity = 0.9 - bob * 1.5;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setPaintMode(on) {
    this.paintMode = on;
    if (!on) this._setHover(null);
  }

  setAutoRotate(on) {
    this.autoRotateWanted = on;
    this.controls.autoRotate = on;
  }

  resetView() {
    this._flyTo(HOME_CAMERA.clone().multiplyScalar(this.fitDistance));
  }

  /** Alterna entre la vista frontal y la trasera (caras B, L y D). */
  flipView() {
    const back = this.camera.position.dot(HOME_CAMERA) < 0;
    this._flyTo(HOME_CAMERA.clone().multiplyScalar(back ? this.fitDistance : -this.fitDistance));
  }

  _flyTo(target) {
    const from = new Spherical().setFromVector3(this.camera.position);
    const to = new Spherical().setFromVector3(target);
    let dTheta = to.theta - from.theta;
    if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    const t0 = performance.now();
    const s = new Spherical();
    const step = (now) => {
      const t = easeInOut(Math.min(1, (now - t0) / 700));
      s.set(from.radius + (to.radius - from.radius) * t, from.phi + (to.phi - from.phi) * t, from.theta + dTheta * t);
      this.camera.position.setFromSpherical(s);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
