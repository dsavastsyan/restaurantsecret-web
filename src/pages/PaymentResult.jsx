import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { analytics } from "@/services/analytics";

const successMarkers = ["success", "succeeded", "true", "ok", "paid", "completed"];

export default function PaymentResult() {
  const [searchParams] = useSearchParams();

  const status = useMemo(() => {
    const statusParam = searchParams.get("status") || searchParams.get("payment_status");
    const successParam = searchParams.get("success") || searchParams.get("paid");
    const normalized = (statusParam || successParam || "").trim().toLowerCase();
    if (!normalized) return null;
    return normalized;
  }, [searchParams]);

  const isSuccess = useMemo(() => {
    if (!status) return true;
    return successMarkers.includes(status);
  }, [status]);

  useEffect(() => {
    const plan = sessionStorage.getItem("rs_checkout_plan") || "unknown";
    const paymentId = searchParams.get("payment_id") || sessionStorage.getItem("rs_checkout_payment_id") || null;
    sessionStorage.removeItem("rs_checkout_plan");
    sessionStorage.removeItem("rs_checkout_payment_id");
    analytics.track("payment_returned", {
      payment_id: paymentId,
      plan,
      return_status: status || "not_provided",
      interpreted_result: status ? (isSuccess ? "success" : "failure") : "unknown",
      return_path: window.location.pathname,
    });
  }, [status, isSuccess, searchParams]);

  const title = isSuccess ? "Спасибо! Ваша подписка оформлена" : "Не удалось получить оплату";
  const description = isSuccess
    ? "Мы уже работаем над обновлением доступа. Проверьте раздел подписки, чтобы увидеть статус."
    : "Платёж не подтвердился. Попробуйте ещё раз.";

  return (
    <div className="payment-result">
      <div className={`payment-result__card ${isSuccess ? "payment-result__card--success" : "payment-result__card--error"}`}>
        <div className="payment-result__icon" aria-hidden="true">
          {isSuccess ? "✓" : "!"}
        </div>
        <div className="payment-result__content">
          <p className="payment-result__eyebrow">Оплата подписки</p>
          <h1 className="payment-result__title">{title}</h1>
          <p className="payment-result__text">{description}</p>
          <div className="payment-result__actions">
            <Link className="btn btn--primary" to="/account/subscription">
              В личный кабинет
            </Link>
            {!isSuccess && (
              <Link className="btn btn--ghost" to="/tariffs">
                Попробовать ещё раз
              </Link>
            )}
          </div>
        </div>
      </div>
      {!isSuccess && (
        <p className="payment-result__support">
          При ошибке обращайтесь <a href="mailto:support@restaurantsecret.ru">support@restaurantsecret.ru</a>
          {" "}
          или
          <a className="payment-result__support-link" href="https://t.me/RestSecretSupport_bot" target="_blank" rel="noreferrer">
            напишите нам в телеграме
          </a>
          .
        </p>
      )}
    </div>
  );
}
