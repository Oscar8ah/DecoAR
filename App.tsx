import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import RoomScanScene from './components/ar/RoomScanScene';
import MaquetaScene from './components/ar/MaquetaScene';
import { Plano, planoDemo, planoApartamentoSintetico } from './components/plan/planModel';
// E2: editor de planta sobre la mesa
import EditorMesa from './components/ar/EditorMesa';
import EditorPanel, { PALETA } from './components/plan/EditorPanel';
import { AccionEditor, EditorPlanta, editorVacio, reducirEditor } from './components/plan/planEditor';
import { ContextoMesa, avisoEspacio, extensionPlanta } from './components/plan/editorMesaGeom';
import { PLANO_REAL_1, PLANO_REAL_2 } from './components/plan/planosReales';

// EJEMPLOS opcionales (botón "Ejemplo"): se cargan EN el editor y se pueden seguir editando.
// Lo principal es dibujar desde una planta vacía.
const PLANOS_MAQUETA: { nombre: string; crear: () => Plano }[] = [
  { nombre: 'Sala',                     crear: () => planoDemo(4, 3, 2.5) },
  { nombre: 'Apto de prueba (sintético)', crear: () => planoApartamentoSintetico() },
  { nombre: 'Plano real 1',             crear: () => PLANO_REAL_1 },
  { nombre: 'Plano real 2',             crear: () => PLANO_REAL_2 },
];
import type { RoomModel, Vec3 } from './components/ar/spatial/roomModel';
import { drawReducer, drawStats, initialDrawState, snapReticle } from './components/ar/draw/drawModel';
import { PerformanceBanner, PerformanceGate } from './components/perf/PerformanceGate';
import { TIER_SPECS, Tier } from './components/perf/perfModel';
import { useDeviceProfile, usePerformanceGovernor } from './components/perf/usePerformance';

type Mode = 'auto' | 'draw' | 'maqueta';

// ─── FASE 1A: prueba de profundidad (reversible) ───
// Interruptor maestro. false = no se muestra el botón y la app queda como antes de esta prueba.
const DEPTH_TEST_UI = true;
// Ciclo del botón: apagada → activa (solo estima profundidad, NO dibuja oclusión) → activa + mapa de profundidad en pantalla.
type DepthMode = 'off' | 'on' | 'debug';
const DEPTH_WAIT_LIMIT_S = 20;   // pasado este tiempo sin 'lista', el botón dice "sin datos"

// ─── FLOOR_DIAG: diagnóstico TEMPORAL del piso (solo observa; ver runFloorDiag en RoomScanScene.tsx) ───
// Interruptor maestro. false = sin botón, nada se envía a la escena y no existe ninguna salida [FLOORDBG].
const FLOOR_DIAG = true;

// ─── HOLES_AUTO: los objetos marcados en Dibujar también recortan el piso del modo Automático ───
// Interruptor maestro. false = el piso automático se dibuja exactamente como antes (sin recortes).
const HOLES_AUTO = true;

// ─── SHADER_TEST: experimento mínimo de acceso a la cámara desde un shader ───
// Interruptor maestro. false = el piso usa 'roomFloor' exactamente como siempre y no hay botón.
const SHADER_TEST = true;

export default function App() {
  const navRef = useRef<any>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [room, setRoom] = useState<RoomModel | null>(null);
  const [, setDiag] = useState<Record<string, unknown> | null>(null);   // FASE 1A: ya no se muestra (era engañoso)
  const [reticle, setReticle] = useState<Vec3 | null>(null);
  const [drawState, dispatch] = useReducer(drawReducer, undefined, initialDrawState);
  const [toast, setToast] = useState<string | null>(null);

  // ─── Rendimiento: pantalla de inicio, nivel y vigilante ───
  const { info, profile, benchmarkMs } = useDeviceProfile();
  const [tier, setTier] = useState<Tier>(profile.recommended);
  const [started, setStarted] = useState(false);   // la cámara AR no arranca hasta que se escoge nivel
  const [gateOpen, setGateOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [simLoad, setSimLoad] = useState(false);

  // ─── FASE 1A: estado de la prueba de profundidad ───
  const [depthMode, setDepthMode] = useState<DepthMode>('off');
  const [depthTouched, setDepthTouched] = useState(false);          // false = nunca se tocó el botón → no se envía NADA nuevo al motor
  const [depthReadyS, setDepthReadyS] = useState<number | null>(null); // segundos entre activarla y 'lista' (null = no ha llegado)
  const [, setDepthTick] = useState(0);                               // solo fuerza repintar el contador cada segundo
  const depthOnAtRef = useRef<number | null>(null);

  // ─── FLOOR_DIAG ───
  const [floorDiagTick, setFloorDiagTick] = useState(0);                 // sube 1 por cada toque en "Diag piso"
  const [floorDiagText, setFloorDiagText] = useState<string | null>(null); // resumen de la última foto

  // ─── HOLES_AUTO ───
  const [holesInfo, setHolesInfo] = useState<string | null>(null);          // "recortados 1/2 · obj 2: …" (lo informa la escena)
  const [shaderTest, setShaderTest] = useState(false);                     // SHADER_TEST: arranca APAGADO

  // ─── MAQUETA: el plano vive en METROS. La escala de visualización va aparte, en la escena. ───
  // Hoy el plano es local; en la fase 2 llegará de Supabase sin tocar el generador.
  const [maquetaInfo, setMaquetaInfo] = useState<string | null>(null);
  const [maquetaResetTick, setMaquetaResetTick] = useState(0);              // "Recolocar": vuelve a elegir la mesa
  // ─── E2: UN solo proyecto para la planta, el 3D y la mesa. Vive aquí, no en el ancla: si se
  // pierde la superficie, el diseño no se pierde; basta con volver a tocar la mesa. ───
  const [editor, setEditor] = useState<EditorPlanta>(() => editorVacio());
  const accionEditor = useCallback((a: AccionEditor) => setEditor(e => reducirEditor(e, a)), []);
  const [vista, setVista] = useState<'planta' | '3d'>('planta');
  const [pendiente, setPendiente] = useState<{ tipo: string; nombre?: string } | null>(null);
  const [escalaDen, setEscalaDen] = useState(20);
  const [ejemploIdx, setEjemploIdx] = useState(-1);
  const [ladoMesa, setLadoMesa] = useState<[number, number] | null>(null);  // tamaño de la mesa; null = sin colocar
  const [tracking, setTracking] = useState(3);                              // 3 = TRACKING_NORMAL (ViroConstants)
  const arrastreActivo = tracking === 3;
  const tocarPlano = useCallback((p: { x: number; z: number }, idModulo?: string) => {
    if (pendiente) {                                                        // colocar el espacio elegido donde se tocó
      accionEditor({ type: 'agregarModulo', tipo: pendiente.tipo, nombre: pendiente.nombre, x: p.x, z: p.z });
      setPendiente(null);
    } else {
      accionEditor({ type: 'seleccionar', seleccion: idModulo ? { tipo: 'modulo', id: idModulo } : null });
    }
  }, [pendiente, accionEditor]);
  const cargarEjemplo = () => {
    const i = (ejemploIdx + 1) % PLANOS_MAQUETA.length;
    setEjemploIdx(i);
    accionEditor({ type: 'cargarPlano', plano: PLANOS_MAQUETA[i].crear() });
    setVista('planta'); setPendiente(null);
  };
  const contenidoMesa = useCallback((ctx: ContextoMesa) => (
    <EditorMesa ctx={ctx} editor={editor} vista={vista} arrastreActivo={arrastreActivo}
      onAccion={accionEditor} onTocarPlano={tocarPlano} />
  ), [editor, vista, arrastreActivo, accionEditor, tocarPlano]);
  const avisoMesa = ladoMesa ? avisoEspacio(extensionPlanta(editor.planta.modulos), 1 / escalaDen, ladoMesa) : null;
  const handleDepthReady = useCallback(() => {
    const t0 = depthOnAtRef.current;
    console.log('[DEPTH-1A] onDepthReady recibido');
    setDepthReadyS(prev => prev ?? (t0 ? Math.round((Date.now() - t0) / 100) / 10 : 0));
  }, []);
  useEffect(() => {
    if (depthMode === 'off' || depthReadyS !== null) return;
    const id = setInterval(() => setDepthTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [depthMode, depthReadyS]);
  const cycleDepth = () => {
    const next: DepthMode = depthMode === 'off' ? 'on' : depthMode === 'on' ? 'debug' : 'off';
    if (depthMode === 'off' && depthReadyS === null) depthOnAtRef.current = Date.now();
    console.log(`[DEPTH-1A] modo: ${depthMode} -> ${next}`);
    setDepthTouched(true);
    setDepthMode(next);
  };
  let depthLabel = 'Prof.: apagada';
  if (depthMode !== 'off') {
    const extra = depthMode === 'debug' ? ' + mapa' : '';
    const waited = depthOnAtRef.current ? Math.floor((Date.now() - depthOnAtRef.current) / 1000) : 0;
    depthLabel = depthReadyS !== null ? `Prof.: lista en ${depthReadyS} s${extra}`
      : waited >= DEPTH_WAIT_LIMIT_S ? `Prof.: sin datos (${waited} s)${extra}`
      : `Prof.: esperando ${waited} s${extra}`;
  }

  // `dispatch` de useReducer es estable: se pasa tal cual a la escena AR.
  const appProps = useMemo(() => ({
    onRoomModel: setRoom,
    onDiagnostics: setDiag,
    onReticle: setReticle,
    onDrawAction: dispatch,
    onDepthReady: handleDepthReady,   // FASE 1A
    floorDiagTick: FLOOR_DIAG ? floorDiagTick : 0,                        // FLOOR_DIAG (0 = apagado)
    onFloorDiag: FLOOR_DIAG ? setFloorDiagText : undefined,               // FLOOR_DIAG
    holesInAuto: HOLES_AUTO,                                              // HOLES_AUTO
    shaderTest: SHADER_TEST && shaderTest,                                // SHADER_TEST
    onHolesInfo: HOLES_AUTO ? setHolesInfo : undefined,                   // HOLES_AUTO
    mode,
    drawState,
    reticle,
    escalaMaqueta: 1 / escalaDen, // MAQUETA: escala de visualización (los datos siguen en metros)
    maquetaResetTick,             // MAQUETA: al cambiar, se vuelve a elegir la mesa
    onMaquetaInfo: setMaquetaInfo,
    contenidoMesa,                // E2: el editor se dibuja dentro del nodo anclado de la escena
    onColocada: setLadoMesa,      // E2: proyecto colocado (tamaño de la mesa) o superficie perdida
    onTracking: setTracking,      // E2: con seguimiento limitado, el arrastre se pausa
  }), [mode, drawState, reticle, handleDepthReady, floorDiagTick, shaderTest, escalaDen, maquetaResetTick, contenidoMesa]);

  const stats = drawStats(drawState, reticle);
  const floorReady = !!room?.floor;
  const walls = (room?.walls ?? []).filter(w => w.confidence >= 0.5);

  const showToast = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2200); };

  /** Sesión terminada: las coordenadas de una sesión AR no valen en la siguiente, así que se limpia todo. */
  const endSession = (msg: string | null) => {
    setStarted(false);
    setGateOpen(true);
    setNotice(msg);
    setRoom(null);
    setReticle(null);
    dispatch({ type: 'clearAll' });
    // FASE 1A: la prueba de profundidad vuelve al estado inicial
    setDepthMode('off'); setDepthTouched(false); setDepthReadyS(null); depthOnAtRef.current = null;
    setFloorDiagTick(0); setFloorDiagText(null);   // FLOOR_DIAG
    setHolesInfo(null);                            // HOLES_AUTO
    setShaderTest(false);                          // SHADER_TEST
    setMaquetaInfo(null);                          // MAQUETA
    setMaquetaResetTick(0);                        // MAQUETA
    setVista('planta'); setPendiente(null); setLadoMesa(null); setTracking(3);   // E2 (el proyecto se conserva)
  };

  const countdown = usePerformanceGovernor({
    tier,
    active: started && !gateOpen,
    simulateLoad: simLoad,
    onDrop: (_from, to) => { setTier(to); showToast(`Bajamos a ${TIER_SPECS[to].label} para que fluya mejor`); },
    onUnfit: () => {
      setTier('basic');
      endSession('Tu celular no logró mantener la fluidez ni en Básico. Prueba en un lugar con más luz, cierra otras apps, o usa otro celular.');
    },
  });
  const dropNow = () => {
    if (!countdown) return;
    if (countdown.target === 'exit') { setTier('basic'); endSession('Volviste al inicio porque tu celular iba muy lento.'); }
    else { setTier(countdown.target); showToast(`Bajamos a ${TIER_SPECS[countdown.target].label}`); }
  };

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

  // Intervención humana: el piso que detectó el sistema pasa a ser una figura editable.
  const importDetected = () => {
    if (room?.floor && room.floor.polygon.length >= 3) dispatch({ type: 'importFloor', polygon: room.floor.polygon });
  };
  const correctByHand = () => {
    setMode('draw');
    if (!drawState.floor) importDetected();
  };

  // ─── Textos de ayuda ───
  let hint: string;
  if (mode === 'maqueta') {
    const etiqueta = pendiente ? (PALETA.find(x => x.tipo === pendiente.tipo && x.nombre === pendiente.nombre)?.etiqueta ?? pendiente.tipo) : '';
    hint = !ladoMesa ? (maquetaInfo ?? 'Apunta a la mesa y mueve el teléfono despacio')
      : !arrastreActivo ? 'Seguimiento limitado: mueve el teléfono despacio (arrastrar está en pausa)'
      : pendiente ? `Toca la mesa donde quieras: ${etiqueta}`
      : editor.mensaje ? editor.mensaje
      : avisoMesa ? avisoMesa
      : vista === '3d' ? 'Vista 3D del proyecto · "Volver a la planta" para seguir editando'
      : !editor.planta.modulos.length ? 'Planta vacía: elige un espacio y toca la mesa'
      : 'Toca un espacio para seleccionarlo · ● verde mueve · ● morado estira';
  } else if (mode === 'auto') {
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
    hint = 'Arrastra: ⚪ esquina · 🔵 lado · 🟢 mover. Toca una figura para editarla';
  }

  // ─── Botón contextual a la izquierda del "+" ───
  let chip: { label: string; onPress: () => void } | null = null;
  if (mode === 'auto') {
    if (room?.floor) chip = { label: '✎ Corregir a mano', onPress: correctByHand };
  } else if (mode === 'draw') {
    if (drawState.phase === 'floor' && stats.points >= 3) chip = { label: 'Cerrar forma', onPress: () => dispatch({ type: 'close' }) };
    else if (drawState.phase === 'floor' && stats.points === 0 && room?.floor) chip = { label: 'Usar piso detectado', onPress: importDetected };
    else if (drawState.phase === 'floorDone') chip = { label: 'Marcar objeto', onPress: () => dispatch({ type: 'startHole' }) };
    else if (drawState.phase === 'hole') chip = stats.points >= 3
      ? { label: 'Cerrar objeto', onPress: () => dispatch({ type: 'close' }) }
      : { label: 'Cancelar', onPress: () => dispatch({ type: 'cancelHole' }) };
  }

  return (
    <View style={styles.container}>
      {started && (
        <ViroARSceneNavigator
          ref={navRef}
          key={mode === 'maqueta' ? 'maqueta' : 'room'}
          initialScene={{ scene: (mode === 'maqueta' ? MaquetaScene : RoomScanScene) as any }}
          viroAppProps={appProps}
          style={styles.flex}
          depthEnabled={DEPTH_TEST_UI && depthTouched ? depthMode !== 'off' : undefined}
          depthDebugEnabled={DEPTH_TEST_UI && depthTouched ? depthMode === 'debug' : undefined}
        />
      )}

      {/* Nivel actual: toca para cambiarlo sin salir de la cámara */}
      {started && !gateOpen && (
        <TouchableOpacity style={styles.tierChip} onPress={() => setGateOpen(true)}>
          <Text style={styles.tierChipText}>Nivel: {TIER_SPECS[tier].label} ▾</Text>
        </TouchableOpacity>
      )}

      {/* FASE 1A: botón de la prueba de profundidad (toca para pasar: apagada → activa → activa + mapa → apagada) */}
      {DEPTH_TEST_UI && started && !gateOpen && mode !== 'maqueta' && (
        <TouchableOpacity style={styles.depthChip} onPress={cycleDepth}>
          <Text style={styles.depthChipText}>{depthLabel}</Text>
        </TouchableOpacity>
      )}

      {/* FLOOR_DIAG: una "foto" por toque. La salida va a la terminal de Metro con el prefijo [FLOORDBG]. */}
      {FLOOR_DIAG && started && !gateOpen && mode !== 'maqueta' && (
        <TouchableOpacity style={styles.diagChip} onPress={() => setFloorDiagTick(t => t + 1)}>
          <Text style={styles.diagChipText}>{floorDiagText ?? 'Diag piso (toca)'}</Text>
        </TouchableOpacity>
      )}

      {/* SHADER_TEST: alterna el material del piso entre 'roomFloor' y el de prueba. Arranca apagado. */}
      {SHADER_TEST && started && !gateOpen && mode === 'auto' && (
        <TouchableOpacity style={styles.shaderChip} onPress={() => setShaderTest(v => !v)}>
          <Text style={styles.shaderChipText}>{shaderTest ? 'Shader cámara: ON' : 'Shader cámara: off'}</Text>
        </TouchableOpacity>
      )}

      {countdown && <PerformanceBanner countdown={countdown} onNow={dropNow} />}

      <PerformanceGate
        visible={gateOpen}
        opaque={!started}
        info={info}
        profile={profile}
        benchmarkMs={benchmarkMs}
        initialTier={started ? tier : profile.recommended}
        notice={notice}
        simulateLoad={simLoad}
        onSimulateLoad={setSimLoad}
        onConfirm={t => { setTier(t); setStarted(true); setGateOpen(false); setNotice(null); }}
        onCancel={started ? () => setGateOpen(false) : undefined}
      />

      {/* Arriba: deshacer y borrar (modo Dibujar) */}
      {mode === 'draw' && (
        <>
          <TouchableOpacity style={[styles.round, styles.topLeft, !stats.canUndo && styles.roundOff]}
            disabled={!stats.canUndo} onPress={() => dispatch({ type: 'undo' })}>
            <Text style={styles.roundIcon}>↶</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.round, styles.topLeft2, !stats.canRedo && styles.roundOff]}
            disabled={!stats.canRedo} onPress={() => dispatch({ type: 'redo' })}>
            <Text style={styles.roundIcon}>↷</Text>
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
                ? `Área útil: ${stats.floorArea.toFixed(2)} m²   Perímetro: ${stats.floorPerimeter.toFixed(2)} m   Objetos: ${stats.holes}`
                : `Puntos: ${stats.points}`}
            </Text>
          ) : null}
          {mode === 'draw' && drawState.phase === 'floorDone' && stats.selectedArea !== null ? (
            <Text style={styles.line}>
              {stats.selectedLabel}: {stats.selectedArea.toFixed(2)} m²{stats.axisSnapped ? '   ⟂ alineado' : ''}
            </Text>
          ) : null}
          {mode === 'maqueta' && ladoMesa ? (
            <Text style={styles.line}>
              {editor.planta.modulos.length} espacio{editor.planta.modulos.length === 1 ? '' : 's'} · {editor.planta.vanos.length} vano{editor.planta.vanos.length === 1 ? '' : 's'} · 1:{escalaDen}{maquetaInfo ? ` · ${maquetaInfo}` : ''}
            </Text>
          ) : null}
          {mode !== 'auto' ? null : (
            <>
              <Text style={styles.line}>
                Piso: {room?.floor ? `${room.floor.area.toFixed(2)} m²` : '—'}   Paredes: {walls.length}   Esquinas: {room?.corners.length ?? 0}
              </Text>
              <Text style={styles.line}>
                Altura: {heightLabel(room)}   Puertas: {room?.openings.filter(o => o.type === 'door').length ?? 0}   Mesa/asiento (ARKit): {room?.objects.length ?? 0}
              </Text>
              {drawState.holes.length > 0 ? (
                <Text style={styles.line}>
                  Objetos marcados: {drawState.holes.length}{HOLES_AUTO && holesInfo ? ` · ${holesInfo}` : ''}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {mode === 'maqueta' && (
          <EditorPanel
            editor={editor} vista={vista} colocado={!!ladoMesa} pendiente={pendiente} escalaDen={escalaDen}
            onAccion={accionEditor}
            onElegirTipo={setPendiente}
            onConvertir={() => { accionEditor({ type: 'convertir' }); setPendiente(null); setVista('3d'); }}
            onVolver={() => setVista('planta')}
            onEscala={setEscalaDen}
            onEjemplo={cargarEjemplo}
            onRecolocar={() => setMaquetaResetTick(t => t + 1)} />
        )}

        {mode === 'draw' && drawState.phase === 'floorDone' && (
          <View style={styles.editBar} pointerEvents="box-none">
            <TouchableOpacity style={styles.chip} onPress={() => dispatch({ type: 'cycleSelection' })}>
              <Text style={styles.chipText}>Editando: {stats.selectedLabel ?? '—'}  ▸</Text>
            </TouchableOpacity>
            {typeof drawState.selected === 'number' && (
              <TouchableOpacity style={[styles.chip, styles.chipDanger]} onPress={() => dispatch({ type: 'deleteSelected' })}>
                <Text style={styles.chipText}>Eliminar objeto</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

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
          {(['maqueta', 'draw', 'auto'] as Mode[]).map(m => (
            <TouchableOpacity key={m} style={[styles.segBtn, mode === m && styles.segBtnOn]} onPress={() => setMode(m)}>
              <Text style={styles.segIcon}>{m === 'auto' ? '◎' : m === 'draw' ? '✎' : '▣'}</Text>
              <Text style={[styles.segText, mode === m && styles.segTextOn]}>{m === 'auto' ? 'Automático' : m === 'draw' ? 'Dibujar' : 'Maqueta'}</Text>
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
  topLeft2: { left: 72 },
  tierChip: { position: 'absolute', top: 66, alignSelf: 'center', backgroundColor: 'rgba(40,40,40,0.55)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18 },
  tierChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  depthChip: { position: 'absolute', top: 164, left: 12, backgroundColor: 'rgba(40,40,40,0.55)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  depthChipText: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  diagChip: { position: 'absolute', top: 206, left: 12, maxWidth: 300, backgroundColor: 'rgba(40,40,40,0.55)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  diagChipText: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  shaderChip: { position: 'absolute', top: 248, left: 12, backgroundColor: 'rgba(40,40,40,0.55)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  shaderChipText: { color: '#f0abfc', fontSize: 12, fontWeight: '700' },
  topRight: { right: 18 },
  roundOff: { opacity: 0.35 },
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
  chipDanger: { backgroundColor: 'rgba(185,28,28,0.7)' },
  editBar: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', paddingHorizontal: 18, marginBottom: 10 },
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