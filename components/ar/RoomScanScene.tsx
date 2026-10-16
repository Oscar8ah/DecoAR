import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ViroARScene,
  ViroARPlane,
  ViroAmbientLight,
  ViroMaterials,
  ViroPolygon,
  ViroPolyline,
  ViroBox,
  ViroText,
} from '@reactvision/react-viro';
import {
  buildRoomModel,
  createRoomMemory,
  worldToLocal,
  localToWorld,      // FLOOR_DIAG (solo lectura)
  polygonArea,       // FLOOR_DIAG (solo lectura)
  rotationMatrix,    // FLOOR_DIAG (solo lectura)
  TUNING,            // FLOOR_DIAG (solo lectura)
  AnchorLike,
  RoomModel,
  Vec3,
} from './spatial/roomModel';
import ManualFloorDrawer from './draw/ManualFloorDrawer';
import { DrawAction, DrawState, reticleOnFloor } from './draw/drawModel';

/**
 * ViroPolygon se dibuja en su plano XY; con rotación [-90,0,0] un punto (x, y)
 * termina en (x, 0, -y). Por eso pasamos (x, -z). (Confirmado en el teléfono.)
 */
const Z_SIGN = -1;

/**
 * PROXY_OCCLUDERS — prueba de oclusión por volumen proxy. Apagado por defecto.
 *
 * Idea: un mueble detectado por ARKit ya tiene huella en el piso (ObjectModel.footprint, en MUNDO)
 * y altura sobre el piso (ObjectModel.topHeight). Con eso se levanta una caja INVISIBLE que escribe
 * profundidad y no pinta color (material `roomOccluder`, el mismo que ya ocluye paredes). El
 * renderizador descarta por sí solo lo virtual que quede detrás: es oclusión 3D, no un recorte 2D.
 *
 * Marco de coordenadas (verificado numéricamente contra buildRoomModel antes de escribir esto):
 *  - `footprint` está en MUNDO (roomModel.ts:347,359) y se pasa al marco del ancla con `local()`.
 *  - En el marco de un ancla horizontal, la huella queda a Y constante (dispersión < 1e-16 m) y
 *    el eje -Y local apunta al piso, así que la caja se extiende topHeight hacia -Y.
 *  - Comprobado con la mesa girada 37° y con 3° de inclinación: la base cae en el piso con
 *    un error de 0 a 1 mm.
 *
 * Limitación por diseño: la caja es la envolvente de la huella. Sobre un sofá en L ocultará
 * esquinas vacías; sobre una silla, el hueco entre las patas.
 */
const PROXY_OCCLUDERS = true;          // ← poner en true para activar la prueba
const PROXY_MIN_AREA = 0.15;            // m²: por debajo de esto no se considera mesa
const PROXY_MIN_HEIGHT = 0.20;          // m: descarta planos casi a ras de piso
const PROXY_MAX_HEIGHT = 1.40;          // m: descarta planos altos mal clasificados
const PROXY_MARGIN = 0.02;              // m: la caja se encoge para no comerse piso de más
const RECOMPUTE_MS = 200;
const MIN_WALL_CONFIDENCE = 0.5;   // por debajo no se dibuja
const MIN_OCCLUDER_CONFIDENCE = 0.7; // solo paredes muy seguras tapan lo que hay detrás

ViroMaterials.createMaterials({
  // Superposiciones: mezcla alfa, leen profundidad (para que las paredes fantasma las tapen) pero no la escriben.
  roomFloor: { diffuseColor: '#22C55E38', blendMode: 'Alpha', cullMode: 'None', lightingModel: 'Constant', writesToDepthBuffer: false },
  /**
   * SHADER_TEST — material TEMPORAL de diagnóstico. No sustituye a `roomFloor`, que queda intacto.
   * Objetivo único: comprobar si un shader puede leer la cámara en vivo (`camera_texture`).
   *
   * Sintaxis verificada en el paquete instalado, no inferida:
   *  - la propiedad es `shaderModifiers` (ViroMaterials.ts:158) y el punto de entrada `surface`
   *    (VRTMaterialManager.mm:663);
   *  - `uniforms` y `body` se concatenan con un salto de línea (VRTMaterialManager.mm:453-457);
   *  - el shader DEBE declarar el sampler: "the modifier's GLSL code may declare and sample
   *    'uniform sampler2D camera_texture'. The engine automatically binds the live AR camera
   *    background texture to that sampler" (VROShaderModifier.h:258-262);
   *  - se usa `texture(...)`, no `texture2D(...)`: así lo hace la propia plantilla del motor
   *    ("_surface.diffuse_color *= texture(diffuse_texture, _surface.diffuse_texcoord);");
   *  - `_surface.diffuse_color` y `_surface.diffuse_texcoord` existen en este punto de entrada
   *    (VROShaderModifier.h:87-107).
   *
   * Qué debería verse: la imagen de la cámara MOSAICADA sobre el piso (el piso usa UV a escala
   * real, una repetición cada 0,6 m). Tapar la cámara con la mano debe oscurecerlo.
   */
  floorCameraTest: {
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    cullMode: 'None',
    writesToDepthBuffer: false,
    shaderModifiers: {
      surface: {
        requiresCameraTexture: true,
        uniforms: 'uniform sampler2D camera_texture;',
        // alpha a 1.0 para que la imagen se vea con claridad (el verde normal es translúcido)
        body: [
          'lowp vec4 cam = texture(camera_texture, _surface.diffuse_texcoord);',
          '_surface.diffuse_color = vec4(cam.rgb, 1.0);',
          '_surface.alpha = 1.0;',
        ].join('\n'),
      },
    },
  },
  roomWall: { diffuseColor: '#3B82F61A', blendMode: 'Alpha', cullMode: 'None', lightingModel: 'Constant', writesToDepthBuffer: false },
  roomObject: { diffuseColor: '#A855F744', blendMode: 'Alpha', cullMode: 'None', lightingModel: 'Constant', writesToDepthBuffer: false },
  roomWallEdge: { diffuseColor: '#60A5FA', lightingModel: 'Constant' },
  roomDoor: { diffuseColor: '#F97316', lightingModel: 'Constant' },
  roomWindow: { diffuseColor: '#06B6D4', lightingModel: 'Constant' },
  roomBaseline: { diffuseColor: '#EF4444', lightingModel: 'Constant' },
  roomCorner: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  roomCornerOut: { diffuseColor: '#FACC15', lightingModel: 'Constant' },
  // Pared fantasma: no pinta color, solo escribe profundidad → oculta lo que esté detrás de la pared real.
  roomOccluder: { colorWritesMask: 'None', writesToDepthBuffer: true, readsFromDepthBuffer: true, cullMode: 'None', lightingModel: 'Constant' },
});

type Pose = { position: Vec3; rotation: Vec3 };
type Snapshot = { model: RoomModel; poses: Map<string, Pose> };

export default function RoomScanScene(props: any) {
  const appProps = props?.arSceneNavigator?.viroAppProps ?? {};
  const onRoomModel: ((m: RoomModel) => void) | undefined = appProps.onRoomModel;
  const onDiagnostics: ((d: Record<string, unknown>) => void) | undefined = appProps.onDiagnostics;
  const mode: 'auto' | 'draw' = appProps.mode ?? 'auto';
  const drawState: DrawState | undefined = appProps.drawState;
  const reticle: Vec3 | null = appProps.reticle ?? null;
  const onReticle: ((r: Vec3 | null) => void) | undefined = appProps.onReticle;
  const onDrawAction: ((a: DrawAction) => void) | undefined = appProps.onDrawAction;
  // HOLES_AUTO: los objetos marcados en Dibujar también recortan el piso del modo Automático.
  const holesInAuto: boolean = appProps.holesInAuto === true;
  const shaderTest: boolean = appProps.shaderTest === true;   // SHADER_TEST
  const onHolesInfo: ((text: string | null) => void) | undefined = appProps.onHolesInfo;
  // FASE 1A (prueba de profundidad): se avisa a la app cuando ARKit/Viro dice que ya hay profundidad.
  const onDepthReady: (() => void) | undefined = appProps.onDepthReady;
  // FLOOR_DIAG: el diagnóstico solo corre cuando App sube este contador (acción manual). 0 = apagado.
  const floorDiagTick: number = appProps.floorDiagTick ?? 0;
  const onFloorDiag: ((summary: string) => void) | undefined = appProps.onFloorDiag;
  const floorDiagSeen = useRef(floorDiagTick);   // al montar, un valor anterior NO dispara nada
  // Refs para leer valores actuales dentro del callback de cámara (que se crea una sola vez).
  const modeRef = useRef(mode); modeRef.current = mode;
  const onReticleRef = useRef(onReticle); onReticleRef.current = onReticle;
  const floorYRef = useRef<number | null>(null);
  const onDepthReadyRef = useRef(onDepthReady); onDepthReadyRef.current = onDepthReady;
  const handleDepthReady = useCallback(() => onDepthReadyRef.current?.(), []);
  const lastReticle = useRef<{ at: number; p: Vec3 | null }>({ at: 0, p: null });

  const anchors = useRef(new Map<string, AnchorLike>());
  const memory = useRef(createRoomMemory());
  const cameraPos = useRef<Vec3 | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  // FLOOR_DIAG: observa y registra; no escribe estado de la escena ni toca el modelo.
  const snapRef = useRef<Snapshot | null>(null); snapRef.current = snap;

  // HOLES_AUTO: solo se calcula en modo Automático y con el interruptor activo; si no, `cuts` es undefined
  // y renderAnchored dibuja exactamente igual que antes (holes={[]}).
  const holeCuts = useMemo(
    () => (snap && holesInAuto && mode === 'auto' ? computeHoleCuts(snap, drawState?.holes) : null),
    [snap, holesInAuto, mode, drawState?.holes],
  );
  useEffect(() => { onHolesInfo?.(holeCuts ? holeCuts.info : null); }, [holeCuts]);
  useEffect(() => {
    if (!floorDiagTick || floorDiagTick === floorDiagSeen.current) return;
    floorDiagSeen.current = floorDiagTick;
    try {
      const r = runFloorDiag(floorDiagTick, anchors.current, snapRef.current, cameraPos.current);
      for (const line of r.lines) console.log(line);
      onFloorDiag?.(r.summary);
    } catch (e) {
      console.log('[FLOORDBG] ERROR en el diagnóstico (no afecta a la app):', String(e));
      onFloorDiag?.('Diag: error (ver terminal)');
    }
  }, [floorDiagTick]);

  // Diagnóstico visible en pantalla: ¿hay profundidad para oclusión en este teléfono?
  useEffect(() => {
    const nav = props?.arSceneNavigator;
    Promise.all([
      nav?.isDepthOcclusionSupported?.().catch((e: unknown) => ({ error: String(e) })),
      nav?.isPreferMonocularDepth?.().catch((e: unknown) => ({ error: String(e) })),
    ]).then(([occlusion, monocular]) => {
      const d = { occlusion, monocular };
      console.log('[AR] Diagnóstico de profundidad:', JSON.stringify(d));
      onDiagnostics?.(d);
    });
  }, []);

  const scheduleRecompute = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const list = [...anchors.current.values()];
      const model = buildRoomModel(list, cameraPos.current, memory.current);
      // Guardamos la pose de cada ancla con la que se calculó el modelo, para pasar a coordenadas locales.
      const poses = new Map(list.map(a => [a.anchorId, { position: a.position, rotation: a.rotation }]));
      floorYRef.current = model.floor?.y ?? null;
      setSnap({ model, poses });
      onRoomModel?.(model);
    }, RECOMPUTE_MS);
  }, [onRoomModel]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const upsert = useCallback((a: any) => {
    if (!a || a.type !== 'plane') return;
    anchors.current.set(a.anchorId, a as AnchorLike);
    scheduleRecompute();
  }, [scheduleRecompute]);

  const remove = useCallback((a: any) => {
    const id = a?.anchorId ?? a?.anchor?.anchorId;
    if (id) {
      anchors.current.delete(id);
      memory.current.wallSign.delete(id);
      scheduleRecompute();
    }
  }, [scheduleRecompute]);

  const onCamera = useCallback((t: any) => {
    const p = t?.position ?? t?.cameraTransform?.position;
    const f = t?.forward ?? t?.cameraTransform?.forward;
    if (p) cameraPos.current = p as Vec3;

    // MIRA central (modo Dibujar): rayo de la cámara ∩ plano del piso.
    if (modeRef.current !== 'draw' || !p || !f || floorYRef.current === null) return;
    const r = reticleOnFloor(p as Vec3, f as Vec3, floorYRef.current);
    const now = Date.now(), prev = lastReticle.current;
    const moved = !r || !prev.p ? r !== prev.p
      : Math.hypot(r[0] - prev.p[0], r[2] - prev.p[2]) > 0.003;
    if (moved && now - prev.at >= 50) {   // como máximo 20 veces por segundo, y solo si se movió > 3 mm
      lastReticle.current = { at: now, p: r };
      onReticleRef.current?.(r);
    }
  }, []);

  return (
    <ViroARScene
      anchorDetectionTypes={['PlanesHorizontal', 'PlanesVertical']}
      onAnchorFound={upsert}
      onAnchorUpdated={upsert}
      onAnchorRemoved={remove}
      onCameraTransformUpdate={onCamera}
      onDepthReady={handleDepthReady}
    >
      <ViroAmbientLight color="#ffffff" intensity={300} />
      {/* Modo Automático: la reconstrucción de la habitación. En Dibujar se oculta para ver limpio. */}
      {snap && mode === 'auto' && renderAnchored(snap, holeCuts?.cuts, shaderTest)}
      {/* Modo Dibujar: lo que el humano traza con la mira y el botón "+" */}
      {mode === 'draw' && drawState && snap?.model.floor && (
        <ManualFloorDrawer
          state={drawState}
          reticle={reticle}
          floorY={snap.model.floor.y}
          dispatch={a => onDrawAction?.(a)}
        />
      )}
    </ViroARScene>
  );
}

/**
 * Todo se dibuja COLGADO de su ancla de ARKit (<ViroARPlane anchorId>): Viro actualiza
 * la pose del ancla en cada cuadro, así el dibujo no "nada" cuando ARKit refina el mapa.
 */
function renderAnchored({ model, poses }: Snapshot, cuts?: Map<number, P2[][]>, shaderTest = false) {
  const byAnchor = new Map<string, React.ReactElement[]>();
  const push = (id: string, el: React.ReactElement) => {
    if (!poses.has(id)) return;
    if (!byAnchor.has(id)) byAnchor.set(id, []);
    byAnchor.get(id)!.push(el);
  };
  const local = (id: string, pts: Vec3[]): Vec3[] => {
    const p = poses.get(id)!;
    return pts.map(v => worldToLocal(p.position, p.rotation, v));
  };
  const polyXZ = (pts: Vec3[]): [number, number][] => pts.map(v => [v[0], Z_SIGN * v[2]]);
  // Altura media en el eje normal del ancla (el polígono se dibuja plano a esa altura).
  const yOf = (pts: Vec3[]) => pts.reduce((s, v) => s + v[1], 0) / pts.length;

  // PISO: cada pieza en el plano de su propia ancla (y local = 0).
  model.floor?.pieces.forEach((pc, i) => {
    const pts = local(pc.anchorId, pc.polygon);
    push(pc.anchorId, (
      <ViroPolygon key={`floor-${i}`} position={[0, yOf(pts) + 0.003, 0]} rotation={[-90, 0, 0]}
        vertices={polyXZ(pts)} holes={cuts?.get(i) ?? []} materials={[shaderTest ? 'floorCameraTest' : 'roomFloor']} />
    ));
  });

  // PAREDES
  const walls = model.walls.filter(w => w.confidence >= MIN_WALL_CONFIDENCE);
  const wallAnchor = new Map(walls.map(w => [w.id, w.keyAnchorId]));
  for (const w of walls) {
    const id = w.keyAnchorId;
    const [bl, br, tr, tl] = local(id, w.corners);
    push(id, <ViroPolygon key={`fill-${w.id}`} position={[0, yOf([bl, br, tr, tl]), 0]} rotation={[-90, 0, 0]}
      vertices={polyXZ([bl, br, tr, tl])} holes={[]} materials={['roomWall']} />);
    push(id, <ViroPolyline key={`edge-${w.id}`} position={[0, 0, 0]} points={[br, tr, tl, bl]}
      thickness={0.008} materials={['roomWallEdge']} />);
    push(id, <ViroPolyline key={`base-${w.id}`} position={[0, 0, 0]} points={[bl, br]}
      thickness={0.012} materials={['roomBaseline']} />);
    for (const o of w.openings) {
      const c = local(id, o.corners);
      push(id, <ViroPolyline key={`op-${o.id}`} position={[0, 0, 0]} points={[...c, c[0]]}
        thickness={0.014} materials={[o.type === 'door' ? 'roomDoor' : 'roomWindow']} />);
    }
    if (w.confidence >= MIN_OCCLUDER_CONFIDENCE) {
      // 1 cm detrás de la cara visible, para no pelear con el relleno de la propia pared.
      const back = local(id, w.corners.map(v => [v[0] - w.normal[0] * 0.01, v[1], v[2] - w.normal[2] * 0.01] as Vec3));
      push(id, <ViroPolygon key={`occ-${w.id}`} renderingOrder={-1} position={[0, yOf(back), 0]} rotation={[-90, 0, 0]}
        vertices={polyXZ(back)} holes={[]} materials={['roomOccluder']} />);
    }
  }

  // ESQUINAS: colgadas del ancla de la primera de sus paredes.
  for (const c of model.corners) {
    const id = wallAnchor.get(c.walls[0]);
    if (!id) continue;
    push(id, <ViroPolyline key={c.id} position={[0, 0, 0]} points={local(id, [c.floorPoint, c.topPoint])}
      thickness={0.015} materials={[c.kind === 'interior' ? 'roomCorner' : 'roomCornerOut']} />);
  }

  // MESAS / ASIENTOS
  for (const o of model.objects) {
    const pts = local(o.id, o.footprint);
    push(o.id, <ViroPolygon key={`obj-${o.id}`} position={[0, yOf(pts) + 0.003, 0]} rotation={[-90, 0, 0]}
      vertices={polyXZ(pts)} holes={[]} materials={['roomObject']} />);
  }

  // PROXY_OCCLUDERS: SOLO la mesa de mayor área, y solo si pasa los filtros. Un único oclusor.
  if (PROXY_OCCLUDERS) {
    const mesa = model.objects
      .filter(o => o.type === 'table' && o.area >= PROXY_MIN_AREA
        && o.topHeight >= PROXY_MIN_HEIGHT && o.topHeight <= PROXY_MAX_HEIGHT
        && poses.has(o.id))
      .sort((a, b) => b.area - a.area)[0];
    if (mesa) {
      const pts = local(mesa.id, mesa.footprint);          // huella en el marco del ancla
      const xs = pts.map(v => v[0]), zs = pts.map(v => v[2]);
      const w = Math.max(...xs) - Math.min(...xs) - 2 * PROXY_MARGIN;
      const d = Math.max(...zs) - Math.min(...zs) - 2 * PROXY_MARGIN;
      const h = mesa.topHeight;
      if (w > 0.05 && d > 0.05) {
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        const yTop = yOf(pts);                              // la huella está a Y constante en local
        // Centro de la caja: medio alto por debajo de la tapa. -Y local = hacia el piso.
        push(mesa.id, <ViroBox key={`proxyocc-${mesa.id}`} renderingOrder={-1}
          position={[cx, yTop - h / 2, cz]} width={w} height={h} length={d}
          materials={['roomOccluder']} />);
      }
    }
  }

  // ETIQUETAS: qué reconoció el sistema en la escena (posición calculada en mundo y pasada a local).
  const label = (id: string, key: string, text: string, world: Vec3) =>
    push(id, <ViroText key={key} text={text} position={local(id, [world])[0]}
      scale={[0.15, 0.15, 0.15]} style={labelStyle} transformBehaviors={['billboard']} />);
  const up = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]];
  const firstFloor = model.floor?.pieces[0]?.anchorId;
  if (model.floor && firstFloor) label(firstFloor, 'lbl-floor', `PISO · ${model.floor.area.toFixed(1)} m²`, up(model.floor.center, 0.05));
  for (const w of walls) {
    const mid: Vec3 = [(w.baseline[0][0] + w.baseline[1][0]) / 2, w.baseline[0][1] + 0.25, (w.baseline[0][2] + w.baseline[1][2]) / 2];
    label(w.keyAnchorId, `lbl-${w.id}`, `PARED · ${fmtM(w.width)}`, mid);
    for (const o of w.openings) label(w.keyAnchorId, `lbl-${o.id}`, o.type === 'door' ? 'PUERTA' : 'VENTANA', o.center);
  }
  for (const o of model.objects) label(o.id, `lbl-${o.id}`, o.type === 'table' ? 'MESA' : 'ASIENTO', up(o.center, 0.15));

  return [...byAnchor.entries()].map(([anchorId, children]) => (
    <ViroARPlane key={anchorId} anchorId={anchorId} minWidth={0} minHeight={0}>
      {children}
    </ViroARPlane>
  ));
}
const fmtM = (m: number) => (m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(2)} m`);
const labelStyle = {
  fontFamily: 'Arial', fontSize: 14, color: '#ffffff',
  textAlignVertical: 'center' as const, textAlign: 'center' as const,
};

// >>> FLOOR_DIAG-BEGIN  (bloque autocontenido y de solo lectura; se prueba extrayéndolo tal cual)
type DiagPose = { position: Vec3; rotation: Vec3 };
type DiagSnap = { model: RoomModel; poses: Map<string, DiagPose> };

/**
 * Diagnóstico TEMPORAL del piso. Solo OBSERVA: no modifica el modelo, el estado ni el dibujo.
 * Cada dato lleva su procedencia en el nombre de su sección:
 *   LEIDO_DEL_MODELO  = campos que `buildRoomModel` ya exporta (sin recalcular).
 *   CRUDO_DE_VIRO     = lo que Viro entrega por ancla, sin procesar.
 *   RECONSTRUIDO      = calculado AQUÍ replicando fórmulas del modelo; el modelo NO lo exporta.
 *   INFERIDO / NO_VERIFICADO = suposiciones explícitas (semilla, cámara).
 */
function runFloorDiag(
  n: number,
  anchors: Map<string, AnchorLike>,
  snap: DiagSnap | null,
  cam: Vec3 | undefined,
): { lines: string[]; summary: string } {
  const MAX = 14;                                         // anclas por línea (evita salidas enormes)
  const r3 = (x: number) => Math.round(x * 1000) / 1000;  // metros → milímetros
  const cm1 = (x: number) => Math.round(x * 1000) / 10;   // metros → cm con 1 decimal
  const sid = (id: string) => String(id).slice(0, 6);
  const KNOWN = ['floor', 'wall', 'ceiling', 'door', 'window', 'table', 'seat'];   // = LABELS de roomModel.ts
  const cosH = Math.cos((TUNING.horizontalTolDeg * Math.PI) / 180);
  const floor = snap?.model?.floor ?? null;
  const memberIds = new Set<string>(floor?.sourceAnchors ?? []);

  // ── Reconstrucción por ancla horizontal (misma definición que heightOf, roomModel.ts:446) ──
  interface A { id: string; cls: string; lab: string | null; pos: Vec3; rot: Vec3; nV: number; h: number; area: number; ny: number }
  const hz: A[] = [];
  let totalRaw = 0;
  for (const a of anchors.values()) {
    totalRaw++;
    if (!a || !a.position || !a.rotation) continue;
    const ny = rotationMatrix(a.rotation)[1][1];          // componente Y de la normal (R·[0,1,0])
    if (Math.abs(ny) < cosH) continue;                    // solo horizontales (tolerancia = TUNING.horizontalTolDeg)
    let local: Vec3[];
    if (a.vertices && a.vertices.length >= 3) {
      local = a.vertices.map(v => [v[0], 0, v[2]] as Vec3);
    } else {                                              // mismo rectángulo de reserva que anchorToPlane
      const c: Vec3 = a.center ?? [0, 0, 0];
      const hw = (a.width ?? 0.3) / 2, hh = (a.height ?? 0.3) / 2;
      local = [[c[0] - hw, 0, c[2] - hh], [c[0] + hw, 0, c[2] - hh], [c[0] + hw, 0, c[2] + hh], [c[0] - hw, 0, c[2] + hh]];
    }
    const hs = local.map(p => localToWorld(a.position, a.rotation, p)[1]);
    const low = a.classification ? a.classification.toLowerCase() : '';
    hz.push({
      id: a.anchorId, cls: a.classification ?? '-', lab: KNOWN.includes(low) ? low : null,
      pos: a.position, rot: a.rotation, nV: a.vertices?.length ?? 0,
      h: hs.reduce((s, v) => s + v, 0) / hs.length,
      area: polygonArea(local.map(p => [p[0], p[2]] as [number, number])), ny,
    });
  }
  hz.sort((p, q) => p.h - q.h);

  // ── RECONSTRUIDO: miembros que el MODELO declara (sourceAnchors) y su media ponderada ──
  const mem = hz.filter(p => memberIds.has(p.id));
  const faltan = [...memberIds].filter(id => !hz.some(p => p.id === id)).map(sid);
  const wsum = mem.reduce((s, p) => s + p.area, 0);
  const media = mem.length && wsum > 0 ? mem.reduce((s, p) => s + p.h * p.area, 0) / wsum : null;   // = `raw` de roomModel.ts:465-466
  const hMin = mem.length ? Math.min(...mem.map(p => p.h)) : null;
  const hMax = mem.length ? Math.max(...mem.map(p => p.h)) : null;
  const spread = hMin !== null && hMax !== null ? hMax - hMin : null;

  // Altura local que renderAnchored aplica a cada pieza (RoomScanScene.tsx: local()/yOf(); +0.003 m aparte)
  const piezas = (floor?.pieces ?? []).map(pc => {
    const pose = snap?.poses?.get(pc.anchorId);
    const ys = pose ? pc.polygon.map(v => worldToLocal(pose.position, pose.rotation, v)[1]) : [];
    const yLocal = ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : null;
    const anc = hz.find(p => p.id === pc.anchorId);
    return [sid(pc.anchorId), yLocal === null ? null : r3(yLocal), anc && floor ? r3(floor.y - anc.h) : null];
  });

  // ── INFERIDO: semilla y miembros según la regla de roomModel.ts:450-464 (el modelo NO expone la semilla) ──
  const isCeil = (p: A) => p.lab === 'ceiling' || (!p.lab && cam !== undefined && p.h > cam[1] + TUNING.ceilingAboveCamera);
  const cands = hz.filter(p => !isCeil(p) && p.lab !== 'table' && p.lab !== 'seat' && p.area >= TUNING.minFloorArea);
  const seed = cands.find(p => p.lab === 'floor') ?? cands[0] ?? null;
  const inf = seed ? hz.filter(p => !isCeil(p) && p.lab !== 'table' && p.lab !== 'seat' && Math.abs(p.h - seed.h) <= TUNING.floorMergeTol) : [];
  const infIds = inf.map(p => p.id).sort();
  const modIds = [...memberIds].sort();
  const coincide = infIds.length === modIds.length && infIds.every((id, i) => id === modIds[i]);
  const clusters: { n: number; lo: number; hi: number }[] = [];
  for (const p of cands) {
    const last = clusters[clusters.length - 1];
    if (last && p.h - last.hi <= TUNING.floorMergeTol) { last.n++; last.hi = p.h; }
    else clusters.push({ n: 1, lo: p.h, hi: p.h });
  }

  // ── NO_VERIFICADO: cámara. Su comparabilidad con las coordenadas de las anclas NO está demostrada ──
  const camY = cam ? cam[1] : null;
  const camMenosPiso = camY !== null && floor ? camY - floor.y : null;

  const head = `[FLOORDBG] #${n}`;
  const lines = [
    `${head} 1/5 CONTEXTO ` + JSON.stringify({
      t: new Date().toISOString(), unidad: 'm',
      marco: 'mundo AR de Viro/ARKit, Y arriba, worldAlignment=Gravity por defecto (App.tsx no lo fija)',
      disparo: 'manual (boton Diag piso)', anclasCrudas: totalRaw, horizontalesCrudas: hz.length,
    }),
    `${head} 2/5 LEIDO_DEL_MODELO ` + JSON.stringify(floor ? {
      floorY: r3(floor.y), areaM2: r3(floor.area), nota_area: 'refresco <=500 ms (roomModel.ts:630)',
      miembros: floor.sourceAnchors.map(sid), nPiezas: floor.pieces.length, confianza: r3(floor.confidence),
      stats: snap?.model?.stats ?? null, techoY: snap?.model?.ceiling ? r3(snap.model.ceiling.y) : null,
    } : { floor: null }),
    `${head} 3/5 CRUDO_DE_VIRO cols=[id,clasificacion,pos.y,rot.x,rot.z,nVertices] ` + JSON.stringify({
      anclasH: hz.slice(0, MAX).map(p => [sid(p.id), p.cls, r3(p.pos[1]), r3(p.rot[0]), r3(p.rot[2]), p.nV]),
      truncado: hz.length > MAX,
    }),
    `${head} 4/5 RECONSTRUIDO (calculado aqui; el modelo NO lo exporta) ` + JSON.stringify({
      colsAnclas: '[id,h(media Y mundo del contorno),areaM2,normalY,h-pos.y,esMiembroDelModelo]',
      anclasH: hz.slice(0, MAX).map(p => [sid(p.id), r3(p.h), r3(p.area), r3(p.ny), r3(p.h - p.pos[1]), memberIds.has(p.id) ? 1 : 0]),
      miembros: { n: mem.length, hMin: hMin === null ? null : r3(hMin), hMax: hMax === null ? null : r3(hMax), dispersion: spread === null ? null : r3(spread),
        mediaPonderadaPrevioAlSuavizado: media === null ? null : r3(media), floorY_menos_media: media !== null && floor ? r3(floor.y - media) : null },
      faltanEnCrudo: faltan,
      colsPiezas: '[ancla,yLocalQueSeDibuja(sin +0.003),floorY-hAnclaActual]',
      piezas,
    }),
    `${head} 5/5 INFERIDO_Y_NO_VERIFICADO ` + JSON.stringify({
      semillaINFERIDA: seed ? { id: sid(seed.id), h: r3(seed.h), etiqueta: seed.lab } : null,
      miembrosInferidosCoincidenConModelo: coincide,
      soloInferidos: infIds.filter(id => !memberIds.has(id)).map(sid), soloModelo: modIds.filter(id => !infIds.includes(id)).map(sid),
      gruposDeAlturaCandidatos: clusters.map(c => ({ n: c.n, lo: r3(c.lo), hi: r3(c.hi) })),
      camara: {
        NO_VERIFICADO: true, y: camY === null ? null : r3(camY), yMenosFloorY: camMenosPiso === null ? null : r3(camMenosPiso),
        nota: 'Posicion = context->getCamera().getPosition() (VRTScene.mm). VROARCamera.h la documenta como world space, pero el codigo que copia la pose de ARKit a esa camara esta compilado y no se pudo inspeccionar. NO usar para afirmar error de altura.',
      },
    }),
  ];

  const summary = floor
    ? `Diag #${n} · y ${floor.y.toFixed(3)} m · ${floor.sourceAnchors.length} planos · disp~ ${spread === null ? '—' : cm1(spread) + ' cm'}`
      + (camMenosPiso !== null ? `\ncám−piso ${camMenosPiso.toFixed(2)} m (SIN VERIFICAR)` : '')
    : `Diag #${n} · sin piso detectado`;
  return { lines, summary };
}
// <<< FLOOR_DIAG-END

// >>> HOLES_AUTO-BEGIN  (bloque autocontenido y puro; se prueba extrayéndolo tal cual)
type P2 = [number, number];
type HoleSnap = { model: RoomModel; poses: Map<string, { position: Vec3; rotation: Vec3 }> };
// Poly2Tri (el triangulador de ViroPolygon) NO valida su entrada y no tolera que un agujero toque el borde ni a otro
// agujero. Por eso un agujero solo se pasa si queda estrictamente dentro, a más de esta holgura de cualquier borde.
const HOLE_CLEARANCE = 0.02;   // m

/**
 * Convierte los objetos marcados en Dibujar (huellas en coordenadas de MUNDO, drawState.holes) en agujeros 2D para
 * cada pieza del piso automático (coordenadas LOCALES del ancla, con el mismo mapeo [x, -z] que el polígono).
 * Un agujero se aplica a una pieza solo si es seguro para el triangulador; los demás se informan en `info`.
 */
function computeHoleCuts(snap: HoleSnap, holes: Vec3[][] | undefined): { cuts: Map<number, P2[][]>; info: string | null } {
  const cuts = new Map<number, P2[][]>();
  const list = holes ?? [];
  if (!list.length) return { cuts, info: null };
  const pieces = snap.model.floor?.pieces ?? [];

  // ── geometría 2D en el plano horizontal (x, z) ──
  const xz = (v: Vec3): P2 => [v[0], v[2]];
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const onSeg = (a: P2, b: P2, p: P2) =>
    Math.min(a[0], b[0]) - 1e-9 <= p[0] && p[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    Math.min(a[1], b[1]) - 1e-9 <= p[1] && p[1] <= Math.max(a[1], b[1]) + 1e-9;
  // ¿se cruzan o se tocan los segmentos ab y cd? Inclusivo a propósito: el contacto también es inválido para Poly2Tri.
  const segHit = (a: P2, b: P2, c: P2, d: P2) => {
    const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return (d1 === 0 && onSeg(a, b, c)) || (d2 === 0 && onSeg(a, b, d)) || (d3 === 0 && onSeg(c, d, a)) || (d4 === 0 && onSeg(c, d, b));
  };
  const distPtSeg = (p: P2, a: P2, b: P2) => {
    const vx = b[0] - a[0], vz = b[1] - a[1], L = vx * vx + vz * vz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / L)) : 0;
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vz));
  };
  const inPoly = (p: P2, poly: P2[]) => {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) ins = !ins;
    }
    return ins;
  };
  // ¿Dos contornos se cruzan, se tocan o quedan a menos de `clr`? (no mira si uno contiene al otro)
  const touching = (A: P2[], B: P2[], clr: number) => {
    for (let i = 0; i < A.length; i++)
      for (let j = 0; j < B.length; j++)
        if (segHit(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    for (const p of A) for (let j = 0; j < B.length; j++) if (distPtSeg(p, B[j], B[(j + 1) % B.length]) < clr) return true;
    for (const p of B) for (let i = 0; i < A.length; i++) if (distPtSeg(p, A[i], A[(i + 1) % A.length]) < clr) return true;
    return false;
  };

  // ── 1) saneamiento: ≥3 puntos finitos y sin puntos repetidos (Poly2Tri se cae con repetidos) ──
  const h2: (P2[] | null)[] = list.map(h => {
    if (!Array.isArray(h) || h.length < 3) return null;
    const q = h.map(xz);
    if (!q.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return null;
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.005) return null;
    }
    return q;
  });

  // ── 2) agujeros que se solapan o se tocan entre sí: se conserva el primero ──
  const solapa: boolean[] = list.map(() => false);
  const aceptados: number[] = [];
  h2.forEach((q, k) => {
    if (!q) return;
    const choca = aceptados.some(j => {
      const o = h2[j] as P2[];
      return touching(o, q, HOLE_CLEARANCE) || inPoly(q[0], o) || inPoly(o[0], q);
    });
    if (choca) solapa[k] = true; else aceptados.push(k);
  });

  // ── 3) agujero × pieza: solo si queda estrictamente dentro y con holgura; se convierte al marco local del ancla ──
  const dentro = list.map(() => 0), roza = list.map(() => 0);
  pieces.forEach((pc, i) => {
    const pose = snap.poses.get(pc.anchorId);
    const outer = pc.polygon.map(xz);
    if (!pose || outer.length < 3) return;
    h2.forEach((q, k) => {
      if (!q || solapa[k]) return;
      if (touching(q, outer, HOLE_CLEARANCE)) { roza[k]++; return; }   // cruza, toca o queda a menos de 2 cm del borde
      if (!inPoly(q[0], outer)) return;                                 // queda fuera de esta pieza
      dentro[k]++;
      const loc = list[k].map(v => worldToLocal(pose.position, pose.rotation, v)).map(v => [v[0], Z_SIGN * v[2]] as P2);
      if (!cuts.has(i)) cuts.set(i, []);
      cuts.get(i)!.push(loc);
    });
  });

  // ── 4) informe: qué se recortó y qué no (y por qué) ──
  let aplicados = 0;
  const notas: string[] = [];
  list.forEach((_, k) => {
    if (!h2[k]) notas.push(`obj ${k + 1}: geometría inválida`);
    else if (solapa[k]) notas.push(`obj ${k + 1}: solapa con otro objeto`);
    else if (dentro[k] > 0 && roza[k] === 0) aplicados++;
    else if (dentro[k] > 0) { aplicados++; notas.push(`obj ${k + 1}: parcial (toca el borde de otra pieza)`); }
    else if (roza[k] > 0) notas.push(`obj ${k + 1}: toca o cruza el borde del piso`);
    else notas.push(`obj ${k + 1}: fuera del piso detectado`);
  });
  return { cuts, info: `recortados ${aplicados}/${list.length}` + (notas.length ? ' · ' + notas.join(' · ') : '') };
}
// <<< HOLES_AUTO-END