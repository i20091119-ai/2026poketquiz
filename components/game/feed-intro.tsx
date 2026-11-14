"use client";
// 열매·상처약 먹이기 → 💗 친해짐 안내 (2026-11-12 부모님 요청). 업데이트 뒤 기기마다 한 번.
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { growth } from '@/lib/game-config';
import type { ChildView } from '@/lib/game-engine';
import { PokemonImage } from './common';

/* eslint-disable @next/next/no-img-element */

const KEY = 'pq-feed-intro-v1';
export function feedIntroSeen(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}
export function markFeedIntroSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* 이번 화면 동안만 */ } }

export function FeedIntro({ open, view, onClose, onGoBag }: { open: boolean; view: ChildView; onClose: () => void; onGoBag: () => void }) {
  const [page, setPage] = useState(0);
  const partner = view.owned.find(p => p.uid === view.partner);
  const hearts = growth().feedHearts;
  const pages = [
    <>
      <p className="intro-title">🍎 먹이면 친해져!</p>
      <div className="feed-intro-pics">
        <img src={ASSETS.potion.apple} alt="" />
        <img src={ASSETS.potion.potion} alt="" />
        {partner && <PokemonImage id={partner.species} shiny={partner.shiny} />}
      </div>
      <p className="intro-text">열매나 상처약을<br />포켓몬에게 먹이면<br /><b>💗가 {hearts}개</b> 쌓여!</p>
      <p className="intro-text">모험 팀이 아닌 포켓몬도 괜찮아.</p>
    </>,
    <>
      <p className="intro-title">💗를 모으면 진화!</p>
      <p className="intro-text">에너지와 💗가 다 모이면<br /><b>진화</b>할 수 있어.</p>
      <p className="intro-text">다 진화한 포켓몬은 💗가 모이면<br /><b>배틀 힘 ★</b>이 올라가!</p>
    </>,
    <>
      <p className="intro-title">⭐ 다 큰 친구는 쉬어요</p>
      <p className="intro-text">다 진화하고 배틀 힘도 최고인 포켓몬은<br /><b>&ldquo;이미 최고예요&rdquo;</b>라고 나와.</p>
      <p className="intro-text">그럴 땐 다른 친구에게 먹여 줘!</p>
    </>,
  ];
  const last = page === pages.length - 1;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="reward-dialog rainbow-intro feed-intro">
        <DialogTitle className="sr-only">먹이기 안내</DialogTitle>
        <DialogDescription className="sr-only">{page + 1}장 / {pages.length}장</DialogDescription>
        <div className="intro-page" key={page}>{pages[page]}</div>
        <div className="intro-dots">{pages.map((_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>
        {last
          ? <div className="intro-buttons">
              <button className="primary glow big-button" onClick={onGoBag}>🎒 가방에서 먹이러 가기</button>
              <button className="secondary big-button" onClick={onClose}>알았어!</button>
            </div>
          : <div className="intro-buttons">
              <button className="primary big-button" onClick={() => setPage(p => p + 1)}>다음 <ArrowRight size={22} /></button>
              {page > 0 && <button className="secondary" onClick={() => setPage(p => p - 1)}>◀ 이전</button>}
            </div>}
      </DialogContent>
    </Dialog>
  );
}
