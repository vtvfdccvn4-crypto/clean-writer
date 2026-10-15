import { state } from '../../state';
import type { FileNode } from '../../types';
import { getBaseName, normalizeExplorerPath } from '../../utils/path-utils';
import { getExplorerDisplayRoots, type ExplorerTreeNode } from '../../utils/tree-utils';
import { buildProjectImageMarkdown } from '../../images/imageMarkdown';
import { applyImageFallback, resolveImageSource } from '../../images/imageSources';
import type { AssetResolver } from '../../platform/types';

const expandedImageNodes = new Set<string>();

export function renderTaskImages(
  content: HTMLElement,
  empty: HTMLElement,
  assetResolver: AssetResolver,
  insertImageMarkdown: (markdown: string) => boolean
): void {
  // `listImages()` also includes the internal assets tree. The Images view is
  // only for user-managed images, with `images/` acting as the implied root.
  const entries = (state.current.images as FileNode[]).filter(entry => {
    const path = normalizeExplorerPath(entry.path).toLowerCase();
    return !path.startsWith('assets/');
  });
  const images = entries.filter(image => !image.isDir);
  content.innerHTML = '';
  if (!state.current.projectRef || images.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const layout = document.createElement('div');
  layout.className = 'task-images-layout';
  const list = document.createElement('div');
  list.className = 'task-images-list';
  const frame = document.createElement('div');
  frame.className = 'task-image-preview-frame';
  const previewImage = document.createElement('img');
  previewImage.className = 'task-image-preview-image';
  previewImage.hidden = true;
  previewImage.alt = '';
  const previewStatus = document.createElement('span');
  previewStatus.className = 'task-image-preview-status';
  previewStatus.textContent = 'Hover an image to preview it';
  frame.append(previewImage, previewStatus);
  let previewRequest = 0;

  const showPreview = async (image: FileNode): Promise<void> => {
    const request = ++previewRequest;
    previewImage.hidden = true;
    previewStatus.textContent = 'Loading preview…';
    try {
      await assetResolver.preloadImages([image.path]);
      if (request !== previewRequest) return;
      previewImage.src = resolveImageSource(image.path, assetResolver);
      previewImage.alt = getBaseName(image.path);
      previewImage.hidden = false;
      previewStatus.textContent = '';
    } catch {
      if (request !== previewRequest) return;
      applyImageFallback(previewImage, image.path);
      previewImage.alt = getBaseName(image.path);
      previewImage.hidden = false;
      previewStatus.textContent = '';
    }
  };

  const renderNode = (node: ExplorerTreeNode): DocumentFragment => {
    const fragment = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'task-images-node';

    if (node.isDir) {
      const item = document.createElement('div');
      item.className = 'task-images-folder';
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      const expanded = expandedImageNodes.has(node.path);
      item.setAttribute('aria-expanded', String(expanded));
      item.setAttribute('aria-label', `Folder ${getBaseName(node.path)}`);
      const glyph = document.createElement('span');
      glyph.className = 'task-images-folder-glyph';
      glyph.textContent = expanded ? '▾' : '▸';
      const label = document.createElement('span');
      label.className = 'task-images-folder-label';
      label.textContent = getBaseName(node.path);
      item.append(glyph, label);

      const toggle = () => {
        if (expanded) expandedImageNodes.delete(node.path);
        else expandedImageNodes.add(node.path);
        renderTaskImages(content, empty, assetResolver, insertImageMarkdown);
      };
      item.addEventListener('click', toggle);
      item.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      });
      container.append(item);
      if (expanded && node.children.length > 0) {
        const children = document.createElement('div');
        children.className = 'task-images-children';
        children.append(...node.children.map(renderNode));
        container.append(children);
      }
    } else {
      const image = images.find(entry => entry.path === node.path) ?? node;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'task-images-item';
      item.draggable = true;
      const path = document.createElement('span');
      path.className = 'task-images-item-path';
      path.textContent = getBaseName(image.path);
      path.title = image.path;
      item.setAttribute('aria-label', getBaseName(image.path));
      item.title = image.path;
      item.append(path);
      item.addEventListener('mouseenter', () => void showPreview(image));
      item.addEventListener('dblclick', event => {
        event.preventDefault();
        insertImageMarkdown(buildProjectImageMarkdown(image.path, state.current.imageSetup));
      });
      item.addEventListener('dragstart', event => {
        const markdown = buildProjectImageMarkdown(image.path, state.current.imageSetup);
        event.dataTransfer?.setData('text/x-clear-writer-image-markdown', markdown);
        event.dataTransfer?.setData('text/x-clear-writer-image-path', image.path);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      });
      container.append(item);
    }
    fragment.append(container);
    return fragment;
  };

  const roots = getExplorerDisplayRoots(entries, 'images');
  const tree = document.createElement('div');
  tree.className = 'task-images-tree';
  tree.append(...roots.map(renderNode));
  list.append(tree);
  layout.append(list, frame);
  content.append(layout);
}
