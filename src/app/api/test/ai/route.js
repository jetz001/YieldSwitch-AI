import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';
import { getLLMClient } from '@/services/llmProvider';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let { aiApiKey, aiProvider, aiModel } = await req.json();
    
    if (!aiApiKey) {
      return NextResponse.json({ success: false, message: 'กรุณากรอก AI API Key ก่อนทดสอบ' }, { status: 400 });
    }

    // Heuristic check: If key starts with sk-or- but provider is OPENAI
    if (aiProvider === 'OPENAI' && aiApiKey.startsWith('sk-or-')) {
      return NextResponse.json({ 
        success: false, 
        message: 'ตรวจพบว่าคุณใช้ OpenRouter Key แต่เลือกผู้ให้บริการเป็น OpenAI | กรุณาเปลี่ยนเป็น "OpenRouter" ก่อนทดสอบครับ' 
      }, { status: 400 });
    }

    // Handle masked keys from DB
    if (aiApiKey.includes('•')) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      if (!user.aiApiKey) return NextResponse.json({ success: false, message: 'ไม่พบ Key ที่บันทึกไว้' }, { status: 400 });
      const { decrypt } = require('@/utils/crypto');
      aiApiKey = decrypt(user.aiApiKey);
    }
    // Note: In a real app, you might want to encrypt/decrypt here or handle it carefully.
    // Since this is a test, we pass the key as is (getLLMClient expects a decrypted key anyway if we bypass the database)
    
    const { client, model } = getLLMClient(aiApiKey, aiProvider, aiModel);
    
    // Simple test: fetch models or do a tiny chat completion
    if (aiProvider === 'OPENROUTER') {
      const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: {
          'Authorization': `Bearer ${aiApiKey}`,
        }
      });
      const data = await response.json();
      if (response.ok && data.data) {
        return NextResponse.json({ success: true, message: `OpenRouter Key verified: ${data.data.label || 'Active'}` });
      } else {
        return NextResponse.json({ success: false, message: data.error?.message || 'Invalid OpenRouter Key' }, { status: 400 });
      }
    } else {
      // Standard OpenAI test
      const response = await client.models.list();
      return NextResponse.json({ success: true, message: 'OpenAI API Key verified successfully' });
    }

  } catch (error) {
    console.error('AI Test Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
