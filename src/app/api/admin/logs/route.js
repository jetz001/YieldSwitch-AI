import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user || session.user.email !== 'super_admin@yieldswitch.ai') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    // Fetch Security Abuse Logs (Rate limits, suspicious IPs, etc.)
    const logs = await prisma.securityAbuseLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50,
      include: {
        User: {
          select: { email: true }
        }
      }
    });

    return NextResponse.json(Array.isArray(logs) ? logs : []);
  } catch (error) {
    console.error('Admin API GET Logs Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
