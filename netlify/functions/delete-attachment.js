import { createClient } from '@supabase/supabase-js'
import {
  getUserFromEvent,
  isMissingSchemaColumn,
  jsonResponse,
  loadAttachmentWithAccess,
} from './_utils/attachments.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const tablesByKind = {
  chat_message: 'chat_message_files',
  sup_task: 'sup_task_files',
  sup_project: 'sup_project_files',
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent({ supabase, event })

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    const body = JSON.parse(event.body || '{}')
    const kind = body.kind
    const fileId = body.file_id

    if (!kind || !fileId) {
      return jsonResponse(400, { error: 'Не переданы kind и file_id.' })
    }

    const table = tablesByKind[kind]

    if (!table) {
      return jsonResponse(400, { error: 'Неизвестный тип вложения.' })
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

    if (!access.canDelete) {
      return jsonResponse(403, { error: 'Нет прав на удаление этого файла.' })
    }

    const { error } = await supabase
      .from(table)
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq('id', fileId)

    if (error) {
      if (isMissingSchemaColumn(error)) {
        return jsonResponse(500, {
          error: 'Для удаления вложений нужно выполнить SQL supabase/attachments-schema.sql.',
          details: error.message,
        })
      }

      return jsonResponse(500, {
        error: 'Не удалось удалить файл.',
        details: error.message,
      })
    }

    return jsonResponse(200, { success: true })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
