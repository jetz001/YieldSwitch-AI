import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore"

async function hashPassword(password) {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "user@yieldswitch.ai" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("email", "==", credentials.email));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) return null;
          
          const userDoc = querySnapshot.docs[0];
          const user = { id: userDoc.id, ...userDoc.data() };
          
          if (user.status === 'BANNED' || user.status === 'SUSPENDED') return null;
          if (!user.passwordHash) return null;
          
          const inputHash = await hashPassword(credentials.password);
          if (user.passwordHash === inputHash || user.passwordHash === credentials.password) {
            return { id: user.id, email: user.email, role: user.role };
          }
          return null;
        } catch (error) {
          return null;
        }
      }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      if (token?.sub) {
        try {
          const userDocRef = doc(db, "users", token.sub);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            session.user.id = token.sub;
            session.user.role = userData.role;
            session.user.status = userData.status;
          }
        } catch (error) {}
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) token.role = user.role;
      return token;
    }
  },
  session: { strategy: "jwt" },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET || "fallback_secret_for_build",
  trustHost: true
})
