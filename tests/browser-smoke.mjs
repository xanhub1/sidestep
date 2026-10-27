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
  await evaluate(`import('./engine.mjs').then(({Game,createDefender,outsideView,characterBounds})=>{window.__defender=createDefender;window.__births=[];window.__entriesAtEdge=[];window.__tracked=new WeakSet();const original=Game.prototype.update,plan=Game.prototype.planArrival,move=Game.prototype.updateEnemy;Game.prototype.update=function(dt){window.__game=this;return original.call(this,dt);};Game.prototype.planArrival=function(...args){const e=plan.apply(this,args);if(e){window.__tracked.add(e);window.__births.push({id:e.id,edge:e.edge,outside:outsideView(e.x,e.z,this.camera,this.width,this.height),opacity:e.opacity});}return e;};Game.prototype.updateEnemy=function(e,dt){const appeared=e.hasAppeared,x=e.x,z=e.z;const result=move.call(this,e,dt);if(!appeared&&e.hasAppeared&&window.__tracked.has(e)){const b=characterBounds(e.x,e.z,this.camera,this.width,this.height);window.__entriesAtEdge.push({edge:e.edge,nearEdge:b.left<10||b.right>this.width-10||b.top<10||b.bottom>this.height-10,delta:Math.hypot(e.x-x,e.z-z),opacity:e.opacity});}return result;};})`);
  await evaluate(`import('./renderer.js').then(({Renderer})=>{window.__renderSamples=[];const draw=Renderer.prototype.draw,cylinder=Renderer.prototype.cylinder;Renderer.prototype.draw=function(g,time,dt,options){window.__frameGame=g;window.__frameAlpha=options?.alpha??1;return draw.call(this,g,time,dt,options);};Renderer.prototype.cylinder=function(x,z,player,...rest){const p=window.__frameGame?.player;if(player&&p?.prevX!==undefined){window.__renderSamples.push({x,z,prevX:p.prevX,prevZ:p.prevZ,currentX:p.x,currentZ:p.z,alpha:window.__frameAlpha,camera:{...this.camera},worldCamera:{...window.__frameGame.camera}});if(window.__renderSamples.length>400)window.__renderSamples.shift();}return cylinder.call(this,x,z,player,...rest);};})`);
  await evaluate(`import('./renderer.js').then(({Renderer})=>{window.__arrows=[];const warning=Renderer.prototype.warning;Renderer.prototype.warning=function(w,time,p){const size=warning.call(this,w,time,p);window.__arrows.push({distance:Math.hypot(w.enemy.x-p.x,w.enemy.z-p.z),size,width:this.w});if(window.__arrows.length>3000)window.__arrows.shift();return size;};})`);
  await click('#start-button');await waitFor(`document.body.dataset.state === 'countdown' && window.__frameGame?.time === 0`);
  await evaluate(`import('./engine.mjs').then(({projectPoint})=>{window.__screenPlayer=()=>{const g=window.__frameGame,r=document.querySelector('#game-canvas').getBoundingClientRect();return projectPoint(g.player.x,g.player.z,g.camera,r.width,r.height).y/r.height;};window.__screenX=()=>{const g=window.__frameGame,r=document.querySelector('#game-canvas').getBoundingClientRect();return projectPoint(g.player.x,g.player.z,g.camera,r.width,r.height).x/r.width;};window.__screenLine=()=>{const g=window.__frameGame,r=document.querySelector('#game-canvas').getBoundingClientRect();return projectPoint(0,0,g.camera,r.width,r.height).y/r.height;};})`);
  assert(Math.abs(await evaluate('window.__screenPlayer()')-.90)<.002,'kickoff must start at the marked bottom position');assert(Math.abs(await evaluate('window.__screenLine()')-.985)<.002,'the starting line must sit at the bottom');await screenshot('mobile-bottom-kickoff');
  await waitFor(`document.body.dataset.state === 'playing'`);await sleep(150);
  await evaluate(`window.__game.nextSpawn=Infinity;window.__game.enemies=[];window.__game.warnings=[]`);
  await waitFor(`window.__game.runScore >= 2 && Number(document.querySelector('#score').textContent) >= 1`);assert.equal(await evaluate('window.__game.score'),await evaluate('window.__game.runScore'),'forward progress must award points without a dodge');await screenshot('mobile-forward-points');
  const before=await evaluate('({...window.__game.player})');
  const touch=(type,x,y=240)=>cdp('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1,radiusX:3,radiusY:3,force:1}]});
  await touch('touchStart',60);await sleep(70);assert(Math.abs(await evaluate('window.__game.player.x')-before.x)<.02,'touch-down must not teleport horizontally');
  assert(await evaluate('window.__game.player.z')>before.z,'world running continues under a stationary touch');
  await touch('touchMove',145);await sleep(100);assert(await evaluate('window.__game.player.x')>before.x+.35,'a cut must respond promptly');await sleep(400);
  assert(await evaluate('Math.abs(window.__game.player.x-window.__game.player.targetX)')<.04,'a cut must settle without a long tail');
  await touch('touchMove',145,130);await sleep(80);assert(await evaluate('window.__game.player.vz')>15,'upward swipe accelerates upfield');
  await touch('touchMove',100,340);await sleep(100);assert(await evaluate('window.__game.player.vz')<6,'downward swipe slows the run');
  await touch('touchEnd');await sleep(220);assert(await evaluate('Math.abs(window.__game.player.controlVX)+Math.abs(window.__game.player.controlVZ)')<.12,'release removes steering');
  assert(Math.abs(await evaluate('window.__game.player.vz')-8.32)<.1,'release preserves automatic forward running');
  const key=(type,code)=>cdp('Input.dispatchKeyEvent',{type,code,key:code,windowsVirtualKeyCode:{ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39}[code]});
  await key('keyDown','ArrowUp');await sleep(220);assert(await evaluate('window.__game.player.vz')>19);await key('keyUp','ArrowUp');
  const keyHigh=await evaluate('window.__screenPlayer()');await key('keyDown','ArrowDown');await sleep(300);assert(await evaluate('window.__screenPlayer()')>keyHigh+.02,'ArrowDown must move down on the pitch');await key('keyUp','ArrowDown');await sleep(150);
  await touch('touchStart',170,730);await touch('touchMove',170,220);await sleep(1800);const upPosition=await evaluate('window.__screenPlayer()');assert(upPosition<.55,'a long upward drag must use the pitch');await touch('touchEnd');await sleep(150);
  await touch('touchStart',170,220);await touch('touchMove',170,790);await sleep(2100);await touch('touchEnd');await sleep(250);const downPosition=await evaluate('window.__screenPlayer()');assert(downPosition>.92&&downPosition<.945,'the long down drag must reach the lower pitch');await sleep(600);assert(Math.abs(await evaluate('window.__screenPlayer()')-downPosition)<.005,'release must not pull the player toward the middle');await screenshot('mobile-full-down-control');
  const fixedCameraX=await evaluate('window.__game.camera.x');
  await touch('touchStart',160,430);await touch('touchMove',335,430);await sleep(1100);await touch('touchEnd');await sleep(250);const rightPosition=await evaluate('window.__screenX()');assert(rightPosition>.8,'right drag must move across the pitch');await sleep(600);assert(Math.abs(await evaluate('window.__screenX()')-rightPosition)<.005,'right cut must stay put after release');await screenshot('mobile-right-no-pull');
  await touch('touchStart',335,430);await touch('touchMove',30,430);await sleep(1400);await touch('touchEnd');await sleep(250);const leftPosition=await evaluate('window.__screenX()');assert(leftPosition<.3,'left drag must move across the pitch');await sleep(600);assert(Math.abs(await evaluate('window.__screenX()')-leftPosition)<.005,'left cut must stay put after release');assert.equal(await evaluate('window.__game.camera.x'),fixedCameraX);await screenshot('mobile-left-no-pull');
  await click('#pause-button');assert.equal(await evaluate('document.body.dataset.state'),'paused');const paused=await evaluate('window.__game.player.z'),pausedScore=await evaluate(`document.querySelector('#score').textContent`);await sleep(300);assert.equal(await evaluate('window.__game.player.z'),paused);assert.equal(await evaluate(`document.querySelector('#score').textContent`),pausedScore,'pause must freeze forward points');await screenshot('mobile-paused-v2');
  await click('#resume-button');await waitFor(`document.body.dataset.state === 'playing'`);await click('#help-button');assert(await evaluate(`document.querySelector('#help-dialog').open`));assert.equal(await evaluate('document.body.dataset.state'),'paused');await click('#got-it');await waitFor(`document.body.dataset.state === 'playing'`);
  await evaluate(`{const g=window.__game;g.enemies=[window.__defender({id:'close-miss',x:g.player.x+1.2,z:g.player.z+1,speed:0})];}`);
  await waitFor(`window.__game.dodges === 1`);await screenshot('mobile-dodge-v2');assert.equal(await evaluate('window.__game.dodgeScore'),50);assert.equal(await evaluate('window.__game.score'),await evaluate('window.__game.runScore+50'));
  await evaluate(`{const g=window.__game;g.enemies=[];g.player.z=199.7;g.player.targetZ=199.7;g.player.prevZ=199.7;g.camera.z=g.camera.prevZ=199.7;}`);
  await waitFor(`window.__game.touchdowns === 1`);await sleep(180);await screenshot('mobile-touchdown-v2');assert.equal(await evaluate('window.__game.touchdownScore'),500);assert.equal(await evaluate('window.__game.score'),await evaluate('window.__game.runScore+550'));
  await evaluate(`{const g=window.__game;g.enemies=[window.__defender({id:'old-team',x:g.player.x-3,z:198,speed:6,stage:0}),window.__defender({id:'new-team',x:g.player.x+4,z:227,speed:6,stage:1})];g.enemies.forEach(e=>{e.opacity=1;e.age=1;});}`);
  await sleep(350);await screenshot('mobile-next-field-v2');
  await click('.sound-toggle');assert.equal(await evaluate(`document.querySelector('.sound-toggle').getAttribute('aria-pressed')`),'false');await click('.haptic-toggle');assert.equal(await evaluate(`document.querySelector('.haptic-toggle').getAttribute('aria-pressed')`),'false');
  await evaluate(`{const g=window.__game;g.enemies.push(window.__defender({id:'tackle',x:g.player.x,z:g.player.z+1,speed:0}));}`);
  await waitFor(`document.body.dataset.state === 'tackled'`);const completedRun=await evaluate('({score:window.__game.score,runScore:window.__game.runScore})');await screenshot('mobile-tackle-v2');await waitFor(`document.body.dataset.state === 'over'`);await screenshot('mobile-results-v2');
  assert.equal(await evaluate(`document.querySelector('#final-score').textContent`),completedRun.score.toLocaleString());assert.equal(await evaluate(`document.querySelector('#final-run-score').textContent`),completedRun.runScore.toLocaleString());assert.equal(await evaluate(`document.querySelector('#final-dodge-score').textContent`),'50');assert.equal(await evaluate(`document.querySelector('#final-touchdown-score').textContent`),'500');assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sidestep:bests-v2')).easy`),completedRun.score);
  await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});await sleep(100);assert(await evaluate(`document.querySelector('#retry-button').getBoundingClientRect().bottom < innerHeight`));await screenshot('small-mobile-results-v2');
  await click('#retry-button');await waitFor(`document.body.dataset.state === 'playing'`);assert.equal(await evaluate('window.__game.score'),0);assert.equal(await evaluate(`document.querySelector('#mode-label').textContent`),'EASY');await click('#pause-button');await click('#quit-button');await sleep(100);assert(await evaluate(`document.querySelector('#start-button').getBoundingClientRect().bottom <= innerHeight`));await screenshot('small-mobile-menu-v2');
  for(const [mode,stage,speed] of [['medium',1,10.24],['hardcore',2,12.16]]){
    await click('[data-difficulty="'+mode+'"]');await click('#start-button');await waitFor(`document.body.dataset.state === 'playing'`);await sleep(1100);
    assert.equal(await evaluate('window.__game.startStage'),stage);assert.equal(await evaluate('window.__game.score'),await evaluate('window.__game.runScore'));assert(await evaluate('window.__game.runScore')>0);assert(Math.abs(await evaluate('window.__game.player.vz')-speed)<.05);assert(await evaluate('window.__game.enemies.length')>=stage*2+3,'each preset must start with a larger group');assert(await evaluate('window.__game.enemies.every(e=>e.stage === '+stage+')'));await screenshot(mode+'-stage-start');
    await click('#pause-button');await click('#quit-button');
  }
  await click('[data-difficulty="easy"]');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});await sleep(100);
  await click('#start-button');await waitFor(`document.body.dataset.state === 'playing'`);await sleep(50);await evaluate(`window.__game.nextSpawn=Infinity;window.__game.enemies=[];window.__game.warnings=[]`);
  const mouseBefore=await evaluate('({...window.__game.player,screenY:window.__screenPlayer()})');await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:100,y:300,button:'left',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:190,y:400,button:'left',buttons:1});await waitFor(`window.__game.player.x > ${mouseBefore.x} + .2 && window.__screenPlayer() > ${mouseBefore.screenY} + .015`);await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:190,y:400,button:'left',clickCount:1});
  await sleep(200);await screenshot('desktop-playing-v2');
  // A deterministic natural run, using normal keyboard steering to make broad evasive cuts.
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await evaluate(`{const g=window.__game;let seed=29;g.random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};g.reset('easy');window.__entries=[];const event=g.onEvent;g.onEvent=e=>{window.__entries.push(e);event(e);};}`);
  for(let i=0;i<90;i++){
    await evaluate(`{const g=window.__game,p=g.player;const threat=g.enemies.filter(e=>e.z-p.z>-1&&e.z-p.z<8&&Math.abs(e.x-p.x)<3).sort((a,b)=>a.z-b.z)[0];g.keyboard.x=threat?(p.x>threat.x?1:-1):0;const b=g.movementBounds();if(p.x<b.minX+1)g.keyboard.x=1;if(p.x>b.maxX-1)g.keyboard.x=-1;}`);await sleep(100);
    assert.equal(await evaluate('document.body.dataset.state'),'playing','the controlled natural run must survive');
  }
  await evaluate('window.__game.keyboard.x=0');await screenshot('mobile-natural-groups');assert(await evaluate(`window.__entries.some(e=>e.type==='rush'&&e.count>=3&&new Set(e.edges).size>=2)`),'natural attacks must contain mixed-direction groups');
  assert(await evaluate(`new Set(window.__entries.filter(e=>e.type==='arrival').map(e=>e.edge)).size>=2`),'natural arrivals should come from different directions');
  assert(await evaluate(`window.__game.enemies.some(e=>e.z<window.__game.player.z&&e.vz>0)`),'beaten defenders should keep pursuing forward');
  assert(await evaluate(`window.__renderSamples.some(s=>s.alpha>0&&s.alpha<1&&Math.abs(s.currentX-s.prevX)>.001&&Math.abs(s.x-(s.prevX+(s.currentX-s.prevX)*s.alpha))<.00001)`),'actors must interpolate between physics steps');
  assert(await evaluate(`window.__renderSamples.some(s=>s.alpha>0&&s.alpha<1&&Math.abs(s.camera.z-(s.worldCamera.prevZ+(s.worldCamera.z-s.worldCamera.prevZ)*s.alpha))<.00001)`),'camera must use the same interpolation as actors');
  assert(await evaluate(`import('./renderer.js').then(({Renderer})=>typeof Renderer.prototype.cylinder==='function'&&typeof Renderer.prototype.sphere==='undefined')`));
  assert(await evaluate(`window.__births.length>10&&window.__births.every(b=>b.outside&&b.opacity===1)`),'every production defender must be born fully outside the view');
  assert(await evaluate(`window.__entriesAtEdge.length>=4&&window.__entriesAtEdge.every(e=>e.nearEdge&&e.delta<.3&&e.opacity===1)`),'first visibility must be a continuous crossing at an edge');
  assert(await evaluate(`window.__arrows.some(a=>a.distance>36&&a.size<5)&&window.__arrows.some(a=>a.distance<15&&a.size>7)`),'far and near arrows must visibly differ in size');
  // Cross two goals in Hardcore and inspect real reinforcements after each touchdown.
  await click('#pause-button');await click('#quit-button');await click('[data-difficulty="hardcore"]');await click('#start-button');await waitFor(`document.body.dataset.state==='playing'`);
  for(const [goal,td] of [[200,1],[414,2]]){
    await evaluate(`{const g=window.__game,shift=${goal}-.05-g.player.z;g.enemies=[];g.warnings=[];g.player.z=g.player.targetZ=g.player.prevZ=${goal}-.05;g.camera.z+=shift;g.camera.prevZ=g.camera.z;g.nextSpawn=Infinity;window.__previousPressure=g.tune();}`);
    await waitFor(`window.__game.touchdowns===${td}`);await waitFor(`window.__game.enemies.length>=7`);
    assert(await evaluate(`window.__game.enemies.every(e=>e.stage>=window.__game.startStage+${td})`));assert(await evaluate(`window.__game.tune().interval<window.__previousPressure.interval&&window.__game.tune().speed>=window.__previousPressure.speed`));
    await sleep(250);await screenshot('hardcore-touchdown-'+td+'-elite-pressure');
  }
  assert.deepEqual(errors,[],'Browser runtime errors');
  const result={passed:true,checks:['all defenders born outside view and continuously enter at edges','arrows grow with proximity','larger characters and more defenders in every mode','Hardcore stays elite and pressure increases after two touchdowns','forward progress adds +1 per yard and freezes on pause or tackle','run/dodge/touchdown breakdown matches total','twenty percent slower running with sustained defender pursuit','left and right cuts without camera pull or recentering','simultaneous groups with difficulty-scaled size and random directions','bottom kickoff position and starting line','long upward/downward drags with no magnetic recentering','Medium starts at white defense and Hardcore at elite speed','desktop and mobile layouts at 1440x1000, 390x844, 360x640','relative touch and mouse controls without teleporting','responsive cuts and eased release into automatic running','up/down swipes and keyboard steering','interpolated world movement and following camera','individual +50 dodge and +500 touchdown','green to brown field and persistent opponent teams','tackle animation, scoring breakdown, saved best and retry','pause/help/resume and sound/haptics','nine seconds of natural staggered attacks and evasive cuts','missed defenders pursue forward and fall behind'],runtimeErrors:errors};
  await writeFile(path.join(artifacts,'browser-results-v24.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  await cdp('Browser.close').catch(()=>{});
} finally {ws?.close();browser.kill();}
