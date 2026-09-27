declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    /** 정적 파일(dist/client). /battle/* 은 Worker 가 먼저 받아 비밀번호 문을 거친 뒤 이 바인딩으로 내보냅니다. */
    ASSETS: Fetcher;
    /** 부모 공간 비밀번호. `npx wrangler secret put PARENT_PASSWORD`로 등록합니다. */
    PARENT_PASSWORD?: string;
  }
}

/** 빌드할 때 넣는 버전 번호 (vite.config.ts) */
declare const __APP_VERSION__: string;
