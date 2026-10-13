/* Импорт выгрузок Битрикс24: CRM-контакты и задачи (CSV / Excel), календарь (iCal .ics).
 * Подключается после app.js и расширяет экран настроек, действия и обработчик нативных событий. */
'use strict';

(function () {
  /* ---------------- Чтение файла: байты → текст / таблица ---------------- */
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decodeText(bytes) {
    // BOM UTF-8 / UTF-16
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* не UTF-8 */ }
    try { return new TextDecoder('windows-1251').decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }

  function parseCSV(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const count = (ch) => firstLine.split(ch).length - 1;
    const delim = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  }

  // Выгрузка Битрикс24 «в Excel» — это HTML-таблица с расширением .xls
  function parseHTMLTable(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const table = Array.from(doc.querySelectorAll('table')).sort((a, b) => b.rows.length - a.rows.length)[0];
    if (!table) return [];
    return Array.from(table.rows).map((tr) => Array.from(tr.cells).map((td) => {
      td.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      return (td.textContent || '').replace(/\u00a0/g, ' ').trim();
    })).filter((r) => r.some((x) => x !== ''));
  }

  // Минимальный читатель .xlsx (zip + XML)
  async function inflateRaw(data) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('zip');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, off };
      p += 46 + nlen + elen + clen;
    }
    return async (name) => {
      const f = files[name];
      if (!f) return null;
      const ln = dv.getUint16(f.off + 26, true), le = dv.getUint16(f.off + 28, true);
      const data = bytes.subarray(f.off + 30 + ln + le, f.off + 30 + ln + le + f.csize);
      const raw = f.method === 0 ? data : await inflateRaw(data);
      return new TextDecoder('utf-8').decode(raw);
    };
  }
  async function parseXLSX(bytes) {
    const get = await unzip(bytes);
    const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const ssText = await get('xl/sharedStrings.xml');
    const shared = ssText ? Array.from(xml(ssText).getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t')).map((t) => t.textContent).join('')) : [];
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const first = xml(wb).getElementsByTagName('sheet')[0];
      const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const rel = Array.from(xml(rels).getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid);
      if (rel) sheetPath = 'xl/' + rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '');
    }
    const sheet = await get(sheetPath);
    if (!sheet) return [];
    const colIdx = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
    return Array.from(xml(sheet).getElementsByTagName('row')).map((r) => {
      const out = [];
      Array.from(r.getElementsByTagName('c')).forEach((c) => {
        const t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0];
        let val = '';
        if (t === 's') val = shared[Number(v ? v.textContent : 0)] || '';
        else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent).join('');
        else val = v ? v.textContent : '';
        const s = c.getAttribute('s');
        // числовые даты Excel (серийный номер дня)
        if (t !== 's' && t !== 'inlineStr' && /^\d{5}(\.\d+)?$/.test(val) && s) val = excelSerialToStr(Number(val));
        out[colIdx(c.getAttribute('r') || 'A1')] = val;
      });
      for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = '';
      return out;
    }).filter((r) => r.some((x) => String(x).trim() !== ''));
  }
  function excelSerialToStr(n) {
    const ms = Math.round((n - 25569) * 86400000);
    const d = new Date(ms);
    const p2 = (x) => String(x).padStart(2, '0');
    const time = d.getUTCHours() || d.getUTCMinutes() ? ` ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : '';
    return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}${time}`;
  }

  async function readTable(bytes, name) {
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (isZip) return { kind: 'table', rows: await parseXLSX(bytes) };
    const text = decodeText(bytes);
    if (/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) return { kind: 'ics', text };
    if (/<table/i.test(text)) return { kind: 'table', rows: parseHTMLTable(text) };
    if (/\.xls$/i.test(name || '') && /^\s*<\?xml/.test(text) && /Workbook/i.test(text.slice(0, 2000))) return { kind: 'table', rows: parseXMLSpreadsheet(text) };
    return { kind: 'table', rows: parseCSV(text) };
  }
  // Excel 2003 XML (иногда так сохраняют .xls)
  function parseXMLSpreadsheet(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    return Array.from(doc.getElementsByTagName('Row')).map((r) => Array.from(r.getElementsByTagName('Cell')).map((c) => (c.textContent || '').trim()))
      .filter((r) => r.some((x) => x !== ''));
  }

  /* ---------------- Сопоставление колонок ---------------- */
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  function findHeader(rows) {
    // строка заголовков — первая, где есть хотя бы 2 «узнаваемых» поля
    const known = /(^| )(id|название|имя|фамилия|ответственный|крайний срок|статус|телефон|e mail|email|компания|должность|постановщик|задача)( |$)/;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const hits = rows[i].filter((h) => known.test(norm(h))).length;
      if (hits >= 2) return i;
    }
    return 0;
  }
  function colFinder(headers) {
    const H = headers.map(norm);
    return (...patterns) => {
      for (const p of patterns) {
        const i = H.findIndex((h) => (p instanceof RegExp ? p.test(h) : h === p));
        if (i >= 0) return i;
      }
      return -1;
    };
  }
  function allCols(headers, re) { return headers.map(norm).map((h, i) => (re.test(h) ? i : -1)).filter((i) => i >= 0); }
  const cell = (row, i) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');

  // «13.10.2026 18:00:00», «2026-10-13 18:00», «13.10.2026»
  function parseRuDate(s) {
    s = String(s || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
    if (m) {
      let y = Number(m[3]); if (y < 100) y += 2000;
      return { date: `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`, time: m[4] != null ? `${String(m[4]).padStart(2, '0')}:${m[5]}` : '' };
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] != null ? `${m[4]}:${m[5]}` : '' };
    return null;
  }

  function detectKind(headers) {
    const H = headers.map(norm).join(' | ');
    if (/крайний срок|ответственный|постановщик|соисполнител/.test(H)) return 'tasks';
    if (/фамилия|телефон|e mail|email|должность|обращение/.test(H)) return 'contacts';
    return '';
  }

  /* ---------------- Контакты ---------------- */
  function mapContacts(rows) {
    const hi = findHeader(rows);
    const headers = rows[hi], data = rows.slice(hi + 1);
    const col = colFinder(headers);
    const cId = col('id');
    const cLast = col('фамилия'), cFirst = col('имя'), cMid = col('отчество');
    const cFull = col('контакт', 'фио', 'название', /^(полное )?имя контакта$/);
    const cCompany = col('компания', /^компания( название)?$/, /^название компании$/, 'company');
    const cRole = col('должность', 'position');
    const cComment = col('комментарий', 'комментарии');
    const cNext = col(/дата следующ/, /следующ.*(контакт|звонок|дело)/);
    const cType = col('тип контакта', 'тип');
    const phones = allCols(headers, /телефон|phone/);
    const mails = allCols(headers, /e mail|email|почта/);
    const items = data.map((r) => {
      const name = [cell(r, cLast), cell(r, cFirst), cell(r, cMid)].filter(Boolean).join(' ') || cell(r, cFull);
      if (!name) return null;
      const nx = parseRuDate(cell(r, cNext));
      return {
        bitrixId: cell(r, cId),
        name,
        company: cell(r, cCompany),
        role: cell(r, cRole),
        phone: Array.from(new Set(phones.flatMap((i) => cell(r, i).split(/[,;\n]+/)).map((x) => x.trim()).filter(Boolean))).join(', '),
        email: Array.from(new Set(mails.flatMap((i) => cell(r, i).split(/[,;\n]+/)).map((x) => x.trim()).filter(Boolean))).join(', '),
        comment: cell(r, cComment),
        nextContact: nx ? nx.date : '',
        tags: ['Битрикс24'].concat(cell(r, cType) ? [cell(r, cType)] : []),
      };
    }).filter(Boolean);
    return { items, headers, found: { 'Имя': cFirst >= 0 || cFull >= 0, 'Фамилия': cLast >= 0, 'Компания': cCompany >= 0, 'Телефоны': phones.length > 0, 'E-mail': mails.length > 0, 'ID': cId >= 0 } };
  }

  function applyContacts(items) {
    let added = 0, updated = 0;
    const now = new Date().toISOString();
    for (const it of items) {
      let c = (it.bitrixId && D.contacts.find((x) => x.bitrixId === it.bitrixId))
        || D.contacts.find((x) => norm(x.name) === norm(it.name) && norm(x.company) === norm(it.company));
      if (c) {
        // обновляем данные из Битрикса, локальные пометки (следующий контакт, заметки) не трогаем
        // полное имя не заменяем укороченным (например, без отчества)
        if (it.name && !norm(c.name).startsWith(norm(it.name))) c.name = it.name;
        ['company', 'role', 'phone', 'email'].forEach((k) => { if (it[k]) c[k] = it[k]; });
        if (it.comment && !c.comment) c.comment = it.comment;
        if (it.nextContact && !c.nextContact) c.nextContact = it.nextContact;
        if (it.bitrixId) c.bitrixId = it.bitrixId;
        c.tags = Array.from(new Set((c.tags || []).concat(it.tags)));
        c.updatedAt = now;
        updated++;
      } else {
        D.contacts.push(Object.assign({ id: uid('c'), remind: true, createdAt: now, updatedAt: now, source: 'bitrix24' }, it));
        added++;
      }
    }
    return { added, updated };
  }

  /* ---------------- Задачи ---------------- */
  function mapStatus(s) {
    const v = norm(s);
    // Статусы Битрикс24: Новая, Ждёт выполнения, Выполняется, Ждёт контроля, Завершена, Отложена
    if (/жд\S* выполнен|нов|pending|new/.test(v)) return 'todo';
    if (/выполняется|в работе|в процессе|progress/.test(v)) return 'doing';
    if (/контрол|отлож|ожида|deferred|supposedly/.test(v)) return 'wait';
    if (/заверш|выполнена|закрыт|done|completed/.test(v)) return 'done';
    return 'todo';
  }
  function mapTasks(rows) {
    const hi = findHeader(rows);
    const headers = rows[hi], data = rows.slice(hi + 1);
    const col = colFinder(headers);
    const cId = col('id');
    const cTitle = col('название', 'задача', 'название задачи', 'title');
    const cDesc = col('описание', 'description');
    const cResp = col('ответственный', 'исполнитель', 'responsible');
    const cDue = col('крайний срок', 'deadline', 'срок');
    const cStart = col(/^начать задачу с$/, /плановое начало|дата начала|начало/);
    const cEnd = col(/^закончить задачу$/, /плановое завершение|дата завершения план/);
    const cStatus = col('статус', 'status');
    const cParent = col(/базовая задача|родительская|id родительск|parent/);
    const cProject = col('проект', 'группа', 'группа проект', /рабочая группа/);
    const cCrm = col('crm', 'элементы crm', /^crm/);
    const cPrio = col('приоритет', 'важная задача', 'важность');
    const items = data.map((r) => {
      const title = cell(r, cTitle);
      if (!title) return null;
      const due = parseRuDate(cell(r, cDue)) || parseRuDate(cell(r, cEnd));
      const start = parseRuDate(cell(r, cStart));
      const project = cell(r, cProject);
      const desc = cell(r, cDesc);
      return {
        bitrixId: cell(r, cId),
        title,
        desc: [desc, project ? 'Проект: ' + project : ''].filter(Boolean).join('\n\n'),
        assignee: cell(r, cResp).split(/[,;\n]/)[0].trim(),
        due: due ? due.date : '',
        dueTime: due && due.time && due.time !== '00:00' ? due.time : '',
        start: start ? start.date : '',
        status: mapStatus(cell(r, cStatus)),
        important: /высок|да|yes|important/.test(norm(cell(r, cPrio))),
        bitrixParent: cell(r, cParent).replace(/[^\d]/g, ''),
        crmRaw: cell(r, cCrm),
      };
    }).filter(Boolean);
    return { items, headers, found: { 'Название': cTitle >= 0, 'Ответственный': cResp >= 0, 'Крайний срок': cDue >= 0, 'Статус': cStatus >= 0, 'ID': cId >= 0, 'Связь с CRM': cCrm >= 0 } };
  }

  function linkCrm(raw) {
    if (!raw) return [];
    const ids = [];
    raw.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).forEach((part) => {
      // «C_12», «Контакт: Иван Петров», «Иван Петров»
      const m = part.match(/^C_(\d+)$/i);
      let c = m ? D.contacts.find((x) => x.bitrixId === m[1]) : null;
      if (!c) {
        // имя может быть в любом порядке: «Мария Иванова» = «Иванова Мария»
        const words = norm(part.replace(/^(контакт|contact)\s*:?\s*/i, '')).split(' ').filter(Boolean);
        if (words.length) c = D.contacts.find((x) => { const w = norm(x.name).split(' '); return words.every((q) => w.includes(q)); });
      }
      if (c && !ids.includes(c.id)) ids.push(c.id);
    });
    return ids;
  }

  function applyTasks(items) {
    let added = 0, updated = 0;
    const now = new Date().toISOString();
    const byBx = {};
    for (const it of items) {
      if (it.assignee && !D.settings.people.includes(it.assignee)) D.settings.people.push(it.assignee);
      let t = (it.bitrixId && D.tasks.find((x) => x.bitrixId === it.bitrixId))
        || D.tasks.find((x) => !x.bitrixId && norm(x.title) === norm(it.title) && (x.due || '') === it.due);
      const crmIds = linkCrm(it.crmRaw);
      const data = { title: it.title, assignee: it.assignee || D.settings.me, due: it.due, dueTime: it.dueTime, start: it.start, status: it.status };
      if (t) {
        Object.assign(t, data, { updatedAt: now });
        if (it.desc) t.desc = it.desc;
        if (it.important) t.important = true;
        if (it.bitrixId) t.bitrixId = it.bitrixId;
        crmIds.forEach((id) => { if (!t.crmIds.includes(id)) t.crmIds.push(id); });
        updated++;
      } else {
        t = Object.assign({ id: uid('t'), desc: it.desc, important: it.important, crmIds, eventIds: [], deps: [], parentId: null, bitrixId: it.bitrixId, source: 'bitrix24', createdAt: now, updatedAt: now }, data);
        if (t.status === 'done') t.doneAt = now;
        D.tasks.push(t);
        added++;
      }
      if (it.bitrixId) byBx[it.bitrixId] = t;
      t._bxParent = it.bitrixParent;
    }
    // подзадачи: связываем с родителем по ID Битрикса
    D.tasks.forEach((t) => {
      if (t._bxParent) {
        const p = byBx[t._bxParent] || D.tasks.find((x) => x.bitrixId === t._bxParent);
        if (p && p.id !== t.id) t.parentId = p.id;
      }
      delete t._bxParent;
    });
    return { added, updated };
  }

  /* ---------------- Календарь (.ics) ---------------- */
  function parseICS(text) {
    const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const events = [];
    let cur = null;
    const unesc = (v) => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    for (const line of lines) {
      if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
      if (/^END:VEVENT/i.test(line)) { if (cur) events.push(cur); cur = null; continue; }
      if (!cur) continue;
      const i = line.indexOf(':');
      if (i < 0) continue;
      const left = line.slice(0, i), value = line.slice(i + 1);
      const [name, ...params] = left.split(';');
      const P = {};
      params.forEach((p) => { const [k, v] = p.split('='); P[(k || '').toUpperCase()] = v; });
      const key = name.toUpperCase();
      if (key === 'SUMMARY') cur.title = unesc(value);
      else if (key === 'DESCRIPTION') cur.desc = unesc(value);
      else if (key === 'LOCATION') cur.location = unesc(value);
      else if (key === 'UID') cur.uid = value.trim();
      else if (key === 'RRULE') cur.rrule = value;
      else if (key === 'DTSTART' || key === 'DTEND') cur[key] = { value: value.trim(), date: P.VALUE === 'DATE' || /^\d{8}$/.test(value.trim()) };
    }
    const toLocal = (o) => {
      if (!o) return null;
      const v = o.value;
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
      if (!m) return null;
      if (o.date || !m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '', allDay: true };
      // время в UTC (Z) переводим в локальное; с TZID/без зоны считаем локальным
      const d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
      return { date: ymd(d), time: hm(d), allDay: false };
    };
    return events.map((e) => {
      const s = toLocal(e.DTSTART);
      if (!s) return null;
      let en = toLocal(e.DTEND);
      if (s.allDay && en) { const d = parseDate(en.date); d.setDate(d.getDate() - 1); en = { date: ymd(d), time: '', allDay: true }; }
      if (en && en.date < s.date) en = null;
      return {
        uid: e.uid || '',
        title: e.title || 'Событие',
        desc: (e.desc || '') + (e.rrule ? (e.desc ? '\n\n' : '') + 'Повторяющееся событие (импортировано первое повторение)' : ''),
        location: e.location || '',
        allDay: s.allDay,
        start: s.date + 'T' + (s.allDay ? '00:00' : s.time),
        end: (en ? en.date : s.date) + 'T' + (s.allDay ? '23:59' : (en && en.time) || s.time),
      };
    }).filter(Boolean);
  }

  function applyEvents(items) {
    let added = 0, updated = 0;
    const now = new Date().toISOString();
    for (const it of items) {
      let e = (it.uid && D.events.find((x) => x.icsUid === it.uid)) || D.events.find((x) => x.title === it.title && x.start === it.start);
      const data = { title: it.title, start: it.start, end: it.end, allDay: it.allDay, location: it.location };
      if (e) {
        Object.assign(e, data, { updatedAt: now });
        if (it.desc && !e.desc) e.desc = it.desc;
        if (it.uid) e.icsUid = it.uid;
        updated++;
      } else {
        D.events.push(Object.assign({ id: uid('e'), desc: it.desc, important: false, remind: [D.settings.defaultRemind], crmIds: [], icsUid: it.uid, source: 'bitrix24', createdAt: now, updatedAt: now }, data));
        added++;
      }
    }
    return { added, updated };
  }

  /* ---------------- Интерфейс ---------------- */
  const KIND_NAMES = { contacts: 'CRM-контакты', tasks: 'Задачи', events: 'События календаря' };
  let pending = null;

  async function handleFile(kind, name, bytes) {
    let parsed;
    try { parsed = await readTable(bytes, name); } catch (e) { toast('Не удалось прочитать файл: ' + (e.message || e)); return; }
    let result;
    if (parsed.kind === 'ics') {
      result = { kind: 'events', items: parseICS(parsed.text), found: {} };
    } else {
      const rows = parsed.rows;
      if (!rows.length) { toast('В файле не найдено строк'); return; }
      const hdr = rows[findHeader(rows)] || [];
      const detected = detectKind(hdr);
      const k = detected || (kind === 'events' ? '' : kind) || 'contacts';
      if (kind && detected && kind !== detected) toast('Похоже, это файл с данными «' + KIND_NAMES[detected] + '» — импортирую как их');
      const m = k === 'tasks' ? mapTasks(rows) : mapContacts(rows);
      result = { kind: k, items: m.items, found: m.found, headers: m.headers };
    }
    if (!result.items.length) { toast('Не удалось найти записи для импорта. Проверьте, что это выгрузка из Битрикс24.'); return; }
    pending = result;
    showPreview(name);
  }

  function showPreview(name) {
    const r = pending;
    const sample = r.items.slice(0, 6).map((it) => {
      if (r.kind === 'contacts') return `<div class="item"><div class="grow"><div class="t">${esc(it.name)}</div><div class="s">${esc([it.company, it.phone, it.email].filter(Boolean).join(' · '))}</div></div></div>`;
      if (r.kind === 'tasks') return `<div class="item"><div class="grow"><div class="t">${esc(it.title)}</div><div class="s">${esc([it.assignee, it.due ? 'до ' + fmtShort(it.due) : '', statusName(it.status), it.bitrixParent ? 'подзадача' : ''].filter(Boolean).join(' · '))}</div></div></div>`;
      return `<div class="item"><div class="grow"><div class="t">${esc(it.title)}</div><div class="s">${esc(fmtShort(it.start) + (it.allDay ? ', весь день' : ' ' + it.start.slice(11, 16)) + (it.location ? ' · ' + it.location : ''))}</div></div></div>`;
    }).join('');
    const found = Object.entries(r.found || {}).map(([k, v]) => `<span class="chip ${v ? 'green' : ''}">${v ? '✓' : '—'} ${esc(k)}</span>`).join(' ');
    modal(`<h3>Импорт: ${KIND_NAMES[r.kind]}</h3>
      <div class="sub">${esc(name || '')} — найдено записей: <b>${r.items.length}</b></div>
      ${found ? `<div class="picker mt">${found}</div>` : ''}
      <div class="list mt">${sample}</div>
      ${r.items.length > 6 ? `<div class="sub mt">…и ещё ${r.items.length - 6}</div>` : ''}
      <div class="sub mt">Записи, которые уже есть в приложении (по ID Битрикс24 или названию), будут обновлены, а не продублированы. Ваши пометки — будильники, заметки, связи — сохранятся. Перед импортом создаётся автокопия.</div>
      <div class="form-actions mt"><button class="btn primary" data-a="bx-apply">Импортировать</button><button class="btn" data-a="modal-close">Отмена</button></div>`);
  }

  function applyPending() {
    const r = pending;
    if (!r) return;
    if (N) try { save(true); N.backupNow(); } catch (e) { /* */ }
    const res = r.kind === 'contacts' ? applyContacts(r.items) : r.kind === 'tasks' ? applyTasks(r.items) : applyEvents(r.items);
    D.settings.lastBitrixImport = Object.assign({}, D.settings.lastBitrixImport || {}, { [r.kind]: new Date().toISOString() });
    pending = null;
    save(true);
    modal(null);
    render();
    toast(`${KIND_NAMES[r.kind]}: добавлено ${res.added}, обновлено ${res.updated}`);
  }

  function pickFile(kind) {
    if (N && N.importRaw) { N.importRaw(kind); return; }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,.xls,.xlsx,.ics,.txt,text/csv,text/calendar';
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      handleFile(kind, f.name, new Uint8Array(await f.arrayBuffer()));
    };
    inp.click();
  }
  window.__bxImport = { handleFile, parseCSV, parseICS, mapTasks, mapContacts, readTable };

  // Действия
  ACTIONS['bx-import'] = (el) => pickFile(el.dataset.id);
  ACTIONS['bx-apply'] = () => applyPending();
  ACTIONS['bx-help'] = () => modal(`<h3>Как выгрузить данные из Битрикс24</h3>
    <div class="desc small">
<b>CRM-контакты.</b> CRM → Контакты → кнопка ⚙ (шестерёнка) → «Экспорт в CSV» или «Экспорт в Excel». Можно предварительно отфильтровать список.

<b>Задачи.</b> Задачи и проекты → нужный список (Мои / Все) → кнопка ⚙ → «Экспорт в Excel». Подзадачи свяжутся с основной задачей, если в выгрузке есть колонка «Базовая задача».

<b>Календарь.</b> Календарь → ⚙ «Настройки» → «Экспорт календаря (iCal)», скачайте .ics-файл. Другой вариант — подключить календарь Битрикс24 к календарю телефона (CalDAV): тогда события появятся в приложении автоматически через синхронизацию с календарём телефона.

Готовые файлы перешлите себе на телефон (например, в «Избранное» мессенджера) и выберите их здесь.

Импортировать лучше в порядке: контакты → задачи → календарь, тогда задачи сразу свяжутся с CRM-карточками.
    </div>
    <div class="form-actions mt"><button class="btn" data-a="modal-close">Понятно</button></div>`);

  // Нативное событие с выбранным файлом
  const prevNative = window.__native;
  window.__native = function (type, payload) {
    if (type === 'importedRaw') {
      if (!payload) { toast('Файл не выбран'); return; }
      try {
        const o = JSON.parse(payload);
        handleFile(o.kind, o.name, b64ToBytes(o.b64));
      } catch (e) { toast('Не удалось открыть файл'); }
      return;
    }
    return prevNative(type, payload);
  };

  // Раздел в настройках
  const prevSettings = SCREENS.settings;
  SCREENS.settings = function () {
    const html = prevSettings();
    const last = D.settings.lastBitrixImport || {};
    const when = (k) => last[k] ? `<span class="sub">последний: ${esc(new Date(last[k]).toLocaleDateString('ru-RU'))}</span>` : '';
    const block = `<div class="section-title">Импорт из Битрикс24<button class="btn sm right" data-a="bx-help">Как выгрузить?</button></div>
    <div class="card">
      <div class="perm"><div class="grow"><div>CRM-контакты</div><div class="sub">CSV или Excel из раздела CRM → Контакты</div>${when('contacts')}</div><button class="btn sm" data-a="bx-import" data-id="contacts">Выбрать файл</button></div>
      <div class="perm"><div class="grow"><div>Задачи</div><div class="sub">Excel из раздела «Задачи и проекты»</div>${when('tasks')}</div><button class="btn sm" data-a="bx-import" data-id="tasks">Выбрать файл</button></div>
      <div class="perm"><div class="grow"><div>Календарь</div><div class="sub">Файл .ics (iCal) из календаря Битрикс24</div>${when('events')}</div><button class="btn sm" data-a="bx-import" data-id="events">Выбрать файл</button></div>
      <div class="sub mt">Повторный импорт обновляет записи, а не создаёт дубли.</div>
    </div>`;
    const anchor = '<div class="section-title">Календарь телефона</div>';
    return html.includes(anchor) ? html.replace(anchor, block + anchor) : html + block;
  };
  if (ui.tab === 'settings') render();
})();
