import { Game } from './engine.mjs';
import { Renderer } from './renderer.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#game-canvas'),renderer=new Renderer(canvas),scoreEl=$('#score');
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('sidestep:'+key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem('sidestep:'+key,JSON.stringify(value));}catch{/* Private browsing can disable storage. */}};
let difficulty=read('difficulty','medium');if(!['easy','medium','hardcore'].includes(difficulty))difficulty='medium';
let state='menu',best=read('bests',{}),sound=read('sound',true),haptics=read('haptics',true),audio=null;
let pointer=null,lastPointerX=0,keys=new Set(),lastTime=0,accumulator=0,visualTime=0,countdownTime=0,runBest=0;
let displayedScore=-1,helpPaused=false;

function audioUnlock(){
  if(!sound)return;
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audio??=new AC();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{/* Audio is optional. */}
}
function tone(type){
  if(!sound||!audio||audio.state!=='running')return;
  const now=audio.currentTime;
  const notes=type==='gap'?[660,880,1320]:type==='start'?[440,660]:[220,146];
  notes.forEach((frequency,i)=>{const start=now+i*.045,osc=audio.createOscillator(),gain=audio.createGain();osc.type=type==='collision'?'sine':'triangle';osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+.006);gain.gain.exponentialRampToValueAtTime(.0001,start+.19);osc.connect(gain);gain.connect(audio.destination);osc.start(start);osc.stop(start+.2);osc.onended=()=>{osc.disconnect();gain.disconnect();};});
}
function vibrate(){if(haptics&&typeof navigator.vibrate==='function')try{navigator.vibrate(20);}catch{/* Unsupported on some browsers. */}}
function format(n){return Math.floor(n).toString().padStart(4,'0');}
function syncBest(){const value=Number(best[difficulty])||0;$('#best-score').textContent=format(value);$('#sidebar-best').textContent=format(value);}
function setState(next){state=next;document.body.dataset.state=next;$('#pause-overlay').hidden=next!=='paused';$('#over-overlay').hidden=next!=='over';$('#countdown').hidden=next!=='countdown';$('#pause-button').disabled=next!=='playing';$('#start-button').disabled=next==='playing'||next==='paused'||next==='countdown';$('#start-button span').textContent=next==='playing'||next==='paused'?'RUN IN PROGRESS':'LET’S PLAY';$$('.difficulty').forEach(b=>b.disabled=next!=='menu'&&next!=='over');}
function setDifficulty(value){difficulty=value;save('difficulty',value);$$('.difficulty').forEach(b=>{const selected=b.dataset.difficulty===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});$('#mode-label').textContent=value.toUpperCase();syncBest();}
function updateToggles(){
  $$('.sound-toggle').forEach(b=>{b.setAttribute('aria-pressed',String(sound));b.setAttribute('aria-label',`Turn sound ${sound?'off':'on'}`);b.querySelector('use').setAttribute('href',sound?'#i-sound':'#i-mute');});
  $$('.haptic-toggle').forEach(b=>{b.setAttribute('aria-pressed',String(haptics));b.setAttribute('aria-label',`Turn haptics ${haptics?'off':'on'}`);});
}
function clearInput(){pointer=null;keys.clear();game.keyboard=0;game.release();}
const game=new Game({onEvent:event=>{
  if(event.type==='gap'){
    renderer.burst(event.x,event.z);tone('gap');vibrate();scoreEl.classList.remove('score-pop');void scoreEl.offsetWidth;scoreEl.classList.add('score-pop');$('#announcer').textContent=`Gap cleared. Plus 50. ${game.gaps} gaps.`;
  }else if(event.type==='collision'){
    renderer.burst(event.x,0,'collision');tone('collision');endRun();
  }
}});
function startRun(){
  audioUnlock();game.reset(difficulty);renderer.clearEffects();clearInput();runBest=Number(best[difficulty])||0;displayedScore=-1;
  $('#gesture-hint').style.opacity='1';countdownTime=1.5;$('#countdown').textContent='READY';setState('countdown');
  accumulator=0;canvas.focus({preventScroll:true});
}
function endRun(){
  clearInput();setState('over');
  const record=game.score>runBest;if(record){best[difficulty]=game.score;save('bests',best);}
  $('#final-score').textContent=game.score.toLocaleString();$('#final-distance').textContent=Math.floor(game.distance).toLocaleString();$('#final-gaps').textContent=game.gaps;
  $('#result-eyebrow').textContent=record?'A NEW PERSONAL BEST.':'GOOD RUN. GO AGAIN.';
  syncBest();$('#announcer').textContent=`Run over. ${game.score} points, ${Math.floor(game.distance)} yards, ${game.gaps} gaps cleared.`;
  $('#retry-button').focus({preventScroll:true});
}
function pause(){if(state!=='playing'&&state!=='countdown')return;clearInput();setState('paused');$('#resume-button').focus({preventScroll:true});}
function resume(){if(state!=='paused')return;audioUnlock();clearInput();accumulator=0;setState('playing');canvas.focus({preventScroll:true});}
function menu(){clearInput();game.reset(difficulty);renderer.clearEffects();setState('menu');displayedScore=-1;$('#start-button').focus({preventScroll:true});}

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
  pointer=e.pointerId;lastPointerX=e.clientX;game.player.target=game.player.x;game.dragging=true;
  try{canvas.setPointerCapture(e.pointerId);}catch{/* Window listeners still provide dragging. */}
  $('#gesture-hint').style.opacity='0';audioUnlock();e.preventDefault();
},{passive:false});
window.addEventListener('pointermove',e=>{
  if(state!=='playing'||e.pointerId!==pointer)return;
  // Use the same relative sensitivity at every screen size.
  const dx=e.clientX-lastPointerX;lastPointerX=e.clientX;game.steer(dx/renderer.w*11.7*.95);e.preventDefault();
},{passive:false});
function releasePointer(e){if(e.pointerId!==pointer)return;pointer=null;game.release();}
window.addEventListener('pointerup',releasePointer);window.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);
window.addEventListener('keydown',e=>{
  if($('#help-dialog').open)return;
  if((e.code==='Space'||e.code==='Escape')&&!e.repeat&&(state==='playing'||state==='countdown'||state==='paused')){e.preventDefault();state==='paused'?resume():pause();return;}
  if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)&&state==='playing'){e.preventDefault();keys.add(e.code);game.keyboard=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));$('#gesture-hint').style.opacity='0';}
});
window.addEventListener('keyup',e=>{keys.delete(e.code);game.keyboard=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);

function demo(time){
  return {distance:time*2.5,player:{x:Math.sin(time*.45)*.65,glow:0},enemies:[
    {x:-2.45+Math.sin(time*.3)*.2,z:18+Math.sin(time*.35)*3},
    {x:2.1,z:11+Math.sin(time*.35+.7)*3},{x:.7,z:38+Math.sin(time*.35+1)*3},
    {x:-2.9,z:45+Math.sin(time*.35+2)*3},{x:3.4,z:53+Math.sin(time*.35+3)*3}],warnings:[]};
}
function frame(timestamp){
  const dt=Math.min((timestamp-(lastTime||timestamp))/1000,.05);lastTime=timestamp;visualTime+=dt;
  if(state==='countdown'){
    countdownTime-=dt;$('#countdown').textContent=countdownTime>1?'READY':countdownTime>.5?'SET':'GO';
    if(countdownTime<=0){setState('playing');tone('start');}
  }
  if(state==='playing'){
    accumulator+=dt;
    while(accumulator>=1/120&&state==='playing'){game.update(1/120);accumulator-=1/120;}
    const text=game.score<500?'FIND YOUR RHYTHM':game.score<2000?'THE PRESSURE IS ON':game.score<4000?'KEEP YOUR HEAD UP':'ALL INSTINCT';$('#pace-badge').lastChild.textContent=' '+text;
    if(game.time>6)$('#gesture-hint').style.opacity='0';
  }
  if(displayedScore!==game.score){scoreEl.textContent=format(game.score);displayedScore=game.score;}
  renderer.draw(state==='menu'?demo(visualTime):game,visualTime,dt,{demo:state==='menu'});
  requestAnimationFrame(frame);
}
setDifficulty(difficulty);updateToggles();setState('menu');requestAnimationFrame(frame);
