export const symbolPickerDrawerTemplate = (): string => `
  <div id="symbol-picker" class="drawer hidden" aria-label="Insert symbol">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span class="drawer-eyebrow">Symbols</span>
        <h3>Insert symbol</h3>
      </div>
      <button id="close-symbol-picker" class="drawer-close-button" type="button" aria-label="Close symbol picker">✕</button>
    </div>

    <div class="drawer-body">
      <section class="drawer-card">
        <label class="symbol-search-field">
          <span>Search symbols</span>
          <input id="symbol-picker-search" type="search" placeholder="Try check, arrow, degree, alpha..." />
        </label>
      </section>

      <section class="drawer-card symbol-picker-section">
        <div class="symbol-picker-section-head">
          <h3>Recent</h3>
          <button id="clear-symbol-picker-recents" class="drawer-secondary-button" type="button">Clear</button>
        </div>
        <div id="symbol-picker-recent" class="symbol-grid" aria-label="Recent symbols"></div>
      </section>

      <section class="drawer-card symbol-picker-section">
        <div class="symbol-picker-section-head">
          <h3>All symbols</h3>
          <span class="field-help">Click a symbol to insert it at the caret.</span>
        </div>
        <div id="symbol-picker-categories" class="symbol-picker-categories"></div>
        <p id="symbol-picker-empty" class="field-help symbol-picker-empty" hidden>
          No symbols match your search.
        </p>
      </section>
    </div>
  </div>
`;
