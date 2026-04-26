# Verificación de aplicación real del cambio (Corte Suprema)

Fecha: 2026-04-26 (UTC)

## 1) Archivo exacto modificado

- Commit auditado: `0ee757e3f24583c65fe9e1581bdc100a53066b75`.
- Archivo modificado por ese commit: `public/causas.html`.

## 2) Función exacta modificada (regla aplicada)

- Función donde se aplica la clasificación por fuero/tribunal: `classifyTribunalFuero(rawTribunal = '')`.

## 3) Fragmento final del código con la regla de Corte Suprema

```js
function classifyTribunalFuero(rawTribunal = ''){
  const tribunal = String(rawTribunal || '').trim();
  const normalized = normalizePjudText(tribunal);
  if (!normalized) return { fuero: 'sin_tribunal', tribunalEspecifico: '', normalized };
  if (normalized === 'corte suprema' || normalized.includes('excma corte suprema')) {
    return { fuero: 'corte_suprema', tribunalEspecifico: 'Corte Suprema', normalized };
  }
  // ...
}
```

Además, al materializar registros, el mismo archivo fija explícitamente materia = `Corte Suprema` cuando `classification.fuero === 'corte_suprema'`.

## 4) Estado de PR / merge / despliegue

- Evidencia local en `git log`: HEAD actual es `a70715b` con mensaje `Merge pull request #523 ...`.
- Con esto **sí se puede confirmar localmente que existe un commit de merge de PR** en la rama disponible en este checkout.
- **Sin acceso a GitHub API/PR UI en este entorno no se puede certificar de forma forense “sin conflictos” del PR** (más allá del hecho de que existe commit de merge).
- **Sin acceso a Vercel dashboard/API con credenciales de proyecto no se puede certificar despliegue en Vercel** desde este contenedor.

## 5) Duplicados en `causas.html`, `expedientes-digitales.html` y JS externos

- Existe una copia adicional de `causas.html` en la raíz del repo (`./causas.html`) y otra en `public/causas.html`.
- `public/expedientes-digitales.html` contiene su propia lógica de materias (`ORDERED_MATTERS`) y también menciones de `Corte Suprema`.
- En JS externo se detectan menciones en `public/causas-services.js`.
- Conclusión: **sí existen implementaciones relacionadas en más de un archivo** (no es un único punto de código).

## 6) Búsqueda global solicitada

Comando usado:

```bash
for term in "Corte Suprema" "ORDERED_MATTERS" "Otros Tribunales" "carátula pendiente" "Era"; do
  echo "=== $term ==="
  rg -n --fixed-strings "$term" . || true
done
```

Resumen de resultados:

- `Corte Suprema`: coincidencias en `./causas.html`, `./public/causas.html`, `./public/expedientes-digitales.html`, `./public/causas-services.js`.
- `ORDERED_MATTERS`: coincidencias en `./public/expedientes-digitales.html`.
- `Otros Tribunales`: **sin coincidencias**.
- `carátula pendiente`: **sin coincidencias**.
- `Era`: coincidencias en `./public/expedientes-digitales.html` y `./public/causas-services.js`.

## 7) Archivo real que gobierna la pantalla

- En este repositorio, el cambio auditado del PR #523 cae en `public/causas.html`.
- La navegación interna de las vistas de Causas/Expedientes referenciada en archivos de `public/` apunta a `./causas.html` y `./expedientes-digitales.html` dentro de ese mismo árbol.
- Por lo tanto, para la pantalla de Causas en la versión auditada, el archivo operativo objetivo del cambio es `public/causas.html`.

