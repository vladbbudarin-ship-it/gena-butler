import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getDirectChat,
  getDirectChats,
  getMyChat,
  getMyProfile,
  sendDirectMessage,
  startDirectChat,
  submitQuestion,
} from '../lib/api'

const urgencyLabels = {
  normal: 'Обычный',
  important: 'Важный',
  urgent: 'Срочный',
}

const roleLabels = {
  user: 'Вы',
  owner: 'Бударин',
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

function getMessageBubbleClass(message, selectedChat, profile) {
  if (selectedChat.type === 'owner') {
    if (message.sender_role === 'owner') {
      return 'message-bubble incoming'
    }

    if (message.sender_role === 'ai') {
      return 'message-bubble neutral'
    }

    return 'message-bubble outgoing'
  }

  return message.sender_id === profile?.id
    ? 'message-bubble outgoing'
    : 'message-bubble incoming'
}

function resizeComposerTextarea(textarea) {
  if (!textarea) {
    return
  }

  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
}

export default function MyQuestions({ onBack }) {
  const [profile, setProfile] = useState(null)
  const [ownerConversation, setOwnerConversation] = useState(null)
  const [directConversations, setDirectConversations] = useState([])
  const [selectedChat, setSelectedChat] = useState({ type: 'owner', id: 'owner' })
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [urgency, setUrgency] = useState('normal')
  const [publicIdInput, setPublicIdInput] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [startingChat, setStartingChat] = useState(false)
  const messageTextareaRef = useRef(null)

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages]
  )

  const chatItems = useMemo(() => [
    {
      id: 'owner',
      type: 'owner',
      title: 'Бударин',
      subtitle: 'AI-вопросы Бударину',
      unread_count: 0,
      last_message: ownerConversation?.last_message || null,
    },
    ...directConversations.map((conversation) => ({
      id: conversation.id,
      type: 'direct',
      title: conversation.title || 'Собеседник',
      subtitle: conversation.other_user?.public_id ? `ID ${conversation.other_user.public_id}` : 'Личный чат',
      unread_count: conversation.unread_count || 0,
      last_message: conversation.last_message || null,
    })),
  ], [directConversations, ownerConversation])

  const activeChatItem = chatItems.find(
    (chat) => selectedChat.type === chat.type && selectedChat.id === chat.id
  )
  const activeChatTitle = selectedChat.type === 'owner'
    ? 'Бударин'
    : activeChatItem?.title || 'Собеседник'

  async function loadChatList() {
    const [profileData, ownerData, directData] = await Promise.all([
      getMyProfile(),
      getMyChat(),
      getDirectChats(),
    ])

    setProfile(profileData)
    setOwnerConversation(ownerData.conversation)
    setDirectConversations(directData)
  }

  async function loadSelectedChat(chat = selectedChat) {
    if (chat.type === 'owner') {
      const data = await getMyChat()
      setOwnerConversation(data.conversation)
      setMessages(data.messages || [])
      return
    }

    const data = await getDirectChat(chat.id)
    setMessages(data.messages || [])
  }

  async function refreshAll(chat = selectedChat) {
    try {
      setLoading(true)
      setStatusMessage('')

      await loadChatList()
      await loadSelectedChat(chat)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleStartDirectChat(event) {
    event.preventDefault()
    setStatusMessage('')

    try {
      setStartingChat(true)

      const conversation = await startDirectChat(publicIdInput)
      setPublicIdInput('')
      setSelectedChat({ type: 'direct', id: conversation.id })
      await refreshAll({ type: 'direct', id: conversation.id })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setStartingChat(false)
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

      if (selectedChat.type === 'owner') {
        await submitQuestion({
          questionText: messageText,
          urgencyLevel: urgency,
        })

        setMessageText('')
        resizeComposerTextarea(messageTextareaRef.current)
        setUrgency('normal')
        await refreshAll({ type: 'owner', id: 'owner' })
        return
      }

      const result = await sendDirectMessage({
        conversationId: selectedChat.id,
        body: messageText,
      })

      setMessages((currentMessages) => [...currentMessages, result.message])
      setMessageText('')
      resizeComposerTextarea(messageTextareaRef.current)
      await refreshAll(selectedChat)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setSending(false)
    }
  }

  function handleMessageTextChange(event) {
    setMessageText(event.target.value)
    resizeComposerTextarea(event.target)
  }

  function handleComposerKeyDown(event) {
    if (
      event.key === 'Enter'
      && !event.shiftKey
      && !event.ctrlKey
      && !event.altKey
      && !event.metaKey
    ) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  useEffect(() => {
    refreshAll({ type: 'owner', id: 'owner' })
    // The initial load should run once; refreshAll depends on active state by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page-stack chat-page">
      <section className="hero-card chat-card">
        <div className="owner-chat-shell">
          <aside className="side-list">
            <div className="chat-list-title">Чаты</div>

            <form className="form-stack" onSubmit={handleStartDirectChat} style={{ marginBottom: '16px' }}>
              <input
                value={publicIdInput}
                onChange={(event) => setPublicIdInput(event.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="ID пользователя"
                inputMode="numeric"
              />
              <button type="submit" disabled={startingChat}>
                {startingChat ? 'Поиск...' : 'Новый чат'}
              </button>
            </form>

            <div className="chat-list">
              {chatItems.map((chat) => {
                const isSelected = selectedChat.type === chat.type && selectedChat.id === chat.id

                return (
                  <button
                    key={`${chat.type}:${chat.id}`}
                    className={`chat-list-item${isSelected ? ' active' : ''}`}
                    onClick={() => {
                      const nextChat = { type: chat.type, id: chat.id }
                      setSelectedChat(nextChat)
                      loadSelectedChat(nextChat)
                    }}
                  >
                    <span className="mini-avatar" />
                    <span className="chat-list-copy">
                      <strong>{chat.title}</strong>
                      <span>{chat.subtitle}</span>
                      {chat.last_message && <small>{chat.last_message.body}</small>}
                    </span>
                    {chat.unread_count > 0 && (
                      <span className="badge red">{chat.unread_count}</span>
                    )}
                  </button>
                )
              })}
            </div>

          </aside>

          <div className="chat-main">
            <div className="chat-topbar">
              <div>
                <h3>{activeChatTitle || 'Без имени'}</h3>
                {selectedChat.type === 'direct' && activeChatItem?.subtitle && (
                  <p>{activeChatItem.subtitle}</p>
                )}
              </div>

              <div className="toolbar">
                <button onClick={() => refreshAll(selectedChat)} disabled={loading}>
                  Обновить чат
                </button>
                <button className="secondary" onClick={onBack}>
                  Вернуться в профиль
                </button>
              </div>
            </div>

            <div className="chat-scroll">
              {statusMessage && <p className="notice danger">{statusMessage}</p>}
              {loading && <p className="status-message">Загрузка чата...</p>}

              {!loading && sortedMessages.length === 0 && (
                <p className="notice">Сообщений пока нет</p>
              )}

              <div className="message-list">
                {sortedMessages.map((message) => (
                  <article key={message.id} className={getMessageBubbleClass(message, selectedChat, profile)}>
                    <div className="message-head">
                      <span>
                        {selectedChat.type === 'direct' && message.sender_id !== profile?.id
                          ? activeChatTitle
                          : roleLabels[message.sender_role] || 'Сообщение'}
                      </span>
                      <span className="message-time">{formatTime(message.created_at)}</span>
                    </div>

                    <div>
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
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              {selectedChat.type === 'owner' && (
                <div className="importance-pills" aria-label="Срочность сообщения">
                  {Object.entries(urgencyLabels).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`importance-pill secondary ${urgency === value ? 'active' : ''} ${value === 'urgent' ? 'urgent' : ''}`}
                      onClick={() => setUrgency(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="composer-row">
                <textarea
                  ref={messageTextareaRef}
                  className="composer-textarea"
                  value={messageText}
                  onChange={handleMessageTextChange}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="текст"
                  rows="1"
                />

                <button className="icon" type="submit" disabled={sending} aria-label="Отправить">
                  →
                </button>
              </div>
            </form>
          </div>

          <aside className="brand-panel chat-brand">
            <img className="brand-logo-vertical" src="/brand/gena-logo-white.png" alt="Гена" />
            <img className="brand-logo-sign" src="/brand/gena-logo-white.png" alt="" aria-hidden="true" />
          </aside>
        </div>
      </section>
    </div>
  )
}
