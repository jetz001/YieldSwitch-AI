import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    
    // In production, ensure session.user.role === 'ADMIN' exists in JWT wrapper
    if (!session || !session.user || session.user.email !== 'super_admin@yieldswitch.ai') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { BotConfig: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Admin API GET Users Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
