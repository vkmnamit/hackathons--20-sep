import * as THREE from "three";

export function createRetroPixelField(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;

    // 8x8 Bayer matrix for ordered dithering
    const float bayer8x8[64] = float[64](
       0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
      48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
      12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
      60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
       3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
      51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
      15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
      63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0
    );

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    void main() {
      vec2 pixelCoord = gl_FragCoord.xy;
      int bx = int(mod(pixelCoord.x, 8.0));
      int by = int(mod(pixelCoord.y, 8.0));
      float dither = bayer8x8[by * 8 + bx];

      vec2 uv = vUv * 6.0;
      float n = noise(uv + vec2(uTime * 0.1, uTime * 0.05));
      n += 0.5 * noise(uv * 2.0 - vec2(uTime * 0.15, -uTime * 0.08));

      float val = smoothstep(0.3, 0.9, n);
      float stepped = step(dither, val);

      vec3 colA = vec3(0.08, 0.12, 0.22);
      vec3 colB = vec3(0.24, 0.54, 0.96);
      vec3 finalCol = mix(colA, colB, stepped * 0.4);

      gl_FragColor = vec4(finalCol, 0.6 * stepped);
    }
  `;

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(canvas.clientWidth, canvas.clientHeight) },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let frameId = 0;
  const clock = new THREE.Clock();

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    uniforms.uResolution.value.set(width, height);
  };

  const animate = () => {
    uniforms.uTime.value = clock.getElapsedTime();
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
