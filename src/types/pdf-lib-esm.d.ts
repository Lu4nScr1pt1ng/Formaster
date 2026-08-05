/**
 * `render-pdf.ts` imports pdf-lib's prebuilt standalone ESM bundle instead
 * of the package entry point, to dodge a tslib interop break when the
 * `es/index.js` build gets bundled (see the comment on `renderPdf`). That
 * deep path ships no types of its own, so this points it at the package's
 * real declarations — keeping `PDFDocument`/`StandardFonts`/`rgb` fully
 * typed rather than silently degrading the whole module to `any`.
 */
declare module 'pdf-lib/dist/pdf-lib.esm.min.js' {
  export * from 'pdf-lib';
}
