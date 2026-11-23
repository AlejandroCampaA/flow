import { XMLParser } from 'fast-xml-parser'
import type { HorasExtraXml, ParsedDoc, RawLinea } from './types'

const ARRAYS = new Set(['Percepcion', 'Deduccion', 'OtroPago', 'HorasExtra', 'Nomina'])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseAttributeValue: false,
  isArray: (name) => ARRAYS.has(name)
})

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export class XmlFormatoError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any

export function parseCfdiXml(xml: string, archivo: string): ParsedDoc {
  let doc: Node
  try {
    doc = parser.parse(xml)
  } catch {
    throw new XmlFormatoError('El XML está dañado o no se pudo leer.')
  }
  const comp: Node = doc?.Comprobante
  if (!comp) throw new XmlFormatoError('El XML no es un CFDI (no tiene Comprobante).')
  if (comp.TipoDeComprobante && comp.TipoDeComprobante !== 'N') {
    throw new XmlFormatoError('El CFDI no es de nómina (TipoDeComprobante distinto de "N").')
  }
  const complemento: Node = comp.Complemento ?? {}
  const nomina: Node = complemento.Nomina?.[0]
  const uuid: string | undefined = complemento.TimbreFiscalDigital?.UUID
  if (!nomina || !uuid) throw new XmlFormatoError('El CFDI no trae complemento de nómina o timbre fiscal.')

  const percepciones: RawLinea[] = []
  const horasExtra: HorasExtraXml[] = []
  for (const p of (nomina.Percepciones?.Percepcion ?? []) as Node[]) {
    const exento = num(p.ImporteExento)
    const gravado = num(p.ImporteGravado)
    percepciones.push({
      clave: p.Clave,
      tipoSat: p.TipoPercepcion,
      concepto: String(p.Concepto ?? ''),
      exento,
      gravado,
      importe: Math.round((exento + gravado) * 100) / 100
    })
    for (const h of (p.HorasExtra ?? []) as Node[]) {
      horasExtra.push({
        tipo: h.TipoHoras === '02' ? 'triple' : h.TipoHoras === '03' ? 'simple' : 'doble',
        dias: num(h.Dias),
        horas: num(h.HorasExtra),
        importe: num(h.ImportePagado)
      })
    }
  }

  const deducciones: RawLinea[] = ((nomina.Deducciones?.Deduccion ?? []) as Node[]).map((d) => ({
    clave: d.Clave,
    tipoSat: d.TipoDeduccion,
    concepto: String(d.Concepto ?? ''),
    exento: 0,
    gravado: 0,
    importe: num(d.Importe)
  }))

  const otrosPagos: RawLinea[] = ((nomina.OtrosPagos?.OtroPago ?? []) as Node[]).map((o) => ({
    clave: o.Clave,
    tipoSat: o.TipoOtroPago,
    concepto: String(o.Concepto ?? ''),
    exento: num(o.Importe),
    gravado: 0,
    importe: num(o.Importe)
  }))

  const rec: Node = nomina.Receptor ?? {}
  return {
    fuente: 'xml',
    archivo,
    uuid: uuid.toUpperCase(),
    importadoEn: new Date().toISOString(),
    fechaEmision: String(comp.Fecha ?? '').slice(0, 10) || undefined,
    fechaPago: nomina.FechaPago,
    periodoInicio: nomina.FechaInicialPago,
    periodoFin: nomina.FechaFinalPago,
    diasPagados: nomina.NumDiasPagados != null ? num(nomina.NumDiasPagados) : undefined,
    tipoNomina: nomina.TipoNomina,
    horasExtra,
    percepciones,
    deducciones,
    otrosPagos,
    totalesDoc: {
      percepciones: num(nomina.TotalPercepciones),
      deducciones: num(nomina.TotalDeducciones),
      total: num(comp.Total),
      neto: num(comp.Total)
    },
    empleado: {
      nombre: comp.Receptor?.Nombre,
      numero: rec.NumEmpleado,
      puesto: rec.Puesto,
      depto: rec.Departamento,
      empresa: comp.Emisor?.Nombre
    }
  }
}
