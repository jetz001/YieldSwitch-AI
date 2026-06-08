export const runtime = 'edge';
import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore"

// Web Crypto API helper for basic hashing since bcryptjs isn't edge compatible
// Note: Existing bcrypt hashes cannot be verified this way. 
// For a production app, consider migrating to Firebase Auth entirely.
async function hashPassword(password) {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
      async authorize(credentials, _req) {
        console.log('[Auth] Authorize call with:', credentials?.email);
        if (!credentials?.email || !credentials?.password) {
          return null
        }
        
        try {
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("email", "==", credentials.email));
          const querySnapshot = await getDocs(q);
          
          if (querySnapshot.empty) {
            console.log('[Auth] User not found:', credentials?.email);
            return null;
          }
          
          const userDoc = querySnapshot.docs[0];
          const user = { id: userDoc.id, ...userDoc.data() };
          
          if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
            console.log('[Auth] User not active:', credentials?.email);
            return null
          }

          if (!user.passwordHash) {
            console.log('[Auth] User has no password (Google user?):', credentials?.email);
            return null
          }
          
          // Fallback to simple comparison for migration purposes
          // In a real scenario, users will need to reset passwords to use the new hash
          const inputHash = await hashPassword(credentials.password);
          const passwordsMatch = user.passwordHash === inputHash || user.passwordHash === credentials.password;
          
          if (passwordsMatch) {
            console.log('[Auth] Success for:', credentials?.email);
            return { id: user.id, email: user.email, role: user.role }
          }
          
          console.log('[Auth] Password mismatch for:', credentials?.email);
          return null
        } catch (error) {
          console.error('[Auth] Error querying Firestore:', error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      console.log('[Auth] Session callback for:', token?.sub);
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
        } catch (error) {
          console.error('[Auth] Session error:', error);
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
