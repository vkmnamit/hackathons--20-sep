import * as THREE from "three";

export function createGlassParticleField(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 8;

  const count = 36;
  const geometry = new THREE.SphereGeometry(0.18, 16, 16);
  const material = new THREE.MeshPhysicalMaterial({
    roughness: 0.1,
    transmission: 0.9,
    thickness: 0.5,
    ior: 1.5,
    color: new THREE.Color("#60a5fa"),
    transparent: true,
    opacity: 0.7,
  });

  const instanced = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const positions: [number, number, number][] = [];
  const speeds: [number, number, number][] = [];

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 8;
    const y = (Math.random() - 0.5) * 2;
    const z = (Math.random() - 0.5) * 3;
    positions.push([x, y, z]);
    speeds.push([
      (Math.random() - 0.5) * 0.005,
      (Math.random() - 0.5) * 0.005,
      (Math.random() - 0.5) * 0.002,
    ]);
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(0.6 + Math.random() * 0.8);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }

  scene.add(instanced);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
  dirLight.position.set(5, 5, 5);
  scene.add(dirLight);

  let frameId = 0;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const animate = () => {
    for (let i = 0; i < count; i++) {
      positions[i][0] += speeds[i][0];
      positions[i][1] += speeds[i][1];
      positions[i][2] += speeds[i][2];

      if (positions[i][0] > 4.5) positions[i][0] = -4.5;
      if (positions[i][0] < -4.5) positions[i][0] = 4.5;
      if (positions[i][1] > 1.5) positions[i][1] = -1.5;
      if (positions[i][1] < -1.5) positions[i][1] = 1.5;

      dummy.position.set(positions[i][0], positions[i][1], positions[i][2]);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  };

  resize();
  window.addEventListener("resize", resize);
  frameId = requestAnimationFrame(animate);

  return () => {
    cancelAnimationFrame(frameId);
    window.removeEventListener("resize", resize);
    material.dispose();
    geometry.dispose();
    renderer.dispose();
  };
}
