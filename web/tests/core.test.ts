import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createXtch, encodeXth, putPage, xthSize } from '../src/core/xtch';
import { naturalCompare } from '../src/core/files';
import { grayscale, placement, quantize } from '../src/core/pixels';
import { DEFAULT_SETTINGS } from '../src/core/types';
const fixture=(name:string)=>readFileSync(new URL('./fixtures/'+name,import.meta.url));
const manifest=JSON.parse(fixture('manifest.json').toString()) as {name:string;width:number;height:number}[];
for(const {name,width,height} of manifest)test(`Python XTH byte equality: ${name}`,()=>{
  const result=encodeXth(fixture(name+'.gray'),width,height);
  assert.deepEqual(Buffer.from(result),fixture(name+'.xth'));
  assert.deepEqual(Buffer.from(result.slice(14,22)),createHash('md5').update(result.slice(22)).digest().subarray(0,8));
});
test('Python full multi-page XTCH equality with fixed metadata',()=>{
  const expected=fixture('回帰テスト.xtch');
  const result=createXtch(2,528,792,'回帰テスト',1700000000);
  const v=new DataView(expected.buffer,expected.byteOffset,expected.byteLength);
  for(let i=0;i<2;i++) {
    const offset=Number(v.getBigUint64(312+i*16,true)),size=v.getUint32(320+i*16,true);
    putPage(result,expected.subarray(offset,offset+size),i);
  }
  assert.deepEqual(Buffer.from(result),expected);
});
test('known planes, right-to-left / top-to-bottom / white padding',()=>{
  const gray=new Uint8Array(16).fill(255);gray[1]=0;gray[14]=85;
  assert.deepEqual(Array.from(encodeXth(gray,2,8).slice(22)),[128,0,128,1]);
  assert.deepEqual(Array.from(encodeXth(Uint8Array.of(0),1,1).slice(22)),[128,128]);
});
test('UTF-8 title truncation keeps complete code points and NUL',()=>{
  const result=createXtch(1,1,1,'あ'.repeat(100),0);
  assert.equal(new TextDecoder('utf-8',{fatal:true}).decode(result.slice(56,182)),'あ'.repeat(42));
  assert.equal(result[182],0);assert.equal(result[183],0);
});
test('size, count and index validation',()=>{
  assert.equal(xthSize(528,792),104566);
  for(const n of [0,65536,1.5])assert.throws(()=>createXtch(n,528,792,'x'));
  assert.throws(()=>encodeXth(Uint8Array.of(0),0,1));
  assert.throws(()=>encodeXth(Uint8Array.of(0),2,2));
  assert.throws(()=>putPage(createXtch(1,1,1,'x'),new Uint8Array(2),0));
  assert.throws(()=>putPage(createXtch(1,1,1,'x'),new Uint8Array(24),1));
});
test('natural numeric sort including long numbers and nested paths',()=>{
  assert.deepEqual(['10.jpg','2.jpg','1.jpg'].sort(naturalCompare),['1.jpg','2.jpg','10.jpg']);
  assert.deepEqual(['vol10/1.jpg','vol2/10.jpg','vol2/2.jpg'].sort(naturalCompare),['vol2/2.jpg','vol2/10.jpg','vol10/1.jpg']);
  assert(naturalCompare('999999999999999999.jpg','1000000000000000000.jpg')<0);
});
test('fit and centered crop geometry',()=>{
  assert.deepEqual(placement(200,100,100,100,'fit'),{x:0,y:25,width:100,height:50});
  assert.deepEqual(placement(200,100,100,100,'fill'),{x:-50,y:0,width:200,height:100});
});
test('brightness, contrast, alpha compositing and four-level dither',()=>{
  const s={...DEFAULT_SETTINGS};
  assert.equal(grayscale(Uint8ClampedArray.of(0,0,0,0),s)[0],255);
  assert.equal(grayscale(Uint8ClampedArray.of(100,100,100,255),{...s,brightness:50})[0],150);
  assert.deepEqual([...grayscale(Uint8ClampedArray.of(0,0,0,255,200,200,200,255),{...s,contrast:100})],[0,255]);
  const input=Uint8Array.from({length:256},(_,i)=>i);
  for(const mode of ['None','Bayer','Floyd-Steinberg'] as const) {
    const values=new Set(quantize(input,16,16,mode));
    assert.equal(values.size,4);for(const value of values)assert([0,85,170,255].includes(value));
  }
  assert.equal(new Set(quantize(new Uint8Array(256).fill(120),16,16,'None')).size,1);
  assert(new Set(quantize(new Uint8Array(256).fill(120),16,16,'Floyd-Steinberg')).size>1);
});

test('directory drop drains multiple readEntries batches, not only first 100',async()=>{
  const { droppedFiles }=await import('../src/core/files');
  let reads=0;
  const entry=(n:number)=>({isFile:true,isDirectory:false,name:`${n}.png`,fullPath:`/book/${n}.png`,file:(resolve:(f:File)=>void)=>resolve(new File(['test'],`${n}.png`))});
  const dir={isFile:false,isDirectory:true,name:'book',fullPath:'/book',createReader:()=>({readEntries:(resolve:(batch:unknown[])=>void)=>{
    resolve(reads++===0?Array.from({length:100},(_,i)=>entry(i+1)):reads===2?[entry(101)]:[]);
  }})};
  const dt={items:[{kind:'file',webkitGetAsEntry:()=>dir}],files:[]};
  const files=await droppedFiles(dt as unknown as DataTransfer);
  assert.equal(files.length,101);assert.equal(reads,3);assert.equal(files[100].path,'book/101.png');
});
