import { MAX_PAGES, type Page } from './types';
export const isImage=(name:string)=>/\.(jpe?g|png)$/i.test(name);
// Numeric runs use BigInt to keep very long page numbers deterministic.
export function naturalCompare(a:string,b:string):number {
  const aa=a.toLowerCase().split(/([0-9]+)/),bb=b.toLowerCase().split(/([0-9]+)/);
  for(let i=0;i<Math.min(aa.length,bb.length);i++) {
    if(i%2) {const x=BigInt(aa[i]),y=BigInt(bb[i]); if(x!==y)return x<y?-1:1;}
    else if(aa[i]!==bb[i])return aa[i]<bb[i]?-1:1;
  }
  return aa.length-bb.length;
}
export interface InputFile { file:File; path:string }
export function makePages(inputs:InputFile[]):Page[] {
  const seen=new Set<string>();
  return inputs.filter(p=>isImage(p.file.name)).sort((a,b)=>naturalCompare(a.path,b.path)).flatMap(({file,path})=>{
    const key=[path,file.size,file.lastModified].join('\0'); if(seen.has(key))return []; seen.add(key);
    return [{id:crypto.randomUUID(),file,label:path,group:path.includes('/')?path.split('/')[0]:''}];
  });
}
export function selectedFiles(files:FileList|File[]):InputFile[] {
  return Array.from(files).map(file=>({file,path:file.webkitRelativePath||file.name}));
}
/** Directory readers return batches (Chromium often 100 entries): drain to empty. */
export async function droppedFiles(data:DataTransfer):Promise<InputFile[]> {
  // Capture entries synchronously; DataTransfer becomes protected after the event.
  const entries=Array.from(data.items).filter(i=>i.kind==='file').map(i=>i.webkitGetAsEntry?.());
  const fallback=Array.from(data.files); const out:InputFile[]=[]; let inspected=0;
  async function walk(entry:FileSystemEntry):Promise<void> {
    if(++inspected>30000)throw new Error('フォルダ内の項目が多すぎます。画像フォルダを絞ってください。');
    if(entry.isFile) {
      if(!isImage(entry.name))return;
      const file=await new Promise<File>((resolve,reject)=>(entry as FileSystemFileEntry).file(resolve,reject));
      out.push({file,path:entry.fullPath.replace(/^\//,'')});
      if(out.length>MAX_PAGES)throw new Error(`一度に扱える画像は${MAX_PAGES}枚までです。`);
    } else if(entry.isDirectory) {
      const reader=(entry as FileSystemDirectoryEntry).createReader();
      while(true) {
        const batch=await new Promise<FileSystemEntry[]>((resolve,reject)=>reader.readEntries(resolve,reject));
        if(!batch.length)break;
        for(const item of batch)await walk(item);
      }
    }
  }
  if(entries.some(Boolean)) {for(const entry of entries)if(entry)await walk(entry);return out;}
  return selectedFiles(fallback);
}
