import { prisma } from '../lib/db.js';

/**
 * AI Security Oracle: Detects API abuse and Rate Limiting anomalies
 */
export async function auditSecurityEvent(userId, type, description, ipAddress = 'INTERNAL') {
  try {
    await prisma.securityAbuseLog.create({
      data: {
        userId,
        alertType: type,
        description,
        ipAddress
      }
    });

    console.log(`[SECURITY ALERT] ${type} logged for user ${userId || 'GUEST'}`);
  } catch (error) {
    console.error('Audit Security Event Failed:', error);
  }
}

export async function detectRateLimitAbuse(userId, errorCode) {
  if (errorCode === 'RateLimitExceeded') {
    // Check if user hit this multiple times recently
    const recentLogs = await prisma.securityAbuseLog.count({
      where: {
        userId,
        alertType: 'RATE_LIMIT',
        timestamp: { gte: new Date(Date.now() - 60000) } // Last 1 minute
      }
    });

    if (recentLogs >= 10) {
      await auditSecurityEvent(userId, 'SUSPICIOUS_IP', 'User hitting Bitget rate limits > 10 times per minute. Potential API spamming detected.');
      // Optionally auto-suspend
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'SUSPENDED' }
      });
    }
  }
}
