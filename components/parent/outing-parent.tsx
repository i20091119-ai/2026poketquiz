"use client";
import { useState } from 'react';
import { DiaryPage, mediaUrl } from '@/components/game/outing';
import { PokemonImage, postJson } from '@/components/game/common';
import { ASSETS } from '@/lib/assets';
import { GIFT_SENDERS, REPLY_STICKERS, type GiftSender } from '@/lib/game-config';
import { dateLabel, OUTING_PHOTO_MAX, STEP_TITLES, type Outing, type OutingRules } from '@/lib/outing';
import { species, SPECIES } from '@/lib/pokedex';

/* eslint-disable @next/next/no-img-element */

/*
 * 보호자 공간: 나들이 체험보고서 (열기 · 확인 · 인쇄 · 규칙). 규칙과 계산은 lib/outing.ts·lib/game-engine.ts.
 */
type Call = <T extends { message?: string }>(body: Record<string, unknown>) => Promise<T | null>;
export type OutingOverview = {
  list: (Outing & { page: { id: string; place: string; date: string; weather: string; title: string; paragraphs: string[]; picture: { kind: 'drawing' | 'photo'; mediaId: string } | null; complete: boolean }; daysLeft: number | null; owned: boolean[]; chars: number })[];
  waiting: number;
  rules: { now: OutingRules; defaults: OutingRules; overrides: Partial<OutingRules>; fields: { key: keyof OutingRules; label: string; min: number; max: number }[] };
  candidates: number[]; ownedSpecies: number[]; today: string;
};
const SENDER_KEY = 'pq-gift-sender';
const loadSender = (): GiftSender => { try { return localStorage.getItem(SENDER_KEY) === 'dad' ? 'dad' : 'mom'; } catch { return 'mom'; } };
const saveSender = (s: GiftSender) => { try { localStorage.setItem(SENDER_KEY, s); } catch { /* 저장 못 해도 진행 */ } };
/** 전설·환상 포켓몬 (전설 후보로 고를 수 있는 것) */
const LEGENDS = SPECIES.filter(s => s.tier >= 3).map(s => ({ id: s.id, name: s.name }));

const STATUS_LABEL: Record<Outing['status'], string> = {
  open: '아이가 아직 시작 전', writing: '쓰는 중', submitted: '📖 확인 대기', revise: '고치는 중', approved: '승인 · 마스터볼 고르기 전',
  rewarded: '🎉 완료 (전설 획득)', late: '⏰ 기한 넘김 (미완성)', lateDone: '기한 뒤 완성 (보상 없음)',
};

/** 사진을 휴대폰에서 줄여서 (긴 쪽 1024px, JPEG) data URL 로 */
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.75, 0.6, 0.45]) { const d = c.toDataURL('image/jpeg', q); if (d.length < 580_000) return d; }
    throw new Error('사진이 너무 커요.');
  } finally { URL.revokeObjectURL(url); }
}

/** 선물 탭: 나들이 이벤트 열기 */
export function OutingCreate({ overview, busy, call, reload }: { overview: OutingOverview; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const [from, setFrom] = useState<GiftSender>(loadSender);
  const [place, setPlace] = useState('');
  const [date, setDate] = useState(overview.today);
  const [letter, setLetter] = useState('');
  const [sightText, setSightText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState('');
  const [candidates, setCandidates] = useState<number[]>(overview.candidates);
  const sights = sightText.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of [...files].slice(0, OUTING_PHOTO_MAX - photos.length)) {
      setUploading(`사진 줄여서 올리는 중… (${file.name})`);
      try {
        const data = await shrinkPhoto(file);
        const r = await postJson<{ id: string }>('/api/media', { kind: 'photo', data });
        setPhotos(p => [...p, r.id]);
      } catch (e) { setUploading(`올리지 못했어요: ${(e as Error).message}`); return; }
    }
    setUploading('');
  };
  const create = async () => {
    const r = await call({ action: 'outingCreate', outing: { from, place, date, letter, sights, photoIds: photos, candidates } });
    if (r) { setPlace(''); setLetter(''); setSightText(''); setPhotos([]); await reload(); }
  };
  return (
    <section className="panel parent-section outing-create">
      <h2>🧺 나들이 이벤트 열기</h2>
      <p className="muted">나들이를 다녀온 뒤 열어 주세요. 아이 화면에 설명 팝업이 뜨고, &ldquo;도전할래!&rdquo;를 누르면 그날부터 7일 안에 체험보고서(7단계)를 써요. 다 쓰면 여기서 읽고 칭찬하거나 고쳐 볼 곳 1개를 돌려보내요. 승인하면 아이가 마스터볼 3개(전설 후보) 중 하나를 골라요.</p>
      <div className="gift-form">
        <div className="gift-row"><span className="gift-label">보내는 사람</span>
          <div className="button-row">{(Object.keys(GIFT_SENDERS) as GiftSender[]).map(s => <button key={s} className={'chip' + (from === s ? ' on' : '')} onClick={() => { setFrom(s); saveSender(s); }}>{GIFT_SENDERS[s]}</button>)}</div></div>
        <label className="gift-row"><span className="gift-label">장소</span><input value={place} maxLength={30} placeholder="예: 서울대공원 동물원" onChange={e => setPlace(e.target.value)} /></label>
        <label className="gift-row"><span className="gift-label">다녀온 날</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="gift-row"><span className="gift-label">한 줄 편지</span><input value={letter} maxLength={60} placeholder="예: 기린 정말 컸지? 보고서도 멋지게 써 보자!" onChange={e => setLetter(e.target.value)} /></label>
        <label className="gift-row"><span className="gift-label">본 것 (쉼표로)</span><input value={sightText} placeholder="예: 기린, 호랑이, 펭귄, 코끼리" onChange={e => setSightText(e.target.value)} /></label>
        {sights.length > 0 && <div className="button-row">{sights.map(s => <span key={s} className="chip on">{s}</span>)}</div>}
        <div className="gift-row"><span className="gift-label">사진 (선택, 최대 {OUTING_PHOTO_MAX}장)</span>
          <div>
            <input type="file" accept="image/*" multiple disabled={busy || photos.length >= OUTING_PHOTO_MAX} onChange={e => { void upload(e.target.files); e.target.value = ''; }} />
            {uploading && <p className="muted">{uploading}</p>}
            <div className="outing-photos">{photos.map(id => (
              <span key={id} className="outing-photo"><img src={mediaUrl(id)} alt="" /><button className="text-button" onClick={() => setPhotos(p => p.filter(x => x !== id))}>빼기</button></span>
            ))}</div>
            <p className="muted">사진은 아이 화면 6단계에서 그림 대신 고를 수 있어요. 아이 화면은 비밀번호 없이 열려서, 사진은 짐작할 수 없는 긴 주소로만 보여요. 얼굴보다 동물·장소 사진을 추천해요.</p>
          </div></div>
        <div className="gift-row"><span className="gift-label">전설 후보 3마리</span>
          <div className="outing-candidates">
            {candidates.map((id, i) => {
              const owned = overview.ownedSpecies.includes(id);
              return (
                <div key={i} className="outing-candidate">
                  <PokemonImage id={id} />
                  <select value={id} onChange={e => setCandidates(c => c.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
                    {LEGENDS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {owned && <small className="warn">⚠️ 이미 가진 전설이에요 (나오면 우정 보너스)</small>}
                </div>
              );
            })}
          </div></div>
      </div>
      <button className="primary" disabled={busy || !place.trim() || !sights.length || new Set(candidates).size !== 3} onClick={() => void create()}>🧺 나들이 이벤트 열기</button>
    </section>
  );
}

/** 이벤트 기록 탭: 보고서 목록 · 확인 · 인쇄 */
export function OutingReports({ overview, sim, busy, call, reload }: { overview: OutingOverview; sim: boolean; busy: boolean; call: Call; reload: () => Promise<void> }) {
  if (!overview.list.length) return null;
  return (
    <section className="panel parent-section outing-reports">
      <h2>🧺 나들이 체험보고서 {overview.waiting > 0 && <span className="tab-count">확인 대기 {overview.waiting}</span>}</h2>
      {overview.list.map(o => <OutingRow key={o.id} o={o} sim={sim} busy={busy} call={call} reload={reload} />)}
    </section>
  );
}

function OutingRow({ o, sim, busy, call, reload }: { o: OutingOverview['list'][number]; sim: boolean; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(o.status === 'submitted');
  const [by, setBy] = useState<GiftSender>(loadSender);
  const [praise, setPraise] = useState('');
  const [sticker, setSticker] = useState<string>(REPLY_STICKERS[0].key);
  const [note, setNote] = useState('');
  const rules = o.rules;
  const revLeft = rules ? rules.revisionMax - o.revisions.length : 0;
  const review = async (approve: boolean) => {
    saveSender(by);
    if (await call({ action: 'outingReview', id: o.id, by, approve, text: approve ? praise : note, sticker })) await reload();
  };
  return (
    <div className={'outing-row' + (o.status === 'submitted' ? ' waiting' : '')}>
      <div className="outing-row-head" onClick={() => setOpen(v => !v)}>
        <b>{o.place}</b> <span className="muted">{dateLabel(o.date)} · {GIFT_SENDERS[o.from]}가 엶</span>
        <span className="outing-status">{STATUS_LABEL[o.status]}</span>
        <span className="muted">{o.stage}/7단계{o.deadline ? ` · 마감 ${o.deadline}${o.status === 'writing' && o.daysLeft !== null ? ` (${o.daysLeft}일 남음)` : ''}` : ''}{o.chars ? ` · ${o.chars}글자` : ''}</span>
        <button className="text-button">{open ? '접기' : '보기'}</button>
      </div>
      {open && <div className="outing-row-body">
        <p className="muted">
          본 것: {o.sights.join(', ')} · 전설 후보: {o.candidates.map((id, i) => `${species(id).name}${o.owned[i] ? '(이미 있음)' : ''}`).join(', ')}
          {rules ? ` · 규칙(시작 때 고정): 최소 ${rules.minChars}글자, 시도 인정 ${rules.attemptStage}단계, 고치기 ${rules.revisionMax}번, 이로치 ${rules.shiny ? '켜짐' : '꺼짐'}, 기한 ${rules.days}일` : ''}
        </p>
        <div className="outing-steps">{STEP_TITLES.map((t, i) => <span key={t} className={'step-pill' + (i < o.stage ? ' done' : '')}>{i + 1}. {t}</span>)}</div>
        <DiaryPage page={o.page} />
        {o.revisions.map((r, i) => <p key={i} className="outing-note">📝 고치기 요청 ({GIFT_SENDERS[r.by]}, {r.at.slice(0, 10)}): &ldquo;{r.note}&rdquo;{r.fixedAt ? ' → 고침' : ''}</p>)}
        {o.approval && <p className="outing-praise"><img src={ASSETS.sticker(o.approval.sticker)} alt="" /> 칭찬 ({GIFT_SENDERS[o.approval.by]}, {o.approval.at.slice(0, 10)}): &ldquo;{o.approval.praise}&rdquo;</p>}
        {o.reward?.picked !== undefined && <p>🎁 고른 마스터볼: <b>{species(o.reward.balls[o.reward.picked].species).name}{o.reward.balls[o.reward.picked].shiny ? ' ✨이로치' : ''}</b>{o.reward.duplicate ? ' (이미 있어서 우정 보너스)' : ''} · 나머지: {o.reward.balls.filter((_, i) => i !== o.reward!.picked).map(b => species(b.species).name).join(', ')}</p>}
        {o.late && <p className="muted">⏰ {o.late.date}에 기한 넘김 ({o.late.stage}단계 저장) → {o.late.box ? `랜덤상자: ${o.late.box}` : '보상 없음'}</p>}
        {o.status === 'submitted' && (
          <div className="outing-review">
            <div className="button-row"><span className="gift-label">누가 확인하나요</span>{(Object.keys(GIFT_SENDERS) as GiftSender[]).map(s => <button key={s} className={'chip' + (by === s ? ' on' : '')} onClick={() => setBy(s)}>{GIFT_SENDERS[s]}</button>)}</div>
            <div className="outing-review-box">
              <b>👍 칭찬하고 마스터볼 열어 주기</b>
              <input value={praise} maxLength={60} placeholder="예: 기린 혀 이야기가 정말 재미있었어!" onChange={e => setPraise(e.target.value)} />
              <div className="button-row">{REPLY_STICKERS.map(s => <button key={s.key} className={'sticker-pick' + (sticker === s.key ? ' on' : '')} onClick={() => setSticker(s.key)} title={s.label}><img src={ASSETS.sticker(s.key)} alt={s.label} /></button>)}</div>
              <button className="primary small" disabled={busy || !praise.trim()} onClick={() => void review(true)}>칭찬 보내기 (승인)</button>
            </div>
            <div className="outing-review-box">
              <b>✏️ 고쳐 볼 곳 1개 돌려보내기 {revLeft > 0 ? `(${revLeft}번 남음)` : '(이미 다 썼어요)'}</b>
              <input value={note} maxLength={60} disabled={revLeft <= 0} placeholder="예: 기린이 무엇을 하고 있었는지 한 문장 더 써 줄래?" onChange={e => setNote(e.target.value)} />
              <button className="secondary small" disabled={busy || revLeft <= 0 || !note.trim()} onClick={() => void review(false)}>돌려보내기</button>
            </div>
          </div>
        )}
        <div className="button-row">
          {o.stage > 0 && <button className="secondary small" onClick={() => printReport(o)}>🖨️ 인쇄용 보기</button>}
          {o.status === 'open' && <button className="text-button danger" disabled={busy} onClick={async () => { if (window.confirm('아직 시작하지 않은 이 나들이 이벤트를 지울까요?') && await call({ action: 'outingDelete', id: o.id })) await reload(); }}>이벤트 지우기</button>}
        </div>
        {sim && (
          <div className="sim-limited">
            <b>🧪 시험용 (이 보고서)</b>
            <div className="button-row">
              <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'simOutingFill', id: o.id, upTo: 2 })) await reload(); }}>2단계까지 채우기</button>
              <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'simOutingFill', id: o.id, upTo: 3 })) await reload(); }}>3단계까지 채우기</button>
              <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'simOutingFill', id: o.id, upTo: 7 })) await reload(); }}>7단계 모두 채우기</button>
              {o.deadline && <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'simDate', date: nextDay(o.deadline!) })) await reload(); }}>마감 다음 날({nextDay(o.deadline)})로</button>}
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}
const nextDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

/** 인쇄용 보기: 새 창에 그림일기 한 장을 크게 보여 주고 인쇄 창을 엶 */
function printReport(o: OutingOverview['list'][number]) {
  const w = window.open('', '_blank');
  if (!w) { window.alert('새 창을 열지 못했어요. 팝업 차단을 꺼 주세요.'); return; }
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const pic = o.page.picture ? `<img src="${location.origin}${mediaUrl(o.page.picture.mediaId)}" alt="">` : '';
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(o.page.title)}</title>
<style>body{font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif;margin:24px;color:#222}
.sheet{max-width:720px;margin:0 auto;border:3px solid #c9b47a;border-radius:16px;padding:24px}
.head{display:flex;gap:24px;font-weight:700;font-size:18px;border-bottom:2px solid #c9b47a;padding-bottom:8px}
h1{font-size:26px;margin:14px 0}.pic{text-align:center;border:2px solid #e2d3a8;border-radius:12px;padding:8px;min-height:200px}
.pic img{max-width:100%;max-height:360px}.text p{font-size:22px;line-height:2.2;margin:0;background-image:linear-gradient(transparent calc(100% - 1px),#c9b47a 1px);background-size:100% 2.2em}
.foot{margin-top:16px;font-size:15px;color:#666}@media print{body{margin:0}.noprint{display:none}}</style></head><body>
<div class="sheet"><div class="head"><span>📅 ${esc(dateLabel(o.page.date))}</span><span>날씨: ${esc(o.page.weather || '')}</span></div>
<h1>${esc(o.page.title)}</h1><div class="pic">${pic}</div><div class="text">${o.page.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}</div>
${o.approval ? `<div class="foot">💌 ${esc(GIFT_SENDERS[o.approval.by])}: ${esc(o.approval.praise)}</div>` : ''}</div>
<p class="noprint" style="text-align:center"><button onclick="print()" style="font-size:18px;padding:8px 20px">인쇄하기</button></p>
</body></html>`);
  w.document.close();
  w.onload = () => w.print();
}

/** 전체 설정: 나들이 체험보고서 규칙 (아이가 다음에 "도전할래!"를 누르는 보고서부터 적용) */
export function OutingRulesEditor({ overview, busy, call, reload }: { overview: OutingOverview; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const { now, defaults, fields } = overview.rules;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const value = (k: keyof OutingRules) => draft[k] ?? String(now[k]);
  const dirty = fields.filter(f => draft[f.key] !== undefined && Number(draft[f.key]) !== now[f.key]);
  const changed = (Object.keys(defaults) as (keyof OutingRules)[]).some(k => now[k] !== defaults[k]);
  return (
    <section className="panel parent-section shiny-chance">
      <h2>🧺 나들이 체험보고서 규칙</h2>
      <p className="muted">아이가 &ldquo;도전할래!&rdquo;를 누르는 순간 그 보고서에 고정돼요. 이미 시작한 보고서는 바꿔도 그대로예요(진행 중 규칙 변경 금지).</p>
      <div className="chance-grid">
        {fields.map(f => (
          <label key={f.key}>
            <span>{f.label} <small className="muted">(기본 {String(defaults[f.key])})</small></span>
            <span className="chance-input"><input type="number" min={f.min} max={f.max} value={value(f.key)} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} /></span>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button className={now.shiny ? 'primary small' : 'secondary small'} disabled={busy} onClick={async () => { if (await call({ action: 'setOutingRule', key: 'shiny', value: !now.shiny })) await reload(); }}>
          {now.shiny ? '✨ 마스터볼 이로치 확률 적용: 켜짐 (누르면 끔)' : '마스터볼 이로치 확률 적용: 꺼짐 (누르면 켬)'}
        </button>
        <button className="primary small" disabled={busy || dirty.length === 0} onClick={async () => {
          for (const f of dirty) { if (!(await call({ action: 'setOutingRule', key: f.key, value: Number(draft[f.key]) }))) return; }
          setDraft({}); await reload();
        }}>저장</button>
        {changed && <button className="secondary" disabled={busy} onClick={async () => { if (await call({ action: 'resetOutingRules' })) { setDraft({}); await reload(); } }}>처음 값으로</button>}
      </div>
    </section>
  );
}
