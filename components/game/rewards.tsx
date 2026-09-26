"use client";
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { BALLS, POTIONS, TIER_LABELS, type TypeKey } from '@/lib/game-config';
import type { Ball, BoxItem } from '@/lib/game-engine';
import { species } from '@/lib/pokedex';
import { PokemonImage, TypeBadge } from './common';

export type RewardKind = 'daily' | 'explore' | 'master';
export type RewardResult = { items: BoxItem[]; pick: number; message: string };
export type CatchResult = { caught: number; tier: number; duplicate: boolean; bonus?: { type: TypeKey; amount: number }; message: string };

const COPY: Record<RewardKind, { title: string; description: string; closed: string; label: string }> = {
  daily: { title: '랜덤상자 3개 중 하나를 골라!', description: '물약이나 포켓볼이 들어 있어.', closed: ASSETS.boxClosed, label: '상자' },
  explore: { title: '물약 3개 중 하나를 골라!', description: '이 과목 속성 중 하나의 스탯이 올라가.', closed: ASSETS.potion.super, label: '물약' },
  master: { title: '탐험 마스터! 볼 3개 중 하나를 골라!', description: '절반의 확률로 전설이나 희귀한 포켓몬이 나와.', closed: ASSETS.ball.luxury, label: '볼' },
};

/* eslint-disable @next/next/no-img-element */
function ItemView({ item }: { item: BoxItem }) {
  if (item.kind === 'potion') return <>
    <img src={ASSETS.potion[item.potion]} alt={POTIONS[item.potion].label} />
    <b>{POTIONS[item.potion].label}</b>
    <TypeBadge type={item.type} amount={'+' + item.amount} small />
  </>;
  return <>
    <img src={ASSETS.ball[item.ball]} alt={BALLS[item.ball].label} />
    <b>{BALLS[item.ball].label}</b>
    <small>눌러서 포켓몬을 만나자</small>
  </>;
}

/** 3개 중 하나 고르기 → 열어 보기 → 고른 것이 볼이면 바로 열 수 있게 안내 */
export function RewardPicker({ kind, subject, busy, onPick, onClose, onOpenBall }: {
  kind: RewardKind | null;
  subject?: string;
  busy: boolean;
  onPick: (pick: number) => Promise<RewardResult | null>;
  onClose: () => void;
  onOpenBall: () => void;
}) {
  const [result, setResult] = useState<RewardResult | null>(null);
  const copy = kind ? COPY[kind] : COPY.daily;
  const chosen = result?.items[result.pick];
  const close = () => { if (!busy) { setResult(null); onClose(); } };

  return (
    <Dialog open={!!kind} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="reward-dialog">
        <DialogTitle>{result ? '짜잔! 이런 게 들어 있었어' : (subject ? `${subject} ` : '') + copy.title}</DialogTitle>
        <DialogDescription>{result ? '고른 것만 가질 수 있어. 다른 것에는 뭐가 있었는지 볼까?' : copy.description}</DialogDescription>
        <div className="choice-row">
          {[0, 1, 2].map(i => result ? (
            <div key={i} className={'reward-card revealed' + (i === result.pick ? ' picked' : '')}>
              {i === result.pick && <span className="picked-tag">내 것!</span>}
              <ItemView item={result.items[i]} />
            </div>
          ) : (
            <button key={i} className="reward-card" disabled={busy} onClick={async () => { const r = await onPick(i); if (r) setResult(r); }}>
              <img src={copy.closed} alt="" />
              <b>{i + 1}번 {copy.label}</b>
            </button>
          ))}
        </div>
        {result && (chosen?.kind === 'ball'
          ? <button className="primary" onClick={() => { setResult(null); onOpenBall(); }}>볼 열어 보기!</button>
          : <button className="primary" onClick={close}>좋아!</button>)}
      </DialogContent>
    </Dialog>
  );
}

/** 볼을 눌러 포켓몬을 만납니다. */
export function BallDialog({ ball, busy, onOpen, onClose }: {
  ball: Ball | null;
  busy: boolean;
  onOpen: (ball: Ball) => Promise<CatchResult | null>;
  onClose: () => void;
}) {
  const [result, setResult] = useState<CatchResult | null>(null);
  const close = () => { if (!busy) { setResult(null); onClose(); } };
  return (
    <Dialog open={!!ball || !!result} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="reward-dialog">
        {result ? <>
          <DialogTitle>{result.duplicate ? '또 만났네!' : '새로운 친구를 만났어!'}</DialogTitle>
          <DialogDescription>{result.message}</DialogDescription>
          <PokemonImage id={result.caught} className="celebration-img" />
          <h3 className="caught-name">{species(result.caught).name} <span className={'tier tier-' + result.tier}>{TIER_LABELS[result.tier]}</span></h3>
          <div className="type-row">{species(result.caught).types.map(t => <TypeBadge key={t} type={t} />)}</div>
          {result.bonus && <p>이미 있는 친구라서 <TypeBadge type={result.bonus.type} amount={'+' + result.bonus.amount} small /> 보너스!</p>}
          <button className="primary" onClick={close}>도감에 저장했어!</button>
        </> : ball && <>
          <DialogTitle>{BALLS[ball.kind].label}을 눌러 봐!</DialogTitle>
          <DialogDescription>어떤 포켓몬이 들어 있을까?</DialogDescription>
          <button className="ball-open" disabled={busy} onClick={async () => { const r = await onOpen(ball); if (r) setResult(r); }}>
            <img src={ASSETS.ball[ball.kind]} alt={BALLS[ball.kind].label} />
          </button>
        </>}
      </DialogContent>
    </Dialog>
  );
}
