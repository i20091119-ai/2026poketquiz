"use client";
// 실수로 나가지는 것 막기 (2026-11-14 부모님: "아래로 스크롤하다 폰 하단 버튼을 누르거나 밀려서 새로고침·나가짐").
// - 폰의 뒤로 가기(아래 버튼·가장자리 밀기): 아이 화면에서는 페이지를 떠나지 않고 안내만 띄움.
//   크롬은 사용자가 화면을 누르기 전에 넣은 기록은 뒤로 가기에서 건너뛰므로, 처음 누를 때 기록 하나를 넣어 둠.
// - 당겨서 새로고침은 app/globals.css 의 overscroll-behavior 로 막음.
import { useEffect, useRef } from 'react';

export function useBackGuard(message: () => string, onToast: (s: string) => void) {
  const msg = useRef(message);
  const toast = useRef(onToast);
  useEffect(() => { msg.current = message; toast.current = onToast; });
  useEffect(() => {
    let armed = false;
    const arm = () => {
      if (armed) return;
      armed = true;
      try { if (!history.state?.pqGuard) history.pushState({ ...(history.state ?? {}), pqGuard: 1 }, ''); } catch { /* 막지 못해도 게임은 그대로 */ }
    };
    const onPop = () => {
      try { history.pushState({ pqGuard: 1 }, ''); } catch { /* 위와 같음 */ }
      toast.current(msg.current());
    };
    window.addEventListener('pointerdown', arm, { once: true });
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('pointerdown', arm); window.removeEventListener('popstate', onPop); };
  }, []);
}
