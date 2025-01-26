// @ts-check

import { breakFeedURIPostOnly, firehose, shortenHandle, unwrapShortDID } from 'coldsky';

/**
 * @typedef {{
 *  uri: string,
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
 *  conversation: ConversationDetails,
 *  replyToURI: string | undefined,
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

  /** @type {Map<string, Map<string, Partial<MessageDetails> & { uri: string, placeholder: true } | MessageDetails & { placeholder?: false }>>} */
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

  /**
   * @param {string | undefined} uri
   * @param {{ shortDID: string, postID: string } | undefined} parsed
   * @param {number} receiveTimestamp
   */
  function resolveMessageOrPlaceholderEmpty(uri, parsed, receiveTimestamp) {
    if (!uri || !parsed) return;

    return resolveMessageOrPlaceholder(uri, parsed.shortDID, parsed.postID, receiveTimestamp);
  }

  /**
   * @param {string} uri
   * @param {string} shortDID
   * @param {string} postID
   * @param {number} receiveTimestamp
   */
  function resolveMessageOrPlaceholder(uri, shortDID, postID, receiveTimestamp) {
    let byPostID = messagesByShortDIDByPostID.get(shortDID);
    if (!byPostID) {
      noteRepo(shortDID, receiveTimestamp);
      byPostID = new Map();
      messagesByShortDIDByPostID.set(shortDID, byPostID);
    }

    let messageDetails = byPostID.get(postID);
    if (!messageDetails) {
      messageDetails = { uri, placeholder: true };
      byPostID.set(postID, messageDetails);
    }

    return messageDetails;
  }

  /** @param {import('coldsky').FirehoseRepositoryRecord<"app.bsky.feed.like">} msg */
  function processLike(msg) {
    const messageDetails = resolveMessageOrPlaceholderEmpty(msg.uri, breakFeedURIPostOnly(msg.uri), msg.receiveTimestamp);
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

    let byPostID = messagesByShortDIDByPostID.get(shortDID);
    if (!byPostID) {
      noteRepo(shortDID, msg.receiveTimestamp);
      byPostID = new Map();
      messagesByShortDIDByPostID.set(shortDID, byPostID);
    }

    const pathLastSlash = msg.path?.lastIndexOf('/');
    const postID = pathLastSlash > 0 ? msg.path.slice(pathLastSlash + 1) : msg.path;

    const rootURI = msg.reply?.root?.uri || msg.uri;
    const parsedRootURI = breakFeedURIPostOnly(rootURI);
    const rootMessage = resolveMessageOrPlaceholderEmpty(rootURI, parsedRootURI, msg.receiveTimestamp);
    let conversation = rootMessage?.placeholder ? undefined : rootMessage?.conversation;
    if (!conversation) conversations.set(
      msg.reply?.root?.uri || msg.uri,
      conversation = {
        uri: rootURI,
        owner: parsedRootURI?.shortDID || shortDID,
        messages: new Map(),
        speakers: {},
        earlier: {
          likes: 0,
          posts: 0,
          words: {}
        },
        recent: {
          likes: 0,
          posts: 1,
          words: {}
        }
      }
    );

    if (rootMessage && rootMessage.conversation) {
        rootMessage.conversation = conversation;
        conversation.messages.set(rootURI, rootMessage);
      }

      rootMessage.conversation.recent.posts++;
      textWords(msg.text, rootMessage.conversation.recent.words);
    } else {

    }

    if (rootMessage) {

    }

    if (msg.reply?.parent?.uri !== msg.uri) {
      const parentURI = breakFeedURIPostOnly(msg.reply?.parent?.uri);
      const parentMessage = parentURI && resolveMessageOrPlaceholder(parentURI, msg.receiveTimestamp);
      if (parentMessage) {
        if (!rootMessage?.conversation) rootMessage?.conversation = 
      }
    }

    byPostID.set(
      postID,
      {
        replyToURI: msg.reply,
        likes: 0,
        words,
      });
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