#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JS="$ROOT_DIR/public/app.js"

SUPABASE_URL="$(sed -n 's/^const supabaseUrl = "\(.*\)"/\1/p' "$APP_JS" | head -n1)"
ANON_KEY="$(sed -n 's/^const supabaseAnonKey = "\(.*\)"/\1/p' "$APP_JS" | head -n1)"
PROJECT_REF="$(echo "$SUPABASE_URL" | sed -E 's#https://([^.]+)\..*#\1#')"

if [[ -z "$SUPABASE_URL" || -z "$ANON_KEY" ]]; then
  echo "ERROR: no fue posible leer supabaseUrl/supabaseAnonKey desde public/app.js"
  exit 1
fi

echo "# Proyecto detectado desde app"
echo "supabaseUrl=$SUPABASE_URL"
echo "projectRef=$PROJECT_REF"
echo

echo "# Verificación tabla crítica (anon)"
curl -sS -i "$SUPABASE_URL/rest/v1/cause_excel_upload_batches?select=id&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
echo

echo "# Nota"
echo "Para validar select/insert/update como authenticated, exporta SUPABASE_TEST_EMAIL y SUPABASE_TEST_PASSWORD y ejecuta este script en entorno con jq."

if [[ -z "${SUPABASE_TEST_EMAIL:-}" || -z "${SUPABASE_TEST_PASSWORD:-}" ]]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq no está instalado; no se puede continuar con validación authenticated."
  exit 2
fi

LOGIN_JSON="$(curl -sS "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SUPABASE_TEST_EMAIL\",\"password\":\"$SUPABASE_TEST_PASSWORD\"}")"

ACCESS_TOKEN="$(echo "$LOGIN_JSON" | jq -r '.access_token // empty')"
USER_ID="$(echo "$LOGIN_JSON" | jq -r '.user.id // empty')"

if [[ -z "$ACCESS_TOKEN" || -z "$USER_ID" ]]; then
  echo "ERROR: login authenticated falló"
  echo "$LOGIN_JSON"
  exit 3
fi

echo "# Login authenticated OK"

echo "# INSERT authenticated"
NOW="$(date -u +%Y%m%dT%H%M%SZ)"
INSERT_PAYLOAD="{\"owner_user_id\":\"$USER_ID\",\"source_file_name\":\"probe-$NOW.xlsx\",\"total_rows\":1,\"processed_rows\":0,\"successful_rows\":0,\"failed_rows\":0,\"status\":\"processing\"}"
INSERT_JSON="$(curl -sS "$SUPABASE_URL/rest/v1/cause_excel_upload_batches?select=id,owner_user_id,status" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "$INSERT_PAYLOAD")"
echo "$INSERT_JSON"

BATCH_ID="$(echo "$INSERT_JSON" | jq -r '.[0].id // empty')"
if [[ -z "$BATCH_ID" ]]; then
  echo "ERROR: INSERT no devolvió id"
  exit 4
fi

echo "# UPDATE authenticated"
UPDATE_JSON="$(curl -sS -X PATCH "$SUPABASE_URL/rest/v1/cause_excel_upload_batches?id=eq.$BATCH_ID&select=id,status,processed_rows,successful_rows" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"status":"completed","processed_rows":1,"successful_rows":1}')"
echo "$UPDATE_JSON"

echo "# SELECT authenticated"
SELECT_JSON="$(curl -sS "$SUPABASE_URL/rest/v1/cause_excel_upload_batches?id=eq.$BATCH_ID&select=id,owner_user_id,status,processed_rows,successful_rows,failed_rows,source_file_name")"
echo "$SELECT_JSON"
