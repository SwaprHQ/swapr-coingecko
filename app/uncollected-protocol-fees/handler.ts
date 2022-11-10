import '../polyfill'

import { Handler } from 'aws-lambda'
import { multicall } from '../utils/multicall'
import { ChainId } from '@swapr/sdk'
import Decimal from 'decimal.js-light'
import { SUBGRAPH_URL } from '../utils/commons'
import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { formatUnits } from '@ethersproject/units'
import { StaticJsonRpcProvider } from '@ethersproject/providers'

const basicErc20Interface = new Interface([
  'function balanceOf(address) view returns (uint256)',
])
const balanceOfFunction = basicErc20Interface.getFunction('balanceOf(address)')

interface Response {
  data: {
    pairs: {
      id: string
      totalSupply: string
      reserveUSD: string
    }[]
  }
}

const getProtocolFeesUSD = async (
  chainId: ChainId,
  chainName: string,
  subgraphUrl: string,
  providerUrl: string,
  feeReceiverAddress: string
): Promise<Decimal> => {
  const pairs = []
  let lastId = ''
  while (1) {
    const response = await fetch(subgraphUrl, {
      body: JSON.stringify({
        query: `query {
          pairs(first: 1000, where: { id_gt: "${lastId}" }) {
            id
            totalSupply
            reserveUSD
          }
        }`,
      }),
      method: 'POST',
    })
    if (!response.ok) throw new Error(`could not fetch all pairs info for `)
    const { data: json } = (await response.json()) as Response
    pairs.push(...json.pairs)
    lastId = json.pairs[json.pairs.length - 1].id
    if (json.pairs.length < 1000) break
  }

  const provider = new StaticJsonRpcProvider(
    { url: providerUrl },
    { chainId: chainId, name: chainName }
  )
  const results = await multicall(
    chainId,
    provider,
    pairs.map((pair) => ({
      to: pair.id,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        feeReceiverAddress,
      ]),
    }))
  )

  const usdFees = results.returnData.reduce((accumulator, balance: string, index) => {
    const bigNumberBalance = BigNumber.from(balance)
    if (bigNumberBalance.isZero()) return accumulator
    const pairData = pairs[index]
    const lpTokenPriceUSD = new Decimal(pairData.reserveUSD).dividedBy(
      pairData.totalSupply
    )
    return accumulator.plus(lpTokenPriceUSD.times(formatUnits(bigNumberBalance, 18)))
  }, new Decimal('0'))

  return usdFees
}

export const uncollectedProtocolFees: Handler = async () => {
  const mainnetFees = await getProtocolFeesUSD(
    ChainId.MAINNET,
    'mainnet',
    SUBGRAPH_URL[ChainId.MAINNET],
    `https://mainnet.infura.io/v3/${process.env.INFURA_ID}`,
    '0xC6130400C1e3cD7b352Db75055dB9dD554E00Ef0'
  )
  const arbitrumOneFees = await getProtocolFeesUSD(
    ChainId.ARBITRUM_ONE,
    'Arbitrum One',
    SUBGRAPH_URL[ChainId.ARBITRUM_ONE],
    `https://arb1.arbitrum.io/rpc`,
    '0xE8868A069a685747D9bDB0c444116Be03c67bb0c'
  )
  const gnosisFees = await getProtocolFeesUSD(
    ChainId.XDAI,
    'Gnosis',
    SUBGRAPH_URL[ChainId.XDAI],
    'https://rpc.gnosischain.com/',
    '0xa68Fad1e05a644414f4878Ce5C5357be634Bcf4c'
  )

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      mainnetUSD: mainnetFees.toFixed(3),
      arbitrumOneUSD: arbitrumOneFees.toFixed(3),
      gnosisUSD: gnosisFees.toFixed(3),
      totalUSD: gnosisFees.plus(mainnetFees).plus(arbitrumOneFees).toFixed(3),
    }),
  }
}
