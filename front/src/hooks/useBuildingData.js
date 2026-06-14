import { useState, useEffect } from 'react';
import { apiUrl } from '../utils/api';

// 백엔드 GET /api/building/<id> 를 fetch 해 data state로 반환.
// buildingId 가 falsy 거나 'undefined' 문자열이면 fetch 안 함 (라우터 파라미터 빈값 가드).
export const useBuildingData = (buildingId) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!buildingId || buildingId === 'undefined') return;
    let alive = true;
    fetch(apiUrl(`/api/building/${buildingId}`))
      .then(res => res.json())
      .then(json => { if (alive) setData(json); })
      .catch(err => { if (alive) setError(err); });
    return () => { alive = false; };
  }, [buildingId]);

  return { data, error };
};
