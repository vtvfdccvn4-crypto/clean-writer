import type {
  PageSetup,
  TypographySetup,
  ListSetup,
  TableSetup,
  ProjectMetadata,
  AppStateData,
  FileNode,
  CustomStyle,
  CustomBlockStyle,
  EditorSetup,
  ProjectSettingsSnapshot,
  ProjectSnapshot
} from './types';
import type { WorkspaceRef } from './platform/types';
import { DEFAULT_APP_STATE } from './config/defaults';

export * from './types';

export const APP_STATE_EVENTS = {
  projectChanged: 'project-changed',
  projectSnapshotChanged: 'project-snapshot-changed',
  projectTreeChanged: 'project-tree-changed',
  settingsSnapshotChanged: 'settings-snapshot-changed',
  selectionChanged: 'selection-changed',
  pageSetupChanged: 'page-setup-changed',
  typographySetupChanged: 'typography-setup-changed',
  listSetupChanged: 'list-setup-changed',
  tableSetupChanged: 'table-setup-changed',
  projectMetadataChanged: 'project-metadata-changed',
  customStylesChanged: 'custom-styles-changed',
  customBlockStylesChanged: 'custom-block-styles-changed',
  editorSetupChanged: 'editor-setup-changed'
} as const;

export type AppStateEvent = typeof APP_STATE_EVENTS[keyof typeof APP_STATE_EVENTS];

class AppState extends EventTarget {
  private data: AppStateData;

  constructor() {
    super();
    // Deep clone the default state to avoid reference mutations
    this.data = freezeSnapshot(cloneValue(DEFAULT_APP_STATE));
    try {
      const saved = localStorage.getItem('clear-writer-editor-setup');
      if (saved) {
        this.data = freezeSnapshot({
          ...this.data,
          editorSetup: { ...this.data.editorSetup, ...JSON.parse(saved) }
        });
      }
    } catch {
      // Storage is optional (and unavailable in non-browser test environments).
    }
  }

  get current(): Readonly<AppStateData & { projectPath: string | null }> {
    const result = {
      ...this.data,
      projectPath: this.data.projectRef ? this.data.projectRef.id : null
    };
    return Object.freeze(result) as any;
  }

  /** @deprecated Migrate callers incrementally to `state.current`. */
  get get(): Readonly<AppStateData & { projectPath: string | null }> {
    return this.current;
  }

  on(eventName: AppStateEvent, listener: EventListener): () => void {
    this.addEventListener(eventName, listener);
    return () => this.removeEventListener(eventName, listener);
  }

  private emit(eventName: AppStateEvent) {
    this.dispatchEvent(new Event(eventName));
  }

  private replace(patch: Partial<AppStateData>) {
    this.data = freezeSnapshot({ ...this.data, ...cloneValue(patch) });
  }

  private replaceProject(patch: Partial<AppStateData>) {
    this.replace({ ...patch, projectRevision: this.data.projectRevision + 1 });
  }

  setProjectRef(ref: WorkspaceRef | null) {
    this.replaceProject({ projectRef: ref });
    this.emit(APP_STATE_EVENTS.projectChanged);
  }

  closeProject() {
    this.data = freezeSnapshot({
      ...cloneValue(DEFAULT_APP_STATE),
      editorSetup: cloneValue(this.data.editorSetup),
      projectRevision: this.data.projectRevision + 1
    });
    this.emit(APP_STATE_EVENTS.projectChanged);
    this.emit(APP_STATE_EVENTS.projectSnapshotChanged);
  }

  setProjectPath(path: string | null) {
    if (path === null) {
      this.setProjectRef(null);
    } else {
      throw new Error('setProjectPath is not available in the web-only runtime. Use setProjectRef instead.');
    }
  }

  commitProjectSnapshot(snapshot: ProjectSnapshot) {
    this.replaceProject({
      ...snapshot,
      activeFile: null,
      isFullDocMode: true
    });
    this.emit(APP_STATE_EVENTS.projectSnapshotChanged);
  }

  setProjectTree(sections: FileNode[], images: FileNode[], activeFile: string | null = this.data.activeFile) {
    this.replaceProject({
      sections,
      images,
      activeFile,
      isFullDocMode: activeFile === null
    });
    this.emit(APP_STATE_EVENTS.projectTreeChanged);
  }

  commitSettingsSnapshot(settings: ProjectSettingsSnapshot) {
    this.replaceProject(settings);
    this.emit(APP_STATE_EVENTS.settingsSnapshotChanged);
  }

  setActiveFile(file: string | null) {
    this.replace({ activeFile: file, isFullDocMode: file === null });
    this.emit(APP_STATE_EVENTS.selectionChanged);
  }

  setFullDocMode() {
    this.replace({ isFullDocMode: true, activeFile: null });
    this.emit(APP_STATE_EVENTS.selectionChanged);
  }

  setPageSetup(setup: PageSetup) {
    this.replaceProject({ pageSetup: setup });
    this.emit(APP_STATE_EVENTS.pageSetupChanged);
  }

  setTypographySetup(setup: TypographySetup) {
    this.replaceProject({ typographySetup: setup });
    this.emit(APP_STATE_EVENTS.typographySetupChanged);
  }

  setListSetup(setup: ListSetup) {
    this.replaceProject({ listSetup: setup });
    this.emit(APP_STATE_EVENTS.listSetupChanged);
  }

  setTableSetup(setup: TableSetup) {
    this.replaceProject({ tableSetup: setup });
    this.emit(APP_STATE_EVENTS.tableSetupChanged);
  }

  setProjectMetadata(metadata: ProjectMetadata) {
    this.replaceProject({ projectMetadata: metadata });
    this.emit(APP_STATE_EVENTS.projectMetadataChanged);
  }

  setCustomStyles(styles: CustomStyle[]) {
    this.replaceProject({ customStyles: styles });
    this.emit(APP_STATE_EVENTS.customStylesChanged);
  }

  setCustomBlockStyles(styles: CustomBlockStyle[]) {
    this.replaceProject({ customBlockStyles: styles });
    this.emit(APP_STATE_EVENTS.customBlockStylesChanged);
  }

  setEditorSetup(setup: EditorSetup) {
    this.replace({ editorSetup: setup });
    try {
      localStorage.setItem('clear-writer-editor-setup', JSON.stringify(setup));
    } catch {
      // Keep the in-memory setting when storage is unavailable.
    }
    this.emit(APP_STATE_EVENTS.editorSetupChanged);
  }
}

export const state = new AppState();

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function freezeSnapshot<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value as Record<string, unknown>).forEach(freezeSnapshot);
  return value;
}
