import https from 'https'

const chunks = [
  'CkGjpDBV.js',
  'C4-CPqZe.js',
  'TM5kMQuH.js',
  'DkR7Kq9H.js',
  'DNkUmkFf.js',
  '3GHhKpoT.js',
  'BQveAYI3.js'
]

for (const c of chunks) {
  https.get(`https://labs.noomoagency.com/_nuxt/${c}`, (res) => {
    let data = ''
    res.on('data', d => data += d)
    res.on('end', () => {
      const glbs = [...data.matchAll(/["']([^"']+\.(glb|gltf|hdr|png|jpg|svg))["']/g)].map(m => m[1])
      if (glbs.length > 0) {
        console.log(`Chunk ${c}:`, glbs)
      }
      if (data.includes('segRoman') || data.includes('half') || data.includes('Scene')) {
        console.log(`Chunk ${c} HAS 3D keywords!`)
      }
    })
  })
}
