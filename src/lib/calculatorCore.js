import { calculateGoal } from './goalCalc.js'

export const ACTIVITY_MULTIPLIERS = {
  low: 1.2,
  medium: 1.375,
  high: 1.55,
  very_high: 1.725,
}

export const GOAL_MULTIPLIERS = {
  lose_weight: 0.8,
  maintain_weight: 1.0,
  gain_weight: 1.1,
}

export function calculateBMR(stats) {
  const { gender, weight, height, age } = stats
  let bmr = (10 * weight) + (6.25 * height) - (5 * age)

  if (gender === 'female') {
    bmr -= 161
  } else {
    bmr += 5
  }

  return Math.round(bmr)
}

export function calculateTargets(stats, options = {}) {
  if (options.v2 === true) {
    const result = calculateGoal({
      gender: stats.gender,
      age: stats.age,
      weight: stats.weight,
      height: stats.height,
      activityLevel: stats.activity,
      goal: stats.goal,
    })

    return {
      bmr: result.bmr,
      tdee: result.expenditure,
      calories: result.calories,
      protein: result.protein,
      fat: result.fat,
      carbs: result.carbs,
    }
  }

  const { weight, activity, goal } = stats
  const bmr = calculateBMR(stats)
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activity])
  const targetCalories = Math.round(tdee * GOAL_MULTIPLIERS[goal])
  const protein = Math.round(2.0 * weight)
  const fat = Math.round(0.9 * weight)
  const proteinCals = protein * 4
  const fatCals = fat * 9
  const remainingCals = targetCalories - proteinCals - fatCals
  const carbs = Math.max(0, Math.round(remainingCals / 4))

  return {
    bmr,
    tdee,
    calories: targetCalories,
    protein,
    fat,
    carbs,
  }
}
