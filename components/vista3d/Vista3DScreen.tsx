/**
 * Pantalla de la maqueta 3D SIN AR (Entrega 2). AppInicio la carga con require diferido: ni ella ni
 * Viro se evalúan al abrir la app. No pide la cámara: usa Viro3DSceneNavigator (sin sesión AR).
 *
 *   Isométrica · Desde arriba · Libre (girar con un dedo)     + / −  (zoom)
 *   Piso: todos o hasta el piso N                                Avisos de fidelidad
 *   ‹ Plano                                                      Ver en AR
 */
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Viro3DSceneNavigator } from '@reactvision/react-viro';
import type { Plano } from '../plan/planModel';
import { generarMaqueta } from '../plan/planGeometry';
import {
  Mirada, Vista, avisos, encuadre, girar, miradaDe, pisosDe, puedeAcercar, puedeAlejar, sinContenido, transformacion, visibles, zoom,
} from './camara3d';
import Escena3D from './Escena3D';

const C = { fondo: '#0D1018', panel: '#161A25', boton: '#222838', texto: '#E8EBF3', suave: '#98A1B7', acento: '#7357F0' };
const COLOR_FIDELIDAD = { compatible: '#86EFAC', parcial: '#FCD34D', 'no-representado': '#FCA5A5', pendiente: '#98A1B7' } as const;
const ETIQUETA_FIDELIDAD = { compatible: 'Se ve', parcial: 'Parcial', 'no-representado': 'No se ve aún', pendiente: 'Por validar' } as const;

interface Props {
  plano: Plano;
  /** Qué cambió al generar (arcos automáticos, vanos quitados), o null si nada. */
  resumen: string | null;
  onVolver: () => void;
  onVerAR: () => void;
}

/** Si Viro falla al montar la escena, se muestra una salida en vez de una pantalla en blanco. */
class Protegido extends React.Component<{ onVolver: () => void; children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={s.centro}>
        <Text style={s.titulo}>No se pudo abrir la vista 3D</Text>
        <Text style={s.nota}>{this.state.error}</Text>
        <Pressable style={s.botonAcento} onPress={this.props.onVolver}><Text style={s.botonAcentoTexto}>Volver al plano</Text></Pressable>
      </View>
    );
  }
}

export default function Vista3DScreen({ plano, resumen, onVolver, onVerAR }: Props) {
  const { height } = useWindowDimensions();
  const arriba = Platform.OS === 'ios' ? (height >= 812 ? 59 : 22) : 28;
  const maqueta = useMemo(() => generarMaqueta(plano), [plano]);
  const enc = useMemo(() => encuadre(maqueta), [maqueta]);
  const pisos = useMemo(() => pisosDe(plano), [plano]);
  const lista = useMemo(() => avisos(maqueta, plano), [maqueta, plano]);

  const [vista, setVista] = useState<Vista>('isometrica');
  const [mirada, setMirada] = useState<Mirada>(() => miradaDe('isometrica')!);
  const [hasta, setHasta] = useState<number | null>(null);
  const [verAvisos, setVerAvisos] = useState(false);
  const [verResumen, setVerResumen] = useState(!!resumen);

  const elegirVista = (v: Vista) => {
    setVista(v);
    const m = miradaDe(v);
    if (m) setMirada(m);   // "Libre" conserva la mirada actual
  };

  // Girar con un dedo: un PanResponder propio sobre la vista (no depende de la cámara orbital de Viro).
  const miradaRef = useRef(mirada); miradaRef.current = mirada;
  const inicio = useRef<Mirada | null>(null);
  const giro = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { inicio.current = miradaRef.current; },
    onPanResponderMove: (_e, g) => {
      if (!inicio.current || g.numberActiveTouches > 1 || Math.hypot(g.dx, g.dy) < 4) return;
      setMirada(girar(inicio.current, g.dx, g.dy));
      setVista('libre');
    },
    onPanResponderRelease: () => { inicio.current = null; },
    onPanResponderTerminate: () => { inicio.current = null; },
  })).current;

  const cajas = useMemo(() => visibles(maqueta, plano, hasta), [maqueta, plano, hasta]);
  const appProps = useMemo(() => ({ cajas, transformacion: transformacion(enc, mirada) }), [cajas, enc, mirada]);

  if (sinContenido(maqueta)) {
    return (
      <View style={[s.pantalla, s.centro, { paddingTop: arriba }]}>
        <Text style={s.titulo}>No hay nada que mostrar en 3D</Text>
        <Text style={s.nota}>{maqueta.errores[0] ?? 'Coloca al menos un espacio en el plano.'}</Text>
        <Pressable style={s.botonAcento} onPress={onVolver}><Text style={s.botonAcentoTexto}>Volver al plano</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={[s.pantalla, { paddingTop: arriba }]}>
      <View style={s.barra}>
        <Pressable style={s.boton} onPress={onVolver} accessibilityRole="button" hitSlop={6}><Text style={s.botonTexto}>‹ Plano</Text></Pressable>
        <Text style={s.tituloBarra}>Vista 3D</Text>
        <Pressable style={s.botonAcento} onPress={onVerAR} accessibilityRole="button"><Text style={s.botonAcentoTexto}>Ver en AR</Text></Pressable>
      </View>

      <View style={s.vistas}>
        {([['isometrica', 'Isométrica'], ['arriba', 'Desde arriba'], ['libre', 'Libre']] as [Vista, string][]).map(([v, t]) => (
          <Pressable key={v} style={[s.vistaBoton, vista === v && s.vistaActiva]} onPress={() => elegirVista(v)}
            accessibilityRole="button" accessibilityState={{ selected: vista === v }}>
            <Text style={s.botonTexto}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.lienzo}>
        <Protegido onVolver={onVolver}>
          <Viro3DSceneNavigator style={s.lleno} initialScene={{ scene: Escena3D as any }} viroAppProps={appProps} />
        </Protegido>
        {/* Capa transparente que recibe el giro con el dedo; los botones van encima de ella */}
        <View style={StyleSheet.absoluteFill} {...giro.panHandlers} />

        <View style={s.zoom} pointerEvents="box-none">
          <Pressable style={[s.redondo, !puedeAcercar(mirada.acerca) && s.inactivo]} disabled={!puedeAcercar(mirada.acerca)}
            onPress={() => setMirada(m => ({ ...m, acerca: zoom(m.acerca, true) }))} accessibilityLabel="Acercar"><Text style={s.redondoTexto}>+</Text></Pressable>
          <Pressable style={[s.redondo, !puedeAlejar(mirada.acerca) && s.inactivo]} disabled={!puedeAlejar(mirada.acerca)}
            onPress={() => setMirada(m => ({ ...m, acerca: zoom(m.acerca, false) }))} accessibilityLabel="Alejar"><Text style={s.redondoTexto}>−</Text></Pressable>
        </View>

        {pisos > 1 && (
          <ScrollView horizontal style={s.pisos} contentContainerStyle={{ gap: 6 }} showsHorizontalScrollIndicator={false}>
            <Pressable style={[s.chip, hasta === null && s.chipActivo]} onPress={() => setHasta(null)}><Text style={s.botonTexto}>Todos</Text></Pressable>
            {Array.from({ length: pisos }, (_, i) => (
              <Pressable key={i} style={[s.chip, hasta === i && s.chipActivo]} onPress={() => setHasta(i)}>
                <Text style={s.botonTexto}>Hasta piso {i + 1}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {verResumen && resumen && (
          <Pressable style={s.resumen} onPress={() => setVerResumen(false)} accessibilityRole="button">
            <Text style={s.resumenTexto}>{resumen}</Text>
            <Text style={s.cerrarTexto}>Toca para cerrar</Text>
          </Pressable>
        )}
      </View>

      <Pressable style={s.avisosBarra} onPress={() => setVerAvisos(v => !v)} accessibilityRole="button">
        <Text style={s.botonTexto}>Qué se ve y qué no ({lista.length}) {verAvisos ? '▾' : '▴'}</Text>
        <Text style={s.nota}>Gira con un dedo{vista !== 'libre' ? ' (pasa a Libre)' : ''}</Text>
      </Pressable>
      {verAvisos && (
        <ScrollView style={{ maxHeight: Math.round(height * 0.3) }} contentContainerStyle={s.avisos}>
          {lista.length ? lista.map((a, i) => (
            <View key={i} style={s.aviso}>
              <Text style={[s.etiqueta, { color: COLOR_FIDELIDAD[a.fidelidad] }]}>{ETIQUETA_FIDELIDAD[a.fidelidad]}</Text>
              <Text style={s.avisoTexto}>{a.texto}</Text>
            </View>
          )) : <Text style={s.nota}>Todo lo del plano se dibuja en esta maqueta.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.panel },
  lleno: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, backgroundColor: C.panel },
  titulo: { color: C.texto, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  nota: { color: C.suave, fontSize: 13, textAlign: 'center' },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10 },
  tituloBarra: { flex: 1, color: C.texto, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  boton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.boton, justifyContent: 'center' },
  botonTexto: { color: C.texto, fontSize: 14.5, fontWeight: '600' },
  botonAcento: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.acento, justifyContent: 'center' },
  botonAcentoTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  vistas: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  vistaBoton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.boton, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  vistaActiva: { borderColor: C.acento, backgroundColor: '#2D2A4A' },
  lienzo: { flex: 1, backgroundColor: C.fondo },
  zoom: { position: 'absolute', right: 12, bottom: 12, gap: 8 },
  redondo: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#222838E6', borderWidth: 1, borderColor: '#39415A', alignItems: 'center', justifyContent: 'center' },
  redondoTexto: { color: C.texto, fontSize: 26, marginTop: -2 },
  inactivo: { opacity: 0.4 },
  pisos: { position: 'absolute', left: 12, right: 70, bottom: 12, flexGrow: 0 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: '#222838E6', borderWidth: 1, borderColor: '#39415A', justifyContent: 'center' },
  chipActivo: { borderColor: C.acento, backgroundColor: '#2D2A4AE6' },
  resumen: { position: 'absolute', top: 12, left: 12, right: 12, backgroundColor: '#2A2350F2', borderColor: C.acento, borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  resumenTexto: { color: C.texto, fontSize: 14 },
  cerrarTexto: { color: C.suave, fontSize: 12 },
  avisosBarra: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 2, backgroundColor: C.panel },
  avisos: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  aviso: { gap: 2 },
  etiqueta: { fontSize: 12, fontWeight: '700' },
  avisoTexto: { color: C.texto, fontSize: 13.5, lineHeight: 19 },
});
