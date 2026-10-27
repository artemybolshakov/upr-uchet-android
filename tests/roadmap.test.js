/* «Дорожная карта»: вехи, финиш проекта, строки «По проектам», шкала и раскладка подписей.
 * Запускается в CI (через tests/backup-compat.test.js) или отдельно: node tests/roadmap.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const S = require('../app/src/main/assets/schema.js');
const R = require('../app/src/main/assets/roadmap.js');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); }
}
const TODAY = '2026-10-21';
const T = (id, o) => Object.assign({ id, title: id, status: 'todo', assignee: 'Я', projectId: null, due: '', milestone: false, crmIds: [], eventIds: [], deps: [] }, o);
function data() {
  return S.migrate({
    schema: S.SCHEMA,
    settings: { people: ['Я', 'Анна', 'Игорь'] },
    projects: [
      { id: 'P1', name: 'Сайт', ownerId: 'Анна' },
      { id: 'P2', name: 'Склад', ownerId: null },
      { id: 'P3', name: 'Без вех', ownerId: 'Игорь' },
      { id: 'P4', name: 'Архив', ownerId: 'Анна', archived: true },
    ],
    tasks: [
      T('m1', { projectId: 'P1', due: '2026-11-15', milestone: true }),
      T('m2', { projectId: 'P1', due: '2027-03-31', milestone: true, status: 'done', title: 'Отчёт ИРИ' }),
      T('m3', { projectId: 'P2', due: '2026-10-25', milestone: true, assignee: 'Игорь' }),
      T('m4', { projectId: 'P2', due: '2026-10-10', milestone: true }),
      T('m5', { projectId: 'P4', due: '2026-12-01', milestone: true }),
      T('m6', { projectId: 'P1', milestone: true, title: 'Без срока' }),
      T('m7', { projectId: null, due: '2026-12-31', milestone: true, assignee: 'Игорь', title: 'Годовой отчёт' }),
      T('t1', { projectId: 'P3', due: '2026-11-01' }),
      T('t2', { projectId: 'P1', due: '2028-01-01' }),
    ],
  });
}

console.log('Дорожная карта: вехи');
check('на ленте только задачи с флажком и сроком, без архивных проектов; по сроку', () => {
  assert.deepStrictEqual(R.milestones(data(), TODAY).map((m) => m.id), ['m4', 'm3', 'm1', 'm7', 'm2']);
});
check('задача без флажка не попадает на ленту', () => {
  const ids = R.milestones(data(), TODAY).map((m) => m.id);
  assert.ok(!ids.includes('t1') && !ids.includes('t2'));
});
check('веха без срока не на ленте, но учтена в «Вехи без срока»', () => {
  assert.ok(!R.milestones(data(), TODAY).some((m) => m.id === 'm6'));
  assert.deepStrictEqual(R.undated(data()).map((t) => t.id), ['m6']);
});
check('состояния: выполнена, просрочена, ближайшие 7 дней, позже', () => {
  const st = Object.fromEntries(R.milestones(data(), TODAY).map((m) => [m.id, m.state]));
  assert.deepStrictEqual(st, { m4: 'overdue', m3: 'soon', m1: 'later', m7: 'later', m2: 'done' });
  assert.strictEqual(R.state({ due: '2026-10-28', status: 'todo' }, TODAY), 'soon');
  assert.strictEqual(R.state({ due: '2026-10-29', status: 'todo' }, TODAY), 'later');
});
check('ответственный: ответственный проекта, иначе исполнитель', () => {
  const ow = Object.fromEntries(R.milestones(data(), TODAY).map((m) => [m.id, m.owner]));
  assert.strictEqual(ow.m1, 'Анна');
  assert.strictEqual(ow.m3, 'Игорь');
  assert.strictEqual(ow.m7, 'Игорь');
});

console.log('Финиш проекта');
check('финиш = самая дальняя веха, включая выполненные', () => {
  const f = R.projectFinish(data(), 'P1');
  assert.strictEqual(f.due, '2027-03-31');
  assert.strictEqual(f.task.title, 'Отчёт ИРИ');
});
check('обычная задача с дальним сроком на финиш не влияет; проект без вех — без финиша', () => {
  assert.strictEqual(R.projectFinish(data(), 'P3'), null);
});

console.log('По проектам');
check('строки: только проекты с вехами, архивный скрыт; просроченные сверху, затем по финишу', () => {
  const rows = R.projectRows(data(), TODAY);
  assert.deepStrictEqual(rows.map((r) => [r.id, r.finish, r.worst]), [['P2', '2026-10-25', 'overdue'], ['P1', '2027-03-31', 'later']]);
});
check('полоса: от первой вехи, если она раньше сегодня, иначе от сегодня', () => {
  const rows = R.projectRows(data(), TODAY);
  assert.strictEqual(rows[0].from, '2026-10-10');
  assert.strictEqual(rows[1].from, TODAY);
});

console.log('Шкала');
check('шкала не меньше 12 месяцев, от месяца до сегодняшнего; режим масштаба на диапазон не влияет', () => {
  for (const k of ['quarter', 'half', 'year', 'all']) assert.deepStrictEqual(R.range(k, TODAY, []), { from: '2026-09-01', to: '2027-08-31' });
});
check('шкала покрывает все вехи: 2026, 2028, 2030 (ошибка 1.9.0: вехи после 13 месяцев пропадали)', () => {
  const items = [{ due: '2026-11-15' }, { due: '2028-03-10' }, { due: '2030-06-20' }];
  for (const k of ['quarter', 'half', 'year', 'all']) {
    const r = R.range(k, TODAY, items);
    assert.strictEqual(r.from, '2026-09-01');
    assert.strictEqual(r.to, '2030-07-31'); // месяц после последней вехи
    items.forEach((m) => assert.ok(m.due >= r.from && m.due <= r.to, k + ' ' + m.due));
  }
});
check('ранняя (просроченная) веха раздвигает начало шкалы', () => {
  assert.deepStrictEqual(R.range('year', TODAY, [{ due: '2026-03-10' }]), { from: '2026-03-01', to: '2027-02-28' });
});
check('масштаб: «Квартал» крупнее «Года», «Всё» вписывает всю шкалу', () => {
  const days = 1430;
  assert.ok(R.ppd('quarter', 1000, days) > R.ppd('half', 1000, days));
  assert.ok(R.ppd('half', 1000, days) > R.ppd('year', 1000, days));
  assert.ok(Math.abs(R.ppd('all', 1000, days) * days - 1000) < 1e-6);
  assert.ok(Math.abs(R.ppd('year', 1000, 200) * 200 - 1000) < 1e-6); // короткая шкала не уже окна
});
check('месяцы и кварталы, в том числе подписи лет 2029–2030', () => {
  const r = { from: '2026-09-01', to: '2026-12-31' };
  assert.deepStrictEqual(R.months(r).map((m) => m.label), ['сен', 'окт', 'ноя', 'дек']);
  assert.deepStrictEqual(R.quarters(r).map((q) => q.label), ['3 кв. 2026', '4 кв. 2026']);
  const far = R.range('all', TODAY, [{ due: '2030-02-14' }]);
  assert.ok(R.months(far).some((m) => m.label === 'янв 2029') && R.months(far).some((m) => m.label === 'янв 2030'));
  assert.deepStrictEqual(R.quarters(far).slice(-2).map((q) => q.label), ['4 кв. 2029', '1 кв. 2030']);
});
check('недели: понедельник, номер внутри месяца по четвергу', () => {
  assert.strictEqual(R.weekStart('2026-11-18'), '2026-11-16'); // среда → понедельник
  assert.strictEqual(R.weekStart('2026-11-16'), '2026-11-16');
  assert.strictEqual(R.weekStart('2026-11-22'), '2026-11-16'); // воскресенье
  assert.strictEqual(R.weekInfo('2026-11-16').label, '3-я неделя ноября');
  // неделя 28.09–04.10.2026: четверг 1 октября → 1-я неделя октября
  assert.deepStrictEqual([R.weekInfo('2026-09-28').n, R.weekInfo('2026-09-28').month], [1, 9]);
  // неделя 26.10–01.11.2026: четверг 29 октября → 5-я неделя октября
  assert.strictEqual(R.weekInfo('2026-10-26').label, '5-я неделя октября');
  const ws = R.weeks({ from: '2026-11-01', to: '2026-11-30' });
  assert.strictEqual(ws[0].monday, '2026-10-26');
  assert.strictEqual(ws[ws.length - 1].monday, '2026-11-30');
});
check('вехи по неделям: одна точка на проект и неделю, худшее состояние', () => {
  const it = (id, due, projectId, state) => ({ id, due, projectId, state });
  const g = R.byWeek([it('a', '2026-11-16', 'P1', 'later'), it('b', '2026-11-20', 'P1', 'overdue'), it('c', '2026-11-18', 'P2', 'soon'), it('d', '2026-11-25', null, 'done')], true);
  assert.deepStrictEqual(g.map((x) => [x.monday, x.projectId, x.ids.join(','), x.state]), [
    ['2026-11-16', 'P1', 'a,b', 'overdue'], ['2026-11-16', 'P2', 'c', 'soon'], ['2026-11-23', null, 'd', 'done']]);
  assert.strictEqual(R.byWeek([it('a', '2026-11-16', 'P1', 'later'), it('c', '2026-11-18', 'P2', 'soon')], false).length, 1);
});
check('больше 3 вех на одну дату — кружок «+N»', () => {
  const it = (id, due) => ({ id, due, state: 'later' });
  const out = R.clusters([it('a', '2026-11-01'), it('b', '2026-11-01'), it('c', '2026-11-01'), it('d', '2026-11-01'), it('e', '2026-11-02')]);
  assert.strictEqual(out.length, 2);
  assert.ok(out[0].cluster && out[0].items.length === 4);
  const three = R.clusters([it('a', '2026-11-01'), it('b', '2026-11-01'), it('c', '2026-11-01')]);
  assert.strictEqual(three.length, 3);
});
check('подписи по очереди сверху и снизу; пересечения — на следующий ярус', () => {
  const L = R.layout([{ x: 0, w: 100 }, { x: 10, w: 100 }, { x: 20, w: 100 }, { x: 300, w: 100 }]);
  assert.deepStrictEqual(L.items, [{ side: 'top', tier: 0 }, { side: 'bottom', tier: 0 }, { side: 'top', tier: 1 }, { side: 'bottom', tier: 0 }]);
  const one = R.layout([{ x: 0, w: 100 }, { x: 10, w: 100 }], 'top');
  assert.deepStrictEqual(one.items.map((x) => x.tier), [0, 1]);
});

console.log('Данные');
check('старые копии мигрируют с milestone: false и settings.roadmap', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const src = raw.format === S.BACKUP_FORMAT ? raw.data : raw;
    if (Number(src.schema || 1) >= 5) continue;
    const r = S.parseBackup(JSON.stringify(raw));
    assert.ok(r.ok, f + ': ' + r.error);
    assert.ok(r.data.tasks.every((t) => t.milestone === false), f + ': milestone');
    assert.deepStrictEqual(r.data.settings.roadmap, { expanded: false, range: 'year' }, f);
  }
});
check('мусор в settings.roadmap и milestone приводится в порядок', () => {
  const d = S.migrate({ schema: 5, settings: { roadmap: { expanded: 'yes', range: 'week' } }, tasks: [{ id: 'x', milestone: 'да' }] });
  assert.deepStrictEqual(d.settings.roadmap, { expanded: false, range: 'year' });
  assert.strictEqual(d.tasks[0].milestone, false);
});

if (failed) { console.error('\nПРОВАЛЕНО проверок: ' + failed); process.exit(1); }
console.log('\nДорожная карта: все проверки пройдены.');
