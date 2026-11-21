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
  private readonly dropColors = injuryRules.colors.map(color => new T.Color(color))
  private readonly splashColor = new T.Color(0xa8e5e9)
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
  burst(p: Vec, intensity: Settings['blood'], separation = false, splash = false) {
    const count = bloodLevels[intensity] * (separation ? 2 : 1)
    for (let i=0;i<count;i++) {
      const index = this.dropIndex++ % this.particles.length
      const slot = this.particles[index]
      slot.position.set(p.x,p.y,p.z)
      slot.velocity.set((Math.random()-.5)*5,Math.random()*4+.4,(Math.random()-.5)*5)
      slot.life = .38+Math.random()*.7
      this.drops.setColorAt(index,splash ? this.splashColor : this.dropColors[index%3])
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
    let changed = false
    this.dummy.rotation.set(0,0,0)
    for (let i=0;i<this.particles.length;i++) {
      const p = this.particles[i]
      if (p.life <= 0) continue
      changed = true
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
    if (changed) this.drops.instanceMatrix.needsUpdate = true
  }
  dispose() { void this.audio?.close().catch(() => {}) }
}

