import { FIELD, clamp } from './engine.mjs';

export class Renderer {
  constructor(canvas) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.w=390;this.h=693;
    this.effects=[];this.trail=[];this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.texture=document.createElement('canvas');this.texture.width=this.texture.height=160;
    const c=this.texture.getContext('2d');let seed=107;
    const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<1400;i++){c.fillStyle=rand()>.5?'#ffffff17':'#001b132a';c.fillRect(rand()*160,rand()*160,.6,1+rand()*2);}
    this.grass=this.ctx.createPattern(this.texture,'repeat');
    this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
  }
  resize(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;const dpr=Math.min(devicePixelRatio||1,2.5);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);}
  project(x,z){const s=1/(1+z*.024);return{x:this.w/2+x*this.w/11.7*s,y:this.h*(.82-.027*z*s),s};}
  polygon(points,fill){const c=this.ctx;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle=fill;c.fill();}
  strip(z1,z2,x1,x2,fill){this.polygon([this.project(x1,z1),this.project(x2,z1),this.project(x2,z2),this.project(x1,z2)],fill);}
  field(distance){
    const c=this.ctx,w=this.w,h=this.h;c.fillStyle='#214e32';c.fillRect(0,0,w,h);
    const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#315b32');bg.addColorStop(.5,'#3c7d3a');bg.addColorStop(1,'#4b8c3e');
    this.strip(-8,100,-5.1,5.1,bg);
    const offset=-(distance%10);
    for(let z=-20+offset;z<100;z+=5){const index=Math.round((z-offset)/5);if(Math.abs(index%2)===0)this.strip(z,z+5,-4.96,4.96,'#b5d87d0c');}
    c.save();c.beginPath();const corners=[this.project(-5,-8),this.project(5,-8),this.project(5,100),this.project(-5,100)];corners.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();c.fillStyle=this.grass;c.fillRect(0,0,w,h);c.restore();
    this.strip(-8,100,-5.05,-4.93,'#dbe9cbaa');this.strip(-8,100,4.93,5.05,'#dbe9cbaa');
    this.strip(-8,100,-4.85,-4.81,'#dbe9cb36');this.strip(-8,100,4.81,4.85,'#dbe9cb36');
    const first=-20-(distance%10);
    for(let z=first;z<100;z+=10){
      const a=this.project(-4.93,z),b=this.project(4.93,z);c.strokeStyle='#e2edcf80';c.lineWidth=1.5*a.s;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
      const yard=((Math.round((distance+z)/10)%10)+10)%10;const number=yard<=5?yard*10:(10-yard)*10;
      if(number>0&&z>-5){
        for(const side of [-1,1]){const p=this.project(side*3.8,z+2.3);c.save();c.translate(p.x,p.y);c.scale(p.s,p.s*.72);c.rotate(side*Math.PI/2);c.fillStyle='#deebcc66';c.font=`800 ${w*.068}px Arial`;c.textAlign='center';c.textBaseline='middle';c.fillText(String(number),0,0);c.restore();}
      }
    }
    for(let z=-10-(distance%2);z<90;z+=2){for(const x of [-4.73,-1.6,1.6,4.73]){const a=this.project(x-.09,z),b=this.project(x+.09,z);c.strokeStyle='#e0edc58f';c.lineWidth=1.3*a.s;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}}
    // Quiet corner accents give the field a little stadium atmosphere.
    for(const z of [12,38,64])for(const x of [-5.32,5.32]){const p=this.project(x,z);c.fillStyle='#c6dc9540';c.fillRect(p.x-1,p.y-3*p.s,2,6*p.s);}
  }
  sphere(x,z,isPlayer,time,glow=0,alpha=1){
    const c=this.ctx,p=this.project(x,z),r=this.w/11.7*(isPlayer?.46:.43)*p.s;
    c.save();c.globalAlpha=alpha;
    const shadow=c.createRadialGradient(p.x+r*.23,p.y+r*.75,0,p.x+r*.23,p.y+r*.75,r*1.9);shadow.addColorStop(0,'#092e20b0');shadow.addColorStop(1,'#092e2000');
    c.fillStyle=shadow;c.beginPath();c.ellipse(p.x+r*.23,p.y+r*.8,r*1.9,r*.65,0,0,Math.PI*2);c.fill();
    if(isPlayer){
      const halo=c.createRadialGradient(p.x,p.y,r*.6,p.x,p.y,r*(2.4+glow));halo.addColorStop(0,glow?'#dbff7a55':'#69baff38');halo.addColorStop(1,'#69baff00');c.fillStyle=halo;c.beginPath();c.arc(p.x,p.y,r*(2.4+glow),0,Math.PI*2);c.fill();
      c.strokeStyle=glow?'#e0ff9aaf':'#add5ff65';c.lineWidth=1;c.beginPath();c.ellipse(p.x,p.y+r*.7,r*1.38,r*.47,0,0,Math.PI*2);c.stroke();
    }
    const g=c.createRadialGradient(p.x-r*.4,p.y-r*.48,r*.02,p.x+r*.16,p.y+r*.28,r*1.35);
    if(isPlayer){g.addColorStop(0,'#b3e2ff');g.addColorStop(.27,'#68b6ff');g.addColorStop(.55,'#3283f5');g.addColorStop(.82,'#1450bb');g.addColorStop(1,'#143e86');}
    else{g.addColorStop(0,'#ffd0ae');g.addColorStop(.26,'#ff9480');g.addColorStop(.53,'#f56359');g.addColorStop(.8,'#c73840');g.addColorStop(1,'#8e2639');}
    c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();
    c.save();c.beginPath();c.arc(p.x,p.y,r*.97,0,Math.PI*2);c.clip();
    c.strokeStyle=isPlayer?'#b8dfff27':'#ffceba25';c.lineWidth=r*.08;c.beginPath();c.ellipse(p.x,p.y+r*.08,r*1.1,r*.33,.2+Math.sin(time*.6+x)*.3,0,Math.PI*2);c.stroke();c.restore();
    c.fillStyle='#ffffff50';c.beginPath();c.ellipse(p.x-r*.34,p.y-r*.45,r*.28,r*.13,-.6,0,Math.PI*2);c.fill();
    if(glow){c.strokeStyle=`rgba(221,255,144,${glow*.85})`;c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,r+2,0,Math.PI*2);c.stroke();}
    c.restore();
  }
  warning(w,time){
    if(!w.visible)return;
    const c=this.ctx,e=w.enemy,side=e.side;
    const pos=this.project(side?e.originX:e.x,FIELD.spawnZ),x=clamp(pos.x,14,this.w-14),y=pos.y-12;
    const pulse=this.reduced?1:1+Math.sin(time*9+e.x)*.12,s=6*pulse;
    c.save();c.translate(x,y);if(side)c.rotate(e.originX<0?-Math.PI/2:Math.PI/2);c.globalAlpha=.65+Math.sin(time*9)*.2;
    c.shadowColor='#ff594d';c.shadowBlur=9;c.fillStyle='#ff7667';c.beginPath();c.moveTo(-s,-s*.6);c.lineTo(s,-s*.6);c.lineTo(0,s);c.closePath();c.fill();c.shadowBlur=0;
    c.fillStyle='#ffaca136';c.fillRect(-s*.4,-s*1.6,s*.8,s*.4);c.restore();
  }
  burst(x,z,type='gap'){
    const p=this.project(x,z);this.effects.push({type,x:p.x/this.w,y:p.y/this.h,t:0});
  }
  clearEffects(){this.effects=[];this.trail=[];}
  draw(game,time,dt,{demo=false}={}){
    this.field(game.distance);
    const c=this.ctx;
    if(!demo){this.trail.push({x:game.player.x,t:0});if(this.trail.length>12)this.trail.shift();for(const p of this.trail)p.t+=dt;
      if(!this.reduced)for(let i=0;i<this.trail.length;i+=2){const p=this.trail[i],v=this.project(p.x,-p.t*8-1);c.fillStyle=`rgba(153,208,255,${.13*(1-p.t/1.2)})`;c.beginPath();c.ellipse(v.x,v.y,2*v.s,4*v.s,0,0,Math.PI*2);c.fill();}}
    for(const w of game.warnings||[])this.warning(w,time);
    const playerZ=demo&&this.w<480&&matchMedia('(max-width:700px)').matches?17:0;
    const objects=game.enemies.filter(e=>e.z<75&&e.z>-7).map(e=>({...e,isPlayer:false}));
    objects.push({x:game.player.x,z:playerZ,isPlayer:true});objects.sort((a,b)=>b.z-a.z);
    for(const o of objects)this.sphere(o.x,o.z,o.isPlayer,time,o.isPlayer?game.player.glow:0);
    for(const fx of this.effects){
      fx.t+=dt;const t=fx.t,x=fx.x*this.w,y=fx.y*this.h;
      if(fx.type==='gap'){
        const fade=clamp(1-(t-.45)/.7,0,1),scale=this.reduced?1:1+.2*Math.sin(Math.min(1,t/.2)*Math.PI);
        c.save();c.globalAlpha=fade;c.translate(x,y-25-t*42);c.scale(scale,scale);c.font=`900 ${this.w*.067}px Arial`;c.textAlign='center';c.fillStyle='#e5ff9e';c.shadowColor='#99ff6e';c.shadowBlur=14;c.fillText('+50',0,0);c.restore();
        if(!this.reduced)for(let i=0;i<14;i++){const angle=i*2.39996,speed=28+(i%4)*12,px=x+Math.cos(angle)*t*speed,py=y+Math.sin(angle)*t*speed-t*18;c.globalAlpha=fade*(1-t*.4);c.fillStyle=i%3===0?'#faffda':'#d2ff7c';c.beginPath();c.arc(px,py,Math.max(.3,2*(1-t*.65)),0,Math.PI*2);c.fill();}c.globalAlpha=1;
      }else{
        c.save();c.globalAlpha=clamp(.3-t,0,.3);c.fillStyle='#ff8268';c.fillRect(0,0,this.w,this.h);c.restore();
        c.strokeStyle=`rgba(255,183,139,${clamp(1-t*2,0,1)})`;c.lineWidth=2;c.beginPath();c.arc(x,y,20+t*75,0,Math.PI*2);c.stroke();
      }
    }
    this.effects=this.effects.filter(f=>f.t<1.2);
  }
}
