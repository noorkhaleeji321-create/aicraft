const fs = require('fs');
const path = require('path');

function replaceInFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist') {
        replaceInFiles(fullPath);
      }
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Update from './db.js' to './db/index.js' or '../db/index.js'
      const hasDbImport = content.includes('db.js');
      if (hasDbImport) {
        content = content.replace(/from\s+['"]([^'"]*)db\.js['"]/g, (match, p1) => {
          if (p1 === './' || p1 === '../') {
            return `from '${p1}db/index.js'`;
          }
          if (p1.endsWith('/')) {
            return `from '${p1}db/index.js'`;
          }
          return match; // fallback
        });
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated imports in ${fullPath}`);
      }
    }
  }
}

replaceInFiles('./server');
replaceInFiles('./server.ts');
