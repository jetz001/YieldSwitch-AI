import { NextResponse } from 'next/server';

export const runtime = 'edge';

import * as adminLogs from '../admin/logs/handler';
import * as adminModerate from '../admin/moderate/handler';
import * as adminUsers from '../admin/users/handler';
// Note: [id]/status needs special handling, we'll route it dynamically
import * as adminUsersStatus from '../admin/users/[id]/status/handler';

import * as botClosePosition from '../bot/close-position/handler';
import * as botLogs from '../bot/logs/handler';
import * as botToggle from '../bot/toggle/handler';

import * as dashboardOrderHistory from '../dashboard/order-history/handler';
import * as dashboardPositions from '../dashboard/positions/handler';
import * as dashboardSentiment from '../dashboard/sentiment/handler';
import * as dashboardStats from '../dashboard/stats/handler';

import * as testAi from '../test/ai/handler';
import * as testExchange from '../test/exchange/handler';

import * as usersMe from '../users/me/handler';

export async function GET(req, context) {
  const { params } = context;
  const resolvedParams = await params;
  const slugArray = resolvedParams.slug || [];
  const slug = slugArray.join('/');

  try {
    if (slug === 'admin/logs') return adminLogs.GET ? adminLogs.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'admin/moderate') return adminModerate.GET ? adminModerate.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'admin/users') return adminUsers.GET ? adminUsers.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    
    // Dynamic route admin/users/[id]/status
    if (slugArray.length === 4 && slugArray[0] === 'admin' && slugArray[1] === 'users' && slugArray[3] === 'status') {
      const dynamicContext = { params: Promise.resolve({ id: slugArray[2] }) };
      return adminUsersStatus.GET ? adminUsersStatus.GET(req, dynamicContext) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    if (slug === 'bot/close-position') return botClosePosition.GET ? botClosePosition.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'bot/logs') return botLogs.GET ? botLogs.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'bot/toggle') return botToggle.GET ? botToggle.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    
    if (slug === 'dashboard/order-history') return dashboardOrderHistory.GET ? dashboardOrderHistory.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'dashboard/positions') return dashboardPositions.GET ? dashboardPositions.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'dashboard/sentiment') return dashboardSentiment.GET ? dashboardSentiment.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'dashboard/stats') return dashboardStats.GET ? dashboardStats.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    
    if (slug === 'test/ai') return testAi.GET ? testAi.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'test/exchange') return testExchange.GET ? testExchange.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'users/me') return usersMe.GET ? usersMe.GET(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });

    return NextResponse.json({ error: 'API Route Not Found' }, { status: 404 });
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
    if (slug === 'admin/logs') return adminLogs.POST ? adminLogs.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'admin/moderate') return adminModerate.POST ? adminModerate.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'admin/users') return adminUsers.POST ? adminUsers.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    
    if (slugArray.length === 4 && slugArray[0] === 'admin' && slugArray[1] === 'users' && slugArray[3] === 'status') {
      const dynamicContext = { params: Promise.resolve({ id: slugArray[2] }) };
      return adminUsersStatus.POST ? adminUsersStatus.POST(req, dynamicContext) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    if (slug === 'bot/close-position') return botClosePosition.POST ? botClosePosition.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'bot/logs') return botLogs.POST ? botLogs.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'bot/toggle') return botToggle.POST ? botToggle.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    
    if (slug === 'dashboard/order-history') return dashboardOrderHistory.POST ? dashboardOrderHistory.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'dashboard/positions') return dashboardPositions.POST ? dashboardPositions.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'dashboard/sentiment') return dashboardSentiment.POST ? dashboardSentiment.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'dashboard/stats') return dashboardStats.POST ? dashboardStats.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    
    if (slug === 'test/ai') return testAi.POST ? testAi.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'test/exchange') return testExchange.POST ? testExchange.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    if (slug === 'users/me') return usersMe.POST ? usersMe.POST(req, context) : NextResponse.json({ error: 'Method not allowed' }, { status: 405 });

    return NextResponse.json({ error: 'API Route Not Found' }, { status: 404 });
  } catch (err) {
    console.error('Error in unified POST:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
