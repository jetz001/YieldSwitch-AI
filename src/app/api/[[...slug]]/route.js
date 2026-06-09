import { NextResponse } from 'next/server';

export const runtime = 'edge';

// GET handlers
import { GET as adminLogsGet } from '../admin/logs/handler';
import { GET as adminUsersGet } from '../admin/users/handler';
import { GET as botLogsGet } from '../bot/logs/handler';
import { GET as dashboardOrderHistoryGet } from '../dashboard/order-history/handler';
import { GET as dashboardPositionsGet } from '../dashboard/positions/handler';
import { GET as dashboardSentimentGet } from '../dashboard/sentiment/handler';
import { GET as dashboardStatsGet } from '../dashboard/stats/handler';
import { GET as usersMeGet } from '../users/me/handler';

// POST handlers
import { POST as adminModeratePost } from '../admin/moderate/handler';
import { POST as botClosePositionPost } from '../bot/close-position/handler';
import { POST as botTogglePost } from '../bot/toggle/handler';
import { POST as testAiPost } from '../test/ai/handler';
import { POST as testExchangePost } from '../test/exchange/handler';
import { POST as usersMePost } from '../users/me/handler';

// PATCH handlers
import { PATCH as adminUsersStatusPatch } from '../admin/users/[id]/status/handler';

// DELETE handlers
import { DELETE as usersMeDelete } from '../users/me/handler';

export async function GET(req, context) {
  const { params } = context;
  const resolvedParams = await params;
  const slugArray = resolvedParams.slug || [];
  const slug = slugArray.join('/');

  try {
    if (slug === 'admin/logs') return adminLogsGet(req, context);
    if (slug === 'admin/users') return adminUsersGet(req, context);
    if (slug === 'bot/logs') return botLogsGet(req, context);
    if (slug === 'dashboard/order-history') return dashboardOrderHistoryGet(req, context);
    if (slug === 'dashboard/positions') return dashboardPositionsGet(req, context);
    if (slug === 'dashboard/sentiment') return dashboardSentimentGet(req, context);
    if (slug === 'dashboard/stats') return dashboardStatsGet(req, context);
    if (slug === 'users/me') return usersMeGet(req, context);

    return NextResponse.json({ error: 'Method Not Allowed or Not Found' }, { status: 404 });
  } catch (err) {
    console.error('Error in unified GET:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req, context) {
  const { params } = context;
  const resolvedParams = await params;
  const slugArray = resolvedParams.slug || [];
  const slug = slugArray.join('/');

  try {
    if (slug === 'admin/moderate') return adminModeratePost(req, context);
    if (slug === 'bot/close-position') return botClosePositionPost(req, context);
    if (slug === 'bot/toggle') return botTogglePost(req, context);
    if (slug === 'test/ai') return testAiPost(req, context);
    if (slug === 'test/exchange') return testExchangePost(req, context);
    if (slug === 'users/me') return usersMePost(req, context);

    return NextResponse.json({ error: 'Method Not Allowed or Not Found' }, { status: 404 });
  } catch (err) {
    console.error('Error in unified POST:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req, context) {
  const { params } = context;
  const resolvedParams = await params;
  const slugArray = resolvedParams.slug || [];

  try {
    if (slugArray.length === 4 && slugArray[0] === 'admin' && slugArray[1] === 'users' && slugArray[3] === 'status') {
      const dynamicContext = { params: Promise.resolve({ id: slugArray[2] }) };
      return adminUsersStatusPatch(req, dynamicContext);
    }

    return NextResponse.json({ error: 'Method Not Allowed or Not Found' }, { status: 404 });
  } catch (err) {
    console.error('Error in unified PATCH:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req, context) {
  const { params } = context;
  const resolvedParams = await params;
  const slugArray = resolvedParams.slug || [];
  const slug = slugArray.join('/');

  try {
    if (slug === 'users/me') return usersMeDelete(req, context);

    return NextResponse.json({ error: 'Method Not Allowed or Not Found' }, { status: 404 });
  } catch (err) {
    console.error('Error in unified DELETE:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
