import { Handler } from "aws-lambda";
import { JsonRpcProvider } from "@ethersproject/providers";
import { multicall } from "../utils/multicall";
import { ChainId } from "@swapr/sdk";
import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { formatUnits } from "@ethersproject/units";
import fetch from "node-fetch";
import Decimal from "decimal.js-light";
import { SUBGRAPH_URL } from "../utils/commons";

const basicErc20Interface = new Interface([
  "function balanceOf(address) view returns (uint256)",
]);
const balanceOfFunction = basicErc20Interface.getFunction("balanceOf(address)");

interface Response {
  data: {
    pairs: {
      id: string;
      totalSupply: string;
      reserveUSD: string;
    }[];
  };
}

const getProtocolFeesUSD = async (
  chainId: ChainId,
  subgraphUrl: string,
  providerUrl: string,
  feeReceiverAddress: string
): Promise<Decimal> => {
  const pairs = [];
  let lastId = "";
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
      method: "POST",
    });
    if (!response.ok) throw new Error(`could not fetch all pairs info for `);
    const { data: json } = (await response.json()) as Response;
    pairs.push(...json.pairs);
    lastId = json.pairs[json.pairs.length - 1].id;
    if (json.pairs.length < 1000) break;
  }

  const provider = new JsonRpcProvider(providerUrl);
  const results = await multicall(
    chainId,
    provider,
    pairs.map((pair) => ({
      to: pair.id,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        feeReceiverAddress,
      ]),
    }))
  );

  const usdFees = results.returnData.reduce(
    (accumulator, balance: string, index) => {
      const bigNumberBalance = BigNumber.from(balance);
      if (bigNumberBalance.isZero()) return accumulator;
      const pairData = pairs[index];
      const lpTokenPriceUSD = new Decimal(pairData.reserveUSD).dividedBy(
        pairData.totalSupply
      );
      return accumulator.plus(
        lpTokenPriceUSD.times(formatUnits(bigNumberBalance, 18))
      );
    },
    new Decimal("0")
  );

  return usdFees;
};

export const uncollectedProtocolFees: Handler = async () => {
  const mainnetFees = await getProtocolFeesUSD(
    ChainId.MAINNET,
    SUBGRAPH_URL[ChainId.MAINNET],
    `https://mainnet.infura.io/v3/${process.env.INFURA_ID}`,
    "0xC6130400C1e3cD7b352Db75055dB9dD554E00Ef0"
  );
  const arbitrumOneFees = await getProtocolFeesUSD(
    ChainId.ARBITRUM_ONE,
    SUBGRAPH_URL[ChainId.ARBITRUM_ONE],
    `https://arb1.arbitrum.io/rpc`,
    "0x1D7C7cb66fB2d75123351FD0d6779E8d7724a1ae"
  );
  const gnosisFees = await getProtocolFeesUSD(
    ChainId.XDAI,
    SUBGRAPH_URL[ChainId.XDAI],
    "https://rpc.gnosischain.com/",
    "0x65f29020d07A6CFa3B0bF63d749934d5A6E6ea18"
  );

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      mainnetUSD: mainnetFees.toFixed(3),
      arbitrumOneUSD: arbitrumOneFees.toFixed(3),
      gnosisUSD: gnosisFees.toFixed(3),
      totalUSD: gnosisFees.plus(mainnetFees).plus(arbitrumOneFees).toFixed(3),
    }),
  };
};
