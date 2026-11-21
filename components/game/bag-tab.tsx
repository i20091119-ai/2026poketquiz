"use client";
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { BALLS, battlePowerMaxFeeds, eulReul, growth, POTIONS, potionTargets, type PotionKind } from '@/lib/game-config';
import type { Ball, ChildView } from '@/lib/game-engine';
import { evolutionRequirement, evolutionsOf, heartGoalOf, isFinalForm, rootOf, shinyName, species } from '@/lib/pokedex';
import { BattlePower } from './pokedex-tab';
import { PokemonImage, TypeBadge } from './common';
import { potionEffect } from './rewards';

/* eslint-disable @next/next/no-img-element */

const POTION_KINDS = Object.keys(POTIONS) as PotionKind[];

/** 가방: 아직 열지 않은 볼과 모아 둔 아이템(열매·상처약) */
export function BagTab({ view, busy, onOpenBall, onUsePotion }: {
  view: ChildView; busy: boolean;
  onOpenBall: (ball: Ball & { crafted?: boolean }) => void;
  onUsePotion: (potionId: string, uid: string) => Promise<boolean>;
}) {
  const [feeding, setFeeding] = useState<PotionKind | null>(null);
  const counts = Object.fromEntries(POTION_KINDS.map(k => [k, view.potions.filter(p => p.kind === k).length])) as Record<PotionKind, number>;
  const crafted = view.village.craft.balls;
  const empty = !view.balls.length && !view.potions.length && !crafted.length;

  return (
    <>
      <section className="panel">
        <span className="pill">BAG</span>
        <h2>나의 가방</h2>
        <p>{empty ? '가방이 비어 있어. 일일미션 상자나 탐험 보상으로 볼과 아이템을 모아 봐!' : '볼을 눌러 포켓몬을 만나고, 열매와 상처약은 포켓몬에게 먹여서 에너지와 배틀 힘을 올려 줘.'}</p>
      </section>

      {view.balls.length > 0 && (
        <section className="panel bag">
          <h3>볼 {view.balls.length}개 <small>눌러서 열어 봐!</small></h3>
          <div className="bag-list">
            {view.balls.map(b => (
              <button key={b.id} className="bag-ball" disabled={busy} onClick={() => onOpenBall(b)}>
                <img src={ASSETS.ball[b.kind]} alt="" /><span>{BALLS[b.kind].label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {crafted.length > 0 && (
        <section className="panel bag">
          <h3>🔮 제작 볼 {crafted.length}개 <small>마을 제작대에서 만든 볼이야. 아직 도감에 없는 포켓몬이 나와! 마을에서 만난 포켓몬이 먼저 나와.</small></h3>
          <div className="bag-list">
            {crafted.map(b => (
              <button key={b.id} className="bag-ball" disabled={busy} onClick={() => onOpenBall({ id: b.id, kind: b.kind, crafted: true })}>
                <img src={ASSETS.ball[b.kind]} alt="" /><span>만든 {BALLS[b.kind].label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {view.potions.length > 0 && (
        <section className="panel bag">
          <h3>아이템 {view.potions.length}개 <small>눌러서 포켓몬에게 먹여 줘!</small></h3>
          <div className="bag-list">
            {POTION_KINDS.filter(k => counts[k]).map(k => (
              <button key={k} className="bag-ball potion" disabled={busy} onClick={() => setFeeding(k)}>
                <img src={ASSETS.potion[k]} alt="" />
                <span>{POTIONS[k].label}</span>
                <small>{potionEffect(k)}</small>
                <b>{counts[k]}개</b>
              </button>
            ))}
          </div>
        </section>
      )}

      <FeedDialog
        key={feeding ?? 'none'}
        kind={feeding}
        view={view}
        busy={busy}
        onClose={() => setFeeding(null)}
        onFeed={async uid => {
          const potion = view.potions.find(p => p.kind === feeding);
          if (!potion) return;
          if (await onUsePotion(potion.id, uid)) setFeeding(null);
        }}
      />
    </>
  );
}

/** 아이템 먹이기: 포켓몬을 고르면, 그 포켓몬 진화에 얼마나 도움이 되는지 보여 줍니다. */
function FeedDialog({ kind, view, busy, onClose, onFeed }: {
  kind: PotionKind | null; view: ChildView; busy: boolean;
  onClose: () => void; onFeed: (uid: string) => void;
}) {
  // 다 진화했고 ★도 최고인 포켓몬은 먹여도 오를 게 없어서 고를 수 없게 (2026-11-12)
  const maxed = (sp: number) => isFinalForm(sp) && (view.battlePower[rootOf(sp)] ?? 0) >= battlePowerMaxFeeds();
  const first = view.owned.find(p => p.uid === view.partner && !maxed(p.species)) ?? view.owned.find(p => !maxed(p.species));
  const [uid, setUid] = useState<string | null>(first?.uid ?? null);
  const chosen = view.owned.find(p => p.uid === uid && !maxed(p.species));
  const hearts = chosen ? view.hearts[rootOf(chosen.species)] ?? 0 : 0;
  const goal = chosen ? heartGoalOf(chosen.species) : 0;
  const targets = kind ? potionTargets(kind) : [];
  const amount = kind ? POTIONS[kind].amount : 0;
  // 고른 포켓몬의 다음 진화 조건 중 이 아이템으로 오르는 것
  const helps = chosen ? evolutionsOf(chosen.species).flatMap(e => evolutionRequirement(e)).filter(r => targets.includes(r.type)) : [];

  return (
    <Dialog open={!!kind} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="reward-dialog feed-dialog">
        <DialogTitle>{kind && eulReul(POTIONS[kind].label)} 누구에게 먹일까?</DialogTitle>
        <DialogDescription>{kind && potionEffect(kind)} — 먹일 포켓몬을 골라 줘.</DialogDescription>

        <div className="partner-choices">
          {view.owned.map(p => (
            <button key={p.uid} className={'partner-choice' + (p.uid === uid ? ' current' : '') + (maxed(p.species) ? ' maxed' : '')} disabled={maxed(p.species)} onClick={() => setUid(p.uid)}>
              <PokemonImage id={p.species} shiny={p.shiny} />
              <b>{p.shiny ? `✨ ${shinyName(p.species)}` : species(p.species).name}</b>
              {maxed(p.species) && <small className="maxed-tag">이미 최고예요</small>}
            </button>
          ))}
        </div>

        {chosen && (
          <p className="feed-hearts">💗 +{growth().feedHearts} {isFinalForm(chosen.species)
            ? `(💗 ${goal}칸마다 배틀 힘 ★+1, 지금 ${hearts}/${goal})`
            : hearts >= goal ? '(💗는 이미 가득! 진화할 수 있어)' : `(진화까지 💗 ${hearts}/${goal})`}</p>
        )}
        {chosen && (
          <div className="feed-power">
            <BattlePower feeds={view.battlePower[rootOf(chosen.species)] ?? 0} />
            <small className="muted">먹이면 포켓로그에서 배틀 힘이 쑥! 올라가 (같은 진화 계열은 이로치도 함께)</small>
          </div>
        )}
        {chosen && (
          <div className="feed-types">
            {helps.length ? helps.map(r => {
              const now = view.stats[r.type];
              return (
                <div key={r.type} className="feed-type">
                  <TypeBadge type={r.type} />
                  <span>{now} → <b>{now + amount}</b> / {r.amount}</span>
                  <small>{now + amount >= r.amount ? '진화 준비 완료!' : `진화까지 ${r.amount - now - amount} 남음`}</small>
                </div>
              );
            }) : <p className="muted">{evolutionsOf(chosen.species).length ? `이 아이템은 ${species(chosen.species).name}의 진화에 필요한 속성을 올려 주지는 않아. 그래도 에너지는 올라가!` : `${species(chosen.species).name}는 더 진화하지 않지만, 에너지는 올라가!`}</p>}
          </div>
        )}

        <button className="primary" disabled={busy || !chosen} onClick={() => chosen && onFeed(chosen.uid)}>
          {chosen ? `${species(chosen.species).name}에게 먹이기!` : '포켓몬을 골라 줘'}
        </button>
      </DialogContent>
    </Dialog>
  );
}
