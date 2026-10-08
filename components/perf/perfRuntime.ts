/**
 * DecoAR — Herramientas de medición en el teléfono (sin React, probables en Node)
 *
 *  - startLagSampler: mide el retraso del hilo JS (la señal que usa el vigilante).
 *  - startLoadSimulator: ahoga a propósito el hilo JS, SOLO para probar la advertencia.
 *  - runJsBenchmark: prueba de velocidad de CPU en JS. Hoy solo se MUESTRA en pantalla
 *    para juntar números de celulares reales y calibrar; todavía no decide nada.
 */

const now = (): number => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/** Llama a `onLag(retrasoMs, instante)` cada `intervalMs`. Devuelve la función para detenerlo. */
export function startLagSampler(onLag: (lagMs: number, at: number) => void, intervalMs = 250): () => void {
  let last = Date.now();
  const id = setInterval(() => {
    const at = Date.now();
    const lag = Math.max(0, at - last - intervalMs);
    last = at;
    onLag(lag, at);
  }, intervalMs);
  return () => clearInterval(id);
}

/**
 * Bloquea el hilo JS `blockMs` cada `everyMs`. Va en un temporizador APARTE del medidor:
 * si bloqueara dentro del mismo, el siguiente tick llegaría a tiempo y no se notaría retraso.
 */
export function startLoadSimulator(blockMs = 600, everyMs = 300): () => void {
  const id = setInterval(() => {
    const end = Date.now() + blockMs;
    while (Date.now() < end) { /* ocupado a propósito */ }
  }, everyMs);
  return () => clearInterval(id);
}

let sink = 0; // evita que el motor descarte el cálculo como código muerto

/** Mejor tiempo (ms) de varias corridas de una carga fija de CPU. Menor = más rápido. */
export function runJsBenchmark(trials = 3, iterations = 250_000): number {
  let best = Infinity;
  for (let t = 0; t < trials; t++) {
    const t0 = now();
    let x = 0;
    for (let i = 1; i <= iterations; i++) x += Math.sqrt(i) * Math.sin(i);
    sink += x;
    best = Math.min(best, now() - t0);
  }
  return Math.round(best);
}