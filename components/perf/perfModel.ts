/**
 * DecoAR — Niveles de rendimiento y "vigilante" de fluidez
 * ------------------------------------------------------------------
 * Módulo puro (sin React ni módulos nativos) para poder probarlo aislado.
 *
 * Tiene tres piezas:
 *   1. Los 4 niveles (Básico, Realista, Alto, Ultra) y qué pedirá cada uno al detector de objetos.
 *   2. Una ESTIMACIÓN del celular (por modelo en iPhone, por RAM en Android) → nivel recomendado.
 *      Es una estimación: ninguna API del teléfono dice "este equipo es de gama media".
 *   3. Un VIGILANTE que mide si el celular se está ahogando mientras se usa la app y,
 *      si el problema se sostiene, avisa con cuenta regresiva y baja de nivel solo.
 *
 * Todos los números marcados "inicial" son suposiciones razonables, NO medidas de
 * teléfonos reales. Hay que calibrarlos con pruebas en dispositivos.
 */

// ───────────────────────────── Niveles ─────────────────────────────

export type Tier = 'basic' | 'realistic' | 'high' | 'ultra';
export const TIERS: readonly Tier[] = ['basic', 'realistic', 'high', 'ultra'];
export const tierRank = (t: Tier): number => TIERS.indexOf(t);

/**
 * ¿Ya está conectado el detector de objetos (YOLOE)? Mientras sea false, los niveles
 * miden y protegen el rendimiento pero todavía no cambian lo que se ve. La pantalla
 * de inicio lo dice con claridad para no prometer lo que aún no existe.
 */
export const DETECTION_CONNECTED = false;

export interface TierSpec {
  label: string;
  /** Veces por segundo que correrá el detector (0 = apagado). Valor inicial, a calibrar. */
  detectionHz: number;
  segmentation: boolean;
  summary: string;
}

export const TIER_SPECS: Record<Tier, TierSpec> = {
  basic: {
    label: 'Básico', detectionHz: 0, segmentation: false,
    summary: 'Piso, paredes y dibujo manual. Sin reconocimiento de objetos. Funciona en cualquier celular.',
  },
  realistic: {
    label: 'Realista', detectionHz: 1, segmentation: false,
    summary: 'Reconoce muebles con cajas, despacio (1 vez por segundo).',
  },
  high: {
    label: 'Alto', detectionHz: 3, segmentation: true,
    summary: 'Reconoce muebles y marca su contorno (3 veces por segundo).',
  },
  ultra: {
    label: 'Ultra', detectionHz: 6, segmentation: true,
    summary: 'El reconocimiento más rápido y fino. Exige un celular potente.',
  },
};

// ───────────────────────────── Estimación del celular ─────────────────────────────

export type DeviceClass = 'low' | 'mid' | 'high' | 'unknown';

export interface DeviceInfo {
  os: 'ios' | 'android' | 'other';
  modelId: string | null;         // iOS: "iPhone15,4". Android: null (así lo documenta expo-device)
  modelName: string | null;
  brand: string | null;
  totalMemoryBytes: number | null;
  /** De dónde salieron los datos: 'expo-device' o 'none' si el módulo nativo no está en esta compilación. */
  source: 'expo-device' | 'none';
}

export interface DeviceProfile {
  deviceClass: DeviceClass;
  recommended: Tier;
  reason: string;
}

const GIB = 1024 ** 3;

/**
 * Clase por RAM. Un celular "de 8 GB" reporta ~7 GiB (el sistema reserva parte), por eso
 * los umbrales son más bajos que el número de la caja. Valores iniciales, a calibrar.
 *   ≥ 10.5 GiB (celulares de 12 GB o más) → alto
 *   ≥ 5 GiB   (6 y 8 GB)                  → medio
 *   menos                                  → bajo
 * La RAM es un indicador pobre del procesador: un celular de 8 GB con chip débil es posible.
 * Por eso el vigilante sigue activo aunque la estimación diga "alto".
 */
export function ramClass(bytes: number | null): DeviceClass {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return 'unknown';
  const g = bytes / GIB;
  return g >= 10.5 ? 'high' : g >= 5 ? 'mid' : 'low';
}

const RECOMMENDED: Record<DeviceClass, Tier> = {
  low: 'basic', mid: 'realistic', high: 'high', unknown: 'basic',
};

export function classifyDevice(info: DeviceInfo): DeviceProfile {
  const make = (deviceClass: DeviceClass, reason: string): DeviceProfile =>
    ({ deviceClass, recommended: RECOMMENDED[deviceClass], reason });

  if (info.source === 'none') {
    return make('unknown', 'No se pudo leer el modelo del celular en esta compilación de la app.');
  }

  if (info.os === 'ios') {
    // iPhone11,x = XS/XR · 12,x = 11 · 13,x = 12 · 14,x = 13 y 14 · 15,x = 14 Pro y 15 · 16,x = 15 Pro
    const m = /^iPhone(\d+),\d+$/.exec(info.modelId ?? '');
    if (m) {
      const major = Number(m[1]);
      if (major >= 14) return make('high', `iPhone reciente (${info.modelId}).`);
      if (major >= 12) return make('mid', `iPhone de generación media (${info.modelId}).`);
      return make('low', `iPhone antiguo (${info.modelId}).`);
    }
    // iPad u otro identificador: se estima por RAM
    const c = ramClass(info.totalMemoryBytes);
    return make(c, c === 'unknown' ? 'Modelo no reconocido y sin dato de memoria.' : 'Estimado por la memoria del equipo.');
  }

  if (info.os === 'android') {
    const c = ramClass(info.totalMemoryBytes);
    const gb = info.totalMemoryBytes ? ` (${(info.totalMemoryBytes / GIB).toFixed(1)} GB de RAM)` : '';
    return make(c, c === 'unknown'
      ? 'Android no entrega el modelo del procesador ni la RAM no estaba disponible.'
      : `Estimado por la memoria${gb}. La RAM no mide el procesador: el vigilante de fluidez te protege.`);
  }

  return make('unknown', 'Plataforma no reconocida.');
}

// ───────────────────────────── Advertencia al escoger ─────────────────────────────

export type Warning = 'ok' | 'caution' | 'risky';

/** Un nivel por encima de lo recomendado = precaución; dos o más = riesgoso. */
export function warningFor(recommended: Tier, chosen: Tier): Warning {
  const diff = tierRank(chosen) - tierRank(recommended);
  return diff <= 0 ? 'ok' : diff === 1 ? 'caution' : 'risky';
}

export function warningText(w: Warning, chosen: Tier): string | null {
  const name = TIER_SPECS[chosen].label;
  if (w === 'caution') {
    return `${name} puede exigir más de lo que tu celular rinde cómodamente. Puedes entrar: si se pone lento, te avisamos y bajamos el nivel.`;
  }
  if (w === 'risky') {
    return `Tu celular probablemente no aguante ${name}. Puedes entrar igual: si se ahoga, verás una cuenta regresiva y bajaremos el nivel solos antes de que se congele.`;
  }
  return null;
}

// ───────────────────────────── Vigilante de fluidez ─────────────────────────────

/**
 * Señal que medimos: el RETRASO del hilo de JavaScript (cuánto tarda en cumplirse un
 * temporizador respecto a lo esperado). Si el celular se ahoga, ese retraso sube.
 * Limitación honesta: mide el hilo JS, no los fotogramas de la cámara AR ni la
 * temperatura. Cuando exista el detector, su tiempo por inferencia debe sumarse aquí.
 */
export interface GovConfig {
  sampleMs: number;        // cada cuánto se toma una muestra
  badLagMs: number;        // retraso a partir del cual una muestra cuenta como "mala"
  severeLagMs: number;     // retraso medio que indica un celular casi congelado
  windowMs: number;        // ventana para decidir que el problema es sostenido
  badRatio: number;        // fracción de muestras malas en la ventana para actuar
  countdownS: number;     // segundos de aviso antes de bajar de nivel
  recoverWindowMs: number; // ventana para decidir que ya se recuperó
  recoverRatio: number;    // fracción máxima de malas para cancelar la cuenta
  warmupMs: number;        // gracia tras entrar o cambiar de nivel (el arranque de AR es pesado)
  resumeWarmupMs: number;  // gracia tras volver de segundo plano
  maxLagMs: number;        // retraso mayor = la app estuvo en segundo plano; se descarta
}

export const GOVERNOR: GovConfig = {   // todos iniciales, a calibrar
  sampleMs: 250,
  badLagMs: 180,
  severeLagMs: 700,
  windowMs: 3000,
  badRatio: 0.6,
  countdownS: 5,
  recoverWindowMs: 2000,
  recoverRatio: 0.2,
  warmupMs: 4000,
  resumeWarmupMs: 2000,
  maxLagMs: 4000,
};

export interface GovSample { t: number; lag: number }

export interface GovState {
  tier: Tier;
  warmupUntil: number;
  samples: GovSample[];
  countdown: { endsAt: number; target: Tier | 'exit' } | null;
}

export type GovEvent =
  | { type: 'countdown-start'; target: Tier | 'exit' }
  | { type: 'countdown-cancel' }
  | { type: 'drop'; from: Tier; to: Tier }
  | { type: 'unfit' };

export interface GovStep {
  state: GovState;
  events: GovEvent[];
  secondsLeft: number | null;
}

export const createGovernor = (tier: Tier, now: number, cfg: GovConfig = GOVERNOR): GovState =>
  ({ tier, warmupUntil: now + cfg.warmupMs, samples: [], countdown: null });

/** Tras volver de segundo plano: se borra el historial y se da un respiro. */
export const resumeGovernor = (s: GovState, now: number, cfg: GovConfig = GOVERNOR): GovState =>
  ({ ...s, samples: [], countdown: null, warmupUntil: now + cfg.resumeWarmupMs });

const badFraction = (samples: GovSample[], from: number, badLag: number): number => {
  const w = samples.filter(s => s.t >= from);
  return w.length ? w.filter(s => s.lag >= badLag).length / w.length : 0;
};

export function stepGovernor(s: GovState, now: number, lag: number, cfg: GovConfig = GOVERNOR): GovStep {
  const left = (st: GovState) => (st.countdown ? Math.max(1, Math.ceil((st.countdown.endsAt - now) / 1000)) : null);

  // Un retraso enorme es la app volviendo de segundo plano, no un celular lento.
  if (lag > cfg.maxLagMs) {
    const st = resumeGovernor(s, now, cfg);
    return { state: st, events: s.countdown ? [{ type: 'countdown-cancel' }] : [], secondsLeft: null };
  }
  if (now < s.warmupUntil) return { state: s, events: [], secondsLeft: null };

  const samples = [...s.samples.filter(x => now - x.t <= cfg.windowMs), { t: now, lag }];
  let st: GovState = { ...s, samples };
  const events: GovEvent[] = [];

  if (!st.countdown) {
    // ¿Ya hay una ventana casi completa y la mayoría de sus muestras son malas?
    const windowFull = samples[0].t <= now - cfg.windowMs + cfg.sampleMs * 1.5;
    if (windowFull && badFraction(samples, now - cfg.windowMs, cfg.badLagMs) >= cfg.badRatio) {
      const mean = samples.reduce((a, x) => a + x.lag, 0) / samples.length;
      const rank = tierRank(st.tier);
      // Básico no tiene a dónde bajar → "no apto". Casi congelado → directo a Básico.
      const target: Tier | 'exit' = rank === 0 ? 'exit' : mean >= cfg.severeLagMs ? 'basic' : TIERS[rank - 1];
      st = { ...st, countdown: { endsAt: now + cfg.countdownS * 1000, target } };
      events.push({ type: 'countdown-start', target });
    }
  } else if (now >= st.countdown.endsAt) {
    const target = st.countdown.target;
    if (target === 'exit') events.push({ type: 'unfit' });
    else events.push({ type: 'drop', from: st.tier, to: target });
    st = {
      ...st, tier: target === 'exit' ? st.tier : target,
      samples: [], countdown: null, warmupUntil: now + cfg.warmupMs,
    };
  } else {
    // En cuenta regresiva: si el celular ya se recuperó, se cancela.
    const recent = samples.filter(x => x.t >= now - cfg.recoverWindowMs);
    if (recent.length >= 6 && badFraction(recent, 0, cfg.badLagMs) <= cfg.recoverRatio) {
      events.push({ type: 'countdown-cancel' });
      st = { ...st, samples: [], countdown: null, warmupUntil: now + cfg.resumeWarmupMs };
    }
  }
  return { state: st, events, secondsLeft: left(st) };
}