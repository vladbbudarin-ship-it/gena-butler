import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
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

async function isOwner(user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return ['owner', 'admin'].includes(profile?.role) || normalizeEmail(user.email) === normalizeEmail(ownerEmail)
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

    if (!(await isOwner(user))) {
      return jsonResponse(403, { error: 'Доступ разрешён только владельцу.' })
    }

    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id, user_id, status, owner_last_read_at, user_last_read_at, last_message_at, created_at, updated_at')
      .order('last_message_at', { ascending: false })

    if (conversationsError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить диалоги.',
        details: conversationsError.message,
      })
    }

    if (conversations.length === 0) {
      return jsonResponse(200, {
        success: true,
        conversations: [],
      })
    }

    const userIds = [...new Set(conversations.map((conversation) => conversation.user_id))]
    const conversationIds = conversations.map((conversation) => conversation.id)

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, name, is_important_contact')
      .in('id', userIds)

    if (profilesError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить профили.',
        details: profilesError.message,
      })
    }

    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_role, body, importance, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })

    if (messagesError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить последние сообщения.',
        details: messagesError.message,
      })
    }

    const profilesById = Object.fromEntries(profiles.map((profile) => [profile.id, profile]))
    const latestByConversationId = {}
    const unreadByConversationId = Object.fromEntries(conversationIds.map((id) => [id, 0]))

    for (const message of messages) {
      if (!latestByConversationId[message.conversation_id]) {
        latestByConversationId[message.conversation_id] = message
      }
    }

    for (const conversation of conversations) {
      const lastRead = conversation.owner_last_read_at
        ? new Date(conversation.owner_last_read_at)
        : null

      unreadByConversationId[conversation.id] = messages.filter((message) => (
        message.conversation_id === conversation.id
        && message.sender_role === 'user'
        && (!lastRead || new Date(message.created_at) > lastRead)
      )).length
    }

    return jsonResponse(200, {
      success: true,
      conversations: conversations.map((conversation) => ({
        ...conversation,
        user_profile: profilesById[conversation.user_id] || null,
        last_message: latestByConversationId[conversation.id] || null,
        unread_count: unreadByConversationId[conversation.id] || 0,
      })),
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
