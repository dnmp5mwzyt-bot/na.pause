/* На паузе — интерактив */
(function () {
  'use strict';

  /* ── появление блоков при скролле ── */
  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  }
  var observe = function (root) {
    var items = (root || document).querySelectorAll('.reveal');
    if (io) items.forEach(function (el) { io.observe(el); });
    else items.forEach(function (el) { el.classList.add('is-in'); });
  };
  observe(document);

  /* ── тень у хедера при скролле ── */
  var hdr = document.getElementById('hdr');
  var onScroll = function () { hdr.classList.toggle('is-stuck', window.scrollY > 8); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── мобильное меню ── */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  var setNav = function (open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', function () {
    setNav(burger.getAttribute('aria-expanded') !== 'true');
  });
  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') setNav(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setNav(false);
  });
  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target) && !burger.contains(e.target)) setNav(false);
  });

  /* ── табы меню ── */
  var bindTabs = function () {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    var show = function (tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', String(on));
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (!panel) return;
        panel.hidden = !on;
        panel.classList.toggle('is-on', on);
      });
    };
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { show(tab); });
      tab.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var next = tabs[(i + d + tabs.length) % tabs.length];
        next.focus();
        show(next);
      });
    });
  };
  bindTabs();

  /* ── меню из /api/menu ──
     Статическая разметка в index.html остаётся запасным вариантом:
     если запрос не удался, на странице просто ничего не меняется. */
  var live = document.getElementById('menu-live');

  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var priceText = function (item) {
    var value = Number(item.price).toLocaleString('ru-RU');
    return (item.from ? 'от ' : '') + value + ' ₽';
  };

  var render = function (menu) {
    var cats = (menu.categories || []).filter(function (c) {
      return (c.items || []).some(function (i) { return !i.hidden; });
    });
    if (!cats.length) return;

    var tabsHtml = cats.map(function (c, i) {
      return '<button class="tab' + (i === 0 ? ' is-on' : '') + '" role="tab"' +
        ' aria-selected="' + (i === 0) + '" aria-controls="p-' + esc(c.id) + '"' +
        ' id="t-' + esc(c.id) + '">' + esc(c.title) + '</button>';
    }).join('');

    var panelsHtml = cats.map(function (c, i) {
      var rows = c.items.filter(function (it) { return !it.hidden; }).map(function (it) {
        return '<li' + (it.star ? ' class="is-star"' : '') + '>' +
          '<span class="menu__n">' + esc(it.name) + '</span>' +
          '<span class="menu__v">' + esc(it.note) + '</span><i></i>' +
          '<span class="menu__p">' + esc(priceText(it)) + '</span></li>';
      }).join('');
      return '<div class="panel' + (i === 0 ? ' is-on' : '') + '" id="p-' + esc(c.id) + '"' +
        ' role="tabpanel" aria-labelledby="t-' + esc(c.id) + '"' + (i === 0 ? '' : ' hidden') + '>' +
        '<ul class="menu">' + rows + '</ul></div>';
    }).join('');

    live.innerHTML = '<div class="tabs reveal is-in" role="tablist" aria-label="Разделы меню">' +
      tabsHtml + '</div>' + panelsHtml;

    var note = document.getElementById('menu-note');
    if (note && typeof menu.note === 'string' && menu.note.trim()) {
      note.innerHTML = menu.note.split('\n').map(esc).join('<br>');
    }

    observe(live);
    bindTabs();
  };

  if (live && window.fetch) {
    fetch('/api/menu', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.menu) render(data.menu); })
      .catch(function () { /* остаётся статическое меню */ });
  }

  /* ── год в подвале ── */
  document.getElementById('yr').textContent = new Date().getFullYear();
})();
