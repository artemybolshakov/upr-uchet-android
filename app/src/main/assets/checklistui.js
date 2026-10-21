/* 管理会计 — «Чек-лист дня»: карточка на «Моих делах», история, раздел в настройках, смена даты.
 * Данные и расчёты — Checklist (checklist.js). Загружается после app.js.
 */
'use strict';

ui.day = today();
ui.clShow = false; // показать выполненный (свёрнутый) чек-лист

/* ---------- Карточка на «Моих делах» ---------- */
function checklistCard() {
  if (D.settings.checklistShow === false) return '';
  const t0 = today();
  const items = Checklist.day(D, t0);
  if (!items.length) return `<div class="cl-empty">${icon('check')}Добавьте ежедневные пункты в <a href="#" class="link" data-a="cl-settings">настройках</a></div>`;
  const p = Checklist.progress(D, t0);
  if (p.all && !ui.clShow) {
    return `<div class="cl-done"><span class="cl-box on">${icon('check')}</span><span class="grow">Чек-лист дня выполнен · <button type="button" class="cl-count" data-a="cl-history">${p.done} из ${p.total}</button></span><button type="button" class="btn sm" data-a="cl-show">Показать</button></div>`;
  }
  const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
  return `<div class="cl-card ${p.all ? 'all' : ''}">
    <div class="cl-head"><span class="cl-ic">${icon('tasks')}</span><b>Чек-лист дня</b>
      <button type="button" class="cl-count" data-a="cl-history" title="История за 30 дней">${p.done} из ${p.total}</button>
      <span class="cl-note">обновится завтра в 00:00</span>${p.all ? '<button type="button" class="btn sm" data-a="cl-hide">Свернуть</button>' : ''}</div>
    <div class="cl-bar"><i style="width:${pct}%"></i></div>
    <div class="cl-items">${items.map((x) => `<button type="button" class="cl-row ${x.at ? 'on' : ''}" data-a="cl-toggle" data-id="${esc(x.id)}" aria-pressed="${x.at ? 'true' : 'false'}">
      <span class="cl-box">${x.at ? icon('check') : ''}</span><span class="cl-name">${esc(x.name)}</span>${x.at ? `<span class="cl-at">${esc(x.at)}</span>` : ''}</button>`).join('')}</div>
  </div>`;
}

/* ---------- История за 30 дней ---------- */
function checklistHistory() {
  const h = Checklist.history(D, today(), 30);
  const cell = (x) => {
    const lvl = !x.total ? 0 : x.ratio === 0 ? 0 : x.ratio < 0.5 ? 1 : x.ratio < 1 ? 2 : 3;
    return `<i class="cl-sq l${lvl} ${x.day === today() ? 'today' : ''}" title="${esc(fmtDate(x.day, true))}: ${x.done} из ${x.total}"></i>`;
  };
  const avg = h.days.length ? Math.round(h.days.reduce((s, x) => s + x.ratio, 0) / h.days.length * 100) : 0;
  return `<h3>Чек-лист дня: 30 дней</h3>
    <div class="cl-strip">${h.days.map(cell).join('')}</div>
    <div class="cl-strip-legend sub"><span>${esc(fmtDate(h.days[0].day))}</span><span>в среднем ${avg}%</span><span>сегодня</span></div>
    <div class="cl-pct">${h.items.map((x) => `<div class="cl-pct-row"><span class="grow">${esc(x.name)}</span><b>${x.pct}%</b><i class="cl-pct-bar"><i style="width:${x.pct}%"></i></i></div>`).join('') || '<div class="sub">Пунктов нет</div>'}</div>
    <div class="form-actions mt"><button class="btn" data-a="modal-close">Закрыть</button></div>`;
}

/* ---------- Настройки ---------- */
function checklistSettings() {
  const items = Checklist.active(D);
  return `<div class="section-title">Чек-лист дня</div>
    <div class="card">
      <label class="toggle"><input type="checkbox" data-a="set-bool" data-key="checklistShow" ${D.settings.checklistShow !== false ? 'checked' : ''}><span class="grow">Показывать чек-лист на «Моих делах»<small>Отметки сбрасываются сами в 00:00: у нового дня свой чек-лист, история хранится 400 дней</small></span></label>
      <div class="cl-slist mt" id="cl-slist">${items.map((x, i) => `<div class="cl-srow" data-id="${esc(x.id)}">
        <span class="cl-grip" data-clgrip="${esc(x.id)}" title="Перетащить" aria-label="Перетащить">⠿</span>
        <button type="button" class="cl-sname grow" data-a="cl-rename" data-id="${esc(x.id)}" title="Переименовать">${esc(x.name)}</button>
        <button type="button" class="icon-btn cl-mv" data-a="cl-move" data-id="${esc(x.id)}" data-val="-1" ${i === 0 ? 'disabled' : ''} aria-label="Выше" style="transform:rotate(90deg)">${icon('back')}</button>
        <button type="button" class="icon-btn cl-mv" data-a="cl-move" data-id="${esc(x.id)}" data-val="1" ${i === items.length - 1 ? 'disabled' : ''} aria-label="Ниже" style="transform:rotate(-90deg)">${icon('back')}</button>
        <button type="button" class="icon-btn" data-a="cl-del" data-id="${esc(x.id)}" aria-label="Удалить">✕</button>
      </div>`).join('') || '<div class="sub">Пунктов пока нет.</div>'}</div>
      <div class="row mt"><input class="search grow" id="new-cl" placeholder="Новый пункт, например «Разбор почты»"><button class="btn" data-a="cl-add">${icon('plus')}Добавить</button></div>
      <div class="sub mt">Нажмите на пункт, чтобы переименовать; порядок — перетаскиванием за ⠿ или стрелками. Удалённый пункт пропадает из чек-листа, история его отметок сохраняется.</div>
    </div>`;
}

/* Переставить активный пункт на позицию to (среди активных); архивные остаются в конце массива */
function checklistReorder(id, to) {
  const all = D.settings.checklist;
  const act = all.filter((x) => !x.archived), arch = all.filter((x) => x.archived);
  const from = act.findIndex((x) => x.id === id);
  if (from < 0) return;
  const [it] = act.splice(from, 1);
  act.splice(Math.max(0, Math.min(act.length, to)), 0, it);
  D.settings.checklist = act.concat(arch);
  save(); render();
}

Object.assign(ACTIONS, {
  'cl-toggle': (el) => {
    Checklist.toggle(D, el.dataset.id, today(), hm(new Date()));
    if (Checklist.progress(D, today()).all) ui.clShow = false; // отмечено всё — карточка сворачивается в одну строку
    save(); render();
  },
  'cl-show': () => { ui.clShow = true; render(); },
  'cl-hide': () => { ui.clShow = false; render(); },
  'cl-history': (el, ev) => { if (ev) ev.stopPropagation(); modal(checklistHistory()); },
  'cl-settings': (el, ev) => { if (ev && ev.preventDefault) ev.preventDefault(); go('settings'); setTimeout(() => { const s = $('#cl-slist'); if (s) s.scrollIntoView({ block: 'center' }); }, 50); },
  'cl-add': () => {
    const inp = $('#new-cl'), v = ((inp && inp.value) || '').trim();
    if (!v) { toast('Введите название пункта'); return; }
    D.settings.checklist.push({ id: uid('cl'), name: v, archived: false });
    save(); render(); toast('Пункт добавлен');
    setTimeout(() => { const i = $('#new-cl'); if (i) i.focus(); }, 30);
  },
  'cl-rename': (el) => {
    const x = D.settings.checklist.find((i) => i.id === el.dataset.id);
    if (!x) return;
    ui.clEdit = x.id;
    modal(`<h3>Пункт чек-листа</h3><input class="search" id="cl-new-name" value="${esc(x.name)}">
      <div class="form-actions mt"><button class="btn primary" data-a="cl-rename-save">${icon('check')}Сохранить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
    setTimeout(() => { const i = $('#cl-new-name'); if (i) { i.focus(); i.select(); } }, 30);
  },
  'cl-rename-save': () => {
    const x = D.settings.checklist.find((i) => i.id === ui.clEdit), v = (($('#cl-new-name') || {}).value || '').trim();
    if (x && v) x.name = v;
    modal(null); save(); render();
  },
  'cl-move': (el) => {
    const act = Checklist.active(D), i = act.findIndex((x) => x.id === el.dataset.id);
    checklistReorder(el.dataset.id, i + Number(el.dataset.val));
  },
  'cl-del': (el) => {
    const x = D.settings.checklist.find((i) => i.id === el.dataset.id);
    if (!x) return;
    confirmBox(`Убрать «${x.name}» из чек-листа? История отметок сохранится.`, () => { x.archived = true; save(); render(); toast('Пункт убран'); }, 'Убрать');
  },
});

/* Перетаскивание пунктов в настройках за ⠿ (мышь, палец, стилус) */
let clDrag = null;
document.addEventListener('pointerdown', (ev) => {
  const grip = ev.target.closest && ev.target.closest('.cl-grip');
  if (!grip) return;
  const list = grip.closest('.cl-slist'), row = grip.closest('.cl-srow');
  if (!list || !row) return;
  ev.preventDefault();
  clDrag = { list, row, id: grip.dataset.clgrip, y0: ev.clientY, pid: ev.pointerId, target: null };
  try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* */ }
  row.classList.add('cl-dragging');
});
document.addEventListener('pointermove', (ev) => {
  const d = clDrag;
  if (!d || ev.pointerId !== d.pid) return;
  ev.preventDefault();
  d.row.style.transform = `translateY(${ev.clientY - d.y0}px)`;
  const rows = $$('.cl-srow', d.list).filter((r) => r !== d.row);
  let idx = rows.length;
  for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { idx = i; break; } }
  d.target = idx;
  rows.forEach((r, i) => { r.classList.toggle('drop-before', i === idx); r.classList.toggle('drop-after', idx === rows.length && i === rows.length - 1); });
}, { passive: false });
function clEndDrag(ev) {
  const d = clDrag;
  if (!d || (ev && ev.pointerId !== d.pid)) return;
  clDrag = null;
  d.row.classList.remove('cl-dragging');
  d.row.style.transform = '';
  $$('.cl-srow', d.list).forEach((r) => r.classList.remove('drop-before', 'drop-after'));
  if (d.target == null) return;
  const ids = Checklist.active(D).map((x) => x.id);
  if (d.target === ids.indexOf(d.id)) return;
  checklistReorder(d.id, d.target);
}
document.addEventListener('pointerup', clEndDrag);
document.addEventListener('pointercancel', clEndDrag);

/* ---------- Смена даты: в 00:00 чек-лист открывается заново, бейджи пересчитываются ---------- */
function checkDayChange() {
  const t = today();
  if (t === ui.day) return false;
  ui.day = t;
  ui.clShow = false;
  if (Checklist.prune(D, t)) save();
  const editing = ui.stack.some((x) => x.edit);
  if (editing) renderNav(); else render(); // форму в шторке не перерисовываем, чтобы не потерять ввод
  return true;
}
setInterval(checkDayChange, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
window.addEventListener('focus', checkDayChange);
const _clPrevNative = window.__native;
window.__native = function (type, payload) { if (type === 'resume') checkDayChange(); return _clPrevNative.apply(this, arguments); };

/* При запуске: удалить историю старше 400 дней */
if (Checklist.prune(D, today())) save();

/* ---------- Подсказка у бейджа «Мои дела»: долгое нажатие на телефоне ---------- */
let navPress = null;
document.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest && ev.target.closest('#nav [data-a="tab"][data-id="home"]');
  if (!b || !b.dataset.tip) return;
  clearTimeout(navPress && navPress.t);
  navPress = { x: ev.clientX, y: ev.clientY, fired: false, t: setTimeout(() => { navPress.fired = true; toast(b.dataset.tip); }, 550) };
});
document.addEventListener('pointermove', (ev) => { if (navPress && Math.hypot(ev.clientX - navPress.x, ev.clientY - navPress.y) > 10) clearTimeout(navPress.t); });
document.addEventListener('pointerup', () => { if (navPress) clearTimeout(navPress.t); });
document.addEventListener('click', (ev) => {
  if (navPress && navPress.fired && ev.target.closest && ev.target.closest('#nav')) { ev.stopPropagation(); ev.preventDefault(); }
  navPress = null;
}, true);
document.addEventListener('contextmenu', (ev) => { if (ev.target.closest && ev.target.closest('#nav [data-a="tab"][data-id="home"]')) ev.preventDefault(); });

try { if (ui.tab === 'home' || ui.tab === 'settings') render(); else renderNav(); } catch (e) { /* */ }
