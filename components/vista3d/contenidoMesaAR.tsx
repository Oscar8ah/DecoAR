/**
 * Contenido de la mesa en AR con objetos (Entrega 3b). Usa la entrada EXISTENTE `contenidoMesa` de
 * MaquetaScene (sin modificarla): cuando se usa, la escena deja de dibujar la maqueta por su cuenta, así
 * que aquí se dibuja igual que ella (MaquetaScene.tsx:216-228: mismos materiales maqPiso/maqPared/
 * maqDintel/maqBase, misma escala y Z_SIGN = −1) y se le suman los objetos del editor.
 * AppInicio solo lo pasa cuando hay objetos: sin objetos, la AR queda exactamente como antes.
 */
import React from 'react';
import { ViroBox, ViroMaterials, ViroNode, ViroQuad, ViroSphere } from '@reactvision/react-viro';
import type { ContextoMesa } from '../plan/editorMesaGeom';
import type { Plano } from '../plan/planModel';
import type { Mueble } from '../plan/planEditor';
import { Caja, generarMaqueta } from '../plan/planGeometry';
import { objetosEnEscena } from '../objetos/objetos3d';

const Z_SIGN = -1;   // MaquetaScene.tsx:35
const MATERIAL: Record<Caja['clase'], string> = { piso: 'maqPiso', pared: 'maqPared', dintel: 'maqDintel' };   // MaquetaScene.tsx:49

const creados = new Set<string>();
function materialColor(color: string): string {
  const nombre = `arObj_${color.slice(1).toLowerCase()}`;
  if (!creados.has(nombre)) { ViroMaterials.createMaterials({ [nombre]: { diffuseColor: color, lightingModel: 'Lambert' } }); creados.add(nombre); }
  return nombre;
}

/** Devuelve la función que MaquetaScene llama con su contexto (escala de la maqueta, ya colocada en la mesa). */
export function contenidoConObjetos(plano: Plano, muebles: Mueble[]) {
  const maqueta = generarMaqueta(plano);
  const objetos = objetosEnEscena(muebles, plano, Z_SIGN);
  return (ctx: ContextoMesa) => {
    const e = ctx.escala, ext = maqueta.extension;
    return (
      <ViroNode scale={[e, e, e]}>
        <ViroQuad position={[0, 0.002 / e, 0]} rotation={[-90, 0, 0]} width={ext[0] * 1.08} height={ext[2] * 1.08} materials={['maqBase']} />
        {maqueta.cajas.map(c => (
          <ViroBox key={c.id} position={[c.centro[0], c.centro[1], Z_SIGN * c.centro[2]]}
            width={c.tamano[0]} height={c.tamano[1]} length={c.tamano[2]} materials={[MATERIAL[c.clase]]} />
        ))}
        {objetos.map((o, i) => o.forma === 'esfera'
          ? <ViroSphere key={`o${i}`} position={o.pos} radius={o.tam[0] / 2} materials={[materialColor(o.color)]} opacity={o.opacidad ?? 1} />
          : <ViroBox key={`o${i}`} position={o.pos} rotation={[0, o.rotY, 0]} width={o.tam[0]} height={o.tam[1]} length={o.tam[2]}
              materials={[materialColor(o.color)]} opacity={o.opacidad ?? 1} />)}
      </ViroNode>
    );
  };
}
