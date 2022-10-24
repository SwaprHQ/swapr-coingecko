import { parseUnits } from '@ethersproject/units'
import Decimal from 'decimal.js-light'
import { Currency, Pair, Price } from '@swapr/sdk'

export function getLpTokenPrice(
  pair: Pair,
  nativeCurrency: Currency,
  totalSupply: string,
  reserveNativeCurrency: string
): Price {
  const decimalTotalSupply = new Decimal(totalSupply)
  // the following check avoids division by zero when total supply is zero
  // (case in which a pair has been created but liquidity has never been proviided)
  const priceDenominator = decimalTotalSupply.isZero()
    ? '1'
    : parseUnits(
        new Decimal(totalSupply).toFixed(pair.liquidityToken.decimals),
        pair.liquidityToken.decimals
      ).toString()
  return new Price({
    baseCurrency: pair.liquidityToken,
    quoteCurrency: nativeCurrency,
    denominator: priceDenominator,
    numerator: parseUnits(
      new Decimal(reserveNativeCurrency).toFixed(nativeCurrency.decimals),
      nativeCurrency.decimals
    ).toString(),
  })
}
