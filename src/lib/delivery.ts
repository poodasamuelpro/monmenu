// Calcul dynamique du prix de livraison
// Section 8.2 du cahier des charges

interface ConfigLivraison {
  tarif_base: number
  tarif_par_km: number
  seuil_km_gratuit: number
  majoration_heure_pointe: number // % (ex: 20 = +20%)
  heure_pointe_debut: number // ex: 18 (18h)
  heure_pointe_fin: number // ex: 21 (21h)
  majoration_pluie: number // % (ex: 30 = +30%)
  distance_max_km: number
  devise: string
}

interface ResultatCalculLivraison {
  tarif_base: number
  tarif_distance: number
  majoration_heure: number
  majoration_meteo: number
  total: number
  distance_km: number
  temps_estime_min: number
  detail: string
  facteurs: {
    heure_pointe: boolean
    pluie: boolean
  }
}

// Calcul distance Haversine entre deux points GPS
export function calculerDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371 // Rayon de la Terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10 // Arrondi à 1 décimale
}

// Config par défaut si non définie par le restaurant
const CONFIG_PAR_DEFAUT: ConfigLivraison = {
  tarif_base: 500,
  tarif_par_km: 200,
  seuil_km_gratuit: 2,
  majoration_heure_pointe: 20,
  heure_pointe_debut: 12,
  heure_pointe_fin: 14,
  majoration_pluie: 30,
  distance_max_km: 20,
  devise: 'FCFA'
}

// Récupérer la météo actuelle
async function getMeteoConditions(
  lat: number,
  lon: number,
  apiKey: string
): Promise<{ pluie: boolean; description: string }> {
  if (!apiKey) return { pluie: false, description: 'météo non disponible' }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=fr`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!response.ok) return { pluie: false, description: '' }

    const data = await response.json() as {
      weather?: Array<{ main: string; description: string }>
    }
    const condition = data.weather?.[0]?.main ?? ''
    const pluie = ['Rain', 'Thunderstorm', 'Drizzle', 'Snow'].includes(condition)
    return { pluie, description: data.weather?.[0]?.description ?? '' }
  } catch {
    return { pluie: false, description: '' }
  }
}

export async function calculerFraisLivraison(params: {
  pdvLat: number
  pdvLon: number
  clientLat: number
  clientLon: number
  config?: Partial<ConfigLivraison>
  openweatherApiKey?: string
}): Promise<ResultatCalculLivraison> {
  const config: ConfigLivraison = { ...CONFIG_PAR_DEFAUT, ...params.config }
  const { pdvLat, pdvLon, clientLat, clientLon } = params

  // Distance
  const distanceKm = calculerDistance(pdvLat, pdvLon, clientLat, clientLon)

  // Tarif de base
  const tariBase = config.tarif_base

  // Tarif distance (au-delà du seuil gratuit)
  const kmFactures = Math.max(0, distanceKm - config.seuil_km_gratuit)
  const tariDistance = Math.round(kmFactures * config.tarif_par_km)

  // Heure de pointe
  const heureActuelle = new Date().getHours()
  const heurePointe =
    heureActuelle >= config.heure_pointe_debut &&
    heureActuelle < config.heure_pointe_fin
  const majorationHeure = heurePointe
    ? Math.round(((tariBase + tariDistance) * config.majoration_heure_pointe) / 100)
    : 0

  // Météo (uniquement si API key disponible)
  let majorationMeteo = 0
  let pluie = false
  if (params.openweatherApiKey) {
    const meteo = await getMeteoConditions(clientLat, clientLon, params.openweatherApiKey)
    pluie = meteo.pluie
    if (pluie) {
      majorationMeteo = Math.round(
        ((tariBase + tariDistance) * config.majoration_pluie) / 100
      )
    }
  }

  const total = tariBase + tariDistance + majorationHeure + majorationMeteo

  // Temps estimé (vitesse moto ~25 km/h en ville africaine + 5 min prépa)
  const tempsEstimeMin = Math.round((distanceKm / 25) * 60) + 10

  const detail = [
    `Base : ${tariBase} ${config.devise}`,
    tariDistance > 0 ? `Distance (${kmFactures.toFixed(1)} km) : +${tariDistance} ${config.devise}` : null,
    heurePointe ? `Heure de pointe : +${majorationHeure} ${config.devise}` : null,
    pluie ? `Conditions météo : +${majorationMeteo} ${config.devise}` : null
  ]
    .filter(Boolean)
    .join(' | ')

  return {
    tarif_base: tariBase,
    tarif_distance: tariDistance,
    majoration_heure: majorationHeure,
    majoration_meteo: majorationMeteo,
    total,
    distance_km: distanceKm,
    temps_estime_min: tempsEstimeMin,
    detail,
    facteurs: { heure_pointe: heurePointe, pluie }
  }
}
