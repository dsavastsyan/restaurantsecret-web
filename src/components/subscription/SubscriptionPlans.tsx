import { useState, useEffect } from "react";
import "./SubscriptionPlans.css";
import { PromoQuote } from "@/lib/api";

type SubscriptionPlansProps = {
    selectedPlan: "month" | "year" | null;
    onSelectPlan: (plan: "month" | "year") => void;
    onProceed: () => void; // Main CTA action
    onQuotePromo?: (code: string) => void;
    onRedeemPromo?: (code: string) => void;
    onResetPromo?: () => void;
    loading?: boolean;
    promoError?: string | null;
    promoQuote?: PromoQuote | null;
    disabledPlan?: "month" | "year" | null;
    disabledPlanHint?: string | null;
    showTrialPricing?: boolean;
    trialDays?: number;
};

const benefits = [
    "Все рестораны и блюда",
    "Дневник питания + цели по КБЖУ",
    "Избранные рестораны и блюда",
];

export default function SubscriptionPlans({
    selectedPlan,
    onSelectPlan,
    onProceed,
    onQuotePromo,
    onRedeemPromo,
    onResetPromo,
    loading = false,
    promoError,
    promoQuote,
    disabledPlan = null,
    disabledPlanHint,
    showTrialPricing = false,
    trialDays = 7,
}: SubscriptionPlansProps) {
    const [promo, setPromo] = useState("");
    const [isPromoOpen, setIsPromoOpen] = useState(false);

    useEffect(() => {
        if (promoQuote) {
            setIsPromoOpen(true);
        }
    }, [promoQuote]);

    // Determine if we are in a "Free Access (No Payment)" state (no card required)
    const isFreeAccessNoCard = promoQuote?.type === 'free_days' && !promoQuote.requires_subscribing;

    // Determine if we are in "Free Days + Subscription" state
    const isFreeDaysTrial = promoQuote?.type === 'free_days' && promoQuote.requires_subscribing;

    // Prices
    const baseMonthPrice = 199;
    const baseYearPrice = 1490;

    // Plan availability/auto-selection logic
    useEffect(() => {
        if (promoQuote) {
            if (promoQuote.plan === 'annual') {
                onSelectPlan('year');
            } else if (promoQuote.plan === 'monthly') {
                onSelectPlan('month');
            }
        }
    }, [promoQuote]);

    const isMonthDisabled = promoQuote?.plan === 'annual' || disabledPlan === "month";
    const isYearDisabled = promoQuote?.plan === 'monthly' || (promoQuote?.type === 'discount_rub' && promoQuote?.amount > 0 && promoQuote?.plan === 'monthly') || disabledPlan === "year";
    // Actually the requirement says for RS10PERCFREE (annual only) month is disabled. 
    // And for RS50PERCFREE/RS20RUB (monthly only) year is disabled.

    const getPrice = (type: 'month' | 'year', base: number) => {
        if (!promoQuote) return { old: null, new: base };
        // If free days trial, the price AFTER trial is the base price.
        if (isFreeDaysTrial) return { old: null, new: base, isTrial: true };

        if (promoQuote.type === 'discount_rub' && (promoQuote.plan === 'any' ||
            (promoQuote.plan === 'monthly' && type === 'month') ||
            (promoQuote.plan === 'annual' && type === 'year'))) {
            const val = Math.max(1, base - promoQuote.amount);
            return { old: base, new: val };
        }
        if (promoQuote.type === 'discount_pct' && (promoQuote.plan === 'any' ||
            (promoQuote.plan === 'monthly' && type === 'month') ||
            (promoQuote.plan === 'annual' && type === 'year'))) {
            const discount = (base * promoQuote.amount) / 100;
            const val = Math.max(1, base - discount);
            return { old: base, new: Math.round(val) };
        }
        return { old: null, new: base };
    };

    const monthPrice = getPrice('month', baseMonthPrice);
    const yearPrice = getPrice('year', baseYearPrice);

    const handleApply = () => {
        if (!promo.trim()) return;
        onQuotePromo?.(promo.trim());
    };

    // Derived CTA text
    const getCtaText = () => {
        if (isFreeAccessNoCard) return "Активировать доступ";
        if (loading) return "Загрузка...";
        if (!selectedPlan) return "Выберите тариф";
        if (showTrialPricing && !promoQuote) return `${trialDays} дней бесплатно`;

        if (isFreeDaysTrial && selectedPlan) {
            const priceObj = selectedPlan === 'month' ? monthPrice : yearPrice;
            const period = selectedPlan === 'month' ? 'в месяц' : 'в год';
            return `0\u00A0₽ сейчас, затем ${priceObj.new}\u00A0₽ ${period}`;
        }

        const priceObj = selectedPlan === 'month' ? monthPrice : yearPrice;
        const planName = selectedPlan === 'month' ? "месяц" : "год";

        return `Оформить ${planName} за ${priceObj.new}\u00A0₽`;
    };

    const renderPrice = (priceObj: any, period: string) => {
        if (showTrialPricing && !promoQuote) {
            return (
                <div className="rsPlanPriceTrial rsPlanPriceTrial--intro">
                    <span className="rsTrialBig">{trialDays} дней бесплатно</span>
                    <div className="rsTrialSmall">потом {priceObj.new} ₽ {period.replace("*", "")}</div>
                </div>
            );
        }

        if (isFreeDaysTrial && promoQuote?.amount) {
            return (
                <div className="rsPlanPriceTrial">
                    <span className="rsTrialBig">{promoQuote.amount} дней бесплатно</span>
                    <div className="rsTrialSmall">потом {priceObj.new} ₽ {period}</div>
                </div>
            );
        }

        return (
            <div className="rsPlanPrice">
                {priceObj.old && (
                    <span className="rsPlanPriceOld">{priceObj.old} ₽</span>
                )}
                <span className={`rsPlanPriceBig ${priceObj.old ? 'rsPlanPriceNew' : ''}`}>
                    {priceObj.new} ₽
                </span>
                <span className="rsPlanPriceSmall">{period}</span>
            </div>
        );
    };

    return (
        <div className="rsPlansContainer">
            <div className="rsBenefitsStrip" aria-label="Преимущества подписки">
                <div className="rsBenefitsTrack">
                    {[0, 1].map((group) => (
                        <div
                            className="rsBenefitsGroup"
                            key={group}
                            aria-hidden={group === 1}
                        >
                            {benefits.map((benefit, index) => (
                                <div className="rsBenefitItem" key={benefit}>
                                    <span className="rsBenefitCheck" aria-hidden="true">✓</span>
                                    <span>{benefit}</span>
                                    {index < benefits.length - 1 && (
                                        <span className="rsBenefitDot" aria-hidden="true">•</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Plans Grid */}
            {!isFreeAccessNoCard && (
                <>
                    {disabledPlanHint && (
                        <div className="rsPromoError" style={{ marginTop: 0, marginBottom: 8 }}>
                            {disabledPlanHint}
                        </div>
                    )}
                    <div className="rsPlanGrid">
                        {/* Month Card */}
                        <div
                            className={`rsPlanCard rsPlanMonth ${selectedPlan === 'month' ? 'is-selected' : ''} ${isMonthDisabled ? 'is-disabled' : ''}`}
                            onClick={() => !isMonthDisabled && onSelectPlan('month')}
                        >
                            {isMonthDisabled && (
                                <div className="rsPlanUnavailableBadge">
                                    {disabledPlan === "month" ? "Текущий тариф" : "Недоступно с выбранным промокодом"}
                                </div>
                            )}
                            <div className="rsPlanCardBody">
                                <div className="rsPlanTopRow">
                                    <div className="rsPlanName">Месяц</div>
                                    <div className="rsPlanRadio" />
                                </div>
                                {renderPrice(monthPrice, "/мес*")}
                                <div className="rsPlanDesc rsPlanDesc--coffee">
                                    <span>дешевле стаканчика кофе</span>
                                </div>
                            </div>
                        </div>

                        {/* Year Card */}
                        <div
                            className={`rsPlanCard rsPlanYear ${selectedPlan === 'year' ? 'is-selected' : ''} ${isYearDisabled ? 'is-disabled' : ''}`}
                            onClick={() => !isYearDisabled && onSelectPlan('year')}
                        >
                            {isYearDisabled && (
                                <div className="rsPlanUnavailableBadge">
                                    {disabledPlan === "year" ? "Текущий тариф" : "Недоступно с выбранным промокодом"}
                                </div>
                            )}
                            <div className="rsPlanCardBody">
                                <div className="rsBadge">Самый выгодный</div>
                                <div className="rsPlanTopRow">
                                    <div className="rsPlanName">Год</div>
                                    <div className="rsPlanRadio" />
                                </div>
                                {renderPrice(yearPrice, "/год*")}
                                <div className="rsPlanEquivalent">
                                    <strong>{Math.round(yearPrice.new / 12)} ₽</strong>
                                    <span>/мес</span>
                                    <s>{baseMonthPrice} ₽/мес</s>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="rsFootnote">* Автоматическое списание, отменить можно в любой момент</div>
                </>
            )}

            {/* Promo Section at Bottom (Collapsible) */}
            <div className={`rsPromoBox ${isPromoOpen ? "rsPromoBox--open" : ""}`}>
                <div
                    className="rsPromoHeader"
                    onClick={() => setIsPromoOpen(!isPromoOpen)}
                >
                    <div className="rsPromoTitle">Есть промокод?</div>
                    <div className={`rsPromoChevron ${isPromoOpen ? "rsPromoChevron--open" : ""}`}>
                        ▼
                    </div>
                </div>

                {isPromoOpen && (
                    <div className="rsPromoBody">
                        {!promoQuote ? (
                            <div className="rsPromoRow">
                                <input
                                    className="rsPromoInput"
                                    placeholder="Введите промокод"
                                    value={promo}
                                    onChange={(e) => setPromo(e.target.value)}
                                    disabled={loading}
                                    onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                                />
                                <button
                                    className="rsPromoBtn"
                                    onClick={handleApply}
                                    disabled={!promo.trim() || loading}
                                >
                                    Применить
                                </button>
                            </div>
                        ) : (
                            <div className="rsPromoResult">
                                <div className="rsPromoBadge rsPromoBadge--green">
                                    {promoQuote.code || promo.toUpperCase()}
                                </div>
                                <div className="rsPromoDesc">
                                    {isFreeAccessNoCard && <div className="rsPromoSub">Без привязки карты</div>}
                                </div>

                                <div className="rsPromoActions">
                                    <button
                                        className="rsPromoCancel"
                                        onClick={() => {
                                            setPromo("");
                                            onResetPromo?.();
                                        }}
                                        disabled={loading}
                                    >
                                        Сбросить
                                    </button>
                                </div>
                            </div>
                        )}

                        {promoError && (
                            <div className="rsPromoError">
                                {promoError}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="rsCheckoutActions">
                {/* Main CTA */}
                <button
                    className={`rsMainCta ${isFreeAccessNoCard ? 'rsMainCta--free' : ''}`}
                    onClick={onProceed}
                    disabled={loading || (!isFreeAccessNoCard && !selectedPlan)}
                >
                    {getCtaText()}
                </button>

                <div className="rsCheckoutSupport">
                    Проблемы с оформлением?{" "}
                    <a
                        href="https://t.me/RestSecretSupport_bot"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Поддержка
                    </a>
                </div>
            </div>
        </div>
    );
}
