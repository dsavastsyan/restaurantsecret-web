import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { useGoalsStore } from '@/store/goals';
import { analytics } from '@/services/analytics';

import goalMenuImg from '@/assets/icons/goal-menu.png';

const parseManualGoalValue = (value: string) => {
    const parsed = value === '' ? 0 : Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
};

export default function Goals() {
    const navigate = useNavigate();
    const token = useAuth(s => s.accessToken);
    const { data, isLoading, fetch, updateTargets, recalculate } = useGoalsStore(s => ({
        data: s.data,
        isLoading: s.isLoading,
        fetch: s.fetch,
        updateTargets: s.updateTargets,
        recalculate: s.recalculate
    }));

    const [showManualForm, setShowManualForm] = useState(false);
    const [manualForm, setManualForm] = useState({
        calories: '',
        protein: '',
        fat: '',
        carbs: ''
    });

    useEffect(() => {
        if (token) {
            fetch(token);
        }
    }, [token, fetch]);

    useEffect(() => {
        if (data) {
            setManualForm({
                calories: data.target_calories?.toString() || '',
                protein: data.target_protein?.toString() || '',
                fat: data.target_fat?.toString() || '',
                carbs: data.target_carbs?.toString() || ''
            });
        }
    }, [data]);

    if (isLoading && !data) return <div className="goals-loading">Загрузка...</div>;

    // Check if user has body parameters saved
    const hasBodyParams = data && data.age && data.weight && data.height;

    // Check if goals exist and are calculated
    const hasGoals = data && data.target_calories && data.target_calories > 0;

    // Check if goals are auto-calculated or manual
    const isAutoCalculated = data?.is_auto_calculated !== false;

    const handleProfileClick = () => {
        analytics.track('goals_profile_opened');
        navigate('/account');
    };

    const handleShowManualForm = () => {
        analytics.track('goals_manual_editor_opened');
        setShowManualForm(true);
    };

    const handleCloseManualForm = () => {
        setShowManualForm(false);
        // Reset form to current values
        if (data) {
            setManualForm({
                calories: data.target_calories?.toString() || '',
                protein: data.target_protein?.toString() || '',
                fat: data.target_fat?.toString() || '',
                carbs: data.target_carbs?.toString() || ''
            });
        }
    };

    const handleManualFormChange = (field: string, value: string) => {
        setManualForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveManualGoals = async () => {
        if (!token) return;

        const calories = parseManualGoalValue(manualForm.calories);
        const protein = parseManualGoalValue(manualForm.protein);
        const fat = parseManualGoalValue(manualForm.fat);
        const carbs = parseManualGoalValue(manualForm.carbs);

        if ([calories, protein, fat, carbs].some(value => !Number.isFinite(value) || value < 0)) {
            alert('Значения КБЖУ не могут быть отрицательными');
            return;
        }

        try {
            await updateTargets(token, {
                target_calories: calories,
                target_protein: protein,
                target_fat: fat,
                target_carbs: carbs,
                is_auto_calculated: false
            });
            setShowManualForm(false);
            analytics.track('goals_manual_updated');
        } catch (err) {
            console.error('Error saving manual goals:', err);
            analytics.track('goals_manual_update_failed', { error_status: err?.status || 'request_failed' });
            alert('Ошибка при сохранении целей');
        }
    };

    const handleAutoRecalculate = async () => {
        if (!token) return;

        try {
            await recalculate(token);
            analytics.track('goals_auto_recalculated');
        } catch (err) {
            console.error('Error recalculating goals:', err);
            analytics.track('goals_auto_recalculate_failed', { error_status: err?.status || 'request_failed' });
            alert('Ошибка при пересчёте целей');
        }
    };

    // Determine button text and action based on state
    let buttonText = '';
    let buttonAction = () => { };
    let hintText = '';

    if (!hasBodyParams) {
        // State 1: No body parameters
        buttonText = 'Заполнить параметры';
        buttonAction = handleProfileClick;
        hintText = 'Заполните Ваши параметры в Профиле, для расчета вашей нормы';
    } else if (isAutoCalculated) {
        // State 2: Has parameters, auto-calculated
        buttonText = 'Ввести свои значения';
        buttonAction = handleShowManualForm;
        hintText = 'Цели рассчитаны автоматически. Вы можете ввести свои значения.';
    } else {
        // State 3: Has parameters, manually entered
        buttonText = 'Авто определить цели';
        buttonAction = handleAutoRecalculate;
        hintText = 'Используются ваши цели. Можно вернуться к автоматическому расчёту.';
    }

    return (
        <>
            <div className="account-section goals-hero">
                <div className="goals-hero__card">
                    <h2 className="goals-hero__title">Мои цели</h2>
                    <p className="goals-hero__subtitle">Суточная норма КБЖУ</p>

                    <div className="goals-hero__illustration" aria-hidden="true">
                        <img
                            src={goalMenuImg}
                            alt="Target Goals"
                            style={{ maxWidth: '220px', height: 'auto', display: 'block', margin: '0 auto' }}
                        />
                    </div>

                    <div className="goals-hero__stats" style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '24px', textAlign: 'center' }}>
                        <div className="goals-stat">
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#475569' }}>
                                {hasGoals ? Math.round(data.target_calories) : '-'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>Ккал</div>
                        </div>
                        <div className="goals-stat">
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4b5563' }}>
                                {hasGoals ? Math.round(data.target_protein) : '-'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>Белки</div>
                        </div>
                        <div className="goals-stat">
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4b5563' }}>
                                {hasGoals ? Math.round(data.target_fat) : '-'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>Жиры</div>
                        </div>
                        <div className="goals-stat">
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4b5563' }}>
                                {hasGoals ? Math.round(data.target_carbs) : '-'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>Углев.</div>
                        </div>
                    </div>

                    <p className="goals-hero__hint">{hintText}</p>
                    <button className="goals-hero__button" type="button" onClick={buttonAction}>
                        {buttonText}
                    </button>
                </div>
            </div>

            {showManualForm && (
                <div className="goals-modal" role="dialog" aria-modal="true" onClick={handleCloseManualForm}>
                    <div className="goals-modal__dialog" onClick={(e) => e.stopPropagation()}>
                        <h3 className="goals-modal__title">Введите свои цели КБЖУ</h3>

                        <div className="goals-modal__form">
                            <div className="form-group">
                                <label>Калории (ккал)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={manualForm.calories}
                                    onChange={(e) => handleManualFormChange('calories', e.target.value)}
                                    placeholder="2000"
                                />
                            </div>
                            <div className="form-group">
                                <label>Белки (г)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={manualForm.protein}
                                    onChange={(e) => handleManualFormChange('protein', e.target.value)}
                                    placeholder="150"
                                />
                            </div>
                            <div className="form-group">
                                <label>Жиры (г)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={manualForm.fat}
                                    onChange={(e) => handleManualFormChange('fat', e.target.value)}
                                    placeholder="70"
                                />
                            </div>
                            <div className="form-group">
                                <label>Углеводы (г)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={manualForm.carbs}
                                    onChange={(e) => handleManualFormChange('carbs', e.target.value)}
                                    placeholder="200"
                                />
                            </div>
                        </div>

                        <div className="goals-modal__actions">
                            <button
                                type="button"
                                className="account-button account-button--outline"
                                onClick={handleCloseManualForm}
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                className="account-button account-button--primary"
                                onClick={handleSaveManualGoals}
                            >
                                Сохранить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
