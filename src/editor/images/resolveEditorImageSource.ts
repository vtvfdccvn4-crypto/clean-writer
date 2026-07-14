import type { AssetResolver } from '../../platform/types';

/** Resolve a project image for a future editor widget without changing editor layout. */
export async function resolveEditorImageSource(source: string, assetResolver: AssetResolver): Promise<string> {
  await assetResolver.preloadImages([source]);
  return assetResolver.resolveSync(source);
}
