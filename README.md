# Flujo — tu nómina, tus cuentas y a dónde se va tu dinero

App de escritorio (Electron + React + TypeScript + Tailwind + Recharts). No levanta servidor ni usa localhost.
Lee tus recibos de nómina (PDF/XML) y los estados de cuenta de Santander (PDF, con OCR local).

## Descargar (sin compilar nada)

Ve a la pestaña **Releases** del repositorio y baja `Flujo-<versión>-Windows.zip`. Extráelo completo y:

- **Instalar:** doble clic en `Instalar Flujo.cmd` (accesos directos en escritorio y menú Inicio), o
- **Sin instalar:** abre `win-unpacked\Flujo.exe`.

Si Windows avisa «protegió su PC»: *Más información → Ejecutar de todas formas* (el programa no está firmado).

**Publicar una versión nueva** (desde la raíz, con `package.json` en la versión nueva):

```bash
git tag v1.1.0 && git push origin v1.1.0
```

GitHub Actions (`.github/workflows/release.yml`) compila en Windows y adjunta el zip a la release, con
`notas-version.txt` como descripción. Local: `npm run dist && npm run paquete` deja el zip en `release\`.
`release/` y `samples/` siguen en `.gitignore` (nunca se suben).

## Instalar y actualizar

**Instalar (una vez):** corre `npm run dist` y abre `release\Instalar Flujo.cmd` (doble clic). Copia Flujo a
`%LOCALAPPDATA%\Programs\Flujo`, crea los accesos directos (escritorio y menú Inicio) y lo abre. Para quitarlo,
`release\Desinstalar Flujo.cmd` (no toca tus datos de `Documentos\Flujo`).

**Actualizar (el día a día):** después de cambiar algo, `npm run publicar`. Compila y deja la actualización en
`release\actualizacion`. La app instalada la detecta sola (al abrir, al volver a la ventana y cada 5 minutos) y muestra el
botón **Actualizar** en el encabezado; al tocarlo se copia, la app se reinicia y listo. Sin volver a instalar, sin
servidor y sin buscar el ejecutable. «Tus datos» → *Versión de Flujo* permite buscar a mano.

- Qué cambió: escribe el texto en `notas-version.txt` (raíz) antes de publicar; se muestra al actualizar.
- Cómo funciona: la app copia la carpeta `out` nueva a `resources\actualizacion` y `boot.cjs` (el arranque, `main` del
  `package.json`) la pone en su lugar *antes* de cargar la app, cuando ningún archivo está en uso (`src/main/updater.ts`).
  El origen se guarda en `resources\origen.json` (lo escribe el instalador).
- Sólo hace falta volver a correr `npm run dist` + el instalador si cambian las dependencias (usa
  `node scripts/publicar.mjs --modulos` tras el `dist` para mandarlas también como actualización) o `boot.cjs`.
- Mientras corres la copia instalada ya no estorba al `npm run dist` (ya no se abre desde `release\win-unpacked`).

> El `.exe` se empaqueta **byte por byte idéntico** al de Electron (`signAndEditExecutable: false`, `asar: false`,
> `electronDist: node_modules/electron/dist`) a propósito: Windows 11 con
> *Smart App Control* bloquea ejecutables sin firma desconocidos, pero permite el binario original de Electron
> por reputación. Por eso el instalador es un `.cmd` (robocopy) y no un `.exe`: un instalador `.exe` o portable quedaba bloqueado.
> (Si lanzas Flujo desde la terminal de VS Code, quita antes `ELECTRON_RUN_AS_NODE`, o se cierra al instante.)

## Datos (SQLite)

- Base de datos: `Documentos\Flujo\flujo.db` (SQLite, vía `sql.js`, sin módulos nativos).
- La app antes se llamaba **MoneyTwo**: al primer arranque copia `Documentos\MoneyTwo` a `Documentos\Flujo` (y
  `moneytwo.db` → `flujo.db`). La carpeta anterior no se borra; cuando confirmes que todo está bien la puedes eliminar.
- Originales: `Documentos\Flujo\archivos\`.
- Respaldos automáticos diarios: `Documentos\Flujo\respaldos\` (se guardan los últimos 15, y uno extra antes de "Borrar todo").
- Está fuera de AppData: limpiar caché/AppData o reinstalar no la borra.
- **Datos → Cambiar carpeta…** la mueve (p.ej. a OneDrive). Si la carpeta elegida ya tiene un
  `flujo.db` (o `moneytwo.db`), se abre ese en lugar de sobrescribirlo (útil en otra PC o tras formatear).
- La única cosa en AppData es `config.json` con la carpeta elegida; si se pierde, la app vuelve a `Documentos\Flujo`
  y con "Cambiar carpeta…" la reconectas.

Tablas: `documentos` (un renglón por recibo PDF/XML; PK `uuid + fuente`; columnas de fecha/semana indexadas y el
detalle completo en `datos` como JSON), `estados` (un renglón por cuenta y periodo de estado de cuenta, con sus
movimientos ya leídos en `datos`), `reglas` (tus correcciones de categoría: `mov:<id>` o `com:<comercio>`) y `meta`.

## Desarrollo

```bash
npm install
npm run dev          # app con recarga en caliente
npm run typecheck
npm run test:parse   # prueba los parsers con los archivos de /samples
npx tsx scripts/check-db.mts <flujo.db>   # diagnóstico: semanas duplicadas/faltantes y ahorro
# Estados de cuenta: OCR a JSON una vez, y luego iterar el parser/clasificador sobre ese JSON (rápido)
npx tsx scripts/ocr-dump.mts <estado.pdf> <ocr.json>
npx tsx scripts/test-estado.mts <ocr.json> --movs
npx tsx scripts/test-gastos.mts <flujo.db> <ocr1.json> [ocr2.json]
npm run dist         # empaqueta (release/win-unpacked) y deja el instalador y la actualización
npm run publicar     # sólo una actualización para la app ya instalada (rápido)
```

Prueba de humo (abre la app real, importa `/samples` y toma capturas):

```bash
npm run build && npx electron scripts/smoke.cjs <carpeta-salida> [light|dark]
# con una copia de una base existente: SMOKE_DB=<ruta a flujo.db> npx electron scripts/smoke.cjs ...
# probar la migración desde la versión anterior: SMOKE_LEGACY=1 SMOKE_DB=<moneytwo.db> ...
```

`scripts/smoke2.cjs` prueba las gráficas y el encabezado (necesita `SMOKE_DB`); `scripts/smoke.cjs` es anterior al rediseño. (Si se ejecuta desde la terminal de VS Code, quita antes la variable `ELECTRON_RUN_AS_NODE`.)

## Cómo se leen los recibos

| Dato | PDF | XML (CFDI 4.0 + nómina 1.2) |
|---|---|---|
| Percepciones/deducciones | tabla por coordenadas | nodos `Percepcion`/`Deduccion` |
| Semana | "Semana número" | semana ISO del viernes posterior al periodo |
| Horas extra | Hrs ext dobles/triples | `HorasExtra` (01 doble, 02 triple) |
| Ahorro acumulado | sí (bloque inferior) | no viene |

- La semana **nunca** se toma de la fecha de emisión: hay recibos re-timbrados meses después (se marcan como "re-expedido").
- Neto depositado = percepciones − deducciones − despensa (la despensa llega en vales y se muestra aparte).
- Un PDF y un XML del mismo recibo (mismo folio fiscal) se **combinan**.
- **Liquidación de fondo de ahorro**: conceptos `DEV FONDO DE AHORRO` / `... INTERES` o semana 7xx.
- Bruto = suma de percepciones (incluye despensa); Neto = bruto − deducciones (coincide con "Total NETO" del PDF y `Total` del XML).
- Ahorro: tu aporte es ~10% de (salario + séptimo día). La empresa iguala el aporte; si el recibo trae
  "APORTACION AHORRO EMPRESA" se toma de ahí. Las variaciones se explican comparando con el recibo anterior.
- Las reglas de clasificación (bonos, festivos, primas, "otras") están en `src/renderer/src/lib/normalize.ts`.

## Cómo se leen los estados de cuenta (Santander)

- Los PDF de Santander **no traen texto**: cada palabra es una imagen. Se renderiza cada página (pdf.js, escala 4 ≈ 290 ppp),
  se pasa a blanco y negro puro (quita el gris de las filas alternas) y se lee con **Tesseract** (WASM, modelo español
  `best_int`, 4 workers en paralelo en el proceso principal). No usa internet. Se deja de leer en la página de
  "Significado de abreviaturas" (lo demás son avisos legales).
- Si algún día el banco manda el PDF con texto, se usa el texto directo (sin OCR) con el mismo parser.
- Columnas por posición del encabezado (FECHA / FOLIO / DESCRIPCION / DEPOSITO / RETIRO / SALDO); las líneas sin fecha
  son continuación de la descripción (comercio, datos SPEI).
- **Validación**: cada fila debe cumplir saldo anterior ± importe = saldo. Si no, se decide con la fila siguiente si se
  leyó mal el importe o el saldo y se corrige; si un valor no se leyó, se calcula. Al final se compara con el TOTAL y el
  saldo final impresos ("Cuadra").
- **Clasificación** (`lib/gastos.ts`): "entre cuentas" o el mismo folio en ambas cuentas = traspaso propio (no es gasto
  ni ingreso); "PAGO DE NOMINA" = nómina (se cruza al centavo con el neto depositado de cada recibo); SPEI/Enlace =
  personas (nombre del remitente/destinatario); compras con tarjeta = comercio de la 2ª línea contra una lista de
  marcas (Uber Eats, Steam, Amazon, Google…). Lo que no se reconoce queda en "Otros gastos" y se corrige desde la tabla;
  la corrección se guarda como regla para ese comercio.

## Interfaz

- Basada en Material Design 3: superficies tonales en vez de bordes, chips de filtro, botones segmentados, diálogos de 28px,
  tipografía de Windows 11 (Segoe UI Variable) y cifras con los centavos más pequeños. Tema claro/oscuro/sistema.
- Una sola barra superior: «Flujo», las pestañas y, a la derecha, **Actualizar** (sólo si hay una versión nueva), la campana de avisos, el tema,
  **Archivos** (recibos de nómina y estados de cuenta en un solo panel; ahí abajo está «Base de datos y respaldos») y **Agregar archivos**.
- Tres pestañas. Lo esencial se ve siempre; el detalle largo (tablas por semana, conceptos, personas, comercios) se
  abre en ventanas (modales) para no alargar la pantalla.
  - **Resumen** (vista inicial, «todo en uno»): indicadores de saldo, gastos, sueldo por semana, tiempo extra y fondo de
    ahorro (con mini tendencia y cambio; cada uno lleva a su detalle), lo que entró y salió, **Qué cambió** (últimas 4
    semanas contra las 4 anteriores: gastos, ingresos, categorías que más se movieron, sueldo y horas extra), en qué se
    fue, dónde más gastas, **Para revisar** (archivos faltantes o que no cuadran, depósitos sin recibo, gastos sin
    categoría, cambios en el ahorro), tus cuentas, últimos movimientos y tu último recibo. Todo lleva a su detalle ya
    filtrado (categoría, cuenta) o con la ventana abierta (tiempo extra, ahorro).
  - **Cuentas**: saldo con tus cuentas, «Cómo cambió tu saldo» (saldo al inicio + entró − salió ± traspasos sin el otro
    lado = saldo al final), una gráfica Semana / Mes / Diagrama, y lado a lado **En qué se fue** (categorías; al tocar una
    se ve dónde gastaste en ella y se filtra todo) y **Movimientos**. Comercios, personas y categorías se abren en ventanas.
  - **Diagrama** (`components/FlujoDiagrama.tsx`, `flujoDinero` en `lib/gastos.ts`): tres columnas fijas, de dónde entró →
    tus cuentas → en qué salió. Los traspasos entre tus cuentas que se ven de los dos lados se cancelan; los que no, y el
    saldo que ya tenías o que quedó, van en gris.
  - **Nómina** (incluye tiempo extra y ahorro): depositado con tendencia, **Tu sueldo: de dónde viene y a dónde va**
    (cascada: bruto por concepto → ISR, IMSS, ahorro, despensa, otras → lo que llega a tu cuenta; por semana o total),
    gráfica Depositado / Por concepto / Descuentos, y tarjetas de tiempo extra y fondo de ahorro. «Cada concepto»,
    «Ver semana por semana» y «Ver aportes y ciclos» abren ventanas con su gráfica y tabla.
- **Categorías propias**: al cambiar la categoría de un movimiento o en Cuentas → Categorías puedes crear las tuyas
  (nombre, gasto/ingreso, icono). «Clasificar» junta lo que quedó en «Otros» por comercio para asignarlo de una vez; se
  guarda como regla para los que vengan. Tus categorías se guardan en la tabla `reglas` como `cat:<id>` (JSON), así que
  viajan en los respaldos y al exportar/importar.
- Importación en segundo plano: los archivos se leen en cola, uno por uno, y aparecen en la app conforme terminan; el
  progreso se ve en un aviso abajo a la derecha (con «Ver detalle»). Se puede seguir usando la app y soltar más archivos.
- **Archivos → Recibos** tiene la columna «En banco» (el depósito encontrado en tu estado de cuenta).
- Las tarjetas y modales con listas tienen **alto fijo**: el encabezado se queda y sólo la lista se desplaza (`Card fijo` + `Desplazable`). Las listas largas cargan por bloques al bajar (`usePaginacion` + `Paginacion` en `components/ui.tsx`), así nada cambia de tamaño.
- Los PDF y XML guardados se ven **dentro de la app** (`components/VisorArchivo.tsx`, con pdf.js): zoom (Ctrl +/−, Ctrl 0 ajusta al ancho), páginas que se dibujan al acercarse y «Abrir afuera» por si quieres la app de Windows.

## Estructura

```
src/main/        proceso principal: ventana, diálogos
  db.ts          base de datos SQLite, respaldos, migración y cambio de carpeta
  ocr.ts         OCR local (tesseract.js) para los estados de cuenta
src/preload/     puente seguro (window.api)
src/renderer/    interfaz React
  lib/parsePdf.ts, parseXml.ts   lectura de recibos
  lib/importer.ts                detecta recibo vs estado de cuenta; render + OCR de páginas
  lib/estadoCuenta.ts            movimientos del estado de cuenta y validación de saldos
  lib/gastos.ts                  clasificación, traspasos, conciliación con recibos, agregados
  lib/normalize.ts               clasificación y cálculo por recibo
  lib/analytics.ts               agrupaciones, conceptos, análisis de ahorro
  pages/                         pestañas: Resumen, Cuentas, Nómina
  components/NominaExtra.tsx     tiempo extra (tarjeta y ventana semana por semana)
  components/NominaAhorro.tsx    fondo de ahorro (tarjeta y ventana: gráfica, semanas fuera de lo normal y ciclos)
  components/FlujoDiagrama.tsx   diagrama de flujo del dinero (entró → tus cuentas → salió)
  components/Categorias.tsx      tus categorías, clasificar «Otros», comercios y personas
  components/NominaSueldo.tsx    cascada del sueldo y ventana de conceptos
  components/ui.tsx              componentes base (tarjetas, indicadores, mini gráficas, chips, cifras, carga progresiva)
  components/VisorArchivo.tsx    visor interno de PDF/XML
  components/ScrollChart.tsx     gráfica con scroll horizontal y eje semana / fechas / mes
  components/TablaConceptos.tsx  tabla interactiva "¿De dónde viene cada peso?"
  components/Archivos.tsx        panel «Tus archivos»: recibos y estados de cuenta
  components/Importacion.tsx     cola de importación en segundo plano y su aviso
  components/Dialogos.tsx        modal de datos (base, respaldos, carpeta)
  components/DialogosBanco.tsx   cambiar categoría, estados de cuenta cargados
  components/TablaMovimientos.tsx  movimientos con filtros y edición de categoría
```


## Estilo "mercado" (Resumen, Cuentas y Nómina)

Una sola gráfica de tiempo (`components/GraficaTiempo.tsx`) sirve a las tres pestañas; cada una sólo dice cómo dibujar sus datos.

- **Controles iguales en todas:** tipo de gráfica, **rango** (1M, 3M, 6M, 1A, Todo: el rango se ajusta al ancho de la gráfica),
  **intervalo** (Auto, Días, Semanas, Meses) y lupas. **Ctrl + rueda** (o pellizco) acerca alrededor del cursor; con *Auto* el
  intervalo cambia solo según el zoom. Arrastrar mueve. La escala vertical se ajusta a lo que se ve, hay cruz con etiqueta de
  precio y el eje muestra el rango de cada semana y el mes.
- **Tu saldo en el tiempo** (Resumen, `components/Mercado.tsx`): Área, Línea, Velas o Barras (OHLC); verde sube, rojo baja, gris
  se mantiene (cada uno con su flecha). Debajo, el dinero movido; línea punteada: media móvil. «Ampliar» abre la misma gráfica
  con una tabla por periodo (apertura, máximo, mínimo, cierre, cambio, entró, salió). Los máximos y mínimos se toman al cierre de
  cada día para que un traspaso entre tus cuentas no fabrique picos.
- **Entradas y salidas** (Cuentas): barras hacia arriba (entró) y hacia abajo (salió) con el neto, sólo el neto, o el neto acumulado;
  tocar un periodo filtra los movimientos. Con una categoría elegida muestra el monto de esa categoría. Debajo, un **calendario de
  calor** (`components/MapaGasto.tsx`; un cuadro por día, con el promedio por día de la semana) o el diagrama de flujo.
- **Tu sueldo en el tiempo** (Nómina, `components/NominaGrafica.tsx`): Área, Barras o Velas (cambio contra la semana anterior), media de 4 y
  promedio; también «Por concepto» y «Descuentos» apilados. La liquidación del ahorro se marca aparte.
- **Para revisar** es una campana en el encabezado (`components/Avisos.tsx`).
- En Cuentas, el ícono de cada movimiento es el botón para cambiar su categoría.
#   f l o w 
 
 