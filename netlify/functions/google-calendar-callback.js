import { createClient } from '@supabase/supabase-js'
import { exchangeGoogleCalendarCode } from './_utils/google-calendar.js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const siteUrl = process.env.URL || 'https://gena-dvoretskiy.netlify.app'

export const handler = async (event) => {
  try {
    const code = event.queryStringParameters?.code
    const state = event.queryStringParameters?.state
    const error = event.queryStringParameters?.error

    if (error) {
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}?google_calendar=error` },
        body: '',
      }
    }

    if (!code || !state) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: 'Не переданы code/state для Google Calendar.',
      }
    }

    await exchangeGoogleCalendarCode({ supabase, code, state })

    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}?google_calendar=connected` },
      body: '',
    }
  } catch (callbackError) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: `Не удалось подключить Google Calendar: ${callbackError.message}`,
    }
  }
}
