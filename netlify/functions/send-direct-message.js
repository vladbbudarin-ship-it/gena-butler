import { createClient } from '@supabase/supabase-js'
import { TELEGRAM_SITE_URL, sendTelegramMessage, truncateText } from './_utils/telegram.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function getDisplayName(profile) {
  return profile?.name || profile?.public_id || 'Пользователь'
}

async function notifyDirectChatRecipients({ conversationId, senderId, messageText }) {
  try {
    const { data: participants, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', senderId)

    if (participantsError || !participants?.length) {
      if (participantsError) {
        console.warn('Direct chat notification skipped: participants lookup failed.', participantsError.message)
      }
      return
    }

    const recipientIds = participants.map((participant) => participant.user_id).filter(Boolean)

    const [{ data: senderProfile }, { data: recipientProfiles, error: profilesError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, public_id, telegram_user_id')
        .eq('id', senderId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, telegram_user_id')
        .in('id', recipientIds),
    ])

    if (profilesError || !recipientProfiles?.length) {
      if (profilesError) {
        console.warn('Direct chat notification skipped: recipient profiles lookup failed.', profilesError.message)
      }
      return
    }

    const senderName = getDisplayName(senderProfile)
    const senderTelegramId = senderProfile?.telegram_user_id ? String(senderProfile.telegram_user_id) : null
    const notificationText = [
      `Новое сообщение от: ${senderName}`,
      '',
      'Текст:',
      truncateText(messageText, 1200),
    ].join('\n')

    await Promise.allSettled(
      recipientProfiles
        .filter((profile) => profile.telegram_user_id)
        .filter((profile) => String(profile.telegram_user_id) !== senderTelegramId)
        .map((profile) => sendTelegramMessage(profile.telegram_user_id, notificationText, {
          reply_markup: {
            inline_keyboard: [[{ text: 'Открыть сайт', url: TELEGRAM_SITE_URL }]],
          },
        }))
    )
  } catch (error) {
    console.warn('Direct chat notification skipped:', error.message)
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function getUserFromEvent(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Пользователь не авторизован.' }
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken)

  if (error || !user) {
    return { error: 'Не удалось проверить пользователя.' }
  }

  return { user }
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent(event)

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    const body = JSON.parse(event.body || '{}')
    const conversationId = body.conversation_id
    const messageBody = String(body.body || '').trim()

    if (!conversationId) {
      return jsonResponse(400, { error: 'Не передан conversation_id.' })
    }

    if (!messageBody) {
      return jsonResponse(400, { error: 'Введите текст сообщения.' })
    }

    if (messageBody.length > 3000) {
      return jsonResponse(400, { error: 'Сообщение слишком длинное. Максимум 3000 символов.' })
    }

    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (participantError) {
      return jsonResponse(500, {
        error: 'Не удалось проверить доступ к чату.',
        details: participantError.message,
      })
    }

    if (!participant) {
      return jsonResponse(403, { error: 'Нет доступа к этому чату.' })
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('type', 'direct')
      .single()

    if (conversationError || !conversation) {
      return jsonResponse(404, { error: 'Чат не найден.' })
    }

    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_role: 'user',
        body: messageBody,
        importance: 'normal',
      })
      .select('id, conversation_id, sender_id, sender_role, body, body_zh, importance, created_at')
      .single()

    if (messageError) {
      return jsonResponse(500, {
        error: 'Не удалось отправить сообщение.',
        details: messageError.message,
      })
    }

    const { error: restoreError } = await supabase
      .from('conversation_participants')
      .update({ deleted_at: null })
      .eq('conversation_id', conversationId)

    if (restoreError && !/column|schema cache/i.test(restoreError.message || '')) {
      return jsonResponse(500, {
        error: 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ СЃРѕСЃС‚РѕСЏРЅРёРµ С‡Р°С‚Р°.',
        details: restoreError.message,
      })
    }

    await notifyDirectChatRecipients({
      conversationId,
      senderId: user.id,
      messageText: messageBody,
    })

    return jsonResponse(200, {
      success: true,
      message,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
