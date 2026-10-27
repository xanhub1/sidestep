// World coordinates: +z runs upfield. Camera motion never changes actor physics.
export const FIELD = Object.freeze({ halfWidth:12, length:200, endZone:14, stride:214, unitsPerYard:2, playerRadius:.44, enemyRadius:.49, steerSpeed:11.5 });
export const CHARACTER=Object.freeze({playerRadius:.525,enemyRadius:.515,height:1.16,ellipse:.44});
export const PACE=.8;
export const VIEW = Object.freeze({ width:16.5, verticalScale:.94, anchor:.46, perspective:.0035, startY:.90, startLineY:.985, topY:.075, bottomY:.94, leftX:.045, rightX:.955 });
const MODES={easy:{forward:10.4,speed:6.2,pursuitRatio:.94,interval:2.1,groupSize:3,capacity:22,startStage:0,anticipation:.12,interceptChance:.45,turnResponse:.22},medium:{forward:12.8,speed:10.6,pursuitRatio:.99,interval:1.65,groupSize:5,capacity:36,startStage:1,anticipation:.24,interceptChance:.75,turnResponse:.15},hardcore:{forward:15.2,speed:13.5,pursuitRatio:1.035,interval:1.25,groupSize:7,capacity:50,startStage:2,anticipation:.38,interceptChance:.92,turnResponse:.105}};
const STAGES=[
  {name:'RED DEFENSE',turf:'#4c8b35',endZone:'#3c782d',body:['#9e2226','#e83b36','#ff6352','#a92328'],cap:['#ffb39b','#ff8c74','#e65349'],warning:'#ef4937'},
  {name:'WHITE DEFENSE',turf:'#a47849',endZone:'#8e633b',body:['#a9ada0','#e6e7d6','#fffff0','#b7bcab'],cap:['#fffff4','#f5f6e6','#c8ceba'],warning:'#fff3c7'},
  {name:'ELITE DEFENSE',turf:'#3e7043',endZone:'#315638',body:['#202330','#44495d','#6b718a','#282c3c'],cap:['#b0b6cb','#858da8','#535c77'],warning:'#c7cee5'}
];
export const stageAppearance=stage=>STAGES[Math.max(0,Math.min(STAGES.length-1,Math.floor(stage)))];
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const damp=(dt,response)=>1-Math.exp(-dt/response);
const limited=(x,z,max)=>{const d=Math.hypot(x,z);return d>max?{x:x/d*max,z:z/d*max}:{x,z};};
export function tuning(score=0,difficulty='medium',touchdowns=0){
  const mode=MODES[difficulty]??MODES.medium;
  const level=Math.max(0,touchdowns),pressure=clamp(score/4500+level*.2,0,1);
  const forward=mode.forward*PACE;
  return {...mode,forward,speed:Math.min(forward*(.99+pressure*.03),mode.speed*PACE+pressure*1.6),pursuitSpeed:forward*Math.min(1.08,mode.pursuitRatio+pressure*.035),interval:Math.max(.75,mode.interval/PACE*(1-pressure*.25)/(1+level*.12)),groupSize:mode.groupSize+Math.min(3,Math.floor(level/2)),capacity:mode.capacity+Math.min(16,level*4),anticipation:mode.anticipation+pressure*.08,turnResponse:mode.turnResponse*(1-pressure*.15),pressure,level};
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
export function characterBounds(x,z,camera,width,height,player=false){
  const p=projectPoint(x,z,camera,width,height),unit=width/VIEW.width,r=unit*(player?CHARACTER.playerRadius:CHARACTER.enemyRadius)*p.s,bodyHeight=unit*CHARACTER.height*p.s;
  return {left:p.x-r,right:p.x+r,top:p.y-bodyHeight-r*CHARACTER.ellipse,bottom:p.y+r*CHARACTER.ellipse,x:p.x,y:p.y,r,height:bodyHeight};
}
export function outsideView(x,z,camera,width,height){const b=characterBounds(x,z,camera,width,height);return b.right<0||b.left>width||b.bottom<0||b.top>height;}
export function sweptHit(ax,az,bx,bz,radius){
  const dx=bx-ax,dz=bz-az,length=dx*dx+dz*dz,t=length?clamp(-(ax*dx+az*dz)/length,0,1):0;
  return Math.hypot(ax+dx*t,az+dz*t)<=radius;
}
export function createDefender({id,x,z,speed=7.2,pursuitSpeed=speed,stage=0,pattern='intercept',anticipation=.22,turnResponse=.18,phase=0}){
  return {id,x,z,prevX:x,prevZ:z,vx:0,vz:0,speed,pursuitSpeed,stage,pattern,anticipation,turnResponse,phase,age:0,closestDistance:Infinity,threatened:false,rewarded:false,retired:false,entered:false,hasAppeared:false,opacity:1};
}
export class Game{
  constructor({random=Math.random,onEvent=()=>{}}={}){this.random=random;this.onEvent=onEvent;this.width=390;this.height=844;this.reset('medium');}
  tune(){return tuning(this.score,this.difficulty,this.touchdowns);}
  reset(difficulty=this.difficulty??'medium'){
    this.difficulty=difficulty;this.alive=true;this.time=0;this.distance=0;this.score=0;this.runScore=0;this.dodgeScore=0;this.touchdownScore=0;this.dodges=0;this.touchdowns=0;
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
    const p=this.player,k=this.keyboard,forward=this.tune().forward,b=this.movementBounds();
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
    c.z+=this.tune().forward*dt;
  }
  planRush(){
    const tune=this.tune(),budget=tune.capacity-this.enemies.length;
    if(budget<=0)return;
    const count=Math.min(budget,tune.groupSize+(this.random()<.35?1:0)),edges=[],id=++this.rushID;
    for(let i=0;i<count;i++){const enemy=this.planArrival({avoidEdges:edges.length<4?edges:[],delay:i===0?0:this.random()*.1,rushID:id});if(enemy)edges.push(enemy.edge);}
    this.emit('rush',{id,count:edges.length,edges});
  }
  planArrival({avoidEdges=[],delay=0,rushID=null}={}){
    const tune=this.tune();if(this.enemies.length>=tune.capacity)return null;
    const p=this.player,unit=this.width/VIEW.width;
    // Keep directions random without allowing long runs of identical entrances.
    const excluded=this.recentEdges.length===2&&this.recentEdges[0]===this.recentEdges[1]?this.recentEdges[0]:null;
    let choices=[['north',.56],['west',.19],['east',.19],['south',.06]].filter(([edge])=>!avoidEdges.includes(edge));
    if(choices.some(([edge])=>edge!==excluded))choices=choices.filter(([edge])=>edge!==excluded);
    let roll=this.random()*choices.reduce((sum,[,weight])=>sum+weight,0),edge='north';
    if(this.spawnID>0)for(const [candidate,weight] of choices){roll-=weight;if(roll<=0){edge=candidate;break;}}
    let x,z,spaced=false;
    for(let attempt=0;attempt<12;attempt++){
      const margin=unit*(3+this.random()*2+delay*(tune.speed+tune.forward));
      let sx,sy;
      if(edge==='north'){sx=this.width*(.05+this.random()*.9);sy=-margin;}
      else if(edge==='south'){sx=this.width*(.06+this.random()*.88);sy=this.height+unit*CHARACTER.height+margin;}
      else{sx=edge==='west'?-margin:this.width+margin;const target=projectPoint(p.x,p.z,this.camera,this.width,this.height);sy=clamp(target.y-unit*(4+this.random()*16),60,this.height-70);}
      const world=unprojectPoint(sx,sy,this.camera,this.width,this.height);x=world.x;z=world.z;
      if(outsideView(x,z,this.camera,this.width,this.height)&&Math.hypot(x-p.x,z-p.z)>4&&this.enemies.every(e=>Math.hypot(e.x-x,e.z-z)>1.8)){spaced=true;break;}
    }
    if(!spaced)return null;
    this.recentEdges.push(edge);if(this.recentEdges.length>2)this.recentEdges.shift();
    const variation=.94+this.random()*.12;
    const enemy=createDefender({id:++this.spawnID,x,z,speed:tune.speed*variation,pursuitSpeed:tune.pursuitSpeed*(1+(variation-1)/6),stage:this.startStage+Math.max(this.touchdowns,Math.floor((z+FIELD.endZone)/FIELD.stride)),pattern:this.random()<tune.interceptChance?'intercept':'pursuit',anticipation:tune.anticipation*(.9+this.random()*.2),turnResponse:tune.turnResponse,phase:this.random()*Math.PI*2});
    enemy.edge=edge;
    enemy.rushID=rushID;
    const dx=p.x-x,dz=p.z-z,d=Math.hypot(dx,dz)||1,speed=edge==='south'?tune.forward*1.35:enemy.speed;enemy.vx=dx/d*speed;enemy.vz=dz/d*speed;
    this.enemies.push(enemy);this.warnings.push({enemy,visible:true});this.emit('incoming',{id:enemy.id,edge,rushID});return enemy;
  }
  updateEnemy(e,dt){
    const p=this.player,dx=p.x-e.x,dz=p.z-e.z,distance=Math.hypot(dx,dz),lead=e.pattern==='intercept'?e.anticipation:.04;
    e.age+=dt;e.closestDistance=Math.min(e.closestDistance,distance);
    if(distance<2.15&&dz<.5)e.threatened=true;
    // Passed defenders settle into a near-running-speed chase instead of rapidly losing effort.
    const chase=clamp((dz-.25)/2,0,1),stamina=1-.04*clamp((dz-12)/20,0,1),rearEntry=e.edge==='south'&&!e.entered;
    const speed=rearEntry?Math.max(e.pursuitSpeed,this.tune().forward*1.35):mix(e.speed,e.pursuitSpeed??e.speed,chase)*stamina;
    const aimX=dx+p.vx*lead,aimZ=dz+p.vz*lead,length=Math.hypot(aimX,aimZ)||1;
    let avoidX=0,avoidZ=0;
    for(const other of this.enemies){if(other===e)continue;const dx=e.x-other.x,dz=e.z-other.z,d=Math.hypot(dx,dz);if(d>.01&&d<1.5){const weight=(1.5-d)/1.5;avoidX+=dx/d*weight;avoidZ+=dz/d*weight;}}
    const desired=limited(aimX/length*speed+avoidX*3,aimZ/length*speed+avoidZ*3,speed),desiredX=desired.x,desiredZ=desired.z,blend=damp(dt,e.turnResponse??.18);
    const change=limited((desiredX-e.vx)*blend,(desiredZ-e.vz)*blend,38*dt);
    e.vx+=change.x;e.vz+=change.z;e.x+=e.vx*dt;e.z+=e.vz*dt;
    const bounds=characterBounds(e.x,e.z,this.camera,this.width,this.height),outside=outsideView(e.x,e.z,this.camera,this.width,this.height);
    if(!outside&&!e.hasAppeared){e.hasAppeared=true;this.emit('arrival',{id:e.id,edge:e.edge,stage:e.stage,rushID:e.rushID});}
    if(!e.entered&&!outside&&(e.edge!=='south'||bounds.bottom<this.height*.95))e.entered=true;
    const view=visibleWorld(this.camera,this.width,this.height);
    if(e.z<view.minZ-12||(e.hasAppeared&&outside&&e.z<p.z-8&&e.z<view.minZ-2)||Math.abs(e.x)>FIELD.halfWidth+16)e.retired=true;
  }
  updateDodges(){
    const p=this.player;
    for(const e of this.enemies){
      const distance=Math.hypot(p.x-e.x,p.z-e.z);
      if(!e.rewarded&&e.threatened&&e.closestDistance>FIELD.playerRadius+FIELD.enemyRadius&&p.z-e.z>1.35&&distance>1.6&&distance>e.closestDistance+.3){
        e.rewarded=true;this.dodges++;this.dodgeScore+=50;this.score=this.runScore+this.dodgeScore+this.touchdownScore;p.glow=1;this.emit('dodge',{points:50,x:e.x,z:e.z,id:e.id});
      }
    }
  }
  updateTouchdowns(){
    while(this.furthestZ>=this.touchdowns*FIELD.stride+FIELD.length){this.touchdowns++;this.touchdownScore+=500;this.score=this.runScore+this.dodgeScore+this.touchdownScore;this.nextSpawn=Math.min(this.nextSpawn,.35);this.player.glow=1;this.emit('touchdown',{points:500,stage:this.startStage+this.touchdowns,x:this.player.x,z:this.player.z});}
  }
  updateRunScore(){
    this.runScore=Math.floor(this.distance/FIELD.unitsPerYard+1e-8);
    this.score=this.runScore+this.dodgeScore+this.touchdownScore;
  }
  update(dt){
    if(!this.alive)return;this.events=[];this.time+=dt;const p=this.player,oldX=p.x,oldZ=p.z;p.prevX=oldX;p.prevZ=oldZ;
    this.updateCamera(dt);this.updatePlayer(dt);this.furthestZ=Math.max(this.furthestZ,p.z);this.distance=Math.max(0,this.furthestZ-this.startZ);
    this.nextSpawn-=dt;
    if(this.nextSpawn<=0){this.planRush();this.nextSpawn=this.tune().interval*(.88+this.random()*.24);}
    for(const e of this.enemies){
      const ex=e.x,ez=e.z;e.prevX=ex;e.prevZ=ez;this.updateEnemy(e,dt);
      if(sweptHit(ex-oldX,ez-oldZ,e.x-p.x,e.z-p.z,FIELD.playerRadius+FIELD.enemyRadius)){this.alive=false;this.emit('collision',{x:p.x,z:p.z});return;}
    }
    this.updateRunScore();this.updateDodges();this.updateTouchdowns();this.enemies=this.enemies.filter(e=>!e.retired);
    this.warnings=this.enemies.filter(e=>outsideView(e.x,e.z,this.camera,this.width,this.height)&&(!e.hasAppeared||e.z>p.z-6)).map(enemy=>({enemy,visible:true}));
  }
}
