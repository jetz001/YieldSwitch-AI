import { NextResponse } from 'next/server';
import { getFearAndGreedIndex } from '@/engine/autoScreener';

export async function GET() {
  try {
    const fng = await getFearAndGreedIndex();
    
    // Determine the label
    let label = 'NEUTRAL';
    let color = 'text-slate-400';
    
    if (fng <= 25) {
      label = 'EXTREME FEAR';
      color = 'text-red-500';
    } else if (fng <= 45) {
      label = 'FEAR';
      color = 'text-orange-500';
    } else if (fng <= 55) {
      label = 'NEUTRAL';
      color = 'text-yellow-500';
    } else if (fng <= 75) {
      label = 'GREED';
      color = 'text-teal-500';
    } else {
      label = 'EXTREME GREED';
      color = 'text-green-500';
    }

    return NextResponse.json({
      success: true,
      value: fng,
      label,
      color,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
