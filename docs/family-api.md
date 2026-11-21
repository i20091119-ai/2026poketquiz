# 가족 대시보드 연결 창구 (포켓퀴즈 API)

가족 대시보드(따로 만든 프로그램)가 포켓퀴즈를 **읽고**, **"제때 등교" 사건 하나만 보낼 수 있는** 창구입니다.
아이 기록은 읽기만 하고, 바꾸는 것은 등교 기록(`state.school`, 새로 쌓기만)뿐입니다.

| | 주소 |
|---|---|
| 진짜 사이트 | `https://poke-quiz.gnmc-swteacher.workers.dev` |
| 미리보기 사이트 | `https://poke-quiz-preview.gnmc-swteacher.workers.dev` (기록 저장소가 따로라 아이 진짜 기록은 안 보임) |

## 1. 접속 코드

1. 보호자 공간(`/parent`) → **전체 설정** 탭 → "🏫 제때 등교 · 가족 대시보드 연결" → **코드 만들기**
2. 코드가 **한 번만** 보입니다(예: `7c2aeu-2dwpwd-hfsyw6-7cqj4n`). 복사해서 대시보드 설정에 넣으세요.
   - 서버에는 서명값만 저장되므로 다시 볼 수 없습니다. 잃어버리면 "새 코드 만들기"(예전 코드는 바로 막힘).
   - "코드 지우기"를 누르면 연결이 끊깁니다.
3. 모든 요청에 헤더로 보냅니다. 둘 중 하나:
   - `Authorization: Bearer <코드>`
   - `X-Family-Code: <코드>`

코드가 없거나 틀리면 `401 {"error": "..."}`.
다른 주소의 웹 화면에서도 부를 수 있게 CORS가 열려 있습니다(`Access-Control-Allow-Origin: *`, 쿠키는 쓰지 않음).

### 시험용 기록 쓰기 `?player=sim`

주소 끝에 `?player=sim`을 붙이면 보호자 공간 **개발 탭 시뮬레이션**의 시험용 기록과 그 "오늘"(시험용 날짜·시각)을 씁니다.
대시보드를 만들면서 시험할 때는 꼭 이걸로 해 주세요. 없으면 아이의 진짜 기록입니다.

## 2. 읽기: `GET /api/family`

```bash
curl -H "Authorization: Bearer 7c2aeu-2dwpwd-hfsyw6-7cqj4n" \
  "https://poke-quiz.gnmc-swteacher.workers.dev/api/family"
```

응답(실제 시험 결과, 긴 목록은 줄임):

```json
{
  "app": "poke-quiz",
  "player": "family",                 // family = 진짜 기록, sim = 시험용
  "today": "2026-11-20",              // 한국 날짜
  "now": "20:42",                     // 한국 시각
  "partner": {                        // 지금 파트너 (없으면 null)
    "species": 909, "name": "뜨아거", "shiny": false,
    "image": {
      "art":   "https://…/assets/pokemon/909.png",        // 큰 공식 그림 (이로치면 /shiny/)
      "pixel": "https://…/assets/pokemon/pixel/909.png"   // 작은 도트 그림
    }
  },
  "dailyMission": {                   // 오늘 일일미션
    "date": "2026-11-20", "started": true,
    "done": true,                     // ★ 오늘 미션 다 풀었는지
    "answered": 18, "total": 18, "correct": 14,
    "review": false                   // 복습하는 날이면 true
  },
  "training": {                       // 이번 주(월~일) 트레이너 훈련
    "weekStart": "2026-11-16",
    "days": [
      { "date": "2026-11-16", "dow": "월", "mark": "book", "symbol": "●", "future": false },
      { "date": "2026-11-17", "dow": "화", "mark": null,   "symbol": null, "future": false }
      // … 일요일까지 7칸. mark: book ● / other ■ / try ▲ / null 빈칸
    ],
    "score": 0,                       // 합계 (● 1, ■ 0.5, ▲ 0)
    "goal": 5,                        // 이번 주 기준
    "reached": false,                 // 합계 ≥ 기준
    "unopenedBoxes": 0                // 아이가 아직 안 연 하루 상자 수
  },
  "village": {
    "open": true,                     // 오늘 마을이 열렸는지 (미션 끝)
    "entered": true,                  // 오늘 마을에 들어왔는지
    "level": { "level": 1, "points": 0, "next": 50, "keys": 0 },   // 🏠 마을점수
    "map": {
      "tile": 16,                     // 한 칸 = 16px 그림
      "x0": -16, "width": 44, "height": 40,   // x는 -16~27, y는 0~39 (y<0은 위쪽 숲 그림)
      "legend": { ".": "grass", "=": "path", "s": "soil", "~": "water" },
      "ground": ["....=====...", "…"],        // 줄마다 한 글자 = 한 칸, 글자 번호 = x - x0
      "regions": [ { "id": "C1", "name": "처음 마을", "emoji": "🏡", "x": 0, "y": 0, "w": 12, "h": 20, "open": true } ],
      "fixedObjects": [ { "kind": "house", "x": 4, "y": -2 } ]   // 집·나무·우체통 같은 처음부터 있는 것 (그림 왼쪽 위 칸)
    },
    "placed": {                       // 아이가 놓은 것
      "plots":    [ { "cell": 0, "x": 8, "y": 9, "item": "bush" } ],
      "habitats": [ { "plot": 0, "kind": "grass", "name": "초록 풀숲", "since": "2026-11-18", "x": 8, "y": 9 } ],
      "decor":    [ { "item": "flower", "kind": "flowerRed", "x": 5, "y": 12 } ],
      "terrain":  [ { "x": 2, "y": 14, "ground": "stone" } ],
      "trees":    [ { "x": 0, "y": 2, "spot": 0, "berry": "fire", "ready": true } ]
    },
    "guests": [                       // 오늘 손님 (자기 서식지 옆이 자리)
      { "species": 43, "name": "뚜벅쵸", "habitat": "grass", "habitatName": "초록 풀숲",
        "plot": 0, "x": 10, "y": 10, "image": { "art": "…", "pixel": "…" } }
    ],
    "seojun": {                       // 서준 위치
      "name": "서준", "inside": true, "x": 6, "y": 6, "at": "2026-11-20T11:42:16.224Z"
      // 마을 밖이면 { "name": "서준", "inside": false, "lastSeen": "…" 또는 null }
    }
  },
  "school": {                         // 제때 등교
    "today": { "time": "08:44", "ok": true, "deadline": "08:45", "source": "gate", "at": "…" },  // 없으면 null
    "deadlineToday": "08:45",
    "recent": [ /* 최근 7일 기록, 최신 먼저. letter.picked = 아이가 고른 재료 */ ]
  }
}
```

알아 둘 것:
- **서준 위치**: 아이 화면이 마을 안에 있는 동안 30초마다(걸으면 0.8초 뒤) 위치를 보냅니다. 90초 넘게 소식이 없으면 `inside: false`.
- **손님이 돌아다니는 자리**는 아이 폰 화면 안에서만 움직이므로, 여기서는 손님의 "집 자리"(서식지 옆)를 줍니다.
- 그림 주소는 포켓퀴즈 사이트 주소 그대로입니다(접속 코드 없이 열림).
- 1분에 한 번쯤 읽는 정도면 충분합니다.

## 3. 사건 보내기: `POST /api/family/events` (제때 등교)

```bash
curl -X POST "https://poke-quiz.gnmc-swteacher.workers.dev/api/family/events" \
  -H "Authorization: Bearer 7c2aeu-2dwpwd-hfsyw6-7cqj4n" \
  -H "Content-Type: application/json" \
  -d '{"type":"onTimeArrival","date":"2026-11-20","time":"08:41:30"}'
```

| 칸 | 뜻 |
|---|---|
| `type` | `"onTimeArrival"` (다른 값은 400) |
| `date` | 등교한 날, 한국 날짜 `YYYY-MM-DD`. 오늘부터 14일 전까지만 받음, 미래 날짜는 400 |
| `time` | 교문 통과 시각, 한국 시각 `HH:MM` 또는 `HH:MM:SS` (초는 버림) |

**판정은 포켓퀴즈가 합니다.** 대시보드는 시각만 보내면 됩니다.
- 기준 시각 **이전(같은 분 포함)이면 성공**. 예: 기준 08:45 → 08:45:59 성공, 08:46 실패.
- 기준 시각: 시작일(처음 기록이 온 날, 또는 보호자가 정한 날)부터 **2주는 08:45, 그 뒤는 08:40**. 보호자 공간 전체 설정에서 바꿈.
- **같은 날 두 번 와도 한 번만** 셉니다(처음 온 것이 남음). 다시 보내도 안전합니다.
- **성공** → 그날 편지 1장. 아이가 그날(또는 그 뒤) 일일미션을 끝내고 마을에 들어가면 우체통에서 편지가 열리고, **기본 재료 6종(풀잎·물방울·꽃잎·나뭇가지·돌멩이·진흙) 중 1개**를 고릅니다(반짝돌·철은 없음). 지난 날짜면 편지 제목이 "지난 ○요일 제때 도착!".
- **실패·기록 없음** → 기록만 남고 아이 화면에는 아무것도 나오지 않습니다.

응답 예 (`200`):

```json
{ "player": "family", "status": "recorded", "date": "2026-11-20", "ok": true,
  "time": "08:44", "deadline": "08:45", "letter": true,
  "message": "제때 도착! (08:44 ≤ 08:45) 아이가 미션을 끝내고 마을에 들어가면 우체통 편지가 와요." }
```

| `status` | 뜻 |
|---|---|
| `recorded` | 새로 받음 (`ok`로 성공·실패, `letter: true`면 편지 생김) |
| `duplicate` | 그날은 이미 받음, 아무것도 안 바뀜 |
| `upgraded` | (보호자 손 체크에서만) 늦음 → 제때로 올림 |

오류는 `400 {"error": "아직 오지 않은 날짜예요."}`처럼 한국어 문장, 코드가 틀리면 `401`.

## 4. 보호자 공간에서

- **학습 현황 탭 "🏫 제때 등교"**: 오늘 상태, 최근 3주 표(교문 통과·기준·결과·아이가 고른 재료), **"✅ 오늘 제때 도착으로 적기"** 손 체크(그날 저녁 21:00까지, 대시보드가 놓쳤거나 늦음으로 왔어도 성공으로 올림).
- **전체 설정 탭**: 기준 시각(처음 기간·주 수·그 뒤·시작일·손 체크 마감), 접속 코드.
- **개발 탭 "🏫 제때 등교 시험"**: 시뮬레이션 중 시험용 기록에 오늘 08:31(제때)·08:58(늦음)·어제 08:31을 넣어 봄.

## 5. 시험해 본 것 (2026-11-20, 시험용 기록)

1. 코드 없음·틀린 코드 → 401
2. 오늘 08:44:59 → 성공(기준 08:45), 편지 생김 / 같은 날 08:10 다시 → `duplicate`(처음 것 유지)
3. 이틀 전 08:30 → 성공 / 어제 08:52 → 늦음, 편지 없음 / 미래 날짜·모르는 type → 400
4. 미션 18문제를 끝내고 마을에 들어가자 우체통 편지 창("지난 수요일 제때 도착!", 편지 2장) → 재료 하나씩 고르기 → 재료 +1
5. 마을 안에서 `GET /api/family?player=sim` → `seojun.inside: true`, 위치(x, y)
6. 보호자 학습 현황 표에 성공·늦음·고른 재료 표시, 손 체크는 이미 성공한 날이면 "이미 적혀 있어요"

코드 위치: `lib/school.ts`(규칙), `lib/game-engine.ts` `recordArrival`·`schoolLetterPick`, `lib/server/family.ts`, `app/api/family/`, `components/parent/family-parent.tsx`, `components/game/village.tsx` `LetterSheet`.
