import {FamilyStore} from './store/familyStore';
import {HomeEventListView} from './ui/HomeEventListView';

function setupToast(): (message: string) => void {
  const el = document.createElement('div');
  el.className = 'xr-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);

  let timer: number | null = null;
  return (message: string) => {
    el.textContent = message;
    el.classList.add('visible');
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      el.classList.remove('visible');
    }, 3200);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const store = new FamilyStore();
  const showToast = setupToast();
  store.setToastHandler((message) => showToast(message));
  new HomeEventListView(store);
});
