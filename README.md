# Cupertino Plus

Widget cards for [Home Assistant](https://www.home-assistant.io/) dashboards, styled like the
ones on a phone's home screen: sensible defaults instead of a config to fill in, and a shape
taken from the box you drag them into rather than from a size setting.

**[Install](#install)** · **[The cards](#the-cards)** · **[Configuring](#configuring)** ·
**[Development](docs/development.md)**

[![CI status](https://github.com/64bitjoe/cupertino-plus/actions/workflows/ci.yml/badge.svg)](https://github.com/64bitjoe/cupertino-plus/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/github/license/64bitjoe/cupertino-plus)](./LICENSE)
[![Home Assistant 2026.7+](https://img.shields.io/badge/Home%20Assistant-2026.7%2B-41BDF5?logo=homeassistant&logoColor=white)](https://www.home-assistant.io/)

> **A fork.** This is a fork of
> [sabbaken/cupertino-widgets](https://github.com/sabbaken/cupertino-widgets) by
> **Kirill Verenih**, who wrote the calendar and battery cards and everything they stand on.
> The complication and weather cards are the additions here. Same AGPL-3.0 licence, and the
> original copyright notice travels with every build.

It needs a current Home Assistant, **2026.7 or newer**: the cards track the latest frontend
APIs rather than carrying compatibility shims.

## Install

**HACS.** Add this repository as a custom repository of type **Dashboard**:

```
https://github.com/64bitjoe/cupertino-plus
```

Then install **Cupertino Plus** and reload your browser.

**Manually.** Download `cupertino-plus.js` from the
[latest release](https://github.com/64bitjoe/cupertino-plus/releases), drop it in
`config/www/`, and add it under **Settings → Dashboards → Resources** as a JavaScript module:

```
/local/cupertino-plus.js
```

## The cards

Four of them. Each one is in the card picker; none of them needs YAML.

### The calendar

Today's date, then today's events, then as much of the days after today as the card has room
for, one continuous flow poured through however many columns the footprint gives it. Each
event is tinted with the colour of the calendar it came from, and anything due out of your
to-do lists joins the same flow at its own time. Empty days simply do not appear.

<p align="center">
  <img src="docs/images/calendar-medium.png" width="420"
       alt="A medium calendar card: Friday 24, Design review and Lunch with Anna in the left column, Dentist and tomorrow's Market run in the right, then 2 more events">
</p>

Every decision it makes is written down in
[`docs/calendar-widget-rules.md`](docs/calendar-widget-rules.md).

### The complications

Any entity, drawn the way a watch face draws one. Point it at one entity or several, pick a
style, and it works out the rest: the name, the icon, the unit, the colour, and whether there
is a range worth drawing an arc against.

<p align="center">
  <img src="docs/images/complication-medium.png" width="420"
       alt="A medium complication card: four cells — a temperature showing an icon and 21.4 °C with no ring, then humidity, water tank and phone battery as coloured rings">
</p>

Five styles: **circular** (a ring gauge), **rectangular**, **rectangular with header**,
**rectangular full-bleed**, and **inline** (a single strip that stacks into a list).

Two things it does that are worth knowing before you use it. The ring is simply not drawn
when the entity has no honest range to measure — a room's temperature has no ceiling, and an
arc against an invented one would be a fraction of nothing — so that face shows the icon and
the reading instead. And the colour comes from _what the entity measures_ and then holds
still; it never moves with the value, because a colour that stepped with the number would
just be a second, blurrier opinion about a number the gauge has already given you.

The rules, including the contrast work behind the coloured faces, are in
[`docs/complication-widget-rules.md`](docs/complication-widget-rules.md).

### The batteries

A ring per device, green all the way, with the level read off the length of the arc and a
bolt on whatever is charging. Point it at the battery sensors you care about and it works out
how many rings across, whether there is room for the percentages, and how big to draw them.

<p align="center">
  <img src="docs/images/battery-medium.png" width="420"
       alt="A medium battery card: four green rings with a phone at 72%, a watch at 41% charging, earbuds at 8% and a tablet at 100% charging">
</p>

The rules are in [`docs/battery-widget-rules.md`](docs/battery-widget-rules.md).

### The weather

One entity, and everything else follows from it. Current conditions first, then the next six
hours starting from right now rather than from whatever hour the forecast happens to begin at,
and — give the card enough room — the week beyond them, each day drawn as a low, a range bar
and a high. The bars all share one scale, the width of the whole week rather than of the one
day under it, so a warm day sits visibly to the right of a cold one instead of every bar
running the full width of its own row and telling you nothing next to its neighbours.

<p align="center">
  <img src="docs/images/weather-large.png" width="420"
       alt="A large weather card: Home reading 78°F and sunny, six hourly columns starting at Now, then seven daily rows each with a low, a coloured range bar and a high, Today's bar carrying a small dot at the live reading">
</p>

The high and low printed under the current temperature come from the forecast, never from the
entity's own attributes — there is no such attribute to read — so even the smallest card, which
draws neither the hourly strip nor the daily list, still holds a subscription open for it. Night
is mostly a guess the card makes for itself: Home Assistant marks only one condition,
`clear-night`, as explicitly after dark, so every other glyph's day-or-night choice comes from
`sun.sun`'s actual position for the current hour and a plain clock for every hour after it,
because a sun's position is a snapshot and a forecast is not.

The rules, including why the bars are never scaled against themselves, are in
[`docs/weather-widget-rules.md`](docs/weather-widget-rules.md).

## Configuring

Every card has a visual editor — add it from the picker and fill in the form. Nobody needs to
write YAML, and there is no size field in any of them: **Home Assistant's Layout tab owns the
footprint**, and the card re-lays itself out for whatever box you drag it into.

The four types, if you do want to paste config:

| Card         | Type                                 | Asks for                          |
| ------------ | ------------------------------------ | --------------------------------- |
| Calendar     | `custom:cupertino-plus-calendar`     | nothing — it finds your calendars |
| Complication | `custom:cupertino-plus-complication` | entities, and a style             |
| Battery      | `custom:cupertino-plus-battery`      | which battery sensors             |
| Weather      | `custom:cupertino-plus-weather`      | one weather entity                |

Every card also takes `scale`, a percentage of the size it was designed at, for dashboards
being read from across a room.

## Development

`pnpm install && pnpm dev` serves the showcase — every card against a mock Home Assistant,
with no install needed. See [`docs/development.md`](docs/development.md) for the full loop,
and [`docs/ha-api-notes.md`](docs/ha-api-notes.md) for what has actually been verified
against the frontend rather than assumed.

## Licence

[AGPL-3.0-only](./LICENSE). Copyright © 2026 Kirill Verenih, with modifications © 2026
Joe Speakman. If you run a modified version where other people can reach it, the licence
asks you to offer them the source.
