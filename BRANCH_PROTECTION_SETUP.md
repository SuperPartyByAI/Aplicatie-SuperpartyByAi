# Branch Protection Setup - GitHub UI Steps

**CRITIC P0**: Fără branch protection, merge-urile pot trece cu CI roșu.

---

## Pași în GitHub UI

1. **Mergi la repo**: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi
2. **Settings** → **Branches** (în sidebar stânga)
3. **Add rule** (sau editează regula existentă pentru `main`)
4. **Branch name pattern**: `main`
5. **Configurează:**
   - ✅ **Require a pull request before merging**
     - ✅ Require approvals: `1`
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ **Require status checks to pass before merging**
     - ✅ Require branches to be up to date before merging
     - **Status checks** (selectează):
       - `test-flutter` (din `flutter-ci.yml`)
       - `test-functions` (din `whatsapp-ci.yml`)
   - ✅ **Do not allow bypassing the above settings** (pentru admins)
6. **Create** (sau **Save changes**)

---

## Verificare

După configurare:
1. Creează un PR de test cu o eroare (ex: adaugă `throw Exception()` în cod)
2. Verifică că merge button este **blocat** (disabled) când CI e roșu
3. Fixează eroarea
4. Verifică că merge button este **permis** când CI e verde

---

## Status Check Names

**IMPORTANT**: Numele status check-ului trebuie să fie exact același cu numele job-ului în workflow.

- `flutter-ci.yml` → job `test-flutter` → status check: **`test-flutter`**
- `whatsapp-ci.yml` → job `test-functions` → status check: **`test-functions`**

Dacă nu vezi aceste nume în listă, așteaptă ca workflow-urile să ruleze cel puțin o dată (după push pe branch).

---

## Troubleshooting

### "No status checks found"
**Cauză**: Workflow-urile nu au rulat încă pe branch-ul respectiv.

**Fix**: 
1. Fă un push pe branch (sau creează un PR)
2. Așteaptă ca workflow-urile să ruleze
3. Revino la Settings → Branches și verifică din nou lista de status checks

### "Status check name doesn't match"
**Cauză**: Numele job-ului în workflow nu se potrivește cu numele din branch protection.

**Fix**: Verifică în workflow YAML că `jobs.<job-name>` este exact același cu numele din branch protection.
