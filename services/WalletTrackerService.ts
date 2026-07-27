import { prisma } from "@/lib/prisma";
import { WalletAnalyticsService } from "@/services/WalletAnalyticsService";
import { WalletScoringEngine } from "@/services/WalletScoringEngine";
import { botDetectionService } from "@/services/BotDetectionService";
import { walletIntegrityService } from "@/services/WalletIntegrityService";

const analyticsService = new WalletAnalyticsService();
const scoringEngine = new WalletScoringEngine();

export class WalletTrackerService {
  async refreshWalletAnalysis(walletId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        transactions: true,
        trades: {
          include: {
            token: { select: { symbol: true, isSpam: true } }
          }
        },
        score: true,
      },
    });

    if (!wallet) {
      return { status: "not_found" as const };
    }

    const botResult = botDetectionService.analyze(wallet.transactions, wallet.trades);
    const integrityResult = walletIntegrityService.analyze(wallet.trades);

    const analytics = analyticsService.summarizeTrades(wallet.trades, integrityResult.integrityPenalty);

    if (!analytics) {
      await prisma.$transaction([
        prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            smartScore: null,
            riskScore: null,
            isSuspectedBot: botResult.isSuspectedBot,
            botType: botResult.botType,
            botConfidence: botResult.botConfidence,
            integrityFlags: JSON.stringify(integrityResult.integrityFlags),
            integrityPenalty: integrityResult.integrityPenalty,
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
    const { integrityPenalty, ...scoreData } = score;

    const [, walletScore] = await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          smartScore: score.totalScore,
          riskScore: score.riskScore,
          isSuspectedBot: botResult.isSuspectedBot,
          botType: botResult.botType,
          botConfidence: botResult.botConfidence,
          integrityFlags: JSON.stringify(integrityResult.integrityFlags),
          integrityPenalty: integrityResult.integrityPenalty,
        },
      }),
      prisma.walletScore.upsert({
        where: { walletId: wallet.id },
        create: {
          walletId: wallet.id,
          ...scoreData,
        },
        update: {
          ...scoreData,
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
