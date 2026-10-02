import { PrismaClient, Role } from '@prisma/client';
import * as readline from 'readline';
import { hashPassword } from '../src/features/auth/password.utils';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => 
  new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('--- Initializing Vatsal Bath Gallery OWNER Account ---');
  
  // 1. Check if any OWNER already exists
  const existingOwner = await prisma.user.findFirst({
    where: { role: Role.OWNER },
  });

  if (existingOwner) {
    console.log('An OWNER account already exists. Setup aborted.');
    process.exit(0);
  }

  // 2. Prompt for credentials safely
  const name = await question('Enter OWNER Name: ');
  const emailInput = await question('Enter OWNER Email: ');
  const email = emailInput.toLowerCase().trim();

  // We should not echo password ideally, but node readline doesn't have a clean 
  // hidden input without external packages. Since this is an admin setup script
  // run by the dev locally, we'll try to hide it by muting stdout temporarily if we can,
  // or just use a basic prompt. Let's do a basic prompt but remind them it will be visible.
  // We'll write a quick muting wrapper.
  
  const password = await new Promise<string>((resolve) => {
    // Hide typing
    const stdin = process.stdin;
    stdin.resume();
    process.stdout.write('Enter OWNER Password: ');
    let pass = '';
    
    stdin.setRawMode(true);
    stdin.on('data', function (char: Buffer) {
      const charStr = char.toString('utf8');
      
      switch (charStr) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          console.log('');
          resolve(pass);
          break;
        case '\u0003':
          console.log('\nCancelled.');
          process.exit(1);
          break;
        case '\b':
        case '\x7f':
          pass = pass.slice(0, -1);
          break;
        default:
          pass += charStr;
          break;
      }
    });
  });

  if (!email || !password || password.length < 8) {
    console.error('Invalid input. Email is required and password must be at least 8 characters.');
    process.exit(1);
  }

  try {
    const hashedPassword = await hashPassword(password);
    
    // 3. Create the OWNER transactionally
    await prisma.$transaction(async (tx) => {
      // Re-check inside transaction to prevent race conditions
      const check = await tx.user.findFirst({
        where: { role: Role.OWNER },
      });
      if (check) throw new Error('OWNER already exists');

      await tx.user.create({
        data: {
          email,
          name,
          passwordHash: hashedPassword,
          role: Role.OWNER,
        },
      });
    });

    console.log(`\nSuccessfully created OWNER account for ${email}!`);
    console.log('You may now log in to the application.');

  } catch (error: unknown) {
    console.error('\nFailed to create OWNER account:', (error as Error).message);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main();
