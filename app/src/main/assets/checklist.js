/* 管理会计 — «Чек-лист дня» на «Моих делах».
 * Пункты — settings.checklist [{ id, name, archived }], отметки — checklistLog { 'YYYY-MM-DD': { [itemId]: 'HH:MM' } }.
 * Сброс без стирания: чек-лист дня берёт отметки только за сегодняшнюю дату, у нового дня отметок нет — всё открыто само.
 * История хранится 400 дней. Без зависимостей от интерфейса — проверяется node в CI (tests/checklist.test.js).
 */
'use strict';

var Checklist = (function () {
  var KEEP_DAYS = 400;
  var DEFAULTS = [
    'Битрикс — проверка задач и уведомлений',
    'Разбор календаря',
    'ЛК ЮЛ ФНС — проверка',
    'Разбор Диадок',
    'Разбор почты Яндекс и Битрикс',
    'Занесение в реестр документов за предыдущие и текущие сутки',
    'Результаты всех встреч и переговоров в форму задач и регламентов',
    'Все вводные за день фиксировать',
  ];
  function defaults() { return DEFAULTS.map(function (name, i) { return { id: 'cl' + (i + 1), name: name, archived: false }; }); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toUTC(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function ymdUTC(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(s, n) { return ymdUTC(toUTC(s) + n * 86400000); }
  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{2}:\d{2}$/;

  /* Приводит пункты и журнал в порядок (вызывается из migrate). */
  function normalize(d) {
    var s = d.settings || (d.settings = {});
    if (!Array.isArray(s.checklist)) s.checklist = defaults();
    var seen = {};
    s.checklist = s.checklist.filter(function (x) { return x && typeof x === 'object'; }).map(function (x, i) {
      var id = x.id ? String(x.id) : 'cl' + Math.random().toString(36).slice(2, 9);
      while (seen[id]) id = id + '_' + i;
      seen[id] = true;
      return Object.assign({}, x, { id: id, name: x.name == null ? '' : String(x.name), archived: x.archived === true });
    });
    if (typeof s.checklistShow !== 'boolean') s.checklistShow = true;
    var log = d.checklistLog && typeof d.checklistLog === 'object' && !Array.isArray(d.checklistLog) ? d.checklistLog : {};
    var clean = {};
    Object.keys(log).forEach(function (day) {
      if (!DAY_RE.test(day) || !log[day] || typeof log[day] !== 'object') return;
      var row = {};
      Object.keys(log[day]).forEach(function (id) { var t = log[day][id]; if (typeof t === 'string' && TIME_RE.test(t)) row[id] = t; });
      if (Object.keys(row).length) clean[day] = row;
    });
    d.checklistLog = clean;
    return d;
  }

  function active(d) { return ((d.settings && d.settings.checklist) || []).filter(function (x) { return !x.archived; }); }

  /* Пункты дня с отметками: [{ id, name, at: 'HH:MM' | null }] в заданном порядке. */
  function day(d, date) {
    var log = (d.checklistLog && d.checklistLog[date]) || {};
    return active(d).map(function (x) { return { id: x.id, name: x.name, at: log[x.id] || null }; });
  }
  function progress(d, date) {
    var items = day(d, date), done = items.filter(function (x) { return x.at; }).length;
    return { done: done, total: items.length, all: items.length > 0 && done === items.length };
  }

  /* Поставить / снять отметку. Возвращает true, если пункт теперь отмечен. */
  function toggle(d, id, date, time) {
    if (!d.checklistLog) d.checklistLog = {};
    var row = d.checklistLog[date] || (d.checklistLog[date] = {});
    if (row[id]) { delete row[id]; if (!Object.keys(row).length) delete d.checklistLog[date]; return false; }
    row[id] = time;
    return true;
  }

  /* Удаляет дни старше 400 дней. Возвращает число удалённых дней. */
  function prune(d, today, keep) {
    var from = addDays(today, -((keep || KEEP_DAYS) - 1)), n = 0;
    Object.keys(d.checklistLog || {}).forEach(function (k) { if (k < from) { delete d.checklistLog[k]; n++; } });
    return n;
  }

  /* История за N дней: дни (старые → новые) с долей выполнения и проценты по каждому активному пункту.
     Доля дня — отмеченные текущие пункты / число текущих пунктов (архивные пункты в долю не входят, но их отметки сохраняются). */
  function history(d, today, days) {
    var n = days || 30, items = active(d), out = [], per = {};
    items.forEach(function (x) { per[x.id] = 0; });
    for (var i = n - 1; i >= 0; i--) {
      var date = addDays(today, -i), row = (d.checklistLog && d.checklistLog[date]) || {};
      var done = items.filter(function (x) { return row[x.id]; }).length;
      items.forEach(function (x) { if (row[x.id]) per[x.id]++; });
      out.push({ day: date, done: done, total: items.length, ratio: items.length ? done / items.length : 0 });
    }
    return { days: out, items: items.map(function (x) { return { id: x.id, name: x.name, pct: Math.round(per[x.id] / n * 100) }; }) };
  }

  return { KEEP_DAYS: KEEP_DAYS, DEFAULTS: DEFAULTS, defaults: defaults, normalize: normalize, active: active, day: day, progress: progress, toggle: toggle, prune: prune, history: history, addDays: addDays };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Checklist;
