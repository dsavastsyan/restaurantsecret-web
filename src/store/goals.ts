import { create } from 'zustand';
import { fetchUserGoals, updateUserGoals, UserGoalData } from '@/lib/api';
import { calculateTargets, UserStats, Gender, ActivityLevel, GoalType } from '@/lib/calculator';

type GoalsState = {
    data: UserGoalData | null;
    isLoading: boolean;
    error: string | null;

    fetch: (token: string) => Promise<void>;

    // Updates physical stats and optionally auto-recalculates targets
    updateStats: (
        token: string,
        stats: Partial<Pick<UserGoalData, 'gender' | 'age' | 'weight' | 'height' | 'activity_level' | 'goal_type'>>
    ) => Promise<void>;

    // Updates specific targets (implies manual mode) or setting manual mode explicitly
    updateTargets: (
        token: string,
        targets: Partial<Pick<UserGoalData, 'target_calories' | 'target_protein' | 'target_fat' | 'target_carbs' | 'is_auto_calculated'>>
    ) => Promise<void>;

    // Recalculates targets based on current stats and saves
    recalculate: (token: string) => Promise<void>;
};

export const useGoalsStore = create<GoalsState>((set, get) => ({
    data: null,
    isLoading: false,
    error: null,

    fetch: async (token) => {
        // Clear previous user's cached goals before loading fresh data.
        set({ data: null, isLoading: true, error: null });
        try {
            const res = await fetchUserGoals(token);
            if (res?.ok) {
                console.log('[Goals] Fetched:', res);
                set({ data: res.goals ?? null, isLoading: false });
            } else {
                set({ data: null, isLoading: false, error: 'Failed' });
            }
        } catch (e) {
            console.error(e);
            set({ data: null, isLoading: false, error: 'Error' });
        }
    },

    updateStats: async (token, stats) => {
        const current = get().data || {} as UserGoalData;

        const next = { ...current, ...stats };

        // Auto-calculate if flag is true OR if it's undefined (default behavior)
        // treating undefined as true allows first-time setup to auto-calc
        const shouldAutoCalc = next.is_auto_calculated !== false;

        if (shouldAutoCalc) {
            next.is_auto_calculated = true;
            // Check if we have all validation fields
            if (next.gender && next.age && next.weight && next.height && next.activity_level && next.goal_type) {
                const calculated = calculateTargets({
                    gender: next.gender as Gender,
                    age: next.age,
                    weight: next.weight,
                    height: next.height,
                    activity: next.activity_level as ActivityLevel,
                    goal: next.goal_type as GoalType
                });

                next.target_calories = calculated.calories;
                next.target_protein = calculated.protein;
                next.target_fat = calculated.fat;
                next.target_carbs = calculated.carbs;
            }
        }

        // Optimistic update
        set({ data: next });
        try {
            const res = await updateUserGoals(next, token);
            console.log('[Goals] Saved:', res);
        } catch (err) {
            console.error('[Goals] Save Failed:', err);
            get().fetch(token); // rollback
            throw err;
        }
    },

    updateTargets: async (token, targets) => {
        const current = get().data || {} as UserGoalData;

        const next = { ...current, ...targets };
        set({ data: next });
        try {
            const res = await updateUserGoals(next, token);
            console.log('[Goals] Targets Saved:', res);
        } catch (err) {
            console.error('[Goals] Targets Save Failed:', err);
            get().fetch(token);
            throw err;
        }
    },

    recalculate: async (token) => {
        const current = get().data;
        if (!current) return; // Recalculate needs existing data to make sense (or at least valid fields)

        if (current.gender && current.age && current.weight && current.height && current.activity_level && current.goal_type) {
            const calculated = calculateTargets({
                gender: current.gender as Gender,
                age: current.age,
                weight: current.weight,
                height: current.height,
                activity: current.activity_level as ActivityLevel,
                goal: current.goal_type as GoalType
            });

            const next = {
                ...current,
                target_calories: calculated.calories,
                target_protein: calculated.protein,
                target_fat: calculated.fat,
                target_carbs: calculated.carbs,
                is_auto_calculated: true
            };

            set({ data: next });
            try {
                await updateUserGoals(next, token);
            } catch (err) {
                console.error(err);
                get().fetch(token);
            }
        }
    }
}));
