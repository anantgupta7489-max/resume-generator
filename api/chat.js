const SYSTEM = `You are a friendly, concise resume coach inside a resume builder.
You can see the user's current resume below. Help them write and improve it:
strong action verbs, measurable achievements, ATS-friendly wording, no fluff.
Never invent employers, degrees or numbers the user did not provide; if you need facts, ask.
Keep replies short (under 150 words) unless asked for more.

When you propose new text for a field, put a short explanation in your reply and then end with
a fenced block exactly like this, containing ONLY the fields you changed as JSON strings
(valid keys: title, summary, exp, edu, skills):
\`\`\`fields
{"summary": "new text here"}
\`\`\`
For "exp", put one entry per line; start bullet lines with "- ".
For "skills", use a comma-separated list.
If you are only answering a question, do not include the fields block.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const resume = body.resume || {};
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'No user message' });
    }

    const resumeText = JSON.stringify(resume).slice(0, 8000);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 1000,
        system: SYSTEM + '\n\nCurrent resume (JSON):\n' + resumeText,
        messages
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: (data.error && data.error.message) || 'Upstream error' });
    }
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};
