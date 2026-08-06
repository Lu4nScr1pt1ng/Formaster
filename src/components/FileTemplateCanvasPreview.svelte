<script lang="ts">
  import { BUILTIN_GENERATOR_LABELS } from '../lib/generators';
  import type { FileTemplate, TextLayer } from '../lib/schema/file-template';
  import type { CustomGenerator } from '../lib/schema/script';

  interface Props {
    template: FileTemplate;
    /** The script's generators, only so a `custom` layer can be labelled by name instead of by id. */
    customGenerators: CustomGenerator[];
  }

  let { template, customGenerators }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement>();

  // Live, synchronous preview only — every layer that isn't fixed text shows
  // a placeholder standing for the shape of its value, not the value itself.
  //
  // A `flowVariable` would need an async storage read on every keystroke,
  // against a flow that doesn't exist while authoring a shared template. A
  // generator layer *could* run (builtins are synchronous), but re-running it
  // on every keystroke would reshuffle the drawing under the user's cursor,
  // and a custom one is async QuickJS besides. The per-layer "Preview" button
  // in the editor resolves any of them on demand, for real.
  function previewText(layer: TextLayer): string {
    switch (layer.source.kind) {
      case 'literal':
        return layer.source.value || '(empty)';
      case 'flowVariable':
        return `{{${layer.source.key || '…'}}}`;
      case 'builtin':
        return `‹${BUILTIN_GENERATOR_LABELS[layer.source.id]}›`;
      case 'custom': {
        const generatorId = layer.source.generatorId;
        return `‹${customGenerators.find((entry) => entry.id === generatorId)?.name ?? 'generator'}›`;
      }
    }
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
