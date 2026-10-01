import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: env.LOG_LEVEL === 'debug' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
