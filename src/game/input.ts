export type Action = 'start' | 'chute' | 'view' | 'retry' | 'pause'
const actions: Record<string, Action> = { Space: 'start', KeyE: 'chute', KeyV: 'view', KeyR: 'retry', Escape: 'pause' }
export class Input {
  private events = new AbortController()
  private keys = new Set<string>()
  private dragId: number | null = null
  private lastX = 0
  private lastY = 0
  joystick = { x: 0, y: 0 }
  yaw = 0
  pitch = 0
  constructor(canvas: HTMLCanvasElement, handle: (action: Action) => void) {
    const { signal } = this.events
    window.addEventListener('keydown', e => {
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target?.closest('input,select,textarea') && e.code !== 'Escape') return
      if (target?.closest('button') && e.code === 'Space') return
      if (!actions[e.code] && !/^Key[WASD]$/.test(e.code)) return
      e.preventDefault()
      this.keys.add(e.code)
      if (!e.repeat && actions[e.code]) handle(actions[e.code])
    }, { signal })
    window.addEventListener('keyup', e => this.keys.delete(e.code), { signal })
    window.addEventListener('blur', () => this.reset(), { signal })
    canvas.addEventListener('pointerdown', e => {
      if (this.dragId !== null || e.button !== 0) return
      this.dragId = e.pointerId
      this.lastX=e.clientX
      this.lastY=e.clientY
      canvas.setPointerCapture(e.pointerId)
    }, { signal })
    canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== this.dragId) return
      this.yaw -= (e.clientX-this.lastX) * .006
      this.pitch -= (e.clientY-this.lastY) * .005
      this.lastX=e.clientX
      this.lastY=e.clientY
    }, { signal })
    canvas.addEventListener('lostpointercapture', () => { this.dragId = null }, { signal })
  }
  get x() { return Math.max(-1, Math.min(1, this.joystick.x + Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')))) }
  get y() { return Math.max(-1, Math.min(1, this.joystick.y + Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')))) }
  reset() { this.keys.clear(); this.joystick = { x: 0, y: 0 }; this.yaw = 0; this.pitch = 0 }
  dispose() { this.events.abort() }
}
