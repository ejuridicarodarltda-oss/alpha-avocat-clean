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


export const supabaseUrl = "https://ryekhruwglpzncktypnx.supabase.co"

export const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5ZWtocnV3Z2xwem5ja3R5cG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MDgxNDAsImV4cCI6MjA4ODA4NDE0MH0.iPwqJ7G5DpeTXjX-VtSTpDsQ8L3u4dqV8KzUuRC57BA"



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
