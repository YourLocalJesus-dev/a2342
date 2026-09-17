import https from 'https'
import fs from 'fs'

https.get('https://labs.noomoagency.com/_nuxt/iNjJ8EkR.js', (res) => {
  let code = ''
  res.on('data', (d) => { code += d })
  res.on('end', () => {
    fs.writeFileSync('scripts/noomo_bundle.js', code)
    console.log('Saved bundle, length:', code.length)

    // Search for segRoman, half4, glass, transmission, etc.
    const searchTerms = ['segRoman', 'half4', 'Sphere', 'photo_studio', 'transmission', 'MeshPhysicalMaterial', 'Empty_for_Camera', 'Camera_target']
    for (const term of searchTerms) {
      const idx = code.indexOf(term)
      if (idx !== -1) {
        console.log(`Found ${term} at ${idx}:`, code.substring(Math.max(0, idx - 100), idx + 200))
      } else {
        console.log(`Not found: ${term}`)
      }
    }
  })
})
