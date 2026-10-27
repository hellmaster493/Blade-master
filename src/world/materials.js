// Shared cel-shading materials, inverted-hull outlines and procedural canvas textures.
import * as THREE from 'three';

let _gradient = null;
let _softGradient = null;

/** 3-band toon ramp used by every character material. */
export function toonGradient() {
  if (_gradient) return _gradient;
  const data = new Uint8Array([70, 70, 70, 255, 165, 165, 165, 255, 255, 255, 255, 255]);
  _gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  _gradient.minFilter = THREE.NearestFilter;
  _gradient.magFilter = THREE.NearestFilter;
  _gradient.generateMipmaps = false;
  _gradient.needsUpdate = true;
  return _gradient;
}

/** Gentler 2-band ramp for skin so faces stay readable. */
export function softGradient() {
  if (_softGradient) return _softGradient;
  const data = new Uint8Array([165, 165, 165, 255, 255, 255, 255, 255]);
  _softGradient = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
  _softGradient.minFilter = THREE.NearestFilter;
  _softGradient.magFilter = THREE.NearestFilter;
  _softGradient.generateMipmaps = false;
  _softGradient.needsUpdate = true;
  return _softGradient;
}

export function toon(color, opts = {}) {
  const { soft, ...rest } = opts;
  return new THREE.MeshToonMaterial({ color, gradientMap: soft ? softGradient() : toonGradient(), ...rest });
}

const _outlineMats = new Map();

/** Inverted hull outline material: pushes back faces along normals. */
export function outlineMaterial(thickness = 0.012, color = 0x07080c) {
  const key = thickness + ':' + color;
  if (_outlineMats.has(key)) return _outlineMats.get(key);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uThickness: { value: thickness }, uColor: { value: new THREE.Color(color) } },
    ]),
    vertexShader: /* glsl */ `
      uniform float uThickness;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position + normalize(normal) * uThickness;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  _outlineMats.set(key, mat);
  return mat;
}

/** Adds an outline hull sharing the mesh's geometry. */
export function addOutline(mesh, thickness = 0.012) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  o.name = mesh.name ? mesh.name + '_outline' : 'outline';
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.isOutline = true;
  mesh.add(o);
  return o;
}

// ---------- procedural canvas textures ----------

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const _texCache = new Map();
function cached(key, make) {
  if (!_texCache.has(key)) _texCache.set(key, make());
  return _texCache.get(key);
}

/** Anime eye with crimson iris, highlight and heavy upper lash line. */
export function eyeTexture() {
  return cached('eye', () => {
    const c = canvas(128, 96);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 96);
    // sclera shape
    g.fillStyle = '#f4f1ee';
    g.beginPath();
    g.moveTo(8, 52);
    g.quadraticCurveTo(50, 14, 118, 34);
    g.quadraticCurveTo(110, 80, 60, 84);
    g.quadraticCurveTo(24, 82, 8, 52);
    g.fill();
    // iris
    const grd = g.createRadialGradient(66, 56, 4, 66, 54, 30);
    grd.addColorStop(0, '#ff5a5a');
    grd.addColorStop(0.45, '#c3122a');
    grd.addColorStop(1, '#3a0610');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(66, 54, 22, 28, 0, 0, Math.PI * 2);
    g.fill();
    // pupil
    g.fillStyle = '#12040a';
    g.beginPath();
    g.ellipse(66, 56, 9, 14, 0, 0, Math.PI * 2);
    g.fill();
    // highlights
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(58, 44, 6, 7, -0.4, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.7;
    g.beginPath();
    g.ellipse(76, 66, 3, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    // upper lash line (thick, sharp)
    g.strokeStyle = '#0d0d12';
    g.lineCap = 'round';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(6, 54);
    g.quadraticCurveTo(48, 12, 122, 30);
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(110, 28);
    g.lineTo(126, 22);
    g.stroke();
    // lower lid hint
    g.lineWidth = 2.5;
    g.globalAlpha = 0.6;
    g.beginPath();
    g.moveTo(30, 80);
    g.quadraticCurveTo(70, 88, 104, 68);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Diamond wrapped handle (tsuka-ito) pattern. */
export function wrapTexture() {
  return cached('wrap', () => {
    const c = canvas(64, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#0b0b10';
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#2a2b36';
    for (let i = 0; i < 4; i++) {
      const y = i * 32;
      g.beginPath();
      g.moveTo(32, y + 3);
      g.lineTo(58, y + 16);
      g.lineTo(32, y + 29);
      g.lineTo(6, y + 16);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#000';
    g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo(0, i * 16);
      g.lineTo(64, i * 16 + 16);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 3);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Original Kairo emblem: a crimson ring cut by three wind slashes. */
export function emblemTexture() {
  return cached('emblem', () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.translate(128, 128);
    g.strokeStyle = '#ff2a44';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(0, 0, 92, 0.35, Math.PI * 2 - 0.35);
    g.stroke();
    g.fillStyle = '#ff2a44';
    for (let i = 0; i < 3; i++) {
      g.save();
      g.rotate(-0.6 + i * 0.12);
      g.translate(0, (i - 1) * 34);
      g.beginPath();
      g.moveTo(-86, 6);
      g.quadraticCurveTo(0, -22, 92, -4);
      g.quadraticCurveTo(0, -6, -86, 6);
      g.fill();
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Soft radial glow sprite. */
export function glowTexture() {
  return cached('glow', () => {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  });
}

/** Four-point anime impact star. */
export function starTexture() {
  return cached('star', () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    g.translate(128, 128);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.15, 'rgba(255,255,255,0.7)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(-128, -128, 256, 256);
    g.fillStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i < 4; i++) {
      g.save();
      g.rotate((i * Math.PI) / 2);
      g.beginPath();
      g.moveTo(0, -126);
      g.quadraticCurveTo(6, -10, 0, 0);
      g.quadraticCurveTo(-6, -10, 0, -126);
      g.fill();
      g.restore();
    }
    return new THREE.CanvasTexture(c);
  });
}
