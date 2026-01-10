/// Script de migrare evenimente v1 → v2
/// 
/// Rulare:
/// ```bash
/// cd superparty_flutter
/// dart run scripts/migrate_events_to_v2.dart
/// ```
/// 
/// Ce face:
/// 1. Parcurge toate documentele din colecția 'evenimente'
/// 2. Pentru documente fără schemaVersion:2:
///    - Normalizează câmpurile (data→date, adresa→address, roluri→roles)
///    - Adaugă câmpuri lipsă cu default-uri sigure
///    - Creează rol 'S' (Șofer) dacă lipsește și e necesar
/// 3. Scrie înapoi în Firestore cu schemaVersion:2

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';

void main() async {
  print('🚀 Starting migration: evenimente v1 → v2');
  
  // Initialize Firebase
  await Firebase.initializeApp();
  
  final firestore = FirebaseFirestore.instance;
  final eventsCollection = firestore.collection('evenimente');
  
  // Get all events
  final snapshot = await eventsCollection.get();
  print('📊 Found ${snapshot.docs.length} events');
  
  int migrated = 0;
  int skipped = 0;
  int errors = 0;
  
  for (final doc in snapshot.docs) {
    try {
      final data = doc.data();
      final schemaVersion = data['schemaVersion'] as int? ?? 1;
      
      if (schemaVersion == 2) {
        print('⏭️  ${doc.id}: Already v2, skipping');
        skipped++;
        continue;
      }
      
      print('🔄 ${doc.id}: Migrating v1 → v2');
      
      // Build v2 document
      final v2Data = <String, dynamic>{
        'schemaVersion': 2,
      };
      
      // Date: data (Romanian) → date (English)
      if (data.containsKey('data')) {
        if (data['data'] is String) {
          v2Data['date'] = data['data'];
        } else if (data['data'] is Timestamp) {
          final timestamp = (data['data'] as Timestamp).toDate();
          v2Data['date'] = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
        }
      } else if (data.containsKey('date')) {
        v2Data['date'] = data['date'];
      } else {
        v2Data['date'] = '01-01-2026'; // Fallback
      }
      
      // Address: adresa (Romanian) → address (English)
      v2Data['address'] = data['address'] ?? data['adresa'] ?? data['locatie'] ?? '';
      
      // Sarbatorit
      v2Data['sarbatoritNume'] = data['sarbatoritNume'] ?? data['nume'] ?? '';
      v2Data['sarbatoritVarsta'] = data['sarbatoritVarsta'] ?? 0;
      if (data.containsKey('sarbatoritDob')) {
        v2Data['sarbatoritDob'] = data['sarbatoritDob'];
      }
      
      // Cine notează (nullable)
      if (data.containsKey('cineNoteaza')) {
        v2Data['cineNoteaza'] = data['cineNoteaza'];
      }
      
      // Incasare (default safe)
      if (data.containsKey('incasare') && data['incasare'] is Map) {
        v2Data['incasare'] = data['incasare'];
      } else {
        v2Data['incasare'] = {
          'status': 'NEINCASAT',
          'metoda': null,
          'suma': 0,
        };
      }
      
      // Roles: roluri (Romanian) → roles (English)
      List<Map<String, dynamic>> roles = [];
      
      if (data.containsKey('roles') && data['roles'] is List) {
        roles = List<Map<String, dynamic>>.from(data['roles']);
      } else if (data.containsKey('roluri') && data['roluri'] is List) {
        roles = List<Map<String, dynamic>>.from(data['roluri']);
      } else if (data.containsKey('alocari') && data['alocari'] is Map) {
        // Convert v1 alocari map to roles array
        final alocari = data['alocari'] as Map<String, dynamic>;
        for (final entry in alocari.entries) {
          roles.add({
            'slot': entry.key,
            'label': entry.value['label'] ?? '',
            'time': entry.value['time'] ?? '',
            'durationMin': entry.value['durationMin'] ?? 0,
            'assignedCode': entry.value['assignedCode'],
            'pendingCode': entry.value['pendingCode'],
          });
        }
      }
      
      // Ensure driver role exists if needed
      final hasDriverRole = roles.any((r) => 
        r['slot'] == 'S' || 
        (r['label'] as String?)?.toUpperCase().contains('SOFER') == true
      );
      
      if (!hasDriverRole && (data.containsKey('sofer') || data.containsKey('soferPending'))) {
        // Add driver role
        roles.add({
          'slot': 'S',
          'label': 'Șofer',
          'time': '',
          'durationMin': 0,
          'assignedCode': data['sofer'],
          'pendingCode': data['soferPending'],
        });
        print('  ✅ Added driver role (S)');
      }
      
      v2Data['roles'] = roles;
      
      // Sofer/soferPending (backward compat)
      if (data.containsKey('sofer')) {
        v2Data['sofer'] = data['sofer'];
      }
      if (data.containsKey('soferPending')) {
        v2Data['soferPending'] = data['soferPending'];
      }
      
      // Archive fields
      v2Data['isArchived'] = data['isArchived'] ?? data['esteArhivat'] ?? false;
      if (data.containsKey('archivedAt')) {
        v2Data['archivedAt'] = data['archivedAt'];
      }
      if (data.containsKey('archivedBy')) {
        v2Data['archivedBy'] = data['archivedBy'];
      }
      if (data.containsKey('archiveReason')) {
        v2Data['archiveReason'] = data['archiveReason'];
      }
      
      // Audit fields
      v2Data['createdAt'] = data['createdAt'] ?? data['creatLa'] ?? FieldValue.serverTimestamp();
      v2Data['createdBy'] = data['createdBy'] ?? data['creatDe'] ?? '';
      v2Data['updatedAt'] = data['updatedAt'] ?? data['actualizatLa'] ?? FieldValue.serverTimestamp();
      v2Data['updatedBy'] = data['updatedBy'] ?? '';
      
      // Write back to Firestore
      await doc.reference.update(v2Data);
      
      print('  ✅ Migrated successfully');
      migrated++;
      
    } catch (e, stack) {
      print('  ❌ Error migrating ${doc.id}: $e');
      print('  Stack: $stack');
      errors++;
    }
  }
  
  print('\n📊 Migration complete:');
  print('  ✅ Migrated: $migrated');
  print('  ⏭️  Skipped (already v2): $skipped');
  print('  ❌ Errors: $errors');
}
