import 'package:url_launcher/url_launcher.dart';

class WhatsAppService {
  // Numărul de telefon din Baileys
  static const String _defaultPhoneNumber = '40737571397';
  
  /// Deschide conversația WhatsApp cu numărul specificat
  /// 
  /// [phoneNumber] - Numărul de telefon în format internațional (ex: 40123456789)
  /// [message] - Mesaj pre-populat opțional
  static Future<bool> openWhatsAppChat({
    String? phoneNumber,
    String? message,
  }) async {
    final phone = phoneNumber ?? _defaultPhoneNumber;
    
    // Construiește URL-ul WhatsApp
    final String whatsappUrl = _buildWhatsAppUrl(phone, message);
    
    try {
      final Uri uri = Uri.parse(whatsappUrl);
      
      if (await canLaunchUrl(uri)) {
        return await launchUrl(
          uri,
          mode: LaunchMode.externalApplication,
        );
      } else {
        return false;
      }
    } catch (e) {
      return false;
    }
  }
  
  /// Construiește URL-ul WhatsApp cu parametrii specificați
  static String _buildWhatsAppUrl(String phoneNumber, String? message) {
    // Curăță numărul de telefon (elimină spații, +, -)
    final cleanPhone = phoneNumber.replaceAll(RegExp(r'[^\d]'), '');
    
    // Construiește URL-ul de bază
    String url = 'https://wa.me/$cleanPhone';
    
    // Adaugă mesajul dacă există
    if (message != null && message.isNotEmpty) {
      final encodedMessage = Uri.encodeComponent(message);
      url += '?text=$encodedMessage';
    }
    
    return url;
  }
  
  /// Verifică dacă WhatsApp este instalat pe dispozitiv
  static Future<bool> isWhatsAppInstalled() async {
    try {
      final Uri uri = Uri.parse('whatsapp://send');
      return await canLaunchUrl(uri);
    } catch (e) {
      return false;
    }
  }
}
