// Run with: npm test
// Which install path each phone and browser gets (src/lib/install.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installMode } from './install.js'

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Infinix X6833B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0',
  androidWebView: 'Mozilla/5.0 (Linux; Android 13; TECNO KJ5; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36',
}

test('already running as the app: nothing to offer', () => {
  assert.equal(installMode({ userAgent: UA.androidChrome, standalone: true, hasPrompt: true }), 'installed')
})

test('a browser that offers one-tap install gets it', () => {
  assert.equal(installMode({ userAgent: UA.androidChrome, hasPrompt: true }), 'prompt')
  assert.equal(installMode({ userAgent: UA.windowsFirefox, hasPrompt: true }), 'prompt')
})

test('iPhones and iPads get the Share → Add to Home Screen steps', () => {
  assert.equal(installMode({ userAgent: UA.iphoneSafari }), 'ios')
  assert.equal(installMode({ userAgent: UA.ipadSafari, maxTouchPoints: 5 }), 'ios')
})

test('Android without one-tap install gets the browser-menu steps', () => {
  assert.equal(installMode({ userAgent: UA.androidChrome }), 'android')
})

test('in-app browsers are told to open the real browser first', () => {
  assert.equal(installMode({ userAgent: UA.instagramIos }), 'in-app')
  assert.equal(installMode({ userAgent: UA.androidWebView }), 'in-app')
})

test('desktop browsers that can’t install show nothing', () => {
  assert.equal(installMode({ userAgent: UA.windowsFirefox }), 'none')
  assert.equal(installMode({ userAgent: UA.macSafari, maxTouchPoints: 0 }), 'none')
})
