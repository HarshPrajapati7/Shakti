// Repack the wireframe GLB for the web: drop the metal/roughness texture, replace the base-colour PNG with a JPEG.
// node scripts/repack_glb.mjs <in.glb> <basecolor.jpg> <out.glb>
import fs from "node:fs"

const [inp, jpg, out] = process.argv.slice(2)
const b = fs.readFileSync(inp)
const jl = b.readUInt32LE(12)
const j = JSON.parse(b.subarray(20, 20 + jl).toString())
const bin = b.subarray(20 + jl + 8)
const mat = j.materials[0].pbrMetallicRoughness
delete mat.metallicRoughnessTexture
mat.metallicFactor = 0
const keepTex = j.textures[mat.baseColorTexture.index]
const imgIdx = keepTex.source
j.textures = [keepTex]
mat.baseColorTexture.index = 0
const img = j.images[imgIdx]
const dropViews = new Set(j.images.map((im) => im.bufferView))
const chunks = [], remap = {}
let off = 0
const push = (buf) => { chunks.push(buf); const s = off; off += buf.length; const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad } return s }
const views = []
j.bufferViews.forEach((v, i) => {
  if (dropViews.has(i)) return
  const s = push(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength))
  remap[i] = views.length
  views.push({ ...v, byteOffset: s })
})
const jb = fs.readFileSync(jpg)
const jv = views.length
views.push({ buffer: 0, byteOffset: push(jb), byteLength: jb.length })
j.bufferViews = views
for (const a of j.accessors) if (a.bufferView !== undefined) a.bufferView = remap[a.bufferView]
j.images = [{ bufferView: jv, mimeType: "image/jpeg", name: img.name }]
keepTex.source = 0
const binAll = Buffer.concat(chunks)
j.buffers = [{ byteLength: binAll.length }]
let js = Buffer.from(JSON.stringify(j))
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)])
const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + binAll.length, 8)
const c = (len, type) => { const x = Buffer.alloc(8); x.writeUInt32LE(len, 0); x.writeUInt32LE(type, 4); return x }
fs.writeFileSync(out, Buffer.concat([h, c(js.length, 0x4e4f534a), js, c(binAll.length, 0x004e4942), binAll]))
console.log(`${(b.length / 1e6).toFixed(1)} MB -> ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`)
