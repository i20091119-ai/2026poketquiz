"use client";
// 전설 보석 · 전설 지도 · 마스터볼 고르기 (2026-10-15 부모님 요청). 보석은 그림 파일 없이 SVG로 그림 (lib/gem.ts).
import { useEffect, useId, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { gemShape, gemWedges, pointsAttr, type Pt } from '@/lib/gem';
import type { ChildView, LegendView } from '@/lib/game-engine';
import { shinyName, species } from '@/lib/pokedex';
import { PokemonImage } from './common';
import { ShinyBurst } from './rewards';

/* eslint-disable @next/next/no-img-element */

const centroid = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

/**
 * 전설 보석 하나. 조각 = 중심에서 나뉜 칸.
 * 못 모은 칸 = 흐린 점선, 모은 칸 = 색 + 작은 반짝, 완성 = 금이 사라지고 면 선 + 별 반짝임.
 * fly: 이 번호 칸이 아래에서 날아와 맞춰짐. unknown: 아직 안 연 단계 ("?" 실루엣)
 */
export function Gem({ stage, salt = 0, need, filled, complete, unknown, size = 88, fly, glow, className }: {
  stage: number; salt?: number; need: number; filled: number; complete?: boolean; unknown?: boolean;
  size?: number; fly?: number | null; glow?: boolean; className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  if (unknown) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={'gem unknown ' + (className ?? '')} role="img" aria-label="아직 열리지 않은 보석">
        <polygon points="50,6 92,40 50,94 8,40" fill="#e2e8f0" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth="2" />
        <text x="50" y="62" textAnchor="middle" fontSize="40" fontWeight="800" fill="#94a3b8">?</text>
      </svg>
    );
  }
  const shape = gemShape(stage, salt);
  const { fill, light, dark } = shape.color;
  const wedges = gemWedges(shape.points, need, shape.center);
  const done = complete || filled >= need;
  return (
    <svg viewBox="-4 -4 108 108" width={size} height={size} className={'gem' + (done ? ' complete' : '') + (glow ? ' glow' : '') + (className ? ' ' + className : '')}
      role="img" aria-label={`${stage}단계 보석 조각 ${Math.min(filled, need)}/${need}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.5" stopColor={fill} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      {done ? <>
        <polygon points={pointsAttr(shape.points)} fill={`url(#${gid})`} stroke={dark} strokeWidth="2.5" strokeLinejoin="round" />
        {/* 면 선: 안쪽 작은 모양 + 꼭짓점을 잇는 선 */}
        <polygon points={pointsAttr(shape.points.map(([x, y]) => [shape.center[0] + (x - shape.center[0]) * 0.5, shape.center[1] + (y - shape.center[1]) * 0.5]))}
          fill="none" stroke={light} strokeWidth="1.5" opacity="0.85" />
        {shape.points.map(([x, y], i) => (
          <line key={i} x1={shape.center[0] + (x - shape.center[0]) * 0.5} y1={shape.center[1] + (y - shape.center[1]) * 0.5} x2={x} y2={y} stroke={light} strokeWidth="1.2" opacity="0.7" />
        ))}
        {[[22, 18], [82, 30], [70, 84]].map(([x, y], i) => (
          <text key={i} x={x} y={y} className="gem-sparkle" style={{ animationDelay: `${i * 0.35}s` }} fontSize="16" textAnchor="middle" fill="#fff">✦</text>
        ))}
      </> : wedges.map((w, i) => {
        if (i >= filled) return <polygon key={i} points={pointsAttr(w)} fill={light} fillOpacity="0.35" stroke={fill} strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="4 3" strokeLinejoin="round" />;
        const [cx, cy] = centroid(w);
        return (
          <g key={i} className={'gem-piece' + (fly === i ? ' fly' : '')}>
            <polygon points={pointsAttr(w)} fill={`url(#${gid})`} stroke={dark} strokeWidth="1.6" strokeLinejoin="round" />
            <ellipse cx={cx - 3} cy={cy - 4} rx="4" ry="2.4" fill="#fff" opacity="0.75" transform={`rotate(-30 ${cx - 3} ${cy - 4})`} />
          </g>
        );
      })}
    </svg>
  );
}

/** 다음 보석까지 남은 말 (보석이 N/3 모였어. 하나만 더 …) */
export function gemLeftText(filled: number, need: number) {
  const left = need - filled;
  if (left <= 0) return '보석이 완성됐어! 마스터볼을 열 수 있어!';
  return `보석이 ${filled}/${need} 모였어. ${left === 1 ? '하나만' : `${left}개만`} 더 모으면 전설 포켓몬!`;
}

/** 전설 지도: 계단 모양 1단계 → 2단계 → 3단계, 지금 위치에 파트너 */
export function LegendMap({ open, view, onClose, onPick }: { open: boolean; view: ChildView; onClose: () => void; onPick: () => void }) {
  const lg = view.legend;
  const partner = view.owned.find(p => p.uid === view.partner);
  // 지금 단계만 자세히 보여 주고, 완성한 단계는 보석 그림만 (다음 단계는 보여 주지 않음)
  const cur = lg.stages.find(s => s.stage === lg.stage)!;
  const done = lg.stages.filter(s => s.done);
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="reward-dialog legend-map-dialog">
        <DialogTitle>💎 전설 지도</DialogTitle>
        <DialogDescription>훈련으로 전설 조각을 모으면 마스터볼 안의 전설 포켓몬을 만날 수 있어!</DialogDescription>
        {done.length > 0 && <div className="legend-done-gems" aria-label="완성한 보석">
          {done.map(s => <Gem key={s.stage} stage={s.stage} salt={s.salt} need={s.need} filled={s.need} complete size={44} />)}
        </div>}
        <div className="legend-now">
          <b className="legend-now-title">{cur.stage}단계</b>
          <div className="legend-now-gem">
            <Gem stage={cur.stage} salt={cur.salt} need={cur.need} filled={Math.min(lg.pieces, cur.need)} size={130} />
            {partner && <PokemonImage id={partner.species} shiny={partner.shiny} className="legend-now-partner" />}
          </div>
          <span className="legend-count">조각 {Math.min(lg.pieces, cur.need)}/{cur.need}</span>
          <div className="legend-candidates center">
            {cur.got.map(g => (
              <span key={'g' + g.species} className="legend-cand got" title={species(g.species).name}>
                <PokemonImage id={g.species} shiny={g.shiny} />
              </span>
            ))}
            {cur.left.map(id => <span key={id} className="legend-cand silhouette"><PokemonImage id={id} /></span>)}
          </div>
        </div>
        {lg.pending ? <button className="primary glow big-button" onClick={onPick}>✨ 마스터볼 열기!</button>
          : lg.waiting ? <p className="legend-note">부모님이 다음 전설을 준비하고 있어. 조각은 계속 모여!</p>
          : <p className="legend-note">{gemLeftText(lg.pieces, lg.need)}<br />한 주에 ● 5개를 모으면 조각 1개! (■ 2개는 ● 1개)</p>}
        <button className="secondary" onClick={onClose}>닫기</button>
      </DialogContent>
    </Dialog>
  );
}

export type LegendPickResult = {
  balls: { species: number; shiny: boolean }[]; picked: number; caught: number; shiny: boolean; duplicate: boolean;
  stageUp: { stage: number; need: number } | null; legend: LegendView; message: string;
};

/** 보석 완성 연출 → 마스터볼(최대 3개) 고르기 → 나머지도 공개 → 단계가 오르면 새 보석 */
export function LegendPickDialog({ open, view, busy, onPick, onClose }: {
  open: boolean; view: ChildView; busy: boolean;
  onPick: (pick: number) => Promise<LegendPickResult | null>; onClose: () => void;
}) {
  const pending = view.legend.pending;
  const stageInfo = view.legend.stages.find(s => s.stage === (pending?.stage ?? view.legend.stage));
  const [phase, setPhase] = useState<'glow' | 'balls' | 'result'>('glow');
  const [result, setResult] = useState<LegendPickResult | null>(null);
  useEffect(() => {
    if (!open || phase !== 'glow') return;
    const t = window.setTimeout(() => setPhase('balls'), 1600);
    return () => window.clearTimeout(t);
  }, [open, phase]);
  const count = result?.balls.length ?? pending?.count ?? 0;
  const close = () => { if (!busy) onClose(); };
  const next = result?.stageUp ? result.legend.stages.find(s => s.stage === result.stageUp!.stage) : null;
  const name = (b: { species: number; shiny: boolean }) => (b.shiny ? shinyName(b.species) : species(b.species).name);
  return (
    <Dialog open={open && (!!pending || !!result)} onOpenChange={o => { if (!o && phase === 'result') close(); }}>
      <DialogContent className="reward-dialog legend-pick-dialog">
        {phase === 'glow' && stageInfo && <>
          <DialogTitle className="intro-title">보석이 완성됐어!</DialogTitle>
          <DialogDescription className="sr-only">보석 완성</DialogDescription>
          <div className="legend-glow"><Gem stage={stageInfo.stage} salt={stageInfo.salt} need={stageInfo.need} filled={stageInfo.need} complete glow size={150} /></div>
          <p className="intro-text">보석이 반짝반짝… 마스터볼로 바뀌고 있어!</p>
        </>}
        {phase === 'balls' && <>
          <DialogTitle className="intro-title">마스터볼 {count}개 중 하나를 골라 봐!</DialogTitle>
          <DialogDescription>안에 전설의 포켓몬이 들어 있어!</DialogDescription>
          <div className="choice-row legend-balls">
            {Array.from({ length: count }, (_, i) => (
              <button key={i} className="reward-card ball-appear" style={{ animationDelay: `${i * 0.15}s` }} disabled={busy}
                onClick={async () => { const r = await onPick(i); if (r) { setResult(r); setPhase('result'); } }}>
                <img src={ASSETS.ball.master} alt="마스터볼" />
                <b>{i + 1}번</b>
              </button>
            ))}
          </div>
        </>}
        {phase === 'result' && result && <>
          <DialogTitle className="intro-title">{result.shiny ? '✨ 이로치 전설이다! ✨' : '🎉 전설의 포켓몬!'}</DialogTitle>
          <DialogDescription>{result.message}</DialogDescription>
          <div className={result.shiny ? 'shiny-reveal' : undefined}>
            {result.shiny && <ShinyBurst />}
            <PokemonImage id={result.caught} shiny={result.shiny} className="celebration-img" />
          </div>
          <h3 className={'caught-name' + (result.shiny ? ' shiny-name' : '')}>{name(result.balls[result.picked])}</h3>
          {result.balls.length > 1 && <>
            <p className="intro-text small">다른 볼에는 누가 있었을까?</p>
            <div className="choice-row">
              {result.balls.map((b, i) => (
                <div key={i} className={'reward-card revealed' + (i === result.picked ? ' picked' : '')}>
                  {i === result.picked && <span className="picked-tag">내 것!</span>}
                  <PokemonImage id={b.species} shiny={b.shiny} />
                  <b>{name(b)}</b>
                </div>
              ))}
            </div>
            <p className="intro-text small">다른 친구는 다음 보석에서 만날 수 있어!</p>
          </>}
          {result.stageUp && next && <div className="legend-stage-up">
            <Gem stage={next.stage} salt={next.salt} need={next.need} filled={0} size={90} className="gem-appear" />
            <p><b>🎉 {result.stageUp.stage - 1}단계 전설을 모두 만났어!</b><br />다음 단계 전설은 더 귀해서 조각이 더 필요해. 이제 조각 <b>{result.stageUp.need}개</b>에 1마리야!</p>
          </div>}
          <button className="primary" onClick={close}>{result.shiny ? '이로치 도감에 저장했어!' : '도감에 저장했어!'}</button>
        </>}
      </DialogContent>
    </Dialog>
  );
}
