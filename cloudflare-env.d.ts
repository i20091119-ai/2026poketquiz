declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    /** 부모 공간 비밀번호. `npx wrangler secret put PARENT_PASSWORD`로 등록합니다. */
    PARENT_PASSWORD?: string;
  }
}
