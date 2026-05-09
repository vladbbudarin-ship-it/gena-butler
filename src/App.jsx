import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Register from './pages/Register'
import Login from './pages/Login'
import Profile from './pages/Profile'
import AskQuestion from './pages/AskQuestion'
import MyQuestions from './pages/MyQuestions'
import OwnerDashboard from './pages/OwnerDashboard'

export default function App() {
  const [user, setUser] = useState(null)
  const [screen, setScreen] = useState('login')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function getSession() {
      const { data } = await supabase.auth.getSession()

      if (data.session?.user) {
        setUser(data.session.user)
        setScreen('profile')
      }

      setLoading(false)
    }

    getSession()
  }, [])

  if (loading) {
    return <p>Загрузка...</p>
  }

  return (
    <main style={{ maxWidth: '960px', margin: '40px auto', fontFamily: 'Arial' }}>
      <h1>Дворецкий Гена</h1>
      <p>Вежливый помощник для обработки вопросов.</p>

      {!user && (
        <nav style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <button onClick={() => setScreen('login')}>Вход</button>
          <button onClick={() => setScreen('register')}>Регистрация</button>
        </nav>
      )}

      {!user && screen === 'login' && (
        <Login
          onLogin={(loggedUser) => {
            setUser(loggedUser)
            setScreen('profile')
          }}
        />
      )}

      {!user && screen === 'register' && <Register />}

      {user && screen === 'profile' && (
        <Profile
          user={user}
          onAskQuestion={() => setScreen('ask')}
          onOpenMyQuestions={() => setScreen('myQuestions')}
          onOpenOwnerDashboard={() => setScreen('owner')}
          onLogout={() => {
            setUser(null)
            setScreen('login')
          }}
        />
      )}

      {user && screen === 'ask' && (
        <AskQuestion
          onBack={() => setScreen('profile')}
        />
      )}

      {user && screen === 'myQuestions' && (
        <MyQuestions
          onBack={() => setScreen('profile')}
        />
      )}

      {user && screen === 'owner' && (
        <OwnerDashboard
          onBack={() => setScreen('profile')}
        />
      )}
    </main>
  )
}
