import '../polyfill'

import { Handler } from 'aws-lambda'
import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { AddressZero } from '@ethersproject/constants'
import { parseUnits, formatUnits } from '@ethersproject/units'
import { multicall } from '../utils/multicall'
import { ChainId, SWPR, SWPR_CONVERTER_ADDRESS } from '@swapr/sdk'
import { StaticJsonRpcProvider } from '@ethersproject/providers'

const basicErc20Interface = new Interface([
  'function balanceOf(address) view returns (uint256)',
])
const balanceOfFunction = basicErc20Interface.getFunction('balanceOf(address)')

const getMainnetBalances = async (): Promise<{
  daoBalance: BigNumber
  burntBalance: BigNumber
}> => {
  const provider = new StaticJsonRpcProvider(
    { url: 'https://eth.llamarpc.com' },
    { chainId: ChainId.MAINNET, name: 'mainnet' }
  )

  const swprAddress = SWPR[ChainId.MAINNET].address
  const results = await multicall(ChainId.MAINNET, provider, [
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        '0xa953dEaDE87de58c5D539bF4104d233166C17827', // Swapr Safe Treasury address on mainnet
      ]),
    },
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [AddressZero]),
    },
  ])
  return {
    daoBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[0]
    )[0],
    burntBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[1]
    )[0],
  }
}

const getArbitrumOneBalances = async (): Promise<{
  daoBalance: BigNumber
  swaprWalletSchemeBalance: BigNumber
  unconvertedBalance: BigNumber
}> => {
  const provider = new StaticJsonRpcProvider(
    { url: `https://arb1.arbitrum.io/rpc` },
    { chainId: ChainId.ARBITRUM_ONE, name: 'Arbitrum' }
  )

  const swprAddress = SWPR[ChainId.ARBITRUM_ONE].address
  const results = await multicall(ChainId.ARBITRUM_ONE, provider, [
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        '0xF7505d655e28e746BAAC9646030C3F2193E3B542', // DAO's avatar address on arb1
      ]),
    },
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        '0x3172eDDa6ff8B2b2Fa7FeD40EE1fD92F1F4dd424', // DAO's Swapr wallet scheme address on arb1
      ]),
    },
    // the following call gets all the unconverted SWPR currently sitting in the converter
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        SWPR_CONVERTER_ADDRESS[ChainId.ARBITRUM_ONE],
      ]),
    },
  ])

  return {
    daoBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[0]
    )[0],
    swaprWalletSchemeBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[1]
    )[0],
    unconvertedBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[2]
    )[0],
  }
}

export const circulatingSupply: Handler = async () => {
  const { daoBalance: mainnetDaoBalance, burntBalance } = await getMainnetBalances()
  const {
    daoBalance: arbitrumOneDaoBalance,
    swaprWalletSchemeBalance,
    unconvertedBalance,
  } = await getArbitrumOneBalances()

  const circulatingSupply = parseUnits('100000000', 18)
    .sub(mainnetDaoBalance)
    .sub(burntBalance)
    .sub(arbitrumOneDaoBalance)
    .sub(swaprWalletSchemeBalance)
    .sub(unconvertedBalance)

  return {
    statusCode: 200,
    body: JSON.stringify({
      mainnetDaoBalance: formatUnits(mainnetDaoBalance, 18),
      burntBalance: formatUnits(burntBalance, 18),
      arbitrumOneDaoBalance: formatUnits(arbitrumOneDaoBalance, 18),
      swaprWalletSchemeBalance: formatUnits(swaprWalletSchemeBalance, 18),
      unconvertedBalance: formatUnits(unconvertedBalance, 18),
      circulatingSupply: formatUnits(circulatingSupply, 18),
    }),
  }
}
