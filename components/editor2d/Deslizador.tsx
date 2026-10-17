/**
 * Controles deslizables táctiles, sin dependencias: React Native ya no trae un Slider nativo y
 * @react-native-community/slider sería una dependencia nueva. Hechos con View + PanResponder.
 *
 *   · Capturan el gesto (…Capture y sin ceder el control) para que deslizar nunca mueva el plano
 *     ni haga desplazarse el panel que los contiene.
 *   · onInicio / onFin envuelven todo el deslizamiento: la pantalla los usa para enviar iniciarGesto y
 *     terminarGesto, así un deslizamiento completo es UN paso de deshacer.
 *   · Los hijos no reciben toques (pointerEvents="none"): locationX siempre es relativo al control.
 */
import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { deFraccion, fraccion } from './ajustesVano';

const ALTO_TOQUE = 44;      // pt: objetivo táctil mínimo de iOS
const PULGAR = 26;
const MARGEN = PULGAR / 2;  // el pulgar no se sale del control

interface PropsDeslizador {
  valor: number; min: number; max: number;
  /** Ajusta el valor leído del dedo (paso, límites). */
  cuantizar: (v: number) => number;
  onCambio: (v: number) => void;
  onInicio?: () => void;
  onFin?: () => void;
  color: string;
  etiqueta: string;          // para accesibilidad
  deshabilitado?: boolean;
  /** Para VoiceOver: cuánto sube o baja con cada gesto de ajuste. */
  pasoAccesible: number;
}

/** Deslizador de un valor (ancho, alto, ángulo). Tocar en cualquier punto salta a ese valor. */
export function Deslizador(p: PropsDeslizador) {
  const [ancho, setAncho] = useState(0);
  const props = useRef(p); props.current = p;
  const anchoRef = useRef(0); anchoRef.current = ancho;
  const leer = (x: number) => {
    const w = Math.max(1, anchoRef.current - 2 * MARGEN);
    const q = props.current;
    return q.cuantizar(deFraccion((x - MARGEN) / w, q.min, q.max));
  };
  const ultimo = useRef<number | null>(null);
  const enviar = (v: number) => { if (v !== ultimo.current) { ultimo.current = v; props.current.onCambio(v); } };
  const respuesta = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !props.current.deshabilitado,
    onStartShouldSetPanResponderCapture: () => !props.current.deshabilitado,
    onMoveShouldSetPanResponderCapture: () => !props.current.deshabilitado,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => { ultimo.current = props.current.valor; props.current.onInicio?.(); enviar(leer(e.nativeEvent.locationX)); },
    onPanResponderMove: e => enviar(leer(e.nativeEvent.locationX)),
    onPanResponderRelease: () => props.current.onFin?.(),
    onPanResponderTerminate: () => props.current.onFin?.(),
  })).current;

  const f = fraccion(p.valor, p.min, p.max);
  const x = MARGEN + f * Math.max(0, ancho - 2 * MARGEN);
  return (
    <View
      style={[s.control, p.deshabilitado && s.deshabilitado]}
      onLayout={e => setAncho(e.nativeEvent.layout.width)}
      accessible accessibilityRole="adjustable" accessibilityLabel={p.etiqueta}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => {
        if (p.deshabilitado) return;
        const d = e.nativeEvent.actionName === 'increment' ? p.pasoAccesible : -p.pasoAccesible;
        p.onInicio?.(); p.onCambio(p.cuantizar(p.valor + d)); p.onFin?.();
      }}
      {...respuesta.panHandlers}>
      <View pointerEvents="none" style={s.riel} />
      <View pointerEvents="none" style={[s.relleno, { left: MARGEN, width: Math.max(0, x - MARGEN), backgroundColor: p.color }]} />
      <View pointerEvents="none" style={[s.pulgar, { left: x - PULGAR / 2, borderColor: p.color }]} />
    </View>
  );
}

interface PropsMuro {
  /** Tramo del muro compartido y el vano sobre él, en metros a lo largo del muro. */
  ini: number; fin: number; centro: number; anchoVano: number;
  extremos: [string, string];
  onMover: (u: number) => void;
  onInicio?: () => void;
  onFin?: () => void;
  color: string;
}

/**
 * El muro dibujado como una barra y el vano como el tramo que ocupa. Arrastrar el tramo lo desliza;
 * tocar fuera de él lo lleva ahí. Cada valor se envía tal cual: moverVano (reductor) lo limita al tramo.
 */
export function PosicionEnMuro(p: PropsMuro) {
  const [ancho, setAncho] = useState(0);
  const props = useRef(p); props.current = p;
  const anchoRef = useRef(0); anchoRef.current = ancho;
  const inicio = useRef<{ centro: number; agarrado: boolean; x0: number } | null>(null);
  const metrosPorPunto = () => (props.current.fin - props.current.ini) / Math.max(1, anchoRef.current);
  const respuesta = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => {
      const q = props.current, x = e.nativeEvent.locationX;
      const u = q.ini + x * metrosPorPunto();
      const agarrado = Math.abs(u - q.centro) <= q.anchoVano / 2 + 8 * metrosPorPunto();   // 8 pt de margen para el dedo
      inicio.current = { centro: q.centro, agarrado, x0: x };
      q.onInicio?.();
      if (!agarrado) q.onMover(u);
    },
    onPanResponderMove: (e, g) => {
      const i = inicio.current, q = props.current;
      if (!i) return;
      q.onMover(i.agarrado ? i.centro + g.dx * metrosPorPunto() : q.ini + e.nativeEvent.locationX * metrosPorPunto());
    },
    onPanResponderRelease: () => { inicio.current = null; props.current.onFin?.(); },
    onPanResponderTerminate: () => { inicio.current = null; props.current.onFin?.(); },
  })).current;

  const k = ancho / Math.max(1e-6, p.fin - p.ini);
  const izq = (p.centro - p.anchoVano / 2 - p.ini) * k;
  return (
    <View>
      <View style={s.muro} onLayout={e => setAncho(e.nativeEvent.layout.width)}
        accessible accessibilityRole="adjustable" accessibilityLabel={`Posición del vano entre ${p.extremos[0]} y ${p.extremos[1]}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => { p.onInicio?.(); p.onMover(p.centro + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)); p.onFin?.(); }}
        {...respuesta.panHandlers}>
        <View pointerEvents="none" style={s.pared} />
        <View pointerEvents="none" style={[s.hueco, { left: izq, width: Math.max(6, p.anchoVano * k), backgroundColor: p.color }]} />
      </View>
      <View style={s.extremos} pointerEvents="none">
        <Text style={s.extremo}>{p.extremos[0]}</Text>
        <Text style={s.extremo}>{p.extremos[1]}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  control: { height: ALTO_TOQUE, justifyContent: 'center' },
  deshabilitado: { opacity: 0.35 },
  riel: { position: 'absolute', left: MARGEN, right: MARGEN, height: 4, borderRadius: 2, backgroundColor: '#39415A' },
  relleno: { position: 'absolute', height: 4, borderRadius: 2 },
  pulgar: { position: 'absolute', width: PULGAR, height: PULGAR, borderRadius: PULGAR / 2, backgroundColor: '#FFFFFF', borderWidth: 3 },
  muro: { height: ALTO_TOQUE, justifyContent: 'center' },
  pared: { position: 'absolute', left: 0, right: 0, height: 14, borderRadius: 3, backgroundColor: '#4A5268' },
  hueco: { position: 'absolute', height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#FFFFFF' },
  extremos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  extremo: { color: '#98A1B7', fontSize: 12 },
});
