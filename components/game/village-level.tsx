"use client";
// 포켓몬 마을 레벨 화면 (2026-11-14 부모님: 레벨이 오르면 지도가 넓어지게). 규칙은 lib/village-level.ts.
// 위쪽 별 막대 · 안 열린 구역 안개와 🔒 팻말 · 레벨이 오르면 "마을이 넓어졌어!" 팝업.
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ChildView } from '@/lib/game-engine';

type Level = ChildView['village']['level'];

/** 위쪽: 🏡 Lv.N ⭐ 지금/다음 */
export function VillageLevelBar({ level, width }: { level: Level; width: number }) {
  const pct = level.next ? Math.min(100, Math.round((level.into / level.next) * 100)) : 100;
  const nextRegion = level.regions.find(r => r.level === level.level + 1);
  return (
    <div className="village-level" style={{ width }} aria-label={`마을 레벨 ${level.level}`}>
      <b>🏡 Lv.{level.level}</b>
      <span className="village-level-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
      <small>{level.next ? `⭐ ${level.into}/${level.next}${nextRegion ? ` → ${nextRegion.name}` : ''}` : '⭐ 마을 최고 레벨!'}</small>
    </div>
  );
}

/** 안 열린 구역: 안개 + 팻말 (눌러도 아무 일 없음) */
export function LockedRegions({ regions, tile }: { regions: Level['regions']; tile: number }) {
  return <>{regions.filter(r => !r.open).map(r => (
    <div key={r.level} className="village-fog" style={{ left: r.x * tile, top: r.y * tile, width: r.w * tile, height: r.h * tile }} aria-hidden>
      <span className="village-fog-sign">🔒 레벨 {r.level}<br /><small>{r.name}</small></span>
    </div>
  ))}</>;
}

/** 레벨이 오르면 한 번: 새로 열린 구역 이름 */
export function LevelUpDialog({ level, open, busy, onClose }: { level: Level; open: boolean; busy: boolean; onClose: () => void }) {
  const opened = level.regions.filter(r => r.level > level.seen && r.level <= level.level);
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="reward-dialog village-levelup">
        <DialogTitle>🎉 마을이 넓어졌어!</DialogTitle>
        <DialogDescription>마을 레벨 {level.level} 달성! 새 땅에 가서 꾸며 보자.</DialogDescription>
        <div className="village-levelup-list">
          {opened.map(r => <span key={r.level}>🌱 <b>{r.name}</b>이 열렸어</span>)}
        </div>
        <p className="village-levelup-note">열매나무 자리와 밭도 하나씩 늘었어. 새 땅에서 재료도 떨어져 있을 거야!</p>
        <button className="primary big-button" disabled={busy} onClick={onClose}>가 보자!</button>
      </DialogContent>
    </Dialog>
  );
}
