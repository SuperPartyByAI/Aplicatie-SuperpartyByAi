# ✅ TODO List - Task-uri Viitoare

Lista completă de task-uri pentru dezvoltarea aplicației.

---

## 🔥 Prioritate Înaltă (Next Sprint)

### 1. Admin KYC - Îmbunătățiri
- [ ] **Preview imagini inline** (modal cu zoom)
  - Fără să deschizi tab nou
  - Zoom in/out
  - Navigare între imagini (prev/next)
  - Estimare: 2-3 ore

- [ ] **Validare automată cu Object Gatekeeper**
  - Buton "Validează cu AI" pentru fiecare cerere
  - Afișare rezultat validare (ACCEPT/REJECT/REVIEW)
  - Auto-approve dacă confidence > 97%
  - Estimare: 3-4 ore

- [ ] **Filtrare și search**
  - Search după nume/email
  - Filtrare după dată
  - Sortare (newest/oldest)
  - Estimare: 1-2 ore

### 2. Conversații AI - Îmbunătățiri
- [ ] **Search în conversații**
  - Search full-text în mesaje
  - Highlight rezultate
  - Estimare: 2 ore

- [ ] **Filtrare pe user**
  - Dropdown cu toți userii
  - Filtrare după user selectat
  - Estimare: 1 oră

- [ ] **Export conversații**
  - Export CSV cu toate conversațiile
  - Export JSON pentru backup
  - Estimare: 1-2 ore

- [ ] **Statistici conversații**
  - Avg mesaje per conversație
  - Top users (cei mai activi)
  - Grafic conversații în timp
  - Estimare: 2-3 ore

### 3. GM Overview - Îmbunătățiri
- [ ] **Grafice (Charts)**
  - Chart pentru metrici în timp (line chart)
  - Chart pentru distribuție alerte (pie chart)
  - Folosește Chart.js sau Recharts
  - Estimare: 3-4 ore

- [ ] **Comparație cu perioadele anterioare**
  - Compară cu săptămâna trecută
  - Compară cu luna trecută
  - Trend indicators (↑↓)
  - Estimare: 2-3 ore

- [ ] **Export rapoarte PDF**
  - Generează PDF cu toate metricile
  - Include grafice
  - Folosește jsPDF sau similar
  - Estimare: 3-4 ore

---

## 🟡 Prioritate Medie (Backlog)

### 4. Notificări
- [ ] **Push Notifications**
  - Firebase Cloud Messaging (FCM)
  - Notificări pentru alerte critice
  - Notificări pentru task-uri noi
  - Estimare: 4-5 ore

- [ ] **Email Notifications**
  - SendGrid sau Firebase Email Extension
  - Email pentru KYC approved/rejected
  - Email pentru alerte critice
  - Estimare: 3-4 ore

### 5. Mobile App
- [ ] **React Native App**
  - Versiune iOS/Android
  - Refolosește logica existentă
  - Estimare: 2-3 săptămâni

### 6. Advanced Analytics
- [ ] **Dashboard Analytics**
  - Google Analytics integration
  - Custom events tracking
  - User behavior analysis
  - Estimare: 1 săptămână

### 7. Testing
- [ ] **Unit Tests**
  - Jest pentru funcții critice
  - Coverage > 80%
  - Estimare: 1 săptămână

- [ ] **E2E Tests**
  - Cypress sau Playwright
  - Test flow-uri principale
  - Estimare: 1 săptămână

---

## 🟢 Prioritate Scăzută (Nice to Have)

### 8. UI/UX Improvements
- [ ] **Dark Mode Toggle**
  - Switch între dark/light theme
  - Salvează preferința
  - Estimare: 2-3 ore

- [ ] **Animații**
  - Framer Motion pentru animații smooth
  - Loading skeletons
  - Estimare: 1 săptămână

- [ ] **Responsive Design**
  - Optimizare pentru mobile
  - Optimizare pentru tablet
  - Estimare: 1 săptămână

### 9. Internationalization (i18n)
- [ ] **Multi-language Support**
  - Română (default)
  - Engleză
  - react-i18next
  - Estimare: 1 săptămână

### 10. Advanced Features
- [ ] **Forgot Password**
  - Reset password flow
  - Email cu link reset
  - Estimare: 2-3 ore

- [ ] **2FA (Two-Factor Authentication)**
  - Pentru admin users
  - SMS sau Authenticator app
  - Estimare: 1 săptămână

- [ ] **Audit Trail**
  - Log toate acțiunile importante
  - Vizualizare în admin panel
  - Estimare: 3-4 ore

---

## 🔧 Maintenance & Optimization

### 11. Performance
- [ ] **Code Splitting Optimization**
  - Lazy load mai multe componente
  - Reduce bundle size
  - Estimare: 1-2 zile

- [ ] **Image Optimization**
  - WebP format
  - Lazy loading imagini
  - CDN pentru imagini
  - Estimare: 1-2 zile

- [ ] **Caching Strategy**
  - Service Worker pentru offline support
  - Cache API responses
  - Estimare: 2-3 zile

### 12. Security
- [ ] **Secret Rotation**
  - Rotează OPENAI_API_KEY la 3 luni
  - Rotează DEPLOY_TOKEN la 6 luni
  - Estimare: 1 oră (recurring)

- [ ] **Penetration Testing**
  - Audit extern de securitate
  - Fix vulnerabilități găsite
  - Estimare: 1 săptămână

### 13. Documentation
- [ ] **User Guide**
  - Ghid pentru staff
  - Ghid pentru admin
  - Screenshots și video tutorials
  - Estimare: 1 săptămână

- [ ] **API Documentation**
  - Documentează toate Cloud Functions
  - Swagger/OpenAPI spec
  - Estimare: 2-3 zile

---

## 📊 Estimări Totale

| Prioritate | Task-uri | Estimare Totală |
|------------|----------|-----------------|
| 🔥 Înaltă | 9 task-uri | ~20-30 ore (1 săptămână) |
| 🟡 Medie | 7 task-uri | ~4-6 săptămâni |
| 🟢 Scăzută | 10 task-uri | ~6-8 săptămâni |
| 🔧 Maintenance | 6 task-uri | ~2-3 săptămâni |

**Total**: ~13-18 săptămâni pentru toate task-urile

---

## 🎯 Next Sprint (Săptămâna Viitoare)

**Focus**: Admin KYC & Conversații AI Îmbunătățiri

1. ✅ Preview imagini inline (2-3 ore)
2. ✅ Search în conversații (2 ore)
3. ✅ Filtrare pe user (1 oră)
4. ✅ Validare automată cu AI (3-4 ore)

**Total**: ~8-10 ore (1-2 zile de lucru)

---

## 📝 Cum Să Folosești Acest Fișier

### Când Începi O Conversație Nouă:

1. **Citește TODO.md** - Vezi ce e de făcut
2. **Alege task-uri** - Prioritizează ce vrei să implementezi
3. **Actualizează status** - Marchează [ ] cu [x] când e gata
4. **Commit changes** - Salvează progresul

### Format Task:

```markdown
- [ ] **Titlu Task**
  - Descriere detaliată
  - Tehnologii folosite
  - Estimare: X ore/zile
```

### Status:
- `[ ]` - TODO (de făcut)
- `[x]` - DONE (gata)
- `[~]` - IN PROGRESS (în lucru)
- `[-]` - BLOCKED (blocat)

---

**Ultima Actualizare**: 2025-12-26  
**Actualizat De**: Ona AI Assistant  
**Next Review**: 2026-01-02
