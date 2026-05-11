import { useEffect, useMemo, useState } from 'react'
import {
  createPlusInviteCode,
  getOwnerQuestions,
  getPlusInviteCodes,
  ownerAction,
} from '../lib/api'
import OwnerChatPanel from './OwnerChatPanel'

const closedStatuses = ['approved', 'edited', 'manual_reply', 'rejected']

const statusLabels = {
  new: 'Новый',
  ai_processing: 'AI обрабатывает',
  draft_ready: 'Черновик готов',
  approved: 'Утверждён',
  edited: 'Отредактирован',
  manual_reply: 'Личный ответ',
  rejected: 'Отклонён',
  ai_error: 'Ошибка AI',
}

const urgencyLabels = {
  normal: 'Обычный',
  important: 'Важный',
  urgent: 'Срочный',
}

const importanceLabels = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
}

const plusCodeStatusLabels = {
  active: 'Активен',
  used: 'Использован',
  expired: 'Истёк',
}

function getStatusLabel(status) {
  return statusLabels[status] || status
}

function getUrgencyLabel(urgency) {
  return urgencyLabels[urgency] || urgency
}

function getImportanceLabel(importance) {
  return importanceLabels[importance] || 'Пока нет'
}

function getImportanceBadgeClass(importance) {
  return `importance-badge importance-${importance || 'none'}`
}

function getBadgeClass(value) {
  if (['normal', 'important', 'urgent'].includes(value)) {
    return `status-pill urgency-${value}`
  }

  if (['new', 'ai_processing', 'draft_ready', 'approved', 'edited', 'manual_reply', 'rejected', 'ai_error'].includes(value)) {
    return `status-pill status-${value}`
  }

  if (value === 'urgent' || value === 'high' || value === 'ai_error') {
    return 'badge red'
  }

  if (closedStatuses.includes(value)) {
    return 'badge dark'
  }

  return 'badge'
}

function formatDateTime(value) {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getProfileName(profile) {
  return profile?.name || profile?.public_id || profile?.email || 'Пользователь'
}

function getPlusCodeBadgeClass(status) {
  if (status === 'active') {
    return 'status-pill status-approved'
  }

  if (status === 'used') {
    return 'badge dark'
  }

  return 'status-pill status-rejected'
}

function FieldBlock({ title, children }) {
  if (!children) {
    return null
  }

  return (
    <div className="field-block">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}

export default function OwnerDashboard({ onBack }) {
  const [questions, setQuestions] = useState([])
  const [filter, setFilter] = useState('open')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [plusCodes, setPlusCodes] = useState([])
  const [plusCodeMessage, setPlusCodeMessage] = useState('')
  const [plusCodeLoading, setPlusCodeLoading] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editRu, setEditRu] = useState('')

  const [manualId, setManualId] = useState(null)
  const [manualRu, setManualRu] = useState('')

  async function loadQuestions() {
    try {
      setLoading(true)
      setMessage('')

      const data = await getOwnerQuestions()
      setQuestions(data)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPlusCodes({ silent = false } = {}) {
    try {
      if (!silent) {
        setPlusCodeMessage('')
      }

      const data = await getPlusInviteCodes()
      setPlusCodes(data)
    } catch (error) {
      if (!silent) {
        setPlusCodeMessage(error.message)
      }
    }
  }

  async function handleCreatePlusCode() {
    try {
      setPlusCodeLoading(true)
      setPlusCodeMessage('')
      const data = await createPlusInviteCode()
      setPlusCodeMessage(`Код создан: ${data.code}`)
      await loadPlusCodes({ silent: true })
    } catch (error) {
      setPlusCodeMessage(error.message)
    } finally {
      setPlusCodeLoading(false)
    }
  }

  async function handleCopyPlusCode(code) {
    await navigator.clipboard.writeText(code)
    setPlusCodeMessage('Код скопирован.')
  }

  async function handleOwnerAction({
    questionId,
    action,
    finalAnswerRu,
  }) {
    try {
      setActionLoadingId(questionId)
      setMessage('')

      const result = await ownerAction({
        questionId,
        action,
        finalAnswerRu,
      })

      setEditingId(null)
      setManualId(null)
      setEditRu('')
      setManualRu('')

      await loadQuestions()

      if (result.status === 'approved') {
        setMessage('AI-ответ утверждён.')
      }

      if (result.status === 'edited') {
        setMessage('Отредактированный ответ сохранён. Китайский перевод создан автоматически.')
      }

      if (result.status === 'manual_reply') {
        setMessage('Личный ответ сохранён. Китайский перевод создан автоматически.')
      }

      if (result.status === 'rejected') {
        setMessage('Вопрос отклонён.')
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setActionLoadingId(null)
    }
  }

  function startEditing(question) {
    setManualId(null)
    setManualRu('')

    setEditingId(question.id)
    setEditRu(question.draft_ru || '')
  }

  function startManualReply(question) {
    setEditingId(null)
    setEditRu('')

    setManualId(question.id)
    setManualRu('')
  }

  useEffect(() => {
    loadQuestions()
    loadPlusCodes({ silent: true })
  }, [])

  const filteredQuestions = useMemo(() => {
    if (filter === 'all') {
      return questions
    }

    if (filter === 'open') {
      return questions.filter((question) => !closedStatuses.includes(question.status))
    }

    if (filter === 'urgent') {
      return questions.filter((question) => question.urgency_level === 'urgent')
    }

    if (filter === 'important') {
      return questions.filter((question) => question.final_importance === 'high')
    }

    if (filter === 'ai_error') {
      return questions.filter((question) => question.status === 'ai_error')
    }

    if (filter === 'closed') {
      return questions.filter((question) => closedStatuses.includes(question.status))
    }

    return questions
  }, [questions, filter])

  const filters = [
    ['all', 'Все вопросы'],
    ['open', 'Открытые'],
    ['urgent', 'Срочные'],
    ['important', 'Важные'],
    ['ai_error', 'Ошибки AI'],
    ['closed', 'Закрытые'],
  ]

  return (
    <div className="page-stack">


      <OwnerChatPanel />

      <section className="dashboard-card">
        <div className="sup-header" style={{ marginBottom: '16px' }}>
          <div>
            <h3>Пользователи+</h3>
            <p>Одноразовые коды для выдачи доступа user_plus через Telegram-команду kodPlus.</p>
          </div>
          <div className="toolbar">
            <button type="button" onClick={handleCreatePlusCode} disabled={plusCodeLoading}>
              {plusCodeLoading ? 'Создаём...' : 'Создать код Пользователь+'}
            </button>
            <button className="secondary" type="button" onClick={() => loadPlusCodes()}>
              Обновить коды
            </button>
          </div>
        </div>

        {plusCodeMessage && <p className="notice" style={{ marginBottom: '14px' }}>{plusCodeMessage}</p>}

        <div className="sup-mini-list">
          {plusCodes.length === 0 && (
            <p className="notice">Кодов Пользователь+ пока нет.</p>
          )}

          {plusCodes.map((code) => (
            <div className="sup-row" key={code.id}>
              <div>
                <strong>{code.code}</strong>
                <small>Создан: {formatDateTime(code.created_at)} · Действует до: {formatDateTime(code.expires_at)}</small>
                <small>Создал: {getProfileName(code.created_by_profile)}</small>
                <small>Использовал: {code.used_by_profile ? getProfileName(code.used_by_profile) : '—'}</small>
              </div>
              <div className="sup-row-actions">
                <span className={getPlusCodeBadgeClass(code.status)}>
                  {plusCodeStatusLabels[code.status] || code.status}
                </span>
                <button className="secondary" type="button" onClick={() => handleCopyPlusCode(code.code)}>
                  Скопировать
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-card">
        <div className="filter-pills">
          {filters.map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="toolbar" style={{ marginTop: '18px' }}>
          <button onClick={loadQuestions}>
            Обновить список
          </button>

          <button className="secondary" onClick={onBack}>
            Вернуться в профиль
          </button>
        </div>
      </section>

      {loading && <p className="notice">Загрузка вопросов...</p>}
      {message && <p className="notice">{message}</p>}

      {!loading && filteredQuestions.length === 0 && (
        <p className="notice">Вопросов в этом разделе пока нет.</p>
      )}

      <div className="question-grid">
        {filteredQuestions.map((question) => {
          const isClosed = closedStatuses.includes(question.status)
          const canEdit = question.status === 'draft_ready'
          const canManualReply = !isClosed
          const canReject = !isClosed

          return (
            <article key={question.id} className="question-card">
              <div>
                <h3>Вопрос</h3>
                <div className="question-meta" style={{ marginTop: '12px' }}>
                  <span className={getBadgeClass(question.urgency_level)}>
                    {getUrgencyLabel(question.urgency_level)}
                  </span>
                  <span className={getImportanceBadgeClass(question.final_importance)}>
                    {getImportanceLabel(question.final_importance)}
                  </span>
                  <span className={getBadgeClass(question.status)}>
                    {getStatusLabel(question.status)}
                  </span>
                </div>
              </div>

              <div className="question-meta">
                <span className="badge">
                  {question.user_profile?.name || question.user_profile?.public_id || 'Пользователь'}
                </span>
                {question.user_profile?.email && (
                  <span className="badge">
                    {question.user_profile.email}
                  </span>
                )}
                <span className={question.user_profile?.is_important_contact ? 'badge dark' : 'badge'}>
                  Важный контакт: {question.user_profile?.is_important_contact ? 'Да' : 'Нет'}
                </span>
              </div>

              <FieldBlock title="Текст вопроса">
                {question.question_text}
              </FieldBlock>

              {question.ai_reason && (
                <FieldBlock title="Причина AI">
                  {question.ai_reason}
                </FieldBlock>
              )}

              {question.draft_ru && (
                <FieldBlock title="AI-черновик RU">
                  {question.draft_ru}
                </FieldBlock>
              )}

              {question.draft_zh && (
                <FieldBlock title="AI-черновик ZH">
                  {question.draft_zh}
                </FieldBlock>
              )}

              {question.final_answer_ru && (
                <FieldBlock title="Финальный ответ RU">
                  {question.final_answer_ru}
                </FieldBlock>
              )}

              {question.final_answer_zh && (
                <FieldBlock title="Финальный ответ ZH">
                  {question.final_answer_zh}
                </FieldBlock>
              )}

              {question.ai_error_message && (
                <FieldBlock title="Ошибка AI">
                  {question.ai_error_message}
                </FieldBlock>
              )}

              {!isClosed && (
                <div className="button-row">
                  {question.status === 'draft_ready' && (
                    <button
                      onClick={() =>
                        handleOwnerAction({
                          questionId: question.id,
                          action: 'approve',
                        })
                      }
                      disabled={actionLoadingId === question.id}
                    >
                      {actionLoadingId === question.id ? 'Обработка...' : 'Утвердить AI-ответ'}
                    </button>
                  )}

                  {canEdit && (
                    <button
                      className="secondary"
                      onClick={() => startEditing(question)}
                      disabled={actionLoadingId === question.id}
                    >
                      Редактировать
                    </button>
                  )}

                  {canManualReply && (
                    <button
                      className="secondary"
                      onClick={() => startManualReply(question)}
                      disabled={actionLoadingId === question.id}
                    >
                      Ответить лично
                    </button>
                  )}

                  {canReject && (
                    <button
                      className="danger-outline"
                      onClick={() =>
                        handleOwnerAction({
                          questionId: question.id,
                          action: 'reject',
                        })
                      }
                      disabled={actionLoadingId === question.id}
                    >
                      Отклонить
                    </button>
                  )}
                </div>
              )}

              {editingId === question.id && (
                <div className="owner-edit-box">
                  <h4>Редактировать AI-ответ</h4>
                  <label>
                    <strong>Ответ RU</strong>
                  </label>
                  <textarea
                    value={editRu}
                    onChange={(event) => setEditRu(event.target.value)}
                    rows="5"
                  />
                  <p className="notice">
                    Китайский перевод будет создан автоматически после сохранения.
                  </p>

                  <div className="button-row">
                    <button
                      onClick={() =>
                        handleOwnerAction({
                          questionId: question.id,
                          action: 'edit',
                          finalAnswerRu: editRu,
                        })
                      }
                      disabled={actionLoadingId === question.id}
                    >
                      Сохранить и закрыть
                    </button>

                    <button
                      className="secondary"
                      onClick={() => {
                        setEditingId(null)
                        setEditRu('')
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              {manualId === question.id && (
                <div className="owner-edit-box">
                  <h4>Личный ответ Бударина</h4>
                  <label>
                    <strong>Ответ RU</strong>
                  </label>
                  <textarea
                    value={manualRu}
                    onChange={(event) => setManualRu(event.target.value)}
                    placeholder="Введите личный ответ на русском"
                    rows="5"
                  />
                  <p className="notice">
                    Китайский перевод будет создан автоматически после сохранения.
                  </p>

                  <div className="button-row">
                    <button
                      onClick={() =>
                        handleOwnerAction({
                          questionId: question.id,
                          action: 'manual_reply',
                          finalAnswerRu: manualRu,
                        })
                      }
                      disabled={actionLoadingId === question.id}
                    >
                      Сохранить личный ответ
                    </button>

                    <button
                      className="secondary"
                      onClick={() => {
                        setManualId(null)
                        setManualRu('')
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
