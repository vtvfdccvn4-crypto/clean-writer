import { applyImageFallback, resolveImageSource } from '../../images/imageSources';
import { state } from '../../state';
import type { Platform } from '../../platform/types';

interface ImagePreviewElements {
  image: HTMLImageElement;
  empty: HTMLElement;
  caption: HTMLElement;
  btnInsert?: HTMLButtonElement;
}

function imageIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="2.25" y="3.25" width="11.5" height="9.5" rx="1.2" />
      <circle cx="5.1" cy="6" r="0.9" />
      <path d="M3.65 11.1 6 8.75l1.7 1.7 1.55-1.55 2.95 2.2" />
    </svg>
  `;
}

async function showPreview(file: string, preview: ImagePreviewElements, platform: Platform): Promise<void> {
  const assetPath = file.startsWith('images/') ? file : `images/${file}`;
  await platform.assetResolver.preloadImages([assetPath]);
  const source = resolveImageSource(assetPath, platform.assetResolver);
  
  preview.image.onerror = () => applyImageFallback(preview.image, source);
  preview.image.src = source;
  preview.image.alt = 'Preview';
  preview.image.classList.add('is-visible');
  
  preview.empty.hidden = true;
  preview.caption.textContent = file;
  if (preview.btnInsert) {
    preview.btnInsert.hidden = false;
    preview.btnInsert.dataset.imagePath = assetPath;
    const basename = assetPath.split('/').pop() || '';
    preview.btnInsert.dataset.altText = basename.replace(/\.[^.]+$/, '');
  }
}

function showEmptyPreview(preview: ImagePreviewElements): void {
  preview.image.onerror = null;
  preview.image.removeAttribute('src');
  preview.image.alt = '';
  preview.image.classList.remove('is-visible');
  preview.empty.hidden = false;
  preview.empty.textContent = 'No images';
  preview.caption.textContent = '';
  if (preview.btnInsert) {
    preview.btnInsert.hidden = true;
    preview.btnInsert.removeAttribute('data-image-path');
    preview.btnInsert.removeAttribute('data-alt-text');
  }
}

export const ImageList = {
  render(container: HTMLElement, preview: ImagePreviewElements, platform: Platform): void {
    const images = state.current.images.filter(fileNode => !fileNode.isDir);
    container.replaceChildren();

    const selectImage = async (file: string, row: HTMLElement): Promise<void> => {
      container.querySelectorAll<HTMLElement>('.image-list-item').forEach(item => {
        const selected = item === row;
        item.classList.toggle('is-previewing', selected);
        item.setAttribute('aria-selected', String(selected));
      });
      await showPreview(file, preview, platform);
    };

    images.forEach(fileNode => {
      const file = fileNode.path;
      const li = document.createElement('li');
      li.className = 'sidebar-item image-list-item';
      li.draggable = true;
      li.tabIndex = 0;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');

      const icon = document.createElement('span');
      icon.className = 'explorer-icon-wrap';
      icon.innerHTML = imageIconMarkup();

      const info = document.createElement('div');
      info.className = 'item-info';
      const title = document.createElement('span');
      title.className = 'item-title';
      title.textContent = file;
      info.appendChild(title);
      li.append(icon, info);

      li.addEventListener('mouseenter', () => selectImage(file, li));
      li.addEventListener('focus', () => selectImage(file, li));
      li.addEventListener('click', () => selectImage(file, li));
      li.addEventListener('dragstart', (event) => {
        if (!event.dataTransfer) return;
        const assetPath = file.startsWith('images/') ? file : `images/${file}`;
        const basename = assetPath.split('/').pop() || '';
        const altText = basename.replace(/\.[^.]+$/, '');
        const markdown = `![${altText}](<${assetPath}>)`;
        event.dataTransfer.setData('text/plain', markdown);
        event.dataTransfer.setData('application/x-clear-writer-project-image', assetPath);
        event.dataTransfer.effectAllowed = 'copy';
      });

      container.appendChild(li);
    });

    const firstRow = container.querySelector<HTMLElement>('.image-list-item');
    if (firstRow && images[0]) {
      void selectImage(images[0].path, firstRow);
    } else {
      showEmptyPreview(preview);
    }
  }
};
