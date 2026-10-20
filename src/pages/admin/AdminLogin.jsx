import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminMenuRevisionsApi.login(key)
      setKey('')
      navigate('/admin/restaurants/freshness/manual', { replace: true })
    } catch (requestError) {
      setError(requestError.message || 'Не удалось войти.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-menu__login">
      <form onSubmit={submit}>
        <img src="/assets/logo-64.png" width="54" height="54" alt="" />
        <span>Внутренний кабинет</span>
        <h1>Управление ресторанами</h1>
        <label>
          Ключ доступа
          <input
            autoComplete="current-password"
            autoFocus
            onChange={(event) => setKey(event.target.value)}
            type="password"
            value={key}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy || !key} type="submit">{busy ? 'Проверяем…' : 'Войти'}</button>
      </form>
    </main>
  )
}
