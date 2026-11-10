// Usage: node render/render.mjs <timeline.json> <outDir> [--still <t>] [--force] [--fps 30]
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args=process.argv.slice(2);
const [tlPath,outDir]=args;
const flag=n=>args.includes(n),val=n=>args[args.indexOf(n)+1];
const fps=flag('--fps')?+val('--fps'):30;
const tl=JSON.parse(fs.readFileSync(tlPath,'utf8'));
const vo=JSON.parse(fs.readFileSync(path.join(outDir,'voice.json'),'utf8'));
const mp4=path.join(outDir,'video.mp4');
if(!flag('--still')&&!flag('--force')&&fs.existsSync(mp4)){console.log('cached',mp4);process.exit(0)}

const srv=await createServer({root:'scene',server:{port:5199},logLevel:'error'});await srv.listen();
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await b.newPage({viewport:{width:1080,height:1920}});
pg.on('pageerror',e=>console.log('[err]',e.message));
await pg.goto('http://localhost:5199/?theme='+(tl.theme||'classic'));await pg.waitForFunction('window.__ready===true',null,{timeout:60000});
await pg.evaluate(([a,c])=>window.loadProject(a,c),[tl,vo]);
const stage=pg.locator('#stage');

if(flag('--still')){
  const t=+val('--still');await pg.evaluate(t=>window.renderAt(t),t);
  const f=path.join(outDir,`still-${t}.png`);await stage.screenshot({path:f});console.log('saved',f);
}else{
  const n=Math.floor(vo.total*fps);
  const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','-','-i',path.join(outDir,'voice.wav'),
    '-c:v','libx264','-pix_fmt','yuv420p','-crf','17','-preset','medium','-r',String(fps),'-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',mp4],{stdio:['pipe','inherit','inherit']});
  const t0=Date.now();
  for(let i=0;i<n;i++){
    await pg.evaluate(t=>window.renderAt(t),i/fps);
    const buf=await stage.screenshot({type:'jpeg',quality:93});
    if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
    if(i%30===0)console.log(`frame ${i}/${n} ${((Date.now()-t0)/1000).toFixed(0)}s`);
  }
  ff.stdin.end();await new Promise(r=>ff.on('close',r));console.log('saved',mp4);
}
await b.close();await srv.close();
