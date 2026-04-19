export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, systemPrompt, userId, module } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  // If no userId, block (must be logged in)
  if (!userId) return res.status(401).json({ error: 'Debés iniciar sesión para usar esta función.' });

  // Check usage limits via Firestore REST API
  const projectId = 'cvoptimizer-4663d';
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  try {
    // Get user doc
    const userDocUrl = `${firestoreBase}/users/${userId}`;
    const userRes = await fetch(userDocUrl, {
      headers: { 'Authorization': `Bearer ${await getFirestoreToken()}` }
    });

    let usageAnalisis = 0;
    let usageAdaptar = 0;
    let isPremium = false;

    if (userRes.ok) {
      const userDoc = await userRes.json();
      const fields = userDoc.fields || {};
      usageAnalisis = parseInt(fields.usageAnalisis?.integerValue || 0);
      usageAdaptar = parseInt(fields.usageAdaptar?.integerValue || 0);
      isPremium = fields.isPremium?.booleanValue || false;
    }

    // Check limits
    if (!isPremium) {
      if (module === 'analisis' && usageAnalisis >= 1) {
        return res.status(403).json({ 
          error: 'freemium_limit',
          message: 'Usaste tu análisis gratuito. Suscribite para análisis ilimitados.',
          module: 'analisis'
        });
      }
      if (module === 'adaptar' && usageAdaptar >= 3) {
        return res.status(403).json({ 
          error: 'freemium_limit',
          message: 'Usaste tus 3 adaptaciones gratuitas. Suscribite para adaptaciones ilimitadas.',
          module: 'adaptar'
        });
      }
    }

    // Call Anthropic
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json();
      return res.status(anthropicRes.status).json({ error: err.error?.message || 'API error' });
    }

    const data = await anthropicRes.json();
    const text = data.content[0].text;

    // Update usage count in Firestore
    const newAnalisis = module === 'analisis' ? usageAnalisis + 1 : usageAnalisis;
    const newAdaptar = module === 'adaptar' ? usageAdaptar + 1 : usageAdaptar;

    await fetch(`${firestoreBase}/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getFirestoreToken()}`
      },
      body: JSON.stringify({
        fields: {
          usageAnalisis: { integerValue: newAnalisis },
          usageAdaptar: { integerValue: newAdaptar },
          isPremium: { booleanValue: isPremium },
          lastSeen: { stringValue: new Date().toISOString() }
        }
      })
    });

    return res.status(200).json({ 
      text,
      usage: { analisis: newAnalisis, adaptar: newAdaptar, isPremium }
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function getFirestoreToken() {
  // Use service account key from env
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  };

  // Create JWT
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;

  // Sign with private key using Web Crypto
  const privateKey = serviceAccount.private_key;
  const keyData = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );

  const jwt = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}
