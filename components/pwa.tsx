"use client";
import { useEffect } from 'react';

/** 홈 화면 "앱 설치"를 위해 서비스 워커(/sw.js)를 등록합니다. 실패해도 앱은 그대로 동작합니다. */
export function RegisterServiceWorker() {
  useEffect(() => {
    lockPortrait();
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* 설치 기능만 빠짐 */ });
  }, []);
  return null;
}

/** 홈 화면에 설치한 앱(주소창 없는 창)으로 열려 있는지 */
export const isInstalledApp = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * 앱 정보 파일의 방향은 "any"(포켓로그를 가로로 크게 보려고)라서, 설치한 앱의 퀴즈 화면은 여기서 세로로 고정합니다.
 * 휴대폰이 고정을 못 하면 그냥 둡니다(자동 회전 설정대로).
 */
function lockPortrait() {
  if (!isInstalledApp()) return;
  const o = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
  o?.lock?.('portrait').catch(() => { /* 고정 못 하는 기기 */ });
}
