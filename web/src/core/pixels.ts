import type { Settings } from './types';
const clamp=(v:number)=>Math.max(0,Math.min(255,v));
/** Pillow-style grayscale, brightness then mean-centered contrast.
 * Browser resizing and floating-point FS are intentionally not claimed pixel-identical to Pillow.
 */
export function grayscale(rgba: Uint8ClampedArray, s: Settings): Uint8Array {
  const gray=new Uint8Array(rgba.length/4); let sum=0;
  for(let i=0;i<gray.length;i++) {
    const p=i*4, a=rgba[p+3]/255;
    const r=rgba[p]*a+255*(1-a),g=rgba[p+1]*a+255*(1-a),b=rgba[p+2]*a+255*(1-a);
    const l=Math.floor((r*19595+g*38470+b*7471+32768)/65536);
    gray[i]=Math.floor(clamp(l*(1+s.brightness/100))); sum+=gray[i];
  }
  const mean=Math.floor(sum/gray.length+.5), factor=1+s.contrast/100;
  for(let i=0;i<gray.length;i++) gray[i]=Math.floor(clamp(mean+(gray[i]-mean)*factor));
  return gray;
}
export function quantize(input: Uint8Array, w:number, h:number, mode:Settings['dither']): Uint8Array {
  if(input.length!==w*h) throw new Error('ピクセル数が一致しません。');
  const out=new Uint8Array(input.length);
  const nearest=(v:number)=>Math.floor(clamp(v)/85+.5)*85;
  if(mode==='None') { for(let i=0;i<input.length;i++) out[i]=nearest(input[i]); return out; }
  if(mode==='Bayer') {
    const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const i=y*w+x, t=(bayer[(y&3)*4+(x&3)]+.5)/16-.5;
      out[i]=Math.floor(Math.max(0,Math.min(3,input[i]/85+t))+.5)*85;
    }
    return out;
  }
  // Left-to-right Floyd-Steinberg; only two error rows are retained.
  let row=new Float32Array(w+2), next=new Float32Array(w+2);
  for(let y=0;y<h;y++) {
    for(let x=0;x<w;x++) {
      const i=y*w+x, value=clamp(input[i]+row[x+1]), q=nearest(value), e=value-q;
      out[i]=q; row[x+2]+=e*7/16; next[x]+=e*3/16; next[x+1]+=e*5/16; next[x+2]+=e/16;
    }
    [row,next]=[next,row]; next.fill(0);
  }
  return out;
}
export function placement(iw:number,ih:number,w:number,h:number,mode:'fit'|'fill') {
  const scale=mode==='fit'?Math.min(w/iw,h/ih):Math.max(w/iw,h/ih);
  const dw=iw*scale,dh=ih*scale;
  return {x:(w-dw)/2,y:(h-dh)/2,width:dw,height:dh};
}
