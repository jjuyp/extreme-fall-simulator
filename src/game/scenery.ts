import * as T from 'three'
import R from '@dimforge/rapier3d-compat'
import { startHeight, towers, weatherProfiles, qualityPresets, surfaces, type Settings } from './config'
import type { Vec } from './physics'

function random(seed: number) {
  return () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296 }
}
export class Scenery {
  scene = new T.Scene()
  launch: Vec = {x:0,y:0,z:0}
  floor = 0
  private sun: T.DirectionalLight
  private sky: T.Mesh<T.SphereGeometry,T.ShaderMaterial>
  private shaders: T.ShaderMaterial[] = []
  private rain?: T.Points<T.BufferGeometry,T.PointsMaterial>
  private rng = random(712)
  private blockGeometry = new T.BoxGeometry()
  private materials = new Map<number,T.MeshStandardMaterial>()
  private dummy = new T.Object3D()
  private readonly surface
  private horizon = new T.Color()
  private zenith = new T.Color()
  private submergedHorizon = new T.Color(0x39747a)
  private submergedZenith = new T.Color(0x163a4a)
  constructor(private world: R.World, private settings: Settings, marker: T.Group) {
    this.surface = surfaces[settings.surface]
    const weather = weatherProfiles[settings.weather]
    this.scene.fog = new T.FogExp2(weather.sky,settings.mode === 'falls' ? .013 : .0022)
    this.zenith.set(weather.sky).multiplyScalar(.75)
    this.horizon.set(settings.weather === 'rain' ? 0xb4c3c5 : 0xf8e2c0)
    const skyMaterial = new T.ShaderMaterial({
      side:T.BackSide, depthWrite:false,
      uniforms:{ zenith:{value:this.zenith}, horizon:{value:this.horizon} },
      vertexShader:'varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader:`varying vec3 direction; uniform vec3 zenith;uniform vec3 horizon;
        void main(){ vec3 d=normalize(direction); float edge=pow(clamp(d.y*1.8+.16,0.,1.),.61);
        float sun=pow(max(dot(d,normalize(vec3(-.5,.26,-.4))),0.),54.);
        gl_FragColor=vec4(mix(horizon,zenith,edge)+sun*vec3(.5,.31,.16),1.);
        #include <colorspace_fragment>
        }`,
    })
    this.sky = new T.Mesh(new T.SphereGeometry(1550,20,12),skyMaterial)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -100
    this.scene.add(this.sky)
    this.scene.add(new T.HemisphereLight(0xe5f2ff,0x8d785c,2.05))
    this.sun = new T.DirectionalLight(0xffe4c6,weather.light)
    this.scene.add(this.sun,this.sun.target)
    const resolution = qualityPresets[settings.quality].shadow
    this.sun.castShadow = resolution > 0
    this.sun.shadow.mapSize.set(resolution || 512,resolution || 512)
    Object.assign(this.sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:.5,far:115})
    this.sun.shadow.normalBias = .045
    if (settings.mode === 'tower') this.tower()
    if (settings.mode === 'falls') this.waterfall()
    if (settings.mode === 'sky') this.airfield()
    this.addMarker(marker)
    if (settings.weather === 'rain') {
      const data = new Float32Array(520*3)
      for (let i=0;i<data.length;i++) data[i]=(this.rng()-.5)*34
      const g=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(data,3))
      this.rain = new T.Points(g,new T.PointsMaterial({color:0xd4eef2,size:.075,transparent:true,opacity:.62,depthWrite:false}))
      this.rain.frustumCulled=false
      this.scene.add(this.rain)
    }
  }
  private addMarker(template:T.Group) {
    const marker=template.clone(true)
    marker.traverse(obj=>{
      if(obj instanceof T.Mesh) {
        obj.geometry=obj.geometry.clone()
        obj.material=(obj.material as T.Material).clone()
        obj.castShadow=true
      }
    })
    const lod=new T.LOD()
    lod.position.set(this.launch.x-1.84,this.launch.y,this.launch.z-.36)
    lod.addLevel(marker,0)
    const distant=new T.Mesh(this.blockGeometry,this.mat(0xf19a57))
    distant.scale.set(.27,.78,.24)
    distant.position.y=.39
    lod.addLevel(distant,42)
    this.scene.add(lod)
  }
  mat(color: number) {
    if (!this.materials.has(color)) this.materials.set(color,new T.MeshStandardMaterial({color,roughness:.88,flatShading:true}))
    return this.materials.get(color)!
  }
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:number, solid=false) {
    const mesh=new T.Mesh(this.blockGeometry,this.mat(color))
    mesh.position.set(x,y,z); mesh.scale.set(w,h,d)
    mesh.castShadow=mesh.receiveShadow=true
    this.scene.add(mesh)
    if (solid) this.collider(x,y,z,w,h,d)
    return mesh
  }
  private collider(x:number,y:number,z:number,w:number,h:number,d:number) {
    this.world.createCollider(R.ColliderDesc.cuboid(w/2,h/2,d/2).setTranslation(x,y,z)
      .setFriction(this.surface.friction).setRestitution(this.surface.restitution)
      .setCollisionGroups((1<<16)|2))
  }
  private batch(entries: [number,number,number,number,number,number,number][], geometry: T.BufferGeometry = this.blockGeometry, shadow = false) {
    if (!entries.length) return
    const mat = new T.MeshStandardMaterial({color:0xffffff,roughness:.87,flatShading:true})
    const mesh = new T.InstancedMesh(geometry,mat,entries.length)
    entries.forEach(([x,y,z,w,h,d,color],index) => {
      this.dummy.position.set(x,y,z)
      this.dummy.scale.set(w,h,d)
      this.dummy.updateMatrix()
      mesh.setMatrixAt(index,this.dummy.matrix)
      mesh.setColorAt(index,new T.Color(color))
    })
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    this.scene.add(mesh)
  }
  private ground(size:number,y=0) { this.box(0,y-.6,0,size,1.2,size,this.surface.color,true) }
  private rampMark(x:number,y:number,z:number) {
    const marks: [number,number,number,number,number,number,number][] = []
    for(let i=0;i<12;i++) marks.push([x-2.2+i*.4,y+.015,z,.22,.025,.7,i%2===0?0xf29b43:0x323b3b])
    this.batch(marks)
  }
  private tower() {
    const h=startHeight(this.settings), spec=towers[this.settings.tower]
    const house=this.settings.tower==='house'||this.settings.tower==='block'
    const taipei=this.settings.tower==='taipei'
    const width=house?16:taipei?52:62
    const depth=house?13:48
    const facade=house?0xc39572:taipei?0x548c84:0x839ca0
    this.ground(2650)
    this.launch={x:0,y:h,z:depth/2+1.4}
    if (house) {
      this.box(0,h/2,0,width,h,depth,facade,true)
      const details: [number,number,number,number,number,number,number][]=[]
      for(let y=1.9;y<h;y+=3) {
        details.push([0,y-1.5,0,width+.27,.19,depth+.31,0xd6b392])
        for(let x=-6.8;x<7.2;x+=2.25) {
          details.push([x,y,depth/2+.05,1.61,1.36,.12,0x304651],[x,y+.015,depth/2+.13,1.4,1.13,.044,0x557481])
          details.push([x,y-.75,depth/2+.13,1.77,.13,.37,0xd2af89])
        }
        for(let z=-5.1;z<5.8;z+=2.15) {
          details.push([-width/2-.05,y,z,.12,1.31,1.55,0x4e6467],[width/2+.05,y,z,.12,1.31,1.55,0x4e6467])
        }
      }
      this.batch(details)
      this.box(-3.8,h+.56,-3.2,4,1.1,4,0x7b8582,true)
      this.box(0,h+.23,-depth/2,width,.46,.32,0xbc9c80,true)
      this.box(-width/2,h+.23,0,.32,.46,depth,0xbc9c80,true)
      this.box(width/2,h+.23,0,.32,.46,depth,0xbc9c80,true)
      for(const x of [-5.7,5.7]) this.box(x,h+.35,depth/2,4.2,.7,.24,0xd7b294,true)
    } else if (taipei) {
      this.box(0,33,0,width,66,depth,0x6e918d,true)
      for(let i=0;i<8;i++) {
        const y=66+i*44, w=45-i*1.5
        for(let j=0;j<4;j++) this.box(0,y+5.5+j*11,0,w+j*2.1,11,depth-7+j*1.1,facade,true)
        this.box(0,y+43.7,0,w+6.7,1.7,depth-2.9,0xadbbb2)
      }
      this.box(0,438,0,25,40,26,0x758f8a,true)
      this.box(0,481,0,3.7,54,3.7,0xa7b5a9)
    } else {
      for(const x of [-20,20]) this.box(x,116,0,21,232,depth,facade,true)
      this.box(0,95,0,21,190,depth,0x637e88,true)
      this.box(0,252,0,38,132,depth-3,facade,true)
      this.box(0,300,0,27,70,depth-13,0x95a9aa,true)
      this.box(0,333,0,3.3,29,3.3,0xaebbbc)
    }
    if (!house) {
      const fins: [number,number,number,number,number,number,number][]=[]
      for(let y=7;y<spec.total-51;y+=5.5) {
        const z=taipei && y>66 ? (depth-7+Math.min(3,Math.floor(((y-66)%44)/11))*1.1)/2+.07 : depth/2+.13
        const limit=taipei? (y>66?18-Math.floor((y-66)/44)*.55:24) : y>232?17:29
        for(let x=-limit;x<limit;x+=3.6) fins.push([x,y,z,2.5,2.75,.16,0x355762])
      }
      this.batch(fins)
    }
    if(!house) {
      const wall=taipei?13:17.5
      this.box(0,h-.22,(wall+depth/2)/2,3,.44,depth/2-wall+.24,0x4e656a,true)
    }
    this.box(0,h-.19,depth/2+1.15,5.0,.38,2.8,0x4e656a,true)
    this.rampMark(0,h,depth/2+2.10)
    for(const x of [-2.42,2.42]) {
      this.box(x,h+.44,depth/2+1.24,.09,.10,2.66,0xffad5c,true)
      this.box(x,h+.22,depth/2+2.47,.09,.44,.09,0xf27e32,true)
    }
    const road = 0x414e53
    this.box(0,.025,depth/2+17,500,.055,10.8,road)
    this.box(0,.031,depth/2+10.6,430,.063,1.8,0xabb0a1)
    const city: [number,number,number,number,number,number,number][] = []
    for(let i=-23;i<=23;i++) city.push([i*7,.065,depth/2+17,3.1,.015,.105,0xd3c5a3])
    const colors=[0xc0b0a2,0x9cacaa,0xc8bfae,0x809394,0xaf8972]
    for(let row=0;row<8;row++) for(let col=-7;col<=7;col++) {
      const x=col*24+(this.rng()-.5)*9, z=-23-row*31-this.rng()*8
      if (Math.abs(x)<width*.6&&z>-depth*.76-12) continue
      const h2=7+this.rng()**1.65*(house?Math.min(56,12+row*9):145)
      city.push([x,h2/2,z,10+this.rng()*11,h2,12+this.rng()*10,colors[Math.floor(this.rng()*colors.length)]])
    }
    for(const x of [-1,1]) for(let i=1;i<=6;i++) {
      city.push([x*(27+i*17),5+i*2.8,3+i*1.8,13,10+i*5.6,13,colors[i%colors.length]])
    }
    this.batch(city)
    this.trees(90,130,110,18)
  }
  private trees(count:number,w:number,d:number,inner:number) {
    const trunks: [number,number,number,number,number,number,number][]=[], crowns: typeof trunks=[]
    for(let i=0;i<count*qualityPresets[this.settings.quality].scenery;i++) {
      const x=(this.rng()-.5)*w,z=(this.rng()-.5)*d
      if(Math.abs(x)<inner && Math.abs(z)<inner) continue
      const h=2+this.rng()*4
      trunks.push([x,h*.25,z,.43,h*.52,.43,0x665346])
      crowns.push([x,h*.73,z,h*.7,h,h*.73,i%2?0x5c785b:0x455f50])
    }
    this.batch(trunks)
    this.batch(crowns,new T.ConeGeometry(.5,1,6),true)
  }
  private waterfall() {
    this.floor=-5.5
    this.ground(400,this.floor)
    const h=startHeight(this.settings)
    this.launch={x:2.5,y:h,z:-8.5}
    this.box(0,h/2-2.7,-19,31,h+5.4,17,0x5a6560,true)
    const shelves: [number,number,number,number,number,number,number][]=[]
    for(let i=0;i<21;i++) {
      const x=-15+i*1.5
      if(x>-6.7&&x<4.6) continue
      const w=2.6+this.rng()*2.5
      shelves.push([x,h*.38-1,-10.65,w,Math.max(3,h*1.28),2+this.rng()*3.6,[0x576963,0x657368,0x777c6d][i%3]])
      shelves.push([x,h-.6,-13.4,w,2+this.rng()*1.5,4+this.rng()*3.8,0x6d7e5c])
    }
    this.batch(shelves,new T.DodecahedronGeometry(.75,0),true)
    this.box(2.5,h-.23,-9.34,4.7,.46,2.2,0x596d60,true)
    this.rampMark(2.5,h,-8.62)
    for(let i=0;i<40;i++) {
      const side=i%2===0 ? 1 : -1
      const x=side*(16+this.rng()*16), z=(this.rng()-.64)*39
      const size=2+this.rng()*5, y=-1+this.rng()*3
      const rock=new T.Mesh(new T.DodecahedronGeometry(size,0),this.mat(i%3===0?0x667457:0x5d6a64))
      rock.position.set(x,y,z); rock.scale.set(1,.74,1)
      rock.rotation.y=this.rng()*6
      rock.castShadow=true
      this.scene.add(rock)
      this.world.createCollider(R.ColliderDesc.ball(size*.72).setTranslation(x,y,z).setCollisionGroups((1<<16)|2))
    }
    this.trees(175,117,97,25)
    const shader=(water:boolean) => {
      const mat=new T.ShaderMaterial({
        side:T.DoubleSide, transparent:water, depthWrite:!water,
        uniforms:{time:{value:0}, kind:{value:water?1:0}},
        vertexShader:'varying vec2 point; void main(){point=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`varying vec2 point;uniform float time;uniform int kind;
          void main(){vec2 p=point; float n=.5+.5*sin(p.x*83.+sin(p.y*53.+time*5.)*1.5);
          float v=.5+.5*sin(p.y*72.+time*8.+p.x*11.);
          vec3 deep=vec3(.045,.27,.28);vec3 foam=vec3(.75,.89,.85);
          float ribbons=.5+.5*sin(p.x*285.+sin(p.x*58.+p.y*16.+time*2.)*1.9);
          float sheet=mix(n,pow(ribbons,3.),.65)*(.61+v*.39);
          float f=kind==1 ? smoothstep(.70,.98,sin(p.x*95.+p.y*140.+time*2.)*.26+sin(p.y*100.-time*3.)*.28+.47)*.39 : sheet*.57+pow(1.-p.y,5.)*.29;
          gl_FragColor=vec4(mix(deep,foam,f+(kind==1?.08:.23)),kind==1?.67:1.);
          #include <colorspace_fragment>
          }`,
      })
      this.shaders.push(mat)
      return mat
    }
    const pool=new T.Mesh(new T.PlaneGeometry(120,95),shader(true))
    pool.rotation.x=-Math.PI/2; pool.position.z=7
    this.scene.add(pool)
    const sheet=new T.Mesh(new T.PlaneGeometry(6,h+.7,1,1),shader(false))
    sheet.position.set(-3,h/2-.1,-10.42)
    this.scene.add(sheet)
    for(let i=0;i<8;i++) {
      const rim=new T.Mesh(new T.DodecahedronGeometry(1.8+this.rng()*1.2),this.mat(0x738783))
      rim.position.set(-7+i*1.22,-.1+this.rng()*.18,-11+this.rng()*1.4)
      rim.scale.y=.36
      this.scene.add(rim)
    }
  }
  private airfield() {
    this.ground(24000)
    this.launch={ x:0, y:startHeight(this.settings), z:0 }
    this.box(0,.035,0,23,.07,530,0x444d54)
    const fields: [number,number,number,number,number,number,number][]=[]
    for (let i=-17;i<=17;i++) fields.push([0,.083,i*14, .25,.02,7.0,0xf2ecda])
    for(let i=0;i<80;i++) {
      const side=i%2===0?1:-1
      fields.push([side*(30+this.rng()*460),.03,(this.rng()-.5)*950,18+this.rng()*34,.045,25+this.rng()*90,[0x82936b,0x9ba775,0xaea379][i%3]])
    }
    this.batch(fields)
    this.box(0,this.launch.y-.28,-3,7,.56,7,0x57727b,true)
    this.rampMark(0,this.launch.y,-.15)
    this.box(0,this.launch.y+.8,-5.4,6.7,1.6,.3,0x425c6b,true)
    for (const x of [-3.35,3.35]) this.box(x,this.launch.y+.55,-3,.08,1.12,6.75,0xfda34d,true)
    const clouds: [number,number,number,number,number,number,number][]=[]
    for(let i=0;i<125*qualityPresets[this.settings.quality].scenery;i++) {
      clouds.push([(this.rng()-.5)*1350,150+this.rng()*500,(this.rng()-.5)*1350,28+this.rng()*95,7+this.rng()*14,22+this.rng()*45,0xe8ebdf])
    }
    this.batch(clouds,new T.IcosahedronGeometry(.5,0))
    this.trees(115,680,800,28)
  }
  containsWater(p: Vec) { return this.settings.mode==='falls' && Math.abs(p.x)<59 && p.z>-39 && p.z<53 }
  cameraUpdate(camera: T.PerspectiveCamera, target: T.Vector3, time:number) {
    this.sky.position.copy(camera.position)
    const under=this.containsWater(camera.position)&&camera.position.y<-.06
    this.sky.material.uniforms.zenith.value=under?this.submergedZenith:this.zenith
    this.sky.material.uniforms.horizon.value=under?this.submergedHorizon:this.horizon
    this.sun.position.set(target.x-23,target.y+29,target.z+16)
    this.sun.target.position.copy(target)
    for(const shader of this.shaders) shader.uniforms.time.value=time
    if(this.rain) {
      const p=this.rain.geometry.attributes.position
      for(let i=0;i<p.count;i++) p.setY(i,17-((i*3.615+time*17)%34))
      p.needsUpdate=true
      this.rain.position.copy(camera.position)
    }
  }
}

