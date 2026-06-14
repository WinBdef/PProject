// 경로(route) 네트워크를 그래프로 만들고, 두 지점 사이 최단경로를 찾는다.
//
// 목적: 길찾기를 "경로를 일일이 이름으로 연결"하지 않고, 관리자가 그려둔
// 경로망 위에서 자동으로 길을 찾도록 한다.
//   buildRouteGraph(routes)     : 한 층의 routes 배열 → 그래프
//   findRoutePath(graph, A, B)  : 그래프에서 A→B 최단경로(따라갈 점 배열)
//
// 좌표는 [x, y, z]. 길찾기는 바닥 평면 문제라 거리는 x,z 만 쓴다(높이 무시).

// SUBDIV > MERGE 가 핵심 — 안 그러면 한 경로 내 연속 분할점들끼리 서로 합쳐져
// 노드 위치가 어긋남(원래 점이 사라지고 옆 점으로 위치가 옮겨감). 그러면 다른 경로
// 끝점이 1.2 안에 안 들어와 연결이 끊김. 1.5 > 1.2 라 같은 경로 내 합치기는 안 됨.
const SUBDIV = 1.5;  // 경로 선분을 이 간격(m)으로 잘게 쪼갬
const MERGE = 1.2;   // 이 거리 안의 점들은 같은 노드로 합침 → 경로끼리 연결됨

const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// 폴리라인을 SUBDIV 간격의 촘촘한 점들로 변환.
// 잘게 쪼개두면, 가지 경로의 끝점이 다른 경로의 "선분 중간"에 닿아도
// 근처 분할점과 만나 자동으로 연결된다.
function subdivide(path) {
  const pts = (path || []).map((p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]));
  if (pts.length < 2) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const steps = Math.max(1, Math.round(dist2(a, b) / SUBDIV));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ]);
    }
  }
  return out;
}

// 한 층의 routes → 그래프 { nodes: [[x,y,z]...], adj: [[{to,w}]...] }
export function buildRouteGraph(routes) {
  const nodes = [];
  const adj = [];

  // 좌표를 가까운 기존 노드에 합치거나 새 노드 생성 → 노드 인덱스 반환
  const nodeOf = (p) => {
    for (let i = 0; i < nodes.length; i++) {
      if (dist2(nodes[i], p) <= MERGE) return i;
    }
    nodes.push(p);
    adj.push([]);
    return nodes.length - 1;
  };
  const link = (i, j) => {
    if (i === j) return;
    const w = dist2(nodes[i], nodes[j]);
    if (!adj[i].some((e) => e.to === j)) adj[i].push({ to: j, w });
    if (!adj[j].some((e) => e.to === i)) adj[j].push({ to: i, w });
  };

  for (const route of routes || []) {
    let prev = -1;
    for (const p of subdivide(route.path)) {
      const idx = nodeOf(p);
      if (prev >= 0) link(prev, idx);
      prev = idx;
    }
  }
  return { nodes, adj };
}

// 그래프에서 startPos → endPos 최단경로.
// 반환: 따라갈 점 배열 [[x,y,z]...] (네트워크 진입용 출발점은 맨 앞에 붙임).
//
// 핵심: 출발점이 '끊긴 경로 섬'(다른 경로와 안 이어진 route) 근처에 있어도
// 멈추지 않는다. 도착점 기준 Dijkstra 를 돌려, 출발점에서 가장 가까운
// '도착점과 연결된' 노드로 진입한다 → 끊긴 섬은 자동으로 무시됨.
export function findRoutePath(graph, startPos, endPos) {
  const { nodes, adj } = graph;
  if (!nodes || nodes.length === 0) return null;

  // 도착점에서 가장 가까운 노드
  let e = -1;
  let ed = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = dist2(nodes[i], endPos);
    if (d < ed) { ed = d; e = i; }
  }

  // e 기준 Dijkstra (무방향 그래프라 e→모든노드 최단경로의 역순이 곧 그 경로).
  // 노드 수가 적어 단순 O(V^2) 로 충분.
  const dist = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  dist[e] = 0;
  for (;;) {
    let u = -1;
    let ud = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    }
    if (u < 0) break;
    done[u] = true;
    for (const { to, w } of adj[u]) {
      if (dist[u] + w < dist[to]) { dist[to] = dist[u] + w; prev[to] = u; }
    }
  }

  // 출발점에서 가장 가까운 '도착점과 연결된'(dist 가 유한한) 노드 — 끊긴 섬 제외
  let s = -1;
  let sd = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    if (dist[i] === Infinity) continue;
    const d = dist2(nodes[i], startPos);
    if (d < sd) { sd = d; s = i; }
  }
  if (s < 0) return null;

  // s → e 경로 (prev 는 e 방향을 가리키므로 따라가면 s→e 순서)
  const chain = [];
  for (let v = s; v >= 0; v = prev[v]) chain.push(nodes[v]);

  // 출발점(입구)을 맨 앞에 붙여 카메라가 '입구 자리'에서 시작하게 한다.
  // 입구가 경로망과 떨어져 있으면 입구→첫 경로점 사이는 직선으로 이어진다 —
  // 이 직선을 없애려면(완전히 자연스럽게) 경로를 입구 자리부터 그릴 것.
  const out = [];
  if (dist2(startPos, chain[0]) > 0.3) out.push(startPos);
  for (const n of chain) out.push(n);
  return out;
}
