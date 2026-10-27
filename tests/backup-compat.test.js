/* Проверка совместимости резервных копий. Запускается в CI перед сборкой APK:
 *   node tests/backup-compat.test.js
 * Если любая копия из tests/fixtures перестала открываться — сборка падает.
 * При изменении схемы: добавьте миграцию в schema.js и положите сюда копию новой версии (см. docs/BACKUP_COMPATIBILITY.md).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const S = require('../app/src/main/assets/schema.js');

const dir = path.join(__dirname, 'fixtures');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
let failed = 0;
const seenSchemas = new Set();

function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e && e.message)); }
}
const count = (d) => ['tasks', 'contacts', 'events', 'notes', 'projects'].map((k) => (d[k] || []).length).join('/');

assert.ok(files.length > 0, 'нет файлов в tests/fixtures');
console.log(`Схема данных приложения: v${S.SCHEMA}, версия ${S.APP_VERSION}`);

for (const f of files) {
  console.log(f);
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  const raw = JSON.parse(text);
  const src = raw.format === S.BACKUP_FORMAT ? raw.data : raw;
  seenSchemas.add(Number(src.schema || 1));

  let res;
  check('открывается (parseBackup)', () => { res = S.parseBackup(text); assert.ok(res.ok, res.error); });
  if (!res || !res.ok) continue;
  const d = res.data;

  check('приведено к текущей схеме', () => assert.strictEqual(d.schema, S.SCHEMA));
  check('целостность (validateData)', () => assert.deepStrictEqual(S.validateData(d), []));
  check('ничего не потеряно', () => {
    for (const k of ['tasks', 'contacts', 'events', 'notes']) assert.strictEqual(d[k].length, (src[k] || []).length, k);
    for (const k of ['tasks', 'contacts', 'events', 'notes']) {
      (src[k] || []).forEach((x) => {
        const y = d[k].find((z) => z.id === x.id);
        assert.ok(y, `${k}: потерян ${x.id}`);
        for (const key of Object.keys(x)) {
          if (Array.isArray(x[key]) || typeof x[key] !== 'object') {
            assert.deepStrictEqual(y[key], x[key], `${k}.${x.id}.${key} изменилось`);
          }
        }
      });
    }
  });
  check('неизвестные поля сохраняются', () => {
    for (const key of Object.keys(src)) assert.ok(key in d, 'потеряно поле верхнего уровня ' + key);
  });
  check('повторный прогон ничего не меняет', () => {
    const again = S.migrate(JSON.parse(JSON.stringify(d)));
    assert.deepStrictEqual(again, d);
  });
  check('экспорт → импорт без потерь', () => {
    const exported = JSON.stringify(S.wrapBackup(d));
    const back = S.parseBackup(exported);
    assert.ok(back.ok, back.error);
    assert.deepStrictEqual(back.data, d);
  });
  check('заметки: простой текст всегда заполнен (для старых версий)', () => {
    d.notes.forEach((n) => assert.strictEqual(typeof n.body, 'string'));
  });
  console.log(`    записей: ${count(d)}`);
}

check(`есть копия текущей схемы v${S.SCHEMA} в tests/fixtures`, () => assert.ok(seenSchemas.has(S.SCHEMA), 'добавьте копию, сделанную текущей версией приложения'));
check('новая пустая база проходит проверку', () => assert.deepStrictEqual(S.validateData(S.migrate(S.emptyData())), []));
check('мусор не принимается за копию', () => {
  assert.strictEqual(S.parseBackup('не json').ok, false);
  assert.strictEqual(S.parseBackup('{"a":1}').ok, false);
});
check('копия из будущей версии открывается и помечается', () => {
  const future = S.wrapBackup(Object.assign(S.emptyData(), { schema: S.SCHEMA + 5, newCollection: [{ x: 1 }] }));
  const r = S.parseBackup(JSON.stringify(future));
  assert.ok(r.ok && r.newer, 'не открылась');
  assert.deepStrictEqual(r.data.newCollection, [{ x: 1 }]);
});

if (failed) { console.error(`\nПРОВАЛЕНО проверок: ${failed}. Резервные копии старых версий перестанут восстанавливаться — исправьте миграции.`); process.exit(1); }
console.log('\nВсе резервные копии совместимы.');

// Карта ответственных: миграция в v4 и счётчики (тот же шаг CI)
console.log('');
require('./respmap.test.js');

// CRM: сортировка по сроку «Связаться» (тот же шаг CI)
console.log('');
require('./crmsort.test.js');

// Быстрая смена срока задачи (тот же шаг CI)
console.log('');
require('./taskdates.test.js');

// Дорожная карта (тот же шаг CI)
console.log('');
require('./roadmap.test.js');

// Чек-лист дня (тот же шаг CI)
console.log('');
require('./checklist.test.js');

// Синхронизация с Битрикс24 (тот же шаг CI)
console.log('');
require('./bitrix.test.js');
