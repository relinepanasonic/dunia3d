import * as THREE from 'three';
import {rng} from './rng.js';

const NEON=0x34e8ff,MAG=0xff4fd8,LIME=0xd7ff3a;
const basic=(c,o={})=>new THREE.MeshBasicMaterial({color:c,fog:false,...o});
const std=(c,o={})=>new THREE.MeshStandardMaterial({color:c,flatShading:true,roughness:.4,metalness:.5,...o});
const glow=(c,i=1.2)=>new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:i,flatShading:true,roughness:.5});

function canvasTex(w,h,draw,repeat){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
  if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...repeat)}return t;
}

export function makeWorldFuture(scene,{title='NEGARA'}={}){
  const R=rng(11),g=new THREE.Group();scene.add(g);
  const mats={};   // materials whose look depends on time of day

  // ---- ground: metal plates + glowing grid
  const gridLines=canvasTex(512,512,(x,w,h)=>{x.fillStyle='#000';x.fillRect(0,0,w,h);x.strokeStyle='#37e9ff';x.lineWidth=6;x.strokeRect(0,0,w,h);x.lineWidth=2;x.beginPath();x.moveTo(w/2,0);x.lineTo(w/2,h);x.moveTo(0,h/2);x.lineTo(w,h/2);x.stroke()},[60,60]);
  const gridBase=canvasTex(512,512,(x,w,h)=>{x.fillStyle='#dfe7ef';x.fillRect(0,0,w,h);x.fillStyle='#cdd8e3';x.fillRect(0,0,w/2,h/2);x.fillRect(w/2,h/2,w/2,h/2)},[60,60]);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(480,480),new THREE.MeshStandardMaterial({map:gridBase,emissiveMap:gridLines,emissive:0xffffff,emissiveIntensity:.35,roughness:.5,metalness:.3}));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;g.add(ground);mats.ground=ground.material;
  // central plaza ring
  const plaza=new THREE.Mesh(new THREE.CylinderGeometry(5,5.3,.16,40),std(0xf2f6fa,{metalness:.3}));plaza.position.y=.08;plaza.receiveShadow=true;g.add(plaza);
  const ringA=new THREE.Mesh(new THREE.TorusGeometry(5.1,.07,6,48),basic(NEON));ringA.rotation.x=Math.PI/2;ringA.position.y=.2;g.add(ringA);

  // ---- skyline (instanced-ish: plain meshes, few)
  const winTex=canvasTex(64,128,(x,w,h)=>{x.fillStyle='#000';x.fillRect(0,0,w,h);for(let i=0;i<14;i++)for(let j=0;j<7;j++){if(R()<.55){x.fillStyle=R()<.8?'#ffe9a8':'#7ff2ff';x.fillRect(j*9+2,i*9+2,5,5)}}});
  const towerMat=new THREE.MeshStandardMaterial({color:0x2a3555,emissiveMap:winTex,emissive:0xffffff,emissiveIntensity:.3,flatShading:true,roughness:.4,metalness:.6});
  mats.tower=towerMat;
  const addTower=(x,z,w,h)=>{
    const t=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),towerMat);t.position.set(x,h/2,z);t.castShadow=true;g.add(t);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(w*1.02,.5,w*1.02),basic(R()<.5?NEON:MAG));cap.position.set(x,h+.25,z);g.add(cap);
  };
  for(let i=0;i<80;i++){const a=(R()-.5)*3.0,r=130+R()*130,x=Math.sin(a)*r*1.4,z=-Math.cos(a)*r-20;addTower(x,z,8+R()*14,35+R()*110)}
  for(let i=0;i<12;i++){const side=i%2?1:-1;addTower(side*(58+R()*40),-30-R()*90,6+R()*6,16+R()*34)}

  // ---- neon pylons (trees) + light poles
  const treeM=glow(0x2bf0c0,.9),trunkM=std(0x93a4b8);
  for(let i=0;i<46;i++){
    const x=(R()-.5)*90,z=(R()-.5)*90-18;if(Math.hypot(x,z)<10)continue;
    const T=new THREE.Group(),s=.8+R()*.9;
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,1.6,6),trunkM);tr.position.y=.8;T.add(tr);
    for(let k=0;k<3;k++){const c=new THREE.Mesh(new THREE.OctahedronGeometry(.9-k*.2,0),treeM);c.position.y=2.1+k*.9;c.scale.y=1.5;T.add(c)}
    T.position.set(x,0,z);T.scale.setScalar(s);T.rotation.y=R()*6;g.add(T);
  }
  const poleM=std(0x8ea0b8);
  for(let i=0;i<10;i++){
    const z=6-i*7,x=(i%2?1:-1)*7.5;
    const p=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,4.2,6),poleM);p.position.set(x,2.1,z);g.add(p);
    const l=new THREE.Mesh(new THREE.SphereGeometry(.28,8,6),basic(i%3?NEON:MAG));l.position.set(x,4.3,z);g.add(l);
  }
  // floating data crystals (rocks)
  for(let i=0;i<26;i++){
    const x=(R()-.5)*80,z=(R()-.5)*80-14;if(Math.hypot(x,z)<8)continue;
    const c=new THREE.Mesh(new THREE.IcosahedronGeometry(.4+R()*.7,0),glow(R()<.5?0x9b6bff:0x41d8ff,.8));
    c.position.set(x,1.2+R()*3,z);c.rotation.set(R()*3,R()*3,R()*3);g.add(c);
  }

  // ---- sign: holo board
  const S2=new THREE.Group();S2.name='sign';
  for(const s of[-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,2.6,6),poleM);p.position.set(s*1.4,1.3,0);S2.add(p);const l=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),basic(NEON));l.position.set(s*1.4,2.65,0);S2.add(l)}
  const drawBoard=(x,w,h,name)=>{x.clearRect(0,0,w,h);x.fillStyle='rgba(6,30,56,.85)';x.fillRect(0,0,w,h);x.strokeStyle='#37e9ff';x.lineWidth=10;x.strokeRect(5,5,w-10,h-10);x.fillStyle='#d7ff3a';x.font=`900 ${Math.min(70,Math.floor(470/Math.max(6,name.length)*1.6))}px Orbitron, sans-serif`;x.textAlign='center';x.fillText(name,w/2,125);x.fillStyle='#7ff2ff';x.font='700 34px Orbitron, sans-serif';x.fillText('KOTA DIGITAL',w/2,185)};
  const boardTex=canvasTex(512,256,(x,w,h)=>drawBoard(x,w,h,title));
  g.userData.setTitle=name=>{const c=boardTex.image;drawBoard(c.getContext('2d'),c.width,c.height,name);boardTex.needsUpdate=true};
  const board=new THREE.Mesh(new THREE.PlaneGeometry(2.9,1.45),new THREE.MeshBasicMaterial({map:boardTex,transparent:true,fog:false,side:THREE.DoubleSide}));board.position.set(0,1.95,.05);S2.add(board);
  S2.position.set(5.2,0,-3);S2.rotation.y=-.55;g.add(S2);

  // ---- hover chair
  const C=new THREE.Group();C.name='chair';
  const seat=new THREE.Mesh(new THREE.BoxGeometry(1.5,.3,1.3),std(0xf3f6fa));seat.position.y=1.0;C.add(seat);
  const back=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.5,.22),std(0xf3f6fa));back.position.set(0,1.8,-.55);C.add(back);
  const under=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,.06,20),basic(MAG));under.position.y=.45;C.add(under);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.2,.35,.6,8),std(0xaab8c8));stem.position.y=.72;C.add(stem);
  C.traverse(o=>o.castShadow=true);C.position.set(-4.2,0,-1.5);C.rotation.y=.5;g.add(C);

  // ---- buildings (slot order matches series/game.json)
  const HP=[[3.8,-6.5],[-3.6,-8],[8,-9],[-13,-11],[-5,-14],[4,-17],[16,-5],[-17,-4],[-3.5,-12],[10,-14.5],[-10,-16],[0,-21],[18,-10],[-19,-9],[9,-22],[-12,-23]];
  const white=std(0xf2f6fa,{metalness:.3}),navy=std(0x24324f),glass=new THREE.MeshStandardMaterial({color:0x7fe9ff,emissive:0x2bd8ff,emissiveIntensity:.6,transparent:true,opacity:.75,flatShading:true});
  const B=[
    (H)=>{ // 0 Kedai Nutrisi: dome pod + awning
      const d=new THREE.Mesh(new THREE.SphereGeometry(1.8,14,10,0,6.283,0,1.57),white);d.position.y=0;H.add(d);
      const w=new THREE.Mesh(new THREE.CylinderGeometry(1.82,1.82,.1,14),basic(LIME));w.position.y=.9;H.add(w);
      const aw=new THREE.Mesh(new THREE.BoxGeometry(2.2,.12,1.1),basic(MAG));aw.position.set(0,1.1,1.6);H.add(aw);
      const door=new THREE.Mesh(new THREE.BoxGeometry(.9,1.1,.1),glass);door.position.set(0,.55,1.72);H.add(door)},
    (H)=>{ // 1 Menara Energi
      const t=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.3,7,10),navy);t.position.y=3.5;H.add(t);
      for(let i=0;i<5;i++){const r=new THREE.Mesh(new THREE.TorusGeometry(1.1-i*.05,.07,5,18),basic(NEON));r.rotation.x=Math.PI/2;r.position.y=1.2+i*1.2;H.add(r)}
      const o=new THREE.Mesh(new THREE.OctahedronGeometry(.8,0),glow(LIME,1.5));o.position.y=7.8;H.add(o)},
    (H)=>{ // 2 Stasiun Maglev
      const b=new THREE.Mesh(new THREE.BoxGeometry(6,1.6,2.4),white);b.position.y=.8;H.add(b);
      const r=new THREE.Mesh(new THREE.BoxGeometry(6.6,.2,3),navy);r.position.y=2.4;H.add(r);
      const l=new THREE.Mesh(new THREE.BoxGeometry(6.8,.08,.3),basic(NEON));l.position.set(0,.2,1.3);H.add(l);
      const rail=new THREE.Mesh(new THREE.BoxGeometry(14,.14,.4),basic(MAG));rail.position.set(0,2.0,0);H.add(rail)},
    (H)=>{ // 3 Klinik Hologram
      const b=new THREE.Mesh(new THREE.BoxGeometry(3.4,3,3.4),white);b.position.y=1.5;H.add(b);
      const a=new THREE.Mesh(new THREE.BoxGeometry(1.4,.4,.2),basic(MAG));a.position.set(0,2.2,1.72);H.add(a);
      const c=new THREE.Mesh(new THREE.BoxGeometry(.4,1.4,.2),basic(MAG));c.position.set(0,2.2,1.72);H.add(c);
      const h=new THREE.Mesh(new THREE.SphereGeometry(.7,10,8),glass);h.position.y=4.2;H.add(h)},
    (H)=>{ // 4 Kampus AI: stepped tiers
      for(let i=0;i<4;i++){const t=new THREE.Mesh(new THREE.BoxGeometry(5-i*1.1,1.3,5-i*1.1),i%2?navy:white);t.position.y=.65+i*1.3;H.add(t);const s=new THREE.Mesh(new THREE.BoxGeometry(5.05-i*1.1,.1,5.05-i*1.1),basic(NEON));s.position.y=1.3+i*1.3;H.add(s)}},
    (H)=>{ // 5 Kedutaan
      const b=new THREE.Mesh(new THREE.BoxGeometry(4.6,2.4,3),white);b.position.y=1.2;H.add(b);
      for(let i=-2;i<=2;i++){const p=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,2.4,6),navy);p.position.set(i*.9,1.2,1.7);H.add(p)}
      const f=new THREE.Mesh(new THREE.PlaneGeometry(1.4,.9),basic(MAG,{side:THREE.DoubleSide}));f.position.set(0,4.4,0);H.add(f);
      const m=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,3,5),poleM);m.position.set(-.7,3.1,0);H.add(m)},
    (H)=>{ // 6 Stadion Hover
      const r=new THREE.Mesh(new THREE.TorusGeometry(3.4,.9,6,24),white);r.rotation.x=Math.PI/2;r.position.y=1.4;H.add(r);
      const l=new THREE.Mesh(new THREE.TorusGeometry(3.4,.1,5,28),basic(LIME));l.rotation.x=Math.PI/2;l.position.y=2.4;H.add(l);
      const f=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.7,.1,20),glow(0x2bd86f,.6));f.position.y=1.2;H.add(f)},
    (H)=>{ // 7 Pelabuhan Orbit: spire + pad
      const p=new THREE.Mesh(new THREE.CylinderGeometry(3,3.4,.4,16),navy);p.position.y=.2;H.add(p);
      const s=new THREE.Mesh(new THREE.ConeGeometry(.9,9,8),white);s.position.y=4.9;H.add(s);
      const r=new THREE.Mesh(new THREE.TorusGeometry(1.6,.08,5,20),basic(NEON));r.rotation.x=Math.PI/2;r.position.y=2.6;H.add(r)},
  ];
  // buildings are created per timeline: styles[i] = model type of the i-th building ever built (see game.json)
  g.userData.setBuildings=styles=>{
    for(let i=0;i<16;i++){const old=g.getObjectByName('house'+i);if(old)g.remove(old)}
    styles.slice(0,16).forEach((st,i)=>{const H=new THREE.Group();H.name='house'+i;B[st%B.length](H);H.traverse(o=>{if(o.isMesh)o.castShadow=true});
      H.position.set(HP[i][0],0,HP[i][1]);H.rotation.y=(i%3-1)*.35;H.visible=false;g.add(H)});
  };

  // ---- energy beacon (kept under the 'campfire' name for the shared renderer)
  const F=new THREE.Group();F.name='campfire';
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,.3,10),navy);base.position.y=.15;F.add(base);
  const cols=[basic(NEON),basic(0xaaf6ff),basic(MAG)];
  for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.CylinderGeometry(.14-i*.03,.2-i*.04,1.3+i*.4,6),cols[i]);c.position.set((i-1)*.2,.95+i*.15,0);c.name='flame'+i;F.add(c)}
  const lp=new THREE.PointLight(NEON,0,20);lp.position.y=1.4;lp.name='firelight';F.add(lp);
  F.position.set(0.7,0,2.4);F.visible=false;g.add(F);

  // sky dummy "cloud" material so the shared day/night mixer keeps working
  g.userData.cloudMat=new THREE.MeshStandardMaterial();

  // time-of-day response: glowing grid + lit windows get stronger at night
  g.userData.onTime=k=>{
    mats.ground.emissiveIntensity=.3+.9*k;
    mats.ground.color.set(0xffffff).lerp(new THREE.Color(0x3a4666),k);
    mats.tower.emissiveIntensity=.25+1.1*k;
  };
  return g;
}
