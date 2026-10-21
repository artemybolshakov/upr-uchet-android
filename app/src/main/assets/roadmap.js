/* 管理会计 — «Дорожная карта»: лента вех компании.
 * Ничего не хранится: всё вычисляется из задач с флажком «Веха» (task.milestone) и сроком (task.due).
 * Срок (финиш) проекта = самый дальний срок среди его вех, включая выполненные.
 * Без зависимостей от интерфейса — проверяется node в CI (tests/roadmap.test.js).
 */
'use strict';

var Roadmap = (function () {
  var RANGES = { quarter: 'Квартал', half: 'Полгода', year: 'Год', all: 'Всё' };
  var STATE_RANK = { overdue: 3, soon: 2, later: 1, done: 0 };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function valid(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10)); }
  function day(s) { return String(s).slice(0, 10); }
  function toUTC(s) { var p = day(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function ymdUTC(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function diff(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
  function addDays(s, n) { return ymdUTC(toUTC(s) + n * 86400000); }
  function monthStart(s, add) { var p = day(s).split('-'); return ymdUTC(Date.UTC(+p[0], +p[1] - 1 + (add || 0), 1)); }
  function isDone(t) { return t.status === 'done'; }

  function projectsById(d) { var m = {}; (d.projects || []).forEach(function (p) { m[p.id] = p; }); return m; }
  // Вехи архивных проектов не показываются
  function visible(t, P) { return !(t.projectId && P[t.projectId] && P[t.projectId].archived); }

  /* Состояние вехи: done — выполнена; overdue — срок прошёл; soon — в ближайшие 7 дней; later — позже. */
  function state(t, today) {
    if (isDone(t)) return 'done';
    var n = diff(today, t.due);
    if (n < 0) return 'overdue';
    if (n <= 7) return 'soon';
    return 'later';
  }

  /* Ответственный за веху: ответственный проекта, иначе исполнитель задачи. */
  function owner(t, P) { var p = t.projectId && P[t.projectId]; return (p && p.ownerId) || t.assignee || ''; }

  /* Вехи на ленте: флажок «Веха» + срок, без архивных проектов. Отсортированы по сроку. */
  function milestones(d, today) {
    var P = projectsById(d);
    return (d.tasks || []).filter(function (t) { return t.milestone === true && valid(t.due) && visible(t, P); })
      .map(function (t) {
        var p = t.projectId && P[t.projectId];
        return { task: t, id: t.id, title: t.title, due: day(t.due), projectId: p ? p.id : null, owner: owner(t, P), state: state(t, today) };
      })
      .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : String(a.title).localeCompare(String(b.title), 'ru'); });
  }

  /* Вехи без срока (не на ленте) — для подсказки «Вехи без срока: N». Выполненные не считаются. */
  function undated(d) {
    var P = projectsById(d);
    return (d.tasks || []).filter(function (t) { return t.milestone === true && !valid(t.due) && !isDone(t) && visible(t, P); });
  }

  /* Финиш проекта: { due, task } по самой дальней вехе (включая выполненные) или null. */
  function projectFinish(d, pid) {
    var best = null;
    (d.tasks || []).forEach(function (t) {
      if (t.projectId !== pid || t.milestone !== true || !valid(t.due)) return;
      if (!best || day(t.due) > best.due) best = { due: day(t.due), task: t };
    });
    return best;
  }

  /* Строки «По проектам»: проекты (не архивные) с вехами на ленте.
     Полоса — от сегодняшнего дня или первой вехи (что раньше) до финиша; цвет — по худшему состоянию вех.
     Сортировка: сначала проекты с просроченными вехами, затем по дате финиша (ближайшие сверху). */
  function projectRows(d, today) {
    var all = milestones(d, today), by = {};
    all.forEach(function (m) { if (m.projectId) (by[m.projectId] = by[m.projectId] || []).push(m); });
    var P = projectsById(d);
    return Object.keys(by).map(function (pid) {
      var ms = by[pid], p = P[pid];
      var fin = projectFinish(d, pid);
      var worst = ms.reduce(function (w, m) { return STATE_RANK[m.state] > STATE_RANK[w] ? m.state : w; }, 'done');
      var first = ms[0].due;
      return { project: p, id: pid, milestones: ms, finish: fin.due, finishTask: fin.task, worst: worst, hasOverdue: worst === 'overdue', from: first < today ? first : today };
    }).sort(function (a, b) {
      return (b.hasOverdue - a.hasOverdue) || (a.finish < b.finish ? -1 : a.finish > b.finish ? 1 : 0) || String(a.project.name).localeCompare(String(b.project.name), 'ru');
    });
  }

  /* Диапазон шкалы. Все режимы начинаются с месяца до текущего:
     quarter — 4 месяца, half — 7, year — 13 (до 11 месяцев вперёд), all — от первой до последней вехи (не меньше «Года»). */
  function range(key, today, items) {
    var from = monthStart(today, -1);
    var len = { quarter: 4, half: 7, year: 13 }[key];
    if (len) return { from: from, to: addDays(monthStart(today, len - 1), -1) };
    var to = addDays(monthStart(today, 12), -1);
    (items || []).forEach(function (m) {
      if (m.due < from) from = monthStart(m.due);
      if (m.due > to) to = addDays(monthStart(m.due, 1), -1);
    });
    return { from: from, to: to };
  }

  /* Месяцы и кварталы шкалы: [{ from, to, label }] */
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function months(r) {
    var out = [], s = monthStart(r.from);
    while (s <= r.to) {
      var next = monthStart(s, 1);
      var m = +s.slice(5, 7) - 1;
      out.push({ from: s < r.from ? r.from : s, to: addDays(next, -1) > r.to ? r.to : addDays(next, -1), label: MONTHS[m] + (m === 0 ? ' ' + s.slice(0, 4) : ''), month: m, year: +s.slice(0, 4) });
      s = next;
    }
    return out;
  }
  function quarters(r) {
    var out = [];
    months(r).forEach(function (m) {
      var q = Math.floor(m.month / 3) + 1, key = m.year + '-Q' + q;
      var last = out[out.length - 1];
      if (last && last.key === key) last.to = m.to;
      else out.push({ key: key, from: m.from, to: m.to, label: q + ' кв. ' + m.year });
    });
    return out;
  }

  /* Группы по дате: на одну дату больше 3 вех — одна группа-кружок «+N». */
  function clusters(items, max) {
    var lim = max || 3, out = [], by = {};
    items.forEach(function (m) { (by[m.due] = by[m.due] || []).push(m); });
    Object.keys(by).sort().forEach(function (d) {
      var g = by[d];
      if (g.length > lim) out.push({ cluster: true, due: d, items: g, id: 'c' + d, state: g.reduce(function (w, m) { return STATE_RANK[m.state] > STATE_RANK[w] ? m.state : w; }, 'done') });
      else g.forEach(function (m) { out.push(m); });
    });
    return out;
  }

  /* Раскладка подписей: по очереди сверху и снизу шкалы; пересекающиеся подписи уходят на следующий ярус.
     marks: [{ x, w }] по возрастанию x (подпись по центру точки). sides: 'both' | 'top'.
     Возвращает [{ side: 'top'|'bottom', tier }] и число ярусов сверху и снизу. */
  function layout(marks, sides, gap) {
    var g = gap == null ? 8 : gap;
    var ends = { top: [], bottom: [] }, res = [], turn = 0;
    marks.forEach(function (m) {
      var left = m.x - m.w / 2, right = m.x + m.w / 2;
      var order = sides === 'top' ? ['top'] : (turn++ % 2 === 0 ? ['top', 'bottom'] : ['bottom', 'top']);
      // сторона по очереди; если на «своей» стороне нужен новый ярус, а на другой есть место ниже — берём другую
      var best = null;
      order.forEach(function (side, i) {
        var tiers = ends[side], t = 0;
        while (t < tiers.length && tiers[t] + g > left) t++;
        var cost = t * 2 + i;
        if (!best || cost < best.cost) best = { side: side, tier: t, cost: cost };
      });
      ends[best.side][best.tier] = right;
      res.push({ side: best.side, tier: best.tier });
    });
    return { items: res, top: ends.top.length, bottom: ends.bottom.length };
  }

  return {
    RANGES: RANGES, state: state, owner: owner, milestones: milestones, undated: undated, projectFinish: projectFinish,
    projectRows: projectRows, range: range, months: months, quarters: quarters, clusters: clusters, layout: layout, diff: diff, addDays: addDays,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Roadmap;
