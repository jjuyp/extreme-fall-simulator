import test from 'node:test'
import assert from 'node:assert/strict'
import R from '@dimforge/rapier3d-compat'
import { AIR_DENSITY, GRAVITY, STEP, defaults, startHeight } from '../src/game/config.ts'
import { drag, relative, waterForce, windAt, canopyForce } from '../src/game/physics.ts'

test('drag is opposite relative velocity and has newtons as its unit',()=>{
  const v=relative({x:7,y:-10,z:-5},{x:2,y:0,z:1})
  const f=drag(v,AIR_DENSITY,.62)
  assert.ok(f.x*v.x+f.y*v.y+f.z*v.z<0)
  assert.ok(Math.abs(Math.hypot(f.x,f.y,f.z)-.5*AIR_DENSITY*.62*(25+100+36))<1e-10)
  assert.equal(Math.hypot(...Object.values(drag({x:0,y:0,z:0},1,.5))),0)
})
test('heights use SI and preserve distinct landmark start and total values',()=>{
  assert.equal(startHeight({...defaults,tower:'kaohsiung'}),320)
  assert.ok(Math.abs(startHeight({...defaults,mode:'sky',skyHeight:1600})-487.68)<1e-9)
})
test('wind produces a signed 3D velocity and drag follows the relative flow',()=>{
  const wind=windAt({...defaults,direction:90,wind:10},0)
  assert.ok(Math.abs(wind.x-10)<1e-9)
  assert.ok(drag(relative({x:0,y:0,z:0},wind),AIR_DENSITY,1).x>0)
  assert.notEqual(windAt(defaults,.4).y,0)
})
test('submersion supports body weight and canopy force opposes descent',()=>{
  assert.equal(waterForce({x:0,y:0,z:0},{x:0,y:0,z:0},75,.1,0).y,0)
  assert.ok(waterForce({x:0,y:-9,z:0},{x:0,y:-1,z:0},75,.1,1).y>75*GRAVITY)
  assert.ok(canopyForce({x:0,y:-12,z:0},{x:0,y:0,z:0},0,1,75).y>75*GRAVITY)
})
await R.init()
test('Rapier free fall matches analytic motion and a fixed step gives the same result across frame rates',()=>{
  const simulate=(frames,seconds,mass)=>{
    const world=new R.World({x:0,y:-GRAVITY,z:0})
    world.timestep=STEP
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,40,0))
    world.createCollider(R.ColliderDesc.ball(.2).setMass(mass),body)
    let acc=0,steps=0
    for(let frame=0;frame<frames*seconds;frame++){
      acc+=1/frames
      while(acc+1e-10>=STEP){world.step();acc-=STEP;steps++}
    }
    const result={height:body.translation().y,speed:body.linvel().y,steps,mass:body.mass()}
    world.free()
    return result
  }
  const a=simulate(30,2,75),b=simulate(144,2,75),heavy=simulate(60,2,120)
  assert.deepEqual(a,b)
  assert.equal(a.steps,120)
  assert.ok(Math.abs(a.height-(40-.5*GRAVITY*4))<.2)
  assert.ok(Math.abs(a.speed+2*GRAVITY)<.002)
  assert.ok(Math.abs(heavy.mass-120)<.001)
  assert.ok(Math.abs(heavy.speed-a.speed)<.001)
})

test('all 17 bodies sum to the configured mass and a separated limb can collide independently',async()=>{
  const {Actor}=await import('../src/game/actor.ts')
  const {Scene}=await import('three')
  const scene=new Scene()
  const world=new R.World({x:0,y:-GRAVITY,z:0})
  world.timestep=STEP
  const ground=world.createCollider(R.ColliderDesc.cuboid(30,1,30)
    .setCollisionGroups((1<<16)|2).setTranslation(0,-1,0))
  const actor=new Actor(world,scene,{x:0,y:4,z:0},75,.8,.02)
  assert.equal(actor.parts.size,17)
  assert.equal(actor.links.length,16)
  assert.ok(Math.abs([...actor.parts.values()].reduce((sum,part)=>sum+part.rigid.mass(),0)-75)<.001)
  actor.launch({x:0,y:0,z:0})
  const limb=actor.parts.get('lhand'), elbow=actor.parts.get('lfore')
  assert.ok(actor.links.every(link=>link.joint.isValid()))
  const removed=actor.links.find(link=>link.child===limb).joint
  let event
  actor.hurt(limb,10,part=>{event=part})
  assert.equal(event,limb)
  assert.equal(removed.isValid(),false)
  assert.equal(actor.links.filter(link=>!link.joint).length,1)
  assert.ok(actor.links.find(link=>link.child===limb).caps.every(mesh=>mesh.visible))
  limb.rigid.setLinvel({x:-6,y:0,z:0},true)
  for(let i=0;i<90;i++)world.step()
  assert.ok(limb.rigid.translation().x<elbow.rigid.translation().x-2)
  assert.ok(limb.rigid.translation().y>=.015)
  let touched=false
  world.contactPair(limb.collider,ground,()=>{touched=true})
  assert.ok(touched)
  world.free()
})
test('impact effects reuse a bounded red-particle pool and advance with gravity',async()=>{
  const {Effects}=await import('../src/game/effects.ts')
  const {Scene,Color,Matrix4}=await import('three')
  const {injuryRules,bloodLevels}=await import('../src/game/config.ts')
  const scene=new Scene(), effects=new Effects(scene)
  const [drops,stains]=scene.children
  effects.burst({x:0,y:3,z:0},'medium')
  assert.equal(effects.particles.filter(p=>p.life>0).length,bloodLevels.medium)
  const color=new Color()
  drops.getColorAt(0,color)
  assert.equal(color.getHex(),injuryRules.colors[0])
  const p=effects.particles[0], vertical=p.velocity.y
  effects.step(0)
  assert.ok(Math.abs(p.velocity.y-(vertical-GRAVITY*STEP))<1e-12)
  effects.stain({x:1,y:0,z:2},0)
  const matrix=new Matrix4()
  stains.getMatrixAt(0,matrix)
  assert.ok(matrix.elements[13]>0)
  for(let i=0;i<24;i++)effects.burst({x:0,y:3,z:0},'high',true)
  assert.equal(effects.particles.length,injuryRules.maxParticles)
  for(let i=0;i<120;i++)effects.step(0)
  assert.ok(effects.particles.every(p=>p.life===0))
})
