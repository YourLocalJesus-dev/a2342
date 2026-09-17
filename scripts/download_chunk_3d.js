import https from 'https'
import fs from 'fs'

https.get('https://labs.noomoagency.com/_nuxt/DkR7Kq9H.js', (res) => {
  let data = ''
  res.on('data', d => data += d)
  res.on('end', () => {
    fs.writeFileSync('scripts/chunk_3d.js', data)
    console.log('Saved chunk_3d.js, size:', data.length)
  })
})
