export const GRAVITY = 9.80665
export const STEP = 1 / 60
export const MAX_STEPS = 6
export const AIR_DENSITY = 1.225
export const WATER_DENSITY = 1000
export const FOOT = 0.3048

export type Mode = 'tower' | 'falls' | 'sky'
export type Tower = 'house' | 'block' | 'kaohsiung' | 'taipei'
export const towers = {
  house: { name: '四層住宅', total: 12, start: 12 },
  block: { name: '十層住宅', total: 30, start: 30 },
  kaohsiung: { name: '高雄 85 大樓', total: 347.5, start: 320 },
  taipei: { name: '台北 101', total: 508, start: 449 },
} satisfies Record<Tower, {name: string; total: number; start: number}>
export const fallHeights = [4, 6, 12, 18, 24]
export const skyHeights = [1600, 2000, 2500, 3000]
export const surfaces = {
  concrete: { label: '混凝土', friction: .78, restitution: .04, injury: 1, color: 0x88918d },
  dirt: { label: '泥土', friction: .65, restitution: .02, injury: .78, color: 0x887364 },
  grass: { label: '草地', friction: .85, restitution: .02, injury: .68, color: 0x708762 },
  sand: { label: '沙地', friction: .56, restitution: .01, injury: .54, color: 0xc8ad7e },
}
export const weatherProfiles = {
  clear: { label: '晴天', breeze: 0, gust: .4, sky: 0x9abcc9, light: 2.7 },
  rain: { label: '雨天', breeze: 2, gust: 1.5, sky: 0x637c89, light: 1.5 },
  storm: { label: '強風', breeze: 9, gust: 4, sky: 0x8fa7b0, light: 2.1 },
}
export const qualityPresets = {
  low: { label: '低', ratio: 1, shadow: 0, scenery: .55 },
  medium: { label: '中', ratio: 1.45, shadow: 1024, scenery: .8 },
  high: { label: '高', ratio: 2, shadow: 2048, scenery: 1 },
}
export const bloodLevels = { low: 7, medium: 16, high: 28 }
export const injuryRules = {
  minimumContactSpeed: 2.5, waterScale: .23, scoreScale: 1 / 180,
  hurt: .25, incapacitated: 1.05, dead: 1.95, breakJoint: 1.65,
  separation: true, maxParticles: 192, maxStains: 48,
  colors: [0xb91c1c, 0x7f1d1d, 0xef4444],
}
export interface Settings {
  mode: Mode; tower: Tower; fallsHeight: number; skyHeight: number
  chute: 'normal' | 'none' | 'fault'; weather: keyof typeof weatherProfiles
  mass: number; wind: number; direction: number; surface: keyof typeof surfaces
  blood: keyof typeof bloodLevels; quality: keyof typeof qualityPresets; volume: number
}
export const defaults: Settings = {
  mode: 'tower', tower: 'house', fallsHeight: 12, skyHeight: 2000, chute: 'normal',
  weather: 'clear', mass: 75, wind: 3, direction: 45, surface: 'concrete',
  blood: 'medium', quality: matchMediaSafe() ? 'low' : 'medium', volume: .35,
}
function matchMediaSafe() { return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches }
export function startHeight(s: Settings) {
  return s.mode === 'tower' ? towers[s.tower].start : s.mode === 'falls' ? s.fallsHeight : s.skyHeight * FOOT
}
export const stateLabels = {
  Standing: '準備就緒', Falling: '自由落體', Swimming: '水中', Parachuting: '傘下降',
  Impacted: '已接觸', Incapacitated: '失去行動能力', Dead: '模擬死亡',
}
export type ActorState = keyof typeof stateLabels
export const chuteLabels = { packed: '收合', opening: '展開中', open: '已展開', failed: '故障' }
export type ChuteState = keyof typeof chuteLabels
