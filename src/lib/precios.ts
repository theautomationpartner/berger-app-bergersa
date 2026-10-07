/**
 * Los precios de un pedido: lista, descuentos de contado y lo que se factura.
 *
 * Está acá y no en la pantalla porque es la única parte del circuito donde un error no se ve:
 * un total mal calculado se parece bastante a un total bien calculado, y para cuando alguien lo
 * nota ya se facturó. Siendo funciones puras se pueden probar número por número.
 *
 * **Los descuentos son en cascada, no se suman.** Tres descuentos de 20, 17 y 5 no son un 42%:
 * son 20 sobre el precio, 17 sobre lo que quedó, y 5 sobre lo que quedó de eso —un 37,22%—. Es
 * como los negocia BERGER y es como están cargados en ⚙️Configuración.
 *
 * El orden importa y lo decide el tablero, no este archivo. Si mañana BERGER cambia cuál va
 * primero, o agrega un cuarto, la cascada lo toma: se aplican en el orden que diga la columna.
 */

export interface DescuentoConfigurado {
  /** 1, 2, 3… El orden en que se aplican, uno sobre el resultado del anterior. */
  orden: number
  /** En porcentaje: 20 es 20%. */
  porcentaje: number
}

export interface PrecioDeUnidad {
  /** Precio de lista de UNA unidad, sin IVA. */
  listaSinIva: number
  listaConIva: number
  /** Cada descuento, ya convertido a pesos sobre el precio que le tocaba. */
  descuentos: number[]
  /** Lo que queda después de aplicar la cascada. */
  contadoSinIva: number
  contadoConIva: number
  /** Lo que se le factura: con contado es el precio con descuento; si no, el de lista. */
  facturaSinIva: number
  facturaConIva: number
}

/** Dos decimales. Es plata: el tercero no existe en una factura. */
export const redondear = (n: number): number => Math.round(n * 100) / 100

/**
 * Ordena los descuentos como los va a aplicar la cascada.
 *
 * El orden sale de la columna del tablero. Un descuento sin orden va al final: es lo menos
 * arriesgado —se aplica sobre un precio ya reducido, nunca sobre el de lista— y además deja a la
 * vista que le falta el dato.
 */
export const enOrden = (ds: DescuentoConfigurado[]): DescuentoConfigurado[] =>
  [...ds].sort((a, b) => (a.orden || 99) - (b.orden || 99))

/**
 * Aplica la cascada y devuelve lo que se descontó en cada paso, en pesos.
 *
 * En pesos y no en porcentaje porque es lo que va a las columnas del tablero y lo que alguien
 * puede verificar con una calculadora: "20% de 10.000.000" es una cuenta más, y cada cuenta que
 * se rehace es una cuenta que puede dar distinto.
 */
export function cascada(precio: number, descuentos: DescuentoConfigurado[]): number[] {
  let queda = precio
  const pasos: number[] = []
  for (const d of enOrden(descuentos)) {
    const quita = redondear(queda * (d.porcentaje / 100))
    pasos.push(quita)
    queda = redondear(queda - quita)
  }
  return pasos
}

/**
 * El precio de UNA unidad, con todo calculado.
 *
 * @param iva  El porcentaje de IVA del producto. Sale del Catálogo y no de una constante: BERGER
 *             lo define por producto, y un tractor y un implemento no tienen por qué compartirlo.
 * @param contado  Si la forma de pago es contado. Es lo único que habilita los descuentos.
 */
export function precioDeUnidad(
  listaSinIva: number,
  iva: number,
  descuentos: DescuentoConfigurado[],
  contado: boolean,
): PrecioDeUnidad {
  const conIva = (n: number) => redondear(n * (1 + (iva || 0) / 100))

  const lista = redondear(listaSinIva || 0)
  const pasos = contado ? cascada(lista, descuentos) : []
  const contadoSinIva = redondear(pasos.reduce((queda, quita) => queda - quita, lista))

  /* Sin contado no hay descuento, así que lo que se factura ES el precio de lista. Se escribe
     igual en las dos columnas en vez de dejar la de contado vacía: una columna vacía se lee como
     "falta cargar", y acá lo correcto es que valgan lo mismo. */
  const facturaSinIva = contado ? contadoSinIva : lista

  return {
    listaSinIva: lista,
    listaConIva: conIva(lista),
    descuentos: pasos,
    contadoSinIva,
    contadoConIva: conIva(contadoSinIva),
    facturaSinIva,
    facturaConIva: conIva(facturaSinIva),
  }
}

export interface RenglonDePedido {
  /** Id del producto en el Catálogo. */
  productoId: string
  cantidad: number
  precio: PrecioDeUnidad
}

export interface TotalesDePedido {
  listaSinIva: number
  listaConIva: number
  contadoSinIva: number
  contadoConIva: number
  facturaSinIva: number
  facturaConIva: number
  unidades: number
}

/**
 * Los totales del pedido.
 *
 * Se multiplica por la cantidad ACÁ y no en el precio unitario porque el tablero guarda las dos
 * cosas por separado: el subelemento lleva el precio de una unidad y su cantidad, y el item lleva
 * el total. Mezclarlos haría que un subelemento de tres unidades mostrara el precio de las tres,
 * que no es lo que dice la columna.
 */
export function totalesDePedido(renglones: RenglonDePedido[]): TotalesDePedido {
  const sumar = (f: (r: RenglonDePedido) => number) =>
    redondear(renglones.reduce((a, r) => a + f(r) * r.cantidad, 0))

  return {
    listaSinIva: sumar((r) => r.precio.listaSinIva),
    listaConIva: sumar((r) => r.precio.listaConIva),
    contadoSinIva: sumar((r) => r.precio.contadoSinIva),
    contadoConIva: sumar((r) => r.precio.contadoConIva),
    facturaSinIva: sumar((r) => r.precio.facturaSinIva),
    facturaConIva: sumar((r) => r.precio.facturaConIva),
    unidades: renglones.reduce((a, r) => a + r.cantidad, 0),
  }
}

/**
 * Cuánto se descontó en total, en porcentaje, para mostrarlo arriba.
 *
 * Es el dato que la gente quiere ver de un vistazo —"me están haciendo un 37%"— y el que nadie
 * calcula bien de cabeza cuando los descuentos van en cascada.
 */
export function descuentoTotalEnPorcentaje(descuentos: DescuentoConfigurado[]): number {
  const queda = enOrden(descuentos).reduce((q, d) => q * (1 - d.porcentaje / 100), 1)
  return redondear((1 - queda) * 100)
}
