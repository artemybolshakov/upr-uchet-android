/* Синхронизация задач с Битрикс24 через входящий вебхук: раздел настроек, сопоставления,
 * «Выгрузить в Битрикс», «Загрузить из Битрикса», напоминание о невыгруженных изменениях.
 * Вызовы REST делает телефон (Bitrix.java); адрес вебхука хранится только там и в JS не возвращается.
 * В веб-версии (с компьютера) раздел только показывает, сколько изменений ждёт выгрузки. */
'use strict';

(function () {
  const BX = BitrixSync;
  const bxs = () => D.settings.bitrix;
  const PHONE = !!(N && N.bitrixCall);
  const OFFLINE = 'Нет связи с Битрикс24 — проверьте интернет. Изменения не потеряны: они уйдут при следующей выгрузке.';
  const HOOK_HINT = 'Битрикс24 → Разработчикам → Другое → Входящий вебхук. Права: задачи (task) и пользователи (user), при необходимости — рабочие группы (sonet_group) и CRM (crm).';

  function info() { try { return PHONE ? JSON.parse(N.bitrixInfo() || '{}') : {}; } catch (e) { return {}; } }

  /* ---------- Вызовы REST через телефон ---------- */
  let seq = 0;
  const waiting = {};
  class BxError extends Error { constructor(msg, offline) { super(msg); this.offline = !!offline; } }
  const prevNative = window.__native;
  window.__native = function (type, payload) {
    if (type === 'bitrix') {
      let o = null;
      try { o = JSON.parse(payload); } catch (e) { return; }
      const w = o && waiting[o.id];
      if (w) { delete waiting[o.id]; w(o); }
      return;
    }
    if (type === 'open' && payload === 'bitrix:push') { go('settings'); setTimeout(() => ACTIONS['bx-push'](), 300); return; }
    return prevNative(type, payload);
  };
  function call(method, params) {
    return new Promise((resolve, reject) => {
      const id = 'bx' + (++seq);
      const timer = setTimeout(() => { delete waiting[id]; reject(new BxError('Битрикс24 не ответил вовремя. ' + OFFLINE, true)); }, 150000);
      waiting[id] = (o) => {
        clearTimeout(timer);
        if (!o.ok && o.error) {
          const map = { offline: OFFLINE, nohook: 'Не указан адрес вебхука', ssl: 'Ошибка защищённого соединения с порталом' };
          reject(new BxError(map[o.error] || o.error, o.error === 'offline'));
          return;
        }
        let body = null;
        try { body = JSON.parse(o.body || ''); } catch (e) { /* */ }
        if (!body) { reject(new BxError(o.status === 404 ? 'Портал не найден — проверьте адрес вебхука' : 'Портал ответил не в формате JSON (код ' + o.status + ')')); return; }
        if (body.error) { reject(new BxError(BX.errorText(body))); return; }
        resolve(body);
      };
      try { N.bitrixCall(id, method, JSON.stringify(params || {})); } catch (e) { clearTimeout(timer); delete waiting[id]; reject(new BxError('Не удалось обратиться к Битрикс24')); }
    });
  }
  /* batch: до 50 команд за вызов; ошибки — по ключам, остальные команды выполняются */
  async function batch(cmds) {
    const out = { result: {}, errors: {}, next: {} };
    for (const part of BX.chunk(Object.keys(cmds), 50)) {
      const c = {};
      part.forEach((k) => { c[k] = cmds[k]; });
      const r = BX.parseBatch(await call('batch', { halt: 0, cmd: c }));
      Object.assign(out.result, r.result); Object.assign(out.errors, r.errors); Object.assign(out.next, r.next);
    }
    return out;
  }
  /* Списочные методы (user.get, sonet_group.get) — все страницы */
  async function listAll(method, params) {
    let start = 0, all = [];
    for (let i = 0; i < 200; i++) {
      const b = await call(method, Object.assign({}, params, { start }));
      const r = b.result;
      all = all.concat(Array.isArray(r) ? r : (r && r.tasks) || []);
      if (b.next == null) break;
      start = b.next;
    }
    return all;
  }

  async function ensureMe() {
    const r = await call('user.current');
    const u = r.result || {};
    const b = bxs();
    b.meId = String(BX.field(u, 'ID') || '');
    b.meName = BX.userName(u);
    if (!b.since) b.since = (D.settings.lastBitrixImport || {}).tasks || new Date().toISOString();
    if (b.meId && !b.users[D.settings.me]) b.users[D.settings.me] = b.meId;
    return b.meId;
  }
  function ctx(extra) {
    const b = bxs(), tasksById = {}, contactsById = {};
    D.tasks.forEach((t) => { tasksById[t.id] = t; });
    D.contacts.forEach((c) => { contactsById[c.id] = c; });
    const knownBx = Object.assign({}, b.known);
    D.tasks.forEach((t) => { if (t.bitrixId) knownBx[t.bitrixId] = t.title; });
    return Object.assign({ me: D.settings.me, users: b.users, groups: b.groups, tasksById, contactsById, knownBx }, extra || {});
  }
  function ready() {
    if (!PHONE) { toast('Синхронизация с Битрикс24 работает в приложении на телефоне'); return false; }
    if (!info().configured) { toast('Сначала укажите адрес вебхука'); return false; }
    return true;
  }
  function busy(text) { modal(`<h3>Битрикс24</h3><div class="sub bx-busy">${esc(text)}</div>`); }
  function fail(e) {
    save(true); render();
    modal(`<h3>${e && e.offline ? 'Нет связи с Битрикс24' : 'Ошибка Битрикс24'}</h3><div class="sub">${esc(e && e.message || String(e))}</div>
      <div class="form-actions mt"><button class="btn" data-a="modal-close">Понятно</button></div>`);
  }
  const plural3 = (n, a, b, c) => n + ' ' + plural(n, a, b, c);
  const when = (s) => (s ? new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

  /* ---------- Вебхук ---------- */
  ACTIONS['bx-hook-save'] = async () => {
    const el = $('#bx-hook');
    const v = el ? el.value.trim() : '';
    if (!v) { toast('Вставьте адрес вебхука'); return; }
    const r = N.bitrixSetWebhook(v);
    if (r !== 'ok') { toast('Адрес не похож на вебхук: https://<портал>.bitrix24.ru/rest/<id>/<ключ>/'); return; }
    el.value = '';
    await check();
  };
  ACTIONS['bx-check'] = () => check();
  ACTIONS['bx-hook-clear'] = () => confirmBox('Удалить адрес вебхука с телефона? Сопоставления и отметки выгрузки сохранятся.', () => { N.bitrixSetWebhook(''); modal(null); render(); toast('Адрес вебхука удалён'); }, 'Удалить');
  async function check() {
    busy('Проверяю подключение…');
    try {
      await ensureMe();
      let scopes = [];
      try { const s = await call('scope'); scopes = Array.isArray(s.result) ? s.result : []; } catch (e) { /* метод может быть недоступен */ }
      const miss = scopes.length ? ['task', 'user'].filter((x) => scopes.indexOf(x) < 0) : [];
      save(true); render();
      modal(`<h3>Подключено</h3><div class="sub">Портал ${esc(info().host || '')}, вы — <b>${esc(bxs().meName)}</b> (ID ${esc(bxs().meId)}).</div>
        ${scopes.length ? `<div class="sub mt">Права вебхука: ${esc(scopes.join(', '))}</div>` : ''}
        ${miss.length ? `<div class="sub mt bx-warn">Не хватает прав: ${esc(miss.join(', '))}. Добавьте их в настройках вебхука.</div>` : ''}
        <div class="form-actions mt"><button class="btn primary" data-a="bx-map">Сопоставить людей и проекты</button><button class="btn" data-a="modal-close">Готово</button></div>`);
    } catch (e) { fail(e); }
  }

  /* ---------- Сопоставления ---------- */
  let mapDraft = null;
  const cache = { users: null, groups: null };
  ACTIONS['bx-map'] = async () => {
    if (!ready()) return;
    busy('Загружаю пользователей и группы Битрикс24…');
    try {
      await ensureMe();
      cache.users = await listAll('user.get', { filter: { ACTIVE: true } });
      try { cache.groups = await listAll('sonet_group.get', { ORDER: { NAME: 'ASC' } }); } catch (e) { cache.groups = []; mapDraft = { groupsError: e.message }; }
      const b = bxs();
      const projects = D.projects.filter((p) => !p.archived);
      mapDraft = Object.assign(mapDraft || {}, {
        users: BX.matchUsers(D.settings.people, D.settings.me, cache.users, b.meId, b.users),
        groups: BX.matchGroups(projects, cache.groups, b.groups),
      });
      renderMap();
    } catch (e) { fail(e); }
  };
  function renderMap() {
    const b = bxs(), dr = mapDraft;
    const users = cache.users.slice().sort((x, y) => BX.userName(x).localeCompare(BX.userName(y), 'ru'));
    const groups = (cache.groups || []).slice().sort((x, y) => String(BX.field(x, 'NAME')).localeCompare(String(BX.field(y, 'NAME')), 'ru'));
    const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
    const auto = (was, now) => (now && !was ? ' <span class="chip blue">авто</span>' : '');
    const urows = D.settings.people.map((p) => `<div class="field"><label>${esc(p)}${p === D.settings.me ? ' (вы)' : ''}${auto(b.users[p], dr.users[p])}</label>
      <select data-bxu="${esc(p)}">${opt('', '— не сопоставлен —', !dr.users[p])}${users.map((u) => opt(BX.field(u, 'ID'), BX.userName(u) + (BX.field(u, 'WORK_POSITION') ? ' · ' + BX.field(u, 'WORK_POSITION') : ''), String(BX.field(u, 'ID')) === String(dr.users[p]))).join('')}</select></div>`).join('');
    const prows = D.projects.filter((p) => !p.archived).map((p) => `<div class="field"><label>${esc(p.name)}${auto(b.groups[p.id], dr.groups[p.id])}</label>
      <select data-bxg="${esc(p.id)}">${opt('', '— не сопоставлен —', !dr.groups[p.id])}${groups.map((g) => opt(BX.field(g, 'ID'), BX.field(g, 'NAME'), String(BX.field(g, 'ID')) === String(dr.groups[p.id]))).join('')}</select></div>`).join('');
    modal(`<h3>Сопоставление с Битрикс24</h3>
      <div class="sub">Заполняется один раз и запоминается. Совпадения по фамилии и названию подобраны автоматически — проверьте их.</div>
      <div class="section-title">Исполнители ↔ пользователи</div><div class="form">${urows}</div>
      <div class="section-title">Проекты ↔ группы</div>
      ${dr.groupsError ? `<div class="sub bx-warn">Группы не загрузились: ${esc(dr.groupsError)}. Добавьте вебхуку право sonet_group.</div>` : ''}
      <div class="form">${prows || '<div class="sub">Проектов нет</div>'}</div>
      <div class="sub mt">Статусы: К выполнению ↔ «Ждёт выполнения», В работе ↔ «Выполняется», Ожидание ↔ «Отложена», Готово ↔ «Завершена».</div>
      <div class="form-actions mt"><button class="btn primary" data-a="bx-map-save">Сохранить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
  }
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!el || !el.dataset) return;
    if (mapDraft && el.dataset.bxu != null) { if (el.value) mapDraft.users[el.dataset.bxu] = el.value; else delete mapDraft.users[el.dataset.bxu]; return; }
    if (mapDraft && el.dataset.bxg != null) { if (el.value) mapDraft.groups[el.dataset.bxg] = el.value; else delete mapDraft.groups[el.dataset.bxg]; return; }
    if (el.dataset.bxs === 'remind') { bxs().remind = el.checked; save(); toast(el.checked ? 'Напоминание включено' : 'Напоминание выключено'); return; }
    if (el.dataset.bxs === 'remindTime') { if (/^\d{2}:\d{2}$/.test(el.value)) { bxs().remindTime = el.value; save(); toast('Сохранено'); } return; }
  });
  ACTIONS['bx-map-save'] = () => {
    if (!mapDraft) return;
    const b = bxs();
    b.users = Object.assign({}, mapDraft.users);
    b.groups = Object.assign({}, mapDraft.groups);
    mapDraft = null;
    save(true); modal(null); render();
    toast('Сопоставления сохранены');
  };

  /* ---------- Выгрузить в Битрикс ---------- */
  let plan = null;
  let lastErrors = [];
  ACTIONS['bx-push'] = async () => {
    if (!ready()) return;
    busy('Сравниваю задачи с Битрикс24…');
    try {
      await ensureMe();
      const b = bxs(), p = BX.pending(D, b), c = ctx();
      const remote = {}, missing = [];
      if (p.updates.length) {
        const cmds = {};
        p.updates.forEach((t) => { cmds['g' + t.bitrixId] = BX.cmd('tasks.task.get', { taskId: t.bitrixId, select: BX.SELECT }); });
        const r = await batch(cmds);
        p.updates.forEach((t) => {
          const v = r.result['g' + t.bitrixId];
          const rt = v ? BX.remoteTask(v) : null;
          if (rt && rt.id) remote[t.bitrixId] = rt;
          else missing.push({ title: t.title, err: r.errors['g' + t.bitrixId] || 'задачи нет в Битриксе или нет доступа' });
        });
      }
      const importedAt = (D.settings.lastBitrixImport || {}).tasks || '';
      const updates = p.updates.filter((t) => remote[t.bitrixId]);
      const conflicts = updates.filter((t) => BX.isConflict(t, remote[t.bitrixId], b, c, importedAt));
      plan = { adds: p.adds, old: p.old, updates, deleted: p.deleted, remote, missing, conflicts, ctx: c, showOld: false };
      renderPlan();
    } catch (e) { fail(e); }
  };
  function fieldRows(t, v) {
    const P = (id) => (byId(D.projects, id) || {}).name || '—';
    const names = { title: 'Название', due: 'Срок', dueTime: 'Время', start: 'Начало', status: 'Статус', assignee: 'Исполнитель', projectId: 'Проект' };
    const fmt = (k, x) => (k === 'status' ? statusName(x) : k === 'projectId' ? P(x) : (k === 'due' || k === 'start') ? (x ? fmtShort(x) : '—') : (x || '—'));
    return BX.differs(t, v).map((k) => `<tr><td>${names[k]}</td><td>${esc(fmt(k, t[k]))}</td><td>${esc(fmt(k, v[k]))}</td></tr>`).join('');
  }
  function conflictCard(t, r, prefix, label, c) {
    const v = BX.fromRemote(r, c);
    return `<div class="bx-conf"><div class="t">${esc(t.title)}</div>
      <table class="bx-cmp"><tr><th></th><th>Приложение</th><th>Битрикс24</th></tr>${fieldRows(t, v)}</table>
      <label class="toggle"><input type="radio" name="${prefix}${esc(t.id)}" value="app" checked><span class="grow">Версия приложения<small>${esc(label)}</small></span></label>
      <label class="toggle"><input type="radio" name="${prefix}${esc(t.id)}" value="bx"><span class="grow">Версия Битрикса<small>Задача в приложении обновится из Битрикса</small></span></label></div>`;
  }
  function taskLine(t, checkbox, checked) {
    const meta = [t.assignee, t.due ? 'до ' + fmtShort(t.due) : '', statusName(t.status)].filter(Boolean).join(' · ');
    const body = `<span class="grow">${esc(t.title || 'Без названия')}<small>${esc(meta)}</small></span>`;
    return checkbox ? `<label class="toggle"><input type="checkbox" name="bx-add" value="${esc(t.id)}"${checked ? ' checked' : ''}>${body}</label>` : `<div class="toggle">${body}</div>`;
  }
  function renderPlan() {
    const pl = plan, b = bxs();
    const adds = pl.adds.concat(pl.showOld ? pl.old : []);
    const closing = pl.updates.filter((t) => BX.statusActions(t.status, pl.remote[t.bitrixId].status).indexOf('tasks.task.complete') >= 0).length
      + adds.filter((t) => t.status === 'done').length;
    const reopen = pl.updates.filter((t) => BX.statusActions(t.status, pl.remote[t.bitrixId].status).indexOf('tasks.task.renew') >= 0).length;
    // предупреждения о несопоставленном
    const unU = {}, unP = {};
    adds.concat(pl.updates).forEach((t) => {
      const who = t.assignee || D.settings.me;
      if (!b.users[who]) unU[who] = (unU[who] || 0) + 1;
      if (t.projectId && !b.groups[t.projectId]) { const n = (byId(D.projects, t.projectId) || {}).name || '?'; unP[n] = (unP[n] || 0) + 1; }
    });
    const warn = Object.keys(unU).map((n) => `исполнитель «${esc(n)}» (${unU[n]})`).concat(Object.keys(unP).map((n) => `проект «${esc(n)}» (${unP[n]})`));
    const nothing = !adds.length && !pl.updates.length && !pl.deleted.length;
    const conflictIds = {};
    pl.conflicts.forEach((t) => { conflictIds[t.id] = true; });
    const plain = pl.updates.filter((t) => !conflictIds[t.id]);
    modal(`<h3>Выгрузка в Битрикс24</h3>
      ${nothing ? '<div class="sub">Нечего выгружать — все изменения уже в Битриксе.</div>' : `<div class="bx-sum">
        <span class="chip blue">Создать: ${adds.length}</span><span class="chip">Обновить: ${pl.updates.length}</span><span class="chip green">Закрыть: ${closing}</span>${reopen ? `<span class="chip amber">Вернуть в работу: ${reopen}</span>` : ''}</div>`}
      ${warn.length ? `<div class="sub mt bx-warn">Не сопоставлены: ${warn.join(', ')}. Новые задачи получат ответственным вас, у существующих исполнитель и группа не изменятся. <button class="btn sm" data-a="bx-map">Сопоставить</button></div>` : ''}
      ${pl.conflicts.length ? `<div class="section-title">Конфликты: ${pl.conflicts.length}</div><div class="sub">Эти задачи изменили в Битриксе после последней синхронизации. Выберите, какую версию оставить.</div>${pl.conflicts.map((t) => conflictCard(t, pl.remote[t.bitrixId], 'bxc-', 'Перезапишет поля в Битриксе', pl.ctx)).join('')}` : ''}
      ${adds.length ? `<div class="section-title">Новые задачи: ${adds.length}</div><div class="sub">Снимите галочку, чтобы задача осталась только в приложении (пока вы её не измените).</div><div class="bx-list">${adds.map((t) => taskLine(t, true, true)).join('')}</div>` : ''}
      ${!pl.showOld && pl.old.length ? `<button class="btn sm mt" data-a="bx-show-old">+ Старые задачи без ID Битрикса (${pl.old.length})</button>` : ''}
      ${plain.length ? `<div class="section-title">Изменённые: ${plain.length}</div><div class="bx-list">${plain.slice(0, 30).map((t) => taskLine(t, false)).join('')}${plain.length > 30 ? `<div class="sub">…и ещё ${plain.length - 30}</div>` : ''}</div>` : ''}
      ${pl.deleted.length ? `<div class="section-title">Удалено в приложении: ${pl.deleted.length}</div>
        <label class="toggle"><input type="checkbox" id="bx-close-deleted"><span class="grow">Закрыть их в Битриксе<small>${esc(pl.deleted.slice(0, 6).map((x) => x.title || '#' + x.bitrixId).join(', '))}${pl.deleted.length > 6 ? ' и ещё ' + (pl.deleted.length - 6) : ''}. В Битриксе ничего не удаляется. Если не закрыть — при загрузке из Битрикса открытые задачи вернутся.</small></span></label>` : ''}
      ${pl.missing.length ? `<div class="section-title">Пропущены: ${pl.missing.length}</div><div class="bx-list">${pl.missing.map((m) => `<div class="toggle"><span class="grow">${esc(m.title)}<small class="bx-err">${esc(m.err)}</small></span></div>`).join('')}</div>` : ''}
      <div class="form-actions mt">${nothing ? '' : '<button class="btn primary" data-a="bx-send">Отправить</button>'}<button class="btn" data-a="modal-close">${nothing ? 'Закрыть' : 'Отмена'}</button></div>`);
  }
  ACTIONS['bx-show-old'] = () => { if (plan) { plan.showOld = true; renderPlan(); } };

  /* Задача приложения ← задача Битрикса (загрузка и конфликт «версия Битрикса») */
  function applyRemote(t, r, c, now) {
    const v = BX.fromRemote(r, c);
    const b = bxs();
    if (!v.assignee && r.responsibleId && c.userNames && c.userNames[r.responsibleId]) v.assignee = c.userNames[r.responsibleId];
    if (v.assignee && !D.settings.people.includes(v.assignee)) D.settings.people.push(v.assignee);
    if (v.assignee && r.responsibleId && !b.users[v.assignee]) b.users[v.assignee] = r.responsibleId;
    const data = { title: v.title || 'Без названия', assignee: v.assignee || D.settings.me, due: v.due, dueTime: v.dueTime, start: v.start, status: v.status };
    if (!v.groupUnmapped) data.projectId = v.projectId;
    if (r.tags) data.milestone = v.milestone;
    const crm = v.crmBx.map((x) => (D.contacts.find((cc) => cc.bitrixId === x) || {}).id).filter(Boolean);
    if (!t) {
      t = Object.assign({ id: uid('t'), desc: v.desc || '', important: v.important, crmIds: crm, eventIds: [], deps: [], parentId: null, projectId: null, milestone: false, bitrixId: r.id, source: 'bitrix24', createdAt: now }, data);
      if (t.status === 'done') t.doneAt = now;
      D.tasks.push(t);
    } else {
      if (t.status !== 'done' && data.status === 'done') t.doneAt = now;
      Object.assign(t, data);
      if (v.desc) t.desc = v.desc;
      if (v.important) t.important = true;
      crm.forEach((id) => { if (!t.crmIds.includes(id)) t.crmIds.push(id); });
    }
    t.updatedAt = now;
    t._bxParent = v.parentBx;
    b.pushed[t.id] = now;
    b.remoteChanged[r.id] = r.changedDate;
    b.known[r.id] = t.title;
    return t;
  }
  function linkParents() {
    D.tasks.forEach((t) => {
      if (t._bxParent !== undefined) {
        if (t._bxParent) { const p = D.tasks.find((x) => x.bitrixId === t._bxParent); if (p && p.id !== t.id) t.parentId = p.id; }
        delete t._bxParent;
      }
    });
  }

  ACTIONS['bx-send'] = async () => {
    const pl = plan;
    if (!pl) return;
    const b = bxs(), c = pl.ctx;
    const box = $('#modal');
    const chosen = {};
    $$('input[name=bx-add]', box).forEach((i) => { chosen[i.value] = i.checked; });
    const takeBx = pl.conflicts.filter((t) => { const r = $(`input[name="bxc-${t.id}"]:checked`, box); return r && r.value === 'bx'; });
    const closeDeleted = !!($('#bx-close-deleted', box) || {}).checked;
    const adds = pl.adds.concat(pl.showOld ? pl.old : []).filter((t) => chosen[t.id]);
    const skipped = pl.adds.concat(pl.showOld ? pl.old : []).filter((t) => !chosen[t.id]);
    const takeIds = {};
    takeBx.forEach((t) => { takeIds[t.id] = true; });
    const updates = pl.updates.filter((t) => !takeIds[t.id]);
    const snap = {};
    adds.concat(updates).forEach((t) => { snap[t.id] = t.updatedAt || t.createdAt || new Date().toISOString(); });
    const res = { created: 0, updated: 0, closed: 0, errors: [] };
    const touched = [];
    const badIds = {};
    const err = (t, e) => { if (t && t.id) badIds[t.id] = true; res.errors.push({ title: (t && t.title) || 'Без названия', err: String(e || 'ошибка') }); };
    busy('Отправляю в Битрикс24…');
    if (N && N.backupNow) try { save(true); N.backupNow(); } catch (e) { /* */ }
    let stopped = null;
    try {
      // 1. Конфликты в пользу Битрикса — обновляем приложение
      const now = new Date().toISOString();
      takeBx.forEach((t) => applyRemote(t, pl.remote[t.bitrixId], c, now));
      linkParents();
      // 2. Новые задачи: сначала родители, затем подзадачи (PARENT_ID — ID родителя в Битриксе)
      for (const round of BX.addRounds(adds)) {
        const cmds = {};
        round.forEach((t) => { cmds['a' + t.id] = BX.cmd('tasks.task.add', { fields: BX.buildFields(t, c, null).fields }); });
        const r = await batch(cmds);
        const st = {};
        round.forEach((t) => {
          const v = r.result['a' + t.id];
          const id = v && (v.task ? BX.field(v.task, 'ID') : BX.field(v, 'ID'));
          if (!id) { err(t, r.errors['a' + t.id] || 'задача не создана'); return; }
          t.bitrixId = String(id); // сразу запоминаем: повторная выгрузка не создаст дубль
          res.created++;
          touched.push(t);
          BX.statusActions(t.status, 2).forEach((m, i) => { st['s' + t.id + '_' + i] = BX.cmd(m, { taskId: t.bitrixId }); });
        });
        save(true);
        if (Object.keys(st).length) {
          const r2 = await batch(st);
          Object.keys(st).forEach((k) => {
            const t = round.find((x) => k.startsWith('s' + x.id + '_'));
            if (r2.errors[k]) err(t, 'статус: ' + r2.errors[k]);
            else if (/tasks\.task\.complete/.test(st[k])) res.closed++;
          });
        }
      }
      // 3. Изменённые: возврат из завершённых — до правки полей, остальные смены статуса — после
      if (updates.length) {
        const cmds = {}, owner = {};
        updates.forEach((t) => {
          const r = pl.remote[t.bitrixId];
          const acts = BX.statusActions(t.status, r.status);
          const before = acts[0] === 'tasks.task.renew' ? [acts.shift()] : [];
          before.forEach((m) => { cmds['r' + t.id] = BX.cmd(m, { taskId: t.bitrixId }); owner['r' + t.id] = t; });
          cmds['u' + t.id] = BX.cmd('tasks.task.update', { taskId: t.bitrixId, fields: BX.buildFields(t, c, r).fields });
          owner['u' + t.id] = t;
          acts.forEach((m, i) => { cmds['s' + t.id + '_' + i] = BX.cmd(m, { taskId: t.bitrixId }); owner['s' + t.id + '_' + i] = t; });
        });
        const r = await batch(cmds);
        Object.keys(cmds).forEach((k) => {
          const t = owner[k];
          if (r.errors[k]) { err(t, r.errors[k]); return; }
          if (/tasks\.task\.complete/.test(cmds[k])) res.closed++;
        });
        updates.forEach((t) => { if (!badIds[t.id]) res.updated++; touched.push(t); });
      }
      // 4. Удалённые в приложении — закрыть в Битриксе (по желанию); в Битриксе ничего не удаляется
      if (pl.deleted.length) {
        if (closeDeleted) {
          const cmds = {};
          pl.deleted.forEach((x) => { cmds['d' + x.bitrixId] = BX.cmd('tasks.task.complete', { taskId: x.bitrixId }); });
          const r = await batch(cmds);
          pl.deleted.forEach((x) => { if (r.errors['d' + x.bitrixId]) err({ title: x.title }, 'не закрыта: ' + r.errors['d' + x.bitrixId]); else res.closed++; });
        }
        pl.deleted.forEach((x) => { delete b.known[x.bitrixId]; });
      }
      // 5. Отметки: что выгружено и CHANGED_DATE после выгрузки (для поиска конфликтов в следующий раз)
      // CHANGED_DATE — у всех тронутых (иначе наши же правки в следующий раз выглядели бы конфликтом);
      // «выгружено» — только у задач без ошибок: задачи с ошибками останутся в очереди
      const ok = touched.filter((t) => !badIds[t.id]);
      if (touched.length) {
        const cmds = {};
        touched.forEach((t) => { cmds['c' + t.bitrixId] = BX.cmd('tasks.task.get', { taskId: t.bitrixId, select: ['ID', 'CHANGED_DATE'] }); });
        const r = await batch(cmds);
        touched.forEach((t) => {
          const rt = r.result['c' + t.bitrixId] ? BX.remoteTask(r.result['c' + t.bitrixId]) : null;
          if (rt && rt.changedDate) b.remoteChanged[t.bitrixId] = rt.changedDate;
        });
      }
      ok.forEach((t) => { if (!(t.updatedAt && snap[t.id] && t.updatedAt > snap[t.id])) b.pushed[t.id] = snap[t.id]; b.known[t.bitrixId] = t.title; });
      skipped.forEach((t) => { b.pushed[t.id] = t.updatedAt || t.createdAt || new Date().toISOString(); });
      b.lastPush = new Date().toISOString();
    } catch (e) {
      stopped = e;
      // что успели — отмечаем; остальное останется в очереди
      touched.forEach((t) => { if (t.bitrixId && !badIds[t.id]) { b.pushed[t.id] = snap[t.id]; b.known[t.bitrixId] = t.title; } });
    }
    plan = null;
    lastErrors = res.errors;
    save(true); render();
    if (stopped) {
      modal(`<h3>${stopped.offline ? 'Нет связи с Битрикс24' : 'Выгрузка прервана'}</h3><div class="sub">${esc(stopped.message)}</div>
        <div class="sub mt">Успели: создано ${res.created}, обновлено ${res.updated}, закрыто ${res.closed}. Остальные изменения сохранены и уйдут при следующей выгрузке.</div>
        <div class="form-actions mt"><button class="btn" data-a="modal-close">Понятно</button></div>`);
      return;
    }
    modal(null);
    const msg = `Выгружено: создано ${res.created}, обновлено ${res.updated}, закрыто ${res.closed}` + (res.errors.length ? `, ошибок ${res.errors.length}` : '');
    toast(msg, res.errors.length ? { label: 'Подробнее', fn: showErrors } : null);
  };
  function showErrors() {
    modal(`<h3>Ошибки выгрузки</h3><div class="sub">Остальные задачи выгружены. Эти останутся в очереди до следующей выгрузки.</div>
      <div class="bx-list mt">${lastErrors.map((e) => `<div class="toggle"><span class="grow">${esc(e.title)}<small class="bx-err">${esc(e.err)}</small></span></div>`).join('')}</div>
      <div class="form-actions mt"><button class="btn" data-a="modal-close">Понятно</button></div>`);
  }
  ACTIONS['bx-errors'] = () => showErrors();

  /* ---------- Загрузить из Битрикса ---------- */
  let pull = null;
  ACTIONS['bx-pull'] = async () => {
    if (!ready()) return;
    busy('Загружаю задачи из Битрикс24…');
    try {
      const me = await ensureMe();
      const b = bxs();
      const since = new Date(Math.min(Date.now() - 30 * 86400000, b.lastPull ? Date.parse(b.lastPull) - 86400000 : Infinity));
      const filters = [{ RESPONSIBLE_ID: me }, { CREATED_BY: me }, { AUDITOR: me }];
      const groups = Array.from(new Set(Object.values(b.groups).filter(Boolean)));
      if (groups.length) filters.push({ GROUP_ID: groups });
      // открытые задачи + изменённые недавно (в том числе завершённые)
      let cmds = {};
      filters.forEach((f, i) => {
        cmds['o' + i] = BX.cmd('tasks.task.list', { filter: Object.assign({ '!REAL_STATUS': 5 }, f), select: BX.SELECT, order: { ID: 'asc' } });
        cmds['r' + i] = BX.cmd('tasks.task.list', { filter: Object.assign({ '>=CHANGED_DATE': since.toISOString().replace(/\.\d+Z$/, '+00:00') }, f), select: BX.SELECT, order: { ID: 'asc' } });
      });
      const byId = {};
      for (let page = 0; page < 60 && Object.keys(cmds).length; page++) {
        const r = await batch(cmds);
        const errs = Object.keys(r.errors);
        if (errs.length === Object.keys(cmds).length) throw new BxError(r.errors[errs[0]]);
        const next = {};
        Object.keys(cmds).forEach((k) => {
          const v = r.result[k];
          ((v && v.tasks) || (Array.isArray(v) ? v : [])).forEach((raw) => { const rt = BX.remoteTask(raw); if (rt.id) byId[rt.id] = rt; });
          if (r.next[k] != null) next[k] = cmds[k].replace(/&start=\d+$/, '') + '&start=' + r.next[k];
        });
        cmds = next;
      }
      const remotes = Object.values(byId);
      // имена несопоставленных ответственных
      const userNames = {};
      const inv = BX.invert(b.users);
      const unknown = Array.from(new Set(remotes.map((r) => r.responsibleId).filter((id) => id && !inv[id])));
      if (unknown.length) {
        try { (await listAll('user.get', { filter: { ID: unknown } })).forEach((u) => { userNames[String(BX.field(u, 'ID'))] = BX.userName(u); }); } catch (e) { /* */ }
      }
      const c = ctx({ userNames });
      const adds = [], updates = [], conflicts = [];
      let same = 0;
      remotes.forEach((r) => {
        const t = D.tasks.find((x) => x.bitrixId === r.id);
        if (!t) { if (r.status !== 5) adds.push(r); return; } // завершённые и неизвестные приложению не добавляем
        if (b.remoteChanged[r.id] && b.remoteChanged[r.id] === r.changedDate) { same++; return; }
        if (BX.changed(t, b) && BX.differs(t, BX.fromRemote(r, c)).length) conflicts.push({ t, r });
        else updates.push({ t, r });
      });
      pull = { adds, updates, conflicts, same, ctx: c, total: remotes.length };
      renderPull();
    } catch (e) { fail(e); }
  };
  function renderPull() {
    const p = pull;
    const nothing = !p.adds.length && !p.updates.length && !p.conflicts.length;
    modal(`<h3>Загрузка из Битрикс24</h3>
      <div class="sub">Задачи, где вы ответственный, постановщик или наблюдатель${Object.keys(bxs().groups).length ? ', и задачи сопоставленных проектов' : ''}: ${p.total}.</div>
      <div class="bx-sum mt"><span class="chip blue">Новых: ${p.adds.length}</span><span class="chip">Обновить: ${p.updates.length}</span><span class="chip">Без изменений: ${p.same}</span></div>
      ${p.conflicts.length ? `<div class="section-title">Конфликты: ${p.conflicts.length}</div><div class="sub">Эти задачи изменены и в приложении (ещё не выгружены), и в Битриксе.</div>${p.conflicts.map((x) => conflictCard(x.t, x.r, 'bxp-', 'Останется как в приложении и уйдёт при выгрузке', p.ctx)).join('')}` : ''}
      ${p.adds.length ? `<div class="section-title">Новые</div><div class="bx-list">${p.adds.slice(0, 20).map((r) => `<div class="toggle"><span class="grow">${esc(r.title)}<small>${esc(BX.STATUS_NAMES[r.status] || '')}</small></span></div>`).join('')}${p.adds.length > 20 ? `<div class="sub">…и ещё ${p.adds.length - 20}</div>` : ''}</div>` : ''}
      <div class="sub mt">Задачи сопоставляются по ID Битрикс24, люди и проекты — по сопоставлениям. Перед загрузкой создаётся автокопия.</div>
      <div class="form-actions mt">${nothing ? '' : '<button class="btn primary" data-a="bx-pull-apply">Загрузить</button>'}<button class="btn" data-a="modal-close">${nothing ? 'Закрыть' : 'Отмена'}</button></div>`);
  }
  ACTIONS['bx-pull-apply'] = () => {
    const p = pull;
    if (!p) return;
    const box = $('#modal'), b = bxs();
    if (N && N.backupNow) try { save(true); N.backupNow(); } catch (e) { /* */ }
    const now = new Date().toISOString();
    p.adds.forEach((r) => applyRemote(null, r, p.ctx, now));
    p.updates.forEach((x) => applyRemote(x.t, x.r, p.ctx, now));
    let kept = 0;
    p.conflicts.forEach((x) => {
      const ch = $(`input[name="bxp-${x.t.id}"]:checked`, box);
      if (ch && ch.value === 'bx') applyRemote(x.t, x.r, p.ctx, now);
      else { b.remoteChanged[x.r.id] = x.r.changedDate; b.known[x.r.id] = x.t.title; kept++; } // версия приложения уйдёт при выгрузке без конфликта
    });
    linkParents();
    b.lastPull = now;
    D.settings.lastBitrixImport = Object.assign({}, D.settings.lastBitrixImport || {}, { tasks: now });
    pull = null;
    save(true); modal(null); render();
    toast(`Из Битрикса: добавлено ${p.adds.length}, обновлено ${p.updates.length + p.conflicts.length - kept}`);
  };

  /* ---------- Напоминание «Не выгружено в Битрикс» ---------- */
  const prevBuild = buildAlarms;
  buildAlarms = function () {
    const list = prevBuild();
    try {
      const b = bxs();
      if (PHONE && b.remind && info().configured) {
        const n = BX.pendingCount(D, b);
        if (n > 0) {
          const [h, mi] = b.remindTime.split(':').map(Number);
          const d = new Date();
          d.setHours(h, mi, 0, 0);
          if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
          list.push({ key: 'bx-remind', at: d.getTime(), title: 'Битрикс24', text: 'Не выгружено в Битрикс: ' + plural3(n, 'изменение', 'изменения', 'изменений'), aggressive: false, ref: 'bitrix:push' });
          list.sort((x, y) => x.at - y.at);
        }
      }
    } catch (e) { /* */ }
    return list;
  };

  /* ---------- Раздел настроек ---------- */
  function block() {
    const b = bxs();
    const n = BX.pendingCount(D, b);
    if (!PHONE) {
      return `<div class="section-title">Битрикс24</div>
      <div class="card"><div class="sub">Синхронизация с Битрикс24 работает в приложении на телефоне: адрес вебхука — это пароль, он хранится только там.</div>
      ${n ? `<div class="sub mt">Ждут выгрузки: <b>${n}</b> — выгрузите с телефона.</div>` : ''}</div>`;
    }
    const inf = info();
    const people = D.settings.people.filter((p) => b.users[p]).length;
    const projects = D.projects.filter((p) => !p.archived);
    const mappedP = projects.filter((p) => b.groups[p.id]).length;
    return `<div class="section-title">Битрикс24</div>
    <div class="card">
      ${inf.configured ? `<div class="perm"><div class="grow"><div>Подключено: ${esc(inf.host || '')}</div><div class="sub">${b.meName ? 'Вы — ' + esc(b.meName) + ' · ' : ''}адрес вебхука хранится только на этом телефоне</div></div><button class="btn sm" data-a="bx-check">Проверить</button></div>` : ''}
      <div class="field mt"><label>${inf.configured ? 'Заменить адрес вебхука' : 'Адрес вебхука'}</label>
        <input type="url" id="bx-hook" placeholder="https://портал.bitrix24.ru/rest/1/ключ/" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <div class="sub">${esc(HOOK_HINT)} Адрес вебхука — это пароль: он не попадает в резервные копии и в веб-версию.</div>
      <div class="form-actions mt"><button class="btn ${inf.configured ? '' : 'primary'}" data-a="bx-hook-save">${inf.configured ? 'Заменить и проверить' : 'Сохранить и проверить'}</button>${inf.configured ? '<button class="btn" data-a="bx-hook-clear">Удалить адрес</button>' : ''}</div>
      ${inf.configured ? `
      <div class="perm mt"><div class="grow"><div>Сопоставление</div><div class="sub">Исполнители: ${people} из ${D.settings.people.length} · проекты: ${mappedP} из ${projects.length}</div></div><button class="btn sm" data-a="bx-map">Настроить</button></div>
      <div class="perm"><div class="grow"><div>Выгрузить в Битрикс</div><div class="sub">${n ? 'Изменений: ' + n : 'Всё выгружено'}${b.lastPush ? ' · последняя: ' + esc(when(b.lastPush)) : ''}</div>${lastErrors.length ? `<button class="btn sm mt" data-a="bx-errors">Ошибки: ${lastErrors.length}</button>` : ''}</div><button class="btn sm primary" data-a="bx-push">Выгрузить</button></div>
      <div class="perm"><div class="grow"><div>Загрузить из Битрикса</div><div class="sub">Вместо файла Excel${b.lastPull ? ' · последняя: ' + esc(when(b.lastPull)) : ''}</div></div><button class="btn sm" data-a="bx-pull">Загрузить</button></div>
      <label class="toggle mt"><input type="checkbox" data-bxs="remind" ${b.remind ? 'checked' : ''}><span class="grow">Напоминать о невыгруженных изменениях<small>Раз в день, если есть что выгрузить</small></span></label>
      <div class="field"><label>Время напоминания</label><input type="time" data-bxs="remindTime" value="${esc(b.remindTime)}"></div>` : ''}
    </div>`;
  }
  const prevSettings = SCREENS.settings;
  SCREENS.settings = function () {
    const html = prevSettings();
    const anchor = '<div class="section-title">Импорт из Битрикс24';
    return html.includes(anchor) ? html.replace(anchor, block() + '\n    ' + anchor) : html + block();
  };
  window.__bxSync = { call, batch, plan: () => plan };
  if (ui.tab === 'settings') render();
})();
