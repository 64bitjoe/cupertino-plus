# Calendar widget: the layout rules

Reconstructed from Apple's own Calendar widget and checked against eight screenshots of
it. This is the specification the card implements; the code follows it section by
section, and `src/cards/calendar/*.test.ts` pins the worked examples at the bottom.

Two sizes, matching the two Apple offers on a home screen:

- **small** — today, and nothing else, ever
- **medium** — two columns of one continuous flow: today plus what comes after it

---

## 1. What a row is

```ts
{
  kind: 'event' | 'reminder',
  title: string,
  location?: string,
  start: Date,
  end?: Date,          // reminders have none
  allDay?: boolean,
  color: string        // the calendar's colour
}
```

**Event** — a thin coloured bar down the left, a background of the calendar colour at
low alpha, the title in the calendar colour (lifted towards white on a dark theme),
the time in the same colour, weaker.

**Reminder** — a neutral grey background, an empty circle in the list's colour, muted
text. Reminders never show a location.

**All-day event** — the tint of an event, but the bar gives way to a filled circle with
a calendar knocked out of it, in the calendar colour, and then the title on one line
with an ellipsis. Nothing else: no time, no location, no expanded form. The badge has to
carry the meaning on its own, because there is no second line left to say "all day" on.
The circle is set concentric with the rounded end of the chip and 2px smaller in radius,
so it clears the chip by the same 2px right around that arc — not on the 10px rail inset
the other rows use, and not flush either: flush, the two rims merge into one edge and
the badge stops reading as a badge. The chip is 24px with a 12px radius, so the badge is
20px with a 10px one, and the row still measures the 24px §4 prices it at.

The calendar is `mdiCalendarMonth`, taken from `@mdi/js` as a path string and inlined.
That is Home Assistant's own icon set, so the badge matches the icons around it on the
dashboard, but it is deliberately not an `<ha-icon>`: rows are priced in pixels here
(§4), and an icon that resolves a frame late out of HA's registry would be measured at
the wrong height. The dev harness has no registry at all, and the screenshots below are
taken in it.

**`2 more events`** — the tail indicator, and the one row the flow can end on that is
not an item: a thin bar in the calendar colour, grey text at a normal weight, and
**no tinted background**, unlike an event. A tint would read as one more event, when the
point of the line is that those did not fit.

## 2. Selection and order

1. Today and forwards only — a fortnight is more than enough.
2. Anything that has finished is dropped; anything running now stays. Only a real end
   time can retire a row, so an overdue reminder stays up for the rest of its day.
3. Inside a day: all-day first, then by start time. Reminders and events share one
   stream — `Weigh in 10:30` comes before `Lessons 12:00`, and it is not shunted into
   a section of its own.
4. Sections are calendar days. **A day with nothing in it disappears entirely**,
   heading and all: if today is Friday and Saturday is empty, the next heading is
   `SUNDAY, 26 JUL`, not an empty Saturday.

Everything above is answered in the _display_ timezone — Home Assistant lets a profile
follow the server's zone rather than the browser's, and "is that tomorrow" has a
different answer in each.

## 3. Headings

**The widget's own date**, top left, always: the weekday in capitals in the accent
red, and the day number, large. Always today, whether or not today has anything in it.

**Section headings**, in the flow, medium only:

| Section                     | Heading                            |
| --------------------------- | ---------------------------------- |
| today                       | none — the date block already said |
| exactly one day after today | `TOMORROW`                         |
| anything later              | `SUNDAY, 26 JUL`                   |

`TOMORROW` means literally tomorrow. If tomorrow is empty and the next section is the
day after, that section gets a date. Headings are small and grey, never a calendar
colour, and follow the locale's own day/month order (`JUL 26` in en-US).

## 4. What each size shows

**Small** — today. If today is empty: `No Events Today`. Other days never appear, not
even when today is empty and tomorrow is full.

**Medium** — two columns holding one vertical flow that spills from the left column
into the right:

- left: the date block, and the start of the flow beneath it;
- right: the same flow continuing — the rest of today first, **with no heading**, then
  the next day's heading and its rows;
- if today is empty, the left column reads `No Events Today` under the date and the
  flow starts at the top of the right column.

## 5. The height budget

The unit is one line of text inside the card.

| Element                                | Cost |
| -------------------------------------- | ---- |
| compact row (title + time)             | 2    |
| expanded row (title + location + time) | 3    |
| all-day row (title alone)              | 1    |
| section heading                        | 1    |
| `2 more events`                        | 1    |

| Column               | Budget |
| -------------------- | ------ |
| small                | 4      |
| medium, left column  | 4      |
| medium, right column | 7      |

A node goes in the current column if it fits there whole; otherwise the next column
takes it. A heading never ends up alone at the bottom of a column: if its first row will
not follow it there, the whole section moves on. What that reservation costs depends on
what the first row is — two rows for a timed event, one for an all-day entry — so a
heading and an all-day entry can move into a gap that a heading and a timed event could
not.

### The tail

What is left over when the columns run out is summarised as `2 more events`, at the end
of the flow — meaning the last column the flow actually reached, not whichever column
happens to have space left in it.

The indicator costs a row like everything else, and it is added **after** the packing, out
of what is left: it never evicts the row above it. So a column that came out exactly full
loses its tail in silence, with nothing at all to mark it. That is not an oversight in the
widget being copied — it is why `Training` simply vanished in the third and fifth
screenshots: the right column was occupied to exactly seven rows.

`N` counts the items that were not drawn. Headings do not count: a section that got cut
takes its heading with it, and `2 more events` that meant "one event and one Thursday"
would be a lie. Singular is `1 more event`.

In the small size the indicator competes with §6's locations for the same leftover rows,
and wins: "count wins" is about how much of the day you know about, not how much of it is
drawn. Two timed events fill four rows exactly and leave nothing to argue over, but an
all-day entry costs one row instead of two, so `1 + 2` leaves the row that decides it —
which is why this is a live contest at the default height, not only on a card dragged
taller.

### Where those numbers come from here

Apple can hardcode 4 and 7 because an iPhone widget is always the same number of
points tall. A Home Assistant card is whatever the user dragged it to, so `layout.ts`
measures instead. A row is priced at 31px — half of a compact row's 56px plus the 6px
gap beneath it, which is the dearest any kind of row gets per row, so no mix of them can
overflow. The right column fits `floor((content + 6) / 31)` of those; the left one is
short by the 84px date block above it. At the default card height of 248px that works out
to exactly 4 and 7, and a card dragged taller shows more rows rather than leaving a blank
strip at the bottom.

Two pixels of that arithmetic are easy to lose, and losing either one clips a descender
off the last row of a column packed exactly full:

- `content` is the card's measured height less the 16px inset **and less the 1px border
  `ha-card` draws top and bottom** — it is `box-sizing: border-box`, so the border comes
  out of the height, not on top of it.
- a compact row is 56px only while the AM/PM keeps out of the line box. A smaller font in
  the same line gets a larger half-leading and hangs below the strut, which made the time
  line 22px instead of 20 and the row 58px on any 12-hour clock; the `.meridiem` rule
  zeroes its line-height to take the box back out of the sum.

## 6. When a location shows

The location is a third line, drawn only when the item has one and there is room. The
two sizes disagree on purpose:

- **Medium — greedy, location wins.** Going top to bottom: if an event has a location
  and three rows fit in what is left of the column, draw it expanded, even though the
  next event will be pushed into the other column or off the card entirely.
- **Small — count wins.** Pack everything compactly first, then spend whatever budget
  is left over on locations, top down. One event → 3 rows, location shown. Two timed
  events → `2 + 2`, no slack, so neither shows a location even though the first one
  would have fitted. The rule is about the slack and not about the count, though: an
  all-day entry and a timed event come to `1 + 2`, and the row that leaves over does buy
  the location. The tail indicator draws from the same slack and is served first (§5).

Neither size ever expands an all-day entry: it has no expanded form, so both the greedy
medium pass and the small slack pass step over it.

Location and title are each one line, truncated with an ellipsis.

## 7. Time

- 12-hour or 24-hour per the locale, AM/PM a size down.
- `:00` is not printed on a 12-hour clock: `5 – 6PM`, `3 – 4:30PM`. A 24-hour clock
  keeps its minutes — `17 – 18` would read as a range of numbers.
- The meridiem prints **only on the end of a range** while both ends are in the same
  half of the day: `12 – 1PM`, `6:15 – 7:15PM`. Different halves, and both get one:
  `11AM – 1PM`.
- The separator is a spaced en dash.
- No duration — a reminder, a zero-length event — prints one time: `10:30AM`.
- All-day prints no time at all, and no location either — one line of content, costing
  the one row (§5).

## 8. Worked examples

Each of these is a test in `layout.test.ts`. A column is written as the cost of each
row in it, in order. Tomorrow is three more rows in every case.

| Today                             | Left  | Right     | The tail                                   |
| --------------------------------- | ----- | --------- | ------------------------------------------ |
| 3 events, no locations            | `2+2` | `2+1+2+2` | one event gone in silence — column is full |
| 2 events                          | `2+2` | `1+2+2+2` | — everything fitted                        |
| 1 event with a location           | `3`   | `1+2+2+2` | — everything fitted                        |
| 2 events, a location on the first | `3`   | `2+1+2+2` | one event gone in silence — column is full |
| 2 events, a location on both      | `3`   | `3+1+2+1` | that last `1` is `2 more events`           |
| all-day + 1 event with a location | `1+3` | `1+2+2+2` | — everything fitted                        |

The fifth row is the seventh screenshot, and it is worth reading twice: the location
`Dworzec PKP` on the second event is what cost tomorrow two of its three rows. Greedy
locations are paid for in events (§6), and the indicator is how the widget admits it.

The sixth is the eighth screenshot, and it is the same trade read the other way: the
all-day entry costs one row instead of two, and that saved row is exactly what pays for
`Bydgoszcz Główna` underneath the event below it. The same day in **small** comes to
`1 + 3` — two items _and_ a location inside four rows.

## 9. Still open

No screenshot settles these, so they are decided rather than known. Each is one edit —
the count in `addMoreRow`, the wording in `moreLabel` — and the current answer is
whichever keeps the rule simplest to state.

- **How far `N` reaches.** Today it counts every item that did not fit anywhere in the
  loaded window, which is a fortnight (`LOOKAHEAD_DAYS`), so a busy calendar can read
  `19 more events`. The alternative is to count only the days already on screen — the
  sections the flow had started — and say nothing about the rest.
- **What to call them.** Always `events`, even when everything hidden is a reminder.
  `2 more items` would be truthful and is uglier.
- **Whether the small size gets one at all.** It does; see §5. An all-day entry costing
  one row is what makes it reachable at the default four rows — `1 + 2` and the indicator
  in the row left over.
