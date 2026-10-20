/* CRM: сортировка по сроку «Связаться» и группы списка. Запускается в CI перед сборкой APK
 * (через tests/backup-compat.test.js) или отдельно: node tests/crmsort.test.js
 */
'use strict';
const assert = require('assert');
const S = require('../app/src/main/assets/schema.js');
const CS = require('../app/src/main/assets/crmsort.js');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); }
}

const TODAY = '2026-10-20'; // вторник
const c = (name, nextContact) => ({ id: name, name, nextContact });
// намеренно перемешаны
const list = [
  c('Юрий без срока', ''),
  c('Борис через месяц', '2026-11-20'),
  c('Яна одна дата', '2026-10-27'),
  c('Анна без срока', ''),
  c('Галина завтра', '2026-10-21'),
  c('Вера просрочено недавно', '2026-10-18'),
  c('Дмитрий сегодня', '2026-10-20'),
  c('Алексей одна дата', '2026-10-27'),
  c('Олег просрочено давно', '2026-09-01'),
];

console.log('CRM: сортировка по сроку связи');
check('порядок: просроченные (старые → свежие), сегодня, будущие (ближние → дальние), без срока по алфавиту; одна дата — по имени', () => {
  assert.deepStrictEqual(CS.sort(list, 'due').map((x) => x.name), [
    'Олег просрочено давно',
    'Вера просрочено недавно',
    'Дмитрий сегодня',
    'Галина завтра',
    'Алексей одна дата',
    'Яна одна дата',
    'Борис через месяц',
    'Анна без срока',
    'Юрий без срока',
  ]);
});
check('по умолчанию (неизвестный режим) — по сроку', () => {
  assert.deepStrictEqual(CS.sort(list, undefined).map((x) => x.name), CS.sort(list, 'due').map((x) => x.name));
});
check('режим «По имени»', () => {
  assert.deepStrictEqual(CS.sort(list, 'name').map((x) => x.name), list.map((x) => x.name).sort((a, b) => a.localeCompare(b, 'ru')));
});
check('исходный список не меняется', () => {
  const before = list.map((x) => x.name);
  CS.sort(list, 'due');
  assert.deepStrictEqual(list.map((x) => x.name), before);
});
check('нечитаемая дата и дата со временем', () => {
  assert.strictEqual(CS.dueOf({ nextContact: 'когда-нибудь' }), null);
  assert.strictEqual(CS.dueOf({ nextContact: '2026-10-21T10:00' }), '2026-10-21');
  assert.strictEqual(CS.group({ nextContact: 'когда-нибудь' }, TODAY), 'none');
});

console.log('CRM: группы');
check('просрочено / сегодня / завтра / на этой неделе / позже / без срока', () => {
  const g = (d) => CS.group({ nextContact: d }, TODAY);
  assert.strictEqual(g('2026-10-19'), 'overdue');
  assert.strictEqual(g('2026-10-20'), 'today');
  assert.strictEqual(g('2026-10-21'), 'tomorrow');
  assert.strictEqual(g('2026-10-22'), 'week');
  assert.strictEqual(g('2026-10-25'), 'week'); // воскресенье
  assert.strictEqual(g('2026-10-26'), 'later'); // следующий понедельник
  assert.strictEqual(g(''), 'none');
});
check('в воскресенье «На этой неделе» пусто: завтра уже следующая неделя', () => {
  assert.strictEqual(CS.group({ nextContact: '2026-10-26' }, '2026-10-25'), 'tomorrow');
  assert.strictEqual(CS.group({ nextContact: '2026-10-27' }, '2026-10-25'), 'later');
});
check('группы идут по порядку, пустые пропускаются', () => {
  const gs = CS.groups(CS.sort(list, 'due'), TODAY);
  assert.deepStrictEqual(gs.map((x) => [x.key, x.items.length]), [['overdue', 2], ['today', 1], ['tomorrow', 1], ['later', 3], ['none', 2]]);
});

console.log('Настройка settings.crmSort');
check('нет в старых данных → «due»; «name» сохраняется; мусор → «due»', () => {
  assert.strictEqual(S.migrate({ schema: S.SCHEMA, settings: {} }).settings.crmSort, 'due');
  assert.strictEqual(S.migrate({ schema: S.SCHEMA, settings: { crmSort: 'name' } }).settings.crmSort, 'name');
  assert.strictEqual(S.migrate({ schema: S.SCHEMA, settings: { crmSort: 'xx' } }).settings.crmSort, 'due');
  assert.strictEqual(S.emptyData().settings.crmSort, 'due');
});

if (failed) { console.error('\nПРОВАЛЕНО проверок: ' + failed); process.exit(1); }
console.log('\nCRM: сортировка — все проверки пройдены.');
