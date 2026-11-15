# Live Activity widget: the rules

One card, a stack of jobs, and the premise the tiles card refuses: an activity is not always
there. Point it at an appliance's status sensor and it draws a glass panel while the appliance is
running (what it is doing, how far along, how long is left), says "Done" for a few minutes once it
ends, and then goes away. This is Apple's Live Activity on a dashboard. It is the specification
the card implements; `src/cards/live-activity/model.test.ts` pins the worked cases below.

Read [`tiles-widget-rules.md`](tiles-widget-rules.md) first. The glass, the press, the colour
palette and the list editor are the tiles card's, imported or copied for the reasons that document
gives. Where this one differs, it says so.

---

## 1. What an activity is

```ts
{
  entityId: string | undefined, // the status entity; what a press acts on
  name: string,          // the row's name, or the status sensor's with its suffix cut off (§5)
  icon: string,          // the row's icon, the entity's own, or a guess from its id (§5)
  color: string,         // a resolved CSS colour; green for Done, red for a failure
  kind: 'active' | 'done' | 'failed' | 'idle',
  phase: string,         // "Rinsing", "Printing", "Done", "Power off"
  detail: string | undefined,      // "Layer 120 of 300"
  remainingMs: number | undefined, // the countdown
  finishAt: number | undefined,    // when it will finish, or did
  progress: number | undefined,    // 0..1; undefined draws no bar
  visible: boolean,
  action, holdAction?, doubleTapAction?
}
```

`model.ts` is the whole of the card's contact with Home Assistant. The element keeps only what
needs memory across renders (§3) and the clock.

## 2. Running, idle, ended

The status entity's state, folded (`Power Off`, `power off` and `power_off` are one), is one of
three things, tested in this order:

1. **Ended**: one of `end, finish, finished, complete, completed, done, failed, cancel,
cancelled, canceled, aborted`, plus the row's `done_states`.
2. With `active_states` set: **running** if it is one of them, **idle** otherwise. A whitelist,
   for a device with a dozen codes of which four mean running (a Litter-Robot's `status_code`:
   `ccp, cst, cd, csi`).
3. Otherwise **idle** if one of `off, idle, standby, power_off, initial, ready, docked, sleep,
sleeping, stopped, inactive, offline, none`, plus the row's `idle_states`, and **running**
   for anything else.

`unavailable`, `unknown` and a missing entity are always idle: not reporting is never news.

The lists are read however they were written: `active_states: running` is a list of one,
`running, washing` a list of two, and numeric codes (`active_states: [1, 2]`) match the states
`1` and `2`. Anything else in a list is dropped, never thrown on.

The lists _add to_ the defaults rather than replace them, because the common need is one more
state (an LG dishwasher's `night_dry`), and making somebody retype thirteen states to add one is a
form that punishes the common case. `active_states` is the escape hatch for the rare device the
defaults are wrong for. `initial` is idle on purpose: an LG washer reads it from the moment its
door opens until a cycle starts, and a panel saying "Initial" while somebody loads it is noise.

`error` is deliberately not idle: an appliance in error is worth seeing. Add it to `idle_states`
for one that sits in error for days (a Litter-Robot with a full drawer).

## 3. Done, and how long it lingers

An ended job says **Done** in green (or its own word, "Failed", in red, when the state reads as a
failure) for `done_minutes`, then is idle. **Ten minutes** by default: Apple keeps an ended
activity up to four hours on a Lock Screen glanced at every few minutes; a dashboard is looked at
less, and the job that most wants the reminder (a wash to move to the dryer) wants it about as long
as it takes to notice. `0` never shows Done; the ceiling is 240, Apple's.

When it ended is the hard part, because most appliances do not stop in a done state (an LG
washer says `end` for thirty seconds, then `power_off`), and because a done state on its own proves
nothing: every entity's `last_changed` moves at a Home Assistant restart, so a printer that has sat
in `finish` for a week claims to have finished at the restart. The evidence, in order
(`endedAtFor`):

1. **What the card saw.** A job it saw running and then saw stop ended at the `last_changed` of
   the first state after the run (`ActivityTrack`, `trackActivity`). An `end` followed by
   `power_off` keeps the `end`'s time. Not reporting is not stopping: a job that goes
   `unavailable` or `unknown` mid-run (a Wi-Fi drop, a restart) leaves the memory as it was. If
   it comes back running, the run carries on; if it comes back idle or done, the card did not see
   it finish (it may have been switched off at the wall), so only the recorder can say Done, and
   its walk calls a run broken by `unavailable` no run. Neither the state alone nor the
   `unavailable` state's own `last_changed` is ever taken for the ending.
2. **What the recorder says** (`history.ts`). For a job the card did not see stop, whose current
   state began within the linger (anything older could not be Done whatever happened), the card
   asks `history/history_during_period` for that one entity, from a minute before the linger to
   a minute past now (slack for a browser clock behind the server's), `minimal_response`, `no_attributes`, `significant_changes_only: false`, once per state
   change (cached by entity and `last_changed`). Read backwards from the current state, done
   states are walked through as part of the ending; the first running state found means it ran,
   and ended at the row after it. Anything idle on the way, `unavailable` included, means it did
   not: that is a restart (`finish`, `unavailable`, `finish`), and so is a window that never
   leaves the done state (`finish`, `finish`). While the answer is pending nothing says Done, so a
   restart never flashes one the answer would take back. An answer whose last row is not the
   state the entity is in now has not caught up with it (the query ended before the change) and
   is not kept: the card asks once more three seconds later, and after a second such answer
   falls back to the state alone (3).
3. **The state alone**, only when there is no recorder to ask: an empty answer (the entity is
   excluded from the recorder) or a failed call. Then a done state is Done from its own
   `last_changed`, as before this check existed, and an idle state is not.

So a dashboard opened ten minutes after the wash finished shows its Done, a restart shows none,
and the cost is one small query per appliance per state change, only within the linger.

## 4. Time and progress

**The time left** is read from whatever shape the sensor reports:

| Shape                                          | Read as                 | Seen on           |
| ---------------------------------------------- | ----------------------- | ----------------- |
| `device_class: timestamp`, or any ISO datetime | the finish time         | LG ThinQ          |
| a number with `s`, `min`, `h`, `d` (or spelt)  | a duration              | Bambu (`h`)       |
| a number with no unit                          | minutes                 | most appliances   |
| `1:05:00`, `1:05`, `1 day, 2:00:00`, `PT1H5M`  | a duration (H:MM first) | templates, Python |

A timestamp gives the countdown (end − now, never below zero) and ticks between updates. A
duration is counted from the sensor's `last_updated`, so it ticks too (Bambu reports once a
minute). Two cases are not anchored and stand still at the reported value: a paused job (the
status or phase reads `pause…`), whose duration is frozen and whose `last_updated` is from before
the pause, and a report older than the duration it gave. A duration of zero is no estimate, not
"done now": Bambu reports `0.0 h` from the moment it starts preparing.

The countdown reads like the Clock app: `<1 min`, `23 min`, `1 hr 5 min`, `2 hr`, rounded _up_ so
thirty seconds left is "1 min", never "0 min". Under the `seconds` threshold it is the Timer's
`m:ss` instead, rounded up too (`0:01` at 0.4s), and the last hour starts at `59:59`, never
`60:00`: `seconds: hour` (default), `ten_minutes`, or `never`.

**Progress** is a percentage sensor if there is one, else `1 − remaining ÷ total` when a
`total_entity` gives the whole job's length (LG's `total_time`), else nothing — and nothing draws
**no bar**, not an indeterminate one. A Live Activity without a measure has no bar; an animated
stripe going nowhere is the web's idiom.

**Steps**: `step_entity` (and `step_total_entity`) adds "Layer 120 of 300" to the phase line,
`step_label` naming the step. **Phase**: `phase_entity` replaces the status's word with a more
specific one (a Bambu `current_stage` says "Auto bed levelling" where `print_status` says
"Running"), unless it reads idle, in which case the status speaks.

States are printed with `hass.formatEntityState` when the frontend has it, so each integration's
own translation is used (a Litter-Robot's `ccp` is "Clean cycle in progress"); `formatValue`
stands in where it does not.

## 5. Names and glyphs

A status sensor's name is mostly its own word for itself: "Front Load Washer Current status".
The card cuts `current status`, `print status`, `run state`, `operation state`, `machine state`,
`status code`, `current stage`, `status` and `state` off the end. A name that is nothing but the
suffix is kept.

A status sensor is an `enum` sensor, which to `iconFor` is any sensor, so it would draw an eye. The
glyph is guessed from the id and name, specific first: dishwasher, dryer, washer, litter box, 3D
printer, vacuum, microwave, oven, coffee, kettle, EV charger, sprinkler; then the entity's own
glyph; then a timer.

## 6. Visibility, and the card when nothing is running

`when_idle` on the card:

- **`hide`** (default) — idle activities disappear, and so does the card once none are left.
  The card sets `hidden` and fires `card-visibility-changed`, which is what `hui-card` needs to
  collapse the grid cell; rendering nothing would leave the gap. Never while editing (`preview`):
  the card shows its message line then, so it can be found.
- **`message`** — idle activities disappear, and an `idle_message` line ("Nothing running")
  stands in when none are left.
- **`show`** — idle activities stay, dimmed to 55% (the tiles card's not-reporting dim), with
  their state.

A row's own `when_idle` (`hide` or `show`) overrides the card's for that activity.

An activity that disappears fades out (320ms) from its last visible look, and one that appears
fades in; both are dropped under `prefers-reduced-motion`, as are the bar's and ring's transitions.

## 7. The two styles

**`expanded`** (Lock Screen, default): a glass panel per job, radius 24. The glyph on a disc of its
own colour at 16% (24% in dark), the name in Subheadline semibold over the phase in Footnote
secondary, the time on the trailing edge in Title 2 with its units in Footnote, and a 6pt bar the
width of the panel. `time: both` puts "Ends 9:41 PM" under the countdown; `time: finish` shows the
clock time with "Finishes" under it.

**`compact`** (Dynamic Island): a 44pt glass pill per job. The progress is a ring round the glyph
(the battery card's ring geometry, `core/ring.ts`), the name and phase share one line, and the
time is on the trailing edge in the activity's colour.

An ending shows when it ended, quietly, in secondary text: the green "Done" or red "Failed"
already says what happened, and a tick beside it said it a third time.

Colour is restrained to three places: the glyph, the bar or ring, and (compact) the time. The
default is `accent`, the theme's own; `color` on the card or a row picks from the palette.

Every number is tabular, so a countdown ticking from 10 to 9 does not shuffle the name beside it.

## 8. Pressing and VoiceOver

The tiles card's press, unchanged: tap, hold and double tap, default more-info on the status
entity, `none` on every gesture makes the activity not a button. Each activity is one stop for
VoiceOver, labelled with everything it shows, in order: "Washer, Rinsing, 23 minutes left, done
at 9:41 PM, 60 percent".

## 9. The clock

There is no interval. After every update the card works out when the next printed value changes
(`nextTickIn`: the next second of a countdown in `m:ss`, the next minute otherwise, the switch to
seconds, or the end of a Done) and sleeps until five milliseconds past it, capped at a minute. A
card with nothing moving runs no timer. Nor does a card off screen (an `IntersectionObserver`) or
in a hidden tab (`visibilitychange`); coming back repaints at once. Every update reads the clock
afresh rather than keeping one, so an update from `hass` after an hour asleep draws the right
countdown. Digits change without animation, so reduced motion has nothing to stop here; the bar
and ring transitions are dropped under it as before.

Clock times follow the profile's time format and zone through the calendar card's
`timePreferences`.

## 9a. Templates

Each activity's `name`, `icon`, `color`, `phase` (the phase line), `detail` (the supporting text
after it), `remaining` (the time left) and `show` may be a Jinja template, rendered by
`render_template` subscriptions the card opens and closes with the config, through the shared
`TemplatePool`. Each template gets `entity` and `config.entity` (the status entity) and `user`, the
chips card's variables. The actions' paths and data may be templates too, as on a tile.

A template that has not answered, or answered nothing, overrides nothing: the card shows what the
sensors say until it does. `remaining`'s answer is counted down when it reads as a time (a
datetime, `1:05:00`, a number of minutes) and printed as written otherwise ("Starts 1:00"), on an
idle activity too. `show` forces an activity in when truthy (an idle one draws dimmed) and out
when falsy; before it answers, the activity shows or hides as it would anyway, which is the
opposite of a tile's `show` (hidden until it answers), because an activity has a visibility of its
own to fall back on.

## 10. The editor

Everything is in the visual editor. The activity list is the shared sortable panel list (`core/panel-list.ts`)
(add from an entity picker, drag, duplicate, remove), each panel: **Status**, **Name**, **Icon**,
**Colour**, **Time left**, **Progress**, **Whole job takes**, **Phase**, **Step** (then **Steps in
all** and **A step is called** once a step is chosen), the three press dropdowns, and a **Choose
which states count** switch revealing the three state lists, **Show Done for (minutes)** and
**While idle**, and a **Use templates** switch that swaps the icon and colour pickers for text
boxes and reveals **Phase line**, **Supporting text**, **Time left text** and **Show when**. Both
switches are views, not keys, and open themselves for a row that already says something there. The state lists offer the status entity's own `options` (every `enum` sensor
lists them) and accept typed ones.

Card level: **Style**, **Show**, **Show seconds** (not offered with finish times, which have no
countdown), **When nothing is running** (then **Message**), **Show Done for
(minutes)**, **Activity colour**, **Background**, and the shared **Scale**.

## 11. Not done

- **Reordering by recency.** Activities keep config order, which is predictable; Apple orders by
  start time, which the card does not know.
