/** Byte-compatible port of reference/python/x3batch/core.py (MIT).
 * XTH packing originally adapted from feeeeeeen/XteinkImageRefiner.
 */
import { md5 } from '@noble/hashes/legacy.js';
function dimensions(w: number, h: number) {
  if (![w,h].every(n => Number.isInteger(n) && n > 0 && n <= 65535)) throw new Error('画像サイズが不正です。');
}
export function xthSize(w: number, h: number) { dimensions(w,h); return 22 + w * Math.ceil(h/8) * 2; }
export function encodeXth(gray: Uint8Array, w: number, h: number): Uint8Array<ArrayBuffer> {
  dimensions(w,h);
  if (gray.length !== w*h) throw new Error('ピクセル数が一致しません。');
  const bytes = new Uint8Array(xthSize(w,h)); const view = new DataView(bytes.buffer);
  bytes.set([88,84,72,0]); view.setUint16(4,w,true); view.setUint16(6,h,true);
  const columnBytes=Math.ceil(h/8), plane=w*columnBytes, codes=[3,1,2,0];
  view.setUint32(10,plane*2,true);
  for (let x=w-1; x>=0; x--) for (let y=0; y<h; y++) {
    const code=codes[gray[y*w+x]>>>6], index=22+(w-1-x)*columnBytes+(y>>>3), mask=1<<(7-(y&7));
    if (code&2) bytes[index]|=mask;
    if (code&1) bytes[index+plane]|=mask;
  }
  bytes.set(md5(bytes.subarray(22)).subarray(0,8),14);
  return bytes;
}
function utf8Field(text: string, max: number) {
  const encoder=new TextEncoder(); let result=''; let length=0;
  for (const char of text) { const n=encoder.encode(char).length; if (length+n>max) break; result+=char; length+=n; }
  return encoder.encode(result);
}
export function createXtch(count: number, w: number, h: number, title: string, timestamp=Math.floor(Date.now()/1000)): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(count)||count<1||count>65535) throw new Error('ページ数は1〜65535にしてください。');
  const size=xthSize(w,h), dataOffset=312+16*count;
  const bytes=new Uint8Array(dataOffset+count*size), v=new DataView(bytes.buffer);
  bytes.set([88,84,67,72]); v.setUint16(4,1,true); v.setUint16(6,count,true);
  bytes[9]=1; v.setUint32(12,1,true); v.setBigUint64(16,56n,true);
  v.setBigUint64(24,312n,true); v.setBigUint64(32,BigInt(dataOffset),true);
  bytes.set(utf8Field(title,127),56); bytes.set(new TextEncoder().encode('X3 Batch'),56+192);
  bytes.set([106,97],56+224); v.setUint32(56+240,timestamp,true);
  for(let i=0;i<count;i++) {
    const at=312+i*16;
    v.setBigUint64(at,BigInt(dataOffset+i*size),true); v.setUint32(at+8,size,true);
    v.setUint16(at+12,w,true); v.setUint16(at+14,h,true);
  }
  return bytes;
}
export function putPage(book: Uint8Array, page: Uint8Array, index: number) {
  const v=new DataView(book.buffer,book.byteOffset,book.byteLength), count=v.getUint16(6,true);
  if (!Number.isInteger(index)||index<0||index>=count) throw new Error('ページ番号が不正です。');
  const at=312+index*16, off=Number(v.getBigUint64(at,true)), length=v.getUint32(at+8,true);
  if(page.length!==length||off+length>book.length) throw new Error('ページサイズが一致しません。');
  book.set(page,off);
}
