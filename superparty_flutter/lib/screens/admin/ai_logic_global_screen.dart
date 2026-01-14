import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'dart:convert';
import '../../core/auth/is_super_admin.dart';

class AiLogicGlobalScreen extends StatefulWidget {
  const AiLogicGlobalScreen({super.key});

  @override
  State<AiLogicGlobalScreen> createState() => _AiLogicGlobalScreenState();
}

class _AiLogicGlobalScreenState extends State<AiLogicGlobalScreen> {
  final _json = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _error;

  bool get _isSuperAdmin => isSuperAdmin(FirebaseAuth.instance.currentUser);

  @override
  void initState() {
    super.initState();
    _load();
  }

  static const _defaultGlobalConfig = {
    "version": 1,
    "eventSchema": {
      "required": ["date", "address"],
      "fields": {
        "date": {"type": "string", "label": "Data (DD-MM-YYYY)"},
        "address": {"type": "string", "label": "Adresă / Locație"},
        "clientPhone": {"type": "string", "label": "Telefon client"},
        "clientName": {"type": "string", "label": "Nume client"},
      }
    },
    "rolesCatalog": {
      "ANIMATOR": {
        "defaultDurationMin": 120,
        "requiredFields": ["characterName"],
        "optionalFields": ["notes"],
        "synonyms": ["animator", "mc", "host"],
        "detailsSchema": {
          "characterName": {"type": "string", "label": "Personaj"},
          "notes": {"type": "string", "label": "Observații"}
        }
      },
      "URSITOARE": {
        "defaultDurationMin": 120,
        "requiredFields": ["count"],
        "optionalFields": ["rea", "notes"],
        "synonyms": ["ursitoare", "ursitoare 3", "ursitoare 4", "ursitoare rea"],
        "detailsSchema": {
          "count": {"type": "number", "label": "Număr ursitoare (3/4)"},
          "rea": {"type": "boolean", "label": "Include Ursitoarea Rea"},
          "notes": {"type": "string", "label": "Observații"}
        }
      },
      "COTTON_CANDY": {
        "defaultDurationMin": 120,
        "requiredFields": [],
        "optionalFields": ["notes"],
        "synonyms": ["vata", "vata de zahar", "cotton candy"],
        "detailsSchema": {"notes": {"type": "string", "label": "Observații"}}
      },
      "POPCORN": {
        "defaultDurationMin": 120,
        "requiredFields": [],
        "optionalFields": ["notes"],
        "synonyms": ["popcorn"],
        "detailsSchema": {"notes": {"type": "string", "label": "Observații"}}
      },
      "ARCADE": {
        "defaultDurationMin": 180,
        "requiredFields": [],
        "optionalFields": ["notes"],
        "synonyms": ["arcade", "jocuri", "console"],
        "detailsSchema": {"notes": {"type": "string", "label": "Observații"}}
      },
      "DECORATIONS": {
        "defaultDurationMin": 0,
        "requiredFields": [],
        "optionalFields": ["theme", "notes"],
        "synonyms": ["decor", "decoratiuni", "decorations"],
        "detailsSchema": {
          "theme": {"type": "string", "label": "Temă"},
          "notes": {"type": "string", "label": "Observații"}
        }
      },
      "BALLOONS": {
        "defaultDurationMin": 0,
        "requiredFields": [],
        "optionalFields": ["count", "notes"],
        "synonyms": ["baloane", "balloons"],
        "detailsSchema": {
          "count": {"type": "number", "label": "Nr. baloane"},
          "notes": {"type": "string", "label": "Observații"}
        }
      },
      "HELIUM_BALLOONS": {
        "defaultDurationMin": 0,
        "requiredFields": [],
        "optionalFields": ["count", "notes"],
        "synonyms": ["baloane cu heliu", "helium balloons"],
        "detailsSchema": {
          "count": {"type": "number", "label": "Nr. baloane cu heliu"},
          "notes": {"type": "string", "label": "Observații"}
        }
      },
      "SANTA_CLAUS": {
        "defaultDurationMin": 60,
        "requiredFields": [],
        "optionalFields": ["notes"],
        "synonyms": ["mos craciun", "santa"],
        "detailsSchema": {"notes": {"type": "string", "label": "Observații"}}
      },
      "DRY_ICE": {
        "defaultDurationMin": 0,
        "requiredFields": [],
        "optionalFields": ["notes"],
        "synonyms": ["gheata carbonica", "dry ice"],
        "detailsSchema": {"notes": {"type": "string", "label": "Observații"}}
      }
    },
    "policies": {"requireConfirm": true, "askOneQuestion": true},
    "systemPrompt": null,
    "systemPromptAppend": null,
    "uiTemplates": {}
  };

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final publicSnap = await FirebaseFirestore.instance
          .collection('ai_config')
          .doc('global')
          .get();
      final privateSnap = await FirebaseFirestore.instance
          .collection('ai_config_private')
          .doc('global')
          .get();
      final publicData = publicSnap.data() ?? <String, dynamic>{};
      final privateData = privateSnap.data() ?? <String, dynamic>{};

      final merged = <String, dynamic>{}
        ..addAll(_defaultGlobalConfig)
        ..addAll(publicData)
        ..addAll(privateData);
      // keep max version as display-only convenience
      final vPub = (publicData['version'] is num) ? (publicData['version'] as num).toInt() : 0;
      final vPriv = (privateData['version'] is num) ? (privateData['version'] as num).toInt() : 0;
      merged['version'] = (vPub > vPriv) ? vPub : vPriv;

      final effective = (publicData.isEmpty && privateData.isEmpty) ? _defaultGlobalConfig : merged;
      _json.text = const JsonEncoder.withIndent('  ').convert(effective);
    } catch (e) {
      _error = e.toString();
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Map<String, dynamic> _publicPart(Map<String, dynamic> cfg) {
    return <String, dynamic>{
      'eventSchema': cfg['eventSchema'],
      'rolesCatalog': cfg['rolesCatalog'],
      'uiTemplates': cfg['uiTemplates'] ?? <String, dynamic>{},
    };
  }

  Map<String, dynamic> _privatePart(Map<String, dynamic> cfg) {
    return <String, dynamic>{
      'policies': cfg['policies'] ?? <String, dynamic>{},
      'systemPrompt': cfg['systemPrompt'],
      'systemPromptAppend': cfg['systemPromptAppend'],
    };
  }

  Future<void> _save() async {
    if (!_isSuperAdmin) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final parsed = jsonDecode(_json.text) as Map<String, dynamic>;
      final uid = FirebaseAuth.instance.currentUser?.uid;

      final publicRef =
          FirebaseFirestore.instance.collection('ai_config').doc('global');
      final privateRef =
          FirebaseFirestore.instance.collection('ai_config_private').doc('global');

      final publicSnap = await publicRef.get();
      final privateSnap = await privateRef.get();
      final publicData = publicSnap.data();
      final privateData = privateSnap.data();
      final vPub = (publicData?['version'] is num)
          ? (publicData!['version'] as num).toInt()
          : 0;
      final vPriv = (privateData?['version'] is num)
          ? (privateData!['version'] as num).toInt()
          : 0;

      final publicPart = _publicPart(parsed)
        ..['version'] = vPub + 1
        ..['updatedAt'] = FieldValue.serverTimestamp()
        ..['updatedBy'] = uid;
      final privatePart = _privatePart(parsed)
        ..['version'] = vPriv + 1
        ..['updatedAt'] = FieldValue.serverTimestamp()
        ..['updatedBy'] = uid;

      await publicRef.set(publicPart, SetOptions(merge: true));
      await privateRef.set(privatePart, SetOptions(merge: true));

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Salvat ai_config/global')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (!mounted) return;
      setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _json.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canEdit = _isSuperAdmin;
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Logic (Global)'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            onPressed: (!canEdit || _saving || _loading) ? null : _save,
            icon: const Icon(Icons.save),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (!canEdit)
                    const Text(
                      'Doar super-admin poate edita.',
                      style: TextStyle(color: Colors.red),
                    ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(_error!, style: const TextStyle(color: Colors.red)),
                    ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: TextField(
                      controller: _json,
                      decoration: const InputDecoration(
                        labelText: 'ai_config/global (JSON)',
                        alignLabelWithHint: true,
                      ),
                      enabled: canEdit,
                      maxLines: null,
                      expands: true,
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

