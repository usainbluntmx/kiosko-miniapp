// Flujo: approve (si falta) → swap 0x → transfer del buyToken al receiver
import type { Address, Hex } from "viem";
import {
  getPublicClient,
  getWalletClient,
  getChainId,
  switchChain,
} from "@wagmi/core";
import { parseAbiItem } from "viem";
import { config as wagmiConfig } from "../lib/wagmi";
import { ensureAllowance, readBalanceOf, sendTransfer } from "../lib/erc20";

export type OxQuote = {
  to: Address;
  data: Hex;
  value?: bigint;
  buyAmount: string;         // base units
  allowanceTarget?: Address;
};

export type SwapAndPayParams = {
  quote: OxQuote;
  receiver: Address;
  buyTokenAddress: Address;
  autoApprove?: { sellToken: Address; sellAmount: bigint };
};

export type SwapAndPayResult = {
  swapHash: `0x${string}`;
  transferHash: `0x${string}`;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function swapAndPay(params: SwapAndPayParams): Promise<SwapAndPayResult> {
  const { quote, receiver, buyTokenAddress, autoApprove } = params;

  const publicClient = getPublicClient(wagmiConfig);
  if (!publicClient) throw new Error("No se pudo obtener publicClient.");
  const walletClient = await getWalletClient(wagmiConfig);
  if (!walletClient) throw new Error("Conecta tu wallet para continuar.");

  const account = walletClient.account?.address as Address | undefined;
  if (!account) throw new Error("No se detectó la cuenta conectada.");

  // Garantiza chainId=10143
  const current = await getChainId(wagmiConfig);
  if (current !== 10143) {
    try {
      await switchChain(wagmiConfig, { chainId: 10143 });
    } catch {
      await walletClient.switchChain?.({ id: 10143 });
    }
  }

  // Approve si falta
  if (autoApprove && quote.allowanceTarget) {
    const { approved, txHash } = await ensureAllowance({
      provider: publicClient as any,
      wallet: walletClient as any,
      token: autoApprove.sellToken,
      owner: account,
      spender: quote.allowanceTarget as Address,
      requiredAmount: autoApprove.sellAmount,
      useExact: false, // infinito
    });
    if (!approved && txHash) {
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    }
  }

  // Sanity check del 'to'
  if (!quote.to || (quote.to as string).length !== 42) {
    throw new Error(`Quote inválido: 'to' no es address 20 bytes: ${quote.to}`);
  }

  // SWAP
  const swapHash = await walletClient.sendTransaction({
    to: quote.to,
    data: quote.data,
    value: quote.value ?? 0n,
    account,
  });
  const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });

  // Lee balance del buyToken con reintentos
  const expectedOut = BigInt(quote.buyAmount);
  const tries = 6;
  let balance = 0n;
  for (let i = 0; i < tries; i++) {
    balance = await readBalanceOf(publicClient as any, buyTokenAddress, account);
    if (balance > 0n) break;
    await sleep(250);
  }

  if (balance === 0n) {
    try {
      const TransferEvt = parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 value)"
      );
      const logs = await publicClient.getLogs({
        address: buyTokenAddress,
        event: TransferEvt,
        args: { to: account },
        fromBlock: swapReceipt.blockNumber,
        toBlock: swapReceipt.blockNumber,
      });
      console.warn("[swapAndPay] Transfer logs hacia taker", logs);
    } catch {}
    throw new Error("No se recibió el buyToken tras el swap. Revisa tokens/decimales/slippage.");
  }

  // Transfer al receiver (manda el menor entre balance y expectedOut)
  const amountToSend = balance < expectedOut ? balance : expectedOut;
  const transferHash = await sendTransfer(
    walletClient as any,
    buyTokenAddress,
    receiver,
    amountToSend,
    account
  );

  return { swapHash, transferHash };
}