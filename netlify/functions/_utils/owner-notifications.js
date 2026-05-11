import { TELEGRAM_SITE_URL, sendTelegramMessage, truncateText } from './telegram.js'

const ownerEmail = process.env.OWNER_EMAIL

const importanceLabels = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
}

const urgencyLabels = {
  normal: 'Обычный',
  important: 'Важный',
  urgent: 'Срочный',
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isOwnerProfile(profile) {
  return profile?.account_type === 'owner'
    || profile?.role === 'owner'
    || normalizeEmail(profile?.email) === normalizeEmail(ownerEmail)
}

function getSenderName(profile) {
  return profile?.name
    || profile?.telegram_username
    || profile?.public_id
    || 'Пользователь'
}

function getSourceLabel(source) {
  return source === 'telegram' ? 'Telegram' : 'сайт'
}

function isMissingSchemaColumn(error) {
  return error?.code === 'PGRST204'
    || /account_type|column|schema cache/i.test(error?.message || '')
}

async function getTelegramOwners(supabase) {
  let { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, account_type, telegram_user_id')
    .not('telegram_user_id', 'is', null)

  if (error && isMissingSchemaColumn(error)) {
    const fallback = await supabase
      .from('profiles')
      .select('id, email, role, telegram_user_id')
      .not('telegram_user_id', 'is', null)

    data = fallback.data
    error = fallback.error
  }

  if (error) {
    console.warn('Could not load owner Telegram profiles:', error.message)
    return []
  }

  return (data || []).filter(isOwnerProfile)
}

export async function notifyOwnerAboutIncomingMessage({
  supabase,
  senderProfile,
  messageText,
  source = 'web',
  questionId = null,
  finalImportance = null,
  urgencyLevel = null,
}) {
  try {
    if (!senderProfile || isOwnerProfile(senderProfile)) {
      return
    }

    const owners = await getTelegramOwners(supabase)
    const senderTelegramId = senderProfile.telegram_user_id
    const importanceText = importanceLabels[finalImportance] || 'Пока нет'
    const urgencyText = urgencyLevel ? urgencyLabels[urgencyLevel] || urgencyLevel : null

    const notificationText = [
      `Новое сообщение от: ${getSenderName(senderProfile)}`,
      '',
      `Источник: ${getSourceLabel(source)}`,
      `Важность: ${importanceText}`,
      urgencyText ? `Срочность: ${urgencyText}` : null,
      questionId ? `ID обращения: ${questionId}` : null,
      '',
      'Текст:',
      truncateText(messageText, 1200),
    ].filter(Boolean).join('\n')

    await Promise.all(
      owners
        .filter((owner) => owner.telegram_user_id && owner.telegram_user_id !== senderTelegramId)
        .map((owner) => sendTelegramMessage(owner.telegram_user_id, notificationText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Открыть сайт', url: TELEGRAM_SITE_URL }],
            ],
          },
        }))
    )
  } catch (error) {
    console.warn('Could not notify owner in Telegram:', error.message)
  }
}
