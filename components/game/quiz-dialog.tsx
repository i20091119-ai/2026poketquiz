"use client";
import { useState } from 'react';
import { ArrowRight, Volume2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { PublicQuestion } from '@/lib/game-engine';
import { TypeBadge } from './common';

export type AnswerResult = {
  correct: boolean;
  message: string;
  hint?: string;
  explanation?: string;
  already?: boolean;
  reviewed?: boolean;
  gained?: { type: PublicQuestion['type']; amount: number; exp: number };
};

type Props = {
  question: PublicQuestion | null;
  progress?: string;
  busy: boolean;
  onAnswer: (choice: number) => Promise<AnswerResult | null>;
  onNext: () => void;
  onClose: () => void;
  nextLabel: string;
};

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

function QuizBody({ question, progress, busy, onAnswer, onNext, nextLabel }: Props & { question: PublicQuestion }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);

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
    if (result) setFeedback(result);
  }
  const solved = feedback?.correct;

  return (
    <>
        <DialogTitle className="quiz-title">
          <span>{question.subject}</span>
          <TypeBadge type={question.type} small />
          {progress && <span className="quiz-count">{progress}</span>}
        </DialogTitle>
        <DialogDescription>천천히 읽고 답을 하나 골라 줘.</DialogDescription>
        <>
          <div className="quiz-heading">
            <h2>{question.prompt}</h2>
            <button type="button" className="read-button" onClick={readAloud} aria-label="문제 읽어 주기"><Volume2 /></button>
          </div>
          <div className="answer-options" role="radiogroup">
            {question.choices.map((c, i) => (
              <button
                type="button" role="radio" aria-checked={choice === i} key={i}
                className={'answer-option' + (choice === i ? ' selected' : '')}
                disabled={busy || solved}
                onClick={() => { setChoice(i); if (feedback && !feedback.correct) setFeedback(null); }}
              >
                <span className="choice-no">{i + 1}</span><span>{c}</span>
              </button>
            ))}
          </div>
          {feedback && (
            <div className={'feedback ' + (feedback.correct ? 'correct' : 'retry')} role="status">
              <b>{feedback.message}</b>
              {feedback.gained && <p className="gain-line"><TypeBadge type={feedback.gained.type} amount={'+' + feedback.gained.amount} small /> 경험치 +{feedback.gained.exp}</p>}
              {feedback.correct && feedback.explanation && <p>{feedback.explanation}</p>}
              {!feedback.correct && feedback.hint && <p>힌트: {feedback.hint}</p>}
            </div>
          )}
          {solved
            ? <button className="primary" onClick={onNext}>{nextLabel} <ArrowRight size={20} /></button>
            : <button className="primary" disabled={busy || choice === null} onClick={() => void submit()}>정답 확인</button>}
        </>
    </>
  );
}
