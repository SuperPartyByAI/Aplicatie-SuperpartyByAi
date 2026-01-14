# Evenimente — HTML → Flutter parity map

Source of truth: `kyc-app/kyc-app/REFERENCE_EVENIMENTE_HTML.html`

This document maps the original HTML structure/styles/interactions to the Flutter implementation.

## Page container / background

- **HTML**: `body` background (2 radial gradients + 1 linear gradient), `min-height: 100vh`
  - **Approx lines**: ~30–45
- **Flutter**: `EvenimenteScreen.build()` background layers
  - **File**: `lib/screens/evenimente/evenimente_screen.dart`
  - **Widgets**: `Scaffold` + nested `Container` with `RadialGradient` + `LinearGradient`

## AppBar (sticky header)

- **HTML**: `.appbar` (sticky, blur, bottom border, padding 14/16)
  - **Approx lines**: ~44–55, markup ~1208+
- **HTML**: `.appbar-inner` (column layout, gap 10, max-width 920, centered)
  - **Approx lines**: ~55–63, markup ~1209–1213
- **Flutter**: `_buildAppBar()`
  - **File**: `lib/screens/evenimente/evenimente_screen.dart`
  - **Widgets**: `ClipRect + BackdropFilter(blur) + Container(border bottom) + SafeArea + Padding(16,14) + Center + ConstrainedBox(maxWidth:920)`

## Filters block

- **HTML**: `.filters-block` (column, gap 4, max-width 640)
  - **Approx lines**: ~74–81, markup ~1212–1299
- **Flutter**: `_buildFiltersBlock()`
  - **File**: `lib/screens/evenimente/evenimente_screen.dart`
  - **Widgets**: `ConstrainedBox(maxWidth:640) + Column(gap 4)`

### Filters date row (preset / sort / driver)

- **HTML**: `.filters-date .filters-left` (gap 0)
  - **Approx lines**: ~91–110
- **HTML**: `<select class="date-preset" id="datePreset">` (230×36, radius left, padding 8/28, border)
  - **Approx lines**: ~149–160, markup ~1215–1223
- **HTML**: `button.sort-btn` (44×36, radius 0, `margin-left:-1px`)
  - **Approx lines**: ~101–104, markup ~1225–1235
- **HTML**: `button.driver-btn` (44×36, radius right, `margin-left:-1px`) + badge state
  - **Approx lines**: ~105–109, markup ~1237–1263
- **Flutter**: `_buildDatePresetDropdown()`, `_buildSortButton()`, `_buildDriverButton()`
  - **File**: `lib/screens/evenimente/evenimente_screen.dart`
  - **Notes**:
    - Border overlap (HTML `margin-left:-1px`) is simulated without negative layout by dropping the left border on the next button.

### Filters extra row (code / notedBy / btnspacer)

- **HTML**: `.text-input` (150×36, radius 12, padding 0 8, border, background)
  - **Approx lines**: ~119–136, markup ~1269–1283
- **HTML**: `.sep` (– separator)
  - **Approx lines**: ~142–147, markup ~1276–1277
- **HTML**: `.btnspacer` (keeps layout aligned with sort button)
  - **Approx lines**: ~828–829, markup ~1285–1291
- **Flutter**: `_buildFiltersExtra()`, `_buildCodeFilterInput()`, `_buildNotedByFilterInput()`
  - **File**: `lib/screens/evenimente/evenimente_screen.dart`

## Cards list / empty state

- **HTML**: `.wrap` (max-width 920, centered, padding 12)
  - **Approx lines**: ~844–848, markup ~1431–1436
- **HTML**: `.cards` (column, gap 10, padding-bottom 24)
  - **Approx lines**: ~849–854
- **HTML**: `.empty` (margin-top 14, padding 14, border radius 16)
  - **Approx lines**: ~1013–1021, markup ~1433–1435
- **Flutter**: `_buildEventsList()` empty/list rendering
  - **File**: `lib/screens/evenimente/evenimente_screen.dart`
  - **Widgets**:
    - List: `Center + ConstrainedBox(maxWidth:920) + ListView.builder(padding bottom 24)`
    - Empty: `ConstrainedBox(maxWidth:920) + Padding(12) + Container(margin-top 14, padding 14, radius 16)`

## Event card (HTML buildEventCard)

- **HTML**: `.card` grid (46px / 1fr / auto), padding 12, radius 16
  - **Approx lines**: ~856–866, JS builder ~3910+
- **HTML**: `.badge` (46×34, radius 12, bg rgba(78,205,196,0.16))
  - **Approx lines**: ~868–885, JS ~3933–3936
- **HTML**: `.main .meta` (address, font 12, muted)
  - **Approx lines**: ~887–900, JS ~3937–3943
- **HTML**: `.rolelist` grid (46px / 1fr), gap 4/8; `.role-slot` and `.role-label` + status
  - **Approx lines**: ~901–959, JS ~3944–4008
- **HTML**: `.right` (date + subdt lines), aligns end desktop / start on mobile
  - **Approx lines**: ~990–1042, JS ~4012–4036
- **Flutter**: `EventCardHtml`
  - **File**: `lib/screens/evenimente/event_card_html.dart`
  - **Notes**: Mobile breakpoint is aligned with HTML media query `max-width: 520px`.

## Modals (Code, Assign, CodeInfo, Range)

- **HTML**: code modal / assign modal / code info modal / range modal are “sheet” overlays
  - **Approx lines**: ~1450–1900 (varies), JS handlers ~4057+
- **Flutter**:
  - **Files**:
    - `lib/widgets/modals/code_modal.dart`
    - `lib/widgets/modals/assign_modal.dart`
    - `lib/widgets/modals/code_info_modal.dart`
    - `lib/widgets/modals/range_modal.dart`

## Dovezi / evidence

- **HTML**: `#pageEvidence` section
  - **Approx lines**: ~1440+
- **Flutter**:
  - `lib/screens/evidence/evidence_screen.dart` (current route target)
  - (legacy HTML clone exists as `lib/screens/evenimente/dovezi_screen_html.dart`)

