# Deploy Manual Firestore Rules - Prin Console Firebase

## Pași pentru Deploy Manual (fără CLI)

### 1. Deschide Firebase Console

Accesează: https://console.firebase.google.com/project/superparty-frontend/firestore/rules

### 2. Copiază regulile de mai jos

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Helper function: check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper function: check if user is admin
    function isAdmin() {
      return isAuthenticated() && request.auth.token.email == 'ursache.andrei1995@gmail.com';
    }

    // Helper function: check if user has staff profile
    function hasStaffProfile() {
      return isAuthenticated() && exists(/databases/$(database)/documents/staffProfiles/$(request.auth.uid));
    }

    // Helper function: get staff code
    function getStaffCode() {
      return get(/databases/$(database)/documents/staffProfiles/$(request.auth.uid)).data.code;
    }

    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated() && (request.auth.uid == userId || isAdmin());
      allow write: if isAuthenticated() && (request.auth.uid == userId || isAdmin());
    }

    // Staff profiles
    match /staffProfiles/{profileId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // Evenimente
    match /evenimente/{eventId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // AI Conversations
    match /aiConversations/{conversationId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }

    // AI Corrections
    match /aiCorrections/{correctionId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // WhatsApp Conversations - NEW
    match /whatsappConversations/{conversationId} {
      // All authenticated staff can read all conversations
      allow read: if isAuthenticated() && hasStaffProfile();

      // Staff can create new conversations
      allow create: if isAuthenticated() && hasStaffProfile();

      // Staff can update conversations they reserved OR available conversations
      allow update: if isAuthenticated() && hasStaffProfile() && (
        // Can reserve available conversations
        resource.data.status == 'AVAILABLE' ||
        // Can update own reserved conversations
        resource.data.assigned_operator_code == getStaffCode()
      );

      // Only admin can delete
      allow delete: if isAdmin();
    }

    // WhatsApp Messages - NEW
    match /whatsappMessages/{messageId} {
      // All authenticated staff can read all messages
      allow read: if isAuthenticated() && hasStaffProfile();

      // Staff can create messages in conversations they reserved
      allow create: if isAuthenticated() && hasStaffProfile() && (
        // Check if conversation is reserved by this operator
        get(/databases/$(database)/documents/whatsappConversations/$(request.resource.data.conversation_id)).data.assigned_operator_code == getStaffCode() ||
        // Or if it's a client message (from backend)
        request.resource.data.sender_type == 'CLIENT' ||
        // Or if it's an AI message (from backend)
        request.resource.data.sender_type == 'AI'
      );

      // Messages cannot be updated
      allow update: if false;

      // Only admin can delete
      allow delete: if isAdmin();
    }

    // Default deny all other collections
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 3. Lipește în editor

- Click pe tab-ul "Rules" în Firebase Console
- Șterge regulile existente
- Lipește regulile de mai sus

### 4. Click "Publish"

Butonul albastru din dreapta sus.

### 5. Verificare

După publish, reîncarcă aplicația: https://superparty-frontend.web.app/home

Eroarea "permission-denied" ar trebui să dispară.

---

## Link Direct

https://console.firebase.google.com/project/superparty-frontend/firestore/rules
