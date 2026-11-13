import { WORLD } from './engine.js';

/** A fully local, clearly labeled compatibility renderer using the same simulation. */
export function createFallbackWorld(container, { onSelect = () => {}, onMove = () => {} } = {}) {
  const canvas = document.createElement('canvas');
  container.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  let state = null, width = 1, height = 1, scale = 1;
  const project = (x,z,y=0) => ({x:width*.52+(x-z*.48)*scale,y:height*.48+(z*.59+x*.18-y)*scale,visible:true});
  function resize() {width=container.clientWidth;height=container.clientHeight;scale=Math.min(width/31,height/24);canvas.width=width*devicePixelRatio;canvas.height=height*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);}
  function poly(points,fill,stroke) {ctx.beginPath();points.forEach(([x,z],i)=>{const p=project(x,z);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
  function orb(x,z,color,r=9,label='') {const p=project(x,z,.35);ctx.shadowColor=color;ctx.shadowBlur=15;ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;if(label){ctx.fillStyle='#f9f3dc';ctx.font='11px Georgia';ctx.textAlign='center';ctx.fillText(label,p.x,p.y-17);}}
  function render(next) {
    state=next;ctx.fillStyle='#102635';ctx.fillRect(0,0,width,height);
    for(let i=0;i<70;i++){const x=((i*137.5)%width),y=((i*77.3)%(height*.6));ctx.fillStyle=i%3?'#f0d6a265':'#e9e3cba0';ctx.fillRect(x,y,1.5,1.5);}
    const bank=(x0,x1)=>{poly([[x0,-7],[x1,-7],[x1,7],[x0,7]],'#487861','#95ad88');};
    if(state.scene==='garden') bank(-11,11); else {bank(-11,-2.4);bank(2.4,11);poly([[-2.4,-7],[2.4,-7],[2.4,7],[-2.4,7]],'#276d7b');}
    if(state.scene==='stream') {
      for(const [route,z] of [['ferry',4],['canopy',-4]]) if(state[route].complete){poly([[-2.9,z-.45],[2.9,z-.45],[2.9,z+.45],[-2.9,z+.45]],route==='ferry'?'#8fae75':'#baa97a');}
      orb(-6.4,3,'#f7e7ca',11,'Lily');orb(-6.4,-3,'#be855d',11,'Mono');
      if(state.star==='basket') orb(-9,0,'#f7d474',8,'Star');
      if(state.star==='nest') orb(8,0,'#f7d474',11,'Home');
    }
    for(const landmark of Object.values(WORLD[state.scene].landmarks)){
      const p=project(landmark.x,landmark.z);ctx.fillStyle='#e9d49f99';ctx.beginPath();ctx.ellipse(p.x,p.y,11,6,0,0,7);ctx.fill();
      if(state.scene==='garden'&&state.garden.placements[landmark.id])orb(landmark.x,landmark.z,state.garden.placements[landmark.id]==='pond'?'#8ae5dd':'#c6b7ee',14,'❋');
    }
    if(state.moonprint)orb(state.moonprint.x,state.moonprint.z,'#b7e8f6',12,'Moonprint');
    orb(state.player.x,state.player.z,'#efb789',10,'Rosalie');orb(state.player.x+.85,state.player.z,'#d2f6f8',7);
    if(state.star==='carried')orb(state.player.x-.7,state.player.z,'#ffe29a',5);
  }
  function pointer(event){if(!state||state.paused)return;const rect=canvas.getBoundingClientRect();const p={x:event.clientX-rect.left,y:event.clientY-rect.top};let closest=null,d=Infinity;for(const l of Object.values(WORLD[state.scene].landmarks)){const q=project(l.x,l.z);const n=Math.hypot(q.x-p.x,q.y-p.y);if(n<d){d=n;closest=l;}}if(d<32){onSelect(closest.id);return;}const u=(p.x-width*.52)/scale,v=(p.y-height*.48)/scale;const z=(v-.18*u)/(.59+.18*.48);onMove({x:u+.48*z,z});}
  canvas.addEventListener('pointerup',pointer);window.addEventListener('resize',resize);resize();
  return {render,resize,project,setReducedMotion(){},getInfo(){return{renderer:'Canvas2D',engine:'Compatibility map',contextLost:false,triangles:0,drawCalls:0};},dispose(){canvas.removeEventListener('pointerup',pointer);window.removeEventListener('resize',resize);canvas.remove();}};
}
