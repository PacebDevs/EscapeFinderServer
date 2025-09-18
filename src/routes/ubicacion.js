// ==============================
// 🌐 routes/ubicacion.js
// ==============================
const express = require('express');
const router = express.Router();
const locationService = require('../services/LocationService');

// --- Config tunable ---
const MIN_NONSPACE_LEN = 3;
const DEFAULT_DEBOUNCE_MS = 180;
const DIGIT_END_DEBOUNCE_MS = 220;
const MAX_WAIT_MS = 350;
// Si han pasado > LEADING_IDLE_MS desde el último disparo, disparamos “leading”
const LEADING_IDLE_MS = 450;

// Estado por cliente
// key -> {
//   timer,
//   pendingRes,
//   inflightByNorm: Map<string, Promise>,
//   activeCtrlsByNorm: Map<string, AbortController>,
//   burstStartTs: number|null,
//   lastFireTs: number|null,
//   noResultToken: { token: string, minLen: number }
// }
const clientStates = new Map();

function getClientKey(req) {
  const sid = req.get('X-Session-Id');
  if (sid && /^[a-zA-Z0-9:_\-\.]{6,}$/.test(sid)) return `sid:${sid}`;
  return `ip:${req.ip}|ua:${(req.get('User-Agent') || '').slice(0,80)}`;
}
function normalizeForCompare(s = '') {
  return String(s).replace(/\s{2,}/g, ' ').trim().toLowerCase();
}
function debounceMsFor(raw = '') {
  // Debounce progresivo: aumenta un poco en frases largas.
  // Mantiene el final numérico ligeramente más lento.
  let base = /[0-9]$/.test(raw) ? DIGIT_END_DEBOUNCE_MS : DEFAULT_DEBOUNCE_MS;
  const len = String(raw).trim().length;
  if (len > 20) base += 80;   // ~260–300ms
  if (len > 32) base += 100;  // ~360–400ms
  return base;
}
function getInflight(state, norm) {
  if (!state.inflightByNorm) state.inflightByNorm = new Map();
  return state.inflightByNorm.get(norm);
}
function setInflight(state, norm, promise) {
  if (!state.inflightByNorm) state.inflightByNorm = new Map();
  state.inflightByNorm.set(norm, promise);
  promise.finally(() => state.inflightByNorm.delete(norm));
}

// ⬇️ mínimo por token (5 para primer token; 3 para siguientes; 1 si es numérico puro)
function minLenForToken(token, isFirst) {
  if (/^\d+$/.test(token)) return 1;
  return isFirst ? 5 : 3; // subimos un poco el umbral del primer token
}

async function fireNow(state, qRaw, norm, res, req) {
  // ¿ya hay una petición en vuelo para este norm? → reutiliza, NO abortes
  let inflight = getInflight(state, norm);

  // si NO existe, aborta todas las anteriores (de otros norms) y crea una nueva
  if (!inflight) {
    if (!state.activeCtrlsByNorm) state.activeCtrlsByNorm = new Map();
    // aborta todo lo viejo
    for (const ctrl of state.activeCtrlsByNorm.values()) {
      try { ctrl.abort(); } catch {}
    }
    state.activeCtrlsByNorm.clear();

    const ctrl = new AbortController();
    state.activeCtrlsByNorm.set(norm, ctrl);

    inflight = (async () => {
      const predictions = await locationService.autocomplete(qRaw, {
        sessionToken: req.get('X-Session-Id') || undefined,
        signal: ctrl.signal, // 👈 abortable
      });
      return predictions || [];
    })();

    setInflight(state, norm, inflight);
    inflight.finally(() => {
      if (state.activeCtrlsByNorm) state.activeCtrlsByNorm.delete(norm);
    });
  }

  return inflight.then((result) => {
    // marcar prefijo sin resultados (solo si el último token actual devuelve 0)
    const tokens = qRaw.trimStart().split(/\s+/).filter(Boolean);
    const currentToken = tokens[tokens.length - 1] || '';
    if (Array.isArray(result) && result.length === 0 && currentToken) {
      state.noResultToken = { token: currentToken, minLen: currentToken.length };
    } else {
      state.noResultToken = { token: '', minLen: 0 };
    }

    if (!res.headersSent && !res.writableEnded) res.json(result);
  }).catch((err) => {
    // silencio si fue cancelada
    if (err && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.message === 'canceled')) {
      return;
    }
    console.error('Autocomplete backend error:', err);
    if (!res.headersSent && !res.writableEnded) res.status(500).json({ error: 'Error en autocomplete' });
  }).finally(() => {
    if (state.pendingRes === res) state.pendingRes = null;
    state.burstStartTs = null;
    state.lastFireTs = Date.now();
  });
}

// Autocomplete con coalescing server-side (leading + trailing + maxWait)
router.get('/autocomplete', async (req, res) => {
  const input = String(req.query.input || '');

  // 1) corte por longitud total sin espacios
  const nonSpaceLen = input.replace(/\s/g, '').length;
  if (nonSpaceLen < MIN_NONSPACE_LEN) return res.json([]);

  // 2) NO cerramos el token artificialmente: usamos el input tal cual
  const qRaw = input;
  const norm = normalizeForCompare(qRaw);
  const clientKey = getClientKey(req);

  let state = clientStates.get(clientKey);
  if (!state) {
    state = {
      timer: null,
      pendingRes: null,
      inflightByNorm: new Map(),
      activeCtrlsByNorm: new Map(),
      burstStartTs: null,
      lastFireTs: null,
      noResultToken: { token: '', minLen: 0 },
    };
    clientStates.set(clientKey, state);
  }

  // limpia si el socket se cierra
  req.on('close', () => {
    if (state.pendingRes === res) state.pendingRes = null;
    clearTimeout(state.timer);
    // aborta en curso
    if (state.activeCtrlsByNorm) {
      for (const ctrl of state.activeCtrlsByNorm.values()) {
        try { ctrl.abort(); } catch {}
      }
      state.activeCtrlsByNorm.clear();
    }
  });

  // evita dos respuestas abiertas
  if (state.pendingRes && !state.pendingRes.headersSent && !state.pendingRes.writableEnded) {
    try { state.pendingRes.status(204).end(); } catch {}
  }
  state.pendingRes = res;

  // 3) ¿el token está “cerrado”? (espacio real tecleado al final)
  const tokenClosed = /\s$/.test(qRaw);

  // 4) mínimo por token (solo si el token NO está cerrado)
  const tokens = qRaw.trimStart().split(/\s+/).filter(Boolean);
  const lastTok = tokens[tokens.length - 1] || '';
  const isFirst = (tokens.length === 1);
  const lastTokLen = lastTok.replace(/\s/g, '').length;

  if (!tokenClosed) {
    if (lastTokLen < minLenForToken(lastTok, isFirst)) {
      return res.json([]); // token aún no “maduró”
    }
  }

  // 5) supresión de prefijo sin resultados (+2 chars desde el último 0) — FIX: no reprogramar fireNow
  const nrt = state.noResultToken || { token: '', minLen: 0 };
  if (!tokenClosed && nrt.token && lastTok.startsWith(nrt.token)) {
    const needLen = nrt.minLen + 2;
    if (lastTok.length < needLen) {
      // 👉 no golpear Google todavía
      return res.json([]);
    }
  }

  clearTimeout(state.timer);
  const now = Date.now();
  if (state.burstStartTs == null) state.burstStartTs = now;

  const baseDelay = debounceMsFor(input);
  const elapsed = now - state.burstStartTs;
  const remainingMax = Math.max(0, MAX_WAIT_MS - elapsed);
  const delay = Math.min(baseDelay, remainingMax);

  const idleSinceLastFire = state.lastFireTs ? now - state.lastFireTs : Infinity;

  // Leading: si llevamos “rato” sin disparar o se cerró token → responde ya
  if (idleSinceLastFire > LEADING_IDLE_MS || tokenClosed) {
    return void fireNow(state, qRaw, norm, res, req);
  }

  // Trailing (con tope maxWait)
  state.timer = setTimeout(() => {
    if (res.writableEnded) return;
    fireNow(state, qRaw, norm, res, req);
  }, delay);
});

// ==============================
// Geocoding
// ==============================
router.get('/geocode', async (req, res) => {
  const { description } = req.query;
  if (!description) return res.status(400).json({ error: 'Falta el parámetro description' });
  try {
    const resultado = await locationService.geocode(description);
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error en geocode' });
  }
});

// ==============================
// Reverse Geocoding
// ==============================
router.get('/reverse', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'Faltan parámetros lat y lng' });
  try {
    const resultado = await locationService.reverseGeocode(lat, lng);
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error en reverse geocode' });
  }
});

module.exports = router;
