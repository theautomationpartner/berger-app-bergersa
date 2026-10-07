/**
 * Lo que el concesionario necesita para armar un pedido: el catálogo y los descuentos vigentes.
 *
 * Los dos se leen de monday en cada entrada a la pantalla, no se escriben nunca desde acá. El
 * precio de lista, el IVA y los porcentajes de descuento son decisiones de BERGER: la app los usa
 * para calcular, y si alguien los cambia en el tablero el pedido siguiente ya sale con los nuevos.
 */
import type { DescuentoConfigurado } from '@/lib/precios'
import { COL_CATALOGO, COL_CONFIG, CONFIG_DESCUENTO_CONTADO } from './columns'
import { aNumeroEspejo, porId, texto, type ColumnaCruda } from './parse'
import { mondayApi } from './sdk'

export interface ProductoDeCatalogo {
  id: string
  nombre: string
  modelo: string
  codigo: string
  marca: string
  linea: string
  gama: string
  traccion: string
  rodado: string
  potenciaKw: number | null
  cilindrada: number | null
  /** Precio de lista, sin IVA. */
  precio: number
  /** El IVA de ESTE producto, en porcentaje. */
  iva: number
  /** Las fotos del producto, para poder mirarlas antes de pedirlo. */
  imagenes: string[]
  /** `Discontinuado` no se puede pedir, pero sigue existiendo en pedidos viejos. */
  vigente: boolean
}

const COLUMNAS = [
  COL_CATALOGO.modelo,
  COL_CATALOGO.codigo,
  COL_CATALOGO.marca,
  COL_CATALOGO.linea,
  COL_CATALOGO.gama,
  COL_CATALOGO.traccion,
  COL_CATALOGO.rodado,
  COL_CATALOGO.potenciaKw,
  COL_CATALOGO.cilindrada,
  COL_CATALOGO.precioLista,
  COL_CATALOGO.iva,
  COL_CATALOGO.imagen,
  COL_CATALOGO.estadoComercial,
]

/** Los números de una columna `numbers` vienen como texto. */
const aNumero = (v: string): number | null => {
  const n = Number(String(v).trim().replace(',', '.'))
  return v.trim() && Number.isFinite(n) ? n : null
}

/** Una columna de archivos devuelve las URL separadas por coma. */
const urls = (v: string): string[] =>
  v
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)

export async function catalogoDeVenta(): Promise<ProductoDeCatalogo[]> {
  const r = await mondayApi<{
    boards: {
      items_page: { items: { id: string; name: string; column_values: ColumnaCruda[] }[] }
    }[]
  }>('catalogoDeVenta', { columnas: COLUMNAS, limite: 500 })

  return (r.boards?.[0]?.items_page.items ?? [])
    .map((i) => {
      const c = porId(i.column_values)
      return {
        id: i.id,
        nombre: i.name.trim(),
        modelo: texto(c[COL_CATALOGO.modelo]),
        codigo: texto(c[COL_CATALOGO.codigo]),
        marca: texto(c[COL_CATALOGO.marca]),
        linea: texto(c[COL_CATALOGO.linea]),
        gama: texto(c[COL_CATALOGO.gama]),
        traccion: texto(c[COL_CATALOGO.traccion]),
        rodado: texto(c[COL_CATALOGO.rodado]),
        potenciaKw: aNumero(texto(c[COL_CATALOGO.potenciaKw])),
        cilindrada: aNumero(texto(c[COL_CATALOGO.cilindrada])),
        precio: aNumeroEspejo(texto(c[COL_CATALOGO.precioLista])) ?? 0,
        iva: aNumeroEspejo(texto(c[COL_CATALOGO.iva])) ?? 0,
        imagenes: urls(texto(c[COL_CATALOGO.imagen])),
        /* Vacío cuenta como vigente: un producto sin estado cargado se puede pedir, y lo contrario
           dejaría el catálogo vacío el día que alguien agregue uno sin completar la columna. */
        vigente: texto(c[COL_CATALOGO.estadoComercial]) !== 'Discontinuado',
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Los descuentos de contado, en el orden en que se aplican.
 *
 * Vienen del tablero de Configuración y no de una constante por un motivo concreto: BERGER los
 * renegocia. Cambiar un porcentaje, cambiar el orden o agregar un cuarto descuento son cosas que
 * tienen que poder hacerse en monday un martes a la tarde, sin tocar la app.
 */
export async function descuentosDeContado(): Promise<DescuentoConfigurado[]> {
  const r = await mondayApi<{
    boards: { items_page: { items: { id: string; column_values: ColumnaCruda[] }[] } }[]
  }>('configuracionDeVenta', {
    columnas: [COL_CONFIG.que, COL_CONFIG.orden, COL_CONFIG.porcentaje],
    limite: 100,
  })

  return (
    (r.boards?.[0]?.items_page.items ?? [])
      .map((i) => porId(i.column_values))
      .filter((c) => texto(c[COL_CONFIG.que]) === CONFIG_DESCUENTO_CONTADO)
      .map((c) => ({
        orden: Number(texto(c[COL_CONFIG.orden])) || 0,
        porcentaje: aNumeroEspejo(texto(c[COL_CONFIG.porcentaje])) ?? 0,
      }))
      /* Un descuento en 0 no descuenta nada y ensucia la pantalla con una línea que dice "0%". */
      .filter((d) => d.porcentaje > 0)
      .sort((a, b) => (a.orden || 99) - (b.orden || 99))
  )
}
