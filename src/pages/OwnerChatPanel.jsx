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

function getConversationAccent(conversation) {
  const importance = conversation.last_message?.importance

  if (importance === 'urgent') {
    return {
      borderColor: '#cf3f35',
      background: '#fff1f0',
    }
  }

  if (importance === 'important') {
    return {
      borderColor: '#d9a400',
      background: '#fff9e6',
    }
  }

  return {}
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
    <section style={{ marginBottom: '28px' }}>
      <h3>Чаты с пользователями</h3>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={loadConversations} disabled={loadingList}>
          Обновить диалоги
        </button>

        <button onClick={refreshCurrentChat} disabled={!selectedConversationId || loadingChat}>
          Обновить чат
        </button>
      </div>

      {message && <p>{message}</p>}

      {loadingList && <p>Загрузка диалогов...</p>}

      {!loadingList && conversations.length === 0 && (
        <p>Диалогов пока нет</p>
      )}

      {conversations.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'grid', gap: '8px' }}>
            {conversations.map((conversation) => {
              const profile = conversation.user_profile || {}
              const isSelected = conversation.id === selectedConversationId
              const accent = getConversationAccent(conversation)

              return (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  style={{
                    textAlign: 'left',
                    border: isSelected ? '2px solid #333' : '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '10px',
                    ...accent,
                  }}
                >
                  <strong>{profile.name || 'Без имени'}</strong>
                  <br />
                  <span>{profile.email || 'email не найден'}</span>
                  {conversation.unread_count > 0 && (
                    <div style={{ marginTop: '6px' }}>
                      Непрочитано: {conversation.unread_count}
                    </div>
                  )}
                  {conversation.last_message && (
                    <div style={{ marginTop: '8px', color: '#555' }}>
                      <span>{conversation.last_message.body}</span>
                      <br />
                      <small>
                        {importanceLabels[conversation.last_message.importance] || conversation.last_message.importance}
                        {' · '}
                        {formatTime(conversation.last_message.created_at)}
                      </small>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div>
            {loadingChat && <p>Загрузка чата...</p>}

            {!loadingChat && selectedConversation && (
              <>
                <h4>
                  {selectedConversation.user_profile?.name || 'Пользователь'} ·{' '}
                  {selectedConversation.user_profile?.email || 'email не найден'}
                </h4>

                {sortedMessages.length === 0 && (
                  <p>Сообщений пока нет</p>
                )}

                <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
                  {sortedMessages.map((chatMessage) => (
                    <article
                      key={chatMessage.id}
                      style={{
                        ...getMessageStyle(chatMessage.sender_role),
                        width: 'min(100%, 460px)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                        <strong>{roleLabels[chatMessage.sender_role] || chatMessage.sender_role}</strong>
                        <span style={{ color: '#666', fontSize: '12px' }}>
                          {formatTime(chatMessage.created_at)}
                        </span>
                      </div>

                      {chatMessage.sender_role === 'user' && (
                        <div style={{ color: '#765400', fontSize: '12px', marginBottom: '6px' }}>
                          {importanceLabels[chatMessage.importance] || chatMessage.importance}
                        </div>
                      )}

                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {chatMessage.body}
                      </div>

                      {chatMessage.body_zh && (
                        <div style={{ whiteSpace: 'pre-wrap', marginTop: '8px', color: '#555' }}>
                          {chatMessage.body_zh}
                        </div>
                      )}
                    </article>
                  ))}
                </div>

                <form onSubmit={handleSend}>
                  <label>
                    <strong>Ответ владельца</strong>
                  </label>
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    rows="4"
                    placeholder="Напишите ответ пользователю"
                    style={{ width: '100%', marginTop: '8px', marginBottom: '12px' }}
                  />

                  <button type="submit" disabled={sending}>
                    {sending ? 'Отправка...' : 'Отправить'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
