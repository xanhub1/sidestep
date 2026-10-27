import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, tuning, FIELD, VIEW, viewportBounds, sweptHit } from '../dist/engine.mjs';
const rng=(seed=42)=>()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
const step=(game,seconds)=>{for(let i=0;i<Math.round(seconds*120)&&game.alive;i++)game.update(1/120);};
const quiet=()=>{const g=new Game({random:rng()});g.nextWave=999;return g;};
function defender(x,z,vx=0,vz=-4,id='test'){
  return {id,wave:999,x,z,vx,vz,speed:Math.hypot(vx,vz),tangent:{x:1,z:0},attackOffset:0,anticipation:0,pattern:'pursuit',mode:'charge',chargeVX:vx,chargeVZ:vz,age:0,chargeAge:0,active:true,retired:false};
}
function pairGame(angle=0){
  const g=quiet(),tx=Math.cos(angle),tz=Math.sin(angle),nx=-tz,nz=tx;
  const enemies=[-1.5,1.5].map((offset,i)=>defender(nx*2+tx*offset,nz*2+tz*offset,-nx*4,-nz*4,`test-${i}`));
  g.enemies=enemies;g.waves=[{id:999,enemies,pairs:[{left:enemies[0],right:enemies[1],previous:null,candidate:null,done:false}]}];return g;
}

test('relative swipes accelerate on both axes without teleporting',()=>{
  const g=quiet();g.steer(3,4);g.update(1/120);assert(g.player.x>0&&g.player.z>0);assert(Math.hypot(g.player.x,g.player.z)<.01);
  step(g,.2);assert(g.player.vx>1&&g.player.vz>1);assert(g.player.x<g.player.targetX&&g.player.z<g.player.targetZ);
});
test('reversals preserve momentum briefly and release damps both velocities',()=>{
  const g=quiet();g.steer(4,4);step(g,.25);g.steer(-8,-8);g.update(1/120);assert(g.player.vx>0&&g.player.vz>0);
  step(g,.4);assert(g.player.vx<0&&g.player.vz<0);g.release();const speed=Math.hypot(g.player.vx,g.player.vz);step(g,.5);assert(Math.hypot(g.player.vx,g.player.vz)<speed*.04);
});
test('all four sides of the pitch are reachable and keep the player in bounds',()=>{
  const g=quiet();for(const k of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){
    g.keyboard=k;step(g,10);const p=g.player,b=g.bounds;assert(p.x>=b.minX&&p.x<=b.maxX);assert(p.z>=b.minZ&&p.z<=b.maxZ);
    if(k.x)assert.equal(p.x,k.x>0?b.maxX:b.minX);if(k.z)assert.equal(p.z,k.z>0?b.maxZ:b.minZ);
  }
});
test('diagonal movement has the same maximum speed as straight movement',()=>{
  const g=quiet();g.keyboard={x:1,z:1};step(g,.7);assert(Math.hypot(g.player.vx,g.player.vz)<=FIELD.maxSpeed+1e-9);assert(Math.hypot(g.player.vx,g.player.vz)>FIELD.maxSpeed*.95);
});
test('viewport changes keep the entire vertical play area available',()=>{
  const g=quiet();for(const [w,h] of [[390,844],[360,640],[480,854]]){g.setViewport(w,h);assert.deepEqual(g.bounds,viewportBounds(w,h));assert(g.bounds.minZ<0&&g.bounds.maxZ>0);g.steer(100,100);assert.equal(g.player.targetX,g.bounds.maxX);assert.equal(g.player.targetZ,g.bounds.maxZ);}
});
test('one clean gap awards exactly +50 after clearing both defenders',()=>{
  const g=pairGame();step(g,.4);assert.equal(g.bonus,0);step(g,.4);assert.equal(g.bonus,50);assert.equal(g.gaps,1);step(g,1);assert.equal(g.bonus,50);assert.equal(g.score,Math.floor(g.distance*4)+50);
});
test('gap bonuses work for vertical, diagonal and reverse-direction approaches',()=>{
  for(const angle of [Math.PI/2,Math.PI/4,Math.PI,Math.PI*1.4,Math.PI*1.75]){const g=pairGame(angle);step(g,1);assert(g.alive);assert.equal(g.bonus,50,`angle ${angle}`);}
});
test('the player can earn a gap by crossing between stationary defenders',()=>{
  for(const sign of [-1,1]){const g=pairGame();for(const e of g.enemies){e.z=0;e.vx=e.vz=e.chargeVX=e.chargeVZ=0;}g.player.z=-sign*3;g.keyboard={x:0,z:sign};step(g,1);assert(g.alive);assert.equal(g.bonus,50);}
});
test('one defender and passing beside a pair never earn a bonus',()=>{
  const single=quiet();single.enemies=[defender(-1.5,2)];step(single,1);assert.equal(single.bonus,0);
  const beside=pairGame();beside.player.x=4.5;step(beside,1);assert(beside.alive);assert.equal(beside.bonus,0);
});
test('slipping into an already passed gap cannot earn a late bonus',()=>{
  const g=pairGame();g.player.x=4.5;step(g,.6);g.player.x=0;step(g,.5);assert.equal(g.bonus,0);
});
test('turning back before clearing a gap does not earn a bonus',()=>{
  const g=pairGame();for(const e of g.enemies){e.z=0;e.vx=e.vz=e.chargeVX=e.chargeVZ=0;}
  for(const z of [-2,-1,-.8,-.4,.1,.3,0,-.5,-1,-2]){g.player.z=z;g.updateGaps();}assert.equal(g.bonus,0);
});
test('one collision freezes the score, including a side-on attack',()=>{
  const g=quiet();g.enemies=[defender(2,0,-4,0)];step(g,1);assert(!g.alive);assert(g.events.some(e=>e.type==='collision'));const score=g.score;step(g,10);assert.equal(g.score,score);
  assert(sweptHit(-2,0,2,0,.8));assert(sweptHit(2,2,-2,-2,.8));assert(!sweptHit(-2,2,2,2,.8));
});
test('difficulty changes real speed, count, frequency, aggression, and gaps',()=>{
  for(const score of [0,500,2000,7000]){const e=tuning(score,'easy'),m=tuning(score,'medium'),h=tuning(score,'hardcore');assert(e.speed<m.speed&&m.speed<h.speed);assert(e.count<=m.count&&m.count<h.count);assert(e.interval>m.interval&&m.interval>h.interval);assert(e.aggression<m.aggression&&m.aggression<h.aggression);assert(e.gap>m.gap&&m.gap>h.gap);}
});
test('progression is continuous and capped below the player movement speed',()=>{
  for(const mode of ['easy','medium','hardcore']){let previous=tuning(0,mode);
    for(let score=1;score<25000;score+=17){const current=tuning(score,mode);assert(current.speed>=previous.speed);assert(current.count>=previous.count);assert(current.speed<=4.8&&current.speed<FIELD.maxSpeed);assert(current.count<=8);assert(current.interval>=1.65);assert(current.gap>=2.05);assert(Math.abs(current.speed-previous.speed)<.1);previous=current;}
    for(const score of [500,1000,2000,4000,7000])assert(Math.abs(tuning(score+.01,mode).count-tuning(score-.01,mode).count)<.001);
  }
});
test('random waves use every edge, with varied positions and open space opposite',()=>{
  const g=new Game({random:rng(275)}),edges=new Set(),positions=new Set();
  for(let i=0;i<400;i++){g.score=i*30;g.planWave();const wave=g.waves.at(-1);edges.add(wave.edge);positions.add(wave.enemies[0].x.toFixed(2)+':'+wave.enemies[0].z.toFixed(2));assert(wave.enemies.every(e=>e.edge===wave.edge));assert(wave.enemies.every(e=>Math.hypot(e.x-g.player.x,e.z-g.player.z)>1.8));g.waves=[];g.warnings=[];}
  assert.deepEqual([...edges].sort(),['east','north','south','west']);assert(positions.size>200);
});
test('entries remain outside the visible pitch and cannot spawn on the player',()=>{
  const g=new Game({random:rng(72)});
  for(const [w,h] of [[390,844],[360,640],[480,854]]){g.setViewport(w,h);for(let i=0;i<200;i++){
    const b=g.bounds;g.player.x=i%2?b.minX:b.maxX;g.player.z=i%3?b.minZ:b.maxZ;g.score=i*100;g.planWave();
    for(const e of g.waves.at(-1).enemies){const x=w/2+e.x*w/VIEW.width,y=h*VIEW.anchor-e.z*w/VIEW.width*VIEW.verticalScale;assert(x<0||x>w||y<0||y>h);assert(Math.hypot(e.x-g.player.x,e.z-g.player.z)>1.8);}
    g.waves=[];g.warnings=[];
  }}
});
test('active and pending enemy counts respect difficulty capacity',()=>{
  for(const mode of ['easy','medium','hardcore']){const g=new Game({random:rng(8)});g.reset(mode);g.score=15000;for(let i=0;i<100;i++)g.planWave();assert(g.warnings.length<=tuning(g.score,mode).capacity);assert(g.warnings.length>0);}
});
test('each warning lasts 0.9 seconds and disappears at its own arrival',()=>{
  const g=quiet();g.planWave();const count=g.warnings.length;step(g,.85);assert.equal(g.enemies.length,0);assert(g.warnings.every(w=>w.visible));step(g,.06);assert(g.enemies.length>=1);assert.equal(g.enemies.length+g.warnings.length,count);step(g,.6);assert.equal(g.warnings.length,0);assert.equal(g.enemies.length,count);
});
test('resizing moves pending entries to the new edges and renews their warning',()=>{
  const g=quiet();g.planWave();step(g,.5);g.setViewport(360,640);for(const w of g.warnings){assert.equal(w.remaining,.9);assert.deepEqual({x:w.enemy.x,z:w.enemy.z},g.edgePosition(w.enemy.edge,w.enemy.spawnTangent));}
});
test('defenders accelerate and turn smoothly, then commit to a dodgeable tackle',()=>{
  const g=quiet();g.player.x=0;g.player.z=0;const e=defender(-6,3,0,0);e.mode='approach';e.speed=4;e.pattern='intercept';e.anticipation=.5;
  for(let i=0;i<180&&e.mode==='approach';i++){const old={x:e.x,z:e.z,vx:e.vx,vz:e.vz};g.updateEnemy(e,1/120);assert(Math.hypot(e.x-old.x,e.z-old.z)<=e.speed/120+1e-6);assert(Math.hypot(e.vx-old.vx,e.vz-old.vz)<=9/120+1e-6);}
  assert.equal(e.mode,'charge');const direction=[e.chargeVX,e.chargeVZ];g.player.x=-6;g.player.z=-10;for(let i=0;i<120;i++)g.updateEnemy(e,1/120);assert.deepEqual([e.chargeVX,e.chargeVZ],direction);assert(e.x>-4);
});
test('missed defenders retire instead of accumulating forever',()=>{
  const g=quiet(),e=defender(2,2,0,2);for(let i=0;i<500;i++)g.updateEnemy(e,1/120);assert(e.retired);
});
test('standing still remains unsafe even when higher-score groups contain many defenders',()=>{
  for(const mode of ['easy','medium','hardcore'])for(const initialScore of [0,5000])for(let seed=1;seed<=12;seed++){
    const g=new Game({random:rng(seed*891)});g.reset(mode);g.distance=initialScore/4;g.score=initialScore;step(g,60);
    assert(!g.alive,`${mode}, score ${initialScore}, seed ${seed}: defenders must attempt actual tackles`);
  }
});
