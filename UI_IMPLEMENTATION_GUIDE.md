# UI Implementation Guide - Evenimente Module

## Overview

This guide provides specifications for implementing UI improvements for the evenimente (events) module, including event cards, role details, and admin correction features.

## Priority 7: UI Improvements

### 1. Event Card Component

**Location**: `kyc-app/kyc-app/src/components/EventCard.jsx`

**Required Fields to Display**:

```jsx
<EventCard event={event}>
  {/* Header */}
  <div className="event-card-header">
    <span className="short-code">{event.shortCode}</span>
    <span className="date">{event.date}</span>
  </div>

  {/* Main Info */}
  <div className="event-card-body">
    <div className="address">📍 {event.address}</div>
    {event.sarbatoritNume && (
      <div className="celebrant">
        🎂 {event.sarbatoritNume}
        {event.sarbatoritVarsta && ` (${event.sarbatoritVarsta} ani)`}
      </div>
    )}
    {event.client && (
      <div className="client">📞 {event.client}</div>
    )}
  </div>

  {/* Roles List */}
  <div className="event-card-roles">
    <h4>🎭 Servicii:</h4>
    {event.roles.map((role, index) => (
      <div key={index} className="role-item">
        <span className="role-code">{role.roleCode}</span>
        <span className="role-label">{role.label}</span>
        <span className="role-time">
          {role.startTime} ({formatDuration(role.durationMinutes)})
        </span>
      </div>
    ))}
  </div>

  {/* Status */}
  <div className="event-card-footer">
    <span className={`status ${event.incasare.status.toLowerCase()}`}>
      {event.incasare.status}
    </span>
    {event.isArchived && (
      <span className="archived-badge">📦 Arhivat</span>
    )}
  </div>
</EventCard>
```

**Helper Function**:

```javascript
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}min`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${mins}min`;
  }
}
```

### 2. Event Details Modal

**Location**: `kyc-app/kyc-app/src/components/EventDetailsModal.jsx`

**Features**:

1. **Full Event Information**:
   - All fields from event card
   - Created/updated timestamps and by whom
   - Transcript messages (if available)
   - AI interpretation log (if available)

2. **Role Details Expansion**:
   - Click on role to expand details
   - Show role-specific information:

```jsx
<RoleDetails role={role}>
  {/* Common fields */}
  <div className="role-common">
    <div>Cod: {role.roleCode}</div>
    <div>Oră: {role.startTime}</div>
    <div>Durată: {formatDuration(role.durationMinutes)}</div>
  </div>

  {/* Animator-specific */}
  {role.label === 'Animator' && role.details && (
    <div className="role-animator-details">
      <h5>Detalii Animator:</h5>
      <div>👤 Sărbătorit: {role.details.sarbatoritNume}</div>
      <div>🎂 Data nașterii: {role.details.dataNastere}</div>
      <div>🎭 Personaj: {role.details.personaj || 'Nespecificat'}</div>
      <div>👶 Vârstă reală: {role.details.varstaReala || 'N/A'}</div>
      <div>👥 Nr. copii: {role.details.numarCopiiAprox || 'N/A'}</div>
      <div>👨‍👩‍👧 Părinte: {role.details.parentName || 'N/A'}</div>
    </div>
  )}

  {/* Ursitoare-specific */}
  {role.label === 'Ursitoare' && role.details && (
    <div className="role-ursitoare-details">
      <h5>Detalii Ursitoare:</h5>
      <div>👥 Număr: {role.details.count} ursitoare</div>
      {role.details.count === 4 && (
        <div>⚠️ Include 1 ursitoare rea</div>
      )}
      <div>⏱️ Durată fixă: 60 minute</div>
      <div>👤 Pentru: {role.details.sarbatoritNume}</div>
      <div>🎂 Data nașterii: {role.details.dataNastere}</div>
    </div>
  )}

  {/* Assignment */}
  {role.assignedCode && (
    <div className="role-assignment">
      ✅ Asignat: {role.assignedCode}
    </div>
  )}
  {role.pendingCode && (
    <div className="role-pending">
      ⏳ În așteptare: {role.pendingCode}
    </div>
  )}
</RoleDetails>
```

### 3. Event List Sorting

**Location**: `kyc-app/kyc-app/src/hooks/useEvents.js`

**Add Sorting Options**:

```javascript
const sortOptions = [
  { value: 'date-asc', label: 'Data (crescător)' },
  { value: 'date-desc', label: 'Data (descrescător)' },
  { value: 'time-asc', label: 'Oră (crescător)' },
  { value: 'time-desc', label: 'Oră (descrescător)' },
  { value: 'created-desc', label: 'Creat recent' },
  { value: 'shortCode-asc', label: 'Cod (crescător)' },
];

function sortEvents(events, sortBy) {
  const sorted = [...events];

  switch (sortBy) {
    case 'date-asc':
      return sorted.sort((a, b) => compareDates(a.date, b.date));
    
    case 'date-desc':
      return sorted.sort((a, b) => compareDates(b.date, a.date));
    
    case 'time-asc':
      return sorted.sort((a, b) => {
        const minTimeA = getMinStartTime(a.roles);
        const minTimeB = getMinStartTime(b.roles);
        return compareTimes(minTimeA, minTimeB);
      });
    
    case 'time-desc':
      return sorted.sort((a, b) => {
        const minTimeA = getMinStartTime(a.roles);
        const minTimeB = getMinStartTime(b.roles);
        return compareTimes(minTimeB, minTimeA);
      });
    
    case 'created-desc':
      return sorted.sort((a, b) => 
        b.createdAt?.toMillis() - a.createdAt?.toMillis()
      );
    
    case 'shortCode-asc':
      return sorted.sort((a, b) => 
        (a.shortCode || '').localeCompare(b.shortCode || '')
      );
    
    default:
      return sorted;
  }
}

function getMinStartTime(roles) {
  if (!roles || roles.length === 0) return '23:59';
  
  const times = roles
    .map(r => r.startTime)
    .filter(Boolean)
    .sort();
  
  return times[0] || '23:59';
}

function compareDates(dateA, dateB) {
  // Assuming DD-MM-YYYY format
  const [dayA, monthA, yearA] = dateA.split('-').map(Number);
  const [dayB, monthB, yearB] = dateB.split('-').map(Number);
  
  const dateObjA = new Date(yearA, monthA - 1, dayA);
  const dateObjB = new Date(yearB, monthB - 1, dayB);
  
  return dateObjA - dateObjB;
}

function compareTimes(timeA, timeB) {
  // Assuming HH:mm format
  return timeA.localeCompare(timeB);
}
```

### 4. Edit Event Modal

**Location**: `kyc-app/kyc-app/src/components/EditEventModal.jsx`

**Features**:

1. **Edit Basic Info**:
   - Date (with validation DD-MM-YYYY)
   - Address
   - Client phone
   - Sărbătorit info

2. **Edit Roles**:
   - Add new role
   - Edit existing role (time, duration, details)
   - Remove role (with confirmation)

3. **Audit Trail**:
   - Show who created/updated
   - Show when created/updated
   - Show change history (if available)

**Example**:

```jsx
<EditEventModal event={event} onSave={handleSave}>
  <form onSubmit={handleSubmit}>
    {/* Basic Info */}
    <section className="edit-section">
      <h3>Informații de bază</h3>
      <input
        type="text"
        name="date"
        value={formData.date}
        onChange={handleChange}
        pattern="\d{2}-\d{2}-\d{4}"
        placeholder="DD-MM-YYYY"
        required
      />
      <input
        type="text"
        name="address"
        value={formData.address}
        onChange={handleChange}
        required
      />
      <input
        type="tel"
        name="client"
        value={formData.client}
        onChange={handleChange}
        pattern="(\+40|0)7\d{8}"
        placeholder="+40 7XX XXX XXX"
      />
    </section>

    {/* Roles */}
    <section className="edit-section">
      <h3>Servicii/Roluri</h3>
      {formData.roles.map((role, index) => (
        <RoleEditor
          key={index}
          role={role}
          onChange={(updated) => handleRoleChange(index, updated)}
          onRemove={() => handleRoleRemove(index)}
        />
      ))}
      <button type="button" onClick={handleAddRole}>
        + Adaugă serviciu
      </button>
    </section>

    {/* Actions */}
    <div className="modal-actions">
      <button type="button" onClick={onCancel}>
        Anulează
      </button>
      <button type="submit">
        Salvează
      </button>
    </div>
  </form>
</EditEventModal>
```

## Priority 8: Admin Corrections

### Admin-Only Features

**Access Control**:

```javascript
const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

function isSuperAdmin(userEmail) {
  return userEmail === SUPER_ADMIN_EMAIL;
}
```

### 1. AI Correction Button

**Location**: Event Details Modal (admin-only)

```jsx
{isSuperAdmin(currentUser.email) && (
  <button
    className="btn-admin-correct"
    onClick={() => setShowCorrectionModal(true)}
  >
    🔧 Corectează AI
  </button>
)}
```

### 2. AI Correction Modal

**Location**: `kyc-app/kyc-app/src/components/AICorrectionModal.jsx`

**Features**:

1. **View AI Interpretation**:
   - Show original user input
   - Show what AI extracted
   - Show AI decision
   - Show clarifications asked

2. **Add Corrections**:
   - Add new synonyms for roles
   - Override role detection
   - Add custom parsing rules

**Example**:

```jsx
<AICorrectionModal event={event}>
  {/* Show AI Log */}
  <section className="ai-log">
    <h3>Istoric Interpretare AI</h3>
    {event.aiInterpretationLog.map((log, index) => (
      <div key={index} className="log-entry">
        <div className="log-input">
          <strong>Input:</strong> {log.input}
        </div>
        <div className="log-extracted">
          <strong>Extras:</strong>
          <pre>{JSON.stringify(log.extracted, null, 2)}</pre>
        </div>
        <div className="log-decision">
          <strong>Decizie:</strong> {log.decision}
        </div>
        {log.clarifications.length > 0 && (
          <div className="log-clarifications">
            <strong>Clarificări:</strong>
            <ul>
              {log.clarifications.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    ))}
  </section>

  {/* Add Correction */}
  <section className="add-correction">
    <h3>Adaugă Corecție</h3>
    
    <label>
      Tip corecție:
      <select value={correctionType} onChange={e => setCorrectionType(e.target.value)}>
        <option value="synonym">Sinonim nou</option>
        <option value="role-mapping">Mapare rol</option>
        <option value="duration-rule">Regulă durată</option>
      </select>
    </label>

    {correctionType === 'synonym' && (
      <>
        <label>
          Rol:
          <select value={roleType} onChange={e => setRoleType(e.target.value)}>
            <option value="animator">Animator</option>
            <option value="ursitoare">Ursitoare</option>
            {/* ... other roles */}
          </select>
        </label>
        <label>
          Sinonime noi (separate prin virgulă):
          <input
            type="text"
            value={synonyms}
            onChange={e => setSynonyms(e.target.value)}
            placeholder="ex: animatori, animatoare, personaje"
          />
        </label>
      </>
    )}

    <button onClick={handleSaveCorrection}>
      Salvează Corecție
    </button>
  </section>
</AICorrectionModal>
```

### 3. AI Overrides Collection

**Firestore Structure**:

```javascript
// Collection: aiOverrides
{
  id: "override_001",
  scope: "global" | "roleType" | "eventId",
  roleType: "animator", // if scope is roleType
  eventId: "evt_123", // if scope is eventId
  synonyms: ["animatori", "animatoare", "personaje"],
  mappingRules: {
    "mc": { role: "animator", personaj: "MC" }
  },
  durationRules: {
    "ursitoare": 60 // fixed duration
  },
  createdAt: Timestamp,
  createdBy: "uid",
  createdByEmail: "ursache.andrei1995@gmail.com",
  updatedAt: Timestamp,
  updatedBy: "uid"
}
```

**Save Override Function**:

```javascript
async function saveAIOverride(override) {
  const db = firebase.firestore();
  
  const overrideDoc = {
    ...override,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUser.uid,
    createdByEmail: currentUser.email,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser.uid,
  };

  await db.collection('aiOverrides').add(overrideDoc);
  
  console.log('AI override saved:', overrideDoc);
}
```

## CSS Styling

### Event Card Styles

```css
.event-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.2s ease;
}

.event-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.event-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.short-code {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  background: rgba(78, 205, 196, 0.1);
  padding: 4px 8px;
  border-radius: 6px;
}

.role-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  margin-bottom: 4px;
}

.role-code {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  background: rgba(78, 205, 196, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}

.role-label {
  flex: 1;
  font-size: 14px;
}

.role-time {
  font-size: 12px;
  color: var(--muted);
}

.status {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
}

.status.incasat {
  background: rgba(78, 205, 196, 0.2);
  color: var(--accent);
}

.status.neincasat {
  background: rgba(255, 190, 92, 0.2);
  color: var(--warn);
}

.status.anulat {
  background: rgba(255, 120, 120, 0.2);
  color: var(--bad);
}

.archived-badge {
  font-size: 12px;
  color: var(--muted2);
}
```

## Testing Checklist

### UI Components

- [ ] Event card displays all required fields
- [ ] Short code is visible and clickable
- [ ] Roles list shows time and duration
- [ ] Click on role expands details
- [ ] Animator details show all fields
- [ ] Ursitoare details show count and fixed duration
- [ ] Sorting by date works correctly
- [ ] Sorting by time uses min startTime from roles
- [ ] Edit modal validates date format (DD-MM-YYYY)
- [ ] Edit modal validates phone format
- [ ] Admin correction button only visible to super admin
- [ ] AI interpretation log displays correctly
- [ ] Override save function works

### Responsive Design

- [ ] Event cards stack properly on mobile
- [ ] Role details are readable on small screens
- [ ] Modals are scrollable on mobile
- [ ] Touch targets are at least 44x44px

## Implementation Priority

1. **High Priority** (Must have):
   - Event card with short code
   - Role list with time/duration
   - Basic sorting (date, time)
   - Edit event modal

2. **Medium Priority** (Should have):
   - Role details expansion
   - Animator/Ursitoare specific details
   - Advanced sorting options

3. **Low Priority** (Nice to have):
   - Admin correction UI
   - AI interpretation log viewer
   - Override management

## Notes

- All date inputs must validate DD-MM-YYYY format
- All time inputs must validate HH:mm format
- Phone numbers must validate Romanian format (+40 7XX XXX XXX)
- Admin features must check `isSuperAdmin()` before rendering
- Use existing color variables from `:root` CSS
- Maintain consistent spacing and border radius (12px for cards, 6px for badges)
