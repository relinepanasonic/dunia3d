import * as THREE from "three";

// ------------------------------------------------------------------ helpers
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };

/** Island height at radius r (sand beach at the rim, green land inside). */
export const ISLAND_R = 80;
export const landY = (r: number) => clamp((ISLAND_R - 6 - r) / 14) * 1.7 - 0.25;

// ------------------------------------------------------------------ materials (shared; night-reactive ones are updated by applyTime)
function windowTexture(seed: number, lit = 0.4) {
  const c = document.createElement("canvas"); c.width = 64; c.height = 128; const x = c.getContext("2d")!; const R = rng(seed);
  x.fillStyle = "#000"; x.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) if (R() < lit) { x.fillStyle = R() < 0.8 ? "#ffd89a" : "#bfeaff"; x.fillRect(j * 8 + 1, i * 8 + 2, 6, 4); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function createMats() {
  const std = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.6, ...o });
  const wt = windowTexture(5);
  return {
    white: std(0xf4f7fa, { roughness: 0.35, metalness: 0.2 }),
    solar: std(0x1f4a9c, { roughness: 0.3, metalness: 0.6 }),
    wood: std(0xa97c50, { roughness: 0.8 }),
    leaf: std(0x3aa84e, { roughness: 0.9 }),
    leaf2: std(0x2c8a43, { roughness: 0.9 }),
    trunk: std(0x7a5a38),
    pool: new THREE.MeshStandardMaterial({ color: 0x35c6ff, emissive: 0x1090c0, emissiveIntensity: 0.4 }),
    navy: std(0x24324f, { metalness: 0.4, roughness: 0.5 }),
    road: std(0x3a4252, { roughness: 0.9, flatShading: false }),
    rail: std(0xe8eef5, { roughness: 0.4 }),
    neon: new THREE.MeshBasicMaterial({ color: 0x37e9ff }),
    pink: new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffe2a0 }),
    // pod windows: bluish glass by day, warm light at night
    glassPod: new THREE.MeshStandardMaterial({ color: 0x7fd8ff, emissive: 0xffc46b, emissiveIntensity: 0, transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.4 }),
    // tower windows: lit squares at night
    glassTower: new THREE.MeshStandardMaterial({ color: 0xd6eefa, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: 0.05, roughness: 0.15, metalness: 0.5, flatShading: true }),
    wt,
  };
}
export type Mats = ReturnType<typeof createMats>;

// ------------------------------------------------------------------ plants
export function palm(m: Mats, x: number, z: number, y: number, s = 1) {
  const p = new THREE.Group();
  p.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 5), m.trunk, 0, 0.7, 0));
  for (let i = 0; i < 5; i++) { const l = mesh(new THREE.ConeGeometry(0.22, 1.1, 4), m.leaf, Math.cos(i * 1.26) * 0.45, 1.5, Math.sin(i * 1.26) * 0.45); l.rotation.set(Math.sin(i * 1.26) * 1.2, 0, -Math.cos(i * 1.26) * 1.2); p.add(l); }
  p.position.set(x, y, z); p.scale.setScalar(s); return p;
}
/** One instanced forest: trunks + canopies. positions: [x,y,z,scale]. */
export function forest(m: Mats, pts: number[][]) {
  const g = new THREE.Group();
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5), m.trunk, pts.length);
  const can1 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), m.leaf, pts.length);
  const can2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 0), m.leaf2, pts.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  pts.forEach(([x, y, z, s], i) => {
    S.setScalar(s); P.set(x, y + 0.6 * s, z); M.compose(P, Q, S); trunk.setMatrixAt(i, M);
    S.set(s * 1.3, s * 1.2, s * 1.3); P.set(x, y + 2.0 * s, z); M.compose(P, Q, S); can1.setMatrixAt(i, M);
    S.setScalar(s * 1.1); P.set(x + 0.4 * s, y + 2.8 * s, z - 0.2 * s); M.compose(P, Q, S); can2.setMatrixAt(i, M);
  });
  [trunk, can1, can2].forEach((o) => { o.castShadow = true; g.add(o); });
  return g;
}

// ------------------------------------------------------------------ terrain (island with beach)
export function makeIsland() {
  const geo = new THREE.RingGeometry(0.01, ISLAND_R, 72, 16); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), R = rng(3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    pos.setY(i, landY(r) + (r < ISLAND_R - 10 ? (R() - 0.5) * 0.25 : 0));
    const k = smooth(ISLAND_R - 18, ISLAND_R - 6, r);
    c.setHex(0x5fae4c).lerp(new THREE.Color(0x7fc25a), R() * 0.5).lerp(new THREE.Color(0xe8d9a4), k);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ng = geo.toNonIndexed(); ng.computeVertexNormals();
  const m = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })); m.receiveShadow = true; return m;
}

// ------------------------------------------------------------------ roads
/** Flat ribbon along a curve (road surface, rails). */
export function ribbon(curve: THREE.Curve<THREE.Vector3>, width: number, seg: number, mat: THREE.Material, offset = 0, dy = 0) {
  const pos: number[] = [], idx: number[] = [], t = new THREE.Vector3(), n = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg; curve.getPointAt(u % 1, p); curve.getTangentAt(u % 1, t); n.set(-t.z, 0, t.x).normalize();
    const cx = p.x + n.x * offset, cz = p.z + n.z * offset, y = p.y + dy;
    pos.push(cx + n.x * width / 2, y, cz + n.z * width / 2, cx - n.x * width / 2, y, cz - n.z * width / 2);
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true; (m.material as THREE.Material).side = THREE.DoubleSide; return m;
}
export const ringCurve = (r: number, y: number, wob = 0, seed = 1) => {
  const R = rng(seed), pts: THREE.Vector3[] = [];
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, rr = r + (R() - 0.5) * wob; pts.push(new THREE.Vector3(Math.cos(a) * rr, y + Math.sin(a * 3 + seed) * 0.4, Math.sin(a) * rr)); }
  return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.5);
};
/** Elevated road with rails, pillars and street lamps. Returns the group and lamp positions. */
export function makeRoad(m: Mats, curve: THREE.CatmullRomCurve3, width: number, elevated: boolean) {
  const g = new THREE.Group(), lamps: THREE.Vector3[] = [];
  g.add(ribbon(curve, width, 160, m.road));
  g.add(ribbon(curve, 0.25, 160, m.neon, width / 2 - 0.2, 0.05)); g.add(ribbon(curve, 0.25, 160, m.neon, -width / 2 + 0.2, 0.05));
  g.add(ribbon(curve, 0.3, 160, m.rail, width / 2 + 0.1, 0.5)); g.add(ribbon(curve, 0.3, 160, m.rail, -width / 2 - 0.1, 0.5));
  const p = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < 36; i++) {
    const u = i / 36; curve.getPointAt(u, p); curve.getTangentAt(u, t);
    if (elevated) { const h = Math.max(0.5, p.y - landY(Math.hypot(p.x, p.z))); g.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, h, 6), m.white, p.x, p.y - h / 2 - 0.15, p.z)); }
    if (i % 2 === 0) { const nx = -t.z, nz = t.x, l = Math.hypot(nx, nz) || 1; lamps.push(new THREE.Vector3(p.x + (nx / l) * (width / 2 + 0.5), p.y + 0.2, p.z + (nz / l) * (width / 2 + 0.5))); }
  }
  return { group: g, lamps };
}

// ------------------------------------------------------------------ towers (white, curved, terraces of greenery)
export function makeTower(m: Mats, kind: number, h: number) {
  const g = new THREE.Group(), r = 3.2 + (kind % 3) * 0.7;
  g.add(mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 16), m.white, 0, h / 2, 0));
  const tex = m.wt.clone(); tex.needsUpdate = true; tex.repeat.set(2, Math.max(2, Math.round(h / 5)));
  const strip = (start: number) => {
    const mat = m.glassTower.clone(); mat.emissiveMap = tex; mat.side = THREE.DoubleSide; mat.userData.tower = true;
    const o = mesh(new THREE.CylinderGeometry(r * 0.8 + 0.06, r * 1.0 + 0.06, h * 0.88, 16, 1, true, start, 1.9), mat, 0, h * 0.47, 0); o.castShadow = false; return o;
  };
  g.add(strip(0.6), strip(Math.PI + 0.6));
  for (let y = 5; y < h - 2; y += 7) {                    // terraces with plants
    const rr = r * (1.0 - 0.2 * (y / h)) + 0.6;
    g.add(mesh(new THREE.CylinderGeometry(rr + 0.7, rr + 0.7, 0.4, 16), m.white, 0, y, 0));
    const hedge = new THREE.Mesh(new THREE.TorusGeometry(rr + 0.5, 0.32, 5, 16), m.leaf); hedge.rotation.x = Math.PI / 2; hedge.position.y = y + 0.4; g.add(hedge);
  }
  g.add(mesh(new THREE.SphereGeometry(r * 0.8, 14, 8, 0, 6.283, 0, 1.57), m.white, 0, h, 0));
  if (kind % 2) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.14, 5, 20), m.neon); ring.rotation.x = Math.PI / 2; ring.position.y = h + r * 0.5; g.add(ring); }
  if (kind % 3 === 1) g.scale.set(1.3, 1, 0.8);
  return g;
}

// ------------------------------------------------------------------ citizens' pods
export function makePod(m: Mats, level: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.35, 12), m.white, 0, -0.35, 0));
  if (level === 1) {
    g.add(mesh(new THREE.SphereGeometry(1.25, 14, 10), m.white, 0, 0.7, 0));
    g.add(mesh(new THREE.CylinderGeometry(1.27, 1.27, 0.5, 14), m.glassPod, 0, 0.65, 0));
    g.add(mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, 6.283, 0, 1.2), m.glassPod, 0, 1.75, 0));
  } else if (level === 2) {
    g.add(mesh(new THREE.SphereGeometry(1.6, 14, 10), m.white, 0, 0.9, 0));
    g.add(mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.6, 14), m.glassPod, 0, 0.85, 0));
    const sp = mesh(new THREE.BoxGeometry(1.8, 0.08, 1.2), m.solar, 0, 2.35, 0); sp.rotation.z = 0.25; g.add(sp);
  } else {
    const r = level === 3 ? 2.3 : level === 4 ? 3.0 : 3.6;
    g.add(mesh(new THREE.CylinderGeometry(r, r * 1.08, 1.0, 8), m.white, 0, 0.35, 0));
    g.add(mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.45, 8), m.glassPod, 0, 0.45, 0));
    g.add(mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.25, 8), m.wood, 0, 0.95, 0));
    g.add(mesh(new THREE.BoxGeometry(r * 0.9, 0.08, r * 0.7), m.solar, -r * 0.15, 1.18, 0));
    g.add(palm(m, r * 0.45, r * 0.25, 1.05, 0.9)); g.add(palm(m, -r * 0.5, -r * 0.3, 1.05, 0.8));
    if (level >= 4) { g.add(mesh(new THREE.BoxGeometry(r * 0.5, 0.06, r * 0.35), m.pool, r * 0.25, 1.12, -r * 0.45)); g.add(palm(m, r * 0.6, -r * 0.1, 1.05, 1)); g.add(palm(m, -r * 0.2, r * 0.6, 1.05, 0.85)); }
    if (level >= 5) {
      g.add(mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.6, 0.9, 8), m.white, 0, 1.55, 0));
      g.add(mesh(new THREE.CylinderGeometry(r * 0.57, r * 0.57, 0.35, 8), m.glassPod, 0, 1.6, 0));
      g.add(mesh(new THREE.BoxGeometry(r * 0.8, 0.08, r * 0.6), m.solar, 0, 2.05, 0));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.1, 0.05, 5, 32), m.neon); ring.rotation.x = Math.PI / 2; ring.position.y = -0.1; g.add(ring);
    }
  }
  return g;
}

// ------------------------------------------------------------------ public buildings (8 styles; white organic forms with greenery)
export function makeBuilding(m: Mats, style: number) {
  const g = new THREE.Group();
  const pad = mesh(new THREE.CylinderGeometry(4.6, 5, 0.5, 16), m.white, 0, 0.05, 0); g.add(pad);
  const ringGreen = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.35, 5, 18), m.leaf); ringGreen.rotation.x = Math.PI / 2; ringGreen.position.y = 0.4; g.add(ringGreen);
  switch (style % 8) {
    case 0: g.add(mesh(new THREE.SphereGeometry(2.6, 14, 10, 0, 6.283, 0, 1.57), m.white, 0, 0.3, 0), mesh(new THREE.CylinderGeometry(2.64, 2.64, 0.9, 14), m.glassPod, 0, 1.0, 0), mesh(new THREE.BoxGeometry(2.6, 0.15, 1.2), m.pink, 0, 2.2, 2.4)); break;
    case 1: { const t = makeTower(m, 1, 14); t.scale.setScalar(0.6); g.add(t); const o = mesh(new THREE.OctahedronGeometry(0.7, 0), m.neon, 0, 9.4, 0); g.add(o); break; }
    case 2: g.add(mesh(new THREE.BoxGeometry(7, 1.8, 3), m.white, 0, 1.2, 0), mesh(new THREE.BoxGeometry(7.4, 0.2, 3.5), m.navy, 0, 2.6, 0), mesh(new THREE.BoxGeometry(7, 1.0, 2.8), m.glassPod, 0, 1.2, 0), mesh(new THREE.BoxGeometry(14, 0.14, 0.45), m.pink, 0, 2.2, 0)); break;
    case 3: g.add(mesh(new THREE.CylinderGeometry(3, 3.4, 2.6, 10), m.white, 0, 1.6, 0), mesh(new THREE.CylinderGeometry(2.3, 2.7, 2.2, 10), m.white, 0, 3.8, 0), mesh(new THREE.CylinderGeometry(3.05, 3.45, 1.0, 10, 1, true), m.glassPod, 0, 1.6, 0), mesh(new THREE.BoxGeometry(1.4, 0.4, 0.2), m.pink, 0, 4.0, 2.5), mesh(new THREE.BoxGeometry(0.4, 1.4, 0.2), m.pink, 0, 4.0, 2.5)); break;
    case 4: for (let i = 0; i < 4; i++) { const r = 4.2 - i * 0.9; g.add(mesh(new THREE.CylinderGeometry(r, r + 0.1, 1.3, 12), i % 2 ? m.navy : m.white, 0, 0.9 + i * 1.3, 0)); const gr = new THREE.Mesh(new THREE.TorusGeometry(r, 0.25, 5, 14), m.leaf); gr.rotation.x = Math.PI / 2; gr.position.y = 1.55 + i * 1.3; g.add(gr); } break;
    case 5: { const arch = new THREE.Mesh(new THREE.TorusGeometry(3, 0.8, 8, 24, Math.PI), m.white); arch.position.y = 0.5; arch.rotation.z = 0; arch.castShadow = true; g.add(arch); g.add(mesh(new THREE.BoxGeometry(1.6, 0.9, 0.05), m.pink, 0, 4.8, 0)); break; }
    case 6: { const r = new THREE.Mesh(new THREE.TorusGeometry(3.8, 1, 8, 28), m.white); r.rotation.x = Math.PI / 2; r.position.y = 1.4; r.castShadow = true; g.add(r); g.add(mesh(new THREE.CylinderGeometry(3, 3, 0.1, 24), m.pool, 0, 1.0, 0)); break; }
    default: g.add(mesh(new THREE.ConeGeometry(1.0, 11, 8), m.white, 0, 5.8, 0)); { const rg = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.08, 5, 20), m.neon); rg.rotation.x = Math.PI / 2; rg.position.y = 3; g.add(rg); }
  }
  return g;
}

// ------------------------------------------------------------------ time of day
export type Sky = { top: THREE.Color; horizon: THREE.Color; night: number; dusk: number };
export function skyFor(hour: number): Sky {
  const day = smooth(5, 7, hour) * (1 - smooth(17, 19, hour));
  const dusk = Math.max(Math.exp(-Math.pow((hour - 6) / 0.9, 2)), Math.exp(-Math.pow((hour - 18) / 0.9, 2)));
  const topD = new THREE.Color(0x5aaeff), hzD = new THREE.Color(0xcdeeff), topN = new THREE.Color(0x050a24), hzN = new THREE.Color(0x1b2458);
  const top = topN.clone().lerp(topD, day), horizon = hzN.clone().lerp(hzD, day);
  horizon.lerp(new THREE.Color(0xff9a6b), dusk * 0.85); top.lerp(new THREE.Color(0x4a4b9f), dusk * 0.5);
  return { top, horizon, night: 1 - day, dusk };
}
export function skyTexture(s: Sky) {
  const c = document.createElement("canvas"); c.width = 2; c.height = 256; const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#" + s.top.getHexString()); g.addColorStop(0.62, "#" + s.horizon.getHexString()); g.addColorStop(1, "#" + s.horizon.getHexString());
  x.fillStyle = g; x.fillRect(0, 0, 2, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Jakarta wall-clock hour as a float. */
export function jakartaHour(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(d);
  return Number(p.find((x) => x.type === "hour")!.value) % 24 + Number(p.find((x) => x.type === "minute")!.value) / 60;
}

export function dotTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
