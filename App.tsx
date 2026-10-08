import React, { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import RoomScanScene from './components/ar/RoomScanScene';
import type { RoomModel, Vec3 } from './components/ar/spatial/roomModel';
import { drawReducer, drawStats, initialDrawState, snapReticle } from './components/ar/draw/drawModel';

type Mode = 'auto' | 'draw';

export default function App() {
  const navRef = useRef<any>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [room, setRoom] = useState<RoomModel | null>(null);
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const [reticle, setReticle] = useState<Vec3 | null>(null);
  const [drawState, dispatch] = useReducer(drawReducer, undefined, initialDrawState);
  const [toast, setToast] = useState<string | null>(null);

  const onDragEdge = useCallback((edge: number, amount: number) => dispatch({ type: 'dragEdge', edge, amount }), []);

  const appProps = useMemo(() => ({
    onRoomModel: setRoom,
    onDiagnostics: setDiag,
    onReticle: setReticle,
    onDragEdge,
    mode,
    drawState,
    reticle,
  }), [mode, drawState, reticle, onDragEdge]);

  const stats = drawStats(drawState, reticle);
  const floorReady = !!room?.floor;
  const walls = (room?.walls ?? []).filter(w => w.confidence >= 0.5);

  const showToast = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2200); };

  const capture = async () => {
    try {
      const r = await navRef.current?._takeScreenshot(`decoar_${Date.now()}`, true);
      showToast(r?.success ? 'Captura guardada en Fotos' : `No se pudo guardar (${r?.errorCode ?? '?'})`);
    } catch (e) {
      showToast('No se pudo tomar la captura');
    }
  };

  const plus = () => {
    const { point } = snapReticle(drawState, reticle);
    if (point) dispatch({ type: 'add', point });
  };
  const canPlus = mode === 'draw' && floorReady && !!reticle && drawState.phase !== 'floorDone';

  // ─── Textos de ayuda ───
  let hint: string;
  if (mode === 'auto') {
    hint = !room?.floor ? 'Apunta al piso y mueve el teléfono despacio'
      : room.walls.length === 0 ? 'Piso listo. Ahora recorre las paredes'
      : room.corners.length === 0 ? 'Muestra una esquina (dos paredes juntas)'
      : room.heightEstimate.source !== 'ceiling' ? 'Inclina hacia el techo para medir la altura exacta'
      : 'Habitación reconstruida';
  } else if (!floorReady) {
    hint = 'Primero apunta al piso hasta que se detecte';
  } else if (!reticle && drawState.phase !== 'floorDone') {
    hint = 'Apunta la mira al piso';
  } else if (drawState.phase === 'floor') {
    hint = stats.points === 0 ? 'Apunta a una esquina del piso y presiona +'
      : stats.snapped ? 'Presiona + para cerrar la forma'
      : 'Apunta a la siguiente esquina y presiona +';
  } else if (drawState.phase === 'hole') {
    hint = stats.points === 0 ? 'Apunta a una esquina de la base del objeto y presiona +'
      : stats.snapped ? 'Presiona + para cerrar el objeto'
      : 'Rodea la base del objeto y presiona + en cada esquina';
  } else {
    hint = 'Arrastra los puntos azules para estirar un lado, o marca un objeto';
  }

  // ─── Botón contextual a la izquierda del "+" ───
  let chip: { label: string; onPress: () => void } | null = null;
  if (mode === 'draw') {
    if (drawState.phase === 'floor' && stats.points >= 3) chip = { label: 'Cerrar forma', onPress: () => dispatch({ type: 'close' }) };
    else if (drawState.phase === 'floorDone') chip = { label: 'Marcar objeto', onPress: () => dispatch({ type: 'startHole' }) };
    else if (drawState.phase === 'hole') chip = stats.points >= 3
      ? { label: 'Cerrar objeto', onPress: () => dispatch({ type: 'close' }) }
      : { label: 'Cancelar', onPress: () => dispatch({ type: 'cancelHole' }) };
  }

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        ref={navRef}
        initialScene={{ scene: RoomScanScene as any }}
        viroAppProps={appProps}
        style={styles.flex}
      />

      {/* Arriba: deshacer y borrar (modo Dibujar) */}
      {mode === 'draw' && (
        <>
          <TouchableOpacity style={[styles.round, styles.topLeft]} onPress={() => dispatch({ type: 'undo' })}>
            <Text style={styles.roundIcon}>↶</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.round, styles.topRight]} onPress={() => dispatch({ type: 'reset' })}>
            <Text style={styles.roundIcon}>🗑</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Mira central (modo Dibujar) */}
      {mode === 'draw' && drawState.phase !== 'floorDone' && (
        <View style={styles.crosshairWrap} pointerEvents="none">
          <View style={[styles.crosshair, stats.snapped && styles.crosshairSnap, !reticle && styles.crosshairOff]}>
            <View style={[styles.crosshairDot, stats.snapped && styles.crosshairDotSnap]} />
          </View>
        </View>
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none"><Text style={styles.toastText}>{toast}</Text></View>
      )}

      {/* Abajo: panel, controles y selector de modo */}
      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.hud} pointerEvents="none">
          <Text style={styles.hint}>{hint}</Text>
          {mode === 'draw' && stats.message && <Text style={styles.warn}>{stats.message}</Text>}
          {mode === 'draw' ? (
            <Text style={styles.line}>
              {stats.liveLength !== null ? `Lado: ${fmt(stats.liveLength)}   ` : ''}
              {drawState.floor
                ? `Área: ${stats.floorArea.toFixed(2)} m²   Perímetro: ${stats.floorPerimeter.toFixed(2)} m   Objetos: ${stats.holes}`
                : `Puntos: ${stats.points}`}
            </Text>
          ) : (
            <>
              <Text style={styles.line}>
                Piso: {room?.floor ? `${room.floor.area.toFixed(2)} m²` : '—'}   Paredes: {walls.length}   Esquinas: {room?.corners.length ?? 0}
              </Text>
              <Text style={styles.line}>
                Altura: {heightLabel(room)}   Puertas: {room?.openings.filter(o => o.type === 'door').length ?? 0}   Muebles: {room?.objects.length ?? 0}
              </Text>
              <Text style={styles.diag}>Profundidad: {diag ? JSON.stringify(diag) : 'consultando…'}</Text>
            </>
          )}
        </View>

        <View style={styles.controls} pointerEvents="box-none">
          <View style={styles.side}>
            {chip && (
              <TouchableOpacity style={styles.chip} onPress={chip.onPress}>
                <Text style={styles.chipText}>{chip.label}</Text>
              </TouchableOpacity>
            )}
          </View>
          {mode === 'draw' ? (
            <TouchableOpacity style={[styles.plus, !canPlus && styles.plusOff]} disabled={!canPlus} onPress={plus}>
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          ) : <View style={styles.plusSpacer} />}
          <View style={[styles.side, { alignItems: 'flex-end' }]}>
            <TouchableOpacity style={styles.shutter} onPress={capture}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.segment}>
          {(['auto', 'draw'] as Mode[]).map(m => (
            <TouchableOpacity key={m} style={[styles.segBtn, mode === m && styles.segBtnOn]} onPress={() => setMode(m)}>
              <Text style={styles.segIcon}>{m === 'auto' ? '◎' : '✎'}</Text>
              <Text style={[styles.segText, mode === m && styles.segTextOn]}>{m === 'auto' ? 'Automático' : 'Dibujar'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const fmt = (m: number) => (m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(2)} m`);

function heightLabel(room: RoomModel | null): string {
  if (!room?.floor) return '—';
  const { value, source } = room.heightEstimate;
  if (source === 'ceiling') return `${value.toFixed(2)} m`;
  if (source === 'observed-top') return `≥ ${value.toFixed(2)} m`;
  return `≈ ${value.toFixed(2)} m`;
}

const glass = 'rgba(40,40,40,0.55)';
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },

  round: { position: 'absolute', top: 60, width: 46, height: 46, borderRadius: 23, backgroundColor: glass, alignItems: 'center', justifyContent: 'center' },
  topLeft: { left: 18 },
  topRight: { right: 18 },
  roundIcon: { color: '#fff', fontSize: 22 },

  crosshairWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  crosshair: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  crosshairSnap: { borderColor: '#FACC15', width: 46, height: 46, borderRadius: 23 },
  crosshairOff: { borderColor: 'rgba(255,255,255,0.35)' },
  crosshairDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  crosshairDotSnap: { backgroundColor: '#FACC15' },

  toast: { position: 'absolute', top: 120, alignSelf: 'center', backgroundColor: glass, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 28, alignItems: 'center' },
  hud: { alignSelf: 'stretch', marginHorizontal: 12, marginBottom: 14, padding: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)' },
  hint: { color: '#fff', fontSize: 15, fontWeight: '700' },
  warn: { color: '#FCA5A5', fontSize: 13, marginTop: 4, fontWeight: '600' },
  line: { color: '#e5e7eb', fontSize: 13, marginTop: 4 },
  diag: { color: '#fbbf24', fontSize: 10, marginTop: 4 },

  controls: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 18, marginBottom: 16 },
  side: { flex: 1 },
  chip: { alignSelf: 'flex-start', backgroundColor: glass, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20 },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  plus: { width: 78, height: 78, borderRadius: 39, backgroundColor: 'rgba(120,120,120,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  plusOff: { opacity: 0.35 },
  plusText: { color: '#fff', fontSize: 44, fontWeight: '300', marginTop: -4 },
  plusSpacer: { width: 78, height: 78 },
  shutter: { width: 62, height: 62, borderRadius: 31, borderWidth: 4, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff' },

  segment: { flexDirection: 'row', backgroundColor: glass, borderRadius: 26, padding: 4 },
  segBtn: { paddingVertical: 6, paddingHorizontal: 22, borderRadius: 22, alignItems: 'center' },
  segBtnOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  segIcon: { color: '#fff', fontSize: 16 },
  segText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  segTextOn: { color: '#fff' },
});