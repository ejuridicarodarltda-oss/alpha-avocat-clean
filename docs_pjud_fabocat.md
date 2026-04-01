# Corrección estructural del flujo PJUD → Fabocat

## Objetivo
Separar explícitamente el proceso en **dos motores** coordinados para evitar que una causa quede descargada pero no integrada/clasificada.

## Motor A: Localización y obtención en PJUD
1. **Normalización previa por causa**: competencia, tribunal, identificador principal (ROL/RIT), número, letras, año, tipo, estado, carátula y RUT/nombre asociado.
2. **Búsqueda por estrategia y competencia** (civil, laboral, penal, cobranza, familia, cortes, disciplinario):
   - exacta: competencia + ROL/RIT + número + año,
   - por tribunal: competencia + tribunal + número + año,
   - por nombre/RUT si falta dato,
   - validación final por carátula y tribunal.
3. **Fallback de navegación**: no depender únicamente de “Mis Causas”; usar filtros oficiales cuando no exista enlace directo.
4. **Descarga desacoplada del escritorio del usuario**: prioridad a almacenamiento temporal interno del sistema y no al escritorio.

## Motor B: Ingestión y clasificación en Fabocat
1. **Clasificación automática por causa madre** al ingreso.
2. **Categoría principal única por causa** (sin multiaparición transversal no explícita).
3. **Modelo jerárquico**: Causa → Expediente digital → Documentos asociados.
4. **Reglas mínimas automáticas**:
   - tribunal civil o rol C => civil,
   - RIT laboral => laboral,
   - RUC/RIT penal => penal,
   - familia => familia,
   - cobranza => cobranza,
   - corte => corte correspondiente.
5. **Validación obligatoria previa a publicación**: clasificación, tribunal, identificador y carpeta destino resueltos.
6. **Contención de ambiguos**: si falta clasificación, enviar a “Pendientes de validación”, nunca a todas las materias.

## Flujo masivo canónico
1) importar lista fuente
2) normalizar datos
3) resolver competencia
4) buscar en PJUD por estrategia
5) abrir causa correcta
6) descargar a almacenamiento temporal
7) crear/actualizar causa en Fabocat
8) clasificar automáticamente
9) mover al expediente digital correcto
10) publicar en visor solo tras validación

## Trazabilidad mínima por causa
- fuente,
- criterio de búsqueda aplicado,
- competencia asignada,
- tribunal,
- rol/rit usado,
- validación,
- carpeta destino,
- estado de descarga,
- estado de clasificación,
- errores concretos (competencia no inferida, año faltante, tribunal no coincide, ambigüedad PJUD, etc.).

## Prioridades
1. Eliminar dependencia escritorio-del-usuario → subida-manual.
2. Clasificación automática a nivel causa madre.
3. Motor masivo con búsqueda real por competencia/filtros PJUD.
