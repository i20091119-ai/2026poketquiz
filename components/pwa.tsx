"use client";
import { useEffect } from 'react';

/** 홈 화면 "앱 설치"를 위해 서비스 워커(/sw.js)를 등록합니다. 실패해도 앱은 그대로 동작합니다. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* 설치 기능만 빠짐 */ });
  }, []);
  return null;
}

/** 홈 화면에 설치한 앱(주소창 없는 창)으로 열려 있는지 */
export const isInstalledApp = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
