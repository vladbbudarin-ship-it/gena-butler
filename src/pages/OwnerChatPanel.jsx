import { useCallback, useEffect, useMemo, useState } from 'react'
import { getOwnerChat, getOwnerChats, sendChatMessage } from '../lib/api'

const importanceLabels = {
  normal: 'Обычное',
  important: 'Важное',
  urgent: 'Срочное',
}

const roleLabels = {
  user: 'Пользователь',
  owner: 'Владелец',
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
    return 'message-bubble outgoing'
  }

  if (role === 'ai') {
    return 'message-bubble neutral'
  }

  return 'message-bubble incoming'
}

function getConversationClass(conversation, isSelected) {
  const parts = ['chat-list-item']

  if (isSelected) {
    parts.push('active')
  }

  if (conversation.last_message?.importance === 'urgent') {
    parts.push('urgent')
  }

  if (conversation.last_message?.importance === 'important') {
    parts.push('important')
  }

  return parts.join(' ')
}

export default function OwnerChatPanel() {
  const [conversations, setConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState(null)
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [replyText, setReplyText] = useState('')
  const [message, setMessage] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingChat, setLoadingChat] = useState(false)
  const [sending, setSending] = useState(false)

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages]
  )

  const loadConversations = useCallback(async () => {
    try {
      setLoadingList(true)
      setMessage('')

      const data = await getOwnerChats()
      setConversations(data)

      if (!selectedConversationId && data.length > 0) {
        setSelectedConversationId(data[0].id)
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingList(false)
    }
  }, [selectedConversationId])

  const loadSelectedConversation = useCallback(async (conversationId = selectedConversationId) => {
    if (!conversationId) {
      setSelectedConversation(null)
      setMessages([])
      return
    }

    try {
      setLoadingChat(true)
      setMessage('')

      const data = await getOwnerChat(conversationId)
      setSelectedConversation(data.conversation)
      setMessages(data.messages || [])
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingChat(false)
    }
  }, [selectedConversationId])

  async function refreshCurrentChat() {
    await loadSelectedConversation()
    await loadConversations()
  }

  async function handleSend(event) {
    event.preventDefault()
    setMessage('')

    if (!selectedConversationId) {
      setMessage('Выберите диалог.')
      return
    }

    if (!replyText.trim()) {
      setMessage('Введите текст ответа.')
      return
    }

    try {
      setSending(true)

      const result = await sendChatMessage({
        conversationId: selectedConversationId,
        senderRole: 'owner',
        body: replyText,
        importance: 'normal',
      })

      setMessages((currentMessages) => [...currentMessages, result.message])
      setReplyText('')
      await refreshCurrentChat()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    loadSelectedConversation(selectedConversationId)
  }, [loadSelectedConversation, selectedConversationId])

  return (
    <section className="hero-card">
      <div className="owner-chat-shell">
        <aside className="side-list">
          <div className="chat-list-title">Чаты</div>

          <div className="toolbar" style={{ marginBottom: '16px' }}>
            <button onClick={loadConversations} disabled={loadingList}>
              Обновить
            </button>
          </div>

          {loadingList && <p>Загрузка диалогов...</p>}
          {!loadingList && conversations.length === 0 && <p>Диалогов пока нет</p>}

          <div className="chat-list">
            {conversations.map((conversation) => {
              const profile = conversation.user_profile || {}
              const isSelected = conversation.id === selectedConversationId

              return (
                <button
                  key={conversation.id}
                  className={getConversationClass(conversation, isSelected)}
                  onClick={() => setSelectedConversationId(conversation.id)}
                >
                  <span className="mini-avatar" />
                  <span className="chat-list-copy">
                    <strong>{profile.name || 'Без имени'}</strong>
                    <span>{profile.email || 'email не найден'}</span>
                    {conversation.last_message && (
                      <small>
                        {importanceLabels[conversation.last_message.importance] || conversation.last_message.importance}
                        {' · '}
                        {conversation.last_message.body}
                      </small>
                    )}
                  </span>
                  {conversation.unread_count > 0 && (
                    <span className="badge red">{conversation.unread_count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        <div className="chat-main">
          <div className="toolbar">
            <button onClick={refreshCurrentChat} disabled={!selectedConversationId || loadingChat}>
              Обновить чат
            </button>
          </div>

          {message && <p className="notice danger">{message}</p>}
          {loadingChat && <p>Загрузка чата...</p>}

          {!loadingChat && selectedConversation && (
            <>
              <h3>
                {selectedConversation.user_profile?.name || 'Пользователь'}
              </h3>
              <p>{selectedConversation.user_profile?.email || 'email не найден'}</p>

              {sortedMessages.length === 0 && <p className="notice">Сообщений пока нет</p>}

              <div className="message-list">
                {sortedMessages.map((chatMessage) => (
                  <article key={chatMessage.id} className={getBubbleClass(chatMessage.sender_role)}>
                    <div className="message-head">
                      <span>{roleLabels[chatMessage.sender_role] || chatMessage.sender_role}</span>
                      <span className="message-time">{formatTime(chatMessage.created_at)}</span>
                    </div>

                    {chatMessage.sender_role === 'user' && (
                      <span className={`badge ${chatMessage.importance === 'urgent' ? 'red' : ''}`}>
                        {importanceLabels[chatMessage.importance] || chatMessage.importance}
                      </span>
                    )}

                    <div style={{ marginTop: chatMessage.sender_role === 'user' ? '10px' : 0 }}>
                      {chatMessage.body}
                    </div>

                    {chatMessage.body_zh && (
                      <div style={{ marginTop: '10px' }}>
                        {chatMessage.body_zh}
                      </div>
                    )}
                  </article>
                ))}
              </div>

              <form className="composer" onSubmit={handleSend}>
                <div className="composer-row">
                  <input
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="текст"
                  />

                  <button className="icon" type="submit" disabled={sending} aria-label="Отправить">
                    →
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <aside className="brand-panel chat-brand">
          <div className="brand-avatar" />
          <div className="brand-vertical">ГЕНА</div>
          <div className="brand-sign">Буb</div>
        </aside>
      </div>
    </section>
  )
}
