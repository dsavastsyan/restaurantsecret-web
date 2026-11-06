import {
    ACTIVITY_MULTIPLIERS as activityMultipliers,
    GOAL_MULTIPLIERS as goalMultipliers,
    calculateBMR as calculateBMRCore,
    calculateTargets as calculateTargetsCore
} from './calculatorCore.js';

export type Gender = 'male' | 'female';
export type ActivityLevel = 'low' | 'medium' | 'high' | 'very_high';
export type GoalType = 'lose_weight' | 'maintain_weight' | 'gain_weight';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = activityMultipliers;
export const GOAL_MULTIPLIERS: Record<GoalType, number> = goalMultipliers;

export type UserStats = {
    gender: Gender;
    weight: number;
    height: number;
    age: number;
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

export function calculateBMR(stats: { gender: Gender; weight: number; height: number; age: number }): number {
    return calculateBMRCore(stats);
}

export function calculateTargets(stats: UserStats, options?: { v2?: boolean }): CalculatedTargets {
    return calculateTargetsCore(stats, options);
}
