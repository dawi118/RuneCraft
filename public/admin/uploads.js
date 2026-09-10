const LIMIT = 4 * 1024 * 1024;
const allowed = ['image/jpeg', 'image/png', 'image/webp'];
export async function prepareImage(file) {
  const type = file.type || ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[file.name.split('.').pop().toLowerCase()]);
  if (!allowed.includes(type)) throw new Error('Use a JPEG, PNG or WebP image. Export HEIC images as JPEG first.');
  if (!file.size) throw new Error('This file is empty. Choose the original image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  if (file.size <= LIMIT) return {blob:file, type, optimized:false};
  const url=URL.createObjectURL(file),image=new Image();
  try {
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('This image could not be opened. Export it as JPEG or PNG and try again.'));image.src=url;});
    if(image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('Choose an image with fewer than 40 million pixels.');
    const canvas=document.createElement('canvas');
    for(const edge of [2400,1600,1000]){
      const ratio=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));
      if(blob&&blob.size<=LIMIT&&allowed.includes(blob.type))return {blob,type:blob.type,optimized:true};
    }
    throw new Error('This image is still too large after optimisation. Export a smaller JPEG.');
  }finally{URL.revokeObjectURL(url);}
}
const readData = blob => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read. Choose it again.'));reader.readAsDataURL(blob);});
export async function sendImage(file,onProgress) {
  onProgress(0,'Preparing image…');
  const {blob,type,optimized}=await prepareImage(file),data=String(await readData(blob)).split(',')[1];
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('POST','/api/media');xhr.setRequestHeader('Content-Type','application/json');xhr.timeout=90000;
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded/event.total*100,event.loaded===event.total?'Processing image…':'Uploading…');};
    xhr.onload=()=>{
      let value;try{value=JSON.parse(xhr.responseText);}catch{}
      if(xhr.status>=200&&xhr.status<300&&value?.id){resolve({media:value,optimized});return;}
      const message=xhr.status===401?'Your session expired. Sign in to resume these uploads.':xhr.status===413?'The server rejected the image size. Export a smaller JPEG and retry.':value?.error||'The upload could not be completed. Retry this file.';
      const error=new Error(message);error.status=xhr.status;reject(error);
    };
    xhr.onerror=()=>reject(new Error('Connection interrupted. Retry this file.'));
    xhr.ontimeout=()=>reject(new Error('Upload timed out. Retry this file.'));
    xhr.send(JSON.stringify({fileName:file.name,contentType:type,data}));
  });
}
export function createUploadQueue({onChange,onUploaded,onAuthRequired}) {
  const tasks=[];let running=false,paused=false;
  const notify=()=>onChange(tasks);
  async function run(){
    if(running||paused)return;running=true;
    try{
      let task;
      while(!paused&&(task=tasks.find(t=>t.state==='queued'))){
        task.state='uploading';notify();
        try{
          const result=await sendImage(task.file,(progress,message)=>{task.progress=progress;task.message=message;notify();});
          task.state='ready';task.media=result.media;task.optimized=result.optimized;task.message='Uploaded';task.progress=100;
          onUploaded(task);task.file=null;
        }catch(error){
          task.message=error.message;task.state=error.status===401?'waiting':'error';
          if(error.status===401){paused=true;for(const pending of tasks.filter(t=>t.state==='queued'))pending.state='waiting';onAuthRequired();}
        }
        notify();
      }
    }finally{running=false;notify();}
  }
  return {
    tasks,
    get busy(){return tasks.some(t=>['queued','uploading'].includes(t.state));},
    get blocked(){return tasks.some(t=>['queued','uploading','waiting','error'].includes(t.state));},
    add(files,owner,accept){for(const file of files)tasks.push({id:crypto.randomUUID(),file,name:file.name,owner,accept,state:'queued',progress:0,message:'Queued'});notify();run();},
    retry(id){const task=tasks.find(t=>t.id===id);if(task?.state==='error'){task.state='queued';task.message='Queued';notify();run();}},
    skip(id){const task=tasks.find(t=>t.id===id);if(task&&['error','waiting'].includes(task.state)){task.state='skipped';task.file=null;notify();}},
    resume(){paused=false;for(const task of tasks.filter(t=>t.state==='waiting'))task.state='queued';notify();run();},
    discard(){if(this.busy)return;for(const task of tasks){task.file=null;task.state='skipped';}paused=false;notify();},
    saved(isPublished){for(const task of tasks.filter(t=>t.state==='ready'&&isPublished(t)))task.state='saved';notify();},
  };
}
