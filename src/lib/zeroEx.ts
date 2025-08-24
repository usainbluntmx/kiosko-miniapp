// src/lib/zeroEx.ts
import type { Address, Hex } from "viem";

export type OxPrice = {
  price: string;
  buyAmount: string;
  sellAmount: string;
  value?: string;
};

export type OxQuote = {
  to: Address;
  data: Hex;
  buyAmount: string;
  value?: bigint;
  allowanceTarget?: Address;
};

export type GetOxCommonParams = {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string | bigint; // base units
  taker: Address;
  slippageBps?: number;        // 100 = 1%
  chainId?: number;            // default 10143
};

const DEFAULT_CHAIN_ID = 10143 as const;

const PROXY_QUOTE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_ZEROX_PROXY_URL) ||
  (typeof process !== "undefined" && process.env?.VITE_ZEROX_PROXY_URL) ||
  "";

// ---------- utils ----------
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
      const msg =
        j?.reason ||
        j?.message ||
        (j?.validationErrors?.length
          ? j.validationErrors.map((e: any) => `${e.field} ${e.reason}`).join(", ")
          : txt);
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

/** Normaliza 0x padded (32 bytes) a address 20 bytes */
function as20ByteAddress(maybe?: string): Address | undefined {
  if (!maybe) return undefined;
  if (maybe.startsWith("0x") && maybe.length === 42) return maybe as Address;
  if (maybe.startsWith("0x") && maybe.length === 66) {
    return ("0x" + maybe.slice(-40)) as Address;
  }
  return undefined;
}
function mustAddress(maybe: string | undefined, field: string): Address {
  const a = as20ByteAddress(maybe);
  if (!a) throw new Error(`0x quote inválido: ${field}=${maybe}`);
  return a;
}

function derivePriceUrl(from: string) {
  try {
    const u = new URL(from);
    u.pathname = u.pathname.replace(/quote$/, "price");
    return u.toString();
  } catch {
    return from.replace(/quote$/, "price");
  }
}
// ---------- end utils ----------

export async function getOxPrice(p: GetOxCommonParams): Promise<OxPrice> {
  if (!PROXY_QUOTE || !/\/quote$/.test(PROXY_QUOTE)) {
    throw new Error(
      `Config VITE_ZEROX_PROXY_URL inválida: "${PROXY_QUOTE}". Debe terminar en ".../swap/allowance-holder/quote".`
    );
  }
  const chainId = p.chainId ?? DEFAULT_CHAIN_ID;
  const url =
    `${derivePriceUrl(PROXY_QUOTE)}?` +
    toQuery({
      sellToken: p.sellToken,
      buyToken: p.buyToken,
      sellAmount: typeof p.sellAmount === "bigint" ? p.sellAmount.toString() : p.sellAmount,
      taker: p.taker,
      recipient: p.taker,
      slippageBps: p.slippageBps ?? 100,
      chainId,
    });

  const res = await fetch(url, { method: "GET" });
  return parseJsonOrThrow<OxPrice>(res);
}

export async function getOxQuote(p: GetOxCommonParams): Promise<OxQuote> {
  if (!PROXY_QUOTE || !/\/quote$/.test(PROXY_QUOTE)) {
    throw new Error(
      `Config VITE_ZEROX_PROXY_URL inválida: "${PROXY_QUOTE}". Debe terminar en ".../swap/allowance-holder/quote".`
    );
  }
  const chainId = p.chainId ?? DEFAULT_CHAIN_ID;
  const url =
    `${PROXY_QUOTE}?` +
    toQuery({
      sellToken: p.sellToken,
      buyToken: p.buyToken,
      sellAmount: typeof p.sellAmount === "bigint" ? p.sellAmount.toString() : p.sellAmount,
      taker: p.taker,
      recipient: p.taker, // fuerza output al taker
      slippageBps: p.slippageBps ?? 100,
      chainId,
    });

  const res = await fetch(url, { method: "GET" });
  const j = await parseJsonOrThrow<any>(res);

  // soporta formatos alternativos (algunos proxies/SDKs)
  const toRaw =
    j.to ?? j.tx?.to ?? j.transaction?.to ?? j.swapTransaction?.to ?? j.swap?.to;
  const dataRaw =
    j.data ?? j.tx?.data ?? j.transaction?.data ?? j.swapTransaction?.data ?? j.swap?.data;
  const valueRaw =
    j.value ?? j.tx?.value ?? j.transaction?.value ?? j.swapTransaction?.value ?? j.swap?.value;
  const buyAmountRaw =
    j.buyAmount ?? j.buyAmountBaseUnits ?? j.buyAmountWei ?? j.outputAmount;
  const allowanceRaw =
    j.allowanceTarget ?? j.allowanceTargetAddress ?? j.spender;

  return {
    to: mustAddress(toRaw, "to"),
    data: dataRaw as Hex,
    buyAmount: String(buyAmountRaw),
    value: valueRaw ? BigInt(valueRaw) : undefined,
    allowanceTarget: as20ByteAddress(allowanceRaw),
  };
}

export default { getOxPrice, getOxQuote };