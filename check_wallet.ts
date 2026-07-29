import { prisma } from './lib/prisma';
async function main() {
  const wallet = await prisma.wallet.findFirst({
    where: { address: 'GGek6MJqkLeFBjaNnF3o4pWuhu2twfxjpZ3b2qf4DgLN' },
    include: { copyTradeSettings: true, executionRecords: true, trades: { include: { token: true } }, transactions: { include: { token: true } } }
  });
  console.log("Wallet:", JSON.stringify(wallet, null, 2));
}
main().finally(() => process.exit(0));
