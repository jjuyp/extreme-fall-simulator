const cues = {
  launch:    { duration: .24, cutoff: 720,  noise: .52, pitch: 165, end: 72, tone: .30 },
  deploy:    { duration: .43, cutoff: 2400, noise: .74, pitch: 0,   end: 0,  tone: 0 },
  canopy:    { duration: .22, cutoff: 920,  noise: .55, pitch: 144, end: 66, tone: .26 },
  fault:     { duration: .39, cutoff: 460,  noise: .60, pitch: 118, end: 47, tone: .20 },
  splash:    { duration: .68, cutoff: 2700, noise: .95, pitch: 105, end: 39, tone: .20 },
  collision: { duration: .24, cutoff: 1050, noise: .64, pitch: 135, end: 47, tone: .46 },
  landing:   { duration: .29, cutoff: 610,  noise: .65, pitch: 105, end: 37, tone: .55 },
} as const

export class GameAudio {
  private context?: AudioContext
  private master?: GainNode
  private ambience?: { gain: GainNode; filter: BiquadFilterNode }
  private noise?: AudioBuffer
  private readonly active = new Set<AudioScheduledSourceNode>()

  unlock(volume: number) {
    if (volume<=0) return
    try {
      const Audio = window.AudioContext ?? (window as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext
      if (!Audio) return
      const context=this.context ??= new Audio()
      if(context.state!=='running') void context.resume().catch(()=>{})
      if(this.master) return

      const master=this.master=context.createGain()
      master.gain.value=0
      master.connect(context.destination)
      const noise=this.noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate)
      const data=noise.getChannelData(0)
      for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1
      const loop=context.createBufferSource()
      loop.buffer=noise
      loop.loop=true
      const filter=context.createBiquadFilter()
      filter.frequency.value=640
      const gain=context.createGain()
      gain.gain.value=0
      loop.connect(filter).connect(gain).connect(master)
      loop.start()
      this.ambience={gain,filter}
    } catch { /* The game can run without an audio device. */ }
  }

  update(volume: number, speed: number, canopy: boolean, water: boolean, moving: boolean) {
    if(!this.context || !this.master || !this.ambience) return
    const now=this.context.currentTime
    const wind=Math.min(1,Math.abs(speed)/46)
    this.master.gain.setTargetAtTime(volume,now,.018)
    this.ambience.gain.gain.setTargetAtTime(moving ? (water?.36:canopy?.26:.23+wind*.45):0,now,.08)
    this.ambience.filter.frequency.setTargetAtTime(water?440:canopy?720:750+wind*2600,now,.08)
  }

  cue(name: keyof typeof cues, strength=1) {
    const ctx=this.context, master=this.master, noise=this.noise
    if(!ctx || !master || !noise || document.hidden) return
    const {duration,cutoff,noise:noiseLevel,pitch,end,tone}=cues[name]
    const now=ctx.currentTime
    const envelope=ctx.createGain()
    envelope.gain.setValueAtTime(0,now)
    envelope.gain.linearRampToValueAtTime(strength,now+.014)
    envelope.gain.exponentialRampToValueAtTime(.001,now+duration)
    envelope.connect(master)

    const filter=ctx.createBiquadFilter()
    filter.frequency.setValueAtTime(cutoff,now)
    filter.frequency.exponentialRampToValueAtTime(Math.max(130,cutoff*.38),now+duration)
    const hiss=ctx.createBufferSource()
    hiss.buffer=noise
    const hissLevel=ctx.createGain()
    hissLevel.gain.value=noiseLevel
    hiss.connect(filter).connect(hissLevel).connect(envelope)
    this.play(hiss,now,duration)
    if(pitch>0) {
      const thud=ctx.createOscillator()
      thud.frequency.setValueAtTime(pitch,now)
      thud.frequency.exponentialRampToValueAtTime(end,now+duration)
      const toneLevel=ctx.createGain()
      toneLevel.gain.value=tone
      thud.connect(toneLevel).connect(envelope)
      this.play(thud,now,duration)
    }
  }

  private play(source: AudioScheduledSourceNode, now: number, duration: number) {
    this.active.add(source)
    source.onended=()=>{
      this.active.delete(source)
      source.disconnect()
    }
    source.start(now)
    source.stop(now+duration)
  }

  silence() {
    for(const source of this.active) {
      source.stop()
      source.disconnect()
    }
    this.active.clear()
    this.update(0,0,false,false,false)
  }

  dispose() {
    this.silence()
    if(this.context) void this.context.close().catch(()=>{})
  }
}
