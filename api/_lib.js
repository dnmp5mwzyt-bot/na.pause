'use strict';

/* Общая логика для /api: хранилище, авторизация, валидация меню.
   Без зависимостей — только встроенные модули Node и глобальный fetch. */

const crypto = require('node:crypto');

const KEY = 'monte:menu';

/* Меню по умолчанию. Отдаётся, пока в хранилище ничего не сохранено,
   и совпадает со статической разметкой в index.html (она — запасной
   вариант для случая, когда JS выключен или API недоступен). */
const DEFAULT_MENU = {
  note: 'Альтернативное молоко — миндальное, банановое, кокосовое.\nБез доплаты за вашу привычку.',
  categories: [
    {
      id: 'c1',
      title: 'Кофе и напитки',
      items: [
        { name: 'Эспрессо', note: '36 мл', price: 170, from: false, star: false, hidden: false },
        { name: 'Американо', note: '200 мл', price: 180, from: false, star: false, hidden: false },
        { name: 'Капучино', note: '200 мл', price: 190, from: false, star: false, hidden: false },
        { name: 'Авторский раф', note: '300 мл · халва, вишня, кленовый пекан, бергамот', price: 350, from: false, star: true, hidden: false },
        { name: 'Авторский латте', note: '300 мл · на альтернативном молоке без доплаты', price: 350, from: false, star: false, hidden: false },
        { name: 'Горячий шоколад', note: '300 мл', price: 220, from: false, star: false, hidden: false }
      ]
    },
    {
      id: 'c2',
      title: 'Десерты',
      items: [
        { name: 'Макарон', note: 'в ассортименте', price: 120, from: false, star: false, hidden: false },
        { name: 'Пончик', note: 'в ассортименте', price: 140, from: false, star: false, hidden: false },
        { name: 'Маффин', note: 'в ассортименте · шоколадный — хит', price: 160, from: false, star: true, hidden: false }
      ]
    },
    {
      id: 'c3',
      title: 'Перекусить',
      items: [
        { name: 'Круассан', note: 'сладкий и сытный', price: 270, from: true, star: false, hidden: false },
        { name: 'Сэндвич', note: 'на гриле', price: 270, from: true, star: false, hidden: false },
        { name: 'Ролл', note: 'с собой или на месте', price: 270, from: true, star: false, hidden: false }
      ]
    }
  ]
};

/* ─────────── хранилище (Upstash Redis REST, он же Vercel KV) ─────────── */

function storeConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

async function redis(command) {
  const cfg = storeConfig();
  if (!cfg) return null;
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  const body = await res.json().catch(function () { return {}; });
  if (!res.ok || body.error) throw new Error('storage: ' + (body.error || res.status));
  return body.result;
}

async function readMenu() {
  if (!storeConfig()) return { menu: DEFAULT_MENU, source: 'default' };
  const raw = await redis(['GET', KEY]);
  if (!raw) return { menu: DEFAULT_MENU, source: 'default' };
  try {
    return { menu: JSON.parse(raw), source: 'store' };
  } catch (e) {
    return { menu: DEFAULT_MENU, source: 'default' };
  }
}

async function writeMenu(menu) {
  if (!storeConfig()) throw new Error('no-store');
  await redis(['SET', KEY, JSON.stringify(menu)]);
}

/* ─────────── авторизация ─────────── */

/* Секрет сессии выводится из пароля: смена пароля разлогинивает всех. */
function sessionSecret() {
  return crypto.createHash('sha256').update('monte/session/' + (process.env.ADMIN_PASSWORD || '')).digest();
}

function sameString(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function issueToken(ttlMs) {
  const exp = String(Date.now() + (ttlMs || 8 * 60 * 60 * 1000));
  const sig = crypto.createHmac('sha256', sessionSecret()).update(exp).digest('base64url');
  return exp + '.' + sig;
}

function verifyToken(token) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(parts[0]).digest('base64url');
  try {
    return sameString(expected, parts[1]);
  } catch (e) {
    return false;
  }
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

/* ─────────── валидация ─────────── */

const LIMITS = { categories: 12, items: 60, title: 40, name: 80, note: 160, price: 100000, note_block: 300 };

function text(value, max) {
  return String(value == null ? '' : value).replace(/[\r\t]/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max);
}

/* Приводит присланные данные к каноническому виду или бросает ошибку.
   Всё, что пришло из браузера, считается недоверенным. */
function normalize(input) {
  if (!input || typeof input !== 'object') throw new Error('Ожидается объект меню');
  const cats = Array.isArray(input.categories) ? input.categories : null;
  if (!cats || !cats.length) throw new Error('Нужен хотя бы один раздел');
  if (cats.length > LIMITS.categories) throw new Error('Слишком много разделов (максимум ' + LIMITS.categories + ')');

  const categories = cats.map(function (cat, ci) {
    const title = text(cat && cat.title, LIMITS.title);
    if (!title) throw new Error('У раздела №' + (ci + 1) + ' пустое название');

    const src = Array.isArray(cat.items) ? cat.items : [];
    if (src.length > LIMITS.items) throw new Error('В разделе «' + title + '» слишком много позиций');

    const items = src.map(function (it, ii) {
      const name = text(it && it.name, LIMITS.name);
      if (!name) throw new Error('В разделе «' + title + '» у позиции №' + (ii + 1) + ' пустое название');
      const price = Math.round(Number(it && it.price));
      if (!Number.isFinite(price) || price < 0 || price > LIMITS.price) {
        throw new Error('Некорректная цена у позиции «' + name + '»');
      }
      return {
        name: name,
        note: text(it.note, LIMITS.note),
        price: price,
        from: Boolean(it.from),
        star: Boolean(it.star),
        hidden: Boolean(it.hidden)
      };
    });

    return { id: 'c' + (ci + 1), title: title, items: items };
  });

  return {
    note: String(input.note == null ? '' : input.note).replace(/\r/g, '').trim().slice(0, LIMITS.note_block),
    categories: categories,
    updatedAt: new Date().toISOString()
  };
}

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128 * 1024) throw new Error('Слишком большой запрос');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

module.exports = {
  DEFAULT_MENU, LIMITS,
  storeConfig, readMenu, writeMenu, redis,
  issueToken, verifyToken, bearer, sameString,
  normalize, json, readBody
};
