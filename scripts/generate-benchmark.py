"""Create 500 distinct local JPEG/PNG files. Never uploaded or committed."""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
root=Path(__file__).resolve().parents[1]/'web/test-data/batch500'
root.mkdir(parents=True,exist_ok=True)
base=np.tile(np.linspace(0,255,1200,dtype=np.uint8),(1800,1))
for n in range(1,501):
    ext='png' if n%5==0 else 'jpg'
    p=root/f'{n}.{ext}'
    if p.exists() and p.stat().st_size>0:continue
    im=Image.fromarray(base).convert('RGB');d=ImageDraw.Draw(im)
    d.rectangle((100,100,1100,500),fill=(40,n%255,140))
    d.text((120,150),f'X3 BATCH / PAGE {n}',fill='white',font_size=50)
    d.ellipse((200,700,1000,1500),outline='black',width=12)
    im.save(p)
print('500 images ready (400 JPEG + 100 PNG), 1200×1800.')
