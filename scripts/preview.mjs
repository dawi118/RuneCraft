import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHandler } from '../.netlify/build/entry.mjs';
const handler = createHandler({});
const port = Number(process.env.PORT || 4379);
const staticRoot = path.resolve('dist');
const types = { '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png', '.woff2':'font/woff2', '.txt':'text/plain' };
http.createServer(async(req,res)=>{
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const file = path.resolve(staticRoot, `.${decodeURIComponent(url.pathname)}`);
    if (file.startsWith(`${staticRoot}${path.sep}`) && ['GET','HEAD'].includes(req.method)) {
      try {
        const stat=await fs.stat(file);
        if(stat.isFile()) { const type=types[path.extname(file)]||'application/octet-stream';let data=await fs.readFile(file);const headers={'Content-Type':type,'Cache-Control':'public, max-age=3600'};
          if(/^(text\/|image\/svg)/.test(type)&&req.headers['accept-encoding']?.includes('gzip')){data=gzipSync(data);headers['Content-Encoding']='gzip';headers.Vary='Accept-Encoding';}
          res.writeHead(200,{...headers,'Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);return;
        }
      }catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
    }
    const parts=[];for await(const part of req)parts.push(part);
    const body=Buffer.concat(parts);
    const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body}:{} )});
    const response=await handler(request,{ip:'127.0.0.1'});
    let bytes=Buffer.from(await response.arrayBuffer());const headers=Object.fromEntries(response.headers);
    if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie();
    if(req.headers['accept-encoding']?.includes('gzip')&&/text|json|xml/.test(headers['content-type']||'')){bytes=gzipSync(bytes);headers['content-encoding']='gzip';headers.vary='Accept-Encoding';}
    res.writeHead(response.status,{...headers,'content-length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){console.error(error.message);res.writeHead(500,{'Content-Type':'text/plain'});res.end('Preview request failed.');}
}).listen(port,'127.0.0.1',()=>console.log(`Built Netlify SSR preview: http://127.0.0.1:${port}`));
