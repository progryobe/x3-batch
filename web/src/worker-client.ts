import type { WorkerRequest, WorkerResponse } from './core/types';
export function newImageWorker() { return new Worker(new URL('./workers/image.worker.ts',import.meta.url),{type:'module'}); }
export function requestWorker(worker:Worker,request:WorkerRequest):Promise<WorkerResponse> {
  return new Promise((resolve,reject)=>{
    worker.onmessage=({data}:{data:WorkerResponse})=>data.kind==='error'?reject(new Error(data.message)):resolve(data);
    worker.onerror=(event)=>reject(new Error(event.message||'画像処理を開始できませんでした。ブラウザを更新してください。'));
    worker.postMessage(request);
  });
}
