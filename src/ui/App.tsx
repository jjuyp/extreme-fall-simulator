import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type ReactNode } from 'react'
import { fallHeights, skyHeights, startHeight, towers, surfaces, weatherProfiles, qualityPresets, stateLabels, chuteLabels, type Settings, type Mode } from '../game/config'
import { useGame } from '../game/store'
import type { Game } from '../game/game'

const modeInfo = {
  tower: { label:'高樓墜落', icon:'▥', backdrop:'城市試驗場' },
  falls: { label:'瀑布跳水', icon:'≋', backdrop:'溪谷試驗場' },
  sky: { label:'高空跳傘', icon:'◠', backdrop:'飛行試驗場' },
}
let lastGameTouch={time:-Infinity,x:0,y:0}
function GameButton({onPress,...props}: Omit<ButtonHTMLAttributes<HTMLButtonElement>,'onClick'> & {onPress:()=>void}) {
  const contact=useRef<{id:number;x:number;y:number}|null>(null)
  return <button {...props} onPointerDown={e=>{
    if(e.pointerType==='touch')contact.current={id:e.pointerId,x:e.clientX,y:e.clientY}
  }} onPointerCancel={()=>{contact.current=null}} onPointerUp={e=>{
    const start=contact.current
    contact.current=null
    if(!start||start.id!==e.pointerId||Math.hypot(e.clientX-start.x,e.clientY-start.y)>12)return
    if(!e.currentTarget.contains(document.elementFromPoint(e.clientX,e.clientY)))return
    lastGameTouch={time:performance.now(),x:e.clientX,y:e.clientY}
    onPress()
  }} onClick={e=>{
    const {time,x,y}=lastGameTouch
    const repeatedTouch=performance.now()-time<650 && Math.hypot(e.clientX-x,e.clientY-y)<28
    if(e.detail===0||!repeatedTouch)onPress()
  }}/>
}
function Label({ children, value }: { children: ReactNode; value?: ReactNode }) {
  return <span className="field-label"><span>{children}</span>{value && <strong>{value}</strong>}</span>
}
function Choices<T extends string>({ name, value, options, onChange }: {
  name:string; value:T; options:{id:T;label:string}[]; onChange:(value:T)=>void
}) {
  return <div className="choices" role="group" aria-label={name}>
    {options.map(option => <button key={option.id} aria-pressed={value===option.id}
      onClick={() => onChange(option.id)}>{option.label}</button>)}
  </div>
}
function Select<T extends string | number>({ name, value, options, onChange }: {
  name:string; value:T; options:{id:T;label:string}[]; onChange:(value:T)=>void
}) {
  return <label className="field"><Label>{name}</Label>
    <select aria-label={name} value={value} onChange={e => {
      const option=options.find(o => String(o.id)===e.target.value)
      if(option) onChange(option.id)
    }}>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
  </label>
}
function Range({ name, value, min, max, unit, onChange }: {
  name:string; value:number; min:number; max:number; unit:string; onChange:(value:number)=>void
}) {
  return <label className="field">
    <Label value={`${value} ${unit}`}>{name}</Label>
    <input type="range" min={min} max={max} value={value} onChange={e => onChange(e.target.valueAsNumber)} />
  </label>
}
function Menu({ game }: { game:Game | null }) {
  const settings=useGame(s => s.settings)
  const ready=useGame(s => s.ready)
  const [advanced, showAdvanced]=useState(false)
  const set=<K extends keyof Settings>(name:K,value:Settings[K]) => game?.select({...settings,[name]:value})
  const mode=modeInfo[settings.mode]
  const height=startHeight(settings)
  return <section className="menu panel">
    <div className="title">
      <div className="eyebrow"><span className="status-dot" /> {mode.backdrop}</div>
      <h1>EXTREME<br/>{' '}FALL <em>SIMULATOR</em></h1>
      <p>配置條件，觀察墜落、入水與傘降的物理表現。</p>
    </div>
    <div className="mode-tabs" role="group" aria-label="遊戲模式">
      {(Object.keys(modeInfo) as Mode[]).map(id => <button key={id} aria-pressed={settings.mode===id}
        onClick={() => set('mode',id)}><b aria-hidden>{modeInfo[id].icon}</b><span>{modeInfo[id].label}</span></button>)}
    </div>
    <div className="fields">
      {settings.mode==='tower'&&<Select name="場景" value={settings.tower} onChange={v=>set('tower',v)}
        options={(Object.keys(towers) as Settings['tower'][]).map(id=>({id,label:towers[id].name}))}/>}
      {settings.mode==='falls'&&<Select name="跳水高度" value={settings.fallsHeight} onChange={v=>set('fallsHeight',v)}
        options={fallHeights.map(id=>({id,label:`${id} 公尺`}))}/>}
      {settings.mode==='sky'&&<div className="field-row">
        <Select name="離地高度" value={settings.skyHeight} onChange={v=>set('skyHeight',v)} options={skyHeights.map(id=>({id,label:`${id.toLocaleString()} ft`}))}/>
        <Select name="傘具情境" value={settings.chute} onChange={v=>set('chute',v)}
          options={[{id:'normal',label:'正常開傘'},{id:'none',label:'未開傘'},{id:'fault',label:'傘具故障'}]}/>
      </div>}
      <div className="height-card">
        <span>{settings.mode==='sky'?'離地高度 AGL':settings.mode==='falls'?'距水面':'起始平台'}</span>
        <strong>{Number(height.toFixed(1)).toLocaleString()} <small>m</small></strong>
        {settings.mode==='tower'&&<span>建築 {towers[settings.tower].total} m</span>}
      </div>
      <div className="field"><Label>天氣</Label>
        <Choices name="天氣" value={settings.weather} onChange={v=>set('weather',v)}
          options={(Object.keys(weatherProfiles) as Settings['weather'][]).map(id=>({id,label:weatherProfiles[id].label}))}/>
      </div>
      <button className="settings-toggle" onClick={()=>showAdvanced(!advanced)} aria-expanded={advanced}>
        <span><b aria-hidden>⚙</b> 沙盒設定</span><span aria-hidden>{advanced?'−':'+'}</span>
      </button>
      {advanced&&<div className="advanced">
        <Range name="人物質量" min={40} max={135} unit="kg" value={settings.mass} onChange={v=>set('mass',v)}/>
        <Range name="基礎風速" min={0} max={35} unit="m/s" value={settings.wind} onChange={v=>set('wind',v)}/>
        <Range name="風向" min={0} max={359} unit="°" value={settings.direction} onChange={v=>set('direction',v)}/>
        <div className="field-row">
          <Select name="地面材質" value={settings.surface} onChange={v=>set('surface',v)}
            options={(Object.keys(surfaces) as Settings['surface'][]).map(id=>({id,label:surfaces[id].label}))}/>
          <Select name="畫質" value={settings.quality} onChange={v=>set('quality',v)}
            options={(Object.keys(qualityPresets) as Settings['quality'][]).map(id=>({id,label:qualityPresets[id].label}))}/>
        </div>
        <div className="field"><Label>血液特效</Label><Choices name="血液特效" value={settings.blood} onChange={v=>set('blood',v)}
          options={[{id:'low',label:'低'},{id:'medium',label:'中'},{id:'high',label:'高'}]}/></div>
        <Range name="音效音量" min={0} max={100} unit="%" value={Math.round(settings.volume*100)} onChange={v=>set('volume',v/100)}/>
      </div>}
      {settings.mode==='sky'&&<p className="notice">{settings.skyHeight<=2000?'低高度會縮短故障時的應變時間。':''}此遊戲僅供虛擬體驗，請勿作為真實跳傘操作指引。</p>}
    </div>
    <div className="menu-actions">
      <GameButton className="primary" disabled={!ready} onPress={()=>game?.action('start')}>
        <span>{ready?'開始模擬':'載入物理引擎…'}</span><kbd>SPACE</kbd><span aria-hidden>↗</span>
      </GameButton>
    </div>
  </section>
}
function Hud({ game }: { game:Game|null }) {
  const settings=useGame(s=>s.settings)
  const telemetry=useGame(s=>s.telemetry)
  const first=useGame(s=>s.firstPerson)
  const playing=useGame(s=>s.screen)==='play'
  const altitude=Math.max(0,Math.min(100,100*(1-telemetry.height/startHeight(settings))))
  return <>
    <section className="telemetry panel" aria-label="即時數據">
      <div className="telemetry-head"><span className="status-dot"/><span>{stateLabels[telemetry.actor]}</span>
        {telemetry.fps>0&&<small>{telemetry.fps} FPS</small>}</div>
      <div className="metric-grid">
        {[
          ['高度',telemetry.height,'m'],['速度',telemetry.speed,'m/s'],
          ['加速度',telemetry.acceleration,'m/s²'],['風速',telemetry.wind,'m/s'],
        ].map(([label,value,unit])=><div className="metric" key={label}><span>{label}</span>
          <strong>{Number(value).toFixed(1)} <small>{unit}</small></strong></div>)}
      </div>
      {settings.mode==='sky'&&<div className="chute-state">傘具 <b>{chuteLabels[telemetry.chute]}</b></div>}
    </section>
    <div className="altitude-scale" aria-hidden="true"><i style={{top:`${altitude}%`}}/></div>
    <nav className="game-tools" aria-label="遊戲控制">
      <GameButton onPress={()=>game?.action('view')}><span aria-hidden>⌾</span> {first?'第一人稱':'第三人稱'} <kbd>V</kbd></GameButton>
      {playing&&<GameButton onPress={()=>game?.action('pause')}><span aria-hidden>Ⅱ</span> 暫停 <kbd>ESC</kbd></GameButton>}
      {playing&&<GameButton onPress={()=>game?.action('retry')}><span aria-hidden>↻</span> 重試 <kbd>R</kbd></GameButton>}
    </nav>
    {playing&&settings.mode==='sky'&&settings.chute!=='none'&&telemetry.chute==='packed'&&telemetry.actor==='Falling'&&
      <GameButton className="primary deploy" onPress={()=>game?.action('chute')}>開傘 <kbd>E</kbd></GameButton>}
  </>
}
function Stick({ game }: { game:Game|null }) {
  const [knob,setKnob]=useState({x:0,y:0})
  const pointer=useRef<number|null>(null)
  const update=(e:PointerEvent<HTMLDivElement>)=>{
    const r=e.currentTarget.getBoundingClientRect()
    const x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2
    const scale=Math.max(34,Math.hypot(x,y))
    if(game) game.input.joystick={ x:x/scale,y:-y/scale }
    setKnob({x:31*x/scale,y:31*y/scale})
  }
  const end=()=>{
    pointer.current=null
    if(game) game.input.joystick={x:0,y:0}
    setKnob({x:0,y:0})
  }
  useEffect(()=>()=>{ if(game) game.input.joystick={x:0,y:0} },[game])
  return <div className="stick" aria-label="移動搖桿" onPointerDown={e=>{
    if(pointer.current!==null)return
    pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);update(e)
  }} onPointerMove={e=>{if(pointer.current===e.pointerId)update(e)}} onLostPointerCapture={end}>
    <i style={{transform:`translate(${knob.x}px,${knob.y}px)`}}/>
  </div>
}
export function App() {
  const host=useRef<HTMLDivElement>(null)
  const [game,setGame]=useState<Game|null>(null)
  const screen=useGame(s=>s.screen), paused=useGame(s=>s.paused), error=useGame(s=>s.error)
  const settings=useGame(s=>s.settings), outcome=useGame(s=>s.outcome)
  useEffect(()=>{
    let stale=false, instance:Game|undefined
    void import('../game/game').then(async ({Game,initializePhysics,loadMarker})=>{
      const [,marker]=await Promise.all([initializePhysics(),loadMarker()])
      if(stale||!host.current)return
      instance=new Game(host.current,marker)
      setGame(instance)
      useGame.setState({ready:true})
    }).catch((reason:unknown)=>{
      if(!stale)useGame.setState({error:`無法啟動 3D 場景：${reason instanceof Error?reason.message:String(reason)}`})
    })
    return ()=>{stale=true;instance?.dispose()}
  },[])
  return <main className={`app ${screen}`}>
    <div ref={host} className="stage" />
    <div className="vignette" />
    <header className="topbar">
      <div className="brand"><svg aria-hidden="true" viewBox="0 0 34 34"><path d="M5 6h9l3 5 3-5h9L17 28Z" fill="currentColor"/><path d="M14 14h6l-3 5Z" fill="#0e1b20"/></svg>
        <span>墜落物理沙盒</span></div>
      <span className="top-mode">{modeInfo[settings.mode].label}</span>
    </header>
    <Hud game={game}/>
    {screen==='menu'&&<Menu game={game}/>}
    {screen==='play'&&!paused&&<Stick game={game}/>}
    {paused&&<div className="modal-wrap"><section className="dialog panel" role="dialog" aria-modal="true" aria-label="遊戲暫停">
      <h2>模擬已暫停</h2>
      <div className="dialog-actions">
        <GameButton className="primary" onPress={()=>game?.action('pause')}>繼續模擬</GameButton>
        <GameButton onPress={()=>game?.menu()}>返回主選單</GameButton>
      </div>
    </section></div>}
    {outcome&&screen==='result'&&<div className="modal-wrap result-wrap"><section className="dialog panel" aria-label="模擬結果">
      <div className="eyebrow">模擬結果</div>
      <h2>{stateLabels[outcome.state]}</h2>
      <dl><dt>最高速度</dt><dd>{outcome.peak.toFixed(1)} m/s</dd>
        <dt>受損部位</dt><dd>{outcome.parts.join('、') || '無'}</dd>
        <dt>肢體分離</dt><dd>{outcome.separated.join('、') || '未觸發'}</dd></dl>
      <p className="notice">傷害與死亡依沙盒遊戲規則判定，無醫療預測用途。</p>
      <div className="dialog-actions">
        <GameButton className="primary" onPress={()=>game?.action('retry')}>重新開始 <kbd>R</kbd></GameButton>
        <GameButton onPress={()=>game?.menu()}>返回主選單</GameButton>
      </div>
    </section></div>}
    {error&&<section className="error panel" role="alert"><p>{error}</p><button onClick={()=>location.reload()}>重新載入</button></section>}
    <footer className="legend"><span><kbd>WASD</kbd> 移動</span><span>拖曳視角</span><span><kbd>V</kbd> 切換視角</span></footer>
  </main>
}

