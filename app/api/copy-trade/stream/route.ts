import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial fetch of recent executions
      try {
        const records = await prisma.executionRecord.findMany({
          take: 10,
          orderBy: { timestamp: "desc" },
          include: { wallet: true, token: true },
        });
        sendEvent({ type: "INITIAL", records });
      } catch (err) {
        console.error("[SSE Stream] Initial fetch error:", err);
      }

      // Interval polling loop for new executions
      let lastChecked = new Date();
      const interval = setInterval(async () => {
        try {
          const newRecords = await prisma.executionRecord.findMany({
            where: { timestamp: { gt: lastChecked } },
            orderBy: { timestamp: "desc" },
            include: { wallet: true, token: true },
          });

          if (newRecords.length > 0) {
            lastChecked = new Date();
            sendEvent({ type: "UPDATE", records: newRecords });
          }
        } catch (e) {
          // ignore stream poll error
        }
      }, 3000);

      // Clean up interval when client disconnects
      return () => {
        clearInterval(interval);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
