import { renderInlineCreate, renderSectionList } from './SectionListRenderer';
import { revealAncestorFolders } from './SectionListState';
import type { Platform } from '../../platform/types';

export const SectionList = {
  render(container: HTMLElement, globalSaveActiveFile: () => Promise<boolean>, platform: Platform) {
    renderSectionList(container, globalSaveActiveFile, () => SectionList.render(container, globalSaveActiveFile, platform), platform);
  },

  renderInlineCreate,

  revealPath(path?: string | null): boolean {
    if (!path) return false;
    return revealAncestorFolders(path);
  }
};
