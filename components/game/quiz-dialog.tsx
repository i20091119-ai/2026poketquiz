"use client";
import { useEffect, useState } from 'react';
import { ArrowRight, Volume2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { PublicQuestion } from '@/lib/game-engine';
import { TypeBadge } from './common';
import { HeartLines, type HeartGainView } from './adventure';

export type AnswerResult = {
  correct: boolean;
  message: string;
  /** false면 아직 기회가 남아 다시 풀 수 있음 */
  final?: boolean;
  triesLeft?: number;
  /** 기회를 다 쓰고 틀렸을 때 알려주는 정답 번호 (0부터) */
  answer?: number;
  explanation?: string;
  /** 첫 시도에 틀렸을 때: 이 초만큼 다시 풀기 버튼을 막음 (해설을 소리 내어 읽는 시간) */
  waitSeconds?: number;
  already?: boolean;
  reviewed?: boolean;
  gained?: { type: PublicQuestion['type']; amount: number; exp: number };
  /** 모험 팀이 받은 💗 (정답일 때) */
  hearts?: HeartGainView[];
  /** 레인보우 이벤트 진행 (탐험에서만): 연속 수, 조각을 얻었는지, 아이에게 보여 줄 말 */
  rainbow?: { kind: 'progress' | 'reset' | 'piece' | 'complete'; stage?: 'rainbow' | 'gold'; subject: string; count: number; goal: number; pieces: number; total: number; message: string } | null;
};

type Props = {
  question: PublicQuestion | null;
  progress?: string;
  /** 이 문제에 남은 기회 / 처음 기회 */
  chances: number;
  maxChances: number;
  busy: boolean;
  onAnswer: (choice: number) => Promise<AnswerResult | null>;
  onNext: () => void;
  onClose: () => void;
  nextLabel: string;
};

/** 레인보우 이벤트: 이 과목 연속 수(동그라미 10개)와 조각 소식 */
function RainbowLine({ r }: { r: NonNullable<AnswerResult['rainbow']> }) {
  return (
    <div className={'rainbow-line ' + r.kind + (r.stage === 'gold' ? ' gold' : '')} role="status">
      {r.message && <b>{r.message}</b>}
      {r.kind !== 'complete' && (
        <span>{r.stage === 'gold' ? '👑' : '🌈'} {r.subject} <span className="rainbow-dots small">{Array.from({ length: r.goal }, (_, i) => <i key={i} className={i < r.count ? 'on' : ''} />)}</span> {r.count}/{r.goal}</span>
      )}
    </div>
  );
}

/** 문제 한 개를 보여주고 답을 받습니다. 다음 문제로 넘어가는 건 부모 컴포넌트가 정합니다. */
export function QuizDialog(props: Props) {
  const { question, busy, onClose } = props;
  return (
    <Dialog open={!!question} onOpenChange={open => { if (!open && !busy) { window.speechSynthesis?.cancel(); onClose(); } }}>
      <DialogContent className="quiz-dialog">
        {question && <QuizBody key={question.id} {...props} question={question} />}
      </DialogContent>
    </Dialog>
  );
}

function QuizBody({ question, progress, chances, maxChances, busy, onAnswer, onNext, nextLabel }: Props & { question: PublicQuestion }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [missed, setMissed] = useState<number[]>([]); // 이번에 틀린 보기
  // 이 문제를 열었을 때 남은 기회 (답할 때마다 화면 정보가 새로 와도 처음 값으로 셈)
  const [startChances] = useState(chances);
  // 첫 시도에 틀리면: 해설을 보여 주고 남은 초 동안 다시 풀기를 막음 (0이면 다시 풀 수 있음), retrying = 다시 풀기를 눌러 답을 고르는 중
  const [wait, setWait] = useState(0);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait(w => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);
  function readExplanation(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  }

  function readAloud() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(question.prompt + '. ' + question.choices.map((c, i) => `${i + 1}번, ${c}`).join('. '));
    u.lang = 'ko-KR';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  }
  async function submit() {
    if (choice === null) return;
    const result = await onAnswer(choice);
    if (!result) return;
    setFeedback(result);
    if (!result.correct && result.final === false) { setMissed(m => [...m, choice]); setChoice(null); setRetrying(false); setWait(result.waitSeconds ?? 0); }
  }
  // 맞혔거나, 기회를 다 써서 틀렸으면 끝
  const answered = !!feedback && (feedback.correct || feedback.final !== false);
  const finalWrong = !!feedback && !feedback.correct && feedback.final !== false;
  // 첫 시도에 틀려서 해설을 읽는 중 (다시 풀기를 누르기 전에는 보기를 고를 수 없음)
  const reading = !!feedback && !feedback.correct && feedback.final === false && !retrying;
  const left = Math.max(1, startChances - missed.length);

  return (
    <>
        <DialogTitle className="quiz-title">
          <span>{question.subject}</span>
          <TypeBadge type={question.type} small />
          {progress && <span className="quiz-count">{progress}</span>}
        </DialogTitle>
        <DialogDescription>천천히 읽고 답을 하나 골라 줘. {maxChances === 1 ? '기회는 한 번이야!' : left === maxChances ? `기회는 ${maxChances}번이야!` : left === 1 ? '마지막 기회야!' : `남은 기회 ${left}번`}</DialogDescription>
        <>
          <div className="quiz-heading">
            <h2>{question.prompt}</h2>
            <button type="button" className="read-button" onClick={readAloud} aria-label="문제 읽어 주기"><Volume2 /></button>
          </div>
          <div className="answer-options" role="radiogroup">
            {question.choices.map((c, i) => (
              <button
                type="button" role="radio" aria-checked={choice === i} key={i}
                className={'answer-option' + (choice === i ? ' selected' : '') +
                  (missed.includes(i) || (finalWrong && choice === i) ? ' wrong' : '') +
                  (feedback?.correct && choice === i ? ' right' : '') +
                  (finalWrong && feedback!.answer === i ? ' right' : '')}
                disabled={busy || answered || reading || missed.includes(i)}
                onClick={() => setChoice(i)}
              >
                <span className="choice-no">{i + 1}</span><span>{c}</span>
              </button>
            ))}
          </div>
          {feedback && (
            <div className={'feedback ' + (feedback.correct ? 'correct' : 'retry')} role="status">
              <b>{feedback.message}</b>
              {feedback.gained && <p className="gain-line"><TypeBadge type={feedback.gained.type} amount={'⚡+' + feedback.gained.amount} small /> 경험치 +{feedback.gained.exp}</p>}
              {/* 풀이를 먼저 (정답이든 오답이든 아이가 설명을 한 번 더 보도록), 💗 소식은 그 아래 */}
              {feedback.explanation && <p className="feedback-explain">📖 {feedback.explanation}</p>}
              {reading && feedback.explanation && <>
                <p className="read-aloud-tip">📢 해설을 소리 내어 읽어 보자!</p>
                <button type="button" className="secondary small" onClick={() => readExplanation(feedback.explanation!)}><Volume2 size={16} /> 해설 들어 보기</button>
              </>}
              {feedback.correct && feedback.hearts && <HeartLines hearts={feedback.hearts} />}
            </div>
          )}
          {feedback?.rainbow && (feedback.final !== false || feedback.correct) && <RainbowLine r={feedback.rainbow} />}
          {answered
            ? <button className="primary" onClick={onNext}>{nextLabel} <ArrowRight size={20} /></button>
            : reading
              ? <button className="primary" disabled={wait > 0} onClick={() => { setRetrying(true); setFeedback(null); window.speechSynthesis?.cancel(); }}>
                  {wait > 0 ? `다시 풀기 (${wait}초)` : '다시 풀기'}
                </button>
              : <button className="primary" disabled={busy || choice === null} onClick={() => void submit()}>정답 확인</button>}
        </>
    </>
  );
}
