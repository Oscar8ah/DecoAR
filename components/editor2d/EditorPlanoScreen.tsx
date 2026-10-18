/**
 * Pantalla del editor de plano 2D — Etapa 1, entrega 1b-1.
 *   · Sin cámara ni AR: este archivo y todo lo que importa son React Native puro.
 *   · "Colocar espacio" o "Construcción" → elegir tipo → tocar el plano donde va.
 *   · Tocar selecciona; arrastrar mueve; el círculo estira; arrastrar el fondo desplaza la vista.
 *   · + y − acercan y alejan alrededor del centro del lienzo.
 *   · "+" en cada muro compartido crea un vano; tocar un vano lo selecciona (Arco / Vano / Puerta,
 *     Borrar) y arrastrarlo lo mueve a lo largo del muro (1b-3). Sus ajustes (ancho, posición,
 *     alto y puerta) están en PanelVano (1b-3b).
 *   · Todo cambio del plano es una ACCIÓN EXISTENTE de planEditor.ts (ver gestosLienzo.ts):
 *     la pantalla no calcula geometría propia.
 *   · "Generar 3D" convierte el plano (arcos automáticos, como la web) y abre la vista 3D (Entrega 2).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Image, LayoutChangeEvent, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import type { AccionEditor, EditorPlanta } from '../plan/planEditor';
import LienzoPlanta from './LienzoPlanta';
import {
  PASO_ZOOM, Vista, encuadrar, ladoZoom, metros, modulosDelNivel, nombreVisible, puedeAcercar, puedeAlejar, resumen, textoMedidas, zoomVista,
} from './vistaLienzo';
import { CONSTRUCCION, Contexto, ESPACIOS, Gesto, Pieza, iniciar, mismaVista, mover, notaConstruccion, posicionAsa, puedeEstirar, terminar } from './gestosLienzo';
import { T } from './paleta';
import { vanosQueSeQuitarian } from './vanosLienzo';
import PanelVano from './PanelVano';
import SelectorPisos from './SelectorPisos';
import { esCuarto } from '../plan/planModel';

interface Props {
  editor: EditorPlanta;
  despachar: (a: AccionEditor) => void;
  titulo: string;
  /** Cambia cuando se carga otro plano: entonces la vista se vuelve a encuadrar sola. */
  claveEncuadre: number;
  onPlanoNuevo: () => void;
  onOtroEjemplo: () => void;
  onAbrirARAnterior: () => void;
  /** "Generar 3D": convierte (arcos automáticos, como la web) y abre la vista 3D. */
  onGenerar3D: () => void;
}

/**
 * Márgenes seguros. SafeAreaView de React Native 0.86 está marcado como obsoleto y su sustituto
 * (react-native-safe-area-context) sería una dependencia nueva: se usan los márgenes de los iPhone
 * con isla o muesca (alto ≥ 812 pt) y unos mínimos para los demás.
 */
function usarMargenes() {
  const { height } = useWindowDimensions();
  if (Platform.OS !== 'ios') return { arriba: 28, abajo: 12 };
  return height >= 812 ? { arriba: 59, abajo: 30 } : { arriba: 22, abajo: 10 };
}

export default function EditorPlanoScreen(p: Props) {
  const { editor, despachar } = p;
  const m = usarMargenes();
  const nivel = editor.nivelActivo;
  const [lienzo, setLienzo] = useState({ ancho: 0, alto: 0 });
  const [vista, setVista] = useState<Vista | null>(null);
  const [colocar, setColocar] = useState<Pieza | null>(null);
  const [lista, setLista] = useState(false);
  const [listaObras, setListaObras] = useState(false);   // "Agregar objetos de construcción"
  const [menu, setMenu] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ajustesVano, setAjustesVano] = useState(false);   // panel del vano desplegado (se recuerda entre vanos)
  const [menuPisos, setMenuPisos] = useState(false);
  const [selectorPisos, setSelectorPisos] = useState(false);   // catálogo real de pisos (1b-5)
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = (texto: string) => {
    setAviso(texto);
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setAviso(null), 2600);
  };
  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);
  // Los avisos del reductor (p. ej. "Ese espacio está en otro nivel") se muestran tal cual.
  useEffect(() => { if (editor.mensaje) avisar(editor.mensaje); }, [editor.mensaje]);

  const encuadreDe = () => encuadrar(modulosDelNivel(editor.planta, nivel), lienzo.ancho, lienzo.alto);
  // Se encuadra solo al abrir, al cambiar el tamaño del lienzo o al cargar otro plano; NUNCA mientras
  // se edita, para que la vista no salte bajo el dedo.
  useEffect(() => { if (lienzo.ancho > 0) setVista(encuadreDe()); }, [lienzo.ancho, lienzo.alto, p.claveEncuadre]);   // eslint-disable-line react-hooks/exhaustive-deps

  const ajustarVista = () => {
    if (!vista || lienzo.ancho <= 0) return;
    const objetivo = encuadreDe();
    if (mismaVista(vista, objetivo)) avisar(modulosDelNivel(editor.planta, nivel).length ? 'El plano ya está encuadrado.' : 'El plano está vacío.');
    else setVista(objetivo);
  };

  const zoom = (factor: number) => { if (vista) setVista(zoomVista(vista, factor, lienzo.ancho / 2, lienzo.alto / 2)); };

  // ── Gestos: PanResponder → gestosLienzo.ts → acciones del reductor ──
  const ctx = useRef<Contexto | null>(null);
  ctx.current = vista ? { vista, planta: editor.planta, nivel, seleccion: editor.seleccion, colocar } : null;
  const gesto = useRef<Gesto | null>(null);
  const fin = useRef((cancelado: boolean) => {
    const g = gesto.current, c = ctx.current;
    gesto.current = null;
    if (!g || !c) return;
    terminar(g, c, cancelado).forEach(despachar);
    if (!cancelado && !g.arrastrando && g.colocar) setColocar(null);
  });
  const respuesta = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => {
      const c = ctx.current;
      if (!c) return;
      const r = iniciar(c, e.nativeEvent.locationX, e.nativeEvent.locationY);
      gesto.current = r.gesto;
      r.acciones.forEach(despachar);
    },
    onPanResponderMove: (_e, g) => {
      if (!gesto.current || g.numberActiveTouches > 1) return;   // dos dedos: el pellizco llega más adelante
      const r = mover(gesto.current, g.dx, g.dy);
      gesto.current = r.gesto;
      r.acciones.forEach(despachar);
      if (r.vista) setVista(r.vista);
    },
    onPanResponderRelease: () => fin.current(false),
    onPanResponderTerminate: () => fin.current(true),
  })).current;

  const alMedir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - lienzo.ancho) > 0.5 || Math.abs(height - lienzo.alto) > 0.5) setLienzo({ ancho: width, alto: height });
  };

  const elegirEspacio = (pz: Pieza) => { setLista(false); setListaObras(false); setColocar(pz); despachar({ type: 'seleccionar', seleccion: null }); };

  const planoNuevo = () => {
    setMenu(false);
    if (!editor.planta.modulos.length) { p.onPlanoNuevo(); return; }
    Alert.alert('¿Empezar un plano nuevo?', 'El plano actual se borrará. Todavía no se guarda en ningún lado.',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Empezar de cero', style: 'destructive', onPress: p.onPlanoNuevo }]);
  };

  const r = resumen(editor.planta, nivel);
  const subtitulo = r.espacios
    ? `${r.espacios === 1 ? '1 espacio' : `${r.espacios} espacios`}, ${metros(r.ancho)} × ${metros(r.largo)} m, ${metros(r.area)} m² de piso`
    : 'Sin espacios todavía';
  const sel = editor.seleccion?.tipo === 'modulo' ? editor.planta.modulos.find(x => x.id === (editor.seleccion as any).id) : undefined;
  const vanoSel = editor.seleccion?.tipo === 'vano' ? editor.planta.vanos.find(v => String(v.id) === (editor.seleccion as any).id) : undefined;
  // Vanos entre espacios que ya no se tocan: los calcula la acción 'convertir' real sobre una copia.
  const huerfanos = useMemo(() => vanosQueSeQuitarian(editor), [editor.planta]);   // eslint-disable-line react-hooks/exhaustive-deps
  const nombreDe = (id: string | null | undefined) => {
    const mm = id == null ? undefined : editor.planta.modulos.find(x => String(x.id) === String(id));
    return mm ? nombreVisible(mm) : null;
  };
  const puedeDeshacer = editor.deshacer.length > 0, puedeRehacer = editor.rehacer.length > 0;

  return (
    <View style={[s.pantalla, { paddingTop: m.arriba }]}>
      {/* Cabecera: qué plano es y cuánto mide */}
      <View style={s.cabecera}>
        <View style={s.cabeceraTexto}>
          <Text style={s.titulo} numberOfLines={1}>{p.titulo}</Text>
          <Text style={s.subtitulo} numberOfLines={1}>{subtitulo}</Text>
        </View>
        <Pressable style={[s.redondo, !puedeDeshacer && s.inactivo]} disabled={!puedeDeshacer}
          onPress={() => despachar({ type: 'deshacer' })} accessibilityLabel="Deshacer" hitSlop={6}>
          <Text style={s.redondoTexto}>↶</Text>
        </Pressable>
        <Pressable style={[s.redondo, !puedeRehacer && s.inactivo]} disabled={!puedeRehacer}
          onPress={() => despachar({ type: 'rehacer' })} accessibilityLabel="Rehacer" hitSlop={6}>
          <Text style={s.redondoTexto}>↷</Text>
        </Pressable>
        <Pressable style={s.redondo} onPress={() => setMenu(v => !v)} accessibilityLabel="Más opciones" hitSlop={8}>
          <Text style={s.redondoTexto}>⋯</Text>
        </Pressable>
      </View>

      {/* Herramientas: espacios y objetos de construcción */}
      <View style={s.herramientas}>
        <Pressable style={({ pressed }) => [s.colocar, pressed && s.pulsado]} onPress={() => { setListaObras(false); setLista(v => !v); }} accessibilityRole="button">
          <Text style={s.colocarTexto}>Colocar espacio</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [s.obras, pressed && s.pulsado]} onPress={() => { setLista(false); setListaObras(v => !v); }}
          accessibilityRole="button" accessibilityLabel="Agregar objetos de construcción">
          <Text style={s.obrasTexto}>Construcción</Text>
        </Pressable>
      </View>

      {/* Lienzo: recibe los gestos; LienzoPlanta solo dibuja */}
      <View style={s.zonaLienzo} onLayout={alMedir}>
        <View style={StyleSheet.absoluteFill} {...respuesta.panHandlers}>
          {vista && lienzo.ancho > 0 && (
            <LienzoPlanta planta={editor.planta} nivel={nivel} vista={vista} ancho={lienzo.ancho} alto={lienzo.alto}
              seleccionId={sel ? String(sel.id) : null} vanoSeleccionadoId={vanoSel ? String(vanoSel.id) : null}
              vanosHuerfanos={huerfanos} referencia={nivel > 0 ? modulosDelNivel(editor.planta, nivel - 1) : undefined} />
          )}
        </View>
        {/* Pisos: "Piso 1 de 1 ▾" y su menú (visor3d.js:6428-6470) */}
        {!colocar && (
          <Pressable style={({ pressed }) => [s.piso, pressed && s.pulsado]} onPress={() => setMenuPisos(v => !v)}
            accessibilityRole="button" accessibilityLabel={`Piso ${nivel + 1} de ${r.niveles}. Cambiar o agregar pisos`}>
            <Text style={s.pisoTexto}>Piso {nivel + 1} de {r.niveles} {menuPisos ? '▴' : '▾'}</Text>
          </Pressable>
        )}
        {menuPisos && !colocar && (
          <>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuPisos(false)} accessibilityLabel="Cerrar pisos" />
            <View style={s.menuPisos}>
              {Array.from({ length: r.niveles }, (_, i) => r.niveles - 1 - i).map(i => (
                <Pressable key={i} style={({ pressed }) => [s.opcionPiso, i === nivel && s.opcionPisoActiva, pressed && s.pulsado]}
                  onPress={() => { setMenuPisos(false); if (i !== nivel) despachar({ type: 'cambiarNivel', delta: i - nivel }); }}>
                  <Text style={s.opcionTexto}>Piso {i + 1}{i === nivel ? '  (viendo)' : ''}</Text>
                  <Text style={s.opcionNota}>{modulosDelNivel(editor.planta, i).length} elementos</Text>
                </Pressable>
              ))}
              <View style={s.separador} />
              <Pressable style={({ pressed }) => [s.opcionPiso, pressed && s.pulsado]} onPress={() => { setMenuPisos(false); despachar({ type: 'agregarNivel' }); }}>
                <Text style={s.opcionTexto}>Agregar piso</Text>
                <Text style={s.opcionNota}>Vacío, arriba de todos; el de abajo se ve punteado</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [s.opcionPiso, pressed && s.pulsado]} onPress={() => { setMenuPisos(false); despachar({ type: 'duplicarNivel' }); }}>
                <Text style={s.opcionTexto}>Duplicar este piso</Text>
                <Text style={s.opcionNota}>Copia sus espacios a un piso nuevo (sin los vanos)</Text>
              </Pressable>
            </View>
          </>
        )}
        {!editor.planta.modulos.length && !colocar && (
          <View style={s.vacio} pointerEvents="none">
            <Text style={s.vacioTexto}>Toca «Colocar espacio» para empezar tu plano.</Text>
          </View>
        )}
        {vista && (
          <View style={[s.zoom, ladoZoom(sel && puedeEstirar(sel) ? posicionAsa(vista, sel) : null, lienzo.ancho, lienzo.alto) === 'izquierda' && s.zoomIzquierda]}>
            <Pressable style={({ pressed }) => [s.zoomBoton, !puedeAcercar(vista) && s.inactivo, pressed && s.pulsado]}
              disabled={!puedeAcercar(vista)} onPress={() => zoom(PASO_ZOOM)} accessibilityLabel="Acercar" hitSlop={4}>
              <Text style={s.zoomTexto}>+</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [s.zoomBoton, !puedeAlejar(vista) && s.inactivo, pressed && s.pulsado]}
              disabled={!puedeAlejar(vista)} onPress={() => zoom(1 / PASO_ZOOM)} accessibilityLabel="Alejar" hitSlop={4}>
              <Text style={s.zoomTexto}>−</Text>
            </Pressable>
          </View>
        )}
        {colocar && (
          <View style={s.modoColocar}>
            <Text style={s.modoColocarTexto} numberOfLines={2}>Toca el plano donde quieres {colocar.etiqueta}</Text>
            <Pressable style={s.cancelar} onPress={() => setColocar(null)} hitSlop={6}>
              <Text style={s.cancelarTexto}>Cancelar</Text>
            </Pressable>
          </View>
        )}
      </View>

      {aviso && <View style={s.aviso} pointerEvents="none"><Text style={s.avisoTexto}>{aviso}</Text></View>}

      {/* Espacio seleccionado: mismo dato que su etiqueta en el plano */}
      {sel && (
        <View style={s.seleccionDos}>
          <View style={s.seleccionFila}>
            {sel.imagen_piso ? <Image source={{ uri: sel.imagen_piso }} style={s.miniatura} /> : null}
            <View style={s.seleccionTexto}>
              <Text style={s.seleccionNombre} numberOfLines={1}>{nombreVisible(sel)}</Text>
              <Text style={s.seleccionMedidas} numberOfLines={3}>
                {textoMedidas(sel)}. {notaConstruccion(sel.tipo) ?? 'Arrástralo para moverlo; el círculo lo estira.'}
              </Text>
            </View>
          </View>
          <View style={s.seleccionBotones}>
            {esCuarto(sel.tipo) && (
              <Pressable style={({ pressed }) => [s.accion, s.accionPiso, pressed && s.pulsado]} onPress={() => setSelectorPisos(true)}
                accessibilityRole="button">
                <Text style={s.accionTexto}>{sel.imagen_piso ? 'Cambiar piso' : 'Colocar piso'}</Text>
              </Pressable>
            )}
            {sel.ancho !== sel.largo && (
              <Pressable style={({ pressed }) => [s.accion, pressed && s.pulsado]} onPress={() => despachar({ type: 'rotarModulo', id: String(sel.id) })}
                accessibilityRole="button" accessibilityLabel="Girar 90 grados">
                <Text style={s.accionTexto}>Girar 90°</Text>
              </Pressable>
            )}
            <Pressable style={({ pressed }) => [s.accion, s.borrar, pressed && s.pulsado]} onPress={() => despachar({ type: 'eliminarModulo', id: String(sel.id) })}
              accessibilityRole="button">
              <Text style={s.borrarTexto}>Borrar</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Vano seleccionado: panel compacto y, al desplegarlo, ancho, posición, alto y puerta (1b-3b) */}
      {vanoSel && (() => {
        const b = nombreDe(vanoSel.modulo_b);
        const donde = b ? `entre ${nombreDe(vanoSel.modulo_a) ?? 'un espacio'} y ${b}` : `en ${nombreDe(vanoSel.modulo_a) ?? 'un espacio'}, hacia afuera`;
        return (
          <PanelVano vano={vanoSel} donde={donde} huerfano={huerfanos.has(String(vanoSel.id))} despachar={despachar}
            expandido={ajustesVano} onExpandir={setAjustesVano} />
        );
      })()}

      {/* Barra inferior */}
      <View style={[s.barra, { paddingBottom: m.abajo }]}>
        <Boton texto="Ajustar vista" onPress={ajustarVista} />
        <Boton texto="Generar 3D" principal onPress={() => {
          if (!editor.planta.modulos.length) avisar('Coloca al menos un espacio para generar el 3D.');
          else p.onGenerar3D();
        }} />
      </View>

      {lista && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLista(false)} accessibilityLabel="Cerrar lista" />
          <View style={[s.lista, { top: m.arriba + 116 }]}>
            {ESPACIOS.map(pz => (
              <Pressable key={pz.etiqueta} style={({ pressed }) => [s.pieza, pressed && s.pulsado]} onPress={() => elegirEspacio(pz)}>
                <Text style={s.piezaTexto} numberOfLines={1}>{pz.etiqueta}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {listaObras && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setListaObras(false)} accessibilityLabel="Cerrar construcción" />
          <ScrollView style={[s.lista, s.listaObras, { top: m.arriba + 108 }]} contentContainerStyle={{ gap: 8 }}>
            {['Muros', 'Estructura', 'Exteriores'].map(g => (
              <View key={g} style={{ gap: 8 }}>
                <Text style={s.grupo}>{g.toUpperCase()}</Text>
                {CONSTRUCCION.filter(c => c.grupo === g).map(c => (
                  <Pressable key={c.tipo} style={({ pressed }) => [s.obra, pressed && s.pulsado]} onPress={() => elegirEspacio(c)} accessibilityRole="button">
                    <Text style={s.piezaTexto}>{c.etiqueta}</Text>
                    <Text style={[s.estado3D, c.estado3D === 'si' ? s.si3D : c.estado3D === 'parcial' ? s.parcial3D : s.no3D]}>{c.nota3D}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </>
      )}

      {selectorPisos && sel && (
        <>
          <Pressable style={[StyleSheet.absoluteFill, s.velo]} onPress={() => setSelectorPisos(false)} accessibilityLabel="Cerrar pisos" />
          <SelectorPisos nombreEspacio={nombreVisible(sel)} pisoActual={sel.imagen_piso}
            onElegir={url => { despachar({ type: 'actualizarModulo', id: String(sel.id), cambios: { imagen_piso: url } }); setSelectorPisos(false); }}
            onQuitar={() => { despachar({ type: 'actualizarModulo', id: String(sel.id), cambios: { imagen_piso: null } }); setSelectorPisos(false); }}
            onCerrar={() => setSelectorPisos(false)} />
        </>
      )}

      {menu && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} accessibilityLabel="Cerrar menú" />
          <View style={[s.menu, { top: m.arriba + 52 }]}>
            <Opcion texto="Empezar plano nuevo" onPress={planoNuevo} />
            <View style={s.separador} />
            <Opcion texto="Cargar un ejemplo" nota="Reemplaza el plano actual" onPress={() => { setMenu(false); p.onOtroEjemplo(); }} />
            <View style={s.separador} />
            <Opcion texto="AR versión anterior" nota="Abre la cámara con el editor sobre la mesa" onPress={() => { setMenu(false); p.onAbrirARAnterior(); }} />
          </View>
        </>
      )}
    </View>
  );
}

function Opcion({ texto, nota, onPress }: { texto: string; nota?: string; onPress: () => void }) {
  return (
    <Pressable style={s.opcion} onPress={onPress}>
      <Text style={s.opcionTexto}>{texto}</Text>
      {nota && <Text style={s.opcionNota}>{nota}</Text>}
    </Pressable>
  );
}

function Boton({ texto, onPress, principal, inactivo }: { texto: string; onPress: () => void; principal?: boolean; inactivo?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled: !!inactivo }}
      style={({ pressed }) => [s.boton, principal && s.botonPrincipal, inactivo && s.inactivo, pressed && s.pulsado]}>
      <Text style={s.botonTexto} numberOfLines={1}>{texto}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: T.panel },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingBottom: 10 },
  cabeceraTexto: { flex: 1, paddingRight: 4 },
  titulo: { color: T.texto, fontSize: 20, fontWeight: '700' },
  subtitulo: { color: T.textoSuave, fontSize: 13, marginTop: 3, fontVariant: ['tabular-nums'] },
  herramientas: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12 },
  colocar: { minHeight: 42, borderRadius: 12, backgroundColor: T.acento, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  colocarTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  obras: { minHeight: 42, borderRadius: 12, backgroundColor: T.boton, borderWidth: 1, borderColor: '#4A5268', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 16 },
  obrasTexto: { color: T.texto, fontSize: 15, fontWeight: '700' },
  zoom: { position: 'absolute', right: 12, bottom: 12, gap: 8 },
  zoomIzquierda: { right: undefined, left: 12 },
  zoomBoton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#222838E6', borderWidth: 1, borderColor: '#39415A',
    alignItems: 'center', justifyContent: 'center' },
  zoomTexto: { color: T.texto, fontSize: 26, fontWeight: '500', marginTop: -2 },
  redondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.boton, alignItems: 'center', justifyContent: 'center' },
  redondoTexto: { color: T.texto, fontSize: 22, marginTop: -3 },
  zonaLienzo: { flex: 1, backgroundColor: T.fondo },
  piso: { position: 'absolute', top: 10, left: 10, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center',
    backgroundColor: '#222838E6', borderWidth: 1, borderColor: '#39415A' },
  pisoTexto: { color: T.texto, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  menuPisos: { position: 'absolute', top: 56, left: 10, width: 280, backgroundColor: '#20263A', borderRadius: 14, paddingVertical: 6 },
  opcionPiso: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  opcionPisoActiva: { backgroundColor: '#2C3450' },
  vacio: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 40 },
  vacioTexto: { color: T.textoSuave, fontSize: 16, textAlign: 'center', lineHeight: 22 },
  modoColocar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#2A2350', borderColor: T.acento, borderWidth: 1, borderRadius: 14, paddingLeft: 14, paddingRight: 6, paddingVertical: 6 },
  modoColocarTexto: { flex: 1, color: T.texto, fontSize: 15 },
  cancelar: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: T.boton },
  cancelarTexto: { color: T.texto, fontSize: 14, fontWeight: '600' },
  aviso: { position: 'absolute', left: 18, right: 18, bottom: 170, backgroundColor: '#2A3145', borderRadius: 12, padding: 12 },
  avisoTexto: { color: T.texto, fontSize: 14, textAlign: 'center' },
  seleccionTexto: { flex: 1 },
  seleccionNombre: { color: T.texto, fontSize: 16, fontWeight: '700' },
  seleccionMedidas: { color: T.textoSuave, fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  seleccionDos: { paddingHorizontal: 14, paddingTop: 10, gap: 8, backgroundColor: T.panel },
  seleccionFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniatura: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#2C3348' },
  seleccionBotones: { flexDirection: 'row', gap: 8 },
  accion: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: T.boton, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  accionPiso: { backgroundColor: '#2D2A4A', borderWidth: 1, borderColor: T.acento },
  accionTexto: { color: T.texto, fontSize: 14.5, fontWeight: '600' },
  velo: { backgroundColor: '#00000066' },
  borrar: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#3A2228', alignItems: 'center', justifyContent: 'center' },
  borrarTexto: { color: '#FCA5A5', fontSize: 15, fontWeight: '600' },
  barra: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 12, backgroundColor: T.panel },
  boton: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: T.boton, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  botonPrincipal: { backgroundColor: T.acento },
  inactivo: { opacity: 0.45 },
  pulsado: { opacity: 0.7 },
  botonTexto: { color: T.texto, fontSize: 15, fontWeight: '600' },
  lista: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    backgroundColor: '#20263A', borderRadius: 16, padding: 10 },
  listaObras: { maxHeight: 460, flexDirection: 'column', flexWrap: 'nowrap' },
  grupo: { color: T.textoSuave, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.8, marginTop: 4, marginLeft: 4 },
  obra: { minHeight: 52, borderRadius: 12, backgroundColor: T.boton, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  estado3D: { fontSize: 12.5, marginTop: 3 },
  si3D: { color: '#86EFAC' },
  parcial3D: { color: '#FCD34D' },
  no3D: { color: T.textoSuave },
  pieza: { width: '48.5%', minHeight: 50, borderRadius: 12, backgroundColor: T.boton, justifyContent: 'center', paddingHorizontal: 14 },
  piezaTexto: { color: T.texto, fontSize: 16 },
  menu: { position: 'absolute', right: 14, width: 270, backgroundColor: '#20263A', borderRadius: 14, paddingVertical: 6 },
  opcion: { paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  opcionTexto: { color: T.texto, fontSize: 16 },
  opcionNota: { color: T.textoSuave, fontSize: 12.5, marginTop: 3 },
  separador: { height: StyleSheet.hairlineWidth, backgroundColor: '#39415A', marginHorizontal: 12 },
});
