/* Веб-клиент «Упр. учёт» для браузера на компьютере.
 * Загружается перед app.js только при открытии через «Доступ с компьютера».
 * Данные берутся с телефона и сохраняются обратно на телефон через его API. */
'use strict';

(function () {
  const KEY = 'upr-data';
  let rev = 0;
  let pendingSaves = 0;
  let lastLocalSave = 0;
  let offline = false;

  // 1. Синхронно получаем данные с телефона до запуска app.js
  try {
    const x = new XMLHttpRequest();
    x.open('GET', '/api/data', false);
    x.send(null);
    if (x.status === 401) { location.reload(); }
    const res = JSON.parse(x.responseText);
    rev = res.rev || 0;
    if (res.data) localStorage.setItem(KEY, JSON.stringify(res.data)); else localStorage.removeItem(KEY);
  } catch (e) {
    console.error('Не удалось получить данные с телефона', e);
  }

  // 2. Перехватываем сохранение app.js (в браузере оно пишет в localStorage) и отправляем на телефон
  const origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === window.localStorage && k === KEY) push(v);
  };
  let queued = null, sending = false;
  function push(body) {
    queued = body;
    lastLocalSave = Date.now();
    if (!sending) flush();
  }
  async function flush() {
    if (!queued) return;
    const body = queued;
    queued = null;
    sending = true;
    pendingSaves++;
    try {
      const r = await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (r.status === 401) return sessionLost();
      const j = await r.json();
      if (j.rev) rev = j.rev;
      setOffline(false);
    } catch (e) {
      setOffline(true);
      queued = queued || body; // повторим, когда связь вернётся
    } finally {
      pendingSaves--;
      sending = false;
      if (queued) setTimeout(flush, offline ? 3000 : 0);
    }
  }

  // 3. Следим за изменениями на телефоне
  async function poll() {
    try {
      const r = await fetch('/api/rev', { cache: 'no-store' });
      if (r.status === 401) return sessionLost();
      const j = await r.json();
      setOffline(false);
      if (j.rev !== rev && !pendingSaves && !queued && Date.now() - lastLocalSave > 1500) {
        const d = await (await fetch('/api/data', { cache: 'no-store' })).json();
        rev = d.rev;
        if (d.data) {
          origSet.call(localStorage, KEY, JSON.stringify(d.data));
          D = migrate(d.data);
          render();
        }
      }
    } catch (e) {
      setOffline(true);
    }
  }
  setInterval(poll, 3000);
  window.addEventListener('focus', poll);

  // 4. Плашка состояния
  function bar() {
    let b = document.getElementById('remote-bar');
    if (!b) {
      b = document.createElement('div');
      b.id = 'remote-bar';
      b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:60;padding:8px 14px;border-radius:999px;font:13px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.15);display:flex;gap:8px;align-items:center';
      document.body.appendChild(b);
    }
    return b;
  }
  function setOffline(v) {
    offline = v;
    const b = bar();
    b.style.background = v ? '#e5484d' : '#1f9d5a';
    b.style.color = '#fff';
    b.innerHTML = v ? '● Нет связи с телефоном — проверьте Wi-Fi и что доступ включён'
      : '● Подключено к телефону · можно перетащить сюда файлы из Битрикс24';
  }
  function sessionLost() {
    const b = bar();
    b.style.background = '#222634';
    b.style.color = '#fff';
    b.innerHTML = 'Сеанс завершён. <a href="/" style="color:#9db4ff">Войти снова</a>';
  }

  // 5. Перетаскивание файлов (выгрузки Битрикс24, резервные копии)
  const queue = [];
  let busy = false;
  async function next() {
    if (busy || !queue.length) return;
    const modalEl = document.getElementById('modal');
    if (modalEl && !modalEl.hidden) { setTimeout(next, 500); return; }
    busy = true;
    const f = queue.shift();
    const bytes = new Uint8Array(await f.arrayBuffer());
    const head = new TextDecoder().decode(bytes.subarray(0, 200));
    if (/upr-uchet-backup/.test(new TextDecoder().decode(bytes.subarray(0, 400))) || (/^\s*\{/.test(head) && /\.json$/i.test(f.name))) {
      window.__native('imported', new TextDecoder().decode(bytes));
    } else if (window.__bxImport) {
      await window.__bxImport.handleFile('', f.name, bytes);
    }
    busy = false;
    setTimeout(next, 500);
  }
  let overlay = null;
  function showOverlay(v) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:12px;z-index:70;border:3px dashed #2f5bea;border-radius:20px;background:rgba(47,91,234,.08);display:grid;place-items:center;font:600 22px -apple-system,Segoe UI,Roboto,sans-serif;color:#2f5bea;pointer-events:none';
      overlay.textContent = 'Отпустите файлы: контакты, задачи (CSV/Excel), календарь (.ics) или резервную копию';
      document.body.appendChild(overlay);
    }
    overlay.style.display = v ? 'grid' : 'none';
  }
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { dragDepth++; showOverlay(true); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) showOverlay(false); });
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    showOverlay(false);
    Array.from((e.dataTransfer && e.dataTransfer.files) || []).forEach((f) => queue.push(f));
    next();
  });

  window.__remote = { poll, get rev() { return rev; } };
  document.addEventListener('DOMContentLoaded', () => { setOffline(false); document.title = 'Упр. учёт — с компьютера'; });
})();
