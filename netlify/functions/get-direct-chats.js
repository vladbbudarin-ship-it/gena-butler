import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function isMissingSchemaColumn(error) {
  return error?.code === 'PGRST204'
    || /column|schema cache/i.test(error?.message || '')
}

async function loadMyParticipants(userId) {
  const withDeleteFields = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at, deleted_at')
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (!withDeleteFields.error) {
    return withDeleteFields
  }

  if (!isMissingSchemaColumn(withDeleteFields.error)) {
    return withDeleteFields
  }

  return supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('user_id', userId)
}

async function loadLatestMessages(directIds) {
  const withDeleteFields = await supabase
    .from('chat_messages')
    .select('id, conversation_id, sender_id, sender_role, body, created_at, deleted_at, deleted_by')
    .in('conversation_id', directIds)
    .order('created_at', { ascending: false })

  if (!withDeleteFields.error) {
    return withDeleteFields
  }

  if (!isMissingSchemaColumn(withDeleteFields.error)) {
    return withDeleteFields
  }

  return supabase
    .from('chat_messages')
    .select('id, conversation_id, sender_id, sender_role, body, created_at')
    .in('conversation_id', directIds)
    .order('created_at', { ascending: false })
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
    if (event.httpMethod !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent(event)

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    const { data: participantRows, error: participantError } = await loadMyParticipants(user.id)

    if (participantError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить список чатов. Проверьте, что SQL-файл supabase/direct-chats-schema.sql выполнен в Supabase.',
        details: participantError.message,
      })
    }

    if (participantRows.length === 0) {
      return jsonResponse(200, { success: true, conversations: [] })
    }

    const conversationIds = participantRows.map((row) => row.conversation_id)
    const lastReadByConversationId = Object.fromEntries(
      participantRows.map((row) => [row.conversation_id, row.last_read_at])
    )

    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id, type, direct_key, last_message_at, created_at, updated_at')
      .eq('type', 'direct')
      .in('id', conversationIds)
      .order('last_message_at', { ascending: false })

    if (conversationsError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить диалоги.',
        details: conversationsError.message,
      })
    }

    if (conversations.length === 0) {
      return jsonResponse(200, { success: true, conversations: [] })
    }

    const directIds = conversations.map((conversation) => conversation.id)

    const { data: allParticipants, error: allParticipantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', directIds)

    if (allParticipantsError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить участников.',
        details: allParticipantsError.message,
      })
    }

    const participantUserIds = [...new Set(allParticipants.map((participant) => participant.user_id))]

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, public_id')
      .in('id', participantUserIds)

    if (profilesError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить профили.',
        details: profilesError.message,
      })
    }

    const { data: messages, error: messagesError } = await loadLatestMessages(directIds)

    if (messagesError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить последние сообщения.',
        details: messagesError.message,
      })
    }

    const profilesById = Object.fromEntries(profiles.map((profile) => [profile.id, profile]))
    const latestByConversationId = {}
    const unreadByConversationId = Object.fromEntries(directIds.map((id) => [id, 0]))

    for (const message of messages) {
      if (!latestByConversationId[message.conversation_id]) {
        latestByConversationId[message.conversation_id] = message
      }
    }

    for (const conversation of conversations) {
      const lastRead = lastReadByConversationId[conversation.id]
        ? new Date(lastReadByConversationId[conversation.id])
        : null

      unreadByConversationId[conversation.id] = messages.filter((message) => (
        message.conversation_id === conversation.id
        && message.sender_id !== user.id
        && !message.deleted_at
        && (!lastRead || new Date(message.created_at) > lastRead)
      )).length
    }

    const participantByConversationId = {}
    for (const participant of allParticipants) {
      if (participant.user_id !== user.id) {
        participantByConversationId[participant.conversation_id] = participant
      }
    }

    return jsonResponse(200, {
      success: true,
      conversations: conversations.map((conversation) => {
        const participants = allParticipants
          .filter((participant) => participant.conversation_id === conversation.id)
          .map((participant) => ({
            ...participant,
            profile: profilesById[participant.user_id] || null,
          }))
        const otherParticipant = participantByConversationId[conversation.id]
        const otherProfile = otherParticipant
          ? profilesById[otherParticipant.user_id] || null
          : null

        return {
          ...conversation,
          members: participants,
          title: otherProfile?.name || otherProfile?.public_id || 'Пользователь',
          other_user: otherProfile,
          last_message: latestByConversationId[conversation.id] || null,
          unread_count: unreadByConversationId[conversation.id] || 0,
        }
      }),
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
