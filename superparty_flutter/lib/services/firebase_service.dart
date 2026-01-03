import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class FirebaseService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static Future<void> initialize() async {
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        apiKey: 'AIzaSyDcec3QIIpqrhmGSsvAeH2qEbuDKwZFG3o',
        authDomain: 'superparty-frontend.firebaseapp.com',
        projectId: 'superparty-frontend',
        storageBucket: 'superparty-frontend.firebasestorage.app',
        messagingSenderId: '168752018174',
        appId: '1:168752018174:web:819254dcc7d58147d82baf',
        measurementId: 'G-B2HBZK3FQ7',
      ),
    );
  }

  static FirebaseAuth get auth => _auth;
  static FirebaseFirestore get firestore => _firestore;
  
  static User? get currentUser => _auth.currentUser;
  static bool get isLoggedIn => _auth.currentUser != null;
}
