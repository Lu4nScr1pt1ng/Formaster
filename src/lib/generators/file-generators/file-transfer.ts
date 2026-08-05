/**
 * A rendered file crossing the background <-> content-script boundary.
 *
 * `browser.runtime.sendMessage` does *not* structured-clone in Chrome — it
 * JSON-serializes, so a real `File` arrives on the other side as `{}` and
 * `DataTransferItemList.add()` then rejects it ("parameter 1 is not of type
 * 'File'"). The bytes have to be carried explicitly, so the PDF renderer
 * (which runs in the background — see `fileTemplate/renderPdf`) hands back
 * this shape and the content script rebuilds the `File` itself.
 */
export interface TransferableFile {
  name: string;
  type: string;
  /** Standard base64, no data-URL prefix. */
  base64: string;
}

// `String.fromCharCode(...bytes)` blows the call stack on anything but a
// tiny file, so the string is built in chunks. 8KB is comfortably under
// every engine's argument limit while keeping the loop short.
const CHUNK_SIZE = 8192;

export async function toTransferableFile(file: File): Promise<TransferableFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return { name: file.name, type: file.type, base64: btoa(binary) };
}

export function fromTransferableFile(transfer: TransferableFile): File {
  const binary = atob(transfer.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], transfer.name, { type: transfer.type });
}
