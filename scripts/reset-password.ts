import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error("Aufruf: npm run db:reset-password -- email@example.com NeuesPasswort");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error("Konto nicht gefunden.");
    process.exit(1);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
  });
  console.log(`Passwort für ${email} gesetzt. Beim nächsten Login ändern.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
