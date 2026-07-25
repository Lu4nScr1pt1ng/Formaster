<script lang="ts">
  import { DOC_CATEGORIES, type DocSection } from '../../lib/docs/content';

  interface Props {
    sections: DocSection[];
    activeId: string | null;
    onNavigate: (id: string) => void;
  }

  let { sections, activeId, onNavigate }: Props = $props();

  const grouped = $derived(
    DOC_CATEGORIES.map((category) => ({
      category,
      items: sections.filter((section) => section.category === category),
    })).filter((group) => group.items.length > 0),
  );

  function go(event: MouseEvent, id: string): void {
    event.preventDefault();
    onNavigate(id);
  }
</script>

<nav class="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
  {#each grouped as group (group.category)}
    <div>
      <p class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">{group.category}</p>
      <div class="space-y-0.5">
        {#each group.items as section (section.id)}
          <a
            href={`#${section.id}`}
            class="block truncate rounded-lg px-2 py-1.5 text-[12.5px] transition {activeId === section.id
              ? 'bg-accent-500/13 font-semibold text-accent-500'
              : 'text-ink-2 hover:bg-surface-hover hover:text-ink-1'}"
            onclick={(event) => go(event, section.id)}
          >
            {section.title}
          </a>
        {/each}
      </div>
    </div>
  {/each}
</nav>
