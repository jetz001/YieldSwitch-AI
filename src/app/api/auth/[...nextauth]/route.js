import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

export const authOptions = {
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
        console.log('[Auth] Authorize call with:', credentials?.email);
        if (!credentials?.email || !credentials?.password) {
          return null
        }
        
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })
        
        if (!user || user.status === 'BANNED' || user.status === 'SUSPENDED') {
          console.log('[Auth] User not found or not active:', credentials?.email);
          return null
        }

        if (!user.passwordHash) {
          console.log('[Auth] User has no password (Google user?):', credentials?.email);
          return null
        }
        
        const passwordsMatch = await bcrypt.compare(credentials.password, user.passwordHash)
        
        if (passwordsMatch) {
          console.log('[Auth] Success for:', credentials?.email);
          return { id: user.id, email: user.email, role: user.role }
        }
        
        console.log('[Auth] Password mismatch for:', credentials?.email);
        return null
      }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      console.log('[Auth] Session callback for:', token?.sub);
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
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
