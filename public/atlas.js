const viewport = document.querySelector('.map-viewport'), canvas = document.querySelector('.map-canvas'), popup = document.querySelector('.atlas-popup');
if (viewport && canvas && popup) {
  const image = canvas.querySelector('.atlas-image'), pins = [...viewport.querySelectorAll('[data-pin]')];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Limit magnification to four CSS pixels per source pixel; pixel art stays crisp.
  const sourceWidth = () => image?.naturalWidth || Number(image?.getAttribute('width')) || viewport.clientWidth;
  const maxScale = () => Math.max(1, sourceWidth() * 4 / viewport.clientWidth);
  const aspect = () => (image?.naturalHeight || Number(image?.getAttribute('height')) || viewport.clientWidth) / sourceWidth();
  let scale = clamp(6000 / viewport.clientWidth, 1, maxScale()), x = 0, y = 0, frame = 0, selected = popup.dataset.selectedPlace, dragged = false;
  const pointers = new Map();
  let gesture, cleanupPopup = () => {};
  const raster = document.createElement('canvas'), context = raster.getContext('2d');
  raster.className = 'atlas-raster'; raster.setAttribute('aria-hidden', 'true');
  if (context) viewport.prepend(raster);
  function paint() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      scale = clamp(scale, 1, maxScale());
      const width = viewport.clientWidth * scale, height = width * aspect();
      x = width < viewport.clientWidth ? (viewport.clientWidth-width)/2 : clamp(x, viewport.clientWidth-width, 0);
      y = height < viewport.clientHeight ? (viewport.clientHeight-height)/2 : clamp(y, viewport.clientHeight-height, 0);
      // Size the raster at its displayed dimensions instead of enlarging a composited thumbnail.
      canvas.style.width = `${width}px`;
      canvas.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      if (context && image?.complete && image.naturalWidth) {
        // Draw only the visible viewport at device resolution. Nearest-neighbour sampling
        // avoids the extra interpolation that CSS pixelated can apply at fractional zoom.
        const ratio = window.devicePixelRatio || 1;
        const rw = Math.round(viewport.clientWidth * ratio), rh = Math.round(viewport.clientHeight * ratio);
        if (raster.width !== rw || raster.height !== rh) { raster.width = rw; raster.height = rh; }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, viewport.clientWidth, viewport.clientHeight);
        context.drawImage(image, Math.round(x), Math.round(y), width, height);
        canvas.classList.add('raster-ready');
      }
      viewport.dataset.zoom = scale.toFixed(3);
      viewport.dataset.maxZoom = maxScale().toFixed(3);
      for (const pin of pins) {
        pin.style.left = `${Math.round(x + Number(pin.dataset.x) * width)}px`;
        pin.style.top = `${Math.round(y + Number(pin.dataset.y) * height)}px`;
      }
      if (selected && !popup.hidden && viewport.clientWidth > 650) {
        const pin = pins.find(p => p.dataset.pin === selected);
        if (pin) {
          const px = parseFloat(pin.style.left), py = parseFloat(pin.style.top);
          popup.style.left = `${clamp(px+24,12,viewport.clientWidth-popup.offsetWidth-12)}px`;
          popup.style.top = `${clamp(py-popup.offsetHeight/2,12,viewport.clientHeight-popup.offsetHeight-12)}px`;
        }
      }
    });
  }
  function zoomTo(next, px=viewport.clientWidth/2, py=viewport.clientHeight/2) {
    const old=scale; scale=clamp(next,1,maxScale());
    x=px-(px-x)*scale/old; y=py-(py-y)*scale/old; paint();
  }
  function center() { const width=viewport.clientWidth*scale; x=viewport.clientWidth/2-width*Number(canvas.dataset.focusX); y=viewport.clientHeight/2-width*aspect()*Number(canvas.dataset.focusY); paint(); }
  function closePopup(focus=false) {
    cleanupPopup(); popup.hidden=true; pins.forEach(p=>p.removeAttribute('aria-current'));
    if(focus && selected) pins.find(p=>p.dataset.pin===selected)?.focus({preventScroll:true});
    selected=''; const url=new URL(location); url.searchParams.delete('place');url.searchParams.delete('ticket');history.replaceState(null,'',url);
  }
  function bindPopup() {
    cleanupPopup();
    popup.querySelector('.atlas-close')?.addEventListener('click',event=>{event.preventDefault();closePopup(true);});
    const carousel=popup.querySelector('.ticket-carousel'),track=carousel?.querySelector('.ticket-carousel-track');
    if(!track){cleanupPopup=()=>{};return;}
    const slides=[...track.children],dots=[...carousel.querySelectorAll('[data-ticket-index]')];
    let index=Number(carousel.dataset.carouselIndex)||0,timer,mouseDrag,initialFrame;
    function setActive(next,updateURL=true) {
      index=next;carousel.dataset.carouselIndex=String(index);
      slides.forEach((slide,i)=>{slide.inert=i!==index;slide.setAttribute('aria-hidden',String(i!==index));});
      dots.forEach((dot,i)=>i===index?dot.setAttribute('aria-current','true'):dot.removeAttribute('aria-current'));
      const count=carousel.querySelector('[data-ticket-count]');if(count)count.textContent=`${index+1} / ${slides.length}`;
      if(updateURL){const url=new URL(location);url.searchParams.set('ticket',slides[index].dataset.popupBuild);history.replaceState(null,'',url);}
    }
    function go(next,instant=false) {
      next=(next+slides.length)%slides.length;
      // Keep keyboard focus out of a slide that is about to become inactive.
      if(slides[index]?.contains(document.activeElement))track.focus({preventScroll:true});
      setActive(next);
      track.scrollTo({left:next*track.clientWidth,behavior:instant||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }
    carousel.querySelector('[data-ticket-prev]')?.addEventListener('click',()=>go(index-1));
    carousel.querySelector('[data-ticket-next]')?.addEventListener('click',()=>go(index+1));
    dots.forEach(dot=>dot.addEventListener('click',()=>go(Number(dot.dataset.ticketIndex))));
    carousel.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();go(index+(event.key==='ArrowLeft'?-1:1));}});
    track.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(track.clientWidth&&!mouseDrag)setActive(clamp(Math.round(track.scrollLeft/track.clientWidth),0,slides.length-1));},150);},{passive:true});
    // Touch uses native swipe and scroll snap. Mouse users can also drag the photographs.
    track.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button===0&&!event.target.closest('a,button'))mouseDrag={id:event.pointerId,x:event.clientX,left:track.scrollLeft,moved:false};});
    track.addEventListener('pointermove',event=>{
      if(!mouseDrag||event.pointerId!==mouseDrag.id)return;
      const dx=event.clientX-mouseDrag.x;
      if(Math.abs(dx)>5){mouseDrag.moved=true;track.classList.add('dragging');track.setPointerCapture(event.pointerId);track.scrollLeft=mouseDrag.left-dx;}
    });
    for(const type of ['pointerup','pointercancel'])track.addEventListener(type,event=>{if(!mouseDrag||event.pointerId!==mouseDrag.id)return;const moved=mouseDrag.moved;mouseDrag=null;track.classList.remove('dragging');if(moved)go(Math.round(track.scrollLeft/track.clientWidth));});
    track.addEventListener('dragstart',event=>event.preventDefault());
    setActive(index,false);
    initialFrame=requestAnimationFrame(()=>{track.scrollTo({left:index*track.clientWidth,behavior:'instant'});paint();});
    let lastWidth=track.clientWidth;
    const resize=new ResizeObserver(()=>{if(track.clientWidth&&track.clientWidth!==lastWidth){lastWidth=track.clientWidth;track.scrollTo({left:index*lastWidth,behavior:'instant'});}paint();});resize.observe(track);
    cleanupPopup=()=>{clearTimeout(timer);cancelAnimationFrame(initialFrame);resize.disconnect();};
  }
  function openPopup(id) {
    selected=id; popup.innerHTML=document.querySelector(`template[data-popup="${CSS.escape(id)}"]`).innerHTML;popup.hidden=false;
    pins.forEach(p=>p.dataset.pin===id?p.setAttribute('aria-current','true'):p.removeAttribute('aria-current'));
    const url=new URL(location);url.searchParams.set('place',id);url.searchParams.delete('ticket');history.replaceState(null,'',url);bindPopup();paint();
    popup.querySelector('.atlas-close')?.focus({preventScroll:true});
  }
  pins.forEach(pin=>pin.addEventListener('click',event=>{event.preventDefault();if(!dragged)openPopup(pin.dataset.pin);}));
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
    if(!event.target.closest('[data-pin]'))viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId)||!gesture)return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const points=[...pointers.values()];
    if(points.length===2&&gesture.distance){
      const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),rect=viewport.getBoundingClientRect();
      scale=clamp(gesture.scale*distance/gesture.distance,1,maxScale());
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
  pins.forEach(pin=>{if(pin.dataset.pin===selected)pin.setAttribute('aria-current','true');});
  if(!image||image.complete)center();else image.addEventListener('load',center,{once:true});
  new ResizeObserver(()=>paint()).observe(viewport);bindPopup();
}
