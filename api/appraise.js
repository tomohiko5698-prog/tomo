export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { image_b64, cond_label, rk_user, rk_pass } = req.body;
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが未設定です' });
  try {
    const prompt = `ブランド品査定の専門家として画像を分析してください。コンディション:${cond_label}\n必ず以下のJSON形式のみで返答（説明文不要）:\n{"brand":"ブランド名","model":"モデル名","confidence":"high","basePriceA":100000,"features":["特徴1","特徴2","特徴3"],"history":[{"site":"rk","date":"2025年2月","price":95000,"cond":"A"},{"site":"eco","date":"2025年1月","price":88000,"cond":"B"},{"site":"star","date":"2025年2月","price":102000,"cond":"A"},{"site":"komehyo","date":"2025年1月","price":98000,"cond":"S"}],"notes":"コメント"}`;
    const cr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 1024, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image_b64 } }, { type: 'text', text: prompt }] }] })
    });
    const cd = await cr.json();
    if (cd.error) throw new Error(cd.error.message);
    const text = cd.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]+\}/);
    if (!m) throw new Error('JSON解析失敗');
    const ai = JSON.parse(m[0]);
    let rk = null;
    if (rk_user && rk_pass) {
      try {
        const base = 'https://soubakensaku.com';
        const lr = await fetch(`${base}/search/data.php`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ c: 'sp_login', login_id: rk_user, login_pass: rk_pass, login_btn: 'ログイン' }) });
        const lh = await lr.text();
        const ck = lr.headers.get('set-cookie') || '';
        if (lh.includes('ログアウト')) {
          const sr = await fetch(`${base}/search/data.php`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck }, body: new URLSearchParams({ c: 'sp_search', search_word: `${ai.brand} ${ai.model}`, search_btn: '検索' }) });
          const sh = await sr.text();
          const prices = [...sh.matchAll(/(\d{1,3}(?:,\d{3})+)\s*円/g)].map(m => parseInt(m[1].replace(/,/g,''))).filter(p => p > 1000 && p < 1e8);
          const u = [...new Set(prices)];
          if (u.length) rk = { count: u.length, avg: Math.round(u.reduce((a,b)=>a+b,0)/u.length), min: Math.min(...u), max: Math.max(...u) };
        }
      } catch {}
    }
    res.status(200).json({ ai, rk });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
