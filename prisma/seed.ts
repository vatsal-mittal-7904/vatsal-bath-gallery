import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/features/auth/password.utils';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  const existingOwner = await prisma.user.findFirst({
    where: { role: Role.OWNER }
  });

  if (!existingOwner) {
    const passwordHash = await hashPassword('Password123!');
    await prisma.user.create({
      data: {
        email: 'owner@vatsal.com',
        name: 'Store Owner',
        passwordHash,
        role: Role.OWNER,
        isActive: true,
      }
    });
    console.log('Seeded initial OWNER account: owner@vatsal.com / Password123!');
  } else {
    console.log('Existing OWNER account already present.');
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
