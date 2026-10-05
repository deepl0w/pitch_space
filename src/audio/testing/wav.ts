/**
 * Enough WAV to read a recording into samples.
 *
 * Not a general decoder and not trying to be. What the test tier needs is
 * to turn a committed or fetched `.wav` into the mono `Float32Array` the
 * capture seam speaks, and the formats that reach us are the ones a
 * recording corpus ships: PCM, 16- or 24-bit, or 32-bit float.
 *
 * It refuses loudly rather than guessing. A decoder that returns silence
 * for a format it does not know turns "this file is compressed" into "the
 * detector found nothing", and the second is a much more expensive thing
 * to debug.
 */

export interface DecodedAudio {
  /** Mono, in [-1, 1]. Channels are averaged, not picked. */
  samples: Float32Array;
  sampleRate: number;
  /** How many channels the file had, before they were mixed down. */
  channels: number;
}

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

/** Decode a RIFF/WAVE buffer. Throws with the reason if it cannot. */
export function decodeWav(buffer: ArrayBuffer): DecodedAudio {
  const view = new DataView(buffer);
  const ascii = (at: number) => String.fromCharCode(
    view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3),
  );

  if (buffer.byteLength < 12 || ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataAt = -1;
  let dataLength = 0;

  // Walk the chunks rather than assuming `fmt ` then `data`: real files
  // carry LIST, fact and cue chunks between them, and a reader that
  // assumes the layout works on the file it was written against and no
  // other.
  let at = 12;
  while (at + 8 <= buffer.byteLength) {
    const id = ascii(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      // An extensible header states its real format in a GUID whose first
      // two bytes are the plain tag.
      if (format === FORMAT_EXTENSIBLE && size >= 26) format = view.getUint16(body + 24, true);
    } else if (id === 'data') {
      dataAt = body;
      dataLength = Math.min(size, buffer.byteLength - body);
    }
    // Chunks are word-aligned, so an odd size is followed by a pad byte.
    at = body + size + (size % 2);
  }

  if (dataAt < 0) throw new Error('No data chunk');
  if (channels < 1) throw new Error('No channels');
  if (format !== FORMAT_PCM && format !== FORMAT_FLOAT) {
    throw new Error(`Unsupported WAV format ${format}; only PCM and float are read`);
  }

  const bytes = bits / 8;
  if (![1, 2, 3, 4].includes(bytes)) throw new Error(`Unsupported bit depth ${bits}`);

  const total = Math.floor(dataLength / bytes);
  const perChannel = Math.floor(total / channels);
  const samples = new Float32Array(perChannel);

  for (let i = 0; i < perChannel; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      sum += sampleAt(view, dataAt + (i * channels + c) * bytes, format, bits);
    }
    // Averaged rather than taking channel one: a stereo recording of one
    // instrument often has it panned, and picking a channel would halve
    // the level for no reason the caller could see.
    samples[i] = sum / channels;
  }

  return { samples, sampleRate, channels };
}

/** One sample, normalised to [-1, 1]. */
function sampleAt(view: DataView, at: number, format: number, bits: number): number {
  if (format === FORMAT_FLOAT) return view.getFloat32(at, true);
  switch (bits) {
    // 8-bit PCM is unsigned, alone among the depths — the one special case
    // in the format that a reader cannot derive from the others.
    case 8: return (view.getUint8(at) - 128) / 128;
    case 16: return view.getInt16(at, true) / 32_768;
    case 24: {
      const lo = view.getUint8(at);
      const mid = view.getUint8(at + 1);
      const hi = view.getInt8(at + 2);
      return ((hi << 16) | (mid << 8) | lo) / 8_388_608;
    }
    case 32: return view.getInt32(at, true) / 2_147_483_648;
    default: throw new Error(`Unsupported bit depth ${bits}`);
  }
}
