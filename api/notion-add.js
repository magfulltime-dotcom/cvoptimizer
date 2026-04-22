export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pageId, ofertas } = req.body;
  const token = process.env.NOTION_TOKEN;

  if (!token) return res.status(400).json({ error: 'NOTION_TOKEN not set' });
  if (!pageId || !ofertas) return res.status(400).json({ error: 'Missing fields' });

  try {
    // Build all blocks for all offers at once
    const blocks = [];

    // Add week header
    const now = new Date();
    const weekLabel = `Semana del ${now.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    blocks.push({
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: weekLabel } }] }
    });

    blocks.push({
      object: 'block', type: 'divider', divider: {}
    });

    ofertas.forEach((o, i) => {
      const num = String(i + 1).padStart(2, '0');

      // Title
      blocks.push({
        object: 'block', type: 'heading_3',
        heading_3: { rich_text: [{ type: 'text', text: { content: `${num}. ${o.titulo}` } }] }
      });

      // Details
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: `Entry: ${o.entry}` } }] }
      });
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: `Inglés: ${o.ingles}` } }] }
      });
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: `Para quién: ${o.para_quien}` } }] }
      });

      // Postular link
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: 'Postular →', link: { url: o.link } },
            annotations: { bold: true, color: 'orange' }
          }]
        }
      });

      // Spacer
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: '' } }] }
      });
    });

    // Append all blocks to the page at once
    const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({ children: blocks })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.message || 'Notion error' });
    }

    return res.status(200).json({ success: true });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
