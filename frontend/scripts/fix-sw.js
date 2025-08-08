const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'public', 'sw.js');

if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');
  
  // Remove all _ref.apply references which cause undefined reference errors
  // This regex matches all instances of _ref.apply in the minified code
  const buggyReferenceRegex = /_ref\.apply\(this,arguments\)/g;
  
  // Remove problematic importScripts call that may cause loading issues
  const importScriptsRegex = /importScripts\("[^"]*fallback[^"]*\.js"\),/g;
  
  const originalContent = swContent;
  // Replace _ref.apply with a simple null return (safer than removing entire functions)
  swContent = swContent.replace(buggyReferenceRegex, 'null');
  // Remove the fallback importScripts that may cause loading issues
  swContent = swContent.replace(importScriptsRegex, '');
  
  if (originalContent !== swContent) {
    fs.writeFileSync(swPath, swContent);
    console.log('✓ Fixed service worker: Fixed _ref.apply and importScripts issues');
  } else {
    console.log('ℹ Service worker: No _ref bug found to fix');
  }
} else {
  console.log('⚠ Service worker file not found');
}