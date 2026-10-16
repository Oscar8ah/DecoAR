import { Plano } from './planModel';

/**
 * Dos planos REALES exportados de `modelos_3d_plano` (14 oct 2026), tal cual los generó la IA.
 * Contienen SOLO geometría y acabados: se verificó que el JSON no trae teléfono, sesión ni
 * ningún otro dato personal (esos viven en otras columnas de la tabla, que no se exportaron).
 *
 * Si alguno pertenece a un cliente y no debe ir dentro de la app, basta con borrar este archivo
 * y su uso en App.tsx: nada más depende de él (las pruebas lo copian aparte).
 *
 * Observaciones sobre los datos (no son errores del generador):
 *  · `paredes_compartidas` trae lados incorrectos (p. ej. dice que el baño está al norte de la
 *    cocina cuando está al sur). El generador lo recalcula, igual que visor3d.js:8266-8294.
 *  · No hay `vanos`: los cuartos salen cerrados, sin puertas ni ventanas.
 *  · El plano 2 deja 1,5 m libres entre el baño y la cocina (sin piso en la maqueta).
 */
export const PLANO_REAL_1: Plano = {"tipo":"apartamento","modulos":[{"x":0,"z":0,"id":"estancia","alto":2.6,"ancho":3.0,"largo":3.5,"nombre":"Estancia","es_humeda":false,"color_pared":"#F5F5F5","material_piso":"madera"},{"x":3.0,"z":0,"id":"cocina","alto":2.6,"ancho":3.0,"largo":3.5,"nombre":"Cocina","es_humeda":true,"color_pared":"#F5F5F5","material_piso":"ceramica"},{"x":6.0,"z":0,"id":"area_lavado","alto":2.6,"ancho":1.5,"largo":3.5,"nombre":"Área de lavado","es_humeda":true,"color_pared":"#F5F5F5","material_piso":"ceramica"},{"x":3.0,"z":3.5,"id":"bano","alto":2.6,"ancho":2.0,"largo":2.5,"nombre":"Baño","es_humeda":true,"color_pared":"#F5F5F5","material_piso":"ceramica"},{"x":5.0,"z":3.5,"id":"recamara","alto":2.6,"ancho":3.5,"largo":4.0,"nombre":"Recámara","es_humeda":false,"color_pared":"#F5F5F5","material_piso":"madera"}],"alto_piso":2.6,"paredes_compartidas":[{"lado":"este","modulo_a":"estancia","modulo_b":"cocina"},{"lado":"este","modulo_a":"cocina","modulo_b":"area_lavado"},{"lado":"norte","modulo_a":"cocina","modulo_b":"bano"},{"lado":"este","modulo_a":"bano","modulo_b":"recamara"}]};

export const PLANO_REAL_2: Plano = {"tipo":"apartamento","modulos":[{"x":0,"z":2.5,"id":"dormitorio","alto":2.6,"ancho":3.5,"largo":4.0,"nombre":"Dormitorio","es_humeda":false,"color_pared":"#F5F5F5","material_piso":"madera"},{"x":0,"z":0,"id":"baño","alto":2.6,"ancho":2.0,"largo":2.5,"nombre":"Baño","es_humeda":true,"color_pared":"#F5F5F5","material_piso":"ceramica"},{"x":3.5,"z":2.5,"id":"sala_comedor","alto":2.6,"ancho":4.5,"largo":5.0,"nombre":"Sala-Comedor","es_humeda":false,"color_pared":"#F5F5F5","material_piso":"madera"},{"x":3.5,"z":0,"id":"cocina","alto":2.6,"ancho":3.0,"largo":2.5,"nombre":"Cocina","es_humeda":true,"color_pared":"#F5F5F5","material_piso":"ceramica"}],"alto_piso":2.6,"paredes_compartidas":[{"lado":"este","modulo_a":"dormitorio","modulo_b":"sala_comedor"},{"lado":"este","modulo_a":"baño","modulo_b":"cocina"},{"lado":"sur","modulo_a":"sala_comedor","modulo_b":"cocina"}]};