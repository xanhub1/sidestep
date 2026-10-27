export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const FIELD = { halfWidth: 4.7, playerRadius: .29, enemyRadius: .34, spawnZ: 44 };
export const DIFFICULTIES = {
  easy: { speed: .76, count: -.5, interval: 1.2, aggression: .55, progression: .6, gap: 3.15, forward: 7.5 },
  medium: { speed: 1, count: 0, interval: 1, aggression: 1, progression: 1, gap: 2.65, forward: 9 },
  hardcore: { speed: 1.3, count: 1.1, interval: .8, aggression: 1.5, progression: 1.5, gap: 2.2, forward: 11 },
};
const lerp = (a,b,t) => a+(b-a)*t;
const stages = [[0,1.5],[500,2.5],[1000,3.5],[2000,4.5],[4000,5.5],[7000,6.5],[14000,8]];
export function tuning(score, difficulty='medium') {
  const d=DIFFICULTIES[difficulty], p=Math.max(0,score)*d.progression;
  let count=8;
  for(let i=1;i<stages.length;i++) if(p<=stages[i][0]) {
    const a=stages[i-1],b=stages[i]; count=lerp(a[1],b[1],(p-a[0])/(b[0]-a[0])); break;
  }
  const pressure=1-Math.exp(-p/4300);
  return { speed:Math.min(24,(10+9*pressure)*d.speed), count:clamp(count+d.count,1,8),
    interval:Math.max(1.7,(3.4-1.05*pressure)*d.interval), aggression:(.16+.38*pressure)*d.aggression,
    gap:Math.max(1.85,d.gap-.35*pressure), forward:d.forward*(1+.2*pressure), pressure };
}
export function sweptHit(ax,az,bx,bz,radius) {
  const dx=bx-ax,dz=bz-az,t=clamp(-(ax*dx+az*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(ax+dx*t,az+dz*t)<radius;
}

export class Game {
  constructor({random=Math.random,onEvent=()=>{}}={}) {this.random=random;this.onEvent=onEvent;this.reset('medium');}
  reset(difficulty=this.difficulty) {
    this.difficulty=DIFFICULTIES[difficulty]?difficulty:'medium';this.time=0;this.distance=0;this.bonus=0;this.score=0;
    this.gaps=0;this.alive=true;this.player={x:0,vx:0,target:0,glow:0};this.enemies=[];this.warnings=[];this.waves=[];
    this.nextWave=.9;this.waveID=0;this.safeX=0;this.lastPlan=null;this.dragging=false;this.keyboard=0;this.events=[];
  }
  emit(type,detail={}) {const e={type,...detail};this.events.push(e);this.onEvent(e);}
  steer(delta) {this.dragging=true;this.player.target=clamp(this.player.target+delta,-4.36,4.36);}
  release() {this.dragging=false;this.player.target=this.player.x;}
  planWave() {
    const t=tuning(this.score,this.difficulty),id=++this.waveID;
    const count=clamp(Math.floor(t.count)+(this.random()<t.count%1?1:0),1,8);
    const gap=t.gap,limit=FIELD.halfWidth-gap/2-.28;
    // Route changes stay reachable even with the player's 140ms response and acceleration.
    const maxShift=Math.min(1.45,t.interval*1.05);
    this.safeX=clamp(this.safeX+(this.random()-.5)*2*maxShift,-limit,limit);
    const safeX=this.safeX, left=safeX-gap/2,right=safeX+gap/2;
    const pattern=this.score>1000?['line','chevron','stagger'][Math.floor(this.random()*3)]:'line';
    const speed=t.speed*(.98+this.random()*.04),side=count>=3&&this.random()<.35;
    // Do not let a later, faster formation overtake the previous safe route.
    const arrival=Math.max(this.time+.9+FIELD.spawnZ/speed,(this.lastPlan?.arrival??0)+Math.max(1.6,t.interval*.85));
    const warningDelay=arrival-this.time-FIELD.spawnZ/speed;
    const defs=[];
    const add=(x,lo,hi,index,fromSide=false)=>{
      const zOffset=pattern==='chevron'?Math.abs(x-safeX)*.12:pattern==='stagger'?(index%2)*.45:0;
      defs.push({id:`${id}-${index}`,wave:id,x,z:FIELD.spawnZ+zOffset,vx:0,speed,
        minX:lo,maxX:hi,home:x,phase:this.random()*Math.PI*2,aggression:t.aggression,pattern,
        side:fromSide,originX:fromSide?(x<0?-5.5:5.5):x,age:0});
    };
    if(count===1) {
      const x=safeX<0?right:left;
      add(x,x<safeX?-4.35:right,x<safeX?left:4.35,0);
    } else {
      const leftCount=clamp(Math.round(count*(left+4.35)/(8.7-gap)),1,count-1), rightCount=count-leftCount;
      for(let i=0;i<leftCount;i++) {
        const x=left-i*((left+4.35)/Math.max(1,leftCount));
        add(x,Math.max(-4.35,x-.22),Math.min(left,x+.22),defs.length,side&&i===leftCount-1&&x<-3.3);
      }
      for(let i=0;i<rightCount;i++) {
        const x=right+i*((4.35-right)/Math.max(1,rightCount));
        add(x,Math.max(right,x-.22),Math.min(4.35,x+.22),defs.length,side&&i===rightCount-1&&x>3.3);
      }
    }
    defs.sort((a,b)=>a.x-b.x);
    const wave={id,safeX,gap,arrival,pairs:[],enemies:defs};
    for(let i=0;i<defs.length-1;i++)wave.pairs.push({left:defs[i],right:defs[i+1],started:false,valid:true,done:false});
    this.waves.push(wave);
    for(const enemy of defs)this.warnings.push({enemy,remaining:warningDelay,duration:.9,visible:false});
    this.lastPlan={safeX,gap,arrival};
    this.emit('wave',{id,count,safeX,gap,speed,pattern});
  }
  update(dt) {
    if(!this.alive)return;
    this.events=[];this.time+=dt;
    const p=this.player,oldX=p.x;
    const desired=this.keyboard?this.keyboard*5.8:this.dragging?clamp((p.target-p.x)*11,-5.8,5.8):0;
    const blend=1-Math.exp(-dt/.14),accel=34;
    p.vx+=clamp((desired-p.vx)*blend,-accel*dt,accel*dt);
    p.x=clamp(p.x+p.vx*dt,-FIELD.halfWidth+FIELD.playerRadius+.05,FIELD.halfWidth-FIELD.playerRadius-.05);
    if(Math.abs(p.x)>=FIELD.halfWidth-FIELD.playerRadius-.051)p.vx=0;
    if(!this.dragging)p.target=p.x;
    p.glow=Math.max(0,p.glow-dt*2.4);
    const tune=tuning(this.score,this.difficulty);
    this.distance+=tune.forward*dt;this.score=Math.floor(this.distance*4)+this.bonus;
    this.nextWave-=dt;
    if(this.nextWave<=0){this.planWave();this.nextWave=tune.interval;}
    for(const warning of this.warnings) {
      warning.remaining-=dt;
      warning.visible=warning.remaining<=warning.duration;
      if(warning.remaining<=0) {
        const e=warning.enemy;e.x=e.originX;this.enemies.push(e);this.emit('arrival',{id:e.id});
      }
    }
    this.warnings=this.warnings.filter(w=>w.remaining>0);
    for(const e of this.enemies) {
      const oldEX=e.x,oldZ=e.z;e.age+=dt;
      // Each defender has a bounded lane: pursuit never seals the reserved route.
      let target=clamp(e.home+(p.x-e.home)*e.aggression+Math.sin(this.time*1.8+e.phase)*.09,e.minX,e.maxX);
      if(e.side&&e.age<1.1)target=e.home;
      const desiredVX=clamp((target-e.x)*3,-2.8,2.8);
      e.vx+=(desiredVX-e.vx)*(1-Math.exp(-dt/.2));e.x+=e.vx*dt;
      if(!e.side||e.age>1.1)e.x=clamp(e.x,e.minX,e.maxX);
      e.z-=e.speed*dt;
      if(sweptHit(oldEX-oldX,oldZ,e.x-p.x,e.z,FIELD.playerRadius+FIELD.enemyRadius)) {
        this.alive=false;this.emit('collision',{x:p.x,z:0});return;
      }
    }
    const clear=FIELD.playerRadius+FIELD.enemyRadius+.03;
    for(const wave of this.waves)for(const pair of wave.pairs) {
      if(pair.done)continue;
      const l=pair.left,r=pair.right;
      if(Math.min(l.z,r.z)<=clear) {
        pair.started=true;
        if(!(p.x>l.x+clear&&p.x<r.x-clear))pair.valid=false;
      }
      if(pair.started&&Math.max(l.z,r.z)<-clear) {
        pair.done=true;
        if(pair.valid) {
          this.bonus+=50;this.score=Math.floor(this.distance*4)+this.bonus;this.gaps++;p.glow=1;
          this.emit('gap',{points:50,x:(l.x+r.x)/2,z:(l.z+r.z)/2,pair:`${l.id}:${r.id}`});
        }
      }
    }
    this.enemies=this.enemies.filter(e=>e.z>-7);
    this.waves=this.waves.filter(w=>w.enemies.some(e=>e.z>-7));
  }
}
