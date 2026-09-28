declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    /** 정적 파일(dist/client). /battle/* 은 Worker 가 먼저 받아 비밀번호 문을 거친 뒤 이 바인딩으로 내보냅니다. */
    ASSETS: Fetcher;
    /** 부모 공간 비밀번호. `npx wrangler secret put PARENT_PASSWORD`로 등록합니다. */
    PARENT_PASSWORD?: string;
  }
}

/** 빌드할 때 넣는 저장 번호 (GitHub 커밋 앞 7자리, vite.config.ts). 새 버전 확인·자동 새로고침에 씁니다. */
declare const __APP_VERSION__: string;
/** 빌드한(올린) 날짜, 예: 2026-09-28 (vite.config.ts) */
declare const __BUILD_DATE__: string;

/** CSV 파일을 글자 그대로 불러오기 (vite ?raw). 연습 문제은행(lib/server/prepared-banks.ts)에 씁니다. */
declare module '*.csv?raw' {
  const text: string;
  export default text;
}
