"use client";
// 📖 방명록 (2026-11-14 부모님 결정): 마을 손님·낚시·벌레잡기에서 만난 포켓몬. 도감이 아니라 여기에 남아요.
// 포켓몬별 처음 온 날·온 횟수(🐾 발자국 도장)·들은 대사·알아낸 정보(좋아하는 열매·물건). 안 온 포켓몬은 빈칸.
import { useState } from 'react';
import { POTIONS } from '@/lib/game-config';
import type { ChildView } from '@/lib/game-engine';
import { species } from '@/lib/pokedex';
import { DECOR_INFO } from '@/lib/village-decor';
import { PokemonImage } from './common';
import { BerryIcon } from './village-craft';

type Book = ChildView['village']['guestbook'];
type Entry = Book['entries'][number];
const FROM: Record<string, string> = { guest: '🏕️ 서식지 손님', fish: '🎣 낚시', bug: '🦋 벌레잡기', old: '🏡 예전 손님' };
const day = (d: string | null) => (d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : '예전에');

export function GuestbookSheet({ book }: { book: Book }) {
  const [open, setOpen] = useState<Entry | null>(null);
  if (open) return <GuestPage e={open} onBack={() => setOpen(null)} />;
  const blanks = Math.max(0, book.total - book.entries.length);
  return <>
    <h3>📖 방명록 <small className="muted">{book.entries.length} / {book.total}</small></h3>
    <p className="village-sheet-note">마을에 놀러 온 친구들이 남긴 기록이야. 누르면 처음 온 날, 발자국 도장, 들은 말을 볼 수 있어. 손님에게 말을 걸면 좋아하는 것을 알려 줘!</p>
    <div className="guestbook-grid">
      {book.entries.map(e => (
        <button key={e.species} className="guestbook-cell" onClick={() => setOpen(e)}>
          <span className="guestbook-mon"><PokemonImage id={e.species} /></span>
          <b>{species(e.species).name}</b>
          <small>🐾 {e.visits}</small>
        </button>
      ))}
      {Array.from({ length: Math.min(blanks, 12) }, (_, i) => <span key={'b' + i} className="guestbook-cell blank" aria-hidden>?</span>)}
    </div>
    {blanks > 0 && <p className="village-sheet-note">아직 안 온 친구가 {blanks}마리 더 있어. 서식지를 만들고, 낚시·벌레잡기도 해 보자!</p>}
  </>;
}

function GuestPage({ e, onBack }: { e: Entry; onBack: () => void }) {
  return <>
    <h3>📖 {species(e.species).name}</h3>
    <div className="guest-page">
      <span className="guest-page-mon"><PokemonImage id={e.species} /></span>
      <div>
        <p>처음 온 날: <b>{day(e.first)}</b></p>
        <p>온 횟수: <b>{e.visits}번</b></p>
        <p className="guest-from">{e.from.map(f => FROM[f] ?? f).join(' · ')}</p>
      </div>
    </div>
    <div className="guest-stamps" aria-label={`발자국 도장 ${e.visits}개`}>
      {Array.from({ length: Math.max(10, Math.min(e.visits, 30)) }, (_, i) => <span key={i} className={i < e.visits ? 'on' : ''}>🐾</span>)}
    </div>
    <div className="guest-knows">
      <b>알아낸 것</b>
      <p>좋아하는 열매: {e.berry ? <><BerryIcon kind={e.berry} size={22} /> {POTIONS[e.berry].label}</> : <span className="muted">? (말을 걸어 보자)</span>}</p>
      <p>좋아하는 물건: {e.item ? <b>{DECOR_INFO[e.item].name}</b> : <span className="muted">? (또 말을 걸어 보자)</span>}</p>
    </div>
    <div className="guest-lines">
      <b>들은 말</b>
      {e.lines.length ? e.lines.map((l, i) => <p key={i}>💬 {l}</p>) : <p className="muted">아직 들은 말이 없어. 손님을 눌러 말을 걸어 봐!</p>}
    </div>
    <button className="secondary" onClick={onBack}>방명록으로 돌아가기</button>
  </>;
}
