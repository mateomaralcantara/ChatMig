import { supabase } from '../lib/supabaseClient'

export async function fetchMembershipRow() {
  // útil si querés leer directo la tabla (RLS debe permitir select al dueño)
  const { data, error } = await supabase.from('membership').select('*').single()
  if (error) throw error
  return data
}

