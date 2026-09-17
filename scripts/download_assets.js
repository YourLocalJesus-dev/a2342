import fs from 'fs'
import path from 'path'
import https from 'https'

const assets = [
  'icons/Waves.png',
  'icons/WavesOff.png',
  'icons/JelIcon.svg',
  'icons/restartIcon.svg',
  'icons/arrowNext.svg',
  'icons/textLightning.svg',
  'icons/textFace.svg',
  'icons/textPlus.svg',
  'icons/rightBar.svg',
  'icons/patternCus1.png',
  'icons/patternCus2.png',
  'footerPatern.png',
  'transitionDots.png',
]

fs.mkdirSync('public/images/icons', { recursive: true })

for (const a of assets) {
  const url = `https://labs.noomoagency.com/images/${a}`
  const dest = path.join('public/images', a)
  https.get(url, (res) => {
    if (res.statusCode === 200) {
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        console.log('Downloaded:', a)
      })
    } else {
      console.log('Failed:', a, res.statusCode)
    }
  }).on('error', (e) => console.log('Error:', a, e.message))
}
