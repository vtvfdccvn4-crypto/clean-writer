import type { AssetResolver, WorkspaceSession } from '../platform/types';
import type { ImageSetup } from '../types';
import { ProjectService } from '../services/ProjectService';
import { buildProjectImageMarkdown } from './imageMarkdown';
import { nextPastedImageFilename, pastedImageExtension } from './pastedImage';
import type { PastedImageResult } from '../editor/extensions/imagePasteExtension';

/** Store a clipboard image and return standalone Markdown for the active section. */
export async function importPastedImage(
  session: WorkspaceSession,
  file: File,
  sectionPath: string,
  assetResolver: AssetResolver,
  imageSetup: ImageSetup
): Promise<PastedImageResult | null> {
  const images = await session.listImages();
  const filename = nextPastedImageFilename(sectionPath, images.map(image => image.path), pastedImageExtension(file));
  const path = await ProjectService.uploadImageWithPath(
    session,
    filename,
    new Uint8Array(await file.arrayBuffer()),
    { refreshTree: false }
  );
  if (!path) return null;
  await assetResolver.preloadImages([path]);
  return {
    markdown: `\n${buildProjectImageMarkdown(path, imageSetup)}\n`,
    afterInsert: () => {
      void ProjectService.refreshProjectTree(session).catch(error => {
        console.error('[Pasted image] Failed to refresh the image list.', error);
      });
    }
  };
}
