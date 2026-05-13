import crypto from 'crypto'

const maxAuthAgeSeconds = 24 * 60 * 60

export class TelegramAuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'TelegramAuthError'
    this.statusCode = statusCode
  }
}

function getCheckString(authData) {
  return Object.keys(authData)
    .filter((key) => key !== 'hash')
    .sort()
    .map((key) => `${key}=${authData[key]}`)
    .join('\n')
}

function safeTimingEqual(left, right) {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function verifyTelegramAuthData(authData, botToken = process.env.TELEGRAM_BOT_TOKEN) {
  if (!botToken) {
    throw new TelegramAuthError('TELEGRAM_BOT_TOKEN не настроен на сервере.', 500)
  }

  if (!authData || typeof authData !== 'object' || Array.isArray(authData)) {
    throw new TelegramAuthError('Telegram-подтверждение не получено.')
  }

  const hash = String(authData.hash || '').trim()

  if (!hash) {
    throw new TelegramAuthError('Telegram не передал подпись.')
  }

  const authDate = Number(authData.auth_date || 0)

  if (!authDate) {
    throw new TelegramAuthError('Telegram не передал дату подтверждения.')
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDate

  if (ageSeconds < 0 || ageSeconds > maxAuthAgeSeconds) {
    throw new TelegramAuthError('Срок действия Telegram-подтверждения истёк. Подтвердите Telegram ещё раз.')
  }

  const secretKey = crypto
    .createHash('sha256')
    .update(botToken)
    .digest()

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(getCheckString(authData))
    .digest('hex')

  if (!safeTimingEqual(expectedHash, hash)) {
    throw new TelegramAuthError('Telegram-подпись неверна.')
  }

  const telegramUserId = Number(authData.id)

  if (!telegramUserId) {
    throw new TelegramAuthError('Telegram не передал ID пользователя.')
  }

  return {
    telegram_user_id: telegramUserId,
    telegram_username: authData.username ? String(authData.username).trim() : null,
    first_name: authData.first_name ? String(authData.first_name).trim() : null,
    last_name: authData.last_name ? String(authData.last_name).trim() : null,
    photo_url: authData.photo_url ? String(authData.photo_url).trim() : null,
    auth_date: authDate,
  }
}
