/* 管理会计 — экран «Карта ответственных».
 * Данные карты (состав и структура) — D.maps (schema.js), счётчики — RespMap (respmap.js), здесь только интерфейс.
 * Загружается после app.js и использует его общие функции (render, modal, toast, openSheet, ACTIONS, SCREENS, SHEETS…).
 */
'use strict';

ui.map = { view: {}, addType: 'person', press: null, drag: null };

const MAP_W = 220, MAP_H = 96, MAP_GX = 64, MAP_GY = 14;
const curMap = () => D.maps.find((m) => m.id === D.settings.mapId) || D.maps[0] || null;
const mapNode = (m, id) => m && m.nodes.find((n) => n.id === id);
const mapToday = () => today();

function mapNodeName(n) {
  if (n.type === 'project') { const p = project(n.ref); return p ? p.name : '(проект удалён)'; }
  return n.ref || '';
}
function mapNodeIcon(n) { return n.type === 'project' ? 'folder' : n.type === 'person' ? 'crm' : 'map'; }
function mapViewMode(m) { return m.view || (window.innerWidth >= 700 ? 'tree' : 'cards'); }
function mapTouch(m) { m.updatedAt = new Date().toISOString(); save(); }

/* Удалили человека или проект — убираем узлы с битыми ссылками и сообщаем об этом. */
function pruneMapsNotify() {
  const n = pruneMaps(D);
  if (n) toast(`С карт убрано узлов без ссылки: ${n}`);
  return n;
}

/* Переименование человека везде: исполнители, задачи, ответственные проектов, узлы карт. */
function renamePerson(oldName, newName) {
  if (!newName || newName === oldName) return false;
  if (D.settings.people.includes(newName)) { toast('Такой исполнитель уже есть'); return false; }
  D.settings.people = D.settings.people.map((x) => (x === oldName ? newName : x));
  if (D.settings.me === oldName) D.settings.me = newName;
  D.tasks.forEach((t) => { if (t.assignee === oldName) t.assignee = newName; });
  D.projects.forEach((p) => { if (p.ownerId === oldName) p.ownerId = newName; });
  D.maps.forEach((m) => m.nodes.forEach((n) => { if (n.type === 'person' && n.ref === oldName) n.ref = newName; }));
  return true;
}

function counterChips(s, n) {
  return `<div class="rm-c">
    <span class="rm-k ${s.soon ? 'yellow' : ''}" title="Не выполнено">в работе <b>${s.open}</b></span>
    <span class="rm-k ${s.overdue ? 'red' : ''}" title="Срок прошёл">просрочено <b>${s.overdue}</b></span>
  </div>${n.type === 'person' ? `<div class="rm-sub">из них в его проектах: ${s.inOwn || 0}</div>` : n.type === 'project' && project(n.ref) ? `<div class="rm-sub ellipsis">отв.: ${esc(project(n.ref).ownerId || 'не указан')}${project(n.ref).archived ? ' · архив' : ''}</div>` : ''}`;
}

/* ---------- Экран ---------- */
SCREENS.map = function () {
  const m = curMap();
  if (!m) {
    return `<div class="head"><h1>Карта ответственных</h1></div>
      <div class="card rm-empty">
        <div style="font-size:15px"><b>Кто за что отвечает и где проблемы — на одном экране.</b></div>
        <div class="sub mt">На карте — направления, руководители и их проекты. У каждого узла счётчики «в работе» и «просрочено»: они считаются из задач приложения, ничего вести отдельно не нужно.</div>
        <div class="row mt" style="gap:8px;flex-wrap:wrap">
          <button class="btn primary" data-a="map-create" data-id="auto">${icon('map')}Собрать автоматически</button>
          <button class="btn" data-a="map-create">${icon('plus')}Пустая карта</button>
        </div>
        <div class="sub mt">«Собрать автоматически» берёт людей, у которых есть проекты с ответственным (поле «Ответственный» в карточке проекта), и вешает под ними их проекты.</div>
      </div>`;
  }
  const mode = mapViewMode(m);
  const stats = RespMap.mapStats(D, m, mapToday());
  const hasOwners = D.projects.some((p) => p.ownerId);
  const top = `<div class="head"><h1 class="grow ellipsis">${D.maps.length > 1 ? `<select class="rm-pick" data-change="mapPick">${D.maps.map((x) => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : esc(m.name)}</h1>
      <button class="icon-btn" data-a="map-menu" aria-label="Карта: действия">⋯</button></div>
    <div class="rm-bar">
      <div class="seg"><button class="${mode === 'tree' ? 'on' : ''}" data-a="map-view" data-id="tree">Дерево</button><button class="${mode === 'cards' ? 'on' : ''}" data-a="map-view" data-id="cards">Карточки</button></div>
      <button class="btn sm" data-a="map-add">${icon('plus')}Добавить</button>
      <button class="btn sm" data-a="map-auto" ${hasOwners ? '' : 'title="Сначала укажите ответственных в карточках проектов"'}>Собрать автоматически</button>
      ${mode === 'tree' && m.nodes.length ? `<span class="rm-zoom"><button class="btn sm" data-a="map-zoom" data-id="-1" aria-label="Мельче">−</button><button class="btn sm" data-a="map-zoom" data-id="0">Вписать</button><button class="btn sm" data-a="map-zoom" data-id="1" aria-label="Крупнее">+</button></span>` : ''}
    </div>`;
  if (!m.nodes.length) {
    return top + `<div class="card rm-empty"><div class="sub">Карта пустая. Добавьте руководителя, направление или проект — или соберите карту автоматически из ответственных за проекты.</div>
      ${hasOwners ? '' : '<div class="sub mt">Ответственного проекта можно указать в его карточке → «Изменить» → «Ответственный».</div>'}</div>`;
  }
  const legend = `<div class="rm-legend sub"><span><i class="rm-dot red"></i>есть просрочка</span><span><i class="rm-dot yellow"></i>срок сегодня или завтра</span><span><i class="rm-dot"></i>всё спокойно</span><span>Долгое нажатие на узел — переименовать, ответственный, переместить, убрать</span></div>`;
  return top + (mode === 'tree' ? mapTree(m, stats) : mapCards(m, stats)) + legend;
};

/* ---------- Карточки (узкий экран) ---------- */
function mapCards(m, stats) {
  const roots = RespMap.sortByTrouble(RespMap.childrenOf(m, null), stats, mapNodeName);
  const row = (n, depth) => {
    const s = stats[n.id];
    const kids = RespMap.sortByTrouble(RespMap.childrenOf(m, n.id), stats, mapNodeName);
    return `<div class="rm-row lvl-${s.level}" data-node="${n.id}" data-a="map-open" data-id="${n.id}" style="padding-left:${10 + depth * 16}px">
        ${icon(mapNodeIcon(n))}<span class="grow ellipsis">${esc(mapNodeName(n))}${n.type === 'project' && project(n.ref) && project(n.ref).archived ? ' <span class="chip">архив</span>' : ''}</span>
        <span class="rm-mini ${s.soon ? 'yellow' : ''}">${s.open}</span><span class="rm-mini ${s.overdue ? 'red' : ''}">${s.overdue}</span>
      </div>` + kids.map((k) => row(k, depth + 1)).join('');
  };
  return `<div class="rm-cards">${roots.map((r) => {
    const s = stats[r.id];
    const kids = RespMap.sortByTrouble(RespMap.childrenOf(m, r.id), stats, mapNodeName);
    return `<div class="rm-card lvl-${s.level}">
      <div class="rm-card-h" data-node="${r.id}" data-a="map-open" data-id="${r.id}">
        <div class="row" style="gap:8px">${icon(mapNodeIcon(r))}<b class="grow ellipsis">${esc(mapNodeName(r))}</b><span class="rm-type">${{ person: 'руководитель', group: 'направление', project: 'проект' }[r.type]}</span></div>
        ${counterChips(s, r)}
      </div>
      ${kids.length ? `<div class="rm-rows">${kids.map((k) => row(k, 0)).join('')}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

/* ---------- Дерево слева направо (широкий экран, веб-версия) ---------- */
function mapLayout(m) {
  const pos = {};
  let leaf = 0;
  const place = (id, depth) => {
    const node = id ? mapNode(m, id) : null;
    const kids = node && node.collapsed ? [] : RespMap.childrenOf(m, id);
    const ys = kids.map((k) => place(k.id, depth + 1));
    const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : (leaf++) * (MAP_H + MAP_GY);
    pos[id || '__root'] = { x: depth * (MAP_W + MAP_GX), y, depth };
    return y;
  };
  place(null, 0);
  const all = Object.values(pos);
  return { pos, w: Math.max(...all.map((p) => p.x)) + MAP_W, h: Math.max(...all.map((p) => p.y)) + MAP_H };
}
function mapTree(m, stats) {
  const L = mapLayout(m);
  const edges = [];
  const boxes = [];
  const rootP = L.pos.__root;
  boxes.push(`<div class="rm-node rm-root" style="left:${rootP.x}px;top:${rootP.y}px;width:${MAP_W}px;height:${MAP_H}px"><div class="rm-t">${icon('map')}<span class="ellipsis">${esc(m.name)}</span></div><div class="sub">${m.nodes.length} ${plural(m.nodes.length, 'узел', 'узла', 'узлов')}</div></div>`);
  m.nodes.forEach((n) => {
    const p = L.pos[n.id];
    if (!p) return; // в свёрнутой ветке
    const pp = L.pos[n.parentId || '__root'];
    if (pp) {
      const x1 = pp.x + MAP_W, y1 = pp.y + MAP_H / 2, x2 = p.x, y2 = p.y + MAP_H / 2, mx = (x1 + x2) / 2;
      edges.push(`<path class="lvl-${stats[n.id].level}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`);
    }
    const s = stats[n.id];
    const kids = RespMap.childrenOf(m, n.id).length;
    boxes.push(`<div class="rm-node lvl-${s.level} t-${n.type}" data-node="${n.id}" data-a="map-open" data-id="${n.id}" style="left:${p.x}px;top:${p.y}px;width:${MAP_W}px;height:${MAP_H}px">
      <div class="rm-t">${icon(mapNodeIcon(n))}<span class="ellipsis">${esc(mapNodeName(n))}</span></div>
      ${counterChips(s, n)}
      ${kids ? `<button class="rm-fold" data-a="map-fold" data-id="${n.id}" aria-label="${n.collapsed ? 'Развернуть' : 'Свернуть'}">${n.collapsed ? '+' + kids : '−'}</button>` : ''}
    </div>`);
  });
  const v = mapViewState(m, L);
  return `<div class="rm-viewport" id="rm-viewport" data-w="${L.w}" data-h="${L.h}">
    <div class="rm-stage" id="rm-stage" style="width:${L.w}px;height:${L.h}px;transform:translate(${v.tx}px,${v.ty}px) scale(${v.s})">
      <svg class="rm-edges" width="${L.w}" height="${L.h}">${edges.join('')}</svg>${boxes.join('')}
    </div></div>`;
}
function mapViewState(m, L) {
  if (!ui.map.view[m.id]) ui.map.view[m.id] = mapFit(L.w, L.h);
  return ui.map.view[m.id];
}
function mapFit(w, h) {
  const vw = Math.max(320, (($('#main') || {}).clientWidth || window.innerWidth) - 40);
  const vh = Math.max(300, window.innerHeight - 260);
  const s = Math.max(0.35, Math.min(1, vw / (w + 40), vh / (h + 40)));
  return { s, tx: 20, ty: 16 };
}
function mapApplyView() {
  const m = curMap(), st = $('#rm-stage');
  if (!m || !st) return;
  const v = ui.map.view[m.id];
  st.style.transform = `translate(${v.tx}px,${v.ty}px) scale(${v.s})`;
}
function mapZoomAt(f, cx, cy) {
  const m = curMap();
  const v = m && ui.map.view[m.id];
  if (!v) return;
  const s2 = Math.max(0.25, Math.min(2.5, v.s * f));
  // точка под пальцем/курсором остаётся на месте
  v.tx = cx - (cx - v.tx) * (s2 / v.s);
  v.ty = cy - (cy - v.ty) * (s2 / v.s);
  v.s = s2;
  mapApplyView();
}

/* ---------- Жесты: перемещение пальцем, щипок, колесо, долгое нажатие ---------- */
const mapPointers = new Map();
document.addEventListener('pointerdown', (ev) => {
  const nodeEl = ev.target.closest && ev.target.closest('[data-node]');
  if (nodeEl && ui.tab === 'map' && !ev.target.closest('.rm-fold')) {
    const id = nodeEl.dataset.node;
    clearTimeout(ui.map.pressTimer);
    ui.map.press = { id, x: ev.clientX, y: ev.clientY, fired: false };
    ui.map.pressTimer = setTimeout(() => {
      if (!ui.map.press || ui.map.press.id !== id || ui.map.press.moved) return;
      ui.map.press.fired = true;
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { /* */ }
      mapNodeMenu(id);
    }, 550);
  }
  const vp = ev.target.closest && ev.target.closest('#rm-viewport');
  if (!vp || ev.target.closest('.rm-fold')) return;
  mapPointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  const m = curMap();
  const v = m && ui.map.view[m.id];
  if (!v) return;
  if (mapPointers.size === 1) ui.map.drag = { x0: ev.clientX, y0: ev.clientY, tx: v.tx, ty: v.ty, moved: false };
  if (mapPointers.size === 2) {
    const [a, b] = Array.from(mapPointers.values());
    ui.map.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: v.s };
    ui.map.drag = null;
  }
});
document.addEventListener('pointermove', (ev) => {
  const pr = ui.map.press;
  if (pr && Math.hypot(ev.clientX - pr.x, ev.clientY - pr.y) > 8) { pr.moved = true; clearTimeout(ui.map.pressTimer); }
  if (!mapPointers.has(ev.pointerId)) return;
  mapPointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  const m = curMap();
  const v = m && ui.map.view[m.id];
  const vp = $('#rm-viewport');
  if (!v || !vp) return;
  if (mapPointers.size === 2 && ui.map.pinch) {
    const [a, b] = Array.from(mapPointers.values());
    const r = vp.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    mapZoomAt((ui.map.pinch.s * d / ui.map.pinch.d) / v.s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    if (ui.map.press) ui.map.press.moved = true;
    return;
  }
  const dr = ui.map.drag;
  if (!dr) return;
  const dx = ev.clientX - dr.x0, dy = ev.clientY - dr.y0;
  if (!dr.moved && Math.hypot(dx, dy) < 6) return;
  dr.moved = true;
  v.tx = dr.tx + dx; v.ty = dr.ty + dy;
  mapApplyView();
});
function mapPointerEnd(ev) {
  mapPointers.delete(ev.pointerId);
  if (mapPointers.size < 2) ui.map.pinch = null;
  clearTimeout(ui.map.pressTimer);
  if (!mapPointers.size && ui.map.drag) { ui.map.dragMoved = ui.map.drag.moved; ui.map.drag = null; }
}
document.addEventListener('pointerup', mapPointerEnd);
document.addEventListener('pointercancel', mapPointerEnd);
// После перетаскивания или долгого нажатия обычное нажатие не срабатывает
document.addEventListener('click', (ev) => {
  if (ui.tab !== 'map') return;
  const pressFired = ui.map.press && ui.map.press.fired;
  if ((ui.map.dragMoved || pressFired) && ev.target.closest && ev.target.closest('#rm-viewport, .rm-cards')) {
    ev.stopPropagation(); ev.preventDefault();
  }
  ui.map.dragMoved = false;
  if (pressFired) ui.map.press = null;
}, true);
document.addEventListener('contextmenu', (ev) => {
  const nodeEl = ev.target.closest && ev.target.closest('[data-node]');
  if (!nodeEl || ui.tab !== 'map') return;
  ev.preventDefault();
  clearTimeout(ui.map.pressTimer);
  if (ui.map.press && ui.map.press.fired) return; // меню уже открыто долгим нажатием
  mapNodeMenu(nodeEl.dataset.node);
});
document.addEventListener('wheel', (ev) => {
  const vp = ev.target.closest && ev.target.closest('#rm-viewport');
  if (!vp) return;
  ev.preventDefault();
  const m = curMap(), v = m && ui.map.view[m.id];
  if (!v) return;
  const r = vp.getBoundingClientRect();
  if (ev.ctrlKey || ev.metaKey) mapZoomAt(Math.exp(-ev.deltaY / 500), ev.clientX - r.left, ev.clientY - r.top); // щипок на тачпаде
  else { v.tx -= ev.deltaX; v.ty -= ev.deltaY; mapApplyView(); }
}, { passive: false });

/* ---------- Меню узла (долгое нажатие) ---------- */
function mapNodeMenu(id) {
  const m = curMap(), n = mapNode(m, id);
  if (!n) return;
  ui.map.menuId = id;
  const kids = RespMap.childrenOf(m, id).length;
  const ownerLine = n.type === 'project' && project(n.ref) ? `<div class="sub">Ответственный: ${esc(project(n.ref).ownerId || 'не указан')}</div>` : '';
  modal(`<h3 style="margin-bottom:4px">${esc(mapNodeName(n))}</h3>${ownerLine}
    <div class="rm-menu mt">
      <button class="btn" data-a="map-rename">${icon('edit')}Переименовать${n.type === 'person' ? ' исполнителя' : n.type === 'project' ? ' проект' : ''}</button>
      ${n.type !== 'group' ? `<button class="btn" data-a="map-owner">${icon('crm')}${n.type === 'project' ? 'Сменить ответственного' : 'Заменить человека'}</button>` : ''}
      <button class="btn" data-a="map-move">${icon('map')}Переместить</button>
      ${kids ? `<button class="btn" data-a="map-fold" data-id="${id}">${n.collapsed ? 'Развернуть ветку' : 'Свернуть ветку'}</button>` : ''}
      <button class="btn danger" data-a="map-remove">${icon('trash')}Убрать с карты</button>
      <button class="btn" data-a="modal-close">Отмена</button>
    </div>`);
}
function parentOptions(m, excludeId) {
  return [['', 'В корень карты']].concat(m.nodes
    .filter((x) => x.type !== 'project' && x.id !== excludeId && !(excludeId && RespMap.isDescendant(m, x.id, excludeId)))
    .map((x) => [x.id, (x.type === 'group' ? 'Направление: ' : '') + mapNodeName(x)]));
}

/* ---------- Нажатия: задачи проекта / человека ---------- */
SHEETS.mapProject = function ({ id }) {
  const p = project(id);
  if (!p) return sheetHead('Проект удалён');
  const open = tasksOfProject(p.id).filter((t) => !isDone(t)).sort(sortByDue);
  const s = RespMap.count(open, mapToday());
  return sheetHead(`<span class="rm-h-ic">${icon('folder')}</span> ${esc(p.name)}`, `<button class="btn sm" data-a="open" data-type="project" data-id="${p.id}">Проект</button>`)
    + `<div class="sub" style="margin:-4px 0 8px">Ответственный: <b>${esc(p.ownerId || 'не указан')}</b> · фильтр: не выполнено</div>
    <div class="rm-c" style="margin-bottom:10px"><span class="rm-k ${s.soon ? 'yellow' : ''}">в работе <b>${s.open}</b></span><span class="rm-k ${s.overdue ? 'red' : ''}">просрочено <b>${s.overdue}</b></span></div>
    ${listOf(open, taskItem, 'Невыполненных задач нет')}
    <div class="form-actions mt"><button class="btn" data-a="new" data-type="task" data-preset='${esc(JSON.stringify({ projectId: p.id }))}'>${icon('plus')}Задача в проект</button></div>`;
};
SHEETS.mapPerson = function ({ id }) {
  const name = id;
  const pt = RespMap.personTasks(D, name);
  const open = pt.tasks.filter((t) => !isDone(t));
  const s = RespMap.count(open, mapToday());
  const groups = new Map();
  open.slice().sort(sortByDue).forEach((t) => { const k = t.projectId || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const order = Array.from(groups.keys()).sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || mapProjName(a).localeCompare(mapProjName(b), 'ru'));
  return sheetHead(`<span class="rm-h-ic">${icon('crm')}</span> ${esc(name)}`)
    + `<div class="rm-c" style="margin-bottom:6px"><span class="rm-k ${s.soon ? 'yellow' : ''}">в работе <b>${s.open}</b></span><span class="rm-k ${s.overdue ? 'red' : ''}">просрочено <b>${s.overdue}</b></span></div>
    <div class="sub" style="margin-bottom:8px">Его задачи (исполнитель) и открытые задачи проектов, где он ответственный; из них в его проектах: ${pt.inOwn}.</div>
    ${order.length ? order.map((k) => {
      const p = k && project(k);
      return `<div class="section-title">${p ? `<span class="rm-h-ic">${icon('folder')}</span> ${esc(p.name)}${p.ownerId === name ? ' <span class="chip blue">ответственный</span>' : ''}` : 'Без проекта'} <span class="muted small">${groups.get(k).length}</span></div>${listOf(groups.get(k), taskItem, '')}`;
    }).join('') : '<div class="list"><div class="empty">Невыполненных задач нет</div></div>'}`;
};
const mapProjName = (pid) => (pid && project(pid) ? project(pid).name : '');

/* ---------- Действия ---------- */
Object.assign(ACTIONS, {
  'map-create': (el) => {
    const now = new Date().toISOString();
    const m = { id: uid('m'), name: D.maps.length ? 'Карта ' + (D.maps.length + 1) : 'Руководители', nodes: [], createdAt: now, updatedAt: now };
    D.maps.push(m);
    D.settings.mapId = m.id;
    if (el.dataset.id === 'auto') {
      const n = RespMap.autoBuild(D, m);
      toast(n ? `Добавлено узлов: ${n}` : 'Нет проектов с ответственными — укажите их в карточках проектов');
    }
    mapTouch(m); render();
  },
  'map-view': (el) => { const m = curMap(); m.view = el.dataset.id; mapTouch(m); render(); },
  'map-zoom': (el) => {
    const m = curMap(), vp = $('#rm-viewport');
    if (!m || !vp) return;
    const k = Number(el.dataset.id);
    if (!k) { ui.map.view[m.id] = mapFit(Number(vp.dataset.w), Number(vp.dataset.h)); mapApplyView(); return; }
    mapZoomAt(k > 0 ? 1.25 : 0.8, vp.clientWidth / 2, vp.clientHeight / 2);
  },
  'map-fold': (el) => {
    const m = curMap(), n = mapNode(m, el.dataset.id);
    if (!n) return;
    n.collapsed = !n.collapsed;
    modal(null); mapTouch(m); render();
  },
  'map-open': (el) => {
    const m = curMap(), n = mapNode(m, el.dataset.id);
    if (!n) return;
    if (n.type === 'project') openSheet('mapProject', n.ref);
    else if (n.type === 'person') openSheet('mapPerson', n.ref);
    else if (RespMap.childrenOf(m, n.id).length) ACTIONS['map-fold'](el);
  },
  'map-auto': () => {
    const m = curMap();
    const n = RespMap.autoBuild(D, m);
    if (!n) { toast(D.projects.some((p) => p.ownerId) ? 'Все люди с проектами уже на карте' : 'Нет проектов с ответственными — укажите их в карточках проектов'); return; }
    mapTouch(m); render(); toast(`Добавлено узлов: ${n}. Лишнее можно убрать долгим нажатием`);
  },
  'map-add': () => { mapAddDialog(); },
  'map-add-type': (el) => { ui.map.addType = el.dataset.id; mapAddDialog(); },
  'map-add-do': () => {
    const m = curMap();
    const type = ui.map.addType;
    const parentId = ($('#rm-parent') || {}).value || null;
    let ref = '';
    if (type === 'person') {
      ref = (($('#rm-person-new') || {}).value || '').trim() || ($('#rm-person') || {}).value || '';
      if (!ref) return toast('Выберите человека');
      if (!D.settings.people.includes(ref)) D.settings.people.push(ref);
    } else if (type === 'group') {
      ref = (($('#rm-group') || {}).value || '').trim();
      if (!ref) return toast('Введите название направления');
    } else {
      ref = ($('#rm-project') || {}).value || '';
      if (!ref) return toast('Выберите проект');
      const owner = ($('#rm-owner') || {}).value;
      if (owner !== undefined && owner !== null && owner !== '__keep') project(ref).ownerId = owner || null;
    }
    const n = RespMap.addNode(m, type, ref, parentId);
    if (n.parentId) { const pn = mapNode(m, n.parentId); if (pn) pn.collapsed = false; }
    modal(null); mapTouch(m); render(); toast('Добавлено на карту');
  },
  'map-rename': () => {
    const m = curMap(), n = mapNode(m, ui.map.menuId);
    if (!n) return;
    modal(`<h3>Переименовать</h3>${n.type === 'person' ? '<div class="sub" style="margin-bottom:8px">Имя изменится везде: в задачах, проектах и на всех картах.</div>' : n.type === 'project' ? '<div class="sub" style="margin-bottom:8px">Изменится название проекта.</div>' : ''}
      <input class="search" id="rm-name" value="${esc(mapNodeName(n))}">
      <div class="form-actions mt"><button class="btn primary" data-a="map-rename-save">${icon('check')}Сохранить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
    setTimeout(() => { const i = $('#rm-name'); if (i) { i.focus(); i.select(); } }, 30);
  },
  'map-rename-save': () => {
    const m = curMap(), n = mapNode(m, ui.map.menuId);
    const v = (($('#rm-name') || {}).value || '').trim();
    if (!n || !v) return;
    if (n.type === 'group') n.ref = v;
    else if (n.type === 'project') { const p = project(n.ref); if (p) { p.name = v; p.updatedAt = new Date().toISOString(); } }
    else if (!renamePerson(n.ref, v)) return;
    modal(null); mapTouch(m); render(); toast('Переименовано');
  },
  'map-owner': () => {
    const m = curMap(), n = mapNode(m, ui.map.menuId);
    if (!n) return;
    const cur = n.type === 'project' ? (project(n.ref) || {}).ownerId : n.ref;
    modal(`<h3>${n.type === 'project' ? 'Ответственный за проект' : 'Заменить человека на узле'}</h3>
      <select class="search" id="rm-owner-pick">${n.type === 'project' ? '<option value="">— не указан —</option>' : ''}${D.settings.people.map((x) => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      ${n.type === 'project' ? '<div class="sub mt">Ответственный хранится в самом проекте и виден в его карточке и на всех картах.</div>' : ''}
      <div class="form-actions mt"><button class="btn primary" data-a="map-owner-save">${icon('check')}Сохранить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
  },
  'map-owner-save': () => {
    const m = curMap(), n = mapNode(m, ui.map.menuId);
    const v = ($('#rm-owner-pick') || {}).value || '';
    if (!n) return;
    if (n.type === 'project') { const p = project(n.ref); if (p) { p.ownerId = v || null; p.updatedAt = new Date().toISOString(); } }
    else if (v) n.ref = v;
    modal(null); mapTouch(m); render(); toast('Сохранено');
  },
  'map-move': () => {
    const m = curMap(), n = mapNode(m, ui.map.menuId);
    if (!n) return;
    modal(`<h3>Переместить «${esc(mapNodeName(n))}»</h3>
      <select class="search" id="rm-move-to">${parentOptions(m, n.id).map(([v, t]) => `<option value="${esc(v)}" ${(n.parentId || '') === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <div class="sub mt">Переносится вместе со своей веткой.</div>
      <div class="form-actions mt"><button class="btn primary" data-a="map-move-save">${icon('check')}Переместить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
  },
  'map-move-save': () => {
    const m = curMap();
    const to = ($('#rm-move-to') || {}).value || null;
    if (!RespMap.moveNode(m, ui.map.menuId, to)) return toast('Нельзя переместить внутрь собственной ветки');
    const pn = to && mapNode(m, to);
    if (pn) pn.collapsed = false;
    modal(null); mapTouch(m); render();
  },
  'map-remove': () => {
    const m = curMap(), n = mapNode(m, ui.map.menuId);
    if (!n) return;
    const kids = RespMap.childrenOf(m, n.id).length;
    confirmBox(`Убрать «${mapNodeName(n)}» с карты?${kids ? ' Вложенные узлы поднимутся на уровень выше.' : ''} Сам ${n.type === 'project' ? 'проект' : n.type === 'person' ? 'человек' : 'узел'} и задачи не удаляются.`, () => {
      RespMap.removeNode(m, n.id);
      mapTouch(m); render();
    }, 'Убрать');
  },
  'map-menu': () => {
    const m = curMap();
    modal(`<h3>${esc(m.name)}</h3><div class="rm-menu">
      <button class="btn" data-a="map-new">${icon('plus')}Новая карта</button>
      <button class="btn" data-a="map-name">${icon('edit')}Переименовать карту</button>
      <button class="btn danger" data-a="map-del">${icon('trash')}Удалить карту</button>
      <button class="btn" data-a="modal-close">Отмена</button></div>`);
  },
  'map-new': () => {
    modal(`<h3>Новая карта</h3><input class="search" id="rm-map-name" placeholder="Например: Стройка 2027">
      <div class="form-actions mt"><button class="btn primary" data-a="map-new-save">${icon('check')}Создать</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
    setTimeout(() => { const i = $('#rm-map-name'); if (i) i.focus(); }, 30);
  },
  'map-new-save': () => {
    const name = (($('#rm-map-name') || {}).value || '').trim() || 'Карта ' + (D.maps.length + 1);
    const now = new Date().toISOString();
    const m = { id: uid('m'), name, nodes: [], createdAt: now, updatedAt: now };
    D.maps.push(m); D.settings.mapId = m.id;
    modal(null); mapTouch(m); render();
  },
  'map-name': () => {
    const m = curMap();
    modal(`<h3>Название карты</h3><input class="search" id="rm-map-name" value="${esc(m.name)}">
      <div class="form-actions mt"><button class="btn primary" data-a="map-name-save">${icon('check')}Сохранить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
  },
  'map-name-save': () => {
    const m = curMap(), v = (($('#rm-map-name') || {}).value || '').trim();
    if (v) m.name = v;
    modal(null); mapTouch(m); render();
  },
  'map-del': () => {
    const m = curMap();
    confirmBox(`Удалить карту «${m.name}»? Проекты, люди и задачи не удаляются.`, () => {
      D.maps = D.maps.filter((x) => x.id !== m.id);
      D.settings.mapId = D.maps[0] ? D.maps[0].id : null;
      save(); render(); toast('Карта удалена');
    });
  },
});

function mapAddDialog() {
  const m = curMap();
  const t = ui.map.addType;
  const onMap = new Set(m.nodes.filter((n) => n.type === 'project').map((n) => n.ref));
  const free = D.projects.filter((p) => !p.archived && !onMap.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const people = D.settings.people.slice();
  const body = t === 'person'
    ? `<div class="field"><label>Руководитель</label><select class="search" id="rm-person">${people.map((x) => `<option>${esc(x)}</option>`).join('')}</select>
       <input class="search mt" id="rm-person-new" placeholder="или новый человек"></div>`
    : t === 'group'
      ? `<div class="field"><label>Название направления</label><input class="search" id="rm-group" placeholder="Например: Продажи"></div>`
      : free.length ? `<div class="field"><label>Проект</label><select class="search" id="rm-project">${free.map((p) => `<option value="${p.id}">${esc(p.name)}${p.ownerId ? ' — ' + esc(p.ownerId) : ''}</option>`).join('')}</select></div>
         <div class="field"><label>Ответственный за проект</label><select class="search" id="rm-owner"><option value="__keep">не менять</option><option value="">— не указан —</option>${people.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>`
        : '<div class="sub">Все активные проекты уже на этой карте.</div>';
  modal(`<h3>Добавить на карту</h3>
    <div class="seg" style="margin-bottom:10px">${[['person', 'Руководитель'], ['group', 'Направление'], ['project', 'Проект']].map(([k, n]) => `<button class="${t === k ? 'on' : ''}" data-a="map-add-type" data-id="${k}">${n}</button>`).join('')}</div>
    <div class="form">${body}
      <div class="field"><label>Куда</label><select class="search" id="rm-parent">${parentOptions(m, null).map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('')}</select></div></div>
    <div class="form-actions mt"><button class="btn primary" data-a="map-add-do" ${t === 'project' && !free.length ? 'disabled' : ''}>${icon('plus')}Добавить</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
}

// Выбор карты в заголовке
document.addEventListener('change', (ev) => {
  if (!ev.target.matches || !ev.target.matches('[data-change="mapPick"]')) return;
  ev.stopImmediatePropagation();
  D.settings.mapId = ev.target.value;
  save(); render();
}, true);
