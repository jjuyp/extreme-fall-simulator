import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

test('all low-altitude sky scenarios finish on terrain', {timeout:60_000}, async()=>{
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
      const {defaults}=await import('/src/game/config.ts')
      const [,marker]=await Promise.all([initializePhysics(),loadMarker()])
      const game=new Game(document.getElementById('host'),marker)
      cancelAnimationFrame(game.frame)
      const results=[]
      try {
        for(const chute of ['normal','fault','none']){
          const settings={...defaults,mode:'sky',skyHeight:1600,chute,quality:'low',volume:0}
          useGame.setState({settings})
          game.load(settings)
          game.action('start')
          try {
            for(let i=0;i<60;i++)game.physics()
            game.action('chute')
            for(let i=60;i<8400 && useGame.getState().screen!=='result';i++)game.physics()
          } catch(error) {
            const p=game.actor.chest.rigid.translation()
            throw new Error(`${chute}, t=${game.time.toFixed(2)}, y=${p.y.toFixed(2)}: ${error.message}`)
          }
          const {outcome,telemetry,screen}=useGame.getState()
          const altitude=game.actor.chest.rigid.translation().y
          results.push({chute,altitude,screen,time:game.time,outcome,flightState:telemetry.chute})
        }
      } finally {
        game.dispose()
      }
      return results
    })
    for(const [result,state] of results.map((result,i)=>[result,['open','failed','packed'][i]])){
      console.log(`${result.chute}: ${result.time.toFixed(1)} s, ${result.altitude.toFixed(2)} m above terrain, ${result.flightState}`)
      assert.equal(result.screen,'result',JSON.stringify(result))
      assert.ok(result.altitude>=-.05 && result.altitude<2,JSON.stringify(result))
      assert.equal(result.flightState,state)
    }
    assert.deepEqual(errors,[])
  } finally {
    await browser?.close()
    await server.close()
  }
})

