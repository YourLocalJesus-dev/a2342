import fs from 'fs'

const code = fs.readFileSync('scripts/noomo_bundle.js', 'utf8')
const matches = [...code.matchAll(/loadAsync\([^)]+\)/g)].map(m => m[0])
console.log('All loadAsync calls in bundle:', matches)
