import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"

const supabaseUrl = "https://ryekhruwglpzncktypnx.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5ZWtocnV3Z2xwem5ja3R5cG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MDgxNDAsImV4cCI6MjA4ODA4NDE0MH0.iPwqJ7G5DpeTXjX-VtSTpDsQ8L3u4dqV8KzUuRC57BA"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
