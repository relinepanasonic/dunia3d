import {hgt} from './world.js';

export const ease=t=>{t=Math.min(1,Math.max(0,t));return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2};
export const lerp=(a,b,t)=>a+(b-a)*t;
const bob=(t,f)=>Math.sin(t*f*Math.PI*2);

export const ANIMS=['idle','nod','point','walk','sit','sleep','wave','shrug'];

// t = seconds since shot start, p = shot progress 0..1
export function applyAnim(man,name,t,p){
  const {legs,arms,torso,head}=man.userData;
  man.position.set(0,hgt(0,0),0); man.rotation.set(0,.12,0);
  for(const s of[-1,1]){arms[s].rotation.set(0,0,s*.06);arms[s].position.y=1.05;legs[s].rotation.set(0,0,0)}
  torso.rotation.set(0,0,0);torso.scale.set(1,1,1);
  head.rotation.set(-.03,-.1,.04);head.position.y=2.95;
  const breathe=1+.012*bob(t,.5);torso.scale.y=breathe;

  switch(name){
    case 'idle':
      head.rotation.z+=.04*bob(t,.35);head.rotation.y+=.05*bob(t,.22);
      arms[1].rotation.z+=.03*bob(t,.4);arms[-1].rotation.z-=.03*bob(t,.4);break;
    case 'nod':
      head.rotation.x+=.2*bob(t,1.3);break;
    case 'point':{
      const k=ease(t/.4);arms[1].rotation.x=-1.45*k;arms[1].rotation.z=.12*k+.03*bob(t,2)*k;
      head.rotation.y=-.1+.15*k;head.rotation.z=.05+.03*bob(t,.6);break;}
    case 'walk':{
      const sw=bob(t,1.7);legs[1].rotation.x=sw*.65;legs[-1].rotation.x=-sw*.65;
      arms[1].rotation.x=-sw*.55;arms[-1].rotation.x=sw*.55;
      const x=lerp(0,3,p),z=lerp(0,-9,p),bounce=Math.abs(sw)*.1;
      man.position.set(x,hgt(x,z)+bounce,z);man.rotation.y=Math.atan2(3,-9);
      head.position.y=2.95+bounce*.3;break;}
    case 'sit':
      for(const s of[-1,1])legs[s].rotation.x=-1.5;
      man.position.y-=.55;break;
    case 'sleep':
      head.rotation.x=.3;head.rotation.z=.08;head.position.y=2.85;torso.rotation.x=.12;
      torso.scale.y=1+.025*bob(t,.3);break;
    case 'wave':{
      const k=ease(t/.35);arms[1].rotation.z=lerp(.06,2.55,k)+.3*bob(t,2.4)*k;
      head.rotation.z=.06*k;break;}
    case 'shrug':{
      const k=ease(t/.3);
      for(const s of[-1,1]){arms[s].rotation.z=s*(.06+.55*k);arms[s].position.y=1.05+.12*k}
      head.rotation.z=.1*k;head.position.y=2.95-.07*k;break;}
  }
}

// camera presets: [from, to] of {p:[x,y,z], l:[x,y,z]}
export const CAMERAS={
  wide_push:  [{p:[2,3.6,23],l:[0,1.8,0]},{p:[0.5,3.2,15],l:[0,2.0,0]}],
  medium_push:[{p:[0,2.9,9.4],l:[0,2.65,0]},{p:[0,2.9,7.2],l:[0,2.65,0]}],
  medium_pull:[{p:[0,2.9,6.8],l:[0,2.65,0]},{p:[0,3.0,10.8],l:[0,2.5,0]}],
  close_push: [{p:[0,3.1,7.0],l:[0,2.95,0]},{p:[0,3.05,5.0],l:[0,2.95,0]}],
  drone:      [{p:[0,32,15],l:[0,0,-4]},{p:[2,20,10],l:[2,0,-5]}],
  orbit:      [{p:[-7,3.2,7],l:[0,2.6,0]},{p:[7,3.2,7],l:[0,2.6,0]}],
};
export function applyCamera(cam,name,p){
  const [a,b]=CAMERAS[name],k=ease(p);
  cam.position.set(lerp(a.p[0],b.p[0],k),lerp(a.p[1],b.p[1],k),lerp(a.p[2],b.p[2],k));
  cam.lookAt(lerp(a.l[0],b.l[0],k),lerp(a.l[1],b.l[1],k),lerp(a.l[2],b.l[2],k));
}
