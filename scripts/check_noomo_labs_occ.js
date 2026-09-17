import fs from 'fs'

const code = fs.readFileSync('scripts/noomo_bundle.js', 'utf8')
const matches = [...code.matchAll(/NOOMO LABS/g)]
console.log('Occurrences of NOOMO LABS:', matches.length)
matches.forEach(m => {
  console.log(code.substring(Math.max(0, m.index - 50), m.index + 100))
})
