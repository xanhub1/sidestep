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
  assert.match(await evaluate(`document.title`),/^Sidestep . Find your opening$/);
  assert(await evaluate(`document.documentElement.scrollWidth <= innerWidth`));await screenshot('desktop-menu-v2');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await cdp('Page.navigate',{url:'http://localhost:4173/'});await waitFor(`document.querySelector('#game-canvas')?.width > 0`);await sleep(200);
  assert.equal(await evaluate('innerWidth'),390);assert(await evaluate(`document.querySelector('#start-button').getBoundingClientRect().bottom < innerHeight`));await screenshot('mobile-menu-v2');
  await click('[data-difficulty="hardcore"]');assert.equal(await evaluate(`document.querySelector('#mode-label').textContent`),'HARDCORE');await click('[data-difficulty="easy"]');
  await evaluate(`import('./engine.mjs').then(({Game,createDefender})=>{window.__defender=createDefender;const original=Game.prototype.update;Game.prototype.update=function(dt){window.__game=this;return original.call(this,dt);};})`);
  await evaluate(`import('./renderer.js').then(({Renderer})=>{window.__renderSamples=[];const draw=Renderer.prototype.draw,cylinder=Renderer.prototype.cylinder;Renderer.prototype.draw=function(g,time,dt,options){window.__frameGame=g;window.__frameAlpha=options?.alpha??1;return draw.call(this,g,time,dt,options);};Renderer.prototype.cylinder=function(x,z,player,...rest){const p=window.__frameGame?.player;if(player&&p?.prevX!==undefined){window.__renderSamples.push({x,z,prevX:p.prevX,prevZ:p.prevZ,currentX:p.x,currentZ:p.z,alpha:window.__frameAlpha,camera:{...this.camera},worldCamera:{...window.__frameGame.camera}});if(window.__renderSamples.length>400)window.__renderSamples.shift();}return cylinder.call(this,x,z,player,...rest);};})`);
  await click('#start-button');await waitFor(`document.body.dataset.state === 'countdown' && window.__frameGame?.time === 0`);
  await evaluate(`import('./engine.mjs').then(({projectPoint})=>{window.__screenPlayer=()=>{const g=window.__frameGame,r=document.querySelector('#game-canvas').getBoundingClientRect();return projectPoint(g.player.x,g.player.z,g.camera,r.width,r.height).y/r.height;};window.__screenLine=()=>{const g=window.__frameGame,r=document.querySelector('#game-canvas').getBoundingClientRect();return projectPoint(0,0,g.camera,r.width,r.height).y/r.height;};})`);
  assert(Math.abs(await evaluate('window.__screenPlayer()')-.90)<.002,'kickoff must start at the marked bottom position');assert(Math.abs(await evaluate('window.__screenLine()')-.985)<.002,'the starting line must sit at the bottom');await screenshot('mobile-bottom-kickoff');
  await waitFor(`document.body.dataset.state === 'playing'`);await sleep(150);
  assert.equal(await evaluate(`Number(document.querySelector('#score').textContent)`),0,'running alone must not earn points');
  await evaluate(`window.__game.nextSpawn=Infinity;window.__game.enemies=[];window.__game.warnings=[]`);
  const before=await evaluate('({...window.__game.player})');
  const touch=(type,x,y=240)=>cdp('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1,radiusX:3,radiusY:3,force:1}]});
  await touch('touchStart',60);await sleep(70);assert(Math.abs(await evaluate('window.__game.player.x')-before.x)<.02,'touch-down must not teleport horizontally');
  assert(await evaluate('window.__game.player.z')>before.z,'world running continues under a stationary touch');
  await touch('touchMove',145);await sleep(100);assert(await evaluate('window.__game.player.x')>before.x+.35,'a cut must respond promptly');await sleep(400);
  assert(await evaluate('Math.abs(window.__game.player.x-window.__game.player.targetX)')<.04,'a cut must settle without a long tail');
  await touch('touchMove',145,130);await sleep(80);assert(await evaluate('window.__game.player.vz')>15,'upward swipe accelerates upfield');
  await touch('touchMove',100,340);await sleep(100);assert(await evaluate('window.__game.player.vz')<6,'downward swipe slows the run');
  await touch('touchEnd');await sleep(220);assert(await evaluate('Math.abs(window.__game.player.controlVX)+Math.abs(window.__game.player.controlVZ)')<.12,'release removes steering');
  assert(Math.abs(await evaluate('window.__game.player.vz')-10.4)<.1,'release preserves automatic forward running');
  const key=(type,code)=>cdp('Input.dispatchKeyEvent',{type,code,key:code,windowsVirtualKeyCode:{ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39}[code]});
  await key('keyDown','ArrowUp');await sleep(220);assert(await evaluate('window.__game.player.vz')>21);await key('keyUp','ArrowUp');
  const keyHigh=await evaluate('window.__screenPlayer()');await key('keyDown','ArrowDown');await sleep(300);assert(await evaluate('window.__screenPlayer()')>keyHigh+.02,'ArrowDown must move down on the pitch');await key('keyUp','ArrowDown');await sleep(150);
  await touch('touchStart',170,730);await touch('touchMove',170,220);await sleep(1800);const upPosition=await evaluate('window.__screenPlayer()');assert(upPosition<.55,'a long upward drag must use the pitch');await touch('touchEnd');await sleep(150);
  await touch('touchStart',170,220);await touch('touchMove',170,790);await sleep(2100);await touch('touchEnd');await sleep(250);const downPosition=await evaluate('window.__screenPlayer()');assert(downPosition>.92&&downPosition<.945,'the long down drag must reach the lower pitch');await sleep(600);assert(Math.abs(await evaluate('window.__screenPlayer()')-downPosition)<.005,'release must not pull the player toward the middle');await screenshot('mobile-full-down-control');
  await click('#pause-button');assert.equal(await evaluate('document.body.dataset.state'),'paused');const paused=await evaluate('window.__game.player.z');await sleep(300);assert.equal(await evaluate('window.__game.player.z'),paused);await screenshot('mobile-paused-v2');
  await click('#resume-button');await waitFor(`document.body.dataset.state === 'playing'`);await click('#help-button');assert(await evaluate(`document.querySelector('#help-dialog').open`));assert.equal(await evaluate('document.body.dataset.state'),'paused');await click('#got-it');await waitFor(`document.body.dataset.state === 'playing'`);
  await evaluate(`{const g=window.__game;g.enemies=[window.__defender({id:'close-miss',x:g.player.x+1.2,z:g.player.z+1,speed:0})];}`);
  await waitFor(`window.__game.dodges === 1`);await screenshot('mobile-dodge-v2');assert.equal(await evaluate('window.__game.score'),50);
  await evaluate(`{const g=window.__game;g.enemies=[];g.player.z=199.7;g.player.targetZ=199.7;g.player.prevZ=199.7;g.camera.z=g.camera.prevZ=199.7;}`);
  await waitFor(`window.__game.touchdowns === 1`);await sleep(180);await screenshot('mobile-touchdown-v2');assert.equal(await evaluate('window.__game.score'),550);
  await evaluate(`{const g=window.__game;g.enemies=[window.__defender({id:'old-team',x:g.player.x-3,z:198,speed:6,stage:0}),window.__defender({id:'new-team',x:g.player.x+4,z:227,speed:6,stage:1})];g.enemies.forEach(e=>{e.opacity=1;e.age=1;});}`);
  await sleep(350);await screenshot('mobile-next-field-v2');
  await click('.sound-toggle');assert.equal(await evaluate(`document.querySelector('.sound-toggle').getAttribute('aria-pressed')`),'false');await click('.haptic-toggle');assert.equal(await evaluate(`document.querySelector('.haptic-toggle').getAttribute('aria-pressed')`),'false');
  await evaluate(`{const g=window.__game;g.enemies.push(window.__defender({id:'tackle',x:g.player.x,z:g.player.z+1,speed:0}));}`);
  await waitFor(`document.body.dataset.state === 'tackled'`);await screenshot('mobile-tackle-v2');await waitFor(`document.body.dataset.state === 'over'`);await screenshot('mobile-results-v2');
  assert.equal(await evaluate(`document.querySelector('#final-score').textContent`),'550');assert.equal(await evaluate(`document.querySelector('#final-dodge-score').textContent`),'50');assert.equal(await evaluate(`document.querySelector('#final-touchdown-score').textContent`),'500');assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sidestep:bests-v2')).easy`),550);
  await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});await sleep(100);assert(await evaluate(`document.querySelector('#retry-button').getBoundingClientRect().bottom < innerHeight`));await screenshot('small-mobile-results-v2');
  await click('#retry-button');await waitFor(`document.body.dataset.state === 'playing'`);assert.equal(await evaluate('window.__game.score'),0);assert.equal(await evaluate(`document.querySelector('#mode-label').textContent`),'EASY');await click('#pause-button');await click('#quit-button');await sleep(100);assert(await evaluate(`document.querySelector('#start-button').getBoundingClientRect().bottom <= innerHeight`));await screenshot('small-mobile-menu-v2');
  for(const [mode,stage,speed] of [['medium',1,12.8],['hardcore',2,15.2]]){
    await click('[data-difficulty="'+mode+'"]');await click('#start-button');await waitFor(`document.body.dataset.state === 'playing'`);await sleep(1100);
    assert.equal(await evaluate('window.__game.startStage'),stage);assert.equal(await evaluate('window.__game.score'),0);assert(Math.abs(await evaluate('window.__game.player.vz')-speed)<.05);assert(await evaluate('window.__game.enemies.length')>0);assert(await evaluate('window.__game.enemies.every(e=>e.stage === '+stage+')'));await screenshot(mode+'-stage-start');
    await click('#pause-button');await click('#quit-button');
  }
  await click('[data-difficulty="easy"]');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});await sleep(100);
  await click('#start-button');await waitFor(`document.body.dataset.state === 'playing'`);await sleep(50);await evaluate(`window.__game.nextSpawn=Infinity;window.__game.enemies=[];window.__game.warnings=[]`);
  const mouseBefore=await evaluate('({...window.__game.player,screenY:window.__screenPlayer()})');await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:100,y:300,button:'left',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:190,y:400,button:'left',buttons:1});await sleep(100);assert(await evaluate('window.__game.player.x')>mouseBefore.x+.2);assert(await evaluate('window.__screenPlayer()')>mouseBefore.screenY+.015,'mouse drag must move down on screen');await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:190,y:400,button:'left',clickCount:1});
  await sleep(200);await screenshot('desktop-playing-v2');
  // A deterministic natural run, using normal keyboard steering to make broad evasive cuts.
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await evaluate(`{const g=window.__game;let seed=29;g.random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};g.reset('medium');window.__entries=[];const event=g.onEvent;g.onEvent=e=>{window.__entries.push(e);event(e);};}`);
  for(let i=0;i<90;i++){
    await evaluate(`{const g=window.__game,p=g.player;const threat=g.enemies.filter(e=>e.z-p.z>-1&&e.z-p.z<8&&Math.abs(e.x-p.x)<3).sort((a,b)=>a.z-b.z)[0];g.keyboard.x=threat?(p.x>threat.x?1:-1):0;if(p.x<-8)g.keyboard.x=1;if(p.x>8)g.keyboard.x=-1;}`);await sleep(100);
    assert.equal(await evaluate('document.body.dataset.state'),'playing','the controlled natural run must survive');
  }
  await evaluate('window.__game.keyboard.x=0');await screenshot('mobile-natural-pursuit-v2');
  assert(await evaluate(`new Set(window.__entries.filter(e=>e.type==='arrival').map(e=>e.edge)).size>=2`),'natural arrivals should come from different directions');
  assert(await evaluate(`window.__game.enemies.some(e=>e.z<window.__game.player.z&&e.vz>0)`),'beaten defenders should keep pursuing forward');
  assert(await evaluate(`window.__renderSamples.some(s=>s.alpha>0&&s.alpha<1&&Math.abs(s.currentX-s.prevX)>.001&&Math.abs(s.x-(s.prevX+(s.currentX-s.prevX)*s.alpha))<.00001)`),'actors must interpolate between physics steps');
  assert(await evaluate(`window.__renderSamples.some(s=>s.alpha>0&&s.alpha<1&&Math.abs(s.camera.z-(s.worldCamera.prevZ+(s.worldCamera.z-s.worldCamera.prevZ)*s.alpha))<.00001)`),'camera must use the same interpolation as actors');
  assert(await evaluate(`import('./renderer.js').then(({Renderer})=>typeof Renderer.prototype.cylinder==='function'&&typeof Renderer.prototype.sphere==='undefined')`));
  assert.deepEqual(errors,[],'Browser runtime errors');
  const result={passed:true,checks:['bottom kickoff position and starting line','long upward/downward drags with no magnetic recentering','Medium starts at white defense and Hardcore at elite speed','desktop and mobile layouts at 1440x1000, 390x844, 360x640','relative touch and mouse controls without teleporting','responsive cuts and eased release into automatic running','up/down swipes and keyboard steering','interpolated world movement and following camera','individual +50 dodge and +500 touchdown','green to brown field and persistent opponent teams','tackle animation, scoring breakdown, saved best and retry','pause/help/resume and sound/haptics','nine seconds of natural staggered attacks and evasive cuts','missed defenders pursue forward and fall behind'],runtimeErrors:errors};
  await writeFile(path.join(artifacts,'browser-results-v21.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  await cdp('Browser.close').catch(()=>{});
} finally {ws?.close();browser.kill();}
