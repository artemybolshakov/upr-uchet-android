/* 管理会计 (упр. учёт) — задачи, CRM, календарь, заметки. Все данные хранятся локально на устройстве. */
'use strict';

/* =========================================================
 * 1. Утилиты
 * ======================================================= */
// APP_VERSION, SCHEMA, emptyData, migrate, parseBackup — в schema.js
const N = window.Native || null; // Android-мост (в браузере отсутствует)
// Календарь телефона: в приложении — мост, в веб-версии (доступ с компьютера) — то же самое через API телефона (remote.js)
const CAL = N || window.RemoteCal || null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const clone = (o) => JSON.parse(JSON.stringify(o));

function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function parseDate(s) { if (!s) return null; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
function parseDT(s) { if (!s) return null; const d = parseDate(s); if (s.length > 10) { const [h, mi] = s.slice(11, 16).split(':').map(Number); d.setHours(h || 0, mi || 0, 0, 0); } return d; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function today() { return ymd(new Date()); }
function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_N = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function fmtDate(s, withWd) {
  if (!s) return '';
  const d = parseDate(s);
  const t = today();
  const diff = daysBetween(t, s);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  let r = d.getDate() + ' ' + MONTHS[d.getMonth()];
  if (d.getFullYear() !== new Date().getFullYear()) r += ' ' + d.getFullYear();
  if (withWd) r = WD[d.getDay()] + ', ' + r;
  return r;
}
function fmtShort(s) { if (!s) return ''; const d = parseDate(s); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1); }
function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }

const COLORS = ['#2f5bea', '#e5484d', '#1f9d5a', '#d98a00', '#7c4ddb', '#0e9fb0', '#d6409f', '#5b6475'];
function colorFor(s) { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
function initials(s) { const p = String(s || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); }

/* Иконки (inline SVG) */
const I = {
  map: '<rect x="9" y="2.5" width="6" height="5" rx="1.2"/><rect x="2.5" y="16.5" width="6" height="5" rx="1.2"/><rect x="15.5" y="16.5" width="6" height="5" rx="1.2"/><path d="M12 7.5v4.5M5.5 16.5V12h13v4.5"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12 5 13.5 7.5 11M3.5 18 5 19.5 7.5 17"/>',
  crm: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.6 3.5 5.4"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  notes: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14.5 3v4.5H19M8.5 12h7M8.5 16h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  today: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><circle cx="12" cy="15" r="2"/>',
  backup: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  sub: '<path d="M6 3v12a3 3 0 0 0 3 3h9"/><path d="m15 15 3 3-3 3"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5"/>',
  filter: '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>',
  cols: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="14" rx="1.5"/>',
};
const icon = (n, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n] || ''}</svg>`;

/* =========================================================
 * 2. Данные, миграции, хранение
 * ======================================================= */
/* Формат данных, миграции и резервные копии — в schema.js (проверяется тестом совместимости в CI). */

let D = emptyData();
let saveTimer = null;

function load() {
  let txt = '';
  try { txt = N ? N.load() : (localStorage.getItem('upr-data') || ''); } catch (e) { txt = ''; }
  if (txt) {
    try { D = migrate(JSON.parse(txt)); } catch (e) { D = emptyData(); toast('Не удалось прочитать данные — открыты пустые. Восстановите копию в настройках.'); }
  } else {
    D = emptyData();
  }
}

function save(immediate) {
  clearTimeout(saveTimer);
  const run = () => {
    D.meta.updatedAt = new Date().toISOString();
    D.meta.appVersion = APP_VERSION;
    const txt = JSON.stringify(D);
    try {
      if (N) { if (!N.save(txt)) toast('Ошибка записи данных'); } else localStorage.setItem('upr-data', txt);
    } catch (e) { toast('Ошибка записи данных'); }
    syncAlarms();
  };
  if (immediate) run(); else saveTimer = setTimeout(run, 250);
}

function makeBackup() { return wrapBackup(D); }

function restoreFrom(text, confirmedNewer) {
  const r = parseBackup(text);
  if (!r.ok) { toast(r.error); return false; }
  if (r.newer && !confirmedNewer) {
    confirmBox('Копия сделана в более новой версии приложения (формат v' + r.fileSchema + '). Лучше сначала обновить приложение. Всё равно восстановить? Неизвестные данные сохранятся как есть.', () => restoreFrom(text, true), 'Восстановить');
    return false;
  }
  if (N) try { save(true); N.backupNow(); } catch (e) { /* страховочная копия перед восстановлением */ }
  D = r.data;
  save(true);
  toast('Данные восстановлены');
  render();
  return true;
}

/* Быстрый доступ */
const byId = (arr, id) => arr.find((x) => x.id === id);
const task = (id) => byId(D.tasks, id);
const contact = (id) => byId(D.contacts, id);
const event = (id) => byId(D.events, id);
const note = (id) => byId(D.notes, id);
const project = (id) => (id ? byId(D.projects, id) : null);
const statusName = (id) => (D.settings.statuses.find((s) => s.id === id) || { name: id }).name;
const isDone = (t) => t.status === 'done';

function taskState(t) {
  if (isDone(t)) return 'done';
  if (!t.due) return 'none';
  const d = daysBetween(today(), t.due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  return 'future';
}
function contactOverdue(c) { return c.nextContact && c.nextContact < today(); }

/* ---------- Проекты: связывают задачи; CRM-контакты попадают в проект через задачи ---------- */
function tasksOfProject(pid) { return D.tasks.filter((t) => (pid ? t.projectId === pid : !t.projectId)); }
function contactsOfTasks(tasks) {
  const ids = new Set();
  tasks.forEach((t) => t.crmIds.forEach((id) => ids.add(id)));
  return Array.from(ids).map(contact).filter(Boolean);
}
function projectStats(pid) {
  const all = tasksOfProject(pid);
  const open = all.filter((t) => !isDone(t));
  let cs = contactsOfTasks(open);
  if (!pid) {
    // «Без проекта»: ещё и контакты с датой связи, не привязанные к открытым задачам проектов
    const inProjects = new Set(contactsOfTasks(D.tasks.filter((t) => t.projectId && !isDone(t))).map((c) => c.id));
    const extra = D.contacts.filter((c) => c.nextContact && !inProjects.has(c.id));
    cs = Array.from(new Map(cs.concat(extra).filter((c) => !inProjects.has(c.id)).map((c) => [c.id, c])).values());
  }
  const t = today();
  return {
    total: all.length, done: all.length - open.length,
    todoTasks: open.filter((x) => taskState(x) !== 'overdue'),
    overdueTasks: open.filter((x) => taskState(x) === 'overdue'),
    todoCrm: cs.filter((c) => c.nextContact && c.nextContact >= t),
    overdueCrm: cs.filter((c) => c.nextContact && c.nextContact < t),
    contacts: contactsOfTasks(all),
  };
}
function removeProject(id) {
  D.projects = D.projects.filter((p) => p.id !== id);
  D.tasks.forEach((t) => { if (t.projectId === id) t.projectId = null; });
}
/* Категории проектов (виды деятельности) */
const projectCategory = (p) => (p && p.category ? p.category : '');
function projectCategories() {
  const set = new Set(D.settings.projectCategories || []);
  D.projects.forEach((p) => { if (p.category) set.add(p.category); });
  return Array.from(set);
}
const PROJECT_SORTS = [['attention', 'Сначала требующие внимания'], ['name', 'По названию'], ['progress', 'По прогрессу'], ['tasks', 'По числу открытых задач'], ['new', 'Сначала новые']];
function sortProjects(items, mode) {
  const w = (x) => (x.st.overdueTasks.length + x.st.overdueCrm.length) * 1000 + x.st.todoTasks.length + x.st.todoCrm.length;
  const pct = (x) => (x.st.total ? x.st.done / x.st.total : 0);
  const byName = (a, b) => a.p.name.localeCompare(b.p.name, 'ru');
  const f = {
    attention: (a, b) => w(b) - w(a) || byName(a, b),
    name: byName,
    progress: (a, b) => pct(b) - pct(a) || byName(a, b),
    tasks: (a, b) => (b.st.todoTasks.length + b.st.overdueTasks.length) - (a.st.todoTasks.length + a.st.overdueTasks.length) || byName(a, b),
    new: (a, b) => ((b.p.createdAt || '') < (a.p.createdAt || '') ? -1 : (b.p.createdAt || '') > (a.p.createdAt || '') ? 1 : byName(a, b)),
  }[mode] || byName;
  return items.slice().sort(f);
}
/* Группы карточек проектов по категориям: [{name, items}] в порядке списка категорий */
function groupProjects(items) {
  if (D.settings.projectsGroup === 'none') return [{ name: '', items }];
  const order = projectCategories();
  const groups = order.map((c) => ({ name: c, items: items.filter((x) => projectCategory(x.p) === c) })).filter((g) => g.items.length);
  const rest = items.filter((x) => !projectCategory(x.p));
  if (rest.length) groups.push({ name: groups.length ? 'Без категории' : '', items: rest });
  return groups;
}
function projectToolbar() {
  const s = D.settings;
  return `<div class="row" style="margin-bottom:12px;gap:8px">
    <div class="seg">${[['category', 'По категориям'], ['none', 'Все вместе']].map(([k, n]) => `<button class="${s.projectsGroup === k ? 'on' : ''}" data-a="set" data-key="projectsGroup" data-val="${k}">${n}</button>`).join('')}</div>
    <div class="ptools-sel"><select class="tf" data-setting="projectsSort" aria-label="Сортировка">${PROJECT_SORTS.map(([k, n]) => `<option value="${k}" ${s.projectsSort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    ${projectCategories().length ? `<select class="tf ${ui.projCat ? 'on' : ''}" data-change="projCat" aria-label="Категория"><option value="">Категория: все</option>${projectCategories().map((c) => `<option ${ui.projCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="—" ${ui.projCat === '—' ? 'selected' : ''}>Без категории</option></select>` : ''}</div>
  </div>`;
}
function projectGrid(items, opts) {
  return groupProjects(items).map((g) => `${g.name ? `<div class="section-title pcat-title">${esc(g.name)} <span class="muted small">${g.items.length}</span></div>` : ''}<div class="pgrid">${g.items.map((x) => projectCard(x.p, x.st, opts)).join('')}</div>`).join('');
}

function projectChip(pid) {
  const p = project(pid);
  return p ? `<span class="chip"><i class="dot" style="background:${esc(p.color || colorFor(p.name))}"></i>${esc(p.name)}</span>` : '';
}

/* ---------- Дни рождения контактов (показываются в календаре как события) ---------- */
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
function birthdayOn(c, day) {
  if (!c.birthday || c.birthday.length < 10) return false;
  const md = c.birthday.slice(5, 10), dmd = day.slice(5, 10);
  if (md === dmd) return true;
  return md === '02-29' && dmd === '02-28' && !isLeap(Number(day.slice(0, 4)));
}
function birthdaysOn(day) { return D.contacts.filter((c) => birthdayOn(c, day)); }
function ageOn(c, day) {
  const y = Number(c.birthday.slice(0, 4));
  return y > 1900 ? Number(day.slice(0, 4)) - y : null;
}
function nextBirthday(c, from) {
  if (!c.birthday || c.birthday.length < 10) return null;
  const base = parseDate(from || today());
  for (let i = 0; i < 367; i++) { const d = ymd(addDays(base, i)); if (birthdayOn(c, d)) return d; }
  return null;
}
function upcomingBirthdays(days) {
  const t = today();
  return D.contacts.map((c) => ({ c, d: nextBirthday(c, t) })).filter((x) => x.d && daysBetween(t, x.d) <= days)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.c.name.localeCompare(b.c.name, 'ru')));
}
function birthdayItem(c, day) {
  const age = ageOn(c, day);
  const diff = daysBetween(today(), day);
  const when = diff === 0 ? 'сегодня' : diff === 1 ? 'завтра' : fmtDate(day, true);
  return `<div class="item" data-a="open" data-type="contact" data-id="${c.id}">
    <div class="ev-time">${icon('gift')}</div><div class="ev-bar bd"></div>
    <div class="grow"><div class="t">День рождения: ${esc(c.name)}</div>
    <div class="s"><span class="chip ${diff === 0 ? 'green' : diff === 1 ? 'amber' : 'blue'}">${esc(when)}</span>${age ? `<span>исполняется ${age}</span>` : ''}${c.company ? `<span>${esc(c.company)}</span>` : ''}</div></div>
  </div>`;
}

/* ---------- «Связаться»: сегодня — зелёный, завтра — жёлтый, позже — синий с датой, просрочено — красный ---------- */
function contactDueChip(c, long) {
  if (!c.nextContact) return '';
  const d = daysBetween(today(), c.nextContact);
  if (d < 0) return `<span class="chip red">${icon('phone')}${long ? 'просрочено с ' : ''}${esc(fmtShort(c.nextContact))}</span>`;
  if (d === 0) return `<span class="chip green">${icon('phone')}сегодня</span>`;
  if (d === 1) return `<span class="chip amber">${icon('phone')}завтра</span>`;
  return `<span class="chip blue">${icon('phone')}${esc(long ? fmtDate(c.nextContact, true) : fmtShort(c.nextContact))}</span>`;
}
function eventsOn(day) { return D.events.filter((e) => e.start && e.start.slice(0, 10) <= day && (e.end || e.start).slice(0, 10) >= day); }
function tasksOfContact(cid) { return D.tasks.filter((t) => t.crmIds.includes(cid)); }
function eventsOfContact(cid) { return D.events.filter((e) => e.crmIds.includes(cid)); }
function notesOfContact(cid) { return D.notes.filter((n) => n.crmIds.includes(cid)); }
function tasksOfEvent(eid) { return D.tasks.filter((t) => t.eventIds.includes(eid)); }
function subtasks(id) { return D.tasks.filter((t) => t.parentId === id); }
function sortByDue(a, b) {
  const da = a.due || '9999', db = b.due || '9999';
  if (da !== db) return da < db ? -1 : 1;
  return (a.title || '').localeCompare(b.title || '', 'ru');
}

/* Удаление с чисткой связей */
function removeTask(id) {
  D.tasks = D.tasks.filter((t) => t.id !== id);
  D.tasks.forEach((t) => { if (t.parentId === id) t.parentId = null; t.deps = t.deps.filter((x) => x !== id); });
}
function removeContact(id) {
  D.contacts = D.contacts.filter((c) => c.id !== id);
  [...D.tasks, ...D.events, ...D.notes].forEach((x) => { x.crmIds = (x.crmIds || []).filter((y) => y !== id); });
}
function removeEvent(id) {
  const e = event(id);
  if (e && e.deviceId && CAL && e.syncDevice) try { CAL.deleteDeviceEvent(e.deviceId); } catch (er) { /* */ }
  D.events = D.events.filter((x) => x.id !== id);
  D.tasks.forEach((t) => { t.eventIds = t.eventIds.filter((y) => y !== id); });
}

/* =========================================================
 * 3. Напоминания (будильники)
 * ======================================================= */
function buildAlarms() {
  const now = Date.now();
  const horizon = now + 45 * 86400000;
  const list = [];
  for (const e of D.events) {
    const st = parseDT(e.start);
    if (!st) continue;
    let base = st.getTime();
    if (e.allDay) { const d = parseDate(e.start); d.setHours(9, 0, 0, 0); base = d.getTime(); }
    const mins = e.important ? (e.remind && e.remind.length ? e.remind : D.settings.importantRemind) : (e.remind || []);
    for (const m of mins) {
      const at = base - m * 60000;
      if (at <= now || at > horizon) continue;
      const crm = e.crmIds.map((id) => (contact(id) || {}).name).filter(Boolean).join(', ');
      list.push({
        key: 'ev-' + e.id + '-' + m,
        at,
        title: e.title,
        text: (m === 0 ? 'Сейчас' : 'Через ' + humanMins(m)) + (e.allDay ? '' : ' · ' + hm(st)) + (crm ? ' · ' + crm : '') + (e.location ? ' · ' + e.location : ''),
        aggressive: !!e.important,
        ref: 'event:' + e.id,
      });
    }
  }
  for (const t of D.tasks) {
    if (isDone(t) || !t.remindAt) continue;
    const at = parseDT(t.remindAt).getTime();
    if (at <= now || at > horizon) continue;
    list.push({ key: 'task-' + t.id, at, title: t.title, text: 'Задача' + (t.due ? ' · срок ' + fmtDate(t.due) : ''), aggressive: !!t.important, ref: 'task:' + t.id });
  }
  for (const c of D.contacts) {
    if (!c.nextContact || !c.remind) continue;
    const d = parseDate(c.nextContact);
    const [h, mi] = (D.settings.taskRemindTime || '10:00').split(':').map(Number);
    d.setHours(h, mi, 0, 0);
    if (d.getTime() <= now || d.getTime() > horizon) continue;
    list.push({ key: 'crm-' + c.id, at: d.getTime(), title: 'Связаться: ' + c.name, text: c.company || 'CRM', aggressive: false, ref: 'contact:' + c.id });
  }
  if (D.settings.birthdayRemind) {
    const [h, mi] = (D.settings.taskRemindTime || '10:00').split(':').map(Number);
    for (const c of D.contacts) {
      const day = nextBirthday(c, today());
      if (!day) continue;
      const age = ageOn(c, day);
      [[0, 'Сегодня день рождения'], [1, 'Завтра день рождения']].forEach(([before, label]) => {
        const d = addDays(parseDate(day), -before);
        d.setHours(h, mi, 0, 0);
        if (d.getTime() <= now || d.getTime() > horizon) return;
        list.push({ key: 'bd-' + c.id + '-' + day + '-' + before, at: d.getTime(), title: label + ': ' + c.name, text: (age ? 'Исполняется ' + age : 'День рождения') + (c.company ? ' · ' + c.company : ''), aggressive: false, ref: 'contact:' + c.id });
      });
    }
  }
  return list.sort((a, b) => a.at - b.at).slice(0, 400);
}
function humanMins(m) {
  if (m % 1440 === 0) { const d = m / 1440; return d + ' ' + plural(d, 'день', 'дня', 'дней'); }
  if (m % 60 === 0) { const h = m / 60; return h + ' ' + plural(h, 'час', 'часа', 'часов'); }
  return m + ' мин';
}
let alarmTimer = null;
function syncAlarms() {
  clearTimeout(alarmTimer);
  alarmTimer = setTimeout(() => { if (N) try { N.setAlarms(JSON.stringify(buildAlarms())); } catch (e) { /* */ } }, 400);
}

/* =========================================================
 * 4. Состояние интерфейса, навигация, оболочка
 * ======================================================= */
const ui = {
  tab: 'home',
  stack: [],            // стек открытых карточек в шторке: [{type, id, edit, preset}]
  homeFilter: null,     // 'overdueTasks' | 'todayTasks' | 'overdueCrm' | 'todayCrmEvents'
  crmQuery: '',
  crmFilter: 'all',
  crmType: '',
  crmStatus: '',
  notesContact: 'all',
  notesQuery: '',
  taskQuery: '',
  tfProject: '', tfCrm: '', tfPerson: '', tfStatus: '', tfDue: '', // фильтры задач
  projArchived: false,
  projCat: '',
  showDone: false,
  cal: { month: today().slice(0, 7), sel: today() },
  devEvents: [],
  devCals: [],
  highlight: null,
};

const TABS = [
  { id: 'home', name: 'Мои дела', icon: 'home' },
  { id: 'calendar', name: 'Календарь', icon: 'cal' },
  { id: 'projects', name: 'Проекты', icon: 'folder' },
  { id: 'map', name: 'Карта', icon: 'map' },
  { id: 'tasks', name: 'Задачи', icon: 'tasks' },
  { id: 'crm', name: 'CRM', icon: 'crm' },
  { id: 'notes', name: 'Заметки', icon: 'notes' },
];

function counts() {
  const t = today();
  return {
    overdueCrm: D.contacts.filter(contactOverdue).length,
    overdueTasks: D.tasks.filter((x) => taskState(x) === 'overdue').length,
    todayTasks: D.tasks.filter((x) => !isDone(x) && x.due === t).length,
    todayCrmEvents: eventsOn(t).filter((e) => e.crmIds.length).length + D.contacts.filter((c) => c.nextContact === t).length,
  };
}

function renderNav() {
  const c = counts();
  const badge = { home: c.overdueTasks + c.overdueCrm, crm: c.overdueCrm, tasks: c.overdueTasks };
  const btn = (t) => `<button data-a="tab" data-id="${t.id}" class="${ui.tab === t.id ? 'active' : ''}">${icon(t.icon)}<span>${t.name}</span>${badge[t.id] && t.id !== 'home' ? `<b class="badge">${badge[t.id]}</b>` : ''}</button>`;
  $('#nav').innerHTML = `
    <div class="brand"><i></i>管理会计</div>
    <div class="nav-items">${TABS.map(btn).join('')}</div>
    <div class="nav-foot">
      <button data-a="tab" data-id="summary" class="only-wide ${ui.tab === 'summary' ? 'active' : ''}">${icon('share')}<span>Сводка</span></button>
      <button data-a="tab" data-id="settings" class="only-wide ${ui.tab === 'settings' ? 'active' : ''}">${icon('settings')}<span>Настройки</span></button>
    </div>`;
}

function render() {
  renderNav();
  const fn = SCREENS[ui.tab] || SCREENS.home;
  const main = $('#main');
  const st = main.scrollTop;
  main.innerHTML = fn();
  main.scrollTop = st;
  renderSheet();
  afterRender();
}

function afterRender() {
  const tg = $('#tg-scroll');
  if (tg) {
    const key = calView() + ':' + calTitle();
    tg.scrollTop = ui.tgKey === key ? ui.tgY : Number(tg.dataset.y) || 0;
    ui.tgKey = key; ui.tgY = tg.scrollTop;
    tg.addEventListener('scroll', () => { ui.tgY = tg.scrollTop; }, { passive: true });
  }
  if (ui.tab === 'tasks' && D.settings.tasksView === 'links') drawLinks();
  if (ui.tab === 'tasks' && D.settings.tasksView === 'gantt') scrollGanttToToday();
}

function go(tab) {
  ui.tab = tab;
  ui.homeFilter = null;
  ui.stack = [];
  $('#main').scrollTop = 0;
  if (tab === 'calendar') loadDeviceEvents();
  render();
}

/* ---------- Шторка (карточки и формы) ---------- */
function openSheet(type, id, opts) {
  const entry = Object.assign({ type, id }, opts || {});
  const wide = window.innerWidth >= 980;
  // На широком экране шторка — постоянная правая панель: новая карточка заменяет текущую.
  if (wide && !entry.edit) ui.stack = [entry]; else ui.stack.push(entry);
  renderSheet();
}
function closeSheet() { const t = ui.stack.pop(); if (t && (t.edit || t.draft)) clearDraft(); renderSheet(); if (!ui.stack.length) render(); }
function closeAll() { ui.stack = []; clearDraft(); render(); }

/* Черновик открытой формы: при любой перерисовке (поворот экрана, смена режима Mate XT, синхронизация)
   несохранённый ввод не теряется. Черновик живёт в записи стека и в sessionStorage. */
function captureForm(form) {
  const fields = [];
  Array.from(form.elements).forEach((x) => {
    if (!x.name) return;
    if (x.type === 'checkbox' || x.type === 'radio') fields.push([x.name, x.value, x.checked]);
    else fields.push([x.name, null, x.value]);
  });
  const rte = {};
  $$('[data-rte]', form).forEach((x) => { rte[x.dataset.rte] = x.innerHTML; });
  return { fields, rte };
}
function applyDraft(form, d) {
  if (!d) return;
  const els = Array.from(form.elements);
  const used = new Set();
  d.fields.forEach(([name, value, v]) => {
    const el = els.find((x) => !used.has(x) && x.name === name && (value === null || x.value === value));
    if (!el) return;
    used.add(el);
    if (value === null) el.value = v; else el.checked = v;
  });
  Object.entries(d.rte || {}).forEach(([k, html]) => { const x = $(`[data-rte="${k}"]`, form); if (x) x.innerHTML = html; });
  $$('.msel', form).forEach(mselRefresh);
}
function sheetKey(top) { return top ? [top.type, top.id || 'new', top.edit ? 'edit' : 'view'].join(':') : ''; }
function storeDraft() {
  const top = ui.stack[ui.stack.length - 1];
  const form = $('#sheet form[data-form]');
  if (!top || !form) return;
  top.draft = captureForm(form);
  try { localStorage.setItem('upr-draft', JSON.stringify({ key: sheetKey(top), type: top.type, id: top.id || null, preset: top.preset || null, draft: top.draft, at: Date.now() })); } catch (e) { /* */ }
}
function clearDraft() { try { localStorage.removeItem('upr-draft'); } catch (e) { /* */ } }
// Если приложение было выгружено системой с открытой формой — возвращаем черновик (не старше суток)
function restoreDraftAfterRestart() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem('upr-draft') || 'null'); } catch (e) { d = null; }
  if (!d || !d.draft || Date.now() - (d.at || 0) > 86400000 || !SHEETS[d.type + 'Form']) { clearDraft(); return; }
  const coll = { task: 'tasks', contact: 'contacts', event: 'events', note: 'notes', project: 'projects' }[d.type];
  if (d.id && (!coll || !byId(D[coll] || [], d.id))) { clearDraft(); return; }
  ui.stack.push({ type: d.type, id: d.id || null, edit: true, preset: d.preset || {}, draft: d.draft });
  renderSheet();
  toast('Восстановлен несохранённый черновик');
}

function renderSheet() {
  const el = $('#sheet');
  const top = ui.stack[ui.stack.length - 1];
  $('#app').classList.toggle('with-sheet', !!top);
  if (!top) { el.hidden = true; el.innerHTML = ''; el.dataset.key = ''; return; }
  // Та же карточка перерисовывается — сохраняем ввод и прокрутку
  const key = sheetKey(top);
  const same = el.dataset.key === key && !el.hidden;
  const oldForm = $('form[data-form]', el);
  if (same && oldForm) top.draft = captureForm(oldForm);
  const scroll = same ? el.scrollTop : 0;
  el.hidden = false;
  const fn = SHEETS[top.type + (top.edit ? 'Form' : '')];
  el.innerHTML = fn ? fn(top) : '';
  el.dataset.key = key;
  const form = $('form[data-form]', el);
  if (form && top.draft) applyDraft(form, top.draft);
  if (form) initEditors(form);
  el.scrollTop = scroll;
}

function sheetHead(title, extra) {
  const canBack = ui.stack.length > 1;
  return `<div class="head">
    <button class="icon-btn" data-a="sheet-back" aria-label="Назад">${icon(canBack ? 'back' : 'close')}</button>
    <h2>${title}</h2>${extra || ''}
  </div>`;
}

/* ---------- Модальное окно и уведомления ---------- */
function modal(html) {
  const m = $('#modal');
  if (!html) { m.hidden = true; m.innerHTML = ''; return; }
  m.innerHTML = `<div class="modal-box">${html}</div>`;
  m.hidden = false;
}
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
function confirmBox(text, onYes, yesLabel) {
  ui.onConfirm = onYes;
  modal(`<h3>${esc(text)}</h3><div class="form-actions"><button class="btn danger" data-a="confirm-yes">${esc(yesLabel || 'Удалить')}</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
}

/* Аппаратная кнопка «Назад» Android */
window.__back = function () {
  if (!$('#modal').hidden) { modal(null); return true; }
  if (ui.stack.length) { closeSheet(); return true; }
  if (ui.homeFilter) { ui.homeFilter = null; render(); return true; }
  if (ui.tab !== 'home') { go('home'); return true; }
  return false;
};

/* События из нативной части */
window.__native = function (type, payload) {
  if (type === 'open' && payload) {
    const [kind, id] = payload.split(':');
    const map = { event: 'events', task: 'tasks', contact: 'contacts', project: 'projects' };
    if (map[kind] && byId(D[map[kind]], id)) openSheet(kind, id);
  } else if (type === 'imported') {
    if (payload) confirmBox('Заменить текущие данные данными из файла? Текущие данные будут сохранены в автокопию.', () => restoreFrom(payload), 'Восстановить');
    else toast('Файл не выбран');
  } else if (type === 'folderBackup') {
    if (payload === 'ok') toast('Папка выбрана, первая копия сохранена');
    else if (payload === 'fail') toast('Не удалось сохранить в эту папку — выберите другую');
    if (ui.tab === 'settings') render();
  } else if (type === 'exported') {
    const csv = ui.exportKind === 'csv';
    ui.exportKind = null;
    toast(payload === 'ok' ? (csv ? 'Файл CSV сохранён' : 'Резервная копия сохранена') : (csv ? 'Файл CSV не сохранён' : 'Копия не сохранена'));
  } else if (type === 'permissions' || type === 'resume') {
    if (ui.tab === 'settings') render();
    if (ui.tab === 'calendar') loadDeviceEvents(true);
    if (type === 'resume') renderNav();
  } else if (type === 'screen') {
    // Смена режима экрана Mate XT: перерисовываем, состояние в памяти сохраняется.
    render();
  }
};

let lastW = window.innerWidth;
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const cross = (a, b, x) => (a < x) !== (b < x);
  if (cross(lastW, w, 600) || cross(lastW, w, 980)) render(); else afterRender();
  lastW = w;
});

/* =========================================================
 * 5. Элементы списков
 * ======================================================= */
function dueChip(t) {
  if (!t.due) return '';
  const s = taskState(t);
  const cls = s === 'overdue' ? 'red' : s === 'today' ? 'amber' : s === 'done' ? 'green' : '';
  return `<span class="chip ${cls}">${icon('clock')}${esc(fmtDate(t.due))}${t.dueTime ? ' ' + esc(t.dueTime) : ''}</span>`;
}
function crmChips(ids, max) {
  const arr = ids.map(contact).filter(Boolean);
  const shown = arr.slice(0, max || 2).map((c) => `<span class="chip violet">${icon('user')}${esc(c.name)}</span>`).join('');
  return shown + (arr.length > (max || 2) ? `<span class="chip">+${arr.length - (max || 2)}</span>` : '');
}
function personChip(p) { return p ? `<span class="chip"><i class="dot" style="background:${colorFor(p)}"></i>${esc(p)}</span>` : ''; }

function taskItem(t) {
  const subs = subtasks(t.id);
  const parent = t.parentId && task(t.parentId);
  return `<div class="item ${isDone(t) ? 'done' : ''}" data-a="open" data-type="task" data-id="${t.id}">
    <button class="check ${isDone(t) ? 'on' : ''}" data-a="toggle-task" data-id="${t.id}" aria-label="Готово">${isDone(t) ? icon('check') : ''}</button>
    <div class="grow">
      <div class="t">${t.important ? '<span style="color:var(--danger)">●</span> ' : ''}${esc(t.title)}</div>
      <div class="s">${dueChip(t)}${personChip(t.assignee)}${ui.tab !== 'projects' && !(ui.stack.length && ui.stack[ui.stack.length - 1].type === 'project') ? projectChip(t.projectId) : ''}${crmChips(t.crmIds)}${parent ? `<span class="chip">${icon('sub')}${esc(parent.title)}</span>` : ''}${subs.length ? `<span class="chip">${subs.filter(isDone).length}/${subs.length} подзадач</span>` : ''}</div>
    </div>
  </div>`;
}
// Фото контакта (ссылка из Битрикс24) или инициалы, если фото нет / не загрузилось
function avatar(c, size) {
  const st = size ? `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px;` : '';
  const ini = esc(initials(c.name));
  if (c.photo && /^https?:\/\//.test(c.photo)) {
    return `<div class="avatar" style="${st}background:${colorFor(c.name)}"><img src="${esc(c.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"><span>${ini}</span></div>`;
  }
  return `<div class="avatar" style="${st}background:${colorFor(c.name)}"><span>${ini}</span></div>`;
}
// Поле «Контакты»: телефоны — ссылкой на звонок, @ник — на Telegram, ссылки — кликабельны
function contactsHtml(text) {
  return String(text || '').split(/(,\s*|\n)/).map((part) => {
    const x = part.trim();
    if (!x || /^,/.test(part)) return esc(part);
    if (/^https?:\/\/\S+$/.test(x)) return `<a href="${esc(x)}" target="_blank" rel="noopener">${esc(x)}</a>`;
    if (/^@[A-Za-z0-9_]{3,}$/.test(x)) return `<a href="https://t.me/${esc(x.slice(1))}" target="_blank" rel="noopener">${esc(x)}</a>`;
    const digits = x.replace(/[^\d+]/g, '');
    if (/^[+\d][\d\s()\-]{6,}$/.test(x) && digits.replace('+', '').length >= 10) return `<a href="tel:${esc(/^\+/.test(digits) ? digits : (digits.length === 11 ? '+' + digits : digits))}">${esc(x)}</a>`;
    return esc(part);
  }).join('');
}
function statusChips(c, max) {
  const st = (c.statuses || []).map((x) => `<span class="chip ${/работаем|поиск денег/i.test(x) ? 'green' : /архив/i.test(x) ? '' : /освежить/i.test(x) ? 'amber' : 'blue'}">${esc(x)}</span>`);
  const ty = (c.types || []).map((x) => `<span class="chip violet">${esc(x)}</span>`);
  const all = st.concat(ty);
  return all.slice(0, max || 99).join('') + (max && all.length > max ? `<span class="chip">+${all.length - max}</span>` : '');
}
// Выпадающий список с множественным выбором (для типа и статуса контакта)
function multiSelect(name, options, selected, placeholder) {
  const sel = new Set(selected || []);
  const opts = options.concat((selected || []).filter((x) => !options.includes(x)));
  return `<div class="msel" data-msel="${name}">
    <button type="button" class="msel-btn" data-a="msel-toggle">${sel.size ? Array.from(sel).map((x) => `<span class="chip blue">${esc(x)}</span>`).join('') : `<span class="sub">${esc(placeholder || 'Не выбрано')}</span>`}<span class="msel-caret">▾</span></button>
    <div class="msel-pop" hidden>
      ${opts.map((o) => `<label class="msel-opt"><input type="checkbox" name="${name}" value="${esc(o)}" ${sel.has(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}
      <div class="msel-add"><input type="text" placeholder="Новый вариант" data-msel-new><button type="button" class="btn sm" data-a="msel-add">Добавить</button></div>
    </div>
  </div>`;
}
function mselRefresh(box) {
  const vals = $$('input[type=checkbox]:checked', box).map((x) => x.value);
  const btn = $('.msel-btn', box);
  btn.innerHTML = (vals.length ? vals.map((x) => `<span class="chip blue">${esc(x)}</span>`).join('') : '<span class="sub">Не выбрано</span>') + '<span class="msel-caret">▾</span>';
}

function contactItem(c) {
  const open = tasksOfContact(c.id).filter((t) => !isDone(t)).length;
  return `<div class="item" data-a="open" data-type="contact" data-id="${c.id}">
    ${avatar(c)}
    <div class="grow">
      <div class="t">${esc(c.name)}</div>
      <div class="s">${contactDueChip(c)}${c.company ? `<span>${esc(c.company)}</span>` : ''}${statusChips({ statuses: c.statuses }, 2)}${open ? `<span class="chip blue">${open} ${plural(open, 'задача', 'задачи', 'задач')}</span>` : ''}</div>
    </div>
  </div>`;
}
function eventItem(e, showDate) {
  const st = parseDT(e.start);
  return `<div class="item" data-a="open" data-type="event" data-id="${e.id}">
    <div class="ev-time">${showDate ? esc(fmtShort(e.start)) + '<br>' : ''}${e.allDay ? 'весь день' : esc(hm(st))}</div>
    <div class="ev-bar ${e.important ? 'imp' : ''}"></div>
    <div class="grow">
      <div class="t">${esc(e.title)}</div>
      <div class="s">${e.important ? `<span class="chip red">${icon('alarm')}важное</span>` : ''}${crmChips(e.crmIds)}${tasksOfEvent(e.id).length ? `<span class="chip blue">${icon('tasks')}${tasksOfEvent(e.id).length}</span>` : ''}${e.location ? `<span>${esc(e.location)}</span>` : ''}</div>
    </div>
  </div>`;
}
function devEventItem(e) {
  const st = new Date(e.begin);
  return `<div class="item" data-a="dev-event" data-id="${e.eventId}" data-begin="${e.begin}">
    <div class="ev-time">${e.allDay ? 'весь день' : esc(hm(st))}</div>
    <div class="ev-bar dev"></div>
    <div class="grow"><div class="t">${esc(e.title || '(без названия)')}</div><div class="s"><span class="chip">${icon('cal')}${esc(e.calendar || 'Системный календарь')}</span>${e.location ? `<span>${esc(e.location)}</span>` : ''}</div></div>
  </div>`;
}
function noteItem(n) {
  const first = (n.body || '').split('\n').find((l) => l.trim()) || '';
  return `<div class="item ${n.discussed ? 'done' : ''}" data-a="open" data-type="note" data-id="${n.id}">
    <div class="grow">
      <div class="t">${esc(n.title || first.slice(0, 60) || 'Заметка')}</div>
      <div class="s">${crmChips(n.crmIds, 3)}${n.discussed ? '<span class="chip green">обсуждено</span>' : ''}${n.title && first ? `<span class="ellipsis" style="max-width:100%">${esc(first.slice(0, 90))}</span>` : ''}</div>
    </div>
  </div>`;
}
// Строка поиска с крестиком «очистить»
function searchBox(key, placeholder, value, cls) {
  return `<div class="search-wrap ${cls || ''}"><input class="search" placeholder="${esc(placeholder)}" data-input="${key}" value="${esc(value || '')}">${value ? `<button type="button" class="search-x" data-a="clear-input" data-id="${key}" aria-label="Очистить">${icon('close')}</button>` : ''}</div>`;
}
const listOf = (items, fn, emptyText) => items.length ? `<div class="list">${items.map(fn).join('')}</div>` : `<div class="list"><div class="empty">${emptyText}</div></div>`;

/* =========================================================
 * 6. Экраны
 * ======================================================= */
const SCREENS = {};

/* ---------- Главная ---------- */
SCREENS.home = function () {
  const c = counts();
  const t = today();
  const d = new Date();
  const stat = (key, cls, ic, n, label) => `<button class="stat ${cls}" data-a="home-filter" data-id="${key}" style="${ui.homeFilter === key ? 'outline:2px solid var(--accent)' : ''}">
      <span class="ic">${icon(ic)}</span><span class="n">${n}</span><span class="l">${label}</span></button>`;
  let body = '';
  if (ui.homeFilter) {
    const titles = { overdueCrm: 'Просроченные карточки CRM', overdueTasks: 'Просроченные задачи', todayTasks: 'Задачи на сегодня', todayCrmEvents: 'События CRM на сегодня' };
    let content = '';
    if (ui.homeFilter === 'overdueCrm') content = listOf(D.contacts.filter(contactOverdue).sort((a, b) => a.nextContact < b.nextContact ? -1 : 1), contactItem, 'Нет просроченных карточек');
    if (ui.homeFilter === 'overdueTasks') content = listOf(D.tasks.filter((x) => taskState(x) === 'overdue').sort(sortByDue), taskItem, 'Нет просроченных задач');
    if (ui.homeFilter === 'todayTasks') content = listOf(D.tasks.filter((x) => !isDone(x) && x.due === t).sort(sortByDue), taskItem, 'На сегодня задач нет');
    if (ui.homeFilter === 'todayCrmEvents') {
      const evs = eventsOn(t).filter((e) => e.crmIds.length).sort((a, b) => a.start < b.start ? -1 : 1);
      const cs = D.contacts.filter((x) => x.nextContact === t);
      content = (evs.length || !cs.length ? listOf(evs, (e) => eventItem(e), 'Сегодня встреч с контактами нет') : '') + (cs.length ? `<div class="section-title">Связаться сегодня</div>` + listOf(cs, contactItem, '') : '');
    }
    body = `<div class="section-title">${titles[ui.homeFilter]}<button class="btn sm right" data-a="home-filter" data-id="">Скрыть</button></div>${content}`;
  } else {
    body = projectDashboard();
  }
  return `<div class="head">
      <div class="grow"><h1>Мои дела</h1><div class="sub">${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</div></div>
      <button class="btn" data-a="quick-summary" title="Скопировать сводку">${icon('copy')}<span class="only-wide-inline">Сводка</span></button>
      <button class="icon-btn only-narrow" data-a="tab" data-id="summary" aria-label="Сводка">${icon('share')}</button>
      <button class="icon-btn only-narrow" data-a="tab" data-id="settings" aria-label="Настройки">${icon('settings')}</button>
    </div>
    <div class="stats">
      ${stat('todayTasks', 'blue', 'tasks', c.todayTasks, 'Задачи на сегодня')}
      ${stat('todayCrmEvents', 'violet', 'today', c.todayCrmEvents, 'События CRM на сегодня')}
      ${stat('overdueTasks', 'amber', 'warn', c.overdueTasks, 'Просроченные задачи')}
      ${stat('overdueCrm', 'red', 'crm', c.overdueCrm, 'Просроченные CRM')}
    </div>
    ${body}
    <button class="fab" data-a="new-menu" aria-label="Создать">${icon('plus')}</button>`;
};

/* Дашборд проектов: крупные блоки с двумя категориями внимания */
function projectCard(p, st, opts) {
  const o = opts || {};
  const color = p ? (p.color || colorFor(p.name)) : 'var(--muted)';
  const n = (arr) => arr.length;
  const cat = (cls, label, tasks, crm) => {
    const hot = tasks + crm > 0;
    return `<div class="pc-cat ${cls} ${hot ? 'hot' : ''}"><span class="l">${label}</span>
      <span class="v"><b>${tasks}</b> ${plural(tasks, 'задача', 'задачи', 'задач')} · <b>${crm}</b> crm</span></div>`;
  };
  const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
  const attrs = p ? `data-a="open" data-type="project" data-id="${p.id}"` : `data-a="tasks-filter" data-id="none"`;
  return `<div class="pcard ${p && p.archived ? 'archived' : ''}" style="--pc:${esc(color)}" ${attrs}>
    <div class="pc-h"><span class="pc-name">${esc(p ? p.name : 'Без проекта')}</span>${p && p.category && D.settings.projectsGroup === 'none' ? `<span class="chip">${esc(p.category)}</span>` : ''}${p && p.archived ? '<span class="chip">архив</span>' : ''}</div>
    ${p && p.desc && o.desc ? `<div class="sub ellipsis">${esc(p.desc)}</div>` : ''}
    <div class="pc-cats">
      ${cat('todo', 'К выполнению', n(st.todoTasks), n(st.todoCrm))}
      ${cat('od', 'Просрочено', n(st.overdueTasks), n(st.overdueCrm))}
    </div>
    ${st.total ? `<div class="pc-prog"><i style="width:${pct}%"></i></div><div class="sub small">${st.done} из ${st.total} ${plural(st.total, 'задачи', 'задач', 'задач')} выполнено</div>` : '<div class="sub small">Задач пока нет</div>'}
  </div>`;
}
function projectDashboard() {
  const items = sortProjects(D.projects.filter((p) => !p.archived).map((p) => ({ p, st: projectStats(p.id) })), D.settings.projectsSort);
  const none = projectStats(null);
  const showNone = none.todoTasks.length + none.overdueTasks.length + none.todoCrm.length + none.overdueCrm.length > 0;
  const cards = projectGrid(items) + (showNone ? `${D.settings.projectsGroup !== 'none' && items.length ? '<div class="section-title pcat-title">Вне проектов</div>' : ''}<div class="pgrid">${projectCard(null, none)}</div>` : '');
  return `<div class="section-title">Проекты<button class="btn sm right" data-a="new" data-type="project">${icon('plus')}Проект</button></div>
    ${cards ? `<div class="pgroups">${cards}</div>` : `<div class="list"><div class="empty">Проектов пока нет. Проект объединяет задачи — а через задачи и CRM-контакты. <br><button class="btn primary mt" data-a="new" data-type="project">${icon('plus')}Создать проект</button></div></div>`}`;
}

/* ---------- Задачи ---------- */
function visibleTasks() {
  const q = ui.taskQuery.trim().toLowerCase();
  const t0 = today();
  const showDone = ui.showDone || ui.tfStatus === 'done';
  return D.tasks.filter((t) => {
    if (!showDone && isDone(t)) return false;
    if (q && !(t.title + ' ' + (t.desc || '') + ' ' + (t.assignee || '') + ' ' + ((project(t.projectId) || {}).name || '')).toLowerCase().includes(q)) return false;
    if (ui.tfProject === 'none' ? !!t.projectId : ui.tfProject && t.projectId !== ui.tfProject) return false;
    if (ui.tfCrm === 'none' ? t.crmIds.length > 0 : ui.tfCrm && !t.crmIds.includes(ui.tfCrm)) return false;
    if (ui.tfPerson === '—' ? !!t.assignee : ui.tfPerson && t.assignee !== ui.tfPerson) return false;
    if (ui.tfStatus && t.status !== ui.tfStatus) return false;
    if (ui.tfDue) {
      const d = t.due ? daysBetween(t0, t.due) : null;
      if (ui.tfDue === 'overdue' && !(d !== null && d < 0 && !isDone(t))) return false;
      if (ui.tfDue === 'today' && d !== 0) return false;
      if (ui.tfDue === 'tomorrow' && d !== 1) return false;
      if (ui.tfDue === 'week' && !(d !== null && d >= 0 && d <= 7)) return false;
      if (ui.tfDue === 'later' && !(d !== null && d > 7)) return false;
      if (ui.tfDue === 'nodue' && d !== null) return false;
    }
    return true;
  });
}
function taskFiltersActive() { return ['tfProject', 'tfCrm', 'tfPerson', 'tfStatus', 'tfDue'].filter((k) => ui[k]).length; }
function taskFilterBar() {
  const opt = (v, n, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(n)}</option>`;
  const projects = D.projects.slice().sort((a, b) => (a.archived - b.archived) || a.name.localeCompare(b.name, 'ru'));
  const crmUsed = contactsOfTasks(D.tasks).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const sel = (key, label, opts) => `<select class="tf ${ui[key] ? 'on' : ''}" data-change="${key}" aria-label="${label}">${opt('', label + ': все', ui[key])}${opts}</select>`;
  return `<div class="tf-bar">
    ${sel('tfProject', 'Проект', (() => {
      const cats = projectCategories();
      const one = (p) => opt(p.id, p.name + (p.archived ? ' (архив)' : ''), ui.tfProject);
      if (!cats.length) return projects.map(one).join('');
      return cats.map((c) => { const ps = projects.filter((p) => p.category === c); return ps.length ? `<optgroup label="${esc(c)}">${ps.map(one).join('')}</optgroup>` : ''; }).join('')
        + (projects.some((p) => !p.category) ? `<optgroup label="Без категории">${projects.filter((p) => !p.category).map(one).join('')}</optgroup>` : '');
    })() + opt('none', 'Без проекта', ui.tfProject))}
    ${sel('tfCrm', 'CRM', crmUsed.map((c) => opt(c.id, c.name, ui.tfCrm)).join('') + opt('none', 'Без контакта', ui.tfCrm))}
    ${sel('tfPerson', 'Исполнитель', allPeople().map((x) => opt(x, x, ui.tfPerson)).join('') + opt('—', 'Без исполнителя', ui.tfPerson))}
    ${sel('tfStatus', 'Статус', D.settings.statuses.map((x) => opt(x.id, x.name, ui.tfStatus)).join(''))}
    ${sel('tfDue', 'Срок', [['overdue', 'Просрочено'], ['today', 'Сегодня'], ['tomorrow', 'Завтра'], ['week', 'Ближайшие 7 дней'], ['later', 'Позже'], ['nodue', 'Без срока']].map(([v, n]) => opt(v, n, ui.tfDue)).join(''))}
    ${taskFiltersActive() ? `<button class="btn sm" data-a="tf-reset">${icon('close')}Сбросить</button>` : ''}
  </div>`;
}
function allPeople() {
  const set = new Set(D.settings.people);
  D.tasks.forEach((t) => t.assignee && set.add(t.assignee));
  return Array.from(set);
}
function dueBuckets() {
  const t = today();
  return [
    { id: 'overdue', name: 'Просрочено', test: (x) => x.due && x.due < t && !isDone(x), preset: {} },
    { id: 'today', name: 'Сегодня', test: (x) => x.due === t, preset: { due: t } },
    { id: 'tomorrow', name: 'Завтра', test: (x) => x.due && daysBetween(t, x.due) === 1, preset: { due: ymd(addDays(new Date(), 1)) } },
    { id: 'week', name: 'На неделе', test: (x) => x.due && daysBetween(t, x.due) >= 2 && daysBetween(t, x.due) <= 7, preset: { due: ymd(addDays(new Date(), 7)) } },
    { id: 'later', name: 'Позже', test: (x) => x.due && daysBetween(t, x.due) > 7, preset: {} },
    { id: 'nodue', name: 'Без срока', test: (x) => !x.due, preset: {} },
    { id: 'pastdone', name: 'Выполнено (прошлые)', test: (x) => x.due && x.due < t && isDone(x), preset: {} },
  ];
}
function baseTaskGroups(mode, tasks) {
  if (mode === 'project') {
    return D.projects.filter((p) => !p.archived || tasks.some((t) => t.projectId === p.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map((p) => ({ id: p.id, name: p.name, color: p.color || colorFor(p.name), items: tasks.filter((t) => t.projectId === p.id), preset: { projectId: p.id } }))
      .concat([{ id: '', name: 'Без проекта', items: tasks.filter((t) => !t.projectId), preset: {} }])
      .filter((g) => g.items.length || (g.id && !ui.tfProject));
  }
  if (mode === 'people') {
    return allPeople().map((p) => ({ id: p, name: p, color: colorFor(p), items: tasks.filter((t) => (t.assignee || '') === p), preset: { assignee: p } }))
      .concat([{ id: '', name: 'Без исполнителя', items: tasks.filter((t) => !t.assignee), preset: { assignee: '' } }])
      .filter((g) => g.items.length || D.settings.people.includes(g.id));
  }
  if (mode === 'status') {
    return D.settings.statuses.filter((s) => s.id !== 'done' || ui.showDone).map((s) => ({ id: s.id, name: s.name, items: tasks.filter((t) => t.status === s.id), preset: { status: s.id } }));
  }
  return dueBuckets().map((b) => ({ id: b.id, name: b.name, items: tasks.filter(b.test), preset: b.preset })).filter((g) => g.items.length || ['today', 'tomorrow', 'week'].includes(g.id));
}

/* Пользовательский порядок колонок (канбан и «Связи»): D.settings.kanbanOrder[режим] = [id колонок] */
function taskGroups(mode, tasks) { return orderGroups(mode, baseTaskGroups(mode, tasks)); }
function orderGroups(mode, groups) {
  const ord = (D.settings.kanbanOrder || {})[mode];
  if (!Array.isArray(ord) || !ord.length) return groups;
  const idx = new Map(ord.map((id, i) => [id, i]));
  return groups.map((g, i) => ({ g, i })).sort((a, b) => {
    const ia = idx.has(a.g.id) ? idx.get(a.g.id) : 1e6 + a.i, ib = idx.has(b.g.id) ? idx.get(b.g.id) : 1e6 + b.i;
    return ia - ib;
  }).map((x) => x.g);
}
// Переставить колонку: ids — порядок, видимый на экране; скрытые сейчас колонки сохраняют своё место в конце списка
function moveColumn(mode, ids, fromId, toIndex) {
  const cur = ids.filter((x) => x !== fromId);
  cur.splice(Math.max(0, Math.min(cur.length, toIndex)), 0, fromId);
  const prev = ((D.settings.kanbanOrder || {})[mode] || []).filter((x) => !cur.includes(x));
  if (!D.settings.kanbanOrder || typeof D.settings.kanbanOrder !== 'object') D.settings.kanbanOrder = {};
  D.settings.kanbanOrder[mode] = cur.concat(prev);
  save();
  render();
}

SCREENS.tasks = function () {
  const v = D.settings.tasksView;
  const views = [['kanban', 'Канбан'], ['links', 'Связи'], ['gantt', 'Гант'], ['list', 'Список']];
  let groupSel = '';
  if (v === 'kanban') {
    groupSel = `<div class="seg">${[['people', 'Исполнители'], ['project', 'Проекты'], ['due', 'Сроки'], ['status', 'Статусы']].map(([k, n]) => `<button class="${D.settings.kanbanGroup === k ? 'on' : ''}" data-a="set" data-key="kanbanGroup" data-val="${k}">${n}</button>`).join('')}</div>
      <button class="btn sm ${ui.kOrder ? 'primary' : ''}" data-a="k-order" title="Порядок колонок">${icon('cols')}${ui.kOrder ? 'Готово' : 'Порядок колонок'}</button>
      ${ui.kOrder && ((D.settings.kanbanOrder || {})[D.settings.kanbanGroup] || []).length ? '<button class="btn sm" data-a="k-order-reset">Сбросить</button>' : ''}`;
  } else if (v === 'links') {
    groupSel = `<div class="seg">${[['parents', 'Подзадачи'], ['people', 'Исполнители'], ['project', 'Проекты'], ['due', 'Сроки']].map(([k, n]) => `<button class="${D.settings.linksGroup === k ? 'on' : ''}" data-a="set" data-key="linksGroup" data-val="${k}">${n}</button>`).join('')}</div>`;
  } else if (v === 'gantt') {
    groupSel = `<div class="seg">${[['day', 'Дни'], ['week', 'Недели']].map(([k, n]) => `<button class="${D.settings.ganttScale === k ? 'on' : ''}" data-a="set" data-key="ganttScale" data-val="${k}">${n}</button>`).join('')}</div>`;
  }
  const tasks = visibleTasks();
  let body = '';
  if (v === 'kanban') body = kanban(tasks);
  else if (v === 'gantt') body = gantt(tasks);
  else if (v === 'links') body = linksView(tasks);
  else body = listOf(tasks.slice().sort(sortByDue), taskItem, D.tasks.length ? 'Ничего не найдено' : 'Задач пока нет. Нажмите «+», чтобы добавить первую.');
  const preset = {};
  if (ui.tfProject && ui.tfProject !== 'none') preset.projectId = ui.tfProject;
  if (ui.tfCrm && ui.tfCrm !== 'none') preset.crmIds = [ui.tfCrm];
  if (ui.tfPerson && ui.tfPerson !== '—') preset.assignee = ui.tfPerson;
  return `<div class="head"><h1>Задачи</h1>
      <button class="btn primary" data-a="new" data-type="task" data-preset='${esc(JSON.stringify(preset))}'>${icon('plus')}<span>Задача</span></button></div>
    <div class="row" style="margin-bottom:10px">
      <div class="seg">${views.map(([k, n]) => `<button class="${v === k ? 'on' : ''}" data-a="set" data-key="tasksView" data-val="${k}">${n}</button>`).join('')}</div>
      ${groupSel}
    </div>
    <div class="row" style="margin-bottom:12px">
      ${searchBox('taskQuery', 'Поиск задач', ui.taskQuery, 'grow')}
      <label class="toggle" style="padding:6px 10px"><input type="checkbox" data-a="toggle-done" ${ui.showDone ? 'checked' : ''}><span class="small">Готовые</span></label>
    </div>
    ${taskFilterBar()}
    ${body}`;
};

function kanban(tasks) {
  const groups = taskGroups(D.settings.kanbanGroup, tasks);
  const ids = groups.map((g) => g.id);
  return `${ui.kOrder ? '<div class="sub" style="margin:-4px 0 8px">Перетащите колонку за ⠿ или двигайте стрелками ‹ ›. Порядок запоминается отдельно для исполнителей, проектов, сроков и статусов.</div>' : ''}
    <div class="board ${ui.kOrder ? 'ordering' : ''}" data-ids='${esc(JSON.stringify(ids))}'>${groups.map((g, gi) => {
    const items = g.items.slice().sort(sortByDue);
    return `<div class="col" data-col="${esc(g.id)}">
      <div class="col-h"><span class="col-grip" data-grip="${esc(g.id)}" title="Перетащить колонку" aria-label="Перетащить колонку">⠿</span>${ui.kOrder ? `<button class="icon-btn col-mv" data-a="k-move" data-id="${esc(g.id)}" data-val="${gi - 1}" ${gi === 0 ? 'disabled' : ''} aria-label="Левее">${icon('back')}</button>` : ''}${g.color ? `<i class="dot" style="background:${g.color}"></i>` : ''}<span class="grow ellipsis">${esc(g.name)}</span><span class="cnt">${items.length}</span>${ui.kOrder ? `<button class="icon-btn col-mv" data-a="k-move" data-id="${esc(g.id)}" data-val="${gi + 1}" ${gi === groups.length - 1 ? 'disabled' : ''} aria-label="Правее" style="transform:scaleX(-1)">${icon('back')}</button>` : ''}
        <button class="icon-btn" style="width:30px;height:30px" data-a="new" data-type="task" data-preset='${esc(JSON.stringify(Object.assign(ui.tfProject && ui.tfProject !== 'none' ? { projectId: ui.tfProject } : {}, g.preset || {})))}' aria-label="Добавить">${icon('plus')}</button></div>
      ${items.map(kcard).join('') || '<div class="empty small">Пусто</div>'}
    </div>`;
  }).join('')}</div>`;
}
function kcard(t) {
  const st = taskState(t);
  const subs = subtasks(t.id);
  const parent = t.parentId && task(t.parentId);
  return `<div class="kcard ${st}" data-a="open" data-type="task" data-id="${t.id}">
    ${parent ? `<div class="small muted ellipsis">${icon('sub', '')} ${esc(parent.title)}</div>` : ''}
    <div class="t">${t.important ? '<span style="color:var(--danger)">●</span> ' : ''}${esc(t.title)}</div>
    <div class="m">${dueChip(t)}${D.settings.kanbanGroup !== 'people' ? personChip(t.assignee) : ''}${D.settings.kanbanGroup !== 'project' ? projectChip(t.projectId) : ''}${D.settings.kanbanGroup !== 'status' ? `<span class="chip ${isDone(t) ? 'green' : ''}">${esc(statusName(t.status))}</span>` : ''}${crmChips(t.crmIds, 1)}${subs.length ? `<span class="chip">${subs.filter(isDone).length}/${subs.length}</span>` : ''}${t.deps.length ? `<span class="chip">${icon('link')}${t.deps.length}</span>` : ''}</div>
  </div>`;
}

/* Диаграмма Ганта */
function ganttOrder(tasks) {
  const ids = new Set(tasks.map((t) => t.id));
  const roots = tasks.filter((t) => !t.parentId || !ids.has(t.parentId)).sort(sortByStart);
  const out = [];
  const walk = (t, lvl) => { out.push({ t, lvl }); tasks.filter((x) => x.parentId === t.id).sort(sortByStart).forEach((x) => walk(x, lvl + 1)); };
  roots.forEach((r) => walk(r, 0));
  return out;
}
function sortByStart(a, b) { const sa = a.start || a.due || '9999', sb = b.start || b.due || '9999'; return sa < sb ? -1 : sa > sb ? 1 : sortByDue(a, b); }
function gantt(tasks) {
  const rows = ganttOrder(tasks.filter((t) => t.start || t.due));
  const undated = tasks.filter((t) => !t.start && !t.due).length;
  if (!rows.length) return `<div class="list"><div class="empty">Чтобы задача появилась на диаграмме, укажите дату начала или срок.</div></div>`;
  const t0 = today();
  let min = addDays(new Date(), -3), max = addDays(new Date(), 21);
  rows.forEach(({ t }) => {
    const s = parseDate(t.start || t.due), e = parseDate(t.due || t.start);
    if (s < min) min = addDays(s, -2);
    if (e > max) max = addDays(e, 4);
  });
  const dw = D.settings.ganttScale === 'week' ? 14 : 36;
  const days = [];
  for (let d = new Date(min); d <= max; d = addDays(d, 1)) days.push(new Date(d));
  const W = days.length * dw;
  const idx = (s) => daysBetween(ymd(min), s);
  const head = days.map((d) => {
    const we = d.getDay() === 0 || d.getDay() === 6;
    const label = D.settings.ganttScale === 'week'
      ? (d.getDay() === 1 ? `<b>${d.getDate()}</b>` : '') + (d.getDate() === 1 ? '<br>' + MONTHS_N[d.getMonth()].slice(0, 3) : '')
      : `${d.getDate() === 1 || d.getTime() === min.getTime() ? MONTHS_N[d.getMonth()].slice(0, 3) : '&nbsp;'}<br><b>${d.getDate()}</b><br>${WD[d.getDay()]}`;
    return `<div class="g-day ${we ? 'we' : ''} ${ymd(d) === t0 ? 'td' : ''}" style="width:${dw}px">${label}</div>`;
  }).join('');
  const bg = days.map((d) => `<div class="${d.getDay() === 0 || d.getDay() === 6 ? 'we' : ''}" style="width:${dw}px"></div>`).join('');
  const lines = rows.map(({ t }) => {
    const s = t.start || t.due, e = t.due || t.start;
    const left = idx(s) * dw + 2;
    const width = Math.max(1, idx(e) - idx(s) + 1) * dw - 4;
    const st = taskState(t);
    const ms = !t.start || t.start === t.due ? (dw < 20) : false;
    return `<div class="g-line"><div class="g-bar ${st} ${ms ? 'milestone' : ''}" style="left:${left}px;width:${width}px" data-a="open" data-type="task" data-id="${t.id}">${ms ? '' : esc(t.title)}</div></div>`;
  }).join('');
  const todayX = idx(t0) * dw + dw / 2;
  return `<div class="gantt">
    <div class="g-left">
      <div class="g-head"><span class="lab">Задача</span></div>
      ${rows.map(({ t, lvl }) => `<div class="g-row" style="padding-left:${10 + lvl * 16}px">${lvl ? icon('sub', '') : ''}<span class="t" data-a="open" data-type="task" data-id="${t.id}" style="${isDone(t) ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</span><i class="dot" style="background:${colorFor(t.assignee)}" title="${esc(t.assignee)}"></i></div>`).join('')}
    </div>
    <div class="g-right" id="gantt-scroll" data-today-x="${todayX}">
      <div style="width:${W}px">
        <div class="g-head"><div class="g-days">${head}</div></div>
        <div class="g-grid"><div class="g-bg">${bg}</div><div class="g-today" style="left:${todayX}px"></div>${lines}</div>
      </div>
    </div>
  </div>${undated ? `<div class="sub mt">${undated} ${plural(undated, 'задача', 'задачи', 'задач')} без дат не показаны на диаграмме.</div>` : ''}`;
}
function scrollGanttToToday() {
  const el = $('#gantt-scroll');
  if (el && !el.dataset.scrolled) { el.scrollLeft = Math.max(0, Number(el.dataset.todayX) - 80); el.dataset.scrolled = '1'; }
}

/* Связи между задачами: карточки-заголовки и линии между ними */
function linksView(tasks) {
  const mode = D.settings.linksGroup;
  const node = (t, cls) => `<div class="lnode ${cls || ''} ${isDone(t) ? 'done' : ''} ${ui.highlight === t.id ? 'hl' : ''}" data-node="${t.id}" data-a="open" data-type="task" data-id="${t.id}">
      <div class="t">${esc(t.title)}</div>
      <div class="m">${t.due ? `<span style="${taskState(t) === 'overdue' ? 'color:var(--danger)' : ''}">${esc(fmtShort(t.due))}</span>` : ''}${mode !== 'people' && t.assignee ? `<span><i class="dot" style="background:${colorFor(t.assignee)}"></i> ${esc(t.assignee)}</span>` : ''}${t.crmIds.length ? `<span>${esc((contact(t.crmIds[0]) || {}).name || '')}</span>` : ''}</div>
    </div>`;
  let cols = '';
  if (mode === 'parents') {
    const ids = new Set(tasks.map((t) => t.id));
    const parents = tasks.filter((t) => subtasks(t.id).some((s) => ids.has(s.id))).sort(sortByDue);
    const inTree = new Set();
    parents.forEach((p) => { inTree.add(p.id); subtasks(p.id).forEach((s) => inTree.add(s.id)); });
    // Подзадачи располагаются над основной задачей.
    cols = parents.map((p) => {
      const subs = subtasks(p.id).filter((s) => ids.has(s.id) && !parents.includes(s)).sort(sortByDue);
      return `<div class="lcol"><div class="lgroup">${subs.map((s) => node(s, 'sub')).join('')}${node(p, 'parent')}</div></div>`;
    }).join('');
    const rest = tasks.filter((t) => !inTree.has(t.id)).sort(sortByDue);
    if (rest.length) cols += `<div class="lcol"><div class="lcol-h muted">Без подзадач</div><div class="lgroup">${rest.map((t) => node(t)).join('')}</div></div>`;
  } else {
    const groups = taskGroups(mode, tasks).filter((g) => g.items.length);
    cols = groups.map((g) => `<div class="lcol"><div class="lcol-h">${g.color ? `<i class="dot" style="background:${g.color}"></i>` : ''}${esc(g.name)} <span class="muted small">${g.items.length}</span></div>
      <div class="lgroup">${g.items.slice().sort(sortByDue).map((t) => node(t, subtasks(t.id).length ? 'parent' : '')).join('')}</div></div>`).join('');
  }
  if (!cols) return `<div class="list"><div class="empty">Задач пока нет</div></div>`;
  return `<div class="legend"><span><i></i>подзадача → задача</span><span><i class="dash"></i>зависимость (сначала → потом)</span></div>
    <div class="links-wrap" id="links-wrap"><svg class="links-svg" id="links-svg"></svg><div class="links">${cols}</div></div>`;
}
function drawLinks() {
  const wrap = $('#links-wrap'), svg = $('#links-svg');
  if (!wrap || !svg) return;
  const box = wrap.getBoundingClientRect();
  const pos = {};
  $$('[data-node]', wrap).forEach((el) => {
    const r = el.getBoundingClientRect();
    pos[el.dataset.node] = { x: r.left - box.left + wrap.scrollLeft, y: r.top - box.top + wrap.scrollTop, w: r.width, h: r.height };
  });
  const inner = $('.links', wrap);
  svg.setAttribute('width', inner.scrollWidth + 20);
  svg.setAttribute('height', inner.scrollHeight + 20);
  let paths = '';
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#2f5bea';
  const violet = css.getPropertyValue('--violet').trim() || '#7c4ddb';
  const curve = (a, b, color, dash) => {
    let x1, y1, x2, y2, d;
    const sameCol = Math.abs(a.x - b.x) < 30;
    if (sameCol) {
      // в одной колонке: от нижнего/верхнего края
      if (a.y < b.y) { x1 = a.x + a.w / 2; y1 = a.y + a.h; x2 = b.x + b.w / 2; y2 = b.y; } else { x1 = a.x + a.w / 2; y1 = a.y; x2 = b.x + b.w / 2; y2 = b.y + b.h; }
      if (Math.abs(y2 - y1) < 30) d = `M${x1},${y1} L${x2},${y2}`;
      else { const off = 26; x1 = a.x + a.w; x2 = b.x + b.w; y1 = a.y + a.h / 2; y2 = b.y + b.h / 2; d = `M${x1},${y1} C${x1 + off},${y1} ${x2 + off},${y2} ${x2},${y2}`; }
    } else {
      const ltr = a.x < b.x;
      x1 = ltr ? a.x + a.w : a.x; y1 = a.y + a.h / 2;
      x2 = ltr ? b.x : b.x + b.w; y2 = b.y + b.h / 2;
      const mx = (x1 + x2) / 2;
      d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    }
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${dash ? 'stroke-dasharray="6 5"' : ''} marker-end="url(#arr-${dash ? 'v' : 'a'})" opacity=".85"/>`;
  };
  D.tasks.forEach((t) => {
    if (t.parentId && pos[t.id] && pos[t.parentId]) paths += curve(pos[t.id], pos[t.parentId], accent, false);
    t.deps.forEach((dep) => { if (pos[dep] && pos[t.id]) paths += curve(pos[dep], pos[t.id], violet, true); });
  });
  svg.innerHTML = `<defs>
    <marker id="arr-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${accent}"/></marker>
    <marker id="arr-v" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${violet}"/></marker>
  </defs>${paths}`;
}

/* ---------- Проекты ---------- */
SCREENS.projects = function () {
  const arch = ui.projArchived;
  const list = sortProjects(D.projects.filter((p) => !!p.archived === arch)
    .filter((p) => !ui.projCat || (ui.projCat === '—' ? !p.category : p.category === ui.projCat))
    .map((p) => ({ p, st: projectStats(p.id) })), D.settings.projectsSort);
  const archCount = D.projects.filter((p) => p.archived).length;
  const none = projectStats(null);
  return `<div class="head"><h1>Проекты</h1><button class="btn primary" data-a="new" data-type="project">${icon('plus')}<span>Проект</span></button></div>
    <div class="sub" style="margin:-4px 0 10px">Проект объединяет задачи. CRM-контакты попадают в проект через его задачи.</div>
    <div class="seg" style="margin-bottom:10px"><button class="${!arch ? 'on' : ''}" data-a="proj-arch" data-id="0">Активные</button><button class="${arch ? 'on' : ''}" data-a="proj-arch" data-id="1">Архив${archCount ? ' · ' + archCount : ''}</button></div>
    ${projectToolbar()}
    ${list.length ? `<div class="pgroups">${projectGrid(list, { desc: true })}${!arch && none.total && !ui.projCat ? `${D.settings.projectsGroup !== 'none' ? '<div class="section-title pcat-title">Вне проектов</div>' : ''}<div class="pgrid">${projectCard(null, none)}</div>` : ''}</div>`
      : `<div class="list"><div class="empty">${arch ? 'В архиве пусто' : 'Проектов пока нет. Создайте первый — и привязывайте к нему задачи.'}</div></div>`}`;
};

/* ---------- CRM ---------- */
// Карточки CRM с учётом поиска и фильтров экрана (тот же список выгружается в CSV)
function crmFiltered() {
  const q = ui.crmQuery.trim().toLowerCase();
  const t = today();
  let list = D.contacts.filter((c) => !q || [c.name, c.company, c.role, c.phone, c.email, c.contacts, (c.tags || []).join(' '), (c.types || []).join(' '), (c.statuses || []).join(' ')].join(' ').toLowerCase().includes(q));
  if (ui.crmType) list = list.filter((c) => (c.types || []).includes(ui.crmType));
  if (ui.crmStatus) list = list.filter((c) => (c.statuses || []).includes(ui.crmStatus));
  if (ui.crmFilter === 'overdue') list = list.filter(contactOverdue);
  if (ui.crmFilter === 'today') list = list.filter((c) => c.nextContact === t);
  if (ui.crmFilter === 'tasks') list = list.filter((c) => tasksOfContact(c.id).some((x) => !isDone(x)));
  list.sort((a, b) => {
    const oa = contactOverdue(a) ? 0 : 1, ob = contactOverdue(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, 'ru');
  });
  return list;
}
SCREENS.crm = function () {
  const list = crmFiltered();
  const f = [['all', 'Все'], ['overdue', 'Просрочены'], ['today', 'Сегодня'], ['tasks', 'С задачами']];
  return `<div class="head"><h1>CRM</h1>${D.contacts.length ? `<button class="btn" data-a="crm-csv" title="Выгрузить карточки в CSV">${icon('share')}<span>CSV</span></button>` : ''}<button class="btn primary" data-a="new" data-type="contact">${icon('plus')}<span>Контакт</span></button></div>
    ${searchBox('crmQuery', 'Поиск: имя, компания, телефон, тег', ui.crmQuery)}
    <div class="seg mt">${f.map(([k, n]) => `<button class="${ui.crmFilter === k ? 'on' : ''}" data-a="crm-filter" data-id="${k}">${n}</button>`).join('')}</div>
    <div class="crm-sel mt" style="margin-bottom:12px">
      <select data-change="crmType"><option value="">Тип: все</option>${D.settings.contactTypes.map((x) => `<option ${ui.crmType === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <select data-change="crmStatus"><option value="">Статус: все</option>${D.settings.contactStatuses.map((x) => `<option ${ui.crmStatus === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
    </div>
    ${listOf(list, contactItem, D.contacts.length ? 'Ничего не найдено' : 'Карточек пока нет. Добавьте первый контакт.')}`;
};

/* ---------- Календарь ---------- */
function loadDeviceEvents(force) {
  if (!CAL || !D.settings.showDeviceEvents) { ui.devEvents = []; return; }
  try {
    const p = JSON.parse(CAL.permissions() || '{}');
    if (!p.calendar) { ui.devEvents = []; return; }
    const [from, to] = calRange();
    const ids = (D.settings.showDeviceCalendars || []).join(',');
    const linked = new Set(D.events.map((e) => String(e.deviceId || '')));
    ui.devEvents = JSON.parse(CAL.deviceEvents(from, to, ids) || '[]').filter((e) => !linked.has(String(e.eventId)));
    if (force) render();
  } catch (e) { ui.devEvents = []; }
}
function devEventsOn(day) {
  return ui.devEvents.filter((e) => {
    const s = ymd(new Date(e.begin));
    const en = ymd(new Date(Math.max(e.begin, e.end - 1)));
    return s <= day && en >= day;
  });
}
/* ---------- Календарь: день / неделя / месяц / год ---------- */
const CAL_VIEWS = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']];
const calView = () => (CAL_VIEWS.some(([k]) => k === D.settings.calView) ? D.settings.calView : 'month');
function weekStart(dayStr) { const d = parseDate(dayStr); return addDays(d, -((d.getDay() + 6) % 7)); }
// диапазон дат текущего вида (для загрузки событий календаря телефона)
function calRange() {
  const v = calView(), sel = parseDate(ui.cal.sel);
  if (v === 'day') return [addDays(sel, -1).getTime(), addDays(sel, 2).getTime()];
  if (v === 'week') { const w = weekStart(ui.cal.sel); return [addDays(w, -1).getTime(), addDays(w, 8).getTime()]; }
  if (v === 'year') return [new Date(sel.getFullYear(), 0, 1).getTime(), new Date(sel.getFullYear() + 1, 0, 1).getTime()];
  const [y, m] = ui.cal.month.split('-').map(Number);
  return [new Date(y, m - 1, 1 - 7).getTime(), new Date(y, m, 1 + 14).getTime()];
}
function calTitle() {
  const v = calView(), d = parseDate(ui.cal.sel);
  if (v === 'day') return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (v === 'week') {
    const a = weekStart(ui.cal.sel), b = addDays(a, 6);
    return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
      : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
  }
  if (v === 'year') return String(d.getFullYear());
  const [y, m] = ui.cal.month.split('-').map(Number);
  return `${MONTHS_N[m - 1]} ${y}`;
}
function setCalDay(day) { ui.cal.sel = day; ui.cal.month = day.slice(0, 7); }

/* Всё, что попадает на день: события приложения и телефона, дни рождения, сроки задач */
function dayItems(day) {
  const timed = [], allday = [];
  const mins = (dt) => dt.getHours() * 60 + dt.getMinutes();
  eventsOn(day).forEach((e) => {
    const attrs = `data-a="open" data-type="event" data-id="${e.id}"`;
    const cls = e.important ? 'imp' : 'ev';
    if (e.allDay) { allday.push({ title: e.title, cls, attrs }); return; }
    const st = parseDT(e.start), en = parseDT(e.end || e.start);
    const s0 = e.start.slice(0, 10) < day ? 0 : mins(st);
    const e0 = (e.end || e.start).slice(0, 10) > day ? 1440 : Math.max(mins(en), s0 + 15);
    timed.push({ title: e.title, cls, attrs, s: s0, e: e0, time: e.start.slice(0, 10) === day ? hm(st) : '' });
  });
  devEventsOn(day).forEach((e) => {
    const attrs = `data-a="dev-event" data-id="${e.eventId}" data-begin="${e.begin}"`;
    if (e.allDay) { allday.push({ title: e.title || '(без названия)', cls: 'dev', attrs }); return; }
    const st = new Date(e.begin), en = new Date(e.end);
    const s0 = ymd(st) < day ? 0 : mins(st);
    const e0 = ymd(en) > day ? 1440 : Math.max(mins(en), s0 + 15);
    timed.push({ title: e.title || '(без названия)', cls: 'dev', attrs, s: s0, e: e0, time: ymd(st) === day ? hm(st) : '' });
  });
  birthdaysOn(day).forEach((c) => allday.push({ title: '🎂 ' + c.name, cls: 'bd', attrs: `data-a="open" data-type="contact" data-id="${c.id}"` }));
  D.tasks.filter((t) => t.due === day && !isDone(t)).forEach((t) => {
    const attrs = `data-a="open" data-type="task" data-id="${t.id}"`;
    if (t.dueTime) { const [h, mi] = t.dueTime.split(':').map(Number); timed.push({ title: '☐ ' + t.title, cls: 'task', attrs, s: h * 60 + mi, e: h * 60 + mi + 30, time: t.dueTime }); }
    else allday.push({ title: '☐ ' + t.title, cls: taskState(t) === 'overdue' ? 'od' : 'task', attrs });
  });
  return { timed, allday };
}
/* Раскладка пересекающихся событий по колонкам */
function layoutDay(items) {
  const list = items.slice().sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], end = -1;
  const flush = () => {
    const cols = [];
    cluster.forEach((it) => { let c = cols.findIndex((x) => x <= it.s); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = it.e; it.col = c; });
    cluster.forEach((it) => { it.cols = cols.length; });
    cluster = [];
  };
  list.forEach((it) => { if (it.s >= end && cluster.length) { flush(); end = -1; } cluster.push(it); end = Math.max(end, it.e); });
  if (cluster.length) flush();
  return list;
}
const HOUR_PX = 48;
function timeGrid(days) {
  const t = today();
  const now = new Date();
  const many = days.length > 1;
  const data = days.map((d) => ({ d, k: ymd(d), it: dayItems(ymd(d)) }));
  const hasAllday = data.some((x) => x.it.allday.length);
  const head = many ? `<div class="tg-head"><div class="tg-gut"></div>${data.map((x) => `<button class="tg-dh ${x.k === t ? 'td' : ''} ${x.d.getDay() === 0 || x.d.getDay() === 6 ? 'we' : ''}" data-a="cal-goday" data-id="${x.k}"><span>${WD[x.d.getDay()]}</span><b>${x.d.getDate()}</b></button>`).join('')}</div>` : '';
  const allday = hasAllday ? `<div class="tg-allday"><div class="tg-gut small muted">весь<br>день</div>${data.map((x) => `<div class="tg-adcol">${x.it.allday.map((a) => `<div class="tg-chip ${a.cls}" ${a.attrs}>${esc(a.title)}</div>`).join('')}</div>`).join('')}</div>` : '';
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="tg-h" style="top:${h * HOUR_PX}px">${h ? pad(h) + ':00' : ''}</div>`).join('');
  const cols = data.map((x) => {
    const slots = Array.from({ length: 24 }, (_, h) => `<div class="tg-slot" style="top:${h * HOUR_PX}px" data-a="new" data-type="event" data-preset='${esc(JSON.stringify({ date: x.k, time: pad(h) + ':00' }))}'></div>`).join('');
    const evs = layoutDay(x.it.timed).map((it) => {
      const top = it.s / 60 * HOUR_PX, h = Math.max(20, (it.e - it.s) / 60 * HOUR_PX - 2);
      const w = 100 / it.cols;
      return `<div class="tg-ev ${it.cls}" ${it.attrs} style="top:${top}px;height:${h}px;left:calc(${it.col * w}% + 1px);width:calc(${w}% - 2px)"><b>${esc(it.title)}</b>${it.time && h > 30 ? `<span>${esc(it.time)}</span>` : ''}</div>`;
    }).join('');
    const nowLine = x.k === t ? `<div class="tg-now" style="top:${(now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_PX}px"></div>` : '';
    return `<div class="tg-col ${x.k === t ? 'td' : ''}">${slots}${evs}${nowLine}</div>`;
  }).join('');
  const scrollTo = data.some((x) => x.k === t) ? Math.max(0, now.getHours() - 1) : 7;
  return `<div class="tg ${many ? 'week' : 'day'}">${head}${allday}
    <div class="tg-scroll" id="tg-scroll" data-y="${scrollTo * HOUR_PX}"><div class="tg-body" style="height:${24 * HOUR_PX}px"><div class="tg-gut">${hours}</div><div class="tg-cols">${cols}</div></div></div></div>`;
}
function monthGrid() {
  const [y, m] = ui.cal.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const gridStart = addDays(first, -((first.getDay() + 6) % 7));
  const t = today();
  const wide = window.innerWidth >= 600;
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const k = ymd(d);
    let inner;
    if (wide) {
      const it = dayItems(k);
      const all = it.allday.map((a) => ({ title: a.title, cls: a.cls })).concat(layoutDay(it.timed).map((x) => ({ title: (x.time ? x.time + ' ' : '') + x.title, cls: x.cls })));
      inner = `<span class="mg-items">${all.slice(0, 3).map((a) => `<i class="mg-it ${a.cls}">${esc(a.title)}</i>`).join('')}${all.length > 3 ? `<i class="mg-more">ещё ${all.length - 3}</i>` : ''}</span>`;
    } else {
      const evs = eventsOn(k), dev = devEventsOn(k).length, tk = D.tasks.filter((x) => x.due === k && !isDone(x)).length, bd = birthdaysOn(k).length;
      inner = `<span class="dots">${(bd ? '<i class="bd"></i>' : '') + evs.slice(0, 3).map((e) => `<i class="${e.important ? 'imp' : ''}"></i>`).join('') + (dev ? '<i class="dev"></i>' : '') + (tk ? '<i class="task"></i>' : '')}</span>`;
    }
    cells += `<button class="cal-d ${wide ? 'wide' : ''} ${d.getMonth() !== m - 1 ? 'out' : ''} ${k === t ? 'td' : ''} ${k === ui.cal.sel ? 'sel' : ''}" data-a="cal-sel" data-id="${k}"><span>${d.getDate()}</span>${inner}</button>`;
    if (i === 34 && addDays(gridStart, 35).getMonth() !== m - 1) break;
  }
  return `<div class="cal-grid">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => `<div class="cal-wd">${w}</div>`).join('')}${cells}</div>`;
}
function yearGrid() {
  const y = parseDate(ui.cal.sel).getFullYear();
  const t = today();
  const busy = new Set();
  D.events.forEach((e) => { if (e.start) { let d = parseDate(e.start); const end = parseDate((e.end || e.start).slice(0, 10)); for (let i = 0; i < 60 && d <= end; i++, d = addDays(d, 1)) busy.add(ymd(d)); } });
  ui.devEvents.forEach((e) => busy.add(ymd(new Date(e.begin))));
  D.tasks.forEach((x) => { if (x.due && !isDone(x)) busy.add(x.due); });
  const bdays = new Set();
  D.contacts.forEach((c) => { if (c.birthday && c.birthday.length >= 10) { const md = c.birthday.slice(5, 10); bdays.add(md === '02-29' && !isLeap(y) ? '02-28' : md); } });
  const months = Array.from({ length: 12 }, (_, mi) => {
    const first = new Date(y, mi, 1);
    const off = (first.getDay() + 6) % 7;
    const n = new Date(y, mi + 1, 0).getDate();
    let cells = '<i></i>'.repeat(off);
    for (let d = 1; d <= n; d++) {
      const k = `${y}-${pad(mi + 1)}-${pad(d)}`;
      cells += `<button class="yd ${k === t ? 'td' : ''} ${busy.has(k) ? 'has' : ''} ${bdays.has(k.slice(5)) ? 'bd' : ''}" data-a="cal-goday" data-id="${k}">${d}</button>`;
    }
    return `<div class="ym"><button class="ym-t ${y + '-' + pad(mi + 1) === t.slice(0, 7) ? 'cur' : ''}" data-a="cal-gomonth" data-id="${y}-${pad(mi + 1)}">${MONTHS_N[mi]}</button>
      <div class="ym-g">${['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map((w) => `<i class="w">${w}</i>`).join('')}${cells}</div></div>`;
  }).join('');
  return `<div class="ygrid">${months}</div><div class="row mt small muted"><span><i class="dot" style="background:var(--accent)"></i> есть события или сроки</span><span><i class="dot" style="background:var(--pink)"></i> день рождения</span></div>`;
}
function dayPanel(sel) {
  const evs = eventsOn(sel).sort((a, b) => (a.allDay ? '0' : a.start) < (b.allDay ? '0' : b.start) ? -1 : 1);
  const dev = devEventsOn(sel);
  const tks = D.tasks.filter((x) => x.due === sel).sort(sortByDue);
  const bds = birthdaysOn(sel);
  const soon = upcomingBirthdays(30).filter((x) => x.d !== sel);
  return `<div class="section-title" style="margin-top:4px">${esc(fmtDate(sel, true))}<button class="btn sm right" data-a="cal-goday" data-id="${sel}">День ›</button></div>
    ${evs.length || dev.length || bds.length ? `<div class="list">${bds.map((c) => birthdayItem(c, sel)).join('')}${evs.map((e) => eventItem(e)).join('')}${dev.map(devEventItem).join('')}</div>` : '<div class="list"><div class="empty">Событий нет</div></div>'}
    ${tks.length ? `<div class="section-title">Сроки задач</div>${listOf(tks, taskItem, '')}` : ''}
    ${soon.length ? `<div class="section-title">Ближайшие дни рождения</div><div class="list">${soon.slice(0, 8).map((x) => birthdayItem(x.c, x.d)).join('')}</div>` : ''}`;
}
SCREENS.calendar = function () {
  const v = calView();
  const sel = ui.cal.sel;
  const top = `<div class="head"><h1>Календарь</h1><button class="btn primary" data-a="new" data-type="event" data-preset='${esc(JSON.stringify({ date: sel }))}'>${icon('plus')}<span>Событие</span></button></div>
    <div class="cal-top">
      <div class="seg">${CAL_VIEWS.map(([k, n]) => `<button class="${v === k ? 'on' : ''}" data-a="cal-view" data-id="${k}">${n}</button>`).join('')}</div>
      <div class="row cal-nav">
        <button class="icon-btn" data-a="cal-nav" data-id="-1" aria-label="Назад">${icon('back')}</button>
        <b class="grow cal-title">${esc(calTitle())}</b>
        <button class="icon-btn" data-a="cal-nav" data-id="1" aria-label="Вперёд" style="transform:scaleX(-1)">${icon('back')}</button>
        <button class="btn sm" data-a="cal-today">Сегодня</button>
      </div>
    </div>`;
  if (v === 'day') return top + `<div class="cal cal-swipe">${timeGrid([parseDate(sel)])}</div>`;
  if (v === 'week') { const w = weekStart(sel); return top + `<div class="cal cal-swipe">${timeGrid(Array.from({ length: 7 }, (_, i) => addDays(w, i)))}</div>`; }
  if (v === 'year') return top + `<div class="cal cal-swipe">${yearGrid()}</div>`;
  return top + `<div class="cal-layout">
      <div class="cal cal-swipe">${monthGrid()}
        <div class="row mt small muted"><span class="right"><i class="dot" style="background:var(--danger)"></i> важное <i class="dot" style="background:var(--accent)"></i> событие <i class="dot" style="background:var(--warn)"></i> срок задачи <i class="dot" style="background:var(--pink)"></i> день рождения <i class="dot"></i> системный</span></div>
      </div>
      <div>${dayPanel(sel)}</div>
    </div>`;
};

/* ---------- Заметки ---------- */
SCREENS.notes = function () {
  const q = ui.notesQuery.trim().toLowerCase();
  let list = D.notes.filter((n) => !q || ((n.title || '') + ' ' + (n.body || '')).toLowerCase().includes(q));
  if (ui.notesContact === 'none') list = list.filter((n) => !n.crmIds.length);
  else if (ui.notesContact !== 'all') list = list.filter((n) => n.crmIds.includes(ui.notesContact));
  list.sort((a, b) => (a.discussed - b.discussed) || ((b.updatedAt || '') < (a.updatedAt || '') ? -1 : 1));
  const used = D.contacts.filter((c) => D.notes.some((n) => n.crmIds.includes(c.id))).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  // Группировка по контактам
  let body;
  if (ui.notesContact === 'all' && !q) {
    const groups = used.map((c) => ({ c, items: list.filter((n) => n.crmIds.includes(c.id)) })).filter((g) => g.items.length);
    const free = list.filter((n) => !n.crmIds.length);
    body = groups.map((g) => `<div class="section-title"><span class="avatar" style="width:22px;height:22px;font-size:10px;background:${colorFor(g.c.name)}">${esc(initials(g.c.name))}</span>${esc(g.c.name)}<button class="btn sm right" data-a="new" data-type="note" data-preset='${esc(JSON.stringify({ crmId: g.c.id }))}'>${icon('plus')}</button></div>${listOf(g.items, noteItem, '')}`).join('')
      + (free.length ? `<div class="section-title">Без контакта</div>${listOf(free, noteItem, '')}` : '');
    if (!body) body = `<div class="list"><div class="empty">Заметок пока нет. Здесь удобно копить темы для разговора с контактом — без сроков.</div></div>`;
  } else {
    body = listOf(list, noteItem, 'Ничего не найдено');
  }
  return `<div class="head"><h1>Заметки</h1><button class="btn primary" data-a="new" data-type="note" data-preset='${esc(JSON.stringify(ui.notesContact !== 'all' && ui.notesContact !== 'none' ? { crmId: ui.notesContact } : {}))}'>${icon('plus')}<span>Заметка</span></button></div>
    <div class="row" style="margin-bottom:6px">
      ${searchBox('notesQuery', 'Поиск по заметкам', ui.notesQuery, 'grow')}
      <select class="search" style="width:auto;max-width:48%" data-change="notesContact">
        <option value="all">Все контакты</option><option value="none" ${ui.notesContact === 'none' ? 'selected' : ''}>Без контакта</option>
        ${D.contacts.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((c) => `<option value="${c.id}" ${ui.notesContact === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    ${body}`;
};

/* ---------- Текстовая сводка для мессенджера ---------- */
function buildSummary(opts) {
  const o = Object.assign({}, D.settings.summary, opts || {});
  const who = o.person || '';
  const t = today();
  const now = new Date();
  const T = D.tasks.filter((x) => !who || x.assignee === who);
  const L = [];
  const line = '────────────────';
  const tl = (x) => `• ${x.title}${x.assignee && !who ? ' — ' + x.assignee : ''}${x.due ? ', до ' + fmtShort(x.due) : ''}${x.crmIds.length ? ' (' + x.crmIds.map((id) => (contact(id) || {}).name).filter(Boolean).join(', ') + ')' : ''}`;
  L.push(`УПРАВЛЕНЧЕСКИЙ СРЕЗ${who ? ' — ' + who : ''}`);
  L.push(`${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${hm(now)}`);
  L.push(line);
  const overdue = T.filter((x) => taskState(x) === 'overdue').sort(sortByDue);
  const todays = T.filter((x) => !isDone(x) && x.due === t).sort(sortByDue);
  const week = T.filter((x) => taskState(x) === 'future' && daysBetween(t, x.due) <= 7).sort(sortByDue);
  if (o.home) {
    const c = counts();
    L.push('ИТОГИ');
    L.push(`Просрочено задач: ${overdue.length}`);
    L.push(`Задач на сегодня: ${todays.length}`);
    L.push(`В работе всего: ${T.filter((x) => !isDone(x)).length}`);
    if (!who) {
      L.push(`Просроченных карточек CRM: ${c.overdueCrm}`);
      L.push(`Событий CRM сегодня: ${c.todayCrmEvents}`);
    }
    L.push('');
  }
  if (o.projects && !who && D.projects.some((p) => !p.archived)) {
    L.push('ПО ПРОЕКТАМ');
    D.projects.filter((p) => !p.archived).forEach((p) => {
      const st = projectStats(p.id);
      L.push(`• ${p.name}: к выполнению ${st.todoTasks.length} задач / ${st.todoCrm.length} crm; просрочено ${st.overdueTasks.length} задач / ${st.overdueCrm.length} crm`);
    });
    L.push('');
  }
  if (o.overdue && overdue.length) { L.push(`⚠ ПРОСРОЧЕНО (${overdue.length})`); overdue.forEach((x) => L.push(tl(x))); L.push(''); }
  if (o.today) { L.push(`СЕГОДНЯ (${todays.length})`); if (todays.length) todays.forEach((x) => L.push(tl(x))); else L.push('— задач нет'); L.push(''); }
  if (o.week && week.length) { L.push(`БЛИЖАЙШИЕ 7 ДНЕЙ (${week.length})`); week.forEach((x) => L.push(tl(x))); L.push(''); }
  if (o.people && !who) {
    L.push('ПО ИСПОЛНИТЕЛЯМ');
    allPeople().forEach((p) => {
      const mine = D.tasks.filter((x) => x.assignee === p && !isDone(x));
      if (!mine.length) return;
      const od = mine.filter((x) => taskState(x) === 'overdue').length;
      L.push(`• ${p}: ${mine.length} в работе${od ? ', просрочено ' + od : ''}`);
    });
    L.push('');
  }
  if (o.events) {
    const evs = D.events.filter((e) => e.start && e.start.slice(0, 10) >= t && daysBetween(t, e.start.slice(0, 10)) <= 7).sort((a, b) => a.start < b.start ? -1 : 1);
    if (evs.length) {
      L.push('ВСТРЕЧИ И СОБЫТИЯ (7 дней)');
      evs.forEach((e) => L.push(`• ${fmtShort(e.start)}${e.allDay ? '' : ' ' + e.start.slice(11, 16)} ${e.title}${e.crmIds.length ? ' (' + e.crmIds.map((id) => (contact(id) || {}).name).filter(Boolean).join(', ') + ')' : ''}`));
      L.push('');
    }
  }
  if (o.crm && !who) {
    const cs = D.contacts.filter((c) => c.nextContact && c.nextContact <= t).sort((a, b) => a.nextContact < b.nextContact ? -1 : 1);
    if (cs.length) { L.push('CRM: ПОРА СВЯЗАТЬСЯ'); cs.forEach((c) => L.push(`• ${c.name}${c.company ? ', ' + c.company : ''} — с ${fmtShort(c.nextContact)}`)); L.push(''); }
  }
  if (o.notes && !who) {
    const ns = D.notes.filter((n) => !n.discussed);
    if (ns.length) { L.push('К ОБСУЖДЕНИЮ'); ns.forEach((n) => L.push(`• ${n.crmIds.length ? (contact(n.crmIds[0]) || {}).name + ': ' : ''}${n.title || (n.body || '').split('\n')[0]}`)); L.push(''); }
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function copyText(text) {
  if (N) { N.copyText(text); toast('Сводка скопирована'); return; }
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Сводка скопирована'), () => toast('Не удалось скопировать'));
}

SCREENS.summary = function () {
  const s = D.settings.summary;
  const opts = [['home', 'Итоги (счётчики)'], ['projects', 'По проектам'], ['overdue', 'Просроченные задачи'], ['today', 'Задачи на сегодня'], ['week', 'Задачи на 7 дней'], ['people', 'По исполнителям'], ['events', 'Встречи на 7 дней'], ['crm', 'CRM: пора связаться'], ['notes', 'Заметки к обсуждению']];
  const text = buildSummary({ person: ui.summaryPerson || '' });
  return `<div class="head"><button class="icon-btn only-narrow" data-a="tab" data-id="home">${icon('back')}</button><h1>Сводка</h1></div>
    <div class="sub" style="margin-bottom:12px">Текстовый срез для отправки партнёру в мессенджер. Выберите разделы — нажмите «Скопировать».</div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn primary" data-a="summary-copy">${icon('copy')}Скопировать</button>
      <button class="btn" data-a="summary-share">${icon('share')}Отправить…</button>
      <select class="search" style="width:auto" data-change="summaryPerson"><option value="">Все исполнители</option>${allPeople().map((p) => `<option ${ui.summaryPerson === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    </div>
    <div class="picker" style="margin-bottom:14px">${opts.map(([k, n]) => `<button class="chip ${s[k] ? 'blue' : ''}" data-a="summary-opt" data-id="${k}">${s[k] ? '✓ ' : ''}${n}</button>`).join('')}</div>
    <pre class="summary">${esc(text)}</pre>`;
};

/* ---------- Настройки ---------- */
SCREENS.settings = function () {
  const s = D.settings;
  let perms = {};
  let backups = [], snaps = [], info = {};
  if (N) {
    try { perms = JSON.parse(N.permissions() || '{}'); } catch (e) { /* */ }
    try { backups = JSON.parse(N.listBackups() || '[]'); } catch (e) { /* */ }
    try { snaps = JSON.parse(N.listSnapshots() || '[]'); } catch (e) { /* */ }
    try { info = JSON.parse(N.appInfo() || '{}'); } catch (e) { /* */ }
    try { ui.devCals = perms.calendar ? JSON.parse(N.deviceCalendars() || '[]') : []; } catch (e) { ui.devCals = []; }
  } else if (CAL) {
    // веб-версия: права и календари — с телефона
    try { perms = JSON.parse(CAL.permissions() || '{}'); } catch (e) { /* */ }
    try { snaps = JSON.parse(CAL.listSnapshots() || '[]'); } catch (e) { /* */ }
    try { ui.devCals = perms.calendar ? JSON.parse(CAL.deviceCalendars() || '[]') : []; } catch (e) { ui.devCals = []; }
  }
  cleanStaleCalendarFilter();
  const perm = (k, title, hint) => `<div class="perm"><div class="grow"><div>${title}</div><div class="sub">${hint}</div></div>${perms[k] ? '<span class="ok">включено</span>' : `<button class="btn sm" data-a="perm" data-id="${k}">Разрешить</button>`}</div>`;
  const fmtSize = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';
  return `<div class="head"><button class="icon-btn only-narrow" data-a="tab" data-id="home">${icon('back')}</button><h1>Настройки</h1></div>

    <div class="section-title">Исполнители</div>
    <div class="card">
      <div class="picker">${s.people.map((p) => `<span class="chip" style="padding:6px 10px"><i class="dot" style="background:${colorFor(p)}"></i>${esc(p)}${p === s.me ? ' (я)' : ` <button class="chip" style="padding:0 4px" data-a="person-del" data-id="${esc(p)}">✕</button>`}</span>`).join('')}</div>
      <div class="row mt"><input class="search grow" id="new-person" placeholder="Имя исполнителя"><button class="btn" data-a="person-add">${icon('plus')}Добавить</button></div>
    </div>

    <div class="section-title">Категории проектов</div>
    <div class="card">
      ${projectCategories().length ? `<div class="picker">${projectCategories().map((c) => `<span class="chip" style="padding:6px 10px">${icon('folder')}<button class="chip" style="padding:0 2px;background:none" data-a="pcat-rename" data-id="${esc(c)}">${esc(c)}</button> <span class="muted small">${D.projects.filter((p) => p.category === c).length}</span> <button class="chip" style="padding:0 4px" data-a="pcat-del" data-id="${esc(c)}" aria-label="Удалить">✕</button></span>`).join('')}</div>` : '<div class="sub">Категорий пока нет. Например: «Игры», «Медиа», «Инвестиции», «Образование».</div>'}
      <div class="row mt"><input class="search grow" id="new-pcat" placeholder="Новая категория"><button class="btn" data-a="pcat-add">${icon('plus')}Добавить</button></div>
      <div class="sub mt">Нажмите на название, чтобы переименовать. При удалении категории проекты остаются — просто без категории.</div>
    </div>

    <div class="section-title">Напоминания</div>
    <div class="card form">
      <div class="field-row">
        <div class="field"><label>Обычное событие: за сколько минут</label><input type="number" min="0" data-setting="defaultRemind" value="${s.defaultRemind}"></div>
        <div class="field"><label>Время напоминаний CRM</label><input type="time" data-setting="taskRemindTime" value="${esc(s.taskRemindTime)}"></div>
      </div>
      <div class="field"><label>Важное событие (будильник): за сколько минут, через запятую</label><input data-setting="importantRemind" value="${esc(s.importantRemind.join(', '))}"></div>
      <div class="row"><button class="btn" data-a="test-alarm" data-id="0">${icon('bell')}Тест обычного</button><button class="btn danger" data-a="test-alarm" data-id="1">${icon('alarm')}Тест будильника (через 5 с)</button></div>
      <label class="toggle"><input type="checkbox" data-a="set-bool" data-key="birthdayRemind" ${s.birthdayRemind ? 'checked' : ''}><span class="grow">Напоминать о днях рождения контактов<small>Накануне и в сам день, во время напоминаний CRM</small></span></label>
      <div class="sub">Важные события звонят как будильник и не замолкают, пока вы не нажмёте «Отключить» или «Отложить».</div>
    </div>

    ${N ? `<div class="section-title">Разрешения ${esc(info.device || '')}</div>
    <div class="card">
      ${perm('notifications', 'Уведомления', 'Показывать напоминания')}
      ${perm('exactAlarm', 'Точные будильники', 'Напоминания минута в минуту')}
      ${perm('fullScreen', 'Полноэкранный сигнал', 'Экран будильника поверх блокировки')}
      ${perm('battery', 'Без ограничений батареи', 'Чтобы система не «усыпляла» напоминания')}
      ${perm('calendar', 'Календарь', 'Синхронизация с календарём телефона')}
      <div class="sub mt">Для Huawei: Настройки → Приложения → Запуск приложений → «管理会计» → «Управлять вручную» и включите автозапуск, косвенный запуск и работу в фоне. Также в настройках уведомлений приложения разрешите «Баннеры», «Экран блокировки» и звук.</div>
      <button class="btn sm mt" data-a="perm" data-id="app">Открыть настройки приложения</button>
    </div>` : ''}

    <div class="section-title">Календарь телефона</div>
    <div class="card form">
      <label class="toggle"><input type="checkbox" data-a="set-bool" data-key="showDeviceEvents" ${s.showDeviceEvents ? 'checked' : ''}><span class="grow">Показывать события календаря телефона<small>Их можно изменять, удалять и привязывать к задачам и контактам</small></span></label>
      ${ui.devCals.length ? `
        <div class="field"><label>Какие календари показывать (пусто — все)</label>
          <div class="picker">${ui.devCals.map((c) => `<button class="chip ${s.showDeviceCalendars.includes(String(c.id)) ? 'blue' : ''}" data-a="devcal-toggle" data-id="${c.id}"><i class="dot" style="background:${esc(c.color)}"></i>${esc(c.name)}${c.account ? ' — ' + esc(c.account) : ''}</button>`).join('')}</div></div>
        <div class="field"><label>Куда записывать события приложения</label>
          <select data-setting="deviceCalendarId"><option value="">Не записывать</option>${ui.devCals.filter((c) => c.writable).map((c) => `<option value="${c.id}" ${String(s.deviceCalendarId) === String(c.id) ? 'selected' : ''}>${esc(c.name)}${c.account ? ' — ' + esc(c.account) : ''}</option>`).join('')}</select></div>`
      : `<div class="sub">${N ? 'Разрешите доступ к календарю выше, чтобы выбрать календари.'
        : CAL ? (perms.calendar ? 'На телефоне не найдено ни одного календаря.' : 'Разрешите приложению доступ к календарю на телефоне: Настройки → Разрешения → Календарь.')
        : 'Доступно в приложении на телефоне.'}</div>`}
      ${CAL ? diagBlock() : ''}
      <div class="row"><b class="grow">Офлайн-копии календаря</b>${CAL ? `<button class="btn sm" data-a="snapshot-now">${icon('backup')}Снимок сейчас</button>` : ''}</div>
      <div class="sub">Каждый день приложение сохраняет у себя копию событий календаря телефона (−60 … +365 дней). Хранится 30 последних снимков; они не зависят от серверов.</div>
      ${snaps.length ? `<div class="list">${snaps.slice(0, 10).map((f) => `<div class="item" data-a="snapshot-open" data-id="${esc(f.name)}"><div class="grow"><div class="t">${esc(f.name.replace('cal-', '').replace('.json', ''))}</div><div class="s">${fmtSize(f.size)}</div></div></div>`).join('')}</div>` : ''}
    </div>

    <div class="section-title">Резервные копии</div>
    <div class="card form">
      <div class="row">
        <button class="btn primary" data-a="backup-export">${icon('share')}Сохранить в файл</button>
        <button class="btn" data-a="backup-import">Восстановить из файла</button>
        ${N ? `<button class="btn" data-a="backup-now">${icon('backup')}Копия сейчас</button>` : ''}
      </div>
      ${N && N.folderBackupStatus ? folderBackupBlock() : ''}
      <div class="sub">Формат копии версионирован (сейчас v${SCHEMA}): копии любых прошлых версий открываются в новых — это проверяется автоматически при каждой сборке приложения. Внутренняя автокопия создаётся каждый день (хранятся 30 последних), но она удалится вместе с приложением — поэтому включите копию в папку.</div>
      ${backups.length ? `<div class="list">${backups.slice(0, 15).map((f) => `<div class="item" data-a="backup-restore" data-id="${esc(f.name)}"><div class="grow"><div class="t">${esc(f.name.replace('auto-', '').replace('.json', ''))}</div><div class="s">${fmtSize(f.size)} · нажмите, чтобы восстановить</div></div></div>`).join('')}</div>` : ''}
    </div>

    <div class="section-title">О приложении</div>
    <div class="card">
      <dl class="kv">
        <dt>Версия</dt><dd>${esc(info.version || APP_VERSION)} · формат данных v${SCHEMA}</dd>
        <dt>Устройство</dt><dd>${esc(info.device || navigator.userAgent.slice(0, 40))}</dd>
        <dt>Экран</dt><dd class="screen-mode">${window.innerWidth}×${window.innerHeight} — ${screenMode()}</dd>
        <dt>Данные</dt><dd>${D.projects.length} проектов, ${D.tasks.length} задач, ${D.contacts.length} контактов, ${D.events.length} событий, ${D.notes.length} заметок</dd>
      </dl>
      <div class="row mt"><button class="btn sm" data-a="demo">Заполнить примером</button><button class="btn sm danger" data-a="wipe">Удалить все данные</button></div>
    </div>`;
};
/* ---------- Выгрузка CRM в CSV ---------- */
// Заголовки совпадают с тем, что понимает импорт (import.js): файл можно загрузить обратно.
const CRM_CSV_COLUMNS = [
  ['Имя', (c) => c.name],
  ['Компания', (c) => c.company],
  ['Должность', (c) => c.role],
  ['Телефон', (c) => c.phone],
  ['Почта', (c) => c.email],
  ['Контакты', (c) => c.contacts],
  ['Дата рождения', (c) => ruDate(c.birthday)],
  ['Тип контакта', (c) => (c.types || []).join(', ')],
  ['Статус', (c) => (c.statuses || []).join(', ')],
  ['Теги', (c) => (c.tags || []).join(', ')],
  ['Следующий контакт', (c) => ruDate(c.nextContact)],
  ['Напоминать', (c) => (c.remind !== false ? 'да' : 'нет')],
  ['Комментарий', (c) => c.comment],
  ['Проекты', (c) => Array.from(new Set(tasksOfContact(c.id).map((t) => t.projectId && project(t.projectId)).filter(Boolean).map((p) => p.name))).join(', ')],
  ['Открытые задачи', (c) => tasksOfContact(c.id).filter((t) => !isDone(t)).map((t) => t.title).join('; ')],
  ['Фото', (c) => c.photo],
  ['Создана', (c) => ruDate((c.createdAt || '').slice(0, 10))],
  ['ID в 管理会计', (c) => c.id],
];
// ГГГГ-ММ-ДД → ДД.ММ.ГГГГ (так даты узнаёт Excel с русскими настройками)
function ruDate(s) { return /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : (s || ''); }
function csvCell(v, sep) {
  let s = v == null ? '' : String(v);
  // Защита от формул в Excel/Таблицах: =, @ и «+/-» не перед номером телефона
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s))) s = "'" + s;
  return /["\r\n]/.test(s) || s.includes(sep) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function crmCsv(list, sep) {
  const rows = [CRM_CSV_COLUMNS.map(([h]) => h)].concat(list.map((c) => CRM_CSV_COLUMNS.map(([, f]) => f(c))));
  return '\uFEFF' + rows.map((r) => r.map((v) => csvCell(v, sep)).join(sep)).join('\r\n') + '\r\n';
}
function saveTextFile(txt, name, mime, kind) {
  ui.exportKind = kind;
  if (N) N.exportFile(txt, name, mime);
  else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: mime + ';charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(kind === 'csv' ? 'Файл CSV скачан' : 'Файл скачан');
  }
}

/* ---------- Диагностика календарей ---------- */
// id из фильтра «Какие календари показывать», которых нет среди календарей телефона.
// Удаляем только когда список календарей загружен (не пуст): при сбое чтения фильтр не трогаем.
function cleanStaleCalendarFilter() {
  if (!ui.devCals.length) return;
  const ids = new Set(ui.devCals.map((c) => String(c.id)));
  const list = D.settings.showDeviceCalendars || [];
  const stale = list.filter((x) => !ids.has(String(x)));
  if (!stale.length) return;
  D.settings.showDeviceCalendars = list.filter((x) => ids.has(String(x)));
  ui.staleRemoved = (ui.staleRemoved || []).concat(stale);
  save();
}
function loadDiag() {
  try { ui.diagData = JSON.parse(CAL.calendarDiagnostics((D.settings.showDeviceCalendars || []).join(',')) || '{}'); } catch (e) { ui.diagData = { errors: { diagnostics: String(e) } }; }
}
const ACCOUNT_TYPES = { 'bitfire.at.davdroid': 'DAVx⁵', 'com.google': 'Google', LOCAL: 'локальный', 'com.android.exchange': 'Exchange', 'com.google.android.gm.exchange': 'Exchange', 'com.samsung.android.exchange': 'Exchange', 'com.android.huawei.phone': 'Huawei', 'com.huawei.hwid': 'Huawei ID' };
const accountTypeName = (t) => ACCOUNT_TYPES[t] || (/huawei|honor/i.test(t) ? 'Huawei' : /icloud|apple/i.test(t) ? 'iCloud' : /davx|davdroid|caldav/i.test(t) ? 'CalDAV' : '');
function accessName(n) {
  return n >= 700 ? 'владелец · запись' : n >= 600 ? 'редактор · запись' : n >= 500 ? 'запись' : n >= 200 ? 'только чтение' : n >= 100 ? 'только «занят/свободен»' : 'нет доступа';
}
const flag = (v, yes, no) => `<span class="dg-f ${v ? 'ok' : 'bad'}">${v ? '✓' : '✗'} ${v ? yes : no}</span>`;
const fmtDT = (ms, allDay) => { const d = new Date(ms); return allDay ? fmtDate(new Date(ms).toISOString().slice(0, 10)) : fmtDate(ymd(d)) + ' ' + hm(d); };
function diagErrors(errs) {
  const names = { permission: 'Разрешение', calendars: 'Список календарей', instances: 'Повторения (Instances)', events: 'Таблица событий', find: 'Поиск', diagnostics: 'Диагностика', connection: 'Связь', lastCalendarsError: 'Последний запрос календарей', lastEventsError: 'Последний запрос событий' };
  const list = Object.entries(errs || {}).filter(([, v]) => v);
  return list.length ? `<div class="dg-err">${list.map(([k, v]) => `<div><b>${esc(names[k] || k)}:</b> ${esc(v)}</div>`).join('')}</div>` : '';
}
function diagBlock() {
  const open = !!ui.diagOpen;
  const head = `<button class="dg-head" data-a="diag-toggle" aria-expanded="${open}"><span class="dg-arrow">${open ? '▾' : '▸'}</span><b class="grow">Диагностика календарей</b><span class="sub">${open ? '' : 'если события пропали'}</span></button>`;
  if (!open) return `<div class="dg">${head}</div>`;
  const d = ui.diagData || {};
  const filter = D.settings.showDeviceCalendars || [];
  const cals = (d.calendars || []).slice().sort((a, b) => (a.account + a.name).localeCompare(b.account + b.name, 'ru'));
  const stale = d.staleFilter || [];
  const last = { lastCalendarsError: d.lastCalendarsError, lastEventsError: d.lastEventsError };
  const rows = cals.map((c) => `<div class="dg-cal ${c.inFilter ? '' : 'off'}">
      <div class="row" style="gap:8px"><i class="dot" style="background:${esc(c.color)};width:12px;height:12px"></i><b class="grow ellipsis">${esc(c.name || '(без названия)')}</b><span class="dg-n" title="Повторений за −30…+60 дней, которые видит приложение / строк в таблице событий">${c.instances} / ${c.rows}</span></div>
      <div class="sub">${esc(c.account || '—')} · ${accountTypeName(c.accountType) ? esc(accountTypeName(c.accountType)) + ' · ' : ''}<code>${esc(c.accountType || '—')}</code> · id ${c.id} · ${esc(c.color)}</div>
      <div class="dg-flags">${flag(c.visible, 'VISIBLE', 'VISIBLE=0 (скрыт)')}${flag(c.syncEvents, 'SYNC_EVENTS', 'SYNC_EVENTS=0')}<span class="dg-f ${c.writable ? 'ok' : ''}">${esc(accessName(c.access))} (${c.access})</span>${flag(c.inFilter, filter.length ? 'в фильтре' : 'фильтр пуст — показывается', 'отфильтрован')}</div>
      ${!c.syncEvents ? '<div class="sub dg-warn">События этого календаря не синхронизируются — Android может не показывать их в приложениях.</div>' : ''}
      ${c.rows > 0 && c.instances === 0 ? '<div class="sub dg-warn">В таблице событий есть записи, но Android не создал по ним ни одного повторения в этом диапазоне.</div>' : ''}
    </div>`).join('');
  const f = ui.diagFind;
  return `<div class="dg">${head}
    <div class="dg-body">
      <div class="row" style="gap:8px"><span class="sub grow">Чтение: ${d.canRead ? '✓' : '✗'} · запись: ${d.canWrite ? '✓' : '✗'} · показ событий телефона: ${D.settings.showDeviceEvents ? 'включён' : '<b>выключен</b>'} · числа — за −30…+60 дней: повторения, которые видит приложение / строки таблицы событий</span><button class="btn sm" data-a="diag-refresh">Обновить</button></div>
      ${diagErrors(Object.assign({}, d.errors || {}, last))}
      ${ui.staleRemoved && ui.staleRemoved.length ? `<div class="sub dg-info">Из фильтра автоматически удалено несуществующих календарей: ${ui.staleRemoved.length} (id ${esc(ui.staleRemoved.join(', '))}).</div>` : ''}
      ${stale.length ? `<div class="dg-stale"><span class="grow">В фильтре ${stale.length} ${plural(stale.length, 'несуществующий календарь', 'несуществующих календаря', 'несуществующих календарей')} (id ${esc(stale.join(', '))})${stale.length === filter.length ? ' — из-за этого не показывается ни одно событие телефона' : ''}</span><button class="btn sm danger" data-a="diag-clean">Очистить</button></div>` : ''}
      ${cals.length ? `<div class="dg-cals">${rows}</div>` : `<div class="sub">${d.canRead === false ? 'Нет разрешения на чтение календаря.' : 'Приложение не видит ни одного календаря через CalendarContract. Проверьте, что аккаунт календаря (iCloud через DAVx⁵, Google, Huawei) добавлен в системные настройки телефона и синхронизирован.'}</div>`}
      <div class="field mt"><label>Найти событие во всём календаре телефона (без фильтров)</label>
        <div class="row"><input class="search grow" id="diag-q" placeholder="Часть названия" value="${esc(ui.diagQ || '')}"><button class="btn" data-a="diag-find">Найти</button></div>
        <div class="sub">Даты проверяются по текущему виду календаря: ${esc(CAL_VIEWS.find(([k]) => k === calView())[1].toLowerCase())}, ${esc(calTitle())}.</div></div>
      ${f ? diagFindResult(f) : ''}
    </div></div>`;
}
// Причины, по которым найденное событие телефона не видно в приложении
function devEventReasons(e) {
  const r = [];
  const filter = D.settings.showDeviceCalendars || [];
  const cal = `«${e.calendar || 'календарь ' + e.calendarId}»${e.account ? ' (' + e.account + ')' : ''}`;
  if (!D.settings.showDeviceEvents) r.push('выключено «Показывать события календаря телефона»');
  if (e.deleted) r.push('событие помечено удалённым и ждёт синхронизации с сервером');
  if (filter.length && !filter.includes(String(e.calendarId))) r.push(`календарь ${cal} отфильтрован — включите его в «Какие календари показывать»`);
  const linked = D.events.find((x) => x.deviceId && (String(x.deviceId) === String(e.eventId) || (e.exceptionOf && String(x.deviceId) === String(e.exceptionOf))));
  if (linked) r.push(`связано с событием приложения «${linked.title}» — показывается как событие приложения, а не как событие телефона`);
  if (!e.total) r.push(`Android не создал ни одного повторения этого события${e.calSync ? '' : ' — у календаря SYNC_EVENTS=0'}, поэтому календари его не показывают`);
  else if (!e.inRange) r.push(`вне диапазона дат текущего вида календаря (${calTitle()}); ближайшее повторение — ${fmtDT(e.nearest, e.allDay)}`);
  if (!e.calVisible) r.push(`календарь ${cal} скрыт на телефоне (VISIBLE=0) — на некоторых телефонах такие события не отдаются приложениям`);
  return r;
}
function diagFindResult(f) {
  const errs = diagErrors(f.errors);
  const list = f.events || [];
  if (!list.length) {
    return errs + (f.query ? `<div class="dg-res"><b>«${esc(f.query)}» не найдено в календаре Android.</b><div class="sub">Значит, телефон не получил это событие: проверьте, что аккаунт календаря синхронизирован (для iCloud — DAVx⁵ или другое приложение синхронизации) и календарь включён в нём. Поиск идёт по названию, без учёта регистра.</div></div>` : '');
  }
  return errs + `<div class="sub mt">Найдено: ${list.length}${list.length >= 30 ? ' (показаны первые 30)' : ''}</div>` + list.map((e) => {
    const reasons = devEventReasons(e);
    const when = e.inRange || !e.nearest ? fmtDT(e.dtstart, e.allDay) : fmtDT(e.nearest, e.allDay);
    return `<div class="dg-res">
      <div class="row" style="gap:8px"><b class="grow">${esc(e.title)}</b>${e.recurring ? '<span class="chip">🔁 повторяется</span>' : ''}</div>
      <div class="sub">${esc(e.calendar || '?')}${e.account ? ' — ' + esc(e.account) : ''} · ${esc(when)} · id ${e.eventId} · повторений в виде: ${e.inRange}, за ±2 года: ${e.total}</div>
      ${reasons.length ? `<ul class="dg-why">${reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
        : `<div class="dg-okline">Должно быть видно в календаре приложения. <button class="btn sm" data-a="diag-goto" data-id="${esc(ymd(new Date(e.inRange ? e.dtstart : e.nearest || e.dtstart)))}">Открыть день</button></div>`}
    </div>`;
  }).join('');
}

function folderBackupBlock() {
  let st = {};
  try { st = JSON.parse(N.folderBackupStatus() || '{}'); } catch (e) { /* */ }
  if (!st.enabled) {
    return `<div class="perm"><div class="grow"><div><b>Ежедневно сохранять копию в папку</b></div><div class="sub">Выберите папку на телефоне (например, «Документы/管理会计»). Копия переживёт удаление приложения; её можно перенести на компьютер или в облако.</div></div>
      <button class="btn sm primary" data-a="folder-pick">Выбрать папку</button></div>`;
  }
  const last = st.lastAt ? new Date(st.lastAt) : null;
  const lastTxt = last ? `${fmtDate(ymd(last))} в ${hm(last)} — ${esc(st.lastFile || '')}` : 'ещё не было';
  return `<div class="card" style="background:var(--panel-2);box-shadow:none;margin:0">
      <div class="row"><b class="grow">Ежедневная копия в папку</b><span class="chip ${st.lastError || !st.access ? 'red' : 'green'}">${st.lastError || !st.access ? 'ошибка' : 'включено'}</span></div>
      <dl class="kv mt">
        <dt>Папка</dt><dd>${esc(st.folder || st.path || '')}</dd>
        <dt>Последняя копия</dt><dd>${lastTxt}</dd>
        ${st.lastError ? `<dt>Ошибка</dt><dd style="color:var(--danger)">${esc(st.lastError)}</dd>` : ''}
        <dt>Хранить</dt><dd><select data-a="folder-keep" class="search" style="width:auto;padding:4px 8px;min-height:0">${[7, 14, 30, 60, 90, 365].map((n) => `<option value="${n}" ${st.keep === n ? 'selected' : ''}>${n} ${plural(n, 'последнюю копию', 'последние копии', 'последних копий')}</option>`).join('')}</select></dd>
      </dl>
      <div class="row mt">
        <button class="btn sm" data-a="folder-now">${icon('backup')}Сохранить сейчас</button>
        <button class="btn sm" data-a="folder-pick">Сменить папку</button>
        <button class="btn sm danger" data-a="folder-off">Выключить</button>
      </div>
      <div class="sub mt">Копия создаётся раз в день — ночью или при первом открытии приложения за день. Файлы называются «管理会计-автокопия-ГГГГ-ММ-ДД.json»; восстановить — кнопкой «Восстановить из файла». Другие файлы в папке приложение не трогает.</div>
    </div>`;
}
function screenMode() {
  const w = window.innerWidth;
  if (w >= 980) return 'тройной экран / планшет';
  if (w >= 600) return 'двойной экран';
  return 'сложенный (одинарный)';
}

/* =========================================================
 * 7. Карточки (шторка) и формы
 * ======================================================= */
const SHEETS = {};

function linkSection(title, addBtns, content) {
  return `<div class="section-title">${title}<span class="right row" style="gap:4px">${addBtns || ''}</span></div>${content}`;
}
function smallBtn(a, label, attrs) { return `<button class="btn sm" data-a="${a}" ${attrs || ''}>${label}</button>`; }

/* ---------- Задача ---------- */
SHEETS.task = function ({ id }) {
  const t = task(id);
  if (!t) return sheetHead('Задача удалена');
  const parent = t.parentId && task(t.parentId);
  const subs = subtasks(t.id).sort(sortByDue);
  const deps = t.deps.map(task).filter(Boolean);
  const blocks = D.tasks.filter((x) => x.deps.includes(t.id));
  const evs = t.eventIds.map(event).filter(Boolean);
  const crms = t.crmIds.map(contact).filter(Boolean);
  return sheetHead(esc(t.title), `<button class="icon-btn" data-a="edit" data-type="task" data-id="${t.id}" aria-label="Изменить">${icon('edit')}</button>`)
    + `<div class="seg" style="margin-bottom:12px">${D.settings.statuses.map((s) => `<button class="${t.status === s.id ? 'on' : ''}" data-a="task-status" data-id="${t.id}" data-val="${s.id}">${esc(s.name)}</button>`).join('')}</div>
    <div class="card"><dl class="kv">
      <dt>Проект</dt><dd>${project(t.projectId) ? `<a href="#" data-a="open" data-type="project" data-id="${t.projectId}">${projectChip(t.projectId)}</a>` : '—'}</dd>
      <dt>Исполнитель</dt><dd>${personChip(t.assignee) || '—'}</dd>
      <dt>Начало</dt><dd>${t.start ? esc(fmtDate(t.start, true)) : '—'}</dd>
      <dt>Срок</dt><dd>${t.due ? dueChip(t) : '—'}</dd>
      ${t.remindAt ? `<dt>Напомнить</dt><dd>${esc(fmtDate(t.remindAt.slice(0, 10)))} ${esc(t.remindAt.slice(11, 16))}${t.important ? ' <span class="chip red">будильник</span>' : ''}</dd>` : ''}
      ${parent ? `<dt>Входит в</dt><dd><a href="#" data-a="open" data-type="task" data-id="${parent.id}">${esc(parent.title)}</a></dd>` : ''}
    </dl>${t.desc ? `<div class="desc mt">${esc(t.desc)}</div>` : ''}</div>`
    + linkSection('CRM-карточки', smallBtn('pick', '+ Привязать', `data-type="contact" data-for="task" data-id="${t.id}"`),
      crms.length ? listOf(crms, contactItem, '') : '<div class="sub">Задача не привязана к контактам</div>')
    + linkSection('События календаря', smallBtn('pick', '+ Привязать', `data-type="event" data-for="task" data-id="${t.id}"`) + smallBtn('new', '+ Новое', `data-type="event" data-preset='${esc(JSON.stringify({ taskId: t.id, date: t.due || today() }))}'`),
      evs.length ? listOf(evs, (e) => eventItem(e, true), '') : '<div class="sub">Нет связанных событий</div>')
    + linkSection(`Подзадачи${subs.length ? ' ' + subs.filter(isDone).length + '/' + subs.length : ''}`, smallBtn('new', '+ Подзадача', `data-type="task" data-preset='${esc(JSON.stringify({ parentId: t.id, assignee: t.assignee, crmIds: t.crmIds, projectId: t.projectId || null }))}'`),
      subs.length ? listOf(subs, taskItem, '') : '<div class="sub">Нет подзадач</div>')
    + linkSection('Сначала выполнить (зависимости)', smallBtn('pick', '+ Добавить', `data-type="dep" data-for="task" data-id="${t.id}"`),
      deps.length ? listOf(deps, taskItem, '') : '<div class="sub">Нет зависимостей</div>')
    + (blocks.length ? linkSection('Ждут эту задачу', '', listOf(blocks, taskItem, '')) : '')
    + `<div class="form-actions mt2"><button class="btn danger" data-a="delete" data-type="task" data-id="${t.id}">${icon('trash')}Удалить</button></div>`;
};

SHEETS.taskForm = function ({ id, preset }) {
  const t = id ? task(id) : Object.assign({ title: '', desc: '', assignee: D.settings.me, status: 'todo', start: '', due: '', dueTime: '', remindAt: '', important: false, parentId: null, projectId: null }, preset || {});
  const projects = D.projects.filter((p) => !p.archived || p.id === t.projectId).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const people = allPeople();
  const exclude = new Set();
  if (id) { const walk = (x) => { exclude.add(x); subtasks(x).forEach((s) => walk(s.id)); }; walk(id); }
  const parents = D.tasks.filter((x) => !exclude.has(x.id) && !isDone(x)).sort(sortByDue);
  return sheetHead(id ? 'Изменить задачу' : 'Новая задача') + `<form class="form" data-form="task" data-id="${id || ''}">
    <div class="field"><label>Название</label><input name="title" required value="${esc(t.title)}" placeholder="Что нужно сделать"></div>
    <div class="field"><label>Проект</label><select name="projectId"><option value="">— без проекта —</option>${projects.map((p) => `<option value="${p.id}" ${t.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><input name="projectNew" placeholder="или новый проект" style="margin-top:6px"></div>
    <div class="field-row">
      <div class="field"><label>Исполнитель</label><select name="assignee"><option value="">—</option>${people.map((p) => `<option ${t.assignee === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select><input name="assigneeNew" placeholder="или новый исполнитель" style="margin-top:6px"></div>
      <div class="field"><label>Статус</label><select name="status">${D.settings.statuses.map((s) => `<option value="${s.id}" ${t.status === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Начало</label><input type="date" name="start" value="${esc(t.start || '')}"></div>
      <div class="field"><label>Срок</label><input type="date" name="due" value="${esc(t.due || '')}"></div>
    </div>
    <div class="field"><label>Входит в задачу (родительская)</label><select name="parentId"><option value="">— самостоятельная задача —</option>${parents.map((p) => `<option value="${p.id}" ${t.parentId === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></div>
    <div class="field"><label>Напомнить</label><input type="datetime-local" name="remindAt" value="${esc(t.remindAt || '')}"></div>
    <label class="toggle"><input type="checkbox" name="important" ${t.important ? 'checked' : ''}><span class="grow">Напомнить будильником<small>Звонит, пока не отключите вручную</small></span></label>
    <div class="field"><label>Описание</label><textarea name="desc" placeholder="Детали, ссылки, договорённости">${esc(t.desc || '')}</textarea></div>
    <div class="form-actions"><button class="btn primary" type="submit">${icon('check')}Сохранить</button><button class="btn" type="button" data-a="sheet-back">Отмена</button></div>
  </form>`;
};

/* ---------- Проект ---------- */
const PROJECT_COLORS = ['#2f5bea', '#1f9d5a', '#e5484d', '#d98a00', '#7c4ddb', '#0e9fb0', '#d6409f', '#5b6475'];
SHEETS.project = function ({ id }) {
  const p = project(id);
  if (!p) return sheetHead('Проект удалён');
  const st = projectStats(p.id);
  const all = tasksOfProject(p.id);
  const open = all.filter((t) => !isDone(t)).sort(sortByDue);
  const done = all.filter(isDone).sort((a, b) => (b.doneAt || '') < (a.doneAt || '') ? -1 : 1);
  const cs = st.contacts.slice().sort((a, b) => (contactOverdue(b) - contactOverdue(a)) || a.name.localeCompare(b.name, 'ru'));
  const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
  return sheetHead(`<i class="dot" style="background:${esc(p.color || colorFor(p.name))};width:12px;height:12px"></i> ${esc(p.name)}`, `<button class="icon-btn" data-a="edit" data-type="project" data-id="${p.id}" aria-label="Изменить">${icon('edit')}</button>`)
    + `${p.category || p.ownerId ? `<div style="margin:-4px 0 10px">${p.ownerId ? `<span class="chip blue" title="Ответственный">${icon('crm')}${esc(p.ownerId)}</span> ` : ''}${p.category ? `<span class="chip violet">${icon('folder')}${esc(p.category)}</span>` : ''}</div>` : ''}${p.desc ? `<div class="desc" style="margin-bottom:12px">${esc(p.desc)}</div>` : ''}
    <div class="pc-cats" style="margin-bottom:10px">
      <div class="pc-cat todo ${st.todoTasks.length + st.todoCrm.length ? 'hot' : ''}"><span class="l">К выполнению</span><span class="v"><b>${st.todoTasks.length}</b> задач · <b>${st.todoCrm.length}</b> crm</span></div>
      <div class="pc-cat od ${st.overdueTasks.length + st.overdueCrm.length ? 'hot' : ''}"><span class="l">Просрочено</span><span class="v"><b>${st.overdueTasks.length}</b> задач · <b>${st.overdueCrm.length}</b> crm</span></div>
    </div>
    ${st.total ? `<div class="pc-prog" style="--pc:${esc(p.color || colorFor(p.name))}"><i style="width:${pct}%"></i></div><div class="sub small">${st.done} из ${st.total} выполнено · ${pct}%</div>` : ''}
    <div class="row mt"><button class="btn sm" data-a="tasks-filter" data-id="${p.id}">${icon('filter')}Открыть в задачах</button>${p.archived ? '<span class="chip">в архиве</span>' : ''}</div>`
    + linkSection(`Задачи (${open.length})`, smallBtn('pick', '+ Привязать', `data-type="ptask" data-for="project" data-id="${p.id}"`) + smallBtn('new', '+ Новая', `data-type="task" data-preset='${esc(JSON.stringify({ projectId: p.id }))}'`),
      open.length ? listOf(open, taskItem, '') : '<div class="sub">Открытых задач нет</div>')
    + linkSection(`CRM-контакты (${cs.length})`, '', cs.length ? listOf(cs, contactItem, '') : '<div class="sub">Контакты появятся здесь, когда вы привяжете их к задачам проекта</div>')
    + (done.length ? `<details class="mt"><summary class="section-title" style="cursor:pointer">Выполнено (${done.length})</summary>${listOf(done, taskItem, '')}</details>` : '')
    + `<div class="form-actions mt2"><button class="btn danger" data-a="delete" data-type="project" data-id="${p.id}">${icon('trash')}Удалить проект</button></div>`;
};
SHEETS.projectForm = function ({ id, preset }) {
  const p = id ? project(id) : Object.assign({ name: '', desc: '', category: ui.projCat && ui.projCat !== '—' ? ui.projCat : '', color: PROJECT_COLORS[D.projects.length % PROJECT_COLORS.length], archived: false }, preset || {});
  if (!p) return sheetHead('Проект удалён');
  return sheetHead(id ? 'Изменить проект' : 'Новый проект') + `<form class="form" data-form="project" data-id="${id || ''}">
    <div class="field"><label>Название</label><input name="name" required value="${esc(p.name)}" placeholder="Например: Запуск сайта"></div>
    <div class="field"><label>Ответственный</label><select name="ownerId"><option value="">— не указан —</option>${D.settings.people.map((x) => `<option ${p.ownerId === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label>Категория (вид деятельности)</label><select name="category"><option value="">— без категории —</option>${projectCategories().map((c) => `<option ${p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><input name="categoryNew" placeholder="или новая категория" style="margin-top:6px"></div>
    <div class="field"><label>Цвет</label><div class="picker">${PROJECT_COLORS.map((c) => `<label class="swatch"><input type="radio" name="color" value="${c}" ${(p.color || '') === c ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div></div>
    <div class="field"><label>Описание</label><textarea name="desc" placeholder="Цель, договорённости, ссылки">${esc(p.desc || '')}</textarea></div>
    ${id ? `<label class="toggle"><input type="checkbox" name="archived" ${p.archived ? 'checked' : ''}><span class="grow">В архиве<small>Проект пропадёт с главного экрана; задачи сохранятся</small></span></label>` : ''}
    <div class="form-actions"><button class="btn primary" type="submit">${icon('check')}Сохранить</button><button class="btn" type="button" data-a="sheet-back">Отмена</button></div>
  </form>`;
};

/* ---------- Контакт ---------- */
SHEETS.contact = function ({ id }) {
  const c = contact(id);
  if (!c) return sheetHead('Карточка удалена');
  const tks = tasksOfContact(c.id).sort((a, b) => (isDone(a) - isDone(b)) || sortByDue(a, b));
  const evs = eventsOfContact(c.id).sort((a, b) => a.start < b.start ? 1 : -1);
  const upcoming = evs.filter((e) => e.start.slice(0, 10) >= today()).reverse();
  const past = evs.filter((e) => e.start.slice(0, 10) < today());
  const nts = notesOfContact(c.id).sort((a, b) => a.discussed - b.discussed);
  return sheetHead('', `<button class="icon-btn" data-a="edit" data-type="contact" data-id="${c.id}" aria-label="Изменить">${icon('edit')}</button>`)
    + `<div class="row" style="margin:-6px 0 14px">${avatar(c, c.photo ? 96 : 56)}
      <div class="grow"><h2 style="margin:0">${esc(c.name)}</h2><div class="sub">${esc([c.role, c.company].filter(Boolean).join(' · '))}</div></div></div>
    <div class="card"><div class="section-title" style="margin-top:0">О контакте</div><dl class="kv">
      ${c.company ? `<dt>Компания</dt><dd>${esc(c.company)}</dd>` : ''}
      ${c.role ? `<dt>Должность</dt><dd>${esc(c.role)}</dd>` : ''}
      ${c.birthday ? `<dt>Дата рождения</dt><dd>${esc(c.birthday.split('-').reverse().join('.'))}${(() => { const nb = nextBirthday(c); if (!nb) return ''; const dd = daysBetween(today(), nb); return dd === 0 ? ' <span class="chip green">🎂 сегодня</span>' : dd <= 30 ? ` <span class="chip blue">через ${dd} ${plural(dd, 'день', 'дня', 'дней')}</span>` : ''; })()}</dd>` : ''}
      <dt>Тип контакта</dt><dd>${(c.types || []).length ? c.types.map((x) => `<span class="chip violet">${esc(x)}</span>`).join(' ') : '—'}</dd>
      <dt>Статус</dt><dd>${(c.statuses || []).length ? statusChips({ statuses: c.statuses }) : '—'}</dd>
    </dl></div>
    <div class="card"><dl class="kv">
      ${c.phone ? `<dt>Телефон</dt><dd><a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a></dd>` : ''}
      ${c.email ? `<dt>Почта</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ''}
      ${c.contacts ? `<dt>Соц. сети и другие контакты</dt><dd>${contactsHtml(c.contacts)}</dd>` : ''}
      <dt>Связаться</dt><dd>${c.nextContact ? `${contactDueChip(c, true)} <button class="btn sm" data-a="contacted" data-id="${c.id}" style="padding:2px 10px;min-height:0">${icon('check')}Связался</button>` : '—'}</dd>
      ${c.lastContact ? `<dt>Был контакт</dt><dd>${esc(fmtDate(c.lastContact))}</dd>` : ''}
      ${c.tags && c.tags.length ? `<dt>Теги</dt><dd>${c.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ')}</dd>` : ''}
    </dl>${c.comment ? `<div class="desc mt">${esc(c.comment)}</div>` : ''}
    <div class="row mt">
      <button class="btn sm cbtn green ${c.nextContact === today() ? 'on' : ''}" data-a="next-contact" data-id="${c.id}" data-val="0">Сегодня</button>
      <button class="btn sm cbtn amber ${c.nextContact && daysBetween(today(), c.nextContact) === 1 ? 'on' : ''}" data-a="next-contact" data-id="${c.id}" data-val="1">+1 д</button>
      <button class="btn sm cbtn blue ${c.nextContact && daysBetween(today(), c.nextContact) > 1 ? 'on' : ''}" data-a="contact-date" data-id="${c.id}">${icon('cal')}Выбрать дату</button>
    </div></div>`
    + linkSection(`Задачи (${tks.filter((x) => !isDone(x)).length})`, smallBtn('pick', '+ Привязать', `data-type="task" data-for="contact" data-id="${c.id}"`) + smallBtn('new', '+ Новая', `data-type="task" data-preset='${esc(JSON.stringify({ crmIds: [c.id] }))}'`),
      tks.length ? listOf(tks, taskItem, '') : '<div class="sub">Задач по контакту нет</div>')
    + linkSection('Встречи и события', smallBtn('new', '+ Встреча', `data-type="event" data-preset='${esc(JSON.stringify({ crmIds: [c.id], date: today() }))}'`),
      evs.length ? `<div class="list">${upcoming.map((e) => eventItem(e, true)).join('')}${past.slice(0, 5).map((e) => eventItem(e, true)).join('')}</div>` : '<div class="sub">Встреч нет</div>')
    + linkSection('Заметки к встрече', smallBtn('new', '+ Заметка', `data-type="note" data-preset='${esc(JSON.stringify({ crmId: c.id }))}'`),
      nts.length ? listOf(nts, noteItem, '') : '<div class="sub">Темы для разговора без срока — добавьте, чтобы не забыть на встрече</div>')
    + `<div class="form-actions mt2"><button class="btn danger" data-a="delete" data-type="contact" data-id="${c.id}">${icon('trash')}Удалить карточку</button></div>`;
};

SHEETS.contactForm = function ({ id, preset }) {
  const c = id ? contact(id) : Object.assign({ name: '', company: '', role: '', phone: '', email: '', tags: [], nextContact: '', remind: true, comment: '' }, preset || {});
  return sheetHead(id ? 'Изменить контакт' : 'Новый контакт') + `<form class="form" data-form="contact" data-id="${id || ''}">
    <div class="field"><label>Имя</label><input name="name" required value="${esc(c.name)}" placeholder="Имя и фамилия"></div>
    <div class="field"><label>Дата рождения</label><input type="date" name="birthday" value="${esc(c.birthday || '')}"></div>
    <div class="field"><label>Компания</label><input name="company" value="${esc(c.company || '')}"></div>
    <div class="field"><label>Должность</label><input name="role" value="${esc(c.role || '')}"></div>
    <div class="field"><label>Тип контакта</label>${multiSelect('types', D.settings.contactTypes, c.types, 'Выберите тип')}</div>
    <div class="field"><label>Статус</label>${multiSelect('statuses', D.settings.contactStatuses, c.statuses, 'Выберите статус')}</div>
    <div class="field"><label>Фото (ссылка на картинку)</label><input type="url" name="photo" value="${esc(c.photo || '')}" placeholder="https://…"></div>
    <div class="field-row">
      <div class="field"><label>Телефон</label><input type="tel" name="phone" value="${esc(c.phone || '')}"></div>
      <div class="field"><label>Почта</label><input type="email" name="email" value="${esc(c.email || '')}"></div>
    </div>
    <div class="field"><label>Соц. сети и другие контакты</label><input name="contacts" value="${esc(c.contacts || '')}"></div>
    <div class="field"><label>Следующий контакт (после этой даты карточка — просроченная)</label><input type="date" name="nextContact" value="${esc(c.nextContact || '')}"></div>
    <label class="toggle"><input type="checkbox" name="remind" ${c.remind !== false ? 'checked' : ''}><span class="grow">Напомнить в день контакта</span></label>
    <div class="field"><label>Теги (через запятую)</label><input name="tags" value="${esc((c.tags || []).join(', '))}" placeholder="клиент, партнёр"></div>
    <div class="field"><label>Комментарий</label><textarea name="comment">${esc(c.comment || '')}</textarea></div>
    <div class="form-actions"><button class="btn primary" type="submit">${icon('check')}Сохранить</button><button class="btn" type="button" data-a="sheet-back">Отмена</button></div>
  </form>`;
};

/* ---------- Событие ---------- */
SHEETS.event = function ({ id }) {
  const e = event(id);
  if (!e) return sheetHead('Событие удалено');
  const st = parseDT(e.start), en = parseDT(e.end);
  const crms = e.crmIds.map(contact).filter(Boolean);
  const tks = tasksOfEvent(e.id);
  const nts = D.notes.filter((n) => !n.discussed && n.crmIds.some((cid) => e.crmIds.includes(cid)));
  const rem = e.important ? (e.remind && e.remind.length ? e.remind : D.settings.importantRemind) : (e.remind || []);
  return sheetHead(esc(e.title), `<button class="icon-btn" data-a="edit" data-type="event" data-id="${e.id}" aria-label="Изменить">${icon('edit')}</button>`)
    + `<div class="card"><dl class="kv">
      <dt>Когда</dt><dd>${esc(fmtDate(e.start, true))}${e.allDay ? ', весь день' : ', ' + esc(hm(st)) + (en ? '–' + esc(hm(en)) : '')}</dd>
      ${e.location ? `<dt>Где</dt><dd>${esc(e.location)}</dd>` : ''}
      <dt>Сигнал</dt><dd>${e.important ? `<span class="chip red">${icon('alarm')}будильник</span> ` : ''}${rem.length ? rem.map((m) => m === 0 ? 'в момент начала' : 'за ' + humanMins(m)).join(', ') : 'без напоминания'}</dd>
      ${e.deviceId ? `<dt>Календарь</dt><dd><span class="chip">${icon('cal')}связано с календарём телефона</span></dd>` : ''}
    </dl>${e.desc ? `<div class="desc mt">${esc(e.desc)}</div>` : ''}</div>
    <label class="toggle mt"><input type="checkbox" data-a="event-important" data-id="${e.id}" ${e.important ? 'checked' : ''}><span class="grow">Важное — звонить как будильник<small>Сигнал не прекратится, пока вы не отключите его вручную</small></span></label>`
    + linkSection('CRM-карточки', smallBtn('pick', '+ Привязать', `data-type="contact" data-for="event" data-id="${e.id}"`),
      crms.length ? listOf(crms, contactItem, '') : '<div class="sub">Не привязано к контактам</div>')
    + linkSection('Задачи', smallBtn('pick', '+ Привязать', `data-type="task" data-for="event" data-id="${e.id}"`) + smallBtn('new', '+ Новая', `data-type="task" data-preset='${esc(JSON.stringify({ eventIds: [e.id], crmIds: e.crmIds, due: e.start.slice(0, 10) }))}'`),
      tks.length ? listOf(tks, taskItem, '') : '<div class="sub">Нет связанных задач</div>')
    + (crms.length ? linkSection('Обсудить на встрече', smallBtn('new', '+ Заметка', `data-type="note" data-preset='${esc(JSON.stringify({ crmId: crms[0].id }))}'`), nts.length ? listOf(nts, noteItem, '') : '<div class="sub">Нет открытых заметок к этим контактам</div>') : '')
    + `<div class="form-actions mt2"><button class="btn danger" data-a="delete" data-type="event" data-id="${e.id}">${icon('trash')}Удалить</button></div>`;
};

SHEETS.eventForm = function ({ id, preset }) {
  const p = preset || {};
  const t0 = /^\d{2}:\d{2}$/.test(p.time || '') ? p.time : '10:00';
  const t1 = pad(Math.min(23, Number(t0.slice(0, 2)) + 1)) + t0.slice(2);
  const base = { title: '', start: (p.date || today()) + 'T' + t0, end: (p.date || today()) + 'T' + t1, allDay: false, location: '', desc: '', important: false, remind: [D.settings.defaultRemind], crmIds: p.crmIds || [], syncDevice: !!D.settings.deviceCalendarId };
  const e = id ? event(id) : Object.assign(base, p.title ? { title: p.title } : {});
  const rm = (e.remind && e.remind[0] != null) ? e.remind[0] : -1;
  const opts = [[-1, 'Без напоминания'], [0, 'В момент начала'], [5, 'За 5 минут'], [15, 'За 15 минут'], [30, 'За 30 минут'], [60, 'За 1 час'], [120, 'За 2 часа'], [1440, 'За 1 день']];
  const phoneCals = !id ? writableDeviceCalendars() : [];
  const target = phoneCals.some((c) => 'dev:' + c.id === D.settings.newEventTarget) ? D.settings.newEventTarget : 'app';
  return sheetHead(id ? 'Изменить событие' : 'Новое событие') + `<form class="form" data-form="event" data-id="${id || ''}" data-preset='${esc(JSON.stringify(p))}'>
    ${phoneCals.length ? `<div class="field"><label>Куда сохранить</label><select name="target" data-ev-target>
      <option value="app" ${target === 'app' ? 'selected' : ''}>管理会计 — с напоминаниями, CRM и задачами</option>
      ${phoneCals.map((c) => `<option value="dev:${c.id}" ${target === 'dev:' + c.id ? 'selected' : ''}>Календарь телефона: ${esc(c.name)}${c.account && c.account !== c.name ? ' (' + esc(c.account) + ')' : ''}</option>`).join('')}
    </select></div>` : ''}
    <div class="field"><label>Название</label><input name="title" required value="${esc(e.title)}" placeholder="Встреча, звонок, дедлайн"></div>
    <div class="field"><label>Дата</label><input type="date" name="date" required value="${esc(e.start.slice(0, 10))}"></div>
    <div class="field-row">
      <div class="field"><label>Начало</label><input type="time" name="from" value="${esc(e.start.slice(11, 16) || '10:00')}"></div>
      <div class="field"><label>Конец</label><input type="time" name="to" value="${esc((e.end || '').slice(11, 16) || '')}"></div>
    </div>
    <label class="toggle"><input type="checkbox" name="allDay" ${e.allDay ? 'checked' : ''}><span class="grow">Весь день</span></label>
    <div class="app-only" ${target !== 'app' ? 'hidden' : ''}>
    <label class="toggle"><input type="checkbox" name="important" ${e.important ? 'checked' : ''}><span class="grow">Важное — звонить как будильник<small>Сигнал за ${D.settings.importantRemind.map((m) => m === 0 ? 'в момент начала' : humanMins(m)).join(', ')}; не замолкает до ручного отключения</small></span></label>
    <div class="field mt"><label>Обычное напоминание</label><select name="remind">${opts.map(([v, n]) => `<option value="${v}" ${rm === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Место</label><input name="location" value="${esc(e.location || '')}"></div>
    <div class="field"><label>Описание</label><textarea name="desc">${esc(e.desc || '')}</textarea></div>
    ${D.settings.deviceCalendarId ? `<label class="toggle app-only" ${target !== 'app' ? 'hidden' : ''}><input type="checkbox" name="syncDevice" ${e.syncDevice ? 'checked' : ''}><span class="grow">Также записать в календарь телефона</span></label>` : ''}
    <div class="form-actions"><button class="btn primary" type="submit">${icon('check')}Сохранить</button><button class="btn" type="button" data-a="sheet-back">Отмена</button></div>
  </form>`;
};

/* ---------- Событие календаря телефона: изменение ---------- */
function writableDeviceCalendars() {
  if (!CAL || !CAL.saveDeviceEvent) return [];
  try {
    const p = JSON.parse(CAL.permissions() || '{}');
    if (!p.calendar) return [];
    return JSON.parse(CAL.deviceCalendars() || '[]').filter((c) => c.writable);
  } catch (e) { return []; }
}
// Время для календаря телефона: «весь день» хранится в UTC-полночь, остальное — местное время
function deviceTimes(date, from, to, allDay) {
  if (allDay) { const s0 = utcDay(date); return { start: s0, end: s0 + 86400000 }; }
  const st = parseDT(date + 'T' + from);
  let en = parseDT(date + 'T' + to);
  if (!(en > st)) en = new Date(st.getTime() + 3600000);
  return { start: st.getTime(), end: en.getTime() };
}
SHEETS.devEventForm = function ({ preset }) {
  const ev = (preset || {}).ev;
  if (!ev) return sheetHead('Событие не найдено');
  const st = new Date(ev.begin), en = new Date(ev.end);
  const date = ev.allDay ? new Date(ev.begin).toISOString().slice(0, 10) : ymd(st);
  return sheetHead('Событие телефона') + `<form class="form" data-form="devevent">
    <div class="sub" style="margin-top:-6px"><i class="dot" style="background:${esc(ev.color || 'var(--muted)')}"></i> ${esc(ev.calendar || 'Календарь телефона')}</div>
    ${ev.recurring ? `<div class="field"><label>Повторяющееся событие — что изменить?</label>
      <label class="toggle"><input type="radio" name="scope" value="single" checked><span class="grow">Только это повторение<small>${esc(fmtDate(date, true))}</small></span></label>
      <label class="toggle mt"><input type="radio" name="scope" value="series"><span class="grow">Всю серию<small>Название, место и описание; время повторений не меняется</small></span></label></div>` : ''}
    <div class="field"><label>Название</label><input name="title" required value="${esc(ev.title || '')}"></div>
    <div class="dev-times">
      <div class="field"><label>Дата</label><input type="date" name="date" required value="${esc(date)}"></div>
      <div class="field-row">
        <div class="field"><label>Начало</label><input type="time" name="from" value="${ev.allDay ? '10:00' : esc(hm(st))}"></div>
        <div class="field"><label>Конец</label><input type="time" name="to" value="${ev.allDay ? '11:00' : esc(hm(en))}"></div>
      </div>
      <label class="toggle"><input type="checkbox" name="allDay" ${ev.allDay ? 'checked' : ''}><span class="grow">Весь день</span></label>
    </div>
    <div class="field"><label>Место</label><input name="location" value="${esc(ev.location || '')}"></div>
    <div class="field"><label>Описание</label><textarea name="desc">${esc(ev.description || '')}</textarea></div>
    <div class="sub">Изменения сразу сохраняются в календаре телефона${/google|huawei|icloud|exchange|@/i.test(ev.calendar || '') ? ' и синхронизируются с аккаунтом' : ''}.</div>
    <div class="form-actions"><button class="btn primary" type="submit">${icon('check')}Сохранить</button><button class="btn" type="button" data-a="sheet-back">Отмена</button>
      <button class="btn danger right" type="button" data-a="dev-delete">${icon('trash')}</button></div>
  </form>`;
};

/* ---------- Заметка ---------- */
SHEETS.note = function (entry) { return SHEETS.noteForm(entry); };
SHEETS.noteForm = function ({ id, preset }) {
  const p = preset || {};
  const n = id ? note(id) : { title: '', body: '', crmIds: p.crmId ? [p.crmId] : [], discussed: false };
  if (!n) return sheetHead('Заметка удалена');
  return sheetHead(id ? 'Заметка' : 'Новая заметка') + `<form class="form" data-form="note" data-id="${id || ''}">
    <div class="field"><label>Контакт</label><select name="crmId"><option value="">— без контакта —</option>${D.contacts.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((c) => `<option value="${c.id}" ${n.crmIds[0] === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Тема</label><input name="title" value="${esc(n.title || '')}" placeholder="О чём поговорить"></div>
    <div class="field"><label>Мысли, вопросы, договорённости</label>${rteField('body', n.html != null ? n.html : textToHtml(n.body || ''), 'Начните писать… Оформление — кнопками сверху')}</div>
    <label class="toggle"><input type="checkbox" name="discussed" ${n.discussed ? 'checked' : ''}><span class="grow">Обсуждено</span></label>
    <div class="form-actions"><button class="btn primary" type="submit">${icon('check')}Сохранить</button><button class="btn" type="button" data-a="sheet-back">Отмена</button>
    ${id ? `<button class="btn danger right" type="button" data-a="delete" data-type="note" data-id="${id}">${icon('trash')}</button>` : ''}</div>
  </form>`;
};

/* =========================================================
 * 8. Выбор связей (модальный список)
 * ======================================================= */
function pickerState(type, forType, forId, cand) {
  if (forType === 'task') {
    const t = task(forId);
    if (type === 'contact') return t.crmIds.includes(cand);
    if (type === 'event') return t.eventIds.includes(cand);
    if (type === 'dep') return t.deps.includes(cand);
  }
  if (forType === 'contact' && type === 'task') return task(cand).crmIds.includes(forId);
  if (forType === 'project' && type === 'ptask') return task(cand).projectId === forId;
  if (forType === 'event') {
    if (type === 'contact') return event(forId).crmIds.includes(cand);
    if (type === 'task') return task(cand).eventIds.includes(forId);
  }
  return false;
}
function toggleArr(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
function dependsOn(a, b, seen) { // зависит ли задача a (транзитивно) от b
  seen = seen || new Set();
  if (seen.has(a)) return false;
  seen.add(a);
  const t = task(a);
  return !!t && (t.deps.includes(b) || t.deps.some((d) => dependsOn(d, b, seen)));
}
function pickerToggle(type, forType, forId, cand) {
  if (forType === 'task') {
    const t = task(forId);
    if (type === 'contact') toggleArr(t.crmIds, cand);
    if (type === 'event') toggleArr(t.eventIds, cand);
    if (type === 'dep') {
      if (!t.deps.includes(cand) && dependsOn(cand, forId)) { toast('Нельзя: получится замкнутый круг зависимостей'); return; }
      toggleArr(t.deps, cand);
    }
  }
  if (forType === 'contact' && type === 'task') toggleArr(task(cand).crmIds, forId);
  if (forType === 'project' && type === 'ptask') { const t = task(cand); t.projectId = t.projectId === forId ? null : forId; t.updatedAt = new Date().toISOString(); }
  if (forType === 'event') {
    if (type === 'contact') toggleArr(event(forId).crmIds, cand);
    if (type === 'task') toggleArr(task(cand).eventIds, forId);
  }
  save();
}
function renderPicker() {
  const p = ui.picker;
  if (!p) return modal(null);
  const q = (p.q || '').toLowerCase();
  let items = [];
  if (p.type === 'contact') items = D.contacts.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((c) => ({ id: c.id, t: c.name, s: c.company || '' }));
  if (p.type === 'task' || p.type === 'dep') items = D.tasks.filter((t) => t.id !== p.forId && (!isDone(t) || pickerState(p.type, p.forType, p.forId, t.id))).sort(sortByDue).map((t) => ({ id: t.id, t: t.title, s: [t.assignee, t.due ? fmtDate(t.due) : ''].filter(Boolean).join(' · ') }));
  if (p.type === 'ptask') items = D.tasks.filter((t) => !isDone(t) || t.projectId === p.forId).sort(sortByDue).map((t) => ({ id: t.id, t: t.title, s: [t.projectId && t.projectId !== p.forId ? 'сейчас в: ' + ((project(t.projectId) || {}).name || '') : '', t.assignee, t.due ? fmtDate(t.due) : ''].filter(Boolean).join(' · ') }));
  if (p.type === 'event') items = D.events.slice().sort((a, b) => a.start < b.start ? 1 : -1).map((e) => ({ id: e.id, t: e.title, s: fmtDate(e.start.slice(0, 10)) + (e.allDay ? '' : ' ' + e.start.slice(11, 16)) }));
  items = items.filter((x) => !q || (x.t + ' ' + x.s).toLowerCase().includes(q));
  const title = { contact: 'Привязать контакт', task: 'Привязать задачу', event: 'Привязать событие', dep: 'Сначала нужно выполнить', ptask: 'Задачи проекта' }[p.type];
  modal(`<div class="row"><h3 class="grow" style="margin:0">${title}</h3><button class="btn sm primary" data-a="modal-close">Готово</button></div>
    ${searchBox('pickerQ', 'Поиск', p.q || '', 'mt')}
    <div class="list mt">${items.map((x) => {
      const on = pickerState(p.type, p.forType, p.forId, x.id);
      return `<div class="item" data-a="picker-toggle" data-id="${x.id}"><span class="check ${on ? 'on' : ''}">${on ? icon('check') : ''}</span><div class="grow"><div class="t">${esc(x.t)}</div>${x.s ? `<div class="s">${esc(x.s)}</div>` : ''}</div></div>`;
    }).join('') || '<div class="empty">Ничего нет</div>'}</div>`);
  const inp = $('#modal [data-input="pickerQ"]');
  if (inp && p.focus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}

/* =========================================================
 * 9. Сохранение форм
 * ======================================================= */
function submitForm(form) {
  const kind = form.dataset.form;
  const id = form.dataset.id;
  const f = new FormData(form);
  const g = (k) => (f.get(k) || '').toString().trim();
  const now = new Date().toISOString();
  const top = ui.stack[ui.stack.length - 1] || {};
  const preset = top.preset || {};
  let saved;

  if (kind === 'task') {
    let assignee = g('assignee');
    if (g('assigneeNew')) {
      assignee = g('assigneeNew');
      if (!D.settings.people.includes(assignee)) D.settings.people.push(assignee);
    }
    let projectId = g('projectId') || null;
    if (g('projectNew')) {
      const ex = D.projects.find((p) => p.name.toLowerCase() === g('projectNew').toLowerCase());
      if (ex) projectId = ex.id;
      else { const np = { id: uid('p'), name: g('projectNew'), color: PROJECT_COLORS[D.projects.length % PROJECT_COLORS.length], desc: '', archived: false, createdAt: now, updatedAt: now }; D.projects.push(np); projectId = np.id; }
    }
    const data = { title: g('title'), projectId, assignee, status: g('status') || 'todo', start: g('start'), due: g('due'), parentId: g('parentId') || null, remindAt: g('remindAt'), important: f.get('important') === 'on', desc: g('desc') };
    if (data.start && data.due && data.start > data.due) { toast('Начало позже срока — поменял местами'); [data.start, data.due] = [data.due, data.start]; }
    if (id) { Object.assign(task(id), data, { updatedAt: now }); saved = task(id); }
    else {
      saved = Object.assign({ id: uid('t'), crmIds: (preset.crmIds || []).slice(), eventIds: (preset.eventIds || []).slice(), deps: [], createdAt: now, updatedAt: now }, data);
      if (data.status === 'done') saved.doneAt = now;
      D.tasks.push(saved);
    }
    finishForm('task', saved.id, !id);
  } else if (kind === 'project') {
    let category = g('category');
    if (g('categoryNew')) {
      category = g('categoryNew');
      const ex = projectCategories().find((c) => c.toLowerCase() === category.toLowerCase());
      if (ex) category = ex; else D.settings.projectCategories.push(category);
    }
    const data = { name: g('name'), category, color: g('color') || PROJECT_COLORS[0], desc: g('desc'), ownerId: D.settings.people.includes(g('ownerId')) ? g('ownerId') : null };
    if (id) data.archived = f.get('archived') === 'on';
    if (id) { Object.assign(project(id), data, { updatedAt: now }); saved = project(id); }
    else { saved = Object.assign({ id: uid('p'), archived: false, createdAt: now, updatedAt: now }, data); D.projects.push(saved); }
    finishForm('project', saved.id, !id);
  } else if (kind === 'contact') {
    const data = { name: g('name'), company: g('company'), role: g('role'), phone: g('phone'), email: g('email'), nextContact: g('nextContact'), remind: f.get('remind') === 'on', tags: g('tags').split(',').map((x) => x.trim()).filter(Boolean), comment: g('comment'),
      birthday: g('birthday'), contacts: g('contacts'), photo: g('photo'), types: f.getAll('types'), statuses: f.getAll('statuses') };
    if (id) { Object.assign(contact(id), data, { updatedAt: now }); saved = contact(id); }
    else { saved = Object.assign({ id: uid('c'), createdAt: now, updatedAt: now }, data); D.contacts.push(saved); }
    finishForm('contact', saved.id, !id);
  } else if (kind === 'event' && g('target').startsWith('dev:')) {
    // Новое событие сразу в календарь телефона
    const calendarId = Number(g('target').slice(4));
    const allDay = f.get('allDay') === 'on';
    const tm = deviceTimes(g('date'), g('from') || '10:00', g('to'), allDay);
    const res = CAL.saveDeviceEvent(JSON.stringify(Object.assign({ mode: 'new', calendarId, title: g('title'), description: g('desc'), location: g('location'), allDay }, tm)));
    if (!(res > 0)) { toast('Не удалось записать в календарь телефона'); return; }
    D.settings.newEventTarget = g('target');
    clearDraft();
    save();
    ui.stack.pop();
    loadDeviceEvents();
    render();
    toast('Событие добавлено в календарь телефона');
    return;
  } else if (kind === 'devevent') {
    const ev = (top.preset || {}).ev;
    if (!ev) return;
    const allDay = f.get('allDay') === 'on';
    const scope = ev.recurring ? (g('scope') || 'single') : 'event';
    const tm = deviceTimes(g('date'), g('from') || '10:00', g('to'), allDay);
    const res = CAL.saveDeviceEvent(JSON.stringify(Object.assign({ mode: scope, eventId: ev.eventId, originalBegin: ev.begin, title: g('title'), description: g('desc'), location: g('location'), allDay }, tm)));
    if (!(res > 0)) { toast('Не удалось сохранить: календарь не разрешает изменения'); return; }
    clearDraft();
    ui.stack.pop();
    loadDeviceEvents();
    render();
    toast(scope === 'series' ? 'Серия изменена' : 'Событие изменено');
    return;
  } else if (kind === 'event') {
    if (g('target') === 'app' && D.settings.newEventTarget !== 'app') D.settings.newEventTarget = 'app';
    const date = g('date');
    const allDay = f.get('allDay') === 'on';
    const from = g('from') || '10:00';
    let to = g('to');
    if (!to || to <= from) { const d = parseDT(date + 'T' + from); d.setHours(d.getHours() + 1); to = d.getDate() === parseDate(date).getDate() ? hm(d) : '23:59'; }
    const r = Number(g('remind'));
    const data = { title: g('title'), start: date + 'T' + (allDay ? '00:00' : from), end: date + 'T' + (allDay ? '23:59' : to), allDay, important: f.get('important') === 'on', remind: r >= 0 ? [r] : [], location: g('location'), desc: g('desc'), syncDevice: f.get('syncDevice') === 'on' };
    if (data.important) data.remind = [];
    if (id) { Object.assign(event(id), data, { updatedAt: now }); saved = event(id); }
    else {
      saved = Object.assign({ id: uid('e'), crmIds: (preset.crmIds || []).slice(), createdAt: now, updatedAt: now }, data);
      D.events.push(saved);
      if (preset.taskId && task(preset.taskId)) task(preset.taskId).eventIds.push(saved.id);
    }
    pushToDevice(saved);
    finishForm('event', saved.id, !id);
  } else if (kind === 'note') {
    const ed = $('[data-rte="body"]', form);
    const html = sanitizeHtml(ed ? ed.innerHTML : '');
    // html — оформление; body — простой текст (поиск, сводка, совместимость со старыми версиями)
    const data = { title: g('title'), html, body: htmlToText(html), crmIds: g('crmId') ? [g('crmId')] : [], discussed: f.get('discussed') === 'on' };
    if (!data.title && !data.body.trim()) { toast('Заметка пустая'); return; }
    if (id) Object.assign(note(id), data, { updatedAt: now });
    else D.notes.push(Object.assign({ id: uid('n'), createdAt: now, updatedAt: now }, data));
    clearDraft();
    save();
    toast('Заметка сохранена');
    closeSheet();
    render();
  }
}
function finishForm(type, id, created) {
  clearDraft();
  save();
  ui.stack.pop();
  if (created) ui.stack.push({ type, id });
  // на узком экране после создания открываем карточку; если пришли из другой карточки — возвращаемся к ней
  render();
  toast('Сохранено');
}
function utcDay(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); }
function pushToDevice(e) {
  if (!CAL || !e.syncDevice || !D.settings.deviceCalendarId) return;
  try {
    const res = CAL.upsertDeviceEvent(JSON.stringify({
      deviceId: e.deviceId || -1, calendarId: Number(D.settings.deviceCalendarId), title: e.title, description: e.desc || '', location: e.location || '',
      start: e.allDay ? utcDay(e.start) : parseDT(e.start).getTime(),
      end: e.allDay ? utcDay(e.start) + 86400000 : parseDT(e.end || e.start).getTime(), allDay: !!e.allDay,
    }));
    if (res > 0) e.deviceId = res; else toast('Не удалось записать в календарь телефона');
  } catch (er) { /* */ }
}

/* =========================================================
 * 10. Обработка действий
 * ======================================================= */
const ACTIONS = {
  tab: (el) => go(el.dataset.id),
  open: (el) => openSheet(el.dataset.type, el.dataset.id),
  'sheet-back': () => closeSheet(),
  'sheet-close': () => closeAll(),
  'modal-close': () => { ui.picker = null; modal(null); renderSheet(); if (!ui.stack.length) render(); },
  'confirm-yes': () => { const f = ui.onConfirm; ui.onConfirm = null; modal(null); if (f) f(); },
  'home-filter': (el) => { ui.homeFilter = el.dataset.id && ui.homeFilter !== el.dataset.id ? el.dataset.id : null; render(); },
  'crm-filter': (el) => { ui.crmFilter = el.dataset.id; render(); },
  'crm-csv': () => {
    const shown = crmFiltered().length, all = D.contacts.length;
    const filtered = shown !== all;
    const sep = D.settings.csvSep === ',' ? ',' : ';';
    modal(`<h3>Выгрузить карточки CRM в CSV</h3>
      <div class="form">
        ${filtered ? `<label class="toggle"><input type="radio" name="csv-scope" value="shown" checked><span class="grow">Только показанные — ${shown}<small>С учётом поиска и фильтров на экране CRM</small></span></label>` : ''}
        <label class="toggle"><input type="radio" name="csv-scope" value="all" ${filtered ? '' : 'checked'}><span class="grow">Все карточки — ${all}</span></label>
        <div class="field"><label>Разделитель</label><select id="csv-sep">
          <option value=";" ${sep === ';' ? 'selected' : ''}>Точка с запятой — для Excel</option>
          <option value="," ${sep === ',' ? 'selected' : ''}>Запятая — для Google Таблиц и Numbers</option></select></div>
        <div class="sub">Кодировка UTF-8. Колонки: имя, компания, должность, телефон, почта, контакты, дата рождения, тип, статус, теги, следующий контакт, комментарий, проекты и открытые задачи. Файл можно загрузить обратно через импорт.</div>
      </div>
      <div class="form-actions mt"><button class="btn primary" data-a="crm-csv-do">${icon('share')}Выгрузить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
  },
  'crm-csv-do': () => {
    const scope = ($('input[name=csv-scope]:checked') || {}).value || 'all';
    const sep = ($('#csv-sep') || {}).value === ',' ? ',' : ';';
    if (D.settings.csvSep !== sep) { D.settings.csvSep = sep; save(); }
    const list = scope === 'shown' ? crmFiltered() : D.contacts.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    modal(null);
    saveTextFile(crmCsv(list, sep), `管理会计-CRM-${today()}.csv`, 'text/csv', 'csv');
  },
  'clear-input': (el) => {
    const k = el.dataset.id;
    if (k === 'pickerQ') { ui.picker.q = ''; ui.picker.focus = true; renderPicker(); return; }
    ui[k] = '';
    clearTimeout(ui.inputTimer);
    render();
    const inp = $(`[data-input="${k}"]`);
    if (inp) inp.focus();
  },
  'msel-toggle': (el) => {
    const pop = $('.msel-pop', el.closest('.msel'));
    const open = pop.hidden;
    $$('.msel-pop').forEach((p) => { p.hidden = true; });
    pop.hidden = !open;
  },
  'msel-add': (el) => {
    const box = el.closest('.msel');
    const inp = $('[data-msel-new]', box);
    const v = inp.value.trim();
    if (!v) return;
    const key = box.dataset.msel === 'types' ? 'contactTypes' : 'contactStatuses';
    if (!D.settings[key].includes(v)) D.settings[key].push(v);
    const name = box.dataset.msel;
    const ex = $$('input[type=checkbox]', box).find((x) => x.value === v);
    if (ex) ex.checked = true;
    else inp.parentElement.insertAdjacentHTML('beforebegin', `<label class="msel-opt"><input type="checkbox" name="${name}" value="${esc(v)}" checked><span>${esc(v)}</span></label>`);
    inp.value = '';
    mselRefresh(box);
  },
  set: (el) => { D.settings[el.dataset.key] = el.dataset.val; save(); render(); },
  'set-bool': (el) => { D.settings[el.dataset.key] = el.checked; save(); if (el.dataset.key === 'showDeviceEvents') loadDeviceEvents(); render(); },
  'toggle-done': (el) => { ui.showDone = el.checked; render(); },
  new: (el) => {
    let preset = {};
    try { preset = JSON.parse(el.dataset.preset || '{}'); } catch (e) { /* */ }
    openSheet(el.dataset.type, null, { edit: true, preset });
  },
  edit: (el) => openSheet(el.dataset.type, el.dataset.id, { edit: true }),
  delete: (el) => {
    const { type, id } = el.dataset;
    const names = { task: 'задачу', contact: 'карточку контакта', event: 'событие', note: 'заметку', project: 'проект' };
    let extra = '';
    if (type === 'task' && subtasks(id).length) extra = ' Подзадачи останутся самостоятельными задачами.';
    if (type === 'project' && tasksOfProject(id).length) extra = ' Задачи проекта сохранятся — просто без проекта.';
    confirmBox(`Удалить ${names[type]}?${extra}`, () => {
      if (type === 'task') removeTask(id);
      if (type === 'contact') removeContact(id);
      if (type === 'event') removeEvent(id);
      if (type === 'note') D.notes = D.notes.filter((n) => n.id !== id);
      let pruned = 0;
      if (type === 'project') { removeProject(id); if (ui.tfProject === id) ui.tfProject = ''; pruned = pruneMaps(D); }
      save();
      ui.stack = ui.stack.filter((s) => s.id !== id);
      render();
      toast('Удалено' + (pruned ? `; с карт убрано узлов: ${pruned}` : ''));
    });
  },
  'toggle-task': (el) => {
    const t = task(el.dataset.id);
    t.status = isDone(t) ? 'todo' : 'done';
    t.doneAt = isDone(t) ? new Date().toISOString() : null;
    t.updatedAt = new Date().toISOString();
    save();
    render();
  },
  'task-status': (el) => { const t = task(el.dataset.id); t.status = el.dataset.val; t.updatedAt = new Date().toISOString(); save(); render(); },
  pick: (el) => { ui.picker = { type: el.dataset.type, forType: el.dataset.for, forId: el.dataset.id, q: '' }; renderPicker(); },
  'picker-toggle': (el) => { const p = ui.picker; pickerToggle(p.type, p.forType, p.forId, el.dataset.id); renderPicker(); renderSheet(); },
  'event-important': (el) => { const e = event(el.dataset.id); e.important = el.checked; if (e.important) e.remind = []; else e.remind = [D.settings.defaultRemind]; save(); renderSheet(); toast(e.important ? 'Будет звонить как будильник' : 'Обычное напоминание'); },
  contacted: (el) => {
    const c = contact(el.dataset.id);
    c.lastContact = today();
    c.nextContact = '';
    c.updatedAt = new Date().toISOString();
    save(); render(); toast('Отмечено: связался. Новую дату можно назначить кнопками ниже');
  },
  'next-contact': (el) => {
    const c = contact(el.dataset.id);
    c.nextContact = ymd(addDays(new Date(), Number(el.dataset.val)));
    c.updatedAt = new Date().toISOString();
    save(); render(); toast(Number(el.dataset.val) === 0 ? 'Связаться сегодня' : 'Связаться завтра');
  },
  'contact-date': (el) => {
    const c = contact(el.dataset.id);
    const def = c.nextContact && c.nextContact > today() ? c.nextContact : ymd(addDays(new Date(), 2));
    modal(`<h3>Когда связаться: ${esc(c.name)}</h3>
      <input type="date" class="search" id="contact-date-inp" min="${today()}" value="${def}">
      <div class="row mt">${[[2, 'Послезавтра'], [7, 'Через неделю'], [14, 'Через 2 недели'], [30, 'Через месяц']].map(([n, l]) => `<button class="btn sm" data-a="contact-date-quick" data-val="${n}">${l}</button>`).join('')}</div>
      <div class="form-actions mt"><button class="btn primary" data-a="contact-date-save" data-id="${c.id}">${icon('check')}Сохранить</button>${c.nextContact ? `<button class="btn" data-a="contact-date-clear" data-id="${c.id}">Убрать дату</button>` : ''}<button class="btn" data-a="modal-close">Отмена</button></div>`);
    const inp = $('#contact-date-inp');
    try { if (inp && inp.showPicker) inp.showPicker(); } catch (e) { /* */ }
  },
  'contact-date-quick': (el) => { $('#contact-date-inp').value = ymd(addDays(new Date(), Number(el.dataset.val))); },
  'contact-date-save': (el) => {
    const v = $('#contact-date-inp').value;
    if (!v) { toast('Выберите дату'); return; }
    const c = contact(el.dataset.id);
    c.nextContact = v; c.updatedAt = new Date().toISOString();
    save(); modal(null); render(); toast('Связаться: ' + fmtDate(v, true));
  },
  'contact-date-clear': (el) => { const c = contact(el.dataset.id); c.nextContact = ''; save(); modal(null); render(); toast('Дата снята'); },
  'tasks-filter': (el) => {
    ['tfCrm', 'tfPerson', 'tfStatus', 'tfDue'].forEach((k) => { ui[k] = ''; });
    ui.tfProject = el.dataset.id || '';
    go('tasks');
  },
  'k-order': () => { ui.kOrder = !ui.kOrder; render(); },
  'k-order-reset': () => { if (D.settings.kanbanOrder) delete D.settings.kanbanOrder[D.settings.kanbanGroup]; save(); render(); toast('Порядок колонок сброшен'); },
  'k-move': (el) => {
    const board = el.closest('.board');
    const ids = JSON.parse(board.dataset.ids || '[]');
    moveColumn(D.settings.kanbanGroup, ids, el.dataset.id, Number(el.dataset.val));
  },
  'tf-reset': () => { ['tfProject', 'tfCrm', 'tfPerson', 'tfStatus', 'tfDue'].forEach((k) => { ui[k] = ''; }); render(); },
  'proj-arch': (el) => { ui.projArchived = el.dataset.id === '1'; render(); },
  'cal-sel': (el) => {
    if (ui.cal.sel === el.dataset.id && calView() === 'month' && window.innerWidth < 600) { ACTIONS['cal-goday'](el); return; } // повторное нажатие — открыть день
    const reload = el.dataset.id.slice(0, 7) !== ui.cal.month;
    setCalDay(el.dataset.id); if (reload) loadDeviceEvents(); render();
  },
  'cal-view': (el) => { D.settings.calView = el.dataset.id; save(); loadDeviceEvents(); render(); },
  'cal-goday': (el) => { setCalDay(el.dataset.id); D.settings.calView = 'day'; save(); loadDeviceEvents(); render(); },
  'cal-gomonth': (el) => { setCalDay(el.dataset.id + '-01'); D.settings.calView = 'month'; save(); loadDeviceEvents(); render(); },
  'cal-nav': (el) => {
    const n = Number(el.dataset.id), v = calView(), d = parseDate(ui.cal.sel);
    let nd;
    if (v === 'day') nd = addDays(d, n);
    else if (v === 'week') nd = addDays(d, 7 * n);
    else if (v === 'year') nd = new Date(d.getFullYear() + n, d.getMonth(), Math.min(d.getDate(), 28));
    else { const [y, m] = ui.cal.month.split('-').map(Number); nd = new Date(y, m - 1 + n, 1); const last = new Date(y, m + n, 0).getDate(); nd.setDate(Math.min(d.getDate(), last)); }
    setCalDay(ymd(nd));
    loadDeviceEvents();
    render();
  },
  'cal-today': () => { setCalDay(today()); loadDeviceEvents(); render(); },
  'dev-event': (el) => {
    const e = ui.devEvents.find((x) => String(x.eventId) === el.dataset.id && String(x.begin) === el.dataset.begin);
    if (!e) return;
    ui.devPick = e;
    const st = new Date(e.begin), en = new Date(e.end);
    modal(`<h3>${esc(e.title || '(без названия)')}</h3>
      <dl class="kv"><dt>Когда</dt><dd>${esc(fmtDate(ymd(st), true))}${e.allDay ? ', весь день' : ', ' + hm(st) + '–' + hm(en)}</dd>
      <dt>Календарь</dt><dd>${esc(e.calendar)}</dd>${e.location ? `<dt>Где</dt><dd>${esc(e.location)}</dd>` : ''}</dl>
      ${e.description ? `<div class="desc mt small">${esc(e.description)}</div>` : ''}
      ${e.recurring ? '<div class="sub mt">🔁 Повторяющееся событие</div>' : ''}
      <div class="sub mt">Событие из календаря телефона. ${e.writable && CAL && CAL.saveDeviceEvent ? 'Его можно изменить прямо здесь — изменения сохранятся в календаре телефона.' : 'Этот календарь только для чтения.'} Добавьте событие в приложение, чтобы привязать к задачам и CRM и включить будильник.</div>
      <div class="form-actions mt">
        ${e.writable && CAL && CAL.saveDeviceEvent ? `<button class="btn primary" data-a="dev-edit">${icon('edit')}Изменить</button>` : ''}
        <button class="btn ${e.writable ? '' : 'primary'}" data-a="dev-adopt">${icon('link')}В приложение</button>
        ${e.writable && CAL && CAL.saveDeviceEvent ? `<button class="btn danger" data-a="dev-delete">${icon('trash')}</button>` : ''}
        <button class="btn" data-a="modal-close">Закрыть</button></div>`);
  },
  'dev-edit': () => { const e = ui.devPick; if (!e) return; modal(null); openSheet('devEvent', null, { edit: true, preset: { ev: e } }); },
  'dev-delete': () => {
    const top = ui.stack[ui.stack.length - 1];
    const e = (top && top.type === 'devEvent' && top.preset && top.preset.ev) || ui.devPick;
    if (!e) return;
    ui.devPick = e;
    if (e.recurring) {
      modal(`<h3>Удалить повторяющееся событие?</h3><div class="sub">«${esc(e.title || '')}» — ${esc(fmtDate(ymd(new Date(e.begin)), true))}</div>
        <div class="form-actions mt"><button class="btn danger" data-a="dev-delete-do" data-id="single">Только это</button><button class="btn danger" data-a="dev-delete-do" data-id="series">Всю серию</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
    } else {
      modal(`<h3>Удалить событие «${esc(e.title || '')}» из календаря телефона?</h3>
        <div class="form-actions"><button class="btn danger" data-a="dev-delete-do" data-id="event">Удалить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
    }
  },
  'dev-delete-do': (el) => {
    const e = ui.devPick;
    if (!e) return;
    const ok = CAL.deleteDeviceEventEx(e.eventId, el.dataset.id, e.begin);
    modal(null);
    if (!ok) { toast('Не удалось удалить'); return; }
    ui.stack = ui.stack.filter((x) => x.type !== 'devEvent');
    clearDraft();
    loadDeviceEvents();
    render();
    toast(el.dataset.id === 'series' ? 'Серия удалена' : 'Событие удалено');
  },
  'dev-adopt': () => {
    const e = ui.devPick;
    if (!e) return;
    const st = new Date(e.begin), en = new Date(e.end);
    const dayStr = e.allDay ? new Date(e.begin).toISOString().slice(0, 10) : ymd(st);
    const ev = { id: uid('e'), title: e.title || 'Событие', start: dayStr + 'T' + (e.allDay ? '00:00' : hm(st)), end: (e.allDay ? dayStr : ymd(en)) + 'T' + (e.allDay ? '23:59' : hm(en)), allDay: !!e.allDay, location: e.location || '', desc: e.description || '', important: false, remind: [D.settings.defaultRemind], crmIds: [], deviceId: e.eventId, syncDevice: false, createdAt: new Date().toISOString() };
    D.events.push(ev);
    save();
    modal(null);
    loadDeviceEvents();
    openSheet('event', ev.id);
    render();
  },
  'new-menu': () => modal(`<h3>Создать</h3><div class="list">
      <div class="item" data-a="new-close" data-type="task">${icon('tasks')}<div class="t">Задача</div></div>
      <div class="item" data-a="new-close" data-type="project">${icon('folder')}<div class="t">Проект</div></div>
      <div class="item" data-a="new-close" data-type="event">${icon('cal')}<div class="t">Событие</div></div>
      <div class="item" data-a="new-close" data-type="contact">${icon('crm')}<div class="t">Контакт CRM</div></div>
      <div class="item" data-a="new-close" data-type="note">${icon('notes')}<div class="t">Заметка</div></div></div>`),
  'new-close': (el) => { modal(null); openSheet(el.dataset.type, null, { edit: true, preset: el.dataset.type === 'event' ? { date: today() } : {} }); },
  'quick-summary': () => copyText(buildSummary()),
  'summary-copy': () => copyText(buildSummary({ person: ui.summaryPerson || '' })),
  'summary-share': () => { const t = buildSummary({ person: ui.summaryPerson || '' }); if (N) N.shareText(t); else if (navigator.share) navigator.share({ text: t }); else copyText(t); },
  'summary-opt': (el) => { const s = D.settings.summary; s[el.dataset.id] = !s[el.dataset.id]; save(); render(); },
  'pcat-add': () => {
    const v = ($('#new-pcat').value || '').trim();
    if (!v) return;
    if (!projectCategories().some((c) => c.toLowerCase() === v.toLowerCase())) D.settings.projectCategories.push(v);
    save(); render(); toast('Категория добавлена');
  },
  'pcat-del': (el) => {
    const c = el.dataset.id;
    const n = D.projects.filter((p) => p.category === c).length;
    confirmBox(`Удалить категорию «${c}»?${n ? ' ' + n + ' ' + plural(n, 'проект останется', 'проекта останутся', 'проектов останутся') + ' без категории.' : ''}`, () => {
      D.settings.projectCategories = D.settings.projectCategories.filter((x) => x !== c);
      D.projects.forEach((p) => { if (p.category === c) p.category = ''; });
      if (ui.projCat === c) ui.projCat = '';
      save(); render();
    });
  },
  'pcat-rename': (el) => {
    const c = el.dataset.id;
    ui.pcatOld = c;
    modal(`<h3>Переименовать категорию</h3><input class="search" id="pcat-new-name" value="${esc(c)}">
      <div class="form-actions mt"><button class="btn primary" data-a="pcat-rename-save">${icon('check')}Сохранить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
  },
  'pcat-rename-save': () => {
    const old = ui.pcatOld, v = ($('#pcat-new-name').value || '').trim();
    if (!v || v === old) { modal(null); return; }
    D.settings.projectCategories = Array.from(new Set(D.settings.projectCategories.map((x) => (x === old ? v : x)).concat(projectCategories().includes(old) && !D.settings.projectCategories.includes(old) ? [v] : [])));
    D.projects.forEach((p) => { if (p.category === old) p.category = v; });
    if (ui.projCat === old) ui.projCat = v;
    save(); modal(null); render(); toast('Категория переименована');
  },
  'person-add': () => {
    const v = ($('#new-person').value || '').trim();
    if (!v) return;
    if (!D.settings.people.includes(v)) D.settings.people.push(v);
    save(); render();
  },
  'person-del': (el) => {
    const p = el.dataset.id;
    D.settings.people = D.settings.people.filter((x) => x !== p);
    const owned = D.projects.filter((x) => x.ownerId === p);
    owned.forEach((x) => { x.ownerId = null; });
    const n = pruneMaps(D);
    save(); render();
    toast('Задачи исполнителя «' + p + '» сохранены' + (owned.length ? `; у проектов (${owned.length}) снят ответственный` : '') + (n ? `; с карт убрано узлов: ${n}` : ''));
  },
  'test-alarm': (el) => { if (N) { N.testAlarm(el.dataset.id === '1'); toast('Сигнал прозвучит через 5 секунд — можно заблокировать экран'); } else toast('Доступно на телефоне'); },
  perm: (el) => { if (N) N.requestPermission(el.dataset.id); },
  'diag-toggle': () => { ui.diagOpen = !ui.diagOpen; if (ui.diagOpen && !ui.diagData) loadDiag(); render(); },
  'diag-refresh': () => { if (CAL && CAL.resetCache) CAL.resetCache(); loadDiag(); render(); },
  'diag-clean': () => {
    const stale = (ui.diagData && ui.diagData.staleFilter) || [];
    D.settings.showDeviceCalendars = (D.settings.showDeviceCalendars || []).filter((x) => !stale.includes(String(x)));
    save(true); loadDiag(); render(); toast('Фильтр календарей очищен');
  },
  'diag-find': () => {
    const q = (($('#diag-q') || {}).value || '').trim();
    ui.diagQ = q;
    if (!q) { ui.diagFind = null; render(); return; }
    const [from, to] = calRange();
    try { ui.diagFind = JSON.parse(CAL.findDeviceEvents(q, from, to) || '{}'); } catch (e) { ui.diagFind = { query: q, errors: { find: String(e) } }; }
    render();
  },
  'diag-goto': (el) => { setCalDay(el.dataset.id); D.settings.calView = 'day'; save(); go('calendar'); },
  'devcal-toggle': (el) => { toggleArr(D.settings.showDeviceCalendars, String(el.dataset.id)); save(); if (ui.diagOpen) loadDiag(); render(); },
  'snapshot-now': () => { if (CAL && CAL.snapshotNow()) { toast('Снимок календаря сохранён'); render(); } else toast('Нет доступа к календарю'); },
  'snapshot-open': (el) => {
    let snap;
    try { snap = JSON.parse(CAL.readSnapshot(el.dataset.id)); } catch (e) { toast('Не удалось открыть снимок'); return; }
    ui.snap = snap;
    const evs = (snap.events || []).filter((e) => e.end >= Date.now() - 86400000).slice(0, 300);
    modal(`<h3>Снимок календаря от ${esc(new Date(snap.created).toLocaleString('ru-RU'))}</h3>
      <div class="sub">${(snap.events || []).length} событий. Если события пропали из календаря телефона, их можно восстановить в приложение.</div>
      <div class="form-actions mt"><button class="btn primary" data-a="snapshot-restore">Восстановить будущие события в приложение</button><button class="btn" data-a="modal-close">Закрыть</button></div>
      <div class="list mt">${evs.map((e) => `<div class="item"><div class="ev-time">${esc(fmtShort(ymd(new Date(e.begin))))}<br>${e.allDay ? '' : esc(hm(new Date(e.begin)))}</div><div class="grow"><div class="t">${esc(e.title)}</div><div class="s">${esc(e.calendar)}</div></div></div>`).join('') || '<div class="empty">Будущих событий нет</div>'}</div>`);
  },
  'snapshot-restore': () => {
    const snap = ui.snap;
    if (!snap) return;
    const have = new Set(D.events.map((e) => e.title + '|' + e.start));
    let n = 0;
    (snap.events || []).filter((e) => e.begin >= Date.now() - 3600000).forEach((e) => {
      const st = new Date(e.begin), en = new Date(e.end);
      const dayStr = e.allDay ? new Date(e.begin).toISOString().slice(0, 10) : ymd(st);
      const start = dayStr + 'T' + (e.allDay ? '00:00' : hm(st));
      if (have.has((e.title || 'Событие') + '|' + start)) return;
      D.events.push({ id: uid('e'), title: e.title || 'Событие', start, end: (e.allDay ? dayStr : ymd(en)) + 'T' + (e.allDay ? '23:59' : hm(en)), allDay: !!e.allDay, location: e.location || '', desc: e.description || '', important: false, remind: [D.settings.defaultRemind], crmIds: [], restoredFrom: 'snapshot', createdAt: new Date().toISOString() });
      n++;
    });
    save(); modal(null); render();
    toast('Восстановлено событий: ' + n);
  },
  'folder-pick': () => { if (N) N.folderBackupPick(); },
  'folder-now': () => { save(true); toast(N.folderBackupNow() ? 'Копия сохранена в папку' : 'Не удалось сохранить — проверьте папку'); render(); },
  'folder-off': () => confirmBox('Выключить ежедневную копию в папку? Уже сохранённые файлы останутся.', () => { N.folderBackupClear(); render(); toast('Копия в папку выключена'); }, 'Выключить'),
  'backup-export': () => {
    const name = '管理会计-копия-' + today() + '.json';
    const txt = JSON.stringify(makeBackup(), null, 1);
    saveTextFile(txt, name, 'application/json', 'backup');
  },
  'backup-import': () => {
    if (N) { N.importFile(); return; }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => { const r = new FileReader(); r.onload = () => window.__native('imported', r.result); r.readAsText(inp.files[0]); };
    inp.click();
  },
  'backup-now': () => { save(true); if (N.backupNow()) { toast('Копия создана'); render(); } },
  'backup-restore': (el) => {
    const name = el.dataset.id;
    confirmBox(`Восстановить данные из копии ${name.replace('auto-', '').replace('.json', '')}? Текущие данные будут заменены.`, () => restoreFrom(N.readBackup(name)), 'Восстановить');
  },
  demo: () => confirmBox('Добавить пример задач, контактов и событий? Существующие данные сохранятся.', () => { addDemo(); save(); render(); toast('Пример добавлен'); }, 'Добавить'),
  wipe: () => confirmBox('Удалить ВСЕ данные приложения? Перед удалением будет создана автокопия.', () => {
    if (N) try { N.backupNow(); } catch (e) { /* */ }
    const keep = D.settings;
    D = emptyData();
    D.settings = keep;
    save(true); render(); toast('Данные удалены');
  }, 'Удалить всё'),
};

document.addEventListener('click', (ev) => {
  if (!ev.target.closest('.msel')) $$('.msel-pop').forEach((p) => { p.hidden = true; });
}, true);
document.addEventListener('change', (ev) => {
  if (!ev.target.matches || !ev.target.matches('[data-ev-target]')) return;
  const isApp = ev.target.value === 'app';
  $$('.app-only', ev.target.closest('form')).forEach((x) => { x.hidden = !isApp; });
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'diag-q') { ev.preventDefault(); ACTIONS['diag-find'](); return; }
  if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('[data-msel-new]')) { ev.preventDefault(); ACTIONS['msel-add'](ev.target); }
});
document.addEventListener('change', (ev) => {
  if (ev.target.matches && ev.target.matches('[data-a="folder-keep"]')) { N.folderBackupKeep(Number(ev.target.value)); toast('Сохранено'); return; }
  const box = ev.target.closest && ev.target.closest('.msel');
  if (box && ev.target.type === 'checkbox') mselRefresh(box);
});
document.addEventListener('click', (ev) => {
  if (ev.target.closest('#modal') && ev.target.id === 'modal') { ACTIONS['modal-close'](); return; }
  const el = ev.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a;
  if (el.tagName === 'INPUT' && el.type === 'checkbox' && !['toggle-done', 'set-bool', 'event-important'].includes(a)) return;
  if (el.tagName === 'A') ev.preventDefault();
  if (a === 'toggle-task' || a === 'picker-toggle') ev.stopPropagation();
  const fn = ACTIONS[a];
  if (fn) { fn(el, ev); }
});

/* Перетаскивание колонок канбана за ⠿ (мышь, палец, стилус) */
let colDrag = null;
document.addEventListener('pointerdown', (ev) => {
  const grip = ev.target.closest && ev.target.closest('.col-grip');
  if (!grip) return;
  const board = grip.closest('.board'), col = grip.closest('.col');
  if (!board || !col) return;
  ev.preventDefault();
  colDrag = { board, col, id: grip.dataset.grip, x0: ev.clientX, sl0: board.scrollLeft, pid: ev.pointerId, target: null };
  try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* */ }
  board.classList.add('dragging-col');
  col.classList.add('col-dragging');
});
document.addEventListener('pointermove', (ev) => {
  const d = colDrag;
  if (!d || ev.pointerId !== d.pid) return;
  ev.preventDefault();
  const br = d.board.getBoundingClientRect();
  // автопрокрутка у краёв
  if (ev.clientX > br.right - 40) d.board.scrollLeft += 14;
  else if (ev.clientX < br.left + 40) d.board.scrollLeft -= 14;
  const dx = ev.clientX - d.x0 + (d.board.scrollLeft - d.sl0);
  d.col.style.transform = `translateX(${dx}px)`;
  const cols = $$('.col', d.board).filter((c) => c !== d.col);
  let idx = cols.length;
  for (let i = 0; i < cols.length; i++) { const r = cols[i].getBoundingClientRect(); if (ev.clientX < r.left + r.width / 2) { idx = i; break; } }
  d.target = idx;
  cols.forEach((c, i) => { c.classList.toggle('drop-before', i === idx); c.classList.toggle('drop-after', idx === cols.length && i === cols.length - 1); });
}, { passive: false });
function endColDrag(ev) {
  const d = colDrag;
  if (!d || (ev && ev.pointerId !== d.pid)) return;
  colDrag = null;
  d.board.classList.remove('dragging-col');
  d.col.classList.remove('col-dragging');
  d.col.style.transform = '';
  $$('.col', d.board).forEach((c) => c.classList.remove('drop-before', 'drop-after'));
  if (d.target == null) return;
  const ids = JSON.parse(d.board.dataset.ids || '[]');
  if (d.target === ids.indexOf(d.id)) return; // на месте
  moveColumn(D.settings.kanbanGroup, ids, d.id, d.target);
}
document.addEventListener('pointerup', endColDrag);
document.addEventListener('pointercancel', endColDrag);

/* Свайп влево/вправо в календаре — следующий/предыдущий период */
let swipe = null;
document.addEventListener('touchstart', (ev) => {
  const el = ev.target.closest && ev.target.closest('.cal-swipe');
  swipe = el && ev.touches.length === 1 ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() } : null;
}, { passive: true });
document.addEventListener('touchend', (ev) => {
  if (!swipe || ui.tab !== 'calendar') return;
  const dx = ev.changedTouches[0].clientX - swipe.x, dy = ev.changedTouches[0].clientY - swipe.y;
  const fast = Date.now() - swipe.t < 600;
  swipe = null;
  if (fast && Math.abs(dx) > 70 && Math.abs(dy) < 50) ACTIONS['cal-nav']({ dataset: { id: dx < 0 ? '1' : '-1' } });
}, { passive: true });

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  submitForm(form);
});

document.addEventListener('input', (ev) => {
  if (ev.target.closest && ev.target.closest('#sheet form[data-form]')) storeDraft();
}, true);
document.addEventListener('change', (ev) => {
  if (ev.target.closest && ev.target.closest('#sheet form[data-form]')) storeDraft();
}, true);
document.addEventListener('input', (ev) => {
  const el = ev.target;
  const k = el.dataset.input;
  if (!k) return;
  if (k === 'pickerQ') { ui.picker.q = el.value; ui.picker.focus = true; renderPicker(); return; }
  const wrap = el.closest('.search-wrap');
  if (wrap && !!el.value !== !!$('.search-x', wrap)) {
    if (el.value) wrap.insertAdjacentHTML('beforeend', `<button type="button" class="search-x" data-a="clear-input" data-id="${k}" aria-label="Очистить">${icon('close')}</button>`);
    else $('.search-x', wrap).remove();
  }
  ui[k] = el.value;
  clearTimeout(ui.inputTimer);
  ui.inputTimer = setTimeout(() => {
    const pos = el.selectionStart;
    render();
    const again = $(`[data-input="${k}"]`);
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* */ } }
  }, 200);
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.change) { ui[el.dataset.change] = el.value; render(); return; }
  const k = el.dataset.setting;
  if (!k) return;
  if (k === 'defaultRemind') D.settings.defaultRemind = Math.max(0, Number(el.value) || 0);
  else if (k === 'importantRemind') D.settings.importantRemind = el.value.split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 0).sort((a, b) => b - a);
  else if (k === 'deviceCalendarId') D.settings.deviceCalendarId = el.value || null;
  else D.settings[k] = el.value;
  if (!D.settings.importantRemind.length) D.settings.importantRemind = [0];
  save();
  if (k === 'projectsSort') { render(); return; }
  toast('Сохранено');
});

/* =========================================================
 * 11. Пример данных
 * ======================================================= */
function addDemo() {
  const d = (n) => ymd(addDays(new Date(), n));
  const now = new Date().toISOString();
  ['Анна', 'Игорь'].forEach((p) => { if (!D.settings.people.includes(p)) D.settings.people.push(p); });
  const c1 = { id: uid('c'), name: 'Сергей Петров', company: 'ООО «Вектор»', role: 'Директор', phone: '+7 900 000-00-01', email: '', tags: ['клиент'], nextContact: d(-2), remind: true, comment: 'Обсуждаем поставку на 4 квартал', createdAt: now };
  const c2 = { id: uid('c'), name: 'Мария Иванова', company: 'Студия «Линия»', role: 'Арт-директор', phone: '', email: 'maria@example.com', tags: ['партнёр'], nextContact: d(0), remind: true, comment: '', createdAt: now };
  const c3 = { id: uid('c'), name: 'Олег Смирнов', company: 'Банк', role: 'Менеджер', phone: '', email: '', tags: [], nextContact: d(10), remind: true, comment: '', createdAt: now };
  D.contacts.push(c1, c2, c3);
  const e1 = { id: uid('e'), title: 'Встреча с Сергеем: договор', start: d(0) + 'T15:00', end: d(0) + 'T16:00', allDay: false, location: 'Офис', desc: '', important: true, remind: [], crmIds: [c1.id], createdAt: now };
  const e2 = { id: uid('e'), title: 'Созвон по макетам', start: d(1) + 'T11:00', end: d(1) + 'T11:30', allDay: false, location: '', desc: '', important: false, remind: [15], crmIds: [c2.id], createdAt: now };
  D.events.push(e1, e2);
  const t = (o) => Object.assign({ id: uid('t'), desc: '', assignee: D.settings.me, status: 'todo', start: '', due: '', crmIds: [], eventIds: [], deps: [], parentId: null, createdAt: now }, o);
  const p1 = t({ title: 'Запуск поставки для «Вектора»', start: d(-5), due: d(12), status: 'doing', crmIds: [c1.id] });
  const s1 = t({ title: 'Подготовить договор', parentId: p1.id, start: d(-5), due: d(-1), assignee: 'Анна', crmIds: [c1.id], eventIds: [e1.id] });
  const s2 = t({ title: 'Согласовать спецификацию', parentId: p1.id, start: d(0), due: d(3), status: 'doing', crmIds: [c1.id], deps: [s1.id] });
  const s3 = t({ title: 'Счёт на предоплату', parentId: p1.id, start: d(4), due: d(5), assignee: 'Игорь', deps: [s2.id] });
  const p2 = t({ title: 'Новый сайт', start: d(-2), due: d(20), assignee: 'Анна', crmIds: [c2.id] });
  const s4 = t({ title: 'Утвердить макеты', parentId: p2.id, start: d(-2), due: d(0), assignee: 'Анна', crmIds: [c2.id], eventIds: [e2.id] });
  const s5 = t({ title: 'Вёрстка главной', parentId: p2.id, start: d(1), due: d(8), assignee: 'Игорь', deps: [s4.id] });
  const t6 = t({ title: 'Продлить кредитную линию', due: d(6), crmIds: [c3.id] });
  const t7 = t({ title: 'Отчёт партнёру за месяц', due: d(0) });
  D.tasks.push(p1, s1, s2, s3, p2, s4, s5, t6, t7);
  const pr1 = { id: uid('p'), name: 'Поставка «Вектору»', color: '#2f5bea', desc: 'Первая партия и договор', archived: false, createdAt: now, updatedAt: now };
  const pr2 = { id: uid('p'), name: 'Новый сайт', color: '#1f9d5a', desc: '', archived: false, createdAt: now, updatedAt: now };
  D.projects.push(pr1, pr2);
  [p1, s1, s2, s3, t6].forEach((x) => { x.projectId = pr1.id; });
  [p2, s4, s5].forEach((x) => { x.projectId = pr2.id; });
  D.notes.push(
    { id: uid('n'), title: 'Скидка за объём', body: 'Предложить 5% при заказе от 100 шт.\nСпросить про сроки оплаты.', crmIds: [c1.id], discussed: false, createdAt: now, updatedAt: now },
    { id: uid('n'), title: 'Идеи по сайту', body: 'Каталог с фильтрами, онлайн-заявка.', crmIds: [c2.id], discussed: false, createdAt: now, updatedAt: now },
  );
}

/* =========================================================
 * 12. Запуск
 * ======================================================= */
load();
render();
restoreDraftAfterRestart();
syncAlarms();
if (N && !D.meta.welcomed) {
  D.meta.welcomed = true;
  save();
  setTimeout(() => modal(`<h3>Добро пожаловать</h3>
    <div class="sub">Чтобы важные события звонили как будильник даже на заблокированном экране, разрешите уведомления, точные будильники и работу без ограничений батареи. Для календаря телефона — доступ к календарю.</div>
    <div class="form-actions mt"><button class="btn primary" data-a="welcome-settings">Открыть настройки</button><button class="btn" data-a="modal-close">Позже</button></div>`), 400);
}
ACTIONS['welcome-settings'] = () => { modal(null); go('settings'); };
setInterval(() => { renderNav(); }, 60000);
