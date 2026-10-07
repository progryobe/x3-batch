"""500 distinct JPEG files; streaming export. All generated data is temporary."""
import json
from pathlib import Path
import resource
import sys
import tempfile
import time
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from x3batch.core import discover, export_xtch
with tempfile.TemporaryDirectory() as d:
    for i in range(500):
        img=Image.fromarray(np.tile(np.linspace(0,255,1200,dtype=np.uint8),(1800,1)))
        ImageDraw.Draw(img).text((40,40),f'PAGE {i+1}',fill=0,stroke_width=2)
        img.save(Path(d,f'{i+1}.jpg'))
    start=time.perf_counter(); pages=discover([d]); scan=time.perf_counter()-start
    out=Path(d,'book.xtch'); start=time.perf_counter(); export_xtch(pages,out)
    print(json.dumps(dict(pages=len(pages),source_size='1200x1800 JPEG',scan_seconds=round(scan,3),
        export_seconds=round(time.perf_counter()-start,3),output_bytes=out.stat().st_size,
        peak_rss_platform_units=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss),indent=2))
