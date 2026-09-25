import type { SaveErrorCode } from '@/utils/lol/types'

export type SaveErrorAction = 'login' | 'retry' | 'reload'

// Textos para el usuario por cada fallo de guardado. Nunca se muestra el
// error técnico (queda en los logs del servidor).
export const SAVE_ERROR_COPY: Record<SaveErrorCode, { text: string; action?: SaveErrorAction }> = {
  UNAUTHENTICATED: {
    text: 'Tu sesión ha caducado, vuelve a iniciar sesión para guardar tu predicción.',
    action: 'login',
  },
  LOCKED: {
    text: 'Este partido ya no admite predicciones, se ha bloqueado hace un momento.',
  },
  INVALID: {
    text: 'Ese resultado no encaja con el formato de esta serie. Recarga la página para ver el partido actualizado.',
    action: 'reload',
  },
  NOT_FOUND: {
    text: 'Este partido ha cambiado o ya no está disponible. Recarga la página para ver el calendario actualizado.',
    action: 'reload',
  },
  SERVER: {
    text: 'No hemos podido guardar tu predicción, inténtalo de nuevo en unos segundos.',
    action: 'retry',
  },
  NETWORK: {
    text: 'No hemos podido conectar para guardar tu predicción. Comprueba tu conexión e inténtalo de nuevo en unos segundos.',
    action: 'retry',
  },
}

export const SAVE_ERROR_ACTION_LABEL: Record<SaveErrorAction, string> = {
  login: 'Iniciar sesión',
  retry: 'Reintentar',
  reload: 'Recargar',
}
