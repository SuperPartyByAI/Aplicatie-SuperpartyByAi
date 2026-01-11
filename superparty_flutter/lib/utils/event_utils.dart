/// Determină dacă un eveniment necesită șofer bazat pe tipul evenimentului și tipul locației.
///
/// Regula: Evenimente în locații exterioare necesită șofer.
/// Excepții: Evenimente online/virtuale nu necesită șofer indiferent de locație.
bool requiresSofer({
  required String tipEveniment,
  required String tipLocatie,
}) {
  // Evenimente care nu necesită șofer indiferent de locație
  final evenimenteFaraSofer = {
    'Online',
    'Virtual',
    'Webinar',
  };

  if (evenimenteFaraSofer.contains(tipEveniment)) {
    return false;
  }

  // Locații care necesită șofer
  final locatiiCuSofer = {
    'Exterior',
    'Casa',
    'Vila',
    'Gradina',
    'Parc',
    'Plaja',
    'Munte',
  };

  return locatiiCuSofer.contains(tipLocatie);
}
