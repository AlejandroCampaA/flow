import type { Categoria } from './types'
import { CATEGORIAS } from './normalize'

export type Modo = 'light' | 'dark'

// Paleta categórica validada (orden fijo de slots: el orden es parte de la seguridad para daltonismo).
const SERIES: Record<Modo, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767']
}

export const CHROME: Record<Modo, { surface: string; grid: string; axis: string; muted: string; ink: string; ink2: string }> = {
  light: { surface: '#ffffff', grid: '#e6e9eb', axis: '#c0c7cc', muted: '#70797f', ink: '#191c1e', ink2: '#40484e' },
  dark: { surface: '#191c1e', grid: '#2b2f32', axis: '#525a60', muted: '#899298', ink: '#e1e4e6', ink2: '#bec6cb' }
}

/** El color sigue a la categoría, nunca a su posición en un filtro. */
export function colorCategoria(c: Categoria, modo: Modo): string {
  return SERIES[modo][CATEGORIAS.indexOf(c)]
}

export function serie(slot: number, modo: Modo): string {
  return SERIES[modo][slot]
}

/** Texto sobre un relleno categórico: blanco, salvo amarillo (casi negro). */
export function tintaSobre(c: Categoria, modo: Modo): string {
  return c === 'despensa' && modo === 'light' ? '#0b0b0b' : '#ffffff'
}

/** Color primario de la app (mismo que --accent en styles.css), para gráficas pequeñas. */
export const ACENTO: Record<Modo, string> = { light: '#00695c', dark: '#80d5c8' }
