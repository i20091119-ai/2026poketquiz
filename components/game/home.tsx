"use client";
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { EXP_EXCHANGE, SUBJECTS, SUBJECT_INFO, SUBJECT_TYPES, STARTERS, TYPE_INFO, type TypeKey } from '@/lib/game-config';
import type { ChildView } from '@/lib/game-engine';
import { evolutionRequirement, evolutionsOf, species, typesLabel } from '@/lib/pokedex';
import { dexNo, PokemonImage, TypeBadge } from './common';

/* eslint-disable @next/next/no-img-element */

/** 첫 화면: 파트너 포켓몬과 경험치, 속성 스탯 */
export function HomePanel({ view, busy, onChoosePartner, onExchange }: {
  view: ChildView; busy: boolean; onChoosePartner: (uid: string) => void; onExchange: (type: TypeKey) => Promise<boolean>;
}) {
  const partner = view.owned.find(p => p.uid === view.partner);
  const [picking, setPicking] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  return (
    <section className="home panel">
      <div className="partner-stage" style={{ backgroundImage: `url(${ASSETS.homeBackground})` }}>
        {partner && <>
          <PokemonImage id={partner.species} className="partner-img" />
          <div className="partner-info">
            <small>{dexNo(partner.species)} · 나의 파트너</small>
            <h2>{species(partner.species).name}</h2>
            <div className="type-row">{species(partner.species).types.map(t => <TypeBadge key={t} type={t} />)}</div>
            <div className="exp-box">
              <img src={ASSETS.exp} alt="" /> 경험치 <strong>{view.exp.toLocaleString()}</strong>
              <button className="exp-exchange" disabled={busy} onClick={() => setExchanging(true)}>스탯으로 바꾸기</button>
            </div>
            <button className="text-button" onClick={() => setPicking(true)}>파트너 바꾸기 →</button>
          </div>
        </>}
      </div>
      <StatBoard stats={view.stats} />
      {exchanging && <ExchangeDialog view={view} busy={busy} onClose={() => setExchanging(false)} onExchange={onExchange} />}
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="reward-dialog">
          <DialogTitle>함께 모험할 파트너를 골라 줘</DialogTitle>
          <DialogDescription>
            {view.owned.length > 1 ? '내가 모은 포켓몬 중에서 한 마리를 눌러 봐.' : '아직 다른 친구가 없어. 일일미션 상자에서 볼을 얻어 새 친구를 만나면 바꿀 수 있어!'}
          </DialogDescription>
          <div className="partner-choices">
            {view.owned.map(p => (
              <button key={p.uid} className={'partner-choice' + (p.uid === view.partner ? ' current' : '')}
                disabled={busy || p.uid === view.partner}
                onClick={() => { onChoosePartner(p.uid); setPicking(false); }}>
                <PokemonImage id={p.species} />
                <b>{species(p.species).name}</b>
                {p.uid === view.partner && <small>지금 파트너</small>}
              </button>
            ))}
          </div>
          <button className="primary" onClick={() => setPicking(false)}>닫기</button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** 경험치를 원하는 속성 스탯으로 바꾸기. 파트너 진화에 필요한 속성을 먼저 보여 줍니다. */
function ExchangeDialog({ view, busy, onClose, onExchange }: {
  view: ChildView; busy: boolean; onClose: () => void; onExchange: (type: TypeKey) => Promise<boolean>;
}) {
  const { cost, amount } = EXP_EXCHANGE;
  const partner = view.owned.find(p => p.uid === view.partner);
  // 파트너의 다음 진화에 필요한 속성 → 필요한 양
  const needed = new Map<TypeKey, number>();
  for (const e of partner ? evolutionsOf(partner.species) : []) {
    for (const r of evolutionRequirement(e)) needed.set(r.type, Math.max(needed.get(r.type) ?? 0, r.amount));
  }
  const [chosen, setChosen] = useState<TypeKey | null>(needed.keys().next().value ?? null);
  const enough = view.exp >= cost;
  const times = Math.floor(view.exp / cost);

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="reward-dialog exchange-dialog">
        <DialogTitle>경험치를 스탯으로 바꾸기</DialogTitle>
        <DialogDescription>
          경험치 {cost}을 내면 고른 속성 스탯이 {amount} 올라. {enough ? `지금 ${times}번 바꿀 수 있어!` : `경험치를 ${cost - view.exp} 더 모으면 바꿀 수 있어.`}
        </DialogDescription>
        {partner && needed.size > 0 && (
          <p className="exchange-hint">★ 표시는 {species(partner.species).name}의 진화에 필요한 속성이야.</p>
        )}
        <div className="exchange-groups">
          {SUBJECTS.map(subject => (
            <div className="exchange-group" key={subject}>
              <span className="stat-subject" style={{ background: SUBJECT_INFO[subject].color }}>{subject}</span>
              {SUBJECT_TYPES[subject].map(t => {
                const need = needed.get(t);
                return (
                  <button key={t} className={'exchange-type' + (t === chosen ? ' current' : '') + (need ? ' needed' : '')} onClick={() => setChosen(t)}>
                    <img src={ASSETS.type(t)} alt="" />
                    <span>{need ? '★ ' : ''}{TYPE_INFO[t].label}</span>
                    <b>{view.stats[t]}{need ? <small> / {need}</small> : null}</b>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <button className="primary" disabled={busy || !enough || !chosen}
          onClick={async () => { if (chosen && await onExchange(chosen) && view.exp - cost < cost) onClose(); }}>
          {!enough ? `경험치가 ${cost - view.exp} 부족해` : chosen ? `경험치 ${cost} → ${TYPE_INFO[chosen].label} +${amount}` : '속성을 골라 줘'}
        </button>
        <button className="secondary" onClick={onClose}>닫기</button>
      </DialogContent>
    </Dialog>
  );
}

export function StatBoard({ stats }: { stats: ChildView['stats'] }) {
  return (
    <div className="stat-board">
      <h3>나의 속성 스탯</h3>
      <div className="stat-groups">
        {SUBJECTS.map(subject => (
          <div className="stat-group" key={subject} style={{ borderColor: SUBJECT_INFO[subject].color }}>
            <span className="stat-subject" style={{ background: SUBJECT_INFO[subject].color }}>{subject}</span>
            <div className="stat-list">
              {SUBJECT_TYPES[subject].map(t => (
                <div className="stat" key={t} title={TYPE_INFO[t].label}>
                  <img src={ASSETS.type(t)} alt="" />
                  <span>{TYPE_INFO[t].label}</span>
                  <b>{stats[t]}</b>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 처음 시작할 때 파트너 고르기 */
export function StarterPicker({ busy, onPick }: { busy: boolean; onPick: (id: number) => void }) {
  return (
    <section className="panel starter">
      <span className="pill">FIRST PARTNER</span>
      <h2>함께 모험할 첫 파트너를 골라 줘!</h2>
      <p>한 번 고르면 바꿀 수 없어. 나중에 새 친구를 만나면 파트너를 바꿀 수 있어.</p>
      <div className="starter-grid">
        {STARTERS.map(id => (
          <button key={id} className="starter-card" disabled={busy} onClick={() => onPick(id)}>
            <PokemonImage id={id} />
            <h3>{species(id).name}</h3>
            <span>{typesLabel(species(id).types)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
