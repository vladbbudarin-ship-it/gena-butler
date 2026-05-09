import { useEffect, useMemo, useState } from 'react'
import { getOwnerQuestions, ownerAction } from '../lib/api'
import OwnerChatPanel from './OwnerChatPanel'

const closedStatuses = ['approved', 'edited', 'manual_reply', 'rejected']

function getStatusLabel(status) {
  const labels = {
    new: 'Новый',
    ai_processing: 'AI обрабатывает',
    draft_ready: 'Черновик готов',
    approved: 'Утверждён',
    edited: 'Отредактирован',
    manual_reply: 'Личный ответ',
    rejected: 'Отклонён',
    ai_error: 'Ошибка AI',
  }

  return labels[status] || status
}

function getUrgencyLabel(urgency) {
  const labels = {
    normal: 'Обычный',
    important: 'Важный',
    urgent: 'Срочный',
  }

  return labels[urgency] || urgency
}

function getImportanceLabel(importance) {
  const labels = {
    low: 'Низкая',
    medium: 'Средняя',
    high: 'Высокая',
  }

  return labels[importance] || 'Пока нет'
}

export default function OwnerDashboard({ onBack }) {
  const [questions, setQuestions] = useState([])
  const [filter, setFilter] = useState('open')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState(null)

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
  }, [])

  const filteredQuestions = useMemo(() => {
    if (filter === 'all') {
      return questions
    }

    if (filter === 'open') {
      return questions.filter(
        (question) => !closedStatuses.includes(question.status)
      )
    }

    if (filter === 'urgent') {
      return questions.filter(
        (question) => question.urgency_level === 'urgent'
      )
    }

    if (filter === 'important') {
      return questions.filter(
        (question) => question.final_importance === 'high'
      )
    }

    if (filter === 'ai_error') {
      return questions.filter(
        (question) => question.status === 'ai_error'
      )
    }

    if (filter === 'closed') {
      return questions.filter(
        (question) => closedStatuses.includes(question.status)
      )
    }

    return questions
  }, [questions, filter])

  return (
    <div>
      <h2>Кабинет владельца</h2>

      <p>
        Здесь отображаются вопросы пользователей и AI-черновики.
      </p>

      <OwnerChatPanel />

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <button onClick={() => setFilter('all')}>Все вопросы</button>
        <button onClick={() => setFilter('open')}>Открытые</button>
        <button onClick={() => setFilter('urgent')}>Срочные</button>
        <button onClick={() => setFilter('important')}>Важные</button>
        <button onClick={() => setFilter('ai_error')}>Ошибки AI</button>
        <button onClick={() => setFilter('closed')}>Закрытые</button>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button onClick={loadQuestions}>
          Обновить список
        </button>

        <button onClick={onBack}>
          Вернуться в профиль
        </button>
      </div>

      {loading && <p>Загрузка вопросов...</p>}

      {message && <p>{message}</p>}

      {!loading && filteredQuestions.length === 0 && (
        <p>Вопросов в этом разделе пока нет.</p>
      )}

      <div style={{ display: 'grid', gap: '16px' }}>
        {filteredQuestions.map((question) => {
          const isClosed = closedStatuses.includes(question.status)
          const canEdit = question.status === 'draft_ready'
          const canManualReply = !isClosed
          const canReject = !isClosed

          return (
            <article
              key={question.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <h3>Вопрос</h3>

              <p>
                <strong>Пользователь:</strong>{' '}
                {question.user_profile?.name || 'Без имени'} —{' '}
                {question.user_profile?.email || 'email не найден'}
              </p>

              <p>
                <strong>Важный контакт:</strong>{' '}
                {question.user_profile?.is_important_contact ? 'Да' : 'Нет'}
              </p>

              <p>
                <strong>Срочность:</strong>{' '}
                {getUrgencyLabel(question.urgency_level)}
              </p>

              <p>
                <strong>AI-важность:</strong>{' '}
                {getImportanceLabel(question.ai_importance)}
              </p>

              <p>
                <strong>Итоговая важность:</strong>{' '}
                {getImportanceLabel(question.final_importance)}
              </p>

              <p>
                <strong>Статус:</strong>{' '}
                {getStatusLabel(question.status)}
              </p>

              <p>
                <strong>Текст вопроса:</strong>
                <br />
                {question.question_text}
              </p>

              {question.ai_reason && (
                <p>
                  <strong>Причина AI:</strong>
                  <br />
                  {question.ai_reason}
                </p>
              )}

              {question.draft_ru && (
                <p>
                  <strong>AI-черновик RU:</strong>
                  <br />
                  {question.draft_ru}
                </p>
              )}

              {question.draft_zh && (
                <p>
                  <strong>AI-черновик ZH:</strong>
                  <br />
                  {question.draft_zh}
                </p>
              )}

              {question.final_answer_ru && (
                <p>
                  <strong>Финальный ответ RU:</strong>
                  <br />
                  {question.final_answer_ru}
                </p>
              )}

              {question.final_answer_zh && (
                <p>
                  <strong>Финальный ответ ZH:</strong>
                  <br />
                  {question.final_answer_zh}
                </p>
              )}

              {question.ai_error_message && (
                <p>
                  <strong>Ошибка AI:</strong>
                  <br />
                  {question.ai_error_message}
                </p>
              )}

              {!isClosed && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
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
                      onClick={() => startEditing(question)}
                      disabled={actionLoadingId === question.id}
                    >
                      Редактировать
                    </button>
                  )}

                  {canManualReply && (
                    <button
                      onClick={() => startManualReply(question)}
                      disabled={actionLoadingId === question.id}
                    >
                      Ответить лично
                    </button>
                  )}

                  {canReject && (
                    <button
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
                <div style={{ marginTop: '16px' }}>
                  <h4>Редактировать AI-ответ</h4>

                  <label>
                    <strong>Ответ RU</strong>
                  </label>
                  <textarea
                    value={editRu}
                    onChange={(event) => setEditRu(event.target.value)}
                    rows="5"
                    style={{ width: '100%', marginTop: '8px', marginBottom: '12px' }}
                  />

                  <p>
                    Китайский перевод будет создан автоматически после сохранения.
                  </p>

                  <div style={{ display: 'flex', gap: '12px' }}>
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
                <div style={{ marginTop: '16px' }}>
                  <h4>Личный ответ владельца</h4>

                  <label>
                    <strong>Ответ RU</strong>
                  </label>
                  <textarea
                    value={manualRu}
                    onChange={(event) => setManualRu(event.target.value)}
                    placeholder="Введите личный ответ на русском"
                    rows="5"
                    style={{ width: '100%', marginTop: '8px', marginBottom: '12px' }}
                  />

                  <p>
                    Китайский перевод будет создан автоматически после сохранения.
                  </p>

                  <div style={{ display: 'flex', gap: '12px' }}>
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
