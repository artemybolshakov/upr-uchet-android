/* 管理会计 — синхронизация задач с Битрикс24 (REST, входящий вебхук): чистая логика без интерфейса.
 * Модель задачи не меняется: используется task.bitrixId (из импорта), всё остальное — в settings.bitrix:
 *   users   { имя исполнителя → ID пользователя Битрикса }
 *   groups  { ID проекта → ID группы (проекта) Битрикса }
 *   pushed  { ID задачи → updatedAt на момент выгрузки/загрузки }
 *   remoteChanged { bitrixId → CHANGED_DATE задачи в Битриксе после последней синхронизации }
 *   known   { bitrixId → название } — задачи, которые были связаны с Битриксом (для «удалено в приложении»)
 *   since   — с какого момента считать изменения у задач, ещё ни разу не выгруженных
 * Адрес вебхука здесь НЕ хранится (он только в настройках телефона, см. Bitrix.java).
 * Проверяется node в CI (tests/bitrix.test.js).
 */
'use strict';

var BitrixSync = (function () {
  var STATUS_TO = { todo: 2, doing: 3, wait: 6, done: 5 };
  var STATUS_NAMES = { 1: 'Новая', 2: 'Ждёт выполнения', 3: 'Выполняется', 4: 'Ждёт контроля', 5: 'Завершена', 6: 'Отложена', 7: 'Отклонена' };
  var ROADMAP = 'RoadMap';
  var SELECT = ['ID', 'TITLE', 'DESCRIPTION', 'RESPONSIBLE_ID', 'CREATED_BY', 'DEADLINE', 'START_DATE_PLAN', 'STATUS', 'GROUP_ID', 'PARENT_ID', 'PRIORITY', 'CHANGED_DATE', 'UF_CRM_TASK', 'TAGS'];

  function defaults() { return { users: {}, groups: {}, pushed: {}, remoteChanged: {}, known: {}, since: '', meId: '', meName: '', remind: false, remindTime: '19:00', lastPush: '', lastPull: '' }; }
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function normalize(b) {
    var d = defaults(), s = isObj(b) ? b : {};
    var out = Object.assign({}, s);
    Object.keys(d).forEach(function (k) {
      if (isObj(d[k])) out[k] = isObj(s[k]) ? Object.assign({}, s[k]) : {};
      else if (typeof d[k] === 'boolean') out[k] = s[k] === true;
      else out[k] = s[k] == null ? d[k] : String(s[k]);
    });
    if (!/^\d{2}:\d{2}$/.test(out.remindTime)) out.remindTime = '19:00';
    // адрес вебхука — пароль: в данных (а значит, в копиях и веб-версии) его быть не должно ни под каким именем
    Object.keys(out).forEach(function (k) { if (/hook|secret|token|key/i.test(k)) delete out[k]; });
    return out;
  }

  /* ---------- Имена ---------- */
  function normName(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim(); }
  /* Название группы без префикса-нумерации и эмодзи: «.1.2_🎮_Пролог» → «пролог» */
  function groupKey(s) { return normName(s).split(' ').filter(Boolean).filter(function (w, i, a) { return !(/^\d+$/.test(w) && a.slice(0, i).every(function (x) { return /^\d+$/.test(x); })); }).join(' '); }
  function field(o, name) {
    if (!o) return undefined;
    if (name in o) return o[name];
    var want = name.replace(/_/g, '').toLowerCase();
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && k.replace(/_/g, '').toLowerCase() === want) return o[k];
    return undefined;
  }
  function userName(u) {
    var n = [field(u, 'NAME'), field(u, 'LAST_NAME')].filter(Boolean).join(' ').trim();
    return n || field(u, 'EMAIL') || ('Пользователь ' + field(u, 'ID'));
  }
  function userWords(u) { return normName([field(u, 'NAME'), field(u, 'SECOND_NAME'), field(u, 'LAST_NAME')].join(' ')).split(' ').filter(Boolean); }

  /* Исполнители приложения → пользователи Битрикса. «Я» — владелец вебхука; остальные — по фамилии/имени,
     только однозначные совпадения. Уже выбранные вручную не меняются. Возвращает новый объект. */
  function matchUsers(people, me, users, currentId, existing) {
    var res = Object.assign({}, existing || {});
    (people || []).forEach(function (p) {
      if (res[p]) return;
      if (p === me && currentId) { res[p] = String(currentId); return; }
      var words = normName(p).split(' ').filter(Boolean);
      if (!words.length) return;
      var hits = (users || []).filter(function (u) { var w = userWords(u); return words.every(function (x) { return w.indexOf(x) >= 0; }); });
      if (hits.length > 1) hits = hits.filter(function (u) { return normName(field(u, 'LAST_NAME')) === normName(p) || normName(userName(u)) === normName(p); });
      if (hits.length === 1) res[p] = String(field(hits[0], 'ID'));
    });
    return res;
  }
  /* Проекты приложения → группы Битрикса по названию без префикса и эмодзи. */
  function matchGroups(projects, groups, existing) {
    var res = Object.assign({}, existing || {});
    (projects || []).forEach(function (p) {
      if (res[p.id]) return;
      var k = groupKey(p.name);
      if (!k) return;
      var hits = (groups || []).filter(function (g) { return groupKey(field(g, 'NAME')) === k; });
      if (hits.length === 1) res[p.id] = String(field(hits[0], 'ID'));
    });
    return res;
  }
  function invert(m) { var r = {}; Object.keys(m || {}).forEach(function (k) { if (m[k]) r[String(m[k])] = k; }); return r; }

  /* ---------- Статусы ---------- */
  function fromCode(code) {
    var c = Number(code);
    if (c === 3) return 'doing';
    if (c === 5) return 'done';
    if (c === 4 || c === 6 || c === 7) return 'wait';
    return 'todo';
  }
  /* Действия, чтобы статус задачи в Битриксе (remote) стал как в приложении (app). */
  function statusActions(app, remote) {
    var r = Number(remote) || 2;
    if (fromCode(r) === app) return [];
    var closed = r === 5 || r === 4 || r === 6 || r === 7;
    if (app === 'done') return ['tasks.task.complete'];
    if (app === 'todo') return closed ? ['tasks.task.renew'] : r === 3 ? ['tasks.task.pause'] : [];
    if (app === 'doing') return closed ? ['tasks.task.renew', 'tasks.task.start'] : ['tasks.task.start'];
    if (app === 'wait') return r === 5 ? ['tasks.task.renew', 'tasks.task.defer'] : ['tasks.task.defer'];
    return [];
  }

  /* ---------- Даты ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tz(d) { var m = -d.getTimezoneOffset(), s = m < 0 ? '-' : '+'; m = Math.abs(m); return s + pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  /* Дата приложения → дата Битрикса со смещением часового пояса телефона. Без времени — 23:59 (срок) или 00:00 (начало). */
  function toBxDate(date, time, start) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '').slice(0, 10))) return '';
    var t = /^\d{2}:\d{2}$/.test(time || '') ? time : (start ? '00:00' : '23:59');
    var p = String(date).slice(0, 10).split('-'), hm = t.split(':');
    var d = new Date(+p[0], +p[1] - 1, +p[2], +hm[0], +hm[1], 0);
    return String(date).slice(0, 10) + 'T' + t + ':00' + tz(d);
  }
  /* Дата Битрикса → { date, time } в часовом поясе телефона; 00:00 и 23:59 — «без времени». */
  function fromBxDate(s) {
    s = String(s || '').trim();
    if (!s) return null;
    var d = null, m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return { date: s, time: '' };
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:?\d{2}|Z)$/.test(s)) d = new Date(s);
    else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/))) d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    else if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/))) d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
    if (!d || isNaN(d.getTime())) return null;
    var time = pad(d.getHours()) + ':' + pad(d.getMinutes());
    return { date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), time: time === '00:00' || time === '23:59' ? '' : time };
  }
  function ms(s) { var t = Date.parse(s || ''); return isNaN(t) ? 0 : t; }

  /* ---------- Задача Битрикса ---------- */
  function parseTags(v) {
    if (v == null) return null;
    if (typeof v === 'string') return v.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var arr = Array.isArray(v) ? v : Object.keys(v).map(function (k) { return v[k]; });
    return arr.map(function (x) { return typeof x === 'string' ? x : x && (x.title || x.TITLE || x.name || x.NAME) || ''; }).filter(Boolean);
  }
  function asList(v) {
    if (v == null || v === '' || v === false) return [];
    if (Array.isArray(v)) return v.map(String).filter(Boolean);
    if (typeof v === 'object') return Object.keys(v).map(function (k) { return String(v[k]); }).filter(Boolean);
    return [String(v)];
  }
  function remoteTask(raw) {
    if (!raw) return null;
    if (raw.task && typeof raw.task === 'object') raw = raw.task;
    var id = function (k) { return field(raw, k); };
    var str = function (k) { var v = id(k); return v == null ? '' : String(v); };
    return {
      id: str('ID'), title: str('TITLE'), description: str('DESCRIPTION'), responsibleId: str('RESPONSIBLE_ID'), createdBy: str('CREATED_BY'),
      deadline: str('DEADLINE'), startDatePlan: str('START_DATE_PLAN'), status: Number(id('STATUS')) || 2, groupId: str('GROUP_ID') === '0' ? '' : str('GROUP_ID'),
      parentId: str('PARENT_ID') === '0' ? '' : str('PARENT_ID'), priority: Number(id('PRIORITY')) || 1, changedDate: str('CHANGED_DATE'),
      ufCrmTask: asList(id('UF_CRM_TASK')), tags: parseTags(id('TAGS')),
    };
  }

  /* ---------- Поля для tasks.task.add / tasks.task.update ----------
     Только перечисленные поля; постановщик, наблюдатели, соисполнители, чат и чужие теги не отправляются.
     ctx: { users, groups, me, tasksById, contactsById, knownBx } */
  function sameSet(a, b) { a = a.slice().sort(); b = b.slice().sort(); return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  function buildFields(t, ctx, remote) {
    var f = {}, warn = [];
    f.TITLE = t.title || 'Без названия';
    f.DESCRIPTION = t.desc || '';
    var uid = ctx.users[t.assignee || ctx.me];
    if (uid) f.RESPONSIBLE_ID = uid;
    else {
      warn.push('исполнитель «' + (t.assignee || ctx.me) + '» не сопоставлен');
      if (!remote && ctx.users[ctx.me]) f.RESPONSIBLE_ID = ctx.users[ctx.me];
    }
    f.DEADLINE = t.due ? toBxDate(t.due, t.dueTime) : '';
    f.START_DATE_PLAN = t.start ? toBxDate(t.start, '', true) : '';
    // Проект → группа
    var gid = t.projectId ? ctx.groups[t.projectId] : '';
    if (gid) f.GROUP_ID = gid;
    else if (t.projectId) warn.push('проект не сопоставлен с группой');
    else if (remote && remote.groupId && invert(ctx.groups)[remote.groupId]) f.GROUP_ID = 0; // проект сняли в приложении
    // Родительская задача
    var parent = t.parentId && ctx.tasksById[t.parentId];
    if (parent && parent.bitrixId) f.PARENT_ID = parent.bitrixId;
    else if (!t.parentId && remote && remote.parentId && ctx.knownBx[remote.parentId]) f.PARENT_ID = 0;
    // CRM: контакты с ID Битрикса; чужие привязки (компании, сделки, неизвестные контакты) сохраняются
    var mine = (t.crmIds || []).map(function (id) { var c = ctx.contactsById[id]; return c && c.bitrixId ? 'C_' + c.bitrixId : ''; }).filter(Boolean);
    if (!remote) { if (mine.length) f.UF_CRM_TASK = mine; }
    else {
      var appContactBx = {};
      Object.keys(ctx.contactsById).forEach(function (k) { var c = ctx.contactsById[k]; if (c.bitrixId) appContactBx['C_' + c.bitrixId] = true; });
      var keep = remote.ufCrmTask.filter(function (x) { return !appContactBx[x]; });
      var next = keep.concat(mine.filter(function (x) { return keep.indexOf(x) < 0; }));
      if (!sameSet(next, remote.ufCrmTask)) f.UF_CRM_TASK = next;
    }
    // Тег RoadMap — у вех; остальные теги задачи в Битриксе не трогаем
    if (!remote) { if (t.milestone) f.TAGS = [ROADMAP]; }
    else if (remote.tags) {
      var has = remote.tags.some(function (x) { return x.toLowerCase() === ROADMAP.toLowerCase(); });
      if (t.milestone && !has) f.TAGS = remote.tags.concat([ROADMAP]);
      if (!t.milestone && has) f.TAGS = remote.tags.filter(function (x) { return x.toLowerCase() !== ROADMAP.toLowerCase(); });
    }
    return { fields: f, warn: warn, waitParent: !!(parent && !parent.bitrixId) };
  }

  /* ---------- Задача Битрикса → поля приложения ---------- */
  function fromRemote(r, ctx) {
    var due = fromBxDate(r.deadline), start = fromBxDate(r.startDatePlan);
    var users = invert(ctx.users), groups = invert(ctx.groups);
    var crm = r.ufCrmTask.map(function (x) { var m = /^C_(\d+)$/.exec(x); return m ? m[1] : ''; }).filter(Boolean);
    return {
      title: r.title,
      desc: r.description,
      assignee: users[r.responsibleId] || (ctx.userNames && ctx.userNames[r.responsibleId]) || '',
      projectId: r.groupId ? groups[r.groupId] || null : null,
      groupUnmapped: !!(r.groupId && !groups[r.groupId]),
      due: due ? due.date : '', dueTime: due ? due.time : '',
      start: start ? start.date : '',
      status: fromCode(r.status),
      important: r.priority === 2,
      milestone: !!(r.tags && r.tags.some(function (x) { return x.toLowerCase() === ROADMAP.toLowerCase(); })),
      parentBx: r.parentId,
      crmBx: crm,
    };
  }

  /* Сравнение для экрана конфликта: { title, due, start, status, assignee, project } */
  var CMP = ['title', 'due', 'dueTime', 'start', 'status', 'assignee', 'projectId'];
  function differs(t, v) { return CMP.filter(function (k) { return String(t[k] == null ? '' : t[k]) !== String(v[k] == null ? '' : v[k]); }); }

  /* ---------- Что выгружать ---------- */
  function stamp(t) { return t.updatedAt || t.createdAt || ''; }
  function baseline(t, bx) { return bx.pushed[t.id] || bx.since || ''; }
  function changed(t, bx) { return ms(stamp(t)) > ms(baseline(t, bx)); }
  /* { updates: [задачи с bitrixId], adds: [новые], old: [старые без bitrixId, ещё не предлагались], deleted: [{bitrixId, title}] } */
  function pending(d, bx) {
    var res = { updates: [], adds: [], old: [], deleted: [] };
    var present = {};
    (d.tasks || []).forEach(function (t) {
      if (t.bitrixId) { present[t.bitrixId] = true; if (changed(t, bx)) res.updates.push(t); }
      else if (changed(t, bx)) res.adds.push(t);
      else if (!bx.pushed[t.id] && t.status !== 'done') res.old.push(t);
    });
    Object.keys(bx.known || {}).forEach(function (b) { if (!present[b]) res.deleted.push({ bitrixId: b, title: bx.known[b] }); });
    return res;
  }
  function pendingCount(d, bx) { var p = pending(d, bx); return p.updates.length + p.adds.length + p.deleted.length; }

  /* Конфликт: задачу в Битриксе меняли после последней синхронизации, и она отличается от версии приложения. */
  function isConflict(t, r, bx, ctx, importedAt) {
    var base = bx.remoteChanged[t.bitrixId] || importedAt || '';
    if (!r.changedDate || !base) return false;
    if (r.changedDate === base || ms(r.changedDate) <= ms(base)) return false;
    return differs(t, fromRemote(r, ctx)).length > 0;
  }

  /* Порядок добавления: сначала родители (чтобы у подзадач был PARENT_ID). Возвращает массив «волн». */
  function addRounds(adds) {
    var left = adds.slice(), ids = {}, rounds = [];
    adds.forEach(function (t) { ids[t.id] = true; });
    var done = {};
    while (left.length) {
      var round = left.filter(function (t) { return !t.parentId || !ids[t.parentId] || done[t.parentId]; });
      if (!round.length) round = left.slice(); // цикл в данных — без родителя
      round.forEach(function (t) { done[t.id] = true; });
      left = left.filter(function (t) { return !done[t.id]; });
      rounds.push(round);
    }
    return rounds;
  }

  /* ---------- batch ---------- */
  /* Параметры → строка запроса в формате PHP http_build_query (как ждёт batch) */
  function query(params, prefix) {
    var out = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k], key = prefix ? prefix + '[' + k + ']' : k;
      if (v == null) return;
      if (Array.isArray(v)) {
        if (!v.length) out.push(encodeURIComponent(key) + '=');
        v.forEach(function (x, i) { if (x && typeof x === 'object') out.push(query(x, key + '[' + i + ']')); else out.push(encodeURIComponent(key + '[' + i + ']') + '=' + encodeURIComponent(x === true ? 'Y' : x === false ? 'N' : x)); });
      } else if (typeof v === 'object') { var q = query(v, key); if (q) out.push(q); }
      else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(v === true ? 'Y' : v === false ? 'N' : v));
    });
    return out.filter(Boolean).join('&');
  }
  function cmd(method, params) { var q = query(params || {}); return method + (q ? '?' + q : ''); }
  function chunk(arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
  /* Ответ batch: { result: {key: …}, errors: {key: 'текст'}, next: {key: n} } */
  function parseBatch(body) {
    var r = body && body.result || {};
    var errs = {};
    var re = r.result_error || {};
    Object.keys(re).forEach(function (k) { var e = re[k]; errs[k] = e && (e.error_description || e.error) || String(e); });
    return { result: r.result || {}, errors: errs, next: r.result_next || {}, total: r.result_total || {} };
  }
  /* Текст ошибки REST для человека */
  function errorText(body, fallback) {
    if (body && (body.error_description || body.error)) {
      var code = body.error, d = body.error_description || '';
      if (code === 'insufficient_scope') return 'у вебхука нет нужных прав: ' + d;
      if (code === 'NO_AUTH_FOUND' || code === 'INVALID_CREDENTIALS' || code === 'expired_token') return 'вебхук не принят порталом — проверьте адрес';
      return d || code;
    }
    return fallback || 'неизвестная ошибка';
  }

  return {
    STATUS_TO: STATUS_TO, STATUS_NAMES: STATUS_NAMES, ROADMAP: ROADMAP, SELECT: SELECT,
    defaults: defaults, normalize: normalize, normName: normName, groupKey: groupKey, field: field, userName: userName,
    matchUsers: matchUsers, matchGroups: matchGroups, invert: invert, fromCode: fromCode, statusActions: statusActions,
    toBxDate: toBxDate, fromBxDate: fromBxDate, parseTags: parseTags, remoteTask: remoteTask, buildFields: buildFields, fromRemote: fromRemote,
    differs: differs, changed: changed, pending: pending, pendingCount: pendingCount, isConflict: isConflict, addRounds: addRounds,
    query: query, cmd: cmd, chunk: chunk, parseBatch: parseBatch, errorText: errorText,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BitrixSync;
