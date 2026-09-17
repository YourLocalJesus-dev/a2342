import https from 'https'

https.get('https://labs.noomoagency.com/', (res) => {
  let html = ''
  res.on('data', (d) => { html += d })
  res.on('end', () => {
    const chunkMatches = [...html.matchAll(/\/([a-zA-Z0-9_\-\.]+\.js)/g)].map(m => m[0])
    console.log('All script / chunk URLs in HTML:', [...new Set(chunkMatches)])
  })
})
