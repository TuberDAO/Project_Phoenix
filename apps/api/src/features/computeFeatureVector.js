import { daysBetween, secondsBetween } from '@phoenix/shared';
import { FIRST_MOVER_MIN_USD, LOW_LIQUIDITY_DEPTH_USD, CTF_BASE_FEE_BPS } from '@phoenix/shared';
/**
 * Compute the full PreResolutionFeatures vector for a bet with real market data.
 */
export function computeFeatureVector(bet, market, wallet, context) {
    const betTimestamp = typeof bet.timestamp === 'string' ? new Date(bet.timestamp) : bet.timestamp;
    const betUsd = typeof bet.betUsd === 'number' ? bet.betUsd : Number(bet.betUsd);
    const betTs = Math.floor(betTimestamp.getTime() / 1000);
    // ====================  Timing vs event/oracle ====================
    const timeToResolutionSec = Math.max(Math.floor(secondsBetween(market.closesAt, betTimestamp)), 0);
    const isFinalHourBeforeClose = timeToResolutionSec <= 3600;
    // preAnnouncementProximityMin: placeholder (would match against known events calendar)
    const preAnnouncementProximityMin = 9999;
    // oracleProximitySec: min distance to any UMA event
    let oracleProximitySec = 999999;
    if (context?.oracleEvents) {
        const distances = [];
        if (context.oracleEvents.requestTs)
            distances.push(Math.abs(context.oracleEvents.requestTs - betTs));
        if (context.oracleEvents.proposalTs)
            distances.push(Math.abs(context.oracleEvents.proposalTs - betTs));
        if (context.oracleEvents.disputeTs)
            distances.push(Math.abs(context.oracleEvents.disputeTs - betTs));
        if (distances.length > 0) {
            oracleProximitySec = Math.min(...distances);
        }
    }
    const oracleMempoolLagSec = 0; // Placeholder (no mempool monitoring yet)
    // ==================== Size & impact ====================
    // liquidityAtBetUsd: estimate depth around mid
    const book = context?.books?.[bet.outcomeId];
    let liquidityAtBetUsd = betUsd * 10; // Default estimate
    if (book) {
        const midpoint = getMidpoint(book);
        const depthRange = 0.05; // ±5% around mid
        liquidityAtBetUsd = calculateBookDepth(book, 'both', midpoint * (1 - depthRange), midpoint * (1 + depthRange));
    }
    const fractionOfPool = liquidityAtBetUsd > 0 ? betUsd / liquidityAtBetUsd : bet.fractionOfPool;
    const zScoreBetSize = bet.zScoreSize;
    const impliedBefore = bet.impliedBefore;
    const impliedAfter = bet.impliedAfter;
    const deltaProb = bet.deltaProb;
    // estimatedFeeBps: baseRate * min(price, 1-price) * 10000
    const estimatedFeeBps = CTF_BASE_FEE_BPS * Math.min(impliedAfter, 1 - impliedAfter);
    // ==================== Order-flow microstructure ====================
    // isMarketableOrder: crossed spread?
    let isMarketableOrder = true;
    if (book) {
        const bestBid = book.bids?.[0] ? parseFloat(book.bids[0].price) : 0;
        const bestAsk = book.asks?.[0] ? parseFloat(book.asks[0].price) : 1;
        const spread = bestAsk - bestBid;
        // If fill price is inside spread, it crossed
        isMarketableOrder = impliedAfter >= bestAsk - spread * 0.1 || impliedAfter <= bestBid + spread * 0.1;
    }
    // slippageFootprintBps: |fill-mid|/mid * 10000
    let slippageFootprintBps = 12;
    if (book) {
        const midpoint = getMidpoint(book);
        if (midpoint > 0) {
            slippageFootprintBps = Math.abs(impliedAfter - midpoint) / midpoint * 10000;
        }
    }
    // bookImbalanceAfter: (bidNotional-askNotional)/(sum)
    let bookImbalanceAfter = 0.1;
    if (book) {
        bookImbalanceAfter = calculateBookImbalance(book, 3);
    }
    // burstRatio1m: wallet 1m volume / market 1m volume (placeholder)
    const burstRatio1m = fractionOfPool * 0.5;
    // firstMoverFlag: large bet soon after market creation or dormancy
    const marketAge = betTimestamp.getTime() - market.createdAt.getTime();
    const isEarlyBet = marketAge < 60 * 60 * 1000; // Within 1 hour
    const firstMoverFlag = betUsd >= FIRST_MOVER_MIN_USD && isEarlyBet;
    // lowLiquiditySideFlag: targeted side depth < threshold
    let lowLiquiditySideFlag = false;
    if (book) {
        const targetSide = impliedAfter > impliedBefore ? book.asks : book.bids;
        const sideDepth = calculateSideDepth(targetSide || []);
        lowLiquiditySideFlag = sideDepth < LOW_LIQUIDITY_DEPTH_USD;
    }
    // quoteToTradeRatio, cancelReplaceRate, selfTradeIncidence: require message-level data (placeholder)
    const quoteToTradeRatio = 0;
    const cancelReplaceRate = 0;
    const selfTradeIncidence = 0;
    // ==================== Wallet provenance / evasion ====================
    const walletAgeDays = wallet ? daysBetween(betTimestamp, wallet.firstSeenAt) : 365;
    const newWalletFlag = wallet?.newWalletFlag ?? false;
    // Placeholders until on-chain analysis
    const fundingGapSec = 720;
    const fundingSourceType = 'unknown';
    const fanInCount24h = 2;
    const fanOutPlanFlag = false;
    const gasPriorityFlag = bet.gasPriorityFlag;
    const highGasMultiplier = gasPriorityFlag ? 1.8 : 1.0;
    // ==================== Cross-market behavior ====================
    const correlatedMarketsEntered5m = 1; // Placeholder
    const basketSynchronizedFlag = false; // Placeholder
    const copyTradeShadowFollowers = 0; // Placeholder
    const repeatedLastMinutePatternScore = 0; // Placeholder
    // ==================== Social/news alignment ====================
    // newsVolumeDeltaZ: z-score of post-bet 60m volume vs baseline
    let newsVolumeDeltaZ = 0;
    let chatterLullFlag = false;
    if (context?.newsVolume) {
        const { postBetCount, baseline, baselineStd } = context.newsVolume;
        if (baselineStd > 0) {
            newsVolumeDeltaZ = Math.max(0, (postBetCount - baseline) / baselineStd);
            newsVolumeDeltaZ = Math.min(newsVolumeDeltaZ, 3); // Cap at +3
        }
        // chatterLullFlag: post-bet volume in bottom decile
        if (postBetCount < baseline * 0.1) {
            chatterLullFlag = true;
        }
    }
    // ==================== Category / rules awareness ====================
    const esotericRuleTargetFlag = false; // Placeholder (NLP on rules)
    const negriskFlag = market.metaJson?.negrisk === true;
    const ruleWindowHitFlag = false; // Placeholder (timing analysis)
    // ==================== Aggregates (rolling) ====================
    const walletBetCount24h = context?.walletStats?.betCount24h ?? 3;
    const walletAggUsd24h = context?.walletStats?.aggUsd24h ?? betUsd * 1.2;
    const walletAggUsd7d = context?.walletStats?.aggUsd7d ?? betUsd * 5;
    // ==================== Cluster/network ====================
    const clusterRotationScore = context?.clusterInfo?.rotationScore ?? 0;
    const clusterId = context?.clusterInfo?.clusterId;
    return {
        betTimestamp: betTimestamp.toISOString(),
        timeToResolutionSec,
        isFinalHourBeforeClose,
        preAnnouncementProximityMin,
        oracleProximitySec,
        oracleMempoolLagSec,
        betUsd,
        liquidityAtBetUsd,
        fractionOfPool,
        zScoreBetSize,
        impliedBefore,
        impliedAfter,
        deltaProb,
        estimatedFeeBps,
        isMarketableOrder,
        slippageFootprintBps,
        bookImbalanceAfter,
        burstRatio1m,
        firstMoverFlag,
        lowLiquiditySideFlag,
        quoteToTradeRatio,
        cancelReplaceRate,
        selfTradeIncidence,
        walletAgeDays,
        newWalletFlag,
        fundingGapSec,
        fundingSourceType,
        fanInCount24h,
        fanOutPlanFlag,
        gasPriorityFlag,
        highGasMultiplier,
        correlatedMarketsEntered5m,
        basketSynchronizedFlag,
        copyTradeShadowFollowers,
        repeatedLastMinutePatternScore,
        newsVolumeDeltaZ,
        chatterLullFlag,
        esotericRuleTargetFlag,
        negriskFlag,
        ruleWindowHitFlag,
        walletBetCount24h,
        walletAggUsd24h,
        walletAggUsd7d,
        clusterRotationScore,
        clusterId,
    };
}
// ==================== Helper Functions ====================
function getMidpoint(book) {
    const bestBid = book.bids?.[0] ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks?.[0] ? parseFloat(book.asks[0].price) : 1;
    return (bestBid + bestAsk) / 2;
}
function calculateBookDepth(book, side, fromPrice, toPrice) {
    let depth = 0;
    if (side === 'buy' || side === 'both') {
        const bids = book.bids || [];
        for (const order of bids) {
            const price = parseFloat(order.price);
            const size = parseFloat(order.size);
            if (price >= fromPrice && price <= toPrice) {
                depth += price * size;
            }
        }
    }
    if (side === 'sell' || side === 'both') {
        const asks = book.asks || [];
        for (const order of asks) {
            const price = parseFloat(order.price);
            const size = parseFloat(order.size);
            if (price >= fromPrice && price <= toPrice) {
                depth += price * size;
            }
        }
    }
    return depth;
}
function calculateBookImbalance(book, levels = 3) {
    const bids = book.bids?.slice(0, levels) || [];
    const asks = book.asks?.slice(0, levels) || [];
    let bidNotional = 0;
    let askNotional = 0;
    for (const bid of bids) {
        bidNotional += parseFloat(bid.price) * parseFloat(bid.size);
    }
    for (const ask of asks) {
        askNotional += parseFloat(ask.price) * parseFloat(ask.size);
    }
    const total = bidNotional + askNotional;
    if (total === 0)
        return 0;
    return (bidNotional - askNotional) / total;
}
function calculateSideDepth(orders) {
    let depth = 0;
    for (const order of orders) {
        depth += parseFloat(order.price) * parseFloat(order.size);
    }
    return depth;
}
