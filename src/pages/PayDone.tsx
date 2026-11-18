// Куда ЮKassa возвращает после оплаты по ссылке из письма (/pay/done): простое «спасибо» без входа.
import React, { useEffect } from "react";
import "./PromoLink.css";

export default function PayDone() {
  useEffect(() => {
    document.title = "Спасибо за оплату";
  }, []);
  return (
    <div className="pl-page">
      <div className="pl-blob pl-blob--a" aria-hidden />
      <div className="pl-blob pl-blob--b" aria-hidden />
      <main className="pl-card">
        <img className="pl-logo" src="/assets/promo/header.png" alt="AnyEat" width={141} height={44} />
        <section className="pl-state pl-enter">
          <div className="pl-check" aria-hidden>
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27 l7.5 7.5 L37.5 19" /></svg>
          </div>
          <h1 className="pl-title">Спасибо!</h1>
          <p className="pl-text">Подписка включится в течение минуты. Открой AnyEat и войди с той же почтой</p>
        </section>
      </main>
    </div>
  );
}
