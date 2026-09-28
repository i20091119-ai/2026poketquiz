# 이로치(색이 다른 포켓몬) 그림에서 가장 많이 쓰인 색을 찾아 "블랙·골드·핑크" 같은 색 이름을 정합니다.
# 결과는 lib/data/shiny-colors.json 에 한 번 만들어 두고(git 에 포함), 도감에서 "블랙레쿠쟈"처럼 이름 앞에 붙입니다.
# 다시 만들 때: 먼저 `node scripts/fetch-pokemon-art.mjs` 로 그림을 받은 뒤 `python3 scripts/shiny-colors.py`
import colorsys
import json
import os
import sys

from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
art = os.path.join(root, 'public', 'assets', 'pokemon')
total = len(json.load(open(os.path.join(root, 'lib', 'data', 'pokedex.json'), encoding='utf-8')))

# 색 이름은 아이에게 익숙한 영어 색 이름을 한글로 적습니다
def bucket(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    h *= 360
    if l < 0.27 and s < 0.35:
        return '블랙'
    if l > 0.9 and s < 0.3:
        return '화이트'
    if s < 0.14:
        return '실버' if l > 0.55 else '그레이'
    if l > 0.8 and s < 0.45 and 20 <= h <= 70:
        return '크림'
    if h < 12 or h >= 340:
        return '핑크' if (l > 0.62 and h >= 320 or h < 12 and l > 0.66) else '레드'
    if h < 40:
        return '브라운' if l < 0.35 else '오렌지'
    if h < 68:
        return '골드'
    if h < 165:
        return '그린'
    if h < 200:
        return '민트'
    if h < 255:
        return '블루'
    if h < 300:
        return '퍼플'
    return '핑크'

def dominant(path):
    img = Image.open(path).convert('RGBA')
    img.thumbnail((160, 160))
    counts = {}
    for r, g, b, a in list(img.getdata()):  # noqa
        if a < 200:
            continue
        name = bucket(r, g, b)
        counts[name] = counts.get(name, 0) + 1
    if not counts:
        return None
    # 윤곽선은 대개 검은 선이라, 검정은 몸 색으로 확실히 많을 때만 고릅니다
    body = dict(counts)
    if '블랙' in body and body['블랙'] < 0.45 * sum(counts.values()):
        body.pop('블랙')
    return max(body, key=body.get)

out = {}
missing = 0
for i in range(1, total + 1):
    path = os.path.join(art, 'shiny', f'{i}.png')
    if not os.path.exists(path):
        missing += 1
        continue
    color = dominant(path)
    if color:
        out[str(i)] = color
json.dump(out, open(os.path.join(root, 'lib', 'data', 'shiny-colors.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'색 이름 {len(out)}개 저장, 그림 없음 {missing}개', file=sys.stderr)
