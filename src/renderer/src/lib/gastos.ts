/**
 * Clasificación y análisis de los movimientos bancarios: en qué se gasta, de dónde entra dinero,
 * qué es sólo un traspaso entre tus propias cuentas y cómo cuadra con los recibos de nómina.
 */
import { addDays, diffDays, fmtFecha, fmtMes, fmtRango, fromIso, isoWeek, mondayOfIsoWeek } from './dates'
import { MES_LARGO_CAP, fmtRangoCorto, type Granularidad } from './analytics'
import type { EstadoCuenta, Movimiento } from './estadoCuenta'
import type { Recibo } from './types'

const r2 = (n: number): number => Math.round(n * 100) / 100

export type Naturaleza = 'gasto' | 'ingreso' | 'interno'

export const CATS = {
  comida_domicilio: { label: 'Comida a domicilio', nat: 'gasto' },
  restaurantes: { label: 'Restaurantes y antojos', nat: 'gasto' },
  super: { label: 'Súper y conveniencia', nat: 'gasto' },
  transporte: { label: 'Transporte', nat: 'gasto' },
  compras: { label: 'Compras', nat: 'gasto' },
  suscripciones: { label: 'Suscripciones y apps', nat: 'gasto' },
  videojuegos: { label: 'Videojuegos', nat: 'gasto' },
  entretenimiento: { label: 'Salidas y entretenimiento', nat: 'gasto' },
  servicios: { label: 'Servicios del hogar', nat: 'gasto' },
  salud: { label: 'Salud y bienestar', nat: 'gasto' },
  efectivo: { label: 'Retiros de efectivo', nat: 'gasto' },
  personas: { label: 'Transferencias a personas', nat: 'gasto' },
  seguros: { label: 'Seguros y comisiones', nat: 'gasto' },
  otros_gastos: { label: 'Otros gastos', nat: 'gasto' },
  nomina: { label: 'Nómina', nat: 'ingreso' },
  recibidas: { label: 'Transferencias recibidas', nat: 'ingreso' },
  deposito_efectivo: { label: 'Depósitos en efectivo', nat: 'ingreso' },
  devoluciones: { label: 'Devoluciones', nat: 'ingreso' },
  otros_ingresos: { label: 'Otros ingresos', nat: 'ingreso' },
  interno: { label: 'Entre tus cuentas', nat: 'interno' }
} as const satisfies Record<string, { label: string; nat: Naturaleza }>

/** Categorías que trae la app. */
export type CatBase = keyof typeof CATS
/** Una categoría: de la app o creada por ti (`u:...`). */
export type CatMov = CatBase | `u:${string}`
export const CATS_GASTO = (Object.keys(CATS) as CatBase[]).filter((c) => CATS[c].nat === 'gasto')
export const CATS_INGRESO = (Object.keys(CATS) as CatBase[]).filter((c) => CATS[c].nat === 'ingreso')

/** Categoría creada por ti (se guarda en la tabla de reglas como `cat:<id>` → JSON). */
export interface CatUsuario {
  id: `u:${string}`
  label: string
  nat: 'gasto' | 'ingreso'
  /** Nombre del icono (ver ICONOS_LIBRES en components/catIcon.tsx). */
  icono: string
}

let USUARIO = new Map<string, CatUsuario>()
/** Registra tus categorías (lo llama el store cada vez que cambian). */
export function setCategoriasUsuario(cs: CatUsuario[]): void {
  USUARIO = new Map(cs.map((c) => [c.id, c]))
}
export const categoriasUsuario = (): CatUsuario[] => [...USUARIO.values()].sort((a, b) => a.label.localeCompare(b.label))
export const catUsuario = (c: CatMov): CatUsuario | undefined => USUARIO.get(c)
export const catLabel = (c: CatMov): string => (CATS as Record<string, { label: string }>)[c]?.label ?? USUARIO.get(c)?.label ?? 'Categoría borrada'
export const catNat = (c: CatMov): Naturaleza | undefined => (CATS as Record<string, { nat: Naturaleza }>)[c]?.nat ?? USUARIO.get(c)?.nat
/** Todas las categorías de gasto (o de ingreso): las de la app y las tuyas. */
export const catsDe = (nat: 'gasto' | 'ingreso'): CatMov[] => [
  ...(nat === 'gasto' ? CATS_GASTO : CATS_INGRESO),
  ...categoriasUsuario()
    .filter((c) => c.nat === nat)
    .map((c) => c.id)
]
/** Id nuevo para una categoría tuya a partir de su nombre. */
export function idCategoria(label: string): `u:${string}` {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  let id: `u:${string}` = `u:${base || 'cat'}`
  for (let i = 2; USUARIO.has(id); i++) id = `u:${base || 'cat'}-${i}`
  return id
}

export type Medio = 'tarjeta' | 'transferencia' | 'efectivo' | 'nomina' | 'cargo' | 'otro'

export interface MovClasificado extends Movimiento {
  producto: string
  categoria: CatMov
  /** Categoría automática (antes de tus reglas). */
  sugerida: CatMov
  naturaleza: Naturaleza
  medio: Medio
  /** Nombre a mostrar: comercio, persona o concepto. */
  comercio: string
  /** Clave estable para reglas por comercio/persona. */
  claveComercio: string
  persona?: string
  banco?: string
  /** Regla del usuario aplicada. */
  regla?: 'movimiento' | 'comercio'
  /** Recibo de nómina con el que cuadra este depósito. */
  reciboId?: string
  /** Movimiento espejo en tu otra cuenta (traspasos). */
  parId?: string
}

/** Reglas del usuario: `mov:<id>` o `com:<claveComercio>` → categoría. */
export type Reglas = Record<string, CatMov>

// ---------------------------------------------------------------------------
// Comercios conocidos (orden importa: lo más específico primero)

const MARCAS: [RegExp, string | null, CatMov][] = [
  [/UBER\s*\*?\s*EATS|UBER\s+E\b/, 'Uber Eats', 'comida_domicilio'],
  [/DIDI\s*FOOD/, 'DiDi Food', 'comida_domicilio'],
  [/RAPPI/, 'Rappi', 'comida_domicilio'],
  [/UBER/, 'Uber (viajes)', 'transporte'],
  [/DIDI/, 'DiDi (viajes)', 'transporte'],
  [/CABIFY|INDRIVE|BLABLACAR|BEAT\b/, null, 'transporte'],
  [/PEMEX|GASOLINER|OXXO GAS|G500|\bSHELL\b|\bMOBIL\b|\bARCO\b|\bBP\b|TOTALENERGIES|PETRO SEVEN|FULLGAS|ORSAN|REDCO/, 'Gasolina', 'transporte'],
  [/ESTACIONAMIENTO|PARKING|CASETA|TELEPEAJE|\bIAVE\b|PASE URBANO/, 'Estacionamiento y casetas', 'transporte'],
  [/STEAM/, 'Steam', 'videojuegos'],
  [/PLAYSTATION|SONY INTERACTIVE|\bPSN\b/, 'PlayStation', 'videojuegos'],
  [/XBOX/, 'Xbox', 'videojuegos'],
  [/NINTENDO/, 'Nintendo', 'videojuegos'],
  [/EPIC\s*GAMES/, 'Epic Games', 'videojuegos'],
  [/RIOT|BLIZZARD|ACTIVISION|ELECTRONIC ARTS|ROBLOX|GARENA|SUPERCELL|HOYOVERSE|MIHOYO|\bG2A\b|ENEBA|INSTANT GAMING|HUMBLE|GAMEPLANET|UBISOFT/, null, 'videojuegos'],
  [/NETFLIX/, 'Netflix', 'suscripciones'],
  [/SPOTIFY/, 'Spotify', 'suscripciones'],
  [/DISNEY/, 'Disney+', 'suscripciones'],
  [/\bHBO\b|HBOMAX|\bMAX\.COM/, 'Max', 'suscripciones'],
  [/YOUTUBE/, 'YouTube', 'suscripciones'],
  [/CRUNCHYROLL/, 'Crunchyroll', 'suscripciones'],
  [/PARAMOUNT/, 'Paramount+', 'suscripciones'],
  [/PRIME VIDEO|AMAZON PRIME|AMZN PRIME|PRIME\*?MEMBER/, 'Amazon Prime', 'suscripciones'],
  [/ANTHROPIC|CLAUDE\.AI/, 'Anthropic (Claude)', 'suscripciones'],
  [/OPENAI|CHATGPT/, 'OpenAI (ChatGPT)', 'suscripciones'],
  [/GOOGLE/, 'Google', 'suscripciones'],
  [/APPLE\.COM|ITUNES|APPLE MUSIC|ICLOUD/, 'Apple', 'suscripciones'],
  [/MICROSOFT|\bMSFT\b|OFFICE 365/, 'Microsoft', 'suscripciones'],
  [/ADOBE|CANVA|NOTION|GITHUB|DROPBOX|DUOLINGO|TWITCH|DISCORD|PATREON|CURSOR|MIDJOURNEY/, null, 'suscripciones'],
  [/SMART ?FIT|\bGYM\b|GIMNASIO|SPORTS WORLD|ANYTIME FITNESS/, 'Gimnasio', 'salud'],
  [/TELCEL|AT&T|\bATT\b|MOVISTAR|\bBAIT\b|UNEFON|VIRGIN MOBILE/, 'Telefonía celular', 'servicios'],
  [/JMAS|JUNTA MUNICIPAL DE AGUA|\bAGUA\b/, 'Agua (JMAS)', 'servicios'],
  [/\bCFE\b/, 'Luz (CFE)', 'servicios'],
  [/TELMEX|TOTALPLAY|IZZI|MEGACABLE|STARLINK|INFINITUM/, 'Internet y TV', 'servicios'],
  [/NATURGY|GAS NATURAL/, 'Gas', 'servicios'],
  [/AMAZON|AMZN/, 'Amazon', 'compras'],
  [/MERCADO\s*PAGO|MERCADOPAGO|MERPAGO|MERCADO\s*LIBRE|MERCADOLIBRE/, 'Mercado Libre / Pago', 'compras'],
  [/SHEIN|TEMU|ALIEXPRESS|EBAY|PAYPAL/, null, 'compras'],
  [/LIVERPOOL|COPPEL|ELEKTRA|SEARS|SUBURBIA|BEST BUY|STEREN|HOME DEPOT|OFFICE DEPOT|PROMODA|\bC&A\b|ZARA|BERSHKA|PULL ?& ?BEAR|NIKE|ADIDAS|INNOVASPORT|\bMARTI\b|TOTTO|PRICE SHOES|MINISO|DAISO/, null, 'compras'],
  [/VENDING|YOLOPAG/, 'Máquinas expendedoras', 'restaurantes'],
  [/OXXO|7[\s-]?ELEVEN|SEVEN ELEVEN|CIRCLE K|\bEXTRA\b|KIOSKO|ALSUPER|WAL-?MART|BODEGA AURRERA|AURRERA|SORIANA|S-?MART|\bSMART\b|\bHEB\b|H-E-B|COSTCO|\bSAMS\b|SAM'S|CHEDRAUI|LA COMER|CITY MARKET|FRESKO|SUPERAMA|\bMERZA\b|ABARROTES|SUPERMERCADO/, null, 'super'],
  [/STARBUCKS|MCDONALD|BURGER|\bKFC\b|DOMINO|PIZZA|CAESARS|TACO|SUSHI|\bCAFE\b|COFFEE|\bREST\b|RESTAURA|CARL'?S|SUBWAY|WINGS|POLLO|TORTA|HAMBURG|BURRITO|PANADERIA|PASTELERIA|NEVERIA|HELAD|DAIRY QUEEN|CHILIS|APPLEBEE|\bVIPS\b|SANBORNS|\bTOKS\b|WENDY|POPEYES|PANDA EXPRESS|CINNABON|KRISPY|ITALIANNIS|BOSTON|CHURRER/, null, 'restaurantes'],
  [/CINEPOLIS|CINEMEX|TICKETMASTER|ETICKET|EVENTBRITE|BOLICHE|\bBAR\b|ANTRO|CANTINA|BILLAR|KARAOKE/, null, 'entretenimiento'],
  [/FARMACIA|\bFARM\b|BENAVIDES|SIMILARES|SAN PABLO|DEL AHORRO|\bYZA\b|HOSPITAL|CLINICA|MEDIC|DENTAL|LABORATORIO|OPTICA|DOCTOR/, null, 'salud']
]

const ESTADOS_MX =
  'NL|NLE|JAL|CHI|CHIH|MEX|CDMX|DF|BC|BCS|SON|COAH|QRO|GTO|PUE|YUC|QROO|TAM|SIN|DGO|ZAC|SLP|AGS|MICH|OAX|VER|TAB|CHIS|GRO|MOR|HGO|TLAX|COL|NAY|CAMP|TX|CA|WA|NY|FL'

/** "CWI 080115DQ8 DLO*SERV UBER R CIUDAD DE MEX" → "SERV UBER R". */
export function limpiarComercio(linea: string): string {
  let s = linea.toUpperCase().replace(/\s+/g, ' ').trim()
  s = s.replace(/\s*\(MONEDA EXTRANJERA\).*$/, '')
  s = s.replace(/^0{6,}\s*/, '')
  s = s.replace(/^[A-Z&Ñ()]{2,4}\s?[0-9O]{6}\s?[A-Z0-9]{3}\s+/, '')
  s = s.replace(/\s+\d{6,}$/, '')
  s = s.replace(
    /\s+(CIUDAD DE MEX(ICO)?|CDMX|CD\.? ?[A-Z]+( [A-Z]+)?( [A-Z]{2,4})?|BELLEVUE|SAN FRANCISCO|SEATTLE|MOUNTAIN VIEW|CUPERTINO|LOS GATOS|LUXEMBOURG|LUXEMBURGO|DUBLIN|LONDON|AMSTERDAM|SAN JOSE|NEW YORK|REDWOOD CITY|MENLO PARK|PALO ALTO|SANTA CLARA|INTERNET)$/,
    ''
  )
  const est = s.match(new RegExp(`^(.+?)\\s+[A-Z]+\\s(${ESTADOS_MX})$`))
  if (est) s = est[1]
  s = s.replace(/^(DLO|STR|WL|PAYPAL|CLIP|SQ|TST|ZTL|SP|MP|PP)\s?\*\s?/, '')
  return s.trim()
}

export function titulo(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s*/(-])([a-zñáéíóú])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\.(com|mx|net)\b/gi, (m) => m.toLowerCase())
}

const claveNombre = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')

function tokens(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((t) => t.length > 1)
}

function parecido(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let err = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++err > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return err + (a.length - i) + (b.length - j) <= 1
}

/**
 * ¿El nombre es el del titular? Todas sus palabras deben estar en el nombre del titular y, salvo
 * `parcial`, incluir el primer nombre (así "Martha Campa Alonso" no se confunde con "Alejandro Campa Alonso").
 */
export function esTitular(nombre: string, titular?: string, parcial = false): boolean {
  if (!titular) return false
  const t = tokens(titular)
  const n = tokens(nombre)
  if (n.length < 2) return false
  return n.every((x) => t.some((y) => parecido(x, y))) && (parcial || n.some((x) => parecido(x, t[0])))
}

// ---------------------------------------------------------------------------
// Clasificación automática de un movimiento

interface Auto {
  categoria: CatMov
  medio: Medio
  comercio: string
  claveComercio: string
  persona?: string
  banco?: string
}

function linea(m: Movimiento, re: RegExp): string | undefined {
  for (const l of m.detalle) {
    const x = l.match(re)
    if (x) return x[1].trim()
  }
  return undefined
}

function clasificarAuto(m: Movimiento, titular: string | undefined, nombres: Map<string, string>): Auto {
  const d = m.descripcion.toUpperCase()
  const todo = [m.descripcion, ...m.detalle].join(' ').toUpperCase()
  const abono = m.tipo === 'abono'
  const persona = (raw: string): { persona: string; clave: string } => {
    const k = claveNombre(raw)
    return { persona: nombres.get(k) ?? titulo(raw.replace(/\s*\(\d\)\s*$/, '')), clave: `PERSONA:${k}` }
  }

  if (/PAGO DE NOMINA|NOMINA/.test(d) && abono)
    return { categoria: 'nomina', medio: 'nomina', comercio: 'Depósito de nómina', claveComercio: 'NOMINA' }

  if (/ENTRE CUENTAS/.test(d))
    return { categoria: 'interno', medio: 'transferencia', comercio: abono ? 'Traspaso recibido de tu otra cuenta' : 'Traspaso a tu otra cuenta', claveComercio: 'INTERNO' }

  // SPEI recibido: "RECIBIDO DE <banco> / DEL CLIENTE <nombre>"
  if (/SPEI/.test(d) && abono) {
    const nom = linea(m, /^DEL CLIENTE\s+(.+)$/i)
    const banco = linea(m, /^RECIBIDO DE\s+(.+)$/i)
    if (nom && esTitular(nom, titular))
      return { categoria: 'interno', medio: 'transferencia', comercio: `Desde tu cuenta en ${titulo(banco ?? 'otro banco')}`, claveComercio: 'INTERNO-EXT', banco }
    if (nom) {
      const p = persona(nom)
      return { categoria: 'recibidas', medio: 'transferencia', comercio: p.persona, claveComercio: p.clave, persona: p.persona, banco }
    }
    return { categoria: 'recibidas', medio: 'transferencia', comercio: `Transferencia de ${titulo(banco ?? 'otro banco')}`, claveComercio: `SPEI:${banco ?? ''}`, banco }
  }

  // SPEI enviado: "ENVIADO A <banco> / AL CLIENTE <nombre>"
  if (/SPEI/.test(d) && !abono) {
    const nom = linea(m, /^AL CLIENTE\s+(.+?)(\s*\(\d\))?$/i) ?? d.match(/TRANSFERENCIA A\s+(.+?)(\s+R[FE]C\b.*)?$/)?.[1]
    const banco = linea(m, /^ENVIADO A\s+(.+)$/i)
    if (nom && esTitular(nom, titular))
      return { categoria: 'interno', medio: 'transferencia', comercio: `A tu cuenta en ${titulo(banco ?? 'otro banco')}`, claveComercio: 'INTERNO-EXT', banco }
    if (nom) {
      const p = persona(nom)
      return { categoria: 'personas', medio: 'transferencia', comercio: p.persona, claveComercio: p.clave, persona: p.persona, banco }
    }
    return { categoria: 'personas', medio: 'transferencia', comercio: 'Transferencia SPEI', claveComercio: 'SPEI-ENVIADA', banco }
  }

  // Enlace (entre clientes Santander): "Transferencia a <nombre>"
  if (/TRANSFERENCIA ENLACE/.test(d)) {
    const dest = [m.descripcion.match(/Transferencia a\s+(.+)$/i)?.[1], ...m.detalle].filter(Boolean).join(' ').trim()
    if (abono) {
      // El concepto lo escribe quien envía (normalmente tu propio nombre): el remitente no aparece.
      if (dest && !esTitular(dest, titular, true)) {
        const p = persona(dest)
        return { categoria: 'recibidas', medio: 'transferencia', comercio: `Santander: "${p.persona}"`, claveComercio: `ENLACE:${claveNombre(dest)}` }
      }
      return { categoria: 'recibidas', medio: 'transferencia', comercio: 'Transferencia de otra cuenta Santander', claveComercio: 'ENLACE-RECIBIDA' }
    }
    if (dest && esTitular(dest, titular))
      return { categoria: 'interno', medio: 'transferencia', comercio: 'A tu otra cuenta', claveComercio: 'INTERNO' }
    if (dest) {
      const p = persona(dest)
      return { categoria: 'personas', medio: 'transferencia', comercio: p.persona, claveComercio: p.clave, persona: p.persona }
    }
    return { categoria: 'personas', medio: 'transferencia', comercio: 'Transferencia Santander', claveComercio: 'ENLACE-ENVIADA' }
  }

  if (/DISP ATM|RETIRO EFEC|RETIRO SIN TARJETA|RETIRO EN CAJERO|RETIRO DE EFECTIVO|DISPOSICION EFECTIVO/.test(d))
    return { categoria: 'efectivo', medio: 'efectivo', comercio: /SIN TARJETA/.test(d) ? 'Retiro sin tarjeta' : 'Cajero automático', claveComercio: 'EFECTIVO' }

  if (/DEPOSITO EN EFECTIVO|DEPOSITO EFECTIVO|DEP EFECTIVO/.test(d) && abono)
    return { categoria: 'deposito_efectivo', medio: 'efectivo', comercio: 'Depósito en efectivo', claveComercio: 'DEPOSITO-EFECTIVO' }

  if (/SEGURO/.test(d)) return { categoria: 'seguros', medio: 'cargo', comercio: 'Prima de seguro', claveComercio: 'SEGURO' }
  if (/COMISION|ANUALIDAD|\bIVA\b/.test(d) && !abono)
    return { categoria: 'seguros', medio: 'cargo', comercio: 'Comisiones del banco', claveComercio: 'COMISION' }
  if (/INTERES/.test(d) && abono) return { categoria: 'otros_ingresos', medio: 'otro', comercio: 'Intereses', claveComercio: 'INTERESES' }

  // Compras con tarjeta: el comercio viene en la segunda línea.
  if (/CONSUMO|COMPRA|\bPOS\b|PAGO EN COMERCIO/.test(d) || m.detalle.length) {
    const raw = /CONSUMO|COMPRA/.test(d) && m.detalle[0] ? m.detalle[0] : m.descripcion
    const limpio = limpiarComercio(raw)
    if (abono && /DEVOL|REVERS|CANCEL|REEMBOLSO/.test(todo))
      return { categoria: 'devoluciones', medio: 'tarjeta', comercio: titulo(limpio) || 'Devolución', claveComercio: `DEV:${limpio}` }
    for (const [re, nombre, cat] of MARCAS) {
      if (re.test(limpio) || re.test(todo)) {
        const n = nombre ?? titulo(limpio)
        return { categoria: abono ? 'devoluciones' : cat, medio: 'tarjeta', comercio: n, claveComercio: (nombre ?? limpio).toUpperCase() }
      }
    }
    if (/CONSUMO|COMPRA/.test(d))
      return { categoria: abono ? 'devoluciones' : 'otros_gastos', medio: 'tarjeta', comercio: titulo(limpio) || 'Compra con tarjeta', claveComercio: limpio || 'TARJETA' }
  }

  if (/DOMICILIACION|PAGO DE SERVICIO|PAGO SERVICIO/.test(d))
    return { categoria: 'servicios', medio: 'cargo', comercio: titulo(m.descripcion.replace(/\d{5,}/g, '').trim()), claveComercio: d.replace(/\d+/g, '').trim() }

  const generico = m.descripcion.replace(/\d{5,}/g, '').replace(/\s+/g, ' ').trim()
  return {
    categoria: abono ? 'otros_ingresos' : 'otros_gastos',
    medio: 'otro',
    comercio: titulo(generico) || (abono ? 'Abono' : 'Cargo'),
    claveComercio: generico.toUpperCase()
  }
}

// ---------------------------------------------------------------------------
// Proceso completo

export interface Cuenta {
  cuenta: string
  producto: string
  /** Terminación para mostrar: "••1031". */
  corto: string
  periodos: { ini: string; fin: string; saldoInicial: number; saldoFinal: number; cuadra: boolean }[]
  saldoFinal: number
  fechaSaldo: string
  recibeNomina: boolean
}

export interface DatosBanco {
  movs: MovClasificado[]
  cuentas: Cuenta[]
  titular?: string
  /** Depósitos de nómina vs recibos (se llena al cruzar con los recibos). */
  conciliacion?: { filas: FilaConciliacion[]; fuera: number }
}

const compatible = (cat: CatMov, tipo: 'abono' | 'cargo'): boolean =>
  catNat(cat) === 'interno' || (tipo === 'cargo' ? catNat(cat) === 'gasto' : catNat(cat) === 'ingreso')

export function procesarEstados(estados: EstadoCuenta[], reglas: Reglas): DatosBanco {
  // Un estado por cuenta y periodo; si se repite el periodo gana el más reciente.
  const porId = new Map<string, EstadoCuenta>()
  for (const e of estados) porId.set(e.id, e)
  const lista = [...porId.values()].sort((a, b) => a.periodoInicio.localeCompare(b.periodoInicio))
  const titular = lista.find((e) => e.titular)?.titular

  // Nombres completos (de SPEI) para mostrar bien los cortados en dos líneas.
  const nombres = new Map<string, string>()
  for (const e of lista)
    for (const m of e.movimientos)
      for (const l of m.detalle) {
        const x = l.match(/^(?:DEL|AL) CLIENTE\s+(.+?)(\s*\(\d\))?$/i)
        if (x) nombres.set(claveNombre(x[1]), titulo(x[1]))
      }

  const vistos = new Set<string>()
  const movs: MovClasificado[] = []
  for (const e of lista) {
    for (const m of e.movimientos) {
      // Periodos que se traslapan: el mismo movimiento no se cuenta dos veces.
      if (vistos.has(m.id)) continue
      vistos.add(m.id)
      const a = clasificarAuto(m, titular, nombres)
      movs.push({
        ...m,
        producto: e.producto,
        categoria: a.categoria,
        sugerida: a.categoria,
        naturaleza: catNat(a.categoria) ?? 'gasto',
        medio: a.medio,
        comercio: a.comercio,
        claveComercio: a.claveComercio,
        persona: a.persona,
        banco: a.banco
      })
    }
  }
  movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cuenta.localeCompare(b.cuenta))

  emparejarTraspasos(movs)

  // Reglas del usuario (por movimiento y por comercio)
  for (const m of movs) {
    const rm = reglas[`mov:${m.id}`]
    const rc = reglas[`com:${m.claveComercio}`]
    if (rm && compatible(rm, m.tipo)) {
      m.categoria = rm
      m.regla = 'movimiento'
    } else if (rc && compatible(rc, m.tipo)) {
      m.categoria = rc
      m.regla = 'comercio'
    }
    m.naturaleza = catNat(m.categoria) ?? (m.tipo === 'cargo' ? 'gasto' : 'ingreso')
  }

  const cuentas: Cuenta[] = []
  for (const e of lista) {
    let c = cuentas.find((x) => x.cuenta === e.cuenta)
    if (!c) {
      c = { cuenta: e.cuenta, producto: e.producto, corto: `••${e.cuenta.replace(/\D/g, '').slice(-5, -1)}`, periodos: [], saldoFinal: 0, fechaSaldo: '', recibeNomina: false }
      cuentas.push(c)
    }
    c.periodos.push({ ini: e.periodoInicio, fin: e.periodoFin, saldoInicial: e.saldoInicial, saldoFinal: e.saldoFinal, cuadra: e.cuadre.ok })
    if (e.periodoFin >= c.fechaSaldo) {
      c.fechaSaldo = e.periodoFin
      c.saldoFinal = e.saldoFinal
    }
  }
  for (const c of cuentas) c.recibeNomina = movs.some((m) => m.cuenta === c.cuenta && m.sugerida === 'nomina')
  // Primero la de nómina (de ahí sale el dinero), luego las demás.
  cuentas.sort((a, b) => Number(b.recibeNomina) - Number(a.recibeNomina) || a.producto.localeCompare(b.producto))

  return { movs, cuentas, titular }
}

/** Une el cargo de una cuenta con el abono en la otra (mismo folio o mismo importe ±1 día). */
function emparejarTraspasos(movs: MovClasificado[]): void {
  const libres = new Set(movs)
  const buscar = (m: MovClasificado, porFolio: boolean): MovClasificado | undefined => {
    let mejor: MovClasificado | undefined
    for (const o of libres) {
      if (o === m || o.cuenta === m.cuenta || o.tipo === m.tipo || Math.abs(o.monto - m.monto) > 0.005) continue
      const dd = Math.abs(diffDays(o.fecha, m.fecha))
      if (dd > 1) continue
      if (porFolio && !(o.folio && o.folio === m.folio && !/^0+$/.test(o.folio))) continue
      if (!porFolio && o.categoria !== 'interno') continue
      if (!mejor || dd < Math.abs(diffDays(mejor.fecha, m.fecha))) mejor = o
    }
    return mejor
  }
  for (const porFolio of [true, false]) {
    for (const m of movs) {
      if (!libres.has(m)) continue
      if (!porFolio && m.categoria !== 'interno') continue
      const o = buscar(m, porFolio)
      if (!o) continue
      libres.delete(m)
      libres.delete(o)
      m.parId = o.id
      o.parId = m.id
      for (const x of [m, o]) {
        if (x.categoria !== 'interno') {
          x.categoria = 'interno'
          x.sugerida = 'interno'
          x.naturaleza = 'interno'
          x.claveComercio = 'INTERNO'
        }
      }
      m.comercio = m.tipo === 'cargo' ? `A ${o.producto}` : `Desde ${o.producto}`
      o.comercio = o.tipo === 'cargo' ? `A ${m.producto}` : `Desde ${m.producto}`
    }
  }
}

// ---------------------------------------------------------------------------
// Conciliación con los recibos de nómina

export type EstadoConciliacion = 'coincide' | 'diferencia' | 'sin_deposito' | 'sin_recibo'

export interface FilaConciliacion {
  recibo?: Recibo
  mov?: MovClasificado
  estado: EstadoConciliacion
  diferencia?: number
  fecha: string
}

export function conciliarNomina(recibos: Recibo[], datos: DatosBanco): { filas: FilaConciliacion[]; fuera: number } {
  const depositos = datos.movs.filter((m) => m.sugerida === 'nomina' || m.categoria === 'nomina')
  const ctasNomina = datos.cuentas.filter((c) => c.recibeNomina)
  const cubierto = (f: string): boolean => ctasNomina.some((c) => c.periodos.some((p) => f >= p.ini && f <= p.fin))
  const usados = new Set<MovClasificado>()
  const filas: FilaConciliacion[] = []
  let fuera = 0
  const dist = (r: Recibo, m: MovClasificado): number =>
    Math.min(Math.abs(diffDays(r.fechaPago, m.fecha)), Math.abs(diffDays(r.fecha, m.fecha)))
  const candidatos = recibos.filter((r) => r.totales.depositado > 0)

  for (const r of candidatos) {
    let mejor: MovClasificado | undefined
    for (const m of depositos) {
      if (usados.has(m) || Math.abs(m.monto - r.totales.depositado) > 0.01) continue
      if (dist(r, m) > 10) continue
      if (!mejor || dist(r, m) < dist(r, mejor)) mejor = m
    }
    if (mejor) {
      usados.add(mejor)
      mejor.reciboId = r.id
      filas.push({ recibo: r, mov: mejor, estado: 'coincide', fecha: mejor.fecha })
    }
  }
  for (const r of candidatos) {
    if (filas.some((f) => f.recibo === r)) continue
    // Mismo periodo pero otro importe
    let cerca: MovClasificado | undefined
    for (const m of depositos) {
      if (usados.has(m) || dist(r, m) > 4) continue
      if (!cerca || dist(r, m) < dist(r, cerca)) cerca = m
    }
    if (cerca) {
      usados.add(cerca)
      cerca.reciboId = r.id
      filas.push({ recibo: r, mov: cerca, estado: 'diferencia', diferencia: r2(cerca.monto - r.totales.depositado), fecha: cerca.fecha })
    } else if (cubierto(r.fechaPago) || cubierto(r.fecha)) {
      filas.push({ recibo: r, estado: 'sin_deposito', fecha: r.fecha })
    } else fuera++
  }
  for (const m of depositos) if (!usados.has(m)) filas.push({ mov: m, estado: 'sin_recibo', fecha: m.fecha })
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { filas, fuera }
}

// ---------------------------------------------------------------------------
// Agregados

export interface PeriodoMov {
  key: string
  label: string
  sub: string
  banda: string
  bandaLabel: string
  detalle: string
  ini: string
  fin: string
  ingresos: number
  gastos: number
  internos: number
  /** Gasto de la categoría seleccionada (si hay). */
  cat: number
  movs: MovClasificado[]
  /** Saldo al cierre por cuenta (null si no hay estado que cubra esa fecha). */
  saldos: Record<string, number | null>
  saldoTotal: number | null
  /** Cuentas sin estado cargado para parte (o todo) el periodo. */
  parcial: string[]
}

/** Intervalos de cobertura de una cuenta, unidos. */
function cobertura(c: Cuenta): { ini: string; fin: string }[] {
  const ps = [...c.periodos].sort((a, b) => a.ini.localeCompare(b.ini))
  const out: { ini: string; fin: string }[] = []
  for (const p of ps) {
    const u = out[out.length - 1]
    if (u && p.ini <= addDays(u.fin, 1)) u.fin = p.fin > u.fin ? p.fin : u.fin
    else out.push({ ini: p.ini, fin: p.fin })
  }
  return out
}

/** ¿La cuenta tiene estado para todos los días entre ini y fin? */
export function cubre(c: Cuenta, ini: string, fin: string): boolean {
  return cobertura(c).some((u) => u.ini <= ini && u.fin >= fin)
}

/** ¿Todas las cuentas tienen estado para el mes completo? (para comparar meses sin engañar) */
export function mesCompleto(datos: DatosBanco, mes: string): boolean {
  const p = periodoDe(`${mes}-01`, 'mes')
  return datos.cuentas.length > 0 && datos.cuentas.every((c) => cubre(c, p.ini, p.fin))
}

function periodoDe(fecha: string, g: Granularidad): { key: string; ini: string; fin: string } {
  if (g === 'mes') {
    const key = fecha.slice(0, 7)
    const [y, m] = key.split('-').map(Number)
    const fin = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1)
    return { key, ini: `${key}-01`, fin }
  }
  const w = isoWeek(fecha)
  const ini = mondayOfIsoWeek(w.year, w.week)
  return { key: `${w.year}-S${String(w.week).padStart(2, '0')}`, ini, fin: addDays(ini, 6) }
}

/**
 * Saldo de una cuenta al final del día `f`. null si ningún estado cubre esa fecha
 * (antes del primero, en un hueco entre estados o más de una semana después del último).
 */
export function saldoAl(datos: DatosBanco, cuenta: string, f: string): number | null {
  const c = datos.cuentas.find((x) => x.cuenta === cuenta)
  if (!c || !c.periodos.length) return null
  const primero = c.periodos.reduce((a, p) => (p.ini < a ? p.ini : a), c.periodos[0].ini)
  const ultimo = c.periodos.reduce((a, p) => (p.fin > a ? p.fin : a), c.periodos[0].fin)
  if (f < primero || f > addDays(ultimo, 7)) return null
  if (f <= ultimo && !c.periodos.some((p) => f >= p.ini && f <= p.fin)) return null
  let best: { f: string; s: number } | null = null
  for (const p of c.periodos) if (p.ini <= f && (!best || addDays(p.ini, -1) > best.f)) best = { f: addDays(p.ini, -1), s: p.saldoInicial }
  for (const m of datos.movs) {
    if (m.cuenta !== cuenta) continue
    if (m.fecha > f) break
    if (!best || m.fecha >= best.f) best = { f: m.fecha, s: m.saldo }
  }
  return best?.s ?? null
}

/** Saldo de cada cuenta al cierre del rango (o el último conocido si no hay fecha final) y el total. */
export function saldosAlCorte(
  datos: DatosBanco,
  hasta: string | null
): { corte: string; saldos: { c: Cuenta; s: number | null }[]; total: number } {
  const corte = hasta ?? datos.cuentas.reduce((a, c) => (c.fechaSaldo > a ? c.fechaSaldo : a), '')
  const saldos = datos.cuentas.map((c) => ({ c, s: saldoAl(datos, c.cuenta, corte) ?? (hasta ? null : c.saldoFinal) }))
  return { corte, saldos, total: r2(saldos.reduce((a, x) => a + (x.s ?? 0), 0)) }
}

export function agruparMovs(
  movs: MovClasificado[],
  g: Granularidad,
  datos: DatosBanco,
  cat: CatMov | null,
  rango?: { desde: string | null; hasta: string | null }
): PeriodoMov[] {
  if (!movs.length) return []
  // Todas las semanas/meses entre el primero y el último (las vacías también).
  const ini = movs[0].fecha
  const fin = movs[movs.length - 1].fecha
  const out: PeriodoMov[] = []
  let cursor = periodoDe(ini, g)
  const idx = new Map<string, PeriodoMov>()
  for (let guard = 0; guard < 600; guard++) {
    const [y, m] = cursor.ini.split('-').map(Number)
    const banda = g === 'semana' ? addDays(cursor.ini, 3).slice(0, 7) : cursor.key.slice(0, 4)
    const [by, bm] = banda.split('-').map(Number)
    const p: PeriodoMov = {
      key: cursor.key,
      label: g === 'semana' ? `S${Number(cursor.key.slice(6))}` : MES_LARGO_CAP[m - 1].slice(0, 3).toLowerCase(),
      sub: g === 'semana' ? fmtRangoCorto(cursor.ini, cursor.fin) : String(y),
      banda,
      bandaLabel: g === 'semana' ? `${MES_LARGO_CAP[bm - 1]} ${by}` : String(by),
      detalle: g === 'semana' ? `Semana ${Number(cursor.key.slice(6))} · ${fmtRango(cursor.ini, cursor.fin)}` : fmtMes(cursor.key, true),
      ini: cursor.ini,
      fin: cursor.fin,
      ingresos: 0,
      gastos: 0,
      internos: 0,
      cat: 0,
      movs: [],
      saldos: {},
      saldoTotal: null,
      parcial: datos.cuentas.filter((c) => !cubre(c, cursor.ini, cursor.fin)).map((c) => c.producto)
    }
    out.push(p)
    idx.set(p.key, p)
    if (cursor.fin >= fin) break
    cursor = periodoDe(addDays(cursor.fin, 1), g)
  }
  for (const m of movs) {
    const p = idx.get(periodoDe(m.fecha, g).key)
    if (!p) continue
    p.movs.push(m)
    if (m.naturaleza === 'ingreso') p.ingresos = r2(p.ingresos + m.monto)
    else if (m.naturaleza === 'gasto') p.gastos = r2(p.gastos + m.monto)
    else if (m.tipo === 'cargo') p.internos = r2(p.internos + m.monto)
    if (cat && m.categoria === cat) p.cat = r2(p.cat + m.monto)
  }
  for (const p of out) {
    const corte = rango?.hasta && rango.hasta < p.fin ? rango.hasta : p.fin
    let total = 0
    let completo = true
    for (const c of datos.cuentas) {
      const s = saldoAl(datos, c.cuenta, corte)
      p.saldos[c.cuenta] = s
      if (s == null) completo = false
      else total += s
    }
    p.saldoTotal = completo ? r2(total) : null
  }
  return out
}

/** Una "vela" del saldo: cómo abrió, cuánto llegó a subir y a bajar, y cómo cerró el periodo. */
export interface Vela {
  key: string
  label: string
  sub: string
  banda: string
  bandaLabel: string
  detalle: string
  ini: string
  fin: string
  /** Apertura, máximo, mínimo y cierre del saldo (al cierre de cada día). */
  o: number
  h: number
  l: number
  c: number
  ingresos: number
  gastos: number
  /** Monto de la categoría elegida en el periodo (0 si no hay categoría). */
  cat: number
  n: number
  /** Cuentas sin estado completo en el periodo (la vela puede no ser exacta). */
  parcial: string[]
}

/**
 * Saldo de tus cuentas en el tiempo: velas por semana o mes y el saldo de cada día.
 * Los máximos y mínimos se toman al cierre de cada día (un traspaso entre tus cuentas no fabrica picos).
 */
export type GranVela = 'dia' | Granularidad

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export function serieSaldo(
  datos: DatosBanco,
  g: GranVela,
  rango: { desde: string | null; hasta: string | null },
  cuenta: string | null,
  cat: CatMov | null = null
): { velas: Vela[]; dias: { fecha: string; saldo: number }[] } {
  const cuentas = datos.cuentas.filter((c) => !cuenta || c.cuenta === cuenta)
  const ids = new Set(cuentas.map((c) => c.cuenta))
  const todos = datos.movs.filter((m) => ids.has(m.cuenta))
  if (!todos.length) return { velas: [], dias: [] }

  // Saldo de cada cuenta antes de su primer movimiento.
  const cur: Record<string, number> = {}
  for (const c of cuentas) {
    const p0 = [...c.periodos].sort((a, b) => a.ini.localeCompare(b.ini))[0]
    if (p0) cur[c.cuenta] = p0.saldoInicial
  }
  for (const m of todos) if (!(m.cuenta in cur)) cur[m.cuenta] = r2(m.saldo + (m.tipo === 'cargo' ? m.monto : -m.monto))
  const suma = (): number => r2(Object.values(cur).reduce((a, b) => a + b, 0))
  const inicial = suma()
  const cierres: { fecha: string; saldo: number }[] = []
  for (const m of todos) {
    cur[m.cuenta] = m.saldo
    const s = suma()
    const u = cierres[cierres.length - 1]
    if (u && u.fecha === m.fecha) u.saldo = s
    else cierres.push({ fecha: m.fecha, saldo: s })
  }
  const alCierre = (f: string): number => {
    let s = inicial
    for (const x of cierres) {
      if (x.fecha > f) break
      s = x.saldo
    }
    return s
  }

  const enRango = filtrarMovs(todos, rango.desde, rango.hasta)
  if (!enRango.length) return { velas: [], dias: [] }
  const ultimo = enRango[enRango.length - 1].fecha
  // Periodos: cada día, o las semanas/meses de siempre.
  let periodos: { key: string; label: string; sub: string; banda: string; bandaLabel: string; detalle: string; ini: string; fin: string; ingresos: number; gastos: number; cat: number; n: number }[]
  if (g === 'dia') {
    const porDia = new Map<string, { i: number; g: number; c: number; n: number }>()
    for (const m of enRango) {
      const x = porDia.get(m.fecha) ?? { i: 0, g: 0, c: 0, n: 0 }
      if (m.naturaleza === 'ingreso') x.i = r2(x.i + m.monto)
      else if (m.naturaleza === 'gasto') x.g = r2(x.g + m.monto)
      if (cat && m.categoria === cat) x.c = r2(x.c + m.monto)
      x.n++
      porDia.set(m.fecha, x)
    }
    periodos = []
    let d = enRango[0].fecha
    for (let guard = 0; guard < 1500 && d <= ultimo; guard++) {
      const x = porDia.get(d)
      const [y, mo, dd] = d.split('-').map(Number)
      periodos.push({
        key: d,
        label: String(dd),
        sub: DIA_CORTO[fromIso(d).getDay()],
        banda: d.slice(0, 7),
        bandaLabel: fmtMes(d.slice(0, 7), true),
        detalle: `${DIA_CORTO[fromIso(d).getDay()]} ${dd} ${MES_LARGO_CAP[mo - 1].slice(0, 3).toLowerCase()} ${y}`,
        ini: d,
        fin: d,
        ingresos: x?.i ?? 0,
        gastos: x?.g ?? 0,
        cat: x?.c ?? 0,
        n: x?.n ?? 0
      })
      d = addDays(d, 1)
    }
  } else
    periodos = agruparMovs(enRango, g, datos, cat, rango).map((p) => ({ ...p, n: p.movs.length }))
  const velas: Vela[] = periodos.map((p) => {
    const ini = rango.desde && rango.desde > p.ini ? rango.desde : p.ini
    const fin = ultimo < p.fin ? ultimo : p.fin
    const o = alCierre(addDays(ini, -1))
    const c = alCierre(fin)
    let h = Math.max(o, c)
    let l = Math.min(o, c)
    for (const x of cierres) if (x.fecha >= ini && x.fecha <= fin) {
      h = Math.max(h, x.saldo)
      l = Math.min(l, x.saldo)
    }
    return {
      key: p.key,
      label: p.label,
      sub: p.sub,
      banda: p.banda,
      bandaLabel: p.bandaLabel,
      detalle: p.detalle,
      ini: p.ini,
      fin: p.fin,
      o,
      h,
      l,
      c,
      ingresos: p.ingresos,
      gastos: p.gastos,
      cat: p.cat,
      n: p.n,
      parcial: cuentas.filter((x) => !cubre(x, p.ini, p.fin)).map((x) => x.producto)
    }
  })

  const dias: { fecha: string; saldo: number }[] = []
  let f = enRango[0].fecha
  for (let guard = 0; guard < 1500 && f <= ultimo; guard++) {
    dias.push({ fecha: f, saldo: alCierre(f) })
    f = addDays(f, 1)
  }
  return { velas, dias }
}

export interface ResumenCategoria {
  cat: CatMov
  total: number
  n: number
  pct: number
  /** Total por mes del rango (para la mini tendencia). */
  serie: { key: string; v: number }[]
  ultimo: number
  anterior: number | null
}

export function resumenCategorias(movs: MovClasificado[], nat: Naturaleza): ResumenCategoria[] {
  const xs = movs.filter((m) => m.naturaleza === nat)
  const total = xs.reduce((s, m) => s + m.monto, 0)
  const meses = [...new Set(movs.map((m) => m.fecha.slice(0, 7)))].sort()
  const map = new Map<CatMov, MovClasificado[]>()
  for (const m of xs) map.set(m.categoria, [...(map.get(m.categoria) ?? []), m])
  return [...map.entries()]
    .map(([cat, ms]) => {
      const serie = meses.map((k) => ({ key: k, v: r2(ms.filter((m) => m.fecha.startsWith(k)).reduce((s, m) => s + m.monto, 0)) }))
      return {
        cat,
        total: r2(ms.reduce((s, m) => s + m.monto, 0)),
        n: ms.length,
        pct: total ? ms.reduce((s, m) => s + m.monto, 0) / total : 0,
        serie,
        ultimo: serie[serie.length - 1]?.v ?? 0,
        anterior: serie.length > 1 ? serie[serie.length - 2].v : null
      }
    })
    .sort((a, b) => b.total - a.total)
}

/**
 * Cuánto cambió cada categoría: las últimas 4 semanas contra las 4 anteriores (hasta el último movimiento).
 * null si antes no había gasto (no se puede comparar).
 */
export function cambioPorCategoria(movs: MovClasificado[], nat: Naturaleza): Map<CatMov, number | null> {
  const out = new Map<CatMov, number | null>()
  const xs = movs.filter((m) => m.naturaleza === nat)
  if (!xs.length) return out
  const fin = movs[movs.length - 1].fecha
  const a0 = addDays(fin, -27)
  const b0 = addDays(fin, -55)
  const ahora = new Map<CatMov, number>()
  const antes = new Map<CatMov, number>()
  for (const m of xs) {
    if (m.fecha >= a0) ahora.set(m.categoria, (ahora.get(m.categoria) ?? 0) + m.monto)
    else if (m.fecha >= b0) antes.set(m.categoria, (antes.get(m.categoria) ?? 0) + m.monto)
  }
  for (const c of new Set(xs.map((m) => m.categoria))) {
    const b = antes.get(c) ?? 0
    out.set(c, b > 0 ? (ahora.get(c) ?? 0) / b - 1 : null)
  }
  return out
}

export interface ResumenComercio {
  clave: string
  comercio: string
  categoria: CatMov
  total: number
  n: number
  ultima: string
}

export function topComercios(movs: MovClasificado[], nat: Naturaleza = 'gasto'): ResumenComercio[] {
  const map = new Map<string, ResumenComercio>()
  for (const m of movs) {
    if (m.naturaleza !== nat) continue
    const k = m.claveComercio
    const x = map.get(k) ?? { clave: k, comercio: m.comercio, categoria: m.categoria, total: 0, n: 0, ultima: m.fecha }
    x.total = r2(x.total + m.monto)
    x.n++
    if (m.fecha >= x.ultima) {
      x.ultima = m.fecha
      x.categoria = m.categoria
    }
    map.set(k, x)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export interface ResumenPersona {
  clave: string
  persona: string
  enviado: number
  recibido: number
  nEnv: number
  nRec: number
  ultima: string
}

export function personas(movs: MovClasificado[]): ResumenPersona[] {
  const map = new Map<string, ResumenPersona>()
  for (const m of movs) {
    if (!m.persona || m.naturaleza === 'interno') continue
    const k = m.claveComercio
    const x = map.get(k) ?? { clave: k, persona: m.persona, enviado: 0, recibido: 0, nEnv: 0, nRec: 0, ultima: m.fecha }
    if (m.tipo === 'cargo') {
      x.enviado = r2(x.enviado + m.monto)
      x.nEnv++
    } else {
      x.recibido = r2(x.recibido + m.monto)
      x.nRec++
    }
    if (m.fecha > x.ultima) x.ultima = m.fecha
    map.set(k, x)
  }
  return [...map.values()].sort((a, b) => b.enviado + b.recibido - (a.enviado + a.recibido))
}

export function filtrarMovs(movs: MovClasificado[], desde: string | null, hasta: string | null): MovClasificado[] {
  return movs.filter((m) => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta))
}

export interface TotalesMov {
  ingresos: number
  gastos: number
  internos: number
  nomina: number
  efectivo: number
  dias: number
}

export function totalesMovs(movs: MovClasificado[]): TotalesMov {
  const sum = (f: (m: MovClasificado) => boolean): number => r2(movs.filter(f).reduce((s, m) => s + m.monto, 0))
  return {
    ingresos: sum((m) => m.naturaleza === 'ingreso'),
    gastos: sum((m) => m.naturaleza === 'gasto'),
    internos: sum((m) => m.naturaleza === 'interno' && m.tipo === 'cargo'),
    nomina: sum((m) => m.categoria === 'nomina'),
    efectivo: sum((m) => m.categoria === 'efectivo'),
    dias: movs.length ? diffDays(movs[0].fecha, movs[movs.length - 1].fecha) + 1 : 0
  }
}

/**
 * Cómo cambió el saldo en lo que estás viendo, como en un estado de cuenta:
 * saldo al inicio + entró − salió ± traspasos sueltos (± meses sin estado) = saldo al final.
 * Los traspasos emparejados dentro del alcance se cancelan; los que quedan son los que su otro lado
 * no está a la vista (otra cuenta filtrada, o fechas sin estado de la otra cuenta).
 */
export interface CambioSaldo {
  inicial: number
  final: number
  entro: number
  salio: number
  traspasos: number
  /** Diferencia que no explican los movimientos (meses sin estado entre dos estados de la misma cuenta). */
  sinEstado: number
  cuentas: { cuenta: string; producto: string; inicial: number; final: number; desde: string; hasta: string }[]
}

export function cambioSaldo(movs: MovClasificado[], datos: DatosBanco): CambioSaldo {
  const cuentas: CambioSaldo['cuentas'] = []
  for (const c of datos.cuentas) {
    const ms = movs.filter((m) => m.cuenta === c.cuenta)
    if (!ms.length) continue
    const p = ms[0]
    const u = ms[ms.length - 1]
    cuentas.push({
      cuenta: c.cuenta,
      producto: c.producto,
      inicial: r2(p.saldo - (p.tipo === 'abono' ? p.monto : -p.monto)),
      final: u.saldo,
      desde: p.fecha,
      hasta: u.fecha
    })
  }
  const t = totalesMovs(movs)
  const traspasos = r2(movs.filter((m) => m.naturaleza === 'interno').reduce((s, m) => s + (m.tipo === 'abono' ? m.monto : -m.monto), 0))
  const inicial = r2(cuentas.reduce((s, c) => s + c.inicial, 0))
  const final = r2(cuentas.reduce((s, c) => s + c.final, 0))
  const sinEstado = r2(final - (inicial + t.ingresos - t.gastos + traspasos))
  return { inicial, final, entro: t.ingresos, salio: t.gastos, traspasos, sinEstado: Math.abs(sinEstado) < 1 ? 0 : sinEstado, cuentas }
}

export function describirCobertura(c: Cuenta): string {
  const ps = [...c.periodos].sort((a, b) => a.ini.localeCompare(b.ini))
  // Une periodos contiguos: "01 oct – 15 nov 2026"
  const unidos: { ini: string; fin: string }[] = []
  for (const p of ps) {
    const u = unidos[unidos.length - 1]
    if (u && p.ini <= addDays(u.fin, 1)) u.fin = p.fin > u.fin ? p.fin : u.fin
    else unidos.push({ ...p })
  }
  return unidos.map((u) => fmtRango(u.ini, u.fin)).join(' · ')
}

/** Huecos entre estados de una misma cuenta (meses sin estado cargado). */
export function huecos(c: Cuenta): { ini: string; fin: string }[] {
  const ps = [...c.periodos].sort((a, b) => a.ini.localeCompare(b.ini))
  const out: { ini: string; fin: string }[] = []
  for (let i = 1; i < ps.length; i++) {
    const esperado = addDays(ps[i - 1].fin, 1)
    if (ps[i].ini > esperado) out.push({ ini: esperado, fin: addDays(ps[i].ini, -1) })
  }
  return out
}

export const fmtFechaCorta = (f: string): string => fmtFecha(f, false)

// ---------------------------------------------------------------------------
// Flujo del dinero (diagrama Sankey): fuentes → cuentas → destinos

/** Un bloque del diagrama: una categoría, un traspaso que no se ve del otro lado o el saldo. */
export interface NodoFlujo {
  key: string
  name: string
  valor: number
  tipo: 'cat' | 'traspaso' | 'saldo'
  cat?: CatMov
  /** Explicación para el tooltip. */
  nota?: string
  /** Movimientos que suma (para el tooltip). */
  n: number
}

export interface Flujo {
  entradas: NodoFlujo[]
  salidas: NodoFlujo[]
  /** Nombre del bloque central: "Tus cuentas" o la cuenta elegida. */
  centro: string
  cuentas: { cuenta: string; producto: string }[]
  /** Lo que pasa por el centro (= suma de entradas = suma de salidas). */
  total: number
}

export const NODO_QUEDO = 'Quedó en tus cuentas'
export const NODO_SALDO_PREVIO = 'De tu saldo anterior'

/**
 * Flujo del periodo en tres columnas: de dónde entró → tus cuentas → en qué salió.
 * Los traspasos entre tus cuentas que se ven de los dos lados se cancelan (no son ingreso ni gasto).
 * Los que no tienen el otro lado a la vista aparecen como "A …" / "De …". Lo que entró y no salió va a
 * "Quedó en tus cuentas"; si salió más de lo que entró, la diferencia viene "De tu saldo anterior".
 */
export function flujoDinero(movs: MovClasificado[], datos: DatosBanco, maxDestinos = 7): Flujo {
  const enAlcance = new Set(movs.map((m) => m.cuenta))
  const nombre = (cuenta: string): string => datos.cuentas.find((c) => c.cuenta === cuenta)?.producto ?? cuenta
  const ids = new Set(movs.map((m) => m.id))
  const porId = new Map(datos.movs.map((m) => [m.id, m]))
  const cuentas = datos.cuentas.filter((c) => enAlcance.has(c.cuenta)).map((c) => ({ cuenta: c.cuenta, producto: c.producto }))

  const top = (nat: Naturaleza, max: number): Set<CatMov> => {
    const t = new Map<CatMov, number>()
    for (const m of movs) if (m.naturaleza === nat) t.set(m.categoria, (t.get(m.categoria) ?? 0) + m.monto)
    const orden = [...t.entries()].sort((x, y) => y[1] - x[1]).map(([c]) => c)
    return new Set(orden.length > max ? orden.slice(0, max - 1) : orden)
  }
  const topG = top('gasto', maxDestinos)
  const topI = top('ingreso', 5)

  const ent = new Map<string, NodoFlujo>()
  const sal = new Map<string, NodoFlujo>()
  const add = (map: Map<string, NodoFlujo>, base: Omit<NodoFlujo, 'valor' | 'n'>, v: number): void => {
    const x = map.get(base.key) ?? { ...base, valor: 0, n: 0 }
    x.valor = r2(x.valor + v)
    x.n++
    map.set(base.key, x)
  }
  const otraCuenta = (m: MovClasificado): string | null => {
    if (m.parId) return porId.get(m.parId)?.cuenta ?? null
    if (m.claveComercio === 'INTERNO') {
      const otras = datos.cuentas.filter((c) => c.cuenta !== m.cuenta)
      return otras.length === 1 ? otras[0].cuenta : null
    }
    return null
  }

  for (const m of movs) {
    if (m.naturaleza === 'ingreso') {
      const c: CatMov = topI.has(m.categoria) ? m.categoria : 'otros_ingresos'
      add(ent, { key: `cat:${c}`, name: catLabel(c), tipo: 'cat', cat: topI.has(m.categoria) ? c : undefined }, m.monto)
    } else if (m.naturaleza === 'gasto') {
      const dentro = topG.has(m.categoria)
      add(
        sal,
        { key: dentro ? `cat:${m.categoria}` : 'cat:resto', name: dentro ? catLabel(m.categoria) : 'Otras categorías', tipo: 'cat', cat: dentro ? m.categoria : undefined },
        m.monto
      )
    } else {
      // Traspaso con sus dos lados a la vista: se cancela.
      if (m.parId && ids.has(m.parId)) continue
      const otra = otraCuenta(m)
      const visible = otra != null && enAlcance.has(otra)
      const nota = !otra
        ? 'Dinero entre tus cuentas de otro banco.'
        : visible
          ? `${nombre(otra)} no tiene estado de cuenta cargado de esas fechas, así que no se ve qué pasó del otro lado.`
          : `Traspaso con tu cuenta ${nombre(otra)} (no está en lo que estás viendo).`
      if (m.tipo === 'cargo')
        add(sal, { key: `tr:${otra ?? 'ext'}`, name: otra ? `A ${nombre(otra)}` : 'A tus cuentas de otro banco', tipo: 'traspaso', nota }, m.monto)
      else add(ent, { key: `tr:${otra ?? 'ext'}`, name: otra ? `De ${nombre(otra)}` : 'De tus cuentas de otro banco', tipo: 'traspaso', nota }, m.monto)
    }
  }

  const sum = (xs: Map<string, NodoFlujo>): number => [...xs.values()].reduce((s, x) => s + x.valor, 0)
  const dif = r2(sum(ent) - sum(sal))
  if (dif > 0.5)
    sal.set('saldo', { key: 'saldo', name: NODO_QUEDO, valor: dif, tipo: 'saldo', n: 0, nota: 'Lo que entró y no salió: tu saldo subió esto.' })
  else if (dif < -0.5)
    ent.set('saldo', { key: 'saldo', name: NODO_SALDO_PREVIO, valor: -dif, tipo: 'saldo', n: 0, nota: 'Salió más de lo que entró: la diferencia salió de lo que ya tenías.' })

  const orden = (xs: Map<string, NodoFlujo>): NodoFlujo[] => {
    const rango = { cat: 0, traspaso: 1, saldo: 2 }
    return [...xs.values()].sort((x, y) => rango[x.tipo] - rango[y.tipo] || (x.key === 'cat:resto' ? 1 : 0) - (y.key === 'cat:resto' ? 1 : 0) || y.valor - x.valor)
  }
  const entradas = orden(ent)
  return {
    entradas,
    salidas: orden(sal),
    centro: cuentas.length === 1 ? cuentas[0].producto : 'Tus cuentas',
    cuentas,
    total: r2(entradas.reduce((s, x) => s + x.valor, 0))
  }
}
