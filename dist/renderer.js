import { VIEW, viewportBounds, clamp } from './engine.mjs';

export class Renderer{
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.effects=[];this.trail=[];
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.texture=document.createElement('canvas');this.texture.width=this.texture.height=220;
    const c=this.texture.getContext('2d');let seed=107;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<1000;i++){c.fillStyle=rand()>.5?'#b8d8840c':'#163f1c0e';c.fillRect(rand()*220,rand()*220,.7,1+rand()*2);}
    for(let i=0;i<7;i++){const x=rand()*195,y=rand()*195;for(let a=0;a<5;a++)for(let b=0;b<6;b++){c.fillStyle=`rgba(22,72,22,${.09+rand()*.13})`;c.fillRect(x+a*3.2+b*.3,y+b*3,1.4,1.8);}}
    this.grass=this.ctx.createPattern(this.texture,'repeat');this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
  }
  resize(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.unit=r.width/VIEW.width;const dpr=Math.min(devicePixelRatio||1,2.5);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.onResize?.(this.w,this.h);}
  project(x,z){return {x:this.w/2+x*this.unit,y:this.h*VIEW.anchor-z*this.unit*VIEW.verticalScale,s:1};}
  field(distance){
    const c=this.ctx,w=this.w,h=this.h,bounds=viewportBounds(w,h),scroll=distance*.34;
    c.fillStyle='#4b8c37';c.fillRect(0,0,w,h);
    const light=c.createLinearGradient(0,0,w,h);light.addColorStop(0,'#3e79221a');light.addColorStop(.5,'#77b64a14');light.addColorStop(1,'#19492216');c.fillStyle=light;c.fillRect(0,0,w,h);
    const offset=-(scroll%16);
    for(let z=bounds.minZ-20+offset;z<bounds.maxZ+24;z+=8){const y=this.project(0,z).y;c.fillStyle='#ffffff05';c.fillRect(0,y,w,4*this.unit*VIEW.verticalScale);}
    c.save();c.translate(0,(scroll*this.unit*VIEW.verticalScale)%220);c.fillStyle=this.grass;c.fillRect(0,-220,w,h+220);c.restore();
    const base=Math.floor((bounds.minZ+scroll)/8)*8-scroll;
    for(let z=base;z<bounds.maxZ+12;z+=8){
      const y=this.project(0,z).y;c.fillStyle='#e2e8cc';c.fillRect(0,y-2,w,4.5);c.fillStyle='#b4c39766';c.fillRect(0,y+2.5,w,1);
      const yard=((Math.round((scroll+z)/8)%10)+10)%10,number=yard<=5?yard*10:(10-yard)*10;
      if(number)for(const side of [-1,1]){const p=this.project(side*7.25,z+1.8);c.save();c.translate(p.x,p.y);c.rotate(side*Math.PI/2);c.scale(1,.83);c.fillStyle='#e0e7cbd9';c.font=`700 ${w*.15}px Arial`;c.textAlign='center';c.textBaseline='middle';c.fillText(String(number),0,0);c.restore();}
    }
    const hashBase=Math.floor((bounds.minZ+scroll)/.72)*.72-scroll;
    for(let z=hashBase;z<bounds.maxZ+3;z+=.72){const y=this.project(0,z).y;c.fillStyle='#dce7c5d6';for(const x of [-2.4,7.05]){const p=this.project(x,z);c.fillRect(p.x-.48*this.unit,y-1.1,.96*this.unit,2.4);}}
  }
  sphere(x,z,player,time,glow=0){
    const c=this.ctx,p=this.project(x,z),r=this.unit*(player?.53:.52);
    c.save();
    const shadow=c.createRadialGradient(p.x-r*.7,p.y+r*.72,0,p.x-r*.7,p.y+r*.72,r*1.9);shadow.addColorStop(0,'#153e1d9c');shadow.addColorStop(1,'#153e1d00');
    c.fillStyle=shadow;c.beginPath();c.ellipse(p.x-r*.7,p.y+r*.72,r*2,r*.72,-.55,0,Math.PI*2);c.fill();
    if(player&&glow){const halo=c.createRadialGradient(p.x,p.y,r*.5,p.x,p.y,r*2.6);halo.addColorStop(0,'#deff83aa');halo.addColorStop(1,'#deff8300');c.fillStyle=halo;c.beginPath();c.arc(p.x,p.y,r*2.6,0,Math.PI*2);c.fill();}
    const g=c.createRadialGradient(p.x-r*.35,p.y-r*.5,r*.02,p.x+r*.12,p.y+r*.2,r*1.25);
    if(player){g.addColorStop(0,'#c8eaff');g.addColorStop(.25,'#73bfff');g.addColorStop(.55,'#347ff3');g.addColorStop(.84,'#154bc4');g.addColorStop(1,'#15378b');}
    else{g.addColorStop(0,'#ffcfba');g.addColorStop(.24,'#ff8771');g.addColorStop(.55,'#e3483c');g.addColorStop(.84,'#b12827');g.addColorStop(1,'#7e221e');}
    c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();
    c.fillStyle='#ffffff70';c.beginPath();c.ellipse(p.x-r*.3,p.y-r*.46,r*.21,r*.12,-.6,0,Math.PI*2);c.fill();
    if(glow){c.strokeStyle=`rgba(234,255,166,${glow})`;c.lineWidth=1.7;c.beginPath();c.arc(p.x,p.y,r+2,0,Math.PI*2);c.stroke();}
    c.restore();
  }
  warning(w,time,player){
    if(!w.visible)return;const c=this.ctx,e=w.enemy,p=this.project(e.x,e.z),target=this.project(player.x+e.tangent.x*e.attackOffset,player.z+e.tangent.z*e.attackOffset);
    const x=clamp(p.x,15,this.w-15),y=clamp(p.y,20,this.h-20),pulse=this.reduced?1:1+Math.sin(time*8+e.phase)*.12,s=6*pulse;
    c.save();c.translate(x,y);c.fillStyle='#264e2a55';c.beginPath();c.arc(0,0,11,0,Math.PI*2);c.fill();c.rotate(Math.atan2(target.y-p.y,target.x-p.x));c.globalAlpha=.8+Math.sin(time*8)*.12;
    c.fillStyle='#ed432c';c.shadowColor='#601b184d';c.shadowBlur=4;c.beginPath();c.moveTo(s,0);c.lineTo(-s,-s*.7);c.lineTo(-s,s*.7);c.closePath();c.fill();c.restore();
  }
  burst(x,z,type='gap'){const p=this.project(x,z);this.effects.push({type,x:p.x/this.w,y:p.y/this.h,t:0});}
  clearEffects(){this.effects=[];this.trail=[];}
  draw(game,time,dt,{demo=false}={}){
    this.field(game.distance);const c=this.ctx;
    if(!demo&&!this.reduced){
      this.trail.push({x:game.player.x,z:game.player.z,t:0});if(this.trail.length>15)this.trail.shift();
      for(const p of this.trail){p.t+=dt;p.z-=dt*2.2;}
      for(let i=0;i<this.trail.length;i+=3){const p=this.trail[i],v=this.project(p.x,p.z);c.fillStyle=`rgba(180,224,255,${Math.max(0,.12-p.t*.4)})`;c.beginPath();c.arc(v.x,v.y,2,0,Math.PI*2);c.fill();}
    }
    for(const warning of game.warnings||[])this.warning(warning,time,game.player);
    const objects=game.enemies.map(e=>({...e,player:false}));objects.push({...game.player,player:true});objects.sort((a,b)=>b.z-a.z);
    for(const o of objects){const p=this.project(o.x,o.z);if(p.x>-30&&p.x<this.w+30&&p.y>-30&&p.y<this.h+30)this.sphere(o.x,o.z,o.player,time,o.player?game.player.glow:0);}
    for(const fx of this.effects){
      fx.t+=dt;const t=fx.t,x=fx.x*this.w,y=fx.y*this.h;
      if(fx.type==='gap'){
        const fade=clamp(1-(t-.45)/.7,0,1),scale=this.reduced?1:1+.2*Math.sin(Math.min(1,t/.2)*Math.PI);
        c.save();c.globalAlpha=fade;c.translate(x,y-20-t*36);c.scale(scale,scale);c.font=`italic 900 ${this.w*.078}px Arial`;c.textAlign='center';c.fillStyle='#f0ffc1';c.shadowColor='#3b741c';c.shadowBlur=7;c.fillText('+50',0,0);c.restore();
        if(!this.reduced)for(let i=0;i<14;i++){const angle=i*2.39996,speed=26+(i%4)*10;c.globalAlpha=fade*(1-t*.4);c.fillStyle=i%3===0?'#fffce8':'#d9ff7c';c.beginPath();c.arc(x+Math.cos(angle)*t*speed,y+Math.sin(angle)*t*speed-t*18,Math.max(.3,2*(1-t*.65)),0,Math.PI*2);c.fill();}c.globalAlpha=1;
      }else{c.save();c.globalAlpha=clamp(.26-t,0,.26);c.fillStyle='#ff815a';c.fillRect(0,0,this.w,this.h);c.restore();c.strokeStyle=`rgba(255,220,156,${clamp(1-t*2,0,1)})`;c.lineWidth=2;c.beginPath();c.arc(x,y,15+t*65,0,Math.PI*2);c.stroke();}
    }
    this.effects=this.effects.filter(f=>f.t<1.2);
  }
}
