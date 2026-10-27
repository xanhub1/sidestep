// World coordinates: +z runs upfield. Camera motion never changes actor physics.
export const FIELD = Object.freeze({ halfWidth:12, length:200, endZone:14, stride:214, playerRadius:.36, enemyRadius:.4, steerSpeed:11.5 });
export const VIEW = Object.freeze({ width:16.5, verticalScale:.94, anchor:.46, perspective:.0035 });
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const damp=(dt,response)=>1-Math.exp(-dt/response);
const limited=(x,z,max)=>{const d=Math.hypot(x,z);return d>max?{x:x/d*max,z:z/d*max}:{x,z};};
export function tuning(score=0,difficulty='medium'){
  const mode={easy:{forward:10.4,speed:6.2,interval:1.65,capacity:14},medium:{forward:11,speed:7.2,interval:1.26,capacity:22},hardcore:{forward:11.5,speed:8.5,interval:.96,capacity:30}}[difficulty]??{forward:11,speed:7.2,interval:1.26,capacity:22};
  const pressure=clamp(score/4500,0,1);
  return {...mode,speed:Math.min(10.2,mode.speed+pressure*1.4),interval:mode.interval*(1-pressure*.35),pressure};
}
export function projectPoint(x,z,camera,width,height){
  const depth=z-camera.z,s=1/(1+clamp(depth,-65,90)*VIEW.perspective),unit=width/VIEW.width;
  return {x:width/2+(x-camera.x)*unit*s,y:height*VIEW.anchor-depth*unit*VIEW.verticalScale*s,s};
}
export function visibleWorld(camera,width,height){
  const unit=width/VIEW.width;
  const depth=y=>{const q=(height*VIEW.anchor-y)/(unit*VIEW.verticalScale);return q/(1-VIEW.perspective*q);};
  return {minZ:camera.z+depth(height),maxZ:camera.z+depth(0)};
}
export function sweptHit(ax,az,bx,bz,radius){
  const dx=bx-ax,dz=bz-az,length=dx*dx+dz*dz,t=length?clamp(-(ax*dx+az*dz)/length,0,1):0;
  return Math.hypot(ax+dx*t,az+dz*t)<=radius;
}
export function createDefender({id,x,z,speed=7.2,stage=0,pattern='intercept',anticipation=.22,phase=0}){
  return {id,x,z,prevX:x,prevZ:z,vx:0,vz:0,speed,stage,pattern,anticipation,phase,age:0,closestDistance:Infinity,threatened:false,rewarded:false,retired:false,opacity:0};
}
export class Game{
  constructor({random=Math.random,onEvent=()=>{}}={}){this.random=random;this.onEvent=onEvent;this.width=390;this.height=844;this.reset('medium');}
  reset(difficulty=this.difficulty??'medium'){
    this.difficulty=difficulty;this.alive=true;this.time=0;this.distance=0;this.score=0;this.dodgeScore=0;this.touchdownScore=0;this.dodges=0;this.touchdowns=0;
    this.player={x:-2.5,z:0,prevX:-2.5,prevZ:0,vx:0,vz:tuning(0,difficulty).forward,controlVX:0,controlVZ:0,targetX:-2.5,targetZ:0,glow:0};
    this.camera={x:-2,z:4,prevX:-2,prevZ:4};this.enemies=[];this.warnings=[];this.nextSpawn=.2;this.spawnID=0;this.recentEdges=[];this.dragging=false;this.keyboard={x:0,z:0};this.events=[];
  }
  setViewport(width,height){this.width=width;this.height=height;}
  emit(type,detail={}){const event={type,...detail};this.events.push(event);this.onEvent(event);}
  steer(dx,dz=0){const p=this.player;this.dragging=true;p.targetX=clamp(p.targetX+dx,-FIELD.halfWidth+FIELD.playerRadius,FIELD.halfWidth-FIELD.playerRadius);p.targetZ=clamp(p.targetZ+dz,p.z-4.5,p.z+4.5);}
  release(){this.dragging=false;this.player.targetX=this.player.x;this.player.targetZ=this.player.z;}
  updatePlayer(dt){
    const p=this.player,k=this.keyboard,forward=tuning(this.score,this.difficulty).forward;
    p.targetZ+=forward*dt;
    const desired=k.x||k.z?limited(k.x*FIELD.steerSpeed,k.z*FIELD.steerSpeed,FIELD.steerSpeed):this.dragging?limited((p.targetX-p.x)*20,(p.targetZ-p.z-forward*dt)*20,FIELD.steerSpeed):{x:0,z:0};
    const blend=damp(dt,this.dragging?.024:.038);
    p.controlVX=mix(p.controlVX,desired.x,blend);p.controlVZ=mix(p.controlVZ,desired.z,blend);
    p.vx=p.controlVX;p.vz=forward+p.controlVZ;
    p.x=clamp(p.x+p.vx*dt,-FIELD.halfWidth+FIELD.playerRadius,FIELD.halfWidth-FIELD.playerRadius);p.z+=p.vz*dt;
    if((p.x<=-FIELD.halfWidth+FIELD.playerRadius&&p.vx<0)||(p.x>=FIELD.halfWidth-FIELD.playerRadius&&p.vx>0))p.vx=p.controlVX=0;
    if(!this.dragging||k.x||k.z){p.targetX=p.x;p.targetZ=p.z;}
    p.glow=Math.max(0,p.glow-dt*2.4);
  }
  updateCamera(dt){
    const c=this.camera,p=this.player;c.prevX=c.x;c.prevZ=c.z;
    c.x=mix(c.x,clamp(p.x+.45,-6.8,6.8),damp(dt,.20));c.z=mix(c.z,p.z+.45,damp(dt,.14));
  }
  planArrival(){
    const tune=tuning(this.score,this.difficulty);if(this.enemies.length+this.warnings.length>=tune.capacity)return;
    const p=this.player,view=visibleWorld(this.camera,this.width,this.height);
    // Keep directions random without allowing long runs of identical entrances.
    const excluded=this.recentEdges.length===2&&this.recentEdges[0]===this.recentEdges[1]?this.recentEdges[0]:null;
    const choices=[['north',.56],['west',.19],['east',.19],['south',.06]].filter(([edge])=>edge!==excluded);
    let roll=this.random()*choices.reduce((sum,[,weight])=>sum+weight,0),edge='north';
    if(this.spawnID>0)for(const [candidate,weight] of choices){roll-=weight;if(roll<=0){edge=candidate;break;}}
    this.recentEdges.push(edge);if(this.recentEdges.length>2)this.recentEdges.shift();
    let x,z;
    if(edge==='north'){x=clamp(p.x+(this.random()-.5)*17,-11.5,11.5);z=Math.max(p.z+24,view.maxZ+3)+this.random()*4;}
    else if(edge==='west'||edge==='east'){x=(edge==='west'?-1:1)*12.6;z=p.z+10+this.random()*15;}
    else{x=clamp(p.x+(this.random()-.5)*16,-11.5,11.5);z=view.minZ-3;}
    const enemy=createDefender({id:++this.spawnID,x,z,speed:tune.speed*(.94+this.random()*.12),stage:Math.max(0,Math.floor((z+FIELD.endZone)/FIELD.stride)),pattern:this.random()<.6?'intercept':'pursuit',anticipation:.16+this.random()*.16,phase:this.random()*Math.PI*2});
    enemy.edge=edge;
    const dx=p.x-x,dz=p.z-z,d=Math.hypot(dx,dz)||1;enemy.vx=dx/d*enemy.speed;enemy.vz=dz/d*enemy.speed;
    this.warnings.push({enemy,remaining:.65,duration:.65,visible:true});this.emit('incoming',{id:enemy.id,edge});
  }
  updateEnemy(e,dt){
    const p=this.player,dx=p.x-e.x,dz=p.z-e.z,distance=Math.hypot(dx,dz),lead=e.pattern==='intercept'?e.anticipation:.04;
    e.age+=dt;e.closestDistance=Math.min(e.closestDistance,distance);
    if(distance<2.15&&dz<.5)e.threatened=true;
    // A beaten defender still runs toward the player. Relative world speed creates the fall-behind.
    const stamina=1-.24*clamp((dz-2)/12,0,1),aimX=dx+p.vx*lead,aimZ=dz+p.vz*lead,length=Math.hypot(aimX,aimZ)||1;
    const desiredX=aimX/length*e.speed*stamina,desiredZ=aimZ/length*e.speed*stamina,blend=damp(dt,.18);
    const change=limited((desiredX-e.vx)*blend,(desiredZ-e.vz)*blend,38*dt);
    e.vx+=change.x;e.vz+=change.z;e.x+=e.vx*dt;e.z+=e.vz*dt;e.opacity=clamp(e.age/.16,0,1);
    const view=visibleWorld(this.camera,this.width,this.height);
    if(e.z<view.minZ-10||Math.abs(e.x)>FIELD.halfWidth+12)e.retired=true;
  }
  updateDodges(){
    const p=this.player;
    for(const e of this.enemies){
      const distance=Math.hypot(p.x-e.x,p.z-e.z);
      if(!e.rewarded&&e.threatened&&e.closestDistance>FIELD.playerRadius+FIELD.enemyRadius&&p.z-e.z>1.35&&distance>1.6&&distance>e.closestDistance+.3){
        e.rewarded=true;this.dodges++;this.dodgeScore+=50;this.score=this.dodgeScore+this.touchdownScore;p.glow=1;this.emit('dodge',{points:50,x:e.x,z:e.z,id:e.id});
      }
    }
  }
  updateTouchdowns(){
    while(this.distance>=this.touchdowns*FIELD.stride+FIELD.length){this.touchdowns++;this.touchdownScore+=500;this.score=this.dodgeScore+this.touchdownScore;this.player.glow=1;this.emit('touchdown',{points:500,stage:this.touchdowns,x:this.player.x,z:this.player.z});}
  }
  update(dt){
    if(!this.alive)return;this.events=[];this.time+=dt;const p=this.player,oldX=p.x,oldZ=p.z;p.prevX=oldX;p.prevZ=oldZ;
    this.updatePlayer(dt);this.updateCamera(dt);this.distance=Math.max(this.distance,p.z);
    this.nextSpawn-=dt;
    if(this.nextSpawn<=0){this.planArrival();this.nextSpawn=tuning(this.score,this.difficulty).interval*(.78+this.random()*.44);}
    for(const warning of this.warnings){
      warning.remaining-=dt;
      if(warning.remaining<=0){const e=warning.enemy;if(Math.hypot(e.x-p.x,e.z-p.z)>3.2){this.enemies.push(e);this.emit('arrival',{id:e.id,edge:e.edge});}}
    }
    this.warnings=this.warnings.filter(w=>w.remaining>0);
    for(const e of this.enemies){
      const ex=e.x,ez=e.z;e.prevX=ex;e.prevZ=ez;this.updateEnemy(e,dt);
      if(sweptHit(ex-oldX,ez-oldZ,e.x-p.x,e.z-p.z,FIELD.playerRadius+FIELD.enemyRadius)){this.alive=false;this.emit('collision',{x:p.x,z:p.z});return;}
    }
    this.updateDodges();this.updateTouchdowns();this.enemies=this.enemies.filter(e=>!e.retired);
  }
}
