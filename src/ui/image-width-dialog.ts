const VALID_WIDTH = /^(?:0|\d+(?:\.\d+)?(?:px|pt|mm|cm|in|em|rem|%))$/i;

/** Prompts for a safe CSS image width. An empty value removes the width attribute. */
export function showImageWidthDialog(currentWidth: string): Promise<string | null> {
  return new Promise(resolve => {
    const host = document.getElementById('project-flow-modal');
    if (!host) return resolve(null);

    host.innerHTML = `
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="image-width-modal-title">
        <form class="modal-dialog" id="image-width-form">
          <h2 id="image-width-modal-title" class="modal-title">Image width</h2>
          <div class="modal-body">
            <label class="image-width-field" for="image-width-input">
              <span>Width</span>
              <input id="image-width-input" type="text" inputmode="decimal" placeholder="100%" value="${currentWidth.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" aria-describedby="image-width-help image-width-error">
            </label>
            <p id="image-width-help">Use a number with a unit, such as 50%, 320px, or 80mm. Leave blank to use the image's natural width.</p>
            <p id="image-width-error" class="image-width-error" role="alert" hidden></p>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-text" id="btn-image-width-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Apply</button>
          </div>
        </form>
      </div>`;

    const form = host.querySelector<HTMLFormElement>('#image-width-form')!;
    const overlay = host.querySelector<HTMLElement>('.modal-overlay')!;
    const input = host.querySelector<HTMLInputElement>('#image-width-input')!;
    const error = host.querySelector<HTMLElement>('#image-width-error')!;
    const close = (value: string | null) => { host.innerHTML = ''; resolve(value); };

    host.querySelector('#btn-image-width-cancel')?.addEventListener('click', () => close(null));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(null); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(null); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const width = input.value.trim();
      if (width && !VALID_WIDTH.test(width)) {
        error.textContent = 'Enter a number followed by %, px, pt, mm, cm, in, em, or rem.';
        error.hidden = false;
        input.focus();
        return;
      }
      close(width);
    });
    input.focus();
    input.select();
  });
}
