# SPEC_POLITICI_PRODUCȚIE v3.2.3 (reorganizată, aceeași esență)

**Creat la:** 2025-12-28T19:00:00Z  
**Ultimul update:** 2025-12-29T10:00:00Z  
**Status:** Activ  
**Scop:** Set de politici operaționale pentru a evita improvizațiile, a forța soluții stabile pe termen lung și a impune execuție verificabilă (RCA, idempotency, securitate, observabilitate, testare, documentație).

---

## 0) Domeniu de aplicare și definiții

### 0.1 Domeniu

Se aplică la orice activitate care implică:

- planificare, implementare, inițializare, publicare, migrații, exporturi/build-uri
- modificări de cod/configurații
- creare/modificare de fișiere sau resurse (locale ori la distanță)

### 0.2 Definiții (normative)

- **Acțiune:** orice operațiune care creează/modifică/stochează/publică/inițializează sau generează artefacte.
- **Dovadă:** element verificabil (log, output comandă, fișier citit, test executat, citire după scriere, link la issue/incident).
- **RCA (Root Cause Analysis):** analiza cauzei rădăcină, bazată pe loguri/metrici/stacktrace și validată prin teste/confirmări.
- **Idempotency:** aceeași operațiune poate rula de N ori fără efecte secundare (dubluri, suprascrieri nedorite).
- **Istoric disponibil:** sursele accesibile în mod efectiv la momentul execuției (repo, commit log, fișiere de stare, documentație, loguri operaționale).

---

## 1) Priorități și reguli de rezolvare a conflictelor

### 1.1 Priorități

- **CRITIC:** încălcarea blochează execuția (STOP).
- **IMPORTANT:** trebuie satisfăcut înainte de finalizare (gate).
- **RECOMANDAT:** bună practică (nu blochează dacă există justificare + risc acceptat).

### 1.2 Rezolvare conflicte (CRITIC)

Dacă două politici intră în conflict:

1. Se aplică politica cu prioritate mai mare.
2. Dacă au aceeași prioritate: se oprește execuția și se intră în **mod investigație** (fără creare/modificare).
3. Se documentează conflictul și decizia.

---

## 2) Principii non-negociabile (CRITIC)

1. **Fără improvizații pe termen scurt:** sunt interzise ocolirile temporare, „pansamentele", forțările, ștergerea/recrearea fără analiză.
2. **Soluții de nivel producție:** gestionare corectă a erorilor, testare, documentație, monitorizare, scalabilitate, securitate.
3. **Investigație înainte de acțiune:** RCA înainte de modificări.
4. **Reutilizare înainte de creare:** se caută și se reutilizează ce există deja.
5. **Idempotency by default:** guard rails + checkpointing obligatoriu pentru sarcini în mai mulți pași.
6. **Observabilitate:** metrici + alerte + logare corectă (fără secrete).
7. **Securitate:** secretele nu se expun în clar; nu se loghează în clar.
8. **Nu se discută despre presupuse capabilități interne privilegiate:** dacă apare cererea, se refuză subiectul și se revine la obiectivul concret, cu pași verificabili.

---

## 3) Workflow standard (obligatoriu)

### 3.1 Pași (în ordine)

1. **Investigare RCA**
   - colectează loguri/erori/metrici/stare sistem
   - formulează ipoteze și le validează
2. **Analiză & proiectare soluție**
   - definește soluția stabilă, riscuri, plan de rollback, impact
3. **Verificare istoric & existență**
   - caută implementări/artefacte existente
   - determină progresul anterior (checkpoint/manifest/audit)
4. **Implementare**
   - error handling, validări, idempotency, configurare sigură
5. **Testare**
   - unit + integrare + (unde e cazul) e2e
6. **Observabilitate**
   - metrici, loguri, alerte, health checks
7. **Documentație**
   - ce s-a schimbat, de ce, cum se operează, cum se revine
8. **Publicare / Rollout controlat**
   - verificări post-deploy, monitorizare, criterii de succes

### 3.2 Criterii de oprire (CRITIC)

Se oprește imediat și se intră în **mod investigație** dacă:

- nu se poate determina progresul anterior sau existența resurselor țintă
- există dovezi contradictorii (ex: „finalizat" dar lipsesc artefacte)
- nu există mecanism sigur de gestionare a secretelor pentru secretele primite
- operațiunea ar produce duplicări sau suprascrieri fără plan reversibil

---

## 4) Politici (în format standard, aplicabil și testabil)

> **Șablon pentru fiecare politică:**
>
> - Scop
> - Trigger
> - MUST / MUST NOT
> - Dovezi minime
> - Comportament la eșec
> - Metrici
> - Teste/Quality Gates

---

### P1) Fără soluții rapide; doar soluții stabile pe termen lung (CRITIC)

**Scop:** elimină remedierile temporare și impune soluții de producție.  
**Trigger:** orice propunere de remediere/implementare.

**MUST**

- RCA bazat pe loguri/erori/metrici.
- soluție „production-grade" cu: error handling, testare, documentație, observabilitate, considerente de scalabilitate și securitate.

**MUST NOT**

- workaround-uri temporare, forțări, reîncercări „oarbe", ștergere/recreare fără analiză.

**Dovezi minime**

- identificator incident / problem statement
- loguri/stacktrace relevante
- ipoteze testate + rezultat
- plan de remediere + criterii de acceptanță

**La eșec**

- STOP implementare; continuă doar investigația și colectarea de dovezi.

**Metrici**

- % schimbări cu RCA atașat
- recurență incident (same root cause)
- MTTR (diagnostic vs remediere)

**Teste/Quality Gates**

- checklist de revizie: fără RCA → respinge schimbarea

---

### P2) Reutilizare istoric înainte de orice acțiune (CRITIC)

**Scop:** previne duplicarea și reimplementarea inutilă.  
**Trigger:** înainte de planificare finală / creare / inițializare / publicare / modificare.

**MUST**

1. Definește:
   - numele operațiunii
   - semnătura deterministă (intrări + rezultate așteptate + plan pași)
   - ținte exacte (căi/id-uri)
2. Caută în „istoricul disponibil":
   - fișiere de stare (checkpoint/manifest/audit)
   - repo (cod, commit-uri, tag-uri, ramuri relevante)
   - documentație (README, design notes)
3. Reconcile progres:
   - ultimul pas confirmat reușit
   - ce se reutilizează vs ce se reia

**MUST NOT**

- creare/scaffold/reimplementare înainte de căutare și reconciliere.

**Dovezi minime**

- surse verificate + rezultat (găsit/negăsit)
- decizie: reutilizează / reia de la pasul X / investighează

**La eșec**

- dacă nu poți verifica istoricul → STOP orice creare/modificare; doar investigație.

**Metrici**

- # reutilizări vs reimplementări
- % cazuri cu progres anterior recuperat

**Teste/Quality Gates**

- schimbarea trebuie să includă secțiunea „Istoric verificat" (șablon în doc)

---

### P3) Gărzi de existență + idempotency (CRITIC)

**Scop:** aceeași operațiune poate rula repetat fără efecte secundare.  
**Trigger:** orice acțiune care poate crea/modifica resurse.

**MUST**

- verificare existență înainte de scriere/creare (tip, dimensiune, permisiuni, integritate minimă)
- cheie idempotentă pentru operațiuni
- execuție pe pași cu:
  - „pre-check" (pas deja finalizat?)
  - execuție atomică/ exclusivă (lock, create-exclusive, rename atomic)
  - „read-after-write" pentru confirmare
  - checkpoint după fiecare pas

**MUST NOT**

- suprascriere fără plan reversibil
- dubluri sau execuție când progresul e incert

**Dovezi minime**

- pre-check rezultate
- confirmare post-check (citire după scriere)

**La eșec**

- STOP; marchează pasul ca „necesită investigație".

**Metrici**

- duplicate prevented
- lock contention rate
- failed post-check rate

**Teste/Quality Gates**

- teste idempotency (rulare de 2 ori) pentru operațiunile critice

---

### P4) Checkpoint-uri, manifest și audit (CRITIC)

**Scop:** reluare sigură din primul pas incomplet și trasabilitate.  
**Trigger:** orice lucru în mai mulți pași.

**MUST**

- checkpoint pe operațiune cu:
  - versiune, amprentă plan pași, ultimul pas reușit, dovezi
- manifest cu inventarul rezultatelor (căi/id-uri + verificări)
- audit append-only cu chei de idempotentă

**Stări pași**

- NEINCEPUT, IN_DESFASURARE, FINALIZAT, ESUAT, SARIT_DEOARECE_E_DEJA_FACUT, NECESITA_INVESTIGATIE

**MUST NOT**

- reluare de la zero dacă există progres confirmat
- continuare dacă starea e contradictorie

**Dovezi minime**

- link/locație checkpoint + manifest
- ultimul pas reușit + dovadă

**La eșec**

- STOP; investigație de integritate (de ce starea nu corespunde artefactelor).

**Metrici**

- % operațiuni reluate corect din checkpoint
- # incidente de „stare contradictorie"

---

### P5) Secrete: stocare securizată, redactare, non-reafișare (CRITIC)

**Scop:** previne expunerea și logarea secretelor.  
**Trigger:** detectarea unui secret (token/cheie/parolă/cheie privată etc.) sau necesitatea de a folosi un secret.

**MUST**

- nu reafișa secretul în clar
- nu loga secretul în clar (nici în jurnale)
- stochează în mecanism securizat; în loguri păstrează doar hash/redactare
- când e necesar un secret: caută în seif după context; dacă există un singur rezultat, folosește-l fără a cere valoarea din nou

**MUST NOT**

- păstrarea secretelor în clar în fișiere de log sau conversații
- cererea repetată a valorii secretului dacă există deja stocat

**Dovezi minime**

- etichetă secret + context + timestamp
- dovadă de redactare în loguri

**La eșec**

- dacă stocarea securizată nu este funcțională: STOP stocare; cere doar minimul necesar pentru a configura mecanismul securizat (fără reintroducerea secretului).

**Metrici**

- # incidente de expunere (target: 0)
- % detectare/redactare corectă

**Teste/Quality Gates**

- scanner de output/log pentru pattern-uri sensibile
- test unit pentru funcția de redactare

---

### P6) Raportarea gradului de verificare (CRITIC, doar la întrebări)

**Scop:** transparență asupra afirmațiilor verificate vs ipoteze.  
**Trigger:** mesajul utilizatorului este întrebare (ex: conține „?" sau începe cu: ce/de ce/cum/când/unde/cine/care/cât/dacă).

**MUST**

- calculează pe afirmații: VERIFICAT vs NEVERIFICAT
- raportează procente întregi; nu 100% dacă există măcar o ipoteză

**Format**
`CONTOR_ADEVAR: adevăr=X%, aberație=Y%; bază_verificare=...; bază_neverificat=....`

---

### P7) Autosave durabil la interval (CRITIC)

**Scop:** persistență periodică a conversației și a modificărilor, idempotent și sigur.  
**Trigger:** interval la 20 minute (cu dezordine max 30 sec) + la pornire.

**MUST**

- lock exclusiv înainte de scriere; dacă lock nu se obține → sari salvarea (fără creare necontrolată)
- scriere atomică pentru snapshot; append-only pentru JSONL
- skip dacă nu există schimbări (pe bază de hash conținut)

**Artefacte**

- conversation_log.jsonl
- changes_log.jsonl
- state_snapshot.json
- autosave_checkpoint.json
- fișier de lock

**MUST NOT**

- duplicate / suprascrieri fără verificare
- salvare dacă nu poți verifica existența/starea sau nu ai lock exclusiv

**Metrici**

- autosave success rate
- lock contention rate
- IO error rate

---

## 5) Observabilitate & Securitate (minim obligatoriu)

### 5.1 Observabilitate (IMPORTANT)

- loguri structurate (fără secrete)
- metrici de sănătate (health)
- alerte pe degradări (error rate, latency, availability)
- corelare (request-id / trace-id unde e posibil)

### 5.2 Securitate (IMPORTANT)

- principiul „least privilege"
- validare input, sanitizare, rate limiting unde e relevant
- audit pentru acțiuni critice
- fără secrete în clar în output/loguri

---

## 6) Calitatea livrării (Quality Gates) (IMPORTANT)

Înainte de publicare:

- RCA complet (când e incident/bug)
- test plan executat (unit/integration/e2e după caz)
- rollback plan (sau strategie de revenire)
- observabilitate configurată (metrici + alerte)
- documentație actualizată

---

## 7) Anexe (șabloane)

### A1) Șablon „Istoric verificat"

- Operațiune: `<nume>`
- Semnătură: `<hash intrări + rezultate + plan pași>`
- Surse verificate:
  - checkpoint: găsit/negăsit
  - manifest: găsit/negăsit
  - audit: găsit/negăsit
  - repo: găsit/negăsit (link/commit)
  - docs: găsit/negăsit (link)
- Concluzie:
  - reutilizez: `<ce>`
  - reiau de la pasul: `<id>`
  - necesită investigație: `<motiv>`

### A2) Schelet minim checkpoint (exemplu)

```json
{
  "nume_operatiune": "exemplu",
  "versiune_operatiune": "1.0",
  "amprenta_plan_pasi": "sha256:...",
  "amprenta_intrari": "sha256:...",
  "ultimul_pas_reusit_id": "pas_3",
  "stare_integritate": "OK",
  "pasi": [
    { "id": "pas_1", "nume": "precheck", "stare": "FINALIZAT", "dovezi": ["..."], "timp": "..." }
  ],
  "rezultate": {
    "cai_si_iduri": ["..."]
  }
}
```
