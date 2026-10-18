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
/**
 * Objetos de construcción: un color por tipo para distinguirlos en el plano 2D. (La maqueta de E2 los
 * pinta todos en gris; aquí se separan porque en el plano conviven muchos y hay que reconocerlos.)
 */
const POR_ESTRUCTURA: Record<string, string> = {
  pared: '#CBD5E1', vidrio: '#7DD3FC', columna: '#A8A29E', viga: '#D6A15C', baranda: '#FBBF24',
  hueco: '#F87171', escalera: '#FB923C', exterior: '#84CC16',
};

/** Color base de un espacio según su tipo visual (ver tipoVisual en vistaLienzo.ts). */
export const colorTipo = (tipo: string) => (esCuarto(tipo) ? POR_TIPO[tipo] ?? POR_TIPO.otro : POR_ESTRUCTURA[tipo] ?? ESTRUCTURA);

/** Colores de la web (visor3d.js:7565): arco verde, vano celeste, puerta naranja. Ventana: extensión de DecoAR. */
const POR_VANO: Record<string, string> = { arco: '#22C55E', vano: '#38BDF8', puerta: '#F59E0B', ventana: '#67E8F9' };
export const colorVano = (tipo: string | undefined, estiloVentana?: string) =>
  tipo === 'ventana' && estiloVentana ? POR_ESTILO_VENTANA[estiloVentana] ?? POR_VANO.ventana : POR_VANO[tipo ?? ''] ?? POR_VANO.arco;
/** Ventanas (Entrega 3): el estilo se ve en el plano 2D (en 3D todavía no hay marco ni vidrio). */
const POR_ESTILO_VENTANA: Record<string, string> = { blanca: '#F1F5F9', negra: '#1F2937', balcon: '#67E8F9' };
/** "−" y muro cerrado. */
export const COLOR_CERRADO = '#F87171';

/** "+" de un muro (visor3d.js:7543): celeste entre cuartos, verde lima hacia un espacio exterior. */
export const colorMas = (exterior: boolean) => (exterior ? '#A3E635' : '#38BDF8');

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
