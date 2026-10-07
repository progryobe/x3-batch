export type Dither = 'Floyd-Steinberg' | 'None' | 'Bayer';
export interface Settings { width: number; height: number; mode: 'fit' | 'fill'; brightness: number; contrast: number; dither: Dither }
export const DEFAULT_SETTINGS: Settings = { width: 528, height: 792, mode: 'fit', brightness: 0, contrast: 0, dither: 'Floyd-Steinberg' };
export const MAX_PAGES = 2000;
export interface Page { id: string; file: File; label: string; group: string }
export type WorkerRequest =
  | { kind: 'preview'; file: File; settings: Settings }
  | { kind: 'thumbnail'; file: File }
  | { kind: 'export'; pages: { file: File; label: string }[]; settings: Settings; title: string };
export type WorkerResponse =
  | { kind: 'preview'; original: Blob; converted: Blob }
  | { kind: 'thumbnail'; blob: Blob }
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'export'; buffer: ArrayBuffer; elapsedMs: number; maxDecodedImages: number }
  | { kind: 'error'; message: string };
