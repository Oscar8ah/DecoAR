import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import RoomScanScene from './components/ar/RoomScanScene';
import type { RoomModel } from './components/ar/spatial/roomModel';

export default function App() {
  const [room, setRoom] = useState<RoomModel | null>(null);
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const appProps = useMemo(() => ({ onRoomModel: setRoom, onDiagnostics: setDiag }), []);
  const walls = (room?.walls ?? []).filter(w => w.confidence >= 0.5);

  const hint = !room?.floor
    ? 'Apunta al piso y mueve el teléfono despacio'
    : room.walls.length === 0
      ? 'Piso listo. Ahora recorre las paredes'
      : room.corners.length === 0
        ? 'Muestra una esquina (dos paredes juntas)'
        : room.heightEstimate.source !== 'ceiling'
          ? 'Inclina hacia el techo para medir la altura exacta'
          : 'Habitación reconstruida';

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        initialScene={{ scene: RoomScanScene as any }}
        viroAppProps={appProps}
        style={styles.flex}
      />
      <View style={styles.hud} pointerEvents="none">
        <Text style={styles.hint}>{hint}</Text>
        <Text style={styles.line}>
          Piso: {room?.floor ? `${room.floor.area.toFixed(2)} m² (${pct(room.floor.confidence)})` : '—'}
        </Text>
        <Text style={styles.line}>
          Paredes: {walls.length}   Esquinas: {room?.corners.length ?? 0}   Altura: {heightLabel(room)}
        </Text>
        <Text style={styles.line}>
          Puertas: {room?.openings.filter(o => o.type === 'door').length ?? 0}   Ventanas:{' '}
          {room?.openings.filter(o => o.type === 'window').length ?? 0}   Muebles: {room?.objects.length ?? 0}
        </Text>
        <Text style={styles.diag}>Profundidad: {diag ? JSON.stringify(diag) : 'consultando…'}</Text>
        {walls.map(w => (
          <Text key={w.id} style={styles.small}>
            {w.id}: {w.width.toFixed(2)} m de ancho · {pct(w.confidence)}
            {w.openings.length ? ` · ${w.openings.map(o => `${o.type === 'door' ? 'puerta' : 'ventana'} ${o.width.toFixed(2)}×${o.height.toFixed(2)}`).join(', ')}` : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function heightLabel(room: RoomModel | null): string {
  if (!room?.floor) return '—';
  const { value, source } = room.heightEstimate;
  if (source === 'ceiling') return `${value.toFixed(2)} m`;
  if (source === 'observed-top') return `≥ ${value.toFixed(2)} m`;
  return `≈ ${value.toFixed(2)} m (estimada)`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  hud: {
    position: 'absolute', left: 12, right: 12, bottom: 32,
    padding: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)',
  },
  hint: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  line: { color: '#e5e7eb', fontSize: 13, marginTop: 2 },
  small: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  diag: { color: '#fbbf24', fontSize: 10, marginTop: 4 },
});