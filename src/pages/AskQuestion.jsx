import { useState } from 'react'
import { submitQuestion } from '../lib/api'

export default function AskQuestion({ onBack }) {
  const [questionText, setQuestionText] = useState('')
  const [urgencyLevel, setUrgencyLevel] = useState('normal')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (!questionText.trim()) {
      setMessage('Введите текст вопроса.')
      return
    }

    try {
      setLoading(true)

      const result = await submitQuestion({
        questionText,
        urgencyLevel,
      })

      setMessage(`Вопрос отправлен. Статус: ${result.status}.`)
      setQuestionText('')
      setUrgencyLevel('normal')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>Задать вопрос</h2>

      <p>
        Опишите вопрос, а затем выберите уровень срочности.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label>
            <strong>Ваш вопрос</strong>
          </label>
          <br />
          <textarea
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
            placeholder="Например: можно завтра подтвердить встречу с партнёром?"
            rows="6"
            style={{ width: '100%', marginTop: '8px' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label>
            <strong>Срочность</strong>
          </label>
          <br />

          <select
            value={urgencyLevel}
            onChange={(event) => setUrgencyLevel(event.target.value)}
            style={{ marginTop: '8px' }}
          >
            <option value="normal">Обычный</option>
            <option value="important">Важный</option>
            <option value="urgent">Срочный</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="submit" disabled={loading}>
            {loading ? 'Отправка...' : 'Отправить вопрос'}
          </button>

          <button type="button" onClick={onBack}>
            Вернуться в профиль
          </button>
        </div>
      </form>

      {message && <p>{message}</p>}
    </div>
  )
}