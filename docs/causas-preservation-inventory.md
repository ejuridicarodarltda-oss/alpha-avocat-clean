# Inventario técnico de preservación — Módulo Causas

Fecha: 2026-04-09 (UTC)

## Objetivo de esta fase
Se declara **zona protegida** para los tres pilares del módulo Causas:
1. Información de causas y clientes.
2. Expedientes digitales.
3. Producción.

Durante esta fase solo se autoriza trabajo en capa de acceso/navegación (handlers, listeners, onclick, apertura de vistas y enlaces entre portada/submódulos).

---

## 1) Pilar: Información de causas y clientes (ZONA PROTEGIDA)

### Archivos involucrados
- `public/informacion-clientes-asesorias-causas.html`
- `public/causas-services.js` (workspace y normalización de datos de causa)
- `public/app.js` (sesión y cliente Supabase)

### Funciones clave identificadas
En `public/informacion-clientes-asesorias-causas.html`:
- `normalizeClient(client)`
- `normalizeCause(cause, workspaceEntry, manualOverride)`
- `consolidateCausesByRoleAndCourt(causes)`
- `detectQuality(cause)`
- `wireCauseEditForms(onSaved)`
- `safeSelect(queryPromise, label)`
- `init()`

En `public/causas-services.js` (soporte de estructura causa-cliente):
- `loadWorkspace(storage)`
- `saveWorkspace(workspace, storage, options)`
- `ensureCauseStorage(detail, causeId)`
- `sanitizeWorkspaceForStorage(workspace)`

### Contenedores / vistas
- Bloque `Listado de clientes` (`clientesBlockTitle`)
- Bloque `Listado de causas` (`causasBlockTitle`)
- Formulario/flujo de edición por causa (`wireCauseEditForms`)

### Tablas y relaciones usadas
- `public.clients`
- `public.cases`
- `public.appointments`

Relaciones funcionales observadas en frontend:
- Vinculación causa-cliente por campos de referencia (`client_id`, `client_name`, normalización cruzada en UI).
- Cruce con entrevistas/agenda para enriquecer fichas.

---

## 2) Pilar: Expedientes digitales (ZONA PROTEGIDA)

### Archivos involucrados
- `public/expedientes-digitales.html`
- `public/causas-services.js` (explorador documental y persistencia documental)
- `public/app.js`

### Funciones clave identificadas
En `public/expedientes-digitales.html`:
- `buildJudicialTree(cases, clientMap)`
- `renderMatterFolders()`
- `openMatterPanel(matter)`
- `openTribunalPanel(tribunal)`
- `openRolePanel(role, roles)`
- `loadData()`

En `public/causas-services.js` (estructura documental):
- `buildDocumentExplorer(detail, options)`
- `containerIdForCategory(category)`
- `getDocumentsByContainer(detail, containerId)`
- `upsertDocument(detail, input)`
- `removeDocument(detail, documentId)`
- `repairCauseDocumentLinkage(detail, options)`

### Contenedores / vistas
- Vista Kárdex principal (`.kardex`)
- Panel de materia
- Panel de tribunal
- Panel de rol/carpeta
- Jerarquía visual declarada: kárdex → archivadores/subarchivadores → carpetas/subcarpetas

### Tablas y relaciones usadas
- `public.cases`
- `public.clients`
- Índices PJUD vinculados a causas:
  - `public.pjud_causes_index`
  - `public.pjud_access_connections`
  - `public.pjud_cases`

Relaciones principales (migraciones):
- `pjud_causes_index.alpha_case_id -> cases.id`
- `pjud_cases.alpha_case_id -> cases.id`
- `pjud_causes_index.access_connection_id -> pjud_access_connections.id`

---

## 3) Pilar: Producción (ZONA PROTEGIDA)

### Archivos involucrados
- `public/produccion.html`
- `public/causas-services.js` (lectura de estructura de causa para deep-link y adjuntos)
- `public/app.js`

### Funciones clave identificadas
En `public/produccion.html`:
- `readRequests()` / `writeRequests(payload)`
- `buildExpedienteLink(cause, clientName)`
- `persistRequestInCase(request)`
- `renderRequests()`
- `buildProductionCards(cases, clientsMap)`
- `loadCasesForProduction()`
- `loadProduction()`

### Contenedores / vistas
- Tablero `Solicitudes y borradores en Producción`
- Modal de borrador (`openModal/closeModal`)
- Lista de solicitudes y trazabilidad de estado
- Enlace profundo a Expedientes Digitales

### Tablas y relaciones usadas
- `public.cases` (actualizaciones de payload de producción por causa)
- `public.clients` (mapeo de nombre cliente en tarjetas)

Relación funcional:
- Producción se asocia a causa por `caseId` y conserva trazabilidad/adjuntos vinculados a esa causa.

---

## Zona protegida consolidada (no alterar en esta fase)

### No autorizado en esta fase
- Rediseñar estructura interna de cualquiera de los 3 pilares.
- Mover lógica documental (kárdex/archivadores/carpetas/archivos).
- Alterar lógica de Producción.
- Alterar lógica de vinculación entre clientes y causas.
- Alterar fichas/relaciones/conteos cruzados.
- Reemplazar estructuras reales por placeholders o maquetas.

### Confirmación expresa
Queda **expresamente confirmado** que en esta fase:
1. Se preserva sin alteración la lógica interna de los tres pilares listados.
2. Solo se intervendrá (si corresponde) la capa de navegación/acceso: handlers, listeners, onclick y apertura/enlace de vistas.
3. Si una corrección exigiera tocar una zona protegida, se debe detener la ejecución y reportar antes de modificar.
