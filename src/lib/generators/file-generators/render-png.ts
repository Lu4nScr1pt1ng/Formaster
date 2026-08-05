import type { FileTemplate } from '../../schema/file-template';
import { resolveOutputFilename, resolveTextSource } from './resolve-text-sources';

export async function renderPng(template: FileTemplate, flowId: string): Promise<File> {
  if (!template.canvas) throw new Error(`Template "${template.name}" has no canvas size`);

  const canvas = document.createElement('canvas');
  canvas.width = template.canvas.width;
  canvas.height = template.canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  await drawBackground(ctx, template, canvas.width, canvas.height);

  for (const layer of template.textLayers) {
    const text = await resolveTextSource(layer.source, flowId);
    ctx.font = `${layer.fontWeight === 'bold' ? 'bold ' : ''}${layer.fontSizePx}px sans-serif`;
    ctx.fillStyle = layer.color;
    ctx.textAlign = layer.align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, layer.x, layer.y, layer.maxWidthPx);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to render PNG');
  const filename = await resolveOutputFilename(template.outputFilename, flowId);
  return new File([blob], filename, { type: 'image/png' });
}

async function drawBackground(ctx: CanvasRenderingContext2D, template: FileTemplate, width: number, height: number): Promise<void> {
  if (template.background.kind === 'blank') {
    ctx.fillStyle = template.background.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (template.background.kind === 'image') {
    const image = await loadImage(template.background.dataUrl);
    ctx.drawImage(image, 0, 0, width, height);
    return;
  }
  throw new Error(`Unsupported background "${template.background.kind}" for a png template`);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load background image'));
    image.src = dataUrl;
  });
}
