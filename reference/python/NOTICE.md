# Third-party notices

XTH encoding in `x3batch/core.py` is adapted from XteinkImageRefiner:
Copyright (c) 2026 feeeeeeen. MIT License.
The upstream LICENSE file is preserved verbatim in licenses/XteinkImageRefiner.LICENSE.
It consists of the MIT label, copyright and an MIT license URL; the standard MIT text
is additionally included as licenses/MIT-standard.txt.

Other repositories were inspected for interoperability/design only; their product
code is not bundled. Their license files are retained for provenance.

Runtime dependencies include Pillow (HPND-style), NumPy (BSD-3-Clause and bundled
third-party notices), and PySide6/Shiboken6/Qt (LGPL-3.0/GPL/commercial alternatives).
This app uses Qt Core, Gui and Widgets through the LGPL option, dynamically linked.
Dependency license texts are under licenses/dependencies and refreshed by the build
script. No reverse-engineering restriction is imposed by this project; Qt libraries
may be replaced/relinked for debugging changes under the applicable LGPL terms.
Corresponding Qt/PySide source is available from https://download.qt.io/ and
https://code.qt.io/pyside/pyside-setup.git/ (version 6.10.2).
Redistributors must preserve applicable notices, source availability and replacement
rights; review the exact bundled dependency versions before external distribution.

The source ZIP does not include Python or Qt binaries. A locally built .app does.
