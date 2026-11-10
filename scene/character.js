import * as THREE from 'three';
const M=(c,o={})=>new THREE.MeshStandardMaterial({color:c,flatShading:true,roughness:.85,metalness:0,...o});
const SKIN=0xd8a070,SUIT=0x1c1e24,HAIR=0x2b211d,WHITE=0xf1efe8;

export function makeCharacter(opts={}){
  const g=new THREE.Group(); g.name='man';
  const suit=M(opts.suit??SUIT),skin=M(SKIN),white=M(WHITE),hair=M(HAIR),dark=M(0x14110f);
  const box=(w,h,d,m,x,y,z,p=g)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;p.add(o);return o};

  const FUT=opts.theme==='future';
  const NEON=0x34e8ff,neon=()=>new THREE.MeshBasicMaterial({color:NEON,fog:false});
  const earM=FUT?neon():M(WHITE),shoe=FUT?M(0x1a2438,{metalness:.5,roughness:.4}):M(0xcfcbc4);
  const legs={};
  for(const s of[-1,1]){
    const leg=new THREE.Group(); leg.position.set(s*.23,1.05,0); g.add(leg);
    box(.34,1.05,.36,suit,0,-.52,0,leg);
    box(.38,.2,.6,shoe,0,-1.0,.1,leg);
    if(FUT){box(.42,.05,.64,neon(),0,-1.13,.1,leg)}
    legs[s]=leg;
  }
  const torso=new THREE.Group(); torso.position.set(0,1.05,0); g.add(torso);
  box(1.0,1.15,.55,suit,0,.57,0,torso);
  const sh=new THREE.Shape(); sh.moveTo(-.26,1.1); sh.lineTo(.26,1.1); sh.lineTo(0,.2); sh.closePath();
  const shirt=new THREE.Mesh(new THREE.ShapeGeometry(sh),white); shirt.position.set(0,0,.282); torso.add(shirt);
  for(const s of[-1,1]){
    const l=new THREE.Shape(); l.moveTo(s*.27,1.1); l.lineTo(s*.5,1.1); l.lineTo(s*.5,.55); l.closePath();
    const lap=new THREE.Mesh(new THREE.ShapeGeometry(l),M(0x0f1014)); lap.position.set(0,0,.286); torso.add(lap);
  }
  const bow=new THREE.Group(); bow.position.set(0,1.12,.31); torso.add(bow);
  for(const s of[-1,1]){const w=new THREE.Mesh(new THREE.ConeGeometry(.15,.26,4),dark);w.rotation.z=s*Math.PI/2;w.position.x=s*.14;w.castShadow=true;bow.add(w)}
  box(.1,.12,.1,dark,0,0,0,bow);
  const arms={};
  for(const s of[-1,1]){
    const a=new THREE.Group(); a.position.set(s*.64,1.05,0); torso.add(a);
    box(.26,.95,.28,suit,0,-.45,0,a);
    box(.2,.22,.2,skin,0,-1.0,0,a);
    a.rotation.z=s*.06; arms[s]=a;
  }
  box(.3,.5,.3,skin,0,1.4,0,torso);
  const head=new THREE.Group(); head.position.set(0,2.95,.02); g.add(head);
  const R=.78;
  const hs=new THREE.Mesh(new THREE.SphereGeometry(R,18,14),skin); hs.scale.set(1.04,.96,.98); hs.castShadow=true; head.add(hs);
  const cap=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,18,14,0,Math.PI*2,0,1.72),hair);
  cap.scale.set(1.04,.98,1.0); cap.rotation.x=-.42; cap.castShadow=true; head.add(cap);
  for(const s of[-1,1]){
    const e=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),skin); e.position.set(s*R*1.0,-.08,-.02); head.add(e);
    const bud=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),earM); bud.position.set(s*(R*1.0+.1),-.08,.05); head.add(bud);
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.8,5),earM); cable.position.set(s*(R*1.0+.08),-.5,.08); head.add(cable);
  }
  if(FUT){
    // sleek white-silver suit, navy shirt panel, neon trims
    suit.color.set(0xdde5ee);suit.metalness=.55;suit.roughness=.35;
    white.color.set(0x0f1b33);white.emissive=new THREE.Color(0x0a2a4a);
    dark.color.set(NEON);dark.emissive=new THREE.Color(NEON);dark.emissiveIntensity=1.6;
    hair.color.set(0x161a28);
    for(const s of[-1,1]){
      box(.05,1.1,.05,neon(),s*.5,.58,.285,torso);                 // neon seam down the jacket
      box(.34,.14,.34,M(0xb9c6d6,{metalness:.7,roughness:.3}),s*.64,1.12,0,torso); // shoulder pad
      box(.05,.8,.29,neon(),s*.64,.6,.0,torso);                    // arm stripe
    }
    box(.62,.06,.62,neon(),0,1.2,0,torso);                          // glowing collar ring
    box(.18,.1,.04,neon(),-.3,.8,.3,torso);                         // holo badge
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.62,.035,6,28),neon());halo.rotation.x=Math.PI/2;halo.position.y=1.12;halo.name='halo';head.add(halo);
    for(const s of[-1,1]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.13,.03,6,14),neon());ring.rotation.y=Math.PI/2;ring.position.set(s*(R*1.0+.02),-.08,-.02);head.add(ring)}
  }
  const face=new THREE.Group(); head.add(face);
  const fm=new THREE.MeshBasicMaterial({color:0x17110e});
  g.userData={legs,arms,torso,head,face,fm,hs,noseM:M(0xb4784a),blushM:new THREE.MeshBasicMaterial({color:0xe9806a,transparent:true,opacity:.55})};
  setExpression(g,opts.expression||'smile');
  return g;
}

export function setExpression(g,kind){
  const {face,fm}=g.userData; while(face.children.length)face.remove(face.children[0]);
  const zf=.74,add=(geo,x,y,rz=0,z=zf)=>{const m=new THREE.Mesh(geo,fm);m.position.set(x,y,z);m.rotation.z=rz;face.add(m);return m};
  const arc=(r,len)=>new THREE.TorusGeometry(r,.028,5,10,len);
  const brow=(x,y,rz)=>add(new THREE.BoxGeometry(.24,.05,.04),x,y,rz,zf-.02);
  const eyeLine=(x,y)=>add(new THREE.BoxGeometry(.13,.04,.04),x,y,0,zf);
  const eyeDot=(x,y)=>add(new THREE.BoxGeometry(.05,.1,.04),x,y,0,zf);
  const nose=new THREE.Mesh(new THREE.BoxGeometry(.09,.11,.1),g.userData.noseM);nose.position.set(0,-.11,.745);face.add(nose);
  for(const s of[-1,1]){const b=new THREE.Mesh(new THREE.CircleGeometry(.11,10),g.userData.blushM);b.position.set(s*.47,-.2,.6);b.rotation.y=s*.6;face.add(b)}
  for(const s of[-1,1]){
    const x=s*.3;
    if(kind==='smile'){ const a=add(arc(.1,Math.PI),x,-.08,0); a.position.z=zf-.03; brow(x,.08,s*-.06) }
    else if(kind==='sleep'){ const a=add(arc(.1,Math.PI),x,-.04,Math.PI); a.position.z=zf-.03 }
    else if(kind==='annoyed'){ eyeLine(x,-.1); brow(x,.03,s*.28) }
    else { eyeDot(x,-.08); brow(x,.07,s*-.04+(s>0?.12:0)) }
  }
  if(kind==='smile'){ add(arc(.14,Math.PI),0,-.2,Math.PI,zf-.04) }
  else if(kind==='smirk'){ add(new THREE.BoxGeometry(.2,.04,.04),.04,-.3,.12) }
  else if(kind==='annoyed'){ add(new THREE.BoxGeometry(.18,.035,.04),0,-.32,0) }
  else if(kind==='sleep'){ add(new THREE.BoxGeometry(.1,.04,.04),0,-.32,0) }
}
