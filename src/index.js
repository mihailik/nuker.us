// @ts-check

import * as THREE from 'three';
import { firehose } from 'coldsky/firehose';
import { boot } from './setup/boot';

animateSplashOff();
const elem = document.createElement('div');
elem.style.cssText = 'position: fixed; inset: 0;';
document.body.appendChild(elem);
boot(elem);

/** @returns {Promise<void> | undefined} */
function animateSplashOff() {
  const loadingSplash = /** @type {HTMLElement & { startTime?: number } | undefined} */(document.getElementById('loadingSplash'));
  if (!loadingSplash) return;

  const now = Date.now();
  if (!loadingSplash.startTime || (now - loadingSplash.startTime < 500)) {
    loadingSplash.remove();
    return;
  }

  return new Promise(resolve => {
    loadingSplash.style.opacity = '0';
    setTimeout(() => {
      loadingSplash.remove();
      resolve();
    }, 1000);
  });
}