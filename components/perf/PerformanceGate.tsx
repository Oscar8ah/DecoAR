import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  DETECTION_CONNECTED, DeviceInfo, DeviceProfile, TIERS, TIER_SPECS, Tier, warningFor, warningText,
} from './perfModel';
import type { Countdown } from './usePerformance';

const CLASS_LABEL = { low: 'básico', mid: 'medio', high: 'alto', unknown: 'sin determinar' } as const;

interface GateProps {
  visible: boolean;
  /** true = pantalla de inicio (fondo sólido). false = hoja sobre la cámara, a mitad de sesión. */
  opaque: boolean;
  info: DeviceInfo;
  profile: DeviceProfile;
  benchmarkMs: number | null;
  initialTier: Tier;
  notice: string | null;
  simulateLoad: boolean;
  onSimulateLoad: (v: boolean) => void;
  onConfirm: (t: Tier) => void;
  onCancel?: () => void;
}

/** Pantalla "antes de empezar": estima el celular, deja escoger nivel y advierte si es demasiado. */
export function PerformanceGate(p: GateProps) {
  const [tier, setTier] = useState<Tier>(p.initialTier);
  useEffect(() => { if (p.visible) setTier(p.initialTier); }, [p.visible, p.initialTier]);
  if (!p.visible) return null;

  const warn = warningFor(p.profile.recommended, tier);
  const warnMsg = warningText(warn, tier);
  const name = p.info.modelName ?? p.info.modelId ?? 'Modelo desconocido';
  const ram = p.info.totalMemoryBytes ? `${(p.info.totalMemoryBytes / 1024 ** 3).toFixed(1)} GB de RAM` : null;

  return (
    <View style={[s.root, p.opaque ? s.rootOpaque : s.rootSheet]}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Rendimiento</Text>
        <Text style={s.sub}>Escoge qué tanto quieres que DecoAR le exija a tu celular.</Text>

        {p.notice && <View style={[s.box, s.boxRed]}><Text style={s.boxText}>{p.notice}</Text></View>}

        <View style={s.box}>
          <Text style={s.boxTitle}>Tu celular: {name}{ram ? ` · ${ram}` : ''}</Text>
          <Text style={s.boxText}>
            Rendimiento estimado: {CLASS_LABEL[p.profile.deviceClass]} · Recomendado: {TIER_SPECS[p.profile.recommended].label}
          </Text>
          <Text style={s.small}>{p.profile.reason}</Text>
          <Text style={s.small}>
            Prueba de velocidad: {p.benchmarkMs === null ? 'midiendo…' : `${p.benchmarkMs} ms`} (se muestra para calibrar; todavía no decide nada)
          </Text>
        </View>

        <View style={s.pills}>
          {TIERS.map(t => (
            <View key={t} style={s.pillCol}>
              <TouchableOpacity style={[s.pill, tier === t && s.pillOn]} onPress={() => setTier(t)}>
                <Text style={s.pillText}>{TIER_SPECS[t].label}</Text>
              </TouchableOpacity>
              <Text style={s.rec}>{t === p.profile.recommended ? '★ recomendado' : ' '}</Text>
            </View>
          ))}
        </View>

        <Text style={s.desc}>{TIER_SPECS[tier].summary}</Text>

        {warnMsg && (
          <View style={[s.box, warn === 'risky' ? s.boxRed : s.boxAmber]}>
            <Text style={s.boxText}>{warn === 'risky' ? '⚠️ ' : '⚡ '}{warnMsg}</Text>
          </View>
        )}

        {!DETECTION_CONNECTED && (
          <Text style={s.small}>
            Aviso: el reconocimiento de objetos todavía no está conectado. Los niveles ya miden y protegen la
            fluidez de tu celular, pero por ahora no cambian lo que ves.
          </Text>
        )}

        {__DEV__ && (
          <View style={s.devRow}>
            <Text style={s.small}>Simular celular lento (solo pruebas)</Text>
            <Switch value={p.simulateLoad} onValueChange={p.onSimulateLoad} />
          </View>
        )}

        <TouchableOpacity style={s.go} onPress={() => p.onConfirm(tier)}>
          <Text style={s.goText}>{p.opaque ? 'Entrar' : 'Aplicar'}</Text>
        </TouchableOpacity>
        {p.onCancel && (
          <TouchableOpacity style={s.cancel} onPress={p.onCancel}>
            <Text style={s.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

/** Aviso con cuenta regresiva: aparece cuando el celular se está ahogando. */
export function PerformanceBanner({ countdown, onNow }: { countdown: Countdown; onNow: () => void }) {
  const target = countdown.target;
  const exit = target === 'exit';
  const msg = target === 'exit'
    ? 'Tu celular no logra mantener la fluidez. Volvemos al inicio'
    : `Tu celular va lento. Bajamos a ${TIER_SPECS[target].label}`;
  return (
    <View style={s.banner}>
      <Text style={s.bannerText}>{msg} en {countdown.secondsLeft} s…</Text>
      <TouchableOpacity style={s.bannerBtn} onPress={onNow}>
        <Text style={s.bannerBtnText}>{exit ? 'Volver ya' : 'Bajar ya'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, elevation: 20 },
  rootOpaque: { backgroundColor: '#0b0b12' },
  rootSheet: { backgroundColor: 'rgba(11,11,18,0.94)' },
  content: { paddingTop: 80, paddingHorizontal: 20, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  sub: { color: '#c4c4d4', fontSize: 14, marginTop: 6, marginBottom: 18 },

  box: { backgroundColor: '#14141f', borderColor: '#2a2a3d', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  boxAmber: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.6)' },
  boxRed: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.6)' },
  boxTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  boxText: { color: '#e5e7eb', fontSize: 13, lineHeight: 18 },
  small: { color: '#9ca3af', fontSize: 11, lineHeight: 16, marginTop: 6 },

  pills: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pillCol: { flex: 1, alignItems: 'center' },
  pill: { alignSelf: 'stretch', paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#14141f', borderWidth: 1, borderColor: '#2a2a3d' },
  pillOn: { backgroundColor: '#3b2a6b', borderColor: '#7c5cff' },
  pillText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rec: { color: '#a78bfa', fontSize: 9, marginTop: 4, fontWeight: '600' },

  desc: { color: '#e5e7eb', fontSize: 14, marginVertical: 12, lineHeight: 20 },
  devRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },

  go: { marginTop: 22, backgroundColor: '#7c5cff', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  goText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  cancel: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#c4c4d4', fontSize: 14, fontWeight: '600' },

  banner: {
    position: 'absolute', top: 118, left: 12, right: 12, zIndex: 15, elevation: 15,
    backgroundColor: 'rgba(180,83,9,0.92)', borderRadius: 14, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  bannerText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },
  bannerBtn: { backgroundColor: 'rgba(0,0,0,0.35)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  bannerBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});