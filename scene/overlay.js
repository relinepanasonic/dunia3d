import {ease,lerp} from './anim.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const el={kpi:$('kpi'),comment:$('comment'),idcard:$('idcard'),live:$('live'),follow:$('follow'),badge:$('badge'),hook:$('hook'),card:$('card'),census:$('census'),drone:$('drone'),dtitle:$('dtitle'),end:$('end'),cap:$('cap'),hud:$('hud')};
const pop=(age,dur=.28)=>{const k=Math.min(1,Math.max(0,age/dur));const o=1.70158;return k<=0?0:1+(o+1)*Math.pow(k-1,3)+o*Math.pow(k-1,2)};
const show=(e,o,tr='')=>{e.style.opacity=o;if(tr)e.style.transform=tr};

export function chunkWords(words,beats){
  const out=[];let i=0;
  if(beats&&beats.reduce((a,b)=>a+b,0)===words.length){for(const n of beats){out.push(words.slice(i,i+n));i+=n}return out}
  while(i<words.length){const rem=words.length-i;const n=rem===3?3:rem>=4?2:rem;out.push(words.slice(i,i+n));i+=n}
  return out;
}
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');

let capKey='';
export function updateCaption(shot,t){
  const chunks=chunkWords(shot.words,shot.beats);let cur=null,age=0;
  for(let i=0;i<chunks.length;i++){
    const st=chunks[i][0].start,en=i+1<chunks.length?chunks[i+1][0].start:shot.start+shot.speech+.25;
    if(t>=st&&t<en){cur=chunks[i];age=t-st;capKey=shot.id+i;break}
  }
  if(!cur){el.cap.style.opacity=0;return}
  if(el.cap.dataset.k!==capKey){
    el.cap.dataset.k=capKey;
    el.cap.innerHTML=cur.map(w=>`<span class="${norm(w.w)===norm(shot.highlight||'')?'hl':''}">${esc(w.w)}</span>`).join(' ');
  }
  const s=.82+.18*pop(age,.22);
  el.cap.style.opacity=1;el.cap.style.transform=`scale(${s})`;
}

export function updateOverlay(shot,lt,dur,tAbs){
  const o=shot.overlay||{type:'none'},ty=o.type;
  // reset
  for(const k of['kpi','hook','card','census','drone','dtitle','end','comment','idcard','live','follow'])el[k].style.opacity=0;
  el.badge.style.opacity=ty==='hook'&&lt<2.1?0:1;
  if(ty==='hook'&&lt<2.1){
    const a=pop(lt-.05,.35),out=ease((lt-1.7)/.4);
    show(el.hook,Math.min(1,a)*(1-out),`translateX(-50%) scale(${lerp(.6,1,Math.min(1,a))*(1-.15*out)})`);
  }
  if(ty==='card'){
    show(el.card,1);const rows=el.card.querySelectorAll('.row');
    o.rows.forEach((r,i)=>{
      const age=lt-.25-i*.55,row=rows[i];
      row.children[0].textContent=r.label;row.children[1].innerHTML=esc(r.text).replace(/(\b[A-Z]{3,}\b)/g,'<b>$1</b>');
      const a=pop(age,.3);row.style.opacity=Math.min(1,Math.max(0,age*8));row.style.transform=`translateX(${(1-Math.min(1,a))*-80}px) scale(${.9+.1*Math.min(1.1,a)})`;
    });
  }
  if(ty==='census'){
    const a=pop(lt-.15,.3);show(el.census,Math.min(1,a*2),`scale(${.85+.15*Math.min(1.1,a)})`);
    $('cf').textContent=o.followers;$('cp').textContent=lt>1.0?o.pop:Math.max(0,o.pop-1);
    $('cp').style.transform=`scale(${lt>1.0?1+.35*Math.max(0,1-(lt-1.0)*4):1})`;
  }
  if(ty==='kpi'){
    const a=pop(lt-.15,.35),n=x=>Math.round((x||0)*ease(Math.min(1,(lt-.3)/.8)));
    show(el.kpi,Math.min(1,a*2),`scale(${.85+.15*Math.min(1.1,a)})`);
    $('kp').textContent=n(o.followers);$('kj').textContent=n(o.pajak);$('kg').textContent=n(o.pengaruh);$('ki').textContent=n(o.inspirasi);
    $('kgoal').textContent=o.goal?'BANGUN: '+o.goal:'';$('kbar').style.width=Math.round((o.progress||0)*ease(Math.min(1,(lt-.4)/1.0)))+'%';
  }
  if(ty==='comment'){
    const a=pop(lt-.2,.3);show(el.comment,Math.min(1,a*3),`scale(${.8+.2*Math.min(1.1,a)})`);
    el.comment.children[0].textContent='@'+(o.user||'rakyat');el.comment.children[1].textContent=o.text||'';
  }
  if(ty==='idcard'){
    const a=pop(lt-.15,.35);show(el.idcard,Math.min(1,a*2),`scale(${.85+.15*Math.min(1.1,a)})`);
    el.idcard.querySelector('.hd').textContent=o.sub||'';
    const ln=el.idcard.querySelector('.ln');ln.textContent='';
    for(const [k,v] of [['NIK',o.nik],['Nama',o.name],['Status',o.status]]){if(v==null)continue;ln.append(`${k}: ${v}`,document.createElement('br'))}
  }
  if(ty==='live'){const a=pop(lt-.1,.3);show(el.live,Math.min(1,a*3),`scale(${.85+.15*Math.min(1.1,a)})`);el.live.querySelector('.t').textContent='LIVE · '+(o.text||'')}
  if(ty==='follow'){const a=pop(lt-.3,.35),w=1+.04*Math.sin(lt*9);show(el.follow,Math.min(1,a*3),`translateX(-50%) scale(${(.7+.3*Math.min(1.1,a))*w})`);el.follow.textContent=o.text||'+ FOLLOW'}
  if(ty==='drone'){
    show(el.drone,Math.min(1,lt*4));show(el.dtitle,Math.min(1,lt*4));
    const p=lt/dur;el.hud.innerHTML=`ALT ${String(Math.round(lerp(92,45,p))).padStart(3,'0')} m<br>BAT 87%`;
  }
  if(ty==='end'){
    const a=pop(lt-.2,.45);show(el.end,Math.min(1,a*2),`scale(${.6+.4*Math.min(1.08,a)})`);
    el.end.querySelector('.d').textContent=o.big;el.end.querySelector('.u').textContent=o.sub||'';
  }
  updateCaption(shot,tAbs);
}
