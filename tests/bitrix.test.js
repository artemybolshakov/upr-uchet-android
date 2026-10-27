/* Синхронизация с Битрикс24 (bitrix.js): сопоставления, поля выгрузки, статусы, даты, конфликты.
 *   node tests/bitrix.test.js   (также вызывается из backup-compat.test.js) */
'use strict';
process.env.TZ = 'Europe/Moscow';
const assert = require('assert');
const B = require('../app/src/main/assets/bitrix.js');
const S = require('../app/src/main/assets/schema.js');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); }
}

console.log('Битрикс24: сопоставления');
const USERS = [
  { ID: '1', NAME: 'Артемий', LAST_NAME: 'Большаков' },
  { ID: '7', NAME: 'Андрей', LAST_NAME: 'Корепин' },
  { ID: '9', NAME: 'Анна', LAST_NAME: 'Смирнова' },
  { ID: '10', NAME: 'Анна', LAST_NAME: 'Петрова' },
];
check('«Корепин» ↔ «Андрей Корепин», «Я» ↔ владелец вебхука, неоднозначное — не сопоставляется', () => {
  const m = B.matchUsers(['Я', 'Корепин', 'Анна', 'Анна Петрова', 'Неизвестный'], 'Я', USERS, '1', {});
  assert.deepStrictEqual(m, { 'Я': '1', 'Корепин': '7', 'Анна Петрова': '10' });
});
check('выбранное вручную не перезаписывается', () => {
  assert.strictEqual(B.matchUsers(['Корепин'], 'Я', USERS, '1', { 'Корепин': '9' })['Корепин'], '9');
});
check('проекты ↔ группы без префикса и эмодзи', () => {
  const groups = [{ ID: '31', NAME: '.1.2_🎮_Пролог' }, { ID: '32', NAME: '2. Сайт компании' }, { ID: '33', NAME: 'Пролог 2' }];
  const m = B.matchGroups([{ id: 'p1', name: 'Пролог' }, { id: 'p2', name: 'Сайт компании' }, { id: 'p3', name: 'Склад' }], groups, {});
  assert.deepStrictEqual(m, { p1: '31', p2: '32' });
  assert.strictEqual(B.groupKey('.1.2_🎮_Пролог'), 'пролог');
});

console.log('Битрикс24: статусы и даты');
check('статусы: todo↔2, doing↔3, wait↔6, done↔5', () => {
  assert.deepStrictEqual(B.STATUS_TO, { todo: 2, doing: 3, wait: 6, done: 5 });
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map(B.fromCode), ['todo', 'todo', 'doing', 'wait', 'done', 'wait']);
});
check('действия смены статуса: завершить, вернуть из завершённых, начать, отложить, без лишних вызовов', () => {
  assert.deepStrictEqual(B.statusActions('done', 3), ['tasks.task.complete']);
  assert.deepStrictEqual(B.statusActions('todo', 5), ['tasks.task.renew']);
  assert.deepStrictEqual(B.statusActions('doing', 5), ['tasks.task.renew', 'tasks.task.start']);
  assert.deepStrictEqual(B.statusActions('doing', 2), ['tasks.task.start']);
  assert.deepStrictEqual(B.statusActions('todo', 3), ['tasks.task.pause']);
  assert.deepStrictEqual(B.statusActions('wait', 2), ['tasks.task.defer']);
  assert.deepStrictEqual(B.statusActions('wait', 4), []);
  assert.deepStrictEqual(B.statusActions('done', 5), []);
  assert.deepStrictEqual(B.statusActions('todo', 1), []);
});
check('даты: срок без времени — 23:59, начало — 00:00, часовой пояс телефона', () => {
  assert.strictEqual(B.toBxDate('2026-11-20', ''), '2026-11-20T23:59:00+03:00');
  assert.strictEqual(B.toBxDate('2026-11-20', '18:30'), '2026-11-20T18:30:00+03:00');
  assert.strictEqual(B.toBxDate('2026-11-20', '', true), '2026-11-20T00:00:00+03:00');
  assert.strictEqual(B.toBxDate('', ''), '');
});
check('даты из Битрикса: ISO со смещением, 00:00/23:59 — без времени', () => {
  assert.deepStrictEqual(B.fromBxDate('2026-11-20T18:00:00+03:00'), { date: '2026-11-20', time: '18:00' });
  assert.deepStrictEqual(B.fromBxDate('2026-11-20T23:59:00+03:00'), { date: '2026-11-20', time: '' });
  assert.deepStrictEqual(B.fromBxDate('2026-11-20T16:00:00+01:00'), { date: '2026-11-20', time: '18:00' });
  assert.deepStrictEqual(B.fromBxDate('20.11.2026 00:00:00'), { date: '2026-11-20', time: '' });
  assert.strictEqual(B.fromBxDate(''), null);
});

console.log('Битрикс24: поля выгрузки');
const ctx = {
  me: 'Я', users: { 'Я': '1', 'Корепин': '7' }, groups: { p1: '31' },
  tasksById: { tp: { id: 'tp', bitrixId: '500' }, tn: { id: 'tn' } },
  contactsById: { c1: { id: 'c1', bitrixId: '12' }, c2: { id: 'c2' }, c3: { id: 'c3', bitrixId: '13' } },
  knownBx: { 500: 'Родитель', 501: 'Старый родитель' },
};
const task = (o) => Object.assign({ id: 't1', title: 'Пролог: билд', desc: 'Собрать', assignee: 'Корепин', due: '2026-11-20', dueTime: '', start: '2026-11-10', status: 'todo', projectId: 'p1', parentId: 'tp', crmIds: ['c1', 'c2'], milestone: true }, o);
check('новая задача: только разрешённые поля, CRM C_<id>, тег RoadMap у вехи', () => {
  const r = B.buildFields(task(), ctx, null);
  assert.deepStrictEqual(Object.keys(r.fields).sort(), ['DEADLINE', 'DESCRIPTION', 'GROUP_ID', 'PARENT_ID', 'RESPONSIBLE_ID', 'START_DATE_PLAN', 'TAGS', 'TITLE', 'UF_CRM_TASK']);
  assert.strictEqual(r.fields.RESPONSIBLE_ID, '7');
  assert.strictEqual(r.fields.GROUP_ID, '31');
  assert.strictEqual(r.fields.PARENT_ID, '500');
  assert.deepStrictEqual(r.fields.UF_CRM_TASK, ['C_12']);
  assert.deepStrictEqual(r.fields.TAGS, ['RoadMap']);
  ['CREATED_BY', 'AUDITORS', 'ACCOMPLICES', 'CHAT_ID'].forEach((k) => assert.ok(!(k in r.fields), k));
});
check('обновление: чужие теги и CRM-привязки (компании, сделки) сохраняются', () => {
  const remote = B.remoteTask({ task: { id: '600', tags: { 3: { id: 3, title: 'Срочно' } }, ufCrmTask: ['CO_5', 'C_12', 'D_9'], groupId: '31', parentId: '500', status: '2' } });
  const r = B.buildFields(task({ crmIds: ['c3'] }), ctx, remote);
  assert.deepStrictEqual(r.fields.TAGS, ['Срочно', 'RoadMap']);
  assert.deepStrictEqual(r.fields.UF_CRM_TASK.sort(), ['CO_5', 'C_13', 'D_9']);
  const same = B.buildFields(task({ milestone: false, crmIds: ['c1'] }), ctx, remote);
  assert.ok(!('TAGS' in same.fields) && !('UF_CRM_TASK' in same.fields), 'без изменений эти поля не отправляются');
  const unTag = B.buildFields(task({ milestone: false }), ctx, B.remoteTask({ id: '600', TAGS: ['RoadMap', 'Срочно'], UF_CRM_TASK: [] }));
  assert.deepStrictEqual(unTag.fields.TAGS, ['Срочно']);
});
check('теги неизвестны (Битрикс не вернул) — TAGS не отправляется', () => {
  assert.ok(!('TAGS' in B.buildFields(task(), ctx, B.remoteTask({ id: '600' })).fields));
});
check('исполнитель не сопоставлен: у новой — ответственный «Я» и предупреждение, у существующей поле не трогается', () => {
  const a = B.buildFields(task({ assignee: 'Гость' }), ctx, null);
  assert.strictEqual(a.fields.RESPONSIBLE_ID, '1'); assert.ok(a.warn.length);
  assert.ok(!('RESPONSIBLE_ID' in B.buildFields(task({ assignee: 'Гость' }), ctx, B.remoteTask({ id: '600' })).fields));
});
check('проект и родитель сняты в приложении — снимаются и в Битриксе (только если были «нашими»)', () => {
  const remote = B.remoteTask({ id: '600', groupId: '31', parentId: '501' });
  const r = B.buildFields(task({ projectId: null, parentId: null }), ctx, remote);
  assert.strictEqual(r.fields.GROUP_ID, 0); assert.strictEqual(r.fields.PARENT_ID, 0);
  const foreign = B.buildFields(task({ projectId: null, parentId: null }), ctx, B.remoteTask({ id: '600', groupId: '77', parentId: '999' }));
  assert.ok(!('GROUP_ID' in foreign.fields) && !('PARENT_ID' in foreign.fields));
});
check('подзадача нового родителя ждёт его ID (волны добавления)', () => {
  assert.ok(B.buildFields(task({ parentId: 'tn' }), ctx, null).waitParent);
  const rounds = B.addRounds([{ id: 'c', parentId: 'b' }, { id: 'b', parentId: 'a' }, { id: 'a', parentId: null }, { id: 'x', parentId: 'tp' }]);
  assert.deepStrictEqual(rounds.map((r) => r.map((t) => t.id)), [['a', 'x'], ['b'], ['c']]);
});

console.log('Битрикс24: что выгружать, конфликты, удалённые');
check('изменения: updatedAt > pushed (или момента подключения); удалённые в приложении', () => {
  const bx = B.normalize({ since: '2026-10-01T00:00:00Z', pushed: { a: '2026-10-05T00:00:00Z' }, known: { 100: 'A', 200: 'Удалённая' } });
  const d = { tasks: [
    { id: 'a', bitrixId: '100', updatedAt: '2026-10-05T00:00:00Z' },        // уже выгружена
    { id: 'b', bitrixId: '101', updatedAt: '2026-10-06T00:00:00Z' },        // изменена после подключения
    { id: 'c', bitrixId: '102', updatedAt: '2026-09-01T00:00:00Z' },        // до подключения — не трогаем
    { id: 'n', updatedAt: '2026-10-07T00:00:00Z' },                         // новая
    { id: 'o', updatedAt: '2026-09-01T00:00:00Z', status: 'todo' },         // старая без ID — предлагается отдельно
  ] };
  const p = B.pending(d, bx);
  assert.deepStrictEqual([p.updates.map((t) => t.id), p.adds.map((t) => t.id), p.old.map((t) => t.id), p.deleted], [['b'], ['n'], ['o'], [{ bitrixId: '200', title: 'Удалённая' }]]);
  assert.strictEqual(B.pendingCount(d, bx), 3);
});
check('конфликт: в Битриксе меняли после синхронизации и версии различаются', () => {
  const bx = B.normalize({ remoteChanged: { 100: '2026-10-05T10:00:00+03:00' } });
  const t = { id: 'a', bitrixId: '100', title: 'Сайт', due: '2026-11-20', dueTime: '', start: '', status: 'todo', assignee: 'Я', projectId: null };
  const r = (o) => B.remoteTask(Object.assign({ id: '100', title: 'Сайт', deadline: '2026-11-20T23:59:00+03:00', status: '2', responsibleId: '1', changedDate: '2026-10-06T10:00:00+03:00' }, o));
  assert.strictEqual(B.isConflict(t, r({ title: 'Сайт v2' }), bx, ctx), true);
  assert.strictEqual(B.isConflict(t, r({}), bx, ctx), false, 'меняли, но совпадает');
  assert.strictEqual(B.isConflict(t, r({ title: 'Сайт v2', changedDate: '2026-10-05T10:00:00+03:00' }), bx, ctx), false, 'не меняли после синхронизации');
  assert.strictEqual(B.isConflict(t, r({ title: 'Сайт v2' }), B.normalize({}), ctx, '2026-10-01T00:00:00Z'), true, 'база — дата импорта файла');
});
check('задача Битрикса → приложение по сопоставлениям', () => {
  const v = B.fromRemote(B.remoteTask({ ID: '9', TITLE: 'T', RESPONSIBLE_ID: '7', GROUP_ID: '31', DEADLINE: '2026-11-20T18:00:00+03:00', STATUS: '5', PRIORITY: '2', TAGS: ['RoadMap'], UF_CRM_TASK: ['C_12', 'CO_1'], PARENT_ID: '0' }), ctx);
  assert.deepStrictEqual([v.assignee, v.projectId, v.due, v.dueTime, v.status, v.important, v.milestone, v.crmBx, v.parentBx], ['Корепин', 'p1', '2026-11-20', '18:00', 'done', true, true, ['12'], '']);
});

console.log('Битрикс24: batch и хранение');
check('строка команды batch (как http_build_query)', () => {
  assert.strictEqual(B.cmd('tasks.task.update', { taskId: 5, fields: { TITLE: 'A&B', TAGS: ['x', 'y'], UF_CRM_TASK: [] } }),
    'tasks.task.update?taskId=5&fields%5BTITLE%5D=A%26B&fields%5BTAGS%5D%5B0%5D=x&fields%5BTAGS%5D%5B1%5D=y&fields%5BUF_CRM_TASK%5D=');
  assert.strictEqual(B.cmd('tasks.task.list', { filter: { '!STATUS': 5 } }), 'tasks.task.list?filter%5B!STATUS%5D=5');
  assert.deepStrictEqual(B.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
check('ответ batch: результаты и ошибки по ключам', () => {
  const r = B.parseBatch({ result: { result: { a: { task: { id: 1 } } }, result_error: { b: { error: 'ERR', error_description: 'Нет доступа' } }, result_next: { a: 50 } } });
  assert.deepStrictEqual([r.result.a.task.id, r.errors.b, r.next.a], [1, 'Нет доступа', 50]);
});
check('settings.bitrix: значения по умолчанию в схеме, адреса вебхука в данных нет', () => {
  const d = S.migrate({ schema: 6, settings: {}, tasks: [] });
  assert.deepStrictEqual(Object.keys(d.settings.bitrix).sort(), Object.keys(B.defaults()).sort());
  assert.strictEqual(d.settings.bitrix.remindTime, '19:00');
  assert.ok(!/webhook|rest\//i.test(JSON.stringify(S.emptyData())));
  const kept = S.migrate({ schema: 6, settings: { bitrix: { users: { 'Я': '1' }, remindTime: 'x', webhookUrl: 'https://a/rest/1/k/' } } });
  assert.deepStrictEqual(kept.settings.bitrix.users, { 'Я': '1' });
  assert.strictEqual(kept.settings.bitrix.remindTime, '19:00');
  assert.ok(!('webhookUrl' in kept.settings.bitrix), 'случайно попавший адрес вебхука вычищается');
});

if (failed) { console.error('\nПРОВАЛЕНО проверок синхронизации с Битрикс24: ' + failed); process.exit(1); }
console.log('Синхронизация с Битрикс24: все проверки пройдены.');
