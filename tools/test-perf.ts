/**
 * Pruebas de niveles, estimación de celular y vigilante de fluidez.
 * Ejecutar:  npx tsx tools/test-perf.ts
 */
import {
  DeviceInfo, GOVERNOR, GovEvent, GovState, Tier, classifyDevice, createGovernor, ramClass,
  resumeGovernor, stepGovernor, warningFor,
} from '../components/perf/perfModel';
import { runJsBenchmark, startLagSampler, startLoadSimulator } from '../components/perf/perfRuntime';
import { drawReducer, initialDrawState } from '../components/ar/draw/drawModel';

let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const GIB = 1024 ** 3;
const dev = (o: Partial<DeviceInfo>): DeviceInfo =>
  ({ os: 'ios', modelId: null, modelName: null, brand: null, totalMemoryBytes: null, source: 'expo-device', ...o });

// ── Estimación del celular
t('iPhone 15 (iPhone15,4) → alto, recomendado Alto', (() => { const p = classifyDevice(dev({ modelId: 'iPhone15,4' })); return p.deviceClass === 'high' && p.recommended === 'high'; })());
t('iPhone 15 Pro (iPhone16,1) → alto', classifyDevice(dev({ modelId: 'iPhone16,1' })).deviceClass === 'high');
t('iPhone 11 (iPhone12,1) → medio, recomendado Realista', (() => { const p = classifyDevice(dev({ modelId: 'iPhone12,1' })); return p.deviceClass === 'mid' && p.recommended === 'realistic'; })());
t('iPhone X (iPhone10,3) → bajo, recomendado Básico', (() => { const p = classifyDevice(dev({ modelId: 'iPhone10,3' })); return p.deviceClass === 'low' && p.recommended === 'basic'; })());
t('iPad sin patrón iPhone se estima por RAM', classifyDevice(dev({ modelId: 'iPad14,3', totalMemoryBytes: 8 * GIB })).deviceClass === 'mid');
t('Android 12 GB → alto', classifyDevice(dev({ os: 'android', totalMemoryBytes: 11.2 * GIB })).deviceClass === 'high');
t('Android "8 GB" (7.4 GiB reales) → medio', classifyDevice(dev({ os: 'android', totalMemoryBytes: 7.4 * GIB })).deviceClass === 'mid');
t('Android "6 GB" (5.5 GiB reales) → medio', classifyDevice(dev({ os: 'android', totalMemoryBytes: 5.5 * GIB })).deviceClass === 'mid');
t('Android "4 GB" (3.6 GiB reales) → bajo → Básico', (() => { const p = classifyDevice(dev({ os: 'android', totalMemoryBytes: 3.6 * GIB })); return p.deviceClass === 'low' && p.recommended === 'basic'; })());
t('Android sin RAM → desconocido → Básico', (() => { const p = classifyDevice(dev({ os: 'android' })); return p.deviceClass === 'unknown' && p.recommended === 'basic'; })());
t('sin expo-device → desconocido', classifyDevice(dev({ source: 'none' })).deviceClass === 'unknown');
t('ramClass rechaza valores raros', ramClass(NaN) === 'unknown' && ramClass(-5) === 'unknown' && ramClass(null) === 'unknown');

// ── Advertencia al escoger
t('nivel recomendado → sin advertencia', warningFor('high', 'high') === 'ok');
t('nivel menor al recomendado → sin advertencia', warningFor('high', 'basic') === 'ok');
t('un nivel por encima → precaución', warningFor('realistic', 'high') === 'caution');
t('dos o más por encima → riesgoso', warningFor('basic', 'high') === 'risky' && warningFor('basic', 'ultra') === 'risky');

// ── Vigilante: simulación con tiempo controlado (una muestra cada 250 ms)
const STEP = GOVERNOR.sampleMs;
interface Run { events: { at: number; e: GovEvent }[]; secs: (number | null)[]; state: GovState }
function simulate(tier: Tier, lagAt: (ms: number) => number, durationMs: number): Run {
  let st = createGovernor(tier, 0);
  const events: Run['events'] = [], secs: Run['secs'] = [];
  for (let ms = STEP; ms <= durationMs; ms += STEP) {
    const r = stepGovernor(st, ms, lagAt(ms));
    st = r.state;
    secs.push(r.secondsLeft);
    for (const e of r.events) events.push({ at: ms, e });
  }
  return { events, secs, state: st };
}
const of = (r: Run, type: GovEvent['type']) => r.events.filter(x => x.e.type === type);

const healthy = simulate('ultra', () => 20, 60_000);
t('celular sano: ningún evento en 60 s', healthy.events.length === 0 && healthy.state.tier === 'ultra');

const spikes = simulate('ultra', ms => (ms % 1000 === 0 ? 400 : 20), 60_000);
t('picos aislados (1 de cada 4) no disparan nada', spikes.events.length === 0);

const warm = simulate('ultra', () => 500, 3_900);
t('durante la gracia inicial se ignora la lentitud', warm.events.length === 0);

const slow = simulate('ultra', () => 300, 20_000);
const start = of(slow, 'countdown-start')[0], drop = of(slow, 'drop')[0];
t('lentitud sostenida inicia cuenta regresiva', !!start && (start.e as any).target === 'high');
t('la cuenta empieza después de la gracia + ventana (≈6.75 s)', !!start && start.at >= 6000 && start.at <= 8000);
t('baja UN nivel (Ultra → Alto) tras 5 s de cuenta', !!drop && (drop.e as any).from === 'ultra' && (drop.e as any).to === 'high');
t('la bajada ocurre ≈5 s después del aviso', !!drop && !!start && Math.abs(drop.at - start.at - GOVERNOR.countdownS * 1000) <= STEP);
t('la cuenta regresiva muestra 5,4,3,2,1', (() => {
  const seq = slow.secs.filter((x): x is number => x !== null).slice(0, 25);
  return [5, 4, 3, 2, 1].every(n => seq.includes(n)) && Math.max(...seq) === 5;
})());
t('tras bajar hay gracia nueva: no vuelve a avisar enseguida', (() => {
  const second = of(slow, 'countdown-start')[1];
  return !second || second.at - drop.at >= GOVERNOR.warmupMs;
})());

const frozen = simulate('ultra', () => 1000, 15_000);
t('celular casi congelado baja directo a Básico', (of(frozen, 'countdown-start')[0].e as any).target === 'basic');

const recover = simulate('high', ms => (ms < 9000 ? 300 : 20), 20_000);
t('hay aviso…', of(recover, 'countdown-start').length === 1);
t('…pero si el celular se recupera, se cancela', of(recover, 'countdown-cancel').length === 1 && of(recover, 'drop').length === 0 && recover.state.tier === 'high');

const basicSlow = simulate('basic', () => 300, 20_000);
t('en Básico, la lentitud sostenida lleva a "no apto"', (of(basicSlow, 'countdown-start')[0].e as any).target === 'exit' && of(basicSlow, 'unfit').length === 1);

const resumed = simulate('ultra', ms => (ms === 8000 ? 30_000 : 20), 30_000);
t('volver de segundo plano (retraso enorme) no cuenta como lentitud', resumed.events.length === 0);

t('resumeGovernor cancela una cuenta en curso', (() => {
  let st = createGovernor('ultra', 0);
  for (let ms = STEP; ms <= 8000; ms += STEP) st = stepGovernor(st, ms, 300).state;
  const had = !!st.countdown;
  return had && resumeGovernor(st, 8000).countdown === null;
})());

// ── Mundo AR: al terminar la sesión se borra el dibujo
t('clearAll deja el dibujo en blanco, sin historial', (() => {
  let s = initialDrawState();
  s = drawReducer(s, { type: 'add', point: [0, 0, 0] });
  s = drawReducer(s, { type: 'add', point: [1, 0, 0] });
  const c = drawReducer(s, { type: 'clearAll' });
  return c.current.length === 0 && c.past.length === 0 && c.floor === null && c.phase === 'floor';
})());

// ── Medición real en Node: ¿el simulador de lentitud de verdad produce retraso medible?
async function realTimers() {
  const sample = (withLoad: boolean, ms: number) => new Promise<number[]>(res => {
    const lags: number[] = [];
    const stopLoad = withLoad ? startLoadSimulator() : () => {};
    const stop = startLagSampler(l => lags.push(l), GOVERNOR.sampleMs);
    setTimeout(() => { stop(); stopLoad(); res(lags); }, ms);
  });
  const calm = await sample(false, 1500);
  const loaded = await sample(true, 3000);
  const bad = (a: number[]) => a.filter(x => x >= GOVERNOR.badLagMs).length / Math.max(1, a.length);
  t('sin simulador: casi ninguna muestra mala (medido en Node)', bad(calm) <= 0.2);
  t('con simulador: la mayoría de muestras son malas (medido en Node)', bad(loaded) >= GOVERNOR.badRatio);
  const ms = runJsBenchmark();
  t('el benchmark devuelve un número positivo', Number.isFinite(ms) && ms >= 0);
  console.log(`   (medición real: sin carga ${(bad(calm) * 100).toFixed(0)}% malas, con carga ${(bad(loaded) * 100).toFixed(0)}% malas; benchmark Node = ${ms} ms)`);
}

realTimers().then(() => {
  console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
});