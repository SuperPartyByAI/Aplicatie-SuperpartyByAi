import { compressImage } from './imageCompression';

/**
 * Extrage date din CI folosind GPT-4o-mini (optimizat cost)
 * @param {string} apiKey - OpenAI API Key
 * @param {File} idFrontFile - Fișier CI față
 * @param {File} idBackFile - Fișier CI verso
 * @returns {Promise<Object>} - Obiect cu datele extrase
 */
export async function extractIdData(apiKey, idFrontFile, idBackFile) {
  if (!apiKey) {
    throw new Error('API Key lipsește. Introdu-l în câmpul de sus.');
  }

  // Comprimă imaginile la 3MP
  const idFrontBase64 = await compressImage(idFrontFile);
  const idBackBase64 = await compressImage(idBackFile);

  return await extractWithOpenAI(apiKey, idFrontBase64, idBackBase64);
}

/**
 * Extrage date folosind OpenAI GPT-4o-mini
 */
async function extractWithOpenAI(openaiApiKey, idFrontBase64, idBackBase64) {

  const prompt = `Analizează aceste imagini ale unui buletin de identitate românesc (CI).

IMPORTANT: Răspunde DOAR cu un obiect JSON valid, fără text suplimentar, fără markdown, fără \`\`\`json.

Extrage următoarele date:
- fullName: Nume complet (ex: "POPESCU ION MARIAN")
- cnp: CNP (13 cifre)
- gender: Sex (M sau F)
- address: Adresa completă
- series: Seria CI (ex: "RX")
- number: Numărul CI (6 cifre)
- issuedAt: Data emiterii (format: YYYY-MM-DD)
- expiresAt: Data expirării (format: YYYY-MM-DD)

Dacă un câmp nu poate fi citit, pune string gol "".

Exemplu format răspuns:
{"fullName":"POPESCU ION","cnp":"1234567890123","gender":"M","address":"Str. Exemplu nr. 1, București","series":"RX","number":"123456","issuedAt":"2020-01-15","expiresAt":"2030-01-15"}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: idFrontBase64,
                detail: 'low',
              },
            },
            {
              type: 'image_url',
              image_url: {
                url: idBackBase64,
                detail: 'low',
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.1,
    }),
  });

  return await parseResponse(response);
}

/**
 * Parsează răspunsul de la API (comun pentru Groq și OpenAI)
 */
async function parseResponse(response) {

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `API Error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('GPT nu a returnat niciun răspuns.');
  }

  // Încearcă să parseze JSON-ul
  try {
    // Curăță răspunsul de markdown sau text extra
    let jsonStr = content;

    // Elimină markdown code blocks dacă există
    jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    // Găsește primul { și ultimul }
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    const extracted = JSON.parse(jsonStr);

    // Validează că avem câmpurile necesare
    const requiredFields = [
      'fullName',
      'cnp',
      'gender',
      'address',
      'series',
      'number',
      'issuedAt',
      'expiresAt',
    ];
    const result = {};

    for (const field of requiredFields) {
      result[field] = extracted[field] || '';
    }

    return result;
  } catch (parseError) {
    console.error('Parse error:', parseError);
    console.error('GPT response:', content);
    throw new Error(
      `Nu am putut parsa răspunsul GPT. Răspuns primit: ${content.substring(0, 200)}...`
    );
  }
}
