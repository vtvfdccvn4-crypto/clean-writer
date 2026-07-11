export const projectReviewDrawerTemplate = (): string => `
  <aside id="project-review-drawer" class="drawer hidden" aria-label="Project review">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span>Project Review</span>
        <p class="drawer-subtitle">Lightweight structural checks</p>
      </div>
      <button class="drawer-close-button" type="button" aria-label="Close project review" title="Close project review" aria-controls="project-review-drawer">×</button>
    </div>
    <div class="drawer-body">
      <div class="project-review-toolbar">
        <span id="project-review-status" class="drawer-note" aria-live="polite"></span>
        <button id="project-review-refresh" class="drawer-secondary-button" type="button">Review again</button>
      </div>
      <div id="project-review-results" class="project-review-results"></div>
      <div id="project-review-empty" class="document-outline-empty hidden">
        <p class="drawer-note">No structural issues found.</p>
      </div>
    </div>
  </aside>
`;
