"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { supabase, configured } from "@/lib/supabase";
import { HOUSES, levelOf, type Building, type WorldCitizen } from "@/lib/game";
import { ISLAND_R, clamp, createMats, dotTexture, forest, jakartaHour, landY, makeBuilding, makeIsland, makePod, makeRoad, makeTower, ringCurve, rng, skyFor, skyTexture, smooth } from "@/lib/city";

const MAX_PODS = 300, LAND_PODS = 110;
type Picked = { kind: "pod"; c: WorldCitizen; level: number } | { kind: "building"; b: Building } | { kind: "tower" } | null;
type Mode = "auto" | "pagi" | "siang" | "sore" | "malam";
const PRESET: Record<Exclude<Mode, "auto">, number> = { pagi: 6.8, siang: 12.5, sore: 17.8, malam: 21.5 };
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;

export default function World() {
  const mount = useRef<HTMLDivElement>(null);
  const [citizens, setCitizens] = useState<WorldCitizen[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [snap, setSnap] = useState<{ day: number; penduduk: number }>({ day: 0, penduduk: 0 });
  const [picked, setPicked] = useState<Picked>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [clock, setClock] = useState(12);
  const [spin, setSpin] = useState(true);
  const [status, setStatus] = useState("memuat…");
  const modeRef = useRef<Mode>("auto"), spinRef = useRef(true);
  modeRef.current = mode; spinRef.current = spin;
  const api = useRef<{ setSpin: (s: boolean) => void } | null>(null);

  useEffect(() => {
    if (!configured) { setStatus("Supabase belum dikonfigurasi"); return; }
    let alive = true;
    const load = async () => {
      const [c, b, s] = await Promise.all([
        supabase.from("ng_citizens").select("*").limit(5000),
        supabase.from("ng_buildings").select("*").not("built_day", "is", null).order("built_day").order("slot"),
        supabase.from("ng_snapshots").select("day,penduduk").order("day", { ascending: false }).limit(1),
      ]);
      if (!alive) return;
      setCitizens((c.data ?? []) as WorldCitizen[]); setBuildings((b.data ?? []) as Building[]);
      setSnap(s.data?.[0] ?? { day: 0, penduduk: 0 }); setStatus("");
    };
    load(); const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const shown = useMemo(() => [...citizens].sort((a, b) => levelOf(b) - levelOf(a) || b.coins - a.coins).slice(0, MAX_PODS), [citizens]);
  const counts = useMemo(() => HOUSES.map((h) => citizens.filter((c) => levelOf(c) === h.level).length), [citizens]);

  useEffect(() => {
    const el = mount.current; if (!el) return;
    const W = () => el.clientWidth || 800, H = () => el.clientHeight || 600;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(W(), H());
    renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xbfe8ff, 160, 620);
    const cam = new THREE.PerspectiveCamera(48, W() / H(), 0.5, 1600); cam.position.set(0, 58, 118);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0, 5, 0); controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.1; controls.minDistance = 14; controls.maxDistance = 330; controls.autoRotateSpeed = 0.4; controls.autoRotate = spinRef.current;
    const m = createMats();
    const hemi = new THREE.HemisphereLight(0xeaf7ff, 0x2a7f90, 1.2);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 420 });
    scene.add(hemi, sun);
    const R = rng(21), pickables: THREE.Object3D[] = [];

    // ---- sea + seabed + island
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 100, 100), new THREE.MeshStandardMaterial({ color: 0x1cb7cc, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2; water.receiveShadow = true; scene.add(water);
    const wp = water.geometry.attributes.position as THREE.BufferAttribute; const base = Float32Array.from(wp.array as Float32Array);
    const seabed = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0xe6dcb0 })); seabed.rotation.x = -Math.PI / 2; seabed.position.y = -9; scene.add(seabed);
    const shoal = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R + 22, 64), new THREE.MeshBasicMaterial({ color: 0x8fe9e2, transparent: true, opacity: 0.28, fog: false })); shoal.rotation.x = -Math.PI / 2; shoal.position.y = 0.4; scene.add(shoal);
    scene.add(makeIsland());

    // ---- roads: ground ring, elevated ring, maglev loop (+ lamps)
    const ground = ringCurve(45, 1.65, 3, 2), elev = ringCurve(31, 8.5, 2, 5), mag = ringCurve(38, 14, 2, 8);
    const rg = makeRoad(m, ground, 5, false), re = makeRoad(m, elev, 4.5, true), rm = makeRoad(m, mag, 2.2, true);
    scene.add(rg.group, re.group, rm.group);
    const lampPts = [...rg.lamps, ...re.lamps];
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 6, 5), m.lamp, lampPts.length), LM = new THREE.Matrix4();
    lampPts.forEach((p, i) => { LM.setPosition(p.x, p.y + 2.4, p.z); lamps.setMatrixAt(i, LM); });
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 5), m.rail, lampPts.length);
    lampPts.forEach((p, i) => { LM.setPosition(p.x, p.y + 1.2, p.z); posts.setMatrixAt(i, LM); });
    const halo = new THREE.Points(new THREE.BufferGeometry().setFromPoints(lampPts.map((p) => new THREE.Vector3(p.x, p.y + 2.4, p.z))), new THREE.PointsMaterial({ color: 0xffd79a, size: 9, map: dotTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(lamps, posts, halo);

    // ---- hub plaza (center) and the growing skyline of white towers
    const hub = new THREE.Group();
    hub.add(new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 0.8, 24), m.white).translateY(1.6));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.6, 18, 12, 0, 6.283, 0, 1.6), m.glassPod); dome.position.y = 2; hub.add(dome);
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5, s = new THREE.Group(); s.add(new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8, 0, 6.283, 0, 1.57), m.white).translateY(2)); s.position.set(Math.cos(a) * 11, 0, Math.sin(a) * 11); hub.add(s); }
    scene.add(hub);
    const nTow = clamp(3 + Math.floor(Math.sqrt(snap.penduduk) * 0.8), 3, 14), towerSpots: THREE.Vector3[] = [];
    for (let i = 0; i < nTow; i++) {
      const a = i * 2.399 + 0.4, r = 15 + 12 * Math.sqrt(i / nTow) + (i % 2) * 2; const h = 18 + R() * 20 + (i % 4) * 4;
      const t = makeTower(m, i, h); t.position.set(Math.cos(a) * r, landY(r) + 0.4, Math.sin(a) * r); t.rotation.y = R() * 6; t.userData.pick = { kind: "tower" }; scene.add(t); pickables.push(t); towerSpots.push(t.position);
    }
    // public buildings (built via comments/polls) on the lawns between roads
    buildings.slice(0, 16).forEach((b, k) => {
      const a = (k / Math.max(1, Math.min(16, buildings.length))) * Math.PI * 2 + 0.7, r = 52 - (k % 2) * 3;
      const o = makeBuilding(m, b.style ?? b.slot % 8); o.position.set(Math.cos(a) * r, landY(r) + 0.35, Math.sin(a) * r); o.rotation.y = -a; o.userData.pick = { kind: "building", b }; scene.add(o); pickables.push(o); towerSpots.push(o.position);
    });

    // ---- citizens: free pods on the green land first, overflow floating in the lagoon
    const podPos: THREE.Vector3[] = []; const floaters: { g: THREE.Object3D; ph: number; y0: number }[] = [];
    shown.forEach((c, i) => {
      const lvl = levelOf(c), g = makePod(m, lvl); g.scale.setScalar(1.6);
      let x: number, z: number, y: number;
      if (i < LAND_PODS) { const r = Math.sqrt(58 * 58 + ((i + 0.5) / LAND_PODS) * (72 * 72 - 58 * 58)), th = i * 2.399963; x = Math.cos(th) * r; z = Math.sin(th) * r; y = landY(r) + 0.55; podPos.push(new THREE.Vector3(x, 0, z)); }
      else { const j = i - LAND_PODS, r = ISLAND_R + 14 + 8 * Math.sqrt(j), th = j * 2.399963; x = Math.cos(th) * r; z = Math.sin(th) * r; y = 0.3; floaters.push({ g, ph: j * 0.7, y0: y }); }
      g.position.set(x, y, z); g.rotation.y = -Math.atan2(z, x); g.userData.pick = { kind: "pod", c, level: lvl }; scene.add(g); pickables.push(g);
    });

    // ---- greenery: trees on land (kept clear of roads, pods and landmarks)
    const trees: number[][] = []; let tries = 0;
    while (trees.length < 190 && tries++ < 2500) {
      const a = R() * 6.283, r = 10 + R() * (ISLAND_R - 14), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(r - 45) < 4 || Math.abs(r - 31) < 3.4 || r < 9) continue;
      if (podPos.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 25) || towerSpots.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 49)) continue;
      trees.push([x, landY(r), z, 0.8 + R() * 0.9]);
    }
    scene.add(forest(m, trees));

    // ---- moving life: cars, maglev train, drones, boats
    const nCars = 30, cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.6, 0.85), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), nCars);
    const carCol = [0xffffff, 0xdfe8f0, 0x8fd8ff, 0xffd27a]; for (let i = 0; i < nCars; i++) cars.setColorAt(i, new THREE.Color(carCol[i % 4]));
    cars.castShadow = true; scene.add(cars);
    const train: THREE.Mesh[] = []; for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 3, 4, 8), m.white); c.castShadow = true; train.push(c); scene.add(c); }
    const drones: { g: THREE.Mesh; r: number; y: number; sp: number; ph: number }[] = [];
    for (let i = 0; i < 8; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), m.white); d.scale.set(1.6, 0.35, 0.9); scene.add(d); drones.push({ g: d, r: 40 + R() * 60, y: 32 + R() * 20, sp: (0.04 + R() * 0.05) * (i % 2 ? 1 : -1), ph: R() * 6 }); }
    const boats: { g: THREE.Group; r: number; sp: number; ph: number }[] = [];
    for (let i = 0; i < 6; i++) { const b = new THREE.Group(); b.add(new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 1.8), m.white).translateY(0.5)); b.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.4), m.glassPod).translateY(1.3)); scene.add(b); boats.push({ g: b, r: 112 + (i % 3) * 18, sp: (0.012 + R() * 0.01) * (i % 2 ? 1 : -1), ph: R() * 6 }); }

    // ---- stars + moon
    const sp: number[] = []; for (let i = 0; i < 400; i++) { const a = R() * 6.283, e = 0.15 + R() * 1.2; sp.push(Math.cos(a) * Math.cos(e) * 700, Math.sin(e) * 700, Math.sin(a) * Math.cos(e) * 700); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, transparent: true, opacity: 0, fog: false, sizeAttenuation: false }); scene.add(new THREE.Points(sg, starMat));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false, transparent: true, opacity: 0 })); moon.position.set(-260, 210, -380); scene.add(moon);

    // ---- time of day
    const towerMats: THREE.MeshStandardMaterial[] = []; scene.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mm?.userData?.tower) towerMats.push(mm); });
    const skyPrev: { tex: THREE.Texture | null } = { tex: null };
    let lastHour = -1;
    const applyTime = (h: number) => {
      lastHour = h; const s = skyFor(h), n = s.night, day = 1 - n;
      skyPrev.tex?.dispose(); skyPrev.tex = skyTexture(s); scene.background = skyPrev.tex; (scene.fog as THREE.Fog).color.copy(s.horizon);
      hemi.intensity = 0.5 + 0.75 * day; hemi.color.copy(s.horizon).lerp(new THREE.Color(0xffffff), 0.4); hemi.groundColor.set(day > 0.5 ? 0x2a7f90 : 0x14213d);
      const t = clamp((h - 6) / 12), up = h >= 5.5 && h <= 18.5;
      if (up) sun.position.set(-Math.cos(Math.PI * t) * 150, Math.sin(Math.PI * t) * 150 + 12, 60); else sun.position.set(80, 140, -50);
      sun.intensity = up ? 0.4 + 1.9 * day : 0.55; sun.color.set(up ? (s.dusk > 0.3 ? 0xffb27a : 0xffffff) : 0x9fb2ff);
      (water.material as THREE.MeshStandardMaterial).color.set(0x0b3a63).lerp(new THREE.Color(0x1cb7cc), day);
      m.glassPod.emissiveIntensity = 0.04 + 1.5 * n; m.glassTower.emissiveIntensity = 0.04 + 1.6 * n; towerMats.forEach((x) => { x.emissiveIntensity = 0.04 + 1.7 * n; });
      (m.lamp.color as THREE.Color).set(0xb9bec6).lerp(new THREE.Color(0xffe2a0), n); (halo.material as THREE.PointsMaterial).opacity = n * 0.95;
      starMat.opacity = smooth(0.55, 0.9, n); (moon.material as THREE.MeshBasicMaterial).opacity = smooth(0.6, 0.95, n); renderer.toneMappingExposure = 0.85 + 0.2 * day;
    };

    // ---- interaction
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
    api.current = { setSpin: (s) => { controls.autoRotate = s; } };

    // ---- loop
    const CM = new THREE.Matrix4(), CQ = new THREE.Quaternion(), CP = new THREE.Vector3(), CT = new THREE.Vector3(), CS = new THREE.Vector3(1, 1, 1), X = new THREE.Vector3(1, 0, 0), D = new THREE.Vector3();
    let raf = 0, lastClock = 0; const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      const md = modeRef.current, h = md === "auto" ? jakartaHour() : PRESET[md];
      if (Math.abs(h - lastHour) > 0.004) applyTime(h);
      if (t - lastClock > 1) { lastClock = t; setClock(h); }
      for (let i = 0; i < wp.count; i++) { const x = base[i * 3], y = base[i * 3 + 1]; wp.setZ(i, Math.sin(x * 0.05 + t * 0.8) * 0.22 + Math.cos(y * 0.06 + t * 0.6) * 0.18); }
      wp.needsUpdate = true; water.geometry.computeVertexNormals();
      floaters.forEach((p) => { p.g.position.y = p.y0 + Math.sin(t * 1.1 + p.ph) * 0.12; });
      for (let i = 0; i < nCars; i++) {   // first 18 cars on the ground ring, the rest on the elevated ring
        const c = i < 18 ? ground : elev, dir = i % 2 ? 1 : -1, u = ((i * 0.137 + dir * t * (i < 18 ? 0.012 : 0.016)) % 1 + 1) % 1;
        c.getPointAt(u, CP); c.getTangentAt(u, CT); CP.x += -CT.z * dir; CP.z += CT.x * dir; CP.y += 0.55;
        D.set(CT.x * dir, 0, CT.z * dir).normalize(); CQ.setFromUnitVectors(X, D); CM.compose(CP, CQ, CS); cars.setMatrixAt(i, CM);
      }
      cars.instanceMatrix.needsUpdate = true;
      train.forEach((c, i) => { const u = ((t * 0.02 - i * 0.012) % 1 + 1) % 1; mag.getPointAt(u, CP); mag.getTangentAt(u, CT); c.position.set(CP.x, CP.y + 0.9, CP.z); c.rotation.set(0, -Math.atan2(CT.z, CT.x), Math.PI / 2); });
      drones.forEach((d) => { const a = d.ph + t * d.sp; d.g.position.set(Math.cos(a) * d.r, d.y + Math.sin(t + d.ph) * 1.5, Math.sin(a) * d.r); d.g.rotation.y = -a + (d.sp > 0 ? Math.PI : 0); });
      boats.forEach((b) => { const a = b.ph + t * b.sp; b.g.position.set(Math.cos(a) * b.r, 0.2 + Math.sin(t * 1.3 + b.ph) * 0.1, Math.sin(a) * b.r); b.g.rotation.y = -a + (b.sp > 0 ? 0 : Math.PI); });
      controls.update(); renderer.render(scene, cam); raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose(); skyPrev.tex?.dispose(); scene.traverse((o) => { const x = o as THREE.Mesh; if (x.geometry) x.geometry.dispose(); }); renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [shown, buildings, snap.penduduk]);

  const MODES: [Mode, string][] = [["auto", `⏱ Auto ${hhmm(clock)} WIB`], ["pagi", "🌅 Pagi"], ["siang", "☀ Siang"], ["sore", "🌇 Sore"], ["malam", "🌙 Malam"]];
  return (
    <div style={{ position: "relative", height: "100vh", width: "100%" }}>
      <div ref={mount} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", left: 12, top: 12, right: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", pointerEvents: "none" }}>
        <Link href="/" style={{ pointerEvents: "auto" }} className="tier">← Dashboard</Link>
        <span className="tier">Dunia Negara Gue · Hari ke-{snap.day}</span>
        {MODES.map(([k, label]) => <button key={k} style={{ pointerEvents: "auto", opacity: mode === k ? 1 : 0.75, outline: mode === k ? "2px solid var(--lime)" : "none" }} className="ghost" onClick={() => setMode(k)}>{label}</button>)}
        <button style={{ pointerEvents: "auto" }} className="ghost" onClick={() => { setSpin(!spin); api.current?.setSpin(!spin); }}>{spin ? "⏸ Putar" : "▶ Putar"}</button>
      </div>
      <div className="card" style={{ position: "absolute", left: 12, bottom: 12, maxWidth: 330, fontSize: 13 }}>
        <b>{citizens.length} warga · {buildings.length} bangunan · {snap.penduduk} penduduk</b>
        <div className="empty">Setiap warga dapat rumah pod gratis di daratan hijau. Upgrade dengan koin.</div>
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
          </>) : picked.kind === "building" ? (<><b>{picked.b.name}</b><div className="empty">Dibangun Day {picked.b.built_day}</div></>) : (<><b>Menara Kota</b><div className="empty">Skyline tumbuh seiring jumlah penduduk.</div></>)}
          <button className="ghost" style={{ marginTop: 8 }} onClick={() => setPicked(null)}>Tutup</button>
        </div>
      )}
    </div>
  );
}
