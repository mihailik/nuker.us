// @ts-check

import { breakFeedURIPostOnly, firehose, shortenHandle, unwrapShortDID } from 'coldsky';

/**
 * @typedef {{
 *  atUri: string,
 *  owner: string,
 *  earlier: ConversationStats,
 *  recent: ConversationStats
 * }} ConversationDetails
 */

/**
 * @typedef {{
 *  likes: number,
 *  replies: number,
 *  messages: Map<string, MessageDetails>,
 *  words: WordStats,
 *  participants: { [shortDID: string]: { avg: number, max: number, min: number, count: number, likes: number } }
 * }} ConversationStats;
 */

/**
 * @typedef {{
 *  replyTo: string,
 *  likes: number,
 *  quoting?: string[],
 *  referring?: string[],
 *  words: WordStats
 * }} MessageDetails
 */

/**
 * @typedef {{
 *  shortDID: string,
 *  handle?: string,
 *  displayName?: string,
 *  bio?: string,
 *  earlier: ActorStats,
 *  recent: ActorStats
 * }} ActorDetails
 */

/**
 * @typedef {{
 *  words: WordStats,
 *  latestActivity: number,
 *  likedTo: { [shortDID: string]: number },
 *  likedFrom: { [shortDID: string]: number },
 *  interactTo: { [shortDID: string]: number },
 *  interactFrom: { [shortDID: string]: number }
 * }} ActorStats
 */

/**
 * @typedef {{
 *  [word: string]: { rating: number, count: number }
 * }} WordStats
 */


export async function* streamEvents() {
  /** @type {Map<string, ConversationDetails>} */
  const conversations = new Map();
  /** @type {Map<string, ActorDetails>} */
  const actors = new Map();

  /** @type {Map<string, Map<string, Partial<MessageDetails> & { placeholder: true } | MessageDetails & { placeholder?: false }>>} */
  const messagesByShortDIDByPostID = new Map();

  for await (const msg of firehose.each()) {
    processMessage(msg);
  }

  /** @param {import('coldsky').FirehoseRecord} msg */
  function processMessage(msg) {
    if (msg.action === 'delete') {
      if (msg.$type === 'app.bsky.feed.post') return processDeletePost(msg.uri);
      if (msg.$type === 'app.bsky.feed.like') return processDeleteLike(msg.uri);
      if (msg.$type === 'app.bsky.graph.follow') return processDeleteFollow(msg.uri);
      return;
    }

    if (typeof msg.repo === 'string') {
      const shortDID = unwrapShortDID(msg.repo);
      noteRepo(shortDID, msg.receiveTimestamp);
    }

    switch (msg.$type) {
      case 'app.bsky.actor.profile':
        return processProfileUpdate(msg);
      
      case 'app.bsky.feed.like':
        return processLike(msg);

      case 'app.bsky.feed.post':
        return processPost(msg);

      case 'app.bsky.feed.repost':
        return processRepost(msg);

      case 'app.bsky.feed.postgate':
        return processPostGate(msg);

      case 'app.bsky.feed.threadgate':
        return processThreadGate(msg);
      
      case 'app.bsky.graph.block':
        return processBlock(msg);
      
      case 'app.bsky.graph.follow':
        return processFollow(msg);
    }
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.feed.like">} msg */
  function processLike(msg) {
    const resolvedURI = breakFeedURIPostOnly(msg.uri);
    if (!resolvedURI) return;

    let byPostID = messagesByShortDIDByPostID.get(resolvedURI.shortDID);
    if (!byPostID) {
      noteRepo(resolvedURI.shortDID, msg.receiveTimestamp);
      byPostID = new Map();
      messagesByShortDIDByPostID.set(resolvedURI.shortDID, byPostID);
    }

    let messageDetails = byPostID.get(resolvedURI.postID);
    if (messageDetails) {
      messageDetails.likes = (messageDetails.likes || 0) + 1;
    } else {
      messageDetails = { placeholder: true, likes: 1 };
      byPostID.set(resolvedURI.postID, messageDetails);
    }
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.feed.post">} msg */
  function processPost(msg) {
    /** @type {WordStats} */
    const words = {};
    textWords(msg.text, words);

    const shortDID = unwrapShortDID(msg.repo);

    let byPostID = messagesByShortDIDByPostID.get(shortDID);
    if (!byPostID) {
      noteRepo(shortDID, msg.receiveTimestamp);
      byPostID = new Map();
      messagesByShortDIDByPostID.set(shortDID, byPostID);
    }

    // msg.uri

    // byPostID.set(

  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.feed.repost">} msg */
  function processRepost(msg) {
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.feed.postgate">} msg */
  function processPostGate(msg) {
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.feed.threadgate">} msg */
  function processThreadGate(msg) {
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.graph.block">} msg */
  function processBlock(msg) {
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.graph.follow">} msg */
  function processFollow(msg) {
  }

  /** @param {string} uri */
  function processDeletePost(uri) {
  }

  /** @param {string} uri */
  function processDeleteLike(uri) {
  }

  /** @param {string} uri */
  function processDeleteFollow(uri) {
  }

  /**
   * @param {string} did
   * @param {number} time
   */
  function noteRepo(did, time) {
    const shortDID = unwrapShortDID(did);
    let actor = actors.get(shortDID);
    if (actor) {
      actor.recent.latestActivity = time;
    } else {
      actor = {
        shortDID,
        earlier: {
          words: {},
          latestActivity: 0,
          likedTo: {},
          likedFrom: {},
          interactTo: {},
          interactFrom: {},
        },
        recent: {
          words: {},
          latestActivity: time,
          likedTo: {},
          likedFrom: {},
          interactTo: {},
          interactFrom: {},
        },
      };
      actors.set(shortDID, actor);
    }

    return actor;
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.actor.profile">} msg */
  function processProfileUpdate(msg) {
    const actor = noteRepo(msg.repo, msg.receiveTimestamp);
    actor.bio = msg.description;
    actor.displayName = msg.displayName;
    actor.recent.words = {};
    textWords(actor.handle, actor.recent.words);
    textWords(msg.displayName, actor.recent.words);
    textWords(actor.bio, actor.recent.words);
  }
}

/**
 * @param {string | null | undefined} text
 * @param {WordStats} words
 */
function textWords(text, words) {
  if (!text) return;

  let start = 0;
  let isWord = false;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    const isAsciiLetter = char > 64 && char < 91 || char > 96 && char < 123;
    if (isAsciiLetter) {
      if (!isWord) {
        start = i;
        isWord = true;
      }
    } else {
      if (isWord) {
        const word = text.slice(start, i).toLowerCase();
        const stats = words[word];
        if (stats) {
          stats.count++;
        } else {
          const rating = calcRating(word);
          words[word] = { count: 1, rating };
        }
        start = i;
        isWord = false;
      }
    }
  }
}

function calcRating(word) {
  return 0.5;
}