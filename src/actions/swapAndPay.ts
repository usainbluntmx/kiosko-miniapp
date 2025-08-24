// /src/actions/swapAndPay.ts
// Flujo 2 pasos: (1) swap con 0x  →  (2) transfer del buyToken al receiver
// Compatible con tu erc20.ts que requiere provider/wallet explícitos

import type { Address, Hex } from "viem";
import { getPublicClient, getWalletClient } from "@wagmi/core";
import { config as wagmiConfig } from "../lib/wagmi"; // ajusta la ruta si está en otro lado
import {
  ensureAllowance,
  readBalanceOf,
  sendTransfer,
} from "../lib/erc20";

// Tipos mínimos del quote que devuelve 0x (allowance-holder/quote)
export type OxQuote = {
  to: Address;
  data: Hex;
  value?: bigint;            // normalmente 0n en ERC20→ERC20
  buyAmount: string;         // base units (string)
  allowanceTarget?: Address; // spender para approve del sellToken
};

export type SwapAndPayParams = {
  quote: OxQuote;               // respuesta de 0x
  receiver: Address;            // wallet destino (comercio)
  buyTokenAddress: Address;     // token que recibes del swap y vas a transferir (p. ej., USDC)
  autoApprove?: {               // opcional: hacer approve automático si falta
    sellToken: Address;         // token que vendes (p. ej., WMON)
    sellAmount: bigint;         // base units
  };
};

export type SwapAndPayResult = {
  swapHash: `0x${string}`;
  transferHash: `0x${string}`;
};

// Helpers internos para asegurar clientes
function requirePublicClient() {
  const pc = getPublicClient(wagmiConfig);
  if (!pc) throw new Error("No se pudo obtener publicClient. Revisa tu WagmiConfig.");
  return pc;
}
async function requireWalletClient() {
  const wc = await getWalletClient(wagmiConfig);
  if (!wc) throw new Error("Conecta tu wallet para continuar.");
  return wc;
}

/**
 * 1) (opcional) ensureAllowance infinito si falta
 * 2) Ejecuta el swap (to+data[+value])
 * 3) Transfiere buyToken al receiver (min(balance, buyAmount))
 */
export async function swapAndPay(params: SwapAndPayParams): Promise<SwapAndPayResult> {
  const { quote, receiver, buyTokenAddress, autoApprove } = params;

  const publicClient = requirePublicClient();
  const walletClient = await requireWalletClient();

  const account = walletClient.account?.address as Address | undefined;
  if (!account) throw new Error("No se detectó la cuenta conectada.");

  // (1) Approve automático si hace falta y tenemos allowanceTarget
  if (autoApprove && quote.allowanceTarget) {
    await ensureAllowance({
      provider: publicClient as any,       // ✅ ahora pasamos provider
      wallet: walletClient as any,         // ✅ y wallet
      token: autoApprove.sellToken,
      owner: account,
      spender: quote.allowanceTarget,
      requiredAmount: autoApprove.sellAmount,
      useExact: false, // infinito (one-time approve UX)
    });
    // Si quieres esperar confirmación del approve aquí, puedes capturar el txHash
    // y esperar el receipt; en tu erc20.ts ensureAllowance ya devuelve { approved, txHash? }.
  }

  // (2) SWAP vía 0x
  const swapHash = await walletClient.sendTransaction({
    to: quote.to,
    data: quote.data,
    value: quote.value ?? 0n,
    account,
  });

  await publicClient.waitForTransactionReceipt({ hash: swapHash });

  // (3) TRANSFER del buyToken al receiver
  const expectedOut = BigInt(quote.buyAmount);

  // ✅ readBalanceOf requiere (provider, token, owner)
  const balance = await readBalanceOf(publicClient as any, buyTokenAddress, account);

  const amountToSend = balance < expectedOut ? balance : expectedOut;
  if (amountToSend === 0n) {
    throw new Error("No se recibió el buyToken tras el swap. Revisa tokens/decimales/slippage.");
  }

  // ✅ sendTransfer requiere (wallet, token, to, amount, account?)
  const transferHash = await sendTransfer(
    walletClient as any,
    buyTokenAddress,
    receiver,
    amountToSend,
    account
  );

  return { swapHash, transferHash };
}