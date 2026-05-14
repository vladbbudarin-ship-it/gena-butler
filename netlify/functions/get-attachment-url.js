import { createClient } from '@supabase/supabase-js'
import {
  getUserFromEvent,
  jsonResponse,
  loadAttachmentWithAccess,
} from './_utils/attachments.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export const handler = async (event) => {
  try {
    if (!['GET', 'POST'].includes(event.httpMethod)) {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent({ supabase, event })

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    const body = event.httpMethod === 'POST'
      ? JSON.parse(event.body || '{}')
      : {}
    const kind = event.queryStringParameters?.kind || body.kind
    const fileId = event.queryStringParameters?.file_id || body.file_id

    if (!kind || !fileId) {
      return jsonResponse(400, { error: 'Не переданы kind и file_id.' })
    }

    const access = await loadAttachmentWithAccess({
      supabase,
      kind,
      fileId,
      user,
    })

    if (access.error) {
      return jsonResponse(access.statusCode || 400, { error: access.error })
    }

    const { data, error } = await supabase.storage
      .from(access.bucket)
      .createSignedUrl(access.file.storage_path, 10 * 60)

    if (error || !data?.signedUrl) {
      return jsonResponse(500, {
        error: 'Не удалось создать безопасную ссылку на файл.',
        details: error?.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      url: data.signedUrl,
      file_name: access.file.file_name,
      expires_in: 600,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
