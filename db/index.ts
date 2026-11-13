// RAMA DEMO (demo/top-mys-synthetic): datos 100% sinteticos en Postgres en memoria (PGlite).
// Sustituye la conexion Neon de produccion. NO integrar en master.
// La interfaz exportada (`db` de drizzle) es identica, asi que las paginas no cambian.
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from './schema'
import { DEMO_SQL } from './demo-sql'

const client = new PGlite()

// PGlite serializa las consultas en orden de llegada: el DDL+seed se ejecuta
// antes de cualquier consulta de las paginas, aunque no lo esperemos aqui.
void client.exec(DEMO_SQL).catch((e) => {
  console.error('demo seed failed', e)
})

export const db = drizzle(client, { schema })
