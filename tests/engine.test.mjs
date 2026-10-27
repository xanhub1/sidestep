import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, tuning, FIELD, sweptHit } from '../dist/engine.mjs';

const rng=(seed=42)=>()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
const step=(game,seconds)=>{for(let i=0;i<Math.round(seconds*120)&&game.alive;i++)game.update(1/120);};
const quiet=()=>{const game=new Game({random:rng()});game.nextWave=999;return game;};
function pairGame(xs=[-1.3,1.3],z=2){
  const g=quiet();const enemies=xs.map((x,i)=>({id:`1-${i}`,wave:1,x,z,vx:0,speed:5,minX:x,maxX:x,home:x,phase:0,aggression:0,side:false,age:0}));
  g.enemies=enemies;g.waves=[{id:1,enemies,pairs:enemies.length===2?[{left:enemies[0],right:enemies[1],started:false,valid:true,done:false}]:[]}];return g;
}

test('steering accelerates, reverses with momentum, and releases with friction',()=>{
  const g=quiet();g.steer(3);const initial=g.player.x;g.update(1/120);
  assert(g.player.x-initial<.01,'first input must never teleport');assert(g.player.vx>0);
  step(g,.15);assert(g.player.vx>2);g.steer(-6);g.update(1/120);assert(g.player.vx>0,'reversal must initially preserve momentum');
  step(g,.3);assert(g.player.vx<0);g.release();const velocity=Math.abs(g.player.vx);step(g,.5);assert(Math.abs(g.player.vx)<velocity*.04);
});
test('player stays inside field under sustained keyboard input',()=>{
  const g=quiet();g.keyboard=1;step(g,10);assert(g.player.x<=FIELD.halfWidth-FIELD.playerRadius);assert.equal(g.player.vx,0);
  g.keyboard=-1;step(g,10);assert(g.player.x>=-FIELD.halfWidth+FIELD.playerRadius);
});
test('one clean gap awards exactly +50, once, after both defenders clear',()=>{
  const g=pairGame();step(g,.4);assert.equal(g.bonus,0);step(g,.3);assert.equal(g.bonus,50);assert.equal(g.gaps,1);
  step(g,2);assert.equal(g.bonus,50);assert.equal(g.score,Math.floor(g.distance*4)+50);
});
test('a single defender never awards a gap bonus',()=>{
  const g=pairGame([-1.4]);step(g,2);assert(g.alive);assert.equal(g.bonus,0);
});
test('passing beside two defenders never awards a gap bonus',()=>{
  const g=pairGame([-3,-1.5]);step(g,2);assert(g.alive);assert.equal(g.bonus,0);
});
test('entering a gap after the first defender passed does not earn a bonus',()=>{
  const g=pairGame();g.enemies[0].z=.5;g.enemies[1].z=2;g.player.x=2.5;g.update(1/120);g.player.x=0;step(g,1);assert.equal(g.bonus,0);
});
test('one collision ends the run and freezes scoring',()=>{
  const g=pairGame([0],1);step(g,1);assert.equal(g.alive,false);assert(g.events.some(e=>e.type==='collision'));const s=g.score;step(g,10);assert.equal(g.score,s);
});
test('swept collisions catch fast enemies between frames',()=>{
  assert(sweptHit(0,2,0,-2,.63));assert(!sweptHit(2,2,2,-2,.63));
});
test('difficulty changes speed, count, frequency, aggression and route width',()=>{
  for(const score of [0,500,2000,7000]){
    const e=tuning(score,'easy'),m=tuning(score,'medium'),h=tuning(score,'hardcore');
    assert(e.speed<m.speed&&m.speed<h.speed);assert(e.count<=m.count&&m.count<h.count);
    assert(e.interval>m.interval&&m.interval>h.interval);assert(e.aggression<m.aggression&&m.aggression<h.aggression);assert(e.gap>m.gap&&m.gap>h.gap);
  }
});
test('score progression is smooth across thresholds and remains bounded',()=>{
  for(const mode of ['easy','medium','hardcore']){
    let previous=tuning(0,mode);
    for(let score=1;score<=25000;score+=17){
      const current=tuning(score,mode);assert(current.speed>=previous.speed);assert(current.count>=previous.count);
      assert(current.speed<=24);assert(current.count<=8);assert(current.interval>=1.7);assert(current.gap>=1.85);
      assert(Math.abs(current.speed-previous.speed)<.2);previous=current;
    }
    for(const score of [500,1000,2000,4000,7000])assert(Math.abs(tuning(score+.01,mode).count-tuning(score-.01,mode).count)<.001);
  }
});
test('thousands of formations leave a reachable corridor, including later waves',()=>{
  for(const mode of ['easy','medium','hardcore']){
    const g=new Game({random:rng(275)});g.reset(mode);let last=null;
    for(let i=0;i<500;i++){
      g.score=i*40;g.time=i*2.5;g.planWave();const wave=g.waves.at(-1);
      assert(wave.gap>2*(FIELD.enemyRadius+FIELD.playerRadius+.03));
      for(const e of wave.enemies)assert(e.maxX<=wave.safeX-wave.gap/2+1e-9||e.minX>=wave.safeX+wave.gap/2-1e-9,'enemy must not invade open corridor');
      if(last){assert(wave.arrival-last.arrival>=1.6-1e-9);assert(Math.abs(wave.safeX-last.safeX)<=1.45+1e-9,'route shift must respect steering response');}
      last=wave;g.waves=[];g.warnings=[];
    }
  }
});
test('warnings are visible for 0.9 seconds and disappear on enemy arrival',()=>{
  const g=quiet();g.planWave();const count=g.warnings.length;
  assert(count>0);step(g,.01);assert(g.warnings.every(w=>w.visible));assert.equal(g.enemies.length,0);
  step(g,.85);assert.equal(g.enemies.length,0);step(g,.06);assert.equal(g.warnings.length,0);assert.equal(g.enemies.length,count);
});
test('enemy AI preserves the planned corridor while intercepting',()=>{
  for(const mode of ['easy','medium','hardcore']){
    const g=new Game({random:rng(80)});g.reset(mode);g.score=6500;g.planWave();g.nextWave=999;const wave=g.waves[0];
    // Follow the reserved corridor through one entire wave.
    g.player.x=wave.safeX;g.player.target=wave.safeX;
    for(let i=0;i<1200&&g.enemies.every(e=>e.z>-.8);i++){
      g.update(1/120);assert(g.alive,'reserved corridor must be safe');
      for(const e of g.enemies)assert(e.x<=wave.safeX-wave.gap/2+.01||e.x>=wave.safeX+wave.gap/2-.01);
    }
    assert(g.gaps>=1);
  }
});
