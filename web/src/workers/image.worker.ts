/// <reference lib="webworker" />
import { thumbnail, processFile } from '../core/images';
import { createXtch, encodeXth, putPage } from '../core/xtch';
import { MAX_PAGES, type WorkerRequest, type WorkerResponse } from '../core/types';
const scope=self as unknown as DedicatedWorkerGlobalScope;
const send=(m:WorkerResponse,transfer:Transferable[]=[])=>scope.postMessage(m,transfer);
let busy=false;
scope.onmessage=async({data}:{data:WorkerRequest})=>{
  if(busy){send({kind:'error',message:'処理が重複しました。'});return;}
  busy=true;
  try {
    if(data.kind==='thumbnail')send({kind:'thumbnail',blob:await thumbnail(data.file)});
    else if(data.kind==='preview') {
      const result=await processFile(data.file,data.settings,true);
      send({kind:'preview',original:result.original!,converted:result.converted!});
    } else {
      const {pages,settings:s}=data;
      if(pages.length>MAX_PAGES)throw new Error(`${MAX_PAGES}ページまでです。`);
      const started=performance.now(),book=createXtch(pages.length,s.width,s.height,data.title);
      for(let i=0;i<pages.length;i++) {
        try {
          const {gray}=await processFile(pages[i].file,s);
          putPage(book,encodeXth(gray,s.width,s.height),i);
        } catch(error) {throw new Error(`${pages[i].label}: ${error instanceof Error?error.message:String(error)}`);}
        send({kind:'progress',done:i+1,total:pages.length});
      }
      send({kind:'export',buffer:book.buffer,elapsedMs:performance.now()-started,maxDecodedImages:1},[book.buffer]);
    }
  } catch(error) {send({kind:'error',message:error instanceof Error?error.message:String(error)});}
  finally {busy=false;}
};
