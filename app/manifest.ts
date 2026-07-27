import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wallet Tracker & Copy Trader",
    short_name: "WalletTracker",
    description: "An automated crypto wallet tracker and copy-trading bot for Solana.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a", // slate-900
    theme_color: "#0f172a", // slate-900
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
