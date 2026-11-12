# Basis

Basis is an options cost-basis averager that lives at https://bookhockeys.com/basis/.
You log every fill of one options position (same ticker, strike and expiry),
buys and trims alike, and Basis keeps a running average cost per share and per
contract. Two calculators answer the questions that come up when a position is
underwater: what does my average become if I add more at today's price, and how
many contracts would I need to buy to reach a target average?

It is a single HTML file with no account. It makes two kinds of network
request. One is the site's Google Analytics visit count, which `?ga=off` turns
off for your device. The other is the price chart: when a position has its
ticker, strike and expiry filled in, Basis asks a small helper worker
(basis-worker.sevendwarfs.workers.dev) for that contract's daily closes from
Yahoo Finance. Only the contract symbol and the date of your first fill are
sent, never your fills. Fills are saved in the browser's local storage, and you
can download them as JSON to back them up or move them to another device.

Sells use the average-cost method: sold contracts leave at your average cost,
so the average of what you still hold does not move and the difference is shown
as realized profit or loss.

## Changelog

### 0.5.0

A new arrangement on wide screens. Your average and the "Since your first
fill" chart now sit side by side at the top, the two what-if calculators sit
under them, and the fills table runs the full width below. The chart needed the
room, and the old layout had a right column that scrolled on its own while the
left side sat mostly empty under a short table. On a tablet the average and the
chart stack, with the two what-ifs side by side. Phones keep the same order as
before. The chart now draws at the card's real width, so a wide screen gets a
wider chart with more dates along the bottom.

If you named a position like "NVDA $215 Call 12/18" and never filled in the
contract, Basis can now read the ticker, strike, call or put and expiry from
the name. The chart card offers a button like "Use NVDA $215.00 call, Dec 18
2026" that saves them in one click, and Rename shows them already filled in for
you to check. A date without a year means the next time that day comes round.
Nothing is saved until you press one of those buttons, and your name stays as
you typed it.

### 0.4.0

A position can now carry its contract: ticker, call or put, strike and expiry.
Leave the name blank and Basis names it for you, like "AAPL $250.00 call, Dec 18
2026". Your saved positions carry over untouched; the contract fields just
start out empty.

The two calculators now show their answer right in the fills table, as a faded
"What-if" row under your real fills, with the running average that buy would
give you. If you like it, "Add as fill" turns it into a real buy dated today, so
you do not have to type it twice. What-if rows are never saved or exported.

With the contract filled in, a new "Since your first fill" chart shows the
option's daily close from the day you first bought, with each of your fills
marked at the price you paid and a line at your current average. You can see at
a glance whether you are buying the dips or chasing. "Use latest close" copies
the last close into Current price. Browsers are not allowed to ask Yahoo for
prices directly, so a tiny worker fetches them; it sees only the contract symbol
and the start date. Expired contracts drop off Yahoo, so their chart is not
available.

### 0.3.0

A new look. The first design, warm paper with an amber accent, did not land
with the owner, so it is gone. Basis now looks like a high-contrast calculator:
plain white, thick black rules, no rounded corners and no shadows. The one
splash of color is rose, and it marks only what matters: your average and the
button that adds a fill. Dark mode keeps the same shapes, just inverted. The
home-screen icon and the share card match. Nothing about the math or your
saved fills changed.

### 0.2.1

Basis moved from dev.rizzo.cc to bookhockeys.com, so the trading tools live
under one roof. It now counts visits with the site's analytics, the same as the
other bookhockeys.com tools. Add `?ga=off` to the address once to leave your own
device out of the count, and `?ga=on` to undo that. Your fills still never
leave your browser.

### 0.2.0

Renamed from Blend to Basis. The name should say what the number is, and the
number this tool gives you is your cost basis. The address is now
https://dev.rizzo.cc/basis/, and the old /blend/ address sends you here. Fills
you saved under the Blend name carry over automatically the first time you open
Basis, so there is nothing to export or re-enter.

### 0.1.0

First release. Brokers show an average cost, but most of them reset or blur it
once you trim a position, and none of them tell you how many contracts it would
take to pull the average down to a number you have in mind. Basis does that
math in one place: a running average across every fill, fees included so the
break-even is honest, plus "add more" and "reach a target" calculators. It works
offline and can be added to a phone's home screen.
