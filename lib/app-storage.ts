/**
 * 앱 전역 저장소 추상화.
 * 로그인 시 Supabase 백엔드 어댑터로 교체되고, 미로그인 시 localStorage 래퍼 사용.
 */

export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function localStorageAdapter(): StorageAdapter {
  return {
    getItem(key: string) {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(key);
    },
    setItem(key: string, value: string) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, value);
    },
    removeItem(key: string) {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
    },
  };
}

let currentAdapter: StorageAdapter | null = null;

/** 현재 저장소. 로그인 후 Provider가 Supabase 어댑터로 설정함. */
export function getAppStorage(): StorageAdapter {
  return currentAdapter ?? localStorageAdapter();
}

/** Provider 전용: Supabase 백엔드 어댑터 설정/해제 */
export function setAppStorage(adapter: StorageAdapter | null): void {
  currentAdapter = adapter;
}

/** 로그인 깜빡임 방지: localStorage 플래그 (Supabase 세션 확인 전에 UI 확정용) */
const LOGIN_FLAG_KEY = "arisum-has-logged-in";

export function getStoredLoginFlag(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LOGIN_FLAG_KEY) === "1";
}

export function setStoredLoginFlag(loggedIn: boolean): void {
  if (typeof window === "undefined") return;
  if (loggedIn) {
    window.localStorage.setItem(LOGIN_FLAG_KEY, "1");
  } else {
    window.localStorage.removeItem(LOGIN_FLAG_KEY);
  }
}
