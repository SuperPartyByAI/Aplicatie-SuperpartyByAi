import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../services/force_update_checker_service.dart';
import '../../widgets/force_update_dialog.dart';
import '../../core/utils/email_validator.dart';
import '../../core/utils/auth_error_mapper.dart';
import '../../services/firebase_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _password2Controller = TextEditingController();
  final _phoneController = TextEditingController();
  bool _isRegister = false;
  bool _loading = false;
  String _error = '';
  bool _checkingUpdate = true;

  @override
  void initState() {
    super.initState();
    _checkForUpdates();
  }

  Future<void> _checkForUpdates() async {
    try {
      final updateChecker = ForceUpdateCheckerService();
      final isRequired = await updateChecker.needsForceUpdate();
      
      if (isRequired && mounted) {
        // Show non-dismissible update dialog
        await ForceUpdateDialog.show(context);
        return; // Don't allow login
      }
    } catch (e) {
      // Fail silently - don't block login if update check fails
      debugPrint('[LoginScreen] Update check error: $e');
    } finally {
      if (mounted) {
        setState(() => _checkingUpdate = false);
      }
    }
  }

  Future<void> _handleSubmit() async {
    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      // Normalize email: trim + lowercase
      final emailRaw = _emailController.text;
      final emailNormalized = EmailValidator.normalize(emailRaw);
      final passwordRaw = _passwordController.text;

      // Validate email format before proceeding
      if (emailNormalized.isEmpty) {
        setState(() => _error = 'Email este obligatoriu.');
        setState(() => _loading = false);
        return;
      }

      if (!EmailValidator.isValid(emailNormalized)) {
        setState(() => _error = 'Format email invalid. Verifică că ai introdus corect adresa de email.');
        setState(() => _loading = false);
        return;
      }

      // Check for password spaces (warn but don't block)
      if (passwordRaw != passwordRaw.trim()) {
        debugPrint('[Auth] ⚠️ Password contains leading/trailing spaces');
      }

      if (passwordRaw.isEmpty) {
        setState(() => _error = 'Parola este obligatorie.');
        setState(() => _loading = false);
        return;
      }

      // Check for domain typo and show confirmation dialog if found
      String finalEmail = emailNormalized;
      final suggestedEmail = EmailValidator.getSuggestedEmail(emailNormalized);
      
      if (suggestedEmail != null && suggestedEmail != emailNormalized) {
        final shouldCorrect = await _showTypoConfirmationDialog(
          original: emailNormalized,
          suggested: suggestedEmail,
        );
        
        if (!shouldCorrect) {
          // User chose to continue with typo - use original normalized email
          finalEmail = emailNormalized;
        } else {
          // User chose to correct - update email field and use suggested email
          _emailController.text = suggestedEmail;
          finalEmail = suggestedEmail;
        }
      }

      // Log authentication attempt (without password)
      final maskedEmail = EmailValidator.maskForLogging(finalEmail);
      debugPrint('[Auth] Attempting ${_isRegister ? "registration" : "login"} email=$maskedEmail');

      if (_isRegister) {
        final phone = _phoneController.text.trim();
        final password2 = _password2Controller.text;

        if (phone.isEmpty) {
          setState(() => _error = 'Telefonul este obligatoriu.');
          setState(() => _loading = false);
          return;
        }
        if (password2.isEmpty) {
          setState(() => _error = 'Confirmă parola.');
          setState(() => _loading = false);
          return;
        }
        if (passwordRaw != password2) {
          setState(() => _error = 'Parolele nu coincid.');
          setState(() => _loading = false);
          return;
        }

        // Create user in Firebase Auth with normalized email
        final userCredential = await FirebaseService.auth.createUserWithEmailAndPassword(
          email: finalEmail,
          password: passwordRaw,
        );
        final user = userCredential.user!;

        // Send email verification
        await user.sendEmailVerification();

        // Create document in Firestore with normalized email
        await FirebaseService.firestore.collection('users').doc(user.uid).set({
          'uid': user.uid,
          'email': finalEmail,
          'phone': phone,
          'status': 'kyc_required',
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });

        debugPrint('[Auth] ✅ Registration successful email=$maskedEmail uid=${user.uid}');
      } else {
        // Login with Firebase using normalized email
        await FirebaseService.auth.signInWithEmailAndPassword(
          email: finalEmail,
          password: passwordRaw,
        );

        debugPrint('[Auth] ✅ Login successful email=$maskedEmail');
      }
    } catch (e) {
      // Handle FirebaseAuthException with clear messages
      if (e is FirebaseAuthException) {
        final errorInfo = AuthErrorMapper.mapError(e);
        final maskedEmail = EmailValidator.maskForLogging(
          EmailValidator.normalize(_emailController.text),
        );
        
        // Log error (without password)
        debugPrint('[Auth] ❌ Authentication failed code=${AuthErrorMapper.getErrorCode(e)} email=$maskedEmail');

        setState(() {
          _error = errorInfo.message;
        });

        // Show reset password option if applicable
        if (errorInfo.showResetPassword && mounted && !_isRegister) {
          // Show reset password dialog after a short delay
          Future.delayed(const Duration(milliseconds: 500), () {
            if (mounted) {
              _showResetPasswordOption(errorInfo.message);
            }
          });
        }
      } else {
        // Fallback for non-Firebase errors
        final maskedEmail = EmailValidator.maskForLogging(
          EmailValidator.normalize(_emailController.text),
        );
        debugPrint('[Auth] ❌ Unexpected error email=$maskedEmail error=$e');
        
        setState(() {
          _error = 'A apărut o eroare neașteptată. Te rog încearcă din nou.';
        });
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  /// Shows confirmation dialog when domain typo is detected
  Future<bool> _showTypoConfirmationDialog({
    required String original,
    required String suggested,
  }) async {
    final parts = original.split('@');
    final originalDomain = parts.length == 2 ? parts[1] : 'unknown';
    final suggestedParts = suggested.split('@');
    final suggestedDomain = suggestedParts.length == 2 ? suggestedParts[1] : 'unknown';

    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Posibilă eroare de scriere'),
        content: RichText(
          text: TextSpan(
            style: DefaultTextStyle.of(context).style,
            children: [
              const TextSpan(text: 'Ai scris '),
              TextSpan(
                text: originalDomain,
                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.red),
              ),
              const TextSpan(text: '.\n\nVrei să folosești '),
              TextSpan(
                text: suggestedDomain,
                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green),
              ),
              const TextSpan(text: ' în schimb?'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Continuă așa'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF20C997),
            ),
            child: const Text('Corectează', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    return result ?? false;
  }

  /// Shows reset password option dialog
  void _showResetPasswordOption(String errorMessage) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ai uitat parola?'),
        content: Text(errorMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Anulează'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _handleResetPassword();
            },
            child: const Text('Resetează parola', style: TextStyle(color: Color(0xFF20C997))),
          ),
        ],
      ),
    );
  }

  /// Handles password reset flow
  Future<void> _handleResetPassword() async {
    final emailNormalized = EmailValidator.normalize(_emailController.text);

    if (!EmailValidator.isValid(emailNormalized)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Te rog introdu un email valid pentru resetarea parolei.'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    try {
      await FirebaseService.auth.sendPasswordResetEmail(email: emailNormalized);
      final maskedEmail = EmailValidator.maskForLogging(emailNormalized);
      debugPrint('[Auth] ✅ Password reset email sent email=$maskedEmail');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Email de resetare trimis! Verifică inbox-ul tău.'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      final maskedEmail = EmailValidator.maskForLogging(emailNormalized);
      debugPrint('[Auth] ❌ Password reset failed email=$maskedEmail error=$e');

      if (mounted) {
        String message = 'Nu s-a putut trimite email-ul de resetare.';
        if (e is FirebaseAuthException) {
          final errorInfo = AuthErrorMapper.mapError(e);
          message = errorInfo.message;
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Show loading while checking for updates
    if (_checkingUpdate) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: Color(0xFF20C997)),
              SizedBox(height: 16),
              Text('Verificare actualizări...'),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Card(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.celebration, size: 80, color: Color(0xFF4ECDC4)),
                    const SizedBox(height: 16),
                    Text(
                      _isRegister ? 'Create account' : 'Login',
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 32),
                    TextField(
                      controller: _emailController,
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.email),
                        hintText: 'exemplu@email.com',
                      ),
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      enableSuggestions: false,
                      onChanged: (_) {
                        // Clear error when user starts typing
                        if (_error.isNotEmpty) {
                          setState(() => _error = '');
                        }
                      },
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _passwordController,
                      decoration: const InputDecoration(
                        labelText: 'Password',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.lock),
                      ),
                      obscureText: true,
                    ),
                    if (_isRegister) ...[
                      const SizedBox(height: 16),
                      TextField(
                        controller: _password2Controller,
                        decoration: const InputDecoration(
                          labelText: 'Confirm password',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.lock_outline),
                        ),
                        obscureText: true,
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _phoneController,
                        decoration: const InputDecoration(
                          labelText: 'Phone',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.phone),
                        ),
                        keyboardType: TextInputType.phone,
                      ),
                    ],
                    if (_error.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.red.shade200),
                        ),
                        child: Text(
                          _error,
                          style: TextStyle(color: Colors.red.shade900),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        onPressed: _loading ? null : _handleSubmit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF20C997),
                        ),
                        child: _loading
                            ? const CircularProgressIndicator(color: Colors.white)
                            : Text(
                                _isRegister ? 'Register' : 'Login',
                                style: const TextStyle(fontSize: 16, color: Colors.white),
                              ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: () {
                        setState(() {
                          _isRegister = !_isRegister;
                          _error = '';
                        });
                      },
                      child: Text(
                        _isRegister ? 'Already have an account? Login' : 'Don\'t have an account? Register',
                        style: const TextStyle(color: Color(0xFF20C997)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _password2Controller.dispose();
    _phoneController.dispose();
    super.dispose();
  }
}
