import * as T from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { writeFile } from 'node:fs/promises'

// GLTFExporter reads Blob data using the browser FileReader API.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result=result
      this.onloadend?.()
    })
  }
}
const scene=new T.Scene()
const dark=new T.MeshStandardMaterial({color:0x26373c,roughness:.88})
const orange=new T.MeshStandardMaterial({color:0xf59b4b,roughness:.68})
const white=new T.MeshStandardMaterial({color:0xffe4bd,emissive:0xda9348,emissiveIntensity:.35})
function box(w,h,d,y,material){
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material)
  mesh.position.y=y
  scene.add(mesh)
}
box(.55,.12,.46,.06,dark)
box(.2,.72,.19,.42,orange)
box(.25,.17,.23,.68,dark)
box(.19,.08,.239,.68,white)
box(.19,.06,.18,.785,orange)
const bytes=await new GLTFExporter().parseAsync(scene,{binary:true})
await writeFile(new URL('../public/assets/platform-marker.glb',import.meta.url),Buffer.from(bytes))

