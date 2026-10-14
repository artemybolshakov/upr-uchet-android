/* Упр. учёт — задачи, CRM, календарь, заметки. Все данные хранятся локально на устройстве. */
'use strict';

/* =========================================================
 * 1. Утилиты
 * ======================================================= */
const APP_VERSION = '1.0.0';
const SCHEMA = 1;
const N = window.Native || null; // Android-мост (в браузере отсутствует)

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
};
const icon = (n, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n] || ''}</svg>`;

/* =========================================================
 * 2. Данные, миграции, хранение
 * ======================================================= */
function emptyData() {
  return {
    schema: SCHEMA,
    meta: { createdAt: new Date().toISOString(), updatedAt: null, appVersion: APP_VERSION },
    settings: {
      me: 'Я',
      people: ['Я'],
      statuses: [
        { id: 'todo', name: 'К выполнению' },
        { id: 'doing', name: 'В работе' },
        { id: 'wait', name: 'Ожидание' },
        { id: 'done', name: 'Готово' },
      ],
      defaultRemind: 15,
      importantRemind: [60, 15, 0],
      taskRemindTime: '10:00',
      deviceCalendarId: null,
      showDeviceCalendars: [],
      showDeviceEvents: true,
      summary: { home: true, overdue: true, today: true, week: true, people: true, events: true, crm: true, notes: false },
      tasksView: 'kanban',
      kanbanGroup: 'people',
      linksGroup: 'parents',
      ganttScale: 'day',
      contactTypes: ['Инвестор', 'Ангел', 'Партнер', 'Инфлюенсер', 'Издатель', 'Разработчик', 'Медиа', 'Музыка', 'Фонд', 'ГОС', 'Образование', 'Сотрудник'],
      contactStatuses: ['Надо освежить', 'Работаем', 'Диалог', 'Архив молчаливый', 'Архив жесткий отказ', 'Поиск денег прямо сейчас'],
    },
    tasks: [],
    contacts: [],
    events: [],
    notes: [],
  };
}

/* Миграции: каждая функция переводит данные из версии N в N+1. Бэкапы старых версий всегда открываются в новых. */
const MIGRATIONS = {
  // 1: (d) => { ...; d.schema = 2; return d; },
};

function migrate(raw) {
  let d = raw && typeof raw === 'object' ? raw : {};
  if (!d.schema) d.schema = 1;
  while (MIGRATIONS[d.schema] && d.schema < SCHEMA) d = MIGRATIONS[d.schema](d);
  // Заполняем недостающие поля значениями по умолчанию (новые поля не ломают старые бэкапы).
  const def = emptyData();
  d.meta = Object.assign({}, def.meta, d.meta || {});
  d.settings = Object.assign({}, def.settings, d.settings || {});
  d.settings.summary = Object.assign({}, def.settings.summary, d.settings.summary || {});
  if (!Array.isArray(d.settings.people) || !d.settings.people.length) d.settings.people = def.settings.people;
  if (!Array.isArray(d.settings.statuses) || !d.settings.statuses.length) d.settings.statuses = def.settings.statuses;
  for (const k of ['tasks', 'contacts', 'events', 'notes']) if (!Array.isArray(d[k])) d[k] = [];
  d.tasks.forEach((t) => {
    t.crmIds = t.crmIds || []; t.eventIds = t.eventIds || []; t.deps = t.deps || [];
    t.status = t.status || 'todo'; t.assignee = t.assignee || d.settings.me;
  });
  d.events.forEach((e) => { e.crmIds = e.crmIds || []; if (e.remind == null) e.remind = [d.settings.defaultRemind]; });
  d.notes.forEach((n) => { n.crmIds = n.crmIds || []; });
  for (const k of ['contactTypes', 'contactStatuses']) if (!Array.isArray(d.settings[k])) d.settings[k] = def.settings[k].slice();
  d.contacts.forEach((c) => { c.tags = c.tags || []; c.types = c.types || []; c.statuses = c.statuses || []; });
  if (d.schema > SCHEMA) console.warn('Данные из более новой версии приложения: неизвестные поля сохранены как есть.');
  else d.schema = SCHEMA;
  return d;
}

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

function makeBackup() {
  return { format: 'upr-uchet-backup', schema: SCHEMA, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: D };
}

function restoreFrom(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { toast('Файл не является резервной копией'); return false; }
  const data = obj && obj.format === 'upr-uchet-backup' ? obj.data : obj;
  if (!data || typeof data !== 'object' || !('tasks' in data || 'contacts' in data || 'events' in data)) { toast('В файле нет данных приложения'); return false; }
  if (N) try { N.backupNow(); } catch (e) { /* страховочная копия перед восстановлением */ }
  D = migrate(data);
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
  if (e && e.deviceId && N && e.syncDevice) try { N.deleteDeviceEvent(e.deviceId); } catch (er) { /* */ }
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
  showDone: false,
  cal: { month: today().slice(0, 7), sel: today() },
  devEvents: [],
  devCals: [],
  highlight: null,
};

const TABS = [
  { id: 'home', name: 'Главная', icon: 'home' },
  { id: 'tasks', name: 'Задачи', icon: 'tasks' },
  { id: 'crm', name: 'CRM', icon: 'crm' },
  { id: 'calendar', name: 'Календарь', icon: 'cal' },
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
    <div class="brand"><i></i>Упр. учёт</div>
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
function closeSheet() { ui.stack.pop(); renderSheet(); if (!ui.stack.length) render(); }
function closeAll() { ui.stack = []; render(); }

function renderSheet() {
  const el = $('#sheet');
  const top = ui.stack[ui.stack.length - 1];
  $('#app').classList.toggle('with-sheet', !!top);
  if (!top) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const fn = SHEETS[top.type + (top.edit ? 'Form' : '')];
  el.innerHTML = fn ? fn(top) : '';
  el.scrollTop = 0;
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
    const map = { event: 'event', task: 'task', contact: 'contact' };
    if (map[kind] && byId(D[kind === 'contact' ? 'contacts' : kind + 's'], id)) openSheet(map[kind], id);
  } else if (type === 'imported') {
    if (payload) confirmBox('Заменить текущие данные данными из файла? Текущие данные будут сохранены в автокопию.', () => restoreFrom(payload), 'Восстановить');
    else toast('Файл не выбран');
  } else if (type === 'exported') {
    toast(payload === 'ok' ? 'Резервная копия сохранена' : 'Копия не сохранена');
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
      <div class="s">${dueChip(t)}${personChip(t.assignee)}${crmChips(t.crmIds)}${parent ? `<span class="chip">${icon('sub')}${esc(parent.title)}</span>` : ''}${subs.length ? `<span class="chip">${subs.filter(isDone).length}/${subs.length} подзадач</span>` : ''}</div>
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
  const od = contactOverdue(c);
  return `<div class="item" data-a="open" data-type="contact" data-id="${c.id}">
    ${avatar(c)}
    <div class="grow">
      <div class="t">${esc(c.name)}</div>
      <div class="s">${c.company ? `<span>${esc(c.company)}</span>` : ''}${statusChips({ statuses: c.statuses }, 2)}${c.nextContact ? `<span class="chip ${od ? 'red' : c.nextContact === today() ? 'amber' : ''}">${icon('phone')}${esc(fmtDate(c.nextContact))}</span>` : ''}${open ? `<span class="chip blue">${open} ${plural(open, 'задача', 'задачи', 'задач')}</span>` : ''}</div>
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
    const evs = eventsOn(t).sort((a, b) => a.start < b.start ? -1 : 1);
    const todayT = D.tasks.filter((x) => !isDone(x) && x.due === t).sort(sortByDue);
    const overdue = D.tasks.filter((x) => taskState(x) === 'overdue').sort(sortByDue);
    const soon = D.tasks.filter((x) => taskState(x) === 'future' && daysBetween(t, x.due) <= 7).sort(sortByDue);
    const crm = D.contacts.filter((x) => x.nextContact && x.nextContact <= t).sort((a, b) => a.nextContact < b.nextContact ? -1 : 1);
    body = `<div class="home-cols">
      <div>
        <div class="section-title">Сегодня в календаре</div>${listOf(evs, (e) => eventItem(e), 'Событий нет')}
        <div class="section-title">Задачи на сегодня</div>${listOf(todayT, taskItem, 'Задач на сегодня нет')}
        ${overdue.length ? `<div class="section-title" style="color:var(--danger)">Просрочено</div>${listOf(overdue.slice(0, 8), taskItem, '')}` : ''}
      </div>
      <div>
        <div class="section-title">CRM: пора связаться</div>${listOf(crm.slice(0, 10), contactItem, 'Всё по плану')}
        <div class="section-title">Ближайшие 7 дней</div>${listOf(soon.slice(0, 10), taskItem, 'Ничего не запланировано')}
      </div>
    </div>`;
  }
  return `<div class="head">
      <div class="grow"><h1>Главная</h1><div class="sub">${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</div></div>
      <button class="btn" data-a="quick-summary" title="Скопировать сводку">${icon('copy')}<span class="only-wide-inline">Сводка</span></button>
      <button class="icon-btn only-narrow" data-a="tab" data-id="summary" aria-label="Сводка">${icon('share')}</button>
      <button class="icon-btn only-narrow" data-a="tab" data-id="settings" aria-label="Настройки">${icon('settings')}</button>
    </div>
    <div class="stats">
      ${stat('overdueCrm', 'red', 'crm', c.overdueCrm, 'Просроченные карточки CRM')}
      ${stat('overdueTasks', 'amber', 'warn', c.overdueTasks, 'Просроченные задачи')}
      ${stat('todayTasks', 'blue', 'tasks', c.todayTasks, 'Задач на сегодня')}
      ${stat('todayCrmEvents', 'violet', 'today', c.todayCrmEvents, 'Событий CRM на сегодня')}
    </div>
    ${body}
    <button class="fab" data-a="new-menu" aria-label="Создать">${icon('plus')}</button>`;
};

/* ---------- Задачи ---------- */
function visibleTasks() {
  const q = ui.taskQuery.trim().toLowerCase();
  return D.tasks.filter((t) => (ui.showDone || !isDone(t)) && (!q || (t.title + ' ' + (t.desc || '') + ' ' + (t.assignee || '')).toLowerCase().includes(q)));
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
function taskGroups(mode, tasks) {
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

SCREENS.tasks = function () {
  const v = D.settings.tasksView;
  const views = [['kanban', 'Канбан'], ['links', 'Связи'], ['gantt', 'Гант'], ['list', 'Список']];
  let groupSel = '';
  if (v === 'kanban') {
    groupSel = `<div class="seg">${[['people', 'Исполнители'], ['due', 'Сроки'], ['status', 'Статусы']].map(([k, n]) => `<button class="${D.settings.kanbanGroup === k ? 'on' : ''}" data-a="set" data-key="kanbanGroup" data-val="${k}">${n}</button>`).join('')}</div>`;
  } else if (v === 'links') {
    groupSel = `<div class="seg">${[['parents', 'Подзадачи'], ['people', 'Исполнители'], ['due', 'Сроки']].map(([k, n]) => `<button class="${D.settings.linksGroup === k ? 'on' : ''}" data-a="set" data-key="linksGroup" data-val="${k}">${n}</button>`).join('')}</div>`;
  } else if (v === 'gantt') {
    groupSel = `<div class="seg">${[['day', 'Дни'], ['week', 'Недели']].map(([k, n]) => `<button class="${D.settings.ganttScale === k ? 'on' : ''}" data-a="set" data-key="ganttScale" data-val="${k}">${n}</button>`).join('')}</div>`;
  }
  const tasks = visibleTasks();
  let body = '';
  if (v === 'kanban') body = kanban(tasks);
  else if (v === 'gantt') body = gantt(tasks);
  else if (v === 'links') body = linksView(tasks);
  else body = listOf(tasks.slice().sort(sortByDue), taskItem, D.tasks.length ? 'Ничего не найдено' : 'Задач пока нет. Нажмите «+», чтобы добавить первую.');
  return `<div class="head"><h1>Задачи</h1>
      <button class="btn primary" data-a="new" data-type="task">${icon('plus')}<span>Задача</span></button></div>
    <div class="row" style="margin-bottom:10px">
      <div class="seg">${views.map(([k, n]) => `<button class="${v === k ? 'on' : ''}" data-a="set" data-key="tasksView" data-val="${k}">${n}</button>`).join('')}</div>
      ${groupSel}
    </div>
    <div class="row" style="margin-bottom:12px">
      <input class="search grow" placeholder="Поиск задач" data-input="taskQuery" value="${esc(ui.taskQuery)}">
      <label class="toggle" style="padding:6px 10px"><input type="checkbox" data-a="toggle-done" ${ui.showDone ? 'checked' : ''}><span class="small">Готовые</span></label>
    </div>
    ${body}`;
};

function kanban(tasks) {
  const groups = taskGroups(D.settings.kanbanGroup, tasks);
  return `<div class="board">${groups.map((g) => {
    const items = g.items.slice().sort(sortByDue);
    return `<div class="col">
      <div class="col-h">${g.color ? `<i class="dot" style="background:${g.color}"></i>` : ''}<span class="grow ellipsis">${esc(g.name)}</span><span class="cnt">${items.length}</span>
        <button class="icon-btn" style="width:30px;height:30px" data-a="new" data-type="task" data-preset='${esc(JSON.stringify(g.preset || {}))}' aria-label="Добавить">${icon('plus')}</button></div>
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
    <div class="m">${dueChip(t)}${D.settings.kanbanGroup !== 'people' ? personChip(t.assignee) : ''}${D.settings.kanbanGroup !== 'status' ? `<span class="chip ${isDone(t) ? 'green' : ''}">${esc(statusName(t.status))}</span>` : ''}${crmChips(t.crmIds, 1)}${subs.length ? `<span class="chip">${subs.filter(isDone).length}/${subs.length}</span>` : ''}${t.deps.length ? `<span class="chip">${icon('link')}${t.deps.length}</span>` : ''}</div>
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

/* ---------- CRM ---------- */
SCREENS.crm = function () {
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
  const f = [['all', 'Все'], ['overdue', 'Просрочены'], ['today', 'Сегодня'], ['tasks', 'С задачами']];
  return `<div class="head"><h1>CRM</h1><button class="btn primary" data-a="new" data-type="contact">${icon('plus')}<span>Контакт</span></button></div>
    <input class="search" placeholder="Поиск: имя, компания, телефон, тег" data-input="crmQuery" value="${esc(ui.crmQuery)}">
    <div class="seg mt">${f.map(([k, n]) => `<button class="${ui.crmFilter === k ? 'on' : ''}" data-a="crm-filter" data-id="${k}">${n}</button>`).join('')}</div>
    <div class="crm-sel mt" style="margin-bottom:12px">
      <select data-change="crmType"><option value="">Тип: все</option>${D.settings.contactTypes.map((x) => `<option ${ui.crmType === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <select data-change="crmStatus"><option value="">Статус: все</option>${D.settings.contactStatuses.map((x) => `<option ${ui.crmStatus === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
    </div>
    ${listOf(list, contactItem, D.contacts.length ? 'Ничего не найдено' : 'Карточек пока нет. Добавьте первый контакт.')}`;
};

/* ---------- Календарь ---------- */
function loadDeviceEvents(force) {
  if (!N || !D.settings.showDeviceEvents) { ui.devEvents = []; return; }
  try {
    const p = JSON.parse(N.permissions() || '{}');
    if (!p.calendar) { ui.devEvents = []; return; }
    const [y, m] = ui.cal.month.split('-').map(Number);
    const from = new Date(y, m - 1, 1 - 7).getTime();
    const to = new Date(y, m, 1 + 14).getTime();
    const ids = (D.settings.showDeviceCalendars || []).join(',');
    const linked = new Set(D.events.map((e) => String(e.deviceId || '')));
    ui.devEvents = JSON.parse(N.deviceEvents(from, to, ids) || '[]').filter((e) => !linked.has(String(e.eventId)));
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
SCREENS.calendar = function () {
  const [y, m] = ui.cal.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const t = today();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const k = ymd(d);
    const evs = eventsOn(k);
    const dev = devEventsOn(k).length;
    const tk = D.tasks.filter((x) => x.due === k && !isDone(x)).length;
    const dots = evs.slice(0, 3).map((e) => `<i class="${e.important ? 'imp' : ''}"></i>`).join('') + (dev ? '<i class="dev"></i>' : '') + (tk ? '<i class="task"></i>' : '');
    cells += `<button class="cal-d ${d.getMonth() !== m - 1 ? 'out' : ''} ${k === t ? 'td' : ''} ${k === ui.cal.sel ? 'sel' : ''}" data-a="cal-sel" data-id="${k}"><span>${d.getDate()}</span><span class="dots">${dots}</span></button>`;
    if (i === 34 && addDays(gridStart, 35).getMonth() !== m - 1) break;
  }
  const sel = ui.cal.sel;
  const evs = eventsOn(sel).sort((a, b) => (a.allDay ? '0' : a.start) < (b.allDay ? '0' : b.start) ? -1 : 1);
  const dev = devEventsOn(sel);
  const tks = D.tasks.filter((x) => x.due === sel).sort(sortByDue);
  return `<div class="head"><h1>Календарь</h1><button class="btn primary" data-a="new" data-type="event" data-preset='${esc(JSON.stringify({ date: sel }))}'>${icon('plus')}<span>Событие</span></button></div>
    <div class="cal-layout">
      <div class="cal">
        <div class="row" style="margin-bottom:6px">
          <button class="icon-btn" data-a="cal-month" data-id="-1" aria-label="Предыдущий месяц">${icon('back')}</button>
          <b class="grow" style="text-align:center;font-size:16px">${MONTHS_N[m - 1]} ${y}</b>
          <button class="icon-btn" data-a="cal-month" data-id="1" aria-label="Следующий месяц" style="transform:scaleX(-1)">${icon('back')}</button>
        </div>
        <div class="cal-grid">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => `<div class="cal-wd">${w}</div>`).join('')}${cells}</div>
        <div class="row mt small muted"><button class="btn sm" data-a="cal-today">Сегодня</button><span class="right"><i class="dot" style="background:var(--danger)"></i> важное <i class="dot" style="background:var(--accent)"></i> событие <i class="dot" style="background:var(--warn)"></i> срок задачи <i class="dot"></i> системный</span></div>
      </div>
      <div>
        <div class="section-title" style="margin-top:4px">${esc(fmtDate(sel, true))}</div>
        ${evs.length || dev.length ? `<div class="list">${evs.map((e) => eventItem(e)).join('')}${dev.map(devEventItem).join('')}</div>` : '<div class="list"><div class="empty">Событий нет</div></div>'}
        ${tks.length ? `<div class="section-title">Сроки задач</div>${listOf(tks, taskItem, '')}` : ''}
        ${N && !D.settings.showDeviceEvents ? '' : ''}
      </div>
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
      <input class="search grow" placeholder="Поиск по заметкам" data-input="notesQuery" value="${esc(ui.notesQuery)}">
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
  const opts = [['home', 'Итоги (счётчики)'], ['overdue', 'Просроченные задачи'], ['today', 'Задачи на сегодня'], ['week', 'Задачи на 7 дней'], ['people', 'По исполнителям'], ['events', 'Встречи на 7 дней'], ['crm', 'CRM: пора связаться'], ['notes', 'Заметки к обсуждению']];
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
  }
  const perm = (k, title, hint) => `<div class="perm"><div class="grow"><div>${title}</div><div class="sub">${hint}</div></div>${perms[k] ? '<span class="ok">включено</span>' : `<button class="btn sm" data-a="perm" data-id="${k}">Разрешить</button>`}</div>`;
  const fmtSize = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';
  return `<div class="head"><button class="icon-btn only-narrow" data-a="tab" data-id="home">${icon('back')}</button><h1>Настройки</h1></div>

    <div class="section-title">Исполнители</div>
    <div class="card">
      <div class="picker">${s.people.map((p) => `<span class="chip" style="padding:6px 10px"><i class="dot" style="background:${colorFor(p)}"></i>${esc(p)}${p === s.me ? ' (я)' : ` <button class="chip" style="padding:0 4px" data-a="person-del" data-id="${esc(p)}">✕</button>`}</span>`).join('')}</div>
      <div class="row mt"><input class="search grow" id="new-person" placeholder="Имя исполнителя"><button class="btn" data-a="person-add">${icon('plus')}Добавить</button></div>
    </div>

    <div class="section-title">Напоминания</div>
    <div class="card form">
      <div class="field-row">
        <div class="field"><label>Обычное событие: за сколько минут</label><input type="number" min="0" data-setting="defaultRemind" value="${s.defaultRemind}"></div>
        <div class="field"><label>Время напоминаний CRM</label><input type="time" data-setting="taskRemindTime" value="${esc(s.taskRemindTime)}"></div>
      </div>
      <div class="field"><label>Важное событие (будильник): за сколько минут, через запятую</label><input data-setting="importantRemind" value="${esc(s.importantRemind.join(', '))}"></div>
      <div class="row"><button class="btn" data-a="test-alarm" data-id="0">${icon('bell')}Тест обычного</button><button class="btn danger" data-a="test-alarm" data-id="1">${icon('alarm')}Тест будильника (через 5 с)</button></div>
      <div class="sub">Важные события звонят как будильник и не замолкают, пока вы не нажмёте «Отключить» или «Отложить».</div>
    </div>

    ${N ? `<div class="section-title">Разрешения ${esc(info.device || '')}</div>
    <div class="card">
      ${perm('notifications', 'Уведомления', 'Показывать напоминания')}
      ${perm('exactAlarm', 'Точные будильники', 'Напоминания минута в минуту')}
      ${perm('fullScreen', 'Полноэкранный сигнал', 'Экран будильника поверх блокировки')}
      ${perm('battery', 'Без ограничений батареи', 'Чтобы система не «усыпляла» напоминания')}
      ${perm('calendar', 'Календарь', 'Синхронизация с календарём телефона')}
      <div class="sub mt">Для Huawei: Настройки → Приложения → Запуск приложений → «Упр. учёт» → «Управлять вручную» и включите автозапуск, косвенный запуск и работу в фоне. Также в настройках уведомлений приложения разрешите «Баннеры», «Экран блокировки» и звук.</div>
      <button class="btn sm mt" data-a="perm" data-id="app">Открыть настройки приложения</button>
    </div>` : ''}

    <div class="section-title">Календарь телефона</div>
    <div class="card form">
      <label class="toggle"><input type="checkbox" data-a="set-bool" data-key="showDeviceEvents" ${s.showDeviceEvents ? 'checked' : ''}><span class="grow">Показывать события календаря телефона<small>Только чтение; их можно привязать к задачам и контактам</small></span></label>
      ${ui.devCals.length ? `
        <div class="field"><label>Какие календари показывать (пусто — все)</label>
          <div class="picker">${ui.devCals.map((c) => `<button class="chip ${s.showDeviceCalendars.includes(String(c.id)) ? 'blue' : ''}" data-a="devcal-toggle" data-id="${c.id}"><i class="dot" style="background:${esc(c.color)}"></i>${esc(c.name)}</button>`).join('')}</div></div>
        <div class="field"><label>Куда записывать события приложения</label>
          <select data-setting="deviceCalendarId"><option value="">Не записывать</option>${ui.devCals.filter((c) => c.writable).map((c) => `<option value="${c.id}" ${String(s.deviceCalendarId) === String(c.id) ? 'selected' : ''}>${esc(c.name)}${c.account ? ' — ' + esc(c.account) : ''}</option>`).join('')}</select></div>`
      : `<div class="sub">${N ? 'Разрешите доступ к календарю выше, чтобы выбрать календари.' : 'Доступно в приложении на телефоне.'}</div>`}
      <div class="row"><b class="grow">Офлайн-копии календаря</b>${N ? `<button class="btn sm" data-a="snapshot-now">${icon('backup')}Снимок сейчас</button>` : ''}</div>
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
      <div class="sub">Формат копии версионирован: копии из этой версии откроются во всех следующих версиях приложения. Автокопия создаётся каждый день (хранятся 30 последних).</div>
      ${backups.length ? `<div class="list">${backups.slice(0, 15).map((f) => `<div class="item" data-a="backup-restore" data-id="${esc(f.name)}"><div class="grow"><div class="t">${esc(f.name.replace('auto-', '').replace('.json', ''))}</div><div class="s">${fmtSize(f.size)} · нажмите, чтобы восстановить</div></div></div>`).join('')}</div>` : ''}
    </div>

    <div class="section-title">О приложении</div>
    <div class="card">
      <dl class="kv">
        <dt>Версия</dt><dd>${esc(info.version || APP_VERSION)} · формат данных v${SCHEMA}</dd>
        <dt>Устройство</dt><dd>${esc(info.device || navigator.userAgent.slice(0, 40))}</dd>
        <dt>Экран</dt><dd class="screen-mode">${window.innerWidth}×${window.innerHeight} — ${screenMode()}</dd>
        <dt>Данные</dt><dd>${D.tasks.length} задач, ${D.contacts.length} контактов, ${D.events.length} событий, ${D.notes.length} заметок</dd>
      </dl>
      <div class="row mt"><button class="btn sm" data-a="demo">Заполнить примером</button><button class="btn sm danger" data-a="wipe">Удалить все данные</button></div>
    </div>`;
};
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
    + linkSection(`Подзадачи${subs.length ? ' ' + subs.filter(isDone).length + '/' + subs.length : ''}`, smallBtn('new', '+ Подзадача', `data-type="task" data-preset='${esc(JSON.stringify({ parentId: t.id, assignee: t.assignee, crmIds: t.crmIds }))}'`),
      subs.length ? listOf(subs, taskItem, '') : '<div class="sub">Нет подзадач</div>')
    + linkSection('Сначала выполнить (зависимости)', smallBtn('pick', '+ Добавить', `data-type="dep" data-for="task" data-id="${t.id}"`),
      deps.length ? listOf(deps, taskItem, '') : '<div class="sub">Нет зависимостей</div>')
    + (blocks.length ? linkSection('Ждут эту задачу', '', listOf(blocks, taskItem, '')) : '')
    + `<div class="form-actions mt2"><button class="btn danger" data-a="delete" data-type="task" data-id="${t.id}">${icon('trash')}Удалить</button></div>`;
};

SHEETS.taskForm = function ({ id, preset }) {
  const t = id ? task(id) : Object.assign({ title: '', desc: '', assignee: D.settings.me, status: 'todo', start: '', due: '', dueTime: '', remindAt: '', important: false, parentId: null }, preset || {});
  const people = allPeople();
  const exclude = new Set();
  if (id) { const walk = (x) => { exclude.add(x); subtasks(x).forEach((s) => walk(s.id)); }; walk(id); }
  const parents = D.tasks.filter((x) => !exclude.has(x.id) && !isDone(x)).sort(sortByDue);
  return sheetHead(id ? 'Изменить задачу' : 'Новая задача') + `<form class="form" data-form="task" data-id="${id || ''}">
    <div class="field"><label>Название</label><input name="title" required value="${esc(t.title)}" placeholder="Что нужно сделать"></div>
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

/* ---------- Контакт ---------- */
SHEETS.contact = function ({ id }) {
  const c = contact(id);
  if (!c) return sheetHead('Карточка удалена');
  const tks = tasksOfContact(c.id).sort((a, b) => (isDone(a) - isDone(b)) || sortByDue(a, b));
  const evs = eventsOfContact(c.id).sort((a, b) => a.start < b.start ? 1 : -1);
  const upcoming = evs.filter((e) => e.start.slice(0, 10) >= today()).reverse();
  const past = evs.filter((e) => e.start.slice(0, 10) < today());
  const nts = notesOfContact(c.id).sort((a, b) => a.discussed - b.discussed);
  const od = contactOverdue(c);
  return sheetHead('', `<button class="icon-btn" data-a="edit" data-type="contact" data-id="${c.id}" aria-label="Изменить">${icon('edit')}</button>`)
    + `<div class="row" style="margin:-6px 0 14px">${avatar(c, c.photo ? 96 : 56)}
      <div class="grow"><h2 style="margin:0">${esc(c.name)}</h2><div class="sub">${esc([c.role, c.company].filter(Boolean).join(' · '))}</div></div></div>
    <div class="card"><div class="section-title" style="margin-top:0">О контакте</div><dl class="kv">
      ${c.company ? `<dt>Компания</dt><dd>${esc(c.company)}</dd>` : ''}
      ${c.role ? `<dt>Должность</dt><dd>${esc(c.role)}</dd>` : ''}
      ${c.birthday ? `<dt>Дата рождения</dt><dd>${esc(c.birthday.split('-').reverse().join('.'))}</dd>` : ''}
      <dt>Тип контакта</dt><dd>${(c.types || []).length ? c.types.map((x) => `<span class="chip violet">${esc(x)}</span>`).join(' ') : '—'}</dd>
      <dt>Статус</dt><dd>${(c.statuses || []).length ? statusChips({ statuses: c.statuses }) : '—'}</dd>
    </dl></div>
    <div class="card"><dl class="kv">
      ${c.phone ? `<dt>Телефон</dt><dd><a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a></dd>` : ''}
      ${c.email ? `<dt>Почта</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ''}
      ${c.contacts ? `<dt>Соц. сети и другие контакты</dt><dd>${contactsHtml(c.contacts)}</dd>` : ''}
      <dt>Связаться</dt><dd>${c.nextContact ? `<span class="chip ${od ? 'red' : c.nextContact === today() ? 'amber' : 'blue'}">${esc(fmtDate(c.nextContact, true))}${od ? ' · просрочено' : ''}</span>` : '—'}</dd>
      ${c.lastContact ? `<dt>Был контакт</dt><dd>${esc(fmtDate(c.lastContact))}</dd>` : ''}
      ${c.tags && c.tags.length ? `<dt>Теги</dt><dd>${c.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ')}</dd>` : ''}
    </dl>${c.comment ? `<div class="desc mt">${esc(c.comment)}</div>` : ''}
    <div class="row mt">
      <button class="btn sm" data-a="contacted" data-id="${c.id}">${icon('check')}Связался сегодня</button>
      ${[[1, '+1 д'], [3, '+3 д'], [7, '+нед'], [30, '+мес']].map(([n, l]) => `<button class="btn sm" data-a="next-contact" data-id="${c.id}" data-val="${n}">${l}</button>`).join('')}
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
  const base = { title: '', start: (p.date || today()) + 'T10:00', end: (p.date || today()) + 'T11:00', allDay: false, location: '', desc: '', important: false, remind: [D.settings.defaultRemind], crmIds: p.crmIds || [], syncDevice: !!D.settings.deviceCalendarId };
  const e = id ? event(id) : Object.assign(base, p.title ? { title: p.title } : {});
  const rm = (e.remind && e.remind[0] != null) ? e.remind[0] : -1;
  const opts = [[-1, 'Без напоминания'], [0, 'В момент начала'], [5, 'За 5 минут'], [15, 'За 15 минут'], [30, 'За 30 минут'], [60, 'За 1 час'], [120, 'За 2 часа'], [1440, 'За 1 день']];
  return sheetHead(id ? 'Изменить событие' : 'Новое событие') + `<form class="form" data-form="event" data-id="${id || ''}" data-preset='${esc(JSON.stringify(p))}'>
    <div class="field"><label>Название</label><input name="title" required value="${esc(e.title)}" placeholder="Встреча, звонок, дедлайн"></div>
    <div class="field"><label>Дата</label><input type="date" name="date" required value="${esc(e.start.slice(0, 10))}"></div>
    <div class="field-row">
      <div class="field"><label>Начало</label><input type="time" name="from" value="${esc(e.start.slice(11, 16) || '10:00')}"></div>
      <div class="field"><label>Конец</label><input type="time" name="to" value="${esc((e.end || '').slice(11, 16) || '')}"></div>
    </div>
    <label class="toggle"><input type="checkbox" name="allDay" ${e.allDay ? 'checked' : ''}><span class="grow">Весь день</span></label>
    <label class="toggle"><input type="checkbox" name="important" ${e.important ? 'checked' : ''}><span class="grow">Важное — звонить как будильник<small>Сигнал за ${D.settings.importantRemind.map((m) => m === 0 ? 'в момент начала' : humanMins(m)).join(', ')}; не замолкает до ручного отключения</small></span></label>
    <div class="field"><label>Обычное напоминание</label><select name="remind">${opts.map(([v, n]) => `<option value="${v}" ${rm === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="field"><label>Место</label><input name="location" value="${esc(e.location || '')}"></div>
    <div class="field"><label>Описание</label><textarea name="desc">${esc(e.desc || '')}</textarea></div>
    ${D.settings.deviceCalendarId ? `<label class="toggle"><input type="checkbox" name="syncDevice" ${e.syncDevice ? 'checked' : ''}><span class="grow">Записать в календарь телефона</span></label>` : ''}
    <div class="form-actions"><button class="btn primary" type="submit">${icon('check')}Сохранить</button><button class="btn" type="button" data-a="sheet-back">Отмена</button></div>
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
    <div class="field"><label>Мысли, вопросы, договорённости</label><textarea name="body" style="min-height:180px">${esc(n.body || '')}</textarea></div>
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
  if (p.type === 'event') items = D.events.slice().sort((a, b) => a.start < b.start ? 1 : -1).map((e) => ({ id: e.id, t: e.title, s: fmtDate(e.start.slice(0, 10)) + (e.allDay ? '' : ' ' + e.start.slice(11, 16)) }));
  items = items.filter((x) => !q || (x.t + ' ' + x.s).toLowerCase().includes(q));
  const title = { contact: 'Привязать контакт', task: 'Привязать задачу', event: 'Привязать событие', dep: 'Сначала нужно выполнить' }[p.type];
  modal(`<div class="row"><h3 class="grow" style="margin:0">${title}</h3><button class="btn sm primary" data-a="modal-close">Готово</button></div>
    <input class="search mt" placeholder="Поиск" data-input="pickerQ" value="${esc(p.q || '')}">
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
    const data = { title: g('title'), assignee, status: g('status') || 'todo', start: g('start'), due: g('due'), parentId: g('parentId') || null, remindAt: g('remindAt'), important: f.get('important') === 'on', desc: g('desc') };
    if (data.start && data.due && data.start > data.due) { toast('Начало позже срока — поменял местами'); [data.start, data.due] = [data.due, data.start]; }
    if (id) { Object.assign(task(id), data, { updatedAt: now }); saved = task(id); }
    else {
      saved = Object.assign({ id: uid('t'), crmIds: (preset.crmIds || []).slice(), eventIds: (preset.eventIds || []).slice(), deps: [], createdAt: now, updatedAt: now }, data);
      if (data.status === 'done') saved.doneAt = now;
      D.tasks.push(saved);
    }
    finishForm('task', saved.id, !id);
  } else if (kind === 'contact') {
    const data = { name: g('name'), company: g('company'), role: g('role'), phone: g('phone'), email: g('email'), nextContact: g('nextContact'), remind: f.get('remind') === 'on', tags: g('tags').split(',').map((x) => x.trim()).filter(Boolean), comment: g('comment'),
      birthday: g('birthday'), contacts: g('contacts'), photo: g('photo'), types: f.getAll('types'), statuses: f.getAll('statuses') };
    if (id) { Object.assign(contact(id), data, { updatedAt: now }); saved = contact(id); }
    else { saved = Object.assign({ id: uid('c'), createdAt: now, updatedAt: now }, data); D.contacts.push(saved); }
    finishForm('contact', saved.id, !id);
  } else if (kind === 'event') {
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
    const data = { title: g('title'), body: f.get('body') || '', crmIds: g('crmId') ? [g('crmId')] : [], discussed: f.get('discussed') === 'on' };
    if (!data.title && !data.body.trim()) { toast('Заметка пустая'); return; }
    if (id) Object.assign(note(id), data, { updatedAt: now });
    else D.notes.push(Object.assign({ id: uid('n'), createdAt: now, updatedAt: now }, data));
    save();
    toast('Заметка сохранена');
    closeSheet();
    render();
  }
}
function finishForm(type, id, created) {
  save();
  ui.stack.pop();
  if (created) ui.stack.push({ type, id });
  // на узком экране после создания открываем карточку; если пришли из другой карточки — возвращаемся к ней
  render();
  toast('Сохранено');
}
function utcDay(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); }
function pushToDevice(e) {
  if (!N || !e.syncDevice || !D.settings.deviceCalendarId) return;
  try {
    const res = N.upsertDeviceEvent(JSON.stringify({
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
    const names = { task: 'задачу', contact: 'карточку контакта', event: 'событие', note: 'заметку' };
    let extra = '';
    if (type === 'task' && subtasks(id).length) extra = ' Подзадачи останутся самостоятельными задачами.';
    confirmBox(`Удалить ${names[type]}?${extra}`, () => {
      if (type === 'task') removeTask(id);
      if (type === 'contact') removeContact(id);
      if (type === 'event') removeEvent(id);
      if (type === 'note') D.notes = D.notes.filter((n) => n.id !== id);
      save();
      ui.stack = ui.stack.filter((s) => s.id !== id);
      render();
      toast('Удалено');
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
    if (c.nextContact && c.nextContact <= today()) c.nextContact = '';
    save(); render(); toast('Отмечено. Назначьте следующий контакт кнопками +д');
  },
  'next-contact': (el) => {
    const c = contact(el.dataset.id);
    c.nextContact = ymd(addDays(new Date(), Number(el.dataset.val)));
    save(); render(); toast('Следующий контакт: ' + fmtDate(c.nextContact, true));
  },
  'cal-sel': (el) => { ui.cal.sel = el.dataset.id; if (el.dataset.id.slice(0, 7) !== ui.cal.month) { ui.cal.month = el.dataset.id.slice(0, 7); loadDeviceEvents(); } render(); },
  'cal-month': (el) => {
    const [y, m] = ui.cal.month.split('-').map(Number);
    const d = new Date(y, m - 1 + Number(el.dataset.id), 1);
    ui.cal.month = ymd(d).slice(0, 7);
    loadDeviceEvents();
    render();
  },
  'cal-today': () => { ui.cal.month = today().slice(0, 7); ui.cal.sel = today(); loadDeviceEvents(); render(); },
  'dev-event': (el) => {
    const e = ui.devEvents.find((x) => String(x.eventId) === el.dataset.id && String(x.begin) === el.dataset.begin);
    if (!e) return;
    ui.devPick = e;
    const st = new Date(e.begin), en = new Date(e.end);
    modal(`<h3>${esc(e.title || '(без названия)')}</h3>
      <dl class="kv"><dt>Когда</dt><dd>${esc(fmtDate(ymd(st), true))}${e.allDay ? ', весь день' : ', ' + hm(st) + '–' + hm(en)}</dd>
      <dt>Календарь</dt><dd>${esc(e.calendar)}</dd>${e.location ? `<dt>Где</dt><dd>${esc(e.location)}</dd>` : ''}</dl>
      ${e.description ? `<div class="desc mt small">${esc(e.description)}</div>` : ''}
      <div class="sub mt">Событие из календаря телефона. Добавьте его в приложение, чтобы привязать к задачам и CRM и включить будильник.</div>
      <div class="form-actions mt"><button class="btn primary" data-a="dev-adopt">${icon('link')}Добавить в приложение</button><button class="btn" data-a="modal-close">Закрыть</button></div>`);
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
      <div class="item" data-a="new-close" data-type="event">${icon('cal')}<div class="t">Событие</div></div>
      <div class="item" data-a="new-close" data-type="contact">${icon('crm')}<div class="t">Контакт CRM</div></div>
      <div class="item" data-a="new-close" data-type="note">${icon('notes')}<div class="t">Заметка</div></div></div>`),
  'new-close': (el) => { modal(null); openSheet(el.dataset.type, null, { edit: true, preset: el.dataset.type === 'event' ? { date: today() } : {} }); },
  'quick-summary': () => copyText(buildSummary()),
  'summary-copy': () => copyText(buildSummary({ person: ui.summaryPerson || '' })),
  'summary-share': () => { const t = buildSummary({ person: ui.summaryPerson || '' }); if (N) N.shareText(t); else if (navigator.share) navigator.share({ text: t }); else copyText(t); },
  'summary-opt': (el) => { const s = D.settings.summary; s[el.dataset.id] = !s[el.dataset.id]; save(); render(); },
  'person-add': () => {
    const v = ($('#new-person').value || '').trim();
    if (!v) return;
    if (!D.settings.people.includes(v)) D.settings.people.push(v);
    save(); render();
  },
  'person-del': (el) => { const p = el.dataset.id; D.settings.people = D.settings.people.filter((x) => x !== p); save(); render(); toast('Задачи исполнителя «' + p + '» сохранены'); },
  'test-alarm': (el) => { if (N) { N.testAlarm(el.dataset.id === '1'); toast('Сигнал прозвучит через 5 секунд — можно заблокировать экран'); } else toast('Доступно на телефоне'); },
  perm: (el) => { if (N) N.requestPermission(el.dataset.id); },
  'devcal-toggle': (el) => { toggleArr(D.settings.showDeviceCalendars, String(el.dataset.id)); save(); render(); },
  'snapshot-now': () => { if (N && N.snapshotNow()) { toast('Снимок календаря сохранён'); render(); } else toast('Нет доступа к календарю'); },
  'snapshot-open': (el) => {
    let snap;
    try { snap = JSON.parse(N.readSnapshot(el.dataset.id)); } catch (e) { toast('Не удалось открыть снимок'); return; }
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
  'backup-export': () => {
    const name = 'upr-uchet-backup-' + today() + '.json';
    const txt = JSON.stringify(makeBackup(), null, 1);
    if (N) N.exportFile(txt, name, 'application/json');
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; a.click(); }
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
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('[data-msel-new]')) { ev.preventDefault(); ACTIONS['msel-add'](ev.target); }
});
document.addEventListener('change', (ev) => {
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

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  submitForm(form);
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  const k = el.dataset.input;
  if (!k) return;
  if (k === 'pickerQ') { ui.picker.q = el.value; ui.picker.focus = true; renderPicker(); return; }
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
