---
title: "Compound Interest Explained: Formula, Monthly Contributions, and Worked Examples"
slug: compound-interest-formula-examples
category: business-finance
description: Learn how compound interest works, how the formula changes with monthly contributions, and how to check whether a savings growth estimate makes sense.
excerpt: A clear walk-through of lump-sum growth, monthly deposits, compounding frequency, and the calculator checks that catch common savings mistakes.
tags: [compound interest, savings, future value, personal finance]
author: NeatSize
publishDate: 2026-10-20
difficulty: beginner
seoTitle: Compound Interest Formula and Examples
metaDescription: Learn the compound interest formula, how monthly contributions change future value, and quick checks for realistic savings growth.
relatedTools: [savings-calculator]
---

## Start with the core idea: interest earns interest

Compound interest means each period’s interest is added to the balance, so the next period’s interest is calculated on a larger amount. If you start with $1,000 and earn 5% once per year, the first year adds $50. In the second year, 5% applies to $1,050, not the original $1,000, so the interest is $52.50.

Simple interest grows in a straight line because the interest is always based on the original principal. Compound interest bends upward because the base keeps increasing.

Every compound interest calculation has three main moving parts:

- **Starting balance:** the amount you begin with, often called principal.
- **Rate per period:** the interest rate that applies each compounding period.
- **Number of periods:** how many times interest gets applied.

The practical question is not only “What does a 5% rate mean?” It is “What will this balance become after 3, 10, or 30 years?” That future balance depends heavily on whether you add money along the way and how often the account compounds.

## Use the formula, but match it to the compounding schedule

For a one-time deposit with no extra contributions, the standard compound interest formula is:

**A = P(1 + r/n)^(nt)**

Where:

- **A** = future amount
- **P** = starting principal
- **r** = annual interest rate as a decimal
- **n** = number of compounding periods per year
- **t** = time in years

If the annual rate is 6%, use **0.06**, not 6. If interest compounds monthly, use **n = 12**. If it compounds daily, use the relevant daily count for the account’s convention. The formula works only when the rate, compounding schedule, and time period use the same assumptions.

A common mistake is mixing a monthly rate with a yearly formula. For example, if you use 0.5% per month, the decimal is **0.005 per month**. You would not also divide it by 12, because it is already a monthly rate. On the other hand, if the rate is quoted as 6% per year with monthly compounding, the monthly periodic rate is **0.06 / 12 = 0.005**.

Monthly and daily compounding produce different results even with the same quoted annual rate because interest is added at different intervals. More frequent compounding gives interest more chances to earn additional interest. The difference may be small over one year on a modest balance, but it grows with time and balance size.

## Add monthly contributions: the formula changes

Regular deposits need a second piece in the formula. A useful version for monthly deposits made at the end of each month is:

**FV = P(1 + i)^N + M × [((1 + i)^N - 1) / i]**

Where:

- **P** = starting balance
- **i** = interest rate per month
- **N** = total number of monthly periods
- **M** = monthly contribution

The first part, **P(1 + i)^N**, grows the starting balance. The second part grows the stream of monthly contributions. Over long periods, the contribution side can matter more than the initial balance. Someone starting with $1,000 but adding $300 every month can pass someone who starts with more money and contributes little.

Deposit timing changes the result. The formula above assumes deposits happen at the **end** of each month. That is called an **ordinary annuity**. If deposits happen at the **start** of each month, each deposit gets one extra month of growth. That version is called an **annuity due**, and the contribution part is multiplied by **(1 + i)**.

Most plain savings calculators assume end-of-period deposits unless they offer a setting for beginning-of-period contributions. If your paycheck transfer happens on the first day of each month, using an end-of-month assumption will slightly understate the result.

Want to check the math without building the formula by hand? Try the [Savings Calculator](/tool/savings-calculator) with your starting balance, contribution amount, rate, and time horizon. It runs in your browser, so you can test private savings scenarios without uploading data.

At the beginning, recurring deposits can make the interest portion look underwhelming. If you add $200 per month, most of the early balance growth is your own money. Later, as the balance gets larger, the monthly interest amount can start to move noticeably.

## Worked example: one deposit versus monthly deposits

Use the same assumptions for both examples:

- Starting balance: **$10,000**
- Annual interest rate: **5%**
- Compounding: **monthly**
- Time: **10 years**

First calculate the periodic rate and number of periods:

- Monthly rate: **0.05 / 12 = 0.0041667**
- Number of months: **10 × 12 = 120**

For a lump sum with no extra deposits:

**A = 10,000 × (1 + 0.0041667)^120**

The growth factor is about **1.6470**, so:

**A ≈ 10,000 × 1.6470 = $16,470**

The starting $10,000 grows to about $16,470. That means roughly **$6,470** is interest.

Now add **$200 per month**, deposited at the end of each month. The formula becomes:

**FV = 10,000(1.0041667)^120 + 200 × [((1.0041667)^120 - 1) / 0.0041667]**

Break it into two parts:

- Starting balance growth: **$10,000 × 1.6470 ≈ $16,470**
- Monthly deposit growth: **$200 × [(1.6470 - 1) / 0.0041667] ≈ $31,056**

Total future value:

**$16,470 + $31,056 = $47,526**

Now separate your money from the interest:

- Initial deposit: **$10,000**
- Monthly contributions: **$200 × 120 = $24,000**
- Total paid in: **$34,000**
- Final balance: **about $47,526**
- Interest earned: **about $13,526**

You can check this in the [Savings Calculator](/tool/savings-calculator): enter $10,000, $200 monthly, 5% and 10 years, and it shows a final balance of $47,526.55, the same result, because it also adds each deposit at the end of the month.

This comparison is the part many quick explanations skip. The monthly contribution plan does not only add $24,000 to the lump-sum result. Those deposits also compound, although later deposits have less time to grow than earlier ones.

If the $200 deposits were made at the start of each month instead, the deposit portion would be multiplied by **1.0041667**. That adds a small amount because each monthly deposit earns one extra month of interest.

## Why the result can look smaller or larger than you expect

Short timelines make compound interest look modest. At 5% annual interest, one year of compounding does not transform a balance. Over 20 or 30 years, the curve becomes much steeper because each year’s interest is working on a larger base.

The interest rate is not the only lever. Raising monthly contributions from $100 to $300 can matter more than chasing a small rate difference, especially over medium-length time horizons. Frequency matters too: weekly or biweekly deposits can get money into the account earlier than a single deposit at month-end.

Watch the difference between a nominal annual rate and an effective annual rate. A nominal rate states the yearly rate before accounting for compounding within the year. An effective annual rate reflects the result after compounding. With frequent compounding, the effective rate is higher than the nominal rate, although the gap is usually limited for ordinary savings rates.

Also separate nominal dollars from real purchasing power. A future balance of $50,000 may not buy what $50,000 buys now if prices rise over the same period. Taxes can reduce the amount you keep from interest, depending on the account type and rules that apply to you. A compound interest estimate is a growth estimate, not a full after-tax, inflation-adjusted financial plan.

## When the formula is the wrong tool

The neat compound interest formula works best when the rate is constant, deposits are regular, and no money leaves the account. If any of those assumptions break, the single equation can give a misleading answer.

Use a period-by-period approach instead when:

- The interest rate changes over time.
- Deposits are irregular.
- Withdrawals happen along the way.
- A promotional rate applies for only part of the period.
- The account has tiers with different rates for different balances.
- The quoted APY changes after the account is opened.

Loans and credit cards also need different assumptions. Credit card interest can depend on daily balances, billing cycles, payments, and fees. Investments are different again because returns are not fixed; market gains and losses can arrive in uneven chunks rather than as a smooth rate.

If you need to compare several rates, contribution amounts, or time horizons, use a calculator or spreadsheet instead of rewriting the formula repeatedly. The [Savings Calculator](/tool/savings-calculator) is useful for fast scenario checks: try $100 versus $300 monthly, 5 years versus 15 years, or 3% versus 5% and compare the ending balances.

## Quick sanity checks before you trust the number

A good compound interest result should pass a few quick checks before you rely on it.

- The final balance should be higher than the starting balance if the rate and contributions are positive.
- The result should not be wildly large for a short time period and ordinary rate.
- Monthly contributions should be entered as monthly amounts, not annual totals.
- The time span should use one consistent unit: months with monthly periods, years with annual assumptions.
- The interest rate should be entered as a decimal in formulas, or as a percentage only when a calculator asks for a percentage.

Use a rough estimate first. If you contribute $200 per month for 10 years, you will add $24,000 before interest. A calculator result below that amount would signal an input mistake unless withdrawals or losses are included.
