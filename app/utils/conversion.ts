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
} from "@swapr/sdk";
import { getAddress } from "@ethersproject/address";
import { parseFixed } from "@ethersproject/bignumber";
import { Decimal } from "decimal.js-light";
import { getLpTokenPrice } from "./price";

export interface SubgraphLiquidityMiningCampaignReward {
  amount: string;
  token: {
    derivedNativeCurrency: string;
    address: string;
    symbol: string;
    name: string;
    decimals: string;
  };
}

export interface SubgraphLiquidityMiningCampaign {
  address: string;
  duration: string;
  startsAt: string;
  endsAt: string;
  stakedAmount: string;
  rewards: SubgraphLiquidityMiningCampaignReward[];
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
  const rewards = campaign.rewards.map((reward) => {
    const properRewardToken = new Token(
      chainId,
      getAddress(reward.token.address),
      parseInt(reward.token.decimals),
      reward.token.symbol,
      reward.token.name
    );
    const rewardTokenPriceNativeCurrency = new Price(
      properRewardToken,
      nativeCurrency,
      parseFixed("1", nativeCurrency.decimals).toString(),
      parseFixed(
        new Decimal(reward.token.derivedNativeCurrency).toFixed(
          nativeCurrency.decimals
        ),
        nativeCurrency.decimals
      ).toString()
    );
    const pricedRewardToken = new PricedToken(
      chainId,
      getAddress(reward.token.address),
      parseInt(reward.token.decimals),
      rewardTokenPriceNativeCurrency,
      reward.token.symbol,
      reward.token.name
    );
    return new PricedTokenAmount(
      pricedRewardToken,
      parseFixed(reward.amount, reward.token.decimals).toString()
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
