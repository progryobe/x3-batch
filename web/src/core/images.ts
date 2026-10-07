import { grayscale, placement, quantize } from './pixels';
import type { Settings } from './types';
const MAX_PIXELS=50_000_000, MAX_BYTES=100*1024*1024;
/** Reject giant JPEG/PNG before raster decoding. No full file arrayBuffer required. */
export async function validateImage(file:File):Promise<void> {
  if(file.size>MAX_BYTES)throw new Error('1画像100 MiBまでです。');
  const data=new Uint8Array(await file.slice(0,1024*1024).arrayBuffer()),v=new DataView(data.buffer);
  let width=0,height=0;
  if(data.length>=24&&data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71) {
    width=v.getUint32(16);height=v.getUint32(20);
  } else if(data.length>=4&&data[0]===255&&data[1]===216) {
    let offset=2;
    while(offset+4<data.length) {
      if(data[offset++]!==255)continue;
      while(data[offset]===255)offset++;
      const marker=data[offset++];
      if(marker===217||marker===218)break;
      if(marker===1||(marker>=208&&marker<=215))continue;
      if(offset+2>data.length)break;
      const length=v.getUint16(offset);
      if(length<2||offset+length>data.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7) {
        height=v.getUint16(offset+3);width=v.getUint16(offset+5);break;
      }
      offset+=length;
    }
  }
  if(!width||!height)throw new Error('JPEG / PNGの画像サイズを読み取れません（壊れた画像、または大きすぎるヘッダー）。');
  if(width*height>MAX_PIXELS)throw new Error('50メガピクセルを超える画像は縮小してから追加してください。');
}
export async function openBitmap(file:File) {
  await validateImage(file);
  return createImageBitmap(file,{imageOrientation:'from-image'});
}
function context(canvas:OffscreenCanvas) {
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('このブラウザではCanvasを利用できません。');return ctx;
}
export async function thumbnail(file:File):Promise<Blob> {
  const image=await openBitmap(file),canvas=new OffscreenCanvas(64,88),ctx=context(canvas);
  try {
    ctx.fillStyle='white';ctx.fillRect(0,0,64,88);
    const p=placement(image.width,image.height,64,88,'fit');
    ctx.imageSmoothingQuality='high';ctx.drawImage(image,p.x,p.y,p.width,p.height);
    return await canvas.convertToBlob({type:'image/png'});
  } finally {image.close();canvas.width=1;canvas.height=1;}
}
export async function processFile(file:File,s:Settings,preview=false) {
  if(s.width!==528||s.height!==792||!['fit','fill'].includes(s.mode)||!['None','Bayer','Floyd-Steinberg'].includes(s.dither)
    ||!Number.isFinite(s.brightness)||s.brightness < -80||s.brightness>80||!Number.isFinite(s.contrast)||s.contrast < -80||s.contrast>100)
    throw new Error('変換設定が不正です。');
  const image=await openBitmap(file),canvas=new OffscreenCanvas(s.width,s.height),ctx=context(canvas);
  let original:Blob|undefined;
  try {
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    const draw=(mode:'fit'|'fill')=>{
      ctx.fillStyle='white';ctx.fillRect(0,0,s.width,s.height);
      const p=placement(image.width,image.height,s.width,s.height,mode);
      ctx.drawImage(image,p.x,p.y,p.width,p.height);
    };
    if(preview) {draw('fit');original=await canvas.convertToBlob({type:'image/png'});}
    draw(s.mode);
    const pixels=ctx.getImageData(0,0,s.width,s.height);
    const gray=quantize(grayscale(pixels.data,s),s.width,s.height,s.dither);
    if(!preview)return {gray};
    for(let i=0;i<gray.length;i++) { const p=i*4; pixels.data[p]=pixels.data[p+1]=pixels.data[p+2]=gray[i];pixels.data[p+3]=255; }
    ctx.putImageData(pixels,0,0);
    return {gray,original,converted:await canvas.convertToBlob({type:'image/png'})};
  } finally {image.close();canvas.width=1;canvas.height=1;}
}
