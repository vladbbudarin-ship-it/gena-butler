import { useEffect, useMemo, useState } from 'react'
import { getMyChat, sendChatMessage } from '../lib/api'

const importanceLabels = {
  normal: 'Обычное',
  important: 'Важное',
  urgent: 'Срочное',
}

const roleLabels = {
  user: 'Вы',
  owner: 'Дворецкий',
  ai: 'AI',
}

function formatTime(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getBubbleClass(role) {
  if (role === 'owner') {
    return 'message-bubble incoming'
  }

  if (role === 'ai') {
    return 'message-bubble neutral'
  }

  return 'message-bubble outgoing'
}

export default function MyQuestions({ onBack }) {
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [importance, setImportance] = useState('normal')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages]
  )

  async function loadChat() {
    try {
      setLoading(true)
      setStatusMessage('')

      const data = await getMyChat()
      setConversation(data.conversation)
      setMessages(data.messages || [])
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setStatusMessage('')

    if (!messageText.trim()) {
      setStatusMessage('Введите текст сообщения.')
      return
    }

    try {
      setSending(true)

      const result = await sendChatMessage({
        body: messageText,
        importance,
      })

      if (!conversation && result.conversation) {
        setConversation(result.conversation)
      }

      setMessages((currentMessages) => [...currentMessages, result.message])
      setMessageText('')
      setImportance('normal')
      await loadChat()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    loadChat()
  }, [])

  return (
    <div className="page-stack">
      <section className="hero-card black">
        <h2>Чат с дворецким</h2>
        <p>Одна приватная переписка: вопросы, ответы владельца и продолжение диалога.</p>
      </section>

      <section className="chat-panel">
        <div className="toolbar" style={{ marginBottom: '18px' }}>
          <button onClick={loadChat} disabled={loading}>
            Обновить чат
          </button>

          <button className="secondary" onClick={onBack}>
            Вернуться в профиль
          </button>
        </div>

        {loading && <p className="status-message">Загрузка чата...</p>}

        {statusMessage && <p className="notice danger">{statusMessage}</p>}

        {!loading && sortedMessages.length === 0 && (
          <p className="notice">Сообщений пока нет</p>
        )}

        <div className="message-list">
          {sortedMessages.map((message) => (
            <article key={message.id} className={getBubbleClass(message.sender_role)}>
              <div className="message-head">
                <span>{roleLabels[message.sender_role] || message.sender_role}</span>
                <span className="message-time">{formatTime(message.created_at)}</span>
              </div>

              {message.sender_role === 'user' && (
                <span className={`badge ${message.importance === 'urgent' ? 'red' : ''}`}>
                  {importanceLabels[message.importance] || message.importance}
                </span>
              )}

              <div style={{ marginTop: message.sender_role === 'user' ? '10px' : 0 }}>
                {message.body}
              </div>

              {message.body_zh && (
                <div style={{ marginTop: '10px' }}>
                  {message.body_zh}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <div className="importance-pills" aria-label="Важность сообщения">
          {Object.entries(importanceLabels).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`importance-pill secondary ${importance === value ? 'active' : ''} ${value === 'urgent' ? 'urgent' : ''}`}
              onClick={() => setImportance(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="composer-row">
          <input
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder="текст"
          />

          <button className="icon" type="submit" disabled={sending} aria-label="Отправить">
            →
          </button>
        </div>
      </form>
    </div>
  )
}
