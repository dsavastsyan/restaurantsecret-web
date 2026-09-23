export type Gender = 'male' | 'female';
export type ActivityLevel = 'low' | 'medium' | 'high' | 'very_high';
export type GoalType = 'lose_weight' | 'maintain_weight' | 'gain_weight';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
    low: 1.2,
    medium: 1.375,
    high: 1.55,
    very_high: 1.725
};

export const GOAL_MULTIPLIERS: Record<GoalType, number> = {
    lose_weight: 0.8,
    maintain_weight: 1.0,
    gain_weight: 1.1
};

export type UserStats = {
    gender: Gender;
    weight: number; // kg
    height: number; // cm
    age: number; // years
    activity: ActivityLevel;
    goal: GoalType;
};

export type CalculatedTargets = {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    bmr: number;
    tdee: number;
};

// Mifflin-St Jeor Formula
export function calculateBMR(stats: { gender: Gender; weight: number; height: number; age: number }): number {
    const { gender, weight, height, age } = stats;
    // Generic: 10*W + 6.25*H - 5*A ...
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);

    if (gender === 'female') {
        bmr -= 161;
    } else {
        bmr += 5;
    }

    return Math.round(bmr);
}

export function calculateTargets(stats: UserStats): CalculatedTargets {
    const { weight, activity, goal } = stats;

    const bmr = calculateBMR(stats);
    const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activity]);
    const targetCalories = Math.round(tdee * GOAL_MULTIPLIERS[goal]);

    // Macros
    // Protein = 2.0 * weight
    const protein = Math.round(2.0 * weight);

    // Fat = 0.9 * weight
    const fat = Math.round(0.9 * weight);

    // Carbs = (Calories - Protein*4 - Fat*9) / 4
    const proteinCals = protein * 4;
    const fatCals = fat * 9;
    const remainingCals = targetCalories - proteinCals - fatCals;
    const carbs = Math.max(0, Math.round(remainingCals / 4));

    return {
        bmr,
        tdee,
        calories: targetCalories,
        protein,
        fat,
        carbs
    };
}
