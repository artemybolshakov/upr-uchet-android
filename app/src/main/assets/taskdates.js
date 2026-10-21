/* 管理会计 — быстрая смена срока и начала задачи (окно по нажатию на чип срока).
 * Без зависимостей от интерфейса — проверяется node в CI (tests/taskdates.test.js).
 * Даты — строки 'YYYY-MM-DD', время — 'HH:MM'.
 */
'use strict';

var TaskDates = (function () {
  var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var QUICK = [['today', 'Сегодня'], ['tomorrow', 'Завтра'], ['after', 'Послезавтра'], ['week', 'Через неделю'], ['2weeks', 'Через 2 недели'], ['monday', 'Следующий понедельник']];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toUTC(s) { var p = String(s).slice(0, 10).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function ymd(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function add(s, n) { var d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function diff(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
  function valid(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10)); }

  /* Дата быстрой кнопки относительно «сегодня». «Следующий понедельник» — ближайший понедельник после сегодня. */
  function quick(key, today) {
    if (key === 'today') return today;
    if (key === 'tomorrow') return add(today, 1);
    if (key === 'after') return add(today, 2);
    if (key === 'week') return add(today, 7);
    if (key === '2weeks') return add(today, 14);
    if (key === 'monday') { var dow = toUTC(today).getUTCDay(); return add(today, ((8 - dow) % 7) || 7); }
    return null;
  }

  /* Что стоит в поле даты при открытии: текущее значение, а если оно прошло (или его нет) — завтра. */
  function defaultDate(cur, today) { return valid(cur) && String(cur).slice(0, 10) >= today ? String(cur).slice(0, 10) : add(today, 1); }

  /* Подпись для тоста: «завтра, 22 окт», «пн, 26 окт», «вчера, 20 окт»; с временем — «…, 14:30». */
  function label(s, today, time) {
    if (!valid(s)) return '';
    var d = toUTC(s), n = diff(today, s);
    var rel = n === 0 ? 'сегодня' : n === 1 ? 'завтра' : n === 2 ? 'послезавтра' : n === -1 ? 'вчера' : WD[d.getUTCDay()];
    var year = String(s).slice(0, 4) !== String(today).slice(0, 4) ? ' ' + String(s).slice(0, 4) : '';
    return rel + ', ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + year + (time ? ', ' + time : '');
  }

  /* Проверка «начало не позже срока». Возвращает null или { problem: 'start-after-due' | 'due-before-start', fix } */
  function check(start, due) {
    if (!valid(start) || !valid(due) || String(start).slice(0, 10) <= String(due).slice(0, 10)) return null;
    return { start: String(start).slice(0, 10), due: String(due).slice(0, 10) };
  }

  /* Напоминание задачи переезжает вместе со сроком: сдвиг на ту же разницу в днях (время сохраняется). */
  function shiftRemind(remindAt, oldDue, newDue) {
    if (!remindAt || !valid(oldDue) || !valid(newDue)) return remindAt;
    var n = diff(oldDue, newDue);
    if (!n) return remindAt;
    return add(String(remindAt).slice(0, 10), n) + String(remindAt).slice(10);
  }

  return { QUICK: QUICK, quick: quick, defaultDate: defaultDate, label: label, check: check, shiftRemind: shiftRemind, add: add, diff: diff, valid: valid };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TaskDates;
