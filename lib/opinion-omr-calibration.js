// Calibrate on printed circles, never on the guest's choice of answer.
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};

function project(markers, u, v) {
  const top = { x: markers.topLeft.x * (1-u) + markers.topRight.x*u, y: markers.topLeft.y*(1-u) + markers.topRight.y*u };
  const bottom = { x: markers.bottomLeft.x*(1-u) + markers.bottomRight.x*u, y: markers.bottomLeft.y*(1-u) + markers.bottomRight.y*u };
  return { x: top.x*(1-v)+bottom.x*v, y: top.y*(1-v)+bottom.y*v };
}

function unproject(markers, point) {
  let u = 0.75, v = 0.5;
  for (let i = 0; i < 8; i++) {
    const p = project(markers,u,v), pu = project(markers,u+0.001,v), pv = project(markers,u,v+0.001);
    const a=(pu.x-p.x)/0.001, b=(pv.x-p.x)/0.001, c=(pu.y-p.y)/0.001, d=(pv.y-p.y)/0.001;
    const det=a*d-b*c;
    if (Math.abs(det)<1) return null;
    const dx=point.x-p.x, dy=point.y-p.y;
    u+=(d*dx-b*dy)/det; v+=(a*dy-c*dx)/det;
  }
  return {u,v};
}

function ringCoverage(gray,width,height,point,rx,ry) {
  const pixel=(x,y)=>gray[Math.max(0,Math.min(height-1,Math.round(y)))*width+Math.max(0,Math.min(width-1,Math.round(x)))];
  let hits=0;
  for(let i=0;i<32;i++) {
    const angle=i*Math.PI/16, x=Math.cos(angle), y=Math.sin(angle);
    const outside=Math.max(pixel(point.x+x*rx*1.35,point.y+y*ry*1.35),pixel(point.x+x*rx*1.55,point.y+y*ry*1.55));
    const ring=Math.min(...[0.82,0.9,0.98,1.06].map(r=>pixel(point.x+x*rx*r,point.y+y*ry*r)));
    if(outside-ring>=32) hits++;
  }
  return hits/32;
}

function calibrateCircleGrid(gray,width,height,markers,candidates,template) {
  const span=(Math.hypot(markers.topRight.x-markers.topLeft.x,markers.topRight.y-markers.topLeft.y)+Math.hypot(markers.bottomRight.x-markers.bottomLeft.x,markers.bottomRight.y-markers.bottomLeft.y))/2;
  const circles=[];
  for(const candidate of candidates) {
    const ratio=candidate.width/candidate.height;
    if(candidate.width<span*0.022 || candidate.width>span*0.052 || candidate.height<span*0.022 || candidate.height>span*0.052 || ratio<0.72 || ratio>1.38) continue;
    const p=unproject(markers,candidate);
    if(!p || p.v<template.rows[0]-0.085 || p.v>template.rows.at(-1)+0.085) continue;
    const column=template.columns.findIndex(u=>Math.abs(u-p.u)<0.052);
    if(column<0) continue;
    const coverage=ringCoverage(gray,width,height,candidate,candidate.width/2,candidate.height/2);
    if(coverage<0.72) continue;
    circles.push({...candidate,...p,column,coverage});
  }
  circles.sort((a,b)=>a.v-b.v);
  const groups=[];
  for(const circle of circles) {
    let group=groups.at(-1);
    if(!group || Math.abs(circle.v-median(group.map(c=>c.v)))>0.012) groups.push(group=[]);
    group.push(circle);
  }
  const rows=groups.filter(group=>new Set(group.map(c=>c.column)).size>=3);
  if(rows.length!==template.rows.length) return null;
  const expectedSpan=template.rows.at(-1)-template.rows[0];
  const rowV=rows.map(row=>median(row.map(c=>c.v)));
  const scale=(rowV.at(-1)-rowV[0])/expectedSpan;
  if(scale<0.83 || scale>1.17) return null;
  if(rowV.some((v,i)=>Math.abs(v-(rowV[0]+(template.rows[i]-template.rows[0])*scale))>0.018)) return null;
  const colU=template.columns.map((u,col)=>{
    const values=circles.filter(c=>c.column===col).map(c=>c.u);
    return values.length?median(values):u;
  });
  if(colU.some((u,i)=>Math.abs(u-template.columns[i])>0.052)) return null;
  const radius=median(circles.map(c=>(c.width+c.height)/4));
  const points=rows.map((row,i)=>template.columns.map((u,col)=>{
    const matches=row.filter(c=>c.column===col).sort((a,b)=>b.coverage-a.coverage);
    return matches[0] || project(markers,colU[col],rowV[i]);
  }));
  const coverage=points.map(row=>row.map(p=>ringCoverage(gray,width,height,p,p.width?p.width/2:radius,p.height?p.height/2:radius)));
  // A strong X can hide the printed rim of the chosen alternative. Three
  // independently verified blank circles in every question row, together
  // with all four corner guides and the complete 12-row sequence, are enough
  // to infer the fourth coordinate without using the guest's mark as an
  // alignment anchor.
  if(coverage.some(row=>row.filter(value=>value>=0.65).length<3)) return null;
  return {points,horizontalSpan:span,bubbleRadius:radius,refinedRows:rows.length,calibrationMethod:'verified-three-of-four-circles',alignmentVerified:true,minRingCoverage:Math.min(...coverage.flat()),minVerifiedCirclesPerRow:Math.min(...coverage.map(row=>row.filter(value=>value>=0.65).length))};
}

function calibrateUnanchoredGrid(gray,width,height,candidates,template) {
  // The photo can be square (camera crop); trust the verified grid, not the
  // outer image aspect ratio. A sideways grid cannot match the question rows.
  const circles=candidates.filter(c=>c.x>width*.38 && c.y>height*.10 && c.y<height*.85 && c.width>width*.017 && c.width<width*.048 && c.height>width*.017 && c.height<width*.048 && c.width/c.height>.72 && c.width/c.height<1.38)
    .map(c=>({...c,coverage:ringCoverage(gray,width,height,c,c.width/2,c.height/2)})).filter(c=>c.coverage>=.72).sort((a,b)=>a.y-b.y);
  if(circles.length<template.rows.length*3) return null;
  const radius=median(circles.map(c=>(c.width+c.height)/4));
  const groups=[];
  for(const circle of circles) {
    let group=groups.at(-1);
    if(!group || Math.abs(circle.y-median(group.map(c=>c.y)))>radius*1.4) groups.push(group=[]);
    if(!group.some(c=>Math.hypot(c.x-circle.x,c.y-circle.y)<radius)) group.push(circle);
  }
  const rows=groups.filter(r=>r.length>=3 && r.length<=4).map(r=>r.sort((a,b)=>a.x-b.x));
  const full=rows.filter(r=>r.length===4 && r[3].x-r[0].x>width*.195);
  if(rows.length!==template.rows.length || full.length<2) return null;
  const columns=[0,1,2,3].map(i=>median(full.map(r=>r[i].x)));
  const gap=median(columns.slice(1).map((x,i)=>x-columns[i]));
  if(gap<width*.065 || gap>width*.19 || columns.slice(1).some((x,i)=>Math.abs((x-columns[i])/gap-1)>.20)) return null;
  const ys=rows.map(r=>median(r.map(c=>c.y)));
  const span=ys.at(-1)-ys[0], expectedSpan=template.rows.at(-1)-template.rows[0];
  if(span<height*.3 || ys.some((y,i)=>Math.abs((y-ys[0])/span-(template.rows[i]-template.rows[0])/expectedSpan)>.036)) return null;
  const points=[];
  for(const row of rows) {
    const assigned=columns.map(x=>row.filter(c=>Math.abs(c.x-x)<gap*.38).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0]);
    if(new Set(assigned.filter(Boolean)).size!==row.length) return null;
    const known=assigned.map((p,i)=>p?{p,i}:null).filter(Boolean);
    const first=known[0], last=known.at(-1);
    const dx=(last.p.x-first.p.x)/(last.i-first.i), dy=(last.p.y-first.p.y)/(last.i-first.i);
    if(Math.abs(dx/gap-1)>.2) return null;
    for(let col=0;col<4;col++) {
      if(assigned[col]) continue;
      const expected={x:first.p.x+(col-first.i)*dx,y:first.p.y+(col-first.i)*dy};
      let best=null;
      for(const ox of [-.25,0,.25]) for(const oy of [-.25,0,.25]) for(const scale of [.9,1,1.1]) {
        const p={x:expected.x+ox*radius,y:expected.y+oy*radius};
        const coverage=ringCoverage(gray,width,height,p,radius*scale,radius*scale);
        if(!best || coverage>best.coverage)best={...p,coverage,width:radius*2*scale,height:radius*2*scale};
      }
      if(best.coverage<.72) return null;
      assigned[col]=best;
    }
    points.push(assigned);
  }
  return {points,horizontalSpan:gap/.127,bubbleRadius:radius,refinedRows:rows.length,calibrationMethod:'verified-circle-grid',alignmentVerified:true,minRingCoverage:Math.min(...points.flat().map(p=>p.coverage)),box:{x:Math.round(columns[0]-radius),y:Math.round(ys[0]-radius),width:Math.round(columns[3]-columns[0]+2*radius),height:Math.round(span+2*radius),method:'verified-circle-grid'}};
}

function fitLine(points) {
  const mx=points.reduce((s,p)=>s+p[0],0)/points.length, my=points.reduce((s,p)=>s+p[1],0)/points.length;
  const den=points.reduce((s,p)=>s+(p[0]-mx)**2,0);
  const slope=den?points.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/den:0;
  return x=>my+slope*(x-mx);
}

function locatePrintedCircle(gray,width,height,expected,radius) {
  let best=null;
  for(const ox of [-.4,-.2,0,.2,.4]) for(const oy of [-.4,-.2,0,.2,.4]) for(const scale of [.9,1,1.1]) {
    const p={x:expected.x+ox*radius,y:expected.y+oy*radius};
    const coverage=ringCoverage(gray,width,height,p,radius*scale,radius*scale);
    const quality=coverage-Math.hypot(ox,oy)*.025-Math.abs(scale-1)*.025;
    if(!best || quality>best.quality) best={...p,width:2*radius*scale,height:2*radius*scale,coverage,quality};
  }
  return best.coverage>=.78?best:null;
}

// Crossed-out rows join all four outlines into one component; large X marks
// can also change a component's bounds. Recover coordinates from the other
// printed rows, then independently verify EVERY circle, never the answer ink.
function calibrateRecoveredGrid(gray,width,height,candidates,template) {
  const circles=candidates.filter(c=>c.x>width*.38 && c.y>height*.10 && c.y<height*.85 && c.width>width*.017 && c.width<width*.048 && c.height>width*.017 && c.height<width*.048 && c.width/c.height>.72 && c.width/c.height<1.38)
    .map(c=>({...c,coverage:ringCoverage(gray,width,height,c,c.width/2,c.height/2)})).filter(c=>c.coverage>=.78).sort((a,b)=>a.y-b.y);
  if(circles.length<template.rows.length*2) return null;
  const radius=median(circles.map(c=>(c.width+c.height)/4)),groups=[];
  for(const c of circles) {
    let g=groups.at(-1);
    if(!g || Math.abs(c.y-median(g.map(p=>p.y)))>radius*1.4) groups.push(g=[]);
    if(!g.some(p=>Math.hypot(p.x-c.x,p.y-c.y)<radius))g.push(c);
  }
  const full=groups.filter(r=>r.length===4).map(r=>r.sort((a,b)=>a.x-b.x)).filter(r=>{
    const gap=(r[3].x-r[0].x)/3;
    return gap>width*.065&&gap<width*.19&&r.slice(1).every((p,i)=>Math.abs((p.x-r[i].x)/gap-1)<.15);
  });
  if(full.length<Math.max(4,Math.ceil(template.rows.length*.4)))return null;
  const columns=[0,1,2,3].map(col=>fitLine(full.map(row=>[median(row.map(p=>p.y)),row[col].x])));
  const gap=median(full.map(row=>(row[3].x-row[0].x)/3));
  const rows=groups.map(g=>{
    const y=median(g.map(p=>p.y));
    const assigned=[0,1,2,3].map(col=>g.find(p=>Math.abs(p.x-columns[col](y))<gap*.22));
    return {y,assigned,count:assigned.filter(Boolean).length};
  }).filter(r=>r.count>=2);
  if(rows.length<template.rows.length*.65 || rows.length>template.rows.length)return null;
  const hypotheses=[];
  for(let first=0;first<=2;first++)for(let last=template.rows.length-3;last<template.rows.length;last++){
    const scale=(rows.at(-1).y-rows[0].y)/(template.rows[last]-template.rows[first]);
    const start=rows[0].y-scale*template.rows[first];
    if(scale*(template.rows.at(-1)-template.rows[0])<height*.3)continue;
    const indexes=rows.map(r=>template.rows.map((v,i)=>({i,d:Math.abs(r.y-start-scale*v)})).sort((a,b)=>a.d-b.d)[0]);
    if(new Set(indexes.map(p=>p.i)).size!==rows.length || indexes.some(p=>p.d>radius*1.1))continue;
    const predict=fitLine(rows.map((r,i)=>[template.rows[indexes[i].i],r.y]));
    hypotheses.push({indexes,predict,error:indexes.reduce((s,p)=>s+p.d,0)});
  }
  const verified=[];
  for(const h of hypotheses.sort((a,b)=>a.error-b.error).slice(0,3)) {
    const observed=new Map(rows.map((r,i)=>[h.indexes[i].i,r]));
    const points=[];
    for(let i=0;i<template.rows.length;i++){
      const y=h.predict(template.rows[i]),row=observed.get(i);
      const known=row?.assigned.filter(Boolean)||[];
      const rowLine=known.length>=2?fitLine(known.map(p=>[p.x,p.y])):null;
      const expected=[0,1,2,3].map(col=>{
        const x=columns[col](y);return{x,y:rowLine?rowLine(x):y};
      });
      // For an entirely joined row, interpolate its slope from neighboring rows.
      if(!rowLine){
        for(let col=0;col<4;col++){
          const samples=rows.flatMap((r,j)=>r.assigned[col]?[[template.rows[h.indexes[j].i],r.assigned[col].y]]:[]);
          if(samples.length>=3)expected[col].y=fitLine(samples)(template.rows[i]);
        }
      }
      const located=expected.map(p=>locatePrintedCircle(gray,width,height,p,radius));
      if(located.some(p=>!p))break;
      points.push(located);
    }
    if(points.length===template.rows.length)verified.push(points);
  }
  if(verified.length!==1)return null;
  const points=verified[0],flat=points.flat();
  const minX=Math.min(...flat.map(p=>p.x)),minY=Math.min(...flat.map(p=>p.y));
  return {points,horizontalSpan:gap/.127,bubbleRadius:radius,refinedRows:points.length,calibrationMethod:'verified-recovered-circles',alignmentVerified:true,minRingCoverage:Math.min(...flat.map(p=>p.coverage)),box:{x:Math.round(minX-radius),y:Math.round(minY-radius),width:Math.round(Math.max(...flat.map(p=>p.x))-minX+2*radius),height:Math.round(Math.max(...flat.map(p=>p.y))-minY+2*radius),method:'verified-recovered-circles'}};
}

module.exports={calibrateCircleGrid,calibrateUnanchoredGrid,calibrateRecoveredGrid,ringCoverage,project,unproject};
