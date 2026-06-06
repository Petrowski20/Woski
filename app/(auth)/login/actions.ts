'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData): Promise<{ error: string } | undefined> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Credenciales incorrectas' }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData): Promise<{ error: string } | undefined> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  const nickname = formData.get('nickname') as string
  const birthDate = formData.get('birthDate') as string
  const favoriteTeamId = formData.get('favoriteTeamId') as string

  if (password !== confirmPassword) {
    return { error: 'Las contraseñas no coinciden' }
  }

  if (birthDate) {
    const today = new Date()
    const limitDate = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate())
    if (new Date(birthDate) > limitDate) {
      return { error: 'Debes tener al menos 16 años para participar' }
    }
  }

  // Pre-validar nickname antes de crear el usuario en Auth
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('nickname', nickname)
    .maybeSingle()

  if (existing) {
    return { error: 'Ese nombre de usuario ya está en uso, elige otro' }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nickname,
        birth_date: birthDate,
        favorite_team_id: favoriteTeamId ? parseInt(favoriteTeamId) : null,
      },
    },
  })

  if (error) {
    // El trigger de DB falla cuando el nickname se duplica en una condición de carrera
    if (error.message.toLowerCase().includes('database')) {
      return { error: 'Ese nombre de usuario ya está en uso, elige otro' }
    }
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
