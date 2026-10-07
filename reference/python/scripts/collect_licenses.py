"""Collect installed dependency license texts for the local app bundle."""
from importlib.metadata import distribution
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]/'licenses'/'dependencies'
for name in ('Pillow','numpy','PySide6','PySide6_Essentials','PySide6_Addons','shiboken6'):
    dist=distribution(name)
    for file in dist.files or []:
        if any(x in str(file).lower() for x in ('license','copying','copyright')):
            source=Path(dist.locate_file(file))
            if source.is_file():
                dest=root/name/str(file); dest.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(source,dest)
print('Dependency license texts collected.')
