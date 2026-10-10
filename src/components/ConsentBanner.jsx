import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { analytics } from "../services/analytics";

const PARTNER_AREA = /^\/partners(\/|$)/;

export function ConsentBanner() {
    const { pathname } = useLocation();
    const isPartnerArea = PARTNER_AREA.test(pathname);
    const [visible, setVisible] = useState(false);

    // Кабинет ресторана — рабочий инструмент партнёра, его поведение мы не
    // отслеживаем. Проставляем «отклонено» молча и баннер не показываем.
    useEffect(() => {
        if (!isPartnerArea) return;
        if (analytics.getConsentStatus() === "unset") analytics.setConsent("denied");
    }, [isPartnerArea]);

    useEffect(() => {
        let showTimer = null;

        const checkStatus = () => {
            const status = analytics.getConsentStatus();
            if (status === "unset") {
                if (showTimer) clearTimeout(showTimer);
                showTimer = setTimeout(() => {
                    setVisible(true);
                }, 5000);
            } else {
                if (showTimer) {
                    clearTimeout(showTimer);
                    showTimer = null;
                }
                setVisible(false);
            }
        };

        checkStatus();
        window.addEventListener("rs-consent-update", checkStatus);
        return () => {
            if (showTimer) clearTimeout(showTimer);
            window.removeEventListener("rs-consent-update", checkStatus);
        };
    }, []);

    const handleAccept = () => {
        analytics.setConsent("granted");
        analytics.track("cookie_banner_action", { action: "accept", source: "banner" });
    };

    const handleDecline = () => {
        analytics.track("cookie_banner_action", { action: "decline", source: "banner" }, { ignoreConsent: true });
        analytics.setConsent("denied");
    };

    if (isPartnerArea || !visible) return null;

    return (
        <div className="rs-banner">
            <div className="rs-banner__inner">
                <div className="rs-banner__content">
                    <strong className="rs-banner__title">Мы ценим вашу приватность</strong>
                    <p className="rs-banner__text">
                        Мы используем cookies для улучшения работы сайта и аналитики.{" "}
                        <Link to="/privacy" className="underline hover:text-white transition-colors">
                            Политика конфиденциальности
                        </Link>
                    </p>
                </div>
                <div className="rs-banner__actions">
                    <button
                        onClick={handleDecline}
                        className="btn btn--ghost"
                    >
                        Отклонить
                    </button>
                    <button
                        onClick={handleAccept}
                        className="btn btn--primary"
                    >
                        Принять
                    </button>
                </div>
            </div>
        </div>
    );
}
