const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const buildObjectGatekeeperPrompt = require('./objectGatekeeperPrompt');
const { getAppRules } = require('./appRules');

admin.initializeApp();

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

// Backend API (WhatsApp + Voice AI)
const backendApp = require('./backend');
exports.api = onRequest({
  timeoutSeconds: 540, // Max 9 minute (pentru WhatsApp connection)
  memory: '2GiB', // Crește pentru puppeteer/baileys
  maxInstances: 10,
  cors: true,
  cpu: 2 // Mai mult CPU pentru build
}, backendApp);

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const MAX_REQUESTS_PER_MINUTE = 10;

function checkRateLimit(userId) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(userId) || [];
  
  const recentRequests = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(userId, recentRequests);
  
  if (rateLimitMap.size > 10000) {
    const oldestKey = rateLimitMap.keys().next().value;
    rateLimitMap.delete(oldestKey);
  }
  
  return true;
}

exports.chatWithAI = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 60,
    memory: '256MiB',
    maxInstances: 10,
    cors: true,
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!checkRateLimit(auth.uid)) {
      throw new HttpsError(
        'resource-exhausted',
        'Rate limit exceeded. Maximum 10 requests per minute.'
      );
    }

    const { messages, userContext } = data;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError('invalid-argument', 'Messages array is required');
    }

    if (messages.length > 20) {
      throw new HttpsError('invalid-argument', 'Too many messages in history');
    }

    const apiKey = OPENAI_API_KEY.value();
    if (!apiKey) {
      console.error('OPENAI_API_KEY secret not configured');
      throw new HttpsError('failed-precondition', 'AI service not configured');
    }

    try {
      const systemPrompt = buildSystemPrompt(userContext);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.slice(-8),
          ],
          max_tokens: 300,
          temperature: 0.5,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        
        if (response.status === 401) {
          throw new HttpsError('failed-precondition', 'Invalid API key');
        } else if (response.status === 429) {
          throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Try again later.');
        } else if (response.status >= 500) {
          throw new HttpsError('unavailable', 'AI service temporarily unavailable');
        }
        
        throw new HttpsError('internal', `API error: ${response.status}`);
      }

      const responseData = await response.json();
      const aiResponse = responseData.choices?.[0]?.message?.content;

      if (!aiResponse) {
        throw new HttpsError('internal', 'No response from AI');
      }

      await admin.firestore().collection('aiConversations').add({
        userId: auth.uid,
        userEmail: auth.token.email || 'unknown',
        userName: userContext?.user?.nume || 'Unknown',
        userMessage: messages[messages.length - 1]?.content || '',
        aiResponse: aiResponse,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        model: 'gpt-4o-mini',
        context: {
          isAdmin: userContext?.isAdmin || false,
          stats: userContext?.stats || null
        }
      });

      return {
        success: true,
        message: aiResponse,
      };

    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      if (error.name === 'AbortError') {
        console.error('Request timeout');
        throw new HttpsError('deadline-exceeded', 'Request timeout');
      }

      console.error('Unexpected error in chatWithAI:', error);
      throw new HttpsError('internal', 'An unexpected error occurred');
    }
  }
);

function buildSystemPrompt(context) {
  if (!context) {
    return 'Ești asistentul AI pentru aplicația SuperParty - o platformă de management evenimente și staff. Răspunde concis, prietenos și în limba română.';
  }

  const { user, stats, evenimenteUser, isAdmin } = context;

  let prompt = `Ești asistentul AI pentru aplicația SuperParty - o platformă de management evenimente și staff.\n\n`;

  if (user) {
    prompt += `Context utilizator:\n`;
    prompt += `- Nume: ${user.nume || 'Necunoscut'}\n`;
    prompt += `- Email: ${user.email || 'N/A'}\n`;
    prompt += `- Cod: ${user.code || 'N/A'}\n`;
    prompt += `- Este admin: ${isAdmin ? 'Da' : 'Nu'}\n\n`;
  }

  if (stats) {
    prompt += `Statistici aplicație:\n`;
    prompt += `- Evenimente total: ${stats.evenimenteTotal || 0}\n`;
    prompt += `- Evenimente astăzi: ${stats.evenimenteAstazi || 0}\n`;
    prompt += `- Staff activ: ${stats.staffTotal || 0}\n`;
    if (isAdmin && stats.kycPending !== undefined) {
      prompt += `- KYC pending: ${stats.kycPending}\n`;
    }
    prompt += '\n';
  }

  if (evenimenteUser && evenimenteUser.length > 0) {
    prompt += `Evenimente utilizator:\n`;
    evenimenteUser.forEach(ev => {
      prompt += `- ${ev.nume} (${ev.data}, ${ev.locatie}, ${ev.rol})\n`;
    });
    prompt += '\n';
  }

  prompt += `REGULI RĂSPUNS:\n`;
  prompt += `- Maxim 6-10 propoziții (concis!)\n`;
  prompt += `- Limba română, ton prietenos\n`;
  prompt += `- Răspuns direct la întrebare\n`;
  prompt += `- Închei cu: "Următorul pas:" + acțiune clară\n`;
  prompt += `- NU inventa detalii - dacă nu știi, spune clar\n`;

  return prompt;
}

exports.extractKYCData = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 120,
    memory: '512MiB',
    maxInstances: 5,
    cors: true,
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { imageUrl } = data;

    if (!imageUrl) {
      throw new HttpsError('invalid-argument', 'Image URL is required');
    }

    const apiKey = OPENAI_API_KEY.value();
    if (!apiKey) {
      console.error('OPENAI_API_KEY secret not configured');
      throw new HttpsError('failed-precondition', 'AI service not configured');
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extrage următoarele informații din această carte de identitate românească și returnează-le în format JSON strict (fără markdown, fără ```json): {"fullName": "...", "cnp": "...", "series": "...", "number": "...", "issuedBy": "...", "issuedDate": "...", "expiryDate": "...", "address": "..."}. Dacă un câmp nu este vizibil, pune null.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        
        if (response.status === 401) {
          throw new HttpsError('failed-precondition', 'Invalid API key');
        } else if (response.status === 429) {
          throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Try again later.');
        } else if (response.status >= 500) {
          throw new HttpsError('unavailable', 'AI service temporarily unavailable');
        }
        
        throw new HttpsError('internal', `API error: ${response.status}`);
      }

      const responseData = await response.json();
      const aiResponse = responseData.choices?.[0]?.message?.content;

      if (!aiResponse) {
        throw new HttpsError('internal', 'No response from AI');
      }

      let extractedData;
      try {
        extractedData = JSON.parse(aiResponse.trim());
      } catch (parseError) {
        console.error('Failed to parse AI response:', aiResponse);
        throw new HttpsError('internal', 'Failed to parse extracted data');
      }

      return {
        success: true,
        data: extractedData,
      };

    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      if (error.name === 'AbortError') {
        console.error('Request timeout');
        throw new HttpsError('deadline-exceeded', 'Request timeout');
      }

      console.error('Unexpected error in extractKYCData:', error);
      throw new HttpsError('internal', 'An unexpected error occurred');
    }
  }
);

// AI Manager - Central control for entire application
exports.aiManager = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 120,
    memory: '512MiB',
    maxInstances: 10,
    cors: true,
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!checkRateLimit(auth.uid)) {
      throw new HttpsError('resource-exhausted', 'Rate limit exceeded');
    }

    const { 
      message, 
      imageUrls, 
      meta, 
      appRules, 
      documentType, 
      userContext,
      action // 'chat' | 'validate_image' | 'check_performance'
    } = data;

    try {
      switch (action) {
        case 'validate_image':
          return await validateImageWithGatekeeper(imageUrls, meta, appRules, documentType, auth.uid);
        
        case 'check_performance':
          return await checkUserPerformance(auth.uid, userContext);
        
        case 'chat':
        default:
          return await handleChatMessage(message, userContext, auth.uid);
      }
    } catch (error) {
      console.error('AI Manager error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'An unexpected error occurred');
    }
  }
);

// Validate image with Object Gatekeeper logic
async function validateImageWithGatekeeper(imageUrls, meta, appRulesParam, documentType, userId) {
  const startTime = Date.now();
  const apiKey = OPENAI_API_KEY.value();
  
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'AI service not configured');
  }
  
  // Get APP_RULES for document type (if not provided)
  const appRules = appRulesParam || getAppRules(documentType);
  
  // Build Object Gatekeeper prompt
  const systemPrompt = buildObjectGatekeeperPrompt();
  
  // Build user message with META + APP_RULES + images
  const userMessage = `
${meta}

APP_RULES:
${appRules}
END_APP_RULES

Validează ${documentType === 'unknown' ? 'documentul' : documentType} din imaginile atașate.
  `.trim();
  
  // Prepare messages for OpenAI Vision API
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userMessage },
        ...imageUrls.map(url => ({
          type: 'image_url',
          image_url: { url, detail: 'high' }
        }))
      ]
    }
  ];
  
  // Call OpenAI Vision API
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        max_tokens: 2000,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new HttpsError('unavailable', `OpenAI API error: ${response.status}`);
    }
    
    const result = await response.json();
    const aiResponse = result.choices[0].message.content;
    
    // Parse JSON response
    const jsonMatch = aiResponse.match(/BEGIN_ROUTE_JSON\s*(\{.*?\})\s*END_ROUTE_JSON/s);
    const answerMatch = aiResponse.match(/BEGIN_ANSWER\s*(.*?)\s*END_ANSWER/s);
    
    if (!jsonMatch) {
      console.error('Invalid AI response format:', aiResponse);
      throw new HttpsError('internal', 'Invalid AI response format');
    }
    
    const validationResult = JSON.parse(jsonMatch[1]);
    const answerText = answerMatch ? answerMatch[1].trim() : '';
    
    // Save validation to Firestore
    await admin.firestore().collection('imageValidations').add({
      userId,
      imageUrls,
      documentType,
      ...validationResult,
      answerText,
      validatedAt: admin.firestore.FieldValue.serverTimestamp(),
      validationTimeMs: Date.now() - startTime
    });
    
    // Log action
    await logAIAction('image_validation', userId, {
      documentType,
      imageCount: imageUrls.length,
      decision: validationResult.overall_decision
    }, validationResult);
    
    return {
      success: true,
      validation: validationResult,
      message: answerText
    };
    
  } catch (error) {
    clearTimeout(timeout);
    
    if (error.name === 'AbortError') {
      throw new HttpsError('deadline-exceeded', 'Request timeout');
    }
    
    throw error;
  }
}

// Object Gatekeeper prompt is imported from separate file

// Handle regular chat messages
async function handleChatMessage(message, userContext, userId) {
  // Reuse existing chatWithAI logic
  const apiKey = OPENAI_API_KEY.value();
  
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'AI service not configured');
  }
  
  const systemPrompt = buildSystemPrompt(userContext);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 300,
      temperature: 0.5,
    }),
  });
  
  if (!response.ok) {
    throw new HttpsError('unavailable', 'OpenAI API error');
  }
  
  const result = await response.json();
  
  return {
    success: true,
    message: result.choices[0].message.content
  };
}

// Check user performance
async function checkUserPerformance(userId, userContext) {
  const today = new Date().toISOString().split('T')[0];
  
  const perfDoc = await admin.firestore()
    .collection('performanceMetrics')
    .doc(`${userId}_${today}`)
    .get();
  
  if (!perfDoc.exists) {
    return {
      success: true,
      message: 'Nu am date de performanță pentru astăzi.',
      performance: null
    };
  }
  
  const perf = perfDoc.data();
  
  return {
    success: true,
    performance: perf,
    message: formatPerformanceMessage(perf)
  };
}

// Format performance message
function formatPerformanceMessage(perf) {
  const scoreEmoji = perf.overallScore >= 90 ? '🟢' : 
                     perf.overallScore >= 70 ? '🟡' : 
                     perf.overallScore >= 50 ? '🟠' : '🔴';
  
  const trendEmoji = perf.trend === 'up' ? '📈' : 
                     perf.trend === 'down' ? '📉' : '➡️';
  
  return `${scoreEmoji} Performance Score: ${perf.overallScore}/100

📊 Detalii:
• Task-uri: ${perf.tasksCompleted}/${perf.tasksAssigned} (${perf.completionRate}%)
• Calitate: ${perf.qualityScore}/100
• Punctualitate: ${perf.punctualityScore}/100
• Conformitate: ${perf.complianceScore}/100

${trendEmoji} Trend: ${perf.trend} (${perf.trendPercentage > 0 ? '+' : ''}${perf.trendPercentage}%)

${perf.tasksOverdue > 0 ? `⚠️ Ai ${perf.tasksOverdue} task-uri în întârziere!` : '✅ Toate task-urile la zi!'}`;
}

// Log AI action
async function logAIAction(action, userId, input, output) {
  try {
    await admin.firestore().collection('aiManagerLogs').add({
      action,
      userId,
      input,
      output,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      success: true
    });
  } catch (error) {
    console.error('Error logging AI action:', error);
  }
}

// Scheduled function: Monitor performance every 5 minutes
exports.monitorPerformance = onSchedule({
  schedule: 'every 5 minutes',
  timeoutSeconds: 300,
  memory: '512MiB'
}, async (event) => {
  console.log('Starting performance monitoring...');
  
  try {
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('status', '==', 'approved')
      .get();
    
    const users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    
    for (const user of users) {
      await checkAndUpdatePerformance(user);
    }
    
    console.log(`Performance check completed for ${users.length} users`);
  } catch (error) {
    console.error('Performance monitoring error:', error);
  }
});

// Check and update performance for a user
async function checkAndUpdatePerformance(user) {
  const today = new Date().toISOString().split('T')[0];
  const userId = user.uid;
  
  try {
    // Fetch user's tasks and activities
    const [evenimenteAlocate, imageValidations] = await Promise.all([
      admin.firestore()
        .collection('evenimenteAlocate')
        .where('staffId', '==', userId)
        .get(),
      admin.firestore()
        .collection('imageValidations')
        .where('userId', '==', userId)
        .where('validatedAt', '>=', new Date(today))
        .get()
    ]);
    
    const tasks = evenimenteAlocate.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const documents = imageValidations.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calculate metrics
    const metrics = calculatePerformanceMetrics(tasks, documents);
    
    // Save to Firestore
    await admin.firestore()
      .collection('performanceMetrics')
      .doc(`${userId}_${today}`)
      .set(metrics, { merge: true });
    
    // Check for alerts
    const alerts = generateAlerts(metrics, user);
    
    if (alerts.length > 0) {
      for (const alert of alerts) {
        await admin.firestore().collection('performanceAlerts').add({
          userId,
          ...alert,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'active'
        });
      }
    }
    
    await logAIAction('performance_check', userId, { date: today }, metrics);
  } catch (error) {
    console.error(`Error checking performance for user ${userId}:`, error);
  }
}

// Calculate performance metrics
function calculatePerformanceMetrics(tasks, documents) {
  const tasksAssigned = tasks.length;
  const tasksCompleted = tasks.filter(t => t.status === 'completed').length;
  const tasksOverdue = tasks.filter(t => {
    if (t.status === 'completed') return false;
    const deadline = t.eventDate || t.deadline;
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  }).length;
  
  const completionRate = tasksAssigned > 0 ? (tasksCompleted / tasksAssigned) * 100 : 0;
  
  const documentsSubmitted = documents.length;
  const documentsAccepted = documents.filter(d => d.overall_decision === 'ACCEPT').length;
  const documentAcceptanceRate = documentsSubmitted > 0 
    ? (documentsAccepted / documentsSubmitted) * 100 
    : 100;
  
  const productivityScore = Math.min(100, completionRate);
  const qualityScore = Math.min(100, documentAcceptanceRate);
  const punctualityScore = Math.max(0, 100 - (tasksOverdue * 10));
  const complianceScore = documentAcceptanceRate;
  
  const overallScore = (
    productivityScore * 0.3 +
    qualityScore * 0.3 +
    punctualityScore * 0.2 +
    complianceScore * 0.2
  );
  
  return {
    tasksAssigned,
    tasksCompleted,
    tasksOverdue,
    completionRate: Math.round(completionRate),
    documentsSubmitted,
    documentsAccepted,
    documentAcceptanceRate: Math.round(documentAcceptanceRate),
    productivityScore: Math.round(productivityScore),
    qualityScore: Math.round(qualityScore),
    punctualityScore: Math.round(punctualityScore),
    complianceScore: Math.round(complianceScore),
    overallScore: Math.round(overallScore),
    trend: 'stable',
    trendPercentage: 0,
    calculatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

// Generate alerts based on metrics
function generateAlerts(metrics, user) {
  const alerts = [];
  
  if (metrics.tasksOverdue > 3) {
    alerts.push({
      alertType: 'overdue_task',
      severity: 'critical',
      title: 'Task-uri critice în întârziere',
      message: `${user.firstName || user.email} ${user.lastName || ''} are ${metrics.tasksOverdue} task-uri în întârziere`,
      actionRequired: 'Contactează angajatul urgent'
    });
  }
  
  if (metrics.overallScore < 50) {
    alerts.push({
      alertType: 'low_performance',
      severity: 'high',
      title: 'Performanță scăzută',
      message: `Score: ${metrics.overallScore}/100`,
      actionRequired: 'Review performanță și discuție 1-on-1'
    });
  }
  
  if (metrics.documentAcceptanceRate < 70 && metrics.documentsSubmitted > 0) {
    alerts.push({
      alertType: 'quality_issue',
      severity: 'medium',
      title: 'Probleme calitate documente',
      message: `Doar ${metrics.documentAcceptanceRate}% documente acceptate`,
      actionRequired: 'Training pentru upload documente'
    });
  }
  
  return alerts;
}
