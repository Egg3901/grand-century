# Budget and taxation

Your treasury is settled once a month, on the 1st. The budget pass computes
income and spending for every nation, applies the net to the treasury, and then
checks whether you have gone bankrupt or recovered from it.

## Income

**Taxes** are collected from pops, and pops are taxed by wealth bracket. There are
three brackets — poor, middle and rich — and three separate tax rate sliders, one
per bracket. Tax is taken from the money a pop is holding, which means a pop that
spent everything on food contributes very little regardless of the rate you set.

**Tariffs** accrue through the month as your pops and industries trade, and are
banked into the budget as tariff income. The tariff slider that generates this is
the same one that raises your pops' cost of living — see
[The world market](the-world-market.md).

**Production income** is the state's share of what the national economy produced
over the month.

## Spending

Spending is largely structural — it follows from what you own and what you have
built, not from discretionary choices:

- **Army upkeep**, per regiment.
- **Navy upkeep**, per ship, slightly cheaper per unit than land forces.
- **Construction**, per province.
- **Administration**, which has two parts: a charge per province and a much
  smaller charge per head of population. A large empire costs more to run, and a
  populous one costs more again.
- **Reform upkeep**, per level of reform enacted. Reforms are not free once
  passed; they carry an ongoing cost.
- **Factory subsidies**, if you are paying them.

The administrative model is why unchecked expansion is not automatically good:
every province you take adds permanent administrative and construction cost, and
those bills arrive whether or not the province is productive.

## Bankruptcy

Bankruptcy is a state, not an event.

You **enter** bankruptcy when your treasury falls to -1,800. On entry you lose 4
prestige immediately and construction is blocked.

While bankrupt you lose a further 0.6 prestige every month, and factory subsidies
are honoured at only 30% of their value.

You **exit** bankruptcy when your treasury climbs back to 550. Note the gap
between the two thresholds: recovering is not simply a matter of crossing back
over the line you fell through. You have to get meaningfully into the black.

Outside bankruptcy, the treasury has a hard floor of -30,000 and a soft cap of
600,000.

## What this means in play

- **Tax rates and tariffs take effect on the 1st.** Changing a slider mid-month
  does nothing until the next budget pass.
- **Taxing the poor yields little and costs a lot.** Poor pops hold little money
  after buying life needs, so the revenue is small while the unrest is real.
- **Conquest has a running cost.** Administration and construction scale with
  provinces held. A war that doubles your territory doubles a bill you pay every
  month thereafter.
- **Reforms are an ongoing liability.** Passing them is a budget decision as much
  as a political one.
- **Bankruptcy is a spiral, not a setback.** Blocked construction, bleeding
  prestige and gutted subsidies all make recovery harder. The exit threshold is
  well above the entry one, so act before you cross it.

## See also

- [Population](population.md) — who is taxed, and why their money runs out
- [The world market](the-world-market.md) — the other half of the tariff slider
- [Production and industry](production-and-industry.md) — subsidies
- [Politics and reform](politics-and-reform.md) — what reform upkeep is buying
