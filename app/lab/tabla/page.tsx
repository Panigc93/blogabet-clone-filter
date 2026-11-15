import { TipsterRow } from '@/components/TipsterRow'
import { fromTipstrrSnapshot } from '@/components/tipster-card-model'
import { TLE_SNAPSHOT, STATMIND_SNAPSHOT } from '@/app/lab/tipstrr/ficha/fixtures'

// Lab route: the REAL table row component fed with dated Tipstrr captures.
// Not a sync, not deployed data: each row shows its capture date. Blogabet
// rows keep coming from the DB via fromDbTipster on the main page.
export default function LabTablaPage() {
  const rows = [TLE_SNAPSHOT, STATMIND_SNAPSHOT].map(fromTipstrrSnapshot)
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px' }}>
      <div style={{ background: '#d9edf7', border: '1px solid #bce8f1', color: '#31708f', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
        <strong>Vista de prueba</strong>: componente real de la tabla de Superblogabet alimentado con capturas
        fechadas de Tipstrr. No es una sincronización ni una integración desplegada; los datos Blogabet de la
        portada siguen viniendo de la base de datos.
      </div>
      {rows.map((r) => (
        <TipsterRow key={r.name} tipster={r} />
      ))}
    </div>
  )
}
