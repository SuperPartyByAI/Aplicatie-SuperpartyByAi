// APP_RULES definitions for all document types

const APP_RULES = {
  CI: `RULE_CI_1: Documentul trebuie să fie Carte de Identitate românească (format card)
RULE_CI_2: Textul trebuie să fie lizibil (nume, prenume, CNP, serie CI, data nașterii)
RULE_CI_3: Fotografia posesorului trebuie să fie clară și vizibilă
RULE_CI_4: Nu sunt permise documente expirate (verifică data expirării dacă e vizibilă)
RULE_CI_5: Nu sunt permise copii, screenshot-uri sau poze de pe ecran
RULE_CI_6: Documentul trebuie să fie fotografiat direct, nu prin sticlă sau folie
RULE_CI_7: Unghiul fotografiei trebuie să fie perpendicular (nu oblic extrem)
RULE_CI_8: Lumina trebuie să fie uniformă (fără reflexii puternice sau umbre)`,

  permis: `RULE_PERMIS_1: Documentul trebuie să fie Permis de Conducere românesc
RULE_PERMIS_2: Categoriile de permis trebuie să fie vizibile și lizibile
RULE_PERMIS_3: Data expirării trebuie să fie lizibilă
RULE_PERMIS_4: Nu sunt permise permise expirate
RULE_PERMIS_5: Fotografia posesorului trebuie să fie clară
RULE_PERMIS_6: Seria și numărul permisului trebuie să fie lizibile
RULE_PERMIS_7: Nu sunt permise copii sau screenshot-uri
RULE_PERMIS_8: Documentul trebuie fotografiat direct, fără reflexii puternice`,

  cazier: `RULE_CAZIER_1: Documentul trebuie să fie Cazier Judiciar oficial
RULE_CAZIER_2: Trebuie să conțină ștampila instituției emitente (vizibilă și clară)
RULE_CAZIER_3: Data emiterii trebuie să fie vizibilă și lizibilă
RULE_CAZIER_4: Nu sunt permise documente mai vechi de 6 luni
RULE_CAZIER_5: Textul trebuie să fie complet lizibil (toate secțiunile)
RULE_CAZIER_6: Numele persoanei trebuie să fie clar vizibil
RULE_CAZIER_7: Nu sunt permise copii neoficiale sau screenshot-uri
RULE_CAZIER_8: Documentul trebuie să fie complet (toate paginile dacă e multipagină)`,

  eveniment: `RULE_EVENT_1: Poza trebuie să fie relevantă pentru eveniment (setup, desfășurare, sau final)
RULE_EVENT_2: Calitatea imaginii trebuie să fie bună (focus clar, lumină adecvată)
RULE_EVENT_3: Conținutul trebuie să fie profesional (fără elemente inadecvate)
RULE_EVENT_4: Dacă e poză before/after, trebuie să fie clar ce reprezintă
RULE_EVENT_5: Dacă conține persoane, acestea trebuie să fie în context profesional
RULE_EVENT_6: Nu sunt permise poze irelevante sau personale
RULE_EVENT_7: Poza trebuie să demonstreze munca efectuată
RULE_EVENT_8: Calitatea trebuie să permită evaluarea corectă a muncii`,

  raport: `RULE_RAPORT_1: Documentul trebuie să fie raport oficial sau formular completat
RULE_RAPORT_2: Toate câmpurile obligatorii trebuie să fie completate
RULE_RAPORT_3: Textul trebuie să fie lizibil (scris de mână sau tipărit)
RULE_RAPORT_4: Data și ora trebuie să fie vizibile
RULE_RAPORT_5: Semnătura (dacă e necesară) trebuie să fie prezentă
RULE_RAPORT_6: Nu sunt permise rapoarte incomplete
RULE_RAPORT_7: Documentul trebuie să fie fotografiat complet (toate paginile)
RULE_RAPORT_8: Calitatea imaginii trebuie să permită citirea tuturor informațiilor`,

  factura: `RULE_FACTURA_1: Documentul trebuie să fie factură oficială sau bon fiscal
RULE_FACTURA_2: Suma totală trebuie să fie clară și lizibilă
RULE_FACTURA_3: Data emiterii trebuie să fie vizibilă
RULE_FACTURA_4: Numele furnizorului trebuie să fie clar
RULE_FACTURA_5: Produsele/serviciile trebuie să fie listate
RULE_FACTURA_6: Nu sunt permise facturi deteriorate sau incomplete
RULE_FACTURA_7: Documentul trebuie să fie fotografiat complet
RULE_FACTURA_8: Calitatea trebuie să permită verificarea tuturor detaliilor`,

  unknown: `RULE_UNKNOWN_1: Imaginea trebuie să fie clară și focusată
RULE_UNKNOWN_2: Conținutul trebuie să fie relevant pentru context
RULE_UNKNOWN_3: Nu sunt permise imagini irelevante sau personale
RULE_UNKNOWN_4: Calitatea trebuie să permită identificarea obiectelor
RULE_UNKNOWN_5: Lumina trebuie să fie adecvată (fără întuneric excesiv)
RULE_UNKNOWN_6: Nu sunt permise imagini obscene sau inadecvate
RULE_UNKNOWN_7: Imaginea trebuie să fie completă (nu trunchiată)
RULE_UNKNOWN_8: Conținutul trebuie să fie profesional`
};

function getAppRules(documentType) {
  const type = documentType || 'unknown';
  return APP_RULES[type] || APP_RULES.unknown;
}

module.exports = { APP_RULES, getAppRules };
