import { resolvePageNumber } from '../preview/navigation/pageNavigation';

/** Moves the preview to a page or heading. Implemented by the preview coordinator. */
export interface PreviewNavigator {
  pageCount(): number;
  scrollToPage(pageNumber: number): boolean;
  scrollToAdjacentHeading(direction: 1 | -1): string | null;
}

/**
 * Wires the preview footer's heading buttons and page-jump field. The page field
 * is shown only while the paginated preview has pages, which is when the page
 * indicator is shown. Every result is announced once through the status region.
 */
export function setupPreviewNavigationControls(navigator: PreviewNavigator): void {
  const previousButton = document.getElementById('btn-preview-prev-heading');
  const nextButton = document.getElementById('btn-preview-next-heading');
  const jumpForm = document.getElementById('preview-page-jump');
  const jumpInput = document.getElementById('preview-page-jump-input');
  const indicator = document.getElementById('preview-page-indicator');
  const announcer = document.getElementById('preview-navigation-status');
  if (!(previousButton instanceof HTMLButtonElement) || !(nextButton instanceof HTMLButtonElement)
    || !(jumpForm instanceof HTMLFormElement) || !(jumpInput instanceof HTMLInputElement)) return;

  const announce = (message: string) => {
    if (announcer) announcer.textContent = message;
  };

  const moveToHeading = (direction: 1 | -1) => {
    const text = navigator.scrollToAdjacentHeading(direction);
    if (text) announce(`Heading: ${text}`);
    else announce(direction === 1 ? 'No next heading.' : 'No previous heading.');
  };
  previousButton.addEventListener('click', () => moveToHeading(-1));
  nextButton.addEventListener('click', () => moveToHeading(1));

  jumpForm.addEventListener('submit', event => {
    event.preventDefault();
    const pageCount = navigator.pageCount();
    const result = resolvePageNumber(jumpInput.value, pageCount);
    if (!result.ok) {
      announce(result.message);
      return;
    }
    navigator.scrollToPage(result.page);
    announce(`Page ${result.page} of ${pageCount}.`);
  });

  // The page indicator is hidden whenever there are no pages to jump between.
  if (indicator) {
    const syncVisibility = () => { jumpForm.hidden = indicator.hidden; };
    new MutationObserver(syncVisibility).observe(indicator, { attributes: true, attributeFilter: ['hidden'] });
    syncVisibility();
  }
}
