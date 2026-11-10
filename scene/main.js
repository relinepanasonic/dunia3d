import '@fontsource/lilita-one/400.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import * as THREE from 'three';
import {makeWorld,flags} from './world.js';
import {makeWorldFuture} from './world_future.js';
import {makeCharacter,setExpression} from './character.js';
import {applyAnim,applyCamera,lerp,ease} from './anim.js';
import {updateOverlay} from './overlay.js';

const THEME=new URLSearchParams(location.search).get('theme')||'classic';
const FUT=THEME==='future';
flags.flat=FUT;
document.getElementById('stage').classList.add(THEME);

const W=1080,H=1920;
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(W,H,false);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=FUT?1.0:1.05;

const PAL={
  classic:{
    day:{bg:0xd5dcb4,fog:0xd9dfb4,hs:0xfff6df,hg:0x8c9650,hi:1.25,sc:0xfff0cf,si:2.6},
    night:{bg:0x101a3c,fog:0x16204a,hs:0x7f92d8,hg:0x2a3a52,hi:1.1,sc:0xaabdff,si:1.5},
    fog:[35,120],fill:0xffc27a},
  future:{
    day:{bg:0x9fdcff,fog:0xbfe8ff,hs:0xeaf7ff,hg:0x7f98b8,hi:1.35,sc:0xffffff,si:2.2},
    night:{bg:0x0b0628,fog:0x1b0f50,hs:0x6d5cff,hg:0x2b2560,hi:1.0,sc:0xb58cff,si:1.3},
    fog:[60,330],fill:0xc9b8ff},
}[THEME];

const scene=new THREE.Scene();
scene.background=new THREE.Color();scene.fog=new THREE.Fog(PAL.day.fog,PAL.fog[0],PAL.fog[1]);
const hemi=new THREE.HemisphereLight(PAL.day.hs,PAL.day.hg,PAL.day.hi);
const sun=new THREE.DirectionalLight(PAL.day.sc,PAL.day.si);sun.position.set(-8,14,10);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:1,far:60});sun.shadow.bias=-.0006;
scene.add(hemi,sun,sun.target);

const world=FUT?makeWorldFuture(scene,{title:'NEGARA GUE'}):makeWorld(scene,{sign:true,chair:true});
const sign=scene.getObjectByName('sign'),chair=scene.getObjectByName('chair');
const man=makeCharacter({expression:'smile',theme:THEME});scene.add(man);

// stars + moon/planet fade in with night
const sg=new THREE.BufferGeometry(),sp=[];
for(let i=0;i<260;i++){const a=i*2.399,r=Math.sqrt(i/260);sp.push(Math.cos(a)*r*140,40+Math.sin(i*1.7)*10+r*30,-70-Math.abs(Math.sin(a*3))*60)}
sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
const starMat=new THREE.PointsMaterial({color:FUT?0xcfe9ff:0xffffff,size:1.2,transparent:true,opacity:0,fog:false});
scene.add(new THREE.Points(sg,starMat));
const moon=new THREE.Mesh(new THREE.SphereGeometry(FUT?4:3,14,10),new THREE.MeshBasicMaterial({color:FUT?0xff9be8:0xfff2c2,fog:false,transparent:true,opacity:0}));
moon.position.set(-9,16,-55);scene.add(moon);
const ring=new THREE.Mesh(new THREE.TorusGeometry(7,.1,4,36),new THREE.MeshBasicMaterial({color:0x7ff2ff,fog:false,transparent:true,opacity:0}));
ring.position.copy(moon.position);ring.rotation.set(1.2,0,.3);ring.visible=FUT;scene.add(ring);

const cam=new THREE.PerspectiveCamera(34,W/H,.1,500);
const fill=new THREE.PointLight(PAL.fill,0,24);scene.add(fill);
const cb=new THREE.Color();
const mix=(out,a,b,k)=>out.set(a).lerp(cb.set(b),k);
function setTime(k){
  const D=PAL.day,N=PAL.night;
  mix(scene.background,D.bg,N.bg,k);mix(scene.fog.color,D.fog,N.fog,k);
  mix(hemi.color,D.hs,N.hs,k);mix(hemi.groundColor,D.hg,N.hg,k);hemi.intensity=lerp(D.hi,N.hi,k);
  mix(sun.color,D.sc,N.sc,k);sun.intensity=lerp(D.si,N.si,k);
  starMat.opacity=Math.max(0,(k-.4)/.6);fill.intensity=k*(FUT?14:40);moon.material.opacity=starMat.opacity;ring.material.opacity=starMat.opacity;
  const cm=world.userData.cloudMat;if(cm){mix(cm.emissive,0xffffff,0x1a2040,k);mix(cm.color,0xffffff,0x6b78b0,k)}
  if(world.userData.onTime)world.userData.onTime(k);
}

let TL=null,VO=null,curShot=null;
window.loadProject=(tl,vo)=>{TL=tl;VO=vo;curShot=null;
  if(world.userData.setBuildings){world.userData.setBuildings(tl.styles&&tl.styles.length?tl.styles:[0,1,2,3,4,5,6,7]);houses=[...Array(16).keys()].map(i=>scene.getObjectByName('house'+i)).filter(Boolean)}
  for(const id of['badge','hook'])document.getElementById(id).textContent='DAY '+tl.day};
let houses=[];const fire=scene.getObjectByName('campfire');

window.renderAt=t=>{
  t=Math.min(Math.max(0,t),VO.total-1/60);
  const i=VO.shots.findIndex(s=>t>=s.start&&t<s.start+s.dur),v=VO.shots[i<0?VO.shots.length-1:i];
  const sh=TL.shots.find(s=>s.id===v.id),lt=t-v.start,p=lt/v.dur;
  if(curShot!==sh.id){curShot=sh.id;setExpression(man,sh.expression)}
  sign.visible=!!sh.state.sign;chair.visible=!!sh.state.chair;houses.forEach((h,i)=>h.visible=i<(sh.state.houses||0));
  fire.visible=!!sh.state.campfire;fire.getObjectByName('firelight').intensity=sh.state.campfire?9+2*Math.sin(t*23)+Math.sin(t*37):0;
  [0,1,2].forEach(i=>fire.getObjectByName('flame'+i).scale.y=1+.25*Math.sin(t*14+i*2));
  setTime(lerp(sh.state.time||0,sh.state.time_to??sh.state.time??0,ease(p)));
  applyAnim(man,sh.anim,lt,p);applyCamera(cam,sh.camera,p);
  const halo=man.getObjectByName('halo');if(halo){halo.rotation.z=t*1.2;halo.position.y=1.12+.04*Math.sin(t*2.4)}
  sun.target.position.copy(man.position);fill.position.set(man.position.x,man.position.y+3,man.position.z+5);sun.position.set(man.position.x-8,14,man.position.z+10);
  updateOverlay({...sh,...v},lt,v.dur,t);
  renderer.render(scene,cam);
};
Promise.all([document.fonts.load('40px "Lilita One"'),document.fonts.load('900 40px "Orbitron"'),document.fonts.load('700 40px "Orbitron"')]).then(()=>document.fonts.ready).then(()=>{window.__ready=true});
