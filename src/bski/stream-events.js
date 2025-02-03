// @ts-check

import { breakFeedURIPostOnly, firehose, shortenHandle, unwrapShortDID } from 'coldsky';

/**
 * @typedef {{
 *  rootURI: string,
 *  owner: string,
 *  messages: Map<string, MessageDetails>,
 *  speakers: { [shortDID: string]: { count: number, likes: number } },
 *  earlier: ConversationStats,
 *  recent: ConversationStats
 * }} ConversationDetails
 */

/**
 * @typedef {{
 *  likes: number,
 *  posts: number,
 *  words: WordStats
 * }} ConversationStats;
 */

/**
 * @typedef {{
 *  uri: string,
 *  placeholder?: false,
 *  conversation: ConversationDetails,
 *  replyTo: MessageOrPlaceholder,
 *  lastReference: number,
 *  likes: number,
 *  quoting?: string[],
 *  referring?: string[],
 *  words: WordStats
 * }} MessageDetails
 */

/** @typedef {MessageDetails | { placeholder: true } & Omit<MessageDetails, 'placeholder'>} MessageOrPlaceholder */

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
  const conversationByURI = new Map();
  /** @type {Map<string, ActorDetails>} */
  const actors = new Map();

  /** @type {Map<string, MessageOrPlaceholder>} */
  const messageByURI = new Map();

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

  /**
   * @param {string | undefined} uri
   * @param {number} receiveTimestamp
   */
  function resolveMessageOrPlaceholder(uri, receiveTimestamp) {
    if (!uri) return;
    let msg = messageByURI.get(uri);
    if (!msg) {
      const shortDID = breakFeedURIPostOnly(uri)?.shortDID;
      if (!shortDID) {
        console.error('Malformed URI ', uri);
        return;
      }

      noteRepo(shortDID, receiveTimestamp);
      messageByURI.set(uri, msg = {
        uri,
        lastReference: receiveTimestamp,
        placeholder: true
      });
    }

    return msg;
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.feed.like">} msg */
  function processLike(msg) {
    const messageDetails = resolveMessageOrPlaceholder(msg.uri, msg.receiveTimestamp);
    if (!messageDetails) return; // unresolvable
    messageDetails.likes = (messageDetails.likes || 0) + 1;
    if (messageDetails.conversation) {
      messageDetails.conversation.recent.likes++;
      const speakerStats = messageDetails.conversation.speakers[msg.repo];
      if (speakerStats) speakerStats.likes++;
      else messageDetails.conversation.speakers[msg.repo] = { count: 0, likes: 1 };
    }
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.feed.post">} msg */
  function processPost(msg) {
    /** @type {WordStats} */
    const words = {};
    textWords(msg.text, words);

    const shortDID = unwrapShortDID(msg.repo);

    // Cases:
    // * new post in a known thread
    // * new post in an unknown thread: root
    // * new post in an unknown thread: reply
    // * a post that already matches a placeholder

    const pathLastSlash = msg.path?.lastIndexOf('/');
    const postID = pathLastSlash > 0 ? msg.path.slice(pathLastSlash + 1) : msg.path;

    let postMessage = messageByURI.get(msg.uri);
    if (postMessage) {
      // TODO: probably a placeholder, need to resolve all things
      postMessage.words = words;
      postMessage.lastReference = msg.receiveTimestamp;
    } else {
      // first, is there a parent message?

      const replyToMessage = !msg.reply?.root?.uri || msg.reply?.root?.uri === msg.uri ? undefined :
        resolveMessageOrPlaceholder(msg.reply.root.uri, msg.receiveTimestamp);

      let conversation = replyToMessage?.conversation;
      if (!conversation) {
        // create/lookup a conversation, create full materialised message
        const rootURI = msg.reply?.root?.uri || msg.uri;
        conversation = conversationByURI.get(rootURI);

        if (!conversation) {
          conversation = {
            rootURI,
            owner: msg.repo,
            messages: new Map(),
            speakers: {},
            earlier: {
              likes: 0,
              posts: 0,
              words: {}
            },
            recent: {
              likes: 0,
              posts: 0,
              words: {}
            }
          };
          conversationByURI.set(rootURI, conversation);
        }
      }

      postMessage = {
        uri,
        conversation,
        lastReference: msg.receiveTimestamp,
        likes: 0,
        quoting: [],
        referring: [],
        replyTo: replyToMessage
      };

      // TODO: add message to the conversation
      conversation.messages.set(postMessage.uri, postMessage);
      

    }
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

/**
 * @param {WordStats} operand
 * @param {WordStats} ratingsToAdd
 */
function wordStatsAddRatings(operand, ratingsToAdd) {
  for (const k in ratingsToAdd) {
    const newRatings = ratingsToAdd[k];
    const existingRatings = operand[k];
    if (existingRatings) {
      newRatings.count += existingRatings.count;
    } else {
      operand[k] = { ...newRatings };
    }
  }
}