import 'dart:io';
import 'package:flutter/foundation.dart' show kDebugMode, debugPrint;
import 'package:path/path.dart' as path;

/// Result of launching Firefox container
class LaunchResult {
  final bool success;
  final String? error;
  final int exitCode;
  final String? stdout;
  final String? stderr;

  LaunchResult({
    required this.success,
    this.error,
    required this.exitCode,
    this.stdout,
    this.stderr,
  });
}

/// Manual WhatsApp Web account model
class ManualAccount {
  final int index;
  final String label;
  final String phone;
  final String container;
  final String color;
  final String icon;

  ManualAccount({
    required this.index,
    required this.label,
    required this.phone,
    required this.container,
    required this.color,
    required this.icon,
  });

  factory ManualAccount.fromJson(Map<String, dynamic> json) {
    return ManualAccount(
      index: json['index'] as int,
      label: json['label'] as String,
      phone: json['phone'] as String,
      container: json['container'] as String,
      color: json['color'] as String,
      icon: json['icon'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'index': index,
      'label': label,
      'phone': phone,
      'container': container,
      'color': color,
      'icon': icon,
    };
  }
}

/// Service for launching WhatsApp Web in Firefox containers
class WhatsAppWebLauncher {
  static final WhatsAppWebLauncher _instance = WhatsAppWebLauncher._internal();
  factory WhatsAppWebLauncher() => _instance;
  WhatsAppWebLauncher._internal();

  static WhatsAppWebLauncher get instance => _instance;

  /// WhatsApp Web URL
  static const String _waUrl = 'https://web.whatsapp.com';

  /// Get launcher script path
  /// 
  /// Priority:
  /// 1. WA_WEB_LAUNCHER_PATH environment variable
  /// 2. Repo-relative: scripts/wa_web_launcher/firefox-container
  /// 3. Fallback to user home (for development)
  String _getLauncherScriptPath() {
    // Check environment variable first
    final envPath = Platform.environment['WA_WEB_LAUNCHER_PATH'];
    if (envPath != null && envPath.isNotEmpty) {
      if (kDebugMode) {
        debugPrint('[WhatsAppWebLauncher] Using WA_WEB_LAUNCHER_PATH: $envPath');
      }
      return envPath;
    }

    // Try repo-relative path: go up from superparty_flutter/lib to repo root
    final currentDir = Directory.current.path;
    final repoRoot = path.normalize(path.join(currentDir, '..', '..', '..'));
    final repoPath = path.join(repoRoot, 'scripts', 'wa_web_launcher', 'firefox-container');
    final absoluteRepoPath = path.absolute(repoPath);

    if (kDebugMode) {
      debugPrint('[WhatsAppWebLauncher] Using repo-relative path: $absoluteRepoPath');
    }

    return absoluteRepoPath;
  }

  /// Open WhatsApp Web in Firefox container
  /// 
  /// Returns LaunchResult with success status and error details
  Future<LaunchResult> openInFirefoxContainer(ManualAccount account) async {
    final scriptPath = _getLauncherScriptPath();

    try {
      // Check if script exists
      final scriptFile = File(scriptPath);
      if (!await scriptFile.exists()) {
        return LaunchResult(
          success: false,
          error: 'Firefox container launcher script not found at: $scriptPath',
          exitCode: -1,
        );
      }

      // Check if script is executable
      final stat = await scriptFile.stat();
      if (stat.mode & 0x111 == 0) {
        return LaunchResult(
          success: false,
          error: 'Script is not executable. Run: chmod +x $scriptPath',
          exitCode: -1,
        );
      }

      // Get signing key from environment (optional)
      final signingKey = Platform.environment['OPEN_URL_IN_CONTAINER_SIGNING_KEY'];

      // Build command arguments
      final args = [
        '--name', account.container,
        '--color', account.color,
        '--icon', account.icon,
        _waUrl,
      ];

      // Prepare environment
      final env = Map<String, String>.from(Platform.environment);
      if (signingKey != null && signingKey.isNotEmpty) {
        env['OPEN_URL_IN_CONTAINER_SIGNING_KEY'] = signingKey;
        if (kDebugMode) {
          debugPrint('[WhatsAppWebLauncher] Signing key present (${signingKey.length} chars)');
        }
      } else {
        if (kDebugMode) {
          debugPrint('[WhatsAppWebLauncher] Signing key not set - Firefox may show confirmation dialogs');
        }
      }

      // Get working directory - repo root (where scripts/wa_web_launcher/ exists)
      final currentDir = Directory.current.path;
      final repoRoot = path.normalize(path.join(currentDir, '..', '..', '..'));
      final absoluteRepoRoot = path.absolute(repoRoot);

      if (kDebugMode) {
        debugPrint('[WhatsAppWebLauncher] Executing: $scriptPath ${args.join(" ")}');
        debugPrint('[WhatsAppWebLauncher] Working directory: $absoluteRepoRoot');
        debugPrint('[WhatsAppWebLauncher] Container: ${account.container}, Color: ${account.color}, Icon: ${account.icon}');
      }

      // Execute script
      final result = await Process.run(
        scriptPath,
        args,
        environment: env,
        workingDirectory: absoluteRepoRoot,
        runInShell: false,
      );

      if (kDebugMode) {
        debugPrint('[WhatsAppWebLauncher] Script exit code: ${result.exitCode}');
        if (result.stdout.toString().isNotEmpty) {
          debugPrint('[WhatsAppWebLauncher] Script stdout: ${result.stdout}');
        }
        if (result.stderr.toString().isNotEmpty) {
          debugPrint('[WhatsAppWebLauncher] Script stderr: ${result.stderr}');
        }
      }

      if (result.exitCode == 0) {
        return LaunchResult(
          success: true,
          exitCode: result.exitCode,
          stdout: result.stdout.toString().trim(),
          stderr: result.stderr.toString().trim(),
        );
      } else {
        final stderrText = result.stderr.toString().trim();
        return LaunchResult(
          success: false,
          error: stderrText.isNotEmpty ? stderrText : result.stdout.toString().trim(),
          exitCode: result.exitCode,
          stdout: result.stdout.toString().trim(),
          stderr: stderrText,
        );
      }
    } catch (e) {
      return LaunchResult(
        success: false,
        error: 'Error opening Firefox: ${e.toString()}',
        exitCode: -1,
      );
    }
  }

  /// Run diagnostics check
  /// 
  /// Returns a list of diagnostic messages (no secrets)
  Future<List<String>> runDiagnostics() async {
    final diagnostics = <String>[];

    // Check platform
    if (!Platform.isMacOS) {
      diagnostics.add('⚠️  Platform: ${Platform.operatingSystem} (Firefox containers only supported on macOS)');
    } else {
      diagnostics.add('✅ Platform: macOS');
    }

    // Check launcher script
    final scriptPath = _getLauncherScriptPath();
    final scriptFile = File(scriptPath);
    
    if (await scriptFile.exists()) {
      diagnostics.add('✅ Launcher script exists: $scriptPath');
      
      // Check executable
      final stat = await scriptFile.stat();
      if (stat.mode & 0x111 != 0) {
        diagnostics.add('✅ Launcher script is executable');
      } else {
        diagnostics.add('❌ Launcher script is NOT executable. Run: chmod +x $scriptPath');
      }
    } else {
      diagnostics.add('❌ Launcher script NOT found: $scriptPath');
      diagnostics.add('   Expected location: scripts/wa_web_launcher/firefox-container (relative to repo root)');
      diagnostics.add('   Or set WA_WEB_LAUNCHER_PATH environment variable');
    }

    // Check signing key
    final signingKey = Platform.environment['OPEN_URL_IN_CONTAINER_SIGNING_KEY'];
    if (signingKey != null && signingKey.isNotEmpty) {
      diagnostics.add('✅ OPEN_URL_IN_CONTAINER_SIGNING_KEY is set (${signingKey.length} chars)');
    } else {
      diagnostics.add('⚠️  OPEN_URL_IN_CONTAINER_SIGNING_KEY is NOT set');
      diagnostics.add('   Firefox will show confirmation dialogs for each container open');
      diagnostics.add('   Set it in VSCode launch.json or export in terminal');
    }

    // Check Firefox installation (macOS only)
    if (Platform.isMacOS) {
      try {
        final firefoxResult = await Process.run(
          'which',
          ['firefox'],
          runInShell: false,
        );
        if (firefoxResult.exitCode == 0) {
          diagnostics.add('✅ Firefox is installed: ${firefoxResult.stdout.toString().trim()}');
        } else {
          diagnostics.add('⚠️  Firefox may not be installed (which firefox failed)');
        }
      } catch (e) {
        diagnostics.add('⚠️  Could not check Firefox installation: $e');
      }
    }

    return diagnostics;
  }
}
