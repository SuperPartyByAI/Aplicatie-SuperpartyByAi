# WhatsApp Accounts – RenderFlex overflow + getAccounts spam

## Rezumat

- **A) RenderFlex overflow**: Row cu `MainAxisAlignment.spaceBetween` (Open Firefox, Regenerate QR, Setări AI, Backfill, Delete) depășea ~16px pe ecrane înguste. Înlocuit cu `LayoutBuilder` + layout responsive.
- **B) getAccounts spam**: Polling la 2s fără throttle + fără in-flight guard → multe request-uri consecutive. Adăugat throttle (5s), in-flight guard și skip când `_isLoading`.

---

## A) Fix RenderFlex overflow

**Cauză:** `Row(mainAxisAlignment: MainAxisAlignment.spaceBetween)` cu butoane (Open in Firefox, Regenerate QR, Setări AI, Backfill, Delete) nu se încadra pe lățimi mici (ex. iPhone), ducând la overflow.

**Fix:**
- `LayoutBuilder` pe `constraints.maxWidth`:
  - **Îngust (`maxWidth < 360`)**: `Column` cu zona stângă (Firefox / info) deasupra și `Wrap` cu toate butoanele dedesubt. Pe îngust folosim label-uri scurte: „Firefox”, „Regen”, „AI”, „Backfill”.
  - **Larg**: `Row(spaceBetween)` cu stânga + `Flexible(child: Wrap(..., alignment: end))` pentru butoane. `Wrap` le trece pe rândul următor dacă nu încap.
- `onPressed` și restul logicii rămân neschimbate.

**De ce e safe:** Doar layout-ul s-a schimbat. Acțiunile butoanelor sunt aceleași; pe îngust doar textele sunt scurte.

---

## B) Fix getAccounts spam

**Cauze:**
1. **Polling la 2s**: Timer-ul apela `_loadAccounts()` la fiecare 2s când existau conturi „waiting” (QR), fără limitare.
2. **Fără in-flight guard**: Se putea porni un nou `_loadAccounts()` în timp ce un request era în curs (ex. refresh + polling, sau click rapid pe Refresh).

**Fix:**
1. **Polling**: Interval mărit la **5s**. Înainte de `_loadAccounts()` se verifică `if (_isLoading) return` și `if (!hasWaitingAccounts) return`.
2. **In-flight**: `_loadInFlight`. La începutul lui `_loadAccounts()`: `if (_loadInFlight) return; _loadInFlight = true;`. În `finally`: `_loadInFlight = false`.
3. Refresh manual (pull-to-refresh, buton Refresh, Retry) rămâne la fel; guard-ul doar împiedică cereri suprapuse.

**De ce e safe:** Nu se blochează refresh-ul manual; se evită doar rularea concurentă/superfluă a lui `_loadAccounts()`.

---

## Fișier modificat

- `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`

## Verificări

- `flutter analyze`: 0 erori (doar info/hint).
- `flutter run` pe iPhone 17: fără RenderFlex overflow în log.
- getAccounts: mult mai puține apeluri (polling 5s, in-flight guard). Dacă mai apar mai multe, pot fi din navigare repetată sau refresh manual.

## Diff

Vezi `git diff superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`.
