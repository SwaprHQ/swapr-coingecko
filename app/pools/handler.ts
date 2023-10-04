import '../polyfill'

import { Handler } from 'aws-lambda'
import Decimal from 'decimal.js-light'
import {
  ChainId,
  Currency,
  CurrencyAmount,
  LiquidityMiningCampaign,
  Pair,
  Price,
  Token,
  TokenAmount,
} from '@swapr/sdk'
import {
  SubgraphLiquidityMiningCampaign,
  toLiquidityMiningCampaign,
} from '../utils/conversion'
import { SUBGRAPH_URL } from '../utils/commons'
import { getAddress } from '@ethersproject/address'
import { parseUnits } from '@ethersproject/units'

const CHAIN_NAME = {
  [ChainId.MAINNET]: 'mainnet',
  [ChainId.GNOSIS]: 'Gnosis Chain',
  [ChainId.ARBITRUM_ONE]: 'Arbitrum',
}

interface SubgraphToken {
  address: string
  name: string
  symbol: string
  decimals: number
}

interface SubgraphLiquidityMiningCampaignWithStakablePairInfo
  extends SubgraphLiquidityMiningCampaign {
  stakablePair: {
    reserveNativeCurrency: string
    totalSupply: string
    token0: SubgraphToken
    token1: SubgraphToken
    reserve0: string
    reserve1: string
  }
}

interface QueryResult {
  data: {
    liquidityMiningCampaigns: SubgraphLiquidityMiningCampaignWithStakablePairInfo[]
  }
}

async function getCampaignsAndNativeCurrencyPriceAndTvl(chainId: ChainId): Promise<{
  campaigns: LiquidityMiningCampaign[]
  nativeCurrencyPrice: Price
  tvl: CurrencyAmount
}> {
  const nativeCurrencyPriceResponse = await fetch(SUBGRAPH_URL[chainId], {
    body: JSON.stringify({
      query: `query {
        bundle(id: "1") {
          nativeCurrencyPrice
        }
      }`,
    }),
    method: 'POST',
  })
  if (!nativeCurrencyPriceResponse.ok) {
    throw new Error(`could not fetch native currency price on chain id ${chainId}`)
  }
  const nativeCurrencyPriceResult = (await nativeCurrencyPriceResponse.json()) as {
    data: {
      bundle: { nativeCurrencyPrice: string }
    }
  }

  const tvlResponse = await fetch(SUBGRAPH_URL[chainId], {
    body: JSON.stringify({
      query: `query {
        swaprFactories(first: 1) {
          totalLiquidityUSD
        }
      }`,
    }),
    method: 'POST',
  })
  if (!tvlResponse.ok) {
    throw new Error(`could not fetch tvl on chain id ${chainId}`)
  }
  const tvlResult = (await tvlResponse.json()) as {
    data: {
      swaprFactories: { totalLiquidityUSD: string }[]
    }
  }
  const tvl = CurrencyAmount.usd(
    parseUnits(
      new Decimal(tvlResult.data.swaprFactories[0].totalLiquidityUSD).toFixed(
        Currency.USD.decimals
      ),
      Currency.USD.decimals
    ).toString()
  )

  const campaignsResponse = await fetch(SUBGRAPH_URL[chainId], {
    body: JSON.stringify({
      query: `
      query($timestamp: BigInt!) {
        liquidityMiningCampaigns(
          where: { startsAt_lte: $timestamp, endsAt_gt: $timestamp }
        ) {
          address: id
          duration
          startsAt
          endsAt
          locked
          stakingCap
          rewards {
            amount
            token {
              derivedNativeCurrency
              address: id
              name
              symbol
              decimals
            }
          }
          stakedAmount
          stakablePair {
            token0 {
              address: id
              name
              symbol
              decimals
            }
            token1 {
              address: id
              name
              symbol
              decimals
            }
            reserve0
            reserve1
            reserveNativeCurrency
            totalSupply
          }
        }
      }
    `,
      variables: {
        timestamp: Math.floor(Date.now() / 1000),
      },
    }),
    method: 'POST',
  })
  if (!campaignsResponse.ok) {
    throw new Error(`could not fetch campaigns on chain id ${chainId}`)
  }
  const campaignsResult = (await campaignsResponse.json()) as QueryResult
  const nativeCurrency = Currency.getNative(chainId)

  return {
    campaigns: campaignsResult.data.liquidityMiningCampaigns.map((rawCampaign) => {
      const token0 = new Token(
        chainId,
        getAddress(rawCampaign.stakablePair.token0.address),
        rawCampaign.stakablePair.token0.decimals,
        rawCampaign.stakablePair.token0.symbol,
        rawCampaign.stakablePair.token0.name
      )
      const token1 = new Token(
        chainId,
        getAddress(rawCampaign.stakablePair.token1.address),
        rawCampaign.stakablePair.token1.decimals,
        rawCampaign.stakablePair.token1.symbol,
        rawCampaign.stakablePair.token1.name
      )

      const tokenAmount0 = new TokenAmount(
        token0,
        parseUnits(rawCampaign.stakablePair.reserve0, token0.decimals).toString()
      )
      const tokenAmount1 = new TokenAmount(
        token1,
        parseUnits(rawCampaign.stakablePair.reserve1, token1.decimals).toString()
      )
      const pair = new Pair(tokenAmount0, tokenAmount1)

      return toLiquidityMiningCampaign(
        chainId,
        pair,
        rawCampaign.stakablePair.totalSupply,
        rawCampaign.stakablePair.reserveNativeCurrency,
        rawCampaign,
        nativeCurrency
      )
    }),
    nativeCurrencyPrice: new Price({
      baseCurrency: nativeCurrency,
      quoteCurrency: Currency.USD,
      numerator: parseUnits(
        new Decimal(nativeCurrencyPriceResult.data.bundle.nativeCurrencyPrice).toFixed(
          18
        ),
        Currency.USD.decimals
      ).toString(),
      denominator: parseUnits('1', Currency.USD.decimals).toString(),
    }),
    tvl,
  }
}

interface Pool {
  identifier: string
  liquidity_locked: number
  pair: string
  pairLink: string
  poolRewards: string[]
  totalStakedUSD: number
  apr: number
}

const liquidityMiningCampaignToPool = (
  campaign: LiquidityMiningCampaign,
  nativeCurrencyPrice: Price,
  ordinal?: number
): Pool => {
  let identifier = `Swapr ${campaign.targetedPair.token0.symbol}-${
    campaign.targetedPair.token1.symbol
  } on ${CHAIN_NAME[campaign.chainId]}`
  if (ordinal) identifier += ` ${ordinal}`
  return {
    identifier,
    liquidity_locked: Number(
      campaign.staked.nativeCurrencyAmount.multiply(nativeCurrencyPrice).toFixed(2)
    ),
    pair: `${campaign.targetedPair.token0.symbol}-${campaign.targetedPair.token1.symbol}`,
    pairLink: `https://swapr.eth.limo/#/pools/${campaign.targetedPair.token0.address}/${campaign.targetedPair.token1.address}?chainId=${campaign.chainId}`,
    poolRewards: campaign.rewards.map((reward) => reward.token.symbol),
    totalStakedUSD: Number(campaign.staked.multiply(nativeCurrencyPrice).toFixed(2)),
    apr: Number(campaign.apy.toFixed(2)),
  }
}

export const pools: Handler = async () => {
  const {
    campaigns: mainnetCampaigns,
    nativeCurrencyPrice: mainnetNativeCurrencyPrice,
    tvl: mainnetTvl,
  } = await getCampaignsAndNativeCurrencyPriceAndTvl(ChainId.MAINNET)
  const {
    campaigns: gnosisCampaigns,
    nativeCurrencyPrice: gnosisNativeCurrencyPrice,
    tvl: gnosisTvl,
  } = await getCampaignsAndNativeCurrencyPriceAndTvl(ChainId.XDAI)
  const {
    campaigns: arbitrumCampaigns,
    nativeCurrencyPrice: arbitrumNativeCurrencyPrice,
    tvl: arbitrumTvl,
  } = await getCampaignsAndNativeCurrencyPriceAndTvl(ChainId.ARBITRUM_ONE)

  const allCampaigns = mainnetCampaigns.concat(gnosisCampaigns).concat(arbitrumCampaigns)
  const nativeCurrencyPrice = {
    [ChainId.MAINNET]: mainnetNativeCurrencyPrice,
    [ChainId.XDAI]: gnosisNativeCurrencyPrice,
    [ChainId.ARBITRUM_ONE]: arbitrumNativeCurrencyPrice,
  }

  // groups duplicated campaigns together
  const groupedCampaign = allCampaigns.reduce(
    (accumulator: { [pairAndChainId: string]: LiquidityMiningCampaign[] }, campaign) => {
      const key = `${campaign.targetedPair.liquidityToken.address}-${campaign.chainId}`
      if (accumulator[key]) accumulator[key].push(campaign)
      else accumulator[key] = [campaign]
      return accumulator
    },
    {}
  )
  const pools = Object.values(groupedCampaign).reduce(
    (accumulator: Pool[], campaigns) => {
      if (campaigns.length === 1)
        accumulator.push(
          liquidityMiningCampaignToPool(
            campaigns[0],
            nativeCurrencyPrice[campaigns[0].chainId]
          )
        )
      else {
        accumulator.push(
          ...campaigns.map((campaign, index) => {
            return liquidityMiningCampaignToPool(
              campaign,
              nativeCurrencyPrice[campaign.chainId],
              index + 1
            )
          })
        )
      }
      return accumulator
    },
    []
  )

  return {
    statusCode: 200,
    body: JSON.stringify({
      provider: 'Swapr',
      provider_logo: 'https://swapr.eth.limo/favicon.png',
      provider_URL: 'https://swapr.eth.limo',
      links: [
        {
          title: 'Twitter',
          link: 'https://twitter.com/Swapr_dapp',
        },
        {
          title: 'Discord',
          link: 'https://discord.gg/cQcdACSSsF',
        },
        {
          title: 'Website',
          link: 'https://swapr.eth.limo',
        },
      ],
      tvlUSD: mainnetTvl.add(gnosisTvl).add(arbitrumTvl).toFixed(2),
      pools,
    }),
  }
}
