import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function makePrismaClient() {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

  // Retry middleware: transparently reconnects on Neon idle-connection drops (P1001, P1017)
  return client.$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        const MAX_RETRIES = 3;
        let attempt = 0;
        while (true) {
          try {
            return await query(args);
          } catch (err) {
            attempt++;
            const isConnectionError =
              err instanceof Prisma.PrismaClientKnownRequestError &&
              (err.code === "P1001" || err.code === "P1017");

            if (isConnectionError && attempt < MAX_RETRIES) {
              console.warn(
                `[Prisma] Connection error on ${model}.${operation} (attempt ${attempt}/${MAX_RETRIES}). Retrying...`
              );
              await new Promise((r) => setTimeout(r, 500 * attempt));
              continue;
            }
            throw err;
          }
        }
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof makePrismaClient>;

const globalForExtendedPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient;
};

export const prisma: ExtendedPrismaClient =
  globalForExtendedPrisma.prisma ?? makePrismaClient();

if (process.env.NODE_ENV !== "production") globalForExtendedPrisma.prisma = prisma;
