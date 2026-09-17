import fs from 'fs'
import path from 'path'
import https from 'https'

const models = [
  'models/builder/Figure1.glb',
  'models/builder/Figure2.glb',
  'models/builder/Figure3.glb',
  'models/builder/Figure4.glb',
  'models/mon.glb',
  'hdri/photo_studio_01_1k.hdr'
]

for (const m of models) {
  const dest = path.join('public', m)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const url = `https://labs.noomoagency.com/${m}`
  https.get(url, (res) => {
    if (res.statusCode === 200) {
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        console.log('Downloaded model:', m)
      })
    } else {
      console.log('Model status:', m, res.statusCode)
    }
  }).on('error', (e) => console.log('Error:', m, e.message))
}
