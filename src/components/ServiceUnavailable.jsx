import './service-unavailable.css'

export default function ServiceUnavailable({ onRetry, className = '' }) {
  return (
    <div className={`service-unavailable${className ? ` ${className}` : ''}`} role="alert">
      <h2 className="service-unavailable__title">Сервис временно недоступен</h2>
      <p className="service-unavailable__text">Мы уже знаем о проблеме и работаем над ней. Попробуйте обновить страницу через несколько минут</p>
      <button type="button" className="service-unavailable__button" onClick={onRetry}>Обновить</button>
    </div>
  )
}
