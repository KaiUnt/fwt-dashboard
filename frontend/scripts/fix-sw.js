const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'public', 'sw.js');

// SWC/TypeScript helper functions that may be missing from the generated SW
const helperFunctions = `
function _async_to_generator(fn) {
  return function() {
    var self = this, args = arguments;
    return new Promise(function(resolve, reject) {
      var gen = fn.apply(self, args);
      function _next(value) {
        var result;
        try { result = gen.next(value); } catch (e) { reject(e); return; }
        if (result.done) { resolve(result.value); } else { Promise.resolve(result.value).then(_next, _throw); }
      }
      function _throw(err) {
        var result;
        try { result = gen.throw(err); } catch (e) { reject(e); return; }
        if (result.done) { resolve(result.value); } else { Promise.resolve(result.value).then(_next, _throw); }
      }
      _next(undefined);
    });
  };
}
function _ts_generator(thisArg, body) {
  var f, y, t, g, _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] };
  return g = { next: verb(0), throw: verb(1), return: verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
  function verb(n) { return function(v) { return step([n, v]); }; }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0: case 1: t = op; break;
        case 4: _.label++; return { value: op[1], done: false };
        case 5: _.label++; y = op[1]; op = [0]; continue;
        case 7: op = _.ops.pop(); _.trys.pop(); continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
          if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
          if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
          if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
          if (t[2]) _.ops.pop();
          _.trys.pop(); continue;
      }
      op = body.call(thisArg, _);
    } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
    if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
  }
}
`;

if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');
  const originalContent = swContent;
  let fixes = [];

  // Check if async/generator helpers are missing and used
  const needsAsyncHelper = swContent.includes('_async_to_generator') && !swContent.includes('function _async_to_generator');
  const needsGeneratorHelper = swContent.includes('_ts_generator') && !swContent.includes('function _ts_generator');

  // Inject helper functions at the beginning if needed
  if (needsAsyncHelper || needsGeneratorHelper) {
    swContent = helperFunctions + swContent;
    fixes.push('injected async/generator helpers');
  }

  // Remove all _ref.apply references which cause undefined reference errors
  const buggyReferenceRegex = /_ref\.apply\(this,arguments\)/g;
  if (buggyReferenceRegex.test(swContent)) {
    swContent = swContent.replace(buggyReferenceRegex, 'null');
    fixes.push('fixed _ref.apply');
  }

  // Remove problematic importScripts call that may cause loading issues
  const importScriptsRegex = /importScripts\("[^"]*fallback[^"]*\.js"\),/g;
  if (importScriptsRegex.test(originalContent)) {
    swContent = swContent.replace(importScriptsRegex, '');
    fixes.push('removed fallback importScripts');
  }

  // Harden start-url caching: never cache 4xx/5xx responses.
  const startUrlMarkerRegex = /cacheName:(["'])start-url\1,plugins:\[/;
  const startUrlHasCacheableRegex =
    /cacheName:(["'])start-url\1,plugins:\[(?:(?!cacheName:).)*CacheableResponsePlugin/s;
  const cacheableSnippet = 'new e.CacheableResponsePlugin({statuses:[0,200]})';
  if (startUrlMarkerRegex.test(swContent) && !startUrlHasCacheableRegex.test(swContent)) {
    swContent = swContent.replace(startUrlMarkerRegex, (match) => `${match}${cacheableSnippet},`);
    fixes.push('hardened start-url cache (no 4xx/5xx)');
  }

  if (fixes.length > 0) {
    fs.writeFileSync(swPath, swContent);
    console.log('Fixed service worker: ' + fixes.join(', '));
  } else {
    console.log('Service worker: No fixes needed');
  }
} else {
  console.log('Service worker file not found');
}
