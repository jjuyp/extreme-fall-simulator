import { test, expect, type Locator, type Page } from '@playwright/test'

async function monitorAudio(page: Page) {
  await page.addInitScript(() => {
    const createGain=AudioContext.prototype.createGain
    let output: AnalyserNode | undefined
    AudioContext.prototype.createGain=function(){
      const gain=createGain.call(this)
      if(!output){
        output=this.createAnalyser()
        gain.connect(output)
      }
      return gain
    }
    Object.assign(window,{fallAudioRms:()=>{
      if(!output || output.context.state!=='running') return 0
      const samples=new Float32Array(output.fftSize)
      output.getFloatTimeDomainData(samples)
      return Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length)
    }})
  })
  return () => page.evaluate(()=>(window as Window & {fallAudioRms:()=>number}).fallAudioRms())
}

test('12 m desktop run, pause, impact, retry and menu',async ({page},info)=>{
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  page.on('response',r=>{if(!r.ok())errors.push(`${r.status()} ${r.url()}`)})
  const audio=await monitorAudio(page)
  const marker=page.waitForResponse(r=>r.url().endsWith('/platform-marker.glb'))
  await page.goto('./')
  const launch=page.getByRole('button',{name:'開始模擬'})
  await expect(launch).toBeEnabled()
  expect((await marker).ok()).toBe(true)
  await expect(page.locator('.metric').first()).toContainText('12.0')
  await expect(page.locator('.telemetry-head small')).toBeVisible()
  console.log('desktop',await page.locator('.telemetry-head small').innerText())
  await page.screenshot({path:info.outputPath('desktop.png'),animations:'disabled'})
  expect(await audio()).toBe(0)
  await page.keyboard.press('Space')
  await expect.poll(audio).toBeGreaterThan(.006)
  await expect(page.getByText('自由落體',{exact:true})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(audio).toBeLessThan(.0005)
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyV')
  await expect(page.getByRole('button',{name:'第一人稱'})).toBeVisible()
  await page.keyboard.press('KeyV')
  const result=page.getByRole('region',{name:'模擬結果'})
  await expect(result).toBeVisible({timeout:18_000})
  console.log(await result.innerText())
  await expect(result.locator('dl')).toContainText('受損部位')
  await expect(result.locator('dd').nth(1)).not.toHaveText('無')
  await expect(result.locator('dd').nth(2)).not.toHaveText('未觸發')
  await page.screenshot({path:info.outputPath('impact.png'),animations:'disabled'})
  const cdp=await page.context().newCDPSession(page)
  async function heapUsed(){
    await cdp.send('HeapProfiler.collectGarbage')
    return (await cdp.send('Runtime.getHeapUsage')).usedSize
  }
  const heapBefore=await heapUsed()
  for(let i=0;i<12;i++){
    await page.keyboard.press('KeyR')
    await expect(page.getByText('自由落體',{exact:true})).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(1)
  }
  const heapAfter=await heapUsed()
  expect(heapAfter-heapBefore).toBeLessThan(8_000_000)
  console.log('12 resets, JS heap delta',heapAfter-heapBefore,'bytes')
  await cdp.detach()
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'返回主選單'}).click()
  await expect(launch).toBeEnabled()
  expect(errors).toEqual([])
})

test('all locations and heights, water transition and parachute scenarios',async ({page},info)=>{
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.goto('./')
  const launch=page.getByRole('button',{name:'開始模擬'})
  await expect(launch).toBeEnabled()
  for(const [id,height] of [['house',12],['block',30],['kaohsiung',320],['taipei',449]] as const){
    await page.getByRole('combobox',{name:'場景',exact:true}).selectOption(id)
    await expect(page.locator('.metric').first()).toContainText(height.toFixed(1))
  }
  await page.getByRole('button',{name:'瀑布跳水'}).click()
  for(const height of [6,12,18,24,4]){
    await page.getByLabel('跳水高度').selectOption(String(height))
    await expect(page.locator('.metric').first()).toContainText(height.toFixed(1))
  }
  await page.screenshot({path:info.outputPath('waterfall.png')})
  await launch.click()
  await expect(page.getByText('水中',{exact:true})).toBeVisible({timeout:12_000})
  await page.getByRole('button',{name:'暫停'}).click()
  await page.getByRole('button',{name:'返回主選單'}).click()
  await page.getByRole('button',{name:'高空跳傘'}).click()
  for(const height of [1600,2000,2500,3000]){
    await page.getByRole('combobox',{name:'離地高度',exact:true}).selectOption(String(height))
    await expect(page.locator('.metric').first()).toContainText((height*.3048).toFixed(1))
  }
  for(const [scenario,label] of [['normal','已展開'],['fault','故障'],['none','收合']]){
    await page.getByLabel('傘具情境').selectOption(scenario)
    await launch.click()
    if(scenario==='none') {
      await page.keyboard.press('KeyE')
      await expect(page.getByRole('button',{name:'開傘'})).toHaveCount(0)
    } else {
      await page.getByRole('button',{name:'開傘'}).click()
      await expect(page.getByText('展開中',{exact:true})).toBeVisible()
    }
    await expect(page.locator('.chute-state b')).toHaveText(label,{timeout:12_000})
    if(scenario==='normal') {
      await expect(page.getByText('傘下降',{exact:true})).toBeVisible()
      await page.waitForTimeout(350)
      await expect(page.getByRole('region',{name:'模擬結果'})).toHaveCount(0)
      await page.screenshot({path:info.outputPath('parachute.png')})
    }
    await page.getByRole('button',{name:'暫停'}).click()
    await page.getByRole('button',{name:'返回主選單'}).click()
  }
  expect(errors).toEqual([])
})

test.describe('390px touch',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
  test('touch viewport, camera drag, joystick and retry',async ({page},info)=>{
    const audio=await monitorAudio(page)
    await page.goto('./')
    const launch=page.getByRole('button',{name:'開始模擬'})
    await expect(launch).toBeEnabled()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390)
    await expect(page.locator('.telemetry-head small')).toBeVisible()
    console.log('390px',await page.locator('.telemetry-head small').innerText())
    await page.screenshot({path:info.outputPath('mobile.png'),animations:'disabled'})
    await page.getByRole('button',{name:'高空跳傘'}).tap()
    const startBox=(await launch.boundingBox())!
    await page.touchscreen.tap(startBox.x+startBox.width/2,startBox.y+startBox.height/2)
    await expect.poll(audio).toBeGreaterThan(.006)
    await expect(page.getByRole('button',{name:'第三人稱'})).toBeVisible()
    const stick=page.locator('.stick')
    await expect(stick).toBeVisible()
    const rect=(await stick.boundingBox())!
    const cdp=await page.context().newCDPSession(page)
    async function swipe(x:number,y:number,x2:number,y2:number,during?:()=>Promise<void>){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x2,y:y2}]})
      await during?.()
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    }
    await swipe(rect.x+45,rect.y+45,rect.x+72,rect.y+31,async()=>{
      await expect(stick.locator('i')).not.toHaveAttribute('style',/translate\(0px, 0px\)/)
    })
    await expect(stick.locator('i')).toHaveAttribute('style',/translate\(0px, 0px\)/)
    await swipe(180,270,239,310)
    await cdp.detach()
    async function touchControl(button:Locator){
      await expect(button).toBeVisible()
      const box=(await button.boundingBox())!
      await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2)
    }
    await touchControl(page.getByRole('button',{name:'第三人稱'}))
    await expect(page.getByRole('button',{name:'第一人稱'})).toBeVisible()
    await touchControl(page.getByRole('button',{name:'開傘'}))
    await expect(page.getByText('已展開',{exact:true})).toBeVisible()
    await touchControl(page.getByRole('button',{name:'暫停',exact:true}))
    await expect(page.getByRole('dialog')).toBeVisible()
    await touchControl(page.getByRole('button',{name:'繼續模擬'}))
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await touchControl(page.getByRole('button',{name:'重試',exact:true}))
    await expect(page.getByText('自由落體',{exact:true})).toBeVisible()
  })
})

