"""data/buildings/<id>/*.json + buildings.json → SQLite(app.db) 일회성 이행.

사용:
    python migrate_json_to_db.py          # app.db 없을 때만 생성
    python migrate_json_to_db.py --force  # 기존 app.db 비우고 다시 적재

주의: 관리자 편집은 이제 DB로 들어가므로, 운영 서버에서는 '서버 라이브 JSON'을
기준으로 이 스크립트를 돌려야 한다(로컬 git 데이터가 서버보다 옛날일 수 있음).
"""
import os, sys, json
import db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')


def load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def migrate(force=False):
    if os.path.exists(db.DB_PATH):
        if not force:
            print(f"이미 존재: {db.DB_PATH}  (다시 만들려면 --force)")
            return
        os.remove(db.DB_PATH)
        print(f"기존 DB 삭제: {db.DB_PATH}")

    db.init_db()
    conn = db.get_conn()
    cur = conn.cursor()

    # 1) buildings.json
    buildings = load(os.path.join(DATA_DIR, 'buildings.json'), [])
    for i, b in enumerate(buildings):
        cur.execute(
            "INSERT INTO buildings (id, name, ord, summary) VALUES (?,?,?,?)",
            (b.get('id'), b.get('name'), i, json.dumps(b, ensure_ascii=False))
        )
    print(f"buildings: {len(buildings)}개")

    # 2) 건물별 디렉토리
    bdir_root = os.path.join(DATA_DIR, 'buildings')
    for bid in sorted(os.listdir(bdir_root)):
        bdir = os.path.join(bdir_root, bid)
        if not os.path.isdir(bdir):
            continue

        meta = load(os.path.join(bdir, 'meta.json'), {})
        cur.execute("INSERT INTO building_meta (building_id, meta) VALUES (?,?)",
                    (bid, json.dumps(meta, ensure_ascii=False)))

        floors = load(os.path.join(bdir, 'floors.json'), {})
        floors_wo_splats = {k: v for k, v in floors.items() if k != 'splats'}
        cur.execute(
            "INSERT INTO floor_config (building_id, data) VALUES (?,?)",
            (bid, json.dumps(floors_wo_splats, ensure_ascii=False))
        )
        # splats: floors.json 안의 {floor_id: [ {splatConfig,splatUrl}, ... ]}
        ordc = 0
        for floor_id, items in (floors.get('splats') or {}).items():
            for sp in items:
                cur.execute("INSERT INTO splats (building_id, floor_id, ord, data) VALUES (?,?,?,?)",
                            (bid, floor_id, ordc, json.dumps(sp, ensure_ascii=False)))
                ordc += 1

        markers = load(os.path.join(bdir, 'markers.json'), {})
        ordc = 0
        for floor_id, items in markers.items():
            for m in items:
                cur.execute(
                    "INSERT INTO markers (building_id, floor_id, room_name, kind, ord, data) VALUES (?,?,?,?,?,?)",
                    (bid, floor_id, m.get('roomName'), m.get('kind'), ordc,
                     json.dumps(m, ensure_ascii=False)))
                ordc += 1

        routes = load(os.path.join(bdir, 'routes.json'), {})
        ordc = 0
        for floor_id, items in routes.items():
            for rt in items:
                cur.execute(
                    "INSERT INTO routes (building_id, floor_id, name, ord, data) VALUES (?,?,?,?,?)",
                    (bid, floor_id, rt.get('name'), ordc, json.dumps(rt, ensure_ascii=False)))
                ordc += 1

        cams = load(os.path.join(bdir, 'camera_paths.json'), {})
        ordc = 0
        for floor_id, pathmap in cams.items():
            for path_key, points in pathmap.items():
                cur.execute(
                    "INSERT INTO camera_paths (building_id, floor_id, path_key, ord, points) VALUES (?,?,?,?,?)",
                    (bid, floor_id, path_key, ordc, json.dumps(points, ensure_ascii=False)))
                ordc += 1

        print(f"  [{bid}] markers={sum(len(v) for v in markers.values())} "
              f"routes={sum(len(v) for v in routes.values())} "
              f"splats={sum(len(v) for v in (floors.get('splats') or {}).values())} "
              f"camera_floors={len(cams)}")

    conn.commit()
    conn.close()
    print(f"\n완료 → {db.DB_PATH}")


if __name__ == '__main__':
    migrate(force='--force' in sys.argv)
