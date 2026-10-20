/* «Доступ с компьютера» — часть для телефона: включение веб-сервера, адрес и PIN,
 * обновление данных, когда их изменили в браузере на компьютере. */
'use strict';

(function () {
  if (!N || !N.webStatus) return; // в браузере на компьютере этот блок не нужен

  function status() {
    try { return JSON.parse(N.webStatus() || '{}'); } catch (e) { return {}; }
  }

  // Изменения пришли с компьютера: перечитываем данные и пересобираем напоминания
  function reloadFromDisk() {
    clearTimeout(saveTimer); saveTimer = null;
    load();
    render();
    syncAlarms();
  }

  const prevNative = window.__native;
  window.__native = function (type, payload) {
    if (type === 'remoteChanged') {
      reloadFromDisk();
      toast('Данные обновлены с компьютера');
      return;
    }
    if (type === 'webStatus') {
      if (payload === 'locked') toast('Слишком много неверных PIN — выключите и включите доступ заново');
      if (payload === 'error') toast('Не удалось включить доступ');
      if (ui.tab === 'settings') render();
      return;
    }
    return prevNative(type, payload);
  };

  function startNow() { modal(null); N.webStart(); toast('Включаю доступ…'); setTimeout(() => { if (ui.tab === 'settings') render(); }, 800); }
  function batteryOk() { try { return !!JSON.parse(N.permissions() || '{}').battery; } catch (e) { return true; } }
  ACTIONS['web-start'] = () => {
    if (batteryOk()) { startNow(); return; }
    // Без снятия ограничений батареи система «усыпляет» приложение и Wi-Fi при выключенном экране
    modal(`<h3>Чтобы доступ работал при заблокированном экране</h3>
      <div class="sub">Разрешите приложению работать без ограничений батареи — иначе телефон отключит связь с компьютером, как только погаснет экран.</div>
      <div class="sub mt">На Huawei также: Настройки → Приложения → Запуск приложений → «管理会计» → «Управлять вручную» → включить все три переключателя.</div>
      <div class="form-actions mt"><button class="btn primary" data-a="web-battery">Разрешить</button><button class="btn" data-a="web-start-anyway">Включить без этого</button></div>`);
  };
  ACTIONS['web-battery'] = () => { N.requestPermission('battery'); startNow(); };
  ACTIONS['web-start-anyway'] = () => startNow();
  ACTIONS['web-app-settings'] = () => N.requestPermission('app');
  ACTIONS['web-stop'] = () => { N.webStop(); setTimeout(() => { if (ui.tab === 'settings') render(); }, 500); };
  ACTIONS['web-battery-only'] = () => N.requestPermission('battery');
  ACTIONS['web-copy'] = (el) => { N.copyText(el.dataset.id); toast('Адрес скопирован'); };

  function block() {
    const s = status();
    if (!s.running) {
      return `<div class="section-title">Доступ с компьютера</div>
      <div class="card">
        <div class="row"><div class="grow">
          <div>Открыть приложение в браузере на компьютере</div>
          <div class="sub">Телефон и компьютер должны быть в одной Wi-Fi-сети. Данные не уходят в интернет — компьютер подключается напрямую к телефону.</div>
          ${s.error ? `<div class="sub" style="color:var(--danger)">Ошибка: ${esc(s.error)}</div>` : ''}
        </div><button class="btn primary" data-a="web-start">Включить</button></div>
      </div>`;
    }
    const urls = s.urls || [];
    return `<div class="section-title">Доступ с компьютера<span class="chip green right">включён</span></div>
    <div class="card">
      ${urls.length ? `<div class="sub">Откройте в браузере на компьютере:</div>
        ${urls.map((u, i) => `<div class="row" style="margin:6px 0"><b style="font-size:${i ? 15 : 20}px;letter-spacing:.01em;user-select:all" class="grow">${esc(u)}</b><button class="btn sm" data-a="web-copy" data-id="${esc(u)}">${icon('copy')}</button></div>`).join('')}`
        : `<div class="sub" style="color:var(--danger)">Телефон не подключён к Wi-Fi. Подключитесь к той же сети, что и компьютер.</div>`}
      <div class="sub mt">PIN-код для входа:</div>
      <div style="font-size:36px;font-weight:750;letter-spacing:.3em;font-variant-numeric:tabular-nums">${esc(s.pin || '')}</div>
      ${s.battery === false ? `<div class="perm mt" style="border-color:var(--warn)"><div class="grow"><div style="color:var(--warn)"><b>При заблокированном экране связь может прерваться</b></div><div class="sub">Разрешите работу без ограничений батареи. На Huawei также: Запуск приложений → «管理会计» → «Управлять вручную».</div></div><button class="btn sm primary" data-a="web-battery-only">Разрешить</button></div>`
        : `<div class="sub mt" style="color:var(--ok)">✓ Работает и при заблокированном экране — телефон можно положить экраном вниз.</div>`}
      <div class="sub mt">Изменения с компьютера сразу сохраняются на телефоне. Доступ выключится сам через 30 минут, если браузер на компьютере закрыт. Пока он включён, в шторке уведомлений висит значок.</div>
      <div class="form-actions mt"><button class="btn danger" data-a="web-stop">Выключить доступ</button></div>
    </div>`;
  }

  const prevSettings = SCREENS.settings;
  SCREENS.settings = function () {
    const html = prevSettings();
    const anchor = '<div class="section-title">Напоминания</div>';
    return html.includes(anchor) ? html.replace(anchor, block() + anchor) : html + block();
  };
  if (ui.tab === 'settings') render();
})();
