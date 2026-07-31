/* На паузе — интерактив */
(function () {
  'use strict';

  /* ── появление блоков при скролле ── */
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-in'); });
  }

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
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var show = function (tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', String(on));
      var panel = document.getElementById(t.getAttribute('aria-controls'));
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

  /* ── год в подвале ── */
  document.getElementById('yr').textContent = new Date().getFullYear();
})();
