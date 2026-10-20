import { Link, Outlet, useLocation } from 'react-router-dom'
import { ADMIN_NAV } from './adminNav'

function isActive(item, pathname) {
  const match = item.match || item.to
  return pathname === match || pathname.startsWith(`${match}/`)
}

function NavigationLevel({ items, pathname, level }) {
  const activeItem = items.find((item) => isActive(item, pathname))
  const className = level === 0
    ? 'admin-menu__nav admin-menu__section-nav'
    : 'admin-crm__section-tabs'

  return (
    <>
      <nav className={className} aria-label={level === 0 ? 'Разделы администратора' : 'Подразделы администратора'}>
        {items.map((item) => (
          <Link
            key={item.key}
            className={isActive(item, pathname) ? 'active' : ''}
            to={item.to}
            aria-current={isActive(item, pathname) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {activeItem?.children?.length ? (
        <NavigationLevel items={activeItem.children} pathname={pathname} level={level + 1} />
      ) : null}
    </>
  )
}

export default function AdminSectionLayout({ section }) {
  const location = useLocation()
  const navigation = ADMIN_NAV[section]

  if (!navigation) return <Outlet />

  return (
    <>
      <NavigationLevel items={navigation.sections} pathname={location.pathname} level={0} />
      <Outlet />
    </>
  )
}
