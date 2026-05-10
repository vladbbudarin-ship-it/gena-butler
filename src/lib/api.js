import { supabase } from './supabaseClient'

function getApiError(result, fallbackMessage) {
  if (result?.details) {
    return `${result.error || fallbackMessage} ${result.details}`
  }

  return result?.error || fallbackMessage
}

export async function submitQuestion({ questionText, urgencyLevel }) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/submit-question', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      question_text: questionText,
      urgency_level: urgencyLevel,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось отправить вопрос.'))
  }

  return result
}

export async function getOwnerQuestions() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-owner-questions', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить вопросы.'))
  }

  return result.questions
}

export async function getMyQuestions() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-my-questions', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить ваши вопросы.'))
  }

  return result.questions
}

export async function getMyChat() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-my-chat', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить чат.'))
  }

  return result
}

export async function getMyProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-my-profile', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить профиль.'))
  }

  return result.profile
}

export async function getDirectChats() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-direct-chats', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить личные чаты.'))
  }

  return result.conversations
}

export async function startDirectChat(publicId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/start-direct-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      public_id: publicId,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось начать чат.'))
  }

  return result.conversation
}

export async function getDirectChat(conversationId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const params = new URLSearchParams({
    conversation_id: conversationId,
  })

  const response = await fetch(`/.netlify/functions/get-direct-chat?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить личный чат.'))
  }

  return result
}

export async function sendDirectMessage({
  conversationId,
  body,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/send-direct-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      body,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось отправить сообщение.'))
  }

  return result
}

export async function getOwnerChats() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-owner-chats', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить диалоги.'))
  }

  return result.conversations
}

export async function getOwnerChat(conversationId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const params = new URLSearchParams({
    conversation_id: conversationId,
  })

  const response = await fetch(`/.netlify/functions/get-owner-chat?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить диалог.'))
  }

  return result
}

export async function sendChatMessage({
  body,
  importance = 'normal',
  conversationId,
  senderRole,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/send-chat-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      body,
      importance,
      conversation_id: conversationId,
      sender_role: senderRole,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось отправить сообщение.'))
  }

  return result
}

export async function ownerAction({
  questionId,
  action,
  finalAnswerRu,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/owner-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      question_id: questionId,
      action,
      final_answer_ru: finalAnswerRu,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось выполнить действие.'))
  }

  return result
}
