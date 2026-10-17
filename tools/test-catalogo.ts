/**
 * P1 · 1b-5 — Catálogo real de pisos. Se simula SOLO la red (fetch) para comprobar que DecoAR pide
 * exactamente lo mismo que la web y maneja cada fallo. La app nunca usa datos inventados.
 * La lectura real contra Supabase se valida en el iPhone. Ejecutar:  npx tsx tools/test-catalogo.ts
 */
import {
  leerConfig, urlTiendas, urlProductos, cabeceras, cargarPisos, interpretarProductos, precioTexto, CATEGORIAS_PISO,
} from '../components/editor2d/catalogoPisos';
import { editorVacio, reducirEditor } from '../components/plan/planEditor';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };

const LLAVE = 'llave-anonima-de-prueba-0123456789';
const CFG = leerConfig('https://proyecto.supabase.co/', LLAVE)!;

type Resp = { status?: number; cuerpo?: unknown; lanzar?: string; jsonMalo?: boolean };
function red(respuestas: Resp[]) {
  const pedidas: { url: string; headers: Record<string, string> }[] = [];
  const f = async (url: string, init: { headers: Record<string, string> }) => {
    pedidas.push({ url, headers: init.headers });
    const r = respuestas[pedidas.length - 1] ?? { status: 500 };
    if (r.lanzar) { const e = new Error(r.lanzar); (e as any).name = r.lanzar; throw e; }
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => { if (r.jsonMalo) throw new Error('json'); return r.cuerpo; } };
  };
  return { f, pedidas };
}

(async () => {
  // ── 1. Configuración ──
  t('1) configuración válida: https://<proyecto>.supabase.co sin barra final', CFG?.url === 'https://proyecto.supabase.co');
  t('1) sin URL, con http, con otro dominio o sin llave: no hay configuración',
    leerConfig(undefined, LLAVE) === null && leerConfig('http://proyecto.supabase.co', LLAVE) === null
    && leerConfig('https://otro.com', LLAVE) === null && leerConfig('https://proyecto.supabase.co', '') === null);

  // ── 2. Las consultas son las de la web ──
  t('2) tiendas: activa = true y plan distinto de gratis (visor3d.js:2343)', urlTiendas(CFG) === 'https://proyecto.supabase.co/rest/v1/tiendas?select=id&activa=eq.true&plan_nombre=neq.gratis');
  const up = urlProductos(CFG, ['a1', 'b2']);
  t('2) productos: de esas tiendas, activo = true (visor3d.js:2345)', up.includes('tienda_id=in.(a1,b2)') && up.includes('activo=eq.true'));
  t('2) productos: solo pisos, enchapes y materiales (visor3d.js:2461)', up.includes('categoria=in.(pisos,enchapes,materiales)') && CATEGORIAS_PISO.join() === 'pisos,enchapes,materiales');
  t('2) productos: solo los campos que se usan, incluida imagen_url', up.includes('select=id,nombre,categoria,imagen_url,precio,unidad,tienda_id'));
  const h = cabeceras(CFG);
  t('2) cabeceras: solo la llave anónima', h.apikey === LLAVE && h.Authorization === `Bearer ${LLAVE}` && Object.keys(h).sort().join() === 'Accept,Authorization,apikey');

  // ── 3. Carga correcta ──
  {
    const { f, pedidas } = red([
      { cuerpo: [{ id: 't1' }, { id: 't2' }] },
      { cuerpo: [
        { id: 'p1', nombre: 'Porcelanato gris', categoria: 'pisos', imagen_url: 'https://img/p1.jpg', precio: 45000, unidad: 'm2', tienda_id: 't1' },
        { id: 'p2', nombre: 'Mortero', categoria: 'materiales', imagen_url: '', precio: null, tienda_id: 't2' },
        { id: 'p3', nombre: 'Pintura', categoria: 'pintura', imagen_url: 'https://img/p3.jpg', tienda_id: 't1' },
        { nombre: 'sin id', categoria: 'pisos' },
      ] },
    ]);
    const r = await cargarPisos(f as any, CFG);
    t('3) dos peticiones: tiendas y luego productos de esas tiendas', pedidas.length === 2 && pedidas[1].url.includes('tienda_id=in.(t1,t2)'));
    t('3) se queda con los pisos y materiales (descarta otra categoría y filas sin id)', r.estado === 'ok' && r.pisos.map(p => p.id).join() === 'p1,p2');
    t('3) producto sin imagen: imagenUrl null (se muestra, no se aplica)', r.estado === 'ok' && r.pisos[1].imagenUrl === null);
    t('3) precio con separador de miles', r.estado === 'ok' && precioTexto(r.pisos[0]) === '$ 45.000 / m2' && precioTexto(r.pisos[1]) === null);
  }
  {
    const { f, pedidas } = red([{ cuerpo: [] }]);
    const r = await cargarPisos(f as any, CFG);
    t('3) sin tiendas activas: catálogo vacío y no se pide nada más', r.estado === 'ok' && r.pisos.length === 0 && pedidas.length === 1);
  }

  // ── 4. Fallos: se informan, nunca se inventan datos, nunca se muestra la llave ──
  const casos: [string, Resp[], string][] = [
    ['llave rechazada (401)', [{ status: 401 }], 'rechazó la llave'],
    ['error del servidor (500)', [{ status: 500 }], 'error (500)'],
    ['sin conexión', [{ lanzar: 'TypeError' }], 'No se pudo conectar'],
    ['tardó demasiado', [{ lanzar: 'AbortError' }], 'tardó demasiado'],
    ['respuesta ilegible', [{ jsonMalo: true }], 'no se pudo leer'],
    ['respuesta inesperada', [{ cuerpo: { error: 'x' } }], 'inesperada'],
    ['falla en productos', [{ cuerpo: [{ id: 't1' }] }, { status: 503 }], 'error (503)'],
  ];
  for (const [n, resp, texto] of casos) {
    const { f } = red(resp);
    const r = await cargarPisos(f as any, CFG);
    t(`4) ${n}: estado de error con mensaje claro`, r.estado === 'error' && r.mensaje.includes(texto));
    t(`4) ${n}: el mensaje no contiene la llave`, r.estado === 'error' && !r.mensaje.includes(LLAVE));
  }
  {
    const { f, pedidas } = red([]);
    const r = await cargarPisos(f as any, null);
    t('4) sin configuración: lo dice y no hace ninguna petición', r.estado === 'sin-config' && pedidas.length === 0);
  }
  t('4) filas que no son una lista: no se interpretan', interpretarProductos({ a: 1 }) === null);

  // ── 5. Aplicar el piso al espacio: imagen_url → imagen_piso (como la web) ──
  {
    let e = reducirEditor(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 });
    const id = String(e.planta.modulos[0].id);
    e = reducirEditor(e, { type: 'actualizarModulo', id, cambios: { imagen_piso: 'https://img/p1.jpg' } });
    t('5) el espacio guarda la imagen del producto en imagen_piso', e.planta.modulos[0].imagen_piso === 'https://img/p1.jpg');
    e = reducirEditor(e, { type: 'actualizarModulo', id, cambios: { imagen_piso: null } });
    t('5) "Quitar el piso" lo deja en null, como la web', e.planta.modulos[0].imagen_piso === null);
  }

  console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})();
