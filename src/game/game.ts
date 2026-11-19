import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import R from '@dimforge/rapier3d-compat'
import { Actor, type Part } from './actor'
import { Effects } from './effects'
import { Input, type Action } from './input'
import { Scenery } from './scenery'
import { airForce, canopyForce, magnitude, waterForce, windAt, type Vec } from './physics'
import { GRAVITY, MAX_STEPS, STEP, injuryRules, qualityPresets, startHeight, surfaces, type ActorState, type ChuteState, type Settings } from './config'
import { initialTelemetry, useGame } from './store'

const clamp = T.MathUtils.clamp
let init: Promise<void> | undefined
export function initializePhysics() { return init ??= R.init() }
export async function loadMarker() { return (await new GLTFLoader().loadAsync('./assets/platform-marker.glb')).scene }

export class Game {
  private renderer: T.WebGLRenderer
  private camera = new T.PerspectiveCamera(51,1,.045,2100)
  private target = new T.Vector3()
  private look = new T.Vector3()
  private cameraGoal = new T.Vector3()
  private firstDirection = new T.Vector3()
  private rayDirection = new T.Vector3()
  private canopy = new T.Group()
  private waterColor = new T.Color(0x427c81)
  private fogColor = new T.Color()
  private observer: ResizeObserver
  private frame = 0
  private world!: R.World
  private queue!: R.EventQueue
  private scenery!: Scenery
  private actor!: Actor
  private fx!: Effects
  private accumulator = 0
  private time = 0
  private last = 0
  private state: ActorState = 'Standing'
  private chute: ChuteState = 'packed'
  private chuteTime = 0
  private heading = 0
  private waiting: Vec = {x:0,y:0,z:0}
  private landed = -1
  private stationaryTime = 0
  private enteredWater = -1
  private inWater = false
  private peak = 0
  private speed = 0
  private acceleration = 0
  private wind: Vec = { x:0,y:0,z:0 }
  private hudTime = 0
  private clock = 0
  private frameCounter = 0
  private fps = 0
  private resolution = 1
  private cameraReady = false
  private lastView = false
  private config!: Settings
  readonly input: Input

  constructor(private host: HTMLElement, private marker: T.Group) {
    this.renderer = new T.WebGLRenderer({ antialias:false, powerPreference:'high-performance' })
    this.renderer.domElement.setAttribute('aria-label','可旋轉的 3D 遊戲畫面')
    this.renderer.outputColorSpace=T.SRGBColorSpace
    this.renderer.toneMapping=T.ACESFilmicToneMapping
    this.renderer.toneMappingExposure=1.07
    this.renderer.shadowMap.enabled=true
    this.renderer.shadowMap.type=T.PCFShadowMap
    this.host.append(this.renderer.domElement)
    this.input=new Input(this.renderer.domElement,a => this.action(a))
    this.observer=new ResizeObserver(() => this.resize())
    this.observer.observe(this.host)
    this.load(useGame.getState().settings)
    this.frame=requestAnimationFrame(this.loop)
  }

  load(settings: Settings, screen: 'menu' | 'play' = 'menu') {
    if (this.world) this.clearWorld()
    this.config={...settings}
    this.world=new R.World({x:0,y:-GRAVITY,z:0})
    this.world.timestep=STEP
    this.world.maxCcdSubsteps=3
    this.queue=new R.EventQueue(true)
    this.scenery=new Scenery(this.world,this.config,this.marker)
    this.waiting={...this.scenery.launch}
    const surface=surfaces[settings.surface]
    this.actor=new Actor(this.world,this.scenery.scene,this.waiting,settings.mass,surface.friction,surface.restitution)
    this.fx=new Effects(this.scenery.scene)
    this.makeCanopy()
    this.world.step()
    this.fogColor.copy((this.scenery.scene.fog as T.FogExp2).color)
    this.resolution=qualityPresets[settings.quality].ratio
    this.resize()
    Object.assign(this,{ accumulator:0,time:0,state:'Standing',chute:'packed',chuteTime:0,heading:0,landed:-1,
      enteredWater:-1,inWater:false,stationaryTime:0,peak:0,speed:0,acceleration:0,hudTime:0,cameraReady:false,wind:windAt(settings,0) })
    this.input.reset()
    useGame.setState({screen,paused:false,outcome:null,telemetry:{...initialTelemetry,height:startHeight(settings),wind:magnitude(this.wind)}})
  }

  select(settings: Settings) {
    useGame.setState({settings})
    if (settings.mode !== this.config.mode || settings.tower !== this.config.tower || settings.fallsHeight !== this.config.fallsHeight ||
      settings.skyHeight !== this.config.skyHeight || settings.weather !== this.config.weather || settings.quality !== this.config.quality ||
      settings.surface !== this.config.surface) this.load(settings)
    else {
      if (settings.mass !== this.config.mass) this.actor.setMass(settings.mass)
      this.config={...settings}
    }
  }

  menu() { this.load(useGame.getState().settings) }

  action(action: Action) {
    const { screen,paused,firstPerson,settings }=useGame.getState()
    if(action==='view') {
      useGame.setState({firstPerson:!firstPerson}); return
    }
    if(action==='pause' && screen==='play') {
      useGame.setState({paused:!paused}); return
    }
    if(action==='retry' && screen!=='menu') { this.load(settings,'play'); this.start(); return }
    if(action==='start' && !paused) {
      if(screen==='result') this.load(settings,'play')
      if(this.state==='Standing') this.start()
    }
    if(action==='chute' && screen==='play' && !paused && this.config.mode==='sky' &&
      this.state==='Falling' && this.chute==='packed' && this.config.chute!=='none') {
      this.chute='opening'
      this.chuteTime=0
      this.publish()
    }
  }

  private start() {
    this.time=0
    const ground=this.config.mode!=='sky'
    this.fx.prime()
    this.actor.launch({x:this.input.x*.55,y:ground?-.18:.12,z:ground?3.5:3.2})
    this.state='Falling'
    useGame.setState({screen:'play',paused:false,outcome:null})
    this.publish()
  }

  private resize() {
    const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1,this.resolution))
    this.renderer.setSize(w,h,false)
    this.camera.aspect=w/h
    this.camera.fov=w<h ? 62 : 51
    this.camera.updateProjectionMatrix()
  }

  private makeCanopy() {
    this.canopy=new T.Group()
    const geometry=new T.SphereGeometry(1,20,8,0,Math.PI*2,0,Math.PI*.47)
    const colors=[0xe9713c,0xf59850,0xf2b655]
    const attribute=geometry.getAttribute('position'), color=new Float32Array(attribute.count*3)
    for(let i=0;i<attribute.count;i++) new T.Color(colors[Math.floor((i%21)/3)%3]).toArray(color,i*3)
    geometry.setAttribute('color',new T.BufferAttribute(color,3))
    const sail=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.75}))
    sail.scale.set(3.2,1,1.75); sail.position.y=4.05
    this.canopy.add(sail)
    const ropes=[]
    for(const x of [-1,1]) for(const z of [-1,1]) ropes.push(x*.18,.13,0,x*2.28,4.15,z*1.12)
    const ropeGeometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(ropes,3))
    this.canopy.add(new T.LineSegments(ropeGeometry,new T.LineBasicMaterial({color:0x513d32})))
    this.canopy.visible=false
    this.scenery.scene.add(this.canopy)
  }

  private physics() {
    this.time+=STEP
    this.wind=windAt(this.config,this.time)
    if(this.state==='Standing') {
      const s=this.scenery.launch
      this.waiting.x=clamp(this.waiting.x+this.input.x*STEP*1.6,s.x-1.25,s.x+1.25)
      this.waiting.z=clamp(this.waiting.z-this.input.y*STEP*1.6,s.z-.37,s.z+.34)
      this.actor.moveWaiting(this.waiting)
      this.world.step(this.queue)
      this.queue.clear()
      return
    }
    const chest=this.actor.chest.rigid
    const movementX=this.input.x,movementY=this.input.y
    this.heading+=movementX*STEP*1.1
    if(this.chute==='opening') {
      this.chuteTime+=STEP
      if(this.chuteTime>=1.05) {
        this.chute=this.config.chute==='fault'?'failed':'open'
        if(this.chute==='open') this.state='Parachuting'
        this.publish()
      }
    }
    const fill=this.chute==='open'?1:this.chute==='opening'?.72*clamp(this.chuteTime/1.05,0,1):this.chute==='failed'?.11:0
    const canopy=fill>0 && this.landed<0
      ? canopyForce(chest.linvel(),this.wind,this.heading,fill,this.config.mass)
      : null
    let entry: {position:Vec; speed:number} | undefined
    for(const part of this.actor.parts.values()) {
      const {rigid,spec}=part, p=rigid.translation(), v=rigid.linvel(), mass=rigid.mass()
      part.velocity=v
      part.cooldown=Math.max(0,part.cooldown-STEP)
      rigid.resetForces(false)
      const q=rigid.rotation()
      const broadside=clamp(Math.hypot(2*(q.x*q.y-q.w*q.z),2*(q.y*q.z+q.w*q.x)),0,1)
      const [width,height,depth]=spec.size
      const dragArea=width*Math.sqrt(height*depth)
      const f=airForce(v,this.wind,broadside,dragArea)
      if(this.scenery.containsWater(p) && p.y<height*.5) {
        const sub=clamp((height*.5-p.y)/height,0,1)
        const liquid=waterForce(v,p,mass,dragArea,sub)
        f.x+=liquid.x; f.y+=liquid.y; f.z+=liquid.z
        if(this.state==='Swimming') { f.x+=mass*movementX*3; f.z+=mass*movementY*3; f.y+=mass*.24 }
      }
      if(canopy) {
        const fraction=mass/this.config.mass
        f.x+=canopy.x*fraction
        f.y+=canopy.y*fraction
        f.z+=canopy.z*fraction
        if(this.chute==='open') f.y-=mass*movementY*.8
      }
      if(part===this.actor.chest) rigid.resetTorques(false)
      if(part===this.actor.chest && this.landed<0 && !this.inWater) {
        if(canopy) {
          const torqueScale=this.config.mass/75
          const spin=rigid.angvel()
          if(this.chute==='failed') rigid.addTorque({x:0,y:0,z:torqueScale*(4*Math.sin(this.time*4)-.65*spin.z)},true)
          if(this.chute==='open') {
            const upY=1-2*(q.x*q.x+q.z*q.z)
            const upX=2*(q.x*q.y-q.w*q.z), upZ=2*(q.y*q.z+q.w*q.x)
            if(upY<.97) rigid.addTorque({x:torqueScale*(-upZ*12-spin.x),y:0,z:torqueScale*(upX*12-spin.z)},true)
          }
        } else {
          f.x+=this.config.mass*movementX*1.8
          f.z+=this.config.mass*movementY*1.8
        }
      }
      const footY=p.y-height*.5
      if(!this.inWater && this.scenery.containsWater(p) && footY<=0) {
        const speed=Math.max(0,-v.y)
        if(!entry || speed>entry.speed) entry={position:p,speed}
      }
      rigid.addForce(f,false)
    }
    this.world.step(this.queue)
    const now=chest.translation(), velocity=chest.linvel(), speed=magnitude(velocity)
    const previous=this.actor.chest.velocity
    this.acceleration=magnitude({x:(velocity.x-previous.x)/STEP,y:(velocity.y-previous.y)/STEP,z:(velocity.z-previous.z)/STEP})
    this.speed=speed
    this.peak=Math.max(this.peak,speed)
    const impacts=new Map<Part, {impulse:number; position:Vec}>()
    this.queue.drainContactForceEvents(event => {
      const a=this.actor.colliders.get(event.collider1()), b=this.actor.colliders.get(event.collider2())
      if(Boolean(a)===Boolean(b)) return
      const part=(a??b)!
      const impactSpeed=magnitude(part.velocity)
      const impulse=event.totalForceMagnitude()*STEP
      const p=part.rigid.translation()
      if(p.y>startHeight(this.config)-.65 && this.time<.5) return
      if(this.landed<0 && this.config.mode!=='falls' && p.y<=this.scenery.floor+1.25 && now.y<=this.scenery.floor+2 && impulse>.3) {
        this.landed=this.time
        this.state='Impacted'
        this.fx.play(this.config.volume,false)
      }
      if(impactSpeed<injuryRules.minimumContactSpeed || impulse<1.7 || part.cooldown>0) return
      if(impulse>(impacts.get(part)?.impulse??0)) impacts.set(part,{impulse,position:p})
    })
    for(const [part,{impulse,position}] of impacts) {
      const waterScale=this.inWater?injuryRules.waterScale:1
      const score=impulse*injuryRules.scoreScale*surfaces[this.config.surface].injury*waterScale
      part.cooldown=.19
      this.wound(part,score,position)
    }
    if(entry) {
      this.inWater=true
      this.enteredWater=this.time
      this.state='Swimming'
      this.fx.burst({ x:entry.position.x,y:.05,z:entry.position.z },'high',false,true)
      this.fx.play(this.config.volume,true)
      this.wound(this.actor.chest,Math.max(0,entry.speed-9.4)**2*.014,entry.position)
    }
    if(this.config.mode!=='falls' && this.landed<0 && now.y<1.4 && speed<2.5 && this.time>1) {
      this.landed=this.time
      this.state='Impacted'
    }
    if(this.config.mode==='falls' && this.landed<0 && this.enteredWater<0 && this.time>2 && speed<1 && now.y>0) {
      this.landed=this.time
      this.state='Impacted'
    }
    this.stationaryTime=this.config.mode==='tower' && this.time>1 && speed<.55 ? this.stationaryTime+STEP : 0
    const stoppedOnLedge=this.stationaryTime>=1.65
    const settledOnGround=this.landed>=0 && this.time-this.landed>1.65 && now.y<=this.scenery.floor+2 && speed<2.5
    const completedSwim=this.enteredWater>=0 && this.time-this.enteredWater>6
    const stoppedBeforePool=this.config.mode==='falls' && this.landed>=0 && this.time-this.landed>1.65 && speed<1
    if(stoppedOnLedge || settledOnGround || completedSwim || stoppedBeforePool) this.finish()
    this.fx.step(this.scenery.floor)
    this.canopy.visible=fill>0 && (this.landed<0 || this.time-this.landed<.8)
    this.canopy.position.set(now.x,now.y,now.z)
    this.canopy.scale.setScalar(Math.max(.12,Math.sqrt(fill)))
    this.canopy.rotation.set(0,this.heading,this.chute==='failed'?.72*Math.sin(this.time*4):0)
  }

  private wound(part: Part, score: number, position: Vec) {
    if(score<=0) return
    this.actor.hurt(part,score,child => this.fx.burst(child.rigid.translation(),this.config.blood,true))
    if(score>=injuryRules.hurt) {
      this.fx.burst(position,this.config.blood)
      if(!this.inWater && position.y<1.6) this.fx.stain(position,0)
    }
  }

  private finish() {
    const score=this.actor.score
    this.state=score>=injuryRules.dead?'Dead':score>=injuryRules.incapacitated?'Incapacitated':
      this.enteredWater>=0?'Swimming':'Impacted'
    this.publish()
    useGame.setState({screen:'result',outcome:{state:this.state,parts:this.actor.damaged,separated:this.actor.separated,peak:this.peak}})
  }

  private publish() {
    const p=this.actor.chest.rigid.translation()
    useGame.setState({telemetry:{
      height:this.state==='Standing'?startHeight(this.config):Math.max(0,p.y-1.39), speed:this.speed,
      acceleration:this.acceleration,wind:magnitude(this.wind),fps:this.fps,actor:this.state,chute:this.chute,peak:this.peak,
    }})
  }

  private followTarget = new T.Vector3()

  private updateCamera(dt: number, menu: boolean, firstPerson: boolean) {
    const head=this.actor.head.rigid.translation(), body=this.actor.chest.rigid.translation()
    this.input.pitch=clamp(this.input.pitch,-1.05,1.02)
    const yaw=this.input.yaw + (firstPerson?Math.PI:menu?.64:.16)
    const pitch=this.input.pitch+(menu&&!firstPerson?.26:.13)
    const smooth=this.cameraReady && firstPerson===this.lastView ? 1-Math.exp(-dt*9) : 1
    this.lastView=firstPerson
    const portrait=this.camera.aspect<1
    if(firstPerson) {
      this.cameraGoal.set(head.x,head.y+.065,head.z+.17)
      this.look.set(-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))
      this.camera.position.lerp(this.cameraGoal,smooth)
      this.firstDirection.lerp(this.look,smooth).normalize()
      this.look.copy(this.camera.position).add(this.firstDirection)
    } else {
      const canopyFocus=this.canopy.visible?2.05*this.canopy.scale.y:0
      const distance=menu?(portrait?10.7:12.3):this.canopy.visible?(portrait?11.6:11):6.5
      this.target.set(body.x,body.y+(menu?0:.21)+canopyFocus,body.z)
      this.followTarget.lerp(this.target,smooth)
      this.target.copy(this.followTarget)
      this.cameraGoal.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance).add(this.target)
      this.rayDirection.subVectors(this.cameraGoal,this.target).normalize()
      const hit=this.world.castRay(new R.Ray(this.target,this.rayDirection),distance,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC|R.QueryFilterFlags.EXCLUDE_KINEMATIC)
      if(hit) this.cameraGoal.copy(this.target).addScaledVector(this.rayDirection,Math.max(.22,hit.timeOfImpact-.3))
      this.cameraGoal.y=Math.max(this.scenery.floor+.23,this.cameraGoal.y)
      this.camera.position.lerp(this.cameraGoal,hit?1:smooth)
      const shifted=menu&&!portrait?distance*.23:0
      this.look.set(this.target.x-Math.cos(yaw)*shifted,this.target.y-(menu&&portrait?1.76:.12),this.target.z+Math.sin(yaw)*shifted)
    }
    this.camera.lookAt(this.look)
    this.cameraReady=true
    const underwater=this.scenery.containsWater(this.camera.position) && this.camera.position.y<-.06
    const fog=this.scenery.scene.fog as T.FogExp2
    fog.density=underwater?.105:this.config.mode==='falls'?.013:.0022
    fog.color.copy(underwater?this.waterColor:this.fogColor)
    this.target.set(body.x,body.y,body.z)
    this.scenery.cameraUpdate(this.camera,this.target,this.time)
  }

  private loop = (timestamp: number) => {
    this.frame=requestAnimationFrame(this.loop)
    const elapsed=this.last ? (timestamp-this.last)/1000 : STEP
    const dt=Math.min(.1,elapsed)
    this.last=timestamp
    const {screen,paused,firstPerson}=useGame.getState()
    if(!paused && screen!=='result') {
      this.accumulator=Math.min(this.accumulator+dt,STEP*MAX_STEPS)
      while(this.accumulator+1e-8>=STEP && useGame.getState().screen!=='result') {
        this.physics()
        this.accumulator=Math.max(0,this.accumulator-STEP)
      }
    }
    this.actor.sync(firstPerson)
    this.updateCamera(dt,screen==='menu',firstPerson)
    this.renderer.render(this.scenery.scene,this.camera)
    this.frameCounter++
    this.clock+=elapsed
    this.hudTime+=dt
    if(this.clock>=2) {
      this.fps=Math.round(this.frameCounter/this.clock)
      const previous=this.resolution
      if(this.fps<36) this.resolution=Math.max(.73,this.resolution-.18)
      else if(this.fps>55) this.resolution=Math.min(qualityPresets[this.config.quality].ratio,this.resolution+.08)
      if(previous!==this.resolution) this.resize()
      this.clock=0;this.frameCounter=0
    }
    if(this.hudTime>=.11 && screen!=='result') { this.publish(); this.hudTime=0 }
  }

  private clearWorld() {
    this.fx.dispose()
    const geometries=new Set<T.BufferGeometry>(), materials=new Set<T.Material>()
    this.scenery.scene.traverse(obj => {
      if(obj instanceof T.InstancedMesh) obj.dispose()
      if(obj instanceof T.DirectionalLight) obj.shadow.dispose()
      if(!(obj instanceof T.Mesh || obj instanceof T.Line || obj instanceof T.Points)) return
      geometries.add(obj.geometry)
      for(const material of Array.isArray(obj.material)?obj.material:[obj.material]) materials.add(material)
    })
    geometries.forEach(g => g.dispose())
    materials.forEach(m => m.dispose())
    this.renderer.renderLists.dispose()
    this.queue.free()
    this.world.free()
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.input.dispose()
    this.clearWorld()
    this.renderer.dispose()
    this.marker.traverse(obj => {
      if(obj instanceof T.Mesh) { obj.geometry.dispose(); (obj.material as T.Material).dispose() }
    })
    this.renderer.domElement.remove()
  }
}

