import 'package:flutter/material.dart';

/// Centralized theme matching the Evenimente screen visual style
/// 
/// Colors extracted from evenimente_screen.dart:
/// - Background: #0B1220 (--bg)
/// - Gradient top: #111C35 (--bg2)
/// - Text: #EAF1FF (--text)
/// - Accent: #4ECDC4 (--accent)
/// - Error: #FF7878 (--bad)
/// - Borders/overlays with various alpha values
class AppTheme {
  AppTheme._();

  // Core color tokens (from Evenimente screen)
  static const Color _backgroundBase = Color(0xFF0B1220); // --bg
  static const Color _backgroundGradientTop = Color(0xFF111C35); // --bg2
  static const Color _textPrimary = Color(0xFFEAF1FF); // --text
  static const Color _accent = Color(0xFF4ECDC4); // --accent
  static const Color _error = Color(0xFFFF7878); // --bad

  /// Dark theme matching Evenimente screen
  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      
      // Scaffold background (matches Evenimente)
      scaffoldBackgroundColor: _backgroundBase,
      
      // Color scheme
      colorScheme: const ColorScheme.dark(
        primary: _accent,
        secondary: _accent,
        error: _error,
        surface: _backgroundGradientTop,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onError: Colors.white,
        onSurface: _textPrimary,
        brightness: Brightness.dark,
      ),
      
      // AppBar theme (matches Evenimente sticky header)
      appBarTheme: AppBarTheme(
        backgroundColor: _backgroundBase.withValues(alpha: 0.72),
        foregroundColor: _textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: const TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.2,
          color: _textPrimary,
        ),
      ),
      
      // Card theme (for modals, dialogs, etc.)
      cardTheme: CardThemeData(
        color: _backgroundGradientTop,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(
            color: Color(0x24FFFFFF), // rgba(255,255,255,0.14)
            width: 1,
          ),
        ),
      ),
      
      // Dialog theme
      dialogTheme: DialogThemeData(
        backgroundColor: _backgroundGradientTop,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(
            color: Color(0x24FFFFFF),
            width: 1,
          ),
        ),
        titleTextStyle: const TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w900,
          color: _textPrimary,
        ),
        contentTextStyle: TextStyle(
          fontSize: 14,
          color: _textPrimary.withValues(alpha: 0.9),
        ),
      ),
      
      // Bottom sheet theme
      bottomSheetTheme: const BottomSheetThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
      ).copyWith(
        backgroundColor: _backgroundGradientTop,
      ),
      
      // Input decoration theme (matches Evenimente filter inputs)
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0x0FFFFFFF), // rgba(255,255,255,0.06)
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: Color(0x24FFFFFF), // rgba(255,255,255,0.14)
            width: 1,
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: Color(0x24FFFFFF),
            width: 1,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: _accent,
            width: 1.5,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: _error,
            width: 1,
          ),
        ),
        hintStyle: TextStyle(
          color: _textPrimary.withValues(alpha: 0.55),
          fontSize: 12,
        ),
        labelStyle: TextStyle(
          color: _textPrimary.withValues(alpha: 0.9),
          fontSize: 12,
        ),
      ),
      
      // SnackBar theme (matches Evenimente success/error messages)
      snackBarTheme: const SnackBarThemeData(
        contentTextStyle: TextStyle(
          color: _textPrimary,
          fontSize: 14,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
        ),
        behavior: SnackBarBehavior.floating,
      ).copyWith(
        backgroundColor: _backgroundGradientTop,
      ),
      
      // Divider theme
      dividerTheme: const DividerThemeData(
        color: Color(0x14FFFFFF), // rgba(255,255,255,0.08)
        thickness: 1,
        space: 1,
      ),
      
      // Icon theme
      iconTheme: const IconThemeData(
        color: _textPrimary,
        size: 24,
      ),
      
      // Elevated button theme (matches Evenimente CTA buttons)
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: _accent,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      
      // Text button theme
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: _accent,
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      
      // Text theme
      textTheme: const TextTheme(
        displayLarge: TextStyle(color: _textPrimary),
        displayMedium: TextStyle(color: _textPrimary),
        displaySmall: TextStyle(color: _textPrimary),
        headlineLarge: TextStyle(color: _textPrimary),
        headlineMedium: TextStyle(color: _textPrimary),
        headlineSmall: TextStyle(color: _textPrimary),
        titleLarge: TextStyle(color: _textPrimary),
        titleMedium: TextStyle(color: _textPrimary),
        titleSmall: TextStyle(color: _textPrimary),
        bodyLarge: TextStyle(color: _textPrimary),
        bodyMedium: TextStyle(color: _textPrimary),
        bodySmall: TextStyle(color: _textPrimary),
        labelLarge: TextStyle(color: _textPrimary),
        labelMedium: TextStyle(color: _textPrimary),
        labelSmall: TextStyle(color: _textPrimary),
      ),
      
      // Dropdown menu theme (matches Evenimente date filter)
      dropdownMenuTheme: DropdownMenuThemeData(
        menuStyle: MenuStyle(
          backgroundColor: WidgetStateProperty.all(_backgroundGradientTop),
          elevation: WidgetStateProperty.all(0),
        ),
        textStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w900,
          color: _textPrimary,
          letterSpacing: 0.15,
        ),
      ),
      
      // Progress indicator theme
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: _accent,
      ),
    );
  }

  /// Light theme (minimal, for system light mode fallback)
  /// Note: App is primarily dark, but this ensures no crashes in light mode
  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFDC2626),
        brightness: Brightness.light,
      ),
    );
  }
}

/// Extension for extra color tokens used in Evenimente
/// Use via: Theme.of(context).extension<AppColors>()?.gradientStart
@immutable
class AppColors extends ThemeExtension<AppColors> {
  final Color gradientStart; // #111C35
  final Color gradientEnd; // #0B1220
  final Color borderSubtle; // rgba(255,255,255,0.08)
  final Color borderMedium; // rgba(255,255,255,0.14)
  final Color surface2; // rgba(255,255,255,0.06)
  final Color textMuted; // rgba(234,241,255,0.7)
  final Color textHint; // rgba(234,241,255,0.55)
  final Color overlayBackdrop; // rgba(11,18,32,0.72)

  const AppColors({
    required this.gradientStart,
    required this.gradientEnd,
    required this.borderSubtle,
    required this.borderMedium,
    required this.surface2,
    required this.textMuted,
    required this.textHint,
    required this.overlayBackdrop,
  });

  @override
  AppColors copyWith({
    Color? gradientStart,
    Color? gradientEnd,
    Color? borderSubtle,
    Color? borderMedium,
    Color? surface2,
    Color? textMuted,
    Color? textHint,
    Color? overlayBackdrop,
  }) {
    return AppColors(
      gradientStart: gradientStart ?? this.gradientStart,
      gradientEnd: gradientEnd ?? this.gradientEnd,
      borderSubtle: borderSubtle ?? this.borderSubtle,
      borderMedium: borderMedium ?? this.borderMedium,
      surface2: surface2 ?? this.surface2,
      textMuted: textMuted ?? this.textMuted,
      textHint: textHint ?? this.textHint,
      overlayBackdrop: overlayBackdrop ?? this.overlayBackdrop,
    );
  }

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) {
      return this;
    }
    return AppColors(
      gradientStart: Color.lerp(gradientStart, other.gradientStart, t)!,
      gradientEnd: Color.lerp(gradientEnd, other.gradientEnd, t)!,
      borderSubtle: Color.lerp(borderSubtle, other.borderSubtle, t)!,
      borderMedium: Color.lerp(borderMedium, other.borderMedium, t)!,
      surface2: Color.lerp(surface2, other.surface2, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      textHint: Color.lerp(textHint, other.textHint, t)!,
      overlayBackdrop: Color.lerp(overlayBackdrop, other.overlayBackdrop, t)!,
    );
  }

  static const dark = AppColors(
    gradientStart: Color(0xFF111C35), // --bg2
    gradientEnd: Color(0xFF0B1220), // --bg
    borderSubtle: Color(0x14FFFFFF), // rgba(255,255,255,0.08)
    borderMedium: Color(0x24FFFFFF), // rgba(255,255,255,0.14)
    surface2: Color(0x0FFFFFFF), // rgba(255,255,255,0.06)
    textMuted: Color(0xB3EAF1FF), // rgba(234,241,255,0.7)
    textHint: Color(0x8CEAF1FF), // rgba(234,241,255,0.55)
    overlayBackdrop: Color(0xB80B1220), // rgba(11,18,32,0.72)
  );
}