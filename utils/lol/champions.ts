// Campeones de LoL desde Data Dragon (CDN público de Riot): lista para elegir
// los picks en el admin e iconos para la pestaña Equipos. Solo en el
// servidor, con caché de un día. Si Riot no responde, la web sigue: se
// enseña el identificador sin icono.

const DDRAGON = 'https://ddragon.leagueoflegends.com'

export interface Champion {
  /** Identificador de Riot ("MonkeyKing"), el que se guarda en lol_roster.picks. */
  id: string
  /** Nombre visible ("Wukong"). */
  name: string
}

export interface ChampionCatalog {
  version: string | null
  champions: Champion[]
}

export async function getChampionCatalog(): Promise<ChampionCatalog> {
  try {
    const vRes = await fetch(`${DDRAGON}/api/versions.json`, { next: { revalidate: 86400 } })
    if (!vRes.ok) return { version: null, champions: [] }
    const [version] = (await vRes.json()) as string[]
    const cRes = await fetch(`${DDRAGON}/cdn/${version}/data/es_ES/champion.json`, { next: { revalidate: 86400 } })
    if (!cRes.ok) return { version, champions: [] }
    const data = (await cRes.json()) as { data: Record<string, { id: string; name: string }> }
    const champions = Object.values(data.data)
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return { version, champions }
  } catch (e) {
    console.error('[lol] Data Dragon', e)
    return { version: null, champions: [] }
  }
}

/** Icono cuadrado del campeón; null sin versión. */
export function championIconUrl(version: string | null, id: string): string | null {
  return version && /^[A-Za-z0-9]{2,24}$/.test(id) ? `${DDRAGON}/cdn/${version}/img/champion/${id}.png` : null
}
