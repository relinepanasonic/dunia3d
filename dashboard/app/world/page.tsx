"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { supabase, configured } from "@/lib/supabase";
import { HOUSES, levelOf, type Building, type WorldCitizen } from "@/lib/game";

const MAX_PODS = 600;
type Picked = { kind: "pod"; c: WorldCitizen; level: number } | { kind: "building"; b: Building } | null;

// ---------- shared materials ----------
const white = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.35, metalness: 0.2, flatShading: true });
const glass = new THREE.MeshStandardMaterial({ color: 0x7fd8ff, emissive: 0x1a6fa0, emissiveIntensity: 0.25, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.4 });
const solar = new THREE.MeshStandardMaterial({ color: 0x1f4a9c, roughness: 0.3, metalness: 0.6, flatShading: true });
const wood = new THREE.MeshStandardMaterial({ color: 0xa97c50, roughness: 0.8, flatShading: true });
const leaf = new THREE.MeshStandardMaterial({ color: 0x2f9a45, roughness: 0.9, flatShading: true });
const trunk = new THREE.MeshStandardMaterial({ color: 0x7a5a38, flatShading: true });
const pool = new THREE.MeshStandardMaterial({ color: 0x35c6ff, emissive: 0x1090c0, emissiveIntensity: 0.4 });
const navy = new THREE.MeshStandardMaterial({ color: 0x24324f, roughness: 0.5, metalness: 0.4, flatShading: true });
const neonMat = new THREE.MeshBasicMaterial({ color: 0x37e9ff });
const pinkMat = new THREE.MeshBasicMaterial({ color: 0xff4fd8 });

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };

function palm(x: number, z: number, y: number, s = 1) {
  const p = new THREE.Group();
  p.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 5), trunk, 0, 0.7, 0));
  for (let i = 0; i < 5; i++) { const l = mesh(new THREE.ConeGeometry(0.22, 1.1, 4), leaf, Math.cos(i * 1.26) * 0.45, 1.5, Math.sin(i * 1.26) * 0.45); l.rotation.set(Math.sin(i * 1.26) * 1.2, 0, -Math.cos(i * 1.26) * 1.2); p.add(l); }
  p.position.set(x, y, z); p.scale.setScalar(s); return p;
}

/** Pod models by house level (reference: white floating pods with glass bands, solar roofs, palms). */
function makePod(level: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.35, 12), white, 0, -0.35, 0)); // float
  if (level === 1) {
    g.add(mesh(new THREE.SphereGeometry(1.25, 14, 10), white, 0, 0.7, 0));
    g.add(mesh(new THREE.CylinderGeometry(1.27, 1.27, 0.5, 14), glass, 0, 0.65, 0));
    g.add(mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, 6.283, 0, 1.2), glass, 0, 1.75, 0));
  } else if (level === 2) {
    g.add(mesh(new THREE.SphereGeometry(1.6, 14, 10), white, 0, 0.9, 0));
    g.add(mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.6, 14), glass, 0, 0.85, 0));
    const sp = mesh(new THREE.BoxGeometry(1.8, 0.08, 1.2), solar, 0, 2.35, 0); sp.rotation.z = 0.25; g.add(sp);
  } else {
    const r = level === 3 ? 2.3 : level === 4 ? 3.0 : 3.6;
    g.add(mesh(new THREE.CylinderGeometry(r, r * 1.08, 1.0, 8), white, 0, 0.35, 0));
    g.add(mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.45, 8), glass, 0, 0.45, 0));
    g.add(mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.25, 8), wood, 0, 0.95, 0));
    const sp = mesh(new THREE.BoxGeometry(r * 0.9, 0.08, r * 0.7), solar, -r * 0.15, 1.18, 0); g.add(sp);
    g.add(palm(r * 0.45, r * 0.25, 1.05, 0.9)); g.add(palm(-r * 0.5, -r * 0.3, 1.05, 0.8));
    if (level >= 4) { g.add(mesh(new THREE.BoxGeometry(r * 0.5, 0.06, r * 0.35), pool, r * 0.25, 1.12, -r * 0.45)); g.add(palm(r * 0.6, -r * 0.1, 1.05, 1)); g.add(palm(-r * 0.2, r * 0.6, 1.05, 0.85)); }
    if (level >= 5) {
      g.add(mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.6, 0.9, 8), white, 0, 1.55, 0));
      g.add(mesh(new THREE.CylinderGeometry(r * 0.57, r * 0.57, 0.35, 8), glass, 0, 1.6, 0));
      g.add(mesh(new THREE.BoxGeometry(r * 0.8, 0.08, r * 0.6), solar, 0, 2.05, 0));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.1, 0.05, 5, 32), neonMat); ring.rotation.x = Math.PI / 2; ring.position.y = -0.1; g.add(ring);
    }
  }
  return g;
}

/** Public buildings by style (same 8 types as the video world, simplified). */
function makeBuilding(style: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.5, 14), white, 0, -0.3, 0));
  switch (style % 8) {
    case 0: g.add(mesh(new THREE.SphereGeometry(2.4, 14, 10, 0, 6.283, 0, 1.57), white), mesh(new THREE.BoxGeometry(2.6, 0.15, 1.2), pinkMat, 0, 1.6, 2.2)); break;
    case 1: g.add(mesh(new THREE.CylinderGeometry(0.9, 1.4, 8, 10), navy, 0, 4, 0)); for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 5, 18), neonMat); r.rotation.x = Math.PI / 2; r.position.y = 1.2 + i * 1.3; g.add(r); } break;
    case 2: g.add(mesh(new THREE.BoxGeometry(6.5, 1.8, 2.8), white, 0, 0.9, 0), mesh(new THREE.BoxGeometry(7, 0.2, 3.3), navy, 0, 2.6, 0), mesh(new THREE.BoxGeometry(14, 0.14, 0.45), pinkMat, 0, 2.2, 0)); break;
    case 3: g.add(mesh(new THREE.BoxGeometry(3.6, 3.2, 3.6), white, 0, 1.6, 0), mesh(new THREE.BoxGeometry(1.6, 0.4, 0.2), pinkMat, 0, 2.4, 1.85), mesh(new THREE.BoxGeometry(0.4, 1.6, 0.2), pinkMat, 0, 2.4, 1.85), mesh(new THREE.SphereGeometry(0.8, 10, 8), glass, 0, 4.4, 0)); break;
    case 4: for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(5.5 - i * 1.2, 1.4, 5.5 - i * 1.2), i % 2 ? navy : white, 0, 0.7 + i * 1.4, 0)); break;
    case 5: g.add(mesh(new THREE.BoxGeometry(5, 2.6, 3.2), white, 0, 1.3, 0)); for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.6, 6), navy, i, 1.3, 1.8)); g.add(mesh(new THREE.BoxGeometry(1.4, 0.9, 0.05), pinkMat, 0, 4.6, 0)); break;
    case 6: { const r = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.9, 6, 24), white); r.rotation.x = Math.PI / 2; r.position.y = 1.4; r.castShadow = true; g.add(r); break; }
    default: g.add(mesh(new THREE.ConeGeometry(0.95, 10, 8), white, 0, 5.2, 0)); { const r = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.08, 5, 20), neonMat); r.rotation.x = Math.PI / 2; r.position.y = 2.8; g.add(r); }
  }
  return g;
}

export default function World() {
  const mount = useRef<HTMLDivElement>(null);
  const [citizens, setCitizens] = useState<WorldCitizen[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [day, setDay] = useState(0);
  const [picked, setPicked] = useState<Picked>(null);
  const [night, setNight] = useState(false);
  const [spin, setSpin] = useState(true);
  const [status, setStatus] = useState("memuat…");
  const api = useRef<{ setNight: (n: boolean) => void; setSpin: (s: boolean) => void; focus: (x: number, z: number) => void } | null>(null);

  // data: refreshed every 60s so the world stays current
  useEffect(() => {
    if (!configured) { setStatus("Supabase belum dikonfigurasi"); return; }
    let alive = true;
    const load = async () => {
      const [c, b, s] = await Promise.all([
        supabase.from("ng_citizens").select("*").limit(5000),
        supabase.from("ng_buildings").select("*").not("built_day", "is", null).order("built_day").order("slot"),
        supabase.from("ng_snapshots").select("day").order("day", { ascending: false }).limit(1),
      ]);
      if (!alive) return;
      setCitizens((c.data ?? []) as WorldCitizen[]); setBuildings((b.data ?? []) as Building[]); setDay(s.data?.[0]?.day ?? 0); setStatus("");
    };
    load(); const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const shown = useMemo(() => [...citizens].sort((a, b) => levelOf(b) - levelOf(a) || b.coins - a.coins).slice(0, MAX_PODS), [citizens]);
  const counts = useMemo(() => HOUSES.map((h) => citizens.filter((c) => levelOf(c) === h.level).length), [citizens]);

  // ---------- three.js scene (rebuilt when data changes) ----------
  const nightRef = useRef(false), spinRef = useRef(true);
  nightRef.current = night; spinRef.current = spin;
  useEffect(() => {
    const el = mount.current; if (!el) return;
    const W = () => el.clientWidth || 800, H = () => el.clientHeight || 600;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(W(), H());
    renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(48, W() / H(), 0.5, 1200); cam.position.set(0, 30, 48);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.15; controls.minDistance = 12; controls.maxDistance = 260; controls.autoRotateSpeed = 0.5;

    const hemi = new THREE.HemisphereLight(0xeaf7ff, 0x2a7f90, 1.2);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-60, 90, 50); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 300 });
    scene.add(hemi, sun);

    // water (animated) + seabed
    const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 90, 90), new THREE.MeshStandardMaterial({ color: 0x1cb7cc, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2; water.receiveShadow = true; scene.add(water);
    const seabed = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0xe6dcb0, roughness: 1 }));
    seabed.rotation.x = -Math.PI / 2; seabed.position.y = -9; scene.add(seabed);
    const wp = water.geometry.attributes.position as THREE.BufferAttribute; const base = Float32Array.from(wp.array as Float32Array);

    // shallow-water glow under the city
    const shoal = new THREE.Mesh(new THREE.CircleGeometry(34 + 8.5 * Math.sqrt(Math.max(shown.length, 4)) + 14, 48), new THREE.MeshBasicMaterial({ color: 0x8fe9e2, transparent: true, opacity: 0.22, fog: false }));
    shoal.rotation.x = -Math.PI / 2; shoal.position.y = 0.45; scene.add(shoal);
    // hub: central dome + three satellite domes with glass connectors (as in the reference)
    const hub = new THREE.Group();
    hub.add(mesh(new THREE.SphereGeometry(4.5, 18, 12), glass, 0, 1.5, 0)); hub.add(mesh(new THREE.SphereGeometry(5, 18, 8, 0, 6.283, 0, 0.5), white, 0, 5.2, 0));
    hub.add(mesh(new THREE.CylinderGeometry(5.5, 6, 0.6, 20), white, 0, -0.4, 0));
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; const s = new THREE.Group(); s.add(mesh(new THREE.SphereGeometry(2.2, 12, 8), white, 0, 1.2, 0)); s.add(mesh(new THREE.CylinderGeometry(2.22, 2.22, 0.5, 12), glass, 0, 1.2, 0)); s.position.set(Math.cos(a) * 11, 0, Math.sin(a) * 11); hub.add(s); const c = mesh(new THREE.CylinderGeometry(0.4, 0.4, 7, 6), glass, Math.cos(a) * 7.5, 0.9, Math.sin(a) * 7.5); c.rotation.z = Math.PI / 2; c.rotation.y = -a; hub.add(c); }
    hub.userData.pick = { kind: "none" }; scene.add(hub);

    const pickables: THREE.Object3D[] = [];
    // public buildings on a ring
    const ringR = 22, n = Math.max(1, buildings.length);
    buildings.forEach((b, k) => {
      const m = makeBuilding(b.style ?? b.slot % 8), a = (k / n) * Math.PI * 2 + 0.3;
      m.position.set(Math.cos(a) * ringR, 0.4, Math.sin(a) * ringR); m.rotation.y = -a; m.userData.pick = { kind: "building", b }; scene.add(m); pickables.push(m);
    });
    // citizens' pods on a phyllotaxis spiral outside the ring, each linked to the ring by a neon spoke
    const pods: { g: THREE.Object3D; ph: number }[] = []; const pts: number[] = [];
    shown.forEach((c, i) => {
      const lvl = levelOf(c), r = 34 + 8.5 * Math.sqrt(i), th = i * 2.399963;
      const g = makePod(lvl); g.scale.setScalar(1.9); g.position.set(Math.cos(th) * r, 0.3, Math.sin(th) * r); g.rotation.y = -th; g.userData.pick = { kind: "pod", c, level: lvl };
      scene.add(g); pickables.push(g); pods.push({ g, ph: i * 0.7 });
      if (i < 120) pts.push(Math.cos(th) * ringR, 0.7, Math.sin(th) * ringR, Math.cos(th) * (r - 2.6), 0.7, Math.sin(th) * (r - 2.2));
    });
    if (pts.length) { const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x37e9ff, transparent: true, opacity: 0.75 }))); }

    const applyNight = (nt: boolean) => {
      scene.background = new THREE.Color(nt ? 0x0a0f2e : 0xbfe8ff); scene.fog = new THREE.Fog(nt ? 0x0a0f2e : 0xbfe8ff, 120, 520);
      hemi.intensity = nt ? 0.55 : 1.2; hemi.color.set(nt ? 0x6d7cff : 0xeaf7ff); sun.intensity = nt ? 0.5 : 2.2; sun.color.set(nt ? 0x9fb2ff : 0xffffff);
      glass.emissiveIntensity = nt ? 1.4 : 0.25; (water.material as THREE.MeshStandardMaterial).color.set(nt ? 0x0b4a78 : 0x1cb7cc);
    };
    applyNight(nightRef.current);
    api.current = { setNight: applyNight, setSpin: (s) => { controls.autoRotate = s; }, focus: () => {} };
    controls.autoRotate = spinRef.current;

    // click to inspect
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = [0, 0];
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, cam); const hit = ray.intersectObjects(pickables, true)[0];
      let o: THREE.Object3D | null = hit?.object ?? null; while (o && !o.userData.pick) o = o.parent;
      setPicked(o ? (o.userData.pick as Picked) : null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown); renderer.domElement.addEventListener("pointerup", onUp);
    const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); }); ro.observe(el);

    let raf = 0; const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      for (let i = 0; i < wp.count; i++) { const x = base[i * 3], y = base[i * 3 + 1]; wp.setZ(i, Math.sin(x * 0.05 + t * 0.8) * 0.22 + Math.cos(y * 0.06 + t * 0.6) * 0.18); }
      wp.needsUpdate = true; water.geometry.computeVertexNormals();
      pods.forEach((p) => { p.g.position.y = 0.3 + Math.sin(t * 1.1 + p.ph) * 0.12; });
      controls.update(); renderer.render(scene, cam); raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose(); renderer.dispose(); scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); el.removeChild(renderer.domElement);
    };
  }, [shown, buildings]);

  return (
    <div style={{ position: "relative", height: "100vh", width: "100%" }}>
      <div ref={mount} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", left: 12, top: 12, right: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", pointerEvents: "none" }}>
        <Link href="/" style={{ pointerEvents: "auto" }} className="tier">← Dashboard</Link>
        <span className="tier">Dunia Negara Gue · Hari ke-{day}</span>
        <button style={{ pointerEvents: "auto" }} className="ghost" onClick={() => { setNight(!night); api.current?.setNight(!night); }}>{night ? "☀ Siang" : "☾ Malam"}</button>
        <button style={{ pointerEvents: "auto" }} className="ghost" onClick={() => { setSpin(!spin); api.current?.setSpin(!spin); }}>{spin ? "⏸ Putar" : "▶ Putar"}</button>
      </div>
      <div className="card" style={{ position: "absolute", left: 12, bottom: 12, maxWidth: 330, fontSize: 13 }}>
        <b>{citizens.length} warga · {buildings.length} bangunan</b>
        <div className="empty">Setiap warga dapat rumah pod gratis. Upgrade dengan koin.</div>
        {HOUSES.map((h, i) => <div key={h.level} className="row" style={{ margin: "4px 0" }}><span>L{h.level} {h.name}{h.cost ? ` · ${h.cost} koin` : " · gratis"}</span><span>{counts[i] ?? 0}</span></div>)}
        {status && <div className="empty">{status}</div>}
      </div>
      {picked && (
        <div className="card" style={{ position: "absolute", right: 12, bottom: 12, maxWidth: 300 }}>
          {picked.kind === "pod" ? (<>
            <b>@{picked.c.handle}</b> <span className="badge">{picked.c.platform}</span>
            <div style={{ margin: "6px 0" }}>{HOUSES[picked.level - 1].name} (level {picked.level})</div>
            <div className="empty">Koin {picked.c.coins} · pengaruh {picked.c.pengaruh} · komen {picked.c.comments} · suara {picked.c.votes}</div>
            {picked.level < 5 && <div className="empty">Upgrade berikutnya: {HOUSES[picked.level].cost} koin</div>}
          </>) : (<><b>{picked.b.name}</b><div className="empty">Dibangun Day {picked.b.built_day}</div></>)}
          <button className="ghost" style={{ marginTop: 8 }} onClick={() => setPicked(null)}>Tutup</button>
        </div>
      )}
    </div>
  );
}
