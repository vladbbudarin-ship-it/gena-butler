import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const inviteCodePattern = /^[0-9]{4}[A-Z]{2}$/

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

async function deleteCreatedUser(userId) {
  if (!userId) {
    return
  }

  await supabase.auth.admin.deleteUser(userId)
}

export const handler = async (event) => {
  let createdUserId = null

  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const body = JSON.parse(event.body || '{}')
    const name = String(body.name || '').trim()
    const email = normalizeEmail(body.email)
    const password = String(body.password || '')
    const inviteCode = String(body.invite_code || '').trim().toUpperCase()

    if (!name) {
      return jsonResponse(400, { error: 'Введите имя.' })
    }

    if (!email) {
      return jsonResponse(400, { error: 'Введите email.' })
    }

    if (password.length < 6) {
      return jsonResponse(400, { error: 'Пароль должен быть не короче 6 символов.' })
    }

    if (!inviteCodePattern.test(inviteCode)) {
      return jsonResponse(400, { error: 'Invite-код должен быть в формате 4821AB.' })
    }

    const { data: invite, error: inviteError } = await supabase
      .from('invite_codes')
      .select('id, code, status, used_at, expires_at')
      .eq('code', inviteCode)
      .maybeSingle()

    if (inviteError) {
      return jsonResponse(500, {
        error: 'Не удалось проверить invite-код. Проверьте, что SQL-файл supabase/invite-codes-schema.sql выполнен в Supabase.',
        details: inviteError.message,
      })
    }

    if (!invite) {
      return jsonResponse(400, { error: 'Invite-код не найден.' })
    }

    if (invite.status === 'expired') {
      return jsonResponse(400, { error: 'Срок действия invite-кода истёк.' })
    }

    if (invite.status !== 'active' || invite.used_at) {
      return jsonResponse(400, { error: 'Invite-код уже использован.' })
    }

    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      await supabase
        .from('invite_codes')
        .update({ status: 'expired' })
        .eq('id', invite.id)
        .eq('status', 'active')
        .is('used_at', null)

      return jsonResponse(400, { error: 'Срок действия invite-кода истёк.' })
    }

    const {
      data: { user },
      error: createUserError,
    } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
      },
    })

    if (createUserError || !user) {
      return jsonResponse(400, {
        error: createUserError?.message || 'Не удалось создать пользователя.',
      })
    }

    createdUserId = user.id

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email,
        name,
        role: 'user',
      }, { onConflict: 'id' })

    if (profileError) {
      await deleteCreatedUser(createdUserId)

      return jsonResponse(500, {
        error: 'Пользователь создан не был: не удалось подготовить профиль.',
        details: profileError.message,
      })
    }

    const { data: usedInvite, error: updateInviteError } = await supabase
      .from('invite_codes')
      .update({
        status: 'used',
        used_by: user.id,
        used_at: new Date().toISOString(),
      })
      .eq('id', invite.id)
      .eq('status', 'active')
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle()

    if (updateInviteError || !usedInvite) {
      await deleteCreatedUser(createdUserId)

      return jsonResponse(409, {
        error: 'Invite-код уже был использован или истёк. Пользователь не создан.',
        details: updateInviteError?.message,
      })
    }

    return jsonResponse(200, {
      success: true,
    })
  } catch (error) {
    if (createdUserId) {
      await deleteCreatedUser(createdUserId)
    }

    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
