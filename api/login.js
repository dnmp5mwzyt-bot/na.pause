'use strict';

/* POST /api/login {password} → {token}
   Токен подписан HMAC и живёт 8 часов. Подбор пароля ограничен по IP. */

const lib = require('./_lib.js');

const MAX_FAILS = 8;
const WINDOW_SEC = 900;

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  return String(fwd).split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return lib.json(res, 405, { error: 'Метод не поддерживается' });
  }

  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) {
    return lib.json(res, 503, { error: 'Пароль администратора не задан в переменных окружения' });
  }

  const key = 'napauze:login-fail:' + clientIp(req);

  try {
    if (lib.storeConfig()) {
      const fails = Number(await lib.redis(['GET', key])) || 0;
      if (fails >= MAX_FAILS) {
        return lib.json(res, 429, { error: 'Слишком много попыток. Попробуйте через 15 минут.' });
      }
    }

    let body;
    try {
      body = await lib.readBody(req);
    } catch (e) {
      return lib.json(res, 400, { error: 'Не удалось разобрать запрос' });
    }

    const given = String(body.password == null ? '' : body.password);
    if (given && lib.sameString(given, expected)) {
      if (lib.storeConfig()) await lib.redis(['DEL', key]).catch(function () {});
      return lib.json(res, 200, { token: lib.issueToken(), expiresIn: 8 * 60 * 60 });
    }

    if (lib.storeConfig()) {
      await lib.redis(['INCR', key]).catch(function () {});
      await lib.redis(['EXPIRE', key, WINDOW_SEC]).catch(function () {});
    }
    return lib.json(res, 401, { error: 'Неверный пароль' });
  } catch (e) {
    return lib.json(res, 500, { error: 'Ошибка сервера: ' + e.message });
  }
};
