// src/lib/wagmi.ts
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { http } from "wagmi";                  // 👈 ya no importamos createConfig
import { monadTestnet } from "./chains";

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID as string;

// 1) Crea el adapter de Wagmi con la red Monad Testnet
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
  },
});

// 2) Usa directamente el wagmiConfig que provee el adapter
export const config = wagmiAdapter.wagmiConfig;

// 3) Inicializa AppKit (modal Reown)
export const appKit = createAppKit({
  projectId,
  adapters: [wagmiAdapter],
  networks: [monadTestnet],
  features: { email: false, socials: false },
  metadata: {
    name: "KIOSKO",
    description: "Pagos P2P con conversión instantánea en Monad",
    url: window.location.origin,
    icons: [],
  },
});