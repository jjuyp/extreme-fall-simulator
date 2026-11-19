import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root=fileURLToPath(new URL('../dist',import.meta.url))
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',glb:'model/gltf-binary',wasm:'application/wasm'}
const server=createServer(async (request,response)=>{
  if(request.method!=='GET'&&request.method!=='HEAD'){ response.writeHead(405).end();return }
  try {
    const path=decodeURIComponent(new URL(request.url,'http://localhost').pathname)
    const prefix='/extreme-fall/'
    if(!path.startsWith(prefix)){response.writeHead(302,{location:prefix}).end();return}
    const file=resolve(root,path.slice(prefix.length)||'index.html')
    if(!file.startsWith(root+sep)){response.writeHead(400).end();return}
    const bytes=await readFile(file)
    response.writeHead(200,{'content-type':types[file.split('.').at(-1)]||'application/octet-stream','x-content-type-options':'nosniff'})
    response.end(request.method==='HEAD'?undefined:bytes)
  } catch { response.writeHead(404).end() }
})

const port=Number(process.env.FALL_PORT ?? 0)
server.on('error',error=>{console.error(error.message);process.exitCode=1})
server.listen(port,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${server.address().port}/extreme-fall/`
  console.log(url)
  if(process.platform==='win32'&&process.argv.includes('--open')){
    const browser=spawn('explorer.exe',[url],{stdio:'ignore',windowsHide:true})
    browser.on('error',()=>{})
    browser.unref()
  }
})

