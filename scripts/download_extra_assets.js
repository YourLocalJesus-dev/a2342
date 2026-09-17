import https from 'https'
import fs from 'fs'
import path from 'path'

const files = [
  'hdri/sphere5.png',
  'textures/paternWhiteBlackBack.jpg',
  'textures/whiteTexture.jpg',
  'audio/Sphere-collision.mp3',
  'audio/BG5.mp3',
  'audio/ParticleScattering.mp3',
]

for (const file of files) {
  const dest = path.join('public', file)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const url = `https://labs.noomoagency.com/${file}`
  https.get(url, (res) => {
    if (res.statusCode === 200) {
      const f = fs.createWriteStream(dest)
      res.pipe(f)
      f.on('finish', () => {
        f.close()
        console.log('Downloaded:', file)
      })
    } else {
      console.log('Status', file, res.statusCode)
    }
  }).on('error', (e) => console.log('Error', file, e.message))
}
