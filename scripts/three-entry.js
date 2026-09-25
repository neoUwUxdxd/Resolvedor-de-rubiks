// Punto de entrada para empaquetar solo la parte de Three.js que usa la web.
// Se genera con `npm run build:vendor` y el resultado (vendor/three.min.js) se versiona
// para que la web funcione sin paso de compilación.
export {
  AmbientLight, CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, Group, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NeutralToneMapping,
  Object3D, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, Raycaster, Scene,
  Shape, Spherical, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
export { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
