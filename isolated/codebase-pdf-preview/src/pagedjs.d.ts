declare module 'pagedjs' {
  export class Previewer {
    preview(source: HTMLElement, styles: string[], target: HTMLElement): Promise<unknown>;
  }
}
