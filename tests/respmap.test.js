/* «Карта ответственных»: миграция в схему v4 и счётчики. Запускается в CI перед сборкой APK:
 *   node tests/respmap.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const S = require('../app/src/main/assets/schema.js');
const RM = require('../app/src/main/assets/respmap.js');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); }
}

console.log('Миграция старых копий в v' + S.SCHEMA);
const dir = path.join(__dirname, 'fixtures');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const src = raw.format === S.BACKUP_FORMAT ? raw.data : raw;
  if (Number(src.schema || 1) >= 4) continue; // копии v4+ проверяет backup-compat
  check(f + ': схема v' + S.SCHEMA + ', ownerId = null, maps = []', () => {
    const r = S.parseBackup(JSON.stringify(raw));
    assert.ok(r.ok, r.error);
    assert.strictEqual(r.data.schema, S.SCHEMA);
    assert.ok(r.data.projects.every((p) => p.ownerId === null), 'ownerId не null');
    assert.deepStrictEqual(r.data.maps, []);
  });
}

// Тестовые данные: «сегодня» — 2026-10-20
const TODAY = '2026-10-20';
function data() {
  return S.migrate({
    schema: 4,
    settings: { people: ['Я', 'Анна', 'Игорь'] },
    projects: [
      { id: 'P1', name: 'Сайт', ownerId: 'Анна' },
      { id: 'P2', name: 'Склад', ownerId: null },
      { id: 'P3', name: 'Пустой', ownerId: 'Анна' },
      { id: 'P4', name: 'Архив', ownerId: 'Анна', archived: true },
    ],
    tasks: [
      { id: 't1', title: 'Просрочено', projectId: 'P1', assignee: 'Игорь', status: 'todo', due: '2026-10-18' },
      { id: 't2', title: 'Завтра', projectId: 'P1', assignee: 'Анна', status: 'doing', due: '2026-10-21' },
      { id: 't3', title: 'Готово', projectId: 'P1', assignee: 'Анна', status: 'done', due: '2026-10-01' },
      { id: 't4', title: 'Сегодня, без проекта', projectId: null, assignee: 'Анна', status: 'todo', due: '2026-10-20' },
      { id: 't5', title: 'Без срока', projectId: 'P2', assignee: 'Анна', status: 'todo' },
      { id: 't6', title: 'Готово у Игоря', projectId: 'P2', assignee: 'Игорь', status: 'done', due: '2026-10-10' },
      { id: 't7', title: 'Через неделю', projectId: 'P2', assignee: 'Я', status: 'todo', due: '2026-10-27' },
    ],
    maps: [{
      id: 'M', name: 'Руководители', nodes: [
        { id: 'g', type: 'group', ref: 'Продажи', parentId: null },
        { id: 'na', type: 'person', ref: 'Анна', parentId: 'g' },
        { id: 'ni', type: 'person', ref: 'Игорь', parentId: 'g' },
        { id: 'p1', type: 'project', ref: 'P1', parentId: 'na' },
        { id: 'p2', type: 'project', ref: 'P2', parentId: null },
        { id: 'p3', type: 'project', ref: 'P3', parentId: 'na' },
      ],
    }],
  });
}

console.log('Счётчики');
check('проект: задачи проекта, просрочка и срок сегодня/завтра', () => {
  const st = RM.mapStats(data(), data().maps[0], TODAY);
  assert.deepStrictEqual([st.p1.open, st.p1.overdue, st.p1.soon, st.p1.level], [2, 1, 1, 'red']);
  assert.deepStrictEqual([st.p2.open, st.p2.overdue, st.p2.soon, st.p2.level], [2, 0, 0, 'gray']);
});
check('пустой проект: нули, серый', () => {
  const d = data();
  const st = RM.mapStats(d, d.maps[0], TODAY);
  assert.deepStrictEqual([st.p3.open, st.p3.overdue, st.p3.soon, st.p3.level], [0, 0, 0, 'gray']);
});
check('человек: свои задачи + открытые задачи его проектов без двойного счёта', () => {
  const d = data();
  const st = RM.mapStats(d, d.maps[0], TODAY);
  // Анна: t2 (своя и в её проекте — один раз), t4, t5 (свои), t1 (открыта в её проекте P1); t3 готова — не в работе
  assert.deepStrictEqual([st.na.open, st.na.overdue, st.na.soon, st.na.inOwn, st.na.level], [4, 1, 2, 2, 'red']);
  // Игорь: t1 (исполнитель, просрочена); t6 готова
  assert.deepStrictEqual([st.ni.open, st.ni.overdue, st.ni.soon, st.ni.inOwn], [1, 1, 0, 0]);
});
check('группа: сумма по дочерним узлам', () => {
  const d = data();
  const st = RM.mapStats(d, d.maps[0], TODAY);
  assert.deepStrictEqual([st.g.open, st.g.overdue, st.g.soon, st.g.level], [5, 2, 2, 'red']);
});
check('жёлтый: только сроки сегодня/завтра', () => {
  assert.strictEqual(RM.level({ open: 3, overdue: 0, soon: 1 }), 'yellow');
  assert.strictEqual(RM.level({ open: 3, overdue: 0, soon: 0 }), 'gray');
});
check('счётчики не сохраняются в карте', () => {
  const d = data();
  RM.mapStats(d, d.maps[0], TODAY);
  d.maps[0].nodes.forEach((n) => assert.deepStrictEqual(Object.keys(n).sort(), ['collapsed', 'id', 'parentId', 'ref', 'type']));
});

console.log('Структура');
check('«Собрать автоматически»: люди с проектами и их проекты, без дублей и архивных', () => {
  const d = data();
  const m = { id: 'X', name: 'Авто', nodes: [] };
  assert.strictEqual(RM.autoBuild(d, m), 3); // Анна + P1 + P3 (P4 в архиве, у P2 нет ответственного)
  const anna = m.nodes.find((n) => n.type === 'person');
  assert.strictEqual(anna.ref, 'Анна');
  assert.deepStrictEqual(m.nodes.filter((n) => n.parentId === anna.id).map((n) => n.ref).sort(), ['P1', 'P3']);
  assert.strictEqual(RM.autoBuild(d, m), 0);
});
check('убрать узел: дети переходят к его родителю', () => {
  const d = data();
  const m = d.maps[0];
  RM.removeNode(m, 'na');
  assert.strictEqual(m.nodes.find((n) => n.id === 'p1').parentId, 'g');
});
check('переместить: нельзя внутрь своей ветки', () => {
  const d = data();
  const m = d.maps[0];
  assert.strictEqual(RM.moveNode(m, 'g', 'p1'), false);
  assert.strictEqual(RM.moveNode(m, 'p2', 'ni'), true);
  assert.strictEqual(m.nodes.find((n) => n.id === 'p2').parentId, 'ni');
});
check('удалили человека и проект: узлы с битыми ссылками убираются, дети поднимаются', () => {
  const d = data();
  d.settings.people = d.settings.people.filter((x) => x !== 'Анна');
  d.projects = d.projects.filter((p) => p.id !== 'P2');
  assert.strictEqual(S.pruneMaps(d), 2);
  const ids = d.maps[0].nodes.map((n) => n.id).sort();
  assert.deepStrictEqual(ids, ['g', 'ni', 'p1', 'p3']);
  assert.strictEqual(d.maps[0].nodes.find((n) => n.id === 'p1').parentId, 'g');
  assert.strictEqual(S.pruneMaps(d), 0);
});
check('ответственный, которого нет среди исполнителей, сбрасывается', () => {
  const d = data();
  d.settings.people = ['Я'];
  const m = S.migrate(d);
  assert.ok(m.projects.every((p) => p.ownerId === null));
});

if (failed) { console.error('\nПРОВАЛЕНО проверок: ' + failed); process.exit(1); }
console.log('\nКарта ответственных: все проверки пройдены.');
