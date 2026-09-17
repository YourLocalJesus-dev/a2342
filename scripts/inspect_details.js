import fs from 'fs'

const code = fs.readFileSync('scripts/noomo_bundle.js', 'utf8')
const idx = code.indexOf('photo_studio_01_1k.hdr')
console.log('--- CODE AROUND photo_studio ---')
console.log(code.substring(idx - 200, idx + 2500))
