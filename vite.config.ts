import { execSync } from "node:child_process";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  // Keep Wrangler/Miniflare state inside the project.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  // 화면 맨 아래에 보여 줄 버전 (GitHub에 저장된 번호 앞 7자리). 인터넷에 무엇이 올라갔는지 확인할 때 씁니다.
  let version = "개발";
  try { version = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { /* git이 없으면 그대로 */ }

  // 올린 날짜 (한국 시간). 화면에는 lib/version.ts 의 버전 이름과 함께 "1.4 (2026-09-28)" 처럼 보입니다.
  const buildDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return {
    define: { __APP_VERSION__: JSON.stringify(version), __BUILD_DATE__: JSON.stringify(buildDate) },
    plugins: [
      vinext(),
      // Reads bindings (D1 `DB`) from wrangler.jsonc.
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
      }),
    ],
  };
});
