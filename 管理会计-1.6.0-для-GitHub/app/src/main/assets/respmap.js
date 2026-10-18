/* 管理会计 — «Карта ответственных»: счётчики и операции со структурой карты.
 * Без зависимостей от интерфейса — проверяется node в CI (tests/respmap.test.js).
 * Карта хранит только состав и структуру; счётчики всегда считаются заново из задач.
 */
'use strict';

var RespMap = (function () {
  function dayNum(s) { var p = String(s).slice(0, 10).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000; }
  function isDone(t) { return t.status === 'done'; }
  function isOverdue(t, today) { return !isDone(t) && !!t.due && dayNum(t.due) < dayNum(today); }
  // срок сегодня или завтра (и не просрочено)
  function isSoon(t, today) { if (isDone(t) || !t.due) return false; var x = dayNum(t.due) - dayNum(today); return x === 0 || x === 1; }

  function count(tasks, today) {
    var r = { open: 0, overdue: 0, soon: 0 };
    tasks.forEach(function (t) {
      if (isDone(t)) return;
      r.open++;
      if (isOverdue(t, today)) r.overdue++;
      else if (isSoon(t, today)) r.soon++;
    });
    return r;
  }

  /* Задачи человека: где он исполнитель + открытые задачи проектов, где он ответственный (без двойного счёта). */
  function personTasks(d, name) {
    var own = {};
    (d.projects || []).forEach(function (p) { if (p.ownerId === name) own[p.id] = true; });
    var seen = {}, out = [], inOwn = 0;
    (d.tasks || []).forEach(function (t) {
      var mine = t.assignee === name;
      var ownProject = !!(t.projectId && own[t.projectId]);
      if (!mine && !(ownProject && !isDone(t))) return;
      if (seen[t.id]) return;
      seen[t.id] = true;
      out.push(t);
      if (ownProject && !isDone(t)) inOwn++;
    });
    return { tasks: out, inOwn: inOwn };
  }

  function projectTasks(d, pid) { return (d.tasks || []).filter(function (t) { return t.projectId === pid; }); }

  function childrenOf(map, id) { return (map.nodes || []).filter(function (n) { return (n.parentId || null) === (id || null); }); }

  /* Счётчики всех узлов карты: { [nodeId]: { open, overdue, soon, inOwn?, level } } */
  function mapStats(d, map, today) {
    var memo = {};
    function calc(n, depth) {
      if (memo[n.id]) return memo[n.id];
      var r;
      if (n.type === 'project') {
        r = count(projectTasks(d, n.ref), today);
      } else if (n.type === 'person') {
        var pt = personTasks(d, n.ref);
        r = count(pt.tasks, today);
        r.inOwn = pt.inOwn;
      } else {
        r = { open: 0, overdue: 0, soon: 0 };
        if (depth < 200) childrenOf(map, n.id).forEach(function (c) { var s = calc(c, depth + 1); r.open += s.open; r.overdue += s.overdue; r.soon += s.soon; });
      }
      r.level = level(r);
      memo[n.id] = r;
      return r;
    }
    (map.nodes || []).forEach(function (n) { calc(n, 0); });
    return memo;
  }

  /* Цвет: красный — есть просрочка, жёлтый — срок сегодня/завтра, иначе серый. */
  function level(s) { return s.overdue > 0 ? 'red' : s.soon > 0 ? 'yellow' : 'gray'; }
  var LEVEL_RANK = { red: 2, yellow: 1, gray: 0 };

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function addNode(map, type, ref, parentId) {
    var n = { id: uid('n'), type: type, ref: ref == null ? null : String(ref), parentId: parentId || null, collapsed: false };
    map.nodes.push(n);
    return n;
  }

  /* «Собрать автоматически»: узел на каждого человека с проектами (ownerId), под ним — его проекты.
     Уже стоящие на карте люди и проекты не дублируются. Возвращает число добавленных узлов. */
  function autoBuild(d, map) {
    var added = 0;
    var people = (d.settings && d.settings.people) || [];
    people.forEach(function (name) {
      var projects = (d.projects || []).filter(function (p) { return p.ownerId === name && !p.archived; });
      if (!projects.length) return;
      var pn = map.nodes.find(function (n) { return n.type === 'person' && n.ref === name; });
      if (!pn) { pn = addNode(map, 'person', name, null); added++; }
      projects.forEach(function (p) {
        if (map.nodes.some(function (n) { return n.type === 'project' && n.ref === p.id; })) return;
        addNode(map, 'project', p.id, pn.id);
        added++;
      });
    });
    return added;
  }

  function isDescendant(map, id, ancestorId) {
    var byId = {};
    map.nodes.forEach(function (n) { byId[n.id] = n; });
    var cur = byId[id], guard = 0;
    while (cur && cur.parentId && guard++ < 1000) { if (cur.parentId === ancestorId) return true; cur = byId[cur.parentId]; }
    return false;
  }

  /* Переместить узел под другого родителя (null — в корень). Нельзя переместить внутрь собственной ветки. */
  function moveNode(map, id, parentId) {
    if (parentId && (parentId === id || isDescendant(map, parentId, id))) return false;
    var n = map.nodes.find(function (x) { return x.id === id; });
    if (!n) return false;
    n.parentId = parentId || null;
    return true;
  }

  /* Убрать узел с карты; его дочерние узлы переходят к его родителю. */
  function removeNode(map, id) {
    var n = map.nodes.find(function (x) { return x.id === id; });
    if (!n) return false;
    map.nodes.forEach(function (c) { if (c.parentId === id) c.parentId = n.parentId || null; });
    map.nodes = map.nodes.filter(function (x) { return x.id !== id; });
    return true;
  }

  /* Сортировка: сначала узлы с просрочками, потом со сроками, потом по числу открытых задач. */
  function sortByTrouble(nodes, stats, nameOf) {
    return nodes.slice().sort(function (a, b) {
      var sa = stats[a.id] || {}, sb = stats[b.id] || {};
      return (LEVEL_RANK[sb.level] || 0) - (LEVEL_RANK[sa.level] || 0)
        || (sb.overdue || 0) - (sa.overdue || 0)
        || (sb.open || 0) - (sa.open || 0)
        || String(nameOf(a)).localeCompare(String(nameOf(b)), 'ru');
    });
  }

  return {
    isOverdue: isOverdue, isSoon: isSoon, count: count, personTasks: personTasks, projectTasks: projectTasks,
    childrenOf: childrenOf, mapStats: mapStats, level: level, LEVEL_RANK: LEVEL_RANK,
    addNode: addNode, autoBuild: autoBuild, moveNode: moveNode, removeNode: removeNode, isDescendant: isDescendant, sortByTrouble: sortByTrouble,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RespMap;
