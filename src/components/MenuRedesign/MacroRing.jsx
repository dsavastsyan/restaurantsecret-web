// Calorie ring used by the dish tile, dish row and full dish card. Renders
// a conic-gradient ring (protein/fat/carb shares) with the kcal number in
// the center. See computeMacroGeometry() in lib/nutrition.js for the math.
export default function MacroRing({ geometry, kcal, size = 'tile', className = '', concealed = false }) {
  const sizeClass = {
    tile: 'rsm2-ring',
    row: 'rsm2-row__ring',
    modal: 'rsm2-modal__ring',
  }[size] || 'rsm2-ring'

  const coreClass = {
    tile: 'rsm2-ring__core',
    row: 'rsm2-row__ring-core',
    modal: 'rsm2-modal__ring-core',
  }[size] || 'rsm2-ring__core'

  return (
    <div
      className={`${sizeClass} ${className}`}
      style={{ background: geometry.ringGradient }}
      aria-hidden="true"
    >
      <div className={coreClass}>
        <strong>{concealed ? '—' : (Number.isFinite(kcal) ? Math.round(kcal) : '—')}</strong>
        {/* On the compact mobile row the label only fits once the ring is
            rendered tall; CSS hides it in the small variant. */}
        <span>ккал</span>
      </div>
    </div>
  )
}
