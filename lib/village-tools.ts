// 포켓몬 마을 낚시·벌레잡기 (2026-11-14 부모님: "5분 만에 줍기 끝내고 할 게 없대" → 낚시·벌레잡기, 단 재료로 낚싯대·잠자리채를
// 만들어야 할 수 있고, 여러 번 쓰면 부서짐 15번). 잡으면 재료(가끔 열매) + 낮은 확률로 물·벌레 타입 포켓몬 "만남"(도감 만남,
// 획득 아님, 처음이면 ⭐). 숫자는 lib/village-craft.ts CRAFT_DEFAULT(보호자 전체 설정). 상태 변경은 lib/game-engine.ts.
import type { MaterialKey } from './village.ts';
import { craftRules } from './village-craft.ts';

export const TOOLS = ['rod', 'net'] as const;
export type ToolKey = typeof TOOLS[number];
export const TOOL_INFO: Record<ToolKey, { name: string; emoji: string; action: string; where: string; mats: MaterialKey[]; meet: 'shore' | 'garden' }> = {
  rod: { name: '낚싯대', emoji: '🎣', action: '낚시', where: '물가에 서서', mats: ['drop', 'mud'], meet: 'shore' },
  net: { name: '잠자리채', emoji: '🦋', action: '벌레잡기', where: '날아다니는 벌레를 눌러서', mats: ['petal', 'leaf'], meet: 'garden' },
};
/** 도구 재료 (보호자 설정) */
export function toolCost(tool: ToolKey): Partial<Record<MaterialKey, number>> {
  const r = craftRules();
  return tool === 'rod' ? { twig: r.rodTwig, leaf: r.rodLeaf } : { twig: r.netTwig, petal: r.netPetal };
}
