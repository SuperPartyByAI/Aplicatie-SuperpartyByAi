import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state_provider.dart';
import '../../services/firebase_service.dart';

/// Admin-only screen for migrating Firestore documents from RO schema to EN schema
class FirestoreMigrationScreen extends StatefulWidget {
  const FirestoreMigrationScreen({super.key});

  @override
  State<FirestoreMigrationScreen> createState() => _FirestoreMigrationScreenState();
}

class _FirestoreMigrationScreenState extends State<FirestoreMigrationScreen> {
  bool _onlyMissingFields = true;
  bool _isRunning = false;
  bool _isDryRun = false;
  String _statusText = '';
  int _totalDocs = 0;
  int _needsMigration = 0;
  int _processed = 0;
  int _updated = 0;
  int _skipped = 0;
  int _errors = 0;
  List<String> _sampleIds = [];
  List<String> _errorLog = [];

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppStateProvider>(context, listen: false);
    
    // Admin-only access
    if (!appState.isAdminMode && !appState.isGmMode) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Firestore Migration'),
          backgroundColor: Colors.red,
        ),
        body: const Center(
          child: Text(
            '⛔ Acces interzis! Doar administratorul poate accesa această pagină.',
            style: TextStyle(fontSize: 16, color: Colors.red),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Firestore Migration Tool'),
        backgroundColor: const Color(0xFFDC2626),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Migrare schema RO → EN pentru colecția "evenimente"',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Acest tool normalizează documentele din schema română (RO) la schema engleză (EN). '
              'Operațiunea este idempotentă (poate fi rulată de mai multe ori).',
              style: TextStyle(fontSize: 14, color: Colors.grey),
            ),
            const SizedBox(height: 24),
            
            // Options
            CheckboxListTile(
              title: const Text('Doar câmpuri lipsă (recomandat)'),
              subtitle: const Text('Nu suprascrie valori existente în schema EN'),
              value: _onlyMissingFields,
              onChanged: _isRunning ? null : (value) {
                setState(() => _onlyMissingFields = value ?? true);
              },
            ),
            const SizedBox(height: 16),
            
            // Buttons
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isRunning ? null : _runDryRun,
                    icon: const Icon(Icons.search),
                    label: const Text('Dry Run (Scan)'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isRunning ? null : _runMigration,
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('Run Migration'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            
            // Status
            if (_statusText.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey[200],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _statusText,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                    ),
                    if (_isRunning)
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: LinearProgressIndicator(),
                      ),
                  ],
                ),
              ),
            
            // Statistics
            if (_totalDocs > 0) ...[
              const SizedBox(height: 24),
              const Divider(),
              const Text(
                'Statistici:',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              _buildStatRow('Total documente:', _totalDocs.toString()),
              _buildStatRow('Necesită migrare:', _needsMigration.toString()),
              if (_isDryRun && _sampleIds.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text('Exemple ID-uri:', style: TextStyle(fontWeight: FontWeight.bold)),
                ..._sampleIds.take(20).map((id) => Text('  • $id', style: const TextStyle(fontFamily: 'monospace', fontSize: 12))),
              ],
              if (!_isDryRun) ...[
                _buildStatRow('Procesate:', _processed.toString()),
                _buildStatRow('Actualizate:', _updated.toString(), Colors.green),
                _buildStatRow('Sărite:', _skipped.toString(), Colors.orange),
                _buildStatRow('Erori:', _errors.toString(), Colors.red),
              ],
            ],
            
            // Error log
            if (_errorLog.isNotEmpty) ...[
              const SizedBox(height: 24),
              const Divider(),
              const Text(
                'Erori:',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.red),
              ),
              const SizedBox(height: 8),
              Container(
                constraints: const BoxConstraints(maxHeight: 200),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red[200]!),
                ),
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _errorLog.length,
                  itemBuilder: (context, index) {
                    return Text(
                      _errorLog[index],
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: Colors.red),
                    );
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatRow(String label, String value, [Color? color]) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _runDryRun() async {
    setState(() {
      _isRunning = true;
      _isDryRun = true;
      _statusText = 'Scanning documents...';
      _totalDocs = 0;
      _needsMigration = 0;
      _sampleIds = [];
      _errorLog = [];
    });

    try {
      final firestore = FirebaseService.firestore;
      final collection = firestore.collection('evenimente');
      
      QuerySnapshot? snapshot;
      DocumentSnapshot? lastDoc;
      
      do {
        Query query = collection.limit(200);
        if (lastDoc != null) {
          query = query.startAfterDocument(lastDoc);
        }
        
        snapshot = await query.get();
        
        for (var doc in snapshot.docs) {
          _totalDocs++;
          final patch = _buildPatch(doc.data() as Map<String, dynamic>, doc.id);
          
          if (patch.isNotEmpty) {
            _needsMigration++;
            if (_sampleIds.length < 20) {
              _sampleIds.add(doc.id);
            }
          }
        }
        
        if (snapshot.docs.isNotEmpty) {
          lastDoc = snapshot.docs.last;
        }
        
        setState(() {
          _statusText = 'Scanned $_totalDocs documents, $_needsMigration need migration...';
        });
      } while (snapshot.docs.length == 200);
      
      setState(() {
        _statusText = '✅ Scan complete: $_totalDocs total, $_needsMigration need migration';
        _isRunning = false;
      });
    } catch (e) {
      setState(() {
        _statusText = '❌ Error: $e';
        _errorLog.add('Dry run error: $e');
        _isRunning = false;
      });
    }
  }

  Future<void> _runMigration() async {
    if (_needsMigration == 0 && _totalDocs == 0) {
      // Run scan first
      await _runDryRun();
      if (_needsMigration == 0) {
        setState(() {
          _statusText = '✅ No documents need migration';
        });
        return;
      }
    }

    setState(() {
      _isRunning = true;
      _isDryRun = false;
      _statusText = 'Starting migration...';
      _processed = 0;
      _updated = 0;
      _skipped = 0;
      _errors = 0;
      _errorLog = [];
    });

    try {
      final firestore = FirebaseService.firestore;
      final collection = firestore.collection('evenimente');
      
      QuerySnapshot? snapshot;
      DocumentSnapshot? lastDoc;
      WriteBatch? batch;
      int batchSize = 0;
      const maxBatchSize = 400; // Stay under 500 limit
      
      do {
        Query query = collection.limit(200);
        if (lastDoc != null) {
          query = query.startAfterDocument(lastDoc);
        }
        
        snapshot = await query.get();
        
        for (var doc in snapshot.docs) {
          _processed++;
          
          try {
            final data = doc.data() as Map<String, dynamic>;
            final patch = _buildPatch(data, doc.id);
            
            if (patch.isEmpty) {
              _skipped++;
              continue;
            }
            
            // Initialize batch if needed
            if (batch == null || batchSize >= maxBatchSize) {
              if (batch != null) {
                await batch.commit();
              }
              batch = firestore.batch();
              batchSize = 0;
            }
            
            // Add update to batch
            final docRef = collection.doc(doc.id);
            batch.update(docRef, patch);
            batchSize++;
            _updated++;
            
            // Update status every 10 docs
            if (_processed % 10 == 0) {
              setState(() {
                _statusText = 'Processed: $_processed | Updated: $_updated | Skipped: $_skipped | Errors: $_errors';
              });
            }
          } catch (e) {
            _errors++;
            _errorLog.add('Error on ${doc.id}: $e');
            if (_errorLog.length > 50) {
              _errorLog.removeAt(0); // Keep last 50 errors
            }
          }
        }
        
        // Commit remaining batch
        if (batch != null && batchSize > 0) {
          await batch.commit();
          batch = null;
          batchSize = 0;
        }
        
        if (snapshot.docs.isNotEmpty) {
          lastDoc = snapshot.docs.last;
        }
        
        setState(() {
          _statusText = 'Processed: $_processed | Updated: $_updated | Skipped: $_skipped | Errors: $_errors';
        });
      } while (snapshot.docs.length == 200);
      
      setState(() {
        _statusText = '✅ Migration complete: $_processed processed, $_updated updated, $_skipped skipped, $_errors errors';
        _isRunning = false;
      });
    } catch (e) {
      setState(() {
        _statusText = '❌ Migration error: $e';
        _errorLog.add('Migration error: $e');
        _isRunning = false;
      });
    }
  }

  /// Build patch map with only missing EN fields that can be derived from RO fields
  Map<String, dynamic> _buildPatch(Map<String, dynamic> data, String docId) {
    final patch = <String, dynamic>{};
    
    // 1) isArchived: map from "este arhivat" (RO) if missing
    if (!data.containsKey('isArchived') || (_onlyMissingFields && data['isArchived'] == null)) {
      if (data.containsKey('este arhivat') && data['este arhivat'] is bool) {
        patch['isArchived'] = data['este arhivat'] as bool;
      }
    }
    
    // 2) address: map from "adresa" (RO) if missing
    final addressValue = data['address'] as String?;
    if (!data.containsKey('address') || (_onlyMissingFields && (addressValue?.isEmpty ?? true))) {
      if (data.containsKey('adresa') && data['adresa'] is String) {
        final adresa = data['adresa'] as String;
        if (adresa.isNotEmpty) {
          patch['address'] = adresa;
        }
      }
    }
    
    // 3) date: map from "data" (RO) if missing, or convert Timestamp
    final dateValue = data['date'] as String?;
    if (!data.containsKey('date') || (_onlyMissingFields && (dateValue?.isEmpty ?? true))) {
      if (data.containsKey('data') && data['data'] is String) {
        final dataStr = data['data'] as String;
        if (dataStr.isNotEmpty) {
          patch['date'] = dataStr;
        }
      } else if (data.containsKey('date') && data['date'] is Timestamp) {
        // Convert Timestamp to DD-MM-YYYY
        final timestamp = (data['date'] as Timestamp).toDate();
        patch['date'] = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
      } else if (data.containsKey('data') && data['data'] is Timestamp) {
        final timestamp = (data['data'] as Timestamp).toDate();
        patch['date'] = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
      }
    }
    
    // 4) schemaVersion: set to 3 if missing
    if (!data.containsKey('schemaVersion') || (_onlyMissingFields && data['schemaVersion'] == null)) {
      patch['schemaVersion'] = 3;
    }
    
    // 5) roles: convert from "roluriDupă slot" (RO Map) to "roles" (EN List)
    final rolesValue = data['roles'] as List?;
    if (!data.containsKey('roles') || (_onlyMissingFields && (rolesValue?.isEmpty ?? true))) {
      if (data.containsKey('roluriDupă slot') && data['roluriDupă slot'] is Map) {
        final rolesList = _convertRoluriDupaSlot(data['roluriDupă slot'] as Map<String, dynamic>);
        if (rolesList.isNotEmpty) {
          patch['roles'] = rolesList;
        }
      } else if (data.containsKey('roluriDupa slot') && data['roluriDupa slot'] is Map) {
        // Alternative spelling without diacritics
        final rolesList = _convertRoluriDupaSlot(data['roluriDupa slot'] as Map<String, dynamic>);
        if (rolesList.isNotEmpty) {
          patch['roles'] = rolesList;
        }
      }
    }
    
    // 6) archivedAt / archivedBy: map from RO fields
    if (!data.containsKey('archivedAt') || (_onlyMissingFields && data['archivedAt'] == null)) {
      if (data.containsKey('arhivatLa') && data['arhivatLa'] is Timestamp) {
        patch['archivedAt'] = data['arhivatLa'] as Timestamp;
      }
    }
    final archivedByValue = data['archivedBy'] as String?;
    if (!data.containsKey('archivedBy') || (_onlyMissingFields && (archivedByValue?.isEmpty ?? true))) {
      if (data.containsKey('arhivatDe') && data['arhivatDe'] is String) {
        final arhivatDe = data['arhivatDe'] as String;
        if (arhivatDe.isNotEmpty) {
          patch['archivedBy'] = arhivatDe;
        }
      }
    }
    
    return patch;
  }

  /// Convert "roluriDupă slot" Map to "roles" List
  List<Map<String, dynamic>> _convertRoluriDupaSlot(Map<String, dynamic> roluriMap) {
    final rolesList = <Map<String, dynamic>>[];
    
    roluriMap.forEach((slotKey, slotData) {
      if (slotData is! Map<String, dynamic>) return;
      
      final slot = slotKey; // e.g., "01A", "01B"
      final detalii = slotData['detalii'] as Map<String, dynamic>?;
      final resurse = slotData['resurse'] as List<dynamic>?;
      
      // Extract from detalii
      final label = detalii?['eticheta'] as String? ?? '';
      final durationMin = (detalii?['duratăMin'] as num?)?.toInt() ?? 
                          (detalii?['durataMin'] as num?)?.toInt() ?? 0;
      
      // Extract from resurse[0] if available
      String? startTime;
      String? assignedCode;
      
      if (resurse != null && resurse.isNotEmpty && resurse[0] is Map<String, dynamic>) {
        final resursa = resurse[0] as Map<String, dynamic>;
        startTime = resursa['Ora de început'] as String? ?? 
                    resursa['Ora de inceput'] as String?;
        assignedCode = resursa['Cod atribuit'] as String?;
      }
      
      // Build role map
      final roleMap = <String, dynamic>{
        'slot': slot,
        'label': label,
        'time': startTime ?? '00:00',
        'durationMin': durationMin,
      };
      
      if (assignedCode != null && assignedCode.isNotEmpty) {
        roleMap['assignedCode'] = assignedCode;
      }
      // Note: pendingCode is not in RO schema, so we don't set it
      
      rolesList.add(roleMap);
    });
    
    return rolesList;
  }
}
