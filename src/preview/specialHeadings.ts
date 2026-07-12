import { state } from '../state';

/** Adds per-definition document-wide counters after all sections have been merged. */
export function applySpecialHeadings(root: ParentNode): void {
  const definitions = state.get.pageSetup.specialHeadings || [];
  const counters = new Map(definitions.map(item => [item.id, item.counterStart - 1]));
  root.querySelectorAll<HTMLElement>('.special-heading[data-special-heading-id]').forEach(heading => {
    const id = heading.dataset.specialHeadingId || '';
    const definition = definitions.find(item => item.id === id);
    if (!definition) return;
    const next = (counters.get(id) ?? definition.counterStart - 1) + 1;
    counters.set(id, next);
    const marker = (root.ownerDocument || document).createElement('span');
    marker.className = 'special-heading-number';
    marker.setAttribute('aria-hidden', 'true');
    const prefix = definition.counterPrefix || `${definition.counterLabel || ''}${definition.counterLabel ? ' ' : ''}`;
    marker.textContent = `${prefix}${next}${definition.counterSuffix || ''} `;
    heading.prepend(marker);
  });
}
