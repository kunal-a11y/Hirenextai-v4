import pkg from '@prisma/client'
const { PrismaClient } = pkg

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.users.findMany()
  console.log(users)
}

main()
