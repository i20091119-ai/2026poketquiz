"use client";
// 포켓몬 마을 레벨·열쇠 화면 (2026-11-14 부모님). 규칙은 lib/village-level.ts.
// - 위쪽 막대: 🏡 Lv.N ⭐ 지금/다음 · 🔑 열쇠 수 · ❓ 안내
// - 잠긴 땅: 안개 + 팻말 (열 수 있는 땅은 "🔑 열 수 있어!" 팻말을 누르면 고르기 창)
// - 열쇠 고르기 창: 작은 지도(5×3)에서 열린 땅에 붙은 자물쇠 땅 중 하나를 골라 열기
// - 안내 5장(기기마다 처음 한 번, ❓로 다시 보기): 별 → 레벨 → 열쇠 → 고르기 → 지금 내 마을
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ChildView } from '@/lib/game-engine';
import { DIR_TEXT, GRID } from '@/lib/village-level';

type Level = ChildView['village']['level'];
type RegionView = Level['regions'][number];

/** 위쪽: 🏡 Lv.N 🏠 마을점수 지금/다음 · 🔑 · ❓ (2026-11-14: 별 ⭐은 배틀 힘 ★과 헷갈려서 🏠 마을점수로) */
export function VillageLevelBar({ level, width, onKeys, onHelp, onGuide }: { level: Level; width: number; onKeys: () => void; onHelp: () => void; onGuide?: () => void }) {
  const pct = level.next ? Math.min(100, Math.round((level.into / level.next) * 100)) : 100;
  return (
    <div className="village-level" style={{ width }} aria-label={`마을 레벨 ${level.level}`}>
      <b>🏡 Lv.{level.level}</b>
      <span className="village-level-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
      <small>{level.next ? `🏠 ${level.into}/${level.next}` : '🏠 최고 레벨!'}</small>
      {level.keys > 0 && <button className="village-key-btn" onClick={onKeys} aria-label={`열쇠 ${level.keys}개, 눌러서 땅 열기`}>🔑 {level.keys}</button>}
      <button className="village-help-btn" onClick={onHelp} aria-label="마을 레벨 안내">❓</button>
      {onGuide && <button className="village-help-btn village-guide-btn" onClick={onGuide} aria-label="마을 설명서 보기">📘 설명서</button>}
    </div>
  );
}

/** 잠긴 땅: 안개 + 팻말. 열 수 있는 땅의 팻말은 누르면 고르기 창 */
export function LockedRegions({ regions, keys, tile, onChoose }: { regions: Level['regions']; keys: number; tile: number; onChoose: (id: string) => void }) {
  return <>{regions.filter(r => r.status !== 'open').map(r => (
    <div key={r.id} className={'village-fog' + (r.status === 'choose' ? ' choose' : '')} style={{ left: r.x * tile, top: r.y * tile, width: r.w * tile, height: r.h * tile }}>
      {r.status === 'choose'
        ? <button className="village-fog-sign can" onClick={() => onChoose(r.id)}>🔒 {r.emoji} {r.name}<br /><small>{keys > 0 ? '🔑 열쇠로 열 수 있어! 눌러 봐' : '🔑 레벨이 오르면 열 수 있어'}</small></button>
        : <span className="village-fog-sign">🔒 {r.name}<br /><small>옆 땅을 먼저 열어야 해</small></span>}
    </div>
  ))}</>;
}

/** 작은 지도 (5×3): 열린 땅·열 수 있는 땅·먼 땅 */
function MiniMap({ regions, pick, onPick }: { regions: Level['regions']; pick?: string | null; onPick?: (id: string) => void }) {
  return (
    <div className="village-minimap" style={{ gridTemplateColumns: `repeat(${GRID.cols}, 1fr)` }}>
      {[...regions].sort((a, b) => a.row - b.row || a.col - b.col).map(r => (
        <button key={r.id} disabled={r.status !== 'choose' || !onPick} onClick={() => onPick?.(r.id)}
          className={'village-mini ' + r.status + (pick === r.id ? ' picked' : '') + (r.id === 'C1' ? ' home' : '')}
          aria-label={`${r.name} ${r.status === 'open' ? '열림' : r.status === 'choose' ? '열 수 있음' : '잠김'}`}>
          <span>{r.status === 'locked' ? '🔒' : r.emoji}</span>
          <small>{r.status === 'locked' ? '' : r.name}</small>
        </button>
      ))}
    </div>
  );
}

/** 열쇠로 열 땅 고르기 */
export function KeyChooser({ level, open, busy, first, onUnlock, onClose }: {
  level: Level; open: boolean; busy: boolean; first?: string | null;
  onUnlock: (id: string) => Promise<boolean>; onClose: () => void;
}) {
  const choices = level.regions.filter(r => r.status === 'choose');
  const [pick, setPick] = useState<string | null>(first ?? null);
  const chosen = choices.find(r => r.id === pick) ?? null;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="reward-dialog village-keys">
        <DialogTitle>{level.keys > 0 ? `🔑 열쇠가 ${level.keys}개 있어!` : '🔑 열쇠가 없어'}</DialogTitle>
        <DialogDescription>{level.keys > 0 ? '어느 땅을 열까? 노란 칸 중에서 하나를 골라 줘.' : '마을에서 🏠 마을점수를 모아 레벨을 올리면 열쇠가 생겨.'}</DialogDescription>
        <MiniMap regions={level.regions} pick={pick} onPick={level.keys > 0 ? setPick : undefined} />
        <div className="village-key-list">
          {choices.map(r => (
            <button key={r.id} className={'village-key-choice' + (pick === r.id ? ' on' : '')} disabled={level.keys < 1} onClick={() => setPick(r.id)}>
              <b>{r.dir ? DIR_TEXT[r.dir] : ''}</b> {r.emoji} {r.name}<small>{r.about}</small>
            </button>
          ))}
        </div>
        {level.keys > 0 && <button className="primary big-button" disabled={busy || !chosen} onClick={async () => { if (chosen && await onUnlock(chosen.id)) setPick(null); }}>
          {chosen ? `🔓 ${chosen.name} 열기!` : '땅을 골라 줘'}
        </button>}
        <button className="secondary" disabled={busy} onClick={onClose}>{level.keys > 0 ? '나중에 고를래' : '알았어'}</button>
        {level.keys > 0 && <p className="village-key-note">한 번 연 땅은 다시 닫히지 않아. 천천히 골라도 괜찮아! 열쇠는 없어지지 않아.</p>}
      </DialogContent>
    </Dialog>
  );
}

// ---------- 안내 5장 (기기마다 처음 한 번, ❓로 다시) ----------
const GUIDE_KEY = 'pq-village-level-guide-v1';
export function levelGuideSeen(): boolean { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return true; } }
function markGuideSeen() { try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* 이번 화면 동안만 */ } }

export function LevelGuide({ open, level, onClose }: { open: boolean; level: Level; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const s = level.starRules;
  const pages = [
    <>
      <p className="intro-title">🏡 마을 레벨이 생겼어!</p>
      <p className="intro-text">마을에서 여러 가지 일을 하면<br /><b>🏠 마을점수</b>를 받아.</p>
      <p className="intro-text">마을점수가 모이면 <b>마을 레벨</b>이 올라가!</p>
      <p className="intro-text small">마을 위쪽 막대에서 마을점수가 얼마나 모였는지 볼 수 있어.</p>
    </>,
    <>
      <p className="intro-title">🏠 마을점수 받는 방법</p>
      <ul className="village-guide-list">
        <li>🐾 처음 보는 손님 만나기 <b>🏠{s.guest}</b></li>
        <li>🏕️ 서식지에 손님이 찾아온 날 <b>서식지마다 🏠{s.habitat}</b></li>
        <li>🔨 서식지·꾸미기 물건 만들기 <b>🏠{s.make}</b></li>
        <li>⚪ 볼·묘목 만들기 <b>🏠{s.ball}</b></li>
        <li>🍎 열매 따기 <b>🏠{s.harvest}</b></li>
      </ul>
      <p className="intro-text small">마을은 오늘 미션을 끝내야 열려. 공부하고 놀러 오자!</p>
    </>,
    <>
      <p className="intro-title">🔑 레벨이 오르면 열쇠!</p>
      <p className="intro-text">레벨이 하나 오를 때마다<br /><b>열쇠 1개</b>를 받아.</p>
      <p className="intro-text">마을 둘레에 <b>🔒 자물쇠 땅</b>이 있지?<br />열쇠 1개로 땅 <b>1곳</b>을 열 수 있어.</p>
    </>,
    <>
      <p className="intro-title">🗺️ 어느 쪽을 열까?</p>
      <MiniMap regions={level.regions} />
      <p className="intro-text"><b>⬅️ 왼쪽, ➡️ 오른쪽, ⬇️ 아래</b> 중에서<br />지금 마을에 <b>붙어 있는 땅</b>만 열 수 있어.</p>
      <p className="intro-text small">땅을 열면 그 옆 땅도 열 수 있게 돼. 계속 열면 마을이 점점 커져!<br />새 땅에는 밭·열매나무 자리·바위·재료가 있어.</p>
    </>,
    <>
      <p className="intro-title">📈 지금 내 마을</p>
      <p className="intro-text">마을 레벨 <b>{level.level}</b> · 연 땅 <b>{level.regions.filter(r => r.status === 'open').length}</b> / {level.regions.length}</p>
      <p className="intro-text">{level.next ? <>다음 레벨까지 🏠 마을점수 <b>{level.next - level.into}개</b> 남았어!</> : '최고 레벨이야! 대단해!'}</p>
      {level.keys > 0 && <p className="intro-text">지금 <b>🔑 열쇠 {level.keys}개</b>가 있어. 바로 열어 보자!</p>}
      <p className="intro-text small">마을 위쪽 ❓를 누르면 이 안내를 다시 볼 수 있어.</p>
    </>,
  ];
  const last = page === pages.length - 1;
  const close = () => { markGuideSeen(); setPage(0); onClose(); };
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="reward-dialog rainbow-intro feed-intro village-guide">
        <DialogTitle className="sr-only">마을 레벨 안내</DialogTitle>
        <DialogDescription className="sr-only">{page + 1}장 / {pages.length}장</DialogDescription>
        <div className="intro-page" key={page}>{pages[page]}</div>
        <div className="intro-dots">{pages.map((_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>
        <div className="intro-buttons">
          {last
            ? <button className="primary glow big-button" onClick={close}>{level.keys > 0 ? '🔑 땅 열러 가기' : '알았어!'}</button>
            : <button className="primary big-button" onClick={() => setPage(p => p + 1)}>다음 <ArrowRight size={22} /></button>}
          {page > 0 && <button className="secondary" onClick={() => setPage(p => p - 1)}>◀ 이전</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 마을 안에서 안내·열쇠 창을 언제 띄울지: 제작대 안내가 끝난 뒤 → 레벨 안내(처음 한 번) → 열쇠가 있으면 고르기 창 */
export function useLevelPopups(inside: boolean, blocked: boolean, keys: number) {
  const [guide, setGuide] = useState(false);
  const [chooser, setChooser] = useState<{ open: boolean; first: string | null }>({ open: false, first: null });
  const [later, setLater] = useState(false);
  useEffect(() => {
    if (!inside || blocked || guide || chooser.open) return;
    const t = window.setTimeout(() => {
      if (!levelGuideSeen()) setGuide(true);
      else if (keys > 0 && !later) setChooser({ open: true, first: null });
    }, 500);
    return () => window.clearTimeout(t);
  }, [inside, blocked, guide, chooser.open, keys, later]);
  return {
    guide, chooser,
    openGuide: () => setGuide(true),
    closeGuide: () => setGuide(false),
    openChooser: (first: string | null = null) => setChooser({ open: true, first }),
    closeChooser: () => { setChooser({ open: false, first: null }); setLater(true); },
    doneChooser: () => setChooser({ open: false, first: null }),
  };
}

export type { RegionView };
