"""Offline private evidence -> staged period envelope. Never writes a database.
Usage: python scripts/bettingexpert-stage-periods.py GLOBAL_JSON GUID EVIDENCE_DIR OUTPUT_JSON READ_AT
Evidence dir: pages.json, aggregate-request.json, aggregate-response.json,
aggregate-meta.json. Must be populated by the reviewed source receipt workflow.
This tool does not authenticate an arbitrary directory or permit publishing it.
"""
import sys,json,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'crawler/platforms/bettingexpert/periods'))
from stage import stage_files

def main():
    source,guid,directory,output,read_at=sys.argv[1:]
    rows=json.loads(pathlib.Path(source).read_text());matches=[r for r in rows if r.get('guid')==guid]
    if len(matches)!=1:raise ValueError('global_identity_not_unique')
    directory=pathlib.Path(directory)
    staged=stage_files(matches[0],directory/'pages.json',directory/'aggregate-request.json',directory/'aggregate-response.json',directory/'aggregate-meta.json',read_at=read_at)
    path=pathlib.Path(output)
    with path.open('x')as f:json.dump(staged,f,indent=2)
    path.chmod(0o600)
    print(json.dumps({'identity':staged['identity'],'periods':staged['periods']['periods'],'productionReady':False}))
if __name__=='__main__':main()
