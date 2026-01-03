import 'dart:io';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:image_picker/image_picker.dart';

class KycScreen extends StatefulWidget {
  const KycScreen({super.key});

  @override
  State<KycScreen> createState() => _KycScreenState();
}

class _KycScreenState extends State<KycScreen> {
  final _picker = ImagePicker();
  
  // Files
  File? _idFront;
  File? _idBack;
  File? _driverLicense;
  
  // User data
  final _fullNameController = TextEditingController();
  final _cnpController = TextEditingController();
  final _genderController = TextEditingController();
  final _addressController = TextEditingController();
  final _seriesController = TextEditingController();
  final _numberController = TextEditingController();
  final _issuedAtController = TextEditingController();
  final _expiresAtController = TextEditingController();
  final _ibanController = TextEditingController();
  
  // Parent data (for minors)
  final _pFullNameController = TextEditingController();
  final _pCnpController = TextEditingController();
  final _pGenderController = TextEditingController();
  final _pAddressController = TextEditingController();
  final _pSeriesController = TextEditingController();
  final _pNumberController = TextEditingController();
  final _pIssuedAtController = TextEditingController();
  final _pExpiresAtController = TextEditingController();
  
  bool _isMinor = false;
  bool _wantsDriver = false;
  bool _aiOk = false;
  bool _pAiOk = false;
  bool _contractOpen = false;
  bool _contractScrolled = false;
  bool _contractRead = false;
  bool _contractUnderstood = false;
  bool _extractBusy = false;
  bool _extractParentBusy = false;
  bool _busy = false;
  String _error = '';
  String _extractInfo = '';
  String _extractParentInfo = '';

  @override
  void initState() {
    super.initState();
    _cnpController.addListener(_checkMinor);
  }

  void _checkMinor() {
    setState(() {
      _isMinor = _isMinorFromCnp(_cnpController.text);
    });
  }

  bool _isMinorFromCnp(String cnp) {
    if (cnp.length < 13) return false;
    final s = cnp[0];
    String? prefix;
    if (s == '1' || s == '2') prefix = '19';
    if (s == '5' || s == '6') prefix = '20';
    if (prefix == null) return false;
    
    final year = int.parse(prefix + cnp.substring(1, 3));
    final mm = int.parse(cnp.substring(3, 5));
    final dd = int.parse(cnp.substring(5, 7));
    final dob = DateTime(year, mm, dd);
    final today = DateTime.now();
    
    int age = today.year - dob.year;
    final m = today.month - dob.month;
    if (m < 0 || (m == 0 && today.day < dob.day)) age--;
    
    return age < 18;
  }

  Future<void> _pickImage(String type) async {
    final pickedFile = await _picker.pickImage(source: ImageSource.gallery);
    if (pickedFile != null) {
      setState(() {
        switch (type) {
          case 'idFront':
            _idFront = File(pickedFile.path);
            break;
          case 'idBack':
            _idBack = File(pickedFile.path);
            break;
          case 'driverLicense':
            _driverLicense = File(pickedFile.path);
            break;
        }
      });
    }
  }

  Future<void> _handleExtract() async {
    setState(() {
      _extractBusy = true;
      _extractInfo = '';
      _error = '';
    });

    try {
      if (_idFront == null || _idBack == null) {
        throw Exception('Încarcă CI față și CI verso înainte de extragere.');
      }

      setState(() => _extractInfo = 'Se încarcă imaginile...');

      final user = FirebaseAuth.instance.currentUser!;
      final frontRef = FirebaseStorage.instance
          .ref()
          .child('kyc/${user.uid}/id_front_${DateTime.now().millisecondsSinceEpoch}.jpg');
      
      await frontRef.putFile(_idFront!);
      final frontUrl = await frontRef.getDownloadURL();

      setState(() => _extractInfo = 'Se trimite la AI pentru extragere...');

      final callable = FirebaseFunctions.instance.httpsCallable('extractKYCData');
      final result = await callable.call({'imageUrl': frontUrl});

      if (result.data['success'] == true) {
        final extracted = result.data['data'];
        setState(() {
          _fullNameController.text = extracted['fullName'] ?? '';
          _cnpController.text = extracted['cnp'] ?? '';
          _seriesController.text = extracted['series'] ?? '';
          _numberController.text = extracted['number'] ?? '';
          _addressController.text = extracted['address'] ?? '';
          _extractInfo = '✅ Date extrase cu succes din CI! Verifică și confirmă.';
          _contractOpen = true;
          _contractScrolled = false;
          _contractRead = false;
          _contractUnderstood = false;
        });
      } else {
        throw Exception('Extragerea a eșuat');
      }
    } catch (err) {
      setState(() {
        _error = err.toString();
        _extractInfo = '';
      });
    } finally {
      setState(() => _extractBusy = false);
    }
  }

  Future<void> _handleSubmit() async {
    setState(() {
      _busy = true;
      _error = '';
    });

    try {
      if (!_contractRead || !_contractUnderstood) {
        throw Exception('Trebuie să citești și să înțelegi contractul.');
      }

      final user = FirebaseAuth.instance.currentUser!;
      
      // Upload all images
      String? idFrontUrl, idBackUrl, driverLicenseUrl;
      
      if (_idFront != null) {
        final ref = FirebaseStorage.instance.ref().child('kyc/${user.uid}/id_front.jpg');
        await ref.putFile(_idFront!);
        idFrontUrl = await ref.getDownloadURL();
      }
      
      if (_idBack != null) {
        final ref = FirebaseStorage.instance.ref().child('kyc/${user.uid}/id_back.jpg');
        await ref.putFile(_idBack!);
        idBackUrl = await ref.getDownloadURL();
      }
      
      if (_driverLicense != null) {
        final ref = FirebaseStorage.instance.ref().child('kyc/${user.uid}/driver_license.jpg');
        await ref.putFile(_driverLicense!);
        driverLicenseUrl = await ref.getDownloadURL();
      }

      // Prepare data
      final data = {
        'fullName': _fullNameController.text,
        'cnp': _cnpController.text,
        'gender': _genderController.text,
        'address': _addressController.text,
        'series': _seriesController.text,
        'number': _numberController.text,
        'issuedAt': _issuedAtController.text,
        'expiresAt': _expiresAtController.text,
        'iban': _ibanController.text,
        'idFrontUrl': idFrontUrl,
        'idBackUrl': idBackUrl,
        'driverLicenseUrl': driverLicenseUrl,
        'wantsDriver': _wantsDriver,
        'isMinor': _isMinor,
      };

      if (_isMinor) {
        data['parent'] = {
          'fullName': _pFullNameController.text,
          'cnp': _pCnpController.text,
          'gender': _pGenderController.text,
          'address': _pAddressController.text,
          'series': _pSeriesController.text,
          'number': _pNumberController.text,
          'issuedAt': _pIssuedAtController.text,
          'expiresAt': _pExpiresAtController.text,
        };
      }

      // Save to Firestore
      await FirebaseFirestore.instance.collection('users').doc(user.uid).update({
        'kycData': data,
        'status': 'pending',
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ KYC trimis cu succes! Așteaptă aprobarea.')),
        );
        Navigator.pop(context);
      }
    } catch (err) {
      setState(() => _error = err.toString());
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('KYC Verification'),
        backgroundColor: const Color(0xFF4ECDC4),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSection('1. Încarcă CI (față și verso)'),
            _buildImagePicker('CI Față', _idFront, () => _pickImage('idFront')),
            _buildImagePicker('CI Verso', _idBack, () => _pickImage('idBack')),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _extractBusy ? null : _handleExtract,
              icon: _extractBusy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.auto_awesome),
              label: Text(_extractBusy ? 'Extragere...' : 'Extrage date cu AI'),
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF20C997)),
            ),
            if (_extractInfo.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_extractInfo, style: const TextStyle(color: Colors.green)),
              ),
            const SizedBox(height: 24),
            _buildSection('2. Date personale'),
            _buildTextField('Nume complet', _fullNameController),
            _buildTextField('CNP', _cnpController),
            _buildTextField('Gen', _genderController),
            _buildTextField('Adresă', _addressController),
            _buildTextField('Serie CI', _seriesController),
            _buildTextField('Număr CI', _numberController),
            _buildTextField('Eliberat la', _issuedAtController),
            _buildTextField('Expiră la', _expiresAtController),
            _buildTextField('IBAN', _ibanController),
            const SizedBox(height: 24),
            CheckboxListTile(
              title: const Text('Vreau să fiu șofer'),
              value: _wantsDriver,
              onChanged: (val) => setState(() => _wantsDriver = val ?? false),
            ),
            if (_wantsDriver) ...[
              const SizedBox(height: 16),
              _buildImagePicker('Permis conducere', _driverLicense, () => _pickImage('driverLicense')),
            ],
            if (_isMinor) ...[
              const SizedBox(height: 24),
              _buildSection('3. Date părinte/tutore'),
              _buildTextField('Nume complet părinte', _pFullNameController),
              _buildTextField('CNP părinte', _pCnpController),
              _buildTextField('Gen părinte', _pGenderController),
              _buildTextField('Adresă părinte', _pAddressController),
              _buildTextField('Serie CI părinte', _pSeriesController),
              _buildTextField('Număr CI părinte', _pNumberController),
              _buildTextField('Eliberat la', _pIssuedAtController),
              _buildTextField('Expiră la', _pExpiresAtController),
            ],
            const SizedBox(height: 24),
            _buildSection('4. Contract'),
            CheckboxListTile(
              title: const Text('Am citit contractul'),
              value: _contractRead,
              onChanged: (val) => setState(() => _contractRead = val ?? false),
            ),
            CheckboxListTile(
              title: const Text('Am înțeles termenii'),
              value: _contractUnderstood,
              onChanged: (val) => setState(() => _contractUnderstood = val ?? false),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_error, style: TextStyle(color: Colors.red.shade900)),
              ),
            ],
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _busy ? null : _handleSubmit,
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF20C997)),
                child: _busy
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text('Trimite KYC', style: TextStyle(fontSize: 16, color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Text(
        title,
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4)),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController controller) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextField(
        controller: controller,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }

  Widget _buildImagePicker(String label, File? file, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: onTap,
            child: Container(
              height: 150,
              width: double.infinity,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey),
                borderRadius: BorderRadius.circular(8),
              ),
              child: file != null
                  ? Image.file(file, fit: BoxFit.cover)
                  : const Center(child: Icon(Icons.add_a_photo, size: 48, color: Colors.grey)),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _cnpController.dispose();
    _genderController.dispose();
    _addressController.dispose();
    _seriesController.dispose();
    _numberController.dispose();
    _issuedAtController.dispose();
    _expiresAtController.dispose();
    _ibanController.dispose();
    _pFullNameController.dispose();
    _pCnpController.dispose();
    _pGenderController.dispose();
    _pAddressController.dispose();
    _pSeriesController.dispose();
    _pNumberController.dispose();
    _pIssuedAtController.dispose();
    _pExpiresAtController.dispose();
    super.dispose();
  }
}
