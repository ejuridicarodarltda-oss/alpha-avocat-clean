// ===============================
// Alpha Avocat
// Conexión Supabase
// ===============================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/*
======================================================
AQUÍ DEBES PEGAR TUS DATOS DE SUPABASE
======================================================

Reemplaza:

TU_SUPABASE_URL
TU_SUPABASE_ANON_KEY

Por los valores que copiaste desde:

Supabase
Project Settings
API
*/

const fallbackSupabaseUrl = "https://ryekhruwglpzncktypnx.supabase.co"

const fallbackSupabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5ZWtocnV3Z2xwem5ja3R5cG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MDgxNDAsImV4cCI6MjA4ODA4NDE0MH0.iPwqJ7G5DpeTXjX-VtSTpDsQ8L3u4dqV8KzUuRC57BA"

const runtimeEnv = globalThis?.__ENV__ || {}

function pickRuntimeEnv(...keys) {
  for (const key of keys) {
    const value = runtimeEnv[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export const supabaseUrl = pickRuntimeEnv(
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL'
) || fallbackSupabaseUrl

export const supabaseAnonKey = pickRuntimeEnv(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY'
) || fallbackSupabaseAnonKey

function validateSupabaseConfig(url, key) {
  const errors = []

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    errors.push(
      `SUPABASE_URL inválida: "${url}". Debe ser https://<project-ref>.supabase.co`
    )
  }

  if (!key || key === 'TU_SUPABASE_ANON_KEY') {
    errors.push('SUPABASE_ANON_KEY no configurada.')
  }

  if (url.includes('TU_PROJECT_ID') || url.includes('<PROJECT_ID_REAL>')) {
    errors.push('SUPABASE_URL todavía tiene placeholders (TU_PROJECT_ID / <PROJECT_ID_REAL>).')
  }

  if (errors.length) {
    console.error('[SUPABASE CONFIG ERROR]', errors.join(' | '))
    throw new Error(errors.join(' '))
  }
}

validateSupabaseConfig(supabaseUrl, supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

// ===============================
// Control de sesión
// ===============================

export async function requireAuth() {

  const { data, error } = await supabase.auth.getSession()

  if (error) {
    console.error(error)
    window.location.href = "./login.html"
    return null
  }

  const session = data?.session

  if (!session) {
    window.location.href = "./login.html"
    return null
  }

  return session.user
}


// ===============================
// Cerrar sesión
// ===============================

export async function logout() {

  await supabase.auth.signOut()

  window.location.href = "./login.html"

}
