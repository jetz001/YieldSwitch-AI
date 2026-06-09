const fs = require('fs');
const path = require('path');

function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    let p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.js') || p.endsWith('.ts')) {
      let c = fs.readFileSync(p, 'utf8');
      if (c.includes(`= 'edge';`) || c.includes(`= "edge";`)) {
        const fixed = c.replace(/^[ \t]*=[ \t]*['"]edge['"];?\r?\n?/gm, '');
        fs.writeFileSync(p, fixed);
        console.log('Fixed', p);
      }
    }
  });
}
walk('src');
