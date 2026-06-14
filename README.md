# 가천대학교 실내 3D 지도 🗺️

> **Hybrid Mesh–Gaussian Splatting 기반 실내 내비게이션 웹 서비스**
> 낯선 건물 안에서도 헤매지 않도록, 실내를 3D로 미리 둘러보고 길까지 찾아주는 웹 앱.
> 가천대학교 **AI공학관 · 비전타워**를 대상으로 구축한 졸업작품입니다.

## ✨ 주요 기능
- 🏢 건물 내부를 **3D(Mesh + 3D Gaussian Splatting)** 로 자유롭게 탐색
- 📅 강의실 마커가 **실시간 시간표와 연동** — 빈 강의실(초록) / 수업 중(빨강)
- 🧭 출입구부터 강의실까지 **자동 길찾기**(런타임 Dijkstra 최단경로) 카메라 안내
- 🛠️ 관리자 모드로 마커·경로·스플랫을 **현장에서 직접 편집** → 즉시 반영
- 📱 데스크탑 / 모바일 **에셋 자동 분기**(모바일은 경량 버전)

## 🧱 기술 스택
| 영역 | 사용 기술 |
|---|---|
| Frontend | React 19 · Vite 6 · Three.js (`@react-three/fiber`, `drei`) · Tailwind v4 |
| Backend | Flask · SQLite · pandas (시간표 `.xlsx` 파싱) |
| 3D | Mesh(GLB + Draco 압축) + 3D Gaussian Splatting(`.splat`) |

## 📁 디렉토리 구조
```
front/     React + Three.js — 3D 지도 · 길찾기 UI
backend/   Flask API + SQLite — 건물 데이터 · 학사 시간표
```

---

## 🚀 시작하기

### 1. 레포 받기
```bash
git clone https://github.com/WinBdef/PProject.git
cd PProject
```

### 2. ⚠️ 3D 에셋 · 데이터 다운로드 (필수)
대용량 3D 에셋(GLB · splat)과 건물 데이터(`backend/data/`)는 용량·개인정보 문제로
GitHub에 포함되어 있지 않습니다. 아래에서 받아 각 위치에 배치해주세요.

📦 **[에셋 · 데이터 다운로드 (Google Drive)](https://drive.google.com/file/d/1plo4hlDXGF1n9RIZk1cxHL77QwwnqIj_/view?usp=sharing)**

배치 구조:
```
front/public/assets/        ← 3D 에셋
├── ai/{models/*.glb, splats/*.splat}
└── vision/{models/, splats/}

backend/data/               ← 건물 데이터 · 시간표
├── buildings/{ai,vision}/*.json
└── excels/*.xlsx
```

### 3. 백엔드 실행 (port 8080)
```bash
cd backend
pip install -r requirements.txt
python migrate_json_to_db.py   # 최초 1회: JSON 시드 → SQLite(app.db) 적재
python app.py
```

### 4. 프론트 실행 (port 5173)
```bash
cd front
npm install
npm run dev          # 개발 서버
# 또는 npm run build  → dist/ 프로덕션 빌드
```

브라우저에서 **http://localhost:5173** 접속하면 됩니다.
(프론트는 `/api` 요청을 백엔드 8080으로 보냅니다 — 두 서버 모두 떠 있어야 함.)

---

## 📝 참고
- 데이터는 **SQLite**(`backend/data/app.db`)에 저장되며, `migrate_json_to_db.py` 로 `backend/data/buildings/*.json` 시드에서 언제든 재생성할 수 있습니다.
- 학사 시간표 원본 `backend/data/excels/*.xlsx` 는 **수정·삭제 금지**.
