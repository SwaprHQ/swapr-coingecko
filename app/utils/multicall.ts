import { ChainId, MULTICALL2_ABI, MULTICALL2_ADDRESS } from '@swapr/sdk'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { Contract } from '@ethersproject/contracts'

export const multicall = async (
  chainId: ChainId,
  provider: StaticJsonRpcProvider,
  calls: { to: string; data: string }[]
): Promise<{ returnData: string[] }> => {
  const multicall = new Contract(MULTICALL2_ADDRESS[chainId], MULTICALL2_ABI, provider)
  return multicall.callStatic.aggregate(calls.map((call) => [call.to, call.data]))
}
