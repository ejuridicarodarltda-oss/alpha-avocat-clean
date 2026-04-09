# Auditoría técnica de preservación — Módulo Causas

Fecha de auditoría: 2026-04-09 (UTC)

## Alcance
- Archivo principal auditado: `public/causas.html`.
- Scripts/páginas asociados auditados: `public/informacion-clientes-asesorias-causas.html`, `public/expedientes-digitales.html`, `public/produccion.html`, `public/causas-services.js`.
- Comparación git: commit actual `37b9eac` versus commit inmediatamente anterior `92ed65d`.

## Hallazgo transversal clave
En `public/causas.html` la clase `landing-mode` permanece en `<body>` y oculta casi toda la estructura interna de la pantalla histórica (grid, listados, paneles), dejando solo la portada inicial visible en scroll.
Aun así, los renderizadores internos, tabs, modal de workspace y paneles por pilar siguen definidos en el archivo y pueden abrirse por flujo interno/modal o por rutas separadas.

---

## A. INFORMACIÓN DE CAUSAS Y CLIENTES
- **¿Sigue existiendo su estructura interna?** **Sí**.
- **¿Qué archivos, funciones o contenedores la representan?**
  - En `public/causas.html`:
    - Tab configurado: `TAB_CONFIG` con `informacion`.
    - Renderizado interno: `renderInformationPillar(cause)`.
    - Resolución de tab activo: `renderCurrentTab()` + `ensureDetailTabPanels()`.
    - Contenedor interno en modal/workspace: `#workspaceModal`, `#detailContent`, panel dinámico `data-tab-panel="informacion"`.
  - En ruta separada:
    - `public/informacion-clientes-asesorias-causas.html` con bloques propios de clientes y causas (`#newClients`, `#oldClients`, `#causesList`).
- **¿Está desconectada o eliminada?**
  - **Desconectada en la portada de `causas.html`** por `landing-mode` + redirección de navegación.
  - **No eliminada**: el código de render interno sigue presente y la vista se puede abrir en la página dedicada.
- **Si fue reemplazada, indicar por qué commit o cambio**
  - Parcialmente reemplazada en la portada por navegación por rutas en el commit **`37b9eac`** (`Rework Causas landing into real access hub`): `openBranchScreen` deja de abrir workspace interno y pasa a redirigir (`navigateToCausasSection('informacion')`).

## B. EXPEDIENTES DIGITALES
- **¿Sigue existiendo su estructura interna?** **Sí**.
- **¿Qué archivos, funciones o contenedores la representan?**
  - En `public/causas.html`:
    - Tab configurado: `TAB_CONFIG` con `expedientes`.
    - Renderizado interno: `renderExpedientesPillar(cause)`.
    - Integración de historial/importación: `loadPjudImportHistory()` al activar tab de expedientes.
    - Contenedor interno: `#workspaceModal`, `#detailContent`, panel dinámico `data-tab-panel="expedientes"`.
  - En ruta separada:
    - `public/expedientes-digitales.html` con estructura completa (kárdex, paneles fullscreen `#matterPanel`, `#tribunalPanel`, `#rolePanel`, índice general PJUD).
- **¿Está desconectada o eliminada?**
  - **Desconectada en portada de `causas.html`** para acceso embebido directo.
  - **No eliminada**: sigue en render interno de `causas.html` y en página dedicada.
- **Si fue reemplazada, indicar por qué commit o cambio**
  - Cambio de acceso en commit **`37b9eac`**: botones quick/top de expedientes pasan a `navigateToCausasSection('expedientes')` en lugar de abrir sección interna.

## C. PRODUCCIÓN
- **¿Sigue existiendo su estructura interna?** **Sí**.
- **¿Qué archivos, funciones o contenedores la representan?**
  - En `public/causas.html`:
    - Tab configurado: `TAB_CONFIG` con `produccion`.
    - Renderizado interno: `renderProduccionPillar(cause)`.
    - Acciones internas por tab en `detailActions` (`setActiveTab('produccion')`).
    - Contenedor interno: `#workspaceModal`, `#detailContent`, panel dinámico `data-tab-panel="produccion"`.
  - En ruta separada:
    - `public/produccion.html` con grid de producción, modal `#draftModalBackdrop` y formulario `#draftRequestForm`.
- **¿Está desconectada o eliminada?**
  - **Desconectada en portada de `causas.html`** para abrirse como ruta externa.
  - **No eliminada**: sigue existiendo en código interno y en página dedicada.
- **Si fue reemplazada, indicar por qué commit o cambio**
  - Cambio de flujo en commit **`37b9eac`**: navegación de botones/pilares reorientada a `navigateToCausasSection('produccion')`.

---

## 1) Comparación con versión inmediatamente anterior funcional
Comparación ejecutada entre:
- **Anterior**: `92ed65d`
- **Actual**: `37b9eac`

Cambios verificables en `public/causas.html`:
1. Se activa ocultamiento de estructura interna en modo portada:
   - Antes: `.causas-page.landing-mode .screen-grid { display:grid; }`
   - Ahora: `.causas-page.landing-mode .screen-grid { display:none; }`
   - Además: se agrega `display:none !important` para casi todos los bloques de `causas-shell` salvo la primera card.
2. Se agrega enrutador explícito `navigateToCausasSection()` con rutas a páginas dedicadas.
3. `openBranchScreen()` deja de abrir modal interno (`openWorkspaceModal`) y pasa a redirección por URL.
4. Listeners de quick actions (`btnQuickInfo`, `btnQuickExpedientes`, `btnTopExpedientes`, `btnQuickProduction`, `btnQuickAlerts`) se cambian a navegación por ruta.

## 2) ¿Qué se perdió exactamente?
### Navegación
- Se perdió en portada el acceso embebido directo al contenido interno dentro del mismo scroll principal.
- Se reemplazó por navegación a páginas dedicadas.

### Listeners
- Los listeners no desaparecieron; **cambiaron de destino**: de abrir workspace interno a redirección (`window.location.href`) vía `navigateToCausasSection`.

### Vistas
- Las vistas internas no fueron borradas del código de `causas.html` (tabs y renderizadores siguen).
- Sí quedaron ocultas en `landing-mode` y fuera del flujo principal de portada.

### Contenido interno
- No hay evidencia de eliminación masiva de contenido interno en `causas.html` en el último commit comparado.
- El cambio es de exposición/flujo (visibilidad + ruta), no de borrado estructural.

### Estructuras completas
- No se evidencia eliminación completa de las estructuras de los tres pilares en el commit comparado.
- Sí se evidencia desacople de la portada respecto del render embebido.

## 3) Conclusión ejecutiva
La lógica interna de los tres bloques (Información, Expedientes, Producción) **sigue existiendo**. En la versión actual está **principalmente desconectada de la portada de `causas.html` por ocultamiento en `landing-mode` y redirección de botones**, no eliminada estructuralmente.
