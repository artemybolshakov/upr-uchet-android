/* 管理会计 — экран «Дорожная карта»: общая лента вех и строки «По проектам».
 * Расчёты — Roadmap (roadmap.js), здесь только отрисовка. Загружается после app.js.
 * Состояние вида — D.settings.roadmap = { expanded, range }.
 * Шкала всегда покрывает все вехи; «Квартал / Полгода / Год / Всё» меняют масштаб, лента прокручивается по горизонтали.
 * Вехи привязаны к неделе (точка — в центре недели пн–вс). В общей ленте подписан только проект,
 * подробности (название вехи, дата, неделя) — в строках «По проектам».
 */
'use strict';

ui.rd = { scrolledKey: null, focus: null };

const RD = {
  TOP: 62, // высота шкалы: кварталы (22) + месяцы (22) + недели (18)
};
const rdSettings = () => D.settings.roadmap || (D.settings.roadmap = { expanded: false, range: 'year' });
const rdNarrow = () => window.innerWidth < 600;
const RD_STATE = { done: 'выполнена', overdue: 'просрочена', soon: 'в ближайшие 7 дней', later: 'позже' };

function rdShortDate(s) { const d = parseDate(s); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); }
const rdProjName = (pid) => (pid && project(pid) ? project(pid).name : 'Без проекта');
// «3-я неделя ноября · 18 ноя»
const rdWeekDate = (due) => Roadmap.weekInfo(Roadmap.weekStart(due)).label + ' · ' + rdShortDate(due);

/* Общая геометрия шкалы: диапазон (все вехи), масштаб (режим), x(дата), x(центр недели) */
function rdScale(items) {
  const s = rdSettings();
  const r = Roadmap.range(s.range, today(), items);
  const days = Roadmap.diff(r.from, r.to) + 1;
  const avail = Math.max(300, (($('#main') || {}).clientWidth || window.innerWidth) - (rdNarrow() ? 28 : 46));
  const ppd = Roadmap.ppd(s.range, avail, days);
  const W = Math.round(days * ppd);
  const x = (d) => (Roadmap.diff(r.from, d) + 0.5) * ppd;
  const xw = (monday) => Math.max(6, Math.min(W - 6, (Roadmap.diff(r.from, monday) + 3.5) * ppd)); // центр недели пн–вс
  return { r, days, ppd, W, x, xw, weekW: ppd * 7 };
}

/* Общая лента: на точке только проект; несколько вех проекта на одной неделе — одна точка с числом.
   Разные проекты на одной неделе расходятся по ярусам сверху и снизу. */
function rdMainRibbon(all, sc) {
  const narrow = rdNarrow();
  const groups = Roadmap.byWeek(all, true);
  const width = (g) => {
    const n = rdProjName(g.projectId).length;
    return Math.min(narrow ? 130 : 210, n * 8 + 38 + (g.items.length > 1 ? 22 : 0));
  };
  const L = Roadmap.layout(groups.map((g) => ({ x: sc.xw(g.monday), w: width(g) })), 'both', 6);
  const TIER = 30;
  const topH = Math.max(1, L.top) * TIER + 12;
  const botH = Math.max(1, L.bottom) * TIER + 12;
  const lineY = topH;
  const parts = [];
  groups.forEach((g, i) => {
    const pos = L.items[i], x = sc.xw(g.monday), w = width(g);
    const left = Math.max(0, Math.min(sc.W - w, x - w / 2));
    const top = pos.side === 'top' ? lineY - 10 - (pos.tier + 1) * TIER + 4 : lineY + 10 + pos.tier * TIER;
    const stemTop = pos.side === 'top' ? top + TIER - 6 : lineY + 5;
    const stemH = pos.side === 'top' ? Math.max(2, lineY - 5 - stemTop) : Math.max(2, top - stemTop);
    const name = rdProjName(g.projectId);
    const tip = `${name}: ${g.items.map((m) => m.title).join(', ')} — ${rdWeekDate(g.items[0].due)}`;
    parts.push(`<i class="rd-stem st-${g.state}" style="left:${x}px;top:${stemTop}px;height:${stemH}px"></i>`);
    parts.push(`<i class="rd-tick st-${g.state}" style="left:${x}px;top:${lineY}px"></i>`);
    parts.push(`<button type="button" class="rd-chip ${pos.side} st-${g.state}" style="left:${left}px;top:${top}px;width:${w}px" data-a="rd-focus" data-pid="${esc(g.projectId || '')}" data-ids="${esc(g.ids.join(' '))}" data-monday="${g.monday}" data-mids="${esc(g.ids.join(' '))}" title="${esc(tip)}">
      <i class="rd-cdot">${g.state === 'done' ? icon('check') : ''}</i><span class="rd-cname">${esc(name)}</span>${g.items.length > 1 ? `<b class="rd-cnum">${g.items.length}</b>` : ''}</button>`);
  });
  return { html: parts.join(''), height: topH + botH, lineY };
}

/* Строка проекта: название вехи жирным, под ним дата и порядковая неделя; несколько вех на неделе — точка с числом. */
function rdProjectRibbon(items, sc) {
  const narrow = rdNarrow();
  const groups = Roadmap.byWeek(items, false);
  const meta = (g) => (g.items.length > 1 ? Roadmap.weekInfo(g.monday).label : rdShortDate(g.items[0].due) + ' · ' + Roadmap.weekInfo(g.monday).n + '-я нед.');
  const width = (g) => {
    const t = g.items.length > 1 ? (g.items.length + ' вех').length : String(g.items[0].title || '').length;
    return Math.min(narrow ? 140 : 190, Math.max(t * 7.8, meta(g).length * 6.4) + 20);
  };
  const L = Roadmap.layout(groups.map((g) => ({ x: sc.xw(g.monday), w: width(g) })), 'top', 6);
  const TIER = 38;
  const topH = Math.max(1, L.top) * TIER + 12;
  const lineY = topH;
  const parts = [];
  groups.forEach((g, i) => {
    const pos = L.items[i], x = sc.xw(g.monday), w = width(g);
    const left = Math.max(0, Math.min(sc.W - w, x - w / 2));
    const top = lineY - 10 - (pos.tier + 1) * TIER + 4;
    const stemTop = top + TIER - 6;
    const ids = esc(g.ids.join(' '));
    const tip = g.items.map((m) => m.title).join(', ') + ' — ' + rdWeekDate(g.items[0].due);
    parts.push(`<i class="rd-stem st-${g.state}" style="left:${x}px;top:${stemTop}px;height:${Math.max(2, lineY - 7 - stemTop)}px"></i>`);
    const one = g.items.length === 1 ? g.items[0] : null;
    parts.push(one
      ? `<button type="button" class="rd-dot st-${g.state}" style="left:${x}px;top:${lineY}px" data-a="open" data-type="task" data-id="${one.id}" data-mids="${ids}" title="${esc(tip)} — ${RD_STATE[g.state]}">${g.state === 'done' ? icon('check') : ''}</button>`
      : `<button type="button" class="rd-dot rd-cluster st-${g.state}" style="left:${x}px;top:${lineY}px" data-a="rd-week" data-pid="${esc(g.projectId || '')}" data-monday="${g.monday}" data-mids="${ids}" title="${esc(tip)}">${g.items.length}</button>`);
    parts.push(`<div class="rd-lab top st-${g.state}" style="left:${left}px;top:${top}px;width:${w}px" data-mids="${ids}">${one
      ? `<button type="button" class="rd-t" data-a="open" data-type="task" data-id="${one.id}" title="${esc(one.title)}">${esc(one.title)}</button><span class="rd-m"><button type="button" class="rd-date" data-a="task-due" data-id="${one.id}" data-field="due" title="Изменить срок">${esc(rdShortDate(one.due))}</button> · ${Roadmap.weekInfo(g.monday).n}-я нед.</span>`
      : `<button type="button" class="rd-t" data-a="rd-week" data-pid="${esc(g.projectId || '')}" data-monday="${g.monday}">${g.items.length} вех</button><span class="rd-m">${esc(meta(g))}</span>`}</div>`);
  });
  return { html: parts.join(''), height: topH + 10, lineY };
}

/* Шкала времени: кварталы, месяцы, недели (отсечки по понедельникам, номер недели внутри месяца — если влезает) */
function rdAxis(sc) {
  const span = (from, to) => `left:${sc.x(from) - sc.ppd / 2}px;width:${(Roadmap.diff(from, to) + 1) * sc.ppd}px`;
  const qs = Roadmap.quarters(sc.r).map((q) => `<div class="rd-q" style="${span(q.from, q.to)}"><span>${q.label}</span></div>`).join('');
  const ms = Roadmap.months(sc.r).map((m) => `<div class="rd-mo" style="${span(m.from, m.to)}"><span>${m.label}</span></div>`).join('');
  const label = sc.weekW >= 28;
  const ws = Roadmap.weeks(sc.r).map((w) => {
    const l = sc.x(w.monday) - sc.ppd / 2;
    return `<i class="rd-wk" style="left:${l}px;width:${sc.weekW}px">${label ? `<span>${w.n}</span>` : ''}</i>`;
  }).join('');
  return `<div class="rd-axis" style="height:${RD.TOP}px"><div class="rd-qs">${qs}</div><div class="rd-ms">${ms}</div><div class="rd-ws ${label ? '' : 'nolabel'}">${ws}</div></div>`;
}

SCREENS.roadmap = function () {
  const s = rdSettings();
  const t0 = today();
  const all = Roadmap.milestones(D, t0);
  const und = Roadmap.undated(D);
  const head = `<div class="head rd-head"><h1 class="grow">Дорожная карта</h1>
      ${all.length ? `<div class="seg rd-range">${Object.entries(Roadmap.RANGES).map(([k, n]) => `<button class="${s.range === k ? 'on' : ''}" data-a="rd-range" data-id="${k}">${n}</button>`).join('')}</div>` : ''}
    </div>`;
  const undLine = und.length ? `<button type="button" class="rd-undated" data-a="rd-undated">${icon('warn')}Вехи без срока: <b>${und.length}</b><span class="sub">— не на ленте, нажмите, чтобы указать срок</span></button>` : '';
  if (!all.length) {
    return head + undLine + `<div class="card rd-empty"><div class="rd-empty-ic">${icon('flag')}</div>
      <div style="font-size:15px"><b>Отметьте флажком «Веха» ключевые задачи проектов — они появятся здесь, а финиш проекта посчитается сам.</b></div>
      <div class="sub mt">Флажок — в карточке задачи → «Изменить», рядом со сроком. Срок проекта = срок самой дальней вехи.</div>
      <div class="mt"><button class="btn primary" data-a="tab" data-id="tasks">${icon('tasks')}Открыть задачи</button></div></div>`;
  }
  const sc = rdScale(all);
  const main = rdMainRibbon(all, sc);
  const todayX = sc.x(t0);
  let y = RD.TOP;
  const blocks = [`<div class="rd-row rd-main" style="top:${y}px;height:${main.height}px"><i class="rd-line" style="top:${main.lineY}px"></i>${main.html}</div>`];
  y += main.height;
  const rows = s.expanded ? Roadmap.projectRows(D, t0) : [];
  rows.forEach((row) => {
    const p = row.project;
    const rb = rdProjectRibbon(row.milestones, sc);
    const HEAD = 30;
    const x1 = Math.max(0, sc.x(row.from)), x2 = Math.min(sc.W, sc.x(row.finish));
    blocks.push(`<div class="rd-prow" data-pid="${esc(p.id)}" style="top:${y}px;height:${HEAD + rb.height + 6}px">
      <div class="rd-phead"><button type="button" class="rd-pname" data-a="open" data-type="project" data-id="${p.id}"><i class="dot" style="background:${esc(p.color || colorFor(p.name))}"></i>${esc(p.name)}</button>${p.ownerId ? `<span class="rd-powner">${esc(p.ownerId)}</span>` : ''}<span class="rd-pfin st-${row.worst}">финиш ${esc(fmtDateY(row.finish))}</span></div>
      <div class="rd-pribbon" style="top:${HEAD}px;height:${rb.height}px">${x2 > x1 ? `<i class="rd-bar st-${row.worst}" style="left:${x1}px;width:${x2 - x1}px;top:${rb.lineY - 3}px"></i>` : ''}<i class="rd-line thin" style="top:${rb.lineY}px"></i>${rb.html}</div>
    </div>`);
    y += HEAD + rb.height + 6;
  });
  const H = y + 8;
  // сетка: границы месяцев заметнее, понедельники — тонкими линиями
  const grid = Roadmap.months(sc.r).map((m) => `<i class="rd-grid" style="left:${sc.x(m.from) - sc.ppd / 2}px"></i>`).join('')
    + (sc.weekW >= 9 ? Roadmap.weeks(sc.r).map((w) => `<i class="rd-wgrid" style="left:${sc.x(w.monday) - sc.ppd / 2}px"></i>`).join('') : '');
  const legend = `<div class="rd-legend sub"><span><i class="rd-ldot st-done"></i>выполнена</span><span><i class="rd-ldot st-overdue"></i>просрочена</span><span><i class="rd-ldot st-soon"></i>срок в ближайшие 7 дней</span><span><i class="rd-ldot st-later"></i>позже</span><span>· точка — неделя вехи</span></div>`;
  return head + undLine + `<div class="rd-card">
      <div class="rd-tools"><span class="sub grow">${all.length} ${plural(all.length, 'веха', 'вехи', 'вех')}${rows.length ? ` · проектов с вехами: ${rows.length}` : ''}</span>
        <button type="button" class="btn sm" data-a="rd-today">${icon('today')}Сегодня</button>
        <button type="button" class="btn sm rd-expand ${s.expanded ? 'on' : ''}" data-a="rd-expand">${icon(s.expanded ? 'back' : 'folder')}${s.expanded ? 'Свернуть' : 'По проектам'}</button></div>
      <div class="rd-scroll" id="rd-scroll" data-today-x="${todayX}">
        <div class="rd-inner" style="width:${sc.W}px;height:${H}px">
          ${grid}${rdAxis(sc)}
          <i class="rd-today" style="left:${todayX}px;height:${H - 22}px"><span>сегодня</span></i>
          ${blocks.join('')}
        </div>
      </div>
      ${s.expanded && !rows.length ? '<div class="sub" style="padding:8px 12px">Вехи не привязаны к проектам.</div>' : ''}
    </div>${legend}`;
};

function rdScrollToday(smooth) {
  const sc = $('#rd-scroll');
  if (!sc) return;
  const left = Math.max(0, Number(sc.dataset.todayX) - sc.clientWidth * 0.15);
  if (smooth && sc.scrollTo) sc.scrollTo({ left, behavior: 'smooth' }); else sc.scrollLeft = left;
}

function roadmapAfterRender() {
  const sc = $('#rd-scroll');
  if (!sc) return;
  // заголовки проектов прилипают к левому краю и занимают видимую ширину
  $$('.rd-phead', sc).forEach((h) => { h.style.width = sc.clientWidth + 'px'; });
  const key = rdSettings().range + ':' + today();
  if (ui.rd.scrolledKey !== key) { rdScrollToday(false); ui.rd.scrolledKey = key; }
  else if (ui.rd.scrollLeft != null) sc.scrollLeft = ui.rd.scrollLeft;
  sc.addEventListener('scroll', () => { ui.rd.scrollLeft = sc.scrollLeft; }, { passive: true });
  // нажали точку в общей ленте: прокрутить к строке проекта и на секунду подсветить веху
  const f = ui.rd.focus;
  if (f) {
    ui.rd.focus = null;
    const row = f.pid && $(`.rd-prow[data-pid="${CSS.escape(f.pid)}"]`, sc);
    const scope = row || $('.rd-main', sc);
    const marks = f.ids.flatMap((id) => $$(`[data-mids~="${CSS.escape(id)}"]`, scope));
    if (marks[0]) {
      const r = marks[0].getBoundingClientRect(), sr = sc.getBoundingClientRect();
      sc.scrollLeft = Math.max(0, sc.scrollLeft + (r.left - sr.left) - sc.clientWidth / 2 + r.width / 2);
      ui.rd.scrollLeft = sc.scrollLeft;
    }
    if (row) row.scrollIntoView({ block: 'center' });
    marks.forEach((el) => { el.classList.remove('rd-flash'); void el.offsetWidth; el.classList.add('rd-flash'); });
    setTimeout(() => marks.forEach((el) => el.classList.remove('rd-flash')), 1300);
  }
}
window.addEventListener('resize', () => { const sc = $('#rd-scroll'); if (sc) $$('.rd-phead', sc).forEach((h) => { h.style.width = sc.clientWidth + 'px'; }); });

const rdWeekItems = (pid, monday) => Roadmap.milestones(D, today()).filter((m) => (m.projectId || '') === (pid || '') && Roadmap.weekStart(m.due) === monday).map((m) => m.task);

Object.assign(ACTIONS, {
  'rd-range': (el, ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    rdSettings().range = el.dataset.id;
    ui.rd.scrolledKey = null; ui.rd.scrollLeft = null;
    save(); render();
  },
  'rd-today': () => rdScrollToday(true),
  'rd-expand': () => { const s = rdSettings(); s.expanded = !s.expanded; save(); render(); },
  // точка общей ленты → развернуть «По проектам», прокрутить к строке проекта, подсветить веху
  'rd-focus': (el) => {
    const pid = el.dataset.pid || '', ids = (el.dataset.ids || '').split(' ').filter(Boolean);
    if (!pid) { // веха без проекта: строки нет — открываем задачу (или список недели)
      if (ids.length === 1) openSheet('task', ids[0]);
      else ACTIONS['rd-week'](el);
      return;
    }
    const s = rdSettings();
    if (!s.expanded) { s.expanded = true; save(); }
    ui.rd.focus = { pid, ids };
    render();
  },
  'rd-week': (el) => {
    const items = rdWeekItems(el.dataset.pid, el.dataset.monday);
    const w = Roadmap.weekInfo(el.dataset.monday);
    modal(`<h3>${esc(rdProjName(el.dataset.pid))}: ${esc(w.label)}</h3>${listOf(items, taskItem, '')}<div class="form-actions mt"><button class="btn" data-a="modal-close">Закрыть</button></div>`);
  },
  'rd-cluster': (el) => { // совместимость со старыми ссылками: вехи на дату
    const items = Roadmap.milestones(D, today()).filter((m) => m.due === el.dataset.id).map((m) => m.task);
    modal(`<h3>Вехи на ${esc(fmtDate(el.dataset.id, true))}</h3>${listOf(items, taskItem, '')}<div class="form-actions mt"><button class="btn" data-a="modal-close">Закрыть</button></div>`);
  },
  'rd-undated': () => {
    const items = Roadmap.undated(D);
    modal(`<h3>Вехи без срока</h3><div class="sub" style="margin-bottom:8px">Нажмите «+ срок», чтобы указать дату — веха появится на ленте.</div>${listOf(items, taskItem, 'Все вехи со сроком')}<div class="form-actions mt"><button class="btn" data-a="modal-close">Закрыть</button></div>`);
  },
});

/* Форма задачи: флажок «Веха» без срока — подсказка и фокус на поле «Срок» */
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (!el || !el.form) return;
  if (el.name === 'milestone' || el.name === 'due') {
    const f = el.form, hint = $('#ms-hint', f);
    if (!hint || !f.elements.milestone || !f.elements.due) return;
    const need = f.elements.milestone.checked && !f.elements.due.value;
    hint.hidden = !need;
    if (need && el.name === 'milestone') { try { f.elements.due.focus(); if (f.elements.due.showPicker) f.elements.due.showPicker(); } catch (e) { /* */ } }
  }
});

try { renderNav(); } catch (e) { /* */ }

/* Форма задачи: срок раньше начала — начало приравнивается к сроку (как в быстрой смене срока) */
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (!el || !el.form || el.form.dataset.form !== 'task' || el.name !== 'due') return;
  const f = el.form, st = f.elements.start, hint = $('#start-hint', f);
  if (st && st.value && el.value && el.value < st.value) {
    st.value = el.value;
    if (hint) hint.hidden = false;
  } else if (hint && (!el.value || !st || !st.value || el.value > st.value)) hint.hidden = true;
});
