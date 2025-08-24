// /src/lib/zeroEx.ts
// 0x Swap API v2 helpers vía PROXY (evita CORS y ocultas API key/headers)
// - Usa VITE_ZEROX_PROXY_URL (ej: https://.../quote)
// - Si llamas getOxPrice, derive /price a partir de la URL del proxy.

import type { Address, Hex } from "viem";

export type OxPrice = {
  price: string;
  buyAmount: string;   // base units
  sellAmount: string;  // base units
  value?: string;
};

export type OxQuote = {
  to: Address;
  data: Hex;
  buyAmount: string;            // base units
  value?: bigint;
  allowanceTarget?: Address;
};

export type GetOxCommonParams = {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string | bigint;  // base units
  taker: Address;
  slippageBps?: number;
  chainId?: number;             // default 10143
};

const DEFAULT_CHAIN_ID = 10143 as const;

// Base del proxy (no agregamos headers desde el cliente)
const PROXY_QUOTE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_ZEROX_PROXY_URL) ||
  (typeof process !== "undefined" && process.env?.VITE_ZEROX_PROXY_URL) ||
  "";
if (!PROXY_QUOTE) {
  // eslint-disable-next-line no-console
  console.warn("[0x] No hay VITE_ZEROX_PROXY_URL. Configúralo en .env");
}

// Derivar /price desde /quote si aplica
function derivePriceUrl(from: string) {
  try {
    const u = new URL(from);
    u.pathname = u.pathname.replace(/quote$/, "price");
    return u.toString();
  } catch {
    // fallback simple si no es URL válida
    return from.replace(/quote$/, "price");
  }
}

function toQuery(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) q.append(k, String(v));
  }
  return q.toString();
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const txt = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(txt);
      const msg = j?.validationErrors?.length
        ? `${j.reason || "ValidationError"}: ${j.validationErrors
            .map((e: any) => `${e?.field} ${e?.reason}`)
            .join(", ")}`
        : j?.reason || j?.message || txt;
      throw new Error(`0x API error (${res.status}): ${msg}`);
    } catch {
      throw new Error(`0x API error (${res.status}): ${txt}`);
    }
  }
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new Error("No se pudo parsear la respuesta de 0x.");
  }
}

// ------- API (vía proxy) -------

/** Vista previa (sin calldata) — usa /price del proxy si existe */
export async function getOxPrice(p: GetOxCommonParams): Promise<OxPrice> {
  const chainId = p.chainId ?? DEFAULT_CHAIN_ID;
  const priceUrl = derivePriceUrl(PROXY_QUOTE);
  const url =
    `${priceUrl}?` +
    toQuery({
      sellToken: p.sellToken,
      buyToken: p.buyToken,
      sellAmount: typeof p.sellAmount === "bigint" ? p.sellAmount.toString() : p.sellAmount,
      taker: p.taker,
      slippageBps: p.slippageBps ?? 100,
      chainId,
    });

  const res = await fetch(url, { method: "GET" });
  return parseJsonOrThrow<OxPrice>(res);
}

/** Cotización ejecutable (to+data+allowanceTarget) — usa /quote del proxy */
export async function getOxQuote(p: GetOxCommonParams): Promise<OxQuote> {
  const chainId = p.chainId ?? DEFAULT_CHAIN_ID;
  const url =
    `${PROXY_QUOTE}?` +
    toQuery({
      sellToken: p.sellToken,
      buyToken: p.buyToken,
      sellAmount: typeof p.sellAmount === "bigint" ? p.sellAmount.toString() : p.sellAmount,
      taker: p.taker,
      slippageBps: p.slippageBps ?? 100,
      chainId,
    });

  const res = await fetch(url, { method: "GET" });
  const j = await parseJsonOrThrow<any>(res);

  return {
    to: j.to,
    data: j.data as Hex,
    buyAmount: j.buyAmount,
    value: j.value ? BigInt(j.value) : undefined,
    allowanceTarget: j.allowanceTarget as Address | undefined,
  };
}

export default { getOxPrice, getOxQuote };