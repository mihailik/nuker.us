// @ts-check

/// <reference types="d3" />

import { BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, WireframeGeometry } from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';

import * as d3 from 'd3';

import { firehose } from 'bski';

import { makeClock } from '../core/clock';
import { createAtlasRenderer } from '../render';
import { handleWindowResizes } from './handle-window-resizes';
import { setupScene } from './setup-scene';
import { startAnimation } from './start-animation';
import { throttledAsyncCache } from '../core/throttled';
// import { layoutCalculator } from '../layout/calculator';

/**
 * @param {HTMLDivElement} elem
 * @param {Promise<void>} [unmountPromise]
 */
export function boot(elem, unmountPromise) {
  const clock = makeClock();

  let lastRender = clock.nowMSec;

  const {
    scene,
    camera,
    lights,
    renderer,
    stats,
    orbit
  } = setupScene(clock);

  elem.appendChild(renderer.domElement);

  handleWindowResizes(camera, renderer);

  startAnimation({
    camera,
    clock,
    scene,
    orbit: /** @type {OrbitControls} */(orbit.controls),
    renderer,
    stats,
    onRedrawLive,
    onRedrawRare
  });

  const atlasRenderer = createAtlasRenderer({
    clock,
    nodesLive: streamAccountPositions(),
  });

  scene.add(atlasRenderer.mesh);

  const box = new BoxGeometry(1, 1, 1);
  const geo = new EdgesGeometry(/** @type {*} */(box));
  const mat = new LineBasicMaterial({ color: 0x808080, transparent: true, opacity: 0.4, linewidth: 2 });
  const wireframe = new LineSegments(geo, mat);
  scene.add(wireframe);

  /** @type {HTMLElement} */
  var textElem;
  var updatingNode;
  var fetchByUri;

  elem.addEventListener('mousemove', async (e) => {
    const node = atlasRenderer.getNodeAtScreenPosition(e);
    if (!node) return;

    if (!fetchByUri) {
      fetchByUri = throttledAsyncCache(uri => fetch(uri).then(x => x.json()));
    }

    updatingNode = node;

    console.log('fetching hover post ', node);
    /** @type {import('@atproto/api/dist/client/types/app/bsky/feed/defs').ThreadViewPost} */
    let postThread = (await fetchByUri(
      'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=' +
      node.uri
    )).thread;
    const rootURI = /** @type {AppBskyFeedPost} */(postThread.post.record).reply?.root.uri;
    if (rootURI !== node.uri && rootURI) {
      postThread = (await fetchByUri(
        'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=' +
        rootURI
      )).thread;
    }

    if (updatingNode !== node) return;

    console.log('fetched hover post ', postThread, node);

    if (!textElem) {
      textElem = document.createElement('div');
      textElem.style.cssText =
        `position: absolute; left: 0; top: 0; width: 100%; font-size: 50%; z-index: 10; font: inherit; padding: 0.5em;
          height: 10em; overflow: auto;
          display: grid; grid-template-rows: 1fr;
          grid-gap: 0.5em;
        `;
      elem.appendChild(textElem);
    }

    const posts = [
      postThread.post,
      .../** @type {typeof postThread[]} */(postThread.replies).map(r => r.post)
    ].filter(p => atlasRenderer.nodes.find(n => n.uri === p.uri));

    textElem.textContent = '';
    textElem.style.gridTemplateColumns = 'repeat(' + posts.length + ', 1fr)';

    var focusPost;
    for (const p of posts) {
      const rec = /** @type {AppBskyFeedPost} */(p.record);
      if (!rec.text) continue;

      const postElem = document.createElement('div');

      const authorElem = document.createElement('a');
      authorElem.href = p.uri.replace(/^at\:\/\//, 'https://bsky.app/profile/').replace(/app\.bsky\.feed\.post/, 'post');
      authorElem.target = '_blank';
      const colorElem = document.createElement('span');
      colorElem.style.cssText = 'width: 0.7em; height: 0.7em; border-radius: 1em; display: inline-block; border: solid 1px silver;';
      colorElem.style.backgroundColor = '#' + (0x1000000 + deriveColor(p.author.did)).toString(16).slice(1);
      authorElem.appendChild(colorElem);
      const authorHandleElem = document.createElement('span');
      authorHandleElem.textContent = ' ' + p.author.handle;
      authorElem.appendChild(authorHandleElem);
      postElem.appendChild(authorElem);

      const postText = document.createElement('div');
      postText.style.whiteSpace = 'pre-wrap';
      postText.textContent = rec.text;
      postElem.appendChild(postText);

      if (p.uri === node.uri) {
        focusPost = postElem;
        postElem.style.border = 'solid 1px gold';
        postElem.style.borderRadius = '0.25em';
      }

      textElem.appendChild(postElem);
    }

    if (focusPost) {
      textElem.scrollLeft = focusPost.offsetLeft;
    }
  });


  function onRedrawLive() {
    const delta = lastRender ? clock.nowMSec - lastRender : 0;
    lastRender = clock.nowMSec;
    orbit.controls?.update?.(Math.min(delta / 1000, 0.2));

    runLayout(atlasRenderer.nodes);

    atlasRenderer.redraw(camera);
  }

  function onRedrawRare() {
    if (atlasRenderer.nodes.length)
      console.log('rare redraw ', atlasRenderer.nodes);

    //if (profilePositions.length < 10) return;

    // const layout = layoutCalculator({
    //   nodes: profilePositions,
    //   edges: profileLinks
    // });

    // layout.run(100);
  }

  /** @typedef {import('../render/static-shader-renderer').Particle & { uri: string, root: string, parent?: string }} ThreadParticle */

  async function* streamAccountPositions() {
    /**
     * @type {ThreadParticle[]}
     */
    let allPosts = [];
    /** @type {Map<string, ThreadParticle[]>} */
    const threads = new Map();

    /** @type {ThreadParticle[]} */
    let liveThreadPosts = [];

    const MIN_THREAD_SIZE = 4;
    const FILLED_WITH_THREAD_POSTS = 1000;

    const breakRegExp = /^at\:\/\/([^/]+)\//g;

    for await (const chunk of firehose()) {
      let updated = false;
      for (const msg of chunk) {
        if (msg.action !== 'create') continue;
        if (msg.$type !== 'app.bsky.feed.post') continue;

        let repo = msg.uri.slice(5);
        repo = repo.slice(0, repo.indexOf('/'));
        if (!repo) continue;

        const color = deriveColor(repo);
        const posColor = deriveColor(msg.text);
        const posSrc = Math.floor(overHashColor(posColor) * 0x10000);
        const x = (posSrc & 0xFF) / 255 - 0.5;
        const y = ((posSrc >> 8) & 0xFF) / 255 - 0.5;

        /** @type {ThreadParticle} */
        const p = {
          uri: msg.uri,
          root: msg.reply?.root?.uri || msg.uri,
          parent: msg.reply?.parent?.uri,
          color,
          mass: 0.02,
          x,
          y,
          flash: { start: clock.nowMSec, stop: clock.nowMSec + 20000 },
          description: msg.text,
          key: msg.uri,
          label: msg.text.trim().split(/\s+/g)[0]
        };

        allPosts.push(p);

        let thr = threads.get(p.root);
        if (!thr) {
          thr = [p];
          threads.set(p.root, thr);
        } else {
          thr.push(p);
          if (thr.length === MIN_THREAD_SIZE) {
            for (const p of thr) {
              liveThreadPosts.push(p);
            }
            updated = true;
          } else if (thr.length > MIN_THREAD_SIZE) {
            liveThreadPosts.push(p);
            updated = true;
          }
        }
      }

      if (updated && liveThreadPosts.length) {
        let liveThreadList = [...threads.values()].filter(th => th.length > MIN_THREAD_SIZE);

        console.log('live threads ', liveThreadList);

        const y = liveThreadPosts;
        liveThreadPosts = liveThreadPosts.slice();
        yield y;

        if (liveThreadPosts.length > FILLED_WITH_THREAD_POSTS) break;
      }
    }
  }

  // TODO: handle unmountPromise


  var simulation;
  var nodeCount;

  /** @param {typeof atlasRenderer.nodes} nodes */
  function runLayout(nodes) {
    const nodesMap = new Map(nodes.map(n => [n.uri, n]));
    const nodeLinks = [];
    for (const n of nodes) {
      const p = n.parent ? nodesMap.get(n.parent) : undefined;
      if (p) nodeLinks.push({ source: p, target: n });
    }

    if (nodes.length) {

      if (!simulation) {
        simulation = d3.forceSimulation(nodes).velocityDecay(0.2).alphaDecay(0.01)
          .force("link", d3.forceLink(nodeLinks).id(n => n.uri).strength(5).distance(0.006))
          .force("charge", d3.forceManyBody().strength(-0.003))
          .force('center', d3.forceCenter().strength(0.0002))
          .force("collide", d3.forceCollide(0.006))
          .force("x", d3.forceX())
          .force("y", d3.forceY());
        simulation.stop();
      } else {
        simulation.nodes(nodes);
        simulation.force("link").links(nodeLinks);
      }

      if (nodeCount !== nodes.length) {
        const alpha = simulation.alpha();
        simulation.alpha(1);
        nodeCount = nodes.length;
        simulation.restart();
        simulation.stop();
        const freshAlpha = simulation.alpha();
        console.log('restart the forces ', nodes, { alpha, freshAlpha });
      }

      simulation.tick(1);
    }
  }

}

function overHashColor(color) {
  let r = Math.pow(10, color / 0xFFFFFF);
  r = r - Math.floor(r);
  return r;
}

function deriveColor(shortDID) {
  let hash = 0;
  for (let i = 0; i < shortDID.length; i++) {
    hash = ((hash << 5) - hash) + shortDID.charCodeAt(i);
    hash |= 0;
  }

  let h = hash / 138727 + 1 / hash;
  h = Math.pow(10, (h - Math.floor(h)) * Math.PI);
  h = h - Math.floor(h);

  h = Math.pow(10, h);
  h = h - Math.floor(h);

  let l = Math.pow(10, h);
  l = l - Math.floor(l);

  const c = hlsToRgb(h, 0.4 + 0.7 * l, 1);
  return c;
}

function hlsToRgb(h, l, s) {
  let r, g, b;

  if (s == 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return (
    ((r * 255 * 255 * 255) | 0) +
    ((g * 255 * 255) | 0) +
    ((b * 255) | 0)
  );
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
