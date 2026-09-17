import fs from 'fs'

const code = fs.readFileSync('scripts/noomo_bundle.js', 'utf8')
const matches = [...code.matchAll(/["']([^"']+\.glb)["']/g)].map(m => m[1])
console.log('GLB files in bundle:', matches)
