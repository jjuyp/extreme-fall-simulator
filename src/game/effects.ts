import * as T from 'three'
import { GRAVITY, injuryRules, bloodLevels, STEP, type Settings } from './config.ts'
import type { Vec } from './physics.ts'
interface Particle { position: T.Vector3; velocity: T.Vector3; life: number }
const hidden = new T.Matrix4().makeScale(0,0,0)
export class Effects {
  readonly particles: Particle[] = []
  private drops: T.InstancedMesh
  private stains: T.InstancedMesh
  private dummy = new T.Object3D()
  private dropIndex = 0
  private stainIndex = 0
  private audio?: AudioContext
  constructor(scene: T.Scene) {
    this.drops = new T.InstancedMesh(new T.IcosahedronGeometry(.045,0),new T.MeshBasicMaterial({color:0xffffff}),injuryRules.maxParticles)
    this.stains = new T.InstancedMesh(new T.CircleGeometry(1,8),new T.MeshBasicMaterial({
      color:0xffffff, transparent:true, opacity:.76, polygonOffset:true, polygonOffsetFactor:-2, depthWrite:false,
    }),injuryRules.maxStains)
    this.drops.frustumCulled = this.stains.frustumCulled = false
    this.drops.instanceMatrix.setUsage(T.DynamicDrawUsage)
    this.stains.instanceMatrix.setUsage(T.DynamicDrawUsage)
    for (const mesh of [this.drops,this.stains]) {
      for (let i=0;i<mesh.count;i++) {
        mesh.setMatrixAt(i,hidden)
        mesh.setColorAt(i,new T.Color(injuryRules.colors[i%3]))
      }
      scene.add(mesh)
    }
    for (let i=0;i<this.drops.count;i++) this.particles.push({position:new T.Vector3(),velocity:new T.Vector3(),life:0})
  }
  prime() {
    try { this.audio ??= new AudioContext(); void this.audio.resume().catch(() => {}) } catch { /* audio is optional */ }
  }
  play(volume: number, splash: boolean) {
    if (!this.audio || this.audio.state !== 'running' || volume === 0) return
    const ctx = this.audio
    const samples = ctx.createBuffer(1,Math.floor(ctx.sampleRate*.21),ctx.sampleRate)
    const data = samples.getChannelData(0)
    for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1-i/data.length)**4
    const sound = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
    filter.frequency.value = splash ? 1000 : 180
    gain.gain.value = volume*.8
    sound.buffer = samples
    sound.connect(filter).connect(gain).connect(ctx.destination)
    sound.start()
  }
  burst(p: Vec, intensity: Settings['blood'], separation = false, splash = false) {
    const count = bloodLevels[intensity] * (separation ? 2 : 1)
    for (let i=0;i<count;i++) {
      const index = this.dropIndex++ % this.particles.length
      const slot = this.particles[index]
      slot.position.set(p.x,p.y,p.z)
      slot.velocity.set((Math.random()-.5)*5,Math.random()*4+.4,(Math.random()-.5)*5)
      slot.life = .38+Math.random()*.7
      this.drops.setColorAt(index,new T.Color(splash ? 0xa8e5e9 : injuryRules.colors[index%3]))
    }
    if (this.drops.instanceColor) this.drops.instanceColor.needsUpdate = true
  }
  stain(p: Vec, surfaceY: number) {
    this.dummy.position.set(p.x,surfaceY+.014,p.z)
    this.dummy.rotation.set(-Math.PI/2,0,Math.random()*6)
    this.dummy.scale.set(.19+Math.random()*.25,.08+Math.random()*.18,1)
    this.dummy.updateMatrix()
    this.stains.setMatrixAt(this.stainIndex++ % this.stains.count,this.dummy.matrix)
    this.stains.instanceMatrix.needsUpdate = true
  }
  step(floor: number) {
    this.dummy.rotation.set(0,0,0)
    for (let i=0;i<this.particles.length;i++) {
      const p = this.particles[i]
      if (p.life <= 0) continue
      p.life -= STEP
      p.velocity.y -= GRAVITY*STEP
      p.position.addScaledVector(p.velocity,STEP)
      if (p.position.y < floor || p.life <= 0) {
        p.life = 0
        this.drops.setMatrixAt(i,hidden)
        continue
      }
      this.dummy.position.copy(p.position)
      this.dummy.scale.setScalar(Math.min(1,p.life*5))
      this.dummy.updateMatrix()
      this.drops.setMatrixAt(i,this.dummy.matrix)
    }
    this.drops.instanceMatrix.needsUpdate = true
  }
  dispose() { void this.audio?.close().catch(() => {}) }
}

