"use client";
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { ChildView, OwnedPokemon } from '@/lib/game-engine';
import { ASSETS } from '@/lib/assets';
import { evolutionRequirement, evolutionsOf, isStrong, shinyName, species, thirdTypeOf, TOTAL_SPECIES } from '@/lib/pokedex';
import { megaByKey, megaImages, megaLabel, MEGA_EMOJI, TOTAL_MEGAS, type MegaForm } from '@/lib/megas';
import { evolveHearts, type TypeKey } from '@/lib/game-config';
import { dexNo, PokemonImage, TypeBadge } from './common';
import { rootOf } from '@/lib/pokedex';
import { BattlePower, EnergyStarDialog, HeartGauge, heartInfo, isMaxPower } from './adventure';

export { BattlePower };
/** 도감 탭에서 부모(게임 화면)로 올리는 동작 */
type DexActions = {
  onPartner: (uid: string) => void;
  onEvolve: (uid: string, target: number) => void;
  /** 💗가 모자란데 진화를 눌렀을 때 안내 */
  onNotice: (message: string) => void;
  /** 에너지 10 → ★+1 */
  onEnergyStar: (uid: string, type: TypeKey) => Promise<boolean>;
};

type DexKind = 'basic' | 'shiny' | 'mega';
const DEX_TABS: { key: DexKind; label: string }[] = [
  { key: 'basic', label: '기본 도감' },
  { key: 'shiny', label: '✨ 이로치 도감' },
  { key: 'mega', label: `${MEGA_EMOJI} 메가 도감` },
];

/** 포켓몬 도감: [기본 도감 | 이로치 도감 | 메가 도감] 세 개의 작은 탭 */
export function PokedexTab({ view, busy, ...actions }: { view: ChildView; busy: boolean } & DexActions) {
  const [kind, setKind] = useState<DexKind>('basic');
  return (
    <>
      <div className="dex-subtabs" role="tablist" aria-label="도감 종류">
        {DEX_TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={kind === t.key} className={'dex-subtab' + (kind === t.key ? ' active' : '')} onClick={() => setKind(t.key)}>{t.label}</button>
        ))}
      </div>
      {kind === 'basic' && <BasicDex view={view} busy={busy} {...actions} />}
      {kind === 'shiny' && <ShinyDex view={view} />}
      {kind === 'mega' && <MegaDex view={view} />}
    </>
  );
}

/** 기본 도감: "포켓몬 도감 ○ / 1025". 내 포켓몬 카드 화면(기본)과 만난 포켓몬 그림 화면을 바꿔 볼 수 있어요. 이로치는 이로치 도감에 따로 모여요. */
function BasicDex({ view, busy, ...actions }: { view: ChildView; busy: boolean } & DexActions) {
  const [showDex, setShowDex] = useState(false);
  const [trading, setTrading] = useState<string | null>(null);
  const tradePokemon = view.owned.find(p => p.uid === trading) ?? null;
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
            <OwnedCard key={p.uid} pokemon={p} view={view} busy={busy} {...actions} onTrade={() => setTrading(p.uid)} />
          ))}
        </div>
      )}
      <EnergyStarDialog key={trading ?? 'none'} view={view} pokemon={tradePokemon} busy={busy} onClose={() => setTrading(null)} onTrade={actions.onEnergyStar} />
    </>
  );
}

/** 이로치 도감: "이로치 도감 ○ / 1025". 모은 이로치를 이로치 그림과 색 이름(예: 오렌지피카츄)으로 */
function ShinyDex({ view }: { view: ChildView }) {
  const shiny = useMemo(() => [...view.shiny].sort((a, b) => a - b), [view.shiny]);
  return (
    <>
      <section className="panel dex-summary">
        <div>
          <span className="pill">✨ SHINY</span>
          <h2>이로치 도감 {shiny.length} / {TOTAL_SPECIES}</h2>
          <Progress value={(shiny.length / TOTAL_SPECIES) * 100} />
          <p className="muted dex-howto">볼을 열 때 가끔 나오고, 이벤트에서도 얻을 수 있어요</p>
        </div>
      </section>
      {shiny.length === 0 ? (
        <section className="panel dex-empty"><p>아직 이로치가 없어. 볼을 열어서 반짝이는 친구를 만나 봐! ✨</p></section>
      ) : (
        <div className="dex-grid">
          {shiny.map(id => (
            <div className="dex-cell is-shiny" key={id}>
              <PokemonImage id={id} shiny />
              <small>{dexNo(id)} ✨</small>
              <span>{shinyName(id)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** 메가 도감: "메가 도감 ○ / 96". 지금은 해금 방법이 없어서 0마리면 잠긴 실루엣만 보여요 */
function MegaDex({ view }: { view: ChildView }) {
  const got = useMemo(() => view.megas.map(megaByKey).filter((m): m is MegaForm => !!m), [view.megas]);
  const locked = useMemo(() => ['6-mega-x', '150-mega-y', '448-mega', '94-mega', '445-mega', '282-mega'].map(megaByKey).filter((m): m is MegaForm => !!m), []);
  return (
    <>
      <section className="panel dex-summary">
        <div>
          <span className="pill">MEGA</span>
          <h2>{MEGA_EMOJI} 메가 도감 {got.length} / {TOTAL_MEGAS}</h2>
          <Progress value={(got.length / TOTAL_MEGAS) * 100} />
        </div>
      </section>
      {got.length === 0 ? (
        <>
          <div className="dex-grid">
            {locked.map(m => (
              <div className="dex-cell is-locked" key={m.key}>
                <MegaImage art={m.art} name="잠긴 메가" />
                <small>???</small>
                <span>잠겨 있어요</span>
              </div>
            ))}
          </div>
          <section className="panel dex-empty"><p>🔒 특별 미션으로 열려요</p></section>
        </>
      ) : (
        <div className="dex-grid">
          {got.map(m => (
            <div className="dex-cell is-mega" key={m.key}>
              <MegaImage art={m.art} name={m.name} />
              <small>{dexNo(m.species)}</small>
              <span>{megaLabel(m)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** 메가 그림: 우리 사이트에 둔 그림 → PokeAPI 저장소 → 임시 그림 순서로 시도 */
function MegaImage({ art, name }: { art: number; name: string }) {
  const sources = [...megaImages(art), ASSETS.pokemonPlaceholder];
  const [index, setIndex] = useState(0);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={art} src={sources[index]} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setIndex(i => Math.min(i + 1, sources.length - 1))} />
  );
}

/** 포켓로그에서 이 포켓몬(계열)이 도달한 최고 레벨. 새 판은 레벨 5부터 다시 시작하지만 최고 기록은 남습니다. */
function BattleLevel({ level }: { level?: number }) {
  return <p className="battle-level">{level ? <>⚔️ 포켓로그 최고 <b>Lv.{level}</b></> : <span className="muted">⚔️ 포켓로그 기록 없음</span>}</p>;
}

function OwnedCard({ pokemon, view, busy, onPartner, onEvolve, onNotice, onTrade }: {
  pokemon: OwnedPokemon; view: ChildView; busy: boolean; onTrade: () => void;
} & DexActions) {
  const s = species(pokemon.species);
  const targets = evolutionsOf(pokemon.species);
  const isPartner = view.partner === pokemon.uid;
  const inTeam = view.team.includes(pokemon.uid);
  const { hearts } = heartInfo(view, pokemon.species);
  const maxed = isMaxPower(view, pokemon.species);
  return (
    <section className={'panel pokemon-card' + (isPartner ? ' is-partner' : '') + (pokemon.shiny ? ' is-shiny' : '')}>
      <small>{dexNo(s.id)}</small>
      {pokemon.shiny && !isPartner && <span className="shiny-tag">✨ 이로치</span>}
      {isPartner && <span className="partner-tag">{pokemon.shiny ? '✨ 파트너' : '🎒 파트너'}</span>}
      {inTeam && <span className="partner-tag friend-tag">🎒 모험 팀</span>}
      <PokemonImage id={s.id} shiny={pokemon.shiny} />
      <h3>{pokemon.shiny ? `✨ ${shinyName(s.id)}` : s.name}</h3>
      <div className="type-row">{s.types.map(t => <TypeBadge key={t} type={t} small />)}</div>
      <BattleLevel level={view.battleLevels[rootOf(s.id)]} />
      <HeartGauge view={view} speciesId={s.id} />
      <BattlePower feeds={view.battlePower[rootOf(s.id)] ?? 0} />
      <button className="secondary small energy-star-btn" disabled={busy || maxed} onClick={onTrade}>{maxed ? '배틀 힘 최고!' : '⚡ 에너지 10 → ★+1'}</button>
      {!isPartner && <button className="secondary" disabled={busy} onClick={() => onPartner(pokemon.uid)}>파트너로 함께하기</button>}
      <div className="evolutions">
        {targets.length === 0 && <p className="final-evolution">더 이상 진화하지 않아요</p>}
        {targets.map(target => {
          const req = evolutionRequirement(target);
          const ready = req.every(r => view.stats[r.type] >= r.amount);
          const needHearts = evolveHearts(species(target).stage);
          const heartsReady = hearts >= needHearts;
          return (
            <div className="evolution" key={target}>
              <div className="evolution-head">
                <PokemonImage id={target} shiny={pokemon.shiny} className="evolution-img" />
                <span>→ <b>{pokemon.shiny ? shinyName(target) : species(target).name}</b>{isStrong(target) && <em className="strong-tag" title="센 포켓몬은 에너지가 더 많이 필요해요" aria-label="센 포켓몬">💥</em>}</span>
              </div>
              <div className="requirements">
                {req.map(r => (
                  <span key={r.type} className={'requirement' + (view.stats[r.type] >= r.amount ? ' met' : '')}>
                    <TypeBadge type={r.type} small /> ⚡ {view.stats[r.type]} / {r.amount}
                    {view.stats[r.type] >= r.amount && <Check size={14} />}
                  </span>
                ))}
                <span className={'requirement heart-req' + (heartsReady ? ' met' : '')}>
                  💗 {Math.min(hearts, needHearts)} / {needHearts}
                  {heartsReady && <Check size={14} />}
                </span>
              </div>
              {thirdTypeOf(target) && <p className="strong-note">도전 속성까지 모으면 진화해! 3과목을 골고루 풀어 보자.</p>}
              <button className="primary" disabled={busy || !ready}
                onClick={() => heartsReady ? onEvolve(pokemon.uid, target) : onNotice(`💗가 ${needHearts - hearts}개 더 필요해! 모험 팀으로 문제를 더 풀어 보자`)}>
                {ready ? '진화!' : '에너지를 더 모아 줘'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
