import { prisma } from "@/lib/prisma";
import { WalletAnalyticsService } from "@/services/WalletAnalyticsService";
import { WalletScoringEngine } from "@/services/WalletScoringEngine";

const analyticsService = new WalletAnalyticsService();
const scoringEngine = new WalletScoringEngine();

export class WalletTrackerService {
  async refreshWalletAnalysis(walletId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        trades: true,
        score: true,
      },
    });

    if (!wallet) {
      return { status: "not_found" as const };
    }

    const analytics = analyticsService.summarizeTrades(wallet.trades);

    if (!analytics) {
      await prisma.$transaction([
        prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            smartScore: null,
            riskScore: null,
          },
        }),
        prisma.walletScore.deleteMany({
          where: { walletId: wallet.id },
        }),
      ]);

      return {
        status: "no_trades" as const,
        walletId: wallet.id,
      };
    }

    const score = scoringEngine.calculateScore(analytics);

    const [, walletScore] = await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          smartScore: score.totalScore,
          riskScore: score.riskScore,
        },
      }),
      prisma.walletScore.upsert({
        where: { walletId: wallet.id },
        create: {
          walletId: wallet.id,
          ...score,
        },
        update: {
          ...score,
          updatedAt: new Date(),
        },
      }),
    ]);

    return {
      status: "refreshed" as const,
      walletId: wallet.id,
      analytics,
      score: walletScore,
    };
  }
}

export const walletTrackerService = new WalletTrackerService();
