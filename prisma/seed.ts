import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // NOTE: We do not seed the initial OWNER account here.
  // The creation of the first OWNER account will be handled by a secure 
  // first-run setup flow in the application UI (to be implemented in Phase 2),
  // which will properly hash the password and ensure credentials are never
  // stored or passed in plaintext/environment variables.

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
