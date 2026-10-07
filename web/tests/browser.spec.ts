import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const fixtures=resolve('tests/fixtures');
async function ready(page:Page){await expect(page.getByAltText('X3変換後プレビュー')).toBeVisible();}
async function save(page:Page) {
  await expect(page.getByTestId('download-link')).toBeVisible({timeout:150000});
  const wait=page.waitForEvent('download');await page.getByTestId('download-link').click();
  const download=await wait;const file=await download.path();return {data:readFileSync(file!),name:download.suggestedFilename()};
}
function inspect(book:Buffer,count:number) {
  expect(book.subarray(0,4).toString()).toBe('XTCH');expect(book.readUInt16LE(4)).toBe(1);
  expect(book.readUInt16LE(6)).toBe(count);let end=312+16*count;
  for(let i=0;i<count;i++) {
    const offset=Number(book.readBigUInt64LE(312+i*16)),size=book.readUInt32LE(320+i*16);
    expect(offset).toBe(end);expect(size).toBe(104566);
    const xth=book.subarray(offset,offset+size);expect(xth.subarray(0,4).toString()).toBe('XTH\0');
    expect(xth.readUInt16LE(4)).toBe(528);expect(xth.readUInt16LE(6)).toBe(792);
    expect(xth.subarray(14,22).equals(createHash('md5').update(xth.subarray(22)).digest().subarray(0,8))).toBe(true);
    end+=size;
  }
  expect(book.length).toBe(end);
}
test('static subpath, real Canvas-to-download equals Python XTCH, and zero uploads',async({page})=>{
  const network:{url:string;method:string;type:string}[]=[];
  page.on('request',r=>network.push({url:r.url(),method:r.method(),type:r.resourceType()}));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles([fixtures+'/input/2.png',fixtures+'/input/1.png']);
  await expect(page.getByTestId('page-count')).toHaveText('2');await ready(page);
  await expect(page.getByTestId('page-row').first()).toContainText('1.png');
  await page.getByLabel('ディザ',{exact:true}).selectOption('None');
  await page.getByLabel('出力ファイル名').fill('回帰テスト');
  await ready(page);await page.getByRole('button',{name:'Export XTCH',exact:true}).click();
  const {data,name}=await save(page);expect(name).toBe('回帰テスト.xtch');inspect(data,2);
  data.writeUInt32LE(1700000000,296);
  expect(data.equals(readFileSync(fixtures+'/回帰テスト.xtch'))).toBe(true);
  expect(errors).toEqual([]);
  expect(network.every(r=>r.method==='GET'&&(r.url.startsWith('http://127.0.0.1:4173/x3-batch/')||(r.type==='image'&&r.url.startsWith('blob:http://127.0.0.1:4173/'))))).toBe(true);
  expect(network.filter(r=>['fetch','xhr','websocket'].includes(r.type))).toEqual([]);
});
test('natural order, drag reorder, settings, comparisons, clear and drop',async({page})=>{
  await page.goto('./');
  const bytes=readFileSync(fixtures+'/input/1.png');
  await page.getByTestId('file-input').setInputFiles([10,2,1].map(n=>({name:n+'.png',mimeType:'image/png',buffer:bytes})));
  await ready(page);
  expect(await page.getByTestId('page-row').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('1.png'),expect.stringContaining('2.png'),expect.stringContaining('10.png')]));
  await expect(page.getByTestId('page-row').nth(1)).toContainText('2.png');
  await page.getByTestId('page-row').nth(2).dragTo(page.getByTestId('page-row').first());
  await expect(page.getByTestId('page-row').first()).toContainText('10.png');
  await page.getByRole('button',{name:'自然順に戻す'}).click();
  await expect(page.getByTestId('page-row').first()).toContainText('1.png');
  await page.getByRole('button',{name:'Fill',exact:false}).click();
  await page.getByLabel('明るさ',{exact:true}).fill('25');await page.getByLabel('コントラスト',{exact:true}).fill('20');
  await page.getByLabel('ディザ',{exact:true}).selectOption('Bayer');
  await page.getByRole('button',{name:'比較',exact:true}).click();
  await expect(page.getByAltText('原画像プレビュー')).toBeVisible();await ready(page);
  await page.screenshot({path:'../docs/browser-preview.png',fullPage:true});
  await page.getByRole('button',{name:'クリア',exact:true}).click();await expect(page.getByTestId('page-count')).toHaveText('0');
  const transfer=await page.evaluateHandle((arr)=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(arr)],'drop.png',{type:'image/png'}));return dt;},[...bytes]);
  await page.locator('.app').dispatchEvent('drop',{dataTransfer:transfer});
  await expect(page.getByTestId('page-count')).toHaveText('1');await ready(page);
});
test('500 images, folder input, bounded list, responsive UI, cancel and complete download',async({page,browser})=>{
  const network:string[]=[];page.on('request',r=>{if(r.method()!=='GET'||!(r.url().startsWith('http://127.0.0.1:4173/x3-batch/')||(r.resourceType()==='image'&&r.url().startsWith('blob:http://127.0.0.1:4173/'))))network.push(r.url());});
  await page.goto('./');
  await page.getByTestId('folder-input').setInputFiles(resolve('test-data/batch500'));
  await expect(page.getByTestId('page-count')).toHaveText('500');await ready(page);
  expect(await page.getByTestId('page-row').count()).toBeLessThan(25);
  await page.getByRole('button',{name:'Export XTCH',exact:true}).click();
  await expect(page.getByTestId('progress-count')).not.toHaveText('0 / 500');
  const cancelStart=Date.now();await page.getByRole('button',{name:'キャンセル',exact:true}).click();
  await expect(page.getByTestId('status')).toContainText('キャンセル');expect(Date.now()-cancelStart).toBeLessThan(3000);
  await expect(page.getByTestId('download-link')).toHaveCount(0);
  // During export the main thread must continue processing timers and button events.
  await page.evaluate(()=>{(window as any).__ticks=0;(window as any).__timer=setInterval(()=>{(window as any).__ticks++;},50);});
  const started=Date.now();await page.getByRole('button',{name:'Export XTCH',exact:true}).click();
  await page.getByRole('button',{name:'原画像',exact:true}).click();
  await expect(page.getByRole('button',{name:'原画像',exact:true})).toHaveAttribute('aria-pressed','true');
  const {data}=await save(page);const elapsedMs=Date.now()-started;inspect(data,500);
  const ticks=await page.evaluate(()=>{clearInterval((window as any).__timer);return (window as any).__ticks as number;});
  expect(ticks).toBeGreaterThan(20);expect(network).toEqual([]);
  await page.getByRole('button',{name:'変換後',exact:true}).click();await ready(page);
  const bounds=await page.locator('.workspace').boundingBox();
  const footer=await page.locator('.statusbar').boundingBox();
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(footer!.y+1);
  const previewBounds=await page.locator('.preview-stage').boundingBox();
  expect(previewBounds!.y+previewBounds!.height).toBeLessThan(footer!.y);
  await page.screenshot({path:'../docs/browser-500.png',fullPage:true});
  mkdirSync('../docs',{recursive:true});writeFileSync('../docs/browser-benchmark.json',JSON.stringify({browser:browser.version(),pages:500,input:'400 JPEG + 100 PNG, 1200x1800',elapsedMs,outputBytes:data.length,uiTimerTicks:ticks,unexpectedRequests:network.length,exportLabel:await page.getByTestId('export-result').innerText()},null,2));
});
test('bad image stops export without a partial download; recover by removing it',async({page})=>{
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles([{name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not png')}]);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button',{name:'Export XTCH',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('bad.png');await expect(page.getByTestId('download-link')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Export XTCH',exact:true})).toBeEnabled();
  await page.getByLabel('選択ページを削除').click();await expect(page.getByTestId('page-count')).toHaveText('0');
});
