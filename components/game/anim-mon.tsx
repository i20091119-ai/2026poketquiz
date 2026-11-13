"use client";
// 움직이는 포켓몬 도트 그림 (2026-11-13 포켓몬 마을). 우리 포켓로그(/battle/)에 이미 올라가 있는 그림을 그대로 씁니다:
// /battle/images/pokemon/[exp/][back/][shiny/]<번호>.png + .json (여러 장면을 한 장에 모은 그림, 1초에 10장면).
// 새로 나온 그림(exp)이 있으면 그걸 먼저(목록 /battle/exp-sprites.json), 없거나 못 읽으면 멈춘 도트 그림(PokeAPI)으로.
import { useEffect, useRef, useState } from 'react';

/* eslint-disable @next/next/no-img-element */

type Frame = { frame: { x: number; y: number; w: number; h: number }; spriteSourceSize: { x: number; y: number }; sourceSize: { w: number; h: number } };
type Anim = { img: HTMLImageElement; frames: Frame[]; w: number; h: number };

const BASE = '/battle/images/pokemon/';
let expList: Promise<Set<string>> | null = null;
function loadExpList() {
  expList ??= fetch('/battle/exp-sprites.json').then(r => (r.ok ? r.json() : [])).then((keys: unknown) => new Set(Array.isArray(keys) ? keys.map(String) : [])).catch(() => new Set<string>());
  return expList;
}
const cache = new Map<string, Promise<Anim | null>>();
function loadAnim(id: number, shiny: boolean, back: boolean): Promise<Anim | null> {
  const key = `${id}${shiny ? 's' : ''}${back ? 'b' : ''}`;
  let p = cache.get(key);
  if (!p) {
    p = loadExpList().then(async exp => {
      const sub = `${back ? 'back/' : ''}${shiny ? 'shiny/' : ''}${id}`;
      for (const path of exp.has(key) ? [`exp/${sub}`, sub] : [sub]) {
        try {
          const res = await fetch(BASE + path + '.json');
          if (!res.ok) continue;
          const json = await res.json() as { textures?: { frames: (Frame & { filename: string })[] }[]; frames?: (Frame & { filename: string })[] };
          const list = json.textures?.[0]?.frames ?? json.frames ?? [];
          if (!list.length) continue;
          const frames = [...list].sort((a, b) => a.filename.localeCompare(b.filename));
          const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = BASE + path + '.png'; });
          return { img, frames, w: frames[0].sourceSize.w, h: frames[0].sourceSize.h };
        } catch { /* 다음 후보로 */ }
      }
      return null;
    });
    cache.set(key, p);
  }
  return p;
}

// 모든 포켓몬이 같은 박자(1초에 10장면)로 움직이게 하나의 시계를 같이 씀
const listeners = new Set<(tick: number) => void>();
let tick = 0;
let timer: number | null = null;
function subscribe(fn: (t: number) => void) {
  listeners.add(fn);
  if (timer === null) timer = window.setInterval(() => { tick++; for (const l of listeners) l(tick); }, 100);
  return () => { listeners.delete(fn); if (!listeners.size && timer !== null) { window.clearInterval(timer); timer = null; } };
}

/**
 * 움직이는 포켓몬. 발이 아래 가운데에 오도록 그림 (부모가 position: relative 이고 크기가 칸이어야 함).
 * back = 뒷모습(위로 걸을 때), flip = 좌우 뒤집기(오른쪽으로 걸을 때. 앞모습은 왼쪽을 봄)
 */
export function AnimMon({ species, shiny = false, back = false, flip = false, scale = 2, fallback }: {
  species: number; shiny?: boolean; back?: boolean; flip?: boolean; scale?: number; fallback: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [anim, setAnim] = useState<Anim | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadAnim(species, shiny, back).then(a => { if (alive) setAnim(a); });
    return () => { alive = false; };
  }, [species, shiny, back]);
  useEffect(() => {
    if (!anim) return;
    const draw = (t: number) => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      // 포켓몬마다 시작 장면을 다르게 (모두 똑같이 움직이지 않게)
      const f = anim.frames[(t + species * 7) % anim.frames.length];
      ctx.clearRect(0, 0, anim.w, anim.h);
      ctx.drawImage(anim.img, f.frame.x, f.frame.y, f.frame.w, f.frame.h, f.spriteSourceSize.x, f.spriteSourceSize.y, f.frame.w, f.frame.h);
    };
    draw(tick);
    // 움직임 줄이기를 켠 기기는 첫 장면만
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    return subscribe(draw);
  }, [anim, species]);
  const flipStyle = flip ? ' scaleX(-1)' : '';
  if (anim === null) return <img className="anim-mon still" src={fallback} alt="" draggable={false} style={{ transform: `translateX(-50%)${flipStyle}` }} />;
  return (
    <canvas ref={ref} className="anim-mon" width={anim?.w ?? 1} height={anim?.h ?? 1} aria-hidden
      style={{ width: (anim?.w ?? 0) * scale, height: (anim?.h ?? 0) * scale, transform: `translateX(-50%)${flipStyle}` }} />
  );
}
