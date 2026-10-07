import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_SETTINGS, MAX_PAGES, type Page, type Settings, type WorkerResponse } from './core/types';
import { droppedFiles, makePages, naturalCompare, selectedFiles, type InputFile } from './core/files';
import { newImageWorker, requestWorker } from './worker-client';

function Icon({name,size=20}:{name:'add'|'folder'|'download'|'shield'|'image'|'arrow'|'close'|'book';size?:number}) {
  const paths={add:'M12 5v14M5 12h14',folder:'M3 7V5h6l2 2h10v13H3V7Z',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',image:'M3 3h18v18H3V3Zm0 13 6-6 5 5 3-3 4 4M16 7h.01',arrow:'m9 5 7 7-7 7',close:'m6 6 12 12M6 18 18 6',book:'M5 3h14v18H5a2 2 0 0 1 0-4h14M5 3v14'};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
const ROW=82;
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
function useThumbnails(pages:Page[],visible:Page[],enabled:boolean) {
  const cache=useRef(new Map<string,string>()),[urls,setUrls]=useState(new Map<string,string>());
  useEffect(()=>{
    const ids=new Set(pages.map(p=>p.id));
    for(const [id,url] of cache.current)if(!ids.has(id)){if(url)URL.revokeObjectURL(url);cache.current.delete(id);}
    setUrls(new Map(cache.current));
  },[pages]);
  useEffect(()=>{
    if(!enabled)return;
    const worker=newImageWorker();let stopped=false;
    (async()=>{
      for(const page of visible) {
        if(stopped)break;if(cache.current.has(page.id))continue;
        try {
          const result=await requestWorker(worker,{kind:'thumbnail',file:page.file});
          if(stopped)break;
          if(result.kind==='thumbnail')cache.current.set(page.id,URL.createObjectURL(result.blob));
        } catch {if(!stopped)cache.current.set(page.id,'');}
        if(!stopped)setUrls(new Map(cache.current));
      }
    })();
    return()=>{stopped=true;worker.terminate();};
  },[visible,enabled]);
  useEffect(()=>()=>{for(const url of cache.current.values())if(url)URL.revokeObjectURL(url);},[]);
  return urls;
}
export default function App() {
  const [pages,setPages]=useState<Page[]>([]),[selectedId,setSelectedId]=useState(''),[settings,setSettings]=useState<Settings>({...DEFAULT_SETTINGS});
  const [scroll,setScroll]=useState(0),[listHeight,setListHeight]=useState(600);
  const [preview,setPreview]=useState<{original:string;converted:string}|null>(null),[previewBusy,setPreviewBusy]=useState(false);
  const [view,setView]=useState<'converted'|'original'|'split'>('converted');
  const [status,setStatus]=useState('画像を追加して、最初の一冊をつくりましょう。'),[error,setError]=useState('');
  const [importing,setImporting]=useState(false),[exporting,setExporting]=useState(false),[progress,setProgress]=useState(0);
  const [output,setOutput]=useState<{url:string;name:string;bytes:number;seconds:number}|null>(null),[name,setName]=useState('book');
  const [draggingOver,setDraggingOver]=useState(false);
  const filesInput=useRef<HTMLInputElement>(null),folderInput=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null);
  const exportWorker=useRef<Worker|null>(null),pagesRef=useRef(pages),importLock=useRef(false),exportLock=useRef(false);
  pagesRef.current=pages;
  const selectedIndex=pages.findIndex(p=>p.id===selectedId),selected=pages[selectedIndex];
  const start=Math.max(0,Math.floor(scroll/ROW)-2),end=Math.min(pages.length,start+Math.ceil(listHeight/ROW)+5);
  const visible=useMemo(()=>pages.slice(start,end),[pages,start,end]);
  const thumbnails=useThumbnails(pages,visible,!exporting);
  const disabled=importing||exporting;
  const supported=typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap!=='undefined';
  useEffect(()=>{
    if(!list.current)return;
    const observer=new ResizeObserver(([entry])=>setListHeight(entry.contentRect.height));observer.observe(list.current);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!selected)return;
    let stopped=false,worker:Worker|undefined,original='',converted='';
    setPreviewBusy(true);setPreview(null);
    const timer=window.setTimeout(async()=>{
      worker=newImageWorker();
      try {
        const result=await requestWorker(worker,{kind:'preview',file:selected.file,settings});
        if(stopped)return;
        if(result.kind==='preview') {
          original=URL.createObjectURL(result.original);converted=URL.createObjectURL(result.converted);
          setPreview({original,converted});setPreviewBusy(false);
        }
      } catch(e){if(!stopped){setError(`${selected.label}: ${errorText(e)}`);setPreviewBusy(false);}}
      finally {worker.terminate();}
    },180);
    return()=>{stopped=true;clearTimeout(timer);worker?.terminate();if(original)URL.revokeObjectURL(original);if(converted)URL.revokeObjectURL(converted);};
  },[selected,settings]);
  useEffect(()=>()=>{if(output)URL.revokeObjectURL(output.url);},[output]);
  useEffect(()=>()=>exportWorker.current?.terminate(),[]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    if(pages.length||exporting)window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[pages.length,exporting]);
  function change<K extends keyof Settings>(key:K,value:Settings[K]) {setSettings(s=>({...s,[key]:value}));}
  async function importInputs(source:Promise<InputFile[]>|InputFile[]) {
    if(importLock.current||exportLock.current)return;
    importLock.current=true;setImporting(true);setError('');
    try {
      const inputs=await source,added=makePages(inputs),current=pagesRef.current;
      const keys=new Set(current.map(p=>[p.label,p.file.size,p.file.lastModified].join('\0')));
      const unique=added.filter(p=>!keys.has([p.label,p.file.size,p.file.lastModified].join('\0')));
      if(current.length+unique.length>MAX_PAGES)throw new Error(`最大${MAX_PAGES}ページです。フォルダを分けて追加してください。`);
      if(!unique.length){setStatus('追加するJPEG / PNGがありません（読み込み済みの画像は省略します）。');return;}
      const next=[...current,...unique];setPages(next);pagesRef.current=next;
      if(!selectedId)setSelectedId(next[0].id);
      setStatus(`${unique.length}ページを追加しました。設定はすべてのページに適用されます。`);
    } catch(e){setError(errorText(e));}
    finally {importLock.current=false;setImporting(false);}
  }
  function clear() {
    if(disabled)return;setPages([]);pagesRef.current=[];setSelectedId('');setPreview(null);setOutput(null);setError('');setScroll(0);
    setStatus('ページをクリアしました。');if(list.current)list.current.scrollTop=0;
  }
  function select(id:string){if(!exporting)setSelectedId(id);}
  function move(id:string,to:number) {
    if(disabled)return;
    const from=pages.findIndex(p=>p.id===id);if(from<0||to<0||to>=pages.length||from===to)return;
    const next=[...pages];const [page]=next.splice(from,1);next.splice(to,0,page);setPages(next);
    setStatus(`${page.file.name} を ${to+1}ページ目へ移動しました。`);
  }
  function moveSelected(delta:number) {
    const to=selectedIndex+delta;move(selectedId,to);
    if(list.current&&to>=0&&to<pages.length)list.current.scrollTop=Math.max(0,to*ROW-listHeight/2);
  }
  function removeSelected() {
    if(disabled||!selected)return;
    const next=pages.filter(p=>p.id!==selectedId);setPages(next);setSelectedId(next[Math.min(selectedIndex,next.length-1)]?.id||'');
    if(!next.length)setPreview(null);
  }
  function finishExport() {exportWorker.current?.terminate();exportWorker.current=null;exportLock.current=false;setExporting(false);}
  function beginExport() {
    if(!pages.length||disabled||exportLock.current)return;
    setError('');setOutput(null);setProgress(0);setExporting(true);exportLock.current=true;setStatus('XTCHを生成しています…');
    const filename=(name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\.xtch$/i,'').trim()||'book')+'.xtch';
    const worker=newImageWorker();exportWorker.current=worker;
    worker.onmessage=({data}:{data:WorkerResponse})=>{
      if(data.kind==='progress')setProgress(data.done);
      else if(data.kind==='export') {
        const blob=new Blob([data.buffer],{type:'application/octet-stream'});
        setOutput({url:URL.createObjectURL(blob),name:filename,bytes:blob.size,seconds:data.elapsedMs/1000});
        setStatus(`${pages.length}ページのXTCHができました。「XTCHを保存」からダウンロードしてください。`);finishExport();
      } else if(data.kind==='error'){setError(data.message);finishExport();setStatus('生成を停止しました。画像を確認して再実行してください。');}
    };
    worker.onerror=e=>{setError(e.message||'変換を続行できません。画像数を減らして再試行してください。');finishExport();};
    worker.postMessage({kind:'export',pages:pages.map(({file,label})=>({file,label})),settings:{...settings},title:filename.slice(0,-5)});
  }
  function cancelExport() {finishExport();setProgress(0);setOutput(null);setStatus('生成をキャンセルしました。途中のファイルは保存していません。');}
  const canPreview=preview&&!previewBusy;
  return <div className="app" onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();if(!disabled)setDraggingOver(true);}}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDraggingOver(false);}}
    onDrop={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();setDraggingOver(false);if(!disabled)void importInputs(droppedFiles(e.dataTransfer));}}>
    <header className="topbar">
      <a className="brand" href="./" aria-label="X3 Batch ホーム"><span className="brand-icon"><Icon name="book" size={23}/></span><strong>X3 Batch<span>WEB</span></strong></a>
      <div className="privacy"><Icon name="shield" size={16}/><span>画像は、このブラウザの中だけ。</span></div>
      <div className="top-actions"><button className="button quiet" disabled={disabled||!supported} onClick={()=>filesInput.current?.click()}><Icon name="add"/>画像を追加</button>
      <button className="button primary small" disabled={disabled||!supported} onClick={()=>folderInput.current?.click()}><Icon name="folder"/>フォルダを追加</button></div>
      <input ref={filesInput} data-testid="file-input" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple hidden onChange={e=>{if(e.target.files)void importInputs(selectedFiles(e.target.files));e.target.value='';}}/>
      <input ref={folderInput} data-testid="folder-input" type="file" multiple hidden {...{webkitdirectory:'',directory:''}} onChange={e=>{if(e.target.files)void importInputs(selectedFiles(e.target.files));e.target.value='';}}/>
    </header>
    {!supported&&<div role="alert" className="error">このブラウザは必要な画像処理APIに対応していません。デスクトップ版Chrome / Edgeをご利用ください。</div>}
    {error&&<div role="alert" className="error"><span>{error}</span><button aria-label="エラーを閉じる" onClick={()=>setError('')}><Icon name="close" size={16}/></button></div>}
    <main className="workspace">
      <aside className="pages-panel" aria-label="ページ一覧">
        <div className="panel-heading"><h2>ページ<span className="count" data-testid="page-count">{pages.length}</span></h2><button className="text-button" disabled={disabled||!pages.length} onClick={clear}>クリア</button></div>
        <div className="list-actions"><span>ドラッグで並べ替え</span><button className="text-button" disabled={disabled||!pages.length} onClick={()=>setPages([...pages].sort((a,b)=>naturalCompare(a.label,b.label)))}>自然順に戻す</button></div>
        <div className="page-list" ref={list} onScroll={e=>setScroll(e.currentTarget.scrollTop)} data-testid="page-list" role="list" aria-label="読み込んだページ">
          {!pages.length?<div className="empty-list"><Icon name="image" size={28}/><p>ここにページが並びます</p><small>JPG · JPEG · PNG</small></div>:
            <div style={{height:pages.length*ROW,position:'relative'}}>{visible.map((p,i)=>{const index=start+i;return <button
              role="listitem" type="button" key={p.id} data-testid="page-row" aria-label={`${index+1}ページ ${p.label}`} aria-current={p.id===selectedId?'true':undefined}
              className={`page-row ${p.id===selectedId?'selected':''}`} style={{position:'absolute',top:index*ROW,height:ROW-6}}
              disabled={exporting} draggable={!disabled} onClick={()=>select(p.id)}
              onDragStart={e=>{e.dataTransfer.setData('application/x-x3-page',p.id);e.dataTransfer.effectAllowed='move';}}
              onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-x3-page')){e.preventDefault();e.dataTransfer.dropEffect='move';}}}
              onDrop={e=>{const id=e.dataTransfer.getData('application/x-x3-page');if(id){e.preventDefault();e.stopPropagation();move(id,index);}}}>
              <span className="thumb">{thumbnails.get(p.id)?<img src={thumbnails.get(p.id)} alt="" draggable={false}/>:<Icon name="image" size={19}/>}</span>
              <span className="page-description"><span className="page-number">{String(index+1).padStart(3,'0')}</span><span className="page-name" title={p.label}>{p.label}</span></span><span className="grip" aria-hidden="true">⠿</span>
            </button>;})}</div>}
        </div>
        <div className="order-actions"><button disabled={disabled||selectedIndex<=0} onClick={()=>moveSelected(-1)} aria-label="選択ページを前へ">↑ 前へ</button><button disabled={disabled||selectedIndex<0||selectedIndex>=pages.length-1} onClick={()=>moveSelected(1)} aria-label="選択ページを後へ">↓ 後へ</button><button disabled={disabled||!selected} onClick={removeSelected} aria-label="選択ページを削除">削除</button></div>
        <div className="list-foot">ファイルは保存・送信されません。<br/>再読み込みするとページ一覧はリセットされます。</div>
      </aside>
      <section className="preview-panel" aria-label="プレビュー">
        <div className="preview-toolbar"><div><span className="eyebrow">PREVIEW</span><h2>{selected?<><span>{selectedIndex+1}</span><em> / {pages.length}</em></>:'画像から、小さな一冊へ。'}</h2></div>
          <div className="view-switch" aria-label="プレビュー表示">{(['original','converted','split'] as const).map(v=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='original'?'原画像':v==='converted'?'変換後':'比較'}</button>)}</div>
        </div>
        <div className={`preview-stage ${view==='split'?'split':''}`} data-testid="preview-stage" aria-busy={previewBusy}>
          {!selected?<div className="welcome"><div className="paper-stack"><div className="paper-back"/><div className="paper-front"><Icon name="image" size={46}/><div className="paper-lines"><i/><i/><i/></div></div><span className="x3-badge">X3</span></div>
            <h1>好きな画像を、<br/>持ち歩ける一冊に。</h1><p>画像やフォルダをここへドロップ。<br/>少し調整して、XTCHにまとめましょう。</p><button className="button primary" disabled={!supported||disabled} onClick={()=>folderInput.current?.click()}><Icon name="folder"/>フォルダを選ぶ</button><small>528 × 792 px · 4階調 · すべて端末内で処理</small></div>:
            <>{view!=='converted'&&<figure className="preview-figure"><div className="eink-sheet">{canPreview&&<img src={preview.original} alt="原画像プレビュー"/>}</div><figcaption>原画像</figcaption></figure>}
              {view!=='original'&&<figure className="preview-figure"><div className="eink-sheet">{canPreview&&<img src={preview.converted} alt="X3変換後プレビュー"/>}</div><figcaption>X3 · 4階調</figcaption></figure>}
              {previewBusy&&!exporting&&<span className="preview-loading" role="status">プレビューを更新中…</span>}
              {exporting&&<span className="preview-loading">書き出し中 · プレビューは完了後に更新します</span>}</>}
        </div>
        <div className="preview-caption"><span title={selected?.label}>{selected?.file.name||'JPEG / PNG · 約500枚の一括変換に対応'}</span><span>実機の濃淡・照明で見え方は異なります</span></div>
      </section>
      <aside className="settings-panel" aria-label="変換設定">
        <div className="panel-heading"><h2>変換設定</h2><button className="text-button" disabled={exporting} onClick={()=>setSettings({...DEFAULT_SETTINGS})}>リセット</button></div>
        <div className="device-preset"><span className="device-outline"><i/></span><div><strong>XTEINK X3</strong><span>528 × 792 px · 4階調グレー</span></div><span className="preset-dot"/></div>
        <fieldset disabled={exporting} className="settings-controls"><legend className="sr-only">すべてのページに適用する設定</legend>
          <label className="control-label">画像の収め方</label><div className="fit-switch"><button aria-pressed={settings.mode==='fit'} onClick={()=>change('mode','fit')}><span className="fit-symbol"/>Fit <small>全体を表示</small></button><button aria-pressed={settings.mode==='fill'} onClick={()=>change('mode','fill')}><span className="fill-symbol"/>Fill <small>中央で切り抜き</small></button></div>
          {(['brightness','contrast'] as const).map(key=><label className="slider-label" key={key}><span>{key==='brightness'?'明るさ':'コントラスト'}<output>{settings[key]>0?'+':''}{settings[key]}</output></span><input type="range" aria-label={key==='brightness'?'明るさ':'コントラスト'} min={-80} max={key==='brightness'?80:100} value={settings[key]} onChange={e=>change(key,Number(e.target.value))}/></label>)}
          <label className="control-label" htmlFor="dither">ディザ</label><select id="dither" value={settings.dither} onChange={e=>change('dither',e.target.value as Settings['dither'])}><option value="Floyd-Steinberg">Floyd-Steinberg</option><option value="None">なし</option><option value="Bayer">Bayer（規則的な網点）</option></select>
          <p className="control-hint">{settings.dither==='Floyd-Steinberg'?'写真や漫画の濃淡を、細かな点で表現します。':settings.dither==='None'?'網点を加えず、4段階の濃淡に変換します。':'規則的なパターンで、濃淡を表現します。'}</p>
        </fieldset>
        <div className="export-section"><p className="settings-note">設定は全ページに適用。<br/>書き出すときに1枚ずつ変換します。</p>
          <label className="control-label" htmlFor="filename">ファイル名</label><div className="filename"><input id="filename" value={name} maxLength={120} disabled={exporting} onChange={e=>setName(e.target.value)} aria-label="出力ファイル名"/><span>.xtch</span></div>
          {exporting?<div className="export-progress" role="status"><div><strong>XTCHを生成中</strong><span data-testid="progress-count">{progress} / {pages.length}</span></div><progress max={pages.length} value={progress}/><button className="button quiet full" onClick={cancelExport}>キャンセル</button></div>:
            <button className="button primary export-button" disabled={!pages.length||disabled||!supported} onClick={beginExport}><Icon name="download"/>Export XTCH<Icon name="arrow" size={16}/></button>}
          {output&&<div className="download-result" data-testid="export-result"><div><span>生成完了 · {output.seconds.toFixed(1)}秒</span><span>{(output.bytes/1024/1024).toFixed(1)} MiB</span></div><a className="button save-button full" href={output.url} download={output.name} data-testid="download-link"><Icon name="download" size={18}/>XTCHを保存</a><small title={output.name}>{output.name}</small></div>}
          <p className="export-hint">{pages.length?`${pages.length}ページ → 1つのXTCH`:'画像を追加すると書き出せます'}</p>
        </div>
      </aside>
    </main>
    <footer className="statusbar"><span className={`status-dot ${exporting?'active':''}`}/><span role="status" data-testid="status">{importing?'フォルダを読み込み中…':status}</span><span className="version">X3 Batch Web 0.2</span></footer>
    {draggingOver&&<div className="drop-overlay"><Icon name="folder" size={54}/><strong>ここにドロップして追加</strong><span>JPEG / PNG · フォルダごと読み込めます</span></div>}
  </div>;
}
