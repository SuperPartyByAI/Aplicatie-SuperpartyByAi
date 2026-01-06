# Google Play Release Process

## Proces complet pentru publicarea unei versiuni noi

### 1. Actualizează versiunea în cod

Editează `superparty_flutter/pubspec.yaml`:

```yaml
version: 1.0.2+3 # Format: versiune+buildNumber
```

- **versiune**: Ce văd utilizatorii (ex: 1.0.2)
- **buildNumber**: Număr intern crescător (ex: 3)

### 2. Commit și push

```bash
git add superparty_flutter/pubspec.yaml
git commit -m "chore: bump version to 1.0.2+3"
git push origin main
```

### 3. Workflow-ul buildează automat AAB-ul

GitHub Actions va rula automat workflow-ul `Build AAB for Google Play` și va crea:

- `app-release.aab` - pentru Google Play Console

Verifică statusul aici:
https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions/workflows/build-aab-google-play.yml

### 4. Descarcă AAB-ul din GitHub Actions

1. Mergi la workflow run-ul finalizat
2. Scroll down la secțiunea **Artifacts**
3. Click pe `app-release-bundle` pentru download
4. Extrage fișierul `app-release.aab` din ZIP

### 5. Uploadează pe Google Play Console

1. Mergi la [Google Play Console](https://play.google.com/console)
2. Selectează aplicația **Superpartybyai**
3. Meniu stânga: **Testează și lansează** → **Testare internă** (sau producție)
4. Click **Creează o versiune**
5. Trage `app-release.aab` în zona de upload
6. Completează **Numele versiunii** (ex: 1.0.2)
7. Adaugă **Note de lansare** (ce s-a schimbat)
8. Click **Salvează** → **Revizuiește versiunea** → **Lansează**

### 6. Distribuție automată

După publicare:

- **Testare internă**: Disponibil imediat pentru testeri
- **Testare închisă/deschisă**: Disponibil în câteva ore
- **Producție**: Review de la Google (1-3 zile), apoi disponibil pentru toți

Google Play va notifica automat utilizatorii despre update.

## Update-uri automate

Utilizatorii cu **Auto-update** activat în Google Play vor primi automat noua versiune.

Alții vor vedea notificare în Google Play Store: "Update disponibil".

## Verificare versiune curentă

Pentru a vedea ce versiune rulează un angajat:

1. Deschide aplicația
2. Meniu → Setări → Despre
3. Verifică **Versiunea aplicației**

## Troubleshooting

### AAB-ul nu se uploadează

- Verifică că `buildNumber` e mai mare decât versiunea anterioară
- Verifică că fișierul e `app-release.aab`, nu `.apk`

### Workflow-ul eșuează

- Verifică că secrets-urile GitHub sunt setate:
  - `KEYSTORE_BASE64`
  - `KEYSTORE_PASSWORD`

### Update-ul nu apare pe telefoane

- Verifică că versiunea e publicată (nu draft)
- Așteaptă câteva ore pentru propagare
- Forțează refresh în Google Play Store (pull-to-refresh)
