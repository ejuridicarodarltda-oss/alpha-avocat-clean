#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_SQL="$ROOT_DIR/supabase/migrations/20260417_fix_cause_excel_upload_infrastructure.sql"
APP_JS="$ROOT_DIR/public/app.js"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: define SUPABASE_DB_URL con la conexión Postgres real del proyecto que usa alphaavocat.cl"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql no está instalado"
  exit 2
fi

SUPABASE_URL="$(sed -n 's/^const supabaseUrl = "\(.*\)"/\1/p' "$APP_JS" | head -n1)"
PROJECT_REF="$(echo "$SUPABASE_URL" | sed -E 's#https://([^.]+)\..*#\1#')"

echo "Aplicando migración en la base objetivo..."
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION_SQL"

echo "Migración aplicada. Ejecuta scripts/verify-excel-upload-live.sh para validar PostgREST y permisos." 

echo "Proyecto detectado por frontend: $PROJECT_REF"
