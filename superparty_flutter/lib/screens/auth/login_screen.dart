import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../services/force_update_checker_service.dart';
import '../../widgets/force_update_dialog.dart';

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
      final email = _emailController.text.trim();
      final password = _passwordController.text;

      if (email.isEmpty || password.isEmpty) {
        setState(() => _error = 'Email și parola sunt obligatorii.');
        return;
      }

      if (_isRegister) {
        final phone = _phoneController.text.trim();
        final password2 = _password2Controller.text;

        if (phone.isEmpty) {
          setState(() => _error = 'Telefonul este obligatoriu.');
          return;
        }
        if (password2.isEmpty) {
          setState(() => _error = 'Confirmă parola.');
          return;
        }
        if (password != password2) {
          setState(() => _error = 'Parolele nu coincid.');
          return;
        }

        // Create user in Firebase Auth
        final userCredential = await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: email,
          password: password,
        );
        final user = userCredential.user!;

        // Send email verification
        await user.sendEmailVerification();

        // Create document in Firestore
        await FirebaseFirestore.instance.collection('users').doc(user.uid).set({
          'uid': user.uid,
          'email': email,
          'phone': phone,
          'status': 'kyc_required',
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } else {
        // Login with Firebase
        await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: email,
          password: password,
        );
      }
    } catch (e) {
      setState(() {
        _error = _translateError(e);
      });
    } finally {
      setState(() => _loading = false);
    }
  }

  String _translateError(dynamic error) {
    if (error is FirebaseAuthException) {
      switch (error.code) {
        case 'invalid-credential':
          return '❌ Email sau parolă greșită. Verifică și încearcă din nou.';
        case 'user-not-found':
          return '❌ Nu există cont cu acest email. Înregistrează-te mai întâi.';
        case 'wrong-password':
          return '❌ Parolă greșită. Verifică și încearcă din nou.';
        case 'invalid-email':
          return '❌ Email invalid. Verifică formatul email-ului.';
        case 'email-already-in-use':
          return '❌ Email-ul este deja folosit. Încearcă să te loghezi sau folosește alt email.';
        case 'weak-password':
          return '❌ Parola este prea slabă. Folosește minim 6 caractere.';
        case 'too-many-requests':
          return '❌ Prea multe încercări. Așteaptă câteva minute și încearcă din nou.';
        case 'network-request-failed':
          return '❌ Eroare de conexiune. Verifică internetul și încearcă din nou.';
      }
    }
    return error.toString();
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
                      ),
                      keyboardType: TextInputType.emailAddress,
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
