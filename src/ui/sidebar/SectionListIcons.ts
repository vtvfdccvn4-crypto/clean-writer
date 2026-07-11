export function folderIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2.25 5.25h11.5v6.95a.7.7 0 0 1-.7.7H2.95a.7.7 0 0 1-.7-.7V5.25Z" />
      <path d="M2.25 4.5a.7.7 0 0 1 .7-.7h3.2c.27 0 .53.11.71.29l.79.79H13a.7.7 0 0 1 .7.7v.32H2.25Z" />
    </svg>
  `;
}

export function fileIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4.25 2.75h4.6l2.9 2.9v7.6a.7.7 0 0 1-.7.7h-6.8a.7.7 0 0 1-.7-.7v-9.8a.7.7 0 0 1 .7-.7Z" />
      <path d="M8.85 2.75v3.05h3.05" />
    </svg>
  `;
}

export function chevronIconMarkup(isCollapsed: boolean): string {
  return isCollapsed
    ? `
      <svg class="explorer-icon explorer-icon--chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M6 4.5 10 8 6 11.5" />
      </svg>
    `
    : `
      <svg class="explorer-icon explorer-icon--chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M4.5 6 8 10l3.5-4" />
      </svg>
    `;
}

export function renameIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 11.95V13h1.05l6.9-6.9-1.05-1.05-6.9 6.9Z" />
      <path d="M9.4 3.05 10.95 1.5l2.55 2.55-1.55 1.55Z" />
    </svg>
  `;
}

export function deleteIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 5h9" />
      <path d="M6.15 5V3.95c0-.42.34-.75.75-.75h2.2c.41 0 .75.33.75.75V5" />
      <path d="M5.35 5l.35 7.15c.04.42.39.75.81.75h2.98c.42 0 .77-.33.81-.75L10.65 5" />
    </svg>
  `;
}

export function pageBreakIconMarkup(): string {
  return `
    <svg class="explorer-icon page-break-toggle-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 5.5V2.5C3 2.22 3.22 2 3.5 2H12.5C12.78 2 13 2.22 13 2.5V5.5" />
      <path d="M3 10.5V13.5C3 13.78 3.22 14 3.5 14H12.5C12.78 14 13 13.78 13 13.5V10.5" />
      <path d="M1 8h14" stroke-dasharray="2 2" />
    </svg>
  `;
}
