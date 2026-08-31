import express, { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { publishExternalSignal } from '../services/telegram/alerts.service.js';
import { getHeadlineEvent } from '../services/calendar.service.js';
import {
  authorise,
  claimAlert,
  parseAlert,
  toSignal,
} from '../services/webhooks/tradingview.service.js';

/**
 * Inbound alerts from outside the engine.
 *
 * Its own router rather than another handful of routes in `index.ts`, because
 * everything here is a different kind of endpoint: unauthenticated by default,
 * called by a third party that cannot be asked to change, and able to open a
 * real trade on one POST. Keeping that surface in one file makes it possible to
 * read all of it at once, which is the only way anybody notices a hole.
 */
export const webhooks = Router();

/*
 * A second body parser, because TradingView does not reliably say what it is
 * sending.
 *
 * The app parses `application/json`. TradingView posts the alert message as
 * `text/plain` in many configurations — the message box holds JSON, but the
 * header describes it as text — and against a JSON-only parser that arrives as
 * an empty body and a confusing 400 about a missing symbol.
 *
 * So anything the app's parser passed over is read as text here and parsed
 * below. `_body` is Express's own marker for "already consumed", so this never
 * double-reads a stream.
 */
webhooks.use(express.text({ type: '*/*', limit: '64kb' }));

/**
 * The alert body, whichever parser produced it.
 *
 * Returns `undefined` rather than throwing on unparseable text, so the caller
 * can answer with a reason instead of a stack trace — the reason is what shows
 * up in TradingView's alert log, and it is the only debugging surface the
 * person editing the alert has.
 */
function readJson(body: unknown): unknown {
  if (typeof body !== 'string') return body;

  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** Errors are answered, never thrown: TradingView shows the body in its log. */
const route =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('[webhook] failed:', (error as Error).message);
      res.status(500).json({ ok: false, error: 'internal error' });
    }
  };

/**
 * `POST /api/webhooks/tradingview`
 *
 * Opens a trade from a TradingView alert, with the same ladder, breakeven rule
 * and place in the record as a call the engine found itself.
 *
 * **404s while `TRADINGVIEW_WEBHOOK_SECRET` is unset.** An unconfigured deploy
 * denies the endpoint exists rather than advertising an unguarded one — the
 * same rule the cron and admin routes follow. A 401 here would tell a scanner
 * it had found something worth returning to.
 *
 * The secret is compared in constant time and accepted from a header, the query
 * string or the body. Only the last two are reachable from TradingView, which
 * cannot set request headers on an alert; the header exists for everything else
 * that might post here.
 */
webhooks.post(
  '/tradingview',
  route(async (req, res) => {
    if (!env.tradingViewSecret) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const body = readJson(req.body);
    if (body === undefined) {
      res.status(400).json({ ok: false, error: 'body is not valid JSON' });
      return;
    }

    if (!authorise(req.headers as Record<string, unknown>, req.query, body)) {
      /*
       * Deliberately identical to a bad path from the outside. The one thing
       * this must not do is tell a caller that the endpoint exists and only the
       * secret was wrong, which turns a guess into a target.
       */
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const parsed = parseAlert(body);
    if (!parsed.ok) {
      // Read by a person editing an alert, so it names what was wrong.
      res.status(400).json({ ok: false, error: parsed.reason });
      return;
    }

    /*
     * Claimed before anything is published. TradingView resends while a
     * condition holds unless the alert is set to fire once, and a duplicate
     * here is not a duplicate message — it is a second position on the same
     * setup, at the same levels, counted twice in the record.
     */
    if (!(await claimAlert(parsed.alert.dedupeKey))) {
      res.json({ ok: true, duplicate: true, symbol: parsed.alert.symbol });
      return;
    }

    const signal = await toSignal(parsed.alert);
    const event = await getHeadlineEvent().catch(() => undefined);
    const { trade, delivered, superseded, reason } = await publishExternalSignal(signal, event);

    if (!trade) {
      /*
       * Two very different outcomes, and they used to share one message.
       *
       * A call already being tracked is a success from the caller's point of
       * view — the position exists, and opening a second on the same setup is
       * the thing being prevented. Bad levels are a failure they have to go and
       * fix. Answering both with "the ledger refused these levels" sent
       * somebody hunting through decimals that were never wrong.
       */
      if (reason === 'standing') {
        res.json({ ok: true, alreadyOpen: true, symbol: parsed.alert.symbol });
        return;
      }

      res.status(422).json({
        ok: false,
        error:
          reason === 'ladder'
            ? 'no target rung lands inside a sane band — the stop is too wide'
            : 'the ledger refused these levels',
      });
      return;
    }

    res.json({
      ok: true,
      symbol: trade.symbol,
      side: trade.side,
      entry: trade.entry,
      stopLoss: trade.stopLoss,
      // The ladder the alert did not have to compute.
      targets: (trade.targets ?? []).map((target) => ({
        level: target.level,
        price: target.price,
        share: target.share,
      })),
      delivered,
      ...(superseded ? { superseded } : {}),
    });
  }),
);
