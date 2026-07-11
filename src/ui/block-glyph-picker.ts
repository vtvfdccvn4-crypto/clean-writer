import { isBlockGlyphPath, toBlockGlyphPath } from '../customBlockGlyphs';
import { resolveImageSource } from '../images/imageSources';
import { APP_STATE_EVENTS, state } from '../state';
import type { Platform, AssetResolver } from '../platform/types';
import { ProjectService } from '../services/ProjectService';
import { showNotice } from './components/Notice';
import { normalizeExplorerPath } from '../utils/path-utils';

export function createBlockIcon(assetResolver: AssetResolver | null | undefined, icon: string, className: string): HTMLElement | null {
  if (!icon) return null;
  if (isBlockGlyphPath(icon)) {
    const image = document.createElement('img');
    image.className = className;
    image.src = resolveImageSource(icon, assetResolver);
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    return image;
  }
  const text = document.createElement('span');
  text.className = className;
  text.textContent = icon;
  return text;
}

export function updateBlockGlyphPreview(assetResolver: AssetResolver | null | undefined) {
  const select = document.getElementById('cbs-icon') as HTMLSelectElement | null;
  const preview = document.getElementById('cbs-icon-preview') as HTMLImageElement | null;
  const empty = document.getElementById('cbs-icon-empty');
  const trigger = document.getElementById('cbs-icon-trigger');
  if (!select || !preview || !empty || !trigger) return;
  const glyph = select.value;
  const hasGlyph = isBlockGlyphPath(glyph);
  trigger.classList.toggle('is-empty', !hasGlyph);
  preview.classList.toggle('hidden', !isBlockGlyphPath(glyph));
  empty.classList.toggle('hidden', hasGlyph);
  if (hasGlyph) preview.src = resolveImageSource(glyph, assetResolver);
  else preview.removeAttribute('src');
  empty.textContent = hasGlyph ? glyph : 'Choose glyph';
  trigger.title = glyph ? `Selected glyph: ${glyph}` : 'Choose block glyph';

  document.querySelectorAll<HTMLButtonElement>('.block-glyph-option').forEach(option => {
    const selected = option.dataset.value === glyph;
    option.classList.toggle('is-selected', selected);
    option.setAttribute('aria-selected', String(selected));
  });
}

function closeBlockGlyphMenu() {
  document.getElementById('cbs-icon-menu')?.classList.add('hidden');
  document.getElementById('cbs-icon-trigger')?.setAttribute('aria-expanded', 'false');
}

function renderBlockGlyphMenu(assetResolver: AssetResolver | null | undefined) {
  const select = document.getElementById('cbs-icon') as HTMLSelectElement | null;
  const menu = document.getElementById('cbs-icon-menu');
  if (!select || !menu) return;
  menu.replaceChildren();

  Array.from(select.options).forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'block-glyph-option';
    button.dataset.value = option.value;
    button.title = option.text;
    button.setAttribute('role', 'option');

    if (isBlockGlyphPath(option.value)) {
      const image = document.createElement('img');
      image.src = resolveImageSource(option.value, assetResolver);
      image.alt = option.text;
      button.appendChild(image);
    } else {
      button.textContent = option.value || 'None';
      button.classList.add('block-glyph-option--text');
    }

    button.addEventListener('click', () => {
      select.value = option.value;
      updateBlockGlyphPreview(assetResolver);
      closeBlockGlyphMenu();
      document.getElementById('cbs-icon-trigger')?.focus();
    });
    menu.appendChild(button);
  });
}

export async function loadBlockGlyphOptions(platform: Platform, selectedValue?: string) {
  const select = document.getElementById('cbs-icon') as HTMLSelectElement | null;
  if (!select) return;
  const valueToKeep = selectedValue ?? select.value;
  select.replaceChildren(new Option('No icon', ''));
  const glyphPaths: string[] = [];

  const { projectRef } = state.current;
  if (projectRef) {
    const session = await platform.workspaceRepository.open(projectRef);
    const entries = await session.listImages();
    // The workspace image listing also contains regular images. Glyphs are
    // canonical assets under assets/glyphs and must be selected directly,
    // never inferred from an image path.
    entries
      .filter(entry => isBlockGlyphPath(entry.path))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }))
      .forEach(entry => {
        const normalized = entry.path.replace(/\\/g, '/');
        const value = normalized.startsWith('assets/glyphs/') ? normalized : toBlockGlyphPath(normalized);
        const label = normalizeExplorerPath(normalized).split('/').pop() || normalized;
        select.add(new Option(label, value));
        glyphPaths.push(value);
      });
  }

  if (valueToKeep && !Array.from(select.options).some(option => option.value === valueToKeep)) {
    const missingLabel = normalizeExplorerPath(valueToKeep).split('/').pop() || valueToKeep;
    select.add(new Option(isBlockGlyphPath(valueToKeep) ? `${missingLabel} (missing)` : `${missingLabel} (legacy)`, valueToKeep));
  }
  select.value = valueToKeep;
  if (isBlockGlyphPath(valueToKeep)) glyphPaths.push(valueToKeep);
  if (glyphPaths.length) await platform.assetResolver.preloadImages([...new Set(glyphPaths)]);
  renderBlockGlyphMenu(platform.assetResolver);
  updateBlockGlyphPreview(platform.assetResolver);
}

export function initBlockGlyphPicker(platform: Platform) {
  document.getElementById('cbs-icon-trigger')?.addEventListener('click', event => {
    event.stopPropagation();
    const menu = document.getElementById('cbs-icon-menu');
    const trigger = document.getElementById('cbs-icon-trigger');
    if (!menu || !trigger) return;
    const hidden = menu.classList.contains('hidden');
    trigger.setAttribute('aria-expanded', String(hidden));
    menu.classList.toggle('hidden', !hidden);
    if (hidden) {
      // focus selected
      menu.querySelector<HTMLButtonElement>('.block-glyph-option.is-selected')?.focus();
    }
  });
  
  document.getElementById('btn-upload-glyph')?.addEventListener('click', () => {
    const { projectRef } = state.get;
    if (!projectRef) return showNotice('No project open', 'warning');
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      
      try {
        const session = await platform.workspaceRepository.open(projectRef);
        let lastUploadedPath = '';
        for (const file of Array.from(files)) {
          const buffer = new Uint8Array(await file.arrayBuffer());
          const glyphName = `assets/glyphs/${file.name}`;
          const success = await ProjectService.uploadImage(session, glyphName, buffer);
          if (success) {
            // Need to retrieve final name in case of collision
            const imgs = await session.listImages();
            const latest = imgs.find(img => img.path.startsWith(`assets/glyphs/`) && img.path.includes(file.name.replace(/\.[^.]+$/, '')));
            if (latest) lastUploadedPath = latest.path;
          }
        }
        await loadBlockGlyphOptions(platform, toBlockGlyphPath(lastUploadedPath));
      } catch (err) {
        console.error('Failed to upload block glyph:', err);
        showNotice('Could not upload block glyph.', 'error');
      }
    };
    input.click();
  });

  state.on(APP_STATE_EVENTS.projectChanged, () => void loadBlockGlyphOptions(platform));
  document.addEventListener('click', closeBlockGlyphMenu);
}
