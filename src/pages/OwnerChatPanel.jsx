import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteMessage, getOwnerChat, getOwnerChats, sendChatMessage } from '../lib/api'

const roleLabels = {
  user: 'Пользователь',
  owner: 'Бударин',
  ai: 'AI',
}

const finalImportanceLabels = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
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

function getFinalImportanceLabel(importance) {
  return finalImportanceLabels[importance] || 'Пока нет'
}

function getFinalImportanceBadgeClass(importance) {
  return `importance-badge importance-${importance || 'none'}`
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

function getProfileTitle(profile) {
  return profile?.name || profile?.public_id || 'Пользователь'
}

function getConversationClass(conversation, isSelected) {
  const parts = ['chat-list-item']
  const lastImportance = conversation.last_message?.importance

  if (isSelected) {
    parts.push('active')
  }

  if (lastImportance === 'urgent') {
    parts.push('urgent')
  }

  if (lastImportance === 'important') {
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
  const replyTextareaRef = useRef(null)
  const chatScrollRef = useRef(null)
  const selectedConversationIdRef = useRef(selectedConversationId)

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages]
  )

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  const loadConversations = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoadingList(true)
        setMessage('')
      }

      const data = await getOwnerChats()
      setConversations(data)

      if (!selectedConversationIdRef.current && data.length > 0) {
        setSelectedConversationId(data[0].id)
      }
    } catch (error) {
      if (!silent) {
        setMessage(error.message)
      }
    } finally {
      if (!silent) {
        setLoadingList(false)
      }
    }
  }, [])

  const loadSelectedConversation = useCallback(async (
    conversationId = selectedConversationIdRef.current,
    { silent = false } = {}
  ) => {
    if (!conversationId) {
      setSelectedConversation(null)
      setMessages([])
      return
    }

    try {
      if (!silent) {
        setLoadingChat(true)
        setMessage('')
      }

      const shouldScrollToBottom = isNearBottom(chatScrollRef.current)
      const data = await getOwnerChat(conversationId)
      setSelectedConversation(data.conversation)
      setMessages(data.messages || [])
      if (shouldScrollToBottom) {
        requestAnimationFrame(() => scrollToBottom(chatScrollRef.current))
      }
    } catch (error) {
      if (!silent) {
        setMessage(error.message)
      }
    } finally {
      if (!silent) {
        setLoadingChat(false)
      }
    }
  }, [])

  async function refreshCurrentChat() {
    await loadSelectedConversation(selectedConversationIdRef.current, { silent: true })
    await loadConversations({ silent: true })
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

      await sendChatMessage({
        conversationId: selectedConversationId,
        senderRole: 'owner',
        body: replyText,
        importance: 'normal',
      })

      setReplyText('')
      resizeComposerTextarea(replyTextareaRef.current)
      await refreshCurrentChat()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSending(false)
    }
  }

  async function handleDeleteMessage(messageId) {
    try {
      setMessage('')
      await deleteMessage(messageId)
      await refreshCurrentChat()
    } catch (error) {
      setMessage(error.message)
    }
  }

  function handleReplyTextChange(event) {
    setReplyText(event.target.value)
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
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    loadSelectedConversation(selectedConversationId)
  }, [loadSelectedConversation, selectedConversationId])

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadConversations({ silent: true }).catch(() => {})
    }, 5000)

    return () => clearInterval(intervalId)
  }, [loadConversations])

  useEffect(() => {
    if (!selectedConversationId) {
      return undefined
    }

    const intervalId = setInterval(() => {
      loadSelectedConversation(selectedConversationId, { silent: true }).catch(() => {})
    }, 3000)

    return () => clearInterval(intervalId)
  }, [selectedConversationId, loadSelectedConversation])

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
                    <strong>{getProfileTitle(profile)}</strong>
                    {profile.email && <span>{profile.email}</span>}
                    {conversation.last_message && (
                      <small>
                        {conversation.last_message.deleted_at ? 'Сообщение удалено' : conversation.last_message.body}
                      </small>
                    )}
                  </span>
                  {conversation.unread_count > 0 && (
                    <span className="badge red">{conversation.unread_count}</span>
                  )}
                  {conversation.last_message?.importance && conversation.last_message.importance !== 'normal' && (
                    <span className={`status-dot urgency-${conversation.last_message.importance}`} />
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        <div className="chat-main">
          <div className="chat-topbar">
            <div>
              <h3>
                {getProfileTitle(selectedConversation?.user_profile)}
              </h3>
              {selectedConversation?.user_profile?.email && (
                <p>{selectedConversation.user_profile.email}</p>
              )}
            </div>

            <div className="toolbar">
              <button onClick={refreshCurrentChat} disabled={!selectedConversationId || loadingChat}>
                Обновить чат
              </button>
            </div>
          </div>

          <div className="chat-scroll" ref={chatScrollRef}>
            {message && <p className="notice danger">{message}</p>}
            {loadingChat && <p>Загрузка чата...</p>}

            {!loadingChat && selectedConversation && (
              <>
                {sortedMessages.length === 0 && <p className="notice">Сообщений пока нет</p>}

                <div className="message-list">
                  {sortedMessages.map((chatMessage) => (
                    <article key={chatMessage.id} className={getBubbleClass(chatMessage.sender_role)}>
                      <div className="message-head">
                        <span>{roleLabels[chatMessage.sender_role] || chatMessage.sender_role}</span>
                        <span className="message-time">{formatTime(chatMessage.created_at)}</span>
                      </div>

                      <div className={chatMessage.deleted_at ? 'deleted-message' : ''}>
                        {chatMessage.deleted_at ? 'Сообщение удалено' : chatMessage.body}
                      </div>

                      {!chatMessage.deleted_at && chatMessage.sender_role === 'user' && (
                        <span className={`message-badge ${getFinalImportanceBadgeClass(chatMessage.final_importance)}`}>
                          {getFinalImportanceLabel(chatMessage.final_importance)}
                        </span>
                      )}

                      {!chatMessage.deleted_at && chatMessage.body_zh && (
                        <div style={{ marginTop: '10px' }}>
                          {chatMessage.body_zh}
                        </div>
                      )}

                      {!chatMessage.deleted_at && chatMessage.sender_role === 'owner' && !chatMessage.source_question_id && (
                        <button
                          className="message-delete-button"
                          type="button"
                          onClick={() => handleDeleteMessage(chatMessage.id)}
                        >
                          Удалить
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>

          {!loadingChat && selectedConversation && (
            <>
              <form className="composer" onSubmit={handleSend}>
                <div className="composer-row">
                  <textarea
                    ref={replyTextareaRef}
                    className="composer-textarea"
                    value={replyText}
                    onChange={handleReplyTextChange}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="текст"
                    rows="1"
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
          <img className="brand-logo-vertical" src="/brand/gena-logo-white.png" alt="Гена" />
          <img className="brand-logo-sign" src="/brand/gena-logo-white.png" alt="" aria-hidden="true" />
        </aside>
      </div>
    </section>
  )
}
