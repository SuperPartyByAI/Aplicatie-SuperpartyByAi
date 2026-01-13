import 'dart:async';
import 'dart:ui' show PlatformDispatcher;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;

import 'services/firebase_service.dart';
import 'services/background_service.dart';
import 'services/push_notification_service.dart';
import 'app/app_shell.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Global error handlers for debugging
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    if (kDebugMode) {
      debugPrint('[FlutterError] Exception: ${details.exceptionAsString()}');
      debugPrint('[FlutterError] Library: ${details.library}');
      debugPrint('[FlutterError] Context: ${details.context}');
      debugPrint('[FlutterError] Stack: ${details.stack}');
      debugPrint('[FlutterError] Information: ${details.informationCollector?.call()}');
    }
  };
  
  // ErrorWidget builder pentru debug (doar în debug mode)
  ErrorWidget.builder = (FlutterErrorDetails details) {
    if (kDebugMode) {
      debugPrint('[ErrorWidget] Building error widget for: ${details.exceptionAsString()}');
      debugPrint('[ErrorWidget] Stack: ${details.stack}');
    }
    return ErrorWidget(details.exception);
  };
  
  PlatformDispatcher.instance.onError = (error, stack) {
    if (kDebugMode) {
      debugPrint('[UncaughtError] $error');
      debugPrint('[UncaughtError] Stack: $stack');
    }
    return true;
  };
  
  // FAIL-SAFE: Initialize Firebase with error handling and timeout
  // App can run with limited functionality if Firebase fails
  try {
    if (kDebugMode) debugPrint('[Main] Initializing Firebase...');
    await FirebaseService.initialize()
        .timeout(const Duration(seconds: 10));
    if (kDebugMode) debugPrint('[Main] ✅ Firebase initialized successfully');
  } catch (e, stackTrace) {
    if (kDebugMode) {
      debugPrint('[Main] ❌ Firebase initialization failed: $e');
      debugPrint('[Main] Stack trace: $stackTrace');
      debugPrint('[Main] ⚠️ App will continue with limited functionality');
      debugPrint('[Main] ℹ️ Features requiring Firebase will be unavailable');
    }
  }
  
  // FAIL-SAFE: Background service is optional (mobile only)
  if (!kIsWeb) {
    try {
      if (kDebugMode) debugPrint('[Main] Initializing background service...');
      await BackgroundService.initialize();
      if (kDebugMode) debugPrint('[Main] ✅ Background service initialized');
    } catch (e) {
      if (kDebugMode) debugPrint('[Main] ⚠️ Background service init error (non-critical): $e');
    }
  } else {
    if (kDebugMode) debugPrint('[Main] ℹ️ Background service skipped (not supported on web)');
  }
  
  // FAIL-SAFE: Push notifications are optional (mobile only)
  if (!kIsWeb) {
    try {
      if (kDebugMode) debugPrint('[Main] Initializing push notifications...');
      await PushNotificationService.initialize();
      if (kDebugMode) debugPrint('[Main] ✅ Push notifications initialized');
    } catch (e) {
      if (kDebugMode) debugPrint('[Main] ⚠️ Push notification init error (non-critical): $e');
    }
  } else {
    if (kDebugMode) debugPrint('[Main] ℹ️ Push notifications skipped (not supported on web)');
  }
  
  if (kDebugMode) debugPrint('[Main] Starting app...');
  runApp(const AppShell());
}