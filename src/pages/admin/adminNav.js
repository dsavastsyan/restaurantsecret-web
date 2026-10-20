export const ADMIN_NAV = {
  restaurants: {
    label: 'Рестораны',
    path: '/admin/restaurants',
    sections: [
      {
        key: 'all',
        label: 'Все рестораны',
        to: '/admin/restaurants/all',
        match: '/admin/restaurants/all',
      },
      {
        key: 'collection',
        label: 'Сбор',
        to: '/admin/restaurants/collection',
        match: '/admin/restaurants/collection',
      },
      {
        key: 'freshness',
        label: 'Актуальность',
        to: '/admin/restaurants/freshness/manual',
        match: '/admin/restaurants/freshness',
        children: [
          { key: 'auto', label: 'Автоматическое обновление', to: '/admin/restaurants/freshness/auto' },
          { key: 'manual', label: 'Ручное обновление', to: '/admin/restaurants/freshness/manual' },
        ],
      },
      {
        key: 'quality',
        label: 'Качество данных',
        to: '/admin/restaurants/quality/completeness',
        match: '/admin/restaurants/quality',
        children: [
          { key: 'completeness', label: 'Полнота', to: '/admin/restaurants/quality/completeness' },
          {
            key: 'accuracy',
            label: 'Точность',
            to: '/admin/restaurants/quality/accuracy/kbju',
            match: '/admin/restaurants/quality/accuracy',
            children: [
              { key: 'kbju', label: 'Странные КБЖУ', to: '/admin/restaurants/quality/accuracy/kbju' },
              { key: 'attributes', label: 'Ревью и правки', to: '/admin/restaurants/quality/accuracy/attributes' },
              { key: 'google-places', label: 'Сети и точки Google', to: '/admin/restaurants/quality/accuracy/google-places' },
            ],
          },
        ],
      },
      {
        key: 'publication',
        label: 'Публикация',
        to: '/admin/restaurants/publication',
        match: '/admin/restaurants/publication',
      },
    ],
  },
  products: {
    label: 'Продукты',
    path: '/admin/products',
    sections: [
      {
        key: 'collection',
        label: 'Сбор',
        to: '/admin/products/collection/retailers',
        match: '/admin/products/collection',
        children: [
          { key: 'retailers', label: 'Базы ритейлеров', to: '/admin/products/collection/retailers' },
          { key: 'barcodes', label: 'Штрихкоды', to: '/admin/products/collection/barcodes' },
        ],
      },
      {
        key: 'freshness',
        label: 'Актуальность',
        to: '/admin/products/freshness/duplicates',
        match: '/admin/products/freshness',
        children: [
          { key: 'duplicates', label: 'Сведение дубликатов', to: '/admin/products/freshness/duplicates' },
          { key: 'barcodes', label: 'Сведение со штрихкодом', to: '/admin/products/freshness/barcodes' },
        ],
      },
      {
        key: 'quality',
        label: 'Качество данных',
        to: '/admin/products/quality/completeness',
        match: '/admin/products/quality',
        children: [
          { key: 'completeness', label: 'Полнота', to: '/admin/products/quality/completeness' },
          {
            key: 'accuracy',
            label: 'Точность',
            to: '/admin/products/quality/accuracy/kbju',
            match: '/admin/products/quality/accuracy',
            children: [
              { key: 'kbju', label: 'Странные КБЖУ', to: '/admin/products/quality/accuracy/kbju' },
            ],
          },
        ],
      },
    ],
  },
  costs: {
    label: 'Расходы',
    path: '/admin/costs',
    sections: [
      { key: 'google', label: 'Расходы Google', to: '/admin/costs/google', match: '/admin/costs/google' },
    ],
  },
}

export const ADMIN_TOP_LEVEL = Object.entries(ADMIN_NAV).map(([key, value]) => ({
  key,
  label: value.label,
  to: value.path,
}))
