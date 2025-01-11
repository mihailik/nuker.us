// @ts-check

/**! @see https://codesandbox.io/p/sandbox/browser-side-text-input-sentiment-y8frp4?file=%2Fsrc%2Futils.js%3A41%2C1-42%2C1&from-embed */

import { loadLayersModel, tensor2d } from "@tensorflow/tfjs";

const ORIGINAL_SOURCE =
  "https://storage.googleapis.com/tfjs-examples/sentiment/dist/index.html";
const SENTIMENT_CNN_MODEL =
  "https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1/model.json";
const SENTIMENT_METADATA =
  "https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1/metadata.json";
const OOV_INDEX = 2;


export async function sentimentProbe() {
  const metadataPromise = fetch(SENTIMENT_METADATA).then(x => x.json());
  const model = await loadLayersModel(SENTIMENT_CNN_MODEL);

  const metdata = await metadataPromise;
  const { index_from, max_len, word_index, vocabulary_size } = metdata;

  return {
    probe
  };

  /** @param {string[]} canonicalWords */
  function probe(canonicalWords) {
    // Convert the words to a sequence of word indices.
    /** @type {number[] | undefined} */
    let sequence;
    for (let iWord = 0; iWord < canonicalWords.length; ++iWord) {
      const word = canonicalWords[iWord];
      const idx = word_index[word];
      if (typeof idx !== 'number') continue;

      let swordIndex = idx + index_from;
      if (swordIndex > vocabulary_size) {
        swordIndex = OOV_INDEX;
      }

      if (sequence === undefined) {
        sequence = [];
        for (let j = 0; j < iWord; ++j) {
          sequence.push(OOV_INDEX);
        }
      }

      sequence.push(swordIndex);
    }

    if (!sequence) {
      return { score: NaN, elapsed: 0 };
    }

    canonicalWords.map((word) => {
      const idx = word_index[word];
      if (typeof idx !== 'number') return OOV_INDEX

      let swordIndex = idx + index_from;
      if (swordIndex > vocabulary_size) {
        swordIndex = OOV_INDEX;
      }
      return swordIndex;
    });

    // Perform truncation and padding.
    const paddedSequence = padSequences([sequence], max_len);
    const input = tensor2d(paddedSequence, [1, max_len]);

    const beginMs = performance.now();
    const prediction = model.predict(input);
    const predictFirstResult = Array.isArray(prediction) ? prediction[0] : prediction;
    const score = predictFirstResult.dataSync()[0];
    predictFirstResult.dispose();
    const endMs = performance.now();

    return { score: score, elapsed: endMs - beginMs };
  }
}

export const PAD_INDEX = 0; // Index of the padding character.

/**
 * Pad and truncate all sequences to the same length
 *
 * @param {number[][]} sequences The sequences represented as an array of array
 *   of numbers.
 * @param {number} maxLen Maximum length. Sequences longer than `maxLen` will be
 *   truncated. Sequences shorter than `maxLen` will be padded.
 * @param {'pre'|'post'} padding Padding type.
 * @param {'pre'|'post'} truncating Truncation type.
 * @param {number} value Padding value.
 */
function padSequences(
  sequences,
  maxLen,
  padding = "pre",
  truncating = "pre",
  value = PAD_INDEX
) {
  // TODO(cais): This perhaps should be refined and moved into tfjs-preproc.
  return sequences.map((seq) => {
    // Perform truncation.
    if (seq.length > maxLen) {
      if (truncating === "pre") {
        seq.splice(0, seq.length - maxLen);
      } else {
        seq.splice(maxLen, seq.length - maxLen);
      }
    }

    // Perform padding.
    if (seq.length < maxLen) {
      const pad = [];
      for (let i = 0; i < maxLen - seq.length; ++i) {
        pad.push(value);
      }
      if (padding === "pre") {
        seq = pad.concat(seq);
      } else {
        seq = seq.concat(pad);
      }
    }

    return seq;
  });
}
