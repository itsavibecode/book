# Basis

Basis is an options cost-basis averager that lives at https://bookhockeys.com/basis/.
You log every fill of one options position (same ticker, strike and expiry),
buys and trims alike, and Basis keeps a running average cost per share and per
contract. Two calculators answer the questions that come up when a position is
underwater: what does my average become if I add more at today's price, and how
many contracts would I need to buy to reach a target average?

It is a single HTML file with no server and no account. The only network
request is the site's Google Analytics visit count, which `?ga=off` turns off
for your device. Fills are saved in the browser's local storage, and you can download them as
JSON to back them up or move them to another device.

Sells use the average-cost method: sold contracts leave at your average cost,
so the average of what you still hold does not move and the difference is shown
as realized profit or loss.

## Changelog

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
