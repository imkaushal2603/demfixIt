const { haversineKm } = require('./geo');

const CONFIG = {
  nearestPool: Number(process.env.SHORTLIST_NEAREST_POOL || 10),
  showCount: Number(process.env.SHORTLIST_SIZE || 5),
  defaultRadiusKm: Number(process.env.MAX_DISTANCE_KM || 5),
  requireVerified: process.env.REQUIRE_VERIFIED === 'true',
};

const PLURAL = {
  plumbing: 'plumbers', electrical: 'electricians', aircon: 'A/C technicians', painting: 'painters',
  garden: 'gardeners', cleaning: 'cleaners', pool: 'pool technicians', appliance: 'appliance repairers',
  building: 'builders', handyman: 'handymen',
};

const digits = (s) => String(s ?? '').replace(/\D/g, '');

function buildShortlist(all, job, opts = {}) {
  if (job.lat == null || job.lng == null) return [];
  const here = { lat: Number(job.lat), lng: Number(job.lng) };
  const excluded = opts.excluded ?? new Set();
  const customerPhone = digits(opts.customerPhone);

  const candidates = [];
  for (const t of all) {
    if (excluded.has(t.id)) continue;
    if (t.availability !== 'Available') continue;
    if (!t.services.includes(job.category)) continue;
    if (!opts.devMode && t.phone && t.phone === customerPhone) continue;
    if (t.lat == null || t.lng == null) continue;

    const km = haversineKm(here, { lat: t.lat, lng: t.lng });
    if (km > (t.radius ?? CONFIG.defaultRadiusKm)) continue;
    candidates.push({ trader: t, km });
  }

  candidates.sort((a, b) => a.km - b.km);
  const pool = candidates.slice(0, CONFIG.nearestPool);

  pool.sort(
    (a, b) =>
      (b.trader.reviewCount ?? 0) - (a.trader.reviewCount ?? 0) ||
      a.km - b.km ||
      (b.trader.rating ?? 0) - (a.trader.rating ?? 0)
  );
  return pool.slice(0, CONFIG.showCount);
}

function formatShortlist(list, category, intro) {
  const noun = PLURAL[category] ?? 'tradespeople';
  const lines = list.map((x, i) => {
    const t = x.trader;
    const biz = t.business && t.business !== t.name ? ` (${t.business})` : '';
    const bits = [
      t.rating != null ? `⭐ ${Number(t.rating).toFixed(1)}` : '⭐ New',
      `${t.reviewCount ?? 0} review${t.reviewCount === 1 ? '' : 's'}`,
      `${x.km.toFixed(1)} km away`,
      t.verified ? '✅ Verified' : null,
    ].filter(Boolean).join(' · ');
    return `${i + 1}. ${t.name}${biz}\n    ${bits}`;
  });
  const head = intro ?? `Good news! 🎉 Here are the best ${noun} near you, based on distance and reviews:`;
  return `${head}\n\n${lines.join('\n\n')}\n\nReply with the number of the one you'd like, and I'll send them your job.`;
}

module.exports = { buildShortlist, formatShortlist };