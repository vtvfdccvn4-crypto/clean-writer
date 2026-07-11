export type NoticeType = 'info' | 'error' | 'warning';

const MAX_NOTICES = 3;
const NOTICE_DURATION_MS = 5000;

let noticeQueue: Array<{ message: string; type: NoticeType }> = [];
let activeNotices: HTMLElement[] = [];

export function showNotice(message: string, type: NoticeType = 'info'): void {
  const container = document.getElementById('notice-container');
  if (!container) {
    // Fallback if container isn't ready
    if (type === 'error' || type === 'warning') {
      console.warn(`[Notice ${type}]`, message);
    } else {
      console.log(`[Notice ${type}]`, message);
    }
    return;
  }

  // Deduplicate exact messages currently showing or in queue
  const isDuplicate = activeNotices.some(el => el.textContent === message) || noticeQueue.some(item => item.message === message);
  if (isDuplicate) return;

  if (activeNotices.length >= MAX_NOTICES) {
    noticeQueue.push({ message, type });
    return;
  }

  renderNotice(container, message, type);
}

export function dismissAllNotices(): void {
  const container = document.getElementById('notice-container');
  if (!container) return;
  
  activeNotices.forEach(notice => {
    notice.classList.add('removing');
    setTimeout(() => notice.remove(), 300);
  });
  
  activeNotices = [];
  noticeQueue = [];
}

function renderNotice(container: HTMLElement, message: string, type: NoticeType): void {
  const notice = document.createElement('div');
  notice.className = `notice notice-${type}`;
  notice.setAttribute('data-notice-type', type);
  notice.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
  notice.textContent = message;

  // Manual dismiss
  notice.addEventListener('click', () => {
    removeNotice(container, notice);
  });

  // Slide-in animation trigger
  requestAnimationFrame(() => {
    notice.classList.add('visible');
  });

  container.appendChild(notice);
  activeNotices.push(notice);

  // Auto dismiss
  setTimeout(() => {
    if (activeNotices.includes(notice)) {
      removeNotice(container, notice);
    }
  }, NOTICE_DURATION_MS);
}

function removeNotice(container: HTMLElement, notice: HTMLElement): void {
  notice.classList.remove('visible');
  notice.classList.add('removing');
  
  // Remove from active array immediately so queue can process
  activeNotices = activeNotices.filter(n => n !== notice);
  
  // Wait for animation
  setTimeout(() => {
    notice.remove();
    
    // Process queue
    if (noticeQueue.length > 0 && activeNotices.length < MAX_NOTICES) {
      const next = noticeQueue.shift()!;
      renderNotice(container, next.message, next.type);
    }
  }, 300);
}
