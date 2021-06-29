import {
  ChainId,
  Currency,
  LiquidityMiningCampaign,
  Pair,
  Price,
  PricedToken,
  PricedTokenAmount,
  Token,
  TokenAmount,
} from "dxswap-sdk";
import { getAddress } from "@ethersproject/address";
import { parseFixed } from "@ethersproject/bignumber";
import { Decimal } from "decimal.js-light";
import { getLpTokenPrice } from "./price";

export interface SubgraphLiquidityMiningCampaignRewardToken {
  derivedNativeCurrency: string;
  address: string;
  symbol: string;
  name: string;
  decimals: string;
}

export interface SubgraphLiquidityMiningCampaign {
  address: string;
  duration: string;
  startsAt: string;
  endsAt: string;
  rewardAmounts: string[];
  stakedAmount: string;
  rewardTokens: SubgraphLiquidityMiningCampaignRewardToken[];
  locked: boolean;
  stakingCap: string;
}

export function toLiquidityMiningCampaign(
  chainId: ChainId,
  targetedPair: Pair,
  targetedPairLpTokenTotalSupply: string,
  targetedPairReserveNativeCurrency: string,
  campaign: SubgraphLiquidityMiningCampaign,
  nativeCurrency: Currency
): LiquidityMiningCampaign {
  const rewards = campaign.rewardTokens.map((rewardToken, index) => {
    const properRewardToken = new Token(
      chainId,
      getAddress(rewardToken.address),
      parseInt(rewardToken.decimals),
      rewardToken.symbol,
      rewardToken.name
    );
    const rewardTokenPriceNativeCurrency = new Price(
      properRewardToken,
      nativeCurrency,
      parseFixed("1", nativeCurrency.decimals).toString(),
      parseFixed(
        new Decimal(rewardToken.derivedNativeCurrency).toFixed(
          nativeCurrency.decimals
        ),
        nativeCurrency.decimals
      ).toString()
    );
    const pricedRewardToken = new PricedToken(
      chainId,
      getAddress(rewardToken.address),
      parseInt(rewardToken.decimals),
      rewardTokenPriceNativeCurrency,
      rewardToken.symbol,
      rewardToken.name
    );
    return new PricedTokenAmount(
      pricedRewardToken,
      parseFixed(campaign.rewardAmounts[index], rewardToken.decimals).toString()
    );
  });
  const lpTokenPriceNativeCurrency = getLpTokenPrice(
    targetedPair,
    nativeCurrency,
    targetedPairLpTokenTotalSupply,
    targetedPairReserveNativeCurrency
  );
  const stakedPricedToken = new PricedToken(
    chainId,
    getAddress(targetedPair.liquidityToken.address),
    targetedPair.liquidityToken.decimals,
    lpTokenPriceNativeCurrency,
    targetedPair.liquidityToken.symbol,
    targetedPair.liquidityToken.name
  );
  const staked = new PricedTokenAmount(
    stakedPricedToken,
    parseFixed(campaign.stakedAmount, stakedPricedToken.decimals).toString()
  );
  return new LiquidityMiningCampaign(
    campaign.startsAt,
    campaign.endsAt,
    targetedPair,
    rewards,
    staked,
    campaign.locked,
    new TokenAmount(
      targetedPair.liquidityToken,
      parseFixed(
        campaign.stakingCap,
        targetedPair.liquidityToken.decimals
      ).toString()
    ),
    getAddress(campaign.address)
  );
}
