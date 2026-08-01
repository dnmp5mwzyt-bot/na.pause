/* На паузе — панель управления меню */
(function () {
  'use strict';

  var TOKEN_KEY = 'napauze.token';
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    menu: null,      // редактируемая копия
    saved: '',       // слепок сохранённого состояния для проверки правок
    active: 0,       // индекс открытого раздела
    busy: false
  };

  /* ─────────── сеть ─────────── */

  var token = function () { return sessionStorage.getItem(TOKEN_KEY) || ''; };

  function api(path, options) {
    var opts = options || {};
    var headers = { Accept: 'application/json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (opts.auth) headers.Authorization = 'Bearer ' + token();

    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      cache: 'no-store',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ('Ошибка ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  /* ─────────── экраны ─────────── */

  function showGate(message) {
    $('app').hidden = true;
    $('gate').hidden = false;
    var box = $('login-error');
    box.hidden = !message;
    box.textContent = message || '';
    $('password').focus();
  }

  function showApp() {
    $('gate').hidden = true;
    $('app').hidden = false;
  }

  var flashTimer = null;
  function flash(text, kind) {
    var el = $('flash');
    el.hidden = false;
    el.textContent = text;
    el.className = 'msg' + (kind ? ' msg--' + kind : '');
    clearTimeout(flashTimer);
    if (kind !== 'err') flashTimer = setTimeout(function () { el.hidden = true; }, 4000);
  }

  /* ─────────── состояние правок ─────────── */

  function snapshot() { return JSON.stringify(state.menu); }

  /* до загрузки меню правок быть не может — иначе экран входа
     начнёт спрашивать «уйти со страницы?» */
  function dirty() { return Boolean(state.menu) && snapshot() !== state.saved; }

  function syncState() {
    var d = dirty();
    $('save').disabled = state.busy || !d;
    var el = $('state');
    el.textContent = state.busy ? 'сохраняем…' : (d ? 'есть несохранённые правки' : 'всё сохранено');
    el.classList.toggle('state--dirty', d && !state.busy);
  }

  function touch() { syncState(); }

  /* ─────────── отрисовка ─────────── */

  function cat() { return state.menu.categories[state.active]; }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function chip(cls, label, title, onClick) {
    var b = el('button', 'chip ' + cls, label);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }

  function renderCats() {
    var box = $('cats');
    box.textContent = '';

    state.menu.categories.forEach(function (c, i) {
      var b = el('button', 'cat' + (i === state.active ? ' is-on' : ''));
      b.type = 'button';
      b.appendChild(el('span', null, c.title));
      b.appendChild(el('span', 'cat__n', String(c.items.length)));
      b.addEventListener('click', function () { state.active = i; render(); });

      var mv = el('span', 'cat__mv');
      mv.textContent = '‹';
      mv.title = 'Сдвинуть влево';
      mv.addEventListener('click', function (e) {
        e.stopPropagation();
        if (i === 0) return;
        var arr = state.menu.categories;
        arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
        state.active = i - 1;
        render(); touch();
      });
      if (i > 0) b.appendChild(mv);

      box.appendChild(b);
    });
  }

  function renderRows() {
    var box = $('rows');
    box.textContent = '';
    var c = cat();

    $('cat-caption').textContent = 'Позиции · ' + c.title;
    $('del-cat').disabled = state.menu.categories.length < 2;

    if (!c.items.length) {
      box.appendChild(el('p', 'empty', 'В разделе пока нет позиций'));
      return;
    }

    c.items.forEach(function (item, i) {
      var row = el('div', 'row' + (item.hidden ? ' is-hidden' : ''));

      var name = el('input', 'row__name');
      name.type = 'text';
      name.value = item.name;
      name.maxLength = 80;
      name.placeholder = 'Название';
      name.addEventListener('input', function () { item.name = name.value; touch(); });
      row.appendChild(name);

      var note = el('input', 'row__note');
      note.type = 'text';
      note.value = item.note;
      note.maxLength = 160;
      note.placeholder = 'Объём, состав — необязательно';
      note.addEventListener('input', function () { item.note = note.value; touch(); });
      row.appendChild(note);

      var price = el('div', 'row__price');
      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '100000';
      input.step = '10';
      input.value = String(item.price);
      input.setAttribute('aria-label', 'Цена');
      input.addEventListener('input', function () { item.price = input.value === '' ? '' : Number(input.value); touch(); });
      price.appendChild(input);
      price.appendChild(el('span', 'row__cur', '₽'));
      row.appendChild(price);

      var flags = el('div', 'row__flags');
      var from = chip('chip--from' + (item.from ? ' is-on' : ''), 'от', 'Цена «от»', function () {
        item.from = !item.from;
        from.classList.toggle('is-on', item.from);
        touch();
      });
      var star = chip('chip--star' + (item.star ? ' is-on' : ''), '★', 'Выделить как хит', function () {
        item.star = !item.star;
        star.classList.toggle('is-on', item.star);
        touch();
      });
      var eye = chip('chip--eye' + (item.hidden ? ' is-on' : ''), item.hidden ? '🚫' : '👁', 'Скрыть с сайта', function () {
        item.hidden = !item.hidden;
        eye.classList.toggle('is-on', item.hidden);
        eye.textContent = item.hidden ? '🚫' : '👁';
        row.classList.toggle('is-hidden', item.hidden);
        touch();
      });
      flags.appendChild(from); flags.appendChild(star); flags.appendChild(eye);
      row.appendChild(flags);

      var tools = el('div', 'row__tools');
      var up = chip('chip--mv', '↑', 'Выше', function () {
        c.items.splice(i - 1, 0, c.items.splice(i, 1)[0]); render(); touch();
      });
      up.disabled = i === 0;
      var down = chip('chip--mv', '↓', 'Ниже', function () {
        c.items.splice(i + 1, 0, c.items.splice(i, 1)[0]); render(); touch();
      });
      down.disabled = i === c.items.length - 1;
      var del = chip('chip--del', '✕', 'Удалить позицию', function () {
        if (!confirm('Удалить «' + (item.name || 'без названия') + '»?')) return;
        c.items.splice(i, 1); render(); touch();
      });
      tools.appendChild(up); tools.appendChild(down); tools.appendChild(del);
      row.appendChild(tools);

      box.appendChild(row);
    });
  }

  function render() {
    renderCats();
    renderRows();
    syncState();
  }

  /* ─────────── загрузка и сохранение ─────────── */

  function load() {
    return api('/api/menu').then(function (data) {
      state.menu = data.menu;
      state.menu.categories.forEach(function (c) {
        c.items.forEach(function (i) {
          i.note = i.note || '';
          i.from = Boolean(i.from);
          i.star = Boolean(i.star);
          i.hidden = Boolean(i.hidden);
        });
      });
      state.saved = snapshot();
      state.active = Math.min(state.active, state.menu.categories.length - 1);

      $('note').value = state.menu.note || '';

      var warn = $('setup-warning');
      if (!data.storeConfigured) {
        warn.hidden = false;
        warn.textContent = 'Хранилище не подключено — сохранять пока некуда. ' +
          'В панели Vercel создайте KV-хранилище и привяжите к проекту (переменные KV_REST_API_URL и KV_REST_API_TOKEN).';
      } else {
        warn.hidden = true;
      }

      $('meta').textContent = 'Источник: ' + (data.source === 'store' ? 'хранилище' : 'встроенное меню по умолчанию') +
        (state.menu.updatedAt ? ' · изменено ' + new Date(state.menu.updatedAt).toLocaleString('ru-RU') : '');

      render();
    });
  }

  function save() {
    if (state.busy || !dirty()) return;

    var bad = null;
    state.menu.categories.forEach(function (c) {
      c.items.forEach(function (i) {
        if (!String(i.name).trim()) bad = bad || 'В разделе «' + c.title + '» есть позиция без названия';
        if (i.price === '' || !Number.isFinite(Number(i.price))) bad = bad || 'У позиции «' + i.name + '» не указана цена';
      });
    });
    if (bad) { flash(bad, 'err'); return; }

    state.busy = true;
    syncState();

    api('/api/menu', { method: 'PUT', auth: true, body: { menu: state.menu } })
      .then(function (data) {
        state.menu = data.menu;
        state.menu.categories.forEach(function (c) {
          c.items.forEach(function (i) { i.note = i.note || ''; });
        });
        state.saved = snapshot();
        state.active = Math.min(state.active, state.menu.categories.length - 1);
        $('note').value = state.menu.note || '';
        $('meta').textContent = 'Источник: хранилище · изменено ' + new Date(state.menu.updatedAt).toLocaleString('ru-RU');
        flash('Меню сохранено — обновите сайт, чтобы увидеть изменения', 'ok');
        render();
      })
      .catch(function (err) {
        if (err.status === 401) {
          sessionStorage.removeItem(TOKEN_KEY);
          showGate('Сессия истекла — войдите заново');
          return;
        }
        flash(err.message, 'err');
      })
      .then(function () { state.busy = false; syncState(); });
  }

  /* ─────────── события ─────────── */

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('login-btn');
    btn.disabled = true;
    btn.textContent = 'Проверяем…';

    api('/api/login', { method: 'POST', body: { password: $('password').value } })
      .then(function (data) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        $('password').value = '';
        showApp();
        return load();
      })
      .catch(function (err) { showGate(err.message); })
      .then(function () { btn.disabled = false; btn.textContent = 'Войти'; });
  });

  $('logout').addEventListener('click', function () {
    if (dirty() && !confirm('Есть несохранённые правки. Выйти без сохранения?')) return;
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  });

  $('save').addEventListener('click', save);

  $('add-cat').addEventListener('click', function () {
    var title = (prompt('Название раздела') || '').trim();
    if (!title) return;
    state.menu.categories.push({ id: 'new', title: title.slice(0, 40), items: [] });
    state.active = state.menu.categories.length - 1;
    render(); touch();
  });

  $('rename-cat').addEventListener('click', function () {
    var title = (prompt('Новое название раздела', cat().title) || '').trim();
    if (!title) return;
    cat().title = title.slice(0, 40);
    render(); touch();
  });

  $('del-cat').addEventListener('click', function () {
    if (state.menu.categories.length < 2) return;
    if (!confirm('Удалить раздел «' + cat().title + '» вместе с позициями?')) return;
    state.menu.categories.splice(state.active, 1);
    state.active = Math.max(0, state.active - 1);
    render(); touch();
  });

  $('add-item').addEventListener('click', function () {
    cat().items.push({ name: '', note: '', price: 0, from: false, star: false, hidden: false });
    render(); touch();
    var inputs = $('rows').querySelectorAll('.row__name');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  $('note').addEventListener('input', function () {
    state.menu.note = $('note').value;
    touch();
  });

  $('reload').addEventListener('click', function () {
    if (dirty() && !confirm('Отменить все несохранённые правки?')) return;
    load().catch(function (err) { flash(err.message, 'err'); });
  });

  $('download').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state.menu, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'menu.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ─────────── старт ─────────── */

  if (token()) {
    showApp();
    load().catch(function (err) {
      if (err.status === 401) { sessionStorage.removeItem(TOKEN_KEY); showGate(''); }
      else { flash(err.message, 'err'); }
    });
  } else {
    showGate('');
  }
})();
