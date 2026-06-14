"""SQLite 데이터 접근 계층.

기존 data/buildings/<id>/*.json 구조를 정규화 테이블로 옮긴다.
설계 원칙: markers/routes/splats/camera_paths 는 '행 단위' 테이블로 두되,
프론트가 기대하는 객체 모양을 100% 그대로 돌려주려고 각 행에 원본 객체를
JSON 컬럼(data/points)으로 통째 보존한다. room_name·kind 같은 건 별도 컬럼으로
빼서 SQL 쿼리·통계가 가능하게 한다.

read_building() 이 만들던 머지 dict 와 get_building_data() 결과가 완전히
동일하도록 재조립한다(app.py 의 엑셀 status 주입은 그대로 엔드포인트에서).
"""
import os, json, sqlite3
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'data', 'app.db')

SCHEMA = """
CREATE TABLE IF NOT EXISTS buildings (
    id      TEXT PRIMARY KEY,
    name    TEXT,
    ord     INTEGER,
    summary TEXT            -- buildings.json 항목 전체(JSON)
);
CREATE TABLE IF NOT EXISTS building_meta (
    building_id TEXT PRIMARY KEY,
    meta        TEXT        -- meta.json 전체(JSON): id,name,info,cameraPosition,roofPins,entranceList
);
CREATE TABLE IF NOT EXISTS floor_config (
    building_id TEXT PRIMARY KEY,
    data        TEXT        -- floors.json 에서 splats 만 뺀 나머지 전체(floorRows, models, fitViews 등)
);
CREATE TABLE IF NOT EXISTS markers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id TEXT NOT NULL,
    floor_id    TEXT NOT NULL,
    room_name   TEXT,
    kind        TEXT,
    ord         INTEGER,    -- 건물 내 전체 순서(층·항목 순서 보존)
    data        TEXT        -- 마커 객체 전체(JSON) — 재조립의 원천
);
CREATE INDEX IF NOT EXISTS idx_markers_bld ON markers(building_id);
CREATE TABLE IF NOT EXISTS routes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id TEXT NOT NULL,
    floor_id    TEXT NOT NULL,
    name        TEXT,
    ord         INTEGER,
    data        TEXT
);
CREATE INDEX IF NOT EXISTS idx_routes_bld ON routes(building_id);
CREATE TABLE IF NOT EXISTS splats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id TEXT NOT NULL,
    floor_id    TEXT NOT NULL,
    ord         INTEGER,
    data        TEXT        -- {splatConfig, splatUrl}
);
CREATE INDEX IF NOT EXISTS idx_splats_bld ON splats(building_id);
CREATE TABLE IF NOT EXISTS camera_paths (
    building_id TEXT NOT NULL,
    floor_id    TEXT NOT NULL,
    path_key    TEXT NOT NULL,
    ord         INTEGER,
    points      TEXT,       -- 카메라 포인트 배열(JSON)
    PRIMARY KEY (building_id, floor_id, path_key)
);
CREATE TABLE IF NOT EXISTS edit_backups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id TEXT NOT NULL,
    category    TEXT NOT NULL,   -- 'markers' | 'routes' | 'splats'
    payload     TEXT,            -- 덮어쓰기 직전의 이전 전체 상태(JSON)
    created_at  TEXT
);
"""


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """테이블이 없으면 생성. import 시 1회 호출."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)


# ---------- 읽기 ----------

def get_buildings_list():
    """GET /api/buildings — buildings.json 과 동일한 list 반환."""
    with get_conn() as conn:
        rows = conn.execute("SELECT summary FROM buildings ORDER BY ord").fetchall()
    return [json.loads(r["summary"]) for r in rows]


def _group_rows(rows):
    """행들을 {floor_id: [data...]} 로, floor 최초 등장 순서 유지하며 묶는다."""
    out = {}
    for r in rows:
        out.setdefault(r["floor_id"], []).append(json.loads(r["data"]))
    return out


def get_building_data(building_id):
    """GET /api/building/<id> 의 원천 — read_building() 머지 dict 와 동일 모양.

    엑셀 시간표/status 주입은 호출 측(app.py)에서 그대로 처리한다.
    건물이 없으면 None.
    """
    with get_conn() as conn:
        meta_row = conn.execute(
            "SELECT meta FROM building_meta WHERE building_id=?", (building_id,)
        ).fetchone()
        if meta_row is None:
            return None  # 디렉토리 없던 건물(global 등) → 기존과 동일하게 404 처리

        merged = json.loads(meta_row["meta"])  # id,name,info,cameraPosition,roofPins,entranceList

        fc = conn.execute(
            "SELECT data FROM floor_config WHERE building_id=?", (building_id,)
        ).fetchone()
        if fc and fc["data"]:
            merged.update(json.loads(fc["data"]))  # floorRows, models, fitViews 등 splats 제외 전체

        merged["splats"] = _group_rows(conn.execute(
            "SELECT floor_id, data FROM splats WHERE building_id=? ORDER BY ord", (building_id,)
        ).fetchall())

        merged["markers"] = _group_rows(conn.execute(
            "SELECT floor_id, data FROM markers WHERE building_id=? ORDER BY ord", (building_id,)
        ).fetchall())

        merged["routes"] = _group_rows(conn.execute(
            "SELECT floor_id, data FROM routes WHERE building_id=? ORDER BY ord", (building_id,)
        ).fetchall())

        cam = {}
        for r in conn.execute(
            "SELECT floor_id, path_key, points FROM camera_paths WHERE building_id=? ORDER BY ord",
            (building_id,)
        ).fetchall():
            cam.setdefault(r["floor_id"], {})[r["path_key"]] = json.loads(r["points"])
        merged["cameraMovements"] = cam

    return merged


def building_exists(building_id):
    with get_conn() as conn:
        return conn.execute(
            "SELECT 1 FROM building_meta WHERE building_id=?", (building_id,)
        ).fetchone() is not None


# ---------- 쓰기(관리자 저장) ----------

def _current_state(conn, building_id, category):
    """백업용: 현재 markers/routes/splats 의 {floor_id:[...]} 상태를 만든다."""
    if category == 'splats':
        rows = conn.execute("SELECT floor_id, data FROM splats WHERE building_id=? ORDER BY ord",
                            (building_id,)).fetchall()
    else:
        rows = conn.execute(f"SELECT floor_id, data FROM {category} WHERE building_id=? ORDER BY ord",
                            (building_id,)).fetchall()
    return _group_rows(rows)


def _backup(conn, building_id, category):
    prev = _current_state(conn, building_id, category)
    conn.execute(
        "INSERT INTO edit_backups (building_id, category, payload, created_at) VALUES (?,?,?,?)",
        (building_id, category, json.dumps(prev, ensure_ascii=False),
         datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    )


def save_markers(building_id, payload):
    """payload: { floor_id: [marker, ...] }. 전량 교체 + 백업. all_schedule 은 저장 안 함."""
    saved = []
    with get_conn() as conn:
        _backup(conn, building_id, 'markers')
        conn.execute("DELETE FROM markers WHERE building_id=?", (building_id,))
        ordc = 0
        for floor_id, markers in payload.items():
            if not isinstance(markers, list):
                continue
            saved.append(floor_id)
            for m in markers:
                if not isinstance(m, dict):
                    continue
                clean = {k: v for k, v in m.items() if k != 'all_schedule'}
                conn.execute(
                    "INSERT INTO markers (building_id, floor_id, room_name, kind, ord, data) VALUES (?,?,?,?,?,?)",
                    (building_id, floor_id, clean.get('roomName'), clean.get('kind'),
                     ordc, json.dumps(clean, ensure_ascii=False))
                )
                ordc += 1
    return saved


def save_routes(building_id, payload):
    """payload: { floor_id: [ {name, path}, ... ] }. 전량 교체 + 백업."""
    saved = []
    with get_conn() as conn:
        _backup(conn, building_id, 'routes')
        conn.execute("DELETE FROM routes WHERE building_id=?", (building_id,))
        ordc = 0
        for floor_id, routes in payload.items():
            if not isinstance(routes, list):
                continue
            saved.append(floor_id)
            for rt in routes:
                if not isinstance(rt, dict):
                    continue
                conn.execute(
                    "INSERT INTO routes (building_id, floor_id, name, ord, data) VALUES (?,?,?,?,?)",
                    (building_id, floor_id, rt.get('name'), ordc, json.dumps(rt, ensure_ascii=False))
                )
                ordc += 1
    return saved


def save_splats(building_id, payload):
    """payload: { floor_id: [ {splatUrl, splatConfig}, ... ] }. 전량 교체 + 백업."""
    saved = []
    with get_conn() as conn:
        _backup(conn, building_id, 'splats')
        conn.execute("DELETE FROM splats WHERE building_id=?", (building_id,))
        ordc = 0
        for floor_id, splats in payload.items():
            if not isinstance(splats, list):
                continue
            saved.append(floor_id)
            for sp in splats:
                if not isinstance(sp, dict):
                    continue
                conn.execute(
                    "INSERT INTO splats (building_id, floor_id, ord, data) VALUES (?,?,?,?)",
                    (building_id, floor_id, ordc, json.dumps(sp, ensure_ascii=False))
                )
                ordc += 1
    return saved
