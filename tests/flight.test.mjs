import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

test('all heights reach a result at minimum, standard and maximum mass', {timeout:240_000}, async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0}})
  let browser
  try {
    await server.listen()
    const port=server.httpServer.address().port
    const url=`http://127.0.0.1:${port}/`
    const executablePath=process.env.FALL_CHROME
    browser=await chromium.launch(executablePath?{executablePath}:{channel:'chrome'})
    const page=await browser.newPage({viewport:{width:1280,height:800}})
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
    await page.goto(url)
    await page.getByRole('button',{name:'開始模擬'}).click({timeout:18_000})
    await page.getByText('自由落體',{exact:true}).waitFor({timeout:8_000})
    await page.route('**/verification.html',route=>route.fulfill({
      contentType:'text/html',body:'<!DOCTYPE html><link rel="icon" href="data:,"><div id="host" style="width:640px;height:480px"></div>',
    }))
    await page.goto(url+'verification.html')
    const results=await page.evaluate(async()=>{
      const {Game,initializePhysics,loadMarker}=await import('/src/game/game.ts')
      const {useGame}=await import('/src/game/store.ts')
      const {defaults,towers,fallHeights,skyHeights,startHeight}=await import('/src/game/config.ts')
      const [,marker]=await Promise.all([initializePhysics(),loadMarker()])
      const game=new Game(document.getElementById('host'),marker)
      cancelAnimationFrame(game.frame)
      const results=[]
      try {
        const cases=[
          ...Object.keys(towers).map(tower=>({mode:'tower',tower})),
          ...fallHeights.map(fallsHeight=>({mode:'falls',fallsHeight})),
          ...skyHeights.flatMap(skyHeight=>['normal','fault','none'].map(chute=>({mode:'sky',skyHeight,chute}))),
        ]
        for(const mass of [40,75,135]) for(const scenario of cases){
          const settings={...defaults,...scenario,quality:'low',volume:0}
          game.load(settings)
          game.select({...settings,mass})
          game.physics()
          game.action('start')
          const totalMass=[...game.actor.parts.values()].reduce((sum,part)=>sum+part.rigid.mass(),0)
          if(Math.abs(totalMass-mass)>.01)throw new Error(JSON.stringify(scenario)+' mass '+totalMass)
          let entrySpeed
          try {
            for(let i=0;i<15000 && useGame.getState().screen!=='result';i++){
              if(i===100 && scenario.mode==='sky')game.action('chute')
              const waterBefore=game.enteredWater
              const approach=scenario.mode!=='falls'||waterBefore>=0?0:Math.max(...[...game.actor.parts.values()].map(part=>-part.rigid.linvel().y))
              game.physics()
              if(waterBefore<0 && game.enteredWater>=0)entrySpeed=approach
              const y=game.actor.chest.rigid.translation().y
              if(!Number.isFinite(y)||y>startHeight(settings)+3)throw new Error('unstable position '+y)
            }
            const {screen,outcome,telemetry}=useGame.getState()
            if(screen!=='result'||!outcome)throw new Error('unfinished at '+JSON.stringify(game.actor.chest.rigid.translation()))
            if(scenario.mode==='falls'){
              if(game.enteredWater<0)throw new Error('missed water')
              if(scenario.fallsHeight===4 && (outcome.state!=='Swimming'||entrySpeed<7.7||entrySpeed>9.5))
                throw new Error(outcome.state+' at '+entrySpeed+' m/s')
            } else if(game.actor.chest.rigid.translation().y>2 && game.stationaryTime<1.65)throw new Error('ended above ground at '+JSON.stringify(game.actor.chest.rigid.translation()))
            if(scenario.mode==='sky' && telemetry.chute!==({normal:'open',fault:'failed',none:'packed'})[scenario.chute])throw new Error('canopy')
            if(scenario.chute==='normal' && (outcome.state!=='Landed'||outcome.separated.length||outcome.landing?.chute!=='open'||outcome.landing.vertical>7))
              throw new Error('normal landing '+JSON.stringify(outcome))
            results.push({scenario,mass,state:outcome.state,landing:outcome.landing})
          }catch(e){throw new Error(JSON.stringify({...scenario,mass,time:game.time})+' '+e.message)}
        }
        const wallSteps=[]
        for(const mass of [40,75,135]){
          const settings={...defaults,mode:'tower',tower:'block',mass,wind:0,quality:'low',volume:0}
          game.load(settings)
          game.action('start')
          for(let i=0;i<55;i++)game.physics()
          for(const {rigid} of game.actor.parts.values()) {
            const velocity=rigid.linvel()
            rigid.setLinvel({...velocity,z:-15},true)
          }
          game.input.yaw=Math.PI
          let contacts=0
          const wound=game.wound
          game.wound=function(part, score, position){
            if(position.y>3 && position.y<25)contacts++
            wound.call(this,part,score,position)
          }
          const timings=[]
          for(let i=0;i<360 && useGame.getState().screen!=='result';i++){
            const start=performance.now()
            game.physics()
            game.updateCamera(1/60,false,false)
            timings.push(performance.now()-start)
          }
          game.wound=wound
          if(!contacts || useGame.getState().screen!=='result')throw new Error('Wall collision case failed at '+mass+' kg')
          timings.sort((a,b)=>a-b)
          wallSteps.push({mass,contacts,p95:timings[Math.floor(timings.length*.95)]})
        }
        const settings={...defaults,mode:'sky',skyHeight:1600,chute:'normal',quality:'low',volume:0}
        game.load(settings)
        game.action('start')
        let deployedLate=false
        for(let i=0;i<3000 && useGame.getState().screen!=='result';i++){
          if(!deployedLate && game.actor.chest.rigid.translation().y<12){
            game.action('chute')
            deployedLate=true
          }
          game.physics()
        }
        const late=useGame.getState().outcome
        if(!deployedLate || late?.state!=='Dead' || late.landing?.chute!=='opening' || late.landing.vertical<12)
          throw new Error('late opening '+JSON.stringify(late))
        return {results,wallSteps,late:late.landing}
      } finally {
        game.dispose()
      }
    })
    assert.equal(results.results.length,63)
    const normal=results.results.filter(r=>r.scenario.chute==='normal')
    console.log('Normal touchdown vertical, m/s:',normal.map(r=>r.landing.vertical.toFixed(2)).join(', '))
    console.log('Late opening:',results.late)
    console.log('63 complete trajectories and wall regression:',results.wallSteps)
    assert.deepEqual(errors,[])
  } finally {
    await browser?.close()
    await server.close()
  }
})

