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

function getDirectKey(firstUserId, secondUserId) {
  return [firstUserId, secondUserId].sort().join(':')
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
    const publicId = String(body.public_id || '').trim()

    if (!/^[0-9]{10}$/.test(publicId)) {
      return jsonResponse(400, { error: 'Введите 10-значный ID пользователя.' })
    }

    const { data: targetProfile, error: targetError } = await supabase
      .from('profiles')
      .select('id, name, public_id')
      .eq('public_id', publicId)
      .maybeSingle()

    if (targetError) {
      return jsonResponse(500, {
        error: 'Не удалось найти пользователя. Проверьте, что SQL-файл supabase/direct-chats-schema.sql выполнен в Supabase.',
        details: targetError.message,
      })
    }

    if (!targetProfile) {
      return jsonResponse(404, { error: 'Пользователь с таким ID не найден.' })
    }

    if (targetProfile.id === user.id) {
      return jsonResponse(400, { error: 'Нельзя начать чат с самим собой.' })
    }

    const directKey = getDirectKey(user.id, targetProfile.id)

    const { data: existing, error: existingError } = await supabase
      .from('conversations')
      .select('id, type, direct_key, last_message_at, created_at, updated_at')
      .eq('type', 'direct')
      .eq('direct_key', directKey)
      .maybeSingle()

    if (existingError) {
      return jsonResponse(500, {
        error: 'Не удалось проверить существующий чат.',
        details: existingError.message,
      })
    }

    let conversation = existing

    if (!conversation) {
      const { data: created, error: createError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          type: 'direct',
          direct_key: directKey,
        })
        .select('id, type, direct_key, last_message_at, created_at, updated_at')
        .single()

      if (createError) {
        return jsonResponse(500, {
          error: 'Не удалось создать чат.',
          details: createError.message,
        })
      }

      conversation = created
    }

    const { error: participantsError } = await supabase
      .from('conversation_participants')
      .upsert([
        { conversation_id: conversation.id, user_id: user.id },
        { conversation_id: conversation.id, user_id: targetProfile.id },
      ], { onConflict: 'conversation_id,user_id' })

    if (participantsError) {
      return jsonResponse(500, {
        error: 'Не удалось добавить участников чата.',
        details: participantsError.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      conversation: {
        ...conversation,
        title: targetProfile.name || `ID ${targetProfile.public_id}`,
        other_user: targetProfile,
      },
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
