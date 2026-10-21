/* Быстрая смена срока задачи: даты быстрых кнопок, значение по умолчанию, подписи, проверка «начало не позже срока».
 * Запускается в CI (через tests/backup-compat.test.js) или отдельно: node tests/taskdates.test.js
 */
'use strict';
const assert = require('assert');
const TD = require('../app/src/main/assets/taskdates.js');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); }
}
const TODAY = '2026-10-21'; // среда

console.log('Быстрая смена срока задачи');
check('быстрые кнопки', () => {
  assert.deepStrictEqual(TD.QUICK.map(([k]) => TD.quick(k, TODAY)), ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-28', '2026-11-04', '2026-10-26']);
});
check('«Следующий понедельник»: в понедельник — через неделю, в воскресенье — завтра; через границу года', () => {
  assert.strictEqual(TD.quick('monday', '2026-10-26'), '2026-11-02');
  assert.strictEqual(TD.quick('monday', '2026-10-25'), '2026-10-26');
  assert.strictEqual(TD.quick('week', '2026-12-28'), '2027-01-04');
});
check('по умолчанию: текущий срок, а если прошёл или его нет — завтра', () => {
  assert.strictEqual(TD.defaultDate('2026-10-30', TODAY), '2026-10-30');
  assert.strictEqual(TD.defaultDate('2026-10-21', TODAY), '2026-10-21');
  assert.strictEqual(TD.defaultDate('2026-10-20', TODAY), '2026-10-22');
  assert.strictEqual(TD.defaultDate('', TODAY), '2026-10-22');
});
check('подпись для тоста', () => {
  assert.strictEqual(TD.label('2026-10-22', TODAY), 'завтра, 22 окт');
  assert.strictEqual(TD.label('2026-10-21', TODAY, '14:30'), 'сегодня, 21 окт, 14:30');
  assert.strictEqual(TD.label('2026-10-26', TODAY), 'пн, 26 окт');
  assert.strictEqual(TD.label('2027-01-04', TODAY), 'пн, 4 янв 2027');
});
check('начало не позже срока', () => {
  assert.strictEqual(TD.check('2026-10-20', '2026-10-22'), null);
  assert.strictEqual(TD.check('2026-10-22', '2026-10-22'), null);
  assert.ok(TD.check('2026-10-25', '2026-10-22'));
  assert.strictEqual(TD.check('', '2026-10-22'), null);
  assert.strictEqual(TD.check('2026-10-25', ''), null);
});
check('напоминание переезжает вместе со сроком', () => {
  assert.strictEqual(TD.shiftRemind('2026-10-20T09:30', '2026-10-20', '2026-10-22'), '2026-10-22T09:30');
  assert.strictEqual(TD.shiftRemind('2026-10-19T18:00', '2026-10-20', '2026-10-27'), '2026-10-26T18:00');
  assert.strictEqual(TD.shiftRemind('', '2026-10-20', '2026-10-22'), '');
  assert.strictEqual(TD.shiftRemind('2026-10-20T09:30', '', '2026-10-22'), '2026-10-20T09:30');
});

if (failed) { console.error('\nПРОВАЛЕНО проверок: ' + failed); process.exit(1); }
console.log('\nБыстрая смена срока: все проверки пройдены.');
