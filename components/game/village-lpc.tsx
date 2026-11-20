"use client";
// [시험] LPC 사람 그림을 층으로 겹쳐 그리기 (lib/village-lpc.ts). /village-demo 에서만 씀.
// 층마다 같은 걷기 그림판 크기(576×256)라, 모든 층에 같은 칸 위치를 주면 옷이 몸 동작을 그대로 따라감.
import { useEffect, useRef, useState } from 'react';
import { LPC_FRAME, LPC_ROW, LPC_SCALE, LPC_WALK_FRAMES, type LpcLayer } from '@/lib/village-lpc';

type Dir = keyof typeof LPC_ROW;

/** 한 걸음(step이 바뀔 때)마다 걷기 장면 4장을 짧게 보여 주고 다시 서 있기. 짝수 걸음 = 1~4, 홀수 = 5~8 */
export function useLpcWalk(step: number, ms = 55) {
  const [frame, setFrame] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const start = step % 2 === 0 ? 1 : 1 + LPC_WALK_FRAMES / 2;
    let i = 0;
    const tick = () => { setFrame(i < LPC_WALK_FRAMES / 2 ? start + i : 0); i += 1; };
    const t = window.setInterval(() => { tick(); if (i > LPC_WALK_FRAMES / 2) window.clearInterval(t); }, ms);
    const now = window.setTimeout(tick, 0);
    return () => { window.clearInterval(t); window.clearTimeout(now); };
  }, [step, ms]);
  return frame;
}

/** 층을 겹친 LPC 사람 하나 (한 칸 48px 위에 발을 맞춤) */
export function LpcSprite({ layers, dir, frame }: { layers: LpcLayer[]; dir: Dir; frame: number }) {
  const size = LPC_FRAME * LPC_SCALE;
  return (
    <span className="lpc-person" aria-hidden style={{ width: size, height: size }}>
      {layers.map(l => (
        <i key={l.slot + l.file} className="lpc-layer" style={{
          backgroundImage: `url(${l.file})`,
          backgroundSize: `${9 * size}px ${4 * size}px`,
          backgroundPosition: `${-frame * size}px ${-LPC_ROW[dir] * size}px`,
        }} />
      ))}
    </span>
  );
}

/** 마을 칸 위의 LPC 사람 (이름표 · 그림자). step이 바뀌면 걷는 장면 */
export function LpcWalker({ name, layers, x, y, dir, step, tile, me }: { name: string; layers: LpcLayer[]; x: number; y: number; dir: Dir; step: number; tile: number; me?: boolean }) {
  const frame = useLpcWalk(step);
  return (
    <span className={me ? 'village-me lpc' : 'village-mon lpc-npc'} style={{ left: x * tile, top: y * tile, width: tile, height: tile, zIndex: (me ? 12 : 11) + y }}>
      <span className="village-shadow" />
      <LpcSprite layers={layers} dir={dir} frame={frame} />
      <span className={me ? 'village-me-mark' : 'village-me-mark lpc-family-mark'}>{name}</span>
    </span>
  );
}
