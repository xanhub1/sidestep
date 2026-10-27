import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, tuning, FIELD, VIEW, viewportBounds, sweptHit } from '../dist/engine.mjs';
const rng=(seed=42)=>()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
const step=(game,seconds)=>{for(let i=0;i<Math.round(seconds*120)&&game.alive;i++)game.update(1/120);};
const quiet=()=>{const g=new Game({random:rng()});g.nextRush=999;return g;};
function defender(x,z,vx=0,vz=-4,id='test'){
  return {id,x,z,vx,vz,speed:Math.hypot(vx,vz),tangent:{x:1,z:0},attackOffset:0,anticipation:0,pattern:'pursuit',mode:'charge',chargeVX:vx,chargeVZ:vz,chargeDuration:Infinity,age:0,chargeAge:0,active:true,retired:false,opacity:1};
}
function pairGame(angle=0){
  const g=quiet(),tx=Math.cos(angle),tz=Math.sin(angle),nx=-tz,nz=tx;
  g.enemies=[-1.5,1.5].map((offset,i)=>defender(nx*2+tx*offset,nz*2+tz*offset,-nx*4,-nz*4,`test-${i}`));return g;
}
test('swipes respond immediately and ease to cruising speed within 75ms',()=>{
  const g=quiet();g.steer(3,4);g.update(1/120);assert(g.player.x>0&&g.player.z>0);assert(Math.hypot(g.player.x,g.player.z)<FIELD.maxSpeed/120);
  step(g,8/120);assert(Math.hypot(g.player.vx,g.player.vz)>FIELD.maxSpeed*.94);assert(g.player.x<g.player.targetX&&g.player.z<g.player.targetZ);
});
test('reversals remain responsive and release eases to a stop',()=>{
  const g=quiet();g.steer(5,5);step(g,.08);g.steer(-10,-10);step(g,3/120);assert(g.player.vx<0&&g.player.vz<0);
  const speed=Math.hypot(g.player.vx,g.player.vz);g.release();step(g,.09);assert(Math.hypot(g.player.vx,g.player.vz)<speed*.01);
});
test('small relative swipes settle without overshoot or a delayed rubber-band effect',()=>{
  const g=quiet();g.steer(.3,.25);for(let i=0;i<12;i++){g.update(1/120);assert(g.player.x<=.3+1e-9&&g.player.z<=.25+1e-9);}assert.equal(g.player.x,.3);assert.equal(g.player.z,.25);
});
test('the whole pitch remains reachable and bounded at high movement speed',()=>{
  const g=quiet();for(const k of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){g.keyboard=k;step(g,4);const p=g.player,b=g.bounds;assert(p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ);if(k.x)assert.equal(p.x,k.x>0?b.maxX:b.minX);if(k.z)assert.equal(p.z,k.z>0?b.maxZ:b.minZ);}
});
test('diagonal movement is normalized and keyboard input responds immediately',()=>{
  const g=quiet();g.keyboard={x:1,z:1};step(g,.09);const speed=Math.hypot(g.player.vx,g.player.vz);assert(speed<=FIELD.maxSpeed+1e-9&&speed>FIELD.maxSpeed*.95);
});
test('viewport resizing preserves the available pitch and clamps swipe targets',()=>{
  const g=quiet();for(const [w,h] of [[390,844],[360,640],[480,854]]){g.setViewport(w,h);assert.deepEqual(g.bounds,viewportBounds(w,h));g.steer(100,100);assert.equal(g.player.targetX,g.bounds.maxX);assert.equal(g.player.targetZ,g.bounds.maxZ);}
});
test('independent defenders award exactly +50 after a complete gap pass, once',()=>{
  const g=pairGame();step(g,.3);assert.equal(g.bonus,0);step(g,.5);assert.equal(g.bonus,50);assert.equal(g.gaps,1);step(g,1);assert.equal(g.bonus,50);assert.equal(g.score,Math.floor(g.distance*4)+50);
});
test('gap detection works in vertical, diagonal and reverse directions without formations',()=>{
  for(const angle of [Math.PI/2,Math.PI/4,Math.PI,Math.PI*1.4,Math.PI*1.75]){const g=pairGame(angle);step(g,1);assert(g.alive);assert.equal(g.bonus,50,`angle ${angle}`);}
});
test('a player crossing between stationary defenders earns a gap in both directions',()=>{
  for(const sign of [-1,1]){const g=pairGame();for(const e of g.enemies){e.z=0;e.vx=e.vz=e.chargeVX=e.chargeVZ=0;}g.player.z=-sign*3;g.keyboard={x:0,z:sign};step(g,.5);assert(g.alive);assert.equal(g.bonus,50);}
});
test('single defenders, outside passes and late entries do not award bonuses',()=>{
  const single=quiet();single.enemies=[defender(-1.5,2)];step(single,1);assert.equal(single.bonus,0);
  const beside=pairGame();beside.player.x=4.5;step(beside,1);assert(beside.alive);assert.equal(beside.bonus,0);
  const late=pairGame();late.player.x=4.5;step(late,.6);late.player.x=0;step(late,.5);assert.equal(late.bonus,0);
});
test('turning back before clearance does not award a gap',()=>{
  const g=pairGame();for(const e of g.enemies){e.z=0;e.vx=e.vz=e.chargeVX=e.chargeVZ=0;}
  for(const z of [-2,-1,-.7,-.4,.1,.3,0,-.5,-1,-2]){g.player.z=z;g.updateGaps();}assert.equal(g.bonus,0);
});
test('a third defender blocks the outer pair so one opening cannot award twice',()=>{
  const g=quiet();g.enemies=[-3,0,3].map((x,i)=>defender(x,0,0,0,`block-${i}`));g.player.x=1.5;g.player.z=-3;g.keyboard={x:0,z:1};step(g,.5);assert(g.alive);assert.equal(g.bonus,50);
});
test('swept collisions catch high-speed attacks and freeze scoring',()=>{
  const g=quiet();g.enemies=[defender(2,0,-14,0)];step(g,.3);assert(!g.alive);const score=g.score;step(g,10);assert.equal(g.score,score);
  assert(sweptHit(-2,0,2,0,.71));assert(sweptHit(2,2,-2,-2,.71));assert(!sweptHit(-2,2,2,2,.71));
});
test('pace is moderately reduced while difficulty still changes pressure and speed',()=>{
  const previous={easy:[7.38,16,1.342],medium:[8.446,19,1.1],hardcore:[10.66,23,.858]};
  for(const mode of ['easy','medium','hardcore']){const t=tuning(0,mode),old=previous[mode];assert(t.speed/old[0]>.8&&t.speed/old[0]<.87);assert(t.forward/old[1]>.8&&t.forward/old[1]<.85);assert(t.interval/old[2]>1.15&&t.interval/old[2]<1.22);assert(t.count>=2);}
  for(const score of [0,500,2000,7000]){const e=tuning(score,'easy'),m=tuning(score,'medium'),h=tuning(score,'hardcore');assert(e.speed<m.speed&&m.speed<h.speed);assert(e.count<=m.count&&m.count<h.count);assert(e.interval>m.interval&&m.interval>h.interval);assert(e.aggression<m.aggression&&m.aggression<h.aggression);assert(e.capacity<m.capacity&&m.capacity<h.capacity);}
});
test('speed, numbers and frequency scale smoothly within playable caps',()=>{
  for(const mode of ['easy','medium','hardcore']){let previous=tuning(0,mode);for(let score=1;score<25000;score+=17){const t=tuning(score,mode);assert(t.speed>=previous.speed&&t.count>=previous.count&&t.interval<=previous.interval);assert(t.speed<=12.4&&t.speed<FIELD.maxSpeed);assert(t.count<=8&&t.interval>=.6);assert(Math.abs(t.speed-previous.speed)<.1);previous=t;}for(const score of [500,1000,2000,4000,7000])assert(Math.abs(tuning(score+.01,mode).count-tuning(score-.01,mode).count)<.001);}
});
test('rushes mix edges and scatter attack positions, speeds and timings',()=>{
  const g=new Game({random:rng(275)}),edges=new Set(),positions=new Set();
  for(let i=0;i<200;i++){g.score=i*60;g.planRush();const entries=g.warnings.map(w=>w.enemy);assert(entries.length>=2);assert(new Set(entries.map(e=>e.edge)).size>=2,'a rush must not line up on one edge');assert(new Set(entries.map(e=>e.speed.toFixed(3))).size>1);assert(new Set(g.warnings.map(w=>w.remaining.toFixed(3))).size>1);for(const e of entries){edges.add(e.edge);positions.add(e.x.toFixed(2)+':'+e.z.toFixed(2));}g.warnings=[];}
  assert.deepEqual([...edges].sort(),['east','north','south','west']);assert(positions.size>500);
});
test('spawn trajectories point directly toward the player, not at formation slots',()=>{
  const g=quiet();g.player.x=2.5;g.player.z=-4;g.planRush();for(const w of g.warnings){const e=w.enemy,dx=g.player.x-e.x,dz=g.player.z-e.z,dot=(dx*e.vx+dz*e.vz)/(Math.hypot(dx,dz)*Math.hypot(e.vx,e.vz));assert(dot>.999);assert(Math.abs(e.attackOffset)<=.225);}
});
test('all entries are off-screen and safe even with the player at a corner',()=>{
  const g=new Game({random:rng(72)});for(const [w,h] of [[390,844],[360,640],[480,854]]){g.setViewport(w,h);for(let i=0;i<100;i++){const b=g.bounds;g.player.x=i%2?b.minX:b.maxX;g.player.z=i%3?b.minZ:b.maxZ;g.score=i*100;g.planRush();for(const {enemy:e} of g.warnings){const x=w/2+e.x*w/VIEW.width,y=h*VIEW.anchor-e.z*w/VIEW.width*VIEW.verticalScale;assert(x<0||x>w||y<0||y>h);assert(Math.hypot(e.x-g.player.x,e.z-g.player.z)>1.8);}g.warnings=[];}}
});
test('active and pending attackers respect the capacity in every mode',()=>{
  for(const mode of ['easy','medium','hardcore']){const g=new Game({random:rng(8)});g.reset(mode);g.score=15000;for(let i=0;i<100;i++)g.planRush();assert(g.warnings.length<=tuning(g.score,mode).capacity);assert(g.warnings.length>0);}
});
test('each independent warning lasts 0.7 seconds and disappears on entry',()=>{
  const g=quiet();g.planRush();const count=g.warnings.length;step(g,.65);assert.equal(g.enemies.length,0);step(g,.06);assert(g.enemies.length>=1);assert.equal(g.enemies.length+g.warnings.length,count);step(g,.6);assert.equal(g.warnings.length,0);assert.equal(g.enemies.length,count);
});
test('pending entries move to the new viewport boundary and renew their warnings',()=>{
  const g=quiet();g.planRush();step(g,.3);g.setViewport(360,640);for(const w of g.warnings){assert.equal(w.remaining,.7);const pos=g.spawnPosition(w.enemy.spawnAngle);assert.deepEqual({x:w.enemy.x,z:w.enemy.z},{x:pos.x,z:pos.z});}
});
test('rushers turn smoothly during their approach',()=>{
  const g=quiet(),e=defender(-8,3,0,0);e.mode='approach';e.speed=12;e.pattern='pursuit';e.commitLead=.32;
  for(let i=0;i<180&&e.mode==='approach';i++){const old={x:e.x,z:e.z,vx:e.vx,vz:e.vz};g.updateEnemy(e,1/120);assert(Math.hypot(e.x-old.x,e.z-old.z)<=e.speed/120+1e-6);assert(Math.hypot(e.vx-old.vx,e.vz-old.vz)<=70/120+1e-6);}
  assert.equal(e.mode,'charge');
});
test('a missed lunge returns to pursuit instead of continuing away from the player',()=>{
  const g=quiet(),e=defender(-3,0,8,0);g.player.z=2.5;e.chargeDuration=.16;
  for(let i=0;i<36;i++)g.updateEnemy(e,1/120);
  assert.equal(e.mode,'chase');assert(e.desiredVZ>0);assert(e.vz>0);
});
test('pulling away makes an engaged defender brake and fall behind',()=>{
  const g=quiet(),e=defender(-3,0,8,0);e.mode='approach';e.chargeDuration=.16;g.enemies=[e];g.keyboard={x:1,z:0};step(g,1);
  assert(g.alive);assert.equal(e.mode,'trailing');assert(e.fatigue<.5);assert(Math.hypot(e.vx,e.vz)<e.speed*.6);assert(e.vz<0);assert(e.z<g.player.z);
});
test('a larger escaped distance produces more fatigue and less trailing speed',()=>{
  const g=quiet(),near=defender(0,-3,0,0,'near'),far=defender(0,-12,0,0,'far');
  for(const e of [near,far]){e.speed=8;e.mode='trailing';e.fatigue=1;e.closestDistance=1;for(let i=0;i<120;i++)g.updateEnemy(e,1/120);}
  assert(far.fatigue<near.fatigue);assert(Math.hypot(far.vx,far.vz)<Math.hypot(near.vx,near.vz));assert(near.vz<0&&far.vz<0);
});
test('fresh distant defenders retain their approach speed until the player evades them',()=>{
  const g=quiet(),e=defender(-8,3,0,0);e.speed=8;e.mode='approach';e.fatigue=1;for(let i=0;i<36;i++)g.updateEnemy(e,1/120);
  assert.equal(e.mode,'approach');assert.equal(e.fatigue,1);assert(Math.hypot(e.vx,e.vz)>7);
});
test('trailing defenders decelerate continuously without position jumps',()=>{
  const g=quiet(),e=defender(-1,-3,8,0);e.mode='trailing';e.fatigue=1;e.closestDistance=1;
  for(let i=0;i<100;i++){const old={x:e.x,z:e.z,vx:e.vx,vz:e.vz};g.updateEnemy(e,1/120);assert(Math.hypot(e.vx-old.vx,e.vz-old.vz)<=24/120+1e-6);assert(Math.hypot(e.x-old.x,e.z-old.z)<=e.speed/120+1e-6);}
});
test('missed attackers leave the pitch instead of accumulating forever',()=>{
  const g=quiet(),e=defender(2,2,12,0);for(let i=0;i<1200;i++)g.updateEnemy(e,1/120);assert(e.retired);
});
test('every mode brings an actual tackle within five seconds from the start',()=>{
  for(const mode of ['easy','medium','hardcore'])for(let seed=1;seed<=24;seed++){const g=new Game({random:rng(seed*891)});g.reset(mode);step(g,5);assert(!g.alive,`${mode}, seed ${seed}: early play must be fast and threatening`);}
});
