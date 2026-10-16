import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ViroARScene, ViroARPlane, ViroBox, ViroNode, ViroMaterials,
  ViroAmbientLight, ViroDirectionalLight, ViroPolygon, ViroQuad,
} from '@reactvision/react-viro';
import { Plano } from '../plan/planModel';
import { Caja, generarMaqueta } from '../plan/planGeometry';
import { worldToLocal, Vec3 } from './spatial/roomModel';   // solo lectura: roomModel.ts no se modifica
// E2: contexto para el contenido editable (conversiones mesa ↔ plano con el ancla vigente)
import { ContextoMesa, mundoAPlano, planoAMundo, planoDeArrastre } from '../plan/editorMesaGeom';

/**
 * Escena de MAQUETA: el usuario elige la mesa TOCÁNDOLA y la maqueta aparece ahí.
 * Independiente de RoomScanScene.tsx (que sigue intacta): sin shaders ni oclusión.
 *
 * Cómo se coloca (patrón verificado en el código oficial de Viro, ViroARPlaneSelector.tsx:474-533):
 *  1. Cada plano horizontal detectado se muestra como una superficie tocable.
 *  2. `onClickState` entrega la posición del toque en coordenadas de MUNDO.
 *  3. Se pasa al marco local del ancla con su `position`/`rotation`, y se fija Y = 0
 *     (el toque cae sobre la superficie).
 *  4. La maqueta se cuelga de un ViroNode en ese punto, DENTRO del ViroARPlane:
 *     así sigue al ancla cuando ARKit la refina, sin pasar a coordenadas de mundo.
 *
 * Altura: no se toca. Ya se verificó que la cara superior del suelo queda en Y = 0
 * (planGeometry.ts:120). Lo que fallaba era QUÉ superficie y DÓNDE, no la altura.
 *
 * Escalas, separadas a propósito:
 *  · El plano y la geometría están SIEMPRE en metros reales.
 *  · La escala de visualización (1:20 por defecto) es un `scale` uniforme sobre un nodo.
 *
 * Sombra: es una MEJORA VISUAL (ayuda a leer que el objeto está apoyado), no una
 * corrección geométrica. Usa la sombra AR nativa de Viro (`arShadowReceiver`).
 */

const Z_SIGN = -1;                    // misma convención que el resto del proyecto
export const ESCALA_MAQUETA = 1 / 20; // 1:20
const LADO_MIN_SUPERFICIE = 0.25;     // m: una superficie más pequeña no se ofrece para colocar
const CLICKED = 3;                    // ViroClickState: toque completo (abajo + arriba sobre el mismo objeto)

ViroMaterials.createMaterials({
  maqPiso:     { diffuseColor: '#D8CBB4', lightingModel: 'Lambert' },
  maqPared:    { diffuseColor: '#F2F2F2', lightingModel: 'Lambert' },
  maqDintel:   { diffuseColor: '#E8E8E8', lightingModel: 'Lambert' },
  maqBase:     { diffuseColor: '#00000040', blendMode: 'Alpha', lightingModel: 'Constant', writesToDepthBuffer: false },
  maqCandOk:   { diffuseColor: '#38BDF855', blendMode: 'Alpha', lightingModel: 'Constant', cullMode: 'None', writesToDepthBuffer: false },
  maqCandChica:{ diffuseColor: '#94A3B840', blendMode: 'Alpha', lightingModel: 'Constant', cullMode: 'None', writesToDepthBuffer: false },
});

const MATERIAL: Record<Caja['clase'], string> = { piso: 'maqPiso', pared: 'maqPared', dintel: 'maqDintel' };

interface Superficie {
  id: string;
  position: Vec3;
  rotation: Vec3;
  width: number;                // extensión X del plano (m)
  height: number;               // extensión Z del plano (m)
  vertices?: Vec3[];            // contorno en el marco del ancla
  center?: Vec3;
}

const esValida = (a: any) =>
  a && a.type === 'plane' && Array.isArray(a.position) && Array.isArray(a.rotation)
  && a.alignment !== 'Vertical'
  && String(a.classification ?? '').toLowerCase() !== 'ceiling';

export default function MaquetaScene(props: any) {
  const appProps = props?.sceneNavigator?.viroAppProps ?? {};
  const plano: Plano | undefined = appProps.plano;
  const escala: number = appProps.escalaMaqueta ?? ESCALA_MAQUETA;
  const onMaquetaInfo: ((s: string | null) => void) | undefined = appProps.onMaquetaInfo;
  const resetTick: number = appProps.maquetaResetTick ?? 0;
  // E2 — opcionales. Sin `contenidoMesa`, la escena dibuja la maqueta del `plano` como siempre.
  const contenidoMesa: ((ctx: ContextoMesa) => React.ReactNode) | undefined = appProps.contenidoMesa;
  const onTracking: ((estado: number) => void) | undefined = appProps.onTracking;
  const onColocada: ((lado: [number, number] | null) => void) | undefined = appProps.onColocada;

  const [superficies, setSuperficies] = useState<Map<string, Superficie>>(new Map());
  const supRef = useRef(superficies); supRef.current = superficies;
  const [sel, setSel] = useState<{ anchorId: string; tapLocal: Vec3; lado: [number, number] } | null>(null);
  const selRef = useRef(sel); selRef.current = sel;
  const [aviso, setAviso] = useState<string | null>(null);

  // La geometría se recalcula SOLO cuando cambia el plano: cambiar una medida regenera
  // la maqueta en caliente, sin perder la colocación.
  const maqueta = useMemo(() => (plano ? generarMaqueta(plano) : null), [plano]);

  // ── Detección de superficies ──
  const upsert = useCallback((a: any) => {
    if (!esValida(a)) return;
    if (selRef.current && selRef.current.anchorId !== a.anchorId) return;   // ya colocada: no hace falta seguir
    setSuperficies(prev => {
      const n = new Map(prev);
      n.set(a.anchorId, {
        id: a.anchorId, position: a.position, rotation: a.rotation,
        width: Number(a.width) || 0, height: Number(a.height) || 0,
        vertices: Array.isArray(a.vertices) && a.vertices.length >= 3 ? a.vertices : undefined,
        center: a.center,
      });
      return n;
    });
  }, []);
  const remove = useCallback((a: any) => {
    if (!a?.anchorId) return;
    setSuperficies(prev => { const n = new Map(prev); n.delete(a.anchorId); return n; });
    if (selRef.current?.anchorId === a.anchorId) {
      setSel(null);
      setAviso('Se perdió la superficie. Vuelve a tocar la mesa.');
    }
  }, []);

  // ── Recolocar (botón en App) ──
  const resetVisto = useRef(resetTick);
  useEffect(() => {
    if (resetTick === resetVisto.current) return;
    resetVisto.current = resetTick;
    setSel(null);
    setAviso(null);
  }, [resetTick]);

  // ── Tocar una superficie para colocar ──
  const colocar = useCallback((id: string, state: number, pos: number[]) => {
    if (state !== CLICKED || !Array.isArray(pos) || pos.length !== 3) return;
    const s = supRef.current.get(id);
    if (!s) return;
    const huellaMax = maqueta ? Math.max(maqueta.extension[0], maqueta.extension[2]) * escala : 0;
    const minimo = Math.max(LADO_MIN_SUPERFICIE, huellaMax);
    if (Math.min(s.width, s.height) < minimo) {
      setAviso(`Superficie pequeña (${Math.round(s.width * 100)}×${Math.round(s.height * 100)} cm). Sigue apuntando a la mesa para que crezca.`);
      return;
    }
    // Mundo → marco local del ancla, y al ras de la superficie (Y = 0)
    const l = worldToLocal(s.position, s.rotation, pos as Vec3);
    setSel({ anchorId: id, tapLocal: [l[0], 0, l[2]], lado: [s.width, s.height] });
    setAviso(null);
  }, [maqueta, escala]);

  // E2: avisa a App cuando el proyecto queda colocado (con el tamaño de la mesa) o se pierde la superficie
  useEffect(() => { onColocada?.(sel ? sel.lado : null); }, [sel, onColocada]);

  // ── E2: contexto del contenido editable. Las funciones leen el ancla en el momento de usarse. ──
  const ctx = useMemo<ContextoMesa | null>(() => {
    if (!sel) return null;
    const pose = () => { const s = supRef.current.get(sel.anchorId); return s ? { position: s.position, rotation: s.rotation } : null; };
    const p0 = pose();
    return {
      escala,
      lado: sel.lado,
      aPlano: (w: number[]) => { const p = pose(); return p && w?.length === 3 ? mundoAPlano(p, sel.tapLocal, escala, w as Vec3) : null; },
      aMundo: (x: number, y: number, z: number) => { const p = pose(); return p ? planoAMundo(p, sel.tapLocal, escala, x, y, z) : null; },
      planoDeArrastre: p0 ? planoDeArrastre(p0, sel.tapLocal) : null,
    };
  }, [sel, escala]);

  // ── Informe para el panel de App (sin repetir el mismo texto) ──
  const den = Math.max(1, Math.round(1 / escala));
  const nAptas = [...superficies.values()].filter(s => Math.min(s.width, s.height) >= LADO_MIN_SUPERFICIE).length;
  const info = maqueta?.errores.length ? `Plano inválido: ${maqueta.errores[0]}`
    : aviso ? aviso
    : sel && contenidoMesa ? `Proyecto sobre ${Math.round(sel.lado[0] * 100)}×${Math.round(sel.lado[1] * 100)} cm · 1:${den}`
    : sel && maqueta ? `${maqueta.cajas.length} piezas · ${maqueta.areaM2.toFixed(1)} m² · 1:${den} · sobre ${Math.round(sel.lado[0] * 100)}×${Math.round(sel.lado[1] * 100)} cm`
    : superficies.size === 0 ? 'Apunta a la mesa y mueve el teléfono despacio'
    : nAptas === 0 ? 'Superficie detectada, aún pequeña: sigue apuntando'
    : `Toca la superficie azul donde quieras la maqueta (1:${den})`;
  const infoVisto = useRef<string | null>(null);
  useEffect(() => {
    if (info === infoVisto.current) return;
    infoVisto.current = info;
    onMaquetaInfo?.(info);
  }, [info, onMaquetaInfo]);

  const cajas = maqueta?.cajas ?? [];
  const ext = maqueta?.extension ?? [0, 0, 0];

  return (
    <ViroARScene
      anchorDetectionTypes={'PlanesHorizontal' as any}
      onAnchorFound={upsert}
      onAnchorUpdated={upsert}
      onAnchorRemoved={remove}
      onTrackingUpdated={(estado: any) => onTracking?.(Number(estado))}
    >
      <ViroAmbientLight color="#FFFFFF" intensity={380} />

      {/* 1. Antes de colocar: cada superficie se muestra y se puede tocar */}
      {!sel && [...superficies.values()].map(s => {
        const apta = Math.min(s.width, s.height) >= LADO_MIN_SUPERFICIE;
        const c = s.center ?? [0, 0, 0];
        const verts: [number, number][] = s.vertices
          ? s.vertices.map(v => [v[0], Z_SIGN * v[2]])
          : [[c[0] - s.width / 2, Z_SIGN * (c[2] - s.height / 2)], [c[0] + s.width / 2, Z_SIGN * (c[2] - s.height / 2)],
             [c[0] + s.width / 2, Z_SIGN * (c[2] + s.height / 2)], [c[0] - s.width / 2, Z_SIGN * (c[2] + s.height / 2)]];
        return (
          <ViroARPlane key={`cand-${s.id}`} anchorId={s.id} minWidth={0} minHeight={0}>
            <ViroPolygon
              position={[0, 0.002, 0]} rotation={[-90, 0, 0]} vertices={verts} holes={[]}
              materials={[apta ? 'maqCandOk' : 'maqCandChica']}
              onClickState={(state: any, pos: any) => colocar(s.id, state, pos)}
            />
          </ViroARPlane>
        );
      })}

      {/* 2. Colocada: la maqueta cuelga del punto tocado, dentro del ancla elegida */}
      {sel && (contenidoMesa ? !!ctx : cajas.length > 0) && (
        <ViroARPlane anchorId={sel.anchorId} minWidth={0} minHeight={0}>
          <ViroNode position={sel.tapLocal}>
            {/* Luz con sombra y receptor de sombra AR: mejora VISUAL del contacto con la mesa */}
            <ViroDirectionalLight
              color="#FFFFFF" intensity={520} direction={[-0.35, -1, -0.25]} shadowOrthographicPosition={[0, 0.6, 0]}
              castsShadow={true} shadowOpacity={0.45} shadowMapSize={1024}
              shadowOrthographicSize={0.8} shadowNearZ={0.05} shadowFarZ={1.5} />
            <ViroQuad position={[0, 0.0005, 0]} rotation={[-90, 0, 0]} width={0.8} height={0.8} arShadowReceiver={true} />

            {/* E2: si hay contenido editable, se dibuja aquí; si no, la maqueta del plano como antes */}
            {contenidoMesa && ctx ? contenidoMesa(ctx) : (
          <>
            {/* Escala de VISUALIZACIÓN: un único factor uniforme. Los datos siguen en metros. */}
            <ViroNode scale={[escala, escala, escala]}>
              <ViroQuad position={[0, 0.002 / escala, 0]} rotation={[-90, 0, 0]}
                width={ext[0] * 1.08} height={ext[2] * 1.08} materials={['maqBase']} />
              {cajas.map(c => (
                <ViroBox
                  key={c.id}
                  position={[c.centro[0], c.centro[1], Z_SIGN * c.centro[2]]}
                  width={c.tamano[0]} height={c.tamano[1]} length={c.tamano[2]}
                  materials={[MATERIAL[c.clase]]}
                />
              ))}
            </ViroNode>
          </>
            )}
          </ViroNode>
        </ViroARPlane>
      )}
    </ViroARScene>
  );
}