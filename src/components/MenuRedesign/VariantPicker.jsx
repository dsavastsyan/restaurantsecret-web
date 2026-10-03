import { useMemo } from 'react'

function optionLabel(variant) {
  return [variant?.size?.label, variant?.milk?.label].filter(Boolean).join(' · ') || variant?.name || 'Вариант'
}

export default function VariantPicker({ variants = [], selected, onChange }) {
  const sizes = useMemo(() => {
    const seen = new Set()
    return variants.filter((variant) => variant?.size?.key && !seen.has(variant.size.key) && seen.add(variant.size.key))
  }, [variants])
  const milks = useMemo(() => {
    const seen = new Set()
    return variants.filter((variant) => variant?.milk?.key && !seen.has(variant.milk.key) && seen.add(variant.milk.key))
  }, [variants])

  if (variants.length < 2) return null

  const selectVariant = (axis, value) => {
    const otherKey = axis === 'size' ? selected?.milk?.key : selected?.size?.key
    const candidate = variants.find((variant) => {
      const axisMatches = variant?.[axis]?.key === value
      const otherMatches = !otherKey || variant?.[axis === 'size' ? 'milk' : 'size']?.key === otherKey
      return axisMatches && otherMatches
    }) || variants.find((variant) => variant?.[axis]?.key === value)
    if (candidate) onChange(candidate)
  }

  return (
    <div className="rsm2-variant-picker" onClick={(event) => event.stopPropagation()}>
      {sizes.length > 0 && (
        <label className="rsm2-variant-picker__field">
          <span>Размер</span>
          <select value={selected?.size?.key || ''} onChange={(event) => selectVariant('size', event.target.value)} aria-label="Размер">
            {sizes.map((variant) => <option key={variant.size.key} value={variant.size.key}>{variant.size.label}</option>)}
          </select>
        </label>
      )}
      {milks.length > 0 && (
        <label className="rsm2-variant-picker__field rsm2-variant-picker__field--milk">
          <span>Молоко</span>
          <select value={selected?.milk?.key || ''} onChange={(event) => selectVariant('milk', event.target.value)} aria-label="Молоко">
            {milks.map((variant) => <option key={variant.milk.key} value={variant.milk.key}>{variant.milk.label}</option>)}
          </select>
        </label>
      )}
      <span className="sr-only">Выбран вариант: {optionLabel(selected)}</span>
    </div>
  )
}
