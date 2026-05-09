import { useState } from 'react'
import { submitQuestion } from '../lib/api'

const urgencyLabels = {
  normal: 'Обычный',
  important: 'Важный',
  urgent: 'Срочный',
}

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
    <div className="page-stack">
      <section className="hero-card black">
        <h2>Задать вопрос</h2>
        <p>Опишите запрос для дворецкого. Он появится и в рабочем кабинете владельца, и в переписке.</p>
      </section>

      <form className="dashboard-card form-stack" onSubmit={handleSubmit}>
        <div>
          <label>
            <strong>Ваш вопрос</strong>
          </label>
          <textarea
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
            placeholder="Например: можно завтра подтвердить встречу с партнёром?"
            rows="6"
          />
        </div>

        <div>
          <label>
            <strong>Срочность</strong>
          </label>
          <div className="importance-pills">
            {Object.entries(urgencyLabels).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`importance-pill secondary ${urgencyLevel === value ? 'active' : ''} ${value === 'urgent' ? 'urgent' : ''}`}
                onClick={() => setUrgencyLevel(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Отправка...' : 'Отправить вопрос'}
          </button>

          <button className="secondary" type="button" onClick={onBack}>
            Вернуться в профиль
          </button>
        </div>
      </form>

      {message && <p className="notice">{message}</p>}
    </div>
  )
}
