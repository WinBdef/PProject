import { useState, useEffect, useCallback } from 'react';

// 관리자 권한을 localStorage 만료 시각과 함께 관리.
// Home, MapPage 양쪽에서 동일 로직을 쓰던 것을 통합.
const KEY_ADMIN = 'isAdmin';
const KEY_EXPIRE = 'adminExpire';
const DEFAULT_EXPIRE_MINUTES = 60;
const ADMIN_CODE = 'gachon123';

const isAlive = () => {
  const flag = localStorage.getItem(KEY_ADMIN) === 'true';
  const expire = parseInt(localStorage.getItem(KEY_EXPIRE) || '0', 10);
  return flag && Date.now() < expire;
};

const clear = () => {
  localStorage.removeItem(KEY_ADMIN);
  localStorage.removeItem(KEY_EXPIRE);
};

export const useAdminAuth = ({ notifyOnExpire = false } = {}) => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (isAlive()) {
      setIsAdmin(true);
    } else {
      const hadFlag = localStorage.getItem(KEY_ADMIN) === 'true';
      if (hadFlag && notifyOnExpire) {
        alert('보안을 위해 관리자 권한이 자동 만료되었습니다.');
      }
      clear();
      setIsAdmin(false);
    }
  }, [notifyOnExpire]);

  const promptLogin = useCallback(() => {
    if (isAlive()) return;
    const code = prompt('관리자 인증 코드를 입력하세요:');
    if (code === ADMIN_CODE) {
      const expire = Date.now() + DEFAULT_EXPIRE_MINUTES * 60 * 1000;
      localStorage.setItem(KEY_ADMIN, 'true');
      localStorage.setItem(KEY_EXPIRE, expire.toString());
      setIsAdmin(true);
      alert(`관리자 권한이 활성화되었습니다. (보안을 위해 ${DEFAULT_EXPIRE_MINUTES}분 후 자동 만료됩니다)`);
    }
  }, []);

  const logout = useCallback(() => {
    if (window.confirm('관리자 권한을 해제하시겠습니까?')) {
      clear();
      setIsAdmin(false);
      alert('관리자 권한이 안전하게 해제되었습니다.');
    }
  }, []);

  return { isAdmin, promptLogin, logout };
};
