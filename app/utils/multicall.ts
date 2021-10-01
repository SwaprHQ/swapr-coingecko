import { Contract } from "@ethersproject/contracts";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ChainId, MULTICALL_ABI, MULTICALL_ADDRESS } from "@swapr/sdk";

export const multicall = async (
  chainId: ChainId,
  provider: JsonRpcProvider,
  calls: { to: string; data: string }[]
): Promise<{ returnData: string[] }> => {
  const multicall = new Contract(
    MULTICALL_ADDRESS[chainId],
    MULTICALL_ABI,
    provider
  );
  return multicall.aggregate(calls.map((call) => [call.to, call.data]));
};
