import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import { PARTNER_ADMIN_ENABLED } from './adminFeatures'
import './admin-menu.css'

export default function AdminShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const loginPage = location.pathname.replace(/\/+$/, '') === '/admin/login'
  const [status, setStatus] = useState(loginPage ? 'ready' : 'loading')

  const verify = useCallback(async () => {
    setStatus('loading')
    try {
      await adminMenuRevisionsApi.me()
      setStatus('ready')
    } catch (error) {
      if (error.status === 401) {
        navigate('/admin/login', { replace: true })
        return
      }
      setStatus('error')
    }
  }, [navigate])

  useEffect(() => {
    if (!loginPage) verify()
  }, [loginPage, verify])

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  if (loginPage) return <div className="admin-menu"><Outlet /></div>
  if (status === 'loading') return <div className="admin-menu admin-menu--center">Загружаем админку…</div>
  if (status === 'error') {
    return <div className="admin-menu admin-menu--center"><button onClick={verify}>Повторить</button></div>
  }

  const logout = async () => {
    await adminMenuRevisionsApi.logout().catch(() => null)
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="admin-menu">
      <header className="admin-menu__header">
        <Link to="/admin/restaurants" className="admin-menu__brand">
          <img src="/assets/logo-64.png" alt="" width="38" height="38" />
          <span><strong>RestaurantSecret</strong><small>Внутренний кабинет</small></span>
        </Link>
        <nav className="admin-menu__nav" aria-label="Разделы администратора">
          <Link className={location.pathname.startsWith('/admin/restaurants') ? 'active' : ''} to="/admin/restaurants">Рестораны</Link>
          <Link className={location.pathname.startsWith('/admin/outreach') ? 'active' : ''} to="/admin/outreach">Аутрич</Link>
          {PARTNER_ADMIN_ENABLED && <Link className={location.pathname.startsWith('/admin/menu-revisions') ? 'active' : ''} to="/admin/menu-revisions">Задачи меню</Link>}
          <Link className={location.pathname.startsWith('/admin/product-matches') ? 'active' : ''} to="/admin/product-matches">Продукты</Link>
          <Link className={location.pathname.startsWith('/admin/kbju-flags') ? 'active' : ''} to="/admin/kbju-flags">Странные КБЖУ</Link>
          <Link className={location.pathname.startsWith('/admin/restaurant-reviews') ? 'active' : ''} to="/admin/restaurant-reviews">Ревью ресторанов</Link>
        </nav>
        <button type="button" onClick={logout}>Выйти</button>
      </header>
      <main className="admin-menu__main"><Outlet /></main>
    </div>
  )
}
