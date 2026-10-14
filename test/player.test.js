'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildPlayerMarkup } = require('../lib/injector');

test('player controls use localized status and remain keyboard accessible', async () => {
  const markup = buildPlayerMarkup({ audioUrl: '/audio/example.mp3',
    position: 'bottom-right', buttonLabel: 'Read this article',
    postTitle: 'Example', locale: 'en' });
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, {
    runScripts: 'outside-only', url: 'https://example.com/post/'
  });
  try {
    const { window } = dom;
    const style = window.document.createElement('style');
    style.textContent = fs.readFileSync(path.join(__dirname, '..', 'assets', 'reader.css'), 'utf8');
    window.document.head.appendChild(style);
    const root = window.document.querySelector('.hexo-reader');
    const audio = root.querySelector('audio');
    let paused = true;
    Object.defineProperty(audio, 'paused', { get: () => paused });
    audio.play = async () => { paused = false; audio.dispatchEvent(new window.Event('play')); };
    audio.pause = () => { paused = true; audio.dispatchEvent(new window.Event('pause')); };
    window.eval(fs.readFileSync(path.join(__dirname, '..', 'assets', 'reader.js'), 'utf8'));
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    const play = root.querySelector('.hexo-reader__play');
    const launcher = root.querySelector('.hexo-reader__launcher');
    const panel = root.querySelector('.hexo-reader__panel');
    assert.ok(panel.hasAttribute('inert'));
    assert.equal(window.getComputedStyle(launcher).visibility, 'visible');
    launcher.click();
    assert.ok(root.classList.contains('is-expanded'));
    assert.equal(window.getComputedStyle(launcher).visibility, 'hidden');
    assert.equal(launcher.getAttribute('aria-expanded'), 'true');
    assert.equal(window.document.activeElement, play);
    assert.ok(launcher.hasAttribute('inert'));
    assert.ok(!panel.hasAttribute('inert'));
    root.querySelector('.hexo-reader__collapse').click();
    assert.equal(window.getComputedStyle(launcher).visibility, 'visible');
    assert.equal(window.document.activeElement, launcher);
    assert.ok(panel.hasAttribute('inert'));
    assert.ok(!launcher.hasAttribute('inert'));
    launcher.click();
    assert.equal(window.getComputedStyle(launcher).visibility, 'hidden');
    play.click();
    await Promise.resolve();
    assert.equal(play.getAttribute('aria-label'), 'Pause reading');
    assert.equal(root.querySelector('.hexo-reader__status').textContent, 'Reading');
    Object.defineProperty(audio, 'duration', { value: 35 });
    audio.currentTime = 8;
    const back = root.querySelector('[data-skip="-10"]');
    const forward = root.querySelector('[data-skip="10"]');
    assert.equal(back.getAttribute('aria-label'), 'Back 10 seconds');
    back.click();
    assert.equal(audio.currentTime, 0);
    audio.currentTime = 30;
    forward.click();
    assert.equal(audio.currentTime, 35);
    const speed = root.querySelector('.hexo-reader__speed-toggle');
    const rates = root.querySelector('.hexo-reader__rates');
    speed.click();
    assert.equal(rates.hidden, false);
    root.querySelector('[data-rate="1.25"]').click();
    assert.equal(audio.playbackRate, 1.25);
    assert.equal(window.localStorage.getItem('hexo-reader-rate'), '1.25');
    assert.equal(root.querySelector('.hexo-reader__rate-value').textContent, '1.25×');
    assert.equal(rates.hidden, true);
    speed.click();
    root.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(rates.hidden, true);
    assert.ok(root.classList.contains('is-expanded'));
    root.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(!root.classList.contains('is-expanded'));
    assert.equal(window.getComputedStyle(launcher).visibility, 'visible');
    assert.equal(window.document.activeElement, launcher);
    // Reopening during a closing transition must use final layout bounds,
    // not the smaller visual bounds of the animated panel.
    root.getBoundingClientRect = () => ({ left: 1000, top: 740, width: 48, height: 48 });
    Object.defineProperties(panel, {
      offsetLeft: { value: -280 }, offsetTop: { value: -250 },
      offsetWidth: { value: 328 }, offsetHeight: { value: 220 }
    });
    panel.getBoundingClientRect = () => { throw new Error('Animated bounds must not be measured'); };
    launcher.click();
    assert.equal(panel.style.getPropertyValue('--hr-shift-x'), '-32px');
    root.querySelector('.hexo-reader__collapse').click();
    launcher.click();
    assert.equal(panel.getAttribute('aria-hidden'), 'false');
    assert.ok(!panel.hasAttribute('inert'));
    assert.equal(window.document.activeElement, play);
    audio.dispatchEvent(new window.Event('error'));
    assert.equal(root.querySelector('.hexo-reader__status').textContent, 'Audio could not load');
  } finally {
    dom.window.close();
  }
});
