/* 管理会计 — формат данных, миграции и резервные копии.
 *
 * ПРАВИЛА СОВМЕСТИМОСТИ (обязательны для любой новой функции, см. docs/BACKUP_COMPATIBILITY.md):
 *  1. Поля и коллекции только ДОБАВЛЯЮТСЯ. Старые поля не удаляются, не переименовываются и не меняют смысл.
 *     Если нужно новое представление (например, HTML заметки), старое поле продолжаем заполнять (body — простой текст).
 *  2. Любое изменение структуры = SCHEMA + 1 и функция в MIGRATIONS[старая версия].
 *  3. migrate() обязана открывать ЛЮБУЮ прошлую копию и быть идемпотентной (повторный прогон ничего не меняет).
 *  4. Неизвестные поля (из более новых версий) сохраняются как есть — их нельзя терять при сохранении.
 *  5. На каждую версию схемы в tests/fixtures лежит копия; CI (tests/backup-compat.test.js) не соберёт APK,
 *     если какая-либо из них перестала восстанавливаться.
 *
 * Файл не зависит от интерфейса и браузера — его проверяет node в CI.
 */
'use strict';

var APP_VERSION = '1.9.0';
var SCHEMA = 6;
var BACKUP_FORMAT = 'upr-uchet-backup'; // имя формата не меняем — по нему узнаём копии всех версий

// «Чек-лист дня» (checklist.js): в браузере подключается раньше schema.js, в node — через require
var CL = typeof Checklist !== 'undefined' ? Checklist : (typeof require === 'function' ? require('./checklist.js') : null);

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
      summary: { home: true, overdue: true, today: true, week: true, people: true, events: true, crm: true, notes: false, projects: true },
      tasksView: 'kanban',
      kanbanGroup: 'people',
      linksGroup: 'parents',
      ganttScale: 'day',
      contactTypes: ['Инвестор', 'Ангел', 'Партнер', 'Инфлюенсер', 'Издатель', 'Разработчик', 'Медиа', 'Музыка', 'Фонд', 'ГОС', 'Образование', 'Сотрудник'],
      contactStatuses: ['Надо освежить', 'Работаем', 'Диалог', 'Архив молчаливый', 'Архив жесткий отказ', 'Поиск денег прямо сейчас'],
      birthdayRemind: true,
      projectCategories: [],
      projectsGroup: 'category',
      projectsSort: 'attention',
      calView: 'month',
      kanbanOrder: {},
      newEventTarget: 'app',
      mapId: null,
      crmSort: 'due', // CRM: 'due' — по сроку «Связаться», 'name' — по имени
      homeView: 'map', // «Мои дела» под счётчиками: 'map' — карта ответственных, 'projects' — сетка проектов
      roadmap: { expanded: false, range: 'year' }, // «Дорожная карта»: только состояние вида (сама карта вычисляется из задач-вех)
      checklist: CL.defaults(), // «Чек-лист дня»: [{ id, name, archived }] в нужном порядке
      checklistShow: true,      // показывать чек-лист на «Моих делах»
    },
    tasks: [],
    contacts: [],
    events: [],
    notes: [],
    projects: [],
    maps: [],
    checklistLog: {}, // { 'YYYY-MM-DD': { [itemId]: 'HH:MM' } } — отметки чек-листа по дням (хранится 400 дней)
  };
}

/* Простой текст из HTML заметки (для поиска, сводки и старых версий приложения). */
function htmlToText(html) {
  var s = String(html || '');
  // нумерованные списки: 1. 2. 3. или a. b. c.
  s = s.replace(/<ol([^>]*)>([\s\S]*?)<\/ol>/gi, function (m, attrs, inner) {
    var i = 0, alpha = /type="?a"?/i.test(attrs);
    return inner.replace(/<li[^>]*>/gi, function () { i++; return '\n' + (alpha ? String.fromCharCode(96 + ((i - 1) % 26) + 1) : i) + '. '; }) + '\n';
  });
  s = s.replace(/<li[^>]*data-checked="true"[^>]*>/gi, '\n☑ ')
    .replace(/<li[^>]*data-checked[^>]*>/gi, '\n☐ ')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<(br)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function textToHtml(text) {
  var esc = function (v) { return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lines = String(text || '').split('\n');
  return lines.map(function (l) { return '<p>' + (l.trim() ? esc(l) : '<br>') + '</p>'; }).join('');
}

/* Миграции: MIGRATIONS[N] переводит данные из версии N в N+1. */
var MIGRATIONS = {
  // v1 → v2: проекты, проект у задачи, форматированные заметки
  1: function (d) {
    if (!Array.isArray(d.projects)) d.projects = [];
    (d.tasks || []).forEach(function (t) { if (t.projectId === undefined) t.projectId = null; });
    (d.notes || []).forEach(function (n) { if (n.html == null && n.body) n.html = textToHtml(n.body); });
    d.schema = 2;
    return d;
  },
  // v2 → v3: категории проектов (виды деятельности)
  2: function (d) {
    if (!d.settings || typeof d.settings !== 'object') d.settings = {};
    if (!Array.isArray(d.settings.projectCategories)) d.settings.projectCategories = [];
    (d.projects || []).forEach(function (p) { if (p && p.category == null) p.category = ''; });
    d.schema = 3;
    return d;
  },
  // v3 → v4: ответственный за проект и «Карты ответственных»
  3: function (d) {
    (d.projects || []).forEach(function (p) { if (p && p.ownerId === undefined) p.ownerId = null; });
    if (!Array.isArray(d.maps)) d.maps = [];
    d.schema = 4;
    return d;
  },
  // v4 → v5: флажок «Веха» у задачи (дорожная карта и финиш проекта вычисляются из вех)
  4: function (d) {
    (d.tasks || []).forEach(function (t) { if (t && t.milestone === undefined) t.milestone = false; });
    if (d.settings && typeof d.settings === 'object' && !d.settings.roadmap) d.settings.roadmap = { expanded: false, range: 'year' };
    d.schema = 5;
    return d;
  },
  // v5 → v6: «Чек-лист дня» — 8 пунктов по умолчанию и журнал отметок по дням
  5: function (d) {
    if (!d.settings || typeof d.settings !== 'object') d.settings = {};
    if (!Array.isArray(d.settings.checklist)) d.settings.checklist = CL.defaults();
    if (!d.checklistLog || typeof d.checklistLog !== 'object') d.checklistLog = {};
    d.schema = 6;
    return d;
  },
};

/* ---------- Карты ответственных ----------
 * maps[]: { id, name, nodes[], createdAt, updatedAt, view? }
 * узел:   { id, type: 'person' | 'project' | 'group', ref, parentId, collapsed }
 *   ref: для person — имя из settings.people, для project — id проекта, для group — название направления.
 * Карта хранит только состав и структуру; счётчики не сохраняются (их считает respmap.js из задач).
 */
var MAP_NODE_TYPES = { person: true, project: true, group: true };
function rid(p) { return p + Math.random().toString(36).slice(2, 10); }

/* Приводит карты в порядок и убирает узлы с битыми ссылками (человек или проект удалён).
   Дочерние узлы удалённого переходят к его родителю. Возвращает число убранных узлов. */
function pruneMaps(d) {
  var removed = 0;
  var people = {}, pids = {};
  ((d.settings && d.settings.people) || []).forEach(function (x) { people[x] = true; });
  (d.projects || []).forEach(function (x) { pids[x.id] = true; });
  if (!Array.isArray(d.maps)) d.maps = [];
  d.maps = d.maps.filter(function (m) { return m && typeof m === 'object' && !Array.isArray(m); });
  d.maps.forEach(function (m) {
    if (!m.id) m.id = rid('m');
    m.name = m.name == null || m.name === '' ? 'Карта' : String(m.name);
    if (!m.createdAt) m.createdAt = new Date().toISOString();
    if (m.updatedAt === undefined) m.updatedAt = m.createdAt;
    if (m.view !== undefined && m.view !== 'tree' && m.view !== 'cards') delete m.view;
    var nodes = (Array.isArray(m.nodes) ? m.nodes : []).filter(function (n) { return n && typeof n === 'object' && MAP_NODE_TYPES[n.type]; });
    nodes.forEach(function (n) {
      if (!n.id) n.id = rid('n');
      n.id = String(n.id);
      n.ref = n.ref == null ? null : String(n.ref);
      n.parentId = n.parentId == null || n.parentId === '' ? null : String(n.parentId);
      n.collapsed = !!n.collapsed;
      if (n.type === 'group' && !n.ref) n.ref = 'Направление';
    });
    var broken = function (n) { return (n.type === 'person' && !people[n.ref]) || (n.type === 'project' && !pids[n.ref]); };
    var gone = {};
    nodes.forEach(function (n) { if (broken(n)) gone[n.id] = n; });
    var keep = nodes.filter(function (n) { return !gone[n.id]; });
    removed += nodes.length - keep.length;
    // дети убранных узлов поднимаются к ближайшему сохранившемуся предку
    keep.forEach(function (n) {
      var guard = 0;
      while (n.parentId && gone[n.parentId] && guard++ < 1000) n.parentId = gone[n.parentId].parentId;
    });
    var byId = {};
    keep.forEach(function (n) { byId[n.id] = n; });
    keep.forEach(function (n) { if (n.parentId && (!byId[n.parentId] || n.parentId === n.id)) n.parentId = null; });
    // разрываем циклы
    keep.forEach(function (n) {
      var seen = {}, cur = n;
      while (cur && cur.parentId) {
        if (seen[cur.id]) { n.parentId = null; break; }
        seen[cur.id] = true;
        cur = byId[cur.parentId];
      }
    });
    m.nodes = keep;
  });
  return removed;
}

/* Приводит данные любой версии к текущей. Безопасно вызывать повторно. */
function migrate(raw) {
  var d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (!d.schema) d.schema = 1;
  while (MIGRATIONS[d.schema] && d.schema < SCHEMA) d = MIGRATIONS[d.schema](d);
  // Недостающие поля — значения по умолчанию (новые поля не ломают старые копии).
  var def = emptyData();
  d.meta = Object.assign({}, def.meta, d.meta && typeof d.meta === 'object' ? d.meta : {});
  d.settings = Object.assign({}, def.settings, d.settings && typeof d.settings === 'object' ? d.settings : {});
  d.settings.summary = Object.assign({}, def.settings.summary, d.settings.summary || {});
  if (!Array.isArray(d.settings.people) || !d.settings.people.length) d.settings.people = def.settings.people;
  if (!Array.isArray(d.settings.statuses) || !d.settings.statuses.length) d.settings.statuses = def.settings.statuses;
  if (!Array.isArray(d.settings.importantRemind) || !d.settings.importantRemind.length) d.settings.importantRemind = def.settings.importantRemind;
  if (!Array.isArray(d.settings.showDeviceCalendars)) d.settings.showDeviceCalendars = [];
  ['contactTypes', 'contactStatuses'].forEach(function (k) { if (!Array.isArray(d.settings[k])) d.settings[k] = def.settings[k].slice(); });
  if (d.settings.crmSort !== 'name') d.settings.crmSort = 'due';
  if (d.settings.homeView !== 'projects') d.settings.homeView = 'map';
  var rm = d.settings.roadmap && typeof d.settings.roadmap === 'object' && !Array.isArray(d.settings.roadmap) ? d.settings.roadmap : {};
  d.settings.roadmap = Object.assign({}, rm, { expanded: rm.expanded === true, range: ['quarter', 'half', 'year', 'all'].indexOf(rm.range) >= 0 ? rm.range : 'year' });
  ['tasks', 'contacts', 'events', 'notes', 'projects'].forEach(function (k) {
    if (!Array.isArray(d[k])) d[k] = [];
    d[k] = d[k].filter(function (x) { return x && typeof x === 'object'; });
  });
  d.tasks.forEach(function (t) {
    t.crmIds = Array.isArray(t.crmIds) ? t.crmIds : []; t.eventIds = Array.isArray(t.eventIds) ? t.eventIds : []; t.deps = Array.isArray(t.deps) ? t.deps : [];
    t.status = t.status || 'todo'; t.assignee = t.assignee == null ? d.settings.me : t.assignee;
    if (t.projectId === undefined) t.projectId = null;
    if (!t.id) t.id = 't' + Math.random().toString(36).slice(2, 10);
    t.title = t.title == null ? '' : String(t.title);
    t.milestone = t.milestone === true;
  });
  d.events.forEach(function (e) {
    e.crmIds = Array.isArray(e.crmIds) ? e.crmIds : []; if (e.remind == null) e.remind = [d.settings.defaultRemind];
    if (!e.id) e.id = 'e' + Math.random().toString(36).slice(2, 10);
    e.start = e.start || ''; e.title = e.title == null ? '' : String(e.title);
  });
  d.notes.forEach(function (n) {
    n.crmIds = Array.isArray(n.crmIds) ? n.crmIds : [];
    if (!n.id) n.id = 'n' + Math.random().toString(36).slice(2, 10);
    if (n.html == null && n.body) n.html = textToHtml(n.body);
    if (n.body == null) n.body = n.html ? htmlToText(n.html) : '';
  });
  d.contacts.forEach(function (c) {
    c.tags = Array.isArray(c.tags) ? c.tags : []; c.types = Array.isArray(c.types) ? c.types : []; c.statuses = Array.isArray(c.statuses) ? c.statuses : [];
    if (!c.id) c.id = 'c' + Math.random().toString(36).slice(2, 10);
    c.name = c.name == null ? '' : String(c.name);
  });
  d.projects.forEach(function (p) {
    if (!p.id) p.id = 'p' + Math.random().toString(36).slice(2, 10);
    p.name = p.name == null ? 'Проект' : String(p.name);
    p.archived = !!p.archived;
    if (p.category == null) p.category = '';
    p.category = String(p.category);
    // ответственный — имя из списка исполнителей или null
    if (p.ownerId === undefined || p.ownerId === '' || (p.ownerId !== null && (typeof p.ownerId !== 'string' || d.settings.people.indexOf(p.ownerId) < 0))) p.ownerId = null;
  });
  if (!Array.isArray(d.settings.projectCategories)) d.settings.projectCategories = [];
  if (!d.settings.kanbanOrder || typeof d.settings.kanbanOrder !== 'object' || Array.isArray(d.settings.kanbanOrder)) d.settings.kanbanOrder = {};
  d.settings.projectCategories = d.settings.projectCategories.filter(function (c) { return typeof c === 'string' && c; });
  // Ссылки на удалённые проекты не ломают интерфейс
  var pids = {};
  d.projects.forEach(function (p) { pids[p.id] = true; });
  d.tasks.forEach(function (t) { if (t.projectId && !pids[t.projectId]) t.projectId = null; });
  pruneMaps(d);
  CL.normalize(d);
  if (d.settings.mapId != null && !d.maps.some(function (m) { return m.id === d.settings.mapId; })) d.settings.mapId = null;
  if (d.schema > SCHEMA) d.newerSchema = d.schema; // данные из более новой версии: неизвестные поля сохраняются как есть
  else { d.schema = SCHEMA; delete d.newerSchema; }
  return d;
}

/* Проверка целостности: возвращает список проблем (пустой — всё хорошо). */
function validateData(d) {
  var p = [];
  if (!d || typeof d !== 'object') return ['нет данных'];
  ['tasks', 'contacts', 'events', 'notes', 'projects', 'maps'].forEach(function (k) { if (!Array.isArray(d[k])) p.push(k + ' не массив'); });
  (d.maps || []).forEach(function (m, i) { if (!m.id || !Array.isArray(m.nodes)) p.push('карта #' + i); });
  if (!d.checklistLog || typeof d.checklistLog !== 'object' || Array.isArray(d.checklistLog)) p.push('checklistLog повреждён');
  if (!d.settings || !Array.isArray(d.settings.people) || !Array.isArray(d.settings.statuses)) p.push('settings повреждены');
  (d.tasks || []).forEach(function (t, i) { if (!t.id || !Array.isArray(t.crmIds) || !Array.isArray(t.eventIds) || !Array.isArray(t.deps)) p.push('задача #' + i); });
  (d.contacts || []).forEach(function (c, i) { if (!c.id || !Array.isArray(c.types) || !Array.isArray(c.statuses)) p.push('контакт #' + i); });
  (d.events || []).forEach(function (e, i) { if (!e.id || !Array.isArray(e.crmIds)) p.push('событие #' + i); });
  (d.notes || []).forEach(function (n, i) { if (!n.id || !Array.isArray(n.crmIds) || typeof n.body !== 'string') p.push('заметка #' + i); });
  return p;
}

/* Обёртка файла резервной копии. */
function wrapBackup(data) {
  return { format: BACKUP_FORMAT, schema: SCHEMA, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: data };
}

/* Разбор файла копии любой версии: { ok, data, newer, error }. Данные уже приведены к текущей схеме. */
function parseBackup(text) {
  var obj;
  try { obj = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, error: 'Файл не является резервной копией' }; }
  var data = obj && obj.format === BACKUP_FORMAT ? obj.data : obj;
  if (!data || typeof data !== 'object' || !('tasks' in data || 'contacts' in data || 'events' in data || 'notes' in data)) return { ok: false, error: 'В файле нет данных приложения' };
  var fileSchema = Number(data.schema || (obj && obj.schema) || 1);
  var d = migrate(JSON.parse(JSON.stringify(data)));
  var problems = validateData(d);
  if (problems.length) return { ok: false, error: 'Копия повреждена: ' + problems.slice(0, 3).join(', ') };
  return { ok: true, data: d, newer: fileSchema > SCHEMA, fileSchema: fileSchema };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APP_VERSION: APP_VERSION, SCHEMA: SCHEMA, BACKUP_FORMAT: BACKUP_FORMAT, emptyData: emptyData, migrate: migrate, MIGRATIONS: MIGRATIONS, validateData: validateData, wrapBackup: wrapBackup, parseBackup: parseBackup, htmlToText: htmlToText, textToHtml: textToHtml, pruneMaps: pruneMaps };
}
