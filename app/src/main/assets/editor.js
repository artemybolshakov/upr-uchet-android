/* Редактор форматированного текста для заметок: заголовки, жирный/курсив/подчёркнутый,
 * списки с галочками, нумерованные (1, 2, 3) и буквенные (a, b, c).
 * Хранится очищенный HTML (note.html) + простой текст (note.body) — для поиска, сводки и старых версий. */
'use strict';

const RTE_TOOLS = [
  ['h1', 'Заголовок', '<b style="font-size:15px">H1</b>'],
  ['h2', 'Подзаголовок', '<b style="font-size:13px">H2</b>'],
  ['p', 'Обычный текст', '<span style="font-size:13px">Т</span>'],
  ['|'],
  ['bold', 'Жирный', '<b>Ж</b>'],
  ['italic', 'Курсив', '<i style="font-family:serif;font-size:17px">К</i>'],
  ['underline', 'Подчёркнутый', '<u>Ч</u>'],
  ['|'],
  ['check', 'Список с галочками', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="6" height="6" rx="1.5"/><path d="m4.5 7 1 1 2-2M13 7h8M3 15h6v6H3zM13 18h8"/></svg>'],
  ['ol', 'Нумерованный список', '<span style="font-size:12px;font-weight:700">1.</span>'],
  ['ola', 'Список с буквами', '<span style="font-size:12px;font-weight:700">a.</span>'],
  ['ul', 'Маркированный список', '<span style="font-size:18px;line-height:1">•</span>'],
  ['|'],
  ['clear', 'Убрать оформление', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 5h12M12 5l-3 14M4 20 20 4"/></svg>'],
];

function rteToolbar(name) {
  return `<div class="rte-bar" data-rte-bar="${name}">${RTE_TOOLS.map((t) => t[0] === '|'
    ? '<i class="rte-sep"></i>'
    : `<button type="button" class="rte-btn" data-cmd="${t[0]}" title="${t[1]}" aria-label="${t[1]}">${t[2]}</button>`).join('')}</div>`;
}
function rteField(name, html, placeholder) {
  return `<div class="rte-wrap">${rteToolbar(name)}<div class="rte" contenteditable="true" data-rte="${name}" data-placeholder="${esc(placeholder || '')}">${sanitizeHtml(html || '')}</div></div>`;
}

/* Очистка HTML: только разрешённые теги и атрибуты. Всё прочее разворачивается в текст. */
const RTE_ALLOWED = { H1: 'h1', H2: 'h2', H3: 'h2', P: 'p', DIV: 'p', BR: 'br', B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', UL: 'ul', OL: 'ol', LI: 'li' };
function sanitizeHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  const walk = (node, out) => {
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) { out.appendChild(document.createTextNode(ch.nodeValue)); return; }
      if (ch.nodeType !== 1) return;
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|SVG|IMG|VIDEO|AUDIO|NOSCRIPT)$/i.test(ch.tagName)) return;
      const tag = RTE_ALLOWED[ch.tagName];
      // жирный/курсив/подчёркивание, заданные стилем (вставка, автозамена WebView)
      const st = ch.getAttribute('style') || '';
      if (!tag) {
        let target = out;
        if (/font-weight:\s*(bold|[6-9]00)/i.test(st)) { const b = document.createElement('b'); out.appendChild(b); target = b; }
        if (/font-style:\s*italic/i.test(st)) { const i = document.createElement('i'); target.appendChild(i); target = i; }
        if (/text-decoration[^;]*underline/i.test(st)) { const u = document.createElement('u'); target.appendChild(u); target = u; }
        walk(ch, target);
        return;
      }
      if (tag === 'p' && ch.querySelector('ul, ol, h1, h2, h3, p, div')) { walk(ch, out); return; }
      const el = document.createElement(tag);
      if (tag === 'ol' && /^[aA]$/.test(ch.getAttribute('type') || '')) el.setAttribute('type', 'a');
      if (tag === 'ul' && ch.classList.contains('checklist')) el.className = 'checklist';
      if (tag === 'li' && ch.parentElement && ch.parentElement.classList && ch.parentElement.classList.contains('checklist')) el.setAttribute('data-checked', ch.getAttribute('data-checked') === 'true' ? 'true' : 'false');
      out.appendChild(el);
      if (tag !== 'br') walk(ch, el);
    });
  };
  const box = document.createElement('div');
  walk(tpl.content, box);
  // пустые элементы форматирования не нужны
  box.querySelectorAll('b,i,u').forEach((x) => { if (!x.textContent && !x.querySelector('br')) x.remove(); });
  let out = box.innerHTML;
  if (out === '<br>' || out === '<p><br></p>') out = '';
  return out;
}

/* ---------- Блоки: заголовки и списки реализованы вручную (execCommand в WebView вкладывает списки в абзацы) ---------- */
const RTE_BLOCK = /^(P|H1|H2|LI)$/;
function rteNormalize(ed) {
  // 1) Абзацы и DIV, внутри которых оказались блоки, разворачиваем
  ed.querySelectorAll('p, div').forEach((p) => {
    if (p.parentNode && p.querySelector(':scope > ul, :scope > ol, :scope > h1, :scope > h2, :scope > p, :scope > div')) {
      while (p.firstChild) p.parentNode.insertBefore(p.firstChild, p);
      p.remove();
    }
  });
  ed.querySelectorAll('div').forEach((d) => { const p = document.createElement('p'); Array.from(d.attributes).forEach((at) => { if (at.name === 'data-caret') p.setAttribute(at.name, at.value); }); while (d.firstChild) p.appendChild(d.firstChild); d.replaceWith(p); });
  // 2) Текст и строчные элементы верхнего уровня собираем в абзацы
  let run = null;
  Array.from(ed.childNodes).forEach((n) => {
    const inline = n.nodeType === 3 || (n.nodeType === 1 && !/^(P|H1|H2|UL|OL)$/.test(n.tagName));
    if (inline) {
      if (n.nodeType === 3 && !n.nodeValue.trim() && !run) { n.remove(); return; }
      if (!run) { run = document.createElement('p'); ed.insertBefore(run, n); }
      run.appendChild(n);
    } else run = null;
  });
}
function rteRange(ed) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  return ed.contains(r.commonAncestorContainer) || r.commonAncestorContainer === ed ? r : null;
}
function rteOffsets(ed) {
  const r = rteRange(ed);
  if (!r) return null;
  const pos = (node, off) => { const x = document.createRange(); x.setStart(ed, 0); x.setEnd(node, off); return x.toString().length; };
  return { start: pos(r.startContainer, r.startOffset), end: pos(r.endContainer, r.endOffset) };
}
function rteRestore(ed, o, keepMark) {
  const mark = ed.querySelector('[data-caret]');
  const sel = window.getSelection();
  const r = document.createRange();
  if (mark) {
    if (!keepMark) mark.removeAttribute('data-caret');
    if (!mark.textContent) { r.setStart(mark, 0); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); return; }
  }
  if (!o) return;
  const find = (target) => {
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let n, acc = 0, last = null;
    while ((n = w.nextNode())) { last = n; if (acc + n.nodeValue.length >= target) return [n, target - acc]; acc += n.nodeValue.length; }
    return last ? [last, last.nodeValue.length] : [ed, ed.childNodes.length];
  };
  const [sn, so] = find(o.start), [en, eo] = find(o.end);
  try { r.setStart(sn, so); r.setEnd(en, eo); sel.removeAllRanges(); sel.addRange(r); } catch (e) { /* */ }
}
function rteBlocks(ed) {
  const r = rteRange(ed);
  if (!r) return [];
  const all = Array.from(ed.querySelectorAll('p, h1, h2, li')).filter((el) => !el.querySelector('p, h1, h2, li'));
  let hit = all.filter((el) => r.intersectsNode(el));
  if (!hit.length) {
    let n = r.startContainer;
    while (n && n !== ed) { if (n.nodeType === 1 && RTE_BLOCK.test(n.tagName)) { hit = [n]; break; } n = n.parentNode; }
  }
  return hit;
}
function rteBlock(editor) { const b = rteBlocks(editor); return b[0] || null; }
function rteList(editor) { const b = rteBlock(editor); return b && b.tagName === 'LI' ? b.parentElement : null; }
function listKind(list) {
  if (!list) return '';
  if (list.tagName === 'UL') return list.classList.contains('checklist') ? 'check' : 'ul';
  return list.getAttribute('type') === 'a' ? 'ola' : 'ol';
}
function makeList(kind) {
  const l = document.createElement(kind === 'ol' || kind === 'ola' ? 'ol' : 'ul');
  if (kind === 'ola') l.setAttribute('type', 'a');
  if (kind === 'check') l.className = 'checklist';
  return l;
}
function moveKids(from, to) { while (from.firstChild) to.appendChild(from.firstChild); if (from.hasAttribute && from.hasAttribute('data-caret')) to.setAttribute('data-caret', '1'); return to; }
/* Блоки → абзацы/заголовки. Пункты списка вынимаются из списка (список делится). */
function rteSetBlocks(blocks, tag) {
  const out = [];
  blocks.forEach((b) => {
    if (b.tagName === 'LI') {
      const list = b.parentElement;
      const el = moveKids(b, document.createElement(tag));
      const after = Array.from(list.children).slice(Array.from(list.children).indexOf(b) + 1);
      if (after.length) { const tail = list.cloneNode(false); after.forEach((x) => tail.appendChild(x)); list.after(tail); }
      list.after(el);
      b.remove();
      if (!list.children.length) list.remove();
      out.push(el);
    } else if (b.tagName !== tag.toUpperCase()) {
      const el = moveKids(b, document.createElement(tag));
      b.replaceWith(el);
      out.push(el);
    } else out.push(b);
  });
  return out;
}
function rteMakeList(ed, blocks, kind) {
  const already = blocks.length && blocks.every((b) => b.tagName === 'LI' && listKind(b.parentElement) === kind);
  if (already) { rteSetBlocks(blocks, 'p'); return; }
  const paras = rteSetBlocks(blocks, 'p');
  let list = null;
  paras.forEach((p) => {
    if (!list || list.nextSibling !== p) { list = makeList(kind); p.before(list); }
    const li = moveKids(p, document.createElement('li'));
    if (kind === 'check') li.setAttribute('data-checked', 'false');
    list.appendChild(li);
    p.remove();
  });
  // Соседние списки того же вида склеиваем
  ed.querySelectorAll('ul, ol').forEach((l) => {
    const prev = l.previousElementSibling;
    if (prev && l.parentNode && (prev.tagName === l.tagName) && listKind(prev) === listKind(l)) { while (l.firstChild) prev.appendChild(l.firstChild); l.remove(); }
  });
}
function rteCommand(editor, cmd) {
  editor.focus();
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* */ }
  if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline') {
    document.execCommand(cmd, false, null);
  } else {
    const o = rteOffsets(editor);
    // курсор на пустой строке: по тексту его не найти — помечаем саму строку
    const cur = rteBlock(editor);
    if (cur && !cur.textContent) cur.setAttribute('data-caret', '1');
    rteNormalize(editor);
    rteRestore(editor, o, true);
    let blocks = rteBlocks(editor);
    // пустая строка: убираем «висящее» оформление
    blocks.forEach((b) => { if (!b.textContent) b.innerHTML = '<br>'; });
    if (!blocks.length) { // пустой редактор
      const p = document.createElement('p'); p.innerHTML = '<br>'; p.setAttribute('data-caret', '1'); editor.appendChild(p); blocks = [p];
    }
    if (cmd === 'h1' || cmd === 'h2') {
      const T = cmd.toUpperCase();
      rteSetBlocks(blocks, blocks.every((b) => b.tagName === T) ? 'p' : cmd);
    } else if (cmd === 'p') rteSetBlocks(blocks, 'p');
    else if (cmd === 'ol' || cmd === 'ola' || cmd === 'ul' || cmd === 'check') rteMakeList(editor, blocks, cmd);
    else if (cmd === 'clear') { document.execCommand('removeFormat', false, null); rteSetBlocks(rteBlocks(editor), 'p'); }
    editor.querySelectorAll('p:empty, h1:empty, h2:empty, li:empty').forEach((x) => { x.innerHTML = '<br>'; });
    rteRestore(editor, o);
  }
  rteFix(editor);
  rteState(editor);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

/* Нормализация после правок: новые пункты чек-листа — не отмечены, атрибуты чек-листа — только в чек-листе. */
function rteFix(editor) {
  editor.querySelectorAll('ul.checklist > li').forEach((li) => {
    if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false');
    if (li.getAttribute('data-checked') === 'true' && !li.textContent.trim()) li.setAttribute('data-checked', 'false');
  });
  editor.querySelectorAll('ul:not(.checklist) > li[data-checked], ol > li[data-checked]').forEach((li) => li.removeAttribute('data-checked'));
}

/* Подсветка активных кнопок панели */
function rteState(editor) {
  const bar = editor.parentElement && editor.parentElement.querySelector('.rte-bar');
  if (!bar) return;
  const block = rteBlock(editor);
  const list = rteList(editor);
  const k = listKind(list);
  const on = {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    h1: !!block && block.tagName === 'H1',
    h2: !!block && block.tagName === 'H2',
    check: k === 'check', ul: k === 'ul', ol: k === 'ol', ola: k === 'ola',
  };
  bar.querySelectorAll('[data-cmd]').forEach((b) => b.classList.toggle('on', !!on[b.dataset.cmd]));
}

function initEditors(root) {
  $$('[data-rte]', root).forEach((ed) => {
    if (ed.dataset.ready) return;
    ed.dataset.ready = '1';
    rteNormalize(ed);
    if (!ed.firstChild) ed.innerHTML = '<p><br></p>';
    rteFix(ed);
  });
}

/* События редактора (делегирование — работает и после перерисовки) */
document.addEventListener('mousedown', (ev) => {
  if (ev.target.closest('.rte-btn')) ev.preventDefault(); // не терять выделение в тексте
});
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.rte-btn');
  if (btn) {
    const ed = btn.closest('.rte-wrap').querySelector('[data-rte]');
    rteCommand(ed, btn.dataset.cmd);
    return;
  }
  // Отметка пункта чек-листа: нажатие на квадратик слева
  const li = ev.target.closest('.rte ul.checklist > li, .note-view ul.checklist > li');
  if (li) {
    const r = li.getBoundingClientRect();
    if (ev.clientX - r.left <= 30) {
      ev.preventDefault();
      li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
      const ed = li.closest('[data-rte]');
      if (ed) ed.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
});
document.addEventListener('input', (ev) => {
  const ed = ev.target.closest && ev.target.closest('[data-rte]');
  if (ed) rteFix(ed);
});
document.addEventListener('selectionchange', () => {
  const ed = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-rte]');
  if (ed) rteState(ed);
});
// Вставка — только текст (без чужих стилей, картинок и скриптов)
document.addEventListener('paste', (ev) => {
  const ed = ev.target.closest && ev.target.closest('[data-rte]');
  if (!ed) return;
  ev.preventDefault();
  const text = (ev.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
});
