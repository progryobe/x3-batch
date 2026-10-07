import sys
import threading
from pathlib import Path
from PIL.ImageQt import ImageQt
from PySide6.QtCore import Qt, QSize, QTimer, QObject, Signal, QRunnable, QThreadPool
from PySide6.QtGui import QPixmap, QIcon
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QLabel, QPushButton, QListWidget, QListWidgetItem, QComboBox, QSlider, QFileDialog,
    QMessageBox, QProgressBar, QAbstractItemView, QSplitter)
from .core import Settings, discover, process, load_image, export_xtch, Cancelled

class Signals(QObject):
    done = Signal(object)
    error = Signal(str)
    progress = Signal(int, int)

class Task(QRunnable):
    def __init__(self, fn):
        super().__init__()
        self.fn = fn
        self.signals = Signals()
    def run(self):
        try:
            self.signals.done.emit(self.fn(self.signals))
        except Exception as exc:
            self.signals.error.emit(str(exc))

class Pages(QListWidget):
    dropped = Signal(list)
    def __init__(self):
        super().__init__()
        self.setAcceptDrops(True)
        self.setDragDropMode(QAbstractItemView.DragDropMode.InternalMove)
        self.setDefaultDropAction(Qt.DropAction.MoveAction)
        self.setIconSize(QSize(46, 66))
        self.setUniformItemSizes(True)
    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls(): event.acceptProposedAction()
        else: super().dragEnterEvent(event)
    def dragMoveEvent(self, event):
        if event.mimeData().hasUrls(): event.acceptProposedAction()
        else: super().dragMoveEvent(event)
    def dropEvent(self, event):
        if event.mimeData().hasUrls():
            self.dropped.emit([u.toLocalFile() for u in event.mimeData().urls() if u.isLocalFile()])
            event.acceptProposedAction()
        else: super().dropEvent(event)

class Window(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('X3 Batch — 画像からXTCHへ')
        self.resize(1190, 820)
        self.setAcceptDrops(True)
        self.pool = QThreadPool(self); self.pool.setMaxThreadCount(2)
        self.thumb_pool = QThreadPool(self); self.thumb_pool.setMaxThreadCount(1)
        self.jobs = set(); self.thumb_pending = set(); self.generation = 0
        self.preview_busy = False; self.preview_revision = 0; self.exporting = False; self.importing = False
        self.cancel_event = threading.Event(); self.preview_pix = None; self.original_pix = None
        root = QWidget(); self.setCentralWidget(root); layout = QVBoxLayout(root)
        top = QHBoxLayout(); layout.addLayout(top)
        title = QLabel('X3 Batch'); title.setObjectName('title'); top.addWidget(title)
        top.addWidget(QLabel('画像をまとめて、手のひらの本に。')); top.addStretch()
        self.files_btn = QPushButton('画像を追加'); self.folder_btn = QPushButton('フォルダを追加')
        self.clear_btn = QPushButton('クリア')
        for b in (self.files_btn,self.folder_btn,self.clear_btn): top.addWidget(b)
        self.files_btn.clicked.connect(self.pick_files); self.folder_btn.clicked.connect(self.pick_folder)
        self.clear_btn.clicked.connect(self.clear)
        splitter = QSplitter(); layout.addWidget(splitter, 1)
        left = QWidget(); ll = QVBoxLayout(left)
        self.count = QLabel('ページ  0'); ll.addWidget(self.count)
        self.pages = Pages(); ll.addWidget(self.pages)
        ll.addWidget(QLabel('ここへ画像・フォルダをドロップ\nドラッグでページの順序を変更'))
        splitter.addWidget(left)
        middle = QWidget(); ml = QVBoxLayout(middle)
        self.preview_title = QLabel('X3 プレビュー  ·  528 × 792'); ml.addWidget(self.preview_title)
        self.compare = QComboBox(); self.compare.addItems(['変換後（4階調）', '原画像']); ml.addWidget(self.compare)
        self.preview = QLabel('画像またはフォルダを追加してください'); self.preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.preview.setMinimumSize(260, 390); self.preview.setObjectName('preview'); ml.addWidget(self.preview, 1)
        ml.addWidget(QLabel('実機の濃淡・照明によって見え方は異なります。'))
        splitter.addWidget(middle)
        right = QWidget(); right.setMaximumWidth(280); rl = QVBoxLayout(right)
        heading = QLabel('変換設定'); heading.setObjectName('heading'); rl.addWidget(heading)
        rl.addWidget(QLabel('XTEINK X3\n528 × 792 px · 4階調グレー'))
        rl.addSpacing(20); rl.addWidget(QLabel('画像の収め方'))
        self.fit = QComboBox(); self.fit.addItems(['Fit — 全体を表示（白余白）', 'Fill — 中央で切り抜き']); rl.addWidget(self.fit)
        self.brightness = self.slider(rl, '明るさ', -80, 80)
        self.contrast = self.slider(rl, 'コントラスト', -80, 100)
        rl.addWidget(QLabel('ディザ'))
        self.dither = QComboBox(); self.dither.addItems(['Floyd-Steinberg', 'None', 'Bayer']); rl.addWidget(self.dither)
        hint = QLabel('写真・漫画：Floyd-Steinberg\n線画：None（なし）\n規則的な網点：Bayer'); hint.setWordWrap(True); rl.addWidget(hint)
        reset = QPushButton('設定をリセット'); rl.addWidget(reset); reset.clicked.connect(self.reset)
        rl.addStretch(); rl.addWidget(QLabel('設定は全ページに適用されます。\n書き出し時に1ページずつ変換します。'))
        self.export_btn = QPushButton('Export XTCH'); self.export_btn.setObjectName('export'); rl.addWidget(self.export_btn)
        self.cancel_btn = QPushButton('書き出しを中止'); self.cancel_btn.hide(); rl.addWidget(self.cancel_btn)
        splitter.addWidget(right); splitter.setSizes([280,620,260])
        self.progress = QProgressBar(); self.progress.hide(); layout.addWidget(self.progress)
        self.status = QLabel('準備完了'); self.status.setWordWrap(True); layout.addWidget(self.status)
        self.preview_timer = QTimer(self); self.preview_timer.setSingleShot(True); self.preview_timer.setInterval(160)
        self.preview_timer.timeout.connect(self.start_preview)
        self.thumb_timer = QTimer(self); self.thumb_timer.setSingleShot(True); self.thumb_timer.setInterval(50)
        self.thumb_timer.timeout.connect(self.load_visible_thumbs)
        self.pages.currentRowChanged.connect(self.schedule_preview)
        self.pages.verticalScrollBar().valueChanged.connect(lambda: self.thumb_timer.start())
        self.pages.model().rowsMoved.connect(self.renumber)
        self.pages.dropped.connect(self.import_paths)
        for combo in (self.fit,self.dither): combo.currentIndexChanged.connect(self.schedule_preview)
        self.compare.currentIndexChanged.connect(self.draw_preview)
        self.export_btn.clicked.connect(self.export)
        self.cancel_btn.clicked.connect(self.cancel_event.set)
        self.setStyleSheet('''QMainWindow {background:#f3f2ed} QWidget {color:#263831;font-size:13px}
            QPushButton {padding:10px;border:1px solid #c9d1c9;border-radius:7px;background:#fff}
            QPushButton:disabled {color:#aaa} QPushButton:hover {background:#e3ece6}
            QLabel#title {font-size:25px;font-weight:bold} QLabel#heading {font-size:18px;font-weight:bold}
            QLabel#preview {background:#dedfd7;border-radius:10px;color:#66736a}
            QPushButton#export {background:#245b48;color:white;font-weight:bold;padding:15px}
            QListWidget {background:#fafbf8;border:0;border-radius:8px} QListWidget::item {padding:7px}
            QListWidget::item:selected {background:#d4e6dc;color:#163e2e} QComboBox {padding:7px}
        ''')
        self.update_controls()
    def slider(self, layout, name, lo, hi):
        label = QLabel(name + '  0'); layout.addSpacing(16); layout.addWidget(label)
        s = QSlider(Qt.Orientation.Horizontal); s.setRange(lo,hi); s.setValue(0); layout.addWidget(s)
        s.valueChanged.connect(lambda value: label.setText(f'{name}  {value:+d}'))
        s.valueChanged.connect(self.schedule_preview)
        return s
    def task(self, fn, done, error=None, pool=None):
        t = Task(fn); self.jobs.add(t)
        def finish(value):
            self.jobs.discard(t); done(value)
        def fail(message):
            self.jobs.discard(t)
            (error or self.show_error)(message)
        t.signals.done.connect(finish); t.signals.error.connect(fail)
        (pool or self.pool).start(t)
        return t
    def settings(self):
        return Settings(mode='fit' if self.fit.currentIndex()==0 else 'fill',
                        brightness=self.brightness.value(),contrast=self.contrast.value(),dither=self.dither.currentText())
    def reset(self):
        self.fit.setCurrentIndex(0); self.brightness.setValue(0); self.contrast.setValue(0); self.dither.setCurrentIndex(0)
    def show_error(self, message):
        self.status.setText(message); QMessageBox.warning(self, '処理できませんでした', message)
    def pick_files(self):
        paths,_ = QFileDialog.getOpenFileNames(self,'画像を追加','','画像 (*.jpg *.jpeg *.png *.JPG *.JPEG *.PNG)')
        if paths: self.import_paths(paths)
    def pick_folder(self):
        p = QFileDialog.getExistingDirectory(self,'画像フォルダを追加')
        if p: self.import_paths([p])
    def import_paths(self, paths):
        if self.exporting or self.importing: return
        self.importing = True; self.update_controls(); self.status.setText('フォルダを確認しています…')
        self.task(lambda _: discover(paths), self.import_done, self.import_failed)
    def import_failed(self, message):
        self.importing = False; self.update_controls(); self.show_error(message)
    def import_done(self, pages):
        existing = {self.pages.item(i).data(Qt.ItemDataRole.UserRole).path for i in range(self.pages.count())}
        n = 0
        for page in pages:
            if page.path in existing: continue
            item = QListWidgetItem(); item.setData(Qt.ItemDataRole.UserRole,page)
            item.setSizeHint(QSize(210,80)); item.setToolTip(page.path); self.pages.addItem(item); n += 1
        self.importing = False; self.renumber(); self.update_controls()
        self.status.setText(f'{n}ページ追加しました。')
        if self.pages.currentRow()<0 and self.pages.count(): self.pages.setCurrentRow(0)
        self.thumb_timer.start()
    def renumber(self, *args):
        for i in range(self.pages.count()):
            item=self.pages.item(i); item.setText(f'{i+1:03d}  {item.data(Qt.ItemDataRole.UserRole).label}')
        self.count.setText(f'ページ  {self.pages.count()}')
    def clear(self):
        self.generation+=1; self.preview_revision+=1; self.pages.clear(); self.renumber()
        self.preview_pix=None; self.original_pix=None; self.draw_preview(); self.update_controls()
    def update_controls(self):
        busy=self.exporting or self.importing
        for b in (self.files_btn,self.folder_btn,self.clear_btn): b.setEnabled(not busy)
        self.pages.setEnabled(not self.exporting)
        self.export_btn.setEnabled(not busy and self.pages.count()>0)
        for w in (self.fit,self.brightness,self.contrast,self.dither): w.setEnabled(not self.exporting)
    def load_visible_thumbs(self):
        gen = self.generation
        for i in range(self.pages.count()):
            item=self.pages.item(i)
            if not self.pages.visualItemRect(item).intersects(self.pages.viewport().rect()): continue
            page=item.data(Qt.ItemDataRole.UserRole); key=(gen,page.path)
            if not item.icon().isNull() or item.data(Qt.ItemDataRole.UserRole+1) or key in self.thumb_pending: continue
            if len(self.thumb_pending)>=16: break
            self.thumb_pending.add(key)
            def work(_, path=page.path):
                img=load_image(path,(46,66)); img.thumbnail((46,66)); return ImageQt(img).copy()
            def done(img, item=item, key=key):
                self.thumb_pending.discard(key)
                if key[0]==self.generation: item.setIcon(QIcon(QPixmap.fromImage(img)))
                self.thumb_timer.start()
            def failed(message, item=item, key=key):
                self.thumb_pending.discard(key)
                if key[0]==self.generation:
                    item.setData(Qt.ItemDataRole.UserRole+1,True); item.setToolTip(message)
            self.task(work,done,failed,self.thumb_pool)
    def schedule_preview(self, *args):
        self.preview_revision+=1
        if hasattr(self,'preview_timer'): self.preview_timer.start()
    def start_preview(self):
        item=self.pages.currentItem()
        if self.preview_busy or not item: return
        rev=self.preview_revision; path=item.data(Qt.ItemDataRole.UserRole).path; settings=self.settings()
        self.preview_busy=True; self.preview_title.setText('プレビューを更新しています…')
        def work(_):
            return ImageQt(process(path,settings).convert('RGB')).copy(), ImageQt(load_image(path,(528,792))).copy()
        def done(images):
            self.preview_busy=False
            if rev==self.preview_revision:
                self.preview_pix=QPixmap.fromImage(images[0]); self.original_pix=QPixmap.fromImage(images[1]); self.draw_preview()
                self.preview_title.setText('X3 プレビュー  ·  528 × 792')
            else: self.preview_timer.start()
        def failed(message):
            self.preview_busy=False
            if rev==self.preview_revision:
                self.preview_pix=None; self.original_pix=None; self.preview.setText('この画像を読み込めません。'); self.status.setText(message)
            else: self.preview_timer.start()
        self.task(work,done,failed)
    def draw_preview(self,*args):
        pix=self.original_pix if self.compare.currentIndex() else self.preview_pix
        if pix: self.preview.setPixmap(pix.scaled(self.preview.size()-QSize(24,24),Qt.AspectRatioMode.KeepAspectRatio,Qt.TransformationMode.SmoothTransformation))
        else: self.preview.setText('画像またはフォルダを追加してください')
    def resizeEvent(self,event):
        super().resizeEvent(event)
        if hasattr(self,'preview'): self.draw_preview(); self.thumb_timer.start()
    def export(self):
        name,_=QFileDialog.getSaveFileName(self,'XTCHを書き出す','book.xtch','XTCH (*.xtch)')
        if not name: return
        if not name.lower().endswith('.xtch'):
            name+='.xtch'
            if Path(name).exists() and QMessageBox.question(self,'上書き',f'{name} を上書きしますか？')!=QMessageBox.StandardButton.Yes: return
        pages=[self.pages.item(i).data(Qt.ItemDataRole.UserRole) for i in range(self.pages.count())]
        settings=self.settings(); self.cancel_event.clear(); self.exporting=True; self.update_controls()
        self.progress.setRange(0,len(pages)); self.progress.setValue(0); self.progress.show(); self.cancel_btn.show()
        self.status.setText('書き出し中…')
        def work(signals):
            export_xtch(pages,name,settings,signals.progress.emit,self.cancel_event.is_set)
            return name
        def finish(path):
            self.export_finished(); self.status.setText(f'完了：{len(pages)}ページ → {path}')
        def failed(message):
            self.export_finished()
            if self.cancel_event.is_set(): self.status.setText('書き出しを中止しました。出力ファイルは変更していません。')
            else: self.show_error(message)
        t=Task(work); self.jobs.add(t)
        t.signals.progress.connect(lambda n,total:(self.progress.setValue(n),self.status.setText(f'書き出し中  {n} / {total}')))
        t.signals.done.connect(lambda p:(self.jobs.discard(t),finish(p)))
        t.signals.error.connect(lambda m:(self.jobs.discard(t),failed(m)))
        self.pool.start(t)
    def export_finished(self):
        self.exporting=False; self.progress.hide(); self.cancel_btn.hide(); self.update_controls()
    def dragEnterEvent(self,event):
        if event.mimeData().hasUrls(): event.acceptProposedAction()
    def dropEvent(self,event):
        self.import_paths([u.toLocalFile() for u in event.mimeData().urls() if u.isLocalFile()]); event.acceptProposedAction()
    def closeEvent(self,event):
        if self.exporting:
            QMessageBox.information(self,'書き出し中','書き出しを中止してから閉じてください。'); event.ignore(); return
        # Do not destroy worker signal objects while queued work is running.
        if self.jobs:
            self.status.setText('画像処理が終わってから、もう一度閉じてください。'); event.ignore(); return
        event.accept()

def main():
    app=QApplication(sys.argv); app.setApplicationName('X3 Batch')
    w=Window(); w.show(); sys.exit(app.exec())

if __name__=='__main__': main()
