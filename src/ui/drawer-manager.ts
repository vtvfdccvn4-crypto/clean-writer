type DrawerTarget = string | HTMLElement;

function resolveDrawer(target: DrawerTarget): HTMLElement | null {
  return typeof target === 'string' ? document.getElementById(target) : target;
}

function getDrawerBackdrop(): HTMLElement | null {
  return document.getElementById('drawer-backdrop');
}

function getDrawerHostElements(): HTMLElement[] {
  return [
    document.querySelector<HTMLElement>('.app-bar'),
    document.querySelector<HTMLElement>('.workspace-shell'),
    document.querySelector<HTMLElement>('.notice-container')
  ].filter((element): element is HTMLElement => Boolean(element));
}

function setDrawerIsolation(active: boolean): void {
  getDrawerHostElements().forEach((element) => {
    if (active) {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    } else {
      element.removeAttribute('inert');
      element.removeAttribute('aria-hidden');
    }
  });

  const backdrop = getDrawerBackdrop();
  if (backdrop) {
    backdrop.classList.toggle('hidden', !active);
  }
}

function updateDrawerIsolation(): void {
  const anyOpen = Boolean(document.querySelector<HTMLElement>('.drawer:not(.hidden)'));
  setDrawerIsolation(anyOpen);
}

function syncLauncherState(drawer: HTMLElement, open: boolean): void {
  document
    .querySelectorAll<HTMLElement>(`[aria-controls="${drawer.id}"]`)
    .forEach(launcher => launcher.setAttribute('aria-expanded', String(open)));
}

export function closeDrawer(target: DrawerTarget): void {
  const drawer = resolveDrawer(target);
  if (!drawer) return;
  drawer.classList.add('hidden');
  syncLauncherState(drawer, false);
  updateDrawerIsolation();
}

export function closeAllDrawers(except?: HTMLElement): void {
  document.querySelectorAll<HTMLElement>('.drawer').forEach(drawer => {
    if (drawer !== except) closeDrawer(drawer);
  });
}

export function openDrawer(target: DrawerTarget): boolean {
  const drawer = resolveDrawer(target);
  if (!drawer) return false;
  closeAllDrawers(drawer);
  drawer.classList.remove('hidden');
  syncLauncherState(drawer, true);
  updateDrawerIsolation();
  return true;
}

export function toggleDrawer(target: DrawerTarget): boolean {
  const drawer = resolveDrawer(target);
  if (!drawer) return false;
  if (!drawer.classList.contains('hidden')) {
    closeDrawer(drawer);
    return false;
  }
  return openDrawer(drawer);
}
