/**
 * Promote a user to OWNER (the only role that unlocks dev affordances like
 * test accounts). Role is `input: false` in the auth config, so it can never be
 * set from the client — this script is the out-of-band grant.
 *
 * Run with: bun --env-file=.env scripts/set-owner.ts <email>
 * Defaults to aidankmcalister@gmail.com when no email is given.
 */
import prisma from "../src/lib/prisma.server";

const email = process.argv[2] ?? "aidankmcalister@gmail.com";

async function main() {
  const user = await prisma.user.update({
    where: { email },
    data: { role: "OWNER" },
    select: { id: true, email: true, role: true },
  });
  console.log(`Promoted ${user.email} → ${user.role}`);
}

main()
  .catch((error) => {
    if (error?.code === "P2025") {
      console.error(`No user found with email "${email}".`);
    } else {
      console.error("Failed to set owner:", error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
