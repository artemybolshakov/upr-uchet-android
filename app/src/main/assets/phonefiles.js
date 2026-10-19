/* 管理会计 — передача файлов с компьютера на телефон и установка новой версии.
 *  - Веб-версия («Доступ с компьютера»): экран «Файлы на телефон» — перетаскивание, прогресс, скорость, отмена, список загрузок.
 *  - Приложение на телефоне: окно установки обновления (по нажатию на уведомление) и раздел «Обновления приложения» в настройках.
 * Загружается после app.js.
 */
'use strict';

const IS_WEB = !N && !!window.RemoteCal; // открыто с компьютера через «Доступ с компьютера»
const fmtBytes = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' ГБ' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : b >= 1024 ? Math.round(b / 1024) + ' КБ' : b + ' Б');
const fmtWhen = (ms) => { const d = new Date(ms); return (ymd(d) === today() ? 'сегодня' : fmtDate(ymd(d))) + ' ' + hm(d); };
const apkLabel = (a) => (a && a.valid ? `${a.versionName || '?'}${a.build ? ' (сборка ' + a.build + ')' : ' (код ' + a.versionCode + ')'}` : '');

/* =========================== Веб-версия =========================== */
ui.pf = { queue: [], cur: null, list: null, timer: null };

if (IS_WEB) {
  I.upload = '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>';
  TABS.push({ id: 'files', name: 'Файлы на телефон', icon: 'upload' });
  try { renderNav(); } catch (e) { /* */ }
}

function pfLoadList() {
  fetch('/api/uploads', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j) return;
    ui.pf.list = j;
    if (ui.tab === 'files') pfRenderList();
  }).catch(() => {});
}
// пока открыт экран — обновляем статусы APK (установка подтверждается на телефоне)
function pfPoll() {
  clearInterval(ui.pf.timer);
  ui.pf.timer = setInterval(() => { if (ui.tab === 'files' && !ui.pf.cur) pfLoadList(); else if (ui.tab !== 'files') clearInterval(ui.pf.timer); }, 5000);
}

SCREENS.files = function () {
  if (!ui.pf.list) pfLoadList();
  pfPoll();
  return `<div class="head"><h1>Файлы на телефон</h1></div>
    <div class="pf-drop" id="pf-drop">
      <div class="pf-ic">${icon('upload')}</div>
      <div><b>Перетащите файлы сюда</b> или <button class="btn sm primary" data-a="pf-pick">Выбрать файл</button></div>
      <div class="sub">До 500 МБ. Обычные файлы сохраняются в «Загрузки/Упр. учёт» — их видно в приложении «Файлы» на телефоне. APK новой версии приложения — в папку обновлений, на телефоне появится уведомление «установить».</div>
    </div>
    <div id="pf-progress"></div>
    <div class="pf-hint">📱 Установку новой версии нужно подтвердить на самом телефоне — экран должен быть разблокирован.</div>
    <div class="section-title">Последние загрузки</div>
    <div id="pf-list"></div>`;
};
const _afterRenderPF = afterRender;
afterRender = function () { _afterRenderPF(); if (ui.tab === 'files') { pfRenderProgress(); pfRenderList(); } };

function pfRenderProgress() {
  const el = $('#pf-progress');
  if (!el) return;
  const c = ui.pf.cur;
  if (!c) { el.innerHTML = ui.pf.queue.length ? `<div class="sub">В очереди: ${ui.pf.queue.length}</div>` : ''; return; }
  const pct = c.total ? Math.min(100, (c.loaded / c.total) * 100) : 0;
  const left = c.speed > 0 ? Math.max(0, (c.total - c.loaded) / c.speed) : 0;
  el.innerHTML = `<div class="pf-cur card">
    <div class="row" style="gap:8px"><b class="grow ellipsis">${esc(c.file.name)}</b><span class="sub">${fmtBytes(c.loaded)} из ${fmtBytes(c.total)}</span>
      <button class="btn sm danger" data-a="pf-cancel">Отменить</button></div>
    <div class="pf-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="sub">${c.phase === 'saving' ? 'Телефон сохраняет файл и считает контрольную сумму…' : `${pct.toFixed(0)}% · ${c.speed ? fmtBytes(c.speed) + '/с' : 'начинаю…'}${c.speed && left > 1 ? ' · осталось ~' + (left > 90 ? Math.round(left / 60) + ' мин' : Math.round(left) + ' с') : ''}`}${ui.pf.queue.length ? ` · в очереди ещё ${ui.pf.queue.length}` : ''}</div>
  </div>`;
}

function pfRenderList() {
  const el = $('#pf-list');
  if (!el) return;
  const list = ui.pf.list;
  if (!list) { el.innerHTML = '<div class="list"><div class="empty">Загрузка списка…</div></div>'; return; }
  if (!list.length) { el.innerHTML = '<div class="list"><div class="empty">Пока ничего не передавали</div></div>'; return; }
  el.innerHTML = `<div class="list">${list.map((x) => {
    const a = x.apk;
    const warn = a && (!a.valid || !a.exists || a.sigMatch === false || !a.samePackage);
    return `<div class="item pf-item">
      <div class="pf-k">${x.kind === 'apk' ? '📦' : '📄'}</div>
      <div class="grow" style="min-width:0">
        <div class="t ellipsis">${esc(x.name)}</div>
        <div class="s">${fmtBytes(x.size)} · ${esc(fmtWhen(x.time))} · ${esc(x.location || '')}</div>
        ${a ? `<div class="s">${a.valid ? `Версия ${esc(apkLabel(a))}${a.current ? ` · на телефоне ${esc(apkLabel(Object.assign({ valid: true }, a.current)))}` : ''}` : ''}</div>
          <div class="pf-st ${warn ? 'bad' : /Ожидает/.test(x.status || '') ? 'wait' : 'ok'}">${esc(x.status || '')}</div>` : ''}
        <div class="pf-sha" title="Сверьте с суммой файла на компьютере">SHA-256: <code>${esc(x.sha256 || '')}</code></div>
      </div></div>`;
  }).join('')}</div>
  <div class="sub mt">Проверить сумму файла на компьютере: macOS — <code>shasum -a 256 файл</code>, Windows — <code>certutil -hashfile файл SHA256</code>.</div>`;
}

function pfEnqueue(files) {
  Array.from(files || []).forEach((f) => {
    if (f.size > 500 * 1024 * 1024) { toast(`«${f.name}» больше 500 МБ — не отправлен`); return; }
    if (!f.size) { toast(`«${f.name}» пустой — пропущен`); return; }
    ui.pf.queue.push(f);
  });
  if (ui.tab !== 'files') go('files');
  pfNext();
}
window.__phoneUpload = pfEnqueue;

function pfNext() {
  if (ui.pf.cur || !ui.pf.queue.length) { pfRenderProgress(); return; }
  const file = ui.pf.queue.shift();
  const xhr = new XMLHttpRequest();
  const c = ui.pf.cur = { file, xhr, loaded: 0, total: file.size, speed: 0, t0: Date.now(), samples: [], phase: 'sending' };
  xhr.open('POST', '/api/upload?name=' + encodeURIComponent(file.name));
  xhr.setRequestHeader('X-Upr', '1');
  xhr.setRequestHeader('Content-Type', 'application/octet-stream');
  xhr.upload.onprogress = (e) => {
    const now = Date.now();
    c.loaded = e.loaded; c.total = e.total || file.size;
    c.samples.push([now, e.loaded]);
    while (c.samples.length > 2 && now - c.samples[0][0] > 3000) c.samples.shift(); // скорость за последние ~3 с
    const [t0, b0] = c.samples[0];
    if (now > t0) c.speed = ((e.loaded - b0) / (now - t0)) * 1000;
    if (e.loaded >= c.total) c.phase = 'saving';
    pfRenderProgress();
  };
  const finish = (msg, ok) => {
    ui.pf.cur = null;
    if (msg) toast(msg);
    if (ok) pfLoadList();
    pfRenderProgress();
    setTimeout(pfNext, 200);
  };
  xhr.onload = () => {
    let j = {};
    try { j = JSON.parse(xhr.responseText || '{}'); } catch (e) { /* */ }
    if (xhr.status === 401) { finish('Сеанс завершён — войдите снова', false); return; }
    if (xhr.status !== 200 || !j.ok) { finish(`«${file.name}» не сохранён: ${j.error || 'ошибка ' + xhr.status}`, false); return; }
    const apk = j.apk || {};
    const msg = j.kind !== 'apk' ? `«${j.name}» сохранён в ${j.location}`
      : !apk.valid ? `«${j.name}» сохранён, но это не установочный файл Android`
        : apk.sigMatch === false ? `Версия ${apkLabel(apk)} на телефоне, но подпись отличается — поверх не установится`
          : `Новая версия ${apkLabel(apk)} на телефоне — подтвердите установку на нём`;
    finish(msg, true);
  };
  xhr.onerror = () => finish(`«${file.name}»: связь с телефоном прервалась. Незаконченный файл на телефоне удалён — отправьте ещё раз.`, false);
  xhr.onabort = () => finish(`Отправка «${file.name}» отменена`, false);
  xhr.send(file);
  pfRenderProgress();
}

Object.assign(ACTIONS, {
  'pf-pick': () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.onchange = () => pfEnqueue(inp.files);
    inp.click();
  },
  'pf-cancel': () => {
    ui.pf.queue = [];
    if (ui.pf.cur) ui.pf.cur.xhr.abort();
  },
});

// Уходят со страницы во время отправки — предупреждаем
window.addEventListener('beforeunload', (e) => { if (ui.pf.cur) { e.preventDefault(); e.returnValue = ''; } });

/* =========================== Телефон: установка =========================== */
function updDialog(name) {
  if (!N || !N.updateInfo) return;
  let a = {};
  try { a = JSON.parse(N.updateInfo(name) || '{}'); } catch (e) { a = {}; }
  ui.updName = name;
  if (!a.exists) { modal(`<h3>Файл обновления не найден</h3><div class="sub">«${esc(name)}» уже удалён: хранятся 3 последних APK. Передайте его с компьютера ещё раз.</div><div class="form-actions mt"><button class="btn" data-a="modal-close">Закрыть</button></div>`); return; }
  if (!a.valid) { modal(`<h3>Не удалось прочитать APK</h3><div class="sub">«${esc(name)}» повреждён или это не установочный файл Android.</div><div class="form-actions mt"><button class="btn" data-a="modal-close">Закрыть</button></div>`); return; }
  const cur = Object.assign({ valid: true }, a.current || {});
  const warns = [];
  if (!a.samePackage) warns.push(`Это APK другого приложения (${esc(a.packageName)}). Он установится отдельно, ваше приложение не обновится.`);
  if (a.sigMatch === false) warns.push('<b>Подпись отличается — установка поверх невозможна, придётся удалять приложение.</b> Перед удалением сохраните резервную копию в файл (или проверьте копию в папку), после установки восстановите данные из неё.');
  if (a.sigMatch === null) warns.push('Не удалось проверить подпись APK. Если установщик сообщит о конфликте, значит, подпись отличается.');
  if (a.samePackage && !a.newer) warns.push(`Версия не новее установленной (${esc(apkLabel(cur))}). Android может отказать в установке более старой версии.`);
  const blocked = a.samePackage && a.sigMatch === false;
  modal(`<h3>Установка новой версии</h3>
    <dl class="kv"><dt>Получена</dt><dd><b>${esc(apkLabel(a))}</b></dd><dt>Установлена</dt><dd>${esc(apkLabel(cur))}</dd><dt>Файл</dt><dd>${esc(a.name)} · ${fmtBytes(a.size)}</dd></dl>
    ${warns.length ? `<div class="upd-warn">${warns.map((w) => `<div>⚠️ ${w}</div>`).join('')}</div>` : '<div class="sub mt" style="color:var(--ok)">✓ Подпись совпадает, версия новее — установится поверх, данные сохранятся.</div>'}
    ${a.canInstall ? '' : '<div class="sub mt">Сначала нужно разрешить этому приложению устанавливать обновления: откроются настройки — включите «Разрешить из этого источника» и вернитесь назад.</div>'}
    <div class="sub mt">Перед установкой автоматически сохраняется резервная копия данных.</div>
    <div class="form-actions mt">
      ${blocked ? `<button class="btn primary" data-a="backup-export">${icon('share')}Сохранить копию в файл</button>`
        : `<button class="btn primary" data-a="upd-install">${icon('check')}${a.canInstall ? 'Установить' : 'Разрешить и установить'}</button>`}
      <button class="btn" data-a="modal-close">${blocked ? 'Закрыть' : 'Позже'}</button>
    </div>`);
}

const _nativePF = window.__native;
window.__native = function (type, payload) {
  if (type === 'update') { updDialog(payload); return; }
  _nativePF(type, payload);
  // вернулись из настроек «Неизвестные источники» — продолжаем установку
  if (type === 'resume' && ui.updWaitPermission) {
    ui.updWaitPermission = false;
    const name = ui.updName;
    setTimeout(() => { if (N.updateInfo && JSON.parse(N.updateInfo(name) || '{}').canInstall) ACTIONS['upd-install'](); else updDialog(name); }, 300);
  }
};

Object.assign(ACTIONS, {
  'upd-open': (el) => updDialog(el.dataset.id),
  'upd-install': () => {
    const name = ui.updName;
    try { save(true); } catch (e) { /* */ }
    const r = N.installUpdate(name);
    if (r === 'permission') { ui.updWaitPermission = true; modal(null); N.openUnknownSources(); toast('Разрешите установку из этого источника и вернитесь назад'); return; }
    if (r === 'started') { modal(null); toast('Резервная копия сохранена. Подтвердите установку в окне Android'); return; }
    if (r === 'missing') { toast('Файл обновления не найден'); return; }
    toast('Не удалось запустить установку: ' + String(r).replace(/^error:/, ''));
  },
  'upd-delete': (el) => { if (N.deleteUpdate(el.dataset.id)) { toast('Удалено'); render(); } },
});

/* Раздел «Обновления приложения» в настройках телефона */
function updatesBlock() {
  if (!N || !N.listUpdates) return '';
  let list = [], info = {};
  try { list = JSON.parse(N.listUpdates() || '[]'); } catch (e) { /* */ }
  try { info = JSON.parse(N.appInfo() || '{}'); } catch (e) { /* */ }
  return `<div class="section-title">Обновления приложения</div>
    <div class="card">
      <div class="sub">Установлена версия <b>${esc(info.version || APP_VERSION)}</b>${info.build ? ` (сборка ${esc(info.build)})` : ''}. Новую версию можно передать с компьютера: «Доступ с компьютера» → в браузере «Файлы на телефон» → перетащите APK.</div>
      ${list.length ? `<div class="list mt">${list.map((a) => `<div class="item" data-a="upd-open" data-id="${esc(a.name)}">
          <div class="grow"><div class="t">${esc(a.valid ? 'Версия ' + apkLabel(a) : a.name)}</div><div class="s">${esc(a.name)} · ${fmtBytes(a.size)} · ${esc(fmtWhen(a.modified))} · ${esc(a.status || '')}</div></div>
          <button class="btn sm" data-a="upd-delete" data-id="${esc(a.name)}" aria-label="Удалить">✕</button></div>`).join('')}</div>` : ''}
    </div>`;
}
const _settingsPF = SCREENS.settings;
SCREENS.settings = function () {
  const html = _settingsPF();
  const block = updatesBlock();
  if (!block) return html;
  const i = html.indexOf('<div class="section-title">О приложении</div>');
  return i < 0 ? html + block : html.slice(0, i) + block + '\n    ' + html.slice(i);
};
