import fs from 'fs'

const code = fs.readFileSync('scripts/chunk_3d.js', 'utf8')

function showAround(keyword, span = 500) {
  let idx = 0
  while ((idx = code.indexOf(keyword, idx)) !== -1) {
    console.log(`=== FOUND "${keyword}" at ${idx} ===`)
    console.log(code.substring(Math.max(0, idx - 150), Math.min(code.length, idx + span)))
    idx += keyword.length + 1
  }
}

console.log('--- SEARCHING half4 ---')
showAround('half4.glb', 800)

console.log('--- SEARCHING segRoman ---')
showAround('segRoman.glb', 800)

console.log('--- SEARCHING Scene14 ---')
showAround('Scene14.glb', 800)
