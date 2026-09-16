import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import type { AccountOutletContext } from "./Layout";
import { useAuth } from "@/store/auth";
import { useGoalsStore } from "@/store/goals";
import { apiPut } from "@/lib/api";

export default function AccountOverview() {
  const { me, sub, reload, incomingFriendRequestsCount } = useOutletContext<AccountOutletContext>();
  const location = useLocation();
  const { accessToken } = useAuth((state) => ({
    accessToken: state.accessToken,
  }));

  // Goals store
  const { goals, fetchGoals, updateStats } = useGoalsStore(s => ({
    goals: s.data,
    fetchGoals: s.fetch,
    updateStats: s.updateStats
  }));

  // Local form state for stats
  const [form, setForm] = useState({
    gender: 'male',
    age: '',
    weight: '',
    height: '',
    activity: 'low',
    goal: 'maintain_weight'
  });
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'' | 'saving' | 'saved'>('');
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    email: '',
    profile_about: ''
  });
  const [profileSaveStatus, setProfileSaveStatus] = useState<'' | 'saving' | 'saved'>('');

  useEffect(() => {
    if (accessToken) fetchGoals(accessToken);
  }, [accessToken, fetchGoals]);

  useEffect(() => {
    setProfileForm({
      email: me?.user?.email || '',
      profile_about: me?.user?.profile_about || ''
    });
  }, [me?.user?.email, me?.user?.profile_about]);

  useEffect(() => {
    if (!goals) {
      setForm({
        gender: '',
        age: '',
        weight: '',
        height: '',
        activity: '',
        goal: ''
      });
      return;
    }

    setForm({
      gender: goals.gender || '',
      age: goals.age?.toString() || '',
      weight: goals.weight?.toString() || '',
      height: goals.height?.toString() || '',
      activity: goals.activity_level || '',
      goal: goals.goal_type || ''
    });
  }, [goals]);

  const handleStatChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setIsFormDirty(true);
    setSaveStatus('');
  };

  const saveStats = async () => {
    if (!accessToken) return;
    setSaveStatus('saving');

    try {
      await updateStats(accessToken, {
        gender: form.gender ? form.gender as any : null,
        age: parseInt(form.age) || null,
        weight: parseFloat(form.weight) || null,
        height: parseFloat(form.height) || null,
        activity_level: form.activity ? form.activity as any : null,
        goal_type: form.goal ? form.goal as any : null
      });

      setSaveStatus('saved');
      setIsFormDirty(false);
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err: any) {
      console.error(err);
      setSaveStatus('');
      alert('Ошибка при сохранении: ' + (err.message || 'Unknown error'));
    }
  };

  const handleProfileFieldChange = (field: "email" | "profile_about", value: string) => {
    setProfileForm(prev => ({ ...prev, [field]: value }));
    setProfileSaveStatus('');
  };

  const saveProfile = async () => {
    if (!accessToken) return;
    setProfileSaveStatus('saving');

    try {
      await apiPut<{ ok: boolean; user?: { email: string; profile_about?: string | null } }>("/users/me", {
        email: profileForm.email.trim(),
        profile_about: profileForm.profile_about.trim() || null,
      }, accessToken);
      await reload();
      setProfileSaveStatus('saved');
      setIsProfileEditing(false);
      setTimeout(() => setProfileSaveStatus(''), 2000);
    } catch (err: any) {
      console.error(err);
      setProfileSaveStatus('');
      alert('Ошибка при сохранении профиля: ' + (err.message || 'Unknown error'));
    }
  };

  const createdAt = useMemo(() => {
    if (!me?.user?.created_at) return null;
    try {
      return new Date(me.user.created_at).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (error) {
      console.error("Failed to format created_at", error);
      return null;
    }
  }, [me?.user?.created_at]);

  const profileName = useMemo(() => {
    const backendName = me?.user?.first_name?.trim();
    return backendName || "";
  }, [me?.user?.first_name]);
  const profileInitial = useMemo(() => {
    const source = profileName || me?.user?.email || "U";
    return source.trim().charAt(0).toUpperCase();
  }, [profileName, me?.user?.email]);
  const hasPremium = Boolean(sub && sub.status !== "none" && !sub.expired);
  const hasSubscriptionHistory = Boolean(sub && sub.status !== "none");
  const subscriptionMenuLabel = hasSubscriptionHistory ? "Управлять подпиской" : "Оформить подписку";
  const profileCompletion = useMemo(() => {
    const fields = [
      form.gender,
      form.age,
      form.weight,
      form.height,
      form.activity,
      form.goal,
    ];
    const filled = fields.filter((field) => String(field || "").trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [form]);
  const profileCompletionTone = useMemo(() => {
    if (profileCompletion < 50) return "danger";
    if (profileCompletion < 80) return "warning";
    return "success";
  }, [profileCompletion]);
  const isProfileDetailsPage = location.pathname === "/account/profile";
  const activityOptions = [
    { value: "low", label: "Низкая" },
    { value: "high", label: "Умеренная" },
    { value: "very_high", label: "Высокая" },
  ];
  const desktopActivity = form.activity === "medium" ? "low" : form.activity;
  const profileAbout = me?.user?.profile_about?.trim() || "";
  const profileAboutPlaceholder = "Добавьте информацию";

  return (
    <section
      className="account-panel account-overview"
      aria-labelledby="account-profile-heading"
    >
      {!isProfileDetailsPage && <div className="account-overview-mobile">
        <div className="account-overview-mobile__hero">
          <div className="account-overview-mobile__avatar" aria-hidden="true">
            {profileInitial}
          </div>
          <div className="account-overview-mobile__identity">
            <h2 className="account-overview-mobile__name">{profileName || "Профиль"}</h2>
            <p className="account-overview-mobile__email">{me?.user?.email || "—"}</p>
            <span
              className={`account-overview-mobile__premium${
                hasPremium ? "" : " account-overview-mobile__premium--basic"
              }`}
            >
              {hasPremium ? "Премиум доступ" : "Базовый доступ"}
            </span>
          </div>
        </div>

        <div className="account-overview-mobile__quick">
          <Link className="account-overview-mobile__quick-card" to="/account/favorites">
            <span className="account-overview-mobile__quick-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21s-6.6-4.4-9.3-8C.1 9.8 1.4 5.7 5.2 4.5c2.1-.7 4.4 0 5.8 1.8 1.4-1.8 3.7-2.5 5.8-1.8 3.8 1.2 5.1 5.3 2.5 8.5C18.6 16.6 12 21 12 21z" />
              </svg>
            </span>
            <span>Избранное</span>
          </Link>
          <Link className="account-overview-mobile__quick-card" to="/account/goals">
            <span className="account-overview-mobile__quick-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="4" />
                <path d="M16 8l5-5M17 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>Мои цели</span>
          </Link>
        </div>

        <div className="account-overview-mobile__menu">
          <Link
            className="account-overview-mobile__menu-item account-overview-mobile__menu-item--profile"
            to="/account/profile"
          >
            <span className="account-overview-mobile__menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c1.6-3.5 4.3-5 8-5s6.4 1.5 8 5" strokeLinecap="round" />
              </svg>
            </span>
            <span className="account-overview-mobile__menu-label">Мой профиль</span>
            <span className="account-overview-mobile__menu-progress" aria-label={`Профиль заполнен на ${profileCompletion}%`}>
              <span className={`account-overview-mobile__menu-progress-value account-overview-mobile__menu-progress-value--${profileCompletionTone}`}>
                {profileCompletion}%
              </span>
              <span className="account-overview-mobile__menu-progress-track" aria-hidden="true">
                <span
                  className={`account-overview-mobile__menu-progress-fill account-overview-mobile__menu-progress-fill--${profileCompletionTone}`}
                  style={{ width: `${profileCompletion}%` }}
                />
              </span>
            </span>
          </Link>

          <Link className="account-overview-mobile__menu-item" to="/account/payment-methods">
            <span className="account-overview-mobile__menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="6" width="18" height="12" rx="2" />
                <path d="M3 10h18M7 14h4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="account-overview-mobile__menu-label">Способы платежа</span>
            <span className="account-overview-mobile__menu-arrow" aria-hidden="true">›</span>
          </Link>

          <Link
            className={`account-overview-mobile__menu-item${
              hasPremium ? "" : " account-overview-mobile__menu-item--subscription-cta"
            }`}
            to="/account/subscription"
          >
            <span className="account-overview-mobile__menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 11a8 8 0 0113.7-5.7M20 13a8 8 0 01-13.7 5.7" strokeLinecap="round" />
                <path d="M17 3v4h4M7 21v-4H3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="account-overview-mobile__menu-label">{subscriptionMenuLabel}</span>
            <span className="account-overview-mobile__menu-arrow" aria-hidden="true">›</span>
          </Link>

          <Link className="account-overview-mobile__menu-item" to="/account/statistics">
            <span className="account-overview-mobile__menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 3h11a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
                <path d="M9 3v18M12 8h4M12 12h4M12 16h4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="account-overview-mobile__menu-label">Дневник питания</span>
            <span className="account-overview-mobile__menu-arrow" aria-hidden="true">›</span>
          </Link>

          <Link className="account-overview-mobile__menu-item" to="/account/friends">
            <span className="account-overview-mobile__menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="8" r="3" />
                <circle cx="17" cy="10" r="2.2" />
                <path d="M3 19c1.1-3 3.2-4.5 6-4.5s4.9 1.5 6 4.5" strokeLinecap="round" />
                <path d="M14.5 18.4c.6-1.8 1.9-2.9 3.8-2.9 1.5 0 2.6.6 3.5 1.9" strokeLinecap="round" />
              </svg>
            </span>
            <span className="account-overview-mobile__menu-label">Друзья</span>
            {incomingFriendRequestsCount > 0 ? (
              <span className="account-overview-mobile__menu-badge">{`+${incomingFriendRequestsCount}`}</span>
            ) : null}
            <span className="account-overview-mobile__menu-arrow" aria-hidden="true">›</span>
          </Link>
        </div>
      </div>}

      <div
        id="account-overview-form"
        className={`account-overview-form${isProfileDetailsPage ? " is-open" : ""}`}
      >
        <div className="account-overview-desktop">
          <article className="account-profile-card" aria-labelledby="account-profile-heading">
            <div className="account-profile-card__hero">
              <div className="account-profile-card__avatar" aria-hidden="true">
                {profileInitial}
                <span className="account-profile-card__camera">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M8.5 7.5 10 5.5h4l1.5 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h2.5Z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </span>
              </div>
              <div className="account-profile-card__identity">
                <h2 id="account-profile-heading">{profileName || "Профиль"}</h2>
                <p>{me?.user?.email || "—"}</p>
                {createdAt && <span>С нами с {createdAt}</span>}
              </div>
            </div>
            <div className="account-profile-card__body">
              <span className="account-profile-card__label">О себе</span>
              {isProfileEditing ? (
                <div className="account-profile-card__edit-form">
                  <label className="account-profile-card__field">
                    <span>Почта</span>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={e => handleProfileFieldChange("email", e.target.value)}
                      placeholder="email@example.com"
                    />
                  </label>
                  <label className="account-profile-card__field">
                    <span>О себе</span>
                    <textarea
                      value={profileForm.profile_about}
                      onChange={e => handleProfileFieldChange("profile_about", e.target.value)}
                      placeholder={profileAboutPlaceholder}
                      rows={4}
                    />
                  </label>
                  <div className="account-profile-card__edit-actions">
                    <button
                      type="button"
                      className="account-profile-card__edit account-profile-card__edit--save"
                      onClick={saveProfile}
                      disabled={profileSaveStatus === 'saving'}
                    >
                      {profileSaveStatus === 'saving' ? 'Сохраняем...' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      className="account-profile-card__edit account-profile-card__edit--ghost"
                      onClick={() => {
                        setProfileForm({
                          email: me?.user?.email || '',
                          profile_about: me?.user?.profile_about || ''
                        });
                        setIsProfileEditing(false);
                      }}
                      disabled={profileSaveStatus === 'saving'}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={profileAbout ? "" : "account-profile-card__about-placeholder"}>
                    {profileAbout || profileAboutPlaceholder}
                  </p>
                  <button
                    type="button"
                    className="account-profile-card__edit"
                    onClick={() => setIsProfileEditing(true)}
                  >
                    Редактировать профиль
                  </button>
                </>
              )}
              {profileSaveStatus === 'saved' && <span className="account-profile-card__saved">Сохранено</span>}
            </div>
          </article>

          <article className="account-about-card" aria-labelledby="account-about-heading">
            <div className="account-about-card__header">
              <h3 id="account-about-heading">О вас</h3>
              <div className="account-about-card__actions">
                {saveStatus === 'saved' && <span className="text-success">Сохранено</span>}
                {isFormDirty && (
                  <button
                    className="account-about-card__save"
                    onClick={saveStats}
                    disabled={saveStatus === 'saving'}
                  >
                    {saveStatus === 'saving' ? '...' : 'Сохранить'}
                  </button>
                )}
              </div>
            </div>

            <div className="stats-grid">
              <div className="form-group">
                <label>Пол</label>
                <select value={form.gender} onChange={e => handleStatChange('gender', e.target.value)}>
                  <option value="">Не указывать</option>
                  <option value="male">Мужской</option>
                  <option value="female">Женский</option>
                </select>
              </div>
              <div className="form-group">
                <label>Возраст (лет)</label>
                <input type="number" value={form.age} onChange={e => handleStatChange('age', e.target.value)} placeholder="25" />
              </div>
              <div className="form-group">
                <label>Вес (кг)</label>
                <input type="text" inputMode="decimal" value={form.weight} onChange={e => handleStatChange('weight', e.target.value)} placeholder="52,00" />
              </div>
              <div className="form-group">
                <label>Рост (см)</label>
                <input type="text" inputMode="decimal" value={form.height} onChange={e => handleStatChange('height', e.target.value)} placeholder="164,00" />
              </div>
              <div className="form-group form-group--activity full">
                <label>Активность</label>
                <div className="activity-segmented" role="group" aria-label="Активность">
                  {activityOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`activity-segmented__option${desktopActivity === option.value ? " is-active" : ""}`}
                      onClick={() => handleStatChange("activity", option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <div className="account-benefits-strip" aria-label="Возможности RestSecret">
            <div className="account-benefit">
              <span className="account-benefit__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 14c4.3-1.2 7.3-4.2 9-9 3 1.5 4.4 3.6 4.2 6.1-.2 3.2-2.7 5.4-6.2 5.7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 20c2.7-4.2 6-6.3 10-6.3M14.5 7.5l3-3M17.7 7.7h2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <strong>Умный подбор блюд</strong>
              </div>
            </div>
            <div className="account-benefit">
              <span className="account-benefit__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="13" r="7" />
                  <path d="M12 6V3M9 3h6M12 13V9M12 13h3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <strong>Экономия времени</strong>
              </div>
            </div>
            <div className="account-benefit">
              <span className="account-benefit__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 20s-7-4.3-8.4-9.1C2.7 7.6 4.7 5 7.6 5c1.8 0 3.2.9 4.4 2.4C13.2 5.9 14.6 5 16.4 5c2.9 0 4.9 2.6 4 5.9C19 15.7 12 20 12 20Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <strong>Осознанный выбор</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
