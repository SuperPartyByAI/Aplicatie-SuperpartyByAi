/// Email validation and normalization utilities
/// 
/// Provides:
/// - Email normalization (trim + lowercase)
/// - Basic email validation (regex)
/// - Common domain typo detection (gamil.com -> gmail.com)
class EmailValidator {
  /// Common domain typos and their corrections
  static const Map<String, String> _domainTypos = {
    'gamil.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmail.con': 'gmail.com',
    'gmail.co': 'gmail.com',
    'hotnail.com': 'hotmail.com',
    'hotmial.com': 'hotmail.com',
    'hotmai.com': 'hotmail.com',
    'hotmail.con': 'hotmail.com',
    'yahoo.co': 'yahoo.com',
    'yaho.com': 'yahoo.com',
    'yahoo.con': 'yahoo.com',
    'outlok.com': 'outlook.com',
    'outlook.co': 'outlook.com',
    'outlook.con': 'outlook.com',
    'ymail.com': 'yahoo.com', // Not always a typo, but common
  };

  /// Normalizes email: trim whitespace and convert to lowercase
  static String normalize(String email) {
    return email.trim().toLowerCase();
  }

  /// Basic email validation regex
  /// Allows letters, numbers, dots, hyphens, underscores, plus signs, @
  /// Must have exactly one @ and valid domain
  static bool isValid(String email) {
    if (email.isEmpty) return false;
    
    // Basic regex: local@domain
    final emailRegex = RegExp(
      r'^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
    );
    
    if (!emailRegex.hasMatch(email)) return false;
    
    // Additional checks: no spaces, no consecutive dots
    if (email.contains(' ')) return false;
    if (email.contains('..')) return false;
    
    // Must have at least one character before @
    final parts = email.split('@');
    if (parts.length != 2) return false;
    if (parts[0].isEmpty || parts[1].isEmpty) return false;
    
    // Domain must have at least one dot (TLD)
    if (!parts[1].contains('.')) return false;
    
    return true;
  }

  /// Checks if email domain contains a common typo
  /// Returns the corrected domain if typo found, null otherwise
  static String? detectDomainTypo(String email) {
    final normalized = normalize(email);
    final parts = normalized.split('@');
    
    if (parts.length != 2) return null;
    
    final domain = parts[1];
    return _domainTypos[domain];
  }

  /// Gets suggested email if typo is detected
  /// Returns null if no typo found
  static String? getSuggestedEmail(String email) {
    final normalized = normalize(email);
    final correctedDomain = detectDomainTypo(normalized);
    
    if (correctedDomain == null) return null;
    
    final parts = normalized.split('@');
    if (parts.length != 2) return null;
    
    return '${parts[0]}@$correctedDomain';
  }

  /// Masks email for logging (e.g., "user@example.com" -> "u***@example.com")
  static String maskForLogging(String email) {
    if (email.isEmpty) return '<empty>';
    if (!email.contains('@')) return '***';
    
    final parts = email.split('@');
    if (parts.length != 2) return '***';
    
    final local = parts[0];
    final domain = parts[1];
    
    if (local.isEmpty) return '***@$domain';
    if (local.length <= 2) {
      return '${local[0]}**@$domain';
    }
    
    return '${local[0]}${'*' * (local.length - 1)}@$domain';
  }
}