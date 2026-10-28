import { FIELD, VIEW, CHARACTER, projectPoint, unprojectPoint, visibleWorld, stageAppearance, clamp } from './engine.mjs';

export function warningSize(distance,width=390){return (3+8*Math.pow(clamp((42-distance)/36,0,1),1.25))*clamp(width/390,.85,1.4);}

export class Renderer{
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.effects=[];this.camera={x:-2,z:4};
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.texture=document.createElement('canvas');this.texture.width=this.texture.height=220;
    const c=this.texture.getContext('2d');let seed=107;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<1000;i++){c.fillStyle=rand()>.5?'#c2d98c0c':'#183b170f';c.fillRect(rand()*220,rand()*220,.7,1+rand()*2);}
    for(let i=0;i<7;i++){const x=rand()*195,y=rand()*195;for(let a=0;a<5;a++)for(let b=0;b<6;b++){c.fillStyle=`rgba(20,49,18,${.09+rand()*.13})`;c.fillRect(x+a*3.2+b*.3,y+b*3,1.4,1.8);}}
    this.grass=this.ctx.createPattern(this.texture,'repeat');this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
  }
  resize(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.unit=r.width/VIEW.width;const dpr=Math.min(devicePixelRatio||1,2.5);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.onResize?.(this.w,this.h);}
  project(x,z){return projectPoint(x,z,this.camera,this.w,this.h);}
  dragDelta(dx,dy,player){const p=this.project(player.x,player.z),next=unprojectPoint(p.x+dx*.95,p.y+dy*.95,this.camera,this.w,this.h);return {x:next.x-player.x,z:next.z-player.z};}
  worldRect(x1,z1,x2,z2,color){
    const c=this.ctx,points=[[x1,z1],[x2,z1],[x2,z2],[x1,z2]].map(([x,z])=>this.project(x,z));
    c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill();
  }
  field(){
    const c=this.ctx,w=this.w,h=this.h,view=visibleWorld(this.camera,w,h),low=view.minZ-5,high=view.maxZ+5,hw=FIELD.halfWidth;
    c.fillStyle='#677440';c.fillRect(0,0,w,h);
    const first=Math.max(0,Math.floor(low/FIELD.stride)),last=Math.max(first,Math.floor(high/FIELD.stride));
    for(let stage=first;stage<=last;stage++){
      const base=stage*FIELD.stride,start=stage===0?Math.min(-100,low):base,goal=base+FIELD.length,end=base+FIELD.stride;
      const appearance=stageAppearance(stage+(this.startStage??0));
      this.worldRect(-hw,start,hw,goal,appearance.turf);
      for(let z=Math.max(start,Math.floor((low-base)/10)*10+base);z<Math.min(goal,high+10);z+=10)this.worldRect(-hw,z,hw,z+5,'#ffffff05');
      this.worldRect(-hw,goal,hw,end,appearance.endZone);
      for(let z=Math.max(base,Math.ceil((low-base)/10)*10+base);z<=Math.min(goal,high);z+=10){
        this.worldRect(-hw,z-.095,hw,z+.095,'#e7e7cf');
        const yard=Math.round((z-base)/2),number=yard<=50?yard:100-yard;
        if(number>0&&yard%10===0)for(const side of [-1,1]){
          const p=this.project(side*8,z+1.8);c.save();c.translate(p.x,p.y);c.rotate(side*Math.PI/2);c.scale(p.s,p.s*.86);c.fillStyle='#e8e8cbd9';c.font=`italic 800 ${this.unit*2.05}px Arial`;c.textAlign='center';c.textBaseline='middle';c.fillText(String(number),0,0);c.restore();
        }
      }
      for(let z=Math.max(base,Math.ceil(low));z<Math.min(goal,high);z++)if(Math.abs((z-base)%10)>.2)for(const x of [-5.2,5.2,1.1-hw,hw-1.1])this.worldRect(x-.55,z-.06,x+.55,z+.06,'#e5e9cedb');
      this.worldRect(-hw,goal-.14,hw,goal+.14,'#f0e5b3');
      if(goal>low-15&&goal<high+15){
        const p=this.project(0,goal+7);c.save();c.translate(p.x,p.y);c.scale(p.s,p.s*.85);c.fillStyle='#ffffff35';c.font=`italic 900 ${this.unit*1.6}px Arial`;c.textAlign='center';c.fillText('SIDESTEP',0,0);c.restore();
      }
    }
    this.worldRect(-hw,low,.2-hw,high,'#e7e7cf');this.worldRect(hw-.2,low,hw,high,'#e7e7cf');
    c.save();c.translate(-this.camera.x*this.unit,(this.camera.z*this.unit*VIEW.verticalScale)%220);c.fillStyle=this.grass;c.fillRect(this.camera.x*this.unit,-220,w,h+440);c.restore();
    const light=c.createLinearGradient(0,0,w,h);light.addColorStop(0,'#345b1712');light.addColorStop(.5,'#a8cf6110');light.addColorStop(1,'#1e401416');c.fillStyle=light;c.fillRect(0,0,w,h);
  }
  cylinder(x,z,player,time,glow=0,opacity=1,stage=0){
    const c=this.ctx,p=this.project(x,z),r=this.unit*(player?CHARACTER.playerRadius:CHARACTER.enemyRadius)*p.s,ry=r*CHARACTER.ellipse,height=this.unit*CHARACTER.height*p.s,top=p.y-height,appearance=stageAppearance(stage);
    c.save();c.globalAlpha=opacity;
    const shadow=c.createRadialGradient(p.x-r*.65,p.y+r*.48,0,p.x-r*.65,p.y+r*.48,r*2.6);shadow.addColorStop(0,'#19351ba0');shadow.addColorStop(1,'#19351b00');
    c.fillStyle=shadow;c.beginPath();c.ellipse(p.x-r*.65,p.y+r*.48,r*2.5,r*.8,-.55,0,Math.PI*2);c.fill();
    if(player&&glow){const halo=c.createRadialGradient(p.x,p.y,r*.3,p.x,p.y,r*2.7);halo.addColorStop(0,'#deff8399');halo.addColorStop(1,'#deff8300');c.fillStyle=halo;c.beginPath();c.ellipse(p.x,p.y,r*2.7,r*1.6,0,0,Math.PI*2);c.fill();}
    const body=c.createLinearGradient(p.x-r,0,p.x+r,0),colors=player?['#123ba5','#2573ef','#4094ff','#1848af']:appearance.body;
    colors.forEach((color,i)=>body.addColorStop([0,.27,.58,1][i],color));
    c.fillStyle=body;c.beginPath();c.moveTo(p.x-r,top);c.lineTo(p.x-r,p.y);c.ellipse(p.x,p.y,r,ry,0,Math.PI,0,true);c.lineTo(p.x+r,top);c.closePath();c.fill();
    const cap=c.createLinearGradient(p.x-r,top-ry,p.x+r,top+ry);cap.addColorStop(0,player?'#a8dcff':appearance.cap[0]);cap.addColorStop(.45,player?'#72bfff':appearance.cap[1]);cap.addColorStop(1,player?'#397eec':appearance.cap[2]);
    c.fillStyle=cap;c.beginPath();c.ellipse(p.x,top,r,ry,0,0,Math.PI*2);c.fill();c.strokeStyle='#fff5';c.lineWidth=.8;c.stroke();
    c.strokeStyle='#ffffff27';c.lineWidth=1.2;c.beginPath();c.moveTo(p.x-r*.43,top+ry*.8);c.lineTo(p.x-r*.43,p.y-ry*.4);c.stroke();
    if(glow){c.strokeStyle=`rgba(234,255,166,${glow})`;c.lineWidth=1.7;c.beginPath();c.ellipse(p.x,p.y+ry*.1,r*1.4,ry*1.6,0,0,Math.PI*2);c.stroke();}
    c.restore();
  }
  warning(w,time,player){
    const c=this.ctx,e=w.enemy,p=this.project(e.x,e.z),target=this.project(player.x,player.z),s=warningSize(Math.hypot(e.x-player.x,e.z-player.z),this.w),padding=s*1.7+3,x=clamp(p.x,padding,this.w-padding),y=clamp(p.y,padding,this.h-padding);
    c.save();c.translate(x,y);c.fillStyle='#264e2a66';c.beginPath();c.arc(0,0,s*1.5,0,Math.PI*2);c.fill();c.rotate(Math.atan2(target.y-p.y,target.x-p.x));c.fillStyle=stageAppearance(e.stage).warning;c.beginPath();c.moveTo(s,0);c.lineTo(-s,-s*.7);c.lineTo(-s,s*.7);c.closePath();c.fill();c.restore();return s;
  }
  burst(x,z,type='dodge'){this.effects.push({type,x,z,t:0});}
  clearEffects(){this.effects=[];}
  drawEffects(dt){
    const c=this.ctx;
    for(const fx of this.effects){
      fx.t+=dt;const t=fx.t,p=this.project(fx.x,fx.z),fade=clamp((1.2-t)/.4,0,1);
      if(fx.type==='dodge'){
        c.save();c.globalAlpha=fade;c.translate(clamp(p.x,57,this.w-57),p.y-36-t*20);c.fillStyle='#ffe88b';c.strokeStyle='#ffe88b';c.lineWidth=1.5;
        c.shadowColor='#3a341d';c.shadowBlur=5;c.textAlign='center';c.font=`italic 900 ${this.w*.047}px Arial`;c.fillText('DODGE',0,-7);c.font=`italic 900 ${this.w*.06}px Arial`;c.fillText('+50',0,16);
        c.beginPath();c.moveTo(-42,-18);c.lineTo(-49,-18);c.lineTo(-49,22);c.lineTo(-42,22);c.moveTo(42,-18);c.lineTo(49,-18);c.lineTo(49,22);c.lineTo(42,22);c.stroke();c.restore();
      }else if(fx.type==='touchdown'){
        c.save();c.globalAlpha=fade;c.translate(this.w/2,this.h*.28);const size=this.w*.078;c.font=`italic 900 ${size}px Arial`;c.textAlign='center';c.strokeStyle='#51401c';c.lineWidth=4;c.strokeText('TOUCHDOWN',0,0);c.fillStyle='#ffe784';c.fillText('TOUCHDOWN',0,0);c.font=`italic 900 ${size*.9}px Arial`;c.fillText('+500',0,size*1.1);
        if(!this.reduced)for(let i=0;i<24;i++){const angle=i*2.39996,r=30+t*(40+i%4*20);c.fillStyle=i%2?'#fff1b8':'#eeb844';c.fillRect(Math.cos(angle)*r,-20+Math.sin(angle)*r+t*t*35,3,6);}c.restore();
      }else{
        c.save();c.translate(p.x,p.y-10);c.globalAlpha=clamp(1-(t-.5)/.35,0,1);
        for(let i=0;i<13;i++){const a=i*2.39996,r=(this.reduced?12:10+Math.min(t,.45)*45)*(i%3+2)/3;c.fillStyle=i%2?'#f2ecdc':'#d5d5bd';c.beginPath();c.arc(Math.cos(a)*r,Math.sin(a)*r*.65,12+(i%4)*2,0,Math.PI*2);c.fill();}
        c.fillStyle='#413b27';c.textAlign='center';c.font=`italic 900 ${this.w*.067}px Arial`;c.fillText('TACKLED!',0,5);c.restore();
      }
    }
    this.effects=this.effects.filter(f=>f.t<(f.type==='collision'?.9:1.2));
  }
  draw(game,time,dt,{demo=false,alpha=1}={}){
    const t=clamp(alpha,0,1),interpolate=o=>({...o,x:(o.prevX??o.x)+(o.x-(o.prevX??o.x))*t,z:(o.prevZ??o.z)+(o.z-(o.prevZ??o.z))*t});
    this.camera=interpolate(game.camera);this.startStage=game.startStage??0;this.field();const player=interpolate(game.player);
    for(const warning of game.warnings||[])this.warning(warning,time,player);
    const objects=game.enemies.map(e=>({...interpolate(e),player:false}));objects.push({...player,player:true});objects.sort((a,b)=>b.z-a.z);
    for(const o of objects){const p=this.project(o.x,o.z);if(p.x>-40&&p.x<this.w+40&&p.y>-40&&p.y<this.h+50)this.cylinder(o.x,o.z,o.player,time,o.player?game.player.glow:0,o.opacity??1,o.stage??0);}
    if(!demo)this.drawEffects(dt);
  }
}
