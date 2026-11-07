const ACTIVITY_COEFFICIENTS = {
  low: 1.4,
  medium: 1.6,
  high: 1.9,
  very_high: 2.2,
}

const WORK_TABLE = {
  sitting: [1.4, 1.4, 1.6],
  standing: [1.6, 1.6, 1.9],
  physical: [1.9, 1.9, 2.2],
}

const COEFFICIENT_TO_LEVEL = {
  1.4: 'low',
  1.6: 'medium',
  1.9: 'high',
  2.2: 'very_high',
}

const PACES = [0.25, 0.5, 0.75]

function halfUp(value) {
  return Math.floor(value + 0.5)
}

// Единственное место выбора дефицита. Позже сюда добавятся две неподтверждённые правки:
// 300 ккал при ИМТ до 25 и ограничение в 30% расхода.
function selectDeficit(requested, maxDeficit, weight) {
  return Math.min(requested, maxDeficit, 10.0 * weight)
}

export function activityLevelFor(work, workoutsPerWeek) {
  const bucket = workoutsPerWeek <= 1 ? 0 : workoutsPerWeek <= 3 ? 1 : 2
  return COEFFICIENT_TO_LEVEL[WORK_TABLE[work][bucket]]
}

export function calculateGoal(input) {
  const gender = input.gender
  const age = input.age
  const weight = Number(input.weight)
  const height = Number(input.height)
  const goal = input.goal === 'maintain' ? 'maintain_weight' : input.goal
  const pace = input.pace ?? 0.5
  const safety = new Set(input.safety ?? [])
  const targetWeight = input.targetWeight

  const heightMeters = height / 100.0
  const bmi = weight / (heightMeters * heightMeters)
  let planMode = 'standard'
  let maxDeficit = Number.POSITIVE_INFINITY
  let floor = gender === 'female' ? 1200 : 1500
  let maintenanceOnly = false
  const glp1 = safety.has('glp1')
  const kidney = safety.has('kidney')

  const tighten = (mode) => {
    const order = { standard: 0, gentle: 1, no_deficit: 2 }
    if (order[mode] > order[planMode]) planMode = mode
  }

  if (age < 18 || safety.has('pregnancy')) {
    tighten('no_deficit')
    maintenanceOnly = true
  }
  if (safety.has('breastfeeding')) {
    tighten('gentle')
    floor = Math.max(floor, 1500)
    maxDeficit = Math.min(maxDeficit, 300.0)
  }
  if (bmi < 18.5 || (targetWeight != null && targetWeight / (heightMeters * heightMeters) < 18.5)) {
    tighten('no_deficit')
  }
  if (safety.has('eating_disorder')) tighten('no_deficit')
  if (safety.has('diabetes_meds')) {
    tighten('gentle')
    maxDeficit = Math.min(maxDeficit, 500.0)
  }
  if (glp1) {
    tighten('gentle')
    maxDeficit = Math.min(maxDeficit, 500.0)
  }
  if (age >= 65) {
    tighten('gentle')
    maxDeficit = Math.min(maxDeficit, 300.0)
  }

  let effectiveGoal
  if (maintenanceOnly) {
    effectiveGoal = 'maintain_weight'
  } else if (goal === 'lose_weight' && planMode === 'no_deficit') {
    effectiveGoal = 'maintain_weight'
  } else {
    effectiveGoal = goal
  }

  const activityCoefficient = age >= 65
    ? 1.7
    : (ACTIVITY_COEFFICIENTS[input.activityLevel] ?? 1.4)
  const bmrValue = gender === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5
  const expenditureValue = bmrValue * activityCoefficient

  let deficit = 0
  let floorHit = false
  let loseAvailable = true
  let calories
  if (effectiveGoal === 'lose_weight') {
    let raw
    if (expenditureValue <= floor) {
      raw = expenditureValue
      loseAvailable = false
    } else {
      const selectedDeficit = selectDeficit(pace * 1000.0, maxDeficit, weight)
      raw = expenditureValue - selectedDeficit
      deficit = selectedDeficit
      if (raw < floor) {
        raw = Number(floor)
        floorHit = true
        deficit = expenditureValue - raw
      }
    }
    calories = halfUp(raw)
  } else if (effectiveGoal === 'gain_weight') {
    calories = halfUp(expenditureValue + Math.min(0.1 * expenditureValue, 350.0))
  } else {
    calories = halfUp(expenditureValue)
  }

  const halfRange = gender === 'female' ? 250 : 350
  const rangeLow = Math.min(calories, Math.max(calories - halfRange, floor))
  const rangeHigh = calories + halfRange

  let paceLow = null
  let paceHigh = null
  if (effectiveGoal === 'lose_weight' && deficit > 0) {
    paceLow = Math.floor(deficit * 0.6 / 100.0 + 0.5) / 10.0
    paceHigh = Math.floor(deficit / 100.0 + 0.5) / 10.0
  }

  const proteinWeight = bmi >= 30 ? 25.0 * heightMeters * heightMeters : weight
  const proteinPerKg = effectiveGoal === 'maintain_weight' ? 1.2 : 1.6
  let proteinValue = proteinPerKg * proteinWeight
  if (age >= 65) proteinValue = Math.max(proteinValue, 1.2 * proteinWeight)
  if (kidney) proteinValue = 0.8 * proteinWeight
  if (glp1) proteinValue = Math.min(Math.max(proteinValue, 80.0), 120.0)
  proteinValue = Math.max(proteinValue, 0.8 * proteinWeight)
  proteinValue = Math.min(proteinValue, 0.35 * calories / 4.0)
  const protein = halfUp(proteinValue)
  const fat = halfUp(calories * 0.25 / 9.0)
  const carbs = Math.max(0, halfUp((calories - protein * 4 - fat * 9) / 4.0))

  const paceOptions = []
  if (goal === 'lose_weight') {
    for (const step of PACES) {
      let reason = null
      if (step * 1000.0 > maxDeficit) {
        reason = 'plan_mode'
      } else if (step * 1000.0 > 10.0 * weight) {
        reason = 'weight_cap'
      } else if (expenditureValue - (step - 0.25) * 1000.0 < floor) {
        reason = 'floor'
      }
      if (planMode === 'no_deficit' || maintenanceOnly) reason = 'plan_mode'
      paceOptions.push({ pace: step, available: reason === null, reason })
    }
  }

  const bmr = halfUp(bmrValue)
  const expenditure = halfUp(expenditureValue)
  return {
    bmr,
    activityCoefficient,
    expenditure,
    activityKcal: expenditure - bmr,
    calories,
    deficit: halfUp(deficit),
    floor,
    floorHit,
    loseAvailable,
    protein,
    fat,
    carbs,
    rangeLow,
    rangeHigh,
    paceLow,
    paceHigh,
    planMode,
    effectiveGoal,
    paceOptions,
  }
}
