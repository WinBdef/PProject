import os, glob, re, pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
import db

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')

# 데이터는 SQLite(data/app.db)에 저장한다. 테이블이 없으면 생성만(적재는 migrate 스크립트).
db.init_db()


def normalize_room_name(name):
    # 호수 정규화 — 마커 roomName 과 엑셀 '강의실' 컬럼을 같은 키로 매핑.
    # 우선 첫 3자리(+) 숫자를 잡아낸다 → "407-A호", "AI공학관 220호", "AI관-714A" 등이 안전.
    # (이전 구현은 split('-')[-1] 마지막 토큰만 봐서 "407-A호"가 "A"로 매칭되는 버그가 있었다.)
    if not name or pd.isna(name): return ""
    s = str(name)
    m = re.search(r'(\d{3,})', s)
    if m: return m.group(1)
    m = re.search(r'(\d+)', s)
    if m: return m.group(1)
    return s.replace("호", "").strip()


def parse_gachon_time(time_str):
    res = []
    slots = str(time_str).split(',')
    for slot in slots:
        m = re.search(r'([월화수목금])(\d+)', slot.strip())
        if m: res.append({'day': m.group(1), 'period': int(m.group(2))})
    return res


def get_excel_schedules(target_building):
    schedules = {}
    excel_dir = os.path.join(DATA_DIR, 'excels')
    excel_files = glob.glob(os.path.join(excel_dir, "*.xlsx"))
    keywords = {"ai": ["AI", "공학"], "vision": ["비전", "타워", "Vision"]}
    kw = keywords.get(target_building, [])

    for file in excel_files:
        try:
            df = pd.read_excel(file)
            for _, row in df.iterrows():
                room_str = str(row['강의실'])
                if not any(k in room_str for k in kw): continue
                rid = normalize_room_name(room_str)
                if not rid: continue
                if rid not in schedules: schedules[rid] = {d: [] for d in ["월", "화", "수", "목", "금"]}
                for t in parse_gachon_time(row['강의시간']):
                    if t['day'] in schedules[rid]:
                        schedules[rid][t['day']].append({
                            "subject": str(row['교과목명']), "prof": str(row['담당교수']),
                            "period": t['period'], "time_text": f"{t['period']}교시"
                        })
        except Exception as e:
            print(f"⚠️ 엑셀 파싱 실패 ({os.path.basename(file)}): {type(e).__name__}: {e}")
    return schedules


@app.route('/api/buildings')
def get_buildings():
    return jsonify(db.get_buildings_list())


@app.route('/api/building/<building_id>')
def get_building_detail(building_id):
    data = db.get_building_data(building_id)
    if not data: return jsonify({"error": "NotFound"}), 404
    excel_data = get_excel_schedules(building_id)
    now = datetime.now()
    day_map = ["월", "화", "수", "목", "금", "토", "일"]
    is_weekend = now.weekday() >= 5
    # 시간표 시트에 노출할 기본 요일은 월요일로 폴백(주말엔 "토/일" 데이터가 없으므로),
    # 단 강의실의 occupied/empty 판정은 주말이면 무조건 empty 로 처리해서
    # "토요일인데 빨간색" 같은 오해를 막는다.
    curr_day = day_map[now.weekday()] if not is_weekend else "월"
    curr_period = now.hour - 8
    if "markers" in data:
        for floor in data["markers"]:
            for m in data["markers"][floor]:
                # roomName 이 없는 미완성 마커(위치만 찍어둔 것)는 시간표 주입을 건너뜀.
                if "roomName" not in m:
                    continue
                room_key = normalize_room_name(m["roomName"])
                m["all_schedule"] = excel_data.get(room_key, {d: [] for d in ["월", "화", "수", "목", "금"]})
                is_busy = (not is_weekend) and any(
                    s['period'] == curr_period for s in m["all_schedule"].get(curr_day, [])
                )
                m["status"] = "occupied" if is_busy else "empty"
    return jsonify(data)


# 관리자 모드에서 편집한 마커를 DB(markers 테이블)에 저장한다.
# 본문: { "<floorId>": [ {position, roomName, pathId, ...}, ... ], ... }
# 저장 전 기존 상태를 edit_backups 테이블에 스냅샷한다.
@app.route('/api/building/<building_id>/markers', methods=['POST'])
def save_building_markers(building_id):
    if not db.building_exists(building_id):
        return jsonify({"error": "건물을 찾을 수 없음"}), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "본문이 JSON 객체가 아님"}), 400
    saved = db.save_markers(building_id, payload)
    return jsonify({"status": "saved", "floors": saved})


# 관리자 모드에서 편집한 경로(파란선)를 DB(routes 테이블)에 저장.
# 본문: { "<floorId>": [ {name, path: [[x,y,z], ...]}, ... ], ... }
@app.route('/api/building/<building_id>/routes', methods=['POST'])
def save_building_routes(building_id):
    if not db.building_exists(building_id):
        return jsonify({"error": "건물을 찾을 수 없음"}), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "본문이 JSON 객체가 아님"}), 400
    saved = db.save_routes(building_id, payload)
    return jsonify({"status": "saved", "floors": saved})


# 관리자 모드에서 편집한 3D 스플랫의 위치/회전/크기를 DB(splats 테이블)에 저장.
# 본문: { "<floorId>": [ {splatUrl, splatConfig:{position,rotation,scale}}, ... ], ... }
@app.route('/api/building/<building_id>/splats', methods=['POST'])
def save_building_splats(building_id):
    if not db.building_exists(building_id):
        return jsonify({"error": "건물을 찾을 수 없음"}), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "본문이 JSON 객체가 아님"}), 400
    saved = db.save_splats(building_id, payload)
    return jsonify({"status": "saved", "floors": saved})


if __name__ == '__main__':
    print("🚀 서버 가동 (SQLite)")
    app.run(debug=True, host='0.0.0.0', port=8080, use_reloader=False)
