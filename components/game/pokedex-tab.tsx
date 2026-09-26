"use client";
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ASSETS } from '@/lib/assets';
import { BALLS } from '@/lib/game-config';
import type { Ball, ChildView, OwnedPokemon } from '@/lib/game-engine';
import { evolutionRequirement, evolutionsOf, species, TOTAL_SPECIES } from '@/lib/pokedex';
import { dexNo, PokemonImage, TypeBadge } from './common';

/* eslint-disable @next/next/no-img-element */

export function PokedexTab({ view, busy, onPartner, onEvolve, onOpenBall }: {
  view: ChildView; busy: boolean;
  onPartner: (uid: string) => void;
  onEvolve: (uid: string, target: number) => void;
  onOpenBall: (ball: Ball) => void;
}) {
  const [showDex, setShowDex] = useState(false);
  const dex = useMemo(() => [...view.dex].sort((a, b) => a - b), [view.dex]);
  return (
    <>
      <section className="panel dex-summary">
        <div>
          <span className="pill">POKÉDEX</span>
          <h2>포켓몬 도감 {view.dex.length} / {TOTAL_SPECIES}</h2>
          <Progress value={(view.dex.length / TOTAL_SPECIES) * 100} />
        </div>
        <button className="secondary" onClick={() => setShowDex(v => !v)}>{showDex ? '내 포켓몬 보기' : '만난 포켓몬 전체 보기'}</button>
      </section>

      {view.balls.length > 0 && (
        <section className="panel bag">
          <h3>아직 열지 않은 볼 {view.balls.length}개</h3>
          <div className="bag-list">
            {view.balls.map(b => (
              <button key={b.id} className="bag-ball" disabled={busy} onClick={() => onOpenBall(b)}>
                <img src={ASSETS.ball[b.kind]} alt="" /><span>{BALLS[b.kind].label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {showDex ? (
        <div className="dex-grid">
          {dex.map(id => (
            <div className="dex-cell" key={id}>
              <PokemonImage id={id} />
              <small>{dexNo(id)}</small>
              <span>{species(id).name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="pokemon-grid">
          {view.owned.map(p => (
            <OwnedCard key={p.uid} pokemon={p} view={view} busy={busy} onPartner={onPartner} onEvolve={onEvolve} />
          ))}
        </div>
      )}
    </>
  );
}

function OwnedCard({ pokemon, view, busy, onPartner, onEvolve }: {
  pokemon: OwnedPokemon; view: ChildView; busy: boolean;
  onPartner: (uid: string) => void; onEvolve: (uid: string, target: number) => void;
}) {
  const s = species(pokemon.species);
  const targets = evolutionsOf(pokemon.species);
  const isPartner = view.partner === pokemon.uid;
  return (
    <section className={'panel pokemon-card' + (isPartner ? ' is-partner' : '')}>
      <small>{dexNo(s.id)}</small>
      {isPartner && <span className="partner-tag">함께 모험 중</span>}
      <PokemonImage id={s.id} />
      <h3>{s.name}</h3>
      <div className="type-row">{s.types.map(t => <TypeBadge key={t} type={t} small />)}</div>
      {!isPartner && <button className="secondary" disabled={busy} onClick={() => onPartner(pokemon.uid)}>파트너로 함께하기</button>}
      <div className="evolutions">
        {targets.length === 0 && <p className="final-evolution">더 이상 진화하지 않아요</p>}
        {targets.map(target => {
          const req = evolutionRequirement(target);
          const ready = req.every(r => view.stats[r.type] >= r.amount);
          return (
            <div className="evolution" key={target}>
              <div className="evolution-head">
                <PokemonImage id={target} className="evolution-img" />
                <span>→ <b>{species(target).name}</b></span>
              </div>
              <div className="requirements">
                {req.map(r => (
                  <span key={r.type} className={'requirement' + (view.stats[r.type] >= r.amount ? ' met' : '')}>
                    <TypeBadge type={r.type} small /> {view.stats[r.type]} / {r.amount}
                    {view.stats[r.type] >= r.amount && <Check size={14} />}
                  </span>
                ))}
              </div>
              <button className="primary" disabled={busy || !ready} onClick={() => onEvolve(pokemon.uid, target)}>
                {ready ? '진화!' : '스탯을 더 모아 줘'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
