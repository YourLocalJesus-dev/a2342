import https from 'https'
import fs from 'fs'

const url = 'https://labs.noomoagency.com/models/errorModel.glb'
const dest = 'public/models/errorModel.glb'

https.get(url, (res) => {
  console.log('Status code:', res.statusCode)
  if (res.statusCode === 200) {
    const f = fs.createWriteStream(dest)
    res.pipe(f)
    f.on('finish', () => {
      f.close()
      console.log('Downloaded errorModel.glb successfully! Size:', fs.statSync(dest).size)
    })
  }
}).on('error', (e) => console.log('Error:', e.message))
