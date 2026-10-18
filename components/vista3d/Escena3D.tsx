/**
 * Escena 3D SIN AR (Entrega 2): ViroScene de ViroReact 3.0.2, montada con Viro3DSceneNavigator
 * (Vista3DScreen.tsx). No usa la cámara del teléfono ni abre una sesión AR.
 * Dibuja las cajas y marcos que ya calculó planGeometry.generarMaqueta: no hay geometría propia aquí.
 *
 * Sin ViroOrbitCamera: en el iPhone no llegó a activarse y la pantalla quedó negra (ver camara3d.ts).
 * La cámara por defecto de Viro se queda en el origen mirando a −Z, y la maqueta se coloca delante con
 * tres nodos: alejar (posición), inclinar (X) y girar (Y), con su centro llevado al origen.
 *
 * Datos por viroAppProps: { cajas, transformacion } (camara3d.transformacion).
 */
import React from 'react';
import { ViroAmbientLight, ViroBox, ViroDirectionalLight, ViroMaterials, ViroNode, ViroScene } from '@reactvision/react-viro';
import type { Caja } from '../plan/planGeometry';
import type { transformacion } from './camara3d';

// Mismos tonos que la maqueta en AR (MaquetaScene.tsx: maqPiso, maqPared, maqDintel) con nombres propios.
ViroMaterials.createMaterials({
  v3dPiso: { diffuseColor: '#D8CBB4', lightingModel: 'Lambert' },
  v3dPared: { diffuseColor: '#F2F2F2', lightingModel: 'Lambert' },
  v3dDintel: { diffuseColor: '#E8E8E8', lightingModel: 'Lambert' },
});
const POR_CLASE: Record<Caja['clase'], string> = { piso: 'v3dPiso', pared: 'v3dPared', dintel: 'v3dDintel' };

/** Material para el color propio de una caja (marco, viga, columna); se crea una sola vez por color. */
const creados = new Set<string>();
function materialDe(c: Caja): string {
  if (!c.color || !/^#[0-9a-f]{6}$/i.test(c.color)) return POR_CLASE[c.clase];
  const nombre = `v3d_${c.color.slice(1).toLowerCase()}`;
  if (!creados.has(nombre)) {
    ViroMaterials.createMaterials({ [nombre]: { diffuseColor: c.color, lightingModel: 'Lambert' } });
    creados.add(nombre);
  }
  return nombre;
}

export default function Escena3D(props: any) {
  const p = props?.sceneNavigator?.viroAppProps ?? {};
  const cajas: Caja[] = p.cajas ?? [];
  const t: ReturnType<typeof transformacion> | undefined = p.transformacion;
  if (!t) return <ViroScene />;
  return (
    <ViroScene>
      <ViroAmbientLight color="#FFFFFF" intensity={420} />
      <ViroDirectionalLight color="#FFFFFF" direction={[-0.4, -1, -0.6]} intensity={650} />
      <ViroNode position={t.alejar}>
        <ViroNode rotation={t.inclinar}>
          <ViroNode rotation={t.girar}>
            <ViroNode position={t.centrar}>
              {cajas.map(c => (
                <ViroBox key={c.id} position={c.centro} width={c.tamano[0]} height={c.tamano[1]} length={c.tamano[2]} materials={[materialDe(c)]} />
              ))}
            </ViroNode>
          </ViroNode>
        </ViroNode>
      </ViroNode>
    </ViroScene>
  );
}
