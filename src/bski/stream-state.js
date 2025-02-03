// @ts-check

/**
 * @typedef {{
 *  threads: { [uri: string]: ThreadState },
 *  orphanLikes: { shortDID: string, uri: string }[],
 *  accounts: { [shortDID: string]: AccountState }
 * }} StreamState
 */

/**
 * @typedef {{
 *  shortDID: string,
 *  handle?: string,
 *  displayName?: string,
 *  bio?: string,
 *  stats: AccountStats
 * }} AccountState
 */

/**
 * @typedef {{
 * }} AccountStats
 */

export function streamState() {

  return {
    receiveTimestamp: 0,
    since: '',
    time: '',
    messages: [],
    parseTime: 0
  };

}