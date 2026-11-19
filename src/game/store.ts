import { create } from 'zustand'
import { defaults, type Settings, type ActorState, type ChuteState } from './config.ts'
export interface Telemetry {
  height: number; speed: number; acceleration: number; wind: number; fps: number
  actor: ActorState; chute: ChuteState; peak: number
}
export interface Outcome { state: ActorState; parts: string[]; separated: string[]; peak: number }
export const initialTelemetry: Telemetry = {
  height: 0, speed: 0, acceleration: 0, wind: 0, fps: 0, actor: 'Standing', chute: 'packed', peak: 0,
}
interface GameStore {
  settings: Settings; screen: 'menu' | 'play' | 'result'; ready: boolean; error: string
  paused: boolean; firstPerson: boolean; telemetry: Telemetry; outcome: Outcome | null
}
export const useGame = create<GameStore>(() => ({
  settings: { ...defaults }, screen: 'menu', ready: false, error: '', paused: false,
  firstPerson: false, telemetry: initialTelemetry, outcome: null,
}))
