import { Game, FIELD, VIEW } from './engine.mjs';
import { Renderer } from './renderer.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#game-canvas'),renderer=new Renderer(canvas),scoreEl=$('#score');
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('sidestep:'+key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem('sidestep:'+key,JSON.stringify(value));}catch{/* Private browsing can disable storage. */}};
let difficulty=read('difficulty','medium');if(!['easy','medium','hardcore'].includes(difficulty))difficulty='medium';
let state='menu',best=read('bests-v2',{}),sound=read('sound',true),haptics=read('haptics',true),audio=null;
let pointer=null,lastPointerX=0,lastPointerY=0,keys=new Set(),lastTime=0,accumulator=0,visualTime=0,countdownTime=0,runBest=0;
let visualScore=0,helpPaused=false,tackleTime=0;

function audioUnlock(){
  if(!sound)return;
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audio??=new AC();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{/* Audio is optional. */}
}
function tone(type){
  if(!sound||!audio||audio.state!=='running')return;
  const now=audio.currentTime;
  const notes=type==='dodge'?[660,880,1320]:type==='touchdown'?[660,880,1100,1320]:type==='start'?[440,660]:[220,146];
  notes.forEach((frequency,i)=>{const start=now+i*.045,osc=audio.createOscillator(),gain=audio.createGain();osc.type=type==='collision'?'sine':'triangle';osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+.006);gain.gain.exponentialRampToValueAtTime(.0001,start+.19);osc.connect(gain);gain.connect(audio.destination);osc.start(start);osc.stop(start+.2);osc.onended=()=>{osc.disconnect();gain.disconnect();};});
}
function vibrate(){if(haptics&&typeof navigator.vibrate==='function')try{navigator.vibrate(20);}catch{/* Unsupported on some browsers. */}}
function format(n){return Math.floor(n).toString();}
function syncBest(){const value=Number(best[difficulty])||0;$('#best-score').textContent=format(value);}
function setState(next){
  state=next;document.body.dataset.state=next;
  $('#pause-overlay').hidden=next!=='paused';$('#over-overlay').hidden=next!=='over';$('#countdown').hidden=next!=='countdown';$('#pause-button').disabled=next!=='playing';
  $('#start-button').disabled=next!=='menu';$('#start-button span').textContent="LET'S PLAY";
  $$('.difficulty').forEach(b=>b.disabled=next!=='menu'&&next!=='over');
}
function setDifficulty(value){difficulty=value;save('difficulty',value);$$('.difficulty').forEach(b=>{const selected=b.dataset.difficulty===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});$('#mode-label').textContent=value.toUpperCase();syncBest();}
function updateToggles(){
  $$('.sound-toggle').forEach(b=>{b.setAttribute('aria-pressed',String(sound));b.setAttribute('aria-label',`Turn sound ${sound?'off':'on'}`);b.querySelector('use').setAttribute('href',sound?'#i-sound':'#i-mute');});
  $$('.haptic-toggle').forEach(b=>{b.setAttribute('aria-pressed',String(haptics));b.setAttribute('aria-label',`Turn haptics ${haptics?'off':'on'}`);});
}
function clearInput(){pointer=null;keys.clear();game.keyboard={x:0,z:0};game.release();}
const game=new Game({onEvent:event=>{
  if(event.type==='dodge'||event.type==='touchdown'){
    renderer.burst(event.x,event.z,event.type);tone(event.type);vibrate();scoreEl.classList.remove('score-pop');void scoreEl.offsetWidth;scoreEl.classList.add('score-pop');
    $('#announcer').textContent=event.type==='dodge'?`Dodge. Plus 50. ${game.dodges} dodges.`:`Touchdown. Plus 500. Field ${game.touchdowns+1}.`;
  }else if(event.type==='collision'){
    renderer.burst(event.x,event.z,'collision');tone('collision');vibrate();clearInput();tackleTime=.85;setState('tackled');
  }
}});
renderer.onResize=(width,height)=>game.setViewport(width,height);
game.setViewport(renderer.w,renderer.h);
function startRun(){
  audioUnlock();game.reset(difficulty);renderer.clearEffects();clearInput();runBest=Number(best[difficulty])||0;visualScore=0;scoreEl.textContent='0';
  $('#gesture-hint').style.opacity='1';countdownTime=.75;$('#countdown').textContent='READY';setState('countdown');
  accumulator=0;canvas.focus({preventScroll:true});
}
function endRun(){
  clearInput();setState('over');
  const record=game.score>runBest;if(record){best[difficulty]=game.score;save('bests-v2',best);}
  $('#final-score').textContent=game.score.toLocaleString();$('#final-dodge-score').textContent=game.dodgeScore.toLocaleString();$('#final-touchdown-score').textContent=game.touchdownScore.toLocaleString();
  $('#final-dodges').textContent=game.dodges;$('#final-touchdowns').textContent=game.touchdowns;
  $('#result-eyebrow').textContent=record?'A NEW PERSONAL BEST.':'GOOD RUN. GO AGAIN.';
  syncBest();$('#announcer').textContent=`Run over. ${game.score} points, ${game.dodges} dodges, ${game.touchdowns} touchdowns.`;
  $('#retry-button').focus({preventScroll:true});
}
function pause(){if(state!=='playing'&&state!=='countdown')return;clearInput();setState('paused');$('#resume-button').focus({preventScroll:true});}
function resume(){if(state!=='paused')return;audioUnlock();clearInput();accumulator=0;setState('playing');canvas.focus({preventScroll:true});}
function menu(){clearInput();game.reset(difficulty);renderer.clearEffects();setState('menu');visualScore=0;scoreEl.textContent='0';$('#start-button').focus({preventScroll:true});}

$$('.difficulty').forEach(b=>b.addEventListener('click',()=>{if(state==='over')menu();setDifficulty(b.dataset.difficulty);}));
$('#start-button').addEventListener('click',startRun);$('#retry-button').addEventListener('click',startRun);
$('#pause-button').addEventListener('click',pause);$('#resume-button').addEventListener('click',resume);$('#quit-button').addEventListener('click',menu);$('#menu-button').addEventListener('click',menu);
$$('.sound-toggle').forEach(b=>b.addEventListener('click',()=>{sound=!sound;save('sound',sound);updateToggles();if(sound){audioUnlock();tone('start');}}));
$$('.haptic-toggle').forEach(b=>b.addEventListener('click',()=>{haptics=!haptics;save('haptics',haptics);updateToggles();if(haptics)vibrate();}));
$('#help-button').addEventListener('click',()=>{helpPaused=state==='playing'||state==='countdown';if(helpPaused)pause();$('#help-dialog').showModal();});
const closeHelp=()=>$('#help-dialog').close();$('#close-help').addEventListener('click',closeHelp);$('#got-it').addEventListener('click',closeHelp);
$('#help-dialog').addEventListener('close',()=>{if(helpPaused){helpPaused=false;resume();}});

// Only deltas affect the target: a touch never moves the player to the finger.
window.addEventListener('pointerdown',e=>{
  if(state!=='playing'||pointer!==null||e.button>0||e.target.closest('button,a,dialog'))return;
  pointer=e.pointerId;lastPointerX=e.clientX;lastPointerY=e.clientY;game.player.targetX=game.player.x;game.player.targetZ=game.player.z;game.dragging=true;
  try{canvas.setPointerCapture(e.pointerId);}catch{/* Window listeners still provide dragging. */}
  $('#gesture-hint').style.opacity='0';audioUnlock();e.preventDefault();
},{passive:false});
window.addEventListener('pointermove',e=>{
  if(state!=='playing'||e.pointerId!==pointer)return;
  // Use the same relative sensitivity at every screen size.
  const dx=e.clientX-lastPointerX,dy=e.clientY-lastPointerY;lastPointerX=e.clientX;lastPointerY=e.clientY;
  game.steer(dx/renderer.unit*.95,-dy/(renderer.unit*VIEW.verticalScale)*.95);e.preventDefault();
},{passive:false});
function releasePointer(e){if(e.pointerId!==pointer)return;pointer=null;game.release();}
window.addEventListener('pointerup',releasePointer);window.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);
const movementKeys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'];
function syncKeys(){game.keyboard={x:Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA')),z:Number(keys.has('ArrowUp')||keys.has('KeyW'))-Number(keys.has('ArrowDown')||keys.has('KeyS'))};}
window.addEventListener('keydown',e=>{
  if($('#help-dialog').open)return;
  if((e.code==='Space'||e.code==='Escape')&&!e.repeat&&(state==='playing'||state==='countdown'||state==='paused')){e.preventDefault();state==='paused'?resume():pause();return;}
  if(movementKeys.includes(e.code)&&state==='playing'){e.preventDefault();keys.add(e.code);syncKeys();$('#gesture-hint').style.opacity='0';}
});
window.addEventListener('keyup',e=>{keys.delete(e.code);syncKeys();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);

function demo(time){
  const z=time*7,x=-2.5+Math.sin(time*.8)*.8;
  return {camera:{x:x+.45,z:z+.5},player:{x,z,glow:0},enemies:[
    {x:x+5,z:z+9},{x:x-3,z:z-4},{x:x+3,z:z-8},{x:x+2,z:z-11},{x:x-4,z:z+16}],warnings:[]};
}
function frame(timestamp){
  const dt=Math.min((timestamp-(lastTime||timestamp))/1000,.05);lastTime=timestamp;visualTime+=dt;
  if(state==='countdown'){
    countdownTime-=dt;$('#countdown').textContent=countdownTime>.35?'READY':'GO';
    if(countdownTime<=0){setState('playing');tone('start');}
  }
  if(state==='playing'){
    accumulator+=dt;
    while(accumulator>=1/120&&state==='playing'){game.update(1/120);accumulator-=1/120;}
    const remaining=Math.max(0,Math.ceil((game.touchdowns*FIELD.stride+FIELD.length-game.player.z)/2));
    $('#pace-badge').lastChild.textContent=` FIELD ${game.touchdowns+1} / ${remaining} YD TO GO`;
    if(game.time>6)$('#gesture-hint').style.opacity='0';
  }
  if(state==='tackled'){tackleTime-=dt;if(tackleTime<=0)endRun();}
  if(state!=='paused')visualScore+=(game.score-visualScore)*(1-Math.exp(-dt/.16));
  if(game.score-visualScore<.5)visualScore=game.score;
  scoreEl.textContent=format(visualScore);
  renderer.draw(state==='menu'?demo(visualTime):game,visualTime,state==='paused'?0:dt,{demo:state==='menu',alpha:state==='playing'?accumulator/(1/120):1});
  requestAnimationFrame(frame);
}
setDifficulty(difficulty);updateToggles();setState('menu');requestAnimationFrame(frame);
