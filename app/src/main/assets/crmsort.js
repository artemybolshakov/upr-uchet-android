/* 管理会计 — сортировка карточек CRM по сроку «Связаться» (nextContact).
 * Без зависимостей от интерфейса — проверяется node в CI (tests/crmsort.test.js).
 * Порядок «По сроку связи»: просроченные (от самого старого срока) → сегодня → будущие (от ближайшей даты) → без срока.
 * При одинаковой дате и в группе «Без срока» — по имени.
 */
'use strict';

var CrmSort = (function () {
  var GROUPS = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none'];

  // 'YYYY-MM-DD' (допускается хвост со временем) или null, если даты нет / она нечитаема
  function dueOf(c) {
    var s = c && c.nextContact ? String(c.nextContact).slice(0, 10) : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  function dayNum(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000; }
  function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ru'); }

  /* Группа карточки относительно «сегодня» (today — 'YYYY-MM-DD'). Неделя — с понедельника по воскресенье. */
  function group(c, today) {
    var d = dueOf(c);
    if (!d) return 'none';
    var diff = dayNum(d) - dayNum(today);
    if (diff < 0) return 'overdue';
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    var dow = (new Date(dayNum(today) * 86400000).getUTCDay() + 6) % 7; // 0 — понедельник
    return diff <= 6 - dow ? 'week' : 'later';
  }

  function compareDue(a, b) {
    var da = dueOf(a), db = dueOf(b);
    if (da && !db) return -1;
    if (!da && db) return 1;
    if (da && db && da !== db) return da < db ? -1 : 1; // по возрастанию даты: просроченные (старые) → сегодня → будущие
    return byName(a, b);
  }

  /* Сортирует копию списка. mode: 'due' (по умолчанию) | 'name'. */
  function sort(list, mode) {
    return list.slice().sort(mode === 'name' ? byName : compareDue);
  }

  /* Разбивка отсортированного по сроку списка на группы: [{ key, items }] — только непустые, в порядке GROUPS. */
  function groups(list, today) {
    var by = {};
    list.forEach(function (c) { var g = group(c, today); (by[g] = by[g] || []).push(c); });
    return GROUPS.filter(function (g) { return by[g]; }).map(function (g) { return { key: g, items: by[g] }; });
  }

  function mode(v) { return v === 'name' ? 'name' : 'due'; }

  return { GROUPS: GROUPS, dueOf: dueOf, group: group, compareDue: compareDue, byName: byName, sort: sort, groups: groups, mode: mode };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrmSort;
