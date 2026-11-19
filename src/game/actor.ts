import * as T from 'three'
import R from '@dimforge/rapier3d-compat'
import { injuryRules } from './config.ts'
import type { Vec } from './physics.ts'

const suit = 0xeb6c32, slate = 0x233740, skin = 0xe1a781, boot = 0x18252d
interface PartSpec {
  id: string; name: string; center: [number, number, number]; size: [number, number, number]
  weight: number; color: number; parent?: string
}
const body: PartSpec[] = [
  { id:'pelvis', name:'骨盆', center:[0,.94,0], size:[.36,.22,.22], weight:13, color:slate },
  { id:'abdomen', name:'腹部', center:[0,1.14,0], size:[.32,.23,.21], weight:12, color:suit, parent:'pelvis' },
  { id:'chest', name:'胸部', center:[0,1.39,0], size:[.43,.29,.26], weight:24, color:suit, parent:'abdomen' },
  { id:'neck', name:'頸部', center:[0,1.58,0], size:[.12,.1,.12], weight:2, color:skin, parent:'chest' },
  { id:'head', name:'頭部', center:[0,1.73,0], size:[.22,.25,.22], weight:7, color:skin, parent:'neck' },
]
for (const [side, direction, word] of [['l', -1, '左'], ['r', 1, '右']] as const) {
  body.push(
    { id:side+'arm', name:word+'上臂', center:[direction*.28,1.36,0], size:[.125,.31,.135], weight:3, color:suit, parent:'chest' },
    { id:side+'fore', name:word+'前臂', center:[direction*.34,1.09,.025], size:[.102,.26,.113], weight:2, color:slate, parent:side+'arm' },
    { id:side+'hand', name:word+'手掌', center:[direction*.36,.91,.03], size:[.094,.108,.088], weight:1, color:skin, parent:side+'fore' },
    { id:side+'thigh', name:word+'大腿', center:[direction*.105,.735,0], size:[.163,.365,.181], weight:9, color:slate, parent:'pelvis' },
    { id:side+'shin', name:word+'小腿', center:[direction*.11,.395,0], size:[.132,.35,.142], weight:5, color:slate, parent:side+'thigh' },
    { id:side+'foot', name:word+'腳掌', center:[direction*.112,.131,.06], size:[.143,.16,.26], weight:1, color:boot, parent:side+'shin' },
  )
}
const totalWeight = body.reduce((n, part) => n + part.weight, 0)
export interface Part {
  spec: PartSpec; mesh: T.Mesh; rigid: R.RigidBody; collider: R.Collider
  stains: number; cooldown: number; region: T.Mesh; velocity: Vec
}
interface Link {
  parent: Part; child: Part; joint: R.ImpulseJoint | null; damage: number; caps: T.Mesh[]
}

const material = (color: number) => new T.MeshStandardMaterial({ color, roughness: .84, flatShading: true })
export class Actor {
  parts = new Map<string, Part>()
  links: Link[] = []
  colliders = new Map<number, Part>()
  private group = new T.Group()
  readonly chest: Part
  readonly head: Part
  private world: R.World
  constructor(world: R.World, scene: T.Scene, origin: Vec, mass: number, friction: number, restitution: number) {
    this.world=world
    const materials = new Map<number, T.Material>()
    const mat = (color: number) => {
      if (!materials.has(color)) materials.set(color, material(color))
      return materials.get(color)!
    }
    scene.add(this.group)
    for (const spec of body) {
      const [x,y,z] = spec.center, [w,h,d] = spec.size
      const rounded = spec.id === 'head' || spec.id === 'neck'
      const geometry = rounded ? new T.SphereGeometry(.5, 10, 7) : new T.CylinderGeometry(.48,.43,1,8,1)
      geometry.scale(w,h,d)
      const mesh = new T.Mesh(geometry, mat(spec.color))
      mesh.castShadow = true
      this.group.add(mesh)
      const rigid = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(origin.x+x,origin.y+y,origin.z+z).setCcdEnabled(true)
        .setLinearDamping(.045).setAngularDamping(.75).setAdditionalSolverIterations(4))
      const collider = world.createCollider(R.ColliderDesc.roundCuboid(w*.41,h*.44,d*.42,Math.min(w,d)*.065)
        .setMass(mass * spec.weight / totalWeight).setFriction(friction).setRestitution(restitution)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitutionCombineRule(R.CoefficientCombineRule.Max)
        .setCollisionGroups((2 << 16) | 1 | 2).setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(16), rigid)
      const region = new T.Mesh(new T.CircleGeometry(Math.min(w,h)*.27, 7), mat(0x7f1d1d))
      region.position.set(0,0,d*.50)
      region.visible = false
      mesh.add(region)
      this.parts.set(spec.id, { spec, mesh, rigid, collider, region, stains:0, cooldown:0, velocity:{ x:0,y:0,z:0 } })
      this.colliders.set(collider.handle, this.parts.get(spec.id)!)
      if (spec.id === 'head') {
        const helmet = new T.Mesh(new T.SphereGeometry(.119,10,5,0,Math.PI*2,0,Math.PI*.55), mat(0xf58249))
        helmet.position.y = .027
        mesh.add(helmet)
        const visor = new T.Mesh(new T.BoxGeometry(.17,.042,.046), mat(0x1c383f))
        visor.position.set(0,.016,.092)
        mesh.add(visor)
      }
      if (spec.id === 'chest') {
        const harness = new T.Mesh(new T.BoxGeometry(.24,.21,.08), mat(0x1b2933))
        harness.position.z = -.127
        mesh.add(harness)
        for (const side of [-1, 1]) {
          const stripe = new T.Mesh(new T.BoxGeometry(.028,.22,.015), mat(0xf7c98e))
          stripe.position.set(side*.087,.008,.125)
          stripe.rotation.z = side*.16
          mesh.add(stripe)
        }
      }
    }
    this.chest = this.parts.get('chest')!
    this.head = this.parts.get('head')!
    for (const child of this.parts.values()) {
      if (!child.spec.parent) continue
      const parent = this.parts.get(child.spec.parent)!
      const [cx,cy,cz] = child.spec.center, [px,py,pz] = parent.spec.center
      const a = { x:(cx-px)/2, y:(cy-py)/2, z:(cz-pz)/2 }
      const b = { x:-a.x,y:-a.y,z:-a.z }
      const hinge = /fore|shin/.test(child.spec.id)
      const data = hinge ? R.JointData.revolute(a,b,{x:1,y:0,z:0}) : R.JointData.spherical(a,b)
      const joint = world.createImpulseJoint(data,parent.rigid,child.rigid,true)
      joint.setContactsEnabled(false)
      if (joint instanceof R.RevoluteImpulseJoint) joint.setLimits(-.4, 1.7)
      const caps = [parent, child].map((part,index) => {
        const cap = new T.Mesh(new T.SphereGeometry(.5,8,5), mat(0x7f1d1d))
        const radius = Math.min(...child.spec.size) * .76
        cap.scale.set(radius, radius*.52, radius)
        const at = index === 0 ? a : b
        cap.position.set(at.x,at.y,at.z)
        cap.visible = false
        part.mesh.add(cap)
        return cap
      })
      this.links.push({ parent, child, joint, damage:0, caps })
    }
    this.sync(false)
  }
  setMass(mass: number) {
    for (const {collider,rigid,spec} of this.parts.values()) {
      collider.setMass(mass * spec.weight / totalWeight)
      rigid.recomputeMassPropertiesFromColliders()
    }
  }
  launch(velocity: Vec) {
    for (const part of this.parts.values()) {
      part.rigid.setBodyType(R.RigidBodyType.Dynamic, true)
      part.rigid.setLinvel(velocity, true)
    }
  }
  moveWaiting(origin: Vec) {
    for (const {rigid,spec} of this.parts.values()) {
      const [x,y,z] = spec.center
      rigid.setNextKinematicTranslation({ x: origin.x+x, y: origin.y+y, z: origin.z+z })
    }
  }
  sync(firstPerson: boolean) {
    for (const part of this.parts.values()) {
      const {x,y,z} = part.rigid.translation()
      const q = part.rigid.rotation()
      part.mesh.position.set(x,y,z)
      part.mesh.quaternion.set(q.x,q.y,q.z,q.w)
      part.mesh.visible = part !== this.head || !firstPerson
    }
  }
  hurt(part: Part, amount: number, onBreak: (part: Part) => void) {
    part.stains += amount
    part.region.visible = part.stains >= injuryRules.hurt
    for (const link of this.links) {
      if (!link.joint || (link.child !== part && link.parent !== part)) continue
      link.damage += amount * (link.child === part ? 1 : .47)
      if (injuryRules.separation && link.damage >= injuryRules.breakJoint) {
        this.world.removeImpulseJoint(link.joint,true)
        link.joint = null
        for (const cap of link.caps) cap.visible = true
        onBreak(link.child)
      }
    }
  }
  get separated() { return this.links.filter(link => !link.joint).map(link => link.child.spec.name) }
  get damaged() { return [...this.parts.values()].filter(part => part.stains >= injuryRules.hurt).map(part => part.spec.name) }
  get score() { return [...this.parts.values()].reduce((sum,p) => sum + p.stains,0) }
}

