import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Resolve from this module/the standalone kit, never from a source URL or cwd.
// PDF.js' Node binary factory reads these installed pinned package assets.
const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const required = ['wasm/jbig2.wasm', 'wasm/openjpeg.wasm',
  'standard_fonts/LiberationSans-Regular.ttf', 'cmaps/Adobe-GB1-UCS2.bcmap'];

export async function localPdfAssetOptions() {
  // Reject an incomplete installation before PDF.js can silently omit a scan.
  // These are availability checks, not a complete package integrity verifier.
  await Promise.all(required.map(name => access(join(root, name), constants.R_OK)));
  return { cMapUrl: join(root, 'cmaps') + '/', cMapPacked: true,
    standardFontDataUrl: join(root, 'standard_fonts') + '/', wasmUrl: join(root, 'wasm') + '/',
    useWorkerFetch: false, useSystemFonts: false };
}
