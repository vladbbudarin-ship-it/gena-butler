import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Register from './pages/Register'
import Login from './pages/Login'
import Profile from './pages/Profile'
import MyQuestions from './pages/MyQuestions'
import OwnerDashboard from './pages/OwnerDashboard'

function BrandPanel() {
  return (
    <aside className="brand-panel">
      <img className="brand-logo-vertical" src="/brand/gena-logo-white.png" alt="Гена" />
      <img className="brand-logo-sign" src="/brand/gena-logo-white.png" alt="" aria-hidden="true" />
    </aside>
  )
}

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
    return (
      <main className="app-shell auth">
        <section className="auth-card">
          <img className="wordmark" src="/brand/gena-logo-black.png" alt="Гена" />
          <p>Загрузка...</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="app-shell auth">
        <div className="app-frame auth-frame">
          <section className="auth-card">
            <img className="wordmark" src="/brand/gena-logo-black.png" alt="Гена" />
            <p className="auth-subtitle">Budarin&apos;s messenger</p>

            <nav className="auth-tabs">
              <button
                className={screen === 'login' ? 'active' : ''}
                onClick={() => setScreen('login')}
              >
                Вход
              </button>
              <button
                className={screen === 'register' ? 'active' : ''}
                onClick={() => setScreen('register')}
              >
                Регистрация
              </button>
            </nav>

            {screen === 'login' && (
              <Login
                onLogin={(loggedUser) => {
                  setUser(loggedUser)
                  setScreen('profile')
                }}
              />
            )}

            {screen === 'register' && <Register />}
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className={`app-frame ${screen === 'myQuestions' || screen === 'owner' ? 'workspace-frame' : ''}`}>
        <section className="content-panel">
          {screen === 'profile' && (
            <Profile
              user={user}
              onOpenMyQuestions={() => setScreen('myQuestions')}
              onOpenOwnerDashboard={() => setScreen('owner')}
              onLogout={() => {
                setUser(null)
                setScreen('login')
              }}
            />
          )}

          {screen === 'myQuestions' && (
            <MyQuestions
              onBack={() => setScreen('profile')}
            />
          )}

          {screen === 'owner' && (
            <OwnerDashboard
              onBack={() => setScreen('profile')}
            />
          )}
        </section>

        <BrandPanel />
      </div>
    </main>
  )
}
