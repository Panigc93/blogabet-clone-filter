#!/usr/bin/env python3
"""Consolida la captura local Bet2Earn (perfiles + historiales JSON) en
data/bet2earn/profiles.jsonl (privado, gitignored) para la ruta de import.

Uso: python3 scripts/bet2earn-prepare-jsonl.py <dir_captura> <salida.jsonl>

El dir de captura debe contener:
  premium_list.json      {"users":[{id,name,...}]}   listado /api/user/premium
  free_list_1740.json    [{id,name,...}]             listado /api/user/free (picks>=1)
  profiles/<id>.json     respuesta /api/user/{nombre}
  histories/<id>.json    respuesta /api/user/{nombre}/fullExpired
  state.json             {"apartados":[{id,...}]}    perfiles 404 de la captura

Solo lee ficheros locales; no hace peticiones. Conserva por fila: slug,
capturedAt, listSource, perfil (subconjunto de campos), agregados mensuales
por created_at, totales y lastPickAt. Las filas que no consolidan quedan
registradas con quarantine, nunca corregidas a mano.
"""
import json, sys, os, glob
from datetime import datetime, timezone

def main(capdir, out):
    prem = json.load(open(os.path.join(capdir, 'premium_list.json')))['users']
    free = json.load(open(os.path.join(capdir, 'free_list_1740.json')))
    apartados = {a['id'] for a in json.load(open(os.path.join(capdir, 'state.json')))['apartados']}
    rows = []
    seen = set()
    for list_source, users in (('premium', prem), ('free', free)):
        for u in users:
            pid = u['id']
            if pid in apartados or pid in seen:
                continue
            seen.add(pid)
            slug = u['name'].lower()
            pf = os.path.join(capdir, 'profiles', pid + '.json')
            hf = os.path.join(capdir, 'histories', pid + '.json')
            row = {'slug': slug, 'listSource': list_source,
                   'sourceUrl': 'https://bet2earn.com/api/user/' + slug,
                   'quarantine': None}
            try:
                prof = json.load(open(pf))['users']
                hist = json.load(open(hf))['tipsFullExpired']
            except Exception as e:
                row.update(capturedAt=None, profile=None, expiredPicks=0, months={},
                           totals=None, lastPickAt=None,
                           quarantine={'reason': f'local capture file unreadable: {type(e).__name__}'})
                rows.append(row); continue
            if prof['name'].lower() != slug:
                row.update(capturedAt=None, profile=None, expiredPicks=0, months={},
                           totals=None, lastPickAt=None,
                           quarantine={'reason': 'profile name does not match list slug'})
                rows.append(row); continue
            months = {}
            last = None
            profit = stakes = 0.0
            bad = False
            for p in hist:
                ca = p.get('created_at')
                if not ca:
                    bad = True; break
                ym = ca[:7]
                m = months.setdefault(ym, {'picks': 0, 'profit': 0.0, 'stakes': 0.0})
                m['picks'] += 1
                m['profit'] += p.get('profit') or 0
                m['stakes'] += p.get('stake') or 0
                profit += p.get('profit') or 0
                stakes += p.get('stake') or 0
                if last is None or ca > last:
                    last = ca
            if bad:
                row.update(capturedAt=None, profile=None, expiredPicks=len(hist), months={},
                           totals=None, lastPickAt=None,
                           quarantine={'reason': 'pick without created_at: month aggregation refused'})
                rows.append(row); continue
            row.update(
                capturedAt=datetime.fromtimestamp(os.path.getmtime(hf), timezone.utc).isoformat(),
                profile={'id': prof['id'], 'name': prof['name'], 'avatar': prof.get('avatar'),
                         'created_at': prof.get('created_at'), 'count_tips': prof.get('count_tips'),
                         'tipsExpiredCount': prof.get('tipsExpiredCount'),
                         'followers_count': prof.get('followers_count'),
                         'yield': prof.get('yield'), 'profit': prof.get('profit')},
                expiredPicks=len(hist), months=months,
                totals={'picks': len(hist), 'profit': profit, 'stakes': stakes},
                lastPickAt=last)
            rows.append(row)
    with open(out, 'w') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'{len(rows)} filas -> {out} (premium={sum(1 for r in rows if r["listSource"]=="premium")}, free={sum(1 for r in rows if r["listSource"]=="free")}, cuarentena={sum(1 for r in rows if r["quarantine"])})')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
