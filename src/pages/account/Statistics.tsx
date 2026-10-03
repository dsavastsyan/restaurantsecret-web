import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { searchStoreProducts, type StoreProduct } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useDiaryStore, type DiaryEntry } from '@/store/diary';
import { useGoalsStore } from '@/store/goals';
import { useSubscriptionStore } from '@/store/subscription';
import { analytics } from '@/services/analytics';
const formatDateCompact = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
    return `${day} ${month}`;
};

const shiftDateByDays = (dateStr: string, delta: number) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + delta);
    return date.toISOString().slice(0, 10);
};

const getProgress = (value: number, target?: number | null) => {
    if (!target || target <= 0) return 0;
    return Math.min(100, Math.max(0, (value / target) * 100));
};

const formatTarget = (value?: number | null, unit = '') => {
    if (!value || value <= 0) return '—';
    return `${Math.round(value)}${unit}`;
};

const formatProductValue = (value?: number | null, unit = '') => {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const rounded = Math.round(Number(value) * 10) / 10;
    return `${Number.isInteger(rounded) ? Math.round(rounded) : rounded}${unit}`;
};

type ProductNutritionMode = 'serving' | 'per100';
type DiaryProductUnit = 'serving' | 'grams';

type NutritionValues = {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
};

type DiaryProductEditor = {
    unit: DiaryProductUnit;
    amount: string;
    servingQuantity?: number | null;
    servingNutrition: NutritionValues;
    per100Nutrition: NutritionValues;
};

const getProductKey = (product: StoreProduct) => `${product.source}:${product.sourceProductCode}`;

const normalizeProductUnit = (unit?: string | null) => {
    const text = unit?.trim().toLowerCase();
    if (!text) return '';
    if (['g', 'gr', 'gram', 'grams', 'г', 'гр', 'грамм', 'грамма', 'граммов'].includes(text)) return 'г';
    if (['ml', 'мл', 'milliliter', 'milliliters', 'миллилитр', 'миллилитра', 'миллилитров'].includes(text)) return 'мл';
    return unit?.trim() || '';
};

const normalizeProductAmountText = (value: string) =>
    value
        .replace(/(\d)\s*(grams?|gr|g)\b/gi, '$1 г')
        .replace(/(\d)\s*(milliliters?|ml)\b/gi, '$1 мл')
        .replace(/\bgrams?\b/gi, 'г')
        .replace(/\bgr\b/gi, 'г')
        .replace(/\bg\b/gi, 'г')
        .replace(/\bmilliliters?\b/gi, 'мл')
        .replace(/\bml\b/gi, 'мл')
        .replace(/(\d)\s*(г|мл)\b/gi, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();

const normalizeServingSizeText = (value: string) => {
    const text = normalizeProductAmountText(value)
        .replace(/[()]/g, ' ')
        .replace(/\b1\s*порц(?:ия|ии|ий)?\.?\b/gi, '1 порция')
        .replace(/\bпорц(?:ия|ии|ий)?\.?\b/gi, 'порция')
        .replace(/\b1\s*(portion|serving|piece|item|unit)\b/gi, '1 порция')
        .replace(/\b([2-4])\s*(portions|servings|pieces|items|units|portion|serving|piece|item|unit)\b/gi, '$1 порции')
        .replace(/\b(\d+)\s*(portions|servings|pieces|items|units|portion|serving|piece|item|unit)\b/gi, '$1 порций')
        .replace(/\bportion\b/gi, 'порция')
        .replace(/\bserving\b/gi, 'порция')
        .replace(/\bpiece\b/gi, 'порция')
        .replace(/\bitem\b/gi, 'порция')
        .replace(/\bunit\b/gi, 'порция')
        .replace(/\bportions\b/gi, 'порции')
        .replace(/\bservings\b/gi, 'порции')
        .replace(/\bpieces\b/gi, 'порции')
        .replace(/\bitems\b/gi, 'порции')
        .replace(/\bunits\b/gi, 'порции')
        .replace(/\s+/g, ' ')
        .trim();

    if (/^порция\b/i.test(text)) return text.replace(/^порция\b/i, '1 порция');
    return text || value;
};

const getProductServingLabel = (product: StoreProduct) => {
    if (product.servingSize) return normalizeServingSizeText(product.servingSize);
    if (product.servingQuantity && product.servingQuantityUnit) {
        return `1 порция ${formatProductValue(product.servingQuantity)} ${normalizeProductUnit(product.servingQuantityUnit)}`;
    }
    if (product.quantityText) return normalizeProductAmountText(product.quantityText);
    return '100 г';
};

const hasProductServingNutrition = (product: StoreProduct) =>
    product.kcalPerServing != null ||
    product.proteinsGPerServing != null ||
    product.fatsGPerServing != null ||
    product.carbsGPerServing != null;

const hasProductPer100Nutrition = (product: StoreProduct) =>
    product.kcalPer100 != null ||
    product.proteinsGPer100 != null ||
    product.fatsGPer100 != null ||
    product.carbsGPer100 != null;

const getDefaultProductNutritionMode = (product: StoreProduct): ProductNutritionMode =>
    hasProductServingNutrition(product) ? 'serving' : 'per100';

const getProductNutrition = (product: StoreProduct, mode = getDefaultProductNutritionMode(product)) => {
    const useServing = mode === 'serving' && hasProductServingNutrition(product);
    return {
        calories: useServing ? product.kcalPerServing : product.kcalPer100,
        protein: useServing ? product.proteinsGPerServing : product.proteinsGPer100,
        fat: useServing ? product.fatsGPerServing : product.fatsGPer100,
        carbs: useServing ? product.carbsGPerServing : product.carbsGPer100,
    };
};

const toNutritionValues = (nutrition: ReturnType<typeof getProductNutrition>): NutritionValues => ({
    calories: Number(nutrition.calories) || 0,
    protein: Number(nutrition.protein) || 0,
    fat: Number(nutrition.fat) || 0,
    carbs: Number(nutrition.carbs) || 0,
});

const scaleNutrition = (nutrition: NutritionValues, factor: number): NutritionValues => ({
    calories: nutrition.calories * factor,
    protein: nutrition.protein * factor,
    fat: nutrition.fat * factor,
    carbs: nutrition.carbs * factor,
});

const getDerivedServingNutrition = (product: StoreProduct) => {
    const serving = toNutritionValues(getProductNutrition(product, 'serving'));
    if (hasProductServingNutrition(product)) return serving;

    const per100 = toNutritionValues(getProductNutrition(product, 'per100'));
    const servingQuantity = Number(product.servingQuantity) || 100;
    return scaleNutrition(per100, servingQuantity / 100);
};

const getDerivedPer100Nutrition = (product: StoreProduct) => {
    const per100 = toNutritionValues(getProductNutrition(product, 'per100'));
    if (hasProductPer100Nutrition(product)) return per100;

    const serving = toNutritionValues(getProductNutrition(product, 'serving'));
    const servingQuantity = Number(product.servingQuantity) || 100;
    return scaleNutrition(serving, 100 / servingQuantity);
};

const createDiaryProductEditor = (product: StoreProduct, mode: ProductNutritionMode): DiaryProductEditor => ({
    unit: mode === 'serving' ? 'serving' : 'grams',
    amount: mode === 'serving' ? '1' : '100',
    servingQuantity: product.servingQuantity || null,
    servingNutrition: getDerivedServingNutrition(product),
    per100Nutrition: getDerivedPer100Nutrition(product),
});

const parseAmountInput = (value: string) => {
    const amount = Number(value.replace(',', '.'));
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

const getDiaryEditorPayload = (editor: DiaryProductEditor) => {
    const fallbackAmount = editor.unit === 'serving' ? 1 : 100;
    const amount = parseAmountInput(editor.amount) ?? fallbackAmount;
    const nutrition =
        editor.unit === 'serving'
            ? scaleNutrition(editor.servingNutrition, amount)
            : scaleNutrition(editor.per100Nutrition, amount / 100);
    const weight =
        editor.unit === 'grams'
            ? amount
            : editor.servingQuantity
                ? editor.servingQuantity * amount
                : null;

    return {
        calories: Math.round(nutrition.calories),
        protein: Math.round(nutrition.protein * 10) / 10,
        fat: Math.round(nutrition.fat * 10) / 10,
        carbs: Math.round(nutrition.carbs * 10) / 10,
        weight,
    };
};

const getDiaryEntryNutrition = (entry: DiaryEntry, editor?: DiaryProductEditor) => {
    if (editor) return getDiaryEditorPayload(editor);
    return {
        calories: Number(entry.calories) || 0,
        protein: Number(entry.protein) || 0,
        fat: Number(entry.fat) || 0,
        carbs: Number(entry.carbs) || 0,
        weight: entry.weight == null ? null : Number(entry.weight),
    };
};

const getProductDiaryPayload = (product: StoreProduct, mode = getDefaultProductNutritionMode(product)) => {
    const nutrition = getProductNutrition(product, mode);
    const useServing = mode === 'serving' && hasProductServingNutrition(product);
    const weight =
        useServing && product.servingQuantity
            ? product.servingQuantity
            : 100;

    return {
        name: product.brand ? `${product.productName}, ${product.brand}` : product.productName,
        calories: nutrition.calories,
        protein: nutrition.protein,
        fat: nutrition.fat,
        carbs: nutrition.carbs,
        weight
    };
};

const NutritionIcon = ({ type }: { type: 'calories' | 'protein' | 'fat' | 'carbs' }) => {
    if (type === 'calories') {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12.3 21c-4.1 0-7.3-2.9-7.3-7 0-2.8 1.4-4.7 3.3-6.5.6 2.1 1.8 3.1 3.1 3.5-.5-3.2.8-5.9 3.2-8 1 3.2 4.4 5.3 4.4 10.5 0 4.4-3.1 7.5-6.7 7.5Z" />
                <path d="M12 18.5c-1.9 0-3.4-1.3-3.4-3.3 0-1.4.7-2.4 1.6-3.2.3 1 .9 1.5 1.6 1.7-.3-1.5.4-2.8 1.5-3.8.5 1.5 2.1 2.5 2.1 5 0 2.1-1.5 3.6-3.4 3.6Z" />
            </svg>
        );
    }

    if (type === 'protein') {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5.3 18.7c4.7-.2 8.4-2.1 11-5.8 2-2.9 2.4-5.7 2.4-7.6-4.2.3-7.7 1.9-10.4 4.7-2.4 2.5-3.3 5.5-3 8.7Z" />
                <path d="M5.3 18.7 18 6" />
                <path d="M8.5 15.6 5 12.1" />
            </svg>
        );
    }

    if (type === 'fat') {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21a7 7 0 0 1-7-7c0-4.4 5.6-9.9 6.7-10.9a.4.4 0 0 1 .6 0C13.4 4.1 19 9.6 19 14a7 7 0 0 1-7 7Z" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.2 18.8c5.1-.5 8.4-3.3 10.1-8.3.8-2.3.9-4.4.8-5.7-3.8.4-6.8 2.1-8.9 5-1.7 2.3-2.4 5.3-2 9Z" />
            <path d="M6.5 19.5 18 5" />
            <path d="M9.2 15.1 5.6 13" />
            <path d="m11.6 11.9-3.3-2" />
            <path d="m12.2 11.4 4 .3" />
            <path d="m9.8 14.7 4.5.5" />
        </svg>
    );
};

export default function Statistics() {
    const token = useAuth(s => s.accessToken);
    const {
        entries, dayStats, selectedDate, isLoading, setDate, fetchDay, removeEntry, addEntry, updateEntry
    } = useDiaryStore(s => ({
        entries: s.entries,
        dayStats: s.dayStats,
        selectedDate: s.selectedDate,
        isLoading: s.isLoading,
        setDate: s.setDate,
        fetchDay: s.fetchDay,
        removeEntry: s.removeEntry,
        addEntry: s.addEntry,
        updateEntry: s.updateEntry
    }));

    const { hasActiveSub } = useSubscriptionStore(s => ({ hasActiveSub: s.hasActiveSub }));
    const navigate = useNavigate();

    // We need goals to calculate remaining
    const { data: goalData, fetch: fetchGoals } = useGoalsStore(s => ({ data: s.data, fetch: s.fetch }));

    const [manualForm, setManualForm] = useState({
        name: '', calories: '', protein: '', fat: '', carbs: '', weight: ''
    });
    const [isAdding, setIsAdding] = useState(false);
    const [productQuery, setProductQuery] = useState('');
    const [productResults, setProductResults] = useState<StoreProduct[]>([]);
    const [isProductSearchLoading, setIsProductSearchLoading] = useState(false);
    const [productSearchError, setProductSearchError] = useState('');
    const [addingProductCode, setAddingProductCode] = useState<string | null>(null);
    const [productNutritionModes, setProductNutritionModes] = useState<Record<string, ProductNutritionMode>>({});
    const [diaryProductEditors, setDiaryProductEditors] = useState<Record<string, DiaryProductEditor>>({});

    useEffect(() => {
        if (token) {
            fetchDay(token, selectedDate);
            if (!goalData) fetchGoals(token);
        }
    }, [token, selectedDate, fetchDay, fetchGoals, goalData]);

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDate(e.target.value);
        analytics.track('diary_date_changed', { selected_date: e.target.value });
    };

    const handleShiftDate = (delta: number) => {
        const nextDate = shiftDateByDays(selectedDate, delta);
        setDate(nextDate);
        analytics.track('diary_date_changed', { selected_date: nextDate, direction: delta < 0 ? 'previous' : 'next' });
    };

    const handleDelete = async (id: string) => {
        if (confirm('Удалить запись?')) {
            if (token) {
                await removeEntry(token, id);
                analytics.track('diary_entry_removed');
            }
            setDiaryProductEditors((current) => {
                const next = { ...current };
                delete next[String(id)];
                return next;
            });
        }
    };

    const persistDiaryProductEditor = async (entry: DiaryEntry, editor: DiaryProductEditor) => {
        if (!token) return;
        await updateEntry(token, entry.id, getDiaryEditorPayload(editor));
    };

    const handleDiaryProductAmountChange = (entry: DiaryEntry, value: string) => {
        setDiaryProductEditors((current) => {
            const editor = current[String(entry.id)];
            if (!editor) return current;
            return {
                ...current,
                [String(entry.id)]: { ...editor, amount: value }
            };
        });
    };

    const handleDiaryProductUnitChange = async (entry: DiaryEntry, unit: DiaryProductUnit) => {
        const currentEditor = diaryProductEditors[String(entry.id)];
        if (!currentEditor) return;

        const nextEditor = {
            ...currentEditor,
            unit,
            amount: unit === 'serving' ? '1' : '100'
        };

        setDiaryProductEditors((current) => ({
            ...current,
            [String(entry.id)]: nextEditor
        }));
        await persistDiaryProductEditor(entry, nextEditor);
    };

    const handleDiaryProductAmountCommit = async (entry: DiaryEntry) => {
        const editor = diaryProductEditors[String(entry.id)];
        if (!editor || parseAmountInput(editor.amount) == null) return;
        await persistDiaryProductEditor(entry, editor);
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        if (!hasActiveSub) {
            navigate('/account/subscription', { state: { from: window.location.pathname + window.location.search } });
            return;
        }

        await addEntry(token, {
            name: manualForm.name,
            calories: Number(manualForm.calories) || 0,
            protein: Number(manualForm.protein) || 0,
            fat: Number(manualForm.fat) || 0,
            carbs: Number(manualForm.carbs) || 0,
            weight: Number(manualForm.weight) || null
        });
        analytics.track('diary_manual_entry_added');

        setManualForm({ name: '', calories: '', protein: '', fat: '', carbs: '', weight: '' });
        setIsAdding(false);
    };

    useEffect(() => {
        const query = productQuery.trim();
        if (query.length < 2) {
            setProductResults([]);
            setProductSearchError('');
            setIsProductSearchLoading(false);
            return;
        }

        let isCurrent = true;
        setIsProductSearchLoading(true);
        setProductSearchError('');

        const timer = window.setTimeout(async () => {
            try {
                const response = await searchStoreProducts(query, 12);
                if (!isCurrent) return;
                setProductResults(response.products || []);
                analytics.track('diary_product_search_completed', {
                    query_length: query.length,
                    results_count: response.products?.length || 0,
                });
            } catch (error) {
                console.error(error);
                analytics.track('diary_product_search_failed', { query_length: query.length, error_status: error?.status || 'request_failed' });
                if (!isCurrent) return;
                setProductResults([]);
                setProductSearchError('Не удалось загрузить продукты');
            } finally {
                if (isCurrent) setIsProductSearchLoading(false);
            }
        }, 260);

        return () => {
            isCurrent = false;
            window.clearTimeout(timer);
        };
    }, [productQuery]);

    const handleStoreProductAdd = async (product: StoreProduct, mode = getDefaultProductNutritionMode(product)) => {
        if (!token) return;
        if (!hasActiveSub) {
            navigate('/account/subscription', { state: { from: window.location.pathname + window.location.search } });
            return;
        }

        const payload = getProductDiaryPayload(product, mode);
        setAddingProductCode(getProductKey(product));
        const addedEntry = await addEntry(token, {
            name: payload.name,
            calories: Number(payload.calories) || 0,
            protein: Number(payload.protein) || 0,
            fat: Number(payload.fat) || 0,
            carbs: Number(payload.carbs) || 0,
            weight: Number(payload.weight) || null
        });
        if (addedEntry?.id) {
            setDiaryProductEditors((current) => ({
                ...current,
                [String(addedEntry.id)]: createDiaryProductEditor(product, mode)
            }));
        }
        analytics.track('diary_store_product_added', { source: product.source, nutrition_mode: mode });
        setAddingProductCode(null);
        setProductQuery('');
        setProductResults([]);
    };

    const targets = {
        calories: goalData?.target_calories || 0,
        protein: goalData?.target_protein || 0,
        fat: goalData?.target_fat || 0,
        carbs: goalData?.target_carbs || 0,
    };

    const progress = {
        calories: getProgress(dayStats.calories, targets.calories),
        protein: getProgress(dayStats.protein, targets.protein),
        fat: getProgress(dayStats.fat, targets.fat),
        carbs: getProgress(dayStats.carbs, targets.carbs),
    };

    const remainingCalories = Math.max(0, Math.round(targets.calories - dayStats.calories));

    return (
        <div className="account-section statistics-section">
            <div className="nds">
                <div className="ndsHeader">
                    <div className="ndsDateWrap">
                        <button className="ndsDateBtn" type="button" onClick={() => handleShiftDate(-1)} aria-label="Предыдущий день">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>
                        <div className="ndsDatePill">
                            <span className="ndsCalIcon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                            </span>
                            <span className="ndsDateText">{formatDateCompact(selectedDate)}</span>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={handleDateChange}
                                className="ndsDateInput"
                            />
                        </div>
                        <button className="ndsDateBtn" type="button" onClick={() => handleShiftDate(1)} aria-label="Следующий день">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="ndsCard ndsCardMain">
                    <div className="ndsMetricLayout">
                        <span className="ndsMetricIcon ndsMetricIcon--calories">
                            <NutritionIcon type="calories" />
                        </span>
                        <div className="ndsMetricBody">
                            <div className="ndsMetricTopline">
                                <div>
                                    <div className="ndsStrong">Калории</div>
                                    <div className="ndsCardValue">
                                        {Math.round(dayStats.calories)}
                                        <span className="ndsMuted">/ {formatTarget(targets.calories)}</span>
                                    </div>
                                </div>
                                {targets.calories > 0 && (
                                    <div className="ndsRemaining">Осталось <strong>{remainingCalories} ккал</strong></div>
                                )}
                            </div>
                            <div className="ndsProgressRow">
                                <div className="ndsBar">
                                    <div
                                        className="ndsBarFill ndsBarFillGreen"
                                        style={{ width: `${progress.calories}%` }}
                                    ></div>
                                </div>
                                <span className="ndsPercent">{Math.round(progress.calories)}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="ndsTiles">
                    <div className="ndsTile ndsTile--protein">
                        <div className="ndsTileMain">
                            <span className="ndsMetricIcon ndsMetricIcon--protein">
                                <NutritionIcon type="protein" />
                            </span>
                            <div>
                                <div className="ndsTileHead">Белки</div>
                                <div className="ndsTileNums">
                                    <span className="ndsStrong">{Math.round(dayStats.protein)}</span>
                                    <span className="ndsMuted">/ {formatTarget(targets.protein, ' г')}</span>
                                </div>
                            </div>
                        </div>
                        <div className="ndsProgressRow">
                            <div className="ndsBar ndsBarSmall">
                                <div
                                    className="ndsBarFill toneGreen"
                                    style={{ width: `${progress.protein}%` }}
                                ></div>
                            </div>
                            <span className="ndsPercent">{Math.round(progress.protein)}%</span>
                        </div>
                    </div>
                    <div className="ndsTile ndsTile--fat">
                        <div className="ndsTileMain">
                            <span className="ndsMetricIcon ndsMetricIcon--fat">
                                <NutritionIcon type="fat" />
                            </span>
                            <div>
                                <div className="ndsTileHead">Жиры</div>
                                <div className="ndsTileNums">
                                    <span className="ndsStrong">{Math.round(dayStats.fat)}</span>
                                    <span className="ndsMuted">/ {formatTarget(targets.fat, ' г')}</span>
                                </div>
                            </div>
                        </div>
                        <div className="ndsProgressRow">
                            <div className="ndsBar ndsBarSmall">
                                <div
                                    className="ndsBarFill toneAmber"
                                    style={{ width: `${progress.fat}%` }}
                                ></div>
                            </div>
                            <span className="ndsPercent">{Math.round(progress.fat)}%</span>
                        </div>
                    </div>
                    <div className="ndsTile ndsTile--carbs">
                        <div className="ndsTileMain">
                            <span className="ndsMetricIcon ndsMetricIcon--carbs">
                                <NutritionIcon type="carbs" />
                            </span>
                            <div>
                                <div className="ndsTileHead">Углеводы</div>
                                <div className="ndsTileNums">
                                    <span className="ndsStrong">{Math.round(dayStats.carbs)}</span>
                                    <span className="ndsMuted">/ {formatTarget(targets.carbs, ' г')}</span>
                                </div>
                            </div>
                        </div>
                        <div className="ndsProgressRow">
                            <div className="ndsBar ndsBarSmall">
                                <div
                                    className="ndsBarFill tonePurple"
                                    style={{ width: `${progress.carbs}%` }}
                                ></div>
                            </div>
                            <span className="ndsPercent">{Math.round(progress.carbs)}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <section className="diary-product-search" aria-label="Поиск продуктов для дневника">
                <div className="diary-product-search__field">
                    <span className="diary-product-search__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.3-4.3" />
                        </svg>
                    </span>
                    <input
                        type="search"
                        value={productQuery}
                        onChange={(event) => setProductQuery(event.target.value)}
                        placeholder="Найти продукт или блюдо из магазина"
                        autoComplete="off"
                    />
                    {productQuery && (
                        <button
                            type="button"
                            className="diary-product-search__clear"
                            onClick={() => {
                                setProductQuery('');
                                setProductResults([]);
                            }}
                            aria-label="Очистить поиск"
                        >
                            ×
                        </button>
                    )}
                </div>

                <div className="diary-product-search__status" aria-live="polite">
                    {productQuery.trim().length < 2 && 'Начните вводить название, например творог или батончик'}
                    {productQuery.trim().length >= 2 && isProductSearchLoading && 'Ищем в базе продуктов...'}
                    {productQuery.trim().length >= 2 && !isProductSearchLoading && productSearchError}
                    {productQuery.trim().length >= 2 && !isProductSearchLoading && !productSearchError && productResults.length === 0 && 'Ничего не нашли'}
                </div>

                {productResults.length > 0 && (
                    <div className="diary-product-results">
                        {productResults.map((product) => {
                            const productKey = getProductKey(product);
                            const selectedMode = productNutritionModes[productKey] || getDefaultProductNutritionMode(product);
                            const nutrition = getProductNutrition(product, selectedMode);
                            const canToggleNutrition = hasProductServingNutrition(product) && hasProductPer100Nutrition(product);
                            const isAddingProduct = addingProductCode === productKey;
                            return (
                                <div
                                    key={`${product.source}:${product.sourceProductCode}`}
                                    className={`diary-product-result${isAddingProduct ? ' diary-product-result--disabled' : ''}`}
                                >
                                    {product.imageFrontUrl ? (
                                        <img src={product.imageFrontUrl} alt="" loading="lazy" />
                                    ) : (
                                        <span className="diary-product-result__image-placeholder" aria-hidden="true">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M4 11h16" />
                                                <path d="M5 11c.8 5.3 2.9 8 7 8s6.2-2.7 7-8" />
                                                <path d="M8 8c.7-2 2-3 4-3s3.3 1 4 3" />
                                            </svg>
                                        </span>
                                    )}
                                    <span className="diary-product-result__body">
                                        <span className="diary-product-result__name">{product.productName}</span>
                                        {product.brand && (
                                            <span className="diary-product-result__meta">
                                                <span>{product.brand}</span>
                                            </span>
                                        )}
                                        {canToggleNutrition ? (
                                            <span className="diary-product-result__basis" role="group" aria-label="Показать КБЖУ">
                                                <button
                                                    type="button"
                                                    className={`diary-product-result__basis-option${selectedMode === 'serving' ? ' diary-product-result__basis-option--active' : ''}`}
                                                    onClick={() => setProductNutritionModes((current) => ({ ...current, [productKey]: 'serving' }))}
                                                    aria-pressed={selectedMode === 'serving'}
                                                >
                                                    {getProductServingLabel(product)}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`diary-product-result__basis-option${selectedMode === 'per100' ? ' diary-product-result__basis-option--active' : ''}`}
                                                    onClick={() => setProductNutritionModes((current) => ({ ...current, [productKey]: 'per100' }))}
                                                    aria-pressed={selectedMode === 'per100'}
                                                >
                                                    100 г
                                                </button>
                                            </span>
                                        ) : (
                                            <span className="diary-product-result__meta">
                                                <span>{selectedMode === 'serving' ? getProductServingLabel(product) : '100 г'}</span>
                                            </span>
                                        )}
                                        <span className="diary-product-result__nutrition">
                                            {formatProductValue(nutrition.calories, ' ккал')} • Б {formatProductValue(nutrition.protein)} • Ж {formatProductValue(nutrition.fat)} • У {formatProductValue(nutrition.carbs)}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        className="diary-product-result__add"
                                        onClick={() => handleStoreProductAdd(product, selectedMode)}
                                        disabled={isAddingProduct}
                                        aria-label={`Добавить ${product.productName} в дневник`}
                                    >
                                        {isAddingProduct ? '...' : '+'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!isAdding && (
                    <button className="diary-product-search__manual" type="button" onClick={() => {
                        if (!hasActiveSub) {
                            navigate('/account/subscription', { state: { from: window.location.pathname + window.location.search } });
                            return;
                        }
                        setIsAdding(true);
                    }}>
                        Добавить вручную
                    </button>
                )}
            </section>

            {/* Manual Entry Form */}
            {isAdding && (
                <form onSubmit={handleManualSubmit} className="manual-entry-form">
                    <h3 className="form-title">Добавить продукт</h3>
                    <div className="form-group">
                        <label>Название</label>
                        <input
                            type="text"
                            required
                            className="input-field"
                            value={manualForm.name}
                            onChange={e => setManualForm({ ...manualForm, name: e.target.value })}
                            placeholder="Например, Яблоко"
                        />
                    </div>
                    <div className="stats-grid">
                        <div className="form-group">
                            <label>Ккал</label>
                            <input type="number" required className="input-field" value={manualForm.calories} onChange={e => setManualForm({ ...manualForm, calories: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Вес (г)</label>
                            <input type="number" className="input-field" value={manualForm.weight} onChange={e => setManualForm({ ...manualForm, weight: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Белки</label>
                            <input type="number" className="input-field" value={manualForm.protein} onChange={e => setManualForm({ ...manualForm, protein: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Жиры</label>
                            <input type="number" className="input-field" value={manualForm.fat} onChange={e => setManualForm({ ...manualForm, fat: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Углев.</label>
                            <input type="number" className="input-field" value={manualForm.carbs} onChange={e => setManualForm({ ...manualForm, carbs: e.target.value })} />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button type="button" className="btn-ghost" onClick={() => setIsAdding(false)}>Отмена</button>
                        <button type="submit" className="btn-primary">Добавить</button>
                    </div>
                </form>
            )}

            {/* Diary List */}
            <div className="diary-list">
                {isLoading && <p>Загрузка...</p>}
                {!isLoading && entries.length === 0 && (
                    <div className="diary-empty">
                        <div className="diary-empty__plate" aria-hidden="true">
                            <svg viewBox="0 0 160 160" fill="none">
                                <circle cx="74" cy="82" r="52" fill="#EEF4E7" />
                                <circle cx="74" cy="82" r="36" fill="#F8FAF3" />
                                <path d="M39 49v69M29 51v27c0 8 5 13 10 13s10-5 10-13V51M112 48c13 14 13 32 0 46v25" stroke="#88A96F" strokeWidth="7" strokeLinecap="round" />
                                <rect x="56" y="51" width="48" height="62" rx="9" fill="#FFFDF7" stroke="#D9E2CE" strokeWidth="3" />
                                <path d="M67 68h27M67 82h27M67 96h20" stroke="#D2DDC3" strokeWidth="5" strokeLinecap="round" />
                                <path d="M105 95c15-4 26-15 31-31 8 18 2 36-14 47-8 5-17 7-26 6 3-9 6-16 9-22Z" fill="#6DA466" />
                                <path d="M110 99c10-2 18-9 23-20" stroke="#4F8A52" strokeWidth="4" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div className="diary-empty__content">
                            <h3>Пока здесь пусто</h3>
                            <p>Добавляйте блюда на страницах ресторанов или внесите их вручную.</p>
                            <p>Мы поможем отслеживать калории и баланс БЖУ каждый день.</p>
                        </div>
                    </div>
                )}

                {entries.map(entry => {
                    const editor = diaryProductEditors[String(entry.id)];
                    const nutrition = getDiaryEntryNutrition(entry, editor);

                    return (
                        <div key={entry.id} className="diary-item">
                            <div className="diary-item-info">
                                <div className="diary-item-name">{entry.name}</div>
                                <div className="diary-item-meta">
                                    {nutrition.calories} ккал • Б {Math.round(Number(nutrition.protein))} • Ж {Math.round(Number(nutrition.fat))} • У {Math.round(Number(nutrition.carbs))}
                                    {entry.restaurant_slug && (
                                        <Link to={`/r/${entry.restaurant_slug}/menu`} className="badge-restaurant badge-restaurant-link">
                                            {entry.restaurant_name || entry.restaurant_slug}
                                        </Link>
                                    )}
                                </div>
                            </div>
                            {editor && (
                                <div className="diary-item-amount" aria-label="Количество продукта">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="any"
                                        value={editor.amount}
                                        onChange={(event) => handleDiaryProductAmountChange(entry, event.target.value)}
                                        onBlur={() => handleDiaryProductAmountCommit(entry)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.currentTarget.blur();
                                            }
                                        }}
                                        aria-label={editor.unit === 'serving' ? 'Количество порций' : 'Количество граммов'}
                                    />
                                    <select
                                        value={editor.unit}
                                        onChange={(event) => handleDiaryProductUnitChange(entry, event.target.value as DiaryProductUnit)}
                                        aria-label="Единица количества"
                                    >
                                        <option value="serving">порция</option>
                                        <option value="grams">граммы</option>
                                    </select>
                                </div>
                            )}
                            <button className="btn-icon-danger" onClick={() => handleDelete(entry.id)}>×</button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
