const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI
const ownerEmail = process.env.OWNER_EMAIL
const timezone = 'Europe/Moscow'

const calendarScopes = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/userinfo.email',
]

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function getGoogleCalendarEnvStatus() {
  return {
    hasGoogleClientId: Boolean(googleClientId),
    hasGoogleClientSecret: Boolean(googleClientSecret),
    hasGoogleRedirectUri: Boolean(googleRedirectUri),
  }
}

export function assertGoogleCalendarEnv() {
  const status = getGoogleCalendarEnvStatus()

  if (!status.hasGoogleClientId || !status.hasGoogleClientSecret || !status.hasGoogleRedirectUri) {
    throw new Error('Google Calendar не настроен. Добавьте GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET и GOOGLE_REDIRECT_URI в Netlify.')
  }
}

export async function getOwnerProfile({ supabase }) {
  if (ownerEmail) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, account_type')
      .eq('email', ownerEmail)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (data) {
      return data
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, account_type')
    .or('account_type.eq.owner,role.eq.owner,role.eq.admin')
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function isOwnerUser({ supabase, user }) {
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

export async function createGoogleCalendarAuthUrl({ supabase, ownerId }) {
  assertGoogleCalendarEnv()

  const state = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('owner_google_connections')
    .upsert({
      owner_id: ownerId,
      oauth_state: state,
      oauth_state_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id' })

  if (error) {
    throw error
  }

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: googleRedirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: calendarScopes.join(' '),
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCalendarCode({ supabase, code, state }) {
  assertGoogleCalendarEnv()

  const { data: pending, error: pendingError } = await supabase
    .from('owner_google_connections')
    .select('owner_id, oauth_state_expires_at')
    .eq('oauth_state', state)
    .maybeSingle()

  if (pendingError) {
    throw pendingError
  }

  if (!pending || new Date(pending.oauth_state_expires_at).getTime() <= Date.now()) {
    throw new Error('Ссылка подключения Google Calendar устарела. Создайте новую в кабинете Бударина.')
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: googleRedirectUri,
      grant_type: 'authorization_code',
      code,
    }),
  })

  const tokenData = await tokenResponse.json()

  if (!tokenResponse.ok) {
    throw new Error(tokenData.error_description || tokenData.error || 'Google не вернул access token.')
  }

  const accessToken = tokenData.access_token
  const refreshToken = tokenData.refresh_token
  const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString()
  let googleEmail = null

  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (userInfoResponse.ok) {
    const userInfo = await userInfoResponse.json()
    googleEmail = userInfo.email || null
  }

  const updateData = {
    owner_id: pending.owner_id,
    google_email: googleEmail,
    access_token: accessToken,
    scope: tokenData.scope || calendarScopes.join(' '),
    expires_at: expiresAt,
    oauth_state: null,
    oauth_state_expires_at: null,
    updated_at: new Date().toISOString(),
  }

  if (refreshToken) {
    updateData.refresh_token = refreshToken
  }

  const { error } = await supabase
    .from('owner_google_connections')
    .upsert(updateData, { onConflict: 'owner_id' })

  if (error) {
    throw error
  }

  return {
    ownerId: pending.owner_id,
    googleEmail,
  }
}

export async function getGoogleCalendarConnection({ supabase, ownerId }) {
  const { data, error } = await supabase
    .from('owner_google_connections')
    .select('owner_id, google_email, access_token, refresh_token, scope, expires_at')
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

async function refreshAccessTokenIfNeeded({ supabase, connection }) {
  assertGoogleCalendarEnv()

  if (!connection?.refresh_token) {
    return connection?.access_token || null
  }

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0

  if (connection.access_token && expiresAt - Date.now() > 60 * 1000) {
    return connection.access_token
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Не удалось обновить Google access token.')
  }

  const accessToken = data.access_token
  const expiresAtIso = new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString()

  await supabase
    .from('owner_google_connections')
    .update({
      access_token: accessToken,
      expires_at: expiresAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_id', connection.owner_id)

  return accessToken
}

function formatMoscowDateTime(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export async function getOwnerCalendarSafeSummary({ supabase }) {
  const now = new Date()
  const dateText = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now)

  const base = [
    `Текущая дата и время: ${dateText}.`,
    `Часовой пояс: ${timezone}.`,
  ]

  try {
    const ownerProfile = await getOwnerProfile({ supabase })

    if (!ownerProfile?.id) {
      return `${base.join('\n')}\nGoogle Calendar Бударина не подключён.`
    }

    const connection = await getGoogleCalendarConnection({ supabase, ownerId: ownerProfile.id })

    if (!connection?.refresh_token && !connection?.access_token) {
      return `${base.join('\n')}\nGoogle Calendar Бударина не подключён.`
    }

    const accessToken = await refreshAccessTokenIfNeeded({ supabase, connection })
    const timeMin = now.toISOString()
    const timeMax = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()

    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: timezone,
        items: [{ id: 'primary' }],
      }),
    })

    if (!response.ok) {
      return `${base.join('\n')}\nGoogle Calendar подключён, но занятость сейчас недоступна.`
    }

    const data = await response.json()
    const busy = data.calendars?.primary?.busy || []

    if (busy.length === 0) {
      return `${base.join('\n')}\nВ ближайшие 3 дня в календаре Бударина нет занятых окон. Можно предлагать свободное время.`
    }

    const busyText = busy
      .slice(0, 10)
      .map((slot) => `занят с ${formatMoscowDateTime(slot.start)} до ${formatMoscowDateTime(slot.end)}`)
      .join('; ')

    return `${base.join('\n')}\nБезопасная сводка календаря Бударина на ближайшие 3 дня: ${busyText}. Не раскрывай пользователям названия встреч, участников и личные детали.`
  } catch (error) {
    console.warn('Google Calendar summary skipped:', error.message)
    return `${base.join('\n')}\nGoogle Calendar Бударина сейчас недоступен.`
  }
}

export function normalizeCalendarAction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const title = String(value.title || value.summary || '').trim()
  const startTime = String(value.start_time || value.start || '').trim()
  const endTime = String(value.end_time || value.end || '').trim()
  const description = String(value.description || '').trim()
  const actionTimezone = String(value.timezone || timezone).trim() || timezone

  if (!title || !startTime || !endTime) {
    return null
  }

  return {
    title,
    start_time: startTime,
    end_time: endTime,
    description,
    timezone: actionTimezone,
  }
}

export async function createOwnerCalendarEvent({ supabase, calendarAction }) {
  const action = normalizeCalendarAction(calendarAction)

  if (!action) {
    return null
  }

  const ownerProfile = await getOwnerProfile({ supabase })

  if (!ownerProfile?.id) {
    throw new Error('Профиль Бударина не найден для создания события.')
  }

  const connection = await getGoogleCalendarConnection({ supabase, ownerId: ownerProfile.id })

  if (!connection?.refresh_token && !connection?.access_token) {
    throw new Error('Google Calendar Бударина не подключён.')
  }

  const accessToken = await refreshAccessTokenIfNeeded({ supabase, connection })
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: action.title,
      description: action.description || undefined,
      start: {
        dateTime: action.start_time,
        timeZone: action.timezone || timezone,
      },
      end: {
        dateTime: action.end_time,
        timeZone: action.timezone || timezone,
      },
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Не удалось создать событие в Google Calendar.')
  }

  return {
    id: data.id,
    htmlLink: data.htmlLink,
  }
}
