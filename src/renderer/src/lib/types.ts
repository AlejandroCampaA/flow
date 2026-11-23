export type Fuente = 'pdf' | 'xml'

/** Línea tal cual viene en el recibo (percepción, deducción u otro pago). */
export interface RawLinea {
  clave?: string
  tipoSat?: string
  concepto: string
  exento: number
  gravado: number
  importe: number
}

export interface HorasExtraXml {
  tipo: 'doble' | 'triple' | 'simple'
  dias: number
  horas: number
  importe: number
}

export interface AhorroAcumulado {
  empleado: number
  empresa: number
  acumulado: number
  prestamo: number
  totalAbonado: number
  saldo: number
}

/** Resultado de leer UN archivo. Es lo que se guarda en disco. */
export interface ParsedDoc {
  fuente: Fuente
  archivo: string
  /** Nombre con el que se guardó la copia del original (carpeta de datos). */
  copia?: string
  uuid: string
  importadoEn: string
  fechaEmision?: string
  fechaPago?: string
  periodoInicio?: string
  periodoFin?: string
  semana?: number
  diasPagados?: number
  salarioDiario?: number
  tipoNomina?: string
  horas?: {
    normales?: number
    dobles?: number
    triples?: number
    diasAguinaldo?: number
    diasVacaciones?: number
  }
  horasExtra?: HorasExtraXml[]
  percepciones: RawLinea[]
  deducciones: RawLinea[]
  otrosPagos: RawLinea[]
  totalesDoc?: {
    percepciones?: number
    deducciones?: number
    total?: number
    despensa?: number
    neto?: number
    isr?: number
  }
  ahorroAcumulado?: AhorroAcumulado
  empleado?: { nombre?: string; numero?: string; puesto?: string; depto?: string; empresa?: string }
}

export type Categoria =
  | 'sueldo'
  | 'tiempo_extra'
  | 'bonos'
  | 'despensa'
  | 'primas'
  | 'prestaciones'
  | 'ahorro'
  | 'otras'

export type TipoDeduccion = 'isr' | 'imss' | 'ahorro' | 'cafeteria' | 'infonavit' | 'prestamo' | 'otra'

export interface Percepcion extends RawLinea {
  categoria: Categoria
  /** Nombre legible del concepto (p.ej. "Tiempo extra doble", "Bono de asistencia"). */
  sub: string
}

export interface Deduccion extends RawLinea {
  tipo: TipoDeduccion
}

export type TipoRecibo = 'ordinaria' | 'liquidacion' | 'extraordinaria'

/** Recibo ya normalizado (se reconstruye siempre a partir de los ParsedDoc). */
export interface Recibo {
  id: string
  tipo: TipoRecibo
  /** Semana de nómina (semana ISO de la fecha de pago). */
  semana: number
  /** Número que trae el PDF (p.ej. 701 en liquidaciones). */
  semanaRecibo?: number
  anio: number
  /** Fecha de referencia para ordenar, filtrar y agrupar (viernes posterior al periodo en ordinarias). */
  fecha: string
  /** Fecha real de pago/emisión tal como viene en el documento. */
  fechaPago: string
  /** El recibo se emitió/timbró mucho después de su periodo (re-expedido). */
  emisionTardia: boolean
  periodoInicio: string
  periodoFin: string
  diasPagados: number | null
  salarioDiario: number | null
  horas: {
    normales: number | null
    dobles: number
    triples: number
    importeDobles: number
    importeTriples: number
  }
  percepciones: Percepcion[]
  deducciones: Deduccion[]
  porCategoria: Record<Categoria, number>
  totales: {
    bruto: number
    deducciones: number
    neto: number
    despensa: number
    /** Neto sin despensa: el dinero que llega a la cuenta (la despensa va a tarjeta de vales). */
    depositado: number
    isr: number
    imss: number
    /** Descuento al fondo de ahorro (tu parte + la de la empresa cuando viene como percepción). */
    ahorro: number
    otras: number
  }
  ahorro: {
    empleado: number
    empresa: number
    empresaEstimada: boolean
    /** Salario + séptimo día: la base sobre la que se calcula el ahorro. */
    baseSalario: number
    acumulado?: AhorroAcumulado
    devolucion: number
    interes: number
  }
  fuentes: Fuente[]
  docs: ParsedDoc[]
  empleado?: ParsedDoc['empleado']
}

export interface StoreData {
  version: 1
  docs: ParsedDoc[]
}
