// World coordinates: +z runs upfield. Camera motion never changes actor physics.
export const FIELD = Object.freeze({ halfWidth:12, length:200, endZone:14, stride:214, playerRadius:.36, enemyRadius:.4, steerSpeed:11.5 });
export const VIEW = Object.freeze({ width:16.5, verticalScale:.94, anchor:.46, perspective:.0035, startY:.90, startLineY:.985, topY:.075, bottomY:.94, leftX:.045, rightX:.955 });
const MODES={easy:{forward:10.4,speed:6.2,interval:2.5,groupSize:2,capacity:14,startStage:0},medium:{forward:12.8,speed:9.4,interval:2.15,groupSize:3,capacity:24,startStage:1},hardcore:{forward:15.2,speed:12,interval:1.8,groupSize:4,capacity:32,startStage:2}};
const STAGES=[
  {name:'RED DEFENSE',turf:'#4c8b35',endZone:'#3c782d',body:['#9e2226','#e83b36','#ff6352','#a92328'],cap:['#ffb39b','#ff8c74','#e65349'],warning:'#ef4937'},
  {name:'WHITE DEFENSE',turf:'#a47849',endZone:'#8e633b',body:['#a9ada0','#e6e7d6','#fffff0','#b7bcab'],cap:['#fffff4','#f5f6e6','#c8ceba'],warning:'#fff3c7'},
  {name:'ELITE DEFENSE',turf:'#3e7043',endZone:'#315638',body:['#202330','#44495d','#6b718a','#282c3c'],cap:['#b0b6cb','#858da8','#535c77'],warning:'#c7cee5'}
];
export const stageAppearance=stage=>STAGES[((stage%STAGES.length)+STAGES.length)%STAGES.length];
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const damp=(dt,response)=>1-Math.exp(-dt/response);
const limited=(x,z,max)=>{const d=Math.hypot(x,z);return d>max?{x:x/d*max,z:z/d*max}:{x,z};};
export function tuning(score=0,difficulty='medium'){
  const mode=MODES[difficulty]??MODES.medium;
  const pressure=clamp(score/4500,0,1);
  return {...mode,speed:Math.min(mode.forward-.8,mode.speed+pressure*1.4),interval:mode.interval*(1-pressure*.35),pressure};
}
export function depthAtScreenY(y,width,height){const q=(height*VIEW.anchor-y)/(width/VIEW.width*VIEW.verticalScale);return q/(1-VIEW.perspective*q);}
export function unprojectPoint(x,y,camera,width,height){const depth=depthAtScreenY(y,width,height);return {x:camera.x+(x-width/2)/(width/VIEW.width)*(1+depth*VIEW.perspective),z:camera.z+depth};}
export function projectPoint(x,z,camera,width,height){
  const depth=z-camera.z,s=1/(1+clamp(depth,-65,90)*VIEW.perspective),unit=width/VIEW.width;
  return {x:width/2+(x-camera.x)*unit*s,y:height*VIEW.anchor-depth*unit*VIEW.verticalScale*s,s};
}
export function visibleWorld(camera,width,height){
  return {minZ:camera.z+depthAtScreenY(height,width,height),maxZ:camera.z+depthAtScreenY(0,width,height)};
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
    const mode=tuning(0,difficulty);this.startStage=mode.startStage;
    const cameraZ=-depthAtScreenY(this.height*VIEW.startLineY,this.width,this.height),z=cameraZ+depthAtScreenY(this.height*VIEW.startY,this.width,this.height);
    this.startZ=z;this.furthestZ=z;
    this.player={x:-2.5,z,prevX:-2.5,prevZ:z,vx:0,vz:mode.forward,controlVX:0,controlVZ:0,targetX:-2.5,targetZ:z,glow:0};
    this.camera={x:-2.05,z:cameraZ,prevX:-2.05,prevZ:cameraZ};this.enemies=[];this.warnings=[];this.nextSpawn=.2;this.spawnID=0;this.rushID=0;this.recentEdges=[];this.dragging=false;this.keyboard={x:0,z:0};this.events=[];
  }
  setViewport(width,height){
    const point=projectPoint(this.player.x,this.player.z,this.camera,this.width,this.height),ratio=point.y/this.height,ratioX=point.x/this.width;
    this.width=width;this.height=height;
    if(this.time===0){const z=-depthAtScreenY(height*VIEW.startLineY,width,height);this.camera.z=z;this.player.z=z+depthAtScreenY(height*VIEW.startY,width,height);this.player.targetZ=this.player.z;this.startZ=this.furthestZ=this.player.z;}
    else{const shift=this.player.z-depthAtScreenY(height*ratio,width,height)-this.camera.z;this.camera.z+=shift;const offset=unprojectPoint(width*ratioX,height*ratio,{x:0,z:this.camera.z},width,height).x;this.camera.x=this.player.x-offset;}
    this.camera.prevX=this.camera.x;this.camera.prevZ=this.camera.z;this.player.prevX=this.player.x;this.player.prevZ=this.player.z;
  }
  movementBounds(z=this.player.z){
    const scale=projectPoint(0,z,this.camera,this.width,this.height).s,margin=FIELD.halfWidth-FIELD.playerRadius;
    return {minX:Math.max(-margin,this.camera.x+(VIEW.leftX-.5)*VIEW.width/scale),maxX:Math.min(margin,this.camera.x+(VIEW.rightX-.5)*VIEW.width/scale),minZ:this.camera.z+depthAtScreenY(this.height*VIEW.bottomY,this.width,this.height),maxZ:this.camera.z+depthAtScreenY(this.height*VIEW.topY,this.width,this.height)};
  }
  emit(type,detail={}){const event={type,...detail};this.events.push(event);this.onEvent(event);}
  steer(dx,dz=0){const p=this.player,b=this.movementBounds();this.dragging=true;p.targetX=clamp(p.targetX+dx,b.minX,b.maxX);p.targetZ=clamp(p.targetZ+dz,b.minZ,b.maxZ);}
  release(){this.dragging=false;this.player.targetX=this.player.x;this.player.targetZ=this.player.z;}
  updatePlayer(dt){
    const p=this.player,k=this.keyboard,forward=tuning(this.score,this.difficulty).forward,b=this.movementBounds();
    p.targetX=clamp(p.targetX,b.minX,b.maxX);
    p.targetZ=clamp(p.targetZ+forward*dt,b.minZ,b.maxZ);
    const desired=k.x||k.z?limited(k.x*FIELD.steerSpeed,k.z*FIELD.steerSpeed,FIELD.steerSpeed):this.dragging?limited((p.targetX-p.x)*20,(p.targetZ-p.z-forward*dt)*20,FIELD.steerSpeed):{x:0,z:0};
    const blend=damp(dt,this.dragging?.024:.038);
    p.controlVX=mix(p.controlVX,desired.x,blend);p.controlVZ=mix(p.controlVZ,desired.z,blend);
    p.vx=p.controlVX;p.vz=forward+p.controlVZ;
    p.x+=p.vx*dt;p.z+=p.vz*dt;
    if(p.z<b.minZ||p.z>b.maxZ){p.z=clamp(p.z,b.minZ,b.maxZ);p.targetZ=p.z;p.controlVZ=0;p.vz=forward;}
    const horizontal=this.movementBounds(p.z);
    if(p.x<horizontal.minX||p.x>horizontal.maxX){p.x=clamp(p.x,horizontal.minX,horizontal.maxX);p.targetX=p.x;p.vx=p.controlVX=0;}
    if(!this.dragging||k.x||k.z){p.targetX=p.x;p.targetZ=p.z;}
    p.glow=Math.max(0,p.glow-dt*2.4);
  }
  updateCamera(dt){
    const c=this.camera;c.prevX=c.x;c.prevZ=c.z;
    // Scroll with the run, preserving cuts on both axes instead of recentering the player.
    c.z+=tuning(this.score,this.difficulty).forward*dt;
  }
  planRush(){
    const tune=tuning(this.score,this.difficulty),budget=tune.capacity-this.enemies.length-this.warnings.length;
    if(budget<=0)return;
    const count=Math.min(budget,tune.groupSize+(this.random()<.35?1:0)),edges=[],id=++this.rushID;
    for(let i=0;i<count;i++){const enemy=this.planArrival({avoidEdges:edges.length<4?edges:[],delay:i===0?0:this.random()*.1,rushID:id});if(enemy)edges.push(enemy.edge);}
    this.emit('rush',{id,count:edges.length,edges});
  }
  planArrival({avoidEdges=[],delay=0,rushID=null}={}){
    const tune=tuning(this.score,this.difficulty);if(this.enemies.length+this.warnings.length>=tune.capacity)return null;
    const p=this.player,view=visibleWorld(this.camera,this.width,this.height);
    // Keep directions random without allowing long runs of identical entrances.
    const excluded=this.recentEdges.length===2&&this.recentEdges[0]===this.recentEdges[1]?this.recentEdges[0]:null;
    let choices=[['north',.56],['west',.19],['east',.19],['south',.06]].filter(([edge])=>!avoidEdges.includes(edge));
    if(choices.some(([edge])=>edge!==excluded))choices=choices.filter(([edge])=>edge!==excluded);
    let roll=this.random()*choices.reduce((sum,[,weight])=>sum+weight,0),edge='north';
    if(this.spawnID>0)for(const [candidate,weight] of choices){roll-=weight;if(roll<=0){edge=candidate;break;}}
    let x,z,spaced=false;
    for(let attempt=0;attempt<12;attempt++){
      if(edge==='north'){z=Math.max(p.z+24,view.maxZ+3)+this.random()*5;const a=unprojectPoint(20,-15,this.camera,this.width,this.height).x,b=unprojectPoint(this.width-20,-15,this.camera,this.width,this.height).x;x=clamp(a+this.random()*(b-a),-11.5,11.5);}
      else if(edge==='west'||edge==='east'){z=p.z+8+this.random()*15;const y=projectPoint(0,z,this.camera,this.width,this.height).y;x=unprojectPoint(edge==='west'?-32:this.width+32,y,this.camera,this.width,this.height).x;}
      else{x=clamp(p.x+(this.random()-.5)*14,-11.5,11.5);z=view.minZ-3;}
      const neighbors=[...this.enemies,...this.warnings.map(w=>w.enemy)];
      if(neighbors.every(e=>Math.hypot(e.x-x,e.z-z)>1.8)){spaced=true;break;}
    }
    if(!spaced)return null;
    this.recentEdges.push(edge);if(this.recentEdges.length>2)this.recentEdges.shift();
    const enemy=createDefender({id:++this.spawnID,x,z,speed:tune.speed*(.94+this.random()*.12),stage:this.startStage+Math.max(0,Math.floor((z+FIELD.endZone)/FIELD.stride)),pattern:this.random()<.6?'intercept':'pursuit',anticipation:.16+this.random()*.16,phase:this.random()*Math.PI*2});
    enemy.edge=edge;
    enemy.rushID=rushID;
    const dx=p.x-x,dz=p.z-z,d=Math.hypot(dx,dz)||1;enemy.vx=dx/d*enemy.speed;enemy.vz=dz/d*enemy.speed;
    this.warnings.push({enemy,remaining:.65+delay,duration:.65,visible:true});this.emit('incoming',{id:enemy.id,edge,rushID});return enemy;
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
    while(this.furthestZ>=this.touchdowns*FIELD.stride+FIELD.length){this.touchdowns++;this.touchdownScore+=500;this.score=this.dodgeScore+this.touchdownScore;this.player.glow=1;this.emit('touchdown',{points:500,stage:this.startStage+this.touchdowns,x:this.player.x,z:this.player.z});}
  }
  update(dt){
    if(!this.alive)return;this.events=[];this.time+=dt;const p=this.player,oldX=p.x,oldZ=p.z;p.prevX=oldX;p.prevZ=oldZ;
    this.updateCamera(dt);this.updatePlayer(dt);this.furthestZ=Math.max(this.furthestZ,p.z);this.distance=Math.max(0,this.furthestZ-this.startZ);
    this.nextSpawn-=dt;
    if(this.nextSpawn<=0){this.planRush();this.nextSpawn=tuning(this.score,this.difficulty).interval*(.78+this.random()*.44);}
    for(const warning of this.warnings){
      // Rear entries follow the moving bottom edge until their warning finishes.
      if(warning.enemy.edge==='south'){warning.enemy.z+=tuning(this.score,this.difficulty).forward*dt;warning.enemy.prevZ=warning.enemy.z;}
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
