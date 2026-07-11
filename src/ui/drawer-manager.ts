type DrawerTarget = string | HTMLElement;

function resolveDrawer(target: DrawerTarget): HTMLElement | null {
  return typeof target === 'string' ? document.getElementById(target) : target;
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
