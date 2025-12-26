# 🤖 AI Architecture - AI Manager Complet al Firmei

AI-ul este **MANAGERUL SUPREM** al firmei - monitorizează, evaluează și optimizează performanța întregii organizații în timp real.

## 📍 Locație AI Widget

**Poziție**: Colț dreapta-jos (fixed position)
**Vizibil în**: Toate paginile aplicației (după autentificare)
**Implementare**: `HomeScreen.jsx` (liniile 594-668)

```
┌─────────────────────────────────────────┐
│                                         │
│         Aplicație KYC                   │
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
│                                  [Chat] │ ← AI Widget
│                                    🤖   │    (dreapta-jos)
└─────────────────────────────────────────┘
```

## 🏗️ Arhitectură Actuală

### Frontend (HomeScreen.jsx)

```
User Input (text/voice)
    │
    ▼
processCommand() ─────────────────┐
    │                             │
    ├─ Comenzi directe            │
    │   ├─ Alocare AI             │
    │   ├─ Navigare               │
    │   └─ Info stats             │
    │                             │
    └─ Nu e comandă ──────────────┤
                                  ▼
                        callChatWithAI()
                                  │
                                  ▼
                        Firebase Cloud Function
                                  │
                                  ▼
                            OpenAI GPT-4o-mini
                                  │
                                  ▼
                        Response → User
```

### Backend (Firebase Functions)

**Fișier**: `functions/index.js`
**Funcție**: `chatWithAI` (Cloud Function)

**Features**:
- Rate limiting: 10 requests/minut per user
- Timeout: 30 secunde
- Model: GPT-4o-mini
- Max tokens: 300
- Temperature: 0.5
- Context: User profile + stats

## 📊 Stare Curentă

### Ce Face AI-ul Acum

1. **Comenzi Directe** (procesate local, fără OpenAI):
   - Alocare automată evenimente
   - Navigare între pagini
   - Statistici aplicație

2. **Chat General** (prin OpenAI):
   - Răspunsuri la întrebări
   - Asistență utilizator
   - Context-aware responses

3. **Features**:
   - Voice input (Speech-to-Text)
   - Istoric conversații (localStorage)
   - Clear chat (salvează în Firestore pentru admin)
   - Theme toggle (dark/light)

### Limitări Actuale

❌ **Nu validează imagini** - nu există logică de procesare poze
❌ **Nu aplică reguli de validare** - nu există Object Gatekeeper
❌ **Nu gestionează documente KYC** - validarea e manuală în AdminScreen
❌ **Nu controlează întreaga aplicație** - doar comenzi limitate

## 🎯 Obiectiv: AI Manager Complet

### Rolul AI-ului

**AI-ul este MANAGERUL FIRMEI** - nu doar un asistent, ci un sistem complet de management care:

1. **Monitorizează Performanța în Timp Real**
   - Verifică dacă fiecare angajat își face task-urile
   - Evaluează eficiența muncii
   - Detectează întârzieri și probleme
   - Generează rapoarte de performanță

2. **Validează Toate Documentele**
   - Aplică Object Gatekeeper pentru orice poză
   - Verifică documente KYC (CI, permis, cazier)
   - Validează rapoarte de eveniment
   - Controlează calitatea livrabilelor

3. **Optimizează Operațiunile**
   - Alocare automată staff pe evenimente
   - Recomandări de îmbunătățire
   - Identificare bottleneck-uri
   - Predicții și planificare

4. **Raportează și Alertează**
   - Notificări pentru task-uri neîndeplinite
   - Alerte pentru performanță scăzută
   - Rapoarte zilnice/săptămânale/lunare
   - Dashboard-uri executive

### Cerințe Funcționale

#### 1. Monitorizare Task-uri

**Pentru fiecare angajat, AI verifică**:
- ✅ Task-uri completate la timp
- ⏰ Task-uri în întârziere
- 📊 Rata de completare (%)
- ⚡ Viteza de execuție
- 🎯 Calitatea muncii

**Exemple de task-uri monitorizate**:
- Staff: Acceptare evenimente, completare rapoarte, upload poze
- Admin: Aprobare KYC, alocare evenimente, procesare plăți
- Șoferi: Confirmare curse, rapoarte transport

#### 2. Evaluare Eficiență

**Metrici de performanță**:
- **Productivitate**: Task-uri/zi, ore lucrate/eveniment
- **Calitate**: Rating evenimente, feedback clienți
- **Punctualitate**: Întârzieri, absențe, response time
- **Conformitate**: Respectare proceduri, documente complete

**Scoring sistem**:
```
Performance Score = (
  Productivitate × 0.3 +
  Calitate × 0.3 +
  Punctualitate × 0.2 +
  Conformitate × 0.2
) × 100

Categorii:
- 90-100: Excelent (🟢)
- 70-89: Bun (🟡)
- 50-69: Acceptabil (🟠)
- 0-49: Nesatisfăcător (🔴)
```

#### 3. Validare Imagini (Object Gatekeeper)

**Pentru orice imagine încărcată în sistem**:
- Documente KYC (CI, permis, cazier)
- Poze evenimente (before/after)
- Rapoarte vizuale (damage, setup, etc.)
- Facturi și documente financiare

**APP_RULES** definite pentru fiecare categorie

#### 4. Centralizare Totală

- **NICIUN ALT AI** în aplicație
- **TOT** prin chat-ul din dreapta-jos
- **SINGLE SOURCE OF TRUTH** pentru decizii

## 🔄 Flow-uri Principale

### 1. Monitorizare Performanță (Continuous)

```
AI Manager (background job - rulează la fiecare 5 minute)
    │
    ▼
Fetch toate task-urile active
    │
    ├─ Evenimente alocate (status: pending/accepted)
    ├─ Rapoarte necompletate
    ├─ Documente nevalidate
    └─ Plăți neprocesate
        │
        ▼
Pentru fiecare angajat:
        │
        ├─ Calculează metrici performanță
        ├─ Compară cu target-uri
        ├─ Identifică probleme
        │
        ▼
Generează alerte dacă:
        │
        ├─ Task în întârziere > 24h → 🔴 URGENT
        ├─ Performance score < 70 → 🟡 WARNING
        ├─ Lipsă activitate > 48h → 🟠 INACTIVE
        └─ Pattern problematic → 📊 REVIEW
            │
            ▼
Salvează în Firestore: performanceReports
            │
            ▼
Notifică admin + angajat (dacă necesar)
```

### 2. Validare Imagini (On-Demand)

```
User trimite poză în chat AI
    │
    ▼
Frontend detectează imagine
    │
    ├─ Extrage metadata (size, type, etc.)
    ├─ Determină tip document (CI/permis/cazier/eveniment)
    ├─ Creează META line
    └─ Trimite la Cloud Function
        │
        ▼
Cloud Function: aiManager
        │
        ├─ Verifică APP_RULES pentru tipul documentului
        ├─ Validează META
        ├─ Determină route (VISION/ASK_USER)
        │
        ▼
    route="VISION"
        │
        ▼
OpenAI GPT-4o (Vision) + Object Gatekeeper Prompt
        │
        ├─ Analizează imagine
        ├─ Detectează obiecte relevante
        ├─ Aplică APP_RULES
        ├─ Calculează confidence scores
        │
        ▼
JSON Response
        │
        ├─ overall_decision: ACCEPT/REJECT/REVIEW
        ├─ per_image: [...detalii...]
        ├─ reason: "..."
        ├─ matched_rules: [...]
        └─ need_user_action: "..."
            │
            ▼
Frontend procesează răspuns
            │
            ├─ ACCEPT → Salvează document + update task status
            ├─ REJECT → Afișează motiv + cere re-upload
            └─ REVIEW → Trimite la admin pentru review manual
                │
                ▼
        Update performanceMetrics
                │
                └─ Document validation time
                └─ Success/failure rate
```

### 3. Evaluare Eficiență (Daily)

```
AI Manager (cron job - zilnic la 23:00)
    │
    ▼
Pentru fiecare angajat:
    │
    ├─ Fetch toate activitățile din ziua curentă
    │   ├─ Evenimente completate
    │   ├─ Task-uri finalizate
    │   ├─ Documente validate
    │   └─ Timp de răspuns
    │
    ▼
Calculează metrici zilnice:
    │
    ├─ Productivitate = task-uri completate / task-uri alocate
    ├─ Calitate = rating mediu evenimente
    ├─ Punctualitate = task-uri la timp / total task-uri
    ├─ Conformitate = documente acceptate / total documente
    │
    ▼
Compară cu:
    │
    ├─ Target-uri individuale
    ├─ Media echipei
    ├─ Performanța anterioară
    │
    ▼
Generează raport zilnic:
    │
    ├─ Performance score (0-100)
    ├─ Trend (↑ îmbunătățire / ↓ scădere / → stabil)
    ├─ Recomandări de îmbunătățire
    ├─ Alerte pentru probleme
    │
    ▼
Salvează în Firestore: dailyPerformanceReports
    │
    ▼
Notifică:
    │
    ├─ Admin → raport complet echipă
    └─ Angajat → raport personal (dacă score < 70)
```

### 4. Comenzi Interactive (Real-time)

```
User întreabă în chat: "Cum merg cu task-urile?"
    │
    ▼
AI Manager procesează cererea
    │
    ├─ Identifică user-ul
    ├─ Fetch task-uri active
    ├─ Calculează status
    │
    ▼
Răspunde cu:
    │
    ├─ Task-uri completate astăzi: X/Y
    ├─ Task-uri în întârziere: Z
    ├─ Performance score: 85/100 🟢
    ├─ Următorul deadline: [eveniment] în 2 ore
    └─ Recomandare: "Completează raportul pentru evenimentul X"
```

```
Admin întreabă: "Cine nu și-a făcut task-urile?"
    │
    ▼
AI Manager analizează toată echipa
    │
    ├─ Identifică task-uri în întârziere
    ├─ Grupează pe angajat
    ├─ Sortează după severitate
    │
    ▼
Răspunde cu:
    │
    ├─ 🔴 URGENT: Ion Popescu - 3 task-uri > 48h întârziere
    ├─ 🟡 WARNING: Maria Ionescu - 1 task > 24h întârziere
    └─ 🟢 OK: Restul echipei la zi cu task-urile
        │
        ▼
    Oferă acțiuni:
        │
        ├─ "Trimite reminder lui Ion?"
        ├─ "Vezi detalii task-uri?"
        └─ "Generează raport complet?"
```

## 📝 APP_RULES - Exemple

### Carte Identitate (CI)

```
APP_RULES:
RULE_CI_1: Documentul trebuie să fie Carte de Identitate românească
RULE_CI_2: Textul trebuie să fie lizibil (nume, CNP, serie)
RULE_CI_3: Fotografia trebuie să fie clară
RULE_CI_4: Nu sunt permise documente expirate
RULE_CI_5: Nu sunt permise copii sau screenshot-uri
END_APP_RULES
```

### Permis Conducere

```
APP_RULES:
RULE_PERMIS_1: Documentul trebuie să fie Permis de Conducere românesc
RULE_PERMIS_2: Categoriile trebuie să fie vizibile
RULE_PERMIS_3: Data expirării trebuie să fie lizibilă
RULE_PERMIS_4: Nu sunt permise permise expirate
RULE_PERMIS_5: Fotografia trebuie să fie clară
END_APP_RULES
```

### Cazier Judiciar

```
APP_RULES:
RULE_CAZIER_1: Documentul trebuie să fie Cazier Judiciar oficial
RULE_CAZIER_2: Trebuie să conțină ștampila instituției
RULE_CAZIER_3: Data emiterii trebuie să fie vizibilă
RULE_CAZIER_4: Nu sunt permise documente mai vechi de 6 luni
RULE_CAZIER_5: Textul trebuie să fie complet lizibil
END_APP_RULES
```

## 🛠️ Implementare Necesară

### 1. Frontend Changes (HomeScreen.jsx)

#### A. Upload Imagini în Chat

**Adaugă componente**:
```jsx
// Image upload button
<button className="chat-image-btn" onClick={handleImageSelect}>
  📷
</button>

// Hidden file input
<input 
  type="file" 
  ref={fileInputRef}
  accept="image/jpeg,image/png,image/webp"
  multiple
  max="3"
  onChange={handleImageUpload}
  style={{ display: 'none' }}
/>

// Image preview container
{selectedImages.length > 0 && (
  <div className="chat-image-preview">
    {selectedImages.map((img, idx) => (
      <div key={idx} className="preview-item">
        <img src={img.preview} alt={`Preview ${idx + 1}`} />
        <span>{(img.size / 1024 / 1024).toFixed(2)} MB</span>
        <button onClick={() => removeImage(idx)}>✕</button>
      </div>
    ))}
  </div>
)}
```

**Funcții noi**:
```javascript
const handleImageSelect = () => {
  fileInputRef.current.click();
};

const handleImageUpload = async (e) => {
  const files = Array.from(e.target.files);
  
  // Validate files
  for (const file of files) {
    if (file.size > 3 * 1024 * 1024) {
      alert(`${file.name} este prea mare (max 3MB)`);
      continue;
    }
    
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert(`${file.name} nu este format valid (JPG/PNG/WEBP)`);
      continue;
    }
    
    // Create preview
    const preview = URL.createObjectURL(file);
    setSelectedImages(prev => [...prev, { file, preview, size: file.size }]);
  }
};

const removeImage = (index) => {
  setSelectedImages(prev => prev.filter((_, idx) => idx !== index));
};
```

#### B. Procesare și Trimitere

**Modifică `handleSendMessage()`**:
```javascript
const handleSendMessage = async () => {
  if (!inputMessage.trim() && selectedImages.length === 0) return;

  const userMessage = inputMessage.trim();
  const images = selectedImages;
  
  setInputMessage('');
  setSelectedImages([]);
  
  // Add message to chat
  setMessages(prev => [...prev, { 
    role: 'user', 
    content: userMessage,
    images: images.map(img => img.preview)
  }]);

  setChatLoading(true);

  try {
    if (images.length > 0) {
      // Upload images to Storage
      const imageUrls = await uploadImagesToStorage(images);
      
      // Create META line
      const meta = createMetaLine(images);
      
      // Determine document type
      const documentType = await determineDocumentType(userMessage, images);
      
      // Get APP_RULES for document type
      const appRules = getAppRules(documentType);
      
      // Call AI Manager with images
      const result = await callAIManager({
        message: userMessage,
        imageUrls,
        meta,
        appRules,
        documentType,
        userContext: await getUserContext()
      });
      
      // Display validation result
      displayValidationResult(result);
      
    } else {
      // Text-only message (existing logic)
      const commandResponse = await processCommand(userMessage);
      if (commandResponse) {
        setMessages(prev => [...prev, { role: 'assistant', content: commandResponse }]);
        return;
      }
      
      // Call AI for general chat
      const result = await callChatWithAI({
        messages: [...messages.slice(-10), { role: 'user', content: userMessage }],
        userContext: await getUserContext()
      });
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: result.data.message 
      }]);
    }
    
  } catch (error) {
    handleChatError(error);
  } finally {
    setChatLoading(false);
  }
};
```

**Funcții helper**:
```javascript
const createMetaLine = (images) => {
  const imageSizes = images.map(img => (img.size / 1024 / 1024).toFixed(2));
  const hasLargeImage = images.some(img => img.size > 3 * 1024 * 1024);
  
  return `META has_image=true; image_count=${images.length}; image_size_mb=[${imageSizes.join(',')}]; user_says_over_3mb=${hasLargeImage}; user_priority=quality`;
};

const determineDocumentType = async (message, images) => {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('ci') || lowerMsg.includes('carte') || lowerMsg.includes('identitate')) {
    return 'CI';
  }
  if (lowerMsg.includes('permis')) {
    return 'permis';
  }
  if (lowerMsg.includes('cazier')) {
    return 'cazier';
  }
  if (lowerMsg.includes('eveniment') || lowerMsg.includes('poză')) {
    return 'eveniment';
  }
  
  // If not specified, ask AI to determine
  return 'unknown';
};

const displayValidationResult = (result) => {
  const { overall_decision, reason, per_image, need_user_action } = result.data;
  
  let message = '';
  let icon = '';
  
  switch (overall_decision) {
    case 'ACCEPT':
      icon = '✅';
      message = `Document acceptat! ${reason}`;
      break;
    case 'REJECT':
      icon = '❌';
      message = `Document respins: ${reason}`;
      break;
    case 'REVIEW':
      icon = '⚠️';
      message = `Document necesită verificare: ${reason}`;
      break;
    default:
      icon = '❓';
      message = `Nu pot procesa documentul: ${reason}`;
  }
  
  // Add detailed feedback for each image
  if (per_image && per_image.length > 0) {
    message += '\n\nDetalii per imagine:';
    per_image.forEach((img, idx) => {
      message += `\n${idx + 1}. ${img.app_decision} - ${img.decision_basis}`;
      if (img.detected_objects.length > 0) {
        message += `\n   Detectat: ${img.detected_objects.map(o => o.label).join(', ')}`;
      }
    });
  }
  
  // Add action required
  if (need_user_action && need_user_action !== 'none') {
    message += `\n\n📋 Acțiune necesară: ${translateAction(need_user_action)}`;
  }
  
  setMessages(prev => [...prev, { 
    role: 'assistant', 
    content: `${icon} ${message}`,
    validationResult: result.data
  }]);
};

const translateAction = (action) => {
  const translations = {
    'upload_image': 'Încarcă imaginea',
    'compress_to_3mb': 'Comprimă imaginea sub 3MB',
    'crop_zoom': 'Fă crop/zoom pe zona relevantă',
    'better_photo': 'Fă o poză mai bună (lumină, focus)',
    'clarify_question': 'Clarifică cererea',
    'provide_app_rules': 'Specifică tipul documentului'
  };
  return translations[action] || action;
};
```

#### C. Performance Dashboard în Chat

**Adaugă comandă nouă**:
```javascript
// În processCommand()
if (lowerMsg.includes('performanță') || lowerMsg.includes('performanta') || lowerMsg.includes('task')) {
  const performance = await getMyPerformance();
  return formatPerformanceMessage(performance);
}

const getMyPerformance = async () => {
  const today = new Date().toISOString().split('T')[0];
  const perfDoc = await getDoc(doc(db, 'performanceMetrics', `${currentUser.uid}_${today}`));
  
  if (!perfDoc.exists()) {
    return null;
  }
  
  return perfDoc.data();
};

const formatPerformanceMessage = (perf) => {
  if (!perf) {
    return 'Nu am date de performanță pentru astăzi.';
  }
  
  const scoreEmoji = perf.overallScore >= 90 ? '🟢' : 
                     perf.overallScore >= 70 ? '🟡' : 
                     perf.overallScore >= 50 ? '🟠' : '🔴';
  
  const trendEmoji = perf.trend === 'up' ? '📈' : 
                     perf.trend === 'down' ? '📉' : '➡️';
  
  return `
${scoreEmoji} **Performance Score: ${perf.overallScore}/100**

📊 Detalii:
• Task-uri: ${perf.tasksCompleted}/${perf.tasksAssigned} (${perf.completionRate}%)
• Calitate: ${perf.qualityScore}/100
• Punctualitate: ${perf.punctualityScore}/100
• Conformitate: ${perf.complianceScore}/100

${trendEmoji} Trend: ${perf.trend} (${perf.trendPercentage > 0 ? '+' : ''}${perf.trendPercentage}%)

${perf.tasksOverdue > 0 ? `⚠️ Ai ${perf.tasksOverdue} task-uri în întârziere!` : '✅ Toate task-urile la zi!'}
  `.trim();
};
```

### 2. Backend Changes (functions/index.js)

#### A. Funcție Principală: AI Manager

**Înlocuiește `chatWithAI` cu `aiManager`**:
```javascript
exports.aiManager = onCall({
  secrets: [OPENAI_API_KEY],
  timeoutSeconds: 120,
  memory: '512MiB',
  maxInstances: 10,
  cors: true,
}, async (request) => {
  const { auth, data } = request;

  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!checkRateLimit(auth.uid)) {
    throw new HttpsError('resource-exhausted', 'Rate limit exceeded');
  }

  const { 
    message, 
    imageUrls, 
    meta, 
    appRules, 
    documentType, 
    userContext,
    action // 'chat' | 'validate_image' | 'check_performance' | 'generate_report'
  } = data;

  try {
    // Route based on action
    switch (action) {
      case 'validate_image':
        return await validateImageWithGatekeeper(imageUrls, meta, appRules, documentType, auth.uid);
      
      case 'check_performance':
        return await checkUserPerformance(auth.uid, userContext);
      
      case 'generate_report':
        return await generatePerformanceReport(auth.uid, userContext);
      
      case 'chat':
      default:
        return await handleChatMessage(message, userContext, auth.uid);
    }
  } catch (error) {
    console.error('AI Manager error:', error);
    throw new HttpsError('internal', error.message);
  }
});
```

#### B. Object Gatekeeper Implementation

```javascript
async function validateImageWithGatekeeper(imageUrls, meta, appRules, documentType, userId) {
  const apiKey = OPENAI_API_KEY.value();
  
  // Build Object Gatekeeper prompt
  const systemPrompt = buildObjectGatekeeperPrompt();
  
  // Build user message with META + APP_RULES + images
  const userMessage = `
${meta}

APP_RULES:
${appRules}
END_APP_RULES

Validează ${documentType === 'unknown' ? 'documentul' : documentType} din imaginile atașate.
  `.trim();
  
  // Prepare messages for OpenAI Vision API
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userMessage },
        ...imageUrls.map(url => ({
          type: 'image_url',
          image_url: { url, detail: 'high' }
        }))
      ]
    }
  ];
  
  // Call OpenAI Vision API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o', // Vision model
      messages,
      max_tokens: 2000,
      temperature: 0.1, // Low temperature for deterministic validation
    }),
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const result = await response.json();
  const aiResponse = result.choices[0].message.content;
  
  // Parse JSON response (between BEGIN_ROUTE_JSON and END_ROUTE_JSON)
  const jsonMatch = aiResponse.match(/BEGIN_ROUTE_JSON\s*(\{.*?\})\s*END_ROUTE_JSON/s);
  const answerMatch = aiResponse.match(/BEGIN_ANSWER\s*(.*?)\s*END_ANSWER/s);
  
  if (!jsonMatch) {
    throw new Error('Invalid AI response format');
  }
  
  const validationResult = JSON.parse(jsonMatch[1]);
  const answerText = answerMatch ? answerMatch[1].trim() : '';
  
  // Save validation to Firestore
  await admin.firestore().collection('imageValidations').add({
    userId,
    imageUrls,
    documentType,
    ...validationResult,
    answerText,
    validatedAt: admin.firestore.FieldValue.serverTimestamp(),
    validationTimeMs: Date.now() - startTime
  });
  
  // Log to AI Manager logs
  await logAIAction('image_validation', userId, {
    documentType,
    imageCount: imageUrls.length,
    decision: validationResult.overall_decision
  }, validationResult);
  
  return {
    success: true,
    validation: validationResult,
    message: answerText
  };
}

function buildObjectGatekeeperPrompt() {
  // Return the EXACT prompt you provided
  return `SYSTEM:
Ești un ORCHESTRATOR + ASISTENT tip „Object Gatekeeper". Obiectiv: identifici obiectele vizibile din imagini și decizi ACCEPT/REJECT/REVIEW pe baza regulilor aplicației (APP_RULES), cu precizie maximă și fără presupuneri...
[FULL PROMPT HERE - exact as provided]
`;
}
```

#### C. Performance Monitoring (Background Job)

```javascript
// Scheduled function - runs every 5 minutes
exports.monitorPerformance = onSchedule({
  schedule: 'every 5 minutes',
  timeoutSeconds: 300,
  memory: '512MiB'
}, async (event) => {
  console.log('Starting performance monitoring...');
  
  try {
    // Get all active users
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('status', '==', 'approved')
      .get();
    
    const users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    
    // Check performance for each user
    for (const user of users) {
      await checkAndUpdatePerformance(user);
    }
    
    console.log(`Performance check completed for ${users.length} users`);
  } catch (error) {
    console.error('Performance monitoring error:', error);
  }
});

async function checkAndUpdatePerformance(user) {
  const today = new Date().toISOString().split('T')[0];
  const userId = user.uid;
  
  // Fetch user's tasks and activities
  const [tasks, events, documents] = await Promise.all([
    fetchUserTasks(userId, today),
    fetchUserEvents(userId, today),
    fetchUserDocuments(userId, today)
  ]);
  
  // Calculate metrics
  const metrics = calculatePerformanceMetrics(tasks, events, documents);
  
  // Save to Firestore
  await admin.firestore()
    .collection('performanceMetrics')
    .doc(`${userId}_${today}`)
    .set(metrics, { merge: true });
  
  // Check for alerts
  const alerts = generateAlerts(metrics, user);
  
  if (alerts.length > 0) {
    for (const alert of alerts) {
      await admin.firestore().collection('performanceAlerts').add({
        userId,
        ...alert,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active'
      });
    }
  }
  
  // Log action
  await logAIAction('performance_check', userId, { date: today }, metrics);
}

function calculatePerformanceMetrics(tasks, events, documents) {
  // Task completion
  const tasksAssigned = tasks.length;
  const tasksCompleted = tasks.filter(t => t.status === 'completed').length;
  const tasksOverdue = tasks.filter(t => t.status === 'overdue').length;
  const completionRate = tasksAssigned > 0 ? (tasksCompleted / tasksAssigned) * 100 : 0;
  
  // Quality metrics
  const eventsCompleted = events.filter(e => e.status === 'completed').length;
  const averageRating = events.length > 0 
    ? events.reduce((sum, e) => sum + (e.rating || 0), 0) / events.length 
    : 0;
  
  const documentsSubmitted = documents.length;
  const documentsAccepted = documents.filter(d => d.decision === 'ACCEPT').length;
  const documentAcceptanceRate = documentsSubmitted > 0 
    ? (documentsAccepted / documentsSubmitted) * 100 
    : 0;
  
  // Calculate scores
  const productivityScore = Math.min(100, completionRate);
  const qualityScore = Math.min(100, (averageRating / 5) * 100);
  const punctualityScore = Math.max(0, 100 - (tasksOverdue * 10));
  const complianceScore = documentAcceptanceRate;
  
  const overallScore = (
    productivityScore * 0.3 +
    qualityScore * 0.3 +
    punctualityScore * 0.2 +
    complianceScore * 0.2
  );
  
  return {
    tasksAssigned,
    tasksCompleted,
    tasksOverdue,
    completionRate,
    eventsCompleted,
    averageRating,
    documentsSubmitted,
    documentsAccepted,
    documentAcceptanceRate,
    productivityScore,
    qualityScore,
    punctualityScore,
    complianceScore,
    overallScore: Math.round(overallScore),
    calculatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

function generateAlerts(metrics, user) {
  const alerts = [];
  
  // Critical: Tasks overdue > 3
  if (metrics.tasksOverdue > 3) {
    alerts.push({
      alertType: 'overdue_task',
      severity: 'critical',
      title: 'Task-uri critice în întârziere',
      message: `${user.firstName} ${user.lastName} are ${metrics.tasksOverdue} task-uri în întârziere`,
      actionRequired: 'Contactează angajatul urgent'
    });
  }
  
  // High: Performance score < 50
  if (metrics.overallScore < 50) {
    alerts.push({
      alertType: 'low_performance',
      severity: 'high',
      title: 'Performanță scăzută',
      message: `Score: ${metrics.overallScore}/100`,
      actionRequired: 'Review performanță și discuție 1-on-1'
    });
  }
  
  // Medium: Document acceptance rate < 70%
  if (metrics.documentAcceptanceRate < 70 && metrics.documentsSubmitted > 0) {
    alerts.push({
      alertType: 'quality_issue',
      severity: 'medium',
      title: 'Probleme calitate documente',
      message: `Doar ${metrics.documentAcceptanceRate.toFixed(0)}% documente acceptate`,
      actionRequired: 'Training pentru upload documente'
    });
  }
  
  return alerts;
}
```

### 3. Firestore Schema Extensions

#### Colecție Nouă: `imageValidations`
```javascript
{
  id: string,
  userId: string,
  imageUrl: string,
  documentType: "CI" | "permis" | "cazier" | "eveniment" | "raport" | "factura" | "other",
  
  // Validation result (Object Gatekeeper output)
  overall_decision: "ACCEPT" | "REJECT" | "REVIEW" | "UNKNOWN",
  reason: string,
  confidence_decision: number,
  
  // Metadata
  image_size_mb: number,
  image_quality: "good" | "ok" | "poor",
  
  // Detected objects
  detected_objects: [{
    label: string,
    confidence: number,
    evidence: string
  }],
  
  // Matched rules
  matched_rules: [string],
  
  // Timestamps
  validatedAt: Timestamp,
  reviewedAt: Timestamp | null,
  reviewedBy: string | null,
  
  // Performance tracking
  validationTimeMs: number,
  retryCount: number
}
```

#### Colecție Nouă: `performanceMetrics`
```javascript
{
  id: string,
  userId: string,
  date: string, // YYYY-MM-DD
  
  // Task completion
  tasksAssigned: number,
  tasksCompleted: number,
  tasksOverdue: number,
  completionRate: number, // 0-100
  
  // Quality metrics
  eventsCompleted: number,
  averageRating: number, // 1-5
  documentsSubmitted: number,
  documentsAccepted: number,
  documentAcceptanceRate: number, // 0-100
  
  // Time metrics
  averageResponseTime: number, // minutes
  averageTaskDuration: number, // minutes
  totalHoursWorked: number,
  
  // Performance score
  productivityScore: number, // 0-100
  qualityScore: number, // 0-100
  punctualityScore: number, // 0-100
  complianceScore: number, // 0-100
  overallScore: number, // 0-100
  
  // Trend
  trend: "up" | "down" | "stable",
  trendPercentage: number,
  
  // Timestamps
  calculatedAt: Timestamp,
  lastUpdated: Timestamp
}
```

#### Colecție Nouă: `performanceAlerts`
```javascript
{
  id: string,
  userId: string,
  alertType: "overdue_task" | "low_performance" | "inactive" | "quality_issue" | "compliance_issue",
  severity: "low" | "medium" | "high" | "critical",
  
  // Alert details
  title: string,
  message: string,
  actionRequired: string,
  
  // Related data
  relatedTaskId: string | null,
  relatedEventId: string | null,
  relatedDocumentId: string | null,
  
  // Status
  status: "active" | "acknowledged" | "resolved" | "dismissed",
  acknowledgedAt: Timestamp | null,
  acknowledgedBy: string | null,
  resolvedAt: Timestamp | null,
  
  // Timestamps
  createdAt: Timestamp,
  expiresAt: Timestamp
}
```

#### Colecție Nouă: `dailyReports`
```javascript
{
  id: string,
  date: string, // YYYY-MM-DD
  reportType: "individual" | "team" | "company",
  
  // For individual reports
  userId: string | null,
  
  // Summary
  summary: {
    totalTasks: number,
    completedTasks: number,
    overdueTasks: number,
    averageScore: number,
    topPerformers: [{ userId: string, score: number }],
    needsAttention: [{ userId: string, issue: string }]
  },
  
  // Detailed metrics
  metrics: {
    productivity: number,
    quality: number,
    punctuality: number,
    compliance: number
  },
  
  // Recommendations
  recommendations: [string],
  
  // Alerts
  activeAlerts: number,
  criticalAlerts: number,
  
  // Timestamps
  generatedAt: Timestamp,
  generatedBy: "AI_MANAGER"
}
```

#### Colecție Nouă: `aiManagerLogs`
```javascript
{
  id: string,
  action: "performance_check" | "image_validation" | "alert_generated" | "report_generated" | "command_executed",
  
  // Context
  userId: string | null,
  targetUserId: string | null,
  
  // Details
  input: object,
  output: object,
  
  // Performance
  executionTimeMs: number,
  success: boolean,
  errorMessage: string | null,
  
  // Timestamps
  timestamp: Timestamp
}
```

### 4. Storage Rules

**Folder structure**:
```
/validations/{userId}/{timestamp}_{filename}
```

**Security Rules**:
- User poate upload doar în propriul folder
- Admin poate vedea toate
- Imagini validate ACCEPT → mutate în `/approved/`
- Imagini REJECT → șterse după 7 zile

## 🔐 Security Considerations

1. **Rate Limiting**
   - Max 5 validări/minut per user
   - Max 50 validări/zi per user

2. **File Size**
   - Max 3MB per imagine (HARD LIMIT)
   - Compresie automată dacă > 3MB

3. **File Types**
   - Permise: JPG, PNG, WEBP
   - Blocate: GIF, BMP, TIFF, PDF

4. **Content Validation**
   - Scan pentru conținut inadecvat
   - Verificare metadata EXIF
   - Detectare manipulare imagine

## 📈 Performance Optimization

1. **Image Processing**
   - Resize la max 2000px latura mare
   - Compress la quality 85
   - Convert la WEBP pentru storage

2. **Caching**
   - Cache rezultate validare 24h
   - Cache APP_RULES în memory
   - Cache user context

3. **Parallel Processing**
   - Validare multiplă imagini în paralel
   - Max 3 imagini simultan

## 🧪 Testing Strategy

### Unit Tests
- `parseMetadata()` - extragere metadata corectă
- `validateAppRules()` - aplicare reguli
- `calculateConfidence()` - scoruri corecte

### Integration Tests
- Upload imagine → validare → response
- Multiple imagini → batch processing
- Error handling → retry logic

### E2E Tests
- User flow complet: upload → validare → accept/reject
- Admin review flow
- Edge cases: imagini mari, format invalid, etc.

## 📊 Monitoring & Analytics

### Metrics to Track
- Validation success rate (ACCEPT/REJECT/REVIEW)
- Average validation time
- Error rate
- User satisfaction (feedback)

### Logging
- Toate validările în Firestore
- Erori în Cloud Logging
- Performance metrics în Analytics

## 🚀 Implementation Roadmap

### Phase 1: Image Validation (Week 1)

**Obiectiv**: AI poate valida orice imagine încărcată în chat

**Tasks**:
1. **Frontend** (2 zile)
   - [ ] Adaugă upload button în chat
   - [ ] Implementează image preview
   - [ ] Validare client-side (size, format)
   - [ ] Upload la Firebase Storage
   - [ ] Display validation results

2. **Backend** (3 zile)
   - [ ] Creează `aiManager` Cloud Function
   - [ ] Implementează Object Gatekeeper prompt complet
   - [ ] Integrare OpenAI Vision API (GPT-4o)
   - [ ] Parse și validare JSON response
   - [ ] Salvare rezultate în Firestore

3. **APP_RULES** (1 zi)
   - [ ] Definește reguli pentru CI
   - [ ] Definește reguli pentru permis
   - [ ] Definește reguli pentru cazier
   - [ ] Definește reguli pentru poze evenimente
   - [ ] Testare cu imagini reale

4. **Testing** (1 zi)
   - [ ] Test upload imagini (JPG, PNG, WEBP)
   - [ ] Test validare ACCEPT/REJECT/REVIEW
   - [ ] Test error handling (size > 3MB, format invalid)
   - [ ] Test multiple imagini simultan

**Deliverables**:
- ✅ Chat poate primi imagini
- ✅ AI validează imagini conform APP_RULES
- ✅ Rezultate clare (ACCEPT/REJECT/REVIEW)

### Phase 2: Performance Monitoring (Week 2)

**Obiectiv**: AI monitorizează performanța fiecărui angajat în timp real

**Tasks**:
1. **Database Schema** (1 zi)
   - [ ] Creează colecție `performanceMetrics`
   - [ ] Creează colecție `performanceAlerts`
   - [ ] Creează colecție `dailyReports`
   - [ ] Creează colecție `aiManagerLogs`
   - [ ] Setup indexes

2. **Background Jobs** (2 zile)
   - [ ] Implementează `monitorPerformance` (runs every 5 min)
   - [ ] Implementează `generateDailyReports` (runs daily at 23:00)
   - [ ] Implementează `calculateMetrics` helper
   - [ ] Implementează `generateAlerts` helper
   - [ ] Setup Cloud Scheduler

3. **Performance Calculations** (2 zile)
   - [ ] Task completion tracking
   - [ ] Quality metrics (ratings, feedback)
   - [ ] Punctuality metrics (deadlines, response time)
   - [ ] Compliance metrics (documents, procedures)
   - [ ] Overall score calculation

4. **Alerts System** (1 zi)
   - [ ] Overdue tasks alerts
   - [ ] Low performance alerts
   - [ ] Inactive user alerts
   - [ ] Quality issue alerts
   - [ ] Notification delivery (email/push)

5. **Testing** (1 zi)
   - [ ] Test metric calculations
   - [ ] Test alert generation
   - [ ] Test background jobs
   - [ ] Test notification delivery

**Deliverables**:
- ✅ AI calculează metrici performanță zilnic
- ✅ Alerte automate pentru probleme
- ✅ Rapoarte zilnice generate

### Phase 3: Interactive Commands (Week 3)

**Obiectiv**: AI răspunde la comenzi despre performanță și task-uri

**Tasks**:
1. **User Commands** (2 zile)
   - [ ] "Cum merg cu task-urile?" → status personal
   - [ ] "Ce task-uri am?" → listă task-uri active
   - [ ] "Performanța mea?" → raport performanță
   - [ ] "Ce evenimente am?" → evenimente alocate
   - [ ] "Când e următorul deadline?" → deadline info

2. **Admin Commands** (2 zile)
   - [ ] "Cine nu și-a făcut task-urile?" → listă probleme
   - [ ] "Performanța echipei?" → raport complet
   - [ ] "Top performeri?" → ranking
   - [ ] "Alerte active?" → listă alerte
   - [ ] "Generează raport?" → raport custom

3. **Natural Language Processing** (2 zile)
   - [ ] Parse comenzi în română
   - [ ] Detectare intent (ce vrea user-ul)
   - [ ] Extragere parametri (date, nume, etc.)
   - [ ] Răspunsuri contextuale
   - [ ] Sugestii proactive

4. **Testing** (1 zi)
   - [ ] Test toate comenzile user
   - [ ] Test toate comenzile admin
   - [ ] Test edge cases
   - [ ] Test performance

**Deliverables**:
- ✅ AI răspunde la întrebări despre task-uri
- ✅ AI oferă rapoarte de performanță
- ✅ AI sugerează acțiuni

### Phase 4: Integration & Automation (Week 4)

**Obiectiv**: AI gestionează automat workflow-uri complete

**Tasks**:
1. **KYC Automation** (2 zile)
   - [ ] Auto-validare documente KYC cu Object Gatekeeper
   - [ ] Auto-approve dacă ACCEPT + confidence > 0.97
   - [ ] Auto-reject dacă REJECT + confidence > 0.97
   - [ ] Trimite la admin review dacă REVIEW
   - [ ] Notificări automate user

2. **Event Management** (2 zile)
   - [ ] Auto-alocare staff pe evenimente (AI optimizat)
   - [ ] Verificare disponibilitate în timp real
   - [ ] Detectare conflicte
   - [ ] Notificări staff alocat
   - [ ] Tracking acceptare/refuzare

3. **Task Management** (1 zi)
   - [ ] Auto-creare task-uri pentru evenimente
   - [ ] Tracking progress automat
   - [ ] Reminder-e automate pentru deadlines
   - [ ] Escalation pentru întârzieri
   - [ ] Auto-complete când posibil

4. **Reporting** (1 zi)
   - [ ] Rapoarte zilnice automate
   - [ ] Rapoarte săptămânale
   - [ ] Rapoarte lunare
   - [ ] Export PDF/Excel
   - [ ] Email delivery

5. **Testing End-to-End** (1 zi)
   - [ ] Test flow complet KYC
   - [ ] Test flow complet evenimente
   - [ ] Test automation rules
   - [ ] Test notifications
   - [ ] Performance testing

**Deliverables**:
- ✅ AI gestionează automat KYC
- ✅ AI alocă automat staff
- ✅ AI generează rapoarte automate

### Phase 5: Production & Optimization (Week 5)

**Obiectiv**: Deploy în production și optimizare continuă

**Tasks**:
1. **Staging Deployment** (1 zi)
   - [ ] Deploy toate funcțiile în staging
   - [ ] Setup monitoring
   - [ ] Setup logging
   - [ ] Setup alerts
   - [ ] Smoke testing

2. **User Acceptance Testing** (2 zile)
   - [ ] Test cu utilizatori reali
   - [ ] Colectare feedback
   - [ ] Identificare bugs
   - [ ] Ajustări UI/UX
   - [ ] Fine-tuning AI responses

3. **Production Deployment** (1 zi)
   - [ ] Deploy în production
   - [ ] Verificare funcționalitate
   - [ ] Monitor performance
   - [ ] Monitor errors
   - [ ] Rollback plan ready

4. **Optimization** (2 zile)
   - [ ] Optimize Cloud Functions (cold start, memory)
   - [ ] Optimize Firestore queries (indexes)
   - [ ] Optimize AI prompts (tokens, cost)
   - [ ] Optimize image processing (compression)
   - [ ] Cache frequently accessed data

5. **Documentation** (1 zi)
   - [ ] User guide pentru AI Manager
   - [ ] Admin guide pentru comenzi
   - [ ] Troubleshooting guide
   - [ ] API documentation
   - [ ] Update ARCHITECTURE.md

**Deliverables**:
- ✅ AI Manager live în production
- ✅ Monitoring și alerting activ
- ✅ Documentație completă

## 📊 Success Metrics

### Performance Targets

**Week 1** (Image Validation):
- ✅ 95%+ accuracy în validare documente
- ✅ < 5s response time pentru validare
- ✅ 0 false positives (ACCEPT când ar trebui REJECT)

**Week 2** (Performance Monitoring):
- ✅ 100% coverage monitoring (toți userii)
- ✅ < 5 min delay în detectare probleme
- ✅ 90%+ accuracy în alerting

**Week 3** (Interactive Commands):
- ✅ 95%+ intent recognition accuracy
- ✅ < 3s response time pentru comenzi
- ✅ 90%+ user satisfaction

**Week 4** (Integration):
- ✅ 80%+ auto-approval rate pentru KYC
- ✅ 90%+ accuracy în alocare staff
- ✅ 100% task tracking coverage

**Week 5** (Production):
- ✅ 99.9% uptime
- ✅ < 100ms p95 latency
- ✅ < $100/month OpenAI costs

### Business Impact

**Eficiență**:
- 70% reducere timp procesare KYC (de la 2h → 30min)
- 50% reducere timp alocare staff (de la 1h → 30min)
- 80% reducere task-uri uitate/întârziate

**Calitate**:
- 95%+ accuracy validare documente
- 90%+ staff satisfaction cu alocări
- 85%+ client satisfaction cu evenimente

**Cost**:
- 60% reducere timp admin (automatizare)
- 40% reducere erori umane
- ROI pozitiv în 3 luni

## 🔧 Technical Requirements

### Infrastructure

**Firebase**:
- Firestore: Blaze plan (pay-as-you-go)
- Cloud Functions: 2nd gen, 512MB memory
- Cloud Storage: Standard class
- Cloud Scheduler: Pentru background jobs

**OpenAI**:
- API Key cu acces la GPT-4o (Vision)
- Rate limit: 10,000 tokens/min
- Budget: ~$50-100/month

**Monitoring**:
- Firebase Performance Monitoring
- Cloud Logging
- Error Reporting
- Custom dashboards

### Security

**Authentication**:
- Firebase Auth (email/password)
- Role-based access control (staff/admin)
- Rate limiting per user

**Data Protection**:
- Firestore Security Rules
- Storage Security Rules
- Encrypted at rest
- GDPR compliant

**API Security**:
- OpenAI API key în Secrets Manager
- HTTPS only
- CORS configured
- Input validation

## 📝 Next Steps

### Immediate Actions (This Week)

1. ✅ **Documentare completă** - AI_ARCHITECTURE.md creat
2. ⏳ **Setup development environment**
   - [ ] Create feature branch: `feature/ai-manager`
   - [ ] Setup local Firebase emulators
   - [ ] Configure OpenAI API key în Secrets

3. ⏳ **Start Phase 1**
   - [ ] Implement image upload în chat
   - [ ] Create aiManager Cloud Function skeleton
   - [ ] Integrate Object Gatekeeper prompt

### Weekly Checkpoints

**Every Monday 10:00**:
- Review progress săptămâna anterioară
- Demo features noi
- Identify blockers
- Plan săptămâna curentă

**Every Friday 16:00**:
- Code review
- Testing results
- Deploy în staging
- Update documentation

## 🎯 Definition of Done

Pentru fiecare feature:
- [ ] Code implementat și testat
- [ ] Unit tests (coverage > 80%)
- [ ] Integration tests
- [ ] Code review approved
- [ ] Documentation updated
- [ ] Deployed în staging
- [ ] UAT passed
- [ ] Deployed în production
- [ ] Monitoring configured

---

## 📞 Contact & Support

**Development Team**:
- Lead Developer: [Nume]
- Backend Developer: [Nume]
- Frontend Developer: [Nume]

**Stakeholders**:
- Product Owner: [Nume]
- Admin User: ursache.andrei1995@gmail.com

**Status Updates**:
- Daily: Slack #ai-manager-dev
- Weekly: Email summary
- Monthly: Executive report

---

**Status**: 📋 Ready to Start
**Current Phase**: Phase 0 - Planning Complete
**Next Milestone**: Phase 1 - Week 1
**Priority**: 🔴 Critical
**Estimated Completion**: 5 weeks from start
**Budget**: $500-1000 (OpenAI + infrastructure)

---

**Last Updated**: 2025-12-26
**Document Owner**: Development Team
**Version**: 1.0
