# The world market

Every good in Grand Century trades on one shared world market at one world price.
There are no regional prices. What differs between nations is not the price of a
good but what you pay or keep after your own tariffs.

Prices move once a week, on the weekly pass, after that week's buying and selling
have finished.

## How a price moves

The weekly price move is a damped, anchored response to supply and demand rather
than a raw ratio. In order:

1. **Effective demand** is what buyers actually bought, plus stockpile purchases,
   plus 32% of the demand that went unmet. Unmet demand counts — a good people
   wanted but could not get still pushes the price up — but it counts less than a
   completed sale.
2. **Effective supply** is what producers made, plus 75% of the stockpile carried
   into the week. Goods sitting in store suppress the price, but not as strongly
   as fresh production.
3. **Pressure** is the log of the demand/supply ratio, clamped to ±0.55 so a
   single extreme week cannot spike a price.
4. That pressure is applied at 9% damping to get a target price.
5. The target is pulled 6% back toward the good's base price. Every good has a
   gravitational pull toward what it is fundamentally worth.
6. The result is clamped: no good may trade below 35% or above 6× its base price.
7. Finally the price moves only 32% of the way from where it is to that target.

The compounding effect of steps 3-7 is that prices move, but slowly and within
bounds. A shortage raises a price over weeks, not overnight, and no good can run
away to infinity or collapse to nothing. Absolute floors and ceilings of 0.08 and
500 sit outside all of this as a final backstop.

## Tariffs

Your tariff setting is a single slider from full subsidy to full protection, and
it does two things:

**On imports**, a positive tariff raises what your buyers effectively pay, at up
to 30% impact. A negative tariff (a subsidy) lowers it, but not below 72% of the
world price.

**On exports**, a positive tariff means your sellers keep less of the world price
— down to a floor of 82%. A negative export tariff lets them keep slightly more.

Note the asymmetry: import tariffs bite three times harder than export tariffs.
Protection is felt mainly by your own consumers.

## The national stockpile

A nation can hold goods in a stockpile and place standing buy and sell orders
against the market, executed on the weekly pass with a daily cap on order size.
This lets you smooth a shortage or accumulate war materiel ahead of time, rather
than competing for goods at the moment you need them.

Stockpiles feed back into pricing through the effective-supply term, so a large
national store does put downward pressure on a price.

## What this means in play

- **You cannot corner a market by producing more.** Extra supply lowers the price
  toward base, and unsold output does not pay you (see
  [Production and industry](production-and-industry.md)).
- **Shortages are visible before they are severe.** Unmet demand feeds the price,
  so a rising price on a good you depend on is an early warning.
- **Tariffs are a tax on your own pops first.** Raising import tariffs raises what
  your people pay for everything they cannot make at home.
- **Prices revert.** Any advantage from a price shock is temporary; base-price
  reversion pulls it back. Plan around structural supply, not around price spikes.
- **Stockpile before the war, not during it.** Standing orders are capped daily,
  so you cannot buy an army's supplies in a week.

## See also

- [Production and industry](production-and-industry.md) — how supply is created
  and how producers actually get paid
- [Population](population.md) — the buyers, and the order they buy in
- [Budget and taxation](budget-and-taxation.md) — tariff income
- [Time and the tick](time-and-the-tick.md) — where the weekly price move sits
