import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import logoIcon from "@/assets/intro screens/RestSecret logo.png";
import dayThemeBackground from "@/assets/intro screens/day_theme.png";
import { completeOnboarding, fetchCurrentUser } from "@/lib/api";
import { resetImmersiveViewport, useImmersiveViewport } from "@/hooks/useImmersiveViewport";
import { analytics } from "@/services/analytics";
import { useAuth } from "@/store/auth";
import { useGoalsStore } from "@/store/goals";

type IntroLocationState = {
  next?: unknown;
  from?: unknown;
  profileName?: unknown;
};

type StepKey = "step-1" | "step-2";

type OnboardingFormState = {
  gender: "male" | "female" | "";
  age: string;
  goal: "lose_weight" | "maintain_weight" | "gain_weight" | "";
  height: string;
  weight: string;
  activity: "low" | "medium" | "high" | "very_high" | "";
};

function toInternalPath(value: unknown) {
  return typeof value === "string" && value.startsWith("/") ? value : null;
}

function toProfileName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumberOrNull(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function OnboardingProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { step: rawStep } = useParams();
  const accessToken = useAuth((state) => state.accessToken);
  const previewParam = new URLSearchParams(location.search).get("preview");
  const isDevPreview =
    import.meta.env.DEV && typeof previewParam === "string" && previewParam.startsWith("1");

  const { data: goals, fetch, updateStats } = useGoalsStore((state) => ({
    data: state.data,
    fetch: state.fetch,
    updateStats: state.updateStats,
  }));

  const step = rawStep === "step-2" ? "step-2" : "step-1";
  const [isOnboardingAllowed, setIsOnboardingAllowed] = useState<boolean | null>(
    isDevPreview ? true : null
  );
  const [profileName, setProfileName] = useState("");
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OnboardingFormState>({
    gender: "",
    age: "",
    goal: "",
    height: "",
    weight: "",
    activity: "",
  });

  useImmersiveViewport(`${location.key}:${step}`);

  const nextPath = useMemo(() => {
    const state = (location.state || {}) as IntroLocationState;
    const fromNext = toInternalPath(state.next);
    const fromState = toInternalPath(state.from);
    const resolved = fromNext || fromState;

    if (!resolved || resolved.startsWith("/onboarding")) {
      return "/account";
    }

    return resolved;
  }, [location.state]);

  const previewProfileName = useMemo(() => {
    const state = (location.state || {}) as IntroLocationState;
    const fromState = toProfileName(state.profileName);
    if (fromState) return fromState;
    if (typeof window === "undefined") return "";
    try {
      return window.sessionStorage.getItem("rs_onboarding_preview_name")?.trim() || "";
    } catch {
      return "";
    }
  }, [location.state]);

  useEffect(() => {
    if (isDevPreview) return;
    if (!accessToken) return;
    fetch(accessToken);
  }, [accessToken, fetch, isDevPreview]);

  useEffect(() => {
    if (isDevPreview) {
      setProfileName(previewProfileName);
      setIsOnboardingAllowed(true);
      return;
    }
    if (!accessToken) return;
    let isCancelled = false;

    (async () => {
      try {
        const me = await fetchCurrentUser(accessToken);
        if (isCancelled) return;
        const backendName = me?.user?.first_name?.trim();
        setProfileName(backendName || "");
        setIsOnboardingAllowed(me?.user?.onboarding_completed !== true);
      } catch (statusError) {
        console.error("Failed to load onboarding status", statusError);
        if (!isCancelled) {
          setProfileName("");
          setIsOnboardingAllowed(true);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [accessToken, isDevPreview, previewProfileName]);

  useEffect(() => {
    if (!goals) {
      setForm({
        gender: "",
        age: "",
        goal: "",
        height: "",
        weight: "",
        activity: "",
      });
      return;
    }
    setForm({
      gender: goals.gender || "",
      age: "",
      goal: goals.goal_type || "",
      height: "",
      weight: "",
      activity: goals.activity_level || "",
    });
  }, [goals]);

  if (!accessToken && !isDevPreview) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (rawStep !== "step-1" && rawStep !== "step-2") {
    return (
      <Navigate
        to={`/onboarding/profile/step-1${isDevPreview ? "?preview=1" : ""}`}
        replace
        state={{ next: nextPath }}
      />
    );
  }

  if (isOnboardingAllowed === null) {
    return null;
  }

  if (!isOnboardingAllowed) {
    return <Navigate to="/account" replace />;
  }

  const setField = (field: keyof OnboardingFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value } as OnboardingFormState));
    if (error) setError(null);
  };

  const saveStep = async (currentStep: StepKey) => {
    if (!accessToken) return;

    const payload =
      currentStep === "step-1"
        ? {
            gender: form.gender || null,
            age: parseNumberOrNull(form.age),
            goal_type: form.goal || null,
          }
        : {
            height: parseNumberOrNull(form.height),
            weight: parseNumberOrNull(form.weight),
            activity_level: form.activity || null,
          };

    await updateStats(accessToken, payload);
  };

  const handleContinue = async () => {
    if (isSavingStep || isSkipping) return;

    if (isDevPreview) {
      if (step === "step-1") {
        resetImmersiveViewport({ blurActiveElement: true });
        navigate("/onboarding/profile/step-2?preview=1", {
          replace: true,
          state: { next: nextPath, profileName },
        });
        return;
      }

      resetImmersiveViewport({ blurActiveElement: true });
      navigate(nextPath, { replace: true });
      return;
    }

    try {
      setIsSavingStep(true);
      setError(null);
      await saveStep(step);

      if (step === "step-1") {
        analytics.track("onboarding_profile_step_completed", { step: 1 });
        resetImmersiveViewport({ blurActiveElement: true });
        navigate("/onboarding/profile/step-2", {
          replace: true,
          state: { next: nextPath, profileName },
        });
        return;
      }

      await completeOnboarding(accessToken);
      analytics.track("onboarding_profile_step_completed", { step: 2 });
      analytics.track("onboarding_completed", { source: "signup" });
      resetImmersiveViewport({ blurActiveElement: true });
      navigate(nextPath, { replace: true });
    } catch (saveError) {
      console.error("Failed to save onboarding profile step", saveError);
      setError("Не удалось сохранить данные. Попробуйте еще раз.");
    } finally {
      setIsSavingStep(false);
    }
  };

  const handleSkip = () => {
    if (isSkipping) return;

    if (isDevPreview) {
      resetImmersiveViewport({ blurActiveElement: true });
      navigate(nextPath, { replace: true });
      return;
    }

    setIsSkipping(true);
    setError(null);
    (async () => {
      try {
        if (accessToken) {
          await completeOnboarding(accessToken);
        }
        analytics.track("onboarding_skipped", { step: step === "step-1" ? 1 : 2 });
        resetImmersiveViewport({ blurActiveElement: true });
        navigate(nextPath, { replace: true });
      } catch (skipError) {
        console.error("Failed to skip onboarding", skipError);
        setError("Не удалось завершить онбординг. Попробуйте еще раз.");
        setIsSkipping(false);
      }
    })();
  };

  const handleBack = () => {
    if (step === "step-1") {
      resetImmersiveViewport({ blurActiveElement: true });
      navigate(`/onboarding/welcome${isDevPreview ? "?preview=1" : ""}`, {
        replace: true,
        state: { next: nextPath, profileName },
      });
      return;
    }

    resetImmersiveViewport({ blurActiveElement: true });
    navigate(`/onboarding/profile/step-1${isDevPreview ? "?preview=1" : ""}`, {
      replace: true,
      state: { next: nextPath, profileName },
    });
  };

  return (
    <section
      className="onboarding-flow"
      aria-labelledby="onboarding-profile-title"
      style={
        {
          "--intro-bg-mobile": `url(${dayThemeBackground})`,
          "--intro-bg-desktop": `url(${dayThemeBackground})`,
        } as CSSProperties
      }
    >
      <div className="onboarding-flow__inner">
        <ol className="intro__progress onboarding-flow__progress" aria-label="Прогресс онбординга">
          <li className="intro__progress-step intro__progress-step--active">
            <span>1</span>
          </li>
          <li className="intro__progress-line intro__progress-line--active" aria-hidden="true" />
          <li className={`intro__progress-step ${step === "step-1" ? "intro__progress-step--active" : ""}`}>
            <span>2</span>
          </li>
          <li className={`intro__progress-line ${step === "step-2" ? "intro__progress-line--active" : ""}`} aria-hidden="true" />
          <li className={`intro__progress-step ${step === "step-2" ? "intro__progress-step--active" : ""}`}>
            <span>3</span>
          </li>
        </ol>

        <button
          type="button"
          className="onboarding-flow__back"
          onClick={handleBack}
          aria-label="Назад"
        >
          Назад
        </button>

        <img src={logoIcon} alt="" className="onboarding-flow__logo" aria-hidden="true" />

        <h1 id="onboarding-profile-title" className="onboarding-flow__title">
          {step === "step-1" ? (
            <span>Приятно познакомиться{profileName ? `, ${profileName}` : ""}</span>
          ) : (
            <>
              <span>Почти</span>
              <span>готово</span>
            </>
          )}
        </h1>

        <p className="onboarding-flow__subtitle">
          {step === "step-1"
            ? "Чтобы я был тебе полезнее, расскажи о себе"
            : "Добавь параметры, для персонального расчета КБЖУ"}
        </p>

        <form className="onboarding-flow__form" onSubmit={(event) => event.preventDefault()}>
          {step === "step-1" ? (
            <>
              <div className="form-group full">
                <label htmlFor="onboarding-gender">Пол</label>
                <select
                  id="onboarding-gender"
                  value={form.gender}
                  onChange={(event) => setField("gender", event.target.value)}
                >
                  <option value="">Не указывать</option>
                  <option value="male">Мужской</option>
                  <option value="female">Женский</option>
                </select>
              </div>

              <div className="form-group full">
                <label htmlFor="onboarding-age">Возраст (лет)</label>
                <input
                  id="onboarding-age"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="120"
                  value={form.age}
                  onChange={(event) => setField("age", event.target.value)}
                />
              </div>

              <div className="form-group full">
                <label htmlFor="onboarding-goal">Цель</label>
                <select
                  id="onboarding-goal"
                  value={form.goal}
                  onChange={(event) => setField("goal", event.target.value)}
                >
                  <option value="">Не указывать</option>
                  <option value="lose_weight">Похудение</option>
                  <option value="maintain_weight">Поддержание формы</option>
                  <option value="gain_weight">Набор массы</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="form-group full">
                <label htmlFor="onboarding-height">Рост (см)</label>
                <input
                  id="onboarding-height"
                  type="number"
                  inputMode="decimal"
                  min="50"
                  max="250"
                  value={form.height}
                  onChange={(event) => setField("height", event.target.value)}
                />
              </div>

              <div className="form-group full">
                <label htmlFor="onboarding-weight">Вес (кг)</label>
                <input
                  id="onboarding-weight"
                  type="number"
                  inputMode="decimal"
                  min="20"
                  max="300"
                  value={form.weight}
                  onChange={(event) => setField("weight", event.target.value)}
                />
              </div>

              <div className="form-group full">
                <label htmlFor="onboarding-activity">Активность</label>
                <select
                  id="onboarding-activity"
                  value={form.activity}
                  onChange={(event) => setField("activity", event.target.value)}
                >
                  <option value="">Не указывать</option>
                  <option value="low">Минимальная (сидячая работа)</option>
                  <option value="medium">Лёгкая (1-3 тренировки)</option>
                  <option value="high">Средняя (3-5 тренировок)</option>
                  <option value="very_high">Высокая (6-7 тренировок)</option>
                </select>
              </div>
            </>
          )}

          {error && <p className="onboarding-flow__error">{error}</p>}

          <div className="onboarding-flow__actions">
            <button
              type="button"
              className="onboarding-flow__action onboarding-flow__action--primary"
              onClick={handleContinue}
              disabled={isSavingStep || isSkipping}
            >
              <span>{isSavingStep ? "Сохраняем..." : "Продолжить"}</span>
              <svg className="onboarding-flow__action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5 12h14m-6-6 6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
          </div>

          <div className="intro__divider onboarding-flow__divider" aria-hidden="true">
            <span />
            <b>или</b>
            <span />
          </div>

          <div className="onboarding-flow__actions onboarding-flow__actions--secondary">
            <button
              type="button"
              className="onboarding-flow__action onboarding-flow__action--secondary"
              onClick={handleSkip}
              disabled={isSkipping}
            >
              {isSkipping ? "Пропускаем..." : "Заполнить позже"}
            </button>
          </div>
        </form>

      </div>
    </section>
  );
}
