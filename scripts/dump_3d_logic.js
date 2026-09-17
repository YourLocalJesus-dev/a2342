import fs from 'fs'

const code = fs.readFileSync('scripts/chunk_3d.js', 'utf8')
fs.writeFileSync('scripts/extracted_3d_logic.js', code.substring(100000, 118000))
console.log('Extracted 18,000 characters of exact 3D logic!')
