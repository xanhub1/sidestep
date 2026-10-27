export const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export const FIELD={halfWidth:7.1,playerRadius:.38,enemyRadius:.42,maxSpeed:6.6};
export const VIEW={width:15.2,verticalScale:.92,anchor:.44};
export const DIFFICULTIES={
  easy:{speed:.76,count:-.5,interval:1.22,aggression:.65,progression:.6,gap:3.3,forward:6,capacity:10},
  medium:{speed:1,count:0,interval:1,aggression:1,progression:1,gap:2.85,forward:7.5,capacity:16},
  hardcore:{speed:1.28,count:1.1,interval:.8,aggression:1.4,progression:1.5,gap:2.4,forward:9,capacity:22},
};
const lerp=(a,b,t)=>a+(b-a)*t;
const stages=[[0,1.5],[500,2.5],[1000,3.5],[2000,4.5],[4000,5.5],[7000,6.5],[14000,8]];
export function tuning(score,difficulty='medium'){
  const d=DIFFICULTIES[difficulty],p=Math.max(0,score)*d.progression;
  let count=8;
  for(let i=1;i<stages.length;i++)if(p<=stages[i][0]){const a=stages[i-1],b=stages[i];count=lerp(a[1],b[1],(p-a[0])/(b[0]-a[0]));break;}
  const pressure=1-Math.exp(-p/4300);
  return {speed:Math.min(4.8,(2.8+1.15*pressure)*d.speed),count:clamp(count+d.count,1,8),
    interval:Math.max(1.65,(3.25-.9*pressure)*d.interval),aggression:(.28+.32*pressure)*d.aggression,
    gap:Math.max(2.05,d.gap-.3*pressure),forward:d.forward*(1+.15*pressure),capacity:d.capacity,pressure};
}
export function sweptHit(ax,az,bx,bz,radius){
  const dx=bx-ax,dz=bz-az,t=clamp(-(ax*dx+az*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(ax+dx*t,az+dz*t)<radius;
}
export function viewportBounds(width,height){
  const unit=width/VIEW.width*VIEW.verticalScale,margin=FIELD.playerRadius+.1;
  return {minX:-FIELD.halfWidth+margin,maxX:FIELD.halfWidth-margin,
    minZ:(height*VIEW.anchor-height+22)/unit+margin,maxZ:(height*VIEW.anchor-22)/unit-margin};
}
const EDGES=['north','east','south','west'];
const DIRECTIONS={north:{x:0,z:-1},east:{x:-1,z:0},south:{x:0,z:1},west:{x:1,z:0}};
function limited(x,z,max){const length=Math.hypot(x,z);return length>max?{x:x/length*max,z:z/length*max}:{x,z};}

export class Game{
  constructor({random=Math.random,onEvent=()=>{}}={}){this.random=random;this.onEvent=onEvent;this.bounds=viewportBounds(390,693);this.reset('medium');}
  reset(difficulty=this.difficulty){
    this.difficulty=DIFFICULTIES[difficulty]?difficulty:'medium';this.time=0;this.distance=0;this.bonus=0;this.score=0;this.gaps=0;this.alive=true;
    this.player={x:0,z:0,vx:0,vz:0,targetX:0,targetZ:0,glow:0};this.enemies=[];this.warnings=[];this.waves=[];
    this.nextWave=.4;this.waveID=0;this.dragging=false;this.keyboard={x:0,z:0};this.events=[];
  }
  setViewport(width,height){
    this.bounds=viewportBounds(width,height);const p=this.player,b=this.bounds;
    p.x=clamp(p.x,b.minX,b.maxX);p.z=clamp(p.z,b.minZ,b.maxZ);p.targetX=clamp(p.targetX,b.minX,b.maxX);p.targetZ=clamp(p.targetZ,b.minZ,b.maxZ);
    for(const w of this.warnings){const position=this.edgePosition(w.enemy.edge,w.enemy.spawnTangent);w.enemy.x=position.x;w.enemy.z=position.z;w.remaining=w.duration;}
  }
  emit(type,detail={}){const event={type,...detail};this.events.push(event);this.onEvent(event);}
  steer(dx,dz=0){this.dragging=true;const p=this.player,b=this.bounds;p.targetX=clamp(p.targetX+dx,b.minX,b.maxX);p.targetZ=clamp(p.targetZ+dz,b.minZ,b.maxZ);}
  release(){this.dragging=false;this.player.targetX=this.player.x;this.player.targetZ=this.player.z;}
  edgePosition(edge,tangent){
    const b=this.bounds;
    if(edge==='north'||edge==='south')return {x:clamp(tangent,-6.6,6.6),z:edge==='north'?b.maxZ+2:b.minZ-2};
    return {x:edge==='east'?VIEW.width/2+1:-VIEW.width/2-1,z:clamp(tangent,b.minZ+.4,b.maxZ-.4)};
  }
  planWave(){
    const t=tuning(this.score,this.difficulty),budget=t.capacity-this.enemies.length-this.warnings.length;
    if(budget<=0)return;
    const count=Math.min(budget,clamp(Math.floor(t.count)+(this.random()<t.count%1?1:0),1,8));
    const id=++this.waveID,edge=EDGES[Math.min(3,Math.floor(this.random()*4))],dir=DIRECTIONS[edge],tan={x:-dir.z,z:dir.x};
    const offsets=[];
    if(count===1)offsets.push((this.random()-.5)*1.1);
    else{
      const left=Math.floor(count/2),right=count-left;
      for(let i=left-1;i>=0;i--)offsets.push(-t.gap/2-i*1.55);
      for(let i=0;i<right;i++)offsets.push(t.gap/2+i*1.55);
    }
    const lo=Math.min(...offsets),hi=Math.max(...offsets),b=this.bounds;
    const axisMin=edge==='north'||edge==='south'?-6.6:(tan.z>0?b.minZ+.5:-b.maxZ+.5);
    const axisMax=edge==='north'||edge==='south'?6.6:(tan.z>0?b.maxZ-.5:-b.minZ-.5);
    const playerTangent=this.player.x*tan.x+this.player.z*tan.z;
    const center=clamp(playerTangent*.45+(this.random()-.5)*3,axisMin-lo,axisMax-hi);
    // Offset some groups so a defender targets the player and the open gap lies to one side.
    // Centering every group on its gap would let a stationary player survive indefinitely.
    const attackCenter=count>1&&this.random()<Math.min(.9,.4+t.aggression*.6)?
      (this.random()<.5?-1:1)*t.gap/2+(this.random()-.5)*.45:(this.random()-.5)*.5;
    const wave={id,edge,enemies:[],pairs:[]};
    for(let i=0;i<count;i++){
      const offset=offsets[i],coordinate=center+offset;
      const spawnTangent=edge==='north'||edge==='south'?coordinate*tan.x:coordinate*tan.z;
      const position=this.edgePosition(edge,spawnTangent),speed=Math.min(4.8,t.speed*(.94+this.random()*.12));
      const enemy={id:`${id}-${i}`,wave:id,...position,vx:dir.x*speed*.35,vz:dir.z*speed*.35,
        speed,edge,spawnTangent,tangent:tan,attackOffset:offset+attackCenter,anticipation:t.aggression,
        pattern:this.random()<.35?'intercept':'pursuit',phase:this.random()*Math.PI*2,
        mode:'approach',age:0,chargeAge:0,active:false,retired:false};
      wave.enemies.push(enemy);this.warnings.push({enemy,remaining:.9+i*.06,duration:.9,visible:i===0});
    }
    for(let i=0;i<count-1;i++)wave.pairs.push({left:wave.enemies[i],right:wave.enemies[i+1],previous:null,candidate:null,done:false});
    this.waves.push(wave);this.emit('wave',{id,count,edge,speed:t.speed,gap:t.gap});
  }
  updatePlayer(dt){
    const p=this.player,b=this.bounds,k=this.keyboard;
    const desired=k.x||k.z?limited(k.x*FIELD.maxSpeed,k.z*FIELD.maxSpeed,FIELD.maxSpeed):
      this.dragging?limited((p.targetX-p.x)*11,(p.targetZ-p.z)*11,FIELD.maxSpeed):{x:0,z:0};
    const blend=1-Math.exp(-dt/.14),change=limited((desired.x-p.vx)*blend,(desired.z-p.vz)*blend,36*dt);
    p.vx+=change.x;p.vz+=change.z;p.x=clamp(p.x+p.vx*dt,b.minX,b.maxX);p.z=clamp(p.z+p.vz*dt,b.minZ,b.maxZ);
    if((p.x<=b.minX&&p.vx<0)||(p.x>=b.maxX&&p.vx>0))p.vx=0;
    if((p.z<=b.minZ&&p.vz<0)||(p.z>=b.maxZ&&p.vz>0))p.vz=0;
    if(!this.dragging){p.targetX=p.x;p.targetZ=p.z;}
    p.glow=Math.max(0,p.glow-dt*2.4);
  }
  updateEnemy(e,dt){
    const p=this.player;e.age+=dt;
    if(e.mode==='approach'){
      const lead=e.pattern==='intercept'?e.anticipation:.12;
      const aimX=p.x+p.vx*lead+e.tangent.x*e.attackOffset,aimZ=p.z+p.vz*lead+e.tangent.z*e.attackOffset;
      const dx=aimX-e.x,dz=aimZ-e.z,length=Math.hypot(dx,dz)||1;
      e.desiredVX=dx/length*e.speed;e.desiredVZ=dz/length*e.speed;
      if(length<4.3||e.age>7){e.mode='charge';e.chargeVX=e.desiredVX;e.chargeVZ=e.desiredVZ;}
    }else{e.chargeAge+=dt;e.desiredVX=e.chargeVX;e.desiredVZ=e.chargeVZ;}
    const blend=1-Math.exp(-dt/.32),change=limited((e.desiredVX-e.vx)*blend,(e.desiredVZ-e.vz)*blend,9*dt);
    e.vx+=change.x;e.vz+=change.z;e.x+=e.vx*dt;e.z+=e.vz*dt;
    const b=this.bounds,out=e.x<-VIEW.width/2-1.5||e.x>VIEW.width/2+1.5||e.z<b.minZ-3||e.z>b.maxZ+3;
    if(e.age>12||(e.mode==='charge'&&e.chargeAge>3.8)||(e.age>1&&out))e.retired=true;
  }
  updateGaps(){
    const p=this.player,clear=FIELD.playerRadius+FIELD.enemyRadius+.08;
    for(const wave of this.waves)for(const pair of wave.pairs){
      if(pair.done)continue;const a=pair.left,b=pair.right;
      if(a.retired||b.retired){pair.done=true;continue;}if(!a.active||!b.active)continue;
      const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(length<clear*2||length>6.6){pair.candidate=null;pair.previous=null;continue;}
      const tx=dx/length,tz=dz/length;
      const sample={side:(p.x-a.x)*(-tz)+(p.z-a.z)*tx,along:(p.x-a.x)*tx+(p.z-a.z)*tz,length};
      const previous=pair.previous,inside=sample.along>clear&&sample.along<length-clear;
      if(previous&&!pair.candidate&&Math.abs(previous.side)>clear&&Math.abs(sample.side)<=clear)pair.candidate={from:Math.sign(previous.side),crossed:false,valid:inside};
      const candidate=pair.candidate;
      if(candidate){
        if(Math.abs(sample.side)<=clear&&!inside)candidate.valid=false;
        if(sample.side*candidate.from<0)candidate.crossed=true;
        if(candidate.crossed&&sample.side*candidate.from<-clear){
          pair.done=true;
          if(candidate.valid){this.bonus+=50;this.gaps++;p.glow=1;this.score=Math.floor(this.distance*4)+this.bonus;this.emit('gap',{points:50,x:(a.x+b.x)/2,z:(a.z+b.z)/2,pair:`${a.id}:${b.id}`});}
        }else if(sample.side*candidate.from>clear)pair.candidate=null;
      }
      pair.previous=sample;
    }
  }
  update(dt){
    if(!this.alive)return;this.events=[];this.time+=dt;const p=this.player,oldX=p.x,oldZ=p.z;
    this.updatePlayer(dt);const tune=tuning(this.score,this.difficulty);
    this.distance+=tune.forward*dt;this.score=Math.floor(this.distance*4)+this.bonus;
    this.nextWave-=dt;if(this.nextWave<=0){this.planWave();this.nextWave=tune.interval;}
    for(const warning of this.warnings){warning.remaining-=dt;warning.visible=warning.remaining<=warning.duration;if(warning.remaining<=0){const e=warning.enemy;e.active=true;this.enemies.push(e);this.emit('arrival',{id:e.id,edge:e.edge});}}
    this.warnings=this.warnings.filter(w=>w.remaining>0);
    for(const e of this.enemies){const ex=e.x,ez=e.z;this.updateEnemy(e,dt);
      if(sweptHit(ex-oldX,ez-oldZ,e.x-p.x,e.z-p.z,FIELD.playerRadius+FIELD.enemyRadius)){this.alive=false;this.emit('collision',{x:p.x,z:p.z});return;}
    }
    this.updateGaps();this.enemies=this.enemies.filter(e=>!e.retired);this.waves=this.waves.filter(w=>w.enemies.some(e=>!e.retired));
  }
}
