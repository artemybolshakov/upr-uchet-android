/* 管理会计 — экран «Дорожная карта»: общая лента вех и строки «По проектам».
 * Расчёты — Roadmap (roadmap.js), здесь только отрисовка. Загружается после app.js.
 * Состояние вида — D.settings.roadmap = { expanded, range }.
 */
'use strict';

ui.rd = { scrolledKey: null };

const RD = {
  minPPD: { quarter: 7, half: 3.6, year: 2.4, all: 1.2 }, // пикселей на день (не меньше)
  TOP: 44,                                                // высота шкалы (кварталы + месяцы)
};
const rdSettings = () => D.settings.roadmap || (D.settings.roadmap = { expanded: false, range: 'year' });
const rdNarrow = () => window.innerWidth < 600;
const RD_STATE = { done: 'выполнена', overdue: 'просрочена', soon: 'в ближайшие 7 дней', later: 'позже' };

function rdShortDate(s) { const d = parseDate(s); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); }

/* Общая геометрия шкалы: диапазон, масштаб, x(дата) */
function rdScale(items) {
  const s = rdSettings();
  const r = Roadmap.range(s.range, today(), items);
  const days = Roadmap.diff(r.from, r.to) + 1;
  const avail = Math.max(300, (($('#main') || {}).clientWidth || window.innerWidth) - (rdNarrow() ? 28 : 46));
  const ppd = Math.max(RD.minPPD[s.range] || 2, avail / days);
  const W = Math.round(days * ppd);
  const x = (d) => (Roadmap.diff(r.from, d) + 0.5) * ppd;
  const inRange = (d) => d >= r.from && d <= r.to;
  return { r, days, ppd, W, x, inRange };
}

/* Подписи и точки одной ленты. full — общая лента (подписи сверху и снизу), иначе строка проекта (только сверху). */
function rdRibbon(items, sc, full) {
  const narrow = rdNarrow();
  const marks = Roadmap.clusters(items.filter((m) => sc.inRange(m.due)));
  const width = (m) => {
    if (m.cluster) return 64;
    const t = String(m.title || '').length;
    if (!full) return Math.min(130, t * 6.2 + 14);
    if (narrow) return Math.min(120, t * 6.6 + 14);
    return Math.min(200, Math.max(t * 7.4, (rdShortDate(m.due) + ' · ' + (m.owner || '')).length * 6.4) + 18);
  };
  const L = Roadmap.layout(marks.map((m) => ({ x: sc.x(m.due), w: width(m) })), full ? 'both' : 'top', 6);
  const TIER = full ? (narrow ? 30 : 44) : 24;
  const dateUnder = full && narrow ? 26 : 0; // на узком экране дата — под точкой (две строки, чтобы близкие даты не налезали)
  const dateEnds = [-1e9, -1e9];
  const topH = Math.max(1, L.top) * TIER + 14;
  const botH = full ? Math.max(1, L.bottom) * TIER + 14 + dateUnder : 10;
  const lineY = topH;
  const parts = [];
  marks.forEach((m, i) => {
    const pos = L.items[i];
    const x = sc.x(m.due), w = width(m);
    const left = Math.max(0, Math.min(sc.W - w, x - w / 2));
    const top = pos.side === 'top' ? lineY - 12 - (pos.tier + 1) * TIER + 4 : lineY + 12 + dateUnder + pos.tier * TIER;
    const stemTop = pos.side === 'top' ? top + TIER - 6 : lineY + 7;
    const stemH = pos.side === 'top' ? Math.max(2, lineY - 7 - stemTop) : Math.max(2, top - stemTop);
    parts.push(`<i class="rd-stem st-${m.state}" style="left:${x}px;top:${stemTop}px;height:${stemH}px"></i>`);
    if (m.cluster) {
      parts.push(`<button type="button" class="rd-dot rd-cluster st-${m.state}" style="left:${x}px;top:${lineY}px" data-a="rd-cluster" data-id="${m.due}" title="${m.items.length} вех · ${esc(rdShortDate(m.due))}">+${m.items.length}</button>`);
      parts.push(`<div class="rd-lab ${pos.side} st-${m.state} ${full ? '' : 'small'}" style="left:${left}px;top:${top}px;width:${w}px"><button type="button" class="rd-t" data-a="rd-cluster" data-id="${m.due}">${m.items.length} вех${full ? '' : ' · ' + esc(rdShortDate(m.due))}</button>${full ? `<span class="rd-m">${esc(rdShortDate(m.due))}</span>` : ''}</div>`);
      return;
    }
    parts.push(`<button type="button" class="rd-dot st-${m.state}" style="left:${x}px;top:${lineY}px" data-a="open" data-type="task" data-id="${m.id}" title="${esc(m.title)} — ${RD_STATE[m.state]}">${m.state === 'done' ? icon('check') : ''}</button>`);
    if (dateUnder) {
      const line = x - 17 > dateEnds[0] ? 0 : x - 17 > dateEnds[1] ? 1 : (dateEnds[0] <= dateEnds[1] ? 0 : 1);
      dateEnds[line] = x + 17;
      parts.push(`<button type="button" class="rd-under" style="left:${x}px;top:${lineY + 8 + line * 12}px" data-a="task-due" data-id="${m.id}" data-field="due">${esc(fmtShort(m.due))}</button>`);
    }
    const meta = full && !narrow
      ? `<span class="rd-m"><button type="button" class="rd-date" data-a="task-due" data-id="${m.id}" data-field="due" title="Изменить срок">${esc(rdShortDate(m.due))}</button>${m.owner ? ' · ' + esc(m.owner) : ''}</span>` : '';
    parts.push(`<div class="rd-lab ${pos.side} st-${m.state} ${full ? '' : 'small'}" style="left:${left}px;top:${top}px;width:${w}px"><button type="button" class="rd-t" data-a="open" data-type="task" data-id="${m.id}" title="${esc(m.title)}">${esc(m.title)}</button>${meta}</div>`);
  });
  return { html: parts.join(''), height: topH + botH, lineY };
}

/* Шкала времени: кварталы, месяцы; сетка месяцев и «сегодня» рисуются на всю высоту */
function rdAxis(sc) {
  const qs = Roadmap.quarters(sc.r).map((q) => `<div class="rd-q" style="left:${sc.x(q.from) - sc.ppd / 2}px;width:${(Roadmap.diff(q.from, q.to) + 1) * sc.ppd}px"><span>${q.label}</span></div>`).join('');
  const ms = Roadmap.months(sc.r).map((m) => `<div class="rd-mo" style="left:${sc.x(m.from) - sc.ppd / 2}px;width:${(Roadmap.diff(m.from, m.to) + 1) * sc.ppd}px"><span>${m.label}</span></div>`).join('');
  return `<div class="rd-axis" style="height:${RD.TOP}px"><div class="rd-qs">${qs}</div><div class="rd-ms">${ms}</div></div>`;
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
  const outside = all.filter((m) => !sc.inRange(m.due)).length;
  const main = rdRibbon(all, sc, true);
  const todayX = sc.x(t0);
  let y = RD.TOP;
  const blocks = [`<div class="rd-row rd-main" style="top:${y}px;height:${main.height}px"><i class="rd-line" style="top:${main.lineY}px"></i>${main.html}</div>`];
  y += main.height;
  const rows = s.expanded ? Roadmap.projectRows(D, t0) : [];
  rows.forEach((row) => {
    const p = row.project;
    const rb = rdRibbon(row.milestones, sc, false);
    const HEAD = 30;
    const x1 = Math.max(0, sc.x(row.from)), x2 = Math.min(sc.W, sc.x(row.finish));
    blocks.push(`<div class="rd-prow" style="top:${y}px;height:${HEAD + rb.height + 6}px">
      <div class="rd-phead"><button type="button" class="rd-pname" data-a="open" data-type="project" data-id="${p.id}"><i class="dot" style="background:${esc(p.color || colorFor(p.name))}"></i>${esc(p.name)}</button>${p.ownerId ? `<span class="rd-powner">${esc(p.ownerId)}</span>` : ''}<span class="rd-pfin st-${row.worst}">финиш ${esc(fmtDateY(row.finish))}</span></div>
      <div class="rd-pribbon" style="top:${HEAD}px;height:${rb.height}px">${x2 > x1 ? `<i class="rd-bar st-${row.worst}" style="left:${x1}px;width:${x2 - x1}px;top:${rb.lineY - 3}px"></i>` : ''}<i class="rd-line thin" style="top:${rb.lineY}px"></i>${rb.html}</div>
    </div>`);
    y += HEAD + rb.height + 6;
  });
  const H = y + 8;
  const grid = Roadmap.months(sc.r).map((m) => `<i class="rd-grid" style="left:${sc.x(m.from) - sc.ppd / 2}px"></i>`).join('');
  const legend = `<div class="rd-legend sub"><span><i class="rd-ldot st-done"></i>выполнена</span><span><i class="rd-ldot st-overdue"></i>просрочена</span><span><i class="rd-ldot st-soon"></i>срок в ближайшие 7 дней</span><span><i class="rd-ldot st-later"></i>позже</span>${outside ? `<span>· за пределами шкалы: ${outside} — <a href="#" class="link" data-a="rd-range" data-id="all">показать всё</a></span>` : ''}</div>`;
  return head + undLine + `<div class="rd-card">
      <div class="rd-tools"><span class="sub">${all.length} ${plural(all.length, 'веха', 'вехи', 'вех')}${rows.length ? ` · проектов с вехами: ${rows.length}` : ''}</span>
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

function roadmapAfterRender() {
  const sc = $('#rd-scroll');
  if (!sc) return;
  // заголовки проектов прилипают к левому краю и занимают видимую ширину
  $$('.rd-phead', sc).forEach((h) => { h.style.width = sc.clientWidth + 'px'; });
  const key = rdSettings().range + ':' + today();
  if (ui.rd.scrolledKey !== key) {
    sc.scrollLeft = Math.max(0, Number(sc.dataset.todayX) - sc.clientWidth * 0.15);
    ui.rd.scrolledKey = key;
  } else if (ui.rd.scrollLeft != null) sc.scrollLeft = ui.rd.scrollLeft;
  sc.addEventListener('scroll', () => { ui.rd.scrollLeft = sc.scrollLeft; }, { passive: true });
}
window.addEventListener('resize', () => { const sc = $('#rd-scroll'); if (sc) $$('.rd-phead', sc).forEach((h) => { h.style.width = sc.clientWidth + 'px'; }); });

Object.assign(ACTIONS, {
  'rd-range': (el, ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    rdSettings().range = el.dataset.id;
    ui.rd.scrolledKey = null; ui.rd.scrollLeft = null;
    save(); render();
  },
  'rd-expand': () => { const s = rdSettings(); s.expanded = !s.expanded; save(); render(); },
  'rd-cluster': (el) => {
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
