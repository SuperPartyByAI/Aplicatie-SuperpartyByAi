import 'package:flutter/foundation.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'firebase_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class PushNotificationService {
  static final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  static final FlutterLocalNotificationsPlugin _localNotifications = 
      FlutterLocalNotificationsPlugin();
  
  static Function(String accountId, String threadId, String clientJid)? onMessageTap;

  static Future<void> initialize() async {
    // Request permission
    NotificationSettings settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      debugPrint('User granted permission');
      
      // Initialize local notifications
      const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosSettings = DarwinInitializationSettings();
      const initSettings = InitializationSettings(
        android: androidSettings,
        iOS: iosSettings,
      );
      
      await _localNotifications.initialize(
        initSettings,
        onDidReceiveNotificationResponse: _handleNotificationTap,
      );
      
      // Get FCM token
      String? token = await _messaging.getToken();
      if (token != null) {
        await _saveTokenToFirestore(token);
      }

      // Listen for token refresh
      _messaging.onTokenRefresh.listen(_saveTokenToFirestore);

      // Handle foreground messages
      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

      // Handle background messages
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
      
      // Handle notification tap when app was terminated
      FirebaseMessaging.instance.getInitialMessage().then((message) {
        if (message != null) {
          _handleMessageTap(message);
        }
      });
      
      // Handle notification tap when app was in background
      FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);
    }
  }

  static Future<void> _saveTokenToFirestore(String token) async {
    if (!FirebaseService.isInitialized) {
      debugPrint('[PushNotificationService] Firebase not initialized, skipping token save');
      return;
    }
    
    final user = FirebaseService.currentUser;
    if (user == null) return;

    await FirebaseService.firestore.collection('users').doc(user.uid).set({
      'fcmToken': token,
      'fcmTokenUpdatedAt': FieldValue.serverTimestamp(),
      'notificationsEnabled': true,
    }, SetOptions(merge: true));

    debugPrint('FCM Token saved: $token');
  }

  static Future<void> _handleForegroundMessage(RemoteMessage message) async {
    debugPrint('Foreground message: ${message.notification?.title}');
    
    // Show local notification for WhatsApp messages
    if (message.data['type'] == 'whatsapp_message') {
      const androidDetails = AndroidNotificationDetails(
        'whatsapp_messages',
        'WhatsApp Messages',
        channelDescription: 'Notifications for new WhatsApp messages',
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
      );
      
      const iosDetails = DarwinNotificationDetails();
      
      const notificationDetails = NotificationDetails(
        android: androidDetails,
        iOS: iosDetails,
      );
      
      await _localNotifications.show(
        message.hashCode,
        message.notification?.title ?? 'New WhatsApp Message',
        message.notification?.body ?? '',
        notificationDetails,
        payload: '${message.data['accountId']}|${message.data['threadId']}|${message.data['clientJid']}',
      );
    }
  }
  
  static void _handleNotificationTap(NotificationResponse response) {
    if (response.payload != null) {
      final parts = response.payload!.split('|');
      if (parts.length == 3 && onMessageTap != null) {
        onMessageTap!(parts[0], parts[1], parts[2]);
      }
    }
  }
  
  static void _handleMessageTap(RemoteMessage message) {
    if (message.data['type'] == 'whatsapp_message' && onMessageTap != null) {
      final accountId = message.data['accountId'] as String?;
      final threadId = message.data['threadId'] as String?;
      final clientJid = message.data['clientJid'] as String?;
      
      if (accountId != null && threadId != null && clientJid != null) {
        onMessageTap!(accountId, threadId, clientJid);
      }
    }
  }
}

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint('Background message: ${message.messageId}');
  // Background notification is handled automatically by Firebase
}
