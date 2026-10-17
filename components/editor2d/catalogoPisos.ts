/**
 * DecoAR — Catálogo REAL de pisos de las tiendas (entrega 1b-5). Sin React, sin Viro, sin dependencias.
 * ------------------------------------------------------------------
 * Misma consulta que DecoiArte web (visor3d.js:2340-2345 y 2461), por la API REST de Supabase con fetch:
 *   1. tiendas   ?select=id & activa=eq.true & plan_nombre=neq.gratis
 *   2. productos ?tienda_id=in.(…) & activo=eq.true & categoria=in.(pisos,enchapes,materiales) & order=categoria
 * Permisos verificados en Supabase (consultas del propietario): RLS activo; "Productos visibles para todos"
 * y "tiendas_leer" (activa = true) permiten leer con la llave ANÓNIMA, que es pública por diseño.
 * Nunca se usa una llave de servicio. La llave no se escribe en mensajes ni registros.
 * Al elegir un piso se guarda su imagen_url en imagen_piso del módulo, como la web (visor3d.js:8110, 8354).
 */

export const CATEGORIAS_PISO = ['pisos', 'enchapes', 'materiales'];
export const ESPERA_MAX_MS = 15000;

export interface ConfigSupabase { url: string; llaveAnonima: string }

/** Un producto de piso tal como lo muestra el selector. */
export interface PisoCatalogo {
  id: string; nombre: string; categoria: string;
  imagenUrl: string | null;     // null: el producto no tiene imagen
  precio: number | null; unidad: string | null; tiendaId: string;
}

export type ResultadoCatalogo =
  | { estado: 'ok'; pisos: PisoCatalogo[] }
  | { estado: 'sin-config' }
  | { estado: 'error'; mensaje: string };

/**
 * Lee la configuración de .env.local (EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY).
 * Si falta o no tiene forma válida, devuelve null: el selector explica cómo configurarlo.
 */
export function leerConfig(url: string | undefined, llave: string | undefined): ConfigSupabase | null {
  const u = (url ?? '').trim().replace(/\/+$/, ''), k = (llave ?? '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(u) || k.length < 20) return null;
  return { url: u, llaveAnonima: k };
}

export const urlTiendas = (c: ConfigSupabase) =>
  `${c.url}/rest/v1/tiendas?select=id&activa=eq.true&plan_nombre=neq.gratis`;

export const urlProductos = (c: ConfigSupabase, tiendas: string[]) =>
  `${c.url}/rest/v1/productos?select=id,nombre,categoria,imagen_url,precio,unidad,tienda_id` +
  `&tienda_id=in.(${tiendas.map(encodeURIComponent).join(',')})&activo=eq.true` +
  `&categoria=in.(${CATEGORIAS_PISO.join(',')})&order=categoria,nombre`;

/** Cabeceras de la API REST: solo la llave anónima. */
export const cabeceras = (c: ConfigSupabase) => ({ apikey: c.llaveAnonima, Authorization: `Bearer ${c.llaveAnonima}`, Accept: 'application/json' });

/** Convierte las filas de productos en pisos; descarta filas sin id o de otra categoría. */
export function interpretarProductos(filas: unknown): PisoCatalogo[] | null {
  if (!Array.isArray(filas)) return null;
  const out: PisoCatalogo[] = [];
  for (const f of filas as Record<string, unknown>[]) {
    if (!f || typeof f !== 'object' || f.id == null) continue;
    const categoria = String(f.categoria ?? '');
    if (!CATEGORIAS_PISO.includes(categoria)) continue;
    const img = typeof f.imagen_url === 'string' && f.imagen_url.trim() ? f.imagen_url.trim() : null;
    out.push({
      id: String(f.id), nombre: String(f.nombre ?? 'Sin nombre'), categoria, imagenUrl: img,
      precio: typeof f.precio === 'number' ? f.precio : null,
      unidad: typeof f.unidad === 'string' && f.unidad ? f.unidad : null,
      tiendaId: String(f.tienda_id ?? ''),
    });
  }
  return out;
}

type Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Una consulta con límite de espera y errores en español (sin incluir la llave). */
async function pedir(f: Fetch, url: string, c: ConfigSupabase): Promise<{ ok: true; datos: unknown } | { ok: false; mensaje: string }> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const reloj = ctl ? setTimeout(() => ctl.abort(), ESPERA_MAX_MS) : null;
  try {
    const r = await f(url, { headers: cabeceras(c), signal: ctl?.signal });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) return { ok: false, mensaje: 'El catálogo rechazó la llave. Revisa EXPO_PUBLIC_SUPABASE_ANON_KEY en .env.local.' };
      return { ok: false, mensaje: `El catálogo respondió con un error (${r.status}). Intenta de nuevo.` };
    }
    try { return { ok: true, datos: await r.json() }; } catch { return { ok: false, mensaje: 'El catálogo devolvió una respuesta que no se pudo leer.' }; }
  } catch (e) {
    const abortado = (e as { name?: string })?.name === 'AbortError';
    return { ok: false, mensaje: abortado ? 'El catálogo tardó demasiado en responder. Revisa la conexión e intenta de nuevo.' : 'No se pudo conectar con el catálogo. Revisa la conexión a internet.' };
  } finally { if (reloj) clearTimeout(reloj); }
}

/** Carga los pisos publicados. Nunca inventa datos: si algo falla, lo dice. */
export async function cargarPisos(f: Fetch, c: ConfigSupabase | null): Promise<ResultadoCatalogo> {
  if (!c) return { estado: 'sin-config' };
  const t = await pedir(f, urlTiendas(c), c);
  if (!t.ok) return { estado: 'error', mensaje: t.mensaje };
  if (!Array.isArray(t.datos)) return { estado: 'error', mensaje: 'El catálogo devolvió una respuesta inesperada.' };
  const ids = (t.datos as { id?: unknown }[]).map(x => x?.id).filter(x => x != null).map(String);
  if (!ids.length) return { estado: 'ok', pisos: [] };
  const p = await pedir(f, urlProductos(c, ids), c);
  if (!p.ok) return { estado: 'error', mensaje: p.mensaje };
  const pisos = interpretarProductos(p.datos);
  return pisos ? { estado: 'ok', pisos } : { estado: 'error', mensaje: 'El catálogo devolvió una respuesta inesperada.' };
}

/** "$ 45.000 / m2" — separador de miles a mano (no depende de Intl en el teléfono). */
export function precioTexto(p: Pick<PisoCatalogo, 'precio' | 'unidad'>): string | null {
  if (p.precio == null) return null;
  const miles = String(Math.round(p.precio)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${miles}${p.unidad ? ` / ${p.unidad}` : ''}`;
}

export const AVISO_PISO_3D = 'El piso se guarda en el plano y se ve en este plano 2D; la maqueta 3D todavía no muestra la textura.';
