# Third-party notices

This Web edition is MIT-licensed. Its encoding logic is a TypeScript port of
X3-Batch-MVP-0.1.0 (included unchanged under reference/python).

XTH packing was originally adapted from XteinkImageRefiner:
Copyright (c) 2026 feeeeeeen, MIT License.
The original upstream notice and standard MIT terms are under licenses/.
The Python reference's docs preserve the inspected upstream revisions and format decisions.

Browser runtime dependencies:
- React / React DOM / Scheduler: MIT, Copyright (c) Meta Platforms, Inc. and affiliates.
- @noble/hashes: MIT, Copyright (c) Paul Miller. Used for the legacy XTH MD5 field;
  MD5 is a format checksum, not a security primitive.

Full runtime dependency notices are in licenses/web and in the built site's THIRD-PARTY-NOTICES.txt.
Python/Qt binaries are not bundled or used by the Web app. Python dependencies and
original desktop notices remain with the reference implementation.
