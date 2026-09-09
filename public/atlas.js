const viewport = document.querySelector('.map-viewport'), canvas = document.querySelector('.map-canvas'), popup = document.querySelector('.atlas-popup');
if (viewport && canvas) {
  let scale = Math.max(5, 6000 / viewport.clientWidth), x = 0, y = 0, frame = 0, selected = popup.dataset.selectedPlace, dragged = false;
  const pointers = new Map();
  let gesture;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function paint() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const width = canvas.offsetWidth * scale, height = canvas.offsetHeight * scale;
      x = width < viewport.clientWidth ? (viewport.clientWidth-width)/2 : clamp(x, viewport.clientWidth-width, 0);
      y = height < viewport.clientHeight ? (viewport.clientHeight-height)/2 : clamp(y, viewport.clientHeight-height, 0);
      canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      canvas.style.setProperty('--map-scale', scale);
      viewport.dataset.zoom = scale.toFixed(3);
      if (selected && !popup.hidden && viewport.clientWidth > 650) {
        const pin = canvas.querySelector(`[data-pin="${CSS.escape(selected)}"]`);
        const px = x + parseFloat(pin.style.left)/100*width, py = y+parseFloat(pin.style.top)/100*height;
        popup.style.left = `${clamp(px+24,12,viewport.clientWidth-popup.offsetWidth-12)}px`;
        popup.style.top = `${clamp(py-popup.offsetHeight/2,12,viewport.clientHeight-popup.offsetHeight-12)}px`;
      }
    });
  }
  function zoomTo(next, px=viewport.clientWidth/2, py=viewport.clientHeight/2) {
    const old=scale; scale=clamp(next,1,32);
    x=px-(px-x)*scale/old; y=py-(py-y)*scale/old; paint();
  }
  function center() { x=viewport.clientWidth/2-canvas.offsetWidth*scale*Number(canvas.dataset.focusX); y=viewport.clientHeight/2-canvas.offsetHeight*scale*Number(canvas.dataset.focusY); paint(); }
  function closePopup(focus=false) {
    popup.hidden=true; canvas.querySelectorAll('[data-pin]').forEach(p=>p.removeAttribute('aria-current'));
    if(focus && selected) canvas.querySelector(`[data-pin="${CSS.escape(selected)}"]`)?.focus({preventScroll:true});
    selected=''; const url=new URL(location); url.searchParams.delete('place');url.searchParams.delete('ticket');history.replaceState(null,'',url);
  }
  function bindPopup() {
    popup.querySelector('.atlas-close')?.addEventListener('click',event=>{event.preventDefault();closePopup(true);});
    popup.querySelector('[data-popup-ticket]')?.addEventListener('change',event=>{
      popup.querySelectorAll('[data-popup-build]').forEach(p=>p.hidden=p.dataset.popupBuild!==event.target.value);
      const url=new URL(location);url.searchParams.set('ticket',event.target.value);history.replaceState(null,'',url);paint();
    });
  }
  function openPopup(id) {
    selected=id; popup.innerHTML=document.querySelector(`template[data-popup="${CSS.escape(id)}"]`).innerHTML;popup.hidden=false;
    canvas.querySelectorAll('[data-pin]').forEach(p=>p.dataset.pin===id?p.setAttribute('aria-current','true'):p.removeAttribute('aria-current'));
    const url=new URL(location);url.searchParams.set('place',id);url.searchParams.delete('ticket');history.replaceState(null,'',url);bindPopup();paint();
    popup.querySelector('.atlas-close')?.focus({preventScroll:true});
  }
  canvas.querySelectorAll('[data-pin]').forEach(pin=>pin.addEventListener('click',event=>{event.preventDefault();if(!dragged)openPopup(pin.dataset.pin);}));
  document.querySelectorAll('[data-map-zoom]').forEach(b=>b.addEventListener('click',()=>zoomTo(scale*Number(b.dataset.mapZoom))));
  document.querySelector('[data-map-reset]')?.addEventListener('click',()=>{scale=1;x=0;y=0;closePopup();paint();});
  viewport.addEventListener('wheel',event=>{event.preventDefault();const rect=viewport.getBoundingClientRect();zoomTo(scale*Math.exp(-event.deltaY*.002),event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
  function startGesture() {
    const points=[...pointers.values()];
    gesture={x,y,scale,points};
    if(points.length===2){gesture.distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);gesture.center={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};}
  }
  viewport.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});dragged=false;startGesture();
    // Keep a tap on a pin a native click; background gestures capture immediately.
    if(!event.target.closest('[data-pin]'))viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId)||!gesture)return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const points=[...pointers.values()];
    if(points.length===2&&gesture.distance){
      const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),rect=viewport.getBoundingClientRect();
      scale=clamp(gesture.scale*distance/gesture.distance,1,32);
      x=(points[0].x+points[1].x)/2-rect.left-(gesture.center.x-rect.left-gesture.x)*scale/gesture.scale;
      y=(points[0].y+points[1].y)/2-rect.top-(gesture.center.y-rect.top-gesture.y)*scale/gesture.scale;dragged=true;
    }else if(points.length===1){const dx=points[0].x-gesture.points[0].x,dy=points[0].y-gesture.points[0].y;if(Math.hypot(dx,dy)>4){dragged=true;viewport.setPointerCapture(event.pointerId);}x=gesture.x+dx;y=gesture.y+dy;}
    viewport.classList.toggle('dragging',dragged);paint();
  });
  for(const type of ['pointerup','pointercancel'])viewport.addEventListener(type,event=>{pointers.delete(event.pointerId);if(pointers.size)startGesture();else{gesture=null;viewport.classList.remove('dragging');}});
  viewport.addEventListener('click',event=>{if(!dragged&&!event.target.closest('[data-pin]'))closePopup();});
  viewport.addEventListener('dragstart',event=>event.preventDefault());
  viewport.addEventListener('keydown',event=>{
    if(event.target!==viewport)return;
    const pan={ArrowLeft:[90,0],ArrowRight:[-90,0],ArrowUp:[0,90],ArrowDown:[0,-90]}[event.key];
    if(pan){event.preventDefault();x+=pan[0];y+=pan[1];paint();}
    if(['+','=','-'].includes(event.key)){event.preventDefault();zoomTo(scale*(event.key==='-'?1/1.3:1.3));}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!popup.hidden)closePopup(true);});
  const image=canvas.querySelector('img');if(image.complete)center();else image.addEventListener('load',center,{once:true});
  new ResizeObserver(()=>paint()).observe(viewport);bindPopup();
}
