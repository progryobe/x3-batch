import hashlib
import struct
import tempfile
import unittest
from pathlib import Path
import numpy as np
from PIL import Image
from x3batch.core import *

class CoreTests(unittest.TestCase):
    def test_known_plane_bytes_and_padding(self):
        # rightmost column white, then light, dark, black; topmost bit first.
        a = np.tile(np.array([0,85,170,255], dtype=np.uint8), (8,1))
        blob=encode_xth(Image.fromarray(a))
        self.assertEqual(blob[22:], bytes([0,255,0,255,0,0,255,255]))
        self.assertEqual(blob[14:22], hashlib.md5(blob[22:]).digest()[:8])
        b=encode_xth(Image.new('L',(1,1),0))
        self.assertEqual(b[22:], b'\x80\x80')
    def test_scan_orientation(self):
        a=np.full((8,2),255,dtype=np.uint8); a[0,1]=0; a[7,0]=85
        self.assertEqual(encode_xth(Image.fromarray(a))[22:],bytes([128,0,128,1]))
    def test_natural_discovery(self):
        with tempfile.TemporaryDirectory() as d:
            for name in ['10.jpg','2.jpg','1.jpg','ignore.txt']:
                Path(d,name).touch()
            pages=discover([d,d])
            self.assertEqual([p.label for p in pages],['1.jpg','2.jpg','10.jpg'])
    def test_container_and_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d,'page.png'); Image.new('L',(40,60),85).save(p)
            pages=discover([d]); out=Path(d,'日本語.xtch')
            export_xtch(pages*3,out,Settings(dither='None'))
            data=out.read_bytes(); h=struct.unpack('<4sHHBBBBIQQQQQ',data[:56])
            self.assertEqual(h[:3],(b'XTCH',1,3)); self.assertEqual(h[8:11],(56,312,360))
            expected=360
            for i in range(3):
                off,size,w,hh=struct.unpack_from('<QIHH',data,312+i*16)
                self.assertEqual((off,w,hh),(expected,528,792))
                blob=data[off:off+size]; self.assertEqual(blob[:4],b'XTH\0')
                self.assertEqual(size,104566); self.assertEqual(struct.unpack_from('<I',blob,10)[0],size-22)
                self.assertEqual(blob[14:22],hashlib.md5(blob[22:]).digest()[:8])
                plane=(size-22)//2
                hi=np.unpackbits(np.frombuffer(blob[22:22+plane],dtype=np.uint8)).reshape(w,hh).T[:,::-1]
                lo=np.unpackbits(np.frombuffer(blob[22+plane:],dtype=np.uint8)).reshape(w,hh).T[:,::-1]
                decoded=np.array([255,85,170,0],dtype=np.uint8)[hi*2+lo]
                self.assertTrue(np.all(decoded==85)); expected+=size
            self.assertEqual(expected,len(data))
    def test_cancel_and_error_preserve_destination(self):
        with tempfile.TemporaryDirectory() as d:
            dest=Path(d,'book.xtch'); dest.write_bytes(b'old')
            page=Page(str(Path(d,'missing.png')),d,'missing.png')
            with self.assertRaises(Cancelled): export_xtch([page],dest,cancelled=lambda:True)
            with self.assertRaises(RuntimeError): export_xtch([page],dest)
            self.assertEqual(dest.read_bytes(),b'old')
            self.assertEqual(len(list(Path(d).iterdir())),1)
    def test_fit_fill_alpha_and_quantization(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d,'alpha.png'); Image.new('RGBA',(100,30),(0,0,0,0)).save(p)
            self.assertEqual(process(p).getextrema(),(255,255))
            Image.new('RGB',(100,30),'black').save(p)
            fit=process(p); fill=process(p,Settings(mode='fill'))
            self.assertEqual(fit.getpixel((0,0)),255); self.assertEqual(fill.getextrema(),(0,0))
            Image.fromarray(np.tile(np.arange(256,dtype=np.uint8),(90,1))).save(p)
            for mode in ['None','Floyd-Steinberg','Bayer']:
                img=process(p,Settings(dither=mode))
                self.assertEqual(img.size,(528,792)); self.assertLessEqual(set(np.unique(img)),{0,85,170,255})
    def test_page_limits(self):
        with self.assertRaises(ValueError): export_xtch([], 'unused.xtch')
        with self.assertRaises(ValueError): export_xtch([None]*65536,'unused.xtch')

if __name__=='__main__': unittest.main()
