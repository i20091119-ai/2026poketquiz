"use client";
import { useState } from 'react';
import { Gift, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { BALLS, GIFT_CHOICE_INFO, GIFT_SIZES, POTIONS, REPLY_STICKERS, REPLY_TEXT_MAX, SUBJECT_BERRY, SUBJECT_INFO, SUBJECTS, type GiftChoice, type ReplySticker, type Subject } from '@/lib/game-config';
import type { BoxItem, PublicGift } from '@/lib/game-engine';
import { potionEffect } from './rewards';

/* eslint-disable @next/next/no-img-element */

export type GiftOpenResult = { gift: PublicGift; item: BoxItem | null; ballIds: string[]; message: string };

const stickerLabel = (key: string) => REPLY_STICKERS.find(s => s.key === key)?.label ?? key;
const dateLabel = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

/** [선물] 탭: 받은 선물 목록. 아직 안 연 선물은 열고, 답장 안 한 선물은 답장할 수 있어요. */
export function GiftTab({ gifts, busy, onOpen, onReply }: {
  gifts: PublicGift[]; busy: boolean; onOpen: (gift: PublicGift) => void; onReply: (gift: PublicGift) => void;
}) {
  const pending = gifts.filter(g => !g.opened).length;
  return (
    <section className="panel gift-tab">
      <span className="pill">GIFTS</span>
      <h3>🎁 엄마 아빠의 선물</h3>
      <p className="muted">{gifts.length === 0 ? '아직 받은 선물이 없어. 숙제·독서·정리정돈·운동을 열심히 하면 엄마 아빠가 선물을 보내 줄 거야!'
        : pending ? `아직 안 연 선물이 ${pending}개 있어!` : '받은 선물이야. 답장을 안 한 선물에는 답장을 보낼 수 있어.'}</p>
      <ul className="gift-list">
        {gifts.map(g => (
          <li key={g.id} className={'gift-item' + (g.opened ? '' : ' unopened')}>
            <div className="gift-head">
              <span className="gift-emoji">{GIFT_SIZES[g.size].emoji}</span>
              <div>
                <b>{g.fromLabel}의 {GIFT_SIZES[g.size].label}</b>
                <small>{dateLabel(g.date)} · {g.reason}</small>
              </div>
            </div>
            {g.letter && <p className="gift-letter">💌 {g.letter}</p>}
            {g.opened
              ? <p className="gift-got">받은 것: <b>{g.opened.got}</b></p>
              : <button className="primary small glow" disabled={busy} onClick={() => onOpen(g)}><Gift size={16} /> 열어 보기</button>}
            {g.opened && (g.reply
              ? <p className="gift-reply"><img src={ASSETS.sticker(g.reply.sticker)} alt="" /> <span>내 답장: <b>{stickerLabel(g.reply.sticker)}</b>{g.reply.text ? ` — ${g.reply.text}` : ''}</span></p>
              : <button className="secondary small" disabled={busy} onClick={() => onReply(g)}><Mail size={16} /> 답장하기</button>)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 앱을 열었을 때(또는 열려 있는 동안) 안 받은 선물이 있으면 뜨는 팝업 */
export function GiftPopup({ gift, onOpen, onLater }: { gift: PublicGift | null; onOpen: (gift: PublicGift) => void; onLater: () => void }) {
  return (
    <Dialog open={!!gift} onOpenChange={o => { if (!o) onLater(); }}>
      <DialogContent className="reward-dialog gift-popup">
        <DialogTitle>{gift ? `${gift.fromLabel}가 선물을 보냈어!` : ''}</DialogTitle>
        <DialogDescription>{gift ? `${gift.reason}을(를) 잘해서 주는 ${GIFT_SIZES[gift.size].label}이야.` : ''}</DialogDescription>
        <div className="gift-big">{gift ? GIFT_SIZES[gift.size].emoji : ''}</div>
        {gift?.letter && <p className="gift-letter big">💌 {gift.letter}</p>}
        {gift && <button className="primary glow" onClick={() => onOpen(gift)}><Gift size={20} /> 열어 보기</button>}
        <button className="text-button" onClick={onLater}>나중에 (선물 탭에서 열 수 있어)</button>
      </DialogContent>
    </Dialog>
  );
}

/** 선물 열기: 둘 중 하나 고르기 → (열매면 계열 고르기) → 결과 */
export function GiftOpenDialog({ gift, busy, onChoose, onClose, onOpenBalls, onReply }: {
  gift: PublicGift | null; busy: boolean;
  onChoose: (gift: PublicGift, choice: GiftChoice, subject?: Subject) => Promise<GiftOpenResult | null>;
  onClose: () => void;
  onOpenBalls: (ballIds: string[]) => void;
  onReply: (gift: PublicGift) => void;
}) {
  const [step, setStep] = useState<'choose' | 'berry' | 'done'>('choose');
  const [result, setResult] = useState<GiftOpenResult | null>(null);
  if (!gift) return null;
  const options = GIFT_SIZES[gift.size].options as readonly GiftChoice[];
  const close = () => { if (!busy) onClose(); };
  async function choose(choice: GiftChoice, subject?: Subject) {
    if (choice === 'berry' && !subject) { setStep('berry'); return; }
    const r = await onChoose(gift!, choice, subject);
    if (r) { setResult(r); setStep('done'); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="reward-dialog gift-open">
        {step === 'done' && result ? <>
          <DialogTitle>짜잔! {result.gift.opened?.got}</DialogTitle>
          <DialogDescription>{result.message}</DialogDescription>
          <div className="gift-result">
            {result.item?.kind === 'potion' && <><img src={ASSETS.potion[result.item.potion]} alt="" /><b>{POTIONS[result.item.potion].label}</b><small>{potionEffect(result.item.potion)} · 가방에 넣었어</small></>}
            {result.item?.kind === 'ball' && <><img src={ASSETS.ball[result.item.ball]} alt="" /><b>{BALLS[result.item.ball].label}</b><small>눌러서 포켓몬을 만나자</small></>}
            {result.gift.opened?.choice === 'exp' && <><img src={ASSETS.exp} alt="" /><b>{GIFT_CHOICE_INFO.exp.label}</b><small>첫 화면에서 스탯으로 바꿀 수 있어</small></>}
            {result.gift.opened?.choice === 'candy' && <><span className="gift-big">🍬</span><b>{result.gift.opened.got}</b><small>포켓로그를 켜면 들어가</small></>}
            {result.gift.opened?.choice === 'ticket' && <><span className="gift-big">🎟️</span><b>배틀 추가권 1장</b><small>배틀 탭에서 새 게임을 한 번 더 할 수 있어</small></>}
          </div>
          {result.ballIds.length > 0 && <button className="primary" onClick={() => onOpenBalls(result.ballIds)}>볼 열어 보기!</button>}
          <button className={result.ballIds.length ? 'secondary' : 'primary'} onClick={() => onReply(result.gift)}><Mail size={18} /> {gift.fromLabel}에게 답장하기</button>
          <button className="text-button" onClick={close}>나중에 답장할래</button>
        </> : step === 'berry' ? <>
          <DialogTitle>어떤 열매를 받을까?</DialogTitle>
          <DialogDescription>계열(과목)을 고르면 그 열매를 가방에 넣어 줘. 열매는 그 계열 속성 3개를 올려.</DialogDescription>
          <div className="berry-grid">
            {SUBJECTS.map(s => (
              <button key={s} className="berry-choice" disabled={busy} onClick={() => void choose('berry', s)}>
                <img src={ASSETS.potion[SUBJECT_BERRY[s]]} alt="" />
                <span className="subject-chip" style={{ background: SUBJECT_INFO[s].color }}>{s}</span>
                <b>{POTIONS[SUBJECT_BERRY[s]].label}</b>
              </button>
            ))}
          </div>
          <button className="text-button" onClick={() => setStep('choose')}>← 다시 고르기</button>
        </> : <>
          <DialogTitle>{gift.fromLabel}의 {GIFT_SIZES[gift.size].label} {GIFT_SIZES[gift.size].emoji}</DialogTitle>
          <DialogDescription>{gift.reason} 잘했어! 하나를 골라 봐.</DialogDescription>
          {gift.letter && <p className="gift-letter big">💌 {gift.letter}</p>}
          <div className="gift-choices">
            {options.map(c => (
              <button key={c} className="gift-choice" disabled={busy} onClick={() => void choose(c)}>
                <ChoiceIcon choice={c} />
                <b>{GIFT_CHOICE_INFO[c].label}</b>
                <small>{GIFT_CHOICE_INFO[c].description}</small>
              </button>
            ))}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}

function ChoiceIcon({ choice }: { choice: GiftChoice }) {
  switch (choice) {
    case 'exp': return <img src={ASSETS.exp} alt="" />;
    case 'berry': return <img src={ASSETS.potion.apple} alt="" />;
    case 'box': return <img src={ASSETS.boxClosed} alt="" />;
    case 'candy': return <span className="gift-big">🍬</span>;
    case 'ball': return <img src={ASSETS.ball.poke} alt="" />;
    case 'shinyBall': return <img src={ASSETS.ball.shiny} alt="" />;
    case 'ticket': return <span className="gift-big">🎟️</span>;
  }
}

/**
 * 답장 화면 (부모님 샘플 구성): 누가 무엇 때문에 보냈는지 → 받은 것 → 편지 → "○○에게 답장할까?"
 * → 새싹 동글이 스티커 5개(3칸 격자) → 30자 글(선택) → [나중에 | 답장 보내기] → 보냈어! 화면
 */
export function ReplyDialog({ gift, busy, onSend, onLater }: {
  gift: PublicGift | null; busy: boolean;
  onSend: (gift: PublicGift, sticker: ReplySticker, text: string) => Promise<boolean>;
  onLater: () => void;
}) {
  const [sticker, setSticker] = useState<ReplySticker | null>(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  if (!gift) return null;
  const picked = REPLY_STICKERS.find(s => s.key === sticker);
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onLater(); }}>
      <DialogContent className="reward-dialog reply-dialog">
        {sent && picked ? <>
          <DialogTitle className="sr-only">{gift.fromLabel}에게 답장을 보냈어!</DialogTitle>
          <DialogDescription className="sr-only">{picked.label}</DialogDescription>
          <div className="reply-sent">
            <img src={ASSETS.sticker(picked.key)} alt="" />
            <h2>{picked.label}</h2>
            <h3>{gift.fromLabel}에게 답장을 보냈어!</h3>
            {text.trim() && <p className="reply-from">&ldquo;{text.trim()}&rdquo;</p>}
          </div>
          <button className="primary" onClick={onLater}>좋아!</button>
        </> : <>
          <p className="reply-from">{gift.fromLabel}가 보낸 선물 · {gift.reason}</p>
          <DialogTitle className="reply-title">🎁 {gift.opened ? `${gift.opened.got}${gift.opened.got.endsWith('개') || gift.opened.got.endsWith('장') ? '를' : '을'} 받았어!` : `${GIFT_SIZES[gift.size].label}을 받았어!`}</DialogTitle>
          <DialogDescription className="sr-only">스티커 하나를 고르고, 하고 싶은 말이 있으면 30자까지 적을 수 있어.</DialogDescription>
          {gift.letter && <p className="reply-letter">&ldquo;{gift.letter}&rdquo;</p>}
          <h3 className="reply-ask">{gift.fromLabel}에게 답장할까?</h3>
          <div className="sticker-grid">
            {REPLY_STICKERS.map(s => (
              <button key={s.key} className={'sticker' + (sticker === s.key ? ' on' : '')} disabled={busy} onClick={() => setSticker(s.key)} aria-pressed={sticker === s.key}>
                <img src={ASSETS.sticker(s.key)} alt="" />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <textarea className="reply-text" rows={2} value={text} maxLength={REPLY_TEXT_MAX} placeholder="하고 싶은 말을 써도 돼 (안 써도 괜찮아)"
            onChange={e => setText(e.target.value.slice(0, REPLY_TEXT_MAX))} />
          <div className="reply-count">{text.length}/{REPLY_TEXT_MAX}</div>
          <div className="reply-actions">
            <button className="reply-later" onClick={onLater}>나중에</button>
            <button className="reply-send" disabled={busy || !sticker}
              onClick={async () => { if (sticker && await onSend(gift, sticker, text)) setSent(true); }}>답장 보내기</button>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
