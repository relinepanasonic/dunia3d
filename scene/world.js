import * as THREE from 'three';
import {rng} from './rng.js';

export const flags={flat:false};
const hgt=(x,z)=>{
  if(flags.flat)return 0;
  const d=Math.hypot(x,z), flat=THREE.MathUtils.smoothstep(d,6,22);
  const h=Math.sin(x*.07)*2.2+Math.cos(z*.06+1)*2.0+Math.sin((x+z)*.13)*.9+Math.cos(x*.21-z*.17)*.35;
  return h*flat;
};
export {hgt};

export function makeWorld(scene,{trees=140,rocks=40,sign=true,chair=false}={}){
  const R=rng(7), g=new THREE.Group(); scene.add(g);
  const S=260,N=140, geo=new THREE.PlaneGeometry(S,S,N,N); geo.rotateX(-Math.PI/2);
  const p=geo.attributes.position, col=new Float32Array(p.count*3), c=new THREE.Color();
  const A=new THREE.Color(0xa9b25a), B=new THREE.Color(0x8e9a45), Cc=new THREE.Color(0xc2b872), Dp=new THREE.Color(0xb59a62);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i); p.setY(i,hgt(x,z));
    const n=R(); c.copy(A).lerp(B,Math.sin(x*.11+z*.07)*.5+.5).lerp(Cc,n*.35);
    const path=Math.abs(z-(-8+Math.sin(x*.12)*3.5)); if(path<1.6&&x>-4) c.lerp(Dp,.8);
    col.set([c.r,c.g,c.b],i*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(col,3)); geo.computeVertexNormals();
  const ng=geo.toNonIndexed(); ng.computeVertexNormals();
  const cp=ng.attributes.color,pp=ng.attributes.position;
  for(let i=0;i<pp.count;i+=3){const k=(R()-.5)*.07;for(let j=0;j<3;j++)cp.setXYZ(i+j,cp.getX(i+j)+k,cp.getY(i+j)+k,cp.getZ(i+j)+k)}
  const t=new THREE.Mesh(ng,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));
  t.receiveShadow=true; g.add(t);

  const tuft=new THREE.InstancedMesh(new THREE.ConeGeometry(.07,.28,3),new THREE.MeshStandardMaterial({color:0x7f8f3c,flatShading:true}),2600);
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),ps=new THREE.Vector3();
  for(let i=0;i<2600;i++){const x=(R()-.5)*90,z=(R()-.5)*90-10; ps.set(x,hgt(x,z)+.1,z);sc.setScalar(.7+R()*.9);q.setFromEuler(new THREE.Euler(0,R()*6,0));m4.compose(ps,q,sc);tuft.setMatrixAt(i,m4)}
  g.add(tuft);

  const trunkM=new THREE.MeshStandardMaterial({color:0x6b4a2f,flatShading:true}),leafM=[0x4f7a2e,0x5d8a33,0x44702b].map(c=>new THREE.MeshStandardMaterial({color:c,flatShading:true}));
  const cone1=new THREE.ConeGeometry(1.1,1.8,6),cone2=new THREE.ConeGeometry(.85,1.6,6),cone3=new THREE.ConeGeometry(.55,1.3,6),trunk=new THREE.CylinderGeometry(.14,.18,.8,5);
  for(let i=0;i<trees;i++){
    let x=(R()-.5)*110,z=(R()-.5)*110-12; if(Math.hypot(x,z)<16)continue;
    const T=new THREE.Group(),m=leafM[i%3],s=.8+R()*.9;
    const tr=new THREE.Mesh(trunk,trunkM);tr.position.y=.4;T.add(tr);
    [[cone1,1.5],[cone2,2.5],[cone3,3.4]].forEach(([cg,y])=>{const k=new THREE.Mesh(cg,m);k.position.y=y;k.castShadow=true;T.add(k)});
    T.position.set(x,hgt(x,z),z);T.scale.setScalar(s);T.rotation.y=R()*6;g.add(T);
  }
  const rockM=new THREE.MeshStandardMaterial({color:0x8d8c86,flatShading:true,roughness:1});
  for(let i=0;i<rocks;i++){
    const x=(R()-.5)*90,z=(R()-.5)*90-8; if(Math.hypot(x,z)<5)continue;
    const r=new THREE.Mesh(new THREE.IcosahedronGeometry(.5+R()*.9,0),rockM);
    r.scale.set(1,.6+R()*.4,1);r.position.set(x,hgt(x,z)+.2,z);r.rotation.set(R()*3,R()*3,R()*3);r.castShadow=true;g.add(r);
  }
  if(sign){
    const S2=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0x7a5230,flatShading:true}),plank=new THREE.MeshStandardMaterial({color:0xb98a52,flatShading:true});
    for(const s of[-1,1]){const po=new THREE.Mesh(new THREE.BoxGeometry(.2,2.6,.2),wood);po.position.set(s*1.1,1.3,0);po.castShadow=true;S2.add(po)}
    const bd=new THREE.Mesh(new THREE.BoxGeometry(2.6,1.3,.12),plank);bd.position.set(0,1.9,.05);bd.castShadow=true;S2.add(bd);
    S2.name='sign';S2.position.set(5.2,hgt(5.2,-3)-.05,-3);S2.rotation.y=-.55;g.add(S2);
  }
  if(chair){
    const C=new THREE.Group(),red=new THREE.MeshStandardMaterial({color:0xd8222b,flatShading:true});
    const seat=new THREE.Mesh(new THREE.BoxGeometry(1.6,.25,1.4),red);seat.position.y=1.1;C.add(seat);
    const back=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.8,.2),red);back.position.set(0,2.1,-.6);C.add(back);
    for(const x of[-.65,.65])for(const z of[-.55,.55]){const l=new THREE.Mesh(new THREE.BoxGeometry(.18,1.1,.18),red);l.position.set(x,.55,z);C.add(l)}
    C.traverse(o=>o.castShadow=true);C.name='chair';C.position.set(-4.2,0,-1.5);C.rotation.y=.5;g.add(C);
  }
  // houses (toggled by count)
  const HP=[[3.8,-6.5],[-7.5,-7],[8,-9],[-13,-11],[13,-13],[-5,-14],[4,-17],[16,-5],[-17,-4]],HC=[0xe8b4a0,0x9ec5d8,0xf0d58a,0xb7d4a0,0xd9a0c4,0xc9b49a,0x8fb0e0,0xe8c07a];
  HP.forEach(([x,z],i)=>{
    const H=new THREE.Group();H.name='house'+i;
    const body=new THREE.Mesh(new THREE.BoxGeometry(3,2.2,3),new THREE.MeshStandardMaterial({color:HC[i],flatShading:true}));body.position.y=1.1;
    const roof=new THREE.Mesh(new THREE.ConeGeometry(2.8,1.6,4),new THREE.MeshStandardMaterial({color:0xb5483a,flatShading:true}));roof.position.y=3;roof.rotation.y=Math.PI/4;
    const door=new THREE.Mesh(new THREE.BoxGeometry(.7,1.2,.1),new THREE.MeshStandardMaterial({color:0x6b4a2f}));door.position.set(0,.6,1.52);
    H.add(body,roof,door);H.traverse(o=>{if(o.isMesh)o.castShadow=true});
    H.position.set(x,hgt(x,z),z);H.rotation.y=(i%3-1)*.35;H.visible=false;g.add(H);
  });
  // campfire
  const F=new THREE.Group();F.name='campfire';
  for(let i=0;i<5;i++){const l=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,1.1,5),new THREE.MeshStandardMaterial({color:0x5a3d28,flatShading:true}));l.rotation.set(Math.PI/2.3,i*1.26,0);l.position.y=.15;F.add(l)}
  const fl=new THREE.MeshBasicMaterial({color:0xffa030,fog:false});
  for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.ConeGeometry(.28-i*.05,.9+i*.3,5),fl);c.position.set((i-1)*.14,.6+i*.08,0);c.name='flame'+i;F.add(c)}
  const fire=new THREE.PointLight(0xff9040,0,18);fire.position.y=1.2;fire.name='firelight';F.add(fire);
  F.position.set(0.7,hgt(0.7,2.4),2.4);F.visible=false;g.add(F);
  const cm=new THREE.MeshStandardMaterial({color:0xffffff,flatShading:true,roughness:1,emissive:0xffffff,emissiveIntensity:.9});g.userData.cloudMat=cm;
  for(let i=0;i<9;i++){
    const C=new THREE.Group();
    for(let j=0;j<5;j++){const b=new THREE.Mesh(new THREE.IcosahedronGeometry(2+R()*2,1),cm);b.position.set(j*2.6-5+R(),R()*1.2,R()*2);b.scale.y=.7;C.add(b)}
    C.position.set((R()-.5)*90,13+R()*7,-45-R()*30);C.scale.setScalar(1.4+R());g.add(C);
  }
  return g;
}
