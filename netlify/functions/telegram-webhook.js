import { createClient } from '@supabase/supabase-js'
import {
  createOwnerQuestionFromUser,
} from './_utils/owner-question-flow.js'
import { OwnerActionError, performOwnerQuestionAction } from './_utils/owner-actions.js'
import {
  TELEGRAM_SITE_URL,
  answerCallbackQuery,
  mainMenuKeyboard,
  ownerCabinetKeyboard,
  questionActionKeyboard,
  sendTelegramMessage,
  truncateText,
  urgencyKeyboard,
} from './_utils/telegram.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
const ownerEmail = process.env.OWNER_EMAIL

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const telegramLinkCodePattern = /^TG-[0-9]{4}[A-Z]{2}$/
const closedStatuses = ['approved', 'edited', 'manual_reply', 'rejected']

const urgencyLabels = {
  normal: 'Обычный',
  important: 'Важный',
  urgent: 'Срочный',
}

const urgencyByText = {
  Обычный: 'normal',
  Важный: 'important',
  Срочный: 'urgent',
}

const importanceLabels = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
}

const statusLabels = {
  ai_processing: 'AI обрабатывает',
  draft_ready: 'Черновик готов',
  approved: 'Утверждён',
  edited: 'Отредактирован',
  manual_reply: 'Личный ответ',
  rejected: 'Отклонён',
  ai_error: 'Ошибка AI',
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function getTelegramUsername(from) {
  return from?.username ? String(from.username) : null
}

function isOwnerProfile(profile) {
  return ['owner', 'admin'].includes(profile?.role)
    || normalizeEmail(profile?.email) === normalizeEmail(ownerEmail)
}

async function getLinkedProfile(telegramUserId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, public_id, telegram_user_id, telegram_username')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data || null
}

async function setTelegramState({
  telegramUserId,
  profileId,
  state,
  payload = {},
  ttlMinutes = 60,
}) {
  const expiresAt = ttlMinutes
    ? new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
    : null

  const { error } = await supabase
    .from('telegram_bot_states')
    .upsert({
      telegram_user_id: telegramUserId,
      profile_id: profileId,
      state,
      payload,
      expires_at: expiresAt,
    }, { onConflict: 'telegram_user_id' })

  if (error) {
    throw error
  }
}

async function getTelegramState(telegramUserId) {
  const { data, error } = await supabase
    .from('telegram_bot_states')
    .select('state, payload, expires_at')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return { state: 'idle', payload: {} }
  }

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase
      .from('telegram_bot_states')
      .delete()
      .eq('telegram_user_id', telegramUserId)

    return { state: 'idle', payload: {} }
  }

  return {
    state: data.state,
    payload: data.payload || {},
  }
}

async function clearTelegramState(telegramUserId) {
  await supabase
    .from('telegram_bot_states')
    .delete()
    .eq('telegram_user_id', telegramUserId)
}

async function getOwnerTelegramProfiles() {
  const { data: owners, error } = await supabase
    .from('profiles')
    .select('id, email, role, telegram_user_id')
    .not('telegram_user_id', 'is', null)

  if (error) {
    console.error('Failed to load Telegram owners:', error.message)
    return []
  }

  return (owners || []).filter((profile) => isOwnerProfile(profile))
}

function getProfileDisplayName(profile) {
  return profile?.name || profile?.public_id || 'Пользователь'
}

async function notifyTelegramOwnersAboutQuestion({
  senderProfile,
  senderTelegramUserId,
  text,
  finalImportance,
}) {
  const owners = await getOwnerTelegramProfiles()

  await Promise.all(
    owners
      .filter((owner) => owner.telegram_user_id && owner.telegram_user_id !== senderTelegramUserId)
      .map((owner) => sendTelegramMessage(
        owner.telegram_user_id,
        [
          `Новое сообщение от: ${getProfileDisplayName(senderProfile)}`,
          '',
          'Текст:',
          truncateText(text, 1200),
          '',
          'Источник: Telegram',
          `Итоговая важность: ${importanceLabels[finalImportance] || importanceLabels.low}`,
        ].join('\n')
      ))
  )
}

async function sendUnlinkedWelcome(chatId) {
  await sendTelegramMessage(
    chatId,
    [
      'Здравствуйте. Я Дворецкий Гена.',
      '',
      'Чтобы пользоваться ботом, привяжите Telegram к профилю на сайте.',
      '',
      `1. Откройте сайт: ${TELEGRAM_SITE_URL}`,
      '2. Войдите в профиль.',
      '3. Нажмите «Привязать Telegram».',
      '4. Отправьте сюда код вида TG-1234AB.',
      '',
      'После привязки вы сможете писать Бударину через Telegram.',
    ].join('\n')
  )
}

async function sendMainMenu(chatId, profile) {
  await sendTelegramMessage(chatId, 'Выберите режим:', {
    reply_markup: mainMenuKeyboard({
      isOwner: isOwnerProfile(profile),
    }),
}

async function handleStartLink({ chatId, from, code }) {
  const normalizedCode = String(code || '').trim().toUpperCase()

  if (!telegramLinkCodePattern.test(normalizedCode)) {
    await sendTelegramMessage(chatId, 'Код привязки неверный. Создайте новый код в профиле на сайте.')
    return
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, role, telegram_link_code_expires_at')
    .eq('telegram_link_code', normalizedCode)
    .maybeSingle()

  if (profileError) {
    await sendTelegramMessage(chatId, 'Не удалось проверить код. Попробуйте позже.')
    return
  }

  if (!profile) {
    await sendTelegramMessage(chatId, 'Код не найден. Создайте новый код в профиле на сайте.')
    return
  }

  if (!profile.telegram_link_code_expires_at || new Date(profile.telegram_link_code_expires_at).getTime() <= Date.now()) {
    await supabase
      .from('profiles')
      .update({
        telegram_link_code: null,
        telegram_link_code_expires_at: null,
      })
      .eq('id', profile.id)

    await sendTelegramMessage(chatId, 'Срок действия кода истёк. Создайте новый код в профиле на сайте.')
    return
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      telegram_user_id: from.id,
      telegram_username: getTelegramUsername(from),
      telegram_linked_at: new Date().toISOString(),
      telegram_link_code: null,
      telegram_link_code_expires_at: null,
    })
    .eq('id', profile.id)

  if (updateError) {
    await sendTelegramMessage(chatId, 'Не удалось привязать Telegram. Возможно, этот Telegram уже привязан к другому профилю.')
    return
  }

  await clearTelegramState(from.id)
  await sendTelegramMessage(chatId, 'Telegram привязан к профилю.')
  await sendMainMenu(chatId, {
    ...profile,
    telegram_user_id: from.id,
    telegram_username: getTelegramUsername(from),
}

async function saveNormalDialogMessage({ chatId, profile, text }) {
  const result = await createOwnerQuestionFromUser({
    supabase,
    userId: profile.id,
    questionText: text,
    urgencyLevel: 'normal',
    sourceChannel: 'telegram',
    telegramChatId: chatId,
  })

  if (result.error) {
    await sendTelegramMessage(chatId, result.error)
    return
  }

}

async function saveUrgentQuestion({ chatId, message, profile, text, urgencyLevel }) {
  const result = await createOwnerQuestionFromUser({
    supabase,
    userId: profile.id,
    questionText: text,
    urgencyLevel,
    sourceChannel: 'telegram',
    telegramChatId: chatId,
    telegramMessageId: message.message_id,
  })

  if (result.error) {
    await sendTelegramMessage(chatId, result.error)
    return
  }

  })

  await sendTelegramMessage(chatId, 'Сообщение принято.', {
    reply_markup: mainMenuKeyboard({
      isOwner: isOwnerProfile(profile),
    }),
  })
}

async function loadOwnerQuestions(filter) {
  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, user_id, question_text, urgency_level, final_importance, status, ai_reason, ai_reply_options, ai_suggested_status, source_channel, draft_ru, draft_zh, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    throw error
  }

  const filteredQuestions = (questions || [])
    .filter((question) => {
      if (filter === 'urgent') {
        return question.urgency_level === 'urgent' && !closedStatuses.includes(question.status)
      }

      if (filter === 'important') {
        return question.final_importance === 'high' && !closedStatuses.includes(question.status)
      }

      if (filter === 'errors') {
        return question.status === 'ai_error'
      }

      if (filter === 'closed') {
        return closedStatuses.includes(question.status)
      }

      return !closedStatuses.includes(question.status)
    })
    .slice(0, 5)

  const userIds = [...new Set(filteredQuestions.map((question) => question.user_id).filter(Boolean))]

  if (userIds.length === 0) {
    return []
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, public_id, email')
    .in('id', userIds)

  const profilesById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]))

  return filteredQuestions.map((question) => ({
    ...question,
    user_profile: profilesById[question.user_id] || null,
  }))
}

function buildQuestionCard(question) {
  const profile = question.user_profile
  const userName = profile?.name || profile?.public_id || profile?.email || 'Пользователь'

  const replyOptions = Array.isArray(question.ai_reply_options)
    ? question.ai_reply_options
      .map((option, index) => `${index + 1}. ${truncateText(option, 350)}`)
      .join('\n')
    : ''

  return [
    `Пользователь: ${userName}`,
    `Статус: ${statusLabels[question.status] || question.status || 'Пока нет'}`,
    `Срочность: ${urgencyLabels[question.urgency_level] || question.urgency_level || 'Обычный'}`,
    `Итоговая важность: ${importanceLabels[question.final_importance] || 'Пока нет'}`,
    '',
    `Вопрос: ${truncateText(question.question_text, 700)}`,
    question.source_channel ? `Source: ${question.source_channel}` : null,
    question.ai_suggested_status ? `AI suggested status: ${question.ai_suggested_status}` : null,
    question.ai_reason ? ['', `AI reason: ${truncateText(question.ai_reason, 500)}`].join('\n') : null,
    replyOptions ? ['', `AI reply options:\n${replyOptions}`].join('\n') : null,
    question.draft_ru ? ['', `AI RU: ${truncateText(question.draft_ru, 800)}`].join('\n') : null,
    question.draft_zh ? ['', `AI ZH: ${truncateText(question.draft_zh, 800)}`].join('\n') : null,
  ].filter(Boolean).join('\n')
}

async function sendOwnerCabinet(chatId) {
  await sendTelegramMessage(chatId, 'Кабинет Бударина:', {
    reply_markup: ownerCabinetKeyboard(),
  })
}

async function sendOwnerQuestionList(chatId, filter = 'open') {
  const questions = await loadOwnerQuestions(filter)

  if (questions.length === 0) {
    await sendTelegramMessage(chatId, 'В этом разделе вопросов пока нет.', {
      reply_markup: ownerCabinetKeyboard(),
    })
    return
  }

  for (const question of questions) {
    await sendTelegramMessage(chatId, buildQuestionCard(question), {
      reply_markup: questionActionKeyboard(question.id),
    })
  }
}

async function handleOwnerActionCallback({ chatId, profile, action, questionId }) {
  if (action === 'edit' || action === 'manual') {
    await setTelegramState({
      telegramUserId: profile.telegram_user_id,
      profileId: profile.id,
      state: action === 'edit' ? 'owner_waiting_edit_reply' : 'owner_waiting_manual_reply',
      payload: { questionId },
      ttlMinutes: 30,
    })

    await sendTelegramMessage(
      chatId,
      action === 'edit'
        ? 'Отправьте новый русский текст ответа.'
        : 'Отправьте личный ответ на русском.'
    )
    return
  }

  const result = await performOwnerQuestionAction({
    supabase,
    ownerId: profile.id,
    questionId,
    action,
  })

  await sendTelegramMessage(chatId, `Готово: ${statusLabels[result.status] || result.status}.`)
}

async function handleOwnerWaitingReply({ chatId, profile, text, state }) {
  const action = state.state === 'owner_waiting_edit_reply' ? 'edit' : 'manual_reply'
  const questionId = state.payload?.questionId

  if (!questionId) {
    await clearTelegramState(profile.telegram_user_id)
    await sendTelegramMessage(chatId, 'Не найден вопрос для ответа. Откройте кабинет заново.')
    return
  }

  const result = await performOwnerQuestionAction({
    supabase,
    ownerId: profile.id,
    questionId,
    action,
    finalAnswerRu: text,
  })

  await clearTelegramState(profile.telegram_user_id)
  await sendTelegramMessage(chatId, `Ответ сохранён: ${statusLabels[result.status] || result.status}.`, {
    reply_markup: mainMenuKeyboard({ isOwner: true }),
  })
}

async function handleCallback(update) {
  const callback = update.callback_query

  if (!callback?.data || !callback?.from?.id || !callback?.message?.chat?.id) {
    return
  }

  const chatId = callback.message.chat.id
  const profile = await getLinkedProfile(callback.from.id)

  if (!profile || !isOwnerProfile(profile)) {
    await answerCallbackQuery(callback.id, 'Нет доступа.')
    await sendTelegramMessage(chatId, 'Кабинет Бударина доступен только владельцу.')
    return
  }

  await answerCallbackQuery(callback.id)

  if (callback.data.startsWith('owner_filter:')) {
    const filter = callback.data.split(':')[1] || 'open'
    await sendOwnerQuestionList(chatId, filter)
    return
  }

  if (callback.data.startsWith('owner_q:')) {
    const [, action, questionId] = callback.data.split(':')
    await handleOwnerActionCallback({
      chatId,
      profile,
      action,
      questionId,
    })
  }
}

async function handleMessage(update) {
  const message = update.message

  if (!message?.chat?.id || !message?.from?.id || typeof message.text !== 'string') {
    return
  }

  const chatId = message.chat.id
  const from = message.from
  const text = message.text.trim()
  const startMatch = text.match(/^\/start(?:@\w+)?\s+(TG-[0-9]{4}[A-Z]{2})$/i)

  if (startMatch) {
    await handleStartLink({
      chatId,
      from,
      code: startMatch[1],
    })
    return
  }

  const profile = await getLinkedProfile(from.id)

  if (text.startsWith('/start')) {
    if (!profile) {
      await sendUnlinkedWelcome(chatId)
      return
    }

    await sendMainMenu(chatId, profile)
    return
  }

  if (!profile) {
    await sendTelegramMessage(chatId, 'Сначала привяжите Telegram в профиле на сайте.')
    return
  }

  const isOwner = isOwnerProfile(profile)

  if (text === 'Открыть сайт') {
    await sendTelegramMessage(chatId, TELEGRAM_SITE_URL, {
      reply_markup: mainMenuKeyboard({ isOwner }),
    })
    return
  }

  if (text === 'Кабинет Бударина') {
    if (!isOwner) {
      await sendTelegramMessage(chatId, 'Кабинет Бударина доступен только владельцу.')
      return
    }

    await sendOwnerCabinet(chatId)
    await sendOwnerQuestionList(chatId, 'open')
    return
  }

  if (text === 'Обычный диалог') {
    await setTelegramState({
      telegramUserId: from.id,
      profileId: profile.id,
      state: 'normal_dialog',
      ttlMinutes: null,
    })

    await sendTelegramMessage(chatId, 'Обычный диалог включён. Напишите сообщение.', {
      reply_markup: mainMenuKeyboard({ isOwner }),
    })
    return
  }

  if (text === 'Срочный вопрос') {
    await setTelegramState({
      telegramUserId: from.id,
      profileId: profile.id,
      state: 'choosing_urgency',
      ttlMinutes: 30,
    })

    await sendTelegramMessage(chatId, 'Выберите срочность:', {
      reply_markup: urgencyKeyboard(),
    })
    return
  }

  const state = await getTelegramState(from.id)

  if (isOwner && ['owner_waiting_edit_reply', 'owner_waiting_manual_reply'].includes(state.state)) {
    await handleOwnerWaitingReply({
      chatId,
      profile,
      text,
      state,
    })
    return
  }

  if (state.state === 'choosing_urgency' && urgencyByText[text]) {
    await setTelegramState({
      telegramUserId: from.id,
      profileId: profile.id,
      state: 'waiting_urgent_question',
      payload: { urgencyLevel: urgencyByText[text] },
      ttlMinutes: 30,
    })

    await sendTelegramMessage(chatId, 'Напишите вопрос.')
    return
  }

  if (state.state === 'waiting_urgent_question') {
    await saveUrgentQuestion({
      chatId,
      message,
      profile,
      text,
      urgencyLevel: state.payload?.urgencyLevel || 'normal',
    })

    await setTelegramState({
      telegramUserId: from.id,
      profileId: profile.id,
      state: 'idle',
      ttlMinutes: 60,
    })
    return
  }

  if (state.state === 'normal_dialog') {
    await saveNormalDialogMessage({
      chatId,
      profile,
      text,
    })
    return
  }

  await sendMainMenu(chatId, profile)
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const secret = event.queryStringParameters?.secret

    if (!telegramWebhookSecret || secret !== telegramWebhookSecret) {
      return jsonResponse(401, { error: 'Unauthorized' })
    }

    const update = JSON.parse(event.body || '{}')

    if (update.callback_query) {
      await handleCallback(update)
    } else {
      await handleMessage(update)
    }

    return jsonResponse(200, { success: true })
  } catch (error) {
    if (error instanceof OwnerActionError) {
      console.error('Telegram owner action error:', error.message, error.details)
    } else {
      console.error('Telegram webhook error:', error.message)
    }

    return jsonResponse(200, {
      success: false,
      error: 'Webhook handled with internal error.',
    })
  }
}
