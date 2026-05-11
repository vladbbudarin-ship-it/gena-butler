import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

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
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, account_type')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  return profile?.account_type === 'owner'
    || ['owner', 'admin'].includes(profile?.role)
    || normalizeEmail(user.email) === normalizeEmail(ownerEmail)
}

async function loadProfilesByIds(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))]

  if (uniqueIds.length === 0) {
    return {}
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, public_id, account_type, role')
    .in('id', uniqueIds)

  if (error) {
    throw error
  }

  return Object.fromEntries((data || []).map((profile) => [profile.id, profile]))
}

function getCodeStatus(code) {
  if (code.is_used) {
    return 'used'
  }

  if (!code.expires_at || new Date(code.expires_at).getTime() <= Date.now()) {
    return 'expired'
  }

  return 'active'
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
      return jsonResponse(403, { error: 'Список кодов Пользователь+ доступен только Бударину.' })
    }

    const { data: codes, error } = await supabase
      .from('plus_invite_codes')
      .select('id, code, created_by, used_by, is_used, expires_at, created_at, used_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить коды Пользователь+. Проверьте, что SQL-файл supabase/plus-invite-codes-schema.sql выполнен в Supabase.',
        details: error.message,
      })
    }

    const profilesById = await loadProfilesByIds([
      ...(codes || []).map((code) => code.created_by),
      ...(codes || []).map((code) => code.used_by),
    ])

    return jsonResponse(200, {
      success: true,
      codes: (codes || []).map((code) => ({
        ...code,
        status: getCodeStatus(code),
        created_by_profile: profilesById[code.created_by] || null,
        used_by_profile: profilesById[code.used_by] || null,
      })),
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
