"use client";
// 트레이너 훈련 하루 선물 상자 모아 보기 (2026-11-20 부모님 요청: 주 1회 몰아서 적으면 상자가 여러 개 → 상자마다 "월 ●"처럼 요일·표시).
// 보여 주는 방식만 바꿈: 상자가 생기는 규칙(언제 몇 개)과 상자 내용·고르기(offlineBox 동작)는 그대로.
// "한 번에 열기" = 상자마다 아이가 카드 하나를 고르는 것과 같은 동작을 차례로 보내고(가려진 카드 중 아무거나), 결과를 요일별로 보여 줌.
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import type { Action, BoxItem, ChildView } from '@/lib/game-engine';
import { MARK_SYMBOL } from '@/lib/offline';
import { ItemView } from './rewards';

/* eslint-disable @next/next/no-img-element */

export type DayBoxView = ChildView['offline']['boxes'][number];
const DOW_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
/** 그 날짜의 요일 ("월") */
export const dowOf = (date: string) => DOW_SHORT[new Date(date + 'T00:00:00Z').getUTCDay()];
/** "월 ●" */
export const dayBoxLabel = (b: { date: string; mark: DayBoxView['mark'] }) => `${dowOf(b.date)} ${MARK_SYMBOL[b.mark]}`;
/** "11월 17일 월요일 ● 훈련" (상자를 열 때 제목 위 이름표) */
export const dayBoxHeading = (b: { date: string; mark: DayBoxView['mark'] }) =>
  `${Number(b.date.slice(5, 7))}월 ${Number(b.date.slice(8))}일 ${dowOf(b.date)}요일 ${MARK_SYMBOL[b.mark]} 훈련`;
const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
export const dayBoxImage = (b: { kind: DayBoxView['kind'] }) => (b.kind === 'book' ? ASSETS.bookBox : ASSETS.boxClosed);

/** 가려진 카드 중 아무거나 (아이가 손으로 고르는 것과 같음) */
const randomIndex = (n: number) => Math.floor(Math.random() * n);

type OpenResult = { id: string; items: (BoxItem | null)[]; picks: number[]; ballIds: string[] };
type Opened = { box: DayBoxView; items: BoxItem[] };

/** 상자 하나 칸: 상자 그림 + "월 ●" + 날짜 */
export function DayBoxTile({ box, onClick, disabled, delay }: { box: DayBoxView; onClick?: () => void; disabled?: boolean; delay?: number }) {
  const inner = <>
    <img src={dayBoxImage(box)} alt="" />
    <b className={'day-box-label mark-' + box.mark}>{dayBoxLabel(box)}</b>
    <small>{shortDate(box.date)}{box.count > 1 ? ` · ${box.count - box.picks.length}개 고르기` : ''}</small>
  </>;
  const style = delay !== undefined ? { animationDelay: `${delay}s` } : undefined;
  return onClick
    ? <button className="day-box-tile pop" style={style} onClick={onClick} disabled={disabled} aria-label={`${dayBoxHeading(box)} 상자 열기`}>{inner}</button>
    : <div className="day-box-tile pop" style={style}>{inner}</div>;
}

/**
 * 하루 선물 상자 목록. 상자를 누르면 그 상자만 열기(onOpenOne → 3개 중 고르기 창),
 * "한 번에 열기"는 모두 열고 요일별 결과. onLater가 있으면 "나중에" 버튼 (훈련 달력에서 다시 열 수 있음).
 */
export function DayBoxesDialog({ open, boxes, title, busy, act, onOpenOne, onLater, onClose, onOpenBalls }: {
  open: boolean; boxes: DayBoxView[]; title?: string; busy: boolean;
  act: <T>(action: Action) => Promise<T | null>;
  onOpenOne: (box: DayBoxView) => void;
  onLater?: () => void;
  onClose: () => void;
  onOpenBalls: (ballIds: string[]) => void;
}) {
  const [phase, setPhase] = useState<'list' | 'opening' | 'done'>('list');
  const [opened, setOpened] = useState<Opened[]>([]);
  const [ballIds, setBallIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const sorted = [...boxes].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  async function openAll() {
    const list = sorted; // 시작할 때의 목록 (여는 동안 화면 목록이 줄어도 그대로)
    setPhase('opening'); setOpened([]); setBallIds([]); setTotal(list.length);
    const ids: string[] = [];
    for (const box of list) {
      let picks = [...box.picks];
      const got: BoxItem[] = [];
      while (picks.length < box.count) {
        const free = [0, 1, 2].filter(i => !picks.includes(i));
        const pick = free[randomIndex(free.length)];
        const r = await act<OpenResult>({ type: 'offlineBox', id: box.id, pick });
        if (!r) { setPhase('done'); setBallIds(ids); return; }
        picks = r.picks;
        if (r.items[pick]) got.push(r.items[pick]!);
        ids.push(...r.ballIds);
      }
      setOpened(o => [...o, { box, items: got }]);
    }
    setBallIds(ids);
    setPhase('done');
  }
  const close = () => {
    if (phase === 'opening') return;
    setPhase('list'); setOpened([]); setBallIds([]);
    onClose();
  };
  const hasTicket = opened.some(o => o.items.some(i => i.kind === 'ticket'));

  return (
    <Dialog open={open && (phase !== 'list' || sorted.length > 0)} onOpenChange={o => { if (!o) { if (phase === 'list' && onLater) onLater(); else close(); } }}>
      <DialogContent className="reward-dialog day-boxes-dialog">
        {phase === 'list' ? <>
          <DialogTitle className="intro-title">{title ?? '🎁 훈련 선물 상자가 왔어!'}</DialogTitle>
          <DialogDescription className="intro-text">훈련한 날마다 상자가 하나씩! 눌러서 하나씩 열거나, 한 번에 열어 봐.</DialogDescription>
          <div className="day-box-grid">
            {sorted.map((b, i) => <DayBoxTile key={b.id} box={b} delay={i * 0.12} disabled={busy} onClick={() => onOpenOne(b)} />)}
          </div>
          {sorted.length > 1 && <button className="primary big-button glow" disabled={busy} onClick={() => void openAll()}>🎁 한 번에 열기 ({sorted.length}개)</button>}
          {onLater
            ? <button className="secondary" onClick={onLater}>나중에 (훈련 달력에서 열 수 있어)</button>
            : <button className="secondary" onClick={close}>닫기</button>}
        </> : <>
          <DialogTitle className="intro-title">{phase === 'opening' ? `상자를 여는 중… (${opened.length}/${total})` : '짜잔! 요일마다 이런 게 나왔어'}</DialogTitle>
          <DialogDescription className="sr-only">요일별로 연 상자</DialogDescription>
          <ul className="day-box-results">
            {opened.map(o => (
              <li key={o.box.id} className="day-box-result pop">
                <span className="day-box-result-day">
                  <img src={dayBoxImage(o.box)} alt="" />
                  <b className={'day-box-label mark-' + o.box.mark}>{dayBoxLabel(o.box)}</b>
                  <small>{shortDate(o.box.date)}</small>
                </span>
                <span className="day-box-result-items">
                  {o.items.map((it, i) => <span key={i} className="reward-card revealed picked"><ItemView item={it} /></span>)}
                </span>
              </li>
            ))}
          </ul>
          {phase === 'done' && (ballIds.length
            ? <button className="primary big-button" onClick={() => { const ids = ballIds; setPhase('list'); setOpened([]); setBallIds([]); onOpenBalls(ids); }}>볼 열어 보기! ({ballIds.length}개)</button>
            : <button className="primary big-button" onClick={close}>{hasTicket ? '좋아! 배틀 탭에서 쓸 수 있어' : '좋아! 가방에 넣었어'}</button>)}
        </>}
      </DialogContent>
    </Dialog>
  );
}
