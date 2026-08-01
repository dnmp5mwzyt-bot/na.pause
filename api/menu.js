'use strict';

/* GET  /api/menu — текущее меню, публично.
   PUT  /api/menu — сохранить меню, нужен токен из /api/login. */

const lib = require('./_lib.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await lib.readMenu();
      // короткий кэш на CDN: правки видны почти сразу, но всплеск трафика не бьёт по хранилищу
      res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');
      return lib.json(res, 200, {
        menu: data.menu,
        source: data.source,
        storeConfigured: Boolean(lib.storeConfig())
      });
    }

    if (req.method === 'PUT') {
      if (!process.env.ADMIN_PASSWORD) {
        return lib.json(res, 503, { error: 'Пароль администратора не задан в переменных окружения' });
      }
      if (!lib.verifyToken(lib.bearer(req))) {
        return lib.json(res, 401, { error: 'Сессия истекла — войдите заново' });
      }
      if (!lib.storeConfig()) {
        return lib.json(res, 503, { error: 'Хранилище не подключено: нет KV_REST_API_URL / KV_REST_API_TOKEN' });
      }

      let payload;
      try {
        payload = await lib.readBody(req);
      } catch (e) {
        return lib.json(res, 400, { error: 'Не удалось разобрать запрос' });
      }

      let menu;
      try {
        menu = lib.normalize(payload.menu);
      } catch (e) {
        return lib.json(res, 400, { error: e.message });
      }

      await lib.writeMenu(menu);
      res.setHeader('Cache-Control', 'no-store');
      return lib.json(res, 200, { ok: true, menu: menu });
    }

    res.setHeader('Allow', 'GET, PUT');
    return lib.json(res, 405, { error: 'Метод не поддерживается' });
  } catch (e) {
    return lib.json(res, 500, { error: 'Ошибка сервера: ' + e.message });
  }
};
