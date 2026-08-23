/**
 * Just enough protobuf to read MEXC's public market stream.
 *
 * MEXC retired its JSON websocket channels — every `spot@public.*.v3.api@…`
 * subscription is now rejected, and only the `.pb` variants push data, as
 * binary protobuf frames. Rather than ship a schema compiler and a runtime for
 * one message, this walks the wire format directly: the encoding is
 * self-describing enough that the handful of fields we need can be read by
 * field number.
 *
 * Frame layout, confirmed against the live socket:
 *
 *   PushDataV3ApiWrapper
 *     1  channel   string   "spot@public.miniTicker.v3.api.pb@BTCUSDT@UTC+0"
 *     3  symbol    string   "BTCUSDT"
 *     6  sendTime  varint
 *   309  body      PublicMiniTickerV3Api
 *          1 symbol   2 price    3 rate     4 zonedRate
 *          5 high     6 low      7 volume   8 quantity
 *
 * `rate` is a fraction (0.0027 = +0.27%), matching the REST field.
 */

const BODY_FIELD = 309;

interface WireField {
  field: number;
  wire: number;
  value: Uint8Array | number;
}

/** Yields every top-level field of a protobuf message. */
function* readFields(buf: Uint8Array): Generator<WireField> {
  let i = 0;

  const varint = (): number => {
    let result = 0;
    let shift = 0;
    while (i < buf.length) {
      const byte = buf[i++] as number;
      // Beyond 2^53 precision is lost, but no field here is that large.
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
      if (!(byte & 0x80)) break;
    }
    return result;
  };

  while (i < buf.length) {
    const key = varint();
    const field = key >>> 3;
    const wire = key & 7;

    if (wire === 2) {
      const length = varint();
      yield { field, wire, value: buf.subarray(i, i + length) };
      i += length;
    } else if (wire === 0) {
      yield { field, wire, value: varint() };
    } else if (wire === 5) {
      i += 4;
    } else if (wire === 1) {
      i += 8;
    } else {
      return; // unknown wire type — the rest cannot be trusted
    }
  }
}

const decoder = new TextDecoder();
const text = (value: Uint8Array | number): string =>
  value instanceof Uint8Array ? decoder.decode(value) : String(value);

export interface MexcTick {
  symbol: string;
  price: number;
  /** 24h change in percent, already scaled from the wire's fraction. */
  changePct24h: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
}

/** Decodes one binary frame, or null if it is not a miniTicker push. */
export function decodeMiniTicker(frame: ArrayBuffer): MexcTick | null {
  let symbol = '';
  let body: Uint8Array | undefined;

  for (const { field, value } of readFields(new Uint8Array(frame))) {
    if (field === 3 && value instanceof Uint8Array) symbol = text(value);
    else if (field === BODY_FIELD && value instanceof Uint8Array) body = value;
  }
  if (!body) return null;

  const parts: Record<number, string> = {};
  for (const { field, value } of readFields(body)) {
    if (value instanceof Uint8Array) parts[field] = text(value);
  }

  const price = Number(parts[2]);
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    symbol: parts[1] || symbol,
    price,
    changePct24h: Number(parts[3] ?? 0) * 100,
    high24h: Number(parts[5] ?? 0),
    low24h: Number(parts[6] ?? 0),
    quoteVolume24h: Number(parts[7] ?? 0),
  };
}

export const MEXC_WS_URL = 'wss://wbs-api.mexc.com/ws';

/** The protobuf miniTicker channel for one symbol, in UTC. */
export const miniTickerChannel = (symbol: string): string =>
  `spot@public.miniTicker.v3.api.pb@${symbol.toUpperCase()}@UTC+0`;

/** MEXC closes idle sockets after 60s unless pinged. */
export const PING_FRAME = JSON.stringify({ method: 'PING' });
export const PING_INTERVAL_MS = 25_000;
/** Subscriptions per connection, per MEXC's documented limit of 30. */
export const MAX_CHANNELS = 30;
