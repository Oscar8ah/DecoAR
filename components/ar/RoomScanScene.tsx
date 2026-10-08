import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ViroARScene,
  ViroARPlane,
  ViroAmbientLight,
  ViroMaterials,
  ViroPolygon,
  ViroPolyline,
  ViroText,
} from '@reactvision/react-viro';
import {
  buildRoomModel,
  createRoomMemory,
  worldToLocal,
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
const RECOMPUTE_MS = 200;
const MIN_WALL_CONFIDENCE = 0.5;   // por debajo no se dibuja
const MIN_OCCLUDER_CONFIDENCE = 0.7; // solo paredes muy seguras tapan lo que hay detrás

ViroMaterials.createMaterials({
  // Superposiciones: mezcla alfa, leen profundidad (para que las paredes fantasma las tapen) pero no la escriben.
  roomFloor: { diffuseColor: '#22C55E38', blendMode: 'Alpha', cullMode: 'None', lightingModel: 'Constant', writesToDepthBuffer: false },
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
  // Refs para leer valores actuales dentro del callback de cámara (que se crea una sola vez).
  const modeRef = useRef(mode); modeRef.current = mode;
  const onReticleRef = useRef(onReticle); onReticleRef.current = onReticle;
  const floorYRef = useRef<number | null>(null);
  const lastReticle = useRef<{ at: number; p: Vec3 | null }>({ at: 0, p: null });

  const anchors = useRef(new Map<string, AnchorLike>());
  const memory = useRef(createRoomMemory());
  const cameraPos = useRef<Vec3 | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

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
    >
      <ViroAmbientLight color="#ffffff" intensity={300} />
      {/* Modo Automático: la reconstrucción de la habitación. En Dibujar se oculta para ver limpio. */}
      {snap && mode === 'auto' && renderAnchored(snap)}
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
function renderAnchored({ model, poses }: Snapshot) {
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
        vertices={polyXZ(pts)} holes={[]} materials={['roomFloor']} />
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