import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession();
    
    if (!session || !session.user || session.user.email !== 'super_admin@yieldswitch.ai') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { status } = body;

    if (!['ACTIVE', 'SUSPENDED', 'BANNED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status provided.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id },
      data: { status }
    });

    // If banned or suspended, optionally halt all their active bots
    if (status !== 'ACTIVE') {
      await prisma.botConfig.updateMany({
        where: { userId: id, isActive: true },
        data: { isActive: false }
      });
    }

    return NextResponse.json({ message: `User ${id} status updated to ${status}` });
  } catch (error) {
    console.error('Admin API PATCH User Status Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
