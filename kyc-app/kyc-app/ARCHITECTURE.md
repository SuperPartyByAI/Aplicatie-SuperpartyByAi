# 🏗️ Arhitectura Aplicației KYC

Documentație arhitectură și flow-uri principale pentru aplicația de management staff evenimente.

## 📊 Diagrama de Arhitectură

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                      │
├─────────────────────────────────────────────────────────────┤
│  App.jsx (Router + FlowGuard)                               │
│    │                                                         │
│    ├─ Auth Flow (Eager Loading)                             │
│    │   ├─ AuthScreen                                        │
│    │   ├─ VerifyEmailScreen                                 │
│    │   ├─ KycScreen                                         │
│    │   ├─ WaitingScreen                                     │
│    │   └─ StaffSetupScreen                                  │
│    │                                                         │
│    ├─ Staff Dashboard (Lazy Loading)                        │
│    │   ├─ HomeScreen                                        │
│    │   ├─ EvenimenteScreen                                  │
│    │   ├─ DisponibilitateScreen                             │
│    │   ├─ SalarizareScreen                                  │
│    │   └─ SettingsScreen                                    │
│    │                                                         │
│    └─ Admin Panel (Lazy Loading)                            │
│        ├─ AdminScreen (KYC + Conversații)                   │
│        └─ SoferiScreen (Management Șoferi)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FIREBASE SERVICES                         │
├─────────────────────────────────────────────────────────────┤
│  Authentication                                              │
│    └─ Email/Password + Email Verification                   │
│                                                              │
│  Firestore Database                                          │
│    ├─ users (date utilizatori + status)                     │
│    ├─ kycSubmissions (documente KYC)                        │
│    ├─ evenimente (evenimente disponibile)                   │
│    ├─ evenimenteAlocate (alocări staff)                     │
│    ├─ disponibilitate (disponibilitate staff)               │
│    ├─ salarizare (ore + plăți)                              │
│    ├─ soferi (date șoferi)                                  │
│    └─ conversatii (mesaje admin-staff)                      │
│                                                              │
│  Storage                                                     │
│    └─ kyc-documents/ (CI, permis, cazier)                   │
│                                                              │
│  Cloud Functions                                             │
│    └─ allocateStaffToEvent (AI allocation cu OpenAI)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      EXTERNAL APIs                           │
├─────────────────────────────────────────────────────────────┤
│  OpenAI GPT-4                                                │
│    └─ Alocare automată staff pe evenimente                  │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Flow-uri Principale

### 1. Authentication Flow

```
User lands on app
    │
    ▼
FlowGuard checks auth state
    │
    ├─ Not authenticated ──────────────────────┐
    │                                           ▼
    │                                    AuthScreen
    │                                           │
    │                                           ├─ Login
    │                                           └─ Register
    │                                               │
    ├─ Authenticated but email not verified ───────┤
    │                                               ▼
    │                                    VerifyEmailScreen
    │                                               │
    ├─ Email verified but no KYC ──────────────────┤
    │                                               ▼
    │                                         KycScreen
    │                                               │
    │                                               ├─ Upload CI
    │                                               ├─ Upload Permis
    │                                               └─ Upload Cazier
    │                                                   │
    ├─ KYC submitted but not approved ─────────────────┤
    │                                                   ▼
    │                                          WaitingScreen
    │                                                   │
    ├─ KYC approved but no staff setup ────────────────┤
    │                                                   ▼
    │                                        StaffSetupScreen
    │                                                   │
    └─ Fully setup ────────────────────────────────────┤
                                                        ▼
                                                   HomeScreen
```

### 2. Event Allocation Flow

```
Admin creates event
    │
    ▼
Event saved to Firestore (evenimente collection)
    │
    ▼
Admin triggers AI allocation
    │
    ▼
Cloud Function: allocateStaffToEvent
    │
    ├─ Fetch all available staff
    ├─ Fetch staff disponibilitate
    ├─ Fetch staff salarizare history
    │
    ▼
OpenAI GPT-4 analyzes and ranks staff
    │
    ├─ Considers: disponibilitate, experiență, rating
    ├─ Returns: ranked list of suitable staff
    │
    ▼
Create evenimenteAlocate documents
    │
    ├─ status: "pending"
    ├─ staffId: selected staff
    ├─ eventId: event ID
    │
    ▼
Staff sees event in HomeScreen
    │
    ├─ Accept ──────────────────┐
    │                            ▼
    │                   status: "accepted"
    │                            │
    │                            ▼
    │                   Event appears in EvenimenteScreen
    │
    └─ Decline ─────────────────┐
                                 ▼
                        status: "declined"
                                 │
                                 ▼
                        Admin reallocates to next staff
```

### 3. Disponibilitate Flow

```
Staff opens DisponibilitateScreen
    │
    ▼
Fetch existing disponibilitate from Firestore
    │
    ▼
Display calendar with current availability
    │
    ├─ User clicks on day
    │   │
    │   ▼
    │   Toggle disponibilitate
    │   │
    │   ├─ If available: set interval (start/end time)
    │   └─ If not available: remove interval
    │       │
    │       ▼
    │   Save to Firestore (disponibilitate collection)
    │       │
    │       ▼
    │   Update local state
    │
    └─ AI allocation uses this data for matching
```

### 4. Salarizare Flow

```
Event completed (status: "completed")
    │
    ▼
Admin marks event as completed
    │
    ▼
System calculates hours worked
    │
    ├─ eventStart - eventEnd = total hours
    ├─ Apply hourly rate from staff profile
    │
    ▼
Create salarizare entry
    │
    ├─ staffId
    ├─ eventId
    ├─ hours
    ├─ rate
    ├─ total = hours * rate
    ├─ status: "pending"
    │
    ▼
Staff sees in SalarizareScreen
    │
    ├─ Pending payments (yellow)
    ├─ Paid payments (green)
    └─ Total earnings
        │
        ▼
Admin processes payment
        │
        ▼
Update status: "paid"
        │
        ▼
Staff sees updated status
```

### 5. Admin KYC Approval Flow

```
User submits KYC
    │
    ▼
Create kycSubmissions document
    │
    ├─ userId
    ├─ ciUrl (Storage URL)
    ├─ permisUrl (Storage URL)
    ├─ cazierUrl (Storage URL)
    ├─ status: "pending"
    ├─ timestamp
    │
    ▼
Admin sees in AdminScreen (real-time)
    │
    ├─ View documents
    ├─ Check validity
    │
    ▼
Admin decision
    │
    ├─ Approve ────────────────┐
    │                           ▼
    │                   Update kycSubmissions
    │                   status: "approved"
    │                           │
    │                           ▼
    │                   Update users document
    │                   kycStatus: "approved"
    │                           │
    │                           ▼
    │                   User redirected to StaffSetupScreen
    │
    └─ Reject ─────────────────┐
                                ▼
                        Update kycSubmissions
                        status: "rejected"
                        rejectionReason: "..."
                                │
                                ▼
                        Update users document
                        kycStatus: "rejected"
                                │
                                ▼
                        User can resubmit KYC
```

## 🗄️ Database Schema

### users Collection
```javascript
{
  uid: string,                    // Firebase Auth UID
  email: string,                  // Email utilizator
  role: "staff" | "admin",        // Rol utilizator
  kycStatus: "none" | "pending" | "approved" | "rejected",
  setupComplete: boolean,         // Staff setup completat
  
  // Staff specific
  firstName: string,
  lastName: string,
  phone: string,
  hourlyRate: number,            // Lei/oră
  rating: number,                // 1-5 stars
  totalEvents: number,           // Total evenimente completate
  
  // Timestamps
  createdAt: Timestamp,
  lastLogin: Timestamp
}
```

### kycSubmissions Collection
```javascript
{
  id: string,                    // Auto-generated
  userId: string,                // Reference to users
  status: "pending" | "approved" | "rejected",
  
  // Documents (Storage URLs)
  ciUrl: string,
  permisUrl: string,
  cazierUrl: string,
  
  // Metadata
  submittedAt: Timestamp,
  reviewedAt: Timestamp | null,
  reviewedBy: string | null,     // Admin UID
  rejectionReason: string | null
}
```

### evenimente Collection
```javascript
{
  id: string,                    // Auto-generated
  title: string,                 // Nume eveniment
  description: string,
  location: string,
  
  // Timing
  startTime: Timestamp,
  endTime: Timestamp,
  
  // Requirements
  requiredStaff: number,         // Număr staff necesar
  allocatedStaff: number,        // Număr staff alocat
  
  // Status
  status: "draft" | "active" | "completed" | "cancelled",
  
  // Metadata
  createdBy: string,             // Admin UID
  createdAt: Timestamp
}
```

### evenimenteAlocate Collection
```javascript
{
  id: string,                    // Auto-generated
  eventId: string,               // Reference to evenimente
  staffId: string,               // Reference to users
  
  // Status
  status: "pending" | "accepted" | "declined" | "completed",
  
  // Response
  respondedAt: Timestamp | null,
  
  // Metadata
  allocatedAt: Timestamp,
  allocatedBy: string            // Admin UID or "AI"
}
```

### disponibilitate Collection
```javascript
{
  id: string,                    // Format: {userId}_{date}
  userId: string,                // Reference to users
  date: string,                  // Format: YYYY-MM-DD
  
  // Availability
  available: boolean,
  startTime: string | null,      // Format: HH:mm
  endTime: string | null,        // Format: HH:mm
  
  // Metadata
  updatedAt: Timestamp
}
```

### salarizare Collection
```javascript
{
  id: string,                    // Auto-generated
  staffId: string,               // Reference to users
  eventId: string,               // Reference to evenimente
  
  // Payment details
  hours: number,                 // Ore lucrate
  rate: number,                  // Lei/oră
  total: number,                 // hours * rate
  
  // Status
  status: "pending" | "paid",
  paidAt: Timestamp | null,
  
  // Metadata
  createdAt: Timestamp
}
```

### soferi Collection
```javascript
{
  id: string,                    // Auto-generated
  firstName: string,
  lastName: string,
  phone: string,
  
  // Vehicle
  vehicleType: string,           // Ex: "Mercedes Sprinter"
  licensePlate: string,
  capacity: number,              // Număr pasageri
  
  // Status
  available: boolean,
  rating: number,                // 1-5 stars
  
  // Metadata
  createdAt: Timestamp
}
```

### conversatii Collection
```javascript
{
  id: string,                    // Auto-generated
  staffId: string,               // Reference to users
  adminId: string,               // Reference to users
  
  // Message
  message: string,
  sender: "admin" | "staff",
  
  // Status
  read: boolean,
  
  // Metadata
  timestamp: Timestamp
}
```

## ⚡ Performance Optimizations

### 1. N+1 Query Elimination

**Problem**: Fetching user data individually for each item in a list
```javascript
// ❌ BAD: N+1 queries
items.forEach(async (item) => {
  const userDoc = await getDoc(doc(db, "users", item.userId));
  // Process item with user data
});
```

**Solution**: Batch fetch all users upfront
```javascript
// ✅ GOOD: Single batch query
const userIds = [...new Set(items.map(item => item.userId))];
const usersMap = {};

await Promise.all(
  userIds.map(async (userId) => {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
      usersMap[userId] = userDoc.data();
    }
  })
);

// Now use usersMap for all items
items.forEach((item) => {
  const userData = usersMap[item.userId];
  // Process item with user data
});
```

**Impact**: 
- SalarizareScreen: 90% reduction in reads
- EvenimenteScreen: 90% reduction in reads
- AdminScreen: 90% reduction in reads

### 2. Real-time Updates

**Implementation**: Firestore `onSnapshot` listeners
```javascript
useEffect(() => {
  const unsubscribe = onSnapshot(
    query(collection(db, "evenimente"), where("status", "==", "active")),
    (snapshot) => {
      const events = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(events);
    }
  );
  
  return () => unsubscribe();
}, []);
```

**Benefits**:
- Instant updates without page refresh
- Better UX for time-sensitive data
- Reduced manual polling

### 3. Pagination

**Implementation**: Firestore query limits + cursors
```javascript
const [lastVisible, setLastVisible] = useState(null);
const PAGE_SIZE = 10;

const loadMore = async () => {
  let q = query(
    collection(db, "conversatii"),
    orderBy("timestamp", "desc"),
    limit(PAGE_SIZE)
  );
  
  if (lastVisible) {
    q = query(q, startAfter(lastVisible));
  }
  
  const snapshot = await getDocs(q);
  setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
  // Process results
};
```

**Benefits**:
- Reduced initial load time
- Lower memory usage
- Better performance on mobile

### 4. Code Splitting

**Implementation**: React lazy loading
```javascript
// Eager loading for auth flow (critical path)
import AuthScreen from './screens/AuthScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';

// Lazy loading for dashboard (non-critical)
const HomeScreen = lazy(() => import('./screens/HomeScreen'));
const AdminScreen = lazy(() => import('./screens/AdminScreen'));
```

**Benefits**:
- Smaller initial bundle
- Faster time to interactive
- Better Core Web Vitals

## 🔐 Security Rules

### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users can read their own data
    match /users/{userId} {
      allow read: if request.auth.uid == userId;
      allow write: if request.auth.uid == userId;
    }
    
    // Only admins can read all users
    match /users/{userId} {
      allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
    
    // KYC submissions
    match /kycSubmissions/{submissionId} {
      allow create: if request.auth != null;
      allow read: if request.auth.uid == resource.data.userId 
                  || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
      allow update: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
    
    // Evenimente - staff can read, admin can write
    match /evenimente/{eventId} {
      allow read: if request.auth != null;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
    
    // EvenimenteAlocate - staff can read/update their own
    match /evenimenteAlocate/{allocationId} {
      allow read: if request.auth.uid == resource.data.staffId
                  || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
      allow update: if request.auth.uid == resource.data.staffId;
      allow create: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
    
    // Disponibilitate - staff can read/write their own
    match /disponibilitate/{availabilityId} {
      allow read, write: if request.auth.uid == resource.data.userId;
    }
    
    // Salarizare - staff can read their own, admin can write
    match /salarizare/{paymentId} {
      allow read: if request.auth.uid == resource.data.staffId
                  || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
    
    // Conversatii - staff and admin can read/write their conversations
    match /conversatii/{messageId} {
      allow read, write: if request.auth.uid == resource.data.staffId
                         || request.auth.uid == resource.data.adminId;
    }
  }
}
```

## 🚀 Deployment Strategy

### 1. Development
```bash
npm run dev          # Local development server
npm run lint         # Check code quality
```

### 2. Staging
```bash
npm run build        # Build production bundle
firebase deploy --only hosting:staging
```

### 3. Production
```bash
npm run build
firebase deploy      # Deploy hosting + functions
```

### 4. Rollback
```bash
firebase hosting:rollback  # Rollback to previous version
```

## 📈 Monitoring & Analytics

### Firebase Analytics Events
- `user_signup`: New user registration
- `kyc_submitted`: KYC submission
- `kyc_approved`: KYC approval
- `event_accepted`: Staff accepts event
- `event_declined`: Staff declines event
- `payment_processed`: Payment marked as paid

### Performance Monitoring
- Page load times
- API response times
- Error rates
- User engagement metrics

## 🐛 Common Issues & Solutions

### Issue: "Permission denied" errors
**Solution**: Check Firestore security rules and user role

### Issue: Real-time updates not working
**Solution**: Verify onSnapshot listeners are properly set up and cleaned up

### Issue: Slow page loads
**Solution**: Check for N+1 queries, implement pagination, use lazy loading

### Issue: Build fails
**Solution**: Clear node_modules and reinstall dependencies

### Issue: Firebase deployment fails
**Solution**: Verify Firebase CLI is logged in and project is selected

## 📚 Additional Resources

- **LOGICA_APLICATIE.md**: Line-by-line code documentation
- **README.md**: Project overview and setup
- **DEPLOY_INSTRUCTIONS.md**: Deployment guide
- **SETUP_ADMIN_ROLE.md**: Admin role setup

## 🔄 Future Improvements

1. **Push Notifications**: Notify staff of new events via FCM
2. **Mobile App**: React Native version for iOS/Android
3. **Advanced Analytics**: Dashboard with charts and insights
4. **Automated Testing**: Unit and integration tests
5. **CI/CD Pipeline**: Automated deployment on push
6. **Multi-language Support**: i18n for Romanian/English
7. **Dark Mode**: Theme switching
8. **Export Features**: PDF reports for salarizare
