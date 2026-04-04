import { prisma } from '../../lib/db.js';
import { logPhase } from '../aiBase.js';

/**
 * §3 Zero Balance Guard
 * Checks specific trading account (Spot or Future) and deactivates if empty.
 */
export async function checkZeroBalance(exchangeClient, botConfigId, config, walletEquity, unrealizedPnlTotal, marketType) {
  const stablecoins = ['USDT', 'USD', 'SUSDT', 'USDC', 'BUSD'];
  const targetAccType = (marketType === 'SPOT') ? 'spot' : 'swap';

  let tradingBalance = 0;
  try {
    const bal = await exchangeClient.fetchBalance({ type: targetAccType });
    for (const coin of stablecoins) {
      tradingBalance += parseFloat(bal.total?.[coin] || 0);
    }
  } catch (e) {
    tradingBalance = walletEquity; // Fallback
  }

  // Debug Log
  console.log(`[BalanceGuard] ${botConfigId} Trading: $${tradingBalance.toFixed(2)}, PNL: $${unrealizedPnlTotal.toFixed(2)}`);

  if (tradingBalance < 5.0 && unrealizedPnlTotal === 0) {
    console.log(`[BalanceGuard] 🚨 DEACTIVATING bot ${botConfigId}: Empty trading wallet.`);
    
    await prisma.botConfig.update({
      where: { id: botConfigId },
      data: { isActive: false }
    });

    await logPhase(botConfigId, 'TASK_CHECK', `🚨 บอทหยุดทำงานเนื่องจากเงินในกระเป๋า ${targetAccType.toUpperCase()} คือ $${tradingBalance.toFixed(2)} (ต่ำกว่าเงื่อนไข $5)`);
    
    return true; // Triggered
  }
  
  return false;
}
