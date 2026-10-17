// Create an AuraTrade account, or reset its password, on the hosted server
// (sign-up is closed there; see docs/DEPLOYMENT.md). The password is read from
// stdin, never from the command line, so it stays out of shell history and
// the process list:
//
//   docker compose ... run --rm -T migrate node deploy/set-user.mjs \
//     --email you@example.com --name "Your Name"
//
// Runs in the `migrate` image, which has the generated Prisma client and
// bcryptjs. Hashing matches src/app/api/auth/register/route.ts (bcrypt, cost 12).
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import prismaPackage from "../src/generated/prisma/index.js";

const { PrismaClient } = prismaPackage;
const MIN_PASSWORD_LENGTH = 12;

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" } },
});
const email = values.email?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node deploy/set-user.mjs --email <address> [--name <name>] < password");
  process.exit(2);
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const password = input.split(/\r?\n/)[0];
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`The password on stdin must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(2);
}

const prisma = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, ...(values.name ? { name: values.name } : {}) },
    });
    console.log(`Password reset for ${email}.`);
  } else {
    await prisma.user.create({ data: { email, name: values.name ?? null, passwordHash } });
    console.log(`Account created for ${email}.`);
  }
} finally {
  await prisma.$disconnect();
}
