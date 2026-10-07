"""Offscreen integration: folder import, thumbnails, settings, UI export and clear."""
import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
from pathlib import Path
import sys
import tempfile
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from PIL import Image, ImageDraw
from PySide6.QtWidgets import QApplication, QFileDialog
from x3batch.app import Window
app=QApplication([]); w=Window(); w.show()
def wait(predicate,timeout=30):
    start=time.monotonic()
    while not predicate():
        app.processEvents(); time.sleep(.01)
        if time.monotonic()-start>timeout: raise AssertionError('UI timed out')
with tempfile.TemporaryDirectory() as d:
    for i in range(500):
        img=Image.new('RGB',(360,540),'#f5ead7'); draw=ImageDraw.Draw(img)
        draw.rectangle((30,50,330,360),fill='#548775'); draw.ellipse((90,110,290,310),fill='#e9bd62')
        draw.text((40,410),f'IMAGE {i+1}',fill='#203c30'); img.save(Path(d,f'{i+1}.png'))
    w.import_paths([d]); wait(lambda:not w.importing and w.preview_pix is not None)
    assert w.pages.count()==500
    wait(lambda:not w.jobs)
    w.brightness.setValue(20); w.contrast.setValue(15); w.pages.setCurrentRow(2)
    wait(lambda:not w.preview_timer.isActive() and not w.jobs)
    assert not w.pages.item(0).icon().isNull()
    w.grab().save(str(Path(__file__).resolve().parents[1]/'docs/screenshot.png'))
    # Exercise the actual export button handler, replacing only the file dialog.
    dest=Path(d,'ui.xtch')
    QFileDialog.getSaveFileName=lambda *a,**k:(str(dest),'XTCH (*.xtch)')
    w.export(); wait(lambda:not w.exporting,timeout=90)
    assert dest.exists() and dest.read_bytes()[:4]==b'XTCH'
    assert w.export_btn.isEnabled()
    w.clear(); assert w.pages.count()==0
    wait(lambda:not w.jobs); w.close()
print('PASS: 500-page GUI import, lazy thumbnails, preview/settings, UI export, clear')
