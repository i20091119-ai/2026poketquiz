// 휴대폰 홈 화면용 앱 아이콘을 앱 로고(public/assets/ui/logo.svg 의 몬스터볼 + Q)로 만듭니다. 포켓몬 그림은 쓰지 않습니다.
// 다시 만들 때: node scripts/make-app-icons.mjs (결과 PNG는 public/icons/ 에 저장, git 에 포함)
import sharp from 'sharp';

const BG = '#e8f3d9';
/** 로고(128 기준 좌표)를 size 칸 가운데에 scale 비율로 그림 */
const logo = (size, ratio) => {
  const s = (size * ratio) / 128, o = (size - 128 * s) / 2;
  return `<g transform="translate(${o} ${o}) scale(${s})">
    <circle cx="64" cy="64" r="56" fill="#17674e"/>
    <path d="M8 64a56 56 0 0 1 112 0z" fill="#e3350d"/>
    <circle cx="64" cy="64" r="56" fill="none" stroke="#10513c" stroke-width="3"/>
    <rect x="8" y="59" width="112" height="10" fill="#fff"/>
    <circle cx="64" cy="64" r="19" fill="#fff" stroke="#10513c" stroke-width="3"/>
    <text x="64" y="72.5" font-size="23" font-weight="bold" text-anchor="middle" fill="#17674e" font-family="DejaVu Sans, sans-serif">Q</text>
  </g>`;
};
// any: 둥근 네모 바탕 위 로고 / maskable: 꽉 찬 바탕(휴대폰이 원·물방울 모양으로 잘라도 로고가 남도록 작게)
const any = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>${logo(size, 0.78)}</svg>`;
const maskable = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${BG}"/>${logo(size, 0.58)}</svg>`;

const jobs = [
  ['icon-192.png', any(192)], ['icon-512.png', any(512)],
  ['icon-maskable-192.png', maskable(192)], ['icon-maskable-512.png', maskable(512)],
  ['apple-touch-icon.png', maskable(180)],
];
for (const [name, svg] of jobs) {
  await sharp(Buffer.from(svg)).png().toFile(`public/icons/${name}`);
  console.log('✅', name);
}
