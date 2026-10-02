import { createServer, IncomingMessage, ServerResponse } from 'node:http';

import { FoodQuery, FoodUnit, NutritionLookupError, NutritionErrorBody } from './types';
import type { NutritionProvider } from './providers/NutritionProvider';
import { UsdaFoodDataCentralProvider } from './providers/usdaFoodDataCentralProvider';
import { CatalogNutritionProvider } from './providers/catalogNutritionProvider';

/**
 * Stage 12 — the server-side HTTP boundary the Expo client talks to.
 *
 * This is intentionally a plain Node `http` server with zero third-party
 * dependencies (no Express, no framework) — the goal for this stage is a
 * clean, small adapter, not a full backend. It exposes exactly one route:
 *
 *   POST /v1/nutrition/lookup   body: FoodQuery   →  FoodNutritionResult
 *
 * This process is NOT part of the Expo/React Native bundle — it is meant
 * to be deployed separately (any Node host: a small VM, a container, or
 * adapted into a serverless function) and reached by the app over HTTPS
 * via `EXPO_PUBLIC_NUTRITION_API_URL`. The USDA FDC API key lives only in
 * this process's environment and is never sent to or bundled into the
 * client. See server/README.md for how to actually deploy and connect it.
 */

const VALID_UNITS: FoodUnit[] = ['adet', 'gram', 'ml', 'porsiyon'];

function isFoodQuery(value: unknown): value is FoodQuery {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.foodName === 'string' &&
    v.foodName.trim().length > 0 &&
    typeof v.quantity === 'number' &&
    Number.isFinite(v.quantity) &&
    v.quantity > 0 &&
    typeof v.unit === 'string' &&
    VALID_UNITS.includes(v.unit as FoodUnit)
  );
}

function statusForErrorCode(code: NutritionLookupError['code']): number {
  switch (code) {
    case 'food_not_found':
      return 404;
    case 'ambiguous_food':
    case 'unsupported_unit':
      return 422;
    case 'server_configuration_error':
      return 500;
    case 'provider_unavailable':
    case 'network_unavailable':
      return 502;
    case 'malformed_response':
      return 502;
    default:
      return 500;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function sendError(res: ServerResponse, code: NutritionLookupError['code'], message: string): void {
  const body: NutritionErrorBody = { error: { code, message } };
  sendJson(res, statusForErrorCode(code), body);
}

/** A lookup body is a few dozen bytes; anything bigger is rejected unread. */
const MAX_BODY_BYTES = 4 * 1024;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large.');
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim().length === 0) return {};
  return JSON.parse(raw);
}

/**
 * Simple per-client rate limit (fixed 1-minute window, in memory) so one
 * client cannot exhaust the shared USDA API key quota. Generous for real
 * use: a person logging food makes only a few lookups per minute.
 */
const RATE_LIMIT_PER_MINUTE = 60;
const rateWindows = new Map<string, { windowStart: number; count: number }>();

function clientId(req: IncomingMessage): string {
  // Behind Render's proxy the real client is the first X-Forwarded-For entry.
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

function isRateLimited(req: IncomingMessage): boolean {
  const now = Date.now();
  const id = clientId(req);
  const entry = rateWindows.get(id);
  if (!entry || now - entry.windowStart >= 60_000) {
    if (rateWindows.size > 10_000) rateWindows.clear();
    rateWindows.set(id, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_PER_MINUTE;
}

/**
 * Builds the request handler. Takes the provider as a parameter (rather
 * than constructing it inline) so a different `NutritionProvider` can be
 * swapped in — for tests, or for a second real provider later — without
 * editing this function.
 */
export function createNutritionHandler(provider: NutritionProvider | null) {
  return async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Permissive CORS for local development only: this lets the Expo web
    // target (and any browser-based test harness) call this server directly
    // from a different origin/port. React Native on iOS/Android is not a
    // browser and never enforces CORS, so this has no effect on the mobile
    // app — it only unblocks browser-based testing and local dev tooling.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method !== 'POST' || req.url !== '/v1/nutrition/lookup') {
      sendJson(res, 404, { error: { code: 'not_found', message: 'Unknown route.' } });
      return;
    }

    if (isRateLimited(req)) {
      sendJson(res, 429, {
        error: { code: 'provider_unavailable', message: 'Too many requests. Please try again in a minute.' },
      });
      return;
    }

    if (!provider) {
      sendError(res, 'server_configuration_error', 'USDA_FDC_API_KEY is not configured on this server.');
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      sendError(res, 'malformed_response', 'Request body was not valid JSON.');
      return;
    }

    if (!isFoodQuery(body)) {
      sendError(res, 'malformed_response', 'Request body did not match the expected FoodQuery shape.');
      return;
    }

    try {
      const result = await provider.lookup(body);
      sendJson(res, 200, result);
    } catch (error) {
      if (error instanceof NutritionLookupError) {
        sendError(res, error.code, error.message);
        return;
      }
      // Anything unexpected is still reported as a typed error — the
      // client must never see a raw/unrecognized error shape.
      sendError(res, 'provider_unavailable', 'Unexpected error while looking up nutrition data.');
    }
  };
}

/** Entry point — starts listening when this file is run directly (`node server.js`). */
function main(): void {
  const port = Number(process.env.PORT ?? 8787);
  const apiKey = process.env.USDA_FDC_API_KEY;
  // The verified catalog answers every predefined food on its own; the USDA
  // key only enables the unverified free-text fallback for unknown names.
  const provider = new CatalogNutritionProvider(apiKey ? new UsdaFoodDataCentralProvider(apiKey) : null);

  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('USDA_FDC_API_KEY is not set — catalog foods work, the free-text USDA fallback is disabled.');
  }

  const server = createServer((req, res) => {
    createNutritionHandler(provider)(req, res).catch(() => {
      sendError(res, 'provider_unavailable', 'Unexpected server error.');
    });
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`YAK nutrition service listening on port ${port}`);
  });
}

if (require.main === module) {
  main();
}
