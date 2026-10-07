// Test-only static server, deliberately mounts dist under a GitHub-Pages-like subpath.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve('dist');
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/x3-batch/')){res.writeHead(404);res.end();return;}
  const relative=decodeURIComponent(url.pathname.slice('/x3-batch/'.length))||'index.html';
  const path=resolve(root,relative);
  if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  try {const body=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.txt':'text/plain'})[extname(path)]||'application/octet-stream');res.end(body);}
  catch {res.writeHead(404);res.end();}
}).listen(4173,'127.0.0.1');
