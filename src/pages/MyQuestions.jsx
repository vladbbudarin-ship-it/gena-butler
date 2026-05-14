import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteChat,
  deleteMessage,
  getDirectChat,
  getDirectChats,
  getMyChat,
  getMyProfile,
  sendDirectMessage,
  startDirectChat,
  submitQuestion,
  uploadChatMessageFile,
} from '../lib/api'
import AttachmentList from '../components/AttachmentList'

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

const questionStatusLabels = {
  ai_processing: 'AI обрабатывает',
  draft_ready: 'Ожидает проверки Бударина',
  approved: 'Ответ получен',
  edited: 'Ответ получен',
  manual_reply: 'Ответ получен',
  rejected: 'Вопрос отклонён',
  ai_error: 'Ошибка AI',
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

function isNearBottom(element) {
  if (!element) {
    return true
  }

  return element.scrollHeight - element.scrollTop - element.clientHeight < 96
}

function scrollToBottom(element) {
  if (!element) {
    return
  }

  element.scrollTop = element.scrollHeight
}

function getDirectChatTitle(conversation) {
  return conversation?.other_user?.name
    || conversation?.other_user?.public_id
    || conversation?.title
    || 'Пользователь'
}

function getQuestionStatusLabel(status) {
  return questionStatusLabels[status] || ''
}

export default function MyQuestions({ onBack }) {
  const [profile, setProfile] = useState(null)
  const [ownerConversation, setOwnerConversation] = useState(null)
  const [directConversations, setDirectConversations] = useState([])
  const [selectedChat, setSelectedChat] = useState({ type: 'owner', id: 'owner' })
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [urgency, setUrgency] = useState('normal')
  const [publicIdInput, setPublicIdInput] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [startingChat, setStartingChat] = useState(false)
  const messageTextareaRef = useRef(null)
  const chatScrollRef = useRef(null)
  const selectedChatRef = useRef(selectedChat)

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
      title: getDirectChatTitle(conversation),
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
    : activeChatItem?.title || 'Пользователь'

  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

  const loadChatList = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setStatusMessage('')
    }

    const [profileData, ownerData, directData] = await Promise.all([
      getMyProfile(),
      getMyChat(),
      getDirectChats(),
    ])

    setProfile(profileData)
    setOwnerConversation(ownerData.conversation)
    setDirectConversations(directData)
  }, [])

  const loadSelectedChat = useCallback(async (
    chat = selectedChatRef.current,
    { silent = false } = {}
  ) => {
    if (!chat) {
      return
    }

    if (!silent) {
      setLoading(true)
      setStatusMessage('')
    }

    const shouldScrollToBottom = isNearBottom(chatScrollRef.current)

    if (chat.type === 'owner') {
      const data = await getMyChat()
      setOwnerConversation(data.conversation)
      setMessages(data.messages || [])
      if (shouldScrollToBottom) {
        requestAnimationFrame(() => scrollToBottom(chatScrollRef.current))
      }
      if (!silent) {
        setLoading(false)
      }
      return
    }

    const data = await getDirectChat(chat.id)
    if (data.conversation) {
      setDirectConversations((current) => {
        const exists = current.some((conversation) => conversation.id === data.conversation.id)

        if (!exists) {
          return [data.conversation, ...current]
        }

        return current.map((conversation) => (
          conversation.id === data.conversation.id
            ? { ...conversation, ...data.conversation }
            : conversation
        ))
      })
    }
    setMessages(data.messages || [])
    if (shouldScrollToBottom) {
      requestAnimationFrame(() => scrollToBottom(chatScrollRef.current))
    }
    if (!silent) {
      setLoading(false)
    }
  }, [])

  const refreshAll = useCallback(async (
    chat = selectedChatRef.current,
    { silent = false } = {}
  ) => {
    try {
      if (!silent) {
        setLoading(true)
        setStatusMessage('')
      }

      await loadChatList({ silent })
      await loadSelectedChat(chat, { silent: true })
    } catch (error) {
      if (!silent) {
        setStatusMessage(error.message)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [loadChatList, loadSelectedChat])

  async function handleStartDirectChat(event) {
    event.preventDefault()
    setStatusMessage('')

    try {
      setStartingChat(true)

      const conversation = await startDirectChat(publicIdInput)
      setPublicIdInput('')
      setSelectedChat({ type: 'direct', id: conversation.id })
      await loadChatList({ silent: true })
      await refreshAll({ type: 'direct', id: conversation.id })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setStartingChat(false)
    }
  }

  async function handleDeleteSelectedChat() {
    if (selectedChat.type !== 'direct') {
      return
    }

    if (!window.confirm('Удалить чат из списка?')) {
      return
    }

    try {
      setStatusMessage('')
      await deleteChat(selectedChat.id)
      setSelectedChat({ type: 'owner', id: 'owner' })
      setMessages([])
      await loadChatList({ silent: true })
      await loadSelectedChat({ type: 'owner', id: 'owner' }, { silent: true })
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  async function handleDeleteMessage(messageId) {
    try {
      setStatusMessage('')
      await deleteMessage(messageId)
      await loadSelectedChat(selectedChatRef.current, { silent: true })
      await loadChatList({ silent: true })
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  async function uploadSelectedFiles({ messageId, conversationId }) {
    if (!selectedFiles.length || !messageId || !conversationId) {
      return
    }

    for (const file of selectedFiles) {
      await uploadChatMessageFile({
        messageId,
        conversationId,
        file,
      })
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
        const result = await submitQuestion({
          questionText: messageText,
          urgencyLevel: urgency,
        })

        await uploadSelectedFiles({
          messageId: result.message_id,
          conversationId: result.conversation_id || ownerConversation?.id,
        })

        setMessageText('')
        setSelectedFiles([])
        resizeComposerTextarea(messageTextareaRef.current)
        setUrgency('normal')
        await refreshAll({ type: 'owner', id: 'owner' })
        return
      }

      const result = await sendDirectMessage({
        conversationId: selectedChat.id,
        body: messageText,
      })

      await uploadSelectedFiles({
        messageId: result.message?.id,
        conversationId: result.message?.conversation_id || selectedChat.id,
      })

      setMessageText('')
      setSelectedFiles([])
      resizeComposerTextarea(messageTextareaRef.current)
      await loadSelectedChat(selectedChatRef.current, { silent: true })
      await loadChatList({ silent: true })
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

  function handleFileChange(event) {
    setSelectedFiles(Array.from(event.target.files || []))
  }

  useEffect(() => {
    refreshAll({ type: 'owner', id: 'owner' })
  }, [refreshAll])

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadChatList({ silent: true }).catch(() => {})
    }, 5000)

    return () => clearInterval(intervalId)
  }, [loadChatList])

  useEffect(() => {
    loadSelectedChat(selectedChat, { silent: false }).catch((error) => {
      setStatusMessage(error.message)
      setLoading(false)
    })

    const intervalId = setInterval(() => {
      loadSelectedChat(selectedChat, { silent: true }).catch(() => {})
    }, 3000)

    return () => clearInterval(intervalId)
  }, [selectedChat, loadSelectedChat])

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
                    }}
                  >
                    <span className="mini-avatar" />
                    <span className="chat-list-copy">
                      <strong>{chat.title}</strong>
                      <span>{chat.subtitle}</span>
                      {chat.last_message && (
                        <small>{chat.last_message.deleted_at ? 'Сообщение удалено' : chat.last_message.body}</small>
                      )}
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
                <h3>{activeChatTitle || 'Пользователь'}</h3>
                {selectedChat.type === 'direct' && activeChatItem?.subtitle && (
                  <p>{activeChatItem.subtitle}</p>
                )}
              </div>

              <div className="toolbar">
                {selectedChat.type === 'direct' && (
                  <button className="danger ghost" type="button" onClick={handleDeleteSelectedChat}>
                    Удалить чат
                  </button>
                )}
                <button onClick={() => refreshAll(selectedChat)} disabled={loading}>
                  Обновить чат
                </button>
                <button className="secondary" onClick={onBack}>
                  Вернуться в профиль
                </button>
              </div>
            </div>

            <div className="chat-scroll" ref={chatScrollRef}>
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

                    <div className={message.deleted_at ? 'deleted-message' : ''}>
                      {message.deleted_at ? 'Сообщение удалено' : message.body}
                    </div>

                    {!message.deleted_at && message.body_zh && (
                      <div style={{ marginTop: '10px' }}>
                        {message.body_zh}
                      </div>
                    )}

                    {!message.deleted_at && selectedChat.type === 'owner' && message.sender_role === 'user' && message.question_status && (
                      <div className="question-status-badge">
                        {getQuestionStatusLabel(message.question_status)}
                      </div>
                    )}

                    {!message.deleted_at && (
                      <AttachmentList
                        files={message.attachments || []}
                        kind="chat_message"
                        canDelete={(file) => file.uploaded_by === profile?.id}
                        onChanged={async () => {
                          await loadSelectedChat(selectedChatRef.current, { silent: true })
                          await loadChatList({ silent: true })
                        }}
                      />
                    )}

                    {!message.deleted_at && message.sender_id === profile?.id && (
                      <button
                        className="message-delete-button"
                        type="button"
                        onClick={() => handleDeleteMessage(message.id)}
                      >
                        Удалить
                      </button>
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
                      className={`importance-pill secondary urgency-${value} ${urgency === value ? 'active' : ''}`}
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

              <div className="file-control-row">
                <label className="file-control">
                  Файл
                  <input type="file" multiple onChange={handleFileChange} disabled={sending} />
                </label>
                {selectedFiles.length > 0 && (
                  <div className="selected-files">
                    {selectedFiles.map((file) => (
                      <span key={`${file.name}:${file.size}`}>{file.name}</span>
                    ))}
                  </div>
                )}
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
