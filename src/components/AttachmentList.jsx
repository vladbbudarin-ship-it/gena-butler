import { useState } from 'react'
import { deleteAttachment, getAttachmentUrl } from '../lib/api'

function formatFileSize(size) {
  const value = Number(size || 0)

  if (!value) {
    return ''
  }

  if (value < 1024) {
    return `${value} Б`
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} КБ`
  }

  return `${(value / 1024 / 1024).toFixed(1)} МБ`
}

export default function AttachmentList({
  files = [],
  kind,
  canDelete = () => false,
  onChanged,
}) {
  const [busyId, setBusyId] = useState(null)
  const [message, setMessage] = useState('')
  const activeFiles = files.filter((file) => !file.deleted_at)

  if (activeFiles.length === 0) {
    return null
  }

  async function handleOpen(file) {
    try {
      setBusyId(file.id)
      setMessage('')
      const url = await getAttachmentUrl({ kind: file.kind || kind, fileId: file.id })
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(file) {
    if (!window.confirm('Удалить файл?')) {
      return
    }

    try {
      setBusyId(file.id)
      setMessage('')
      await deleteAttachment({ kind: file.kind || kind, fileId: file.id })
      await onChanged?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="attachment-list">
      <strong>Вложения</strong>
      {activeFiles.map((file) => (
        <div className="attachment-item" key={`${file.kind || kind}:${file.id}`}>
          <div className="attachment-copy">
            <span>{file.file_name}</span>
            <small>
              {file.mime_type || 'Файл'}
              {formatFileSize(file.file_size) && ` · ${formatFileSize(file.file_size)}`}
            </small>
          </div>
          <div className="attachment-actions">
            <button className="secondary" type="button" onClick={() => handleOpen(file)} disabled={busyId === file.id}>
              Открыть
            </button>
            {canDelete(file) && (
              <button className="danger ghost" type="button" onClick={() => handleDelete(file)} disabled={busyId === file.id}>
                Удалить
              </button>
            )}
          </div>
        </div>
      ))}
      {message && <p className="notice danger">{message}</p>}
    </div>
  )
}
