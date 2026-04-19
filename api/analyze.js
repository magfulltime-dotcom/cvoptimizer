let cachedToken = null;
let tokenExpiry = 0;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, systemPrompt, userId, module } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  if (!userId) return res.status(401).json({ error: 'Debes iniciar sesion para usar esta funcion.' });

  const projectId = 'cvoptimizer-4663d';
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  try {
    const token = await getFirestoreToken();

    const userRes = await fetch(`${firestoreBase}/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    let usageAnalisis = 0;
    let usageAdaptar = 0;
    let isPremium = false;

    if (userRes.ok) {
      const userDoc = await userRes.json();
      const fields = userDoc.fields || {};
      usageAnalisis = Number(fields.usageAnalisis?.integerValue || 0);
      usageAdaptar = Number(fields.usageAdaptar?.integerValue || 0);
      isPremium = fields.isPremium?.booleanValue === true;
    }

    if (!isPremium) {
      if (module === 'analisis' && usageAnalisis >= 1) {
        return res.status(403).json({ error: 'freemium_limit', module: 'analisis' });
      }
      if (module === 'adaptar' && usageAdaptar >= 3) {
        return res.status(403).json({ error: 'freemium_limit', module: 'adaptar' });
      }
    }

    const tightSystem = (systemPrompt || '') + `\n\nREGLA CRITICA: Responde UNICAMENTE con JSON valido. Sin texto antes ni despues. Sin saltos de linea dentro de strings. Sin comillas dobles dentro de valores de string. Todos los strings en una sola linea.`;

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
        system: tightSystem,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json();
      return res.status(anthropicRes.status).json({ error: err.error?.message || 'API error' });
    }

    const aiData = await anthropicRes.json();
    let text = aiData.content[0].text;

    // Clean up response
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
      try {
        JSON.parse(text);
      } catch(e) {
        text = text
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
          .replace(/,\s*\}/g, '}')
          .replace(/,\s*\]/g, ']');
      }
    }

    const newAnalisis = module === 'analisis' ? usageAnalisis + 1 : usageAnalisis;
    const newAdaptar = module === 'adaptar' ? usageAdaptar + 1 : usageAdaptar;

    await fetch(`${firestoreBase}/users/${userId}?updateMask.fieldPaths=usageAnalisis&updateMask.fieldPaths=usageAdaptar&updateMask.fieldPaths=isPremium&updateMask.fieldPaths=lastSeen`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        fields: {
          usageAnalisis: { integerValue: String(newAnalisis) },
          usageAdaptar: { integerValue: String(newAdaptar) },
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
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry - 60) return cachedToken;

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  };

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const body = btoa(JSON.stringify(payload)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const unsigned = `${header}.${body}`;

  const privateKey = serviceAccount.private_key;
  const keyData = privateKey.replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\n/g,'');
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const jwt = `${unsigned}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenRes.json();
  cachedToken = tokenData.access_token;
  tokenExpiry = now + 3600;
  return cachedToken;
}
