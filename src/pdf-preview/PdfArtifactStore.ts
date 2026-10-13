import type { PdfArtifact } from './PdfArtifact';
import { samePdfArtifactKey, type PdfArtifactKey } from './PdfRenderSnapshot';

/** Keeps the latest complete artifact and refuses reuse for a different snapshot. */
export class PdfArtifactStore {
  private artifact: PdfArtifact | null = null;

  get(key: PdfArtifactKey): PdfArtifact | null {
    return this.artifact && samePdfArtifactKey(this.artifact.key, key) ? this.artifact : null;
  }

  replace(artifact: PdfArtifact): void {
    this.artifact = artifact;
  }

  clear(): void {
    this.artifact = null;
  }
}
