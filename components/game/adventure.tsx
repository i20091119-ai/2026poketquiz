"use client";
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { battleIvFromFeeds, battleStars, growth, waGwa, type TypeKey } from '@/lib/game-config';
import type { ChildView, OwnedPokemon } from '@/lib/game-engine';
import { evolutionRequirement, evolutionsOf, heartGoalOf, isFinalForm, rootOf, shinyName, species } from '@/lib/pokedex';
import { PokemonImage, TypeBadge } from './common';

/*
 * 모험 팀 (파트너 1 + 친구 2), 💗 친해짐, ★ 배틀 힘 화면 (2026-10-03).
 * 규칙 계산은 lib/game-engine.ts (giveTeamHearts·energyStar·evolve), 숫자는 lib/game-config.ts GROWTH_DEFAULT.
 */

export const pokemonLabel = (p: OwnedPokemon) => (p.shiny ? `✨ ${shinyName(p.species)}` : species(p.species).name);
const plainName = (p: OwnedPokemon) => (p.shiny ? shinyName(p.species) : species(p.species).name);
/** 받침에 따라 야/이야 (예: 나오하야, 이상해꽃이야) */
const yaIya = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? '이야' : '야');
};

/** 이 포켓몬(계열)의 💗, 가득 차는 칸, 다 진화했는지 */
export function heartInfo(view: ChildView, speciesId: number) {
  const hearts = view.hearts[rootOf(speciesId)] ?? 0;
  const goal = heartGoalOf(speciesId);
  return { hearts, goal, final: isFinalForm(speciesId) };
}
/** 이 포켓몬(계열)의 ★ 배틀 힘이 최대인지 */
export const isMaxPower = (view: ChildView, speciesId: number) => battleIvFromFeeds(view.battlePower[rootOf(speciesId)] ?? 0) >= growth().ivMax;

/** 💗 게이지: 진화 전이면 "다음 진화까지", 다 진화했으면 "★+1 까지" */
export function HeartGauge({ view, speciesId, compact }: { view: ChildView; speciesId: number; compact?: boolean }) {
  const { hearts, goal, final } = heartInfo(view, speciesId);
  const maxed = final && isMaxPower(view, speciesId);
  const pct = goal > 0 ? Math.min(100, (hearts / goal) * 100) : 100;
  return (
    <div className={'heart-gauge' + (compact ? ' compact' : '') + (hearts >= goal ? ' full' : '')} title={final ? `💗 ${goal}칸마다 배틀 힘 ★+1` : `진화하려면 💗 ${goal}`}>
      <span className="heart-label">💗 {compact ? '' : '친해짐 '}<b>{hearts}</b> / {goal}{final && !compact ? (maxed ? ' · 다 컸어!' : ' → ★+1') : ''}</span>
      <span className="heart-bar"><i style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

/** 배틀 힘: 포켓로그에서 세지는 정도 (별 5칸 = 포켓로그 개체값 비율). 최대면 "배틀 힘 최고!" */
export function BattlePower({ feeds }: { feeds: number }) {
  const iv = battleIvFromFeeds(feeds);
  const max = growth().ivMax;
  const stars = battleStars(iv);
  return (
    <p className="battle-power" title={`포켓로그 개체값 ${iv} / ${max}`}>
      {iv >= max
        ? <b className="power-max">배틀 힘 최고!</b>
        : <>배틀 힘 <span className="power-stars" aria-label={`별 ${stars}개 / 5개`}>{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < stars ? 'on' : ''}>★</i>)}</span><small className="power-num"> {iv}/{max}</small></>}
    </p>
  );
}

/** 진화 준비가 다 됐는지 (에너지 + 💗) */
function readyToEvolve(view: ChildView, p: OwnedPokemon) {
  const { hearts, goal, final } = heartInfo(view, p.species);
  if (final || hearts < goal) return false;
  return evolutionsOf(p.species).some(t => evolutionRequirement(t).every(r => view.stats[r.type] >= r.amount));
}

/** 첫 화면: 모험 팀 3마리를 나란히 (파트너 + 친구 2). 비어 있는 칸을 누르면 친구 고르기 */
export function TeamStrip({ view, busy, onEdit, onIntro }: { view: ChildView; busy: boolean; onEdit: () => void; onIntro: () => void }) {
  const partner = view.owned.find(p => p.uid === view.partner);
  const friends = view.team.map(uid => view.owned.find(p => p.uid === uid)).filter((p): p is OwnedPokemon => !!p);
  const members = [partner, ...friends].filter((p): p is OwnedPokemon => !!p);
  // ★이 최대인 포켓몬 (같은 계열이 둘이면 한 번만)
  const grown = members.filter((p, i) => isMaxPower(view, p.species) && members.findIndex(m => rootOf(m.species) === rootOf(p.species)) === i);
  const g = growth();
  return (
    <section className="panel team-strip">
      <div className="team-head">
        <h3>🎒 모험 팀</h3>
        <small>정답 하나에 파트너 💗{g.heartPartner}, 친구 💗{g.heartFriend}</small>
      </div>
      <div className="team-row">
        {[partner, friends[0], friends[1]].map((p, i) => p ? (
          <div key={p.uid} className={'team-member' + (i === 0 ? ' is-partner' : '') + (p.shiny ? ' is-shiny' : '')}>
            <span className="team-role">{i === 0 ? '파트너' : '친구'}</span>
            <PokemonImage id={p.species} shiny={p.shiny} />
            <b className="team-name">{pokemonLabel(p)}</b>
            <HeartGauge view={view} speciesId={p.species} compact />
            <BattlePower feeds={view.battlePower[rootOf(p.species)] ?? 0} />
            {readyToEvolve(view, p) && <span className="team-ready">🌱 진화할 수 있어!</span>}
          </div>
        ) : (
          <button key={'empty' + i} className="team-member empty" disabled={busy} onClick={onEdit}>
            <span className="team-role">친구</span>
            <span className="team-plus">＋</span>
            <b className="team-name">친구 넣기</b>
          </button>
        ))}
      </div>
      {grown.map(p => (
        <p key={p.uid} className="team-grown">🎉 {plainName(p)}는 다 컸어! 새 친구를 모험 팀에 넣어 볼까?</p>
      ))}
      <div className="team-actions">
        <button className="secondary" disabled={busy} onClick={onEdit}>🎒 모험 팀 바꾸기</button>
        <button className="text-button" onClick={onIntro}>📖 새 규칙 다시 보기</button>
      </div>
    </section>
  );
}

/** 친구 2마리 고르기 (파트너는 맨 위에 고정) */
function TeamPicker({ view, friends, setFriends }: { view: ChildView; friends: string[]; setFriends: (f: string[]) => void }) {
  const [hint, setHint] = useState('');
  const others = view.owned.filter(p => p.uid !== view.partner);
  if (!others.length) return <p className="team-hint">아직 다른 포켓몬이 없어. 볼을 열어 새 친구를 만나면 모험 팀에 넣을 수 있어!</p>;
  return (
    <>
      <div className="partner-choices team-choices">
        {others.map(p => {
          const n = friends.indexOf(p.uid);
          return (
            <button key={p.uid} className={'partner-choice' + (n >= 0 ? ' current' : '')}
              onClick={() => {
                if (n >= 0) { setFriends(friends.filter(uid => uid !== p.uid)); setHint(''); return; }
                if (friends.length >= 2) { setHint('친구는 2마리까지야. 먼저 한 마리를 빼 줘.'); return; }
                setFriends([...friends, p.uid]); setHint('');
              }}>
              <PokemonImage id={p.species} shiny={p.shiny} />
              <b>{pokemonLabel(p)}</b>
              {n >= 0 ? <small>🎒 친구 {n + 1}</small> : <small>💗 {heartInfo(view, p.species).hearts}</small>}
            </button>
          );
        })}
      </div>
      {hint && <p className="team-hint">{hint}</p>}
    </>
  );
}

/** 모험 팀 바꾸기 창 */
export function TeamDialog({ view, busy, open, onClose, onSave }: {
  view: ChildView; busy: boolean; open: boolean; onClose: () => void; onSave: (friends: string[]) => Promise<boolean>;
}) {
  const [friends, setFriends] = useState<string[]>(view.team);
  const partner = view.owned.find(p => p.uid === view.partner);
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="reward-dialog team-dialog">
        <DialogTitle>🎒 모험 팀 바꾸기</DialogTitle>
        <DialogDescription>
          {partner ? `파트너는 ${yaIya(plainName(partner))} ` : ''}함께 다닐 친구 2마리를 골라 봐! 모은 💗는 그대로 남아.
        </DialogDescription>
        <TeamPicker view={view} friends={friends} setFriends={setFriends} />
        <button className="primary big-button" disabled={busy} onClick={async () => { if (await onSave(friends)) onClose(); }}>모험 떠나기!</button>
        <button className="secondary" onClick={onClose}>닫기</button>
      </DialogContent>
    </Dialog>
  );
}

// ---------- 업데이트 안내 팝업 (기기마다 한 번, 6장) ----------
const INTRO_KEY = 'pq-adventure-intro-v1';
/** 이 기기에서 업데이트 안내를 봤는지 (기기 브라우저에 기억: 아빠 폰에서 봐도 아이 폰에서는 처음처럼 뜸) */
export function adventureIntroSeen(): boolean {
  try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return memorySeen; }
}
let memorySeen = false;
export function markAdventureIntroSeen() {
  memorySeen = true;
  try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* 저장이 막혀 있으면 이번 실행 동안만 */ }
}

const introPages = (g = growth()) => [
  <>
    <p className="intro-title">🎉 포켓몬 배움 탐험대가 새로워졌어!</p>
    <p className="intro-text">포켓몬을 키우는 방법이 바뀌었어.<br />같이 알아보자!</p>
  </>,
  <>
    <p className="intro-title">🎒 모험 팀이 생겼어!</p>
    <p className="intro-text">파트너 1마리 + 친구 2마리<br />모두 3마리가 함께 다녀.</p>
    <p className="intro-text">문제를 맞히면<br />파트너는 💗 {g.heartPartner}개, 친구는 💗 {g.heartFriend}개!</p>
  </>,
  <>
    <p className="intro-title">🌱 진화하려면?</p>
    <p className="intro-text">⚡ 에너지 + 💗 친해짐<br />두 가지를 다 모아야 해!</p>
    <p className="intro-text">이제는 바로 진화 못 해.<br />같이 문제를 풀면서 친해지면 진화할 수 있어!</p>
  </>,
  <>
    <p className="intro-title">⭐ 배틀 힘이 생겼어!</p>
    <p className="intro-text">별이 많을수록 배틀에서 더 세!</p>
    <p className="intro-text">별을 올리는 방법:<br />🍎 열매 먹이기<br />⚡ 에너지 {g.energyPerStar}개로 바꾸기<br />💗 다 큰 포켓몬은 친해지면 별이 올라!</p>
  </>,
  <>
    <p className="intro-title">📌 하나 더!</p>
    <p className="intro-text">경험치를 에너지로 바꾸는 건<br />하루에 {g.expExchangePerDay}번까지만 할 수 있어.</p>
    <p className="intro-text">이미 진화한 포켓몬은 그대로야.<br />걱정 마! 😊</p>
  </>,
];

/** 업데이트 안내 6장: 5장 넘기기 + 마지막 장에서 모험 팀 고르기 */
export function AdventureIntro({ view, open, busy, onClose, onSave }: {
  view: ChildView; open: boolean; busy: boolean; onClose: () => void; onSave: (friends: string[]) => Promise<boolean>;
}) {
  const [page, setPage] = useState(0);
  const [friends, setFriends] = useState<string[]>(view.team);
  const partner = view.owned.find(p => p.uid === view.partner);
  const pages = introPages();
  const total = pages.length + 1;
  const last = page === total - 1;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="reward-dialog rainbow-intro adventure-intro">
        <DialogTitle className="sr-only">새 규칙 안내</DialogTitle>
        <DialogDescription className="sr-only">{page + 1}장 / {total}장</DialogDescription>
        {last ? (
          <div className="intro-page" key={page}>
            <p className="intro-title">🎒 모험 팀을 만들어 보자!</p>
            {partner && <div className="intro-partner"><PokemonImage id={partner.species} shiny={partner.shiny} /></div>}
            <p className="intro-text">파트너는 {partner ? yaIya(plainName(partner)) : '아직 없어'}.<br />함께 다닐 친구 2마리를 골라 봐!</p>
            <TeamPicker view={view} friends={friends} setFriends={setFriends} />
          </div>
        ) : <div className="intro-page" key={page}>{pages[page]}</div>}
        <div className="intro-dots">{Array.from({ length: total }, (_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>
        {last
          ? <button className="primary glow big-button" disabled={busy} onClick={async () => { if (await onSave(friends)) onClose(); }}>모험 떠나기!</button>
          : <div className="intro-buttons">
              <button className="primary big-button" onClick={() => setPage(p => p + 1)}>다음 <ArrowRight size={22} /></button>
              {page > 0 && <button className="secondary" onClick={() => setPage(p => p - 1)}>앞으로</button>}
            </div>}
      </DialogContent>
    </Dialog>
  );
}

// ---------- 포켓몬 카드의 교환: 에너지 10 → ★+1 ----------
export function EnergyStarDialog({ view, pokemon, busy, onClose, onTrade }: {
  view: ChildView; pokemon: OwnedPokemon | null; busy: boolean; onClose: () => void;
  onTrade: (uid: string, type: TypeKey) => Promise<boolean>;
}) {
  const types = pokemon ? species(pokemon.species).types : [];
  const [chosen, setChosen] = useState<TypeKey | null>(types.slice().sort((a, b) => view.stats[b] - view.stats[a])[0] ?? null);
  const cost = growth().energyPerStar;
  const maxed = pokemon ? isMaxPower(view, pokemon.species) : false;
  const enough = !!chosen && view.stats[chosen] >= cost;
  return (
    <Dialog open={!!pokemon} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="reward-dialog energy-star-dialog">
        <DialogTitle>⚡ 에너지로 배틀 힘 올리기</DialogTitle>
        <DialogDescription>{pokemon && `${plainName(pokemon)}의 속성 에너지 ${cost}개로 배틀 힘 ★+1! 어떤 에너지를 쓸까?`}</DialogDescription>
        {pokemon && <BattlePower feeds={view.battlePower[rootOf(pokemon.species)] ?? 0} />}
        <div className="energy-star-types">
          {types.map(t => (
            <button key={t} className={'exchange-type' + (t === chosen ? ' current' : '')} onClick={() => setChosen(t)}>
              <TypeBadge type={t} />
              <b>⚡ {view.stats[t]}</b>
            </button>
          ))}
        </div>
        <button className="primary big-button" disabled={busy || maxed || !enough}
          onClick={async () => { if (pokemon && chosen && await onTrade(pokemon.uid, chosen)) onClose(); }}>
          {maxed ? '배틀 힘 최고!' : !enough ? `에너지가 ${chosen ? cost - view.stats[chosen] : cost}개 더 필요해` : `에너지 ${cost} → ★+1`}
        </button>
        <button className="secondary" onClick={onClose}>닫기</button>
      </DialogContent>
    </Dialog>
  );
}

// ---------- 정답 화면: 💗 소식 ----------
export type HeartGainView = {
  uid: string; species: number; shiny: boolean; name: string; role: 'partner' | 'friend';
  amount: number; hearts: number; goal: number; final: boolean; filled: boolean; stars: number; maxed: boolean;
};
/** "💗 +2! 파트너랑 친해지고 있어!" + 가득 찼을 때·★이 올랐을 때 안내 */
export function HeartLines({ hearts }: { hearts: HeartGainView[] }) {
  if (!hearts.length) return null;
  const lines: string[] = [];
  const partner = hearts.find(h => h.role === 'partner');
  const friend = hearts.find(h => h.role === 'friend' && h.amount > 0);
  if (partner && partner.amount > 0) lines.push(`💗 +${partner.amount}! 파트너랑 친해지고 있어!`);
  if (friend) lines.push(`💗 +${friend.amount}! 친구랑 친해지고 있어!`);
  for (const h of hearts) if (h.filled) lines.push(`${waGwa(h.name)} 친해졌어! 이제 진화할 수 있어!`);
  if (hearts.some(h => h.stars > 0)) lines.push('⭐ 배틀 힘이 올랐어! 배틀에서 더 세졌어!');
  return (
    <div className="heart-lines" role="status">
      {lines.map((l, i) => <p key={i} className={i === 0 ? 'heart-main' : ''}>{l}</p>)}
      <div className="heart-mini">
        {hearts.map(h => (
          <span key={h.uid}>
            <PokemonImage id={h.species} shiny={h.shiny} />
            💗 {h.hearts}/{h.goal}
          </span>
        ))}
      </div>
    </div>
  );
}
