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

function getMessageStyle(role) {
  if (role === 'owner') {
    return {
      justifySelf: 'end',
      background: '#eef6ff',
      border: '1px solid #b9dcff',
    }
  }

  if (role === 'ai') {
    return {
      justifySelf: 'center',
      background: '#f5f5f5',
      border: '1px solid #ddd',
    }
  }

  return {
    justifySelf: 'start',
    background: '#fff7e8',
    border: '1px solid #ead3a6',
  }
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
    <div>
      <h2>Чат с дворецким</h2>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={loadChat} disabled={loading}>
          Обновить чат
        </button>

        <button onClick={onBack}>
          Вернуться в профиль
        </button>
      </div>

      {loading && <p>Загрузка чата...</p>}

      {statusMessage && <p>{statusMessage}</p>}

      {!loading && sortedMessages.length === 0 && (
        <p>Сообщений пока нет</p>
      )}

      <div
        style={{
          display: 'grid',
          gap: '10px',
          marginBottom: '20px',
        }}
      >
        {sortedMessages.map((message) => (
          <article
            key={message.id}
            style={{
              ...getMessageStyle(message.sender_role),
              width: 'min(100%, 460px)',
              borderRadius: '8px',
              padding: '10px 12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
              <strong>{roleLabels[message.sender_role] || message.sender_role}</strong>
              <span style={{ color: '#666', fontSize: '12px' }}>
                {formatTime(message.created_at)}
              </span>
            </div>

            {message.sender_role === 'user' && (
              <div style={{ color: '#765400', fontSize: '12px', marginBottom: '6px' }}>
                {importanceLabels[message.importance] || message.importance}
              </div>
            )}

            <div style={{ whiteSpace: 'pre-wrap' }}>
              {message.body}
            </div>

            {message.body_zh && (
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '8px', color: '#555' }}>
                {message.body_zh}
              </div>
            )}
          </article>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          <strong>Новое сообщение</strong>
        </label>
        <textarea
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          rows="5"
          placeholder="Напишите сообщение владельцу"
          style={{ width: '100%', marginTop: '8px', marginBottom: '12px' }}
        />

        <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
          <label>
            <strong>Важность</strong>
            <br />
            <select
              value={importance}
              onChange={(event) => setImportance(event.target.value)}
              style={{ marginTop: '8px' }}
            >
              <option value="normal">Обычное</option>
              <option value="important">Важное</option>
              <option value="urgent">Срочное</option>
            </select>
          </label>

          <button type="submit" disabled={sending}>
            {sending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </form>
    </div>
  )
}
