// FABRICATED demo data for the multi-platform UI prototype.
// Every name, number and label below is invented. Nothing here comes from
// Tipstrr. This file exists to test layout and information design only.

export interface DemoPlatformTipster {
  name: string
  sport: string
  accountType: 'free' | 'premium'
  priceLabel: string | null // e.g. '£39/mes' — access option, not a seguibilidad verdict
  sinceLabel: string
  followers: number | null
  sample: {
    scopeLabel: string // e.g. 'Global (todas sus tips)' or 'Fútbol'
    periodLabel: string // e.g. 'Últimos 12 meses'
    picks: number | null
    roiPct: number | null
    roiBasis: string // e.g. 'advised stakes'
    winRatePct: number | null
    avgOdds: number | null
  }
}

export const DEMO_PLATFORM = {
  id: 'tipstrr',
  label: 'Tipstrr',
  metricName: 'ROI',
  metricBasisNote:
    'Tipstrr calcula sus cifras sobre advised stakes por defecto (existe modo level stakes). Blogabet muestra yield. No hay equivalencia acreditada: la comparabilidad está pendiente.',
  termsUrl: 'https://tipstrr.com/legal/terms-and-conditions',
}

export const DEMO_TIPSTRERS: DemoPlatformTipster[] = [
  {
    name: 'Demo Rovers Tips',
    sport: 'Fútbol',
    accountType: 'premium',
    priceLabel: '£29/mes',
    sinceLabel: '2024',
    followers: 412,
    sample: {
      scopeLabel: 'Global',
      periodLabel: 'Últimos 12 meses',
      picks: 268,
      roiPct: 13.4,
      roiBasis: 'advised stakes',
      winRatePct: 44,
      avgOdds: 2.62,
    },
  },
  {
    name: 'Fake Gallop',
    sport: 'Caballos',
    accountType: 'free',
    priceLabel: null,
    sinceLabel: '2023',
    followers: 87,
    sample: {
      scopeLabel: 'Global',
      periodLabel: 'Últimos 12 meses',
      picks: 512,
      roiPct: 9.8,
      roiBasis: 'advised stakes',
      winRatePct: 24,
      avgOdds: 6.4,
    },
  },
  {
    name: 'Prueba Saeta',
    sport: 'Tenis',
    accountType: 'premium',
    priceLabel: '£15/mes',
    sinceLabel: '2026',
    followers: null,
    sample: {
      scopeLabel: 'Global',
      periodLabel: 'Últimos 6 meses',
      picks: 61,
      roiPct: 21.3,
      roiBasis: 'advised stakes',
      winRatePct: 58,
      avgOdds: 1.91,
    },
  },
  {
    name: 'Ejemplo Corner Pro',
    sport: 'Fútbol',
    accountType: 'premium',
    priceLabel: '£45/mes',
    sinceLabel: '2022',
    followers: 1304,
    sample: {
      scopeLabel: 'Global',
      periodLabel: 'Últimos 12 meses',
      picks: null,
      roiPct: 16.7,
      roiBasis: 'advised stakes',
      winRatePct: 39,
      avgOdds: 3.05,
    },
  },
]
