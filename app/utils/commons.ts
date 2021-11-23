import { ChainId } from "@swapr/sdk";

export const SUBGRAPH_URL = {
  [ChainId.MAINNET]:
    "https://api.thegraph.com/subgraphs/name/luzzif/swapr-mainnet-v2",
  [ChainId.XDAI]:
    "https://api.thegraph.com/subgraphs/name/luzzif/swapr-xdai-v2",
  [ChainId.ARBITRUM_ONE]:
    "https://api.thegraph.com/subgraphs/name/luzzif/swapr-arbitrum-one-v3",
};
