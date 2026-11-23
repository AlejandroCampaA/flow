import { useState } from 'react'
import { Database, Download, FolderInput, FolderOpen, Trash2, Upload } from 'lucide-react'
import { useStore } from '../store'
import { Badge, Button } from './ui'
import Modal from './Modal'
import { SeccionVersion } from './Actualizar'

/** Ubicación de la base de datos, respaldos y borrado. */
export function ModalDatos({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { recibos, docs, estados, exportar, importarRespaldo, borrarTodo, cambiarCarpeta, dbInfo } = useStore()
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  return (
    <Modal
      open={open}
      onClose={() => {
        setAviso(null)
        setConfirmar(false)
        onClose()
      }}
      title="Tus datos"
      subtitle={`${recibos.length} recibos · ${docs.length} archivos de nómina · ${dbInfo?.estados ?? 0} estados de cuenta en la base de datos SQLite`}
      width={620}
    >
      <SeccionVersion />
      {dbInfo && (
        <div className="mb-4 rounded-2xl bg-raised/70 p-4 text-[13px]">
          <div className="flex items-center gap-2 font-medium text-ink">
            <Database size={14} /> Base de datos
            {dbInfo.porDefecto && <Badge>Documentos</Badge>}
          </div>
          <div className="mt-1 break-all text-ink2">{dbInfo.archivo}</div>
          <div className="mt-1 text-[12px] text-muted">
            {(dbInfo.tamano / 1024).toFixed(0)} KB · {dbInfo.respaldos} respaldo(s) automático(s)
            {dbInfo.ultimoRespaldo && ` · último: ${dbInfo.ultimoRespaldo}`}
          </div>
          <div className="mt-2 text-[12px] text-muted">
            Está fuera de AppData: limpiar caché o reinstalar no la borra. Si la pones en OneDrive queda respaldada en la nube.
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.api.openDataFolder()}>
          <FolderOpen size={14} /> Abrir carpeta
        </Button>
        <Button
          onClick={async () => {
            const r = await cambiarCarpeta()
            if (r === 'copiada') setAviso('Base de datos copiada a la nueva carpeta. La carpeta anterior no se borró.')
            else if (r === 'abierta') setAviso('Se abrió la base de datos que ya existía en esa carpeta.')
          }}
        >
          <FolderInput size={14} /> Cambiar carpeta…
        </Button>
        <Button onClick={async () => setAviso((await exportar()) ? 'Respaldo exportado.' : null)}>
          <Download size={14} /> Exportar respaldo
        </Button>
        <Button
          onClick={async () => {
            const n = await importarRespaldo()
            if (n != null) setAviso(`Respaldo importado: ${n} archivo(s) nuevos.`)
          }}
        >
          <Upload size={14} /> Importar respaldo
        </Button>
      </div>
      {aviso && <p className="mt-3 text-[13px] text-good">{aviso}</p>}

      <details className="mt-5 text-[13px] text-ink2">
        <summary className="cursor-pointer font-medium text-ink">Cómo se interpreta cada archivo</summary>
        <ul className="mt-2 space-y-1.5 pl-1">
          <li>• <b className="text-ink">Semana</b>: la impresa en el recibo (o la del periodo trabajado). Nunca la fecha de emisión, porque hay recibos re-timbrados tiempo después.</li>
          <li>• <b className="text-ink">Neto depositado</b>: percepciones − deducciones − despensa. La despensa se cuenta aparte porque llega en vales.</li>
          <li>• <b className="text-ink">Liquidación de ahorro</b>: se detecta por "DEV FONDO DE AHORRO" / intereses (o semana 7xx) y tiene su propia columna.</li>
          <li>• <b className="text-ink">Estados de cuenta</b>: se leen con OCR local. Cada movimiento se valida con la cadena de saldos y los totales impresos; si un número se leyó mal se corrige con el saldo.</li>
          <li>• <b className="text-ink">Traspasos entre tus cuentas</b> («entre cuentas», o el mismo folio en ambas) no cuentan como gasto ni como ingreso. Los depósitos de nómina se cruzan con tus recibos.</li>
          <li>• <b className="text-ink">PDF</b> trae ahorro acumulado, horas normales y triples; <b className="text-ink">XML</b> trae el desglose oficial del SAT. Si subes ambos del mismo recibo se combinan.</li>
        </ul>
      </details>

      <div className="mt-5 border-t border-line pt-4">
        {confirmar ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink2">Se borrarán todos los recibos, estados de cuenta y tus categorías (queda un respaldo en la carpeta respaldos). ¿Continuar?</span>
            <Button
              variant="danger"
              onClick={async () => {
                await borrarTodo()
                setConfirmar(false)
                setAviso('Datos borrados.')
              }}
            >
              Sí, borrar todo
            </Button>
            <Button variant="ghost" onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button variant="danger" disabled={!docs.length && !estados.length} onClick={() => setConfirmar(true)}>
            <Trash2 size={14} /> Borrar todos los datos
          </Button>
        )}
      </div>
    </Modal>
  )
}
