import type { CustomBlockStyle } from '../types';
import type { AssetResolver } from '../platform/types';
import { collectDocumentAssetPaths } from '../services/ExportSnapshotService';

/**
 * The path-to-URL map a worker job needs. It is built on the page, after the
 * assets are preloaded, because only the page can resolve them.
 */
export function buildCompileAssets(
  markdown: string,
  customBlockStyles: readonly CustomBlockStyle[],
  assetResolver: AssetResolver
): Record<string, string> {
  const assets: Record<string, string> = {};
  for (const path of collectDocumentAssetPaths(markdown, customBlockStyles)) {
    assets[path] = assetResolver.resolveSync(path);
  }
  return assets;
}
