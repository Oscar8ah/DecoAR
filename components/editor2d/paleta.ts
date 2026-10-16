/**
 * Colores del editor 2D. Los de cada tipo de espacio son LOS MISMOS de la maqueta en AR
 * (materiales ed* de components/ar/EditorMesa.tsx), para que el mismo proyecto se vea igual
 * en el plano y sobre la mesa. Se copian aquí porque importar EditorMesa.tsx arrastraría Viro
 * al editor, que debe funcionar sin AR. Si cambian allí, deben cambiar aquí.
 */
import { esCuarto } from '../plan/planModel';

const POR_TIPO: Record<string, string> = {
  sala: '#93C5FD', zona: '#FCD34D', cocina: '#FCA5A5', habitacion: '#C4B5FD',
  bano: '#67E8F9', pasillo: '#D1D5DB', otro: '#A7F3D0',
};
const ESTRUCTURA = '#6B7280';

/** Color base de un espacio según su tipo visual (ver tipoVisual en vistaLienzo.ts). */
export const colorTipo = (tipo: string) => (esCuarto(tipo) ? POR_TIPO[tipo] ?? POR_TIPO.otro : ESTRUCTURA);

export const colorVano = (tipo: string | undefined) => (tipo === 'ventana' ? '#67E8F9' : '#F59E0B');   // edVano

/** Tonos de la pantalla (concepto del Editor Planta compartido por el propietario). */
export const T = {
  fondo: '#0D1018',          // papel del plano
  panel: '#161A25',          // barras superior e inferior
  boton: '#222838',
  linea: '#1B2030',          // cuadrícula cada 0,5 m
  lineaFuerte: '#262D40',    // cuadrícula cada metro
  texto: '#E8EBF3',
  textoSuave: '#98A1B7',
  cota: '#B9A6F7',           // cotas generales, como el "4,00 m" del concepto
  acento: '#7357F0',         // acción principal (Revisar plano / Generar 3D)
};
