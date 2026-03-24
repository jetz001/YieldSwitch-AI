import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "user@yieldswitch.ai" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }
        
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })
        
        if (!user || user.status === 'BANNED' || user.status === 'SUSPENDED') {
          return null
        }

        if (!user.passwordHash) {
          // User exists but registered with Google initially, no password stored.
          return null
        }
        
        const passwordsMatch = await bcrypt.compare(credentials.password, user.passwordHash)
        
        if (passwordsMatch) {
          return { id: user.id, email: user.email, role: user.role }
        }
        
        return null
      }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      if (token?.sub) {
        const user = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true, status: true }
        })
        
        if (user) {
          session.user.id = token.sub;
          session.user.role = user.role;
          session.user.status = user.status;
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    }
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: '/login',
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
