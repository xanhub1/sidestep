export const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export const FIELD={halfWidth:7.1,playerRadius:.34,enemyRadius:.37,maxSpeed:18.5,response:.014};
export const VIEW={width:15.2,verticalScale:.92,anchor:.44};
export const DIFFICULTIES={
  easy:{speed:.9,count:-.25,interval:1.22,aggression:.7,progression:.6,forward:16,capacity:12,maxCount:4,commitLead:.4},
  medium:{speed:1.03,count:.65,interval:1,aggression:1,progression:1,forward:19,capacity:20,maxCount:6,commitLead:.32},
  hardcore:{speed:1.3,count:1.5,interval:.78,aggression:1.35,progression:1.5,forward:23,capacity:28,maxCount:8,commitLead:.26},
};
const lerp=(a,b,t)=>a+(b-a)*t;
const stages=[[0,2.5],[500,3.25],[1000,4.25],[2000,5.25],[4000,6.25],[7000,7.25],[14000,8]];
export function tuning(score,difficulty='medium'){
  const d=DIFFICULTIES[difficulty],p=Math.max(0,score)*d.progression;
  let count=8;
  for(let i=1;i<stages.length;i++)if(p<=stages[i][0]){const a=stages[i-1],b=stages[i];count=lerp(a[1],b[1],(p-a[0])/(b[0]-a[0]));break;}
  const pressure=1-Math.exp(-p/4300);
  return {speed:Math.min(14.8,(8.2+2.4*pressure)*d.speed),count:clamp(count+d.count,2,d.maxCount),
    interval:Math.max(.5,(1.1-.36*pressure)*d.interval),aggression:(.14+.12*pressure)*d.aggression,
    forward:d.forward*(1+.15*pressure),capacity:d.capacity,commitLead:d.commitLead,pressure};
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
function limited(x,z,max){const length=Math.hypot(x,z);return length>max?{x:x/length*max,z:z/length*max}:{x,z};}

export class Game{
  constructor({random=Math.random,onEvent=()=>{}}={}){this.random=random;this.onEvent=onEvent;this.bounds=viewportBounds(390,693);this.reset('medium');}
  reset(difficulty=this.difficulty){
    this.difficulty=DIFFICULTIES[difficulty]?difficulty:'medium';this.time=0;this.distance=0;this.bonus=0;this.score=0;this.gaps=0;this.alive=true;
    this.player={x:0,z:0,vx:0,vz:0,targetX:0,targetZ:0,glow:0};this.enemies=[];this.warnings=[];this.gapPairs=new Map();
    this.nextRush=.05;this.rushID=0;this.dragging=false;this.keyboard={x:0,z:0};this.events=[];
  }
  setViewport(width,height){
    this.bounds=viewportBounds(width,height);const p=this.player,b=this.bounds;
    p.x=clamp(p.x,b.minX,b.maxX);p.z=clamp(p.z,b.minZ,b.maxZ);p.targetX=clamp(p.targetX,b.minX,b.maxX);p.targetZ=clamp(p.targetZ,b.minZ,b.maxZ);
    for(const w of this.warnings){const pos=this.spawnPosition(w.enemy.spawnAngle);w.enemy.x=pos.x;w.enemy.z=pos.z;w.enemy.edge=pos.edge;w.remaining=w.duration;}
  }
  emit(type,detail={}){const event={type,...detail};this.events.push(event);this.onEvent(event);}
  steer(dx,dz=0){this.dragging=true;const p=this.player,b=this.bounds;p.targetX=clamp(p.targetX+dx,b.minX,b.maxX);p.targetZ=clamp(p.targetZ+dz,b.minZ,b.maxZ);}
  release(){this.dragging=false;this.player.targetX=this.player.x;this.player.targetZ=this.player.z;}
  spawnPosition(angle){
    const p=this.player,b=this.bounds,dx=Math.cos(angle),dz=Math.sin(angle),outerX=VIEW.width/2+1;
    const tx=Math.abs(dx)<1e-8?Infinity:((dx>0?outerX:-outerX)-p.x)/dx;
    const tz=Math.abs(dz)<1e-8?Infinity:((dz>0?b.maxZ+2:b.minZ-2)-p.z)/dz;
    const distance=Math.min(tx,tz);
    return {x:p.x+dx*distance,z:p.z+dz*distance,edge:tx<tz?(dx>0?'east':'west'):(dz>0?'north':'south')};
  }
  planRush(){
    const t=tuning(this.score,this.difficulty),budget=t.capacity-this.enemies.length-this.warnings.length;
    if(budget<=0)return;
    const wanted=Math.min(budget,Math.floor(t.count)+(this.random()<t.count%1?1:0)),id=++this.rushID,entries=[];
    for(let i=0;i<wanted;i++){
      let pos,angle,accepted=false;
      for(let attempt=0;attempt<32;attempt++){
        angle=this.random()*Math.PI*2;pos=this.spawnPosition(angle);
        const sameEdge=i===wanted-1&&i>0&&entries.every(e=>e.edge===pos.edge);
        const crowded=[...entries,...this.warnings.map(w=>w.enemy)].some(e=>Math.hypot(e.x-pos.x,e.z-pos.z)<1.4);
        if(!sameEdge&&!crowded){accepted=true;break;}
      }
      if(!accepted)continue;
      const dx=this.player.x-pos.x,dz=this.player.z-pos.z,length=Math.hypot(dx,dz)||1,inward={x:dx/length,z:dz/length};
      const speed=Math.min(14.8,t.speed*(.92+this.random()*.16));
      const enemy={id:`${id}-${i}`,...pos,spawnAngle:angle,vx:inward.x*speed*.8,vz:inward.z*speed*.8,speed,
        tangent:{x:-inward.z,z:inward.x},attackOffset:(this.random()-.5)*.45,anticipation:t.aggression,
        pattern:this.random()<.45?'intercept':'pursuit',phase:this.random()*Math.PI*2,commitLead:t.commitLead,
        mode:'approach',age:0,chargeAge:0,active:false,retired:false,opacity:1};
      const delay=i===0?0:.04+i*.025+this.random()*.18;
      entries.push(enemy);this.warnings.push({enemy,remaining:.7+delay,duration:.7,visible:delay===0});
    }
    this.emit('rush',{id,count:entries.length,edges:entries.map(e=>e.edge)});
  }
  updatePlayer(dt){
    const p=this.player,b=this.bounds,k=this.keyboard,oldX=p.x,oldZ=p.z;
    const desired=k.x||k.z?limited(k.x*FIELD.maxSpeed,k.z*FIELD.maxSpeed,FIELD.maxSpeed):
      this.dragging?limited((p.targetX-p.x)*90,(p.targetZ-p.z)*90,FIELD.maxSpeed):{x:0,z:0};
    // One tiny filter removes input jitter; there is no long acceleration or reversal ramp.
    const blend=1-Math.exp(-dt/(this.dragging||k.x||k.z?FIELD.response:.01));
    p.vx+=(desired.x-p.vx)*blend;p.vz+=(desired.z-p.vz)*blend;
    p.x=clamp(p.x+p.vx*dt,b.minX,b.maxX);p.z=clamp(p.z+p.vz*dt,b.minZ,b.maxZ);
    if(this.dragging&&!k.x&&!k.z){
      if((p.targetX-oldX)*(p.targetX-p.x)<=0){p.x=p.targetX;p.vx=0;}
      if((p.targetZ-oldZ)*(p.targetZ-p.z)<=0){p.z=p.targetZ;p.vz=0;}
    }
    if((p.x<=b.minX&&p.vx<0)||(p.x>=b.maxX&&p.vx>0))p.vx=0;
    if((p.z<=b.minZ&&p.vz<0)||(p.z>=b.maxZ&&p.vz>0))p.vz=0;
    if(!this.dragging){p.targetX=p.x;p.targetZ=p.z;}
    p.glow=Math.max(0,p.glow-dt*2.4);
  }
  updateEnemy(e,dt){
    const p=this.player;e.age+=dt;
    if(e.mode==='approach'){
      const lead=e.pattern==='intercept'?e.anticipation:.035;
      const aimX=p.x+p.vx*lead+e.tangent.x*e.attackOffset,aimZ=p.z+p.vz*lead+e.tangent.z*e.attackOffset;
      const dx=aimX-e.x,dz=aimZ-e.z,length=Math.hypot(dx,dz)||1;
      e.desiredVX=dx/length*e.speed;e.desiredVZ=dz/length*e.speed;
      if(Math.hypot(p.x-e.x,p.z-e.z)<Math.max(2.4,e.speed*(e.commitLead??.32))||e.age>7){e.mode='charge';e.chargeVX=e.desiredVX;e.chargeVZ=e.desiredVZ;}
    }else{e.chargeAge+=dt;e.desiredVX=e.chargeVX;e.desiredVZ=e.chargeVZ;}
    const blend=1-Math.exp(-dt/.08),change=limited((e.desiredVX-e.vx)*blend,(e.desiredVZ-e.vz)*blend,85*dt);
    e.vx+=change.x;e.vz+=change.z;e.x+=e.vx*dt;e.z+=e.vz*dt;
    const b=this.bounds,out=e.x<-VIEW.width/2-1.5||e.x>VIEW.width/2+1.5||e.z<b.minZ-3||e.z>b.maxZ+3;
    e.opacity=clamp((9.5-e.age)/.3,0,1);
    if(e.age>9.5||(e.age>.5&&out))e.retired=true;
  }
  updateGaps(){
    const p=this.player,clear=FIELD.playerRadius+FIELD.enemyRadius+.08,active=this.enemies.filter(e=>e.active&&!e.retired);
    for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
      const [a,b]=active[i].id<active[j].id?[active[i],active[j]]:[active[j],active[i]],key=`${a.id}:${b.id}`;
      const length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<clear*2||length>6.6)continue;
      if(!this.gapPairs.has(key))this.gapPairs.set(key,{left:a,right:b,previous:null,candidate:null,done:false});
    }
    for(const [key,pair] of this.gapPairs){
      const a=pair.left,b=pair.right;if(a.retired||b.retired){this.gapPairs.delete(key);continue;}if(pair.done)continue;
      const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(length<clear*2||length>6.6){pair.candidate=null;pair.previous=null;continue;}
      const tx=dx/length,tz=dz/length;
      const sample={side:(p.x-a.x)*(-tz)+(p.z-a.z)*tx,along:(p.x-a.x)*tx+(p.z-a.z)*tz};
      const blocked=Math.abs(sample.side)<clear&&active.some(e=>{if(e===a||e===b)return false;const along=(e.x-a.x)*tx+(e.z-a.z)*tz;return along>0&&along<length&&Math.abs((e.x-a.x)*(-tz)+(e.z-a.z)*tx)<clear;});
      const previous=pair.previous,inside=sample.along>clear&&sample.along<length-clear&&!blocked;
      if(previous&&!pair.candidate&&Math.abs(previous.side)>clear&&Math.abs(sample.side)<=clear)pair.candidate={from:Math.sign(previous.side),crossed:false,valid:inside};
      const candidate=pair.candidate;
      if(candidate){
        if(Math.abs(sample.side)<=clear&&!inside)candidate.valid=false;
        if(sample.side*candidate.from<0)candidate.crossed=true;
        if(candidate.crossed&&sample.side*candidate.from<-clear){
          pair.done=true;
          if(candidate.valid){this.bonus+=50;this.gaps++;p.glow=1;this.score=Math.floor(this.distance*4)+this.bonus;this.emit('gap',{points:50,x:(a.x+b.x)/2,z:(a.z+b.z)/2,pair:key});}
        }else if(sample.side*candidate.from>clear)pair.candidate=null;
      }
      pair.previous=sample;
    }
  }
  update(dt){
    if(!this.alive)return;this.events=[];this.time+=dt;const p=this.player,oldX=p.x,oldZ=p.z;
    this.updatePlayer(dt);const tune=tuning(this.score,this.difficulty);
    this.distance+=tune.forward*dt;this.score=Math.floor(this.distance*4)+this.bonus;
    this.nextRush-=dt;if(this.nextRush<=0){this.planRush();this.nextRush=tune.interval;}
    for(const warning of this.warnings){warning.remaining-=dt;warning.visible=warning.remaining<=warning.duration;if(warning.remaining<=0){const e=warning.enemy;e.active=true;this.enemies.push(e);this.emit('arrival',{id:e.id,edge:e.edge});}}
    this.warnings=this.warnings.filter(w=>w.remaining>0);
    for(const e of this.enemies){const ex=e.x,ez=e.z;this.updateEnemy(e,dt);
      if(sweptHit(ex-oldX,ez-oldZ,e.x-p.x,e.z-p.z,FIELD.playerRadius+FIELD.enemyRadius)){this.alive=false;this.emit('collision',{x:p.x,z:p.z});return;}
    }
    this.updateGaps();this.enemies=this.enemies.filter(e=>!e.retired);
  }
}
