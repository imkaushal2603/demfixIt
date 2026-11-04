const axios = require('axios');

const BARBADOS_CENTRE = { lat: 13.19, lng: -59.54 };
const BARBADOS_RADIUS_KM = 30;

function haversineKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const inBarbados = (lat, lng) => haversineKm({ lat, lng }, BARBADOS_CENTRE) <= BARBADOS_RADIUS_KM;

let lastCall = 0;
async function geocodeBarbados(query) {
  const q = String(query ?? '').trim();
  if (!q) return null;

  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  try {
    const r = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: /barbados/i.test(q) ? q : `${q}, Barbados`, format: 'jsonv2', countrycodes: 'bb', limit: 1 },
      headers: { 'User-Agent': process.env.GEOCODER_USER_AGENT || 'DemFixIt-Dev/1.0' },
      timeout: 10000,
    });
    const hit = r.data?.[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBarbados(lat, lng)) return null;
    return { lat, lng, label: String(hit.display_name ?? '').slice(0, 160) };
  } catch (e) {
    console.error('⚠️ Geocoding failed:', e.message);
    return null;
  }
}

module.exports = { haversineKm, inBarbados, geocodeBarbados };