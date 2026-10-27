// Local browser QA through Chrome DevTools Protocol; no browser packages needed.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),artifacts=path.join(root,'artifacts');
await mkdir(artifacts,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9222',
  `--user-data-dir=${path.join(artifacts,'chrome-profile')}`,'about:blank'
],{windowsHide:true,stdio:['ignore','ignore','pipe']});
browser.on('error',error=>console.error('Chrome launch:',error.message));
let ws;
try {
  let page;
  for(let i=0;i<50;i++)try{page=await(await fetch('http://127.0.0.1:9222/json/new?http://localhost:4173/',{method:'PUT'})).json();break;}catch{await sleep(100);}
  assert(page?.webSocketDebuggerUrl,'Chrome did not start');
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=({data})=>{const message=JSON.parse(data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p?.reject(new Error(JSON.stringify(message.error))):p?.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);};
  ws.onclose=event=>{for(const item of pending.values())item.reject(new Error('Chrome connection closed: '+event.code+' '+event.reason));};
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error('CDP timeout: '+method));},10000);pending.set(n,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(75);}throw new Error('Timed out: '+expression);};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const screenshot=async name=>{const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
  await cdp('Runtime.enable');await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:'http://localhost:4173/'});await waitFor(`document.querySelector('#game-canvas')?.width > 0`);await evaluate('localStorage.clear()');
  await cdp('Page.navigate',{url:'http://localhost:4173/'});await waitFor(`document.querySelector('#game-canvas')?.width > 0`);await sleep(300);
  assert.equal(await evaluate(`document.title`),'Sidestep — Find your opening');
  assert(await evaluate(`document.documentElement.scrollWidth <= innerWidth`));await screenshot('desktop-menu');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await cdp('Page.navigate',{url:'http://localhost:4173/'});await waitFor(`document.querySelector('#game-canvas')?.width > 0`);await sleep(300);
  assert(await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
  assert(await evaluate(`document.querySelector('#start-button').getBoundingClientRect().bottom < innerHeight`));
  await screenshot('mobile-menu');
  assert.equal(await evaluate('innerWidth'),390,'mobile layout must not widen the viewport');
  await click('[data-difficulty="hardcore"]');assert.equal(await evaluate(`document.querySelector('#mode-label').textContent`),'HARDCORE');
  await click('[data-difficulty="easy"]');
  await evaluate(`import('./engine.mjs').then(({Game})=>{const original=Game.prototype.update;Game.prototype.update=function(dt){const result=original.call(this,dt);window.__run={x:this.player.x,vx:this.player.vx,target:this.player.target,score:this.score,gaps:this.gaps,enemies:this.enemies.length};return result;};})`);
  await click('#start-button');await waitFor(`document.body.dataset.state === 'playing'`);await sleep(200);
  assert(await evaluate(`Number(document.querySelector('#score').textContent)>0`));
  const xBefore=await evaluate('window.__run.x');
  const touch=(type,x)=>cdp('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y:240,id:1,radiusX:3,radiusY:3,force:1}]});
  await touch('touchStart',60);await sleep(70);assert(Math.abs(await evaluate('window.__run.x')-xBefore)<.02,'touch-down teleported the sphere');
  await touch('touchMove',145);await sleep(180);const moved=await evaluate('window.__run');assert(moved.x>xBefore+.1,'relative swipe did not steer');assert(moved.x<moved.target,'momentum smoothing should lag target');
  await touch('touchMove',50);await touch('touchEnd');await sleep(100);await screenshot('mobile-playing');
  await click('#pause-button');assert.equal(await evaluate('document.body.dataset.state'),'paused');const pausedScore=await evaluate(`document.querySelector('#score').textContent`);await sleep(350);assert.equal(await evaluate(`document.querySelector('#score').textContent`),pausedScore);
  await screenshot('mobile-paused');await click('#resume-button');assert.equal(await evaluate('document.body.dataset.state'),'playing');
  await click('#help-button');assert(await evaluate(`document.querySelector('#help-dialog').open`));assert.equal(await evaluate('document.body.dataset.state'),'paused');await click('#got-it');await waitFor(`document.body.dataset.state === 'playing'`);
  await evaluate(`import('./engine.mjs').then(({Game})=>{const previous=Game.prototype.update;Game.prototype.update=function(dt){if(!window.__gapInjected){window.__gapInjected=true;this.player.vx=0;this.player.target=this.player.x;const enemies=[-1.3,1.3].map((offset,i)=>{const x=this.player.x+offset;return {id:'test-gap-'+i,wave:999,x,z:.9,vx:0,speed:5,minX:x,maxX:x,home:x,phase:0,aggression:0,side:false,age:0};});this.enemies.push(...enemies);this.waves.push({id:999,enemies,pairs:[{left:enemies[0],right:enemies[1],started:false,valid:true,done:false}]});}return previous.call(this,dt);};})`);
  await waitFor(`window.__run.gaps === 1`);await screenshot('mobile-gap-bonus');assert(await evaluate(`document.querySelector('#score').classList.contains('score-pop')`));
  await click('.sound-toggle');assert.equal(await evaluate(`document.querySelector('.sound-toggle').getAttribute('aria-pressed')`),'false');
  await click('.haptic-toggle');assert.equal(await evaluate(`document.querySelector('.haptic-toggle').getAttribute('aria-pressed')`),'false');
  // Test game-over and retry through an actual swept collision, using a controlled incoming defender.
  await evaluate(`import('./engine.mjs').then(({Game})=>{const previous=Game.prototype.update;Game.prototype.update=function(dt){if(!window.__hitInjected){window.__hitInjected=true;this.enemies.push({id:'test-hit',wave:0,x:this.player.x,z:.5,vx:0,speed:12,minX:this.player.x,maxX:this.player.x,home:this.player.x,phase:0,aggression:0,side:false,age:0});}return previous.call(this,dt);};})`);
  await waitFor(`document.body.dataset.state === 'over'`);await screenshot('mobile-game-over');
  assert(await evaluate(`Number(document.querySelector('#final-score').textContent)>0`));
  await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});await sleep(100);
  assert(await evaluate(`document.querySelector('#retry-button').getBoundingClientRect().bottom < innerHeight`),'retry must fit on a small phone');await screenshot('small-mobile-game-over');
  await click('#retry-button');await waitFor(`document.body.dataset.state === 'playing'`);assert.equal(await evaluate(`document.querySelector('#mode-label').textContent`),'EASY');
  await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});await click('#pause-button');await click('#quit-button');await sleep(150);
  assert(await evaluate(`document.querySelector('#start-button').getBoundingClientRect().bottom <= innerHeight`));
  assert(await evaluate(`document.querySelector('#start-button').getBoundingClientRect().top > 0`));await screenshot('small-mobile-menu');
  assert.equal(await evaluate('innerWidth'),360,'small mobile layout must not widen the viewport');
  assert.deepEqual(errors,[],'Browser runtime errors');
  const result={passed:true,checks:['desktop and mobile rendering','390×844 and 360×640 layouts','difficulty selection','distance scoring','relative touch steering','momentum lag','pause freezes score','help pauses and resumes','gap bonus and synchronized score animation','sound and haptic toggles','collision game over','retry'],runtimeErrors:errors};
  await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  await cdp('Browser.close').catch(()=>{});
} finally {ws?.close();browser.kill();}
