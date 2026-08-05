<script lang="ts">
  import type { FileTemplate, TextLayer } from '../lib/schema/file-template';

  interface Props {
    template: FileTemplate;
  }

  let { template }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement>();

  // Live, synchronous preview only — a `flowVariable` layer shows its `{{key}}`
  // placeholder instead of a real value. The real render (`render-png.ts`)
  // resolves those against `flow-values-store.ts` at fill time; doing that
  // here too would mean an async storage round trip on every keystroke while
  // editing a layer, for no benefit (there's no "current" flow to resolve
  // against while authoring a template shared across flows).
  function previewText(layer: TextLayer): string {
    return layer.source.kind === 'literal' ? layer.source.value || '(empty)' : `{{${layer.source.key || '…'}}}`;
  }

  $effect(() => {
    const canvas = canvasEl;
    if (!canvas || !template.canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = template.canvas.width;
    canvas.height = template.canvas.height;
    draw(ctx, canvas.width, canvas.height);
  });

  function draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);
    if (template.background.kind === 'image' && template.background.dataUrl) {
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 0, 0, width, height);
        drawLayers(ctx);
      };
      image.onerror = () => drawLayers(ctx);
      image.src = template.background.dataUrl;
      return;
    }
    if (template.background.kind === 'blank') {
      ctx.fillStyle = template.background.color;
      ctx.fillRect(0, 0, width, height);
    }
    drawLayers(ctx);
  }

  function drawLayers(ctx: CanvasRenderingContext2D): void {
    for (const layer of template.textLayers) {
      ctx.font = `${layer.fontWeight === 'bold' ? 'bold ' : ''}${layer.fontSizePx}px sans-serif`;
      ctx.fillStyle = layer.color;
      ctx.textAlign = layer.align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(previewText(layer), layer.x, layer.y, layer.maxWidthPx);
    }
  }
</script>

<canvas bind:this={canvasEl} class="max-h-80 max-w-full rounded-lg border border-hair bg-white object-contain"></canvas>
