"""Usage: python scripts/verify_references.py /path/to/reference-clones
Executes only the named upstream encoder functions for byte comparison.
Reference clones are not distributed with this app.
"""
import ast
import hashlib
from pathlib import Path
import struct
import sys
import tempfile
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from x3batch.core import encode_xth
root=Path(sys.argv[1])
def function(path,name,namespace):
    tree=ast.parse(path.read_text())
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    exec(compile(ast.Module(body=[node],type_ignores=[]),str(path),'exec'),namespace)
    return namespace[name]
ref=function(root/'refiner/image_processor.py','save_xth',dict(Image=Image,np=np,hashlib=hashlib,struct=struct))
helper=function(root/'xteink-x4-helpers/xteink-xtc','img_to_xth',dict(np=np,hl=hashlib,struct=struct))
rng=np.random.default_rng(2026)
with tempfile.TemporaryDirectory() as d:
    for w,h in [(528,792),(480,800),(13,9)]:
        img=Image.fromarray(rng.choice(np.array([0,85,170,255],dtype=np.uint8),(h,w)))
        file=Path(d,'test.xth'); ref(img,str(file))
        assert encode_xth(img)==file.read_bytes()
        if (w,h)==(480,800): assert encode_xth(img)==helper(img)
print('PASS: Refiner X3/X4/padded dimensions; x4-helpers X4: identical XTH bytes')
