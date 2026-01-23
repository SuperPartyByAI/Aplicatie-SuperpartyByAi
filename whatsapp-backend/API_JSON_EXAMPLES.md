# WhatsApp Backend API - JSON Examples & Flutter Models

**Purpose:** Exact JSON structures for Flutter integration  
**Last Updated:** 2026-01-17

---

## 1. GET /api/whatsapp/accounts

**Method:** `GET`  
**Auth:** Firebase ID token required (`Authorization: Bearer $TOKEN`)  
**Response:**

```json
{
  "success": true,
  "accounts": [
    {
      "id": "account_prod_abc123",
      "name": "WA-01",
      "phone": "+40712345678",
      "status": "connected",
      "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "pairingCode": null,
      "waJid": "40712345678@s.whatsapp.net",
      "lastUpdate": "2026-01-17T20:30:00.000Z",
      "lastConnectedAt": "2026-01-17T20:30:00.000Z",
      "lastEventAt": "2026-01-17T21:00:00.000Z",
      "lastMessageAt": "2026-01-17T21:00:00.000Z",
      "lastSeen": "2026-01-17T21:00:00.000Z",
      "reconnectCount": 0,
      "reconnectAttempts": 0,
      "needsQR": false,
      "lastBackfillAt": "2026-01-17T21:00:00.000Z",
      "lastHistorySyncAt": "2026-01-17T20:30:00.000Z"
    },
    {
      "id": "account_prod_def456",
      "name": "WA-02",
      "phone": "+40787654321",
      "status": "qr_ready",
      "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "pairingCode": null,
      "waJid": null,
      "lastUpdate": "2026-01-17T21:00:00.000Z",
      "needsQR": true
    }
  ]
}
```

**Flutter Model:**
```dart
class WhatsAppAccount {
  final String id;
  final String name;
  final String phone;
  final String status; // 'connected', 'qr_ready', 'connecting', 'disconnected', 'needs_qr'
  final String? qrCode; // data:image/png;base64,... (nullable)
  final String? pairingCode; // nullable
  final String? waJid; // nullable
  final String? lastUpdate;
  final String? lastConnectedAt;
  final String? lastEventAt;
  final String? lastMessageAt;
  final String? lastSeen;
  final int reconnectCount;
  final int reconnectAttempts;
  final bool needsQR;
  final String? lastBackfillAt;
  final String? lastHistorySyncAt;

  WhatsAppAccount({
    required this.id,
    required this.name,
    required this.phone,
    required this.status,
    this.qrCode,
    this.pairingCode,
    this.waJid,
    this.lastUpdate,
    this.lastConnectedAt,
    this.lastEventAt,
    this.lastMessageAt,
    this.lastSeen,
    this.reconnectCount = 0,
    this.reconnectAttempts = 0,
    this.needsQR = false,
    this.lastBackfillAt,
    this.lastHistorySyncAt,
  });

  factory WhatsAppAccount.fromJson(Map<String, dynamic> json) {
    return WhatsAppAccount(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      status: json['status'] as String? ?? 'unknown',
      qrCode: json['qrCode'] as String?,
      pairingCode: json['pairingCode'] as String?,
      waJid: json['waJid'] as String?,
      lastUpdate: json['lastUpdate'] as String?,
      lastConnectedAt: json['lastConnectedAt'] as String?,
      lastEventAt: json['lastEventAt'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
      lastSeen: json['lastSeen'] as String?,
      reconnectCount: (json['reconnectCount'] as int?) ?? 0,
      reconnectAttempts: (json['reconnectAttempts'] as int?) ?? 0,
      needsQR: (json['needsQR'] as bool?) ?? false,
      lastBackfillAt: json['lastBackfillAt'] as String?,
      lastHistorySyncAt: json['lastHistorySyncAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'phone': phone,
      'status': status,
      if (qrCode != null) 'qrCode': qrCode,
      if (pairingCode != null) 'pairingCode': pairingCode,
      if (waJid != null) 'waJid': waJid,
      if (lastUpdate != null) 'lastUpdate': lastUpdate,
      if (lastConnectedAt != null) 'lastConnectedAt': lastConnectedAt,
      if (lastEventAt != null) 'lastEventAt': lastEventAt,
      if (lastMessageAt != null) 'lastMessageAt': lastMessageAt,
      if (lastSeen != null) 'lastSeen': lastSeen,
      'reconnectCount': reconnectCount,
      'reconnectAttempts': reconnectAttempts,
      'needsQR': needsQR,
      if (lastBackfillAt != null) 'lastBackfillAt': lastBackfillAt,
      if (lastHistorySyncAt != null) 'lastHistorySyncAt': lastHistorySyncAt,
    };
  }

  bool get isConnected => status == 'connected';
  bool get needsQRCode => status == 'qr_ready' || needsQR || qrCode != null;
}
```

---

## 2. POST /api/whatsapp/accounts

**Method:** `POST`  
**Auth:** Firebase ID token required  
**Request:**
```json
{
  "name": "WA-01"
}
```

**Response:**
```json
{
  "success": true,
  "account": {
    "id": "account_prod_abc123",
    "name": "WA-01",
    "status": "created",
    "createdAt": "2026-01-17T20:30:00.000Z"
  }
}
```

---

## 3. POST /api/whatsapp/accounts/:accountId/connect

**Method:** `POST`  
**Auth:** Firebase ID token required (**admin only**)  
**Response:**
```json
{
  "success": true,
  "status": "connecting",
  "accountId": "account_prod_abc123"
}
```

---

## 4. GET /api/whatsapp/accounts/:accountId/qr

**Method:** `GET`  
**Auth:** Firebase ID token required (**admin only**)  
**Response (ready):**
```json
{
  "success": true,
  "accountId": "account_prod_abc123",
  "status": "qr_ready",
  "qrDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "qrPngBase64": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**Response (not ready, 202):**
```json
{
  "success": false,
  "accountId": "account_prod_abc123",
  "status": "connecting",
  "message": "QR not ready"
}
```

---

## 5. POST /api/whatsapp/add-account (legacy)

**Method:** `POST`  
**Auth:** Firebase ID token required (rate limited)  
**Request:**
```json
{
  "name": "WA-01",
  "phone": "+40712345678"
}
```

**Response:**
```json
{
  "success": true,
  "account": {
    "id": "account_prod_abc123",
    "name": "WA-01",
    "phone": "+40712345678",
    "status": "connecting",
    "qrCode": null,
    "pairingCode": null
  }
}
```

**Flutter Model:** Same as `WhatsAppAccount` above.

---

## 6. GET /api/whatsapp/qr/:accountId (legacy)

**Method:** `GET`  
**Auth:** Firebase ID token required (**admin only**)  
**Response:**
```json
{
  "success": true,
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "accountId": "account_prod_abc123",
  "status": "qr_ready"
}
```

**Note:** Legacy JSON only; HTML responses removed.

---

## 7. GET /api/whatsapp/threads/:accountId

**Method:** `GET`  
**Auth:** Firebase ID token required  
**Query Params:** `limit` (default: 50), `orderBy` (default: 'lastMessageAt')  
**Response:**

```json
{
  "success": true,
  "threads": [
    {
      "id": "account_prod_abc123__40712345678@s.whatsapp.net",
      "accountId": "account_prod_abc123",
      "clientJid": "40712345678@s.whatsapp.net",
      "displayName": "John Doe",
      "lastMessageAt": "2026-01-17T21:00:00.000Z",
      "lastMessagePreview": "Hello, how are you?",
      "lastBackfillAt": "2026-01-17T20:30:00.000Z"
    }
  ],
  "count": 1
}
```

**Flutter Model:**
```dart
class WhatsAppThread {
  final String id; // ${accountId}__${clientJid}
  final String accountId;
  final String clientJid;
  final String? displayName;
  final String? lastMessageAt;
  final String? lastMessagePreview;
  final String? lastBackfillAt;

  WhatsAppThread({
    required this.id,
    required this.accountId,
    required this.clientJid,
    this.displayName,
    this.lastMessageAt,
    this.lastMessagePreview,
    this.lastBackfillAt,
  });

  factory WhatsAppThread.fromJson(Map<String, dynamic> json) {
    return WhatsAppThread(
      id: json['id'] as String,
      accountId: json['accountId'] as String,
      clientJid: json['clientJid'] as String,
      displayName: json['displayName'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
      lastMessagePreview: json['lastMessagePreview'] as String?,
      lastBackfillAt: json['lastBackfillAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'accountId': accountId,
      'clientJid': clientJid,
      if (displayName != null) 'displayName': displayName,
      if (lastMessageAt != null) 'lastMessageAt': lastMessageAt,
      if (lastMessagePreview != null) 'lastMessagePreview': lastMessagePreview,
      if (lastBackfillAt != null) 'lastBackfillAt': lastBackfillAt,
    };
  }
}
```

---

## 8. GET /api/whatsapp/messages/:accountId/:threadId

**Method:** `GET`  
**Auth:** Firebase ID token required  
**Query Params:** `limit` (default: 50), `orderBy` (default: 'createdAt')  
**Response:**

```json
{
  "success": true,
  "thread": {
    "id": "account_prod_abc123__40712345678@s.whatsapp.net",
    "accountId": "account_prod_abc123",
    "clientJid": "40712345678@s.whatsapp.net",
    "lastMessageAt": "2026-01-17T21:00:00.000Z"
  },
  "messages": [
    {
      "id": "3EB0ABC123",
      "accountId": "account_prod_abc123",
      "clientJid": "40712345678@s.whatsapp.net",
      "direction": "inbound",
      "body": "Hello, how are you?",
      "waMessageId": "3EB0ABC123",
      "status": "delivered",
      "messageType": "text",
      "tsClient": "2026-01-17T21:00:00.000Z",
      "tsServer": "2026-01-17T21:00:05.000Z",
      "createdAt": "2026-01-17T21:00:05.000Z",
      "syncedAt": "2026-01-17T21:00:05.000Z",
      "syncSource": "realtime"
    },
    {
      "id": "3EB0DEF456",
      "accountId": "account_prod_abc123",
      "clientJid": "40712345678@s.whatsapp.net",
      "direction": "outbound",
      "body": "I'm doing well, thanks!",
      "waMessageId": "3EB0DEF456",
      "status": "read",
      "messageType": "text",
      "tsClient": "2026-01-17T21:01:00.000Z",
      "tsServer": "2026-01-17T21:01:02.000Z",
      "createdAt": "2026-01-17T21:01:02.000Z",
      "deliveredAt": "2026-01-17T21:01:05.000Z",
      "readAt": "2026-01-17T21:01:10.000Z",
      "updatedAt": "2026-01-17T21:01:10.000Z"
    }
  ],
  "count": 2
}
```

**Flutter Model:**
```dart
class WhatsAppMessage {
  final String id;
  final String accountId;
  final String clientJid;
  final String direction; // 'inbound' | 'outbound'
  final String body;
  final String waMessageId;
  final String status; // 'queued' | 'sent' | 'delivered' | 'read'
  final String messageType; // 'text' | 'image' | 'video' | 'audio' | 'document'
  final String? tsClient;
  final String? tsServer;
  final String? createdAt;
  final String? deliveredAt;
  final String? readAt;
  final String? updatedAt;
  final String? syncedAt;
  final String? syncSource; // 'realtime' | 'history_sync'
  final String? mediaType;
  final String? mediaUrl;
  final String? mediaMimetype;
  final String? mediaFilename;

  WhatsAppMessage({
    required this.id,
    required this.accountId,
    required this.clientJid,
    required this.direction,
    required this.body,
    required this.waMessageId,
    required this.status,
    required this.messageType,
    this.tsClient,
    this.tsServer,
    this.createdAt,
    this.deliveredAt,
    this.readAt,
    this.updatedAt,
    this.syncedAt,
    this.syncSource,
    this.mediaType,
    this.mediaUrl,
    this.mediaMimetype,
    this.mediaFilename,
  });

  factory WhatsAppMessage.fromJson(Map<String, dynamic> json) {
    return WhatsAppMessage(
      id: json['id'] as String,
      accountId: json['accountId'] as String,
      clientJid: json['clientJid'] as String,
      direction: json['direction'] as String,
      body: json['body'] as String? ?? '',
      waMessageId: json['waMessageId'] as String,
      status: json['status'] as String? ?? 'delivered',
      messageType: json['messageType'] as String? ?? 'text',
      tsClient: json['tsClient'] as String?,
      tsServer: json['tsServer'] as String?,
      createdAt: json['createdAt'] as String?,
      deliveredAt: json['deliveredAt'] as String?,
      readAt: json['readAt'] as String?,
      updatedAt: json['updatedAt'] as String?,
      syncedAt: json['syncedAt'] as String?,
      syncSource: json['syncSource'] as String?,
      mediaType: json['mediaType'] as String?,
      mediaUrl: json['mediaUrl'] as String?,
      mediaMimetype: json['mediaMimetype'] as String?,
      mediaFilename: json['mediaFilename'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'accountId': accountId,
      'clientJid': clientJid,
      'direction': direction,
      'body': body,
      'waMessageId': waMessageId,
      'status': status,
      'messageType': messageType,
      if (tsClient != null) 'tsClient': tsClient,
      if (tsServer != null) 'tsServer': tsServer,
      if (createdAt != null) 'createdAt': createdAt,
      if (deliveredAt != null) 'deliveredAt': deliveredAt,
      if (readAt != null) 'readAt': readAt,
      if (updatedAt != null) 'updatedAt': updatedAt,
      if (syncedAt != null) 'syncedAt': syncedAt,
      if (syncSource != null) 'syncSource': syncSource,
      if (mediaType != null) 'mediaType': mediaType,
      if (mediaUrl != null) 'mediaUrl': mediaUrl,
      if (mediaMimetype != null) 'mediaMimetype': mediaMimetype,
      if (mediaFilename != null) 'mediaFilename': mediaFilename,
    };
  }

  bool get isInbound => direction == 'inbound';
  bool get isOutbound => direction == 'outbound';
  bool get isRead => status == 'read';
  bool get isDelivered => status == 'delivered' || status == 'read';
  bool get isSent => status == 'sent' || status == 'delivered' || status == 'read';
}
```

---

## 9. POST /api/whatsapp/send-message

**Method:** `POST`  
**Auth:** Firebase ID token required (rate limited)  
**Request:**
```json
{
  "accountId": "account_prod_abc123",
  "to": "40712345678@s.whatsapp.net",
  "message": "Hello from Flutter!"
}
```

**Response (if connected):**
```json
{
  "success": true,
  "messageId": "3EB0XYZ789",
  "status": "sent"
}
```

**Response (if queued):**
```json
{
  "success": true,
  "queued": true,
  "messageId": "msg_1234567890_abc123",
  "clientMessageId": "client_1234567890_def456"
}
```

---

## 10. POST /api/whatsapp/regenerate-qr/:accountId (legacy)

**Method:** `POST`  
**Auth:** Firebase ID token required (**admin only**, rate limited)  
**Response:**
```json
{
  "success": true,
  "message": "QR regeneration started"
}
```

---

## 11. POST /api/whatsapp/backfill/:accountId

**Method:** `POST`  
**Auth:** Firebase ID token required (**admin only**, rate limited)  
**Response:**
```json
{
  "success": true,
  "message": "Backfill started (runs asynchronously)",
  "accountId": "account_prod_abc123"
}
```

---

## 12. GET /api/status/dashboard

**Method:** `GET`  
**Auth:** None required  
**Response:**

```json
{
  "timestamp": "2026-01-17T21:00:00.000Z",
  "service": {
    "status": "healthy",
    "uptime": 3600,
    "version": "2.0.1"
  },
  "storage": {
    "path": "/app/sessions",
    "writable": true,
    "totalAccounts": 2
  },
  "accounts": [
    {
      "accountId": "account_prod_abc123",
      "phone": "+407****5678",
      "status": "connected",
      "lastEventAt": "2026-01-17T21:00:00.000Z",
      "lastMessageAt": "2026-01-17T21:00:00.000Z",
      "lastSeen": "2026-01-17T21:00:00.000Z",
      "reconnectCount": 0,
      "reconnectAttempts": 0,
      "needsQR": false,
      "lastBackfillAt": "2026-01-17T20:30:00.000Z",
      "lastHistorySyncAt": "2026-01-17T20:30:00.000Z"
    }
  ],
  "summary": {
    "connected": 1,
    "connecting": 0,
    "disconnected": 0,
    "needs_qr": 1,
    "total": 2
  }
}
```

---

## Flutter Integration Summary

### Endpoints Available (Firebase ID token required)
- ✅ `GET /api/whatsapp/accounts` → `List<WhatsAppAccount>`
- ✅ `POST /api/whatsapp/accounts` → `WhatsAppAccount`
- ✅ `POST /api/whatsapp/accounts/:id/connect` → `{ success, status }` (**admin**)
- ✅ `GET /api/whatsapp/accounts/:id/qr` → `{ qrDataUrl, qrPngBase64 }` (**admin**)
- ✅ `GET /api/whatsapp/threads/:accountId` → `List<WhatsAppThread>`
- ✅ `GET /api/whatsapp/messages/:accountId/:threadId` → `List<WhatsAppMessage>`
- ✅ `POST /api/whatsapp/send-message` → `{ success, messageId, status }`
- ✅ `POST /api/whatsapp/regenerate-qr/:accountId` → `{ success }` (**admin**, legacy)
- ✅ `POST /api/whatsapp/backfill/:accountId` → `{ success }` (**admin**)
- ✅ `GET /api/status/dashboard` → Dashboard summary

### Flow "Cap-Coadă" în Flutter

1. **Pair Account (QR)**
   - `POST /api/whatsapp/accounts` → obții `accountId`
   - `POST /api/whatsapp/accounts/:id/connect` (admin)
   - `GET /api/whatsapp/accounts/:id/qr` (admin) → `qrDataUrl`
   - Afișezi QR în Flutter (data URL base64)
   - Pollezi `GET /api/whatsapp/accounts` până `status = "connected"`

2. **Sync Conversații (History)**
   - Automat după pairing (backend ascultă `messaging-history.set`)
   - Verifici `lastHistorySyncAt` în account
   - Opțional: `POST /api/whatsapp/backfill/:accountId` pentru gap filling

3. **Chat (Send/Receive)**
   - `GET /api/whatsapp/threads/:accountId` → lista thread-uri
   - `GET /api/whatsapp/messages/:accountId/:threadId` → lista mesaje
   - `POST /api/whatsapp/send-message` → trimite mesaj
   - Pollezi messages API (1-2s) pentru mesaje noi + status updates

---

**END OF API JSON EXAMPLES**
