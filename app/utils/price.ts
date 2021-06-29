import { parseFixed } from "@ethersproject/bignumber";
import Decimal from "decimal.js-light";
import { Currency, Pair, Price } from "dxswap-sdk";

export function getLpTokenPrice(
  pair: Pair,
  nativeCurrency: Currency,
  totalSupply: string,
  reserveNativeCurrency: string
): Price {
  const decimalTotalSupply = new Decimal(totalSupply);
  // the following check avoids division by zero when total supply is zero
  // (case in which a pair has been created but liquidity has never been proviided)
  const priceDenominator = decimalTotalSupply.isZero()
    ? "1"
    : parseFixed(
        new Decimal(totalSupply).toFixed(pair.liquidityToken.decimals),
        pair.liquidityToken.decimals
      ).toString();
  return new Price(
    pair.liquidityToken,
    nativeCurrency,
    priceDenominator,
    parseFixed(
      new Decimal(reserveNativeCurrency).toFixed(nativeCurrency.decimals),
      nativeCurrency.decimals
    ).toString()
  );
}
