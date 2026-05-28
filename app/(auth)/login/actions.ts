'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect('/login?error=' + encodeURIComponent('Credenciales incorrectas'))
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  // Capturamos todos los campos nuevos del formulario
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  const nickname = formData.get('nickname') as string
  const birthDate = formData.get('birthDate') as string
  const favoriteTeamId = formData.get('favoriteTeamId') as string

  // Validación de contraseñas idénticas
  if (password !== confirmPassword) {
    redirect('/login?error=' + encodeURIComponent('Las contraseñas no coinciden') + '&view=register')
  }

  // Validación de edad mínima (16 años)
  if (birthDate) {
    const today = new Date()
    const limitDate = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate())
    if (new Date(birthDate) > limitDate) {
      redirect('/login?error=' + encodeURIComponent('Debes tener al menos 16 años para participar') + '&view=register')
    }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Pasamos los datos extra aquí para que el Trigger de SQL los cace
      data: {
        nickname: nickname,
        birth_date: birthDate,
        favorite_team_id: favoriteTeamId ? parseInt(favoriteTeamId) : null
      }
    }
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message) + '&view=register')
  }

  redirect('/login?message=' + encodeURIComponent('Revisa tu correo para confirmar tu cuenta'))
}