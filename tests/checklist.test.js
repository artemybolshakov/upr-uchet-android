/* «Чек-лист дня»: отметки по дням, сброс без стирания, история, удалённые пункты, миграция.
 * Запускается в CI (через tests/backup-compat.test.js) или отдельно: node tests/checklist.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const S = require('../app/src/main/assets/schema.js');
const C = require('../app/src/main/assets/checklist.js');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); }
}
const fresh = () => S.migrate({ schema: S.SCHEMA, settings: {} });

console.log('Чек-лист дня');
check('по умолчанию 8 пунктов в нужном порядке', () => {
  const d = fresh();
  assert.strictEqual(d.settings.checklist.length, 8);
  assert.strictEqual(d.settings.checklist[0].name, 'Битрикс — проверка задач и уведомлений');
  assert.strictEqual(d.settings.checklist[7].name, 'Все вводные за день фиксировать');
  assert.ok(d.settings.checklist.every((x) => x.archived === false && x.id));
  assert.strictEqual(d.settings.checklistShow, true);
  assert.deepStrictEqual(d.checklistLog, {});
});
check('отметки 21.10 не видны 22.10 (сброс без стирания)', () => {
  const d = fresh();
  C.toggle(d, 'cl1', '2026-10-21', '09:15');
  C.toggle(d, 'cl4', '2026-10-21', '10:02');
  assert.deepStrictEqual(C.progress(d, '2026-10-21'), { done: 2, total: 8, all: false });
  assert.deepStrictEqual(C.progress(d, '2026-10-22'), { done: 0, total: 8, all: false });
  assert.ok(C.day(d, '2026-10-22').every((x) => x.at === null));
  assert.strictEqual(C.day(d, '2026-10-21')[0].at, '09:15'); // история за 21.10 осталась
});
check('повторное нажатие снимает отметку; время записывается', () => {
  const d = fresh();
  assert.strictEqual(C.toggle(d, 'cl2', '2026-10-21', '08:00'), true);
  assert.strictEqual(d.checklistLog['2026-10-21'].cl2, '08:00');
  assert.strictEqual(C.toggle(d, 'cl2', '2026-10-21', '08:05'), false);
  assert.strictEqual(d.checklistLog['2026-10-21'], undefined);
});
check('всё отмечено → all', () => {
  const d = fresh();
  d.settings.checklist.forEach((x) => C.toggle(d, x.id, '2026-10-21', '12:00'));
  assert.deepStrictEqual(C.progress(d, '2026-10-21'), { done: 8, total: 8, all: true });
});
check('удалённый (archived) пункт пропадает из дня, история не ломается', () => {
  const d = fresh();
  C.toggle(d, 'cl3', '2026-10-20', '09:00');
  C.toggle(d, 'cl1', '2026-10-20', '09:01');
  d.settings.checklist.find((x) => x.id === 'cl3').archived = true;
  const m = S.migrate(JSON.parse(JSON.stringify(d)));
  assert.strictEqual(m.checklistLog['2026-10-20'].cl3, '09:00'); // отметка сохранилась
  assert.strictEqual(C.day(m, '2026-10-20').length, 7);
  assert.ok(!C.day(m, '2026-10-20').some((x) => x.id === 'cl3'));
  const h = C.history(m, '2026-10-21', 30);
  assert.strictEqual(h.items.length, 7);
  assert.strictEqual(h.days[28].day, '2026-10-20');
  assert.strictEqual(h.days[28].done, 1); // архивный пункт в долю не входит
});
check('история: 30 дней, проценты по пунктам', () => {
  const d = fresh();
  for (let i = 0; i < 28; i++) C.toggle(d, 'cl4', C.addDays('2026-10-21', -i), '10:00');
  const h = C.history(d, '2026-10-21', 30);
  assert.strictEqual(h.days.length, 30);
  assert.strictEqual(h.days[29].day, '2026-10-21');
  assert.strictEqual(h.items.find((x) => x.id === 'cl4').pct, 93); // 28 из 30
  assert.strictEqual(h.items.find((x) => x.id === 'cl1').pct, 0);
});
check('хранится 400 дней, более старые удаляются', () => {
  const d = fresh();
  C.toggle(d, 'cl1', '2025-09-16', '09:00'); // 401-й день (сегодня + 400 предыдущих не помещаются)
  C.toggle(d, 'cl1', '2025-09-17', '09:00'); // 400-й день, считая сегодня
  C.toggle(d, 'cl1', '2026-10-21', '09:00');
  assert.strictEqual(C.prune(d, '2026-10-21'), 1);
  assert.deepStrictEqual(Object.keys(d.checklistLog).sort(), ['2025-09-17', '2026-10-21']);
});
check('мусор в журнале и пунктах приводится в порядок', () => {
  const d = S.migrate({ schema: S.SCHEMA, settings: { checklist: [{ id: 'a', name: 'X', archived: 'да' }, null, { id: 'a', name: 'Y' }] }, checklistLog: { 'вчера': { a: '09:00' }, '2026-10-21': { a: '9 утра', b: '10:30' } } });
  assert.deepStrictEqual(d.settings.checklist.map((x) => [x.name, x.archived]), [['X', false], ['Y', false]]);
  assert.notStrictEqual(d.settings.checklist[0].id, d.settings.checklist[1].id);
  assert.deepStrictEqual(d.checklistLog, { '2026-10-21': { b: '10:30' } });
});
check('миграция старых копий создаёт 8 пунктов и пустой журнал', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const src = raw.format === S.BACKUP_FORMAT ? raw.data : raw;
    if (Number(src.schema || 1) >= 6) continue;
    const r = S.parseBackup(JSON.stringify(raw));
    assert.ok(r.ok, f + ': ' + r.error);
    assert.strictEqual(r.data.settings.checklist.length, 8, f);
    assert.deepStrictEqual(r.data.checklistLog, {}, f);
  }
});

if (failed) { console.error('\nПРОВАЛЕНО проверок: ' + failed); process.exit(1); }
console.log('\nЧек-лист дня: все проверки пройдены.');
