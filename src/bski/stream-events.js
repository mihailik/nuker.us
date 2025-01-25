// @ts-check

import { firehoseRecords } from 'coldsky';

/**
 * @typedef {{
 *  atUri: string;
 *  owner: string;
 *  earlier: ThreadStats;
 *  recent: ThreadStats;
 * }} ThreadDetails
 */

/**
 * @typedef {{
 *  likes: number;
 *  replies: number;
 *  words: { [word: string]: { rating: number, count: number } };
 *  participants: { [shortDID: string]: { avg: number, max: number, min: number, count: number, likes: number } };
 * }} ThreadStats;
 */

/**
 * @typedef {{
 *  shortDID: string;
 *  handle: string;
 *  bio: string;
 *  earlier: AccountStats;
 *  recent: AccountStats;
 * }} AccountDetails
 */

/**
 * @typedef {{
 *  likedTo: { [shortDID: string]: number };
 *  likedFrom: { [shortDID: string]: number };
 *  interactTo: { [shortDID: string]: number };
 *  interactFrom: { [shortDID: string]: number };
 * }} AccountStats
 */


export async function* streamEvents() {
  /** @type {Map<string, ThreadDetails>} */
  const threads = new Map();
  /** @type {Map<string, AccountDetails>} */
  const accounts = new Map();

  for await (const msg of firehoseRecords()) {

  }
}