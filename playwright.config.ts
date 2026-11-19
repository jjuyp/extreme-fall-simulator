import { defineConfig } from '@playwright/test'

const executablePath=process.env.FALL_CHROME
export default defineConfig({
  testDir:'./tests', testMatch:'**/*.spec.ts', workers:1, timeout:45_000,
  use: {
    baseURL:'http://127.0.0.1:4185/extreme-fall/', viewport:{width:1280,height:800},
    channel:executablePath ? undefined : 'chrome',
    launchOptions:{executablePath,args:process.env.FALL_SOFTWARE==='1'?['--enable-unsafe-swiftshader','--use-angle=swiftshader']:[]},
  },
  webServer:{
    command:'node scripts/serve.mjs',env:{FALL_PORT:'4185'},
    url:'http://127.0.0.1:4185/extreme-fall/',reuseExistingServer:false,timeout:15_000,
  },
})

