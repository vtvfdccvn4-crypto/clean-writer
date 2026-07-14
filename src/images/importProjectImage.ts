import type { AssetResolver, WorkspaceSession } from '../platform/types';
import { ProjectService } from '../services/ProjectService';
import { buildProjectImageMarkdown } from './imageMarkdown';

export interface ImportedProjectImage {
  markdown: string;
  path: string;
}

/** Persist a browser image file, refresh its object URL, and provide the canonical Markdown. */
export async function importProjectImage(
  session: WorkspaceSession,
  file: File,
  assetResolver: AssetResolver
): Promise<ImportedProjectImage | null> {
  const path = await ProjectService.uploadImageWithPath(session, file.name, new Uint8Array(await file.arrayBuffer()));
  if (!path) return null;
  await assetResolver.preloadImages([path]);
  return { path, markdown: buildProjectImageMarkdown(path) };
}
